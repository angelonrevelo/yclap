import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COSMETIC_LIST, grantedCosmetics, nextCosmetic, cosmeticForStage } from "../src/cosmetic.ts";
import { STAGE_ORDER, stageFor } from "../src/stage.ts";

/* ── the rule this file guards (build spec T4.5, 2026-09-06) ───────────────
 *
 * The unboxing is deterministic. "Nothing purchasable, no currency, no scarcity
 * mechanic, no loot-box odds — a variant is granted deterministically on
 * completion." These tests prove that the same journal state always produces the
 * same cosmetic, that there is no random pull, and that the grant happens on
 * stage advance — never before, never differently.
 *
 * Source: `docs/spec/biome-3d-build-spec.md` §5 T4.5.
 */

describe("cosmetic variants — the blind-box (T4.5)", () => {
  it("grants no cosmetic at egg (the starting state grants nothing)", () => {
    assert.equal(grantedCosmetics(0).length, 0);
  });

  it("grants exactly one cosmetic when the stage advances to sprout", () => {
    const earned = grantedCosmetics(1);
    assert.equal(earned.length, 1);
    assert.equal(earned[0].stage, "sprout");
    assert.equal(earned[0].id, "sprout-pot");
  });

  it("grants two cosmetics at sapling (4 sectors)", () => {
    const earned = grantedCosmetics(4);
    assert.equal(earned.length, 2);
    assert.equal(earned[0].stage, "sprout");
    assert.equal(earned[1].stage, "sapling");
  });

  it("grants all three cosmetics at tree (9 sectors)", () => {
    const earned = grantedCosmetics(9);
    assert.equal(earned.length, COSMETIC_LIST.length);
    assert.equal(earned[2].stage, "tree");
  });

  it("is deterministic — the same count always yields the same cosmetics", () => {
    const a = grantedCosmetics(4);
    const b = grantedCosmetics(4);
    assert.deepEqual(a, b);
    // Run it a hundred times; it must never diverge.
    for (let i = 0; i < 100; i += 1) {
      assert.deepEqual(grantedCosmetics(4), a);
    }
  });

  it("never grants more cosmetics than there are stages above egg", () => {
    for (let n = 0; n <= 20; n += 1) {
      assert.ok(
        grantedCosmetics(n).length <= COSMETIC_LIST.length,
        `count ${n} granted too many`,
      );
    }
  });

  it("the cosmetic list has one entry per stage above egg, in stage order", () => {
    const stages = COSMETIC_LIST.map((c) => c.stage);
    const expected = STAGE_ORDER.slice(1); // egg, sprout, sapling, tree → minus egg
    assert.deepEqual(stages, expected);
  });

  it("nextCosmetic is null only when every stage cosmetic is unlocked", () => {
    assert.notEqual(nextCosmetic(0), null); // egg → sprout is next
    assert.notEqual(nextCosmetic(1), null); // sprout → sapling is next
    assert.notEqual(nextCosmetic(4), null); // sapling → tree is next
    assert.equal(nextCosmetic(9), null); // tree is the top
    assert.equal(nextCosmetic(20), null); // still the top
  });

  it("cosmeticForStage returns the stage's cosmetic, or null for egg", () => {
    assert.equal(cosmeticForStage("egg"), null);
    assert.notEqual(cosmeticForStage("sprout"), null);
    assert.notEqual(cosmeticForStage("sapling"), null);
    assert.notEqual(cosmeticForStage("tree"), null);
    assert.equal(cosmeticForStage("sprout").id, "sprout-pot");
    assert.equal(cosmeticForStage("tree").id, "tree-crown");
  });

  it("a stage advance grants exactly one new cosmetic", () => {
    // 0 → 1 sectors: egg → sprout
    const before_0 = grantedCosmetics(0);
    const after_1 = grantedCosmetics(1);
    assert.equal(after_1.length - before_0.length, 1);

    // 3 → 4 sectors: still sprout, then sapling
    const before_4 = grantedCosmetics(3);
    const after_4 = grantedCosmetics(4);
    assert.equal(after_4.length - before_4.length, 1);

    // 8 → 9 sectors: still sapling, then tree
    const before_9 = grantedCosmetics(8);
    const after_9 = grantedCosmetics(9);
    assert.equal(after_9.length - before_9.length, 1);
  });

  it("never regresses — a higher sector count never grants fewer cosmetics", () => {
    let prev = 0;
    for (let n = 0; n <= 15; n += 1) {
      const count = grantedCosmetics(n).length;
      assert.ok(count >= prev, `regressed at ${n}: ${count} < ${prev}`);
      prev = count;
    }
  });
});
