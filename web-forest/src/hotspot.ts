/**
 * Biodiversity hotspots — per sector, how many species people have recorded
 * there, how densely, and how green the ground measures.
 *
 * Gelo's 09-30 note (`3:58`–`4:46`): the map should show "areas with
 * biodiversity". Derived, not drawn: `campus-hotspot.json` is built by
 * `script/build-hotspot.mjs` from iNaturalist observations with an open,
 * ≤ 50 m position, counted into the OSM sectors; vegetation is the sector's
 * own measured ratio. The method line below goes on screen with the layer,
 * because the obvious misreading — "more records means more life" — is wrong
 * in a known direction: records follow footfall.
 */
import hotspot_file from "./asset/campus-hotspot.json" with { type: "json" };

export interface HotspotSector {
  sector_code: string;
  observation_count: number;
  species_count: number;
  observation_per_ha: number;
  vegetation_ratio: number | null;
  is_hotspot: boolean;
}

export interface HotspotFile {
  source: string;
  attribution: string;
  fetched_on: string;
  method: {
    observation_in_box: number;
    observation_open_location: number;
    kept_in_sector: number;
    accuracy_max_m: number;
    hotspot_min_observation: number;
    hotspot_species_cut: number;
  };
  sector: HotspotSector[];
}

export const HOTSPOT_FILE = hotspot_file as unknown as HotspotFile;
export const HOTSPOT_ATTRIBUTION = "Observation counts © iNaturalist users";

const by_code = new Map(HOTSPOT_FILE.sector.map((s) => [s.sector_code, s]));

export function hotspotOf(sector_code: string): HotspotSector | null {
  return by_code.get(sector_code) ?? null;
}

/** The on-screen method line — says what was counted and what it is not. */
export function hotspotMethodLine(file: HotspotFile = HOTSPOT_FILE): string {
  const m = file.method;
  return (
    `${m.kept_in_sector.toLocaleString("en")} of ${m.observation_in_box.toLocaleString("en")} iNaturalist records in the box ` +
    `(open location, ≤ ${m.accuracy_max_m} m accuracy; fetched ${file.fetched_on}), counted per sector. ` +
    `Hotspot = top fifth by species recorded, among sectors with ≥ ${m.hotspot_min_observation} records. ` +
    `Records follow where people walk and look; this is not a survey.`
  );
}

export function hotspotEmptyLine(file: HotspotFile = HOTSPOT_FILE): string | null {
  return file.method.kept_in_sector === 0 ? `No iNaturalist record with a usable position fell in any sector (fetched ${file.fetched_on}).` : null;
}

const SPECIES_MAX = Math.max(1, ...HOTSPOT_FILE.sector.map((s) => s.species_count));

/** 0..1 on a square-root scale — a few very busy sectors would otherwise wash out the rest. */
export function richnessShade(row: HotspotSector, max = SPECIES_MAX): number {
  return Math.sqrt(row.species_count / max);
}

/** The hotspots, richest first. */
export function hotspotRank(file: HotspotFile = HOTSPOT_FILE): HotspotSector[] {
  return file.sector.filter((s) => s.is_hotspot).sort((a, b) => b.species_count - a.species_count);
}
