/**
 * The play map's way network, cleaned — one line per way you can walk or drive,
 * never two.
 *
 * Until 10-01 the play ground drew every OSM highway it was given: the road,
 * AND the sidewalk mapped beside it, AND the crossing over it, AND every
 * driveway and parking aisle, each with a round cap. Under the rake that read
 * as two path systems stacked on each other with blobs at every stub (Gelo,
 * 10-01: "its not clean, roundy, osm and our are overlapping"). Pokémon GO's
 * map is the reference: one quiet street network, footpaths only where they
 * are their own way, nothing doubled.
 *
 * The rule is the one pmap's pipeline uses (its claim reconciler): every piece
 * of ground is CLAIMED by one layer, and a later layer that lands on claimed
 * ground is cut, not drawn over it. Streets claim first; a footpath that runs
 * inside a street's ribbon — a sidewalk, whether or not OSM tagged it one — is
 * cut to the stretch that is its own.
 *
 * Steps, all in local metres (the same projection `build-sector.mjs` uses):
 *   1. classify   — street · walk · stair; drop what a player never reads as a
 *                   way (driveway, parking aisle, drive-through, crossing,
 *                   tagged sidewalk, underground).
 *   2. reconcile  — cut each walk where it lies inside a street's ribbon.
 *   3. snap       — an end within SNAP_M of another way lands ON it, so a
 *                   junction is a junction and not a near miss with two caps.
 *   4. chain      — ways meeting end-to-end (and nothing else there) become one
 *                   line, so a bend is a join, never two overlapping caps.
 *   5. prune      — dead-end stubs shorter than STUB_M go.
 *   6. simplify   — 0.8 m Douglas–Peucker.
 * Plus the open water inside the box (the pond, the pool), which the old
 * ground never drew at all.
 *
 * Writes `src/asset/campus-network.json` with a `report` of what each step
 * removed, so a regression is a number in a diff. `test/network.test.ts` holds
 * the invariants.
 *
 * Run: node script/build-network.mjs   (needs script/data/osm-way-raw.json
 * from fetch-osm-way.mjs)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const raw = JSON.parse(readFileSync(new URL("./data/osm-way-raw.json", import.meta.url), "utf8"));

/* ── projection (same as build-sector.mjs) ─────────────────────────────── */
const LAT0 = 14.6393;
const LON0 = 121.0785;
const M_PER_DEG_LAT = 110574;
const M_PER_DEG_LON = 111320 * Math.cos((LAT0 * Math.PI) / 180);
const toM = (lat, lon) => [(lon - LON0) * M_PER_DEG_LON, (lat - LAT0) * M_PER_DEG_LAT];
const toLatLon = ([x, y]) => [Number((y / M_PER_DEG_LAT + LAT0).toFixed(6)), Number((x / M_PER_DEG_LON + LON0).toFixed(6))];

/* ── tuning, metres ────────────────────────────────────────────────────── */
/** Half a street's drawn width (`roadWidthPx`: 5.5 m) plus a walk's half (1.3 m) plus the kerb gap sidewalks are mapped at. */
const STREET_CLAIM_M = 2.75 + 1.3 + 2.6;
/** A walk's own stretch shorter than this, once the street's claim is cut out, is a sidewalk sliver. */
const KEEP_RUN_M = 7;
const SAMPLE_M = 1.5;
const SNAP_M = 3;
const STUB_M = 9;
const SIMPLIFY_M = 0.8;
/** Streets outside campus are kept this far past its bounding box, so campus does not float in a void. */
const OUTSIDE_REACH_M = 260;

const STREET = new Set(["motorway", "trunk", "primary", "secondary", "tertiary", "unclassified", "residential", "living_street", "service"]);
const WALK = new Set(["footway", "pedestrian", "path", "cycleway", "track"]);
const DROP_SERVICE = new Set(["driveway", "parking_aisle", "drive-through"]);
const DROP_FOOTWAY = new Set(["sidewalk", "crossing", "link"]);

