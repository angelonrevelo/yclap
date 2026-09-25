import { memo } from "react";

/**
 * The sky and the far distance above the raked ground.
 *
 * Until this, the band above the campus was a flat gradient, and a gradient
 * reads as "the map ends here" rather than as distance. The genre puts a
 * horizon there — hills and a far city — and the brand scene already draws
 * exactly that: sky, a pale city skyline, rolling green hills.
 *
 * It is not invented scenery, and the one fact it carries is WHERE things are.
 * The strip is a 360° panorama keyed to compass bearing, so turning the camera
 * turns the horizon with it, and the pieces sit where they really are from
 * Loyola Heights: the Sierra Madre foothills to the east over Marikina, the
 * Ortigas and Eastwood towers to the south and south-west, the Quezon City
 * skyline west. Shapes are schematic; directions are not.
 *
 * Night is the same strip under a darker sky, picked by the local hour or by
 * the weather reading's `is_day`.
 */

/** How many screen widths one full turn of the camera spans. ≈75° field of view. */
const TURN_SCREEN = 4.8;

type Band = { from: number; to: number; tall: number };

/** Compass bearing (degrees) → the landmark bands. Directions are real. */
const RANGE: Band[] = [
  { from: 40, to: 150, tall: 1 },
];
const CITY: Band[] = [
  { from: 150, to: 205, tall: 0.75 }, // Ortigas
  { from: 205, to: 235, tall: 0.55 }, // Cubao
  { from: 255, to: 315, tall: 0.85 }, // Quezon City towers
  { from: 60, to: 80, tall: 0.5 }, // Eastwood, under the hills
];

/** Deterministic noise so the skyline does not reshuffle per render. */
function hash(i: number): number {
  let h = (i * 2654435761) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507) >>> 0;
  return (h % 10000) / 10000;
}

/**
 * A periodic ridge line across [0, width]: sums of sines at integer turns, so
 * the path's two ends meet and the panorama wraps without a seam.
 */
function ridgePath(width: number, base: number, amp: number, harmonic: [number, number, number][], lift?: (deg: number) => number): string {
  const step = 12;
  let d = `M0 ${base + 400}`;
  /* Always land on x = width exactly, or the two tiles meet with a gap. */
  const xs: number[] = [];
  for (let x = 0; x < width; x += step) xs.push(x);
  xs.push(width);
  for (const x of xs) {
    const t = (x / width) * Math.PI * 2;
    let y = 0;
    for (const [k, a, p] of harmonic) y += Math.sin(t * k + p) * a;
    const deg = (x / width) * 360;
    y = base - y * amp - (lift ? lift(deg) : 0);
    d += ` L${x} ${y.toFixed(1)}`;
  }
  return `${d} L${width} ${base + 400} Z`;
}

function inBand(deg: number, band: Band[]): number {
  for (const b of band) {
    if (deg >= b.from && deg <= b.to) {
      const mid = (b.from + b.to) / 2;
      const half = (b.to - b.from) / 2;
      return b.tall * Math.cos(((deg - mid) / half) * (Math.PI / 2));
    }
  }
  return 0;
}

function cityRect(width: number, base: number, height: number): { x: number; y: number; w: number; h: number }[] {
  const out: { x: number; y: number; w: number; h: number }[] = [];
  for (let i = 0; i < 360; i += 1.6) {
    const tall = inBand(i, CITY);
    if (tall <= 0.05) continue;
    const n = hash(Math.round(i * 10));
    if (n < 0.28) continue;
    const w = (width / 360) * (0.9 + n * 1.2);
    const h = height * tall * (0.35 + n * 0.75);
    out.push({ x: (i / 360) * width, y: base - h, w, h });
  }
  return out;
}

interface Props {
  width: number;
  height: number;
  bearing_degree: number;
  is_night: boolean;
}

/** The panorama, drawn once per size and slid by bearing. */
const Panorama = memo(function Panorama({ tile_w, band_h, is_night }: { tile_w: number; band_h: number; is_night: boolean }) {
  const base = band_h;
  const tone = is_night
    ? { range: "#34507A", city: "#2B4470", window: "#F5C842", hill: "#2C4F5E", near: "#2A465E" }
    : { range: "#9CC6DA", city: "#A9CDEA", window: "", hill: "#A8DB78", near: "#8CCB62" };
  const range = ridgePath(tile_w, base - band_h * 0.18, band_h * 0.1, [[3, 1, 0.4], [7, 0.6, 1.3], [13, 0.3, 2.1]], (deg) =>
    inBand(deg, RANGE) * band_h * 0.42,
  );
  const hill = ridgePath(tile_w, base - band_h * 0.05, band_h * 0.12, [[5, 1, 0.2], [9, 0.7, 2.4], [17, 0.25, 1.1]]);
  const near = ridgePath(tile_w, base + band_h * 0.08, band_h * 0.09, [[4, 1, 1.7], [11, 0.6, 0.3], [19, 0.3, 2.9]]);
  const city = cityRect(tile_w, base - band_h * 0.02, band_h * 0.62);
  return (
    <svg width={tile_w} height={band_h + 60} viewBox={`0 0 ${tile_w} ${band_h + 60}`} style={{ display: "block", marginRight: -1 }}>
      <path d={range} fill={tone.range} opacity={is_night ? 0.9 : 0.85} />
      <g fill={tone.city} opacity={is_night ? 0.95 : 0.8}>
        {city.map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={1.5} />
        ))}
      </g>
      {is_night && (
        <g fill={tone.window} opacity={0.75}>
          {city
            .filter((_, i) => hash(i + 77) > 0.55)
            .map((r, i) => (
              <rect key={i} x={r.x + r.w * 0.35} y={r.y + r.h * (0.2 + hash(i) * 0.4)} width={1.6} height={1.6} />
            ))}
        </g>
      )}
      <path d={hill} fill={tone.hill} />
      <path d={near} fill={tone.near} />
    </svg>
  );
});

