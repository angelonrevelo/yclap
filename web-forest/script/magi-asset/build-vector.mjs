// build-vector.mjs — every Magisphere vector asset, drawn by code.
//
// The team's Canva posters (2026-09-23 drop, "magi/" on the MacBook) are the
// REFERENCE: a chunky deep-green-to-teal wordmark, a half-globe under a green
// orbit with leaves and an orange sparkle, sky + layered hills + a cream trail,
// wood signs, white plumeria. Nothing here is traced from them — the marks are
// rebuilt as geometry so they scale, recolour and never carry a generator's
// artefacts. The wordmark is Fredoka Bold turned into outlines (OFL, vendored in
// ./font), so the SVG renders identically on a machine with no fonts at all.
//
//   node script/magi-asset/build-vector.mjs      -> public/brand/magi/*.svg
//
// Deterministic: the scene's scatter is seeded, so a rebuild is a no-op diff.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import opentype from "opentype.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../public/brand/magi");
mkdirSync(out, { recursive: true });

const display = opentype.loadSync(path.join(here, "font/Fredoka-Bold.ttf"));
const body = opentype.loadSync(path.join(here, "font/Nunito-ExtraBold.ttf"));

/* The palette, sampled off the posters. Same hexes the sticker contract remaps to. */
export const color = {
  ink: "#0E3B2A",
  forest: "#114B2F",
  teal_deep: "#11646C",
  teal: "#279CAD",
  green: "#3E9A4A",
  leaf: "#7CC84A",
  lime: "#C8E88C",
  sky: "#AADCFC",
  sky_deep: "#58B8E8",
  blue: "#2F80D8",
  sun: "#F5C842",
  orange: "#F59A23",
  cream: "#FFF6DC",
  path: "#F3E3B5",
  wood: "#A8582C",
  wood_dark: "#6B3519",
  red: "#E8483A",
  white: "#FFFFFF",
};

const n = (v) => Math.round(v * 100) / 100;

/* ── primitives ─────────────────────────────────────────────────────────── */

/** A leaf pointing along +x from the origin, `len` long. */
function leafPath(len, fat = 0.36) {
  const w = len * fat;
  return `M0,0 C${n(len * 0.28)},${n(-w)} ${n(len * 0.78)},${n(-w * 0.9)} ${n(len)},0 C${n(len * 0.78)},${n(w * 0.9)} ${n(len * 0.28)},${n(w)} 0,0 Z`;
}

function leaf(x, y, len, deg, fill = color.leaf, shade = color.green, outline = color.ink, sw = len * 0.07) {
  return `<g transform="translate(${n(x)} ${n(y)}) rotate(${n(deg)})">
    <path d="${leafPath(len)}" fill="${fill}" stroke="${outline}" stroke-width="${n(sw)}" stroke-linejoin="round"/>
    <path d="M${n(len * 0.12)},${n(len * 0.05)} C${n(len * 0.4)},${n(len * 0.2)} ${n(len * 0.75)},${n(len * 0.14)} ${n(len * 0.92)},0 C${n(len * 0.7)},${n(len * 0.24)} ${n(len * 0.3)},${n(len * 0.26)} ${n(len * 0.12)},${n(len * 0.05)} Z" fill="${shade}"/>
    <path d="M${n(len * 0.1)},0 Q${n(len * 0.5)},${n(-len * 0.03)} ${n(len * 0.86)},0" fill="none" stroke="${outline}" stroke-width="${n(sw * 0.55)}" stroke-linecap="round"/>
  </g>`;
}

/** Four-point sparkle centred on the origin. */
function sparklePath(r, pinch = 0.2) {
  const p = r * pinch;
  return `M0,${n(-r)} Q${n(p)},${n(-p)} ${n(r)},0 Q${n(p)},${n(p)} 0,${n(r)} Q${n(-p)},${n(p)} ${n(-r)},0 Q${n(-p)},${n(-p)} 0,${n(-r)} Z`;
}

function sparkle(x, y, r, fill = color.orange, outline = null, sw = 0) {
  return `<path transform="translate(${n(x)} ${n(y)})" d="${sparklePath(r)}" fill="${fill}"${outline ? ` stroke="${outline}" stroke-width="${n(sw)}" stroke-linejoin="round"` : ""}/>`;
}

/** White plumeria: five overlapping petals round a yellow eye. */
function flower(x, y, r, rot = 0) {
  let petal = "";
  for (let i = 0; i < 5; i++) {
    petal += `<ellipse cx="0" cy="${n(-r * 0.55)}" rx="${n(r * 0.42)}" ry="${n(r * 0.6)}" transform="rotate(${n(i * 72 + rot)})" fill="${color.white}" stroke="${color.ink}" stroke-opacity="0.18" stroke-width="${n(r * 0.06)}"/>`;
  }
  return `<g transform="translate(${n(x)} ${n(y)})">${petal}<circle r="${n(r * 0.26)}" fill="${color.sun}"/></g>`;
}

