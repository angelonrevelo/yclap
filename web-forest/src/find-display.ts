/**
 * How many things to do the play map shows at once, and how loudly.
 *
 * Gelo, 10-01: "improve on the display of items on the map (things to do)".
 * Until then every resident orb and every spawn within the near field
 * (`NEAR_FIELD_M`, one per 35 m cell — about seventy) stood on its own stalk at
 * the same size, so a street-zoom screen held twenty-five identical pins and
 * nothing said which one to walk to. Pokémon GO's grammar is the fix: what is
 * near stands up in full; what is further off is only a rustle in the grass —
 * you know something is there, not what; past that, nothing. Whatever a quest
 * or a challenge points at, and whatever is in reach right now, always shows.
 *
 * Pure: a list of candidates in, a tier per key out, so the budget is testable
 * without a browser.
 */

export type FindTier = "full" | "rustle" | "hidden";

export interface FindCandidate {
  key: string;
  distance_m: number;
  /** Close enough to log right now. */
  in_range: boolean;
  /** Something an objective or a challenge points at. */
  is_target: boolean;
  /** Already in the journal — still loggable, but no longer news. */
  is_logged: boolean;
  /** 0 common … 3 rarest. */
  rarity_rank: number;
}

export interface FindBudget {
  /** Full stickers at most, targets and in-reach finds included. */
  full_max: number;
  /** Rustles at most. */
  rustle_max: number;
  /** A find nearer than this may stand up in full. */
  full_m: number;
  /** Nearer than this (and not full) it may rustle; past it, hidden. */
  rustle_m: number;
}

/** Phone and desktop budgets. A desktop screen shows more ground, so a little more on it. */
export const FIND_BUDGET: Record<"phone" | "desktop", FindBudget> = {
  phone: { full_max: 7, rustle_max: 8, full_m: 70, rustle_m: 150 },
  desktop: { full_max: 11, rustle_max: 12, full_m: 85, rustle_m: 170 },
};

/** Who stands up first when there are more than the budget: target, in reach, new, rare, near. */
function priority(c: FindCandidate): number {
  return (
    (c.is_target ? 1e7 : 0) +
    (c.in_range ? 1e6 : 0) +
    (c.is_logged ? 0 : 1e5) +
    c.rarity_rank * 1e4 -
    Math.min(c.distance_m, 9999)
  );
}

export function tierFind(candidate: FindCandidate[], budget: FindBudget): Map<string, FindTier> {
  const out = new Map<string, FindTier>();
  const ordered = [...candidate].sort((a, b) => priority(b) - priority(a));
  let full = 0;
  let rustle = 0;
  for (const c of ordered) {
    const is_forced = c.is_target || c.in_range;
    if (is_forced || (c.distance_m <= budget.full_m && full < budget.full_max)) {
      /* A forced find always shows, even past the cap — it is the point of the screen. */
      out.set(c.key, "full");
      full += 1;
      continue;
    }
    /* Logged and out of reach: done, so it does not rustle for attention. */
    if (!c.is_logged && c.distance_m <= budget.rustle_m && rustle < budget.rustle_max) {
      out.set(c.key, "rustle");
      rustle += 1;
      continue;
    }
    out.set(c.key, "hidden");
  }
  return out;
}
