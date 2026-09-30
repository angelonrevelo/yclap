/**
 * Integrity audit for every .glb the app can ask for — the species pack in
 * `public/model/species-model.json` and the companion character's stage slots.
 *
 * `script/species-model/audit.mjs` judges how the models LOOK (floating parts,
 * near-duplicates, faceting). This one judges whether they are FILES a viewer
 * can load at all, and whether the manifest and the disk agree:
 *
 *   missing       a manifest row or character slot names a file that is not there
 *   broken        not glTF 2.0 binary: bad magic/version, length lies, JSON chunk
 *                 unparseable, a bufferView or accessor reaching past its buffer
 *   empty         no mesh, or a scene with nothing in it
 *   oversize      over 1.5 MB — a find card opens it over campus mobile data
 *   degenerate    zero-size bounds on any axis, or no triangles
 *   ungrounded    the model's lowest point is far from y = 0, so it floats over
 *                 or sinks into the ground plane `<model-viewer>` puts it on
 *   size_mismatch the manifest's `bytes` disagrees with the file on disk
 *   dangling_track an animation channel targets a node that is missing or not
 *                 in the default scene — three.js logs "PropertyBinding: No
 *                 target node found" and that part of the idle never plays
 *   orphan        a .glb under public/model/ that nothing references
 *   disconnected  a part's surface does not touch the part it hangs from (or the
 *                 model is not one piece) at rest or at any keyframe of any clip
 *                 — see "connectivity" below
 *
 * Reads the shipped bytes only. The file checks are header-level (every chunk,
 * every accessor range, bounds from accessor min/max through the node
 * transforms) and run over 1,100 files in about a second; the connectivity
 * check poses every model at every keyframe and takes about 90 seconds, so
 * `npm test` runs it on a fixed sample (test/model-audit.test.ts) and the CLI
 * runs it on everything.
 *
 *   node script/audit-model.mjs            # summary + every flag, exit 1 on any
 *   node script/audit-model.mjs --fast     # skip the connectivity pass
 *   node script/audit-model.mjs --json     # full per-file report on stdout
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const MODEL_DIR = join(here, "..", "public", "model");

/** The `CHARACTER_MODEL_SLOT` files (src/character-model.tsx), the full-tree
 *  alias, and the proposed map hiker (`?avatar=hiker`, src/hiker-avatar.tsx). */
export const CHARACTER_FILE = [
  "character.glb",
  "character-egg.glb",
  "character-seedling.glb",
  "character-sapling.glb",
  "character-tree.glb",
  "character-hiker.glb",
  /* Agila and the trainer (`script/art/build-eagle-glb.mjs`) — what the app now renders. */
  "agila-egg.glb",
  "agila-hatchling.glb",
  "agila-eaglet.glb",
  "agila-eagle.glb",
  "agila-trainer.glb",
];

export const LIMIT = {
  /** Anything bigger than this is a download a phone notices. */
  max_byte: 1.5 * 1024 * 1024,
  /** Lowest vertex may sit this far from the ground plane, as a share of height. */
  max_ground_gap: 0.08,
};

/**
 * Archetypes posed in flight. A butterfly hovering over its shadow is the
 * pose, not a bug — these may float, but may never sink through the ground.
 */
export const FLYER = new Set([
  /* Agila full-grown hovers — `agila-eagle.glb`. */
  "character-flyer",
  "lepidoptera", "lepidoptera-moth", "lepidoptera-hawk", "lepidoptera-skipper",
  "odonata", "odonata-damsel",
  "diptera", "diptera-mosquito", "diptera-crane", "diptera-mothfly", "diptera-hover",
  "hymenoptera-bee", "hymenoptera-wasp",
]);

/**
 * The Y shift that puts a model on the ground plane, or 0 when it already
 * stands there (within `max_ground_gap` of its own height). Shared by this
 * audit and the builder, so the thing that fixes and the thing that checks
 * cannot disagree about what "grounded" means.
 *
 * @param {{ min: number[], max: number[] }} bound
 * @param {boolean} is_flyer
 * @param {boolean} is_mound the companion stands in a soil mound that is half
 *   buried on purpose, so its lowest point may sit below y=0
 */
export function groundOffset(bound, is_flyer = false, is_mound = false) {
  const low = bound.min[1];
  const height = bound.max[1] - bound.min[1];
  const slack = LIMIT.max_ground_gap * height;
  if (low < -slack && !is_mound) return -low; // sinks through the floor: lift, flyer or not
  if (low > slack && !is_flyer) return -low; // floats with no wings to do it with
  return 0;
}

const MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const COMPONENT_BYTE = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_WIDTH = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

/* ── transforms ─────────────────────────────────────────────────────────── */

function identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

/** Column-major 4x4 from a glTF node's matrix or TRS. */
function nodeMatrix(node) {
  if (Array.isArray(node.matrix) && node.matrix.length === 16) return node.matrix;
  const [tx, ty, tz] = node.translation ?? [0, 0, 0];
  const [x, y, z, w] = node.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = node.scale ?? [1, 1, 1];
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

function multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) sum += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = sum;
    }
  }
  return out;
}

