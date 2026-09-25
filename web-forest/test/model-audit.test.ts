import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { auditGlb, auditPack, groundOffset, LIMIT } from "../script/audit-model.mjs";

/* ── the rules this file guards (09-25: "the 3D models, the GLBs … final") ──
 *
 * Every .glb the app can ask for is a real glTF 2.0 binary with a mesh in it,
 * small enough for campus data, not flat, standing on the ground plane, and
 * listed by the manifest exactly once. The pack test runs the same audit as
 * `npm run audit:model`, so a regression fails `npm test`, not a demo.
 */

/** A minimal valid glb: one triangle, `lift` metres above y=0, in a node. */
function tinyGlb({ lift = 0, flat = false, magic = 0x46546c67, extra_count = 0 } = {}): Uint8Array {
  const y = flat ? 0 : 1;
  const position = new Float32Array([0, lift, 0, 1, lift, 0, 0, lift + y, 1]);
  const bin = new Uint8Array(position.buffer);
  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 4 }] }],
    accessors: [
      { bufferView: 0, componentType: 5126, type: "VEC3", count: 3 + extra_count, min: [0, lift, 0], max: [1, lift + y, 1] },
    ],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: bin.byteLength }],
    buffers: [{ byteLength: bin.byteLength }],
  };
  let text = JSON.stringify(json);
  while (text.length % 4) text += " ";
  const json_byte = new TextEncoder().encode(text);
  const total = 12 + 8 + json_byte.byteLength + 8 + bin.byteLength;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, magic, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, json_byte.byteLength, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(json_byte, 20);
  const bin_at = 20 + json_byte.byteLength;
  dv.setUint32(bin_at, bin.byteLength, true);
  dv.setUint32(bin_at + 4, 0x004e4942, true);
  out.set(bin, bin_at + 8);
  return out;
}

describe("auditGlb — one file", () => {
  it("passes a clean triangle and reports its triangles and bounds", () => {
    const r = auditGlb(tinyGlb());
    assert.deepEqual(r.flag, []);
    assert.equal(r.triangle, 1);
    assert.equal(r.mesh, 1);
    assert.deepEqual(r.bound, { min: [0, 0, 0], max: [1, 1, 1] });
  });

  it("calls a wrong magic broken instead of throwing", () => {
    assert.deepEqual(auditGlb(tinyGlb({ magic: 0x12345678 })).flag, ["broken"]);
  });

  it("catches an accessor that reaches past its buffer", () => {
    const r = auditGlb(tinyGlb({ extra_count: 5 }));
    assert.deepEqual(r.flag, ["broken"]);
    assert.match(r.problem[0], /accessor 0/);
  });

  it("catches a truncated file", () => {
    const whole = tinyGlb();
    assert.ok(auditGlb(whole.subarray(0, whole.byteLength - 8)).flag.includes("broken"));
  });

  it("flags zero-size bounds as degenerate", () => {
    assert.ok(auditGlb(tinyGlb({ flat: true })).flag.includes("degenerate"));
  });

  it("flags a walker that floats, but lets a flyer hover", () => {
    assert.ok(auditGlb(tinyGlb({ lift: 0.3 })).flag.includes("ungrounded"));
    assert.deepEqual(auditGlb(tinyGlb({ lift: 0.3 }), { is_flyer: true }).flag, []);
  });

  it("flags anything sunk through the floor, flyer or not", () => {
    assert.ok(auditGlb(tinyGlb({ lift: -0.3 }), { is_flyer: true }).flag.includes("ungrounded"));
  });
});

describe("groundOffset — the rule the builder fixes by and the audit checks by", () => {
  it("leaves a model inside the slack alone", () => {
    assert.equal(groundOffset({ min: [0, 0.01, 0], max: [1, 1, 1] }), 0);
  });
  it("returns the shift that puts the lowest point on y=0", () => {
    assert.equal(groundOffset({ min: [0, 0.2, 0], max: [1, 1, 1] }), -0.2);
    assert.equal(groundOffset({ min: [0, -0.2, 0], max: [1, 1, 1] }), 0.2);
  });
  it("lets the companion's half-buried soil mound stay buried", () => {
    assert.equal(groundOffset({ min: [0, -0.2, 0], max: [1, 1, 1] }, false, true), 0);
  });
});

describe("the shipped pack", () => {
  const report = auditPack();

  it("has no missing, broken, empty, oversize, degenerate or ungrounded model", () => {
    const bad = report.row.filter((r: { flag: string[] }) => r.flag.length);
    assert.deepEqual(
      bad.map((r: { file: string; flag: string[] }) => `${r.file}: ${r.flag.join(",")}`),
      [],
    );
  });

  it("references every .glb on disk exactly once — no orphans, no duplicates", () => {
    assert.deepEqual(report.orphan, []);
    assert.deepEqual(report.duplicate, []);
  });

  it("covers the whole manifest plus the five character slots", () => {
    assert.ok(report.summary.file > 1000);
    assert.ok(report.row.some((r: { file: string }) => r.file === "character-tree.glb"));
    assert.ok(report.summary.byte_max <= LIMIT.max_byte);
  });
});
