/**
 * Fauna archetypes. Every builder has the shape (k, col, opt) and composes a
 * chibi creature: big glossy eyes, stubby limbs, one looping "idle" clip.
 * `col` = {base, belly, dark, accent} resolved by the orchestrator; `opt`
 * carries the per-species shape tweaks from the route/override table.
 *
 * Convention: creature faces +Z, ground y=0, whole model < 1 unit tall.
 *
 * Three rules everything below obeys, because audit.mjs measures all three:
 *
 *  1. A part's node origin sits at its JOINT and its geometry runs away from
 *     that origin along +Y. Put the joint inside the parent and the part
 *     cannot float loose, whatever pose it takes.
 *  2. Pose lives on the NODE, not baked into the mesh, so child parts inherit
 *     it. (kit's antennae bake the stalk tilt into the mesh and then hang the
 *     tip ball off an un-tilted node — which is exactly why long-horned
 *     beetles used to ship with two floating balls.)
 *  3. Shape is a pure function of the species name via `vary`, so the same
 *     species always rebuilds byte for byte, and two species in one family
 *     differ in structure rather than only in tint.
 */
import { APP, shade, mix, hex, icosphere } from "./kit.mjs";

const ink = APP.ink;
const paper = APP.paper;
const darkOf = (col) => col.dark ?? shade(col.base, -0.22);
const bellyOf = (col) => col.belly ?? shade(col.base, 0.32);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/**
 * Legs, antennae and other chitin. `col.dark` is a palette ACCENT, so routing
 * it straight to a leg gave the pack purple, teal and orange limbs on animals
 * whose legs are plainly brown-black. Deriving the limb tone from the body
 * keeps a species' own colour without inventing a second one.
 */
const limbOf = (col) => shade(col.base, -0.42);
/** The species this model is being built for — for the handful of one-off fixes. */
const who = (k) => k.spec?.species_code ?? "";

/* ── geometry ─────────────────────────────────────────────────────────────
 * kit's `cone` is a cylinder with a zero top radius, so its whole top ring
 * collapses onto one point and every cap triangle has zero area — most of the
 * pack's degenerate models came from that alone. Everything here is a lathe
 * with a real apex vertex. Rings default to 10 segments (36 degrees between
 * neighbouring faces), under the audit's 40-degree crease threshold, where
 * kit's 7-segment cylinder (51 degrees) and its subdivision-0 icosphere (42
 * degrees) are both over it.
 */

/** Ellipsoid at absolute size, centred on the local origin. */
function ballGeo(rx, ry, rz, subdiv = 1) {
  const src = icosphere(subdiv);
  return {
    positions: src.positions.map((p) => [p[0] * rx, p[1] * ry, p[2] * rz]),
    indices: src.indices,
  };
}

/**
 * Surface of revolution around +Y from a [y, radius] profile, bottom to top.
 * Radius 0 makes that entry a real apex vertex. `zScale` squashes the section
 * so one profile serves both a round leg and a flat blade. Winding is
 * outward-consistent, so adjacent face normals agree and the crease metric
 * measures the shape rather than a flipped triangle.
 */
function latheGeo(profile, seg = 10, zScale = 1) {
  const positions = [];
  const ring = [];
  for (const [y, r] of profile) {
    if (r <= 1e-7) {
      ring.push({ apex: true, i: positions.length });
      positions.push([0, y, 0]);
    } else {
      const i0 = positions.length;
      for (let j = 0; j < seg; j += 1) {
        const a = (j / seg) * Math.PI * 2;
        positions.push([Math.cos(a) * r, y, Math.sin(a) * r * zScale]);
      }
      ring.push({ apex: false, i0 });
    }
  }
  const indices = [];
  for (let s = 0; s + 1 < ring.length; s += 1) {
    const A = ring[s];
    const B = ring[s + 1];
    if (A.apex && B.apex) continue;
    if (A.apex) {
      for (let j = 0; j < seg; j += 1) indices.push([A.i, B.i0 + j, B.i0 + ((j + 1) % seg)]);
    } else if (B.apex) {
      for (let j = 0; j < seg; j += 1) indices.push([A.i0 + j, B.i, A.i0 + ((j + 1) % seg)]);
    } else {
      for (let j = 0; j < seg; j += 1) {
        const a0 = A.i0 + j;
        const a1 = A.i0 + ((j + 1) % seg);
        const b0 = B.i0 + j;
        const b1 = B.i0 + ((j + 1) % seg);
        indices.push([a0, b0, a1], [a1, b0, b1]);
      }
    }
  }
  return { positions, indices };
}

/** Tapered limb: joint at y=0, tip at y=len. Two bands, so it stays cheap. */
function spindleGeo(r, len, { seg = 10, bulge = 0.45, tip = 0, zScale = 1 } = {}) {
  const profile = [[0, 0], [len * bulge, r]];
  if (tip > 1e-7) profile.push([len, r * tip], [len, 0]);
  else profile.push([len, 0]);
  return latheGeo(profile, seg, zScale);
}

/** Cone: flat base disc at y=0, apex at y=h — beaks, horns, stings, spikes. */
function coneGeo(r, h, { seg = 10, zScale = 1, waist = 0.55 } = {}) {
  return latheGeo([[0, 0], [0, r], [h * 0.5, r * waist], [h, 0]], seg, zScale);
}

/** Dome: flat rim at y=0, apex at y=h — shells, wing cases, caps. */
function domeGeo(r, h, { seg = 10, zScale = 1 } = {}) {
  return latheGeo([[0, 0], [0, r], [h * 0.42, r * 0.92], [h * 0.78, r * 0.62], [h, 0]], seg, zScale);
}

/**
 * Flat blade from a closed outline of [x, z] points, star-shaped about the
 * origin. Wings, fins, tail feathers: the silhouette is data, so a species can
 * own its outline instead of sharing one ellipsoid with forty others.
 */
function bladeGeo(point, thick) {
  const n = point.length;
  const positions = [];
  for (const [x, z] of point) positions.push([x, thick / 2, z]);
  for (const [x, z] of point) positions.push([x, -thick / 2, z]);
  const cTop = positions.length;
  positions.push([0, thick / 2, 0]);
  const cBot = positions.length;
  positions.push([0, -thick / 2, 0]);
  const indices = [];
  for (let i = 0; i < n; i += 1) {
    const j = (i + 1) % n;
    indices.push([cTop, i, j]);
    indices.push([cBot, n + j, n + i]);
    indices.push([i, n + i, j], [j, n + i, n + j]);
  }
  return { positions, indices };
}

/**
 * An ellipse whose radius is modulated by a few harmonics. Driving these from
 * the species hash is what makes two moths in one family read as different
 * animals instead of one model wearing two tints.
 */
function bladeOutline(rx, rz, o = {}) {
  const { n = 16, taper = 0, notch = 0, scallop = 0, sweep = 0 } = o;
  const point = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const m = 1 + taper * Math.cos(a) + notch * Math.cos(2 * a) + scallop * 0.12 * Math.cos(5 * a);
    point.push([
      Math.cos(a) * rx * m,
      Math.sin(a) * rz * m + sweep * rz * Math.cos(a),
    ]);
  }
  return point;
}

/**
 * Lepidopteran wing outlines, as normalised polygons in (span, chord) with the
 * shoulder near the origin so the blade's fan triangulation stays star-shaped.
 *
 * A butterfly's two wings are NOT the same shape: the forewing is a swept
 * triangle with a pointed apex and the hindwing is a rounded lobe carried
 * behind and below it. Building both from one symmetric ellipse is what made
 * all 44 read as a glider with two identical planks bolted on.
 */
const FOREWING = [
  [-0.13, 0.09], [0.10, 0.40], [0.44, 0.50], [0.78, 0.43], [1.00, 0.12],
  [0.86, -0.26], [0.52, -0.45], [0.20, -0.43], [-0.09, -0.21],
];
const HINDWING = [
  [-0.15, 0.15], [0.17, 0.39], [0.55, 0.43], [0.85, 0.23], [0.92, -0.17],
  [0.70, -0.51], [0.36, -0.59], [0.05, -0.43], [-0.14, -0.16],
];
/** Scale one of those to a span/chord, with a little species-driven waviness. */
function wingShape(base, span, chord, { scallop = 0, apex = 1, sweep = 0 } = {}) {
  return base.map(([x, z], i) => [
    x * span * (x > 0.6 ? apex : 1),
    (z + sweep * x) * chord * (1 + scallop * 0.16 * Math.cos(i * 2.2)),
  ]);
}

/* ── node helpers ─────────────────────────────────────────────────────────── */

/**
 * One geometry on one node. `at` is the joint in the parent's frame; `rot` is
 * an euler carried by the NODE (children inherit it, and swing({base}) can
 * animate around it); `off` shifts the mesh inside the node's own frame.
 */
function put(k, parent, name, geo, o = {}) {
  const node = k.cute.node(name, { parent, at: o.at ?? [0, 0, 0], rot: o.rot ?? null });
  k.cute.add(node, geo, {
    at: o.off ?? [0, 0, 0],
    rotX: o.rotX ?? 0,
    rotY: o.rotY ?? 0,
    rotZ: o.rotZ ?? 0,
    color: o.color,
    colorFn: o.colorFn,
  });
  return node;
}

/**
 * `merge: true` adds the geometry to the PARENT's mesh instead of giving it its
 * own node. Pure decoration — a stripe, a spot, an eye's pupil — never animates
 * on its own, and every extra mesh costs about a kilobyte of glTF bookkeeping
 * before a single triangle is written. Structure gets a node; paint does not.
 */
function ball(k, parent, name, o) {
  const geo = ballGeo(o.rx ?? o.r, o.ry ?? o.r, o.rz ?? o.r, o.subdiv ?? 1);
  if (o.merge) {
    k.cute.add(parent, geo, {
      at: o.at ?? [0, 0, 0], rotX: o.rotX ?? 0, rotY: o.rotY ?? 0, rotZ: o.rotZ ?? 0,
      color: o.color, colorFn: o.colorFn,
    });
    return parent;
  }
  return put(k, parent, name, geo, o);
}

function spindle(k, parent, name, o) {
  const geo = spindleGeo(o.r, o.len, {
    seg: o.seg ?? 10, bulge: o.bulge ?? 0.45, tip: o.tip ?? 0, zScale: o.zScale ?? 1,
  });
  if (o.merge) {
    k.cute.add(parent, geo, {
      at: o.at ?? [0, 0, 0],
      rotX: o.rot ? o.rot[0] : (o.rotX ?? 0),
      rotY: o.rot ? o.rot[1] : (o.rotY ?? 0),
      rotZ: o.rot ? o.rot[2] : (o.rotZ ?? 0),
      color: o.color,
    });
    return parent;
  }
  return put(k, parent, name, geo, o);
}

function cone(k, parent, name, o) {
  const geo = coneGeo(o.r, o.h, { seg: o.seg ?? 10, zScale: o.zScale ?? 1, waist: o.waist ?? 0.55 });
  if (o.merge) {
    k.cute.add(parent, geo, {
      at: o.at ?? [0, 0, 0], rotX: o.rotX ?? 0, rotY: o.rotY ?? 0, rotZ: o.rotZ ?? 0, color: o.color,
    });
    return parent;
  }
  return put(k, parent, name, geo, o);
}

function dome(k, parent, name, o) {
  return put(k, parent, name, domeGeo(o.r, o.h, { seg: o.seg ?? 10, zScale: o.zScale ?? 1 }), o);
}

/**
 * Keep a mesh's own box straddling its joint. A blade is offset away from the
 * node so it reaches out from the shoulder, and if that offset exceeds the
 * blade's own half-extent the part stops touching its parent — which is how a
 * butterfly ends up with two floating wings. Clamping the offset makes that
 * failure unrepresentable rather than merely unlikely.
 */
function clampOff(geo, off) {
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const p of geo.positions) {
    for (let i = 0; i < 3; i += 1) {
      if (p[i] < lo[i]) lo[i] = p[i];
      if (p[i] > hi[i]) hi[i] = p[i];
    }
  }
  return off.map((d, i) => clamp(d, -hi[i] * 0.9, -lo[i] * 0.9));
}

function blade(k, parent, name, o) {
  const geo = bladeGeo(o.outline, o.thick ?? 0.012);
  return put(k, parent, name, geo, { ...o, off: clampOff(geo, o.off ?? [0, 0, 0]) });
}

/**
 * A joint that holds a fixed pose AND animates on one axis: the outer node
 * carries the rest euler, the inner node carries the animated channel. Without
 * the split, `swing` overwrites the rest rotation with a single-axis one and
 * flattens every tilted wing the moment the clip plays.
 */
function hinge(k, parent, name, { at, rot = null, axis = "z", base = 0, amp = 0, dur, phase = 0 }) {
  const outer = k.cute.node(`${name}-j`, { parent, at, rot });
  const rest = axis === "x" ? [base, 0, 0] : axis === "y" ? [0, base, 0] : [0, 0, base];
  const inner = k.cute.node(name, { parent: outer, at: [0, 0, 0], rot: amp ? null : rest });
  if (amp) k.cute.swing(inner, { axis, base, amp, dur: dur ?? k.dur, phase });
  return inner;
}

/* ── deterministic variation ──────────────────────────────────────────────── */

/**
 * Every shape decision comes through here, so it is a pure function of the
 * species name: the same species always rebuilds byte for byte. `label` names
 * the decision, which keeps two knobs on one animal independent.
 */
/**
 * A small deterministic tone shift on the base colour. The palette pools are
 * short, so several species land on the same entry; this keeps them from being
 * the same colour as well as the same size. Kept narrow enough that a
 * hand-written real-world colour still reads as itself.
 */
function toned(k, col, spread = 0.12) {
  const t = (k.hash("tone") - 0.5) * 2 * spread;
  return { ...col, base: shade(col.base, t) };
}

function vary(k) {
  const h = (label) => k.hash(label);
  return {
    h,
    f: (label, lo, hi) => lo + (hi - lo) * h(label),
    i: (label, lo, hi) => Math.min(hi, lo + Math.floor(h(label) * (hi - lo + 1))),
    pick: (label, list) => list[Math.min(list.length - 1, Math.floor(h(label) * list.length))],
    on: (label, p = 0.5) => h(label) < p,
    sign: (label) => (h(label) < 0.5 ? -1 : 1),
  };
}

/* ── shared creature parts ────────────────────────────────────────────────── */

/** A glossy bead eye pair with pupil and catch-light. */
function beadEyes(k, parent, o) {
  const { r, at, gap, color = paper, pupil = ink, spark = true, subdiv = 1, name = "eye" } = o;
  const out = [];
  for (const s of [1, -1]) {
    const tag = s > 0 ? "l" : "r";
    const e = ball(k, parent, `${name}-${tag}`, {
      rx: r, ry: r * (o.squash ?? 1), rz: r * (o.bulge ?? 1),
      at: [at[0] + s * gap, at[1], at[2]], color, subdiv,
    });
    ball(k, e, `${name}-pupil-${tag}`, { merge: true, r: r * (o.pupilR ?? 0.46), at: [s * r * 0.22, r * 0.06, r * 0.7], color: pupil, subdiv: 0 });
    if (spark) ball(k, e, `${name}-spark-${tag}`, { merge: true, r: r * 0.22, at: [s * r * 0.42, r * 0.4, r * 0.62], color: paper, subdiv: 0 });
    out.push(e);
  }
  return out;
}

/**
 * A pair of antennae as a real chain: every joint is a node, so the tip rides
 * the stalk instead of hanging in the air beside it. `form` changes the
 * silhouette (club, feather, hook, thread, elbow), which is one of the biggest
 * structural differences between two otherwise identical insects.
 */
function antennaPair(k, parent, o) {
  const {
    at, len, r, gap = 0, spread = 0.5, pitch = -0.2, joint = 2, color,
    form = "club", wiggle = true, name = "antenna", barb = 0,
  } = o;
  const tip = [];
  for (const s of [1, -1]) {
    const tag = s > 0 ? "l" : "r";
    let parentNode = parent;
    let base = [at[0] + s * gap, at[1], at[2]];
    const L = len / joint;
    for (let i = 0; i < joint; i += 1) {
      const rz = s * -(i === 0 ? spread : spread * (form === "elbow" ? 1.1 : 0.35));
      const node = i === 0
        ? hinge(k, parentNode, `${name}-${tag}${i}`, {
          at: base, rot: null, axis: "z", base: rz,
          amp: wiggle ? 0.13 : 0, dur: k.dur, phase: s > 0 ? 0 : 0.5,
        })
        : k.cute.node(`${name}-${tag}${i}`, { parent: parentNode, at: base, rot: [pitch * 0.6, 0, rz] });
      const rr = r * (1 - i * 0.12);
      k.cute.add(node, spindleGeo(rr, L, { seg: 10, bulge: 0.5, tip: 0 }), { color });
      for (let b = 0; b < (i === joint - 1 ? barb : 0); b += 1) {
        const t = (b + 1) / (barb + 1);
        for (const bs of [1, -1]) {
          spindle(k, node, `${name}-${tag}${i}barb${b}${bs}`, {
            merge: true, r: rr * 0.45, len: L * (0.55 - Math.abs(t - 0.5) * 0.5), at: [0, L * t, 0],
            rot: [0, 0, bs * 1.35], color, seg: 5,
          });
        }
      }
      parentNode = node;
      base = [0, L * 0.9, 0];
    }
    if (form === "club" || form === "hook") {
      ball(k, parentNode, `${name}-${tag}-tip`, {
        merge: true, rx: r * 2.2, ry: r * (form === "hook" ? 3.4 : 2.4), rz: r * 2.2,
        at: [0, L * 0.86, 0], rot: form === "hook" ? [0.9, 0, 0] : null,
        color: shade(color, -0.18), subdiv: 0,
      });
    }
    tip.push(parentNode);
  }
  return tip;
}

/**
 * A jointed limb chain. Each segment is a node hinged at the previous tip and
 * overlapping it, so a leg is one connected run from the body to the foot.
 */
/** Rotation matrix for a node euler, matching glb.mjs's Rz*Ry*Rx order. */
function eulerMat([rx, ry, rz]) {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  return [
    [cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx],
    [sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx],
    [-sy, cy * sx, cy * cx],
  ];
}
const matMul3 = (a, b) => a.map((row, i) => [0, 1, 2].map((j) => row[0] * b[0][j] + row[1] * b[1][j] + row[2] * b[2][j]));
const matApply = (m, p) => [
  m[0][0] * p[0] + m[0][1] * p[1] + m[0][2] * p[2],
  m[1][0] * p[0] + m[1][1] * p[1] + m[1][2] * p[2],
  m[2][0] * p[0] + m[2][1] * p[1] + m[2][2] * p[2],
];

/**
 * A jointed limb. Each segment is hinged at the previous tip and overlaps it,
 * so a leg is one connected run from the body to the foot.
 *
 * `merge` bakes the segments past the first into the first one's mesh. A leg
 * never animates joint by joint here, and a glTF mesh costs about a kilobyte of
 * bookkeeping before its first triangle — on a spider that is sixteen meshes of
 * pure overhead. Pass merge only when nothing needs to hang off a later joint.
 */
function legChain(k, parent, name, { at, r, seg, color, subdiv = 1, merge = false }) {
  let parentNode = parent;
  let base = at;
  const node = [];
  let R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  let T = [0, 0, 0];
  for (let i = 0; i < seg.length; i += 1) {
    const s = seg[i];
    const rot = [s.rx ?? 0, s.ry ?? 0, s.rz ?? 0];
    const rr = r * (s.taper ?? 1);
    const geo = spindleGeo(rr, s.len, { seg: s.round ?? 10, bulge: s.bulge ?? 0.45, tip: s.tip ?? 0 });
    if (merge && i > 0) {
      T = [0, 1, 2].map((a) => T[a] + matApply(R, base)[a]);
      R = matMul3(R, eulerMat(rot));
      const moved = geo.positions.map((q) => {
        const w = matApply(R, q);
        return [T[0] + w[0], T[1] + w[1], T[2] + w[2]];
      });
      k.cute.add(node[0], { positions: moved, indices: geo.indices }, { color: s.color ?? color });
      node.push(node[0]);
    } else {
      const n = k.cute.node(`${name}${i}`, { parent: parentNode, at: base, rot });
      k.cute.add(n, geo, { color: s.color ?? color });
      node.push(n);
      parentNode = n;
      R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
      T = [0, 0, 0];
    }
    base = [0, s.len * 0.88, 0];
  }
  return node;
}

/**
 * Six insect legs in three pairs. `posture` moves the whole animal's stance —
 * sprawled, upright or clinging — which shifts how its mass sits up the height
 * of the model, one of the four things the audit's shape signature reads.
 */
function insectLegs(k, parent, o) {
  const {
    at, gap = 0.02, len = 0.16, r = 0.012, pair = 3, spanZ = 0.09,
    splay = 1.2, bend = 0.9, joint = 2, color, name = "leg", taper = 0.8, subdiv = 1,
  } = o;
  const merge = o.merge ?? true;
  const out = [];
  for (let i = 0; i < pair; i += 1) {
    const t = pair === 1 ? 0 : i / (pair - 1) - 0.5;
    const dz = -t * spanZ * 2;
    const lenI = len * (o.lenMix ? 1 + o.lenMix * -t : 1);
    for (const s of [1, -1]) {
      const seg = [];
      seg.push({ len: lenI * (joint > 1 ? 0.55 : 1), rz: s * -splay, rx: t * 1.1, taper: 1 });
      if (joint > 1) seg.push({ len: lenI * 0.55, rz: s * -bend, taper });
      if (joint > 2) seg.push({ len: lenI * 0.3, rz: s * -bend * 0.5, taper: taper * 0.7 });
      out.push(legChain(k, parent, `${name}${i}-${s > 0 ? "l" : "r"}`, {
        at: [at[0] + s * gap, at[1], at[2] + dz], r, seg, color, subdiv, merge,
      }));
    }
  }
  return out;
}

/** A mirrored pair of blade wings hinged at the shoulder. */
function bladeWings(k, parent, o) {
  const {
    at, gap = 0, outline, thick = 0.012, reach, tilt = 0, yaw = 0, roll = 0,
    color, colorFn, name = "wing", flap = 0, dur = 0.8, phase = 0,
  } = o;
  const out = [];
  for (const s of [1, -1]) {
    const tag = s > 0 ? "l" : "r";
    const node = hinge(k, parent, `${name}-${tag}`, {
      at: [at[0] + s * gap, at[1], at[2]],
      rot: [tilt, s * yaw, 0],
      axis: "z", base: s * roll, amp: flap ? s * flap : 0, dur, phase,
    });
    const geo = bladeGeo(outline.map(([x, z]) => [x * s, z]), thick);
    k.cute.add(node, geo, { at: clampOff(geo, [s * reach, 0, 0]), color, colorFn });
    out.push(node);
  }
  return out;
}