function apply(m, p) {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

/* ── one file ───────────────────────────────────────────────────────────── */

/**
 * Parse and check one .glb buffer. Never throws: every failure becomes a flag,
 * so one broken file cannot hide the state of the other thousand.
 *
 * @param {Uint8Array} buf
 * @param {{ is_flyer?: boolean, is_mound?: boolean }} [option] see groundOffset
 * @returns {{ flag: string[], problem: string[], byte: number, mesh: number,
 *   triangle: number, bound: { min: number[], max: number[] } | null }}
 */
export function auditGlb(buf, { is_flyer = false, is_mound = false } = {}) {
  const out = { flag: [], problem: [], byte: buf.byteLength, mesh: 0, triangle: 0, bound: null };
  const broken = (why) => {
    if (!out.flag.includes("broken")) out.flag.push("broken");
    out.problem.push(why);
    return out;
  };
  if (buf.byteLength > LIMIT.max_byte) {
    out.flag.push("oversize");
    out.problem.push(`${(buf.byteLength / 1024 / 1024).toFixed(2)} MB over the ${LIMIT.max_byte / 1024 / 1024} MB ceiling`);
  }
  if (buf.byteLength < 20) return broken("shorter than a glb header");

  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0, true) !== MAGIC) return broken("magic is not glTF");
  if (dv.getUint32(4, true) !== 2) return broken(`container version ${dv.getUint32(4, true)}, not 2`);
  if (dv.getUint32(8, true) !== buf.byteLength) return broken(`header length ${dv.getUint32(8, true)} != file ${buf.byteLength}`);

  let json = null;
  let bin_length = 0;
  let bin_start = 0;
  let off = 12;
  let index = 0;
  while (off < buf.byteLength) {
    if (off + 8 > buf.byteLength) return broken("truncated chunk header");
    const length = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    if (off + 8 + length > buf.byteLength) return broken(`chunk ${index} runs past end of file`);
    if (index === 0 && type !== CHUNK_JSON) return broken("first chunk is not JSON");
    if (type === CHUNK_JSON) {
      try {
        json = JSON.parse(new TextDecoder().decode(buf.subarray(off + 8, off + 8 + length)));
      } catch {
        return broken("JSON chunk does not parse");
      }
    } else if (type === CHUNK_BIN) {
      bin_length = length;
      bin_start = off + 8;
    }
    off += 8 + length;
    index += 1;
  }
  if (!json) return broken("no JSON chunk");
  if (json.asset?.version !== "2.0") return broken(`asset.version ${json.asset?.version}, not 2.0`);

  /* Buffers: the glb's own buffer 0 has no uri and must fit in the BIN chunk. */
  const buffer = json.buffers ?? [];
  for (const [i, b] of buffer.entries()) {
    if (b.uri !== undefined) return broken(`buffer ${i} points at an external uri — the pack is self-contained`);
    if (i === 0 && b.byteLength > bin_length) return broken(`buffer 0 declares ${b.byteLength} B, BIN chunk holds ${bin_length}`);
  }
  for (const [i, v] of (json.bufferViews ?? []).entries()) {
    const target = buffer[v.buffer];
    if (!target) return broken(`bufferView ${i} names missing buffer ${v.buffer}`);
    if ((v.byteOffset ?? 0) + v.byteLength > target.byteLength) return broken(`bufferView ${i} reaches past its buffer`);
  }
  for (const [i, a] of (json.accessors ?? []).entries()) {
    if (a.bufferView === undefined) continue;
    const v = json.bufferViews?.[a.bufferView];
    if (!v) return broken(`accessor ${i} names missing bufferView ${a.bufferView}`);
    const element = (COMPONENT_BYTE[a.componentType] ?? 0) * (TYPE_WIDTH[a.type] ?? 0);
    if (!element) return broken(`accessor ${i} has an unknown component/type`);
    const stride = v.byteStride ?? element;
    const need = (a.byteOffset ?? 0) + (a.count > 0 ? stride * (a.count - 1) + element : 0);
    if (need > v.byteLength) return broken(`accessor ${i} reaches past bufferView ${a.bufferView}`);
  }

  const mesh = json.meshes ?? [];
  out.mesh = mesh.length;
  const scene = json.scenes?.[json.scene ?? 0];
  if (!mesh.length || !scene?.nodes?.length) {
    out.flag.push("empty");
    out.problem.push(!mesh.length ? "no mesh" : "default scene has no root node");
    return out;
  }

  /* Walk the default scene: world bounds from each POSITION accessor's min/max
     box corners through the node transform, triangles from index counts. */
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const seen = new Set();
  const visit = (node_index, parent) => {
    if (seen.has(node_index)) return; // a cycle would be a broken file; stop, do not hang
    seen.add(node_index);
    const node = json.nodes?.[node_index];
    if (!node) return;
    const world = multiply(parent, nodeMatrix(node));
    if (node.mesh !== undefined) {
      for (const prim of mesh[node.mesh]?.primitives ?? []) {
        const position = json.accessors?.[prim.attributes?.POSITION];
        if (!position) continue;
        const mode = prim.mode ?? 4;
        if (mode === 4) {
          const count = prim.indices !== undefined ? json.accessors[prim.indices]?.count ?? 0 : position.count;
          out.triangle += Math.floor(count / 3);
        }
        const grow = (p) => {
          for (let k = 0; k < 3; k += 1) {
            if (p[k] < min[k]) min[k] = p[k];
            if (p[k] > max[k]) max[k] = p[k];
          }
        };
        /* Exact: every float vertex through the world transform. A rotated
           part's min/max box over-reaches, and that invents a gap under a
           spider's leg that the mesh does not have. */
        const view = json.bufferViews?.[position.bufferView];
        if (position.componentType === 5126 && position.type === "VEC3" && view && (view.buffer ?? 0) === 0) {
          const stride = view.byteStride ?? 12;
          const base = bin_start + (view.byteOffset ?? 0) + (position.byteOffset ?? 0);
          for (let v = 0; v < position.count; v += 1) {
            const at = base + v * stride;
            grow(apply(world, [dv.getFloat32(at, true), dv.getFloat32(at + 4, true), dv.getFloat32(at + 8, true)]));
          }
        } else if (position.min && position.max) {
          for (let c = 0; c < 8; c += 1) {
            grow(apply(world, [0, 1, 2].map((k) => ((c >> k) & 1 ? position.max[k] : position.min[k]))));
          }
        }
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };
  for (const root of scene.nodes) visit(root, identity());

  /* Every animation channel must drive a node the scene actually draws. A
     track aimed at a node outside the scene loads without error and does
     nothing but warn — every file in the pack shipped one (`root.scale`, the
     whole-model breathe) before the builder put its root in the scene. */
  const dangling = [];
  for (const clip of json.animations ?? []) {
    for (const channel of clip.channels ?? []) {
      const target = channel.target?.node;
      if (target === undefined) continue; // an extension's target: not ours to judge
      if (!seen.has(target)) dangling.push(`${json.nodes?.[target]?.name ?? `node ${target}`}.${channel.target.path}`);
    }
  }
  if (dangling.length) {
    out.flag.push("dangling_track");
    out.problem.push(`animation targets outside the scene: ${[...new Set(dangling)].join(", ")}`);
  }

  if (Number.isFinite(min[0])) {
    out.bound = { min: min.map((v) => +v.toFixed(4)), max: max.map((v) => +v.toFixed(4)) };
    const size = [0, 1, 2].map((k) => max[k] - min[k]);
    if (size.some((s) => !(s > 1e-6))) {
      out.flag.push("degenerate");
      out.problem.push(`zero-size bounds ${size.map((s) => s.toFixed(3)).join(" x ")}`);
    } else if (groundOffset(out.bound, is_flyer, is_mound) !== 0) {
      out.flag.push("ungrounded");
      out.problem.push(`lowest point at y=${min[1].toFixed(3)} for a ${size[1].toFixed(3)} tall model`);
    }
  } else {
    out.flag.push("degenerate");
    out.problem.push("no POSITION min/max to bound");
  }
  if (out.triangle === 0 && !out.flag.includes("degenerate")) {
    out.flag.push("degenerate");
    out.problem.push("no triangles");
  }
  return out;
}

/* ── connectivity: every joint, at rest AND in motion ───────────────────────
 *
 * 09-30, Gelo, `1:35`–`1:41`: "he's still very disconnected. Like his limbs are
 * not connected", and `5:42`–`5:51`: "make sure that none of the limbs are
 * disconnected". The species audit (`species-model/audit.mjs`) already gates
 * floating islands — but only in the REST pose, and only by vertex-to-vertex
 * proximity at a 6% slack. Both blind spots are real:
 *
 *   - A limb that meets its body at rest and swings OUT of it during the idle
 *     clip (a hinge placed mid-limb instead of at the shoulder) passes a rest
 *     check and is exactly what a viewer sees, because the clip always plays.
 *   - A six-sided stem has vertices only at its two end rings. Pushed through a
 *     soil mound it visibly enters the soil, but no stem vertex is near any soil
 *     vertex, so a vertex check calls it floating — and a check that cries wolf
 *     gets its slack raised until it also misses the real gaps.
 *
 * So contact here is decided on SURFACES, exactly: two parts touch when a
 * triangle edge of one crosses a triangle of the other, when one sits wholly
 * inside the other, or when their nearest points (vertex-to-triangle and
 * edge-to-edge) are within `joint_slack` of the model's size.
 *
 * Two rules, checked in the rest pose and at every keyframe time of every clip:
 *
 *   joint   a part whose node hangs (through any number of meshless pivot
 *           nodes) under another part must touch THAT part — a hand touches its
 *           arm, not merely some other hand;
 *   island  all parts form one connected piece, which is what covers the parts
 *           the builders hang straight off the root (legs beside a body).
 *
 * Only the pairs whose relative pose an animation can change are re-measured
 * per keyframe: two parts under the same animated nodes move rigidly together
 * (the whole-model breathe is an affine map, and affine maps preserve contact).
 */

export const CONNECT = {
  /* Largest surface gap that still reads as "touching", as a share of the
     model's rest half-diagonal. 1.5% of a 0.35-unit-tall chibi is ~3 mm on a
     35 cm figure — under a pixel at card size, where a real hinge gap is
     several. Set from the pack's own distribution, not from a wish: see the
     rig lane's report for the before/after counts. */
  joint_slack: 0.015,
  /* Keyframe times to sample per clip, at most. The builders key a sine with
     ten stops, so every channel's extreme is one of its own keys. */
  max_pose: 64,
};

function readChunk(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let off = 12;
  let json = null;
  let bin_start = 0;
  while (off + 8 <= buf.byteLength) {
    const length = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(buf.subarray(off + 8, off + 8 + length)));
    else if (type === CHUNK_BIN) bin_start = off + 8;
    off += 8 + length;
  }
  return { json, dv, bin_start };
}

