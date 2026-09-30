import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { LAYER_ORDER, nextLayer, SOURCE, type Layer } from "./basemap";
import {
  CAMPUS_BOX,
  clampCenter,
  fromWorld,
  MAX_ZOOM,
  meterPerPixel,
  MIN_ZOOM,
  TILE_SIZE,
  toWorld,
  type LatLon,
} from "./geo";
import {
  clampZoom,
  easeZoom,
  isZoomSettled,
  pinchZoomDelta,
  tileZoomOf,
  wheelZoomStep,
  WHEEL_IDLE_MS,
  ZOOM_BUTTON_DELTA,
  zoomScaleOf,
} from "./zoom";
import {
  glideStep,
  isTickLerpDone,
  pitchAfterDrag,
  PITCH_DEADZONE_PX,
  tickLerpAt,
  tickLerpNext,
  type Glide,
  type TickLerp,
  aheadScreenY,
  cameraClipOf,
  FOG_START,
  viewAheadPx,
} from "./camera-feel";

/**
 * A real slippy map, with no map library.
 *
 * The repo runs on react + react-dom and nothing else, and the offline story is
 * a hand-written service worker. Adding Leaflet or MapLibre would mean handing
 * both of those to a dependency, and a campus walk needs a small subset of what
 * either provides: pan, a few zoom steps, and markers that stay on their
 * features. That subset is the file below.
 *
 * Everything is positioned through `toWorld` (Web Mercator), the same projection
 * the tile server drew with, so a marker sits where the imagery says it sits at
 * every zoom.
 */

/**
 * Where the walker sits on screen, as a fraction of container height.
 *
 * Below centre, so the ground being walked INTO is ahead of them — the camera
 * every game in this genre uses.
 *
 * This is a SCREEN-SPACE shift applied after projection, NOT the pivot. Making
 * it the pivot is what broke rotation: the map centre, which is where the
 * walker is drawn, then sat above the pivot, so swinging the camera swept the
 * walker off the side of the screen instead of turning the world around them.
 * The plane pivots on the walker; the projected result then slides down.
 *
 * `toScreen` and the CSS transform BOTH read this, so the two cannot drift.
 */
const PLAYER_SCREEN_Y = 0.70;

/**
 * The raked camera's plane is drawn against an ANCHOR that only moves in
 * steps of this many plane pixels; the camera's real position inside the step
 * rides on the plane's CSS transform.
 *
 * Before this, every camera move — twenty a second under the stick —
 * reprojected every sector, path and building on the ground, rewrote about
 * 1,300 SVG `d` attributes, and made the browser re-rasterise the whole plane.
 * Now a move between anchors changes one transform; the geometry is rebuilt
 * once per 2,048 px of travel.
 */
const ANCHOR_GRID = 2048;

/** A camera further than this from its goal jumps instead of gliding across campus. */
const GLIDE_SNAP_DEGREE = 0.0012;
/** Close enough, in degrees (~1 mm), with speed to match, to stop the frame loop. */
const GLIDE_REST_DEGREE = 1e-8;

/**
 * True while the glide is committing a camera frame (inside its rAF, under
 * `flushSync`).
 *
 * Something that paints imperatively on commit — the skyline's canvas — can
 * paint at once when this is true: it is inside the frame, before the
 * browser paints it. Any OTHER commit (the app re-rendering on a GPS fix or a
 * camera swing, from a scheduler task between frames) should hand its paint
 * to the next animation frame instead. Painting a GPU canvas twice between
 * two frames trips Chrome's canvas rate limiter, which then blocks the main
 * thread until the GPU catches up: 160–200 ms stalls in the z19 trace (10-01).
 */
let camera_frame_depth = 0;
export function isCameraFrame(): boolean {
  return camera_frame_depth > 0;
}

export interface View extends LatLon {
  zoom: number;
}

export { LAYER_ORDER, nextLayer, SOURCE };
export type { Layer };

export interface Projection {
  /** lat/lon → pixel inside the map container. */
  project: (point: LatLon) => { x: number; y: number };
  /** Ground metres per screen pixel — turns a real radius into a real circle. */
  meter_per_pixel: number;
  /**
   * Ground metres per PLANE pixel — for geometry drawn inside the tilted plane.
   *
   * Not the same number as `meter_per_pixel` once the zoom is fractional: the
   * plane is CSS-scaled by the leftover fraction, so a plane pixel and a screen
   * pixel cover different amounts of ground everywhere except a whole zoom
   * level. Anything sized in `<svg>` under `children` wants this one.
   */
  plane_meter_per_pixel: number;
  width: number;
  height: number;
  zoom: number;
  /** 0 when flat. Billboarded children counter-rotate by this. */
  tilt_degree: number;
  /** Clockwise from north. Billboarded children counter-rotate by this too. */
  bearing_degree: number;
  /**
   * Where a plane point actually LANDS on screen once the 3D transform is
   * applied, plus the perspective scale it lands at.
   *
   * Children position themselves in plane coordinates and let the browser
   * transform them — but anything that has to REASON about screen position
   * (does this label fit, does it collide, is it off the edge) has to ask in
   * screen space. Doing that arithmetic in the child means duplicating the
   * perspective constants that live here, and they drift the first time the
   * pitch changes. So it lives here, next to the transform it inverts.
   */
  toScreen: (point: { x: number; y: number }) => { x: number; y: number; scale: number };
  /**
   * Where the camera is actually looking THIS frame.
   *
   * On the raked camera this trails `view` by a glide (see `camera-feel.ts`),
   * so something drawn at the camera centre — the walker, when the camera is
   * welded to them — should be drawn HERE, not at the fix, or it steps across
   * the glass while the ground slides smoothly under it.
   */
  centre: LatLon;
  /**
   * The wall-clock ms (epoch) this frame's camera was computed for, while the
   * glide is moving; undefined at rest.
   *
   * Anything else that moves on a clock of its own — the remote walkers —
   * must be drawn at THIS moment, not at whatever `Date.now()` says when React
   * gets round to rendering. On a busy phone that render lands 0–30 ms after
   * the camera's frame, a different amount every frame, and a walker beside
   * you zig-zagged by that much against the ground (`script/bench-hall.mjs`).
   */
  frame_ms?: number;
  /**
   * The real horizon: how far ahead the raked camera draws the world, in
   * metres (`viewAheadPx` × metres per screen pixel), and where that distance
   * and the start of its fog land on the glass. Infinity / null on the flat
   * camera, which has no horizon. See `camera-feel.ts` "how far the camera sees".
   */
  view_distance_m: number;
  horizon_y: number | null;
  fog_start_y: number | null;
  /** Inverse of `toScreen` then `project`: a click on the glass → lat/lon. */
  fromScreen: (x: number, y: number) => LatLon;
}

