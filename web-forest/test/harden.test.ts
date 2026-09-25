import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { test } from "node:test";
import { RateWindow, clientIp, isHallOrigin, mimeEssence } from "../src/rate-limit.ts";
import { handleIdentify, IDENTIFY_IP_MAX } from "../worker/inat.ts";
import { LiveHall } from "../worker/live-socket.ts";
import { createHall, MAX_MESSAGE } from "../server/hall.mjs";
import * as multiplayer from "../src/multiplayer.ts";
import { CAMPUS_CENTER } from "../src/geo.ts";

/* ── RateWindow ──────────────────────────────────────────────────────── */

test("RateWindow.take checks and counts in one step, and lets go after the window", () => {
  const limit = new RateWindow(2, 1000);
  assert.equal(limit.take("a", 0), 0);
  assert.equal(limit.take("a", 10), 0);
  assert.ok(limit.take("a", 20) > 0);
  assert.equal(limit.take("b", 20), 0, "keys are independent");
  assert.equal(limit.take("a", 1001), 0);
  limit.refund("a");
  assert.equal(limit.take("a", 1002), 0, "a refunded hit is not counted");
});

test("RateWindow keeps its key map bounded: expired keys go first, then the oldest", () => {
  const limit = new RateWindow(5, 1000, 3);
  limit.take("old-1", 0);
  limit.take("old-2", 0);
  limit.take("live-1", 1500);
  limit.take("live-2", 1600);
  assert.deepEqual([...limit.hit.keys()], ["live-1", "live-2"], "expired keys swept once over the cap");
  limit.take("live-3", 1700);
  limit.take("live-4", 1800);
  assert.equal(limit.hit.size, 3);
  assert.equal(limit.hit.has("live-1"), false, "the oldest live key is trimmed");
});

test("clientIp reads CF-Connecting-IP, and none means an in-process caller", () => {
  assert.equal(clientIp(new Request("http://x/", { headers: { "CF-Connecting-IP": " 203.0.113.4 " } })), "203.0.113.4");
  assert.equal(clientIp(new Request("http://x/")), null);
});

test("mimeEssence drops parameters and case", () => {
  assert.equal(mimeEssence("Application/JSON; charset=utf-8"), "application/json");
  assert.equal(mimeEssence("text/plain; x=application/json"), "text/plain");
  assert.equal(mimeEssence(null), "");
});

test("isHallOrigin: same host or localhost dev; a foreign page is refused", () => {
  assert.equal(isHallOrigin("https://magi.example", "magi.example"), true);
  assert.equal(isHallOrigin("http://localhost:4177", "magi.example"), true);
  assert.equal(isHallOrigin("http://127.0.0.1:4177", "127.0.0.1:8788"), true);
  assert.equal(isHallOrigin("https://evil.example", "magi.example"), false);
  assert.equal(isHallOrigin("https://magi.example.evil.example", "magi.example"), false);
  assert.equal(isHallOrigin("null", "magi.example"), false);
  assert.equal(isHallOrigin(null, "magi.example"), true, "no Origin is not a browser page");
});

/* ── iNat proxy ──────────────────────────────────────────────────────── */

function identify(form: FormData, headers: Record<string, string> = {}): Request {
  return new Request("https://magi.example/inat/identify", { method: "POST", body: form, headers });
}

function photoForm(type = "image/jpeg"): FormData {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type }), "plant.jpg");
  return form;
}

const upstream = (async () => Response.json({ results: [] })) as typeof fetch;

test("the iNat proxy sends no CORS header and has no preflight", async () => {
  const ok = await handleIdentify(identify(photoForm()), "jwt", upstream, new RateWindow(10, 60_000));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("Access-Control-Allow-Origin"), null);
  const options = await handleIdentify(new Request("https://magi.example/inat/identify", { method: "OPTIONS" }), "jwt");
  assert.equal(options.status, 405);
  assert.equal(options.headers.get("Access-Control-Allow-Origin"), null);
});

