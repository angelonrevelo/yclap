/**
 * The graphics tier: `full` or `lite`.
 *
 * Gelo's 09-30 note: "the viewing experience on lower-end devices, such as a
 * cheap Windows laptop or even the phone browser, is still not very pleasant.
 * It's still very jittery and laggy" (`1:56`–`2:19`), and "it might be
 * rendering too much as well" (`2:30`). The play view repaints its whole
 * screen-space overlay every camera frame, so what a slow phone can afford is a
 * question of HOW MUCH is in that overlay. `lite` is the answer for a device
 * that cannot afford all of it: the same map, the same finds, the same walker,
 * with the scenery that measured most expensive cut back (see `LITE` below and
 * `bench/frame-*.json` for the numbers each cut is worth).
 *
 * Chosen, in this order, and the screen always says which one is on and why
 * (`QualityBadge` in `play-map.tsx`; the repo's rule is never to change what
 * the player sees silently):
 *
 *   1. `?quality=lite|full` — a projector or a bench pins it;
 *   2. the Settings choice, if it is not "auto";
 *   3. auto: a device that SAYS it is small (`isSmallDevice`) starts lite; any
 *      other starts full and is
 *      measured over its first seconds of play, and drops to lite if the frames
 *      come too slowly. A measured drop is remembered on the device, so the next
 *      open starts lite instead of stuttering through the test again.
 *
 * Auto never climbs back to full on its own. A tier that flips back and forth
 * is its own kind of jitter; Settings is where a player who wants full asks.
 *
 * Pure, so the chooser is pinned by `test/quality.test.ts`.
 */

export type Quality = "full" | "lite";
export type QualityChoice = "auto" | Quality;

/** Why the tier is what it is — shown on the badge, so it is never a mystery. */
export type QualityReason = "url" | "setting" | "device" | "measured" | "default";

export interface QualityHint {
  /** `navigator.hardwareConcurrency`; undefined where the browser hides it. */
  core_count?: number;
  /** `navigator.deviceMemory` in GB (Chromium only, rounded, capped at 8). */
  memory_gb?: number;
}

export interface QualityPick {
  tier: Quality;
  reason: QualityReason;
}

/**
 * The small-device lines. Two cores, 2 GB, or four cores with 4 GB is where the
 * budget Android phones and the cheapest Celeron/Athlon Windows laptops sit —
 * the devices the 09-30 note names (docs/spec/device-profile.md). Deliberately
 * NOT "four cores" alone: Safari never reports memory, and an iPhone that
 * reports four cores has a GPU that runs full comfortably; the fps sample is
 * what catches a slow device that does not say it is one.
 */
export const LITE_CORE_MAX = 2;
export const LITE_MEMORY_GB_MAX = 2;
export const MID_CORE_MAX = 4;
export const MID_MEMORY_GB_MAX = 4;

/**
 * The measured-fps line for auto. Below this median, or with the slowest 5%
 * of frames below `AUTO_P5_FPS_MIN`, a device goes lite. 45/24 rather than the
 * Stable-Alpha targets themselves (45/30): auto only has to catch the devices
 * that are clearly struggling, and a single stray GC in a three-second sample
 * should not cost a capable phone its trees.
 */
export const AUTO_P50_FPS_MIN = 45;
export const AUTO_P5_FPS_MIN = 24;
/**
 * A sample is trusted once it spans this much MOVING time (and at least
 * `AUTO_FRAME_MIN` frames). Time, not a frame count: a phone at 12 fps would
 * need fifteen seconds of walking to fill a 180-frame sample, and it is the
 * phone that most needs the verdict early.
 */
export const AUTO_SAMPLE_MS = 3000;
export const AUTO_FRAME_MIN = 30;

export function parseQuality(raw: string | null | undefined): Quality | null {
  return raw === "lite" || raw === "full" ? raw : null;
}

export function parseQualityChoice(raw: unknown): QualityChoice {
  return raw === "lite" || raw === "full" ? raw : "auto";
}

/** Does the device say it is small? A number the browser hides says nothing. */
export function isSmallDevice(hint: QualityHint): boolean {
  const core = typeof hint.core_count === "number" && hint.core_count > 0 ? hint.core_count : null;
  const memory = typeof hint.memory_gb === "number" && hint.memory_gb > 0 ? hint.memory_gb : null;
  if (core !== null && core <= LITE_CORE_MAX) return true;
  if (memory !== null && memory <= LITE_MEMORY_GB_MAX) return true;
  return core !== null && memory !== null && core <= MID_CORE_MAX && memory <= MID_MEMORY_GB_MAX;
}

