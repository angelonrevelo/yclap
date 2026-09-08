import { RESTRICTED_POLYGON } from "./data.ts";
import { distanceMeter, type LatLon } from "./geo.ts";
import { biome_sector, sectorContains, sector as sector_row, type Sector } from "./sector.ts";

/* ── the spawn system ────────────────────────────────────────────────────────
 *
 * The owner asked for spawning "like Pokémon GO" (2026-09-08): a world where
 * finds appear at places, rotate over time, and are worth walking to. This
 * module is that system, kept in a plain `.ts` so a test can import it.
 *
 * Two rules from the roadmap survive inside the game mechanic:
 *
 * 1. **Rarity is data.** The 09-03 note ("rarity must derive from real
 *    observation gaps, not an invented respawn clock") decides HOW RARE a
 *    find is: the species' own iNaturalist observation count inside the campus
 *    box. A bird seen on 96 campus observations is a common spawn; one seen
 *    once is a mythic, and the card says "Once on campus". How OFTEN each
 *    rarity appears is the one invented number — a stated slot table, not a
 *    hidden one. What no count decides alone is WHEN a find appears; that is
 *    the rotation, and the rotation is the game the owner asked for.
 *
 * 2. **Nothing spawns where nothing grows.** Spawns land only inside
 *    `is_biome` sectors (measured vegetation ≥ 0.45), never inside the
 *    restricted grove, never on a car park. A paved sector is drawn but
 *    carries nothing, the same rule the sector card follows.
 *
 * Everything here is DETERMINISTIC: the same pool, the same sectors and the
 * same window always produce the same world. Two devices on the same window
 * see the same spawns — which is what makes it a world rather than a screensaver.
 */

/**
 * One species' real-world weight, straight from the cached iNat campus sweep. */
export interface SpawnPoolEntry {
  species_code: string;
  common_name: string;
  scientific_name: string;
  /** iNaturalist observations inside the campus box (2026-09-03 sweep). */
  count: number;
  origin: string;
  iconic_taxon_name: string;
  archetype: string;
  /** Model path under /model/, present for every modeled species. */
  file: string;
}

export type Rarity = "common" | "uncommon" | "rare" | "mythic";

export const RARITY_LABEL: Record<Rarity, string> = {
  common: "Common",
  uncommon: "Uncommon",
  rare: "Rare",
  mythic: "Once on campus",
};

export const RARITY_ORDER: Rarity[] = ["common", "uncommon", "rare", "mythic"];

/**
 * Rarity from the species' real observation count on this campus.
 *
 * The thresholds are quartiles of being SEEN here, not game balance: a species
 * logged on 50+ campus observations is genuinely everywhere; one logged once
 * is genuinely a "once on campus" event, and the card says exactly that.
 */
export function rarityFor(count: number): Rarity {
  if (count >= 50) return "common";
  if (count >= 10) return "uncommon";
  if (count >= 2) return "rare";
  return "mythic";
}

/**
 * How often each rarity band rolls per find — the one invented number in this
 * module, stated instead of hidden.
 *
 * The real campus sweep is bottom-heavy: most species in it were logged once
 * or twice, so a purely count-weighted roll makes "Once on campus" the most
 * common find in the world, which hollows the word. The band a species belongs
 * to is still pure data (`rarityFor`); this table only decides how often each
 * band APPEARS — the same slot-table idea the genre uses. 55/25/15/5 keeps
 * commons common and makes a mythic a story you tell.
 */
export const RARITY_FREQUENCY: [Rarity, number][] = [
  ["common", 0.55],
  ["uncommon", 0.25],
  ["rare", 0.15],
  ["mythic", 0.05],
];

