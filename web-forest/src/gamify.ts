/**
 * Magisphere points, weekly streak, local leaderboard, challenges, and buddy
 * stages — from the YCLAP Working Doc ("FINAL GAME MECHANICS").
 *
 * Angelo overruled the prior "NOT DOING gamification" stance for the Saturday
 * showcase. Everything here is device-local unless a separate sync path is
 * wired later. The leaderboard is a local/demo cohort only — never labelled as
 * an official AIS rank.
 */

import { walkerIdOf } from "./campus-world.ts";
import { weekKey } from "./week.ts";
import { readPlayer } from "./sync.ts";
import { areaName, isUnnamedSector } from "./area-name.ts";
import { species } from "./data.ts";
import { distanceMeter, type LatLon } from "./geo.ts";
import { isWalkable } from "./placement.ts";
import { sectorContains, type Sector } from "./sector.ts";
import { habitatWeight, rarityFor, type Spawn, type SpawnPoolEntry } from "./spawn.ts";

export type PointKind = "explore" | "learn" | "observe" | "challenge" | "verified_discovery";

/** Working Doc values. Challenge (daily hunt) outweighs a plain observe. */
export const POINT_VALUE: Record<PointKind, number> = {
  explore: 10,
  learn: 10,
  observe: 25,
  challenge: 40,
  verified_discovery: 50,
};

export const POINT_LABEL: Record<PointKind, string> = {
  explore: "Explore",
  learn: "Learn",
  observe: "Observe",
  challenge: "Hunt",
  verified_discovery: "Local verified discovery",
};

export const VERIFIED_RULE_NOTE =
  "Local rule on this device: photo + species chosen. Not an AIS / campus database verification.";

export interface PointEvent {
  event_id: string;
  kind: PointKind;
  points: number;
  at: string;
  /** Dedup key, e.g. sector:bellarmine, species:narra, sighting:narra-123. */
  subject_key: string;
}

const EVENTS_KEY = "field-guide.points";
const CHALLENGE_KEY = "field-guide.challenge";

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

function parseEvents(raw: string | null): PointEvent[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.flatMap((row): PointEvent[] => {
      if (!row || typeof row !== "object") return [];
      const r = row as Record<string, unknown>;
      const kind = r.kind;
      if (
        kind !== "explore" &&
        kind !== "learn" &&
        kind !== "observe" &&
        kind !== "challenge" &&
        kind !== "verified_discovery"
      ) {
        return [];
      }
      if (typeof r.event_id !== "string" || typeof r.subject_key !== "string") return [];
      const points = typeof r.points === "number" && Number.isFinite(r.points) ? r.points : POINT_VALUE[kind];
      const at = typeof r.at === "string" ? r.at : "";
      return [{ event_id: r.event_id, kind, points, at, subject_key: r.subject_key }];
    });
  } catch {
    return [];
  }
}

export function readPointEvents(storage: Storage | null = safeStorage()): PointEvent[] {
  return parseEvents(storage?.getItem(EVENTS_KEY) ?? null);
}

export function writePointEvents(events: PointEvent[], storage: Storage | null = safeStorage()): void {
  try {
    storage?.setItem(EVENTS_KEY, JSON.stringify(events));
  } catch {
    /* private mode — drop silently */
  }
}

/** True when this kind+subject was already awarded (once ever). */
export function alreadyAwarded(events: PointEvent[], kind: PointKind, subject_key: string): boolean {
  return events.some((e) => e.kind === kind && e.subject_key === subject_key);
}

export interface AwardResult {
  awarded: boolean;
  event: PointEvent | null;
  events: PointEvent[];
  total_points: number;
}

/**
 * Append a point event when the subject has not earned that kind yet.
 * Pure over the events array; callers persist via writePointEvents.
 */
export function awardPoints(
  events: PointEvent[],
  kind: PointKind,
  subject_key: string,
  at: string = new Date().toISOString(),
): AwardResult {
  const key = subject_key.trim();
  if (!key || alreadyAwarded(events, kind, key)) {
    return { awarded: false, event: null, events, total_points: totalPoints(events) };
  }
  const event: PointEvent = {
    event_id: `${kind}-${key}-${Date.now()}`,
    kind,
    points: POINT_VALUE[kind],
    at,
    subject_key: key,
  };
  const next = [...events, event];
  return { awarded: true, event, events: next, total_points: totalPoints(next) };
}

