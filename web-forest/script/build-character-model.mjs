/**
 * Build the Field Guide companion character — four growth stages from the 3D
 * build spec (T4.3): egg → seedling → sapling → tree. Same cute kit as the
 * species pack, so the buddy and the wildlife share one art style.
 *
 * Output: public/model/character-egg.glb, character-seedling.glb,
 * character-sapling.glb, character-tree.glb, plus character.glb (the full
 * tree — the default file at the CHARACTER_MODEL_SLOT path).
 *
 * Usage: node script/build-character-model.mjs
 */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Kit, APP, LEAVES, grad, shade, hex } from "./species-model/kit.mjs";
import { flora } from "./species-model/flora.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "public", "model");

const hex2 = hex;
const leaf = LEAVES[0];
const leafDeep = APP.greenDeep;
const trunk = hex2("#8a5a33");

function soil(k, r = 0.16) {
  k.blob(k.root, {
    name: "soil", rx: r * 1.6, ry: r * 0.55, rz: r * 1.3, at: [0, r * 0.3, 0],
    color: hex2("#6b4a2f"),
  });
}

// 1 — egg: white, wobbling, waiting
function egg() {
  const k = new Kit({ species_code: "character-egg", scientific_name: "field guide egg" }, { idleDur: 2.0 });
  soil(k);
  const shell = k.blob(k.root, {
    name: "shell", rx: 0.17, ry: 0.22, rz: 0.17, at: [0, 0.3, 0],
    color: hex2("#f6f1e4"),
  });
  k.arc(shell, { name: "crack", R: 0.09, r: 0.018, a0: Math.PI * 1.05, a1: Math.PI * 1.5, at: [0.02, 0.12, 0.14], rotX: 0.25, rotY: -0.3, color: hex2("#c9bfa8"), segs: 5 });
  k.face(shell, { r: 0.17, gap: 0.42, eyeR: 0.32, blink: true });
  k.cute.swing(k.root, { axis: "z", amp: 0.09, dur: 1.1, phase: 0.2 });
  k.cute.breathe(k.root, { k: 0.02 });
  return k.finish();
}

// 2 — seedling: sprouted, two proud leaves
function seedling() {
  const k = new Kit({ species_code: "character-seedling", scientific_name: "field guide seedling" }, { idleDur: 2.0 });
  soil(k);
  const stem = k.tube(k.root, { name: "stem", r: 0.028, r2: 0.02, h: 0.2, color: leafDeep, seg: 6 });
  for (const s of [1, -1]) {
    k.blob(stem, {
      name: `leaf${s}`, rx: 0.11, ry: 0.016, rz: 0.07,
      at: [s * 0.09, 0.2, 0.01], pivot: [s * 0.015, 0.2, 0],
      rotZ: s * -0.55, color: s > 0 ? leaf : leafDeep,
      colorFn: grad(shade(leaf, 0.2), leafDeep, -0.02, 0.02),
    });
  }
  const heart = k.blob(stem, { name: "heart", r: 0.06, at: [0, 0.24, 0.02], color: leaf });
  k.face(heart, { r: 0.06, gap: 0.42, eyeR: 0.36, blink: true });
  k.cute.swing(heart, { axis: "z", amp: 0.12, dur: 2.0 });
  k.cute.breathe(k.root, { k: 0.03 });
  return k.finish();
}

// 3 — sapling: a trunk and a proper little crown
function sapling() {
  const k = new Kit({ species_code: "character-sapling", scientific_name: "field guide sapling" }, { idleDur: 2.2 });
  soil(k, 0.18);
  const trunkNode = k.tube(k.root, { name: "trunk", r: 0.055, r2: 0.04, h: 0.34, color: trunk, seg: 7 });
  /* The face rides the trunk's own surface. `face()` lays eyes, smile and blush
     on a sphere of radius `r` around `center`, so `center` is the trunk's AXIS
     and `r` is the trunk's radius at that height. It used to be centred a whole
     radius in front of the axis (`[0, 0.17, 0.055]`), which put every feature
     ~6 cm proud of the bark: from the side the eyes hung in mid-air, and the
     blink squashed them clear of the trunk altogether (Gelo 09-30 `1:35`, "his
     limbs are not connected"; caught by the rig audit at 10-14% of the model's
     size). y=0.2 is the bare trunk between the soil mound (top ~0.15) and the
     lowest canopy ball (~0.24), where a face can actually be seen. */
  const face_y = 0.2;
  const trunk_r = 0.055 + (0.04 - 0.055) * (face_y / 0.34);
  k.face(trunkNode, { center: [0, face_y, 0], r: trunk_r, gap: 0.42, eyeR: 0.36, blink: true });
  for (const [i, [x, y, z, r]] of [[0, 0.44, 0, 0.2], [0.13, 0.36, 0.04, 0.14], [-0.12, 0.38, -0.03, 0.14]].entries()) {
    const c = k.blob(trunkNode, {
      name: `canopy${i}`, r, at: [x, y, z],
      color: i % 2 ? leaf : leafDeep,
      colorFn: grad(shade(leaf, 0.2), leafDeep, -0.25, 0.25),
    });
    k.cute.swing(c, { axis: "x", amp: 0.03, dur: 2.4 + i * 0.3, phase: i * 0.4 });
  }
  k.cute.breathe(k.root, { k: 0.018 });
  return k.finish();
}

