import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isLocalVerified, localObsStatus, observeAwardKind } from "../src/gamify.ts";
import { progressOf, type Sighting } from "../src/journal.ts";
import { titleName } from "../src/kind.ts";
import { trayRow } from "../src/nearby.ts";
import type { Spawn } from "../src/spawn.ts";

/* The 09-26 final-playtest leftovers that have a rule behind them, not just a
   pixel: the demo reply never verifies, "photographed" counts photos, and the
   Nearby tray lists a species once in readable casing. */

function make(over: Partial<Sighting>): Sighting {
  return {
    sighting_id: "narra-1",
    species_code: "narra",
    photo_data: null,
    created_at: "2026-09-26T01:00:00.000Z",
    inat_scientific_name: null,
    inat_common_name: null,
    lat: null,
    lon: null,
    accuracy_m: null,
    fix_source: null,
    note: null,
    walk_id: null,
    entry_kind: "badge",
    reported_name: null,
    entry_index: 1,
    ...over,
  };
}

function spawnOf(spawn_id: string, species_code: string, common_name = species_code): Spawn {
  return {
    spawn_id,
    species_code,
    common_name,
    scientific_name: "",
    lat: 14.64,
    lon: 121.078,
    sector_code: "x",
    rarity: null,
    iconic_taxon_name: "Plantae",
    archetype: "tree",
    starts_at: "2026-09-26T00:00:00.000Z",
    ends_at: "2026-09-26T00:30:00.000Z",
  };
}

describe("a recorded demo identification never verifies", () => {
  const photo = "data:image/jpeg;base64,xx";
  it("photo + species is verified only when the pick was a live read", () => {
    assert.equal(isLocalVerified({ photo_data: photo, species_code: "narra" }), true);
    assert.equal(isLocalVerified({ photo_data: photo, species_code: "narra", is_demo_id: true }), false);
  });
  it("the award and the journal status follow it", () => {
    assert.equal(observeAwardKind({ photo_data: photo, species_code: "narra", is_demo_id: true }), "observe");
    assert.equal(localObsStatus({ photo_data: photo, species_code: "narra", is_demo_id: true }), "needs_id");
  });
});

describe("species photographed counts photos", () => {
  it("counts distinct species with a photo, not every species logged", () => {
    const row = [
      make({ sighting_id: "a", species_code: "narra", photo_data: "data:x" }),
      make({ sighting_id: "b", species_code: "molave" }),
      make({ sighting_id: "c", species_code: "banaba" }),
      make({ sighting_id: "d", species_code: "narra", photo_data: "data:y" }),
    ];
    const p = progressOf(row);
    assert.equal(p.seen_count, 3);
    assert.equal(p.photographed_count, 1);
  });
  it("a report with a photo is not a species photographed", () => {
    const p = progressOf([make({ entry_kind: "contribution", photo_data: "data:x", reported_name: "?" })]);
    assert.equal(p.photographed_count, 0);
  });
});

describe("the Nearby tray", () => {
  it("lists a species once, nearest first, with how many are out", () => {
    const got = trayRow([
      spawnOf("1", "palm", "Macarthur palm"),
      spawnOf("2", "narra"),
      spawnOf("3", "palm", "Macarthur palm"),
    ]);
    assert.deepEqual(
      got.map((r) => [r.spawn.spawn_id, r.find_count]),
      [
        ["1", 2],
        ["2", 1],
      ],
    );
  });
  it("caps at the limit AFTER de-duplicating", () => {
    const spawn = [spawnOf("a", "x"), spawnOf("b", "x"), spawnOf("c", "y"), spawnOf("d", "z")];
    assert.deepEqual(trayRow(spawn, 2).map((r) => r.spawn.species_code), ["x", "y"]);
  });
});

describe("titleName — display casing only", () => {
  it("raises first letters and lowers nothing", () => {
    assert.equal(titleName("aji pepper"), "Aji Pepper");
    assert.equal(titleName("wishbone flower"), "Wishbone Flower");
    assert.equal(titleName("Philippine hanging-parrot"), "Philippine Hanging-Parrot");
    assert.equal(titleName("Yellow Flame Tree"), "Yellow Flame Tree");
    assert.equal(titleName("IUCN red list (vulnerable)"), "IUCN Red List (Vulnerable)");
    assert.equal(titleName(""), "");
  });
});
