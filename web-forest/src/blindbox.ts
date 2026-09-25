/**
 * Blind boxes — the Working Doc's Pop Mart-style reward, earned, never bought.
 *
 * `cosmetic.ts` already grants one variant per stage advance. That is three
 * rewards over a whole term; this is the loop that pays on an ordinary day.
 * A box is **earned by a real action already in the points ledger** and by
 * nothing else:
 *
 * - `hunt:<day>` — the daily hunt was completed (a `challenge` event), and
 * - `species:<code>` — a species was logged for the first time on this device
 *   (the first `observe` / `verified_discovery` event naming it).
 *
 * Explore and Learn earn nothing: opening a card is not a find. The seeded
 * demo journal (`?seed=demo`) writes no point events, so it earns no boxes.
 *
 * Opening a box grants a charm from `BLINDBOX_POOL`. The grant is
 * **deterministic and fair**: no odds table, no currency, no scarcity, and no
 * charm repeats until the whole set has been collected once (then a new round
 * starts). Which unowned charm a box holds is a hash of the box's own id, so
 * the same journal opens the same charms on every device, every time — the
 * build-spec T4.5 rule ("fail if a random-odds pull ships") holds. Nothing here
 * calls `Math.random`.
 *
 * What is stored is only what cannot be re-derived: which boxes were opened
 * and what came out, in `localStorage` under `field-guide.blindbox`.
 *
 * Source: `1:04:45` (09-02 pulong, Pop Mart style); `docs/spec/biome-3d-build-spec.md`
 * §5 T4.5; ROADMAP "Blindbox / cosmetic reveals"; NOT DOING "no commerce".
 */
import { speciesFromSubject, type PointEvent } from "./gamify.ts";
import type { Cosmetic } from "./cosmetic.ts";

export type CharmGlyph = "leaf" | "feather" | "flower" | "drop" | "star";

/** A box charm. Same shape as a stage cosmetic, minus the stage that grants it. */
export interface BoxCosmetic extends Omit<Cosmetic, "stage"> {
  glyph: CharmGlyph;
}

/**
 * The set. Flavour lines are flavour — none states a fact about campus that
 * the app has not measured. Ids are stable and never reused.
 */
export const BLINDBOX_POOL: BoxCosmetic[] = [
  { id: "charm-narra-leaf", name: "Narra Leaf Pin", accent: "#5B8C3E", glyph: "leaf", blurb: "A leaf pin for the walker's cap." },
  { id: "charm-eagle-feather", name: "Eagle Feather", accent: "#2F5D8A", glyph: "feather", blurb: "Blue and white, tucked behind the ear." },
  { id: "charm-sampaguita", name: "Sampaguita Clip", accent: "#E9E4D4", glyph: "flower", blurb: "Small, white, and it smells like June." },
  { id: "charm-morning-dew", name: "Morning Dew", accent: "#6FB7C9", glyph: "drop", blurb: "The grass was wet when you found it." },
  { id: "charm-firefly", name: "Firefly Spark", accent: "#F6B22D", glyph: "star", blurb: "A little light that follows you home." },
  { id: "charm-acacia-pod", name: "Acacia Pod", accent: "#8A5A33", glyph: "leaf", blurb: "It rattles when the walker runs." },
  { id: "charm-kingfisher", name: "Kingfisher Plume", accent: "#1F8FA3", glyph: "feather", blurb: "Too bright to be a sparrow's." },
  { id: "charm-gumamela", name: "Gumamela Badge", accent: "#D2453D", glyph: "flower", blurb: "Red enough to spot across a field." },
];

export type BoxSource = "hunt" | "species";

export interface Box {
  /** `hunt:<day_key>` or `species:<species_code>`. Stable; one box per id, ever. */
  box_id: string;
  source: BoxSource;
  /** The day key or species code the box was earned for. */
  subject: string;
  earned_at: string;
}

export interface BoxOpen {
  box_id: string;
  cosmetic_id: string;
  opened_at: string;
}

/**
 * Every box this ledger has earned, oldest first. A pure function of the point
 * events — the only way to get a box is to have the event that pays for it.
 */
