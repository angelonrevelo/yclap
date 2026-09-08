/**
 * Cosmetic variants — the blind-box reward (build spec T4.5, 2026-09-06).
 *
 * Completing a stage grants a cosmetic variant for the character. The grant is
 * **deterministic**: it derives from the sectors this journal has walked into,
 * which derive from located badge sightings, which derive from this device's
 * own journal. Nothing here is random. There is no odds table, no currency, no
 * scarcity — a variant is granted the moment the stage advances, full stop.
 *
 * Source: `1:04:45` Pop Mart style; `docs/spec/biome-3d-build-spec.md` §5 T4.5:
 * "nothing purchasable, no currency, no scarcity mechanic, no loot-box odds —
 * a variant is granted deterministically on completion."
 *
 * Why this is a `.ts` and not a `.tsx`: Node's type stripping cannot load JSX,
 * so a rule a test needs to assert has to live in a plain module. Same reason
 * `stage.ts` sits beside `character.tsx`.
 */
import { stageFor, STAGE_ORDER, type Stage } from "./stage.ts";

export interface Cosmetic {
  /** Stable id, never reused. */
  id: string;
  /** Display name shown under the character in the reveal. */
  name: string;
  /** The stage that grants this cosmetic. */
  stage: Stage;
  /** A CSS colour for the cosmetic flair on the character. */
  accent: string;
  /** One-line flavour text shown in the reveal. */
  blurb: string;
}

/**
 * One cosmetic per stage advance. The order is the stage order minus egg (egg
 * is the starting state — nothing is granted for being at zero). Three advances
 * possible: egg→sprout, sprout→sapling, sapling→tree.
 */
export const COSMETIC_LIST: Cosmetic[] = [
  {
    id: "sprout-pot",
    name: "Terracotta Pot",
    stage: "sprout",
    accent: "#C97B4A",
    blurb: "Your seed cracked open. It has a home now.",
  },
  {
    id: "sapling-ring",
    name: "Moss Ring",
    stage: "sapling",
    accent: "#5B8C3E",
    blurb: "Four areas walked. Moss crept in around the base.",
  },
  {
    id: "tree-crown",
    name: "Golden Crown",
    stage: "tree",
    accent: "#F6B22D",
    blurb: "Nine areas. The canopy caught the light.",
  },
];

/**
 * The cosmetics a journal with this many sectors walked has earned.
 *
 * Deterministic by construction: `stageFor` is a pure function of the count,
 * and the slice is a pure function of the stage. Same count → same cosmetics,
 * every time, on every device. No `Math.random` anywhere in this module.
 */
export function grantedCosmetics(sector_seen_count: number): Cosmetic[] {
  const stage = stageFor(sector_seen_count);
  const stage_index = STAGE_ORDER.indexOf(stage);
  /* Egg is index 0 — slice(0, 0) is empty, which is correct: egg grants nothing. */
  return COSMETIC_LIST.slice(0, stage_index);
}

/** The next cosmetic to earn, or null when every stage's cosmetic is unlocked. */
export function nextCosmetic(sector_seen_count: number): Cosmetic | null {
  const stage = stageFor(sector_seen_count);
  const stage_index = STAGE_ORDER.indexOf(stage);
  return COSMETIC_LIST[stage_index] ?? null;
}

/** The cosmetic a given stage grants, or null for egg (the starting state). */
export function cosmeticForStage(stage: Stage): Cosmetic | null {
  return COSMETIC_LIST.find((c) => c.stage === stage) ?? null;
}
