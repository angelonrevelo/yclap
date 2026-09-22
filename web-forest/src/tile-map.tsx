import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
  const down_at = useRef<{ x: number; y: number } | null>(null);
  const from_screen = useRef<(x: number, y: number) => LatLon>((x, y) => fromWorld({ x, y }, view.zoom));

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
  const zoom = Math.round(Math.max(zoom_floor, Math.min(zoom_cap, view.zoom)));
  const center_world = toWorld(view, zoom);
  const origin = {
    x: center_world.x - size.width / 2,
    y: center_world.y - size.height / 2,
  };

  const project = useCallback(
    (point: LatLon) => {
      const world = toWorld(point, zoom);
      return { x: world.x - origin.x, y: world.y - origin.y };
    },
    [zoom, origin.x, origin.y],
  );

  /* Zoom about the cursor, so the feature under the pointer stays put. */
  const zoomAt = useCallback(
    (step: number, client_x?: number, client_y?: number) => {
      const next_zoom = Math.max(zoom_floor, Math.min(zoom_cap, zoom + step));
      if (next_zoom === zoom) return;
      const rect = box_ref.current?.getBoundingClientRect();
      /* Zoom-about-the-cursor moves the centre, which a locked camera is not
         allowed to do — it would walk the map off the character one pinch at a
         time. Locked, the zoom is about the walker, full stop. */
      if (is_pan_locked || !rect || client_x === undefined || client_y === undefined) {
        onView({ ...view, zoom: next_zoom });
        return;
      }
      const anchor = fromWorld(
        { x: origin.x + (client_x - rect.left), y: origin.y + (client_y - rect.top) },
        zoom,
      );
      const anchor_world = toWorld(anchor, next_zoom);
      const next_center = fromWorld(
        {
          x: anchor_world.x - (client_x - rect.left) + size.width / 2,
          y: anchor_world.y - (client_y - rect.top) + size.height / 2,
        },
        next_zoom,
      );
      onView({ ...clampCenter(next_center), zoom: next_zoom });
    },
    [zoom, zoom_cap, zoom_floor, is_pan_locked, origin.x, origin.y, size.width, size.height, view, onView],
  );

  useEffect(() => {
    const node = box_ref.current;
    if (!node || !is_interactive) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (!is_pan_locked) onGesture?.();
      zoomAt(event.deltaY < 0 ? 1 : -1, event.clientX, event.clientY);
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
    (event.target as Element).setPointerCapture?.(event.pointerId);
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

    if (from.is_rotate) {
      /* Horizontal travel swings the camera; a quarter of the screen is a
         quarter turn, which is about the sensitivity the genre uses. */
      onBearing?.(from.bearing + (dx / Math.max(1, size.width)) * 360 * 0.75);
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
    (event.target as Element).releasePointerCapture?.(event.pointerId);
    pointer.current.delete(event.pointerId);
    if (pointer.current.size === 0) drag.current = null;
    const start = down_at.current;
    down_at.current = null;
    if (!onTap || !start || !box_ref.current) return;
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) >= 8) return;
    const mark = event.target instanceof Element ? event.target.closest("[data-play-marker]") : null;
    if (mark) return;
    const rect = box_ref.current.getBoundingClientRect();
    onTap(from_screen.current(event.clientX - rect.left, event.clientY - rect.top));
  };

  /* A tilted plane shows ground the flat viewport never would, and rotation
     swings more in from the sides, so the overscan has to cover the diagonal
     rather than just the top. Without it the map ends in a hard empty band. */
  const pad_x = tilt_degree ? size.width * 0.9 : 0;
  const pad_top = tilt_degree ? size.height * 1.35 : 0;
  const pad_bottom = tilt_degree ? size.height * 0.9 : 0;

  const tile_x = size.width ? tileRange(origin.x - pad_x, size.width + pad_x * 2) : [];
  const tile_y = size.height ? tileRange(origin.y - pad_top, size.height + pad_top + pad_bottom) : [];
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

  const toScreen = useCallback(
    (point: { x: number; y: number }) => {
      if (!tilt_degree && !bearing_degree) return { x: point.x, y: point.y, scale: 1 };
      const dx0 = point.x - origin_x;
      const dy0 = point.y - origin_y;
      /* Same order as the CSS: rotate the ground about the player first, then
         rake the camera over it, then divide by depth. */
      const dx = dx0 * Math.cos(bear) - dy0 * Math.sin(bear);
      const dy = dx0 * Math.sin(bear) + dy0 * Math.cos(bear);
      const z = dy * Math.sin(rad);
      const scale = depth / (depth - z);
      return { x: origin_x + dx * scale, y: origin_y + dy * Math.cos(rad) * scale + shift_y, scale };
    },
    [tilt_degree, bearing_degree, origin_x, origin_y, depth, rad, bear, shift_y],
  );

  const fromScreen = useCallback(
    (sx: number, sy: number): LatLon => {
      if (!tilt_degree && !bearing_degree) {
        return fromWorld({ x: origin.x + sx, y: origin.y + sy }, zoom);
      }
      const sy1 = sy - shift_y;
      const scale = 1 + ((sy1 - origin_y) * Math.tan(rad)) / depth;
      if (!Number.isFinite(scale) || scale <= 0.05) {
        return fromWorld({ x: origin.x + sx, y: origin.y + sy }, zoom);
      }
      const dx = (sx - origin_x) / scale;
      const dy = (sy1 - origin_y) / (Math.cos(rad) * scale);
      const dx0 = dx * Math.cos(bear) + dy * Math.sin(bear);
      const dy0 = -dx * Math.sin(bear) + dy * Math.cos(bear);
      return fromWorld({ x: origin.x + origin_x + dx0, y: origin.y + origin_y + dy0 }, zoom);
    },
    [tilt_degree, bearing_degree, origin.x, origin.y, origin_x, origin_y, depth, rad, bear, shift_y, zoom],
  );
  from_screen.current = fromScreen;

  const projection: Projection = {
    project,
    meter_per_pixel: meterPerPixel(view.lat, zoom),
    width: size.width,
    height: size.height,
    zoom,
    tilt_degree,
    bearing_degree,
    toScreen,
    fromScreen,
  };

  /* One transform for the entire ground plane. `transformOrigin` sits below the
   * centre so the player, who lives at the centre, stays at a comfortable
   * screen height instead of sliding to the top as the pitch increases. */
  const plane_style: React.CSSProperties = tilt_degree
    ? {
        position: "absolute",
        inset: 0,
        transformStyle: "preserve-3d",
        transformOrigin: "50% 50%",
        transform: `translateY(${shift_y}px) perspective(${depth}px) rotateX(${tilt_degree}deg) rotateZ(${bearing_degree}deg)`,
        willChange: "transform",
      }
    : { position: "absolute", inset: 0 };

  return (
    <div
      ref={box_ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        background: ground ?? "#dfe3d8",
        touchAction: is_interactive ? "none" : undefined,
        cursor: is_interactive ? (drag.current ? "grabbing" : "grab") : "default",
      }}
    >
      <div style={plane_style}>
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

      {size.width > 0 && children?.(projection)}
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
                zoomAt(sign);
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

      <div
        style={{
          position: "absolute",
          right: 0,
          bottom: credit_offset,
          zIndex: 21,
          opacity: is_chrome_hidden ? 0.55 : 1,
          background: "rgba(249,249,249,0.82)",
          borderTopLeftRadius: 8,
          padding: "2px 7px",
          fontSize: 9.5,
          color: "rgba(31,32,34,0.72)",
          pointerEvents: "none",
        }}
      >
        {is_tile_hidden ? overlay_attribution ?? source.attribution : overlay_attribution ? `${source.attribution} · ${overlay_attribution}` : source.attribution}
      </div>
    </div>
  );
}

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
