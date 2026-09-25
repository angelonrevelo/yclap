/**
 * The networking pass: the handset's cross-port page (VITE_SYNC_URL on the
 * LAN) is a page of this box, the preflight answers only allowed pages, the
 * per-IP socket seat caps (tight on the LAN, loose on the Worker), 413 sent
 * before the socket drops, an empty address is not loopback, haptics wait for
 * a gesture, and two players on one fix do not stack when they take the stick.
 */
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { isHallOrigin, isOwnPage, isPrivateHostname, pageCorsOf, pageOriginListOf } from "../src/rate-limit.ts";
import { LiveHall } from "../worker/live-socket.ts";
import { createHall } from "../server/hall.mjs";
import { isLoopback, isOwnPageReq, readJson, remoteIp } from "../server/request.mjs";
import * as multiplayer from "../src/multiplayer.ts";
import { hasUserActivation } from "../src/haptic.ts";
import { STICK_START, START_SPREAD_MAX_M, isWalkable, stickSeedOf } from "../src/play-walk.ts";
import { distanceMeter } from "../src/geo.ts";
import { syncJournal } from "../src/sync.ts";

/* ── Origin: the LAN handset path ────────────────────────────────────── */

test("isPrivateHostname: loopback, RFC 1918, CGNAT, link-local, ULA and .local only", () => {
  for (const name of ["localhost", "127.0.0.1", "10.0.0.4", "172.16.0.1", "172.31.9.9", "192.168.1.5", "100.100.1.2", "169.254.3.4", "[::1]", "[fd12:3456::1]", "[fe80::1]", "gelos-mac.local"]) {
    assert.equal(isPrivateHostname(name), true, name);
  }
  for (const name of ["magi.example", "8.8.8.8", "172.32.0.1", "100.128.0.1", "192.169.1.1", "[2606:4700::1]", "local.example"]) {
    assert.equal(isPrivateHostname(name), false, name);
  }
});

test("a page on another port of the same LAN host is this box's page; a public host's other port is not", () => {
  assert.equal(isHallOrigin("http://192.168.1.5:4177", "192.168.1.5:8788"), true, "the handset build on :4177");
  assert.equal(isHallOrigin("http://gelos-mac.local:4177", "gelos-mac.local:8788"), true);
  assert.equal(isHallOrigin("http://192.168.1.6:4177", "192.168.1.5:8788"), false, "another box on the wifi");
  assert.equal(isHallOrigin("https://magi.example:4177", "magi.example:8788"), false, "public host: port matters");
  assert.equal(isHallOrigin("https://evil.example", "192.168.1.5:8788"), false);
  assert.equal(isHallOrigin("https://preview.example", "magi.example", ["https://preview.example"]), true, "HALL_PAGE_ORIGIN");
});

test("HALL_PAGE_ORIGIN parses to origins and drops junk", () => {
  assert.deepEqual(pageOriginListOf(" https://a.example/path , http://b.example:8080,nope,, "), ["https://a.example", "http://b.example:8080"]);
  assert.deepEqual(pageOriginListOf(undefined), []);
});

test("isOwnPage: an allow-listed origin passes even cross-site; the LAN cross-port page passes same-site", () => {
  const post = (url: string, headers: Record<string, string>) => new Request(url, { method: "POST", headers });
  assert.equal(isOwnPage(post("https://magi.example/live/pose", { Origin: "https://preview.example", "Sec-Fetch-Site": "cross-site" }), undefined, ["https://preview.example"]), true);
  assert.equal(isOwnPage(post("https://magi.example/live/pose", { Origin: "https://preview.example", "Sec-Fetch-Site": "cross-site" })), false);
  assert.equal(isOwnPageReq({ headers: { host: "192.168.1.5:8788", origin: "http://192.168.1.5:4177", "sec-fetch-site": "same-site" } }), true);
});