/** Read one accessor as plain numbers (float or unsigned int components). */
function readAccessor({ json, dv, bin_start }, index) {
  const a = json.accessors[index];
  const view = json.bufferViews[a.bufferView];
  const width = TYPE_WIDTH[a.type];
  const size = COMPONENT_BYTE[a.componentType];
  const stride = view.byteStride ?? width * size;
  const base = bin_start + (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
  const read = {
    5126: (at) => dv.getFloat32(at, true),
    5125: (at) => dv.getUint32(at, true),
    5123: (at) => dv.getUint16(at, true),
    5121: (at) => dv.getUint8(at),
  }[a.componentType];
  const out = new Float64Array(a.count * width);
  for (let i = 0; i < a.count; i += 1) {
    for (let k = 0; k < width; k += 1) out[i * width + k] = read(base + i * stride + k * size);
  }
  return out;
}

function sampleChannel(channel, t) {
  const { time, value, width, is_step } = channel;
  if (t <= time[0]) return Array.from(value.subarray(0, width));
  const last = time.length - 1;
  if (t >= time[last]) return Array.from(value.subarray(last * width, last * width + width));
  let i = 0;
  while (i < last - 1 && time[i + 1] <= t) i += 1;
  const f = is_step ? 0 : (t - time[i]) / (time[i + 1] - time[i] || 1);
  const out = [];
  for (let k = 0; k < width; k += 1) out.push(value[i * width + k] + (value[(i + 1) * width + k] - value[i * width + k]) * f);
  if (width === 4) {
    const l = Math.hypot(...out) || 1;
    return out.map((v) => v / l);
  }
  return out;
}

/* Geometry kernels. Plain arrays of three; the hot loops stay allocation-light
   by reading straight out of the part's Float64Array. */
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** Squared distance from p to triangle abc (Ericson, Real-Time Collision Detection 5.1.5). */
function pointTriangle2(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  let q;
  if (d1 <= 0 && d2 <= 0) q = a;
  else {
    const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
    if (d3 >= 0 && d4 <= d3) q = b;
    else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); q = [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v]; }
      else {
        const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
        if (d6 >= 0 && d5 <= d6) q = c;
        else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); q = [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w]; }
          else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
              const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
              q = [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w];
            } else {
              const denom = 1 / (va + vb + vc), v = vb * denom, w = vc * denom;
              q = [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
            }
          }
        }
      }
    }
  }
  const d = sub(p, q);
  return dot(d, d);
}

