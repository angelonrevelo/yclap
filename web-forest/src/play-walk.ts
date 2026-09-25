/**
 * Player-steered campus walk.
 *
 * Demo campus is a scripted loop for a projector. Play is the same campus
 * with you on the sticks: WASD / arrows, or a tap on the ground. Both stay
 * inside CAMPUS_BOX, outside the restricted grove and outside every building
 * footprint — a walk that teaches off-limits ground as walkable is the wrong
 * lesson, and a walker standing on a roof is the wrong picture.
 */
import { RESTRICTED_POLYGON } from "./data.ts";
import { buildingAt } from "./placement.ts";
import {
  DEMO_WALK,
  bearingDegree,
  distanceMeter,
  isInsideCampus,
  type LatLon,
} from "./geo.ts";

/** First point of the stage loop — already asserted walkable in `geo.test.ts`. */
export const PLAY_START: LatLon = DEMO_WALK[0];

/**
 * Where a stick walk begins when nothing better is known.
 *
 * Not `PLAY_START`. The stage loop starts on the Moro Lorenzo football field,
 * which is right for a scripted lap and wrong for a first impression: the stick
 * is what a judge at the off-campus showcase lands on, and the first screen
 * they saw was a lawn the width of the phone with nothing on it. This is the
 * footpath between Schmitt Hall's grounds and the Zen Garden, two of the
 * greenest MEASURED sectors on campus, with a road junction in view.
 */
export const STICK_START: LatLon = { lat: 14.63904, lon: 121.07747 };

/** Nearest and farthest a player's own start sits from `STICK_START`, metres. */
export const START_SPREAD_MIN_M = 10;
export const START_SPREAD_MAX_M = 25;

function startHashOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * This player's own start: a spot on a 10–25 m ring around `STICK_START`,
 * seeded by `player_id`, so every phone at the showcase hall does not pile its
 * walker onto one point. Same id, same spot, every load. If the seeded spot is
 * not walkable (the same `isWalkable` rule the stick obeys) the ring is walked
 * round in 30° steps; if none of it is, `STICK_START` itself.
 */
export function spreadStartOf(player_id: string): LatLon {
  if (!player_id) return STICK_START;
  const h = startHashOf(`start:${player_id}`);
  const angle = h % 360;
  const span = START_SPREAD_MAX_M - START_SPREAD_MIN_M;
  const meter = START_SPREAD_MIN_M + ((h >>> 9) % 1000) / 1000 * span;
  for (let step = 0; step < 12; step += 1) {
    const at = offsetMeter(STICK_START, (angle + step * 30) % 360, meter);
    if (isWalkable(at)) return at;
  }
  return STICK_START;
}

/**
 * `?at=lat,lon` pins the start exactly, for a projector; anything unwalkable
 * falls back. Without it a known player starts on their own spot near
 * `STICK_START` (`spreadStartOf`), and an unknown one on `STICK_START`.
 */
export function stickStartOf(search: string, player_id = ""): LatLon {
  const raw = new URLSearchParams(search).get("at");
  if (raw) {
    const [lat, lon] = raw.split(",").map(Number);
    if (Number.isFinite(lat) && Number.isFinite(lon) && isWalkable({ lat, lon })) return { lat, lon };
  }
  return spreadStartOf(player_id);
}

export const PLAY_TICK_MS = 50;

/**
 * Shift, on a keyboard, on top of whatever the stick is already giving you.
 *
 * Only 2× now, because the stick itself carries the range: full deflection is
 * already the fast end. It used to be the ONLY way to move at any speed, and it
 * needed a key — which meant that on the phone the showcase is demoed from,
 * where there is no Shift, there was no way to go faster at all.
 */
export const PLAY_RUN_MULTIPLIER = 2;

/* ── how fast the stick walks ────────────────────────────────────────────────
 *
 * The stick used to move you at `WALK_PACE_MS`, 1.3 m/s, the real preferred
 * walking speed of an adult. That is the right number for the "≈4 min walk"
 * captions — it is a claim the app makes on screen and it must not move — and
 * it is the wrong number for a thumb on a glass screen. At the street camera
 * 1.3 m/s crosses the visible ground in about twenty seconds and reaches a find
 * sixty metres off in three quarters of a minute. At a booth, with somebody
 * else waiting for the phone, that reads as broken.
 *
 * So the stick gets its own pace, and it is deliberately NOT a walking speed:
 * it is a camera-traversal speed, quoted as a fraction of the visible ground
 * per second. Expressing it that way is what makes it feel the same at z19 and
 * at z22 — a fixed m/s crawls when the camera is wide and races when it is
 * close, because the same distance is a different fraction of the screen.
 *
 * Nothing here touches `WALK_PACE_MS`, the walking-minute captions, or the demo
 * loop, which is still a real walk because a projector is showing a real walk.
 */

/** Fraction of the visible span the stick covers per second at full throw. */
export const PLAY_SPAN_PER_SECOND = 0.3;

