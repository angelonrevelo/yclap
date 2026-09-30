import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { CAMPUS_CENTER, distanceMeter } from "../src/geo.ts";
import {
  applyHall,
  freshFindOf,
  headingAt,
  INTERP_DELAY_MS,
  isMoving,
  SAMPLE_MAX,
  SEND_MOVE_PLAY_M,
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
  assert.equal(fresh[0].walker_id, walkerIdOf("p-1"));
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
  assert.deepEqual(positionOf(t, 60_000), CAMPUS_CENTER);
  assert.equal(isGliding(t, INTERP_DELAY_MS), false);
});

/**
 * A walker at a steady pace, one pose a second, arriving with the network's
 * jitter. Returns the metres the walker is DRAWN to cover in each 100 ms frame
 * step across the stretch where the buffer has poses on both sides.
 */
function drawnStep(input: { jitter_ms: number[]; pace_m_per_s: number }): number[] {
  const latency = 80;
  const inbox = input.jitter_ms
    .map((jitter, i) => ({ sent: 1_000 + i * 1_000, arrive: 1_000 + i * 1_000 + latency + jitter, meter: i * input.pace_m_per_s }))
    .sort((x, y) => x.arrive - y.arrive);
  let track: Track | undefined;
  let prev: ReturnType<typeof positionOf> | null = null;
  const step: number[] = [];
  const end = 1_000 + (input.jitter_ms.length - 2) * 1_000 + INTERP_DELAY_MS;
  /* Frame by frame, the way the phone does it: deliver what has arrived, then draw. */
  for (let now = 0; now <= end; now += 100) {
    while (inbox.length && inbox[0].arrive <= now) {
      const one = inbox.shift()!;
      track = receivePose(track, pose({ at: one.arrive, sent: one.sent, ...offsetFromCenter(one.meter) }), one.arrive);
    }
    if (!track || now < 3_000 + INTERP_DELAY_MS) continue;
    const at = positionOf(track, now);
    if (prev) step.push(distanceMeter(prev, at));
    prev = at;
  }
  return step;
}

test("09-30 jitter: a walker at a steady pace is DRAWN at a steady pace, whatever the network does", () => {
  /* Arrival jitter up to 400 ms — a hall on shared wifi. */
  const jitter_ms = [0, 310, 20, 400, 90, 0, 250, 380, 10, 200, 0, 330];
  const step = drawnStep({ jitter_ms, pace_m_per_s: 1.3 });
  assert.ok(step.length >= 60, `sampled ${step.length} frames`);
  const expected = 0.13;
  for (const one of step) {
    assert.ok(Math.abs(one - expected) < 0.01, `a 100 ms frame moved ${one.toFixed(3)} m, expected ${expected}`);
  }
});

test("the walk between two poses is linear — no surge at the start, no brake at the end", () => {
  let t = receivePose(undefined, pose({ at: 0, sent: 0 }), 0);
  t = receivePose(t, pose({ at: 1_000, sent: 1_000, ...offsetFromCenter(10) }), 1_000);
  const d = (ms: number) => distanceMeter(CAMPUS_CENTER, positionOf(t, ms + INTERP_DELAY_MS));
  assert.ok(Math.abs(d(250) - 2.5) < 0.05, `quarter-way at ${d(250)} m`);
  assert.ok(Math.abs(d(500) - 5) < 0.05, `half-way at ${d(500)} m`);
  assert.ok(Math.abs(d(750) - 7.5) < 0.05, `three-quarters at ${d(750)} m`);
  assert.ok(distanceMeter(positionOf(t, 1_000 + INTERP_DELAY_MS), offsetFromCenter(10)) < 1e-6, "lands on the pose");
  assert.equal(isMoving(t, 500 + INTERP_DELAY_MS), true);
  assert.equal(isMoving(t, 1_500 + INTERP_DELAY_MS), false, "stands once the poses run out");
});

test("a sender clock hours off ours is still drawn at its own pace", () => {
  const skew = 3 * 3_600_000;
  let t = receivePose(undefined, pose({ at: 0, sent: skew }), 50);
  t = receivePose(t, pose({ at: 1_000, sent: skew + 1_000, ...offsetFromCenter(1.3) }), 1_120);
  t = receivePose(t, pose({ at: 2_000, sent: skew + 2_000, ...offsetFromCenter(2.6) }), 2_050);
  const mid = distanceMeter(CAMPUS_CENTER, positionOf(t, 1_550 + INTERP_DELAY_MS));
  assert.ok(Math.abs(mid - 1.95) < 0.05, `drawn at ${mid} m`);
});

test("a lost pose holds the walker at the last spot — never a guess ahead that snaps back", () => {
  let t = receivePose(undefined, pose({ at: 0, sent: 0 }), 0);
  t = receivePose(t, pose({ at: 1_000, sent: 1_000, ...offsetFromCenter(1.3) }), 1_000);
  const held = positionOf(t, 5_000 + INTERP_DELAY_MS);
  assert.ok(distanceMeter(held, offsetFromCenter(1.3)) < 1e-6);
  /* The walk resumes from where it was held, forward only. */
  t = receivePose(t, pose({ at: 3_000, sent: 3_000, ...offsetFromCenter(3.9) }), 3_000);
  let prev = 0;
  for (let ms = 1_000; ms <= 3_000; ms += 100) {
    const d = distanceMeter(CAMPUS_CENTER, positionOf(t, ms + INTERP_DELAY_MS));
    assert.ok(d >= prev - 1e-9, `walked backwards at ${ms}`);
    prev = d;
  }
});