/** Squared distance between segments p1q1 and p2q2 (Ericson 5.1.9). */
function segmentSegment2(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s, t;
  if (a <= 1e-18 && e <= 1e-18) return dot(r, r);
  if (a <= 1e-18) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c = dot(d1, r);
    if (e <= 1e-18) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else {
      const b = dot(d1, d2), denom = a * e - b * b;
      s = denom > 1e-18 ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
      else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  const c1 = [p1[0] + d1[0] * s, p1[1] + d1[1] * s, p1[2] + d1[2] * s];
  const c2 = [p2[0] + d2[0] * t, p2[1] + d2[1] * t, p2[2] + d2[2] * t];
  const d = sub(c1, c2);
  return dot(d, d);
}

/** Does segment pq cross triangle abc? (Möller–Trumbore, bounded to the segment.) */
function segmentHitsTriangle(p, q, a, b, c) {
  const dir = sub(q, p);
  const e1 = sub(b, a), e2 = sub(c, a);
  const h = cross(dir, e2);
  const det = dot(e1, h);
  if (Math.abs(det) < 1e-18) return false;
  const inv = 1 / det;
  const s = sub(p, a);
  const u = inv * dot(s, h);
  if (u < 0 || u > 1) return false;
  const qv = cross(s, e1);
  const v = inv * dot(dir, qv);
  if (v < 0 || u + v > 1) return false;
  const t = inv * dot(e2, qv);
  return t >= 0 && t <= 1;
}

/** Ray-parity: is p inside the closed surface of `part`? Three rays must agree,
 *  so an open plate or a capless tube cannot vote a floating part "inside". */
function isInside(p, part) {
  const far = 1e3;
  const ray = [[0.5773, 0.5774, 0.5775], [-0.6123, 0.3141, 0.7256], [0.2231, -0.8812, 0.4167]];
  for (const d of ray) {
    const q = [p[0] + d[0] * far, p[1] + d[1] * far, p[2] + d[2] * far];
    let hit = 0;
    for (let t = 0; t < part.index.length; t += 3) {
      if (segmentHitsTriangle(p, q, part.vertex(part.index[t]), part.vertex(part.index[t + 1]), part.vertex(part.index[t + 2]))) hit += 1;
    }
    if (hit % 2 === 0) return false;
  }
  return true;
}

function boxGap(a, b) {
  let d2 = 0;
  for (let k = 0; k < 3; k += 1) {
    const g = Math.max(a.lo[k] - b.hi[k], b.lo[k] - a.hi[k], 0);
    d2 += g * g;
  }
  return Math.sqrt(d2);
}

/* A collision-tolerant integer hash of a grid cell: a false share only costs
   one extra distance test, never a wrong answer. */
const cellHash = (x, y, z) => ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) | 0;

/** One posed part's vertices bucketed by cell (flat offsets into `part.v`). */
function gridOf(part, cell) {
  if (part.grid?.cell === cell) return part.grid.slot;
  const slot = new Map();
  const v = part.v;
  for (let n = 0; n < v.length; n += 3) {
    const k = cellHash(Math.floor(v[n] / cell), Math.floor(v[n + 1] / cell), Math.floor(v[n + 2] / cell));
    const s = slot.get(k);
    if (s) s.push(n);
    else slot.set(k, [n]);
  }
  part.grid = { cell, slot };
  return slot;
}

/**
 * The gap between two posed parts' SURFACES: 0 when they cross or one holds
 * the other, else the nearest distance — found only as far as `tol`; beyond
 * that the answer is the box gap or Infinity ("more than tol"), because the
 * exact figure is not needed.
 *
 * `is_exact` false (the touch graph) may stop at the first proof of contact;
 * true (reporting a failure) keeps looking for the true minimum.
 */
