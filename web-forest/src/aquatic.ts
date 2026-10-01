/**
 * Underwater finds — what lives IN the campus pond, found from its edge.
 *
 * Gelo, 10-01: "they want to add … even underwater species". The spawn pool
 * already held them: guppies, goldfish, mollies, tilapia and the golden apple
 * snail are in the campus iNaturalist record (the 2026-09-03 sweep). But a
 * spawn is placed on walkable ground, so a guppy stood on a lawn. Now:
 *
 *   - aquatic species never spawn on land (`isAquatic`, filtered out of the
 *     land pool in `live.tsx`);
 *   - each spawn window puts POND_SPAWN_MAX of them INSIDE the pond's OSM
 *     outline, part-way from its edge to its middle, so they are within
 *     reach from the bank (the walker cannot step into water — `isWalkable`);
 *   - they are drawn under the water (`play-map.tsx`): a ripple and a shadow,
 *     not a sticker on a stalk.
 *
 * Frogs and slugs are not here: they live at the edge and on land, and keep
 * spawning there. Deterministic per window, like every spawn.
 */
import campus_network from "./asset/campus-network.json" with { type: "json" };
import type { LatLon } from "./geo.ts";
import { rarityFor, spawnWindow, type Spawn, type SpawnPoolEntry } from "./spawn.ts";

/** Swims or sits under water its whole life. */
const AQUATIC_ARCHETYPE = new Set(["fish"]);
const AQUATIC_SPECIES = new Set(["pomacea-canaliculata"]);

export function isAquatic(entry: Pick<SpawnPoolEntry, "archetype" | "species_code">): boolean {
  return AQUATIC_ARCHETYPE.has(entry.archetype) || AQUATIC_SPECIES.has(entry.species_code);
}

export const POND_SPAWN_MAX = 2;
/** How far from the edge toward the middle a pond find sits: 0 the bank, 1 the centre. */
const INSET = 0.45;

export const POND_RING: LatLon[] = (campus_network as unknown as { water: { water_kind: string; point: [number, number][] }[] }).water
  .filter((w) => w.water_kind === "pond")
  .flatMap((w) => w.point.map(([lat, lon]) => ({ lat, lon })));

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h;
}

/** The pond's finds for the window holding `now_ms` — the same on every phone. */
export function pondSpawn(pool: SpawnPoolEntry[], now_ms: number, ring: LatLon[] = POND_RING): Spawn[] {
  const aquatic = pool.filter(isAquatic).sort((a, b) => a.species_code.localeCompare(b.species_code));
  if (!aquatic.length || ring.length < 3) return [];
  const window = spawnWindow(now_ms);
  const centre = {
    lat: ring.reduce((s, p) => s + p.lat, 0) / ring.length,
    lon: ring.reduce((s, p) => s + p.lon, 0) / ring.length,
  };
  /* Weighted by how often each is recorded: guppies are common, an angelfish is not. */
  const weight = aquatic.map((e) => Math.max(1, e.count ?? 1));
  const total = weight.reduce((a, b) => a + b, 0);
  const out: Spawn[] = [];
  const used = new Set<string>();
  for (let k = 0; k < POND_SPAWN_MAX * 4 && out.length < Math.min(POND_SPAWN_MAX, aquatic.length); k += 1) {
    let roll = hash(`pond:${window.index}:${k}`) % total;
    let pick = 0;
    while (roll >= weight[pick]) roll -= weight[pick++];
    const entry = aquatic[pick];
    if (used.has(entry.species_code)) continue;
    used.add(entry.species_code);
    const edge = ring[hash(`pond-at:${window.index}:${k}`) % ring.length];
    out.push({
      spawn_id: `pond-${window.index}-${entry.species_code}`,
      species_code: entry.species_code,
      common_name: entry.common_name,
      scientific_name: entry.scientific_name,
      lat: edge.lat + (centre.lat - edge.lat) * INSET,
      lon: edge.lon + (centre.lon - edge.lon) * INSET,
      sector_code: "pond",
      rarity: rarityFor(entry.count),
      iconic_taxon_name: entry.iconic_taxon_name,
      archetype: entry.archetype,
      starts_at: window.starts_at,
      ends_at: window.ends_at,
      is_underwater: true,
    });
  }
  return out;
}
