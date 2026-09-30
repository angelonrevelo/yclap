import { memo, useMemo, type ReactNode } from "react";
import { byDepth, isCovering } from "./depth";
import { fogAt } from "./camera-feel";
import type { LatLon } from "./geo";
import { planePoint } from "./plane-cache";
import type { Projection } from "./tile-map";

/**
 * Trees and bushes that STAND UP out of the green ground.
 *
 * The sector fill says how green a piece of campus measured; on its own it is
 * a flat colour, and a flat colour at a raked camera reads as a lawn even when
 * the imagery says woodland. These are the brand scene's round bushes and
 * lollipop trees, painted on the glass (like the skyline) so they have height.
 *
 * Decoration, and stated as such: the positions are the same deterministic
 * `tuft` scatter the play map always had, densest where vegetation was
 * MEASURED highest. They are not surveyed trees, they carry no species and no
 * id, they take no pointer, and they are culled around every find and around
 * the walker so a painted tree never grows out of something you can tap.
 *
 * The finds are painted HERE too, in one list with the trees, sorted by where
 * each meets the ground (`depth.ts`). They used to sit inside the tilted
 * plane, and the plane paints under this whole overlay, so every tree covered
 * every find — even a tree fifty metres behind it. Now a find behind a tree is
 * behind it and one in front is in front, and a tree that stands in front of a
 * find goes see-through where it covers it, the way it does for the walker.
 */

export interface Tuft extends LatLon {
  r: number;
  dark: boolean;
  /** Lawns get bushes only; trees stand where the ground is wooded or planted. */
  is_shrub_only: boolean;
}

/** Clear ground left around each find and the walker, in metres. */
const CLEAR_RADIUS_M = 6;
/**
 * The candidate list is re-cut only when the camera has moved this far, not
 * every frame. The draw radius and the tree cap come from the graphics tier
 * (`BUDGET` in `quality.ts`): 140 m and 90 trees at full, less at lite.
 */
const CANDIDATE_STEP_M = 25;

type Shape = "tree" | "bush" | "tall";

function shapeOf(t: Tuft, i: number): Shape {
  const n = ((i * 2654435761) >>> 0) % 100;
  if (t.is_shrub_only) return "bush";
  if (t.dark) return n < 55 ? "tree" : n < 80 ? "tall" : "bush";
  return n < 30 ? "tree" : "bush";
}

/** Metres tall, before the perspective scale. */
function heightOf(shape: Shape, t: Tuft): number {
  if (shape === "bush") return 1.4 + (t.r - 3.4) * 0.12;
  if (shape === "tall") return 7 + (t.r - 3.4) * 0.6;
  return 5 + (t.r - 3.4) * 0.5;
}

/**
 * A colour under the night grade: darker and a little greyer.
 *
 * Night used to be a CSS `filter` on every tree's wrapper — up to 90 filtered
 * layers, each its own offscreen pass, on a phone. The same grade done once on
 * the numbers costs nothing per frame, and it is how the ground is graded too
 * (`gradeFill` in `play-map.tsx`).
 */
function dusk(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => c * 0.62);
  const grey = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return `#${rgb
    .map((c) => Math.round(grey + (c - grey) * 0.85))
    .map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, "0"))
    .join("")}`;
}

const DAY_TONE = {
  back: { dark: "#2F7A3A", light: "#3E9A4A" },
  front: { dark: "#4FA84A", light: "#6CC04F" },
  lit: { dark: "#7CC84A", light: "#9BDB6A" },
  trunk: "#8A5A34",
};
const NIGHT_TONE = {
  back: { dark: dusk(DAY_TONE.back.dark), light: dusk(DAY_TONE.back.light) },
  front: { dark: dusk(DAY_TONE.front.dark), light: dusk(DAY_TONE.front.light) },
  lit: { dark: dusk(DAY_TONE.lit.dark), light: dusk(DAY_TONE.lit.light) },
  trunk: dusk(DAY_TONE.trunk),
};

