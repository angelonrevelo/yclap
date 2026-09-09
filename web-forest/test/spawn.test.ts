import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  poolFromFile,
  rarityFor,
  SPAWN_WINDOW_MS,
  spawnForWindow,
  spawnsNear,
  spawnWindow,
  type SpawnPoolEntry,
} from "../src/spawn.ts";
import { RESTRICTED_POLYGON } from "../src/data.ts";
import { distanceMeter } from "../src/geo.ts";
import { biome_sector, sectorContains } from "../src/sector.ts";
import { readFileSync } from "node:fs";

/* ── the rules this file guards (owner ask, 2026-09-08) ────────────────────
 *
 * Spawning is "like Pokémon GO": finds stand in the world, rotate on a window,
 * and are worth walking to. Two honesty rules ride along from the roadmap:
 * rarity comes from real iNat campus counts, and nothing spawns on paved or
 * restricted ground. Everything is deterministic — the same window must draw
 * the same world on every device, or it is not a world.
 */

const fixture: SpawnPoolEntry[] = [
  { species_code: "common-bird", common_name: "Common Bird", scientific_name: "Aves communis", count: 96, origin: "Exotic", iconic_taxon_name: "Aves", archetype: "bird", file: "species/common-bird.glb" },
  { species_code: "mid-tree", common_name: "Mid Tree", scientific_name: "Arbor medius", count: 20, origin: "Native", iconic_taxon_name: "Plantae", archetype: "tree", file: "species/mid-tree.glb" },
  { species_code: "rare-herb", common_name: "Rare Herb", scientific_name: "Herba rara", count: 4, origin: "Native", iconic_taxon_name: "Plantae", archetype: "herb", file: "species/rare-herb.glb" },
  { species_code: "mythic-one", common_name: "Mythic One", scientific_name: "Unica unica", count: 1, origin: "Native", iconic_taxon_name: "Plantae", archetype: "tree", file: "species/mythic-one.glb" },
];

describe("rarity — real observation gaps, not a made-up clock", () => {
  it("maps campus observation counts to four honest bands", () => {
    assert.equal(rarityFor(96), "common");
    assert.equal(rarityFor(50), "common");
    assert.equal(rarityFor(49), "uncommon");
    assert.equal(rarityFor(10), "uncommon");
    assert.equal(rarityFor(9), "rare");
    assert.equal(rarityFor(2), "rare");
    assert.equal(rarityFor(1), "mythic");
  });

  it("makes NO claim when the sweep has no count", () => {
    /* This assertion used to read `rarityFor(0) === "mythic"` — the test
       encoded the bug. Four of the 1,098 manifest entries carry `count: null`,
       and `poolFromFile` coerced that to 0, so the app told anyone who found a
       MAHOGANY that it had been "recorded on this campus once". Mahogany is
       the tree this project's own problem tree says dominates the campus, and
       it is one of the nine species with a drawn card, so it is precisely what
       a judge would recognise.

       No observation record is an absence of data, not the rarest possible
       reading of it. */
    assert.equal(rarityFor(null), null);
    assert.equal(rarityFor(undefined), null);
    assert.equal(rarityFor(0), null);
  });

  it("keeps a missing count as null all the way through the pool", () => {
    const pool = poolFromFile({
      model: [
        { species_code: "counted", file: "species/a.glb", count: 12 },
        { species_code: "uncounted", file: "species/b.glb", count: null },
        { species_code: "absent", file: "species/c.glb" },
      ],
    });
    assert.equal(pool.find((e) => e.species_code === "counted")?.count, 12);
    assert.equal(pool.find((e) => e.species_code === "uncounted")?.count, null);
    assert.equal(pool.find((e) => e.species_code === "absent")?.count, null);
  });
});

describe("spawn rotation", () => {
  it("windows are consecutive 30-minute buckets", () => {
    const w = spawnWindow(Date.UTC(2026, 8, 9, 1, 0, 0));
    assert.equal(w.index, Math.floor(Date.UTC(2026, 8, 9, 1, 0, 0) / SPAWN_WINDOW_MS));
    assert.equal(new Date(w.ends_at).getTime() - new Date(w.starts_at).getTime(), SPAWN_WINDOW_MS);
  });

  it("the same window always draws the same world", () => {
    const now = Date.UTC(2026, 8, 9, 1, 7, 0);
    const a = spawnForWindow(fixture, now);
    const b = spawnForWindow(fixture, now);
    assert.deepEqual(a, b);
  });

  it("a later window draws a different world (the rotation is real)", () => {
    const w0 = spawnForWindow(fixture, Date.UTC(2026, 8, 9, 1, 7, 0));
    const w1 = spawnForWindow(fixture, Date.UTC(2026, 8, 9, 1, 7, 0) + SPAWN_WINDOW_MS);
    const ids0 = new Set(w0.map((s) => s.spawn_id));
    const ids1 = new Set(w1.map((s) => s.spawn_id));
    // No spawn_id appears in both windows verbatim.
    assert.equal([...ids0].filter((id) => ids1.has(id)).length, 0);
    // And at least one window holds finds at all.
    assert.ok(w0.length > 0);
  });
});