interface Props {
  view: View;
  onView: (view: View) => void;
  layer: Layer;
  /** Called on a user gesture, so "follow the walker" can switch itself off. */
  onGesture?: () => void;
  is_interactive?: boolean;
  /** Credit for anything an overlay draws on top of the tiles. ODbL data has to say so. */
  overlay_attribution?: string;
  /**
   * Camera pitch in degrees. 0 is the flat survey view; ~55 is the raked
   * "standing in it" view the owner asked for on 09-03.
   *
   * The whole ground plane — tiles AND every overlay child — is tilted by one
   * CSS 3D transform on a single wrapper, so markers stay welded to their
   * features for free: they are transformed by the same matrix as the imagery
   * under them. Anything that must stay upright (the player, a label) billboards
   * itself by counter-rotating, which is why `Projection` carries `tilt_degree`.
   */
  tilt_degree?: number;
  /**
   * Camera bearing in degrees, clockwise from north.
   *
   * Pokemon GO lets you swing the camera round the player, and a fixed-north
   * map makes a walk feel like reading a diagram of yourself. The whole ground
   * plane rotates about the player; `toScreen` applies the same rotation, and
   * the pan gesture un-rotates its delta so dragging still moves the map the
   * way your thumb went rather than the way north happens to be pointing.
   */
  bearing_degree?: number;
  onBearing?: (degree: number) => void;
  /**
   * Two fingers dragged up or down (or shift-drag vertically on a desktop)
   * ask for a new pitch. The map only reports it — the owner of `tilt_degree`
   * decides, so a view without this prop simply cannot be tilted.
   */
  onTilt?: (degree: number) => void;
  /**
   * CSS filter for the tiles only.
   *
   * The play view desaturates the basemap on purpose: OSM's standard style
   * draws every footway, kerb and building label, and the owner's note on
   * 09-03 was that the result is "a lot of lines". Muting the ground lets the
   * sector fills carry the map instead of competing with it. It is a filter and
   * not a different tile source so the ODbL credit and the offline cache stay
   * exactly as they are.
   */
  tile_filter?: string;
  /**
   * Draw no raster tiles at all.
   *
   * The play view renders its own vector ground from `campus-shape.json`, so
   * there is nothing to fetch and nothing to attribute to a tile host — the
   * geometry credit still applies and still renders. This is also what makes
   * that view work with no network at all, rather than only as well as the
   * tile cache happens to be warmed.
   */
  is_tile_hidden?: boolean;
  /** Flat ground colour behind everything when tiles are hidden. */
  ground?: string;
  /**
   * Lift the attribution by this many pixels.
   *
   * The play view runs the map full-bleed, under the bottom nav, which parked
   * the ODbL credit behind it. That credit is a licence condition, not chrome —
   * "less cluttered" was never permission to hide it — so the map is told where
   * the nav ends rather than the credit being dropped.
   */
  credit_offset?: number;
  /**
   * Closest zoom allowed when tiles are hidden. Defaults to `MAX_ZOOM`; the play
   * view raises it to a Pokémon GO camera, where one street fills the screen.
   */
  max_zoom?: number;
  /**
   * Furthest zoom allowed. Defaults to `MIN_ZOOM`, the survey view.
   *
   * The play view raises the floor. Zooming out until the whole campus is a
   * green postage stamp turns the walk back into the map screen it was supposed
   * to replace — you stop looking for the tree and start reading a diagram of
   * where the tree is. The genre this borrows from simply does not offer that
   * zoom, and neither does this one; the field view still does, one tap away.
   */
  min_zoom?: number;
  /**
   * Weld the camera to `view` — a drag rotates around it instead of panning
   * off it.
   *
   * With `view` driven by the walker's fix, this is the GO camera: you are
   * always in the middle of your own screen, and the only thing a thumb can
   * change is which way you are facing. It also removes a real failure on
   * stage, where a stray drag leaves the presenter looking at empty ground with
   * no obvious way back.
   */
  is_pan_locked?: boolean;
  /** Chrome the map draws in SCREEN space, above the tilted plane. */
  overlay?: (projection: Projection) => ReactNode;
  is_chrome_hidden?: boolean;
  children?: (projection: Projection) => ReactNode;
  /** Click / tap on empty ground. Not fired after a pan, or on a marked find. */
  onTap?: (point: LatLon) => void;
}

function tileRange(origin: number, span: number): number[] {
  const first = Math.floor(origin / TILE_SIZE);
  const last = Math.floor((origin + span) / TILE_SIZE);
  const row: number[] = [];
  for (let i = first; i <= last; i += 1) row.push(i);
  return row;
}

