/**
 * Magisphere points, weekly streak, local leaderboard, challenges, and buddy
 * stages — from the YCLAP Working Doc ("FINAL GAME MECHANICS").
 *
 * Angelo overruled the prior "NOT DOING gamification" stance for the Saturday
 * showcase. Everything here is device-local unless a separate sync path is
 * wired later. The leaderboard is a local/demo cohort only — never labelled as
 * an official AIS rank.
 */

import { readPlayer } from "./sync.ts";

export type PointKind = "explore" | "learn" | "observe" | "verified_discovery";

/** Working Doc suggested values. Final values subject to testing. */
export const POINT_VALUE: Record<PointKind, number> = {
  explore: 10,
  learn: 10,
  observe: 25,
  verified_discovery: 50,
};

export const POINT_LABEL: Record<PointKind, string> = {
  explore: "Explore",
  learn: "Learn",
  observe: "Observe",
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
      if (kind !== "explore" && kind !== "learn" && kind !== "observe" && kind !== "verified_discovery") {
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
export function weekKey(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "invalid";
  // ISO week: Thursday-based year, week starting Monday.
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const year_start = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - year_start.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

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
}): boolean {
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
}): PointKind {
  return isLocalVerified(input) ? "verified_discovery" : "observe";
}

/* ── Biodiversity Buddy (Working Doc stages) ────────────────────────────── */

export type BuddyStage = "seedling" | "sprout" | "young_tree" | "mature_tree";

export const BUDDY_LABEL: Record<BuddyStage, string> = {
  seedling: "Seedling",
  sprout: "Sprout",
  young_tree: "Young Tree",
  mature_tree: "Mature Tree",
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
  if (subject_key.startsWith("sighting:")) {
    const rest = subject_key.slice("sighting:".length);
    const code = rest.split("/")[0]?.trim();
    return code || null;
  }
  return null;
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
  player_id: string;
  name: string;
  points: number;
  streak_weeks: number;
  is_you: boolean;
  is_seed: boolean;
}

/** Seeded cohort for hall demos — obvious fake names, fixed scores. */
export const DEMO_COHORT: Omit<LeaderboardRow, "is_you">[] = [
  { player_id: "seed-narra", name: "Narra Block (demo)", points: 180, streak_weeks: 3, is_seed: true },
  { player_id: "seed-molave", name: "Molave Walk (demo)", points: 120, streak_weeks: 2, is_seed: true },
  { player_id: "seed-lagundi", name: "Lagundi Lane (demo)", points: 70, streak_weeks: 1, is_seed: true },
  { player_id: "seed-katmon", name: "Katmon Corner (demo)", points: 40, streak_weeks: 1, is_seed: true },
];

export function localLeaderboard(
  events: PointEvent[],
  now: Date = new Date(),
  storage: Storage | null = safeStorage(),
): LeaderboardRow[] {
  const you = readPlayer(storage);
  const yours: LeaderboardRow = {
    player_id: you.player_id,
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
