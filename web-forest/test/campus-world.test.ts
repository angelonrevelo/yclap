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

describe("/sync input is not believed blindly (10-01 audit)", () => {
  it("an off-campus point is dropped, a future date is dated now, the fix source is kept and never invented", async () => {
    const { sanitizeSighting } = await import("../src/campus-world.ts");
    const now = Date.parse("2026-10-10T04:00:00Z");
    const base = { sighting_id: "s-1", species_code: "narra", common_name: "Narra", created_at: "2026-10-10T03:00:00Z" };
    const off = sanitizeSighting({ ...base, lat: 10.3, lon: 123.9, fix_source: "gps" }, "p-1", now);
    assert.equal(off?.lat, null);
    assert.equal(off?.fix_source, "gps");
    const on = sanitizeSighting({ ...base, lat: 14.639, lon: 121.078, fix_source: "play" }, "p-1", now);
    assert.equal(on?.lat, 14.639);
    assert.equal(on?.fix_source, "play");
    assert.equal(sanitizeSighting({ ...base, fix_source: "satellite" }, "p-1", now)?.fix_source, null);
    assert.equal(sanitizeSighting({ ...base, created_at: "2027-01-01T00:00:00Z" }, "p-1", now)?.created_at, new Date(now).toISOString());
  });
});

describe("the server bounds the points a phone claims (10-01)", () => {
  it("a phone claiming a million points with two finds is shown at the ceiling those finds explain", async () => {
    const { MemoryCampusStore, mergeSync, pointCeiling, sanitizePlayer, sanitizeSighting } = await import("../src/campus-world.ts");
    const store = new MemoryCampusStore();
    const player = sanitizePlayer({ player_id: "p-cheat-0001", name: "Ana", total_points: 1_000_000 })!;
    const row = [
      sanitizeSighting({ sighting_id: "s1", species_code: "narra", lat: 14.639, lon: 121.078, created_at: "2026-10-10T03:00:00Z" }, player.player_id)!,
      sanitizeSighting({ sighting_id: "s2", species_code: "dao", lat: 14.6392, lon: 121.0781, created_at: "2026-10-10T03:05:00Z" }, player.player_id)!,
    ];
    mergeSync(store, player, row);
    const kept = store.player.find((p) => p.player_id === player.player_id)!;
    assert.equal(kept.total_points, pointCeiling(row));
    assert.ok(kept.total_points < 3000);
    /* An honest total under the ceiling is left alone. */
    mergeSync(store, { ...player, total_points: 120 }, []);
    assert.equal(store.player.find((p) => p.player_id === player.player_id)!.total_points, 120);
  });
});
