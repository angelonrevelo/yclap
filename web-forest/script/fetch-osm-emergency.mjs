/**
 * Pull every OpenStreetMap feature over CAMPUS_BOX that a person in trouble
 * would look for — assembly points, first aid, defibrillators, extinguishers,
 * hydrants, clinics, hospitals, doctors, pharmacies, fire and police stations —
 * and commit the extract as `src/asset/campus-emergency.json`.
 *
 * Why OSM and nothing else: Gelo's 09-30 note (`3:58`–`4:46`) has the judges
 * asking for "hazards, DRR … emergency areas in school". An evacuation point
 * we drew ourselves is worse than none — a phone that sends a crowd to the
 * wrong field in an earthquake is a safety failure, not a UX bug. So this
 * layer holds ONLY what the public OSM database says, each feature carrying
 * its OSM id, source and fetch date, and the app says "Not the official
 * Ateneo emergency plan" over all of it until the university's DRRM office /
 * CFMO hands us theirs. If OSM has nothing of a kind on campus, the file says
 * zero and the layer says so — it is never topped up.
 *
 * `out center tags` so a mapped building (a clinic drawn as a footprint) comes
 * back as one point. The raw reply is cached under `.osm-cache/` (gitignored);
 * delete it to refetch.
 *
 *   node script/fetch-osm-emergency.mjs
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

/* Same as CAMPUS_BOX in src/geo.ts. */
const BOX = { south: 14.633, west: 121.074, north: 14.6455, east: 121.084 };
const bbox = `${BOX.south},${BOX.west},${BOX.north},${BOX.east}`;

/* One small nwr query per tag family: the combined union 504s on every public
   endpoint (tried 10-01), the way one regex query did for fetch-osm-way.mjs. */
const CHUNK = {
  emergency: `nwr["emergency"](${bbox});`,
  amenity: `nwr["amenity"~"^(clinic|hospital|doctors|dentist|pharmacy|fire_station|police)$"](${bbox});`,
  healthcare: `nwr["healthcare"](${bbox});`,
  access: `nwr["highway"="emergency_access_point"](${bbox});`,
};
const QUERY = Object.values(CHUNK).join(" ");

const ENDPOINT = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://overpass.osm.jp/api/interpreter",
];

const CACHE = new URL("../.osm-cache/", import.meta.url);
if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pullChunk(name, body) {
  const file = new URL(`emergency-${name}.json`, CACHE);
  if (existsSync(file)) return JSON.parse(readFileSync(file, "utf8"));
  const query = `[out:json][timeout:90];(${body});out center tags;`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    for (const url of ENDPOINT) {
      try {
        const res = await fetch(url, {
          method: "POST",
          body: "data=" + encodeURIComponent(query),
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "yclap-web-forest/1.0 (campus emergency layer; contact@advo.ph)",
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(100_000),
        });
        if (!res.ok) { process.stderr.write(`  ${name} ${new URL(url).host} HTTP ${res.status}
`); await sleep(2000); continue; }
        const payload = await res.json();
        const reply = { fetched_at: new Date().toISOString(), endpoint: new URL(url).host, osm_base: payload.osm3s?.timestamp_osm_base ?? null, element: payload.elements };
        writeFileSync(file, JSON.stringify(reply));
        process.stderr.write(`✓ ${name}: ${reply.element.length} from ${reply.endpoint}
`);
        return reply;
      } catch (e) { process.stderr.write(`  ${name} ${new URL(url).host} ${e.message}
`); await sleep(2000); }
    }
    await sleep(5000 * (attempt + 1));
  }
  throw new Error(`${name}: every Overpass endpoint failed`);
}

async function pull() {
  const element = new Map();
  let fetched_at = "";
  let osm_base = null;
  const endpoint = new Set();
  for (const [name, body] of Object.entries(CHUNK)) {
    const reply = await pullChunk(name, body);
    for (const e of reply.element) element.set(`${e.type}/${e.id}`, e);
    if (reply.fetched_at > fetched_at) fetched_at = reply.fetched_at;
    if (reply.osm_base && (!osm_base || reply.osm_base > osm_base)) osm_base = reply.osm_base;
    endpoint.add(reply.endpoint);
    await sleep(1200);
  }
  return { fetched_at, osm_base, endpoint: [...endpoint].join(", "), element: [...element.values()] };
}

/** Our kind for a feature — the tag that put it in the query, most specific first. */
function kindOf(tag) {
  if (tag.emergency) return tag.emergency;
  if (tag.highway === "emergency_access_point") return "emergency_access_point";
  if (tag.amenity) return tag.amenity;
  if (tag.healthcare) return tag.healthcare;
  return "other";
}

const reply = await pull();
const date = reply.fetched_at.slice(0, 10);
const feature = [];
for (const e of reply.element) {
  const lat = e.lat ?? e.center?.lat;
  const lon = e.lon ?? e.center?.lon;
  if (typeof lat !== "number" || typeof lon !== "number") continue;
  const tag = e.tags ?? {};
  feature.push({
    osm_id: `${e.type}/${e.id}`,
    kind: kindOf(tag),
    name: tag.name ?? null,
    lat: Math.round(lat * 1e7) / 1e7,
    lon: Math.round(lon * 1e7) / 1e7,
    tag,
    source: "OpenStreetMap",
    source_url: `https://www.openstreetmap.org/${e.type}/${e.id}`,
    fetched_on: date,
  });
}
feature.sort((a, b) => a.kind.localeCompare(b.kind) || a.osm_id.localeCompare(b.osm_id));

const count = {};
for (const f of feature) count[f.kind] = (count[f.kind] ?? 0) + 1;

writeFileSync(new URL("../src/asset/campus-emergency.json", import.meta.url), JSON.stringify({
  _comment: "Every OSM feature over CAMPUS_BOX tagged emergency=*, amenity=clinic|hospital|doctors|dentist|pharmacy|fire_station|police, healthcare=* or highway=emergency_access_point — exactly what the public database holds, nothing added. Community mapping, NOT the official Ateneo emergency plan: no assembly point, hazard zone or evacuation route here was drawn by us. Regenerate with script/fetch-osm-emergency.mjs.",
  source: "OpenStreetMap via the Overpass API",
  licence: "ODbL — © OpenStreetMap contributors",
  fetched_on: date,
  osm_base: reply.osm_base,
  endpoint: reply.endpoint,
  box: BOX,
  query: QUERY,
  count,
  feature,
}, null, 1) + "\n");
process.stderr.write(`✓ ${feature.length} features on ${date}: ${JSON.stringify(count)}\n`);
