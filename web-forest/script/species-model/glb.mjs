/**
 * Zero-dependency glTF 2.0 (.glb) writer for the cute species-model pack.
 *
 * Everything is low-poly built from icosphere/cone/cylinder/capsule primitives
 * with per-vertex colors — no textures, no external packages. Animation is
 * node-transform only (rotation/translation/scale channels on an "idle" clip),
 * which every glTF viewer (model-viewer included) plays.
 *
 * Shading is per-part and crease-aware. A part added with `smooth` off gets the
 * classic three-vertices-per-face split and reads hard-edged; with `smooth` on
 * (a crease angle in degrees) vertices weld by position and their normals
 * average, but only across facets that meet more gently than the crease, so a
 * ball reads round while a cap rim, a fold and a cone tip stay sharp. Welding
 * also removes the 3x vertex duplication, which is why turning smoothing ON
 * made this pack SMALLER even as it quadrupled the triangle count.
 *
 * Two other size levers live in the writer: zero-area faces are dropped before
 * they reach a buffer (they shade black and carry a zero-length normal), and
 * nodes whose geometry is byte-identical share one mesh — the six identical
 * legs, the twelve identical petals, the mirrored pair of eyes.
 *
 * Coordinate sense used across the pack: +Y up, creature faces +Z, ground at
 * y=0, whole model inside roughly a 1-unit box so one gallery camera fits all.
 */

// ---------- color ----------

export function hex(hexStr) {
  const n = parseInt(hexStr.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
  };
  return [f(0), f(8), f(4)];
}

export function mix(c1, c2, t) {
  return [c1[0] + (c2[0] - c1[0]) * t, c1[1] + (c2[1] - c1[1]) * t, c1[2] + (c2[2] - c1[2]) * t];
}

export function shade(c, k) {
  // k > 0 lighten toward paper, k < 0 darken toward ink
  return k >= 0 ? mix(c, [0.98, 0.98, 0.96], k) : mix(c, [0.12, 0.13, 0.13], -k);
}

export function pick(list, seed, jitter = 0) {
  const s = typeof seed === "number" ? Math.abs(Math.floor(seed)) : hash32(String(seed));
  const c = list[s % list.length];
  return jitter ? jitterColor(c, s, jitter) : c;
}

export function jitterColor(c, seed, amount) {
  const h = (hash32(String(seed)) % 1000) / 1000 - 0.5;
  return shade(c, h * 2 * amount);
}

export function hash32(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// ---------- mat4 (column-major) ----------

const M = () => new Float32Array(16);

export function mIdentity() {
  const m = M();
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function mMul(a, b) {
  const out = M();
  for (let c = 0; c < 4; c += 1)
    for (let r = 0; r < 4; r += 1) {
      let v = 0;
      for (let k = 0; k < 4; k += 1) v += a[k * 4 + r] * b[c * 4 + k];
      out[c * 4 + r] = v;
    }
  return out;
}

export function mT([x, y, z]) {
  const m = mIdentity();
  m[12] = x;
  m[13] = y;
  m[14] = z;
  return m;
}

export function mS([x, y, z]) {
  const m = mIdentity();
  m[0] = x;
  m[5] = y;
  m[10] = z;
  return m;
}

export function mRx(a) {
  const m = mIdentity();
  const c = Math.cos(a);
  const s = Math.sin(a);
  m[5] = c;
  m[6] = s;
  m[9] = -s;
  m[10] = c;
  return m;
}

export function mRy(a) {
  const m = mIdentity();
  const c = Math.cos(a);
  const s = Math.sin(a);
  m[0] = c;
  m[2] = -s;
  m[8] = s;
  m[10] = c;
  return m;
}

export function mRz(a) {
  const m = mIdentity();
  const c = Math.cos(a);
  const s = Math.sin(a);
  m[0] = c;
  m[1] = s;
  m[4] = -s;
  m[5] = c;
  return m;
}

/** Apply ops left-to-right: compose(mS, mRx, mT) scales, tilts, then moves. */
export function mCompose(...ops) {
  let m = mIdentity();
  for (const op of ops) m = mMul(m, op);
  return m;
}

export function apply(m, [x, y, z]) {
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14],
  ];
}

