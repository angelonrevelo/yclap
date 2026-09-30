/**
 * Emergency & DRR — what the public record holds for this campus, and the
 * walk to the nearest of it.
 *
 * Gelo's 09-30 note (`3:58`–`4:46`): the judges would use the map for
 * "hazards, DRR … emergency areas in school". The rule this file exists to
 * keep: NOTHING here is ours. Every point is an OpenStreetMap feature
 * (`campus-emergency.json`, with its OSM id, source and fetch date) and every
 * flood zone is UP NOAH's published 100-year model (`campus-flood.json`).
 * When a source has nothing of a kind — OSM held no assembly point, no AED and
 * no first-aid kit on campus on 2026-09-30 — the layer says so in words
 * (`emptyLine`) and never tops it up with a guess. A made-up assembly point
 * is worse than none: it sends people somewhere on a phone's say-so.
 *
 * Routing reuses `planRoute`, the same footpath-weighted grid the walk-to
 * uses, so "the nearest" is nearest BY WALKING, not as the crow flies — a
 * clinic across a building is further than it looks.
 */
import campus_boundary from "./asset/campus-boundary.json" with { type: "json" };
import emergency_file from "./asset/campus-emergency.json" with { type: "json" };
import flood_file from "./asset/campus-flood.json" with { type: "json" };
import { distanceMeter, type LatLon } from "./geo.ts";
import { planRoute, type Route } from "./route.ts";

export interface EmergencyFeature {
  osm_id: string;
  kind: string;
  name: string | null;
  lat: number;
  lon: number;
  tag: Record<string, string>;
  source: string;
  source_url: string;
  fetched_on: string;
}

export interface EmergencyFile {
  source: string;
  licence: string;
  fetched_on: string;
  count: Record<string, number>;
  feature: EmergencyFeature[];
}

export const EMERGENCY_FILE = emergency_file as unknown as EmergencyFile;
export const EMERGENCY_ATTRIBUTION = "Emergency points © OpenStreetMap contributors, ODbL";
export const FLOOD_ATTRIBUTION = "Flood hazard © UP NOAH, ODbL";

/**
 * What a person looks for, grouped. `kind` is the OSM value that put the
 * feature in the extract. Pharmacies, dentists and counselling centres are
 * shown but are not "help" a route should send someone running to.
 */
export type EmergencyGroup = "assembly" | "medical" | "safety" | "fire" | "health";

export const GROUP_KIND: Record<EmergencyGroup, string[]> = {
  assembly: ["assembly_point"],
  medical: ["clinic", "hospital", "doctors", "first_aid_kit", "defibrillator", "emergency_ward_entrance"],
  safety: ["police", "fire_station", "phone", "emergency_access_point"],
  fire: ["fire_extinguisher", "fire_hydrant", "fire_hose", "fire_alarm_box"],
  health: ["pharmacy", "dentist", "psychotherapist", "counselling", "psychologist"],
};

export const GROUP_LABEL: Record<EmergencyGroup, string> = {
  assembly: "Assembly points",
  medical: "Clinics, first aid & AEDs",
  safety: "Safety & fire stations",
  fire: "Hydrants & extinguishers",
  health: "Pharmacies & other health",
};

/** The groups a "route to the nearest" is offered for. */
export const ROUTABLE_GROUP: EmergencyGroup[] = ["assembly", "medical", "safety"];

export function groupOf(kind: string): EmergencyGroup {
  for (const [group, kind_list] of Object.entries(GROUP_KIND) as [EmergencyGroup, string[]][]) {
    if (kind_list.includes(kind)) return group;
  }
  return "health";
}

export function featureInGroup(group: EmergencyGroup, row: EmergencyFeature[] = EMERGENCY_FILE.feature): EmergencyFeature[] {
  return row.filter((f) => groupOf(f.kind) === group);
}

/**
 * What the layer says when a source has nothing of a group — and what it says
 * when it does. Always names the source and its date: an empty result is
 * itself a finding ("OSM had none on 09-30"), not the absence of one.
 */
