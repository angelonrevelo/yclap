/**
 * The species-model pack: one cute animated .glb per campus species.
 *
 * What this test guards (spec culture: nothing is done without a fresh exit
 * code):
 *   1. coverage — every species in the cached iNaturalist campus sweep AND
 *      every curated `data.ts` species has a manifest row and a model file;
 *   2. honesty — the manifest carries provenance, marks which colors are
 *      observed vs derived, and never claims to be the AIS inventory;
 *   3. validity — every .glb parses, is flat-shaded low-poly sized for
 *      on-demand loading, and carries exactly one looping "idle" clip;
 *   4. naming — singular collection keys per the repo convention.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { species as curated } from "../src/data.ts";

const here = dirname(fileURLToPath(import.meta.url));
const modelDir = join(here, "..", "public", "model");
const manifest = JSON.parse(readFileSync(join(modelDir, "species-model.json"), "utf8"));

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();

function glbJson(path: string): { json: any; bytes: number } {
  const buf = readFileSync(path);
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  assert.equal(dv.getUint32(0, true), 0x46546c67, "glTF magic");
  assert.equal(dv.getUint32(4, true), 2, "glTF version 2");
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(Buffer.from(buf.subarray(20, 20 + jsonLen)).toString("utf8"));
  return { json, bytes: buf.byteLength };
}

test("manifest carries provenance and never claims to be the AIS survey", () => {
  assert.ok(manifest._comment.includes("iNaturalist"), "species-list source named");
  assert.ok(manifest._comment.includes("AIS"), "AIS supersession stated");
  assert.ok(manifest.generated_at, "generated_at present");
  assert.ok(manifest.campus_box?.nelat, "campus box recorded");
  assert.ok(manifest.attribution?.models, "model provenance recorded");
  assert.equal(manifest.counts.failed, 0, "no failed builds swept under the rug");
});

test("singular collection naming in the manifest", () => {
  assert.ok(Array.isArray(manifest.model), "collection key is `model`");
  for (const key of Object.keys(manifest)) {
    assert.ok(!/^(models|species|entries)$/.test(key), `no plural collection key: ${key}`);
  }
});

test("every curated data.ts species has a model", () => {
  const codes = new Set(manifest.model.map((e: any) => e.species_code));
  for (const [code, s] of Object.entries(curated)) {
    assert.ok(codes.has(code), `curated species missing: ${code}`);
    const row = manifest.model.find((e: any) => e.species_code === code);
    assert.equal(row.scientific_name, (s as any).scientific_name);
  }
});

test("every iNaturalist sweep species is modeled (the exhaustive claim)", () => {
  const sweepPath = join(here, "..", "script", "data", "inat-species", "species-counts-2026-09-03.json");
  assert.ok(existsSync(sweepPath), "cached iNat sweep present");
  const sweep = JSON.parse(readFileSync(sweepPath, "utf8"));
  const expected = sweep.result
    .filter((r: any) => ["species", "hybrid", "complex"].includes(r.taxon.rank))
    .filter((r: any) => norm(r.taxon.name) !== "homo sapiens")
    .map((r: any) => norm(r.taxon.name));
  const modeled = new Set<string>(manifest.model.map((e: any) => norm(e.scientific_name)));
  for (const sci of expected) {
    assert.ok(modeled.has(sci), `iNat species without a model: ${sci}`);
  }
  // and the merge must not have invented extras beyond the two sources
  const curatedSci = new Set(Object.values(curated).map((s: any) => norm(s.scientific_name)));
  const sweepSet = new Set(expected);
  for (const sci of modeled) {
    assert.ok(sweepSet.has(sci) || curatedSci.has(sci), `model from no known source: ${sci}`);
  }
  assert.equal(manifest.counts.modeled_species, manifest.model.length);
});

test("no humans in the pack", () => {
  for (const e of manifest.model) {
    assert.notEqual(norm(e.scientific_name), "homo sapiens");
  }
});

test("every model file exists, parses, stays small, and carries one idle clip", () => {
  assert.ok(manifest.model.length > 1000, "the pack is the exhaustive set, not a sample");
  for (const e of manifest.model) {
    const path = join(modelDir, e.file);
    assert.ok(existsSync(path), `missing file: ${e.file}`);
    const { json, bytes } = glbJson(path);
    assert.ok(bytes > 400, `suspiciously tiny: ${e.file}`);
    assert.ok(bytes <= 120 * 1024, `too big for on-demand loading: ${e.file} ${(bytes / 1024).toFixed(0)} kB`);
    assert.equal(json.asset.version, "2.0");
    assert.ok(json.scenes?.[0]?.nodes?.length >= 1, `empty scene: ${e.file}`);
    assert.ok(json.meshes.length >= 1, `no meshes: ${e.file}`);
    assert.equal(json.animations?.length, 1, `exactly one clip: ${e.file}`);
    assert.equal(json.animations[0].name, "idle", `clip must be named idle: ${e.file}`);
    for (const mesh of json.meshes) {
      const prim = mesh.primitives[0];
      assert.ok(prim.attributes.POSITION !== undefined, "has positions");
      assert.ok(prim.attributes.COLOR_0 !== undefined, "has vertex colors (no textures in this pack)");
    }
    assert.ok(e.archetype && e.archetype.length > 0, "archetype recorded");
    assert.ok(["known", "derived"].includes(e.palette_source), "palette_source honest");
    assert.ok(e.display_scale_m > 0, "display scale hint present");
  }
});

test("model files on disk are all in the manifest (no orphans)", () => {
  const disk = new Set(readdirSync(join(modelDir, "species")).map((f) => `species/${f}`));
  const listed = new Set(manifest.model.map((e: any) => e.file));
  for (const f of disk) assert.ok(listed.has(f), `orphan model file: ${f}`);
});

test("companion character stages exist at the CHARACTER_MODEL_SLOT paths", () => {
  for (const f of ["character.glb", "character-egg.glb", "character-seedling.glb", "character-sapling.glb", "character-tree.glb"]) {
    const path = join(modelDir, f);
    assert.ok(existsSync(path), `missing ${f}`);
    const { json } = glbJson(path);
    assert.equal(json.animations?.length, 1);
    assert.equal(json.animations[0].name, "idle");
  }
});