/** Floor and ceiling, so neither camera end produces a crawl or a teleport. */
export const PLAY_PACE_FLOOR_MS = 2.5;
export const PLAY_PACE_CEILING_MS = 16;

/** Visible span assumed when the caller does not know the camera. ~z22. */
export const PLAY_DEFAULT_SPAN_M = 30;

/**
 * Top speed for a given camera, in metres per second.
 *
 * Clamped at both ends: wide open the fraction would ask for a car, and at the
 * closest camera it would ask for less than a walk.
 */
export function stickTopPaceMs(span_m: number): number {
  const want = PLAY_SPAN_PER_SECOND * Math.max(0, span_m);
  return Math.max(PLAY_PACE_FLOOR_MS, Math.min(PLAY_PACE_CEILING_MS, want));
}

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

/**
 * On campus, outside the grove, and not inside a building.
 *
 * Buildings joined on 09-26: the playtest walked straight across Kostka Hall's
 * footprint, and with the buildings extruded the walker then stood on the
 * roof. A footprint is refused exactly the way the grove is.
 */
export function isWalkable(point: LatLon): boolean {
  return isInsideCampus(point) && !inRestricted(point) && buildingAt(point) === null;
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

/**
 * How far off the heading a blocked step may slide, tried nearest first.
 *
 * With buildings refused, a walker that stopped dead at every wall would stick
 * to the first building it brushed — and a tap-to-walk across campus would
 * park against the first wall in the straight line. So a blocked step slides:
 * it tries the heading bent by 30°, then 60°, then 75°, each at the share of
 * the step that still points the way you meant (cos of the bend), exactly as
 * a game character scrapes along a wall. Never 90° or more, so a slide can
 * never carry you backwards or fully sideways off your intent.
 */
export const SLIDE_DEGREE = [30, 60, 75];

/**
 * Only a step this short slides. One stick tick is at most ~4 m (the ceiling
 * pace, running, over the longest tick); a longer "step" is a jump somebody
 * asked for in one go, and bending a jump is a detour, not a scrape.
 */
export const SLIDE_MAX_METER = 5;

/**
 * One step. A step into unwalkable ground (off campus, into the grove, into a
 * building) is refused; the walker slides along the edge if a bent step is
 * walkable, and otherwise stays put.
 */
export function stepPlayWalk(from: LatLon, heading_degree: number, meter: number): LatLon {
  const next = offsetMeter(from, heading_degree, meter);
  if (isWalkable(next)) return next;
  if (meter > SLIDE_MAX_METER) return from;
  for (const bend of SLIDE_DEGREE) {
    const share = meter * Math.cos((bend * Math.PI) / 180);
    for (const side of [1, -1]) {
      const slid = offsetMeter(from, heading_degree + side * bend, share);
      if (isWalkable(slid)) return slid;
    }
  }
  return from;
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
  /* MINUS the bearing, not plus.
   *
   * The ground plane is turned by `rotateZ(+bearing)`, so a camera bearing of
   * 90 swings NORTH round to the right of the screen — which means the
   * direction that now appears to be straight up is WEST, compass 270, i.e.
   * −90. The camera bearing and the compass therefore run in opposite
   * directions, and adding them walked you the wrong way round the campus the
   * moment anybody rotated the view. `screenAngleOf` below is this function's
   * inverse and the two are pinned against each other by a test.
   */
  return (screen - bearing_degree + 360) % 360;
}

/**
 * The inverse: a real compass heading → the angle it appears to point at on
 * screen, under a camera turned by `bearing_degree`.
 *
 * Anything that DRAWS a direction needs this one — a walker leaning into their
 * travel, an arrow toward a find. Anything that MOVES the walker needs
 * `headingFromStick`. They are inverses and the sign is easy to get backwards
 * in either, which is why both live here next to each other.
 */
export function screenAngleOf(heading_degree: number, bearing_degree: number): number {
  return (heading_degree + bearing_degree + 360) % 360;
}

/**
 * Fold an angle into −180…180.
 *
 * A DIRECTION is happiest as 0…360, but a LEAN is not: the character tips by
 * `angle / 12`, and on a 0…360 scale "one degree west of straight up" arrives
 * as 359 and tips the walker hard over to the right. A lean needs to know which
 * side of forward it is on, so it needs the signed form.
 */
export function signedAngle(degree: number): number {
  return ((degree + 540) % 360) - 180;
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

/**
 * Metres to move this tick.
 *
 * `throttle` is the stick's deflection, so the speed is analog end to end: a
 * nudge is a walk and a full push is the top of the range. That is the whole
 * reason the run key is no longer load-bearing — a thumb can already ask for
 * the fast end, which a thumb could not do when speed lived on Shift.
 */
export function playMeterForTick(
  dt_ms: number,
  is_run: boolean,
  throttle = 1,
  span_m = PLAY_DEFAULT_SPAN_M,
): number {
  const top = stickTopPaceMs(span_m) * (is_run ? PLAY_RUN_MULTIPLIER : 1);
  return top * (dt_ms / 1000) * Math.max(0, Math.min(1, throttle));
}
