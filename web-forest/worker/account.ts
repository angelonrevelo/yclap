/**
 * Accounts, sessions and the per-account save — the working database.
 *
 * The store is SQL, and deliberately the same SQL on both hosts: in
 * production it is the SQLite that backs the CampusWorld Durable Object
 * (`ctx.storage.sql`), in local dev it is `node:sqlite` in
 * server/sync-server.mjs. Both are handed in as a `SqlRun`, so this file never
 * knows which one it is talking to and the tests drive it on `node:sqlite`.
 *
 * Routes. CORS is the host's job, never `*`: the Worker and the LAN server add
 * accountCorsOf (src/rate-limit.ts) — the page's own origin plus
 * Allow-Credentials — only for an allowed page on another origin, so the
 * session cookie rides from the Path A build on :4177 to :8788 (same hostname,
 * so same-site: SameSite=Lax still sends it) and nowhere else:
 *   GET  /auth/me               → { account | null, is_google }
 *   POST /auth/signup           { username, password, display_name? }
 *   POST /auth/login            { username, password }
 *   POST /auth/logout
 *   POST /auth/password         { old_password, new_password }
 *   GET  /auth/google           → 302 to Google, or 503 when not configured
 *   GET  /auth/google/callback  → 302 back to /settings
 *   GET  /account/save          → { save | null, updated_at | null }
 *   PUT  /account/save          { save, base_updated_at } → { updated_at }
 *
 * Every answer carries `X-Save-Protocol` (SAVE_PROTOCOL): the client compares
 * it with its own build's number and, on a mismatch, says "Update available —
 * reload" instead of a failure it cannot act on (src/account.ts).
 *
 * The save is compare-and-swap on a stamp only the server writes: a PUT names
 * the `updated_at` it last read (`base_updated_at`, null for "there was none")
 * and is refused with 409 + the stored save if that has moved. A phone with a
 * wrong clock can neither win nor lock anybody out — its clock is never read.
 *
 * Signup and login are rate-limited per IP (CF-Connecting-IP), and login also
 * per username + IP (strict) and per username from everywhere (loose), the
 * attempt counted before the password hash is computed. The strict limit is
 * keyed on the pair so five wrong guesses from a stranger cannot lock the
 * owner out.
 */
import {
  LOGIN_IP_MAX,
  LOGIN_USER_MAX,
  LOGIN_WINDOW_MS,
  LoginLimit,
  SAVE_MAX_BYTE,
  SAVE_PROTOCOL,
  SAVE_PROTOCOL_HEADER,
  SIGNUP_IP_MAX,
  SIGNUP_WINDOW_MS,
  SESSION_COOKIE,
  SESSION_MS,
  STATE_COOKIE,
  checkGoogleClaim,
  cleanUsername,
  cookie,
  googleAuthUrl,
  hashPassword,
  isSessionLive,
  newAccountCode,
  newToken,
  nextSaveStamp,
  passwordProblem,
  readCookie,
  sanitizeSave,
  sessionExpiry,
  sha256Hex,
  timingSafeEqual,
  usernameSeed,
  verifyPassword,
  type AccountSave,
  type GoogleIdentity,
  type PublicAccount,
} from "../src/account-core.ts";
import { RateWindow, clientIp, mimeEssence } from "../src/rate-limit.ts";

/** Expired sessions are swept at most this often. */
const SESSION_SWEEP_MS = 60 * 60 * 1000;

export type SqlValue = string | number | null;
export type SqlRow = Record<string, SqlValue>;
export type SqlRun = (query: string, ...bind: SqlValue[]) => SqlRow[];

export interface AccountEnv {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
}

