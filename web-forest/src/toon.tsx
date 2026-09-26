import { memo, type ReactNode } from "react";

/**
 * The toon kit: map assets drawn as VOLUMES, in the brand's cartoon hand.
 *
 * The genre's map props (the stop cube, the ball, the gym) are small 3D
 * objects with a toy-like read: a clean outline, a hard-edged shadow band on
 * the side away from the light, one glossy highlight, and almost no cast
 * shadow. That is cel shading, and it needs no renderer — every piece here is
 * SVG built from the same three passes:
 *
 *   1. the OUTLINE, drawn once for the whole silhouette underneath everything
 *      (each part stroked thick, then the fills cover the inner half), so a
 *      tree made of five balls has one outline, not five;
 *   2. per part, back to front: the flat fill, then `toon-shade` — a radial
 *      gradient with a hard stop, which is the cel band — then `toon-light`;
 *   3. a small specular dot where the light hits the front part.
 *
 * The light comes from the upper left everywhere, matching the posters. The
 * outline is `non-scaling-stroke`, so a tree fifty metres away keeps the same
 * line weight as one at your feet — which is what makes a cartoon read as a
 * cartoon at every zoom instead of turning to mush.
 *
 * Shading is tone-independent (black and white at an alpha over any fill),
 * so a find orb in any taxon colour gets the same volume from one gradient.
 */

export const TOON_INK = "#1E4A2C";
const TRUNK_INK = "#4A2E17";

/** Mounted once per map. Every toon asset points at these ids. */
export const ToonDefs = memo(function ToonDefs() {
  return (
    <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden focusable="false">
      <defs>
        {/* The cel band: nothing over the lit two-thirds, then a hard step. */}
        <radialGradient id="toon-shade" cx="0.34" cy="0.28" r="0.84">
          <stop offset="0.6" stopColor="#0B2A18" stopOpacity="0" />
          <stop offset="0.615" stopColor="#0B2A18" stopOpacity="0.2" />
          <stop offset="1" stopColor="#0B2A18" stopOpacity="0.3" />
        </radialGradient>
        {/* A soft lift on the lit side, stepped at its edge too. */}
        <radialGradient id="toon-light" cx="0.32" cy="0.26" r="0.42">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.42" />
          <stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0.16" />
          <stop offset="0.57" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        {/* Cylinders — trunks, stalks. Lit left, stepped shadow right. */}
        <linearGradient id="toon-cyl" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.26" />
          <stop offset="0.34" stopColor="#FFFFFF" stopOpacity="0.06" />
          <stop offset="0.56" stopColor="#0B2A18" stopOpacity="0" />
          <stop offset="0.58" stopColor="#0B2A18" stopOpacity="0.24" />
          <stop offset="1" stopColor="#0B2A18" stopOpacity="0.32" />
        </linearGradient>
        {/* Roofs: a lit top edge fading out, so a flat roof reads as a lid. */}
        <linearGradient id="toon-roof" x1="0" x2="0.3" y1="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.55" />
          <stop offset="0.28" stopColor="#FFFFFF" stopOpacity="0.12" />
          <stop offset="0.3" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        {/* Glass: the find bubble's sheen. */}
        <linearGradient id="toon-glass" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.7" />
          <stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
      </defs>
    </svg>
  );
});

type Ball = [number, number, number];

/** Balls back to front: outline pass, then fill + cel + light per ball. */
function BallCluster({ ball, fill, ink = TOON_INK }: { ball: Ball[]; fill: string | string[]; ink?: string }) {
  const ordered = [...ball].sort((a, b) => a[1] - b[1]);
  const tone = (i: number) => (Array.isArray(fill) ? fill[i % fill.length] : fill);
  return (
    <>
      {ordered.map(([cx, cy, r], i) => (
        <circle key={`o${i}`} cx={cx} cy={cy} r={r} fill={ink} stroke={ink} strokeWidth={3.2} vectorEffect="non-scaling-stroke" />
      ))}
      {ordered.map(([cx, cy, r], i) => (
        <g key={`f${i}`}>
          <circle cx={cx} cy={cy} r={r} fill={tone(i)} />
          <circle cx={cx} cy={cy} r={r} fill="url(#toon-shade)" />
          <circle cx={cx} cy={cy} r={r} fill="url(#toon-light)" />
        </g>
      ))}
    </>
  );
}

function Specular({ x, y, s = 1 }: { x: number; y: number; s?: number }) {
  return (
    <g opacity={0.85}>
      <ellipse cx={x} cy={y} rx={5.2 * s} ry={3.4 * s} fill="#FFFFFF" transform={`rotate(-30 ${x} ${y})`} />
      <circle cx={x + 7 * s} cy={y + 3.5 * s} r={1.6 * s} fill="#FFFFFF" />
    </g>
  );
}

