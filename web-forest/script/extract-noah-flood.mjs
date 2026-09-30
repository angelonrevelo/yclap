/**
 * Clip UP NOAH's published 100-year flood hazard map for Metro Manila down to
 * CAMPUS_BOX and commit the result as `src/asset/campus-flood.json`.
 *
 * Why this source: Gelo's 09-30 note (`3:58`–`4:46`) — the judges asked for
 * "hazards, DRR". A hazard zone we drew ourselves would be invented data on a
 * safety question, so the only flood layer the app shows is the one UP NOAH
 * (UP Resilience Institute) publishes as open data: the "Downloads" button on
 * noah.up.edu.ph links a public Google Drive folder, Flood › 100yr ›
 * "Metro Manila.zip", an ESRI shapefile under ODC-ODbL (metadata_flood.txt,
 * "Use Constraints"). NOT the web map's Mapbox tiles: that token is locked to
 * noah.up.edu.ph and we do not route round a lock.
 *
 * `Var` is NOAH's class — 1 low (0–0.5 m), 2 medium (0.5–1.5 m), 3 high
 * (>1.5 m), for a 100-year rain return. It is a model, not an observed flood,
 * and not the university's own assessment.
 *
 * The zip is 25 MB and not committed. Fetch it, unzip, and point this at the
 * .shp (the .dbf beside it holds the Var of each record):
 *
 *   curl -L -o mm.zip "https://drive.usercontent.google.com/download?id=1n-IrwfWqLRDyDg-wmt68luk_DU5Xzg9S&export=download&confirm=t"
 *   unzip mm.zip -d mm && node script/extract-noah-flood.mjs mm/MetroManila_Flood_100year.shp
 */
import { readFileSync, writeFileSync } from "node:fs";

/* Same as CAMPUS_BOX in src/geo.ts. */
const BOX = { south: 14.633, west: 121.074, north: 14.6455, east: 121.084 };

const shp_path = process.argv[2];
if (!shp_path) throw new Error("usage: node script/extract-noah-flood.mjs <path/to/MetroManila_Flood_100year.shp>");
const shp = readFileSync(shp_path);
const dbf = readFileSync(shp_path.replace(/\.shp$/i, ".dbf"));

/* dBASE: header, field descriptors, then fixed-width records. Only `Var` is read. */
function readDbf(buf) {
  const record_count = buf.readUInt32LE(4);
  const header_len = buf.readUInt16LE(8);
  const record_len = buf.readUInt16LE(10);
  const field = [];
  for (let o = 32; buf[o] !== 0x0d; o += 32) {
    field.push({ name: buf.toString("latin1", o, o + 11).replace(/\0.*$/, ""), len: buf[o + 16] });
  }
  const row = [];
  for (let r = 0; r < record_count; r += 1) {
    let o = header_len + r * record_len + 1;
    const value = {};
    for (const f of field) {
      value[f.name] = buf.toString("latin1", o, o + f.len).trim();
      o += f.len;
    }
    row.push(value);
  }
  return row;
}

/** Sutherland–Hodgman against the box. Each ring is clipped alone; the even-odd rule the app uses keeps holes holes. */
function clipRing(ring) {
  const edge = [
    (p) => p[0] >= BOX.west, (p) => p[0] <= BOX.east, (p) => p[1] >= BOX.south, (p) => p[1] <= BOX.north,
  ];
  const cut = [
    (a, b) => { const t = (BOX.west - a[0]) / (b[0] - a[0]); return [BOX.west, a[1] + t * (b[1] - a[1])]; },
    (a, b) => { const t = (BOX.east - a[0]) / (b[0] - a[0]); return [BOX.east, a[1] + t * (b[1] - a[1])]; },
    (a, b) => { const t = (BOX.south - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), BOX.south]; },
    (a, b) => { const t = (BOX.north - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), BOX.north]; },
  ];
  let out = ring;
  for (let e = 0; e < 4 && out.length > 0; e += 1) {
    const input = out;
    out = [];
    for (let i = 0; i < input.length; i += 1) {
      const cur = input[i];
      const prev = input[(i + input.length - 1) % input.length];
      const in_cur = edge[e](cur);
      const in_prev = edge[e](prev);
      if (in_cur) {
        if (!in_prev) out.push(cut[e](prev, cur));
        out.push(cur);
      } else if (in_prev) out.push(cut[e](prev, cur));
    }
  }
  return out;
}

