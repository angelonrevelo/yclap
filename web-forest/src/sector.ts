import campus_sector from "./asset/campus-sector.json" with { type: "json" };
import type { LatLon } from "./geo.ts";

/**
 * The sector layer — the unit of play since the 09-03 correction.
 *
 * Two pivots got us here. On 09-02 the unit stopped being a single tree and
 * became an area (`51:20`, Ivan: singling out every tree is "imposible"). On
 * 09-03 the owner corrected HOW those areas are cut: **by the paths and roads,
 * not by boxes we drew**.
 *
 * So a sector is not a ring anybody hand-drew. It is a FACE of the campus way
 * network — the ground enclosed by the roads and footways around it, the same
 * way a city block is defined by its streets. `script/build-sector.mjs` nodes
 * every OSM road and path over the campus and walks the resulting planar
 * arrangement; 103 faces came back, covering 38.8 ha.
 *
 * That is why this file has no geometry of its own and no `is_placeholder`
 * flag: there is nothing left to flag. Every boundary here is OSM geometry
 * traced from imagery, carried under ODbL, credited by `SECTOR_ATTRIBUTION`
 * wherever the layer draws.
 *
 * What is still ours, and still labelled as ours:
 *   - `is_named_by_us` — no OSM or seed name existed, so the name is a guess.
 *   - `species_code`   — provisional, inherited from the 09-03 demo seed.
 *     The AIS inventory (due 2026-09-09) supersedes it.
 *
 * `biome.ts` is NOT this file's twin — it is the 09-03 seed that this
 * supersedes, kept only so `/plan` can show where the species guesses came
 * from. Play reads sectors; provenance reads biomes.
 */

export const SECTOR_ATTRIBUTION = "Sector boundaries © OpenStreetMap contributors, ODbL";

export interface Sector {
  sector_code: string;
  name: string;
  kind: string;
  area_m2: number;
  /** Measured against 1497 OSM building footprints, not estimated. */
  built_ratio: number;
  is_named_by_us: boolean;
  /**
   * Fraction of satellite pixels inside this ring that read as vegetation
   * (ExG = 2G − R − B over Esri World Imagery). MEASURED, not inferred.
   *
   * It exists because building cover cannot tell a lawn from a car park: a car
   * park has no building on it, so it scored as fully green and the map painted
   * the parking aisles as grass. This is the number that settles it.
   * `null` means no imagery covered the ring, never "no plants".
   */
  vegetation_ratio: number | null;
  vegetation_sample: number;
  /**
   * Vegetated enough to be somewhere you walk to look at a plant.
   *
   * Paved ground is still DRAWN — leaving a hole in the map would be its own
   * lie — but it carries no species and is never offered as a place to log one.
   */
  is_biome: boolean;
  green_tag: string | null;
  seed_biome_code: string | null;
  /** Provisional until the AIS inventory lands. */
  species_code: string[];
  /** [lat, lon] — a point guaranteed inside, for the label. */
  label_point: [number, number];
  /** [lat, lon] pairs, closed ring. */
  point: [number, number][];
}

interface SectorFile {
  _comment: string;
  generated_at: string;
  attribution: string;
  method: Record<string, number>;
  sector: Sector[];
}

const file = campus_sector as unknown as SectorFile;

export const sector: Sector[] = file.sector;
export const SECTOR_METHOD = file.method;
export const SECTOR_GENERATED_AT = file.generated_at;

/** Ray casting against one closed ring of [lat, lon] pairs. */
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

export function sectorContains(row: Sector, point: LatLon): boolean {
  return ringContains(row.point, point);
}

/** The sector under a position, or null on ground no way encloses. */
export function sectorAt(point: LatLon, row: Sector[] = sector): Sector | null {
  return row.find((s) => sectorContains(s, point)) ?? null;
}

export function sectorByCode(code: string): Sector | null {
  return sector.find((s) => s.sector_code === code) ?? null;
}

/**
 * How green a sector reads, 0..1 - the MEASURED vegetation fraction.
 *
 * This used to be `1 - built_ratio`, and that was the flaw the owner caught on
 * 09-03: the absence of a building is not the presence of grass, so every car
 * park and paved service yard scored as pure lawn. It now reads the imagery.
 * Where a sector has no measurement it falls back to the old inference rather
 * than claiming zero, and `vegetation_ratio === null` says which is which.
 */
export function greenness(row: Sector): number {
  return row.vegetation_ratio ?? 1 - row.built_ratio;
}

