import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { frameStat } from "../src/frame-stat.ts";

describe("frameStat — the ?probe=1 readout", () => {
  it("summarises steady 60 Hz", () => {
    const stat = frameStat(Array.from({ length: 120 }, () => 16.7));
    assert.equal(stat.frame_count, 120);
    assert.ok(Math.abs(stat.fps - 59.9) < 0.2);
    assert.equal(stat.p50_ms, 16.7);
    assert.equal(stat.long_count, 0);
  });

  it("counts the long frames an eye catches and ignores junk samples", () => {
    const stat = frameStat([16, 16, 16, 50, 16, 100, Number.NaN, -3, 0]);
    assert.equal(stat.frame_count, 6);
    assert.equal(stat.long_count, 2);
    assert.equal(stat.max_ms, 100);
    assert.equal(stat.p95_ms, 100);
  });

  it("is all zeros for no frames", () => {
    assert.equal(frameStat([]).fps, 0);
  });
});
