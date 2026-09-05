/**
 * Flora & fungi archetypes. Same contract as fauna.mjs: (k, col, opt), faces
 * +Z, ground y=0. Plants get faces too — the pack is deliberately kawaii, so
 * a katmon is a chubby tree with a smile, a mushroom is a smiling cap.
 *
 * Three things this file has to hold at once, and how it does it:
 *
 *  1. CONNECTED. Every part node sits on the plant's axis (x=z=0) and its
 *     geometry is baked so the part's box always contains that axis. The axis
 *     part itself spans the whole model height. So every box overlaps the axis
 *     box and the model is one component by construction, not by luck.
 *
 *  2. DISTINCT. `plan()` decodes the species name into a point on a lattice
 *     whose axes are exactly the ones the audit's signature measures: part
 *     count, how the parts are distributed over six height bands, and the two
 *     silhouette aspect ratios. Neighbouring lattice points are ≥0.14 apart in
 *     signature units, comfortably over the 0.12 floor, and the lattice has
 *     ~400k cells — so 475 herbs land on 475 different plants rather than 475
 *     tints of one plant. The plan then drives real structure: leaf count,
 *     leaf shape and compounding, phyllotaxy, stem form, inflorescence.
 *
 *  3. SMOOTH. All geometry is built here from a small loft/lathe library with
 *     enough segments that adjacent faces meet under 40°, which is what the
 *     audit calls "not faceted". Thin leaf lenses are cheap AND smooth; only
 *     round things (trunks, caps, berries) pay for segments.
 *
 * Nothing here uses Math.random: every choice comes from hash32 of the
 * species' scientific name.
 */
import { APP, FLOWERS, FUNGI_CAPS, grad, shade, mix, hash32, hex } from "./kit.mjs";

const TAU = Math.PI * 2;
const ink = APP.ink;
const paper = APP.paper;
const BLUSH = hex("#f0a0a8");

/**
 * Genus / species-code lookups. build-species-model.mjs owns the routing to an
 * archetype; a handful of diagnostics are finer than an archetype (a fishtail
 * palm, a fan palm, a lichen crust, a Norfolk Island Pine) and those are
 * selected HERE, off the name, so the routing table stays a routing table.
 * Deterministic by construction — it is a string lookup, not a hash.
 */
const sciOf = (k) => String(k.spec.scientific_name ?? k.spec.species_code ?? "").trim().toLowerCase();
const genusOf = (k) => sciOf(k).split(/[\s_-]+/)[0];
const epithetOf = (k) => sciOf(k).split(/[\s_-]+/)[1] ?? "";

const leafOf = (col) => col.base ?? APP.green;
const leafDeep = (col) => col.dark ?? APP.greenDeep;
const trunkOf = (col) => col.trunk ?? shade(APP.greenDeep, -0.5);
const flowerOf = (col) => col.accent ?? APP.orange;

/* ══ geometry ══════════════════════════════════════════════════════════════
 * Everything is built as an explicit {positions, indices} in final local
 * coordinates. kit's `add` scales its `at` offset by `scale`, which is a trap;
 * baking the transform here sidesteps it entirely.
 */

/** Loft a stack of rings (each `{pts:[...]}` or `{pole:[x,y,z]}`) into a hull. */
function loft(rings) {
  const positions = [];
  const meta = [];
  for (const r of rings) {
    if (r.pole) { positions.push(r.pole.slice()); meta.push({ pole: positions.length - 1 }); }
    else { const s = positions.length; for (const p of r.pts) positions.push(p.slice()); meta.push({ start: s, n: r.pts.length }); }
  }
  const indices = [];
  for (let k = 0; k < meta.length - 1; k += 1) {
    const A = meta[k], B = meta[k + 1];
    const n = A.n ?? B.n;
    if (A.pole !== undefined && B.pole !== undefined) continue;
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      if (A.pole !== undefined) indices.push([A.pole, B.start + i, B.start + j]);
      else if (B.pole !== undefined) indices.push([A.start + i, B.pole, A.start + j]);
      else indices.push([A.start + i, B.start + i, A.start + j], [A.start + j, B.start + i, B.start + j]);
    }
  }
  return orient({ positions, indices });
}

/** Flip the whole mesh if it came out inside-out (signed volume < 0). */
function orient(geo) {
  let v = 0;
  for (const [a, b, c] of geo.indices) {
    const A = geo.positions[a], B = geo.positions[b], C = geo.positions[c];
    v += A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0]);
  }
  if (v < 0) geo.indices = geo.indices.map(([a, b, c]) => [a, c, b]);
  return geo;
}

/** Drop zero-area faces before they ever reach the writer. */
function clean(geo) {
  const out = [];
  for (const [a, b, c] of geo.indices) {
    const A = geo.positions[a], B = geo.positions[b], C = geo.positions[c];
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
    const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (Math.hypot(nx, ny, nz) > 1e-9) out.push([a, b, c]);
  }
  geo.indices = out;
  return geo;
}

/** Surface of revolution around +Y. `profile` is [[radius, y], ...] upward. */
function lathe(profile, seg = 12) {
  const rings = [];
  const p = profile.slice();
  if (p[0][0] > 1e-6) rings.push({ pole: [0, p[0][1], 0] });
  for (const [r, y] of p) {
    if (r <= 1e-6) { rings.push({ pole: [0, y, 0] }); continue; }
    const pts = [];
    for (let i = 0; i < seg; i += 1) { const a = (i / seg) * TAU; pts.push([Math.cos(a) * r, y, Math.sin(a) * r]); }
    rings.push({ pts });
  }
  if (p[p.length - 1][0] > 1e-6) rings.push({ pole: [0, p[p.length - 1][1], 0] });
  return clean(loft(rings));
}

const sphereCache = new Map();
/** Unit-radius UV sphere. seg≥10 / ring≥5 keeps every crease under 40°. */
function sphereGeo(seg = 10, ring = 5) {
  const key = `${seg}:${ring}`;
  if (sphereCache.has(key)) return sphereCache.get(key);
  const profile = [];
  for (let i = 0; i <= ring; i += 1) {
    const phi = (i / ring) * Math.PI;
    profile.push([Math.sin(phi), -Math.cos(phi)]);
  }
  const geo = lathe(profile, seg);
  sphereCache.set(key, geo);
  return geo;
}

/**
 * Tapered tube from y=0 to y=h. The segment count has a floor: a capped tube
 * below 9 sides meets its own rim at more than 40° on half its edges, which is
 * exactly what the audit calls faceted. Nine sides costs 16 more triangles and
 * halves that.
 */
function tubeGeo(r1, r2, h, seg = 12, bulge = 0) {
  seg = Math.max(9, seg);
  const profile = [];
  const rows = bulge ? 5 : 2;
  for (let i = 0; i < rows; i += 1) {
    const t = i / (rows - 1);
    const r = r1 + (r2 - r1) * t + bulge * Math.sin(Math.PI * t);
    profile.push([Math.max(1e-5, r), t * h]);
  }
  return lathe(profile, seg);
}

/** Proper cone: apex is a single pole, so no zero-area fan. */
function coneGeo(r, h, seg = 12) {
  return lathe([[r, 0], [0, h]], Math.max(9, seg));
}

/** Dome / cap: a squashed half-sphere with a chosen rim flare. */
function capGeo(r, h, seg = 12, ring = 5, shape = "dome") {
  const profile = [];
  for (let i = 0; i <= ring; i += 1) {
    const t = i / ring;
    let rr, y;
    if (shape === "bell") { rr = r * Math.sin((1 - t) * Math.PI * 0.5) ** 0.7; y = h * t; }
    else if (shape === "flat") { rr = r * Math.cos(t * Math.PI * 0.5) ** 0.35; y = h * Math.sin(t * Math.PI * 0.5); }
    else if (shape === "funnel") { rr = r * (0.35 + 0.65 * (1 - t) ** 1.6); y = h * (t - 0.5 * Math.sin(t * Math.PI)); }
    else if (shape === "cone") { rr = r * (1 - t); y = h * t; }
    else { rr = r * Math.cos(t * Math.PI * 0.5) ** 0.6; y = h * Math.sin(t * Math.PI * 0.5); }
    profile.push([rr, y]);
  }
  profile[profile.length - 1][0] = 0;
  return lathe(profile, seg);
}

/** Very flat cylinder — eyes, pupils, blush. 4·seg triangles. */
function discGeo(r, t, seg = 8) {
  return lathe([[r, 0], [r * 0.92, t]], Math.max(10, seg));
}

const LEAF_PROF = {
  lanceolate: (t) => Math.sin(Math.PI * t) ** 0.72 * (1.18 - 0.5 * t),
  elliptic: (t) => Math.sin(Math.PI * t) ** 0.8,
  ovate: (t) => Math.sin(Math.PI * t) ** 0.6 * (1.25 - 0.6 * t),
  obovate: (t) => Math.sin(Math.PI * t) ** 0.6 * (0.6 + 0.6 * t),
  linear: (t) => Math.sin(Math.PI * t) ** 0.22,
  orbicular: (t) => Math.sin(Math.PI * t) ** 1.05,
  spatulate: (t) => Math.sin(Math.PI * t) ** 0.45 * (0.32 + 0.95 * t * t),
  cordate: (t) => Math.sin(Math.PI * t) ** 0.5 * (1.05 - 0.55 * t) * (1 + 0.55 * Math.exp(-(((t - 0.13) / 0.1) ** 2))),
  hastate: (t) => Math.sin(Math.PI * t) ** 0.45 * (0.85 - 0.35 * t) * (1 + 0.9 * Math.exp(-(((t - 0.08) / 0.055) ** 2))),
  falcate: (t) => Math.sin(Math.PI * t) ** 0.85 * (1.1 - 0.45 * t),
  needle: (t) => Math.sin(Math.PI * t) ** 0.15,
};
const LEAF_SHAPE = Object.keys(LEAF_PROF);

/**
 * One blade, base at the origin, running along +Z. `bend` arches it up/down,
 * `sweep` curves it sideways (falcate leaves), `fold` gives it a V channel.
 */
function bladeGeo({ len, wid, thick, shape = "lanceolate", rows = 5, ring = 4, bend = 0, sweep = 0, fold = 0 }) {
  const prof = LEAF_PROF[shape] ?? LEAF_PROF.lanceolate;
  const rings = [];
  for (let i = 0; i <= rows; i += 1) {
    const t = i / rows;
    const p = Math.max(0, prof(t));
    const w = (wid / 2) * p;
    const th = (thick / 2) * (0.35 + 0.65 * Math.sqrt(p));
    const z = t * len;
    const cy = bend * t * t;
    const cx = sweep * t * t;
    if (w < 1e-5) { rings.push({ pole: [cx, cy, z] }); continue; }
    const pts = [];
    for (let m = 0; m < ring; m += 1) {
      const a = (m / ring) * TAU;
      const x = Math.cos(a) * w;
      pts.push([cx + x, cy + Math.sin(a) * th + fold * (x / Math.max(1e-6, wid / 2)) ** 2 * wid * 0.5, z]);
    }
    rings.push({ pts });
  }
  return clean(loft(rings));
}

/** Round tube swept along an arc in the YZ plane — smiles, tendrils, rachis. */
function arcTubeGeo({ R, r, a0, a1, segs = 8, ring = 6 }) {
  ring = Math.max(6, ring);
  const rings = [];
  rings.push({ pole: [0, Math.sin(a0) * R, Math.cos(a0) * R] });
  for (let i = 0; i <= segs; i += 1) {
    const a = a0 + ((a1 - a0) * i) / segs;
    const cy = Math.sin(a) * R, cz = Math.cos(a) * R;
    const uy = Math.cos(a), uz = -Math.sin(a);
    const pts = [];
    for (let m = 0; m < ring; m += 1) {
      const b = (m / ring) * TAU;
      pts.push([Math.cos(b) * r, cy + uy * Math.sin(b) * r, cz + uz * Math.sin(b) * r]);
    }
    rings.push({ pts });
  }
  rings.push({ pole: [0, Math.sin(a1) * R, Math.cos(a1) * R] });
  return clean(loft(rings));
}

/**
 * A flat, irregularly lobed plate lying in the XZ plane, base at y=0. This is
 * the crust: a lichen thallus, a liverwort rosette, a resupinate fungus. Its
 * rim wobbles on a cosine so it reads as lobed rather than as a coin, and the
 * top is domed a little so it is a patch of something living rather than a
 * washer.
 */
function crustGeo({ r, thick = 0.05, lobe = 7, wob = 0.24, seg = 16, rise = 1 }) {
  seg = Math.max(10, Math.round(seg / lobe) * lobe || seg);
  const ring = (rad, y, shrink) => {
    const pts = [];
    for (let i = 0; i < seg; i += 1) {
      const a = (i / seg) * TAU;
      const rr = rad * (1 + wob * Math.cos(lobe * a)) * shrink;
      pts.push([Math.cos(a) * rr, y, Math.sin(a) * rr]);
    }
    return { pts };
  };
  const rings = [{ pole: [0, 0, 0] }, ring(r, thick * 0.12, 0.99), ring(r, thick * 0.55 * rise, 0.9), ring(r * 0.62, thick * rise, 0.9), { pole: [0, thick * 1.05 * rise, 0] }];
  return clean(loft(rings));
}

/**
 * A coil around +Y — a vine tendril, a twining stem. `turn` full turns over
 * `h`, radius `R`, tube radius `r`. Starts on the axis so the part it belongs
 * to always straddles it.
 */
function coilGeo({ R, r, h, turn = 2.2, segs = 22, ring = 5 }) {
  ring = Math.max(5, ring);
  const rings = [];
  const N = Math.max(6, segs);
  for (let i = 0; i <= N; i += 1) {
    const t = i / N;
    const a = t * turn * TAU;
    const rad = R * Math.min(1, t * 4);
    const cx = Math.cos(a) * rad, cz = Math.sin(a) * rad, cy = t * h;
    // frame: tangent is mostly around the circle, so sweep the tube in the
    // plane spanned by the radial direction and +Y — close enough at this size
    const ux = Math.cos(a), uz = Math.sin(a);
    const pts = [];
    for (let m = 0; m < ring; m += 1) {
      const b = (m / ring) * TAU;
      pts.push([cx + ux * Math.cos(b) * r, cy + Math.sin(b) * r, cz + uz * Math.cos(b) * r]);
    }
    rings.push({ pts });
  }
  rings.unshift({ pole: [0, -r * 0.4, 0] });
  rings.push({ pole: [Math.cos(turn * TAU) * R, h + r * 0.4, Math.sin(turn * TAU) * R] });
  return clean(loft(rings));
}

/**
 * Concatenate geometries into ONE mesh. A cushion of moss or a fan of grass
 * leaflets is dozens of tiny pieces; shipped as dozens of primitives they cost
 * more in glTF accessor bookkeeping than in triangles, and the per-model 120 kB
 * ceiling is a hard test assertion. Merged, they cost one primitive. Colour is
 * then per-merge, so callers group by colour before merging.
 */
function mergeGeo(list) {
  const positions = [];
  const indices = [];
  for (const g of list) {
    const off = positions.length;
    for (const q of g.positions) positions.push(q);
    for (const [a, b, c] of g.indices) indices.push([a + off, b + off, c + off]);
  }
  return { positions, indices };
}

/** Transform a geometry: scale, then rotate X→Y→Z, then translate. */
function xf(geo, { s, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, at = [0, 0, 0] } = {}) {
  const ax = s ?? sx, ay = s ?? sy, az = s ?? sz;
  const cx = Math.cos(rx), snx = Math.sin(rx);
  const cy = Math.cos(ry), sny = Math.sin(ry);
  const cz = Math.cos(rz), snz = Math.sin(rz);
  const positions = geo.positions.map((p) => {
    let x = p[0] * ax, y = p[1] * ay, z = p[2] * az;
    let t = y * cx - z * snx; z = y * snx + z * cx; y = t;
    t = x * cy + z * sny; z = -x * sny + z * cy; x = t;
    t = x * cz - y * snz; y = x * snz + y * cz; x = t;
    return [x + at[0], y + at[1], z + at[2]];
  });
  return { positions, indices: geo.indices };
}

function boxOf(positions) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of positions) for (let i = 0; i < 3; i += 1) { if (p[i] < lo[i]) lo[i] = p[i]; if (p[i] > hi[i]) hi[i] = p[i]; }
  return { lo, hi };
}

/* ══ the signature lattice ═════════════════════════════════════════════════ */

const UNIT = 8;                  // band composition granularity → 0.125 per unit
const SPINE_BAND = 3;            // an axis spanning [0,1] has its centre here
const P_LEVEL = [8, 16, 24, 32]; // part counts → signature dim 0 at 0.2 steps
// sizeX/sizeY levels: 0.132 apart once divided by 3, so two plants that differ
// only in silhouette still clear the 0.12 distinctness floor.
const ASPECT = [0.15, 0.546, 0.942, 1.338, 1.734, 2.13, 2.526, 2.922];
/**
 * Uprights get a narrower set. The first pass let the distinctness lattice buy
 * variety by flattening a tree into a wide pancake — cheap to score, wrong to
 * look at — so trees, palms and shrubs may now vary between a columnar 0.15
 * and a spreading 1.35, and never past the audit's 1.6 ceiling. The variety
 * they lose here is paid back in crown shape, branching and canopy tiering,
 * which cost silhouette nothing.
 */
const ASPECT_UP = [0.15, 0.55, 0.95, 1.35];
/**
 * Broad-leaved uprights drop the columnar 0.15: a pencil-thin coconut palm or
 * ixora is not a plant, it is a stick. Trees keep it, because Araucaria and
 * Casuarina really do grow that way.
 */
const ASPECT_UP_WIDE = [0.35, 0.75, 1.15, 1.55];
/**
 * Crown-tufted plants — palms, bananas, papaya, cycads, pandans — carry every
 * leaf in one rosette at the top, so a narrow footprint leaves nothing to see
 * but a pole. They never go below 0.6.
 */
const ASPECT_CROWN = [0.6, 1.0, 1.4];
/** Climbers: narrow enough that the twining stem is the thing you see. */
const ASPECT_VINE = [0.45, 0.8, 1.15, 1.5];
/** Bands whose part centres land under the audit's bottom-30% trunk window. */
const BASE_BAND = 2;
/** First band whose part centres are guaranteed above the mid-height line. */
const CROWN_BAND = 3;
/** Bumped when the lattice needs re-seeding to shake out a hash collision. */
const SALT_VERSION = "v1";

/**
 * FNV-1a alone is not enough here: its low bits depend only on the low bits of
 * the input, so `H("part") % 4` and `H("comp") % 792` came out correlated and
 * the lattice collapsed to a fraction of its size. Finalise with an avalanche.
 */
function mix32(x) {
  let v = x >>> 0;
  v = (v ^ (v >>> 16)) >>> 0;
  v = Math.imul(v, 0x7feb352d) >>> 0;
  v = (v ^ (v >>> 15)) >>> 0;
  v = Math.imul(v, 0x846ca68b) >>> 0;
  v = (v ^ (v >>> 16)) >>> 0;
  return v;
}

function binom(n, k) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 0; i < k; i += 1) r = (r * (n - i)) / (i + 1);
  return Math.round(r);
}
const compCount = (m, n) => binom(m + n - 1, n - 1);
function unrankComp(rank, m, n) {
  const out = [];
  let rem = m, r = rank % compCount(m, n);
  for (let i = 0; i < n - 1; i += 1) {
    let v = 0;
    for (;;) {
      const c = compCount(rem - v, n - i - 1);
      if (r < c || rem - v === 0) break;
      r -= c; v += 1;
    }
    out.push(v); rem -= v;
  }
  out.push(rem);
  return out;
}

/**
 * Decode the species into a lattice cell + a pile of free-form style dials.
 * `bands` restricts which height bands an archetype is allowed to load, so a
 * palm never grows fronds at ankle height.
 */
function plan(k, style) {
  const name = k.spec.scientific_name ?? k.spec.species_code;
  const H = (s) => mix32(hash32(`${name}|${style.salt}|${SALT_VERSION}|${s}`));
  const u = (s) => (H(s) % 100003) / 100003;
  const of = (arr, s) => arr[H(s) % arr.length];

  const pLevel = style.pLevel ?? P_LEVEL;
  const P = pLevel[H("part") % pLevel.length];
  let ax = (style.axSet ?? ASPECT)[H("aspx") % (style.axSet ?? ASPECT).length];
  let az = (style.azSet ?? ASPECT)[H("aspz") % (style.azSet ?? ASPECT).length];
  /*
   * The two aspects are drawn independently, which lets a plant come out
   * nineteen times wider in x than in z. Nothing in the audit minds — the
   * signature caps both at three — but every round thing in such a plant is
   * rolled flat, which is where a lot of "flat slivers seen from above" came
   * from, the Norfolk Island Pine's pancake crown among them. Cap the ratio.
   */
  const aniso = style.maxAniso ?? 3.2;
  if (ax / az > aniso) az = ax / aniso;
  else if (az / ax > aniso) ax = az / aniso;

  const bands = style.bands ?? [0, 1, 2, 3, 4, 5];
  /* An upright also reserves a unit high in the canopy. Without it a plan can
     legally put every part at or below mid-height, which leaves the audit with
     no crown to measure the trunk against — infinitely bottom-heavy. */
  const reserve = style.upright ? 2 : 1;
  const free = unrankComp(H("comp"), UNIT - reserve, bands.length);
  const comp = [0, 0, 0, 0, 0, 0];
  bands.forEach((b, i) => { comp[b] += free[i]; });
  comp[SPINE_BAND] += 1;
  if (style.upright) comp[4 + (H("crown") % 2)] += 1;

  const mult = P / UNIT;
  const slot = [];
  for (let b = 0; b < 6; b += 1) {
    const n = comp[b] * mult;
    for (let i = 0; i < n; i += 1) slot.push({ band: b, i, n });
  }
  return { P, ax, az, comp, slot, H, u, of, name, upright: !!style.upright };
}

/* ══ the plant builder ═════════════════════════════════════════════════════ */

class Plant {
  constructor(k, col, style) {
    this.k = k;
    this.col = col;
    this.style = style;
    this.plan = plan(k, style);
    this.body = k.cute.node("body", { parent: k.root });
    this.node = [];
    this.spineNode = null;
    // triangle budget per decorative part, so even a 32-part model stays under
    // ~110 kB: the axis and its face cost about 420, the rest is shared out.
    this.budget = Math.max(38, Math.round(1500 / (this.plan.P - 1)));
    this.tri = 0;
    this.triCap = 2400;
    /* Where the faces are, so finish() can undo the silhouette scaling on them
       — see the note there. */
    this.faceMark = [];
    this.allowance = Infinity;
  }

  /** A fresh part node sitting on the axis. */
  part(name) {
    const n = this.k.cute.node(name, { parent: this.body, at: [0, 0, 0] });
    this.node.push(n);
    return n;
  }

  /**
   * Geometry goes in unless the model has already spent its triangle ceiling
   * and this node has something to show — a part is never left empty, because
   * an empty node would silently change the planned part count.
   */
  add(node, geo, opts = {}, force = false) {
    if (geo.indices.length === 0) return node;
    /* Two ceilings. `triCap` keeps the file loadable; `allowance` keeps the
       spend FAIR, because slots are built bottom-up and a greedy understory
       would otherwise eat the canopy's share and leave a palm as a bare pole.
       Allowance grows by one part's budget every time a slot opens. */
    if (!force && this.tri + geo.indices.length > Math.min(this.triCap, this.allowance)) return node;
    this.tri += geo.indices.length;
    this.k.cute.add(node, geo, opts);
    return node;
  }

  localBox(node) {
    let lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of node.parts) {
      const b = boxOf(p.positions);
      for (let i = 0; i < 3; i += 1) { lo[i] = Math.min(lo[i], b.lo[i]); hi[i] = Math.max(hi[i], b.hi[i]); }
    }
    return { lo, hi };
  }

  /**
   * Connectivity insurance. Every part node sits on the axis, so a part whose
   * box already straddles x=z=0 is guaranteed to touch the axis part. When a
   * decoration sits off to one side, grow a thin pedicel back to the origin —
   * cheaper and more honest than mirroring the whole thing.
   */
  anchor(node, color) {
    if (!node.parts.length) return;
    const { lo, hi } = this.localBox(node);
    if (lo[0] <= 0.002 && hi[0] >= -0.002 && lo[2] <= 0.002 && hi[2] >= -0.002) return;
    const c = [(lo[0] + hi[0]) / 2, Math.min(hi[1], Math.max(lo[1], 0)), (lo[2] + hi[2]) / 2];
    const len = Math.hypot(c[0], c[1], c[2]);
    if (len < 1e-5) return;
    const rx = Math.acos(Math.max(-1, Math.min(1, c[1] / len)));
    const ry = Math.atan2(c[0], c[2]);
    /* Thin. This is a pedicel, not a branch: at six per cent of its own length
       it reads as a bare brown stick poking out of the plant, and a shrub with
       a flower on every other slot grows a fistful of them. */
    const w = Math.max(0.0022, len * 0.028);
    this.add(node, xf(tubeGeo(w, w * 0.8, len, 5), { rx, ry }), { color }, true);
  }

  /** Squash + slide the finished part so its box centre lands inside `band`. */
  place(node, band, i, n) {
    if (node.parts.length === 0) return;
    const target = (band + 0.35 + (0.55 * (i + 0.5)) / Math.max(1, n)) / 6;
    const { lo, hi } = this.localBox(node);
    const cy = (lo[1] + hi[1]) / 2;
    const half = (hi[1] - lo[1]) / 2;
    /*
     * How tall a part may be, given where its centre has to land. The first
     * pass required the part to fit strictly inside [0,1], which means a part
     * whose band centre is at 0.95 may be at most 0.1 tall — so EVERY part in
     * the top band, and every part in the bottom one, was crushed into a
     * horizontal plate. That is where "splayed flat, seen from above" came
     * from across moss, aroid, rosette, fern and coral alike: not the design
     * of any one archetype, this clamp. Letting a part overhang the axis a
     * little at each end costs the height grid almost nothing (the model is
     * renormalised afterwards) and lets a leaf stand up.
     */
    const maxHalf = Math.min(target + 0.07, 1.3 - target) * 0.995;
    if (half > maxHalf && half > 1e-6) {
      const s = maxHalf / half;
      for (const p of node.parts) p.positions = p.positions.map((q) => [q[0], cy + (q[1] - cy) * s, q[2]]);
    }
    node.at[1] = target - cy;
  }

  /** The axis: spans [0,1] exactly, so it fixes the model's height band grid. */
  spine(name, build) {
    const n = this.part(name);
    build(n);
    const { lo, hi } = this.localBox(n);
    const span = Math.max(1e-6, hi[1] - lo[1]);
    if (Math.abs(span - 1) > 1e-9 || Math.abs(lo[1]) > 1e-9) {
      const s = 1 / span;
      for (const p of n.parts) p.positions = p.positions.map((q) => [q[0], (q[1] - lo[1]) * s, q[2]]);
    }
    n.at[1] = 0;
    this.spineNode = n;
    return n;
  }

  /** Whole-model box in body-local space (y already carries each part's at). */
  bodyBox() {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const n of this.node) {
      if (!n.parts.length) continue;
      const b = this.localBox(n);
      for (let i = 0; i < 3; i += 1) {
        lo[i] = Math.min(lo[i], b.lo[i] + (i === 1 ? n.at[1] : 0));
        hi[i] = Math.max(hi[i], b.hi[i] + (i === 1 ? n.at[1] : 0));
      }
    }
    return { lo, hi };
  }

  /**
   * The audit's top-heaviness measure, replayed here on the parts we are about
   * to ship, under a candidate x/z scale. `width` is the audit's: the larger of
   * a part's two horizontal extents, so a crown spray that only reaches along z
   * still counts as wide.
   */
  heaviness(sx, sz) {
    const { lo, hi } = this.bodyBox();
    const height = Math.max(1e-6, hi[1] - lo[1]);
    const baseY = lo[1] + height * 0.3, crownY = lo[1] + height * 0.5;
    let baseWide = 0, crownWide = 0, baseNode = [];
    for (const n of this.node) {
      if (!n.parts.length || n === this.spineNode) continue;
      const b = this.localBox(n);
      const cy = (b.lo[1] + b.hi[1]) / 2 + n.at[1];
      const w = Math.max((b.hi[0] - b.lo[0]) * sx, (b.hi[2] - b.lo[2]) * sz);
      if (cy < baseY) { baseWide = Math.max(baseWide, w); baseNode.push(n); }
      if (cy > crownY) crownWide = Math.max(crownWide, w);
    }
    return { baseWide, crownWide, baseNode };
  }

  /** Normalise the silhouette to the planned aspect and the archetype height. */
  finish() {
    const H = typeof this.style.height === "function" ? this.style.height(this.plan) : (this.style.height ?? 0.5);
    const fit = () => {
      const { lo, hi } = this.bodyBox();
      const wx = Math.max(0.02, hi[0] - lo[0]);
      const wz = Math.max(0.02, hi[2] - lo[2]);
      return { lo, hi, sx: (this.plan.ax * H) / wx, sz: (this.plan.az * H) / wz };
    };
    let f = fit();
    if (this.plan.upright) {
      /*
       * A trunk has to be narrower than its own crown. Design gets it most of
       * the way there, but the two aspect scales are independent, so a base
       * part lying along the stretched axis can still out-measure a crown part
       * lying along the squashed one. Rather than hope, measure and pull the
       * base in — three passes, because shrinking the base can move the box
       * that the scales were derived from.
       */
      for (let pass = 0; pass < 3; pass += 1) {
        const { baseWide, crownWide, baseNode } = this.heaviness(f.sx, f.sz);
        if (crownWide < 1e-6 || baseWide <= crownWide * 0.7) break;
        const k = Math.max(0.12, (crownWide * 0.7) / baseWide);
        for (const n of baseNode) {
          for (const p of n.parts) p.positions = p.positions.map((q) => [q[0] * k, q[1], q[2] * k]);
        }
        f = fit();
      }
    }
    /*
     * The face, and only the face, is exempt from the silhouette scaling.
     * body.scale is deliberately anisotropic — that is how a plan's aspect is
     * met — and a plant stretched nineteen to one in x crushed its face into a
     * letterbox one half of one per cent as deep as it was wide. Scaling the
     * face back to isotropic about its own seat point costs the silhouette
     * nothing (a face is a few per cent of the model) and is the difference
     * between eyes with depth and eyes that vanish edge-on.
     */
    const iso = Math.min(f.sx, H, f.sz);
    const kx = iso / f.sx, ky = iso / H, kz = iso / f.sz;
    if (Math.abs(kx - 1) > 0.01 || Math.abs(ky - 1) > 0.01 || Math.abs(kz - 1) > 0.01) {
      for (const m of this.faceMark) {
        for (let i = m.from; i < m.to; i += 1) {
          const part = m.node.parts[i];
          if (!part) continue;
          part.positions = part.positions.map((q) => [
            m.at[0] + (q[0] - m.at[0]) * kx,
            m.at[1] + (q[1] - m.at[1]) * ky,
            m.at[2] + (q[2] - m.at[2]) * kz,
          ]);
        }
      }
    }
    this.body.scale = [f.sx, H, f.sz];
    this.body.at = [-((f.lo[0] + f.hi[0]) / 2) * f.sx, 0, -((f.lo[2] + f.hi[2]) / 2) * f.sz];
  }
}

