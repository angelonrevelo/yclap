import { RESTRICTED_POLYGON } from "./data.ts";
import { CAMPUS_BOX, distanceMeter, type LatLon } from "./geo.ts";
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
  /** iNaturalist observations inside the campus box (2026-09-03 sweep).
   *  Null when the sweep has no count for it — never silently 0. */
  count: number | null;
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
export function rarityFor(count: number | null | undefined): Rarity | null {
  /* No observation record is not a rarity. It used to fall through to
     "mythic" — the strongest claim in the system — on the strength of a
     missing field. */
  if (count === null || count === undefined) return null;
  if (count >= 50) return "common";
  if (count >= 10) return "uncommon";
  if (count >= 2) return "rare";
  if (count >= 1) return "mythic";
  return null;
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
  scientific_name: string;
  lat: number;
  lon: number;
  sector_code: string;
  /** Null when the sweep has no count for the species — the card then makes
   *  no rarity claim at all rather than guessing one. */
  rarity: Rarity | null;
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
  /* The app exists to send eyes to native species, so a gentle constant bias —
     stated here rather than hidden in the shuffle.

     MEASURED LIMIT, 2026-09-08: only 9 of the 1,098 pool entries carry an
     origin at all (6 Native, 3 Exotic); the other 1,089 are null, because the
     iNat sweep did not capture establishment means. So this multiplier is
     currently inert for 99.2% of the world. It is left in place rather than
     deleted because the fix is a data fix — re-run the sweep asking for
     `establishment_means` — and `spawn.test.ts` pins the coverage so this
     cannot quietly stay broken. Do NOT read the bias as active in the demo. */
  if (entry.origin === "Native") w *= 1.5;
  return w;
}

export interface SpawnOptions {
  window_ms?: number;
  /** Hard ceiling on simultaneous finds — keeps 68 sectors from filling a phone. */
  total_max?: number;
  /** Most finds in one sector (by area, bigger can hold more). */
  per_sector_max?: number;
  /** Sectors this device has already walked — rest more often so quiet ground opens (`1:43:56`). */
  explored_sector?: ReadonlySet<string>;
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

    /* Quiet-ground bias (09-09): already-walked sectors rest more; unvisited
       ones almost always hold a find. With no journal yet, keep the old 1/4 rest. */
    const explored = opts.explored_sector;
    const rest =
      explored && explored.size > 0 ? (explored.has(s.sector_code) ? 0.45 : 0.1) : 0.25;
    if (rng() < rest) continue;

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
        scientific_name: pick.scientific_name,
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
  /* An unrecorded species still deserves to appear — it is on campus, we
     simply have no iNat count for it — so it takes the weakest positive
     weight rather than being dropped or treated as abundant. */
  const weights = habitat.map((e) => Math.sqrt((e.count ?? 0) + 1) * habitatWeight(s.kind, e));
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
  /* Unknown rarity sorts LAST. It is an absence of data, and an absence must
     not be promoted to the top of a "rarest first" list. */
  const rank = (r: Rarity | null) => (r === null ? 1 : -RARITY_ORDER.indexOf(r));
  return [...spawns]
    .sort((a, b) => rank(a.rarity) - rank(b.rarity) || a.spawn_id.localeCompare(b.spawn_id))
    .slice(0, limit)
    .map((row) => ({ row, distance_m: null }));
}

/** Whole minutes until this window closes. Never negative. */
export function windowMinuteLeft(ends_at: string, now_ms: number): number {
  return Math.max(0, Math.ceil((new Date(ends_at).getTime() - now_ms) / 60000));
}

/** The finds standing in one sector — capped at three (09-09 `1:56:55`). */
export function spawnInSector(spawns: Spawn[], sector_code: string, limit = 3): Spawn[] {
  return spawns.filter((row) => row.sector_code === sector_code).slice(0, limit);
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
      /* NOT coerced to 0. A missing count means the sweep never observed the
         species, which is not the same as observing it once — and 0 fed
         `rarityFor` produced "Once on campus" for MAHOGANY, the tree this
         project's own problem tree says dominates the campus. Four of the
         1,098 are in this state, and all four are curated species with drawn
         cards, so they are exactly the ones a judge would recognise. */
      count: typeof e.count === "number" ? e.count : null,
      origin: typeof e.origin === "string" ? e.origin : "Unknown",
      iconic_taxon_name: typeof e.iconic_taxon_name === "string" ? e.iconic_taxon_name : "Unknown",
      archetype: typeof e.archetype === "string" ? e.archetype : "unknown",
      file: e.file as string,
    }));
}

/* Re-exported so a caller does not need sector.ts to mean the same list. */
export const spawn_sectors: Sector[] = sector_row.filter((s) => s.is_biome);

/* ── the near field ─────────────────────────────────────────────────────────
 *
 * `spawnForWindow` spreads a fixed budget of finds across the whole campus, and
 * that was right while the map was a survey you read from above. It stops being
 * right the moment the camera is welded to the walker at z19–22, where the
 * screen holds one or two sectors: ninety finds spread over 38.8 hectares means
 * a screen with nothing on it, and a game whose content you can only see by
 * leaving the view it is played in.
 *
 * The genre's answer is that the world is dense EVERYWHERE and you only ever
 * see your own patch of it. This is that — but it has to keep the property the
 * README already promises, that two phones standing side by side see the same
 * finds. So the field is not generated around the player. It is generated on a
 * grid fixed to the campus itself, and the player simply reads the cells they
 * are near. Walking does not roll new dice; it brings you to dice already cast.
 */

/** Grid pitch. One cell is about four paces across, so a find is never far. */
export const SPAWN_CELL_M = 35;