export function quatAxisAngle(axis, rad) {
  const [x, y, z] = axis;
  const len = Math.hypot(x, y, z) || 1;
  const s = Math.sin(rad / 2);
  return [(x / len) * s, (y / len) * s, (z / len) * s, Math.cos(rad / 2)];
}

export function quatMul(a, b) {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

// ---------- primitives ----------

const icoCache = new Map();

/** Unit icosphere. subdiv 0 = 20 faces, 1 = 80 faces. */
export function icosphere(subdiv) {
  const key = String(subdiv);
  if (icoCache.has(key)) return icoCache.get(key);

  const t = (1 + Math.sqrt(5)) / 2;
  const verts = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(norm3);
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  let pos = verts;
  let idx = faces;
  for (let s = 0; s < subdiv; s += 1) {
    const cache = new Map();
    const mid = (a, b) => {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      if (cache.has(key)) return cache.get(key);
      const m = norm3([
        (pos[a][0] + pos[b][0]) / 2,
        (pos[a][1] + pos[b][1]) / 2,
        (pos[a][2] + pos[b][2]) / 2,
      ]);
      pos.push(m);
      cache.set(key, pos.length - 1);
      return pos.length - 1;
    };
    const next = [];
    for (const [a, b, c] of idx) {
      const ab = mid(a, b);
      const bc = mid(b, c);
      const ca = mid(c, a);
      next.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    idx = next;
  }
  const geo = { positions: pos, indices: idx };
  icoCache.set(key, geo);
  return geo;
}

function norm3([x, y, z]) {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

/**
 * Truncated cone along +Y from y=0 to y=h, radius r1 at base, r2 at top.
 *
 * Degenerate-free by construction. The old version emitted a full ring at
 * every radius, so a cone (r2 = 0) shipped `seg` zero-area side triangles plus
 * a whole zero-area top cap — 12 wasted, black-shading faces on every beak in
 * the pack. A zero radius now collapses to a single apex vertex and its cap is
 * skipped; the seam ring is shared by index rather than duplicated.
 *
 * `seg` is a floor, not a literal: fewer than ~10 radial segments puts adjacent
 * side facets more than 40 degrees apart, which is exactly what "faceted" means
 * in the audit. Pass `{ exactSeg: true }` when a chunky hexagonal stem is the
 * intent and the coarseness must survive.
 */
export function cylinderGeo(r1, r2, h, seg = 10, opt = {}) {
  const { exactSeg = false, minSeg = 12, capBase = true, capTop = true } = opt;
  const S = Math.max(3, Math.round(exactSeg ? seg : Math.max(seg, minSeg)));
  const EPS = 1e-7;
  const a1 = Math.abs(r1) < EPS ? 0 : r1;
  const a2 = Math.abs(r2) < EPS ? 0 : r2;
  const positions = [];
  const indices = [];
  if (!a1 && !a2) return { positions, indices };

  const ring = (r, y) => {
    const base = positions.length;
    for (let i = 0; i < S; i += 1) {
      const a = (i / S) * Math.PI * 2;
      positions.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    }
    return base;
  };

  /* A zero-height ring pair is a disc, not a tube — emit one so callers that
     flatten a part to nothing still get a visible, non-degenerate face. */
  if (Math.abs(h) < EPS) {
    const r = Math.max(a1, a2);
    const b = ring(r, 0);
    const c = positions.length;
    positions.push([0, 0, 0]);
    for (let i = 0; i < S; i += 1) indices.push([b + i, c, b + ((i + 1) % S)]);
    return { positions, indices };
  }

  const b0 = a1 ? ring(a1, 0) : -1;
  const b1 = a2 ? ring(a2, h) : -1;
  const apexBase = a1 ? -1 : (positions.push([0, 0, 0]), positions.length - 1);
  const apexTop = a2 ? -1 : (positions.push([0, h, 0]), positions.length - 1);

  for (let i = 0; i < S; i += 1) {
    const j = (i + 1) % S;
    if (b0 >= 0 && b1 >= 0) {
      indices.push([b0 + i, b1 + i, b0 + j], [b1 + i, b1 + j, b0 + j]);
    } else if (b0 >= 0) {
      indices.push([b0 + i, apexTop, b0 + j]);
    } else {
      indices.push([apexBase, b1 + i, b1 + j]);
    }
  }
  if (b1 >= 0 && capTop) {
    const c = positions.length;
    positions.push([0, h, 0]);
    for (let i = 0; i < S; i += 1) indices.push([b1 + i, c, b1 + ((i + 1) % S)]);
  }
  if (b0 >= 0 && capBase) {
    const c = positions.length;
    positions.push([0, 0, 0]);
    for (let i = 0; i < S; i += 1) indices.push([b0 + i, b0 + ((i + 1) % S), c]);
  }
  return { positions, indices };
}

/**
 * Flat n-gon disc in the XZ plane, radius r, centred on the origin, facing +Y.
 * Coplanar by construction, so it costs `seg` triangles and contributes zero
 * hard edges — the cheap way to draw a spot, a petal or a lily pad.
 */
export function discGeo(r, seg = 12) {
  const S = Math.max(3, Math.round(seg));
  const positions = [[0, 0, 0]];
  const indices = [];
  for (let i = 0; i < S; i += 1) {
    const a = (i / S) * Math.PI * 2;
    positions.push([Math.cos(a) * r, 0, Math.sin(a) * r]);
  }
  for (let i = 0; i < S; i += 1) indices.push([1 + i, 0, 1 + ((i + 1) % S)]);
  return { positions, indices };
}

/**
 * Capsule along +Y spanning y=0..h, radius r: a tube with hemisphere ends.
 * A drop-in for `cylinderGeo(r, r, h)` that reads as a smooth limb instead of
 * a cut pipe, and carries no flat cap rim to throw a hard crease.
 */
export function capsuleGeo(r, h, seg = 12, cap = 3) {
  const S = Math.max(3, Math.round(seg));
  const C = Math.max(1, Math.round(cap));
  const R = Math.min(Math.abs(r), Math.abs(h) / 2 || Math.abs(r));
  const positions = [];
  const indices = [];
  const ringAt = (rr, y) => {
    const base = positions.length;
    for (let i = 0; i < S; i += 1) {
      const a = (i / S) * Math.PI * 2;
      positions.push([Math.cos(a) * rr, y, Math.sin(a) * rr]);
    }
    return base;
  };
  positions.push([0, 0, 0]);
  const bottom = 0;
  const ring = [];
  const ringMeta = [];
  /* Profile as (radius, y) pairs, then dedupe: at h = 2R the two hemisphere
     equators land on the same circle and a duplicated ring is a band of
     zero-area quads. */
  const profile = [];
  for (let k = 1; k <= C; k += 1) {
    const t = (k / C) * (Math.PI / 2);
    profile.push([R * Math.sin(t), R - R * Math.cos(t)]);
  }
  for (let k = C; k >= 1; k -= 1) {
    const t = (k / C) * (Math.PI / 2);
    profile.push([R * Math.sin(t), h - R + R * Math.cos(t)]);
  }
  for (const [rr, y] of profile) {
    const prev = ringMeta.length ? ringMeta[ringMeta.length - 1] : null;
    if (prev && Math.abs(prev[0] - rr) < 1e-9 && Math.abs(prev[1] - y) < 1e-9) continue;
    ringMeta.push([rr, y]);
    ring.push(ringAt(rr, y));
  }
  positions.push([0, h, 0]);
  const top = positions.length - 1;
  for (let i = 0; i < S; i += 1) indices.push([bottom, ring[0] + ((i + 1) % S), ring[0] + i]);
  for (let k = 0; k + 1 < ring.length; k += 1) {
    const p = ring[k];
    const q = ring[k + 1];
    for (let i = 0; i < S; i += 1) {
      const j = (i + 1) % S;
      indices.push([p + i, q + i, p + j], [q + i, q + j, p + j]);
    }
  }
  const last = ring[ring.length - 1];
  for (let i = 0; i < S; i += 1) indices.push([last + i, top, last + ((i + 1) % S)]);
  return { positions, indices };
}

/**
 * Square-tube torus arc in the XY plane (around +Z), angles in radians.
 * `segs` is a floor for the same reason cylinderGeo's is.
 */
export function torusArcGeo(R, r, a0, a1, segs = 12, opt = {}) {
  const { exactSeg = false, minSeg = 12 } = opt;
  const S = Math.max(2, Math.round(exactSeg ? segs : Math.max(segs, minSeg)));
  const positions = [];
  const indices = [];
  for (let i = 0; i <= S; i += 1) {
    const a = a0 + ((a1 - a0) * i) / S;
    const cx = Math.cos(a) * R;
    const cy = Math.sin(a) * R;
    positions.push(
      [cx - r, cy - r, 0], [cx + r, cy - r, 0], [cx + r, cy + r, 0], [cx - r, cy + r, 0],
    );
  }
  for (let i = 0; i < S; i += 1) {
    const a = i * 4;
    indices.push([a, a + 1, a + 4], [a + 1, a + 5, a + 4]);
    indices.push([a + 1, a + 2, a + 5], [a + 2, a + 6, a + 5]);
    indices.push([a + 2, a + 3, a + 6], [a + 3, a + 7, a + 6]);
    indices.push([a + 3, a, a + 7], [a, a + 4, a + 7]);
  }
  return { positions, indices };
}

// ---------- scene ----------

/**
 * A cute model under construction. Each part becomes one mesh on one node, so
 * animation targets exactly the parts that should move, and mirrored parts can
 * share one mesh (`linkMesh`) to keep files small.
 */
export class Cute {
  constructor(name, { idleDur = 1.6, smooth = false } = {}) {
    this.name = name;
    this.idleDur = idleDur;
    /* Default shading mode for every part added to this model. `false` keeps
       the classic per-face split; a number is a crease angle in degrees, and
       `true` means 40 — normals average across facets that meet more gently
       than that, and stay hard across anything sharper. */
    this.smooth = smooth;
    this.nodes = [];
    this.channels = [];
    this.root = this.node("root");
    /* Y shift applied by a wrapping "ground" node at export. 0 = none. Set by
       the builder after measuring the rest pose (script/audit-model.mjs), so a
       model whose lowest point floats over or sinks through y=0 stands on the
       ground plane the gallery and <model-viewer> put it on. */
    this.ground_offset = 0;
  }

  node(name, { parent = null, at = [0, 0, 0], rot = null, scale = [1, 1, 1], meshOf = null } = {}) {
    const node = {
      name,
      parent: parent ?? this.root,
      at,
      rot, // euler [x,y,z] radians — exported as quaternion
      scale,
      parts: [],
      meshOf,
      anim: [],
    };
    this.nodes.push(node);
    return node;
  }

  /**
   * Add a transformed primitive to a node.
   * geo: {positions, indices} in unit/local space.
   * opts: {at, rotX, rotY, rotZ, scale, color | colorFn, smooth}
   *
   * `smooth` overrides the model-wide default: false for a hard-edged part,
   * true for the 40-degree default crease, or a number of degrees.
   */
  add(node, geo, opts = {}) {
    const { at = [0, 0, 0], rotX = 0, rotY = 0, rotZ = 0, scale = [1, 1, 1], color, colorFn, smooth } = opts;
    const m = mCompose(
      mS(scale),
      rotX ? mRx(rotX) : mIdentity(),
      rotY ? mRy(rotY) : mIdentity(),
      rotZ ? mRz(rotZ) : mIdentity(),
      mT(at),
    );
    const positions = geo.positions.map((p) => apply(m, p));
    node.parts.push({ positions, indices: geo.indices, color, colorFn, smooth });
    return node;
  }

  /** Convenience: create a node holding one primitive. */
  blob(parent, geo, opts = {}) {
    const { name = "part", at = [0, 0, 0], rot = null, ...rest } = opts;
    const node = this.node(name, { parent, at, rot });
    this.add(node, geo, rest);
    return node;
  }

  /** Second node reusing another node's mesh (for mirrored pairs). */
  linkMesh(src, dst) {
    dst.meshOf = src;
    return dst;
  }

  // ---- idle-clip helpers (all sample a seamless sine loop) ----

  samples(dur, phase, n = 10) {
    const times = [];
    const at = (i) => phase + (dur * i) / n;
    for (let i = 0; i < n; i += 1) times.push(at(i) % dur);
    // ensure strictly ascending times (phase wrapping can collide)
    for (let i = 1; i < times.length; i += 1) if (times[i] <= times[i - 1]) times[i] = times[i - 1] + 1e-4;
    times.push(dur);
    return times;
  }

  /** Rotation swing around one axis, radians, around the node's rest pose. */
  swing(node, { axis = "z", base = 0, amp = 0.4, dur, phase = 0, n = 10 } = {}) {
    const D = dur ?? this.idleDur;
    const ax = axis === "x" ? [1, 0, 0] : axis === "y" ? [0, 1, 0] : [0, 0, 1];
    const times = this.samples(D, phase, n);
    const vals = times.map((t) => quatAxisAngle(ax, base + amp * Math.sin(2 * Math.PI * (t / D))));
    this.channels.push({ node, path: "rotation", times, vals, vec: 4 });
  }

  /** Y bob around the node's rest translation. */
  bob(node, { amp = 0.05, dur, phase = 0, n = 10 } = {}) {
    const D = dur ?? this.idleDur;
    const times = this.samples(D, phase, n);
    const vals = times.map((t) => [node.at[0], node.at[1] + amp * Math.sin(2 * Math.PI * (t / D)), node.at[2]]);
    this.channels.push({ node, path: "translation", times, vals, vec: 3 });
  }

  /** Squash-and-stretch breathing on the node's scale. */
  breathe(node, { k = 0.05, dur, phase = 0, n = 10 } = {}) {
    const D = dur ?? this.idleDur;
    const times = this.samples(D, phase, n);
    const vals = times.map((t) => {
      const s = Math.sin(2 * Math.PI * (t / D));
      return [1 - k * 0.5 * s, 1 + k * s, 1 - k * 0.5 * s];
    });
    this.channels.push({ node, path: "scale", times, vals, vec: 3 });
  }

  /** One quick blink at fraction t0 of the clip (scale-y squash on the eyes). */
  blink(node, { dur, at = 0.55, span = 0.14 } = {}) {
    const D = dur ?? this.idleDur;
    const t1 = D * at;
    const times = [0, t1, t1 + span / 2, t1 + span, D];
    const vals = [
      [1, 1, 1], [1, 1, 1], [1, 0.06, 1], [1, 1, 1], [1, 1, 1],
    ];
    this.channels.push({ node, path: "scale", times, vals, vec: 3 });
  }

  // ---- export ----

  toGLB() {
    // node indices in creation order; root first
    const nodeIndex = new Map(this.nodes.map((n, i) => [n, i]));

    // resolve meshes: a node either owns merged parts or links to another node
    const buffers = []; // {data: Uint8Array, target}
    const accessors = [];
    const bufferViews = [];
    let offset = 0;

    const pushView = (bytes, target) => {
      const pad = (4 - (offset % 4)) % 4;
      if (pad) buffers.push({ data: new Uint8Array(pad), target: 0 });
      offset += pad;
      const view = { buffer: 0, byteOffset: offset, byteLength: bytes.byteLength };
      if (target) view.target = target;
      bufferViews.push(view);
      buffers.push({ data: bytes, target });
      offset += bytes.byteLength;
      return bufferViews.length - 1;
    };

    const pushAccessor = (typed, componentType, type, count, extras = {}, target) => {
      const view = pushView(new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength), target);
      accessors.push({ bufferView: view, componentType, type, count, ...extras });
      return accessors.length - 1;
    };

    const meshes = [];
    const meshKey = new Map(); // src node -> mesh index
    const meshDedup = new Map(); // content hash -> mesh index

    // First pass: nodes that own parts
    const owners = this.nodes.filter((n) => !n.meshOf && n.parts.length > 0);
    for (const node of owners) {
      const positions = [];
      const normals = [];
      const colors = [];
      const indices = [];
      for (const part of node.parts) {
        const built = buildPart(part, part.smooth ?? this.smooth);
        const base = positions.length / 3;
        for (const v of built.position) positions.push(v);
        for (const v of built.normal) normals.push(v);
        for (const v of built.color) colors.push(v);
        for (const i of built.index) indices.push(base + i);
      }
      if (indices.length === 0) continue; // every face was degenerate: no mesh
      const vCount = positions.length / 3;
      const posMin = [Infinity, Infinity, Infinity];
      const posMax = [-Infinity, -Infinity, -Infinity];
      for (let i = 0; i < positions.length; i += 3)
        for (let k = 0; k < 3; k += 1) {
          posMin[k] = Math.min(posMin[k], positions[i + k]);
          posMax[k] = Math.max(posMax[k], positions[i + k]);
        }
      const posArr = new Float32Array(positions);
      const nrmArr = new Int8Array(normals.length);
      for (let i = 0; i < normals.length; i += 1) nrmArr[i] = Math.round(normals[i] * 127);
      const colArr = new Uint8Array(colors);
      const idxArr = new Uint16Array(indices);

      /* Mesh instancing. A pack this size repeats the same little shape over
         and over — six identical legs, twelve identical petals, a mirrored
         pair of eyes — and each one used to get its own copy of the bytes.
         Nodes whose geometry is byte-identical now share one mesh, which is
         what `linkMesh` did by hand and this does for every case nobody
         remembered to link. */
      const hashKey = `${vCount}:${indices.length}:${fnvBytes(posArr)}:${fnvBytes(nrmArr)}:${fnvBytes(colArr)}:${fnvBytes(idxArr)}`;
      const seen = meshDedup.get(hashKey);
      if (seen !== undefined) {
        meshKey.set(node, seen);
        continue;
      }

      const mesh = {
        primitives: [
          {
            attributes: {
              POSITION: pushAccessor(posArr, 5126, "VEC3", vCount, { min: posMin, max: posMax }, 34962),
              NORMAL: pushAccessor(nrmArr, 5120, "VEC3", vCount, { normalized: true }, 34962),
              COLOR_0: pushAccessor(colArr, 5121, "VEC3", vCount, { normalized: true }, 34962),
            },
            indices: pushAccessor(idxArr, 5123, "SCALAR", indices.length, {}, 34963),
            material: 0,
            mode: 4,
          },
        ],
      };
      meshes.push(mesh);
      meshKey.set(node, meshes.length - 1);
      meshDedup.set(hashKey, meshes.length - 1);
    }
    for (const node of this.nodes) {
      if (node.meshOf && node.parts.length === 0) {
        // link node: reference the source's mesh (source must own parts)
        const src = node.meshOf;
        if (meshKey.has(src)) node._meshIndex = meshKey.get(src);
      }
    }
    for (const node of owners) if (meshKey.has(node)) node._meshIndex = meshKey.get(node);

    // nodes
    const gltfNodes = this.nodes.map((node) => {
      const out = { name: node.name };
      if (node._meshIndex !== undefined) out.mesh = node._meshIndex;
      if (node.at.some((v) => v !== 0)) out.translation = [...node.at];
      if (node.rot) out.rotation = eulerToQuat(node.rot);
      if (node.scale.some((v) => v !== 1)) out.scale = [...node.scale];
      return out;
    });
    // children lists
    for (const node of this.nodes) {
      if (node.parent && node.parent !== node) {
        const p = nodeIndex.get(node.parent);
        if (p !== undefined && node.parent !== this.root) {
          gltfNodes[p].children = gltfNodes[p].children ?? [];
          gltfNodes[p].children.push(nodeIndex.get(node));
        }
      }
    }
    const roots = this.nodes
      .filter((n) => n.parent === this.root && n !== this.root)
      .map((n) => nodeIndex.get(n));

    // animations
    const samplers = [];
    const gltfChannels = [];
    for (const ch of this.channels) {
      const input = pushAccessor(
        new Float32Array(ch.times),
        5126,
        "SCALAR",
        ch.times.length,
        { min: [Math.min(...ch.times)], max: [Math.max(...ch.times)] },
      );
      const flat = ch.vals.flat();
      const output = pushAccessor(new Float32Array(flat), 5126, ch.vec === 4 ? "VEC4" : "VEC3", ch.vals.length);
      samplers.push({ input, output, interpolation: "LINEAR" });
      gltfChannels.push({
        sampler: samplers.length - 1,
        target: { node: nodeIndex.get(ch.node), path: ch.path },
      });
    }

    /* Appended last so every node index an animation channel targets stays put. */
    let scene_root = roots;
    if (this.ground_offset) {
      gltfNodes.push({ name: "ground", translation: [0, this.ground_offset, 0], children: roots });
      scene_root = [gltfNodes.length - 1];
    }

    const gltf = {
      asset: { version: "2.0", generator: "yclap species-model builder (hand-rolled, no deps)" },
      scene: 0,
      scenes: [{ name: this.name, nodes: scene_root }],
      nodes: gltfNodes,
      meshes,
      materials: [
        {
          name: "flat",
          pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], metallicFactor: 0, roughnessFactor: 1 },
          doubleSided: true,
        },
      ],
      accessors,
      bufferViews,
      buffers: [{ byteLength: offset }],
    };
    if (gltfChannels.length) {
      gltf.animations = [{ name: "idle", channels: gltfChannels, samplers }];
    }

    // GLB container
    const jsonBytes = strToU8(JSON.stringify(gltf), 0x20);
    const binPad = (4 - (offset % 4)) % 4;
    const bin = new Uint8Array(offset + binPad);
    let o = 0;
    for (const b of buffers) {
      bin.set(b.data, o);
      o += b.data.byteLength;
    }
    const total = 12 + 8 + jsonBytes.length + 8 + bin.length;
    const out = new Uint8Array(total);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, 0x46546c67, true); // "glTF"
    dv.setUint32(4, 2, true);
    dv.setUint32(8, total, true);
    dv.setUint32(12, jsonBytes.length, true);
    dv.setUint32(16, 0x4e4f534a, true); // "JSON"
    out.set(jsonBytes, 20);
    const binHeaderAt = 20 + jsonBytes.length;
    dv.setUint32(binHeaderAt, bin.length, true);
    dv.setUint32(binHeaderAt + 4, 0x004e4942, true); // "BIN\0"
    out.set(bin, binHeaderAt + 8);
    return out;
  }
}

