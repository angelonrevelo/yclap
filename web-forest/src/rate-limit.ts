/**
 * Small, host-neutral brakes the Worker, the Durable Object and the LAN server
 * share: a sliding-window counter per key with a bounded key map, the client
 * IP a request came from, the Origin rule (and its CORS answer) for the hall
 * socket and for the POST routes that spend something (the iNat token, a hall
 * seat), and a byte cap on a streamed body.
 *
 * In memory on purpose. A Durable Object eviction or a Worker isolate recycle
 * forgets every count — that is a brake on abuse, not a ledger anybody should
 * rely on.
 */

/** Past this many keys the map is swept, then trimmed oldest-first. */
export const RATE_KEY_MAX = 10_000;

/**
 * At most `max` hits per `window_ms` per key. `take` both checks and counts in
 * one synchronous step, so parallel requests cannot all slip past the check
 * before any of them is counted.
 */
export class RateWindow {
  max: number;
  window_ms: number;
  key_max: number;
  hit: Map<string, number[]> = new Map();

  constructor(max: number, window_ms: number, key_max = RATE_KEY_MAX) {
    this.max = max;
    this.window_ms = window_ms;
    this.key_max = key_max;
  }

  recent(key: string, now: number): number[] {
    const kept = (this.hit.get(key) ?? []).filter((at) => now - at < this.window_ms);
    if (kept.length) this.hit.set(key, kept);
    else this.hit.delete(key);
    return kept;
  }

  /** Milliseconds until the key may hit again; 0 when it may now. Counts nothing. */
  retryAfter(key: string, now: number = Date.now()): number {
    const kept = this.recent(key, now);
    if (kept.length < this.max) return 0;
    return Math.max(1, kept[kept.length - this.max] + this.window_ms - now);
  }

  /** Count a hit unconditionally. */
  note(key: string, now: number = Date.now()): void {
    const kept = this.recent(key, now);
    /* Re-insert so Map order stays oldest-touched first for the trim below. */
    this.hit.delete(key);
    this.hit.set(key, [...kept, now]);
    this.bound(now);
  }

  /** Check and count in one step: 0 (and counted) when allowed, else the wait in ms. */
  take(key: string, now: number = Date.now()): number {
    const wait = this.retryAfter(key, now);
    if (wait > 0) return wait;
    this.note(key, now);
    return 0;
  }

  /** Hand back the newest hit — for a counted attempt that turned out fine. */
  refund(key: string): void {
    const kept = this.hit.get(key);
    if (!kept) return;
    kept.pop();
    if (!kept.length) this.hit.delete(key);
  }

  clear(key: string): void {
    this.hit.delete(key);
  }

  /** Drop expired keys once the map is too big; still too big → drop the oldest. */
  bound(now: number): void {
    if (this.hit.size <= this.key_max) return;
    for (const key of [...this.hit.keys()]) this.recent(key, now);
    for (const key of this.hit.keys()) {
      if (this.hit.size <= this.key_max) break;
      this.hit.delete(key);
    }
  }
}

/**
 * The caller's IP. Cloudflare sets CF-Connecting-IP on every request from the
 * internet (and overwrites one a client sends); the LAN server sets it from the
 * socket. No header means an in-process caller — a test or the smoke script —
 * and per-IP limits do not apply to it.
 */
export function clientIp(request: Request): string | null {
  const ip = request.headers.get("CF-Connecting-IP")?.trim();
  return ip ? ip : null;
}

const LOCAL_HOST = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * A hostname only a local network can reach: loopback, the RFC 1918 ranges,
 * CGNAT / Tailscale (100.64/10), IPv4 link-local, IPv6 unique-local and
 * link-local, and mDNS `.local` names. Nobody on the internet can be served a
 * page from one of these, so two ports on the same such host are one box.
 */
export function isPrivateHostname(hostname: string): boolean {
  const name = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (LOCAL_HOST.has(name) || name.endsWith(".local")) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(name);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 10 || a === 127) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true;
    return a === 100 && b >= 64 && b <= 127;
  }
  if (!name.includes(":")) return false;
  if (name === "::1") return true;
  return /^f[cd][0-9a-f]{0,2}:/.test(name) || /^fe[89ab][0-9a-f]?:/.test(name);
}

/**
 * `HALL_PAGE_ORIGIN` — a comma-separated list of page origins the hall also
 * answers (a page served from somewhere the other rules do not cover). Each is
 * normalised to its URL origin; anything unparseable is dropped.
 */
export function pageOriginListOf(raw: string | null | undefined): string[] {
  const list: string[] = [];
  for (const part of String(raw ?? "").split(",")) {
    const one = part.trim();
    if (!one) continue;
    try {
      const origin = new URL(one).origin;
      if (origin !== "null") list.push(origin);
    } catch {
      /* not an origin */
    }
  }
  return list;
}

function hostnameOf(host: string): string | null {
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return null;
  }
}

/**
 * The hall socket accepts a browser page from:
 * - this same host (scheme-blind, port included);
 * - a local dev server (`localhost`, loopback);
 * - the same hostname on another port, when that hostname is a LAN or
 *   loopback address (`isPrivateHostname`) — the handset build served from
 *   :4177 talking to the sync server on :8788 (script/handset.md);
 * - an origin named in `allow` (HALL_PAGE_ORIGIN).
 * A missing Origin is a non-browser client (no cookie to ride, so nothing to
 * forge) and is let through.
 */
