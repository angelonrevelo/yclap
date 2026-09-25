/**
 * GPS fix smoothing — one of the jitter sources the 09-25 note named (`4:03`).
 *
 * A phone's fix wanders by metres even standing still, and at the street
 * camera (under 4 cm a pixel) one metre is thirty pixels. Every wobble used to
 * go straight to the map: the camera lurched, the walker "walked" in place,
 * and the heading spun. This file is the filter between the chip and the map.
 *
 * Two parts, both small:
 *
 * 1. **An accuracy-aware Kalman filter**, one per axis in local metres. The
 *    gain is the classic `P / (P + R)`, with R the fix's own reported
 *    accuracy squared — so a tight fix moves the estimate almost all the way
 *    and a 40 m indoor fix barely nudges it. P grows between fixes at a
 *    walking pace, so a genuine walk is still followed.
 * 2. **A stationary dead-band** on the OUTPUT. If the filtered point has
 *    moved less than the dead-band since the point last published, the
 *    published point does not change at all. Downstream that means no
 *    re-render, no camera move and no walking animation for a person who is
 *    standing still. The filter keeps running underneath, so a real walk
 *    crosses the band and is published.
 *
 * It never invents a position: the output is always a weighted average of
 * fixes the device actually reported, and `accuracy_m` is passed through
 * as reported rather than improved on.
 */
import type { Fix } from "./geo.ts";

const METER_PER_DEGREE = 111_320;

/**
 * Process noise, m/s — how far the truth may drift between fixes. About twice
 * a walking pace: at 1.6 the estimate lagged a steady walk by nearly 8 m, half
 * the street camera's width; at 3 it lags about 3 m and a standing walker
 * still stays inside the dead-band.
 */
export const FIX_PROCESS_MS = 3;

/** A person standing still wobbles less than this, in metres. */
export const FIX_DEADBAND_M = 1.8;

/** Past this gap between fixes, the old estimate is worth nothing — start over. */
export const FIX_RESET_MS = 30_000;

export interface FixFilter {
  lat: number;
  lon: number;
  /** Variance of the estimate, m². */
  variance_m2: number;
  at: number;
  /** What was last handed downstream. */
  shown: Fix;
}

function gapMeter(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const dy = (b.lat - a.lat) * METER_PER_DEGREE;
  const dx = (b.lon - a.lon) * METER_PER_DEGREE * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/**
 * Feed one fix, get the next filter state and the fix to show.
 *
 * `prev` null (first fix, or after a reset) adopts the fix as-is.
 */
export function filterFix(prev: FixFilter | null, fix: Fix): { state: FixFilter; fix: Fix } {
  const accuracy = Number.isFinite(fix.accuracy_m) && fix.accuracy_m > 0 ? fix.accuracy_m : 20;
  const r = accuracy * accuracy;
  const dt_s = prev ? (fix.at - prev.at) / 1000 : Infinity;
  if (!prev || !(dt_s >= 0) || dt_s * 1000 > FIX_RESET_MS) {
    const state = { lat: fix.lat, lon: fix.lon, variance_m2: r, at: fix.at, shown: fix };
    return { state, fix };
  }

  const p = prev.variance_m2 + FIX_PROCESS_MS * FIX_PROCESS_MS * Math.max(dt_s, 0.05);
  const gain = p / (p + r);
  const lat = prev.lat + (fix.lat - prev.lat) * gain;
  const lon = prev.lon + (fix.lon - prev.lon) * gain;
  const variance_m2 = (1 - gain) * p;

  const estimate = { lat, lon };
  const is_still = gapMeter(prev.shown, estimate) < FIX_DEADBAND_M;
  const shown: Fix = is_still
    ? prev.shown
    : { ...fix, lat, lon };
  return { state: { lat, lon, variance_m2, at: fix.at, shown }, fix: shown };
}
