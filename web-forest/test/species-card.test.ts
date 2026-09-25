/**
 * The 3D species card's pure half: which model a species code points at, what
 * the card shows when the model cannot be shown, and that opening it pays
 * Learn exactly once — under the same subject the Learn sheet already uses.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { species } from "../src/data.ts";
import { poolFromFile } from "../src/spawn.ts";
import { awardPoints, POINT_VALUE } from "../src/gamify.ts";
import { cardFact, chooseVisual, learnSubject, speciesModelPath } from "../src/species-card-core.ts";

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, "..", "public");
const pool = poolFromFile(JSON.parse(readFileSync(join(pub, "model", "species-model.json"), "utf8")));

test("model path comes off the manifest row and exists on disk", () => {
  const narra = pool.find((e) => e.species_code === "narra")!;
  const path = speciesModelPath("narra", narra.file, true);
  assert.equal(path, "/model/species/narra.glb");
  assert.ok(existsSync(join(pub, path!.slice(1))), "narra.glb is in public/");
  /* Every pool row resolves to a real file — the card never points at a 404. */
  for (const e of pool) {
    const p = speciesModelPath(e.species_code, e.file, false);
    assert.ok(p, `no path for ${e.species_code}`);
    assert.ok(existsSync(join(pub, p!.slice(1))), `missing ${p}`);
  }
});

test("model path refuses odd files and unknown non-curated codes", () => {
  assert.equal(speciesModelPath("x", "../secret.glb", false), null);
  assert.equal(speciesModelPath("x", "species/x.gltf", false), null);
  assert.equal(speciesModelPath("not-in-pack", undefined, false), null);
  /* Pool not loaded yet: a curated code still resolves (the pack test
     guarantees every curated code is modeled as species/<code>.glb). */
  assert.equal(speciesModelPath("molave", undefined, true), "/model/species/molave.glb");
  for (const code of Object.keys(species)) {
    const p = speciesModelPath(code, undefined, true)!;
    assert.ok(existsSync(join(pub, p.slice(1))), `curated ${code} derived path exists`);
  }
});

test("fallback: no model, offline, error — each says why", () => {
  const path = "/model/species/narra.glb";
  assert.deepEqual(chooseVisual({ model_path: path, is_online: true, model_state: "loading" }), { visual: "model", note: null });
  assert.deepEqual(chooseVisual({ model_path: path, is_online: true, model_state: "loaded" }), { visual: "model", note: null });
  assert.deepEqual(chooseVisual({ model_path: path, is_online: false, model_state: "loading" }), {
    visual: "portrait",
    note: "3D needs a connection.",
  });
  /* Already in memory: dropping the connection does not take it away. */
  assert.equal(chooseVisual({ model_path: path, is_online: false, model_state: "loaded" }).visual, "model");
  assert.equal(chooseVisual({ model_path: path, is_online: true, model_state: "error" }).visual, "portrait");
  const none = chooseVisual({ model_path: null, is_online: true, model_state: "loading" });
  assert.equal(none.visual, "portrait");
  assert.ok(none.note);
});

test("card facts: curated names win, rarity comes from the real count", () => {
  const narra_row = pool.find((e) => e.species_code === "narra")!;
  const f = cardFact("narra", species.narra, narra_row);
  assert.equal(f.common_name, species.narra.common_name);
  assert.equal(f.kind_label, "Tree");
  assert.equal(f.campus_count, narra_row.count);
  assert.equal(f.rarity, "common");
  assert.equal(f.is_curated, true);

  const wild = pool.find((e) => !species[e.species_code] && e.count === 1)!;
  const w = cardFact(wild.species_code, undefined, wild);
  assert.equal(w.rarity_label, "Once on campus");
  assert.equal(w.is_curated, false);
  assert.ok(w.model_path);

  /* A missing count is not a rarity, and never "Once on campus". */
  const f2 = cardFact("ghost", undefined, { ...wild, species_code: "ghost", count: null });
  assert.equal(f2.rarity, null);
});

test("opening the card pays Learn once, and not again after the Learn sheet", () => {
  /* The Learn sheet awards under `species:<code>`; the card must use the same key. */
  assert.equal(learnSubject("narra"), "species:narra");
  const sheet = awardPoints([], "learn", "species:narra", "2026-09-26T01:00:00Z");
  assert.equal(sheet.awarded, true);
  const card = awardPoints(sheet.events, "learn", learnSubject("narra"), "2026-09-26T01:01:00Z");
  assert.equal(card.awarded, false);
  const again = awardPoints(card.events, "learn", learnSubject("narra"));
  assert.equal(again.awarded, false);
  assert.equal(again.total_points, POINT_VALUE.learn);
  /* A different species is a different Learn. */
  assert.equal(awardPoints(again.events, "learn", learnSubject("molave")).awarded, true);
});
