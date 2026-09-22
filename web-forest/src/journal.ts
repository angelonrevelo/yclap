import { picker_order } from "./data.ts";
import { biomeContains, biome as biome_row, type Biome } from "./biome.ts";
import { sectorAt, sectorContains, sector as sector_list, type Sector } from "./sector.ts";
import { distanceMeter, formatLatLon, type Fix, type FixSource, type LatLon } from "./geo.ts";
import { stageFor, toNextStage, type Stage } from "./stage.ts";

export interface Sighting {
  sighting_id: string;
  species_code: string;
  photo_data: string | null;
  created_at: string;
  inat_scientific_name: string | null;
  inat_common_name: string | null;
  /** Where it was logged. null when no fix was available at save time. */
  lat: number | null;
  lon: number | null;
  accuracy_m: number | null;
  /** "gps" = a real device fix. "demo" = the scripted stage loop. "play" = you steered. */
  fix_source: FixSource | null;
  note: string | null;
  walk_id: string | null;
  /**
   * The two ways to earn (build spec T2.2, per `29:45` / `33:36`) — kept as two
   * separate counters, never summed into one score. "badge" = photograph a
   * species on the guide's list. "contribution" = report one the guide lacks.
   */
  entry_kind: "badge" | "contribution";
  /** What the caller says they saw, for contributions off the curated list. */
  reported_name: string | null;
  /**
   * A stable catalogue number, 1-based, assigned once when the entry is saved
   * and never recomputed. Deliberately NOT the array position: deleting an
   * early entry must not renumber every later one, because a student who
   * photographed "No. 7" should still find No. 7 tomorrow.
   */
  entry_index: number;
}

/** One recorded position along a walk. Kept flat so it survives JSON round-trip. */
export interface WalkFix {
  lat: number;
  lon: number;
  at: number;
  source: FixSource;
}

export interface Walk {
  walk_id: string;
  started_at: string;
  ended_at: string | null;
  /**
   * The breadcrumb trail. Without it a receipt can only guess at distance, and
   * a guessed distance on a summary screen is exactly the kind of invented
   * number this project refuses. Walks recorded before this field existed read
   * back as an empty track and their receipt says so rather than showing 0 m.
   */
  track: WalkFix[];
}

const STORAGE_KEY = "field-guide.sighting";
const WALK_KEY = "field-guide.walk";

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parse(raw: string | null): Sighting[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.flatMap((row): Sighting[] => {
      if (
        row == null ||
        typeof row !== "object" ||
        typeof (row as Sighting).sighting_id !== "string" ||
        typeof (row as Sighting).species_code !== "string"
      ) {
        return [];
      }
      const r = row as Record<string, unknown>;
      const source = r.fix_source;
      /* Rows saved before the T2 counters predate entry_kind; a curated
         species was always a badge attempt, so read them as one. */
      const kind = r.entry_kind === "contribution" ? "contribution" : "badge";
      return [
        {
          sighting_id: r.sighting_id as string,
          species_code: r.species_code as string,
          photo_data: str(r.photo_data),
          created_at: typeof r.created_at === "string" ? r.created_at : "",
          inat_scientific_name: str(r.inat_scientific_name),
          inat_common_name: str(r.inat_common_name),
          lat: num(r.lat),
          lon: num(r.lon),
          accuracy_m: num(r.accuracy_m),
          fix_source: source === "gps" || source === "demo" || source === "play" ? source : null,
          note: str(r.note),
          walk_id: str(r.walk_id),
          entry_kind: kind,
          /* Rows saved before catalogue numbers existed get theirs from their
             stored position, which is fixed, so the assignment is stable too. */
          entry_index: num(r.entry_index) ?? 0,
          reported_name: str(r.reported_name),
        },
      ];
    });
  } catch {
    return [];
  }
}

export function readSighting(): Sighting[] {
  /* Backfill happens on the way in, so every caller sees numbered entries and
     the next save persists them. */
  return withEntryIndex(parse(localStorage.getItem(STORAGE_KEY)));
}

export function writeSighting(row: Sighting[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(row));
}

