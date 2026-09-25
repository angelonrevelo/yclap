/**
 * How the play camera FEELS — the numbers behind the 09-25 note (`3:36`–`4:26`):
 * "Pokémon Go... big roads, very zoomed-in characters, and also a tilt axis
 * that is natural and playable... it's still very jittery".
 *
 * Pure, so every one of them is pinned by `camera-feel.test.ts` rather than by
 * somebody's memory of how it looked on a phone.
 */

/* ── glide: the camera eases toward the walker ───────────────────────────────
 *
 * The walker's position arrives in steps — the stick ticks every 50 ms, GPS
 * about once a second — and the camera used to jump to each one. At the street
 * camera a 50 ms stick step is about a dozen pixels, so the ground moved in a
 * visible staircase at 20 Hz, whatever the frame rate was.
 *
 * A first-order ease (close a fixed fraction per frame) fixes the jump but not
 * the stair: its speed is highest just after each step and dies before the
 * next, which reads as a pulse. A critically damped spring carries a VELOCITY
 * between frames, so a staircase in comes out as a nearly constant glide. This
 * is Unity's `SmoothDamp`, the usual game-camera choice for exactly this.
 */

/** Seconds the glide takes to settle, roughly. Short enough not to feel like lag. */
export const GLIDE_SMOOTH_S = 0.14;

/** Under this gap (in the caller's units) with no speed left, the glide is done. */
export const GLIDE_SETTLE = 1e-9;

export interface Glide {
  value: number;
  velocity: number;
}

/**
 * One frame of a critically damped spring toward `target`.
 *
 * Total: always returns a finite state for finite input, and never overshoots
 * the target (the overshoot guard is the last block). `dt_s` is clamped so a
 * tab coming back from the background does not integrate a 30-second frame.
 */
export function glideStep(state: Glide, target: number, dt_s: number, smooth_s = GLIDE_SMOOTH_S): Glide {
  const dt = Math.max(0, Math.min(0.1, dt_s));
  const smooth = Math.max(1e-4, smooth_s);
  const omega = 2 / smooth;
  const x = omega * dt;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = state.value - target;
  const temp = (state.velocity + omega * change) * dt;
  let velocity = (state.velocity - omega * temp) * decay;
  let value = target + (change + temp) * decay;
  /* Crossed the target: land on it rather than swing back. */
  if ((target - state.value > 0) === (value > target)) {
    value = target;
    velocity = dt > 0 ? (value - target) / dt : 0;
  }
  return { value, velocity };
}

/* ── pitch ──────────────────────────────────────────────────────────────────── */

/** The flattest the play camera goes. Below this the ground reads as a diagram. */
export const PITCH_MIN = 40;
/** The steepest. Past this the horizon eats the top of a phone screen. */
export const PITCH_MAX = 64;

/** Pitch at the widest play zoom and at the closest one. */
export const PITCH_AT_WIDE = 46;
export const PITCH_AT_CLOSE = 58;
const WIDE_ZOOM = 19;
const CLOSE_ZOOM = 22;

export function clampPitch(degree: number): number {
  if (Number.isNaN(degree)) return PITCH_AT_WIDE;
  return Math.max(PITCH_MIN, Math.min(PITCH_MAX, degree));
}

/**
 * The resting pitch for a zoom.
 *
 * More tilt as you come closer, like GO: pulled back you want to see the lay
 * of the land, at the street you want to be standing in it. Linear across the
 * play band and flat outside it.
 */
export function pitchForZoom(zoom: number): number {
  const t = Math.max(0, Math.min(1, (zoom - WIDE_ZOOM) / (CLOSE_ZOOM - WIDE_ZOOM)));
  return PITCH_AT_WIDE + (PITCH_AT_CLOSE - PITCH_AT_WIDE) * (Number.isNaN(t) ? 0 : t);
}

/** Degrees of pitch per pixel of two-finger vertical travel. */
export const PITCH_PER_PX = 0.18;
/** Vertical travel a pinch is allowed before it starts to tilt. */
export const PITCH_DEADZONE_PX = 12;

/**
 * Pitch after a two-finger vertical drag of `dy_px` (screen y, down positive).
 *
 * Dragging UP tilts toward the horizon, as in every map app. The deadzone is
 * taken out rather than clipped, so a pinch that wobbles a few pixels does not
 * nod the camera, and the tilt that does start, starts from zero.
 */
export function pitchAfterDrag(start_degree: number, dy_px: number): number {
  const travel = Math.abs(dy_px) <= PITCH_DEADZONE_PX ? 0 : dy_px - Math.sign(dy_px) * PITCH_DEADZONE_PX;
  return clampPitch(start_degree - travel * PITCH_PER_PX);
}

/* ── roads ─────────────────────────────────────────────────────────────────── */

/**
 * A walkway's drawn width, in plane pixels, from its real width in metres.
 *
 * The old ribbons were a fixed 3–9 px at every zoom, so at the street camera —
 * where a pixel is under 4 cm — a road was a hairline across a lawn. Drawn at
 * real width they read the way GO's roads do: wide, pale, the thing you walk
 * on. The floor keeps them legible pulled back; the ceiling stops a road
 * swallowing the screen at the closest camera.
 */
export const ROAD_WIDTH_M = 5.5;
export const PATH_WIDTH_M = 2.6;

export function roadWidthPx(is_road: boolean, plane_meter_per_pixel: number): number {
  const mpp = Math.max(0.005, plane_meter_per_pixel);
  const want = (is_road ? ROAD_WIDTH_M : PATH_WIDTH_M) / mpp;
  const floor = is_road ? 12 : 7;
  const cap = is_road ? 150 : 84;
  return Math.max(floor, Math.min(cap, want));
}

/** The pale casing either side of a ribbon — a kerb, not a border. */
export function roadCasingPx(width_px: number): number {
  return width_px + Math.max(3, width_px * 0.16);
}

/* ── the walker ────────────────────────────────────────────────────────────── */

/**
 * The walker's drawn size, px, for a zoom.
 *
 * Bigger than it was (108 px flat) and bigger again as the camera closes, so
 * at the street camera the character is the thing on screen, which is the
 * genre. Pulled back it shrinks toward the old size so the ground ahead is
 * still visible past it.
 */
export function avatarPx(zoom: number, is_desktop: boolean): number {
  const t = Math.max(0, Math.min(1, (zoom - WIDE_ZOOM) / (CLOSE_ZOOM - WIDE_ZOOM)));
  const [wide, close] = is_desktop ? [136, 172] : [112, 140];
  return Math.round(wide + (close - wide) * (Number.isNaN(t) ? 0 : t));
}
