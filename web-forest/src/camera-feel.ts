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
/**
 * The steepest. Past this the horizon comes a third of the way down a phone
 * screen and the ground under the walker flattens to a strip.
 */
export const PITCH_MAX = 68;

/**
 * Pitch at the widest play zoom and at the closest one. 62 at the street
 * camera (was 58): with the world ending at its real view distance, 62° puts
 * the horizon about an eighth of the way down the glass with sky above it, as
 * GO does; at 58° the sky was a sliver. Pulled back the camera looks down more
 * and the horizon leaves the screen — also as GO does.
 */
export const PITCH_AT_WIDE = 48;
export const PITCH_AT_CLOSE = 62;
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

/* ── how far the camera sees: the real horizon ──────────────────────────── */

/**
 * How far ahead the raked camera draws the world, in camera-frame pixels (the
 * plane after rotation and zoom, before the tilt), as a multiple of the view
 * height.
 *
 * This is the play view's horizon, and it is a DISTANCE, not a band on the
 * glass. The ground is drawn out to it, fades into the sky's horizon colour
 * over its last stretch (`FOG_START`), and the sky begins where it lands on
 * screen — the way Pokémon GO ends its world at the edge of what it has
 * loaded. Until 10-01 a painted panorama (hills, a skyline) and a haze band
 * sat over a fixed 20–42 % of the screen whatever the camera did, covering
 * ground that was really only 100–400 m away.
 *
 * Fixed in camera pixels, so the distance in metres follows the zoom: about
 * 110 m at the street camera, about 900 m pulled back — zoomed out, you see
 * further, as you would.
 *
 * It also bounds what the GPU has to rasterise. The ground used to be one
 * CSS-3D layer spanning the whole campus, >30,000 px at z22, reaching behind
 * the camera; Chrome cannot work out which part of such a layer is visible,
 * rasterised past its memory budget and dropped tiles — the ground broke into
 * fragments at the close camera (Gelo, 10-01). `cameraClipOf` keeps the layer
 * finite and entirely in front of the eye.
 */
export const VIEW_AHEAD_PER_HEIGHT = 3.6;
/** Fog starts at this share of the view distance and is complete at its end. */
export const FOG_START = 0.55;
/** Never keep ground closer to the eye than this share of the eye's own distance. */
const BEHIND_SAFE = 0.7;

export interface CameraGeometry {
  width: number;
  height: number;
  /** CSS perspective, px. */
  depth: number;
  tilt_degree: number;
  /** Screen y of the plane's pivot (the walker), before the tilt. */
  pivot_y: number;
  /** Post-projection shift down the glass, px (`PLAYER_SCREEN_Y`). */
  shift_y: number;
}

/** Camera-frame pixels ahead of the pivot the world is drawn to. */
export function viewAheadPx(height: number): number {
  return Math.max(600, height * VIEW_AHEAD_PER_HEIGHT);
}

/** Screen y of a ground point `ahead_px` straight ahead of the pivot (negative = behind). */
export function aheadScreenY(g: CameraGeometry, ahead_px: number): number {
  const rad = (g.tilt_degree * Math.PI) / 180;
  const scale = g.depth / (g.depth + ahead_px * Math.sin(rad));
  return g.pivot_y - ahead_px * Math.cos(rad) * scale + g.shift_y;
}

/**
 * The box the ground is clipped to, in the camera frame, relative to the pivot:
 * `ahead` px forward, `behind` px back, `half_width` px either side.
 *
 * Behind stops short of the eye (`BEHIND_SAFE` of depth / sin tilt — where a
 * point would land behind the camera) and needs to go no further than the
 * bottom of the glass. Sideways it covers the view at the far end, which is
 * where the frustum is widest. Rotation happens INSIDE this box (the ground
 * turns under a camera-fixed clip), so turning never needs a larger box.
 */
export function cameraClipOf(g: CameraGeometry, ahead_px = viewAheadPx(g.height)): { ahead: number; behind: number; half_width: number } {
  const rad = (g.tilt_degree * Math.PI) / 180;
  const sin = Math.sin(rad);
  const cos = Math.cos(rad);
  const eye_px = sin > 1e-6 ? g.depth / sin : Infinity;
  /* The ground under the bottom edge of the glass. */
  const bottom = g.height - g.shift_y - g.pivot_y;
  const bottom_scale = 1 + (bottom * Math.tan(rad)) / g.depth;
  const behind_needed = bottom_scale > 0.05 ? bottom / (cos * bottom_scale) : eye_px;
  const behind = Math.max(0, Math.min(eye_px * BEHIND_SAFE, behind_needed + 160));
  const far_scale = g.depth / (g.depth + ahead_px * sin);
  const half_width = (g.width / 2) / Math.max(far_scale, 0.02) + 96;
  return { ahead: ahead_px, behind, half_width };
}

/** Fog at a ground distance: 0 clear, 1 gone into the horizon. Smoothstep over the last stretch. */
export function fogAt(distance_m: number, view_m: number): number {
  if (!(view_m > 0) || !Number.isFinite(view_m)) return 0;
  const t = (distance_m - view_m * FOG_START) / (view_m * (1 - FOG_START));
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}
