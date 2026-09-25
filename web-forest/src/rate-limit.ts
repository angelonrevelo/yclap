/**
 * Small, host-neutral brakes the Worker, the Durable Object and the LAN server
 * share: a sliding-window counter per key with a bounded key map, the client
 * IP a request came from, the Origin rule for the hall socket and for the POST
 * routes that spend something (the iNat token, a hall seat), and a byte cap on a
 * streamed body.
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
 * The hall socket accepts a browser page from this same host, or from a local
 * dev server. A missing Origin is a non-browser client (no cookie to ride, so
 * nothing to forge) and is let through.
 */
export function isHallOrigin(origin: string | null, host: string): boolean {
  if (!origin) return true;
  let from: URL;
  try {
    from = new URL(origin);
  } catch {
    return false;
  }
  if (from.protocol !== "https:" && from.protocol !== "http:") return false;
  if (from.host === host) return true;
  return LOCAL_HOST.has(from.hostname);
}

/**
 * A POST that spends something (the iNat token, a polled hall seat) must come
 * from this host's own page, a localhost dev server, or no browser at all.
 * No CORS header only stops a foreign page READING the answer: a `no-cors`
 * form POST still arrives. Browsers send Origin on every POST, and
 * Sec-Fetch-Site on every fetch, so either one naming another site refuses it.
 */
export function isOwnPage(request: Request, host: string = new URL(request.url).host): boolean {
  if (request.headers.get("Sec-Fetch-Site")?.toLowerCase() === "cross-site") return false;
  return isHallOrigin(request.headers.get("Origin"), host);
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
