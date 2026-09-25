import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  LOGIN_FAIL_MAX,
  LOGIN_WINDOW_MS,
  LoginLimit,
  PBKDF2_ITERATION,
  SESSION_MS,
  checkGoogleClaim,
  cleanUsername,
  fromBase64Url,
  hashPassword,
  isNewerOrSame,
  isSessionLive,
  mergeSave,
  readCookie,
  sanitizeSave,
  sessionExpiry,
  timingSafeEqual,
  toBase64Url,
  usernameSeed,
  verifyPassword,
  type AccountSave,
} from "../src/account-core.ts";
import { AccountService, isAccountPath, type SqlRun } from "../worker/account.ts";
import type { Sighting } from "../src/journal.ts";
import type { PointEvent } from "../src/gamify.ts";

/* ── hashing ─────────────────────────────────────────────────────────── */

test("hashPassword → verifyPassword round-trips, and a wrong password fails", async () => {
  const h = await hashPassword("narra-tree-42");
  assert.match(h.password_hash, new RegExp(`^pbkdf2-sha256\\$${PBKDF2_ITERATION}\\$`));
  assert.equal(await verifyPassword("narra-tree-42", h.password_hash, h.password_salt), true);
  assert.equal(await verifyPassword("narra-tree-43", h.password_hash, h.password_salt), false);
});

test("the salt is per hash — same password, different hash", async () => {
  const a = await hashPassword("same-password");
  const b = await hashPassword("same-password");
  assert.notEqual(a.password_salt, b.password_salt);
  assert.notEqual(a.password_hash, b.password_hash);
});

test("iterations stay at or under the Workers PBKDF2 ceiling of 100,000", () => {
  assert.equal(PBKDF2_ITERATION, 100_000);
});

test("verifyPassword refuses malformed hashes rather than throwing", async () => {
  assert.equal(await verifyPassword("x", "md5$1$abc", "c2FsdA"), false);
  assert.equal(await verifyPassword("x", "pbkdf2-sha256$999999999$abc", "c2FsdA"), false);
  assert.equal(await verifyPassword("x", "pbkdf2-sha256$nope$abc", "c2FsdA"), false);
});

test("timingSafeEqual compares bytes, and base64url round-trips", () => {
  assert.equal(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 3])), true);
  assert.equal(timingSafeEqual(new Uint8Array([1, 2, 3]), new Uint8Array([1, 2, 4])), false);
  assert.equal(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2, 3])), false);
  const byte = new Uint8Array([0, 255, 62, 63, 250, 1]);
  assert.deepEqual([...fromBase64Url(toBase64Url(byte))], [...byte]);
});

/* ── sessions, cookies, input ────────────────────────────────────────── */

test("a session is live until its expiry, then not", () => {
  const now = Date.parse("2026-09-26T08:00:00Z");
  const expires_at = sessionExpiry(now);
  assert.equal(Date.parse(expires_at) - now, SESSION_MS);
  assert.equal(isSessionLive(expires_at, now + SESSION_MS - 1), true);
  assert.equal(isSessionLive(expires_at, now + SESSION_MS), false);
  assert.equal(isSessionLive("not a date", now), false);
});

test("readCookie finds one cookie among several", () => {
  assert.equal(readCookie("a=1; mg_session=tok; b=2", "mg_session"), "tok");
  assert.equal(readCookie("a=1", "mg_session"), null);
  assert.equal(readCookie(null, "mg_session"), null);
});

test("cleanUsername lower-cases and rejects what it will not store", () => {
  assert.equal(cleanUsername("  Gelo.R "), "gelo.r");
  assert.equal(cleanUsername("ab"), null);
  assert.equal(cleanUsername("has space"), null);
  assert.equal(cleanUsername(42), null);
});

