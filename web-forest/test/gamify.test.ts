import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  POINT_VALUE,
  alreadyAwarded,
  awardPoints,
  buddyStageFor,
  buddyProgress,
  challengeProgress,
  dailySubject,
  dailyTaskFor,
  dayKey,
  gamifySnapshot,
  isLocalVerified,
  isTreeEntry,
  localLeaderboard,
  localObsStatus,
  observeAwardKind,
  observeSubject,
  participatedThisWeek,
  speciesFromSubject,
  totalPoints,
  weekKey,
  weeklyStreak,
  type PointEvent,
} from "../src/gamify.ts";

function ev(over: Partial<PointEvent> & Pick<PointEvent, "kind" | "subject_key" | "at">): PointEvent {
  return {
    event_id: over.event_id ?? `${over.kind}-${over.subject_key}`,
    points: over.points ?? POINT_VALUE[over.kind],
    ...over,
  };
}

describe("point values (Working Doc)", () => {
  it("matches Explore 10, Learn 10, Observe 25, Hunt 40, Verified Discovery 50", () => {
    assert.equal(POINT_VALUE.explore, 10);
    assert.equal(POINT_VALUE.learn, 10);
    assert.equal(POINT_VALUE.observe, 25);
    assert.equal(POINT_VALUE.challenge, 40);
    assert.equal(POINT_VALUE.verified_discovery, 50);
    assert.ok(POINT_VALUE.challenge > POINT_VALUE.observe);
  });
});

describe("awardPoints", () => {
  it("awards once per kind+subject and sums totals", () => {
    const a = awardPoints([], "explore", "sector:a");
    assert.equal(a.awarded, true);
    assert.equal(a.total_points, 10);
    const b = awardPoints(a.events, "explore", "sector:a");
    assert.equal(b.awarded, false);
    assert.equal(b.total_points, 10);
    const c = awardPoints(a.events, "learn", "species:narra");
    assert.equal(c.awarded, true);
    assert.equal(c.total_points, 20);
  });

  it("alreadyAwarded mirrors the dedup rule", () => {
    const { events } = awardPoints([], "learn", "species:molave");
    assert.equal(alreadyAwarded(events, "learn", "species:molave"), true);
    assert.equal(alreadyAwarded(events, "learn", "species:narra"), false);
  });
});

describe("local verified rule", () => {
  it("needs photo + species; observeAwardKind picks 50 vs 25", () => {
    assert.equal(isLocalVerified({ photo_data: null, species_code: "narra" }), false);
    assert.equal(isLocalVerified({ photo_data: "data:x", species_code: "" }), false);
    assert.equal(isLocalVerified({ photo_data: "data:x", species_code: "narra" }), true);
    assert.equal(observeAwardKind({ photo_data: null, species_code: "narra" }), "observe");
    assert.equal(observeAwardKind({ photo_data: "data:x", species_code: "narra" }), "verified_discovery");
  });
});

describe("weekKey + weeklyStreak", () => {
  it("groups by ISO week", () => {
    assert.equal(weekKey("2026-09-09T08:00:00.000Z"), weekKey("2026-09-07T08:00:00.000Z"));
    assert.notEqual(weekKey("2026-09-09T08:00:00.000Z"), weekKey("2026-09-01T08:00:00.000Z"));
  });

  it("counts consecutive weeks of participation, not daily visits", () => {
    const now = new Date("2026-09-09T12:00:00.000Z");
    const events = [
      ev({ kind: "explore", subject_key: "sector:a", at: "2026-09-09T01:00:00.000Z" }),
      ev({ kind: "learn", subject_key: "species:narra", at: "2026-09-02T01:00:00.000Z" }),
      ev({ kind: "observe", subject_key: "sighting:narra/1", at: "2026-08-26T01:00:00.000Z" }),
    ];
    assert.equal(weeklyStreak(events, now), 3);
    assert.equal(participatedThisWeek(events, now), true);
  });

  it("keeps prior streak when this week is still idle", () => {
    const now = new Date("2026-09-09T12:00:00.000Z");
    const events = [
      ev({ kind: "explore", subject_key: "sector:a", at: "2026-09-02T01:00:00.000Z" }),
      ev({ kind: "learn", subject_key: "species:narra", at: "2026-08-26T01:00:00.000Z" }),
    ];
    assert.equal(weeklyStreak(events, now), 2);
    assert.equal(participatedThisWeek(events, now), false);
  });

  it("breaks when a week is skipped", () => {
    const now = new Date("2026-09-09T12:00:00.000Z");
    const events = [
      ev({ kind: "explore", subject_key: "sector:a", at: "2026-09-09T01:00:00.000Z" }),
      ev({ kind: "learn", subject_key: "species:narra", at: "2026-08-20T01:00:00.000Z" }),
    ];
    assert.equal(weeklyStreak(events, now), 1);
  });
});

describe("buddy stages", () => {
  it("maps Seedling → Sprout → Young Tree → Mature Tree by streak", () => {
    assert.equal(buddyStageFor(0), "seedling");
    assert.equal(buddyStageFor(1), "sprout");
    assert.equal(buddyStageFor(3), "young_tree");
    assert.equal(buddyStageFor(6), "mature_tree");
  });

  it("exposes label + next remaining from events", () => {
    const now = new Date("2026-09-09T12:00:00.000Z");
    const events = [ev({ kind: "explore", subject_key: "sector:a", at: "2026-09-09T01:00:00.000Z" })];
    const b = buddyProgress(events, now);
    assert.equal(b.label, "Hatchling");
    assert.equal(b.next?.stage, "young_tree");
    assert.equal(b.next?.remaining, 2);
  });
});

