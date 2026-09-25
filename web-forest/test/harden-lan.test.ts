/**
 * The second hardening pass: Origin on the LAN hall upgrade and on the POSTs
 * that spend something, byte caps that hold for chunked bodies, the per-IP
 * seat cap on polled walkers, and the LAN server's trust in X-Forwarded-For.
 */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { BodyTooLarge, RateWindow, capStream, isOwnPage } from "../src/rate-limit.ts";
import { handleIdentify, MAX_FORM_BYTE } from "../worker/inat.ts";
import { LiveHall } from "../worker/live-socket.ts";
import { createHall } from "../server/hall.mjs";
import { isOwnPageReq, readJson, remoteIp, webRequestOf } from "../server/request.mjs";
import * as multiplayer from "../src/multiplayer.ts";
import { CAMPUS_CENTER } from "../src/geo.ts";

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

/* ── isOwnPage ───────────────────────────────────────────────────────── */

test("isOwnPage refuses another site's Origin or a cross-site fetch, and lets its own page and non-browsers in", () => {
  const at = (headers: Record<string, string>) => new Request("https://magi.example/inat/identify", { method: "POST", headers });
  assert.equal(isOwnPage(at({ Origin: "https://magi.example", "Sec-Fetch-Site": "same-origin" })), true);
  assert.equal(isOwnPage(at({ Origin: "http://localhost:4177" })), true, "localhost dev");
  assert.equal(isOwnPage(at({})), true, "no Origin: a script, not a page");
  assert.equal(isOwnPage(at({ Origin: "https://evil.example" })), false);
  assert.equal(isOwnPage(at({ "Sec-Fetch-Site": "cross-site" })), false);
  assert.equal(isOwnPage(at({ Origin: "null" })), false, "a sandboxed frame");
});

/* ── LAN hall: Origin on the upgrade ─────────────────────────────────── */

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

function lanUpgrade(hall: ReturnType<typeof createHall>, origin?: string) {
  const raw = new RawSocket();
  const headers: Record<string, string> = {
    "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==",
    upgrade: "websocket",
    host: "192.168.1.5:4177",
  };
  if (origin) headers.origin = origin;
  assert.equal(hall.upgrade({ url: "/live/socket", headers }, raw), true);
  return Buffer.concat(raw.written).toString();
}

test("the LAN hall refuses a socket upgrade from a foreign page, like the Worker", () => {
  const hall = createHall(multiplayer);
  assert.match(lanUpgrade(hall, "https://evil.example"), /^HTTP\/1\.1 403/);
  assert.match(lanUpgrade(hall, "http://192.168.1.5:4177"), /^HTTP\/1\.1 101/);
  assert.match(lanUpgrade(hall, "http://localhost:4177"), /^HTTP\/1\.1 101/);
});

/* ── LAN readJson: overflow stops reading ────────────────────────────── */

test("readJson parses a body, and answers bad JSON as a 400", async () => {
  const ok = new PassThrough();
  const read_ok = readJson(ok);
  ok.end('{"a":1}');
  assert.deepEqual(await read_ok, { a: 1 });
  const bad = new PassThrough();
  const read_bad = readJson(bad);
  bad.end("{nope");
  await assert.rejects(read_bad, (e: { status?: number }) => e.status === 400);
});

test("readJson past its cap stops listening, rejects 413 and destroys the request", async () => {
  const req = new PassThrough();
  const reading = readJson(req, 1000);
  req.write(Buffer.alloc(600, 0x61));
  req.write(Buffer.alloc(600, 0x61));
  await assert.rejects(reading, (e: { status?: number }) => e.status === 413);
  assert.equal(req.listenerCount("data"), 0, "no listener left to keep appending");
  assert.equal(req.destroyed, true);
});

/* ── byte caps that hold for chunked bodies ──────────────────────────── */

test("capStream fails past its cap and cancels its source", async () => {
  let is_cancelled = false;
  let n = 0;
  const source = new ReadableStream<Uint8Array>({
    pull(controller) {
      n += 1;
      controller.enqueue(new Uint8Array(400));
    },
    cancel() {
      is_cancelled = true;
    },
  });
  const reader = capStream(source, 1000).getReader();
  await reader.read();
  await reader.read();
  await assert.rejects(reader.read(), (e) => e instanceof BodyTooLarge);
  assert.equal(is_cancelled, true);
  assert.ok(n <= 4, "stopped pulling");
});

