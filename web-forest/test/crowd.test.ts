import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CAMPUS_CENTER, distanceMeter } from "../src/geo.ts";
import {
  closeQuietly,
  liveNameOf,
  openHall,
  pruneTrack,
  receivePose,
  STALE_MS,
  walkerOutCount,
  walkerOutLabel,
  type Pose,
  type Track,
} from "../src/multiplayer.ts";
import {
  isWalkable,
  spreadStartOf,
  START_SPREAD_MAX_M,
  START_SPREAD_MIN_M,
  STICK_START,
  stickStartOf,
} from "../src/play-walk.ts";
import { levelOf } from "../src/level.ts";

/* The 09-26 playtest: three walker counts at once, the wrong live name and
   level after sign-in, every phone on one spawn point, and a socket warning
   on every load. */

function pose(id: string, at: number): Pose {
  return { walker_id: id, name: id, level: 1, stage: "egg", ...CAMPUS_CENTER, source: "play", at };
}

describe("one walker count", () => {
  it("counts the hall's live tracks plus you once you are sharing", () => {
    assert.equal(walkerOutCount(0, false), 0);
    assert.equal(walkerOutCount(0, true), 1);
    assert.equal(walkerOutCount(2, true), 3);
    assert.equal(walkerOutCount(2, false), 2);
  });
  it("says whether you are included, and never invents a zero", () => {
    assert.equal(walkerOutLabel(null, true), null);
    assert.equal(walkerOutLabel(0, false), "No walkers out");
    assert.equal(walkerOutLabel(1, true), "Just you out");
    assert.equal(walkerOutLabel(1, false), "1 walker out");
    assert.equal(walkerOutLabel(3, true), "3 walkers out, incl. you");
    assert.equal(walkerOutLabel(3, false), "3 walkers out");
  });
  it("drops a walker unheard for the hall's stale window from the count", () => {
    const now = 1_000_000;
    let track = new Map<string, Track>();
    track.set("a", receivePose(undefined, pose("a", now), now - STALE_MS - 1));
    track.set("b", receivePose(undefined, pose("b", now), now - 5_000));
    track = pruneTrack(track, now);
    assert.equal(walkerOutCount(track.size, true), 2);
  });
});

describe("live name and level", () => {
  it("uses the account display name when signed in", () => {
    assert.equal(liveNameOf({ account_name: "Hall One", preference_name: "", player_name: "Molave Walker 8" }), "Hall One");
  });
  it("falls back to the Settings name, then the generated one", () => {
    assert.equal(liveNameOf({ account_name: null, preference_name: "Gelo", player_name: "Molave Walker 8" }), "Gelo");
    assert.equal(liveNameOf({ account_name: "  ", preference_name: "", player_name: "Molave Walker 8" }), "Molave Walker 8");
    assert.equal(liveNameOf({ player_name: "" }), "Walker");
  });
  it("level comes off points the way the HUD reads it", () => {
    /* 50 points is level 1 on the HUD, whatever the explored sector count. */
    assert.equal(levelOf(50).level, 1);
    assert.equal(levelOf(100).level, 2);
  });
});

describe("start spread", () => {
  const id = Array.from({ length: 40 }, (_, i) => `player-${i}-${(i * 7919).toString(36)}`);

  it("puts each player on a walkable spot 10–25 m from STICK_START", () => {
    for (const one of id) {
      const at = spreadStartOf(one);
      assert.equal(isWalkable(at), true, one);
      const d = distanceMeter(STICK_START, at);
      assert.ok(d >= START_SPREAD_MIN_M - 0.5 && d <= START_SPREAD_MAX_M + 0.5, `${one} at ${d.toFixed(1)} m`);
    }
  });
  it("is the same spot for the same player, every load", () => {
    assert.deepEqual(spreadStartOf("abc"), spreadStartOf("abc"));
    assert.deepEqual(stickStartOf("", "abc"), spreadStartOf("abc"));
  });
  it("does not pile the hall onto one point", () => {
    const spot = new Set(id.map((one) => {
      const at = spreadStartOf(one);
      return `${at.lat.toFixed(6)},${at.lon.toFixed(6)}`;
    }));
    assert.ok(spot.size >= 35, `${spot.size} distinct starts for 40 players`);
  });
  it("still pins exactly with ?at=, and unknown players get STICK_START", () => {
    assert.deepEqual(stickStartOf("?at=14.63935,121.07789", "abc"), { lat: 14.63935, lon: 121.07789 });
    assert.deepEqual(stickStartOf("?at=0,0", ""), STICK_START);
    assert.deepEqual(spreadStartOf(""), STICK_START);
  });
});

describe("hall socket lifecycle", () => {
  class CountSocket {
    static made = 0;
    readyState = 0;
    onopen: (() => void) | null = null;
    onmessage: ((ev: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    closed = 0;
    constructor() {
      CountSocket.made += 1;
    }
    send() {}
    close() {
      this.closed += 1;
    }
  }

  it("a StrictMode open-close-open never builds the first socket", async () => {
    CountSocket.made = 0;
    const io = { WebSocket: CountSocket as unknown as typeof WebSocket, fetch: (async () => new Response("{}")) as typeof fetch };
    const first = openHall("http://hall", () => {}, () => {}, io);
    first.close();
    const second = openHall("http://hall", () => {}, () => {}, io);
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(CountSocket.made, 1);
    second.close();
  });

  it("closing a CONNECTING socket waits for it to open instead", () => {
    const socket = new CountSocket();
    closeQuietly(socket as unknown as WebSocket, false);
    assert.equal(socket.closed, 0);
    socket.readyState = 1;
    socket.onopen?.();
    assert.equal(socket.closed, 1);
  });

  it("an open socket is closed at once", () => {
    const socket = new CountSocket();
    socket.readyState = 1;
    closeQuietly(socket as unknown as WebSocket, true);
    assert.equal(socket.closed, 1);
  });
});
