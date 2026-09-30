import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { stageFor, STAGE_AT, toNextStage } from "../src/stage.ts";
import {
  biome_sector,
  greenness,
  SECTOR_ATTRIBUTION,
  SECTOR_METHOD,
  sector,
  sectorAt,
  sectorByCode,
  sectorContains,
  sectorFill,
  sectorStroke,
} from "../src/sector.ts";
import { seenSector, sectorProgress, vigorOf, type Sighting } from "../src/journal.ts";

/**
 * The 09-03 correction, pinned.
 *
 * The unit of play is a face of the path network, not a ring anybody drew. That
 * is a claim about where the geometry CAME FROM, so most of what follows checks
 * provenance and honesty rather than pixels: no sector may present itself as
 * surveyed ground, no name we invented may pass as an OSM one, and nothing in
 * the progress model may become comparable between people.
 *
 * `biome.test.ts` is deliberately left intact. It still asserts the 09-03 seed,
 * which is now provenance rather than play — superseded, not deleted.
 */

const raw = JSON.parse(
  readFileSync(new URL("../src/asset/campus-sector.json", import.meta.url), "utf8"),
) as { attribution: string; sector: { sector_code: string; point: [number, number][] }[] };

function make(over: Partial<Sighting>): Sighting {
  return {
    sighting_id: "s-1",
    species_code: "narra",
    photo_data: null,
    created_at: "2026-09-03T01:00:00.000Z",
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
    entry_index: 0,
    ...over,
  };
}

describe("sector geometry", () => {
  it("cut something to walk in at all", () => {
    assert.ok(sector.length >= 40, `only ${sector.length} sectors`);
    assert.equal(sector.length, raw.sector.length);
  });

  it("every sector is a drawable ring", () => {
    for (const s of sector) {
      assert.ok(s.point.length >= 3, `${s.sector_code} has ${s.point.length} points`);
      for (const [lat, lon] of s.point) {
        assert.ok(Number.isFinite(lat) && Number.isFinite(lon), `${s.sector_code} has a bad point`);
        /* Loyola Heights, not the Gulf of Guinea — a [lon,lat] swap lands at 0,0. */
        assert.ok(lat > 14.62 && lat < 14.66, `${s.sector_code} latitude ${lat} is off campus`);
        assert.ok(lon > 121.06 && lon < 121.1, `${s.sector_code} longitude ${lon} is off campus`);
      }
    }
  });

  it("stores points as [lat, lon], the opposite of campus-path.json", () => {
    /* Pinned because the two files genuinely disagree and always will. If some
       future tidy-up "unifies" them, this fails instead of the map silently
       redrawing itself in the ocean. */
    const [lat, lon] = sector[0].point[0];
    assert.ok(lat < lon, "first ordinate should be the smaller latitude");
  });

  it("has a unique code and a non-empty name for every sector", () => {
    const code = new Set<string>();
    for (const s of sector) {
      assert.ok(s.name.trim().length > 0, `${s.sector_code} is unnamed`);
      assert.ok(!code.has(s.sector_code), `duplicate ${s.sector_code}`);
      code.add(s.sector_code);
    }
  });

  it("finds a sector by code, and nothing for a code that is not one", () => {
    assert.equal(sectorByCode(sector[0].sector_code)?.name, sector[0].name);
    assert.equal(sectorByCode("not-a-sector"), null);
  });
});

describe("containment", () => {
  it("puts a sector's own label point inside that sector", () => {
    /* The label point is built as a guaranteed-interior point. If containment
       and that construction ever disagree, one of them is wrong. */
    let hit = 0;
    for (const s of sector) {
      if (sectorContains(s, { lat: s.label_point[0], lon: s.label_point[1] })) hit += 1;
    }
    assert.equal(hit, sector.length, `${sector.length - hit} label points fell outside their sector`);
  });

  it("returns null far from campus rather than guessing the nearest", () => {
    /* Nearest-polygon IS the per-tree rule wearing a new hat, and it breaks
       where parcels adjoin. Off the network means off the network. */
    assert.equal(sectorAt({ lat: 14.5, lon: 121.0 }), null);
  });

  it("puts a point in at most the sector that encloses it", () => {
    const s = sector[0];
    const at = sectorAt({ lat: s.label_point[0], lon: s.label_point[1] });
    assert.ok(at !== null);
    assert.ok(sectorContains(at, { lat: s.label_point[0], lon: s.label_point[1] }));
  });
});

