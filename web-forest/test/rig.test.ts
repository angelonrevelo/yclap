import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { auditConnectivity, CHARACTER_FILE, CONNECT, posedPart, surfaceGap } from "../script/audit-model.mjs";
import { Kit, APP } from "../script/species-model/kit.mjs";
import { avatarFrom, hikerClip, hikerOrbitDegree, HIKER_MODEL } from "../src/avatar.ts";

/* ── the rule this file guards ────────────────────────────────────────────
 *
 * 09-30, Gelo `1:35`–`1:41`: "the main character or the guy … he's still very
 * disconnected. Like his limbs are not connected", and `5:42`–`5:51`: "make
 * sure that none of the limbs are disconnected".
 *
 * Every mesh part of every model touches the part it hangs from, and the model
 * is one piece — in the rest pose AND at every keyframe of every clip, because
 * the clip is what a viewer actually sees. Before the rig lane, 128 of the 1,102
 * shipped models failed this (118 already apart at rest, 10 only mid-clip); the
 * companion's sapling face hung 14% of the model in front of its trunk. The
 * full pack is `npm run audit:model` (~90 s); this runs the same check on the
 * generator's own output and on a fixed sample of the committed files.
 */

type Part = ReturnType<typeof posedPart>;

/** An axis-aligned box as a closed 12-triangle mesh. */
function box(lo: number[], hi: number[], name = "box"): Part {
  const v: number[] = [];
  for (let i = 0; i < 8; i += 1) v.push(i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]);
  const quad = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
  const index: number[] = [];
  for (const [a, b, c, d] of quad) index.push(a, b, c, a, c, d);
  return posedPart(Float64Array.from(v), Uint32Array.from(index), name);
}

describe("surfaceGap — the contact test the gate and the builders share", () => {
  const tol = 0.01;

  it("sees two surfaces CROSSING with no vertex of either near the other", () => {
    /* A long thin post through a slab: every post vertex is 0.5 from the slab
       and every slab vertex far from the post. A vertex-proximity test calls
       this floating — the six-sided stem through its soil mound. */
    const slab = box([-1, -0.05, -1], [1, 0.05, 1]);
    const post = box([-0.02, -0.5, -0.02], [0.02, 0.5, 0.02]);
    assert.equal(surfaceGap(post, slab, tol), 0);
  });

  it("calls a part buried wholly inside another touching", () => {
    assert.equal(surfaceGap(box([-0.1, -0.1, -0.1], [0.1, 0.1, 0.1]), box([-1, -1, -1], [1, 1, 1]), tol), 0);
  });

  it("measures a real gap", () => {
    const g = surfaceGap(box([0, 0, 0], [1, 1, 1]), box([1.3, 0, 0], [2, 1, 1]), 1, true);
    assert.ok(Math.abs(g - 0.3) < 1e-9, String(g));
  });

  it("never reports 'more than tol' as tol itself", () => {
    /* Boxes that overlap as BOXES while no surface of one comes near the
       other: an L-shaped crown's box over a petiole. The first version
       returned exactly `tol` here, which the callers' `<= tol` read as
       contact and joined a philodendron crown to a stalk 7% away. */
    const ring = [box([-1, 0, -1], [-0.8, 0.1, 1]), box([0.8, 0, -1], [1, 0.1, 1])];
    const post = box([-0.02, 0.5, -0.02], [0.02, 0.6, 0.02]);
    const wide = posedPart(
      Float64Array.from([...ring[0].v, ...ring[1].v]),
      Uint32Array.from([...ring[0].index, ...Array.from(ring[1].index, (i) => Number(i) + 8)]),
    );
    assert.ok(surfaceGap(post, wide, tol) > tol);
  });
});

/** A glb straight from the generator: a body and one limb swinging on `hinge`. */
function rig({ hinge_y, limb_y, float_y = null }: { hinge_y: number; limb_y: number; float_y?: number | null }): Uint8Array {
  const k = new Kit({ species_code: "rig-test", scientific_name: "rig test" }, { idleDur: 1.6 });
  const body = k.blob(k.root, { name: "body", rx: 0.2, ry: 0.2, rz: 0.2, at: [0, 0.4, 0], color: APP.green });
  /* `limb` runs along +Y from its node; rotX = PI hangs it downward from
     `limb_y`, and `pivot` puts the node (the hinge) at `hinge_y`. */
  const arm = k.limb(body, { name: "arm", r: 0.03, h: 0.25, at: [0.15, limb_y, 0], pivot: [0.15, hinge_y, 0], rotX: Math.PI, color: APP.orange });
  k.cute.swing(arm, { axis: "z", amp: 0.9 });
  if (float_y !== null) k.blob(body, { name: "moon", r: 0.03, at: [0, float_y, 0], color: APP.blue });
  return k.finish();
}

