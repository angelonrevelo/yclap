import type { ReactNode } from "react";
import { byDepth, depthZ, isCovering, isOverWalker, isUnderWalker, type Standee } from "./depth";
import type { LatLon } from "./geo";
import type { Projection } from "./tile-map";
import { ToonPlant, TOON_ASPECT, type ToonShape } from "./toon";

/**
 * Trees and bushes that STAND UP out of the green ground.
 *
 * The sector fill says how green a piece of campus measured; on its own it is
 * a flat colour, and a flat colour at a raked camera reads as a lawn even when
 * the imagery says woodland. These are the toon kit's trees, bushes, palms
 * and plumeria (`toon.tsx`): cel-shaded volumes with one outline each,
 * painted on the glass (like the skyline) so they have height, and swaying a
 * degree or two so the ground is alive.
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
 *
 * The walker and the buddy stand in the same layer. Each standee's `zIndex` is
 * its foot's screen row (`depthZ`), so the buddy trailing behind the walker is
 * behind them, and an egg a step further back than a tree is behind the tree —
 * instead of both living in fixed bands where whoever rendered last won.
 *
 * Distance is fog, not a cut. Every standee fades by `projection.fogOf` of its
 * own perspective scale — the rule the ground rows are fogged by in
 * `horizon.tsx` — and is dropped only once it has faded out, so nothing blinks
 * into existence at a fixed line on the glass.
 */

export interface Tuft extends LatLon {
  r: number;
  dark: boolean;
  /** Lawns get bushes only; trees stand where the ground is wooded or planted. */
  is_shrub_only: boolean;
}

/** Only this far from the camera centre is worth a billboard. */
const DRAW_RADIUS_M = 140;
/** Clear ground left around each find and the walker, in metres. */
const CLEAR_RADIUS_M = 6;
/** No more than this many at once: a phone, not a forest renderer. */
const MAX_DRAWN = 110;

type Shape = ToonShape;

function shapeOf(t: Tuft, i: number): Shape {
  const n = ((i * 2654435761) >>> 0) % 100;
  if (t.is_shrub_only) return "bush";
  if (t.dark) return n < 42 ? "tree" : n < 64 ? "tall" : n < 74 ? "bloom" : n < 84 ? "palm" : "bush";
  return n < 22 ? "tree" : n < 34 ? "palm" : n < 42 ? "bloom" : "bush";
}

/**
 * Metres tall, before the perspective scale — and then a cartoon's licence.
 *
 * The genre draws its props bigger than life so they read on a phone; at true
 * scale a 1.4 m bush at z19 was a green crumb. `TOON_SCALE` is that licence,
 * stated. Positions stay the deterministic scatter; only the drawing is bigger.
 */
const TOON_SCALE = 1.35;
function heightOf(shape: Shape, t: Tuft): number {
  const base =
    shape === "bush" ? 1.4 + (t.r - 3.4) * 0.12 : shape === "tall" ? 7 + (t.r - 3.4) * 0.6 : shape === "palm" ? 7.5 + (t.r - 3.4) * 0.5 : 5 + (t.r - 3.4) * 0.5;
  return base * TOON_SCALE;
}

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
  /** 0 clear … 1 lost in the fog, from its distance (`projection.fogOf`). */
  fog: number;
  /** Close enough to log. Never hidden behind the walker — see `isUnderWalker`. */
  is_in_reach: boolean;
}

interface Props {
  tuft: readonly Tuft[];
  /** The finds on screen, painted in depth order with the trees. */
  find: readonly GlassFind[];
  projection: Projection;
  centre: LatLon;
  /** Finds and the walker: nothing is painted on top of these. */
  keep_clear: readonly LatLon[];
  /** The walker, standing in this layer: foot, drawn size, and the figure itself. */
  walker: (Standee & { node: ReactNode }) | null;
  is_night: boolean;
  /** The buddy. It sorts itself (`depthZ` of its own foot) inside this layer. */
  children?: ReactNode;
}