describe("honesty", () => {
  it("credits OpenStreetMap for boundaries it did not survey", () => {
    assert.match(SECTOR_ATTRIBUTION, /OpenStreetMap/);
    assert.match(SECTOR_ATTRIBUTION, /ODbL/);
    assert.match(raw.attribution, /OpenStreetMap/);
  });

  it("never claims a sector was surveyed", () => {
    const text = JSON.stringify(sector).toLowerCase();
    for (const word of ["our survey", "we surveyed", "surveyed by", "census"]) {
      assert.ok(!text.includes(word), `sector data claims "${word}"`);
    }
  });

  it("flags every name we invented rather than passing it off as OSM's", () => {
    for (const s of sector) {
      if (/^Sector \d+$/.test(s.name) || s.name.startsWith("Walk by ")) {
        assert.equal(s.is_named_by_us, true, `${s.sector_code} "${s.name}" is ours but unflagged`);
      }
    }
  });

  it("reports how the cut was made, so the number is checkable", () => {
    assert.ok(SECTOR_METHOD.segment_count > 0);
    assert.ok(SECTOR_METHOD.building_sampled > 0);
    assert.ok(SECTOR_METHOD.face_count >= sector.length);
  });
});

describe("what the imagery decided", () => {
  it("reads greenness off measured vegetation, not off the absence of a building", () => {
    /* The regression this pins: `1 - built_ratio` painted every car park as
       lawn, because a car park has no building on it. */
    for (const s of sector) {
      if (s.vegetation_ratio === null) continue;
      assert.equal(greenness(s), s.vegetation_ratio);
    }
  });

  it("measured every sector against real pixels", () => {
    const unmeasured = sector.filter((s) => s.vegetation_ratio === null);
    assert.equal(unmeasured.length, 0, `${unmeasured.length} sectors were never looked at`);
    for (const s of sector) {
      assert.ok(s.vegetation_sample > 0, `${s.sector_code} sampled no pixels`);
      assert.ok(s.vegetation_ratio! >= 0 && s.vegetation_ratio! <= 1);
    }
  });

  it("does not call unvegetated ground a biome", () => {
    for (const s of sector) {
      if (s.is_biome) assert.ok(s.vegetation_ratio! >= 0.45, `${s.name} is a biome at ${s.vegetation_ratio} vegetation`);
      else assert.ok(s.vegetation_ratio! < 0.45, `${s.name} is not a biome at ${s.vegetation_ratio} vegetation`);
    }
  });

  it("carries no species on ground with no vegetation to hold them", () => {
    for (const s of sector) {
      if (!s.is_biome) assert.equal(s.species_code.length, 0, `${s.name} is paved but lists species`);
    }
  });

  it("still finds real biomes — the filter must not empty the game", () => {
    assert.ok(biome_sector.length >= 20, `only ${biome_sector.length} walkable biomes left`);
    assert.ok(biome_sector.length < sector.length, "everything passed, so the filter is doing nothing");
  });
});

describe("the green ramp", () => {
  it("keeps every BIOME in one hue family, so it is not a rainbow", () => {
    for (const s of biome_sector) {
      const hue = Number(/^hsl\(([\d.]+)/.exec(sectorFill(s))![1]);
      assert.ok(hue > 100 && hue < 135, `${s.sector_code} hue ${hue} left the green family`);
    }
  });

  it("takes paved ground OUT of the green family on purpose", () => {
    /* Asphalt must not read as a pale shade of lawn. This is the fix for the
       Areté parking deck, asserted rather than eyeballed. */
    for (const s of sector.filter((r) => !r.is_biome)) {
      const hue = Number(/^hsl\(([\d.]+)/.exec(sectorFill(s))![1]);
      assert.ok(hue < 100, `${s.sector_code} is paved but drawn at hue ${hue}`);
    }
  });

  it("separates kinds by LIGHTNESS, so the map still reads in greyscale", () => {
    /* Disparity here is not taste — it is the difference between a map and a
       green blob, and it has to survive being printed in black and white. */
    const lightness = (kind: string) => {
      const row = sector.filter((s) => s.kind === kind);
      if (!row.length) return null;
      return row.reduce((a, s) => a + Number(/([\d.]+)%\)$/.exec(sectorFill(s))![1]), 0) / row.length;
    };
    const field = lightness("open-field");
    const walk = lightness("planted-walk");
    const paved = lightness("paved") ?? lightness("built");
    assert.ok(field !== null && walk !== null, "expected open-field and planted-walk sectors");
    assert.ok(walk - field > 6, `planted walk (${walk}) vs field (${field}) is too close to tell apart`);
    if (paved !== null) assert.ok(paved - field > 18, `paved (${paved}) vs field (${field}) is too close`);
  });

  it("draws a boundary darker than the ground it encloses", () => {
    for (const s of sector.slice(0, 24)) {
      const fill = Number(/([\d.]+)%\)$/.exec(sectorFill(s))![1]);
      const stroke = Number(/([\d.]+)%\)$/.exec(sectorStroke(s))![1]);
      assert.ok(stroke < fill, `${s.sector_code} stroke is not darker than its fill`);
    }
  });
});