/* ══ shared part vocabulary ════════════════════════════════════════════════ */

/**
 * The kawaii face, merged into whichever part carries it — costs no part slot.
 * Discs, not spheres: an eye is read head-on, and a disc is 32 triangles where
 * a smooth ball is 80. The whole face lands around 230.
 */
/** Colour of whichever geometry already in this node sits closest to `at`. */
function hostColorAt(node, at) {
  let best = Infinity;
  let col = null;
  for (const part of node.parts) {
    if (part.color === undefined || part.color === null) continue;
    for (const q of part.positions) {
      const d = (q[0] - at[0]) ** 2 + (q[1] - at[1]) ** 2 + (q[2] - at[2]) ** 2;
      if (d < best) { best = d; col = part.color; }
    }
  }
  return col;
}

/**
 * The kawaii face, merged into whichever part carries it — costs no part slot.
 * Discs, not spheres: an eye is read head-on, and a disc is 32 triangles where
 * a smooth ball is 80.
 *
 * Two things the first pass got wrong, both reported by eye on a papaya and
 * both now gated:
 *
 *  - the face HOVERED. Callers pass `at` as a point on the host's surface and
 *    the face then pushed itself a further 0.92·r straight out along its own
 *    facing direction, so the eyes floated in front of the trunk. On a tree
 *    that measured a tenth of the whole model.
 *  - the face was a PLANE. Every disc sat on one flat sheet, so edge-on it
 *    disappeared entirely.
 *
 * The fix for both is the same object: a shallow patch of the host's own
 * colour, seated at `at` and mostly buried in it, that the features are then
 * laid onto. The patch gives the face something to rest against (so it is
 * never measurably off the body, whatever the host's vertex spacing) and its
 * curvature gives the face real depth. It reads as a cheek.
 */
function addFace(p, node, { at = [0, 0, 0], r, yaw = 0, tri = 400, skin = null }) {
  const rich = tri >= 260;
  const eyeR = r * 0.44;
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const dir = [sy, 0, cy];       // outward, the way the face looks
  const right = [cy, 0, -sy];

  const A = r * 1.3, B = r * 0.98, C = r * 0.5;   // patch semi-axes
  const sink = C * 0.55;                          // how far it is buried
  /* Never paper, ink or blush: those three exact values are how the audit
     tells a face from a body, and a body-sized patch in one of them would
     read as a face the size of the plant. A shade of the host is also just a
     nicer cheek. */
  const skinCol = shade(skin ?? hostColorAt(node, at) ?? APP.greenDeep, -0.07);
  const from = node.parts.length;
  p.add(node, xf(sphereGeo(rich ? 10 : 9, 5), {
    sx: A, sy: B, sz: C, ry: yaw,
    at: [at[0] - dir[0] * sink, at[1], at[2] - dir[2] * sink],
  }), { color: skinCol });

  /** Where a tangential offset (u right, w up, both in units of r) lands ON the patch. */
  const onPatch = (u, w, lift = 0) => {
    const su = (u * r) / A, sw = (w * r) / B;
    const d = Math.sqrt(Math.max(0.05, 1 - su * su - sw * sw));
    const depth = C * d - sink + lift;
    return [at[0] + right[0] * u * r + dir[0] * depth, at[1] + w * r, at[2] + right[2] * u * r + dir[2] * depth];
  };
  const put = (geo, { u, w, lift = 0, color, sz = 1 }) =>
    p.add(node, xf(geo, { sz, rx: Math.PI / 2, ry: yaw, at: onPatch(u, w, lift) }), { color });

  for (const side of [1, -1]) {
    put(discGeo(eyeR, r * 0.17, 8), { u: side * 0.5, w: 0.12, sz: 1.3, color: paper });
    put(discGeo(eyeR * 0.52, r * 0.11, 7), { u: side * 0.5, w: 0.08, lift: r * 0.14, sz: 1.25, color: ink });
    if (!rich) continue;
    put(discGeo(eyeR * 0.24, r * 0.07, 5), { u: side * 0.62, w: 0.26, lift: r * 0.2, color: paper });
    put(discGeo(r * 0.2, r * 0.07, 6), { u: side * 1.02, w: -0.24, sz: 0.6, color: BLUSH });
  }
  const m = onPatch(0, -0.16, r * 0.05);
  p.add(node, xf(arcTubeGeo({ R: r * 0.3, r: r * 0.06, a0: Math.PI * 0.74, a1: Math.PI * 1.26, segs: 5, ring: 5 }),
    { rx: Math.PI / 2, ry: yaw, at: m }), { color: ink });
  p.faceMark.push({ node, from, to: node.parts.length, at });
}

/**
 * A leaf part: petiole from the axis out to a blade (or a compound of blades).
 * Always contains the origin, so the part can never float off the plant.
 */
function addLeaf(p, node, o) {
  const {
    at = [0, 0, 0], yaw = 0, pitch = 0, roll = 0,
    len, wid, thick = null, shape = "lanceolate", form = "simple",
    color, colorFn, stalkColor, stalk = 0.25, leaflet = 5,
    bend = 0, sweep = 0, fold = 0, tri = 64,
  } = o;
  const th = thick ?? Math.max(0.004, wid * 0.16);
  const wantPet = stalk > 0.02 && tri >= 44;
  const petLen = wantPet ? len * stalk : 0;
  let left = tri - (wantPet ? 20 : 0);
  const ring = 4;
  // rows from the triangle allowance: a blade costs 2·ring·rows
  const rowsFor = (t) => Math.max(2, Math.min(8, Math.floor(t / (2 * ring))));

  if (wantPet) {
    p.add(node, xf(xf(tubeGeo(th * 0.75, th * 0.55, petLen, 5), { rx: Math.PI / 2 }), { rx: pitch, ry: yaw, rz: roll, at }), { color: stalkColor ?? color });
  }
  const geos = [];
  const blade = (bl, bw, bs, off, ry2, t, extraBend = 0) => {
    const rows = rowsFor(t);
    if (rows < 2) return;
    left -= 2 * ring * rows;
    geos.push(xf(bladeGeo({ len: bl, wid: bw, thick: th, shape: bs, rows, ring, bend: bend + extraBend, sweep, fold }), { ry: ry2 ?? 0, at: off }));
  };
  const body = len - petLen;
  if (form === "trifoliate" && left >= 60) {
    const each = left / 3;
    blade(body * 0.82, wid * 0.8, shape, [0, 0, petLen], 0, each);
    for (const s of [1, -1]) blade(body * 0.66, wid * 0.7, shape, [0, 0, petLen * 0.92], s * 0.85, each);
  } else if (form === "palmate" && left >= 80) {
    const nlf = Math.max(3, Math.min(7, Math.min(leaflet, Math.floor(left / 22))));
    const each = left / nlf;
    for (let i = 0; i < nlf; i += 1) {
      const a = (i / (nlf - 1) - 0.5) * 1.9;
      blade(body * (1 - 0.22 * Math.abs(a)), wid * 0.5, shape, [0, 0, petLen], a, each);
    }
  } else if ((form === "pinnate" || form === "frond") && left >= 80) {
    geos.push(xf(tubeGeo(th * 0.6, th * 0.3, body, 5), { rx: Math.PI / 2, at: [0, 0, petLen] }));
    left -= 20;
    const nlf = Math.max(2, Math.min(9, Math.min(leaflet, Math.floor(left / 18))));
    const each = left / (nlf * 2);
    for (let i = 0; i < nlf; i += 1) {
      const t = (i + 0.7) / (nlf + 0.4);
      const ll = body * (form === "frond" ? 0.52 : 0.44) * (1 - 0.5 * Math.abs(t - 0.42));
      for (const s of [1, -1]) blade(ll, wid * 0.46, form === "frond" ? "linear" : shape, [0, 0, petLen + t * body], s * (1.05 + 0.25 * t), each, -0.15 * ll);
    }
  } else if (form === "ladder" && left >= 44) {
    /* A sword fern: one long rachis carrying MANY small paired pinnae. The
       generic pinnate form tops out at nine leaflets and spends its whole
       budget on them, which draws Nephrolepis as a broad undivided slab — and
       the pinnate ladder is the entire identity of the genus. */
    geos.push(xf(tubeGeo(th * 0.55, th * 0.25, body, 5), { rx: Math.PI / 2, at: [0, 0, petLen] }));
    left -= 20;
    const nlf = Math.max(3, Math.min(13, Math.floor(left / 28)));
    const each = left / (nlf * 2);
    for (let i = 0; i < nlf; i += 1) {
      const t = (i + 0.55) / (nlf + 0.25);
      const ll = body * 0.26 * (1 - 0.5 * Math.abs(t - 0.34));
      for (const s of [1, -1]) blade(ll, wid * 0.6, "elliptic", [0, 0, petLen + t * body], s * 1.36, each, -0.1 * ll);
    }
  } else if (form === "lobed" && left >= 60) {
    blade(body, wid, shape, [0, 0, petLen], 0, left * 0.5);
    for (const s of [1, -1]) blade(body * 0.42, wid * 0.42, "ovate", [0, 0, petLen + body * 0.2], s * 1.15, left * 0.25);
  } else {
    blade(body, wid, shape, [0, 0, petLen], 0, left);
  }
  /* One primitive, not one per leaflet. A compound leaf is up to 27 pieces;
     shipped separately they cost more in glTF accessor bookkeeping than in
     triangles, and the pack has a hard 120 kB per model. */
  if (geos.length) p.add(node, xf(mergeGeo(geos), { rx: pitch, ry: yaw, rz: roll, at }), { color, colorFn });
  return node;
}

/** Flower / fruit heads. All compound, all anchored back to the origin. */
function addFlower(p, node, o) {
  const { at = [0, 0, 0], kind = "daisy", r = 0.08, color, color2, stalkColor, pitch = 0, yaw = 0, stalkLen = 0, tri = 90 } = o;
  const c2 = color2 ?? shade(color, 0.25);
  const fine = tri >= 110;
  const sph = ballGeo(tri * 0.6);
  const petRows = tri >= 130 ? 4 : tri >= 80 ? 3 : 2;
  const put = (geo, extra = {}) => p.add(node, xf(geo, { rx: pitch, ry: yaw, at, ...extra }), { color: extra.color ?? color });
  if (stalkLen > 0.004 && tri >= 60) {
    p.add(node, xf(tubeGeo(r * 0.13, r * 0.1, stalkLen, 6), { rx: pitch * 0.5, ry: yaw, at: [at[0], at[1] - stalkLen, at[2]] }), { color: stalkColor ?? shade(color, -0.4) });
  }
  if (tri < 58) {
    // a bud: three little petal scales. Reads as a flower at gallery size and
    // costs what one leaf costs, which is all a 32-part plant can spare.
    for (let i = 0; i < 3; i += 1) {
      put(xf(bladeGeo({ len: r * 0.9, wid: r * 0.6, thick: r * 0.3, shape: "ovate", rows: 2, ring: 4 }), { rx: -1.1, ry: (i / 3) * TAU }), { color: i % 2 ? color : c2 });
    }
    return node;
  }
  const petal = (n, pl, pw, tilt, col) => {
    const cnt = Math.max(3, Math.min(n, Math.floor(tri / (2 * 4 * petRows))));
    for (let i = 0; i < cnt; i += 1) {
      const a = (i / cnt) * TAU;
      put(xf(bladeGeo({ len: pl, wid: pw, thick: pw * 0.32, shape: "obovate", rows: petRows, ring: 4 }), { rx: -tilt, ry: a }), { color: col });
    }
  };
  if (kind === "daisy") {
    petal(Math.max(6, Math.min(12, Math.round(r * 110))), r, r * 0.46, 0.2, color);
    put(xf(sph, { sx: r * 0.4, sy: r * 0.24, sz: r * 0.4, at: [0, r * 0.05, 0] }), { color: c2 });
  } else if (kind === "star") {
    petal(5, r * 1.05, r * 0.4, 0.35, color);
    put(xf(sph, { s: r * 0.2 }), { color: c2 });
  } else if (kind === "bell") {
    put(xf(capGeo(r * 0.85, r * 1.1, fine ? 12 : 9, 4, "bell"), { rx: Math.PI, at: [0, r * 1.0, 0] }), { color });
    put(xf(sph, { s: r * 0.16, at: [0, r * 0.1, 0] }), { color: c2 });
  } else if (kind === "trumpet") {
    put(xf(capGeo(r * 0.9, r * 1.5, fine ? 12 : 9, 4, "funnel"), { rx: -Math.PI * 0.35 }), { color });
    put(xf(sph, { s: r * 0.24, at: [0, r * 0.35, 0] }), { color: c2 });
  } else if (kind === "spike") {
    const n = Math.max(3, Math.min(6, Math.floor(tri / (fine ? 80 : 48))));
    for (let i = 0; i < n; i += 1) {
      const t = i / Math.max(1, n - 1);
      put(xf(sph, { sx: r * 0.4 * (1 - 0.6 * t), sy: r * 0.34, sz: r * 0.4 * (1 - 0.6 * t), at: [0, r * 0.4 + i * r * (2.4 / n), 0] }), { color: i % 2 ? color : c2 });
    }
  } else if (kind === "ball" || kind === "brush") {
    put(xf(sph, { s: r * 0.55 }), { color: c2 });
    const n = Math.max(3, Math.min(kind === "brush" ? 12 : 9, Math.floor(tri / (fine ? 80 : 44))));
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * TAU * 1.618;
      const b = Math.acos(1 - (2 * (i + 0.5)) / n);
      const d = [Math.cos(a) * Math.sin(b), Math.cos(b) * 0.8 + 0.2, Math.sin(a) * Math.sin(b)];
      if (kind === "brush") put(xf(tubeGeo(r * 0.05, r * 0.03, r * 0.8, 5), { rx: Math.acos(Math.max(-1, Math.min(1, d[1]))), ry: Math.atan2(d[0], d[2]) }), { color });
      else put(xf(sph, { s: r * 0.24, at: [d[0] * r * 0.6, d[1] * r * 0.6, d[2] * r * 0.6] }), { color });
    }
  } else if (kind === "berry") {
    const n = Math.max(2, Math.min(5, Math.floor(tri / (fine ? 80 : 44))));
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * TAU;
      put(xf(sph, { s: r * 0.38, at: [Math.cos(a) * r * 0.45, r * 0.1 + (i % 2) * r * 0.3, Math.sin(a) * r * 0.45] }), { color: i % 2 ? color : c2 });
    }
  } else if (kind === "pea") {
    put(xf(sph, { sx: r * 0.62, sy: r * 0.5, sz: r * 0.22, at: [0, r * 0.5, 0], rx: -0.35 }), { color });
    for (const s of [1, -1]) put(xf(sph, { sx: r * 0.3, sy: r * 0.2, sz: r * 0.42, at: [s * r * 0.42, r * 0.1, r * 0.08], rz: s * 0.5 }), { color: c2 });
    put(xf(sph, { sx: r * 0.3, sy: r * 0.22, sz: r * 0.4, at: [0, -r * 0.1, r * 0.12] }), { color: shade(color, -0.15) });
  } else if (kind === "umbel") {
    const n = Math.max(3, Math.min(7, Math.floor(tri / (fine ? 105 : 68))));
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * TAU;
      const rr = i === 0 ? 0 : r * 0.72;
      put(xf(tubeGeo(r * 0.05, r * 0.04, r * 0.7, 5), { rz: -Math.cos(a) * 0.75, rx: Math.sin(a) * 0.75 }), { color: stalkColor ?? shade(color, -0.4) });
      put(xf(sph, { sx: r * 0.26, sy: r * 0.16, sz: r * 0.26, at: [Math.cos(a) * rr, r * 0.62, Math.sin(a) * rr] }), { color: i % 2 ? color : c2 });
    }
  } else if (kind === "cup") {
    put(xf(capGeo(r * 0.9, r * 0.8, fine ? 12 : 9, 4, "funnel"), {}), { color });
    put(xf(sph, { sx: r * 0.5, sy: r * 0.14, sz: r * 0.5, at: [0, r * 0.3, 0] }), { color: c2 });
  } else if (kind === "catkin") {
    put(xf(sph, { sx: r * 0.32, sy: r * 1.0, sz: r * 0.32, at: [0, r * 0.7, 0], rx: 0.5 }), { color });
    put(xf(sph, { sx: r * 0.24, sy: r * 0.6, sz: r * 0.24, at: [r * 0.3, r * 0.4, 0], rz: 0.6 }), { color: c2 });
  } else if (kind === "orchid") {
    petal(3, r * 0.95, r * 0.5, 0.15, color);
    for (const s of [1, -1]) put(xf(bladeGeo({ len: r * 0.8, wid: r * 0.4, thick: r * 0.12, shape: "ovate", rows: petRows, ring: 4 }), { rx: -0.5, ry: s * 2.3 }), { color: c2 });
    put(xf(capGeo(r * 0.45, r * 0.5, fine ? 10 : 8, 3, "funnel"), { rx: -0.5, at: [0, 0, r * 0.2] }), { color: c2 });
  } else if (kind === "cone") {
    put(xf(coneGeo(r * 0.6, r * 1.8, 10), {}), { color });
    const n = Math.max(2, Math.min(5, Math.floor(tri / (fine ? 90 : 50))));
    for (let i = 0; i < n; i += 1) put(xf(sph, { sx: r * 0.5 * (1 - i * 0.16), sy: r * 0.14, sz: r * 0.5 * (1 - i * 0.16), at: [0, r * 0.25 + i * r * (1.65 / n), 0] }), { color: i % 2 ? c2 : color });
  } else if (kind === "fruit") {
    put(xf(sph, { sx: r * 0.8, sy: r * 0.95, sz: r * 0.8, at: [0, r * 0.5, 0] }), { color });
    put(xf(tubeGeo(r * 0.08, r * 0.06, r * 0.3, 5), { at: [0, r * 1.2, 0] }), { color: shade(c2, -0.3) });
  }
  return node;
}

/** Small tuft/blob cluster that always straddles the axis. */
/** Never below 9×5: a coarser ball is more than half hard creases. */
function ballGeo(tri) {
  return tri >= 100 ? sphereGeo(10, 5) : sphereGeo(9, 5);
}

/**
 * A rounded lump when the budget can pay for a genuinely smooth one, and a fan
 * of thin blades when it cannot. A cheap low-segment ball is all hard creases,
 * which is precisely what the audit's "faceted" gate is for; leafy blades stay
 * smooth at a third of the triangles, and read better on a plant anyway.
 */
function addLump(p, node, { at = [0, 0, 0], rx, ry, rz, color, colorFn, tri = 100, yaw = 0 }) {
  /* The threshold is deliberately BELOW what a smooth ball costs. A nine-by-five
     lathe is seventy-two triangles with not one hard edge; the blade fallback is
     cheaper per piece but every lens has two knife edges, and a crown made
     entirely of them is what pushed four trees past the faceted gate. Spending
     a little over budget here is paid back by the model-wide triangle ceiling. */
  if (tri >= 62) {
    p.add(node, xf(ballGeo(tri), { sx: rx, sy: ry, sz: rz, at }), { color, colorFn });
    return;
  }
  /* Thin leafy blades, not a ball: the flat lens keeps its two broad faces
     nearly coplanar, which is why it stays under the crease line where a
     cheap low-segment sphere would be all facets. Merged into one primitive. */
  const n = Math.max(2, Math.min(3, Math.floor(tri / 30)));
  const rows = 4;
  const g = [];
  for (let i = 0; i < n; i += 1) {
    const a = yaw + (i / n) * TAU;
    g.push(xf(bladeGeo({ len: rz * 1.8, wid: rx * 1.6, thick: ry * 0.9, shape: "elliptic", rows, ring: 4 }),
      { rx: 0.35 - 0.7 * (i % 2), ry: a, at: [at[0], at[1], at[2]] }));
  }
  p.add(node, mergeGeo(g), { color, colorFn });
}

/** A flat cap/shelf: a real dome when affordable, a thick lens when not. */
function addCap(p, node, { at = [0, 0, 0], r, h, shape = "dome", color, colorFn, tri = 140, rx = 0, ry = 0, sz = 1 }) {
  if (tri >= 96) {
    p.add(node, xf(capGeo(r, h, tri >= 150 ? 14 : 11, 5, shape), { sz, rx, ry, at }), { color, colorFn });
  } else {
    const lens = xf(bladeGeo({ len: r * 2, wid: r * 2, thick: h * 0.8, shape: "orbicular", rows: tri >= 52 ? 4 : 3, ring: 6 }), { at: [0, 0, -r] });
    p.add(node, xf(lens, { sz, rx, ry, at: [at[0], at[1] + h * 0.35, at[2]] }), { color, colorFn });
  }
}

function addTuft(p, node, { at = [0, 0, 0], r, n = 3, color, color2, squash = 1, tri = 120 }) {
  n = Math.max(2, Math.min(n, Math.max(2, Math.floor(tri / 60))));
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * TAU;
    const d = i === 0 ? 0 : r * 0.85;
    addLump(p, node, {
      rx: r * (0.7 + (0.3 * ((i * 7) % 3)) / 3), ry: r * squash, rz: r * 0.9, yaw: a, tri: tri / n,
      at: [at[0] + Math.cos(a) * d, at[1] + (i % 2) * r * 0.3, at[2] + Math.sin(a) * d],
      color: i % 2 ? color : color2 ?? color,
    });
  }
  return node;
}

/* ══ style plumbing ════════════════════════════════════════════════════════ */

const PHYLLO = ["alternate", "opposite", "whorled", "rosette", "spiral", "distichous"];

/** Azimuth for slot `g`, per the plant's phyllotaxy. */
function azimuth(pl, g, band, i, n) {
  const base = pl.u("az0") * TAU;
  switch (pl.phyllo) {
    case "opposite": return base + Math.floor(g / 2) * 1.5708 + (g % 2) * Math.PI;
    case "whorled": return base + (i / Math.max(1, n)) * TAU + band * 0.7;
    case "rosette": return base + g * 2.399;
    case "distichous": return base + (g % 2) * Math.PI + (g % 4 < 2 ? 0.16 : -0.16);
    case "spiral": return base + g * 1.875;
    default: return base + g * 2.399963;
  }
}

/**
 * How far a bottom-of-the-plant part may stick out. Circular, and keyed to the
 * SMALLER of the two aspects: the audit compares a base part's width against a
 * crown part's width, and those two can lie along different axes, so an
 * elliptical base reach lets a wide-axis root out-measure a narrow-axis crown.
 */
function baseReach(pl, scale = 1) {
  return (Math.min(pl.ax, pl.az) / 2) * scale;
}

/** Elliptical reach so the natural silhouette already sits near the target. */
function reachOf(pl, a, scale = 1) {
  const rx = (pl.ax / 2) * scale;
  const rz = (pl.az / 2) * scale;
  return Math.hypot(Math.cos(a) * rx, Math.sin(a) * rz);
}

function leafPalette(pl, col) {
  const base = leafOf(col);
  const deep = leafDeep(col);
  const tone = pl.u("tone");
  return {
    leaf: tone > 0.72 ? shade(base, 0.16) : tone < 0.24 ? mix(base, deep, 0.5) : base,
    deep,
    grad: grad(shade(base, 0.22), deep, -0.02, 0.06),
  };
}

