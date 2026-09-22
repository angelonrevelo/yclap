import assert from "node:assert/strict";
import { test } from "node:test";
import {
  building,
  buildingNear,
  extrude,
  landmark_building,
  riseAtScale1,
  ringBox,
  ringCentre,
  roofColour,
  signedArea,
  type ScreenPoint,
} from "../src/building.ts";
import { isInsideCampus } from "../src/geo.ts";

/** A unit square on screen, wound so its signed area is positive. */
function square(size = 10): ScreenPoint[] {
  return [
    { x: 0, y: 0, scale: 1 },
    { x: size, y: 0, scale: 1 },
    { x: size, y: size, scale: 1 },
    { x: 0, y: size, scale: 1 },
  ];
}

test("the imported pack", async (t) => {
  await t.test("has buildings and every one is a closed-ish ring", () => {
    assert.ok(building.length > 50, `only ${building.length} buildings`);
    for (const row of building) {
      assert.ok(row.point.length >= 4, `${row.name ?? "unnamed"} has ${row.point.length} points`);
    }
  });

  await t.test("keeps every footprint on the campus this app walks", () => {
    for (const row of building) {
      const c = ringCentre(row.point);
      assert.ok(
        isInsideCampus(c),
        `${row.name ?? row.building_code ?? "unnamed"} centres outside CAMPUS_BOX`,
      );
    }
  });

  await t.test("never ships a zero or absurd height", () => {
    for (const row of building) {
      assert.ok(row.height_m > 0, `${row.name} has height ${row.height_m}`);
      /* Nothing on this campus is taller than Areté's neighbourhood. A height
         above this is a units bug in the import, not a building. */
      assert.ok(row.height_m <= 60, `${row.name} claims ${row.height_m} m`);
    }
  });

  await t.test("marks a defaulted height as not measured", () => {
    /* The claim under test is not the ratio — it is that BOTH kinds exist and
       are distinguishable. A pack that silently called every height measured
       would pass every other test in this file. */
    const measured = building.filter((b) => b.is_height_measured).length;
    assert.ok(measured > 0, "no height is marked measured");
    assert.ok(measured < building.length, "every height claims to be measured");
  });

  await t.test("is sorted shortest-first, which is the paint order", () => {
    for (let i = 1; i < building.length; i += 1) {
      assert.ok(
        building[i].height_m >= building[i - 1].height_m,
        `building ${i} is shorter than the one before it`,
      );
    }
  });

  await t.test("never invents a building code or a name", () => {
    for (const row of building) {
      if (row.building_code !== null) assert.ok(row.building_code.length > 0);
      if (row.name !== null) assert.ok(row.name.trim().length > 0);
    }
  });

  await t.test("gives every category a roof colour", () => {
    for (const row of building) {
      assert.match(roofColour(row), /^#[0-9A-Fa-f]{6}$/);
    }
  });

  await t.test("landmarks are named and big", () => {
    assert.ok(landmark_building.length > 0);
    for (const row of landmark_building) {
      assert.ok(row.name !== null);
      assert.ok(row.area_m2 > 900);
    }
  });
});

test("signedArea", async (t) => {
  await t.test("is positive for a screen-space clockwise ring", () => {
    assert.ok(signedArea(square()) > 0);
  });

  await t.test("flips with the winding", () => {
    assert.ok(signedArea([...square()].reverse()) < 0);
  });

  await t.test("is the real area, not just a sign", () => {
    assert.equal(Math.abs(signedArea(square(10))), 100);
  });
});

test("extrude", async (t) => {
  const rise = (scale: number) => 2 * scale;

  await t.test("lifts the roof by height × rise", () => {
    const prism = extrude(square(10), 5, rise);
    assert.ok(prism);
    /* Ground spans y 0..10; a 5 m building at 2 px/m rises 10 px, so the roof
       spans −10..0. The lowest roof vertex is exactly the highest ground one. */
    assert.match(prism.roof, /-10/);
  });

  await t.test("emits only the walls facing the camera", () => {
    const prism = extrude(square(10), 5, rise);
    assert.ok(prism);
    /* A square has four walls and exactly one of them faces down the screen. */
    assert.equal(prism.wall.length, 1);
  });

  await t.test("gives the same walls whichever way the ring is wound", () => {
    const a = extrude(square(10), 5, rise);
    const b = extrude([...square(10)].reverse(), 5, rise);
    assert.ok(a && b);
    assert.equal(a.wall.length, b.wall.length);
  });

  await t.test("reports depth as the nearest ground vertex", () => {
    const prism = extrude(square(10), 5, rise);
    assert.ok(prism);
    assert.equal(prism.depth, 10);
  });

  await t.test("keeps every wall's light inside 0…1", () => {
    for (const row of building.slice(0, 40)) {
      const ring: ScreenPoint[] = row.point.map(([lat, lon]) => ({
        x: lon * 40000,
        y: -lat * 40000,
        scale: 1,
      }));
      const prism = extrude(ring, row.height_m, rise);
      if (!prism) continue;
      for (const w of prism.wall) {
        assert.ok(w.light >= 0 && w.light <= 1, `light ${w.light} out of range`);
      }
    }
  });

  await t.test("refuses a degenerate ring rather than drawing a sliver", () => {
    assert.equal(extrude([{ x: 0, y: 0, scale: 1 }], 5, rise), null);
    assert.equal(
      extrude(
        [
          { x: 0, y: 0, scale: 1 },
          { x: 1, y: 0, scale: 1 },
          { x: 2, y: 0, scale: 1 },
        ],
        5,
        rise,
      ),
      null,
    );
  });
});

test("riseAtScale1", async (t) => {
  await t.test("is zero on a flat camera, so a prism collapses to its footprint", () => {
    assert.equal(riseAtScale1(0, 0.1), 0);
  });

  await t.test("uses the sine of the rake, not the cosine", () => {
    /* At 30° the vertical axis projects to half its length. Cosine would give
       0.866 here, and that swap is the whole bug this asserts against. */
    const rise = riseAtScale1(30, 1);
    assert.ok(Math.abs(rise - 0.5) < 1e-9, `got ${rise}`);
  });

  await t.test("rises further as the camera zooms in", () => {
    assert.ok(riseAtScale1(52, 0.05) > riseAtScale1(52, 0.2));
  });
});

test("buildingNear", async (t) => {
  const arete = building.find((b) => b.building_code === "ARETE");

  await t.test("finds a known building from its own centre", () => {
    assert.ok(arete, "ARETE missing from the pack");
    const near = buildingNear(ringCentre(arete.point), 50);
    assert.ok(near.some((b) => b.building_code === "ARETE"));
  });

  await t.test("returns fewer buildings for a tighter radius", () => {
    assert.ok(arete);
    const centre = ringCentre(arete.point);
    assert.ok(buildingNear(centre, 40).length <= buildingNear(centre, 400).length);
  });

  await t.test("returns nothing far out to sea", () => {
    assert.equal(buildingNear({ lat: 0, lon: 0 }, 100).length, 0);
  });
});

test("ringBox", async (t) => {
  await t.test("bounds the ring it was given", () => {
    const box = ringBox([
      [14.64, 121.07],
      [14.641, 121.072],
      [14.639, 121.071],
    ]);
    assert.equal(box.north, 14.641);
    assert.equal(box.south, 14.639);
    assert.equal(box.west, 121.07);
    assert.equal(box.east, 121.072);
  });
});
