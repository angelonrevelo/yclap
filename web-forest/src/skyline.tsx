import { useMemo } from "react";
import {
  building as all_building,
  buildingNear,
  clipDepth,
  extrude,
  NEAR_SCALE,
  riseAtScale1,
  roofColour,
  type CampusBuilding,
  type ScreenPoint,
} from "./building";
import { isBuildingOverWalker } from "./depth";
import type { LatLon } from "./geo";
import { depthOf, FOG_FAR_H, groundBox, groundScreen, type Projection } from "./tile-map";

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
 * occlude the walker. Markers and the character draw above it (the standee
 * layer, `zIndex` 5), so you never lose yourself behind Areté.
 *
 * Distance fades a building into the fog by the same rule as the trees and
 * the ground rows (`projection.fogOf`), so a far block dissolves toward the
 * horizon instead of being sliced by a screen-aligned haze. Under a 52° rake that reads as a
 * camera that keeps its subject visible, which is the behaviour the genre has
 * anyway — and the alternative is a depth buffer, which is a renderer.
 */

/** How far out buildings are drawn, in metres from the camera centre. */
const DRAW_RADIUS_M = 420;

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
  /**
   * Screen boxes a building name must not cover: the sector pills and the
   * finds, placed first. A name is the thing that yields — it is dropped, not
   * nudged, for the same reason one half off the edge is.
   */
  avoid_rect?: readonly LabelRect[];
}

/** A screen-space box, centre and half-extents. */
export interface LabelRect {
  x: number;
  y: number;
  half_w: number;
  half_h: number;
}

function isHit(a: LabelRect, b: LabelRect): boolean {
  return Math.abs(a.x - b.x) < a.half_w + b.half_w && Math.abs(a.y - b.y) < a.half_h + b.half_h;
}

interface Drawn {
  row: CampusBuilding;
  roof: string;
  /** The footprint on screen — drawn blurred, as the building's own shadow. */
  ground: string;
  wall: { d: string; light: number }[];
  depth: number;
  label: { x: number; y: number; width: number } | null;
  /** The footprint on the glass, and the roof's highest point — for the walker test. */
  ring: ScreenPoint[];
  top: number;
  /** 0 clear … 1 gone, by distance. */
  fog: number;
}

