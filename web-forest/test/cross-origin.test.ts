/**
 * Path A: the build on :4177 (VITE_SYNC_URL naming the sync server on :8788)
 * signs in, syncs its save and identifies on the sync server, cookie included.
 * The client routes through the campus world's base URL; the servers answer
 * that page — and only that page — with its own origin plus credentials.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { accountCorsOf, isAccountCorsPath, withCors } from "../src/rate-limit.ts";
import { credentialOf, syncRouteOf } from "../src/sync.ts";
import { identifyPlant } from "../src/inat.ts";
import worker from "../worker/sync.ts";

const PAGE = "http://192.168.1.5:4177";
const SYNC = "http://192.168.1.5:8788";

describe("syncRouteOf", () => {
  it("keeps the bare path on the page's own origin, or with no window", () => {
    assert.deepEqual(syncRouteOf("/auth/me", PAGE, PAGE), { url: "/auth/me", is_cross_origin: false });
    assert.deepEqual(syncRouteOf("/auth/me", null, null), { url: "/auth/me", is_cross_origin: false });
    assert.equal(credentialOf(syncRouteOf("/auth/me", PAGE, PAGE)), "same-origin");
  });

  it("sends a Path A build to the sync base, with credentials", () => {
    const route = syncRouteOf("/account/save", SYNC, PAGE);
    assert.deepEqual(route, { url: `${SYNC}/account/save`, is_cross_origin: true });
    assert.equal(credentialOf(route), "include");
    assert.equal(syncRouteOf("/inat/identify", SYNC, PAGE).url, `${SYNC}/inat/identify`);
  });
});

describe("accountCorsOf", () => {
  it("echoes an allowed page with credentials, never *, and answers nobody else", () => {
    const cors = accountCorsOf(PAGE, "192.168.1.5:8788");
    assert.equal(cors["Access-Control-Allow-Origin"], PAGE);
    assert.equal(cors["Access-Control-Allow-Credentials"], "true");
    assert.match(cors["Access-Control-Allow-Methods"]!, /PUT/);
    assert.deepEqual(accountCorsOf("https://evil.example", "192.168.1.5:8788"), {});
    assert.deepEqual(accountCorsOf(SYNC, "192.168.1.5:8788"), {}, "same origin needs none");
    const preview = accountCorsOf("https://preview.example", "magi.example", ["https://preview.example"]);
    assert.equal(preview["Access-Control-Allow-Credentials"], "true");
  });

  it("covers /auth/*, /account/* and /inat/identify, and not the world", () => {
    for (const path of ["/auth/me", "/auth/login", "/account/save", "/inat/identify"]) {
      assert.equal(isAccountCorsPath(path), true, path);
    }
    for (const path of ["/world", "/sync", "/live/pose", "/authx"]) assert.equal(isAccountCorsPath(path), false, path);
  });

  it("withCors copies a response whose headers are immutable", () => {
    const frozen = Response.redirect("http://x.example/", 302);
    const out = withCors(frozen, { Vary: "Origin" });
    assert.equal(out.status, 302);
    assert.equal(out.headers.get("Vary"), "Origin");
  });
});

describe("identifyPlant without a proxy", () => {
  const photo = new Uint8Array([1, 2, 3]);

  it("names a 404 as a missing server, not a missing token", async () => {
    const state = await identifyPlant({ image: photo, fetch: async () => new Response("<!doctype html>", { status: 404 }) });
    assert.deepEqual(state, { status: "no_proxy", http_status: 404 });
  });

  it("names an unreachable server as unreachable", async () => {
    const state = await identifyPlant({
      image: photo,
      fetch: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    assert.deepEqual(state, { status: "no_proxy", http_status: null });
  });
});

describe("the Worker answers a cross-origin page on the account and identify routes", () => {
  const env = {
    HALL_PAGE_ORIGIN: "https://preview.example",
    CAMPUS: {
      idFromName: () => "id",
      get: () => ({ fetch: async () => new Response(JSON.stringify({ account: null }), { status: 200 }) }),
    },
    ASSETS: { fetch: async () => new Response("asset") },
  } as unknown as Parameters<typeof worker.fetch>[1];

  it("preflight: its own origin + credentials for an allowed page, nothing for a foreign one", async () => {
    const pre = (origin: string) =>
      worker.fetch(new Request("https://magi.example/account/save", { method: "OPTIONS", headers: { Origin: origin } }), env);
    const ok = await pre("https://preview.example");
    assert.equal(ok.status, 204);
    assert.equal(ok.headers.get("Access-Control-Allow-Origin"), "https://preview.example");
    assert.equal(ok.headers.get("Access-Control-Allow-Credentials"), "true");
    const foreign = await pre("https://evil.example");
    assert.equal(foreign.headers.get("Access-Control-Allow-Origin"), null);
  });

  it("GET /auth/me carries the CORS headers through from the Durable Object", async () => {
    const res = await worker.fetch(
      new Request("https://magi.example/auth/me", { headers: { Origin: "https://preview.example" } }),
      env,
    );
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "https://preview.example");
    assert.equal(res.headers.get("Access-Control-Allow-Credentials"), "true");
  });
});

/* ── the LAN sync server, for real: sign up from :4177, cookie back, /auth/me ── */

