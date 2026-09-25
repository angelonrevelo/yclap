/**
 * Locations audit — every curated placement and a day of seeded finds, judged
 * by the one rule in src/placement.ts (green sector, not the grove, not inside
 * a building). Prints each failure with the nearest good point, so a bad
 * placement comes with its fix.
 *
 *   npm run audit:location        # exit 1 on any failure
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { encounter, landmark } from "../src/data.ts";
import { DEMO_WALK, type LatLon } from "../src/geo.ts";
import { nearestPlaceable, placementProblem, walkPoint } from "../src/placement.ts";
import { biome_sector } from "../src/sector.ts";
import { poolFromFile, spawnWorld } from "../src/spawn.ts";

const here = dirname(fileURLToPath(import.meta.url));

function main() {
  let failure = 0;
  const report = (label: string, p: LatLon, sector_code?: string) => {
    const problem = placementProblem(p, sector_code);
    if (!problem.length) return;
    failure += 1;
    const fix = nearestPlaceable(p);
    console.log(`  ${label.padEnd(34)} ${problem.join(",").padEnd(18)} nearest good: ${fix ? `${fix.lat}, ${fix.lon}` : "none within 80 m"}`);
  };

  console.log(`encounters: ${encounter.length}`);
  for (const e of encounter) report(`${e.encounter_id} ${e.where}`, e);

  /* A landmark has no coordinate of its own; it stands where its encounter does. */
  for (const l of landmark) {
    const at = encounter.find((e) => e.species_code === l.species_code && e.where === l.where);
    if (!at) {
      failure += 1;
      console.log(`  landmark ${l.landmark_id} has no encounter to stand at`);
    }
  }

  console.log(`sector walk targets: ${biome_sector.length}`);
  for (const s of biome_sector) report(`walk-to ${s.sector_code} ${s.name}`, walkPoint(s));

  /* The demo walk crosses roads between sectors — that is walking, not
     standing — but no waypoint may sit inside a building or the grove. */
  console.log(`demo walk waypoints: ${DEMO_WALK.length}`);
  DEMO_WALK.forEach((p, i) => {
    const problem = placementProblem(p).filter((x) => x === "building" || x === "restricted");
    if (problem.length) {
      failure += 1;
      console.log(`  walk ${i} ${problem.join(",")}`);
    }
  });

  const pool = poolFromFile(JSON.parse(readFileSync(join(here, "..", "public", "model", "species-model.json"), "utf8")));
  let find = 0;
  let bad = 0;
  const start = Date.UTC(2026, 8, 26);
  for (let w = 0; w < 48; w += 1) {
    for (const at of [null, ...DEMO_WALK]) {
      for (const s of spawnWorld(pool, start + w * 30 * 60 * 1000, at)) {
        find += 1;
        if (placementProblem(s, s.sector_code).length) bad += 1;
      }
    }
  }
  console.log(`seeded finds over 48 windows x ${DEMO_WALK.length + 1} positions: ${find}, misplaced ${bad}`);
  failure += bad;

  console.log(failure ? `${failure} placement failure(s)` : "all placements good");
  process.exitCode = failure ? 1 : 0;
}

if (process.argv[1]?.endsWith("audit-location.ts")) main();