/** The box a building name's pill takes, from its anchor (bottom-centre) — matches the style below. */
export function labelRectOf(name: string, label: { x: number; y: number }): LabelRect {
  const shown = Math.min(name.length, 22);
  const half_w = (shown * 5.6 + 12) / 2;
  return { x: label.x, y: label.y - 8, half_w, half_h: 9 };
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

export default function Skyline({
  projection,
  centre,
  is_labelled = true,
  style = "block",
  avoid = null,
  is_night = false,
  avoid_rect,
}: Props) {
  const { project, toScreen, meter_per_pixel, tilt_degree, width, height, fogOf } = projection;
  const horizon_y = projection.horizon.y;

  const drawn = useMemo<Drawn[]>(() => {
    const rise1 = riseAtScale1(tilt_degree, meter_per_pixel);
    /* Flat camera: a prism with no rise is a footprint, and the in-plane
       footprint already drew it. Bail rather than paint a second copy. */
    if (rise1 < 0.05) return [];

    /* The perspective scale at the world's far edge (`FOG_FAR_H` ahead). */
    const far_scale = groundScreen(0, -FOG_FAR_H * height, width, height, tilt_degree, 0)?.scale ?? 0;
    /* The perspective scale `pad_px` rows below the glass (capped at the
       default near plane). Same arithmetic as `groundBox`. */
    const depth = depthOf(height);
    const rad = (tilt_degree * Math.PI) / 180;
    const nearScaleBelow = (pad_px: number): number => {
      const back = groundBox(width, height, tilt_degree, pad_px).back;
      const den = depth - back * Math.sin(rad);
      return den > 0 ? Math.min(NEAR_SCALE, depth / den) : NEAR_SCALE;
    };
    const near = buildingNear(centre, DRAW_RADIUS_M);
    const list = near.length > 0 ? near : all_building;
    const out: Drawn[] = [];

    for (const row of list) {
      const drawn_m = style === "block" ? Math.min(row.height_m, BLOCK_M) : row.height_m;
      /* Cut to the depth the camera shows first (`clipDepth`): a corner
         behind the eye projects mirrored over the horizon, and a footprint
         running on past the fog stood up in the sky as a pale slab. The near
         cut sits just below the glass — far enough that the wall the cut
         leaves stays off it — so a block you stand beside is measured by what
         shows, not by thousands of px under the glass: measured that way it
         failed MAX_SCREEN_COVER, dropped out, and left its contact patch on
         the grass as a dark wedge with nothing standing on it. */
      const plane = clipDepth(
        row.point.map(([lat, lon]) => project({ lat, lon })),
        (p) => 1 / toScreen(p).scale,
        far_scale,
        nearScaleBelow(24 + rise1 * drawn_m * 2),
      );
      if (plane.length < 3) continue;
      const ring: ScreenPoint[] = plane.map((p) => toScreen(p));

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

      /* Too close to be a building any more — see MAX_SCREEN_COVER. */
      if (
        (max_x - min_x) > width * MAX_SCREEN_COVER &&
        (max_y - min_y) > height * MAX_SCREEN_COVER
      ) {
        continue;
      }

      /* Culled by its NEAREST corner, faded by the mean of that and its
         middle. Culling on the middle alone dropped a long block whose near
         end stood clear at z22 (the world ends ~34 m ahead there), and left
         its dark contact patch on the ground as a wedge with nothing on it. */
      /* The middle of what is left after the cut, so a block cut at the fog
         is fogged by the part still standing. */
      const c_plane = plane.reduce((m, p) => ({ x: m.x + p.x / plane.length, y: m.y + p.y / plane.length }), { x: 0, y: 0 });
      const c = toScreen(c_plane);
      let fog_near = 1;
      for (const p of plane) fog_near = Math.min(fog_near, fogOf(p));
      if (fog_near > 0.97) continue;
      const fog = (fogOf(c_plane) + fog_near) / 2;

      const prism = extrude(ring, drawn_m, (scale) => rise1 * scale);
      if (!prism) continue;

      const span = Math.max(max_x - min_x, max_y - min_y);
      let label: Drawn["label"] = null;
      if (is_labelled && row.name && span >= LABEL_MIN_PX && fog < 0.3) {
        const y = c.y - (style === "shadow" ? 0 : rise1 * drawn_m * c.scale) - 6;
        /* A name half off the edge reads as a rendering fault, not as a name.
           It is dropped rather than nudged inward, because a nudged label no
           longer points at the building it belongs to. */
        const fits =
          c.x > LABEL_MARGIN_PX &&
          c.x < width - LABEL_MARGIN_PX &&
          y > LABEL_MARGIN_PX &&
          /* Well below the horizon: a name up in the fog sits over the sky,
             naming nothing anyone can see. */
          y > horizon_y + 40 &&
          y < height - LABEL_MARGIN_PX &&
          /* Not under the right-hand map controls: a name sitting behind the
             locate button read as a rendering fault on the desktop. */
          !(c.x > width - 150 && y < 300);
        if (fits) label = { x: c.x, y, width: span };
      }

      const ground = `${ring
        .map((p, k) => `${k === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join("")}Z`;
      const top = min_y - rise1 * drawn_m;
      out.push({ row, roof: prism.roof, ground, wall: prism.wall, depth: prism.depth, label, ring, top, fog });
    }

    /* Ration the names: the biggest few on screen keep theirs, the rest go
       quiet. Ranked by roof span, which is the one thing that reads as "this is
       the building you meant" from inside the walk. */
    const ranked = out
      .filter((d) => d.label !== null)
      .sort((a, b) => b.label!.width - a.label!.width);
    /* And never over a sector pill or a find — nor over another name. */
    const kept: LabelRect[] = [];
    let count = 0;
    for (const d of ranked) {
      const r = labelRectOf(d.row.name!, d.label!);
      if (count >= MAX_LABEL || (avoid_rect ?? []).some((a) => isHit(a, r)) || kept.some((a) => isHit(a, r))) {
        d.label = null;
        continue;
      }
      kept.push(r);
      count += 1;
    }

    /* Painter's algorithm: the building whose ground sits lowest on screen is
       nearest the camera, so it goes last and covers what is behind it. */
    out.sort((a, b) => a.depth - b.depth);
    return out;
  }, [project, toScreen, fogOf, horizon_y, meter_per_pixel, tilt_degree, width, height, centre, is_labelled, style, avoid_rect]);

  if (drawn.length === 0) return null;

  return (
    <>
      <svg
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          overflow: "visible",
          pointerEvents: "none",
          /* Over the sky and fog (1), under the labels (4) and the standees (5). */
          zIndex: 2,
          /* Darker, not bluer: a hue turn put warm roofs on flat blue-grey and
             they stopped reading as buildings after dark. */
          filter: is_night ? "brightness(0.62) saturate(0.8)" : undefined,
        }}
        width={width}
        height={height}
        aria-hidden="true"
      >
        {/* A soft drop under every prism. Without it a building sits ON the
            green rather than IN it, which is the single thing that made the
            small ones read as boxes dropped on a lawn. */}
        {/* Bounded in USER SPACE, not in percent. A percentage filter region
            on a path the size of a city block asks the compositor for a buffer
            the size of a city block; `filterUnits="userSpaceOnUse"` with a
            screen-sized region keeps the cost flat however big the path is. */}
        <filter
          id="sky-contact"
          filterUnits="userSpaceOnUse"
          x={-80}
          y={-80}
          width={width + 160}
          height={height + 160}
        >
          <feGaussianBlur stdDeviation="3" />
        </filter>
        {/* Where each building meets the ground — dark, so a prism does
            not float on a pale block. It used to be painted in the ground
            plane for every building near the camera, including the ones this
            layer drops (too close, too deep in the fog), which left a bare
            dark patch on the grass. Drawn here it exists exactly when its
            building does, on the same projection. */}
        {drawn.map(({ row, ground, fog }, i) => (
          <path key={`gp-${row.building_code ?? "b"}-${i}`} d={ground} fill={`rgba(104,96,78,${(0.3 * (1 - fog)).toFixed(3)})`} />
        ))}
        <g
          transform={style === "shadow" ? "translate(2.5 3)" : undefined}
          opacity={style === "shadow" ? 0.85 : 1}
        >
          {drawn.map(({ row, ground, fog }, i) => (
            <path
              key={`sh-${row.building_code ?? "b"}-${i}`}
              d={ground}
              fill={`rgba(46,58,38,${(0.12 * (1 - fog)).toFixed(3)})`}
              filter="url(#sky-contact)"
            />
          ))}
        </g>
        {drawn.map(({ row, roof, ground, wall, ring, top, fog }, i) => {
          const colour = roofColour(row);
          const is_over_walker = avoid !== null && isBuildingOverWalker(ring, top, avoid);
          const opacity = (is_over_walker ? 0.45 : 1) * (1 - fog);
          return (
            <g key={`${row.building_code ?? "b"}-${i}`} opacity={opacity < 0.999 ? opacity : undefined}>
              {(style === "solid" || style === "block") &&
                wall.map((w, j) => (
                  <path
                    key={j}
                    d={w.d}
                    /* Block walls are cel-shaded: two bands, lit or not, the
                       way the trees' balls are — a smooth ramp read as
                       concrete, two flat tones read as a toy. */
                    fill={shade(colour, style === "block" ? (w.light > 0.5 ? 0.95 : 0.4) : w.light)}
                    /* Toon: every wall carries the ink line the trees and
                       finds do, so a building reads as the same kind of toy. */
                    stroke={style === "block" ? "rgba(58,44,28,0.72)" : undefined}
                    strokeWidth={style === "block" ? 1.3 : undefined}
                    strokeLinejoin="round"
                  />
                ))}
              {style === "hollow" &&
                wall.map((w, j) => (
                  <path
                    key={j}
                    d={w.d}
                    fill={shade(colour, w.light)}
                    fillOpacity={0.34}
                    stroke="rgba(96,84,64,0.5)"
                    strokeWidth={0.9}
                    strokeLinejoin="round"
                  />
                ))}
              <path
                d={style === "shadow" ? ground : roof}
                fill={colour}
                fillOpacity={style === "hollow" ? 0.92 : 1}
                stroke={style === "block" ? "rgba(58,44,28,0.72)" : "rgba(96,84,64,0.42)"}
                strokeWidth={style === "block" ? 1.3 : 0.9}
                strokeLinejoin="round"
              />
              {style === "block" && <path d={roof} fill="url(#toon-roof)" />}
            </g>
          );
        })}
      </svg>

      {drawn.map(({ row, label }, i) =>
        label === null ||
        (avoid && Math.abs(label.x - avoid.x) < 110 && label.y > avoid.y - 160 && label.y < avoid.y + 30) ? null : (
          <div
            key={`bl-${row.building_code ?? "b"}-${i}`}
            style={{
              position: "absolute",
              left: label.x,
              top: label.y,
              transform: "translate(-50%, -100%)",
              pointerEvents: "none",
              /* Over the sky and fog (1): a name is information, not scenery. */
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