describe("where finds may stand", () => {
  const world = spawnForWindow(fixture, Date.UTC(2026, 8, 9, 1, 7, 0));

  it("every find is inside its own sector", () => {
    for (const s of world) {
      const sector = biome_sector.find((row) => row.sector_code === s.sector_code);
      assert.ok(sector, `spawn ${s.spawn_id} names a non-biome sector`);
      assert.ok(sectorContains(sector, { lat: s.lat, lon: s.lon }), `${s.spawn_id} left its ring`);
    }
  });

  it("no find stands in the restricted grove", () => {
    // The grove is small; assert the rejection sampler against it directly by
    // checking none of the world's points fall in the polygon bounding box.
    const lats = RESTRICTED_POLYGON.map((p) => p.lat);
    const lons = RESTRICTED_POLYGON.map((p) => p.lon);
    const in_box = (p: { lat: number; lon: number }) =>
      p.lat > Math.min(...lats) && p.lat < Math.max(...lats) && p.lon > Math.min(...lons) && p.lon < Math.max(...lons);
    // (bounding box is a superset of the polygon — a spawn in the box but not
    // in the polygon would still be legal, so this is a smoke check only)
    const hits = world.filter((s) => in_box(s));
    // If any land in the box they must be Outside the polygon proper; the
    // polygon check itself is inside spawn.ts. Nothing should sit in the box
    // because the sampler rejects the polygon and the box is tight.
    for (const s of hits) {
      assert.equal(
        pointInPolygon({ lat: s.lat, lon: s.lon }),
        false,
        `${s.spawn_id} stands inside the restricted grove`,
      );
    }
  });

  it("every species picked exists in the pool", () => {
    const codes = new Set(fixture.map((f) => f.species_code));
    for (const s of world) assert.ok(codes.has(s.species_code), `${s.spawn_id} invented a species`);
  });

  it("the world respects the density ceiling", () => {
    const capped = spawnForWindow(fixture, Date.UTC(2026, 8, 9, 1, 7, 0), biome_sector, { total_max: 12 });
    assert.ok(capped.length <= 12);
  });
});

describe("spawnsNear", () => {
  it("ranks by true metre distance and honours the radius", () => {
    const now = Date.UTC(2026, 8, 9, 1, 7, 0);
    const world = spawnForWindow(fixture, now);
    if (world.length < 2) return; // fixture world is small; the real pool drives density
    const here = { lat: world[0].lat, lon: world[0].lon };
    const near = spawnsNear(world, here, 400);
    for (let i = 1; i < near.length; i += 1) {
      assert.ok(distanceMeter(here, near[i - 1]) <= distanceMeter(here, near[i]));
    }
    assert.ok(near.every((s) => distanceMeter(here, s) <= 400));
  });
});

describe("the real campus pool", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../public/model/species-model.json", import.meta.url), "utf8"),
  );
  const pool = poolFromFile(manifest);

  it("loads over a thousand species with real counts", () => {
    assert.ok(pool.length >= 1000, `pool came back thin: ${pool.length}`);
    assert.ok(pool.every((e) => e.file.startsWith("species/")));
  });

  it("does not band the four species the sweep never counted", () => {
    /* mahogany, katmon, balete and lagundi. All four are curated species with
       drawn cards — the ones a visitor is most likely to look up. */
    const uncounted = pool.filter((e) => e.count === null);
    assert.equal(uncounted.length, 4, `uncounted set moved: ${uncounted.map((e) => e.species_code).join(", ")}`);
    assert.ok(uncounted.some((e) => e.species_code === "mahogany"));
    for (const e of uncounted) {
      assert.equal(rarityFor(e.count), null, `${e.species_code} was given a rarity it has no data for`);
    }
  });

  it("says out loud how far the native bias can actually reach", () => {
    /* `habitatWeight` multiplies a Native entry by 1.5, because the app exists
       to send eyes to native species. On 2026-09-08 the pool carried an origin
       for 9 of 1,098 — the iNat sweep never asked for establishment means — so
       that bias reaches almost nothing.

       This does not assert the gap is acceptable. It holds the NUMBER, so that
       re-running the sweep with `establishment_means` breaks this test and
       says so, instead of the world quietly staying flat forever. */
    const with_origin = pool.filter((e) => e.origin === "Native" || e.origin === "Exotic").length;
    assert.equal(
      with_origin,
      9,
      `origin coverage moved to ${with_origin}/${pool.length} — good news. Update this number AND the measured-limit note in spawn.ts.`,
    );
  });

  it("draws a populated, rarity-stratified world", () => {
    const world = spawnForWindow(pool, Date.UTC(2026, 8, 9, 1, 7, 0));
    assert.ok(world.length >= 40, `world too empty: ${world.length}`);
    const rarity = new Set(world.map((s) => s.rarity));
    assert.ok(rarity.has("common"), "a real campus pool should produce common finds");
    const commons = world.filter((s) => s.rarity === "common").length;
    const mythics = world.filter((s) => s.rarity === "mythic").length;
    assert.ok(commons > mythics, "commons must outnumber mythics — that is what the counts say");
  });
});

function pointInPolygon(p: { lat: number; lon: number }): boolean {
  const ring = RESTRICTED_POLYGON;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (a.lat > p.lat !== b.lat > p.lat && p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon) {
      inside = !inside;
    }
  }
  return inside;
}
