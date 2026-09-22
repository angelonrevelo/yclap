/**
 * Continuous zoom — the rules, ported from the fix in `tripi`.
 *
 * ## What was wrong
 *
 * This map rounded the zoom to an integer and stepped it by whole levels. A
 * wheel tick or a zoom button therefore doubled or halved the scale in one
 * frame: the tile set is thrown away, a new one is fetched, and the campus
 * jumps. On a trackpad it reads as a jerky staircase, and on a phone there was
 * no pinch at all — two fingers rotated the camera, so a judge pinching to look
 * closer got a spin instead.
 *
 * ## What tripi does, and what is portable
 *
 * `tripi/apps/web/public/map.html` solves it with Leaflet — `zoomSnap: 0`,
 * `scrollWheelZoom` off, and an inlined Leaflet.SmoothWheelZoom that turns the
 * wheel into a GOAL and eases the live zoom toward it on a rAF loop.
 *
 * This repo has no Leaflet and that is deliberate: the map is hand-written
 * precisely so the offline story is not handed to a dependency. So the plugin
 * cannot be dropped in — the technique is ported instead, and it is three
 * things:
 *
 * 1. **Zoom is fractional.** Tiles only exist at integer levels, so the tile
 *    grid and every projection stay on `tileZoomOf(exact)` and the leftover
 *    fraction becomes a CSS scale, `zoomScaleOf(exact)`. That is exactly what
 *    Leaflet's `zoomSnap: 0` does under the hood: keep the tiles you have and
 *    scale them until the next whole level is worth fetching.
 * 2. **The wheel sets a goal; a frame loop chases it.** Each frame closes
 *    `ZOOM_EASE` of the remaining distance, which is what makes it feel like a
 *    camera rather than a setting.
 * 3. **The zoom is anchored.** The point under the cursor or the pinch midpoint
 *    stays under it.
 *
 * ## The bug tripi actually named, and why it is not repeated here
 *
 * `cee3a12 fix(map): the smooth zoom stalls when the cursor sits exactly on the
 * centre` — upstream's frame loop early-returned when the cursor offset from
 * the container centre was exactly `(0,0)`, and returned WITHOUT scheduling the
 * next frame. The loop died mid-gesture and could not restart, so the zoom froze
 * until the idle timeout fired.
 *
 * That whole class of bug comes from a frame loop with a conditional return in
 * it. So `easeZoom` below is total: it is a pure function of (current, goal)
 * that always returns a number, and the caller's loop has no early exit at all
 * — it runs until `isZoomSettled` says the gesture is over. There is nowhere
 * for a frame to be silently dropped.
 */

/** Zoom levels per unit of wheel delta, before sensitivity. tripi: 0.003. */
export const WHEEL_ZOOM_PER_DELTA = 0.003;

/** Multiplier on the above. tripi runs 1.5; a campus is small, so it reads well. */
export const WHEEL_SENSITIVITY = 1.5;

/** Fraction of the remaining distance closed each frame. tripi: 0.3. */
export const ZOOM_EASE = 0.3;

/**
 * Under this much left to travel, the gesture is done.
 *
 * It cannot be arbitrarily small, and the reason is worth stating because the
 * first value chosen here hung the loop. Each frame is quantised to two places,
 * so the returned zoom can sit up to half a hundredth below where the easing
 * put it. The loop closes `ZOOM_EASE` of the remaining gap per frame, so it
 * reaches an equilibrium where the easing step and the quantisation error
 * cancel — at a gap of about `0.005 / ZOOM_EASE`, roughly 0.017. A settle
 * threshold below that is never crossed and the loop runs forever, a hundredth
 * of a level short of its goal.
 *
 * tripi does not have this bug because its gesture ends on a 200 ms idle timer
 * rather than on convergence; ours ends when it arrives, so the threshold has
 * to clear the equilibrium. 0.02 does, and 0.02 of a zoom level is a quarter of
 * a pixel on a phone.
 */
export const ZOOM_SETTLE = 0.02;