test("standing, then a step, is drawn as a step — not a slow crawl across the pause", () => {
  let t = receivePose(undefined, pose({ at: 0, sent: 0 }), 0);
  /* Eight seconds standing still (under the heartbeat), then one metre, drawn over STEP_MS. */
  t = receivePose(t, pose({ at: 8_000, sent: 8_000, ...offsetFromCenter(1) }), 8_000);
  const d = (ms: number) => distanceMeter(CAMPUS_CENTER, positionOf(t, ms + INTERP_DELAY_MS));
  assert.ok(d(5_900) < 1e-6, "still standing at 5.9 s");
  assert.ok(d(7_000) > 0.4 && d(7_000) < 0.6, `mid-step at ${d(7_000)} m`);
});

test("a teleport snaps, and does not draw a walk across campus", () => {
  let t = receivePose(undefined, pose({ at: 0, sent: 0 }), 0);
  const far = offsetFromCenter(SNAP_M + 50);
  t = receivePose(t, pose({ at: 1_000, sent: 1_000, ...far }), 1_000);
  assert.deepEqual(positionOf(t, 1_000), far);
  assert.deepEqual(positionOf(t, 1_000 + INTERP_DELAY_MS), far);
});

test("poses out of order never walk the walker backwards in time", () => {
  let t = receivePose(undefined, pose({ at: 0, sent: 0 }), 0);
  t = receivePose(t, pose({ at: 2_000, sent: 2_000, ...offsetFromCenter(2.6) }), 2_000);
  t = receivePose(t, pose({ at: 1_000, sent: 1_000, ...offsetFromCenter(1.3) }), 2_010);
  for (let i = 1; i < t.sample.length; i += 1) assert.ok(t.sample[i].t > t.sample[i - 1].t);
});

test("the buffer stays bounded however long a walker walks", () => {
  let t: Track | undefined;
  for (let i = 0; i < 600; i += 1) {
    t = receivePose(t, pose({ at: i * 1_000, sent: i * 1_000, ...offsetFromCenter(i % 100) }), i * 1_000);
  }
  assert.ok((t as Track).sample.length <= SAMPLE_MAX);
});

test("a build before 09-30 (no sent stamp) still walks, paced on server time", () => {
  let t = receivePose(undefined, pose({ at: 0 }), 0);
  t = receivePose(t, pose({ at: 1_000, ...offsetFromCenter(10) }), 1_000);
  const mid = distanceMeter(CAMPUS_CENTER, positionOf(t, 500 + INTERP_DELAY_MS));
  assert.ok(Math.abs(mid - 5) < 0.05);
});

test("heading follows the move: walking north reads as 0°, east as 90°", () => {
  const a = receivePose(undefined, pose({ at: 0, sent: 0 }), 0);
  const north = receivePose(a, pose({ at: 1_000, sent: 1_000, ...offsetFromCenter(10) }), 1_000);
  assert.ok(Math.abs(north.heading) < 1);
  assert.ok(Math.abs(headingAt(north, 500 + INTERP_DELAY_MS)) < 1);
  const east = receivePose(a, pose({ at: 1_000, sent: 1_000, lat: CAMPUS_CENTER.lat, lon: CAMPUS_CENTER.lon + 0.0001 }), 1_000);
  assert.ok(Math.abs(east.heading - 90) < 1);
});

test("shouldSend: a stick walk sends every second it moves; GPS waits out its own noise", () => {
  const last = { ...CAMPUS_CENTER, level: 2, stage: "egg", name: "A", at: 0 };
  const step = { ...offsetFromCenter(1.3), level: 2, stage: "egg", name: "A" };
  assert.equal(shouldSend(last, { ...step, source: "play" }, SEND_MIN_MS), true);
  assert.equal(shouldSend(last, { ...step, source: "demo" }, SEND_MIN_MS), true);
  assert.equal(shouldSend(last, { ...step, source: "gps" }, SEND_MIN_MS), false, "1.3 m on GPS is noise");
  const still = { ...offsetFromCenter(SEND_MOVE_PLAY_M / 2), level: 2, stage: "egg", name: "A", source: "play" as const };
  assert.equal(shouldSend(last, still, SEND_MIN_MS), false, "standing still on the stick sends nothing");
});

test("sanitizePose carries the sender clock through, and only a real number", () => {
  const raw = { player_id: "p", name: "A", level: 1, stage: "egg", ...CAMPUS_CENTER, source: "play" };
  assert.equal(sanitizePose({ ...raw, sent: 12_345.7 }, 0)?.sent, 12_345);
  assert.equal(sanitizePose({ ...raw, sent: "soon" }, 0)?.sent, undefined);
  assert.equal("sent" in (sanitizePose(raw, 0) ?? {}), false);
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
  const find = { walker_id: "other", ...offsetFromCenter(80) };
  assert.equal(isNearbyFind(find, { walker_id: "me", at: CAMPUS_CENTER }), true);
  assert.equal(isNearbyFind({ ...find, walker_id: "me" }, { walker_id: "me", at: CAMPUS_CENTER }), false);
  assert.equal(isNearbyFind({ walker_id: "other", ...offsetFromCenter(400) }, { walker_id: "me", at: CAMPUS_CENTER }), false);
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
  const masked = Buffer.concat([Buffer.from([0x81, 0x80 | body.length]), mask, Buffer.from(body.map((b: number, i: number) => b ^ mask[i % 4]))]);
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
