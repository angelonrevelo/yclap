/**
 * The daily hunt, pinned against the real campus data.
 *
 * The 09-26 confirmation playtest caught the hunt lying: it picked a species
 * and an area independently, said "Out today in Bellarmine & Cervini" about a
 * palm that had spawned somewhere else, drew from trees seen once on campus or
 * with no common name, and named eight of its areas "Sector N". Each of those
 * is a rule below.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { areaName, isUnnamedSector } from "../src/area-name.ts";
import { species } from "../src/data.ts";
import {
  dailyTaskFor,
  hasCommonName,
  HUNT_MIN_COUNT,
  huntFind,
  huntPool,
  isHuntArea,
  isTreeEntry,
} from "../src/gamify.ts";
import { isWalkable } from "../src/placement.ts";
import { biome_sector, sector, sectorByCode, sectorContains } from "../src/sector.ts";
import { poolFromFile, spawnWindow, type SpawnPoolEntry } from "../src/spawn.ts";

const pool = poolFromFile(JSON.parse(readFileSync(new URL("../public/model/species-model.json", import.meta.url), "utf8")));
const curated = new Set(Object.keys(species));

function entry(over: Partial<SpawnPoolEntry> & Pick<SpawnPoolEntry, "species_code">): SpawnPoolEntry {
  return {
    common_name: "Tree",
    scientific_name: "Arbor exemplaris",
    count: 20,
    origin: "Unknown",
    iconic_taxon_name: "Plantae",
    archetype: "tree",
    file: "x.glb",
    ...over,
  };
}

function* days(n: number): Generator<Date> {
  const start = Date.parse("2026-09-01T04:00:00.000Z");
  for (let i = 0; i < n; i += 1) yield new Date(start + i * 86_400_000);
}

describe("hunt pool", () => {
  it("keeps only named trees seen at least HUNT_MIN_COUNT times, and drops uncurated exotics", () => {
    const row = [
      entry({ species_code: "ok" }),
      entry({ species_code: "once", count: 1 }),
      entry({ species_code: "unknown-count", count: null }),
      entry({ species_code: "bare", common_name: "Arbor exemplaris" }),
      entry({ species_code: "blank", common_name: " " }),
      entry({ species_code: "bird", archetype: "bird", iconic_taxon_name: "Aves" }),
      entry({ species_code: "alien", origin: "Exotic" }),
      entry({ species_code: "raintree", origin: "Exotic" }),
      entry({ species_code: "palm", archetype: "palm", count: HUNT_MIN_COUNT }),
    ];
    const kept = huntPool(row, new Set(["raintree"])).map((e) => e.species_code);
    assert.deepEqual(kept, ["ok", "raintree", "palm"]);
  });

  it("on the real sweep, excludes the round-6 offenders and keeps the curated trees", () => {
    const kept = huntPool(pool, curated);
    const code = new Set(kept.map((e) => e.species_code));
    assert.ok(kept.length >= 20, `hunt pool is ${kept.length}`);
    for (const e of kept) {
      assert.ok(isTreeEntry(e));
      assert.ok(hasCommonName(e), e.species_code);
      assert.ok((e.count ?? 0) >= HUNT_MIN_COUNT, e.species_code);
    }
    assert.equal(code.has("picea-abies"), false, "Norway spruce: once on campus");
    assert.equal(code.has("cespedesia-spathulata"), false, "John Crow Wood: once on campus");
    assert.ok(code.has("narra"));
    assert.ok(code.has("molave"));
  });
});

describe("hunt areas", () => {
  it("never offers a Sector N", () => {
    const unnamed = biome_sector.filter(isUnnamedSector);
    assert.ok(unnamed.length > 0, "the data still has placeholder names — the rule is load-bearing");
    for (const s of unnamed) assert.equal(isHuntArea(s), false, s.sector_code);
  });

  it("names an unnamed area by its nearest building, never by its row id", () => {
    for (const s of sector) {
      const name = areaName(s);
      assert.doesNotMatch(name, /^Sector \d+$/, s.sector_code);
      if (isUnnamedSector(s)) assert.match(name, /^Near /);
      else assert.equal(name, s.name);
    }
  });
});

describe("dailyTaskFor on the real campus", () => {
  it("every day for 90 days: a pool tree, a named area, a find standing inside it on walkable ground", () => {
    const allowed = new Set(huntPool(pool, curated).map((e) => e.species_code));
    for (const now of days(90)) {
      const task = dailyTaskFor(pool, biome_sector, now, []);
      assert.ok(task, now.toISOString());
      assert.ok(allowed.has(task.species_code), task.species_code);
      const place = sectorByCode(task.sector_code);
      assert.ok(place && isHuntArea(place), task.sector_code);
      assert.doesNotMatch(task.sector_name, /Sector \d+/);
      const at = { lat: task.lat, lon: task.lon };
      assert.ok(sectorContains(place, at), `${task.day_key} find outside ${task.sector_code}`);
      assert.ok(isWalkable(at), `${task.day_key} find not walkable`);
    }
  });

  it("is the same for every player and every window of the day, and the find is out all day", () => {
    const morning = dailyTaskFor(pool, biome_sector, new Date("2026-09-26T00:05:00.000Z"), []);
    const evening = dailyTaskFor(pool, biome_sector, new Date("2026-09-26T23:50:00.000Z"), []);
    assert.ok(morning && evening);
    assert.notEqual(spawnWindow(Date.parse("2026-09-26T00:05:00.000Z")).index, spawnWindow(Date.parse("2026-09-26T23:50:00.000Z")).index);
    assert.deepEqual({ ...morning }, { ...evening });
    const find = huntFind(morning, pool);
    assert.ok(find);
    assert.equal(find.species_code, morning.species_code);
    assert.equal(find.sector_code, morning.sector_code);
    assert.equal(find.lat, morning.lat);
    assert.equal(find.starts_at, "2026-09-26T00:00:00.000Z");
    assert.equal(find.ends_at, "2026-09-27T00:00:00.000Z");
  });

  it("changes from day to day", () => {
    const code = new Set([...days(30)].map((d) => dailyTaskFor(pool, biome_sector, d, [])?.species_code));
    assert.ok(code.size >= 8, `only ${code.size} species in 30 days`);
  });
});