describe("auditConnectivity — every joint, at rest and in motion", () => {
  it("passes a limb hinged at its own cap, inside the body, through a wide swing", () => {
    const r = auditConnectivity(rig({ hinge_y: 0, limb_y: 0 }));
    assert.deepEqual([r.joint, r.island], [[], []]);
    assert.ok(r.pose > 10, "it sampled the clip, not just the rest pose");
  });

  it("catches a limb that meets the body at rest but swings off a mid-limb hinge", () => {
    /* The wrong-pivot bug: the arm starts inside the body, but its hinge is
       half way down it, so the swing carries its top clear of the body. */
    const r = auditConnectivity(rig({ hinge_y: -0.3, limb_y: 0 }));
    assert.ok(r.joint.length > 0 && r.joint.every((f: { is_rest: boolean }) => !f.is_rest));
    assert.equal(r.joint[0].part, "arm");
    assert.equal(r.joint[0].parent, "body");
    assert.equal(r.joint[0].clip, "idle");
  });

  it("catches a part that floats at rest", () => {
    const r = auditConnectivity(rig({ hinge_y: 0, limb_y: 0, float_y: 0.35 }));
    const moon = r.joint.find((f: { part: string }) => f.part === "moon");
    assert.ok(moon && moon.is_rest && moon.gap_share > CONNECT.joint_slack, JSON.stringify(r.joint));
  });
});

describe("the shipped models hold together", () => {
  const dir = new URL("../public/model/", import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL("species-model.json", dir), "utf8")) as { model: { file: string }[] };
  /* Every character file, the species the rig lane fixed (one per failure
     family: butterfly abdomen, jumping-spider eyes, slug keel, fish tail, and
     the flora sway and hole repair), and every 50th species for breadth. */
  const named = [
    "ypthima-stellera", "pterophyllum-scalare", "laevicaulis-alte", "plexippus-petersi",
    "maesa-perlarius", "polyscias-guilfoylei", "megathyrsus-maximus", "thaumatophyllum-bipinnatifidum",
    "gardenia-jasminoides", "cyathodium-smaragdinum",
  ].map((code) => `species/${code}.glb`);
  const sample = [...new Set([...CHARACTER_FILE, ...named, ...manifest.model.filter((_, i) => i % 50 === 0).map((m) => m.file)])];

  for (const file of sample) {
    it(`${file} is one piece at every keyframe`, () => {
      const r = auditConnectivity(readFileSync(new URL(file, dir)));
      assert.deepEqual([...r.joint, ...r.island].map((f: { part: string; clip: string; time: number; gap_share: number }) => `${f.part} ${f.clip}@${f.time} ${f.gap_share}`), []);
    });
  }

  it("the hiker carries both clips the map asks for", () => {
    const buf = readFileSync(new URL(HIKER_MODEL.replace("/model/", ""), dir));
    const length = new DataView(buf.buffer, buf.byteOffset).getUint32(12, true);
    const json = JSON.parse(new TextDecoder().decode(buf.subarray(20, 20 + length)));
    const clip = (json.animations as { name: string }[]).map((a) => a.name);
    assert.deepEqual(clip.sort(), [hikerClip(false), hikerClip(true)].sort());
  });
});

describe("avatar — the hiker is opt-in and can never leave the map empty", () => {
  it("is the stage sticker unless the URL asks for the hiker", () => {
    assert.equal(avatarFrom(""), "stage");
    assert.equal(avatarFrom("?time=day"), "stage");
    assert.equal(avatarFrom("?avatar=hikr"), "stage");
    assert.equal(avatarFrom("?avatar=hiker"), "hiker");
    assert.equal(avatarFrom("?boot=off&avatar=Hiker"), "hiker");
  });

  it("walks while walking and idles while not", () => {
    assert.equal(hikerClip(true), "walk");
    assert.equal(hikerClip(false), "idle");
  });

  it("turns the camera so the hiker faces its heading", () => {
    assert.equal(hikerOrbitDegree(0), 180); // walking up the screen: we see its back
    assert.equal(hikerOrbitDegree(180), 0); // walking toward us: its face
    assert.equal(hikerOrbitDegree(90), 270);
    assert.equal(hikerOrbitDegree(-90), 90);
    assert.equal(hikerOrbitDegree(Number.NaN), 180);
  });
});
