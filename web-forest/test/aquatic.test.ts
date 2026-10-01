import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { isAquatic, POND_RING, pondSpawn } from "../src/aquatic.ts";
import { distanceMeter } from "../src/geo.ts";
import { isWalkable } from "../src/placement.ts";
import { poolFromFile, spawnWorld } from "../src/spawn.ts";

/* ── underwater finds (Gelo 10-01: "or even underwater species") ── */

const pool = poolFromFile(JSON.parse(readFileSync(new URL("../public/model/species-model.json", import.meta.url), "utf8")));
const NOW = Date.parse("2026-10-10T04:10:00Z");

function inRing(p: { lat: number; lon: number }, ring: { lat: number; lon: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [a, b] = [ring[i], ring[j]];
    if (a.lat > p.lat !== b.lat > p.lat && p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon) inside = !inside;
  }
  return inside;
}
const toBank = (p: { lat: number; lon: number }) => Math.min(...POND_RING.map((q) => distanceMeter(p, q)));

describe("underwater finds", () => {
  it("the campus record has water life, and only fish and the apple snail count as aquatic", () => {
    const aquatic = pool.filter(isAquatic);
    assert.ok(aquatic.length >= 5);
    assert.ok(aquatic.every((e) => e.archetype === "fish" || e.species_code === "pomacea-canaliculata"));
    assert.ok(!pool.filter((e) => e.archetype === "frog").some(isAquatic), "frogs live at the edge, on land");
  });

  it("each window puts two IN the pond, within reach of the bank, the same on every phone", () => {
    for (const t of [NOW, NOW + 30 * 60 * 1000, NOW + 6 * 3600 * 1000]) {
      const got = pondSpawn(pool, t);
      assert.equal(got.length, 2);
      assert.notEqual(got[0].species_code, got[1].species_code);
      for (const s of got) {
        assert.ok(s.is_underwater);
        assert.ok(inRing(s, POND_RING), `${s.species_code} is in the water`);
        assert.ok(!isWalkable(s), "nobody stands there");
        assert.ok(toBank(s) <= 8, "reachable from the bank (AT_TREE_RADIUS_M)");
      }
      assert.deepEqual(pondSpawn(pool, t), got);
    }
  });

  it("the land world built from the land pool never stands a fish on a lawn", () => {
    const land = spawnWorld(pool.filter((e) => !isAquatic(e)), NOW, { lat: 14.6386, lon: 121.0762 });
    assert.ok(land.length > 0);
    assert.ok(!land.some((s) => isAquatic(s)));
  });
});