/** Common driver: decode the plan, build the axis, fill every slot, normalise. */
function grow(k, col, style) {
  const p = new Plant(k, col, style);
  const pl = p.plan;
  pl.phyllo = style.phyllo ?? PHYLLO[pl.H("phyllo") % PHYLLO.length];
  pl.pal = leafPalette(pl, col);
  pl.shape = LEAF_SHAPE[pl.H("shape") % LEAF_SHAPE.length];
  pl.form = ["simple", "simple", "simple", "trifoliate", "palmate", "pinnate", "lobed"][pl.H("form") % 7];
  pl.flower = style.flowerKind ?? ["daisy", "star", "bell", "trumpet", "spike", "ball", "berry", "pea", "umbel", "cup", "catkin", "brush", "none"][pl.H("flw") % 13];

  style.spine(p, pl);
  let g = 0;
  const top = Math.max(...pl.slot.map((s) => s.band));
  for (const s of pl.slot) {
    if (s.band === SPINE_BAND && s.i === 0) {
      // The axis already occupies the first slot of its band. It must NOT be
      // re-placed: it spans [0,1] on purpose, and squashing it would move the
      // model's own height origin and scramble every other part's band.
      p.spineNode.at[1] = 0;
      g += 1;
      continue;
    }
    const node = p.part(`p${g}`);
    p.allowance = Math.min(p.tri, p.allowance) + p.budget * 1.4;
    const a = azimuth(pl, g, s.band, s.i, s.n);
    style.slot(p, pl, { node, band: s.band, i: s.i, n: s.n, g, a, top, t: (s.band + 0.5) / 6 });
    if (!node.parts.length) {
      // the triangle ceiling bit: give this slot the cheapest honest leaf so
      // the planned part count still holds
      p.add(node, xf(bladeGeo({ len: 0.09, wid: 0.045, thick: 0.008, shape: "elliptic", rows: 3, ring: 4 }),
        { rx: 0.3, ry: a }), { color: pl.pal.deep }, true);
    }
    p.anchor(node, pl.anchorColor ?? pl.pal.deep);
    p.place(node, s.band, s.i, s.n);
    g += 1;
  }
  p.finish();
  // idle: the whole plant breathes, a handful of parts sway out of phase
  k.cute.breathe(k.root, { k: style.breathe ?? 0.02 });
  const swingable = p.node.filter((n) => n !== p.spineNode && n.parts.length);
  const step = Math.max(1, Math.ceil(swingable.length / 8));
  swingable.forEach((n, i) => {
    if (i % step) return;
    k.cute.swing(n, { axis: i % 2 ? "x" : "z", amp: style.sway ?? 0.05, dur: 2.1 + (i % 5) * 0.3, phase: (i % 4) * 0.4 });
  });
  return p;
}

/* ══ the flower a species is actually known for ════════════════════════════
 *
 * About thirty-five species whose COMMON NAME is the flower were rendering as
 * plain green: sunflower, poinsettia, both hibiscus, four ixora, three
 * gardenia, African tulip, flamboyant, golden shower, and so on. The
 * archetypes could all draw a flower already — nothing told them to. This is
 * that instruction, keyed on the name, with the real colour rather than a
 * hashed pick from the pool, and read by shrub, tree, herb and vine alike so
 * one table fixes the lot.
 *
 * `kind` is an addFlower form; `r` is the head radius in axis units.
 */
const BLOOM = {
  // shrubs
  "hibiscus rosa-sinensis": { kind: "trumpet", color: "#ff3920", r: 0.085 },
  hibiscus: { kind: "trumpet", color: "#ff3920", r: 0.08 },
  ixora: { kind: "ball", color: "#ff3920", r: 0.055 },
  gardenia: { kind: "daisy", color: "#f8f4ec", r: 0.075, c2: "#f6d028" },
  calliandra: { kind: "brush", color: "#e8496a", r: 0.06 },
  mussaenda: { kind: "star", color: "#f8f4ec", r: 0.07, c2: "#f6b22d" },
  hamelia: { kind: "trumpet", color: "#ff6a20", r: 0.05 },
  caesalpinia: { kind: "brush", color: "#ff6a20", r: 0.065 },
  lantana: { kind: "ball", color: "#f6b22d", r: 0.05 },
  duranta: { kind: "spike", color: "#6a7fd8", r: 0.05 },
  tabernaemontana: { kind: "daisy", color: "#f8f4ec", r: 0.055, c2: "#f6d028" },
  nerium: { kind: "star", color: "#e84a8a", r: 0.055 },
  allamanda: { kind: "trumpet", color: "#f6d028", r: 0.075 },
  brunfelsia: { kind: "star", color: "#9a5ad8", r: 0.055 },
  clerodendrum: { kind: "ball", color: "#e84a8a", r: 0.06 },
  rosa: { kind: "daisy", color: "#e84a8a", r: 0.06 },
  bougainvillea: { kind: "star", color: "#e84a8a", r: 0.05 },
  jasminum: { kind: "star", color: "#f8f4ec", r: 0.045, c2: "#ffef8a" },
  plumbago: { kind: "star", color: "#6a7fd8", r: 0.045 },
  turnera: { kind: "daisy", color: "#f6d028", r: 0.05 },
  // the poinsettia is a BRACT, and only pulcherrima has it
  "euphorbia pulcherrima": { kind: "star", color: "#ff3920", r: 0.085 },
  "euphorbia milii": { kind: "star", color: "#ff3920", r: 0.04 },

  // trees
  spathodea: { kind: "trumpet", color: "#ff3920", r: 0.075 },
  delonix: { kind: "star", color: "#ff3920", r: 0.06 },
  cassia: { kind: "catkin", color: "#f6d028", r: 0.075 },
  senna: { kind: "spike", color: "#f6d028", r: 0.055 },
  peltophorum: { kind: "spike", color: "#f6d028", r: 0.06 },
  tabebuia: { kind: "trumpet", color: "#e8a0c8", r: 0.07 },
  handroanthus: { kind: "trumpet", color: "#f6d028", r: 0.07 },
  plumeria: { kind: "star", color: "#f8f4ec", r: 0.06, c2: "#f6d028" },
  lagerstroemia: { kind: "brush", color: "#c84ab5", r: 0.06 },
  millingtonia: { kind: "trumpet", color: "#f8f4ec", r: 0.055, c2: "#f6d028" },
  bauhinia: { kind: "star", color: "#e84a8a", r: 0.065 },
  cananga: { kind: "star", color: "#d8d84a", r: 0.055 },
  barringtonia: { kind: "brush", color: "#f8f4ec", r: 0.06, c2: "#e8496a" },
  erythrina: { kind: "brush", color: "#ff3920", r: 0.06 },
  callistemon: { kind: "brush", color: "#ff3920", r: 0.06 },
  jacaranda: { kind: "trumpet", color: "#9a5ad8", r: 0.06 },
  pterocarpus: { kind: "spike", color: "#f6d028", r: 0.05 },
  saraca: { kind: "ball", color: "#ff8c5a", r: 0.055 },
  michelia: { kind: "daisy", color: "#ffef8a", r: 0.05, c2: "#f6b22d" },
  magnolia: { kind: "daisy", color: "#f8f4ec", r: 0.07, c2: "#f6d028" },

  // herbs
  helianthus: { kind: "daisy", color: "#f6c22d", r: 0.12 },
  catharanthus: { kind: "star", color: "#e84a8a", r: 0.06 },
  impatiens: { kind: "star", color: "#e84a8a", r: 0.055 },
  cosmos: { kind: "daisy", color: "#e84a8a", r: 0.09 },
  chrysanthemum: { kind: "daisy", color: "#f6d028", r: 0.08 },
  tagetes: { kind: "daisy", color: "#f6b22d", r: 0.075 },
  zinnia: { kind: "daisy", color: "#ff3920", r: 0.08 },
  celosia: { kind: "spike", color: "#ff3920", r: 0.06 },
  gomphrena: { kind: "ball", color: "#c84ab5", r: 0.045 },
  portulaca: { kind: "daisy", color: "#e84a8a", r: 0.05 },
  torenia: { kind: "trumpet", color: "#6a7fd8", r: 0.045 },
  ruellia: { kind: "trumpet", color: "#9a5ad8", r: 0.07 },
  crossandra: { kind: "trumpet", color: "#ff8c5a", r: 0.055 },
  pentas: { kind: "ball", color: "#e84a8a", r: 0.05 },
  angelonia: { kind: "spike", color: "#9a5ad8", r: 0.05 },
  vinca: { kind: "star", color: "#e84a8a", r: 0.055 },
};

/**
 * The bloom this species is grown for, or null. Species-level entries win over
 * the genus, because Euphorbia pulcherrima is a poinsettia and Euphorbia
 * lactea is a cactus-looking hedge.
 */
function bloomOf(k) {
  const spec = BLOOM[sciOf(k)] ?? BLOOM[genusOf(k)];
  if (!spec) return null;
  return { kind: spec.kind, color: hex(spec.color), color2: spec.c2 ? hex(spec.c2) : null, r: spec.r ?? 0.055 };
}

/* ══ archetypes ════════════════════════════════════════════════════════════ */

// ---------- trees ----------

const CROWN_FORM = ["round", "broad", "conical", "vase", "layered", "columnar", "weeping", "open"];

/**
 * The crown core, drawn into the trunk part so that part carries the model to
 * y=1. Deliberately narrower than the sprays the slots hang off it: the axis
 * part is excluded from the audit's trunk/canopy comparison, the sprays are
 * what the canopy is measured by.
 */
function crownCore(p, pl, node, form, th, cw, leaf, deep) {
  const g = grad(shade(leaf, 0.22), deep, th, 1);
  const depth = 1 - th;
  let coreR = cw * 0.55, coreY = th + depth * 0.5;
  if (form === "conical") {
    const n = 3 + (pl.H("ly") % 3);
    for (let i = 0; i < n; i += 1) {
      const t = i / n;
      p.add(node, xf(capGeo(cw * 0.62 * (1 - t * 0.78), depth / n + depth * 0.16, 11, 4, "cone"),
        { at: [0, th + t * depth * 0.96, 0] }), { color: mix(deep, leaf, 0.2 + t * 0.5) });
    }
    coreR = cw * 0.62; coreY = th + depth * 0.16;
  } else if (form === "broad" || form === "layered") {
    const n = form === "broad" ? 2 : 3;
    for (let i = 0; i < n; i += 1) {
      const t = i / (n - 1);
      p.add(node, xf(capGeo(cw * (0.46 - t * 0.14), depth * (0.36 - t * 0.09), 12, 4, "flat"),
        { at: [0, th + t * depth * 0.66, 0] }), { color: i % 2 ? deep : leaf, colorFn: g });
    }
    coreR = cw * 0.46; coreY = th + depth * 0.2;
  } else if (form === "vase") {
    p.add(node, xf(capGeo(cw * 0.4, depth, 12, 5, "funnel"), { at: [0, th, 0] }), { color: leaf, colorFn: g });
    coreR = cw * 0.4; coreY = th + depth * 0.72;
  } else if (form === "columnar") {
    p.add(node, xf(sphereGeo(11, 6), { sx: cw * 0.26, sy: depth * 0.52, sz: cw * 0.26, at: [0, th + depth * 0.5, 0] }), { color: leaf, colorFn: g });
    coreR = cw * 0.26; coreY = th + depth * 0.5;
  } else if (form === "open") {
    p.add(node, xf(sphereGeo(10, 5), { sx: cw * 0.22, sy: depth * 0.28, sz: cw * 0.22, at: [0, 1 - depth * 0.3, 0] }), { color: leaf, colorFn: g });
    coreR = cw * 0.22; coreY = 1 - depth * 0.3;
  } else {
    const d = 0.44 + pl.u("cy") * 0.16;
    p.add(node, xf(sphereGeo(11, 6), { sx: cw * 0.38, sy: depth * d * 0.85, sz: cw * 0.38, at: [0, 1 - depth * d, 0] }), { color: leaf, colorFn: g });
    coreR = cw * 0.38; coreY = 1 - depth * d;
  }
  return { coreR, coreY };
}

/**
 * Conifers, picked by GENUS. The tiered-conical crown path already existed and
 * Araucaria columnaris found it because the routing table happened to name it;
 * its congener A. heterophylla — the Norfolk Island Pine, the most conical
 * tree on campus — missed it and came out a broad flat blob, because the crown
 * form was chosen by hash. A hash is not a way to decide whether something is
 * a pine.
 */
const CONIFER_GENUS = new Set((
  "araucaria pinus picea abies casuarina agathis podocarpus cupressus thuja " +
  "juniperus cryptomeria taxodium cedrus larix"
).split(" "));

function tree(k, col, opt = {}) {
  const spec = bloomOf(k);
  const conifer = CONIFER_GENUS.has(genusOf(k));
  const forced = conifer ? "conical"
    : opt.canopy === "conifer" ? "conical"
    : opt.canopy === "umbrella" ? "broad"
      : opt.canopy === "balete" ? "round"
        : null;
  grow(k, col, {
    /* Fruit and bloom are part of the salt: they change what a tree carries, so
       two trees that differ only in whether they fruit should not be handed the
       same lattice cell. Dao and Katmon landed 0.116 apart without this, just
       under the 0.12 distinctness floor. */
    salt: "tree:" + (opt.canopy ?? "auto") + (spec ? "b" : "") + (conifer ? "c" : "") + (opt.fruit ? "f" : "") + (opt.thick ? "t" : ""),
    upright: true,
    // a conifer is a spire: it never gets to be as wide as it is tall
    axSet: conifer ? [0.3, 0.5, 0.7] : ASPECT_UP,
    azSet: conifer ? [0.3, 0.5, 0.7] : ASPECT_UP,
    maxAniso: 1.9,
    // fewer, better-fed canopy sprays: at thirty-two parts each one is down to
    // forty-eight triangles, which buys two two-row blades and reads as facets
    pLevel: [10, 16, 22, 28],
    height: (pl) => 0.7 + pl.u("size") * 0.55,
    breathe: 0.012,
    sway: 0.03,
    bands: [0, 1, 2, 3, 4, 5],
    spine(p, pl) {
      pl.crownForm = forced ?? CROWN_FORM[pl.H("crownform") % CROWN_FORM.length];
      pl.conifer = conifer;
      // a pencil footprint has to carry a pencil crown, or it reads as a ball
      // skewered on a stick
      if (Math.max(pl.ax, pl.az) <= 0.2) pl.crownForm = pl.H("col") % 2 ? "columnar" : "conical";
      // how much bare trunk shows under the foliage: the other half of "reads
      // as a tree", and it costs the silhouette nothing
      pl.trunkH = 0.2 + pl.u("th") * 0.34;
      pl.crownW = ((pl.ax + pl.az) / 2) * 0.92;
      pl.anchorColor = shade(trunkOf(col), 0.05);
      const tr = trunkOf(col);
      const thick = opt.thick ? 1.45 : 1;
      const r0 = (0.026 + pl.u("tr") * 0.03) * thick;
      const lean = (pl.u("lean") - 0.5) * 0.14;
      p.spine("trunk", (node) => {
        p.add(node, xf(tubeGeo(r0 * (1.2 + pl.u("flare") * 0.7), r0 * (0.4 + pl.u("taper") * 0.45), pl.trunkH + 0.05, 12, r0 * 0.1), { rz: lean }),
          { color: tr, colorFn: grad(shade(tr, 0.14), shade(tr, -0.22), 0, pl.trunkH) });
        const core = crownCore(p, pl, node, pl.crownForm, pl.trunkH, pl.crownW, pl.pal.leaf, pl.pal.deep);
        // The face belongs in the crown — a tree that smiles from its ankles
        // reads as a post with eyes — and it has to sit ON the crown, not
        // inside it, so it is pinned to the core's own widest radius.
        const fr = Math.max(0.03, Math.min(core.coreR * 0.42, pl.crownW * 0.16));
        addFace(p, node, { at: [0, core.coreY, core.coreR * 0.88], r: fr, tri: p.budget * 8 });
      });
    },
    slot(p, pl, s) {
      const { node, band, a } = s;
      const tr = trunkOf(col);
      if (band === 0) {
        // buttress flare, held inside the base reach so a root can never
        // out-measure the crown it is supposed to be holding up
        const br = baseReach(pl, 0.34);
        const n = 2 + (s.g % 2);
        for (let j = 0; j < n; j += 1) {
          const aa = a + (j - (n - 1) / 2) * 0.8;
          p.add(node, xf(coneGeo(br * 0.34, br * (0.85 + pl.u("bt" + s.g + j) * 0.6), 9),
            { rz: -Math.cos(aa) * 1.15, rx: Math.sin(aa) * 1.15 }), { color: shade(tr, -0.12) });
        }
        return;
      }
      if (band === 1) {
        const br = baseReach(pl, 0.4);
        addLump(p, node, {
          rx: br * 0.7, ry: br * 0.55, rz: br * 0.7, yaw: a, tri: p.budget,
          at: [Math.cos(a) * br * 0.4, 0, Math.sin(a) * br * 0.4],
          color: s.g % 2 ? pl.pal.deep : mix(pl.pal.leaf, pl.pal.deep, 0.6), colorFn: pl.pal.grad,
        });
        return;
      }
      if (band === 2) {
        /* A branch and its foliage, MIRRORED. Drawn on one side only it is a
           horizontal bar with a ball on the end sticking out sideways like a
           scarecrow's arm — about fifteen trees shipped that barbell — and it
           also drags the whole crown off the trunk axis. */
        const rise = pl.crownForm === "columnar" ? 1.15
          : pl.crownForm === "vase" ? 1.0
            : pl.crownForm === "weeping" ? 0.3 : 0.7;
        const len = reachOf(pl, a, 0.5 + pl.u("bl" + s.g) * 0.35);
        for (const sgn of [1, -1]) {
          const aa = a + (sgn > 0 ? 0 : Math.PI);
          const L = len * (sgn > 0 ? 1 : 0.78);
          p.add(node, xf(tubeGeo(0.015, 0.007, L, 9), { rz: -Math.cos(aa) * (1.57 - rise), rx: Math.sin(aa) * (1.57 - rise) }), { color: tr });
          addLump(p, node, {
            rx: L * 0.3, ry: L * 0.22, rz: L * 0.3, yaw: aa, tri: p.budget * 0.55,
            at: [Math.cos(aa) * L * 0.72, L * 0.3, Math.sin(aa) * L * 0.72],
            color: (s.g + (sgn > 0 ? 0 : 1)) % 2 ? pl.pal.leaf : pl.pal.deep, colorFn: pl.pal.grad,
          });
        }
        return;
      }
      /* Flowering trees. Spathodea is the African tulip, Delonix the
         flamboyant, Cassia fistula the golden shower: the flower is the whole
         reason anyone knows the tree, and all of them shipped plain green. */
      if (spec && band >= 3 && s.i % 2 === 0) {
        /* Out at the crown SURFACE. At 0.62 of the reach the flowers were
           genuinely in the file — a hundred and seventy red vertices on the
           African tulip — and every one of them was buried inside the foliage. */
        const r = reachOf(pl, a, 1.0);
        /* Deliberately over the per-part budget. addFlower falls back to a
           three-scale BUD under 58 triangles, and a bud is invisible at
           gallery size — which is the whole complaint about the flowering
           trees. A crown spray can afford to be one lump smaller. */
        addFlower(p, node, {
          tri: Math.max(120, p.budget), at: [Math.cos(a) * r, 0, Math.sin(a) * r], yaw: a,
          kind: spec.kind, r: spec.r, color: spec.color, color2: spec.color2 ?? shade(spec.color, 0.28), stalkLen: 0.025,
        });
        return;
      }
      if (opt.fruit && band >= 4 && s.i % 3 === 0) {
        const r = reachOf(pl, a, 0.45);
        addFlower(p, node, {
          tri: p.budget, at: [Math.cos(a) * r, 0, Math.sin(a) * r],
          kind: "fruit", r: 0.05, color: flowerOf(col), stalkLen: 0.03,
        });
        return;
      }
      // canopy spray. It fans around its azimuth, so it measures wide along
      // BOTH horizontal axes and the trunk/canopy test cannot be gamed by an
      // anisotropic aspect.
      const t = (band - 3) / 2;
      const shapeR = pl.crownForm === "conical" ? 1 - t * 0.62
        : pl.crownForm === "vase" ? 0.55 + t * 0.45
          : pl.crownForm === "broad" ? 1 - t * 0.3
            : pl.crownForm === "columnar" ? 0.62
              : 1 - t * 0.18;
      const r = reachOf(pl, a, (0.55 + pl.u("cb" + s.g) * 0.4) * shapeR);
      const rr = Math.max(0.032, r * (0.34 + pl.u("cs" + s.g) * 0.3));
      /* Both sides, always. One-sided sprays are what pushed crowns off the
         trunk axis; the far side is smaller so the crown still has a shape. */
      const side = [[0, 1, 0.62], [Math.PI, 0.72, 0.4]];
      const fan = p.budget >= 110 ? 2 : 1;
      for (const [off, k2, share] of side) {
        for (let j = 0; j < fan; j += 1) {
          const aa = a + off + (j - (fan - 1) / 2) * 0.62;
          addLump(p, node, {
            rx: rr * k2, ry: rr * k2 * (0.62 + pl.u("cf" + s.g) * 0.4), rz: rr * k2, yaw: aa, tri: (p.budget * share) / fan,
            at: [Math.cos(aa) * r * k2, (j % 2) * rr * 0.35, Math.sin(aa) * r * k2],
            color: (s.g + j + (k2 < 1 ? 1 : 0)) % 2 ? pl.pal.leaf : pl.pal.deep, colorFn: pl.pal.grad,
          });
        }
      }
      if (pl.crownForm === "weeping" && p.budget >= 40) {
        p.add(node, xf(bladeGeo({ len: r * 0.8, wid: r * 0.14, thick: 0.008, shape: "linear", rows: 4, ring: 4, bend: -r * 0.3 }),
          { rx: 1.25, ry: a, at: [Math.cos(a) * r * 0.85, -rr * 0.4, Math.sin(a) * r * 0.85] }), { color: pl.pal.deep });
      }
      if (opt.canopy === "balete" && band === 3 && s.i % 2 === 0) {
        p.add(node, xf(tubeGeo(0.01, 0.005, 0.26, 9), { at: [Math.cos(a) * r * 0.7, -0.26, Math.sin(a) * r * 0.7] }), { color: tr });
      }
    },
  });
}

function papaya(k, col) {
  grow(k, col, {
    salt: "papaya",
    upright: true,
    axSet: ASPECT_CROWN,
    azSet: ASPECT_CROWN,
    // a crown-tufted plant carries its leaves at the top, so band 3 is left
    // to the axis alone and the foliage units can only land in 4 and 5
    height: (pl) => 0.72 + pl.u("size") * 0.3,
    breathe: 0.014,
    bands: [0, 1, 2, 4, 5],
    spine(p, pl) {
      pl.anchorColor = trunkOf(col);
      p.spine("trunk", (node) => {
        const tr = trunkOf(col);
        p.add(node, xf(tubeGeo(0.05, 0.03, 0.84, 12)), { color: tr, colorFn: grad(shade(tr, 0.15), shade(tr, -0.2), 0, 0.84) });
        p.add(node, xf(sphereGeo(11, 5), { sx: 0.055, sy: 0.07, sz: 0.055, at: [0, 0.9, 0] }), { color: pl.pal.deep });
        addFace(p, node, { at: [0, 0.62, 0.036], r: 0.055, tri: p.budget * 8 });
      });
    },
    slot(p, pl, s) {
      const { node, band, a } = s;
      if (band <= 2) {
        const br = baseReach(pl, 0.34);
        addFlower(p, node, {
          tri: p.budget, at: [Math.cos(a) * br * 0.5, 0, Math.sin(a) * br * 0.5],
          kind: "fruit", r: Math.min(0.06, br * 0.9), color: flowerOf(col), stalkLen: 0.02,
        });
        return;
      }
      // a papaya holds its palmate blades OUT on long petioles, level with the
      // crown or above it; drooping them turns the crown into a mop
      const r = reachOf(pl, a, 0.95);
      addLeaf(p, node, {
        tri: p.budget, yaw: a, pitch: -0.45 + pl.u("lp" + s.g) * 0.55,
        len: r, wid: r * 0.8, shape: "orbicular", form: "palmate", leaflet: 5 + (s.g % 3),
        bend: -r * 0.2,
        color: pl.pal.leaf, colorFn: pl.pal.grad, stalkColor: pl.pal.deep, stalk: 0.48,
      });
    },
  });
}

/**
 * Palms. The complaints, in order of how much of the family they spoil:
 *
 *   - the trunk was a short fat barrel one to two crown-widths tall. Cocos,
 *     Roystonea, Elaeis, Archontophoenix and Areca are tall COLUMNS; that
 *     proportion is most of what makes a palm a palm.
 *   - the crown shaft was a fat opaque green tube capping the stump, so about
 *     nine of them had a dome where the fronds should be. It is now slim and
 *     short, and the axis is carried to full height by the unopened SPEAR
 *     leaf, which is what actually sticks up out of a palm crown.
 *   - Livistona and Licuala are FAN palms and were drawn pinnate; Licuala is
 *     one circular pleated disc. Caryota is a fishtail and had no fishtail.
 *     Rhapis is a clump of thin reed canes.
 */
const PALM_TALL = new Set((
  "cocos roystonea elaeis archontophoenix areca adonidia wodyetia veitchia " +
  "syagrus washingtonia sabal borassus corypha livistona"
).split(" "));
const PALM_FAN = new Set("livistona licuala rhapis washingtonia sabal corypha borassus trachycarpus".split(" "));
const PALM_CLUMP = new Set("rhapis chrysalidocarpus dypsis chamaedorea arenga ptychosperma caryota".split(" "));

