// build-eagle-glb.mjs — Agila, the buddy, as four low-poly 3D models.
//
//   node script/art/build-eagle-glb.mjs   -> public/model/agila-{egg,hatchling,eaglet,eagle}.glb
//
// Built from primitives by code, like `script/magi-asset/build-vector.mjs`: no
// modelling tool, no generator artefacts, deterministic output. The palette is
// the vector set's (`src/art/palette.ts`), so the 3D walker and the 2D stickers
// are one character. Each model carries named looping clips that
// `<model-viewer>` plays by name — every pet stage carries idle / walk /
// sleep / happy, the trainer idle / walk / cheer — and every accessory the
// app can put on them (`src/wear.ts`), hidden until worn. Faces +Z (towards
// the default camera), feet at y = 0.

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
    /* Seated on the cone's tip rather than in front of it (0.16 floated free at the chick's size). */
    part(CONE, "gold_deep", [0, -0.04 * k, 0.12 * k], [0.04 * k, 0.07 * k, 0.035 * k], [180, 0, 0]),
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

/* ── accessories ────────────────────────────────────────────────────────── */

/**
 * Every accessory is built INTO the model, on the body part it belongs to, in
 * a material of its own named `acc_<id>_<n>`. The app shows the ones a player
 * wears and makes the rest invisible (`character-model.tsx`, `wear.ts`), so a
 * leaf pin rides the cap through every clip and a scarf turns with the torso —
 * no second model, no sticker floating over a 3D figure. Ids are the ones in
 * `src/wear.ts`; `test/wear.test.ts` holds the two lists together.
 */
function acc(id, n, color) {
  const key = `acc_${id}_${n}`;
  hex[key] = color;
  return key;
}
const leafPart = (color, t, s, r) => part(SPHERE, color, t, s, r);

/* ── the trainer ────────────────────────────────────────────────────────── */

/**
 * You, on the map — a chibi student trainer in an Ateneo-blue shirt with a
 * green field cap and backpack. Clips:
 *   idle  (4.8 s) — a breath, a look left and right, a blink, arms easing;
 *   walk  (0.5 s) — legs and arms swing opposite, the body bobs twice a
 *                   stride, the head nods and the torso twists a little;
 *   cheer (1.2 s) — both arms up and a hop, for a find or a level.
 * The head is its own group on a neck pivot, so it can look around.
 */
