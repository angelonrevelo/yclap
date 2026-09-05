/**
 * Geometry audit for the species pack — the verifier behind the cleanup.
 *
 * The three complaints this exists to make falsifiable:
 *
 *   1. DISCONNECTED   "joints, body parts, sticks not connected". A model is
 *                     a set of mesh instances placed by a scene graph. If one
 *                     of them floats with a visible gap to every other, the
 *                     model reads as broken. Measured as: build the world-space
 *                     bounds of every mesh instance, join two parts when their
 *                     boxes overlap or nearly touch, then require the whole
 *                     model to be ONE connected component.
 *
 *   2. SAMEY          "too similar to each other like the trees and flowers".
 *                     Measured as: a shape signature per model, then the
 *                     nearest-neighbour distance inside each archetype family.
 *                     Two models whose signatures sit under the floor are
 *                     near-duplicates of one another.
 *
 *   3. COARSE         "make the mesh much much better, and smoothen out".
 *                     Measured as: triangle budget, degenerate (zero-area)
 *                     triangles, non-unit normals, and how faceted the surface
 *                     is — the share of adjacent face pairs meeting at a hard
 *                     crease that a smooth surface should not have.
 *
 * Reads the shipped .glb bytes, never the generator's intent, so it cannot be
 * satisfied by changing a comment. Exits non-zero when any gate fails.
 *
 *   node script/species-model/audit.mjs            # gate, exit code
 *   node script/species-model/audit.mjs --report   # full breakdown
 *   node script/species-model/audit.mjs --json out.json
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const MODEL_DIR = join(here, "..", "..", "public", "model");
const SPECIES_DIR = join(MODEL_DIR, "species");

/* ── gates ────────────────────────────────────────────────────────────────
 * Every number here is a claim about the pack that a run can refute. They are
 * deliberately expressed as counts of BAD models rather than averages: an
 * average hides a hundred broken models behind a thousand fine ones.
 */
export const GATE = {
  /* A part is joined to another when their world boxes overlap, or sit within
     this fraction of the model's own radius. Slack, not zero: a beak that
     touches a head at one vertex still reads as attached. */
  touch_slack: 0.06,
  /* No model may ship a floating island. This is the headline complaint. */
  max_disconnected_model: 0,
  /* Zero-area triangles are pure waste and shade black on some drivers. */
  max_degenerate_model: 0,
  /* Normals must be unit length or lighting is wrong. */
  max_bad_normal_model: 0,
  /* Distinctness floor inside an archetype family, in signature units. */
  min_neighbour_distance: 0.12,
  /* How many models may sit under that floor. */
  max_duplicate_model: 0,
  /* A smooth-shaded surface should not be all hard creases. Share of adjacent
     face pairs whose normals disagree by more than 40 degrees. */
  max_hard_edge_ratio: 0.55,
  max_faceted_model: 0,
  /* Floor on geometric richness, so "smoother" cannot be met by deleting
     detail. Trees and flowers were the specific complaint. */
  min_triangle: 120,
  max_low_poly_model: 0,
  /*
   * "Reads as a tree." The first pass of this audit had no aesthetic gate, so
   * the distinctness metric could be satisfied by flattening a tree into a
   * wide lens on a stub — which is exactly what happened to Narra, Dao, Rain
   * tree and Balete: 2.9x wider than tall, with the widest part down at the
   * base. Goodhart, caught by eye and then made measurable.
   *
   * An upright plant must be no more than this many times wider than tall...
   */
  max_upright_spread: 1.6,
  /* ...and must be TOP-heavy: the widest thing in the bottom third, over the
     widest thing in the top half. A trunk is narrower than its own crown. */
  max_trunk_over_canopy: 0.85,
  max_topheavy_model: 0,
  /*
   * The face. Reported by eye: eyes floating off the trunk, and eyes drawn so
   * thin they vanish edge-on.
   *
   * Neither is visible to any gate above, because the face is BAKED INTO its
   * host part's mesh rather than being a part of its own — so the connectivity
   * check, which works on parts, cannot see it at all. It is found instead by
   * colour: the kit draws eye whites, ink pupils and blush in three exact
   * values, so those vertices can be separated from the body and measured.
   *
   * gap: distance from the face to the nearest NON-face vertex, over model
   * size. A face sitting on a surface reads ~0; the pack's median is 0.008.
   */
  max_face_gap: 0.03,
  /* thickness: smallest face extent over largest. A razor plane reads ~0. */
  min_face_thickness: 0.08,
  max_floating_face_model: 0,
};

