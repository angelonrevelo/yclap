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
import { APP, INSECTS, FLOWERS, shade, mix, hex, icosphere } from "./kit.mjs";

const ink = APP.ink;
const paper = APP.paper;
const darkOf = (col) => col.dark ?? shade(col.base, -0.22);
/**
 * Chitin: head capsule, pronotum, petiole, legs, antennae, mandibles, spines —
 * everything structural that is not the body's own painted surface.
 *
 * The orchestrator merges `{ ...derived, ...colors }` KEY BY KEY, and for an
 * insect it derives `dark` and `accent` from the DERIVED base. A species that
 * supplies only its real `base` therefore still carries a `dark` and an
 * `accent` belonging to a colour it has nothing to do with — and both were
 * being routed to the largest parts in the model. Measured on the shipped
 * bytes: Plautia stali's green body was 70 vertices against 504 of magenta
 * head, pronotum, antennae and legs, and the Ghost Ant's petiole, mandibles
 * and spines were purple.
 *
 * A hand-written `dark` still has to win, though — Vespa tropica and Phimenes
 * curvatus are yellow insects that are deliberately black everywhere else.
 * The two cases are told apart exactly rather than by eye: the derived insect
 * `dark` is `shade(c, -0.3)` for some `c` in the tuned insect pool, so
 * membership of that set IS the merge artefact. Anything outside it was
 * written by hand.
 *
 * `pooled` marks the callers whose class derives its `dark` from a pool this
 * file cannot see — arachnids, molluscs, crustaceans, myriapods. No species in
 * those groups writes a `dark`, so there the tone always comes off the base.
 * `col.chitin` overrides everything and is derived by nothing.
 */
const DERIVED_INSECT_DARK = INSECTS.map((c) => shade(c, -0.3));
const sameColor = (a, b) => !!a && !!b
  && Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(a[2] - b[2]) < 1e-6;
/** `col.dark` if a human wrote it, else null. The whole authored-vs-derived
 *  test in one place so body, chitin and limb cannot disagree about it. */
const authoredDark = (col, pooled = false) => (
  !pooled && col.dark && !DERIVED_INSECT_DARK.some((d) => sameColor(d, col.dark)) ? col.dark : null
);
const chitinOf = (col, pooled = false) => col.chitin ?? authoredDark(col, pooled) ?? shade(col.base, -0.26);
/**
 * The same artefact one column over. For an insect the orchestrator derives
 * `accent: pick(FLOWERS, seed + 11)` — a FLOWER colour, on an animal — and the
 * merge hands it to every species that only wrote a `base`. That is where the
 * bright magenta on Scolia's gaster bands and the pink on Oryctes' horn came
 * from: neither species authors an accent, so both were painted out of the
 * flower pool. Membership of that exact pool IS the artefact, the same way
 * `DERIVED_INSECT_DARK` is for `dark`.
 *
 * `#f6b22d` is in both the flower pool and the two Amata palettes, which are
 * the only fauna entries whose hand-written accent collides; they are named
 * rather than guessed at.
 */
const AUTHORED_FLOWER_ACCENT = /^(amata)-/;
const accentOf = (k, col, fallback = null) => {
  if (!col.accent) return fallback;
  const derived = FLOWERS.some((f) => sameColor(f, col.accent)) && !AUTHORED_FLOWER_ACCENT.test(who(k));
  return derived ? fallback : col.accent;
};
const bellyOf = (col) => col.belly ?? shade(col.base, 0.32);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
/**
 * Legs and antennae — one step darker than the rest of the chitin, and routed
 * through the same authored-vs-derived test, so a black-and-yellow potter wasp
 * keeps its black legs while a species that never wrote a `dark` gets a tone
 * off its own body instead of the pack's purple, teal and orange sticks.
 */
const limbOf = (col) => shade(chitinOf(col), -0.16);
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

/**
 * Tapered limb: joint at y=0, tip at y=len. Two bands, so it stays cheap.
 *
 * `root` grows a real socket BELOW the joint. Without it the profile starts on
 * a lathe apex — the entire joint end of every limb in the pack is a SINGLE
 * vertex, and the first full ring of vertices sits 45% of the way down the
 * limb, already clear of the body. The connectivity gate samples vertices, so
 * a leg whose surface plainly meets the thorax still reported a gap of 0.068
 * of the model radius against a 0.06 tolerance. A socket puts a full ring of
 * vertices at and below the joint, inside the parent, where they belong.
 */
function spindleGeo(r, len, { seg = 10, bulge = 0.45, tip = 0, zScale = 1, root = 0 } = {}) {
  const profile = root > 1e-7
    ? [[-root, 0], [-root * 0.5, r * 0.72], [0, r * 0.9], [len * bulge, r]]
    : [[0, 0], [len * bulge, r]];
  /* One extra ring up the taper. A spindle used to carry rings at the joint
     and at `bulge` only, so the whole outer half of every limb — the half a
     joint actually lands in — had no vertices at all between `bulge` and the
     tip apex. Contact is measured on vertices, so a tarsus seated properly on
     the end of a tibia still reported a hole. The ring sits exactly on the
     line the surface already followed, so no silhouette changes. */
  const rEnd = tip > 1e-7 ? r * tip : 0;
  const midT = bulge + (1 - bulge) * 0.62;
  profile.push([len * midT, r + (rEnd - r) * ((midT - bulge) / (1 - bulge))]);
  if (tip > 1e-7) profile.push([len, r * tip], [len, 0]);
  else profile.push([len, 0]);
  return latheGeo(profile, seg, zScale);
}