function trainer() {
  const leg = (sx) =>
    group([sx * 0.08, 0.36, 0], [
      /* Up inside the torso, not butting its hem: the walk bobs the torso
         0.03 and a hip that only touched at rest opened into a gap — the
         disconnected legs Gelo saw (09-30, 1:35). */
      part(SPHERE, "pants", [0, -0.1, 0], [0.08, 0.21, 0.08]),
      part(SPHERE, "sole", [0, -0.29, 0.04], [0.08, 0.05, 0.12]),
    ], `leg_${sx < 0 ? "l" : "r"}`);
  const arm = (sx) =>
    group([sx * 0.2, 0.66, 0], [
      part(SPHERE, "eagle", [0, -0.04, 0], [0.07, 0.08, 0.07]),
      part(SPHERE, "skin", [sx * 0.01, -0.17, 0], [0.05, 0.12, 0.05]),
    ], `arm_${sx < 0 ? "l" : "r"}`, [0, 0, sx * 8]);

  /* Head, on a neck pivot at y 0.78; positions below are relative to it. */
  const H = 0.78;
  const h = (x, y, z) => [x, y - H, z];
  const sampaguita = (id, petal, centre) =>
    group(h(-0.17, 1.08, 0.08), [
      ...[0, 72, 144, 216, 288].map((a) =>
        part(SPHERE, petal, [0.026 * Math.sin((a * Math.PI) / 180), 0.026 * Math.cos((a * Math.PI) / 180), 0], [0.024, 0.024, 0.012]),
      ),
      part(SPHERE, centre, [0, 0, 0.006], [0.014, 0.014, 0.01]),
    ], undefined, [0, -50, 0]);
  const head = group([0, H, 0], [
    /* The neck: hidden inside head and torso, it is what joins them. */
    part(SPHERE, "skin", h(0, 0.79, 0), [0.07, 0.06, 0.07]),
    part(SPHERE, "skin", h(0, 0.94, 0), [0.2, 0.19, 0.18]),
    part(SPHERE, "hair", h(0, 0.97, -0.03), [0.205, 0.17, 0.18]),
    part(SPHERE, "skin", h(0, 0.92, 0.04), [0.19, 0.16, 0.15]),
    group(h(0, 0.94, 0.165), [eye(-0.07, 0, 0, 0.035), eye(0.07, 0, 0, 0.035)], "eyes"),
    cheek(...h(-0.12, 0.89, 0.14)),
    cheek(...h(0.12, 0.89, 0.14)),
    part(SPHERE, "ink", h(0, 0.87, 0.175), [0.03, 0.008, 0.01]),
    /* Field cap and brim. */
    part(HEMI_LOW, "green", h(0, 1.05, -0.01), [0.21, -0.14, 0.2]),
    part(SPHERE, "forest", h(0, 1.04, 0.19), [0.16, 0.02, 0.1], [-8, 0, 0]),
    part(SPHERE, "leaf", h(0.06, 1.17, 0.02), [0.05, 0.012, 0.03], [0, 30, 10]),

    /* cap_pin — on the cap's left side. */
    leafPart(acc("charm-narra-leaf", 0, "#5B8C3E"), h(-0.16, 1.1, 0.09), [0.06, 0.016, 0.035], [0, -40, 30]),
    leafPart(acc("charm-narra-leaf", 1, "#2E5E22"), h(-0.16, 1.1, 0.095), [0.045, 0.006, 0.006], [0, -40, 30]),
    sampaguita("charm-sampaguita", acc("charm-sampaguita", 0, "#F7F3E6"), acc("charm-sampaguita", 1, "#F5B82E")),
    /* ear — tucked behind the right ear, sweeping back. */
    part(SPHERE, acc("charm-eagle-feather", 0, "#2F5D8A"), h(0.19, 1.02, -0.06), [0.025, 0.12, 0.012], [-35, 0, -20]),
    part(SPHERE, acc("charm-eagle-feather", 1, "#FFFFFF"), h(0.21, 1.1, -0.1), [0.02, 0.05, 0.01], [-35, 0, -20]),
    part(SPHERE, acc("charm-kingfisher", 0, "#1F8FA3"), h(0.19, 1.03, -0.06), [0.028, 0.13, 0.012], [-30, 0, -24]),
    part(SPHERE, acc("charm-kingfisher", 1, "#E8772E"), h(0.2, 0.95, -0.03), [0.022, 0.04, 0.01], [-30, 0, -24]),
    /* hat — the salakot, a wide woven cone over the cap. */
    part(CONE, acc("shop-salakot", 0, "#C9A25E"), h(0, 1.06, 0), [0.36, 0.2, 0.36]),
    part(NEST, acc("shop-salakot", 1, "#8C6A35"), h(0, 1.065, 0), [0.35, 0.05, 0.35]),
    part(SPHERE, acc("shop-salakot", 2, "#8C6A35"), h(0, 1.27, 0), [0.03, 0.03, 0.03]),
    /* face — round field glasses. */
    part(NEST, acc("shop-glasses", 0, "#1B2E16"), h(-0.07, 0.94, 0.185), [0.045, 0.045, 0.045], [90, 0, 0]),
    part(NEST, acc("shop-glasses", 1, "#1B2E16"), h(0.07, 0.94, 0.185), [0.045, 0.045, 0.045], [90, 0, 0]),
    part(SPHERE, acc("shop-glasses", 2, "#1B2E16"), h(0, 0.95, 0.19), [0.03, 0.006, 0.006]),
  ], "head");

  const body = group([0, 0, 0], [
    part(SPHERE, "eagle", [0, 0.58, 0], [0.17, 0.2, 0.13]),
    part(SPHERE, "gold", [0, 0.64, 0.12], [0.035, 0.035, 0.015]),
    part(SPHERE, "green", [0, 0.6, -0.14], [0.13, 0.16, 0.08]),
    part(SPHERE, "forest", [0, 0.53, -0.2], [0.09, 0.06, 0.03]),
    arm(-1),
    arm(1),
    head,
    /* chest — a gumamela badge, or a dew-drop pendant. */
    part(SPHERE, acc("charm-gumamela", 0, "#D2453D"), [-0.08, 0.66, 0.125], [0.04, 0.04, 0.015]),
    part(SPHERE, acc("charm-gumamela", 1, "#F5B82E"), [-0.08, 0.66, 0.14], [0.012, 0.012, 0.008]),
    part(SPHERE, acc("charm-morning-dew", 0, "#6FB7C9"), [0, 0.6, 0.135], [0.03, 0.04, 0.02]),
    part(SPHERE, acc("charm-morning-dew", 1, "#E9F6FA"), [0, 0.7, 0.12], [0.005, 0.06, 0.005], [-10, 0, 0]),
    /* neck — the Ateneo scarf: a ring at the collar and a tail down the front. */
    part(NEST, acc("shop-scarf", 0, "#24478A"), [0, 0.76, 0], [0.13, 0.12, 0.12]),
    part(SPHERE, acc("shop-scarf", 1, "#FFFFFF"), [0.06, 0.66, 0.12], [0.035, 0.09, 0.02], [0, 0, 8]),
    /* strap — binoculars on a strap, against the shirt. */
    part(SPHERE, acc("shop-binocular", 0, "#1B2E16"), [-0.035, 0.52, 0.13], [0.028, 0.045, 0.028]),
    part(SPHERE, acc("shop-binocular", 1, "#1B2E16"), [0.035, 0.52, 0.13], [0.028, 0.045, 0.028]),
    part(SPHERE, acc("shop-binocular", 2, "#5A4632"), [0, 0.66, 0.11], [0.12, 0.01, 0.01], [0, 0, 62]),
    /* back — an acacia pod hanging off the backpack. */
    part(SPHERE, acc("charm-acacia-pod", 0, "#8A5A33"), [0.09, 0.5, -0.2], [0.02, 0.07, 0.015], [0, 0, 12]),
    part(SPHERE, acc("charm-acacia-pod", 1, "#5A3A1F"), [0.08, 0.58, -0.2], [0.005, 0.03, 0.005]),
    /* float — a firefly over the right shoulder, on its own clip channel. */
    group([0.24, 0.94, -0.04], [part(SPHERE, acc("charm-firefly", 0, "#FFE27A"), [0, 0, 0], [0.03, 0.03, 0.03]), part(SPHERE, acc("charm-firefly", 1, "#F6B22D"), [0, 0, -0.02], [0.018, 0.018, 0.018])], "float_firefly"),
  ], "torso");

  /* The firefly drifts in every clip, so it never freezes when you stop. */
  const firefly = (name, span) => ({
    name,
    target: "float_firefly",
    path: "translation",
    time: [0, span / 2, span],
    value: [[0.24, 0.94, -0.04], [0.26, 0.99, -0.02], [0.24, 0.94, -0.04]],
  });
  return {
    /* "figure" is the whole trainer: the cheer hops it, legs and all. */
    node: group([0, 0, 0], [group([0, 0, 0], [leg(-1), leg(1), body], "figure")]),
    clip: [
      /* idle, 4.8 s */
      { name: "idle", target: "torso", path: "translation", time: [0, 1.2, 2.4, 3.6, 4.8], value: [[0, 0, 0], [0, 0.012, 0], [0, 0, 0], [0, 0.012, 0], [0, 0, 0]] },
      { name: "idle", target: "head", path: "rotation", time: [0, 0.8, 1.6, 2.4, 3.2, 4, 4.8], value: [[0, 0, 0], [0, 0, 0], [0, 22, 0], [0, 22, 0], [0, -16, 0], [0, -4, 2], [0, 0, 0]] },
      { name: "idle", target: "eyes", path: "scale", time: [0, 3.0, 3.08, 3.16, 4.8], value: [[1, 1, 1], [1, 1, 1], [1, 0.12, 1], [1, 1, 1], [1, 1, 1]] },
      { name: "idle", target: "arm_l", path: "rotation", time: [0, 2.4, 4.8], value: [[0, 0, -8], [4, 0, -11], [0, 0, -8]] },
      { name: "idle", target: "arm_r", path: "rotation", time: [0, 2.4, 4.8], value: [[0, 0, 8], [4, 0, 11], [0, 0, 8]] },
      firefly("idle", 2.4),
      /* walk, 0.5 s */
      { name: "walk", target: "leg_l", path: "rotation", time: [0, 0.25, 0.5], value: [[28, 0, 0], [-28, 0, 0], [28, 0, 0]] },
      { name: "walk", target: "leg_r", path: "rotation", time: [0, 0.25, 0.5], value: [[-28, 0, 0], [28, 0, 0], [-28, 0, 0]] },
      { name: "walk", target: "arm_l", path: "rotation", time: [0, 0.25, 0.5], value: [[-30, 0, -8], [30, 0, -8], [-30, 0, -8]] },
      { name: "walk", target: "arm_r", path: "rotation", time: [0, 0.25, 0.5], value: [[30, 0, 8], [-30, 0, 8], [30, 0, 8]] },
      { name: "walk", target: "torso", path: "translation", time: [0, 0.125, 0.25, 0.375, 0.5], value: [[0, 0, 0], [0, 0.03, 0], [0, 0, 0], [0, 0.03, 0], [0, 0, 0]] },
      { name: "walk", target: "torso", path: "rotation", time: [0, 0.25, 0.5], value: [[0, 4, 0], [0, -4, 0], [0, 4, 0]] },
      { name: "walk", target: "head", path: "rotation", time: [0, 0.125, 0.25, 0.375, 0.5], value: [[3, -4, 0], [-2, 0, 0], [3, 4, 0], [-2, 0, 0], [3, -4, 0]] },
      firefly("walk", 0.5),
      /* cheer, 1.2 s */
      { name: "cheer", target: "figure", path: "translation", time: [0, 0.25, 0.5, 0.75, 1.0, 1.2], value: [[0, 0, 0], [0, 0.12, 0], [0, 0, 0], [0, 0.12, 0], [0, 0, 0], [0, 0, 0]] },
      { name: "cheer", target: "arm_l", path: "rotation", time: [0, 0.2, 0.6, 1.0, 1.2], value: [[0, 0, -8], [0, 0, -150], [0, 0, -130], [0, 0, -150], [0, 0, -8]] },
      { name: "cheer", target: "arm_r", path: "rotation", time: [0, 0.2, 0.6, 1.0, 1.2], value: [[0, 0, 8], [0, 0, 150], [0, 0, 130], [0, 0, 150], [0, 0, 8]] },
      { name: "cheer", target: "head", path: "rotation", time: [0, 0.3, 0.9, 1.2], value: [[0, 0, 0], [-12, 0, 0], [-12, 0, 0], [0, 0, 0]] },
      { name: "cheer", target: "leg_l", path: "rotation", time: [0, 0.25, 0.5, 0.75, 1.0], value: [[0, 0, 0], [-14, 0, 0], [0, 0, 0], [-14, 0, 0], [0, 0, 0]] },
      { name: "cheer", target: "leg_r", path: "rotation", time: [0, 0.25, 0.5, 0.75, 1.0], value: [[0, 0, 0], [-14, 0, 0], [0, 0, 0], [-14, 0, 0], [0, 0, 0]] },
      firefly("cheer", 1.2),
    ],
  };
}