const Glyph = memo(function Glyph({ shape, dark, is_night }: { shape: Shape; dark: boolean; is_night: boolean }) {
  const tone = is_night ? NIGHT_TONE : DAY_TONE;
  const back = dark ? tone.back.dark : tone.back.light;
  const front = dark ? tone.front.dark : tone.front.light;
  const lit = dark ? tone.lit.dark : tone.lit.light;
  const trunk = tone.trunk;
  if (shape === "bush") {
    return (
      <svg viewBox="0 0 100 60" width="100%" height="100%" preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
        <ellipse cx="50" cy="57" rx="44" ry="6" fill="rgba(20,60,30,0.22)" />
        <path d="M8 56 Q2 38 18 32 Q20 14 40 16 Q50 2 64 14 Q84 10 86 30 Q100 36 92 56 Z" fill={back} />
        <path d="M14 56 Q10 42 24 38 Q28 24 44 28 Q54 16 66 28 Q82 26 82 42 Q92 46 86 56 Z" fill={front} />
        <path d="M30 34 Q38 26 46 32" fill="none" stroke={lit} strokeWidth="5" strokeLinecap="round" />
      </svg>
    );
  }
  if (shape === "tall") {
    return (
      <svg viewBox="0 0 60 120" width="100%" height="100%" preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
        <ellipse cx="30" cy="117" rx="20" ry="4" fill="rgba(20,60,30,0.24)" />
        <rect x="26" y="84" width="8" height="34" rx="3" fill={trunk} />
        <path d="M30 4 Q52 30 50 62 Q56 88 30 94 Q4 88 10 62 Q8 30 30 4 Z" fill={back} />
        <path d="M30 18 Q46 38 44 62 Q48 82 30 86 Q16 82 18 62 Q16 38 30 18 Z" fill={front} />
        <path d="M24 36 Q28 28 34 30" fill="none" stroke={lit} strokeWidth="4" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 110" width="100%" height="100%" preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
      <ellipse cx="50" cy="107" rx="30" ry="5" fill="rgba(20,60,30,0.24)" />
      <path d="M44 106 L46 66 Q40 58 32 56 L36 52 Q44 56 48 60 L50 48 L54 48 L54 62 Q60 54 68 54 L68 58 Q58 62 56 70 L58 106 Z" fill={trunk} />
      <circle cx="30" cy="46" r="24" fill={back} />
      <circle cx="70" cy="44" r="24" fill={back} />
      <circle cx="50" cy="28" r="26" fill={back} />
      <circle cx="36" cy="44" r="18" fill={front} />
      <circle cx="64" cy="42" r="18" fill={front} />
      <circle cx="50" cy="30" r="19" fill={front} />
      <path d="M38 22 Q46 14 56 18" fill="none" stroke={lit} strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
});

function meterBetween(a: LatLon, b: LatLon): number {
  const dy = (a.lat - b.lat) * 111_320;
  const dx = (a.lon - b.lon) * 111_320 * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/**
 * A find, already placed on the glass by the play map (`toScreenFind`): its
 * foot at (`x`, `y`), its drawn size, and the marker itself. Flora only decides
 * WHEN it paints relative to the trees.
 */
export interface GlassFind {
  key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  node: ReactNode;
}

interface Props {
  tuft: readonly Tuft[];
  /** The finds on screen, painted in depth order with the trees. */
  find: readonly GlassFind[];
  projection: Projection;
  centre: LatLon;
  /** Every find's ground spot: no tree is painted on top of one. Should be a
   *  stable array (memoised by the caller) — it keys a memo here. */
  keep_clear: readonly LatLon[];
  /** The walker's ground spot, kept clear the same way. */
  walker: LatLon | null;
  walker_screen_y: number | null;
  walker_x: number | null;
  is_night: boolean;
  /** Most trees drawn at once. */
  tree_max: number;
  /** How far from the camera a tree is still drawn, metres. */
  tree_radius_m: number;
}

/** The glyph's box at a drawn height of 100 px; everything else is a scale of it. */
const GLYPH_BASE_H = 100;
const aspectOf = (shape: Shape) => (shape === "bush" ? 1.7 : shape === "tall" ? 0.5 : 0.9);

export default function Flora({
  tuft,
  find,
  projection,
  centre,
  keep_clear,
  walker,
  walker_screen_y,
  walker_x,
  is_night,
  tree_max,
  tree_radius_m,
}: Props) {
  const { project, toScreen, width, height, meter_per_pixel, view_distance_m } = projection;

  /* The tufts no find sits on. Finds change when the world rotates, not per
     frame — but this check ran every frame for every nearby tuft against
     every find (`meterBetween`, ~300 ms of a 10 s walk at 4× CPU throttle in
     the 09-30 trace). Now it runs when the finds change. */
  const clear = useMemo(() => {
    const out: number[] = [];
    for (let i = 0; i < tuft.length; i += 1) {
      if (!keep_clear.some((k) => meterBetween(k, tuft[i]) < CLEAR_RADIUS_M)) out.push(i);
    }
    return out;
  }, [tuft, keep_clear]);

  /* The tufts near the camera, re-cut on a coarse grid so a glide frame only
     walks the near ones, not the whole campus. */
  const cell_lat = CANDIDATE_STEP_M / 111_320;
  const cell_lon = cell_lat / Math.cos((centre.lat * Math.PI) / 180);
  const cell_y = Math.round(centre.lat / cell_lat);
  const cell_x = Math.round(centre.lon / cell_lon);
  const candidate = useMemo(() => {
    const reach_lat = (tree_radius_m + CANDIDATE_STEP_M) / 111_320;
    const lat = cell_y * cell_lat;
    const lon = cell_x * cell_lon;
    const reach_lon = reach_lat / Math.cos((lat * Math.PI) / 180);
    return clear.filter((i) => Math.abs(tuft[i].lat - lat) <= reach_lat && Math.abs(tuft[i].lon - lon) <= reach_lon);
  }, [clear, tuft, cell_x, cell_y, cell_lat, cell_lon, tree_radius_m]);

  const drawn: { key: number; x: number; y: number; w: number; h: number; shape: Shape; dark: boolean; clear: number }[] = [];
  const lat_span = tree_radius_m / 111_320;
  const lon_span = lat_span / Math.cos((centre.lat * Math.PI) / 180);
  for (const i of candidate) {
    const t = tuft[i];
    if (Math.abs(t.lat - centre.lat) > lat_span || Math.abs(t.lon - centre.lon) > lon_span) continue;
    if (walker && meterBetween(walker, t) < CLEAR_RADIUS_M) continue;
    /* The plane point is cached per camera anchor (`plane-cache.ts`); only
       `toScreen` runs per frame. */
    const at = toScreen(planePoint(project, t));
    if (at.scale <= 0) continue;
    const shape = shapeOf(t, i);
    const h_m = heightOf(shape, t);
    const px_per_m = at.scale / Math.max(meter_per_pixel, 0.001);
    const h = Math.min(260, Math.max(10, h_m * px_per_m));
    const w = h * aspectOf(shape);
    if (at.x + w / 2 < 0 || at.x - w / 2 > width || at.y - h > height) continue;
    /* Past the view distance there is no ground to stand a tree on — the
       world has ended in the horizon — and over its last stretch a tree fades
       into the fog with the ground under it (`fogAt`). */
    const clear = 1 - fogAt(meterBetween(centre, t), view_distance_m);
    if (clear <= 0.01) continue;
    drawn.push({ key: i, x: at.x, y: at.y, w, h, shape, dark: t.dark, clear });
  }
  /* The cap keeps the NEAREST trees (lowest on the glass), not whichever the
     scatter happened to list first — a far tree is the one nobody misses. */
  if (drawn.length > tree_max) {
    drawn.sort((a, b) => b.y - a.y);
    drawn.length = tree_max;
  }
  /* Painter's order, trees and finds together: further up the glass is
     further away, and paints first. */
  const standee: ({ kind: "tree"; tree: (typeof drawn)[number]; y: number } | { kind: "find"; find: GlassFind; y: number })[] = [
    ...drawn.map((tree) => ({ kind: "tree" as const, tree, y: tree.y })),
    ...find.map((f) => ({ kind: "find" as const, find: f, y: f.y })),
  ];
  standee.sort(byDepth);
  /* In front of the walker when nearer the camera than them. Finds and trees
     share the two bands so the painter's order above holds inside each. */
  const zOf = (y: number) => (walker_screen_y !== null && y > walker_screen_y ? 7 : 5);
  return (
    /* No z-index, opacity or filter on this wrapper: any of them would make it
       a stacking context, and then no tree could stand in front of the walker. */
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {standee.map((s) => {
        if (s.kind === "find") {
          const f = s.find;
          return (
            <div key={`find-${f.key}`} className="pm-stand" style={{ zIndex: zOf(f.y) }}>
              {f.node}
            </div>
          );
        }
        const d = s.tree;
        const is_front = walker_screen_y !== null && d.y > walker_screen_y;
        /* A tree between the camera and the walker goes see-through where it
           would cover them. You never lose yourself behind scenery. */
        const is_over_walker =
          is_front && walker_x !== null && Math.abs(d.x - walker_x) < d.w / 2 + 40 && d.y - d.h < (walker_screen_y ?? 0);
        /* And the same for a find: a tree nearer the camera than a find, and
           over it, lets it show through. */
        const is_over_find = find.some((f) => isCovering(d, f));
        const k = d.h / GLYPH_BASE_H;
        return (
        <div
          key={d.key}
          aria-hidden
          /* Position and origin are the `.pm-tree` class (`game.css`): only
             what moves is inline, so a frame diffs three keys, not nine. */
          className="pm-tree"
          style={{
            /* A FIXED box moved and sized by a 2D transform, not left/top/
               width/height. Those four changed on every tree every camera
               frame, and each change is a layout; a transform is not. 2D on
               purpose: `translate3d` would give each of up to 90 trees its own
               compositor layer to re-raster as it scales. */
            width: GLYPH_BASE_H * aspectOf(d.shape),
            height: GLYPH_BASE_H,
            transform: `translate(${(d.x - d.w / 2).toFixed(1)}px, ${(d.y - d.h).toFixed(1)}px) scale(${k.toFixed(4)})`,
            zIndex: zOf(d.y),
            /* A distant tree is also a hazier one. */
            opacity: is_over_walker || is_over_find ? 0.4 * d.clear : d.clear,
          }}
        >
          <Glyph shape={d.shape} dark={d.dark} is_night={is_night} />
        </div>
        );
      })}
    </div>
  );
}
