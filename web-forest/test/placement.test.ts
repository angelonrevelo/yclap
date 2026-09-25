import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { building } from "../src/building.ts";
import { encounter, landmark, RESTRICTED_POLYGON } from "../src/data.ts";
import { DEMO_WALK, distanceMeter } from "../src/geo.ts";
import {
  buildingAt,
  isGreenSector,
  isWalkable,
  nearestPlaceable,
  placementProblem,
  VEGETATION_FLOOR,
  walkPoint,
} from "../src/placement.ts";
import { biome_sector, sector } from "../src/sector.ts";
import { poolFromFile, spawnWorld } from "../src/spawn.ts";
import { auditLocation } from "../script/audit-location.ts";

/* ── the rules this file guards (09-25: "the locations … final and working") ─
 *
 * Every find, curated encounter, landmark and walk target stands on a green
 * sector (≥45% measured vegetation), outside the restricted grove, and outside
 * every building footprint. `npm run audit:location` prints the same checks
 * with the nearest good point for anything that fails.
 */

const pool = poolFromFile(JSON.parse(readFileSync(new URL("../public/model/species-model.json", import.meta.url), "utf8")));

/** Centroid of a ring — inside for the convex-ish shapes it is used on here. */
const centre = (ring: [number, number][]) => ({
  lat: ring.reduce((a, p) => a + p[0], 0) / ring.length,
  lon: ring.reduce((a, p) => a + p[1], 0) / ring.length,
});

describe("placementProblem — the one rule", () => {
  it("calls the inside of a building a building", () => {
    const hit = building.map((b) => centre(b.point)).find((p) => buildingAt(p));
    assert.ok(hit, "some building centroid lies inside its own footprint");
    assert.ok(placementProblem(hit).includes("building"));
  });

  it("calls the middle of the grove restricted", () => {
    const mid = {
      lat: RESTRICTED_POLYGON.reduce((a, p) => a + p.lat, 0) / RESTRICTED_POLYGON.length,
      lon: RESTRICTED_POLYGON.reduce((a, p) => a + p.lon, 0) / RESTRICTED_POLYGON.length,
    };
    assert.ok(placementProblem(mid).includes("restricted"));
  });

  it("calls ground no sector encloses off-sector", () => {
    assert.deepEqual(placementProblem({ lat: 14.6, lon: 121.0 }), ["off-sector", "off-campus"]);
  });

  it("calls a paved sector paved", () => {
    const paved = sector.find((s) => !s.is_biome)!;
    assert.ok(placementProblem({ lat: paved.label_point[0], lon: paved.label_point[1] }, paved.sector_code).includes("paved"));
  });

  it("agrees with the measured vegetation floor on every green sector", () => {
    for (const s of biome_sector) {
      assert.ok(isGreenSector(s), s.sector_code);
      if (s.vegetation_ratio !== null) assert.ok(s.vegetation_ratio >= VEGETATION_FLOOR, s.sector_code);
    }
  });

  it("finds good ground near a bad point, within a walk", () => {
    const bad = building.map((b) => centre(b.point)).find((p) => buildingAt(p))!;
    const good = nearestPlaceable(bad);
    assert.ok(good);
    assert.deepEqual(placementProblem(good), []);
    assert.ok(distanceMeter(bad, good) < 80);
  });
});

describe("curated placements", () => {
  it("every encounter stands on good ground", () => {
    for (const e of encounter) {
      assert.deepEqual(placementProblem(e), [], `${e.encounter_id} ${e.where}`);
    }
  });

  it("every landmark stands at an encounter", () => {
    for (const l of landmark) {
      assert.ok(
        encounter.some((e) => e.species_code === l.species_code && e.where === l.where),
        `${l.landmark_id} has no encounter`,
      );
    }
  });

  it("every green sector's walk target is good ground", () => {
    for (const s of biome_sector) {
      assert.deepEqual(placementProblem(walkPoint(s)), [], `${s.sector_code} ${s.name}`);
    }
  });

  it("no demo-walk waypoint sits inside a building or the grove", () => {
    DEMO_WALK.forEach((p, i) => {
      const problem = placementProblem(p).filter((x) => x === "building" || x === "restricted");
      assert.deepEqual(problem, [], `waypoint ${i}`);
    });
  });
});

describe("seeded finds", () => {
  it("no find in a day of windows lands in a building, the grove, on asphalt or off its sector", () => {
    const start = Date.UTC(2026, 8, 26);
    let count = 0;
    /* Every 3rd window across 24 h, campus-wide plus the near field at four waypoints. */
    for (let w = 0; w < 48; w += 3) {
      for (const at of [null, DEMO_WALK[0], DEMO_WALK[3], DEMO_WALK[6], DEMO_WALK[9]]) {
        for (const s of spawnWorld(pool, start + w * 30 * 60 * 1000, at)) {
          count += 1;
          assert.deepEqual(placementProblem(s, s.sector_code), [], `${s.spawn_id}`);
        }
      }
    }
    assert.ok(count > 1000, `only ${count} finds sampled`);
  });
});

describe("every find is walkable (round 5)", () => {
  it("the two round-5 finds north of CAMPUS_BOX are refused as off-campus", () => {
    /* Orchid Tree and Chinese Ixora: on a green sector, but past the box the
       walker is held inside, so walk-to could never reach them. */
    for (const p of [{ lat: 14.64587, lon: 121.08007 }, { lat: 14.64554, lon: 121.08007 }]) {
      assert.equal(isWalkable(p), false);
      assert.ok(placementProblem(p).includes("off-campus"), `${p.lat}, ${p.lon}`);
    }
  });

  it("no seeded find near the north edge stands where the walker cannot", () => {
    const start = Date.UTC(2026, 8, 26);
    const edge = { lat: 14.6452, lon: 121.08007 };
    let count = 0;
    for (let w = 0; w < 48; w += 1) {
      for (const s of spawnWorld(pool, start + w * 30 * 60 * 1000, edge)) {
        count += 1;
        assert.ok(isWalkable(s), `${s.spawn_id} ${s.common_name} ${s.lat}, ${s.lon}`);
      }
    }
    assert.ok(count > 100, `only ${count} finds sampled`);
  });

  it("npm run audit:location passes, walkability included", () => {
    const result = auditLocation();
    assert.equal(result.unwalkable, 0);
    assert.equal(result.misplaced, 0);
    assert.equal(result.failure, 0);
    assert.ok(result.find > 10_000, `only ${result.find} finds audited`);
  });
});