function palm(k, col, opt = {}) {
  const g = genusOf(k);
  const fan = PALM_FAN.has(g) || !!opt.fan;
  const disc = g === "licuala";
  const fishtail = g === "caryota" || !!opt.fishtail;
  const clump = PALM_CLUMP.has(g) || !!opt.clump;
  const reed = g === "rhapis";
  const bottle = g === "hyophorbe";
  const tall = PALM_TALL.has(g) ? 1 : reed || g === "chamaedorea" ? 0 : 0.45;

  grow(k, col, {
    salt: `palm:${fan ? "f" : ""}${disc ? "d" : ""}${fishtail ? "t" : ""}${clump ? "c" : ""}${tall}`,
    upright: true,
    axSet: ASPECT_CROWN,
    azSet: ASPECT_CROWN,
    height: (pl) => (0.8 + pl.u("size") * 0.5) * (1 + tall * 0.28),
    /* A palm carries eight to twenty fronds, not thirty-two, and the
       difference is what pays for each of them to be a divided FROND rather
       than the broad undivided blade a 48-triangle budget can afford. */
    pLevel: [8, 12, 16, 20],
    breathe: 0.012,
    sway: 0.04,
    bands: [0, 1, 2, 4, 5],
    spine(p, pl) {
      pl.fan = fan; pl.disc = disc; pl.fishtail = fishtail; pl.clump = clump; pl.reed = reed;
      pl.anchorColor = pl.pal.deep;
      /* A columnar palm carries three quarters of its height as bare trunk.
         The first pass topped out at 0.8 of ONE unit and then let the crown
         shaft eat half of that. */
      pl.trunkH = reed ? 0.52 + pl.u("th") * 0.1 : 0.5 + tall * 0.26 + pl.u("th") * 0.12;
      pl.r0 = (reed ? 0.014 : 0.019 + pl.u("tr") * 0.016) * (1 - tall * 0.22);
      p.spine("trunk", (node) => {
        const tr = trunkOf(col);
        const { trunkH, r0 } = pl;
        p.add(node, xf(tubeGeo(r0 * (bottle ? 2.1 : 1.3), r0 * (bottle ? 0.55 : 0.82 + pl.u("tp") * 0.16), trunkH, 12, bottle ? r0 * 1.5 : 0)),
          { color: tr, colorFn: grad(shade(tr, 0.14), shade(tr, -0.22), 0, trunkH) });
        const rings = 4 + (pl.H("rg") % 6);
        for (let i = 1; i <= rings; i += 1) {
          p.add(node, xf(discGeo(r0 * 1.12, r0 * 0.14, 9), { at: [0, (i / (rings + 1)) * trunkH, 0] }), { color: shade(tr, -0.22) });
        }
        // a SLIM crown shaft — not the opaque green barrel that was capping
        // the stump and standing in for the whole crown
        const cs = Math.min(0.13, (1 - trunkH) * 0.32);
        p.add(node, xf(tubeGeo(r0 * 1.12, r0 * 0.7, cs, 11), { at: [0, trunkH, 0] }), { color: mix(pl.pal.deep, pl.pal.leaf, 0.35) });
        // the unopened spear leaf carries the axis to full height, the way it
        // actually sticks out of a palm crown
        p.add(node, xf(bladeGeo({ len: 1 - trunkH - cs, wid: r0 * 1.5, thick: r0 * 0.7, shape: "needle", rows: 4, ring: 6, bend: 0.04 }),
          { rx: -Math.PI / 2 + 0.1, at: [0, trunkH + cs, 0] }), { color: pl.pal.deep });
        addFace(p, node, { at: [0, trunkH * 0.62, r0 * 1.25], r: Math.max(0.03, r0 * 1.5), tri: p.budget * 8 });
      });
    },
    slot(p, pl, s) {
      const { node, band, a } = s;
      if (band <= 1) {
        const br = baseReach(pl, 0.36);
        if (pl.clump) {
          // sucker canes at the foot of the clump. Rhapis is nothing but these.
          p.add(node, xf(tubeGeo(br * (pl.reed ? 0.16 : 0.3), br * (pl.reed ? 0.12 : 0.2), br * (pl.reed ? 4.2 : 2.6), 9), { rz: -Math.cos(a) * 0.16, rx: Math.sin(a) * 0.16 }), { color: trunkOf(col) });
          if (pl.reed && p.budget >= 50) {
            addLeaf(p, node, {
              tri: p.budget * 0.6, yaw: a, pitch: -0.8, at: [Math.cos(a) * br * 0.7, br * 4, Math.sin(a) * br * 0.7],
              len: br * 2.2, wid: br * 1.8, shape: "linear", form: "palmate", leaflet: 5,
              color: pl.pal.deep, colorFn: pl.pal.grad, stalk: 0.3, stalkColor: trunkOf(col),
            });
          }
        } else {
          p.add(node, xf(coneGeo(br * 0.34, br * 1.1, 9), { rz: -Math.cos(a) * 1.0, rx: Math.sin(a) * 1.0 }), { color: trunkOf(col) });
        }
        return;
      }
      if (band === 2 || (opt.coconut && band === 3 && s.i % 3 === 0)) {
        const br = baseReach(pl, 0.34);
        addFlower(p, node, {
          tri: p.budget, at: [Math.cos(a) * br * 0.6, 0, Math.sin(a) * br * 0.6],
          kind: "fruit", r: Math.min(0.055, br), color: opt.coconut ? hex("#7a4e2a") : flowerOf(col), stalkLen: 0.02,
        });
        return;
      }

      const r = reachOf(pl, a, 0.95);
      if (pl.disc) {
        // Licuala: one circular pleated disc on a long petiole, and nothing else
        const L = r * 0.55;
        p.add(node, xf(tubeGeo(0.011, 0.008, L, 9), { rz: -Math.cos(a) * 0.85, rx: Math.sin(a) * 0.85 }), { color: pl.pal.deep });
        p.add(node, xf(crustGeo({ r: r * 0.62, thick: r * 0.09, lobe: 11, wob: 0.09, seg: p.budget >= 70 ? 22 : 14, rise: 1 }),
          { rx: 0.45, ry: a, at: [Math.cos(a) * (L * 0.75 + r * 0.5), L * 0.66, Math.sin(a) * (L * 0.75 + r * 0.5)] }),
        { color: s.g % 2 ? pl.pal.leaf : pl.pal.deep, colorFn: pl.pal.grad });
        return;
      }
      addLeaf(p, node, {
        tri: p.budget, yaw: a, pitch: (pl.fan ? -0.35 : -0.15) + pl.u(`fp${s.g}`) * 0.85,
        len: r * (pl.fan ? 0.85 : 1.15),
        wid: r * (pl.fan ? 1.05 : pl.fishtail ? 0.42 : 0.24 + pl.u(`fw${s.g}`) * 0.12),
        shape: pl.fishtail ? "spatulate" : "linear",
        form: pl.fan ? "palmate" : "ladder",
        leaflet: pl.fan ? 7 : 9,
        bend: -r * (pl.fan ? 0.2 : 0.45 + pl.u(`fb${s.g}`) * 0.4),
        color: s.g % 2 ? pl.pal.leaf : pl.pal.deep, colorFn: pl.pal.grad, stalkColor: pl.pal.deep,
        stalk: pl.fan ? 0.42 : 0.18,
      });
    },
  });
}

/**
 * Banana kin — Musaceae, Heliconiaceae, Zingiberales generally. All thirteen
 * had no pseudostem, no paddle leaves and no inflorescence, which between
 * them is the entire family. Musa acuminata was a sprig of four pointed
 * leaves; Heliconia, which is DEFINED by the pendant lobster-claw bract, had
 * no bract at all; Alpinia, Costus and Canna are grown for a red
 * inflorescence and were plain green.
 */
const HELICONIA_GENUS = new Set("heliconia".split(" "));
const GINGER_GENUS = new Set("alpinia costus curcuma hellenia etlingera zingiber hedychium".split(" "));
const CANNA_GENUS = new Set("canna".split(" "));
const MUSA_GENUS = new Set("musa ensete".split(" "));

/** The pendant lobster claw: a zigzag rachis with alternating keeled bracts. */
function lobsterClaw(p, node, { at, yaw, len, color, color2, n = 5, tri = 200 }) {
  const rachis = [];
  const bract = [[], []];
  let y = 0;
  for (let i = 0; i < n; i += 1) {
    const side = i % 2 ? 1 : -1;
    const step = len / n;
    rachis.push(xf(tubeGeo(0.011, 0.009, step * 1.1, 7), { rz: side * 0.42, ry: yaw, at: [Math.sin(yaw) * side * 0.012 * i, y - step, Math.cos(yaw) * side * 0.012 * i] }));
    bract[i % 2].push(xf(bladeGeo({ len: len * (0.42 - i * 0.04), wid: len * 0.19, thick: len * 0.05, shape: "hastate", rows: 3, ring: 4, bend: len * 0.1 }),
      { rx: 0.28, ry: yaw + (side > 0 ? 0.5 : -0.5) + Math.PI / 2, at: [0, y - step * 0.5, 0] }));
    y -= step;
  }
  p.add(node, xf(mergeGeo(rachis), { at }), { color: shade(color, -0.35) });
  p.add(node, xf(mergeGeo(bract[0]), { at }), { color });
  p.add(node, xf(mergeGeo(bract[1]), { at }), { color: color2 });
}

/** An erect cone of overlapping bracts — red ginger, torch ginger, Costus. */
function bractCone(p, node, { at, yaw, r, h, color, color2, tiers = 5 }) {
  const g = [[], []];
  for (let i = 0; i < tiers; i += 1) {
    const t = i / tiers;
    const rr = r * (1 - t * 0.72);
    const n = 4;
    for (let j = 0; j < n; j += 1) {
      const a = yaw + j * (TAU / n) + i * 0.8;
      g[i % 2].push(xf(bladeGeo({ len: rr * 1.5, wid: rr * 1.1, thick: rr * 0.22, shape: "ovate", rows: 3, ring: 4, bend: -rr * 0.3 }),
        { rx: -0.85, ry: a, at: [0, t * h, 0] }));
    }
  }
  p.add(node, xf(mergeGeo(g[0]), { at }), { color });
  p.add(node, xf(mergeGeo(g[1]), { at }), { color: color2 });
}

function bananaKind(k, col, opt = {}) {
  const g = genusOf(k);
  const claw = HELICONIA_GENUS.has(g);
  const ginger = GINGER_GENUS.has(g);
  const canna = CANNA_GENUS.has(g);
  const musa = MUSA_GENUS.has(g) || (!claw && !ginger && !canna);
  const spiral = g === "costus";
  const bractCol = claw ? hex("#ff3920") : canna ? hex("#ff3920") : ginger ? hex("#e8496a") : hex("#8a3a5a");
  grow(k, col, {
    salt: `banana:${claw ? "claw" : ginger ? "ginger" : canna ? "canna" : "musa"}`,
    upright: true,
    axSet: ASPECT_CROWN,
    azSet: ASPECT_CROWN,
    phyllo: spiral ? "spiral" : undefined,
    height: (pl) => 0.66 + pl.u("size") * 0.34,
    // a banana carries a handful of huge paddles, not thirty-two scraps
    pLevel: [8, 11, 14, 18],
    breathe: 0.014,
    bands: [0, 1, 2, 4, 5],
    spine(p, pl) {
      pl.claw = claw; pl.ginger = ginger; pl.canna = canna; pl.musa = musa;
      pl.bractCol = bractCol;
      pl.anchorColor = pl.pal.deep;
      p.spine("pseudostem", (node) => {
        const tr = mix(trunkOf(col), pl.pal.leaf, 0.55);
        const stemH = 0.44 + pl.u("sh") * 0.22;
        const r0 = 0.05 + pl.u("sr") * 0.03;
        /* The pseudostem is a column of rolled leaf SHEATHS, and its bulk is
           what makes the plant read as a banana rather than as a herb. */
        p.add(node, xf(tubeGeo(r0 * 1.35, r0 * 0.72, stemH, 13)), { color: tr, colorFn: grad(shade(tr, 0.2), shade(tr, -0.22), 0, stemH) });
        const sheath = [];
        for (let i = 0; i < 5; i += 1) {
          const a = i * 2.399 + pl.u("s0") * TAU;
          sheath.push(xf(bladeGeo({ len: stemH * (0.55 + 0.18 * (i % 3)), wid: r0 * 1.5, thick: r0 * 0.5, shape: "linear", rows: 3, ring: 4 }),
            { rx: -Math.PI / 2 + 0.04, ry: a, at: [Math.cos(a) * r0 * 0.9, 0, Math.sin(a) * r0 * 0.9] }));
        }
        p.add(node, mergeGeo(sheath), { color: shade(tr, -0.1) });
        p.add(node, xf(tubeGeo(r0 * 0.7, r0 * 0.32, 1 - stemH, 11), { at: [0, stemH, 0] }), { color: pl.pal.deep });
        addFace(p, node, { at: [0, stemH * 0.58, r0 * 1.15], r: Math.max(0.04, r0 * 1.1), tri: p.budget * 8 });
      });
    },
    slot(p, pl, s) {
      const { node, band, a, top } = s;
      if (band <= 1) {
        // suckers at the foot of the clump
        const br = baseReach(pl, 0.38);
        p.add(node, xf(tubeGeo(br * 0.36, br * 0.18, br * 2.6, 10), { rz: -Math.cos(a) * 0.2, rx: Math.sin(a) * 0.2 }), { color: mix(trunkOf(col), pl.pal.leaf, 0.5) });
        p.add(node, xf(bladeGeo({ len: br * 1.6, wid: br * 0.7, thick: 0.01, shape: "elliptic", rows: 3, ring: 4 }), { rx: -1.25, ry: a, at: [0, br * 1.6, 0] }), { color: pl.pal.deep });
        return;
      }
      // the inflorescence: the one thing that names the species
      if (band === 2 || (band >= top - 1 && s.i === 0 && !pl.musa)) {
        const br = baseReach(pl, 0.8);
        if (pl.claw) {
          lobsterClaw(p, node, {
            at: [Math.cos(a) * br * 0.35, 0.12, Math.sin(a) * br * 0.35], yaw: a,
            len: Math.min(0.42, br * 2.2), color: pl.bractCol, color2: shade(pl.bractCol, -0.22),
            n: 4 + (s.g % 2), tri: p.budget,
          });
        } else if (pl.ginger || pl.canna) {
          bractCone(p, node, {
            at: [Math.cos(a) * br * 0.3, 0, Math.sin(a) * br * 0.3], yaw: a,
            r: Math.min(0.07, br * 0.55), h: Math.min(0.2, br * 1.4),
            color: pl.bractCol, color2: shade(pl.bractCol, 0.25), tiers: p.budget >= 70 ? 5 : 3,
          });
        } else {
          // the banana heart: a pendant purple bud with a hand of fruit above
          const hb = [Math.cos(a) * br * 0.4, 0.06, Math.sin(a) * br * 0.4];
          p.add(node, xf(tubeGeo(0.012, 0.01, br * 0.5, 8), { rz: -Math.cos(a) * 0.6, rx: Math.sin(a) * 0.6, at: [0, 0.12, 0] }), { color: pl.pal.deep });
          p.add(node, xf(capGeo(0.055, 0.22, 12, 5, "cone"), { rx: Math.PI - 0.3, ry: a, at: hb }), { color: pl.bractCol, colorFn: grad(shade(pl.bractCol, 0.2), shade(pl.bractCol, -0.3), -0.2, 0.05) });
          const finger = [];
          for (let i = 0; i < 5; i += 1) {
            const aa = a + (i / 5) * TAU;
            finger.push(xf(arcTubeGeo({ R: 0.05, r: 0.014, a0: 0.2, a1: 1.1, segs: 4, ring: 6 }), { ry: aa, at: [hb[0], hb[1] + 0.1, hb[2]] }));
          }
          p.add(node, mergeGeo(finger), { color: flowerOf(col) });
        }
        return;
      }
      // a huge paddle leaf, held up out of the crown and arching over
      const r = reachOf(pl, a, 1.0);
      addLeaf(p, node, {
        tri: p.budget, yaw: a, pitch: -0.5 + pl.u(`bl${s.g}`) * 0.85,
        len: r * 1.15, wid: r * (0.44 + pl.u(`bw${s.g}`) * 0.22), shape: "elliptic",
        rows: 6, ring: 4, bend: -r * 0.55, fold: 0.3, stalk: 0.16,
        color: s.g % 2 ? pl.pal.leaf : pl.pal.deep, colorFn: pl.pal.grad, stalkColor: pl.pal.deep,
      });
    },
  });
}

function pandanus(k, col) {
  grow(k, col, {
    salt: "pandanus",
    upright: true,
    axSet: ASPECT_CROWN,
    azSet: ASPECT_CROWN,
    // a crown-tufted plant carries its leaves at the top, so band 3 is left
    // to the axis alone and the foliage units can only land in 4 and 5
    height: (pl) => 0.6 + pl.u("size") * 0.3,
    breathe: 0.014,
    bands: [0, 1, 2, 4, 5],
    spine(p, pl) {
      pl.anchorColor = pl.pal.deep;
      p.spine("trunk", (node) => {
        const tr = trunkOf(col);
        const h = 0.28 + pl.u("h") * 0.2;
        p.add(node, xf(tubeGeo(0.038, 0.046, h, 12)), { color: tr });
        p.add(node, xf(bladeGeo({ len: 1 - h, wid: 0.07, thick: 0.014, shape: "linear", rows: 6, ring: 4, bend: -0.1 }), { rx: -Math.PI / 2, at: [0, h, 0] }), { color: pl.pal.deep });
        addFace(p, node, { at: [0, h * 0.55, 0.045], r: 0.04, tri: p.budget * 8 });
      });
    },
    slot(p, pl, s) {
      const { node, band, a } = s;
      if (band <= 1) {
        const br = baseReach(pl, 0.42);
        p.add(node, xf(tubeGeo(br * 0.24, br * 0.14, br * 2, 9), { rz: -Math.cos(a) * 0.55, rx: Math.sin(a) * 0.55 }), { color: trunkOf(col) });
        return;
      }
      const r = reachOf(pl, a, 0.95);
      addLeaf(p, node, {
        tri: p.budget, yaw: a, pitch: 0.45 + pl.u("sw" + s.g) * 0.7, len: r, wid: r * 0.16,
        shape: "linear", bend: -r * 0.4, stalk: 0.05,
        color: s.g % 2 ? pl.pal.leaf : pl.pal.deep, colorFn: pl.pal.grad,
      });
    },
  });
}

function cycad(k, col) {
  grow(k, col, {
    salt: "cycad",
    upright: true,
    axSet: ASPECT_CROWN,
    azSet: ASPECT_CROWN,
    // a crown-tufted plant carries its leaves at the top, so band 3 is left
    // to the axis alone and the foliage units can only land in 4 and 5
    height: (pl) => 0.45 + pl.u("size") * 0.3,
    breathe: 0.014,
    bands: [0, 1, 2, 4, 5],
    spine(p, pl) {
      pl.anchorColor = pl.pal.deep;
      p.spine("caudex", (node) => {
        const tr = trunkOf(col);
        const h = 0.3 + pl.u("h") * 0.2;
        p.add(node, xf(tubeGeo(0.07, 0.058, h, 12, 0.012)), { color: tr, colorFn: grad(shade(tr, 0.1), shade(tr, -0.25), 0, h) });
        p.add(node, xf(capGeo(0.055, 1 - h, 12, 5, "cone"), { at: [0, h, 0] }), { color: pl.pal.deep });
        addFace(p, node, { at: [0, h * 0.55, 0.07], r: 0.05, tri: p.budget * 8 });
      });
    },
    slot(p, pl, s) {
      const { node, band, a } = s;
      if (band <= 1) {
        const br = baseReach(pl, 0.36);
        p.add(node, xf(coneGeo(br * 0.34, br * 1.1, 9), { rz: -Math.cos(a) * 1.1, rx: Math.sin(a) * 1.1 }), { color: shade(trunkOf(col), -0.1) });
        return;
      }
      const r = reachOf(pl, a, 0.95);
      addLeaf(p, node, {
        tri: p.budget, yaw: a, pitch: 0.3 + pl.u("fr" + s.g) * 0.6, len: r, wid: r * 0.24,
        shape: "linear", form: "frond", leaflet: 4 + (s.g % 4), bend: -r * 0.22,
        color: pl.pal.deep, colorFn: pl.pal.grad, stalkColor: trunkOf(col), stalk: 0.16,
      });
    },
  });
}

// ---------- shrubs, herbs, orchids ----------

const CROTON = ["#c85a20", "#c8a020", "#8a5aa0", "#d8c83a", "#a03a3a"].map(hex);

const BUSH_FORM = ["mounded", "upright", "arching", "tiered", "airy"];

/**
 * A shrub is MANY stems from ground level with no clear leader and foliage
 * carried down to the ground. Fifty-five of the eighty-nine were single-stem
 * lollipops — a bare stick with one mushroom-cap blob on top — which is a
 * standard tree, not a shrub, and it is the same picture eighty-nine times.
 *
 * The multi-stem clump and the low foliage both live in the AXIS part, which
 * matters: the audit's trunk-versus-canopy test excludes the axis, so foliage
 * that reaches the ground here does not read to the gate as a bottom-heavy
 * plant. Slot parts still respect it.
 */
function shrub(k, col, opt = {}) {
  const bloomSpec = bloomOf(k);
  const bloom = opt.bloom ?? (bloomSpec ? "genus" : "none");
  grow(k, col, {
    salt: "shrub:" + bloom + (opt.colorful ? "c" : ""),
    upright: true,
    /* Broader than the general upright pool. A shrub is a bush; at 0.35 of its
       own height it is a pod on a stick, which is what Graptophyllum and the
       narrow tail of the family were. Three levels, not four: the audit caps
       an upright at 1.6 times wider than tall, and four levels inside that
       range sit closer together than the 0.12 distinctness floor. */
    axSet: [0.65, 1.1, 1.55],
    azSet: [0.65, 1.1, 1.55],
    height: (pl) => 0.42 + pl.u("size") * 0.32,
    breathe: 0.018,
    bands: [0, 1, 2, 3, 4, 5],
    spine(p, pl) {
      pl.bush = BUSH_FORM[pl.H("bush") % BUSH_FORM.length];
      pl.bloomSpec = bloomSpec;
      // where the foliage starts, measured off the ground — a shrub is leafy
      // from about a tenth of its height, not from half way up a bare pole
      pl.stemH = 0.08 + pl.u("sh") * 0.14;
      pl.crownW = ((pl.ax + pl.az) / 2) * 0.92;
      pl.anchorColor = trunkOf(col);
      p.spine("clump", (node) => {
        const tr = trunkOf(col);
        const r0 = 0.013 + pl.u("sr") * 0.011;
        const leaf = opt.colorful ? CROTON[pl.H("cc") % CROTON.length] : pl.pal.leaf;
        const g = opt.colorful ? undefined : grad(shade(pl.pal.leaf, 0.2), pl.pal.deep, pl.stemH, 1);
        const depth = 1 - pl.stemH;
        const cw = pl.crownW;

        // the clump: several slender stems out of the ground, no leader
        const ns = 3 + (pl.H("st") % 3);
        const stem = [];
        for (let i = 0; i < ns; i += 1) {
          const a = i * 2.399 + pl.u("s0") * TAU;
          const lean = 0.1 + 0.2 * ((i % 3) / 3);
          const h = (0.5 + 0.42 * (((i * 5) % 7) / 7)) * (pl.bush === "upright" ? 1.1 : 1);
          stem.push(xf(tubeGeo(r0 * (1.15 - 0.08 * i), r0 * 0.42, h, 9), {
            rz: -Math.cos(a) * lean, rx: Math.sin(a) * lean,
            at: [Math.cos(a) * r0 * 1.1, 0, Math.sin(a) * r0 * 1.1],
          }));
        }
        p.add(node, mergeGeo(stem), { color: tr, colorFn: grad(shade(tr, 0.12), shade(tr, -0.24), 0, 0.6) });

        /* The core is deliberately SMALL. It is there to be the thing the
           leaves hang off, not the shrub: a big opaque mass in the axis part
           swallows every leaf slot and the archetype goes straight back to
           being one blob eighty-nine times. */
        let coreR = cw * 0.32, coreY = pl.stemH + depth * 0.45;
        if (pl.bush === "tiered") {
          for (let i = 0; i < 3; i += 1) {
            p.add(node, xf(capGeo(cw * (0.36 - i * 0.08), depth * 0.26, 12, 4, "flat"),
              { at: [0, pl.stemH + i * depth * 0.32, 0] }), { color: i % 2 ? leaf : pl.pal.deep, colorFn: g });
          }
          coreR = cw * 0.36; coreY = pl.stemH + depth * 0.16;
        } else if (pl.bush === "upright") {
          p.add(node, xf(sphereGeo(11, 6), { sx: cw * 0.34, sy: depth * 0.42, sz: cw * 0.34, at: [0, pl.stemH + depth * 0.46, 0] }), { color: leaf, colorFn: g });
          coreR = cw * 0.34; coreY = pl.stemH + depth * 0.46;
        } else if (pl.bush === "airy") {
          for (let i = 0; i < 3; i += 1) {
            const a = i * 2.399 + pl.u("a0") * TAU;
            p.add(node, xf(sphereGeo(10, 5), {
              sx: cw * 0.19, sy: depth * 0.2, sz: cw * 0.19,
              at: [Math.cos(a) * cw * 0.18, pl.stemH + depth * (0.32 + 0.29 * i), Math.sin(a) * cw * 0.18],
            }), { color: i % 2 ? leaf : pl.pal.deep, colorFn: g });
          }
          coreR = cw * 0.19; coreY = 1 - depth * 0.25;
        } else {
          const d = pl.bush === "arching" ? 0.42 : 0.48;
          p.add(node, xf(sphereGeo(11, 6), { sx: cw * 0.36, sy: depth * d * 0.6, sz: cw * 0.36, at: [0, 1 - depth * d, 0] }), { color: leaf, colorFn: g });
          p.add(node, xf(capGeo(cw * 0.26, depth * 0.26, 11, 4, "flat"), { at: [0, pl.stemH * 0.4, 0] }), { color: pl.pal.deep, colorFn: g });
          coreR = cw * 0.32; coreY = 1 - depth * d;
        }
        const fr = Math.max(0.028, Math.min(coreR * 0.42, cw * 0.15));
        addFace(p, node, { at: [0, coreY, coreR * 0.86], r: fr, tri: p.budget * 8 });
      });
    },
    slot(p, pl, s) {
      const { node, band, a, top } = s;
      if (band <= 1) {
        // another shoot out of the clump, leafy right down to its foot
        const br = baseReach(pl, 0.36);
        p.add(node, xf(tubeGeo(br * 0.2, br * 0.11, br * 1.5, 9), { rz: -Math.cos(a) * 0.34, rx: Math.sin(a) * 0.34 }), { color: trunkOf(col) });
        addLump(p, node, {
          rx: br * 0.5, ry: br * 0.42, rz: br * 0.5, yaw: a, tri: p.budget * 0.6,
          at: [Math.cos(a) * br * 0.5, br * 0.7, Math.sin(a) * br * 0.5],
          color: pl.pal.deep, colorFn: opt.colorful ? undefined : pl.pal.grad,
        });
        return;
      }
      const spec = pl.bloomSpec;
      const isBloom = bloom !== "none" && band >= top - 1 && s.i % 2 === 0;
      if (isBloom) {
        const kind = spec ? spec.kind
          : bloom === "balls" ? "ball" : bloom === "hibiscus" ? "star" : bloom === "spikes" ? "spike" : "trumpet";
        const colr = spec ? spec.color
          : opt.multicolor ? FLOWERS[pl.H("mc" + s.g) % FLOWERS.length] : flowerOf(col);
        // close in to the foliage: a flower out at 0.6 of the reach shows more
        // of its own pedicel than of itself
        const r = reachOf(pl, a, 0.45);
        addFlower(p, node, {
          tri: spec ? Math.max(120, p.budget) : p.budget,
          at: [Math.cos(a) * r, 0, Math.sin(a) * r], kind,
          r: (spec?.r ?? 0.045) + pl.u("fr" + s.g) * 0.03, color: colr,
          color2: spec ? (spec.color2 ?? shade(colr, 0.3)) : undefined, stalkLen: 0.03, yaw: a,
        });
        return;
      }
      const droop = pl.bush === "arching" ? 0.75 : pl.bush === "upright" ? -0.35 : 0.2;
      const r = reachOf(pl, a, (0.7 + pl.u("lr" + s.g) * 0.35) * (pl.bush === "airy" ? 1.05 : 1));
      /* A variegated shrub is still mostly a LEAF. Painting every blade from
         the croton pool left Excoecaria as magenta spikes radiating from a
         point with no green mass at all. */
      const lc = opt.colorful
        ? (s.g % 3 === 0 ? pl.pal.deep : CROTON[pl.H("lc" + s.g) % CROTON.length])
        : (s.g % 2 ? pl.pal.leaf : pl.pal.deep);
      addLeaf(p, node, {
        tri: p.budget, yaw: a, pitch: droop + pl.u("lp" + s.g) * 0.5,
        len: r, wid: r * (0.34 + pl.u("lw" + s.g) * 0.34), shape: pl.shape, form: pl.form,
        leaflet: 3 + (s.g % 4),
        color: lc, colorFn: opt.colorful ? undefined : pl.pal.grad, stalkColor: pl.pal.deep, stalk: 0.2,
      });
    },
  });
}