/** How far out the dense field is generated, in metres. */
export const NEAR_FIELD_M = 170;

/**
 * Chance a habitable cell holds a find this window. An invented number, like
 * the rarity bands. It was 0.34 until a 09-26 playtest: at the street camera
 * the best footpath on campus then averaged 2.5 finds within 60 m and showed
 * fewer than two in a quarter of all windows, so a first screen was often
 * empty. At 0.62 the stick start averages 4.6 and never fewer than two.
 */
const CELL_DENSITY = 0.62;

const CELL_LAT = SPAWN_CELL_M / 110_540;

/**
 * The grid's longitude pitch, fixed to the campus rather than to the walker.
 *
 * Deriving it from the reader's own latitude looks harmless and is not: two
 * phones a few metres apart then lay down grids of very slightly different
 * widths, and the finds they compute drift apart — quietly, by centimetres, in
 * exactly the situation the seeded world exists to make identical. One
 * constant, taken at the middle of campus, is what makes the grid a property of
 * the ground instead of a property of whoever is standing on it.
 */
const CELL_LON =
  SPAWN_CELL_M /
  (111_320 * Math.cos((((CAMPUS_BOX.north + CAMPUS_BOX.south) / 2) * Math.PI) / 180));

/** The biome sector a point falls in, or null. Paved ground answers null. */
function biomeAt(point: LatLon): Sector | null {
  for (const s of biome_sector) if (sectorContains(s, point)) return s;
  return null;
}

/**
 * The dense local field around `at`.
 *
 * Every cell within `NEAR_FIELD_M` is asked the same three questions in the
 * same order, seeded by the cell's own absolute index and the window: does
 * anything grow here, does anything spawn here this window, and what. None of
 * the three can see the player, which is what makes two devices agree.
 */
export function spawnAround(
  pool: SpawnPoolEntry[],
  now_ms: number,
  at: LatLon,
  opts: SpawnOptions & { radius_m?: number } = {},
): Spawn[] {
  const radius_m = opts.radius_m ?? NEAR_FIELD_M;
  const window_ms = opts.window_ms ?? SPAWN_WINDOW_MS;
  const { index, starts_at, ends_at } = spawnWindow(now_ms, window_ms);
  const reach = Math.ceil(radius_m / SPAWN_CELL_M);

  /* Absolute cell indices — floor of the position in cell units, measured from
     the equator and the prime meridian rather than from the player. */
  const col0 = Math.floor(at.lon / CELL_LON);
  const row0 = Math.floor(at.lat / CELL_LAT);

  const out: Spawn[] = [];
  for (let dr = -reach; dr <= reach; dr += 1) {
    for (let dc = -reach; dc <= reach; dc += 1) {
      const row = row0 + dr;
      const col = col0 + dc;
      const centre: LatLon = {
        lat: (row + 0.5) * CELL_LAT,
        lon: (col + 0.5) * CELL_LON,
      };
      if (distanceMeter(at, centre) > radius_m) continue;

      const s = biomeAt(centre);
      if (!s) continue;

      const rng = mulberry32(fnv(`cell:${col}:${row}:${index}`));

      /* Ground you have already worked rests more often, the same 09-09 rule
         the campus-wide world follows — so a sector you have walked flat does
         not stay as busy as one you have never entered. */
      const explored = opts.explored_sector;
      const density =
        explored && explored.has(s.sector_code) ? CELL_DENSITY * 0.55 : CELL_DENSITY;
      if (rng() >= density) continue;

      const pick = pickSpecies(pool, s, rng);
      if (!pick) continue;

      /* Jitter inside the cell, then check it is really on that ground. A find
         nudged onto a car park or into the grove is dropped, not clamped:
         clamping would pile finds against the edge of every restriction. */
      const point: LatLon = {
        lat: (row + rng()) * CELL_LAT,
        lon: (col + rng()) * CELL_LON,
      };
      if (!sectorContains(s, point)) continue;
      if (inRestricted(point)) continue;

      out.push({
        spawn_id: `cell-${col}-${row}-w${index}`,
        species_code: pick.species_code,
        common_name: pick.common_name,
        scientific_name: pick.scientific_name,
        lat: point.lat,
        lon: point.lon,
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

/**
 * What the app actually plays against: a dense field under the walker, and the
 * sparse campus-wide world everywhere else.
 *
 * The two never overlap — the campus-wide half is filtered to what lies OUTSIDE
 * the near field's radius — so no find is ever drawn twice and no `spawn_id`
 * collides. With no fix there is no near field, and this is exactly the old
 * campus-wide world, which is what the projector demo and the first paint both
 * get before a position arrives.
 */
export function spawnWorld(
  pool: SpawnPoolEntry[],
  now_ms: number,
  at: LatLon | null | undefined,
  opts: SpawnOptions & { radius_m?: number } = {},
): Spawn[] {
  const far = spawnForWindow(pool, now_ms, undefined, opts);
  if (!at) return far;
  const radius_m = opts.radius_m ?? NEAR_FIELD_M;
  const near = spawnAround(pool, now_ms, at, opts);
  return [...near, ...far.filter((row) => distanceMeter(at, row) > radius_m)];
}

/**
 * The grid cell a point falls in, as a string.
 *
 * A memo key, and the reason it lives here: the near field may only be rebuilt
 * when the walker crosses a cell boundary, and the only way to guarantee that
 * is for the key and the grid to be computed from the same two constants. A
 * caller that derived its own would drift from the grid the moment either
 * changed, and the symptom would be a world that rebuilds every GPS frame.
 */
export function spawnCellKey(at: LatLon): string {
  return `${Math.floor(at.lat / CELL_LAT)}:${Math.floor(at.lon / CELL_LON)}`;
}
