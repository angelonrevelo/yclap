/**
 * The hall on the LAN box — same contract as worker/live-socket.ts.
 *
 * GET /live/socket (WebSocket) · POST /live/pose · GET /live/walker
 *
 * No `ws` dependency: this repo does not declare one, so the socket below is
 * the minimum RFC 6455 a browser needs — the SHA-1 handshake, unmasking client
 * text frames, unmasked server text frames, ping → pong, close. No
 * extensions, no binary. That is all the hall speaks.
 *
 * Brakes, as on the Worker: the upgrade must come from a page isHallOrigin
 * takes — this host, a localhost dev server, the same LAN hostname on another
 * port, or HALL_PAGE_ORIGIN (403 otherwise); at most HALL_WALKER_MAX sockets
 * and polled walkers; at most LAN_IP_SOCKET_MAX sockets and POLL_IP_WALKER_MAX
 * polled walkers per IP; poses past POSE_PER_SECOND per socket / polled walker
 * and POSE_IP_PER_SECOND per IP are dropped.
 *
 * The per-IP caps are tight here (4) and loose on the Worker (40): on the
 * wifi every phone has its own address, so four seats is already more than
 * one person needs, while behind Cloudflare a whole booth shares one public IP.
 * A loopback caller with no forwarded address (a local script) has no IP and
 * no per-IP cap.
 *
 * Moderation, as on the Worker: `guard` (worker/moderation.ts, on node:sqlite
 * here) says which walkers a moderator hid and which finds; a hidden walker is
 * off the roster, their poses refused, and their phone alone told why. A name
 * the filter refused (src/name-filter.ts, inside sanitizePoseVerdict) prints
 * as the generated walker name, and that phone alone is told.
 */
import { createHash } from "node:crypto";
import { RateWindow, isHallOrigin } from "../src/rate-limit.ts";
import { pageOrigin, remoteIp } from "./request.mjs";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_FRAME = 64 * 1024;
/** A message split over continuation frames may not add up past this either. */
export const MAX_MESSAGE = 64 * 1024;

export function acceptKeyOf(key) {
  return createHash("sha1").update(key + GUID).digest("base64");
}

/** One server → client frame. Servers never mask. */
export function encodeFrame(payload, opcode = 0x1) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), "utf8");
  let head;
  if (body.length < 126) {
    head = Buffer.alloc(2);
    head[1] = body.length;
  } else if (body.length < 65536) {
    head = Buffer.alloc(4);
    head[1] = 126;
    head.writeUInt16BE(body.length, 2);
  } else {
    head = Buffer.alloc(10);
    head[1] = 127;
    head.writeBigUInt64BE(BigInt(body.length), 2);
  }
  head[0] = 0x80 | opcode;
  return Buffer.concat([head, body]);
}

/**
 * Read one frame off the front of `buf`.
 * Returns null while the frame is still incomplete.
 */
export function decodeFrame(buf) {
  if (buf.length < 2) return null;
  const fin = (buf[0] & 0x80) !== 0;
  const opcode = buf[0] & 0x0f;
  const is_masked = (buf[1] & 0x80) !== 0;
  let length = buf[1] & 0x7f;
  let at = 2;
  if (length === 126) {
    if (buf.length < 4) return null;
    length = buf.readUInt16BE(2);
    at = 4;
  } else if (length === 127) {
    if (buf.length < 10) return null;
    length = Number(buf.readBigUInt64BE(2));
    at = 10;
  }
  const mask_at = at;
  if (is_masked) at += 4;
  if (buf.length < at + length) return null;
  const payload = Buffer.from(buf.subarray(at, at + length));
  if (is_masked) {
    for (let i = 0; i < payload.length; i += 1) payload[i] ^= buf[mask_at + (i % 4)];
  }
  return { fin, opcode, payload, rest: buf.subarray(at + length) };
}

class LiteSocket {
  constructor(socket, onText, onClose) {
    this.socket = socket;
    this.buf = Buffer.alloc(0);
    this.part = [];
    this.part_byte = 0;
    this.is_open = true;
    /** Times of this socket's recent poses, for the per-socket rate. */
    this.pose_at = [];
    this.pose = null;
    /** Already told a moderator hid it — so not told again every second. */
    this.is_hidden_told = false;
    socket.on("data", (chunk) => {
      this.buf = Buffer.concat([this.buf, chunk]);
      if (this.buf.length > MAX_FRAME * 2) return this.close();
      for (let frame = decodeFrame(this.buf); frame; frame = decodeFrame(this.buf)) {
        this.buf = frame.rest;
        if (frame.opcode === 0x8) return this.close();
        if (frame.opcode === 0x9) {
          this.write(encodeFrame(frame.payload, 0xa));
          continue;
        }
        if (frame.opcode === 0x1 || frame.opcode === 0x0) {
          this.part_byte += frame.payload.length;
          if (this.part_byte > MAX_MESSAGE) return this.close();
          this.part.push(frame.payload);
          if (frame.fin) {
            const text = Buffer.concat(this.part).toString("utf8");
            this.part = [];
            this.part_byte = 0;
            onText(this, text);
          }
        }
      }
    });
    const end = () => {
      if (!this.is_open) return;
      this.is_open = false;
      onClose(this);
    };
    socket.on("close", end);
    socket.on("error", end);
  }