/* ── pet accessories, per stage ─────────────────────────────────────────── */

/**
 * What the pet can wear: the three stage rewards (`cosmetic.ts`) and the
 * shop's bandana. Same `acc_<id>_<n>` material rule as the trainer. `at`
 * places each on this stage's body: `neck` is where a collar sits, `top` the
 * crown of the head, `r` how wide the neck is.
 */
function petWear({ neck, r, top, k = 1, base = 0.02 }) {
  const point = [0, 72, 144, 216, 288].map((a) => {
    const t = (a * Math.PI) / 180;
    return part(CONE, acc("tree-crown", 0, "#F6B22D"), [0.075 * k * Math.sin(t), 0.035 * k, 0.075 * k * Math.cos(t)], [0.025 * k, 0.06 * k, 0.025 * k]);
  });
  return [
    /* tree-crown: a gold band with five points and a red stone. */
    group(top, [
      part(NEST, acc("tree-crown", 1, "#F6B22D"), [0, 0, 0], [0.085 * k, 0.12 * k, 0.085 * k]),
      ...point,
      part(SPHERE, acc("tree-crown", 2, "#D2453D"), [0, 0.01 * k, 0.09 * k], [0.018 * k, 0.018 * k, 0.012 * k]),
    ]),
    /* sapling-ring: a collar of moss. */
    part(NEST, acc("sapling-ring", 0, "#5B8C3E"), neck, [r, r * 0.9, r]),
    part(SPHERE, acc("sapling-ring", 1, "#7CC84A"), [neck[0] + r * 0.6, neck[1] + 0.01, neck[2] + r * 0.75], [0.04 * k, 0.012 * k, 0.03 * k], [0, 30, 20]),
    /* shop-pet-bandana: a red kerchief, knot behind, point in front. */
    part(NEST, acc("shop-pet-bandana", 0, "#D2453D"), neck, [r * 1.02, r * 0.8, r * 1.02]),
    part(CONE, acc("shop-pet-bandana", 1, "#D2453D"), [neck[0], neck[1] - 0.02 * k, neck[2] + r * 0.9], [0.07 * k, 0.1 * k, 0.03 * k], [180, 0, 0]),
    part(SPHERE, acc("shop-pet-bandana", 2, "#FFF6DC"), [neck[0] + 0.03 * k, neck[1] - 0.04 * k, neck[2] + r * 0.95], [0.01 * k, 0.01 * k, 0.006 * k]),
    /* sprout-pot: the terracotta rim it stands on. */
    part(NEST, acc("sprout-pot", 0, "#C97B4A"), [0, base, 0], [0.4 * k, 0.3 * k, 0.4 * k]),
  ];
}

