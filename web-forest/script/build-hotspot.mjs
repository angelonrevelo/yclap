/**
 * Biodiversity hotspots — per-sector iNaturalist observation density and
 * species richness, next to the sector's measured vegetation, committed as
 * `src/asset/campus-hotspot.json`.
 *
 * Gelo's 09-30 note (`3:58`–`4:46`): the judges would use the 3D map to show
 * "areas with biodiversity". The repo already holds the sectors (OSM faces)
 * and their measured vegetation; what it did not hold is WHERE on campus the
 * 13,985 iNat observations in the box sit — `species-model.json` only has a
 * campus-wide count per species. This pulls their positions once, drops every
 * record whose position cannot be trusted at sector scale, and keeps only the
 * per-sector totals. No observation is redistributed, only counted.
 *
 * Kept, and why:
 *   - geoprivacy open AND taxon_geoprivacy open — an obscured record's point is
 *     randomised inside a ~20 km cell, so it would land in a random sector;
 *   - positional accuracy ≤ 50 m or unrecorded — sectors are 700–40,000 m², a
 *     250 m circle says nothing about which one; unrecorded is kept because
 *     most phone uploads leave it blank (the count of those is reported);
 *   - any quality grade — casual records are still somebody seeing something
 *     there; richness counts only taxa identified to species or below.
 *
 * What the numbers are NOT: a survey. iNat density follows where people walk
 * and look — a busy path beside a lawn out-scores a quiet grove. The layer
 * says so on screen.
 *
 *   node script/build-hotspot.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const BOX = { nelat: 14.6455, nelng: 121.084, swlat: 14.633, swlng: 121.074 };
const ACCURACY_MAX_M = 50;
const PER_PAGE = 200;
const SPECIES_RANK = new Set(["species", "hybrid", "subspecies", "variety", "form", "infrahybrid"]);

const CACHE = new URL("./data/inat-observation/", import.meta.url);
if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries = 5) {
  for (let i = 1; i <= tries; i += 1) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "yclap-web-forest/1.0 (campus hotspot layer; contact@advo.ph)" },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      process.stderr.write(`  attempt ${i}: ${err.message}\n`);
      if (i === tries) throw err;
      await sleep(3000 * i);
    }
  }
  throw new Error("unreachable");
}

/* id_above paging, oldest id first — stable while new uploads land. */
async function pullAll() {
  const file = new URL("observation.json", CACHE);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const base =
    "https://api.inaturalist.org/v2/observations" +
    `?swlat=${BOX.swlat}&swlng=${BOX.swlng}&nelat=${BOX.nelat}&nelng=${BOX.nelng}` +
    `&geoprivacy=open&taxon_geoprivacy=open&order_by=id&order=asc&per_page=${PER_PAGE}` +
    "&fields=id,location,positional_accuracy,quality_grade,taxon.id,taxon.rank";
  const total_box = (await get(
    `https://api.inaturalist.org/v1/observations?swlat=${BOX.swlat}&swlng=${BOX.swlng}&nelat=${BOX.nelat}&nelng=${BOX.nelng}&per_page=0`,
  )).total_results;
  const row = [];
  let id_above = 0;
  for (;;) {
    const body = await get(`${base}&id_above=${id_above}`);
    row.push(...body.results);
    process.stderr.write(`  ${row.length} / ${body.total_results}\n`);
    if (body.results.length < PER_PAGE) break;
    id_above = body.results[body.results.length - 1].id;
    await sleep(1100);
  }
  const out = { fetched_at: new Date().toISOString(), total_box, row };
  writeFileSync(file, JSON.stringify(out));
  return out;
}

function ringContains(ring, lat, lon) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [lat_i, lon_i] = ring[i];
    const [lat_j, lon_j] = ring[j];
    if (lat_i > lat !== lat_j > lat && lon < ((lon_j - lon_i) * (lat - lat_i)) / (lat_j - lat_i) + lon_i) inside = !inside;
  }
  return inside;
}

const pulled = await pullAll();
const sector_file = JSON.parse(readFileSync(new URL("../src/asset/campus-sector.json", import.meta.url), "utf8"));
const tally = new Map(sector_file.sector.map((s) => [s.sector_code, { observation: 0, taxon: new Set() }]));

let dropped_accuracy = 0;
let unrecorded_accuracy = 0;
let outside_sector = 0;
let kept = 0;
for (const o of pulled.row) {
  if (!o.location) continue;
  const acc = o.positional_accuracy;
  if (typeof acc === "number" && acc > ACCURACY_MAX_M) { dropped_accuracy += 1; continue; }
  if (typeof acc !== "number") unrecorded_accuracy += 1;
  const [lat, lon] = o.location.split(",").map(Number);
  const hit = sector_file.sector.find((s) => ringContains(s.point, lat, lon));
  if (!hit) { outside_sector += 1; continue; }
  kept += 1;
  const t = tally.get(hit.sector_code);
  t.observation += 1;
  if (o.taxon && SPECIES_RANK.has(o.taxon.rank)) t.taxon.add(o.taxon.id);
}

const sector = sector_file.sector.map((s) => {
  const t = tally.get(s.sector_code);
  const ha = s.area_m2 / 10_000;
  return {
    sector_code: s.sector_code,
    observation_count: t.observation,
    species_count: t.taxon.size,
    observation_per_ha: Math.round((t.observation / ha) * 10) / 10,
    vegetation_ratio: s.vegetation_ratio,
  };
});

/* A hotspot is a sector in the top fifth by species richness among sectors
   with at least 10 observations — a two-record sector is not a pattern. */
const eligible = sector.filter((s) => s.observation_count >= 10).map((s) => s.species_count).sort((a, b) => b - a);
const cut = eligible.length ? eligible[Math.max(0, Math.ceil(eligible.length / 5) - 1)] : Infinity;
for (const s of sector) s.is_hotspot = s.observation_count >= 10 && s.species_count >= cut;

const out = {
  _comment: "Per-sector iNaturalist observation density and species richness, beside the sector's measured vegetation_ratio (copied from campus-sector.json). Counts only — no observation is redistributed. A sector is a hotspot when it has >= 10 kept observations and its species_count is in the top fifth of such sectors. iNat density follows where people walk and look; this is not a survey. Regenerate with script/build-hotspot.mjs.",
  source: "iNaturalist observations API v2, CAMPUS_BOX, geoprivacy=open & taxon_geoprivacy=open",
  attribution: "Observations © iNaturalist users (counts only)",
  fetched_on: pulled.fetched_at.slice(0, 10),
  method: {
    observation_in_box: pulled.total_box,
    observation_open_location: pulled.row.length,
    dropped_accuracy_over_50_m: dropped_accuracy,
    kept_unrecorded_accuracy: unrecorded_accuracy,
    outside_every_sector: outside_sector,
    kept_in_sector: kept,
    accuracy_max_m: ACCURACY_MAX_M,
    richness_rank: [...SPECIES_RANK],
    hotspot_min_observation: 10,
    hotspot_species_cut: cut,
  },
  sector,
};
writeFileSync(new URL("../src/asset/campus-hotspot.json", import.meta.url), JSON.stringify(out, null, 1) + "\n");
process.stderr.write(`✓ kept ${kept} of ${pulled.row.length} open (box total ${pulled.total_box}); ${sector.filter((s) => s.is_hotspot).length} hotspots, cut ${cut} species\n`);