/** One find in the world for one rotation window. */
export interface Spawn {
  spawn_id: string;
  species_code: string;
  common_name: string;
  lat: number;
  lon: number;
  sector_code: string;
  rarity: Rarity;
  /** Carried from the pool so a list row can draw WHAT KIND of thing this is
   *  without loading the 422 kB pool a second time. Only 25 species have
   *  curated artwork; the other 1,073 have to say "a bird" honestly. */
  iconic_taxon_name: string;
  archetype: string;
  /** ISO instants — this find exists only inside its window. */
  starts_at: string;
  ends_at: string;
}

export const SPAWN_WINDOW_MS = 30 * 60 * 1000;

export interface SpawnWindow {
  index: number;
  starts_at: string;
  ends_at: string;
}

export function spawnWindow(now_ms: number, window_ms: number = SPAWN_WINDOW_MS): SpawnWindow {
  const index = Math.floor(now_ms / window_ms);
  return {
    index,
    starts_at: new Date(index * window_ms).toISOString(),
    ends_at: new Date((index + 1) * window_ms).toISOString(),
  };
}

/* ── deterministic randomness ─────────────────────────────────────────────
 * FNV-1a for the seed, mulberry32 for the stream. Both trivial, both
 * stable across machines — the world must not depend on Math.random().
 */