export function totalPoints(events: PointEvent[]): number {
  return events.reduce((sum, e) => sum + e.points, 0);
}

/** ISO week key YYYY-Www in UTC (stable across devices for tests). */
/* Moved to week.ts so the Worker can count weeks without importing the game. */
export { weekKey };

export function weeksParticipated(events: PointEvent[]): string[] {
  const set = new Set<string>();
  for (const e of events) {
    const w = weekKey(e.at);
    if (w !== "invalid") set.add(w);
  }
  return [...set].sort();
}

/**
 * Consecutive weeks of participation ending at `now` (or 0 if this week is idle).
 * Working Doc: track participation weekly, not daily.
 */
export function weeklyStreak(events: PointEvent[], now: Date = new Date()): number {
  if (!events.length) return 0;
  const participated = new Set(weeksParticipated(events));
  let streak = 0;
  let cursor = new Date(now);
  // If this week is still idle, count consecutive completed weeks ending last week.
  if (!participated.has(weekKey(now))) {
    cursor = new Date(now.getTime() - 7 * 86400000);
  }
  for (;;) {
    const key = weekKey(cursor);
    if (!participated.has(key)) break;
    streak += 1;
    cursor = new Date(cursor.getTime() - 7 * 86400000);
    if (streak > 520) break;
  }
  return streak;
}

export function participatedThisWeek(events: PointEvent[], now: Date = new Date()): boolean {
  const key = weekKey(now);
  return events.some((e) => weekKey(e.at) === key);
}

/* ── Local verified discovery rule ──────────────────────────────────────── */

/**
 * Honest local stand-in for "Verified Discovery" until a human reviewer exists.
 * Photo present + a real species chosen (not an empty contribution report).
 */
export function isLocalVerified(input: {
  photo_data: string | null | undefined;
  species_code: string | null | undefined;
  entry_kind?: "badge" | "contribution" | null;
  /** Picked off the recorded demo reply — never verified, whatever else holds. */
  is_demo_id?: boolean;
}): boolean {
  if (input.is_demo_id) return false;
  const photo = typeof input.photo_data === "string" && input.photo_data.length > 0;
  const species = typeof input.species_code === "string" && input.species_code.trim().length > 0;
  if (!photo || !species) return false;
  // Contributions without a curated species still need a reported name; the
  // caller passes species_code for badges. Reject empty codes only.
  return true;
}

/** Which observe-family award to grant for a saved sighting. */
export function observeAwardKind(input: {
  photo_data: string | null | undefined;
  species_code: string | null | undefined;
  is_demo_id?: boolean;
}): PointKind {
  return isLocalVerified(input) ? "verified_discovery" : "observe";
}

/* ── Biodiversity Buddy (Working Doc stages) ────────────────────────────── */

export type BuddyStage = "seedling" | "sprout" | "young_tree" | "mature_tree";

/* The buddy is Agila the eagle now (`art/`, `character-model.tsx`); the keys
   are the Working Doc's and stay, only what a player reads changed. */
export const BUDDY_LABEL: Record<BuddyStage, string> = {
  seedling: "Egg",
  sprout: "Hatchling",
  young_tree: "Eaglet",
  mature_tree: "Eagle",
};

/** Sustained participation: weekly streak thresholds. */
export const BUDDY_AT: { stage: BuddyStage; streak_weeks: number }[] = [
  { stage: "seedling", streak_weeks: 0 },
  { stage: "sprout", streak_weeks: 1 },
  { stage: "young_tree", streak_weeks: 3 },
  { stage: "mature_tree", streak_weeks: 6 },
];

export function buddyStageFor(streak_weeks: number): BuddyStage {
  let stage: BuddyStage = "seedling";
  for (const step of BUDDY_AT) if (streak_weeks >= step.streak_weeks) stage = step.stage;
  return stage;
}