const upstream_ok = (async () => Response.json({ results: [] })) as typeof fetch;

/** A multipart body with no Content-Length that keeps going past `byte`. */
function chunkedForm(byte: number): ReadableStream<Uint8Array> {
  const head = new TextEncoder().encode(
    '--x\r\nContent-Disposition: form-data; name="image"; filename="p.jpg"\r\nContent-Type: image/jpeg\r\n\r\n',
  );
  let sent = 0;
  let is_head = false;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!is_head) {
        is_head = true;
        controller.enqueue(head);
        return;
      }
      if (sent >= byte) {
        controller.enqueue(new TextEncoder().encode("\r\n--x--\r\n"));
        controller.close();
        return;
      }
      sent += 256 * 1024;
      controller.enqueue(new Uint8Array(256 * 1024));
    },
  });
}

test("the iNat proxy cuts a chunked body past 5 MB before formData(), without a declared length", async () => {
  let is_upstream = false;
  const upstream = (async () => {
    is_upstream = true;
    return Response.json({ results: [] });
  }) as typeof fetch;
  const request = new Request("https://magi.example/inat/identify", {
    method: "POST",
    body: chunkedForm(MAX_FORM_BYTE + 1024 * 1024),
    headers: { "Content-Type": "multipart/form-data; boundary=x" },
    duplex: "half",
  } as RequestInit);
  assert.equal(request.headers.get("Content-Length"), null);
  const res = await handleIdentify(request, "jwt", upstream, new RateWindow(10, 60_000));
  assert.equal(res.status, 413);
  assert.equal(is_upstream, false);
});

test("the iNat proxy refuses a foreign page's no-cors POST before it spends the token", async () => {
  let is_upstream = false;
  const upstream = (async () => {
    is_upstream = true;
    return Response.json({ results: [] });
  }) as typeof fetch;
  const form = () => {
    const f = new FormData();
    f.append("image", new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }), "plant.jpg");
    return f;
  };
  const post = (headers: Record<string, string>) =>
    handleIdentify(
      new Request("https://magi.example/inat/identify", { method: "POST", body: form(), headers }),
      "jwt",
      upstream,
      new RateWindow(10, 60_000),
    );
  assert.equal((await post({ Origin: "https://evil.example" })).status, 403);
  assert.equal((await post({ "Sec-Fetch-Site": "cross-site" })).status, 403);
  assert.equal(is_upstream, false);
  assert.equal((await post({ Origin: "https://magi.example", "Sec-Fetch-Site": "same-origin" })).status, 200);
  assert.equal(is_upstream, true);
});

/** A node IncomingMessage stand-in: a stream with the request fields. */
function fakeReq(fields: { method?: string; url?: string; headers?: Record<string, string>; address?: string }) {
  const req = new PassThrough() as PassThrough & {
    method: string;
    url: string;
    headers: Record<string, string>;
    socket: { remoteAddress: string };
  };
  req.method = fields.method ?? "POST";
  req.url = fields.url ?? "/inat/identify";
  req.headers = fields.headers ?? {};
  req.socket = { remoteAddress: fields.address ?? "192.168.1.20" };
  return req;
}

test("on the LAN a chunked iNat upload past the cap destroys the node request", async () => {
  const req = fakeReq({
    headers: { host: "192.168.1.5:8788", "content-type": "multipart/form-data; boundary=x", "transfer-encoding": "chunked" },
  });
  const request = webRequestOf(req, MAX_FORM_BYTE);
  assert.equal(request.headers.get("cf-connecting-ip"), "192.168.1.20");
  assert.equal(new URL(request.url).host, "192.168.1.5:8788", "the Host the browser asked for");
  const pending = handleIdentify(request, "jwt", upstream_ok, new RateWindow(10, 60_000));
  const reader = chunkedForm(MAX_FORM_BYTE + 1024 * 1024).getReader();
  for (let r = await reader.read(); !r.done && !req.destroyed; r = await reader.read()) {
    if (!req.write(r.value)) await new Promise((done) => setTimeout(done, 0));
  }
  const res = await pending;
  assert.equal(res.status, 413);
  assert.equal(req.destroyed, true);
});

/* ── LAN remoteIp: X-Forwarded-For only from the loopback proxy ──────── */