/** Nearest-rank percentile of an ascending array (same rule as `frame-stat.ts`). */
function rank(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
}

/**
 * The auto verdict from a sample of frame times, or null while the sample is
 * still too short to judge. fps p5 is the frame only 5% are slower than.
 */
export function qualityFromFrame(delta_ms: readonly number[]): { tier: Quality; fps_p50: number; fps_p5: number } | null {
  const clean = delta_ms.filter((d) => Number.isFinite(d) && d > 0);
  if (clean.length < AUTO_FRAME_MIN) return null;
  if (clean.reduce((sum, d) => sum + d, 0) < AUTO_SAMPLE_MS) return null;
  const sorted = [...clean].sort((a, b) => a - b);
  const fps_p50 = Math.round(1000 / rank(sorted, 0.5));
  const fps_p5 = Math.round(1000 / rank(sorted, 0.95));
  const tier: Quality = fps_p50 < AUTO_P50_FPS_MIN || fps_p5 < AUTO_P5_FPS_MIN ? "lite" : "full";
  return { tier, fps_p50, fps_p5 };
}

/**
 * The one decision. `measured` is what an earlier auto run found on this
 * device (remembered) or what this session's sample has found (null before
 * either exists).
 */
export function pickQuality({
  url,
  choice,
  hint,
  measured,
}: {
  url: Quality | null;
  choice: QualityChoice;
  hint: QualityHint;
  measured: Quality | null;
}): QualityPick {
  if (url) return { tier: url, reason: "url" };
  if (choice !== "auto") return { tier: choice, reason: "setting" };
  if (isSmallDevice(hint)) return { tier: "lite", reason: "device" };
  if (measured === "lite") return { tier: "lite", reason: "measured" };
  return { tier: "full", reason: "default" };
}

/** Should this session run the fps sample? Only when auto could still move. */
export function isQualityProbeNeeded(pick: QualityPick): boolean {
  return pick.reason === "default";
}

/** The badge's words. Short: it sits on the map. */
export function qualityLabel(pick: QualityPick): string {
  const name = pick.tier === "lite" ? "Lite graphics" : "Full graphics";
  switch (pick.reason) {
    case "url":
      return `${name} · pinned`;
    case "setting":
      return `${name} · set`;
    case "device":
      return `${name} · auto, small device`;
    case "measured":
      return `${name} · auto, measured`;
    default:
      return `${name} · auto`;
  }
}

/**
 * What `lite` changes, in one place, so the Settings copy, the README and the
 * code cannot drift. Each is a cut the bench measured as a real cost.
 */
export interface QualityBudget {
  /** Most trees and bushes standing on the glass at once (`flora.tsx`). */
  tree_max: number;
  /** How far out a tree is still worth drawing, metres. */
  tree_radius_m: number;
  /** The blurred contact shadow under every building (`skyline.tsx`). */
  is_building_shadow: boolean;
  /** Birds, drifting clouds, bobbing finds, flapping wings. */
  is_ambient_motion: boolean;
}

export const BUDGET: Record<Quality, QualityBudget> = {
  full: { tree_max: 90, tree_radius_m: 140, is_building_shadow: true, is_ambient_motion: true },
  lite: { tree_max: 28, tree_radius_m: 90, is_building_shadow: false, is_ambient_motion: false },
};

/* ── the device side: storage and hints, kept thin ─────────────────────── */

const MEASURED_KEY = "field-guide.quality-measured";

export function readMeasured(storage: Storage | null): Quality | null {
  try {
    return parseQuality(storage?.getItem(MEASURED_KEY));
  } catch {
    return null;
  }
}

export function writeMeasured(storage: Storage | null, tier: Quality): void {
  try {
    storage?.setItem(MEASURED_KEY, tier);
  } catch {
    /* private mode: the next open simply measures again */
  }
}

export function readHint(): QualityHint {
  if (typeof navigator === "undefined") return {};
  const nav = navigator as Navigator & { deviceMemory?: number };
  return { core_count: nav.hardwareConcurrency, memory_gb: nav.deviceMemory };
}