export interface SightingDraft {
  species_code: string;
  photo_data: string | null;
  inat_scientific_name?: string | null;
  inat_common_name?: string | null;
  point?: (LatLon & { accuracy_m: number; source: FixSource }) | null;
  note?: string | null;
  walk_id?: string | null;
  entry_kind?: "badge" | "contribution";
  reported_name?: string | null;
}

export function addSighting(draft: SightingDraft): Sighting {
  const next: Sighting = {
    sighting_id: `${draft.species_code}-${Date.now()}`,
    species_code: draft.species_code,
    photo_data: draft.photo_data,
    created_at: new Date().toISOString(),
    inat_scientific_name: draft.inat_scientific_name ?? null,
    inat_common_name: draft.inat_common_name ?? null,
    lat: draft.point?.lat ?? null,
    lon: draft.point?.lon ?? null,
    accuracy_m: draft.point?.accuracy_m ?? null,
    fix_source: draft.point?.source ?? null,
    note: draft.note?.trim() || null,
    walk_id: draft.walk_id ?? null,
    entry_kind: draft.entry_kind ?? "badge",
    reported_name: draft.reported_name?.trim() || null,
    entry_index: 0,
  };
  const row = readSighting();
  next.entry_index = nextEntryIndex(row);
  writeSighting([...row, next]);
  return next;
}

/**
 * Pull a shared find onto this device. Photos never come down — only the
 * species + place the other phone already sent up.
 */
export function mergeRemoteSighting(wire: {
  sighting_id: string;
  species_code: string;
  common_name: string;
  lat: number | null;
  lon: number | null;
  entry_kind?: "badge" | "contribution";
  created_at: string;
}): boolean {
  const row = readSighting();
  if (row.some((s) => s.sighting_id === wire.sighting_id)) return false;
  const next: Sighting = {
    sighting_id: wire.sighting_id,
    species_code: wire.species_code,
    photo_data: null,
    created_at: wire.created_at,
    inat_scientific_name: null,
    inat_common_name: wire.common_name || null,
    lat: wire.lat,
    lon: wire.lon,
    accuracy_m: null,
    fix_source: wire.lat !== null ? "gps" : null,
    note: null,
    walk_id: null,
    entry_kind: wire.entry_kind === "contribution" ? "contribution" : "badge",
    reported_name: null,
    entry_index: nextEntryIndex(row),
  };
  writeSighting([...row, next]);
  return true;
}

/** One past the highest number ever handed out, so numbers are never reused. */
export function nextEntryIndex(row: Sighting[]): number {
  return row.reduce((high, s) => Math.max(high, s.entry_index), 0) + 1;
}

/**
 * Backfill catalogue numbers onto rows saved before they existed. Position in
 * the stored array is the only ordering those rows have, and it does not
 * change, so this is deterministic.
 */
export function withEntryIndex(row: Sighting[]): Sighting[] {
  let high = row.reduce((n, s) => Math.max(n, s.entry_index), 0);
  return row.map((s) => (s.entry_index > 0 ? s : { ...s, entry_index: (high += 1) }));
}

export function removeSighting(sighting_id: string): void {
  writeSighting(readSighting().filter((s) => s.sighting_id !== sighting_id));
}

export function seenCode(row: Sighting[]): Set<string> {
  return new Set(row.map((s) => s.species_code));
}

/* ── gamification, guarded (build spec T2, 2026-09-03) ────────────────────
 *
 * Everything here is PERSONAL. The forbidden axis is comparison between
 * users — `test/journal.test.ts` fails on any `leaderboard` / `rank` /
 * `percentile` / cross-user aggregate, sourced to the 09-02 pulong decision
 * (option b) and to the softened-but-never-lifted rule in
 * `docs/roadmap-rejected.md`. Level, stage and progress are per-user facts
 * derived from this journal and this journal only.
 */

export function isBadge(row: Sighting): boolean {
  return row.entry_kind === "badge";
}

export function isContribution(row: Sighting): boolean {
  return row.entry_kind === "contribution";
}

/** The two ways to earn, side by side — displayed and exported separately. */
export interface EarnCounters {
  badge_count: number;
  contribution_count: number;
}

export function counters(row: Sighting[]): EarnCounters {
  return {
    badge_count: row.filter(isBadge).length,
    contribution_count: row.filter(isContribution).length,
  };
}

