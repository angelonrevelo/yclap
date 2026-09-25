import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dex_order, picker_order, species } from "../src/data.ts";
import { summarize } from "../src/journal.ts";

describe("dex_order", () => {
  it("draws exactly the species the Dex counter counts", () => {
    assert.equal(dex_order.length, summarize([]).species_total);
    assert.deepEqual([...dex_order].sort(), [...picker_order].sort());
  });

  it("carries no unnamed padding slot", () => {
    for (const code of dex_order) assert.ok(species[code], `${code} is not a species`);
  });
});
