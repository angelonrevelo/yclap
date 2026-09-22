import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { joinCodeOf, type WorldFind, type WorldWalker } from "../src/campus-world.ts";
import {
  addFriend,
  groupMember,
  groupStreak,
  MAX_FRIEND,
  readFriend,
  removeFriend,
  walkerByJoinCode,
  writeFriend,
  type Friend,
} from "../src/friend.ts";
import { flameScale, FLAME_MAX_GROWTH, heatFor } from "../src/streak-heat.ts";

const ME = "me-0001";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

function find(player_id: string, iso: string, name = "A walker"): WorldFind {
  return {
    sighting_id: `${player_id}-${iso}`,
    player_id,
    player_name: name,
    species_code: "narra",
    common_name: "Narra",
    lat: 14.64,
    lon: 121.077,
    entry_kind: "badge",
    created_at: iso,
  };
}

describe("the roster", () => {
  it("starts empty and survives a round trip", () => {
    const storage = memoryStorage();
    assert.deepEqual(readFriend(storage), []);
    const one = addFriend([], { player_id: "p2", name: "Molave Walker 4" }, ME);
    writeFriend(one, storage);
    assert.equal(readFriend(storage).length, 1);
    assert.equal(readFriend(storage)[0].name, "Molave Walker 4");
  });

  it("refuses to add you to your own group", () => {
    /* The group already contains you. Adding yourself would double-count the
       one member whose weeks the personal streak already tracks. */
    assert.deepEqual(addFriend([], { player_id: ME, name: "Me" }, ME), []);
  });

  it("is idempotent — adding the same walker twice changes nothing", () => {
    const one = addFriend([], { player_id: "p2", name: "B" }, ME);
    assert.equal(addFriend(one, { player_id: "p2", name: "B again" }, ME).length, 1);
  });

  it("caps the roster rather than growing without bound", () => {
    let roster: Friend[] = [];
    for (let i = 0; i < MAX_FRIEND + 6; i += 1) {
      roster = addFriend(roster, { player_id: `p${i}`, name: `W${i}` }, ME);
    }
    assert.equal(roster.length, MAX_FRIEND);
  });

  it("removes cleanly", () => {
    const two = addFriend(addFriend([], { player_id: "a", name: "A" }, ME), { player_id: "b", name: "B" }, ME);
    assert.deepEqual(removeFriend(two, "a").map((f) => f.player_id), ["b"]);
    /* Removing somebody who is not there is not an error. */
    assert.equal(removeFriend(two, "zz").length, 2);
  });

  it("survives a corrupted store instead of throwing on boot", () => {
    const storage = memoryStorage();
    storage.setItem("field-guide.friend", "{not json");
    assert.deepEqual(readFriend(storage), []);
    storage.setItem("field-guide.friend", JSON.stringify([{ nope: 1 }, { player_id: "ok", name: "N" }]));
    assert.equal(readFriend(storage).length, 1);
  });
});

describe("walkerByJoinCode", () => {
  const walker: WorldWalker[] = [
    { player_id: "p2", name: "Molave Walker 4", stage: "sprout", level: 2, total_points: 80, streak_weeks: 1, updated_at: "" },
    { player_id: "p3", name: "Dao Walker 9", stage: "egg", level: 1, total_points: 10, streak_weeks: 0, updated_at: "" },
  ];

  it("finds a walker by their own code", () => {
    const hit = walkerByJoinCode(walker, joinCodeOf("p3"), joinCodeOf);
    assert.equal(hit?.player_id, "p3");
  });

  it("ignores case and spacing, the way a typed code arrives", () => {
    const code = joinCodeOf("p2");
    const hit = walkerByJoinCode(walker, ` ${code.toLowerCase()} `, joinCodeOf);
    assert.equal(hit?.player_id, "p2");
  });

  it("returns null for a code nobody holds, rather than a nearest match", () => {
    assert.equal(walkerByJoinCode(walker, "ZZZZZZ", joinCodeOf), null);
    assert.equal(walkerByJoinCode(walker, "SHORT", joinCodeOf), null);
    assert.equal(walkerByJoinCode(walker, "", joinCodeOf), null);
  });
});

