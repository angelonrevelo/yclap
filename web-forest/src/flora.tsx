import { memo } from "react";
import type { LatLon } from "./geo";
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
const MAX_DRAWN = 90;

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

const Glyph = memo(function Glyph({ shape, dark }: { shape: Shape; dark: boolean }) {
  const back = dark ? "#2F7A3A" : "#3E9A4A";
  const front = dark ? "#4FA84A" : "#6CC04F";
  const lit = dark ? "#7CC84A" : "#9BDB6A";
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
        <rect x="26" y="84" width="8" height="34" rx="3" fill="#8A5A34" />
        <path d="M30 4 Q52 30 50 62 Q56 88 30 94 Q4 88 10 62 Q8 30 30 4 Z" fill={back} />
        <path d="M30 18 Q46 38 44 62 Q48 82 30 86 Q16 82 18 62 Q16 38 30 18 Z" fill={front} />
        <path d="M24 36 Q28 28 34 30" fill="none" stroke={lit} strokeWidth="4" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 100 110" width="100%" height="100%" preserveAspectRatio="none" style={{ display: "block", overflow: "visible" }}>
      <ellipse cx="50" cy="107" rx="30" ry="5" fill="rgba(20,60,30,0.24)" />
      <path d="M44 106 L46 66 Q40 58 32 56 L36 52 Q44 56 48 60 L50 48 L54 48 L54 62 Q60 54 68 54 L68 58 Q58 62 56 70 L58 106 Z" fill="#8A5A34" />
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
    const h = Math.min(260, Math.max(10, h_m * px_per_m));
    const w = h * (shape === "bush" ? 1.7 : shape === "tall" ? 0.5 : 0.9);
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
            filter: is_night ? "brightness(0.62) saturate(0.85)" : undefined,
          }}
        >
          <Glyph shape={d.shape} dark={d.dark} />
        </div>
        );
      })}
    </div>
  );
}
