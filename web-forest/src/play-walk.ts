/**
 * Player-steered campus walk.
 *
 * Demo campus is a scripted loop for a projector. Play is the same campus
 * with you on the sticks: WASD / arrows, or a tap on the ground. Both stay
 * inside CAMPUS_BOX and outside the restricted grove — a walk that teaches
 * off-limits ground as walkable is the wrong lesson.
 */
import { RESTRICTED_POLYGON } from "./data.ts";
import {
  DEMO_WALK,
  WALK_PACE_MS,
  bearingDegree,
  distanceMeter,
  isInsideCampus,
  type LatLon,
} from "./geo.ts";

/** First point of the stage loop — already asserted walkable in `geo.test.ts`. */
export const PLAY_START: LatLon = DEMO_WALK[0];

export const PLAY_TICK_MS = 50;
/** Shift multiplies walking pace. 3× is a jog, not a teleport. */
export const PLAY_RUN_MULTIPLIER = 3;

function inRestricted(point: LatLon): boolean {
  const ring = RESTRICTED_POLYGON;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (
      a.lat > point.lat !== b.lat > point.lat &&
      point.lon < ((b.lon - a.lon) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lon
    ) {
      inside = !inside;
    }
  }
  return inside;
}

export function isWalkable(point: LatLon): boolean {
  return isInsideCampus(point) && !inRestricted(point);
}

/**
 * Metres along a compass heading. 0 is north, clockwise — same as `bearingDegree`.
 * The 111320 m/degree figure is the usual campus-scale approximation; haversine
 * on the result is what tests measure against.
 */
export function offsetMeter(from: LatLon, heading_degree: number, meter: number): LatLon {
  const rad = (heading_degree * Math.PI) / 180;
  const lat_m = 111_320;
  const lon_m = lat_m * Math.cos((from.lat * Math.PI) / 180);
  return {
    lat: from.lat + (meter * Math.cos(rad)) / lat_m,
    lon: from.lon + (meter * Math.sin(rad)) / lon_m,
  };
}

/** One step. A blocked step (off campus, into the grove) stays put. */
export function stepPlayWalk(from: LatLon, heading_degree: number, meter: number): LatLon {
  const next = offsetMeter(from, heading_degree, meter);
  return isWalkable(next) ? next : from;
}

/** Walk toward `to`. Arriving lands on it when the remaining gap is one step. */
export function stepToward(from: LatLon, to: LatLon, meter: number): LatLon {
  const gap = distanceMeter(from, to);
  if (gap <= meter) return isWalkable(to) ? to : from;
  return stepPlayWalk(from, bearingDegree(from, to), meter);
}

export interface PlayHeld {
  north: boolean;
  south: boolean;
  east: boolean;
  west: boolean;
}

/**
 * Screen-relative heading from held keys. W / up is screen-forward, which is
 * the camera bearing (0 = north). Returns null when nothing is held.
 */
export function headingFromKey(held: PlayHeld, bearing_degree: number): number | null {
  let sx = 0;
  let sy = 0;
  if (held.north) sy += 1;
  if (held.south) sy -= 1;
  if (held.east) sx += 1;
  if (held.west) sx -= 1;
  return headingFromStick({ x: sx, y: sy }, bearing_degree);
}

/**
 * A thumbstick's throw, as a screen-space vector.
 *
 * `x` is right, `y` is UP the screen — deliberately not the y a pointer event
 * hands you, which grows downward. The flip happens once, where the stick reads
 * the pointer, so that everything downstream of here shares one convention with
 * `headingFromKey` instead of each caller remembering to negate.
 */
export interface PlayStick {
  x: number;
  y: number;
}

/** Below this throw the stick is at rest — a thumb resting on glass is not a walk. */
export const STICK_DEADZONE = 0.16;

/**
 * Screen-relative heading from a stick. Same contract as `headingFromKey`:
 * screen-forward is the camera bearing, and null means "not walking".
 */
export function headingFromStick(stick: PlayStick, bearing_degree: number): number | null {
  const throw_ = Math.hypot(stick.x, stick.y);
  if (throw_ < STICK_DEADZONE) return null;
  const screen = (Math.atan2(stick.x, stick.y) * 180) / Math.PI;
  return (bearing_degree + screen + 360) % 360;
}

/**
 * How hard the stick is pushed, 0…1, with the deadzone taken out.
 *
 * Rescaling past the deadzone rather than clipping it means the first
 * millimetre of travel that actually counts produces the slowest walk, not a
 * sudden jump to 16% pace. A keyboard reports 1 here and always did.
 */
export function throttleFromStick(stick: PlayStick): number {
  const throw_ = Math.min(1, Math.hypot(stick.x, stick.y));
  if (throw_ < STICK_DEADZONE) return 0;
  return (throw_ - STICK_DEADZONE) / (1 - STICK_DEADZONE);
}

export function playMeterForTick(dt_ms: number, is_run: boolean, throttle = 1): number {
  const pace = WALK_PACE_MS * (is_run ? PLAY_RUN_MULTIPLIER : 1);
  return pace * (dt_ms / 1000) * Math.max(0, Math.min(1, throttle));
}
