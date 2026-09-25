/**
 * The LAN server's request plumbing, kept out of sync-server.mjs (which opens
 * databases and listens on import) so the tests can drive it.
 *
 * readJson     — a JSON body; past a byte cap answered 413, then the socket dropped
 * remoteIp     — the caller's address, as the Worker would see CF-Connecting-IP
 * webRequestOf — node req → WHATWG Request, body streamed and byte-capped
 * isOwnPageReq — src/rate-limit.ts isOwnPage, for a node req
 * pageOrigin   — HALL_PAGE_ORIGIN from the environment, parsed once
 */
import { Readable } from "node:stream";
import { capStream, isHallOrigin, pageOriginListOf } from "../src/rate-limit.ts";

/** Extra page origins the hall answers (`HALL_PAGE_ORIGIN`, comma-separated). */
export const pageOrigin = pageOriginListOf(process.env.HALL_PAGE_ORIGIN);

/** Largest /sync or /live/pose body buffered. */
export const JSON_BODY_MAX = 2_000_000;

/** Rejects with `status` so the caller can answer 413 vs 400. */
function fail(status, message) {
  return Object.assign(new Error(message), { status });
}

/**
 * Answer 413 with `Connection: close`, and destroy the request only once that
 * answer is flushed — destroying first would drop the socket before the client
 * ever read why.
 */
export function refuseTooLarge(req, res, max_byte) {
  if (!res.headersSent && !res.destroyed) {
    res.writeHead(413, { "Content-Type": "application/json", Connection: "close" });
    res.end(JSON.stringify({ error: "body too large", max_byte }), () => req.destroy());
  } else {
    req.destroy();
  }
}

/**
 * The raw body. Past `max_byte` it stops listening, rejects with status 413
 * and — given the response — answers 413 before destroying the request
 * (`refuseTooLarge`); with no response it destroys it at once. Either way a
 * client that keeps sending costs nothing more: no buffer keeps growing
 * behind the rejection. A Content-Length already over the cap is refused
 * before a byte is read.
 */
export function readBody(req, max_byte, res = null) {
  return new Promise((resolve_body, reject) => {
    const chunk = [];
    let byte = 0;
    const overflow = () => {
      detach();
      chunk.length = 0;
      req.pause();
      reject(fail(413, "body too large"));
      if (res) refuseTooLarge(req, res, max_byte);
      else req.destroy();
    };
    const onData = (c) => {
      byte += c.length;
      if (byte > max_byte) return overflow();
      chunk.push(Buffer.from(c));
    };
    const onEnd = () => {
      detach();
      resolve_body(Buffer.concat(chunk));
    };
    const onError = (e) => {
      detach();
      reject(Object.assign(e, { status: 400 }));
    };
    function detach() {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
    }
    if (Number(req.headers?.["content-length"]) > max_byte) return overflow();
    req.on("data", onData);
    req.on("end", onEnd);
    req.on("error", onError);
  });
}

/** The body as JSON, through `readBody`'s cap; bad JSON rejects with 400. */
export async function readJson(req, max_byte = JSON_BODY_MAX, res = null) {
  const body = await readBody(req, max_byte, res);
  try {
    const text = body.toString("utf8");
    return text ? JSON.parse(text) : {};
  } catch {
    throw fail(400, "bad json");
  }
}

/** An empty address is unknown, not loopback: it never unlocks X-Forwarded-For. */
export const isLoopback = (ip) => typeof ip === "string" && (ip === "::1" || ip.startsWith("127."));
const bare = (ip) => String(ip ?? "").trim().replace(/^::ffff:/, "");

/**
 * The caller's address, as the Worker would see it in CF-Connecting-IP.
 *
 * From loopback — the Vite dev proxy, which runs with `xfwd: true` — the LAST
 * X-Forwarded-For entry is the phone's own address: the proxy appends the
 * socket it heard from, so anything a phone put in the header itself sits
 * before it and is ignored. X-Forwarded-For from any other address is never
 * read (a phone could write anything there). Null for loopback with no
 * forwarded address: a local script, where per-IP limits do not apply.
 */
export function remoteIp(req) {
  const ip = bare(req.socket?.remoteAddress);
  if (!ip) return null;
  if (!isLoopback(ip)) return ip;
  const forwarded = req.headers["x-forwarded-for"];
  const list = (Array.isArray(forwarded) ? forwarded.join(",") : String(forwarded ?? "")).split(",");
  const last = bare(list[list.length - 1]);
  return !last || isLoopback(last) ? null : last;
}

/**
 * node req → WHATWG Request for the shared handlers. CF-Connecting-IP is
 * always rewritten from remoteIp (a client cannot pick its own), the URL keeps
 * the Host the browser asked for (Origin checks compare against it), and a
 * POST body is streamed through a byte cap: past `max_byte` the node request
 * is destroyed, chunked or not.
 */
export function webRequestOf(req, max_byte) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (key === "cf-connecting-ip" || value == null) continue;
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else headers.set(key, String(value));
  }
  const ip = remoteIp(req);
  if (ip) headers.set("cf-connecting-ip", ip);
  const has_body = req.method !== "GET" && req.method !== "HEAD";
  const host = /^[\w.:[\]-]+$/.test(req.headers.host ?? "") ? req.headers.host : "local";
  return new Request(`http://${host}${req.url}`, {
    method: req.method,
    headers,
    body: has_body ? capStream(Readable.toWeb(req), max_byte) : undefined,
    duplex: "half",
  });
}

/** Same rule as isOwnPage: an allow-listed Origin, or not cross-site and an Origin `isHallOrigin` takes. */
export function isOwnPageReq(req, allow = pageOrigin) {
  const origin = req.headers.origin ?? null;
  if (origin && allow.includes(origin)) return true;
  if (String(req.headers["sec-fetch-site"] ?? "").toLowerCase() === "cross-site") return false;
  return isHallOrigin(origin, req.headers.host ?? "", allow);
}