/* ── birds ────────────────────────────────────────────────────────────────
 * 41 species share this builder, so the hash drives real anatomy: body
 * plumpness, neck length and its segment count, bill form and length, wing
 * outline, how many tail feathers and how they splay, crest, wing bars,
 * cheek patch, toe count. Known species keep their hand-written overrides.
 */
function bird(k, col, opt = {}) {
  const v = vary(k);
  col = toned(k, col);
  const dark = darkOf(col);
  const belly = bellyOf(col);
  const wingCol = col.wing ?? dark;
  const legCol = col.leg ?? shade(col.accent ?? APP.orange, -0.15);

  const legH = opt.legH ?? v.f("legh", 0.06, 0.18);
  const fat = opt.plump ? v.f("fat", 1.04, 1.2) : v.f("fat", 0.82, 1.04);
  const bx = 0.24 * fat;
  const by = 0.23 * fat * v.f("by", 0.9, 1.12);
  const bz = 0.3 * v.f("bz", 0.86, 1.2);
  const bodyY = legH + by * 0.92;
  const body = ball(k, k.root, "body", {
    rx: bx, ry: by, rz: bz, at: [0, bodyY, 0], rot: [v.f("pitch", -0.32, 0.3), 0, 0],
    color: col.base, subdiv: 1,
  });
  ball(k, body, "belly", { rx: bx * 0.76, ry: by * 0.72, rz: bz * 0.74, at: [0, -by * 0.32, bz * 0.24], color: belly });

  // mantle plates over the back — 0 to 2, so part count moves with species
  const mantle = v.i("mantle", 0, 2);
  for (let i = 0; i < mantle; i += 1) {
    ball(k, body, `mantle${i}`, {
      rx: bx * (0.8 - i * 0.18), ry: by * 0.34, rz: bz * (0.58 - i * 0.14),
      at: [0, by * 0.56, -bz * (0.08 + i * 0.24)], color: shade(wingCol, i % 2 ? 0.16 : -0.08),
    });
  }

  const neckLen = opt.neck ?? (v.on("hasneck", 0.3) ? v.f("neck", 0.08, 0.3) : 0);
  const headR = opt.headR ?? v.f("headr", 0.18, 0.29);
  let headY = by * 0.66 + headR * 0.52;
  let headZ = bz * 0.18;
  if (neckLen > 0.02) {
    const nseg = clamp(Math.round(neckLen / 0.09), 1, 4);
    const nr = v.f("neckr", 0.055, 0.085);
    for (let i = 0; i < nseg; i += 1) {
      const t = (i + 0.5) / nseg;
      ball(k, body, `neck${i}`, {
        r: nr * (1 - i * 0.08),
        at: [0, by * 0.5 + neckLen * t, bz * 0.1 + 0.07 * t],
        color: col.neck ?? col.base,
      });
    }
    headY = by * 0.5 + neckLen + headR * 0.45;
    headZ = bz * 0.1 + 0.07 + headR * 0.1;
  }
  const head = ball(k, body, "head", { r: headR, ry: headR * v.f("headsq", 0.88, 1.08), at: [0, headY, headZ], color: col.head ?? col.base });

  // wings — silhouette is per-species data, not one shared ellipsoid
  const wingLen = v.f("wingl", 0.19, 0.32) * (opt.wingShape === "sickle" ? 1.3 : 1);
  const wingChord = v.f("wingc", 0.11, 0.2) * (opt.wingShape === "sickle" ? 0.7 : 1);
  const wingOut = bladeOutline(wingLen, wingChord, {
    n: 14,
    taper: v.f("wt", -0.3, 0.28),
    notch: v.f("wn", -0.14, 0.22),
    sweep: v.f("wsw", -0.35, 0.35),
  });
  bladeWings(k, body, {
    at: [0, by * 0.12, -bz * 0.04], gap: bx * 0.42, outline: wingOut, thick: v.f("wth", 0.03, 0.06),
    reach: wingLen * 0.88, tilt: v.f("wtilt", -0.12, 0.14), roll: v.f("wroll", 0.06, 0.26),
    color: wingCol, flap: v.f("wflap", 0.24, 0.46), dur: v.f("wdur", 0.9, 1.5), name: "wing",
  });
  const bar = v.i("bar", 0, 2);
  for (let i = 0; i < bar; i += 1) {
    for (const s of [1, -1]) {
      ball(k, body, `bar${i}${s > 0 ? "l" : "r"}`, { merge: true,
        rx: wingLen * 0.36, ry: 0.022, rz: wingChord * (0.3 - i * 0.08),
        at: [s * (bx * 0.42 + wingLen * (0.45 + i * 0.2)), by * 0.15, -bz * 0.04 - wingChord * 0.3],
        color: i % 2 ? paper : shade(wingCol, -0.25), subdiv: 0,
      });
    }
  }

  // tail
  const tailKind = opt.tail ?? v.pick("tailk", ["fan", "wedge", "fan", "long", "fork"]);
  const tailBase = [0, by * 0.2, -bz * 0.72];
  const tailCol = col.accentTail ?? dark;
  if (tailKind === "fork") {
    for (const s of [1, -1]) {
      const out = bladeOutline(0.045, 0.19, { n: 10, taper: 0.35 });
      blade(k, body, `tail-${s > 0 ? "l" : "r"}`, {
        outline: out, thick: 0.03, at: tailBase, rot: [v.f("tpitch", -0.1, 0.3), s * v.f("tspread", 0.2, 0.45), 0],
        off: [0, 0, -0.18], color: tailCol,
      });
    }
  } else if (tailKind === "long") {
    const n = v.i("tn", 1, 2);
    for (let i = 0; i < n; i += 1) {
      const len = v.f("tlen", 0.24, 0.44) * (1 - i * 0.22);
      blade(k, body, `tail${i}`, {
        outline: bladeOutline(0.04, len, { n: 10, taper: 0.3 }), thick: 0.03,
        at: tailBase, rot: [v.f("tpitch", -0.05, 0.35), (i - (n - 1) / 2) * 0.3, 0],
        off: [0, 0, -len * 0.85], color: shade(tailCol, i * 0.12),
      });
    }
  } else if (tailKind === "wedge") {
    blade(k, body, "tail", {
      outline: bladeOutline(v.f("twx", 0.1, 0.18), v.f("twz", 0.14, 0.24), { n: 12, taper: -0.4 }),
      thick: 0.035, at: tailBase, rot: [v.f("tpitch", 0.1, 0.5), 0, 0],
      off: [0, 0, -v.f("twz", 0.14, 0.24) * 0.85], color: tailCol,
    });
  } else {
    const n = v.i("tfan", 3, 5);
    const len = v.f("tflen", 0.16, 0.3);
    for (let i = 0; i < n; i += 1) {
      const t = n === 1 ? 0 : i / (n - 1) - 0.5;
      blade(k, body, `tail${i}`, {
        outline: bladeOutline(0.038, len * (1 - Math.abs(t) * 0.28), { n: 9, taper: 0.3 }),
        thick: 0.026, at: tailBase,
        rot: [v.f("tpitch", 0.05, 0.5), t * v.f("tspread", 0.5, 1.0), 0],
        off: [0, 0, -len * 0.8], color: i % 2 ? tailCol : shade(tailCol, 0.14),
      });
    }
  }

  // legs and feet
  if (legH > 0.03) {
    const toe = v.i("toe", 0, 3);
    for (const s of [1, -1]) {
      const chain = legChain(k, body, `leg-${s > 0 ? "l" : "r"}`, {
        at: [s * bx * 0.34, -by * 0.62, bz * 0.06], r: legH > 0.16 ? 0.021 : 0.028,
        seg: [
          { len: legH * 0.6, rz: s * 0.12, rx: 0.15, taper: 0.9 },
          { len: legH * 0.55, rz: s * -0.14, rx: -0.2, taper: 0.8 },
        ],
        color: legCol,
      });
      for (let i = 0; i < toe; i += 1) {
        spindle(k, chain[chain.length - 1], `toe${i}${s > 0 ? "l" : "r"}`, {
          r: 0.015, len: 0.055, at: [0, legH * 0.48, 0],
          rot: [1.4, (i - (toe - 1) / 2) * 0.6, 0], color: legCol, seg: 8,
        });
      }
    }
  }

  // bill
  const beak = opt.beak ?? v.pick("beak", ["cone", "cone", "chisel", "needle", "hook"]);
  const beakCol = col.beak ?? col.accent ?? APP.orange;
  const bl = headR * (beak === "needle" ? v.f("bl", 1.5, 2.3) : beak === "chisel" ? v.f("bl", 0.55, 0.85) : v.f("bl", 0.7, 1.1));
  const br = headR * (beak === "needle" ? 0.11 : v.f("br", 0.17, 0.26));
  cone(k, head, "beak", {
    r: br, h: bl, at: [0, -headR * 0.06, headR * 0.7], rotX: Math.PI / 2 - v.f("bdip", -0.05, 0.2),
    zScale: v.f("bflat", 0.7, 1.25), color: beakCol,
  });
  if (beak === "hook") {
    cone(k, head, "beak-hook", {
      r: br * 0.7, h: bl * 0.5, at: [0, -headR * 0.04, headR * 0.7 + bl * 0.7], rotX: Math.PI - 0.5,
      color: shade(beakCol, -0.18),
    });
  }
  if (v.on("gape", 0.35)) {
    ball(k, head, "gape", { rx: br * 1.1, ry: br * 0.5, rz: br * 0.5, at: [0, -headR * 0.2, headR * 0.66], color: shade(beakCol, -0.3), subdiv: 0 });
  }

  // crest / comb / cheek
  const crest = opt.crest ?? (v.on("crest", 0.28) ? v.pick("crestk", ["tuft", "spike", "plume"]) : null);
  if (crest === "comb") {
    for (const [i, z] of [-0.06, 0.02, 0.1].entries()) {
      ball(k, head, `comb${i}`, { merge: true, r: 0.05 + (i === 1 ? 0.02 : 0), at: [0, headR * 0.82, z], color: APP.red });
    }
    ball(k, head, "wattle", { r: 0.05, at: [0, -headR * 0.66, headR * 0.6], color: APP.red });
  } else if (crest === "crest" || crest === "spike") {
    for (const s of [1, -1]) {
      cone(k, head, `crest${s > 0 ? "l" : "r"}`, { r: 0.028, h: v.f("crl", 0.1, 0.18), at: [s * 0.03, headR * 0.72, -0.04], rotX: -0.6, color: col.accent ?? APP.red });
    }
  } else if (crest === "tuft") {
    const n = v.i("tuftn", 2, 3);
    for (let i = 0; i < n; i += 1) {
      ball(k, head, `tuft${i}`, { r: headR * (0.3 - i * 0.05), at: [0, headR * (0.76 + i * 0.18), -headR * (0.1 + i * 0.16)], color: shade(col.head ?? col.base, -0.14) });
    }
  } else if (crest === "plume") {
    for (const s of [1, -1]) {
      blade(k, head, `plume${s > 0 ? "l" : "r"}`, {
        outline: bladeOutline(0.03, 0.13, { n: 8, taper: 0.4 }), thick: 0.02,
        at: [s * 0.03, headR * 0.72, -headR * 0.2], rot: [-0.9, s * 0.25, 0], off: [0, 0, -0.11],
        color: col.accent ?? shade(col.base, -0.3),
      });
    }
  }
  if (v.on("cheek", 0.4)) {
    for (const s of [1, -1]) {
      ball(k, head, `cheek${s > 0 ? "l" : "r"}`, { merge: true,
        rx: headR * 0.34, ry: headR * 0.24, rz: headR * 0.2,
        at: [s * headR * 0.72, -headR * 0.16, headR * 0.4], color: v.on("cheekc", 0.5) ? paper : shade(dark, -0.1), subdiv: 0,
      });
    }
  }

  k.face(head, { r: headR * 0.98, eyeR: v.f("eyer", 0.3, 0.4), gap: v.f("eyeg", 0.46, 0.6), blink: opt.blink ?? true });
  k.idle({ breatheK: v.f("br", 0.024, 0.042), bobAmp: v.f("bob", 0.015, 0.035) });
}

/* ── mammals ──────────────────────────────────────────────────────────────── */

function mammal(k, col, opt = {}) {
  const v = vary(k);
  const dark = darkOf(col);
  const bx = 0.27 * v.f("bx", 0.86, 1.14);
  const by = 0.22 * v.f("by", 0.86, 1.16);
  const bz = 0.36 * v.f("bz", 0.86, 1.16);
  const legH = v.f("legh", 0.11, 0.19);
  const body = ball(k, k.root, "body", { rx: bx, ry: by, rz: bz, at: [0, legH + by * 0.86, 0], color: col.base });
  ball(k, body, "belly", { rx: bx * 0.72, ry: by * 0.66, rz: bz * 0.74, at: [0, -by * 0.4, bz * 0.3], color: bellyOf(col) });
  if (v.on("ruff", 0.4)) ball(k, body, "ruff", { rx: bx * 0.9, ry: by * 0.9, rz: bz * 0.3, at: [0, by * 0.1, bz * 0.6], color: shade(col.base, 0.16) });

  const headR = v.f("headr", 0.23, 0.3);
  const head = ball(k, body, "head", { r: headR, at: [0, by * 0.9, bz * 0.6], color: col.base });

  const ears = opt.ears ?? v.pick("ears", ["point", "big", "floppy", "round"]);
  if (ears === "floppy") {
    for (const s of [1, -1]) {
      blade(k, head, `ear${s > 0 ? "l" : "r"}`, {
        outline: bladeOutline(0.075, 0.15, { n: 10, taper: 0.3 }), thick: 0.03,
        at: [s * headR * 0.7, headR * 0.5, -0.02], rot: [1.5, 0, s * 0.5], off: [0, 0, -0.12], color: dark,
      });
    }
  } else if (ears === "big") {
    for (const s of [1, -1]) ball(k, head, `ear${s > 0 ? "l" : "r"}`, { rx: 0.12, ry: 0.13, rz: 0.05, at: [s * headR * 0.78, headR * 0.78, -0.04], color: col.base });
  } else if (ears === "round") {
    for (const s of [1, -1]) ball(k, head, `ear${s > 0 ? "l" : "r"}`, { r: headR * 0.4, at: [s * headR * 0.72, headR * 0.76, -0.03], color: col.base });
  } else {
    for (const s of [1, -1]) {
      cone(k, head, `ear${s > 0 ? "l" : "r"}`, { r: 0.075, h: v.f("earh", 0.12, 0.2), at: [s * headR * 0.6, headR * 0.6, -0.02], rotZ: s * -0.28, color: col.base });
      cone(k, head, `earin${s > 0 ? "l" : "r"}`, { r: 0.04, h: v.f("earh", 0.12, 0.2) * 0.6, at: [s * headR * 0.6, headR * 0.64, 0.03], rotZ: s * -0.28, color: shade(col.base, 0.28) });
    }
  }

  const snout = opt.snout ?? (v.on("snout", 0.7) ? "short" : null);
  if (snout) {
    const sr = snout === "dog" ? 0.11 : v.f("snr", 0.07, 0.1);
    ball(k, head, "snout", { rx: sr, ry: sr * 0.85, rz: sr * 1.1, at: [0, -headR * 0.34, headR * 0.78], color: bellyOf(col) });
    ball(k, head, "nose", { r: sr * 0.42, at: [0, -headR * 0.24, headR * 0.78 + sr * 0.95], color: ink, subdiv: 0 });
    if (opt.tongue) ball(k, head, "tongue", { rx: 0.045, ry: 0.02, rz: 0.07, at: [0, -headR * 0.7, headR * 0.9], color: hex("#e87a8a"), subdiv: 0 });
  }

  for (const [pi, dz] of [bz * 0.44, -bz * 0.42].entries()) {
    for (const s of [1, -1]) {
      legChain(k, body, `leg${pi}-${s > 0 ? "l" : "r"}`, {
        at: [s * bx * 0.6, -by * 0.6, dz], r: v.f("legr", 0.036, 0.05),
        seg: [
          { len: legH * 0.62, rz: s * 0.16, rx: pi ? -0.2 : 0.2, taper: 0.95 },
          { len: legH * 0.55, rz: s * -0.2, rx: pi ? 0.25 : -0.25, taper: 0.85 },
        ],
        color: pi ? shade(col.base, -0.08) : col.base,
      });
    }
  }

  const tail = opt.tail ?? v.pick("tail", ["bush", "rod", "curl", "bush"]);
  if (tail === "bat-wing") {
    for (const s of [1, -1]) {
      blade(k, body, `wing${s > 0 ? "l" : "r"}`, {
        outline: bladeOutline(0.34, 0.22, { n: 12, taper: 0.22, notch: 0.25 }), thick: 0.03,
        at: [s * bx * 0.5, by * 0.2, -bz * 0.06], rot: [0, 0, s * 0.45], off: [s * 0.3, 0, 0], color: dark,
      });
    }
  } else if (tail === "rod") {
    const t = k.cute.node("tail", { parent: body, at: [0, by * 0.5, -bz * 0.8], rot: null });
    k.cute.add(t, spindleGeo(0.03, v.f("taill", 0.26, 0.42), { seg: 10, bulge: 0.35 }), { rotX: 1.9 });
    k.cute.swing(t, { axis: "z", amp: 0.28, dur: 0.9, phase: 0.2 });
  } else if (tail === "curl") {
    let p = body;
    let at = [0, by * 0.55, -bz * 0.78];
    for (let i = 0; i < 4; i += 1) {
      const n = k.cute.node(`tail${i}`, { parent: p, at, rot: [i === 0 ? -0.7 : 0, 0, 0.55] });
      k.cute.add(n, spindleGeo(0.05 - i * 0.007, 0.11, { seg: 10, bulge: 0.5, tip: 0.7 }), { color: shade(col.base, i * 0.06) });
      p = n;
      at = [0, 0.095, 0];
    }
  } else {
    const t = k.cute.node("tail", { parent: body, at: [0, by * 0.55, -bz * 0.72], rot: null });
    k.cute.add(t, ballGeo(0.07, 0.16, 0.07, 1), { at: [0, 0.14, 0], rotX: -0.9, color: col.base });
    k.cute.swing(t, { axis: "z", amp: 0.24, dur: 1.3, phase: 0.4 });
  }

  k.face(head, { r: headR, eyeR: v.f("eyer", 0.32, 0.4), gap: v.f("eyeg", 0.44, 0.56), blink: true });
  k.idle();
}

/* ── herps ────────────────────────────────────────────────────────────────── */

function frog(k, col, opt = {}) {
  const v = vary(k);
  col = toned(k, col);
  const dark = darkOf(col);
  const bx = 0.3 * v.f("bx", 0.84, 1.14);
  const by = 0.19 * v.f("by", 0.8, 1.3);
  const bz = 0.3 * v.f("bz", 0.84, 1.16);
  const body = ball(k, k.root, "body", { rx: bx, ry: by, rz: bz, at: [0, by * 1.02, 0], color: col.base });
  ball(k, body, "belly", { rx: bx * 0.72, ry: by * 0.66, rz: bz * 0.72, at: [0, -by * 0.42, bz * 0.28], color: bellyOf(col) });
  if (v.on("throat", 0.45)) ball(k, body, "throat", { rx: bx * 0.4, ry: by * 0.42, rz: bz * 0.3, at: [0, -by * 0.4, bz * 0.68], color: shade(bellyOf(col), 0.12) });

  const wart = opt.warty ? v.i("wartn", 5, 8) : v.i("wartn", 0, 3);
  for (let i = 0; i < wart; i += 1) {
    const a = (i / Math.max(1, wart)) * Math.PI * 2 + v.f("warta", 0, 2);
    ball(k, body, `wart${i}`, { merge: true,
      r: v.f(`wr${i}`, 0.025, 0.045),
      at: [Math.cos(a) * bx * 0.6, by * 0.72, Math.sin(a) * bz * 0.6],
      color: dark, subdiv: 0,
    });
  }
  const stripe = v.i("stripe", 0, 2);
  for (let i = 0; i < stripe; i += 1) {
    ball(k, body, `stripe${i}`, { merge: true,
      rx: bx * 0.1, ry: by * 0.3, rz: bz * 0.86,
      at: [(i - (stripe - 1) / 2) * bx * 0.9, by * 0.6, 0], color: col.accent ?? shade(col.base, -0.34), subdiv: 0,
    });
  }

  const eyeR = v.f("eyer", 0.085, 0.125);
  for (const s of [1, -1]) {
    const bump = ball(k, body, `eyebump${s > 0 ? "l" : "r"}`, { r: eyeR * 1.25, at: [s * bx * 0.5, by * 0.78, bz * 0.44], color: col.base });
    ball(k, bump, `eyeball${s > 0 ? "l" : "r"}`, { r: eyeR, at: [0, eyeR * 0.42, eyeR * 0.4], color: paper });
    ball(k, bump, `pupil${s > 0 ? "l" : "r"}`, { r: eyeR * 0.45, at: [0, eyeR * 0.44, eyeR * 0.95], color: ink, subdiv: 0 });
  }
  k.arc(body, { name: "smile", R: bx * 0.5, r: 0.04, a0: Math.PI * 1.2, a1: Math.PI * 1.8, at: [0, -by * 0.1, bz * 0.86], color: ink, segs: 6 });

  const toe = v.i("toe", 0, 3);
  for (const s of [1, -1]) {
    ball(k, body, `thigh${s > 0 ? "l" : "r"}`, { rx: 0.09, ry: 0.08, rz: 0.16, at: [s * bx * 0.66, -by * 0.2, -bz * 0.4], color: dark });
    const arm = legChain(k, body, `arm-${s > 0 ? "l" : "r"}`, {
      at: [s * bx * 0.7, 0, bz * 0.5], r: 0.03,
      seg: [{ len: v.f("arml", 0.09, 0.15), rz: s * -0.55, rx: 0.5, taper: 0.9 }, { len: 0.07, rz: s * -0.5, taper: 0.8 }],
      color: col.base,
    });
    const shin = legChain(k, body, `shin-${s > 0 ? "l" : "r"}`, {
      at: [s * bx * 0.72, -by * 0.4, -bz * 0.42], r: 0.032,
      seg: [{ len: v.f("shinl", 0.1, 0.17), rz: s * -1.1, rx: -0.4, taper: 0.9 }, { len: 0.09, rz: s * -0.9, rx: 0.9, taper: 0.85 }],
      color: dark,
    });
    for (const [tag, chain] of [["f", arm], ["h", shin]]) {
      for (let i = 0; i < toe; i += 1) {
        ball(k, chain[chain.length - 1], `toe${tag}${i}${s > 0 ? "l" : "r"}`, {
          r: 0.024, at: [(i - (toe - 1) / 2) * 0.04, 0.08, 0.02], color: shade(col.base, 0.24), subdiv: 0,
        });
      }
    }
  }
  k.cute.breathe(k.root, { k: v.f("br", 0.05, 0.09) });
  k.cute.bob(k.root, { amp: v.f("bob", 0.04, 0.08), phase: 0.1 });
}

