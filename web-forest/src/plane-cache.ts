import type { LatLon } from "./geo.ts";

/**
 * Plane coordinates, worked out once per camera ANCHOR instead of once per
 * camera frame.
 *
 * The play view's `project` (`tile-map.tsx`) is anchored: its identity only
 * changes when the camera crosses an `ANCHOR_GRID` step or the zoom level
 * changes, so for a given `project` a fixed thing on the ground always lands
 * on the same plane pixel. Everything that stands on the glass — trees,
 * buildings, finds, sector names — was still re-projecting its lat/lon through
 * `toWorld` (a Mercator log and tan per point) on every frame, and at the
 * pulled-back camera that is every tree, every building corner and every find
 * on campus, sixty times a second (`toWorld` was the largest single JS
 * function in the z19 profile after the React commit, 10-01). Only the cheap
 * last step, `toScreen`, has to run per frame.
 *
 * Keyed by object identity, in WeakMaps, on both sides: a new `project`
 * starts a fresh table and the old one is collected with it, and a point
 * that is rebuilt every render (a GPS fix) must NOT be passed here — it would
 * miss every time. Pass the stable things: the tuft scatter, the building
 * rings, a find row, a sector's `label_point`.
 *
 * The points handed back are shared. Do not mutate them.
 */

export interface PlanePoint {
  x: number;
  y: number;
}

type Project = (point: LatLon) => PlanePoint;

const point_table = new WeakMap<Project, WeakMap<object, PlanePoint>>();
const ring_table = new WeakMap<Project, WeakMap<object, PlanePoint[]>>();

function tableOf<T>(table: WeakMap<Project, WeakMap<object, T>>, project: Project): WeakMap<object, T> {
  let out = table.get(project);
  if (!out) {
    out = new WeakMap();
    table.set(project, out);
  }
  return out;
}

/** A stable lat/lon object (a tuft, a find row) on the plane. */
export function planePoint(project: Project, point: LatLon): PlanePoint {
  const table = tableOf(point_table, project);
  let out = table.get(point);
  if (!out) {
    const p = project(point);
    out = { x: p.x, y: p.y };
    table.set(point, out);
  }
  return out;
}

/** A stable `[lat, lon]` pair (a sector's `label_point`) on the plane. */
export function planePair(project: Project, pair: readonly [number, number]): PlanePoint {
  const table = tableOf(point_table, project);
  let out = table.get(pair);
  if (!out) {
    const p = project({ lat: pair[0], lon: pair[1] });
    out = { x: p.x, y: p.y };
    table.set(pair, out);
  }
  return out;
}

/** A stable ring of `[lat, lon]` (a building footprint) on the plane. */
export function planeRing(project: Project, ring: readonly (readonly [number, number])[]): PlanePoint[] {
  const table = tableOf(ring_table, project);
  let out = table.get(ring);
  if (!out) {
    out = ring.map(([lat, lon]) => {
      const p = project({ lat, lon });
      return { x: p.x, y: p.y };
    });
    table.set(ring, out);
  }
  return out;
}
