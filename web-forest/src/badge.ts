import {
  isBadge,
  isContribution,
  seenSector,
  type Sighting,
} from "./journal.ts";
import { biome_sector, sectorAt } from "./sector.ts";

/* ── the badge system ────────────────────────────────────────────────────────
 *
 * Badges are the "gamified citizen science" half of the owner's 09-08 ask:
 * every badge is earned by doing the thing the app is FOR — photographing a
 * species, walking a new ground, reporting something the guide lacks, being
 * out at dawn. Nothing is purchasable, nothing is random, nothing expires,
 * and no badge compares you to another player. The one "multiplayer" badge
 * counts YOUR shared finds, never anyone else's.
 *
 * Every rule is a pure function of the journal (plus, for rarity badges, the
 * species' real iNat campus count), and returns the timestamp of the sighting
 * that COMPLETED it — so a badge always has a true "earned at" the student
 * can point at.
 */

export interface BadgeContext {
  /** species_code → real iNaturalist campus observation count. Optional:
   *  without it the rarity badge simply waits for data. */
  pool_count?: ReadonlyMap<string, number | null>;
  /** How many biome sectors exist — the "whole campus" denominator. */
  sector_total: number;
}

export interface BadgeDef {
  id: string;
  name: string;
  blurb: string;
  /** Grouping for the shelf. */
  group: "find" | "explore" | "time" | "science";
  /** ISO instant of the sighting that completed the badge, or null. */
  check: (row: Sighting[], ctx: BadgeContext) => string | null;
}

/** The sector a sighting sits in, or null when it was never located.
 *  Same guard as `seenSector` — an unlocated find belongs to no ground. */
function sectorCodeOf(s: Sighting): string | null {
  if (s.lat === null || s.lon === null) return null;
  return sectorAt({ lat: s.lat, lon: s.lon })?.sector_code ?? null;
}

/** Campus-local hour (UTC+8, no DST — the campus does not move). */
export function campusHour(created_at: string): number {
  return Math.floor((new Date(created_at).getTime() + 8 * 3_600_000) / 3_600_000) % 24;
}

/** The first timestamp among rows matching a predicate. */
function firstAt(row: Sighting[], match: (s: Sighting) => boolean): string | null {
  const hit = row.filter(match).sort((a, b) => a.created_at.localeCompare(b.created_at));
  return hit[0]?.created_at ?? null;
}

/** Nth distinct value of a key function, timestamped by when the Nth arrived. */
function nthDistinct(
  row: Sighting[],
  key: (s: Sighting) => string | null,
  n: number,
): string | null {
  const seen = new Set<string>();
  const ordered = [...row].sort((a, b) => a.created_at.localeCompare(b.created_at));
  for (const s of ordered) {
    const k = key(s);
    if (!k) continue;
    seen.add(k);
    if (seen.size >= n) return s.created_at;
  }
  return null;
}