/* ── lizards ──────────────────────────────────────────────────────────────
 * Live for five campus species since the reptile route was fixed: a marbled
 * water monitor, a common sun skink and three house geckos. They are three
 * different animals, so `kind` picks a BODY PLAN rather than a scale factor —
 * a monitor is neck, snout and a tail longer than the rest of it; a gecko is
 * head and eyes on padded toes; a skink is a smooth low cylinder with short
 * legs. The three geckos then separate on head width, tail plumpness,
 * tubercle rows and toe count, since they share one recipe.
 */
function lizard(k, col, opt = {}) {
  const v = vary(k);
  col = toned(k, col);
  const dark = darkOf(col);
  const kind = opt.kind === "monitor" ? "monitor" : opt.kind === "gecko" ? "gecko" : "skink";
  const P = {
    monitor: {
      bx: 0.145, by: 0.125, bz: 0.30, head: 0.115, snout: 2.1, neck: true,
      tailN: [6, 8], tail: 1.55, flat: 0.6, legR: 0.036, legL: 0.15, splay: 1.05,
      eye: 0.25, toe: [3, 4], claw: true, tongue: true, pad: false, scale: 1.3,
    },
    gecko: {
      bx: 0.15, by: 0.105, bz: 0.21, head: 0.16, snout: 1.05, neck: false,
      tailN: [4, 6], tail: 1.05, flat: 1.05, legR: 0.026, legL: 0.11, splay: 1.5,
      eye: 0.52, toe: [4, 5], claw: false, tongue: false, pad: true, scale: 1,
    },
    skink: {
      bx: 0.125, by: 0.115, bz: 0.29, head: 0.115, snout: 1.4, neck: false,
      tailN: [5, 7], tail: 1.3, flat: 0.92, legR: 0.022, legL: 0.085, splay: 1.32,
      eye: 0.34, toe: [2, 3], claw: false, tongue: false, pad: false, scale: 1,
    },
  }[kind];
  const S = P.scale;
  const bx = P.bx * S * v.f("bx", 0.88, 1.14);
  const by = P.by * S * v.f("by", 0.86, 1.16);
  const bz = P.bz * S * v.f("bz", 0.88, 1.18);

  const body = ball(k, k.root, "body", { rx: bx, ry: by, rz: bz, at: [0, by * 1.4, 0], color: col.base });
  ball(k, body, "belly", { rx: bx * 0.78, ry: by * 0.6, rz: bz * 0.8, at: [0, -by * 0.46, bz * 0.06], color: bellyOf(col) });

  // a monitor carries its head out on a neck; a gecko and a skink do not
  const neckLen = P.neck ? bz * v.f("neckl", 0.3, 0.55) : 0;
  if (neckLen > 0) {
    const nseg = v.i("neckn", 1, 2);
    for (let i = 0; i < nseg; i += 1) {
      const t = (i + 0.5) / nseg;
      ball(k, body, `neck${i}`, {
        rx: bx * (0.6 - i * 0.05), ry: by * (0.72 - i * 0.05), rz: bz * 0.2,
        at: [0, by * 0.24, bz * 0.7 + neckLen * t], color: col.base,
      });
    }
  }
  const headR = P.head * S * v.f("hr", 0.88, 1.14);
  const headZ = headR * P.snout * v.f("hsnout", 0.9, 1.15);
  const head = ball(k, body, "head", {
    rx: headR * v.f("hw", 0.9, 1.2), ry: headR * v.f("hh", 0.72, 0.95), rz: headZ,
    at: [0, by * 0.28, bz * 0.7 + neckLen + headZ * 0.72], color: col.head ?? col.base,
  });
  // jaw line, and the monitor's tapered muzzle
  ball(k, head, "jaw", {
    rx: headR * 0.78, ry: headR * 0.3, rz: headZ * 0.8,
    at: [0, -headR * 0.45, headZ * 0.12], color: bellyOf(col), subdiv: 0, merge: true,
  });
  if (P.snout > 1.5) {
    cone(k, head, "muzzle", {
      r: headR * 0.5, h: headZ * v.f("muzzle", 0.4, 0.65), at: [0, -headR * 0.08, headZ * 0.7],
      rotX: Math.PI / 2, zScale: 0.75, color: col.head ?? col.base,
    });
  }
  if (P.tongue) {
    for (const s of [1, -1]) {
      spindle(k, head, `tongue-${s > 0 ? "l" : "r"}`, {
        r: 0.008 * S, len: headZ * v.f("tongue", 0.5, 0.9), at: [0, -headR * 0.3, headZ * 0.8],
        rot: [1.45, 0, s * 0.28], color: APP.red, seg: 7,
      });
    }
  }
  if (P.pad) {
    // a gecko's ear openings and its wide, lidless brow
    for (const s of [1, -1]) {
      ball(k, head, `brow-${s > 0 ? "l" : "r"}`, {
        rx: headR * 0.34, ry: headR * 0.22, rz: headZ * 0.34,
        at: [s * headR * 0.6, headR * 0.42, headZ * 0.1], color: shade(col.head ?? col.base, -0.16),
      });
    }
  }

  // tail: a chain that overlaps link to link, flattened for the swimmer
  const tailN = v.i("tailn", P.tailN[0], P.tailN[1]);
  const tailLen = bz * P.tail * v.f("taill", 0.85, 1.2) / tailN * 2.2;
  const tailR = by * v.f("tailr", 0.7, 1.0) * (kind === "gecko" ? 1.25 : 1);
  let p = body;
  let at = [0, 0, -bz * 0.78];
  for (let i = 0; i < tailN; i += 1) {
    const t = i / tailN;
    const r = tailR * (1 - t * 0.82);
    p = ball(k, p, `tail${i}`, {
      rx: r * P.flat, ry: r, rz: tailLen * 0.62,
      at, rot: [i === 0 ? v.f("taillift", -0.1, 0.22) : 0, i === 0 ? 0 : v.f("tailc", -0.14, 0.14), 0],
      color: shade(col.base, (i % 2 ? 0.1 : -0.05) - t * 0.06),
    });
    at = [0, 0, -tailLen * 0.86];
  }

  const crestN = kind === "gecko" ? 0 : v.i("crestn", 0, 3);
  for (let i = 0; i < crestN; i += 1) {
    cone(k, body, `crest${i}`, {
      r: 0.018 * S, h: v.f("cresth", 0.035, 0.08) * S,
      at: [0, by * 0.86, bz * (0.5 - i * 0.36)], color: shade(col.base, -0.28),
    });
  }
  // markings: marbled ocelli, a skink's lines, a gecko's tubercle rows
  if (kind === "monitor") {
    const rowN = v.i("ocelli", 2, 4);
    for (let i = 0; i < rowN; i += 1) {
      for (const s of [1, -1]) {
        ball(k, body, `ocellus${i}-${s > 0 ? "l" : "r"}`, {
          rx: bx * 0.2, ry: by * 0.24, rz: bz * 0.1,
          at: [s * bx * 0.55, by * 0.72, bz * (0.5 - i * (1.1 / rowN))],
          color: shade(col.base, 0.42), subdiv: 0, merge: true,
        });
      }
    }
  } else if (kind === "skink") {
    const lineN = v.i("linen", 2, 4);
    for (let i = 0; i < lineN; i += 1) {
      for (const s of [1, -1]) {
        ball(k, body, `stripe${i}-${s > 0 ? "l" : "r"}`, {
          rx: bx * 0.07, ry: by * 0.16, rz: bz * 0.9,
          at: [s * bx * (0.3 + i * 0.24), by * 0.66, 0],
          color: i % 2 ? shade(col.base, -0.4) : paper, subdiv: 0, merge: true,
        });
      }
    }
  } else {
    const rowN = v.i("tuberc", 0, 3);
    for (let i = 0; i < rowN; i += 1) {
      for (const s of [1, -1]) {
        ball(k, body, `tubercle${i}-${s > 0 ? "l" : "r"}`, {
          r: bx * v.f("tubr", 0.09, 0.15),
          at: [s * bx * (0.34 + i * 0.2), by * 0.78, bz * v.f("tubz", -0.3, 0.3)],
          color: shade(col.base, -0.24), subdiv: 0,
        });
      }
    }
  }

  // four sprawled legs, each ending in a real foot
  for (const s of [1, -1]) {
    for (const [i, dz] of [bz * 0.5, -bz * 0.46].entries()) {
      const chain = legChain(k, body, `leg${i}-${s > 0 ? "l" : "r"}`, {
        at: [s * bx * 0.68, -by * 0.24, dz], r: P.legR * S,
        seg: [
          { len: P.legL * S * v.f("upperl", 0.85, 1.15), rz: s * -P.splay, rx: i ? -0.5 : 0.55, taper: 0.9 },
          { len: P.legL * S * 0.85, rz: s * -(1.6 - P.splay), rx: i ? 0.3 : -0.3, taper: 0.75 },
        ],
        color: shade(col.base, -0.1),
      });
      const foot = chain[chain.length - 1];
      const toe = v.i("toe", P.toe[0], P.toe[1]);
      for (let t = 0; t < toe; t += 1) {
        const spread = (t - (toe - 1) / 2) / Math.max(1, toe - 1);
        const tip = ball(k, foot, `toe${i}${t}-${s > 0 ? "l" : "r"}`, {
          rx: P.legR * S * (P.pad ? 1.5 : 0.9), ry: P.legR * S * (P.pad ? 0.5 : 0.8),
          rz: P.legR * S * (P.pad ? 1.7 : 1.4),
          at: [spread * P.legR * S * 2.4, P.legL * S * 0.7, P.legR * S * 0.6],
          rot: [0, spread * 0.7, 0], color: shade(col.base, P.pad ? 0.3 : 0.2), subdiv: 0,
        });
        if (P.claw) {
          cone(k, tip, `claw${i}${t}-${s > 0 ? "l" : "r"}`, {
            merge: true, r: P.legR * S * 0.3, h: P.legR * S * 1.3,
            at: [0, 0, P.legR * S * 1.2], rotX: 1.3, color: ink, seg: 6,
          });
        }
      }
    }
  }

  k.face(head, {
    center: [0, headR * 0.16, headZ * v.f("facez", 0.06, 0.2)],
    r: headR * 0.98, eyeR: P.eye * v.f("eyer", 0.9, 1.12), gap: v.f("eyeg", 0.48, 0.62),
    smile: kind !== "monitor", blush: false, blink: kind !== "gecko",
  });
  k.cute.swing(body, { axis: "y", amp: v.f("sway", 0.05, 0.12), dur: v.f("swayd", 1.4, 2.4), phase: 0.2 });
  k.idle({ breatheK: v.f("br", 0.03, 0.05), bobAmp: 0 });
}

/**
 * Snakes used to be three stacked discs with a head hovering above them. Now
 * the body is one sampled curve — coil, S-bend or loop — and every bead is
 * placed to overlap its neighbour, so the whole animal is a single run.
 */
function snake(k, col, opt = {}) {
  const v = vary(k);
  col = toned(k, col);
  const tiny = opt.kind === "blind";
  const form = tiny ? "coil" : v.pick("form", ["coil", "ess", "coil", "loop"]);
  const thick = (tiny ? 0.035 : v.f("thick", 0.055, 0.095));
  const turn = v.f("turn", 1.7, 3.1);
  const bandN = v.i("band", 0, 4);
  const amp = v.f("amp", 0.12, 0.24);
  const rad = v.f("rad", 0.12, 0.22);
  const rise = v.f("rise", 0.03, 0.18);

  const path = (t) => {
    if (form === "ess") return [Math.sin(t * Math.PI * turn) * amp, 0.06 + t * rise * 0.7, -0.36 + t * 0.66];
    if (form === "loop") {
      const a = t * Math.PI * turn;
      return [Math.cos(a) * rad * (1 - t * 0.2), 0.06 + t * rise, Math.sin(a) * rad * (1 - t * 0.2)];
    }
    const a = t * Math.PI * turn;
    const rr = rad * (1 - t * 0.55);
    return [Math.cos(a) * rr, 0.05 + t * rise * 1.1, Math.sin(a) * rr];
  };
  /* Bead count is a species knob, but the bead SPACING is a contract: walk the
     count up until neighbours overlap, so a tightly wound coil never ships as
     a string of separate blobs the way it used to. */
  let n = tiny ? v.i("n", 5, 7) : v.i("n", 9, 15);
  let pos = [];
  for (let guard = 0; guard < 24; guard += 1) {
    pos = [];
    for (let i = 0; i < n; i += 1) pos.push(path(i / (n - 1)));
    let worst = 0;
    for (let i = 1; i < n; i += 1) {
      worst = Math.max(worst, Math.hypot(pos[i][0] - pos[i - 1][0], pos[i][1] - pos[i - 1][1], pos[i][2] - pos[i - 1][2]));
    }
    if (worst <= thick * 0.62 || n >= 14) break;
    n += 1;
  }
  /* Beads cost triangles, so the count stops at 14; past that the coil itself
     tightens instead, which keeps the overlap contract without the file. */
  let worst = 0;
  for (let i = 1; i < n; i += 1) {
    worst = Math.max(worst, Math.hypot(pos[i][0] - pos[i - 1][0], pos[i][1] - pos[i - 1][1], pos[i][2] - pos[i - 1][2]));
  }
  if (worst > thick * 0.62) {
    const f = (thick * 0.62) / worst;
    pos = pos.map((p) => [pos[0][0] + (p[0] - pos[0][0]) * f, pos[0][1] + (p[1] - pos[0][1]) * f, pos[0][2] + (p[2] - pos[0][2]) * f]);
  }
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    const r = thick * (0.55 + 0.45 * Math.sin(Math.PI * clamp(t * 1.15, 0, 1)));
    ball(k, k.root, `coil${i}`, {
      rx: r, ry: r * v.f("flat", 0.7, 1), rz: r,
      at: pos[i], color: bandN && i % Math.max(2, Math.round(n / bandN)) === 0 ? shade(col.base, -0.36) : shade(col.base, (i % 2 ? 0.06 : -0.03)),
    });
  }
  const headR = tiny ? thick * 1.25 : thick * v.f("hr", 1.15, 1.55);
  const last = pos[n - 1];
  const prev = pos[n - 2] ?? [0, 0, 0];
  const dir = [last[0] - prev[0], last[1] - prev[1], last[2] - prev[2]];
  const dl = Math.hypot(...dir) || 1;
  const head = ball(k, k.root, "head", {
    rx: headR, ry: headR * 0.82, rz: headR * v.f("hz", 1.05, 1.4),
    at: [last[0] + (dir[0] / dl) * headR * 0.7, last[1] + (dir[1] / dl) * headR * 0.5 + headR * 0.3, last[2] + (dir[2] / dl) * headR * 0.7],
    rot: [0, Math.atan2(dir[0], dir[2]), 0], color: col.head ?? col.base,
  });
  if (v.on("hood", 0.25) && !tiny) {
    for (const s of [1, -1]) {
      ball(k, head, `hood${s > 0 ? "l" : "r"}`, {
        rx: headR * 0.9, ry: headR * 0.9, rz: headR * 0.3,
        at: [s * headR * 0.7, -headR * 0.2, -headR * 0.5], color: shade(col.base, -0.2),
      });
    }
  }
  if (!tiny) {
    cone(k, head, "tongue", { r: 0.011, h: v.f("tongue", 0.07, 0.13), at: [0, -headR * 0.15, headR * 0.75], rotX: Math.PI / 2, color: APP.red });
  }
  k.face(head, { r: headR, eyeR: v.f("eyer", 0.3, 0.44), gap: 0.55, smile: !tiny, blush: false });
  k.cute.swing(head, { axis: "y", amp: v.f("look", 0.18, 0.4), dur: v.f("lookd", 1.8, 2.6) });
  k.idle({ breatheK: 0.04, bobAmp: 0 });
}

/* ── fish ─────────────────────────────────────────────────────────────────── */

function fish(k, col, opt = {}) {
  const v = vary(k);
  col = toned(k, col);
  const angel = opt.kind === "angel";
  const dark = darkOf(col);
  const bx = angel ? 0.06 : v.f("bx", 0.075, 0.13);
  const by = angel ? 0.3 : v.f("by", 0.13, 0.24);
  const bz = v.f("bz", 0.22, 0.34);
  const body = ball(k, k.root, "body", { rx: bx, ry: by, rz: bz, at: [0, by + 0.06, 0], color: col.base });
  ball(k, body, "belly", { rx: bx * 0.78, ry: by * 0.6, rz: bz * 0.7, at: [0, -by * 0.32, bz * 0.24], color: bellyOf(col) });

  const tailKind = v.pick("tailk", ["fan", "fork", "veil", "round"]);
  const tailSize = (opt.kind === "fancy" ? 1.5 : 1) * v.f("tails", 0.85, 1.25);
  const tailOut = bladeOutline(0.13 * tailSize, 0.11 * tailSize, {
    n: 12,
    taper: tailKind === "fork" ? -0.55 : tailKind === "veil" ? -0.2 : 0.1,
    notch: tailKind === "fork" ? 0.4 : tailKind === "round" ? -0.1 : 0.15,
  });
  const tail = hinge(k, body, "tail", { at: [0, 0, -bz * 0.8], rot: [0, 0, Math.PI / 2], axis: "y", base: 0, amp: v.f("swish", 0.3, 0.5), dur: v.f("swishd", 0.8, 1.4) });
  k.cute.add(tail, bladeGeo(tailOut, 0.024), { at: [0, 0, -0.11 * tailSize], color: dark });

  const dorsalN = v.i("dorsn", 1, 3);
  for (let i = 0; i < dorsalN; i += 1) {
    blade(k, body, `dorsal${i}`, {
      outline: bladeOutline(0.02, v.f("dorsr", 0.07, 0.13) * (1 - i * 0.2), { n: 8, taper: -0.3 }), thick: 0.02,
      at: [0, by * 0.78, bz * (0.3 - i * 0.42)], rot: [Math.PI / 2, 0, 0], off: [0, 0, -0.07], color: dark,
    });
  }
  if (v.on("anal", 0.6)) {
    blade(k, body, "anal", {
      outline: bladeOutline(0.02, 0.07, { n: 8, taper: -0.3 }), thick: 0.02,
      at: [0, -by * 0.75, -bz * 0.28], rot: [-Math.PI / 2, 0, 0], off: [0, 0, -0.06], color: dark,
    });
  }
  for (const s of [1, -1]) {
    const fin = hinge(k, body, `pect-${s > 0 ? "l" : "r"}`, {
      at: [s * bx * 0.7, -by * 0.15, bz * 0.34], rot: [0, 0, s * 0.6], axis: "x", base: 0,
      amp: v.f("finf", 0.16, 0.3), dur: v.f("find", 0.7, 1.1), phase: s > 0 ? 0 : 0.4,
    });
    k.cute.add(fin, bladeGeo(bladeOutline(0.08, 0.05, { n: 9, taper: 0.3 }).map(([x, z]) => [x * s, z]), 0.018), { at: [s * 0.07, 0, 0], color: shade(col.base, 0.18) });
  }
  const stripeN = v.i("stripen", 0, 4);
  for (let i = 0; i < stripeN; i += 1) {
    ball(k, body, `stripe${i}`, { merge: true,
      rx: bx * 1.04, ry: by * v.f("stripeh", 0.5, 1.02), rz: bz * 0.09,
      at: [0, 0, bz * (0.6 - i * (1.2 / Math.max(1, stripeN)))], color: v.on("stripec", 0.5) ? ink : paper, subdiv: 0,
    });
  }
  const barbelN = v.i("barbel", 0, 2);
  for (let i = 0; i < barbelN; i += 1) {
    for (const s of [1, -1]) {
      spindle(k, body, `barbel${i}${s > 0 ? "l" : "r"}`, {
        r: 0.008, len: v.f("barbell", 0.06, 0.12), at: [s * bx * 0.5, -by * 0.2 - i * 0.03, bz * 0.72],
        rot: [1.9, 0, s * 0.3], color: shade(col.base, 0.2), seg: 8,
      });
    }
  }
  beadEyes(k, body, { r: v.f("eyer", 0.04, 0.062), at: [0, by * 0.3, bz * 0.6], gap: bx * 0.72, color: paper, pupilR: 0.55 });
  k.idle({ breatheK: v.f("br", 0.04, 0.07), bobAmp: v.f("bob", 0.012, 0.03) });
}

/* ── butterflies and moths ────────────────────────────────────────────────
 * 95 species across four archetype keys, and they used to be one pair of
 * ellipsoids each. The wing is now an outline: forewing and hindwing get
 * their own harmonics, so falcate skippers, round satyrs, scalloped moths and
 * tailed swallowtails are genuinely different silhouettes rather than tints.
 */
