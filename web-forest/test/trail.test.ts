import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { species } from "../src/data.ts";
import { walkMinute } from "../src/geo.ts";
import { isWalkable, placementProblem } from "../src/placement.ts";
import { TRAIL, planTrail, progressLine, remainingMeter, type Trail } from "../src/trail.ts";

/* ── nature trails (Gelo 09-30, `4:53`–`5:11`) ────────────────────────────────
 *
 * A trail can only ask somebody to walk where a walker may stand, and every
 * leg must route — a trail that draws a line through Xavier Hall is the
 * straight-line walk-to bug of 09-26 all over again.
 */

describe("trail files", () => {
  it("every JSON in src/asset/trail is registered in TRAIL", () => {
    const dir = new URL("../src/asset/trail/", import.meta.url);
    const file = readdirSync(dir).filter((f) => f.endsWith(".json"));
    const code = file.map((f) => (JSON.parse(readFileSync(new URL(f, dir), "utf8")) as Trail).trail_code).sort();
    assert.deepEqual(code, TRAIL.map((t) => t.trail_code).sort());
    for (const f of file) assert.equal(f, `${(JSON.parse(readFileSync(new URL(f, dir), "utf8")) as Trail).trail_code}.json`);
  });

  for (const trail of TRAIL) {
    describe(trail.trail_code, () => {
      it("flags what is ours", () => {
        assert.equal(typeof trail.is_named_by_us, "boolean");
        for (const stop of trail.stop) {
          assert.equal(typeof stop.is_named_by_us, "boolean", stop.stop_code);
          assert.equal(typeof stop.is_position_surveyed, "boolean", stop.stop_code);
          assert.ok(stop.look_for.length > 20, `${stop.stop_code}: look_for too thin`);
        }
      });

      it("has unique stop codes and at least two stops", () => {
        assert.ok(trail.stop.length >= 2);
        assert.equal(new Set(trail.stop.map((s) => s.stop_code)).size, trail.stop.length);
      });

      it("every stop is walkable, off buildings and outside the grove", () => {
        for (const stop of trail.stop) {
          assert.ok(isWalkable(stop), `${stop.stop_code} not walkable: ${placementProblem(stop).join(", ")}`);
        }
      });

      it("every species stop is a curated species with artwork", () => {
        for (const stop of trail.stop) {
          if (!stop.species_code) continue;
          assert.ok(species[stop.species_code], `${stop.stop_code}: ${stop.species_code} not in data.ts`);
          assert.ok(existsSync(new URL(`../src/asset/species/${stop.species_code}.png`, import.meta.url)), `${stop.species_code} has no artwork`);
        }
      });

      it("the whole trail routes, leg by leg, and the numbers add up", () => {
        const plan = planTrail(trail);
        assert.equal(plan.broken_leg_count, 0, "a leg has no route");
        assert.equal(plan.leg.length, trail.stop.length - 1);
        const sum = plan.leg.reduce((m, l) => m + (l.route?.length_m ?? 0), 0);
        assert.ok(Math.abs(sum - plan.length_m) < 1e-6);
        assert.equal(plan.minute, walkMinute(plan.length_m));
        assert.equal(remainingMeter(plan, 0), plan.length_m);
        assert.equal(remainingMeter(plan, trail.stop.length - 1), 0);
        assert.equal(progressLine(plan, 2), `Stop 3 of ${trail.stop.length}`);
        /* A leg's route is never shorter than the straight line between its stops. */
        for (const l of plan.leg) {
          const d = Math.hypot((l.to.lat - l.from.lat) * 110_540, (l.to.lon - l.from.lon) * 107_700);
          assert.ok(l.route!.length_m >= d - 2, `${l.from.stop_code} → ${l.to.stop_code} shorter than straight`);
        }
      });
    });
  }
});