export const BADGE_LIST: BadgeDef[] = [
  {
    id: "first-find",
    name: "First Find",
    blurb: "Photograph your first species on the guide.",
    group: "find",
    check: (row) => firstAt(row, isBadge),
  },
  {
    id: "first-report",
    name: "Field Reporter",
    blurb: "Report a tree the guide does not have — the count and location AIS is missing.",
    group: "science",
    check: (row) => firstAt(row, isContribution),
  },
  {
    id: "count-and-location",
    name: "Count and Location",
    blurb: "Log a find with a GPS position. That pair is exactly what the campus inventory lacks.",
    group: "science",
    check: (row) => firstAt(row, (s) => isBadge(s) && s.lat !== null && s.lon !== null),
  },
  {
    id: "five-species",
    name: "Five Species",
    blurb: "Five distinct species photographed.",
    group: "find",
    check: (row) => nthDistinct(row.filter(isBadge), (s) => s.species_code, 5),
  },
  {
    id: "fifteen-species",
    name: "Fifteen Species",
    blurb: "Fifteen distinct species photographed.",
    group: "find",
    check: (row) => nthDistinct(row.filter(isBadge), (s) => s.species_code, 15),
  },
  {
    id: "three-grounds",
    name: "Three Grounds",
    blurb: "Log a find in three different sectors.",
    group: "explore",
    check: (row) => nthDistinct(row.filter(isBadge), sectorCodeOf, 3),
  },
  {
    id: "ten-grounds",
    name: "Ten Grounds",
    blurb: "Log a find in ten different sectors.",
    group: "explore",
    check: (row) => nthDistinct(row.filter(isBadge), sectorCodeOf, 10),
  },
  {
    id: "whole-campus",
    name: "The Whole Campus",
    blurb: "A located find in every walkable sector. The long walk.",
    group: "explore",
    check: (row, ctx) =>
      seenSector(row).size >= ctx.sector_total
        ? ([...row].sort((a, b) => a.created_at.localeCompare(b.created_at)).at(-1)?.created_at ?? null)
        : null,
  },
  {
    id: "early-bird",
    name: "Early Bird",
    blurb: "A find logged between 5 and 7 in the morning, campus time.",
    group: "time",
    check: (row) => firstAt(row, (s) => { const h = campusHour(s.created_at); return h >= 5 && h < 8; }),
  },
  {
    id: "night-walk",
    name: "Night Walk",
    blurb: "A find logged after six in the evening, campus time.",
    group: "time",
    check: (row) => firstAt(row, (s) => { const h = campusHour(s.created_at); return h >= 18 || h < 5; }),
  },
  {
    id: "one-walk-ten",
    name: "Ten on One Walk",
    blurb: "Ten finds on a single walk — one loop, one good hour.",
    group: "find",
    check: (row) => {
      const by_walk = new Map<string, Sighting[]>();
      for (const s of row) {
        if (!s.walk_id) continue;
        const list = by_walk.get(s.walk_id) ?? [];
        list.push(s);
        by_walk.set(s.walk_id, list);
      }
      let best: string | null = null;
      for (const list of by_walk.values()) {
        if (list.length < 10) continue;
        const at = list.sort((a, b) => a.created_at.localeCompare(b.created_at))[9].created_at;
        if (!best || at < best) best = at;
      }
      return best;
    },
  },
  {
    id: "rare-catch",
    name: "Rare Catch",
    blurb: "Photograph a species with four or fewer campus observations on record.",
    group: "science",
    check: (row, ctx) => {
      const counts = ctx.pool_count;
      if (!counts) return null;
      return firstAt(row, (s) => {
        const c = counts.get(s.species_code);
        /* `null` means the sweep never counted it, not that it is rare. Letting
           null through would have awarded Rare Catch for photographing a
           mahogany. */
        return typeof c === "number" && c <= 4;
      });
    },
  },
  {
    id: "return-visit",
    name: "Return Visit",
    blurb: "Log a find in a ground you already walked, on a different day. Monitoring is repeat looking.",
    group: "science",
    /* Replaced "Shared Find", which claimed a find had been "synced to the
       campus world" while checking only that it had a location — a claim a
       device that has never reached a server cannot make, and a near-duplicate
       of Count and Location besides. This measures something no other badge
       does and that the project actually wants: the same ground, looked at
       twice, which is what turns a walk into a time series. */
    check: (row) => {
      const seen_day = new Map<string, string>();
      for (const s of [...row].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
        if (!isBadge(s)) continue;
        const code = sectorCodeOf(s);
        if (!code) continue;
        const day = s.created_at.slice(0, 10);
        const first_day = seen_day.get(code);
        if (first_day === undefined) {
          seen_day.set(code, day);
        } else if (first_day !== day) {
          return s.created_at;
        }
      }
      return null;
    },
  },
];

export interface BadgeAward {
  def: BadgeDef;
  /** The sighting that completed it. Null = not yet earned. */
  earned_at: string | null;
}

/** Every badge with its state — the shelf renders this in one pass. */
export function badgeFor(row: Sighting[], ctx?: Partial<BadgeContext>): BadgeAward[] {
  const full: BadgeContext = { sector_total: biome_sector.length, ...ctx };
  return BADGE_LIST.map((def) => ({ def, earned_at: def.check(row, full) }));
}

/** Only the earned ones, oldest first — the shelf headline count. */
export function earnedBadges(row: Sighting[], ctx?: Partial<BadgeContext>): { def: BadgeDef; earned_at: string }[] {
  return badgeFor(row, ctx)
    .filter((b): b is { def: BadgeDef; earned_at: string } => b.earned_at !== null)
    .sort((a, b) => a.earned_at.localeCompare(b.earned_at));
}