const DEGEN_EPS = 1e-12;
/** cos(55 deg) — how far a facet may sit from its smoothing group's average. */
const COS_APEX = Math.cos((55 * Math.PI) / 180);

const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));

/**
 * Turn one transformed part into interleaved vertex arrays, dropping every
 * zero-area triangle on the way.
 *
 * A degenerate face carries a zero-length normal, which is why the audit's
 * "degenerate triangles" and "non-unit normals" counts were the same 83 models:
 * one defect, counted twice. Filtering here rather than in each primitive means
 * a caller who scales a part flat, or hands in a collapsed profile, still ships
 * clean geometry.
 *
 * `smooth` false → the classic flat look: three fresh vertices per face, each
 * carrying the face normal. `smooth` true/number → vertices are welded by
 * position and their normals averaged, but only across faces that meet at less
 * than the crease angle, so a cylinder's cap rim and a leaf's fold stay sharp
 * while its curved flank reads round. Welding also collapses the 3x vertex
 * duplication, so a smooth part is markedly smaller than a flat one.
 */
function buildPart(part, smooth) {
  const P = part.positions;
  const colorAt = (p) => (part.colorFn ? part.colorFn(p) : (part.color ?? [0.8, 0.8, 0.8]));
  const face = [];
  for (const [a, b, c] of part.indices) {
    const A = P[a], B = P[b], C = P[c];
    const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2];
    const vx = C[0] - A[0], vy = C[1] - A[1], vz = C[2] - A[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (!(len > DEGEN_EPS)) continue;
    face.push({ v: [a, b, c], n: [nx / len, ny / len, nz / len] });
  }

  const position = [], normal = [], color = [], index = [];
  if (!smooth) {
    let n = 0;
    for (const f of face) {
      for (const vi of f.v) {
        const p = P[vi];
        position.push(p[0], p[1], p[2]);
        normal.push(f.n[0], f.n[1], f.n[2]);
        const col = colorAt(p);
        color.push(clamp255(col[0]), clamp255(col[1]), clamp255(col[2]));
      }
      index.push(n, n + 1, n + 2);
      n += 3;
    }
    return { position, normal, color, index };
  }

  const cosCrease = Math.cos(((typeof smooth === "number" ? smooth : 40) * Math.PI) / 180);
  const keyOf = (p) => `${p[0].toFixed(6)},${p[1].toFixed(6)},${p[2].toFixed(6)}`;
  /* Faces touching each welded position. */
  const at = new Map();
  face.forEach((f, fi) => {
    for (const vi of f.v) {
      const k = keyOf(P[vi]);
      let bucket = at.get(k);
      if (!bucket) { bucket = { p: P[vi], face: [] }; at.set(k, bucket); }
      bucket.face.push(fi);
    }
  });
  /* Per position, cluster its faces by normal agreement; each cluster becomes
     one vertex, so a crease splits into two vertices with two normals. */
  const slot = new Map(); // `${posKey}#${clusterRoot}` -> output vertex index
  const cluster = new Map(); // posKey -> Map(faceIndex -> clusterRoot)
  for (const [k, bucket] of at) {
    const list = bucket.face;
    const parent = list.map((_, i) => i);
    const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = face[list[i]].n, b = face[list[j]].n;
        if (a[0] * b[0] + a[1] * b[1] + a[2] * b[2] >= cosCrease) {
          const ra = find(i), rb = find(j);
          if (ra !== rb) parent[ra] = rb;
        }
      }
    }
    const member = new Map(); // cluster root -> face indices
    const map = new Map();
    list.forEach((fi, i) => {
      const r = find(i);
      map.set(fi, r);
      if (!member.has(r)) member.set(r, []);
      member.get(r).push(fi);
    });
    /* Fan-apex guard. A cone's tip is one position shared by every side facet;
       each neighbouring pair meets gently enough to weld, so the whole ring
       chains into one cluster whose averaged normal points straight up the
       axis — nowhere near any surface it is meant to shade, and the tip renders
       as a dark pinprick. A face that disagrees with its own cluster's average
       by more than this keeps its own normal. */
    for (const [r, fl] of [...member]) {
      if (fl.length < 3) continue;
      const avg = [0, 0, 0];
      for (const fi of fl) { avg[0] += face[fi].n[0]; avg[1] += face[fi].n[1]; avg[2] += face[fi].n[2]; }
      const al = Math.hypot(avg[0], avg[1], avg[2]) || 1;
      const keep = [];
      for (const fi of fl) {
        const n = face[fi].n;
        if ((n[0] * avg[0] + n[1] * avg[1] + n[2] * avg[2]) / al >= COS_APEX) keep.push(fi);
        else { member.set(`${r}!${fi}`, [fi]); map.set(fi, `${r}!${fi}`); }
      }
      if (keep.length) member.set(r, keep);
      else member.delete(r);
    }
    const acc = new Map();
    for (const [r, fl] of member) {
      const sum = [0, 0, 0];
      for (const fi of fl) { sum[0] += face[fi].n[0]; sum[1] += face[fi].n[1]; sum[2] += face[fi].n[2]; }
      acc.set(r, sum);
    }
    cluster.set(k, map);
    const col = colorAt(bucket.p);
    for (const [r, sum] of acc) {
      const len = Math.hypot(sum[0], sum[1], sum[2]) || 1;
      slot.set(`${k}#${r}`, position.length / 3);
      position.push(bucket.p[0], bucket.p[1], bucket.p[2]);
      normal.push(sum[0] / len, sum[1] / len, sum[2] / len);
      color.push(clamp255(col[0]), clamp255(col[1]), clamp255(col[2]));
    }
  }
  face.forEach((f, fi) => {
    for (const vi of f.v) {
      const k = keyOf(P[vi]);
      index.push(slot.get(`${k}#${cluster.get(k).get(fi)}`));
    }
  });
  return { position, normal, color, index };
}

/** FNV-1a over a typed array's bytes — the mesh-instancing content key. */
function fnvBytes(typed) {
  const b = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
  let h = 2166136261;
  for (let i = 0; i < b.length; i += 1) {
    h ^= b[i];
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function eulerToQuat([rx, ry, rz]) {
  // applied as Rz*Ry*Rx (matching mCompose order rotX -> rotY -> rotZ)
  const qx = quatAxisAngle([1, 0, 0], rx);
  const qy = quatAxisAngle([0, 1, 0], ry);
  const qz = quatAxisAngle([0, 0, 1], rz);
  return quatMul(qz, quatMul(qy, qx));
}

function strToU8(str, padByte) {
  const enc = new TextEncoder();
  const raw = enc.encode(str);
  const pad = (4 - (raw.length % 4)) % 4;
  const out = new Uint8Array(raw.length + pad);
  out.set(raw);
  if (pad) out.fill(padByte, raw.length);
  return out;
}
