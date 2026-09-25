import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cleanPetName,
  followStep,
  isNightHour,
  isSettled,
  PET_BOND_WINDOW_MS,
  PET_DEFAULT_NAME,
  PET_NAME_KEY,
  PET_NAME_MAX,
  PET_SLEEP_IDLE_MS,
  PET_FIGURE_SHARE,
  PET_SNAP_METER,
  petBond,
  petOffset,
  petPx,
  petState,
  petStatusLine,
  readPetName,
  writePetName,
} from "../src/pet.ts";

const NOON = 12;
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-09-26T10:00:00+08:00");

function find(id: string, ago_ms: number) {
  return { sighting_id: id, created_at: new Date(NOW - ago_ms).toISOString() };
}

describe("pet state machine", () => {
  it("flies while walking, perches when still", () => {
    assert.deepEqual(petState({ is_walking: true, idle_ms: 0, hour: NOON }), { pose: "fly", reason: "walking" });
    assert.deepEqual(petState({ is_walking: false, idle_ms: 1000, hour: NOON }), { pose: "perch", reason: "still" });
  });

  it("dozes off exactly at the idle threshold, not before", () => {
    assert.equal(petState({ is_walking: false, idle_ms: PET_SLEEP_IDLE_MS - 1, hour: NOON }).pose, "perch");
    assert.deepEqual(petState({ is_walking: false, idle_ms: PET_SLEEP_IDLE_MS, hour: NOON }), {
      pose: "sleep",
      reason: "idle",
    });
    assert.equal(PET_SLEEP_IDLE_MS, 120_000);
  });

  it("walking wakes it from an idle doze", () => {
    assert.equal(petState({ is_walking: true, idle_ms: PET_SLEEP_IDLE_MS * 5, hour: NOON }).pose, "fly");
  });

  it("night window is 22:00 to 06:00, inclusive of 22 and exclusive of 6", () => {
    assert.deepEqual(
      [21, 22, 23, 0, 3, 5, 6, 7].map(isNightHour),
      [false, true, true, true, true, true, false, false],
    );
  });

  it("at night it sleeps as soon as you stop, and flies only while you walk", () => {
    assert.deepEqual(petState({ is_walking: false, idle_ms: 0, hour: 23 }), { pose: "sleep", reason: "night" });
    assert.deepEqual(petState({ is_walking: true, idle_ms: 0, hour: 2 }), { pose: "fly", reason: "night_walk" });
  });

  it("status lines never claim to measure the user", () => {
    for (const reason of ["walking", "night_walk", "still", "idle", "night"] as const) {
      const line = petStatusLine("Agila", { pose: "sleep", reason });
      assert.match(line, /^Agila /);
      assert.doesNotMatch(line, /your sleep|you slept|hours of sleep|sleep score/i);
    }
  });
});

describe("pet bond", () => {
  it("starts at the bottom with no finds", () => {
    const bond = petBond([], NOW);
    assert.equal(bond.week_find_count, 0);
    assert.equal(bond.step, 0);
    assert.equal(bond.label, "Just met");
    assert.equal(bond.to_next, 1);
    assert.equal(bond.is_demo, false);
  });

  it("counts only finds inside the rolling 7 days", () => {
    const row = [
      find("a", DAY),
      find("b", 3 * DAY),
      find("c", PET_BOND_WINDOW_MS - 1),
      find("old", PET_BOND_WINDOW_MS + 1),
      find("future", -DAY),
      { sighting_id: "bad", created_at: "not a date" },
    ];
    const bond = petBond(row, NOW);
    assert.equal(bond.week_find_count, 3);
    assert.equal(bond.label, "Friendly");
    assert.equal(bond.to_next, 3);
  });

  it("steps up at the thresholds and stops at the top", () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => find(`s${i}`, 1000 * (i + 1)));
    assert.equal(petBond(many(1), NOW).label, "Curious");
    assert.equal(petBond(many(5), NOW).label, "Friendly");
    assert.equal(petBond(many(6), NOW).label, "Trusting");
    const top = petBond(many(12), NOW);
    assert.equal(top.label, "Bonded");
    assert.equal(top.to_next, null);
    assert.equal(top.week_find_count, 12);
  });

  it("flags seeded demo rows so the card can say so", () => {
    assert.equal(petBond([find("demo-1", DAY)], NOW).is_demo, true);
    assert.equal(petBond([find("real-1", DAY)], NOW).is_demo, false);
    assert.equal(petBond([find("demo-old", 30 * DAY)], NOW).is_demo, false);
  });
});