describe("the group streak", () => {
  const now = new Date("2026-09-24T09:00:00Z");
  const this_week = "2026-09-22T09:00:00Z";
  const last_week = "2026-09-15T09:00:00Z";
  const two_back = "2026-09-08T09:00:00Z";
  const member = groupMember(
    [
      { player_id: "p2", name: "Molave", join_code: "", added_at: "" },
      { player_id: "p3", name: "Dao", join_code: "", added_at: "" },
    ],
    ME,
  );

  it("counts you plus your friends", () => {
    assert.equal(member.size, 3);
    assert.ok(member.has(ME));
  });

  it("stays alive on one member's week — the Working Doc rule", () => {
    /* Nobody but p3 walked. The group's week is carried anyway. That IS the
       feature: a week a friend carries is a week you did not have to. */
    const streak = groupStreak(
      [find("p3", this_week, "Dao"), find("p3", last_week, "Dao"), find("p3", two_back, "Dao")],
      member,
      now,
    );
    assert.equal(streak.weeks, 3);
    assert.equal(streak.is_week_carried, true);
    assert.deepEqual(streak.carried_by, ["Dao"]);
  });

  it("ignores finds by walkers outside the group", () => {
    const streak = groupStreak([find("stranger", this_week), find("stranger", last_week)], member, now);
    assert.equal(streak.weeks, 0);
    assert.equal(streak.is_week_carried, false);
  });

  it("breaks on a missed week", () => {
    /* This week and two weeks back, but nothing last week. The run ends. */
    const streak = groupStreak([find("p2", this_week), find("p2", two_back)], member, now);
    assert.equal(streak.weeks, 1);
  });

  it("does not punish a week that is not over yet", () => {
    /* Nothing logged this week, but last week and the week before were. The
       streak is 2 and still standing — the week has not been missed, it has
       not finished. */
    const streak = groupStreak([find("p2", last_week), find("p2", two_back)], member, now);
    assert.equal(streak.weeks, 2);
    assert.equal(streak.is_week_carried, false);
    assert.deepEqual(streak.carried_by, []);
  });

  it("names everyone who carried this week, once each", () => {
    const streak = groupStreak(
      [find("p2", this_week, "Molave"), find("p3", this_week, "Dao"), find("p2", this_week, "Molave")],
      member,
      now,
    );
    assert.deepEqual(streak.carried_by, ["Dao", "Molave"]);
  });

  it("is a streak, not a scoreboard", () => {
    /* One find and fifty finds produce the same week. If this ever starts
       counting, the group has quietly become a leaderboard — which is the
       thing a shared streak was chosen INSTEAD of (`35:37`). */
    const one = groupStreak([find("p2", this_week)], member, now);
    /* Fifty finds, all inside the SAME week (22-24 Sep 2026 is Tue-Thu of one
       ISO week). Spreading them wider would test the week boundary, which is a
       different assertion. */
    const many = groupStreak(
      Array.from({ length: 50 }, (_, i) => find("p2", `2026-09-2${2 + (i % 3)}T09:00:00Z`)),
      member,
      now,
    );
    assert.equal(one.weeks, 1);
    assert.equal(many.weeks, 1);
  });

  it("is zero for a solo walker who has logged nothing", () => {
    const solo = groupStreak([], groupMember([], ME), now);
    assert.equal(solo.weeks, 0);
    assert.equal(solo.member_count, 1);
  });

  it("drops an unparseable timestamp instead of counting it as a week", () => {
    const streak = groupStreak([find("p2", "not-a-date")], member, now);
    assert.equal(streak.weeks, 0);
  });
});

describe("the streak flame", () => {
  it("is cold and grey at zero, never absent", () => {
    const cold = heatFor(0);
    assert.equal(cold.glow, "rgba(0,0,0,0)");
    assert.equal(cold.label, "No streak yet");
  });

  it("climbs a heat ramp rather than a size ramp", () => {
    /* The bands must be distinct colours — that is the growth signal the
       recording asked for, and the reason the flame does not have to get
       bigger to say "longer". */
    const seen = new Set([0, 1, 3, 6, 12].map((w) => heatFor(w).edge));
    assert.equal(seen.size, 5);
  });

  it("keeps the fire small — 14% of growth across sixty weeks", () => {
    assert.equal(flameScale(0), 1);
    assert.ok(flameScale(60) <= 1 + FLAME_MAX_GROWTH + 1e-9);
    assert.ok(flameScale(520) <= 1 + FLAME_MAX_GROWTH + 1e-9, "the flame grows without bound");
    assert.ok(flameScale(6) > flameScale(1), "the flame never grows at all");
  });

  it("never falls back down a band as the streak grows", () => {
    let last = -1;
    for (let w = 0; w <= 60; w += 1) {
      const band = [0, 1, 3, 6, 12].filter((a) => w >= a).length;
      assert.ok(band >= last, `band fell at week ${w}`);
      last = band;
      assert.ok(heatFor(w).core.startsWith("#"));
    }
  });
});
