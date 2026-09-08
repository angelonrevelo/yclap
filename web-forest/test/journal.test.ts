import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  progressOf,
  summarize,
  toCsv,
  toGeoJson,
  trackMeter,
  walkReceipt,
  nextEntryIndex,
  withEntryIndex,
  type Sighting,
  type Walk,
  type WalkFix,
} from "../src/journal.ts";
import { sector } from "../src/sector.ts";
import { picker_order, journal_order } from "../src/data.ts";
import { distanceMeter } from "../src/geo.ts";

/* ── the rule this file guards (build spec T2, 2026-09-06, option b) ─────────
 *
 * Per-user progression is allowed; cross-user comparison is not. The forbidden
 * axis is comparison between students — `leaderboard`, `rank`, `percentile`,
 * any aggregate over other people's data, and the vanity metrics (`score`,
 * `points`, `streak`, `xp`) that read as one. Allowed on a per-user object:
 * `level`, `stage`, `progress`, `seen_count`, `vigor`. `summarize` stays a
 * counts-and-groupings object; `progressOf` is where the per-user bundle lives.
 * Source: `docs/spec/biome-3d-build-spec.md` §3, decision (b); the 09-02 pulong
 * softened the original objection without lifting the no-comparison rule.
 */
const CROSS_USER_KEYS = [
  "leaderboard",
  "rank",
  "percentile",
  "score",
  "points",
  "streak",
  "xp",
  "other_user",
  "user_rank",
];

/** Walk every key at every depth; collect any forbidden field name. */
function crossUserKeysIn(value, path = "") {
  const found = [];
  if (!value || typeof value !== "object") return found;
  for (const [key, child] of Object.entries(value)) {
    if (CROSS_USER_KEYS.includes(key)) found.push(path + "." + key);
    found.push(...crossUserKeysIn(child, path + "." + key));
  }
  return found;
}

