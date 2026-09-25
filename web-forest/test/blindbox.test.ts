import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BLINDBOX_POOL,
  charmShelf,
  earnedBox,
  grantFor,
  hashOf,
  openBox,
  parseBoxOpen,
  readBoxOpen,
  unopenedBox,
  writeBoxOpen,
  type Box,
  type BoxOpen,
} from "../src/blindbox.ts";
import { dailySubject, observeSubject, type PointEvent, type PointKind } from "../src/gamify.ts";
import { COSMETIC_LIST } from "../src/cosmetic.ts";

/* ── the rules this file guards ────────────────────────────────────────────
 *
 * A box is earned only by a real event already in the points ledger (a daily
 * hunt finished, a species logged for the first time). Opening one is
 * deterministic, never repeats a charm until the set is complete, and cannot
 * hand out a charm without an earned, unopened box. Build spec T4.5: "fail if
 * a random-odds pull ships"; ROADMAP NOT DOING: no commerce.
 */

let seq = 0;
function ev(kind: PointKind, subject_key: string, at: string): PointEvent {
  seq += 1;
  return { event_id: `${kind}-${seq}`, kind, points: 0, at, subject_key };
}

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
  };
}

/** Open every earned box in order, the way the Journal's Open button does. */
function openAll(earned: Box[], open: BoxOpen[] = []): BoxOpen[] {
  let current = open;
  for (const b of unopenedBox(earned, current)) {
    const result = openBox(b.box_id, earned, current, "2026-09-26T09:00:00Z");
    assert.ok(result, `box ${b.box_id} should open`);
    current = result.open;
  }
  return current;
}

function speciesBox(n: number): Box[] {
  return Array.from({ length: n }, (_, i) => ({
    box_id: `species:sp-${i}`,
    source: "species" as const,
    subject: `sp-${i}`,
    earned_at: `2026-09-2${i % 10}T00:00:00Z`,
  }));
}

describe("blindbox — earned only from real events", () => {
  it("an empty ledger earns nothing", () => {
    assert.deepEqual(earnedBox([]), []);
  });

  it("explore and learn earn no box — opening a card is not a find", () => {
    const box = earnedBox([
      ev("explore", "sector:bellarmine", "2026-09-25T01:00:00Z"),
      ev("learn", "species:narra", "2026-09-25T01:01:00Z"),
    ]);
    assert.deepEqual(box, []);
  });

  it("a finished daily hunt earns one box for that day", () => {
    const box = earnedBox([ev("challenge", dailySubject("2026-09-25"), "2026-09-25T02:00:00Z")]);
    assert.equal(box.length, 1);
    assert.equal(box[0].box_id, "hunt:2026-09-25");
    assert.equal(box[0].source, "hunt");
  });

  it("a new species earns one box, however many sectors it is logged in", () => {
    const box = earnedBox([
      ev("observe", observeSubject("narra", "s1"), "2026-09-25T01:00:00Z"),
      ev("observe", observeSubject("narra", "s2"), "2026-09-25T01:10:00Z"),
      ev("verified_discovery", observeSubject("narra", "s3"), "2026-09-25T01:20:00Z"),
      ev("observe", observeSubject("acacia", "s1"), "2026-09-25T01:30:00Z"),
    ]);
    assert.deepEqual(box.map((b) => b.box_id), ["species:narra", "species:acacia"]);
  });

  it("a hunt and the species it asked for are two boxes", () => {
    const box = earnedBox([
      ev("observe", observeSubject("narra", "s1"), "2026-09-25T01:00:00Z"),
      ev("challenge", dailySubject("2026-09-25"), "2026-09-25T01:00:01Z"),
    ]);
    assert.equal(box.length, 2);
  });

  it("will not open a box that was never earned", () => {
    const earned = earnedBox([ev("observe", observeSubject("narra"), "2026-09-25T01:00:00Z")]);
    assert.equal(openBox("species:balete", earned, []), null);
    assert.equal(openBox("hunt:2026-09-25", earned, []), null);
  });

  it("will not open the same box twice", () => {
    const earned = earnedBox([ev("observe", observeSubject("narra"), "2026-09-25T01:00:00Z")]);
    const first = openBox("species:narra", earned, []);
    assert.ok(first);
    assert.equal(openBox("species:narra", earned, first.open), null);
    assert.deepEqual(unopenedBox(earned, first.open), []);
  });
});