describe("challenges", () => {
  it("tracks discover N species and explore N areas", () => {
    const events = [
      ev({ kind: "explore", subject_key: "sector:a", at: "2026-09-09T01:00:00.000Z" }),
      ev({ kind: "explore", subject_key: "sector:b", at: "2026-09-09T02:00:00.000Z" }),
      ev({ kind: "verified_discovery", subject_key: "sighting:narra/1", at: "2026-09-09T03:00:00.000Z" }),
      ev({ kind: "observe", subject_key: "sighting:molave/2", at: "2026-09-09T04:00:00.000Z" }),
    ];
    assert.equal(speciesFromSubject("sighting:narra/1"), "narra");
    const prog = challengeProgress(events);
    const discover = prog.find((p) => p.kind === "discover_species")!;
    const explore = prog.find((p) => p.kind === "explore_areas")!;
    assert.equal(discover.current, 2);
    assert.equal(discover.done, true);
    assert.equal(explore.current, 2);
    assert.equal(explore.done, true);
  });
});

describe("local leaderboard", () => {
  it("includes the device user plus seeded demo rows, sorted by points", () => {
    const memory: Record<string, string> = {};
    const storage = {
      getItem: (k: string) => memory[k] ?? null,
      setItem: (k: string, v: string) => {
        memory[k] = v;
      },
      removeItem: (k: string) => {
        delete memory[k];
      },
      clear: () => {
        for (const k of Object.keys(memory)) delete memory[k];
      },
      key: () => null,
      length: 0,
    } as Storage;

    const events = [
      ev({ kind: "verified_discovery", subject_key: "sighting:narra/1", at: "2026-09-09T01:00:00.000Z" }),
      ev({ kind: "verified_discovery", subject_key: "sighting:molave/2", at: "2026-09-09T02:00:00.000Z" }),
      ev({ kind: "explore", subject_key: "sector:a", at: "2026-09-09T03:00:00.000Z" }),
    ];
    assert.equal(totalPoints(events), 110);
    const board = localLeaderboard(events, new Date("2026-09-09T12:00:00.000Z"), storage);
    assert.ok(board.some((r) => r.is_you));
    assert.ok(board.some((r) => r.is_seed));
    assert.ok(board.every((r) => typeof r.points === "number"));
    for (let i = 1; i < board.length; i += 1) {
      assert.ok(board[i - 1].points >= board[i].points);
    }
  });
});

describe("local observation status (P2 scaffold)", () => {
  it("labels verified / needs_id / duplicate without claiming AIS updates", () => {
    assert.equal(localObsStatus({ photo_data: "x", species_code: "narra" }), "verified");
    assert.equal(localObsStatus({ photo_data: null, species_code: "narra" }), "needs_id");
    assert.equal(localObsStatus({ photo_data: "x", species_code: "narra", prior_same_species: 1 }), "duplicate");
  });
});

describe("observe + daily hunt", () => {
  it("dedupes observe by species+sector, not by sighting id", () => {
    assert.equal(observeSubject("narra", "bellarmine"), "observe:narra:bellarmine");
    assert.equal(speciesFromSubject("observe:narra:bellarmine"), "narra");
    const a = awardPoints([], "observe", observeSubject("narra", "bellarmine"));
    const b = awardPoints(a.events, "observe", observeSubject("narra", "bellarmine"));
    assert.equal(a.awarded, true);
    assert.equal(b.awarded, false);
  });

  it("picks one tree + biome per player-day and marks done after hunt award", () => {
    const pool = [
      {
        species_code: "narra",
        common_name: "Narra",
        scientific_name: "Pterocarpus indicus",
        count: 20,
        origin: "Native",
        iconic_taxon_name: "Plantae",
        archetype: "tree",
        file: "species/narra.glb",
      },
      {
        species_code: "weaver",
        common_name: "Weaver",
        scientific_name: "Oecophylla",
        count: 40,
        origin: "Native",
        iconic_taxon_name: "Insecta",
        archetype: "insect",
        file: "species/weaver.glb",
      },
    ];
    const sector = [
      { sector_code: "bellarmine", name: "Bellarmine Field", is_biome: true },
      { sector_code: "asphalt", name: "Car park", is_biome: false },
    ];
    const now = new Date("2026-09-12T04:00:00.000Z");
    const a = dailyTaskFor(pool, sector, now, "player-a", []);
    const b = dailyTaskFor(pool, sector, now, "player-a", []);
    assert.ok(a);
    assert.equal(a?.species_code, b?.species_code);
    assert.equal(a?.sector_code, "bellarmine");
    assert.equal(isTreeEntry(pool[0]), true);
    assert.equal(isTreeEntry(pool[1]), false);
    assert.equal(a?.is_done, false);
    const awarded = awardPoints([], "challenge", dailySubject(dayKey(now)));
    const done = dailyTaskFor(pool, sector, now, "player-a", awarded.events);
    assert.equal(done?.is_done, true);
  });
});

describe("gamifySnapshot", () => {
  it("bundles points, streak, buddy, challenges, leaderboard", () => {
    const memory: Record<string, string> = {};
    const storage = {
      getItem: (k: string) => memory[k] ?? null,
      setItem: (k: string, v: string) => {
        memory[k] = v;
      },
      removeItem: (k: string) => {
        delete memory[k];
      },
      clear: () => {},
      key: () => null,
      length: 0,
    } as Storage;
    const events = [ev({ kind: "explore", subject_key: "sector:a", at: "2026-09-09T01:00:00.000Z" })];
    const snap = gamifySnapshot(events, new Date("2026-09-09T12:00:00.000Z"), storage);
    assert.equal(snap.total_points, 10);
    assert.equal(snap.streak_weeks, 1);
    assert.equal(snap.buddy.stage, "sprout");
    assert.ok(snap.leaderboard.length >= 2);
    assert.ok(snap.challenges.length >= 2);
  });
});