describe("the LAN sync server signs in a page on another port", () => {
  const PORT = 4891;
  const base = `http://127.0.0.1:${PORT}`;
  const page = "http://127.0.0.1:4177";
  let dir = "";
  let child: ReturnType<typeof spawn> | null = null;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "yclap-cross-"));
    child = spawn(
      process.execPath,
      [
        "--experimental-strip-types",
        "--no-warnings",
        "server/sync-server.mjs",
        "--port",
        String(PORT),
        "--db",
        join(dir, "sync.json"),
        "--account-db",
        join(dir, "account.db"),
      ],
      { stdio: "ignore", env: { ...process.env, INAT_API_TOKEN: "" } },
    );
    for (let i = 0; i < 100; i += 1) {
      try {
        if ((await fetch(`${base}/health`)).ok) return;
      } catch {
        /* not up yet */
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error("sync server did not start");
  });

  after(() => {
    child?.kill();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* the db may still be closing on Windows */
    }
  });

  it("preflights, signs up, sets a SameSite=Lax cookie without Secure on http, and reads it back", async () => {
    const pre = await fetch(`${base}/auth/signup`, {
      method: "OPTIONS",
      headers: { Origin: page, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" },
    });
    assert.equal(pre.status, 204);
    assert.equal(pre.headers.get("access-control-allow-origin"), page);
    assert.equal(pre.headers.get("access-control-allow-credentials"), "true");

    const signup = await fetch(`${base}/auth/signup`, {
      method: "POST",
      headers: { Origin: page, "Sec-Fetch-Site": "same-site", "Content-Type": "application/json" },
      body: JSON.stringify({ username: "patha", password: "a-long-password-1" }),
    });
    assert.equal(signup.status, 201);
    assert.equal(signup.headers.get("access-control-allow-origin"), page);
    assert.equal(signup.headers.get("access-control-allow-credentials"), "true");
    const set_cookie = signup.headers.getSetCookie().join("\n");
    assert.match(set_cookie, /SameSite=Lax/);
    assert.doesNotMatch(set_cookie, /Secure/);

    const session = set_cookie.split(";")[0]!;
    const me = await fetch(`${base}/auth/me`, { headers: { Origin: page, Cookie: session } });
    const body = (await me.json()) as { account: { username: string } | null };
    assert.equal(body.account?.username, "patha");
    assert.equal(me.headers.get("access-control-allow-origin"), page);

    const foreign = await fetch(`${base}/auth/me`, { headers: { Origin: "https://evil.example" } });
    assert.equal(foreign.headers.get("access-control-allow-origin"), null);
  });

  it("identify from the other port gets its CORS headers and the proxy's own needs_token", async () => {
    const form = new FormData();
    form.append("image", new Blob([new Uint8Array([1, 2, 3])], { type: "image/jpeg" }), "p.jpg");
    const res = await fetch(`${base}/inat/identify`, {
      method: "POST",
      headers: { Origin: page, "Sec-Fetch-Site": "same-site" },
      body: form,
    });
    assert.equal(res.headers.get("access-control-allow-origin"), page);
    assert.equal(((await res.json()) as { error?: string }).error, "needs_token");
  });
});
