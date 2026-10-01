import campus_network from "./asset/campus-network.json" with { type: "json" };
import { building, buildingNear, type CampusBuilding } from "./building.ts";
import { RESTRICTED_POLYGON } from "./data.ts";
import { isInsideCampus, type LatLon } from "./geo.ts";
import { sector, sectorContains, type Sector } from "./sector.ts";

/**
 * Where something may stand — one rule for every find, encounter and landmark.
 *
 * Before 09-25 the spawner checked two of the four conditions (on a green
 * sector, outside the grove) and the curated encounters were checked by none:
 * across a day of windows about one find in seventeen stood inside a building
 * footprint — "go to the Narra" and the Narra is in a classroom — and two of the
 * eight hand-placed encounters sat on a road with no sector under them at all.
 *
 * A placement is good when it is:
 *   - inside a sector (ground some way encloses — not the middle of a road),
 *   - on a green sector: `is_biome`, i.e. at least `VEGETATION_FLOOR` measured
 *     vegetation. Paved ground carries no species (README, "the unit of play"),
 *   - outside the restricted grove placeholder,
 *   - outside every building footprint in `building.ts`,
 *   - walkable: inside `CAMPUS_BOX` too. Some sector rings run past the box
 *     (round 5 found an Orchid Tree and a Chinese Ixora at 14.6459 / 14.6455,
 *     north of it), and a find the walker can never reach is not a find.
 */

/** The measured-vegetation floor below which a sector is asphalt, not ground. */
export const VEGETATION_FLOOR = 0.45;

export type PlacementProblem = "off-sector" | "paved" | "restricted" | "building" | "off-campus";

function ringContains(ring: [number, number][], point: LatLon): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [lat_i, lon_i] = ring[i];
    const [lat_j, lon_j] = ring[j];
    if (
      lat_i > point.lat !== lat_j > point.lat &&
      point.lon < ((lon_j - lon_i) * (point.lat - lat_i)) / (lat_j - lat_i) + lon_i
    ) {
      inside = !inside;
    }
  }
  return inside;
}

const restricted_ring: [number, number][] = RESTRICTED_POLYGON.map((p) => [p.lat, p.lon]);

export function inRestricted(point: LatLon): boolean {
  return ringContains(restricted_ring, point);
}

/** The building whose footprint covers a point, or null. Box-prefiltered. */
export function buildingAt(point: LatLon, row: CampusBuilding[] = building): CampusBuilding | null {
  const near = row === building ? buildingNear(point, 0) : row;
  return near.find((b) => ringContains(b.point, point)) ?? null;
}

/**
 * On campus, outside the grove, and not inside a building — the ground the
 * walker may stand on. The stick, tap-to-walk and every spawn obey this one
 * function; a find placed by a looser rule is a find walk-to can never reach.
 *
 * Buildings joined on 09-26: the playtest walked straight across Kostka Hall's
 * footprint, and with the buildings extruded the walker then stood on the
 * roof. A footprint is refused exactly the way the grove is.
 */
export function isWalkable(point: LatLon): boolean {
  return isInsideCampus(point) && !inRestricted(point) && buildingAt(point) === null && !inWater(point);
}

/**
 * Open water (the pond, the pool — `campus-network.json`). Joined 10-01 with
 * the underwater finds: a find in the pond is reached from the bank, and the
 * walker stops at the edge instead of strolling across the surface.
 */
const WATER: LatLon[][] = (campus_network as unknown as { water: { point: [number, number][] }[] }).water.map((w) =>
  w.point.map(([lat, lon]) => ({ lat, lon })),
);
export function inWater(point: LatLon): boolean {
  return WATER.some((ring) => {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
      const [a, b] = [ring[i], ring[j]];
      if (a.lat > point.lat !== b.lat > point.lat && point.lon < ((b.lon - a.lon) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lon) inside = !inside;
    }
    return inside;
  });
}