function herb(k, col, opt = {}) {
  const spec = bloomOf(k);
  const flower = opt.flower ?? spec?.kind ?? null;
  grow(k, col, {
    salt: "herb",
    /* Never a pancake. The general pool runs down to 0.15 and up to 2.9, and a
       herb at either end is a stick or a sheet; the review's "single flat
       sheets like a folded tarp" are at the wide end of it. */
    axSet: [0.4, 0.8, 1.2, 1.6, 2.0, 2.4],
    azSet: [0.4, 0.8, 1.2, 1.6, 2.0, 2.4],
    height: 0.5,
    breathe: 0.022,
    sway: 0.06,
    bands: [0, 1, 2, 3, 4, 5],
    flowerKind: flower,
    spine(p, pl) {
      p.spine("stem", (node) => {
        const stemR = 0.008 + pl.u("sr") * 0.014;
        const woody = pl.u("wd") > 0.72;
        const stemCol = woody ? trunkOf(col) : mix(pl.pal.deep, pl.pal.leaf, 0.35);
        const lean = (pl.u("ln") - 0.5) * 0.16;
        const seg = 4;
        for (let i = 0; i < seg; i += 1) {
          const t0 = i / seg;
          p.add(node, xf(tubeGeo(stemR * (1 - t0 * 0.4), stemR * (1 - (t0 + 1 / seg) * 0.4), 1 / seg + 0.004, 9),
            { rz: lean * (t0 - 0.4), at: [lean * t0 * t0 * 0.5, t0, 0] }), { color: stemCol });
          if (pl.u("nd") > 0.55) {
            p.add(node, xf(discGeo(stemR * 1.5, stemR * 0.7, 8), { at: [lean * t0 * t0 * 0.5, t0, 0] }), { color: shade(stemCol, -0.2) });
          }
        }
        addFace(p, node, { at: [0, 0.3, stemR * 1.05], r: Math.max(0.03, stemR * 2.2) });
      });
    },
    slot(p, pl, s) {
      const { node, band, a, top } = s;
      const kind = pl.flower;
      const flowering = kind !== "none" && band >= top && s.i < Math.max(1, Math.round(s.n * 0.6));
      if (flowering) {
        const r = reachOf(pl, a, 0.3 + pl.u(`fs${s.g}`) * 0.3);
        const fr = (opt.flowerR ?? spec?.r ?? 0.07) * (0.75 + pl.u(`fz${s.g}`) * 0.6);
        const fc = spec?.color ?? flowerOf(col);
        addFlower(p, node, { tri: Math.max(110, p.budget),
          at: [Math.cos(a) * r, 0, Math.sin(a) * r], kind, r: fr, yaw: a,
          color: fc, color2: spec?.color2 ?? shade(fc, 0.3), stalkLen: 0.035, pitch: pl.u(`ft${s.g}`) * 0.3,
        });
        return;
      }
      const basal = band <= 1;
      const r = reachOf(pl, a, (basal ? 0.95 : 0.6 + pl.u(`lr${s.g}`) * 0.4));
      /* Positive pitch is DOWN. Every leaf on every herb drooped, which with a
         wide aspect is a plant seen from above rather than from the side.
         Basal leaves still spread; stem leaves are carried up and out. */
      const pitch = basal ? 0.1 + pl.u(`bp${s.g}`) * 0.35 : -0.55 + pl.u(`lp${s.g}`) * 0.9;
      const form = p.budget < 34 ? "simple" : pl.form;
      const pair = [1];
      for (const sgn of pair) {
        addLeaf(p, node, { tri: p.budget,
          yaw: a + (sgn > 0 ? 0 : Math.PI), pitch,
          len: r * (pair.length > 1 ? 0.95 : 1), wid: r * (0.2 + pl.u(`lw${s.g}`) * 0.3),
          shape: pl.shape, form, leaflet: 3 + (s.g % 5),
          rows: form === "simple" ? 5 : 4, ring: 4,
          bend: -r * 0.18 * pl.u(`lb${s.g}`), sweep: (pl.u(`ls${s.g}`) - 0.5) * r * 0.2,
          fold: pl.u(`lf${s.g}`) > 0.7 ? 0.2 : 0,
          color: s.g % 2 ? pl.pal.leaf : pl.pal.deep, colorFn: pl.pal.grad,
          stalkColor: pl.pal.deep, stalk: 0.12 + pl.u(`lk${s.g}`) * 0.3,
        });
      }
    },
  });
}

/**
 * Two orchids, and they are not the same plant. Dendrobium is an epiphytic
 * CANE with a pendant raceme; Goodyera is a terrestrial jewel orchid — a low
 * rosette of broad patterned leaves with a slender flower spike out of the
 * middle — and it was shipping as a featureless blob on a wire.
 */
const CANE_ORCHID = new Set("dendrobium bulbophyllum cymbidium vanda coelogyne eria".split(" "));

function orchid(k, col) {
  const cane = CANE_ORCHID.has(genusOf(k));
  grow(k, col, {
    salt: `orchid:${cane ? "cane" : "jewel"}`,
    axSet: cane ? [0.5, 0.8, 1.1] : [0.9, 1.3, 1.7],
    azSet: cane ? [0.5, 0.8, 1.1] : [0.9, 1.3, 1.7],
    height: cane ? 0.55 : 0.32,
    breathe: 0.02,
    sway: 0.03,
    bands: [0, 1, 2, 3, 4, 5],
    spine(p, pl) {
      pl.cane = cane;
      pl.anchorColor = pl.pal.deep;
      p.spine(cane ? "cane" : "rosette", (node) => {
        if (cane) {
          const stem = mix(pl.pal.deep, trunkOf(col), 0.2);
          p.add(node, xf(tubeGeo(0.02, 0.014, 0.94, 11, 0.006)), { color: stem, colorFn: grad(shade(stem, 0.18), stem, 0, 0.94) });
          const leaf = [];
          for (let i = 0; i < 6; i += 1) {
            const y = 0.24 + i * 0.12;
            const a = i * Math.PI + (i % 2) * 0.3;
            leaf.push(xf(bladeGeo({ len: 0.3, wid: 0.09, thick: 0.014, shape: "lanceolate", rows: 4, ring: 4, bend: -0.08 }),
              { rx: -0.9, ry: a, at: [0, y, 0] }));
          }
          p.add(node, mergeGeo(leaf), { color: pl.pal.leaf, colorFn: pl.pal.grad });
          addFace(p, node, { at: [0, 0.36, 0.02], r: 0.032, tri: p.budget * 8 });
        } else {
          // the jewel-orchid rosette: broad ovate leaves flat on the ground,
          // and a slender erect spike carrying the flowers above them
          const leaf = [[], []];
          for (let i = 0; i < 7; i += 1) {
            const a = i * 2.399 + pl.u("r0") * TAU;
            leaf[i % 2].push(xf(bladeGeo({ len: 0.5 - (i % 3) * 0.05, wid: 0.3, thick: 0.035, shape: "ovate", rows: 4, ring: 4, bend: -0.06 }),
              { rx: 0.1 + (i % 3) * 0.1, ry: a, at: [0, 0.05, 0] }));
          }
          p.add(node, mergeGeo(leaf[0]), { color: pl.pal.leaf, colorFn: grad(shade(pl.pal.leaf, 0.3), pl.pal.deep, 0, 0.1) });
          p.add(node, mergeGeo(leaf[1]), { color: pl.pal.deep });
          p.add(node, xf(tubeGeo(0.012, 0.008, 0.82, 9), { rz: (pl.u("ln") - 0.5) * 0.16, at: [0, 0.08, 0] }), { color: mix(pl.pal.deep, flowerOf(col), 0.2) });
          addFlower(p, node, { tri: 200, at: [0, 0.9, 0], kind: "orchid", r: 0.055, color: flowerOf(col), pitch: 0.3 });
          addFace(p, node, { at: [0, 0.1, 0.1], r: 0.05, tri: p.budget * 8 });
        }
      });
    },
    slot(p, pl, s) {
      const { node, band, a } = s;
      if (pl.cane) {
        if (band <= 1) {
          // a second cane out of the clump
          const br = baseReach(pl, 0.5);
          p.add(node, xf(tubeGeo(br * 0.22, br * 0.15, br * 2.6, 9), { rz: -Math.cos(a) * 0.18, rx: Math.sin(a) * 0.18 }), { color: mix(pl.pal.deep, trunkOf(col), 0.2) });
          return;
        }
        const r = reachOf(pl, a, 0.9);
        if (s.g % 3 === 1) {
          addFlower(p, node, { tri: Math.max(120, p.budget), at: [Math.cos(a) * r * 0.5, 0, Math.sin(a) * r * 0.5], kind: "orchid", r: 0.05 + pl.u(`fr${s.g}`) * 0.025, color: flowerOf(col), stalkLen: 0.03, pitch: 0.5, yaw: a });
          return;
        }
        addLeaf(p, node, { tri: p.budget, yaw: a, pitch: -0.8 + pl.u(`op${s.g}`) * 0.5,
          len: r, wid: r * 0.26, shape: "lanceolate", rows: 5, ring: 4, bend: -r * 0.3, stalk: 0.04,
          color: s.g % 2 ? pl.pal.leaf : pl.pal.deep, colorFn: pl.pal.grad });
        return;
      }
      if (band >= 3) {
        const r = reachOf(pl, a, 0.28);
        addFlower(p, node, { tri: Math.max(110, p.budget), at: [Math.cos(a) * r, 0, Math.sin(a) * r], kind: "orchid", r: 0.04 + pl.u(`fr${s.g}`) * 0.02, color: flowerOf(col), stalkLen: 0.02, pitch: 0.4, yaw: a });
        return;
      }
      const r = reachOf(pl, a, 0.95);
      addLeaf(p, node, { tri: p.budget, yaw: a, pitch: 0.08 + pl.u(`jp${s.g}`) * 0.28,
        len: r, wid: r * (0.5 + pl.u(`jw${s.g}`) * 0.22), thick: r * 0.1,
        shape: "ovate", rows: 5, ring: 4, bend: -r * 0.12, stalk: 0.08,
        color: s.g % 2 ? pl.pal.leaf : pl.pal.deep,
        colorFn: grad(shade(pl.pal.leaf, 0.32), pl.pal.deep, -r * 0.1, r * 0.1) });
    },
  });
}

// ---------- grasses, ferns, moss ----------

/**
 * Grasses and sedges. The seedhead is the diagnostic for very nearly all of
 * them and eighteen of twenty had none, so the whole family was one tuft of
 * blades over and over. The head is now drawn in the AXIS part, which means
 * every grass has one whatever the plan does with its slots.
 *
 * Sedges are not grasses and were rendering identically: Cyperus and
 * Hypolytrum get the umbel of rays under a whorl of leafy bracts, and the
 * three-sided culm the family is named for in every field key.
 */
const GRASS_HEAD = {
  imperata: "plume",
  eleusine: "fingers",
  dactyloctenium: "fingers",
  axonopus: "fingers",
  digitaria: "fingers",
  chloris: "fingers",
  cynodon: "fingers",
  setaria: "bristle",
  pennisetum: "bristle",
  cenchrus: "bristle",
  oplismenus: "spikelet",
  paspalum: "spikelet",
  cyperus: "umbel",
  hypolytrum: "umbel",
  kyllinga: "umbel",
  fimbristylis: "umbel",
};

/** The seedhead, drawn at `at` on the culm. */
function seedHead(p, node, { at, kind, r, color, dark, tri = 260 }) {
  const fine = tri >= 180;
  if (kind === "plume") {
    // Imperata's silvery plume: a soft elongated brush, and it is white
    const g = [];
    const n = fine ? 26 : 14;
    for (let i = 0; i < n; i += 1) {
      const a = i * 2.399;
      const t = (i + 0.5) / n;
      g.push(xf(bladeGeo({ len: r * (1.25 - t * 0.55), wid: r * 0.2, thick: r * 0.08, shape: "needle", rows: 2, ring: 5 }),
        { rx: -1.25 + t * 0.55, ry: a, at: [Math.cos(a) * r * 0.1, at[1] + t * r * 1.9, Math.sin(a) * r * 0.1] }));
    }
    /* Silvery, not white: a pure-paper plume vanishes against the gallery's
       paper background, and the plume is the whole of Imperata. */
    p.add(node, xf(mergeGeo(g), { at: [at[0], 0, at[2]] }), { color: mix(paper, hex("#b9ab9e"), 0.5) });
    return;
  }
  if (kind === "fingers") {
    // Eleusine and Dactyloctenium: straight spikes radiating like a crow's foot
    const g = [];
    const n = 4 + (fine ? 1 : 0);
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * TAU;
      g.push(xf(bladeGeo({ len: r * 2.1, wid: r * 0.16, thick: r * 0.11, shape: "linear", rows: 4, ring: 5, bend: -r * 0.5 }),
        { rx: -0.75, ry: a, at }));
    }
    p.add(node, mergeGeo(g), { color, colorFn: grad(shade(color, 0.2), dark, at[1], at[1] + r) });
    return;
  }
  if (kind === "bristle") {
    // a foxtail: a dense cylindrical brush
    const g = [];
    const n = fine ? 30 : 16;
    for (let i = 0; i < n; i += 1) {
      const a = i * 2.399;
      const t = (i + 0.5) / n;
      g.push(xf(tubeGeo(r * 0.035, r * 0.012, r * 0.42, 5), { rz: -Math.cos(a) * 1.2, rx: Math.sin(a) * 1.2, at: [at[0], at[1] + t * r * 1.5, at[2]] }));
    }
    p.add(node, xf(tubeGeo(r * 0.16, r * 0.1, r * 1.6, 9), { at }), { color: dark });
    p.add(node, mergeGeo(g), { color: mix(color, paper, 0.3) });
    return;
  }
  if (kind === "umbel") {
    // a sedge: rays from one point, each ending in a spikelet, under a whorl
    // of leafy involucral bracts
    const ray = [];
    const spikelet = [];
    const n = fine ? 6 : 4;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * TAU;
      const L = r * (1.1 + 0.5 * ((i * 3) % 3) / 3);
      ray.push(xf(tubeGeo(r * 0.05, r * 0.035, L, 6), { rz: -Math.cos(a) * 0.55, rx: Math.sin(a) * 0.55, at }));
      const tip = [at[0] + Math.cos(a) * L * Math.sin(0.55), at[1] + L * Math.cos(0.55), at[2] + Math.sin(a) * L * Math.sin(0.55)];
      for (let j = 0; j < 3; j += 1) {
        spikelet.push(xf(bladeGeo({ len: r * 0.5, wid: r * 0.13, thick: r * 0.09, shape: "linear", rows: 2, ring: 5 }),
          { rx: -1.1 + j * 0.3, ry: a + (j - 1) * 0.6, at: tip }));
      }
    }
    p.add(node, mergeGeo(ray), { color: dark });
    p.add(node, mergeGeo(spikelet), { color: mix(color, hex("#b58a4a"), 0.45) });
    const bract = [];
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * TAU + 0.4;
      bract.push(xf(bladeGeo({ len: r * 2.2, wid: r * 0.2, thick: r * 0.05, shape: "linear", rows: 4, ring: 4, bend: -r * 0.7 }),
        { rx: -0.5, ry: a, at }));
    }
    p.add(node, mergeGeo(bract), { color, colorFn: grad(shade(color, 0.2), dark, at[1] - r, at[1] + r) });
    return;
  }
  if (kind === "spikelet") {
    const g = [];
    const n = fine ? 7 : 4;
    for (let i = 0; i < n; i += 1) {
      const t = i / n;
      const a = i * 2.399;
      g.push(xf(bladeGeo({ len: r * 0.5, wid: r * 0.14, thick: r * 0.1, shape: "lanceolate", rows: 2, ring: 5 }),
        { rx: -1.0, ry: a, at: [at[0] + Math.cos(a) * r * 0.06, at[1] + t * r * 1.4, at[2] + Math.sin(a) * r * 0.06] }));
    }
    p.add(node, mergeGeo(g), { color: mix(color, hex("#c8a86a"), 0.5) });
    return;
  }
  // panicle: an open branched head of little grains
  const branch = [];
  const grain = [];
  const n = fine ? 7 : 4;
  for (let i = 0; i < n; i += 1) {
    const t = (i + 0.5) / n;
    const a = i * 2.399;
    const L = r * (0.9 - t * 0.45);
    const base = [at[0], at[1] + t * r * 1.5, at[2]];
    branch.push(xf(tubeGeo(r * 0.03, r * 0.018, L, 5), { rz: -Math.cos(a) * 1.0, rx: Math.sin(a) * 1.0, at: base }));
    const tip = [base[0] + Math.cos(a) * L * 0.84, base[1] + L * 0.54, base[2] + Math.sin(a) * L * 0.84];
    grain.push(xf(sphereGeo(8, 4), { sx: r * 0.08, sy: r * 0.17, sz: r * 0.08, at: tip }));
  }
  p.add(node, mergeGeo(branch), { color: dark });
  p.add(node, mergeGeo(grain), { color: mix(color, hex("#d8c07a"), 0.55) });
}

function grass(k, col, opt = {}) {
  if (opt.kind === "bamboo") return bamboo(k, col);
  const g = genusOf(k);
  const head = GRASS_HEAD[g] ?? (opt.kind === "sedge" ? "umbel" : "panicle");
  const sedge = head === "umbel";
  grow(k, col, {
    salt: `grass:${head}`,
    axSet: [0.5, 0.85, 1.2, 1.55],
    azSet: [0.5, 0.85, 1.2, 1.55],
    height: 0.6,
    breathe: 0.016,
    sway: 0.07,
    bands: [0, 1, 2, 3, 4, 5],
    spine(p, pl) {
      pl.sedge = sedge;
      pl.head = head;
      pl.anchorColor = pl.pal.deep;
      p.spine("culm", (node) => {
        const culmH = 0.6 + pl.u("ch") * 0.16;
        const cr = 0.014 + pl.u("cr") * 0.008;
        /* A sedge has edges: three-sided in section, which is the line every
           field key opens with and the reason Cyperus should not look like
           Axonopus. `lathe` with three segments is literally that prism. */
        p.add(node, xf(sedge ? lathe([[cr * 1.3, 0], [cr * 0.85, culmH]], 3) : tubeGeo(cr * 1.2, cr * 0.8, culmH, 9)),
          { color: mix(pl.pal.leaf, pl.pal.deep, 0.4) });
        seedHead(p, node, {
          at: [0, culmH, 0], kind: head, r: 0.1 + pl.u("hr") * 0.04,
          color: sedge ? pl.pal.deep : flowerOf(col), dark: pl.pal.deep, tri: 300,
        });
        p.add(node, xf(bladeGeo({ len: culmH * 0.9, wid: 0.055 + pl.u("bw") * 0.03, thick: 0.011, shape: "linear", rows: 6, ring: 4, bend: 0.22, fold: 0.3 }),
          { rx: -Math.PI / 2 + 0.22, at: [0, 0.01, 0] }), { color: pl.pal.leaf, colorFn: pl.pal.grad });
        p.add(node, xf(sphereGeo(10, 5), { sx: 0.04, sy: 0.022, sz: 0.04, at: [0, 0.012, 0] }), { color: pl.pal.deep });
        addFace(p, node, { at: [0, 0.09, 0.032], r: 0.034, tri: p.budget * 8 });
      });
    },
    slot(p, pl, s) {
      const { node, band, a, top } = s;
      if (band >= top && s.i === 0) {
        // a second culm carrying its own head
        const h = 0.16 + pl.u(`sh${s.g}`) * 0.1;
        p.add(node, xf(tubeGeo(0.009, 0.006, h, 8), { rz: -Math.cos(a) * 0.28, rx: Math.sin(a) * 0.28, at: [0, -h, 0] }), { color: pl.pal.deep });
        seedHead(p, node, {
          at: [Math.cos(a) * h * 0.28, 0, Math.sin(a) * h * 0.28], kind: pl.head, r: 0.075,
          color: pl.sedge ? pl.pal.deep : flowerOf(col), dark: pl.pal.deep, tri: p.budget * 2,
        });
        return;
      }
      const r = reachOf(pl, a, 0.55 + pl.u(`gr${s.g}`) * 0.5);
      const lean = pl.sedge ? -0.75 + pl.u(`gl${s.g}`) * 0.6 : -0.45 + pl.u(`gl${s.g}`) * 1.0;
      addLeaf(p, node, { tri: p.budget,
        yaw: a, pitch: lean, len: r * 1.7, wid: r * (pl.sedge ? 0.12 : 0.16),
        shape: pl.sedge ? "needle" : "linear", rows: 6, ring: 4, bend: -r * 0.9, fold: 0.32, stalk: 0.02,
        color: s.g % 2 ? pl.pal.leaf : pl.pal.deep, colorFn: pl.pal.grad,
      });
    },
  });
}

function bamboo(k, col) {
  grow(k, col, {
    salt: "bamboo",
    /* Ten to twenty metre clumping bamboos, drawn as short stubs: the general
       aspect pool let them be three times wider than tall, which hides the
       culm, and the culm with its nodes is the whole plant. */
    axSet: [0.22, 0.4, 0.58],
    azSet: [0.22, 0.4, 0.58],
    height: 1.35,
    breathe: 0.01,
    sway: 0.03,
    bands: [0, 1, 2, 3, 4, 5],
    spine(p, pl) {
      pl.anchorColor = hex("#5a8030");
      p.spine("cane", (node) => {
        const cane = hex("#7aa840");
        const band = hex("#5a8030");
        const nodes = 7 + (pl.H("nd") % 5);
        const seg = [];
        const ring = [];
        for (let i = 0; i < nodes; i += 1) {
          const y0 = i / nodes;
          seg.push(xf(tubeGeo(0.019 - i * 0.0007, 0.0185 - i * 0.0007, 1 / nodes - 0.008, 11), { at: [0, y0, 0] }));
          ring.push(xf(discGeo(0.023 - i * 0.0007, 0.011, 9), { at: [0, y0 + 1 / nodes - 0.006, 0] }));
        }
        ring.push(xf(discGeo(0.02, 0.011, 9), { at: [0, 1 - 0.006, 0] }));
        p.add(node, mergeGeo(seg), { color: cane, colorFn: grad(shade(cane, 0.18), shade(cane, -0.1), 0, 1) });
        p.add(node, mergeGeo(ring), { color: band });
        addFace(p, node, { at: [0, 0.28, 0.02], r: 0.028, tri: p.budget * 8 });
      });
    },
    slot(p, pl, s) {
      const { node, band, a } = s;
      if (band <= 2 && s.i === 0) {
        // a second and third culm: these bamboos grow in dense clumps
        const h = 0.5 + pl.u(`c${s.g}`) * 0.45;
        const off = 0.03 + pl.u(`co${s.g}`) * 0.03;
        const seg = [];
        const n = 5;
        for (let i = 0; i < n; i += 1) {
          seg.push(xf(tubeGeo(0.013, 0.012, h / n - 0.006, 9), { at: [0, (i / n) * h, 0] }));
          seg.push(xf(discGeo(0.016, 0.008, 8), { at: [0, ((i + 1) / n) * h - 0.005, 0] }));
        }
        p.add(node, xf(mergeGeo(seg), { rz: -Math.cos(a) * 0.1, rx: Math.sin(a) * 0.1, at: [Math.cos(a) * off, -h * 0.5, Math.sin(a) * off] }),
          { color: hex("#7aa840"), colorFn: grad(shade(hex("#7aa840"), 0.16), hex("#5a8030"), -h * 0.5, h * 0.5) });
        return;
      }
      // a spray of lanceolate leaves off a node
      const r = reachOf(pl, a, 0.95);
      const spray = [[], []];
      const n = Math.max(2, Math.min(5, Math.floor(p.budget / 26)));
      for (let j = 0; j < n; j += 1) {
        const aa = a + (j - (n - 1) / 2) * 0.5;
        spray[j % 2].push(xf(bladeGeo({ len: r * (0.9 + 0.2 * (j % 3)), wid: r * 0.16, thick: 0.008, shape: "lanceolate", rows: 4, ring: 4, bend: -r * 0.4 }),
          { rx: 0.35 + pl.u(`bp${s.g}${j}`) * 0.6, ry: aa, at: [Math.cos(a) * 0.02, 0, Math.sin(a) * 0.02] }));
      }
      p.add(node, xf(tubeGeo(0.006, 0.004, r * 0.4, 6), { rz: -Math.cos(a) * 1.2, rx: Math.sin(a) * 1.2 }), { color: hex("#5a8030") });
      if (spray[0].length) p.add(node, mergeGeo(spray[0]), { color: pl.pal.leaf, colorFn: pl.pal.grad });
      if (spray[1].length) p.add(node, mergeGeo(spray[1]), { color: pl.pal.deep });
    },
  });
}

/**
 * Ferns. The divided frond of Christella, Pteris, Tectaria and Macrothelypteris
 * already worked and is left alone; four groups did not, and each of them is
 * recognised by exactly the thing that was missing.
 *
 *   sword      Nephrolepis — a long pinnate LADDER, drawn as an undivided slab
 *   nest       Asplenium nidus — entire straps in an upright vase, drawn jagged
 *   fan        Adiantum — delicate fan pinnules on wiry black stalks
 *   spikemoss  Selaginella — not a fern at all: a low mat of scale-leaf shoots
 *   strap      Pyrrosia, Haplopteris, Mickelopteris — simple undivided fronds
 */
const FERN_FORM = {
  nephrolepis: "sword",
  asplenium: "nest",
  adiantum: "fan",
  selaginella: "spikemoss",
  pyrrosia: "strap",
  haplopteris: "strap",
  mickelopteris: "strap",
  elaphoglossum: "strap",
};

