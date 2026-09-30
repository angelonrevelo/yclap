import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CODE_MISS_MAX,
  CODE_MISS_WINDOW_MS,
  joinCodeOf,
  lookupByCode,
  MemoryCampusStore,
  sanitizePlayer,
  sanitizeSighting,
  walkerIdOf,
  worldFrom,
  type WorldFind,
} from "../src/campus-world.ts";
import { RateWindow } from "../src/rate-limit.ts";
import {
  addFriend,
  groupMember,
  groupStreak,
  MAX_FRIEND,
  readFriend,
  removeFriend,
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

function find(walker_id: string, iso: string, name = "A walker"): WorldFind {
  return {
    sighting_id: `${walker_id}-${iso}`,
    walker_id,
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
    const one = addFriend([], { walker_id: "p2", name: "Molave Walker 4" }, ME);
    writeFriend(one, storage);
    assert.equal(readFriend(storage).length, 1);
    assert.equal(readFriend(storage)[0].name, "Molave Walker 4");
  });

  it("refuses to add you to your own group", () => {
    /* The group already contains you. Adding yourself would double-count the
       one member whose weeks the personal streak already tracks. */
    assert.deepEqual(addFriend([], { walker_id: ME, name: "Me" }, ME), []);
  });

  it("is idempotent — adding the same walker twice changes nothing", () => {
    const one = addFriend([], { walker_id: "p2", name: "B" }, ME);
    assert.equal(addFriend(one, { walker_id: "p2", name: "B again" }, ME).length, 1);
  });

  it("caps the roster rather than growing without bound", () => {
    let roster: Friend[] = [];
    for (let i = 0; i < MAX_FRIEND + 6; i += 1) {
      roster = addFriend(roster, { walker_id: `p${i}`, name: `W${i}` }, ME);
    }
    assert.equal(roster.length, MAX_FRIEND);
  });

  it("removes cleanly", () => {
    const two = addFriend(addFriend([], { walker_id: "a", name: "A" }, ME), { walker_id: "b", name: "B" }, ME);
    assert.deepEqual(removeFriend(two, "a").map((f) => f.walker_id), ["b"]);
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

describe("partner lookup by code — never hands out the partner", () => {
  function storeWith(...player_id: string[]): MemoryCampusStore {
    const store = new MemoryCampusStore();
    for (const id of player_id) {
      const row = sanitizePlayer({ player_id: id, name: `Walker ${id}` });
      if (row) store.upsertPlayer(row);
    }
    return store;
  }
  const brake = () => new RateWindow(CODE_MISS_MAX, CODE_MISS_WINDOW_MS);

  it("/partner answers with the walker_id and a name, and no player_id", () => {
    const got = lookupByCode(storeWith("p3"), "/partner", joinCodeOf("p3"), "1.2.3.4", brake());
    assert.equal(got.status, 200);
    assert.deepEqual(got.body, { walker_id: walkerIdOf("p3"), name: "Walker p3" });
    assert.ok(!("player_id" in (got.body as object)), "the raw id is nowhere in the answer");
  });

  it("/join still answers with the player_id — that code IS the credential", () => {
    const got = lookupByCode(storeWith("p3"), "/join", joinCodeOf("p3"), "1.2.3.4", brake());
    assert.equal((got.body as { player_id: string }).player_id, "p3");
  });

  it("ignores case and spacing, the way a typed code arrives", () => {
    const got = lookupByCode(storeWith("p2"), "/partner", ` ${joinCodeOf("p2").toLowerCase()} `, "1.2.3.4", brake());
    assert.equal(got.status, 200);
  });

  it("brakes an address after CODE_MISS_MAX wrong codes, and never counts a right one", () => {
    const store = storeWith("p2");
    const b = brake();
    for (let i = 0; i < 50; i++) assert.equal(lookupByCode(store, "/partner", joinCodeOf("p2"), "9.9.9.9", b).status, 200);
    for (let i = 0; i < CODE_MISS_MAX; i++) assert.equal(lookupByCode(store, "/join", "ZZZZZZ", "9.9.9.9", b).status, 404);
    assert.equal(lookupByCode(store, "/join", joinCodeOf("p2"), "9.9.9.9", b).status, 429, "even a right code waits once braked");
    assert.equal(lookupByCode(store, "/join", "ZZZZZZ", "8.8.8.8", b).status, 404, "another address is not braked");
  });
});

describe("the world payload carries no player_id", () => {
  it("names walkers and finds by walker_id only", () => {
    const store = new MemoryCampusStore();
    const secret = "secret-player-0001";
    const row = sanitizePlayer({ player_id: secret, name: "Narra Walker 1" });
    if (row) store.upsertPlayer(row);
    const sighting = sanitizeSighting({ sighting_id: "s1", species_code: "narra", common_name: "Narra", lat: 14.639, lon: 121.078, entry_kind: "badge", created_at: new Date().toISOString() }, secret);
    if (sighting) store.insertSighting(sighting);
    const text = JSON.stringify(worldFrom(store));
    assert.ok(!text.includes(secret), "the bearer secret never leaves the server");
    assert.ok(!text.includes("player_id"), "and neither does the field");
    assert.ok(text.includes(walkerIdOf(secret)));
  });
});

describe("a roster saved before 10-01", () => {
  it("is re-keyed by walker_id on read, and the next write stores no player_id", () => {
    const storage = memoryStorage();
    storage.setItem("field-guide.friend", JSON.stringify([{ player_id: "p2", name: "Molave", join_code: "ABC234", added_at: "t" }]));
    const friend = readFriend(storage);
    assert.equal(friend[0].walker_id, walkerIdOf("p2"));
    writeFriend(friend, storage);
    assert.ok(!(storage.getItem("field-guide.friend") ?? "").includes("player_id"));
  });
});

describe("the group streak", () => {
  const now = new Date("2026-09-24T09:00:00Z");
  const this_week = "2026-09-22T09:00:00Z";
  const last_week = "2026-09-15T09:00:00Z";
  const two_back = "2026-09-08T09:00:00Z";
  const member = groupMember(
    [
      { walker_id: "p2", name: "Molave", join_code: "", added_at: "" },
      { walker_id: "p3", name: "Dao", join_code: "", added_at: "" },
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
