/**
 * Walk-to routing — the way round a building instead of into it.
 *
 * Until 09-26 a walk-to was a straight line with a wall-slide, and it gave up at
 * the first wall the slide could not get past: of the far finds tried in the
 * playtest, three stalled 314–646 m short (one with the walker pressed against
 * Xavier Hall), and three of thirteen random finds stalled 87–206 m short —
 * silently, after a "Walking to X" toast.
 *
 * Now a walk-to plans a route first. The ground is a grid of `ROUTE_CELL_M`
 * cells over `CAMPUS_BOX`; a cell is open when its centre passes `isWalkable`,
 * the same rule the stick, the spawner and every find obey, so a route can only
 * run where the walker is allowed to stand. The campus footpath network
 * (`campus-path.json`, OSM) is burnt into that grid as cheaper cells, so A*
 * prefers the footways where they exist and cuts across a lawn only where they
 * do not. Why one grid and not a path graph with a grid fallback: the OSM ways
 * run through footprints (covered walks, lobbies), stop at the box edge and do
 * not all meet, so a graph built from them alone strands a walker on an island
 * the grid would have crossed. Weighting the grid keeps the preference and
 * never the dead end.
 *
 * The grid is built once, on the first walk-to, and cached. The A* result is
 * then pulled taut — a run of cells becomes one straight leg wherever that leg
 * is walkable every metre and costs no more than the cells it replaces — so the
 * walker heads for a handful of corners, not a staircase of 4 m cells.
 */
import campus_path from "./asset/campus-path.json" with { type: "json" };
import { CAMPUS_BOX, distanceMeter, type LatLon } from "./geo.ts";
import { isWalkable } from "./placement.ts";

/** Grid pitch, metres. Narrow enough for the gaps between Gonzaga-row buildings. */
export const ROUTE_CELL_M = 4;

/** Cost of a cell on a mapped footpath, relative to open ground (1). */
export const PATH_CELL_COST = 0.7;

/** How far a start or goal off open ground is carried to the nearest open cell, metres. */
const SNAP_REACH_M = 40;

const LAT_M = 110_540;
const LON_M = 111_320 * Math.cos((((CAMPUS_BOX.north + CAMPUS_BOX.south) / 2) * Math.PI) / 180);

export interface RouteGrid {
  column: number;
  row: number;
  /** 0 blocked, else the cell's cost per metre (1 open ground, `PATH_CELL_COST` on a footpath). */
  cost: Float32Array;
  /** Cells that sit on a mapped footpath. */
  path_cell_count: number;
  open_cell_count: number;
  build_ms: number;
}

let grid_cache: RouteGrid | null = null;

function xOf(point: LatLon): number {
  return (point.lon - CAMPUS_BOX.west) * LON_M;
}

function yOf(point: LatLon): number {
  return (point.lat - CAMPUS_BOX.south) * LAT_M;
}

function pointOf(x: number, y: number): LatLon {
  return { lat: CAMPUS_BOX.south + y / LAT_M, lon: CAMPUS_BOX.west + x / LON_M };
}

function cellCentre(grid: RouteGrid, i: number): LatLon {
  const c = i % grid.column;
  const r = (i - c) / grid.column;
  return pointOf((c + 0.5) * ROUTE_CELL_M, (r + 0.5) * ROUTE_CELL_M);
}

function cellOf(grid: RouteGrid, point: LatLon): number {
  const c = Math.floor(xOf(point) / ROUTE_CELL_M);
  const r = Math.floor(yOf(point) / ROUTE_CELL_M);
  if (c < 0 || r < 0 || c >= grid.column || r >= grid.row) return -1;
  return r * grid.column + c;
}

interface PathFile {
  feature: { line: number[][] }[];
}