function svg(w, h, inner, title, extra = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img"${extra}>
<title>${title}</title>
${inner}
</svg>
`;
}

/* ── the mark: half-globe, orbit, leaves, sparkle ───────────────────────── */

/** Drawn in a 240x170 box; the dome sits on y=150. */
function markInner(id = "m") {
  const cx = 120;
  const base = 150;
  const r = 78;
  const dome = `M${cx - r},${base} A${r},${r} 0 0 1 ${cx + r},${base} Z`;
  return `<defs>
    <linearGradient id="${id}-sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8ED3FA"/>
      <stop offset="0.6" stop-color="${color.sky_deep}"/>
      <stop offset="1" stop-color="${color.blue}"/>
    </linearGradient>
    <linearGradient id="${id}-orbit" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${color.leaf}"/>
      <stop offset="0.55" stop-color="${color.green}"/>
      <stop offset="1" stop-color="${color.teal}"/>
    </linearGradient>
    <clipPath id="${id}-dome"><path d="${dome}"/></clipPath>
  </defs>
  <path d="${dome}" fill="url(#${id}-sea)"/>
  <g clip-path="url(#${id}-dome)">
    <path d="M40,120 C58,104 76,112 88,100 C98,90 92,78 106,76 C120,74 124,90 116,104 C108,118 124,126 118,140 C112,154 84,152 70,156 L40,156 Z" fill="${color.leaf}"/>
    <path d="M40,138 C54,130 70,138 78,150 L40,156 Z" fill="${color.green}"/>
    <path d="M88,100 C98,90 92,78 106,76 C112,76 116,82 114,90 C104,86 96,94 88,100 Z" fill="${color.lime}"/>
    <path d="M140,96 C152,84 172,88 180,100 C190,112 204,112 206,130 L206,156 L162,156 C170,140 150,138 146,124 C142,112 132,106 140,96 Z" fill="${color.leaf}"/>
    <path d="M162,156 C170,140 150,138 146,124 C156,134 176,136 186,156 Z" fill="${color.green}"/>
    <path d="M132,60 C142,54 156,58 154,68 C150,76 136,76 132,60 Z" fill="${color.leaf}"/>
    <path d="M${cx - r + 14},${base - 50} C${cx - 40},${base - 72} ${cx + 20},${base - 90} ${cx + r - 20},${base - 60}" fill="none" stroke="${color.white}" stroke-opacity="0.45" stroke-width="5" stroke-linecap="round"/>
  </g>
  <path d="${dome}" fill="none" stroke="${color.ink}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M24,156 A98,92 0 0 1 206,86" fill="none" stroke="${color.white}" stroke-width="20" stroke-linecap="round"/>
  <path d="M24,156 A98,92 0 0 1 206,86" fill="none" stroke="url(#${id}-orbit)" stroke-width="11" stroke-linecap="round"/>
  ${leaf(204, 88, 44, -58)}
  ${leaf(206, 92, 38, 8, color.leaf, color.green)}
  ${leaf(30, 150, 26, -150, color.leaf, color.green)}
  ${leaf(30, 152, 22, 160, color.lime, color.leaf)}
  ${sparkle(188, 32, 20, color.white)}
  ${sparkle(188, 32, 15, color.orange)}
  ${sparkle(214, 58, 6, color.sun)}`;
}

/* ── the wordmark: Fredoka Bold outlines, a little bounce per letter ───── */

const bounce = [
  { dy: 0, deg: -4 },
  { dy: 6, deg: 3 },
  { dy: 2, deg: -2 },
  { dy: -2, deg: 4 },
  { dy: 4, deg: -3 },
  { dy: 0, deg: 2 },
  { dy: 3, deg: -4 },
  { dy: -1, deg: 3 },
  { dy: 4, deg: -2 },
  { dy: 0, deg: 5 },
];

/** Returns { d:[path per glyph], width, height } for `text` at `size`. */
function glyphRun(font, text, size, { track = 0, wobble = false } = {}) {
  const glyph = font.stringToGlyphs(text);
  const scale = size / font.unitsPerEm;
  let x = 0;
  const part = [];
  for (let i = 0; i < glyph.length; i++) {
    const g = glyph[i];
    const b = wobble ? bounce[i % bounce.length] : { dy: 0, deg: 0 };
    const adv = g.advanceWidth * scale;
    const p = g.getPath(0, 0, size);
    part.push({ d: p.toPathData(2), x, dy: b.dy * (size / 100), deg: b.deg, cx: adv / 2 });
    x += adv + track;
    if (i < glyph.length - 1) x += font.getKerningValue(g, glyph[i + 1]) * scale;
  }
  return { part, width: x - track };
}

function runSvg(run, baseline, x0 = 0, fill = null) {
  return run.part
    .map((p, i) => `<path${fill ? ` fill="${fill(i)}"` : ""} transform="translate(${n(x0 + p.x)} ${n(baseline + p.dy)}) rotate(${p.deg} ${n(p.cx)} ${n(-30)})" d="${p.d}"/>`)
    .join("\n    ");
}

function wordmarkInner({ id = "w", size = 120, x = 0, baseline = 120, tagline = true, light = false } = {}) {
  const run = glyphRun(display, "Magisphere", size, { track: size * 0.01, wobble: true });
  const glyph = runSvg(run, baseline, x);
  const outline = size * 0.2;
  const tag = glyphRun(body, "Rediscovering home.", size * 0.3);
  const tagX = x + (run.width - tag.width) / 2;
  const tagBase = baseline + size * 0.52;
  // the "é"-leaf over the last e — the posters' one flourish
  const lastE = run.part[run.part.length - 1];
  const ex = x + lastE.x + lastE.cx;
  const ey = baseline - size * 0.62;
  return {
    width: run.width,
    inner: `<defs>
    ${run.part
      .map(
        // Each glyph sits in its own translated space, so a userSpaceOnUse
        // gradient would restart at every letter. Shift it back per glyph.
        (p, i) => `<linearGradient id="${id}-fill${i}" gradientUnits="userSpaceOnUse" x1="${n(-p.x)}" y1="0" x2="${n(run.width - p.x)}" y2="0">
      <stop offset="0" stop-color="${color.forest}"/>
      <stop offset="0.3" stop-color="#1B6A45"/>
      <stop offset="0.62" stop-color="#15838C"/>
      <stop offset="0.84" stop-color="${color.teal_deep}"/>
      <stop offset="1" stop-color="#1E7A48"/>
    </linearGradient>`,
      )
      .join("\n    ")}
    <linearGradient id="${id}-shine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity="0.3"/>
      <stop offset="0.5" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <g fill="${color.white}" stroke="${color.white}" stroke-width="${n(outline)}" stroke-linejoin="round">
    ${glyph}
  </g>
  <g fill="${color.ink}" stroke="${color.ink}" stroke-width="${n(size * 0.045)}" stroke-linejoin="round">
    ${glyph}
  </g>
  <g>
    ${runSvg(run, baseline, x, (i) => `url(#${id}-fill${i})`)}
  </g>
  <g fill="url(#${id}-shine)">
    ${glyph}
  </g>
  ${leaf(ex - size * 0.04, ey, size * 0.26, -62, color.leaf, color.green, color.ink, size * 0.02)}
  ${leaf(x + size * 0.06, baseline - size * 0.2, size * 0.22, -150, color.leaf, color.green, color.ink, size * 0.018)}
  ${
    tagline
      ? `<g fill="${light ? color.white : color.forest}">
    ${runSvg(tag, tagBase, tagX)}
  </g>`
      : ""
  }`,
  };
}

/* ── lockups ────────────────────────────────────────────────────────────── */

function write(name, content) {
  writeFileSync(path.join(out, name), content);
  console.log(`wrote public/brand/magi/${name}`);
}

write("mark.svg", svg(240, 170, markInner("mark"), "Magisphere mark — a half-globe under a green orbit"));

{
  const w = wordmarkInner({ id: "wm", size: 120, x: 36, baseline: 130 });
  write(
    "wordmark.svg",
    svg(Math.ceil(w.width + 60), 210, w.inner, "Magisphere — Rediscovering home."),
  );
  const bare = wordmarkInner({ id: "wmb", size: 120, x: 36, baseline: 130, tagline: false });
  write("wordmark-bare.svg", svg(Math.ceil(bare.width + 60), 170, bare.inner, "Magisphere"));
}

{
  // stacked: the mark rides on the wordmark, the way every poster sets it
  const w = wordmarkInner({ id: "st", size: 120, x: 36, baseline: 250 });
  const W = Math.ceil(w.width + 76);
  const markScale = 1.05;
  const mx = W / 2 - 120 * markScale;
  write(
    "lockup-stacked.svg",
    svg(W, 330, `<g transform="translate(${n(mx)} 0) scale(${markScale})">${markInner("stm")}</g>\n${w.inner}`, "Magisphere — Rediscovering home."),
  );
  const light = wordmarkInner({ id: "stl", size: 120, x: 36, baseline: 250, light: true });
  write(
    "lockup-stacked-light.svg",
    svg(W, 330, `<g transform="translate(${n(mx)} 0) scale(${markScale})">${markInner("stlm")}</g>\n${light.inner}`, "Magisphere — Rediscovering home. (for dark or photo grounds)"),
  );
}

{
  const w = wordmarkInner({ id: "hz", size: 110, x: 200, baseline: 120 });
  write(
    "lockup-horizontal.svg",
    svg(Math.ceil(200 + w.width + 40), 190, `<g transform="translate(0 6) scale(0.78)">${markInner("hzm")}</g>\n${w.inner}`, "Magisphere — horizontal lockup"),
  );
}

/* ── app icon: the mark on a sky tile ───────────────────────────────────── */

function appIcon(id, maskable) {
  const pad = maskable ? 0.2 : 0.1;
  const s = (512 * (1 - pad * 2)) / 240;
  const tx = (512 - 240 * s) / 2;
  const ty = (512 - 170 * s) / 2 + 12;
  return svg(
    512,
    512,
    `<defs>
    <linearGradient id="${id}-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7FC8F5"/>
      <stop offset="0.62" stop-color="#E4F6FF"/>
      <stop offset="0.62" stop-color="${color.leaf}"/>
      <stop offset="1" stop-color="${color.green}"/>
    </linearGradient>
    <clipPath id="${id}-tile"><rect width="512" height="512" rx="${maskable ? 0 : 116}"/></clipPath>
  </defs>
  <g clip-path="url(#${id}-tile)">
  <rect width="512" height="512" fill="url(#${id}-sky)"/>
  <path d="M0,330 C120,300 200,340 290,322 C380,304 440,320 512,300 L512,512 L0,512 Z" fill="${color.leaf}"/>
  <path d="M0,392 C110,360 230,410 330,384 C420,362 470,380 512,372 L512,512 L0,512 Z" fill="${color.green}"/>
  </g>
  <g transform="translate(${n(tx)} ${n(ty)}) scale(${n(s)})">${markInner(`${id}-m`)}</g>`,
    "Magisphere app icon",
  );
}
write("app-icon.svg", appIcon("ai", false));
write("app-icon-maskable.svg", appIcon("aim", true));

/* ── ornaments ─────────────────────────────────────────────────────────── */

write("sparkle.svg", svg(64, 64, `<g transform="translate(32 32)"><path d="${sparklePath(30)}" fill="${color.white}"/><path d="${sparklePath(23)}" fill="${color.orange}"/></g>`, "Sparkle"));
write("flower.svg", svg(64, 64, flower(32, 32, 28), "Plumeria"));
write(
  "leaf-sprig.svg",
  svg(
    120,
    80,
    `${leaf(60, 70, 50, -120)}${leaf(60, 70, 54, -60, color.leaf, color.green)}${leaf(60, 70, 36, -90, color.lime, color.leaf)}`,
    "Leaf sprig",
  ),
);

/* A wood sign plank — the posters' START / FINISH boards and the slogan banner.
   Nine-slice friendly: the grain runs horizontally, the ends are the only
   detail, so CSS can stretch the middle. */
function plank(w, h, id) {
  const grain = [0.3, 0.52, 0.74]
    .map((f, i) => `<path d="M${18 + i * 22},${n(h * f)} C${n(w * 0.3)},${n(h * f - 3)} ${n(w * 0.6)},${n(h * f + 3)} ${w - 20 - i * 16},${n(h * f)}" fill="none" stroke="${color.wood_dark}" stroke-opacity="0.35" stroke-width="2.5" stroke-linecap="round"/>`)
    .join("");
  return `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C06C38"/><stop offset="1" stop-color="${color.wood}"/></linearGradient></defs>
  <rect x="3" y="3" width="${w - 6}" height="${h - 6}" rx="14" fill="url(#${id})" stroke="${color.wood_dark}" stroke-width="5"/>
  <path d="M14,10 L${w - 14},10" stroke="#fff" stroke-opacity="0.28" stroke-width="4" stroke-linecap="round"/>
  ${grain}
  <circle cx="18" cy="${h / 2}" r="4" fill="${color.wood_dark}"/><circle cx="${w - 18}" cy="${h / 2}" r="4" fill="${color.wood_dark}"/>`;
}
write("wood-plank.svg", svg(320, 76, plank(320, 76, "wp"), "Wood sign plank"));
write(
  "wood-sign.svg",
  svg(
    320,
    170,
    `<rect x="70" y="60" width="18" height="108" rx="4" fill="${color.wood_dark}"/><rect x="232" y="60" width="18" height="108" rx="4" fill="${color.wood_dark}"/>
  <g transform="translate(0 20)">${plank(320, 76, "ws")}</g>
  <path d="M40,168 Q60,140 72,168 M240,168 Q262,138 280,168" fill="${color.leaf}" stroke="${color.green}" stroke-width="3"/>`,
    "Wood signpost",
  ),
);

/* Number disc — the posters' green / blue step circles. */
for (const [name, fill] of [["step-green", color.forest], ["step-blue", color.blue]]) {
  write(name + ".svg", svg(64, 64, `<circle cx="32" cy="32" r="29" fill="${color.white}"/><circle cx="32" cy="32" r="25" fill="${fill}"/><path d="M14,24 A20,20 0 0 1 40,10" fill="none" stroke="#fff" stroke-opacity="0.3" stroke-width="4" stroke-linecap="round"/>`, "Step disc"));
}

/* ── the world: sky, clouds, skyline, hills, trail, bushes, flowers ─────── */

function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function cloud(x, y, s) {
  return `<g transform="translate(${n(x)} ${n(y)}) scale(${n(s)})">
    <path d="M-60,20 C-80,20 -84,-4 -64,-8 C-66,-30 -36,-38 -24,-22 C-18,-46 22,-48 28,-20 C44,-32 70,-18 60,2 C80,4 78,20 60,20 Z" fill="#fff"/>
    <path d="M-60,20 C-70,20 -76,12 -72,6 C-50,14 20,14 74,8 C76,16 70,20 60,20 Z" fill="${color.sky}" opacity="0.7"/>
  </g>`;
}

function bush(x, y, s, r, fill = color.green, top = color.leaf) {
  let blob = "";
  let hi = "";
  for (let i = 0; i < 5; i++) {
    const bx = (i - 2) * 16 * s + (r() - 0.5) * 6 * s;
    const by = -Math.abs(i - 2) * -5 * s - 10 * s - r() * 8 * s;
    const br = (16 + r() * 8) * s;
    blob += `<circle cx="${n(bx)}" cy="${n(by)}" r="${n(br)}"/>`;
    hi += `<circle cx="${n(bx - br * 0.2)}" cy="${n(by - br * 0.25)}" r="${n(br * 0.6)}"/>`;
  }
  return `<g transform="translate(${n(x)} ${n(y)})"><g fill="${fill}">${blob}</g><g fill="${top}" opacity="0.8">${hi}</g></g>`;
}

function tuft(x, y, s, fill = color.green) {
  return `<path transform="translate(${n(x)} ${n(y)}) scale(${n(s)})" d="M-10,0 Q-12,-14 -16,-20 Q-6,-12 -3,-2 Q-2,-20 2,-26 Q3,-12 3,-2 Q8,-16 16,-20 Q10,-10 10,0 Z" fill="${fill}"/>`;
}

function skyline(w, y, r) {
  let b = "";
  let x = w * 0.18;
  while (x < w * 0.86) {
    const bw = 18 + r() * 34;
    const bh = 40 + r() * 110;
    b += `<rect x="${n(x)}" y="${n(y - bh)}" width="${n(bw)}" height="${n(bh + 40)}" rx="3"/>`;
    x += bw + 4 + r() * 10;
  }
  return `<g fill="#9FCBEF" opacity="0.8">${b}</g>`;
}

function scene(w, h, seed, { trail = true } = {}) {
  const r = rng(seed);
  const hz = h * 0.42;
  let back = "";
  let front = "";
  for (let i = 0; i < 4; i++) back += cloud(w * (0.12 + i * 0.26 + r() * 0.08), h * (0.06 + r() * 0.14), (w / 1080) * (0.9 + r() * 0.7));
  const hill = (y0, amp, fill, phase) => {
    let d = `M0,${n(y0)}`;
    const k = 6;
    for (let i = 1; i <= k; i++) {
      const x = (w * i) / k;
      const y = y0 + Math.sin(i * 1.3 + phase) * amp;
      const cx = x - w / k / 2;
      const cy = y0 + Math.sin(i * 1.3 + phase - 0.7) * amp - amp * 0.6;
      d += ` Q${n(cx)},${n(cy)} ${n(x)},${n(y)}`;
    }
    return `<path d="${d} L${w},${h} L0,${h} Z" fill="${fill}"/>`;
  };
  const trailPath = `M${n(w * 0.34)},${h} C${n(w * 0.1)},${n(h * 0.86)} ${n(w * 0.86)},${n(h * 0.8)} ${n(w * 0.66)},${n(h * 0.68)} C${n(w * 0.46)},${n(h * 0.58)} ${n(w * 0.26)},${n(h * 0.6)} ${n(w * 0.4)},${n(h * 0.5)} C${n(w * 0.5)},${n(h * 0.44)} ${n(w * 0.6)},${n(h * 0.45)} ${n(w * 0.62)},${n(hz)}`;
  const tw = Math.max(w, h) * 0.07;
  for (let i = 0; i < 9; i++) {
    const bx = r() * w;
    const by = h * (0.56 + r() * 0.42);
    front += bush(bx, by, (w / 1080) * (1 + (by / h) * 1.2), r, i % 2 ? color.green : "#2F8740", color.leaf);
  }
  for (let i = 0; i < 26; i++) front += tuft(r() * w, h * (0.5 + r() * 0.5), (w / 1080) * (1.2 + r() * 1.6), i % 3 ? color.green : "#2F8740");
  for (let i = 0; i < 12; i++) front += flower(r() * w, h * (0.55 + r() * 0.45), (w / 1080) * (10 + r() * 8), r() * 72);
  return svg(
    w,
    h,
    `<defs>
    <linearGradient id="sc-sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5FB6F0"/>
      <stop offset="0.7" stop-color="#CDEBFF"/>
      <stop offset="1" stop-color="#EAF7FE"/>
    </linearGradient>
    <radialGradient id="sc-sun" cx="0.12" cy="0.04" r="0.5">
      <stop offset="0" stop-color="#FFF8D6" stop-opacity="0.95"/>
      <stop offset="1" stop-color="#FFF8D6" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#sc-sky)"/>
  <rect width="${w}" height="${h}" fill="url(#sc-sun)"/>
  ${back}
  ${skyline(w, hz + 10, r)}
  ${hill(hz, h * 0.03, "#A9DD7A", 0.4)}
  ${hill(hz + h * 0.08, h * 0.04, color.leaf, 1.7)}
  ${hill(hz + h * 0.2, h * 0.05, "#5DB548", 3.1)}
  ${hill(hz + h * 0.36, h * 0.05, color.green, 4.2)}
  ${trail ? `<path d="${trailPath}" fill="none" stroke="#E8D29A" stroke-width="${n(tw * 1.12)}" stroke-linecap="round"/><path d="${trailPath}" fill="none" stroke="${color.path}" stroke-width="${n(tw)}" stroke-linecap="round"/>` : ""}
  ${front}`,
    "Magisphere world — sky, hills and a trail",
    ' preserveAspectRatio="xMidYMid slice"',
  );
}

write("scene-portrait.svg", scene(1080, 1920, 7));
write("scene-landscape.svg", scene(1920, 1080, 11));
write("scene-square.svg", scene(1080, 1080, 3));
write("scene-banner.svg", scene(1500, 500, 5, { trail: false }));

/* The in-app sky: no trail, no front clutter — a calm top band the HUD sits on
   and the dock-side hills, so the charcoal chrome can go. */
{
  const w = 800;
  const h = 1600;
  const r = rng(21);
  let c = "";
  for (let i = 0; i < 3; i++) c += cloud(w * (0.15 + i * 0.35 + r() * 0.1), h * (0.05 + r() * 0.12), 0.9 + r() * 0.5);
  write(
    "app-backdrop.svg",
    svg(
      w,
      h,
      `<defs><linearGradient id="ab" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8FD0F7"/><stop offset="0.35" stop-color="#E4F6FF"/><stop offset="0.36" stop-color="#EAF8E4"/><stop offset="1" stop-color="#F4FBEF"/></linearGradient></defs>
  <rect width="${w}" height="${h}" fill="url(#ab)"/>
  ${c}
  <path d="M0,560 Q200,500 400,548 T800,530 L800,600 L0,600 Z" fill="#CFEFB4"/>
  <path d="M0,580 Q220,540 430,574 T800,560 L800,620 L0,620 Z" fill="#B6E394" opacity="0.7"/>`,
      "Magisphere app backdrop",
      ' preserveAspectRatio="xMidYMin slice"',
    ),
  );
}

/* ── game icons: vector stickers ─────────────────────────────────────────
 *
 * The same language as the codex sticker set — dark forest outline, flat cel
 * shading, a white sticker border — but drawn as geometry, because an icon
 * lives at 18–50 px where a downscaled render goes soft. The border is a
 * dilate filter on the icon's own alpha, so it follows every silhouette. */

const iconOut = path.resolve(here, "../../src/asset/magi/icon");
mkdirSync(iconOut, { recursive: true });
const I = color.ink;
const SW = 3.5;
const st = `stroke="${I}" stroke-width="${SW}" stroke-linejoin="round" stroke-linecap="round"`;

function iconSvg(name, title, inner) {
  const s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96" role="img">
<title>${title}</title>
<defs><filter id="sticker" x="-20%" y="-20%" width="140%" height="140%">
  <feMorphology in="SourceAlpha" operator="dilate" radius="4" result="grow"/>
  <feFlood flood-color="#fff"/><feComposite in2="grow" operator="in" result="edge"/>
  <feMerge><feMergeNode in="edge"/><feMergeNode in="SourceGraphic"/></feMerge>
</filter></defs>
<g filter="url(#sticker)">
${inner}
</g>
</svg>
`;
  writeFileSync(path.join(iconOut, `${name}.svg`), s);
  console.log(`wrote src/asset/magi/icon/${name}.svg`);
}

