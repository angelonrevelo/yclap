import assert from "node:assert/strict";
import { test } from "node:test";
import { keepTag, spreadWalker, unitOf } from "../src/walker-spread.ts";

const GAP = 40;

test("five walkers on one spot are drawn apart, and apart from you", () => {
  const self = { x: 200, y: 500 };
  const spot = ["a", "b", "c", "d", "e"].map((id) => ({ id, x: 200, y: 500, scale: 1 }));
  const placed = spreadWalker(spot, self, GAP);
  const all = [self, ...placed.values()];
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      assert.ok(Math.hypot(all[i].x - all[j].x, all[i].y - all[j].y) >= GAP - 0.001, `pair ${i},${j} too close`);
    }
  }
});

test("a walker with room keeps its true spot", () => {
  const placed = spreadWalker([{ id: "far", x: 50, y: 100, scale: 1 }], { x: 300, y: 600 }, GAP);
  assert.deepEqual(placed.get("far"), { x: 50, y: 100 });
});

test("the nudge is stable: same input, same drawing", () => {
  const spot = ["x", "y", "z"].map((id) => ({ id, x: 10, y: 10, scale: 1 }));
  const one = spreadWalker(spot, null, GAP);
  const two = spreadWalker([...spot].reverse(), null, GAP);
  for (const id of ["x", "y", "z"]) assert.deepEqual(one.get(id), two.get(id));
  assert.equal(unitOf("x"), unitOf("x"));
});

test("overlapping tags: the one nearer the camera wins, clear ones all stay", () => {
  const keep = keepTag([
    { id: "near", x: 100, y: 400, w: 120, h: 18 },
    { id: "behind", x: 110, y: 392, w: 120, h: 18 },
    { id: "clear", x: 300, y: 100, w: 120, h: 18 },
  ]);
  assert.deepEqual([...keep].sort(), ["clear", "near"]);
});

test("your own tag outranks everybody's", () => {
  const keep = keepTag([{ id: "other", x: 100, y: 400, w: 120, h: 18 }], { id: "me", x: 100, y: 398, w: 120, h: 18 });
  assert.equal(keep.size, 0);
});

test("a tag yields to an area pill placed first, and a clear one stays", () => {
  const pill = { id: "pill", x: 120, y: 402, w: 160, h: 26 };
  const keep = keepTag(
    [
      { id: "over", x: 100, y: 400, w: 200, h: 18 },
      { id: "clear", x: 300, y: 100, w: 120, h: 18 },
    ],
    null,
    [pill],
  );
  assert.deepEqual([...keep], ["clear"]);
});

test("you get the bigger berth your bigger walker needs", () => {
  const self = { x: 200, y: 500 };
  const placed = spreadWalker([{ id: "a", x: 205, y: 500, scale: 1 }], self, GAP, GAP * 2);
  const a = placed.get("a")!;
  assert.ok(Math.hypot(a.x - self.x, a.y - self.y) >= GAP * 2 - 0.001);
});
