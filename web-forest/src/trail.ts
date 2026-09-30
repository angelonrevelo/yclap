/**
 * Nature trails — an ordered list of stops, walked over the footpaths.
 *
 * Gelo's 09-30 note (`4:53`–`5:11`): "we have the engines for that, but we can
 * even apply it to other things like hiking trails". A trail is the smallest
 * thing that proves it: a JSON file of stops (`src/asset/trail/*.json`, format
 * in the README beside them), routed leg by leg with `planRoute` — the same
 * footpath-weighted grid every walk-to uses, so a trail can only run where a
 * walker may stand. Nothing about a trail is campus-specific except its file.
 *
 * `2:40`–`2:59`: it has to read as something usable, "not a childish game". So
 * trail mode is plain: the leg you are on, the distance and minutes to the next
 * stop at `WALK_PACE_MS`, one card per stop, and progress as "3 of 8".
 */
import campus_tree_walk from "./asset/trail/campus-tree-walk.json" with { type: "json" };
import { walkMinute, type LatLon } from "./geo.ts";
import { planRoute, type Route } from "./route.ts";

export interface TrailStop extends LatLon {
  stop_code: string;
  /** Optional: a stop can be a view, a bench or a sign, not only a species. */
  species_code?: string;
  where: string;
  look_for: string;
  is_named_by_us: boolean;
  /** False when the position is the app's own demo point, not a surveyed feature. */
  is_position_surveyed: boolean;
}

export interface Trail {
  trail_code: string;
  title: string;
  blurb: string;
  campus_code: string;
  is_named_by_us: boolean;
  author: string;
  created_on: string;
  stop: TrailStop[];
}

export const TRAIL: Trail[] = [campus_tree_walk as Trail];

export function trailByCode(trail_code: string): Trail | null {
  return TRAIL.find((t) => t.trail_code === trail_code) ?? null;
}

export interface TrailLeg {
  from: TrailStop;
  to: TrailStop;
  /** Null when the router finds no way — the plan says so instead of drawing a line through a wall. */
  route: Route | null;
}

export interface TrailPlan {
  trail: Trail;
  leg: TrailLeg[];
  length_m: number;
  minute: number;
  /** Legs with no route. A shipped trail has none; `trail.test.ts` holds it. */
  broken_leg_count: number;
}

/** Route every leg. The grid build is cached by `route.ts`, so the first plan pays for it once. */
export function planTrail(trail: Trail): TrailPlan {
  const leg: TrailLeg[] = [];
  let length_m = 0;
  let broken_leg_count = 0;
  for (let k = 1; k < trail.stop.length; k += 1) {
    const route = planRoute(trail.stop[k - 1], trail.stop[k]);
    if (route) length_m += route.length_m;
    else broken_leg_count += 1;
    leg.push({ from: trail.stop[k - 1], to: trail.stop[k], route });
  }
  return { trail, leg, length_m, minute: walkMinute(length_m), broken_leg_count };
}

/** Metres left from stop `at` (0-based) to the end, along the routed legs. */
export function remainingMeter(plan: TrailPlan, at: number): number {
  let m = 0;
  for (let k = at; k < plan.leg.length; k += 1) m += plan.leg[k].route?.length_m ?? 0;
  return m;
}

/** "Stop 3 of 8". */
export function progressLine(plan: TrailPlan, at: number): string {
  return `Stop ${at + 1} of ${plan.trail.stop.length}`;
}
