/**
 * Account logic shared by the Worker, the local sync server and the client.
 *
 * Pure or WebCrypto-only on purpose: `crypto.subtle` exists in Workers, in
 * Node ≥ 20 and in the browser, so the same hashing code runs in all three and
 * the tests exercise exactly what production runs.
 *
 * Passwords are PBKDF2-SHA256 at 100,000 iterations with a per-account 16-byte
 * salt. 100,000 is not a round number picked for comfort — it is the ceiling
 * the Workers runtime accepts for PBKDF2; asking for more throws there.
 * OWASP's 2023 figure for PBKDF2-SHA256 is 600,000, so this is a known
 * shortfall the rate limits in worker/account.ts partly make up for.
 */
import type { Sighting } from "./journal.ts";
import type { PointEvent } from "./gamify.ts";
import { RateWindow } from "./rate-limit.ts";

export const PBKDF2_ITERATION = 100_000;
export const SESSION_DAY = 30;
export const SESSION_MS = SESSION_DAY * 24 * 60 * 60 * 1000;
export const SESSION_COOKIE = "mg_session";
export const STATE_COOKIE = "mg_oauth_state";

/** Five wrong passwords per username from one IP inside fifteen minutes, then a wait. */
export const LOGIN_FAIL_MAX = 5;
export const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 32;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 200;

/** What the server tells the client about an account. Never the hash. */
export interface PublicAccount {
  account_code: string;
  username: string;
  display_name: string;
  /** Google is linked to this account. */
  is_google: boolean;
  /** A password is set (a Google-only account has none until it sets one). */
  has_password: boolean;
  created_at: string;
}

/* ── encoding ─────────────────────────────────────────────────────────── */