test("remoteIp trusts X-Forwarded-For only from loopback, and only its last entry", () => {
  const ipOf = (address: string, xff?: string) =>
    remoteIp({ socket: { remoteAddress: address }, headers: xff ? { "x-forwarded-for": xff } : {} });
  assert.equal(ipOf("::ffff:192.168.1.30"), "192.168.1.30");
  assert.equal(ipOf("192.168.1.30", "10.9.9.9"), "192.168.1.30", "a phone cannot pick its own address");
  assert.equal(ipOf("127.0.0.1", "192.168.1.31"), "192.168.1.31", "behind the Vite proxy");
  assert.equal(ipOf("::1", "6.6.6.6, 192.168.1.32"), "192.168.1.32", "a spoofed first entry is ignored");
  assert.equal(ipOf("127.0.0.1"), null, "a local script: no per-IP limit");
  assert.equal(ipOf("127.0.0.1", "127.0.0.1"), null);
});

test("isOwnPageReq applies the same rule to a node request", () => {
  const at = (headers: Record<string, string>) => isOwnPageReq({ headers: { host: "192.168.1.5:4177", ...headers } });
  assert.equal(at({ origin: "http://192.168.1.5:4177" }), true);
  assert.equal(at({ origin: "https://evil.example" }), false);
  assert.equal(at({ "sec-fetch-site": "cross-site" }), false);
  assert.equal(at({}), true);
});

/* ── the per-IP seat cap on polled walkers ───────────────────────────── */

function workerHall() {
  const ctx = { getWebSockets: () => [], getTags: () => [] } as unknown as DurableObjectState;
  const cors = (headers?: HeadersInit) => {
    const h = new Headers(headers);
    h.set("Access-Control-Allow-Origin", "*");
    return h;
  };
  return new LiveHall(ctx, cors);
}

const workerPose = (hall: LiveHall, walker: string, ip: string, origin?: string) => {
  const headers: Record<string, string> = { "CF-Connecting-IP": ip };
  if (origin) headers.Origin = origin;
  return hall.handle(
    new Request("https://magi.example/live/pose", { method: "POST", body: JSON.stringify(posePayload(walker)), headers }),
    new URL("https://magi.example/live/pose"),
  );
};

test("the Worker hall holds at most POLL_IP_WALKER_MAX polled walkers per IP", async () => {
  const hall = workerHall();
  const max = multiplayer.POLL_IP_WALKER_MAX;
  for (let i = 0; i < max; i++) assert.equal((await workerPose(hall, `fake-${i}`, "203.0.113.70"))?.status, 200);
  assert.equal((await workerPose(hall, "fake-extra", "203.0.113.70"))?.status, 429);
  assert.equal((await workerPose(hall, "real-phone", "198.51.100.70"))?.status, 200, "another address still gets a seat");
});

test("the Worker hall's /live/pose takes its own page only and sends no CORS header", async () => {
  const hall = workerHall();
  const foreign = await workerPose(hall, "w-1", "203.0.113.71", "https://evil.example");
  assert.equal(foreign?.status, 403);
  const own = await workerPose(hall, "w-1", "203.0.113.71", "https://magi.example");
  assert.equal(own?.status, 200);
  assert.equal(own?.headers.get("Access-Control-Allow-Origin"), null);
  const preflight = await hall.handle(
    new Request("https://magi.example/live/pose", { method: "OPTIONS" }),
    new URL("https://magi.example/live/pose"),
  );
  assert.equal(preflight?.headers.get("Access-Control-Allow-Origin"), null);
});

test("the LAN hall's polled walkers have a per-IP seat cap and a per-IP pose rate", () => {
  const hall = createHall(multiplayer);
  const max = multiplayer.POLL_IP_WALKER_MAX;
  for (let i = 0; i < max; i++) assert.equal(hall.pose(posePayload(`lan-fake-${i}`), "192.168.1.40").status, 200);
  assert.equal(hall.pose(posePayload("lan-fake-extra"), "192.168.1.40").status, 429);
  assert.equal(hall.pose(posePayload("lan-real"), "192.168.1.41").status, 200);

  const rate = createHall({ ...multiplayer, POSE_IP_PER_SECOND: 3, POLL_IP_WALKER_MAX: 10 });
  const status = Array.from({ length: 5 }, (_, i) => rate.pose(posePayload(`rate-${i}`), "192.168.1.42").status);
  assert.deepEqual(status, [200, 200, 200, 429, 429]);
  assert.equal(rate.pose(posePayload("rate-x"), "192.168.1.43").status, 200, "other addresses unaffected");
  assert.equal(rate.pose({ nope: true }, null).status, 400);
});
