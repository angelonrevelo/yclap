import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { describe, it } from "node:test";
import {
  EMERGENCY_FILE,
  FLOOD_FILE,
  ROUTABLE_GROUP,
  emptyLine,
  featureInGroup,
  floodHazardAt,
  floodLine,
  groupLine,
  groupOf,
  nearestHelp,
  type EmergencyFeature,
  type EmergencyGroup,
} from "../src/emergency.ts";
import { CAMPUS_CENTER } from "../src/geo.ts";
import { HOTSPOT_FILE, hotspotEmptyLine, hotspotMethodLine, hotspotRank } from "../src/hotspot.ts";
import { MODULE, MODULE_CONFIG, configFromQuery, enabledModule } from "../src/module.ts";
import { PARTNER } from "../src/settings-content.ts";
import { sector } from "../src/sector.ts";

/* ── campus modules (Gelo 09-30, `3:58`–`5:11`) ───────────────────────────────
 *
 * The honesty rules for the three modules, as tests. The emergency ones are
 * the load-bearing ones: a made-up evacuation point is worse than none.
 */

describe("module registry", () => {
  it("no module claims to be official", () => {
    /* If an office genuinely signs a layer off, edit this test to say who
       signed what and when — the way settings.test.ts guards is_confirmed. */
    for (const m of MODULE) assert.equal(m.is_official, false, `${m.module_id} claims is_official`);
  });

  it("every module names its source, its owner and what the institution must give", () => {
    for (const m of MODULE) {
      assert.ok(m.source.length > 20, `${m.module_id}: source too thin`);
      assert.ok(m.official_owner.length > 0);
      assert.ok(m.institution_ask.length > 40, `${m.module_id}: ask too thin`);
      assert.ok(m.caveat.length > 20);
    }
  });

  it("the emergency module says it is not the official plan", () => {
    const m = MODULE.find((x) => x.module_id === "emergency")!;
    assert.match(m.caveat, /Not the official Ateneo emergency plan/);
  });

  it("config switches modules on and off; a typo never switches everything off", () => {
    assert.deepEqual(enabledModule().map((m) => m.module_id), MODULE_CONFIG.module_on);
    const park = configFromQuery("?module=trail");
    assert.deepEqual(enabledModule(park).map((m) => m.module_id), ["trail"]);
    assert.deepEqual(configFromQuery("?module=nonsense").module_on, MODULE_CONFIG.module_on);
    assert.deepEqual(enabledModule({ campus_code: "x", campus_name: "x", module_on: [] }), []);
  });

  it("asks the DRRM office for the official plan, and it is NOT YET confirmed", () => {
    const drrm = PARTNER.find((p) => p.short === "DRRM");
    assert.ok(drrm, "DRRM office missing from settings-content");
    assert.equal(drrm.is_confirmed, false);
    assert.match(drrm.ask, /assembly points/);
  });
});

describe("emergency extract", () => {
  it("every feature carries its OSM id, source, URL and fetch date", () => {
    assert.ok(EMERGENCY_FILE.fetched_on.match(/^\d{4}-\d{2}-\d{2}$/));
    assert.match(EMERGENCY_FILE.licence, /ODbL/);
    for (const f of EMERGENCY_FILE.feature) {
      assert.match(f.osm_id, /^(node|way|relation)\/\d+$/);
      assert.equal(f.source, "OpenStreetMap");
      assert.equal(f.source_url, `https://www.openstreetmap.org/${f.osm_id}`);
      assert.match(f.fetched_on, /^\d{4}-\d{2}-\d{2}$/);
      assert.ok(typeof f.lat === "number" && typeof f.lon === "number");
    }
  });

  it("the per-kind count in the file matches the features — nothing added after the fetch", () => {
    const count: Record<string, number> = {};
    for (const f of EMERGENCY_FILE.feature) count[f.kind] = (count[f.kind] ?? 0) + 1;
    assert.deepEqual(count, EMERGENCY_FILE.count);
  });

  it("every feature's tags really carry the tag that put it in the extract", () => {
    for (const f of EMERGENCY_FILE.feature) {
      const t = f.tag;
      assert.ok(
        t.emergency === f.kind || t.amenity === f.kind || t.healthcare === f.kind || t.highway === f.kind,
        `${f.osm_id} kind ${f.kind} not in its tags`,
      );
    }
  });

  it("an empty group renders the empty state, naming the source and date", () => {
    const empty: EmergencyFeature[] = [];
    for (const g of ["assembly", "medical", "safety"] as EmergencyGroup[]) {
      const line = groupLine(g, empty, "2026-09-30");
      assert.equal(line, emptyLine(g, "2026-09-30"));
      assert.match(line, /None mapped/);
      assert.match(line, /OpenStreetMap/);
      assert.match(line, /2026-09-30/);
      assert.match(line, /will not guess/);
      assert.equal(nearestHelp(CAMPUS_CENTER, g, empty), null);
    }
  });

  it("assembly points: the real extract has none, and the layer says so rather than inventing one", () => {
    /* OSM held no emergency=assembly_point in the box on 2026-09-30. If a
       refetch finds one, this test fails and should be updated — not the data. */
    assert.equal(featureInGroup("assembly").length, 0);
    assert.match(groupLine("assembly"), /None mapped/);
  });

  it("routes to the nearest help over walkable ground, and the route ends by the feature", () => {
    for (const g of ROUTABLE_GROUP) {
      if (featureInGroup(g).length === 0) continue;
      const help = nearestHelp(CAMPUS_CENTER, g);
      assert.ok(help, `no route to any ${g}`);
      assert.equal(groupOf(help.feature.kind), g);
      const end = help.route.waypoint[help.route.waypoint.length - 1];
      const d = Math.hypot((end.lat - help.feature.lat) * 110_540, (end.lon - help.feature.lon) * 107_700);
      assert.ok(d < 45, `${g}: route ends ${d.toFixed(0)} m from ${help.feature.osm_id}`);
    }
  });
});

