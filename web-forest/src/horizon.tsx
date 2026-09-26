import { memo } from "react";
import { aheadOfRow, facingOf, fogOfAhead, FOG_FAR_H, FOG_NEAR_H, groundScreen } from "./tile-map";

/**
 * The sky and the far distance above the raked ground.
 *
 * Until this, the band above the campus was a flat gradient, and a gradient
 * reads as "the map ends here" rather than as distance. The genre puts a
 * horizon there — hills and a far city — and the brand scene already draws
 * exactly that: sky, a pale city skyline, rolling green hills.
 *
 * It is not invented scenery, and the one fact it carries is WHERE things are.
 * The silhouette is a 360° panorama keyed to compass bearing, so turning the
 * camera turns the horizon with it, and the pieces sit where they really are
 * from Loyola Heights: the Sierra Madre foothills to the east over Marikina,
 * the Ortigas and Eastwood towers to the south and south-west, the Quezon City
 * skyline west. Shapes are schematic; directions are not.
 *
 * One projection, not a decal. The camera is left exactly as it is; the sky
 * follows it. The world ends `FOG_FAR_H` ahead of the walker — a straight row
 * on the glass, found with `groundScreen`, the plane's own arithmetic — and
 * the panorama stands on that row at infinity: a bearing `δ` off the way the
 * ground faces lands at `F·tan δ`, where `F` is that distance times its
 * perspective scale, i.e. exactly the rate the far ground turns at on the
 * centre line (within ~10 % at a phone's edge, inside solid fog). Tilting
 * moves the row, and the hills with it. It used to be a strip slid by a
 * hard-coded 75° field of view at a fixed 6–26 % of the glass, keyed to the
 * bearing with the opposite sign to the ground, so the two slid past each
 * other on every turn. There are no tiles, so there is no seam and no wrap to
 * get wrong at 359° → 0°. Sun, clouds and stars ride the same mapping.
 *
 * The sky is opaque down to that row, so no ground past the edge ghosts
 * through it. The fog is by DISTANCE: each ground row gets the opacity
 * `fogOfAhead` gives the distance it shows, and the standees fade by the same
 * rule (`projection.fogOf`) — nothing is sliced by a screen-aligned slab.
 *
 * Night is the same scene under a darker sky, picked by the local hour or by
 * the weather reading's `is_day`.
 */

const DEG = Math.PI / 180;

/** A bearing further than this off the centre line is not on the glass. */
const EDGE_DEGREE = 80;

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

/** −180…180. */
function signedDegree(degree: number): number {
  return ((((degree + 180) % 360) + 360) % 360) - 180;
}

/** 0…360. */
function compassDegree(degree: number): number {
  return ((degree % 360) + 360) % 360;
}

/**
 * A ridge's height above the horizon, in degrees of elevation, at a compass
 * bearing. Sums of sines at integer turns, so it is periodic and 359° meets 0°.
 */
type Ridge = { base: number; amp: number; harmonic: [number, number, number][]; lift?: (deg: number) => number };

const RIDGE_RANGE: Ridge = {
  base: 1.5,
  amp: 0.7,
  harmonic: [[3, 1, 0.4], [7, 0.6, 1.3], [13, 0.3, 2.1]],
  lift: (deg) => inBand(deg, RANGE) * 4.2,
};
const RIDGE_HILL: Ridge = { base: 0.55, amp: 0.8, harmonic: [[5, 1, 0.2], [9, 0.7, 2.4], [17, 0.25, 1.1]] };
const RIDGE_NEAR: Ridge = { base: -0.1, amp: 0.45, harmonic: [[4, 1, 1.7], [11, 0.6, 0.3], [19, 0.3, 2.9]] };

function ridgeAt(r: Ridge, deg: number): number {
  const t = deg * DEG;
  let y = 0;
  for (const [k, a, p] of r.harmonic) y += Math.sin(t * k + p) * a;
  return r.base + y * r.amp + (r.lift ? r.lift(compassDegree(deg)) : 0);
}

/** City blocks, in bearing and elevation degrees. Built once. */
const CITY_BLOCK: { az: number; w: number; h: number; lit: boolean; lit_at: number }[] = (() => {
  const out: { az: number; w: number; h: number; lit: boolean; lit_at: number }[] = [];
  for (let i = 0; i < 360; i += 1.6) {
    const tall = inBand(i, CITY);
    if (tall <= 0.05) continue;
    const n = hash(Math.round(i * 10));
    if (n < 0.28) continue;
    out.push({ az: i, w: 0.9 + n * 1.2, h: 3.4 * tall * (0.35 + n * 0.75), lit: hash(out.length + 77) > 0.55, lit_at: 0.2 + hash(out.length) * 0.4 });
  }
  return out;
})();