/** Species from a biome's list this journal has located INSIDE that biome. */
export interface BiomeProgress {
  biome_code: string;
  seen_code: string[];
  seen_count: number;
  /** The biome's own species_code length — never a campus-wide claim. */
  total: number;
}

export function biomeProgress(row: Sighting[], of: Biome): BiomeProgress {
  const seen = new Set<string>();
  for (const s of row) {
    if (!isBadge(s) || s.lat === null || s.lon === null) continue;
    if (!biomeContains(of, { lat: s.lat, lon: s.lon })) continue;
    if (of.species_code.includes(s.species_code)) seen.add(s.species_code);
  }
  return {
    biome_code: of.biome_code,
    seen_code: [...seen],
    seen_count: seen.size,
    total: of.species_code.length,
  };
}

/* ── sectors (09-03 correction) ───────────────────────────────────────────
 *
 * The unit is now a face of the path network, not a ring we drew. These read
 * the same journal the biome functions above read — the only thing that
 * changed is which polygon a sighting is tested against. Still personal, still
 * no cross-user field anywhere in here.
 */

/** Sector codes this journal has a located badge inside. Personal, always. */
export function seenSector(row: Sighting[], of: Sector[] = sector_list): Set<string> {
  const seen = new Set<string>();
  for (const s of row) {
    if (!isBadge(s) || s.lat === null || s.lon === null) continue;
    const at = sectorAt({ lat: s.lat, lon: s.lon }, of);
    if (at) seen.add(at.sector_code);
  }
  return seen;
}

export interface SectorProgress {
  sector_code: string;
  seen_code: string[];
  seen_count: number;
  /** The sector's own provisional species list — never a campus-wide claim. */
  total: number;
}

export function sectorProgress(row: Sighting[], of: Sector): SectorProgress {
  const seen = new Set<string>();
  for (const s of row) {
    if (!isBadge(s) || s.lat === null || s.lon === null) continue;
    if (!sectorContains(of, { lat: s.lat, lon: s.lon })) continue;
    if (of.species_code.includes(s.species_code)) seen.add(s.species_code);
  }
  return {
    sector_code: of.sector_code,
    seen_code: [...seen],
    seen_count: seen.size,
    total: of.species_code.length,
  };
}

/**
 * How lively the character looks, 0..1 — `1:08:20`: it loses leaves when
 * nobody walks.
 *
 * Two properties this must have, and both are asserted in the tests: it is
 * fully recoverable (one walk today puts it back to 1), and it never touches
 * stage or any counter. Absence changes appearance, never progress.
 */
export const VIGOR_FADE_DAY = 14;

export function vigorOf(row: Sighting[], now: number = Date.now()): number {
  if (!row.length) return 1;
  const last = Math.max(...row.map((s) => new Date(s.created_at).getTime()));
  const day = (now - last) / 86400000;
  if (day <= 1) return 1;
  return Math.max(0.25, 1 - (day - 1) / VIGOR_FADE_DAY);
}

/**
 * One point per distinct badge species, one per contribution. Every 3 points
 * the level rises; each level exposes one more biome. Derived from this
 * journal alone — there is nothing else to derive it from, which is the point.
 */
export const LEVEL_STEP = 3;

export function progressPointsOf(row: Sighting[]): number {
  const badge_species = seenCode(row.filter(isBadge));
  return badge_species.size + row.filter(isContribution).length;
}

export function levelOf(row: Sighting[]): number {
  return 1 + Math.floor(progressPointsOf(row) / LEVEL_STEP);
}

/** Early levels expose fewer biomes; progression unlocks more (`32:40`). */
export function unlockedBiomeCount(row: Sighting[]): number {
  return Math.min(biome_row.length, levelOf(row) + 1);
}

/**
 * Rarity without an invented clock (`33:04`): a species not photographed for
 * N days reads "not seen lately", traced to a real journal timestamp. Nothing
 * respawns on a timer we made up.
 */
export const NOT_SEEN_LATELY_DAYS = 7;

export function lastSeenAt(row: Sighting[], species_code: string): string | null {
  const stamps = row
    .filter((s) => s.species_code === species_code)
    .map((s) => s.created_at)
    .filter(Boolean)
    .sort();
  return stamps[stamps.length - 1] ?? null;
}

