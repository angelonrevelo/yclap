import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import {
  building as all_building,
  buildingNear,
  extrudePoint,
  riseAtScale1,
  ringCentre,
  roofColour,
  type CampusBuilding,
  type PrismPoint,
  type ScreenPoint,
} from "./building";
import { fogAt } from "./camera-feel";
import type { LatLon } from "./geo";
import { planePoint, planeRing } from "./plane-cache";
import { isCameraFrame, type Projection } from "./tile-map";

/**
 * The campus skyline, drawn in screen space above the raked ground.
 *
 * It has to be screen space. Everything in `TileMap`'s `children` lives inside
 * one CSS 3D transform, which is what welds a marker to its feature for free —
 * and which is also exactly why a building cannot be drawn there. Geometry
 * inside that plane IS the plane; there is no direction in it that points up
 * out of the ground. A prism's whole content is the offset between its roof and
 * its footprint, so it is computed against `toScreen` and painted on the glass.
 *
 * The cost of that choice, stated rather than hidden: the skyline does not
 * occlude the walker. Markers and the character draw above it at `zIndex` 3 and
 * up, so you never lose yourself behind Areté. Under a 52° rake that reads as a
 * camera that keeps its subject visible, which is the behaviour the genre has
 * anyway — and the alternative is a depth buffer, which is a renderer.
 */

/** How far out buildings are drawn, in metres from the camera centre. */
const DRAW_RADIUS_M = 420;


/**
 * Slack on the seen-ground radius: `centre` is where the camera is going, the
 * glass shows where it is this frame (a few metres behind on a glide), and a
 * building is culled by its bounding box, not its nearest wall.
 */
const REACH_SLACK_M = 40;

/** The candidate list's grid, and the step the draw radius is rounded up to. */
const NEAR_STEP_M = 25;

/**
 * A building's key: its place in the building file, which never changes.
 *
 * It was `${building_code}-${i}` with `i` the building's place in THIS
 * frame's painter's order — and that order changes as the camera turns, so
 * React handed one building's `<g>` to another every few frames, rewrote its
 * colours and remounted the ones that slid past the end (~780 SVG node
 * inserts and ~730 fill rewrites in a 10 s walk at z19).
 */
const building_key = new Map(all_building.map((row, i) => [row, `b${i}`]));

/** A footprint's centre, as a stable object so its plane point is cached. */
const centre_of = new Map(all_building.map((row) => [row, ringCentre(row.point)]));

/** How far a footprint's furthest corner is from its centre, metres. */
const radius_of = new Map(
  all_building.map((row) => {
    const c = centre_of.get(row)!;
    let out = 0;
    for (const [lat, lon] of row.point) out = Math.max(out, meterBetween(c, { lat, lon }));
    return [row, out];
  }),
);

