import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readPlayer, toWire, writePlayer } from "../src/sync.ts";
import { mergeRemoteSighting, readSighting, writeSighting } from "../src/journal.ts";
import { withLiveWalker, type LeaderboardRow } from "../src/gamify.ts";

if (typeof globalThis.localStorage === "undefined") {
  const mem = new Map<string, string>();
  (globalThis as { localStorage: Storage }).localStorage = {
    get length() {
      return mem.size;
    },
    clear() {
      mem.clear();
    },
    getItem(key: string) {
      return mem.get(key) ?? null;
    },
    key(i: number) {
      return [...mem.keys()][i] ?? null;
    },
    removeItem(key: string) {
      mem.delete(key);
    },
    setItem(key: string, value: string) {
      mem.set(key, value);
    },
  };
}

class MemoryStorage {
  store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  key(i: number) {
    return [...this.store.keys()][i] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}

describe("player identity", () => {
  it("mints a join_code and keeps it on reload", () => {
    const storage = new MemoryStorage();
    const a = readPlayer(storage);
    const b = readPlayer(storage);
    assert.equal(a.player_id, b.player_id);
    assert.equal(a.join_code.length, 6);
    assert.equal(a.join_code, b.join_code);
  });

  it("adopts another walker", () => {
    const storage = new MemoryStorage();
    writePlayer({ player_id: "remote-1", name: "Dao Walker 4", join_code: "ABCDEF" }, storage);
    const me = readPlayer(storage);
    assert.equal(me.player_id, "remote-1");
    assert.equal(me.join_code, "ABCDEF");
  });
});

describe("wire + pull", () => {
  it("maps a journal row without a photo", () => {
    const wire = toWire(
      {
        sighting_id: "narra-9",
        species_code: "narra",
        lat: 14.6,
        lon: 121.0,
        created_at: "2026-09-12T00:00:00.000Z",
      },
      "Narra",
    );
    assert.equal(wire.common_name, "Narra");
    assert.equal("photo_data" in wire, false);
  });
});

describe("live board", () => {
  it("folds another walker in without inventing an official rank field", () => {
    const you: LeaderboardRow = {
      player_id: "me",
      name: "You",
      points: 40,
      streak_weeks: 1,
      is_you: true,
      is_seed: false,
    };
    const row = withLiveWalker(
      [you],
      [{ player_id: "them", name: "Katmon Walker 2", total_points: 80, streak_weeks: 2 }],
      "me",
    );
    assert.equal(row[0]?.player_id, "them");
    assert.equal(row[0]?.is_seed, false);
    assert.equal(row.some((r) => r.is_you), true);
  });
});

describe("merge remote sighting", () => {
  it("is a no-op when the id is already on the device", () => {
    const storage = globalThis.localStorage;
    if (!storage) return;
    writeSighting([]);
    const first = mergeRemoteSighting({
      sighting_id: "narra-pull",
      species_code: "narra",
      common_name: "Narra",
      lat: 14.64,
      lon: 121.07,
      created_at: "2026-09-12T00:00:00.000Z",
    });
    const again = mergeRemoteSighting({
      sighting_id: "narra-pull",
      species_code: "narra",
      common_name: "Narra",
      lat: 14.64,
      lon: 121.07,
      created_at: "2026-09-12T00:00:00.000Z",
    });
    assert.equal(first, true);
    assert.equal(again, false);
    assert.equal(readSighting().some((s) => s.sighting_id === "narra-pull"), true);
  });
});
