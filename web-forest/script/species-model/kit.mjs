/**
 * The cute-parts kit: one shared vocabulary of chibi pieces (ball bodies,
 * eye faces, stub limbs, blob canopies, leaves) that every species model is
 * composed from. Sits on top of glb.mjs.
 *
 * Style contract (matches the app's art): low-poly with crease-aware smooth
 * shading, the repo's leaf greens, one mustard accent, ink for the eyes.
 * Proportions are chibi on purpose: big head, big glossy eyes, stubby limbs.
 *
 * Tessellation is a FLOOR here, not a suggestion. `subdiv: 0` and `seg: 5` are
 * honoured as "as coarse as you like, down to the point where the surface stops
 * reading as a surface" — a 20-face ball and a 5-sided tube both put every one
 * of their edges past the 40-degree crease line, which is the audit's whole
 * definition of "faceted". Callers who genuinely want a chunky hexagonal stem
 * pass `exactSeg: true` and keep it.
 *
 * Pivot rule: a part's node carries its position (and, via `pivot`, its
 * animation hinge); geometry is baked centered on the node origin. Rotate the
 * node and the part swings around that hinge — wings flap at the shoulder,
 * canopies sway at the trunk top.
 */
import {
  Cute, icosphere, cylinderGeo, torusArcGeo, discGeo, capsuleGeo,
  hex, hsl, mix, shade, hash32, jitterColor, pick,
  mCompose, mRx, mRy, mRz, apply,
} from "./glb.mjs";

export const APP = {
  ink: hex("#1f2022"),
  paper: hex("#f9f9f9"),
  green: hex("#45c223"),
  greenDeep: hex("#008653"),
  orange: hex("#f6b22d"),
  red: hex("#ff3920"),
  blue: hex("#058cd6"),
};

// tuned palette pools — derived palettes pick from these, never raw hue wheels
export const LEAVES = ["#45c223", "#2e9e44", "#6cbf2e", "#008653", "#78c850", "#0f7a4b", "#8fce3f", "#1d8f38"].map(hex);
export const TRUNKS = ["#8a5a33", "#6f4626", "#9c6b3d", "#5d3a1f", "#a5713f", "#7a4e2a"].map(hex);
export const FLOWERS = ["#ff3920", "#e84a8a", "#c84ab5", "#f6b22d", "#ffef8a", "#f8f4ec", "#6a7fd8", "#9a5ad8", "#ff8c5a"].map(hex);
export const FUNGI_CAPS = ["#d8352a", "#b5651d", "#e8862a", "#8a5aa0", "#e8e0d0", "#e8c93a", "#4a7fb5", "#d86a8a", "#a0522d"].map(hex);
export const SHELLS = ["#8a5a33", "#c07a3a", "#d8c49a", "#a0522d", "#b8860b"].map(hex);
export const INSECTS = ["#e04a35", "#e8b62a", "#ff8c2a", "#58a942", "#3a8ad8", "#8a5ad8", "#7a5230", "#2b2b30", "#d84a7f", "#4ab5a0"].map(hex);
export const BIRDS = ["#9a6a3f", "#e8b62a", "#2f7fb5", "#4a9e46", "#2b2b30", "#9aa0a6", "#f4f4ee", "#55b54a", "#c86a3a", "#7a4e9a", "#3a6ab5", "#b53a4a"].map(hex);
export const FURS = ["#e08a3c", "#9aa0a6", "#2f2f33", "#b58a5a", "#c89a5e", "#7a5230", "#d8c8b0"].map(hex);

const BLUSH = hex("#f0a0a8");

/**
 * Pack-wide shading default, in degrees of crease angle. Facets that meet more
 * gently than this share an averaged normal; anything sharper stays a hard
 * edge. 40 matches the audit's own definition of a crease, so what the gate
 * calls faceted is exactly what ships looking faceted.
 */
export const SMOOTH_DEFAULT = 40;

