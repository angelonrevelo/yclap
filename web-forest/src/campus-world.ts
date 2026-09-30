/**
 * The campus world — one shared hall, no rank.
 *
 * Merge + payload live here so the Worker, the LAN Node server, and the tests
 * cannot drift. Photos and notes never enter this module.
 */

import { species } from "./data.ts";
import { safeNameOf } from "./name-filter.ts";
import { weekKey } from "./week.ts";

/**
 * Where a species is too sensitive to publish. A threatened species' find
 * stays in the world — it still counts for a group streak and for "N finds
 * shared" — but without its coordinates, the way iNaturalist obscures taxa
 * that collecting or harassment would hurt. Only what this repo's curated data
 * calls Threatened is withheld (today, Molave); the other 1,073 iNaturalist
 * species carry no status here, which is a stated gap (ROADMAP 10-01 triage),
 * not a claim that they are safe to pin.
 */
export function isLocationWithheld(species_code: string): boolean {
  return species[species_code]?.pill.some((p) => p.toLowerCase() === "threatened") ?? false;
}

export const WORLD_NOTE =
  "Personal journals stay on each device. This server only holds shared finds — no rank, no official AIS board.";

export const PRESENT_WINDOW_MS = 15 * 60 * 1000;
export const FIND_WINDOW_MS = 6 * 60 * 60 * 1000;
export const FIND_LIMIT = 80;

export interface PlayerRow {
  player_id: string;
  name: string;
  join_code: string;
  stage: string;
  level: number;
  total_points: number;
  streak_weeks: number;
  updated_at: string;
  /**
   * The phone asked to be hidden from the live map (`Preference.is_hidden_from_hall`).
   * Its finds stay in the world but under "A walker", it is left out of who is
   * out, and no find of its is called out live. Absent in a store written
   * before 10-01, which reads as not hidden.
   */
  is_hidden?: boolean;
}

/** The name a hidden walker's finds carry on every other phone. */
export const HIDDEN_WALKER_NAME = "A walker";

export interface SightingRow {
  sighting_id: string;
  player_id: string;
  species_code: string;
  common_name: string;
  lat: number | null;
  lon: number | null;
  entry_kind: "badge" | "contribution";
  created_at: string;
}

/**
 * Everything below `World` is what EVERY phone receives, so it carries
 * `walker_id` (the one-way hall hash, `walkerIdOf`) and never a `player_id`.
 *
 * A `player_id` is this app's bearer secret: `/sync` writes as whoever sends
 * it, and the walker code that merges two phones is minted from it. Until
 * 10-01 the world sent every walker's raw `player_id` to every phone, so
 * anyone in the hall could derive anyone's walker code and become them.
 * `world.test.ts` pins that no stored `player_id` appears in a world payload.
 */
export interface WorldFind {
  sighting_id: string;
  walker_id: string;
  player_name: string;
  species_code: string;
  common_name: string;
  lat: number | null;
  lon: number | null;
  entry_kind: string;
  created_at: string;
}

export interface WorldWalker {
  walker_id: string;
  name: string;
  stage: string;
  level: number;
  total_points: number;
  streak_weeks: number;
  updated_at: string;
}

export interface World {
  server_time: string;
  find: WorldFind[];
  walker: WorldWalker[];
  totals: { player_count: number; sighting_count: number };
  note: string;
  /**
   * The campus's live-map policy (`HALL_DEFAULT`): "shared" — a phone shows on
   * the live map unless its student hides; "opt_in" — it sends no position
   * until its student turns sharing on. The CPIA's visibility decision, as one
   * setting (docs/spec/cpia-draft.md §3). Absent from a server before 10-01,
   * which read as "shared".
   */
  hall_default?: HallDefault;
}

export type HallDefault = "shared" | "opt_in";

export function hallDefaultOf(raw: string | undefined): HallDefault {
  return raw?.trim() === "opt_in" ? "opt_in" : "shared";
}

/**
 * Whether this phone sends its position. The student's own choice wins; with
 * none, the campus policy decides; and a phone that has not yet heard the
 * policy stays hidden — a position cannot be taken back once sent.
 */