test("pageCorsOf answers an allowed cross-origin page with its own origin, and nobody else", () => {
  const lan = pageCorsOf("http://192.168.1.5:4177", "192.168.1.5:8788");
  assert.equal(lan["Access-Control-Allow-Origin"], "http://192.168.1.5:4177");
  assert.match(lan["Access-Control-Allow-Headers"], /content-type/i);
  assert.equal(lan.Vary, "Origin");
  assert.deepEqual(pageCorsOf("https://evil.example", "192.168.1.5:8788"), {});
  assert.deepEqual(pageCorsOf(null, "192.168.1.5:8788"), {});
  assert.deepEqual(pageCorsOf("http://192.168.1.5:8788", "192.168.1.5:8788"), {}, "same origin needs none");
});

/* ── the Worker hall: preflight + per-IP socket cap ──────────────────── */

function workerHall(socket_ip: string[] = [], page_origin: string[] = []) {
  const socket = socket_ip.map((ip) => ({ ip }));
  const ctx = {
    getWebSockets: () => socket,
    getTags: (ws: { ip: string }) => ["id", ws.ip],
  } as unknown as DurableObjectState;
  return new LiveHall(ctx, (headers) => new Headers(headers), page_origin);
}

test("the Worker's /live/pose preflight answers an HALL_PAGE_ORIGIN page only", async () => {
  const hall = workerHall([], ["https://preview.example"]);
  const preflight = (origin: string) =>
    hall.handle(new Request("https://magi.example/live/pose", { method: "OPTIONS", headers: { Origin: origin } }), new URL("https://magi.example/live/pose"));
  assert.equal((await preflight("https://preview.example"))?.headers.get("Access-Control-Allow-Origin"), "https://preview.example");
  assert.equal((await preflight("https://evil.example"))?.headers.get("Access-Control-Allow-Origin"), null);
});

test("the Worker hall caps sockets per IP at EDGE_IP_SOCKET_MAX — a booth's shared IP, so generous", async () => {
  assert.ok(multiplayer.EDGE_IP_SOCKET_MAX >= 40 && multiplayer.EDGE_IP_SOCKET_MAX < multiplayer.HALL_WALKER_MAX);
  assert.ok(multiplayer.EDGE_POLL_IP_WALKER_MAX >= 40 && multiplayer.EDGE_POLL_IP_WALKER_MAX < multiplayer.HALL_WALKER_MAX);
  const hall = workerHall(Array.from({ length: multiplayer.EDGE_IP_SOCKET_MAX }, () => "203.0.113.9"));
  const res = await hall.handle(
    new Request("https://magi.example/live/socket", { headers: { Upgrade: "websocket", "CF-Connecting-IP": "203.0.113.9" } }),
    new URL("https://magi.example/live/socket"),
  );
  assert.equal(res?.status, 429);
});

/* ── the LAN hall: per-IP socket cap ─────────────────────────────────── */

class RawSocket extends EventEmitter {
  written: Buffer[] = [];
  write(buf: Buffer | string) {
    this.written.push(Buffer.from(buf));
    return true;
  }
  end(buf?: string) {
    if (buf) this.written.push(Buffer.from(buf));
    this.emit("close");
  }
  setNoDelay() {}
}

test("the LAN hall seats at most LAN_IP_SOCKET_MAX sockets per IP; a local script has no cap", () => {
  const hall = createHall(multiplayer);
  const open = (ip: string | null) => {
    const raw = new RawSocket();
    const headers = { "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==", upgrade: "websocket", host: "192.168.1.5:8788" };
    hall.upgrade({ url: "/live/socket", headers }, raw, ip);
    return Buffer.concat(raw.written).toString().slice(0, 12);
  };
  for (let i = 0; i < multiplayer.LAN_IP_SOCKET_MAX; i++) assert.equal(open("192.168.1.60"), "HTTP/1.1 101");
  assert.equal(open("192.168.1.60"), "HTTP/1.1 429");
  assert.equal(open("192.168.1.61"), "HTTP/1.1 101", "another phone still gets in");
  assert.equal(open(null), "HTTP/1.1 101");
});

/* ── 413 before the drop; empty address ──────────────────────────────── */

