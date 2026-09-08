import assert from "node:assert/strict";
import { test } from "node:test";
import { badgeFor, BADGE_LIST, campusHour, earnedBadges } from "../src/badge.ts";
import { biome_sector } from "../src/sector.ts";
import type { Sighting } from "../src/journal.ts";

/**
 * The badge shelf's contract.
 *
 * The rule this file exists to hold: **a badge may only claim what the journal
 * on this device can actually prove.** `Shared Find` used to say a find had
 * been "synced to the campus world" while checking nothing but whether it had
 * a latitude — a claim a phone that has never reached a server cannot make.
 * It shipped that way because `badge.ts` had no test at all.
 */

let seq = 0;

function sight(over: Partial<Sighting> = {}): Sighting {
  seq += 1;
  return {
    sighting_id: `t-${seq}`,
    species_code: "narra",
    photo_data: null,
    created_at: "2026-09-08T04:00:00.000Z" /* 12:00 campus time */,
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
    entry_index: seq,
    ...over,
  };
}

/** A point inside the nth biome sector, so a badge that needs grounds gets one. */
function inSector(n: number): { lat: number; lon: number } {
  const s = biome_sector[n % biome_sector.length];
  return { lat: s.label_point[0], lon: s.label_point[1] };
}

test("an empty journal earns nothing", () => {
  assert.deepEqual(earnedBadges([]), []);
  assert.ok(badgeFor([]).every((a) => a.earned_at === null));
});

test("every badge is uniquely identified and described", () => {
  const id = BADGE_LIST.map((b) => b.id);
  assert.equal(new Set(id).size, id.length, "duplicate badge id");
  const name = BADGE_LIST.map((b) => b.name);
  assert.equal(new Set(name).size, name.length, "duplicate badge name");
  for (const b of BADGE_LIST) {
    assert.ok(b.blurb.length > 10, `${b.id} has no blurb`);
    assert.ok(["find", "explore", "time", "science"].includes(b.group), `${b.id} bad group`);
  }
});

test("no badge claims a fact that lives outside this journal", () => {
  /* The `Shared Find` failure, pinned. The journal holds no sync record and no
     other player, so a badge may not say it does. */
  const forbidden = /\b(synced|sync|leaderboard|rank|ranked|other players?|beat|top \d)\b/i;
  for (const b of BADGE_LIST) {
    assert.ok(!forbidden.test(b.blurb), `${b.id} promises something the journal cannot prove: "${b.blurb}"`);
    assert.ok(!forbidden.test(b.name), `${b.id} names something the journal cannot prove`);
  }
});

test("no two badges are the same test wearing two names", () => {
  /* `Shared Find` was `Count and Location` minus one clause: across every
     journal you could hand them, they fired together. A shelf of near-
     duplicates inflates the earned count without rewarding anything new.

     The check: run every badge over a spread of journals and compare the
     resulting earned/not vectors. Two badges that agree on all of them are
     the same test twice. */
  const journal: Sighting[][] = [
    [],
    [sight()],
    [sight({ ...inSector(0) })],
    [sight({ entry_kind: "contribution", reported_name: "a fern" })],
    [sight({ ...inSector(0), created_at: "2026-09-01T01:00:00.000Z" }), sight({ ...inSector(0), created_at: "2026-09-04T01:00:00.000Z" })],
    Array.from({ length: 6 }, (_, i) => sight({ species_code: `sp-${i}`, ...inSector(i) })),
    /* Five species in ONE ground, and three grounds with ONE species — the two
       journals that pull "Five Species" and "Three Grounds" apart. Without
       them the pair looks identical, which is exactly the trap this test is
       for: a thin fixture makes two different badges read as duplicates. */
    Array.from({ length: 5 }, (_, i) => sight({ species_code: `one-${i}`, ...inSector(0) })),
    Array.from({ length: 3 }, (_, i) => sight({ species_code: "narra", ...inSector(i) })),
    [sight({ created_at: "2026-09-08T22:00:00.000Z", ...inSector(1) })],
    [sight({ created_at: "2026-09-08T13:00:00.000Z", ...inSector(2) })],
    Array.from({ length: 12 }, (_, i) => sight({ species_code: `many-${i}`, ...inSector(i) })),
    /* Sixteen species standing in ONE ground, and one species logged in EVERY
       ground — the pair that separates "Fifteen Species" from "The Whole
       Campus". */
    Array.from({ length: 16 }, (_, i) => sight({ species_code: `wide-${i}`, ...inSector(0) })),
    biome_sector.map((_, i) => sight({ species_code: "narra", ...inSector(i) })),
    /* Ten finds carrying one walk_id, plus a rare species, so the last two
       badges are reachable too. */
    Array.from({ length: 10 }, (_, i) => sight({ species_code: `walk-${i}`, walk_id: "w-1", ...inSector(i) })),
    /* One find of a species with a single campus observation — a Rare Catch
       that is nothing else, so it cannot hide behind Fifteen Species. */
    [sight({ species_code: "scarce", ...inSector(0) })],
  ];

  /* Every badge must be REACHABLE. A badge no journal in this spread can earn
     is either unreachable in practice or untested here, and both are bugs. */
  const fired = new Map<string, string>();
  for (const def of BADGE_LIST) {
    const sig = journal
      .map((row) => (badgeFor(row, { pool_count: new Map([["narra", 96], ["scarce", 1]]) }).find((a) => a.def.id === def.id)?.earned_at ? "1" : "0"))
      .join("");
    assert.notEqual(sig, "0".repeat(journal.length), `${def.id} is earned by no journal in this spread`);
    const clash = fired.get(sig);
    assert.equal(clash, undefined, `${clash} and ${def.id} fire identically on every journal tried`);
    fired.set(sig, def.id);
  }
});