/** Idle gap after the last wheel event before the gesture is considered over. */
export const WHEEL_IDLE_MS = 200;

/**
 * Step for the +/- buttons and the keyboard.
 *
 * Fractional, like tripi's `zoomDelta: 0.4`, so that pressing a button does not
 * re-snap a camera the wheel just left between levels. A whole level per press
 * is the staircase this change exists to remove.
 */
export const ZOOM_BUTTON_DELTA = 0.4;

/**
 * Two decimal places, keeping the transform string stable across frames.
 *
 * Rounds rather than flooring. tripi floors, which biases every frame downward
 * — harmless there because its loop is ended by a timer, and a stall in ours.
 * See `ZOOM_SETTLE`.
 */
export function quantizeZoom(zoom: number): number {
  return Math.round(zoom * 100) / 100;
}

export function clampZoom(zoom: number, floor: number, cap: number): number {
  /* NaN has no side to be clamped to, so it falls back to the floor. An
     infinity does — `Math.min`/`Math.max` resolve it correctly — so it is left
     to them rather than thrown away. */
  if (Number.isNaN(zoom)) return floor;
  return Math.max(floor, Math.min(cap, zoom));
}

/**
 * The integer level the TILES are drawn at.
 *
 * Rounding rather than flooring keeps the scale factor inside
 * `[1/√2, √2]` — a tile is never stretched past about 41%, where upscaling
 * starts to read as blur rather than as zoom. Flooring would allow 2×.
 */
export function tileZoomOf(exact: number): number {
  return Math.round(exact);
}

/** The CSS scale that carries the fractional part. 1 at a whole level. */
export function zoomScaleOf(exact: number): number {
  return 2 ** (exact - tileZoomOf(exact));
}

/**
 * One frame of easing. Total by construction — see the header on why there is
 * no condition in here that could skip a frame.
 */
export function easeZoom(current: number, goal: number): number {
  const next = current + (goal - current) * ZOOM_EASE;
  /* Snap the last sliver rather than approaching it forever: the loop would
     otherwise run for another twenty frames moving a hundredth of a level. */
  if (Math.abs(goal - next) < ZOOM_SETTLE) return quantizeZoom(goal);
  return quantizeZoom(next);
}

/**
 * Has the gesture arrived?
 *
 * EXACT equality, not a second threshold — and that is the fix for a knife-edge
 * this port walked straight into. `easeZoom` snaps when the value it is ABOUT to
 * return is within `ZOOM_SETTLE`; a caller asking "are we there yet" about the
 * value it already HAS is asking one frame earlier. With the two thresholds
 * equal, float error decided which won: the gap at 21.98 measures
 * 0.019999999999999574, just inside, so the loop exited one frame early and the
 * camera stopped 0.02 short of the level it was sent to — every time.
 *
 * `easeZoom` returns the goal itself on the snapping frame, so equality is
 * reachable, exact, and cannot be nudged by rounding.
 */
export function isZoomSettled(current: number, goal: number): boolean {
  return current === goal;
}

/** Wheel delta → how far the goal should move, in zoom levels. */
export function wheelZoomStep(delta_y: number, sensitivity = WHEEL_SENSITIVITY): number {
  /* Wheel deltas differ wildly by device and by deltaMode; clamping the
     magnitude stops one flick of a free-spinning mouse wheel from asking for
     nine levels at once. */
  const capped = Math.max(-120, Math.min(120, delta_y));
  return -capped * WHEEL_ZOOM_PER_DELTA * sensitivity;
}

/**
 * Zoom levels implied by a pinch, from the finger spread at the start of the
 * gesture to now.
 *
 * `log2` because zoom IS a log2 scale: doubling the distance between two
 * fingers is exactly one level, at any starting spread. A linear mapping makes
 * a pinch feel fast when the fingers are close and dead when they are wide.
 */
export function pinchZoomDelta(start_distance: number, now_distance: number): number {
  if (start_distance < 1 || now_distance < 1) return 0;
  return Math.log2(now_distance / start_distance);
}
