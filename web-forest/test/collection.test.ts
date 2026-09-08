import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { receiptHighlight, wildCollection } from "../src/collection.ts";
import { poolFromFile, type SpawnPoolEntry } from "../src/spawn.ts";
import { picker_order } from "../src/data.ts";
import type { Sighting } from "../src/journal.ts";

/**
 * The shelf of finds the guide never drew.
 *
 * The gap it closes: `journal_order` renders nine species with artwork, while
 * a walk can log any of 1,098. Everything outside the nine used to reach the
 * journal as a row in the log and a bare "+N more" beside the fraction.
 */

let seq = 0;
function sight(species_code: string, over: Partial<Sighting> = {}): Sighting {
  seq += 1;
  return {
    sighting_id: `c-${seq}`,
    species_code,
    photo_data: null,
    created_at: "2026-09-08T04:00:00.000Z",
    inat_scientific_name: null,
    inat_common_name: null,
    lat: 14.64,
    lon: 121.08,
    accuracy_m: 5,
    fix_source: "demo",
    note: null,
    walk_id: null,
    entry_kind: "badge",
    reported_name: null,
    entry_index: seq,
    ...over,
  };
}

function entry(species_code: string, over: Partial<SpawnPoolEntry> = {}): SpawnPoolEntry {
  return {
    species_code,
    common_name: species_code,
    scientific_name: `Genus ${species_code}`,
    count: 60,
    origin: "Unknown",
    iconic_taxon_name: "Plantae",
    archetype: "herb",
    file: `species/${species_code}.glb`,
    ...over,
  };
}

const CURATED = ["narra", "molave"];

describe("the wider collection", () => {
  it("is empty when nothing off-guide has been found", () => {
    const c = wildCollection([sight("narra")], [entry("narra")], CURATED);
    assert.equal(c.found_count, 0);
    assert.deepEqual(c.group, []);
    assert.equal(c.best, null);
  });

  it("never includes a curated species — that is the other shelf's job", () => {
    const pool = [entry("narra"), entry("wild-a")];
    const c = wildCollection([sight("narra"), sight("wild-a")], pool, CURATED);
    assert.deepEqual(c.group.flatMap((g) => g.row).map((f) => f.species_code), ["wild-a"]);
  });

  it("refuses a species the sweep does not know", () => {
    /* Otherwise a typo in a species_code becomes a collectable. */
    const c = wildCollection([sight("not-in-the-pool")], [entry("wild-a")], CURATED);
    assert.equal(c.found_count, 0);
  });

  it("refuses a contribution — a shelf you can fill by typing is not a collection", () => {
    /* A contribution carries a reported_name, not a verified species. */
    const row = [sight("wild-a", { entry_kind: "contribution", reported_name: "some fern" })];
    assert.equal(wildCollection(row, [entry("wild-a")], CURATED).found_count, 0);
  });

  it("counts a species once however often it was logged, and keeps the FIRST date", () => {
    const row = [
      sight("wild-a", { created_at: "2026-09-05T04:00:00.000Z" }),
      sight("wild-a", { created_at: "2026-09-01T04:00:00.000Z" }),
      sight("wild-a", { created_at: "2026-09-09T04:00:00.000Z" }),
    ];
    const c = wildCollection(row, [entry("wild-a")], CURATED);
    assert.equal(c.found_count, 1);
    const find = c.group[0].row[0];
    assert.equal(find.times, 3);
    assert.equal(find.first_at, "2026-09-01T04:00:00.000Z", "a collection records when you FIRST met it");
  });

  it("groups by what kind of living thing it is, not by name", () => {
    const pool = [
      entry("a-bird", { iconic_taxon_name: "Aves", archetype: "bird" }),
      entry("a-tree", { iconic_taxon_name: "Plantae", archetype: "tree" }),
      entry("a-moth", { iconic_taxon_name: "Insecta", archetype: "lepidoptera-moth" }),
    ];
    const c = wildCollection(pool.map((e) => sight(e.species_code)), pool, CURATED);
    assert.deepEqual(c.group.map((g) => g.kind), ["tree", "bird", "butterfly"]);
    assert.equal(c.found_count, 3);
  });

  it("orders rarest first inside a group, then oldest find first", () => {
    const pool = [
      entry("common-late", { count: 90 }),
      entry("mythic-one", { count: 1 }),
      entry("common-early", { count: 90 }),
      entry("rare-one", { count: 3 }),
    ];
    const row = [
      sight("common-late", { created_at: "2026-09-09T04:00:00.000Z" }),
      sight("mythic-one", { created_at: "2026-09-08T04:00:00.000Z" }),
      sight("common-early", { created_at: "2026-09-01T04:00:00.000Z" }),
      sight("rare-one", { created_at: "2026-09-07T04:00:00.000Z" }),
    ];
    const c = wildCollection(row, pool, CURATED);
    assert.deepEqual(
      c.group[0].row.map((f) => f.species_code),
      ["mythic-one", "rare-one", "common-early", "common-late"],
    );
    assert.equal(c.best, "mythic");
  });

  it("reports its own denominator and never borrows the curated one", () => {
    /* "n of 9" is the guide's checklist. This shelf is against the pool, and
       the two must not be folded together — that is the bug that printed
       "12 of 9 species seen". */
    const pool = [entry("wild-a"), entry("wild-b"), entry("wild-c")];
    const c = wildCollection([sight("wild-a")], pool, CURATED);
    assert.equal(c.pool_total, 3);
    assert.equal(c.found_count, 1);
    assert.ok(c.found_count <= c.pool_total);
  });

  it("carries the real campus count the rarity was derived from", () => {
    const c = wildCollection([sight("wild-a")], [entry("wild-a", { count: 7 })], CURATED);
    const find = c.group[0].row[0];
    assert.equal(find.campus_count, 7);
    assert.equal(find.rarity, "rare", "2..9 observations is the rare band");
  });

  it("cases the first word of a name and leaves the rest alone", () => {
    const pool = [
      entry("a", { common_name: "broadleaf carpetgrass" }),
      entry("b", { common_name: "Philippine Hanging-Parrot", iconic_taxon_name: "Aves" }),
    ];
    const c = wildCollection([sight("a"), sight("b")], pool, CURATED);
    const name = c.group.flatMap((g) => g.row).map((f) => f.common_name).sort();
    assert.deepEqual(name, ["Broadleaf carpetgrass", "Philippine Hanging-Parrot"]);
  });

  it("holds no field a ranking could be built from", () => {
    /* The standing rule survives this surface by construction. */
    const c = wildCollection([sight("wild-a")], [entry("wild-a")], CURATED);
    const key = new Set([...Object.keys(c), ...Object.keys(c.group[0].row[0])]);
    for (const banned of ["score", "points", "rank", "percentile", "level", "leaderboard", "streak"]) {
      assert.ok(!key.has(banned), `the collection grew a "${banned}" field`);
    }
  });

  it("runs against the real 1,098-species pool", () => {
    const manifest = JSON.parse(
      readFileSync(new URL("../public/model/species-model.json", import.meta.url), "utf8"),
    );
    const pool = poolFromFile(manifest);
    const wild = pool.filter((e) => !picker_order.includes(e.species_code)).slice(0, 5);
    const c = wildCollection(wild.map((e) => sight(e.species_code)), pool, picker_order);
    assert.equal(c.found_count, 5);
    assert.equal(c.pool_total, pool.length);
    assert.ok(c.pool_total >= 1000);
    /* Every find must resolve to a real name, or the shelf renders blanks. */
    for (const f of c.group.flatMap((g) => g.row)) {
      assert.ok(f.common_name.length > 0);
      assert.ok(f.scientific_name.length > 0);
    }
  });
});