/** Clouds on the dome: bearing, elevation (degrees), size, drift period. */
const CLOUD = [
  { az: 12, elev: 7, scale: 1, duration: 140 },
  { az: 48, elev: 11, scale: 0.7, duration: 190 },
  { az: 95, elev: 5, scale: 0.85, duration: 165 },
  { az: 140, elev: 9, scale: 1.1, duration: 150 },
  { az: 188, elev: 6, scale: 0.75, duration: 175 },
  { az: 226, elev: 12, scale: 0.9, duration: 160 },
  { az: 262, elev: 7.5, scale: 1, duration: 185 },
  { az: 305, elev: 10, scale: 0.8, duration: 145 },
  { az: 338, elev: 5.5, scale: 0.95, duration: 170 },
];

const STAR = Array.from({ length: 180 }, (_, i) => ({
  az: hash(i + 5) * 360,
  elev: 1.5 + Math.pow(hash(i + 911), 0.8) * 34,
  size: hash(i + 3) > 0.8 ? 2.4 : 1.4,
  opacity: 0.4 + hash(i + 51) * 0.5,
}));

interface Props {
  width: number;
  height: number;
  bearing_degree: number;
  tilt_degree: number;
  is_night: boolean;
}

const TONE = {
  day: {
    sky: ["#4FA8EC", "#86C9F6", "#BCE2F6", "#D2EBF1"],
    fog: "208,233,238",
    range: "#A3CCDD",
    city: "#B0D2EA",
    window: "",
    hill: "#A6D58A",
    near: "#9BCB86",
  },
  night: {
    sky: ["#0B1735", "#172C56", "#2A4674", "#2F4C78"],
    fog: "46,70,108",
    range: "#34507A",
    city: "#2B4470",
    window: "#F5C842",
    hill: "#2C4F5E",
    near: "#2E4E62",
  },
};