test("the iNat proxy refuses a declared body over 5 MB before reading it", async () => {
  let is_read = false;
  const body = new ReadableStream(
    {
      pull() {
        is_read = true;
      },
    },
    { highWaterMark: 0 },
  );
  const request = new Request("https://magi.example/inat/identify", {
    method: "POST",
    body,
    headers: { "Content-Length": String(6 * 1024 * 1024), "Content-Type": "multipart/form-data; boundary=x" },
    duplex: "half",
  } as RequestInit);
  const res = await handleIdentify(request, "jwt", upstream, new RateWindow(10, 60_000));
  assert.equal(res.status, 413);
  assert.equal(is_read, false);
});

test("the iNat proxy refuses a part that is not an image", async () => {
  const res = await handleIdentify(identify(photoForm("text/html")), "jwt", upstream, new RateWindow(10, 60_000));
  assert.equal(res.status, 415);
});

test("the iNat proxy is rate-limited per IP", async () => {
  const limit = new RateWindow(IDENTIFY_IP_MAX, 60_000);
  for (let i = 0; i < IDENTIFY_IP_MAX; i++) {
    assert.equal((await handleIdentify(identify(photoForm(), { "CF-Connecting-IP": "203.0.113.1" }), "jwt", upstream, limit)).status, 200);
  }
  const blocked = await handleIdentify(identify(photoForm(), { "CF-Connecting-IP": "203.0.113.1" }), "jwt", upstream, limit);
  assert.equal(blocked.status, 429);
  assert.ok(blocked.headers.get("Retry-After"));
  assert.equal((await handleIdentify(identify(photoForm(), { "CF-Connecting-IP": "203.0.113.2" }), "jwt", upstream, limit)).status, 200);
});

/* ── the Worker hall ─────────────────────────────────────────────────── */

class FakeSocket {
  sent: string[] = [];
  attachment: unknown = null;
  send(text: string) {
    this.sent.push(text);
  }
  close() {}
  serializeAttachment(value: unknown) {
    this.attachment = value;
  }
  deserializeAttachment() {
    return this.attachment;
  }
}

function fakeHall(socket_count = 0) {
  const socket: FakeSocket[] = Array.from({ length: socket_count }, () => new FakeSocket());
  const tag = new Map<FakeSocket, string[]>();
  const ctx = {
    getWebSockets: () => socket,
    getTags: (ws: FakeSocket) => tag.get(ws) ?? [],
  } as unknown as DurableObjectState;
  const hall = new LiveHall(ctx, (headers) => new Headers(headers));
  return { hall, socket, tag };
}

function upgrade(origin: string | null): Request {
  const headers: Record<string, string> = { Upgrade: "websocket" };
  if (origin) headers.Origin = origin;
  return new Request("https://magi.example/live/socket", { headers });
}

const posePayload = (player_id: string) => ({
  type: "pose",
  player_id,
  name: "Walker",
  level: 1,
  stage: "egg",
  source: "play",
  lat: CAMPUS_CENTER.lat,
  lon: CAMPUS_CENTER.lon,
});

test("the Worker hall refuses a socket upgrade from a foreign page, and when full", async () => {
  const { hall } = fakeHall();
  const foreign = await hall.handle(upgrade("https://evil.example"), new URL("https://magi.example/live/socket"));
  assert.equal(foreign?.status, 403);
  const full = fakeHall(multiplayer.HALL_WALKER_MAX).hall;
  const res = await full.handle(upgrade("https://magi.example"), new URL("https://magi.example/live/socket"));
  assert.equal(res?.status, 503);
});

test("the Worker hall drops poses past the per-socket rate", () => {
  const { hall, socket, tag } = fakeHall(2);
  const [a, b] = socket;
  tag.set(a, ["sock-a", "203.0.113.5"]);
  tag.set(b, ["sock-b", "203.0.113.5"]);
  for (let i = 0; i < 10; i++) hall.message(a as unknown as WebSocket, JSON.stringify(posePayload("phone-a")));
  const got = b.sent.filter((t) => JSON.parse(t).type === "pose").length;
  assert.equal(got, multiplayer.POSE_PER_SECOND);
});

