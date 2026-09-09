import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { demoJournal, isSeededJournal, DEMO_PREFIX } from "../src/demo-seed.ts";
import { poolFromFile, rarityFor } from "../src/spawn.ts";
import { picker_order } from "../src/data.ts";
import { badgeFor } from "../src/badge.ts";
import { seenSector, summarize } from "../src/journal.ts";
import { stageFor, toNextStage } from "../src/stage.ts";
import { wildCollection } from "../src/collection.ts";

const pool = poolFromFile(
  JSON.parse(readFileSync(new URL("../public/model/species-model.json", import.meta.url), "utf8")),
);
const NOW = new Date("2026-09-12T09:00:00+08:00");

describe("the showcase demo journal", () => {
  it("is deterministic — the rehearsal shelf is the showcase shelf", () => {
    const a = demoJournal(pool, picker_order, NOW);
    const b = demoJournal(pool, picker_order, NOW);
    assert.deepEqual(a, b);
  });

  it("marks every row as demo, so the banner cannot be wrong", () => {
    const row = demoJournal(pool, picker_order, NOW);
    assert.ok(row.length > 0);
    assert.ok(row.every((s) => s.sighting_id.startsWith(DEMO_PREFIX)));
    assert.equal(isSeededJournal(row), true);
  });

  it("stops claiming to be seeded the moment a real find is added", () => {
    const row = demoJournal(pool, picker_order, NOW);
    const withReal = [...row, { ...row[0], sighting_id: "real-1" }];
    assert.equal(isSeededJournal(withReal), false, "one real row and the banner must go");
    assert.equal(isSeededJournal([]), false, "an empty journal is not a seeded one");
  });

  it("fills the shelf it exists to fill", () => {
    const row = demoJournal(pool, picker_order, NOW);
    const earned = badgeFor(row, {
      pool_count: new Map(pool.map((e) => [e.species_code, e.count])),
    }).filter((a) => a.earned_at !== null);
    assert.ok(earned.length >= 5, `only ${earned.length} badges — an empty-looking shelf on stage`);
    const c = wildCollection(row, pool, picker_order);
    assert.ok(c.found_count >= 4, `collection too thin: ${c.found_count}`);
    assert.ok(c.group.length >= 2, "the collection should group more than one way");
  });

  it("spans several days and several sectors", () => {
    const row = demoJournal(pool, picker_order, NOW);
    const s = summarize(row);
    assert.ok(s.day_count >= 3, `only ${s.day_count} day(s) — the BY DAY strip would be one bar`);
    assert.equal(s.located_count, row.length, "every demo find is located");
  });

  it("includes a contribution, because reporting is half the product", () => {
    const row = demoJournal(pool, picker_order, NOW);
    assert.ok(row.some((s) => s.entry_kind === "contribution"));
  });

  it("reaches more than one rarity band, so the shelf is not a wall of commons", () => {
    const row = demoJournal(pool, picker_order, NOW);
    const by_code = new Map(pool.map((e) => [e.species_code, e]));
    const band = new Set(
      row
        .map((s) => by_code.get(s.species_code))
        .filter((e) => e !== undefined)
        .map((e) => rarityFor(e!.count))
        .filter((r) => r !== null),
    );
    assert.ok(band.size >= 3, `only ${band.size} band(s): ${[...band].join(", ")}`);
  });

  it("never invents a rarity for a species the sweep did not count", () => {
    /* The mahogany failure, guarded here too: a seeded journal must not be the
       thing that puts "Once on campus" on screen. */
    const row = demoJournal(pool, picker_order, NOW);
    const by_code = new Map(pool.map((e) => [e.species_code, e]));
    for (const s of row) {
      const e = by_code.get(s.species_code);
      if (e && e.count === null) {
        assert.equal(rarityFor(e.count), null, `${s.species_code} would claim a rarity it has no data for`);
      }
    }
  });
});

describe("the demo journal leaves the best beat available", () => {
  it("stops one sector short of the next stage", () => {
    /* The beat sheet's 0:40 is the character advancing a stage and the
       blind-box reveal firing. The first seed walked 13 sectors and opened at
       "Fully grown", which made that beat impossible to show. */
    const row = demoJournal(pool, picker_order, NOW);
    const walked = seenSector(row);
    const next = toNextStage(walked.size);
    assert.notEqual(next, null, "a seed that opens fully grown cannot demo progression");
    assert.equal(next?.remaining, 1, `${next?.remaining} sectors to go — the live save must be the one that advances it`);
    assert.equal(stageFor(walked.size), "sapling");
    /* And one more located find in a new sector must actually cross it. */
    assert.equal(stageFor(walked.size + 1), "tree");
  });
});
