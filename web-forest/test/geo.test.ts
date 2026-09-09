import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CAMPUS_BOX,
  bearingDegree,
  compassPoint,
  demoWalkAt,
  DEMO_WALK,
  distanceMeter,
  formatLatLon,
  formatMeter,
  isInsideCampus,
  latLonToPercent,
  percentToLatLon,
  WALK_PACE_MS,
  walkMinute,
  formatWalkMinute,
  CAMPUS_CENTER,
  clampCenter,
  fitZoom,
  fromWorld,
  MAX_ZOOM,
  meterPerPixel,
  MIN_ZOOM,
  toWorld,
  type LatLon,
} from "../src/geo.ts";
import { encounter, ENCOUNTER_RADIUS_M, RESTRICTED_POLYGON } from "../src/data.ts";
import { readFileSync } from "node:fs";

interface BiomePart {
  part_name: string;
  point: [number, number][]; // [lat, lon] — unlike campus-path.json, which is [lon, lat]
}

interface BiomeRow {
  biome_code: string;
  name: string;
  kind: string;
  is_placeholder: boolean;
  ring: BiomePart[] | null;
  species_code: string[];
}

const biome_seed = JSON.parse(
  readFileSync(new URL("../src/asset/campus-biome.json", import.meta.url), "utf8"),
) as { biome: BiomeRow[] };

/** Ray casting. Only the test needs it, so it lives with the test. */
function isInsidePolygon(point: LatLon, ring: LatLon[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const hits =
      ring[i].lat > point.lat !== ring[j].lat > point.lat &&
      point.lon <
        ((ring[j].lon - ring[i].lon) * (point.lat - ring[i].lat)) / (ring[j].lat - ring[i].lat) +
          ring[i].lon;
    if (hits) inside = !inside;
  }
  return inside;
}
import { nearestEncounter, rankEncounter } from "../src/nearby.ts";

describe("projection", () => {
  it("round-trips percent → lat/lon → percent", () => {
    for (const point of [
      { x_percent: 0, y_percent: 0 },
      { x_percent: 41, y_percent: 54 },
      { x_percent: 100, y_percent: 100 },
    ]) {
      const back = latLonToPercent(percentToLatLon(point.x_percent, point.y_percent));
      assert.ok(Math.abs(back.x_percent - point.x_percent) < 1e-9);
      assert.ok(Math.abs(back.y_percent - point.y_percent) < 1e-9);
    }
  });

  it("puts y=0% at the north edge and x=0% at the west edge", () => {
    const top_left = percentToLatLon(0, 0);
    assert.equal(top_left.lat, CAMPUS_BOX.north);
    assert.equal(top_left.lon, CAMPUS_BOX.west);
  });

  it("accepts a campus point and rejects one off Katipunan", () => {
    assert.equal(isInsideCampus(percentToLatLon(50, 50)), true);
    /* Mapúa Intramuros, the off-campus demo case the roadmap named. */
    assert.equal(isInsideCampus({ lat: 14.5906, lon: 120.9799 }), false);
  });
});

describe("distanceMeter", () => {
  it("measures a known short offset to within a metre", () => {
    /* 0.001° of latitude ≈ 111.2 m anywhere on Earth. */
    const a = { lat: 14.64, lon: 121.078 };
    const b = { lat: 14.641, lon: 121.078 };
    const d = distanceMeter(a, b);
    assert.ok(Math.abs(d - 111.2) < 1, `expected ~111.2 m, got ${d}`);
  });

  it("is zero for the same point and symmetric", () => {
    const a = { lat: 14.6386, lon: 121.0785 };
    const b = { lat: 14.639, lon: 121.079 };
    assert.equal(distanceMeter(a, a), 0);
    assert.ok(Math.abs(distanceMeter(a, b) - distanceMeter(b, a)) < 1e-9);
  });

  it("keeps the campus frame at walkable campus scale", () => {
    const nw = percentToLatLon(0, 0);
    const se = percentToLatLon(100, 100);
    const span = distanceMeter(nw, se);
    /* T1.1 grew the box 2026-09-03 to stop clipping the biome extent (−137 m S,
       −216 m N, −131 m E). The diagonal went from ~1.4 km to ~1.76 km — still a
       campus, not a city. */
    assert.ok(span > 1500 && span < 2000, `campus diagonal was ${span} m`);
  });
});

describe("bearing", () => {
  it("reads due north and due east", () => {
    const a = { lat: 14.638, lon: 121.078 };
    assert.ok(Math.abs(bearingDegree(a, { lat: 14.639, lon: 121.078 }) - 0) < 0.5);
    assert.ok(Math.abs(bearingDegree(a, { lat: 14.638, lon: 121.079 }) - 90) < 0.5);
  });

  it("names the compass point", () => {
    assert.equal(compassPoint(0), "N");
    assert.equal(compassPoint(90), "E");
    assert.equal(compassPoint(181), "S");
    assert.equal(compassPoint(315), "NW");
  });
});