// 4 — tree: the full companion, fruit and all
function tree() {
  const k = new Kit({ species_code: "character-tree", scientific_name: "field guide tree" }, { idleDur: 2.4 });
  soil(k, 0.2);
  const opt = { thick: true, trunkH: 0.42, fruit: true, fruitCount: 5, blobs: 4 };
  flora.tree(k, { base: leaf, dark: leafDeep, trunk, accent: APP.orange }, opt);
  return k.finish();
}

/**
 * 5 — the hiker: a walking body for the map, PROPOSED, not shipped by default.
 *
 * 09-30, Gelo `1:35`–`1:41`: "the main character … he's still very
 * disconnected. Like his limbs are not connected", and `5:42`–`5:51`: "or we
 * actually make a real human being with this scale". This is that body, drawn
 * from the brand's own hiker sticker (`src/asset/magi/sticker/hiker.png`): the
 * Sprout's round yellow body with a two-leaf sprout, a green pack with a blue
 * bedroll, stubby arms and legs, orange boots. It rides the map only behind
 * `?avatar=hiker` (src/avatar.ts). Design is Aleij's; this is a prototype for
 * her to accept, redraw or reject, and every proportion below is a knob.
 *
 * Joints overlap BY CONSTRUCTION, not by tuning. Every limb is a capsule whose
 * end cap is a sphere centred exactly on its hinge, and every hinge sits inside
 * the part it hangs from. A sphere is the same shape at every angle, so a hip,
 * knee, ankle or shoulder can swing through any rotation and the two parts
 * still share that sphere: there is no pose in which a limb can come off. The
 * rig audit (`auditConnectivity`, script/audit-model.mjs) checks it at every
 * keyframe of both clips anyway.
 *
 * Two clips: `idle` (breathe, a small wave, leaves stirring, a blink) and
 * `walk` (a 0.64 s stride — the SVG walker's `yc-step` is 0.62 s — hips
 * swinging opposite, knees trailing the hips by a quarter stride, arms counter
 * to the legs, two bobs per stride, one per footfall).
 */
