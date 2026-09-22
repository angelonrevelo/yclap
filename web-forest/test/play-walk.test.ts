import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RESTRICTED_POLYGON } from "../src/data.ts";
import { DEMO_WALK, WALK_PACE_MS, distanceMeter, isInsideCampus } from "../src/geo.ts";
import {
  PLAY_RUN_MULTIPLIER,
  PLAY_START,
  headingFromKey,
  isWalkable,
  offsetMeter,
  playMeterForTick,
  stepPlayWalk,
  stepToward,
} from "../src/play-walk.ts";

describe("play walk", () => {
  it("starts on the same walkable ground the demo loop uses", () => {
    assert.equal(PLAY_START.lat, DEMO_WALK[0].lat);
    assert.equal(PLAY_START.lon, DEMO_WALK[0].lon);
    assert.equal(isWalkable(PLAY_START), true);
    assert.equal(isInsideCampus(PLAY_START), true);
  });

  it("a north step from the start stays on campus and actually moves", () => {
    const next = stepPlayWalk(PLAY_START, 0, 8);
    assert.equal(isWalkable(next), true);
    assert.ok(distanceMeter(PLAY_START, next) > 7);
    assert.ok(next.lat > PLAY_START.lat);
  });

  it("refuses a step that would leave the campus box", () => {
    const edge = { lat: 14.6449, lon: 121.079 };
    assert.equal(isInsideCampus(edge), true);
    const stuck = stepPlayWalk(edge, 0, 400);
    assert.equal(stuck.lat, edge.lat);
    assert.equal(stuck.lon, edge.lon);
  });

  it("refuses a step into the restricted grove", () => {
    const grove = RESTRICTED_POLYGON[0];
    const toward = stepToward(PLAY_START, grove, 8000);
    assert.equal(isWalkable(toward), true);
  });

  it("walks toward a destination and lands on it", () => {
    const to = offsetMeter(PLAY_START, 90, 20);
    assert.equal(isWalkable(to), true);
    let at = PLAY_START;
    for (let i = 0; i < 40; i += 1) at = stepToward(at, to, 1);
    assert.ok(distanceMeter(at, to) < 0.05);
  });

  it("WASD is relative to the camera: W at bearing 90 faces WEST", () => {
    /* This assertion used to say east, and it was wrong in the same direction
       the code was wrong — the test was written from the same assumption as
       the bug. The ground plane is turned by `rotateZ(+bearing)`, so at
       bearing 90 NORTH swings round to the right of the screen and the
       direction that now appears straight up is WEST, 270. Checked against
       `toScreen` directly rather than reasoned about a second time.

       The symptom was worth the trouble: with the camera rotated, pushing the
       stick "forward" walked you off at an angle to wherever you were
       looking. */
    const idle = { north: false, south: false, east: false, west: false };
    assert.equal(headingFromKey(idle, 0), null);
    assert.equal(headingFromKey({ ...idle, north: true }, 0), 0);
    assert.equal(headingFromKey({ ...idle, north: true }, 90), 270);
    assert.equal(headingFromKey({ ...idle, north: true }, 270), 90);
    assert.equal(headingFromKey({ ...idle, east: true }, 0), 90);
    /* At bearing 90 the screen-right key points at north. */
    assert.equal(headingFromKey({ ...idle, east: true }, 90), 0);
    const diag = headingFromKey({ north: true, south: false, east: true, west: false }, 0);
    assert.ok(diag !== null);
    assert.ok(Math.abs(diag - 45) < 1e-9);
  });

  it("a tick at walking pace is WALK_PACE_MS; Shift is the run multiplier", () => {
    assert.equal(playMeterForTick(1000, false), WALK_PACE_MS);
    assert.equal(playMeterForTick(1000, true), WALK_PACE_MS * PLAY_RUN_MULTIPLIER);
  });
});
