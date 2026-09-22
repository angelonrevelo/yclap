/**
 * The streak's heat ramp — the rule half of `streak-flame.tsx`.
 *
 * Split out for the same reason `stage.ts` sits beside `character.tsx`: Node's
 * type stripping cannot load JSX, so anything a test needs to assert has to
 * live in a plain module. What a test needs to assert here is the design
 * decision, not the drawing — that a longer streak shows as a HOTTER flame
 * rather than a bigger one.
 *
 * That is not a stylistic preference. From `38:13` and `40:00` in the 09-21
 * recording: the streak was to be a fire on the buddy, and the worry in the
 * same breath was how that reads on a plant — *"you have to keep the fire
 * small."* A flame that grows toward the canopy is a plant catching fire. A
 * flame that changes colour is a streak getting longer. The bands below are
 * that answer, and `friend.test.ts` pins it.
 */

export interface HeatBand {
  /** Weeks at which this band starts. */
  at: number;
  core: string;
  edge: string;
  glow: string;
  label: string;
}

export const HEAT: HeatBand[] = [
  { at: 0, core: "#C9C5BA", edge: "#9A968C", glow: "rgba(0,0,0,0)", label: "No streak yet" },
  { at: 1, core: "#FFD08A", edge: "#E07B2A", glow: "rgba(224,123,42,0.35)", label: "week" },
  { at: 3, core: "#FFE7A3", edge: "#F0B429", glow: "rgba(240,180,41,0.45)", label: "weeks" },
  { at: 6, core: "#FFF6DC", edge: "#FF8A3D", glow: "rgba(255,138,61,0.5)", label: "weeks" },
  { at: 12, core: "#EAF6FF", edge: "#54A8E8", glow: "rgba(84,168,232,0.5)", label: "weeks" },
];

export function heatFor(weeks: number): HeatBand {
  let out = HEAT[0];
  for (const band of HEAT) if (weeks >= band.at) out = band;
  return out;
}

/**
 * How much the flame may grow across the WHOLE range: 14%, and no more.
 *
 * Exported so the cap is a number a test can read rather than a literal buried
 * in a style object, because "keep the fire small" is the requirement and a
 * requirement nobody can check is a preference.
 */
export const FLAME_MAX_GROWTH = 0.14;

export function flameScale(weeks: number): number {
  return 1 + Math.min(FLAME_MAX_GROWTH, Math.max(0, weeks) * 0.012);
}