export function groupLine(group: EmergencyGroup, row: EmergencyFeature[] = EMERGENCY_FILE.feature, fetched_on = EMERGENCY_FILE.fetched_on): string {
  const n = featureInGroup(group, row).length;
  if (n === 0) return emptyLine(group, fetched_on);
  return `${n} mapped on OpenStreetMap (fetched ${fetched_on})`;
}

export function emptyLine(group: EmergencyGroup, fetched_on = EMERGENCY_FILE.fetched_on): string {
  const what = GROUP_LABEL[group].toLowerCase();
  return `None mapped: OpenStreetMap had no ${what} on this campus (checked ${fetched_on}). We will not guess one. The official list is with the university DRRM office / CFMO.`;
}

function ringContains(ring: number[][], point: LatLon): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [lon_i, lat_i] = ring[i];
    const [lon_j, lat_j] = ring[j];
    if (lat_i > point.lat !== lat_j > point.lat && point.lon < ((lon_j - lon_i) * (point.lat - lat_i)) / (lat_j - lat_i) + lon_i) {
      inside = !inside;
    }
  }
  return inside;
}

/** Inside one of the OSM school-ground rings — the Katipunan shop strip is in the box but not on campus. */
export function isOnCampus(point: LatLon): boolean {
  return (campus_boundary as { boundary: { ring: number[][] }[] }).boundary.some((b) => ringContains(b.ring, point));
}

export function featureLabel(f: EmergencyFeature): string {
  return f.name ?? f.kind.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}

export interface NearestHelp {
  feature: EmergencyFeature;
  route: Route;
}

/**
 * The feature of `group` with the shortest WALK from `from`, or null — null
 * both when the group is empty and when none of it can be reached (a
 * footprint deeper than the router's 40 m snap). Straight-line distance only
 * orders the candidates; the route decides.
 */
export function nearestHelp(from: LatLon, group: EmergencyGroup, row: EmergencyFeature[] = EMERGENCY_FILE.feature): NearestHelp | null {
  const candidate = featureInGroup(group, row)
    .map((f) => ({ f, d: distanceMeter(from, f) }))
    .sort((a, b) => a.d - b.d);
  let best: NearestHelp | null = null;
  for (const { f, d } of candidate) {
    /* No route can be shorter than the straight line. */
    if (best && d >= best.route.length_m) break;
    const route = planRoute(from, f);
    if (route && (!best || route.length_m < best.route.length_m)) best = { feature: f, route };
  }
  return best;
}

/* ── flood ─────────────────────────────────────────────────────────────────── */

export interface FloodZone {
  /** NOAH `Var`: 1 low (0–0.5 m), 2 medium (>0.5–1.5 m), 3 high (>1.5 m). */
  hazard: number;
  /** [lon, lat] rings, even-odd. */
  ring: number[][][];
  ring_area_m2: number;
}

export interface FloodFile {
  source: string;
  source_url: string;
  licence: string;
  shapefile_date: string;
  fetched_on: string;
  class: Record<string, string>;
  zone: FloodZone[];
}

export const FLOOD_FILE = flood_file as unknown as FloodFile;

export const FLOOD_LABEL: Record<number, string> = {
  1: "Low (knee-deep or less)",
  2: "Medium (knee to neck)",
  3: "High (above the neck)",
};

/** NOAH's own yellow / orange / red. */
export const FLOOD_COLOUR: Record<number, string> = { 1: "#F2D13A", 2: "#F08A24", 3: "#D8342B" };

/** The highest NOAH 100-year class covering `point`, 0 where the model shows none. */
export function floodHazardAt(point: LatLon, zone: FloodZone[] = FLOOD_FILE.zone): number {
  let top = 0;
  for (const z of zone) {
    if (z.hazard <= top) continue;
    let inside = false;
    for (const ring of z.ring) if (ringContains(ring, point)) inside = !inside;
    if (inside) top = z.hazard;
  }
  return top;
}

export function floodLine(zone: FloodZone[] = FLOOD_FILE.zone): string {
  if (zone.length === 0) {
    return `None shown: UP NOAH's 100-year flood model has no hazard polygon in this box (shapefile ${FLOOD_FILE.shapefile_date}).`;
  }
  return `UP NOAH 100-year rain model (shapefile ${FLOOD_FILE.shapefile_date}). A model, not a record of past floods.`;
}