function lepidoptera(k, col, opt = {}) {
  const v = vary(k);
  col = toned(k, col);
  const moth = opt.kind === "moth" || opt.kind === "hawk";
  const hawk = opt.kind === "hawk";
  const skipper = opt.kind === "skipper";
  const dark = darkOf(col);
  const bodyCol = moth ? shade(col.base, -0.25) : dark;
  /* The saturniids and the birdwings are among the biggest lepidoptera alive;
     shipping Attacus at the same size as a leaf-roller moth is a factual
     error, not a style choice. */
  const giant = /^(attacus|actias|samia|antheraea|troides|papilio-)/.test(who(k)) ? 1.45 : 1;

  // thorax, head, segmented abdomen — the abdomen count is a species knob
  const thoraxY = v.f("ty", 0.32, 0.5);
  const thoraxR = v.f("tr", 0.055, 0.085) * (hawk ? 1.25 : 1) * giant;
  const thorax = ball(k, k.root, "thorax", {
    rx: thoraxR, ry: thoraxR * 1.15, rz: thoraxR * 1.1, at: [0, thoraxY, 0],
    rot: [v.f("pitch", -0.3, 0.3), 0, 0], color: bodyCol,
  });
  const abdN = v.i("abdn", 2, 5);
  const abdLen = v.f("abdl", 0.05, 0.115) * (hawk ? 1.35 : 1) * giant;
  for (let i = 0; i < abdN; i += 1) {
    const r = thoraxR * (0.92 - i * (skipper ? 0.16 : 0.1));
    ball(k, thorax, `abdomen${i}`, {
      rx: r, ry: abdLen * 0.62, rz: r,
      at: [0, -thoraxR * 0.7 - abdLen * i * 0.86, hawk ? -i * 0.012 : 0],
      color: i % 2 ? shade(bodyCol, 0.14) : shade(bodyCol, -0.06),
    });
  }
  const headR = thoraxR * v.f("hr", 0.75, 1.0);
  const head = ball(k, thorax, "head", { r: headR, at: [0, thoraxR * 0.9, thoraxR * 0.2], color: bodyCol });
  beadEyes(k, head, { r: headR * v.f("eyer", 0.5, 0.72), at: [0, 0, headR * 0.36], gap: headR * 0.62, color: ink, pupil: shade(col.accent ?? APP.red, -0.1), spark: true, subdiv: 1 });
  antennaPair(k, head, {
    at: [0, headR * 0.5, headR * 0.3], gap: headR * 0.32,
    len: v.f("antl", 0.1, 0.22), r: 0.008, spread: v.f("ants", 0.3, 0.8), joint: 2,
    form: moth ? v.pick("antf", ["thread", "feather", "thread"]) : v.pick("antf", ["club", "club", "hook"]),
    barb: moth && v.on("barb", 0.5) ? 2 : 0,
    color: bodyCol,
  });
  if (moth && v.on("fuzz", 0.6)) {
    ball(k, thorax, "fuzz", { merge: true, rx: thoraxR * 1.2, ry: thoraxR * 0.7, rz: thoraxR * 1.2, at: [0, thoraxR * 0.3, 0], color: shade(bodyCol, 0.2) });
  }
  if (moth) {
    for (const s of [1, -1]) {
      spindle(k, head, `palp-${s > 0 ? "l" : "r"}`, {
        merge: true, r: 0.01, len: headR * 1.4, at: [s * headR * 0.3, -headR * 0.3, headR * 0.4], rot: [1.2, 0, s * 0.25], color: shade(bodyCol, 0.15), seg: 8,
      });
    }
  }

  // forewing: a swept triangle, chord a real fraction of span
  const foreX = v.f("fx", 0.24, 0.36) * (hawk ? 1.2 : skipper ? 0.78 : 1) * giant;
  const foreZ = foreX * v.f("fzr", 0.4, 0.82) * (skipper ? 0.8 : hawk ? 0.5 : 1);
  const foreOut = wingShape(FOREWING, foreX, foreZ, {
    scallop: v.on("fsc", 0.4) ? v.f("fscm", 0.4, 1) : 0,
    apex: v.f("fap", 0.88, 1.16),
    sweep: v.f("fsw", -0.22, 0.16),
  });
  /* Wing carriage: a moth holds its wings flat, roofed or tented and a
     butterfly holds them open or clapped over its back. It is the single
     biggest difference in how tall the animal reads, so it is a species knob
     rather than one shared pose. */
  const pose = moth ? v.pick("pose", ["flat", "roof", "tent", "flat"]) : v.pick("pose", ["open", "up", "open"]);
  const carriage = {
    flat: [-0.05, 0.16], roof: [0.28, 0.72], tent: [0.12, 0.5],
    open: [0.0, 0.34], up: [0.95, 1.5],
  }[pose];
  const wingY = thoraxY + thoraxR * (moth ? 0.1 : 0.35);
  const foreWing = bladeWings(k, k.root, {
    at: [0, wingY, thoraxR * 0.15], gap: thoraxR * 0.55, outline: foreOut, thick: v.f("fth", 0.012, 0.024),
    reach: foreX * 0.05, tilt: v.f("ftl", -0.2, 0.25), yaw: moth ? v.f("fyaw", 0.35, 0.75) : v.f("fyaw", 0.0, 0.24),
    roll: v.f("frl", carriage[0], carriage[1]), color: col.base, colorFn: col.wingGrad,
    flap: v.f("fflap", 0.1, 0.3), dur: v.f("fdur", 1.0, 1.8), name: "wing-up",
  });
  // hindwing
  const hindX = foreX * v.f("hx", 0.48, 0.92);
  const hindZ = hindX * v.f("hzr", 0.55, 1.1);
  const hindOut = wingShape(HINDWING, hindX, hindZ, {
    scallop: v.on("hsc", 0.45) ? v.f("hscm", 0.4, 1.2) : 0,
    apex: v.f("hap", 0.85, 1.1),
    sweep: v.f("hsw", -0.1, 0.24),
  });
  const hindWing = bladeWings(k, k.root, {
    at: [0, wingY - foreZ * v.f("hdrop", 0.3, 1.2), -thoraxR * 0.5], gap: thoraxR * 0.45, outline: hindOut, thick: v.f("hth", 0.012, 0.026),
    reach: hindX * 0.05, tilt: v.f("htl", -0.15, 0.2), yaw: moth ? v.f("hyaw", 0.3, 0.7) : v.f("hyaw", 0, 0.2),
    roll: v.f("hrl", carriage[0] * 0.85, carriage[1] * 0.9), color: shade(col.base, v.f("hshade", 0.02, 0.28)),
    flap: v.f("hflap", 0.08, 0.26), dur: v.f("fdur", 1.0, 1.8), phase: 0.25, name: "wing-lo",
  });

  // wing pattern: eyespots, bands, and swallowtail streamers — all part count
  const spotN = opt.spots ? v.i("spotn", 1, 2) : v.i("spotn", 0, 2);
  for (const [wi, pair] of [foreWing, hindWing].entries()) {
    const rx = wi ? hindX : foreX;
    const rz = wi ? hindZ : foreZ;
    for (const [si, w] of pair.entries()) {
      const s = si === 0 ? 1 : -1;
      for (let i = 0; i < spotN; i += 1) {
        const t = (i + 1) / (spotN + 1);
        ball(k, w, `spot${wi}${si}${i}`, { merge: true,
          rx: rx * v.f(`sp${i}`, 0.08, 0.18), ry: 0.011, rz: rz * v.f(`spz${i}`, 0.14, 0.3),
          at: [s * rx * (0.25 + t * 0.55), 0.011, rz * v.f(`spo${i}`, -0.3, 0.3)],
          color: i % 2 ? (col.accent ?? paper) : shade(col.base, -0.4), subdiv: 0,
        });
      }
    }
  }
  const bandN = v.i("bandn", 0, 2);
  for (let i = 0; i < bandN; i += 1) {
    for (const [si, w] of foreWing.entries()) {
      const s = si === 0 ? 1 : -1;
      ball(k, w, `band${i}${si}`, { merge: true,
        rx: foreX * 0.08, ry: 0.012, rz: foreZ * 0.8,
        at: [s * foreX * (0.32 + i * 0.34), 0.012, -foreZ * 0.06], color: shade(col.base, i % 2 ? -0.42 : 0.4), subdiv: 0,
      });
    }
  }
  /* Swallowtails. The four Papilio in the pack are named for the streamers on
     the hindwing and not one of them had any, because the tail was a coin
     flip on every butterfly instead of a fact about the family. */
  const swallowtail = /^(papilio|graphium|troides|atrophaneura|losaria|pachliopta|byasa|lamproptera|meandrusa)-/.test(who(k));
  if (!moth && (swallowtail || v.on("tail", 0.22))) {
    for (const [si, w] of hindWing.entries()) {
      const s = si === 0 ? 1 : -1;
      const tailL = swallowtail ? hindX * v.f("streaml", 0.55, 0.95) : v.f("streaml", 0.06, 0.13);
      spindle(k, w, `streamer${si}`, {
        r: swallowtail ? 0.013 : 0.011, len: tailL,
        at: [s * hindX * 0.62, 0, -hindZ * 0.42],
        rot: [-1.75, 0, s * 0.45], tip: swallowtail ? 0.9 : 0,
        color: shade(col.base, -0.2), seg: 8,
      });
    }
  }
  const legN = 3;
  if (legN) {
    insectLegs(k, k.root, {
      at: [0, thoraxY - thoraxR * 0.6, thoraxR * 0.2], gap: thoraxR * 0.4, pair: legN,
      len: v.f("legl", 0.07, 0.13), r: 0.008, spanZ: thoraxR * 0.8, splay: 1.35, bend: 1.0, color: bodyCol,
    });
  }
  /* Ocelli: the raised eyespots on a satyrine's wing, as real parts. Merged
     paint cannot separate two butterflies in the signature; a part can. */
  const ocelN = v.i("oceln", 0, 2);
  for (let i = 0; i < ocelN; i += 1) {
    for (const [si, w] of hindWing.entries()) {
      const s = si === 0 ? 1 : -1;
      ball(k, w, `ocellus${i}${si}`, {
        rx: hindX * v.f("ocelr", 0.1, 0.19), ry: 0.011, rz: hindZ * v.f("ocelz", 0.18, 0.32),
        at: [s * hindX * v.f("ocelx", 0.35, 0.68), 0.012, hindZ * v.f("ocelo", -0.28, 0.24)],
        color: i % 2 ? (col.accent ?? paper) : shade(col.base, -0.5),
      });
    }
  }
  /* Scale tufts: the shaggy shoulder and abdominal crests a noctuid carries.
     Counting them is a species knob with real parts behind it, which is what
     the distinctness signature can actually see — two moths built from the
     same recipe with two different tints are, correctly, one model. */
  const tuftN = v.i("tuftn", 0, 3);
  for (let i = 0; i < tuftN; i += 1) {
    for (const s of [1, -1]) {
      ball(k, thorax, `tuft${i}-${s > 0 ? "l" : "r"}`, {
        rx: thoraxR * 0.4, ry: thoraxR * 0.3, rz: thoraxR * 0.4,
        at: [s * thoraxR * 0.7, thoraxR * (0.2 - i * 0.7), -thoraxR * 0.2],
        color: shade(bodyCol, i % 2 ? 0.3 : -0.2), subdiv: 0,
      });
    }
  }
  if (moth) {
    const crestN = v.i("crestn", 0, 3);
    for (let i = 0; i < crestN; i += 1) {
      ball(k, thorax, `crest${i}`, {
        rx: thoraxR * v.f("crestw", 0.4, 0.75), ry: thoraxR * v.f("cresth", 0.3, 0.6), rz: thoraxR * 0.35,
        at: [0, thoraxR * (0.8 - i * 0.5), -thoraxR * (0.1 + i * 0.45)],
        color: shade(bodyCol, i % 2 ? 0.28 : -0.18),
      });
    }
  }
  k.idle({ breatheK: v.f("br", 0.025, 0.05), bobAmp: v.f("bob", 0.008, 0.03) });
}

/* ── dragonflies and damselflies ──────────────────────────────────────────── */

function odonata(k, col, opt = {}) {
  const v = vary(k);
  col = toned(k, col);
  const slim = opt.kind === "damselfly";
  const dark = darkOf(col);
  const segs = v.i("segn", slim ? 6 : 4, slim ? 9 : 7);
  const segLen = v.f("segl", 0.09, 0.14);
  const abdR = slim ? v.f("ar", 0.014, 0.022) : v.f("ar", 0.024, 0.04);
  const bodyY = v.f("by", 0.3, 0.42);

  const thorax = ball(k, k.root, "thorax", {
    rx: abdR * v.f("tx", 1.7, 2.5), ry: abdR * v.f("ty", 1.9, 2.8), rz: abdR * v.f("tz", 2.4, 3.6),
    at: [0, bodyY, 0.1], color: dark,
  });
  let p = thorax;
  let at = [0, -abdR * 0.4, -abdR * 2.2];
  for (let i = 0; i < segs; i += 1) {
    const r = abdR * (1 - i * (0.5 / segs));
    p = ball(k, p, `abdomen${i}`, {
      rx: r, ry: r, rz: segLen * 0.62, at, rot: i === 0 ? [v.f("droop", -0.2, 0.1), 0, 0] : null,
      color: i % 2 ? shade(col.base, -0.25) : col.base,
    });
    at = [0, 0, -segLen * 0.86];
  }
  if (v.on("clasp", 0.5)) {
    for (const s of [1, -1]) {
      spindle(k, p, `clasper-${s > 0 ? "l" : "r"}`, { r: abdR * 0.4, len: segLen * 0.4, at: [s * abdR * 0.4, 0, -segLen * 0.5], rot: [-1.5, 0, s * 0.3], color: dark, seg: 8 });
    }
  }

  const headR = abdR * v.f("hr", 2.0, 3.0);
  const head = ball(k, thorax, "head", { rx: headR * 1.15, ry: headR * 0.85, rz: headR * 0.8, at: [0, abdR * 0.5, abdR * 2.6], color: dark });
  const eyeR = headR * v.f("eyer", 0.6, 0.92);
  beadEyes(k, head, {
    r: eyeR, at: [0, headR * 0.15, headR * 0.15], gap: headR * (slim ? 0.95 : 0.6),
    color: col.accent ?? shade(col.base, 0.3), pupil: ink, subdiv: 1,
  });
  antennaPair(k, head, { at: [0, headR * 0.5, headR * 0.3], gap: headR * 0.2, len: 0.03, r: 0.005, spread: 0.7, joint: 1, form: "thread", color: dark });

  const wingLen = v.f("wl", 0.22, 0.36);
  const wingW = v.f("ww", 0.035, 0.065);
  const wingCol = shade(col.accent ?? col.base, v.f("wsh", 0.3, 0.5));
  for (const [i, dz] of [abdR * 1.2, -abdR * 1.4].entries()) {
    bladeWings(k, thorax, {
      at: [0, abdR * 1.4, dz], gap: abdR * 0.8,
      outline: bladeOutline(wingLen * (1 - i * v.f("wtaper", 0.02, 0.2)), wingW * (i ? v.f("hw", 0.9, 1.5) : 1), {
        n: 14, taper: v.f("wt", -0.3, 0.25), notch: v.f("wn", -0.1, 0.25),
      }),
      thick: 0.01, reach: wingLen * 0.85,
      tilt: v.f("wtl", -0.1, 0.12), roll: slim ? v.f("wrl", 0.5, 1.1) : v.f("wrl", -0.05, 0.12),
      color: wingCol, flap: v.f("wf", 0.06, 0.16), dur: v.f("wd", 0.45, 0.8), phase: i * 0.2, name: `wing${i}`,
    });
  }
  const stripeN = v.i("stripen", 0, 3);
  for (let i = 0; i < stripeN; i += 1) {
    ball(k, thorax, `stripe${i}`, { merge: true,
      rx: abdR * 2.6, ry: abdR * 0.5, rz: abdR * 0.6,
      at: [0, abdR * (1.0 - i * 0.9), abdR * (1.4 - i * 1.3)], color: col.accent ?? paper, subdiv: 0,
    });
  }
  insectLegs(k, thorax, {
    at: [0, -abdR * 1.4, abdR * 0.8], gap: abdR * 0.6, pair: 3,
    len: v.f("legl", 0.08, 0.14), r: 0.008, spanZ: abdR * 1.6, splay: 1.0, bend: 1.3, color: ink,
  });
  k.idle({ breatheK: v.f("br", 0.02, 0.04), bobAmp: v.f("bob", 0.006, 0.02) });
}

/* ── ants, bees, wasps ────────────────────────────────────────────────────
 * The ant's whole rear half used to float: head, thorax and gaster were three
 * balls placed by eye with a gap between each. They are now one explicit chain
 * along -Z, each node's joint parked inside the piece in front of it.
 */
function hymenoptera(k, col, opt = {}) {
  const v = vary(k);
  col = toned(k, col);
  const ant = opt.kind === "ant";
  const wasp = opt.kind === "wasp";
  const bee = opt.kind === "bee";
  const dark = darkOf(col);
  const limb = limbOf(col);
  const s0 = ant ? v.f("size", 0.85, 1.25) : v.f("size", 0.88, 1.2);

  const headR = (ant ? 0.05 : 0.07) * s0 * v.f("hr", 0.9, 1.2);
  const thoraxR = (ant ? 0.045 : 0.075) * s0 * v.f("tr", 0.88, 1.2);
  const bodyY = (ant ? 0.15 : 0.28) * v.f("by", 0.9, 1.15);

  // head sits forward, everything else chains back off it
  /* Posture. The whole animal hangs off the head node, so a pitch here tips
     the body as one piece — and where a wasp carries its gaster (level, or
     cocked down as if about to sting) is most of what separates one from the
     next in silhouette. */
  const head = ball(k, k.root, "head", {
    rx: headR * v.f("hw", 0.9, 1.3), ry: headR * v.f("hh", 0.8, 1.15), rz: headR,
    at: [0, bodyY, thoraxR * 1.5 + headR * 0.55],
    rot: ant ? null : [v.f("pitch", -0.34, 0.42), 0, 0],
    color: col.head ?? col.base,
  });
  const thorax = ball(k, head, "thorax", {
    rx: thoraxR * (bee ? v.f("tw", 1.1, 1.32) : wasp ? v.f("tw", 0.8, 0.95) : v.f("tw", 0.85, 1.1)),
    ry: thoraxR * (bee ? v.f("th", 1.05, 1.25) : v.f("th", 0.85, 1.2)),
    rz: thoraxR * (bee ? v.f("tl", 1.0, 1.25) : wasp ? v.f("tl", 1.25, 1.7) : v.f("tl", 1.0, 1.5)),
    at: [0, ant ? headR * 0.15 : 0, -headR * 0.5 - thoraxR * 0.6], color: col.thorax ?? col.base,
  });
  // petiole: 1 or 2 waist nodes, the ant's giveaway and a real part-count knob
  const waistN = ant ? v.i("waist", 1, 2) : wasp ? 2 : 1;
  const waistR = thoraxR * (wasp ? 0.2 : ant ? 0.3 : 0.5);
  let p = thorax;
  let at = [0, ant ? -thoraxR * 0.1 : 0, -thoraxR * 0.9];
  for (let i = 0; i < waistN; i += 1) {
    /* The wasp waist. Two thin nodes on a stalk long enough to SEE, because
       "wasp-waisted" is the only thing separating a wasp from a bee at a
       glance and the previous single bead was buried between two ellipsoids. */
    p = ball(k, p, `petiole${i}`, {
      rx: waistR, ry: waistR * (wasp ? v.f("wh", 1.0, 1.3) : v.f("wh", 1.0, 1.8)),
      rz: waistR * (wasp ? v.f("wz", 1.8, 2.6) : 1.1), at, color: dark,
    });
    at = [0, 0, -waistR * (wasp ? 3.0 : 1.3)];
  }
  const gx = (ant ? 0.055 : bee ? 0.105 : 0.082) * s0 * v.f("gw", 0.85, 1.2);
  const gz = (ant ? 0.075 : bee ? 0.115 : 0.145) * s0 * v.f("gl", 0.85, 1.35);
  const gaster = ball(k, p, "gaster", {
    rx: gx, ry: gx * (bee ? v.f("gh", 0.95, 1.15) : v.f("gh", 0.8, 1.05)), rz: gz,
    at: [0, ant ? gx * 0.15 : 0, -waistR * 0.4 - gz * 0.75], color: col.base,
  });
  /* A wasp gaster comes to a point; a bee carries a blunt furry barrel. The
     count of tail segments is a real species knob — without it the ten wasps
     in the pack were one model in ten tints, which the distinctness gate
     catches and the eye catches faster. */
  if (wasp) {
    let g = gaster;
    const tailN = v.i("tailn", 1, 3);
    for (let i = 0; i < tailN; i += 1) {
      const t = (i + 1) / (tailN + 1);
      g = ball(k, g, `gaster-tip${i}`, {
        rx: gx * (0.72 - t * 0.3), ry: gx * (0.66 - t * 0.28), rz: gz * v.f("tailz", 0.3, 0.55),
        at: [0, 0, i === 0 ? -gz * 0.72 : -gz * v.f("tailz", 0.3, 0.55) * 1.3],
        color: i % 2 ? shade(col.base, -0.24) : (col.accent ?? shade(col.base, 0.1)),
      });
    }
    if (v.on("ovipositor", 0.4)) {
      spindle(k, g, "ovipositor", {
        r: gx * 0.09, len: gz * v.f("ovil", 0.9, 2.2), at: [0, 0, -gz * 0.2],
        rot: [-1.6, 0, 0], color: shade(col.base, -0.4), seg: 8,
      });
    }
  }
  if (bee) {
    for (let i = 0; i < 2; i += 1) {
      ball(k, gaster, `pile${i}`, { merge: true,
        rx: gx * 1.03, ry: gx * 0.98, rz: gz * 0.22,
        at: [0, gx * 0.12, gz * (0.5 - i * 0.62)], color: shade(col.base, 0.34), subdiv: 0,
      });
    }
  }
  const stripeN = opt.stripes === false ? 0 : v.i("stripen", ant ? 0 : 2, ant ? 2 : 4);
  for (let i = 0; i < stripeN; i += 1) {
    ball(k, gaster, `stripe${i}`, { merge: true,
      rx: gx * 1.04, ry: gx * 1.04 * v.f("gh", 0.85, 1.2), rz: gz * 0.12,
      at: [0, 0, gz * (0.62 - i * (1.3 / Math.max(1, stripeN)))], color: col.dark ?? ink, subdiv: 0,
    });
  }
  if (!ant) {
    cone(k, gaster, "sting", { r: gx * 0.24, h: gz * v.f("stingl", 0.4, 0.8), at: [0, 0, -gz * 0.8], rotX: -Math.PI / 2, color: ink });
  } else if (v.on("spine", 0.4)) {
    for (const s of [1, -1]) {
      cone(k, thorax, `spine-${s > 0 ? "l" : "r"}`, { r: thoraxR * 0.2, h: thoraxR * v.f("spinel", 0.6, 1.2), at: [s * thoraxR * 0.5, thoraxR * 0.5, -thoraxR * 0.5], rotZ: s * 0.5, rotX: -0.5, color: dark });
    }
  }

  if (opt.mandibles || v.on("mand", ant ? 0.5 : 0.25)) {
    for (const s of [1, -1]) {
      cone(k, head, `mandible-${s > 0 ? "l" : "r"}`, {
        r: headR * 0.16, h: headR * v.f("mandl", 0.9, 1.9), at: [s * headR * 0.34, -headR * 0.2, headR * 0.45],
        rotX: Math.PI / 2 - 0.2, rotZ: s * v.f("mands", 0.15, 0.5), color: dark,
      });
    }
  }
  antennaPair(k, head, {
    at: [0, headR * 0.45, headR * 0.45], gap: headR * 0.35,
    len: (ant ? v.f("antl", 0.07, 0.13) : v.f("antl", 0.05, 0.1)), r: 0.007,
    spread: v.f("ants", 0.35, 0.8), joint: ant ? 2 : wasp ? 2 : 1, form: ant ? "elbow" : "thread", color: limb,
  });
  insectLegs(k, thorax, {
    at: [0, -thoraxR * 0.5, thoraxR * 0.2], gap: thoraxR * 0.5, pair: 3,
    len: (ant ? v.f("legl", 0.09, 0.16) : v.f("legl", 0.12, 0.19)), r: ant ? 0.008 : 0.011,
    spanZ: thoraxR * v.f("legspan", 0.7, 1.3), splay: v.f("splay", 1.0, 1.45),
    bend: v.f("bend", 0.7, 1.25), color: limb, lenMix: v.f("lenmix", -0.2, 0.2),
  });
  if (bee) {
    /* Pollen baskets: the loaded back legs that read instantly as "bee". */
    for (const sd of [1, -1]) {
      ball(k, thorax, `corbicula-${sd > 0 ? "l" : "r"}`, {
        rx: thoraxR * 0.3, ry: thoraxR * 0.42, rz: thoraxR * 0.3,
        at: [sd * thoraxR * 0.85, -thoraxR * 0.95, -thoraxR * 0.55],
        color: col.accent ?? APP.orange,
      });
    }
  }
  if (!ant) {
    /* Membranous wings. They used to be two narrow slivers held out at a roll,
       which read as grey rods pushed through the body rather than as wings —
       the review could not tell a bee from a wasp from an ant. Broad, swept
       back over the gaster, and pale enough to read as membrane. */
    const wl = (bee ? v.f("wl", 0.15, 0.2) : v.f("wl", 0.16, 0.22));
    const membrane = mix(col.base, hex("#eef0f4"), v.f("wsh", 0.72, 0.86));
    for (const [i, dz] of [thoraxR * 0.15, -thoraxR * 0.5].entries()) {
      bladeWings(k, thorax, {
        at: [0, thoraxR * 0.7, dz], gap: thoraxR * 0.25,
        outline: bladeOutline(wl * (1 - i * 0.3), v.f("ww", 0.05, 0.075) * (1 - i * 0.18), { n: 12, taper: v.f("wt", 0.08, 0.34) }),
        thick: 0.009, reach: wl * 0.82, tilt: v.f("wtl", -0.18, 0.02),
        yaw: v.f("wyaw", 0.6, 0.85) + i * 0.12, roll: v.f("wrl", 0.05, 0.22),
        color: membrane, flap: v.f("wf", 0.22, 0.4), dur: v.f("wd", 0.32, 0.5), phase: i * 0.15, name: `wing${i}`,
      });
    }
    /* A bee is furry and a wasp is bald: the other half of telling them
       apart. The bee pelt is not optional. */
    if (bee || v.on("fuzz", 0.3)) {
      ball(k, thorax, "fuzz", {
        rx: thoraxR * (bee ? 1.42 : 1.15), ry: thoraxR * (bee ? 1.1 : 0.8), rz: thoraxR * (bee ? 1.25 : 1.0),
        at: [0, thoraxR * (bee ? 0.22 : 0.4), 0], color: shade(col.base, bee ? 0.4 : 0.28),
      });
      if (bee) {
        ball(k, thorax, "collar", { merge: true,
          rx: thoraxR * 1.44, ry: thoraxR * 1.08, rz: thoraxR * 0.26,
          at: [0, thoraxR * 0.22, thoraxR * 0.72], color: shade(col.base, -0.3), subdiv: 0,
        });
      }
    }
  }
  beadEyes(k, head, {
    r: headR * v.f("eyer", 0.32, 0.5), at: [0, headR * 0.12, headR * 0.5],
    gap: headR * v.f("eyeg", 0.5, 0.8), color: ink, pupil: paper, spark: false, subdiv: 1,
  });
  k.idle({ breatheK: v.f("br", 0.03, 0.05), bobAmp: ant ? v.f("bob", 0.006, 0.018) : v.f("bob", 0.02, 0.04) });
}