/** The routing grid, built on first use and cached for the session. */
export function routeGrid(): RouteGrid {
  if (grid_cache) return grid_cache;
  const began = performance.now();
  const column = Math.ceil(((CAMPUS_BOX.east - CAMPUS_BOX.west) * LON_M) / ROUTE_CELL_M);
  const row = Math.ceil(((CAMPUS_BOX.north - CAMPUS_BOX.south) * LAT_M) / ROUTE_CELL_M);
  const grid: RouteGrid = { column, row, cost: new Float32Array(column * row), path_cell_count: 0, open_cell_count: 0, build_ms: 0 };
  for (let i = 0; i < column * row; i += 1) {
    if (isWalkable(cellCentre(grid, i))) {
      grid.cost[i] = 1;
      grid.open_cell_count += 1;
    }
  }
  /* Footpaths, burnt in at half-cell steps. [lon, lat] in that file. */
  for (const way of (campus_path as PathFile).feature) {
    for (let k = 1; k < way.line.length; k += 1) {
      const a = { lat: way.line[k - 1][1], lon: way.line[k - 1][0] };
      const b = { lat: way.line[k][1], lon: way.line[k][0] };
      const step = Math.max(1, Math.ceil(distanceMeter(a, b) / (ROUTE_CELL_M / 2)));
      for (let s = 0; s <= step; s += 1) {
        const t = s / step;
        const i = cellOf(grid, { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t });
        if (i >= 0 && grid.cost[i] === 1) {
          grid.cost[i] = PATH_CELL_COST;
          grid.path_cell_count += 1;
        }
      }
    }
  }
  grid.build_ms = performance.now() - began;
  grid_cache = grid;
  return grid;
}

/** The nearest open cell to `point`, searched outward ring by ring; -1 past `SNAP_REACH_M`. */
function snapCell(grid: RouteGrid, point: LatLon): number {
  const c0 = Math.floor(xOf(point) / ROUTE_CELL_M);
  const r0 = Math.floor(yOf(point) / ROUTE_CELL_M);
  const reach = Math.ceil(SNAP_REACH_M / ROUTE_CELL_M);
  let best = -1;
  let best_d = Infinity;
  for (let ring = 0; ring <= reach; ring += 1) {
    for (let dr = -ring; dr <= ring; dr += 1) {
      for (let dc = -ring; dc <= ring; dc += 1) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== ring) continue;
        const c = c0 + dc;
        const r = r0 + dr;
        if (c < 0 || r < 0 || c >= grid.column || r >= grid.row) continue;
        const i = r * grid.column + c;
        if (grid.cost[i] === 0) continue;
        const d = distanceMeter(point, cellCentre(grid, i));
        if (d < best_d) {
          best_d = d;
          best = i;
        }
      }
    }
    /* Anything a further ring holds is at least ring·cell away. */
    if (best >= 0 && best_d <= ring * ROUTE_CELL_M) return best;
  }
  return best;
}

const SQRT2 = Math.SQRT2;
const NEIGHBOUR: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2],
];

/* Search scratch, reused across routes — a route allocates nothing per cell. */
let g_score: Float32Array | null = null;
let came_from: Int32Array | null = null;
let seen_mark: Uint32Array | null = null;
let closed_mark: Uint32Array | null = null;
let search_id = 0;

