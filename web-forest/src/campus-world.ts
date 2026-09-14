/**
 * The campus world — one shared hall, no rank.
 *
 * Merge + payload live here so the Worker, the LAN Node server, and the tests
 * cannot drift. Photos and notes never enter this module.
 */

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
}

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

export interface WorldFind {
  sighting_id: string;
  player_id: string;
  player_name: string;
  species_code: string;
  common_name: string;
  lat: number | null;
  lon: number | null;
  entry_kind: string;
  created_at: string;
}

export interface WorldWalker {
  player_id: string;
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
}

export interface CampusDump {
  player: PlayerRow[];
  sighting: SightingRow[];
}

const JOIN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

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
}): PlayerRow | null {
  if (typeof input.player_id !== "string" || !input.player_id.trim()) return null;
  const player_id = input.player_id.trim().slice(0, 64);
  const level = Number(input.level);
  const total_points = Number(input.total_points);
  const streak_weeks = Number(input.streak_weeks);
  return {
    player_id,
    name: String(input.name ?? "Walker").trim().slice(0, 40) || "Walker",
    join_code:
      typeof input.join_code === "string" && normalizeJoinCode(input.join_code).length === 6
        ? normalizeJoinCode(input.join_code)
        : joinCodeOf(player_id),
    stage: String(input.stage ?? "egg").slice(0, 24),
    level: Number.isFinite(level) ? Math.max(1, Math.trunc(level)) : 1,
    total_points: Number.isFinite(total_points) ? Math.max(0, Math.trunc(total_points)) : 0,
    streak_weeks: Number.isFinite(streak_weeks) ? Math.max(0, Math.trunc(streak_weeks)) : 0,
    updated_at: new Date().toISOString(),
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

export function worldFrom(store: MemoryCampusStore, now = Date.now()): World {
  const find_since = new Date(now - FIND_WINDOW_MS).toISOString();
  const present_since = new Date(now - PRESENT_WINDOW_MS).toISOString();
  const name_of = new Map(store.player.map((p) => [p.player_id, p.name]));
  const find = store.sighting
    .filter((s) => s.lat !== null && s.created_at > find_since)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .slice(0, FIND_LIMIT)
    .map((s) => ({
      sighting_id: s.sighting_id,
      player_id: s.player_id,
      player_name: name_of.get(s.player_id) ?? "Walker",
      species_code: s.species_code,
      common_name: s.common_name,
      lat: s.lat,
      lon: s.lon,
      entry_kind: s.entry_kind,
      created_at: s.created_at,
    }));
  const walker = store.player
    .filter((p) => p.updated_at > present_since)
    .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))
    .map((p) => ({
      player_id: p.player_id,
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
  };
}
