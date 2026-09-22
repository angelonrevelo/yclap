import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RESTRICTED_POLYGON } from "../src/data.ts";
import { DEMO_WALK, WALK_PACE_MS, distanceMeter, isInsideCampus } from "../src/geo.ts";
import {
  PLAY_PACE_CEILING_MS,
  PLAY_PACE_FLOOR_MS,
  PLAY_RUN_MULTIPLIER,
  PLAY_SPAN_PER_SECOND,
  PLAY_START,
  headingFromKey,
  isWalkable,
  offsetMeter,
  playMeterForTick,
  stepPlayWalk,
  stepToward,
  stickTopPaceMs,
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

  it("does not move at the real walking pace, and must not", () => {
    /* `WALK_PACE_MS` is 1.3 m/s, the preferred walking speed of an adult, and
       it is a CLAIM the app prints: every "≈4 min walk" caption is derived from
       it and the Plan surface states it out loud. The stick used to borrow it,
       which made the number honest and the control unusable — at the street
       camera 1.3 m/s crosses the visible ground in about twenty seconds.
       
       These are now two different numbers on purpose. If a change ever couples
       them again, this fails. */
    const stick = playMeterForTick(1000, false);
    assert.ok(
      stick > WALK_PACE_MS * 3,
      `stick moves ${stick} m/s, barely above the ${WALK_PACE_MS} m/s walk it was too slow at`,
    );
  });

  it("is analog: the throttle IS the speed, so a thumb can reach the top", () => {
    /* Speed used to live on Shift, and a phone has no Shift — so on the one
       device the showcase is demoed from there was no way to go faster. */
    const full = playMeterForTick(1000, false, 1);
    assert.equal(playMeterForTick(1000, false, 0.5), full / 2);
    assert.equal(playMeterForTick(1000, false, 0), 0);
    assert.equal(playMeterForTick(1000, false), full, "no throttle given should mean full");
  });

  it("still lets a keyboard run on top of that", () => {
    assert.equal(playMeterForTick(1000, true), playMeterForTick(1000, false) * PLAY_RUN_MULTIPLIER);
  });

  it("covers the same share of the screen at any camera inside the band", () => {
    /* The reason the pace is quoted as a fraction of the visible span rather
       than in m/s: a fixed m/s crawls when the camera is wide and races when it
       is close, because the same distance is a different fraction of screen.
       
       Only INSIDE the clamp band — past it the ceiling deliberately wins, and
       that trade is the next test. The play camera's own range (z19..z22, about
       29 m to 230 m of ground) straddles the ceiling, so both halves are real. */
    for (const span of [12, 30, 50]) {
      const crossed = playMeterForTick(1000, false, 1, span) / span;
      assert.ok(
        Math.abs(crossed - PLAY_SPAN_PER_SECOND) < 1e-9,
        `at a ${span} m view it covers ${(crossed * 100).toFixed(0)}% per second`,
      );
    }
  });

  it("lets the ceiling win over the fraction at a wide camera", () => {
    /* Holding the fraction all the way out would ask for 70 m/s at z19. The
       ceiling is what stops the stick becoming a car, and the cost — the walk
       feeling slightly slower when pulled right back — is the right way round. */
    const wide = 230;
    assert.equal(stickTopPaceMs(wide), PLAY_PACE_CEILING_MS);
    assert.ok(PLAY_SPAN_PER_SECOND * wide > PLAY_PACE_CEILING_MS);
  });

  it("clamps both ends, so no camera gives a crawl or a teleport", () => {
    assert.equal(stickTopPaceMs(0), PLAY_PACE_FLOOR_MS);
    assert.equal(stickTopPaceMs(1), PLAY_PACE_FLOOR_MS, "closest camera must not crawl");
    assert.equal(stickTopPaceMs(100000), PLAY_PACE_CEILING_MS, "widest must not teleport");
    for (const span of [0, 5, 30, 120, 900, 5000]) {
      const pace = stickTopPaceMs(span);
      assert.ok(pace >= PLAY_PACE_FLOOR_MS && pace <= PLAY_PACE_CEILING_MS, `${span} -> ${pace}`);
    }
  });

  it("never goes backwards as the camera widens", () => {
    let last = 0;
    for (let span = 0; span <= 400; span += 7) {
      const pace = stickTopPaceMs(span);
      assert.ok(pace >= last, `pace fell from ${last} to ${pace} at ${span} m`);
      last = pace;
    }
  });
});
