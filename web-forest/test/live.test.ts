import assert from "node:assert/strict";
import { test } from "node:test";
import {
  rankSpawn,
  reachableSpawn,
  REACH_RADIUS_M,
  windowMinuteLeft,
  RARITY_ORDER,
  type Spawn,
} from "../src/spawn.ts";
import { CAMPUS_CENTER, distanceMeter } from "../src/geo.ts";
import { displayName, kindOf, KIND_LABEL } from "../src/kind.ts";
import { aisDueNote } from "../src/data.ts";

/**
 * The live layer's contract.
 *
 * `live.tsx` cannot be imported here — the runner strips types but cannot parse
 * JSX — so every rule the strip depends on lives in `spawn.ts` and is pinned
 * from there. That split is the same one `pin.ts` and `stage.ts` already make.
 */

/** A spawn `offset_m` metres north of campus centre. */
function at(offset_m: number, over: Partial<Spawn> = {}): Spawn {
  return {
    spawn_id: `s-${offset_m}`,
    species_code: "narra",
    common_name: "Narra",
    lat: CAMPUS_CENTER.lat + offset_m / 111_320,
    lon: CAMPUS_CENTER.lon,
    sector_code: "sec-1",
    rarity: "common",
    iconic_taxon_name: "Plantae",
    archetype: "tree",
    starts_at: "2026-09-08T00:00:00.000Z",
    ends_at: "2026-09-08T00:30:00.000Z",
    ...over,
  };
}

test("with a fix the strip is nearest-first and every distance is measured", () => {
  const row = rankSpawn([at(300), at(20), at(120)], CAMPUS_CENTER, 3);
  assert.deepEqual(
    row.map((r) => r.row.spawn_id),
    ["s-20", "s-120", "s-300"],
  );
  for (const r of row) {
    assert.equal(typeof r.distance_m, "number");
    assert.ok(Math.abs((r.distance_m as number) - distanceMeter(CAMPUS_CENTER, r.row)) < 0.5);
  }
});

test("without a fix it switches to rarest-first and reports no distance rather than zero", () => {
  const row = rankSpawn(
    [at(10, { spawn_id: "c", rarity: "common" }), at(20, { spawn_id: "m", rarity: "mythic" }), at(30, { spawn_id: "r", rarity: "rare" })],
    null,
    3,
  );
  assert.deepEqual(
    row.map((r) => r.row.spawn_id),
    ["m", "r", "c"],
  );
  /* The failure this refuses: a nullable distance rendered as a confident 0 m.
     Same rule the walk receipt follows for a no-fix walk. */
  assert.ok(row.every((r) => r.distance_m === null));
});

test("ranking is stable when two finds share a rarity", () => {
  const a = rankSpawn([at(1, { spawn_id: "b" }), at(2, { spawn_id: "a" })], null, 2);
  assert.deepEqual(a.map((r) => r.row.spawn_id), ["a", "b"]);
});

test("the limit is honoured in both modes", () => {
  const many = [at(10), at(20), at(30), at(40), at(50)];
  assert.equal(rankSpawn(many, CAMPUS_CENTER, 2).length, 2);
  assert.equal(rankSpawn(many, null, 2).length, 2);
});

test("reach is a measured radius, and no fix means nothing is reachable", () => {
  const world = [at(5), at(REACH_RADIUS_M - 1), at(REACH_RADIUS_M + 30)];
  const near = reachableSpawn(world, CAMPUS_CENTER);
  assert.deepEqual(near.map((r) => r.spawn_id), ["s-5", `s-${REACH_RADIUS_M - 1}`]);
  /* Without a position we cannot claim anyone is standing at anything. */
  assert.deepEqual(reachableSpawn(world, null), []);
  assert.deepEqual(reachableSpawn(world, undefined), []);
});

test("the window countdown never goes negative", () => {
  const ends = "2026-09-08T00:30:00.000Z";
  assert.equal(windowMinuteLeft(ends, Date.parse("2026-09-08T00:00:00.000Z")), 30);
  assert.equal(windowMinuteLeft(ends, Date.parse("2026-09-08T00:29:10.000Z")), 1);
  assert.equal(windowMinuteLeft(ends, Date.parse("2026-09-08T01:00:00.000Z")), 0);
});

test("rarity order runs common to mythic, so the dot count reads as scarcity", () => {
  assert.deepEqual(RARITY_ORDER, ["common", "uncommon", "rare", "mythic"]);
});

test("a find says what group it is, and the finer archetype outranks the iconic taxon", () => {
  assert.equal(kindOf("Aves", "bird"), "bird");
  assert.equal(kindOf("Plantae", "herb"), "plant");
  /* The failure this refuses: 1,073 uncurated species all drawing as the one
     plant silhouette, which says "plant" about a bird. */
  assert.equal(kindOf("Plantae", "tree-balete"), "tree");
  assert.equal(kindOf("Fungi", "mushroom"), "fungus");
  assert.equal(kindOf("Fungi", "mushroom-bracket"), "bracket");
  assert.equal(kindOf("Insecta", "lepidoptera-moth"), "butterfly");
  assert.equal(kindOf("Insecta", "coleoptera"), "insect");
  assert.equal(kindOf("Arachnida", "spider-jumping"), "spider");
  assert.equal(kindOf("Chromista", "unknown"), "other");
});

test("every kind the pool can produce has a label", () => {
  for (const iconic of ["Plantae", "Insecta", "Fungi", "Arachnida", "Aves", "Animalia", "Actinopterygii", "Mollusca", "Reptilia", "Amphibia", "Mammalia"]) {
    const k = kindOf(iconic, "unknown");
    assert.ok(KIND_LABEL[k], `${iconic} -> ${k} has no label`);
  }
});

test("display casing fixes the first word and never touches a proper one after it", () => {
  assert.equal(displayName("broadleaf carpetgrass"), "Broadleaf carpetgrass");
  assert.equal(displayName("Great Eggfly"), "Great Eggfly");
  /* Must NOT become "Philippine Hanging-parrot". */
  assert.equal(displayName("Philippine Hanging-Parrot"), "Philippine Hanging-Parrot");
  assert.equal(displayName(""), "");
});

test("the AIS date note stops claiming a future that has passed", () => {
  /* Four user-visible strings hard-coded "due 09-09". On Saturday the app
     would have told judges an inventory was still forthcoming three days after
     it was expected — stale at best, a quiet overclaim at worst. The phrasing
     is derived now, so it corrects itself on stage. */
  const before = aisDueNote(new Date("2026-09-08T10:00:00+08:00"));
  const on_the_day = aisDueNote(new Date("2026-09-09T18:00:00+08:00"));
  const after = aisDueNote(new Date("2026-09-12T09:00:00+08:00"));

  assert.equal(before, "due 09-09");
  assert.equal(on_the_day, "due 09-09", "it is still due on the day itself");
  assert.equal(after, "expected 09-09, not yet received");
  /* The failure this refuses: the word "due" surviving past the date. */
  assert.ok(!after.includes("due "));
});
