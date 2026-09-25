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
 *   orphan        a .glb under public/model/ that nothing references
 *
 * Reads the shipped bytes only. Header-level by default (every chunk, every
 * accessor range, bounds from accessor min/max through the node transforms),
 * so it runs over 1,100 files in about a second and can sit in `npm test`.
 *
 *   node script/audit-model.mjs            # summary + every flag, exit 1 on any
 *   node script/audit-model.mjs --json     # full per-file report on stdout
 */
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const MODEL_DIR = join(here, "..", "public", "model");

/** The `CHARACTER_MODEL_SLOT` files (src/character-model.tsx) plus the full-tree alias. */
export const CHARACTER_FILE = [
  "character.glb",
  "character-egg.glb",
  "character-seedling.glb",
  "character-sapling.glb",
  "character-tree.glb",
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
 * @returns {{ row: object[], orphan: string[], duplicate: string[], summary: object }}
 */
export function auditPack(model_dir = MODEL_DIR) {
  const manifest = JSON.parse(readFileSync(join(model_dir, "species-model.json"), "utf8"));
  const reference = [
    ...manifest.model.map((e) => ({ file: e.file, species_code: e.species_code, archetype: e.archetype, manifest_byte: e.bytes ?? null })),
    ...CHARACTER_FILE.map((file) => ({ file, species_code: null, archetype: "character", manifest_byte: null })),
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
    const result = auditGlb(readFileSync(path), { is_flyer: FLYER.has(ref.archetype), is_mound: ref.archetype === "character" });
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
  const report = auditPack();
  if (process.argv.includes("--json")) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  } else {
    const s = report.summary;
    console.log(`models: ${s.file} referenced, ${s.ok} clean`);
    console.log(
      `missing ${s.missing} · broken ${s.broken} · empty ${s.empty} · oversize ${s.oversize} · degenerate ${s.degenerate}` +
        ` · ungrounded ${s.ungrounded} · size_mismatch ${s.size_mismatch} · orphan ${s.orphan} · duplicate ${s.duplicate}`,
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
