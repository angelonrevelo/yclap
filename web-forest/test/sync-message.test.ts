import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { UPDATE_AVAILABLE, isShapeRefusal, syncErrorOf } from "../src/account.ts";

/**
 * An old tab saves without `base_updated_at` and the server answers 400. That
 * tab needs a reload, not a "Sync failed" it cannot act on.
 */
describe("sync error sentence", () => {
  it("says an update is available when the server refused the save's shape", () => {
    assert.equal(
      isShapeRefusal({ error: "save { sighting[], point_event[] } and base_updated_at (string or null) required" }),
      true,
    );
    assert.equal(syncErrorOf(new Error("HTTP 400"), true), UPDATE_AVAILABLE);
    assert.equal(UPDATE_AVAILABLE, "Update available — reload");
  });

  it("keeps any other failure a failure", () => {
    assert.equal(isShapeRefusal({ error: "send JSON under 1.5 MB" }), false);
    assert.equal(isShapeRefusal(null), false);
    assert.equal(syncErrorOf(new Error("HTTP 502"), false), "Sync failed: HTTP 502");
  });
});
