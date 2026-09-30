import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { identifyPlant, IDENTIFY_PATH } from "../src/inat.ts";
import { handleIdentify, identifyKeyOf, PLANTNET_CREDIT, PLANTNET_URL, plantnetResult, SCORE_IMAGE_URL } from "../worker/inat.ts";

const dir = dirname(fileURLToPath(import.meta.url));
const photo = readFileSync(join(dir, "detect-smoke/photo/teak.jpg"));
const teak_body = (JSON.parse(readFileSync(join(dir, "detect-smoke/response/teak.json"), "utf8")) as { body: unknown }).body;
const expired = JSON.parse(readFileSync(join(dir, "fixture/score-image-401.json"), "utf8")) as { status: number; body: unknown };

function jsonResponse(status: number, body: unknown, header?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...header } });
}

function identifyRequest(): Request {
  const form = new FormData();
  form.append("image", new Blob([photo], { type: "image/jpeg" }), "teak.jpg");
  form.append("lat", "not-a-number");
  return new Request(`http://local${IDENTIFY_PATH}`, { method: "POST", body: form });
}

describe("handleIdentify (worker/inat.ts)", () => {
  it("503 needs_token when the server has no secret, without calling iNat", async () => {
    const res = await handleIdentify(identifyRequest(), undefined, async () => {
      throw new Error("must not call upstream");
    });
    assert.equal(res.status, 503);
    assert.equal(((await res.json()) as { error: string }).error, "needs_token");
  });

  it("forwards the image with the token and the campus lat/lng, and passes iNat's JSON through", async () => {
    let seen: { url: string; auth: string | null; lat: unknown; lng: unknown; has_image: boolean } | null = null;
    const res = await handleIdentify(identifyRequest(), "secret-jwt", async (url, init) => {
      const form = init?.body as FormData;
      seen = {
        url: String(url),
        auth: new Headers(init?.headers).get("Authorization"),
        lat: form.get("lat"),
        lng: form.get("lng"),
        has_image: form.get("image") instanceof Blob,
      };
      return jsonResponse(200, teak_body);
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("X-Inat-Via"), "proxy");
    assert.deepEqual(seen, { url: SCORE_IMAGE_URL, auth: "secret-jwt", lat: "14.6386", lng: "121.0785", has_image: true });
    assert.deepEqual(await res.json(), teak_body);
  });

  it("maps iNat's real 401 (expired token) to token_expired with the refresh URL", async () => {
    const res = await handleIdentify(identifyRequest(), "old-jwt", async () => jsonResponse(expired.status, expired.body));
    assert.equal(res.status, 401);
    const body = (await res.json()) as { error: string; token_url: string };
    assert.equal(body.error, "token_expired");
    assert.match(body.token_url, /inaturalist\.org\/users\/api_token/);
    assert.doesNotMatch(JSON.stringify(body), /old-jwt/);
  });

  it("429 rate_limited keeps Retry-After; a thrown upstream is 502", async () => {
    const limited = await handleIdentify(identifyRequest(), "jwt", async () => jsonResponse(429, {}, { "Retry-After": "30" }));
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("Retry-After"), "30");
    const down = await handleIdentify(identifyRequest(), "jwt", async () => {
      throw new Error("dns");
    });
    assert.equal(down.status, 502);
  });

  it("rejects GET and a form without an image", async () => {
    assert.equal((await handleIdentify(new Request("http://local/inat/identify"), "jwt")).status, 405);
    const form = new FormData();
    form.append("lat", "1");
    const res = await handleIdentify(new Request("http://local/inat/identify", { method: "POST", body: form }), "jwt");
    assert.equal(res.status, 400);
  });
});

