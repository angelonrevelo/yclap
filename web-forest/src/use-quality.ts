import { useEffect, useRef, useState } from "react";
import {
  isQualityProbeNeeded,
  parseQuality,
  pickQuality,
  qualityFromFrame,
  readHint,
  readMeasured,
  writeMeasured,
  type QualityChoice,
  type QualityPick,
} from "./quality";

/**
 * The graphics tier, live: `pickQuality` plus the one thing it cannot do
 * purely — watch this device's frames.
 *
 * The sample only counts frames while the map is MOVING (`motion_key`
 * changes: the walker's fix or the camera's bearing). A standing map repaints
 * nothing and runs at 60 fps on anything, so frames sampled there would pass
 * every phone; the frames that feel "jittery and laggy" (Gelo, 09-30 `1:56`)
 * are the ones while walking and turning, so those are the ones judged.
 *
 * A verdict of lite is remembered on the device and announced through
 * `onDrop` — the app turns it into a toast, and the map's badge says
 * "auto, measured" from then on. Nothing about it is silent.
 */

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** A frame counts as "moving" this long after the last motion. */
const MOTION_HOLD_MS = 400;
/** Skip the first frames after the play view opens: fonts, images, the pool. */
const WARMUP_MS = 1500;

export function useQuality({
  choice,
  is_active,
  motion_key,
  onDrop,
}: {
  choice: QualityChoice;
  /** The play view is on screen and nothing is covering it. */
  is_active: boolean;
  motion_key: string;
  onDrop?: (verdict: { fps_p50: number; fps_p5: number }) => void;
}): QualityPick {
  const [url] = useState(() =>
    typeof window === "undefined" ? null : parseQuality(new URLSearchParams(window.location.search).get("quality")),
  );
  const [hint] = useState(readHint);
  const [measured, setMeasured] = useState(() => readMeasured(storage()));
  /* Once per session: a verdict of full stands until the next open. */
  const [is_judged, setJudged] = useState(false);
  const pick = pickQuality({ url, choice, hint, measured });

  const moved_at = useRef(0);
  useEffect(() => {
    moved_at.current = performance.now();
  }, [motion_key]);

  const drop_ref = useRef(onDrop);
  drop_ref.current = onDrop;

  const is_probe = is_active && !is_judged && isQualityProbeNeeded(pick);
  useEffect(() => {
    if (!is_probe) return;
    const opened_at = performance.now();
    const delta: number[] = [];
    let last = 0;
    let frame = 0;
    const step = (now: number) => {
      const is_moving = now - moved_at.current < MOTION_HOLD_MS;
      if (last && is_moving && now - opened_at > WARMUP_MS && document.visibilityState === "visible") {
        delta.push(now - last);
      }
      last = now;
      const verdict = qualityFromFrame(delta);
      if (verdict) {
        setJudged(true);
        if (verdict.tier === "lite") {
          writeMeasured(storage(), "lite");
          setMeasured("lite");
          drop_ref.current?.({ fps_p50: verdict.fps_p50, fps_p5: verdict.fps_p5 });
        }
        return;
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [is_probe]);

  return pick;
}