export function toBase64Url(byte: Uint8Array): string {
  let bin = "";
  for (const b of byte) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function randomByte(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

/** 32 random bytes, base64url. Used for session tokens and OAuth state. */
export function newToken(): string {
  return toBase64Url(randomByte(32));
}

export function newAccountCode(): string {
  return `acc_${[...randomByte(8)].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return [...digest].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Compare without an early exit, so the time taken does not reveal how many
 * leading bytes matched. Length is not secret here (both sides are fixed-size
 * digests), so a length mismatch returns straight away.
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/* ── passwords ────────────────────────────────────────────────────────── */

async function pbkdf2(password: string, salt: Uint8Array, iteration: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bit = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: iteration },
    key,
    256,
  );
  return new Uint8Array(bit);
}

export interface PasswordHash {
  /** `pbkdf2-sha256$<iterations>$<base64url digest>` — the scheme travels with the hash. */
  password_hash: string;
  password_salt: string;
}

export async function hashPassword(password: string, salt: Uint8Array = randomByte(16)): Promise<PasswordHash> {
  const digest = await pbkdf2(password, salt, PBKDF2_ITERATION);
  return {
    password_hash: `pbkdf2-sha256$${PBKDF2_ITERATION}$${toBase64Url(digest)}`,
    password_salt: toBase64Url(salt),
  };
}

export async function verifyPassword(password: string, password_hash: string, password_salt: string): Promise<boolean> {
  const part = password_hash.split("$");
  if (part.length !== 3 || part[0] !== "pbkdf2-sha256") return false;
  const iteration = Number(part[1]);
  if (!Number.isInteger(iteration) || iteration < 1 || iteration > PBKDF2_ITERATION) return false;
  let want: Uint8Array;
  let salt: Uint8Array;
  try {
    want = fromBase64Url(part[2]);
    salt = fromBase64Url(password_salt);
  } catch {
    return false;
  }
  const got = await pbkdf2(password, salt, iteration);
  return timingSafeEqual(got, want);
}

/* ── input rules ──────────────────────────────────────────────────────── */

/** Lower-case letters, digits, `.`, `_`, `-`. Returns null when it will not do. */
export function cleanUsername(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().toLowerCase();
  if (name.length < USERNAME_MIN || name.length > USERNAME_MAX) return null;
  return /^[a-z0-9._-]+$/.test(name) ? name : null;
}

export function passwordProblem(raw: unknown): string | null {
  if (typeof raw !== "string") return "password required";
  if (raw.length < PASSWORD_MIN) return `password must be at least ${PASSWORD_MIN} characters`;
  if (raw.length > PASSWORD_MAX) return `password must be at most ${PASSWORD_MAX} characters`;
  return null;
}

/* ── sessions ─────────────────────────────────────────────────────────── */

export function sessionExpiry(now: number = Date.now()): string {
  return new Date(now + SESSION_MS).toISOString();
}

export function isSessionLive(expires_at: string, now: number = Date.now()): boolean {
  const at = Date.parse(expires_at);
  return Number.isFinite(at) && at > now;
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    if (part.slice(0, i).trim() === name) return part.slice(i + 1).trim() || null;
  }
  return null;
}

/**
 * HttpOnly + SameSite=Lax always. Secure whenever the request came over
 * HTTPS — production and the handset server; plain-http localhost dev drops
 * it so the cookie is not silently refused there.
 */
export function cookie(name: string, value: string, max_age_s: number, is_secure: boolean, path = "/"): string {
  const flag = [`${name}=${value}`, `Path=${path}`, "HttpOnly", "SameSite=Lax", `Max-Age=${max_age_s}`];
  if (is_secure) flag.push("Secure");
  return flag.join("; ");
}

/* ── rate limits ──────────────────────────────────────────────────── */

/**
 * Per IP, on top of the per-username brake. Generous on purpose: a booth full
 * of phones on one wifi reaches us from one public IP.
 */
export const LOGIN_IP_MAX = 50;
/**
 * Failed logins per username from ALL addresses together, per LOGIN_WINDOW_MS.
 * The strict LOGIN_FAIL_MAX is per username AND IP, so five wrong guesses from
 * somewhere else cannot lock the owner out; this looser total still stops a
 * spread-out guessing run on one name.
 */
export const LOGIN_USER_MAX = 50;
export const SIGNUP_IP_MAX = 40;
export const SIGNUP_WINDOW_MS = 60 * 60 * 1000;

/**
 * Login attempts per username + IP (the key is `username|ip`, so a stranger's
 * guesses never lock the owner out). An attempt is counted BEFORE the password is
 * checked (`take`), so a burst of parallel guesses cannot all pass the check
 * while PBKDF2 is still running; a correct password clears the count. In
 * memory — it resets when the Durable Object is evicted, which is acceptable
 * for a brake on password guessing but is not a lockout anybody should rely on.
 */
export class LoginLimit extends RateWindow {
  constructor() {
    super(LOGIN_FAIL_MAX, LOGIN_WINDOW_MS);
  }

  noteFail(username: string, now: number = Date.now()): void {
    this.note(username, now);
  }
}

/* ── Google ───────────────────────────────────────────────────────────── */

export function googleAuthUrl(client_id: string, redirect_uri: string, state: string): string {
  const q = new URLSearchParams({
    client_id,
    redirect_uri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export interface GoogleIdentity {
  google_sub: string;
  email: string | null;
  name: string | null;
}

/**
 * Check the claims Google's tokeninfo endpoint returns for an id_token. The
 * signature is Google's to verify (tokeninfo does); the audience, issuer and
 * expiry are ours, because a token minted for somebody else's app is also a
 * validly signed token.
 */
export function checkGoogleClaim(claim: unknown, client_id: string, now: number = Date.now()): GoogleIdentity | null {
  if (!claim || typeof claim !== "object") return null;
  const c = claim as Record<string, unknown>;
  if (c.aud !== client_id) return null;
  if (c.iss !== "accounts.google.com" && c.iss !== "https://accounts.google.com") return null;
  const exp = Number(c.exp);
  if (!Number.isFinite(exp) || exp * 1000 <= now) return null;
  if (typeof c.sub !== "string" || !c.sub) return null;
  const is_verified = c.email_verified === true || c.email_verified === "true";
  return {
    google_sub: c.sub,
    email: typeof c.email === "string" && is_verified ? c.email : null,
    name: typeof c.name === "string" && c.name.trim() ? c.name.trim().slice(0, 60) : null,
  };
}

/** A username seed from a Google email or name; the caller de-duplicates. */
export function usernameSeed(identity: GoogleIdentity): string {
  const raw = (identity.email?.split("@")[0] ?? identity.name ?? "walker").toLowerCase();
  const seed = raw.replace(/[^a-z0-9._-]+/g, "").slice(0, USERNAME_MAX - 5);
  return seed.length >= USERNAME_MIN ? seed : "walker";
}

/* ── the save blob ────────────────────────────────────────────────────── */

/**
 * What an account keeps: the journal's rows and the point ledger (the weekly
 * streak is computed from the ledger, so it travels with it). Photos never do
 * — `photo_data` is nulled before upload and again on the server.
 */
export interface AccountSave {
  sighting: Sighting[];
  point_event: PointEvent[];
}

export const SAVE_MAX_SIGHTING = 5000;
export const SAVE_MAX_POINT_EVENT = 20000;
export const SAVE_MAX_BYTE = 1_500_000;

/**
 * The /account/save wire protocol this build speaks. 2 = compare-and-swap
 * (a PUT names `base_updated_at`). Bump it whenever the save request or answer
 * changes in a way an older tab cannot follow. The server sends its number as
 * `X-Save-Protocol` on every /auth and /account answer; a tab whose own number
 * differs is running another build and is told to reload rather than that its
 * sync "failed".
 */
export const SAVE_PROTOCOL = 2;
export const SAVE_PROTOCOL_HEADER = "X-Save-Protocol";

export function emptySave(): AccountSave {
  return { sighting: [], point_event: [] };
}

export function withoutPhoto(save: AccountSave): AccountSave {
  return { ...save, sighting: save.sighting.map((s) => ({ ...s, photo_data: null })) };
}

/** Shape-check an untrusted save. Keeps rows that carry their id; drops photos. */
export function sanitizeSave(raw: unknown): AccountSave | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.sighting) || !Array.isArray(r.point_event)) return null;
  const sighting = r.sighting
    .filter(
      (s): s is Sighting =>
        !!s &&
        typeof s === "object" &&
        typeof (s as Sighting).sighting_id === "string" &&
        typeof (s as Sighting).species_code === "string",
    )
    .slice(0, SAVE_MAX_SIGHTING)
    .map((s) => ({ ...s, photo_data: null }));
  const point_event = r.point_event
    .filter(
      (e): e is PointEvent =>
        !!e &&
        typeof e === "object" &&
        typeof (e as PointEvent).event_id === "string" &&
        typeof (e as PointEvent).subject_key === "string",
    )
    .slice(0, SAVE_MAX_POINT_EVENT);
  return { sighting, point_event };
}

export interface SaveMerge {
  save: AccountSave;
  /** Rows the server had that this device did not. */
  added_sighting_count: number;
  added_point_count: number;
  /** Rows this device had that the server did not — the upload is needed. */
  local_only_count: number;
}

/**
 * Union, never replace. Every local row survives (with its photo); rows only
 * the server has are appended. Where both have the same row, the local copy
 * wins because it is the only one that can hold a photo.
 *
 * Catalogue numbers are stable per device, so a server row whose number is
 * already taken here gets the next free one rather than a duplicate. Point
 * events are deduplicated by kind + subject as well as by id, so the same
 * species learned on two phones is not paid twice.
 *
 * Known limit: a row deleted on this device but still on the server comes
 * back. There are no tombstones yet.
 */
export function mergeSave(local: AccountSave, remote: AccountSave): SaveMerge {
  const sighting = [...local.sighting];
  const seen_id = new Set(sighting.map((s) => s.sighting_id));
  const used_index = new Set(sighting.map((s) => s.entry_index));
  let high = sighting.reduce((n, s) => Math.max(n, s.entry_index), 0);
  let added_sighting_count = 0;
  const remote_sighting = [...remote.sighting].sort((a, b) => a.entry_index - b.entry_index);
  for (const s of remote_sighting) {
    if (seen_id.has(s.sighting_id)) continue;
    let entry_index = s.entry_index;
    if (!(entry_index > 0) || used_index.has(entry_index)) entry_index = high + 1;
    high = Math.max(high, entry_index);
    used_index.add(entry_index);
    seen_id.add(s.sighting_id);
    sighting.push({ ...s, photo_data: null, entry_index });
    added_sighting_count += 1;
  }

  const point_event = [...local.point_event];
  const seen_event = new Set(point_event.map((e) => e.event_id));
  const seen_subject = new Set(point_event.map((e) => `${e.kind}|${e.subject_key}`));
  let added_point_count = 0;
  for (const e of remote.point_event) {
    const subject = `${e.kind}|${e.subject_key}`;
    if (seen_event.has(e.event_id) || seen_subject.has(subject)) continue;
    seen_event.add(e.event_id);
    seen_subject.add(subject);
    point_event.push(e);
    added_point_count += 1;
  }
  point_event.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  const remote_sighting_id = new Set(remote.sighting.map((s) => s.sighting_id));
  const remote_event_id = new Set(remote.point_event.map((e) => e.event_id));
  const local_only_count =
    local.sighting.filter((s) => !remote_sighting_id.has(s.sighting_id)).length +
    local.point_event.filter((e) => !remote_event_id.has(e.event_id)).length;

  return { save: { sighting, point_event }, added_sighting_count, added_point_count, local_only_count };
}

/**
 * The server's own stamp for a save it is about to store: now, but always
 * strictly after the stamp it replaces, so every write gets a fresh
 * compare-and-swap token even if two land in the same millisecond or the
 * server clock steps back. Client clocks never enter into it.
 */
export function nextSaveStamp(now: number, stored_at: string | null): string {
  const before = stored_at ? Date.parse(stored_at) : NaN;
  const at = Number.isFinite(before) && before >= now ? before + 1 : now;
  return new Date(at).toISOString();
}

/** GET / PUT /account/save as plain status + JSON, so tests can plug a server in. */
export interface SaveTransport {
  get(): Promise<{ status: number; data: unknown }>;
  put(body: { save: AccountSave; base_updated_at: string | null }): Promise<{ status: number; data: unknown }>;
}

export interface SaveReconcile {
  added_sighting_count: number;
  added_point_count: number;
  sighting_count: number;
  updated_at: string;
}

type StoredBody = { save?: unknown; updated_at?: unknown; error?: unknown };

function storedOf(data: unknown): { save: AccountSave | null; updated_at: string | null; error: string | null } {
  const d = (data && typeof data === "object" ? data : {}) as StoredBody;
  return {
    save: sanitizeSave(d.save),
    updated_at: typeof d.updated_at === "string" ? d.updated_at : null,
    error: typeof d.error === "string" ? d.error : null,
  };
}

/**
 * Pull, union into the device (never dropping a local find), push back naming
 * the server stamp that was read. On 409 the answer carries what the server
 * now holds: merge that too and push once more. `readLocal` is re-read on the
 * retry so a find made meanwhile is not lost; `writeLocal` is only called when
 * the server brought rows this device did not have.
 */
export async function reconcileSave(
  transport: SaveTransport,
  readLocal: () => AccountSave,
  writeLocal: (save: AccountSave) => void,
): Promise<SaveReconcile> {
  const got = await transport.get();
  let remote = storedOf(got.data);
  if (got.status !== 200) throw new Error(remote.error ?? `HTTP ${got.status}`);
  let added_sighting_count = 0;
  let added_point_count = 0;
  for (let attempt = 0; attempt < 2; attempt++) {
    const merged = mergeSave(readLocal(), remote.save ?? emptySave());
    if (merged.added_sighting_count || merged.added_point_count) {
      writeLocal(merged.save);
      added_sighting_count += merged.added_sighting_count;
      added_point_count += merged.added_point_count;
    }
    const put = await transport.put({ save: withoutPhoto(merged.save), base_updated_at: remote.updated_at });
    const answer = storedOf(put.data);
    if (put.status === 200 && answer.updated_at) {
      return { added_sighting_count, added_point_count, sighting_count: merged.save.sighting.length, updated_at: answer.updated_at };
    }
    if (put.status !== 409) throw new Error(answer.error ?? `HTTP ${put.status}`);
    remote = answer;
  }
  throw new Error("another device kept saving at the same moment");
}
