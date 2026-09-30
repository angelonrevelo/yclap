import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toWorld, type LatLon } from "../src/geo.ts";
import { planePair, planePoint, planeRing } from "../src/plane-cache.ts";

/** A `project` like `tile-map.tsx` builds one: anchored, counting its calls. */
function anchored(zoom: number, origin: { x: number; y: number }) {
  const call = { count: 0 };
  const project = (point: LatLon) => {
    call.count += 1;
    const w = toWorld(point, zoom);
    return { x: w.x - origin.x, y: w.y - origin.y };
  };
  return { project, call };
}

describe("plane cache", () => {
  const tuft: LatLon = { lat: 14.6391, lon: 121.0775 };
  const ring: [number, number][] = [
    [14.639, 121.077],
    [14.6392, 121.077],
    [14.6392, 121.0773],
  ];

  it("lands exactly where `project` does", () => {
    const { project } = anchored(19, { x: 1000, y: 2000 });
    assert.deepEqual(planePoint(project, tuft), project(tuft));
    assert.deepEqual(planePair(project, ring[0]), project({ lat: ring[0][0], lon: ring[0][1] }));
    assert.deepEqual(
      planeRing(project, ring),
      ring.map(([lat, lon]) => project({ lat, lon })),
    );
  });

  it("projects a stable point once per anchor, not once per frame", () => {
    const { project, call } = anchored(21, { x: 0, y: 0 });
    for (let frame = 0; frame < 60; frame += 1) {
      planePoint(project, tuft);
      planeRing(project, ring);
    }
    assert.equal(call.count, 1 + ring.length);
  });

  it("starts over when the anchor steps (a new `project`)", () => {
    const a = anchored(19, { x: 0, y: 0 });
    const b = anchored(19, { x: 2048, y: 0 });
    const at_a = planePoint(a.project, tuft);
    const at_b = planePoint(b.project, tuft);
    assert.equal(at_a.x - at_b.x, 2048);
    assert.equal(b.call.count, 1);
  });
});