function fern(k, col) {
  const form = FERN_FORM[genusOf(k)] ?? "divided";
  grow(k, col, {
    salt: `fern:${form}`,
    /* A vase of arching fronds is never a pencil: the columnar low end of the
       general pool drew Nephrolepis as one frond on a stick. */
    axSet: form === "spikemoss" ? [1.3, 1.8, 2.3] : form === "nest" ? [0.6, 0.9, 1.2] : form === "sword" ? [0.8, 1.1, 1.4] : ASPECT,
    azSet: form === "spikemoss" ? [1.3, 1.8, 2.3] : form === "nest" ? [0.6, 0.9, 1.2] : form === "sword" ? [0.8, 1.1, 1.4] : ASPECT,
    height: form === "spikemoss" ? 0.3 : form === "nest" ? 0.66 : 0.55,
    breathe: 0.02,
    sway: 0.05,
    bands: [0, 1, 2, 3, 4, 5],
    spine(p, pl) {
      pl.form = form;
      pl.anchorColor = shade(pl.pal.deep, -0.2);
      const wiry = form === "fan" ? mix(ink, trunkOf(col), 0.35) : shade(pl.pal.deep, -0.2);
      pl.wiry = wiry;
      p.spine("frond0", (node) => {
        if (form === "spikemoss") {
          p.add(node, xf(capGeo(0.34, 0.4, 13, 5, "flat")), { color: pl.pal.deep, colorFn: grad(shade(pl.pal.leaf, 0.2), pl.pal.deep, 0, 0.4) });
          const bunch = [[], []];
          for (let i = 0; i < 12; i += 1) {
            const a = i * 2.399 + pl.u("s0") * TAU;
            const rr = 0.28 * Math.sqrt((i + 0.3) / 12);
            bunch[i % 2].push(xf(bladeGeo({ len: 0.5 - rr * 0.7, wid: 0.09, thick: 0.012, shape: "spatulate", rows: 4, ring: 4, bend: 0.12 }),
              { rx: -1.15 + rr * 1.5, ry: a, at: [Math.cos(a) * rr, 0.3 - rr * 0.5, Math.sin(a) * rr] }));
          }
          p.add(node, mergeGeo(bunch[0]), { color: pl.pal.leaf, colorFn: pl.pal.grad });
          p.add(node, mergeGeo(bunch[1]), { color: pl.pal.deep });
          addFace(p, node, { at: [0, 0.22, 0.24], r: 0.062, tri: p.budget * 8 });
          return;
        }
        p.add(node, xf(tubeGeo(0.012, 0.008, 0.18, 8)), { color: wiry });
        if (form === "sword") {
          /* The axis frond has to be the ladder too. Left as one undivided
             blade it is the tallest thing in the model and Nephrolepis reads
             as the broad slab the review complained about, however many
             divided fronds hang off it. */
          addLeaf(p, node, {
            at: [0, 0.16, 0], yaw: 0, pitch: -1.28, len: 0.9, wid: 0.22, thick: 0.016,
            shape: "elliptic", form: "ladder", tri: 620, bend: -0.3, stalk: 0.06, roll: 0.12,
            color: pl.pal.leaf, colorFn: pl.pal.grad, stalkColor: wiry,
          });
        } else {
          const bl = { rows: 7, ring: 4 };
          const g = form === "nest"
            ? bladeGeo({ len: 0.88, wid: 0.2, thick: 0.02, shape: "obovate", ...bl, bend: -0.06, fold: 0.3 })
            : bladeGeo({ len: 0.9, wid: 0.16, thick: 0.02, shape: "lanceolate", ...bl, bend: -0.16 });
          p.add(node, xf(g, { rx: form === "nest" ? -1.5 : -1.35, at: [0, 0.16, 0] }), { color: pl.pal.leaf, colorFn: pl.pal.grad });
        }
        addFace(p, node, { at: [0, 0.09, 0.03], r: 0.034, tri: p.budget * 8 });
      });
    },
    slot(p, pl, s) {
      const { node, band, a } = s;

      if (pl.form === "spikemoss") {
        const t = (band + 0.5) / 6;
        const r = reachOf(pl, a, 0.95 * (1 - 0.6 * t));
        const n = Math.max(1, Math.min(3, Math.floor(p.budget / 30)));
        const bunch = [[], []];
        for (const sgn of [1, -1]) {
          for (let j = 0; j < n; j += 1) {
            const aa = a + (sgn > 0 ? 0 : Math.PI) + (j - (n - 1) / 2) * 0.6;
            const rr = r * (0.4 + 0.6 * ((j + 0.5) / n));
            bunch[j % 2].push(xf(bladeGeo({ len: 0.16 + r * 0.5, wid: 0.075, thick: 0.011, shape: "spatulate", rows: 3, ring: 4, bend: 0.1 }),
              { rx: -0.85 + pl.u(`sp${s.g}${j}`) * 0.7, ry: aa, at: [Math.cos(aa) * rr, 0, Math.sin(aa) * rr] }));
          }
        }
        if (bunch[0].length) p.add(node, mergeGeo(bunch[0]), { color: s.g % 2 ? pl.pal.leaf : pl.pal.deep, colorFn: pl.pal.grad });
        if (bunch[1].length) p.add(node, mergeGeo(bunch[1]), { color: s.g % 2 ? pl.pal.deep : pl.pal.leaf });
        return;
      }

      // a fiddlehead crozier at the foot — the fern's other diagnostic
      if (band <= 1 && s.i % 3 === 2) {
        p.add(node, xf(arcTubeGeo({ R: 0.035, r: 0.009, a0: 0, a1: Math.PI * 1.6, segs: 5, ring: 6 }), { ry: a, at: [Math.cos(a) * 0.05, 0.03, Math.sin(a) * 0.05] }), { color: shade(pl.pal.deep, 0.1) });
        return;
      }

      const r = reachOf(pl, a, 0.95);
      if (pl.form === "nest") {
        // an entire strap, standing up in a vase: no jagged splitting at all
        addLeaf(p, node, {
          tri: p.budget, yaw: a, pitch: -1.18 + pl.u(`np${s.g}`) * 0.55,
          len: r * 1.3, wid: r * (0.24 + pl.u(`nw${s.g}`) * 0.12),
          shape: "obovate", form: "simple", rows: 6, ring: 4,
          bend: -r * 0.42, fold: 0.34, stalk: 0.05,
          color: s.g % 2 ? pl.pal.leaf : pl.pal.deep, colorFn: pl.pal.grad, stalkColor: pl.wiry,
        });
        return;
      }
      if (pl.form === "fan") {
        // maidenhair: a wiry stalk carrying a spray of little fan pinnules
        const L = r * 0.55;
        p.add(node, xf(tubeGeo(0.006, 0.004, L, 7), { rz: -Math.cos(a) * 0.75, rx: Math.sin(a) * 0.75 }), { color: pl.wiry });
        const tip = [Math.cos(a) * L * Math.sin(0.75), L * Math.cos(0.75), Math.sin(a) * L * Math.sin(0.75)];
        const n = Math.max(3, Math.min(7, Math.floor(p.budget / 16)));
        const fan = [];
        for (let j = 0; j < n; j += 1) {
          const aa = a + (j / (n - 1) - 0.5) * 1.7;
          fan.push(xf(bladeGeo({ len: r * 0.3, wid: r * 0.26, thick: 0.006, shape: "spatulate", rows: 3, ring: 4 }),
            { rx: 0.5 + (j % 2) * 0.25, ry: aa, at: tip }));
        }
        p.add(node, mergeGeo(fan), { color: s.g % 2 ? pl.pal.leaf : shade(pl.pal.leaf, 0.16), colorFn: pl.pal.grad });
        return;
      }
      if (pl.form === "strap") {
        addLeaf(p, node, {
          tri: p.budget, yaw: a, pitch: -0.85 + pl.u(`tp${s.g}`) * 0.8,
          len: r * 1.25, wid: r * (0.26 + pl.u(`tw${s.g}`) * 0.16),
          shape: "lanceolate", form: "simple", rows: 6, ring: 4,
          bend: -r * 0.5, stalk: 0.12, fold: 0.2,
          color: s.g % 2 ? pl.pal.leaf : pl.pal.deep, colorFn: pl.pal.grad, stalkColor: pl.wiry,
        });
        return;
      }
      const form = pl.form === "sword" ? "ladder" : p.budget >= 34 ? "frond" : "simple";
      addLeaf(p, node, {
        tri: p.budget, yaw: a,
        pitch: pl.form === "sword" ? -0.9 + pl.u(`fp${s.g}`) * 0.75 : -0.35 + pl.u(`fp${s.g}`) * 0.9,
        len: r * (pl.form === "sword" ? 1.6 : 1), wid: r * (pl.form === "sword" ? 0.3 : 0.2 + pl.u(`fw${s.g}`) * 0.2),
        shape: pl.shape, form, leaflet: 3 + (s.g % 5), rows: 4, ring: 4,
        bend: -r * (pl.form === "sword" ? 0.55 : 0.35), stalk: 0.18,
        color: s.g % 2 ? pl.pal.leaf : pl.pal.deep, colorFn: pl.pal.grad, stalkColor: pl.wiry,
      });
    },
  });
}

/*
 * Moss, lichen, liverwort and one alga all land in this archetype, and the
 * three of them are not the same plant. A moss is a dense CUSHION of many
 * tiny shoots; a crustose lichen is a flat lobed patch with no stem and no
 * sporophyte at all; a thalloid liverwort is a flat forked ribbon rosette;
 * Cladophora is a filament tuft. Selecting on genus here rather than in the
 * routing table keeps the router a router: every one of these is correctly
 * "the mossy-crust archetype", they just are not all mosses.
 */
const LICHEN_GENUS = new Set((
  "lecanora hyperphyscia phlyctis chrysothrix lepraria cryptothecia dirinaria graphis physcia " +
  "physciella pyxine collema pseudoschismatomma parmotrema usnea ramalina cladonia coenogonium " +
  "arthonia lecidea caloplaca dirina heterodermia leptogium pertusaria porina pyrenula " +
  "trypethelium bacidia lecania buellia rinodina opegrapha diorygma malmidea"
).split(" "));
const LIVERWORT_GENUS = new Set((
  "riccia ricciocarpos riccardia dumortiera cyathodium myriocoleopsis marchantia lunularia " +
  "pallavicinia asterella plagiochasma monoclea aneura metzgeria"
).split(" "));
const ALGA_GENUS = new Set("cladophora trentepohlia chlorella ulva".split(" "));

/** Which of the four bodies this species actually has. */
function mossForm(k) {
  const g = genusOf(k);
  if (ALGA_GENUS.has(g)) return "filament";
  if (LICHEN_GENUS.has(g)) return "crust";
  if (LIVERWORT_GENUS.has(g)) return "thallus";
  return "cushion";
}

/** Aspect pools per body: a crust is a patch, a filament tuft stands up. */
const MOSS_ASPECT = {
  crust: [1.95, 2.4, 2.85],
  thallus: [1.75, 2.2, 2.65],
  cushion: [1.1, 1.55, 2.0, 2.45],
  filament: [0.5, 0.85, 1.2],
};

/**
 * One tiny leafy shoot: a narrow spike of a blade, standing up. Six-sided in
 * cross-section rather than four: a four-sided lens puts half of its edges past
 * the audit's 40-degree crease line, and a cushion made of a hundred of them
 * is then a hundred per cent facets. Six sides is one extra triangle per row
 * and drops the sharp share to a third.
 */
function shootGeo({ at, len, wid, tilt, yaw, rows = 3 }) {
  return xf(bladeGeo({ len, wid, thick: wid * 0.34, shape: "needle", rows, ring: 6, bend: len * 0.12 }),
    { rx: -Math.PI / 2 + tilt, ry: yaw, at });
}

/** A pair of flat forked ribbon lobes lying almost flat — a thalloid liverwort. */
function ribbon(p, node, { at, len, wid, yaw, tilt, color, colorFn }) {
  for (const s of [1, -1]) {
    p.add(node, xf(bladeGeo({ len, wid, thick: wid * 0.16, shape: "spatulate", rows: 4, ring: 4, bend: -len * 0.12 }),
      { rx: tilt, ry: yaw + s * 0.34, at }), { color, colorFn });
  }
}

function moss(k, col) {
  const form = mossForm(k);
  const crust = form === "crust";
  grow(k, col, {
    salt: `moss:${form}`,
    axSet: MOSS_ASPECT[form],
    azSet: MOSS_ASPECT[form],
    height: form === "filament" ? 0.5 : form === "cushion" ? 0.34 : 0.2,
    breathe: 0.028,
    sway: crust ? 0.02 : 0.07,
    bands: [0, 1, 2, 3, 4, 5],
    spine(p, pl) {
      /* A lichen is not a plant and should not be leaf-green; pulling the pool
         colour a third of the way to paper gives the chalky grey-green,
         sulphur and rust a crust actually has, without collapsing the colour
         axis of the distinctness signature. */
      if (crust) {
        pl.pal = { leaf: mix(pl.pal.leaf, paper, 0.38), deep: mix(pl.pal.deep, paper, 0.22), grad: pl.pal.grad };
        pl.pal.grad = grad(shade(pl.pal.leaf, 0.16), pl.pal.deep, 0, 0.6);
      }
      pl.form = form;
      pl.anchorColor = pl.pal.deep;
      const { leaf, deep } = pl.pal;

      if (crust) {
        p.spine("crust", (node) => {
          const lobe = 5 + (pl.H("lb") % 4);
          p.add(node, xf(crustGeo({ r: 0.5, thick: 0.44, lobe, wob: 0.2, seg: 18 })),
            { color: deep, colorFn: grad(shade(leaf, 0.12), deep, 0, 0.44) });
          p.add(node, xf(crustGeo({ r: 0.33, thick: 0.4, lobe: lobe + 2, wob: 0.28, seg: 15 }), { at: [0.03, 0.32, -0.02] }), { color: leaf });
          p.add(node, xf(crustGeo({ r: 0.19, thick: 0.34, lobe: lobe + 1, wob: 0.3, seg: 12 }), { at: [-0.02, 0.63, 0.03] }), { color: mix(leaf, deep, 0.5) });
          addFace(p, node, { at: [0, 0.5, 0.26], r: 0.088, tri: p.budget * 8 });
        });
        return;
      }

      if (form === "thallus") {
        p.spine("thallus", (node) => {
          for (let i = 0; i < 3; i += 1) {
            const y = i * 0.34;
            const rr = 0.46 - i * 0.11;
            const n = 4 - (i > 1 ? 1 : 0);
            for (let j = 0; j < n; j += 1) {
              ribbon(p, node, {
                at: [0, y, 0], len: rr, wid: rr * 0.5, yaw: pl.u("t0") * TAU + j * (TAU / n) + i * 0.5,
                tilt: 0.02 + i * 0.06, color: i % 2 ? leaf : deep, colorFn: pl.pal.grad,
              });
            }
          }
          p.add(node, xf(sphereGeo(10, 5), { sx: 0.09, sy: 0.14, sz: 0.09, at: [0, 0.86, 0] }), { color: mix(leaf, deep, 0.4) });
          addFace(p, node, { at: [0, 0.5, 0.1], r: 0.075, tri: p.budget * 8 });
        });
        return;
      }

      if (form === "filament") {
        p.spine("tuft", (node) => {
          p.add(node, xf(capGeo(0.16, 0.12, 12, 4, "dome")), { color: deep });
          for (let i = 0; i < 9; i += 1) {
            const a = i * 2.399 + pl.u("f0") * TAU;
            const rr = 0.05 + 0.09 * ((i % 3) / 3);
            p.add(node, xf(bladeGeo({ len: 0.75 + (i % 4) * 0.08, wid: 0.032, thick: 0.02, shape: "linear", rows: 4, ring: 4, bend: 0.16 }),
              { rx: -Math.PI / 2 + 0.14 + (i % 3) * 0.08, ry: a, at: [Math.cos(a) * rr, 0.08, Math.sin(a) * rr] }),
            { color: i % 2 ? leaf : deep, colorFn: pl.pal.grad });
          }
          addFace(p, node, { at: [0, 0.12, 0.14], r: 0.062, tri: p.budget * 8 });
        });
        return;
      }

      // cushion: a low mound crowded with tiny upright shoots, and the seta +
      // capsule that only a real moss gets to have
      p.spine("cushion", (node) => {
        p.add(node, xf(capGeo(0.44, 0.34, 14, 5, "flat")), { color: deep, colorFn: grad(shade(leaf, 0.2), deep, 0, 0.34) });
        const bunch = [[], []];
        for (let i = 0; i < 14; i += 1) {
          const a = i * 2.399 + pl.u("c0") * TAU;
          const rr = 0.34 * Math.sqrt((i + 0.35) / 14);
          bunch[i % 2].push(shootGeo({
            at: [Math.cos(a) * rr, 0.27 - rr * 0.4, Math.sin(a) * rr],
            len: 0.34 - rr * 0.5, wid: 0.05, tilt: rr * 1.4, yaw: a,
          }));
        }
        p.add(node, mergeGeo(bunch[0]), { color: leaf });
        p.add(node, mergeGeo(bunch[1]), { color: deep });
        const setaCol = mix(deep, flowerOf(col), 0.35);
        p.add(node, xf(tubeGeo(0.011, 0.007, 0.78, 9), { rz: (pl.u("ln") - 0.5) * 0.3, at: [0, 0.16, 0] }), { color: setaCol });
        p.add(node, xf(sphereGeo(10, 5), { sx: 0.045, sy: 0.07, sz: 0.045, at: [0, 0.97, 0], rx: 0.45 }), { color: flowerOf(col) });
        addFace(p, node, { at: [0, 0.22, 0.3], r: 0.075, tri: p.budget * 8 });
      });
    },
    slot(p, pl, s) {
      const { node, band, a } = s;
      const t = (band + 0.5) / 6;
      const { leaf, deep } = pl.pal;

      if (pl.form === "crust") {
        // an overlapping lobed plate, offset but still straddling the axis, so
        // the patch outline stays irregular and stays one piece
        const r = reachOf(pl, a, 0.95 * (1 - 0.62 * t));
        const seg = p.budget >= 90 ? 16 : p.budget >= 55 ? 13 : 11;
        p.add(node, xf(crustGeo({ r, thick: r * (0.3 + pl.u(`ct${s.g}`) * 0.3), lobe: 4 + (s.g % 5), wob: 0.18 + pl.u(`cw${s.g}`) * 0.18, seg }),
          { at: [Math.cos(a) * r * 0.42, 0, Math.sin(a) * r * 0.42] }),
        { color: s.g % 2 ? leaf : mix(leaf, deep, 0.55), colorFn: pl.pal.grad });
        if (p.budget >= 96 && s.g % 2 === 0) {
          for (let j = 0; j < 2; j += 1) {
            const aa = a + (j - 0.5) * 1.3;
            p.add(node, xf(capGeo(r * 0.2, r * 0.13, 9, 3, "funnel"), { at: [Math.cos(aa) * r * 0.45, r * 0.2, Math.sin(aa) * r * 0.45] }),
              { color: shade(flowerOf(col), -0.1) });
          }
        }
        return;
      }

      if (pl.form === "thallus") {
        const r = reachOf(pl, a, 0.95 * (1 - 0.55 * t));
        for (const sgn of [1, -1]) {
          ribbon(p, node, {
            at: [0, 0, 0], len: r, wid: r * (0.42 + pl.u(`tw${s.g}`) * 0.3),
            yaw: a + (sgn > 0 ? 0 : Math.PI), tilt: 0.03 + pl.u(`tt${s.g}`) * 0.22,
            color: s.g % 2 ? leaf : deep, colorFn: pl.pal.grad,
          });
        }
        return;
      }

      if (pl.form === "filament") {
        const r = reachOf(pl, a, 0.42 * (1 - 0.5 * t));
        const n = Math.max(1, Math.min(3, Math.floor(p.budget / 30)));
        for (const sgn of [1, -1]) {
          for (let j = 0; j < n; j += 1) {
            const aa = a + (sgn > 0 ? 0 : Math.PI) + (j - (n - 1) / 2) * 0.5;
            p.add(node, xf(bladeGeo({ len: 0.28 + pl.u(`fl${s.g}${j}`) * 0.3, wid: 0.03, thick: 0.019, shape: "linear", rows: 4, ring: 4, bend: 0.1 }),
              { rx: -Math.PI / 2 + 0.1 + pl.u(`fa${s.g}${j}`) * 0.35, ry: aa, at: [Math.cos(aa) * r, 0, Math.sin(aa) * r] }),
            { color: (s.g + j) % 2 ? leaf : deep, colorFn: pl.pal.grad });
          }
        }
        return;
      }

      // cushion: a knot of tiny shoots, tighter and shorter the higher it sits,
      // so the family reads as a dome of turf rather than a splayed lens
      const r = reachOf(pl, a, 0.92 * (1 - 0.7 * t));
      const n = Math.max(1, Math.min(4, Math.floor(p.budget / 22)));
      const bunch = [[], []];
      for (const sgn of [1, -1]) {
        for (let j = 0; j < n; j += 1) {
          const aa = a + (sgn > 0 ? 0 : Math.PI) + (j - (n - 1) / 2) * 0.55;
          const rr = r * (0.45 + 0.55 * ((j + 0.5) / n));
          bunch[(j + (sgn > 0 ? 0 : 1)) % 2].push(shootGeo({
            at: [Math.cos(aa) * rr, 0, Math.sin(aa) * rr],
            len: 0.1 + pl.u(`ml${s.g}${j}`) * 0.13 + r * 0.3,
            wid: 0.034 + pl.u(`mw${s.g}`) * 0.02,
            tilt: 0.18 + pl.u(`mt${s.g}${j}`) * 0.5, yaw: aa, rows: 3,
          }));
        }
      }
      if (bunch[0].length) p.add(node, mergeGeo(bunch[0]), { color: s.g % 2 ? leaf : deep });
      if (bunch[1].length) p.add(node, mergeGeo(bunch[1]), { color: s.g % 2 ? deep : leaf });
      if (band >= 4 && s.i % 2 === 1 && p.budget >= 70) {
        const setaCol = mix(deep, flowerOf(col), 0.3);
        p.add(node, xf(tubeGeo(0.008, 0.005, 0.16, 8), { rz: Math.cos(a) * 0.2, rx: -Math.sin(a) * 0.2, at: [0, -0.08, 0] }), { color: setaCol });
        p.add(node, xf(sphereGeo(9, 5), { sx: 0.028, sy: 0.042, sz: 0.028, at: [Math.cos(a) * 0.03, 0.1, Math.sin(a) * 0.03], rx: 0.4 }), { color: flowerOf(col) });
      }
    },
  });
}

// ---------- succulents & arids ----------

/**
 * Four cacti that were four identical green barrels differing only in tint,
 * whose "spines" were long green blades the same colour as the body stabbing
 * out sideways. Opuntia is a chain of flat oval PADS; Mammillaria is a globe
 * under dense WHITE spination. Both are selected by genus, and the spines are
 * now short, white and clustered at areoles the way a cactus wears them.
 */
const PAD_GENUS = new Set("opuntia nopalea".split(" "));
const GLOBE_GENUS = new Set("mammillaria frailea gymnocalycium echinopsis parodia rebutia astrophytum".split(" "));

/** A ring of short white spines radiating from one areole. */
function areole(p, node, { at, r, n = 6, len, color, wool }) {
  const g = [];
  for (let i = 0; i < n; i += 1) {
    const b = (i / n) * TAU;
    g.push(xf(coneGeo(r, len * (0.7 + 0.3 * ((i * 5) % 3)), 6), { rz: -Math.cos(b) * 1.35, rx: Math.sin(b) * 1.35, at }));
  }
  p.add(node, mergeGeo(g), { color });
  if (wool) p.add(node, xf(sphereGeo(9, 4), { s: r * 1.8, at }), { color: wool });
}

function cactus(k, col, opt = {}) {
  const g = genusOf(k);
  const kind = PAD_GENUS.has(g) || opt.kind === "pads" ? "pads"
    : GLOBE_GENUS.has(g) || opt.kind === "globe" ? "globe" : "column";
  const spineCol = mix(paper, hex("#e8dcc0"), 0.35);
  grow(k, col, {
    salt: `cactus:${kind}`,
    /* A pad is FLAT, and the silhouette normalisation actively fights that:
       it rescales x and z independently to the planned aspect, so the thin
       axis of a pad gets inflated back into a barrel. Giving the pad body a
       narrow az against a wide ax is the only way to keep it a pad. */
    axSet: kind === "pads" ? [0.85, 1.15, 1.45] : kind === "globe" ? [0.85, 1.2, 1.55] : [0.3, 0.55, 0.8],
    azSet: kind === "pads" ? [0.3, 0.44, 0.58] : kind === "globe" ? [0.85, 1.2, 1.55] : [0.3, 0.55, 0.8],
    height: kind === "globe" ? 0.34 : 0.62,
    breathe: 0.014,
    sway: 0.015,
    bands: [0, 1, 2, 3, 4, 5],
    spine(p, pl) {
      pl.kind = kind;
      pl.anchorColor = pl.pal.deep;
      p.spine("body", (node) => {
        const gp = pl.pal;
        const cg = grad(shade(gp.leaf, 0.14), gp.deep, 0, 0.9);
        if (kind === "pads") {
          // a chain of flat oval pads, each joined to the last at its foot
          let y = 0;
          let lean = 0;
          for (let i = 0; i < 4; i += 1) {
            const rr = 0.185 - i * 0.026;
            lean += (i % 2 ? 1 : -1) * 0.2;
            p.add(node, xf(sphereGeo(13, 7), { sx: rr, sy: rr * 1.45, sz: rr * 0.3, at: [Math.sin(lean) * rr * 0.5, y + rr * 1.3, 0], rz: lean }),
              { color: gp.deep, colorFn: cg });
            y += rr * 2.3;
          }
          addFace(p, node, { at: [0, 0.32, 0.06], r: 0.055, tri: p.budget * 8 });
        } else if (kind === "globe") {
          // a squat ribbed globe under a fur of spines
          p.add(node, xf(sphereGeo(15, 8), { sx: 0.4, sy: 0.5, sz: 0.4, at: [0, 0.5, 0] }), { color: gp.deep, colorFn: grad(shade(gp.leaf, 0.16), gp.deep, 0.1, 0.9) });
          /* Mammillaria is named for its tubercles and worn under a dense
             white fur; a bare green egg with five spines is not it. */
          const dense = genusOf(k) === "mammillaria";
          const na = dense ? 22 : 12;
          for (let i = 0; i < na; i += 1) {
            const a = i * 2.399;
            const b = Math.acos(1 - (2 * (i + 0.5)) / na) * 0.7;
            const d = [Math.cos(a) * Math.sin(b), Math.cos(b), Math.sin(a) * Math.sin(b)];
            const at = [d[0] * 0.4, 0.5 + d[1] * 0.5, d[2] * 0.4];
            if (dense) p.add(node, xf(sphereGeo(9, 4), { s: 0.048, at: [d[0] * 0.37, 0.5 + d[1] * 0.46, d[2] * 0.37] }), { color: shade(pl.pal.leaf, 0.12) });
            areole(p, node, { at, r: dense ? 0.009 : 0.011, n: dense ? 7 : 5, len: dense ? 0.16 : 0.12, color: spineCol, wool: paper });
          }
          addFace(p, node, { at: [0, 0.55, 0.42], r: 0.09, tri: p.budget * 8 });
        } else {
          p.add(node, xf(tubeGeo(0.075, 0.055, 0.92, 14, 0.012)), { color: gp.deep, colorFn: cg });
          p.add(node, xf(capGeo(0.055, 0.09, 14, 5, "dome"), { at: [0, 0.92, 0] }), { color: gp.deep });
          addFace(p, node, { at: [0, 0.3, 0.072], r: 0.05, tri: p.budget * 8 });
        }
      });
    },
    slot(p, pl, s) {
      const { node, band, a, top } = s;
      if (band >= top && s.i === 0) {
        addFlower(p, node, { tri: p.budget, at: [Math.cos(a) * 0.05, 0, Math.sin(a) * 0.05], kind: "daisy", r: 0.055, color: flowerOf(col), stalkLen: 0.02 });
        return;
      }
      if (pl.kind === "pads" && band >= 2 && s.i % 3 === 0) {
        // a side pad budding off the chain
        const rr = 0.075 + pl.u(`pr${s.g}`) * 0.05;
        p.add(node, xf(sphereGeo(12, 6), { sx: rr, sy: rr * 1.4, sz: rr * 0.3, at: [Math.cos(a) * rr * 1.1, rr * 0.9, Math.sin(a) * rr * 1.1], ry: a, rz: -Math.cos(a) * 0.5 }),
          { color: s.g % 2 ? pl.pal.leaf : pl.pal.deep, colorFn: pl.pal.grad });
        if (p.budget >= 56) areole(p, node, { at: [Math.cos(a) * rr * 1.1, rr * 1.7, Math.sin(a) * rr * 1.1], r: 0.007, n: 4, len: 0.05, color: spineCol });
        return;
      }
      // areole spine clusters: short, white, and paired across the axis so the
      // part is connected without a pedicel
      const r = reachOf(pl, a, pl.kind === "globe" ? 0.42 : 0.5);
      const len = pl.kind === "globe" ? 0.075 : 0.055;
      for (const sgn of [1, -1]) {
        areole(p, node, {
          at: [Math.cos(a) * r * sgn, 0, Math.sin(a) * r * sgn],
          r: 0.006, n: p.budget >= 60 ? 6 : 4, len, color: spineCol,
          wool: pl.kind === "globe" && p.budget >= 70 ? paper : null,
        });
      }
    },
  });
}