export function surfaceGap(a, b, tol, is_exact = false) {
  const box = boxGap(a, b);
  if (box > tol) return box;
  const tol2 = tol * tol;
  const cell = Math.max(tol, 1e-6);

  /* Quick accept: two vertices within tol prove the surfaces are too. This is
     what settles almost every real joint, before any triangle work. Each part
     keeps one vertex grid per pose, built on first use; the smaller part's
     vertices inside the other's reach probe the other's grid. */
  if (!is_exact) {
    const [small, big] = a.vertex_count <= b.vertex_count ? [a, b] : [b, a];
    const grid = gridOf(big, cell);
    const v = small.v, w = big.v;
    const lo0 = big.lo[0] - tol, lo1 = big.lo[1] - tol, lo2 = big.lo[2] - tol;
    const hi0 = big.hi[0] + tol, hi1 = big.hi[1] + tol, hi2 = big.hi[2] + tol;
    for (let n = 0; n < v.length; n += 3) {
      const x = v[n], y = v[n + 1], z = v[n + 2];
      if (x < lo0 || x > hi0 || y < lo1 || y > hi1 || z < lo2 || z > hi2) continue;
      const cx = Math.floor(x / cell), cy = Math.floor(y / cell), cz = Math.floor(z / cell);
      for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
        const slot = grid.get(cellHash(cx + dx, cy + dy, cz + dz));
        if (!slot) continue;
        for (const m of slot) {
          if ((x - w[m]) ** 2 + (y - w[m + 1]) ** 2 + (z - w[m + 2]) ** 2 <= tol2) return 0;
        }
      }
    }
  }

  /* Triangles of each part that come within reach of the other part's box. */
  const near = (part, other) => {
    const out = [];
    for (let t = 0; t < part.index.length; t += 3) {
      if (boxGap({ lo: part.tri_lo.subarray(t, t + 3), hi: part.tri_hi.subarray(t, t + 3) }, other) <= tol) out.push(t);
    }
    return out;
  };
  const ta = near(a, b), tb = near(b, a);
  /* Bucket b's near triangles on a grid sized to them, so each triangle of a
     only meets the few triangles of b around it, not all of them. */
  let span = cell;
  for (const j of tb) for (let k = 0; k < 3; k += 1) span = Math.max(span, b.tri_hi[j + k] - b.tri_lo[j + k]);
  const bucket = new Map();
  const cellOf = (v) => Math.floor(v / span);
  for (const j of tb) {
    for (let x = cellOf(b.tri_lo[j] - tol); x <= cellOf(b.tri_hi[j] + tol); x += 1)
      for (let y = cellOf(b.tri_lo[j + 1] - tol); y <= cellOf(b.tri_hi[j + 1] + tol); y += 1)
        for (let z = cellOf(b.tri_lo[j + 2] - tol); z <= cellOf(b.tri_hi[j + 2] + tol); z += 1) {
          const k = cellHash(x, y, z);
          const slot = bucket.get(k);
          if (slot) slot.push(j);
          else bucket.set(k, [j]);
        }
  }
  let best2 = Infinity;
  const stamp = new Int32Array(b.index.length).fill(-1);
  for (const i of ta) {
    const alo = a.tri_lo.subarray(i, i + 3), ahi = a.tri_hi.subarray(i, i + 3);
    const A = [a.vertex(a.index[i]), a.vertex(a.index[i + 1]), a.vertex(a.index[i + 2])];
    for (let x = cellOf(alo[0]); x <= cellOf(ahi[0]); x += 1)
      for (let y = cellOf(alo[1]); y <= cellOf(ahi[1]); y += 1)
        for (let z = cellOf(alo[2]); z <= cellOf(ahi[2]); z += 1) {
          for (const j of bucket.get(cellHash(x, y, z)) ?? []) {
            if (stamp[j] === i) continue;
            stamp[j] = i;
            const g = boxGap({ lo: alo, hi: ahi }, { lo: b.tri_lo.subarray(j, j + 3), hi: b.tri_hi.subarray(j, j + 3) });
            if (g * g > Math.min(best2, tol2)) continue;
            const B = [b.vertex(b.index[j]), b.vertex(b.index[j + 1]), b.vertex(b.index[j + 2])];
            for (let e = 0; e < 3; e += 1) {
              if (segmentHitsTriangle(A[e], A[(e + 1) % 3], B[0], B[1], B[2])) return 0;
              if (segmentHitsTriangle(B[e], B[(e + 1) % 3], A[0], A[1], A[2])) return 0;
            }
            for (let e = 0; e < 3; e += 1) {
              best2 = Math.min(best2, pointTriangle2(A[e], B[0], B[1], B[2]), pointTriangle2(B[e], A[0], A[1], A[2]));
              for (let f = 0; f < 3; f += 1) best2 = Math.min(best2, segmentSegment2(A[e], A[(e + 1) % 3], B[f], B[(f + 1) % 3]));
            }
            if (!is_exact && best2 <= tol2) return Math.sqrt(best2);
          }
        }
  }
  if (best2 <= tol2 && !is_exact) return Math.sqrt(best2);
  /* No crossing and no near surface: either a real gap, or one part buried
     wholly inside the other (a pupil in an eye, a stem in its soil). */
  if (isInside(a.vertex(a.index[0]), b) || isInside(b.vertex(b.index[0]), a)) return 0;
  /* Nothing of either surface within `tol` of the other: the gap is known
     only to be MORE than tol. It must not come back as tol itself — the
     callers test `<= tol`, and returning exactly tol (as this first did when
     two boxes overlapped with no surface near) joined a philodendron's whole
     upper crown to a petiole 7% of the model away. */
  return Number.isFinite(best2) ? Math.sqrt(best2) : Infinity;
}

/**
 * One part, posed: world-space vertices plus the boxes `surfaceGap` prunes
 * with. Exported so a generator can ask the gate's own question — "do these
 * two surfaces touch?" — about geometry it has not written out yet
 * (`species-model/flora.mjs` closes its holes with it).
 *
 * @param {Float64Array | number[]} v flat xyz
 * @param {Uint32Array | number[]} index flat triangle list
 */
export function posedPart(v, index, name = "part") {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let j = 0; j < v.length; j += 3) {
    for (let k = 0; k < 3; k += 1) {
      if (v[j + k] < lo[k]) lo[k] = v[j + k];
      if (v[j + k] > hi[k]) hi[k] = v[j + k];
    }
  }
  const tri_lo = new Float64Array(index.length), tri_hi = new Float64Array(index.length);
  for (let t = 0; t < index.length; t += 3) {
    for (let k = 0; k < 3; k += 1) {
      const x = v[index[t] * 3 + k], y = v[index[t + 1] * 3 + k], z = v[index[t + 2] * 3 + k];
      tri_lo[t + k] = Math.min(x, y, z);
      tri_hi[t + k] = Math.max(x, y, z);
    }
  }
  return {
    name, index, lo, hi, tri_lo, tri_hi, v, grid: null, vertex_count: v.length / 3,
    vertex: (n) => [v[n * 3], v[n * 3 + 1], v[n * 3 + 2]],
  };
}

