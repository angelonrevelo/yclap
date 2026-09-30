import { memo } from "react";

/**
 * The sky above the raked ground, ending at the REAL horizon.
 *
 * The horizon is a distance, not a place on the glass: the camera draws the
 * world out to its view distance (`viewAheadPx` in `camera-feel.ts`), the
 * ground fades into the horizon colour over the last stretch of it, and the sky
 * begins exactly where that distance lands on screen — `horizon_y`, computed
 * from the same projection the ground uses. Tilt the camera up and the horizon
 * comes down the glass; zoom out and you see further before it.
 *
 * Until 10-01 this was a painted panorama — schematic hills and a skyline —
 * over a haze band pinned at 20–42 % of the screen whatever the camera did. It
 * covered ground that was really only 100–400 m away and read as a gradient
 * shadow over the map (Gelo, 10-01: "in the real pokemon go, they use the
 * actual distance as the horizon"). It is gone; nothing here is scenery.
 *
 * Painted UNDER the buildings and trees (they fade by their own distance —
 * `fogAt`), and over the ground plane.
 */

interface Props {
  width: number;
  height: number;
  /** Screen y of the view distance: sky above, ground below. Null on the flat camera. */
  horizon_y: number | null;
  /** Screen y where the fog starts, lower on the glass than `horizon_y`. */
  fog_start_y: number | null;
  is_night: boolean;
}

/** Deterministic noise so the stars do not reshuffle per render. */
function hash(i: number): number {
  let h = (i * 2654435761) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507) >>> 0;
  return (h % 10000) / 10000;
}

/** Sky top, and the horizon colour the far ground fades into. */
export const SKY_TONE = {
  day: { top: "#4FA9EC", mid: "#9ED4F8", horizon: "#DCEFF7" },
  night: { top: "#0B1733", mid: "#1D3561", horizon: "#3A5378" },
} as const;

const CLOUD = [
  { top: 0.18, left: 8, scale: 1, duration: 140 },
  { top: 0.42, left: 52, scale: 0.7, duration: 190 },
  { top: 0.08, left: 78, scale: 0.85, duration: 165 },
];

/** The sky's decoration: stars, clouds, the sun's glow. Only when there is sky to put it in. */
const SkyDecoration = memo(function SkyDecoration({ band, is_night }: { band: number; is_night: boolean }) {
  return (
    <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: band, overflow: "hidden" }}>
      {!is_night && (
        <div
          style={{
            position: "absolute",
            left: "-10%",
            top: -band * 0.6,
            width: "70%",
            height: band * 1.8,
            background: "radial-gradient(closest-side, rgba(255,248,214,0.7), rgba(255,248,214,0))",
          }}
        />
      )}
      {is_night &&
        Array.from({ length: 34 }, (_, i) => (
          <span
            key={i}
            style={{
              position: "absolute",
              left: `${(hash(i + 5) * 100).toFixed(2)}%`,
              top: `${(hash(i + 911) * 90).toFixed(2)}%`,
              width: hash(i + 3) > 0.8 ? 2.4 : 1.4,
              height: hash(i + 3) > 0.8 ? 2.4 : 1.4,
              borderRadius: 999,
              background: "#FFF6DC",
              opacity: 0.4 + hash(i + 51) * 0.5,
            }}
          />
        ))}
      {band > 70 &&
        CLOUD.map((c, i) => (
          <svg
            key={i}
            className="hz-cloud"
            width={120 * c.scale}
            height={44 * c.scale}
            viewBox="-84 -48 168 70"
            style={{
              position: "absolute",
              top: band * c.top,
              left: `${c.left}%`,
              opacity: is_night ? 0.18 : 0.95,
              animation: `hz-cloud ${c.duration}s linear ${-i * 40}s infinite alternate`,
            }}
          >
            <path d="M-60,20 C-80,20 -84,-4 -64,-8 C-66,-30 -36,-38 -24,-22 C-18,-46 22,-48 28,-20 C44,-32 70,-18 60,2 C80,4 78,20 60,20 Z" fill="#fff" />
            <path d="M-60,20 C-70,20 -76,12 -72,6 C-50,14 20,14 74,8 C76,16 70,20 60,20 Z" fill="#AADCFC" opacity="0.7" />
          </svg>
        ))}
      <style>{`
        @keyframes hz-cloud { from { transform: translateX(-40px) } to { transform: translateX(40px) } }
        @media (prefers-reduced-motion: reduce) { .hz-cloud { animation: none !important } }
      `}</style>
    </div>
  );
});

export default function Horizon({ width, height, horizon_y, fog_start_y, is_night }: Props) {
  if (width <= 0 || height <= 0 || horizon_y === null || fog_start_y === null) return null;
  /* The horizon above the glass: all of the view is ground, and only the fog
     band — if it reaches onto the screen — is drawn. */
  const tone = is_night ? SKY_TONE.night : SKY_TONE.day;
  const h = Math.round(horizon_y);
  const f = Math.max(h + 1, Math.round(fog_start_y));
  if (f <= 0) return null;
  const sky = h > 0 ? `${tone.top} 0px, ${tone.mid} ${Math.round(h * 0.55)}px, ${tone.horizon} ${h}px, ` : "";
  const background = `linear-gradient(180deg, ${sky}${tone.horizon} ${Math.max(h, 0)}px, ${hexA(tone.horizon, 0)} ${f}px)`;
  return (
    /* zIndex 0: over the ground plane, under the buildings (1–2), trees and walker. */
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }} aria-hidden>
      <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: f, background }} />
      {h > 24 && <SkyDecoration band={h} is_night={is_night} />}
    </div>
  );
}

/** `#rrggbb` with an alpha, for the transparent end of the fog. */
function hexA(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
