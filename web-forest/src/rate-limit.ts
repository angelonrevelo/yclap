/**
 * Small, host-neutral brakes the Worker, the Durable Object and the LAN server
 * share: a sliding-window counter per key with a bounded key map, the client
 * IP a request came from, and the Origin rule for the hall socket.
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

/** MIME essence: `application/json; charset=utf-8` → `application/json`. */
export function mimeEssence(content_type: string | null): string {
  return (content_type ?? "").split(";")[0].trim().toLowerCase();
}