const tinyTree = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})">
  <rect x="-3" y="2" width="6" height="12" rx="2" fill="${color.wood}" stroke="${I}" stroke-width="2.5"/>
  <circle cx="0" cy="-4" r="11" fill="${color.leaf}" stroke="${I}" stroke-width="2.5"/>
  <path d="M-7,-2 A8,8 0 0 0 7,1" fill="none" stroke="${color.green}" stroke-width="3" stroke-linecap="round"/>
  <circle cx="-4" cy="-8" r="3" fill="${color.lime}"/>
</g>`;

iconSvg("go", "Go — the camera", `
  <rect x="26" y="20" width="22" height="14" rx="4" fill="${color.teal_deep}" ${st}/>
  <rect x="12" y="28" width="72" height="50" rx="14" fill="${color.teal}" ${st}/>
  <path d="M16,62 L80,62 L80,66 A12,12 0 0 1 68,78 L28,78 A12,12 0 0 1 16,66 Z" fill="${color.teal_deep}"/>
  <rect x="12" y="28" width="72" height="50" rx="14" fill="none" ${st}/>
  <circle cx="48" cy="53" r="19" fill="#fff" ${st}/>
  <circle cx="48" cy="53" r="13" fill="${color.sky_deep}" stroke="${I}" stroke-width="2.5"/>
  <circle cx="48" cy="53" r="7" fill="${color.blue}"/>
  <circle cx="43" cy="48" r="3.5" fill="#fff"/>
  <rect x="66" y="35" width="10" height="7" rx="2" fill="${color.sun}" stroke="${I}" stroke-width="2.5"/>
  ${leaf(80, 30, 20, -60, color.leaf, color.green, I, 2.5)}
  ${sparkle(20, 18, 7, color.orange)}`);

iconSvg("dex", "Dex — the field guide", `
  <rect x="22" y="12" width="56" height="72" rx="8" fill="${color.cream}" ${st}/>
  <rect x="16" y="14" width="56" height="72" rx="8" fill="${color.green}" ${st}/>
  <rect x="18" y="16" width="10" height="68" rx="5" fill="#2E7D3E"/>
  <rect x="16" y="14" width="56" height="72" rx="8" fill="none" ${st}/>
  <rect x="58" y="14" width="7" height="72" fill="${color.wood}" stroke="${I}" stroke-width="2.5"/>
  <circle cx="42" cy="50" r="15" fill="${color.lime}" stroke="${I}" stroke-width="2.5"/>
  ${leaf(32, 58, 22, -45, color.leaf, color.green, I, 2.2)}`);

iconSvg("nearby", "Nearby — what is out around you", `
  <circle cx="44" cy="52" r="34" fill="${color.sky}" ${st}/>
  <circle cx="44" cy="52" r="23" fill="#DDF2FF" stroke="${color.sky_deep}" stroke-width="3"/>
  <circle cx="44" cy="52" r="12" fill="#fff" stroke="${color.sky_deep}" stroke-width="3"/>
  ${tinyTree(44, 52, 0.9)}
  <path d="M74,10 C83,10 88,16 88,23 C88,32 74,44 74,44 C74,44 60,32 60,23 C60,16 65,10 74,10 Z" fill="${color.red}" ${st}/>
  <circle cx="74" cy="23" r="5" fill="#fff"/>`);

iconSvg("buddy", "Buddy — your Sprout", `
  <path d="M22,56 L74,56 L68,86 L28,86 Z" fill="#C8683A" ${st}/>
  <rect x="18" y="50" width="60" height="12" rx="5" fill="#D9804C" ${st}/>
  <path d="M30,52 C28,30 38,22 48,22 C58,22 68,30 66,52 Z" fill="${color.cream}" ${st}/>
  <circle cx="41" cy="40" r="4" fill="${I}"/><circle cx="55" cy="40" r="4" fill="${I}"/>
  <circle cx="42.3" cy="38.6" r="1.4" fill="#fff"/><circle cx="56.3" cy="38.6" r="1.4" fill="#fff"/>
  <circle cx="36" cy="46" r="3.2" fill="${color.orange}" opacity="0.8"/><circle cx="60" cy="46" r="3.2" fill="${color.orange}" opacity="0.8"/>
  <path d="M44,46 Q48,50 52,46" fill="none" stroke="${I}" stroke-width="2.5" stroke-linecap="round"/>
  ${leaf(48, 22, 22, -140, color.leaf, color.green, I, 2.5)}
  ${leaf(48, 22, 24, -40, color.leaf, color.green, I, 2.5)}`);

iconSvg("points", "Points — a leaf coin", `
  <circle cx="46" cy="50" r="32" fill="${color.orange}" ${st}/>
  <circle cx="46" cy="47" r="30" fill="${color.sun}" ${st}/>
  <circle cx="46" cy="47" r="21" fill="none" stroke="${color.orange}" stroke-width="3"/>
  ${leaf(34, 58, 28, -48, color.leaf, color.green, I, 2.5)}
  <path d="M28,30 A22,22 0 0 1 44,22" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity="0.8"/>
  ${sparkle(80, 18, 8, color.orange)}${sparkle(14, 76, 5, color.sun)}`);

iconSvg("streak", "Streak — a leaf flame", `
  <path d="M48,8 C52,24 72,30 72,56 C72,72 62,86 48,86 C34,86 24,74 24,58 C24,46 30,38 36,32 C36,42 40,46 44,46 C40,32 44,18 48,8 Z" fill="${color.orange}" ${st}/>
  <path d="M48,34 C54,46 62,52 62,64 C62,76 56,82 48,82 C40,82 34,76 34,66 C34,58 40,54 42,48 C44,54 46,56 48,56 C46,48 46,40 48,34 Z" fill="${color.sun}"/>
  ${leaf(40, 76, 22, -70, color.leaf, color.green, I, 2.2)}`);

iconSvg("trophy", "Trophy", `
  <path d="M26,24 C12,24 12,46 30,48" fill="none" stroke="${I}" stroke-width="9" stroke-linecap="round"/>
  <path d="M70,24 C84,24 84,46 66,48" fill="none" stroke="${I}" stroke-width="9" stroke-linecap="round"/>
  <path d="M26,24 C12,24 12,46 30,48" fill="none" stroke="${color.sun}" stroke-width="4" stroke-linecap="round"/>
  <path d="M70,24 C84,24 84,46 66,48" fill="none" stroke="${color.sun}" stroke-width="4" stroke-linecap="round"/>
  <path d="M24,16 L72,16 L70,40 C68,56 58,62 48,62 C38,62 28,56 26,40 Z" fill="${color.sun}" ${st}/>
  <path d="M60,20 L68,20 L66,40 C65,50 60,55 54,58 C60,50 61,36 60,20 Z" fill="${color.orange}"/>
  <rect x="42" y="62" width="12" height="10" fill="${color.orange}" ${st}/>
  <rect x="28" y="72" width="40" height="14" rx="4" fill="${color.wood}" ${st}/>
  ${leaf(40, 44, 18, -50, color.leaf, color.green, I, 2.2)}
  ${sparkle(82, 10, 7, color.orange)}`);

iconSvg("quest", "Quest — the trail sign", `
  <rect x="42" y="30" width="10" height="54" rx="3" fill="${color.wood_dark}" ${st}/>
  <path d="M14,20 L66,20 L82,34 L66,48 L14,48 Z" fill="${color.wood}" ${st}/>
  <path d="M20,28 L60,28" stroke="${color.wood_dark}" stroke-width="2.5" stroke-linecap="round" opacity="0.5"/>
  <path d="M22,40 L54,40" stroke="${color.wood_dark}" stroke-width="2.5" stroke-linecap="round" opacity="0.5"/>
  <path d="M28,86 Q30,72 36,68 Q36,78 40,86 Z M54,86 Q58,70 64,66 Q62,78 60,86 Z" fill="${color.leaf}" stroke="${I}" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M18,86 L78,86" stroke="${I}" stroke-width="${SW}" stroke-linecap="round"/>
  ${flower(70, 74, 9)}`);

{
  let scallop = "";
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    scallop += `<circle cx="${n(48 + Math.cos(a) * 26)}" cy="${n(40 + Math.sin(a) * 26)}" r="9"/>`;
  }
  iconSvg("level", "Level — the rosette", `
  <path d="M34,58 L26,88 L36,82 L42,90 L48,62 Z" fill="${color.blue}" ${st}/>
  <path d="M62,58 L70,88 L60,82 L54,90 L48,62 Z" fill="${color.leaf}" ${st}/>
  <g fill="${color.green}" stroke="${I}" stroke-width="${SW}">${scallop}</g>
  <circle cx="48" cy="40" r="28" fill="${color.green}"/>
  <circle cx="48" cy="40" r="19" fill="${color.cream}" ${st}/>
  <path d="M48,52 L48,40" stroke="${I}" stroke-width="3" stroke-linecap="round"/>
  ${leaf(48, 42, 14, -150, color.leaf, color.green, I, 2)}
  ${leaf(48, 40, 15, -30, color.leaf, color.green, I, 2)}`);
}

iconSvg("lock", "Locked", `
  <path d="M30,44 L30,32 A18,18 0 0 1 66,32 L66,44" fill="none" stroke="${I}" stroke-width="13" stroke-linecap="round"/>
  <path d="M30,44 L30,32 A18,18 0 0 1 66,32 L66,44" fill="none" stroke="${color.teal}" stroke-width="6" stroke-linecap="round"/>
  <rect x="18" y="42" width="60" height="44" rx="12" fill="${color.wood}" ${st}/>
  <path d="M24,56 L72,56 M24,70 L72,70" stroke="${color.wood_dark}" stroke-width="2.5" opacity="0.4"/>
  <circle cx="48" cy="60" r="6" fill="${I}"/><rect x="45" y="62" width="6" height="12" rx="3" fill="${I}"/>
  ${leaf(62, 20, 20, -30, color.leaf, color.green, I, 2.2)}`);

iconSvg("plan", "About — the clipboard", `
  <rect x="16" y="14" width="60" height="74" rx="8" fill="${color.wood}" ${st}/>
  <rect x="24" y="24" width="44" height="56" rx="4" fill="${color.cream}" stroke="${I}" stroke-width="2.5"/>
  <rect x="34" y="8" width="24" height="14" rx="5" fill="${color.teal}" ${st}/>
  ${[36, 50, 64]
    .map(
      (y) => `<rect x="29" y="${y - 5}" width="10" height="10" rx="2.5" fill="#fff" stroke="${I}" stroke-width="2.2"/>
  <path d="M31,${y} L34,${y + 3} L40,${y - 4}" fill="none" stroke="${color.green}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M44,${y} L62,${y}" stroke="${I}" stroke-opacity="0.35" stroke-width="3" stroke-linecap="round"/>`,
    )
    .join("")}
  ${leaf(72, 66, 22, -60, color.leaf, color.green, I, 2.2)}`);

iconSvg("pin", "A find on the map", `
  <ellipse cx="48" cy="88" rx="14" ry="4" fill="${I}" opacity="0.25"/>
  <path d="M48,86 C48,86 18,58 18,38 C18,20 32,8 48,8 C64,8 78,20 78,38 C78,58 48,86 48,86 Z" fill="${color.leaf}" ${st}/>
  <path d="M48,86 C48,86 62,60 70,44 C74,34 72,24 66,18 C74,24 78,30 78,38 C78,58 48,86 48,86 Z" fill="${color.green}"/>
  <circle cx="48" cy="38" r="20" fill="#fff" ${st}/>
  ${tinyTree(48, 38, 0.95)}`);