/** Eye white, ink pupil, blush — the three exact colours the kit paints a face with. */
export const FACE_RGB = new Set(["249,249,249", "31,32,34", "240,160,168"]);

/** Archetypes that are supposed to stand up on a trunk or stem. */
export const UPRIGHT = new Set([
  "tree", "tree-balete", "palm", "shrub", "bananaKind", "papaya", "cycad", "pandanus",
]);

/* ── glb parsing ─────────────────────────────────────────────────────────── */

export function parseGlb(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("not a glb");
  let off = 12, json = null, bin = null;
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(buf.subarray(off + 8, off + 8 + len)));
    else if (type === 0x004e4942) bin = buf.subarray(off + 8, off + 8 + len);
    off += 8 + len;
  }
  return { json, bin };
}

const COMP = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array, 5120: Int8Array };

function accessor(json, bin, i) {
  const a = json.accessors[i];
  const bv = json.bufferViews[a.bufferView];
  const Ctor = COMP[a.componentType];
  const start = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const n = a.count * { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  /* Copy rather than subarray-view: glb chunk offsets are not guaranteed to be
     aligned to the component size, and a misaligned TypedArray view throws. */
  const bytes = bin.subarray(start, start + n * Ctor.BYTES_PER_ELEMENT);
  const copy = new Uint8Array(bytes);
  return new Ctor(copy.buffer, 0, n);
}

/* ── scene graph → world-space parts ─────────────────────────────────────── */

function quatMat(t, q, s) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0], (xz - wy) * s[0], 0,
    (xy - wz) * s[1], (1 - (xx + zz)) * s[1], (yz + wx) * s[1], 0,
    (xz + wy) * s[2], (yz - wx) * s[2], (1 - (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
function matMul(a, b) {
  const o = new Array(16).fill(0);
  for (let i = 0; i < 4; i += 1) for (let j = 0; j < 4; j += 1) {
    o[i * 4 + j] = a[j] * b[i * 4] + a[4 + j] * b[i * 4 + 1] + a[8 + j] * b[i * 4 + 2] + a[12 + j] * b[i * 4 + 3];
  }
  return o;
}
const xform = (m, p) => [
  m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
  m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
  m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
];

/** Every mesh instance, with its world-space AABB and the node that placed it. */
export function worldPart(json, bin) {
  const part = [];
  const walk = (idx, parent) => {
    const n = json.nodes[idx];
    const local = quatMat(n.translation ?? [0, 0, 0], n.rotation ?? [0, 0, 0, 1], n.scale ?? [1, 1, 1]);
    const world = parent ? matMul(parent, local) : local;
    if (n.mesh !== undefined) {
      const prim = json.meshes[n.mesh].primitives[0];
      const pos = accessor(json, bin, prim.attributes.POSITION);
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      for (let v = 0; v < pos.length; v += 3) {
        const w = xform(world, [pos[v], pos[v + 1], pos[v + 2]]);
        for (let k = 0; k < 3; k += 1) { if (w[k] < lo[k]) lo[k] = w[k]; if (w[k] > hi[k]) hi[k] = w[k]; }
      }
      part.push({ node: idx, name: n.name ?? `node${idx}`, mesh: n.mesh, lo, hi, matrix: world });
    }
    for (const c of n.children ?? []) walk(c, world);
  };
  for (const r of json.scenes[0].nodes) walk(r, null);
  return part;
}

/* ── 1. connectivity ─────────────────────────────────────────────────────── */

function boxGap(a, b) {
  /* Zero when the boxes overlap; otherwise the shortest distance between them. */
  let d2 = 0;
  for (let k = 0; k < 3; k += 1) {
    const gap = Math.max(a.lo[k] - b.hi[k], b.lo[k] - a.hi[k], 0);
    d2 += gap * gap;
  }
  return Math.sqrt(d2);
}

export function connectivity(part, slack) {
  if (part.length <= 1) return { component: 1, floating: [] };
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of part) for (let k = 0; k < 3; k += 1) {
    if (p.lo[k] < lo[k]) lo[k] = p.lo[k];
    if (p.hi[k] > hi[k]) hi[k] = p.hi[k];
  }
  const radius = Math.max(1e-6, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2);
  const tol = radius * slack;

  const parent = part.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  for (let i = 0; i < part.length; i += 1) {
    for (let j = i + 1; j < part.length; j += 1) {
      if (boxGap(part[i], part[j]) <= tol) union(i, j);
    }
  }
  const group = new Map();
  for (let i = 0; i < part.length; i += 1) {
    const r = find(i);
    if (!group.has(r)) group.set(r, []);
    group.get(r).push(i);
  }
  const comp = [...group.values()].sort((a, b) => b.length - a.length);
  const floating = comp.slice(1).flat().map((i) => part[i].name);
  return { component: comp.length, floating, radius };
}

/* ── 2. mesh quality ─────────────────────────────────────────────────────── */

export function meshQuality(json, bin) {
  let tri = 0, degenerate = 0, badNormal = 0, hard = 0, adjacent = 0;
  for (const mesh of json.meshes) {
    const prim = mesh.primitives[0];
    const pos = accessor(json, bin, prim.attributes.POSITION);
    const nrm = prim.attributes.NORMAL !== undefined ? accessor(json, bin, prim.attributes.NORMAL) : null;
    const idx = accessor(json, bin, prim.indices);

    if (nrm) {
      /* Normals ship as normalized signed bytes (componentType 5120), not
         floats, so they decode as v/127 clamped at -1. Reading the raw int8
         makes every normal look 127 units long — which is exactly the false
         positive this comment exists to stop coming back. */
      const nAcc = json.accessors[prim.attributes.NORMAL];
      const scale = nAcc.normalized
        ? { 5120: 127, 5121: 255, 5122: 32767, 5123: 65535 }[nAcc.componentType] ?? 1
        : 1;
      for (let v = 0; v < nrm.length; v += 3) {
        const l = Math.hypot(nrm[v] / scale, nrm[v + 1] / scale, nrm[v + 2] / scale);
        if (Math.abs(l - 1) > 0.06) badNormal += 1;
      }
    }

    /* Face normals, and an edge map to find adjacent face pairs. Vertices are
       keyed by rounded position so a flat-shaded mesh (which splits verts per
       face) still reports its true topology. */
    const key = new Map();
    const vid = new Uint32Array(pos.length / 3);
    for (let v = 0; v < pos.length / 3; v += 1) {
      const k = `${pos[v * 3].toFixed(4)},${pos[v * 3 + 1].toFixed(4)},${pos[v * 3 + 2].toFixed(4)}`;
      if (!key.has(k)) key.set(k, key.size);
      vid[v] = key.get(k);
    }
    const faceNrm = [];
    const edge = new Map();
    for (let f = 0; f < idx.length; f += 3) {
      const a = idx[f], b = idx[f + 1], c = idx[f + 2];
      const p = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
      const [ax, ay, az] = p(a), [bx, by, bz] = p(b), [cx, cy, cz] = p(c);
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const len = Math.hypot(nx, ny, nz);
      tri += 1;
      if (len < 1e-9) { degenerate += 1; faceNrm.push(null); }
      else faceNrm.push([nx / len, ny / len, nz / len]);
      const fi = faceNrm.length - 1;
      for (const [s, t] of [[a, b], [b, c], [c, a]]) {
        const k = vid[s] < vid[t] ? `${vid[s]}_${vid[t]}` : `${vid[t]}_${vid[s]}`;
        if (!edge.has(k)) edge.set(k, []);
        edge.get(k).push(fi);
      }
    }
    for (const share of edge.values()) {
      if (share.length !== 2) continue;
      const [f0, f1] = share;
      if (!faceNrm[f0] || !faceNrm[f1]) continue;
      adjacent += 1;
      const d = faceNrm[f0][0] * faceNrm[f1][0] + faceNrm[f0][1] * faceNrm[f1][1] + faceNrm[f0][2] * faceNrm[f1][2];
      if (Math.acos(Math.max(-1, Math.min(1, d))) > (40 * Math.PI) / 180) hard += 1;
    }
  }
  return {
    tri, degenerate, badNormal,
    hard_edge_ratio: adjacent ? hard / adjacent : 0,
  };
}

/* ── silhouette ───────────────────────────────────────────────────────────
 *
 * Two numbers that together say "this stands up like a plant": how wide it is
 * against its height, and whether its mass is carried above its base.
 */
export function silhouette(part) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of part) for (let k = 0; k < 3; k += 1) {
    if (p.lo[k] < lo[k]) lo[k] = p.lo[k];
    if (p.hi[k] > hi[k]) hi[k] = p.hi[k];
  }
  const width = Math.max(hi[0] - lo[0], hi[2] - lo[2]);
  const height = Math.max(1e-6, hi[1] - lo[1]);
  const base = lo[1] + height * 0.30, crown = lo[1] + height * 0.5;
  let baseWide = 0, crownWide = 0;
  for (const p of part) {
    const cy = (p.lo[1] + p.hi[1]) / 2;
    const w = Math.max(p.hi[0] - p.lo[0], p.hi[2] - p.lo[2]);
    if (cy < base) baseWide = Math.max(baseWide, w);
    if (cy > crown) crownWide = Math.max(crownWide, w);
  }
  return {
    spread: width / height,
    /* No crown at all is maximally bottom-heavy, not "fine". */
    trunk_over_canopy: crownWide > 1e-6 ? baseWide / crownWide : Infinity,
  };
}