/* ── beetles ──────────────────────────────────────────────────────────────── */

function coleoptera(k, col, opt = {}) {
  const v = vary(k);
  col = toned(k, col);
  const dark = col.dark ?? ink;
  const bx = v.f("bx", 0.12, 0.2);
  const bz = v.f("bz", 0.16, 0.28);
  const by = v.f("by", 0.08, 0.15);
  const bodyY = by * 0.9;
  const body = ball(k, k.root, "elytra", {
    rx: bx, ry: by, rz: bz, at: [0, bodyY, -bz * 0.16], color: col.base, colorFn: col.shellGrad,
  });
  // elytral suture: the split down the wing cases, and a species-scale ridge count
  /* The elytral suture: the seam down the middle of the wing cases. It is the
     one line that says "beetle" rather than "bug", so it is not a coin flip —
     every beetle in the pack gets one, standing proud of the shell so it reads
     at gallery size instead of sinking inside the ellipsoid. */
  ball(k, body, "suture", { merge: true, rx: bx * 0.05, ry: by * 1.04, rz: bz * 0.94, at: [0, by * 0.16, -bz * 0.04], color: shade(col.base, -0.55), subdiv: 0 });
  /* Where the two elytra meet the pronotum they step in — the shoulder notch. */
  for (const sd of [1, -1]) {
    ball(k, body, `shoulder-${sd > 0 ? "l" : "r"}`, { merge: true,
      rx: bx * 0.1, ry: by * 0.6, rz: bz * 0.08, at: [sd * bx * 0.52, by * 0.45, bz * 0.6],
      color: shade(col.base, -0.4), subdiv: 0,
    });
  }
  const ridgeN = v.i("ridgen", 0, 3);
  for (let i = 0; i < ridgeN; i += 1) {
    for (const s of [1, -1]) {
      ball(k, body, `ridge${i}${s > 0 ? "l" : "r"}`, { merge: true,
        rx: bx * 0.05, ry: by * 1.0, rz: bz * 0.8,
        at: [s * bx * (0.3 + i * 0.24), by * 0.15, 0], color: shade(col.base, -0.3), subdiv: 0,
      });
    }
  }
  const pronR = bx * v.f("pron", 0.6, 0.88);
  const pronotum = ball(k, body, "pronotum", {
    rx: pronR, ry: by * v.f("pronh", 0.7, 1.0), rz: bz * v.f("pronz", 0.22, 0.42),
    at: [0, by * 0.1, bz * 0.82], color: col.pronotum ?? shade(col.base, -0.12),
  });
  const headR = pronR * v.f("hr", 0.5, 0.78);
  const head = ball(k, pronotum, "head", { rx: headR, ry: headR * 0.85, rz: headR, at: [0, -by * 0.06, bz * 0.3 + headR * 0.4], color: dark });

  if (opt.horn || v.on("horn", 0.15)) {
    cone(k, head, "horn", { r: headR * 0.3, h: headR * v.f("hornl", 1.6, 3.2), at: [0, headR * 0.3, headR * 0.2], rotX: v.f("horna", 0.3, 0.8), color: shade(col.accent ?? col.base, -0.1) });
    if (v.on("horn2", 0.5)) cone(k, pronotum, "horn2", { r: pronR * 0.16, h: pronR * v.f("horn2l", 0.6, 1.4), at: [0, by * 0.6, bz * 0.1], rotX: 0.5, color: shade(col.accent ?? col.base, -0.2) });
  }
  if (opt.snout) {
    spindle(k, head, "snout", { r: headR * 0.26, len: headR * v.f("snoutl", 1.6, 3.0), at: [0, -headR * 0.1, headR * 0.5], rot: [1.1, 0, 0], tip: 0.5, color: dark });
  }
  antennaPair(k, head, {
    at: [0, headR * 0.4, headR * 0.5], gap: headR * 0.4,
    /* A longhorn's antenna is longer than the beetle. 0.3-0.5 against a body
       of 0.32-0.56 was merely "a normal antenna", which is the one thing a
       longhorn must not have. */
    len: opt.longhorn ? bz * v.f("lhl", 2.2, 3.4) : v.f("antl", 0.09, 0.18), r: opt.longhorn ? 0.007 : 0.008,
    spread: opt.longhorn ? v.f("lhs", 0.75, 1.1) : v.f("ants", 0.4, 0.8),
    joint: opt.longhorn ? 4 : 2, form: opt.longhorn ? "thread" : v.pick("antf", ["club", "thread", "elbow"]),
    wiggle: !opt.longhorn, color: limbOf(col),
  });
  insectLegs(k, k.root, {
    at: [0, bodyY - by * 0.5, bz * 0.1], gap: bx * 0.55, pair: 3,
    len: v.f("legl", 0.1, 0.18), r: 0.013, spanZ: bz * v.f("legspan", 0.4, 0.7),
    splay: v.f("splay", 1.05, 1.45), bend: v.f("bend", 0.8, 1.3), color: limbOf(col), lenMix: v.f("lenmix", -0.25, 0.25),
  });
  /* Tubercles: raised knobs on the wing cases, as real parts rather than
     paint, so the part count and the mass profile move with the species. */
  const tuberN = opt.ladybird ? 0 : v.i("tubern", 0, 3);
  for (let i = 0; i < tuberN; i += 1) {
    for (const sd of [1, -1]) {
      ball(k, body, `tubercle${i}-${sd > 0 ? "l" : "r"}`, {
        rx: bx * v.f("tuberr", 0.14, 0.26), ry: by * v.f("tuberh", 0.35, 0.7), rz: bz * v.f("tuberz", 0.12, 0.22),
        at: [sd * bx * v.f("tuberx", 0.35, 0.62), by * 0.72, bz * (0.42 - i * v.f("tuberd", 0.4, 0.7))],
        color: shade(col.base, i % 2 ? -0.34 : 0.2),
      });
    }
  }
  const dotN = opt.ladybird ? v.i("dotn", 4, 7) : v.i("dotn", 0, 4);
  for (let i = 0; i < dotN; i += 1) {
    const a = (i / dotN) * Math.PI * 2 + v.f("dota", 0, 1.5);
    ball(k, body, `dot${i}`, { merge: true,
      r: v.f("dotr", 0.02, 0.035),
      at: [Math.cos(a) * bx * 0.55, by * 0.82, Math.sin(a) * bz * 0.5],
      color: opt.ladybird ? ink : (i % 2 ? paper : shade(col.base, -0.45)), subdiv: 0,
    });
  }
  beadEyes(k, head, { r: headR * v.f("eyer", 0.34, 0.5), at: [0, headR * 0.1, headR * 0.45], gap: headR * 0.6, color: ink, pupil: paper, spark: false });
  k.idle({ breatheK: v.f("br", 0.02, 0.04), bobAmp: v.f("bob", 0.005, 0.016) });
}

/* ── grasshoppers, katydids, crickets ─────────────────────────────────────── */

function orthoptera(k, col, opt = {}) {
  const v = vary(k);
  const dark = darkOf(col);
  const cricket = opt.kind === "cricket";
  const katydid = opt.kind === "katydid";

  /* Stance is the knob that matters most here. Where the cocked knee sits
     relative to the back decides how the model's mass stacks up its own
     height, and that mass profile is one of the four things the shape
     signature reads — so a crouching pygmy grasshopper and a stilt-legged
     katydid come out as different animals rather than one at two sizes. */
  const stance = v.pick("stance", ["crouch", "cocked", "stilt", "cocked"]);
  /* `fold` swings the femur up and BACK off the hip, `ext` drops the tibia
     from the knee down to the ground. The old table had both signs positive on
     the extension, which folded the knee UNDER the body where nothing could
     see it — the enlarged femur was being built and then hidden. */
  const ST = {
    crouch: { fold: -0.72, ext: -1.72, femur: 0.8, kick: 0.2, pitch: 0.16 },
    cocked: { fold: -0.95, ext: -2.3, femur: 1.05, kick: 0.44, pitch: -0.1 },
    stilt: { fold: -1.18, ext: -2.6, femur: 1.32, kick: 0.12, pitch: -0.3 },
  }[stance];

  const bx = v.f("bx", 0.07, 0.11);
  const bz = v.f("bz", 0.2, 0.32);
  const by = bx * v.f("bh", 0.9, 1.3);
  const bodyY = v.f("by", 0.16, 0.24);
  const body = ball(k, k.root, "body", {
    rx: bx, ry: by, rz: bz, at: [0, bodyY, -bz * 0.1],
    rot: [ST.pitch + v.f("tilt", -0.12, 0.1), 0, 0], color: col.base,
  });

  // abdominal tergites — real rings stepping down the abdomen, not paint
  const tergN = v.i("tergn", 0, 3);
  for (let i = 0; i < tergN; i += 1) {
    ball(k, body, `tergite${i}`, {
      rx: bx * 1.05, ry: by * 1.04, rz: bz * 0.075,
      at: [0, -by * 0.05 * i, -bz * (0.14 + i * 0.24)],
      color: shade(col.base, i % 2 ? -0.34 : 0.14), subdiv: 0,
    });
  }
  // ovipositor / cerci: the blades at the tail end, 0 to 3 pairs
  const oviN = v.i("ovin", 0, 3);
  for (let i = 0; i < oviN; i += 1) {
    for (const s of [1, -1]) {
      spindle(k, body, `ovipositor${i}-${s > 0 ? "l" : "r"}`, {
        r: bx * (0.17 - i * 0.035), len: bz * v.f("ovil", 0.28, 0.75) * (1 - i * 0.2),
        at: [s * bx * 0.24, by * (0.14 - i * 0.3), -bz * 0.76],
        rot: [-1.32 - i * 0.3, 0, s * 0.16], color: shade(col.base, -0.2), seg: 8,
      });
    }
  }

  const pron = ball(k, body, "pronotum", {
    rx: bx * 1.06, ry: by * 1.05, rz: bz * v.f("pz", 0.22, 0.36),
    at: [0, bx * 0.1, bz * 0.62], color: shade(col.base, -0.12),
  });
  const crestN = v.i("crestn", 0, 2);
  for (let i = 0; i < crestN; i += 1) {
    ball(k, pron, `saddle${i}`, {
      rx: bx * 0.34, ry: by * (0.3 + i * 0.2), rz: bz * 0.1,
      at: [0, by * 0.86, bz * (0.05 - i * 0.16)], color: shade(col.base, -0.3), subdiv: 0,
    });
  }
  const headR = bx * v.f("hr", 0.9, 1.25);
  const head = ball(k, pron, "head", {
    rx: headR, ry: headR * v.f("hh", 1.0, 1.4), rz: headR * 0.95,
    at: [0, bx * 0.1, bz * 0.2 + headR * 0.5], color: col.head ?? col.base,
  });
  /* Katydids are the long-horned grasshoppers: the antenna is as long as the
     whole animal and thread-fine, which is the single feature that tells one
     from a grasshopper at a glance. Crickets are long too; only the true
     short-horned grasshoppers get a stubby one. */
  antennaPair(k, head, {
    at: [0, headR * 0.6, headR * 0.3], gap: headR * 0.3,
    len: katydid ? bz * v.f("antl", 2.6, 3.6) : cricket ? bz * v.f("antl", 1.6, 2.4) : v.f("antl", 0.26, 0.5),
    r: katydid ? 0.0045 : cricket ? 0.005 : 0.007,
    spread: v.f("ants", 0.3, 0.7), joint: katydid || cricket ? 4 : 3, form: "thread", color: dark,
  });

  // the big folded jumping legs — the femur angle is the stance
  for (const s of [1, -1]) {
    /* The enlarged hind femur is the whole order. It has to be visibly FATTER
       than the tibia hanging off it — a taper of 0.45 on the femur and 0.35 on
       the tibia made the two the same stick, which is why none of these read
       as a grasshopper. The femur now runs about as wide as the body is deep
       and the tibia stays a thin spring under it. */
    const femurL = v.f("femur", 0.21, 0.3) * ST.femur;
    const femurR = v.f("femurr", 0.042, 0.062);
    const chain = legChain(k, body, `hind-${s > 0 ? "l" : "r"}`, {
      at: [s * bx * 0.85, by * 0.05, -bz * 0.3], r: femurR,
      seg: [
        { len: femurL, rz: s * -0.34, rx: ST.fold, taper: 1.2, bulge: 0.44 },
        { len: femurL * v.f("tibia", 0.95, 1.3), rz: s * 0.12, rx: ST.ext, taper: 0.28 },
        { len: femurL * 0.32, rz: s * 0.08, rx: -1.05 - ST.kick, taper: 0.4 },
      ],
      color: dark,
    });
    /* Knee: the dark cap where a locust's femur meets its tibia. */
    ball(k, chain[0], `knee-${s > 0 ? "l" : "r"}`, {
      merge: true, rx: femurR * 0.85, ry: femurR * 0.7, rz: femurR * 0.85,
      at: [0, femurL * 0.92, 0], color: shade(dark, -0.24), subdiv: 0,
    });
    if (v.on("spur", 0.5)) {
      for (let i = 0; i < 2; i += 1) {
        cone(k, chain[1], `spur${i}${s > 0 ? "l" : "r"}`, { r: 0.008, h: 0.03, at: [0, femurL * (0.4 + i * 0.4), 0], rotZ: s * -1.3, color: dark, seg: 6 });
      }
    }
  }
  insectLegs(k, body, {
    at: [0, -bx * 0.5, bz * 0.3], gap: bx * 0.5, pair: 3,
    len: v.f("legl", 0.09, 0.15), r: 0.011, spanZ: bz * 0.28, splay: 1.2, bend: 1.1, color: dark,
  });

  /* Tegmina folded along the back. They used to be stood on end by a quarter
     turn about X, which put two blades up over the animal like ears; a resting
     orthopteran roofs them along its flanks instead. Roll, not pitch. */
  const wingN = v.i("wingn", 1, 2);
  const wingLen = bz * v.f("wingl", 0.95, 1.3);
  const wingW = bx * v.f("wingw", 0.6, 0.9);
  for (let i = 0; i < wingN; i += 1) {
    for (const s of [1, -1]) {
      const out = bladeOutline(wingW * (1 - i * 0.18), wingLen * (1 - i * 0.12), { n: 10, taper: 0.35, notch: 0.18 });
      blade(k, body, `wingcase${i}${s > 0 ? "l" : "r"}`, {
        outline: out.map(([x, z]) => [x * s, z]), thick: by * 0.24,
        at: [s * bx * (0.34 + i * 0.14), by * v.f("wingy", 0.25, 0.55), bz * 0.2],
        rot: [v.f("wingp", 0.02, 0.14), 0, s * -(0.5 + i * 0.22)],
        off: [s * wingW * 0.4, 0, -wingLen * 0.72],
        color: shade(col.base, i % 2 ? -0.22 : 0.12),
      });
    }
  }
  beadEyes(k, head, { r: headR * v.f("eyer", 0.34, 0.5), at: [0, headR * 0.3, headR * 0.35], gap: headR * 0.62, color: ink, pupil: paper, spark: true });
  k.idle({ breatheK: v.f("br", 0.035, 0.06), bobAmp: v.f("bob", 0.012, 0.03) });
}

/* ── true bugs and cicadas ────────────────────────────────────────────────── */

function hemiptera(k, col, opt = {}) {
  const v = vary(k);
  col = toned(k, col);
  const dark = darkOf(col);
  const cicada = opt.kind === "cicada";
  const bx = cicada ? v.f("bx", 0.09, 0.13) : v.f("bx", 0.1, 0.19);
  const by = cicada ? v.f("by", 0.08, 0.12) : v.f("by", 0.05, 0.1);
  const bz = cicada ? v.f("bz", 0.17, 0.24) : v.f("bz", 0.15, 0.26);
  const bodyY = by * 1.2;
  const body = ball(k, k.root, "body", {
    rx: bx, ry: by, rz: bz, at: [0, bodyY, -bz * 0.1],
    rot: [v.f("pitch", -0.26, 0.22), 0, 0], color: col.base,
  });
  /* The connexivum: the banded rim of the abdomen that shows past the folded
     wings. Real, and a count that separates one shield bug from the next. */
  const rimN = v.i("rimn", 0, 3);
  for (let i = 0; i < rimN; i += 1) {
    for (const sd of [1, -1]) {
      ball(k, body, `rim${i}-${sd > 0 ? "l" : "r"}`, {
        rx: bx * 0.16, ry: by * 0.5, rz: bz * 0.16,
        at: [sd * bx * 0.9, by * 0.1, bz * (0.35 - i * 0.42)],
        color: i % 2 ? shade(col.base, -0.4) : (col.accent ?? paper), subdiv: 0,
      });
    }
  }

  /* The scutellum: the triangular plate between the wing bases, apex pointing
     back down the abdomen. On a shield bug it covers most of the back; on a
     leaf-footed bug it is a small triangle. Either way it is the piece that
     says "true bug" rather than "beetle", so every hemipteran gets one. */
  const scut = v.pick("scut", ["small", "big", "shield"]);
  const scutLen = bz * (scut === "shield" ? v.f("scutl", 0.95, 1.25) : scut === "big" ? v.f("scutl", 0.55, 0.8) : v.f("scutl", 0.3, 0.45));
  const scutW = bx * (scut === "shield" ? 0.86 : 0.62);
  blade(k, body, "scutellum", {
    outline: [[scutW, bz * 0.34], [scutW * 0.86, bz * 0.1], [0, -scutLen], [-scutW * 0.86, bz * 0.1], [-scutW, bz * 0.34]],
    thick: by * 0.34,
    at: [0, by * v.f("scuty", 0.5, 0.72), bz * 0.16],
    rot: [v.f("scutp", 0.02, 0.14), 0, 0],
    color: shade(col.base, v.f("scutsh", -0.3, 0.05)),
  });
  const pronotum = ball(k, body, "pronotum", {
    rx: bx * v.f("pw", 0.85, 1.12), ry: by * v.f("ph", 0.8, 1.1), rz: bz * v.f("pz", 0.2, 0.38),
    at: [0, by * 0.12, bz * 0.62], color: dark,
  });
  if (v.on("shoulder", 0.4)) {
    for (const s of [1, -1]) {
      cone(k, pronotum, `shoulder-${s > 0 ? "l" : "r"}`, { r: by * 0.35, h: bx * v.f("shl", 0.3, 0.6), at: [s * bx * 0.7, by * 0.1, 0], rotZ: s * -1.4, color: shade(dark, -0.1) });
    }
  }
  const headR = bx * v.f("hr", 0.32, 0.5);
  const head = ball(k, pronotum, "head", { rx: headR * v.f("hw", 0.9, 1.4), ry: headR * 0.75, rz: headR, at: [0, -by * 0.05, bz * 0.22 + headR * 0.5], color: dark });
  const rostrum = v.f("rostrum", 0.05, 0.14);
  spindle(k, head, "rostrum", { r: 0.008, len: rostrum, at: [0, -headR * 0.4, headR * 0.3], rot: [v.f("rosta", 1.4, 2.4), 0, 0], color: shade(dark, -0.1), seg: 8 });
  antennaPair(k, head, {
    at: [0, headR * 0.2, headR * 0.5], gap: headR * 0.5,
    len: v.f("antl", 0.06, 0.16), r: 0.007, spread: v.f("ants", 0.5, 1.0), joint: 2, form: v.pick("antf", ["thread", "club"]), color: dark,
  });

  /* Wing carriage. A true bug's hemelytra lie FLAT over the abdomen and that
     flat shield is the whole silhouette — the previous pose stood them on end
     (rotX of a half turn) and every shield bug in the pack read as a rabbit.
     A cicada is the one exception here: it roofs its long clear wings over the
     body, so it gets a real tent angle and a wing longer than its abdomen. */
  const wingCol = cicada ? shade(col.base, 0.42) : shade(col.base, v.f("wsh", -0.26, 0.1));
  const wingLen = cicada ? bz * v.f("cwl", 1.15, 1.5) : bz * v.f("wl", 0.62, 0.82);
  const wingW = cicada ? bx * v.f("cww", 0.5, 0.68) : bx * v.f("ww", 0.66, 0.84);
  const wingTilt = cicada ? v.f("wingp", 0.1, 0.24) : v.f("wingp", 0.02, 0.12);
  const wingRoll = cicada ? v.f("wingr", 0.5, 0.9) : v.f("wingr", 0.04, 0.2);
  for (const s of [1, -1]) {
    const out = bladeOutline(wingW, wingLen, { n: 12, taper: v.f("wt", 0.1, 0.34), notch: v.f("wn", -0.15, 0.2) });
    const w = blade(k, body, `wing-${s > 0 ? "l" : "r"}`, {
      outline: out.map(([x, z]) => [x * s, z]), thick: by * v.f("wth", 0.16, 0.26),
      at: [s * bx * v.f("wingx", 0.28, 0.42), by * v.f("wingy", 0.42, 0.62), bz * 0.28],
      rot: [wingTilt, 0, s * -wingRoll], off: [s * wingW * 0.5, 0, -wingLen * 0.72],
      color: wingCol,
    });
    /* The membrane: the clear, differently-coloured back third of a hemelytron,
       the split that names the order (hemi-elytron, "half wing case"). */
    ball(k, w, `membrane-${s > 0 ? "l" : "r"}`, {
      merge: true, rx: wingW * 0.82, ry: by * 0.1, rz: wingLen * 0.3,
      at: [s * wingW * 0.5, by * 0.06, -wingLen * 1.34],
      color: shade(wingCol, cicada ? 0.3 : -0.34), subdiv: 0,
    });
  }
  const markN = v.i("markn", 0, 4);
  for (let i = 0; i < markN; i += 1) {
    const a = (i / markN) * Math.PI * 2 + v.f("marka", 0, 1.4);
    ball(k, body, `mark${i}`, { merge: true,
      r: v.f("markr", 0.018, 0.032), at: [Math.cos(a) * bx * 0.55, by * 0.9, Math.sin(a) * bz * 0.5],
      color: i % 2 ? ink : (col.accent ?? paper), subdiv: 0,
    });
  }
  insectLegs(k, k.root, {
    at: [0, bodyY - by * 0.4, bz * 0.15], gap: bx * 0.5, pair: 3,
    len: v.f("legl", 0.09, 0.17), r: 0.011, spanZ: bz * v.f("legspan", 0.35, 0.65),
    splay: v.f("splay", 1.05, 1.4), bend: v.f("bend", 0.8, 1.25), color: dark, lenMix: v.f("lenmix", -0.3, 0.3),
  });
  beadEyes(k, head, {
    r: headR * v.f("eyer", 0.4, 0.56), at: [0, 0, headR * 0.15], gap: headR * v.f("eyeg", 0.8, 1.05),
    color: cicada ? (col.accent ?? shade(col.base, 0.3)) : ink, pupil: cicada ? ink : paper, pupilR: 0.36, spark: cicada,
  });
  k.idle({ breatheK: v.f("br", 0.035, 0.06), bobAmp: v.f("bob", 0.008, 0.022) });
}

