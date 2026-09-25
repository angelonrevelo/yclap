import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { demoIdentify } from "../src/inat.ts";
import { suggestedPick } from "../src/inat-match.ts";

const narra = { taxon_id: 348101, ancestor_ids: [47122, 68662], scientific_name: "Pterocarpus indicus" };
const vitex = { taxon_id: 126846, ancestor_ids: [48623], scientific_name: "Vitex" };
const stranger = { taxon_id: 1, ancestor_ids: [2], scientific_name: "Nothing campus" };

describe("suggestedPick", () => {
  it("picks the exact campus match from a live identification", () => {
    assert.equal(suggestedPick({ status: "ready", suggestion: [stranger, narra] }, false), "narra");
  });

  it("picks from the recorded demo reply, which leads with Narra", () => {
    assert.equal(suggestedPick(demoIdentify(), false), "narra");
  });

  it("never overrides a pick the student made by hand after the photo", () => {
    assert.equal(suggestedPick({ status: "ready", suggestion: [narra] }, true), null);
  });

  it("does not pick from a genus roll-up that could be two campus species", () => {
    assert.equal(suggestedPick({ status: "ready", suggestion: [vitex] }, false), null);
  });

  it("does not pick while loading, offline, or when nothing matches", () => {
    assert.equal(suggestedPick({ status: "loading" }, false), null);
    assert.equal(suggestedPick({ status: "offline" }, false), null);
    assert.equal(suggestedPick({ status: "ready", suggestion: [stranger] }, false), null);
  });
});
