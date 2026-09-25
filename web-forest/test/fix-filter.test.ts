import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterFix, FIX_DEADBAND_M, FIX_RESET_MS, type FixFilter } from "../src/fix-filter.ts";
import { distanceMeter, type Fix } from "../src/geo.ts";
import { offsetMeter } from "../src/play-walk.ts";

const HOME = { lat: 14.6394, lon: 121.0775 };

function fixAt(point: { lat: number; lon: number }, at: number, accuracy_m = 8): Fix {
  return { ...point, accuracy_m, at, source: "gps" };
}

/** Deterministic wobble: a fixed walk of offsets, no Math.random in a test. */
const WOBBLE = [
  [0, 3.1], [90, 2.4], [200, 3.6], [310, 1.9], [45, 2.8], [150, 3.3], [260, 2.2], [20, 3.9],
  [120, 1.5], [230, 3.0], [340, 2.6], [75, 3.4], [180, 2.1], [285, 3.7], [10, 2.9], [135, 1.8],
];

describe("filterFix — GPS smoothing", () => {
  it("adopts the first fix exactly", () => {
    const raw = fixAt(HOME, 0);
    const { fix } = filterFix(null, raw);
    assert.deepEqual(fix, raw);
  });

  it("holds a standing walker still through metres of wobble", () => {
    let state: FixFilter | null = null;
    const shown: Fix[] = [];
    for (let i = 0; i < WOBBLE.length; i += 1) {
      const [heading, meter] = WOBBLE[i];
      const out = filterFix(state, fixAt(offsetMeter(HOME, heading, meter), i * 1000));
      state = out.state;
      shown.push(out.fix);
    }
    /* Raw fixes jump 2–4 m every second; what is shown barely moves, and most
       fixes publish nothing new at all. */
    const moved = shown.slice(1).filter((f, i) => f !== shown[i]).length;
    assert.ok(moved <= 3, `published ${moved} moves while standing still`);
    const drift = distanceMeter(shown[0], shown[shown.length - 1]);
    assert.ok(drift < 4, `drifted ${drift} m`);
  });

  it("still follows a real walk", () => {
    let state: FixFilter | null = null;
    let point = HOME;
    let last: Fix | null = null;
    for (let i = 0; i < 30; i += 1) {
      point = offsetMeter(point, 90, 1.4);
      const out = filterFix(state, fixAt(point, i * 1000));
      state = out.state;
      last = out.fix;
    }
    assert.ok(last);
    /* 42 m walked; the shown point lags a little, never by much. */
    assert.ok(distanceMeter(last, point) < 6, `lagging ${distanceMeter(last, point)} m`);
    assert.ok(distanceMeter(HOME, last) > 30);
  });

  it("trusts a tight fix more than a loose one", () => {
    const start = filterFix(null, fixAt(HOME, 0, 5)).state;
    const jumped = offsetMeter(HOME, 0, 20);
    const tight = filterFix(start, fixAt(jumped, 1000, 3)).fix;
    const loose = filterFix(start, fixAt(jumped, 1000, 60)).fix;
    assert.ok(distanceMeter(HOME, tight) > distanceMeter(HOME, loose));
    assert.ok(distanceMeter(HOME, loose) < FIX_DEADBAND_M || loose === start.shown);
  });

  it("starts over after a long silence rather than dragging an old estimate", () => {
    const start = filterFix(null, fixAt(HOME, 0)).state;
    const far = offsetMeter(HOME, 45, 300);
    const out = filterFix(start, fixAt(far, FIX_RESET_MS + 1));
    assert.equal(out.fix.lat, far.lat);
    assert.equal(out.fix.lon, far.lon);
  });

  it("passes the reported accuracy through untouched", () => {
    let state = filterFix(null, fixAt(HOME, 0, 12)).state;
    const out = filterFix(state, fixAt(offsetMeter(HOME, 0, 30), 1000, 17));
    state = out.state;
    assert.equal(out.fix.accuracy_m, 17);
  });
});