/* ── flies, mosquitoes, crane flies ───────────────────────────────────────── */

function diptera(k, col, opt = {}) {
  const v = vary(k);
  col = toned(k, col);
  const mos = opt.kind === "mosquito";
  const crane = opt.kind === "crane";
  /* `diptera-mothfly` and `diptera-hover` both arrive as kind "fly", so the
     two shapes that make them recognisable — a moth fly's furry roof-held
     wings and a hoverfly's banded abdomen — have to be recovered here. The
     hoverfly carries `stripes`; the moth flies are named. */
  const mothfly = /^(clogmia|psychoda)-/.test(who(k));
  const hover = opt.stripes === true && !mos && !crane;
  const dark = darkOf(col);
  const limb = limbOf(col);
  const s0 = mos ? 0.55 : crane ? 0.8 : mothfly ? 0.9 : 1;
  const abdR = v.f("ar", 0.05, 0.085) * s0;
  const abdZ = v.f("az", 0.1, 0.19) * (mos ? 1.6 : 1) * s0;
  const bodyY = v.f("by", 0.2, 0.32);

  const thoraxR = v.f("tr", 0.055, 0.085) * s0;
  const thorax = ball(k, k.root, "thorax", {
    rx: thoraxR * v.f("tw", 0.9, 1.15), ry: thoraxR * v.f("th", 0.85, 1.2), rz: thoraxR * v.f("tz", 0.95, 1.35),
    at: [0, bodyY, thoraxR * 0.6], rot: [v.f("pitch", -0.34, 0.28), 0, 0], color: dark,
  });
  const abdN = v.i("abdn", 1, 5);
  let p = thorax;
  let at = [0, -thoraxR * 0.1, -thoraxR * 1.0];
  for (let i = 0; i < abdN; i += 1) {
    const t = i / Math.max(1, abdN);
    p = ball(k, p, `abdomen${i}`, {
      rx: abdR * (1 - t * 0.35), ry: abdR * (1 - t * 0.35) * v.f("ah", 0.8, 1.1), rz: abdZ / abdN * 0.72,
      at, color: i % 2 ? shade(col.base, -0.22) : col.base,
    });
    at = [0, 0, -(abdZ / abdN) * 1.05];
  }
  if (opt.stripes || v.on("stripe", 0.4)) {
    for (let i = 0; i < 2; i += 1) {
      ball(k, thorax, `stripe${i}`, { merge: true, rx: thoraxR * 1.05, ry: thoraxR * 1.05, rz: thoraxR * 0.14, at: [0, 0, thoraxR * (0.5 - i * 0.7)], color: i % 2 ? (col.accent ?? APP.orange) : ink, subdiv: 0 });
    }
  }
  const headR = thoraxR * v.f("hr", 0.7, 1.0);
  const head = ball(k, thorax, "head", { rx: headR * v.f("hw", 1.0, 1.35), ry: headR, rz: headR * 0.85, at: [0, thoraxR * 0.05, thoraxR * 0.7 + headR * 0.4], color: dark });
  /* A fly's compound eye is a dull red-brown, and it covers most of the head.
     Routing the palette ACCENT here painted a hot-magenta head onto nearly
     every species in the family, which is what the review saw. */
  const eyeR = headR * v.f("eyer", 0.62, 0.95);
  const eyeCol = shade(hex("#9c4430"), v.f("eyesh", -0.16, 0.18));
  beadEyes(k, head, { r: eyeR, at: [0, headR * 0.05, headR * 0.1], gap: headR * v.f("eyeg", 0.5, 0.8), color: eyeCol, pupil: shade(eyeCol, -0.5), pupilR: 0.34, spark: true });
  if (mos) {
    spindle(k, head, "proboscis", { r: 0.007, len: v.f("prob", 0.13, 0.22), at: [0, -headR * 0.3, headR * 0.4], rot: [1.9, 0, 0], color: ink, seg: 8 });
  } else if (v.on("prob", 0.5)) {
    ball(k, head, "labellum", { rx: headR * 0.35, ry: headR * 0.3, rz: headR * 0.4, at: [0, -headR * 0.7, headR * 0.3], color: shade(dark, 0.2), subdiv: 0 });
  }
  antennaPair(k, head, {
    at: [0, headR * 0.5, headR * 0.4], gap: headR * 0.25,
    len: mos ? v.f("antl", 0.06, 0.11) : v.f("antl", 0.03, 0.07), r: 0.006,
    spread: v.f("ants", 0.4, 0.9), joint: 2, form: mos && v.on("plume", 0.6) ? "feather" : "thread",
    barb: mos && v.on("plume", 0.6) ? v.i("plumen", 2, 4) : 0, wiggle: false, color: ink,
  });

  /* Wings. Two things were wrong: they ran straight out sideways like the
     wings of a model aeroplane, and they were painted a saturated tint of the
     body. A resting fly sweeps its wings BACK over the abdomen and the
     membrane is smoke, not peach — so yaw is the fix for the first and a mix
     towards paper is the fix for the second. A moth fly is the exception: it
     holds broad furry wings roofed over its back like a tiny moth. */
  const wl = v.f("wl", 0.12, 0.2) * (crane ? 1.35 : 1) * (mos ? 0.85 : 1) * (mothfly ? 0.75 : 1);
  const ww = (mothfly ? v.f("ww", 0.085, 0.11) : v.f("ww", 0.038, 0.07)) * (crane ? 0.8 : 1);
  const wingCol = mothfly
    ? mix(col.base, hex("#d8cec2"), 0.45)
    : mix(col.base, hex("#e6e8ec"), v.f("wsh", 0.68, 0.84));
  bladeWings(k, thorax, {
    at: [0, thoraxR * 0.6, -thoraxR * 0.1], gap: thoraxR * 0.3,
    outline: bladeOutline(wl, ww, { n: 12, taper: v.f("wt", 0.1, 0.4), notch: v.f("wn", -0.1, 0.22) }),
    thick: mothfly ? 0.014 : 0.009, reach: wl * 0.85,
    tilt: mothfly ? v.f("wtl", 0.1, 0.26) : v.f("wtl", -0.16, 0.06),
    yaw: mothfly ? v.f("wyaw", 0.85, 1.05) : v.f("wyaw", 0.5, 0.78),
    roll: mothfly ? v.f("wrl", 0.45, 0.7) : v.f("wrl", 0.03, 0.2),
    color: wingCol, flap: mothfly ? 0.05 : v.f("wf", 0.2, 0.35), dur: v.f("wd", 0.22, 0.4), name: "wing",
  });
  /* Halteres: the drumstick stubs that are the second pair of wings. Two
     wings and two knobs is the definition of the order. */
  for (const sd of [1, -1]) {
    const h = spindle(k, thorax, `haltere-${sd > 0 ? "l" : "r"}`, {
      r: 0.0045, len: thoraxR * 0.7, at: [sd * thoraxR * 0.55, 0, -thoraxR * 0.5],
      rot: [-0.5, 0, sd * -1.1], color: shade(col.base, 0.3), seg: 6,
    });
    ball(k, h, `haltere-knob-${sd > 0 ? "l" : "r"}`, { merge: true, r: 0.011, at: [0, thoraxR * 0.66, 0], color: shade(col.base, 0.16), subdiv: 0 });
  }
  /* A hoverfly is a wasp mimic: the identity is the black-and-yellow BANDING
     across the abdomen, not a stripe on the thorax. */
  if (hover) {
    for (let i = 0; i < 3; i += 1) {
      ball(k, thorax, `gasterband${i}`, { merge: true,
        rx: abdR * 1.02, ry: abdR * 0.95, rz: abdZ * 0.09,
        at: [0, -thoraxR * 0.12, -thoraxR * 1.0 - abdZ * (0.18 + i * 0.42)],
        color: i % 2 ? (col.accent ?? APP.orange) : ink, subdiv: 0,
      });
    }
  }
  if (mothfly) {
    ball(k, thorax, "pelt", { rx: thoraxR * 1.25, ry: thoraxR * 1.1, rz: thoraxR * 1.15, at: [0, thoraxR * 0.2, 0], color: shade(col.base, 0.24) });
  }
  const bristleN = v.i("bristlen", 0, 4);
  for (let i = 0; i < bristleN; i += 1) {
    for (const s of [1, -1]) {
      spindle(k, thorax, `bristle${i}-${s > 0 ? "l" : "r"}`, {
        r: 0.004, len: thoraxR * v.f("bristlel", 0.5, 1.1),
        at: [s * thoraxR * 0.35, thoraxR * 0.6, thoraxR * (0.4 - i * 0.35)],
        rot: [v.f("bristlea", -0.6, 0.2), 0, s * 0.35], color: ink, seg: 5,
      });
    }
  }
  if (v.on("halt", 0.6)) {
    for (const s of [1, -1]) {
      const h = spindle(k, thorax, `halter-${s > 0 ? "l" : "r"}`, { r: 0.006, len: thoraxR * 0.9, at: [s * thoraxR * 0.4, 0, -thoraxR * 0.6], rot: [0, 0, s * -0.9], color: ink, seg: 8 });
      ball(k, h, `halterknob-${s > 0 ? "l" : "r"}`, { r: 0.013, at: [0, thoraxR * 0.8, 0], color: shade(col.base, 0.2), subdiv: 0 });
    }
  }
  insectLegs(k, thorax, {
    at: [0, -thoraxR * 0.6, thoraxR * 0.2], gap: thoraxR * 0.5, pair: 3,
    len: crane ? v.f("legl", 0.22, 0.34) : mos ? v.f("legl", 0.16, 0.24) : v.f("legl", 0.1, 0.17),
    r: crane ? 0.006 : 0.008, spanZ: thoraxR * v.f("legspan", 0.6, 1.1),
    splay: v.f("splay", 1.0, 1.4), bend: v.f("bend", 0.9, 1.4), color: ink, lenMix: v.f("lenmix", -0.3, 0.3),
  });
  k.idle({ breatheK: v.f("br", 0.03, 0.05), bobAmp: v.f("bob", 0.03, 0.06) });
}

/* ── mantis ───────────────────────────────────────────────────────────────
 * The raptorial forelegs used to be two loose sticks parked near the thorax.
 * They are now a real chain — coxa, femur, folded tibia — hinged into the
 * prothorax, so the whole animal is one connected run.
 */
function mantis(k, col, opt = {}) {
  const v = vary(k);
  const dark = darkOf(col);
  const bodyLen = v.f("bodyl", 0.34, 0.5);
  const r = v.f("r", 0.05, 0.075);
  const baseY = v.f("basey", 0.12, 0.2);
  const lean = v.f("lean", -0.35, -0.12);

  const abdomen = k.cute.node("abdomen", { parent: k.root, at: [0, baseY, -bodyLen * 0.18], rot: [lean, 0, 0] });
  k.cute.add(abdomen, ballGeo(r, bodyLen * 0.34, r * v.f("abdz", 0.85, 1.3), 1), { at: [0, bodyLen * 0.3, 0], color: col.base });
  k.cute.swing(abdomen, { axis: "z", amp: 0.05, base: 0, dur: v.f("swayd", 1.7, 2.5) });

  const segN = v.i("segn", 1, 3);
  for (let i = 0; i < segN; i += 1) {
    ball(k, abdomen, `tergite${i}`, { merge: true,
      rx: r * 1.03, ry: bodyLen * 0.06, rz: r * 1.03,
      at: [0, bodyLen * (0.16 + i * 0.2), 0], color: shade(col.base, i % 2 ? -0.22 : 0.14), subdiv: 0,
    });
  }
  const neckLen = v.f("neck", 0.1, 0.22);
  const prothorax = k.cute.node("prothorax", { parent: abdomen, at: [0, bodyLen * 0.58, 0], rot: [v.f("necka", -0.1, 0.35), 0, 0] });
  k.cute.add(prothorax, ballGeo(r * v.f("pw", 0.5, 0.75), neckLen * 0.62, r * 0.7, 1), { at: [0, neckLen * 0.42, 0], color: shade(col.base, -0.08) });

  const headR = r * v.f("hr", 0.9, 1.3);
  const head = ball(k, prothorax, "head", {
    rx: headR * v.f("hw", 1.1, 1.5), ry: headR * 0.78, rz: headR * 0.8,
    at: [0, neckLen * 0.8, headR * 0.15], color: col.head ?? col.base,
  });
  beadEyes(k, head, { r: headR * v.f("eyer", 0.55, 0.85), at: [0, headR * 0.1, headR * 0.15], gap: headR * v.f("eyeg", 0.85, 1.2), color: shade(col.base, 0.3), pupil: ink });
  antennaPair(k, head, {
    at: [0, headR * 0.5, headR * 0.3], gap: headR * 0.35, len: v.f("antl", 0.12, 0.3), r: 0.006,
    spread: v.f("ants", 0.25, 0.6), joint: 2, form: "thread", color: dark,
  });

  // raptorial forelegs
  for (const s of [1, -1]) {
    const femurL = v.f("foreleg", 0.12, 0.2);
    const chain = legChain(k, prothorax, `fore-${s > 0 ? "l" : "r"}`, {
      at: [s * r * 0.4, neckLen * 0.35, r * 0.2], r: v.f("forer", 0.016, 0.026),
      seg: [
        { len: femurL, rz: s * -0.55, rx: v.f("forea", 0.8, 1.5), taper: 0.6, bulge: 0.4 },
        { len: femurL * v.f("foretib", 0.7, 1.0), rz: s * 0.25, rx: -2.3, taper: 0.6 },
        { len: femurL * 0.35, rz: s * 0.1, rx: -0.6, taper: 0.7 },
      ],
      color: dark,
    });
    const spineN = v.i("spinen", 0, 3);
    for (let i = 0; i < spineN; i += 1) {
      cone(k, chain[0], `spine${i}${s > 0 ? "l" : "r"}`, {
        r: 0.008, h: v.f("spinel", 0.02, 0.045), at: [0, femurL * (0.25 + i * 0.24), 0], rotX: 1.6, color: shade(dark, -0.15), seg: 6,
      });
    }
  }
  // walking legs
  insectLegs(k, abdomen, {
    at: [0, bodyLen * 0.36, 0], gap: r * 0.6, pair: 2,
    len: v.f("legl", 0.14, 0.24), r: 0.012, spanZ: bodyLen * 0.12,
    splay: v.f("splay", 1.1, 1.5), bend: v.f("bend", 1.0, 1.5), color: dark,
  });
  if (v.on("wing", 0.55)) {
    for (const s of [1, -1]) {
      const wl = v.f("wingl", 0.14, 0.28);
      blade(k, abdomen, `wing-${s > 0 ? "l" : "r"}`, {
        outline: bladeOutline(0.035, wl, { n: 10, taper: 0.35 }), thick: 0.014,
        at: [s * r * 0.4, bodyLen * 0.44, 0], rot: [0, 0, s * 0.16], off: [0, -wl * 0.72, 0],
        color: shade(col.base, s > 0 ? 0.16 : 0.04),
      });
    }
  }
  k.idle({ breatheK: v.f("br", 0.03, 0.05), bobAmp: 0 });
}

/* ── cockroaches and termites ─────────────────────────────────────────────── */

function blattodea(k, col, opt = {}) {
  const v = vary(k);
  col = toned(k, col);
  const dark = darkOf(col);
  const termite = opt.kind === "termite";
  const bx = termite ? v.f("bx", 0.05, 0.075) : v.f("bx", 0.11, 0.17);
  const by = termite ? v.f("by", 0.05, 0.075) : v.f("by", 0.045, 0.075);
  const bz = termite ? v.f("bz", 0.14, 0.22) : v.f("bz", 0.17, 0.26);
  const bodyY = by * 1.2;
  const body = ball(k, k.root, "abdomen", {
    rx: bx, ry: by, rz: bz, at: [0, bodyY, -bz * 0.2],
    rot: [v.f("pitch", -0.28, 0.24), 0, 0], color: col.base,
  });
  const segN = v.i("segn", 0, 4);
  for (let i = 0; i < segN; i += 1) {
    ball(k, body, `tergite${i}`, { merge: true,
      rx: bx * 1.02, ry: by * 1.02, rz: bz * 0.1,
      at: [0, 0, -bz * (0.1 + i * (1.4 / (segN + 1)))], color: shade(col.base, i % 2 ? -0.24 : 0.12), subdiv: 0,
    });
  }
  if (!termite && v.on("wingcase", 0.8)) {
    for (const s of [1, -1]) {
      ball(k, body, `wingcase-${s > 0 ? "l" : "r"}`, {
        rx: bx * v.f("wcx", 0.42, 0.6), ry: by * v.f("wch", 0.7, 1.0), rz: bz * v.f("wcz", 0.75, 0.98),
        at: [s * bx * v.f("wcs", 0.2, 0.42), by * 0.24, -bz * 0.02], color: shade(col.base, s > 0 ? 0.1 : 0.02),
      });
    }
  }
  const thorax = ball(k, body, "pronotum", {
    rx: bx * v.f("pw", 0.75, 1.0), ry: by * v.f("ph", 0.75, 1.0), rz: bz * v.f("pz", 0.22, 0.4),
    at: [0, by * 0.12, bz * 0.72], color: shade(col.base, termite ? 0.08 : -0.16),
  });
  const headR = bx * v.f("hr", 0.42, 0.65);
  const head = ball(k, thorax, "head", { rx: headR, ry: headR * 0.85, rz: headR * v.f("hz", 0.85, 1.2), at: [0, -by * 0.06, bz * 0.24 + headR * 0.5], color: darkOf(col) });
  if (termite && v.on("soldier", 0.4)) {
    for (const s of [1, -1]) {
      cone(k, head, `mandible-${s > 0 ? "l" : "r"}`, { r: headR * 0.2, h: headR * v.f("mandl", 1.2, 2.2), at: [s * headR * 0.4, 0, headR * 0.5], rotX: Math.PI / 2, rotZ: s * 0.3, color: shade(dark, -0.15) });
    }
  }
  antennaPair(k, head, {
    at: [0, headR * 0.4, headR * 0.5], gap: headR * 0.4,
    len: termite ? v.f("antl", 0.07, 0.13) : v.f("antl", 0.22, 0.4), r: 0.007,
    spread: v.f("ants", 0.25, 0.6), joint: termite ? 2 : 3, form: "thread", color: ink,
  });
  for (const s of (v.on("cercus", 0.7) ? [1, -1] : [])) {
    spindle(k, body, `cercus-${s > 0 ? "l" : "r"}`, {
      r: 0.008, len: v.f("cercl", 0.04, 0.09), at: [s * bx * 0.35, by * 0.2, -bz * 0.85],
      rot: [-1.6, 0, s * 0.4], color: ink, seg: 8,
    });
  }
  insectLegs(k, k.root, {
    at: [0, bodyY - by * 0.4, bz * 0.2], gap: bx * 0.5, pair: 3,
    len: v.f("legl", 0.1, 0.18), r: 0.009, spanZ: bz * v.f("legspan", 0.4, 0.7),
    splay: v.f("splay", 1.1, 1.45), bend: v.f("bend", 0.9, 1.4), color: ink, lenMix: v.f("lenmix", -0.3, 0.3),
  });
  beadEyes(k, head, { r: headR * v.f("eyer", 0.4, 0.6), at: [0, headR * 0.1, headR * 0.4], gap: headR * 0.62, color: ink, pupil: paper, spark: false });
  k.idle({ breatheK: v.f("br", 0.03, 0.05), bobAmp: v.f("bob", 0.006, 0.02) });
}

