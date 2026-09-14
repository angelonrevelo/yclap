import { test } from "node:test";
import assert from "node:assert/strict";
import { LEVEL_CAP, levelOf, levelStart } from "../src/level.ts";

test("level starts at 50·L·(L−1) points", () => {
  assert.deepEqual([1, 2, 3, 4, 5].map(levelStart), [0, 100, 300, 600, 1000]);
});

test("a new trainer is level 1 with the whole first level ahead", () => {
  const lv = levelOf(0);
  assert.equal(lv.level, 1);
  assert.equal(lv.into, 0);
  assert.equal(lv.span, 100);
  assert.equal(lv.to_next, 100);
  assert.equal(lv.ratio, 0);
});

test("a hunt plus a log is most of level 1; the threshold itself is level 2", () => {
  assert.equal(levelOf(65).level, 1);
  assert.equal(levelOf(65).ratio, 0.65);
  assert.equal(levelOf(100).level, 2);
  assert.equal(levelOf(100).into, 0);
  assert.equal(levelOf(299).level, 2);
  assert.equal(levelOf(300).level, 3);
});

test("garbage points read as zero, never NaN", () => {
  assert.equal(levelOf(Number.NaN).level, 1);
  assert.equal(levelOf(-40).level, 1);
});

test("the cap holds and the bar stays full there", () => {
  const lv = levelOf(10_000_000);
  assert.equal(lv.level, LEVEL_CAP);
  assert.ok(lv.ratio <= 1);
});
