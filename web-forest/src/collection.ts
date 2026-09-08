import { rarityFor, type Rarity, type SpawnPoolEntry } from "./spawn.ts";
import { isBadge, type Sighting } from "./journal.ts";
import { displayName, kindOf, type Kind } from "./kind.ts";

/**
 * The collection, over the whole campus and not just the curated nine.
 *
 * The gap this closes: the journal grid renders `journal_order`, which is nine
 * species with drawn artwork. Walking to a find in the world can log any of
 * **1,098**, and every one of those landed in the journal as a row in the log
 * and a bare "+N more from the campus sweep" beside the fraction. A collection
 * game whose collection you cannot look at is not a collection game.
 *
 * So this is the second half of the shelf: everything you have found that the
 * guide never drew, grouped by what kind of living thing it is, carrying the
 * rarity it was found at and when you first found it.
 *
 * Two rules it does NOT break:
 *
 *   The denominator stays honest. `species_total` on the journal summary is
 *   still the curated nine, because that is the list a student can go and
 *   deliberately find. This surface reports its own, separate denominator —
 *   the size of the pool — and never folds the two together.
 *
 *   Nothing is ranked. There is no completion percentage against other
 *   players, no score, and no field here from which one could be built.
 */

export interface WildFind {
  species_code: string;
  common_name: string;
  scientific_name: string;
  kind: Kind;
  rarity: Rarity;
  /** Real iNaturalist campus observation count — what the rarity derives from. */
  campus_count: number;
  /** ISO instant this species was FIRST logged. A collection is a history. */
  first_at: string;
  /** How many times it has been logged. Never summed into a score. */
  times: number;
}

export interface WildGroup {
  kind: Kind;
  row: WildFind[];
}

export interface WildCollection {
  group: WildGroup[];
  /** Distinct off-guide species found. */
  found_count: number;
  /** How many the sweep knows about at all — this surface's own denominator. */
  pool_total: number;
  /** Rarest band actually reached, for the one line worth leading with. */
  best: Rarity | null;
}

/* Rarest first within a group, then oldest find first — a collection reads as
   a history, and the thing you are proudest of should not sink because you
   found it on a Tuesday. */
const RANK: Record<Rarity, number> = { mythic: 0, rare: 1, uncommon: 2, common: 3 };

const KIND_ORDER: Kind[] = [
  "tree", "plant", "fungus", "bracket", "bird", "butterfly", "insect",
  "spider", "reptile", "amphibian", "fish", "mollusc", "mammal", "other",
];

/**
 * Everything logged that is not on the curated list, grouped by kind.
 *
 * `curated` is passed in rather than imported so a test can pin the boundary
 * without depending on whatever the guide's nine happen to be this week.
 */
export function wildCollection(
  row: Sighting[],
  pool: SpawnPoolEntry[],
  curated: Iterable<string>,
): WildCollection {
  const is_curated = new Set(curated);
  const by_code = new Map(pool.map((e) => [e.species_code, e]));

  /* A find only enters the collection if the sweep knows the species. An
     entry_kind of "contribution" is a REPORT of something the guide lacks —
     it has a reported_name, not a verified species — so it is deliberately
     not collectable. Letting it in would mean a student could fill a shelf by
     typing. */
  const seen = new Map<string, { first_at: string; times: number }>();
  for (const s of row) {
    if (!isBadge(s)) continue;
    if (is_curated.has(s.species_code)) continue;
    if (!by_code.has(s.species_code)) continue;
    const prior = seen.get(s.species_code);
    if (!prior) {
      seen.set(s.species_code, { first_at: s.created_at, times: 1 });
    } else {
      seen.set(s.species_code, {
        first_at: s.created_at < prior.first_at ? s.created_at : prior.first_at,
        times: prior.times + 1,
      });
    }
  }

  const find: WildFind[] = [];
  for (const [species_code, met] of seen) {
    const entry = by_code.get(species_code);
    if (!entry) continue;
    find.push({
      species_code,
      common_name: displayName(entry.common_name),
      scientific_name: entry.scientific_name,
      kind: kindOf(entry.iconic_taxon_name, entry.archetype),
      rarity: rarityFor(entry.count),
      campus_count: entry.count,
      first_at: met.first_at,
      times: met.times,
    });
  }

  const group: WildGroup[] = [];
  for (const kind of KIND_ORDER) {
    const of_kind = find
      .filter((f) => f.kind === kind)
      .sort((a, b) => RANK[a.rarity] - RANK[b.rarity] || a.first_at.localeCompare(b.first_at));
    if (of_kind.length > 0) group.push({ kind, row: of_kind });
  }

  let best: Rarity | null = null;
  for (const f of find) {
    if (best === null || RANK[f.rarity] < RANK[best]) best = f.rarity;
  }

  return { group, found_count: find.length, pool_total: pool.length, best };
}


export interface ReceiptSpecies {
  species_code: string;
  /** Curated name where the guide has one, else the sweep's, else the code. */
  name: string;
  rarity: Rarity | null;
  campus_count: number | null;
}

export interface ReceiptHighlight {
  row: ReceiptSpecies[];
  /** Rarest band the walk actually produced, or null. The line worth leading with. */
  best: Rarity | null;
}

/**
 * The species a walk was the first sighting of, resolved for the receipt.
 *
 * Two things the receipt could not do before the world existed:
 *
 *   It printed `species[code]?.common_name ?? code`, so a find outside the
 *   curated nine came out as a raw slug — "crossandra-infundibuliformis"
 *   rather than "Firecracker-flower". A receipt is the last thing a walker
 *   reads, and reading a slug there says the app does not know what they just
 *   found.
 *
 *   It said nothing about rarity. Walking into a species recorded once on this
 *   campus and being told only "1 species" is the payoff moment landing flat.
 *
 * `curated_name` is passed in rather than imported so this stays a pure
 * function the test runner can load.
 */
export function receiptHighlight(
  new_species_code: string[],
  pool: SpawnPoolEntry[],
  curated_name: ReadonlyMap<string, string>,
): ReceiptHighlight {
  const by_code = new Map(pool.map((e) => [e.species_code, e]));
  const row: ReceiptSpecies[] = new_species_code.map((species_code) => {
    const entry = by_code.get(species_code);
    return {
      species_code,
      name:
        curated_name.get(species_code) ??
        (entry ? displayName(entry.common_name) : species_code),
      rarity: entry ? rarityFor(entry.count) : null,
      campus_count: entry ? entry.count : null,
    };
  });

  let best: Rarity | null = null;
  for (const r of row) {
    if (r.rarity === null) continue;
    if (best === null || RANK[r.rarity] < RANK[best]) best = r.rarity;
  }
  return { row, best };
}