test("the Worker hall's polled walkers are capped and rate-limited", async () => {
  const { hall } = fakeHall();
  const post = (player_id: string, ip = "203.0.113.6") =>
    hall.handle(
      new Request("https://magi.example/live/pose", {
        method: "POST",
        body: JSON.stringify(posePayload(player_id)),
        headers: { "CF-Connecting-IP": ip },
      }),
      new URL("https://magi.example/live/pose"),
    );
  assert.equal((await post("p-1"))?.status, 200);
  assert.equal((await post("p-1"))?.status, 200);
  assert.equal((await post("p-1"))?.status, 429);
  /* One address per walker, so the per-IP seat cap stays out of the way. */
  for (let i = 2; i <= multiplayer.HALL_WALKER_MAX; i++) assert.equal((await post(`p-${i}`, `198.18.${i >> 8}.${i & 255}`))?.status, 200);
  assert.equal((await post("one-too-many", "198.19.0.1"))?.status, 503);
});

/* ── the LAN hall ────────────────────────────────────────────────────── */

class RawSocket extends EventEmitter {
  written: Buffer[] = [];
  is_ended = false;
  write(buf: Buffer | string) {
    this.written.push(Buffer.from(buf));
    return true;
  }
  end(buf?: string) {
    if (buf) this.written.push(Buffer.from(buf));
    this.is_ended = true;
    this.emit("close");
  }
  setNoDelay() {}
}

function maskedFrame(payload: Buffer, opcode: number, is_fin: boolean): Buffer {
  const mask = Buffer.from([1, 2, 3, 4]);
  const body = Buffer.from(payload);
  for (let i = 0; i < body.length; i++) body[i] ^= mask[i % 4];
  const head =
    body.length < 126
      ? Buffer.from([(is_fin ? 0x80 : 0) | opcode, 0x80 | body.length])
      : Buffer.from([(is_fin ? 0x80 : 0) | opcode, 0x80 | 126, body.length >> 8, body.length & 0xff]);
  return Buffer.concat([head, mask, body]);
}

function lanUpgrade(hall: ReturnType<typeof createHall>) {
  const raw = new RawSocket();
  const req = { url: "/live/socket", headers: { "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==", upgrade: "websocket" } };
  assert.equal(hall.upgrade(req, raw), true);
  return raw;
}

test("the LAN hall closes a socket whose fragmented message outgrows the cap", () => {
  const hall = createHall(multiplayer);
  const raw = lanUpgrade(hall);
  const chunk = Buffer.alloc(16 * 1024, 0x61);
  const frame_count = Math.ceil(MAX_MESSAGE / chunk.length) + 1;
  for (let i = 0; i < frame_count && !raw.is_ended; i++) {
    raw.emit("data", maskedFrame(chunk, i === 0 ? 0x1 : 0x0, false));
  }
  assert.equal(raw.is_ended, true);
});

test("the LAN hall refuses a socket when full", () => {
  const hall = createHall({ ...multiplayer, HALL_WALKER_MAX: 1 });
  lanUpgrade(hall);
  const raw = lanUpgrade(hall);
  assert.match(Buffer.concat(raw.written).toString(), /^HTTP\/1\.1 503/);
});

test("the LAN hall drops poses past the per-socket rate", () => {
  const hall = createHall(multiplayer);
  const a = lanUpgrade(hall);
  const b = lanUpgrade(hall);
  b.written = [];
  for (let i = 0; i < 10; i++) a.emit("data", maskedFrame(Buffer.from(JSON.stringify(posePayload("lan-a"))), 0x1, true));
  const pose_frame = b.written.filter((buf) => buf.toString().includes('"type":"pose"')).length;
  assert.equal(pose_frame, multiplayer.POSE_PER_SECOND);
});