export default function Flora({ tuft, find, projection, centre, keep_clear, walker, is_night, children }: Props) {
  const { project, toScreen, width, height, meter_per_pixel, fogOf } = projection;
  let drawn: { key: number; x: number; y: number; w: number; h: number; shape: Shape; dark: boolean; fade: number; meter: number }[] = [];
  const lat_span = DRAW_RADIUS_M / 111_320;
  const lon_span = lat_span / Math.cos((centre.lat * Math.PI) / 180);
  for (let i = 0; i < tuft.length; i += 1) {
    const t = tuft[i];
    if (Math.abs(t.lat - centre.lat) > lat_span || Math.abs(t.lon - centre.lon) > lon_span) continue;
    if (keep_clear.some((k) => meterBetween(k, t) < CLEAR_RADIUS_M)) continue;
    const meter = meterBetween(centre, t);
    if (meter > DRAW_RADIUS_M) continue;
    const plane = project(t);
    const at = toScreen(plane);
    if (at.scale <= 0) continue;
    /* Faded by distance, twice: the fog, and the edge of the draw radius, so
       neither the fog line nor the radius is a line a tree pops across. */
    const fade = (1 - fogOf(plane)) * Math.min(1, (DRAW_RADIUS_M - meter) / (DRAW_RADIUS_M * 0.25));
    if (fade < 0.03) continue;
    const shape = shapeOf(t, i);
    const h_m = heightOf(shape, t);
    const px_per_m = at.scale / Math.max(meter_per_pixel, 0.001);
    const h = Math.min(300, Math.max(16, h_m * px_per_m));
    const w = h * TOON_ASPECT[shape];
    if (at.x + w / 2 < 0 || at.x - w / 2 > width || at.y < projection.horizon.y || at.y - h > height) continue;
    drawn.push({ key: i, x: at.x, y: at.y, w, h, shape, dark: t.dark, fade, meter });
  }
  /* The nearest `MAX_DRAWN`, not the first found: past the cap it is the far,
     already faint ones that go. */
  if (drawn.length > MAX_DRAWN) drawn = drawn.sort((a, b) => a.meter - b.meter).slice(0, MAX_DRAWN);
  /* Painter's order, trees and finds together: further up the glass is
     further away, and paints first. */
  const standee: ({ kind: "tree"; tree: (typeof drawn)[number]; y: number } | { kind: "find"; find: GlassFind; y: number })[] = [
    ...drawn.map((tree) => ({ kind: "tree" as const, tree, y: tree.y })),
    ...find.map((f) => ({ kind: "find" as const, find: f, y: f.y })),
  ];
  standee.sort(byDepth);
  const walker_z = walker ? depthZ(walker.y) : 0;
  return (
    /* One stacking context for everything that stands: its z-index (5) puts
       the lot over the labels (4), the skyline (2) and the sky and fog (1);
       inside it each standee's own `depthZ` is the painter's order. */
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5 }}>
      {walker && (
        <div style={{ position: "absolute", left: 0, top: 0, zIndex: walker_z }}>{walker.node}</div>
      )}
      {children}
      {standee.map((s) => {
        if (s.kind === "find") {
          const f = s.find;
          /* A find in front of the walker and over them lets them show through,
             the same rule the trees below keep. */
          const is_find_over_walker = isOverWalker(f, walker);
          /* One just BEHIND them, inside their figure, and in reach — the toast
             is saying "tap it" — is lifted over the walker and drawn the same
             see-through way, so arriving at a find looks the same from either
             side instead of hiding it behind your own body. */
          const is_lifted = f.is_in_reach && isUnderWalker(f, walker);
          const opacity = is_find_over_walker || is_lifted ? 0.55 * (1 - f.fog) : 1 - f.fog;
          return (
            <div
              key={`find-${f.key}`}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                zIndex: is_lifted ? walker_z + 1 : depthZ(f.y),
                pointerEvents: f.fog > 0.6 ? "none" : "auto",
                opacity: opacity < 0.999 ? opacity : undefined,
              }}
            >
              {f.node}
            </div>
          );
        }
        const d = s.tree;
        /* A tree between the camera and the walker goes see-through where it
           would cover them. You never lose yourself behind scenery. */
        const is_over_walker = isOverWalker(d, walker);
        /* And the same for a find: a tree nearer the camera than a find, and
           over it, lets it show through. */
        const is_over_find = find.some((f) => isCovering(d, f));
        return (
        <div
          key={d.key}
          aria-hidden
          style={{
            position: "absolute",
            left: d.x - d.w / 2,
            top: d.y - d.h,
            width: d.w,
            height: d.h,
            zIndex: depthZ(d.y),
            /* A distant tree is a fogged one — see `fade`. */
            opacity: is_over_walker || is_over_find ? Math.min(0.4, d.fade) : d.fade < 0.999 ? d.fade : undefined,
          }}
        >
          <div className="fl-sway" style={{ width: "100%", height: "100%", animationDelay: `${-(d.key % 13) * 0.43}s` }}>
            <ToonPlant shape={d.shape} dark={d.dark} variant={d.key} is_night={is_night} />
          </div>
        </div>
        );
      })}
    </div>
  );
}