export function isAccountPath(pathname: string): boolean {
  return pathname.startsWith("/auth/") || pathname === "/account/save";
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS account (
    account_code TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    password_salt TEXT,
    google_sub TEXT UNIQUE,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS session (
    session_token_hash TEXT PRIMARY KEY,
    account_code TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS session_account_code ON session (account_code)`,
  `CREATE TABLE IF NOT EXISTS save (
    account_code TEXT PRIMARY KEY,
    save_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
];

interface AccountRow {
  account_code: string;
  username: string;
  password_hash: string | null;
  password_salt: string | null;
  google_sub: string | null;
  display_name: string;
  created_at: string;
  updated_at: string;
}

function publicOf(row: AccountRow): PublicAccount {
  return {
    account_code: row.account_code,
    username: row.username,
    display_name: row.display_name,
    is_google: !!row.google_sub,
    has_password: !!row.password_hash,
    created_at: row.created_at,
  };
}

function json(body: unknown, status = 200, set_cookie: string[] = []): Response {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
  for (const c of set_cookie) headers.append("Set-Cookie", c);
  return new Response(JSON.stringify(body), { status, headers });
}

function tooMany(wait_ms: number): Response {
  const retry_after_s = Math.ceil(wait_ms / 1000);
  const res = json({ error: "too many tries — wait and try again", retry_after_s }, 429);
  res.headers.set("Retry-After", String(retry_after_s));
  return res;
}

function redirect(location: string, set_cookie: string[] = []): Response {
  const headers = new Headers({ Location: location, "Cache-Control": "no-store" });
  for (const c of set_cookie) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

export class AccountService {
  sql: SqlRun;
  env: AccountEnv;
  fetcher: typeof fetch;
  now: () => number;
  limit: LoginLimit = new LoginLimit();
  login_ip_limit: RateWindow = new RateWindow(LOGIN_IP_MAX, LOGIN_WINDOW_MS);
  login_user_limit: RateWindow = new RateWindow(LOGIN_USER_MAX, LOGIN_WINDOW_MS);
  signup_ip_limit: RateWindow = new RateWindow(SIGNUP_IP_MAX, SIGNUP_WINDOW_MS);
  swept_at = 0;

  /* The default wraps fetch: in Workers a bare `fetch` stored on an object and
     called as a method throws "Illegal invocation". */
  constructor(
    sql: SqlRun,
    env: AccountEnv = {},
    fetcher: typeof fetch = (input, init) => fetch(input, init),
    now: () => number = Date.now,
  ) {
    this.sql = sql;
    this.env = env;
    this.fetcher = fetcher;
    this.now = now;
    for (const statement of SCHEMA) this.sql(statement);
  }

  get isGoogle(): boolean {
    return !!(this.env.GOOGLE_CLIENT_ID && this.env.GOOGLE_CLIENT_SECRET);
  }

  stamp(): string {
    return new Date(this.now()).toISOString();
  }

  accountBy(column: "account_code" | "username" | "google_sub", value: string): AccountRow | null {
    const row = this.sql(`SELECT * FROM account WHERE ${column} = ?`, value)[0];
    return (row as unknown as AccountRow) ?? null;
  }

  async openSession(account_code: string, is_secure: boolean): Promise<string> {
    const token = newToken();
    this.sql(
      "INSERT INTO session (session_token_hash, account_code, expires_at, created_at) VALUES (?, ?, ?, ?)",
      await sha256Hex(token),
      account_code,
      sessionExpiry(this.now()),
      this.stamp(),
    );
    return cookie(SESSION_COOKIE, token, Math.floor(SESSION_MS / 1000), is_secure);
  }

  async sessionOf(request: Request): Promise<{ account: AccountRow; token_hash: string } | null> {
    const token = readCookie(request.headers.get("Cookie"), SESSION_COOKIE);
    if (!token) return null;
    const token_hash = await sha256Hex(token);
    const row = this.sql("SELECT * FROM session WHERE session_token_hash = ?", token_hash)[0];
    if (!row) return null;
    if (!isSessionLive(String(row.expires_at), this.now())) {
      this.sql("DELETE FROM session WHERE session_token_hash = ?", token_hash);
      return null;
    }
    const account = this.accountBy("account_code", String(row.account_code));
    return account ? { account, token_hash } : null;
  }

  /** Delete every expired session, at most once per SESSION_SWEEP_MS. */
  sweepSession(): void {
    const now = this.now();
    if (now - this.swept_at < SESSION_SWEEP_MS) return;
    this.swept_at = now;
    /* Every expires_at is a toISOString(), so text order is time order. */
    this.sql("DELETE FROM session WHERE expires_at <= ?", new Date(now).toISOString());
  }

  async readBody(request: Request): Promise<Record<string, unknown> | null> {
    /* JSON only. A cross-site HTML form cannot send application/json without
       a preflight, which is one more brake on CSRF beside SameSite=Lax. The
       MIME essence must match exactly — `text/plain; x=application/json`
       does not pass. */
    if (mimeEssence(request.headers.get("Content-Type")) !== "application/json") return null;
    const declared = Number(request.headers.get("Content-Length"));
    if (Number.isFinite(declared) && declared > SAVE_MAX_BYTE) return null;
    const text = await request.text();
    if (text.length > SAVE_MAX_BYTE) return null;
    try {
      const value = JSON.parse(text || "{}") as unknown;
      return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }

  /** Every route, stamped with the save protocol this server speaks. */
  async handle(request: Request): Promise<Response> {
    const response = await this.route(request);
    try {
      response.headers.set(SAVE_PROTOCOL_HEADER, String(SAVE_PROTOCOL));
      return response;
    } catch {
      /* Immutable headers (a passed-through Response): copy them. */
      const headers = new Headers(response.headers);
      headers.set(SAVE_PROTOCOL_HEADER, String(SAVE_PROTOCOL));
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
  }

  async route(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const is_secure = url.protocol === "https:";
    const route = `${request.method} ${url.pathname}`;
    const ip = clientIp(request);
    this.sweepSession();

    if (route === "GET /auth/me") {
      const session = await this.sessionOf(request);
      return json({ account: session ? publicOf(session.account) : null, is_google: this.isGoogle });
    }

    if (route === "POST /auth/signup") {
      const body = await this.readBody(request);
      if (!body) return json({ error: "send JSON" }, 400);
      const username = cleanUsername(body.username);
      if (!username) return json({ error: "username: 3–32 of a-z 0-9 . _ -" }, 400);
      const problem = passwordProblem(body.password);
      if (problem) return json({ error: problem }, 400);
      /* Counted before the lookup and the hash, so neither a burst nor a
         username-probing loop gets past it. */
      const wait = ip ? this.signup_ip_limit.take(ip, this.now()) : 0;
      if (wait > 0) return tooMany(wait);
      if (this.accountBy("username", username)) return json({ error: "that username is taken" }, 409);
      const { password_hash, password_salt } = await hashPassword(body.password as string);
      /* A parallel signup may have taken the name while the hash ran. */
      if (this.accountBy("username", username)) return json({ error: "that username is taken" }, 409);
      const display_name =
        typeof body.display_name === "string" && body.display_name.trim()
          ? body.display_name.trim().slice(0, 40)
          : username;
      const account_code = newAccountCode();
      const at = this.stamp();
      this.sql(
        `INSERT INTO account (account_code, username, password_hash, password_salt, google_sub, display_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, NULL, ?, ?, ?)`,
        account_code,
        username,
        password_hash,
        password_salt,
        display_name,
        at,
        at,
      );
      const set = await this.openSession(account_code, is_secure);
      return json({ account: publicOf(this.accountBy("account_code", account_code)!) }, 201, [set]);
    }

    if (route === "POST /auth/login") {
      const body = await this.readBody(request);
      if (!body) return json({ error: "send JSON" }, 400);
      const username = cleanUsername(body.username) ?? "";
      /* Reserve the attempt BEFORE the awaited PBKDF2: check and count are one
         synchronous step, so parallel requests cannot all pass the check. */
      const now = this.now();
      const ip_wait = ip ? this.login_ip_limit.take(ip, now) : 0;
      if (ip_wait > 0) return tooMany(ip_wait);
      const pair = `${username}|${ip ?? ""}`;
      const wait = this.limit.take(pair, now);
      if (wait > 0) {
        if (ip) this.login_ip_limit.refund(ip);
        return tooMany(wait);
      }
      const user_wait = this.login_user_limit.take(username, now);
      if (user_wait > 0) {
        if (ip) this.login_ip_limit.refund(ip);
        this.limit.refund(pair);
        return tooMany(user_wait);
      }
      const row = username ? this.accountBy("username", username) : null;
      const password = typeof body.password === "string" ? body.password : "";
      const is_ok =
        !!row?.password_hash &&
        !!row.password_salt &&
        (await verifyPassword(password, row.password_hash, row.password_salt));
      if (!row || !is_ok) return json({ error: "wrong username or password" }, 401);
      this.limit.clear(pair);
      this.login_user_limit.refund(username);
      if (ip) this.login_ip_limit.refund(ip);
      const set = await this.openSession(row.account_code, is_secure);
      return json({ account: publicOf(row) }, 200, [set]);
    }

    if (route === "POST /auth/logout") {
      const session = await this.sessionOf(request);
      if (session) this.sql("DELETE FROM session WHERE session_token_hash = ?", session.token_hash);
      return json({ ok: true }, 200, [cookie(SESSION_COOKIE, "", 0, is_secure)]);
    }

    if (route === "POST /auth/password") {
      const session = await this.sessionOf(request);
      if (!session) return json({ error: "sign in first" }, 401);
      const body = await this.readBody(request);
      if (!body) return json({ error: "send JSON" }, 400);
      const problem = passwordProblem(body.new_password);
      if (problem) return json({ error: problem }, 400);
      const { account } = session;
      /* A Google-only account has no old password to prove; it sets its first. */
      if (account.password_hash && account.password_salt) {
        const old = typeof body.old_password === "string" ? body.old_password : "";
        if (!(await verifyPassword(old, account.password_hash, account.password_salt))) {
          return json({ error: "current password is wrong" }, 401);
        }
      }
      const next = await hashPassword(body.new_password as string);
      this.sql(
        "UPDATE account SET password_hash = ?, password_salt = ?, updated_at = ? WHERE account_code = ?",
        next.password_hash,
        next.password_salt,
        this.stamp(),
        account.account_code,
      );
      /* Every other device signs out; this one gets a fresh session. */
      this.sql("DELETE FROM session WHERE account_code = ?", account.account_code);
      const set = await this.openSession(account.account_code, is_secure);
      return json({ ok: true }, 200, [set]);
    }

    if (route === "GET /auth/google") {
      if (!this.isGoogle) {
        return json(
          {
            error: "google sign-in is not configured on this server",
            detail: "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are not set",
          },
          503,
        );
      }
      const state = newToken();
      const redirect_uri = `${url.origin}/auth/google/callback`;
      return redirect(googleAuthUrl(this.env.GOOGLE_CLIENT_ID!, redirect_uri, state), [
        cookie(STATE_COOKIE, state, 600, is_secure, "/auth/google"),
      ]);
    }

    if (route === "GET /auth/google/callback") {
      const clear_state = cookie(STATE_COOKIE, "", 0, is_secure, "/auth/google");
      const fail = (code: string) => redirect(`/settings?account_error=${code}`, [clear_state]);
      if (!this.isGoogle) return fail("google_off");
      const want = readCookie(request.headers.get("Cookie"), STATE_COOKIE);
      const got = url.searchParams.get("state");
      const enc = new TextEncoder();
      if (!want || !got || !timingSafeEqual(enc.encode(want), enc.encode(got))) return fail("state");
      const code = url.searchParams.get("code");
      if (!code) return fail(url.searchParams.get("error") ? "denied" : "no_code");
      const identity = await this.exchangeGoogle(code, `${url.origin}/auth/google/callback`);
      if (!identity) return fail("google_token");
      const account_code = this.linkGoogle(identity, (await this.sessionOf(request))?.account ?? null);
      if (!account_code) return fail("google_taken");
      const set = await this.openSession(account_code, is_secure);
      return redirect("/settings?account=google", [clear_state, set]);
    }

    if (url.pathname === "/account/save") {
      const session = await this.sessionOf(request);
      if (!session) return json({ error: "sign in first" }, 401);
      const account_code = session.account.account_code;

      if (request.method === "GET") return json(this.storedSave(account_code));

      if (request.method === "PUT") {
        const body = await this.readBody(request);
        if (!body) return json({ error: "send JSON under 1.5 MB" }, 400);
        const save = sanitizeSave(body.save);
        const base = body.base_updated_at;
        if (!save || !(base === null || typeof base === "string")) {
          return json({ error: "save { sighting[], point_event[] } and base_updated_at (string or null) required" }, 400);
        }
        /* Read, stamp and write with no await in between, and the write itself
           only lands if the stored stamp is still the one the client read. */
        const updated_at = nextSaveStamp(this.now(), this.storedStamp(account_code));
        const save_json = JSON.stringify(save);
        const written =
          base === null
            ? this.sql(
                `INSERT INTO save (account_code, save_json, updated_at) VALUES (?, ?, ?)
                 ON CONFLICT (account_code) DO NOTHING RETURNING updated_at`,
                account_code,
                save_json,
                updated_at,
              )
            : this.sql(
                "UPDATE save SET save_json = ?, updated_at = ? WHERE account_code = ? AND updated_at = ? RETURNING updated_at",
                save_json,
                updated_at,
                account_code,
                base,
              );
        if (!written.length) return json({ error: "stale", ...this.storedSave(account_code) }, 409);
        return json({ ok: true, updated_at, sighting_count: save.sighting.length });
      }
    }

    return json({ error: "not found" }, 404);
  }

  /** Just the stamp — the CAS path needs no parsed save. */
  storedStamp(account_code: string): string | null {
    const stored = this.sql("SELECT updated_at FROM save WHERE account_code = ?", account_code)[0];
    return stored ? String(stored.updated_at) : null;
  }

  storedSave(account_code: string): { save: AccountSave | null; updated_at: string | null } {
    const stored = this.sql("SELECT save_json, updated_at FROM save WHERE account_code = ?", account_code)[0];
    if (!stored) return { save: null, updated_at: null };
    return { save: sanitizeSave(JSON.parse(String(stored.save_json))), updated_at: String(stored.updated_at) };
  }

  /** Code → tokens at Google, then the id_token's claims via tokeninfo. */
  async exchangeGoogle(code: string, redirect_uri: string): Promise<GoogleIdentity | null> {
    try {
      const token_res = await this.fetcher("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: this.env.GOOGLE_CLIENT_ID!,
          client_secret: this.env.GOOGLE_CLIENT_SECRET!,
          redirect_uri,
          grant_type: "authorization_code",
        }).toString(),
      });
      if (!token_res.ok) return null;
      const token = (await token_res.json()) as { id_token?: string };
      if (!token.id_token) return null;
      const info_res = await this.fetcher(
        `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(token.id_token)}`,
      );
      if (!info_res.ok) return null;
      return checkGoogleClaim(await info_res.json(), this.env.GOOGLE_CLIENT_ID!, this.now());
    } catch {
      return null;
    }
  }

  /**
   * Find or make the account for a Google identity. Signed in already → link
   * Google to that account (unless another account holds this Google id).
   */
  linkGoogle(identity: GoogleIdentity, current: AccountRow | null): string | null {
    const linked = this.accountBy("google_sub", identity.google_sub);
    if (current) {
      if (linked && linked.account_code !== current.account_code) return null;
      if (!linked) {
        this.sql(
          "UPDATE account SET google_sub = ?, updated_at = ? WHERE account_code = ?",
          identity.google_sub,
          this.stamp(),
          current.account_code,
        );
      }
      return current.account_code;
    }
    if (linked) return linked.account_code;
    const seed = usernameSeed(identity);
    let username = seed;
    for (let n = 2; this.accountBy("username", username); n++) username = `${seed}${n}`;
    const account_code = newAccountCode();
    const at = this.stamp();
    this.sql(
      `INSERT INTO account (account_code, username, password_hash, password_salt, google_sub, display_name, created_at, updated_at)
       VALUES (?, ?, NULL, NULL, ?, ?, ?, ?)`,
      account_code,
      username,
      identity.google_sub,
      identity.name ?? username,
      at,
      at,
    );
    return account_code;
  }
}