function fnv(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function inRestricted(point: LatLon): boolean {
  const ring = RESTRICTED_POLYGON;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (a.lat > point.lat !== b.lat > point.lat && point.lon < ((b.lon - a.lon) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lon) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * How well a species belongs on a kind of ground, ×0.5..×2.4.
 *
 * A HEURISTIC and labelled as one: campus sectors have measured vegetation and
 * an OSM kind, but no per-species habitat table exists yet. Trees favour wood,
 * grasses and insects favour open field, ornamentals and birds favour planted
 * walks. When the pool filtered by affinity gets thin it is abandoned rather
 * than followed off a cliff.
 */
export function habitatWeight(sector_kind: string, entry: SpawnPoolEntry): number {
  const taxon = entry.iconic_taxon_name;
  const arch = entry.archetype;
  let w = 1;
  if (sector_kind === "wood") {
    if (arch === "tree") w = 2.2;
    else if (arch === "epiphyte" || arch === "vine" || arch === "shrub") w = 1.5;
    else if (taxon === "Aves") w = 1.3;
    else if (taxon === "Insecta") w = 1.1;
    else w = 0.7;
  } else if (sector_kind === "open-field") {
    if (arch === "grass" || arch === "herb") w = 2.0;
    else if (taxon === "Insecta") w = 1.8;
    else if (taxon === "Aves") w = 1.3;
    else if (arch === "tree") w = 0.5;
    else w = 0.9;
  } else if (sector_kind === "planted-walk") {
    if (arch === "shrub" || arch === "palm" || arch === "ornamental") w = 1.8;
    else if (taxon === "Aves") w = 1.4;
    else if (arch === "tree") w = 1.2;
    else w = 0.9;
  } else if (sector_kind === "cultivated") {
    if (arch === "tree" || arch === "shrub") w = 1.4;
    else if (taxon === "Aves") w = 1.2;
    else w = 1;
  } /* sparse */ else {
    if (taxon === "Insecta") w = 1.5;
    else if (arch === "tree") w = 0.8;
    else w = 1;
  }
  /* The app exists to send eyes to native species. A gentle constant bias,
     stated here rather than hidden in the shuffle. */
  if (entry.origin === "Native") w *= 1.5;
  return w;
}

export interface SpawnOptions {
  window_ms?: number;
  /** Hard ceiling on simultaneous finds — keeps 68 sectors from filling a phone. */
  total_max?: number;
  /** Most finds in one sector (by area, bigger can hold more). */
  per_sector_max?: number;
}

const SPAWN_DEFAULTS = { total_max: 90, per_sector_max: 3 };

/**
 * The world for one rotation window.
 *
 * Per biome sector: a seeded stream decides HOW MANY finds it holds, WHICH
 * species (weighted by real observation count, native bias, habitat fit), and
 * WHERE inside the ring (rejection-sampled to stay inside the sector and
 * outside the restricted grove). Same inputs → same world, on every device.
 */
export function spawnForWindow(
  pool: SpawnPoolEntry[],
  now_ms: number,
  sectors: Sector[] = biome_sector,
  opts: SpawnOptions = {},
): Spawn[] {
  const window_ms = opts.window_ms ?? SPAWN_WINDOW_MS;
  const total_max = opts.total_max ?? SPAWN_DEFAULTS.total_max;
  const per_sector_max = opts.per_sector_max ?? SPAWN_DEFAULTS.per_sector_max;
  const { index, starts_at, ends_at } = spawnWindow(now_ms, window_ms);
  const out: Spawn[] = [];

  /* Biggest sectors first so the ceiling, when it bites, bites the small ones. */
  const ordered = [...sectors].sort((a, b) => b.area_m2 - a.area_m2);

  for (const s of ordered) {
    if (out.length >= total_max) break;
    const rng = mulberry32(fnv(`${s.sector_code}:${index}`));

    /* Roughly a quarter of biomes rest for a window — a world where every
       block always holds a find reads as a vending machine. */
    if (rng() < 0.25) continue;

    let count = 1 + (rng() < 0.55 ? 1 : 0);
    if (s.area_m2 > 8000 && count < per_sector_max) count += 1;
    count = Math.min(count, per_sector_max);

    for (let i = 0; i < count && out.length < total_max; i += 1) {
      const pick = pickSpecies(pool, s, rng);
      if (!pick) continue;
      const at = pointIn(s, rng);
      if (!at) continue;
      out.push({
        spawn_id: `${s.sector_code}-w${index}-${i}`,
        species_code: pick.species_code,
        common_name: pick.common_name,
        lat: at.lat,
        lon: at.lon,
        sector_code: s.sector_code,
        rarity: rarityFor(pick.count),
        iconic_taxon_name: pick.iconic_taxon_name,
        archetype: pick.archetype,
        starts_at,
        ends_at,
      });
    }
  }
  return out;
}

/** Weighted pick of one species for this sector's ground. */
function pickSpecies(pool: SpawnPoolEntry[], s: Sector, rng: () => number): SpawnPoolEntry | null {
  if (!pool.length) return null;

  /* Roll the rarity band first (the stated slot table), then pick inside it.
     A band that this campus's data cannot fill (no mythics in the pool, say)
     falls through to the whole-pool weighted draw rather than to nothing. */
  const roll = rng();
  let acc = 0;
  let band: Rarity | null = null;
  for (const [rarity, freq] of RARITY_FREQUENCY) {
    acc += freq;
    if (roll <= acc) {
      band = rarity;
      break;
    }
  }
  const in_band = band ? pool.filter((e) => rarityFor(e.count) === band) : [];
  const candidates = in_band.length ? in_band : pool;

  /* Affinity second, abandoned when it would leave fewer than 5 candidates. */
  let habitat = candidates.filter((e) => habitatWeight(s.kind, e) >= 1.2);
  if (habitat.length < 5) habitat = candidates;
  const weights = habitat.map((e) => Math.sqrt(e.count + 1) * habitatWeight(s.kind, e));
  const total = weights.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return habitat[0] ?? null;
  let remainder = rng() * total;
  for (let i = 0; i < habitat.length; i += 1) {
    remainder -= weights[i];
    if (remainder <= 0) return habitat[i];
  }
  return habitat[habitat.length - 1];
}

/** A point inside the sector ring and outside the restricted grove, or null. */
function pointIn(s: Sector, rng: () => number): LatLon | null {
  let lat0 = Infinity, lat1 = -Infinity, lon0 = Infinity, lon1 = -Infinity;
  for (const [lat, lon] of s.point) {
    if (lat < lat0) lat0 = lat;
    if (lat > lat1) lat1 = lat;
    if (lon < lon0) lon0 = lon;
    if (lon > lon1) lon1 = lon;
  }
  for (let tries = 0; tries < 40; tries += 1) {
    const at = { lat: lat0 + rng() * (lat1 - lat0), lon: lon0 + rng() * (lon1 - lon0) };
    if (!sectorContains(s, at)) continue;
    if (inRestricted(at)) continue;
    return at;
  }
  return null;
}

/** Finds within `radius_m` of a position, nearest first. */
export function spawnsNear(spawns: Spawn[], at: LatLon, radius_m: number = 60): Spawn[] {
  return spawns
    .map((row) => ({ row, distance_m: distanceMeter(at, row) }))
    .filter((r) => r.distance_m <= radius_m)
    .sort((a, b) => a.distance_m - b.distance_m)
    .map((r) => r.row);
}

/** How close you must be for a find to count as reachable — the catch radius. */
export const REACH_RADIUS_M = 40;

/** The finds you could photograph from where you are standing. */
export function reachableSpawn(spawns: Spawn[], at: LatLon | null | undefined): Spawn[] {
  if (!at) return [];
  return spawnsNear(spawns, at, REACH_RADIUS_M);
}

export interface NearSpawn {
  row: Spawn;
  /** Null when there is no fix — an unmeasured distance, never a 0. */
  distance_m: number | null;
}

/**
 * What the strip shows, and in what order.
 *
 * With a fix: nearest first. Without one, "nearby" is a claim we cannot make,
 * so it switches to the rarest thing out this window and reports the distance
 * as null rather than as zero. The caller says which of the two it is showing.
 */
export function rankSpawn(spawns: Spawn[], at: LatLon | null, limit: number): NearSpawn[] {
  if (at) {
    return spawns
      .map((row) => ({ row, distance_m: distanceMeter(at, row) }))
      .sort((a, b) => a.distance_m - b.distance_m)
      .slice(0, limit);
  }
  const rank = (r: Rarity) => -RARITY_ORDER.indexOf(r);
  return [...spawns]
    .sort((a, b) => rank(a.rarity) - rank(b.rarity) || a.spawn_id.localeCompare(b.spawn_id))
    .slice(0, limit)
    .map((row) => ({ row, distance_m: null }));
}

/** Whole minutes until this window closes. Never negative. */
export function windowMinuteLeft(ends_at: string, now_ms: number): number {
  return Math.max(0, Math.ceil((new Date(ends_at).getTime() - now_ms) / 60000));
}

/** Every sector find, indexed by the sector that holds it (for the map pass). */
export function spawnBySector(spawns: Spawn[]): Map<string, Spawn[]> {
  const out = new Map<string, Spawn[]>();
  for (const row of spawns) {
    const list = out.get(row.sector_code) ?? [];
    list.push(row);
    out.set(row.sector_code, list);
  }
  return out;
}

/** The spawn pool as loaded — a test seam so tests never fetch. */
export function poolFromFile(json: { model: unknown }): SpawnPoolEntry[] {
  const rows = Array.isArray(json.model) ? json.model : [];
  return rows
    .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
    .filter((e) => typeof e.species_code === "string" && typeof e.file === "string")
    .map((e) => ({
      species_code: e.species_code as string,
      common_name: typeof e.common_name === "string" ? e.common_name : (e.scientific_name as string) ?? (e.species_code as string),
      scientific_name: typeof e.scientific_name === "string" ? e.scientific_name : (e.species_code as string),
      count: typeof e.count === "number" ? e.count : 0,
      origin: typeof e.origin === "string" ? e.origin : "Unknown",
      iconic_taxon_name: typeof e.iconic_taxon_name === "string" ? e.iconic_taxon_name : "Unknown",
      archetype: typeof e.archetype === "string" ? e.archetype : "unknown",
      file: e.file as string,
    }));
}

/* Re-exported so a caller does not need sector.ts to mean the same list. */
export const spawn_sectors: Sector[] = sector_row.filter((s) => s.is_biome);