export default function TileMap({
  view,
  onView,
  layer,
  onGesture,
  is_interactive = true,
  overlay_attribution,
  tilt_degree = 0,
  bearing_degree = 0,
  onBearing,
  onTilt,
  tile_filter,
  is_tile_hidden = false,
  ground,
  credit_offset = 0,
  max_zoom = MAX_ZOOM,
  min_zoom = MIN_ZOOM,
  is_pan_locked = false,
  overlay,
  is_chrome_hidden = false,
  children,
  onTap,
}: Props) {
  const box_ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const drag = useRef<{ x: number; y: number; lat: number; lon: number; bearing: number; is_rotate: boolean } | null>(null);
  const pointer = useRef(new Map<number, { x: number; y: number }>());
  /** Finger spread and zoom at the moment the second finger landed. */
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const down_at = useRef<{ x: number; y: number } | null>(null);
  /** Set by `endDrag` when the gesture travelled; consumed by the click trap. */
  const was_dragged = useRef(false);
  const from_screen = useRef<(x: number, y: number) => LatLon>((x, y) => fromWorld({ x, y }, view.zoom));
  /** Where a two-finger (or shift-drag) gesture began: its midpoint and the pitch. */
  const tilt_drag = useRef<{ x: number; y: number; tilt: number } | null>(null);

  useLayoutEffect(() => {
    const node = box_ref.current;
    if (!node) return;
    const read = () => setSize({ width: node.clientWidth, height: node.clientHeight });
    read();
    const observer = new ResizeObserver(read);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const source = SOURCE[layer];
  /* Play hides tiles and draws its own ground, so it is not capped by a
     raster source's max zoom — that is what lets the camera sit closer than
     OSM's z19 ceiling. Field still respects the active basemap. */
  const zoom_cap = is_tile_hidden ? max_zoom : source.max_zoom;
  /* The floor may not cross the ceiling: a view that asked for a closer floor
     than its own cap would otherwise pin the camera at an unreachable zoom. */
  const zoom_floor = Math.min(min_zoom, zoom_cap);
  /**
   * Zoom is fractional now; the TILES are not.
   *
   * `zoom_exact` is what the camera is actually at. `zoom` is the integer level
   * the tile grid and every projection run on — so `project`, the sector paths,
   * the markers and the tile URLs all stay consistent with each other — and the
   * leftover fraction rides on `zoom_scale`, a CSS scale applied to the whole
   * ground plane. Between whole levels nothing is refetched and nothing is
   * reprojected: the tiles you already have are scaled, which is what makes the
   * zoom continuous instead of a staircase. See `zoom.ts`.
   */
  const zoom_exact = clampZoom(view.zoom, zoom_floor, zoom_cap);
  const zoom = tileZoomOf(zoom_exact);
  const zoom_scale = zoomScaleOf(zoom_exact);

  /**
   * The glide. On the raked (play) camera the rendered centre is not `view` —
   * it chases `view` on a frame loop with a critically damped spring, so a
   * walker who arrives in 50 ms stick steps or 1 s GPS steps is followed by a
   * camera that moves every frame. Only this component re-renders per frame;
   * the app above it renders at the rate positions actually arrive. The flat
   * field camera is untouched: it is dragged by hand, and a hand wants no lag.
   */
  const is_glide = tilt_degree > 0;
  const [glide, setGlide] = useState<LatLon & { at?: number }>(() => ({ lat: view.lat, lon: view.lon }));
  const glide_state = useRef<{ lat: Glide; lon: Glide }>({
    lat: { value: view.lat, velocity: 0 },
    lon: { value: view.lon, velocity: 0 },
  });
  const glide_frame = useRef<number | null>(null);
  /* The point the spring chases: slides between position updates rather than
     stepping to each — see "tick interpolation" in `camera-feel.ts`. */
  const glide_lerp = useRef<TickLerp>({
    from: { lat: view.lat, lon: view.lon },
    to: { lat: view.lat, lon: view.lon },
    at: -Infinity,
    span_ms: 0,
  });
  const centre: LatLon = is_glide ? { lat: glide.lat, lon: glide.lon } : view;

  const center_world = toWorld(centre, zoom);
  /* See `ANCHOR_GRID`. The flat camera anchors on itself, i.e. no shift. */
  const anchor_world = is_glide
    ? {
        x: Math.round(center_world.x / ANCHOR_GRID) * ANCHOR_GRID,
        y: Math.round(center_world.y / ANCHOR_GRID) * ANCHOR_GRID,
      }
    : center_world;
  const shift = { x: center_world.x - anchor_world.x, y: center_world.y - anchor_world.y };
  const origin = {
    x: anchor_world.x - size.width / 2,
    y: anchor_world.y - size.height / 2,
  };

  const project = useCallback(
    (point: LatLon) => {
      const world = toWorld(point, zoom);
      return { x: world.x - origin.x, y: world.y - origin.y };
    },
    [zoom, origin.x, origin.y],
  );

  /**
   * Set the camera to an exact zoom, keeping `anchor` under the same pixel.
   *
   * The anchor is a lat/lon, resolved by the caller BEFORE the gesture starts
   * moving the camera — resolving it per frame would chase the point it is
   * meant to be pinning.
   */
  const applyZoom = useCallback(
    (next_exact: number, anchor: { point: LatLon; x: number; y: number } | null) => {
      const clamped = clampZoom(next_exact, zoom_floor, zoom_cap);
      /* Zoom-about-the-cursor moves the centre, which a locked camera is not
         allowed to do — it would walk the map off the character one pinch at a
         time. Locked, the zoom is about the walker, full stop. */
      if (is_pan_locked || !anchor) {
        onView({ ...view, zoom: clamped });
        return;
      }
      /* Solve for the centre that puts `anchor.point` back on `anchor.x/y`, in
         the projection the NEXT frame will actually draw with: its integer tile
         level and its plane scale. Doing the arithmetic at the old scale is
         what makes an anchored zoom creep. */
      const next_tile = tileZoomOf(clamped);
      const next_scale = zoomScaleOf(clamped);
      const anchor_world = toWorld(anchor.point, next_tile);
      const centre_world = {
        x: anchor_world.x - (anchor.x - size.width / 2) / next_scale,
        y: anchor_world.y - (anchor.y - size.height / 2) / next_scale,
      };
      onView({ ...clampCenter(fromWorld(centre_world, next_tile)), zoom: clamped });
    },
    [zoom_cap, zoom_floor, is_pan_locked, size.width, size.height, view, onView],
  );

  /* Live gesture state. Refs, not state: these change every frame and none of
     them is rendered. */
  const zoom_goal = useRef(zoom_exact);
  const zoom_anchor = useRef<{ point: LatLon; x: number; y: number } | null>(null);
  const zoom_frame = useRef<number | null>(null);
  const zoom_idle = useRef<number | null>(null);
  const view_ref = useRef(view);
  view_ref.current = view;
  const apply_ref = useRef(applyZoom);
  apply_ref.current = applyZoom;

  const stopZoomLoop = useCallback(() => {
    if (zoom_frame.current !== null) cancelAnimationFrame(zoom_frame.current);
    zoom_frame.current = null;
    zoom_anchor.current = null;
  }, []);

  /**
   * The frame loop.
   *
   * Deliberately free of early returns. The bug this port exists to avoid —
   * tripi's `cee3a12`, where the cursor landing exactly on the container centre
   * hit an early `return` that skipped `requestAnimationFrame` and froze the
   * zoom mid-gesture — is a bug about a frame loop with a condition in it. This
   * one runs `easeZoom`, which is total, and either reschedules or finishes.
   */
  const runZoomLoop = useCallback(() => {
    if (zoom_frame.current !== null) return;
    const step = () => {
      const current = clampZoom(view_ref.current.zoom, zoom_floor, zoom_cap);
      const goal = zoom_goal.current;
      const next = easeZoom(current, goal);
      apply_ref.current(next, zoom_anchor.current);
      /* Two ways to be finished, and both are needed. Arrived — `easeZoom`
         returned the goal exactly. Or stuck — the value did not move, which is
         what happens when the goal is past a zoom bound and the clamp keeps
         handing back the same number. Without the second the loop would spin at
         60 fps against a wall. */
      if (isZoomSettled(next, goal) || next === current) {
        zoom_frame.current = null;
        zoom_anchor.current = null;
        return;
      }
      zoom_frame.current = requestAnimationFrame(step);
    };
    zoom_frame.current = requestAnimationFrame(step);
  }, [zoom_floor, zoom_cap]);

  /** Nudge the goal by `step` levels, anchored at a client point if given. */
  const zoomAt = useCallback(
    (step: number, client_x?: number, client_y?: number) => {
      const rect = box_ref.current?.getBoundingClientRect();
      const base =
        zoom_frame.current !== null
          ? zoom_goal.current
          : clampZoom(view_ref.current.zoom, zoom_floor, zoom_cap);
      zoom_goal.current = clampZoom(base + step, zoom_floor, zoom_cap);
      if (rect && client_x !== undefined && client_y !== undefined && !is_pan_locked) {
        const x = client_x - rect.left;
        const y = client_y - rect.top;
        /* Resolve the anchor once, at the zoom on screen right now. */
        zoom_anchor.current = { point: from_screen.current(x, y), x, y };
      } else {
        zoom_anchor.current = null;
      }
      runZoomLoop();
    },
    [zoom_floor, zoom_cap, is_pan_locked, runZoomLoop],
  );

  useEffect(() => stopZoomLoop, [stopZoomLoop]);

  /* The glide's frame loop. Started by a change of target, stopped when the
     camera has arrived — nothing runs while the walker stands still. It reads
     the target through `view_ref`, so a target that moves mid-glide is simply
     chased, not restarted. */
  useEffect(() => {
    if (!is_glide || glide_frame.current !== null) return;
    let last = performance.now();
    const step = (now: number) => {
      const raw = view_ref.current;
      if (glide_lerp.current.to.lat !== raw.lat || glide_lerp.current.to.lon !== raw.lon) {
        glide_lerp.current = tickLerpNext(glide_lerp.current, raw, now);
      }
      const target = tickLerpAt(glide_lerp.current, now);
      const dt = (now - last) / 1000;
      last = now;
      const g = glide_state.current;
      /* Judged on the RAW target: a teleport is not something to slide to. */
      const is_far =
        Math.abs(raw.lat - g.lat.value) > GLIDE_SNAP_DEGREE ||
        Math.abs(raw.lon - g.lon.value) > GLIDE_SNAP_DEGREE;
      /* A hand panning the map gets the map under the hand, not behind it. */
      const is_panning = drag.current !== null && !drag.current.is_rotate;
      if (is_far || is_panning) {
        glide_lerp.current = { from: { lat: raw.lat, lon: raw.lon }, to: { lat: raw.lat, lon: raw.lon }, at: now, span_ms: 0 };
        g.lat = { value: raw.lat, velocity: 0 };
        g.lon = { value: raw.lon, velocity: 0 };
      } else {
        g.lat = glideStep(g.lat, target.lat, dt);
        g.lon = glideStep(g.lon, target.lon, dt);
      }
      const is_rest =
        isTickLerpDone(glide_lerp.current, now) &&
        Math.abs(target.lat - g.lat.value) < GLIDE_REST_DEGREE &&
        Math.abs(target.lon - g.lon.value) < GLIDE_REST_DEGREE &&
        Math.abs(g.lat.velocity) < GLIDE_REST_DEGREE * 10 &&
        Math.abs(g.lon.velocity) < GLIDE_REST_DEGREE * 10;
      if (is_rest) {
        g.lat = { value: target.lat, velocity: 0 };
        g.lon = { value: target.lon, velocity: 0 };
      }
      /* Committed INSIDE this frame. A plain `setGlide` from a rAF callback is
         rendered by React's scheduler in a later task — after the browser may
         already have painted this frame — so on a busy phone a step computed
         for a 16 ms frame could land on screen a frame late, or two steps in
         one frame. The lead's 10-01 hall bench measured exactly that: camera
         steps of 3.2 / 7.2 / 10.4 / 11.9 px on 15 / 30 / 46 ms frames while
         walking at a steady pace, uncorrelated with the interval — Gelo's
         "stuttering" (09-30 `0:29`). Flushed here, the step this frame
         computed from its own `dt` is the step this frame shows. */
      /* `at` rides with the position it belongs to — see `Projection.frame_ms`. */
      camera_frame_depth += 1;
      try {
        flushSync(() =>
          setGlide({ lat: g.lat.value, lon: g.lon.value, at: is_rest ? undefined : performance.timeOrigin + now }),
        );
      } finally {
        camera_frame_depth -= 1;
      }
      if (is_rest) {
        glide_frame.current = null;
        return;
      }
      glide_frame.current = requestAnimationFrame(step);
    };
    glide_frame.current = requestAnimationFrame(step);
  }, [is_glide, view.lat, view.lon]);

  useEffect(
    () => () => {
      if (glide_frame.current !== null) cancelAnimationFrame(glide_frame.current);
      glide_frame.current = null;
    },
    [],
  );

  /**
   * The click trap.
   *
   * Capture phase on the container, so it runs BEFORE any marker, sector path
   * or overlay child gets its click. If the gesture that produced this click
   * was a drag, the click is swallowed here and nothing downstream ever hears
   * about it.
   */
  useEffect(() => {
    const node = box_ref.current;
    if (!node) return;
    const trap = (event: MouseEvent) => {
      if (!was_dragged.current) return;
      was_dragged.current = false;
      event.stopPropagation();
      event.preventDefault();
    };
    node.addEventListener("click", trap, true);
    return () => node.removeEventListener("click", trap, true);
  }, []);

  useEffect(() => {
    const node = box_ref.current;
    if (!node || !is_interactive) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!is_pan_locked) onGesture?.();
      /* A fraction of a level per tick, not a whole one. The goal accumulates
         across a trackpad flick and the frame loop chases it. */
      zoomAt(wheelZoomStep(event.deltaY), event.clientX, event.clientY);
      if (zoom_idle.current !== null) window.clearTimeout(zoom_idle.current);
      zoom_idle.current = window.setTimeout(() => {
        zoom_anchor.current = null;
      }, WHEEL_IDLE_MS);
    };
    /* Non-passive, or the browser refuses preventDefault and the page scrolls. */
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [zoomAt, is_interactive, is_pan_locked, onGesture]);

  /**
   * One pointer pans, two pointers rotate (and so does shift-drag or a
   * secondary button on a desktop, which has no second finger).
   *
   * Panning has to un-rotate its own delta: with the camera swung 90 degrees,
   * dragging right should still slide the map right on screen, not north. The
   * `/ cos(tilt)` is the same first-order rake correction as before, exact on
   * the centre line and drifting toward the horizon, which is invisible at a
   * walking pan and not worth a full inverse projection.
   */
  const onPointerDown = (event: React.PointerEvent) => {
    if (!is_interactive) return;
    /* Capture is best-effort and must not be able to abort the handler.
     *
     * `setPointerCapture` throws `NotFoundError` for a pointer the browser does
     * not consider active — a pointer already lifted, or a synthetic event. It
     * used to run BEFORE the bookkeeping below, so one throw meant this pointer
     * was never recorded: no drag start, and with a second finger, no pinch.
     * The gesture state is what matters; the capture is an optimisation. */
    try {
      (event.target as Element).setPointerCapture?.(event.pointerId);
    } catch {
      /* not an active pointer — carry on without capture */
    }
    pointer.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    down_at.current = { x: event.clientX, y: event.clientY };
    const rotating =
      is_pan_locked || pointer.current.size > 1 || event.shiftKey || event.button === 2;
    drag.current = {
      x: event.clientX,
      y: event.clientY,
      lat: view.lat,
      lon: view.lon,
      bearing: bearing_degree,
      is_rotate: rotating && Boolean(onBearing),
    };
    /* Second finger down: open a pinch alongside the rotate.
     *
     * Two fingers used to mean rotate and nothing else, so on a phone — where
     * there is no wheel at all — the map could not be zoomed by the one gesture
     * every person alive tries first. They now run together, the way they do in
     * a real map app: the distance between the fingers drives the zoom, their
     * horizontal travel drives the bearing. */
    /* Pitch: from the midpoint of two fingers, or a desktop's shift /
       right-button drag, which has no second finger to offer. */
    if (pointer.current.size === 2) {
      const [a, b] = [...pointer.current.values()];
      tilt_drag.current = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, tilt: tilt_degree };
    } else if (pointer.current.size === 1 && (event.shiftKey || event.button === 2)) {
      tilt_drag.current = { x: event.clientX, y: event.clientY, tilt: tilt_degree };
    } else {
      tilt_drag.current = null;
    }
    if (pointer.current.size === 2) {
      const [a, b] = [...pointer.current.values()];
      pinch.current = {
        distance: Math.hypot(a.x - b.x, a.y - b.y),
        zoom: clampZoom(view.zoom, zoom_floor, zoom_cap),
      };
    }
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const from = drag.current;
    if (!from) return;
    if (pointer.current.has(event.pointerId)) {
      pointer.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    }
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    if (Math.abs(dx) + Math.abs(dy) < 3) return;
    /* A locked camera cannot be dragged off its subject, so the gesture that
       normally means "stop following me" no longer means anything — reporting
       it would switch following off while the camera stayed put, and the
       Recentre control would then appear with nothing to recentre. */
    if (!is_pan_locked) onGesture?.();

    /* Pinch runs BEFORE the rotate branch and does not consume the gesture —
       both read the same two fingers. */
    const start_pinch = pinch.current;
    if (start_pinch && pointer.current.size === 2) {
      const [a, b] = [...pointer.current.values()];
      const now = Math.hypot(a.x - b.x, a.y - b.y);
      const want = start_pinch.zoom + pinchZoomDelta(start_pinch.distance, now);
      const rect = box_ref.current?.getBoundingClientRect();
      /* Anchored on the midpoint between the fingers, so the ground you are
         pinching stays between them. */
      if (rect && !is_pan_locked) {
        const mx = (a.x + b.x) / 2 - rect.left;
        const my = (a.y + b.y) / 2 - rect.top;
        zoom_anchor.current = { point: from_screen.current(mx, my), x: mx, y: my };
      } else {
        zoom_anchor.current = null;
      }
      zoom_goal.current = clampZoom(want, zoom_floor, zoom_cap);
      runZoomLoop();
    }

    /* Vertical travel tilts. Read alongside the pinch and the rotate, not
       instead of them: a two-finger drag straight up is neither a pinch nor a
       swing, and a pinch that wobbles stays inside `PITCH_DEADZONE_PX`. */
    const pair = [...pointer.current.values()];
    const mid =
      pair.length === 2
        ? { x: (pair[0].x + pair[1].x) / 2, y: (pair[0].y + pair[1].y) / 2 }
        : { x: event.clientX, y: event.clientY };
    /* Only once the travel clears the deadzone: reporting "no change" on
       every pinch frame pinned the pitch where the pinch began, so a zoom
       stopped easing the tilt the way `pitchForZoom` says it should. */
    if (onTilt && tilt_drag.current && Math.abs(mid.y - tilt_drag.current.y) > PITCH_DEADZONE_PX) {
      onTilt(pitchAfterDrag(tilt_drag.current.tilt, mid.y - tilt_drag.current.y));
    }

    if (from.is_rotate) {
      /* Horizontal travel swings the camera; a quarter of the screen is a
         quarter turn, which is about the sensitivity the genre uses.
         With two fingers the travel is the MIDPOINT's. It used to be whichever
         finger happened to fire this event, measured from where the OTHER
         finger landed — so pointer events alternating between two fingers
         swung the camera back and forth by their spread on every frame. */
      const travel = tilt_drag.current && pair.length === 2 ? mid.x - tilt_drag.current.x : dx;
      onBearing?.(from.bearing + (travel / Math.max(1, size.width)) * 360 * 0.75);
      return;
    }

    const rake = tilt_degree ? Math.cos((tilt_degree * Math.PI) / 180) : 1;
    const sx = dx;
    const sy = dy / rake;
    const world_dx = sx * Math.cos(bear) + sy * Math.sin(bear);
    const world_dy = -sx * Math.sin(bear) + sy * Math.cos(bear);
    const start = toWorld({ lat: from.lat, lon: from.lon }, zoom);
    onView({
      ...clampCenter(fromWorld({ x: start.x - world_dx, y: start.y - world_dy }, zoom)),
      zoom,
    });
  };

  const endDrag = (event: React.PointerEvent) => {
    try {
      (event.target as Element).releasePointerCapture?.(event.pointerId);
    } catch {
      /* never captured, or already released — releasing is not the point */
    }
    pointer.current.delete(event.pointerId);
    /* One finger left is no longer a pinch — and must not become one again from
       a stale spread when the second comes back down. */
    if (pointer.current.size < 2) pinch.current = null;
    if (pointer.current.size < 2) tilt_drag.current = null;
    if (pointer.current.size === 0) drag.current = null;
    const start = down_at.current;
    down_at.current = null;
    const travel = start ? Math.hypot(event.clientX - start.x, event.clientY - start.y) : 0;
    /* A drag is not a tap — for THIS handler, and also for every child.
     *
     * `onTap` has always guarded itself on travel. Children never did: a
     * browser still fires `click` on whatever element the gesture happened to
     * end over, so dragging the camera across the map ended by opening the
     * sector card you released on. The suppression is set here and consumed by
     * the capture-phase listener below, which is the only place that can stop
     * a child's click before the child sees it. */
    was_dragged.current = travel >= 8;
    if (!onTap || !start || !box_ref.current) return;
    if (travel >= 8) return;
    const mark = event.target instanceof Element ? event.target.closest("[data-play-marker]") : null;
    if (mark) return;
    const rect = box_ref.current.getBoundingClientRect();
    onTap(from_screen.current(event.clientX - rect.left, event.clientY - rect.top));
  };

  /* A tilted plane shows ground the flat viewport never would, and rotation
     swings more in from the sides, so the overscan has to cover the diagonal
     rather than just the top. Without it the map ends in a hard empty band. */
  /* Scaling the plane DOWN (zoom_exact below its tile level) shrinks the tiles,
     so the same viewport needs more of them — without this the map ends in a
     hard empty band on the way out of a zoom. `1/zoom_scale` is at most √2. */
  const spread = 1 / zoom_scale;
  const pad_x = tilt_degree ? size.width * 0.9 * spread : (size.width * (spread - 1)) / 2 + 2;
  const pad_top = tilt_degree ? size.height * 1.35 * spread : (size.height * (spread - 1)) / 2 + 2;
  const pad_bottom = tilt_degree ? size.height * 0.9 * spread : (size.height * (spread - 1)) / 2 + 2;

  const tile_x = size.width ? tileRange(origin.x + shift.x - pad_x, size.width + pad_x * 2) : [];
  const tile_y = size.height ? tileRange(origin.y + shift.y - pad_top, size.height + pad_top + pad_bottom) : [];
  const count = 2 ** zoom;

  /* Must stay in lockstep with `plane_style` below — same pivot, same depth,
     same post-projection shift. The pivot is the map centre, which is where the
     walker is drawn, so rotation turns the world around them. */
  const origin_x = size.width * 0.5;
  const origin_y = size.height * 0.5;
  const shift_y = size.height * (PLAYER_SCREEN_Y - 0.5);
  const depth = Math.max(600, size.height * 1.6);
  const rad = (tilt_degree * Math.PI) / 180;
  const bear = (bearing_degree * Math.PI) / 180;
  /* Once per render, not once per point: `toScreen` runs for every tree,
     building corner and find on the glass every camera frame (it was the
     single hottest function in the z19 profile, 10-01), and four of its six
     trig calls only ever depend on the camera. */
  const cos_bear = Math.cos(bear);
  const sin_bear = Math.sin(bear);
  const cos_rad = Math.cos(rad);
  const sin_rad = Math.sin(rad);

  const toScreen = useCallback(
    (point: { x: number; y: number }) => {
      if (!tilt_degree && !bearing_degree) {
        return {
          x: origin_x + (point.x - shift.x - origin_x) * zoom_scale,
          y: origin_y + (point.y - shift.y - origin_y) * zoom_scale,
          scale: 1,
        };
      }
      /* The plane carries `scale(zoom_scale)` in the same transform as the
         rake, so an offset measured in plane pixels lands `zoom_scale` times
         further out on the glass. Anything reasoning in SCREEN space — a label
         fit test, the skyline, the walker — has to see that or it drifts off
         the tiles between whole levels. */
      /* `shift` first: the plane is translated by it before anything else. */
      const dx0 = (point.x - shift.x - origin_x) * zoom_scale;
      const dy0 = (point.y - shift.y - origin_y) * zoom_scale;
      /* Same order as the CSS: rotate the ground about the player first, then
         rake the camera over it, then divide by depth. */
      const dx = dx0 * cos_bear - dy0 * sin_bear;
      const dy = dx0 * sin_bear + dy0 * cos_bear;
      const z = dy * sin_rad;
      const scale = depth / (depth - z);
      return { x: origin_x + dx * scale, y: origin_y + dy * cos_rad * scale + shift_y, scale };
    },
    [tilt_degree, bearing_degree, origin_x, origin_y, depth, cos_bear, sin_bear, cos_rad, sin_rad, shift_y, zoom_scale, shift.x, shift.y],
  );

  const fromScreen = useCallback(
    (sx: number, sy: number): LatLon => {
      if (!tilt_degree && !bearing_degree) {
        return fromWorld(
          {
            x: origin.x + shift.x + origin_x + (sx - origin_x) / zoom_scale,
            y: origin.y + shift.y + origin_y + (sy - origin_y) / zoom_scale,
          },
          zoom,
        );
      }
      const sy1 = sy - shift_y;
      const scale = 1 + ((sy1 - origin_y) * Math.tan(rad)) / depth;
      if (!Number.isFinite(scale) || scale <= 0.05) {
        return fromWorld({ x: origin.x + shift.x + sx, y: origin.y + shift.y + sy }, zoom);
      }
      const dx = (sx - origin_x) / scale / zoom_scale;
      const dy = (sy1 - origin_y) / (Math.cos(rad) * scale) / zoom_scale;
      const dx0 = dx * Math.cos(bear) + dy * Math.sin(bear);
      const dy0 = -dx * Math.sin(bear) + dy * Math.cos(bear);
      return fromWorld({ x: origin.x + shift.x + origin_x + dx0, y: origin.y + shift.y + origin_y + dy0 }, zoom);
    },
    [tilt_degree, bearing_degree, origin.x, origin.y, origin_x, origin_y, depth, rad, bear, shift_y, zoom, zoom_scale, shift.x, shift.y],
  );
  from_screen.current = fromScreen;

  /* The real horizon and the clip box it bounds — `camera-feel.ts`. */
  const camera_geometry = { width: size.width, height: size.height, depth, tilt_degree, pivot_y: origin_y, shift_y };
  const view_ahead_px = viewAheadPx(size.height);
  const clip = tilt_degree ? cameraClipOf(camera_geometry, view_ahead_px) : null;
  const screen_mpp = meterPerPixel(view.lat, zoom) / zoom_scale;
  const view_distance_m = tilt_degree ? view_ahead_px * screen_mpp : Infinity;
  const horizon_y = tilt_degree ? aheadScreenY(camera_geometry, view_ahead_px) : null;
  const fog_start_y = tilt_degree ? aheadScreenY(camera_geometry, view_ahead_px * FOG_START) : null;

  const projection: Projection = {
    project,
    /* Ground metres per SCREEN pixel, so it has to divide by the plane scale:
       between whole levels the tiles are stretched and a pixel covers less
       ground than its tile level says. The skyline's building heights and every
       real-radius circle read this. */
    meter_per_pixel: meterPerPixel(view.lat, zoom) / zoom_scale,
    plane_meter_per_pixel: meterPerPixel(view.lat, zoom),
    width: size.width,
    height: size.height,
    zoom: zoom_exact,
    tilt_degree,
    bearing_degree,
    toScreen,
    fromScreen,
    centre,
    frame_ms: is_glide ? glide.at : undefined,
    view_distance_m,
    horizon_y,
    fog_start_y,
  };

  /**
   * The plane's children, rebuilt only when the plane's own geometry changes.
   *
   * On the gliding camera `project` is anchored (see `ANCHOR_GRID`), so a
   * glide frame does not change it and the plane is not re-rendered at all —
   * only its transform moves. The children still get the full projection, but
   * on this camera they must not read `toScreen`/`fromScreen`/`centre`, which
   * go stale inside the memo; anything screen-space belongs in `overlay`,
   * which is rendered every frame. The flat camera keys on `toScreen` too, so
   * nothing about it changes.
   */
  const plane_screen_key = is_glide ? null : toScreen;
  const plane_node = useMemo(
    () => (size.width > 0 ? children?.(projection) : null),
    // Deliberately partial — see above. `projection` is rebuilt every render.
    [children, project, size.width, size.height, zoom_exact, tilt_degree, bearing_degree, plane_screen_key],
  );

  /**
   * The raked camera is two elements with a clip between them.
   *
   * It used to be ONE element carrying the whole transform — tilt, rotation,
   * zoom, shift — over the whole campus's ground: at z22 a layer >30,000 px
   * across that reached behind the camera. Chrome cannot tell which part of a
   * perspective layer crossing the eye is visible; on a real GPU it
   * rasterised past its budget and dropped tiles, and the ground broke into
   * floating fragments when zoomed in (Gelo, 10-01; headless software raster
   * never showed it).
   *
   * Now `camera` carries translate · perspective · tilt; inside it a box in the
   * CAMERA's frame clips the ground to the view distance ahead and to short of
   * the eye behind (`cameraClipOf`); inside that, `ground` carries rotation ·
   * zoom · shift. The two compose to exactly the old transform (same pivot),
   * so `toScreen` is unchanged — but the rasterised layer is now finite and
   * wholly in front of the camera, and turning rotates the ground under a
   * fixed clip rather than growing it.
   */
  const camera_style: React.CSSProperties = tilt_degree
    ? {
        position: "absolute",
        inset: 0,
        transformOrigin: "50% 50%",
        transform: `translateY(${shift_y}px) perspective(${depth}px) rotateX(${tilt_degree}deg)`,
        willChange: "transform",
      }
    : {
        position: "absolute",
        inset: 0,
        /* Flat camera still needs the fractional part, and the origin must
           match `toScreen`'s (the container centre) or the two disagree. */
        transform: zoom_scale === 1 ? undefined : `scale(${zoom_scale})`,
        transformOrigin: "50% 50%",
        willChange: zoom_scale === 1 ? undefined : "transform",
      };
  const clip_box = clip
    ? {
        left: Math.round(origin_x - clip.half_width),
        top: Math.round(origin_y - clip.ahead),
        width: Math.round(clip.half_width * 2),
        height: Math.round(clip.ahead + clip.behind),
      }
    : null;
  const ground_style: React.CSSProperties | null = clip_box
    ? {
        position: "absolute",
        left: -clip_box.left,
        top: -clip_box.top,
        width: size.width,
        height: size.height,
        transformOrigin: "50% 50%",
        transform: `rotateZ(${bearing_degree}deg) scale(${zoom_scale}) translate3d(${(-shift.x).toFixed(2)}px, ${(-shift.y).toFixed(2)}px, 0)`,
        willChange: "transform",
      }
    : null;

  const ground_node = (
    <>
      {!is_tile_hidden && tile_y.map((ty) =>
        tile_x.map((tx) => {
          const wrapped_x = ((tx % count) + count) % count;
          if (ty < 0 || ty >= count) return null;
          return (
            <img
              key={`${zoom}/${tx}/${ty}`}
              src={source.url(zoom, wrapped_x, ty)}
              alt=""
              /* CORS, not no-cors: an opaque reply hides a 502, and the worker
                 then caches the failure as if it were a tile. */
              crossOrigin="anonymous"
              draggable={false}
              width={TILE_SIZE}
              height={TILE_SIZE}
              style={{
                position: "absolute",
                left: Math.round(tx * TILE_SIZE - origin.x),
                top: Math.round(ty * TILE_SIZE - origin.y),
                width: TILE_SIZE,
                height: TILE_SIZE,
                userSelect: "none",
                pointerEvents: "none",
                filter: tile_filter,
              }}
            />
          );
        }),
      )}

      {plane_node}
    </>
  );

  return (
    <div
      ref={box_ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      /* A right-button drag tilts, so it must not open the browser menu. */
      onContextMenu={onTilt ? (event) => event.preventDefault() : undefined}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: ground ?? "#dfe3d8",
        touchAction: is_interactive ? "none" : undefined,
        cursor: is_interactive ? (drag.current ? "grabbing" : "grab") : "default",
      }}
    >
      <div style={camera_style}>
      {clip_box && ground_style ? (
        <div data-camera-clip style={{ position: "absolute", ...clip_box, overflow: "hidden" }}>
          <div style={ground_style}>{ground_node}</div>
        </div>
      ) : (
        ground_node
      )}
      </div>

      {size.width > 0 && overlay?.(projection)}

      {is_interactive && !is_chrome_hidden && (
        <div className="absolute flex flex-col" style={{ right: 10, top: "50%", transform: "translateY(-50%)", zIndex: 22 }}>
          {[
            { label: "Zoom in", sign: 1, glyph: "+" },
            { label: "Zoom out", sign: -1, glyph: "−" },
          ].map(({ label, sign, glyph }) => (
            <button
              key={label}
              aria-label={label}
              onClick={() => {
                onGesture?.();
                zoomAt(sign * ZOOM_BUTTON_DELTA);
              }}
              style={{
                width: 34,
                height: 34,
                background: "#F9F9F9",
                border: "1.5px solid #E4E7E8",
                borderRadius: sign === 1 ? "10px 10px 0 0" : "0 0 10px 10px",
                borderBottomWidth: sign === 1 ? 0 : 1.5,
                fontSize: 18,
                fontWeight: 800,
                lineHeight: 1,
                boxShadow: "var(--shadow-card)",
              }}
            >
              {glyph}
            </button>
          ))}
        </div>
      )}

      <Credit
        text={
          is_tile_hidden
            ? overlay_attribution ?? source.attribution
            : overlay_attribution
              ? `${source.attribution} · ${overlay_attribution}`
              : source.attribution
        }
        offset={credit_offset}
        is_dim={is_chrome_hidden}
      />
    </div>
  );
}