export function isNotSeenLately(row: Sighting[], species_code: string, now: number): boolean {
  const last = lastSeenAt(row, species_code);
  if (!last) return true; // never seen here — the gap the walk should point at
  const age_ms = now - new Date(last).getTime();
  return age_ms > NOT_SEEN_LATELY_DAYS * 24 * 60 * 60 * 1000;
}

/* ── progress bundle (build spec T2, 2026-09-06) ──────────────────────────
 *
 * One object a screen can read to show the walker's own growth — level, stage,
 * the two earn counters, how many sectors they have walked into, and how far
 * the next stage is. Every field is derived from THIS journal only. The rule
 * the test guards (option b): per-user progression is allowed; cross-user
 * comparison — `leaderboard`, `rank`, `percentile`, any field naming another
 * user — is not. `progressOf` is the single surface for that bundle so the
 * guard has one shape to check, not a scatter of loose functions.
 */
export interface Progress {
  level: number;
  stage: Stage;
  progress: number;
  /** Distinct species photographed (badges only). */
  seen_count: number;
  badge_count: number;
  contribution_count: number;
  /** Sectors this journal has a located badge inside. */
  sector_seen_count: number;
  /** Biomes unlocked by level — the same number `unlockedBiomeCount` returns. */
  biome_unlocked: number;
  next_stage: { stage: Stage; remaining: number } | null;
  /** 0..1. Leaf vitality; 1 is full canopy, never a stage loss. */
  vigor: number;
}

export function progressOf(row: Sighting[], now: number = Date.now()): Progress {
  const badge_row = row.filter(isBadge);
  const sector_seen = seenSector(badge_row);
  const sector_seen_count = sector_seen.size;
  return {
    level: levelOf(row),
    stage: stageFor(sector_seen_count),
    progress: progressPointsOf(row),
    seen_count: seenCode(badge_row).size,
    badge_count: badge_row.length,
    contribution_count: row.filter(isContribution).length,
    sector_seen_count,
    biome_unlocked: unlockedBiomeCount(row),
    next_stage: toNextStage(sector_seen_count),
    vigor: vigorOf(row, now),
  };
}

/* ── walk session ───────────────────────────────────────────────────────── */

/**
 * A fix nearer than this to the last recorded one is dropped. GPS jitter while
 * standing still would otherwise accumulate hundreds of phantom metres onto
 * the receipt, which is the classic way a step counter lies.
 */
export const TRACK_MIN_METER = 6;

/** Ceiling on stored points, so a two-hour walk cannot fill localStorage. */
export const TRACK_MAX_POINT = 2000;

function readTrack(value: unknown): WalkFix[] {
  if (!Array.isArray(value)) return [];
  const out: WalkFix[] = [];
  for (const raw of value) {
    const lat = num((raw as WalkFix)?.lat);
    const lon = num((raw as WalkFix)?.lon);
    const at = num((raw as WalkFix)?.at);
    const source = (raw as WalkFix)?.source;
    if (lat === null || lon === null || at === null) continue;
    if (source !== "gps" && source !== "demo") continue;
    out.push({ lat, lon, at, source });
  }
  return out;
}

