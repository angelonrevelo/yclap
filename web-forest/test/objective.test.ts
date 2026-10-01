import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dayKeyOf, dayStartOf, meterToPond, OBJECTIVE, objectiveForDay, objectiveProgress, SHORE_M } from "../src/objective.ts";
import type { Sighting } from "../src/journal.ts";

/* ── today's objectives (Gelo 10-01: "more objectives, doable by anyone") ── */

const NOW = Date.parse("2026-10-10T04:00:00Z"); // 12:00 in Manila
const sighting = (over: Partial<Sighting>): Sighting => ({
  sighting_id: Math.random().toString(36),
  species_code: "narra",
  photo_data: null,
  created_at: new Date(NOW - 3600_000).toISOString(),
  inat_scientific_name: null,
  inat_common_name: null,
  lat: 14.64,
  lon: 121.078,
  accuracy_m: 8,
  fix_source: "gps",
  note: null,
  walk_id: null,
  entry_kind: "badge",
  reported_name: null,
  entry_index: 1,
  ...over,
});
const base = { now_ms: NOW, sighting: [] as Sighting[], point_event: [], walk_track: [], native_code: new Set(["narra", "molave"]) };
const one = (id: string) => OBJECTIVE.filter((o) => o.objective_id === id);

describe("objectives", () => {
  it("every day has one look, one log and one move objective, the same on every phone", () => {
    for (const day of ["2026-10-10", "2026-10-11", "2026-12-25"]) {
      const pick = objectiveForDay(day);
      assert.deepEqual(pick.map((o) => o.family), ["look", "log", "move"]);
      assert.deepEqual(objectiveForDay(day), pick);
    }
  });

  it("the catalogue has a no-walking objective, and only one needs real GPS", () => {
    assert.ok(OBJECTIVE.some((o) => o.family === "look"));
    assert.equal(OBJECTIVE.filter((o) => o.is_gps_only).length, 1);
  });

  it("today is Manila's day: 07:00 UTC on the 10th is the 10th, 17:00 UTC is the 11th", () => {
    assert.equal(dayKeyOf(Date.parse("2026-10-10T07:00:00Z")), "2026-10-10");
    assert.equal(dayKeyOf(Date.parse("2026-10-10T17:00:00Z")), "2026-10-11");
    assert.equal(new Date(dayStartOf(NOW)).toISOString(), "2026-10-09T16:00:00.000Z");
  });

  it("logs count only today; a species already in the journal is not new", () => {
    const row = [sighting({ created_at: "2026-10-01T00:00:00Z" }), sighting({}), sighting({ species_code: "dao", photo_data: "x" })];
    const p = objectiveProgress({ ...base, sighting: row }, [...one("log-3"), ...one("log-new"), ...one("log-photo"), ...one("log-native")]);
    assert.deepEqual(p.map((o) => [o.objective_id, o.current, o.is_done]), [["log-3", 2, false], ["log-new", 1, true], ["log-photo", 1, true], ["log-native", 1, true]]);
  });

  it("the GPS walk ignores stick fixes and jumps faster than a run", () => {
    const track = Array.from({ length: 11 }, (_, i) => ({ lat: 14.64 + i * 0.0004, lon: 121.078, at: NOW - 600_000 + i * 30_000, source: "gps" as const }));
    track.push({ lat: 14.66, lon: 121.078, at: NOW - 299_000, source: "gps" }); // 2 km in a second
    const stick = track.map((f) => ({ ...f, source: "play" as const }));
    assert.equal(objectiveProgress({ ...base, walk_track: track }, one("move-gps-400"))[0].is_done, true);
    assert.equal(objectiveProgress({ ...base, walk_track: stick }, one("move-gps-400"))[0].current, 0);
  });

  it("the pond objective counts a log within 25 m of the pond", () => {
    const near = { lat: 14.63871, lon: 121.07609 };
    assert.ok(meterToPond(near) <= SHORE_M);
    assert.equal(objectiveProgress({ ...base, sighting: [sighting(near)] }, one("move-shore"))[0].is_done, true);
    assert.equal(objectiveProgress({ ...base, sighting: [sighting({ lat: 14.645, lon: 121.08 })] }, one("move-shore"))[0].is_done, false);
  });

  it("the reward key is once per objective per day", () => {
    const [a] = objectiveProgress(base, one("learn-3"));
    assert.equal(a.award_key, "objective:2026-10-10:learn-3");
  });
});