/* ── face attachment ──────────────────────────────────────────────────────
 *
 * Separates face vertices from body vertices by colour, then answers two
 * questions the part-level gates cannot: is the face touching anything, and
 * does it have any depth?
 */
export function faceAttachment(json, bin, nodeList) {
  const face = [], body = [];
  for (const { mesh, matrix } of nodeList) {
    const prim = json.meshes[mesh].primitives[0];
    const pos = accessor(json, bin, prim.attributes.POSITION);
    const hasCol = prim.attributes.COLOR_0 !== undefined;
    const col = hasCol ? accessor(json, bin, prim.attributes.COLOR_0) : null;
    const ca = hasCol ? json.accessors[prim.attributes.COLOR_0] : null;
    const scale = hasCol
      ? (ca.componentType === 5126 ? 1 : ca.componentType === 5121 ? 255 : 65535)
      : 1;
    for (let v = 0; v < pos.length; v += 3) {
      const w = [
        matrix[0] * pos[v] + matrix[4] * pos[v + 1] + matrix[8] * pos[v + 2] + matrix[12],
        matrix[1] * pos[v] + matrix[5] * pos[v + 1] + matrix[9] * pos[v + 2] + matrix[13],
        matrix[2] * pos[v] + matrix[6] * pos[v + 1] + matrix[10] * pos[v + 2] + matrix[14],
      ];
      const isFace = hasCol &&
        FACE_RGB.has([0, 1, 2].map((j) => Math.round((col[v + j] / scale) * 255)).join(","));
      (isFace ? face : body).push(w);
    }
  }
  if (!face.length || !body.length) return null;

  const bound = (a) => {
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const p of a) for (let k = 0; k < 3; k += 1) {
      if (p[k] < lo[k]) lo[k] = p[k];
      if (p[k] > hi[k]) hi[k] = p[k];
    }
    return { lo, hi };
  };
  const fb = bound(face), all = bound([...face, ...body]);
  const fd = [fb.hi[0] - fb.lo[0], fb.hi[1] - fb.lo[1], fb.hi[2] - fb.lo[2]];
  const model = Math.max(1e-6, Math.hypot(all.hi[0] - all.lo[0], all.hi[1] - all.lo[1], all.hi[2] - all.lo[2]));

  /* Subsampled: exact nearest-neighbour over every pair is far too slow across
     1098 models, and a 4000-point sample of the body is plenty to tell a face
     resting on bark from one hanging in mid-air. */
  const step = Math.max(1, Math.floor(body.length / 4000));
  let near = Infinity;
  for (const f of face) {
    for (let i = 0; i < body.length; i += step) {
      const b = body[i];
      const d = (f[0] - b[0]) ** 2 + (f[1] - b[1]) ** 2 + (f[2] - b[2]) ** 2;
      if (d < near) near = d;
    }
  }
  return {
    face_gap: Math.sqrt(near) / model,
    face_thickness: Math.max(...fd) > 0 ? Math.min(...fd) / Math.max(...fd) : 0,
  };
}