export function buddyProgress(events: PointEvent[], now: Date = new Date()): {
  stage: BuddyStage;
  label: string;
  streak_weeks: number;
  next: { stage: BuddyStage; remaining: number } | null;
} {
  const streak_weeks = weeklyStreak(events, now);
  const stage = buddyStageFor(streak_weeks);
  const next = BUDDY_AT.find((s) => s.streak_weeks > streak_weeks);
  return {
    stage,
    label: BUDDY_LABEL[stage],
    streak_weeks,
    next: next ? { stage: next.stage, remaining: next.streak_weeks - streak_weeks } : null,
  };
}

/* ── Challenges (P1) ────────────────────────────────────────────────────── */

export type ChallengeKind = "discover_species" | "explore_areas";

export interface ChallengeDef {
  challenge_id: string;
  kind: ChallengeKind;
  title: string;
  target: number;
}

export const DEFAULT_CHALLENGES: ChallengeDef[] = [
  {
    challenge_id: "discover-2",
    kind: "discover_species",
    title: "Discover 2 species",
    target: 2,
  },
  {
    challenge_id: "explore-2",
    kind: "explore_areas",
    title: "Explore 2 areas",
    target: 2,
  },
];

export interface ChallengeProgress {
  challenge_id: string;
  title: string;
  kind: ChallengeKind;
  target: number;
  current: number;
  done: boolean;
}

/**
 * Observe / verified subject keys look like `sighting:narra/narra-123`.
 * Explore keys look like `sector:bellarmine-field`.
 */
export function speciesFromSubject(subject_key: string): string | null {
  if (subject_key.startsWith("species:")) return subject_key.slice("species:".length) || null;
  if (subject_key.startsWith("observe:")) {
    const code = subject_key.slice("observe:".length).split(":")[0]?.trim();
    return code || null;
  }
  if (subject_key.startsWith("sighting:")) {
    const rest = subject_key.slice("sighting:".length);
    const code = rest.split("/")[0]?.trim();
    return code || null;
  }
  return null;
}

/**
 * Observe awards once per species+sector so the same tree cannot be farmed.
 * 09-09 `2:06:32` — spam of one tree must not keep paying.
 */
export function observeSubject(species_code: string, sector_code?: string | null): string {
  const code = species_code.trim();
  const sector = (sector_code ?? "").trim();
  return sector ? `observe:${code}:${sector}` : `observe:${code}`;
}

export function dailySubject(day_key: string): string {
  return `daily:${day_key}`;
}

/* ── Daily hunt (09-09: omit rounds, one task per local day) ─────────────── */

export interface DailyTask {
  task_id: string;
  day_key: string;
  species_code: string;
  common_name: string;
  /** For `speciesLabelOf`: shown (in italics) only when there is no common name. */
  scientific_name: string;
  sector_code: string;
  /** Always a real place — `areaName`, never a "Sector N" row id. */
  sector_name: string;
  /** Where the hunt's own find stands: inside the sector, on walkable ground. */
  lat: number;
  lon: number;
  /** The id of the find `huntFind` places — the same for the whole day. */
  spawn_id: string;
  is_done: boolean;
}

/** UTC calendar day — same stability rule as `weekKey`. */
export function dayKey(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "invalid";
  return d.toISOString().slice(0, 10);
}

export function isTreeEntry(entry: SpawnPoolEntry): boolean {
  return entry.archetype === "tree" || entry.archetype === "palm";
}