export function earnedBox(event: PointEvent[]): Box[] {
  const box: Box[] = [];
  const seen_id = new Set<string>();
  const ordered = [...event].sort((a, b) => a.at.localeCompare(b.at));
  for (const e of ordered) {
    let row: Box | null = null;
    if (e.kind === "challenge" && e.subject_key.startsWith("daily:")) {
      const day = e.subject_key.slice("daily:".length);
      if (day) row = { box_id: `hunt:${day}`, source: "hunt", subject: day, earned_at: e.at };
    } else if (e.kind === "observe" || e.kind === "verified_discovery") {
      const code = speciesFromSubject(e.subject_key);
      if (code) row = { box_id: `species:${code}`, source: "species", subject: code, earned_at: e.at };
    }
    if (row && !seen_id.has(row.box_id)) {
      seen_id.add(row.box_id);
      box.push(row);
    }
  }
  return box;
}

/** Earned boxes not opened yet, oldest first. */
export function unopenedBox(box: Box[], open: BoxOpen[]): Box[] {
  const opened = new Set(open.map((o) => o.box_id));
  return box.filter((b) => !opened.has(b.box_id));
}

/** FNV-1a, 32-bit. A stable string hash — not randomness, and not odds. */
export function hashOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * The charm a box holds, given what has already been opened.
 *
 * Rounds: the first `pool.length` opens are round 0, the next are round 1, and
 * so on. Within a round a charm is never granted twice, so the set is complete
 * after exactly `pool.length` boxes. The pick among the charms still missing
 * this round is `hashOf(box_id)` — deterministic, identical on every device.
 */
export function grantFor(
  box_id: string,
  open: BoxOpen[],
  pool: BoxCosmetic[] = BLINDBOX_POOL,
): BoxCosmetic {
  const size = pool.length;
  const round_start = Math.floor(open.length / size) * size;
  const this_round = new Set(open.slice(round_start).map((o) => o.cosmetic_id));
  const remaining = pool.filter((c) => !this_round.has(c.id));
  const choice = remaining.length > 0 ? remaining : pool;
  return choice[hashOf(box_id) % choice.length];
}

export interface OpenResult {
  open: BoxOpen[];
  cosmetic: BoxCosmetic;
  /** False when this charm was already on the shelf from an earlier round. */
  is_new: boolean;
}

/**
 * Open one earned box. Returns null for a box that was never earned or was
 * already opened — there is no path that hands out a charm without a box.
 * Pure; callers persist via `writeBoxOpen`.
 */
export function openBox(
  box_id: string,
  earned: Box[],
  open: BoxOpen[],
  at: string = new Date().toISOString(),
  pool: BoxCosmetic[] = BLINDBOX_POOL,
): OpenResult | null {
  if (!earned.some((b) => b.box_id === box_id)) return null;
  if (open.some((o) => o.box_id === box_id)) return null;
  const cosmetic = grantFor(box_id, open, pool);
  const is_new = !open.some((o) => o.cosmetic_id === cosmetic.id);
  return { open: [...open, { box_id, cosmetic_id: cosmetic.id, opened_at: at }], cosmetic, is_new };
}

export interface ShelfCharm {
  cosmetic: BoxCosmetic;
  /** How many boxes this charm came out of. Zero means not found yet. */
  count: number;
}

/** The whole set in pool order, each with how many times it has come out. */
export function charmShelf(open: BoxOpen[], pool: BoxCosmetic[] = BLINDBOX_POOL): ShelfCharm[] {
  return pool.map((cosmetic) => ({
    cosmetic,
    count: open.filter((o) => o.cosmetic_id === cosmetic.id).length,
  }));
}

/* ── storage ─────────────────────────────────────────────────────────────── */

const BLINDBOX_KEY = "field-guide.blindbox";

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function parseBoxOpen(raw: string | null): BoxOpen[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.flatMap((row): BoxOpen[] => {
      if (!row || typeof row !== "object") return [];
      const r = row as Record<string, unknown>;
      if (typeof r.box_id !== "string" || typeof r.cosmetic_id !== "string") return [];
      return [{ box_id: r.box_id, cosmetic_id: r.cosmetic_id, opened_at: typeof r.opened_at === "string" ? r.opened_at : "" }];
    });
  } catch {
    return [];
  }
}

export function readBoxOpen(storage: Storage | null = safeStorage()): BoxOpen[] {
  return parseBoxOpen(storage?.getItem(BLINDBOX_KEY) ?? null);
}

export function writeBoxOpen(open: BoxOpen[], storage: Storage | null = safeStorage()): void {
  try {
    storage?.setItem(BLINDBOX_KEY, JSON.stringify(open));
  } catch {
    /* private mode — drop silently */
  }
}
