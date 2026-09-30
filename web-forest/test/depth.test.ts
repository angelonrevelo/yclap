import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { byDepth, isBuildingOverWalker, isCovering, isOverWalker } from "../src/depth.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const flora = readFileSync(join(root, "src/flora.tsx"), "utf8");
const play_map = readFileSync(join(root, "src/play-map.tsx"), "utf8");
const toon = readFileSync(join(root, "src/toon.tsx"), "utf8");

/**
 * The 09-26 layering regression: trees were drawn on the glass and finds in
 * the tilted plane, which paints under the whole glass — so every tree covered
 * every find, including trees standing behind it.
 */
describe("depth on the glass", () => {
  it("paints further up the glass first", () => {
    const row = [
      { name: "near tree", y: 600 },
      { name: "far find", y: 320 },
      { name: "middle tree", y: 450 },
    ];
    assert.deepEqual(
      [...row].sort(byDepth).map((r) => r.name),
      ["far find", "middle tree", "near tree"],
    );
  });

  it("a tree in front of a find, over it, covers it", () => {
    const find = { x: 100, y: 400, w: 40, h: 50 };
    assert.equal(isCovering({ x: 110, y: 430, w: 60, h: 90 }, find), true);
  });

  it("a tree BEHIND a find never covers it, however tall", () => {
    const find = { x: 100, y: 400, w: 40, h: 50 };
    assert.equal(isCovering({ x: 100, y: 380, w: 80, h: 200 }, find), false);
  });

  it("a tree in front but off to the side, or too short to reach, does not", () => {
    const find = { x: 100, y: 400, w: 40, h: 50 };
    assert.equal(isCovering({ x: 300, y: 430, w: 60, h: 90 }, find), false);
    assert.equal(isCovering({ x: 100, y: 460, w: 60, h: 40 }, find), false);
  });

  it("finds are placed on the glass with toScreenFind and painted in one list with the trees", () => {
    assert.match(play_map, /const toScreenFind = \(point: LatLon\)/);
    assert.match(play_map, /find=\{glass_find\}/);
    /* The old in-plane markers counter-rotated out of the plane. None may be left. */
    assert.doesNotMatch(play_map, /rotateX\(\$\{-tilt_degree\}deg\)/);
    assert.match(flora, /standee\.sort\(byDepth\)/);
  });

  it("night does not put a CSS filter on each tree", () => {
    /* The grade lives with the trees' colours, never a per-tree filter. (The
       Mac's toon-kit trees did not come across in the 10-02 merge: this
       build's flora carries the distance fog and cull; `toon.tsx` is kept.) */
    assert.doesNotMatch(flora, /filter:\s*is_night/);
    assert.match(toon, /NIGHT_TONE/);
  });
});

describe("isOverWalker", () => {
  const walker = { x: 200, y: 500 };
  it("a standee nearer the camera and over the walker is over them", () => {
    assert.equal(isOverWalker({ x: 210, y: 540, w: 60, h: 90 }, walker), true);
  });
  it("one further away never is, however it overlaps", () => {
    assert.equal(isOverWalker({ x: 200, y: 480, w: 200, h: 300 }, walker), false);
  });
  it("one off to the side is not", () => {
    assert.equal(isOverWalker({ x: 360, y: 540, w: 60, h: 90 }, walker), false);
  });
  it("one too short to reach up past the walker's feet is not", () => {
    assert.equal(isOverWalker({ x: 200, y: 540, w: 60, h: 30 }, walker), false);
  });
  it("no walker, nothing is over them", () => {
    assert.equal(isOverWalker({ x: 200, y: 540, w: 60, h: 90 }, null), false);
  });
});

describe("isBuildingOverWalker", () => {
  /* A footprint on the glass: a box from x 100..300, ground y 560..620. */
  const ring = [
    { x: 100, y: 560 },
    { x: 300, y: 560 },
    { x: 300, y: 620 },
    { x: 100, y: 620 },
  ];
  it("a building whose near edge is below the walker's feet and rises past them is over them", () => {
    assert.equal(isBuildingOverWalker(ring, 480, { x: 200, y: 540 }), true);
  });
  it("one the walker stands in front of is not", () => {
    assert.equal(isBuildingOverWalker(ring, 480, { x: 200, y: 660 }), false);
  });
  it("one off to the side is not", () => {
    assert.equal(isBuildingOverWalker(ring, 480, { x: 360, y: 540 }), false);
  });
  it("a low one that never reaches the walker's feet is not", () => {
    assert.equal(isBuildingOverWalker(ring, 550, { x: 200, y: 540 }), false);
  });
});