function meterBetween(a: LatLon, b: LatLon): number {
  const dy = (a.lat - b.lat) * 111_320;
  const dx = (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/** Don't label a building whose roof is smaller than this on screen. */
const LABEL_MIN_PX = 90;

/**
 * At most this many building names at once.
 *
 * The sector layer learned this the expensive way — naming all 103 sectors was
 * the clutter, not the sectors — and a skyline with 105 buildings on it is the
 * same mistake with a different noun. Three is enough to tell you which part of
 * campus you are looking at; the fourth is decoration on top of a map that
 * already has labels of its own.
 */
const MAX_LABEL = 3;

/** Keep a label this far inside the glass, so none of it is ever cut off. */
const LABEL_MARGIN_PX = 76;

/**
 * Drop a building whose footprint covers more than this much of the glass.
 *
 * Found by playtesting the thing at the camera it actually ships at. The play
 * view defaults to z22 — about 14 m across a phone — and a 2,000 m² building is
 * then far wider than the screen. What that produced was not a building: it was
 * a flat cream sheet over the entire map, every path and sector under it gone,
 * with a Gaussian blur applied to a path measured at 279,000 x 166,000 px.
 *
 * A building you are standing against is not a shape you read. It is the wall
 * beside you, and the honest way to draw a wall you are inside the footprint of
 * is not to draw it — the sector layer still carries the ground, and the
 * building's name still sits on the map one zoom out. So past this ratio the
 * prism drops out, which is also what stops the compositor being handed a
 * quarter-million-pixel blur on a phone.
 */
const MAX_SCREEN_COVER = 2.2;

/**
 * How much of a building to draw.
 *
 * This is a choice, not a setting, and the reason it is a choice is a real
 * limit of the approach. The prism is painted on the glass, above the whole
 * tilted plane, so it cannot depth-sort against anything IN that plane — a
 * footpath running between you and a building is drawn first and then covered
 * by it. At a raked camera that is visible and it is wrong.
 *
 *   `solid`  — full prism. The most building-like, and the one that covers paths.
 *   `hollow` — roof cap and wall EDGES only. The path still reads through it.
 *   `shadow` — no walls at all: the footprint and a soft drop, so a building has
 *              weight and an outline and never occludes anything.
 *
 * `shadow` is the only one of the three with no artefact, because it is the
 * only one that does not claim a volume it cannot depth-sort.
 */
export type SkylineStyle = "block" | "solid" | "hollow" | "shadow";

/**
 * `block` — the default since 09-25: a LOW prism, every building capped at
 * this many metres of wall whatever its real height.
 *
 * It is the genre's building, and it is the honest middle of the three
 * above. Full walls claim a volume the renderer cannot depth-sort and cover
 * the path in front of them; a footprint alone read as an empty paved lot —
 * "Schmitt Hall" was a cream slab you could mistake for a car park. A plinth
 * this low has visible walls and a roof, so it reads as a building, and the
 * most it can ever hide is a strip of ground a few metres deep behind it.
 * Real heights are still in the data and `solid` still draws them.
 */
const BLOCK_M = 3.2;

interface Props {
  projection: Projection;
  /** Camera centre — what the cull is measured from. */
  centre: LatLon;
  /** Names on the big ones. Off while the camera is moving fast. */
  is_labelled?: boolean;
  style?: SkylineStyle;
  /** The walker's feet on the glass. No building name is printed across them. */
  avoid?: { x: number; y: number } | null;
  /** Same dusk grade as the ground, or the roofs glow cream in the dark. */
  is_night?: boolean;
  /** The blurred contact shadow under every building. Off in the lite tier. */
  is_shadow?: boolean;
}

interface Drawn {
  row: CampusBuilding;
  /** The footprint on screen — drawn blurred, as the building's own shadow. */
  ring: ScreenPoint[];
  /** The roof, index-aligned with `ring`, and the walls between the two. */
  top: PrismPoint["top"];
  face: PrismPoint["face"];
  depth: number;
  /** 1 clear, 0 gone into the horizon (`fogAt` at the building's distance). */
  clear: number;
  label: { x: number; y: number; width: number } | null;
}

function shade(hex: string, light: number): string {
  /* Walls are the roof colour taken down toward a warm shadow. Multiplying
     toward black instead goes grey and the campus reads as concrete. */
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const k = 0.46 + light * 0.46;
  const mix = (c: number, floor: number) => Math.round(c * k + floor * (1 - k));
  return `rgb(${mix(r, 122)},${mix(g, 108)},${mix(b, 88)})`;
}

/**
 * How far off the canvas a contact shadow's SHAPE is drawn, so only its
 * blurred shadow — pulled back by `shadowOffsetX` — lands on the glass. The
 * canvas has no group blur like the SVG's `feGaussianBlur`, and `ctx.filter`
 * is not in every Safari the booth iPhones run; a shadow is.
 */
const SHADOW_FAR = 10_000;

/** A closed polygon into the current path. */
function ringTo(ctx: CanvasRenderingContext2D, ring: readonly { x: number; y: number }[]): void {
  ctx.moveTo(ring[0].x, ring[0].y);
  for (let k = 1; k < ring.length; k += 1) ctx.lineTo(ring[k].x, ring[k].y);
  ctx.closePath();
}

/** Wall light steps: a step no eye separates on a wall a few pixels tall. */
const LIGHT_STEP = 16;

/**
 * `shade` for a canvas, remembered per roof colour and light step, so a
 * camera frame reuses the colour strings instead of formatting one per wall.
 */
const shade_memo = new Map<string, string[]>();
function shadeOf(colour: string, step: number): string {
  let row = shade_memo.get(colour);
  if (!row) {
    row = Array.from({ length: LIGHT_STEP + 1 }, (_, k) => shade(colour, k / LIGHT_STEP));
    shade_memo.set(colour, row);
  }
  return row[step];
}

/** A wall quad into the current path. */
function wallTo(ctx: CanvasRenderingContext2D, ring: readonly ScreenPoint[], top: PrismPoint["top"], w: PrismPoint["face"][number]): void {
  ctx.moveTo(ring[w.a].x, ring[w.a].y);
  ctx.lineTo(ring[w.b].x, ring[w.b].y);
  ctx.lineTo(top[w.b].x, top[w.b].y);
  ctx.lineTo(top[w.a].x, top[w.a].y);
  ctx.closePath();
}

/** One frame of the skyline: contact shadows, then each prism far to near. */
function paintSkyline(
  ctx: CanvasRenderingContext2D,
  drawn: readonly Drawn[],
  style: SkylineStyle,
  is_shadow: boolean,
  dpr: number,
): void {
  ctx.lineJoin = "round";
  if (is_shadow && drawn.length > 0) {
    ctx.save();
    /* Same as the SVG had: a 3 px Gaussian (shadowBlur is twice the
       deviation, and like the offset it is in canvas pixels, not CSS ones). */
    if (style === "shadow") ctx.globalAlpha = 0.85;
    ctx.translate(-SHADOW_FAR + (style === "shadow" ? 2.5 : 0), style === "shadow" ? 3 : 0);
    ctx.shadowOffsetX = SHADOW_FAR * dpr;
    ctx.shadowBlur = 6 * dpr;
    ctx.shadowColor = "rgba(46,58,38,0.26)";
    ctx.fillStyle = "#000";
    /* One path of every footprint, like the one blurred SVG group it was. */
    ctx.beginPath();
    for (const d of drawn) ringTo(ctx, d.ring);
    ctx.fill();
    ctx.restore();
  }
  /* Canvas calls are the cost here, not pixels, so a building's walls go in
     as few calls as its shades allow: one fill per light step in use, one
     stroke for every edge. The walls of one prism face the camera and do not
     overlap each other, so the order among them never showed. */
  const step_of: number[] = [];
  for (const { row, ring, top, face, clear } of drawn) {
    const colour = roofColour(row);
    if (face.length > 0 && style !== "shadow") {
      step_of.length = 0;
      for (const w of face) step_of.push(Math.round(w.light * LIGHT_STEP));
      ctx.globalAlpha = (style === "hollow" ? 0.34 : 1) * clear;
      for (let i = 0; i < face.length; i += 1) {
        const step = step_of[i];
        if (step < 0) continue;
        ctx.beginPath();
        for (let k = i; k < face.length; k += 1) {
          if (step_of[k] !== step) continue;
          wallTo(ctx, ring, top, face[k]);
          step_of[k] = -1;
        }
        ctx.fillStyle = shadeOf(colour, step);
        ctx.fill();
      }
      ctx.globalAlpha = clear;
      /* `solid` walls had no edge; `block` and `hollow` did, at full
         strength over the hollow's see-through face. */
      if (style !== "solid") {
        ctx.beginPath();
        for (const w of face) wallTo(ctx, ring, top, w);
        ctx.strokeStyle = style === "hollow" ? "rgba(96,84,64,0.5)" : "rgba(96,84,64,0.35)";
        ctx.lineWidth = style === "hollow" ? 0.9 : 0.8;
        ctx.stroke();
      }
    }
    ctx.beginPath();
    ringTo(ctx, style === "shadow" ? ring : top);
    ctx.globalAlpha = (style === "hollow" ? 0.92 : 1) * clear;
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.globalAlpha = clear;
    ctx.strokeStyle = "rgba(96,84,64,0.42)";
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

export default function Skyline({
  projection,
  centre,
  is_labelled = true,
  style = "block",
  avoid = null,
  is_night = false,
  is_shadow = true,
}: Props) {
  const { project, toScreen, meter_per_pixel, tilt_degree, width, height } = projection;

  /* Four figures: the exact value drifts with the walker's latitude on every
     fix, which would re-run the memo below (and repaint the canvas outside a
     camera frame) for no visible change. */
  const mpp = Number(meter_per_pixel.toPrecision(4));

  /* Only as far as the camera sees: the view distance, where the world ends
     in the horizon (`camera-feel.ts`). Nothing past it is drawn — it would
     stand in the sky — and nothing is projected to find that out. */
  const reach_m = projection.view_distance_m;
  const radius_m = Number.isFinite(reach_m)
    ? Math.min(DRAW_RADIUS_M, Math.ceil((reach_m + REACH_SLACK_M) / NEAR_STEP_M) * NEAR_STEP_M)
    : DRAW_RADIUS_M;
  /* The candidate buildings, re-cut on a grid rather than on every fix: the
     walker's position arrives 20 times a second and the list only changes
     when they have crossed a cell (`centre` is the view, not this frame's
     camera; the slack covers the few metres between them). */
  const cell_lat = NEAR_STEP_M / 111_320;
  const cell_lon = cell_lat / Math.cos((centre.lat * Math.PI) / 180);
  const cell_y = Math.round(centre.lat / cell_lat);
  const cell_x = Math.round(centre.lon / cell_lon);
  const near = useMemo(() => {
    const list = buildingNear({ lat: cell_y * cell_lat, lon: cell_x * cell_lon }, radius_m + NEAR_STEP_M);
    return list.length > 0 ? list : all_building;
  }, [cell_x, cell_y, cell_lat, cell_lon, radius_m]);

  const drawn = useMemo<Drawn[]>(() => {
    const rise1 = riseAtScale1(tilt_degree, mpp);
    /* Flat camera: a prism with no rise is a footprint, and the in-plane
       footprint already drew it. Bail rather than paint a second copy. */
    if (rise1 < 0.05) return [];

    const list = near;
    const out: Drawn[] = [];

    for (const row of list) {
      /* One point first, before every corner: the footprint's centre and a
         circle round it that holds the whole building, prism included, at
         twice the centre's perspective scale (nearer corners grow, never
         that much over a footprint). Clear of the glass, or wholly up in
         the haze, and the corners are never projected. Most of the
         candidates within the reach are beside or behind the camera, and at
         the pulled-back camera that is dozens of buildings a frame. A centre
         behind the eye (scale ≤ 0) proves nothing and takes the full test. */
      const c0 = toScreen(planePoint(project, centre_of.get(row) ?? ringCentre(row.point)));
      if (c0.scale > 0) {
        const reach_px = ((radius_of.get(row) ?? 0) / mpp) * c0.scale * 2 + 40 + rise1 * row.height_m * c0.scale * 2;
        if (c0.x + reach_px < 0 || c0.x - reach_px > width) continue;
        if (c0.y - reach_px > height) continue;
      }
      /* Plane points are cached per camera anchor (`plane-cache.ts`); the
         Mercator projection of every corner used to run every frame. */
      const ring: ScreenPoint[] = planeRing(project, row.point).map(toScreen);

      /* Screen-space cull. A building entirely off the glass still costs a
         path string and a parse, and at z22 most of them are. The pad is
         generous enough that a tall building whose footprint is just off the
         bottom still gets to put its roof on screen. */
      let min_x = Infinity;
      let max_x = -Infinity;
      let min_y = Infinity;
      let max_y = -Infinity;
      for (const p of ring) {
        if (p.x < min_x) min_x = p.x;
        if (p.x > max_x) max_x = p.x;
        if (p.y < min_y) min_y = p.y;
        if (p.y > max_y) max_y = p.y;
      }
      const pad = 40 + rise1 * row.height_m;
      if (max_x < -pad || min_x > width + pad) continue;
      if (max_y < -pad || min_y > height + pad) continue;
      /* Past the view distance: gone into the horizon, never drawn over the sky. */
      const clear = 1 - fogAt(meterBetween(projection.centre, centre_of.get(row) ?? ringCentre(row.point)), projection.view_distance_m);
      if (clear <= 0.01) continue;

      /* Too close to be a building any more — see MAX_SCREEN_COVER. */
      if (
        (max_x - min_x) > width * MAX_SCREEN_COVER &&
        (max_y - min_y) > height * MAX_SCREEN_COVER
      ) {
        continue;
      }

      const drawn_m = style === "block" ? Math.min(row.height_m, BLOCK_M) : row.height_m;
      const prism = extrudePoint(ring, drawn_m, (scale) => rise1 * scale);
      if (!prism) continue;

      const span = Math.max(max_x - min_x, max_y - min_y);
      let label: Drawn["label"] = null;
      if (is_labelled && row.name && span >= LABEL_MIN_PX) {
        const c = toScreen(planePoint(project, centre_of.get(row) ?? ringCentre(row.point)));
        const y = c.y - (style === "shadow" ? 0 : rise1 * drawn_m * c.scale) - 6;
        /* A name half off the edge reads as a rendering fault, not as a name.
           It is dropped rather than nudged inward, because a nudged label no
           longer points at the building it belongs to. */
        const fits =
          c.x > LABEL_MARGIN_PX &&
          c.x < width - LABEL_MARGIN_PX &&
          y > LABEL_MARGIN_PX &&
          /* Not above the raked plane's far edge (~a third of the glass): a
             name up there sits in the sky, over the horizon, naming nothing. */
          y > height * 0.36 &&
          y < height - LABEL_MARGIN_PX &&
          /* Not under the right-hand map controls: a name sitting behind the
             locate button read as a rendering fault on the desktop. */
          !(c.x > width - 150 && y < 300);
        if (fits) label = { x: c.x, y, width: span };
      }

      out.push({ row, ring, top: prism.top, face: prism.face, depth: prism.depth, label, clear });
    }

    /* Ration the names: the biggest few on screen keep theirs, the rest go
       quiet. Ranked by roof span, which is the one thing that reads as "this is
       the building you meant" from inside the walk. */
    const ranked = out
      .filter((d) => d.label !== null)
      .sort((a, b) => b.label!.width - a.label!.width);
    for (const d of ranked.slice(MAX_LABEL)) d.label = null;

    /* Painter's algorithm: the building whose ground sits lowest on screen is
       nearest the camera, so it goes last and covers what is behind it. */
    out.sort((a, b) => a.depth - b.depth);
    return out;
  }, [near, project, toScreen, mpp, tilt_degree, width, height, is_labelled, style]);

  /* Painted into ONE canvas after the commit, in the same frame (a layout
     effect runs inside the glide's `flushSync`, before the browser paints).
     It was an `<svg>` of a `<g>` and three to six `<path>`s per building, and
     every camera frame rewrote every `d`: at the pulled-back camera that was
     ~100 path attributes a frame, each one a presentation-attribute style
     recalc, a path parse and a React prop diff, plus the fibers to reconcile
     them (the skyline was the largest render in the z19 profile, 10-01). A
     canvas is one element whatever the building count; the drawing itself is
     the same shapes in the same painter's order. */
  const canvas_ref = useRef<HTMLCanvasElement | null>(null);
  const dpr = typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1);
  /* A commit outside a camera frame paints on the next animation frame, once,
     with whatever is latest by then — see `isCameraFrame` for why. That is
     still the frame the rest of the commit first shows up in: rAF runs before
     the browser paints. A camera frame paints at once and drops any pending
     one, since it is newer. */
  const pending = useRef<number | null>(null);
  const paint_ref = useRef<() => void>(() => {});
  useLayoutEffect(() => {
    paint_ref.current = () => {
      const canvas = canvas_ref.current;
      if (!canvas) return;
      const px_w = Math.max(1, Math.round(width * dpr));
      const px_h = Math.max(1, Math.round(height * dpr));
      if (canvas.width !== px_w) canvas.width = px_w;
      if (canvas.height !== px_h) canvas.height = px_h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, px_w, px_h);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      paintSkyline(ctx, drawn, style, is_shadow, dpr);
    };
    if (isCameraFrame()) {
      if (pending.current !== null) cancelAnimationFrame(pending.current);
      pending.current = null;
      paint_ref.current();
    } else if (pending.current === null) {
      pending.current = requestAnimationFrame(() => {
        pending.current = null;
        paint_ref.current();
      });
    }
  }, [drawn, style, is_shadow, width, height, dpr]);
  useEffect(
    () => () => {
      if (pending.current !== null) cancelAnimationFrame(pending.current);
    },
    [],
  );

  return (
    <>
      <canvas
        ref={canvas_ref}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          width,
          height,
          pointerEvents: "none",
          zIndex: 1,
          filter: is_night ? "brightness(0.5) saturate(0.7) hue-rotate(200deg)" : undefined,
        }}
        aria-hidden="true"
      />

      {drawn.map(({ row, label }) =>
        label === null ||
        (avoid && Math.abs(label.x - avoid.x) < 110 && label.y > avoid.y - 160 && label.y < avoid.y + 30) ? null : (
          <div
            key={`l${building_key.get(row)}`}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              /* Placed by transform, not left/top: a moved `left` is a layout
                 every camera frame, a moved transform is not. */
              transform: `translate(${label.x.toFixed(1)}px, ${label.y.toFixed(1)}px) translate(-50%, -100%)`,
              pointerEvents: "none",
              /* Over the horizon haze (3): a name is information, not scenery. */
              zIndex: 4,
              whiteSpace: "nowrap",
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: 0.2,
              color: "rgba(48,42,30,0.9)",
              background: "rgba(255,252,244,0.82)",
              border: "1px solid rgba(255,255,255,0.9)",
              borderRadius: 6,
              padding: "1px 5px",
              boxShadow: "0 1px 4px rgba(24,38,20,0.16)",
            }}
          >
            {row.name!.length > 22 ? `${row.name!.slice(0, 21)}…` : row.name}
          </div>
        ),
      )}
    </>
  );
}
