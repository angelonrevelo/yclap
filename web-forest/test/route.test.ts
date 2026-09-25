import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { DEMO_WALK, distanceMeter, type LatLon } from "../src/geo.ts";
import { placementProblem } from "../src/placement.ts";
import { STICK_START, WALK_TO_SHORT_M, stepRoute, type RouteWalk } from "../src/play-walk.ts";
import { noRouteLine, planRoute, routeGrid, stuckLine } from "../src/route.ts";
import { poolFromFile, spawnWorld } from "../src/spawn.ts";

/* ── walk-to routing (09-26) ─────────────────────────────────────────────────
 *
 * The straight-line walk-to gave up at the first wall: in the playtest three
 * far finds stalled 314–646 m short (one against Xavier Hall) and three of
 * thirteen random finds 87–206 m short. These tests walk the same stepper the
 * app ticks (`stepRoute` → `stepToward` → `stepPlayWalk`) to every sampled find
 * and require arrival.
 */

const pool = poolFromFile(JSON.parse(readFileSync(new URL("../public/model/species-model.json", import.meta.url), "utf8")));

const START: [string, LatLon][] = [
  ["stick start", STICK_START],
  ["demo 0", DEMO_WALK[0]],
  ["demo 3", DEMO_WALK[3]],
  ["demo 6", DEMO_WALK[6]],
  ["demo 9", DEMO_WALK[9]],
];

/** Every 4th find of three windows across the day, campus-wide. */
function sampleFind() {
  const day = Date.UTC(2026, 8, 26);
  const out = [];
  for (const hour of [2, 9, 17]) {
    const row = spawnWorld(pool, day + hour * 3600 * 1000, null);
    for (let i = 0; i < row.length; i += 4) out.push(row[i]);
  }
  return out;
}

/** Tick the walker along a route at the stick's floor pace (2.5 m/s, 50 ms ticks → 0.125 m) … or faster. */
function walkRoute(from: LatLon, waypoint: LatLon[], meter: number): { at: LatLon; status: string; tick: number } {
  const walk: RouteWalk = { waypoint, index: 0, stall: 0 };
  let at = from;
  for (let tick = 0; tick < 200_000; tick += 1) {
    const step = stepRoute(at, walk, meter);
    at = step.at;
    if (step.status !== "walking") return { at, status: step.status, tick };
  }
  return { at, status: "timeout", tick: 200_000 };
}

describe("routeGrid", () => {
  it("covers the campus and knows where the footpaths are", () => {
    const grid = routeGrid();
    assert.ok(grid.open_cell_count > 50_000, `${grid.open_cell_count} open cells`);
    assert.ok(grid.path_cell_count > 1_000, `${grid.path_cell_count} footpath cells`);
    assert.ok(grid.build_ms < 1000, `grid built in ${grid.build_ms.toFixed(0)} ms`);
  });
});

