import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, it } from "node:test";
import { SAVE_PROTOCOL, SAVE_PROTOCOL_HEADER } from "../src/account-core.ts";
import { UPDATE_AVAILABLE, isProtocolMismatch, syncErrorOf } from "../src/account.ts";
import { AccountService, type SqlRun } from "../worker/account.ts";

/**
 * A tab on another build than the server needs a reload, not a "Sync failed"
 * it cannot act on — and it learns that from the protocol number the server
 * sends on every account answer, never from guessing at an error sentence.
 */
describe("sync error sentence", () => {
  it("says an update is available only when the server names another protocol", () => {
    assert.equal(isProtocolMismatch(String(SAVE_PROTOCOL + 1)), true);
    assert.equal(syncErrorOf(new Error("HTTP 400"), String(SAVE_PROTOCOL + 1)), UPDATE_AVAILABLE);
    assert.equal(UPDATE_AVAILABLE, "Update available — reload");
  });

  it("keeps any other failure a failure — a malformed save included", () => {
    assert.equal(isProtocolMismatch(String(SAVE_PROTOCOL)), false);
    assert.equal(isProtocolMismatch(` ${SAVE_PROTOCOL} `), false);
    assert.equal(isProtocolMismatch(null), false, "no header: an older server or a proxy, not proof of a mismatch");
    assert.equal(
      syncErrorOf(new Error("save { sighting[], point_event[] } and base_updated_at (string or null) required"), String(SAVE_PROTOCOL)),
      "Sync failed: save { sighting[], point_event[] } and base_updated_at (string or null) required",
    );
    assert.equal(syncErrorOf(new Error("HTTP 502"), null), "Sync failed: HTTP 502");
  });

  it("the server stamps its protocol on every account answer", async () => {
    const db = new DatabaseSync(":memory:");
    const sql: SqlRun = (query, ...bind) => db.prepare(query).all(...bind) as ReturnType<SqlRun>;
    const svc = new AccountService(sql, {});
    for (const request of [
      new Request("https://magi.example/auth/me"),
      new Request("https://magi.example/account/save"),
      new Request("https://magi.example/account/save", { method: "PUT", body: "{}", headers: { "Content-Type": "application/json" } }),
    ]) {
      const res = await svc.handle(request);
      assert.equal(res.headers.get(SAVE_PROTOCOL_HEADER), String(SAVE_PROTOCOL), `${request.method} ${new URL(request.url).pathname}`);
    }
  });
});
