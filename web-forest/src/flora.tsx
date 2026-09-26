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
 * the walker so a painted tree can never hide something you can tap.
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

interface Props {
  tuft: readonly Tuft[];
  projection: Projection;
  centre: LatLon;
  /** Finds and the walker: nothing is painted on top of these. */
  keep_clear: readonly LatLon[];
  walker_screen_y: number | null;
  walker_x: number | null;
  is_night: boolean;
}

export default function Flora({ tuft, projection, centre, keep_clear, walker_screen_y, walker_x, is_night }: Props) {
  const { project, toScreen, width, height, meter_per_pixel } = projection;
  const drawn: { key: number; x: number; y: number; w: number; h: number; shape: Shape; dark: boolean }[] = [];
  const lat_span = DRAW_RADIUS_M / 111_320;
  const lon_span = lat_span / Math.cos((centre.lat * Math.PI) / 180);
  for (let i = 0; i < tuft.length; i += 1) {
    const t = tuft[i];
    if (Math.abs(t.lat - centre.lat) > lat_span || Math.abs(t.lon - centre.lon) > lon_span) continue;
    if (keep_clear.some((k) => meterBetween(k, t) < CLEAR_RADIUS_M)) continue;
    const at = toScreen(project(t));
    if (at.scale <= 0) continue;
    const shape = shapeOf(t, i);
    const h_m = heightOf(shape, t);
    const px_per_m = at.scale / Math.max(meter_per_pixel, 0.001);
    const h = Math.min(300, Math.max(16, h_m * px_per_m));
    const w = h * TOON_ASPECT[shape];
    /* 0.36: the raked plane's far edge sits at about a third of the glass,
       under the haze. Past it there is no ground to stand a tree on, and one
       drawn there floats in the sky. */
    if (at.x + w / 2 < 0 || at.x - w / 2 > width || at.y < height * 0.36 || at.y - h > height) continue;
    drawn.push({ key: i, x: at.x, y: at.y, w, h, shape, dark: t.dark });
    if (drawn.length >= MAX_DRAWN) break;
  }
  /* Painter's order: further up the glass is further away. */
  drawn.sort((a, b) => a.y - b.y);
  return (
    /* No z-index, opacity or filter on this wrapper: any of them would make it
       a stacking context, and then no tree could stand in front of the walker. */
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }} aria-hidden>
      {drawn.map((d) => {
        const is_front = walker_screen_y !== null && d.y > walker_screen_y;
        /* A tree between the camera and the walker goes see-through where it
           would cover them. You never lose yourself behind scenery. */
        const is_over_walker =
          is_front && walker_x !== null && Math.abs(d.x - walker_x) < d.w / 2 + 40 && d.y - d.h < (walker_screen_y ?? 0);
        return (
        <div
          key={d.key}
          style={{
            position: "absolute",
            left: d.x - d.w / 2,
            top: d.y - d.h,
            width: d.w,
            height: d.h,
            /* In front of the walker when nearer the camera than them. */
            zIndex: is_front ? 7 : 5,
            /* A distant tree is also a hazier one. */
            opacity: is_over_walker ? 0.4 : Math.min(1, 0.55 + (d.y / height) * 0.6),
            filter: is_night ? "brightness(0.6) saturate(0.8) hue-rotate(14deg)" : undefined,
          }}
        >
          <div className="fl-sway" style={{ width: "100%", height: "100%", animationDelay: `${-(d.key % 13) * 0.43}s` }}>
            <ToonPlant shape={d.shape} dark={d.dark} variant={d.key} />
          </div>
        </div>
        );
      })}
    </div>
  );
}
