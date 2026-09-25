import { useEffect, useState } from "react";
import { sticker } from "./asset/kit";
import { loadSpawnPool } from "./live";
import { SafetyMark } from "./alert";

/**
 * The cold start, the way the genre does it: a logo on white, an illustrated
 * loading screen with a tip and a real progress bar, then one safety card
 * before the map. Three screens, about three seconds, once per launch.
 *
 * Nothing here is theatre. The progress bar counts real work — the fonts the
 * whole game layer is set in, the 422 kB species pool the rotating world is
 * drawn from, and the art these screens and the HUD stand on — and the bar
 * only reaches the end when that work has. A floor of dwell time keeps a warm
 * cache from flashing three screens past in a quarter of a second.
 *
 * `?boot=off` skips the lot, for a projector that is reloaded mid-demo.
 */

const SPLASH_MS = 1300;
/** A warm cache finishes in a frame. Long enough to read one tip, no longer. */
const LOAD_MIN_MS = 2400;
/** Past this the map opens anyway: a slow network is not a reason to wait. */
const LOAD_MAX_MS = 9000;
const TIP_MS = 3200;

/**
 * Every tip is a rule this build actually enforces. If a number here changes
 * in `spawn.ts`, `data.ts` or `stage.ts`, the tip changes with it.
 */
export const BOOT_TIP = [
  "Two-thirds of this campus is green. Now you can name it.",
  "Finds change every 30 minutes, and two phones side by side see the same ones.",
  "Walk within 8 m of a find to open the camera. Further out, tap it and the map walks you there.",
  "Rarity is how often iNaturalist has recorded the species on this campus, not a number we invented.",
  "Your buddy grows from seed to tree as you log finds in new parts of campus.",
  "Photos and notes stay on this phone. Only the species and the place are shared.",
  "Hatched ground is restricted. Nothing appears there, so there is no reason to go in.",
  "Tap the ground to walk there. Drag to turn the camera, pinch to zoom.",
];

type Phase = "splash" | "load" | "safety" | "done";

function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => resolve();
    img.src = src;
  });
}

export function isBootSkipped(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("boot") === "off";
  } catch {
    return false;
  }
}

/** The work the loading bar counts. Each resolves; none of them can fail the boot. */
function bootTask(): Promise<unknown>[] {
  return [
    document.fonts?.ready ?? Promise.resolve(),
    loadSpawnPool(),
    preloadImage("/brand/magi/scene-portrait.svg"),
    preloadImage("/brand/magi/lockup-stacked.svg"),
    preloadImage(sticker.buddy_map),
    preloadImage(sticker.hiker),
    preloadImage(sticker.buddy_cheer),
  ];
}

export default function Boot({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState<Phase>("splash");
  const [done_count, setDoneCount] = useState(0);
  const [task_total, setTaskTotal] = useState(1);
  const [is_min_met, setMinMet] = useState(false);
  const [tip_index, setTipIndex] = useState(() => Math.floor(Math.random() * BOOT_TIP.length));

  /* Start the work at once, under the splash, so the logo is not dead time. */
  useEffect(() => {
    /* Counted per run, not accumulated: StrictMode runs this twice in dev, and
       a shared counter would reach "done" at half the work. */
    let is_alive = true;
    let finished = 0;
    const task = bootTask();
    setTaskTotal(task.length);
    for (const t of task) {
      t.finally(() => {
        if (!is_alive) return;
        finished += 1;
        setDoneCount((n) => Math.max(n, finished));
      });
    }
    const split = window.setTimeout(() => setPhase((p) => (p === "splash" ? "load" : p)), SPLASH_MS);
    const floor = window.setTimeout(() => setMinMet(true), SPLASH_MS + LOAD_MIN_MS);
    const ceiling = window.setTimeout(() => setDoneCount(Number.MAX_SAFE_INTEGER), SPLASH_MS + LOAD_MAX_MS);
    return () => {
      is_alive = false;
      window.clearTimeout(split);
      window.clearTimeout(floor);
      window.clearTimeout(ceiling);
    };
  }, []);

  const is_loaded = done_count >= task_total;
  useEffect(() => {
    if (phase === "load" && is_loaded && is_min_met) setPhase("safety");
  }, [phase, is_loaded, is_min_met]);

  useEffect(() => {
    if (phase !== "load") return;
    const id = window.setInterval(() => setTipIndex((i) => (i + 1) % BOOT_TIP.length), TIP_MS);
    return () => window.clearInterval(id);
  }, [phase]);

  /* The bar has two masters: the work, and the dwell floor. It moves with
     whichever is behind, so it never sits at 100% while the screen waits. */
  const [clock, setClock] = useState(0);
  useEffect(() => {
    if (phase !== "load") return;
    const t0 = performance.now();
    let raf = 0;
    const tick = () => {
      setClock(Math.min(1, (performance.now() - t0) / LOAD_MIN_MS));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);
  const work = Math.min(1, done_count / task_total);
  const progress = Math.min(work, clock);

  if (phase === "done") return null;

  return (
    <div className="bt-root" data-phase={phase}>
      {phase === "splash" && (
        <div className="bt-splash" aria-label="Magisphere">
          <img className="bt-splash-logo" src="/brand/magi/lockup-stacked.svg" alt="Magisphere — Rediscovering home." />
          <div className="bt-partner">
            <span className="bt-partner-name">
              Youth CLAP
              <small>2026 cohort</small>
            </span>
            <span className="bt-partner-rule" aria-hidden />
            <span className="bt-partner-name">
              Ateneo de Manila
              <small>Loyola Heights campus</small>
            </span>
          </div>
        </div>
      )}

      {phase === "load" && (
        <div className="bt-load" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)} aria-label="Loading the campus">
          <img className="bt-scene" src="/brand/magi/scene-portrait.svg" alt="" aria-hidden />
          <img className="bt-load-logo" src="/brand/magi/lockup-stacked.svg" alt="Magisphere" />
          <img className="bt-cast bt-cast-a" src={sticker.buddy_map} alt="" aria-hidden />
          <img className="bt-cast bt-cast-b" src={sticker.hiker} alt="" aria-hidden />
          <img className="bt-cast bt-cast-c" src={sticker.buddy_cheer} alt="" aria-hidden />
          <div className="bt-foot">
            <p key={tip_index} className="bt-tip">
              {BOOT_TIP[tip_index]}
            </p>
            <div className="bt-bar">
              <div className="bt-bar-fill" style={{ width: `${(progress * 100).toFixed(1)}%` }} />
            </div>
            <p className="bt-status">{progress >= 0.999 ? "Campus ready" : `Loading the campus · ${Math.round(progress * 100)}%`}</p>
          </div>
        </div>
      )}

      {phase === "safety" && (
        <div className="bt-safety">
          <div className="al-card al-light" role="alertdialog" aria-labelledby="bt-safety-title" aria-describedby="bt-safety-body">
            <SafetyMark />
            <h2 id="bt-safety-title" className="al-title">
              Stay aware of your surroundings
            </h2>
            <p id="bt-safety-body" className="al-body">
              Look up when you cross a campus road, and keep out of fenced or restricted groves while you play
              Magisphere.
            </p>
            <button
              type="button"
              className="al-button"
              onClick={() => {
                setPhase("done");
                onDone();
              }}
            >
              OK
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