test("LoginLimit blocks after five failures inside the window, then lets go", () => {
  const limit = new LoginLimit();
  const t0 = 1_000_000;
  for (let i = 0; i < LOGIN_FAIL_MAX; i++) {
    assert.equal(limit.retryAfter("gelo", t0 + i), 0);
    limit.noteFail("gelo", t0 + i);
  }
  assert.ok(limit.retryAfter("gelo", t0 + 10) > 0);
  assert.equal(limit.retryAfter("someone-else", t0 + 10), 0);
  assert.equal(limit.retryAfter("gelo", t0 + LOGIN_WINDOW_MS + LOGIN_FAIL_MAX), 0);
});

/* ── Google claims ───────────────────────────────────────────────────── */

test("checkGoogleClaim accepts our audience and rejects anybody else's", () => {
  const now = Date.parse("2026-09-26T08:00:00Z");
  const good = {
    aud: "client-1",
    iss: "https://accounts.google.com",
    exp: String(now / 1000 + 600),
    sub: "1234",
    email: "gelo@example.com",
    email_verified: "true",
    name: "Gelo",
  };
  assert.deepEqual(checkGoogleClaim(good, "client-1", now), {
    google_sub: "1234",
    email: "gelo@example.com",
    name: "Gelo",
  });
  assert.equal(checkGoogleClaim({ ...good, aud: "client-2" }, "client-1", now), null);
  assert.equal(checkGoogleClaim({ ...good, iss: "evil.example" }, "client-1", now), null);
  assert.equal(checkGoogleClaim({ ...good, exp: String(now / 1000 - 1) }, "client-1", now), null);
  assert.equal(checkGoogleClaim({ ...good, sub: "" }, "client-1", now), null);
  assert.equal(checkGoogleClaim({ ...good, email_verified: "false" }, "client-1", now)?.email, null);
  assert.equal(usernameSeed({ google_sub: "1", email: "Gelo.R+x@x.com", name: null }), "gelo.rx");
});

/* ── the save merge ──────────────────────────────────────────────────── */

function sighting(sighting_id: string, entry_index: number, photo_data: string | null = null): Sighting {
  return {
    sighting_id,
    species_code: sighting_id.split("-")[0],
    photo_data,
    created_at: "2026-09-25T00:00:00Z",
    inat_scientific_name: null,
    inat_common_name: null,
    lat: 14.64,
    lon: 121.08,
    accuracy_m: 5,
    fix_source: "gps",
    note: null,
    walk_id: null,
    entry_kind: "badge",
    reported_name: null,
    entry_index,
  };
}

function point(event_id: string, subject_key: string, at: string): PointEvent {
  return { event_id, kind: "observe", points: 10, at, subject_key };
}

test("mergeSave keeps every local find, photo included, and adds the server's", () => {
  const local: AccountSave = {
    sighting: [sighting("narra-1", 1, "data:image/jpeg;base64,AAA"), sighting("acacia-2", 2)],
    point_event: [point("e1", "species:narra", "2026-09-25T01:00:00Z")],
  };
  const remote: AccountSave = {
    sighting: [sighting("narra-1", 1), sighting("molave-9", 2)],
    point_event: [point("e1", "species:narra", "2026-09-25T01:00:00Z"), point("e9", "species:molave", "2026-09-24T01:00:00Z")],
  };
  const m = mergeSave(local, remote);
  assert.deepEqual(
    m.save.sighting.map((s) => s.sighting_id),
    ["narra-1", "acacia-2", "molave-9"],
  );
  assert.equal(m.save.sighting[0].photo_data, "data:image/jpeg;base64,AAA");
  assert.equal(m.added_sighting_count, 1);
  assert.equal(m.local_only_count, 1);
  /* molave's number 2 is taken by acacia here, so it gets the next free one. */
  assert.equal(m.save.sighting[2].entry_index, 3);
  assert.deepEqual(new Set(m.save.sighting.map((s) => s.entry_index)).size, 3);
  assert.deepEqual(
    m.save.point_event.map((e) => e.event_id),
    ["e9", "e1"],
  );
  assert.equal(m.added_point_count, 1);
});