/**
 * Check every joint of one .glb in the rest pose and at every keyframe of every
 * clip. Never throws on a well-formed file; a malformed one is auditGlb's job.
 *
 * @param {Uint8Array} buf
 * @param {{ joint_slack?: number }} [option]
 * @returns {{ part: number, pose: number, joint: object[], island: object[],
 *   worst_gap: number, radius: number }} `joint`/`island` list each failure
 *   once, at the pose where its gap is widest (clip "rest" = the rest pose);
 *   `is_rest` says whether it is already apart at rest, as opposed to only
 *   coming apart when the clip plays.
 */
export function auditConnectivity(buf, { joint_slack = CONNECT.joint_slack } = {}) {
  const glb = readChunk(buf);
  const { json } = glb;
  const node = json.nodes ?? [];
  const scene = json.scenes?.[json.scene ?? 0];

  /* Shapes per mesh, in mesh space. */
  const shape = (json.meshes ?? []).map((mesh) => {
    const position = [];
    const index = [];
    for (const prim of mesh.primitives ?? []) {
      if ((prim.mode ?? 4) !== 4 || prim.attributes?.POSITION === undefined) continue;
      const p = readAccessor(glb, prim.attributes.POSITION);
      const base = position.length / 3;
      for (const v of p) position.push(v);
      const idx = prim.indices !== undefined ? readAccessor(glb, prim.indices) : p.map((_, i) => i).filter((i) => i < p.length / 3);
      for (const i of idx) index.push(base + i);
    }
    return { position: Float64Array.from(position), index: Uint32Array.from(index) };
  });

  /* Scene tree: parent links, and each node's chain of ancestors. */
  const parent = new Map();
  const in_scene = new Set();
  const walk = (i, p) => {
    if (in_scene.has(i)) return;
    in_scene.add(i);
    if (p !== null) parent.set(i, p);
    for (const c of node[i]?.children ?? []) walk(c, i);
  };
  for (const r of scene?.nodes ?? []) walk(r, null);
  const mesh_node = [...in_scene].filter((i) => node[i].mesh !== undefined && shape[node[i].mesh]?.index.length);

  /* Joint partner: the nearest ancestor that draws something. */
  const partner = new Map();
  for (const i of mesh_node) {
    let p = parent.get(i);
    while (p !== undefined && node[p].mesh === undefined) p = parent.get(p);
    if (p !== undefined && mesh_node.includes(p)) partner.set(i, p);
  }

  /* Clips as sampled channels. */
  const clip = (json.animations ?? []).map((a, ci) => ({
    name: a.name ?? `clip${ci}`,
    channel: (a.channels ?? []).filter((c) => c.target?.node !== undefined && in_scene.has(c.target.node)).map((c) => {
      const s = a.samplers[c.sampler];
      return {
        node: c.target.node, path: c.target.path,
        time: readAccessor(glb, s.input), value: readAccessor(glb, s.output),
        width: c.target.path === "rotation" ? 4 : 3, is_step: s.interpolation === "STEP",
      };
    }).filter((c) => c.path !== "weights"),
  }));
  const animated = new Set(clip.flatMap((c) => c.channel.map((ch) => ch.node)));
  /* A pair can only come apart if an animated node sits between them, i.e. if
     the animated nodes on their two root paths differ. */
  const moverOf = (i) => {
    const out = [];
    for (let n = i; n !== undefined; n = parent.get(n)) if (animated.has(n)) out.push(n);
    return out.sort((x, y) => x - y).join(",");
  };
  const mover = new Map(mesh_node.map((i) => [i, moverOf(i)]));

  const poseOf = (c, t) => {
    const local = node.map((n) => ({ t: n.translation ?? [0, 0, 0], r: n.rotation ?? [0, 0, 0, 1], s: n.scale ?? [1, 1, 1], m: n.matrix }));
    if (c) {
      for (const ch of c.channel) {
        const v = sampleChannel(ch, t);
        const slot = ch.path === "translation" ? "t" : ch.path === "rotation" ? "r" : "s";
        local[ch.node] = { ...local[ch.node], [slot]: v, m: undefined };
      }
    }
    const world = new Map();
    const go = (i, pm) => {
      const l = local[i];
      const m = multiply(pm, l.m ?? nodeMatrix({ translation: l.t, rotation: l.r, scale: l.s }));
      world.set(i, m);
      for (const ch of node[i].children ?? []) go(ch, m);
    };
    for (const r of scene?.nodes ?? []) go(r, identity());
    const part = new Map();
    for (const i of mesh_node) {
      const { position, index } = shape[node[i].mesh];
      const m = world.get(i);
      const v = new Float64Array(position.length);
      for (let j = 0; j < position.length; j += 3) {
        const w = apply(m, [position[j], position[j + 1], position[j + 2]]);
        v[j] = w[0];
        v[j + 1] = w[1];
        v[j + 2] = w[2];
      }
      part.set(i, posedPart(v, index, node[i].name ?? `node ${i}`));
    }
    return part;
  };

  const rest = poseOf(null, 0);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of rest.values()) for (let k = 0; k < 3; k += 1) { lo[k] = Math.min(lo[k], p.lo[k]); hi[k] = Math.max(hi[k], p.hi[k]); }
  const radius = Math.max(1e-6, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2);
  const tol = radius * joint_slack;

  /* Candidate pairs for the island rule: any two parts whose rest boxes come
     within reach, plus every joint pair. Boxes are re-tested per pose. */
  const key = (i, j) => (i < j ? `${i}:${j}` : `${j}:${i}`);
  const joint_fail = new Map();
  const island_fail = new Map();
  let worst_gap = 0;
  let pose_count = 0;
  const rest_touch = new Map();

  /* Every part's meshed descendants, i.e. everything that rides on it. */
  const rider = new Map();
  for (const i of mesh_node) {
    for (let p = partner.get(i); p !== undefined; p = partner.get(p)) {
      if (!rider.has(p)) rider.set(p, []);
      rider.get(p).push(i);
    }
  }

  const measure = (part, label, t, only_moving) => {
    pose_count += 1;
    const touch = new Map();
    /* Lazy and cached: most pairs never need measuring, because the pieces
       join through their joints long before every pair has been tried. */
    const gapOf = (i, j) => {
      const k = key(i, j);
      if (touch.has(k)) return touch.get(k);
      /* Rigid pair: same answer as at rest. */
      const is_rigid = mover.get(i) === mover.get(j);
      if (only_moving && is_rigid && rest_touch.has(k)) {
        touch.set(k, rest_touch.get(k));
        return rest_touch.get(k);
      }
      const g = surfaceGap(part.get(i), part.get(j), tol);
      touch.set(k, g);
      if (is_rigid) rest_touch.set(k, g);
      return g;
    };
    /* The loose pieces of `member`, largest first. Joint pairs are tried
       first — they are the contacts the builders meant — then any other
       pair still in two pieces whose boxes come within reach. */
    const pieceOf = (member) => {
      const root = new Map(member.map((i) => [i, i]));
      const find = (i) => { while (root.get(i) !== i) { root.set(i, root.get(root.get(i))); i = root.get(i); } return i; };
      let count = member.length;
      const tryPair = (i, j) => {
        if (find(i) === find(j)) return;
        if (boxGap(part.get(i), part.get(j)) > tol) return;
        if (gapOf(i, j) <= tol) { root.set(find(i), find(j)); count -= 1; }
      };
      for (const i of member) if (root.has(partner.get(i))) tryPair(i, partner.get(i));
      if (count > 1) {
        /* Deepest box overlap first: the likeliest contacts settle the pieces
           before any near-miss pair pays for a full surface test. */
        const candidate = [];
        for (let x = 0; x < member.length; x += 1) {
          for (let y = x + 1; y < member.length; y += 1) {
            const a = part.get(member[x]), b = part.get(member[y]);
            if (boxGap(a, b) > tol) continue;
            let overlap = 1;
            for (let k = 0; k < 3; k += 1) overlap *= Math.max(0, Math.min(a.hi[k], b.hi[k]) - Math.max(a.lo[k], b.lo[k]));
            candidate.push([member[x], member[y], overlap]);
          }
        }
        candidate.sort((p, q) => q[2] - p[2]);
        for (const [i, j] of candidate) {
          if (count <= 1) break;
          tryPair(i, j);
        }
      }
      const group = new Map();
      for (const i of member) {
        const r = find(i);
        if (!group.has(r)) group.set(r, []);
        group.get(r).push(i);
      }
      return [...group.values()].sort((a, b) => b.length - a.length);
    };
    /* Only failures reach here. Which pose is the WORST is ranked by the
       nearest vertex pair (cheap, and an upper bound on the surface gap); the
       exact surface gap is measured once, at that pose, after the last one. */
    const gapTo = (i, member) => {
      let g = Infinity;
      const a = part.get(i).v;
      const sa = Math.max(3, Math.floor(a.length / 3 / 200) * 3);
      for (const j of member) {
        if (j === i) continue;
        const b = part.get(j).v;
        const sb = Math.max(3, Math.floor(b.length / 3 / 200) * 3);
        for (let x = 0; x < a.length; x += sa) {
          for (let y = 0; y < b.length; y += sb) {
            const d = (a[x] - b[y]) ** 2 + (a[x + 1] - b[y + 1]) ** 2 + (a[x + 2] - b[y + 2]) ** 2;
            if (d < g) g = d;
          }
        }
      }
      return Math.sqrt(g);
    };
    /* joint: each part and everything riding on it is one piece. Report the
       loose rider against the part it rides, at its widest gap. */
    for (const [p, ride] of rider) {
      const piece = pieceOf([p, ...ride]);
      if (piece.length < 2) continue;
      const held = piece.find((one) => one.includes(p));
      for (const one of piece) {
        if (one === held) continue;
        for (const i of one) {
          const g = gapTo(i, held);
          const was = joint_fail.get(i);
          const is_rest = (was?.is_rest ?? false) || label === "rest";
          if (!was || g > was.gap) joint_fail.set(i, { part: node[i].name, parent: node[p].name, clip: label, time: t, gap: g, is_rest, held });
          else was.is_rest = is_rest;
        }
      }
    }
    /* island: the whole model is one piece. */
    const piece = pieceOf(mesh_node);
    for (const loose of piece.slice(1)) {
      for (const i of loose) {
        const g = gapTo(i, piece[0]);
        const was = island_fail.get(i);
        const is_rest = (was?.is_rest ?? false) || label === "rest";
        if (!was || g > was.gap) island_fail.set(i, { part: node[i].name, clip: label, time: t, gap: g, is_rest, held: piece[0] });
        else was.is_rest = is_rest;
      }
    }
    return touch;
  };

  for (const [k, g] of measure(rest, "rest", 0, false)) rest_touch.set(k, g);
  for (const c of clip) {
    if (!c.channel.length) continue;
    const time = [...new Set(c.channel.flatMap((ch) => Array.from(ch.time, (t) => +t.toFixed(4))))].sort((a, b) => a - b);
    const step = Math.max(1, Math.ceil(time.length / CONNECT.max_pose));
    for (let n = 0; n < time.length; n += step) measure(poseOf(c, time[n]), c.name, time[n], true);
  }

  /* The exact surface gap of each failure, at its worst pose. */
  const exact = (fail) => [...fail].map(([i, f]) => {
    const pose = f.clip === "rest" ? rest : poseOf(clip.find((c) => c.name === f.clip), f.time);
    let g = Infinity;
    for (const j of f.held) if (j !== i) g = Math.min(g, surfaceGap(pose.get(i), pose.get(j), radius, true));
    const { held: _held, ...out } = f;
    return { ...out, time: +f.time.toFixed(3), gap: +g.toFixed(4), gap_share: +(g / radius).toFixed(4) };
  });
  const joint = exact(joint_fail);
  const island = exact(island_fail);
  worst_gap = Math.max(0, ...joint.map((f) => f.gap_share), ...island.map((f) => f.gap_share));

  return {
    part: mesh_node.length,
    pose: pose_count,
    joint,
    island,
    worst_gap: +worst_gap.toFixed(4),
    radius: +radius.toFixed(4),
  };
}