/* ── geometry ──────────────────────────────────────────────────────────── */
function signedArea(ring) {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}
function pointInRing(ring, [px, py]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function bbox(ring) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of ring) {
    if (x < x0) x0 = x; if (x > x1) x1 = x;
    if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  return [x0, y0, x1, y1];
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function lengthOf(line) {
  let sum = 0;
  for (let i = 1; i < line.length; i += 1) sum += dist(line[i - 1], line[i]);
  return sum;
}
/** Closest point on segment ab to p, and its distance. */
function nearestOnSegment(p, a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy || 1e-9;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  const q = [a[0] + t * dx, a[1] + t * dy];
  return { q, d: dist(p, q) };
}
function nearestOnLine(p, line) {
  let best = { q: line[0], d: Infinity };
  for (let i = 1; i < line.length; i += 1) {
    const hit = nearestOnSegment(p, line[i - 1], line[i]);
    if (hit.d < best.d) best = hit;
  }
  return best;
}
function simplify(line, tolerance) {
  if (line.length < 3) return line;
  const keep = new Uint8Array(line.length);
  keep[0] = 1;
  keep[line.length - 1] = 1;
  const stack = [[0, line.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let worst = 0;
    let at = -1;
    for (let i = a + 1; i < b; i += 1) {
      const { d } = nearestOnSegment(line[i], line[a], line[b]);
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > tolerance && at > 0) {
      keep[at] = 1;
      stack.push([a, at], [at, b]);
    }
  }
  return line.filter((_, i) => keep[i]);
}
/** The line resampled every `step` metres, keeping every original vertex. */
function densify(line, step) {
  const out = [line[0]];
  for (let i = 1; i < line.length; i += 1) {
    const a = line[i - 1];
    const b = line[i];
    const n = Math.max(1, Math.ceil(dist(a, b) / step));
    for (let k = 1; k <= n; k += 1) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}

/* ── 0. the play area ──────────────────────────────────────────────────── */
let play_area = null;
for (const w of raw.element) {
  const t = w.tags ?? {};
  if (t.amenity === "university" && /Ateneo de Manila University/i.test(t.name ?? "")) {
    const ring = w.geometry.map((g) => toM(g.lat, g.lon));
    if (!play_area || Math.abs(signedArea(ring)) > Math.abs(signedArea(play_area))) play_area = ring;
  }
}
if (!play_area) throw new Error("no university ring in osm-way-raw.json");
const PLAY_BOX = bbox(play_area);
const inReach = ([x, y], pad) => x > PLAY_BOX[0] - pad && x < PLAY_BOX[2] + pad && y > PLAY_BOX[1] - pad && y < PLAY_BOX[3] + pad;

/* ── 1. classify ───────────────────────────────────────────────────────── */
const report = {
  osm_way: 0,
  drop_driveway: 0,
  drop_parking_aisle: 0,
  drop_sidewalk: 0,
  drop_crossing: 0,
  drop_underground: 0,
  drop_area: 0,
  drop_off_campus_walk: 0,
  walk_cut_by_street: 0,
  walk_dropped_by_street: 0,
  snapped_end: 0,
  chained_join: 0,
  pruned_stub: 0,
  street: 0,
  walk: 0,
  stair: 0,
  water: 0,
};

const street = [];
const walk = [];
const water = [];
for (const w of raw.element) {
  const t = w.tags ?? {};
  const line = w.geometry.map((g) => toM(g.lat, g.lon));
  if ((t.natural === "water" || t.leisure === "swimming_pool") && line.length > 3 && line.some((p) => inReach(p, 0))) {
    water.push({ water_kind: t.leisure === "swimming_pool" ? "pool" : t.water ?? "water", name: t.name ?? null, ring: line });
    continue;
  }
  if (!t.highway) continue;
  const is_street = STREET.has(t.highway);
  const is_walk = WALK.has(t.highway) || t.highway === "steps";
  if (!is_street && !is_walk) continue;
  report.osm_way += 1;
  if (t.area === "yes") { report.drop_area += 1; continue; }
  if (Number(t.layer) < 0 || t.tunnel === "yes") { report.drop_underground += 1; continue; }
  if (t.highway === "service" && DROP_SERVICE.has(t.service)) {
    if (t.service === "driveway") report.drop_driveway += 1;
    else report.drop_parking_aisle += 1;
    continue;
  }
  if (t.footway && DROP_FOOTWAY.has(t.footway)) {
    if (t.footway === "crossing") report.drop_crossing += 1;
    else report.drop_sidewalk += 1;
    continue;
  }
  if (!line.some((p) => inReach(p, is_street ? OUTSIDE_REACH_M : 0))) continue;
  const is_inside = line.some((p) => pointInRing(play_area, p));
  if (is_walk && !is_inside) { report.drop_off_campus_walk += 1; continue; }
  if (is_street) street.push({ way_class: "street", is_outside: !is_inside, line });
  else walk.push({ way_class: t.highway === "steps" ? "stair" : "walk", is_outside: false, line });
}

/* ── 1b. pmap's streets, when the file is here ────────────────────────────
 *
 * pmap (Gelo's place engine) OWNS the ADMU street network: seeded from OSM
 * once, then edited against imagery — lane-by-lane profiles with reviewed
 * widths (Katipunan 16–19 m, a campus service road 4 m), designed lots, and
 * the driveways it already re-drew. When `script/data/pmap-street.json` is
 * present (scp from the Mac: ~/Code/pmap/place/admu/street.json) its
 * segments replace the OSM ways: streets at their CARRIAGEWAY width (lanes,
 * not sidewalks — Pokémon GO shows the road, not the kerb), footways at
 * theirs, aisles and lot roads dropped. Water and the play area still come
 * from OSM. Without the file the OSM path above stands. */
const PMAP = new URL("./data/pmap-street.json", import.meta.url);
report.source = "osm";
if (existsSync(PMAP)) {
  const pm = JSON.parse(readFileSync(PMAP, "utf8"));
  const at = new Map(pm.node.map((n) => [n.node_code, n.at]));
  const profile = new Map(pm.profile.map((p) => [p.profile_code, p]));
  const CARRIAGE = new Set(["drive", "parking", "bike", "median", "shoulder"]);
  street.length = 0;
  walk.length = 0;
  report.source = "pmap";
  report.pmap_segment = pm.segment.length;
  for (const seg of pm.segment) {
    const code = seg.profile_code;
    const pro = profile.get(code);
    const from = at.get(seg.from);
    const to = at.get(seg.to);
    if (!pro || !from || !to) continue;
    if (/^aisle|lot/.test(code) || /parking aisle|driveway/i.test(seg.name ?? "")) { report.drop_parking_aisle += 1; continue; }
    const line = [from, ...(seg.via ?? []), to].map(([lon, lat]) => toM(lat, lon));
    const is_stair = code.startsWith("steps");
    const is_walk = is_stair || code.startsWith("footway");
    const width_m = is_walk
      ? pro.lane.reduce((sum, l) => sum + l.width_m, 0)
      : pro.lane.filter((l) => CARRIAGE.has(l.kind)).reduce((sum, l) => sum + l.width_m, 0);
    if (!(width_m > 0)) continue;
    if (!line.some((p) => inReach(p, is_walk ? 0 : OUTSIDE_REACH_M))) continue;
    const is_inside = line.some((p) => pointInRing(play_area, p));
    if (is_walk && !is_inside) { report.drop_off_campus_walk += 1; continue; }
    if (is_walk) walk.push({ way_class: is_stair ? "stair" : "walk", is_outside: false, line, width_m });
    else street.push({ way_class: "street", is_outside: !is_inside, line, width_m });
  }
}

/* ── 2. reconcile: streets claim their ribbon, walks are cut out of it ── */
/* A street claims half its own width, half a walk, and the kerb gap. */
const claimOf = (s) => (s.width_m ? s.width_m / 2 + 1.0 + 1.6 : STREET_CLAIM_M);
const claimed = (p) => street.some((s) => nearestOnLine(p, s.line).d < claimOf(s));
const walk_kept = [];
for (const w of walk) {
  const sample = densify(w.line, SAMPLE_M);
  const is_claimed = sample.map(claimed);
  if (!is_claimed.some(Boolean)) { walk_kept.push(w); continue; }
  /* Runs of unclaimed samples, each carried one sample INTO the claim at
     either end so the cut walk still meets the street it runs up to. */
  let kept_any = false;
  let start = -1;
  for (let i = 0; i <= sample.length; i += 1) {
    const free = i < sample.length && !is_claimed[i];
    if (free && start < 0) start = i;
    if (!free && start >= 0) {
      const a = Math.max(0, start - 1);
      const b = Math.min(sample.length - 1, i);
      const run = sample.slice(a, b + 1);
      if (lengthOf(run) >= KEEP_RUN_M) { walk_kept.push({ ...w, line: run }); kept_any = true; }
      start = -1;
    }
  }
  if (kept_any) report.walk_cut_by_street += 1;
  else report.walk_dropped_by_street += 1;
}

/* ── 3. snap: an end near another way lands on it ──────────────────────── */
const all = [...street, ...walk_kept];
for (const w of all) {
  for (const end of [0, w.line.length - 1]) {
    const p = w.line[end];
    let best = null;
    for (const o of all) {
      if (o === w) continue;
      const hit = nearestOnLine(p, o.line);
      if (hit.d > 1e-6 && hit.d < SNAP_M && (!best || hit.d < best.d)) best = hit;
    }
    if (best) { w.line[end] = best.q; report.snapped_end += 1; }
  }
}

/* ── 4. chain: two ways meeting end to end, and nothing else there ────── */
const key = (p) => `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)}`;
function chain(list) {
  let changed = true;
  while (changed) {
    changed = false;
    const at = new Map();
    for (const w of list) for (const p of [w.line[0], w.line[w.line.length - 1]]) {
      const k = key(p);
      at.set(k, [...(at.get(k) ?? []), w]);
    }
    /* A vertex in the MIDDLE of another way also makes a junction there. */
    const touches = (p, a, b) => all.some((o) => o !== a && o !== b && nearestOnLine(p, o.line).d < 0.05);
    for (const [k, meet] of at) {
      if (meet.length !== 2) continue;
      const [a, b] = meet;
      if (a === b || a.way_class !== b.way_class || a.is_outside !== b.is_outside || a.width_m !== b.width_m) continue;
      const p = key(a.line[0]) === k ? a.line[0] : a.line[a.line.length - 1];
      if (touches(p, a, b)) continue;
      const a_line = key(a.line[a.line.length - 1]) === k ? a.line : [...a.line].reverse();
      const b_line = key(b.line[0]) === k ? b.line : [...b.line].reverse();
      a.line = [...a_line, ...b_line.slice(1)];
      list.splice(list.indexOf(b), 1);
      all.splice(all.indexOf(b), 1);
      report.chained_join += 1;
      changed = true;
      break;
    }
  }
}
chain(street);
chain(walk_kept);

/* ── 5. prune dead-end stubs ───────────────────────────────────────────── */
for (let pass = 0; pass < 3; pass += 1) {
  for (const w of [...walk_kept]) {
    if (lengthOf(w.line) >= STUB_M) continue;
    const joined = (p) => all.some((o) => o !== w && nearestOnLine(p, o.line).d < 0.05);
    const is_dead = !joined(w.line[0]) || !joined(w.line[w.line.length - 1]);
    if (!is_dead) continue;
    walk_kept.splice(walk_kept.indexOf(w), 1);
    all.splice(all.indexOf(w), 1);
    report.pruned_stub += 1;
  }
}

/* ── 6. simplify + write ───────────────────────────────────────────────── */
const way = [...street, ...walk_kept].map((w) => ({
  way_class: w.way_class,
  is_outside: w.is_outside,
  /* Metres, from pmap's reviewed profile; absent on the OSM path (class width then). */
  ...(w.width_m ? { width_m: Math.round(w.width_m * 10) / 10 } : {}),
  point: simplify(w.line, SIMPLIFY_M).map(toLatLon),
}));
for (const w of way) report[w.way_class] += 1;
report.water = water.length;

writeFileSync(
  new URL("../src/asset/campus-network.json", import.meta.url),
  JSON.stringify({
    _comment:
      "The play map's way network, cleaned by script/build-network.mjs: streets claim their ribbon, " +
      "sidewalks/crossings/driveways/parking aisles are dropped, ends snapped, ways chained, stubs pruned. " +
      "OSM geometry, ODbL. Not a survey.",
    generated_at: new Date().toISOString().slice(0, 10),
    attribution: "Ways and water © OpenStreetMap contributors, ODbL",
    report,
    way,
    water: water.map((w) => ({ water_kind: w.water_kind, name: w.name, point: simplify(w.ring, SIMPLIFY_M).map(toLatLon) })),
  }),
);
console.log(JSON.stringify(report, null, 1));