function Trunk({ d }: { d: string }) {
  return (
    <>
      <path d={d} fill="#9C6A3C" stroke={TRUNK_INK} strokeWidth={2.4} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <path d={d} fill="url(#toon-cyl)" />
    </>
  );
}

/** Contact shadow: a whisper, not a pool. The brief was "not too much shadow". */
function Contact({ cx, cy, rx }: { cx: number; cy: number; rx: number }) {
  return <ellipse cx={cx} cy={cy} rx={rx} ry={rx * 0.2} fill="rgba(16,48,28,0.14)" />;
}

export type ToonShape = "tree" | "tall" | "bush" | "palm" | "bloom";

/** Width over height for each shape's viewBox, so the billboard is never squashed. */
export const TOON_ASPECT: Record<ToonShape, number> = {
  tree: 100 / 120,
  bloom: 100 / 120,
  tall: 70 / 130,
  bush: 100 / 62,
  palm: 110 / 140,
};

const LEAF_LIGHT = ["#6CC456", "#5DBB4C", "#78C850", "#63BE58"];
const LEAF_DARK = ["#46A44A", "#3E9A4A", "#4FAE4A", "#379043"];

function Svg({ shape, children }: { shape: ToonShape; children: ReactNode }) {
  const box = { tree: "0 0 100 120", bloom: "0 0 100 120", tall: "0 0 70 130", bush: "0 0 100 62", palm: "0 0 110 140" }[shape];
  return (
    <svg viewBox={box} width="100%" height="100%" preserveAspectRatio="xMidYMax meet" style={{ display: "block", overflow: "visible" }}>
      {children}
    </svg>
  );
}