/** A* over the grid, 8-connected, no corner-cutting. Cell indices start → goal, or null. */
function searchCell(grid: RouteGrid, start: number, goal: number): { cell: number[]; g: number[] } | null {
  const n = grid.column * grid.row;
  if (!g_score || g_score.length !== n) {
    g_score = new Float32Array(n);
    came_from = new Int32Array(n);
    seen_mark = new Uint32Array(n);
    closed_mark = new Uint32Array(n);
  }
  const g = g_score;
  const from = came_from!;
  const seen = seen_mark!;
  const closed = closed_mark!;
  search_id += 1;
  const id = search_id;
  const col = grid.column;
  const gc = goal % col;
  const gr = (goal - gc) / col;
  /* Octile distance at the cheapest cost — admissible, so the route is the cheapest one. */
  const h = (i: number) => {
    const dc = Math.abs((i % col) - gc);
    const dr = Math.abs(Math.floor(i / col) - gr);
    return (Math.max(dc, dr) + (SQRT2 - 1) * Math.min(dc, dr)) * ROUTE_CELL_M * PATH_CELL_COST;
  };
  /* Binary heap of [f, cell], lazy deletion. */
  const heap_f: number[] = [];
  const heap_i: number[] = [];
  const push = (f: number, i: number) => {
    let k = heap_f.length;
    heap_f.push(f);
    heap_i.push(i);
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (heap_f[p] <= f) break;
      heap_f[k] = heap_f[p];
      heap_i[k] = heap_i[p];
      k = p;
    }
    heap_f[k] = f;
    heap_i[k] = i;
  };
  const pop = (): number => {
    const top = heap_i[0];
    const last_f = heap_f.pop()!;
    const last_i = heap_i.pop()!;
    const size = heap_f.length;
    if (size > 0) {
      let k = 0;
      for (;;) {
        let c = 2 * k + 1;
        if (c >= size) break;
        if (c + 1 < size && heap_f[c + 1] < heap_f[c]) c += 1;
        if (heap_f[c] >= last_f) break;
        heap_f[k] = heap_f[c];
        heap_i[k] = heap_i[c];
        k = c;
      }
      heap_f[k] = last_f;
      heap_i[k] = last_i;
    }
    return top;
  };

  g[start] = 0;
  from[start] = -1;
  seen[start] = id;
  push(h(start), start);
  while (heap_f.length > 0) {
    const i = pop();
    if (closed[i] === id) continue;
    closed[i] = id;
    if (i === goal) break;
    const c = i % col;
    const r = (i - c) / col;
    for (const [dc, dr, len] of NEIGHBOUR) {
      const nc = c + dc;
      const nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= col || nr >= grid.row) continue;
      const j = nr * col + nc;
      const cost_j = grid.cost[j];
      if (cost_j === 0 || closed[j] === id) continue;
      /* A diagonal needs both sides open, or it clips the corner of a wall. */
      if (dc !== 0 && dr !== 0 && (grid.cost[r * col + nc] === 0 || grid.cost[nr * col + c] === 0)) continue;
      const step = ((grid.cost[i] + cost_j) / 2) * len * ROUTE_CELL_M;
      const next = g[i] + step;
      if (seen[j] === id && next >= g[j]) continue;
      seen[j] = id;
      g[j] = next;
      from[j] = i;
      push(next + h(j), j);
    }
  }
  if (closed[goal] !== id) return null;
  const cell: number[] = [];
  const cost: number[] = [];
  for (let i = goal; i !== -1; i = from[i]) {
    cell.push(i);
    cost.push(g[i]);
  }
  return { cell: cell.reverse(), g: cost.reverse() };
}

/** Sample spacing, metres, when a straight leg is costed on the grid. */
const LEG_PROBE_M = ROUTE_CELL_M / 2;

/** Sample spacing, metres, when a chosen leg is checked against the real footprints. */
const WALL_PROBE_M = 1;

/** Longest single leg the taut pull tries, metres — keeps the pull linear-ish on a long route. */
const LEG_MAX_M = 160;

/** What a straight leg costs on the grid; Infinity when it crosses a blocked cell. */
function legCost(grid: RouteGrid, a: LatLon, b: LatLon): number {
  const d = distanceMeter(a, b);
  const step = Math.max(1, Math.ceil(d / LEG_PROBE_M));
  let cost = 0;
  for (let s = 0; s <= step; s += 1) {
    const t = s / step;
    const i = cellOf(grid, { lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t });
    if (i < 0 || grid.cost[i] === 0) return Infinity;
    if (s > 0) cost += grid.cost[i] * (d / step);
  }
  return cost;
}

/** Walkable every metre by the real rule — a cell can be open at its centre and clip a wall at its edge. */
function isLegClear(a: LatLon, b: LatLon): boolean {
  const step = Math.max(1, Math.ceil(distanceMeter(a, b) / WALL_PROBE_M));
  for (let s = 1; s < step; s += 1) {
    const t = s / step;
    if (!isWalkable({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t })) return false;
  }
  return true;
}

export interface Route {
  /** Where to head, in order. The last one is where the walk ends. */
  waypoint: LatLon[];
  length_m: number;
}