export function isHiddenFromHall(choice: boolean | null, world: Pick<World, "hall_default"> | null): boolean {
  if (choice !== null) return choice;
  if (!world) return true;
  return (world.hall_default ?? "shared") === "opt_in";
}

export interface CampusDump {
  player: PlayerRow[];
  sighting: SightingRow[];
}

const JOIN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/**
 * The one-way key every other phone knows a walker by. Same input, same key, on
 * every runtime. Lives here, not in `multiplayer.ts` (which re-exports it),
 * because the world payload needs it and `multiplayer.ts` already imports this
 * file.
 */
export function walkerIdOf(player_id: string): string {
  return `w${hashOf(`hall:${player_id}`).toString(36)}${hashOf(`${player_id}:hall`).toString(36)}`;
}

export function hashOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Six-character walker code, deterministic from player_id. */
export function joinCodeOf(player_id: string): string {
  let n = hashOf(player_id);
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += JOIN_ALPHABET[n % JOIN_ALPHABET.length];
    n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  }
  return out;
}

export function normalizeJoinCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

export function sanitizePlayer(input: {
  player_id?: unknown;
  name?: unknown;
  join_code?: unknown;
  stage?: unknown;
  level?: unknown;
  total_points?: unknown;
  streak_weeks?: unknown;
  is_hidden?: unknown;
}): PlayerRow | null {
  if (typeof input.player_id !== "string" || !input.player_id.trim()) return null;
  const player_id = input.player_id.trim().slice(0, 64);
  const level = Number(input.level);
  const total_points = Number(input.total_points);
  const streak_weeks = Number(input.streak_weeks);
  return {
    player_id,
    /* Filtered here, on the server: this is the name after "… logged Molave"
       and on the leaderboard. A refused one is the phone's generated name. */
    name: safeNameOf(input.name ?? "Walker", player_id).name,
    join_code:
      typeof input.join_code === "string" && normalizeJoinCode(input.join_code).length === 6
        ? normalizeJoinCode(input.join_code)
        : joinCodeOf(player_id),
    stage: String(input.stage ?? "egg").slice(0, 24),
    level: Number.isFinite(level) ? Math.max(1, Math.trunc(level)) : 1,
    total_points: Number.isFinite(total_points) ? Math.max(0, Math.trunc(total_points)) : 0,
    streak_weeks: Number.isFinite(streak_weeks) ? Math.max(0, Math.trunc(streak_weeks)) : 0,
    updated_at: new Date().toISOString(),
    is_hidden: input.is_hidden === true,
  };
}

export function sanitizeSighting(
  input: {
    sighting_id?: unknown;
    species_code?: unknown;
    common_name?: unknown;
    lat?: unknown;
    lon?: unknown;
    entry_kind?: unknown;
    created_at?: unknown;
  },
  player_id: string,
): SightingRow | null {
  if (typeof input.sighting_id !== "string" || typeof input.species_code !== "string") return null;
  if (!input.sighting_id.trim() || !input.species_code.trim()) return null;
  const lat = typeof input.lat === "number" && Number.isFinite(input.lat) ? input.lat : null;
  const lon = typeof input.lon === "number" && Number.isFinite(input.lon) ? input.lon : null;
  return {
    sighting_id: input.sighting_id.trim().slice(0, 80),
    player_id,
    species_code: input.species_code.trim().slice(0, 64),
    common_name: String(input.common_name ?? "").slice(0, 80),
    lat,
    lon,
    entry_kind: input.entry_kind === "contribution" ? "contribution" : "badge",
    created_at: typeof input.created_at === "string" ? input.created_at : new Date().toISOString(),
  };
}

export class MemoryCampusStore {
  player: PlayerRow[];
  sighting: SightingRow[];

  constructor(dump: CampusDump = { player: [], sighting: [] }) {
    this.player = dump.player.map((row) => ({ ...row }));
    this.sighting = dump.sighting.map((row) => ({ ...row }));
  }

  static from(raw: unknown): MemoryCampusStore {
    if (!raw || typeof raw !== "object") return new MemoryCampusStore();
    const dump = raw as Partial<CampusDump>;
    return new MemoryCampusStore({
      player: Array.isArray(dump.player) ? dump.player : [],
      sighting: Array.isArray(dump.sighting) ? dump.sighting : [],
    });
  }

