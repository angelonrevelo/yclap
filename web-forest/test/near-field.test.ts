import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { distanceMeter, type LatLon } from "../src/geo.ts";
import { RESTRICTED_POLYGON } from "../src/data.ts";
import { biome_sector, sectorContains } from "../src/sector.ts";
import {
  NEAR_FIELD_M,
  poolFromFile,
  SPAWN_CELL_M,
  spawnAround,
  spawnWorld,
} from "../src/spawn.ts";
import {
  headingFromKey,
  headingFromStick,
  playMeterForTick,
  screenAngleOf,
  signedAngle,
  STICK_DEADZONE,
  throttleFromStick,
} from "../src/play-walk.ts";

const manifest = JSON.parse(
  readFileSync(new URL("../public/model/species-model.json", import.meta.url), "utf8"),
);
const pool = poolFromFile(manifest);
const NOW = Date.UTC(2026, 8, 26, 4, 0, 0);

/** A point inside the biggest biome sector — somewhere the field must be busy. */
const busy: LatLon = (() => {
  const s = [...biome_sector].sort((a, b) => b.area_m2 - a.area_m2)[0];
  let lat = 0;
  let lon = 0;
  for (const [a, b] of s.point) {
    lat += a;
    lon += b;
  }
  return { lat: lat / s.point.length, lon: lon / s.point.length };
})();

function inRestricted(point: LatLon): boolean {
  const ring = RESTRICTED_POLYGON;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if (
      a.lat > point.lat !== b.lat > point.lat &&
      point.lon < ((b.lon - a.lon) * (point.lat - a.lat)) / (b.lat - a.lat) + a.lon
    ) {
      inside = !inside;
    }
  }
  return inside;
}

describe("the near field", () => {
  it("puts finds within reach of a walker standing in a biome", () => {
    const near = spawnAround(pool, NOW, busy);
    assert.ok(near.length > 0, "a walker in the biggest wood sees nothing");
  });

  it("never places a find outside the radius it was asked for", () => {
    const near = spawnAround(pool, NOW, busy, { radius_m: 90 });
    for (const row of near) {
      /* The cell CENTRE is what the radius gates, and a find may be jittered
         up to one cell diagonal past it. Anything beyond that is a bug. */
      const slack = 90 + SPAWN_CELL_M * Math.SQRT2;
      assert.ok(
        distanceMeter(busy, row) <= slack,
        `${row.common_name} is ${distanceMeter(busy, row).toFixed(0)} m out`,
      );
    }
  });

  it("is the same world for two devices standing next to each other", () => {
    /* The whole promise of a seeded world. These two positions are ~8 m apart
       and must agree about every find they can both see. */
    const a = spawnAround(pool, NOW, busy);
    const b = spawnAround(pool, NOW, {
      lat: busy.lat + 0.00005,
      lon: busy.lon + 0.00005,
    });
    const shared = new Set(a.map((r) => r.spawn_id));
    const overlap = b.filter((r) => shared.has(r.spawn_id));
    assert.ok(overlap.length > 0, "two adjacent walkers share no finds at all");
    for (const row of overlap) {
      const mine = a.find((r) => r.spawn_id === row.spawn_id)!;
      assert.equal(mine.species_code, row.species_code);
      assert.equal(mine.lat, row.lat);
      assert.equal(mine.lon, row.lon);
    }
  });

  it("does not reroll when the walker moves — walking finds dice already cast", () => {
    const here = spawnAround(pool, NOW, busy);
    const there = spawnAround(pool, NOW, { lat: busy.lat + 0.0003, lon: busy.lon });
    const here_by_id = new Map(here.map((r) => [r.spawn_id, r]));
    for (const row of there) {
      const before = here_by_id.get(row.spawn_id);
      if (!before) continue;
      assert.equal(before.species_code, row.species_code, `${row.spawn_id} changed species`);
    }
  });

  it("rotates with the window, so a world is not permanent", () => {
    const a = spawnAround(pool, NOW, busy).map((r) => r.spawn_id).sort();
    const b = spawnAround(pool, NOW + 31 * 60 * 1000, busy).map((r) => r.spawn_id).sort();
    assert.notDeepEqual(a, b, "the field is identical in the next window");
  });

  it("spawns nothing on paved ground or inside the grove", () => {
    const near = spawnAround(pool, NOW, busy, { radius_m: 400 });
    for (const row of near) {
      const s = biome_sector.find((x) => x.sector_code === row.sector_code);
      assert.ok(s, `${row.spawn_id} names a sector that is not a biome`);
      assert.ok(sectorContains(s, row), `${row.common_name} sits outside its own sector`);
      assert.ok(!inRestricted(row), `${row.common_name} spawned inside the restricted grove`);
    }
  });

  it("mints a unique id per cell per window", () => {
    const near = spawnAround(pool, NOW, busy, { radius_m: 400 });
    assert.equal(new Set(near.map((r) => r.spawn_id)).size, near.length);
  });

  it("rests ground this device has already walked", () => {
    const explored = new Set(biome_sector.map((s) => s.sector_code));
    const fresh = spawnAround(pool, NOW, busy, { radius_m: 400 });
    const worked = spawnAround(pool, NOW, busy, { radius_m: 400, explored_sector: explored });
    assert.ok(
      worked.length < fresh.length,
      `walked ground held ${worked.length} finds against fresh ground's ${fresh.length}`,
    );
  });
});

