// build-eagle-glb.mjs — Agila, the buddy, as four low-poly 3D models.
//
//   node script/art/build-eagle-glb.mjs   -> public/model/agila-{egg,hatchling,eaglet,eagle}.glb
//
// Built from primitives by code, like `script/magi-asset/build-vector.mjs`: no
// modelling tool, no generator artefacts, deterministic output. The palette is
// the vector set's (`src/art/palette.ts`), so the 3D walker and the 2D stickers
// are one character. Each model carries one looping animation that
// `<model-viewer>` plays: the egg rocks, the hatchling and eaglet bob, the
// eagle flaps. Faces +Z (towards the default camera), feet at y = 0.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, "../../public/model");
mkdirSync(out, { recursive: true });

/* ── colour ─────────────────────────────────────────────────────────────── */

const hex = {
  ink: "#0E3B2A",
  cream: "#FFF6DC",
  path: "#F3E3B5",
  white: "#FFFFFF",
  down: "#C9D2DB",
  eagle: "#3463B5",
  eagle_deep: "#24478A",
  eagle_light: "#5B86D6",
  gold: "#F5B82E",
  gold_deep: "#C98A12",
  blush: "#F58A6E",
  wood: "#A8582C",
  wood_dark: "#6B3519",
  leaf: "#7CC84A",
  green: "#3E9A4A",
  forest: "#114B2F",
  skin: "#E7B58C",
  hair: "#3B2A20",
  pants: "#2B3A55",
  sole: "#F3E3B5",
};

/** glTF base colours are linear; the palette is sRGB. */
function linear(h) {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  return c.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
}

/* ── geometry ───────────────────────────────────────────────────────────── */