describe("identifyPlant (src/inat.ts)", () => {
  it("prefers the proxy and never sends a token from the client", async () => {
    let saw_auth: string | null = "unset";
    const state = await identifyPlant({
      image: photo,
      fetch: async (url, init) => {
        assert.equal(String(url), IDENTIFY_PATH);
        saw_auth = new Headers(init?.headers).get("Authorization");
        return jsonResponse(200, teak_body);
      },
    });
    assert.equal(saw_auth, null);
    assert.equal(state.status, "ready");
    if (state.status !== "ready") return;
    assert.equal(state.via, "proxy");
    assert.equal(state.suggestion[0]?.scientific_name, "Tectona grandis");
    assert.ok(state.suggestion[0]!.ancestor_ids.length > 0);
  });

  it("surfaces the proxy's token_expired and rate_limited", async () => {
    const stale = await identifyPlant({ image: photo, fetch: async () => jsonResponse(401, { error: "token_expired" }) });
    assert.equal(stale.status, "token_expired");
    const slow = await identifyPlant({ image: photo, fetch: async () => jsonResponse(429, { error: "rate_limited" }) });
    assert.equal(slow.status, "rate_limited");
  });

  it("proxy without a secret and no client token → needs_token", async () => {
    const state = await identifyPlant({ image: photo, fetch: async () => jsonResponse(503, { error: "needs_token" }) });
    assert.equal(state.status, "needs_token");
  });

  it("no proxy (static host 404 page) + a token → falls back to the direct call", async () => {
    const hit: string[] = [];
    const state = await identifyPlant({
      image: photo,
      token: "dev-jwt",
      fetch: async (url) => {
        hit.push(String(url));
        if (String(url) === IDENTIFY_PATH) return new Response("<!doctype html>", { status: 404 });
        return jsonResponse(200, teak_body);
      },
    });
    assert.deepEqual(hit, [IDENTIFY_PATH, SCORE_IMAGE_URL]);
    assert.equal(state.status, "ready");
    if (state.status === "ready") assert.equal(state.via, "direct");
  });

  it("the direct call reads a 401 as token_expired too", async () => {
    const state = await identifyPlant({
      image: photo,
      token: "old-jwt",
      fetch: async (url) => {
        if (String(url) === IDENTIFY_PATH) throw new Error("no proxy");
        return jsonResponse(expired.status, expired.body);
      },
    });
    assert.equal(state.status, "token_expired");
  });
});

describe("the identify provider (10-01)", () => {
  const plantnet_reply = {
    bestMatch: "Tectona grandis L.f.",
    results: [
      { score: 0.82, species: { scientificNameWithoutAuthor: "Tectona grandis", commonNames: ["Teak"] } },
      { score: 0.05, species: { scientificNameWithoutAuthor: "Gmelina arborea", commonNames: [] } },
    ],
    remainingIdentificationRequests: 499,
  };

  it("asks Pl@ntNet when a key is set, and answers in the shape the phone reads, with the credit", async () => {
    let asked = "";
    const res = await handleIdentify(identifyRequest(), { plantnet: "pn-key" }, async (url) => {
      asked = String(url);
      return jsonResponse(200, plantnet_reply);
    });
    assert.ok(asked.startsWith(PLANTNET_URL) && asked.includes("api-key=pn-key"));
    const body = (await res.json()) as { provider: string; provider_credit: string; results: unknown[] };
    assert.equal(body.provider, "plantnet");
    assert.equal(body.provider_credit, PLANTNET_CREDIT);
    assert.deepEqual(body.results[0], { combined_score: 0.82, taxon: { name: "Tectona grandis", preferred_common_name: "Teak", rank: "species" } });
  });

  it("reads Pl@ntNet's 404 as no species found, not a failure", async () => {
    const res = await handleIdentify(identifyRequest(), { plantnet: "pn-key" }, async () => jsonResponse(404, { message: "Species not found" }));
    assert.equal(res.status, 200);
    assert.deepEqual(((await res.json()) as { results: unknown[] }).results, []);
  });

  it("never calls iNaturalist on a token alone — only with written permission", async () => {
    let called = 0;
    const upstream = async () => {
      called += 1;
      return jsonResponse(200, teak_body);
    };
    const refused = await handleIdentify(identifyRequest(), identifyKeyOf({ INAT_API_TOKEN: "jwt" }), upstream);
    assert.equal(refused.status, 503);
    assert.equal(called, 0, "no request reached iNaturalist");
    const allowed = await handleIdentify(identifyRequest(), identifyKeyOf({ INAT_API_TOKEN: "jwt", INAT_CV_PERMITTED: "1" }), upstream);
    assert.equal(allowed.status, 200);
    assert.equal(called, 1);
  });

  it("prefers Pl@ntNet over a permitted iNaturalist token", () => {
    const key = identifyKeyOf({ PLANTNET_API_KEY: "pn", INAT_API_TOKEN: "jwt", INAT_CV_PERMITTED: "1" });
    assert.equal(key.plantnet, "pn");
  });

  it("the phone names the service that answered", async () => {
    const state = await identifyPlant({
      image: photo,
      fetch: async () => jsonResponse(200, { results: plantnetResult(plantnet_reply), provider: "plantnet" }),
    } as Parameters<typeof identifyPlant>[0]);
    assert.equal(state.status, "ready");
    assert.equal(state.status === "ready" && state.provider, "plantnet");
  });
});
