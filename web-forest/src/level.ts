/**
 * Trainer level — a way of DISPLAYING points, not a second score.
 *
 * Nothing awards "XP": the only currency is the Working Doc points in
 * `gamify.ts`. Level L starts at 50·L·(L−1) points (L1 0 · L2 100 · L3 300 ·
 * L4 600 · L5 1000), so the first level-up lands after a hunt, a log and a
 * few learns, and later ones stretch out the way a game's do.
 */

export const LEVEL_CAP = 99;

export interface Level {
  level: number;
  /** Points where this level starts. */
  floor: number;
  /** Points where the next level starts. */
  next: number;
  /** Points earned inside this level. */
  into: number;
  /** Points this level spans. */
  span: number;
  /** 0..1 progress through this level. */
  ratio: number;
  /** Points still needed for the next level. */
  to_next: number;
}

export function levelStart(level: number): number {
  return 50 * level * (level - 1);
}

export function levelOf(points: number): Level {
  const p = Number.isFinite(points) ? Math.max(0, Math.floor(points)) : 0;
  let level = 1;
  while (level < LEVEL_CAP && levelStart(level + 1) <= p) level += 1;
  const floor = levelStart(level);
  const next = levelStart(level + 1);
  const span = next - floor;
  const into = Math.min(p - floor, span);
  return { level, floor, next, into, span, ratio: span > 0 ? into / span : 1, to_next: Math.max(0, next - p) };
}