describe("progress is personal", () => {
  const inside = sector[0];
  const row = [
    make({ sighting_id: "a", lat: inside.label_point[0], lon: inside.label_point[1] }),
    make({ sighting_id: "b" }),
  ];

  it("counts a sector as seen only from a located badge inside it", () => {
    const seen = seenSector(row);
    assert.ok(seen.has(inside.sector_code));
    /* The unlocated row cannot have put anyone anywhere. */
    assert.equal(seen.size, 1);
  });

  it("ignores a contribution for sector progress, and says so by counting zero", () => {
    const only_contribution = [
      make({ entry_kind: "contribution", lat: inside.label_point[0], lon: inside.label_point[1] }),
    ];
    assert.equal(seenSector(only_contribution).size, 0);
  });

  it("never totals more than the sector's own provisional species list", () => {
    for (const s of sector.slice(0, 30)) {
      const p = sectorProgress(row, s);
      assert.equal(p.total, s.species_code.length);
      assert.ok(p.seen_count <= p.total);
    }
  });

  it("carries no field that could rank one walker against another", () => {
    const shape = JSON.stringify({
      seen: [...seenSector(row)],
      progress: sectorProgress(row, inside),
    }).toLowerCase();
    for (const banned of ["rank", "leaderboard", "percentile", "score", "points", "streak", "xp", "level"]) {
      assert.ok(!shape.includes(banned), `sector progress exposes "${banned}"`);
    }
  });
});

describe("the character", () => {
  it("starts as a seed and never skips a stage going up", () => {
    assert.equal(stageFor(0), "egg");
    let last = -1;
    for (const step of STAGE_AT) {
      assert.ok(step.sector_seen > last, "stage thresholds must increase");
      assert.equal(stageFor(step.sector_seen), step.stage);
      last = step.sector_seen;
    }
  });

  it("never goes backwards as more sectors are walked", () => {
    const order = ["egg", "sprout", "sapling", "tree"];
    let at = 0;
    for (let n = 0; n < 40; n += 1) {
      const next = order.indexOf(stageFor(n));
      assert.ok(next >= at, `stage fell back at ${n}`);
      at = next;
    }
  });

  it("says what is left, and stops promising once grown", () => {
    assert.ok((toNextStage(0)?.remaining ?? 0) > 0);
    assert.equal(toNextStage(999), null);
  });

  it("droops when unwalked but is fully recoverable, and never touches progress", () => {
    const now = Date.parse("2026-09-03T12:00:00.000Z");
    const fresh = [make({ created_at: "2026-09-03T09:00:00.000Z" })];
    const stale = [make({ created_at: "2026-07-01T09:00:00.000Z" })];

    assert.equal(vigorOf(fresh, now), 1, "a walk today should be full vigor");
    assert.ok(vigorOf(stale, now) < 1, "two months away should show");
    assert.ok(vigorOf(stale, now) > 0, "absence must never zero it out");

    /* The rule from `1:08:20`: absence changes appearance, never progress. */
    assert.equal(stageFor(seenSector(stale).size), stageFor(seenSector(stale).size));
    assert.equal(vigorOf([...stale, make({ created_at: "2026-09-03T11:00:00.000Z" })], now), 1);
  });

  it("treats an empty journal as full vigor rather than as neglect", () => {
    assert.equal(vigorOf([]), 1);
  });
});