/* ── the four stages ────────────────────────────────────────────────────── */

/**
 * Every stage carries the same four clips, so the pet's pose picks one by
 * name whatever it has grown into (`pet-eagle.tsx`):
 *   idle  — standing by: breathing, looking about, blinking;
 *   walk  — following you: a hop, a quicker wobble, or the flight;
 *   sleep — slow breaths, eyes shut;
 *   happy — a find was logged: a jump, a flap, a wiggle.
 */
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
      ...petWear({ neck: [0, 0.34, 0], r: 0.33, top: [0, 0.9, 0], k: 1.3, base: 0.02 }),
    ],
    "rock",
  );
  const rock = (name, span, deg) => ({
    name,
    target: "rock",
    path: "rotation",
    time: [0, span * 0.5, span * 0.56, span * 0.62, span * 0.69, span * 0.75, span],
    value: [[0, 0, 0], [0, 0, 0], [0, 0, deg], [0, 0, -deg * 0.8], [0, 0, deg * 0.45], [0, 0, 0], [0, 0, 0]],
  });
  return {
    node: group([0, 0, 0], [nest(), body]),
    clip: [
      rock("idle", 3.2, 9),
      rock("walk", 1.2, 12),
      { name: "sleep", target: "rock", path: "scale", time: [0, 1.6, 3.2], value: [[1, 1, 1], [1.02, 0.985, 1.02], [1, 1, 1]] },
      { name: "happy", target: "rock", path: "rotation", time: [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9], value: [[0, 0, 0], [0, 0, 14], [0, 0, -14], [0, 0, 12], [0, 0, -12], [0, 0, 6], [0, 0, 0]] },
    ],
  };
}