/**
 * Succulents. A rosette of fat leaves standing UP out of a swollen base — the
 * same positive-pitch droop as the rosettes and the herbs had laid all four
 * of them out flat on the ground. Adenium is not a rosette at all: it is a
 * caudex, a bottle of a trunk with a tuft on top.
 */
function succulent(k, col) {
  const caudex = ["adenium", "pachypodium", "jatropha", "cyphostemma"].includes(genusOf(k));
  grow(k, col, {
    salt: `succulent:${caudex ? "caudex" : "rosette"}`,
    axSet: caudex ? [0.55, 0.9, 1.25] : [0.75, 1.15, 1.55],
    azSet: caudex ? [0.55, 0.9, 1.25] : [0.75, 1.15, 1.55],
    height: caudex ? 0.45 : 0.32,
    breathe: 0.028,
    sway: 0.03,
    bands: [0, 1, 2, 3, 4, 5],
    spine(p, pl) {
      pl.caudex = caudex;
      pl.anchorColor = pl.pal.deep;
      p.spine("heart", (node) => {
        if (caudex) {
          const tr = mix(trunkOf(col), hex("#c8b89a"), 0.5);
          p.add(node, xf(tubeGeo(0.16, 0.05, 0.62, 13, 0.05)), { color: tr, colorFn: grad(shade(tr, 0.16), shade(tr, -0.2), 0, 0.62) });
          const tuft = [];
          for (let i = 0; i < 6; i += 1) {
            const a = i * 2.399 + pl.u("t0") * TAU;
            tuft.push(xf(bladeGeo({ len: 0.34, wid: 0.13, thick: 0.03, shape: "obovate", rows: 4, ring: 5, bend: -0.06 }),
              { rx: -1.1 + (i % 3) * 0.22, ry: a, at: [0, 0.62, 0] }));
          }
          p.add(node, mergeGeo(tuft), { color: pl.pal.leaf, colorFn: pl.pal.grad });
          addFace(p, node, { at: [0, 0.3, 0.11], r: 0.06, tri: p.budget * 8 });
        } else {
          p.add(node, xf(sphereGeo(12, 6), { sx: 0.08, sy: 0.05, sz: 0.08, at: [0, 0.04, 0] }), { color: pl.pal.deep });
          const rose = [[], []];
          for (let i = 0; i < 7; i += 1) {
            const a = i * 2.399 + pl.u("r0") * TAU;
            rose[i % 2].push(xf(bladeGeo({ len: 0.68 - (i % 3) * 0.07, wid: 0.2, thick: 0.09, shape: "obovate", rows: 4, ring: 5, bend: 0.05 }),
              { rx: -1.25 + (i % 3) * 0.22, ry: a, at: [0, 0.05, 0] }));
          }
          p.add(node, mergeGeo(rose[0]), { color: pl.pal.leaf, colorFn: pl.pal.grad });
          p.add(node, mergeGeo(rose[1]), { color: mix(pl.pal.leaf, pl.pal.deep, 0.5) });
          addFace(p, node, { at: [0, 0.06, 0.08], r: 0.05, tri: p.budget * 8 });
        }
      });
    },
    slot(p, pl, s) {
      const { node, band, a } = s;
      const t = (band + 0.5) / 6;
      const r = reachOf(pl, a, 0.95 * (pl.caudex ? 1 : 1 - 0.45 * t));
      if (pl.caudex && band <= 2) {
        const br = baseReach(pl, 0.4);
        p.add(node, xf(tubeGeo(br * 0.3, br * 0.16, br * 1.6, 9), { rz: -Math.cos(a) * 0.5, rx: Math.sin(a) * 0.5 }),
          { color: mix(trunkOf(col), hex("#c8b89a"), 0.5) });
        return;
      }
      addLeaf(p, node, { tri: p.budget,
        yaw: a, pitch: -1.05 + pl.u(`sp${s.g}`) * 0.75,
        len: r, wid: r * (0.34 + pl.u(`sw${s.g}`) * 0.22), thick: r * 0.28,
        shape: "obovate", rows: 4, ring: 5, bend: r * 0.06, stalk: 0.02,
        color: mix(pl.pal.leaf, pl.pal.deep, (s.g % 3) / 3), colorFn: pl.pal.grad,
      });
    },
  });
}

/**
 * The archetype's name promises an upright rosette and the first pass drew a
 * horizontal splay: eight of ten had their blades lying out flat. The cause is
 * one sign — `pitch` in addLeaf rotates the blade DOWNWARD, so every positive
 * pitch in the file is a droop. A snake plant does not droop.
 *
 * Four bodies live here: stiff swords (Sansevieria), canes (Dracaena),
 * thick rigid succulent blades (Agave) and arching straps (everything else).
 */
const CANE_GENUS = new Set("dracaena cordyline".split(" "));
const SWORD_GENUS = new Set("sansevieria".split(" "));
const RIGID_GENUS = new Set("agave furcraea yucca".split(" "));

function rosetteBlades(k, col, opt = {}) {
  const g = genusOf(k);
  const form = SWORD_GENUS.has(g) ? "sword"
    : CANE_GENUS.has(g) || opt.cane ? "cane"
      : RIGID_GENUS.has(g) ? "rigid" : "strap";
  const cane = form === "cane";
  grow(k, col, {
    salt: `rosette:${form}`,
    // an upright rosette is TALLER than it is wide, by definition
    axSet: form === "sword" ? [0.35, 0.6, 0.85] : ASPECT_CROWN,
    azSet: form === "sword" ? [0.35, 0.6, 0.85] : ASPECT_CROWN,
    height: form === "sword" ? 0.72 : cane ? 0.8 : 0.58,
    breathe: 0.016,
    sway: form === "sword" ? 0.015 : 0.04,
    bands: [0, 1, 2, 3, 4, 5],
    spine(p, pl) {
      pl.form = form;
      pl.anchorColor = cane ? trunkOf(col) : pl.pal.deep;
      p.spine("blade0", (node) => {
        if (cane) {
          const h = 0.6 + pl.u("ch") * 0.22;
          const tr = trunkOf(col);
          const nodes = 4 + (pl.H("nd") % 4);
          for (let i = 0; i < nodes; i += 1) {
            const y0 = (i / nodes) * h;
            p.add(node, xf(tubeGeo(0.03 - i * 0.0016, 0.029 - i * 0.0016, h / nodes - 0.006, 11), { at: [0, y0, 0] }), { color: tr });
            p.add(node, xf(discGeo(0.034 - i * 0.0016, 0.008, 9), { at: [0, y0 + h / nodes - 0.005, 0] }), { color: shade(tr, -0.22) });
          }
          // the terminal tuft: canes carry their leaves in a crown at the top
          const tuftGeo = [[], []];
          for (let i = 0; i < 7; i += 1) {
            const a = i * 2.399 + pl.u("t0") * TAU;
            tuftGeo[i % 2].push(xf(bladeGeo({ len: (1 - h) * (1.05 + (i % 3) * 0.14), wid: 0.075, thick: 0.014, shape: "lanceolate", rows: 4, ring: 4, bend: -0.1 }),
              { rx: -1.5 + 0.42 + (i % 3) * 0.12, ry: a, at: [0, h, 0] }));
          }
          p.add(node, mergeGeo(tuftGeo[0]), { color: pl.pal.leaf, colorFn: pl.pal.grad });
          p.add(node, mergeGeo(tuftGeo[1]), { color: pl.pal.deep });
          addFace(p, node, { at: [0, h * 0.45, 0.03], r: 0.036, tri: p.budget * 8 });
        } else {
          const stiff = form === "sword" || form === "rigid";
          p.add(node, xf(bladeGeo({
            len: 1.02, wid: form === "sword" ? 0.1 : form === "rigid" ? 0.18 : 0.13,
            thick: form === "rigid" ? 0.06 : form === "sword" ? 0.035 : 0.022,
            shape: form === "rigid" ? "lanceolate" : "linear", rows: 6, ring: form === "rigid" ? 5 : 4,
            bend: stiff ? -0.03 : -0.16, fold: form === "sword" ? 0.12 : 0.2,
          }), { rx: -Math.PI / 2 - 0.02 }),
          { color: pl.pal.leaf, colorFn: opt.edge ? grad(shade(pl.pal.leaf, 0.32), pl.pal.deep, 0, 0.8) : pl.pal.grad });
          p.add(node, xf(sphereGeo(12, 5), { sx: 0.055, sy: 0.035, sz: 0.055, at: [0, 0.02, 0] }), { color: pl.pal.deep });
          addFace(p, node, { at: [0, 0.09, 0.05], r: 0.04, tri: p.budget * 8 });
        }
      });
    },
    slot(p, pl, s) {
      const { node, band, a } = s;
      const t = (band + 0.5) / 6;

      if (pl.form === "cane") {
        if (band <= 2) {
          // a side shoot low on the cane
          const br = baseReach(pl, 0.5);
          p.add(node, xf(tubeGeo(br * 0.2, br * 0.14, br * 1.5, 9), { rz: -Math.cos(a) * 0.5, rx: Math.sin(a) * 0.5 }), { color: trunkOf(col) });
          addLeaf(p, node, {
            tri: p.budget * 0.8, yaw: a, pitch: -0.95 + pl.u(`cp${s.g}`) * 0.4,
            len: br * 2.1, wid: br * 0.5, shape: "lanceolate", rows: 4, ring: 4, bend: -br * 0.5, stalk: 0.05,
            at: [Math.cos(a) * br * 0.7, br * 1.2, Math.sin(a) * br * 0.7],
            color: s.g % 2 ? pl.pal.leaf : pl.pal.deep, colorFn: pl.pal.grad,
          });
          return;
        }
        const r = reachOf(pl, a, 0.95);
        addLeaf(p, node, {
          tri: p.budget, yaw: a, pitch: -1.15 + pl.u(`rp${s.g}`) * 0.6,
          len: r * 1.35, wid: r * 0.22, thick: r * 0.05,
          shape: "lanceolate", rows: 5, ring: 4, bend: -r * 0.35, stalk: 0.04,
          color: s.g % 2 ? pl.pal.leaf : pl.pal.deep, colorFn: pl.pal.grad,
        });
        return;
      }

      const r = reachOf(pl, a, 0.9);
      const stiff = pl.form === "sword" || pl.form === "rigid";
      /* Negative pitch: UP. This one sign is the whole of the complaint. */
      const pitch = pl.form === "sword" ? -1.42 + pl.u(`rp${s.g}`) * 0.22
        : pl.form === "rigid" ? -1.1 + pl.u(`rp${s.g}`) * 0.42
          : -1.2 + pl.u(`rp${s.g}`) * 0.5;
      const len = r * (pl.form === "sword" ? 1.5 : 1.05) * (0.72 + (opt.tall ?? 0.2) * 1.3);
      addLeaf(p, node, {
        tri: p.budget, yaw: a, pitch,
        len, wid: r * (pl.form === "sword" ? 0.18 : pl.form === "rigid" ? 0.3 : 0.22),
        thick: r * (pl.form === "rigid" ? 0.13 : pl.form === "sword" ? 0.06 : 0.05),
        shape: pl.form === "rigid" ? "lanceolate" : "linear",
        rows: 5, ring: pl.form === "rigid" ? 5 : 4,
        bend: stiff ? -r * 0.06 : -r * (0.3 + t * 0.35), fold: 0.22, stalk: 0.02,
        color: s.g % 2 ? pl.pal.leaf : pl.pal.deep,
        colorFn: opt.edge ? grad(shade(pl.pal.leaf, 0.3), pl.pal.deep, 0, 0.4) : pl.pal.grad,
      });
      // Agave finishes every blade with a hard terminal spine
      if (pl.form === "rigid" && p.budget >= 52) {
        const y = Math.sin(-pitch) * len, rr = Math.cos(-pitch) * len;
        p.add(node, xf(coneGeo(r * 0.035, r * 0.16, 7), { rz: -Math.cos(a) * (1.5708 + pitch), rx: Math.sin(a) * (1.5708 + pitch), at: [Math.cos(a) * rr, y, Math.sin(a) * rr] }),
          { color: shade(trunkOf(col), -0.2) });
      }
    },
  });
}

// ---------- aroids, vines, water ----------

/**
 * Aroids stand UP. Every one of them carries its blade on a long erect
 * petiole out of a basal rhizome, and the two the campus actually knows by
 * name — Peace Lily and Anthurium — are recognised by the spathe-and-spadix
 * and by nothing else. The first pass drew a flat splayed mass of shards with
 * neither, so all sixteen read as the same broken thing.
 */
const SPATHE_GENUS = new Set("spathiphyllum anthurium zantedeschia".split(" "));
const EAR_GENUS = new Set("alocasia colocasia xanthosoma remusatia amorphophallus typhonium".split(" "));

/** Spathe-and-spadix: a folded bract standing behind an upright club. */
function addSpathe(p, node, { at = [0, 0, 0], yaw = 0, r, color, spadix, tri = 200 }) {
  p.add(node, xf(bladeGeo({ len: r * 2.3, wid: r * 1.45, thick: r * 0.1, shape: "ovate", rows: tri >= 140 ? 5 : 4, ring: 4, fold: 0.7, bend: -r * 0.5 }),
    { rx: -1.32, ry: yaw, at }), { color });
  p.add(node, xf(tubeGeo(r * 0.17, r * 0.1, r * 1.35, 9), { rx: -0.3, ry: yaw, at: [at[0], at[1] + r * 0.28, at[2] + Math.cos(yaw) * 0 + r * 0.06] }), { color: spadix });
}

function aroid(k, col) {
  const g = genusOf(k);
  const spathe = SPATHE_GENUS.has(g);
  const ear = EAR_GENUS.has(g);
  const spatheCol = g === "spathiphyllum" ? paper : g === "anthurium" ? APP.red : flowerOf(col);
  grow(k, col, {
    salt: `aroid:${spathe ? "spathe" : ear ? "ear" : "leaf"}`,
    /* Crown proportions, not the general pool: an aroid is a bundle of erect
       petioles, and the wide end of the pool laid the whole plant on its side. */
    axSet: ASPECT_CROWN,
    azSet: ASPECT_CROWN,
    height: ear ? 0.75 : 0.6,
    breathe: 0.02,
    sway: 0.035,
    bands: [0, 1, 2, 3, 4, 5],
    spine(p, pl) {
      pl.ear = ear;
      pl.spathe = spathe;
      pl.anchorColor = pl.pal.deep;
      const pet = mix(pl.pal.deep, trunkOf(col), 0.28);
      p.spine("petiole0", (node) => {
        const h = ear ? 0.66 : 0.58;
        // one stout erect petiole carrying the biggest blade of the plant
        p.add(node, xf(tubeGeo(0.022, 0.014, h, 10), { rz: (pl.u("ln") - 0.5) * 0.14 }),
          { color: pet, colorFn: grad(shade(pet, 0.14), shade(pet, -0.2), 0, h) });
        const bl = ear ? 0.5 : 0.42;
        p.add(node, xf(bladeGeo({ len: bl, wid: bl * (ear ? 0.85 : 0.72), thick: 0.03, shape: ear ? "hastate" : "cordate", rows: 5, ring: 4, bend: -bl * 0.35, fold: 0.16 }),
          { rx: -1.05, at: [0, h, 0] }), { color: pl.pal.leaf, colorFn: col.leafGrad ?? pl.pal.grad });
        // the rhizome the petioles all rise out of
        p.add(node, xf(sphereGeo(11, 5), { sx: 0.07, sy: 0.045, sz: 0.07, at: [0, 0.02, 0] }), { color: pl.pal.deep });
        addFace(p, node, { at: [0, 0.2, 0.022], r: 0.04, tri: p.budget * 8 });
      });
    },
    slot(p, pl, s) {
      const { node, band, a, top } = s;
      const pet = mix(pl.pal.deep, trunkOf(col), 0.28);

      if (pl.spathe && band >= 3 && s.g % 3 === 0) {
        const r = reachOf(pl, a, 0.5);
        const tilt = 0.28;
        const L = r * 1.15;
        p.add(node, xf(tubeGeo(0.011, 0.008, L, 9), { rz: -Math.cos(a) * tilt, rx: Math.sin(a) * tilt }), { color: pl.pal.deep });
        addSpathe(p, node, {
          at: [Math.cos(a) * L * Math.sin(tilt), L * Math.cos(tilt), Math.sin(a) * L * Math.sin(tilt)],
          yaw: a, r: Math.min(0.15, r * 0.72), color: spatheCol, spadix: mix(paper, APP.orange, 0.55), tri: p.budget,
        });
        return;
      }

      // an ordinary leaf: erect petiole out of the rhizome, blade HELD at its
      // tip. The petiole is drawn, not implied, which is why the archetype
      // now reads as a plant standing up rather than a pile of leaves.
      const r = reachOf(pl, a, 0.95);
      const tilt = 0.34 + pl.u(`at${s.g}`) * 0.4;   // from vertical
      const L = r * (0.5 + pl.u(`al${s.g}`) * 0.28);
      p.add(node, xf(tubeGeo(0.013, 0.009, L, 9), { rz: -Math.cos(a) * tilt, rx: Math.sin(a) * tilt }),
        { color: pet, colorFn: grad(shade(pet, 0.12), shade(pet, -0.18), 0, L) });
      const tip = [Math.cos(a) * L * Math.sin(tilt), L * Math.cos(tilt), Math.sin(a) * L * Math.sin(tilt)];
      const bl = r * (pl.ear ? 0.72 : 0.6);
      addLeaf(p, node, {
        tri: p.budget, at: tip, yaw: a,
        pitch: -0.75 + pl.u(`ap${s.g}`) * 0.5,
        len: bl, wid: bl * (pl.ear ? 0.8 : 0.55 + pl.u(`aw${s.g}`) * 0.3),
        shape: pl.ear ? ["hastate", "cordate"][s.g % 2] : ["cordate", "hastate", "ovate", "orbicular"][pl.H(`as${s.g}`) % 4],
        form: !pl.ear && pl.u(`af${s.g}`) > 0.78 ? "lobed" : "simple",
        rows: 5, ring: 4, stalk: 0, fold: 0.12,
        bend: -bl * (0.5 + pl.u(`ab${s.g}`) * 0.35),
        color: s.g % 2 ? pl.pal.leaf : pl.pal.deep, colorFn: col.leafGrad ?? pl.pal.grad,
      });
    },
  });
}

/**
 * Climbers that actually climb. The first pass drew a vine as a slightly wavy
 * stem with leaves on it, which is a seedling herb: nothing twined, nothing
 * coiled, nothing was being climbed. A vine reads as a vine because of three
 * things and none of them are the leaf — a SUPPORT, a stem TWINING round it,
 * and TENDRILS. All three live in the builder, so all 57 get them.
 */
const TENDRIL_GENUS = new Set((
  "momordica luffa coccinia cucumis trichosanthes benincasa lagenaria citrullus cucurbita " +
  "sechium passiflora cayratia cissus ampelocissus vitis parthenocissus smilax bryonia " +
  "diplocyclos zehneria gynostemma"
).split(" "));

function vine(k, col) {
  const varie = !!col.variegated;
  const cucurbit = TENDRIL_GENUS.has(genusOf(k));
  grow(k, col, {
    salt: "vine",
    /* A climber is TALL and narrow: it is going somewhere. The wide end of the
       general aspect pool turned every vine into a pancake of leaves seen from
       above, which is where "nothing climbs" came from as much as the missing
       tendrils did. */
    axSet: ASPECT_VINE,
    azSet: ASPECT_VINE,
    height: 0.9,
    breathe: 0.018,
    sway: 0.05,
    bands: [0, 1, 2, 3, 4, 5],
    spine(p, pl) {
      pl.turn = 1.9 + pl.u("tw") * 1.9;
      pl.coilR = 0.055 + pl.u("cr") * 0.035;
      pl.cucurbit = cucurbit;
      pl.bloomSpec = bloomOf(k);
      pl.anchorColor = pl.pal.deep;
      p.spine("climber", (node) => {
        const prop = mix(trunkOf(col), hex("#7a7264"), 0.5);
        // the thing it is climbing. A bare prop reads as "support" at gallery
        // size and costs one tube; without it a twining stem is just a squiggle.
        p.add(node, xf(tubeGeo(0.024, 0.016, 1, 10)), { color: prop, colorFn: grad(shade(prop, 0.12), shade(prop, -0.26), 0, 1) });
        // the stem, wound round it
        p.add(node, xf(coilGeo({ R: pl.coilR, r: 0.014, h: 0.97, turn: pl.turn, segs: 26, ring: 7 })),
          { color: pl.pal.deep, colorFn: grad(shade(pl.pal.leaf, 0.1), pl.pal.deep, 0, 1) });
        addFace(p, node, { at: [0, 0.36, pl.coilR + 0.02], r: 0.04, tri: p.budget * 8 });
      });
    },
    slot(p, pl, s) {
      const { node, band, i, n } = s;
      /* Leaves come off the STEM, not off the axis: replay where the helix is
         at the height this slot is about to be placed at, and hang the petiole
         there. That is the difference between a vine and a stack of leaves. */
      const y = (band + 0.35 + (0.55 * (i + 0.5)) / Math.max(1, n)) / 6;
      const a = y * pl.turn * TAU + pl.u("az0") * TAU;
      const hub = [Math.cos(a) * pl.coilR, 0, Math.sin(a) * pl.coilR];

      // a coiled tendril reaching off the stem — the cucurbits always get one
      const wantTendril = pl.cucurbit ? (s.g % 4 === 1) : (band >= 2 && s.g % 5 === 3);
      /* Forced only for the first couple on a cucurbit, where the tendril is
         the genus diagnostic. A forced add bypasses the triangle ceiling, and
         eleven of them on a 32-part plan walked straight through the 120 kB
         per-model test assertion. */
      const force = pl.cucurbit && s.g < 7;
      if (wantTendril && (p.budget >= 62 || force)) {
        const R = 0.032 + pl.u(`td${s.g}`) * 0.022;
        p.add(node, xf(tubeGeo(0.007, 0.005, 0.1, 7), { rz: -Math.cos(a) * 1.1, rx: Math.sin(a) * 1.1, at: hub }), { color: pl.pal.deep }, force);
        p.add(node, xf(coilGeo({ R, r: 0.0065, h: 0.075, turn: 2.3, segs: 12, ring: 6 }),
          { rx: 0.9, ry: a, at: [Math.cos(a) * (pl.coilR + 0.1), 0.02, Math.sin(a) * (pl.coilR + 0.1)] }),
        { color: shade(pl.pal.deep, 0.12) }, force);
        if (node.parts.length) return;
      }

      // a trailing shoot at the foot of the plant: the habit of a vine that has
      // run out of support and is spilling sideways
      if (band === 0 && s.i % 2 === 0) {
        const r = reachOf(pl, a, 0.95);
        p.add(node, xf(coilGeo({ R: r * 0.42, r: 0.009, h: 0.06, turn: 0.75, segs: 12, ring: 6 }), { at: hub }), { color: pl.pal.deep });
        for (const sgn of [1, -1]) {
          p.add(node, xf(bladeGeo({ len: r * 0.4, wid: r * 0.3, thick: 0.008, shape: "cordate", rows: 4, ring: 4 }),
            { rx: 1.35, ry: a + sgn * 1.6, at: [Math.cos(a + sgn * 1.6) * r * 0.42, 0, Math.sin(a + sgn * 1.6) * r * 0.42] }),
          { color: sgn > 0 ? pl.pal.leaf : pl.pal.deep, colorFn: pl.pal.grad });
        }
        return;
      }

      const r = reachOf(pl, a, 0.8);
      const cf = varie
        ? (q) => (q[0] + q[2] > 0.02 ? mix(pl.pal.leaf, hex("#e8d44a"), 0.55) : pl.pal.deep)
        : pl.pal.grad;
      addLeaf(p, node, {
        tri: p.budget, at: hub,
        yaw: a, pitch: 0.5 + pl.u(`vp${s.g}`) * 0.55,
        len: r, wid: r * (0.4 + pl.u(`vw${s.g}`) * 0.26),
        shape: ["cordate", "ovate", "orbicular", "hastate"][pl.H(`vs${s.g}`) % 4],
        form: pl.u(`vf${s.g}`) > 0.7 ? "lobed" : "simple",
        rows: 5, ring: 4, stalk: 0.34,
        color: s.g % 2 ? pl.pal.leaf : pl.pal.deep, colorFn: cf, stalkColor: pl.pal.deep,
      });
      // bract / flower clusters where the species is grown for them
      const spec = pl.bloomSpec;
      if (spec && band >= 2 && s.g % 3 === 2 && p.budget >= 50) {
        addFlower(p, node, {
          tri: p.budget * 0.8, at: [Math.cos(a) * r * 0.45, 0.02, Math.sin(a) * r * 0.45],
          kind: spec.kind, r: spec.r, color: spec.color, color2: shade(spec.color, 0.28), stalkLen: 0.02, pitch: 0.4, yaw: a,
        });
      }
    },
  });
}

function waterPlant(k, col) {
  grow(k, col, {
    salt: "water",
    height: 0.35,
    breathe: 0.028,
    sway: 0.05,
    bands: [0, 1, 2, 3, 4, 5],
    spine(p, pl) {
      p.spine("stem", (node) => {
        p.add(node, xf(tubeGeo(0.012, 0.009, 0.86, 10)), { color: pl.pal.deep });
        addFlower(p, node, { tri: p.budget, at: [0, 0.9, 0], kind: "star", r: 0.09, color: flowerOf(col) });
        p.add(node, xf(sphereGeo(12, 5), { sx: 0.05, sy: 0.02, sz: 0.05, at: [0, 0.012, 0] }), { color: pl.pal.deep });
        addFace(p, node, { at: [0, 0.2, 0.013], r: 0.03 });
      });
    },
    slot(p, pl, s) {
      const { node, band, a } = s;
      const r = reachOf(pl, a, 0.95);
      if (band <= 2) {
        addCap(p, node, { r: r * 0.55, h: r * 0.14, shape: "flat", tri: p.budget, at: [Math.cos(a) * r * 0.42, 0, Math.sin(a) * r * 0.42],
          color: s.g % 2 ? pl.pal.leaf : pl.pal.deep, colorFn: pl.pal.grad });
        p.add(node, xf(tubeGeo(0.007, 0.005, r * 0.45, 6), { rz: -1.5708, ry: a }), { color: pl.pal.deep });
        return;
      }
      for (const sgn of [1]) {
        addLeaf(p, node, { tri: p.budget,
          yaw: a + (sgn > 0 ? 0 : Math.PI), pitch: 0.35 + pl.u(`wp${s.g}`) * 0.5,
          len: r * 0.8, wid: r * 0.36, shape: "elliptic", rows: 5, ring: 4, stalk: 0.2,
          color: pl.pal.leaf, colorFn: pl.pal.grad, stalkColor: pl.pal.deep,
        });
      }
    },
  });
}

// ---------- fungi ----------

const CAP_SHAPE = ["dome", "bell", "flat", "funnel", "cone"];

/** Genera whose bracket is zoned in concentric bands — turkey-tail and kin. */
const ZONED_GENUS = new Set((
  "trametes trametopsis stereum coriolopsis hexagonia lenzites daedaleopsis xylobolus " +
  "schizophyllum microporus hymenochaete cerrena"
).split(" "));
/** Genera whose bracket is a thick woody half-disc. */
const WOODY_GENUS = new Set("ganoderma fomitopsis phellinus fomes fuscoporia nigroporus".split(" "));
/** Hard black stromata and cushions on wood — routed to coral, but not corals. */
const STROMA_GENUS = new Set("annulohypoxylon daldinia hypoxylon nemania kretzschmaria biscogniauxia".split(" "));
/** Stinkhorns — routed to puffball, but a stinkhorn is a stalk and a slimy cap. */
const STINKHORN_GENUS = new Set("phallus mutinus clathrus lysurus simblum".split(" "));