/* ── the whole pack ─────────────────────────────────────────────────────── */

function listGlb(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...listGlb(path));
    else if (entry.name.endsWith(".glb")) found.push(path);
  }
  return found;
}

/**
 * Audit every referenced model and cross-check manifest against disk.
 *
 * @param {string} model_dir defaults to public/model
 * @param {{ is_rig?: boolean }} [option] `is_rig` adds the connectivity check
 *   (`auditConnectivity`) to every file — about 90 s for the pack, so the CLI
 *   runs it and the per-commit test runs it on a sample instead
 * @returns {{ row: object[], orphan: string[], duplicate: string[], summary: object }}
 */
export function auditPack(model_dir = MODEL_DIR, { is_rig = false } = {}) {
  const manifest = JSON.parse(readFileSync(join(model_dir, "species-model.json"), "utf8"));
  const reference = [
    ...manifest.model.map((e) => ({ file: e.file, species_code: e.species_code, archetype: e.archetype, manifest_byte: e.bytes ?? null })),
    ...CHARACTER_FILE.map((file) => ({
      file,
      species_code: null,
      archetype: file === "agila-eagle.glb" ? "character-flyer" : "character",
      manifest_byte: null,
    })),
  ];

  const row = [];
  const seen_file = new Map();
  const duplicate = [];
  for (const ref of reference) {
    if (seen_file.has(ref.file)) duplicate.push(`${ref.file} (${seen_file.get(ref.file)} and ${ref.species_code})`);
    seen_file.set(ref.file, ref.species_code);
    const path = join(model_dir, ref.file);
    if (!ref.file || !existsSync(path) || !statSync(path).isFile()) {
      row.push({ ...ref, flag: ["missing"], problem: ["file not on disk"], byte: 0, mesh: 0, triangle: 0, bound: null });
      continue;
    }
    const buf = readFileSync(path);
    const result = auditGlb(buf, { is_flyer: FLYER.has(ref.archetype), is_mound: ref.archetype === "character" });
    if (is_rig && !result.flag.includes("broken") && !result.flag.includes("empty")) {
      const rig = auditConnectivity(buf);
      const loose = [...rig.joint, ...rig.island.filter((f) => !rig.joint.some((j) => j.part === f.part))];
      if (loose.length) {
        result.flag.push("disconnected");
        result.problem.push(
          loose.map((f) => `${f.part}${f.parent ? ` off ${f.parent}` : ""} ${(f.gap_share * 100).toFixed(1)}% ${f.is_rest ? "at rest" : `in ${f.clip} @${f.time}s`}`).join(", "),
        );
      }
    }
    if (ref.manifest_byte !== null && ref.manifest_byte !== result.byte) {
      result.flag.push("size_mismatch");
      result.problem.push(`manifest says ${ref.manifest_byte} B, disk has ${result.byte} B`);
    }
    row.push({ ...ref, ...result });
  }

  const referenced = new Set(reference.map((r) => r.file));
  const orphan = listGlb(model_dir)
    .map((p) => relative(model_dir, p).replace(/\\/g, "/"))
    .filter((f) => !referenced.has(f));

  const count = (flag) => row.filter((r) => r.flag.includes(flag)).length;
  const triangle = row.filter((r) => r.triangle > 0).map((r) => r.triangle).sort((a, b) => a - b);
  const byte = row.map((r) => r.byte).filter((b) => b > 0).sort((a, b) => a - b);
  const summary = {
    file: row.length,
    ok: row.filter((r) => r.flag.length === 0).length,
    missing: count("missing"),
    broken: count("broken"),
    empty: count("empty"),
    oversize: count("oversize"),
    degenerate: count("degenerate"),
    ungrounded: count("ungrounded"),
    size_mismatch: count("size_mismatch"),
    dangling_track: count("dangling_track"),
    disconnected: is_rig ? count("disconnected") : null,
    orphan: orphan.length,
    duplicate: duplicate.length,
    triangle_median: triangle[Math.floor(triangle.length / 2)] ?? 0,
    triangle_max: triangle[triangle.length - 1] ?? 0,
    byte_total: byte.reduce((a, b) => a + b, 0),
    byte_max: byte[byte.length - 1] ?? 0,
  };
  return { row, orphan, duplicate, summary };
}