describe("blindbox — fair and deterministic", () => {
  it("never repeats a charm until the whole set has come out", () => {
    const earned = speciesBox(BLINDBOX_POOL.length);
    const open = openAll(earned);
    const id = open.map((o) => o.cosmetic_id);
    assert.equal(new Set(id).size, BLINDBOX_POOL.length);
  });

  it("completes the set in exactly one box per charm, for many different box ids", () => {
    for (let offset = 0; offset < 25; offset += 1) {
      const earned = speciesBox(BLINDBOX_POOL.length + offset).slice(offset);
      const open = openAll(earned);
      assert.equal(new Set(open.map((o) => o.cosmetic_id)).size, BLINDBOX_POOL.length, `offset ${offset}`);
    }
  });

  it("the second round also has no duplicates, and starts only after the first is complete", () => {
    const size = BLINDBOX_POOL.length;
    const open = openAll(speciesBox(size * 2));
    assert.equal(new Set(open.slice(0, size).map((o) => o.cosmetic_id)).size, size);
    assert.equal(new Set(open.slice(size).map((o) => o.cosmetic_id)).size, size);
  });

  it("marks a repeat as not new", () => {
    const size = BLINDBOX_POOL.length;
    const earned = speciesBox(size + 1);
    const open = openAll(earned.slice(0, size));
    const result = openBox(earned[size].box_id, earned, open);
    assert.ok(result);
    assert.equal(result.is_new, false);
  });

  it("the same journal opens the same charms every time", () => {
    const earned = speciesBox(6);
    const a = openAll(earned).map((o) => o.cosmetic_id);
    for (let i = 0; i < 50; i += 1) {
      assert.deepEqual(openAll(earned).map((o) => o.cosmetic_id), a);
    }
  });

  it("grantFor is a pure lookup — no Math.random", () => {
    const real = Math.random;
    Math.random = () => {
      throw new Error("blindbox must not call Math.random");
    };
    try {
      grantFor("species:narra", []);
      openAll(speciesBox(3));
    } finally {
      Math.random = real;
    }
  });

  it("hashOf is stable", () => {
    assert.equal(hashOf("species:narra"), hashOf("species:narra"));
    assert.notEqual(hashOf("species:narra"), hashOf("species:acacia"));
  });

  it("the shelf lists the whole set, with counts only from opened boxes", () => {
    const open = openAll(speciesBox(3));
    const shelf = charmShelf(open);
    assert.equal(shelf.length, BLINDBOX_POOL.length);
    assert.equal(shelf.reduce((n, c) => n + c.count, 0), 3);
  });

  it("charm ids are unique and do not collide with the stage cosmetics", () => {
    const id = BLINDBOX_POOL.map((c) => c.id);
    assert.equal(new Set(id).size, id.length);
    for (const c of COSMETIC_LIST) assert.ok(!id.includes(c.id));
  });

  it("no charm carries a price, a currency or an odds figure", () => {
    for (const c of BLINDBOX_POOL) {
      assert.doesNotMatch(`${c.name} ${c.blurb}`, /₱|\$|price|buy|coin|gem|odds|%|rare|legendary/i);
    }
  });
});

describe("blindbox — storage", () => {
  it("round-trips the opened list", () => {
    const storage = memoryStorage();
    const open = openAll(speciesBox(2));
    writeBoxOpen(open, storage);
    assert.deepEqual(readBoxOpen(storage), open);
  });

  it("drops malformed rows instead of throwing", () => {
    assert.deepEqual(parseBoxOpen("not json"), []);
    assert.deepEqual(parseBoxOpen('{"a":1}'), []);
    assert.deepEqual(parseBoxOpen('[{"box_id":1},{"box_id":"x","cosmetic_id":"y"}]'), [
      { box_id: "x", cosmetic_id: "y", opened_at: "" },
    ]);
  });
});