describe("pet name", () => {
  it("cleans, caps and falls back", () => {
    assert.equal(cleanPetName("  Blue   Boy "), "Blue Boy");
    assert.equal(cleanPetName(""), PET_DEFAULT_NAME);
    assert.equal(cleanPetName(null), PET_DEFAULT_NAME);
    assert.equal(cleanPetName("   "), PET_DEFAULT_NAME);
    assert.equal(cleanPetName("x".repeat(40)).length, PET_NAME_MAX);
  });

  it("round-trips through a store, and survives a broken one", () => {
    const map = new Map<string, string>();
    const store = { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v) };
    assert.equal(readPetName(store), "Agila");
    assert.equal(writePetName(store, "  Hawkeye "), "Hawkeye");
    assert.equal(map.get(PET_NAME_KEY), "Hawkeye");
    assert.equal(readPetName(store), "Hawkeye");
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    assert.equal(readPetName(broken), "Agila");
    assert.equal(writePetName(broken, "Kid"), "Kid");
    assert.equal(readPetName(null), "Agila");
  });
});

describe("pet follow", () => {
  const walker = { lat: 14.6394, lon: 121.0778 };

  it("closes half the gap per half-life, and never overshoots", () => {
    const pet = { lat: walker.lat + 0.0001, lon: walker.lon };
    const next = followStep(pet, walker, 420, 420);
    assert.ok(Math.abs(next.lat - (walker.lat + 0.00005)) < 1e-9);
    const far_step = followStep(pet, walker, 100_000, 420);
    assert.ok(far_step.lat >= walker.lat);
  });

  it("snaps on a jump and settles when close", () => {
    const jumped = { lat: walker.lat + PET_SNAP_METER / 100_000, lon: walker.lon };
    assert.deepEqual(followStep(jumped, walker, 16), walker);
    const close = { lat: walker.lat + 1e-8, lon: walker.lon };
    assert.ok(isSettled(followStep(close, walker, 16), walker));
    assert.deepEqual(followStep(null, walker, 16), walker);
  });
});

describe("pet leash and perch", () => {
  const walker = { lat: 14.6394, lon: 121.0778 };
  const METER = 111_320;

  function gapMeter(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
    const dy = (a.lat - b.lat) * METER;
    const dx = (a.lon - b.lon) * METER * Math.cos((a.lat * Math.PI) / 180);
    return Math.hypot(dx, dy);
  }

  it("never trails further than the leash, however fast the walker goes", () => {
    /* A walk-to at the stick's top pace: 16 m/s, a 50 ms tick, 60 frames. */
    let pet: { lat: number; lon: number } | null = walker;
    let at = walker;
    let worst = 0;
    for (let i = 0; i < 60; i += 1) {
      at = { lat: at.lat + 0.8 / METER, lon: at.lon };
      pet = followStep(pet, at, 16, 420, 1.5);
      worst = Math.max(worst, gapMeter(pet, at));
    }
    assert.ok(worst <= 1.5 + 1e-6, `trailed ${worst.toFixed(2)} m on a 1.5 m leash`);
    /* Still BEHIND the walker, on the line it came along — a lag, not a jump. */
    assert.ok(pet.lat < at.lat);
    assert.ok(Math.abs(pet.lon - at.lon) < 1e-12);
  });

  it("leaves a lag inside the leash alone", () => {
    const pet = { lat: walker.lat + 0.5 / METER, lon: walker.lon };
    assert.deepEqual(followStep(pet, walker, 16, 420, 5), followStep(pet, walker, 16, 420));
  });

  it("perches beside the walker, not over it, at every walker size", () => {
    for (const avatar of [82, 105, 136, 172]) {
      const size = petPx(avatar);
      for (const pose of ["perch", "sleep", "fly"] as const) {
        const o = petOffset(pose, avatar, size);
        /* The eagle's left edge clears the walker figure's right edge. */
        assert.ok(o.x - size / 2 >= (avatar * PET_FIGURE_SHARE) / 2, `${pose} at ${avatar}px overlaps`);
        /* And stays close: its centre within ~1.2 walker widths of the feet. */
        assert.ok(Math.hypot(o.x, o.y) <= avatar * 1.2, `${pose} at ${avatar}px strays`);
      }
      assert.deepEqual(petOffset("perch", avatar, size), petOffset("sleep", avatar, size));
      assert.ok(petOffset("fly", avatar, size).y < petOffset("perch", avatar, size).y, "flies above its perch");
    }
  });

  it("scales the eagle with the walker, within bounds", () => {
    assert.ok(petPx(172) > petPx(82));
    assert.equal(petPx(0), 40);
    assert.equal(petPx(1000), 72);
  });
});
