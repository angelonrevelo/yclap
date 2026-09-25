import assert from "node:assert/strict";
import { test } from "node:test";
import { STAGE_AT, STAGE_LABEL, stageLine } from "../src/stage.ts";

/**
 * One ladder, one label set. The round-5 playtest found the growth card saying
 * "To Sapling 1/4" (parts of campus) beside "Sprout · 2 more weeks toward young
 * tree" (weekly streak), and the buddy sheet calling the first stage "Seedling"
 * while the stage label said "Seed".
 */

const SECOND_LADDER = /seedling|young tree|mature tree|week/i;

test("the growth line names the next stage off the sector ladder", () => {
  assert.equal(stageLine(0), `Walk into 1 more area of campus to grow into a ${STAGE_LABEL.sprout}.`);
  assert.equal(stageLine(1), `Walk into 3 more areas of campus to grow into a ${STAGE_LABEL.sapling}.`);
  assert.equal(stageLine(8), `Walk into 1 more area of campus to grow into a ${STAGE_LABEL.tree}.`);
});

test("fully grown says so", () => {
  const top = STAGE_AT[STAGE_AT.length - 1].sector_seen;
  assert.match(stageLine(top), /^Fully grown/);
});

test("no growth line borrows the streak ladder's words", () => {
  for (let n = 0; n <= 12; n += 1) assert.doesNotMatch(stageLine(n), SECOND_LADDER, String(n));
  for (const label of Object.values(STAGE_LABEL)) assert.doesNotMatch(label, SECOND_LADDER);
});