function make(over: Partial<Sighting>): Sighting {
  return {
    sighting_id: "narra-1",
    species_code: "narra",
    photo_data: null,
    created_at: "2026-09-02T01:00:00.000Z",
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

const row: Sighting[] = [
  make({ sighting_id: "a", species_code: "narra", lat: 14.64, lon: 121.078, accuracy_m: 8, fix_source: "gps" }),
  make({ sighting_id: "b", species_code: "narra", created_at: "2026-09-03T02:00:00.000Z", photo_data: "data:image/jpeg;base64,xx" }),
  make({ sighting_id: "c", species_code: "molave", lat: 14.641, lon: 121.079, accuracy_m: 5, fix_source: "demo", note: "beside the walk" }),
];

describe("summarize", () => {
  it("counts sightings, species, located and photo rows", () => {
    const s = summarize(row);
    assert.equal(s.sighting_count, 3);
    assert.equal(s.species_count, 2);
    assert.equal(s.located_count, 2);
    assert.equal(s.photo_count, 1);
    assert.equal(s.day_count, 2);
  });

  it("groups by species, biggest first", () => {
    const s = summarize(row);
    assert.deepEqual(s.by_species, [
      { key: "narra", count: 2 },
      { key: "molave", count: 1 },
    ]);
  });

  it("groups by day and reports the span", () => {
    const s = summarize(row);
    assert.deepEqual(
      s.by_day.map((d) => d.key).sort(),
      ["2026-09-02", "2026-09-03"],
    );
    assert.equal(s.first_at, "2026-09-02T01:00:00.000Z");
    assert.equal(s.last_at, "2026-09-03T02:00:00.000Z");
  });

  it("carries no cross-user field — leaderboard, rank or percentile", () => {
    const found = crossUserKeysIn(summarize(row), "summary");
    assert.deepEqual(found, [], `summary carried a forbidden field: ${found.join(", ")}`);
  });

  it("handles an empty journal", () => {
    const s = summarize([]);
    assert.equal(s.sighting_count, 0);
    assert.equal(s.first_at, null);
    assert.deepEqual(s.by_species, []);
  });
});

describe("toGeoJson", () => {
  it("emits only located rows, lon-first, with the source of the fix", () => {
    const fc = toGeoJson(row);
    assert.equal(fc.type, "FeatureCollection");
    assert.equal(fc.features.length, 2);
    const first = fc.features[0];
    assert.deepEqual(first.geometry.coordinates, [121.078, 14.64]);
    assert.equal(first.properties.fix_source, "gps");
    assert.equal(fc.features[1].properties.note, "beside the walk");
  });

  it("never carries a photo data-URL into the export", () => {
    const text = JSON.stringify(toGeoJson([...row, make({ sighting_id: "d", lat: 14.64, lon: 121.078, photo_data: "data:image/jpeg;base64,zz" })]));
    assert.equal(text.includes("base64"), false);
  });

  it("returns an empty collection when nothing has a position", () => {
    assert.deepEqual(toGeoJson([make({})]).features, []);
  });
});

/**
 * Column INDEX is not the rule — the column's presence and its emptiness are.
 * These read the header and look the cell up by name, so adding a field (as the
 * biome pivot added `entry_kind` / `reported_name`) cannot silently pass a test
 * that was really asserting "lat happens to be 5th".
 */
function cellOf(csv: string, line_index: number, column: string): string {
  const line = csv.split("\n");
  const at = line[0].split(",").indexOf(column);
  assert.notEqual(at, -1, `CSV has no ${column} column`);
  return line[line_index].split(",")[at];
}

describe("toCsv", () => {
  it("writes a header plus one line per sighting", () => {
    const line = toCsv(row).split("\n");
    assert.equal(line.length, 4);
    assert.equal(line[0].split(",")[0], "sighting_id");
    for (const column of ["species_code", "created_at", "lat", "lon"]) {
      assert.ok(line[0].split(",").includes(column), `header is missing ${column}`);
    }
  });

  it("quotes a note containing a comma or a quote", () => {
    const csv = toCsv([make({ note: 'flowering, and "tall"' })]);
    assert.ok(csv.includes('"flowering, and ""tall"""'));
  });

  it("leaves a missing position empty rather than writing a zero", () => {
    const csv = toCsv([make({})]);
    assert.equal(cellOf(csv, 1, "lat"), "");
    assert.equal(cellOf(csv, 1, "lon"), "");
    assert.equal(cellOf(csv, 1, "accuracy_m"), "");
  });

  it("writes a position that IS present", () => {
    const csv = toCsv([make({ lat: 14.64, lon: 121.078 })]);
    assert.equal(cellOf(csv, 1, "lat"), "14.64");
    assert.equal(cellOf(csv, 1, "lon"), "121.078");
  });
});

/* ── walk receipt ─────────────────────────────────────────────────────────
 *
 * A walk that ends with nothing on screen is a stop, not a walk. These assert
 * the receipt is computed from the recorded trail rather than estimated, and
 * that it stays inside the same no-ranking rule the journal summary follows.
 */

/** A sector we know exists, with a point guaranteed to be inside it. */
const a_sector = sector.find((s) => s.is_biome)!;
const b_sector = sector.find((s) => s.is_biome && s.sector_code !== a_sector.sector_code)!;

function fixAt(lat: number, lon: number, at: number, source: "gps" | "demo" = "gps"): WalkFix {
  return { lat, lon, at, source };
}

function walkOf(over: Partial<Walk> = {}): Walk {
  return {
    walk_id: "walk-1",
    started_at: "2026-09-05T01:00:00.000Z",
    ended_at: null,
    track: [],
    ...over,
  };
}

describe("trackMeter", () => {
  it("is the haversine sum of the trail, not the straight line end to end", () => {
    /* Out 0.001° north then back — a real walker covers both legs. */
    const there = fixAt(14.6386, 121.0785, 1);
    const away = fixAt(14.6396, 121.0785, 2);
    const back = fixAt(14.6386, 121.0785, 3);
    const one_leg = distanceMeter(there, away);
    assert.ok(Math.abs(trackMeter([there, away, back]) - one_leg * 2) < 0.5);
    /* The straight line from first to last is zero. The trail is not. */
    assert.ok(trackMeter([there, away, back]) > 200);
  });

  it("is zero for a trail too short to measure", () => {
    assert.equal(trackMeter([]), 0);
    assert.equal(trackMeter([fixAt(14.6386, 121.0785, 1)]), 0);
  });
});

describe("walkReceipt", () => {
  it("counts species seen on this walk and which were new to the journal", () => {
    const journal = [
      make({ sighting_id: "old", species_code: "narra", walk_id: null }),
      make({ sighting_id: "x", species_code: "narra", walk_id: "walk-1" }),
      make({ sighting_id: "y", species_code: "molave", walk_id: "walk-1" }),
      make({ sighting_id: "z", species_code: "teak", walk_id: "walk-other" }),
    ];
    const got = walkReceipt(walkOf(), journal);
    assert.deepEqual(got.species_code.sort(), ["molave", "narra"]);
    assert.equal(got.species_count, 2);
    /* Narra was already in the journal before this walk; molave was not. */
    assert.deepEqual(got.new_species_code, ["molave"]);
    assert.equal(got.new_species_count, 1);
  });

  it("names the sectors the trail actually passed through, in entry order", () => {
    const [a_lat, a_lon] = a_sector.label_point;
    const [b_lat, b_lon] = b_sector.label_point;
    const got = walkReceipt(
      walkOf({ track: [fixAt(a_lat, a_lon, 1), fixAt(b_lat, b_lon, 2), fixAt(a_lat, a_lon, 3)] }),
      [],
    );
    assert.deepEqual(got.sector_code, [a_sector.sector_code, b_sector.sector_code]);
    assert.equal(got.sector_count, 2);
    for (const code of got.sector_code) {
      assert.ok(sector.some((s) => s.sector_code === code), `${code} is not a real sector`);
    }
  });

  it("says the distance is unknown rather than printing a confident zero", () => {
    const got = walkReceipt(walkOf({ track: [] }), []);
    assert.equal(got.is_distance_unknown, true);
    assert.equal(got.distance_meter, 0);

    const walked = walkReceipt(
      walkOf({ track: [fixAt(14.6386, 121.0785, 1), fixAt(14.6396, 121.0785, 2)] }),
      [],
    );
    assert.equal(walked.is_distance_unknown, false);
    assert.ok(walked.distance_meter > 100);
  });

  it("admits on the receipt when the demo loop drove the walk", () => {
    const demo = walkReceipt(walkOf({ track: [fixAt(14.6386, 121.0785, 1, "demo")] }), []);
    assert.equal(demo.fix_source, "demo");
    assert.equal(demo.is_demo, true);

    const real = walkReceipt(walkOf({ track: [fixAt(14.6386, 121.0785, 1, "gps")] }), []);
    assert.equal(real.is_demo, false);
  });

  it("reports elapsed minutes from the two timestamps", () => {
    const got = walkReceipt(walkOf(), [], "2026-09-05T01:37:00.000Z");
    assert.equal(got.elapsed_minute, 37);
  });

  it("carries no cross-user field — at any depth", () => {
    const got = walkReceipt(
      walkOf({ track: [fixAt(14.6386, 121.0785, 1)] }),
      [make({ walk_id: "walk-1" })],
    );
    /* Option (b): per-user fields like `level`/`stage` are allowed; the
       forbidden axis is comparison. This walks the whole serialized object so
       a nested `{ rank: 3 }` or `{ leaderboard: [...] }` cannot slip past. */
    const found = crossUserKeysIn(got, "receipt");
    assert.deepEqual(found, [], `walk receipt carried a forbidden field: ${found.join(", ")}`);
  });
});

describe("seen of total", () => {
  it("counts against the curated list, not the padded journal grid", () => {
    const got = summarize([make({ species_code: "narra" }), make({ species_code: "molave" })]);
    assert.equal(got.species_count, 2);
    assert.equal(got.species_total, picker_order.length);
    /* The grid pads with empty slots to fill a row. Those are not findable
       species and must never inflate the denominator. */
    assert.ok(journal_order.length > picker_order.length);
    assert.notEqual(got.species_total, journal_order.length);
  });

  it("reads n of N where N is the real starter list", () => {
    const got = summarize([make({ species_code: "narra" })]);
    assert.equal(`${got.species_count} of ${got.species_total} species seen`, "1 of 9 species seen");
  });

  it("still carries no cross-user field at any depth", () => {
    const found = crossUserKeysIn(summarize([make({})]), "summary");
    assert.deepEqual(found, [], `summary carried a forbidden field: ${found.join(", ")}`);
  });
});

describe("progressOf — the per-user bundle (option b)", () => {
  it("exposes level, stage, progress and seen_count from this journal only", () => {
    const p = progressOf(row);
    assert.equal(typeof p.level, "number");
    assert.equal(typeof p.stage, "string");
    assert.equal(typeof p.progress, "number");
    assert.equal(typeof p.seen_count, "number");
    /* level is per-user and derived from this journal alone — option (b) lets
       it ship. The forbidden axis is comparison, not progression. */
    assert.ok(p.level >= 1);
    assert.ok(p.seen_count >= 1);
  });

  it("keeps the two earn counters separate, never summed into a score", () => {
    const local = [
      make({ sighting_id: "b1", species_code: "narra", entry_kind: "badge" }),
      make({ sighting_id: "c1", species_code: "narra", entry_kind: "contribution", reported_name: "unknown" }),
    ];
    const p = progressOf(local);
    assert.equal(p.badge_count, 1);
    assert.equal(p.contribution_count, 1);
    assert.ok(!Object.keys(p).includes("score"), "progress must not sum the counters into a score");
  });

  it("carries no cross-user field at any depth", () => {
    const p = progressOf(row);
    const found = crossUserKeysIn(p, "progress");
    assert.deepEqual(found, [], `progress carried a forbidden field: ${found.join(", ")}`);
  });

  it("the guard fails on a planted leaderboard field", () => {
    const planted = {
      ...progressOf(row),
      leaderboard: [{ user: "someone else", rank: 1 }],
    };
    const found = crossUserKeysIn(planted, "planted");
    assert.ok(found.includes("planted.leaderboard"), "guard must catch a planted leaderboard");
  });

  it("a sector-seen count advances the stage; absence never removes it", () => {
    const empty = progressOf([]);
    assert.equal(empty.stage, "egg");
    /* One located badge inside a real biome sector sprouts the character. */
    const [a_lat, a_lon] = a_sector.label_point;
    const one_sector: Sighting[] = [
      make({ sighting_id: "s1", species_code: "narra", lat: a_lat, lon: a_lon, fix_source: "gps" }),
    ];
    assert.equal(progressOf(one_sector).stage, "sprout");
  });
});

describe("stable catalogue number", () => {
  it("never reuses a number, even after the highest entry is deleted", () => {
    const row = [make({ sighting_id: "a", entry_index: 1 }), make({ sighting_id: "b", entry_index: 2 })];
    assert.equal(nextEntryIndex(row), 3);
    const after_delete = row.filter((s) => s.sighting_id !== "b");
    /* Naive length+1 would hand out 2 again and two entries would share a
       number. The highest ever issued is what matters. */
    assert.equal(nextEntryIndex(after_delete), 2);
    assert.equal(nextEntryIndex([]), 1);
  });

  it("does not renumber surviving entries when an earlier one is deleted", () => {
    const row = [
      make({ sighting_id: "a", entry_index: 1 }),
      make({ sighting_id: "b", entry_index: 2 }),
      make({ sighting_id: "c", entry_index: 3 }),
    ];
    const after = withEntryIndex(row.filter((s) => s.sighting_id !== "a"));
    assert.deepEqual(after.map((s) => s.entry_index), [2, 3]);
  });

  it("backfills legacy rows from their fixed stored position, and is idempotent", () => {
    const legacy = [
      make({ sighting_id: "a", entry_index: 0 }),
      make({ sighting_id: "b", entry_index: 0 }),
    ];
    const once = withEntryIndex(legacy);
    assert.deepEqual(once.map((s) => s.entry_index), [1, 2]);
    assert.deepEqual(withEntryIndex(once).map((s) => s.entry_index), [1, 2]);
  });

  it("leaves already-numbered rows alone while filling the gaps around them", () => {
    const mixed = [
      make({ sighting_id: "a", entry_index: 5 }),
      make({ sighting_id: "b", entry_index: 0 }),
    ];
    assert.deepEqual(withEntryIndex(mixed).map((s) => s.entry_index), [5, 6]);
  });
});

describe("seen-of-total against a 1,098-species world", () => {
  it("the seen fraction and the wild count are two different universes", () => {
    /* The bug: `species_count` used to be every distinct species_code, while
       `species_total` was the nine-species picker. Walking to a find in the
       world can log any of 1,098 species, so a student who logged three of
       them read "12 of 9 species seen" — incoherent rather than merely wrong. */
    const row = [
      make({ sighting_id: "a", species_code: "narra" }),
      make({ sighting_id: "b", species_code: "molave" }),
      make({ sighting_id: "c", species_code: "firecracker-flower" }),
      make({ sighting_id: "d", species_code: "great-eggfly" }),
      make({ sighting_id: "e", species_code: "great-eggfly" }),
    ];
    const s = summarize(row);
    assert.equal(s.species_count, 2, "only the curated two count against the curated total");
    assert.ok(s.species_count <= s.species_total, "the fraction must never exceed its own denominator");
    assert.equal(s.wild_species_count, 2, "two distinct off-list species, counted once each");
    assert.equal(s.sighting_count, 5);
  });

  it("a journal of nothing but wild finds reads zero of nine, not nine of nine", () => {
    const row = [
      make({ sighting_id: "w1", species_code: "zebra-spiderwort" }),
      make({ sighting_id: "w2", species_code: "sea-almond" }),
    ];
    const s = summarize(row);
    assert.equal(s.species_count, 0);
    assert.equal(s.wild_species_count, 2);
  });
});