/* ── earwigs ──────────────────────────────────────────────────────────────── */

function dermaptera(k, col, opt = {}) {
  const v = vary(k);
  const dark = darkOf(col);
  const bx = v.f("bx", 0.07, 0.1);
  const by = v.f("by", 0.04, 0.065);
  const bz = v.f("bz", 0.16, 0.24);
  const bodyY = by * 1.2;
  const body = ball(k, k.root, "body", { rx: bx, ry: by, rz: bz, at: [0, bodyY, -bz * 0.1], color: col.base });
  const segN = v.i("segn", 2, 4);
  for (let i = 0; i < segN; i += 1) {
    ball(k, body, `tergite${i}`, { merge: true, rx: bx * 1.02, ry: by * 1.02, rz: bz * 0.09, at: [0, 0, -bz * (0.05 + i * (1.5 / (segN + 1)))], color: shade(col.base, i % 2 ? -0.24 : 0.1), subdiv: 0 });
  }
  for (const s of [1, -1]) {
    ball(k, body, `elytron-${s > 0 ? "l" : "r"}`, {
      rx: bx * 0.45, ry: by * 0.8, rz: bz * v.f("elz", 0.28, 0.44),
      at: [s * bx * 0.4, by * 0.3, bz * 0.3], color: shade(col.base, -0.14),
    });
  }
  const head = ball(k, body, "head", { rx: bx * 0.6, ry: by * 0.9, rz: bx * 0.55, at: [0, by * 0.15, bz * 0.9], color: dark });
  antennaPair(k, head, { at: [0, bx * 0.3, bx * 0.4], gap: bx * 0.3, len: v.f("antl", 0.12, 0.24), r: 0.006, spread: v.f("ants", 0.3, 0.7), joint: 2, form: "thread", color: dark });
  // forceps
  const forcep = v.f("forcep", 0.09, 0.18);
  for (const s of [1, -1]) {
    legChain(k, body, `forcep-${s > 0 ? "l" : "r"}`, {
      at: [s * bx * 0.4, by * 0.2, -bz * 0.82], r: v.f("forcepr", 0.009, 0.015),
      seg: [
        { len: forcep * 0.6, rz: s * -0.2, rx: -1.45, taper: 0.8 },
        { len: forcep * 0.5, rz: s * 0.55, rx: 0, taper: 0.4 },
      ],
      color: shade(dark, -0.12),
    });
  }
  insectLegs(k, k.root, {
    at: [0, bodyY - by * 0.4, bz * 0.25], gap: bx * 0.5, pair: 3,
    len: v.f("legl", 0.08, 0.14), r: 0.009, spanZ: bz * 0.4, splay: v.f("splay", 1.1, 1.45), bend: v.f("bend", 0.9, 1.3), color: dark,
  });
  beadEyes(k, head, { r: bx * v.f("eyer", 0.18, 0.28), at: [0, by * 0.1, bx * 0.4], gap: bx * 0.34, color: ink, pupil: paper, spark: false });
  k.idle({ breatheK: v.f("br", 0.03, 0.05), bobAmp: v.f("bob", 0.006, 0.018) });
}

/* ── stick insects ────────────────────────────────────────────────────────── */

function phasmatodea(k, col, opt = {}) {
  const v = vary(k);
  const dark = darkOf(col);
  const segN = v.i("segn", 4, 7);
  const segLen = v.f("segl", 0.1, 0.17);
  const r = v.f("r", 0.013, 0.026);
  const startY = v.f("y", 0.28, 0.4);
  let p = k.root;
  let at = [0, startY, segLen * 0.4];
  const seg = [];
  for (let i = 0; i < segN; i += 1) {
    const n = ball(k, p, `seg${i}`, {
      rx: r * (1 - i * 0.04), ry: r * (1 - i * 0.04), rz: segLen * 0.62,
      at, rot: [v.f("bend", -0.06, 0.06) * (i ? 1 : 0), v.f("yaw", -0.05, 0.05) * (i ? 1 : 0), 0],
      color: i % 2 ? shade(col.base, 0.1) : col.base,
    });
    seg.push(n);
    p = n;
    at = [0, 0, -segLen * 0.86];
  }
  const headR = r * v.f("hr", 1.5, 2.3);
  const head = ball(k, seg[0], "head", { rx: headR * 0.9, ry: headR * 0.85, rz: headR * 1.15, at: [0, r * 0.2, segLen * 0.5], color: col.head ?? col.base });
  antennaPair(k, head, { at: [0, headR * 0.4, headR * 0.5], gap: headR * 0.35, len: v.f("antl", 0.08, 0.2), r: 0.005, spread: v.f("ants", 0.25, 0.6), joint: 2, form: "thread", color: dark });
  beadEyes(k, head, { r: headR * 0.42, at: [0, headR * 0.15, headR * 0.4], gap: headR * 0.55, color: ink, pupil: paper, spark: false });
  for (let i = 0; i < 3; i += 1) {
    const host = seg[Math.min(seg.length - 1, i)];
    for (const s of [1, -1]) {
      legChain(k, host, `leg${i}-${s > 0 ? "l" : "r"}`, {
        at: [s * r * 0.5, 0, segLen * 0.1], r: v.f("legr", 0.007, 0.011),
        seg: [
          { len: v.f("legl", 0.13, 0.24), rz: s * -1.25, rx: (1 - i) * 0.7, taper: 0.8 },
          { len: v.f("legl", 0.13, 0.24) * 0.8, rz: s * -0.7, taper: 0.6 },
        ],
        color: dark,
      });
    }
  }
  if (v.on("leaf", 0.3)) {
    for (const s of [1, -1]) {
      blade(k, seg[1] ?? seg[0], `lobe-${s > 0 ? "l" : "r"}`, {
        outline: bladeOutline(0.05, segLen * 0.5, { n: 9, taper: 0.3 }), thick: 0.012,
        at: [s * r * 0.6, 0, 0], rot: [0, 0, s * 0.2], off: [s * 0.045, 0, 0], color: shade(col.base, 0.18),
      });
    }
  }
  k.idle({ breatheK: v.f("br", 0.02, 0.04), bobAmp: 0 });
}

/* ── the long tail: any insect the router could not place ─────────────────── */

function insectGeneric(k, col, opt = {}) {
  const v = vary(k);
  const dark = darkOf(col);
  const bx = v.f("bx", 0.055, 0.095);
  const by = v.f("by", 0.045, 0.08);
  const bz = v.f("bz", 0.1, 0.2);
  const bodyY = by * 1.3;
  const body = ball(k, k.root, "body", { rx: bx, ry: by, rz: bz, at: [0, bodyY, -bz * 0.15], color: col.base });
  const segN = v.i("segn", 0, 3);
  for (let i = 0; i < segN; i += 1) {
    ball(k, body, `seg${i}`, { rx: bx * 1.02, ry: by * 1.02, rz: bz * 0.1, at: [0, 0, -bz * (0.1 + i * 0.4)], color: shade(col.base, i % 2 ? -0.22 : 0.14), subdiv: 0 });
  }
  const thorax = ball(k, body, "thorax", { rx: bx * v.f("tw", 0.8, 1.05), ry: by * v.f("th", 0.85, 1.1), rz: bz * v.f("tz", 0.25, 0.45), at: [0, by * 0.1, bz * 0.7], color: shade(col.base, -0.12) });
  const headR = bx * v.f("hr", 0.5, 0.8);
  const head = ball(k, thorax, "head", { r: headR, at: [0, 0, bz * 0.28 + headR * 0.5], color: dark });
  antennaPair(k, head, { at: [0, headR * 0.4, headR * 0.5], gap: headR * 0.35, len: v.f("antl", 0.06, 0.16), r: 0.006, spread: v.f("ants", 0.3, 0.8), joint: 2, form: v.pick("antf", ["thread", "club"]), color: dark });
  insectLegs(k, k.root, {
    at: [0, bodyY - by * 0.4, bz * 0.2], gap: bx * 0.5, pair: 3,
    len: v.f("legl", 0.08, 0.15), r: 0.008, spanZ: bz * 0.4, splay: v.f("splay", 1.05, 1.45), bend: v.f("bend", 0.85, 1.3), color: dark, lenMix: v.f("lenmix", -0.3, 0.3),
  });
  if (v.on("wing", 0.5)) {
    const wl = v.f("wl", 0.08, 0.16);
    bladeWings(k, body, {
      at: [0, by * 0.7, bz * 0.1], gap: bx * 0.3,
      outline: bladeOutline(wl, v.f("ww", 0.035, 0.06), { n: 10, taper: v.f("wt", -0.2, 0.25) }),
      thick: 0.01, reach: wl * 0.82, tilt: -0.1, roll: v.f("wrl", 0.1, 0.35),
      color: shade(col.base, 0.35), flap: 0.2, dur: v.f("wd", 0.4, 0.8), name: "wing",
    });
  }
  beadEyes(k, head, { r: headR * v.f("eyer", 0.4, 0.62), at: [0, headR * 0.05, headR * 0.4], gap: headR * 0.6, color: ink, pupil: paper, spark: true });
  k.idle({ breatheK: v.f("br", 0.035, 0.06), bobAmp: v.f("bob", 0.008, 0.025) });
}

/* ── spiders ──────────────────────────────────────────────────────────────
 * The single worst family in the pack: 38 of 42 shipped with the front pair of
 * legs floating and 41 of 42 were near-duplicates of each other. Legs are now
 * jointed chains hinged INSIDE the cephalothorax, and the shape knobs that
 * matter to a spider — abdomen form, leg length and posture, how many of the
 * eight eyes are drawn, spinnerets, spines — are all species-derived.
 */
function spider(k, col, opt = {}) {
  const v = vary(k);
  col = toned(k, col);
  const jumping = opt.kind === "jumping";
  const spiny = opt.kind === "spiny";
  const dark = darkOf(col);

  /* Five builds, because "spider" spans a squat crab spider and a daddy-long-
     legs and the shape signature reads leg reach and abdomen carriage, not the
     species name. Each build moves leg length, how far the legs drop, and how
     high the abdomen rides — all relative to the body, since the audit
     normalises away any absolute placement. */
  const build = jumping ? "jumper" : spiny ? "squat" : v.pick("build", ["orb", "hunter", "stilt", "squat", "orb"]);
  const B = {
    orb: { leg: 1.0, drop: 1.0, lift: 0.35, rake: 1.0 },
    hunter: { leg: 0.78, drop: 1.25, lift: 0.12, rake: 1.5 },
    jumper: { leg: 0.5, drop: 1.05, lift: 0.05, rake: 0.8 },
    stilt: { leg: 1.7, drop: 0.62, lift: 0.5, rake: 0.5 },
    squat: { leg: 0.62, drop: 1.35, lift: 0.0, rake: 1.2 },
  }[build];
  const legLen = B.leg * (jumping ? v.f("legl", 0.16, 0.24) : v.f("legl", 0.19, 0.3));
  const stand = v.f("stand", 0.08, 0.2);
  const cx = (jumping ? 0.075 : 0.07) * v.f("cx", 0.85, 1.3);
  const cz = cx * v.f("cz", 1.0, 1.5);
  const ceph = ball(k, k.root, "cephalothorax", {
    rx: cx, ry: cx * v.f("cy", 0.65, 0.95), rz: cz,
    at: [0, stand + legLen * 0.12, cz * 0.9], rot: [v.f("pitch", -0.3, 0.26), 0, 0], color: dark,
  });

  // abdomen: four genuinely different bodies, not four tints of one
  const abdForm = spiny ? "spiny" : v.pick("abdf", ["round", "oval", "long", "teardrop", "round"]);
  const ar = (jumping ? 0.085 : 0.13) * v.f("ar", 0.8, 1.35);
  const shape = {
    round: [1, 0.95, 1], oval: [0.8, 0.72, 1.35], long: [0.62, 0.6, 1.8],
    teardrop: [0.95, 1.15, 1.05], spiny: [1.25, 0.62, 1.0],
  }[abdForm];
  const pedicel = ball(k, ceph, "pedicel", { r: cx * 0.36, at: [0, cx * 0.06, -cz * 0.75], color: shade(dark, -0.1), subdiv: 0 });
  const abd = ball(k, pedicel, "abdomen", {
    rx: ar * shape[0], ry: ar * shape[1], rz: ar * shape[2],
    at: [0, ar * (B.lift + v.f("abdlift", -0.08, 0.16)), -ar * shape[2] * 0.7],
    rot: [v.f("abdpitch", -0.45, 0.35), 0, 0],
    color: col.base, colorFn: col.shellGrad,
  });
  if (spiny) {
    const spikeN = v.i("spiken", 4, 6);
    for (let i = 0; i < spikeN; i += 1) {
      const a = (i / spikeN) * Math.PI * 2;
      cone(k, abd, `spike${i}`, {
        merge: true, r: ar * 0.14, h: ar * v.f("spikel", 0.5, 1.0),
        at: [Math.cos(a) * ar * shape[0] * 0.7, 0, Math.sin(a) * ar * shape[2] * 0.7],
        rotZ: -Math.cos(a) * 1.35, rotX: Math.sin(a) * 1.35, color: dark,
      });
    }
  }
  const markN = v.i("markn", 0, 5);
  for (let i = 0; i < markN; i += 1) {
    const t = (i + 1) / (markN + 1);
    ball(k, abd, `mark${i}`, { merge: true,
      rx: ar * shape[0] * v.f("markw", 0.16, 0.42), ry: ar * shape[1] * 0.3, rz: ar * shape[2] * 0.14,
      at: [0, ar * shape[1] * 0.78, ar * shape[2] * (0.55 - t * 1.1)],
      color: i % 2 ? paper : shade(col.base, -0.42), subdiv: 0,
    });
  }
  const spinneret = v.i("spin", 0, 2);
  for (let i = 0; i < spinneret; i += 1) {
    spindle(k, abd, `spinneret${i}`, {
      r: ar * 0.1, len: ar * v.f("spinl", 0.2, 0.4),
      at: [(i - (spinneret - 1) / 2) * ar * 0.24, -ar * shape[1] * 0.2, -ar * shape[2] * 0.75],
      rot: [-1.4, 0, 0], color: shade(col.base, -0.2), seg: 8,
    });
  }

  // eight legs, jointed, hinged inside the cephalothorax
  const jointFront = v.i("jointf", 2, 3);
  const jointBack = v.i("jointb", 2, 3);
  const splay = v.f("splay", 1.0, 1.5) * (2 - B.drop) * 0.85 + 0.25;
  const bend = v.f("bend", 0.9, 1.6) * B.drop;
  const legR = v.f("legr", 0.009, 0.016);
  for (let i = 0; i < 4; i += 1) {
    const t = i / 3 - 0.5;
    const joint = i < 2 ? jointFront : jointBack;
    const len = legLen * (1 + v.f("legmix", -0.3, 0.35) * -t);
    for (const s of [1, -1]) {
      const seg = [
        { len: len * (joint > 2 ? 0.42 : 0.5), rz: s * -splay, rx: t * v.f("rake", 1.0, 1.9) * B.rake, taper: 0.85, bulge: 0.4 },
        { len: len * (joint > 2 ? 0.4 : 0.5), rz: s * -bend, taper: 0.7 },
      ];
      if (joint > 2) seg.push({ len: len * 0.28, rz: s * -bend * 0.4, taper: 0.6 });
      legChain(k, ceph, `leg${i}-${s > 0 ? "l" : "r"}`, {
        at: [s * cx * 0.55, -cx * 0.1, cz * (0.55 - i * 0.4)], r: legR, seg, color: dark, merge: true,
      });
    }
  }
  for (const s of [1, -1]) {
    legChain(k, ceph, `palp-${s > 0 ? "l" : "r"}`, {
      at: [s * cx * 0.45, -cx * 0.15, cz * 0.7], r: legR * 1.1,
      seg: [
        { len: legLen * 0.22, rz: s * -0.9, rx: 1.0, taper: 0.9 },
        { len: legLen * 0.18, rz: s * -0.5, rx: 0.6, taper: 1.4 },
      ],
      color: shade(dark, 0.14),
    });
  }
  if (v.on("chelicera", 0.5)) {
    for (const s of [1, -1]) {
      cone(k, ceph, `fang-${s > 0 ? "l" : "r"}`, {
        r: cx * 0.16, h: cx * v.f("fangl", 0.5, 1.0), at: [s * cx * 0.28, -cx * 0.35, cz * 0.62], rotX: 2.5, color: shade(dark, -0.2),
      });
    }
  }

  // spiders have eight eyes; how many read at this size is a species knob
  const eyeN = jumping ? v.i("eyen", 2, 3) : v.i("eyen", 1, 3);
  const bigR = (jumping ? cx * 0.5 : cx * 0.24) * v.f("eyer", 0.85, 1.25);
  for (let i = 0; i < eyeN; i += 1) {
    const r = bigR * (1 - i * 0.28);
    beadEyes(k, ceph, {
      r, at: [0, cx * (0.28 - i * 0.16), cz * (0.72 - i * 0.14)], gap: cx * (0.34 + i * 0.22),
      color: i === 0 ? paper : ink, pupil: i === 0 ? ink : paper, spark: i === 0, subdiv: i === 0 ? 1 : 0,
      name: `eye${i}`,
    });
  }
  k.idle({ breatheK: v.f("br", 0.035, 0.06), bobAmp: v.f("bob", 0.006, 0.02) });
}

/* ── scorpions ────────────────────────────────────────────────────────────── */

function scorpion(k, col, opt = {}) {
  const v = vary(k);
  const dark = darkOf(col);
  const bx = v.f("bx", 0.09, 0.15);
  const by = v.f("by", 0.045, 0.075);
  const bz = v.f("bz", 0.15, 0.24);
  const bodyY = by * 1.6;
  const body = ball(k, k.root, "body", { rx: bx, ry: by, rz: bz, at: [0, bodyY, 0], color: col.base });
  const plateN = v.i("platen", 2, 5);
  for (let i = 0; i < plateN; i += 1) {
    ball(k, body, `plate${i}`, { merge: true,
      rx: bx * 1.02, ry: by * 1.03, rz: bz * 0.09,
      at: [0, 0, bz * (0.5 - i * (1.1 / plateN))], color: shade(col.base, i % 2 ? -0.24 : 0.12), subdiv: 0,
    });
  }
  // the tail: one chain arching over the back, each joint parked in the last
  const tailN = v.i("tailn", 4, 5);
  const tailLen = v.f("taill", 0.07, 0.12);
  const arch = v.f("arch", 0.42, 0.72);
  let p = body;
  let at = [0, by * 0.6, -bz * 0.75];
  for (let i = 0; i < tailN; i += 1) {
    const r = by * (1.05 - i * (0.5 / tailN));
    const n = k.cute.node(`tail${i}`, { parent: p, at, rot: [i === 0 ? -1.1 - arch * 0.2 : -arch, 0, 0] });
    k.cute.add(n, ballGeo(r, tailLen * 0.62, r, 1), { at: [0, tailLen * 0.5, 0], color: shade(col.base, -i * 0.05) });
    p = n;
    at = [0, tailLen * 0.86, 0];
  }
  const bulb = ball(k, p, "sting-bulb", { rx: by * 0.8, ry: by * 0.95, rz: by * 0.8, at: [0, tailLen * 0.8, 0], color: shade(col.base, 0.12) });
  cone(k, bulb, "sting", { r: by * 0.32, h: v.f("stingl", 0.05, 0.1), at: [0, 0, -by * 0.2], rotX: -1.9, color: col.accent ?? APP.red });

  // pedipalps
  const armLen = v.f("arml", 0.09, 0.17);
  for (const s of [1, -1]) {
    const chain = legChain(k, body, `arm-${s > 0 ? "l" : "r"}`, {
      at: [s * bx * 0.6, by * 0.1, bz * 0.55], r: v.f("armr", 0.018, 0.03),
      seg: [
        { len: armLen * 0.5, rz: s * -1.15, rx: 0.9, taper: 0.9, bulge: 0.5 },
        { len: armLen * 0.5, rz: s * 0.55, rx: 0.5, taper: 1.0 },
      ],
      color: col.base,
    });
    const claw = ball(k, chain[1], `claw-${s > 0 ? "l" : "r"}`, {
      rx: v.f("clawx", 0.03, 0.055), ry: v.f("clawy", 0.02, 0.032), rz: v.f("clawz", 0.04, 0.08),
      at: [0, armLen * 0.42, 0], rot: [1.4, 0, 0], color: shade(col.base, -0.1),
    });
    for (const t of [1, -1]) {
      cone(k, claw, `pincer${t > 0 ? "a" : "b"}-${s > 0 ? "l" : "r"}`, {
        r: 0.012, h: v.f("pincerl", 0.035, 0.07), at: [t * 0.016, 0, v.f("clawz", 0.04, 0.08) * 0.5], rotX: Math.PI / 2, rotZ: t * -0.25, color: shade(col.base, -0.2), seg: 8,
      });
    }
  }
  insectLegs(k, body, {
    at: [0, -by * 0.4, bz * 0.2], gap: bx * 0.55, pair: 4,
    len: v.f("legl", 0.1, 0.18), r: 0.011, spanZ: bz * v.f("legspan", 0.35, 0.6),
    splay: v.f("splay", 1.05, 1.45), bend: v.f("bend", 0.85, 1.35), color: dark, lenMix: v.f("lenmix", -0.25, 0.25),
  });
  const headR = bx * 0.3;
  beadEyes(k, body, { r: headR * v.f("eyer", 0.5, 0.8), at: [0, by * 0.7, bz * 0.5], gap: bx * v.f("eyeg", 0.18, 0.32), color: ink, pupil: paper, spark: true });
  k.idle({ breatheK: v.f("br", 0.03, 0.05), bobAmp: v.f("bob", 0.006, 0.018) });
}

/* ── snails and slugs ─────────────────────────────────────────────────────── */

