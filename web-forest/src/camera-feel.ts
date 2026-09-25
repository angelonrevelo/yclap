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
 * Share of the viewport's SHORT side the walker takes, at the widest play zoom
 * and at the closest one.
 *
 * The camera lane sized the walker in flat pixels (112–140 on a phone), which
 * on a 375 px phone made it about 40% of the screen width — the playtest read
 * that as the character eating the map. Pokémon GO's trainer is roughly a
 * quarter of the short side, so the walker is quoted as a share of it instead,
 * which also means a tablet and a phone look like the same game.
 */
export const AVATAR_SHARE_WIDE = 0.22;
export const AVATAR_SHARE_CLOSE = 0.28;
/** The old desktop sizes, now a ceiling: a 1080 px tall window must not get a 300 px egg. */
export const AVATAR_CAP_WIDE = 136;
export const AVATAR_CAP_CLOSE = 172;
/** Before the map has measured itself (0×0) the walker still has a body. */
export const AVATAR_FLOOR = 64;
/** Other phones' walkers, relative to yours: present, but plainly not you. */
export const REMOTE_WALKER_SHARE = 0.75;

/**
 * The walker's drawn size, px, for a zoom and the map's short side in px.
 *
 * The single source for every walker on the play map — yours, and (times
 * `REMOTE_WALKER_SHARE`) everybody else's. Still grows as the camera closes,
 * so at the street camera the character is the thing on screen, which is the
 * genre; pulled back it shrinks so the ground ahead is visible past it.
 */
export function avatarPx(zoom: number, short_side_px: number): number {
  const raw = (zoom - WIDE_ZOOM) / (CLOSE_ZOOM - WIDE_ZOOM);
  const t = Number.isNaN(raw) ? 0 : Math.max(0, Math.min(1, raw));
  const short = Number.isFinite(short_side_px) ? Math.max(0, short_side_px) : 0;
  const share = short * (AVATAR_SHARE_WIDE + (AVATAR_SHARE_CLOSE - AVATAR_SHARE_WIDE) * t);
  const cap = AVATAR_CAP_WIDE + (AVATAR_CAP_CLOSE - AVATAR_CAP_WIDE) * t;
  return Math.round(Math.max(AVATAR_FLOOR, Math.min(cap, share)));
}

/* ── tick interpolation: the walker between position updates ────────────────
 *
 * The stick publishes a position every 50 ms. The glide spring alone smoothed
 * the big steps but not the start of a walk: there the steps are tiny, the
 * spring reached each one inside a frame or two, came to rest, and waited for
 * the next tick — so for the first second the map moved on about every other
 * frame. A turn was the same problem the other way round: the new direction
 * arrived as one whole 50 ms step.
 *
 * So the camera does not chase the raw position. It chases a point that slides
 * from wherever it was to the newest position over the time the NEXT one is
 * expected to take (the gap between the last two arrivals). That point moves
 * every frame at a steady speed while positions keep coming, and a turn bends
 * over one tick instead of snapping. It costs one tick (~50 ms) of latency,
 * which the eye does not see and the spring was already spending.
 */

export interface TickPoint {
  lat: number;
  lon: number;
}

export interface TickLerp {
  from: TickPoint;
  to: TickPoint;
  /** When `to` arrived, ms (any monotonic clock). */
  at: number;
  /** How long the slide from `from` to `to` takes. */
  span_ms: number;
}

/** Shortest and longest slide. Longer than a slow tick would read as lag, not glide. */
export const TICK_LERP_MIN_MS = 16;
export const TICK_LERP_MAX_MS = 120;
/** A gap longer than this is a fresh start, not a cadence: assume the stick's. */
export const TICK_LERP_FRESH_MS = 250;
export const TICK_LERP_DEFAULT_MS = 50;

/** Where the slide is at `now`. */
export function tickLerpAt(state: TickLerp, now: number): TickPoint {
  const raw = state.span_ms > 0 ? (now - state.at) / state.span_ms : 1;
  const t = Number.isNaN(raw) ? 1 : Math.max(0, Math.min(1, raw));
  return {
    lat: state.from.lat + (state.to.lat - state.from.lat) * t,
    lon: state.from.lon + (state.to.lon - state.from.lon) * t,
  };
}

export function isTickLerpDone(state: TickLerp, now: number): boolean {
  return now - state.at >= state.span_ms;
}

/**
 * A new position arrived at `now`. The slide restarts from where it is THIS
 * frame — never from the old target — so a new position can bend the path but
 * cannot make it jump.
 */
export function tickLerpNext(state: TickLerp | null, to: TickPoint, now: number): TickLerp {
  if (!state) return { from: to, to, at: now, span_ms: 0 };
  const gap = now - state.at;
  const span_ms =
    !Number.isFinite(gap) || gap > TICK_LERP_FRESH_MS
      ? TICK_LERP_DEFAULT_MS
      : Math.max(TICK_LERP_MIN_MS, Math.min(TICK_LERP_MAX_MS, gap));
  return { from: tickLerpAt(state, now), to: { lat: to.lat, lon: to.lon }, at: now, span_ms };
}

/* ── gait: when the walker counts as stopped ────────────────────────────────
 *
 * The walker's step animation is on while the fix keeps MOVING and off once it
 * has sat still for a beat. The beat depends on who is publishing the fix: the
 * stick and the demo loop publish every 50–120 ms while they move, so 450 ms
 * of silence (a few ticks, with room for a busy frame) means the thumb came
 * off; a phone's GPS publishes about once a second, so it needs more than two
 * of those missing before "stopped" is a fact rather than a gap between fixes.
 */
export const WALK_STOP_TICK_MS = 450;
export const WALK_STOP_GPS_MS = 2500;

export function walkStopMs(source: string | undefined): number {
  return source === "play" || source === "demo" ? WALK_STOP_TICK_MS : WALK_STOP_GPS_MS;
}