function hatchling() {
  /* Sat IN the shell, underside below its floor: at 0.2 the chick floated
     inside the bowl touching nothing but a hair of straw, and any bob left
     it, the shell and the nest as three pieces. */
  const chick = group(
    [0, -0.04, 0],
    [
      part(SPHERE, "white", [0, 0.44, 0], [0.34, 0.33, 0.32]),
      part(SPHERE, "down", [-0.33, 0.42, 0], [0.1, 0.16, 0.12], [0, 0, 30]),
      part(SPHERE, "down", [0.33, 0.42, 0], [0.1, 0.16, 0.12], [0, 0, -30]),
      group([0, 0.5, 0.27], [eye(-0.12, 0, 0), eye(0.12, 0, 0)], "eyes"),
      cheek(-0.21, 0.4, 0.25),
      cheek(0.21, 0.4, 0.25),
      beak(0.42, 0.29, 0.7),
      /* The top of the shell, worn as a hat. */
      part(HEMI_LOW, "cream", [0.02, 0.72, 0], [0.19, -0.14, 0.19], [0, 0, -12]),
      ...petWear({ neck: [0, 0.5, 0], r: 0.3, top: [0.02, 0.8, 0], k: 1, base: 0.02 }),
    ],
    "bob",
  );
  const squash = (name, span, amount) => ({
    name,
    target: "bob",
    path: "scale",
    time: [0, span / 2, span],
    value: [[1, 1, 1], [1 + amount * 0.8, 1 + amount, 1 + amount * 0.8], [1, 1, 1]],
  });
  return {
    node: group([0, 0, 0], [
      nest(),
      chick,
      /* The shell sits IN the nest (it floated 0.02 above the straw, so the
         nest only held on through the chick's bottom). */
      part(HEMI_LOW, "cream", [0, 0.43, 0], [0.38, 0.34, 0.38]),
    ]),
    /* Squashes in the shell, never lifts out of it: lifted 0.06 the chick
       left its shell, nest and hat behind as separate pieces. */
    clip: [
      squash("idle", 1.6, 0.04),
      { name: "idle", target: "eyes", path: "scale", time: [0, 1.2, 1.26, 1.32, 1.6], value: [[1, 1, 1], [1, 1, 1], [1, 0.12, 1], [1, 1, 1], [1, 1, 1]] },
      squash("walk", 0.6, 0.06),
      squash("sleep", 3.2, 0.025),
      { name: "sleep", target: "eyes", path: "scale", time: [0, 3.2], value: [[1, 0.12, 1], [1, 0.12, 1]] },
      { name: "happy", target: "bob", path: "scale", time: [0, 0.15, 0.3, 0.45, 0.6], value: [[1, 1, 1], [1.08, 0.92, 1.08], [0.96, 1.1, 0.96], [1.04, 0.97, 1.04], [1, 1, 1]] },
      { name: "happy", target: "bob", path: "rotation", time: [0, 0.2, 0.4, 0.6], value: [[0, 0, 0], [0, 0, 8], [0, 0, -8], [0, 0, 0]] },
    ],
  };
}