test("mergeSave never pays the same subject twice across two phones", () => {
  const local: AccountSave = { sighting: [], point_event: [point("a", "species:narra", "2026-09-25T00:00:00Z")] };
  const remote: AccountSave = { sighting: [], point_event: [point("b", "species:narra", "2026-09-24T00:00:00Z")] };
  const m = mergeSave(local, remote);
  assert.equal(m.save.point_event.length, 1);
  assert.equal(m.added_point_count, 0);
});

test("mergeSave onto an empty device takes the whole server save", () => {
  const remote: AccountSave = { sighting: [sighting("narra-1", 1)], point_event: [point("a", "x", "t")] };
  const m = mergeSave({ sighting: [], point_event: [] }, remote);
  assert.equal(m.save.sighting.length, 1);
  assert.equal(m.save.point_event.length, 1);
  assert.equal(m.local_only_count, 0);
});

test("sanitizeSave drops photos and rows without ids", () => {
  const s = sanitizeSave({
    sighting: [sighting("narra-1", 1, "data:image/jpeg;base64,AAA"), { nope: true }],
    point_event: [point("a", "x", "t"), { event_id: 3 }],
  });
  assert.ok(s);
  assert.equal(s.sighting.length, 1);
  assert.equal(s.sighting[0].photo_data, null);
  assert.equal(s.point_event.length, 1);
  assert.equal(sanitizeSave({ sighting: "x" }), null);
});

test("isNewerOrSame is last-write-wins on timestamps", () => {
  assert.equal(isNewerOrSame("2026-09-26T00:00:01Z", "2026-09-26T00:00:00Z"), true);
  assert.equal(isNewerOrSame("2026-09-26T00:00:00Z", "2026-09-26T00:00:00Z"), true);
  assert.equal(isNewerOrSame("2026-09-25T23:59:59Z", "2026-09-26T00:00:00Z"), false);
  assert.equal(isNewerOrSame("2026-09-25T23:59:59Z", null), true);
  assert.equal(isNewerOrSame("garbage", null), true);
});

/* ── the service, end to end on node:sqlite ──────────────────────────── */

function service(env = {}, fetcher: typeof fetch = fetch) {
  const db = new DatabaseSync(":memory:");
  const sql: SqlRun = (query, ...bind) => db.prepare(query).all(...bind) as ReturnType<SqlRun>;
  return new AccountService(sql, env, fetcher);
}

const ORIGIN = "https://magi.example";

