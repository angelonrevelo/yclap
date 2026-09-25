/**
 * Palette remap for the chess.com-style game icons — pure, no image library.
 *
 * The icons were drawn in chess.com's saturated reward palette. Gelo (09-25
 * note, 1:09–2:16) wants that icon SET back, but in Magisphere's colours. So
 * every coloured pixel keeps its lightness (the cel shading, the glint, the
 * shadow plane all live in lightness) and has its hue snapped towards the
 * nearest Magisphere brand hue, with saturation pulled part-way to that
 * brand colour's. Greys (the lock, the trophy base) and alpha are untouched.
 */

/** Source hue band → the brand colour it lands on (docs/brand/magisphere). */
export const band = [
  { from: 345, to: 375, hex: "#D8452F" }, // red → the app's --mg-red
  { from: 15, to: 38, hex: "#F59A23" }, // orange → Sparkle
  { from: 38, to: 62, hex: "#F5C842" }, // yellow → Sun
  { from: 62, to: 90, hex: "#7CC84A" }, // yellow-green → Sprout
  { from: 90, to: 165, hex: "#3E9A4A" }, // green → Leaf
  { from: 165, to: 200, hex: "#279CAD" }, // cyan → Lagoon
  { from: 200, to: 345, hex: "#2F80D8" }, // blue, and the rare purple → Blue
];

/** How much of a pixel's hue offset inside its band survives (0 = flat snap). */
export const HUE_KEEP = 0.25;
/** How far saturation moves towards the brand colour's own (0 = none). */
export const SAT_PULL = 0.6;
/** Below this saturation a pixel is a grey and is left alone. */
export const GREY_SAT = 0.12;
/**
 * Between GREY_SAT and this, the remap fades in. Without the ramp a near-grey
 * (the lock's steel, s ≈ 0.15) got pulled up to a blue's saturation pixel by
 * pixel, and the lock came out speckled.
 */
export const RAMP_SAT = 0.35;

export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb(h, s, l) {
  h = (((h % 360) + 360) % 360) / 360;
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const chan = (t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [chan(h + 1 / 3), chan(h), chan(h - 1 / 3)].map((v) => Math.round(v * 255));
}

/** The band a hue falls in; red wraps across 0°. */
export function bandOf(h) {
  const hue = h < 15 ? h + 360 : h;
  return band.find((b) => hue >= b.from && hue < b.to) ?? band[band.length - 1];
}

/** One pixel, RGB in → RGB out. */
export function remapPixel(r, g, b) {
  const [h, s, l] = rgbToHsl(r, g, b);
  if (s < GREY_SAT) return [r, g, b];
  const b_ = bandOf(h);
  const [th, ts] = rgbToHsl(...hexToRgb(b_.hex));
  const hue = h < 15 ? h + 360 : h;
  const center = (b_.from + b_.to) / 2;
  const w = Math.min(1, (s - GREY_SAT) / (RAMP_SAT - GREY_SAT));
  const nh = hue + (th + (hue - center) * HUE_KEEP - hue) * w;
  const ns = s + (ts - s) * SAT_PULL * w;
  return hslToRgb(nh, ns, l);
}

/** A whole RGBA buffer, in place. Fully transparent pixels are skipped. */
export function remapRgba(data) {
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const [r, g, b] = remapPixel(data[i], data[i + 1], data[i + 2]);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
  return data;
}
