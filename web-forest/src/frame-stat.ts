/**
 * Frame-time statistics for the `?probe=1` overlay (`frame-probe.tsx`).
 *
 * Pure, so the numbers the overlay prints are the numbers a test pinned. The
 * probe exists so a claim like "the camera is smoother" can be checked on the
 * phone it is about, instead of argued from a desktop.
 */

export interface FrameStat {
  frame_count: number;
  fps: number;
  p50_ms: number;
  p95_ms: number;
  max_ms: number;
  /** Frames over 33 ms — two missed vsyncs at 60 Hz, the ones an eye catches. */
  long_count: number;
}

/** Nearest-rank percentile of an ascending array. */
function rank(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
}

export function frameStat(delta_ms: number[]): FrameStat {
  const clean = delta_ms.filter((d) => Number.isFinite(d) && d > 0);
  if (clean.length === 0) {
    return { frame_count: 0, fps: 0, p50_ms: 0, p95_ms: 0, max_ms: 0, long_count: 0 };
  }
  const sorted = [...clean].sort((a, b) => a - b);
  const total = clean.reduce((sum, d) => sum + d, 0);
  return {
    frame_count: clean.length,
    fps: Math.round((1000 * clean.length * 10) / total) / 10,
    p50_ms: Math.round(rank(sorted, 0.5) * 10) / 10,
    p95_ms: Math.round(rank(sorted, 0.95) * 10) / 10,
    max_ms: Math.round(sorted[sorted.length - 1] * 10) / 10,
    long_count: clean.filter((d) => d > 33).length,
  };
}