/**
 * ONE bracket, attached along ONE edge on ONE face of the log.
 *
 * The first pass drew a shelf as a symmetric lens centred on a point out at
 * radius, which meant half of every shelf was inside the log and came out the
 * far side as a needle point — about twenty of the forty-four had a blade
 * skewered clean through the trunk. A real bracket has a chord where it meets
 * the wood and grows outward from there only, so that is what this is: a
 * closed outline running along the attachment chord at `r0` and back around
 * the rim at `r`, lofted into a thin domed shelf.
 */
function shelfGeo({ r0, r, h, arc = Math.PI * 0.95, seg = 10, droop = 0.3 }) {
  const rimY = -droop * (r - r0);
  const ring = (side) => {
    const pts = [];
    for (let j = 0; j <= seg; j += 1) {
      const a = -arc / 2 + (arc * j) / seg;
      pts.push([Math.sin(a) * r, rimY + side * h * 0.16, Math.cos(a) * r]);
    }
    for (let j = seg; j >= 0; j -= 1) {
      const a = -arc / 2 + (arc * j) / seg;
      pts.push([Math.sin(a) * r0, side * h, Math.cos(a) * r0]);
    }
    return { pts };
  };
  const cz = (r0 + r) * 0.5;
  return clean(loft([
    { pole: [0, -h * 0.45 + rimY * 0.3, cz] },
    ring(-1), ring(1),
    { pole: [0, h * 0.6 + rimY * 0.3, cz] },
  ]));
}

/**
 * Concentric zonation, keyed off distance from the log axis. Three tones, not
 * two: turkey-tail is banded cream / mid / dark, and a brown-on-brown pair is
 * invisible at gallery size — which is how the poster child of the family
 * shipped as a plain lumpy mass.
 */
function zoneFn(band, r0, r) {
  const span = Math.max(1e-6, r - r0);
  return (q) => band[Math.max(0, Math.floor(((Math.hypot(q[0], q[2]) - r0) / span) * band.length * 1.4)) % band.length];
}

/** A frilly ruffled lobe — snow fungus, and the rim of an ear. */
function ruffleGeo({ len, wid, thick, waves = 3, rows = 5, ring = 4 }) {
  const g = bladeGeo({ len, wid, thick, shape: "orbicular", rows, ring });
  g.positions = g.positions.map((q) => {
    const t = q[2] / Math.max(1e-6, len);
    return [q[0], q[1] + Math.sin(t * Math.PI * waves) * wid * 0.22 * (0.3 + t), q[2]];
  });
  return g;
}

function mushroom(k, col, opt = {}) {
  const kind = opt.kind ?? "cap";
  const g = genusOf(k);
  const capCol = col.base ?? FUNGI_CAPS[0];
  const stalkCol = col.stalk ?? hex("#e8dcc0");
  const capDark = col.dark ?? shade(capCol, -0.3);
  const capGrad = col.capGrad ?? grad(shade(capCol, 0.18), capDark, 0, 0.2);
  const wood = hex("#7a5230");

  if (kind === "bracket") {
    const zoned = ZONED_GENUS.has(g);
    const woody = WOODY_GENUS.has(g);
    /* Ganoderma applanatum is the artist's bracket: a woody GREY half-disc,
       and it was shipping as red needle blades. */
    const shelfCol = woody ? mix(capCol, hex("#8a8a80"), 0.55) : capCol;
    const shelfDark = woody ? mix(capDark, hex("#5a5a52"), 0.5) : capDark;
    grow(k, col, {
      salt: `fungi:bracket:${zoned ? "z" : woody ? "w" : "p"}`,
      /* Roughly round in plan. The general aspect pool runs to nineteen to one,
         and a shelf stretched nineteen to one is a knife blade — which is what
         the remaining "skewers" turned out to be once the geometry itself was
         attached properly. */
      axSet: [0.7, 1.05, 1.4, 1.75],
      azSet: [0.7, 1.05, 1.4, 1.75],
      height: 0.4,
      breathe: 0.02,
      sway: 0.015,
      bands: [0, 1, 2, 3, 4, 5],
      spine(p, pl) {
        pl.logR = 0.05;
        pl.anchorColor = wood;
        p.spine("log", (node) => {
          p.add(node, xf(tubeGeo(0.055, 0.048, 1, 12)), { color: wood, colorFn: grad(shade(wood, 0.12), shade(wood, -0.25), 0, 1) });
          p.add(node, xf(sphereGeo(12, 5), { sx: 0.05, sy: 0.02, sz: 0.05, at: [0, 1, 0] }), { color: shade(wood, -0.2) });
          addFace(p, node, { at: [0, 0.42, 0.05], r: 0.042, tri: p.budget * 8 });
        });
      },
      slot(p, pl, s) {
        const { node, band, a } = s;
        if (band <= 1 && s.i % 3 === 2) {
          addTuft(p, node, { tri: p.budget, at: [0, 0, 0], r: 0.05, n: 3, color: APP.green, color2: APP.greenDeep, squash: 0.6 });
          return;
        }
        const r0 = pl.logR * 0.92;
        const r = r0 + 0.09 + pl.u(`sr${s.g}`) * (woody ? 0.1 : 0.14);
        const h = (woody ? 0.05 : zoned ? 0.016 : 0.03) * (0.8 + pl.u(`sh${s.g}`) * 0.5);
        const seg = p.budget >= 90 ? 12 : p.budget >= 50 ? 9 : 7;
        const base = s.g % 2 ? shelfCol : shelfDark;
        p.add(node, xf(shelfGeo({
          /* Never past a half-circle. A shelf that wraps more than 180 degrees
             stops being star-shaped about the point its top face fans from,
             and the fan then folds back on itself as the needle spikes the
             review saw coming out of the far side of the log. */
          r0, r, h, seg, arc: Math.PI * (woody ? 0.7 : 0.62 + pl.u(`sa${s.g}`) * 0.32),
          droop: woody ? 0.12 : 0.26 + pl.u(`sd${s.g}`) * 0.2,
        }), { ry: a }),
        {
          color: base,
          colorFn: zoned
            ? zoneFn([mix(shelfCol, paper, 0.62), shelfCol, shelfDark, shade(shelfCol, 0.2)], r0, r)
            : capGrad,
        });
        // the pore surface, a shade paler, tucked just under the shelf
        if (p.budget >= 58) {
          p.add(node, xf(shelfGeo({ r0, r: r * 0.94, h: h * 0.34, seg: Math.max(7, seg - 2), arc: Math.PI * 0.9, droop: 0.3 }),
            { ry: a, at: [0, -h * 0.9, 0] }), { color: shade(paper, -0.1) });
        }
      },
    });
    return;
  }

  if (kind === "coral") {
    const stroma = STROMA_GENUS.has(g);
    if (stroma) {
      /* Not a coral at all: a hard black cushion welded to dead wood. */
      const black = mix(capDark, ink, 0.78);
      grow(k, col, {
        salt: "fungi:stroma",
        axSet: [0.75, 1.05, 1.35],
        azSet: [0.75, 1.05, 1.35],
        height: 0.22,
        breathe: 0.014,
        sway: 0.01,
        bands: [0, 1, 2, 3, 4, 5],
        spine(p, pl) {
          pl.anchorColor = black;
          p.spine("stroma", (node) => {
            // a piece of dead wood, wide and low, so the cushion reads as
            // welded to a branch rather than as a toadstool on a stalk
            p.add(node, xf(tubeGeo(0.3, 0.29, 0.24, 13)), { color: wood, colorFn: grad(shade(wood, 0.1), shade(wood, -0.28), 0, 0.24) });
            p.add(node, xf(capGeo(0.3, 0.78, 15, 6, "dome"), { at: [0, 0.23, 0] }), { color: black, colorFn: grad(shade(black, 0.35), black, 0.3, 1) });
            addFace(p, node, { at: [0, 0.62, 0.24], r: 0.075, tri: p.budget * 8 });
          });
        },
        slot(p, pl, s) {
          const { node, band, a } = s;
          const t = (band + 0.5) / 6;
          const r = reachOf(pl, a, 0.85 * (1 - 0.5 * t));
          const rr = r * (0.4 + pl.u(`cr${s.g}`) * 0.3);
          for (const sgn of [1, -1]) {
            p.add(node, xf(sphereGeo(11, 6), { sx: rr, sy: rr * 0.8, sz: rr, at: [Math.cos(a) * r * 0.55 * sgn, 0, Math.sin(a) * r * 0.55 * sgn] }),
              { color: s.g % 2 ? black : mix(black, capDark, 0.4), colorFn: grad(shade(black, 0.25), black, -rr, rr) });
          }
        },
      });
      return;
    }
    /* A coral fungus is an UPRIGHT branched candelabra. All seven were a
       horizontal starburst of thin spikes lying flat on the ground. */
    grow(k, col, {
      salt: "fungi:coral",
      axSet: [0.35, 0.6, 0.85],
      azSet: [0.35, 0.6, 0.85],
      height: 0.4,
      breathe: 0.024,
      sway: 0.04,
      bands: [0, 1, 2, 3, 4, 5],
      spine(p, pl) {
        pl.anchorColor = capDark;
        p.spine("trunk", (node) => {
          p.add(node, xf(tubeGeo(0.05, 0.03, 0.3, 11)), { color: shade(capCol, -0.12) });
          const branch = [];
          for (let i = 0; i < 3; i += 1) {
            const a = i * 2.399 + pl.u("b0") * TAU;
            const lean = 0.16 + 0.1 * (i % 2);
            branch.push(xf(tubeGeo(0.026, 0.012, 0.5 + 0.18 * (i % 3), 9), {
              rz: -Math.cos(a) * lean, rx: Math.sin(a) * lean, at: [Math.cos(a) * 0.018, 0.28, Math.sin(a) * 0.018],
            }));
            branch.push(xf(tubeGeo(0.013, 0.006, 0.24, 8), {
              rz: -Math.cos(a) * (lean + 0.5), rx: Math.sin(a) * (lean + 0.5),
              at: [Math.cos(a) * 0.1, 0.72 + 0.1 * (i % 2), Math.sin(a) * 0.1],
            }));
          }
          p.add(node, mergeGeo(branch), { color: capCol, colorFn: grad(shade(capCol, 0.3), capDark, 0.2, 1) });
          addFace(p, node, { at: [0, 0.16, 0.042], r: 0.038, tri: p.budget * 8 });
        });
      },
      slot(p, pl, s) {
        const { node, a } = s;
        const h = 0.2 + pl.u(`ch${s.g}`) * 0.22;
        const lean = 0.14 + pl.u(`cl${s.g}`) * 0.3;   // from VERTICAL, not from flat
        const arm = [];
        for (const sgn of [1, -1]) {
          const aa = a + (sgn > 0 ? 0 : Math.PI);
          arm.push(xf(tubeGeo(0.014, 0.007, h, 9), { rz: -Math.cos(aa) * lean, rx: Math.sin(aa) * lean, at: [Math.cos(aa) * 0.012, 0, Math.sin(aa) * 0.012] }));
          // the fork: a coral is a candelabra, so every arm splits
          for (const f of [1, -1]) {
            arm.push(xf(tubeGeo(0.008, 0.004, h * 0.5, 8), {
              rz: -Math.cos(aa) * (lean + f * 0.45), rx: Math.sin(aa) * (lean + f * 0.45),
              at: [Math.cos(aa) * (0.012 + h * Math.sin(lean)), h * Math.cos(lean), Math.sin(aa) * (0.012 + h * Math.sin(lean))],
            }));
          }
        }
        p.add(node, mergeGeo(arm), { color: s.g % 2 ? capCol : capDark, colorFn: grad(shade(capCol, 0.32), capDark, 0, h) });
      },
    });
    return;
  }

  if (kind === "birdsnest") {
    grow(k, col, {
      salt: "fungi:nest",
      height: 0.18,
      breathe: 0.03,
      bands: [0, 1, 2, 3, 4, 5],
      spine(p, pl) {
        p.spine("cup0", (node) => {
          p.add(node, xf(capGeo(0.09, 0.9, 14, 5, "funnel")), { color: capCol, colorFn: capGrad });
          for (let i = 0; i < 3; i += 1) {
            const a = (i / 3) * TAU;
            p.add(node, xf(sphereGeo(10, 5), { sx: 0.028, sy: 0.016, sz: 0.028, at: [Math.cos(a) * 0.032, 0.82, Math.sin(a) * 0.032] }), { color: hex("#f6e8c8") });
          }
          addFace(p, node, { at: [0, 0.42, 0.06], r: 0.04 });
        });
      },
      slot(p, pl, s) {
        const { node, a } = s;
        const r = 0.05 + pl.u(`nr${s.g}`) * 0.05;
        for (const sgn of [1]) {
          addCap(p, node, { r, h: r * 1.1, shape: "funnel", tri: p.budget, at: [Math.cos(a) * r * 1.2 * sgn, 0, Math.sin(a) * r * 1.2 * sgn], color: s.g % 2 ? capCol : capDark, colorFn: capGrad });
          p.add(node, xf(discGeo(r * 0.28, r * 0.16, 6), { at: [Math.cos(a) * r * 1.2 * sgn, r * 0.9, Math.sin(a) * r * 1.2 * sgn] }), { color: hex("#f6e8c8") });
        }
      },
    });
    return;
  }

  if (kind === "earthstar") {
    /* An earthstar is a SPORE SAC sitting in the middle of a star of thick
       recurved rays. Geastrum shipped with neither readable: the rays were
       thin blades crushed flat by the band clamp and the sac was buried. */
    const rayCol = mix(capDark, hex("#8a7a62"), 0.5);
    grow(k, col, {
      salt: "fungi:star",
      axSet: [1.2, 1.6, 2.0],
      azSet: [1.2, 1.6, 2.0],
      height: 0.24,
      breathe: 0.026,
      bands: [0, 1, 2, 3, 4, 5],
      spine(p, pl) {
        pl.anchorColor = rayCol;
        p.spine("sac", (node) => {
          const ray = [];
          for (let i = 0; i < 6; i += 1) {
            const a = i * (TAU / 6) + pl.u("r0") * TAU;
            ray.push(xf(bladeGeo({ len: 0.6, wid: 0.3, thick: 0.075, shape: "lanceolate", rows: 4, ring: 5, bend: -0.16 }),
              { rx: 0.55, ry: a, at: [Math.cos(a) * 0.1, 0.16, Math.sin(a) * 0.1] }));
          }
          p.add(node, mergeGeo(ray), { color: rayCol, colorFn: grad(shade(rayCol, 0.2), shade(rayCol, -0.2), 0, 0.3) });
          p.add(node, xf(sphereGeo(13, 7), { sx: 0.2, sy: 0.21, sz: 0.2, at: [0, 0.42, 0] }), { color: capCol, colorFn: capGrad });
          p.add(node, xf(coneGeo(0.05, 0.28, 10), { at: [0, 0.56, 0] }), { color: capDark });
          addFace(p, node, { at: [0, 0.45, 0.19], r: 0.07, tri: p.budget * 8 });
        });
      },
      slot(p, pl, s) {
        const { node, a } = s;
        const l = 0.2 + pl.u(`sl${s.g}`) * 0.16;
        for (const sgn of [1, -1]) {
          p.add(node, xf(bladeGeo({ len: l, wid: l * 0.55, thick: l * 0.22, shape: "lanceolate", rows: 4, ring: 5, bend: -l * 0.3 }), {
            rx: 0.45 + pl.u(`sa${s.g}`) * 0.6, ry: a + (sgn > 0 ? 0 : Math.PI), at: [Math.cos(a) * 0.05 * sgn, 0, Math.sin(a) * 0.05 * sgn],
          }), { color: s.g % 2 ? rayCol : shade(rayCol, -0.18) });
        }
      },
    });
    return;
  }

  if (kind === "puffball" && STINKHORN_GENUS.has(g)) {
    /* A stinkhorn: a tall spongy white stalk out of a volva, with a dark
       conical slimy cap. It had been shipping as a puffball, which is a ball. */
    const spongy = mix(paper, hex("#e8dcc0"), 0.4);
    grow(k, col, {
      salt: "fungi:stinkhorn",
      axSet: [0.3, 0.5, 0.7],
      azSet: [0.3, 0.5, 0.7],
      height: 0.5,
      breathe: 0.02,
      sway: 0.02,
      bands: [0, 1, 2, 3, 4, 5],
      spine(p, pl) {
        pl.anchorColor = spongy;
        p.spine("stalk", (node) => {
          p.add(node, xf(tubeGeo(0.062, 0.05, 0.72, 13, 0.008)), { color: spongy, colorFn: grad(paper, shade(spongy, -0.18), 0, 0.72) });
          // the pitted spongy surface
          for (let i = 0; i < 10; i += 1) {
            const a = i * 2.399;
            const y = 0.14 + (i / 10) * 0.5;
            p.add(node, xf(sphereGeo(8, 4), { s: 0.016, at: [Math.cos(a) * 0.056, y, Math.sin(a) * 0.056] }), { color: shade(spongy, -0.16) });
          }
          p.add(node, xf(capGeo(0.085, 0.3, 13, 5, "cone"), { at: [0, 0.7, 0] }), { color: mix(capDark, ink, 0.45) });
          p.add(node, xf(sphereGeo(12, 6), { sx: 0.085, sy: 0.06, sz: 0.085, at: [0, 0.04, 0] }), { color: shade(spongy, -0.1) });
          addFace(p, node, { at: [0, 0.36, 0.055], r: 0.05, tri: p.budget * 8 });
        });
      },
      slot(p, pl, s) {
        const { node, band, a } = s;
        if (band <= 1) {
          addTuft(p, node, { tri: p.budget, at: [0, 0, 0], r: 0.05, n: 3, color: shade(spongy, -0.14), color2: capDark, squash: 0.6 });
          return;
        }
        const r = reachOf(pl, a, 0.6);
        for (const sgn of [1, -1]) {
          p.add(node, xf(sphereGeo(9, 5), { sx: 0.022, sy: 0.03, sz: 0.022, at: [Math.cos(a) * r * sgn, 0, Math.sin(a) * r * sgn] }), { color: shade(spongy, -0.12) });
        }
      },
    });
    return;
  }

  if (kind === "puffball" || kind === "jelly") {
    const jelly = kind === "jelly";
    const ear = jelly && g === "auricularia";
    const frilly = jelly && (g === "tremella" || g === "dacryopinax" || g === "phaeotremella");
    grow(k, col, {
      salt: `fungi:${kind}${ear ? ":ear" : frilly ? ":frill" : ""}`,
      height: jelly ? 0.26 : 0.3,
      breathe: 0.03,
      bands: [0, 1, 2, 3, 4, 5],
      spine(p, pl) {
        pl.ear = ear; pl.frilly = frilly;
        p.spine("body", (node) => {
          if (ear) {
            // the ear/cup concavity is the whole of Auricularia
            p.add(node, xf(capGeo(0.24, 0.62, 14, 6, "funnel"), { rx: -0.5, at: [0, 0.16, 0] }), { color: capCol, colorFn: capGrad });
            p.add(node, xf(capGeo(0.19, 0.44, 13, 5, "funnel"), { rx: -0.5, at: [0, 0.24, 0.02] }), { color: shade(capCol, -0.22) });
            p.add(node, xf(tubeGeo(0.03, 0.05, 0.2, 10)), { color: shade(capCol, -0.3) });
            addFace(p, node, { at: [0, 0.5, 0.16], r: 0.062, tri: p.budget * 8 });
          } else if (frilly) {
            const lobe = [];
            for (let i = 0; i < 7; i += 1) {
              const a = i * 2.399 + pl.u("f0") * TAU;
              lobe.push(xf(ruffleGeo({ len: 0.42 - (i % 3) * 0.05, wid: 0.3, thick: 0.02, waves: 3, rows: 5, ring: 4 }),
                { rx: -1.1 + (i % 3) * 0.34, ry: a, at: [Math.cos(a) * 0.05, 0.16 + (i % 3) * 0.14, Math.sin(a) * 0.05] }));
            }
            p.add(node, mergeGeo(lobe), { color: capCol, colorFn: grad(shade(capCol, 0.25), capDark, 0.1, 0.9) });
            p.add(node, xf(sphereGeo(11, 5), { sx: 0.07, sy: 0.05, sz: 0.07, at: [0, 0.06, 0] }), { color: capDark });
            addFace(p, node, { at: [0, 0.2, 0.16], r: 0.06, tri: p.budget * 8 });
          } else if (jelly) {
            p.add(node, xf(sphereGeo(14, 6), { sx: 0.15, sy: 0.09, sz: 0.12, at: [0, 0.35, 0] }), { color: capCol, colorFn: capGrad });
            p.add(node, xf(sphereGeo(12, 6), { sx: 0.09, sy: 0.07, sz: 0.08, at: [0, 0.66, 0.03] }), { color: shade(capCol, 0.15) });
            addFace(p, node, { at: [0, 0.4, 0.1], r: 0.05 });
          } else {
            p.add(node, xf(tubeGeo(0.045, 0.06, 0.35, 12)), { color: shade(stalkCol, -0.05) });
            p.add(node, xf(sphereGeo(14, 6), { sx: 0.12, sy: 0.11, sz: 0.12, at: [0, 0.55, 0] }), { color: capCol, colorFn: capGrad });
            addFace(p, node, { at: [0, 0.55, 0.11], r: 0.05 });
          }
        });
      },
      slot(p, pl, s) {
        const { node, band, a } = s;
        const r = 0.03 + pl.u(`wr${s.g}`) * 0.04;
        if (band <= 1) {
          addTuft(p, node, { tri: p.budget, at: [0, 0, 0], r, n: 3, color: shade(capCol, -0.2), color2: capDark, squash: 0.7 });
          return;
        }
        if (pl.frilly) {
          const rr = reachOf(pl, a, 0.7);
          const lobe = [];
          for (const sgn of [1, -1]) {
            lobe.push(xf(ruffleGeo({ len: rr * 0.8, wid: rr * 0.7, thick: 0.016, waves: 3, rows: 4, ring: 4 }),
              { rx: -0.9 + pl.u(`fr${s.g}`) * 0.8, ry: a + (sgn > 0 ? 0 : Math.PI), at: [Math.cos(a) * 0.03 * sgn, 0, Math.sin(a) * 0.03 * sgn] }));
          }
          p.add(node, mergeGeo(lobe), { color: s.g % 2 ? capCol : shade(capCol, 0.2), colorFn: capGrad });
          return;
        }
        if (pl.ear) {
          const rr = reachOf(pl, a, 0.55);
          for (const sgn of [1, -1]) {
            p.add(node, xf(capGeo(rr * 0.6, rr * 1.1, 11, 4, "funnel"), { rx: -0.6, ry: a + (sgn > 0 ? 0 : Math.PI), at: [Math.cos(a) * rr * 0.4 * sgn, 0, Math.sin(a) * rr * 0.4 * sgn] }),
              { color: s.g % 2 ? capCol : capDark, colorFn: capGrad });
          }
          return;
        }
        for (const sgn of [1]) {
          addLump(p, node, { rx: r * 0.6, ry: r * 0.6, rz: r * 0.6, yaw: a, tri: p.budget, at: [Math.cos(a) * 0.08 * sgn, 0, Math.sin(a) * 0.08 * sgn], color: s.g % 2 ? shade(capCol, 0.25) : capDark });
        }
      },
    });
    return;
  }

  // classic gilled mushroom
  grow(k, col, {
    salt: "fungi:cap",
    height: 0.32,
    breathe: 0.03,
    sway: 0.04,
    bands: [0, 1, 2, 3, 4, 5],
    spine(p, pl) {
      p.spine("stalk", (node) => {
        const shape = CAP_SHAPE[pl.H("cs") % CAP_SHAPE.length];
        const stalkH = 0.45 + pl.u("sh") * 0.3;
        const sr = 0.026 + pl.u("sr") * 0.026;
        const capR = 0.09 + pl.u("cr") * 0.09;
        p.add(node, xf(tubeGeo(sr * 1.3, sr, stalkH, 12, sr * 0.15)), { color: stalkCol, colorFn: grad(shade(stalkCol, 0.1), shade(stalkCol, -0.18), 0, stalkH) });
        if (pl.u("ring") > 0.5) {
          p.add(node, xf(discGeo(sr * 2, sr * 0.32, 9), { at: [0, stalkH * 0.72, 0] }), { color: shade(stalkCol, -0.12) });
        }
        p.add(node, xf(capGeo(capR, 1 - stalkH, 14, 6, shape), { at: [0, stalkH, 0] }), { color: capCol, colorFn: capGrad });
        // gills
        p.add(node, xf(discGeo(capR * 0.85, capR * 0.08, 11), { at: [0, stalkH + 0.008, 0] }), { color: shade(paper, -0.08) });
        addFace(p, node, { at: [0, stalkH * 0.5, sr * 1.05], r: Math.max(0.03, sr * 1.5) });
      });
    },
    slot(p, pl, s) {
      const { node, band, a, top } = s;
      if (band >= top - 1 && (opt.spots || pl.u("sp") > 0.55)) {
        for (const sgn of [1]) {
          p.add(node, xf(discGeo(0.024, 0.008, 7), { at: [Math.cos(a) * 0.07 * sgn, 0, Math.sin(a) * 0.07 * sgn] }), { color: paper });
        }
        return;
      }
      if (band <= 1) {
        // a sibling button mushroom sprouting alongside
        const r = 0.04 + pl.u(`br${s.g}`) * 0.04;
        for (const sgn of [1]) {
          p.add(node, xf(tubeGeo(r * 0.25, r * 0.2, r * 1.2, 7), { at: [Math.cos(a) * r * 1.6 * sgn, -r * 0.5, Math.sin(a) * r * 1.6 * sgn] }), { color: stalkCol });
          /* A real little dome. Under 96 triangles addCap falls back to a thick
             lens, and a lens on its side is a flat red wedge sticking out of
             the stalk, not a button mushroom. */
          addCap(p, node, { r: r * 0.7, h: r * 0.6, shape: "dome", tri: Math.max(110, p.budget), at: [Math.cos(a) * r * 1.6 * sgn, r * 0.7, Math.sin(a) * r * 1.6 * sgn], color: s.g % 2 ? capCol : capDark });
        }
        return;
      }
      for (const sgn of [1]) {
        p.add(node, xf(bladeGeo({ len: 0.07, wid: 0.03, thick: 0.012, shape: "linear", rows: 4, ring: 4 }), { rx: -0.4, ry: a + (sgn > 0 ? 0 : Math.PI) }), { color: shade(stalkCol, -0.14) });
      }
    },
  });
}

export const flora = {
  tree, papaya, palm, bananaKind, pandanus, cycad, shrub, herb, orchid,
  grass, fern, moss, cactus, succulent, rosetteBlades, aroid, vine,
  waterPlant, mushroom,
};

/**
 * Test seams. `_plan` lets a script replay the lattice for the whole species
 * list without building a mesh — that is how the zero-collision seed above was
 * found, and how it would be re-found if the list changes. `_geo` lets the
 * primitives be measured for creases in isolation.
 */
export { plan as _plan };
export const _geo = { loft, lathe, sphereGeo, tubeGeo, coneGeo, capGeo, bladeGeo, arcTubeGeo, discGeo, xf, clean, orient };
