import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { CAMPUS_CENTER, distanceMeter } from "../src/geo.ts";
import {
  applyHall,
  freshFindOf,
  GLIDE_MAX_MS,
  isGliding,
  isNearbyFind,
  openHall,
  positionOf,
  pruneTrack,
  receivePose,
  rosterOf,
  sanitizePose,
  SEND_HEARTBEAT_MS,
  SEND_MIN_MS,
  shouldSend,
  SNAP_M,
  STALE_MS,
  walkerIdOf,
  type HallMessage,
  type Pose,
  type Track,
} from "../src/multiplayer.ts";
import { acceptKeyOf, createHall, decodeFrame, encodeFrame } from "../server/hall.mjs";
import * as multiplayer from "../src/multiplayer.ts";

/**
 * The hall's contract: what may be shared, how often it is sent, how a remote
 * walker glides instead of teleporting, and when they are forgotten.
 */

/** A point `meter` north of campus centre. */
function offsetFromCenter(meter: number) {
  return { lat: CAMPUS_CENTER.lat + meter / 111_320, lon: CAMPUS_CENTER.lon };
}

function pose(over: Partial<Pose> = {}): Pose {
  return {
    walker_id: "w1",
    name: "Narra Walker 1",
    level: 3,
    stage: "sprout",
    lat: CAMPUS_CENTER.lat,
    lon: CAMPUS_CENTER.lon,
    source: "play",
    at: 1_000,
    ...over,
  };
}

/* ── what is shared ─────────────────────────────────────────────────────── */

test("sanitizePose keeps only name, level, stage, position and source — never the player_id", () => {
  const row = sanitizePose(
    { player_id: "secret-uuid", name: "  Dao  ", level: 4.7, stage: "tree", lat: CAMPUS_CENTER.lat, lon: CAMPUS_CENTER.lon, source: "gps", note: "x", photo: "y" },
    5,
  );
  assert.ok(row);
  assert.deepEqual(Object.keys(row).sort(), ["at", "lat", "level", "lon", "name", "source", "stage", "walker_id"]);
  assert.equal(row.name, "Dao");
  assert.equal(row.level, 4);
  assert.equal(row.walker_id, walkerIdOf("secret-uuid"));
  assert.ok(!JSON.stringify(row).includes("secret-uuid"));
});

test("sanitizePose refuses a position outside the campus frame, and junk", () => {
  assert.equal(sanitizePose({ player_id: "a", lat: 14.55, lon: 121.02 }, 0), null, "the showcase hall is off campus");
  assert.equal(sanitizePose({ player_id: "a", lat: "x", lon: 1 }, 0), null);
  assert.equal(sanitizePose({ lat: CAMPUS_CENTER.lat, lon: CAMPUS_CENTER.lon }, 0), null);
  const odd = sanitizePose({ player_id: "a", lat: CAMPUS_CENTER.lat, lon: CAMPUS_CENTER.lon, stage: "dragon", source: "teleport" }, 0);
  assert.equal(odd?.stage, "egg");
  assert.equal(odd?.source, "play");
});

test("walkerIdOf is stable and distinct", () => {
  assert.equal(walkerIdOf("abc"), walkerIdOf("abc"));
  assert.notEqual(walkerIdOf("abc"), walkerIdOf("abd"));
});

test("freshFindOf announces only unlocated-excluded, never-seen finds, under the hashed id", () => {
  const row = [
    { sighting_id: "s1", species_code: "narra", common_name: "Narra", lat: 14.64, lon: 121.078, entry_kind: "badge", created_at: "t" },
    { sighting_id: "s2", species_code: "dao", common_name: "Dao", lat: 14.64, lon: 121.078, entry_kind: "badge", created_at: "t" },
    { sighting_id: "s3", species_code: "ipil", common_name: "Ipil", lat: null, lon: null, entry_kind: "badge", created_at: "t" },
  ];
  const fresh = freshFindOf(new Set(["s1"]), row, { player_id: "p-1", name: "Molave Walker" });
  assert.deepEqual(fresh.map((f) => f.sighting_id), ["s2"]);
  assert.equal(fresh[0].player_id, walkerIdOf("p-1"));
  assert.equal(fresh[0].player_name, "Molave Walker");
});