function norm3([x, y, z]) {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

export function dirOf(yaw, pitch) {
  return [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
}

/** Vertical two-tone gradient in node-local space (canopies, leaves). */
export function grad(top, bottom, lo = -0.35, hi = 0.35) {
  return (p) => mix(bottom, top, Math.max(0, Math.min(1, (p[1] - lo) / (hi - lo))));
}

/**
 * Move the part just added to `node` by `offset`, AFTER its own scale and
 * rotation.
 *
 * `Cute.add` composes S·R·T, so an `at` handed to it is applied FIRST and then
 * scaled by the part's radii and turned by its rotation. For the primitives
 * below that `at` is the offset from a `pivot` to the part's centre — and a
 * leaf 0.075 out from its stem, scaled by its own 0.11 × 0.016 × 0.07 radii,
 * landed 0.008 out: centred on the stem. That is why the seedling's two leaves
 * read as one flat disc round its stalk rather than a pair reaching out, and
 * why a pivoted part was never where its caller put it. A zero offset (every
 * un-pivoted part — the whole species pack) is untouched, byte for byte.
 */
function shiftLast(node, offset) {
  if (!offset.some((v) => v !== 0)) return;
  const part = node.parts[node.parts.length - 1];
  part.positions = part.positions.map((q) => [q[0] + offset[0], q[1] + offset[1], q[2] + offset[2]]);
}

/**
 * High-level builder bound to one Cute. Every helper creates node(s) for you
 * and returns the main node so animation can target it.
 */
export class Kit {
  constructor(spec, { idleDur = 1.6, smooth = SMOOTH_DEFAULT } = {}) {
    this.spec = spec;
    this.cute = new Cute(spec.species_code, { idleDur, smooth });
    this.dur = idleDur;
    this.seed = hash32(spec.scientific_name ?? spec.species_code);
    this.hash = (n) => (hash32(`${spec.scientific_name}:${n}`) % 10000) / 10000;
  }

  get root() {
    return this.cute.root;
  }

  // ---- primitives ----

  /**
   * Roundish chibi part. `r` for a sphere, rx/ry/rz for an ellipsoid. `at` is
   * the part's position in the parent frame; `pivot` (optional) moves the node
   * origin away from the geometry so swings hinge correctly.
   */
  blob(parent, { r, rx, ry, rz, at = [0, 0, 0], pivot = null, rotX = 0, rotY = 0, rotZ = 0, color, colorFn, name = "blob", subdiv, smooth }) {
    const scale = r ? [r, r, r] : [rx, ry, rz];
    /* Tessellation floor. A 20-face icosahedron has a 41.8-degree dihedral,
       which is just over the audit's 40-degree crease threshold, so EVERY edge
       of a subdiv-0 ball counts as a hard crease and the part reads as a rock.
       One subdivision drops that to zero hard edges for four times the faces;
       a big ball earns a second so its silhouette is round at gallery size. */
    const big = Math.max(...scale);
    const s = subdiv ?? (big < 0.05 ? 1 : 2);
    const origin = pivot ?? at;
    const offset = [at[0] - origin[0], at[1] - origin[1], at[2] - origin[2]];
    const node = this.cute.node(name, { parent, at: origin });
    this.cute.add(node, icosphere(Math.max(1, s)), { rotX, rotY, rotZ, scale, color, colorFn, smooth });
    shiftLast(node, offset);
    return node;
  }

  /** Flat disc — eyes, spots, petals. */
  disc(parent, { r, at, rotX = 0, rotY = 0, rotZ = 0, color, name = "disc", pivot = null, subdiv = 1, smooth }) {
    return this.blob(parent, { r, at, pivot, rotX, rotY, rotZ, color, name, subdiv, smooth });
  }

  /** Flat n-gon plate in the XZ plane before rotation (spots, lily pads). */
  plate(parent, { r, at = [0, 0, 0], pivot = null, rotX = 0, rotY = 0, rotZ = 0, color, colorFn, name = "plate", seg = 12, smooth }) {
    const origin = pivot ?? at;
    const offset = [at[0] - origin[0], at[1] - origin[1], at[2] - origin[2]];
    const node = this.cute.node(name, { parent, at: origin });
    this.cute.add(node, discGeo(r, seg), { rotX, rotY, rotZ, color, colorFn, smooth });
    shiftLast(node, offset);
    return node;
  }

  /** Cone along +Y before rotation (beaks, horns, spikes). */
  cone(parent, { r, h, at = [0, 0, 0], pivot = null, rotX = 0, rotY = 0, rotZ = 0, color, name = "cone", seg = 10, smooth, exactSeg }) {
    return this.tube(parent, { r, r2: 0, h, at, pivot, rotX, rotY, rotZ, color, name, seg, smooth, exactSeg });
  }

  /** Cylinder / tapered tube along +Y before rotation. */
  tube(parent, { r, r2, h, at = [0, 0, 0], pivot = null, rotX = 0, rotY = 0, rotZ = 0, color, colorFn, name = "tube", seg = 10, smooth, exactSeg = false, capBase = true, capTop = true }) {
    const origin = pivot ?? at;
    const offset = [at[0] - origin[0], at[1] - origin[1], at[2] - origin[2]];
    const node = this.cute.node(name, { parent, at: origin });
    this.cute.add(node, cylinderGeo(r, r2 ?? r, h, seg, { exactSeg, capBase, capTop }), { rotX, rotY, rotZ, color, colorFn, smooth });
    shiftLast(node, offset);
    return node;
  }

  /** Rounded limb along +Y from y=0 to y=h — a tube with hemisphere ends. */
  limb(parent, { r, h, at = [0, 0, 0], pivot = null, rotX = 0, rotY = 0, rotZ = 0, color, colorFn, name = "limb", seg = 10, cap = 2, smooth }) {
    const origin = pivot ?? at;
    const offset = [at[0] - origin[0], at[1] - origin[1], at[2] - origin[2]];
    const node = this.cute.node(name, { parent, at: origin });
    this.cute.add(node, capsuleGeo(r, h, seg, cap), { rotX, rotY, rotZ, color, colorFn, smooth });
    shiftLast(node, offset);
    return node;
  }

  /** Torus arc in the XY plane (smiles, fiddleheads, tendrils). */
  arc(parent, { R, r, a0, a1, at = [0, 0, 0], pivot = null, rotX = 0, rotY = 0, rotZ = 0, color, colorFn, name = "arc", segs = 12, smooth, exactSeg = false }) {
    const origin = pivot ?? at;
    const offset = [at[0] - origin[0], at[1] - origin[1], at[2] - origin[2]];
    const node = this.cute.node(name, { parent, at: origin });
    this.cute.add(node, torusArcGeo(R, r, a0, a1, segs, { exactSeg }), { rotX, rotY, rotZ, color, colorFn, smooth });
    shiftLast(node, offset);
    return node;
  }

  /** Second node reusing another node's mesh — for identical mirrored pairs. */
  twin(src, { parent, name, at }) {
    const node = this.cute.node(name, { parent, at });
    this.cute.linkMesh(src, node);
    return node;
  }

  // ---- the face ----

  /**
   * Kawaii face centered on `center` (in the parent's local frame — pass the
   * head node as parent and [0,0,0] to ride the head). Returns the eye nodes.
   */
  /**
   * Kawaii face on the surface of a head centered at `center` (parent-local).
   * Eyes/pupils/sparks are flat discs laid tangent to the head surface — the
   * classic chibi look. u = right offset (fraction of r), w = up offset.
   */
  face(parent, { center = [0, 0, 0], r, yaw = 0, pitch = 0, gap = 0.5, eyeR = 0.3, blush = true, smile = true, blink = false, name = "face" }) {
    const rotM = mCompose(mRy(yaw), mRx(-pitch));
    const dir = dirOf(yaw, pitch);
    const right = apply(rotM, [1, 0, 0]);
    const up = apply(rotM, [0, 1, 0]);

    // surface point + outward normal for face-plane fractions (u, w)
    const onFace = (u, w, lift = 1.0) => {
      const d0 = Math.sqrt(Math.max(0.12, 1 - u * u - w * w));
      const n = norm3([
        right[0] * u + up[0] * w + dir[0] * d0,
        right[1] * u + up[1] * w + dir[1] * d0,
        right[2] * u + up[2] * w + dir[2] * d0,
      ]);
      return {
        at: [
          center[0] + (right[0] * u + up[0] * w + dir[0] * d0) * r * lift,
          center[1] + (right[1] * u + up[1] * w + dir[1] * d0) * r * lift,
          center[2] + (right[2] * u + up[2] * w + dir[2] * d0) * r * lift,
        ],
        yaw: Math.atan2(n[0], n[2]),
        pitch: Math.asin(Math.max(-1, Math.min(1, n[1]))),
      };
    };

    const eyeAt = (side) => onFace(side * gap, 0.14, 0.99);
    const Re = eyeR * r;
    const mkEye = (side, tag) => {
      const p = eyeAt(side);
      // orientation goes on the NODE (so the mirrored eye can share the mesh)
      const eye = this.cute.node(`${name}-eye-${tag}`, { parent, at: p.at, rot: [-p.pitch, p.yaw, 0] });
      this.cute.add(eye, icosphere(2), { scale: [Re, Re, Re * 0.35], color: APP.paper });
      this.disc(eye, { name: `${name}-pupil-${tag}`, r: Re * 0.5, at: [0, -Re * 0.08, Re * 0.5], color: APP.ink });
      this.disc(eye, { name: `${name}-spark-${tag}`, r: Re * 0.3, at: [Re * 0.18, Re * 0.22, Re * 0.72], color: APP.paper });
      return eye;
    };
    const eyeL = mkEye(1, "l");
    const eyeRNode = mkEye(-1, "r");

    if (smile) {
      const s = onFace(0, -0.28, 0.97);
      this.arc(parent, {
        name: `${name}-smile`, R: r * 0.26, r: r * 0.07,
        a0: Math.PI * 1.22, a1: Math.PI * 1.78,
        at: s.at, rotX: -s.pitch, rotY: s.yaw,
        color: APP.ink, segs: 8,
      });
    }
    if (blush) {
      for (const side of [1, -1]) {
        const p = onFace(side * (gap + 0.42), -0.28, 0.95);
        this.disc(parent, {
          name: `${name}-blush-${side}`, r: r * 0.2, at: p.at,
          rotY: p.yaw, rotX: -p.pitch, color: BLUSH, subdiv: 1,
        });
      }
    }
    if (blink) {
      this.cute.blink(eyeL, { dur: this.dur });
      this.cute.blink(eyeRNode, { dur: this.dur });
    }
    return { eyeL, eyeR: eyeRNode };
  }

  // ---- shared creature pieces ----

  /** Two stub legs under a body (hip-hinged). */
  legs(parent, { at, spread = 0.09, r = 0.03, h = 0.12, color, swing = 0 }) {
    const mk = (side, name) => this.tube(parent, {
      name, r, h, at: [at[0] + side * spread, at[1], at[2]], pivot: [at[0] + side * spread, at[1] + h * 0.4, at[2]],
      color,
    });
    const l = mk(1, "leg-l");
    const rt = mk(-1, "leg-r");
    if (swing) {
      this.cute.swing(l, { axis: "x", amp: swing, dur: this.dur, phase: 0 });
      this.cute.swing(rt, { axis: "x", amp: swing, dur: this.dur, phase: 0.4 });
    }
    return [l, rt];
  }

  /** Six insect legs splayed from a body center. */
  bugLegs(parent, { at, r = 0.014, len = 0.16, color }) {
    const out = [];
    [0.08, 0, -0.08].forEach((dz, i) => {
      out.push(this.tube(parent, {
        name: `leg${i}-l`, r, h: len, at: [0.02, at[1], at[2] + dz],
        rotZ: 1.9 + dz * 3, rotX: dz * 1.5, color,
      }));
      out.push(this.tube(parent, {
        name: `leg${i}-r`, r, h: len, at: [-0.02, at[1], at[2] + dz],
        rotZ: -1.9 - dz * 3, rotX: dz * 1.5, color,
      }));
    });
    return out;
  }

  /** A pair of antennae with ball tips, wiggling out of phase. */
  antennae(parent, { at, len = 0.14, r = 0.012, color, spread = 0.5, wiggle = true }) {
    const mk = (side, name) => {
      const a = this.tube(parent, {
        name, r, h: len, at: [at[0] + side * 0.03, at[1], at[2]],
        rotZ: side * -spread, color,
      });
      this.blob(a, { name: `${name}-tip`, r: r * 2.4, at: [0, len, 0], color: shade(color, -0.2) });
      return a;
    };
    const l = mk(1, "antenna-l");
    const rt = mk(-1, "antenna-r");
    if (wiggle) {
      this.cute.swing(l, { axis: "z", amp: 0.14, dur: this.dur, phase: 0 });
      this.cute.swing(rt, { axis: "z", amp: 0.14, dur: this.dur, phase: 0.5 });
    }
    return [l, rt];
  }

  /** Idle default: gentle breathe + bob on the root. */
  idle({ breatheK = 0.035, bobAmp = 0.03 } = {}) {
    this.cute.breathe(this.root, { k: breatheK });
    if (bobAmp) this.cute.bob(this.root, { amp: bobAmp, phase: 0.25 });
  }

  /** Deterministic palette pick from a pool, with a tiny value jitter. */
  pick(pool, name, jitter = 0.06) {
    return jitterColor(pick(pool, this.seed + Math.floor(this.hash(name) * 97)), this.hash(name), jitter);
  }

  /** Assemble the final glb bytes. */
  finish() {
    return this.cute.toGLB();
  }
}

export { icosphere, cylinderGeo, torusArcGeo, discGeo, capsuleGeo, hex, hsl, mix, shade, hash32, pick, jitterColor, mCompose, mRx, mRy, mRz, apply };
