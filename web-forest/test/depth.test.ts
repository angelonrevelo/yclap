import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { byDepth, isCovering } from "../src/depth.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const flora = readFileSync(join(root, "src/flora.tsx"), "utf8");
const play_map = readFileSync(join(root, "src/play-map.tsx"), "utf8");

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
    assert.doesNotMatch(flora, /filter:\s*is_night/);
    assert.match(flora, /NIGHT_TONE/);
  });
});