export function isHallOrigin(origin: string | null, host: string, allow: readonly string[] = []): boolean {
  if (!origin) return true;
  let from: URL;
  try {
    from = new URL(origin);
  } catch {
    return false;
  }
  if (from.protocol !== "https:" && from.protocol !== "http:") return false;
  if (from.host === host) return true;
  if (LOCAL_HOST.has(from.hostname)) return true;
  if (allow.includes(from.origin)) return true;
  const host_name = hostnameOf(host);
  return host_name !== null && from.hostname === host_name && isPrivateHostname(host_name);
}

/**
 * A POST that spends something (the iNat token, a polled hall seat) must come
 * from a page `isHallOrigin` accepts, or no browser at all.
 * No CORS header only stops a foreign page READING the answer: a `no-cors`
 * form POST still arrives. Browsers send Origin on every POST, and
 * Sec-Fetch-Site on every fetch, so either one naming another site refuses it
 * — unless the Origin is one `allow` names outright.
 */
export function isOwnPage(
  request: Request,
  host: string = new URL(request.url).host,
  allow: readonly string[] = [],
): boolean {
  const origin = request.headers.get("Origin");
  if (origin && allow.includes(origin)) return true;
  if (request.headers.get("Sec-Fetch-Site")?.toLowerCase() === "cross-site") return false;
  return isHallOrigin(origin, host, allow);
}

/**
 * CORS headers for /live/pose: only for a page `isHallOrigin` accepts that is
 * on another origin than this host (a same-origin page needs none), and never
 * `*`. Empty for everyone else, so a foreign page's preflight fails and it
 * cannot read the roster.
 *
 * `is_credential` (the account routes and the identify proxy) adds
 * `Access-Control-Allow-Credentials: true` — safe only because the origin is
 * echoed from the allow rule above, never `*` — and `method` widens the verbs
 * (the save is a PUT).
 */
export function pageCorsOf(
  origin: string | null,
  host: string,
  allow: readonly string[] = [],
  option: { is_credential?: boolean; method?: string } = {},
): Record<string, string> {
  if (!origin || !isHallOrigin(origin, host, allow)) return {};
  try {
    if (new URL(origin).host === host) return {};
  } catch {
    return {};
  }
  const cors: Record<string, string> = {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": option.method ?? "POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    Vary: "Origin",
  };
  if (option.is_credential) cors["Access-Control-Allow-Credentials"] = "true";
  return cors;
}

/** Verbs the account routes and the identify proxy answer a cross-origin page. */
export const ACCOUNT_CORS_METHOD = "GET, POST, PUT, OPTIONS";

/**
 * /auth/*, /account/* and /inat/identify for a page on another origin (the
 * Path A build on :4177 talking to the sync server on :8788, or a
 * HALL_PAGE_ORIGIN page): its own origin echoed, with credentials, so the
 * session cookie rides. Empty for anyone else — a foreign page's preflight
 * fails and it can read nothing.
 */
export function accountCorsOf(origin: string | null, host: string, allow: readonly string[] = []): Record<string, string> {
  return pageCorsOf(origin, host, allow, { is_credential: true, method: ACCOUNT_CORS_METHOD });
}

/** The paths that take `accountCorsOf`. */
export function isAccountCorsPath(pathname: string): boolean {
  /* /quest and /quest/claim too: a claim carries the session cookie, so one
     signed-in student is one claim (worker/quest.ts). */
  return pathname.startsWith("/auth/") || pathname.startsWith("/account/") || pathname === "/inat/identify" || pathname === "/quest" || pathname === "/quest/claim";
}

/**
 * `response` with `cors` merged into its headers (a copy when the headers are
 * immutable). An empty `cors` hands the response back untouched.
 */
export function withCors(response: Response, cors: Record<string, string>): Response {
  const entry = Object.entries(cors);
  if (!entry.length) return response;
  try {
    for (const [key, value] of entry) response.headers.set(key, value);
    return response;
  } catch {
    const headers = new Headers(response.headers);
    for (const [key, value] of entry) headers.set(key, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
}

/** The error a capped stream fails with once it has passed its byte cap. */
export class BodyTooLarge extends Error {
  max_byte: number;
  constructor(max_byte: number) {
    super(`body over ${max_byte} bytes`);
    this.max_byte = max_byte;
  }
}

/**
 * The same bytes, counted as they arrive: past `max_byte` the source is
 * cancelled (on the LAN server that destroys the socket's request) and the
 * reader fails with BodyTooLarge. A chunked body declares no Content-Length,
 * so this is the only cap that holds for it.
 */
export function capStream(source: ReadableStream<Uint8Array>, max_byte: number): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let byte = 0;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      byte += value.byteLength;
      if (byte > max_byte) {
        const error = new BodyTooLarge(max_byte);
        controller.error(error);
        await reader.cancel(error).catch(() => {});
        return;
      }
      controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}

/** MIME essence: `application/json; charset=utf-8` → `application/json`. */
export function mimeEssence(content_type: string | null): string {
  return (content_type ?? "").split(";")[0].trim().toLowerCase();
}