function main() {
  const report = auditPack(MODEL_DIR, { is_rig: !process.argv.includes("--fast") });
  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    const s = report.summary;
    console.log(`models: ${s.file} referenced, ${s.ok} clean`);
    console.log(
      `missing ${s.missing} · broken ${s.broken} · empty ${s.empty} · oversize ${s.oversize} · degenerate ${s.degenerate}` +
        ` · ungrounded ${s.ungrounded} · size_mismatch ${s.size_mismatch} · dangling_track ${s.dangling_track}` +
        ` · disconnected ${s.disconnected ?? "skipped (--fast)"}` +
        ` · orphan ${s.orphan} · duplicate ${s.duplicate}`,
    );
    console.log(
      `triangles: median ${s.triangle_median}, max ${s.triangle_max} · size: ${(s.byte_total / 1024 / 1024).toFixed(1)} MB total, largest ${(s.byte_max / 1024).toFixed(0)} kB`,
    );
    for (const r of report.row) {
      if (r.flag.length) console.log(`  ${r.flag.join(",").padEnd(22)} ${r.file}  — ${r.problem.join("; ")}`);
    }
    for (const f of report.orphan) console.log(`  ${"orphan".padEnd(22)} ${f}`);
    for (const d of report.duplicate) console.log(`  ${"duplicate".padEnd(22)} ${d}`);
  }
  const bad = report.row.some((r) => r.flag.length) || report.orphan.length || report.duplicate.length;
  process.exitCode = bad ? 1 : 0;
}

if (process.argv[1] && process.argv[1].endsWith("audit-model.mjs")) main();
