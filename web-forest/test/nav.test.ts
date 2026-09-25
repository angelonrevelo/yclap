import assert from "node:assert/strict";
import { test } from "node:test";
import { DEMO_PARAM, withDemoQuery } from "../src/nav.ts";

/**
 * The route-change contract: a demo set up by its URL stays set up. The
 * round-5 playtest lost `?time=day` at the first save that opened /journal.
 */

test("a bare URL navigates to a bare path", () => {
  assert.equal(withDemoQuery("/journal", ""), "/journal");
});

test("every demo param survives a route change", () => {
  const search = "?time=day&bearing=90&boot=off&zoom=19&at=14.6389,121.0771";
  const url = withDemoQuery("/journal", search);
  const kept = new URLSearchParams(url.split("?")[1]);
  assert.equal(url.startsWith("/journal?"), true);
  assert.equal(kept.get("time"), "day");
  assert.equal(kept.get("bearing"), "90");
  assert.equal(kept.get("boot"), "off");
  assert.equal(kept.get("zoom"), "19");
  assert.equal(kept.get("at"), "14.6389,121.0771");
});

test("a one-shot param does not follow the player", () => {
  assert.equal(withDemoQuery("/settings", "?account_error=expired&time=night"), "/settings?time=night");
  assert.equal(withDemoQuery("/", "?utm_source=poster"), "/");
});

test("the demo knobs the playtest named are all carried", () => {
  for (const key of ["time", "bearing", "boot", "zoom", "at"]) {
    assert.equal((DEMO_PARAM as readonly string[]).includes(key), true, key);
  }
});