  toJSON(): CampusDump {
    return { player: this.player, sighting: this.sighting };
  }

  upsertPlayer(row: PlayerRow): void {
    const i = this.player.findIndex((p) => p.player_id === row.player_id);
    if (i === -1) this.player.push(row);
    else this.player[i] = row;
  }

  insertSighting(row: SightingRow): boolean {
    if (this.sighting.some((s) => s.sighting_id === row.sighting_id)) return false;
    this.sighting.push(row);
    return true;
  }

  playerByJoin(join_code: string): PlayerRow | null {
    const code = normalizeJoinCode(join_code);
    return this.player.find((p) => p.join_code === code) ?? null;
  }

  sightingByPlayer(player_id: string): SightingRow[] {
    return this.sighting.filter((s) => s.player_id === player_id);
  }
}

export function mergeSync(
  store: MemoryCampusStore,
  player: PlayerRow,
  row: SightingRow[],
): { merged: number } {
  store.upsertPlayer(player);
  let merged = 0;
  for (const one of row.slice(0, 500)) {
    if (store.insertSighting(one)) merged += 1;
  }
  return { merged };
}

/**
 * What a moderator has taken out of the shared world (`worker/moderation.ts`):
 * a hidden find, and the finds and roster row of a walker hidden from the hall.
 * Filtered on the way OUT, never deleted — an unhide puts it back.
 */
export interface WorldHide {
  sighting?: (row: SightingRow) => boolean;
  player?: (player_id: string) => boolean;
}

export function worldFrom(store: MemoryCampusStore, now = Date.now(), hide: WorldHide = {}, hall_default: HallDefault = "shared"): World {
  const find_since = new Date(now - FIND_WINDOW_MS).toISOString();
  const present_since = new Date(now - PRESENT_WINDOW_MS).toISOString();
  /* A hidden walker's finds still count, under a name that is nobody's. */
  const name_of = new Map(store.player.map((p) => [p.player_id, p.is_hidden ? HIDDEN_WALKER_NAME : p.name]));
  const find = store.sighting
    .filter((s) => (s.lat !== null || isLocationWithheld(s.species_code)) && s.created_at > find_since && !hide.sighting?.(s))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, FIND_LIMIT)
    .map((s) => ({
      sighting_id: s.sighting_id,
      walker_id: walkerIdOf(s.player_id),
      player_name: name_of.get(s.player_id) ?? "Walker",
      species_code: s.species_code,
      common_name: s.common_name,
      lat: isLocationWithheld(s.species_code) ? null : s.lat,
      lon: isLocationWithheld(s.species_code) ? null : s.lon,
      entry_kind: s.entry_kind,
      created_at: s.created_at,
    }));
  const walker = store.player
    .filter((p) => p.updated_at > present_since && !p.is_hidden && !hide.player?.(p.player_id))
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    .map((p) => ({
      walker_id: walkerIdOf(p.player_id),
      name: p.name,
      stage: p.stage,
      level: p.level,
      total_points: p.total_points,
      streak_weeks: p.streak_weeks,
      updated_at: p.updated_at,
    }));
  const player_id = new Set(store.sighting.map((s) => s.player_id));
  return {
    server_time: new Date(now).toISOString(),
    find,
    walker,
    totals: { player_count: player_id.size, sighting_count: store.sighting.length },
    note: WORLD_NOTE,
    hall_default,
  };
}

/* ── looking a walker up by code ────────────────────────────────────────── */

/**
 * Wrong codes one address may try per `CODE_MISS_WINDOW_MS`, across `/join`
 * and `/partner`. A walker code is six characters of a 32-letter alphabet
 * (~10⁹), and `/join` answers a right one with the `player_id` — the key to
 * that walker. Unmetered, a script could walk the space; at 20 misses per ten
 * minutes it cannot. Only misses count, so typing your own code right is free.
 */
export const CODE_MISS_MAX = 20;
export const CODE_MISS_WINDOW_MS = 10 * 60 * 1000;

export interface CodeMissBrake {
  retryAfter(key: string, now?: number): number;
  note(key: string, now?: number): void;
}

