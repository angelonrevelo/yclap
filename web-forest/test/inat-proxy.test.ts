import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { identifyPlant, IDENTIFY_PATH } from "../src/inat.ts";
import { handleIdentify, SCORE_IMAGE_URL } from "../worker/inat.ts";

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