describe("the walk receipt's species line", () => {
  const pool = [
    entry("crossandra-infundibuliformis", { common_name: "Firecracker-flower", count: 7 }),
    entry("rivina-humilis", { common_name: "pigeonberry", count: 218 }),
    entry("once-here", { common_name: "Something Rare", count: 1 }),
  ];
  const curated = new Map([["narra", "Narra"]]);

  it("resolves an off-guide find to its name, never to a raw slug", () => {
    /* The bug: the receipt printed `species[code] ?? code`, so a walk that met
       a pool species ended by showing "crossandra-infundibuliformis" — the last
       thing a walker reads, telling them the app does not know what they found. */
    const h = receiptHighlight(["crossandra-infundibuliformis"], pool, curated);
    assert.equal(h.row[0].name, "Firecracker-flower");
    assert.notEqual(h.row[0].name, h.row[0].species_code);
  });

  it("prefers the guide's name where the guide has one", () => {
    const h = receiptHighlight(["narra"], pool, curated);
    assert.equal(h.row[0].name, "Narra");
  });

  it("falls back to the code only when nothing knows the species", () => {
    const h = receiptHighlight(["ghost-species"], pool, curated);
    assert.equal(h.row[0].name, "ghost-species");
    assert.equal(h.row[0].rarity, null, "an unknown species gets no rarity claim");
    assert.equal(h.row[0].campus_count, null, "and no count we did not measure");
  });

  it("cases the first word of a sweep name", () => {
    const h = receiptHighlight(["rivina-humilis"], pool, curated);
    assert.equal(h.row[0].name, "Pigeonberry");
  });

  it("reports the rarest band the walk actually produced", () => {
    const h = receiptHighlight(["rivina-humilis", "once-here", "crossandra-infundibuliformis"], pool, curated);
    assert.equal(h.best, "mythic");
    /* And the order the walk recorded them in is preserved — a receipt is a
       record of what happened, not a ranking of it. */
    assert.deepEqual(h.row.map((r) => r.species_code), ["rivina-humilis", "once-here", "crossandra-infundibuliformis"]);
  });

  it("claims no rarity at all when nothing on the walk is in the pool", () => {
    assert.equal(receiptHighlight(["ghost-a", "ghost-b"], pool, curated).best, null);
  });

  it("returns nothing for a walk that logged nothing new", () => {
    const h = receiptHighlight([], pool, curated);
    assert.deepEqual(h.row, []);
    assert.equal(h.best, null);
  });
});