/**
 * The ODbL credit, collapsed to an "i" until somebody asks.
 *
 * It cannot be deleted. OpenStreetMap data is ODbL and attribution is a licence
 * condition, not chrome — every sector boundary, every path and every building
 * footprint on this screen is OSM geometry.
 *
 * It CAN be collapsed, and this is not a loophole: the OSMF attribution
 * guidelines explicitly allow the credit to sit behind a clickable icon where
 * screen space is limited, which is how Apple, Google and Mapbox all ship it on
 * a phone. What the guidelines do not allow is for it to be absent or
 * unreachable, so the rules this follows are:
 *
 *   - the "i" is always visible, never conditional, never behind a menu;
 *   - one tap opens the full text, in full contrast, with the OSM copyright
 *     page linked;
 *   - it is a real control with a real label, so a screen reader announces it.
 *
 * Two full lines of grey type across the bottom of a walking map was the thing
 * being solved. The licence was never the thing to solve.
 */
/* Memoised: the map re-renders every camera frame, the credit never moves. */
const Credit = memo(function Credit({ text, offset, is_dim }: { text: string; offset: number; is_dim: boolean }) {
  const [is_open, setOpen] = useState(false);

  if (!is_open) {
    return (
      <button
        type="button"
        aria-label="Map data credits"
        title={text}
        onClick={() => setOpen(true)}
        /* A 44 px hit area around a small disc: the disc stays quiet, the
           thumb still lands. Parked in the corner, clear of the pet. */
        style={{
          position: "absolute",
          right: 0,
          bottom: offset - 4,
          zIndex: 21,
          width: 44,
          height: 44,
          display: "grid",
          placeItems: "center",
          cursor: "pointer",
          opacity: is_dim ? 0.72 : 1,
          padding: 0,
          background: "transparent",
          border: "none",
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 24,
            height: 24,
            borderRadius: 999,
            border: "1px solid rgba(31,32,34,0.16)",
            background: "rgba(249,249,249,0.86)",
            color: "rgba(31,32,34,0.68)",
            fontSize: 12,
            fontWeight: 800,
            fontStyle: "italic",
            fontFamily: "Georgia, serif",
            lineHeight: 1,
            display: "grid",
            placeItems: "center",
          }}
        >
          i
        </span>
      </button>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        right: 8,
        left: 8,
        bottom: offset + 6,
        zIndex: 21,
        background: "rgba(249,249,249,0.97)",
        border: "1px solid rgba(31,32,34,0.14)",
        borderRadius: 10,
        padding: "8px 10px",
        fontSize: 10.5,
        lineHeight: 1.45,
        color: "rgba(31,32,34,0.82)",
        boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {text}
          {" · "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
            style={{ color: "#2d6a2f", fontWeight: 700, textDecoration: "underline" }}
          >
            openstreetmap.org/copyright
          </a>
        </div>
        <button
          type="button"
          aria-label="Hide map data credits"
          onClick={() => setOpen(false)}
          style={{
            border: "none",
            background: "transparent",
            color: "rgba(31,32,34,0.5)",
            fontSize: 18,
            lineHeight: 1,
            cursor: "pointer",
            width: 44,
            height: 44,
            margin: "-12px -10px -12px 0",
            padding: 0,
            flexShrink: 0,
          }}
        >
          ×
        </button>
      </div>
    </div>
  );
});

/**
 * Warm every tile over the campus so the walk survives a dead hall.
 *
 * The service worker caches tiles it sees, which means offline only covers
 * wherever you happened to pan. On stage that is a coin flip, so this walks the
 * campus box at the zooms the app actually uses and pulls each tile once —
 * the worker stores them on the way past.
 *
 * Fetched with CORS, not `no-cors`: an opaque reply hides a failed status, and
 * the worker would then bank the failure as a tile. Every host here sends
 * `Access-Control-Allow-Origin: *`.
 */
export async function prefetchCampus(
  layer: Layer,
  zoom_list: number[] = [17, 18, 19],
  onProgress?: (done: number, total: number) => void,
): Promise<{ done: number; total: number }> {
  const source = SOURCE[layer];
  const job: string[] = [];
  for (const zoom of zoom_list) {
    if (zoom > source.max_zoom) continue;
    const nw = toWorld({ lat: CAMPUS_BOX.north, lon: CAMPUS_BOX.west }, zoom);
    const se = toWorld({ lat: CAMPUS_BOX.south, lon: CAMPUS_BOX.east }, zoom);
    for (let x = Math.floor(nw.x / TILE_SIZE); x <= Math.floor(se.x / TILE_SIZE); x += 1) {
      for (let y = Math.floor(nw.y / TILE_SIZE); y <= Math.floor(se.y / TILE_SIZE); y += 1) {
        job.push(source.url(zoom, x, y));
      }
    }
  }

  let done = 0;
  const LANE = 6;
  const queue = [...job];
  const worker = async () => {
    for (let url = queue.pop(); url; url = queue.pop()) {
      try {
        await fetch(url, { mode: "cors", cache: "default" });
      } catch {
        /* one missing tile is not a failed download */
      }
      done += 1;
      onProgress?.(done, job.length);
    }
  };
  await Promise.all(Array.from({ length: LANE }, worker));
  return { done, total: job.length };
}