/** A campus tree, bush or palm in the toon hand. `variant` just picks a leaf tone. */
export const ToonPlant = memo(function ToonPlant({ shape, dark, variant }: { shape: ToonShape; dark: boolean; variant: number }) {
  const pool = dark ? LEAF_DARK : LEAF_LIGHT;
  const leaf = [pool[variant % pool.length], pool[(variant + 1) % pool.length]];

  if (shape === "bush") {
    return (
      <Svg shape="bush">
        <Contact cx={50} cy={58} rx={40} />
        <BallCluster
          ball={[
            [24, 38, 17],
            [76, 38, 17],
            [50, 28, 21],
            [37, 44, 14],
            [63, 44, 14],
          ]}
          fill={leaf}
        />
        <Specular x={42} y={16} s={0.8} />
      </Svg>
    );
  }

  if (shape === "tall") {
    return (
      <Svg shape="tall">
        <Contact cx={35} cy={126} rx={20} />
        <Trunk d="M31 127 L32.5 88 L37.5 88 L39 127 Z" />
        <BallCluster
          ball={[
            [35, 76, 20],
            [35, 50, 22],
            [35, 25, 17],
          ]}
          fill={leaf}
        />
        <Specular x={28} y={16} s={0.8} />
      </Svg>
    );
  }

  if (shape === "palm") {
    /* Fronds fan from the crown; each is a two-tone leaf with its own outline. */
    const frond = [-168, -140, -112, -68, -40, -12, -90];
    return (
      <Svg shape="palm">
        <Contact cx={52} cy={136} rx={20} />
        <path d="M48 137 C46 110 50 80 57 44" fill="none" stroke={TRUNK_INK} strokeWidth={11.5} strokeLinecap="round" />
        <path d="M48 137 C46 110 50 80 57 44" fill="none" stroke="#A8784A" strokeWidth={8} strokeLinecap="round" />
        <path d="M49.5 137 C47.5 110 51.5 80 58.5 44" fill="none" stroke="rgba(11,42,24,0.22)" strokeWidth={3} strokeLinecap="round" />
        {[62, 80, 98, 116].map((y) => (
          <path key={y} d={`M${44 + (137 - y) * 0.07} ${y} q5 -2.5 9 0`} fill="none" stroke={TRUNK_INK} strokeWidth={1.3} opacity={0.55} />
        ))}
        <g transform="translate(57 44)">
          {frond.map((a, i) => (
            <g key={a} transform={`rotate(${a})`}>
              <path d="M0 0 Q22 -13 50 4 Q24 -1 0 0 Z" fill={i % 2 ? leaf[0] : leaf[1]} stroke={TOON_INK} strokeWidth={2.2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
              <path d="M0 0 Q24 -1 50 4 Q26 5 0 0 Z" fill="rgba(11,42,24,0.22)" />
              <path d="M2 -0.5 Q24 -6 46 3" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth={1.2} />
            </g>
          ))}
          <circle r={6} fill="#7A5230" stroke={TRUNK_INK} strokeWidth={2} vectorEffect="non-scaling-stroke" />
          <circle cx={-2} cy={-2} r={2} fill="rgba(255,255,255,0.45)" />
        </g>
      </Svg>
    );
  }

  const is_bloom = shape === "bloom";
  return (
    <Svg shape={shape}>
      <Contact cx={50} cy={116} rx={26} />
      <Trunk d="M44.5 117 L46 74 Q40 68 33 67 L35 63 Q43 64 48 69 L49 60 L53 60 L53.5 70 Q59 63 67 63 L67.5 67 Q59 69 55.5 76 L56.5 117 Z" />
      <BallCluster
        ball={[
          [29, 56, 21],
          [71, 54, 21],
          [50, 35, 26],
          [40, 62, 17],
          [62, 63, 17],
        ]}
        fill={leaf}
      />
      <Specular x={40} y={20} />
      {is_bloom &&
        /* Plumeria, the posters' flower: five white petals, a gold eye. */
        [
          [30, 48],
          [58, 30],
          [72, 52],
          [46, 62],
          [40, 32],
        ].map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y}) rotate(${i * 23})`}>
            {[0, 72, 144, 216, 288].map((r) => (
              <ellipse key={r} cx={0} cy={-3.2} rx={2.3} ry={3.4} fill="#FFFDF4" stroke={TOON_INK} strokeWidth={0.7} transform={`rotate(${r})`} />
            ))}
            <circle r={1.5} fill="#F5C842" />
          </g>
        ))}
    </Svg>
  );
});

/**
 * A find, as a map prop: a glossy orb floating over a stalk and a ground disc.
 *
 * Unlogged finds are the bright one — an orb in the taxon's tone with the kind
 * mark in white — because the unlogged ones are what you are walking toward.
 * Once logged it turns to a pale orb with the mark in tone: still there,
 * clearly spent. Rarity is sparkles over the orb, a SHAPE count, so it holds
 * in greyscale like the rarity pill.
 */
export function ToonFind({
  tone,
  is_logged,
  sparkle,
  is_in_range,
  glyph,
  label,
  delay_s,
}: {
  tone: string;
  is_logged: boolean;
  sparkle: number;
  is_in_range: boolean;
  glyph: ReactNode;
  label: string;
  delay_s: number;
}) {
  const orb = is_logged ? "#F4F7EE" : tone;
  return (
    <svg className="pm-find" width="66" height="96" viewBox="0 0 66 96" style={{ overflow: "visible" }} aria-label={label}>
      {/* the ground disc: the one thing that sits IN the ground */}
      <ellipse cx="33" cy="89" rx="17" ry="5.2" fill={tone} opacity={0.22} />
      <ellipse cx="33" cy="89" rx="17" ry="5.2" fill="none" stroke={tone} strokeWidth="1.6" opacity={0.7} />
      {is_in_range && (
        <ellipse cx="33" cy="89" rx="26" ry="8" fill="none" stroke="#FFFFFF" strokeWidth="2.2" className="pm-find-ring" />
      )}
      {/* the stalk */}
      <rect x="30" y="52" width="6" height="37" rx="3" fill="#EDE7D8" stroke={TOON_INK} strokeWidth={2.2} vectorEffect="non-scaling-stroke" />
      <rect x="30" y="52" width="6" height="37" rx="3" fill="url(#toon-cyl)" />
      <g className="pm-find-head" style={{ animationDelay: `${delay_s}s` }}>
        <circle cx="33" cy="30" r="23" fill={TOON_INK} stroke={TOON_INK} strokeWidth={3.4} vectorEffect="non-scaling-stroke" />
        <circle cx="33" cy="30" r="23" fill={orb} />
        {/* a belt round the orb's equator: the toy seam that makes it read as an object */}
        <path d="M10.4 33 Q33 42 55.6 33" fill="none" stroke={is_logged ? tone : "rgba(255,255,255,0.55)"} strokeWidth="2.4" strokeLinecap="round" opacity={0.8} />
        <circle cx="33" cy="30" r="23" fill="url(#toon-shade)" />
        <circle cx="33" cy="30" r="23" fill="url(#toon-light)" />
        <g
          transform="translate(19.2 16.2) scale(1.15)"
          fill="none"
          stroke={is_logged ? tone : "#FFFFFF"}
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {glyph}
        </g>
        <Specular x={22} y={16} s={0.72} />
        {sparkle > 0 && (
          <g transform="translate(33 -4)">
            {Array.from({ length: sparkle }, (_, i) => {
              const x = (i - (sparkle - 1) / 2) * 12;
              return (
                <path
                  key={i}
                  transform={`translate(${x} 0)`}
                  d="M0 -7 Q1.2 -1.2 7 0 Q1.2 1.2 0 7 Q-1.2 1.2 -7 0 Q-1.2 -1.2 0 -7 Z"
                  fill={sparkle >= 3 ? "#F5C842" : "#F59A23"}
                  stroke={TOON_INK}
                  strokeWidth={1.6}
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </g>
        )}
      </g>
    </svg>
  );
}