function snail(k, col, opt = {}) {
  const v = vary(k);
  col = toned(k, col);
  const kind = opt.kind ?? "round";
  const slug = kind === "slug";
  const skin = col.body ?? shade(col.base, 0.4);
  /* A slug is a SOLE: long, flat and low, carrying no shell at all. A snail is
     a compact foot under a coil. Same builder, two genuinely different
     animals — the three leatherleaf slugs in the pack were shipping with a
     shell because this branch was unreachable dead code. */
  const footL = slug ? v.f("footl", 0.34, 0.46) : v.f("footl", 0.2, 0.28);
  const footR = slug ? v.f("footr", 0.075, 0.105) : v.f("footr", 0.075, 0.11);
  const foot = ball(k, k.root, "foot", {
    rx: footR, ry: footR * (slug ? v.f("footh", 0.3, 0.44) : v.f("footh", 0.45, 0.62)),
    rz: footL * 0.5, at: [0, footR * (slug ? 0.3 : 0.5), 0], color: skin,
  });
  const headR = footR * v.f("hr", 0.65, 0.95);
  const head = ball(k, foot, "head", {
    rx: headR, ry: headR * (slug ? 0.72 : 0.85), rz: headR,
    at: [0, footR * (slug ? 0.14 : 0.42), footL * 0.4], color: skin,
  });

  /* Eyestalks. The lean used to be baked into the stalk's MESH while the eye
     ball hung off the un-tilted NODE, so every eye floated beside its own
     stalk instead of sitting on the end of it — invisible to the part-level
     connectivity check because the eye is not a part. The lean now lives on
     the node, which the ball inherits, and the pair is spread far enough that
     the two whites cannot fuse into one sphere. */
  const stalkL = v.f("stalk", 0.11, 0.2) * (slug ? 1.2 : 1);
  const eyeR = 0.026;
  for (const s of [1, -1]) {
    const stalk = hinge(k, head, `stalk-${s > 0 ? "l" : "r"}`, {
      at: [s * headR * 0.6, headR * 0.5, 0],
      rot: [0, 0, s * -v.f("stalkspread", 0.3, 0.52)],
      axis: "x", amp: 0.12, dur: v.f("stalkd", 1.6, 2.3), phase: s > 0 ? 0 : 0.5,
    });
    k.cute.add(stalk, spindleGeo(0.013, stalkL, { seg: 10, bulge: 0.5, tip: 0.85 }), { color: skin });
    const tip = ball(k, stalk, `stalkball-${s > 0 ? "l" : "r"}`, { r: eyeR, at: [0, stalkL * 0.9, 0], color: paper });
    ball(k, tip, `stalkpupil-${s > 0 ? "l" : "r"}`, { merge: true, r: eyeR * 0.52, at: [s * eyeR * 0.18, 0, eyeR * 0.6], color: ink, subdiv: 0 });
    spindle(k, head, `tentacle-${s > 0 ? "l" : "r"}`, {
      r: 0.01, len: v.f("tent", 0.04, 0.08), at: [s * headR * 0.5, -headR * 0.15, headR * 0.4],
      rot: [1.0, 0, s * 0.35], color: skin, seg: 8,
    });
  }

  if (slug) {
    // the mantle shield over the front third, and the keel ridge down the back
    ball(k, foot, "mantle", {
      rx: footR * 0.94, ry: footR * v.f("mantleh", 0.34, 0.48), rz: footL * v.f("mantlez", 0.24, 0.34),
      at: [0, footR * 0.22, footL * v.f("mantlep", 0.0, 0.14)], color: shade(col.base, -0.12),
    });
    const keelN = v.i("keeln", 3, 5);
    for (let i = 0; i < keelN; i += 1) {
      const t = i / (keelN - 1);
      ball(k, foot, `keel${i}`, {
        rx: footR * (0.42 - t * 0.24), ry: footR * v.f("keelh", 0.2, 0.34), rz: footL * 0.13,
        at: [0, footR * 0.3, footL * (0.1 - t * 0.7)], color: shade(col.base, -0.28 + t * 0.16),
      });
    }
    for (const sd of [1, -1]) {
      ball(k, foot, `sole-${sd > 0 ? "l" : "r"}`, { merge: true,
        rx: footR * 0.3, ry: footR * 0.13, rz: footL * 0.46,
        at: [sd * footR * 0.68, -footR * 0.14, -footL * 0.04], color: shade(skin, 0.22), subdiv: 0,
      });
    }
  } else if (kind === "semislug") {
    ball(k, foot, "shellbit", { rx: footR * 0.8, ry: footR * 0.55, rz: footL * 0.28, at: [0, footR * 0.55, -footL * 0.14], color: col.base });
  } else {
    /* The shell, as a real logarithmic COIL rather than a diagonal stack of
       three balls. Beads march round a spiral whose radius decays, close
       enough together to overlap, so the whorl reads as one continuous turn;
       an x drift off the coil plane gives a conical spire where the species
       wants one. All of it merges into a single mesh, because thirty nodes of
       glTF bookkeeping costs more than the triangles do. */
    const cone0 = kind === "cone";
    const turn = cone0 ? v.f("turn", 2.4, 3.4) : v.f("turn", 2.1, 2.9);
    const beadN = v.i("beadn", 24, 32);
    const r0 = v.f("shellr", 0.15, 0.2);
    const tight = v.f("tight", 1.5, 2.2);
    const spire = r0 * (cone0 ? v.f("spire", 0.7, 1.2) : v.f("spire", 0.12, 0.42));
    const lean = v.f("lean", -0.3, 0.3);
    const shell = k.cute.node("shell", { parent: k.root, at: [0, footR * 0.62, -footL * 0.06], rot: [lean, 0, 0] });
    for (let i = 0; i < beadN; i += 1) {
      const t = i / (beadN - 1);
      const a = t * turn * Math.PI * 2;
      const rad = r0 * Math.exp(-t * tight);
      const bead = rad * v.f("bead", 0.52, 0.68);
      k.cute.add(shell, ballGeo(bead * 1.05, bead, bead, 1), {
        at: [t * spire, Math.sin(a) * rad, Math.cos(a) * rad],
        color: shade(col.base, (i % 4 < 2 ? 0.06 : -0.1) + t * v.f("shellsh", 0.05, 0.24)),
      });
    }
    const bandN = v.i("shellband", 0, 3);
    for (let i = 0; i < bandN; i += 1) {
      const a = (i + 1) * (turn * Math.PI * 2) / (bandN + 1);
      const t = (i + 1) / (bandN + 1);
      const rad = r0 * Math.exp(-t * tight);
      k.cute.add(shell, ballGeo(rad * 0.28, rad * 0.3, rad * 0.3, 0), {
        at: [t * spire, Math.sin(a) * rad, Math.cos(a) * rad],
        color: shade(col.base, -0.42),
      });
    }
  }
  k.idle({ breatheK: v.f("br", 0.04, 0.07), bobAmp: 0 });
}

/* ── millipedes and centipedes ───────────────────────────────────────────────
 * Every one of these shipped with its rear segments floating: the chain was
 * placed by eye and the last links drifted out of contact. It is now one
 * node chain where each segment's joint sits inside the one in front.
 */
function myriapod(k, col, opt = {}) {
  const v = vary(k);
  col = toned(k, col);
  const dark = darkOf(col);
  const cent = opt.kind === "centipede";
  const house = opt.kind === "house-centipede";
  const n = v.i("segn", cent || house ? 6 : 5, cent || house ? 9 : 8);
  const segLen = v.f("segl", 0.11, 0.16);
  const r0 = v.f("r", 0.05, 0.075);
  const flat = cent || house ? v.f("flat", 0.5, 0.75) : v.f("flat", 0.85, 1.05);
  const curve = v.f("curve", -0.16, 0.16);
  const startY = r0 * v.f("stand", 1.1, 1.9);

  const seg = [];
  let p = k.root;
  let at = [0, startY, segLen * 0.5];
  for (let i = 0; i < n; i += 1) {
    const r = r0 * (1 - Math.abs(i / (n - 1) - 0.35) * v.f("taper", 0.15, 0.4));
    const node = ball(k, p, `seg${i}`, {
      rx: r, ry: r * flat, rz: segLen * 0.6,
      at, rot: i === 0 ? null : [0, curve, 0],
      color: opt.banded && i % 2 ? shade(col.base, -0.38) : shade(col.base, -i * 0.02 + (i % 2 ? 0.05 : 0)),
    });
    if (v.on("keel", 0.5) && !house) {
      for (const s of [1, -1]) {
        ball(k, node, `keel${i}-${s > 0 ? "l" : "r"}`, { merge: true,
          rx: r * v.f("keelw", 0.35, 0.7), ry: r * flat * 0.22, rz: segLen * 0.45,
          at: [s * r * 0.85, 0, 0], color: shade(col.base, -0.3), subdiv: 0,
        });
      }
    }
    seg.push(node);
    k.cute.bob(node, { amp: 0.012, dur: v.f("wave", 1.0, 1.5), phase: i * 0.18 });
    p = node;
    at = [0, 0, -segLen * 0.86];
  }
  const headR = r0 * v.f("hr", 0.85, 1.15);
  const head = ball(k, seg[0], "head", { rx: headR, ry: headR * flat * 1.05, rz: headR * 0.95, at: [0, 0, segLen * 0.5], color: shade(col.base, -0.15) });
  antennaPair(k, head, {
    at: [0, headR * 0.4, headR * 0.5], gap: headR * 0.35,
    len: cent || house ? v.f("antl", 0.12, 0.24) : v.f("antl", 0.06, 0.13),
    r: 0.007, spread: v.f("ants", 0.35, 0.8), joint: 2, form: "thread", color: dark,
  });
  beadEyes(k, head, { r: headR * v.f("eyer", 0.24, 0.4), at: [0, headR * 0.15, headR * 0.45], gap: headR * 0.5, color: ink, pupil: paper, spark: true });

  const legLen = house ? v.f("legl", 0.16, 0.26) : cent ? v.f("legl", 0.08, 0.14) : v.f("legl", 0.05, 0.09);
  const splay = house ? v.f("splay", 1.5, 1.9) : v.f("splay", 1.25, 1.6);
  const pairPerSeg = opt.kind === "millipede" || (!cent && !house) ? v.i("pps", 1, 2) : 1;
  for (const [i, node] of seg.entries()) {
    for (let q = 0; q < pairPerSeg; q += 1) {
      for (const s of [1, -1]) {
        spindle(k, node, `leg${i}${q}-${s > 0 ? "l" : "r"}`, {
          merge: pairPerSeg > 1, r: house ? 0.007 : 0.009, len: legLen * (house ? 1 - i * 0.05 : 1),
          at: [s * r0 * 0.5, -r0 * flat * 0.2, segLen * (0.2 - q * 0.4)],
          rot: [v.f("legrake", -0.3, 0.3), 0, s * -splay], color: dark, seg: 7,
        });
      }
    }
  }
  if (cent || house) {
    for (const s of [1, -1]) {
      spindle(k, seg[seg.length - 1], `cercus-${s > 0 ? "l" : "r"}`, {
        r: 0.008, len: v.f("cercl", 0.06, 0.14), at: [s * r0 * 0.3, 0, -segLen * 0.5],
        rot: [-1.5, 0, s * 0.35], color: dark, seg: 8,
      });
    }
  }
  k.idle({ breatheK: v.f("br", 0.02, 0.04), bobAmp: 0 });
}

/* ── flatworms ────────────────────────────────────────────────────────────── */

function flatworm(k, col, opt = {}) {
  const v = vary(k);
  const dark = darkOf(col);
  const len = v.f("len", 0.24, 0.4);
  const wide = v.f("wide", 0.06, 0.12);
  const body = ball(k, k.root, "body", { rx: wide, ry: v.f("thick", 0.015, 0.03), rz: len, at: [0, 0.03, 0], rot: [0, v.f("yaw", -0.12, 0.12), 0], color: col.base });
  const stripeN = v.i("stripen", 1, 4);
  for (let i = 0; i < stripeN; i += 1) {
    const t = stripeN === 1 ? 0 : i / (stripeN - 1) - 0.5;
    ball(k, body, `stripe${i}`, { merge: true,
      rx: wide * v.f("stripew", 0.08, 0.22), ry: 0.006, rz: len * v.f("stripel", 0.8, 0.95),
      at: [t * wide * 1.3, 0.018, 0], color: i % 2 ? dark : (col.accent ?? paper), subdiv: 0,
    });
  }
  const fan = v.pick("fan", ["hammer", "spade", "point"]);
  blade(k, body, "headfan", {
    outline: bladeOutline(wide * (fan === "hammer" ? 1.9 : 1.2), len * (fan === "point" ? 0.16 : 0.1), {
      n: 12, taper: fan === "point" ? -0.5 : 0.2, notch: fan === "hammer" ? 0.3 : -0.1,
    }),
    thick: 0.016, at: [0, 0.005, len * 0.86], color: shade(col.base, 0.12),
  });
  for (const s of [1, -1]) ball(k, body, `eye-${s > 0 ? "l" : "r"}`, { r: 0.013, at: [s * wide * 0.35, 0.02, len * 0.9], color: ink, subdiv: 0 });
  const ruffleN = v.i("rufflen", 0, 4);
  for (let i = 0; i < ruffleN; i += 1) {
    for (const s of [1, -1]) {
      ball(k, body, `ruffle${i}-${s > 0 ? "l" : "r"}`, { merge: true,
        rx: wide * 0.3, ry: 0.012, rz: len * 0.14,
        at: [s * wide * 0.95, 0.005, len * (0.5 - i * (1.1 / (ruffleN + 1)))], color: shade(col.base, 0.2), subdiv: 0,
      });
    }
  }
  k.cute.swing(body, { axis: "z", amp: v.f("wave", 0.04, 0.1), dur: v.f("waved", 1.9, 2.8) });
  k.idle({ breatheK: v.f("br", 0.04, 0.08), bobAmp: 0 });
}

/* ── crabs ────────────────────────────────────────────────────────────────── */

function crab(k, col, opt = {}) {
  const v = vary(k);
  const dark = darkOf(col);
  const bx = v.f("bx", 0.18, 0.28);
  const by = v.f("by", 0.07, 0.12);
  const bz = v.f("bz", 0.13, 0.22);
  const bodyY = v.f("stand", 0.1, 0.18);
  const body = ball(k, k.root, "carapace", { rx: bx, ry: by, rz: bz, at: [0, bodyY, 0], color: col.base });
  const toothN = v.i("toothn", 0, 4);
  for (let i = 0; i < toothN; i += 1) {
    for (const s of [1, -1]) {
      cone(k, body, `tooth${i}-${s > 0 ? "l" : "r"}`, {
        r: by * 0.22, h: bx * v.f("toothl", 0.06, 0.14),
        at: [s * bx * (0.55 + i * 0.12), 0, bz * (0.5 - i * 0.3)], rotZ: s * -1.4, color: shade(col.base, -0.2), seg: 8,
      });
    }
  }
  const clawBig = v.f("clawbig", 0.9, 1.6);
  for (const s of [1, -1]) {
    const scale = s > 0 ? clawBig : v.on("fiddler", 0.3) ? 0.55 : clawBig * 0.95;
    const armL = v.f("arml", 0.08, 0.14);
    const chain = legChain(k, body, `arm-${s > 0 ? "l" : "r"}`, {
      at: [s * bx * 0.7, 0, bz * 0.45], r: v.f("armr", 0.022, 0.034),
      seg: [
        { len: armL, rz: s * -1.0, rx: 0.7, taper: 0.9, bulge: 0.5 },
        { len: armL * 0.8, rz: s * 0.9, rx: 0.3, taper: 1.0 },
      ],
      color: col.base,
    });
    k.cute.swing(chain[0], { axis: "z", amp: s * 0.12, base: s * -1.0, dur: v.f("wave", 1.2, 1.8), phase: s > 0 ? 0 : 0.4 });
    const claw = ball(k, chain[1], `claw-${s > 0 ? "l" : "r"}`, {
      rx: 0.055 * scale, ry: 0.032 * scale, rz: 0.07 * scale, at: [0, armL * 0.7, 0], rot: [1.4, 0, 0], color: shade(col.base, -0.12),
    });
    for (const t of [1, -1]) {
      cone(k, claw, `pincer${t > 0 ? "a" : "b"}-${s > 0 ? "l" : "r"}`, {
        r: 0.014 * scale, h: 0.06 * scale, at: [t * 0.018 * scale, 0, 0.05 * scale], rotX: Math.PI / 2, rotZ: t * -0.3, color: shade(col.base, -0.22), seg: 8,
      });
    }
    const legN = v.i("legn", 3, 4);
    for (let i = 0; i < legN; i += 1) {
      const t = i / Math.max(1, legN - 1) - 0.5;
      legChain(k, body, `leg${i}-${s > 0 ? "l" : "r"}`, {
        at: [s * bx * 0.6, -by * 0.2, bz * (0.2 - i * (0.9 / legN))], r: v.f("legr", 0.012, 0.018),
        seg: [
          { len: v.f("legl", 0.1, 0.17), rz: s * -v.f("splay", 1.15, 1.5), rx: t * 1.2, taper: 0.85 },
          { len: v.f("legl", 0.1, 0.17) * 0.8, rz: s * -v.f("bend", 0.7, 1.2), taper: 0.55 },
        ],
        color: dark,
      });
    }
    const stalk = k.cute.node(`stalk-${s > 0 ? "l" : "r"}`, { parent: body, at: [s * bx * 0.22, by * 0.4, bz * 0.5], rot: null });
    k.cute.add(stalk, spindleGeo(0.013, v.f("stalkl", 0.05, 0.1), { seg: 10, bulge: 0.5, tip: 0.8 }), { rotZ: s * -0.12, color: dark });
    const eye = ball(k, stalk, `eye-${s > 0 ? "l" : "r"}`, { r: 0.03, at: [0, v.f("stalkl", 0.05, 0.1) * 0.95, 0], color: paper });
    ball(k, eye, `pupil-${s > 0 ? "l" : "r"}`, { r: 0.016, at: [0, 0, 0.022], color: ink, subdiv: 0 });
  }
  k.cute.bob(k.root, { amp: v.f("bob", 0.014, 0.03), dur: v.f("bobd", 1.4, 2.1) });
  k.cute.breathe(k.root, { k: v.f("br", 0.025, 0.045) });
}

/* ── pillbugs ─────────────────────────────────────────────────────────────── */

function pillbug(k, col, opt = {}) {
  const v = vary(k);
  const dark = darkOf(col);
  const n = v.i("segn", 4, 7);
  const r0 = v.f("r", 0.075, 0.11);
  const segLen = v.f("segl", 0.075, 0.115);
  const arch = v.f("arch", 0.05, 0.2);
  const seg = [];
  let p = k.root;
  let at = [0, r0 * 0.75, segLen * 0.5];
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    const r = r0 * (1 - Math.abs(t - 0.25) * v.f("taper", 0.3, 0.6));
    const node = ball(k, p, `seg${i}`, {
      rx: r, ry: r * v.f("flat", 0.6, 0.9), rz: segLen * 0.6,
      at, rot: i === 0 ? null : [arch, 0, 0], color: shade(col.base, i % 2 ? 0.08 : -0.04),
    });
    seg.push(node);
    p = node;
    at = [0, 0, -segLen * 0.85];
  }
  const headR = r0 * v.f("hr", 0.5, 0.75);
  const head = ball(k, seg[0], "head", { rx: headR * 1.1, ry: headR * 0.8, rz: headR, at: [0, -r0 * 0.1, segLen * 0.5], color: dark });
  antennaPair(k, head, { at: [0, headR * 0.3, headR * 0.5], gap: headR * 0.4, len: v.f("antl", 0.05, 0.11), r: 0.006, spread: v.f("ants", 0.5, 1.0), joint: 2, form: "thread", color: dark });
  beadEyes(k, head, { r: headR * v.f("eyer", 0.3, 0.5), at: [0, 0, headR * 0.4], gap: headR * 0.7, color: ink, pupil: paper, spark: true });
  for (const [i, node] of seg.entries()) {
    if (i >= n - 1) continue;
    for (const s of [1, -1]) {
      spindle(k, node, `leg${i}-${s > 0 ? "l" : "r"}`, {
        r: 0.008, len: v.f("legl", 0.04, 0.075), at: [s * r0 * 0.55, -r0 * 0.2, 0],
        rot: [v.f("legrake", -0.3, 0.3), 0, s * -v.f("splay", 1.3, 1.7)], color: dark, seg: 8,
      });
    }
  }
  for (const s of [1, -1]) {
    spindle(k, seg[seg.length - 1], `uropod-${s > 0 ? "l" : "r"}`, { r: 0.007, len: v.f("uro", 0.03, 0.06), at: [s * r0 * 0.3, 0, -segLen * 0.45], rot: [-1.5, 0, s * 0.4], color: dark, seg: 8 });
  }
  k.idle({ breatheK: v.f("br", 0.04, 0.06), bobAmp: v.f("bob", 0.005, 0.015) });
}

/* ── worms ────────────────────────────────────────────────────────────────── */

function worm(k, col, opt = {}) {
  const v = vary(k);
  const n = v.i("segn", 7, 12);
  const r0 = v.f("r", 0.026, 0.042);
  const step = r0 * v.f("step", 1.0, 1.5);
  const wave = v.f("wave", 0.15, 0.5);
  let p = k.root;
  let at = [0, r0 * 1.1, step * 0.5];
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    const r = r0 * (0.55 + 0.45 * Math.sin(Math.PI * clamp(t * 1.25, 0, 1)));
    const clitellum = i === Math.round(n * 0.35);
    const node = ball(k, p, `seg${i}`, {
      rx: r, ry: r * v.f("flat", 0.8, 1.0), rz: step * 0.62,
      at, rot: i === 0 ? null : [0, Math.sin(i * wave) * 0.22, 0],
      color: clitellum ? shade(col.base, -0.25) : shade(col.base, (i % 2 ? 0.07 : -0.02)),
    });
    k.cute.bob(node, { amp: 0.01, dur: v.f("bobd", 1.2, 1.8), phase: i * 0.22 });
    p = node;
    at = [0, 0, -step * 0.85];
  }
  const headR = r0 * v.f("hr", 0.85, 1.2);
  const head = ball(k, k.root, "head", { rx: headR, ry: headR * 0.9, rz: headR * v.f("hz", 1.0, 1.5), at: [0, r0 * 1.15, step * 0.5 + step * 0.5], color: shade(col.base, 0.14) });
  beadEyes(k, head, { r: headR * v.f("eyer", 0.3, 0.46), at: [0, headR * 0.2, headR * 0.5], gap: headR * 0.5, color: paper, pupil: ink, spark: true });
  k.arc(head, { name: "smile", R: headR * 0.4, r: headR * 0.12, a0: Math.PI * 1.2, a1: Math.PI * 1.8, at: [0, -headR * 0.1, headR * 0.85], color: ink, segs: 6 });
  k.idle({ breatheK: v.f("br", 0.03, 0.05), bobAmp: 0 });
}

export const fauna = {
  bird, mammal, frog, lizard, snake, fish, lepidoptera, odonata, hymenoptera,
  coleoptera, orthoptera, hemiptera, diptera, mantis, blattodea, dermaptera,
  phasmatodea, insectGeneric, spider, scorpion, snail, myriapod, flatworm,
  crab, pillbug, worm,
};
