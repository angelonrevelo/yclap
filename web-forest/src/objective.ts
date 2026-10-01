/**
 * Today's objectives — three small things to do, the same three for everyone
 * on campus today, each one doable by anyone.
 *
 * Gelo, 10-01: "adding more objectives (doable by anyone)". Until then the
 * only daily goal was the hunt for one species, which a student who cannot
 * walk far, or who has twenty minutes between classes, could not do. The
 * catalogue mixes three kinds so every day has one of each:
 *
 *   - a LOOK objective: read, learn, notice — no walking needed at all;
 *   - a LOG objective: log something, anything, with a photo, a native tree;
 *   - a MOVE objective: walk, pass through areas, reach the water.
 *
 * Progress is counted from what the phone already keeps (the journal, the
 * point ledger, the walk track), from the start of today in Manila. These are
 * a game's goals and are scored on the phone; a goal a class is GRADED on is
 * a SEEDS challenge (`quest.ts`), judged by the server.
 *
 * Only one MOVE objective needs real GPS (`is_gps_only`): walking a distance
 * with the stick is not walking. Everything else counts a stick walk too, so a
 * student testing from a desk is not locked out of the day.
 */
import campus_network from "./asset/campus-network.json" with { type: "json" };
import { distanceMeter, type LatLon } from "./geo.ts";
import type { PointEvent } from "./gamify.ts";
import type { Sighting, WalkFix } from "./journal.ts";

export type ObjectiveFamily = "look" | "log" | "move";

export type ObjectiveId =
  | "learn-3"
  | "learn-native"
  | "log-3"
  | "log-photo"
  | "log-new"
  | "log-native"
  | "move-area-2"
  | "move-gps-400"
  | "move-shore";

export interface ObjectiveDef {
  objective_id: ObjectiveId;
  family: ObjectiveFamily;
  title: string;
  /** One line on how, for the card. */
  how: string;
  target: number;
  is_gps_only: boolean;
}

export const OBJECTIVE: ObjectiveDef[] = [
  { objective_id: "learn-3", family: "look", title: "Read 3 species cards", how: "Tap any find or open the Dex and read its card.", target: 3, is_gps_only: false },
  { objective_id: "learn-native", family: "look", title: "Learn a native tree", how: "Open the card of a native species in the Dex.", target: 1, is_gps_only: false },
  { objective_id: "log-3", family: "log", title: "Log 3 finds", how: "Anything living counts: a tree, a bird, a fungus.", target: 3, is_gps_only: false },
  { objective_id: "log-photo", family: "log", title: "Log a find with a photo", how: "Take the photo in the app's camera when you log.", target: 1, is_gps_only: false },
  { objective_id: "log-new", family: "log", title: "Log a species new to you", how: "Anything not yet in your journal.", target: 1, is_gps_only: false },
  { objective_id: "log-native", family: "log", title: "Log a native species", how: "Narra, molave, dao, katmon… the Dex marks them Native.", target: 1, is_gps_only: false },
  { objective_id: "move-area-2", family: "move", title: "Walk through 2 areas", how: "Start a walk and cross into two campus areas.", target: 2, is_gps_only: false },
  { objective_id: "move-gps-400", family: "move", title: "Walk 400 m outdoors", how: "On real GPS, with a walk started. The stick does not count.", target: 400, is_gps_only: true },
  { objective_id: "move-shore", family: "move", title: "Log a find at the pond's edge", how: "Within 25 m of the campus pond: look into the water.", target: 1, is_gps_only: false },
];

/** Manila is UTC+8 all year: "today" starts at local midnight, not at UTC's. */
export const DAY_OFFSET_MS = 8 * 60 * 60 * 1000;

export function dayKeyOf(now_ms: number): string {
  return new Date(now_ms + DAY_OFFSET_MS).toISOString().slice(0, 10);
}