/** Green enough to hold a species — the flag, and the number behind it. */
export function isGreenSector(row: Sector): boolean {
  return row.is_biome && (row.vegetation_ratio === null || row.vegetation_ratio >= VEGETATION_FLOOR);
}

/**
 * Everything wrong with standing a find at `point`, empty when it is fine.
 *
 * `sector_code` names the sector the caller placed it in. Sector rings can nest
 * (a lawn inside the paved face around it), so "the first sector containing
 * the point" is not always the one that was meant; pass the code and that
 * sector is judged. Without it, any green sector under the point will do.
 */
export function placementProblem(point: LatLon, sector_code?: string): PlacementProblem[] {
  const out: PlacementProblem[] = [];
  const under = sector.filter((s) => sectorContains(s, point));
  const own = sector_code ? under.find((s) => s.sector_code === sector_code) : under.find(isGreenSector) ?? under[0];
  if (!own) out.push("off-sector");
  else if (!isGreenSector(own)) out.push("paved");
  if (inRestricted(point)) out.push("restricted");
  if (buildingAt(point)) out.push("building");
  if (!isInsideCampus(point)) out.push("off-campus");
  return out;
}

/** True when a find may stand here. */
export function isPlaceable(point: LatLon, sector_code?: string): boolean {
  return placementProblem(point, sector_code).length === 0;
}

const LAT_PER_M = 1 / 110_540;

/**
 * The nearest point to `from` where a find may stand, with `margin_m` of good
 * ground all round it so it does not sit on a kerb. Searched outward in 1 m
 * rings; null when nothing within `reach_m` qualifies. With `sector_code`,
 * the point must be on that sector.
 */
export function nearestPlaceable(
  from: LatLon,
  { reach_m = 80, margin_m = 3, sector_code }: { reach_m?: number; margin_m?: number; sector_code?: string } = {},
): LatLon | null {
  const lon_per_m = 1 / (111_320 * Math.cos((from.lat * Math.PI) / 180));
  const at = (p: LatLon, deg: number, m: number): LatLon => ({
    lat: p.lat + Math.sin((deg * Math.PI) / 180) * m * LAT_PER_M,
    lon: p.lon + Math.cos((deg * Math.PI) / 180) * m * lon_per_m,
  });
  const ok = (p: LatLon) =>
    isPlaceable(p, sector_code) && [0, 45, 90, 135, 180, 225, 270, 315].every((deg) => isPlaceable(at(p, deg, margin_m), sector_code));
  for (let d = 0; d <= reach_m; d += 1) {
    const step = Math.max(8, Math.round(2 * Math.PI * d));
    for (let i = 0; i < step; i += 1) {
      const p = at(from, (i / step) * 360, d);
      if (ok(p)) return { lat: Number(p.lat.toFixed(6)), lon: Number(p.lon.toFixed(6)) };
    }
  }
  return null;
}

const walk_point = new Map<string, LatLon>();

/**
 * Where "walk me to this sector" should lead. The sector's `label_point` is
 * where its NAME is drawn, and eight of the 68 green sectors put that on a
 * roof or in the grove — fine for text, wrong for a destination. This is the
 * label point when it is good ground, else the nearest good ground on the same
 * sector, else the nearest good ground at all. Memoised: the search runs once per sector, on first tap.
 */
export function walkPoint(row: Sector): LatLon {
  const hit = walk_point.get(row.sector_code);
  if (hit) return hit;
  const label = { lat: row.label_point[0], lon: row.label_point[1] };
  const point = isPlaceable(label, row.sector_code)
    ? label
    : nearestPlaceable(label, { reach_m: 150, margin_m: 2, sector_code: row.sector_code }) ??
      /* No good ground on the sector at all (s62 lies wholly inside the grove
         placeholder): lead to the nearest good ground beside it instead. */
      nearestPlaceable(label, { reach_m: 150, margin_m: 2 }) ??
      label;
  walk_point.set(row.sector_code, point);
  return point;
}