describe("encounter geography", () => {
  it("gives every encounter a coordinate inside the campus frame", () => {
    assert.ok(encounter.length >= 8);
    for (const row of encounter) {
      assert.equal(isInsideCampus(row), true, `${row.encounter_id} fell outside CAMPUS_BOX`);
    }
  });

  it("ranks by true metre distance, nearest first", () => {
    const at_narra = encounter.find((e) => e.species_code === "narra");
    assert.ok(at_narra);
    const ranked = rankEncounter(at_narra);
    assert.equal(ranked[0].row.encounter_id, at_narra.encounter_id);
    assert.equal(ranked[0].distance_m, 0);
    assert.equal(ranked[0].is_at, true);
    for (let i = 1; i < ranked.length; i += 1) {
      assert.ok(ranked[i].distance_m >= ranked[i - 1].distance_m);
    }
  });

  it("does not call a far encounter 'at'", () => {
    const near = nearestEncounter({ lat: 14.5906, lon: 120.9799 });
    assert.ok(near);
    assert.equal(near.is_at, false);
    assert.ok(near.distance_m > ENCOUNTER_RADIUS_M);
  });
});

describe("demo walk", () => {
  it("stays inside the campus for the whole loop", () => {
    for (let t = 0; t < 1; t += 0.01) {
      assert.equal(isInsideCampus(demoWalkAt(t)), true, `demo walk left the frame at t=${t}`);
    }
  });

  it("wraps back to its start", () => {
    const start = demoWalkAt(0);
    const wrapped = demoWalkAt(1);
    assert.ok(distanceMeter(start, wrapped) < 0.01);
    assert.equal(DEMO_WALK.length >= 6, true);
  });

  it("actually moves — the stage demo must not sit still", () => {
    assert.ok(distanceMeter(demoWalkAt(0), demoWalkAt(0.25)) > 20);
  });

  it("passes within arrival radius of at least three encounters", () => {
    const hit = new Set<string>();
    for (let t = 0; t < 1; t += 0.002) {
      const near = nearestEncounter(demoWalkAt(t));
      if (near?.is_at) hit.add(near.row.encounter_id);
    }
    assert.ok(hit.size >= 3, `demo walk only reached ${hit.size} encounters`);
  });
});

describe("formatting", () => {
  it("uses one decimal up close, whole metres further out, km beyond a thousand", () => {
    assert.equal(formatMeter(4.25), "4.3 m");
    assert.equal(formatMeter(137.6), "138 m");
    assert.equal(formatMeter(2400), "2.40 km");
  });

  it("prints five decimals of coordinate", () => {
    assert.equal(formatLatLon({ lat: 14.6386, lon: 121.0785 }), "14.63860, 121.07850");
  });
});

describe("web mercator", () => {
  it("round-trips lat/lon through world pixels at every campus zoom", () => {
    for (const zoom of [15, 16, 17, 18, 19, 20]) {
      for (const point of [CAMPUS_CENTER, percentToLatLon(0, 0), percentToLatLon(100, 100)]) {
        const back = fromWorld(toWorld(point, zoom), zoom);
        assert.ok(Math.abs(back.lat - point.lat) < 1e-9, `lat drift at z${zoom}`);
        assert.ok(Math.abs(back.lon - point.lon) < 1e-9, `lon drift at z${zoom}`);
      }
    }
  });

  it("puts the null island at the exact centre of the world", () => {
    const world = toWorld({ lat: 0, lon: 0 }, 0);
    assert.ok(Math.abs(world.x - 128) < 1e-6);
    assert.ok(Math.abs(world.y - 128) < 1e-6);
  });

  it("doubles world size for each zoom step", () => {
    const a = toWorld(CAMPUS_CENTER, 16);
    const b = toWorld(CAMPUS_CENTER, 17);
    assert.ok(Math.abs(b.x - a.x * 2) < 1e-6);
    assert.ok(Math.abs(b.y - a.y * 2) < 1e-6);
  });

  it("agrees with haversine on ground scale to within 1%", () => {
    /* The overlay is only honest if a metre on screen is a metre on the ground. */
    const zoom = 18;
    const mpp = meterPerPixel(CAMPUS_CENTER.lat, zoom);
    const a = CAMPUS_CENTER;
    const b = { lat: a.lat, lon: a.lon + 0.001 };
    const pixel_span = toWorld(b, zoom).x - toWorld(a, zoom).x;
    const ratio = (pixel_span * mpp) / distanceMeter(a, b);
    assert.ok(Math.abs(ratio - 1) < 0.01, `scale off by ${((ratio - 1) * 100).toFixed(2)}%`);
  });

  it("is NOT the same as the linear box projection — that is why it exists", () => {
    /* If these agreed, markers would not walk off features and this whole
       module would be redundant. Guards against someone 'simplifying' it back. */
    const zoom = 18;
    const nw = toWorld({ lat: CAMPUS_BOX.north, lon: CAMPUS_BOX.west }, zoom);
    const se = toWorld({ lat: CAMPUS_BOX.south, lon: CAMPUS_BOX.east }, zoom);
    const mid_mercator = (toWorld(CAMPUS_CENTER, zoom).y - nw.y) / (se.y - nw.y);
    assert.ok(Math.abs(mid_mercator - 0.5) > 0, "mercator mid-latitude is not the linear midpoint");
  });
});

