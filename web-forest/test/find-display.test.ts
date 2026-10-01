import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FIND_BUDGET, tierFind, type FindCandidate } from "../src/find-display.ts";

/* ── things to do on the play map (Gelo 10-01) ──────────────────────────────
 * Twenty-five identical pins on one screen said nothing about where to walk.
 * Near finds stand up, further ones rustle, the rest wait; targets and finds
 * in reach always show.
 */
const at = (key: string, distance_m: number, extra: Partial<FindCandidate> = {}): FindCandidate => ({
  key,
  distance_m,
  in_range: false,
  is_target: false,
  is_logged: false,
  rarity_rank: 0,
  ...extra,
});

describe("find display budget", () => {
  const budget = FIND_BUDGET.phone;

  it("seventy finds in the near field become at most full_max stickers and rustle_max rustles", () => {
    const many = Array.from({ length: 70 }, (_, i) => at(`f${i}`, 5 + i * 2.4));
    const tier = tierFind(many, budget);
    const count = (t: string) => [...tier.values()].filter((v) => v === t).length;
    assert.equal(count("full"), budget.full_max);
    assert.equal(count("rustle"), budget.rustle_max);
    assert.equal(count("full") + count("rustle") + count("hidden"), 70);
  });

  it("the nearest stand up first", () => {
    const tier = tierFind([at("far", 60), at("near", 10)], { ...budget, full_max: 1 });
    assert.equal(tier.get("near"), "full");
    assert.equal(tier.get("far"), "rustle");
  });

  it("an objective's target and a find in reach always show in full, past the cap and the range", () => {
    const crowd = Array.from({ length: 20 }, (_, i) => at(`c${i}`, 5));
    const tier = tierFind([...crowd, at("goal", 400, { is_target: true }), at("here", 3, { in_range: true })], budget);
    assert.equal(tier.get("goal"), "full");
    assert.equal(tier.get("here"), "full");
  });

  it("past rustle range nothing shows; a logged find out of full range does not rustle", () => {
    const tier = tierFind([at("gone", budget.rustle_m + 1), at("done", budget.full_m + 5, { is_logged: true })], budget);
    assert.equal(tier.get("gone"), "hidden");
    assert.equal(tier.get("done"), "hidden");
  });

  it("new and rare beat logged and common for the last full slot", () => {
    const tier = tierFind([at("logged", 10, { is_logged: true }), at("rare", 30, { rarity_rank: 3 })], { ...budget, full_max: 1 });
    assert.equal(tier.get("rare"), "full");
  });
});