/* ── 3. distinctness ─────────────────────────────────────────────────────── */

/**
 * A compact shape fingerprint. Deliberately geometric — part count, silhouette
 * proportions, how mass is distributed up the height, and the colour spread —
 * so two models built from the same recipe with a different tint still land on
 * top of each other, which is exactly the complaint.
 */
export function signature(json, bin, part) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of part) for (let k = 0; k < 3; k += 1) {
    if (p.lo[k] < lo[k]) lo[k] = p.lo[k];
    if (p.hi[k] > hi[k]) hi[k] = p.hi[k];
  }
  const size = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]].map((v) => (Number.isFinite(v) ? v : 0));
  const h = Math.max(1e-6, size[1]);

  /* Mass profile: share of parts whose centre falls in each of 6 height bands. */
  const band = new Array(6).fill(0);
  for (const p of part) {
    const cy = (p.lo[1] + p.hi[1]) / 2;
    const t = Math.min(5, Math.max(0, Math.floor(((cy - lo[1]) / h) * 6)));
    band[t] += 1;
  }
  const total = part.length || 1;

  /* Colour spread, from the vertex colours actually written into the file. */
  let cr = 0, cg = 0, cb = 0, cn = 0;
  for (const mesh of json.meshes) {
    const prim = mesh.primitives[0];
    if (prim.attributes.COLOR_0 === undefined) continue;
    const col = accessor(json, bin, prim.attributes.COLOR_0);
    const norm = col instanceof Float32Array ? 1 : 255;
    for (let v = 0; v < col.length; v += 3) {
      cr += col[v] / norm; cg += col[v + 1] / norm; cb += col[v + 2] / norm; cn += 1;
    }
  }
  cn = cn || 1;

  return [
    Math.min(1, part.length / 40),
    Math.min(1, size[0] / (h || 1) / 3),
    Math.min(1, size[2] / (h || 1) / 3),
    ...band.map((b) => b / total),
    cr / cn, cg / cn, cb / cn,
  ];
}