const LAT_M = 110_540;
const LON_M = 111_320 * Math.cos((((BOX.north + BOX.south) / 2) * Math.PI) / 180);
function areaM2(ring) {
  let a = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const p = ring[i];
    const q = ring[(i + 1) % ring.length];
    a += p[0] * LON_M * q[1] * LAT_M - q[0] * LON_M * p[1] * LAT_M;
  }
  return Math.abs(a / 2);
}

const attribute = readDbf(dbf);
const zone = [];
let offset = 100;
let record = 0;
while (offset < shp.length) {
  const content_len = shp.readInt32BE(offset + 4) * 2;
  const body = offset + 8;
  const type = shp.readInt32LE(body);
  if (type === 5) {
    const xmin = shp.readDoubleLE(body + 4), ymin = shp.readDoubleLE(body + 12);
    const xmax = shp.readDoubleLE(body + 20), ymax = shp.readDoubleLE(body + 28);
    const hit = !(xmax < BOX.west || xmin > BOX.east || ymax < BOX.south || ymin > BOX.north);
    if (hit) {
      const part_count = shp.readInt32LE(body + 36);
      const point_count = shp.readInt32LE(body + 40);
      const part = [];
      for (let k = 0; k < part_count; k += 1) part.push(shp.readInt32LE(body + 44 + k * 4));
      const pt = body + 44 + part_count * 4;
      const ring = [];
      let area = 0;
      for (let k = 0; k < part_count; k += 1) {
        const a = part[k];
        const b = k + 1 < part_count ? part[k + 1] : point_count;
        let rxmin = Infinity, rxmax = -Infinity, rymin = Infinity, rymax = -Infinity;
        for (let i = a; i < b; i += 1) {
          const x = shp.readDoubleLE(pt + i * 16);
          const y = shp.readDoubleLE(pt + i * 16 + 8);
          if (x < rxmin) rxmin = x; if (x > rxmax) rxmax = x;
          if (y < rymin) rymin = y; if (y > rymax) rymax = y;
        }
        if (rxmax < BOX.west || rxmin > BOX.east || rymax < BOX.south || rymin > BOX.north) continue;
        const full = [];
        for (let i = a; i < b - 1; i += 1) full.push([shp.readDoubleLE(pt + i * 16), shp.readDoubleLE(pt + i * 16 + 8)]);
        const clipped = clipRing(full);
        if (clipped.length < 3) continue;
        const m2 = areaM2(clipped);
        /* Slivers under one routing cell (4 m × 4 m) are noise at this scale. */
        if (m2 < 16) continue;
        area += m2;
        ring.push(clipped.map(([x, y]) => [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6]));
      }
      const hazard = Number(attribute[record]?.Var);
      if (ring.length > 0) zone.push({ hazard, ring, ring_area_m2: Math.round(area) });
    }
  }
  offset = body + content_len;
  record += 1;
}
zone.sort((a, b) => a.hazard - b.hazard);

const out = {
  _comment: "UP NOAH 100-year rain-return flood hazard, Metro Manila, clipped to CAMPUS_BOX — exactly the published polygons, nothing drawn by us. A model, not an observed flood, and NOT the university's own hazard assessment. `hazard` is NOAH's Var: 1 low (0–0.5 m), 2 medium (>0.5–1.5 m), 3 high (>1.5 m). Rings are [lon, lat]; a point is in a zone by the even-odd rule over all its rings (holes included). `ring_area_m2` is summed per ring and is not a net area. Regenerate with script/extract-noah-flood.mjs.",
  source: "UP NOAH (UP Resilience Institute) — Flood Hazard Maps, 100-year, \"Metro Manila.zip\" from the public Downloads folder linked on noah.up.edu.ph",
  source_url: "https://drive.google.com/drive/folders/1ALE4-E9c-4AGjm1fqiPprWHrLUskeY9o",
  licence: "ODC-ODbL — UP NOAH",
  shapefile_date: "2022-11-28",
  fetched_on: new Date().toISOString().slice(0, 10),
  box: BOX,
  class: { 1: "low (0–0.5 m)", 2: "medium (>0.5–1.5 m)", 3: "high (>1.5 m)" },
  zone,
};
writeFileSync(new URL("../src/asset/campus-flood.json", import.meta.url), JSON.stringify(out) + "\n");
process.stderr.write(`✓ ${zone.length} zones: ${zone.map((z) => `Var ${z.hazard} ${z.ring.length} rings ${z.ring_area_m2} m²`).join("; ")}\n`);