function hiker() {
  const k = new Kit({ species_code: "character-hiker", scientific_name: "field guide hiker" }, { idleDur: 2.4 });
  const yellow = hex2("#f3c63f");
  const boot = APP.orange;
  const pack = hex2("#4fae3a");
  const bedroll = hex2("#2b8fb3");

  /* Measurements, feet up. Ankle, knee and hip heights follow from the leg
     lengths; the body sits on the hips. */
  const foot = { rx: 0.036, ry: 0.024, rz: 0.052 };
  const shin = { r: 0.029, h: 0.055 };
  const thigh = { r: 0.032, h: 0.06 };
  const ankle_y = foot.ry + 0.012;
  const hip_y = ankle_y + shin.h + thigh.h;
  const body = { rx: 0.15, ry: 0.165, rz: 0.14 };
  const hip_in_body = [0.062, -0.1, 0]; // inside the body: (x/rx)²+(y/ry)² = 0.54
  const body_y = hip_y - hip_in_body[1];

  const trunk = k.blob(k.root, {
    name: "body", rx: body.rx, ry: body.ry, rz: body.rz, at: [0, body_y, 0],
    color: yellow, colorFn: grad(shade(yellow, 0.12), shade(yellow, -0.12), -0.15, 0.15),
  });
  k.face(trunk, { center: [0, 0.03, 0], r: body.rz, gap: 0.42, eyeR: 0.3, blink: true });

  // the sprout on top: a stem planted inside the body, two leaves hinged at its tip
  const stem = k.tube(trunk, { name: "stem", r: 0.013, r2: 0.01, h: 0.075, at: [0, body.ry - 0.02, 0], color: leafDeep, seg: 8 });
  const leaf_node = [];
  for (const s of [1, -1]) {
    leaf_node.push(k.blob(stem, {
      name: `leaf${s > 0 ? "l" : "r"}`, rx: 0.075, ry: 0.014, rz: 0.042,
      at: [s * 0.062, 0.075, 0], pivot: [s * 0.006, 0.075, 0],
      rotZ: s * -0.45, color: s > 0 ? leaf : leafDeep,
      colorFn: grad(shade(leaf, 0.2), leafDeep, -0.02, 0.02),
    }));
  }

  // the pack and its bedroll, both sunk into the back
  const backpack = k.blob(trunk, { name: "pack", rx: 0.105, ry: 0.115, rz: 0.07, at: [0, 0.0, -body.rz + 0.02], color: pack });
  k.blob(backpack, { name: "pack-pocket", rx: 0.06, ry: 0.05, rz: 0.03, at: [0, -0.04, -0.055], color: shade(pack, -0.12) });
  k.tube(backpack, { name: "bedroll", r: 0.038, h: 0.2, at: [-0.1, 0.11, -0.01], rotZ: -Math.PI / 2, color: bedroll, seg: 12 });

  /* A limb: a capsule from the hinge outward along `dir`, its first cap
     centred on the hinge. `kit.limb` runs along +Y, so the rest pose is baked
     into the mesh as the rotation taking +Y onto `dir` — and the NODE is left
     unrotated, free for the clip to swing. */
  const limb = (parent, name, { at, r, h, dir, color }) => {
    const rotX = Math.atan2(dir[2], dir[1]);
    const rotZ = -Math.atan2(dir[0], Math.hypot(dir[1], dir[2]));
    return k.limb(parent, { name, r, h, at, rotX, rotZ, color });
  };
  const down = [0, -1, 0];

  const leg = [];
  for (const s of [1, -1]) {
    const tag = s > 0 ? "l" : "r";
    const hip = limb(trunk, `thigh-${tag}`, { at: [s * hip_in_body[0], hip_in_body[1], 0], r: thigh.r, h: thigh.h, dir: down, color: yellow });
    const knee = limb(hip, `shin-${tag}`, { at: [0, -thigh.h, 0], r: shin.r, h: shin.h, dir: down, color: yellow });
    // the ankle sits inside the boot: (0/rx)² + (0.012/ry)² + (0.018/rz)² = 0.37
    k.blob(knee, { name: `boot-${tag}`, rx: foot.rx, ry: foot.ry, rz: foot.rz, at: [0, -shin.h - 0.012, 0.018], pivot: [0, -shin.h, 0], color: boot });
    leg.push({ hip, knee, s });
  }

  const arm = [];
  for (const s of [1, -1]) {
    const tag = s > 0 ? "l" : "r";
    // shoulder inside the body: (0.118/0.15)² + (0.01/0.165)² = 0.62
    const dir = [s * Math.sin(0.5), -Math.cos(0.5), 0.08];
    const n = Math.hypot(...dir);
    const unit = dir.map((v) => v / n);
    const upper = limb(trunk, `arm-${tag}`, { at: [s * 0.118, 0.01, 0.01], r: 0.026, h: 0.085, dir: unit, color: yellow });
    // the fist is centred on the arm's far cap, so it holds at any angle
    k.blob(upper, { name: `hand-${tag}`, r: 0.034, at: unit.map((v) => v * 0.085), color: yellow });
    arm.push({ upper, s });
  }

  // ---- idle ----
  k.cute.breathe(k.root, { k: 0.02, dur: 2.4 });
  k.cute.swing(arm[1].upper, { axis: "z", base: 0, amp: 0.18, dur: 2.4 });
  k.cute.swing(arm[0].upper, { axis: "z", base: 0, amp: 0.06, dur: 2.4, lag: 0.5 });
  for (const [i, n] of leaf_node.entries()) k.cute.swing(n, { axis: "z", amp: 0.12, dur: 2.4, lag: i * 0.5 });

  // ---- walk ----
  const stride = 0.64;
  k.cute.beginClip("walk");
  for (const { hip, knee, s } of leg) {
    /* +x rotation carries a hanging limb backward. Left leg forward while the
       right goes back; each knee bends most as its leg swings through, a
       quarter stride after its hip is furthest back. */
    const flip = s > 0 ? 0 : 0.5;
    k.cute.swing(hip, { axis: "x", amp: 0.55, dur: stride, lag: flip });
    k.cute.swing(knee, { axis: "x", base: 0.32, amp: 0.3, dur: stride, lag: flip + 0.25 });
  }
  for (const { upper, s } of arm) {
    k.cute.swing(upper, { axis: "x", amp: 0.5, dur: stride, lag: s > 0 ? 0.5 : 0 });
  }
  k.cute.bob(trunk, { amp: 0.012, dur: stride, cycles: 2 });
  for (const [i, n] of leaf_node.entries()) k.cute.swing(n, { axis: "z", amp: 0.2, dur: stride, lag: 0.25 + i * 0.5 });
  return k.finish();
}

for (const [name, bytes] of [
  ["character-egg.glb", egg()],
  ["character-seedling.glb", seedling()],
  ["character-sapling.glb", sapling()],
  ["character-tree.glb", tree()],
  ["character.glb", tree()],
  ["character-hiker.glb", hiker()],
]) {
  writeFileSync(join(out, name), bytes);
  console.log(`${name} ${(bytes.length / 1024).toFixed(1)} kB`);
}