const sigDist = (a, b) => Math.hypot(...a.map((v, i) => v - b[i]));

/* ── run ─────────────────────────────────────────────────────────────────── */

function main() {
  const arg = process.argv.slice(2);
  const wantReport = arg.includes("--report");
  const jsonAt = arg.indexOf("--json");
  const manifest = JSON.parse(readFileSync(join(MODEL_DIR, "species-model.json"), "utf8"));
  const byFile = new Map(manifest.model.map((m) => [m.file.replace(/^species\//, ""), m]));

  const file = readdirSync(SPECIES_DIR).filter((f) => f.endsWith(".glb")).sort();
  const result = [];
  for (const f of file) {
    const { json, bin } = parseGlb(readFileSync(join(SPECIES_DIR, f)));
    const part = worldPart(json, bin);
    const conn = connectivity(part, GATE.touch_slack);
    const q = meshQuality(json, bin);
    const meta = byFile.get(f) ?? {};
    result.push({
      file: f,
      species_code: meta.species_code ?? f.replace(/\.glb$/, ""),
      archetype: meta.archetype ?? "unknown",
      part: part.length,
      component: conn.component,
      floating: conn.floating,
      ...q,
      ...silhouette(part),
      ...(faceAttachment(json, bin, part) ?? { face_gap: 0, face_thickness: 1 }),
      sig: signature(json, bin, part),
    });
  }

  /* Nearest neighbour inside each archetype family. */
  const family = new Map();
  for (const r of result) {
    if (!family.has(r.archetype)) family.set(r.archetype, []);
    family.get(r.archetype).push(r);
  }
  for (const [, row] of family) {
    for (const r of row) {
      let best = Infinity, who = null;
      for (const o of row) {
        if (o === r) continue;
        const d = sigDist(r.sig, o.sig);
        if (d < best) { best = d; who = o.species_code; }
      }
      r.nn = row.length > 1 ? best : Infinity;
      r.nn_of = who;
    }
  }

  const disconnected = result.filter((r) => r.component > 1);
  const degenerate = result.filter((r) => r.degenerate > 0);
  const badNormal = result.filter((r) => r.badNormal > 0);
  const duplicate = result.filter((r) => Number.isFinite(r.nn) && r.nn < GATE.min_neighbour_distance);
  const faceted = result.filter((r) => r.hard_edge_ratio > GATE.max_hard_edge_ratio);
  const lowPoly = result.filter((r) => r.tri < GATE.min_triangle);
  const floatingFace = result.filter(
    (r) => r.face_gap > GATE.max_face_gap || r.face_thickness < GATE.min_face_thickness,
  );
  const topheavy = result.filter(
    (r) => UPRIGHT.has(r.archetype) &&
      (r.spread > GATE.max_upright_spread || r.trunk_over_canopy > GATE.max_trunk_over_canopy),
  );

  const fail = [];
  const check = (label, got, cap) => {
    const ok = got <= cap;
    if (!ok) fail.push(`${label}: ${got} (cap ${cap})`);
    console.log(`${ok ? "ok  " : "FAIL"}  ${label.padEnd(26)} ${String(got).padStart(5)}  cap ${cap}`);
  };

  console.log(`\nspecies models audited: ${result.length}\n`);
  check("disconnected models", disconnected.length, GATE.max_disconnected_model);
  check("degenerate-triangle models", degenerate.length, GATE.max_degenerate_model);
  check("bad-normal models", badNormal.length, GATE.max_bad_normal_model);
  check("near-duplicate models", duplicate.length, GATE.max_duplicate_model);
  check("faceted models", faceted.length, GATE.max_faceted_model);
  check("under-detailed models", lowPoly.length, GATE.max_low_poly_model);
  check("wrong-silhouette models", topheavy.length, GATE.max_topheavy_model);
  check("floating/thin face models", floatingFace.length, GATE.max_floating_face_model);

  const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] ?? 0; };
  console.log(`\nmedian triangles ${med(result.map((r) => r.tri))} · median parts ${med(result.map((r) => r.part))}` +
    ` · median hard-edge ${med(result.map((r) => r.hard_edge_ratio)).toFixed(2)}` +
    ` · median nn ${med(result.filter((r) => Number.isFinite(r.nn)).map((r) => r.nn)).toFixed(3)}`);

  if (wantReport) {
    console.log("\n── worst archetypes by duplicate share ──");
    const rank = [...family.entries()].map(([k, row]) => {
      const dup = row.filter((r) => Number.isFinite(r.nn) && r.nn < GATE.min_neighbour_distance).length;
      return { k, n: row.length, dup, share: row.length ? dup / row.length : 0, medNn: med(row.filter((r) => Number.isFinite(r.nn)).map((r) => r.nn)) };
    }).filter((r) => r.n > 1).sort((a, b) => b.dup - a.dup).slice(0, 18);
    for (const r of rank) {
      console.log(`  ${r.k.padEnd(24)} n=${String(r.n).padStart(4)}  dup=${String(r.dup).padStart(4)} (${(r.share * 100).toFixed(0)}%)  medNN=${r.medNn.toFixed(3)}`);
    }
    console.log("\n── worst disconnected (part names in the floating island) ──");
    for (const r of disconnected.slice(0, 20)) {
      console.log(`  ${r.species_code.padEnd(30)} ${r.archetype.padEnd(18)} comp=${r.component} floating=${r.floating.slice(0, 6).join(",")}`);
    }
    const byArch = new Map();
    for (const r of disconnected) byArch.set(r.archetype, (byArch.get(r.archetype) ?? 0) + 1);
    console.log("\n── disconnected count by archetype ──");
    for (const [k, v] of [...byArch.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${k.padEnd(24)} ${v}`);
    }
  }

  if (jsonAt >= 0 && arg[jsonAt + 1]) {
    /* Infinity does not survive JSON — it becomes null, and `isFinite(null)`
       is true, so a naive consumer counts every single-member archetype as a
       duplicate. Emit the finite ones only and say so explicitly instead. */
    const clean = result.map((r) => ({
      ...r,
      nn: Number.isFinite(r.nn) ? r.nn : null,
      is_only_member: !Number.isFinite(r.nn),
    }));
    writeFileSync(arg[jsonAt + 1], JSON.stringify({ gate: GATE, result: clean }, null, 1));
    console.log(`\nwrote ${arg[jsonAt + 1]}`);
  }

  if (fail.length) {
    console.log(`\nFAILED ${fail.length} gate(s):\n  ${fail.join("\n  ")}\n`);
    process.exit(1);
  }
  console.log("\nall gates pass\n");
}

if (process.argv[1] && process.argv[1].endsWith("audit.mjs")) main();