/** Cone: flat base disc at y=0, apex at y=h — beaks, horns, stings, spikes. */
function coneGeo(r, h, { seg = 10, zScale = 1, waist = 0.55, root = 0 } = {}) {
  const profile = root > 1e-7 ? [[-root, 0], [-root, r * 0.92], [0, r]] : [[0, 0], [0, r]];
  return latheGeo([...profile, [h * 0.5, r * waist], [h, 0]], seg, zScale);
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

/* Every un-merged spindle sockets into whatever it hangs off by default. The
   joint end of a spindle is a lathe APEX — one single vertex — so a stalk, a
   sting, an ovipositor, a tail streamer or a snail's eyestalk placed exactly on
   the parent's surface offers the connectivity gate exactly one point to find,
   and the first full ring of vertices sits half way down the part, already in
   free air. That is most of the pack's floating islands. */
function spindle(k, parent, name, o) {
  const geo = spindleGeo(o.r, o.len, {
    seg: o.seg ?? 10, bulge: o.bulge ?? 0.45, tip: o.tip ?? 0, zScale: o.zScale ?? 1,
    root: o.merge ? 0 : (o.root ?? o.r * 1.8),
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
  const geo = coneGeo(o.r, o.h, {
    seg: o.seg ?? 10, zScale: o.zScale ?? 1, waist: o.waist ?? 0.55,
    root: o.merge ? 0 : (o.root ?? o.r * 1.2),
  });
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
      /* Bipectinate — "feathered" — antennae. The barb loop used to run on the
         LAST joint only and to top out at two pairs, so all thirty-nine moths
         in the pack shipped the same two or three straight bristles, including
         the six saturniids and tussocks whose combed antennae ARE the field
         mark. A plumose antenna is a comb: paired rami down the whole shaft,
         longest around the middle, raked back toward the tip. */
      const plume = form === "feather";
      const barbN = plume ? Math.max(barb, 6) : (i === joint - 1 ? barb : 0);
      for (let b = 0; b < barbN; b += 1) {
        const t = (b + (plume ? 0.5 : 1)) / (plume ? barbN : barb + 1);
        const u = plume ? (i + t) / joint : t;
        const taperOff = plume ? Math.max(0.3, Math.sin(Math.min(1, 0.25 + u) * Math.PI)) : 1;
        for (const bs of [1, -1]) {
          spindle(k, node, `${name}-${tag}${i}barb${b}${bs > 0 ? "l" : "r"}`, {
            merge: true, r: rr * (plume ? 0.36 : 0.45),
            len: L * (plume ? 0.92 * taperOff : 0.55 - Math.abs(t - 0.5) * 0.5),
            at: [0, L * t, 0],
            rot: [plume ? -0.62 : 0, 0, bs * 1.3], color, seg: 5, tip: plume ? 0.25 : 0,
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
function legChain(k, parent, name, { at, r, seg, color, subdiv = 1, merge = false, coxa = true }) {
  let parentNode = parent;
  /* The coxa. Contact is decided vertex-to-vertex, and a low-poly body carries
     its vertices half a body-radius apart, so a limb can sit plainly ON the
     skin and still have no vertex of the body within tolerance of any vertex
     of its own. A small blob MERGED INTO THE PARENT at the hip puts a handful
     of the parent's own vertices exactly where the limb meets it — which is
     what a coxa is anyway. It cannot float, because it is not a part. */
  if (coxa && parent !== k.root) {
    ball(k, parent, `${name}-coxa`, { merge: true, r: r * 1.7, at, color, subdiv: 0 });
  }
  let base = at;
  const node = [];
  let R = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  let T = [0, 0, 0];
  for (let i = 0; i < seg.length; i += 1) {
    const s = seg[i];
    const rot = [s.rx ?? 0, s.ry ?? 0, s.rz ?? 0];
    const rr = r * (s.taper ?? 1);
    /* The first segment sockets into whatever it hangs off; the later ones
       socket into the segment above. Both ends of every joint therefore carry
       vertices on the far side of the joint plane, which is what contact is
       actually measured on. */
    const geo = spindleGeo(rr, s.len, {
      seg: s.round ?? 10, bulge: s.bulge ?? 0.45, tip: s.tip ?? 0, zScale: s.zScale ?? 1,
      /* The first segment's socket is sized off the LIMB, not just its radius.
         A leg hangs off a hip whose exact position the chain cannot see — it
         is given a point in the parent's frame and nothing else — so the only
         thing it can do about a hip placed on or just off the skin is to run
         the limb a little way back up its own axis, which always heads into
         the body it came from. */
      /* Contact is vertex-to-vertex, so a socket must STRADDLE the parent's
         skin, not bury itself in the parent's hollow interior — a point deep
         inside a ball is far from every vertex the ball has. Sockets are sized
         off the limb's own radius for that reason, not off its length. */
      root: s.root ?? rr * (i === 0 ? 2.2 : 1.4),
    });
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
    base = [0, s.len * 0.82, 0];
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
    arch = 0,
  } = o;
  const merge = o.merge ?? true;
  const out = [];
  for (let i = 0; i < pair; i += 1) {
    const t = pair === 1 ? 0 : i / (pair - 1) - 0.5;
    /* All six legs of an insect come off the THORAX, which is short. Spreading
       them over twice `spanZ` walked the hind pair back under the abdomen —
       past the end of a beetle's elytra, in fact, which is why the hind pair
       was the one that kept coming up as a floating island. */
    const dz = -t * spanZ * 1.35;
    const lenI = len * (o.lenMix ? 1 + o.lenMix * -t : 1);
    for (const s of [1, -1]) {
      const seg = [];
      seg.push({ len: lenI * (joint > 1 ? 0.55 : 1), rz: s * -splay, rx: t * 1.1, taper: 1 });
      if (joint > 1) seg.push({ len: lenI * 0.55, rz: s * -bend, taper });
      if (joint > 2) seg.push({ len: lenI * 0.3, rz: s * -bend * 0.5, taper: taper * 0.7 });
      /* `arch` follows the body's own curve. A row of hips set at one flat
         height is correct only under the middle of an ellipsoid; at the ends
         the surface has risen away from it and the outer pairs are hanging in
         the air below the animal. Raising them by their distance from the
         middle puts every hip back on the body. */
      out.push(legChain(k, parent, `${name}${i}-${s > 0 ? "l" : "r"}`, {
        at: [at[0] + s * gap, at[1] + Math.abs(t) * 2 * arch, at[2] + dz], r, seg, color, subdiv, merge,
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
    /* Carriage on the REST node, not on the animation's centre. `hinge` drops
       the inner node's rotation entirely when a channel animates it, so a wing
       with any flap at all was shipping a rest pose with no roll — a butterfly
       holding its wings up over its back had them flat in the static model,
       which is what the audit measures and what a still render shows. The
       roll is the shoulder's pose now and the flap swings around it. */
    const node = hinge(k, parent, `${name}-${tag}`, {
      at: [at[0] + s * gap, at[1], at[2]],
      rot: [tilt, s * yaw, s * roll],
      axis: "z", base: 0, amp: flap ? s * flap : 0, dur, phase,
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
  /* The vent. `bellyOf` lifts the base by a flat 0.32 toward paper, which on a
     black crow is a tan patch under the tail and on a black-and-white myna a
     pale wedge it does not have. How far a belly is lifted has to depend on
     how dark the bird IS: a pale bird's underparts are paler still, a black
     bird's are black. */
  const lum = 0.299 * col.base[0] + 0.587 * col.base[1] + 0.114 * col.base[2];
  const belly = col.belly ?? (/^(todiramphus|halcyon)-/.test(who(k)) ? paper : shade(col.base, 0.1 + 0.3 * lum));
  /* A wing takes the BODY colour. Routing `col.dark` here — which is a palette
     accent, not a shade of the bird — is what put maroon wings on a pigeon and
     an egret, and green wings on a swallow. A species that really does have a
     differently-coloured wing says so with `col.wing`. */
  const wingCol = col.wing ?? shade(col.base, -0.16);
  const legCol = col.leg ?? mix(col.accent ?? APP.orange, hex("#8a7a68"), 0.45);
  const id = who(k);

  /* Four birds the review called out for being shipped as the generic compact
     songbird. Routing and palettes live elsewhere; the ANATOMY lives here. */
  const junglefowl = id === "gallus-gallus";
  /* Herons and egrets are neck, legs and a dagger. Four of them were shipping
     as the compact songbird body with a short bill, which is why an egret and
     a cattle-egret were indistinguishable from each other and from a munia. */
  const heron = /^(ardea|egretta|butorides|nycticorax|ixobrychus|bubulcus)-/.test(id);
  const whiteEye = /^zosterops-/.test(id);
  const redEye = /^(aplonis|pycnonotus-atriceps)/.test(id);
  const swallow = /^(hirundo|cecropis|apus|cypsiurus|collocalia|aerodramus)-/.test(id);
  const parakeet = /^psittacula-/.test(id);
  const owl = /^(otus|ninox|tyto|bubo)-/.test(id);
  const longTail = parakeet || /^(lanius|rhipidura|copsychus|dicrurus|urocissa)-/.test(id);
  /* The Collared Kingfisher is NAMED for a white collar over white underparts
     against a turquoise back, and ours shipped turquoise from bill to toe. */
  const collared = /^(todiramphus|halcyon)-/.test(id);
  /* Crests. A crest was a 45% coin flip on every bird in the pack, which put
     one on a zebra dove and on a pygmy woodpecker — neither species has any
     such thing, and a crest is the loudest single feature a small bird can
     carry. It is a fact about the genus now. */
  const crested = /^(acridotheres|otus|ninox|gallus|lophura|cacatua|tanygnathus|hypothymis|pardaliparus|megalaima|psilopogon|elanus|spilornis|nisaetus|vanellus|pycnonotus)-/.test(id);
  /* A woodpecker is a chisel bill and a stiff wedge tail it props against the
     trunk; a flycatcher is rictal bristles round a flat bill. Without either,
     a pygmy woodpecker and a grey-streaked flycatcher are the same small grey
     bird — which is what the distinctness gate said about them. */
  const woodpecker = /^(yungipicus|dendrocopos|picoides|mulleripicus|dryocopus|chrysocolaptes|picus|dinopium|micropternus)-/.test(id);
  const flycatcher = /^(muscicapa|ficedula|cyornis|culicicapa|eumyias|terpsiphone)-/.test(id);

  const legH = opt.legH ?? (junglefowl ? 0.24 : heron ? v.f("legh", 0.3, 0.42) : v.f("legh", 0.05, 0.26));
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
  const mantle = v.i("mantle", 0, 3);
  for (let i = 0; i < mantle; i += 1) {
    ball(k, body, `mantle${i}`, {
      rx: bx * (0.8 - i * 0.18), ry: by * 0.34, rz: bz * (0.58 - i * 0.14),
      at: [0, by * 0.56, -bz * (0.08 + i * 0.24)], color: shade(wingCol, i % 2 ? 0.16 : -0.08),
    });
  }

  const neckLen = opt.neck ?? (heron ? v.f("neck", 0.3, 0.5) : v.on("hasneck", 0.42) ? v.f("neck", 0.06, 0.4) : 0);
  const headR = opt.headR ?? v.f("headr", 0.18, 0.29);
  let headY = by * 0.66 + headR * 0.52;
  let headZ = bz * 0.18;
  if (neckLen > 0.02) {
    /* One tapered COLUMN, not a bead chain. Each segment was a sphere of
       0.055-0.085 under a head of 0.18-0.29 with visible air between them, so
       four birds shipped a head apparently detached from the body and the
       egret came out a snowman. The column now leaves the shoulders at very
       nearly the head's own width, narrows to the throat, and every bead is
       an ellipsoid long enough along the neck to overlap the next. */
    const nseg = clamp(Math.round(neckLen / 0.06), 2, 6);
    const step = neckLen / nseg;
    const nr0 = Math.max(headR * 0.92, by * 0.44) * v.f("neckr", 0.86, 1.06);
    const nr1 = headR * v.f("throat", 0.58, 0.74);
    for (let i = 0; i < nseg; i += 1) {
      const t = (i + 0.5) / nseg;
      const nr = nr0 + (nr1 - nr0) * t;
      ball(k, body, `neck${i}`, {
        rx: nr, ry: step * 0.85, rz: nr,
        at: [0, by * 0.5 + neckLen * t, bz * 0.1 + 0.07 * t],
        color: col.neck ?? col.base,
      });
    }
    headY = by * 0.5 + neckLen + headR * 0.45;
    headZ = bz * 0.1 + 0.07 + headR * 0.1;
  }
  const head = ball(k, body, "head", { r: headR, ry: headR * v.f("headsq", 0.88, 1.08), at: [0, headY, headZ], color: col.head ?? col.base });
  if (collared) {
    const white = col.collar ?? paper;
    /* Standing PROUD of the body — a collar inside the ellipsoid it rings is
       not a collar, which is why the first attempt left the kingfisher as
       turquoise as it started. */
    ball(k, body, "collar", {
      rx: bx * 1.03, ry: by * 0.3, rz: bz * 0.66,
      at: [0, by * 0.44, bz * 0.3], color: white,
    });
  }

  // wings — silhouette is per-species data, not one shared ellipsoid
  const swept = opt.wingShape === "sickle" || swallow;
  const wingLen = v.f("wingl", 0.17, 0.36) * (swept ? 1.4 : 1);
  const wingChord = v.f("wingc", 0.11, 0.2) * (swept ? 0.6 : 1);
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
  const tailKind = opt.tail ?? (junglefowl ? "sickle" : swallow ? "fork" : heron ? "wedge"
    : woodpecker ? "fan" : longTail ? "long" : v.pick("tailk", ["fan", "wedge", "fan", "long", "fork"]));
  const tailBase = [0, by * 0.2, -bz * 0.72];
  const tailCol = col.accentTail ?? shade(col.base, -0.2);
  if (tailKind === "sickle") {
    /* A cockerel's tail: long arched sickle feathers, the reason a junglefowl
       does not read as a songbird from any angle. */
    const n = 4;
    for (let i = 0; i < n; i += 1) {
      for (const s of [1, -1]) {
        const len = 0.4 - i * 0.06;
        blade(k, body, `sickle${i}${s > 0 ? "l" : "r"}`, {
          outline: bladeOutline(0.035, len, { n: 10, taper: 0.45 }), thick: 0.028,
          at: [s * bx * 0.16, by * 0.32 + i * 0.03, -bz * 0.66],
          rot: [-0.55 - i * 0.22, s * (0.16 + i * 0.12), 0], off: [0, 0, -len * 0.8],
          color: shade(tailCol, i % 2 ? 0.16 : -0.1),
        });
      }
    }
  } else if (tailKind === "fork") {
    for (const s of [1, -1]) {
      const out = bladeOutline(0.045, 0.19, { n: 10, taper: 0.35 });
      blade(k, body, `tail-${s > 0 ? "l" : "r"}`, {
        outline: out, thick: 0.03, at: tailBase, rot: [v.f("tpitch", -0.1, 0.3), s * v.f("tspread", 0.2, 0.45), 0],
        off: [0, 0, -0.18], color: tailCol,
      });
    }
  } else if (tailKind === "long") {
    const n = v.i("tn", 1, 2) + (longTail ? 1 : 0);
    for (let i = 0; i < n; i += 1) {
      const len = v.f("tlen", 0.24, 0.44) * (parakeet ? 1.7 : longTail ? 1.35 : 1) * (1 - i * 0.22);
      blade(k, body, `tail${i}`, {
        outline: bladeOutline(0.04, len, { n: 10, taper: 0.3 }), thick: 0.03,
        at: tailBase, rot: [v.f("tpitch", -0.05, 0.35), (i - (n - 1) / 2) * 0.3, 0],
        off: [0, 0, -len * 0.8], color: shade(tailCol, i * 0.12),
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
        off: [0, 0, -len * 0.76], color: i % 2 ? tailCol : shade(tailCol, 0.14),
      });
    }
  }

  // legs and feet
  /* Legs and feet. Every bird in the pack had them — built, and then pointed
     straight UP into the body, because a leg segment runs along +Y from its
     joint and nothing turned it over. Not one of the 41 showed a foot. The
     shank now hangs from the hip and the toes fan forward off the tarsus. */
  {
    const tibia = legH * v.f("tibia", 0.42, 0.72);
    const tarsus = legH * v.f("tarsus", 0.4, 0.7);
    const toe = v.i("toe", 2, 4);
    for (const s of [1, -1]) {
      const chain = legChain(k, body, `leg-${s > 0 ? "l" : "r"}`, {
        at: [s * bx * 0.34, -by * 0.58, bz * 0.06], r: legH > 0.16 ? 0.02 : 0.026,
        seg: [
          { len: tibia, rz: s * -0.1, rx: Math.PI - v.f("hock", 0.1, 0.34), taper: 0.9 },
          { len: tarsus, rz: s * 0.1, rx: v.f("knee", 0.1, 0.4), taper: 0.72 },
        ],
        color: legCol,
      });
      const foot = chain[chain.length - 1];
      for (let i = 0; i < toe; i += 1) {
        const back = i === toe - 1;
        spindle(k, foot, `toe${i}${s > 0 ? "l" : "r"}`, {
          r: 0.012, len: legH * (back ? 0.32 : 0.44), at: [0, tarsus * 0.86, 0],
          rot: [back ? 1.45 : -1.42, back ? 0 : (i - (toe - 2) / 2) * 0.55, 0],
          color: legCol, seg: 6, tip: 0.4,
        });
      }
    }
  }

  // bill
  const beak = opt.beak ?? (heron ? "needle" : woodpecker ? "chisel" : v.pick("beak", ["cone", "cone", "chisel", "needle", "hook"]));
  const beakCol = col.beak ?? col.accent ?? APP.orange;
  const bl = headR * (beak === "needle" ? v.f("bl", 1.5, 2.3) : beak === "chisel" ? v.f("bl", 0.55, 0.85) : v.f("bl", 0.7, 1.1));
  const br = headR * (beak === "needle" ? 0.11 : v.f("br", 0.17, 0.26));
  cone(k, head, "beak", {
    r: br, h: bl, at: [0, -headR * 0.06, headR * 0.68], root: Math.max(br * 1.2, headR * 0.1),
    rotX: Math.PI / 2 - v.f("bdip", -0.05, 0.2),
    zScale: v.f("bflat", 0.7, 1.25), color: beakCol,
  });
  /* The cere: a merged collar at the bill's root. Contact is vertex-to-vertex
     and a low-poly head carries its vertices a long way apart, so a bill can
     sit plainly on the face with no vertex of the head anywhere near it — an
     egret's needle bill was reported as a floating island for exactly that.
     Merged, so it is the head's own geometry and cannot itself float. */
  ball(k, head, "cere", {
    merge: true, rx: br * 1.7, ry: br * 1.7, rz: br * 1.3,
    at: [0, -headR * 0.06, headR * 0.6], color: shade(beakCol, -0.1), subdiv: 0,
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
  const crest = opt.crest ?? (junglefowl ? "comb" : owl ? "ear"
    : crested && v.on("crest", 0.8) ? v.pick("crestk", ["tuft", "spike", "plume"]) : null);
  if (owl) {
    /* The facial disc: the flat dish of stiff feathers that funnels sound, and
       the one feature that makes an owl an owl at any size. */
    ball(k, head, "disc", {
      rx: headR * 1.08, ry: headR * 1.05, rz: headR * 0.32,
      at: [0, headR * 0.02, headR * 0.78], color: shade(col.head ?? col.base, 0.26),
    });
    for (const s of [1, -1]) {
      ball(k, head, `ruff-${s > 0 ? "l" : "r"}`, { merge: true,
        rx: headR * 0.22, ry: headR * 0.9, rz: headR * 0.24,
        at: [s * headR * 0.92, 0, headR * 0.6], color: shade(col.head ?? col.base, -0.26), subdiv: 0,
      });
    }
  }
  if (crest === "ear") {
    for (const s of [1, -1]) {
      cone(k, head, `eartuft-${s > 0 ? "l" : "r"}`, {
        r: headR * 0.17, h: headR * v.f("tuftl", 0.6, 0.95),
        at: [s * headR * 0.5, headR * 0.62, -headR * 0.1], rotZ: s * -0.32, rotX: -0.2,
        color: shade(col.head ?? col.base, -0.28), seg: 8,
      });
    }
  }
  if (crest === "comb") {
    for (const [i, z] of [-0.1, -0.03, 0.05, 0.12].entries()) {
      ball(k, head, `comb${i}`, {
        rx: 0.022, ry: headR * (0.36 + (i === 1 || i === 2 ? 0.12 : 0)), rz: 0.045,
        at: [0, headR * 0.92, z], color: APP.red,
      });
    }
    for (const s of [1, -1]) {
      ball(k, head, `wattle-${s > 0 ? "l" : "r"}`, {
        rx: 0.03, ry: headR * 0.45, rz: 0.035,
        at: [s * headR * 0.22, -headR * 0.78, headR * 0.42], color: APP.red,
      });
    }
  } else if (crest === "crest" || crest === "spike") {
    // merged collar so the crown has vertices where the spikes leave it
    ball(k, head, "crest-base", { merge: true, rx: 0.06, ry: headR * 0.2, rz: 0.05, at: [0, headR * 0.66, -0.04], color: shade(col.head ?? col.base, -0.14), subdiv: 0 });
    for (const s of [1, -1]) {
      cone(k, head, `crest${s > 0 ? "l" : "r"}`, { r: 0.028, h: v.f("crl", 0.1, 0.18), at: [s * 0.03, headR * 0.72, -0.04], rotX: -0.6, color: col.accent ?? APP.red });
    }
  } else if (crest === "tuft") {
    const n = v.i("tuftn", 2, 3);
    for (let i = 0; i < n; i += 1) {
      ball(k, head, `tuft${i}`, { r: headR * (0.3 - i * 0.05), at: [0, headR * (0.76 + i * 0.18), -headR * (0.1 + i * 0.16)], color: shade(col.head ?? col.base, -0.14) });
    }
  } else if (crest === "plume") {
    // merged collar: head vertices where the plumes leave the crown
    ball(k, head, "plume-base", { merge: true, rx: 0.05, ry: headR * 0.22, rz: 0.05, at: [0, headR * 0.66, -headR * 0.16], color: shade(col.base, -0.2), subdiv: 0 });
    for (const s of [1, -1]) {
      blade(k, head, `plume${s > 0 ? "l" : "r"}`, {
        outline: bladeOutline(0.03, 0.13, { n: 8, taper: 0.4 }), thick: 0.02,
        at: [s * 0.03, headR * 0.7, -headR * 0.18], rot: [-0.9, s * 0.25, 0], off: [0, 0, -0.095],
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

  if (flycatcher) {
    // rictal bristles: the fan of stiff hairs round a flycatcher's gape
    for (const sd of [1, -1]) {
      for (let i = 0; i < 3; i += 1) {
        spindle(k, head, `bristle${i}-${sd > 0 ? "l" : "r"}`, {
          merge: i > 0, r: 0.006, len: headR * (0.7 - i * 0.12),
          at: [sd * headR * (0.2 + i * 0.08), -headR * 0.02, headR * 0.62],
          rot: [1.1 + i * 0.16, sd * (0.3 + i * 0.22), 0], color: shade(dark, -0.1), seg: 6,
        });
      }
    }
  }
  if (woodpecker) {
    /* The stiffened tail a woodpecker braces against the trunk: shorter than
       a songbird's, pointing down and back rather than out. */
    for (const sd of [1, -1]) {
      cone(k, body, `prop-${sd > 0 ? "l" : "r"}`, {
        r: 0.024, h: v.f("propl", 0.1, 0.16),
        at: [sd * bx * 0.16, -by * 0.42, -bz * 0.7], rotX: 2.3, rotZ: sd * 0.12,
        color: shade(wingCol, -0.3), seg: 8,
      });
    }
  }
  const eyeR0 = owl ? 0.44 : v.f("eyer", 0.3, 0.4);
  const eye = k.face(head, {
    r: headR * (owl ? 1.06 : 0.98),
    eyeR: eyeR0,
    gap: owl ? 0.4 : v.f("eyeg", 0.46, 0.6),
    blink: opt.blink ?? true,
  });
  /* The white-eye is NAMED for the ring of white feathers round its eye, and
     the glossy starling for its red iris. Both are one merged annulus on the
     eye node the face already built. */
  if (whiteEye || redEye) {
    const Re = eyeR0 * headR * (owl ? 1.06 : 0.98);
    for (const [tag, node] of [["l", eye.eyeL], ["r", eye.eyeR]]) {
      ball(k, node, `ring-${tag}`, {
        rx: Re * (whiteEye ? 1.55 : 1.24), ry: Re * (whiteEye ? 1.55 : 1.24), rz: Re * 0.26,
        at: [0, 0, -Re * 0.18], color: whiteEye ? paper : APP.red, subdiv: 1,
      });
    }
  }
  k.idle({ breatheK: v.f("br", 0.024, 0.042), bobAmp: v.f("bob", 0.015, 0.035) });
}

/* ── mammals ──────────────────────────────────────────────────────────────── */

function mammal(k, col, opt = {}) {
  const v = vary(k);
  const dark = darkOf(col);
  /* A fruit bat is a mammal with a WING, and it was reaching the tail switch
     as "rod" — a brown stick out of one flank, and no wings at all. */
  const bat = opt.tail === "bat-wing" || /^(ptenochirus|cynopterus|rousettus|pteropus|macroglossus|eonycteris|haplonycteris|pipistrellus|scotophilus|hipposideros|rhinolophus|taphozous)-/.test(who(k));
  const bx = 0.27 * v.f("bx", 0.9, 1.2) * (bat ? 0.72 : 1);
  const by = 0.22 * v.f("by", 0.9, 1.2) * (bat ? 0.86 : 1);
  const bz = 0.36 * v.f("bz", 0.9, 1.2) * (bat ? 0.8 : 1);
  const legH = bat ? v.f("legh", 0.06, 0.09) : v.f("legh", 0.11, 0.19);
  const body = ball(k, k.root, "body", { rx: bx, ry: by, rz: bz, at: [0, legH + by * 0.86, 0], color: col.base });
  ball(k, body, "belly", { rx: bx * 0.72, ry: by * 0.66, rz: bz * 0.74, at: [0, -by * 0.4, bz * 0.3], color: bellyOf(col) });
  if (v.on("ruff", 0.4)) ball(k, body, "ruff", { rx: bx * 0.9, ry: by * 0.9, rz: bz * 0.3, at: [0, by * 0.1, bz * 0.6], color: shade(col.base, 0.16) });

  /* The head was 0.23-0.30 in radius against a body half-width of 0.27 — as
     big as the whole animal, and parked in front of it, so the cat and the dog
     framed as busts with the body hidden directly behind the skull. It is a
     head on a body now, set back and up rather than out in front. */
  const headR = v.f("headr", 0.15, 0.2) * (bat ? 1.1 : 1);
  const neck = ball(k, body, "neck", {
    rx: headR * 0.68, ry: headR * 0.7, rz: headR * 0.7,
    at: [0, by * 0.72, bz * 0.5], color: shade(col.base, 0.06),
  });
  const head = ball(k, neck, "head", { r: headR, at: [0, headR * 0.62, headR * 0.5], color: col.base });

  const ears = opt.ears ?? (bat ? "point" : v.pick("ears", ["point", "big", "floppy", "round"]));
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

  const tail = bat ? "bat-wing" : (opt.tail ?? v.pick("tail", ["bush", "rod", "curl", "bush"]));
  if (tail === "bat-wing") {
    /* The wing: a membrane stretched between the arm and the flank, with the
       finger struts drawn across it. Held part-folded, which is how a roosting
       fruit bat sits and what keeps the model inside its tile. */
    const wingLen = v.f("wingl", 0.34, 0.46);
    const wingChord = wingLen * v.f("wingc", 0.62, 0.82);
    const membrane = shade(col.base, -0.3);
    {
      const w = bladeWings(k, body, {
        at: [0, by * 0.42, bz * 0.06], gap: bx * 0.62,
        outline: bladeOutline(wingLen, wingChord, { n: 13, taper: 0.34, notch: 0.22, sweep: -0.18 }),
        thick: 0.022, reach: wingLen * 0.06,
        tilt: v.f("wtl", -0.16, 0.1), yaw: v.f("wyaw", 0.3, 0.52), roll: v.f("wrl", 0.12, 0.36),
        color: membrane, flap: v.f("wf", 0.12, 0.24), dur: v.f("wd", 1.2, 1.8), name: "wing",
      });
      // finger struts drawn across the membrane
      for (const [wi, node] of w.entries()) {
        const sd = wi === 0 ? 1 : -1;
        for (let f = 0; f < 4; f += 1) {
          const t = f / 3;
          spindle(k, node, `finger${f}-${sd > 0 ? "l" : "r"}`, {
            merge: true, r: 0.011, len: wingLen * (0.9 - t * 0.2),
            at: [0, 0.013, wingChord * (0.3 - t * 0.45)],
            rot: [0, 0, sd * -Math.PI / 2 + sd * (0.12 - t * 0.5)],
            color: shade(col.base, -0.12), seg: 5,
          });
        }
        ball(k, node, `thumb-${sd > 0 ? "l" : "r"}`, { merge: true,
          r: 0.02, at: [sd * wingLen * 0.26, 0.015, wingChord * 0.4], color: shade(col.base, -0.08), subdiv: 0,
        });
      }
    }
    // a short tail membrane between the hind legs
    blade(k, body, "uropatagium", {
      outline: bladeOutline(bx * 0.9, bz * 0.5, { n: 10, taper: -0.3 }), thick: 0.018,
      at: [0, -by * 0.35, -bz * 0.62], rot: [0.5, 0, 0], off: [0, 0, -bz * 0.36], color: membrane,
    });
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
  /* Toads are squat and warty with parotoid glands behind the eye; tree frogs
     are slim and long-limbed. Shipping all six as one body in four tints was
     the review's complaint, and the split is a fact about the family. */
  const toad = opt.warty || /^(rhinella|duttaphrynus|bufo|ingerophrynus)-/.test(who(k));
  const treefrog = /^(polypedates|rhacophorus|kurixalus|litoria|hyla)-/.test(who(k));
  const bx = 0.3 * v.f("bx", 0.84, 1.14) * (toad ? 1.12 : treefrog ? 0.88 : 1);
  const by = 0.19 * v.f("by", 0.8, 1.3) * (toad ? 1.18 : 1);
  const bz = 0.3 * v.f("bz", 0.84, 1.16) * (treefrog ? 1.08 : 1);
  const body = ball(k, k.root, "body", {
    rx: bx, ry: by, rz: bz, at: [0, by * v.f("sit", 0.85, 1.5), 0],
    rot: [v.f("pitch", -0.16, 0.2), 0, 0], color: col.base,
  });
  ball(k, body, "belly", { rx: bx * 0.72, ry: by * 0.66, rz: bz * 0.72, at: [0, -by * 0.42, bz * 0.28], color: bellyOf(col) });
  if (v.on("throat", 0.45)) ball(k, body, "throat", { rx: bx * 0.4, ry: by * 0.42, rz: bz * 0.3, at: [0, -by * 0.4, bz * 0.68], color: shade(bellyOf(col), 0.12) });

  const wart = toad ? v.i("wartn", 6, 10) : v.i("wartn", 0, 4);
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
      rx: bx * 0.09, ry: by * 0.26, rz: bz * 0.62,
      at: [(i - (stripe - 1) / 2) * bx * 0.78, by * 0.58, -bz * 0.06], color: col.accent ?? shade(col.base, -0.34), subdiv: 0,
    });
  }

  /* The eye. The pupil used to be parented to the BUMP rather than to the
     eyeball and offset to exactly the eyeball's own radius, so it sat flush
     inside the sphere and every frog in the pack shipped blind. It rides the
     eyeball now, standing proud of it, inside a gold iris — the only
     archetype that had no pupils at all. */
  const eyeR = v.f("eyer", 0.075, 0.105) * (toad ? 1.1 : 1);
  const iris = col.eye ?? mix(col.accent ?? APP.orange, hex("#d8a020"), 0.5);
  for (const s of [1, -1]) {
    const bump = ball(k, body, `eyebump${s > 0 ? "l" : "r"}`, {
      r: eyeR * 1.2, at: [s * bx * 0.46, by * 0.8, bz * 0.42], color: col.base,
    });
    const eye = ball(k, bump, `eyeball${s > 0 ? "l" : "r"}`, {
      r: eyeR, at: [0, eyeR * 0.5, eyeR * 0.32], color: iris,
    });
    /* A horizontal slit pupil, which is what a frog actually has, and a
       catch-light so it reads as wet. */
    ball(k, eye, `pupil${s > 0 ? "l" : "r"}`, { merge: true,
      rx: eyeR * 0.62, ry: eyeR * 0.3, rz: eyeR * 0.55,
      at: [0, 0, eyeR * 0.66], color: ink, subdiv: 1,
    });
    ball(k, eye, `spark${s > 0 ? "l" : "r"}`, { merge: true,
      r: eyeR * 0.2, at: [s * eyeR * 0.3, eyeR * 0.38, eyeR * 0.62], color: paper, subdiv: 0,
    });
  }
  if (toad) {
    // parotoid glands: the two poison lumps behind a toad's eyes
    for (const s of [1, -1]) {
      ball(k, body, `parotoid${s > 0 ? "l" : "r"}`, {
        rx: bx * 0.2, ry: by * 0.3, rz: bz * 0.24,
        at: [s * bx * 0.55, by * 0.6, bz * 0.16], color: shade(col.base, -0.2),
      });
    }
  }
  /* The mouth. `k.arc` lays its ring in the XY plane out of a square section
     whose four corners all sit at z = 0 — a zero-thickness ribbon, not a tube.
     That is the pure-black crescent slab that hung unpaired off the flank of
     all six frogs: a flat plate, edge-on to the camera, solid ink whatever the
     body colour. A frog's mouth is a wide shallow line across the front of the
     snout, so it is a flattened ellipsoid pressed into the face and merged
     into the body mesh, where it cannot float. */
  ball(k, body, "mouth", { merge: true,
    rx: bx * 0.52, ry: by * 0.085, rz: bz * 0.2,
    at: [0, -by * 0.18, bz * 0.8], color: ink, subdiv: 0,
  });

  /* The folded jumping leg IS the frog. It used to be two thin sticks in the
     dark accent tucked under the body where nothing could see them; it is now
     a fat femur swung out and back, a shank folded forward under it, and a
     long webbed foot on the ground — the Z that reads as "about to jump". */
  /* Stance. A puddle frog squats flat, a tree frog perches high on folded
     legs, a toad hunkers. Where the body sits over the feet is most of what
     separates one frog silhouette from another. */
  const stance = treefrog ? "perch" : toad ? "hunker" : v.pick("stance", ["squat", "perch", "sit"]);
  const ST = {
    squat: { femur: 0.8, fold: 2.7, rise: 0.85, out: 1.62 },
    sit: { femur: 1.0, fold: 2.42, rise: 1.0, out: 1.5 },
    perch: { femur: 1.24, fold: 2.16, rise: 1.2, out: 1.34 },
    hunker: { femur: 0.86, fold: 2.62, rise: 0.82, out: 1.7 },
  }[stance];
  const toe = v.i("toe", 3, 5);
  const femurL = v.f("femurl", 0.13, 0.22) * ST.femur;
  const shankL = femurL * v.f("shank", 0.8, 1.25);
  for (const s of [1, -1]) {
    const arm = legChain(k, body, `arm-${s > 0 ? "l" : "r"}`, {
      at: [s * bx * 0.62, -by * 0.34, bz * 0.56], r: 0.026,
      seg: [
        { len: v.f("arml", 0.1, 0.16), rz: s * -0.26, rx: Math.PI - 0.5, taper: 0.9 },
        { len: v.f("arml", 0.1, 0.16) * 0.7, rz: s * 0.16, rx: 0.7, taper: 0.85 },
      ],
      color: col.base,
    });
    const hind = legChain(k, body, `hind-${s > 0 ? "l" : "r"}`, {
      at: [s * bx * 0.6, -by * 0.05, -bz * 0.42], r: v.f("hindr", 0.05, 0.07),
      seg: [
        // femur: out, back, and a little up — the knee rides above the flank
        { len: femurL, rz: s * -ST.out, rx: -0.62, taper: 1.05, bulge: 0.42 },
        // shank: folded sharply forward and down
        { len: shankL, rz: s * 0.18, rx: ST.fold, taper: 0.6 },
        // tarsus: flat on the ground, pointing forward
        { len: shankL * 0.62, rz: s * 0.1, rx: -1.02, taper: 0.62 },
      ],
      color: col.base,
    });
    for (const [tag, chain, span] of [["f", arm, 0.034], ["h", hind, 0.05]]) {
      const tip = chain[chain.length - 1];
      for (let i = 0; i < toe; i += 1) {
        const digit = spindle(k, tip, `toe${tag}${i}${s > 0 ? "l" : "r"}`, {
          r: 0.014, len: span * (tag === "h" ? 2.0 : 1.4) * (1 - Math.abs(i - (toe - 1) / 2) * 0.16),
          at: [0, (tag === "h" ? shankL * 0.52 : 0.07), 0],
          rot: [-1.35, (i - (toe - 1) / 2) * 0.42, 0],
          color: shade(col.base, 0.24), seg: 6, tip: 0.5,
        });
        if (treefrog) {
          ball(k, digit, `pad${tag}${i}${s > 0 ? "l" : "r"}`, { merge: true,
            r: 0.019, at: [0, span * (tag === "h" ? 1.9 : 1.3), 0],
            color: shade(col.base, 0.4), subdiv: 0,
          });
        }
      }
      // the web between the toes
      if (tag === "h") {
        ball(k, tip, `web${s > 0 ? "l" : "r"}`, { merge: true,
          rx: span * 1.5, ry: 0.012, rz: span * 1.5,
          at: [0, shankL * 0.62, span * 0.9], color: shade(col.base, 0.12), subdiv: 0,
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
  /* All three snakes were shipping as a tight ball of beads with no readable
     body — "coil" won the pick twice out of four and a wound coil at this
     scale is a doughnut. A partly extended S is the pose that reads as a
     snake, so it is the default and the loop is the exception. */
  const form = tiny ? "loop" : v.pick("form", ["ess", "ess", "loop", "ess"]);
  const thick = (tiny ? 0.035 : v.f("thick", 0.055, 0.095));
  const turn = v.f("turn", 1.3, 2.3);
  const bandN = v.i("band", 0, 4);
  const amp = v.f("amp", 0.16, 0.3);
  const rad = v.f("rad", 0.12, 0.22);
  const rise = v.f("rise", 0.03, 0.18);

  const path = (t) => {
    if (form === "ess") return [Math.sin(t * Math.PI * turn) * amp, 0.06 + t * rise * 0.7, -0.42 + t * 0.86];
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
  /* Bead spacing is a contract: neighbours must overlap or the snake ships as
     a string of separate blobs. The old code held that contract by SHRINKING
     THE WHOLE PATH when the beads came out too far apart — with a bead count
     capped at fourteen, an extended S collapsed to a third of its length and
     all three snakes shipped as a tight ball of spheres with no readable body.
     Resample by arc length instead and let the count follow the curve: the
     pose survives, and the beads merge into one mesh so the extra ones cost
     triangles rather than a kilobyte of glTF bookkeeping each. */
  const SAMPLE = 240;
  const walk = [];
  let arc = 0;
  for (let i = 0; i <= SAMPLE; i += 1) {
    const q = path(i / SAMPLE);
    if (i > 0) arc += Math.hypot(q[0] - walk[i - 1].p[0], q[1] - walk[i - 1].p[1], q[2] - walk[i - 1].p[2]);
    walk.push({ p: q, s: arc });
  }
  const n = clamp(Math.ceil(arc / (thick * 0.55)) + 1, tiny ? 7 : 12, 34);
  const pos = [];
  for (let i = 0; i < n; i += 1) {
    const want = (arc * i) / (n - 1);
    let j = 1;
    while (j < walk.length - 1 && walk[j].s < want) j += 1;
    const a = walk[j - 1], b = walk[j];
    const u = b.s > a.s ? (want - a.s) / (b.s - a.s) : 0;
    pos.push([0, 1, 2].map((c) => a.p[c] + (b.p[c] - a.p[c]) * u));
  }
  const bodyNode = k.cute.node("body", { parent: k.root, at: [0, 0, 0] });
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    const r = thick * (0.55 + 0.45 * Math.sin(Math.PI * clamp(t * 1.15, 0, 1)));
    k.cute.add(bodyNode, ballGeo(r, r * v.f("flat", 0.7, 1), r, 1), {
      at: pos[i],
      color: bandN && i % Math.max(2, Math.round(n / bandN)) === 0
        ? shade(col.base, -0.36)
        : shade(col.base, (i % 2 ? 0.06 : -0.03)),
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
  /* The angelfish's whole identity is a tall, laterally compressed disc with
     trailing fins — it is not a fat oval in a different tint, and it was
     shipping as one because nothing ever set `kind`. */
  const angel = opt.kind === "angel" || /^(pterophyllum|symphysodon)-/.test(who(k));
  const sword = /^xiphophorus-/.test(who(k));
  /* Fin colour. `darkOf` fell through to `col.dark`, and for a fish that
     wrote only its real `base` that dark belongs to the POOL colour the class
     derived before the species overrode it — which is why all ten fish,
     goldfish and black widow tetra included, wore the same blue fins. A fin
     takes a shade of the fish unless the palette says otherwise. */
  const dark = col.fin ?? shade(col.base, -0.24);
  const bx = angel ? 0.05 : v.f("bx", 0.075, 0.13);
  const by = angel ? v.f("aby", 0.26, 0.32) : v.f("by", 0.13, 0.24);
  const bz = angel ? v.f("abz", 0.16, 0.2) : v.f("bz", 0.22, 0.34);
  const body = ball(k, k.root, "body", { rx: bx, ry: by, rz: bz, at: [0, by + 0.06, 0], color: col.base });
  ball(k, body, "belly", { rx: bx * 0.78, ry: by * 0.6, rz: bz * 0.7, at: [0, -by * 0.32, bz * 0.24], color: bellyOf(col) });

  const tailKind = v.pick("tailk", ["fan", "fork", "veil", "round"]);
  const tailSize = (opt.kind === "fancy" ? 1.5 : angel ? 1.35 : 1) * v.f("tails", 1.05, 1.5);
  const tailOut = bladeOutline(0.15 * tailSize, 0.13 * tailSize, {
    n: 12,
    taper: tailKind === "fork" ? -0.55 : tailKind === "veil" ? -0.2 : 0.1,
    notch: tailKind === "fork" ? 0.4 : tailKind === "round" ? -0.1 : 0.15,
  });
  /* The caudal peduncle: the narrow waist between body and tail. Without it
     the tail fin is a slab bolted to the back of an oval at the same angle as
     the dorsal, and the fish reads as front-to-back symmetric — which is
     exactly what the review saw on nine of the ten. */
  ball(k, body, "peduncle", {
    rx: bx * 0.42, ry: by * (angel ? 0.24 : 0.38), rz: bz * 0.2,
    at: [0, angel ? -by * 0.1 : 0, -bz * 0.78], color: shade(col.base, -0.1),
  });
  const tail = hinge(k, body, "tail", {
    at: [0, angel ? -by * 0.1 : 0, -bz * 0.9], rot: [0, 0, Math.PI / 2],
    axis: "y", base: 0, amp: v.f("swish", 0.3, 0.5), dur: v.f("swishd", 0.8, 1.4),
  });
  k.cute.add(tail, bladeGeo(tailOut, 0.024), { at: [0, 0, -0.13 * tailSize], color: dark });
  if (sword) {
    /* The swordtail's sword: a long spine off the LOWER caudal lobe, and the
       only reason the species has its name. */
    spindle(k, tail, "sword", {
      r: 0.009, len: v.f("swordl", 0.16, 0.24),
      at: [-0.1 * tailSize, 0, -0.09 * tailSize], rot: [0, 0, -Math.PI / 2],
      root: 0.03, color: col.accent ?? APP.orange, seg: 6, tip: 0.3,
    });
  }

  const dorsalN = v.i("dorsn", 1, 3);
  for (let i = 0; i < dorsalN; i += 1) {
    /* A dorsal fin has LENGTH along the back as well as height. Built in the
       XZ plane and stood up by a quarter turn about Z, the blade's own x
       becomes its height and its z stays fore-aft — so the fin is a sail
       rather than the thin paddle it used to be. */
    const dorsH = v.f("dorsr", 0.08, 0.14) * (angel ? 2.3 : 1) * (1 - i * 0.2);
    const dorsL = bz * (angel ? 0.46 : v.f("dorsl", 0.24, 0.4)) * (1 - i * 0.24);
    blade(k, body, `dorsal${i}`, {
      outline: bladeOutline(dorsH, dorsL, { n: 9, taper: -0.25 }), thick: 0.02,
      at: [0, by * 0.8, bz * (0.16 - i * 0.44)], rot: [0, 0, Math.PI / 2],
      off: [dorsH * 0.72, 0, 0], color: dark,
    });
  }
  if (angel || v.on("anal", 0.6)) {
    const analH = angel ? v.f("analr", 0.22, 0.3) : v.f("analr", 0.06, 0.1);
    const analL = bz * (angel ? 0.44 : 0.26);
    blade(k, body, "anal", {
      outline: bladeOutline(analH, analL, { n: 9, taper: -0.25 }), thick: 0.02,
      at: [0, -by * 0.78, -bz * 0.18], rot: [0, 0, -Math.PI / 2],
      off: [analH * 0.72, 0, 0], color: dark,
    });
  }
  for (const s of [1, -1]) {
    const fin = hinge(k, body, `pect-${s > 0 ? "l" : "r"}`, {
      at: [s * bx * 0.72, -by * 0.14, bz * 0.3], rot: [0.2, s * 0.55, s * 0.55], axis: "x", base: 0,
      amp: v.f("finf", 0.16, 0.3), dur: v.f("find", 0.7, 1.1), phase: s > 0 ? 0 : 0.4,
    });
    /* Pectorals read as whiskers when they are 0.08 long and edge-on. Broad,
       fanned and raked back, they read as fins. */
    const pw = v.f("pectw", 0.1, 0.15);
    k.cute.add(fin, bladeGeo(bladeOutline(pw, pw * v.f("pectc", 0.55, 0.85), { n: 9, taper: 0.34 }).map(([x, z]) => [x * s, z]), 0.016), { at: [s * pw * 0.85, 0, -pw * 0.25], color: shade(col.base, 0.18) });
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
  /* The butterfly's body. `darkOf` fell straight through to `col.dark`, and
     for a species that wrote only its real `base` that is the orchestrator's
     DERIVED insect dark — a shade of a random tuned insect hue. Thirty of the
     forty-four butterflies were therefore carrying a purple, teal, magenta or
     orange thorax on a drab satyrid, a white pierid or a black nymphalid. The
     ones that read correctly were exactly the ones whose derived pick landed
     on something dark. Route it through the same authored-vs-derived test the
     legs and chitin already use, and fall back to the animal's OWN colour.
     A butterfly's own body is a dark drab brown whatever its wings do, so the
     fallback mixes toward one rather than merely darkening the wing colour —
     `shade` on a white pierid only gets you a pale grey thorax. */
  const dark = authoredDark(col) ?? mix(col.base, hex("#2b2620"), v.f("bodyd", 0.34, 0.95));
  const bodyCol = moth ? shade(col.base, -0.25) : dark;
  /* The saturniids and the birdwings are among the biggest lepidoptera alive;
     shipping Attacus at the same size as a leaf-roller moth is a factual
     error, not a style choice. */
  const giant = /^(attacus|actias|samia|antheraea|troides|papilio-)/.test(who(k)) ? 1.45 : 1;
  /* Bipectinate antennae are a family fact, not a die roll: Saturniidae,
     Lymantriinae, Lasiocampidae. */
  const plumose = moth && /^(attacus|actias|samia|antheraea|cricula|loepa|lymantria|orgyia|olene|dasychira|calliteara|arctornis|euproctis|somena|artace|trabala|lebeda|gastropacha|kunugia|bombyx)-/.test(who(k));

  // thorax, head, segmented abdomen — the abdomen count is a species knob
  const thoraxY = v.f("ty", 0.32, 0.5);
  const thoraxR = v.f("tr", 0.055, 0.085) * (hawk ? 1.25 : 1) * giant;
  const thorax = ball(k, k.root, "thorax", {
    rx: thoraxR, ry: thoraxR * 1.15, rz: thoraxR * 1.1, at: [0, thoraxY, 0],
    rot: [v.f("pitch", -0.3, 0.3), 0, 0], color: bodyCol,
  });
  const abdN = v.i("abdn", 2, 6);
  const abdLen = v.f("abdl", 0.05, 0.115) * (hawk ? 1.35 : 1) * giant;
  for (let i = 0; i < abdN; i += 1) {
    const r = thoraxR * (0.92 - i * (skipper ? 0.16 : 0.1));
    ball(k, thorax, `abdomen${i}`, {
      rx: r, ry: abdLen * 0.62, rz: r,
      at: [0, -thoraxR * (0.22 + i * 0.16) * (hawk ? 0.5 : 1), -thoraxR * 0.55 - abdLen * i * 0.82],
      color: i % 2 ? shade(bodyCol, v.f("abdb", 0.06, 0.4)) : shade(bodyCol, -0.06),
    });
  }
  const headR = thoraxR * v.f("hr", 0.75, 1.0);
  const head = ball(k, thorax, "head", { r: headR, at: [0, thoraxR * 0.42, thoraxR * 0.85], color: bodyCol });
  beadEyes(k, head, { r: headR * v.f("eyer", 0.5, 0.72), at: [0, 0, headR * 0.36], gap: headR * 0.62, color: ink, /* A butterfly's compound eye is dark grey-brown. The pupil was taking the
     palette accent and falling back to APP.red, which put a bright red bead on
     the front of every head in the family. */
    pupil: accentOf(k, col, mix(ink, col.base, 0.3)), spark: true, subdiv: 1 });
  antennaPair(k, head, {
    at: [0, headR * 0.5, headR * 0.3], gap: headR * 0.32,
    len: v.f("antl", 0.1, 0.22) * (plumose ? 1.35 : 1), r: plumose ? 0.0095 : 0.008, spread: v.f("ants", 0.3, 0.8),
    /* The species whose antennae are bipectinate as a matter of fact —
       giant silkmoths, tussocks and lappets — get the comb rather than a coin
       flip on it. Everything else keeps the roll. */
    joint: moth && plumose ? 3 : 2,
    form: plumose ? "feather" : moth ? v.pick("antf", ["thread", "feather", "thread"]) : v.pick("antf", ["club", "club", "hook"]),
    barb: plumose ? v.i("barbn", 6, 9) : (moth && v.on("barb", 0.5) ? 2 : 0),
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
  const foreX = v.f("fx", 0.21, 0.32) * (hawk ? 1.25 : skipper ? 0.78 : 1) * giant;
  const foreZ = foreX * v.f("fzr", 0.62, 1.0) * (skipper ? 0.78 : hawk ? 0.42 : 1);
  const foreOut = wingShape(FOREWING, foreX, foreZ, {
    scallop: v.on("fsc", 0.4) ? v.f("fscm", 0.4, 1) : 0,
    apex: v.f("fap", 0.88, 1.16),
    sweep: v.f("fsw", -0.22, 0.16),
  });
  /* Wing carriage: a moth holds its wings flat, roofed or tented and a
     butterfly holds them open or clapped over its back. It is the single
     biggest difference in how tall the animal reads, so it is a species knob
     rather than one shared pose. */
  const pose = moth
    ? v.pick("pose", ["flat", "roof", "tent", "flat", "fan", "delta"])
    : v.pick("pose", ["open", "up", "raked", "half", "clap", "tilt", "spread", "stack"]);
  const carriage = {
    flat: [-0.05, 0.18], roof: [0.3, 0.75], tent: [0.14, 0.52],
    fan: [-0.16, 0.06], delta: [0.52, 0.98],
    open: [0.36, 0.66], raked: [0.62, 0.95], up: [1.05, 1.5],
    half: [0.82, 1.12], clap: [1.42, 1.82],
    tilt: [0.18, 0.42], spread: [-0.1, 0.12], stack: [1.2, 1.62],
  }[pose];
  /* How far forward the wing is swept is part of the carriage too, and it is
     the dimension the shape signature reads as depth. Three sibling satyrids
     holding their wings at the same angle in the same plane are, correctly,
     one model; giving the pose a sweep of its own separates them on a fact
     about the animal rather than on a tint. */
  const sweepK = { flat: 0.0, roof: 0.22, tent: 0.12, fan: -0.14, delta: 0.34,
    open: 0.0, raked: 0.2, up: -0.1, half: 0.3, clap: -0.24,
    tilt: 0.36, spread: -0.2, stack: 0.12 }[pose];
  const wingY = thoraxY + thoraxR * (moth ? 0.2 : 0.55);
  const foreWing = bladeWings(k, k.root, {
    at: [0, wingY, thoraxR * 0.15], gap: thoraxR * 0.55, outline: foreOut, thick: v.f("fth", 0.012, 0.024),
    reach: foreX * 0.05, tilt: v.f("ftl", -0.2, 0.25), yaw: (moth ? v.f("fyaw", 0.35, 0.75) : v.f("fyaw", 0.0, 0.24)) + sweepK,
    /* Wing carriage as a continuous species value rather than one of a
       handful of buckets. How far a butterfly's wings are raised is most of
       what decides how tall it reads, and that is the dimension the shape
       signature can actually see two small pale pierids differ in. */
    roll: moth ? v.f("frl", carriage[0], carriage[1]) : v.f("frl", 0.02, 1.72),
    color: col.base, colorFn: col.wingGrad,
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
    /* The hindwing hinge drops off the THORAX, not off the forewing's chord.
       Scaling it by the chord let a broad-winged moth hang its hindwing a
       third of a unit below the body with nothing in between. */
    at: [0, wingY - thoraxR * v.f("hdrop", 0.35, 1.05), -thoraxR * 0.85], gap: thoraxR * 0.45, outline: hindOut, thick: v.f("hth", 0.012, 0.026),
    reach: hindX * 0.05, tilt: v.f("htl", -0.15, 0.2), yaw: (moth ? v.f("hyaw", 0.3, 0.7) : v.f("hyaw", 0, 0.2)) - sweepK * 0.6,
    /* A birdwing's hindwing is gold and its forewing is black — that single
       contrast is the whole diagnostic, and painting the hindwing a shade of
       the forewing threw it away on all three Troides. */
    roll: moth ? v.f("hrl", carriage[0] * 0.85, carriage[1] * 0.9) : v.f("frl", 0.02, 1.72) * v.f("hrlk", 0.72, 0.95),
    color: /^(troides|trogonoptera|ornithoptera)-/.test(who(k)) && col.accent
      ? col.accent
      /* The gulls and the orange tips carry a deep yellow wash over the whole
         hindwing — Cepora aspasia is NAMED for it, and without it a lesser
         gull and a grass yellow are the same white butterfly twice, which is
         what the distinctness gate was saying about those two. */
      : /^(cepora|prioneris|ixias|hebomoia|pareronia)-/.test(who(k))
        ? mix(col.base, col.hindwing ?? hex("#e8c23a"), 0.72)
        : shade(col.base, v.f("hshade", -0.16, 0.36)),
    flap: v.f("hflap", 0.08, 0.26), dur: v.f("fdur", 1.0, 1.8), phase: 0.25, name: "wing-lo",
  });

  /* Wing pattern. A butterfly's spots and ocelli genuinely are bright — the
     derived accent is a plausible one there and is most of what tells two
     white pierids apart. A moth's are not, so the moth half goes through the
     authored-accent test and lands on a pale scale colour instead. */
  const spotCol = moth ? accentOf(k, col, mix(col.base, paper, 0.55)) : (col.accent ?? mix(paper, col.base, 0.1));
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
          at: [s * rx * (0.25 + t * 0.55), 0, rz * v.f(`spo${i}`, -0.24, 0.24) * (1 - t * 0.5)],
          color: i % 2 ? spotCol : shade(col.base, -0.4), subdiv: 0,
        });
      }
    }
  }
  /* The pierid apical border. A grass yellow and a lesser gull are both small
     pale butterflies with the same wing carriage, and without the heavy black
     margin that Eurema, Catopsilia and Appias actually wear they come out as
     one model in two tints — which is exactly what the distinctness signature
     said about Eurema blanda and Cepora aspasia. */
  if (!moth && /^(eurema|catopsilia|appias|leptosia|gandaca|colias|terias)-/.test(who(k))) {
    for (const [si, w] of foreWing.entries()) {
      const s = si === 0 ? 1 : -1;
      ball(k, w, `border${si}`, { merge: true,
        rx: foreX * 0.34, ry: 0.014, rz: foreZ * 0.78,
        at: [s * foreX * 0.74, 0, foreZ * 0.06], color: col.border ?? hex("#2a2622"), subdiv: 0,
      });
    }
  }
  const bandN = v.i("bandn", 0, 3);
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
      /* Anchored well inside the hindwing outline, not out at 0.62 of the
         span where a tapering blade has nothing left to hang off. */
      spindle(k, w, `streamer${si}`, {
        r: swallowtail ? 0.013 : 0.011, len: tailL,
        at: [s * hindX * 0.34, 0, -hindZ * 0.28],
        rot: [-1.75, 0, s * 0.45], tip: swallowtail ? 0.9 : 0,
        root: 0.02, color: shade(col.base, -0.2), seg: 8,
      });
    }
  }
  const legN = 3;
  if (legN) {
    insectLegs(k, k.root, {
      at: [0, thoraxY - thoraxR * 0.6, thoraxR * 0.2], gap: thoraxR * 0.4, pair: legN,
      len: v.f("legl", 0.07, 0.13), r: 0.008, spanZ: thoraxR * 0.8, splay: 1.35, bend: 1.0, color: bodyCol, arch: thoraxR * 0.45,
    });
  }
  /* Ocelli: the raised eyespots on a satyrine's wing, as real parts. Merged
     paint cannot separate two butterflies in the signature; a part can. */
  const ocelN = v.i("oceln", 0, 5);
  for (let i = 0; i < ocelN; i += 1) {
    for (const [si, w] of hindWing.entries()) {
      const s = si === 0 ? 1 : -1;
      /* Every ocellus used to read the SAME `v.f("ocelx")` — one key, one
         value — so a species with four of them stacked all four in one spot,
         and if that spot fell off the tapering blade all four floated
         together. They step out along the wing now, they narrow with it, and
         they sit ON the blade's mid-plane rather than hovering 12 mm above a
         surface that may be only 12 mm thick. */
      const ox = Math.min(0.66, 0.26 + i * 0.11);
      ball(k, w, `ocellus${i}${si}`, {
        rx: hindX * v.f("ocelr", 0.1, 0.17) * (1 - ox * 0.5), ry: 0.011,
        rz: hindZ * v.f("ocelz", 0.16, 0.28) * (1 - ox * 0.5),
        at: [s * hindX * ox, 0, hindZ * v.f(`ocelo${i}`, -0.22, 0.2) * (1 - ox * 0.7)],
        color: i % 2 ? spotCol : shade(col.base, -0.5),
      });
    }
  }
  /* Scale tufts: the shaggy shoulder and abdominal crests a noctuid carries.
     Counting them is a species knob with real parts behind it, which is what
     the distinctness signature can actually see — two moths built from the
     same recipe with two different tints are, correctly, one model. */
  const tuftN = v.i("tuftn", 0, 5);
  for (let i = 0; i < tuftN; i += 1) {
    for (const s of [1, -1]) {
      /* Stepped by 0.7 of the thorax radius each, five tufts walked a chain of
         beads out from under the animal and into the air below it — they have
         to stay ON the shoulder they are tufts of. */
      ball(k, thorax, `tuft${i}-${s > 0 ? "l" : "r"}`, {
        rx: thoraxR * 0.4, ry: thoraxR * 0.3, rz: thoraxR * 0.4,
        at: [s * thoraxR * 0.7, thoraxR * (0.3 - i * 0.26), -thoraxR * (0.2 + i * 0.16)],
        color: shade(bodyCol, i % 2 ? 0.3 : -0.2), subdiv: 0,
      });
    }
  }
  if (moth) {
    const crestN = v.i("crestn", 0, 4);
    for (let i = 0; i < crestN; i += 1) {
      ball(k, thorax, `crest${i}`, {
        rx: thoraxR * v.f("crestw", 0.4, 0.75), ry: thoraxR * v.f("cresth", 0.3, 0.6), rz: thoraxR * 0.35,
        at: [0, thoraxR * (0.85 - i * 0.2), -thoraxR * (0.1 + i * 0.3)],
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
  const dark = chitinOf(col);
  /* A dragonfly's abdomen is several times the length of its thorax; four
     short beads made it barely longer than the head, which is why none of the
     ten read as a dragonfly. */
  const segs = v.i("segn", slim ? 8 : 6, slim ? 14 : 12);
  const segLen = v.f("segl", 0.1, 0.15);
  const abdR = slim ? v.f("ar", 0.013, 0.024) : v.f("ar", 0.021, 0.044);
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

  const headR = abdR * v.f("hr", 1.8, 2.6);
  const head = ball(k, thorax, "head", { rx: headR * 1.15, ry: headR * 0.85, rz: headR * 0.8, at: [0, abdR * 0.5, abdR * 2.6], color: dark });
  const eyeR = headR * v.f("eyer", 0.6, 0.92);
  beadEyes(k, head, {
    r: eyeR, at: [0, headR * 0.15, headR * 0.15], gap: headR * (slim ? 0.95 : 0.6),
    color: accentOf(k, col, shade(col.base, 0.3)), pupil: ink, subdiv: 1,
  });
  antennaPair(k, head, { at: [0, headR * 0.5, headR * 0.3], gap: headR * 0.2, len: 0.03, r: 0.005, spread: 0.7, joint: 1, form: "thread", color: dark });

  const wingLen = v.f("wl", 0.2, 0.4);
  const wingW = v.f("ww", 0.035, 0.065);
  const wingCol = shade(accentOf(k, col, col.base), v.f("wsh", 0.3, 0.5));
  for (const [i, dz] of [abdR * 1.2, -abdR * 1.4].entries()) {
    bladeWings(k, thorax, {
      at: [0, abdR * 1.4, dz], gap: abdR * 0.8,
      outline: bladeOutline(wingLen * (1 - i * v.f("wtaper", 0.02, 0.2)), wingW * (i ? v.f("hw", 0.9, 1.5) : 1), {
        n: 14, taper: v.f("wt", -0.3, 0.25), notch: v.f("wn", -0.1, 0.25),
      }),
      thick: 0.01, reach: wingLen * 0.85,
      /* A damselfly holds its wings CLOSED over its back — near vertical,
         swept back along the abdomen. Half a radian is a dragonfly with a
         droop, which is what both of ours were shipping as. */
      tilt: v.f("wtl", -0.1, 0.12), roll: slim ? v.f("wrl", 1.34, 1.54) : v.f("wrl", -0.05, 0.12),
      yaw: slim ? v.f("wyaw", 0.85, 1.05) : v.f("wyaw", 0.0, 0.18),
      color: wingCol, flap: v.f("wf", 0.06, 0.16), dur: v.f("wd", 0.45, 0.8), phase: i * 0.2, name: `wing${i}`,
    });
  }
  const stripeN = v.i("stripen", 0, 4);
  for (let i = 0; i < stripeN; i += 1) {
    ball(k, thorax, `stripe${i}`, { merge: true,
      rx: abdR * 2.6, ry: abdR * 0.5, rz: abdR * 0.6,
      at: [0, abdR * (1.0 - i * 0.9), abdR * (1.4 - i * 1.3)], color: accentOf(k, col, paper), subdiv: 0,
    });
  }
  insectLegs(k, thorax, {
    at: [0, -abdR * 1.4, abdR * 0.8], gap: abdR * 0.6, pair: 3,
    len: v.f("legl", 0.08, 0.14), r: 0.008, spanZ: abdR * 1.6, splay: 1.0, bend: 1.3, color: ink, arch: abdR * 0.7,
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
  /* `hornet` is a wasp. The route table says `kind: "wasp"` but four species —
     Vespa luctuosa among them — override `opt` with `kind: "hornet"`, and
     `opt = { ...arch.opt, ...known.opt }` REPLACES the key rather than adding
     to it. Every wasp-only feature was therefore switched off for exactly the
     species the review was looking at, which is why the hornet's orange never
     appeared anywhere in the model. */
  const wasp = opt.kind === "wasp" || opt.kind === "hornet";
  const bee = opt.kind === "bee";
  const dark = chitinOf(col);
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
  const thoraxZ = thoraxR * (bee ? v.f("tl", 1.0, 1.25) : wasp ? v.f("tl", 1.25, 1.7) : v.f("tl", 1.0, 1.5));
  const thorax = ball(k, head, "thorax", {
    rx: thoraxR * (bee ? v.f("tw", 1.1, 1.32) : wasp ? v.f("tw", 0.8, 0.95) : v.f("tw", 0.85, 1.1)),
    ry: thoraxR * (bee ? v.f("th", 1.05, 1.25) : v.f("th", 0.85, 1.2)),
    rz: thoraxZ,
    at: [0, ant ? headR * 0.15 : 0, -headR * 0.5 - thoraxR * 0.6], color: col.thorax ?? col.base,
  });
  /* The petiole. A waist stalk is only a waist if you can SEE PAST it, and the
     chain started at -thoraxR * 0.9 — a fixed fraction of the thorax's WIDTH,
     which on a wasp whose thorax is 1.25-1.7 of that long put the whole stalk
     inside the thorax and the gaster hard against its back wall. All ten of
     them read as bumblebees for that reason. It starts at the thorax's actual
     rear now, and the gaster is hung off the far end of the stalk instead of
     off the stalk's middle.
     The mud-daubers go further: Sceliphron is DEFINED by a thread-thin
     petiole as long as the rest of the abdomen. */
  const dauber = /^(sceliphron|chalybion|ammophila|eumenes|delta|isodontia|prionyx)-/.test(who(k));
  const waistN = ant ? v.i("waist", 1, 2) : wasp ? 2 : 1;
  const waistR = thoraxR * (dauber ? 0.1 : wasp ? 0.16 : ant ? 0.3 : 0.5);
  /* Sized against the THORAX, not against its own radius. A stalk four times
     a 0.19-thorax-radius bead is still only a third the length of the segment
     in front of it, and at gallery size that is not a waist, it is a seam. */
  const waistZ = wasp ? thoraxZ * (dauber ? v.f("wz", 1.5, 2.0) : v.f("wz", 0.62, 0.88)) : waistR * 1.1;
  let p = thorax;
  let at = [0, ant ? -thoraxR * 0.1 : 0, -(ant ? thoraxR * 0.9 : thoraxZ * 0.98)];
  for (let i = 0; i < waistN; i += 1) {
    p = ball(k, p, `petiole${i}`, {
      rx: waistR, ry: waistR * (wasp ? v.f("wh", 1.0, 1.25) : v.f("wh", 1.0, 1.8)),
      rz: waistZ / (wasp ? waistN : 1), at, color: dark, subdiv: 1,
    });
    at = [0, 0, -(waistZ / (wasp ? waistN : 1)) * 1.9];
  }
  const gx = (ant ? 0.055 : bee ? 0.105 : 0.082) * s0 * v.f("gw", 0.78, 1.3);
  const gz = (ant ? 0.075 : bee ? 0.115 : 0.145) * s0 * v.f("gl", 0.78, 1.45);
  const gaster = ball(k, p, "gaster", {
    rx: gx, ry: gx * (bee ? v.f("gh", 0.95, 1.15) : v.f("gh", 0.8, 1.05)), rz: gz,
    at: [0, ant ? gx * 0.15 : 0, -(wasp ? (waistZ / waistN) * 0.9 : waistR * 0.4) - gz * 0.9], color: col.base,
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
        color: i % 2 ? shade(col.base, -0.24) : accentOf(k, col, shade(col.base, 0.1)),
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
  /* The banded gaster. Every ring used to be painted one flat `col.dark`,
     which is the derived accent — so a hornet with a hand-written orange
     abdomen shipped without a single orange vertex in it. Rings alternate the
     species' own accent against its dark, which is both what the palette
     intends and what a wasp actually looks like. */
  const stripeN = opt.stripes === false ? 0 : v.i("stripen", ant ? 0 : 3, ant ? 2 : 5);
  for (let i = 0; i < stripeN; i += 1) {
    ball(k, gaster, `stripe${i}`, { merge: true,
      rx: gx * 1.05, ry: gx * 1.05 * v.f("gh", 0.85, 1.2), rz: gz * (ant ? 0.12 : 0.19),
      at: [0, 0, gz * (0.66 - i * (1.4 / Math.max(1, stripeN)))],
      color: ant ? shade(col.base, -0.34) : (i % 2 ? accentOf(k, col, shade(col.base, 0.34)) : shade(col.base, -0.3)),
      subdiv: 0,
    });
  }
  if (!ant) {
    cone(k, gaster, "sting", { r: gx * 0.24, h: gz * v.f("stingl", 0.4, 0.8), at: [0, 0, -gz * 0.8], rotX: -Math.PI / 2, color: ink });
  } else {
    /* Propodeal spines. Counting them is one of the few structural knobs an
       ant has, and it has to carry more weight now that the chitin colour is
       derived from the body instead of from a per-species accent — two ants
       that differ only in tint are, correctly, one model. */
    /* Polyrhachis is the SPINY ant: a pair of long propodeal spines is not a
       die roll on that genus, it is the reason for the name. */
    const spiny = /^(polyrhachis|pheidole|myrmicaria|cataulacus|meranoplus)-/.test(who(k));
    const spineN = spiny ? 2 : v.i("spinen", 0, 2);
    for (let q = 0; q < spineN; q += 1) {
      for (const s of [1, -1]) {
        cone(k, thorax, `spine${q}-${s > 0 ? "l" : "r"}`, {
          r: thoraxR * (0.2 - q * 0.05),
          h: thoraxR * (spiny ? v.f("spinel", 1.6, 2.4) : v.f("spinel", 0.6, 1.3)) * (1 - q * 0.3),
          at: [s * thoraxR * (0.5 - q * 0.12), thoraxR * (0.5 - q * 0.55), -thoraxR * (0.5 - q * 0.3)],
          rotZ: s * 0.5, rotX: -0.5 + q * 0.9, color: dark,
        });
      }
    }
  }

  /* Trap-jaw. An Odontomachus carries two straight mandibles as long as its
     own head, held wide open at 180 degrees — it is the most recognisable ant
     head in the world and all three of ours had the same short curved jaws as
     everything else. */
  const trapjaw = /^(odontomachus|anochetus|myrmoteras|strumigenys|harpegnathos)-/.test(who(k));
  if (trapjaw || opt.mandibles || v.on("mand", ant ? 0.5 : 0.25)) {
    for (const s of [1, -1]) {
      cone(k, head, `mandible-${s > 0 ? "l" : "r"}`, {
        r: headR * (trapjaw ? 0.1 : 0.16),
        h: headR * (trapjaw ? v.f("mandl", 2.4, 3.2) : v.f("mandl", 0.9, 1.9)),
        at: [s * headR * (trapjaw ? 0.22 : 0.34), -headR * (trapjaw ? 0.1 : 0.2), headR * (trapjaw ? 0.6 : 0.45)],
        rotX: Math.PI / 2 - (trapjaw ? 0.05 : 0.2),
        rotZ: s * (trapjaw ? v.f("mands", 0.55, 0.85) : v.f("mands", 0.15, 0.5)), color: dark,
      });
      /* the trigger hairs a trap-jaw fires on, as a real tip */
      if (trapjaw) {
        ball(k, head, `mandible-tooth-${s > 0 ? "l" : "r"}`, { merge: true,
          r: headR * 0.12, at: [s * headR * 0.55, -headR * 0.1, headR * 1.5], color: shade(dark, -0.2), subdiv: 0,
        });
      }
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
    spanZ: thoraxR * v.f("legspan", 0.7, 1.3), arch: thoraxR * 0.4, splay: v.f("splay", 1.0, 1.45),
    bend: v.f("bend", 0.7, 1.25), color: limb, lenMix: v.f("lenmix", -0.2, 0.2),
  });
  if (bee) {
    /* Pollen baskets: the loaded back legs that read instantly as "bee". */
    for (const sd of [1, -1]) {
      ball(k, thorax, `corbicula-${sd > 0 ? "l" : "r"}`, {
        rx: thoraxR * 0.3, ry: thoraxR * 0.42, rz: thoraxR * 0.3,
        at: [sd * thoraxR * 0.85, -thoraxR * 0.95, -thoraxR * 0.55],
        color: accentOf(k, col, APP.orange),
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
        outline: bladeOutline(wl * (1 - i * 0.3), v.f("ww", 0.072, 0.1) * (1 - i * 0.18), { n: 12, taper: v.f("wt", 0.08, 0.34) }),
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
  const dark = chitinOf(col);
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
  ball(k, body, "suture", { merge: true, rx: bx * 0.055, ry: by * 1.02, rz: bz * 0.95, at: [0, by * 0.34, -bz * 0.04], color: shade(col.base, -0.6), subdiv: 1 });
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

  /* No longhorn has a rostral horn. The coin flip was giving Epepeotes and
     Rhytiphora a cone off the front of the head, which reads as a rhino
     beetle's — the one beetle a cerambycid must not be mistaken for. */
  if (opt.horn || (!opt.longhorn && !opt.snout && v.on("horn", 0.15))) {
    cone(k, head, "horn", { r: headR * 0.3, h: headR * v.f("hornl", 1.6, 3.2), at: [0, headR * 0.3, headR * 0.2], rotX: v.f("horna", 0.3, 0.8), color: shade(accentOf(k, col, col.base), -0.1) });
    if (v.on("horn2", 0.5)) cone(k, pronotum, "horn2", { r: pronR * 0.16, h: pronR * v.f("horn2l", 0.6, 1.4), at: [0, by * 0.6, bz * 0.1], rotX: 0.5, color: shade(accentOf(k, col, col.base), -0.2) });
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
  /* On the BODY, not on the root: a leg parented to the world origin cannot
     be given a coxa, because there is nothing there to merge one into. */
  insectLegs(k, body, {
    at: [0, -by * 0.5, bz * 0.26], gap: bx * 0.55, pair: 3,
    len: v.f("legl", 0.1, 0.18), r: 0.013, spanZ: bz * v.f("legspan", 0.4, 0.7),
    splay: v.f("splay", 1.05, 1.45), bend: v.f("bend", 0.8, 1.3), color: limbOf(col), lenMix: v.f("lenmix", -0.25, 0.25), arch: by * 0.4,
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
  const dark = chitinOf(col);
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
      rx: bx * 1.05, ry: by * 1.04, rz: bz * 0.1,
      at: [0, -by * 0.05 * i, -bz * (0.12 + i * 0.2)],
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
  /* The head. It was `bx * 0.9..1.25` with a further 1.0-1.4 on its height,
     which on a body 0.07-0.11 wide and 0.2-0.32 long made a sphere as long as
     the thorax and abdomen together — every one of the seven read as a
     big-headed grub. A grasshopper's head is a small wedge, deeper than it is
     wide, tucked under the front of the pronotum. */
  const headR = bx * v.f("hr", 0.55, 0.72);
  const head = ball(k, pron, "head", {
    rx: headR, ry: headR * v.f("hh", 1.25, 1.65), rz: headR * 1.15,
    at: [0, -bx * 0.06, bz * 0.2 + headR * 0.7], rot: [v.f("hdip", 0.1, 0.4), 0, 0],
    color: col.head ?? col.base,
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
    const femurL = v.f("femur", 0.3, 0.42) * ST.femur;
    const femurR = v.f("femurr", 0.058, 0.082);
    /* The femur is a laterally flattened BLADE half the length of the animal,
       carried up and back so the knee stands above the line of the back. What
       shipped was 0.21-0.3 long and 0.042 thick with a round section, which at
       gallery size is a small hexagonal block sitting on the abdomen — the one
       feature that makes a grasshopper a grasshopper, missing from all seven.
       The tibia stays a thin spring under it, and the two must not be the same
       stick: 0.24 against a femur taper of 1.35 is a threefold difference. */
    const chain = legChain(k, body, `hind-${s > 0 ? "l" : "r"}`, {
      at: [s * bx * 0.78, by * 0.12, -bz * 0.38], r: femurR,
      seg: [
        { len: femurL, rz: s * -0.3, rx: ST.fold, taper: 1.35, bulge: 0.4, zScale: 1.5 },
        { len: femurL * v.f("tibia", 0.95, 1.25), rz: s * 0.12, rx: ST.ext, taper: 0.24 },
        { len: femurL * 0.3, rz: s * 0.08, rx: -1.05 - ST.kick, taper: 0.34, root: femurL * 0.16 },
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
        /* Placed along the TIBIA's own length. Pinned to the femur's instead,
           a long-femured stance walked the second spur off the end of the
           tibia and left it hanging in the air. */
        const tibiaL = femurL * v.f("tibia", 0.95, 1.25);
        cone(k, chain[1], `spur${i}${s > 0 ? "l" : "r"}`, { r: 0.008, h: 0.03, at: [0, tibiaL * (0.45 + i * 0.34), 0], rotZ: s * -1.3, root: 0.016, color: dark, seg: 6 });
      }
    }
  }
  insectLegs(k, body, {
    at: [0, -bx * 0.5, bz * 0.3], gap: bx * 0.5, pair: 3,
    len: v.f("legl", 0.09, 0.15), r: 0.011, spanZ: bz * 0.28, splay: 1.2, bend: 1.1, color: dark, arch: bx * 0.4,
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
  const dark = chitinOf(col);
  const cicada = opt.kind === "cicada";
  /* Three hemipterans that are not shaped like a shield bug at all. Scale
     insects are sessile waxy blobs with neither wings nor legs; lace bugs are
     flat, with a lacy hood and wings far wider than the body; and one of the
     planthoppers is a dome that mimics a ladybird. */
  const scale = /^(ceroplastes|icerya|coccus|saissetia|pulvinaria|aspidiotus|planococcus|maconellicoccus|paracoccus)-/.test(who(k));
  const lace = /^(corythucha|stephanitis|leptodictya|gargaphia)-/.test(who(k));
  const domed = /^(hemisphaerius|hysteropterum|issus)-/.test(who(k));
  if (scale) { hemipteraScale(k, col, v); return; }
  /* Body PLAN, not body tint. Nine of the seventeen were one stout torpedo:
     shield bugs that were not shield-shaped, assassin bugs with no neck, and
     slender alydids and coreids as fat as a stink bug. The three plans differ
     in the two proportions the eye actually reads — how wide the animal is
     against how long, and how flat it is. */
  const shieldBug = /^(eysarcoris|plautia|nezara|halyomorpha|dolycoris|antestiopsis|piezodorus|erthesina|cantao|catacanthus|chrysocoris|scotinophara|brachyplatys|coptosoma|megacopta|agonoscelis)-/.test(who(k));
  const assassin = /^(euagoras|ectomocoris|ectrychotes|sycanus|rhynocoris|reduvius|amphibolus|acanthaspis|coranus|isyndus|velinus|delacampus|sirthenea)-/.test(who(k));
  const slender = /^(riptortus|leptocorisa|charagochilus|homoeocerus|cletus|anoplocnemis|mictis|hygia|alydus|megalotomus|physomerus|dysdercus|machaerota|stenocoris)-/.test(who(k));
  const wide = shieldBug ? 1.34 : assassin ? 0.62 : slender ? 0.56 : 1;
  const flat = shieldBug ? 0.72 : slender ? 0.86 : 1;
  const long = shieldBug ? 0.86 : assassin ? 1.34 : slender ? 1.62 : 1;
  const bx = cicada ? v.f("bx", 0.09, 0.13) : v.f("bx", 0.1, 0.19) * (lace ? 0.8 : domed ? 1.1 : 1) * wide;
  const by = cicada ? v.f("by", 0.08, 0.12) : v.f("by", 0.05, 0.1) * (lace ? 0.55 : domed ? 1.6 : 1) * flat;
  const bz = cicada ? v.f("bz", 0.17, 0.24) : v.f("bz", 0.15, 0.26) * (domed ? 0.8 : 1) * long;
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
        /* The connexivum is a pale-and-dark banded rim on a real shield bug.
           Painting the pale half from `col.accent` put a derived flower colour
           on the widest part of the animal. */
        color: i % 2 ? shade(col.base, -0.42) : paper, subdiv: 0,
      });
    }
  }

  /* The scutellum: the triangular plate between the wing bases, apex pointing
     back down the abdomen. On a shield bug it covers most of the back; on a
     leaf-footed bug it is a small triangle. Either way it is the piece that
     says "true bug" rather than "beetle", so every hemipteran gets one. */
  /* On a pentatomid the scutellum is most of the back — that big triangle IS
     the shield in "shield bug". On an assassin bug or an alydid it is a small
     one. Picking it at random gave a stink bug a token triangle. */
  const scut = shieldBug ? "shield" : (assassin || slender) ? "small" : v.pick("scut", ["small", "big", "shield"]);
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
  if (shieldBug || (!assassin && !slender && v.on("shoulder", 0.4))) {
    for (const s of [1, -1]) {
      cone(k, pronotum, `shoulder-${s > 0 ? "l" : "r"}`, { r: by * 0.35, h: bx * v.f("shl", 0.3, 0.6), at: [s * bx * 0.7, by * 0.1, 0], rotZ: s * -1.4, color: shade(dark, -0.1) });
    }
  }
  const headR = bx * v.f("hr", 0.32, 0.5) * (assassin || slender ? 1.5 : 1);
  /* The assassin bug's neck. A reduviid's head is a narrow bead on a stalk in
     front of the pronotum, and that constriction plus the curved beak tucked
     under it is the whole family. Ours were shipping a shield bug's head set
     straight into the shoulders. */
  const neck = assassin
    ? ball(k, pronotum, "neck", {
      rx: headR * 0.42, ry: headR * 0.42, rz: headR * v.f("neckl", 0.9, 1.4),
      at: [0, -by * 0.02, bz * 0.2 + headR * 0.4], color: shade(dark, -0.1),
    })
    : pronotum;
  const head = ball(k, neck, "head", {
    rx: headR * v.f("hw", 0.9, 1.4) * (assassin ? 0.62 : 1), ry: headR * (assassin ? 0.62 : 0.75), rz: headR * (assassin ? 0.8 : 1),
    at: assassin ? [0, 0, headR * 1.0] : [0, -by * 0.05, bz * 0.22 + headR * 0.5],
    color: dark,
  });
  /* The rostrum. An assassin bug's is a stout curved dagger it holds folded
     back under the thorax, not a bristle — it is how it kills things. */
  const rostrum = v.f("rostrum", 0.05, 0.14) * (assassin ? 2.0 : 1);
  // merged collar so the head has vertices where the beak leaves it
  ball(k, head, "gula", { merge: true, r: headR * 0.42, at: [0, -headR * 0.34, headR * 0.24], color: shade(dark, -0.1), subdiv: 0 });
  spindle(k, head, "rostrum", {
    r: assassin ? 0.014 : 0.008, len: rostrum, tip: assassin ? 0.2 : 0,
    at: [0, -headR * 0.38, headR * 0.28], rot: [assassin ? v.f("rosta", 2.3, 2.7) : v.f("rosta", 1.4, 2.4), 0, 0],
    root: 0.02, color: shade(dark, -0.1), seg: 8,
  });
  antennaPair(k, head, {
    at: [0, headR * 0.2, headR * 0.5], gap: headR * 0.5,
    len: v.f("antl", 0.06, 0.16), r: 0.007, spread: v.f("ants", 0.5, 1.0), joint: 2, form: v.pick("antf", ["thread", "club"]), color: dark,
  });

  /* Wing carriage. A true bug's hemelytra lie FLAT over the abdomen and that
     flat shield is the whole silhouette — the previous pose stood them on end
     (rotX of a half turn) and every shield bug in the pack read as a rabbit.
     A cicada is the one exception here: it roofs its long clear wings over the
     body, so it gets a real tent angle and a wing longer than its abdomen. */
  const wingCol = cicada ? shade(col.base, 0.42) : lace ? mix(col.base, hex("#efeee8"), 0.66) : shade(col.base, v.f("wsh", -0.26, 0.1));
  const wingLen = cicada ? bz * v.f("cwl", 1.15, 1.5) : bz * (lace ? v.f("wl", 0.9, 1.05) : v.f("wl", 0.62, 0.82));
  const wingW = cicada ? bx * v.f("cww", 0.5, 0.68) : bx * (lace ? v.f("ww", 1.4, 1.75) : v.f("ww", 0.66, 0.84));
  const wingTilt = cicada ? v.f("wingp", 0.1, 0.24) : lace ? 0.01 : v.f("wingp", 0.02, 0.12);
  const wingRoll = cicada ? v.f("wingr", 0.5, 0.9) : lace ? 0.02 : v.f("wingr", 0.04, 0.2);
  if (lace) {
    /* The hood: the inflated lacy bubble a lace bug carries over its head. */
    ball(k, body, "hood", {
      rx: bx * 0.62, ry: by * 1.5, rz: bz * 0.34,
      at: [0, by * 0.9, bz * 0.5], color: mix(col.base, hex("#efeee8"), 0.55),
    });
  }
  if (domed) {
    // the beetle-mimic dome, with a ladybird's spots on it
    ball(k, body, "dome", {
      rx: bx * 0.98, ry: by * 1.15, rz: bz * 0.92,
      at: [0, by * 0.3, -bz * 0.05], color: col.base, colorFn: col.shellGrad,
    });
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2 + 0.4;
      ball(k, body, `spot${i}`, { merge: true,
        r: bx * v.f("spotr", 0.17, 0.24),
        at: [Math.cos(a) * bx * 0.5, by * 1.2, Math.sin(a) * bz * 0.45], color: ink, subdiv: 0,
      });
    }
  }
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
      color: i % 2 ? ink : paper, subdiv: 0,
    });
  }
  insectLegs(k, body, {
    at: [0, -by * 0.4, bz * 0.25], gap: bx * 0.5, pair: 3,
    len: v.f("legl", 0.09, 0.17), r: 0.011, spanZ: bz * v.f("legspan", 0.35, 0.65),
    splay: v.f("splay", 1.05, 1.4), bend: v.f("bend", 0.8, 1.25), color: dark, lenMix: v.f("lenmix", -0.3, 0.3), arch: by * 0.35,
  });
  beadEyes(k, head, {
    r: headR * v.f("eyer", 0.4, 0.56), at: [0, 0, headR * 0.15], gap: headR * v.f("eyeg", 0.8, 1.05),
    color: cicada ? accentOf(k, col, shade(col.base, 0.3)) : ink, pupil: cicada ? ink : paper, pupilR: 0.36, spark: cicada,
  });
  k.idle({ breatheK: v.f("br", 0.035, 0.06), bobAmp: v.f("bob", 0.008, 0.022) });
}

/**
 * A scale insect: an adult female is a sessile waxy blob glued to a twig, with
 * no wings, no visible legs and no head to speak of. Drawing Ceroplastes as a
 * winged bug with six legs was not a stylisation, it was the wrong animal.
 */
function hemipteraScale(k, col, v) {
  const r = v.f("r", 0.16, 0.24);
  const h = r * v.f("h", 0.7, 1.0);
  const wax = mix(col.base, hex("#f2ead8"), v.f("wax", 0.35, 0.6));
  const body = ball(k, k.root, "test", {
    rx: r, ry: h, rz: r * v.f("z", 0.85, 1.15), at: [0, h * 0.86, 0], color: wax,
  });
  /* The wax plates: a scale's shell is laid down in a ring of lobes with a
     raised nucleus in the middle, and counting them is the species knob. */
  const plateN = v.i("platen", 5, 8);
  for (let i = 0; i < plateN; i += 1) {
    const a = (i / plateN) * Math.PI * 2 + v.f("pa", 0, 1.2);
    ball(k, body, `plate${i}`, {
      rx: r * v.f("pw", 0.3, 0.44), ry: h * v.f("ph", 0.5, 0.75), rz: r * v.f("pz", 0.3, 0.44),
      at: [Math.cos(a) * r * 0.72, -h * 0.16, Math.sin(a) * r * 0.72],
      color: shade(wax, i % 2 ? -0.14 : 0.1),
    });
  }
  ball(k, body, "nucleus-base", { merge: true, rx: r * 0.4, ry: h * 0.2, rz: r * 0.4, at: [0, h * 0.44, 0], color: shade(wax, 0.06), subdiv: 0 });
  ball(k, body, "nucleus", {
    rx: r * v.f("nw", 0.3, 0.46), ry: h * v.f("nh", 0.45, 0.7), rz: r * v.f("nw", 0.3, 0.46),
    at: [0, h * 0.55, 0], color: accentOf(k, col, shade(col.base, -0.2)),
  });
  // the sunken base where it sits on the bark
  ball(k, k.root, "foot", {
    rx: r * 1.08, ry: h * 0.16, rz: r * 1.08, at: [0, h * 0.14, 0], color: shade(wax, -0.26),
  });
  k.idle({ breatheK: v.f("br", 0.03, 0.05), bobAmp: 0 });
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
  const dark = chitinOf(col);
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
  const abdN = v.i("abdn", 1, 7);
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
      ball(k, thorax, `stripe${i}`, { merge: true, rx: thoraxR * 1.05, ry: thoraxR * 1.05, rz: thoraxR * 0.14, at: [0, 0, thoraxR * (0.5 - i * 0.7)], color: i % 2 ? accentOf(k, col, APP.orange) : shade(col.base, -0.4), subdiv: 0 });
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
    barb: mos && v.on("plume", 0.6) ? v.i("plumen", 2, 4) : 0, wiggle: false, color: limb,
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
        color: i % 2 ? accentOf(k, col, APP.orange) : ink, subdiv: 0,
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
        rot: [v.f("bristlea", -0.6, 0.2), 0, s * 0.35], color: limb, seg: 5,
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
    r: crane ? 0.006 : 0.008, spanZ: thoraxR * v.f("legspan", 0.6, 1.1), arch: thoraxR * 0.4,
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
  const dark = chitinOf(col);
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
  const dark = chitinOf(col);
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
  /* The pronotal shield: the broad disc a cockroach pulls over its head, and
     the reason the head is hard to see on a real one. It has to be WIDER than
     the body, not narrower. */
  const thorax = ball(k, body, "pronotum", {
    rx: bx * (termite ? v.f("pw", 0.8, 1.0) : v.f("pw", 1.04, 1.2)),
    ry: by * v.f("ph", 0.55, 0.8),
    rz: bz * (termite ? v.f("pz", 0.22, 0.34) : v.f("pz", 0.34, 0.5)),
    at: [0, by * 0.2, bz * 0.66], color: shade(col.base, termite ? 0.08 : -0.16),
  });
  if (!termite) {
    ball(k, thorax, "pronotum-rim", { merge: true,
      rx: bx * 1.22, ry: by * 0.28, rz: bz * v.f("pz", 0.34, 0.5) * 1.05,
      at: [0, -by * 0.16, 0], color: shade(col.base, -0.42), subdiv: 0,
    });
  }
  const headR = bx * v.f("hr", 0.42, 0.65);
  /* The head takes a shade of the roach, not the palette accent — three of
     the four were shipping a saturated blue or yellow head. */
  const head = ball(k, thorax, "head", { rx: headR, ry: headR * 0.85, rz: headR * v.f("hz", 0.85, 1.2), at: [0, -by * 0.06, bz * 0.24 + headR * 0.5], color: col.head ?? shade(col.base, -0.28) });
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
  insectLegs(k, body, {
    at: [0, -by * 0.4, bz * 0.3], gap: bx * 0.5, pair: 3,
    len: v.f("legl", 0.1, 0.18), r: 0.009, spanZ: bz * v.f("legspan", 0.4, 0.7),
    splay: v.f("splay", 1.1, 1.45), bend: v.f("bend", 0.9, 1.4), color: ink, lenMix: v.f("lenmix", -0.3, 0.3), arch: by * 0.35,
  });
  beadEyes(k, head, { r: headR * v.f("eyer", 0.4, 0.6), at: [0, headR * 0.1, headR * 0.4], gap: headR * 0.62, color: ink, pupil: paper, spark: false });
  k.idle({ breatheK: v.f("br", 0.03, 0.05), bobAmp: v.f("bob", 0.006, 0.02) });
}

/* ── earwigs ──────────────────────────────────────────────────────────────── */

function dermaptera(k, col, opt = {}) {
  const v = vary(k);
  /* An earwig's head, antennae and legs are chitin, not a palette accent —
     routing `col.dark` here gave both of ours a bright green or blue head. */
  const dark = shade(col.base, -0.34);
  const bx = v.f("bx", 0.06, 0.11);
  const by = v.f("by", 0.035, 0.075);
  const bz = v.f("bz", 0.14, 0.28);
  const bodyY = by * 1.2;
  const body = ball(k, k.root, "body", {
    rx: bx, ry: by, rz: bz, at: [0, bodyY, -bz * 0.1],
    rot: [v.f("pitch", -0.2, 0.16), 0, 0], color: col.base,
  });
  const segN = v.i("segn", 2, 4);
  for (let i = 0; i < segN; i += 1) {
    ball(k, body, `tergite${i}`, { merge: true, rx: bx * 1.02, ry: by * 1.02, rz: bz * 0.09, at: [0, 0, -bz * (0.05 + i * (1.5 / (segN + 1)))], color: shade(col.base, i % 2 ? -0.24 : 0.1), subdiv: 0 });
  }
  for (const s of [1, -1]) {
    ball(k, body, `elytron-${s > 0 ? "l" : "r"}`, {
      rx: bx * v.f("elx", 0.38, 0.56), ry: by * v.f("ely", 0.6, 0.95), rz: bz * v.f("elz", 0.24, 0.5),
      at: [s * bx * 0.4, by * 0.32, bz * 0.3], color: shade(col.base, -0.14),
    });
  }
  /* The folded hindwing tips that stick out past the short wing cases —
     present on some earwigs, absent on others, and a real part either way. */
  const flapN = v.i("flapn", 0, 2);
  for (let i = 0; i < flapN; i += 1) {
    for (const s of [1, -1]) {
      ball(k, body, `hindtip${i}-${s > 0 ? "l" : "r"}`, {
        rx: bx * 0.24, ry: by * 0.24, rz: bz * v.f("htz", 0.12, 0.22),
        at: [s * bx * (0.3 + i * 0.24), by * 0.5, -bz * (0.02 + i * 0.16)],
        color: mix(col.base, hex("#f0ece2"), 0.5),
      });
    }
  }
  const head = ball(k, body, "head", { rx: bx * 0.6, ry: by * 0.9, rz: bx * 0.55, at: [0, by * 0.15, bz * 0.9], color: dark });
  antennaPair(k, head, { at: [0, bx * 0.3, bx * 0.4], gap: bx * 0.3, len: v.f("antl", 0.12, 0.24), r: 0.006, spread: v.f("ants", 0.3, 0.7), joint: 2, form: "thread", color: dark });
  // forceps
  /* The cerci — the tail forceps — ARE the order. They were a pair of thin
     stubs the length of a leg; they now run half the body and curve in to
     meet, which is the shape everyone recognises. */
  const forcep = bz * v.f("forcep", 0.85, 1.2);
  for (const s of [1, -1]) {
    legChain(k, body, `forcep-${s > 0 ? "l" : "r"}`, {
      at: [s * bx * 0.45, by * 0.25, -bz * 0.86], r: v.f("forcepr", 0.014, 0.02),
      seg: [
        { len: forcep * 0.55, rz: s * -0.34, rx: -1.5, taper: 0.95, bulge: 0.4 },
        { len: forcep * 0.4, rz: s * 0.7, rx: 0.1, taper: 0.55 },
        { len: forcep * 0.22, rz: s * 0.7, rx: 0.1, taper: 0.3 },
      ],
      color: shade(col.base, -0.44),
    });
  }
  insectLegs(k, k.root, {
    at: [0, bodyY - by * 0.4, bz * 0.25], gap: bx * 0.5, pair: 3,
    len: v.f("legl", 0.08, 0.14), r: 0.009, spanZ: bz * 0.4, splay: v.f("splay", 1.1, 1.45), bend: v.f("bend", 0.9, 1.3), color: dark, arch: by * 0.35,
  });
  beadEyes(k, head, { r: bx * v.f("eyer", 0.18, 0.28), at: [0, by * 0.1, bx * 0.4], gap: bx * 0.34, color: ink, pupil: paper, spark: false });
  k.idle({ breatheK: v.f("br", 0.03, 0.05), bobAmp: v.f("bob", 0.006, 0.018) });
}

/* ── stick insects ────────────────────────────────────────────────────────── */

function phasmatodea(k, col, opt = {}) {
  const v = vary(k);
  const dark = chitinOf(col);
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
  const dark = chitinOf(col);
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
    len: v.f("legl", 0.08, 0.15), r: 0.008, spanZ: bz * 0.4, splay: v.f("splay", 1.05, 1.45), bend: v.f("bend", 0.85, 1.3), color: dark, lenMix: v.f("lenmix", -0.3, 0.3), arch: by * 0.35,
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
  const dark = chitinOf(col, true);

  /* Five builds, because "spider" spans a squat crab spider and a daddy-long-
     legs and the shape signature reads leg reach and abdomen carriage, not the
     species name. Each build moves leg length, how far the legs drop, and how
     high the abdomen rides — all relative to the body, since the audit
     normalises away any absolute placement. */
  const build = jumping ? "jumper" : spiny ? "squat" : v.pick("build", ["orb", "hunter", "stilt", "squat", "orb", "hunter", "stilt"]);
  const B = {
    orb: { leg: 1.0, drop: 1.0, lift: 0.35, rake: 1.0 },
    hunter: { leg: 0.78, drop: 1.25, lift: 0.12, rake: 1.5 },
    jumper: { leg: 0.5, drop: 1.05, lift: 0.05, rake: 0.8 },
    stilt: { leg: 1.7, drop: 0.62, lift: 0.5, rake: 0.5 },
    squat: { leg: 0.62, drop: 1.35, lift: 0.0, rake: 1.2 },
  }[build];
  /* Leg length. This was the single worst number in the animal set: eight
     legs at 0.19-0.30, folded twice, reached barely past an abdomen that was
     0.35 across, so fifteen spiders read as mice. A spider's legs ARE the
     silhouette — they should span two to four times the body. Nephila is the
     extreme case the review named, and it is a real one. */
  const giantOrb = /^(nephila|nephilengys|herennia|argiope|leucauge|tetragnatha)-/.test(who(k));
  const legLen = B.leg * (jumping ? v.f("legl", 0.2, 0.3) : v.f("legl", 0.36, 0.52)) * (giantOrb ? 1.35 : 1);
  const stand = v.f("stand", 0.08, 0.2);
  const cx = (jumping ? 0.095 : 0.07) * v.f("cx", 0.85, 1.3);
  const cz = cx * (jumping ? v.f("cz", 0.9, 1.15) : v.f("cz", 1.0, 1.5));
  const ceph = ball(k, k.root, "cephalothorax", {
    rx: cx, ry: cx * v.f("cy", 0.65, 0.95), rz: cz,
    at: [0, stand + legLen * 0.12, cz * 0.9], rot: [v.f("pitch", -0.3, 0.26), 0, 0], color: dark,
  });

  // abdomen: four genuinely different bodies, not four tints of one
  const abdForm = spiny ? "spiny" : v.pick("abdf", ["round", "oval", "long", "teardrop", "round"]);
  const ar = (jumping ? 0.085 : 0.115) * v.f("ar", 0.78, 1.3);
  const shape = {
    round: [1, 0.95, 1], oval: [0.8, 0.72, 1.35], long: [0.62, 0.6, 1.8],
    teardrop: [0.95, 1.15, 1.05],
    /* A spiny orbweaver is a hard, wide plate with horns on the corners, not
       a ball — wider than it is long, which is the whole look. */
    spiny: [1.85, 0.5, 0.85],
  }[abdForm];
  ball(k, ceph, "pedicel-base", { merge: true, r: cx * 0.3, at: [0, cx * 0.06, -cz * 0.62], color: shade(dark, -0.1), subdiv: 0 });
  const pedicel = ball(k, ceph, "pedicel", { r: cx * 0.36, at: [0, cx * 0.06, -cz * 0.72], color: shade(dark, -0.1), subdiv: 0 });
  /* The abdomen hangs off a pedicel a third the width of the cephalothorax.
     `lift` up to half the abdomen's own radius could carry it clear of that
     joint with a visible gap — and the part-level connectivity check still
     passed, because the two boxes still overlapped at a corner. Clamped to
     what the pedicel can actually bridge. */
  const abdLift = clamp(ar * (B.lift + v.f("abdlift", -0.08, 0.16)), -cx * 0.3, cx * 0.32 + ar * shape[1] * 0.28);
  const abd = ball(k, pedicel, "abdomen", {
    rx: ar * shape[0], ry: ar * shape[1], rz: ar * shape[2],
    at: [0, abdLift, -ar * shape[2] * 0.58],
    rot: [v.f("abdpitch", -0.45, 0.35), 0, 0],
    color: col.base, colorFn: col.shellGrad,
  });
  if (spiny) {
    const spikeN = v.i("spiken", 5, 6);
    for (let i = 0; i < spikeN; i += 1) {
      const a = (i / spikeN) * Math.PI * 2 + 0.3;
      cone(k, abd, `spike${i}`, {
        merge: true, r: ar * 0.16, h: ar * v.f("spikel", 0.6, 1.15),
        at: [Math.cos(a) * ar * shape[0] * 0.72, 0, Math.sin(a) * ar * shape[2] * 0.72],
        rotZ: -Math.cos(a) * 1.4, rotX: Math.sin(a) * 1.4,
        color: shade(col.base, -0.45), seg: 6,
      });
    }
    /* The hard dorsal plate, with its ring of pits. */
    ball(k, abd, "carapace", { merge: true,
      rx: ar * shape[0] * 0.86, ry: ar * shape[1] * 0.9, rz: ar * shape[2] * 0.86,
      at: [0, ar * shape[1] * 0.3, 0], color: shade(col.base, 0.22), subdiv: 1,
    });
  }
  const markN = v.i("markn", 0, 6);
  for (let i = 0; i < markN; i += 1) {
    const t = (i + 1) / (markN + 1);
    ball(k, abd, `mark${i}`, { merge: true,
      rx: ar * shape[0] * v.f("markw", 0.16, 0.42), ry: ar * shape[1] * 0.3, rz: ar * shape[2] * 0.14,
      at: [0, ar * shape[1] * 0.78, ar * shape[2] * (0.55 - t * 1.1)],
      color: i % 2 ? paper : shade(col.base, -0.42), subdiv: 0,
    });
  }
  const spinneret = v.i("spin", 0, 2);
  if (spinneret) {
    // merged collar so the abdomen has vertices where the spinnerets leave it
    ball(k, abd, "spin-base", { merge: true,
      rx: ar * 0.34, ry: ar * shape[1] * 0.26, rz: ar * shape[2] * 0.2,
      at: [0, -ar * shape[1] * 0.2, -ar * shape[2] * 0.7], color: shade(col.base, -0.2), subdiv: 0,
    });
  }
  for (let i = 0; i < spinneret; i += 1) {
    spindle(k, abd, `spinneret${i}`, {
      r: ar * 0.1, len: ar * v.f("spinl", 0.2, 0.4),
      at: [(i - (spinneret - 1) / 2) * ar * 0.24, -ar * shape[1] * 0.2, -ar * shape[2] * 0.72],
      rot: [-1.4, 0, 0], root: ar * 0.2, color: shade(col.base, -0.2), seg: 8,
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
  /* A jumping spider is all eyes: two enormous forward-facing anterior
     medians on a blunt face, which is why they read as cute and why nothing
     else looks like one. */
  const eyeN = jumping ? 3 : v.i("eyen", 1, 3);
  const bigR = (jumping ? cx * 0.34 : cx * 0.24) * v.f("eyer", 0.85, 1.25);
  for (let i = 0; i < eyeN; i += 1) {
    const r = bigR * (1 - i * 0.28);
    beadEyes(k, ceph, {
      r, at: [0, cx * ((jumping ? 0.16 : 0.28) - i * 0.16), cz * ((jumping ? 0.86 : 0.72) - i * 0.16)],
      gap: cx * ((jumping ? 0.5 : 0.34) + i * 0.28),
      color: i === 0 ? paper : ink, pupil: i === 0 ? ink : paper,
      pupilR: i === 0 && jumping ? 0.68 : 0.46,
      spark: i === 0, subdiv: i === 0 ? 1 : 0,
      name: `eye${i}`,
    });
  }
  k.idle({ breatheK: v.f("br", 0.035, 0.06), bobAmp: v.f("bob", 0.006, 0.02) });
}

/* ── scorpions ────────────────────────────────────────────────────────────── */

function scorpion(k, col, opt = {}) {
  const v = vary(k);
  const dark = chitinOf(col, true);
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
  let at = [0, by * 0.55, -bz * 0.66];
  ball(k, body, "tail-base", { merge: true, r: by * 0.85, at, color: shade(col.base, -0.06), subdiv: 0 });
  for (let i = 0; i < tailN; i += 1) {
    const r = by * (1.05 - i * (0.5 / tailN));
    /* The metasoma arches UP and forward over the back. Every joint was
       turning the same way as the first, which curled it flat along the
       ground behind the animal and left the sting pointing at nothing. */
    const n = k.cute.node(`tail${i}`, { parent: p, at, rot: [i === 0 ? -1.15 - arch * 0.15 : arch, 0, 0] });
    k.cute.add(n, ballGeo(r, tailLen * 0.62, r, 1), { at: [0, tailLen * 0.34, 0], color: shade(col.base, -i * 0.05) });
    p = n;
    at = [0, tailLen * 0.86, 0];
  }
  const bulb = ball(k, p, "sting-bulb", { rx: by * 0.8, ry: by * 0.95, rz: by * 0.8, at: [0, tailLen * 0.8, 0], color: shade(col.base, 0.12) });
  cone(k, bulb, "sting", { r: by * 0.34, h: v.f("stingl", 0.07, 0.13), at: [0, by * 0.3, 0], rotX: 1.7, color: col.accent ?? APP.red });

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
    /* A pincer is two fingers with DAYLIGHT between them. Two short cones a
       centimetre apart inside the hand read as one lump, which is why the
       scorpion had no claws to speak of. The fixed finger is longer than the
       movable one, and both are half again the length of the hand. */
    const clawZ = v.f("clawz", 0.04, 0.08);
    const clawX = v.f("clawx", 0.03, 0.055);
    for (const t of [1, -1]) {
      cone(k, claw, `pincer${t > 0 ? "a" : "b"}-${s > 0 ? "l" : "r"}`, {
        r: 0.013, h: clawZ * (t > 0 ? 2.0 : 1.5),
        at: [t * clawX * 0.55, 0, clawZ * 0.62],
        rotX: Math.PI / 2, rotZ: t * -0.34, color: shade(col.base, -0.24), seg: 8,
      });
    }
  }
  insectLegs(k, body, {
    at: [0, -by * 0.4, bz * 0.2], gap: bx * 0.55, pair: 4,
    len: v.f("legl", 0.1, 0.18), r: 0.011, spanZ: bz * v.f("legspan", 0.35, 0.6),
    splay: v.f("splay", 1.05, 1.45), bend: v.f("bend", 0.85, 1.35), color: dark, lenMix: v.f("lenmix", -0.25, 0.25), arch: by * 0.35,
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
  const footL = slug ? v.f("footl", 0.34, 0.46) : v.f("footl", 0.26, 0.36);
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
    k.cute.add(stalk, spindleGeo(0.013, stalkL, { seg: 10, bulge: 0.5, tip: 0.85, root: 0.026 }), { color: skin });
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
    const r0 = v.f("shellr", 0.115, 0.155);
    const tight = v.f("tight", 1.5, 2.2);
    const spire = r0 * (cone0 ? v.f("spire", 0.7, 1.2) : v.f("spire", 0.12, 0.42));
    const lean = v.f("lean", -0.3, 0.3);
    const shell = k.cute.node("shell", { parent: k.root, at: [0, footR * 1.05, -footL * 0.3], rot: [lean, 0, 0] });
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
  const dark = chitinOf(col, true);
  const cent = opt.kind === "centipede";
  const house = opt.kind === "house-centipede";
  /* "Many legs" is the whole identity of a millipede, and four to six nubs is
     not many. A diplosegment carries TWO pairs, and there are a lot of them —
     so the segment count goes up, the segment gets shorter, and every one of
     them is double-legged. */
  const mille = !cent && !house;
  const n = mille ? v.i("segn", 11, 16) : v.i("segn", 6, 9);
  const segLen = mille ? v.f("segl", 0.07, 0.1) : v.f("segl", 0.11, 0.16);
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

  const legLen = house ? v.f("legl", 0.16, 0.26) : cent ? v.f("legl", 0.09, 0.15) : v.f("legl", 0.095, 0.14);
  const splay = house ? v.f("splay", 1.5, 1.9) : v.f("splay", 1.32, 1.66);
  /* `col.leg` when a species has legs of its own colour — Rhysida longipes is
     literally the Blueleg Centipede, and painting it one flat tint loses the
     only field mark in its name. */
  const legCol = col.leg ?? dark;
  const pairPerSeg = mille ? 2 : 1;
  for (const [i, node] of seg.entries()) {
    for (let q = 0; q < pairPerSeg; q += 1) {
      for (const s of [1, -1]) {
        spindle(k, node, `leg${i}${q}-${s > 0 ? "l" : "r"}`, {
          merge: pairPerSeg > 1, r: house ? 0.007 : 0.009, len: legLen * (house ? 1 - i * 0.05 : 1),
          at: [s * r0 * 0.5, -r0 * flat * 0.25, segLen * (0.25 - q * 0.5)],
          rot: [v.f("legrake", -0.3, 0.3), 0, s * -splay], color: legCol, seg: 7,
        });
      }
    }
  }
  if (cent || house) {
    for (const s of [1, -1]) {
      spindle(k, seg[seg.length - 1], `cercus-${s > 0 ? "l" : "r"}`, {
        r: 0.008, len: v.f("cercl", 0.06, 0.14), at: [s * r0 * 0.3, 0, -segLen * 0.5],
        rot: [-1.5, 0, s * 0.35], color: legCol, seg: 8,
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
      /* A land planarian's pale dorsal stripe is bone or straw, and it must
         not be literally `paper`: the audit reads paper and ink as FACE
         colours and then measures those parts for thickness, so painting a
         6 mm-thick ribbon `paper` reports four flatworms as thin floating
         faces. Straw off the animal's own colour, which is what it is. */
      at: [t * wide * 1.3, 0.018, 0],
      color: i % 2 ? dark : accentOf(k, col, mix(col.base, hex("#efe3bc"), 0.82)), subdiv: 0,
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
  const dark = chitinOf(col, true);
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
    ball(k, body, `stalk-base-${s > 0 ? "l" : "r"}`, { merge: true, r: by * 0.4, at: [s * bx * 0.22, by * 0.34, bz * 0.44], color: dark, subdiv: 0 });
    const stalk = k.cute.node(`stalk-${s > 0 ? "l" : "r"}`, { parent: body, at: [s * bx * 0.22, by * 0.4, bz * 0.5], rot: null });
    k.cute.add(stalk, spindleGeo(0.013, v.f("stalkl", 0.05, 0.1), { seg: 10, bulge: 0.5, tip: 0.8, root: 0.024 }), { rotZ: s * -0.12, color: dark });
    const eye = ball(k, stalk, `eye-${s > 0 ? "l" : "r"}`, { r: 0.03, at: [0, v.f("stalkl", 0.05, 0.1) * 0.95, 0], color: paper });
    ball(k, eye, `pupil-${s > 0 ? "l" : "r"}`, { r: 0.016, at: [0, 0, 0.022], color: ink, subdiv: 0 });
  }
  k.cute.bob(k.root, { amp: v.f("bob", 0.014, 0.03), dur: v.f("bobd", 1.4, 2.1) });
  k.cute.breathe(k.root, { k: v.f("br", 0.025, 0.045) });
}

/* ── pillbugs ─────────────────────────────────────────────────────────────── */

function pillbug(k, col, opt = {}) {
  const v = vary(k);
  const dark = chitinOf(col, true);
  /* A woodlouse is about twice as long as it is wide. Seven segments at 0.1
     each against a body 0.2 across drew a caterpillar — which is exactly what
     the review saw the pillbug as. */
  const n = v.i("segn", 5, 7);
  const r0 = v.f("r", 0.095, 0.135);
  const segLen = r0 * v.f("segl", 0.42, 0.58);
  const arch = v.f("arch", 0.05, 0.2);
  const seg = [];
  let p = k.root;
  let at = [0, r0 * 0.75, segLen * 0.5];
  for (let i = 0; i < n; i += 1) {
    const t = i / (n - 1);
    const r = r0 * (1 - Math.abs(t - 0.25) * v.f("taper", 0.3, 0.6));
    const node = ball(k, p, `seg${i}`, {
      rx: r, ry: r * v.f("flat", 0.5, 0.72), rz: segLen * 0.72,
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
  /* Oligochaetes have no eyes at all. Giving a sludge worm two and a smile is
     a factual error the review caught on Tubifex specifically. */
  const blind = /^(tubifex|eisenia|lumbricus|pheretima|amynthas|perionyx|polypheretima|metaphire|dichogaster|pontoscolex)-/.test(who(k));
  if (blind) {
    // the prostomium: the fleshy lobe over the mouth, which is all it has
    ball(k, head, "prostomium", {
      rx: headR * 0.6, ry: headR * 0.5, rz: headR * 0.5,
      at: [0, headR * 0.1, headR * 0.9], color: shade(col.base, 0.26),
    });
  } else {
    beadEyes(k, head, { r: headR * v.f("eyer", 0.3, 0.46), at: [0, headR * 0.2, headR * 0.5], gap: headR * 0.5, color: paper, pupil: ink, spark: true });
    /* Same zero-thickness `k.arc` ribbon the frogs shipped as a black slab. */
    ball(k, head, "mouth", { merge: true,
      rx: headR * 0.5, ry: headR * 0.12, rz: headR * 0.28,
      at: [0, -headR * 0.18, headR * 0.8], color: ink, subdiv: 0,
    });
  }
  k.idle({ breatheK: v.f("br", 0.03, 0.05), bobAmp: 0 });
}

export const fauna = {
  bird, mammal, frog, lizard, snake, fish, lepidoptera, odonata, hymenoptera,
  coleoptera, orthoptera, hemiptera, diptera, mantis, blattodea, dermaptera,
  phasmatodea, insectGeneric, spider, scorpion, snail, myriapod, flatworm,
  crab, pillbug, worm,
};