describe("spawnWorld", () => {
  it("is exactly the campus-wide world when there is no fix", () => {
    const a = spawnWorld(pool, NOW, null).map((r) => r.spawn_id).sort();
    const b = spawnWorld(pool, NOW, undefined).map((r) => r.spawn_id).sort();
    assert.deepEqual(a, b);
    assert.ok(a.length > 0);
  });

  it("never draws the same find twice", () => {
    const all = spawnWorld(pool, NOW, busy);
    assert.equal(new Set(all.map((r) => r.spawn_id)).size, all.length);
  });

  it("is denser near the walker than the campus-wide world was", () => {
    const flat = spawnWorld(pool, NOW, null).filter(
      (r) => distanceMeter(busy, r) <= NEAR_FIELD_M,
    );
    const lived = spawnWorld(pool, NOW, busy).filter(
      (r) => distanceMeter(busy, r) <= NEAR_FIELD_M,
    );
    assert.ok(
      lived.length > flat.length,
      `near field holds ${lived.length}, the old spread held ${flat.length}`,
    );
  });

  it("keeps the far world, so the rest of campus is not empty", () => {
    const all = spawnWorld(pool, NOW, busy);
    assert.ok(all.some((r) => distanceMeter(busy, r) > NEAR_FIELD_M));
  });
});

describe("the stick", () => {
  it("is at rest inside the deadzone", () => {
    assert.equal(headingFromStick({ x: 0, y: 0 }, 0), null);
    assert.equal(headingFromStick({ x: STICK_DEADZONE / 2, y: 0 }, 0), null);
    assert.equal(throttleFromStick({ x: 0, y: 0 }), 0);
  });

  it("reads screen-up as the direction that LOOKS up under this camera", () => {
    /* The ground plane turns by rotateZ(+bearing), so a bearing of 90 swings
       north round to the RIGHT of the screen and the direction now appearing
       straight up is WEST — 270, not 90. Verified against `toScreen` itself,
       not assumed: the two run in opposite directions, and getting this
       backwards walks you the wrong way round campus the moment anybody
       rotates the view. */
    assert.equal(headingFromStick({ x: 0, y: 1 }, 0), 0);
    assert.equal(headingFromStick({ x: 0, y: 1 }, 90), 270);
    assert.equal(headingFromStick({ x: 0, y: 1 }, 180), 180);
    assert.equal(headingFromStick({ x: 0, y: 1 }, 270), 90);
  });

  it("reads screen-right as a right turn from the camera", () => {
    assert.equal(headingFromStick({ x: 1, y: 0 }, 0), 90);
    assert.equal(headingFromStick({ x: -1, y: 0 }, 0), 270);
    assert.equal(headingFromStick({ x: 0, y: -1 }, 0), 180);
    /* Bearing 90: north is to the right, so screen-right is north. */
    assert.equal(headingFromStick({ x: 1, y: 0 }, 90), 0);
  });

  it("is the exact inverse of the angle the same heading is DRAWN at", () => {
    /* One moves the walker, the other leans them. If these ever disagree the
       character faces somewhere other than where it is going. */
    for (const bearing of [0, 37, 90, 180, 271, 359]) {
      for (const heading of [0, 45, 90, 180, 300]) {
        const screen = screenAngleOf(heading, bearing);
        const stick = {
          x: Math.sin((screen * Math.PI) / 180),
          y: Math.cos((screen * Math.PI) / 180),
        };
        const back = headingFromStick(stick, bearing);
        assert.ok(back !== null);
        assert.ok(
          Math.abs(signedAngle(back - heading)) < 1e-6,
          `bearing ${bearing}, heading ${heading} round-tripped to ${back}`,
        );
      }
    }
  });

  it("folds a lean into -180..180 so straight-up never reads as a hard turn", () => {
    assert.equal(signedAngle(0), 0);
    assert.equal(signedAngle(359), -1);
    assert.equal(signedAngle(181), -179);
    assert.equal(signedAngle(90), 90);
    assert.equal(signedAngle(-370), -10);
  });

  it("agrees with the keyboard it replaced, at every camera angle", () => {
    const held = { north: true, south: false, east: false, west: false };
    for (const bearing of [0, 37, 90, 180, 271]) {
      assert.equal(headingFromKey(held, bearing), headingFromStick({ x: 0, y: 1 }, bearing));
    }
  });

  it("gives a full push full pace and a light push less", () => {
    assert.equal(throttleFromStick({ x: 0, y: 1 }), 1);
    const light = throttleFromStick({ x: 0, y: 0.5 });
    assert.ok(light > 0 && light < 1, `light push gave ${light}`);
  });

  it("starts from zero at the edge of the deadzone, not from a jump", () => {
    const edge = throttleFromStick({ x: 0, y: STICK_DEADZONE + 1e-9 });
    assert.ok(edge < 0.001, `stick jumps to ${edge} the moment it leaves the deadzone`);
  });

  it("clamps an over-thrown stick rather than sprinting on arithmetic", () => {
    assert.equal(throttleFromStick({ x: 3, y: 3 }), 1);
  });

  it("scales the step by the throttle", () => {
    const full = playMeterForTick(1000, false, 1);
    assert.equal(playMeterForTick(1000, false, 0.5), full / 2);
    assert.equal(playMeterForTick(1000, false, 0), 0);
    /* A caller that does not know about throttles still gets a full step. */
    assert.equal(playMeterForTick(1000, false), full);
  });
});
