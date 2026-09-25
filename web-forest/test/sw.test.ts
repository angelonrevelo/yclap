import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { LAYER_ORDER, SOURCE } from "../src/basemap.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sw = readFileSync(join(root, "public/sw.js"), "utf8");

/**
 * The service worker is a plain script outside the bundle, so it cannot import
 * `SOURCE`. That means the tile-host allowlist is a hand-kept copy of it, and a
 * hand-kept copy drifts: adding the CyclOSM layer left `openstreetmap.fr` out of
 * the list, which fetches perfectly online and goes blank offline — a failure a
 * demo only discovers on stage. These assertions are the link between the two
 * files that the language cannot provide.
 */
describe("service worker tile cache", () => {
  const host_list = (sw.match(/const TILE_HOST = \[([\s\S]*?)\]/)?.[1] ?? "")
    .split(",")
    .map((s) => s.trim().replace(/^["']|["'],?$/g, ""))
    .filter(Boolean);

  it("parses a non-empty host allowlist out of sw.js", () => {
    assert.ok(host_list.length >= 1, "could not read TILE_HOST from sw.js");
  });

  it("covers the host of every basemap in SOURCE", () => {
    for (const layer of LAYER_ORDER) {
      const host = new URL(SOURCE[layer].url(18, 219238, 120294)).hostname;
      const covered = host_list.some((h) => host === h || host.endsWith("." + h));
      assert.ok(covered, `${layer} tiles come from ${host}, which sw.js will not cache`);
    }
  });

  it("does not allowlist a host no layer uses", () => {
    const used = LAYER_ORDER.map((l) => new URL(SOURCE[l].url(18, 219238, 120294)).hostname);
    for (const host of host_list) {
      assert.ok(
        used.some((u) => u === host || u.endsWith("." + host)),
        `sw.js allowlists ${host}, which no layer requests`,
      );
    }
  });

  it("keeps tiles in their own cache, capped, so a long pan cannot fill the device", () => {
    assert.match(sw, /TILE_CACHE\s*=/);
    const limit = Number(sw.match(/TILE_LIMIT\s*=\s*(\d+)/)?.[1]);
    assert.ok(limit > 0 && limit <= 5000, `TILE_LIMIT was ${limit}`);
  });

  it("never cache-firsts an un-hashed same-origin URL", () => {
    /* v2 cache-firsted everything and pinned the app to a stale build. */
    assert.match(sw, /isImmutable[\s\S]*?startsWith\("\/assets\/"\)/);
  });
});

describe("basemap sources", () => {
  it("every layer declares an attribution — the credit is a licence term", () => {
    for (const layer of LAYER_ORDER) {
      assert.ok(SOURCE[layer].attribution.trim().length > 5, `${layer} has no attribution`);
      assert.match(SOURCE[layer].attribution, /©/);
    }
  });

  it("every layer reaches the zoom the walk actually happens at", () => {
    for (const layer of LAYER_ORDER) {
      assert.ok(SOURCE[layer].max_zoom >= 18, `${layer} tops out at z${SOURCE[layer].max_zoom}`);
    }
  });

  it("builds a well-formed https tile URL for each layer", () => {
    for (const layer of LAYER_ORDER) {
      const url = new URL(SOURCE[layer].url(18, 219238, 120294));
      assert.equal(url.protocol, "https:", `${layer} is not https`);
      assert.ok(url.pathname.includes("18"), `${layer} url drops the zoom`);
    }
  });

  it("carries an overlay theme that can actually be seen on its ground", () => {
    for (const layer of LAYER_ORDER) {
      const theme = SOURCE[layer].theme;
      assert.match(theme.path, /^#[0-9A-Fa-f]{6}$/, `${layer} path colour`);
      assert.ok(theme.path_opacity > 0 && theme.path_opacity <= 1, `${layer} path_opacity`);
    }
  });
});

describe("service worker upgrade", () => {
  it("is at least v8: the save protocol changed (base_updated_at), so old shells must go", () => {
    const version = Number(sw.match(/CACHE_VERSION = "magisphere-v(\d+)"/)?.[1]);
    assert.ok(version >= 8, `CACHE_VERSION is v${version}`);
  });

  it("serves the page network-first, so a reload picks up the new build", () => {
    const navigate = sw.match(/function handleNavigate\(request\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
    assert.match(navigate, /^\s*return fetch\(request\)/);
    assert.match(navigate, /\.catch\(\(\) => caches\.match\("\/index\.html"\)/);
  });

  it("only keeps a good page as the offline shell", () => {
    const navigate = sw.match(/function handleNavigate\(request\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
    assert.match(navigate, /if \(response\.ok && response\.type === "basic"\)/);
  });
});
