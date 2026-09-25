import { biomeContains, drawn_biome, type Biome } from "./biome.ts";
import { encounter, ENCOUNTER_RADIUS_M, type Encounter } from "./data.ts";
import { sectorAt, sectorContains, type Sector } from "./sector.ts";
import type { Spawn } from "./spawn.ts";
import { bearingDegree, compassPoint, distanceMeter, type LatLon } from "./geo.ts";

export interface NearbyEncounter {
  row: Encounter;
  distance_m: number;
  bearing_degree: number;
  compass: string;
  is_at: boolean;
}

/** Every encounter ranked by true metre distance from a position. */
export function rankEncounter(from: LatLon, row: Encounter[] = encounter): NearbyEncounter[] {
  return row
    .map((e) => {
      const distance_m = distanceMeter(from, e);
      const bearing_degree = bearingDegree(from, e);
      return {
        row: e,
        distance_m,
        bearing_degree,
        compass: compassPoint(bearing_degree),
        is_at: distance_m <= ENCOUNTER_RADIUS_M,
      };
    })
    .sort((a, b) => a.distance_m - b.distance_m);
}

export function nearestEncounter(from: LatLon, row: Encounter[] = encounter): NearbyEncounter | null {
  return rankEncounter(from, row)[0] ?? null;
}

/* ── the biome unit ──────────────────────────────────────────────────────────
 *
 * Since the 09-02 pivot the card opens on AREA, not on distance: entering a
 * biome pops its card, leaving closes it. Distance (25 m / 8 m haversine) is
 * still correct and still tested — it now ranks the species representatives
 * WITHIN a biome instead of deciding which card is open.
 */

export interface BiomePresence {
  row: Biome;
  /** Encounters inside this biome, nearest first — the residents you can log. */
  resident: NearbyEncounter[];
}

/**
 * Every drawn biome that contains the position, seed order first. Containment
 * by ray casting — never by "closest polygon", which is the per-tree rule in
 * disguise and breaks where parcels adjoin.
 */
export function rankBiome(
  from: LatLon,
  row: Biome[] = drawn_biome,
  pool: Encounter[] = encounter,
): BiomePresence[] {
  return row
    .filter((b) => biomeContains(b, from))
    .map((b) => ({
      row: b,
      resident: rankEncounter(
        from,
        pool.filter((e) => biomeContains(b, e)),
      ),
    }));
}

export function biomePresenceAt(
  from: LatLon,
  row: Biome[] = drawn_biome,
  pool: Encounter[] = encounter,
): BiomePresence | null {
  return rankBiome(from, row, pool)[0] ?? null;
}

/* ── sector residents ────────────────────────────────────────────────────────
 *
 * Which curated encounters fall INSIDE a sector.
 *
 * Not baked into `campus-sector.json` on purpose. Written into the file these
 * would read as survey data — "this sector contains a Narra" — when what we
 * actually have is a demo-map position from the 09-03 seed. Derived at runtime
 * from `encounter`, they stay exactly what they are: the walk's own props,
 * labelled as such wherever they render, and superseded the moment the AIS
 * inventory lands with real counts and locations.
 *
 * Six of the eight demo encounters land in a biome; two sit on the path
 * network itself, and those are simply not residents of anywhere.
 */

export interface SectorResident {
  row: Sector;
  resident: Encounter[];
}

export function sectorResident(of: Sector, pool: Encounter[] = encounter): Encounter[] {
  return pool.filter((e) => sectorContains(of, { lat: e.lat, lon: e.lon }));
}

/** Every encounter that has a home, paired with the sector that holds it. */
export function residentBySector(pool: Encounter[] = encounter): Map<string, Encounter[]> {
  const out = new Map<string, Encounter[]>();
  for (const e of pool) {
    const at = sectorAt({ lat: e.lat, lon: e.lon });
    if (!at || !at.is_biome) continue;
    const list = out.get(at.sector_code) ?? [];
    list.push(e);
    out.set(at.sector_code, list);
  }
  return out;
}

export interface TrayRow {
  spawn: Spawn;
  /** How many finds of this species are out right now (the first is the nearest). */
  find_count: number;
}

/**
 * The Nearby tray's rows: one per species, in the order the finds arrive
 * (nearest first), so a species out twice — two Macarthur Palms — is listed
 * once with its count instead of as two identical tiles.
 */
export function trayRow(spawn: Spawn[], limit = 8): TrayRow[] {
  const by_code = new Map<string, TrayRow>();
  for (const s of spawn) {
    const hit = by_code.get(s.species_code);
    if (hit) hit.find_count += 1;
    else by_code.set(s.species_code, { spawn: s, find_count: 1 });
  }
  return [...by_code.values()].slice(0, limit);
}
