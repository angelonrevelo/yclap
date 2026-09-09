import { biome_sector } from "./sector.ts";
import type { Sighting } from "./journal.ts";
import type { SpawnPoolEntry } from "./spawn.ts";

/**
 * A journal worth showing on a stage — and one that says it is a demo.
 *
 * The problem it solves is the deck's own AV checklist: "journal pre-seeded so
 * the badge shelf is not empty on stage, **and *say* it is seeded**". An empty
 * badge shelf and an empty collection are a bad first sixty seconds; a full one
 * that a judge assumes is real data is worse.
 *
 * So every seeded row carries `sighting_id` prefixed `demo-`, which is what the
 * banner keys off. Nothing is hidden and nothing has to be remembered by a
 * nervous presenter at 9am.
 *
 * The seed is DETERMINISTIC — same pool, same curated list, same journal, every
 * time — so the shelf a rehearsal produces is the shelf the showcase produces.
 */

export const DEMO_PREFIX = "demo-";

/** True when this journal is the seeded one, so a surface can say so. */
export function isSeededJournal(row: Sighting[]): boolean {
  return row.length > 0 && row.every((s) => s.sighting_id.startsWith(DEMO_PREFIX));
}

/* Enough species to fill the shelf without inventing a heroic walk: a handful
   of curated ones so the nine-species grid is partly lit, and a spread of pool
   species across taxon groups so "Beyond the guide" groups more than one way.
   Chosen by rarity band rather than by name, so this survives a re-sweep. */
const CURATED_TO_SHOW = 4;
const WILD_PER_BAND = 2;

/**
 * A demo journal: located finds spread over several days and several sectors,
 * across a few taxon groups and rarity bands.
 *
 * `days_back` walks the entries backwards from `now`, one every few hours, so
 * the "BY DAY" strip has more than one bar and Return Visit can be earned by
 * the repeat that this deliberately includes.
 */
export function demoJournal(
  pool: SpawnPoolEntry[],
  curated: string[],
  now: Date = new Date(),
): Sighting[] {
  const row: Sighting[] = [];
  const sector = biome_sector;
  if (sector.length === 0) return row;

  const pick: { species_code: string }[] = [];
  for (const code of curated.slice(0, CURATED_TO_SHOW)) pick.push({ species_code: code });

  /* Two per band, so the collection shows a real spread rather than a wall of
     commons — and so the "Once on campus" line on the receipt is reachable. */
  const band: [number, number][] = [
    [50, Infinity], // common
    [10, 49], // uncommon
    [2, 9], // rare
    [1, 1], // mythic
  ];
  for (const [lo, hi] of band) {
    const of_band = pool
      .filter((e) => typeof e.count === "number" && e.count >= lo && e.count <= hi)
      .filter((e) => !curated.includes(e.species_code))
      /* Stable order so the demo does not reshuffle between rehearsal and stage. */
      .sort((a, b) => a.species_code.localeCompare(b.species_code));
    for (const e of of_band.slice(0, WILD_PER_BAND)) pick.push({ species_code: e.species_code });
  }

  /* One deliberate repeat, in a sector already walked but on an earlier day —
     this is what earns Return Visit, and a shelf with nothing in the
     "Contributing" group looks broken. */
  if (pick.length > 0) pick.push({ species_code: pick[0].species_code });

  const HOUR = 3_600_000;
  /**
   * ONE SECTOR SHORT of the next stage, deliberately.
   *
   * The first version of this seed spread finds across a different sector each
   * time, which walked 13 grounds and opened the app at "Fully grown". That
   * quietly destroyed the best beat in the demo: the beat sheet's 0:40 is the
   * character advancing a stage and the blind-box variant revealing, and you
   * cannot show progression from the top of it.
   *
   * `STAGE_AT` puts "tree" at 9 sectors, so the seed uses 8 — the live save on
   * stage crosses the threshold and the reveal fires in front of the room.
   * Found by rehearsing rather than by reading the code.
   */
  const SECTOR_USED = 8;
  pick.forEach((p, i) => {
    /* Spread backwards: roughly one find every ~20 hours, so several distinct
       days appear and the last one is recent. */
    const at = new Date(now.getTime() - (pick.length - i) * 20 * HOUR);
    const s = sector[(i * 3) % Math.min(SECTOR_USED, sector.length)];
    row.push({
      sighting_id: `${DEMO_PREFIX}${i}`,
      species_code: p.species_code,
      photo_data: null,
      created_at: at.toISOString(),
      inat_scientific_name: null,
      inat_common_name: null,
      lat: s.label_point[0],
      lon: s.label_point[1],
      accuracy_m: 8,
      fix_source: "demo",
      note: null,
      walk_id: null,
      entry_kind: "badge",
      reported_name: null,
      entry_index: i + 1,
    });
  });

  /* One contribution, because "report a tree the guide lacks" is a real half of
     the product and an all-badge journal hides it. */
  row.push({
    sighting_id: `${DEMO_PREFIX}report`,
    species_code: "unknown",
    photo_data: null,
    created_at: new Date(now.getTime() - 2 * HOUR).toISOString(),
    inat_scientific_name: null,
    inat_common_name: null,
    /* Reuses a sector already in the seed, so the contribution cannot be the
       thing that trips the stage before the demo does. */
    lat: sector[0].label_point[0],
    lon: sector[0].label_point[1],
    accuracy_m: 10,
    fix_source: "demo",
    note: "Big fig by the covered walk — not on the list.",
    walk_id: null,
    entry_kind: "contribution",
    reported_name: "a large fig",
    entry_index: row.length + 1,
  });

  return row;
}
