import { useEffect, useState } from "react";
import { frameStat, type FrameStat } from "./frame-stat";

/**
 * A tiny frame-time readout, ON only with `?probe=1`.
 *
 * Not a feature and never on for a player: it is the instrument behind the
 * jitter numbers in the README, left in so they can be re-measured on the
 * booth phone rather than trusted. It also publishes the same numbers on
 * `window.__magisphere_frame` for a scripted run.
 */
const is_probe = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("probe") === "1";

const WINDOW = 180;

export default function FrameProbe() {
  const [stat, setStat] = useState<FrameStat | null>(null);

  useEffect(() => {
    if (!is_probe) return;
    const delta: number[] = [];
    let last = performance.now();
    let frame = 0;
    let shown_at = last;
    const step = (now: number) => {
      delta.push(now - last);
      if (delta.length > WINDOW) delta.shift();
      last = now;
      if (now - shown_at > 500) {
        shown_at = now;
        const next = frameStat(delta);
        (window as unknown as { __magisphere_frame?: FrameStat }).__magisphere_frame = next;
        setStat(next);
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!is_probe || !stat) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 8,
        top: "46%",
        zIndex: 40,
        pointerEvents: "none",
        font: "600 10.5px/1.35 ui-monospace, monospace",
        color: "#fff",
        background: "rgba(0,0,0,0.62)",
        borderRadius: 6,
        padding: "4px 7px",
        whiteSpace: "pre",
      }}
    >
      {`${stat.fps} fps · p50 ${stat.p50_ms} · p95 ${stat.p95_ms} ms\nmax ${stat.max_ms} ms · >33ms ×${stat.long_count}`}
    </div>
  );
}