describe("planRoute — every sampled find, from five starts", () => {
  const find = sampleFind();

  it("samples a real spread of finds", () => {
    assert.ok(find.length >= 30, `only ${find.length} finds`);
  });

  it("finds a route to every one; each arrives within 3 m when walked", () => {
    let far = 0;
    let worst_gap = 0;
    for (const [label, from] of START) {
      for (const f of find) {
        const route = planRoute(from, f, WALK_TO_SHORT_M);
        assert.ok(route, `${label} → ${f.common_name} ${f.spawn_id}: no route`);
        const end = walkRoute(from, route.waypoint, 0.8);
        assert.equal(end.status, "arrived", `${label} → ${f.common_name}: ${end.status} ${distanceMeter(end.at, f).toFixed(0)} m short`);
        const gap = distanceMeter(end.at, f);
        /* The walk stops WALK_TO_SHORT_M (3 m) short by design; 0.1 m is rounding in the trim. */
        assert.ok(gap <= WALK_TO_SHORT_M + 0.1, `${label} → ${f.common_name}: ended ${gap.toFixed(2)} m away`);
        worst_gap = Math.max(worst_gap, gap);
        if (distanceMeter(from, f) > 300) far += 1;
      }
    }
    console.log(`walked ${START.length * find.length} routes (${far} over 300 m); farthest stop ${worst_gap.toFixed(2)} m from its find`);
    assert.ok(far > 20, `only ${far} far routes walked`);
  });

  it("puts no waypoint in a footprint, the grove or off campus", () => {
    for (const [label, from] of START) {
      for (const f of find) {
        const route = planRoute(from, f, WALK_TO_SHORT_M)!;
        for (const p of route.waypoint) {
          const bad = placementProblem(p).filter((x) => x === "building" || x === "restricted" || x === "off-campus");
          assert.deepEqual(bad, [], `${label} → ${f.common_name} at ${p.lat}, ${p.lon}`);
        }
      }
    }
  });

  it("stays under 3x the straight line", () => {
    let worst = 0;
    for (const [, from] of START) {
      for (const f of find) {
        const straight = distanceMeter(from, f);
        if (straight < 20) continue;
        const route = planRoute(from, f, WALK_TO_SHORT_M)!;
        worst = Math.max(worst, route.length_m / straight);
      }
    }
    assert.ok(worst < 3, `worst route is ${worst.toFixed(2)}x the straight line`);
  });

  it("plans a route in under 20 ms once the grid is built", () => {
    routeGrid();
    const took: number[] = [];
    for (const [, from] of START) {
      for (const f of find) {
        const began = performance.now();
        planRoute(from, f, WALK_TO_SHORT_M);
        took.push(performance.now() - began);
      }
    }
    took.sort((a, b) => a - b);
    const median = took[took.length >> 1];
    const p95 = took[Math.floor(took.length * 0.95)];
    const worst = took[took.length - 1];
    console.log(
      `route timing over ${took.length}: median ${median.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, worst ${worst.toFixed(1)} ms, grid ${routeGrid().build_ms.toFixed(0)} ms once`,
    );
    assert.ok(p95 < 20, `p95 ${p95.toFixed(1)} ms`);
    /* Headroom for a busy CI box; the laptop figure is printed above. */
    assert.ok(worst < 60, `worst ${worst.toFixed(1)} ms`);
  });
});

describe("the playtest's stalls", () => {
  it("walks to the Narra past Xavier Hall that the straight line stalled on", () => {
    /* From spawn-now.json, the 09-26 playtest window. */
    const narra = { lat: 14.638349235928587, lon: 121.07938227966909 };
    for (const [label, from] of START) {
      const route = planRoute(from, narra, WALK_TO_SHORT_M);
      assert.ok(route, label);
      const end = walkRoute(from, route.waypoint, 0.8);
      assert.equal(end.status, "arrived", `${label}: ${end.status} ${distanceMeter(end.at, narra).toFixed(0)} m short`);
      assert.ok(distanceMeter(end.at, narra) <= WALK_TO_SHORT_M + 0.1, label);
    }
  });

  it("routes a tap on a roof to open ground beside it", () => {
    /* Xavier Hall's neighbourhood: any building centroid inside its footprint will do. */
    const roof = { lat: 14.63911, lon: 121.07886 };
    const route = planRoute(STICK_START, roof);
    if (placementProblem(roof).includes("building")) {
      assert.ok(route);
      const end = route.waypoint[route.waypoint.length - 1];
      assert.deepEqual(placementProblem(end).filter((x) => x === "building"), []);
    }
  });
});

describe("walk-to lines", () => {
  it("says there is no way, and names where", () => {
    assert.equal(noRouteLine("Narra"), "Can't find a way to Narra from here");
    assert.match(stuckLine("Narra"), /Narra/);
  });

  it("gives null, not a stall, when the goal is nowhere near open ground", () => {
    assert.equal(planRoute(STICK_START, { lat: 14.6, lon: 121.0 }), null);
  });
});