function hashText(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fewest campus observations a hunt species needs. A tree logged once on
 * campus is a "once on campus" story, not something you can be sent to find
 * today; five is the smallest count where the tree is plainly still here.
 */
export const HUNT_MIN_COUNT = 5;

/** True when the sweep gave the species a common name of its own. */
export function hasCommonName(entry: Pick<SpawnPoolEntry, "common_name" | "scientific_name" | "species_code">): boolean {
  const name = entry.common_name.trim();
  return name !== "" && name !== entry.scientific_name.trim() && name !== entry.species_code;
}

/**
 * The species a daily hunt may name.
 *
 * Trees only (`2:04:17`), with a common name, seen at least `HUNT_MIN_COUNT`
 * times on campus. A species the data flags `Exotic` is left out unless the
 * curated field guide chose to teach it (Rain tree, Teak) — the hunt should
 * send people to trees that belong here, and to the guide's own cards.
 */
export function huntPool(pool: SpawnPoolEntry[], curated: ReadonlySet<string> = new Set()): SpawnPoolEntry[] {
  return pool.filter(
    (e) =>
      isTreeEntry(e) &&
      hasCommonName(e) &&
      (e.count ?? 0) >= HUNT_MIN_COUNT &&
      (e.origin !== "Exotic" || curated.has(e.species_code)),
  );
}

/** Green, and named — a hunt never sends anyone to a "Sector N". */
export function isHuntArea(row: Pick<Sector, "is_biome" | "name">): boolean {
  return row.is_biome && !isUnnamedSector(row);
}

/** A walkable point inside the sector, the same one on every device for this seed. */
function huntPoint(row: Sector, rng: () => number): LatLon | null {
  let lat0 = Infinity, lat1 = -Infinity, lon0 = Infinity, lon1 = -Infinity;
  for (const [lat, lon] of row.point) {
    if (lat < lat0) lat0 = lat;
    if (lat > lat1) lat1 = lat;
    if (lon < lon0) lon0 = lon;
    if (lon > lon1) lon1 = lon;
  }
  for (let tries = 0; tries < 80; tries += 1) {
    const at = { lat: lat0 + rng() * (lat1 - lat0), lon: lon0 + rng() * (lon1 - lon0) };
    if (sectorContains(row, at) && isWalkable(at)) return at;
  }
  const label = { lat: row.label_point[0], lon: row.label_point[1] };
  return sectorContains(row, label) && isWalkable(label) ? label : null;
}

/**
 * One tree, one named area, one spot — the same for every phone all day.
 *
 * The hunt used to pick the species and the area independently and then say
 * "Out today in X" about a pairing the spawn world never made. Now the hunt IS
 * a find: `huntFind` places this species at `lat/lon` in this area for every
 * window of the day, so the claim is true by construction, and a window
 * rolling over cannot make it false. Seeded by the day alone (not the player),
 * so two people comparing phones are on the same hunt.
 *
 * Curated guide species are drawn four times as often as the rest of the
 * pool, and an area is chosen where the tree's habitat fit is at least even.
 */
export function dailyTaskFor(
  pool: SpawnPoolEntry[],
  sector: Sector[],
  now: Date,
  events: PointEvent[],
  curated: ReadonlySet<string> = new Set(Object.keys(species)),
): DailyTask | null {
  const day_key = dayKey(now);
  if (day_key === "invalid") return null;
  const tree = huntPool(pool, curated);
  const area = sector.filter(isHuntArea);
  if (!tree.length || !area.length) return null;
  const rng = seeded(hashText(`hunt:${day_key}`));

  const weight = tree.map((e) => (curated.has(e.species_code) ? 4 : 1));
  let remainder = rng() * weight.reduce((a, b) => a + b, 0);
  let pick = tree[tree.length - 1];
  for (let i = 0; i < tree.length; i += 1) {
    remainder -= weight[i];
    if (remainder <= 0) {
      pick = tree[i];
      break;
    }
  }

  const fit = area.filter((s) => habitatWeight(s.kind, pick) >= 1);
  const ring = fit.length ? fit : area;
  const start = Math.floor(rng() * ring.length);
  for (let k = 0; k < ring.length; k += 1) {
    const place = ring[(start + k) % ring.length];
    const at = huntPoint(place, seeded(hashText(`hunt:${day_key}:${place.sector_code}`)));
    if (!at) continue;
    return {
      task_id: `daily:${day_key}`,
      day_key,
      species_code: pick.species_code,
      common_name: pick.common_name,
      scientific_name: pick.scientific_name,
      sector_code: place.sector_code,
      sector_name: areaName(place),
      lat: at.lat,
      lon: at.lon,
      spawn_id: `hunt-${day_key}`,
      is_done: alreadyAwarded(events, "challenge", dailySubject(day_key)),
    };
  }
  return null;
}

/**
 * The hunt's own find, for the spawn world. It stands for the whole UTC day,
 * which is how long the hunt is — the card may say "out today" honestly.
 */
export function huntFind(task: DailyTask, pool: SpawnPoolEntry[]): Spawn | null {
  const entry = pool.find((e) => e.species_code === task.species_code);
  if (!entry) return null;
  const starts_ms = Date.parse(`${task.day_key}T00:00:00.000Z`);
  return {
    spawn_id: task.spawn_id,
    species_code: entry.species_code,
    common_name: entry.common_name,
    scientific_name: entry.scientific_name,
    lat: task.lat,
    lon: task.lon,
    sector_code: task.sector_code,
    rarity: rarityFor(entry.count),
    iconic_taxon_name: entry.iconic_taxon_name,
    archetype: entry.archetype,
    starts_at: new Date(starts_ms).toISOString(),
    ends_at: new Date(starts_ms + 24 * 60 * 60 * 1000).toISOString(),
  };
}

export function challengeProgress(
  events: PointEvent[],
  defs: ChallengeDef[] = DEFAULT_CHALLENGES,
): ChallengeProgress[] {
  const discovered = new Set<string>();
  for (const e of events) {
    if (e.kind !== "observe" && e.kind !== "verified_discovery") continue;
    const code = speciesFromSubject(e.subject_key);
    if (code) discovered.add(code);
  }

  const explored = new Set(
    events.filter((e) => e.kind === "explore" && e.subject_key.startsWith("sector:")).map((e) => e.subject_key),
  );

  return defs.map((d) => {
    const current =
      d.kind === "discover_species"
        ? discovered.size
        : d.kind === "explore_areas"
          ? explored.size
          : 0;
    return {
      challenge_id: d.challenge_id,
      title: d.title,
      kind: d.kind,
      target: d.target,
      current: Math.min(current, d.target),
      done: current >= d.target,
    };
  });
}

/* ── Local / demo leaderboard ───────────────────────────────────────────── */

export interface LeaderboardRow {
  walker_id: string;
  name: string;
  points: number;
  streak_weeks: number;
  is_you: boolean;
  is_seed: boolean;
}

/** Seeded cohort for hall demos — fixed scores. The board marks each row "· demo" off `is_seed`, so the name does not say it a second time. */
export const DEMO_COHORT: Omit<LeaderboardRow, "is_you">[] = [
  { walker_id: "seed-narra", name: "Narra Block (demo)", points: 180, streak_weeks: 3, is_seed: true },
  { walker_id: "seed-molave", name: "Molave Walk (demo)", points: 120, streak_weeks: 2, is_seed: true },
  { walker_id: "seed-lagundi", name: "Lagundi Lane (demo)", points: 70, streak_weeks: 1, is_seed: true },
  { walker_id: "seed-katmon", name: "Katmon Corner (demo)", points: 40, streak_weeks: 1, is_seed: true },
];

export function localLeaderboard(
  events: PointEvent[],
  now: Date = new Date(),
  storage: Storage | null = safeStorage(),
): LeaderboardRow[] {
  const you = readPlayer(storage);
  const yours: LeaderboardRow = {
    walker_id: walkerIdOf(you.player_id),
    name: you.name,
    points: totalPoints(events),
    streak_weeks: weeklyStreak(events, now),
    is_you: true,
    is_seed: false,
  };
  const rows: LeaderboardRow[] = [
    yours,
    ...DEMO_COHORT.map((r) => ({ ...r, is_you: false })),
  ];
  rows.sort((a, b) => b.points - a.points || b.streak_weeks - a.streak_weeks || a.name.localeCompare(b.name));
  return rows;
}

/** Fold live walkers into the local/demo board. Still not an official AIS rank. */
export function withLiveWalker(
  row: LeaderboardRow[],
  walker: { walker_id: string; name: string; total_points: number; streak_weeks: number }[],
  you_id: string,
): LeaderboardRow[] {
  const by_id = new Map(row.map((r) => [r.walker_id, { ...r }]));
  for (const w of walker) {
    if (w.walker_id === you_id) continue;
    const existing = by_id.get(w.walker_id);
    if (existing) {
      existing.points = Math.max(existing.points, w.total_points);
      existing.streak_weeks = Math.max(existing.streak_weeks, w.streak_weeks);
      existing.name = w.name;
    } else {
      by_id.set(w.walker_id, {
        walker_id: w.walker_id,
        name: w.name,
        points: w.total_points,
        streak_weeks: w.streak_weeks,
        is_you: false,
        is_seed: false,
      });
    }
  }
  return [...by_id.values()].sort(
    (a, b) => b.points - a.points || b.streak_weeks - a.streak_weeks || a.name.localeCompare(b.name),
  );
}

/* ── Observation local status (P2 scaffold) ─────────────────────────────── */

export type LocalObsStatus = "verified" | "needs_id" | "duplicate";

export const LOCAL_OBS_STATUS_LABEL: Record<LocalObsStatus, string> = {
  verified: "Local verified",
  needs_id: "Needs ID",
  duplicate: "Duplicate",
};

export const LOCAL_OBS_STATUS_NOTE =
  "Journal status on this device only. Magisphere does not update an official campus dataset.";

/**
 * Derive a local status from what we know about a sighting. Not a human review.
 */
export function localObsStatus(input: {
  photo_data: string | null | undefined;
  species_code: string | null | undefined;
  /** Prior sightings of the same species on this device. */
  prior_same_species?: number;
  is_demo_id?: boolean;
}): LocalObsStatus {
  if ((input.prior_same_species ?? 0) > 0) return "duplicate";
  if (isLocalVerified(input)) return "verified";
  return "needs_id";
}

/* ── Snapshot for UI ────────────────────────────────────────────────────── */

export interface GamifySnapshot {
  total_points: number;
  streak_weeks: number;
  participated_this_week: boolean;
  buddy: ReturnType<typeof buddyProgress>;
  challenges: ChallengeProgress[];
  leaderboard: LeaderboardRow[];
  recent: PointEvent[];
}

export function gamifySnapshot(events: PointEvent[], now: Date = new Date(), storage: Storage | null = safeStorage()): GamifySnapshot {
  return {
    total_points: totalPoints(events),
    streak_weeks: weeklyStreak(events, now),
    participated_this_week: participatedThisWeek(events, now),
    buddy: buddyProgress(events, now),
    challenges: challengeProgress(events),
    leaderboard: localLeaderboard(events, now, storage),
    recent: [...events].reverse().slice(0, 8),
  };
}

/** Persist helper used by the app after a successful award. */
export function persistAward(
  kind: PointKind,
  subject_key: string,
  storage: Storage | null = safeStorage(),
): AwardResult {
  const current = readPointEvents(storage);
  const result = awardPoints(current, kind, subject_key);
  if (result.awarded) writePointEvents(result.events, storage);
  return result;
}

/** Quiet no-op storage key touch so challenge prefs can expand later. */
export function readChallengePrefs(storage: Storage | null = safeStorage()): string[] {
  try {
    const raw = storage?.getItem(CHALLENGE_KEY);
    if (!raw) return DEFAULT_CHALLENGES.map((c) => c.challenge_id);
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : DEFAULT_CHALLENGES.map((c) => c.challenge_id);
  } catch {
    return DEFAULT_CHALLENGES.map((c) => c.challenge_id);
  }
}


/**
 * The hunt clears where the hunt is. Until 10-01 it paid +40 for logging the
 * hunt species from anywhere — GO opens the camera on it from across campus —
 * so the one daily task was also the one free 40 points (10-01 audit). Now
 * the log has to carry a position within HUNT_REACH_M of the hunt's spot.
 * A stick walk still counts: steering there is the walk, and the stick is how
 * a desk demo and a student who cannot walk far both play.
 */
export const HUNT_REACH_M = 150;

export function huntClearOf(
  daily: Pick<DailyTask, "species_code" | "lat" | "lon" | "is_done">,
  species_code: string,
  at: LatLon | null,
): { is_clear: boolean; meter: number | null } {
  if (daily.is_done || daily.species_code !== species_code) return { is_clear: false, meter: null };
  if (!at) return { is_clear: false, meter: null };
  const meter = distanceMeter(at, daily);
  return { is_clear: meter <= HUNT_REACH_M, meter };
}
