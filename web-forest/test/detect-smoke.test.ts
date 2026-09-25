import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
// @ts-expect-error — plain .mjs script, no type declarations
import { pickMode, runSmoke, SMOKE_DIR } from "../script/smoke-detect.mjs";

interface ManifestPhoto {
  file: string;
  species_code: string;
  license_code: string;
  attribution: string;
  observation_url: string;
}

const manifest = JSON.parse(readFileSync(join(SMOKE_DIR, "manifest.json"), "utf8")) as { photo: ManifestPhoto[] };

describe("detect-smoke manifest", () => {
  it("every photo exists, is small, is CC-BY or CC0, and carries attribution", () => {
    assert.ok(manifest.photo.length >= 8 && manifest.photo.length <= 12);
    for (const p of manifest.photo) {
      const path = join(SMOKE_DIR, p.file);
      assert.ok(existsSync(path), p.file);
      assert.ok(statSync(path).size <= 100 * 1024, `${p.file} is over 100 KB`);
      assert.ok(["cc-by", "cc0"].includes(p.license_code), `${p.file} license ${p.license_code}`);
      assert.ok(p.attribution.length > 0);
      assert.match(p.observation_url, /^https:\/\/www\.inaturalist\.org\/observations\/\d+$/);
      assert.ok(existsSync(join(SMOKE_DIR, "response", `${p.species_code}.json`)), `${p.species_code} has no saved reply`);
    }
  });

  it("no saved reply carries a token", () => {
    for (const p of manifest.photo) {
      const text = readFileSync(join(SMOKE_DIR, "response", `${p.species_code}.json`), "utf8");
      assert.doesNotMatch(text, /eyJ[A-Za-z0-9_-]{10,}\./, `${p.species_code}.json looks like it holds a JWT`);
    }
  });
});

describe("npm run smoke:detect (replay)", () => {
  it("picks replay with no token and no url, and live otherwise", () => {
    assert.equal(pickMode({ url: null, token: null }), "replay");
    assert.equal(pickMode({ url: null, token: "x" }), "live-token");
    assert.equal(pickMode({ url: "http://127.0.0.1:8788", token: null }), "live-url");
  });

  it("runs every photo through the proxy + match path and says it is a replay", async () => {
    const line: string[] = [];
    const summary = await runSmoke({ log: (s: string) => line.push(s) });
    assert.equal(summary.mode, "replay");
    assert.equal(summary.is_live, false);
    assert.equal(summary.row.length, manifest.photo.length);
    assert.equal(summary.exit_code, 0);
    assert.equal(summary.top5_rate, 1);
    const text = line.join("\n");
    assert.match(text, /REPLAY MODE/);
    assert.match(text, /NOTHING WAS SENT TO iNATURALIST/);
    if (summary.is_constructed) assert.match(text, /NOT iNaturalist accuracy/);
  });

  it("exits non-zero under the threshold", async () => {
    const summary = await runSmoke({ min_top1: 1.01, log: () => {} });
    assert.equal(summary.is_pass, false);
    assert.equal(summary.exit_code, 1);
  });
});