  write(buf) {
    if (!this.is_open) return;
    try {
      this.socket.write(buf);
    } catch {
      /* close handler tidies up */
    }
  }

  send(text) {
    this.write(encodeFrame(text));
  }

  close() {
    this.write(encodeFrame(Buffer.alloc(0), 0x8));
    this.socket.end();
  }
}

/**
 * `lib` is src/multiplayer.ts, loaded by the caller (it owns the TS import).
 * `page_origin` is the HALL_PAGE_ORIGIN allow-list (request.mjs pageOrigin).
 */
export function createHall(lib, page_origin = pageOrigin, guard = null) {
  const socket = new Set();
  const polled = new Map();
  let recent_find = [];
  const walker_max = lib.HALL_WALKER_MAX ?? 200;
  const pose_per_second = lib.POSE_PER_SECOND ?? 2;
  const poll_ip_walker_max = lib.POLL_IP_WALKER_MAX ?? 4;
  const socket_ip_max = lib.LAN_IP_SOCKET_MAX ?? 4;
  /** walker_id → the IP polling it, for the per-IP seat cap. */
  const polled_ip = new Map();
  const poll_limit = new RateWindow(pose_per_second, 1000);
  const ip_limit = new RateWindow(lib.POSE_IP_PER_SECOND ?? 60, 1000);
  const polledBy = (ip) => {
    let count = 0;
    for (const holder of polled_ip.values()) if (holder === ip) count += 1;
    return count;
  };
  const socketsOf = (ip) => {
    let count = 0;
    for (const s of socket) if (s.ip === ip) count += 1;
    return count;
  };

  /** Same per-socket brake as worker/live-socket.ts: at most N poses a second. */
  const isPoseAllowed = (s, now) => {
    s.pose_at = s.pose_at.filter((at) => now - at < 1000);
    if (s.pose_at.length >= pose_per_second) return false;
    s.pose_at.push(now);
    return true;
  };

  const hiddenUntil = (walker_id, now) => (guard ? guard.hiddenUntil(walker_id, now) : null);
  const isFindShown = (find, now) => (lib.isFindShown ? lib.isFindShown(find, guard, now) : true);

  const snapshot = () => {
    const now = Date.now();
    recent_find = recent_find.filter((f) => now - f.at < lib.STALE_MS);
    for (const [id, pose] of polled) {
      if (now - pose.at <= lib.STALE_MS) continue;
      polled.delete(id);
      polled_ip.delete(id);
    }
    const live_pose = [...socket].map((s) => s.pose).filter(Boolean);
    return {
      type: "roster",
      walker: lib
        .rosterOf([...live_pose, ...polled.values()], now)
        .filter((p) => hiddenUntil(p.walker_id, now) === null)
        .slice(0, walker_max),
      find: recent_find.map((f) => f.find).filter((f) => isFindShown(f, now)),
      server_time: now,
    };
  };

  const broadcast = (message, except) => {
    const text = JSON.stringify(message);
    for (const s of socket) if (s !== except) s.send(text);
  };

  const onText = (s, text) => {
    if (text.length > 4000) return;
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      return;
    }
    if (body?.type === "pose") {
      const now = Date.now();
      if (!isPoseAllowed(s, now)) return;
      const verdict = lib.sanitizePoseVerdict(body, now);
      if (!verdict) return;
      const { pose, refusal } = verdict;
      const prev = s.pose;
      const until = hiddenUntil(pose.walker_id, now);
      if (until !== null) {
        if (prev) {
          s.pose = null;
          broadcast({ type: "gone", walker_id: prev.walker_id }, s);
        }
        if (!s.is_hidden_told) {
          s.is_hidden_told = true;
          s.send(JSON.stringify({ type: "notice", notice: lib.hiddenNoticeOf(until) }));
        }
        return;
      }
      s.is_hidden_told = false;
      s.pose = pose;
      broadcast({ type: "pose", walker: pose }, s);
      /* Told once per name: when it first takes effect, not every second. */
      const notice = lib.nameNoticeOfPose(pose, refusal);
      if (notice && prev?.name !== pose.name) s.send(JSON.stringify({ type: "notice", notice }));
    } else if (body?.type === "bye") {
      s.close();
    }
  };

  const onClose = (s) => {
    socket.delete(s);
    if (s.pose) broadcast({ type: "gone", walker_id: s.pose.walker_id });
  };

  return {
    /**
     * node:http `upgrade` handler. Returns false when the path is not the
     * hall's. `ip` is the caller (remoteIp); null means no per-IP cap.
     */
    upgrade(req, raw_socket, ip = remoteIp(req)) {
      const url = new URL(req.url, "http://local");
      if (url.pathname !== "/live/socket") return false;
      const key = req.headers["sec-websocket-key"];
      if (typeof key !== "string" || (req.headers.upgrade ?? "").toLowerCase() !== "websocket") {
        raw_socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
        return true;
      }
      if (!isHallOrigin(req.headers.origin ?? null, req.headers.host ?? "", page_origin)) {
        raw_socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
        return true;
      }
      if (socket.size >= walker_max) {
        raw_socket.end("HTTP/1.1 503 Service Unavailable\r\n\r\n");
        return true;
      }
      if (ip && socketsOf(ip) >= socket_ip_max) {
        raw_socket.end("HTTP/1.1 429 Too Many Requests\r\n\r\n");
        return true;
      }
      raw_socket.write(
        "HTTP/1.1 101 Switching Protocols\r\n" +
          "Upgrade: websocket\r\n" +
          "Connection: Upgrade\r\n" +
          `Sec-WebSocket-Accept: ${acceptKeyOf(key)}\r\n\r\n`,
      );
      raw_socket.setNoDelay(true);
      const s = new LiteSocket(raw_socket, onText, onClose);
      s.ip = ip;
      socket.add(s);
      s.send(JSON.stringify(snapshot()));
      return true;
    },
    snapshot,
    /**
     * POST /live/pose body in, from `ip` (null: a local caller, no per-IP
     * brake). Out: `{ status, body }` — 200 + the roster, or the refusal.
     */
    pose(raw, ip = null) {
      const now = Date.now();
      const verdict = lib.sanitizePoseVerdict(raw, now);
      if (!verdict) return { status: 400, body: { error: "pose needs player_id and a lat/lon inside the campus frame" } };
      const { pose } = verdict;
      if (ip && ip_limit.retryAfter(ip, now) > 0) return { status: 429, body: { error: "too many poses" } };
      if (poll_limit.take(pose.walker_id, now) > 0) return { status: 429, body: { error: "too many poses" } };
      if (ip) ip_limit.note(ip, now);
      const until = hiddenUntil(pose.walker_id, now);
      if (until !== null) {
        polled.delete(pose.walker_id);
        polled_ip.delete(pose.walker_id);
        return { status: 403, body: { error: "hidden from the hall by a moderator", notice: lib.hiddenNoticeOf(until) } };
      }
      if (!polled.has(pose.walker_id)) {
        snapshot(); /* drops stale polled walkers first */
        if (ip && polledBy(ip) >= poll_ip_walker_max) {
          return { status: 429, body: { error: "too many walkers from one address" } };
        }
        if (polled.size >= walker_max) return { status: 503, body: { error: "the hall is full" } };
      }
      polled.set(pose.walker_id, pose);
      if (ip) polled_ip.set(pose.walker_id, ip);
      else polled_ip.delete(pose.walker_id);
      broadcast({ type: "pose", walker: pose });
      const notice = lib.nameNoticeOfPose(pose, verdict.refusal);
      return { status: 200, body: notice ? { ...snapshot(), notice } : snapshot() };
    },
    /** Who the console may see in the hall now: walker_id, name, level. */
    walkerNow() {
      return snapshot().walker;
    },
    /** A moderator just hid `walker_id` — same as LiveHall.evict. */
    evict(walker_id, until) {
      polled.delete(walker_id);
      polled_ip.delete(walker_id);
      recent_find = recent_find.filter((f) => f.find.walker_id !== walker_id);
      for (const s of socket) {
        if (s.pose?.walker_id !== walker_id) continue;
        s.pose = null;
        s.is_hidden_told = true;
        s.send(JSON.stringify({ type: "notice", notice: lib.hiddenNoticeOf(until) }));
      }
      broadcast({ type: "gone", walker_id });
    },
    announce(all) {
      const now = Date.now();
      const find = all.filter((f) => isFindShown(f, now));
      if (!find.length) return;
      for (const one of find) recent_find.push({ at: now, find: one });
      recent_find = recent_find.slice(-40);
      broadcast({ type: "find", find });
    },
  };
}
