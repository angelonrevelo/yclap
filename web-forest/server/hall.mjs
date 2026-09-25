/**
 * The hall on the LAN box — same contract as worker/live-socket.ts.
 *
 * GET /live/socket (WebSocket) · POST /live/pose · GET /live/walker
 *
 * No `ws` dependency: this repo does not declare one, so the socket below is
 * the minimum RFC 6455 a browser needs — the SHA-1 handshake, unmasking client
 * text frames, unmasked server text frames, ping → pong, close. No
 * extensions, no binary. That is all the hall speaks.
 */
import { createHash } from "node:crypto";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_FRAME = 64 * 1024;

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
    this.is_open = true;
    this.pose = null;
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
          this.part.push(frame.payload);
          if (frame.fin) {
            const text = Buffer.concat(this.part).toString("utf8");
            this.part = [];
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

/** `lib` is src/multiplayer.ts, loaded by the caller (it owns the TS import). */
export function createHall(lib) {
  const socket = new Set();
  const polled = new Map();
  let recent_find = [];

  const snapshot = () => {
    const now = Date.now();
    recent_find = recent_find.filter((f) => now - f.at < lib.STALE_MS);
    for (const [id, pose] of polled) if (now - pose.at > lib.STALE_MS) polled.delete(id);
    const live_pose = [...socket].map((s) => s.pose).filter(Boolean);
    return {
      type: "roster",
      walker: lib.rosterOf([...live_pose, ...polled.values()], now),
      find: recent_find.map((f) => f.find),
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
      const pose = lib.sanitizePose(body, Date.now());
      if (!pose) return;
      s.pose = pose;
      broadcast({ type: "pose", walker: pose }, s);
    } else if (body?.type === "bye") {
      s.close();
    }
  };

  const onClose = (s) => {
    socket.delete(s);
    if (s.pose) broadcast({ type: "gone", walker_id: s.pose.walker_id });
  };

  return {
    /** node:http `upgrade` handler. Returns false when the path is not the hall's. */
    upgrade(req, raw_socket) {
      const url = new URL(req.url, "http://local");
      if (url.pathname !== "/live/socket") return false;
      const key = req.headers["sec-websocket-key"];
      if (typeof key !== "string" || (req.headers.upgrade ?? "").toLowerCase() !== "websocket") {
        raw_socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
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
      socket.add(s);
      s.send(JSON.stringify(snapshot()));
      return true;
    },
    snapshot,
    /** POST /live/pose body in; snapshot out, or null if the pose is refused. */
    pose(raw) {
      const pose = lib.sanitizePose(raw, Date.now());
      if (!pose) return null;
      polled.set(pose.walker_id, pose);
      broadcast({ type: "pose", walker: pose });
      return snapshot();
    },
    announce(find) {
      if (!find.length) return;
      const now = Date.now();
      for (const one of find) recent_find.push({ at: now, find: one });
      recent_find = recent_find.slice(-40);
      broadcast({ type: "find", find });
    },
  };
}