/** Eaglet and eagle share a body; the eagle is longer, with open wings. The head turns on its own neck pivot. */
function bird({ adult, open = adult }) {
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
    ? /* Tucked up into the body — the adult's 12° tilt lifted the belly off them. */
      [part(SPHERE, "gold_deep", [-0.07, 0.27, 0.02], [0.045, 0.08, 0.05]), part(SPHERE, "gold_deep", [0.07, 0.27, 0.02], [0.045, 0.08, 0.05])]
    : [-1, 1].flatMap((sx) => [
        part(SPHERE, "gold", [sx * 0.1, 0.11, 0], [0.04, 0.14, 0.04]),
        /* The foot under the leg, overlapping it, not beside it. */
        part(SPHERE, "gold_deep", [sx * 0.1, 0.02, 0.04], [0.07, 0.03, 0.1]),
      ]);
  /* The head on a neck pivot at the top of the body; positions relative to it. */
  const N = 0.8 * k;
  const n = (x, y, z) => [x, y - N, z];
  const head = group([0, N, 0], [
    part(SPHERE, "cream", n(0, 0.98 * k, 0.03), [0.24 * k, 0.23 * k, 0.23 * k]),
    crest(1.1 * k - N, -0.08, k),
    group(n(0, 1.0 * k, 0.2 * k), [eye(-0.09 * k, 0, 0), eye(0.09 * k, 0, 0)], "eyes"),
    /* Brows: short flat ink bars angled in — determined, not angry. */
    part(SPHERE, "ink", n(-0.09 * k, 1.08 * k, 0.215 * k), [0.06, 0.012, 0.015], [0, 0, -14]),
    part(SPHERE, "ink", n(0.09 * k, 1.08 * k, 0.215 * k), [0.06, 0.012, 0.015], [0, 0, 14]),
    cheek(...n(-0.16 * k, 0.93 * k, 0.18 * k)),
    cheek(...n(0.16 * k, 0.93 * k, 0.18 * k)),
    beak(0.94 * k - N, 0.21 * k, k),
    ...petWear({ neck: n(0, 0.8 * k, 0.02), r: 0.2 * k, top: n(0, 1.2 * k, 0.03), k, base: -N }).slice(0, 1),
  ], "head");
  const wear = petWear({ neck: [0, 0.8 * k, 0.02], r: 0.2 * k, top: [0, 0, 0], k, base: open ? -0.1 : 0.02 });
  const body = group(
    [0, open ? 0.12 : 0, 0],
    [
      part(SPHERE, "eagle", [0, 0.56 * k, 0], [0.3 * k, 0.36 * k, 0.26 * k], [adult ? 12 : 0, 0, 0]),
      part(SPHERE, "eagle_light", [0, 0.52 * k, 0.12 * k], [0.19 * k, 0.26 * k, 0.16 * k], [adult ? 12 : 0, 0, 0]),
      part(CONE, "eagle_deep", [0, 0.3 * k, -0.18 * k], [0.14, 0.26, 0.05], [-150, 0, 0]),
      /* The neck: inside body and head both, the part that joins them. */
      part(SPHERE, "cream", [0, 0.8 * k, 0.02], [0.17 * k, 0.14 * k, 0.16 * k]),
      head,
      ...legs,
      wing("l"),
      wing("r"),
      /* Collar, bandana — on the body; the crown rides the head above. The
         pot rim stays with a standing bird only (a flyer has nothing to stand on). */
      ...wear.slice(1, open ? -1 : undefined),
    ],
    "body",
  );
  const blink = (name, span, at) => ({
    name,
    target: "eyes",
    path: "scale",
    time: [0, at, at + 0.06, at + 0.12, span],
    value: [[1, 1, 1], [1, 1, 1], [1, 0.12, 1], [1, 1, 1], [1, 1, 1]],
  });
  const look = (name, span) => ({
    name,
    target: "head",
    path: "rotation",
    time: [0, span * 0.2, span * 0.4, span * 0.6, span * 0.8, span],
    value: [[0, 0, 0], [0, 24, 4], [0, 24, 4], [0, -20, -3], [0, -20, -3], [0, 0, 0]],
  });
  const closed = (name, span) => ({ name, target: "eyes", path: "scale", time: [0, span], value: [[1, 0.12, 1], [1, 0.12, 1]] });
  const wings = (name, time, deg) => [
    { name, target: "wing_l", path: "rotation", time, value: deg.map((d) => [0, 0, -d]) },
    { name, target: "wing_r", path: "rotation", time, value: deg.map((d) => [0, 0, d]) },
  ];
  const lift = (open ? 0.12 : 0);
  const clip = open
    ? [
        /* idle: gliding, a slow beat, looking about */
        ...wings("idle", [0, 1, 2], [-8, 12, -8]),
        { name: "idle", target: "body", path: "translation", time: [0, 1, 2], value: [[0, lift + 0.03, 0], [0, lift, 0], [0, lift + 0.03, 0]] },
        look("idle", 4),
        blink("idle", 4, 2.9),
        /* walk: the flight that follows you */
        ...wings("walk", [0, 0.3, 0.6], [-22, 26, -22]),
        { name: "walk", target: "body", path: "translation", time: [0, 0.3, 0.6], value: [[0, lift + 0.04, 0], [0, lift - 0.02, 0], [0, lift + 0.04, 0]] },
        /* sleep: wings folded down, head bowed, eyes shut, slow breaths */
        ...wings("sleep", [0, 3.2], [55, 55]),
        { name: "sleep", target: "head", path: "rotation", time: [0, 3.2], value: [[22, 0, 0], [22, 0, 0]] },
        { name: "sleep", target: "body", path: "scale", time: [0, 1.6, 3.2], value: [[1, 1, 1], [1.02, 0.98, 1.02], [1, 1, 1]] },
        closed("sleep", 3.2),
        /* happy: a fast beat and a climb */
        ...wings("happy", [0, 0.15, 0.3, 0.45, 0.6, 0.9], [-30, 34, -30, 34, -30, -8]),
        { name: "happy", target: "body", path: "translation", time: [0, 0.45, 0.9], value: [[0, lift, 0], [0, lift + 0.16, 0], [0, lift, 0]] },
      ]
    : [
        /* idle: standing, looking about, a ruffle */
        look("idle", 3.6),
        blink("idle", 3.6, 2.4),
        ...wings("idle", [0, 2.8, 3.0, 3.2, 3.6], [8, 8, 20, 8, 8]),
        /* walk: the hop */
        { name: "walk", target: "body", path: "translation", time: [0, 0.35, 0.7], value: [[0, 0, 0], [0, 0.05, 0], [0, 0, 0]] },
        ...wings("walk", [0, 0.35, 0.7], [8, 16, 8]),
        /* sleep */
        { name: "sleep", target: "head", path: "rotation", time: [0, 3.2], value: [[24, 0, 0], [24, 0, 0]] },
        { name: "sleep", target: "body", path: "scale", time: [0, 1.6, 3.2], value: [[1, 1, 1], [1.03, 0.97, 1.03], [1, 1, 1]] },
        closed("sleep", 3.2),
        /* happy: a jump with the wings out */
        { name: "happy", target: "body", path: "translation", time: [0, 0.2, 0.4, 0.6, 0.8], value: [[0, 0, 0], [0, 0.12, 0], [0, 0, 0], [0, 0.08, 0], [0, 0, 0]] },
        ...wings("happy", [0, 0.2, 0.4, 0.6, 0.8], [8, 70, 20, 60, 8]),
      ];
  return { node: group([0, 0, 0], [body]), clip };
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
    } else if (n.mesh) {
      /* Every part named, so the connectivity audit (script/audit-model.mjs)
         can say WHICH piece came apart, not "undefined". Clips target the
         named groups only, so these names change no animation. */
      node.name = `${n.color}_${index}`;
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