export function dayStartOf(now_ms: number): number {
  const shifted = now_ms + DAY_OFFSET_MS;
  return shifted - (shifted % (24 * 60 * 60 * 1000)) - DAY_OFFSET_MS;
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** One of each family, picked by the day — the same three on every phone today. */
export function objectiveForDay(day_key: string, catalogue: ObjectiveDef[] = OBJECTIVE): ObjectiveDef[] {
  return (["look", "log", "move"] as ObjectiveFamily[]).map((family) => {
    const pool = catalogue.filter((o) => o.family === family);
    return pool[hash(`${day_key}:${family}`) % pool.length];
  });
}

const pond_ring: LatLon[] = (campus_network as unknown as { water: { water_kind: string; point: [number, number][] }[] }).water
  .filter((w) => w.water_kind === "pond")
  .flatMap((w) => w.point.map(([lat, lon]) => ({ lat, lon })));

/** Metres from the pond's outline (its vertices — the pond is small and densely traced). */
export function meterToPond(at: LatLon): number {
  return pond_ring.reduce((best, p) => Math.min(best, distanceMeter(p, at)), Infinity);
}

export const SHORE_M = 25;

export interface ObjectiveInput {
  now_ms: number;
  sighting: Sighting[];
  point_event: PointEvent[];
  walk_track: WalkFix[];
  /** Species codes the curated list marks Native. */
  native_code: Set<string>;
}

export interface ObjectiveProgress extends ObjectiveDef {
  current: number;
  is_done: boolean;
  /** The subject the reward is keyed on: once per objective per day. */
  award_key: string;
}

export function objectiveProgress(input: ObjectiveInput, def: ObjectiveDef[] = objectiveForDay(dayKeyOf(input.now_ms))): ObjectiveProgress[] {
  const start = dayStartOf(input.now_ms);
  const day = dayKeyOf(input.now_ms);
  const is_today = (iso: string) => Date.parse(iso) >= start && Date.parse(iso) <= input.now_ms;
  const today = input.sighting.filter((s) => is_today(s.created_at));
  const before = new Set(input.sighting.filter((s) => Date.parse(s.created_at) < start).map((s) => s.species_code));
  const learned = input.point_event.filter((e) => e.kind === "learn" && is_today(e.at)).map((e) => e.subject_key.replace(/^species:/, ""));
  const explored = new Set(input.point_event.filter((e) => e.kind === "explore" && is_today(e.at)).map((e) => e.subject_key));
  const gps_track = input.walk_track.filter((f) => f.source === "gps" && f.at >= start);
  let gps_m = 0;
  for (let i = 1; i < gps_track.length; i += 1) {
    const leg = distanceMeter(gps_track[i - 1], gps_track[i]);
    const second = (gps_track[i].at - gps_track[i - 1].at) / 1000;
    /* A jump faster than a run is GPS noise or a vehicle, not walking. */
    if (second > 0 && leg / second <= 4.2) gps_m += leg;
  }

  const count = (id: ObjectiveId): number => {
    switch (id) {
      case "learn-3":
        return new Set(learned).size;
      case "learn-native":
        return learned.some((code) => input.native_code.has(code)) ? 1 : 0;
      case "log-3":
        return today.length;
      case "log-photo":
        return today.some((s) => Boolean(s.photo_data)) ? 1 : 0;
      case "log-new":
        return today.some((s) => !before.has(s.species_code)) ? 1 : 0;
      case "log-native":
        return today.some((s) => input.native_code.has(s.species_code)) ? 1 : 0;
      case "move-area-2":
        return explored.size;
      case "move-gps-400":
        return Math.floor(gps_m);
      case "move-shore":
        return today.some((s) => s.lat !== null && s.lon !== null && meterToPond({ lat: s.lat, lon: s.lon }) <= SHORE_M) ? 1 : 0;
    }
  };

  return def.map((d) => {
    const current = Math.min(count(d.objective_id), d.target);
    return { ...d, current, is_done: current >= d.target, award_key: `objective:${day}:${d.objective_id}` };
  });
}