describe("map framing", () => {
  it("picks a zoom that fits the campus in the viewport", () => {
    for (const [w, h] of [[390, 780], [1440, 900], [900, 820]] as [number, number][]) {
      const zoom = fitZoom(w, h);
      assert.ok(zoom >= MIN_ZOOM && zoom <= MAX_ZOOM);
      const nw = toWorld({ lat: CAMPUS_BOX.north, lon: CAMPUS_BOX.west }, zoom);
      const se = toWorld({ lat: CAMPUS_BOX.south, lon: CAMPUS_BOX.east }, zoom);
      assert.ok(se.x - nw.x <= w, `campus wider than ${w}px at z${zoom}`);
      assert.ok(se.y - nw.y <= h, `campus taller than ${h}px at z${zoom}`);
    }
  });

  it("will not let a stage demo pan off campus", () => {
    const far = clampCenter({ lat: 14.5906, lon: 120.9799 });
    assert.ok(far.lat >= CAMPUS_BOX.south - 0.005);
    assert.ok(far.lon >= CAMPUS_BOX.west - 0.005);
    assert.deepEqual(clampCenter(CAMPUS_CENTER), CAMPUS_CENTER);
  });
});

/* T1.1 acceptance: the box was extended so the biome seed fits inside it. A
   ring point landing outside CAMPUS_BOX means the frame regressed. */
describe("campus frame vs the biome seed", () => {
  it("contains every drawn ring point in campus-biome.json", () => {
    let drawn = 0;
    for (const row of biome_seed.biome) {
      if (!row.ring) continue; // ring: null is the human-blocked case, not a geometry failure
      for (const part of row.ring) {
        assert.ok(part.point.length >= 3, `${row.biome_code} part ${part.part_name} is not a ring`);
        for (const [lat, lon] of part.point) {
          drawn += 1;
          assert.equal(
            isInsideCampus({ lat, lon }),
            true,
            `${row.biome_code} part ${part.part_name} point ${lat},${lon} fell outside CAMPUS_BOX`,
          );
        }
      }
    }
    assert.ok(drawn >= 100, `expected the 7 drawn biomes to contribute real points, got ${drawn}`);
  });
});

describe("restricted geofence", () => {
  it("is a closed polygon inside the campus frame", () => {
    assert.ok(RESTRICTED_POLYGON.length >= 3);
    for (const point of RESTRICTED_POLYGON) {
      assert.equal(isInsideCampus(point), true, "geofence vertex left CAMPUS_BOX");
    }
  });

  it("spawns no encounter inside it — the honesty invariant", () => {
    for (const row of encounter) {
      assert.equal(isInsidePolygon(row, RESTRICTED_POLYGON), false, `${row.encounter_id} spawned in the restricted grove`);
    }
  });

  it("the demo walk never enters it either", () => {
    for (let t = 0; t < 1; t += 0.005) {
      assert.equal(isInsidePolygon(demoWalkAt(t), RESTRICTED_POLYGON), false, `demo walk entered the grove at t=${t}`);
    }
  });
});

describe("walking time", () => {
  it("converts metres to minutes at the stated 1.3 m/s pace", () => {
    assert.equal(WALK_PACE_MS, 1.3);
    /* 249 m — the distance the 09-02 card actually printed — is ≈3 min. */
    assert.equal(walkMinute(249), 3);
    assert.equal(walkMinute(78), 1);
    assert.equal(walkMinute(1000), 13);
  });

  it("never reads zero minutes for a tree you can still walk to", () => {
    for (const meter of [0, 1, 5, 20, 40]) {
      assert.ok(walkMinute(meter) >= 1, `${meter} m rendered as under a minute`);
    }
  });

  it("formats the minute as a gloss, not as a distance", () => {
    const line = formatWalkMinute(249);
    assert.match(line, /≈3 min walk/);
    /* The metre figure must not be swallowed into this string — the caller
       keeps it as the primary number. */
    assert.equal(line.includes("249"), false);
    /* Exactly the minute phrase and nothing else — no metre figure smuggled in. */
    assert.match(line, /^≈\d+ min walk$/);
  });

  it("rises monotonically with distance", () => {
    let last = 0;
    for (let meter = 0; meter < 2000; meter += 37) {
      const now = walkMinute(meter);
      assert.ok(now >= last, `minutes fell from ${last} to ${now} at ${meter} m`);
      last = now;
    }
  });
});
