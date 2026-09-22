/**
 * Import the curated Ateneo building footprints from the sisia campus app.
 *
 * `campus-shape.json` already carries 121 building rings, traced from the same
 * OSM way network the sectors were cut from — but they are rings and nothing
 * else. A ring can be drawn flat; it cannot be extruded, because nothing in it
 * says how tall the building is.
 *
 * sisia's `apps/campus/src/data/buildings.ts` is the missing half: 228 curated
 * footprints with a **height**, a category, and where they exist an AISIS
 * building code and display name. It is OSM + Overture, merged and deduped by
 * that repo's `curate-buildings.ts`, so the licence position is the one this
 * repo already holds for every other line it draws: ODbL, credited on screen.
 *
 * This script is the seam between the two repos and runs by hand, not at build
 * time — the output is committed, so a clone of yclap never needs sisia on
 * disk. Re-run it only when sisia re-curates.
 *
 *   node script/import-sisia-building.mjs [path-to-sisia-app]
 *
 * What it does NOT do: invent a height. A building whose source had no level
 * count comes across with sisia's own category default, and `is_height_measured`
 * records which of the two it was, because a skyline drawn from defaults is a
 * drawing and must not be read as a survey.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

const SISIA = process.argv[2] ?? "C:/Users/maran/code/sisia-app";
const SOURCE = join(SISIA, "apps/campus/src/data/buildings.ts");
const OUT = resolve(import.meta.dirname, "../src/asset/campus-building.json");

/* The campus box this repo plays inside — geo.ts CAMPUS_BOX, inlined so the
   script stays runnable without the TS loader. A footprint outside it belongs
   to the basic-ed campus, which sisia maps and this walk does not. */
const CAMPUS_BOX = { north: 14.6432, south: 14.6352, west: 121.0744, east: 121.081 };

/** Category default heights, only consulted to decide `is_height_measured`. */
const CATEGORY_DEFAULT = new Set([4.2, 8.4, 6, 10, 12, 3.5]);

function parseBuilding(text) {
  const start = text.indexOf("export const BUILDINGS");
  if (start < 0) throw new Error("BUILDINGS export not found in sisia buildings.ts");
  /* `export const BUILDINGS: CampusBuilding[] = [` — the first `[` belongs to
     the type annotation, so bound the array from the `=` instead. */
  const assign = text.indexOf("=", start);
  const open = text.indexOf("[", assign);
  const close = text.lastIndexOf("]");
  if (open < 0 || close < open) throw new Error("could not bound the BUILDINGS array");
  return JSON.parse(text.slice(open, close + 1));
}

function centroid(ring) {
  let lat = 0;
  let lon = 0;
  for (const [a, b] of ring) {
    lat += a;
    lon += b;
  }
  return { lat: lat / ring.length, lon: lon / ring.length };
}

function isOnCampus(ring) {
  const c = centroid(ring);
  return (
    c.lat >= CAMPUS_BOX.south &&
    c.lat <= CAMPUS_BOX.north &&
    c.lon >= CAMPUS_BOX.west &&
    c.lon <= CAMPUS_BOX.east
  );
}

/** Shoelace area in square metres, for dropping slivers and sorting by bulk. */
function areaM2(ring) {
  const c = centroid(ring);
  const lat_m = 110_540;
  const lon_m = 111_320 * Math.cos((c.lat * Math.PI) / 180);
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [alat, alon] = ring[j];
    const [blat, blon] = ring[i];
    sum += (alon * lon_m) * (blat * lat_m) - (blon * lon_m) * (alat * lat_m);
  }
  return Math.abs(sum / 2);
}

/**
 * Drop collinear-ish vertices. The curated rings carry 7-decimal OSM detail;
 * at the zoom this view draws, anything under ~0.4 m of sagitta is a vertex the
 * renderer pays for and the eye never sees.
 */
function simplify(ring, tolerance_m = 0.4) {
  if (ring.length <= 4) return ring;
  const c = centroid(ring);
  const lat_m = 110_540;
  const lon_m = 111_320 * Math.cos((c.lat * Math.PI) / 180);
  const xy = ring.map(([lat, lon]) => [(lon - c.lon) * lon_m, (lat - c.lat) * lat_m]);
  const keep = [0];
  for (let i = 1; i < xy.length - 1; i += 1) {
    const a = xy[keep[keep.length - 1]];
    const b = xy[i];
    const d = xy[i + 1];
    const cross = Math.abs((d[0] - a[0]) * (b[1] - a[1]) - (d[1] - a[1]) * (b[0] - a[0]));
    const base = Math.hypot(d[0] - a[0], d[1] - a[1]) || 1;
    if (cross / base > tolerance_m) keep.push(i);
  }
  keep.push(xy.length - 1);
  return keep.length >= 4 ? keep.map((i) => ring[i]) : ring;
}

const source_text = readFileSync(SOURCE, "utf8");
const all = parseBuilding(source_text);

/**
 * Categories that are GROUND, not volume.
 *
 * sisia maps a football pitch and a swimming pool as campus features, which is
 * right for a wayfinding map and wrong for a skyline: extruded, Moro Lorenzo's
 * 12,055 m² becomes a two-metre slab laid over the exact ground a walker is
 * most likely to be standing on, and the walker disappears under their own
 * pitch. A pitch has an outline and no height. It is already drawn — by the
 * sector layer, which measured its vegetation off satellite imagery — so
 * dropping it here loses nothing and stops one very large lie.
 */
const GROUND_CATEGORY = new Set(["sports"]);

const building = [];
for (const row of all) {
  if (!Array.isArray(row.footprint) || row.footprint.length < 4) continue;
  if (GROUND_CATEGORY.has(row.category)) continue;
  if (!isOnCampus(row.footprint)) continue;
  const area_m2 = areaM2(row.footprint);
  /* A skyline is made of the buildings you navigate by. Below about 200 m² a
     footprint is a guard house, a generator shed, a covered stair or a tracing
     artefact, and extruded at this camera it reads as a grey box dropped on a
     lawn — noise that makes the real buildings look less real. The threshold
     started at 40 m² and was raised after looking at the result: the small ones
     were not small buildings, they were litter. */
  if (area_m2 < 200) continue;
  const ring = simplify(row.footprint).map(([lat, lon]) => [
    Number(lat.toFixed(6)),
    Number(lon.toFixed(6)),
  ]);
  building.push({
    building_code: row.building_code ?? null,
    name: row.display_name ?? null,
    category: row.category,
    height_m: Number(row.height_m.toFixed(1)),
    is_height_measured: !CATEGORY_DEFAULT.has(row.height_m),
    area_m2: Math.round(area_m2),
    point: ring,
  });
}

/* Tallest last: the renderer paints in array order and a short building drawn
   after a tall one punches a hole in its wall. */
building.sort((a, b) => a.height_m - b.height_m || a.area_m2 - b.area_m2);

const out = {
  attribution:
    "Building footprints © OpenStreetMap contributors (ODbL) and Overture Maps, curated in sisia-app/apps/campus",
  source: "sisia-app/apps/campus/src/data/buildings.ts",
  imported_at: new Date().toISOString().slice(0, 10),
  building,
};

writeFileSync(OUT, `${JSON.stringify(out)}\n`);

const measured = building.filter((b) => b.is_height_measured).length;
const named = building.filter((b) => b.name).length;
console.log(
  `${building.length} buildings → ${OUT}\n` +
    `  height measured: ${measured} · category default: ${building.length - measured}\n` +
    `  named: ${named} · tallest: ${building[building.length - 1].height_m} m`,
);