/** The sectors vegetated enough to walk into and look at a plant. */
export const biome_sector: Sector[] = sector.filter((s) => s.is_biome);

/**
 * One green ramp, not a rainbow (`1:03:48`) - but a ramp with real range.
 *
 * Two corrections live in this function, in order.
 *
 * First: keying lightness to building cover alone produced a flat map, because
 * most sectors have no building and all landed on the same green. `kind` now
 * sets the band, so wood is genuinely dark and open field genuinely bright, and
 * the spread is wide enough to see.
 *
 * Second, and more important: paved ground leaves the green family altogether.
 * A car park is not a pale shade of lawn, and rendering it as one is the exact
 * error that put grass on the Arete deck. Anything below the vegetation floor
 * is drawn as the asphalt it is.
 *
 * It is still one hue per surface class at varying lightness, so it still reads
 * in greyscale - the build-spec rule the extra range must not break.
 *
 * The per-sector jitter is decoration only: a hash of the sector code, stable
 * across reloads, so two same-kind neighbours do not merge into one blob. It
 * carries no claim and must never be read as data.
 */
const KIND_BAND: Record<string, { light: number; sat: number }> = {
  wood: { light: 32, sat: 48 },
  cultivated: { light: 42, sat: 42 },
  "open-field": { light: 56, sat: 54 },
  "planted-walk": { light: 68, sat: 36 },
  sparse: { light: 80, sat: 14 },
  paved: { light: 88, sat: 5 },
  built: { light: 91, sat: 4 },
};

/** Stable -1..1 from the sector code. Decoration only - never read as data. */
function jitter(code: string): number {
  let h = 0;
  for (let i = 0; i < code.length; i += 1) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  return ((h % 1000) / 1000 - 0.5) * 2;
}

export function sectorFill(row: Sector): string {
  const band = KIND_BAND[row.kind] ?? KIND_BAND["planted-walk"];
  /* Within a band, measured vegetation still moves it: a 90%-green lawn reads
     darker than a 50%-green one of the same kind. */
  const light = band.light - (greenness(row) - 0.5) * 14 + jitter(row.sector_code) * 3.5;
  const sat = Math.max(3, band.sat + (greenness(row) - 0.5) * 12 + jitter(row.sector_code + "s") * 4);
  const hue = row.is_biome ? 116 + jitter(row.sector_code + "h") * 9 : 40;
  return `hsl(${hue.toFixed(1)} ${sat.toFixed(1)}% ${light.toFixed(1)}%)`;
}

/**
 * The play map's tone for a sector: its kind's band, and only two steps of
 * measured greenness within it — no per-sector jitter.
 *
 * `sectorFill` gives every sector a slightly different colour, which is right
 * on the field map where a sector is a unit of data, and wrong on the play
 * map: 94 near-identical greens read as a patchwork with a seam along every
 * edge (Gelo, 10-01: "clean biome boundaries"). Here neighbours of the same
 * kind come out the SAME tone, so the play map can draw them as one shape and
 * the only edges left are where the ground really changes — lawn to grove,
 * grove to pavement.
 */
export function biomeTone(row: Sector): string {
  const band = KIND_BAND[row.kind] ?? KIND_BAND["planted-walk"];
  const is_lush = greenness(row) >= 0.6;
  const light = band.light - (is_lush ? 3.5 : 0);
  const sat = band.sat + (is_lush ? 3 : 0);
  const hue = row.is_biome ? 118 : 40;
  return `hsl(${hue} ${sat}% ${light}%)`;
}

/** Kinds from the most built to the most wooded — the order the play map paints tones in. */
export const KIND_ORDER = ["built", "paved", "sparse", "planted-walk", "open-field", "cultivated", "wood"];

/** A boundary dark enough to hold a sector apart from its neighbour. */
export function sectorStroke(row: Sector): string {
  const band = KIND_BAND[row.kind] ?? KIND_BAND["planted-walk"];
  const hue = row.is_biome ? 120 : 38;
  return `hsl(${hue} ${Math.min(58, band.sat + 8)}% ${Math.max(18, band.light - 26)}%)`;
}

/** Sectors big enough to be worth a name on screen at a given zoom. */
export function labelledSector(zoom: number, row: Sector[] = sector): Sector[] {
  const floor = zoom >= 19 ? 700 : zoom >= 18 ? 2200 : zoom >= 17 ? 6000 : 12000;
  return row.filter((s) => s.area_m2 >= floor);
}