const CLOUD = [
  { top: 5, left: 8, scale: 1, duration: 140 },
  { top: 11, left: 52, scale: 0.7, duration: 190 },
  { top: 3, left: 78, scale: 0.85, duration: 165 },
];

export default function Horizon({ width, height, bearing_degree, is_night }: Props) {
  if (width <= 0 || height <= 0) return null;
  const tile_w = Math.round(width * TURN_SCREEN);
  /* The ridge sits where the rake's haze used to start: the top fifth of the glass. */
  const band_h = Math.round(height * 0.2);
  const shift = (((width / 2 - (bearing_degree / 360) * tile_w) % tile_w) + tile_w) % tile_w;
  const sky = is_night
    ? "linear-gradient(180deg, #0F1E3F 0%, #1D3561 12%, #33507E 20%, rgba(51,80,126,0.55) 26%, rgba(51,80,126,0) 34%)"
    : "linear-gradient(180deg, #5FB6F0 0%, #9ED4F8 10%, #CDEBFF 18%, rgba(226,244,230,0.85) 24%, rgba(214,238,206,0.4) 29%, rgba(214,238,206,0) 35%)";
  return (
    /* zIndex 3: over the skyline (1–2), under labels, trees and the walker. */
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 3 }} aria-hidden>
      <div style={{ position: "absolute", inset: 0, background: sky }} />
      {!is_night && (
        <div
          style={{
            position: "absolute",
            left: "-10%",
            top: "-12%",
            width: "70%",
            height: "40%",
            background: "radial-gradient(closest-side, rgba(255,248,214,0.85), rgba(255,248,214,0))",
          }}
        />
      )}
      {is_night && (
        <div style={{ position: "absolute", inset: "0 0 auto 0", height: "22%" }}>
          {Array.from({ length: 34 }, (_, i) => (
            <span
              key={i}
              style={{
                position: "absolute",
                left: `${(hash(i + 5) * 100).toFixed(2)}%`,
                top: `${(hash(i + 911) * 100).toFixed(2)}%`,
                width: hash(i + 3) > 0.8 ? 2.4 : 1.4,
                height: hash(i + 3) > 0.8 ? 2.4 : 1.4,
                borderRadius: 999,
                background: "#FFF6DC",
                opacity: 0.4 + hash(i + 51) * 0.5,
              }}
            />
          ))}
        </div>
      )}
      {CLOUD.map((c, i) => (
        <svg
          key={i}
          className="hz-cloud"
          width={120 * c.scale}
          height={44 * c.scale}
          viewBox="-84 -48 168 70"
          style={{
            position: "absolute",
            top: `${c.top}%`,
            left: `${c.left}%`,
            opacity: is_night ? 0.18 : 0.95,
            animation: `hz-cloud ${c.duration}s linear ${-i * 40}s infinite alternate`,
          }}
        >
          <path d="M-60,20 C-80,20 -84,-4 -64,-8 C-66,-30 -36,-38 -24,-22 C-18,-46 22,-48 28,-20 C44,-32 70,-18 60,2 C80,4 78,20 60,20 Z" fill="#fff" />
          <path d="M-60,20 C-70,20 -76,12 -72,6 C-50,14 20,14 74,8 C76,16 70,20 60,20 Z" fill="#AADCFC" opacity="0.7" />
        </svg>
      ))}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: height * 0.06,
          display: "flex",
          transform: `translateX(${(shift - tile_w).toFixed(1)}px)`,
          willChange: "transform",
        }}
      >
        <Panorama tile_w={tile_w} band_h={band_h} is_night={is_night} />
        <Panorama tile_w={tile_w} band_h={band_h} is_night={is_night} />
      </div>
      {/* Haze: the far ground dissolves into the hills instead of meeting
          them at a line. Clear at both edges and thickest in the middle, so
          neither the ridge nor the ground gets a ruled border. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          top: height * 0.2,
          height: height * 0.22,
          /* Opaque across 0.29–0.34 of the glass, where the raked plane's far
             edge lands, so that edge is never a ruled line. */
          background: is_night
            ? "linear-gradient(180deg, rgba(44,62,96,0) 0%, rgba(44,62,96,1) 40%, rgba(44,62,96,1) 66%, rgba(44,62,96,0) 100%)"
            : "linear-gradient(180deg, rgba(206,236,190,0) 0%, rgba(206,236,190,1) 40%, rgba(210,237,198,1) 66%, rgba(214,238,206,0) 100%)",
        }}
      />
      <style>{`
        @keyframes hz-cloud { from { transform: translateX(-40px) } to { transform: translateX(40px) } }
        @media (prefers-reduced-motion: reduce) { .hz-cloud { animation: none !important } }
      `}</style>
    </div>
  );
}