/* ── staleness ──────────────────────────────────────────────────────────── */

test("rosterOf drops walkers unheard for STALE_MS and keeps the newest pose per walker", () => {
  const now = 100_000;
  const row = rosterOf(
    [
      pose({ walker_id: "a", at: now - 1_000, lat: CAMPUS_CENTER.lat }),
      pose({ walker_id: "a", at: now - 500, lat: CAMPUS_CENTER.lat + 0.0001 }),
      pose({ walker_id: "b", at: now - STALE_MS - 1 }),
      null,
      pose({ walker_id: "c", at: now - STALE_MS }),
    ],
    now,
  );
  assert.deepEqual(row.map((p) => p.walker_id), ["a", "c"]);
  assert.equal(row[0].at, now - 500);
});

test("pruneTrack forgets stale walkers and returns the same map when nothing changed", () => {
  const fresh = receivePose(undefined, pose({ walker_id: "a" }), 10_000);
  const old = receivePose(undefined, pose({ walker_id: "b" }), 1_000);
  const track = new Map<string, Track>([["a", fresh], ["b", old]]);
  const next = pruneTrack(track, 1_000 + STALE_MS + 1);
  assert.deepEqual([...next.keys()], ["a"]);
  assert.equal(pruneTrack(next, 10_001), next);
});

/* ── throttle ───────────────────────────────────────────────────────────── */

test("shouldSend: first pose always, then at most once a second", () => {
  const here = { ...CAMPUS_CENTER, level: 2, stage: "egg", name: "A" };
  assert.equal(shouldSend(null, here, 0), true);
  const far = { ...offsetFromCenter(50), level: 2, stage: "egg", name: "A" };
  const last = { ...here, at: 0 };
  assert.equal(shouldSend(last, far, SEND_MIN_MS - 1), false, "a 50 m jump still waits for the second");
  assert.equal(shouldSend(last, far, SEND_MIN_MS), true);
});

test("shouldSend: a sub-3 m shuffle waits for the heartbeat; a level-up does not", () => {
  const last = { ...CAMPUS_CENTER, level: 2, stage: "egg", name: "A", at: 0 };
  const shuffle = { ...offsetFromCenter(2), level: 2, stage: "egg", name: "A" };
  assert.ok(distanceMeter(last, shuffle) < 3);
  assert.equal(shouldSend(last, shuffle, 5_000), false);
  assert.equal(shouldSend(last, shuffle, SEND_HEARTBEAT_MS), true);
  assert.equal(shouldSend(last, { ...shuffle, level: 3 }, 1_500), true);
  assert.equal(shouldSend(last, { ...offsetFromCenter(4), level: 2, stage: "egg", name: "A" }, 1_500), true);
});

/* ── interpolation ──────────────────────────────────────────────────────── */

test("a first pose is drawn exactly where it is — nothing to glide from", () => {
  const t = receivePose(undefined, pose(), 0);
  assert.deepEqual(positionOf(t, 0), CAMPUS_CENTER);
  assert.equal(isGliding(t, 0), false);
});

test("the next pose glides from the drawn spot to the new one, never jumping", () => {
  const a = receivePose(undefined, pose({ at: 0 }), 0);
  const target = offsetFromCenter(10);
  const b = receivePose(a, pose({ at: 1_000, ...target }), 1_000);
  assert.equal(b.duration, 1_000, "glides for as long as the gap between poses");
  assert.deepEqual(positionOf(b, 1_000), CAMPUS_CENTER, "starts where it was drawn");
  const mid = distanceMeter(CAMPUS_CENTER, positionOf(b, 1_500));
  assert.ok(mid > 2 && mid < 10, `mid-glide at ${mid} m`);
  assert.ok(distanceMeter(positionOf(b, 2_000), target) < 0.01, "lands on the pose");
  assert.equal(isGliding(b, 1_999), true);
  assert.equal(isGliding(b, 2_000), false);
  /* Monotonic: every frame closer to the target than the last. */
  let prev = Infinity;
  for (let t = 1_000; t <= 2_000; t += 50) {
    const d = distanceMeter(positionOf(b, t), target);
    assert.ok(d <= prev + 1e-9);
    prev = d;
  }
});