function req(path: string, method = "GET", body?: unknown, cookie_jar = ""): Request {
  const headers = new Headers();
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (cookie_jar) headers.set("Cookie", cookie_jar);
  return new Request(`${ORIGIN}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

function sessionCookie(res: Response): string {
  const set = res.headers.getSetCookie().find((c) => c.startsWith("mg_session="));
  assert.ok(set, "expected a session cookie");
  assert.match(set, /HttpOnly/);
  assert.match(set, /SameSite=Lax/);
  assert.match(set, /Secure/);
  return set.split(";")[0];
}

test("isAccountPath covers /auth/* and /account/save only", () => {
  assert.equal(isAccountPath("/auth/login"), true);
  assert.equal(isAccountPath("/account/save"), true);
  assert.equal(isAccountPath("/settings"), false);
  assert.equal(isAccountPath("/sync"), false);
});

test("signup → me → logout → login → change password", async () => {
  const svc = service();
  const signup = await svc.handle(req("/auth/signup", "POST", { username: "Gelo", password: "narra-tree-42" }));
  assert.equal(signup.status, 201);
  const jar = sessionCookie(signup);
  const body = (await signup.json()) as { account: Record<string, unknown> };
  assert.equal(body.account.username, "gelo");
  assert.equal("password_hash" in body.account, false);

  const me = (await (await svc.handle(req("/auth/me", "GET", undefined, jar))).json()) as { account: { username: string } };
  assert.equal(me.account.username, "gelo");

  assert.equal((await svc.handle(req("/auth/signup", "POST", { username: "gelo", password: "another-one-1" }))).status, 409);
  assert.equal((await svc.handle(req("/auth/signup", "POST", { username: "short", password: "1234" }))).status, 400);

  await svc.handle(req("/auth/logout", "POST", {}, jar));
  const after = (await (await svc.handle(req("/auth/me", "GET", undefined, jar))).json()) as { account: unknown };
  assert.equal(after.account, null);

  assert.equal((await svc.handle(req("/auth/login", "POST", { username: "gelo", password: "wrong-pass" }))).status, 401);
  const login = await svc.handle(req("/auth/login", "POST", { username: "GELO", password: "narra-tree-42" }));
  assert.equal(login.status, 200);
  const jar2 = sessionCookie(login);

  const bad = await svc.handle(req("/auth/password", "POST", { old_password: "nope-nope", new_password: "molave-99-x" }, jar2));
  assert.equal(bad.status, 401);
  const ok = await svc.handle(req("/auth/password", "POST", { old_password: "narra-tree-42", new_password: "molave-99-x" }, jar2));
  assert.equal(ok.status, 200);
  const jar3 = sessionCookie(ok);
  /* The old session is gone; the fresh one works. */
  const old = (await (await svc.handle(req("/auth/me", "GET", undefined, jar2))).json()) as { account: unknown };
  assert.equal(old.account, null);
  const fresh = (await (await svc.handle(req("/auth/me", "GET", undefined, jar3))).json()) as { account: unknown };
  assert.ok(fresh.account);
  assert.equal((await svc.handle(req("/auth/login", "POST", { username: "gelo", password: "molave-99-x" }))).status, 200);
});

test("login is rate-limited per username", async () => {
  const svc = service();
  await svc.handle(req("/auth/signup", "POST", { username: "aleij", password: "narra-tree-42" }));
  for (let i = 0; i < LOGIN_FAIL_MAX; i++) {
    assert.equal((await svc.handle(req("/auth/login", "POST", { username: "aleij", password: `bad-${i}-xx` }))).status, 401);
  }
  const blocked = await svc.handle(req("/auth/login", "POST", { username: "aleij", password: "narra-tree-42" }));
  assert.equal(blocked.status, 429);
});

test("a login POST that is not JSON is refused", async () => {
  const svc = service();
  const res = await svc.handle(
    new Request(`${ORIGIN}/auth/login`, { method: "POST", body: "username=a&password=b", headers: { "Content-Type": "application/x-www-form-urlencoded" } }),
  );
  assert.equal(res.status, 400);
});

test("/account/save stores a photo-free save, last write wins", async () => {
  const svc = service();
  const jar = sessionCookie(await svc.handle(req("/auth/signup", "POST", { username: "mar", password: "narra-tree-42" })));
  assert.equal((await svc.handle(req("/account/save"))).status, 401);

  const empty = (await (await svc.handle(req("/account/save", "GET", undefined, jar))).json()) as { save: unknown };
  assert.equal(empty.save, null);

  const save: AccountSave = { sighting: [sighting("narra-1", 1, "data:image/jpeg;base64,AAA")], point_event: [] };
  const put = await svc.handle(req("/account/save", "PUT", { save, updated_at: "2026-09-26T01:00:00Z" }, jar));
  assert.equal(put.status, 200);
  const got = (await (await svc.handle(req("/account/save", "GET", undefined, jar))).json()) as {
    save: AccountSave;
    updated_at: string;
  };
  assert.equal(got.save.sighting.length, 1);
  assert.equal(got.save.sighting[0].photo_data, null);
  assert.equal(got.updated_at, "2026-09-26T01:00:00Z");

  const stale = await svc.handle(req("/account/save", "PUT", { save: { sighting: [], point_event: [] }, updated_at: "2026-09-26T00:00:00Z" }, jar));
  assert.equal(stale.status, 409);
  const still = (await (await svc.handle(req("/account/save", "GET", undefined, jar))).json()) as { save: AccountSave };
  assert.equal(still.save.sighting.length, 1);
});

test("an expired session reads as signed out and is deleted", async () => {
  let now = Date.parse("2026-09-26T00:00:00Z");
  const db = new DatabaseSync(":memory:");
  const sql: SqlRun = (query, ...bind) => db.prepare(query).all(...bind) as ReturnType<SqlRun>;
  const svc = new AccountService(sql, {}, fetch, () => now);
  const jar = sessionCookie(await svc.handle(req("/auth/signup", "POST", { username: "old", password: "narra-tree-42" })));
  now += SESSION_MS + 1;
  const me = (await (await svc.handle(req("/auth/me", "GET", undefined, jar))).json()) as { account: unknown };
  assert.equal(me.account, null);
  assert.equal(sql("SELECT COUNT(*) AS n FROM session")[0].n, 0);
});

test("Google is a clear 503 when no keys are configured", async () => {
  const svc = service();
  const res = await svc.handle(req("/auth/google"));
  assert.equal(res.status, 503);
  assert.match(((await res.json()) as { error: string }).error, /not configured/);
  const me = (await (await svc.handle(req("/auth/me"))).json()) as { is_google: boolean };
  assert.equal(me.is_google, false);
});

test("Google code flow: state cookie, code exchange, tokeninfo, account made", async () => {
  const env = { GOOGLE_CLIENT_ID: "client-1", GOOGLE_CLIENT_SECRET: "secret-1" };
  const call: string[] = [];
  const fetcher = (async (input: RequestInfo | URL) => {
    const url = String(input);
    call.push(url);
    if (url === "https://oauth2.googleapis.com/token") return Response.json({ id_token: "id-tok" });
    if (url.startsWith("https://oauth2.googleapis.com/tokeninfo")) {
      return Response.json({
        aud: "client-1",
        iss: "accounts.google.com",
        exp: String(Math.floor(Date.now() / 1000) + 600),
        sub: "g-555",
        email: "gelo@example.com",
        email_verified: "true",
        name: "Gelo",
      });
    }
    return new Response("no", { status: 500 });
  }) as typeof fetch;
  const svc = service(env, fetcher);

  const start = await svc.handle(req("/auth/google"));
  assert.equal(start.status, 302);
  const location = new URL(start.headers.get("Location")!);
  assert.equal(location.hostname, "accounts.google.com");
  assert.equal(location.searchParams.get("redirect_uri"), `${ORIGIN}/auth/google/callback`);
  const state = location.searchParams.get("state")!;
  const state_cookie = start.headers.getSetCookie()[0].split(";")[0];
  assert.equal(state_cookie, `mg_oauth_state=${state}`);

  const forged = await svc.handle(req(`/auth/google/callback?code=c&state=wrong`, "GET", undefined, state_cookie));
  assert.match(forged.headers.get("Location")!, /account_error=state/);

  const back = await svc.handle(req(`/auth/google/callback?code=c&state=${state}`, "GET", undefined, state_cookie));
  assert.equal(back.status, 302);
  assert.equal(back.headers.get("Location"), "/settings?account=google");
  const jar = sessionCookie(back);
  const me = (await (await svc.handle(req("/auth/me", "GET", undefined, jar))).json()) as {
    account: { username: string; is_google: boolean; has_password: boolean };
  };
  assert.equal(me.account.username, "gelo");
  assert.equal(me.account.is_google, true);
  assert.equal(me.account.has_password, false);
  assert.ok(call.some((u) => u.includes("tokeninfo")));

  /* A Google-only account sets its first password without an old one. */
  const set = await svc.handle(req("/auth/password", "POST", { new_password: "narra-tree-42" }, jar));
  assert.equal(set.status, 200);
});