describe("flood layer", () => {
  it("is UP NOAH's published data, dated and licensed", () => {
    assert.match(FLOOD_FILE.source, /UP NOAH/);
    assert.match(FLOOD_FILE.licence, /ODbL/);
    assert.match(FLOOD_FILE.shapefile_date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(FLOOD_FILE.fetched_on, /^\d{4}-\d{2}-\d{2}$/);
    for (const z of FLOOD_FILE.zone) assert.ok([1, 2, 3].includes(z.hazard));
  });

  it("an empty model renders the empty state", () => {
    assert.match(floodLine([]), /None shown/);
    assert.equal(floodHazardAt(CAMPUS_CENTER, []), 0);
  });

  it("a point inside a zone ring reads that class", () => {
    const zone = FLOOD_FILE.zone.find((z) => z.hazard === 1)!;
    /* Hand-built square, so the test does not depend on where NOAH drew. */
    const sq = [{ hazard: 2, ring: [[[121.0, 14.0], [121.1, 14.0], [121.1, 14.1], [121.0, 14.1]]], ring_area_m2: 0 }];
    assert.equal(floodHazardAt({ lat: 14.05, lon: 121.05 }, sq), 2);
    assert.equal(floodHazardAt({ lat: 14.2, lon: 121.05 }, sq), 0);
    assert.ok(zone.ring.length > 0);
  });
});

describe("hotspot layer", () => {
  it("covers every sector, and says its method", () => {
    assert.equal(HOTSPOT_FILE.sector.length, sector.length);
    assert.match(hotspotMethodLine(), /not a survey/);
    assert.match(hotspotMethodLine(), new RegExp(HOTSPOT_FILE.fetched_on));
  });

  it("a hotspot always has enough records to be one", () => {
    for (const h of hotspotRank()) {
      assert.ok(h.observation_count >= HOTSPOT_FILE.method.hotspot_min_observation);
      assert.ok(h.species_count >= HOTSPOT_FILE.method.hotspot_species_cut);
      assert.ok(h.species_count <= h.observation_count);
    }
  });

  it("an empty source renders the empty state", () => {
    const empty = { ...HOTSPOT_FILE, method: { ...HOTSPOT_FILE.method, kept_in_sector: 0 }, sector: [] };
    assert.match(hotspotEmptyLine(empty) ?? "", /No iNaturalist record/);
    assert.equal(hotspotEmptyLine(), null);
  });
});

describe("the emergency UI never draws anything but the extract", () => {
  it("module-ui draws emergency marks only from EMERGENCY_FILE and flood only from FLOOD_FILE", () => {
    const src = ["module-ui.tsx", "module-state.ts"].map((f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8")).join(" ");
    assert.ok(!src.includes("assembly_point"), "the UI names an assembly point kind itself");
    assert.ok(!/lat:\s*14\.\d+/.test(src), "a hard-coded coordinate in the UI");
  });

  it("no committed asset holds a coordinate list for an assembly point or evacuation route", () => {
    const dir = new URL("../src/asset/", import.meta.url);
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".json") || name === "campus-emergency.json") continue;
      const text = readFileSync(new URL(name, dir), "utf8");
      assert.ok(!/assembly_point|evacuation/i.test(text), `${name} mentions an assembly point or evacuation route`);
    }
    assert.ok(existsSync(new URL("campus-emergency.json", dir)));
  });
});