export function readWalk(): Walk | null {
  try {
    const raw = localStorage.getItem(WALK_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Walk;
    if (typeof value?.walk_id !== "string") return null;
    /* Walks written before the track existed read back with an empty one. */
    return { ...value, track: readTrack(value.track) };
  } catch {
    return null;
  }
}

function writeWalk(walk: Walk): Walk {
  localStorage.setItem(WALK_KEY, JSON.stringify(walk));
  return walk;
}

export function startWalk(): Walk {
  return writeWalk({
    walk_id: `walk-${Date.now()}`,
    started_at: new Date().toISOString(),
    ended_at: null,
    track: [],
  });
}

/**
 * Append a position to the open walk. Returns the walk when the point was
 * kept, null when there is no walk running or the fix did not move far enough
 * to be worth recording.
 */
export function trackWalk(fix: Fix, walk: Walk | null = readWalk()): Walk | null {
  if (!walk) return null;
  const last = walk.track[walk.track.length - 1];
  if (last && distanceMeter(last, fix) < TRACK_MIN_METER) return null;
  if (walk.track.length >= TRACK_MAX_POINT) return null;
  const track = [...walk.track, { lat: fix.lat, lon: fix.lon, at: fix.at, source: fix.source }];
  return writeWalk({ ...walk, track });
}

/** Haversine sum along the recorded trail. Zero for a track of under two points. */
export function trackMeter(track: WalkFix[]): number {
  let meter = 0;
  for (let i = 1; i < track.length; i += 1) meter += distanceMeter(track[i - 1], track[i]);
  return meter;
}

/**
 * What a walk amounted to. Counts and names only — the same rule the journal
 * summary follows, so nothing here can be read as a score against anyone else.
 */
export interface WalkReceipt {
  walk_id: string;
  started_at: string;
  ended_at: string;
  elapsed_minute: number;
  /** Haversine sum of the recorded fixes. */
  distance_meter: number;
  /** True when no fix was ever recorded, so the distance is unknown, not zero. */
  is_distance_unknown: boolean;
  /** Sectors the trail passed through, in the order they were first entered. */
  sector_code: string[];
  sector_count: number;
  species_code: string[];
  species_count: number;
  /** Of those, the ones this walk was the first ever sighting of. */
  new_species_code: string[];
  new_species_count: number;
  /** "demo" when the stage loop drove the walk — said out loud on the receipt. */
  fix_source: FixSource | null;
  is_demo: boolean;
}

/**
 * Close a walk out. `row` is the whole journal, not just this walk's rows,
 * because "new to the journal" can only be decided against everything logged
 * before this walk started.
 */
export function walkReceipt(walk: Walk, row: Sighting[], ended_at = new Date().toISOString()): WalkReceipt {
  const mine = row.filter((s) => s.walk_id === walk.walk_id);
  const earlier = row.filter((s) => s.walk_id !== walk.walk_id);
  const seen_before = new Set(earlier.map((s) => s.species_code));

  const species_code: string[] = [];
  for (const s of mine) if (!species_code.includes(s.species_code)) species_code.push(s.species_code);

  const sector_code: string[] = [];
  for (const point of walk.track) {
    const found = sectorAt(point);
    if (found && !sector_code.includes(found.sector_code)) sector_code.push(found.sector_code);
  }

  const new_species_code = species_code.filter((code) => !seen_before.has(code));
  const source_seen = new Set([...walk.track.map((p) => p.source), ...mine.map((s) => s.fix_source)]);
  const fix_source = source_seen.has("demo")
    ? "demo"
    : source_seen.has("gps")
      ? "gps"
      : source_seen.has("play")
        ? "play"
        : null;
  const elapsed_ms = new Date(ended_at).getTime() - new Date(walk.started_at).getTime();

  return {
    walk_id: walk.walk_id,
    started_at: walk.started_at,
    ended_at,
    elapsed_minute: Math.max(0, Math.round(elapsed_ms / 60000)),
    distance_meter: trackMeter(walk.track),
    is_distance_unknown: walk.track.length < 2,
    sector_code,
    sector_count: sector_code.length,
    species_code,
    species_count: species_code.length,
    new_species_code,
    new_species_count: new_species_code.length,
    fix_source,
    is_demo: fix_source === "demo",
  };
}

/**
 * End the walk and hand back its receipt. Returns null when no walk was open,
 * so a stray tap cannot produce a summary of nothing.
 */
export function endWalk(row: Sighting[] = readSighting()): WalkReceipt | null {
  const walk = readWalk();
  localStorage.removeItem(WALK_KEY);
  return walk ? walkReceipt(walk, row) : null;
}

/* ── summary ────────────────────────────────────────────────────────────── */

export interface SummaryGroup {
  key: string;
  count: number;
}

export interface JournalSummary {
  sighting_count: number;
  /**
   * Distinct species **from the curated list**, so it shares a universe with
   * `species_total` below.
   *
   * It used to be every distinct `species_code` in the journal, which was fine
   * while the only way to log anything was the nine-species picker. Walking to
   * a find in the world can now log any of 1,098 species, and the old count
   * would have printed "12 of 9 species seen" — a number that is not wrong so
   * much as incoherent, because the two halves were counting different things.
   */
  species_count: number;
  /**
   * The denominator behind "n of N species seen". It is the curated starter
   * list, not the padded journal grid — a grid slot with no species behind it
   * is not something a student can go and find.
   */
  species_total: number;
  /** Distinct species logged that are NOT on the curated list — everything the
   *  campus sweep knows about and the guide has not written a card for. Counted
   *  separately rather than folded in, so neither number lies. */
  wild_species_count: number;
  located_count: number;
  photo_count: number;
  day_count: number;
  by_species: SummaryGroup[];
  by_day: SummaryGroup[];
  first_at: string | null;
  last_at: string | null;
}

function tally(key_of: (s: Sighting) => string | null, row: Sighting[]): SummaryGroup[] {
  const bucket = new Map<string, number>();
  for (const s of row) {
    const key = key_of(s);
    if (!key) continue;
    bucket.set(key, (bucket.get(key) ?? 0) + 1);
  }
  return [...bucket.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** Counts and groupings only. Deliberately no score, no rank, no streak. */
export function summarize(row: Sighting[]): JournalSummary {
  const by_species = tally((s) => s.species_code, row);
  const curated = new Set(picker_order);
  const seen_species = new Set(row.map((s) => s.species_code));
  const by_day = tally((s) => (s.created_at ? s.created_at.slice(0, 10) : null), row);
  const stamp = row.map((s) => s.created_at).filter(Boolean).sort();
  return {
    sighting_count: row.length,
    species_count: [...seen_species].filter((c) => curated.has(c)).length,
    species_total: picker_order.length,
    wild_species_count: [...seen_species].filter((c) => !curated.has(c)).length,
    located_count: row.filter((s) => s.lat !== null && s.lon !== null).length,
    photo_count: row.filter((s) => s.photo_data !== null).length,
    day_count: by_day.length,
    by_species,
    by_day,
    first_at: stamp[0] ?? null,
    last_at: stamp[stamp.length - 1] ?? null,
  };
}

/* ── export ─────────────────────────────────────────────────────────────── */

export interface FeatureCollection {
  type: "FeatureCollection";
  features: {
    type: "Feature";
    /** `field-guide/badge/…` vs `field-guide/contribution/…` — distinct feature types. */
    id: string;
    geometry: { type: "Point"; coordinates: [number, number] };
    properties: Record<string, string | number | null>;
  }[];
}

/**
 * GeoJSON of the located sightings — the shape AIS would need, since their
 * database has species but not count and location per tree. Badges and
 * contributions ride as distinct feature types (`T2.2`), separable by `id`
 * prefix and by the `entry_kind` property. Photos are left out on purpose: a
 * data-URL per feature makes the file unusable, and the journal is meant to
 * stay on the device unless a student hands it over.
 */
export function toGeoJson(row: Sighting[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: row
      .filter((s): s is Sighting & { lat: number; lon: number } => s.lat !== null && s.lon !== null)
      .map((s) => ({
        type: "Feature",
        id: `field-guide/${s.entry_kind}/${s.sighting_id}`,
        geometry: { type: "Point", coordinates: [s.lon, s.lat] },
        properties: {
          entry_kind: s.entry_kind,
          feature_type: s.entry_kind,
          sighting_id: s.sighting_id,
          species_code: s.species_code,
          reported_name: s.reported_name,
          inat_scientific_name: s.inat_scientific_name,
          created_at: s.created_at,
          accuracy_m: s.accuracy_m,
          fix_source: s.fix_source,
          note: s.note,
          walk_id: s.walk_id,
          coordinate: formatLatLon({ lat: s.lat, lon: s.lon }),
        },
      })),
  };
}

const CSV_COLUMN = [
  "sighting_id",
  "entry_kind",
  "reported_name",
  "species_code",
  "inat_scientific_name",
  "created_at",
  "lat",
  "lon",
  "accuracy_m",
  "fix_source",
  "note",
  "walk_id",
] as const;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(row: Sighting[]): string {
  const line = [CSV_COLUMN.join(",")];
  for (const s of row) {
    line.push(CSV_COLUMN.map((col) => csvCell((s as unknown as Record<string, unknown>)[col])).join(","));
  }
  return line.join("\n");
}

export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