/**
 * The route from `from` to `to`, or null when there is no way.
 *
 * `to` need not be walkable — a tap on a roof routes to the nearest open ground
 * beside it. With `short_m`, the route ends that far back along its own last
 * leg (so the walker stops beside a find, not on its pin) — along the route,
 * not along the straight line, which could put the stop on the far side of a wall.
 */
export function planRoute(from: LatLon, to: LatLon, short_m = 0): Route | null {
  const grid = routeGrid();
  const start = snapCell(grid, from);
  const goal = snapCell(grid, to);
  if (start < 0 || goal < 0) return null;
  const found = searchCell(grid, start, goal);
  if (!found) return null;

  /* Cells → points, with the real start and end on either side. */
  const point: LatLon[] = [from];
  const cost: number[] = [0];
  const lead = legCost(grid, from, cellCentre(grid, start));
  const lead_cost = Number.isFinite(lead) ? lead : distanceMeter(from, cellCentre(grid, start));
  for (let k = 0; k < found.cell.length; k += 1) {
    point.push(cellCentre(grid, found.cell[k]));
    cost.push(lead_cost + found.g[k]);
  }
  const end = isWalkable(to) ? to : null;
  if (end) {
    point.push(end);
    cost.push(cost[cost.length - 1] + distanceMeter(point[point.length - 1], end));
  }

  /* Pull it taut: from each corner, the farthest point reachable by one
     walkable leg that costs no more than the cells it skips. */
  const taut: LatLon[] = [point[0]];
  let a = 0;
  while (a < point.length - 1) {
    /* Candidates the grid allows, nearest first; the farthest that also
       clears the real footprints wins. The next cell always does, near
       enough: it is one grid step between two open centres. */
    const candidate: number[] = [];
    for (let k = a + 2; k < point.length; k += 1) {
      if (distanceMeter(point[a], point[k]) > LEG_MAX_M) break;
      const leg = legCost(grid, point[a], point[k]);
      if (!Number.isFinite(leg)) break;
      if (leg <= cost[k] - cost[a] + 1e-6) candidate.push(k);
    }
    let b = a + 1;
    for (let c = candidate.length - 1; c >= 0; c -= 1) {
      if (isLegClear(point[a], point[candidate[c]])) {
        b = candidate[c];
        break;
      }
    }
    taut.push(point[b]);
    a = b;
  }

  const route: Route = { waypoint: taut.slice(1), length_m: 0 };
  if (route.waypoint.length === 0) route.waypoint.push(from);
  if (short_m > 0) trimRoute(route, from, short_m);
  let prev = from;
  for (const p of route.waypoint) {
    route.length_m += distanceMeter(prev, p);
    prev = p;
  }
  return route;
}

/** Take `short_m` off the end of a route, back along its own legs; never past its start. */
function trimRoute(route: Route, from: LatLon, short_m: number): void {
  let left = short_m;
  while (left > 0 && route.waypoint.length > 0) {
    const end = route.waypoint[route.waypoint.length - 1];
    const before = route.waypoint.length > 1 ? route.waypoint[route.waypoint.length - 2] : from;
    const leg = distanceMeter(before, end);
    if (leg > left) {
      const t = (leg - left) / leg;
      const cut = { lat: before.lat + (end.lat - before.lat) * t, lon: before.lon + (end.lon - before.lon) * t };
      if (isWalkable(cut)) route.waypoint[route.waypoint.length - 1] = cut;
      return;
    }
    left -= leg;
    if (route.waypoint.length === 1) {
      route.waypoint[0] = from;
      return;
    }
    route.waypoint.pop();
  }
}

/** What to say when a walk-to cannot start or cannot finish. */
export function noRouteLine(name: string): string {
  return `Can't find a way to ${name} from here`;
}

export function stuckLine(name: string): string {
  return `Stuck on the way to ${name}. Steer round and try again`;
}

/** Test and dev hook: forget the cached grid. */
export function resetRouteGrid(): void {
  grid_cache = null;
}