function Horizon({ width, height, bearing_degree, tilt_degree, is_night }: Props) {
  if (width <= 0 || height <= 0 || !tilt_degree) return null;
  const tone = is_night ? TONE.night : TONE.day;
  const fog = (a: number) => `rgba(${tone.fog},${a.toFixed(3)})`;
  const facing = facingOf(bearing_degree);
  const far = FOG_FAR_H * height;
  const edge = groundScreen(0, -far, width, height, tilt_degree, 0);
  if (!edge) return null;
  const horizon_y = edge.y;
  const focal = far * edge.scale;
  const ppd = focal * DEG;
  const cx = width / 2;
  const xOf = (az: number): number | null => {
    const d = signedDegree(az - facing);
    if (Math.abs(d) >= EDGE_DEGREE) return null;
    return cx + focal * Math.tan(d * DEG);
  };
  /* Silhouettes, sampled across the glass: the bearing at a screen x is the
     inverse of `xOf`. */
  const ridge = (r: Ridge): string => {
    const step = 6;
    const base = (horizon_y + 3).toFixed(1);
    let d = `M-2 ${base}`;
    for (let x = -2; x <= width + step; x += step) {
      const az = facing + Math.atan((x - cx) / focal) / DEG;
      d += ` L${x} ${(horizon_y - ridgeAt(r, az) * ppd).toFixed(1)}`;
    }
    return `${d} L${width + step} ${base} Z`;
  };

  const city: { x: number; y: number; w: number; h: number; lit: boolean; lit_at: number }[] = [];
  for (const b of CITY_BLOCK) {
    const x0 = xOf(b.az);
    const x1 = xOf(b.az + b.w);
    if (x0 === null || x1 === null || x1 < 0 || x0 > width) continue;
    const h = b.h * ppd;
    city.push({ x: x0, y: horizon_y - 0.1 * ppd - h, w: Math.max(1, x1 - x0), h: h + 0.1 * ppd + 3, lit: b.lit, lit_at: b.lit_at });
  }

  /* Distance fog on the ground: one stop per sampled row, at the opacity the
     distance that row shows is fogged to. A flat plane's row IS its depth, so
     this is exact; the standees fade by the same `fogOfAhead`. */
  const near_y = groundScreen(0, -FOG_NEAR_H * height, width, height, tilt_degree, 0)?.y ?? horizon_y;
  const fog_top = horizon_y - 0.6 * ppd;
  const fog_stop: string[] = [];
  const N = 14;
  for (let i = 0; i <= N; i += 1) {
    const y = fog_top + ((near_y - fog_top) * i) / N;
    /* Above the edge row the veil softens the foot of the hills. */
    const a = y <= horizon_y ? 0.9 * (1 - (horizon_y - y) / (0.6 * ppd)) : fogOfAhead(aheadOfRow(y, height, tilt_degree), height);
    fog_stop.push(`${fog(Math.max(0, Math.min(1, a)))} ${((i / N) * 100).toFixed(1)}%`);
  }

  const sun_x = !is_night ? xOf(new Date().getHours() < 12 ? 105 : 255) : null;
  const sky = `linear-gradient(180deg, ${tone.sky[0]} 0%, ${tone.sky[1]} 50%, ${tone.sky[2]} 85%, ${tone.sky[3]} 100%)`;

  return (
    /* zIndex 1: over the ground plane, under the skyline (2), the labels (4)
       and every standee (5). The standees fade by their own distance. */
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "clip", zIndex: 1 }} aria-hidden>
      {/* Opaque down to the world's edge: past it there is no ground, and a
          see-through sky let the far plane ghost through above the hills. */}
      {horizon_y > 0 && (
        <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: horizon_y + 2, background: sky }} />
      )}
      {sun_x !== null && (
        <div
          style={{
            position: "absolute",
            left: sun_x - width * 0.45,
            top: horizon_y - 14 * ppd - height * 0.14,
            width: width * 0.9,
            height: height * 0.28,
            background: "radial-gradient(closest-side, rgba(255,248,214,0.85), rgba(255,248,214,0))",
          }}
        />
      )}
      {is_night &&
        STAR.map((st, i) => {
          const x = xOf(st.az);
          const y = horizon_y - st.elev * ppd;
          if (x === null || x < 0 || x > width || y < 0) return null;
          return (
            <span
              key={i}
              style={{ position: "absolute", left: x, top: y, width: st.size, height: st.size, borderRadius: 999, background: "#FFF6DC", opacity: st.opacity }}
            />
          );
        })}
      {CLOUD.map((c, i) => {
        const x = xOf(c.az);
        const w = 120 * c.scale;
        const h = 44 * c.scale;
        if (x === null) return null;
        const y = horizon_y - c.elev * ppd - h;
        if (x < -w - 60 || x > width + w + 60 || y + h < 0) return null;
        return (
          <div key={i} style={{ position: "absolute", left: x - w / 2, top: y }}>
            <svg
              className="hz-cloud"
              width={w}
              height={h}
              viewBox="-84 -48 168 70"
              style={{
                display: "block",
                opacity: is_night ? 0.18 : 0.95,
                /* Its own slow drift on top of the turn: the dome is still, the weather is not. */
                animation: `hz-cloud ${c.duration}s linear ${-i * 40}s infinite alternate`,
              }}
            >
              <path d="M-60,20 C-80,20 -84,-4 -64,-8 C-66,-30 -36,-38 -24,-22 C-18,-46 22,-48 28,-20 C44,-32 70,-18 60,2 C80,4 78,20 60,20 Z" fill="#fff" />
              <path d="M-60,20 C-70,20 -76,12 -72,6 C-50,14 20,14 74,8 C76,16 70,20 60,20 Z" fill="#AADCFC" opacity="0.7" />
            </svg>
          </div>
        );
      })}
      {/* Only as tall as the tallest ridge: repainted on every turn. */}
      {(() => {
        const band_top = horizon_y - 7.6 * ppd;
        const band_h = Math.max(1, Math.ceil(horizon_y + 6 - band_top));
        return (
          <svg
            width={width}
            height={band_h}
            viewBox={`0 ${band_top.toFixed(1)} ${width} ${band_h}`}
            style={{ position: "absolute", left: 0, top: band_top, display: "block" }}
          >
            <path d={ridge(RIDGE_RANGE)} fill={tone.range} opacity={is_night ? 0.9 : 0.85} />
            <g fill={tone.city} opacity={is_night ? 0.95 : 0.8}>
              {city.map((r, i) => (
                <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} rx={1.5} />
              ))}
            </g>
            {is_night && (
              <g fill={tone.window} opacity={0.75}>
                {city
                  .filter((r) => r.lit)
                  .map((r, i) => (
                    <rect key={i} x={r.x + r.w * 0.35} y={r.y + r.h * r.lit_at} width={1.6} height={1.6} />
                  ))}
              </g>
            )}
            <path d={ridge(RIDGE_HILL)} fill={tone.hill} />
            <path d={ridge(RIDGE_NEAR)} fill={tone.near} />
          </svg>
        );
      })()}
      {near_y > fog_top && (
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: fog_top,
            height: near_y - fog_top,
            background: `linear-gradient(180deg, ${fog_stop.join(", ")})`,
          }}
        />
      )}
      <style>{`
        @keyframes hz-cloud { from { transform: translateX(-40px) } to { transform: translateX(40px) } }
        @media (prefers-reduced-motion: reduce) { .hz-cloud { animation: none !important } }
      `}</style>
    </div>
  );
}

export default memo(Horizon);
