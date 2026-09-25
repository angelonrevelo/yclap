import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pinReply } from "../src/pin-reply.ts";

const target = { lat: 14.6394, lon: 121.0781 };
const south = { lat: 14.6385, lon: 121.0781 };

describe("pinReply", () => {
  it("opens the log when the find is in reach, in either mode", () => {
    for (const is_walk_mode of [true, false]) {
      assert.deepEqual(pinReply({ target, common_name: "Narra", sector_name: null, fix: target, is_reach: true, is_walk_mode }), { kind: "log" });
    }
  });

  it("walks toward it in walk mode", () => {
    const got = pinReply({ target, common_name: "Narra", sector_name: "Zen Garden", fix: south, is_reach: false, is_walk_mode: true });
    assert.deepEqual(got, { kind: "walk", line: "Walking to Narra" });
  });

  it("answers GPS mode with distance and direction instead of silence", () => {
    const got = pinReply({ target, common_name: "Narra", sector_name: "Zen Garden", fix: south, is_reach: false, is_walk_mode: false });
    assert.equal(got.kind, "hint");
    assert.equal(got.kind === "hint" && got.line, "Narra is 100 m N in Zen Garden. Walk closer to log it.");
  });

  it("still answers with no fix at all", () => {
    const got = pinReply({ target, common_name: "Narra", sector_name: null, fix: null, is_reach: false, is_walk_mode: false });
    assert.deepEqual(got, { kind: "hint", line: "Narra is out. Walk to it to log it." });
  });
});
