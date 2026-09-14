import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MemoryCampusStore,
  joinCodeOf,
  mergeSync,
  normalizeJoinCode,
  sanitizePlayer,
  sanitizeSighting,
  worldFrom,
} from "../src/campus-world.ts";

describe("join code", () => {
  it("is six characters and stable for a player_id", () => {
    const a = joinCodeOf("p-one");
    const b = joinCodeOf("p-one");
    assert.equal(a.length, 6);
    assert.equal(a, b);
    assert.notEqual(joinCodeOf("p-two"), a);
  });

  it("normalizes typed codes", () => {
    assert.equal(normalizeJoinCode(" ab-12c "), "AB12C");
  });
});

describe("campus merge", () => {
  it("upserts a walker and inserts a find once", () => {
    const store = new MemoryCampusStore();
    const player = sanitizePlayer({
      player_id: "p1",
      name: "Narra Walker 1",
      total_points: 40,
      streak_weeks: 1,
    });
    assert.ok(player);
    const row = sanitizeSighting(
      {
        sighting_id: "narra-1",
        species_code: "narra",
        common_name: "Narra",
        lat: 14.64,
        lon: 121.07,
        created_at: new Date().toISOString(),
      },
      player.player_id,
    );
    assert.ok(row);
    assert.equal(mergeSync(store, player, [row]).merged, 1);
    assert.equal(mergeSync(store, player, [row]).merged, 0);
    const world = worldFrom(store);
    assert.equal(world.totals.sighting_count, 1);
    assert.equal(world.walker.length, 1);
    assert.equal(world.walker[0]?.total_points, 40);
    assert.equal(world.find[0]?.common_name, "Narra");
    assert.match(world.note, /no rank/i);
  });

  it("looks a walker up by join_code and returns their finds", () => {
    const store = new MemoryCampusStore();
    const player = sanitizePlayer({ player_id: "p-join", name: "Molave Walker 9" });
    assert.ok(player);
    mergeSync(store, player, []);
    const found = store.playerByJoin(player.join_code);
    assert.equal(found?.player_id, "p-join");
    assert.equal(store.playerByJoin("XXXXXX"), null);
  });

  it("drops a sighting that is not a species row", () => {
    assert.equal(sanitizeSighting({ sighting_id: "", species_code: "narra" }, "p1"), null);
    assert.equal(sanitizePlayer({ name: "x" }), null);
  });
});
