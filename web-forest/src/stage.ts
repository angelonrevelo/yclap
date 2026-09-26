/**
 * The character's growth rules, kept out of the component that draws it.
 *
 * Same reason `basemap.ts` sits beside `tile-map.tsx`: Node's type stripping
 * cannot load a `.tsx`, so any rule a test needs to assert has to live in a
 * plain `.ts`. Putting the thresholds here is what makes them testable at all —
 * when they lived in `character.tsx`, `sector.test.ts` could not even import
 * them without the runner failing on the JSX.
 *
 * The rules themselves come off the record: egg → seedling → tree (`1:05:55`),
 * and absence changes appearance without taking progress away (`1:08:20`).
 * That second rule is why nothing here can ever return a lower stage for a
 * higher count — `sector.test.ts` walks the whole range to prove it.
 */

export type Stage = "egg" | "sprout" | "sapling" | "tree";

export const STAGE_ORDER: Stage[] = ["egg", "sprout", "sapling", "tree"];

export const STAGE_LABEL: Record<Stage, string> = {
  egg: "Egg",
  sprout: "Hatchling",
  sapling: "Eaglet",
  tree: "Eagle",
};

/**
 * Sectors walked that earn each stage.
 *
 * Keyed to SECTORS rather than to sightings on purpose: the thing the app is
 * for is getting someone to walk into a part of campus they have not been in.
 * Counting photographs instead would reward standing still under one tree.
 */
export const STAGE_AT: { stage: Stage; sector_seen: number }[] = [
  { stage: "egg", sector_seen: 0 },
  { stage: "sprout", sector_seen: 1 },
  { stage: "sapling", sector_seen: 4 },
  { stage: "tree", sector_seen: 9 },
];

export function stageFor(sector_seen: number): Stage {
  let stage: Stage = "egg";
  for (const step of STAGE_AT) if (sector_seen >= step.sector_seen) stage = step.stage;
  return stage;
}

/** How many more sectors until the next stage, or null once fully grown. */
export function toNextStage(sector_seen: number): { stage: Stage; remaining: number } | null {
  const next = STAGE_AT.find((s) => s.sector_seen > sector_seen);
  return next ? { stage: next.stage, remaining: next.sector_seen - sector_seen } : null;
}