test("a pose that lands mid-glide bends the path from where the walker is drawn", () => {
  const a = receivePose(undefined, pose({ at: 0 }), 0);
  const b = receivePose(a, pose({ at: 1_000, ...offsetFromCenter(10) }), 1_000);
  const drawn = positionOf(b, 1_400);
  const c = receivePose(b, pose({ at: 1_400, ...offsetFromCenter(20) }), 1_400);
  assert.ok(distanceMeter(positionOf(c, 1_400), drawn) < 1e-6, "no jump at the hand-off");
});

test("a late pose glides for at most GLIDE_MAX_MS, and a teleport snaps", () => {
  const a = receivePose(undefined, pose({ at: 0 }), 0);
  const late = receivePose(a, pose({ at: 9_000, ...offsetFromCenter(10) }), 9_000);
  assert.equal(late.duration, GLIDE_MAX_MS);
  const far = offsetFromCenter(SNAP_M + 50);
  const snap = receivePose(a, pose({ at: 1_000, ...far }), 1_000);
  assert.equal(snap.duration, 0);
  assert.deepEqual(positionOf(snap, 1_000), far);
});

test("heading follows the move: walking north reads as 0°, east as 90°", () => {
  const a = receivePose(undefined, pose({ at: 0 }), 0);
  const north = receivePose(a, pose({ at: 1_000, ...offsetFromCenter(10) }), 1_000);
  assert.ok(Math.abs(north.heading) < 1);
  const east = receivePose(a, pose({ at: 1_000, lat: CAMPUS_CENTER.lat, lon: CAMPUS_CENTER.lon + 0.0001 }), 1_000);
  assert.ok(Math.abs(east.heading - 90) < 1);
});

/* ── applying hall messages ─────────────────────────────────────────────── */

test("applyHall: roster is authoritative, skips me, and ignores a repeated pose", () => {
  const me = "me";
  let track = new Map<string, Track>();
  track = applyHall(track, { type: "roster", walker: [pose({ walker_id: "a" }), pose({ walker_id: me })], find: [], server_time: 0 }, me, 0);
  assert.deepEqual([...track.keys()], ["a"]);
  const first = track.get("a");
  track = applyHall(track, { type: "roster", walker: [pose({ walker_id: "a" })], find: [], server_time: 0 }, me, 5_000);
  assert.equal(track.get("a"), first, "same pose re-polled keeps its clock");
  track = applyHall(track, { type: "pose", walker: pose({ walker_id: "b" }) }, me, 5_000);
  assert.deepEqual([...track.keys()].sort(), ["a", "b"]);
  track = applyHall(track, { type: "gone", walker_id: "a" }, me, 5_000);
  assert.deepEqual([...track.keys()], ["b"]);
  track = applyHall(track, { type: "roster", walker: [], find: [], server_time: 0 }, me, 6_000);
  assert.equal(track.size, 0);
});

test("isNearbyFind: somebody else's find within radius only", () => {
  const find = { player_id: "other", ...offsetFromCenter(80) };
  assert.equal(isNearbyFind(find, { walker_id: "me", at: CAMPUS_CENTER }), true);
  assert.equal(isNearbyFind({ ...find, player_id: "me" }, { walker_id: "me", at: CAMPUS_CENTER }), false);
  assert.equal(isNearbyFind({ player_id: "other", ...offsetFromCenter(400) }, { walker_id: "me", at: CAMPUS_CENTER }), false);
  assert.equal(isNearbyFind(find, { walker_id: "me", at: null }), false);
});

/* ── the LAN socket, end to end ─────────────────────────────────────────── */

test("hall.mjs frame codec round-trips short, medium and masked frames", () => {
  assert.equal(acceptKeyOf("dGhlIHNhbXBsZSBub25jZQ=="), "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=", "RFC 6455 §1.3 example");
  for (const text of ["hi", "x".repeat(300), "y".repeat(70_000)]) {
    const frame = decodeFrame(encodeFrame(text));
    assert.equal(frame.payload.toString("utf8"), text);
    assert.equal(frame.rest.length, 0);
  }
  const body = Buffer.from("masked");
  const mask = Buffer.from([1, 2, 3, 4]);
  const masked = Buffer.concat([Buffer.from([0x81, 0x80 | body.length]), mask, Buffer.from(body.map((b, i) => b ^ mask[i % 4]))]);
  assert.equal(decodeFrame(masked).payload.toString(), "masked");
  assert.equal(decodeFrame(masked.subarray(0, 5)), null, "incomplete frame waits");
});