/** Unit UV sphere, optionally only the band between two latitudes (0 = top, 1 = bottom). */
function sphere(seg = 14, ring = 10, from = 0, to = 1) {
  const pos = [];
  const nor = [];
  const idx = [];
  for (let r = 0; r <= ring; r++) {
    const v = from + (to - from) * (r / ring);
    const phi = v * Math.PI;
    for (let s = 0; s <= seg; s++) {
      const th = (s / seg) * Math.PI * 2;
      const x = Math.sin(phi) * Math.sin(th);
      const y = Math.cos(phi);
      const z = Math.sin(phi) * Math.cos(th);
      pos.push(x, y, z);
      nor.push(x, y, z);
    }
  }
  for (let r = 0; r < ring; r++) {
    for (let s = 0; s < seg; s++) {
      const a = r * (seg + 1) + s;
      const b = a + seg + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { pos, nor, idx };
}

/** Cone along +Y, base radius 1 at y = 0, apex at y = 1. */
function cone(seg = 10) {
  const pos = [];
  const nor = [];
  const idx = [];
  const k = 1 / Math.SQRT2;
  for (let s = 0; s <= seg; s++) {
    const th = (s / seg) * Math.PI * 2;
    const x = Math.sin(th);
    const z = Math.cos(th);
    pos.push(x, 0, z, 0, 1, 0);
    nor.push(x * k, k, z * k, x * k, k, z * k);
  }
  for (let s = 0; s < seg; s++) idx.push(s * 2, s * 2 + 2, s * 2 + 1);
  const c = pos.length / 3;
  pos.push(0, 0, 0);
  nor.push(0, -1, 0);
  for (let s = 0; s <= seg; s++) {
    const th = (s / seg) * Math.PI * 2;
    pos.push(Math.sin(th), 0, Math.cos(th));
    nor.push(0, -1, 0);
  }
  for (let s = 0; s < seg; s++) idx.push(c, c + 2 + s, c + 1 + s);
  return { pos, nor, idx };
}

/** Torus in the XZ plane — the nest rim. */
function torus(R = 1, r = 0.3, seg = 18, ring = 8) {
  const pos = [];
  const nor = [];
  const idx = [];
  for (let i = 0; i <= seg; i++) {
    const u = (i / seg) * Math.PI * 2;
    for (let j = 0; j <= ring; j++) {
      const v = (j / ring) * Math.PI * 2;
      const nx = Math.cos(v) * Math.sin(u);
      const ny = Math.sin(v);
      const nz = Math.cos(v) * Math.cos(u);
      pos.push((R + r * Math.cos(v)) * Math.sin(u), r * Math.sin(v), (R + r * Math.cos(v)) * Math.cos(u));
      nor.push(nx, ny, nz);
    }
  }
  for (let i = 0; i < seg; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * (ring + 1) + j;
      const b = a + ring + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return { pos, nor, idx };
}

/* ── scene graph ────────────────────────────────────────────────────────── */

const SPHERE = sphere();
const HEMI_LOW = sphere(14, 6, 0.5, 1);
const CONE = cone();
const NEST = torus(1, 0.34);

function part(mesh, color, t = [0, 0, 0], s = [1, 1, 1], r = [0, 0, 0], children = []) {
  return { mesh, color, t, s, r, children };
}
function group(t, children, name, r = [0, 0, 0]) {
  return { t, s: [1, 1, 1], r, children, name };
}

/** Euler degrees (XYZ) → quaternion. */
function quat([x, y, z]) {
  const [a, b, c] = [x, y, z].map((d) => (d * Math.PI) / 360);
  const [ca, sa, cb, sb, cc, sc] = [Math.cos(a), Math.sin(a), Math.cos(b), Math.sin(b), Math.cos(c), Math.sin(c)];
  return [
    sa * cb * cc + ca * sb * sc,
    ca * sb * cc - sa * cb * sc,
    ca * cb * sc + sa * sb * cc,
    ca * cb * cc - sa * sb * sc,
  ];
}

/* Shared parts. */

function eye(x, y, z, r = 0.07) {
  return part(SPHERE, "ink", [x, y, z], [r, r * 1.15, r * 0.7], [0, 0, 0], [
    part(SPHERE, "white", [0.35, 0.4, 0.75], [0.32, 0.32, 0.32]),
  ]);
}
function cheek(x, y, z) {
  return part(SPHERE, "blush", [x, y, z], [0.055, 0.04, 0.02]);
}
/** A hooked beak pointing +Z. */
function beak(y, z, k = 1) {
  return group([0, y, z], [
    part(CONE, "gold", [0, 0, 0], [0.09 * k, 0.2 * k, 0.07 * k], [80, 0, 0]),
    part(CONE, "gold_deep", [0, -0.04 * k, 0.16 * k], [0.035 * k, 0.07 * k, 0.03 * k], [180, 0, 0]),
  ]);
}
/** The crest: soft spikes swept back and up off the top of the head. */
function crest(y, z, k = 1) {
  const spike = [
    [-0.13, 0, -40, 0, 25],
    [0, 0.03, -35, 0, 0],
    [0.13, 0, -40, 0, -25],
    [-0.07, -0.05, -70, 0, 15],
    [0.07, -0.05, -70, 0, -15],
  ];
  return group(
    [0, y, z],
    spike.map(([x, dz, rx, ry, rz]) => part(CONE, "cream", [x * k, 0, dz * k], [0.07 * k, 0.26 * k, 0.07 * k], [rx, ry, rz])),
  );
}
function nest() {
  return group([0, 0, 0], [
    part(NEST, "wood_dark", [0, 0.08, 0], [0.44, 0.34, 0.44]),
    part(SPHERE, "wood", [0, 0.04, 0], [0.42, 0.06, 0.42]),
    part(SPHERE, "leaf", [0.46, 0.14, 0.16], [0.13, 0.025, 0.055], [0, 30, 20]),
    part(SPHERE, "leaf", [-0.42, 0.12, -0.2], [0.11, 0.025, 0.05], [0, -40, -15]),
  ]);
}

/* ── the four stages ────────────────────────────────────────────────────── */

function egg() {
  const body = group(
    [0, 0.02, 0],
    [
      part(SPHERE, "cream", [0, 0.46, 0], [0.34, 0.46, 0.34]),
      ...[
        [0.2, 0.7, 0.22],
        [-0.26, 0.5, 0.16],
        [0.1, 0.3, 0.32],
        [-0.12, 0.8, 0.18],
        [0.3, 0.45, -0.12],
      ].map(([x, y, z]) => part(SPHERE, "eagle_light", [x, y, z], [0.04, 0.04, 0.04])),
      /* A crest feather poking through the shell. */
      part(CONE, "eagle", [0, 0.9, 0.02], [0.05, 0.18, 0.04], [-12, 0, 0]),
      /* Asleep: closed eyes as flat dark arcs, cheeks. */
      part(SPHERE, "ink", [-0.11, 0.52, 0.335], [0.06, 0.012, 0.02]),
      part(SPHERE, "ink", [0.11, 0.52, 0.335], [0.06, 0.012, 0.02]),
      cheek(-0.2, 0.44, 0.3),
      cheek(0.2, 0.44, 0.3),
    ],
    "rock",
  );
  return {
    node: group([0, 0, 0], [nest(), body]),
    clip: { name: "rock", target: "rock", path: "rotation", time: [0, 1.6, 1.8, 2, 2.2, 2.4, 3.2], value: [[0, 0, 0], [0, 0, 0], [0, 0, 9], [0, 0, -7], [0, 0, 4], [0, 0, 0], [0, 0, 0]] },
  };
}

function hatchling() {
  const chick = group(
    [0, 0.2, 0],
    [
      part(SPHERE, "white", [0, 0.44, 0], [0.34, 0.33, 0.32]),
      part(SPHERE, "down", [-0.33, 0.42, 0], [0.1, 0.16, 0.12], [0, 0, 30]),
      part(SPHERE, "down", [0.33, 0.42, 0], [0.1, 0.16, 0.12], [0, 0, -30]),
      eye(-0.12, 0.5, 0.27),
      eye(0.12, 0.5, 0.27),
      cheek(-0.21, 0.4, 0.25),
      cheek(0.21, 0.4, 0.25),
      beak(0.42, 0.29, 0.7),
      /* The top of the shell, worn as a hat. */
      part(HEMI_LOW, "cream", [0.02, 0.72, 0], [0.19, -0.14, 0.19], [0, 0, -12]),
    ],
    "bob",
  );
  return {
    node: group([0, 0, 0], [
      nest(),
      chick,
      part(HEMI_LOW, "cream", [0, 0.46, 0], [0.38, 0.34, 0.38]),
    ]),
    clip: { name: "bob", target: "bob", path: "translation", time: [0, 0.5, 1], value: [[0, 0.2, 0], [0, 0.26, 0], [0, 0.2, 0]] },
  };
}

/** Eaglet and eagle share a body; the eagle is longer, with open wings. */
function bird({ adult, open = adult, asleep = false }) {
  const k = adult ? 1 : 0.92;
  const wing = (side) => {
    const sx = side === "l" ? -1 : 1;
    const spread = open
      ? [
          part(SPHERE, "eagle", [sx * 0.34, 0, 0], [0.4, 0.1, 0.26]),
          part(SPHERE, "eagle_light", [sx * 0.24, 0.06, 0.05], [0.26, 0.06, 0.16]),
          ...[0, 1, 2].map((i) =>
            part(SPHERE, "eagle_deep", [sx * (0.66 + i * 0.02), -0.01, -0.1 + i * 0.1], [0.18, 0.06, 0.07], [0, sx * (20 - i * 20), 0]),
          ),
        ]
      : [part(SPHERE, "eagle_deep", [sx * 0.04, -0.12, -0.02], [0.08, 0.26, 0.17], [0, 0, sx * 8])];
    return group([sx * 0.24 * k, (open ? 0.72 : 0.62) * k, 0], spread, `wing_${side}`);
  };
  const legs = open
    ? [part(SPHERE, "gold_deep", [-0.07, 0.3, 0.05], [0.04, 0.06, 0.05]), part(SPHERE, "gold_deep", [0.07, 0.3, 0.05], [0.04, 0.06, 0.05])]
    : [-1, 1].flatMap((sx) => [
        part(SPHERE, "gold", [sx * 0.1, 0.1, 0], [0.035, 0.12, 0.035]),
        part(SPHERE, "gold_deep", [sx * 0.1, 0.02, 0.06], [0.07, 0.025, 0.1]),
      ]);
  const body = group(
    [0, open ? 0.12 : 0, 0],
    [
      part(SPHERE, "eagle", [0, 0.56 * k, 0], [0.3 * k, 0.36 * k, 0.26 * k], [adult ? 12 : 0, 0, 0]),
      part(SPHERE, "eagle_light", [0, 0.52 * k, 0.12 * k], [0.19 * k, 0.26 * k, 0.16 * k], [adult ? 12 : 0, 0, 0]),
      part(CONE, "eagle_deep", [0, 0.3 * k, -0.18 * k], [0.14, 0.26, 0.05], [-150, 0, 0]),
      part(SPHERE, "cream", [0, 0.98 * k, 0.03], [0.24 * k, 0.23 * k, 0.23 * k]),
      crest(1.1 * k, -0.08, k),
      ...(asleep
        ? [
            part(SPHERE, "ink", [-0.09 * k, 0.99 * k, 0.215 * k], [0.055, 0.012, 0.015]),
            part(SPHERE, "ink", [0.09 * k, 0.99 * k, 0.215 * k], [0.055, 0.012, 0.015]),
          ]
        : [eye(-0.09 * k, 1.0 * k, 0.2 * k), eye(0.09 * k, 1.0 * k, 0.2 * k)]),
      /* Brows: short flat ink bars angled in — determined, not angry. */
      part(SPHERE, "ink", [-0.09 * k, 1.08 * k, 0.215 * k], [0.06, 0.012, 0.015], [0, 0, -14]),
      part(SPHERE, "ink", [0.09 * k, 1.08 * k, 0.215 * k], [0.06, 0.012, 0.015], [0, 0, 14]),
      cheek(-0.16 * k, 0.93 * k, 0.18 * k),
      cheek(0.16 * k, 0.93 * k, 0.18 * k),
      beak(0.94 * k, 0.21 * k, k),
      ...legs,
      wing("l"),
      wing("r"),
    ],
    "body",
  );
  const clip = asleep
    ? [{ name: "sleep", target: "body", path: "scale", time: [0, 1.4, 2.8], value: [[1, 1, 1], [1.03, 0.97, 1.03], [1, 1, 1]] }]
    : open
    ? [
        { name: "fly", target: "wing_l", path: "rotation", time: [0, 0.3, 0.6], value: [[0, 0, -22], [0, 0, 26], [0, 0, -22]] },
        { name: "fly", target: "wing_r", path: "rotation", time: [0, 0.3, 0.6], value: [[0, 0, 22], [0, 0, -26], [0, 0, 22]] },
        { name: "fly", target: "body", path: "translation", time: [0, 0.3, 0.6], value: [[0, 0.16, 0], [0, 0.1, 0], [0, 0.16, 0]] },
      ]
    : [
        { name: "hop", target: "body", path: "translation", time: [0, 0.35, 0.7], value: [[0, 0, 0], [0, 0.05, 0], [0, 0, 0]] },
        { name: "hop", target: "wing_l", path: "rotation", time: [0, 0.35, 0.7], value: [[0, 0, 0], [0, 0, -8], [0, 0, 0]] },
        { name: "hop", target: "wing_r", path: "rotation", time: [0, 0.35, 0.7], value: [[0, 0, 0], [0, 0, 8], [0, 0, 0]] },
      ];
  /* A soft ground disc under the flyer, so it reads as off the ground. */
  const extra = [];
  return { node: group([0, 0, 0], [...extra, body]), clip };
}

/* ── the trainer ────────────────────────────────────────────────────────── */

/**
 * You, on the map — a chibi student trainer in an Ateneo-blue shirt with a
 * green field cap and backpack. Two clips: `idle` (a breath) and `walk`
 * (legs and arms swing opposite, the body bobs twice a stride).
 */
function trainer() {
  const leg = (sx) =>
    group([sx * 0.08, 0.36, 0], [
      part(SPHERE, "pants", [0, -0.14, 0], [0.075, 0.17, 0.08]),
      part(SPHERE, "sole", [0, -0.31, 0.04], [0.08, 0.05, 0.12]),
    ], `leg_${sx < 0 ? "l" : "r"}`);
  const arm = (sx) =>
    group([sx * 0.2, 0.66, 0], [
      part(SPHERE, "eagle", [0, -0.04, 0], [0.07, 0.08, 0.07]),
      part(SPHERE, "skin", [sx * 0.01, -0.17, 0], [0.05, 0.12, 0.05]),
    ], `arm_${sx < 0 ? "l" : "r"}`, [0, 0, sx * 8]);
  const body = group([0, 0, 0], [
    part(SPHERE, "eagle", [0, 0.58, 0], [0.17, 0.2, 0.13]),
    part(SPHERE, "gold", [0, 0.64, 0.12], [0.035, 0.035, 0.015]),
    part(SPHERE, "green", [0, 0.6, -0.14], [0.13, 0.16, 0.08]),
    part(SPHERE, "forest", [0, 0.53, -0.2], [0.09, 0.06, 0.03]),
    arm(-1),
    arm(1),
    /* Head: big, chibi. */
    part(SPHERE, "skin", [0, 0.94, 0], [0.2, 0.19, 0.18]),
    part(SPHERE, "hair", [0, 0.97, -0.03], [0.205, 0.17, 0.18]),
    part(SPHERE, "skin", [0, 0.92, 0.04], [0.19, 0.16, 0.15]),
    eye(-0.07, 0.94, 0.165, 0.035),
    eye(0.07, 0.94, 0.165, 0.035),
    cheek(-0.12, 0.89, 0.14),
    cheek(0.12, 0.89, 0.14),
    part(SPHERE, "ink", [0, 0.87, 0.175], [0.03, 0.008, 0.01]),
    /* Field cap and brim. */
    part(HEMI_LOW, "green", [0, 1.05, -0.01], [0.21, -0.14, 0.2]),
    part(SPHERE, "forest", [0, 1.04, 0.19], [0.16, 0.02, 0.1], [-8, 0, 0]),
    part(SPHERE, "leaf", [0.06, 1.17, 0.02], [0.05, 0.012, 0.03], [0, 30, 10]),
  ], "torso");
  return {
    node: group([0, 0, 0], [leg(-1), leg(1), body]),
    clip: [
      { name: "idle", target: "torso", path: "translation", time: [0, 1.2, 2.4], value: [[0, 0, 0], [0, 0.012, 0], [0, 0, 0]] },
      { name: "walk", target: "leg_l", path: "rotation", time: [0, 0.25, 0.5], value: [[28, 0, 0], [-28, 0, 0], [28, 0, 0]] },
      { name: "walk", target: "leg_r", path: "rotation", time: [0, 0.25, 0.5], value: [[-28, 0, 0], [28, 0, 0], [-28, 0, 0]] },
      { name: "walk", target: "arm_l", path: "rotation", time: [0, 0.25, 0.5], value: [[-30, 0, -8], [30, 0, -8], [-30, 0, -8]] },
      { name: "walk", target: "arm_r", path: "rotation", time: [0, 0.25, 0.5], value: [[30, 0, 8], [-30, 0, 8], [30, 0, 8]] },
      { name: "walk", target: "torso", path: "translation", time: [0, 0.125, 0.25, 0.375, 0.5], value: [[0, 0, 0], [0, 0.03, 0], [0, 0, 0], [0, 0.03, 0], [0, 0, 0]] },
    ],
  };
}

/* ── glTF writer ────────────────────────────────────────────────────────── */

function build(model) {
  const gltf = {
    asset: { version: "2.0", generator: "yclap build-eagle-glb" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [],
    meshes: [],
    materials: [],
    accessors: [],
    bufferViews: [],
    buffers: [],
  };
  const chunk = [];
  let offset = 0;
  const push = (typed, target) => {
    const bytes = Buffer.from(typed.buffer, typed.byteOffset, typed.byteLength);
    const pad = (4 - (bytes.length % 4)) % 4;
    gltf.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...(target ? { target } : {}) });
    chunk.push(bytes, Buffer.alloc(pad));
    offset += bytes.length + pad;
    return gltf.bufferViews.length - 1;
  };
  const accessor = (data, type, component, count, extra = {}) => {
    gltf.accessors.push({ bufferView: data, componentType: component, count, type, ...extra });
    return gltf.accessors.length - 1;
  };

  const material_of = new Map();
  const material = (name) => {
    if (!material_of.has(name)) {
      gltf.materials.push({
        name,
        pbrMetallicRoughness: { baseColorFactor: [...linear(hex[name]), 1], metallicFactor: 0, roughnessFactor: 0.78 },
        doubleSided: true,
      });
      material_of.set(name, gltf.materials.length - 1);
    }
    return material_of.get(name);
  };
  const geometry_of = new Map();
  const geometry = (g) => {
    if (!geometry_of.has(g)) {
      const pos = new Float32Array(g.pos);
      const min = [0, 1, 2].map((a) => Math.min(...g.pos.filter((_, i) => i % 3 === a)));
      const max = [0, 1, 2].map((a) => Math.max(...g.pos.filter((_, i) => i % 3 === a)));
      geometry_of.set(g, {
        POSITION: accessor(push(pos, 34962), "VEC3", 5126, pos.length / 3, { min, max }),
        NORMAL: accessor(push(new Float32Array(g.nor), 34962), "VEC3", 5126, g.nor.length / 3),
        indices: accessor(push(new Uint16Array(g.idx), 34963), "SCALAR", 5123, g.idx.length),
      });
    }
    return geometry_of.get(g);
  };
  const mesh_of = new Map();
  const mesh = (g, color) => {
    const key = `${[...geometry_of.keys()].indexOf(g)}:${color}:${g.pos.length}`;
    const geo = geometry(g);
    const k = `${geo.POSITION}:${color}`;
    if (!mesh_of.has(k)) {
      gltf.meshes.push({ primitives: [{ attributes: { POSITION: geo.POSITION, NORMAL: geo.NORMAL }, indices: geo.indices, material: material(color) }] });
      mesh_of.set(k, gltf.meshes.length - 1);
    }
    void key;
    return mesh_of.get(k);
  };

  const node_named = new Map();
  const add = (n) => {
    const index = gltf.nodes.length;
    const node = { translation: n.t, scale: n.s, rotation: quat(n.r) };
    gltf.nodes.push(node);
    if (n.name) {
      node.name = n.name;
      node_named.set(n.name, index);
    }
    if (n.mesh) node.mesh = mesh(n.mesh, n.color);
    const kids = (n.children ?? []).map(add);
    if (kids.length) node.children = kids;
    return index;
  };
  add(model.node);

  const clips = Array.isArray(model.clip) ? model.clip : [model.clip];
  gltf.animations = [];
  const by_name = new Map();
  for (const c of clips) {
    if (!by_name.has(c.name)) {
      const anim = { name: c.name, samplers: [], channels: [] };
      by_name.set(c.name, anim);
      gltf.animations.push(anim);
    }
    const { samplers, channels } = by_name.get(c.name);
    const time = new Float32Array(c.time);
    const input = accessor(push(time), "SCALAR", 5126, time.length, { min: [c.time[0]], max: [c.time[c.time.length - 1]] });
    const flat = c.path === "rotation" ? c.value.flatMap(quat) : c.value.flat();
    const output = accessor(push(new Float32Array(flat)), c.path === "rotation" ? "VEC4" : "VEC3", 5126, c.value.length);
    samplers.push({ input, output, interpolation: "LINEAR" });
    channels.push({ sampler: samplers.length - 1, target: { node: node_named.get(c.target), path: c.path } });
  }

  const bin = Buffer.concat(chunk);
  gltf.buffers.push({ byteLength: bin.length });
  let json = Buffer.from(JSON.stringify(gltf));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(json.length, 0);
  jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(bin.length, 0);
  bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jh, json, bh, bin]);
}

const stage = {
  egg: egg(),
  hatchling: hatchling(),
  eaglet: bird({ adult: false }),
  eagle: bird({ adult: true }),
    trainer: trainer(),
};
for (const [name, model] of Object.entries(stage)) {
  const glb = build(model);
  writeFileSync(path.join(out, `agila-${name}.glb`), glb);
  console.log(`agila-${name}.glb  ${glb.length} B`);
}