/**
 * `/join` and `/partner`, host-neutral. They are different questions and get
 * different answers:
 *
 * - `/join` MERGES this phone into the walker who holds the code — the code is
 *   a credential ("not a password — anybody with it becomes you"), and the
 *   answer is the `player_id` it unlocks.
 * - `/partner` only ADDS somebody to your walking group. Handing out your code
 *   for that must not hand out yourself, so it answers with the `walker_id`
 *   everybody already sees, and a name. Before 10-01 both went through the
 *   world's raw `player_id`, which made every partner code a key.
 */
export function lookupByCode(
  store: MemoryCampusStore,
  path: "/join" | "/partner",
  code: string,
  ip: string | null,
  brake: CodeMissBrake,
  now = Date.now(),
): { status: number; body: unknown } {
  const key = `code:${ip ?? "unknown"}`;
  const wait = brake.retryAfter(key, now);
  if (wait > 0) return { status: 429, body: { error: "too many wrong codes; wait and try again", retry_after_ms: wait } };
  const row = store.playerByJoin(code);
  if (!row) {
    brake.note(key, now);
    return { status: 404, body: { error: "unknown join_code" } };
  }
  if (path === "/partner") return { status: 200, body: { walker_id: walkerIdOf(row.player_id), name: row.name } };
  return { status: 200, body: { player_id: row.player_id, name: row.name, join_code: row.join_code } };
}

/* ── what the institution can see ───────────────────────────────────────── */

export interface WeekActivity {
  week_key: string;
  /** Distinct walkers who shared a find that week. */
  walker_count: number;
  /** Of those, how many had also shared one in an earlier week. */
  returning_count: number;
  find_count: number;
}

/**
 * Weekly walkers and returning walkers, newest week first (reveal plan § KPI).
 *
 * Counted from the shared finds the store already holds — nothing new is
 * collected to produce it, and no id leaves this function: the answer is four
 * numbers a week. It measures walkers who SHARED a find, not everybody who
 * opened the app; that is the honest lower bound, and the card says so.
 */
export function weeklyActivity(store: MemoryCampusStore, week_limit = 6): WeekActivity[] {
  const by_week = new Map<string, { walker: Set<string>; find_count: number }>();
  for (const s of store.sighting) {
    const key = weekKey(s.created_at);
    if (key === "invalid") continue;
    const one = by_week.get(key) ?? { walker: new Set<string>(), find_count: 0 };
    one.walker.add(s.player_id);
    one.find_count += 1;
    by_week.set(key, one);
  }
  const ordered = [...by_week.keys()].sort();
  const seen = new Set<string>();
  const out: WeekActivity[] = [];
  for (const key of ordered) {
    const one = by_week.get(key)!;
    let returning_count = 0;
    for (const id of one.walker) if (seen.has(id)) returning_count += 1;
    for (const id of one.walker) seen.add(id);
    out.push({ week_key: key, walker_count: one.walker.size, returning_count, find_count: one.find_count });
  }
  return out.reverse().slice(0, week_limit);
}

/* ── how long the shared world remembers ────────────────────────────────── */

/**
 * Days a shared find, or an inactive walker with no finds left, is kept.
 * RA 10173 §11(e) keeps personal data only as long as its purpose needs; the
 * purpose here is a term's walk program, so the default is one term plus 30
 * days (docs/spec/cpia-draft.md, F-1). `RETENTION_DAY` changes it — the DPO
 * decides. Journals on the phones are not touched; accounts are the student's
 * to delete.
 */
export const RETENTION_DAY_DEFAULT = 150;

export function retentionDayOf(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : RETENTION_DAY_DEFAULT;
}

export function pruneCampus(
  store: MemoryCampusStore,
  now = Date.now(),
  retention_day = RETENTION_DAY_DEFAULT,
): { sighting_count: number; player_count: number } {
  const since = new Date(now - retention_day * 86_400_000).toISOString();
  const before_sighting = store.sighting.length;
  store.sighting = store.sighting.filter((s) => s.created_at >= since);
  const has_find = new Set(store.sighting.map((s) => s.player_id));
  const before_player = store.player.length;
  store.player = store.player.filter((p) => p.updated_at >= since || has_find.has(p.player_id));
  return { sighting_count: before_sighting - store.sighting.length, player_count: before_player - store.player.length };
}