test("two phones on the LAN hall see each other over a real WebSocket, and polling sees both", async () => {
  const hall = createHall(multiplayer);
  const server = createServer(async (req, res) => {
    if (req.url === "/live/walker") {
      res.end(JSON.stringify(hall.snapshot()));
      return;
    }
    let body = "";
    for await (const chunk of req) body += chunk;
    const { status, body: out } = hall.pose(JSON.parse(body));
    res.writeHead(status).end(JSON.stringify(out));
  });
  server.on("upgrade", (req, socket) => {
    if (!hall.upgrade(req, socket)) socket.destroy();
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const base_url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const inbox_b: HallMessage[] = [];
  const mode_a: string[] = [];
  const a = openHall(base_url, () => {}, (m) => mode_a.push(m));
  const b = openHall(base_url, (m) => inbox_b.push(m), () => {});
  const until = async (ok: () => boolean) => {
    for (let i = 0; i < 100 && !ok(); i += 1) await new Promise((r) => setTimeout(r, 20));
    assert.ok(ok());
  };
  try {
    await until(() => mode_a.includes("socket") && inbox_b.some((m) => m.type === "roster"));
    a.sendPose({ player_id: "phone-a", name: "Dao Walker", level: 5, stage: "sapling", source: "play", ...offsetFromCenter(10) });
    await until(() => inbox_b.some((m) => m.type === "pose"));
    const seen = inbox_b.find((m) => m.type === "pose");
    assert.ok(seen && seen.type === "pose");
    assert.equal(seen.walker.name, "Dao Walker");
    assert.equal(seen.walker.walker_id, walkerIdOf("phone-a"));
    assert.ok(!JSON.stringify(inbox_b).includes("phone-a"), "the player_id never reaches another phone");

    hall.announce(freshFindOf(new Set(), [{ sighting_id: "s9", species_code: "narra", common_name: "Narra", lat: CAMPUS_CENTER.lat, lon: CAMPUS_CENTER.lon, entry_kind: "badge", created_at: "t" }], { player_id: "phone-a", name: "Dao Walker" }));
    await until(() => inbox_b.some((m) => m.type === "find"));

    /* The polling fallback reads the same roster. */
    const polled = (await (await fetch(`${base_url}/live/walker`)).json()) as HallMessage;
    assert.equal(polled.type, "roster");
    assert.equal(polled.type === "roster" && polled.walker.length, 1);

    a.close();
    await until(() => inbox_b.some((m) => m.type === "gone"));
  } finally {
    a.close();
    b.close();
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
});

test("openHall falls back to polling when the socket never opens", async () => {
  const inbox: HallMessage[] = [];
  const mode: string[] = [];
  const call: string[] = [];
  class DeadSocket {
    onopen: (() => void) | null = null;
    onmessage: ((ev: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    constructor() {
      setTimeout(() => this.onclose?.(), 5);
    }
    send() {}
    close() {}
  }
  const fake_fetch = (async (url: string, init?: RequestInit) => {
    call.push(`${init?.method ?? "GET"} ${url}`);
    return new Response(JSON.stringify({ type: "roster", walker: [], find: [], server_time: 0 }));
  }) as typeof fetch;
  const link = openHall("http://hall", (m) => inbox.push(m), (m) => mode.push(m), {
    WebSocket: DeadSocket as unknown as typeof WebSocket,
    fetch: fake_fetch,
    poll_ms: 20,
  });
  try {
    await new Promise((r) => setTimeout(r, 60));
    assert.ok(mode.includes("poll"));
    assert.ok(inbox.length > 0);
    link.sendPose({ player_id: "p", name: "N", level: 1, stage: "egg", source: "play", ...CAMPUS_CENTER });
    await new Promise((r) => setTimeout(r, 10));
    assert.ok(call.includes("POST http://hall/live/pose"));
  } finally {
    link.close();
  }
});
