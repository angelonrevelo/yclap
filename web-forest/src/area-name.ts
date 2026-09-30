import { building, ringCentre } from "./building.ts";
import { distanceMeter } from "./geo.ts";
import { sectorByCode, type Sector } from "./sector.ts";

/**
 * What a player is told an area is called.
 *
 * Eight of the 68 green sectors came out of the path-network split with no
 * name anyone could give them, and the file calls them "Sector 52" and so on.
 * That is a row id, not a place: nobody on campus can walk to "Sector 52". So
 * an unnamed area borrows the nearest named building — "Near Xavier Hall" —
 * which is a claim about distance, not a name we invented for the ground.
 */

const UNNAMED = /^Sector \d+$/;

/** True for the placeholder "Sector N" names the sector split left behind. */
export function isUnnamedSector(row: { name: string }): boolean {
  return UNNAMED.test(row.name.trim());
}

const named_building = building
  .filter((b): b is typeof b & { name: string } => b.name !== null && b.name.trim() !== "")
  .map((b) => ({ name: b.name, at: ringCentre(b.point) }));

/** The nearest named building to a sector's label point, or null. */
export function nearestLandmark(row: Pick<Sector, "label_point">): string | null {
  const at = { lat: row.label_point[0], lon: row.label_point[1] };
  let best: string | null = null;
  let best_m = Infinity;
  for (const b of named_building) {
    const m = distanceMeter(at, b.at);
    if (m < best_m) {
      best_m = m;
      best = b.name;
    }
  }
  return best;
}

/** The area's own name, or "Near <building>" when it only has a row id. */
export function areaName(row: Pick<Sector, "name" | "label_point">): string {
  if (!isUnnamedSector(row)) return row.name;
  const near = nearestLandmark(row);
  return near ? `Near ${near}` : "Campus grounds";
}

/** `areaName` by sector code, or null when the code is not a sector. */
export function sectorName(sector_code: string): string | null {
  const row = sectorByCode(sector_code);
  return row ? areaName(row) : null;
}