test("Return Visit needs the same ground on a DIFFERENT day, not the same walk twice", () => {
  const same_day = [
    sight({ ...inSector(3), created_at: "2026-09-08T01:00:00.000Z" }),
    sight({ ...inSector(3), created_at: "2026-09-08T05:00:00.000Z" }),
  ];
  const got_same = badgeFor(same_day).find((a) => a.def.id === "return-visit");
  assert.equal(got_same?.earned_at, null, "two finds in one afternoon is not a return visit");

  const other_day = [
    sight({ ...inSector(3), created_at: "2026-09-08T01:00:00.000Z" }),
    sight({ ...inSector(3), created_at: "2026-09-11T01:00:00.000Z" }),
  ];
  const got_other = badgeFor(other_day).find((a) => a.def.id === "return-visit");
  assert.equal(got_other?.earned_at, "2026-09-11T01:00:00.000Z");
});

test("Return Visit ignores unlocated finds — an unlocated find is in no ground", () => {
  const row = [
    sight({ created_at: "2026-09-08T01:00:00.000Z" }),
    sight({ created_at: "2026-09-11T01:00:00.000Z" }),
  ];
  assert.equal(badgeFor(row).find((a) => a.def.id === "return-visit")?.earned_at, null);
});

test("a badge is timestamped by the sighting that COMPLETED it, not by the newest one", () => {
  const row = [
    sight({ species_code: "a", created_at: "2026-09-01T04:00:00.000Z" }),
    sight({ species_code: "b", created_at: "2026-09-02T04:00:00.000Z" }),
    sight({ species_code: "c", created_at: "2026-09-03T04:00:00.000Z" }),
    sight({ species_code: "d", created_at: "2026-09-04T04:00:00.000Z" }),
    sight({ species_code: "e", created_at: "2026-09-05T04:00:00.000Z" }),
    sight({ species_code: "f", created_at: "2026-09-06T04:00:00.000Z" }),
  ];
  const five = badgeFor(row).find((a) => a.def.id === "five-species");
  assert.equal(five?.earned_at, "2026-09-05T04:00:00.000Z", "the fifth species earned it, not the sixth");
});

test("a contribution is not a photographed find, and does not earn First Find", () => {
  const row = [sight({ entry_kind: "contribution", reported_name: "a fern" })];
  const award = badgeFor(row);
  assert.equal(award.find((a) => a.def.id === "first-find")?.earned_at, null);
  assert.ok(award.find((a) => a.def.id === "first-report")?.earned_at);
});

test("campus hour is UTC+8 and does not drift with the runner's timezone", () => {
  assert.equal(campusHour("2026-09-08T04:00:00.000Z"), 12);
  assert.equal(campusHour("2026-09-08T21:00:00.000Z"), 5);
  assert.equal(campusHour("2026-09-08T16:30:00.000Z"), 0);
});

test("earnedBadges is oldest-first, so the shelf reads as a history", () => {
  const row = [
    sight({ ...inSector(4), created_at: "2026-09-01T04:00:00.000Z" }),
    sight({ ...inSector(5), species_code: "molave", created_at: "2026-09-02T04:00:00.000Z" }),
    sight({ ...inSector(6), species_code: "katmon", created_at: "2026-09-03T04:00:00.000Z" }),
  ];
  const earned = earnedBadges(row);
  assert.ok(earned.length > 0);
  for (let i = 1; i < earned.length; i += 1) {
    assert.ok(earned[i - 1].earned_at <= earned[i].earned_at, "shelf is out of order");
  }
});