test("readJson given the response answers 413 with Connection: close BEFORE destroying the request", async () => {
  const req = new PassThrough();
  const seen: string[] = [];
  const res = {
    headersSent: false,
    destroyed: false,
    status: 0,
    header: {} as Record<string, string>,
    writeHead(status: number, header: Record<string, string>) {
      this.status = status;
      this.header = header;
      this.headersSent = true;
    },
    end(_body: string, done: () => void) {
      seen.push(`end destroyed=${req.destroyed}`);
      setImmediate(done);
    },
  };
  const reading = readJson(req, 1000, res);
  req.write(Buffer.alloc(1200, 0x61));
  await assert.rejects(reading, (e: { status?: number }) => e.status === 413);
  assert.equal(res.status, 413);
  assert.equal(res.header.Connection, "close");
  await new Promise((done) => setImmediate(done));
  assert.deepEqual(seen, ["end destroyed=false"]);
  assert.equal(req.destroyed, true, "dropped once the answer is out");
});

test("readJson refuses a declared Content-Length over the cap before reading", async () => {
  const req = Object.assign(new PassThrough(), { headers: { "content-length": "5000" } });
  await assert.rejects(readJson(req, 1000), (e: { status?: number }) => e.status === 413);
  assert.equal(req.destroyed, true);
});

test("an empty address is not loopback, and never unlocks X-Forwarded-For", () => {
  assert.equal(isLoopback(""), false);
  assert.equal(isLoopback(undefined), false);
  assert.equal(isLoopback("127.0.0.1"), true);
  assert.equal(remoteIp({ socket: {}, headers: { "x-forwarded-for": "192.168.1.99" } }), null);
  assert.equal(remoteIp({ socket: { remoteAddress: "127.0.0.1" }, headers: { "x-forwarded-for": "" } }), null);
});

/* ── the client ──────────────────────────────────────────────────────── */

test("syncJournal says too large on a 413, not offline", async () => {
  const player = { player_id: "p-1", name: "Walker", join_code: "ABCDEF" };
  const summary = { stage: "egg", level: 1, total_points: 0, streak_weeks: 0 };
  const answer = (status: number) => (async () => new Response("{}", { status })) as typeof fetch;
  assert.equal((await syncJournal(player, [], summary, answer(413), "http://x")).status, "too_large");
  assert.deepEqual(await syncJournal(player, [], summary, answer(500), "http://x"), { status: "refused", http_status: 500 });
  const thrown = (async () => {
    throw new TypeError("Failed to fetch");
  }) as typeof fetch;
  assert.equal((await syncJournal(player, [], summary, thrown, "http://x")).status, "offline");
  const world = { find: [], walker: [] };
  const ok = (async () => Response.json({ merged: 0, world })) as typeof fetch;
  assert.equal((await syncJournal(player, [], summary, ok, "http://x")).status, "ok");
  assert.equal((await syncJournal(player, [], summary, ok, null)).status, "none");
});

test("haptics wait for the first user gesture", () => {
  assert.equal(hasUserActivation({ userActivation: { hasBeenActive: false } }), false);
  assert.equal(hasUserActivation({ userActivation: { hasBeenActive: true } }), true);
  assert.equal(hasUserActivation({}), false, "no userActivation and no tap yet");
  assert.equal(hasUserActivation(undefined), false);
});

test("two players switching to the stick on one fix each take their own walkable ring spot", () => {
  const a = stickSeedOf(STICK_START, "player-a");
  const b = stickSeedOf(STICK_START, "player-b");
  assert.ok(a && b);
  assert.ok(isWalkable(a) && isWalkable(b));
  assert.notDeepEqual(a, b);
  assert.ok(distanceMeter(a, STICK_START) <= START_SPREAD_MAX_M + 0.5);
  assert.deepEqual(stickSeedOf(STICK_START, "player-a"), a, "same id, same spot");
  assert.equal(stickSeedOf(null, "player-a"), null);
  assert.equal(stickSeedOf({ lat: 0, lon: 0 }, "player-a"), null, "a fix off campus keeps the stick start");
});
