/**
 * One display name for a sweep species everywhere it is listed: the Nearby
 * tray, the hunt chip and the day's hunt card all call speciesLabelOf. The
 * round-4 playtest found the hunt chip saying "forest fever tree", "Rain tree"
 * and a bare "Wendlandia uvariifolia" beside Nearby's "Rain Tree".
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { speciesLabelOf } from "../src/kind.ts";
import { dailyTaskFor } from "../src/gamify.ts";
import type { SpawnPoolEntry } from "../src/spawn.ts";

test("a common name is Title Case, and never italic", () => {
  assert.deepEqual(speciesLabelOf("forest fever tree", "Anthocephalus chinensis"), { text: "Forest Fever Tree", is_scientific: false });
  assert.deepEqual(speciesLabelOf("Rain tree", "Samanea saman"), { text: "Rain Tree", is_scientific: false });
  assert.equal(speciesLabelOf("Rain Tree", "Samanea saman").text, speciesLabelOf("Rain tree", "Samanea saman").text);
});

test("no common name → the scientific name, flagged for italics", () => {
  assert.deepEqual(speciesLabelOf("Wendlandia uvariifolia", "Wendlandia uvariifolia"), {
    text: "Wendlandia uvariifolia",
    is_scientific: true,
  });
  assert.deepEqual(speciesLabelOf("", "Wendlandia uvariifolia"), { text: "Wendlandia uvariifolia", is_scientific: true });
  assert.deepEqual(speciesLabelOf(null, "Wendlandia uvariifolia"), { text: "Wendlandia uvariifolia", is_scientific: true });
});

test("the daily hunt carries the scientific name, so the chip can label it the same way", () => {
  const pool: SpawnPoolEntry[] = [
    {
      species_code: "wendlandia",
      common_name: "Wendlandia uvariifolia",
      scientific_name: "Wendlandia uvariifolia",
      count: 3,
      origin: "native",
      iconic_taxon_name: "Plantae",
      archetype: "tree",
      file: "x.glb",
    },
  ];
  const task = dailyTaskFor(pool, [{ sector_code: "s1", name: "Grounds", is_biome: true }], new Date("2026-09-26T04:00:00Z"), "p", []);
  assert.ok(task);
  assert.deepEqual(speciesLabelOf(task.common_name, task.scientific_name), { text: "Wendlandia uvariifolia", is_scientific: true });
});
