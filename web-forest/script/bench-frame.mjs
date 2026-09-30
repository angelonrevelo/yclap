/**
 * The play-view frame benchmark: `npm run bench:frame`.
 *
 * Gelo's 09-30 note (`1:56`–`2:19`): "the viewing experience on lower-end
 * devices, such as a cheap Windows laptop or even the phone browser, is still
 * not very pleasant. It's still very jittery and laggy", and (`2:30`) "it might
 * be rendering too much as well". A claim that that is fixed has to be a
 * number somebody else can re-run, so this is the number.
 *
 * What it does, every run the same:
 *   - serves the RELEASE build (`vite preview`, port 4182) — a dev build runs
 *     React's development checks and is not what a phone gets;
 *   - opens it in headless Chrome over the DevTools protocol at 390×844, DPR 2,
 *     mobile + touch emulation (same CDP approach as `shot.mjs`, which explains
 *     why a `--window-size` flag is not a 390 px viewport on Windows);
 *   - pins the scene: `?boot=off&time=day&weather=clear&at=<STICK_START>`, and a
 *     geolocation off campus, so the app itself switches to the stick walk and
 *     every run starts on the same spot under the same sky;
 *   - throttles the CPU (4× and 6× by default — see docs/spec/device-profile.md
 *     for which device each stands for);
 *   - walks 10 s with the on-screen stick (a second finger swings the camera
 *     round the walker from 2 s to 8 s), recording every animation frame, every
 *     long task, the DOM size and the JS heap.
 *
 * GPU raster is ON by default, because every target device has one and uses
 * it (docs/spec/device-profile.md). Chrome's CPU throttle slows the page's
 * main thread, not the GPU, so "4×" means a slow CPU in front of working
 * graphics — which is what a cheap phone or laptop is. `--soft` runs
 * `--disable-gpu` instead (software raster, as `shot.mjs` has it): the worst
 * case, a laptop whose graphics driver Chrome blocklisted, and the run where
 * paint AREA — big gradients, blur filters, screen-sized SVG — shows up.
 *
 * `--trace` additionally records ONE extra run (first throttle, first tier)
 * with a DevTools timeline and a JS CPU profile, and writes the top costs into
 * the JSON — the evidence for what to cut, rather than a guess.
 *
 * Usage:
 *   node script/bench-frame.mjs [--throttle 4,6] [--quality lite,full]
 *     [--label before] [--no-build] [--run 1] [--trace [--dump dir]] [--soft] [--debug] [--raw]
 *     [--query "zoom=19"] [--dist dist-before --build-of <sha>] [--out path] [--port 4182]
 *
 * Output: `bench/frame-<yyyy-mm-dd>[-<label>].json`.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
/* `--port`: a build lane sharing the host with others runs its own preview
   port, or two benches would refuse each other (see the check below). */
const PORT = Number(process.argv.includes("--port") ? process.argv[process.argv.indexOf("--port") + 1] : 4182);
const WIDTH = 390;
const HEIGHT = 844;
const WALK_MS = 10_000;
const SETTLE_MS = 2_500;
/** `STICK_START` in `play-walk.ts`: the same spot every run. */
const AT = "14.63904,121.07747";
/** Somewhere off campus, so the app hands itself the stick (`OFF_CAMPUS_ALERT`). */
const OFF_CAMPUS = { latitude: 14.5547, longitude: 121.0244, accuracy: 10 };

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const next = process.argv[i + 1];
  return next === undefined || next.startsWith("--") ? true : next;
}

const throttle_list = String(arg("throttle", "4,6")).split(",").map(Number).filter((n) => n >= 1);
const quality_list = String(arg("quality", "lite,full")).split(",").filter(Boolean);
const label = arg("label", "");
const run_count = Math.max(1, Number(arg("run", 1)));
const is_trace = arg("trace", false) === true;
const is_gpu = arg("soft", false) !== true;
const is_build = arg("no-build", false) !== true;
/* Serve a different build directory, e.g. a build of the commit before a
   change, so before and after can be run back to back on the same machine
   load (`vite build --outDir dist-before`). */
const dist = arg("dist", "dist");
/* Screenshots mid-walk into the temp dir, to check the scene actually walks
   and swings. They cost frames, so never in a measured run you keep. */
const is_debug = arg("debug", false) === true;
/* Keep every frame's [time, camera x, camera y] in the JSON, for plotting. */
const is_raw = arg("raw", false) === true;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── the release build, served ─────────────────────────────────────────── */

if (is_build) {
  console.log("building…");
  const build = spawnSync("npx", ["vite", "build", "--outDir", String(dist)], { cwd: ROOT, stdio: "ignore", shell: true });
  if (build.status !== 0) {
    console.error("vite build failed");
    process.exit(1);
  }
}

async function isUp() {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/`);
    return res.ok;
  } catch {
    return false;
  }
}

/* Never measure a server this run did not start: it could be serving a dev
   build, or a different `--dist`, and the numbers would be for the wrong app. */
if (await isUp()) {
  console.error(`port ${PORT} is already serving something — stop it, so the bench serves the build it just made`);
  process.exit(1);
}
const server = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort", "--outDir", String(dist)], {
  cwd: ROOT,
  stdio: "ignore",
  shell: true,
});
for (let i = 0; i < 80 && !(await isUp()); i += 1) await sleep(250);
if (!(await isUp())) {
  console.error(`vite preview never answered on ${PORT}`);
  process.exit(1);
}

/* ── chrome ────────────────────────────────────────────────────────────── */

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => existsSync(p));
if (!CHROME) {
  console.error("no chrome found");
  process.exit(1);
}

const debug_port = 9322 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(join(tmpdir(), "bench-frame-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    ...(is_gpu ? [] : ["--disable-gpu"]),
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    `--remote-debugging-port=${debug_port}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);

async function endpoint() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${debug_port}/json/version`);
      if (res.ok) return (await res.json()).webSocketDebuggerUrl;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error("chrome never opened its debugging port");
}

const ws = new WebSocket(await endpoint());
await new Promise((r) => (ws.onopen = r));

let next_id = 0;
const pending = new Map();
const listener = new Set();
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id !== undefined) {
    const slot = pending.get(msg.id);
    if (slot) {
      pending.delete(msg.id);
      if (msg.error) slot.reject(new Error(`${slot.method}: ${msg.error.message}`));
      else slot.resolve(msg.result ?? {});
    }
    return;
  }
  for (const fn of listener) fn(msg);
};
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = (next_id += 1);
    pending.set(id, { resolve, reject, method });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

async function evaluate(session, expression) {
  const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, session);
  if (res.exceptionDetails) throw new Error(`page: ${res.exceptionDetails.text} ${expression.slice(0, 80)}`);
  return res.result?.value;
}

/* ── the page-side recorder ───────────────────────────────────────────── */

/* Every rAF delta and every long task, from `start()` to `stop()`. rAF is the
   main thread's own frame clock: a frame the page could not produce in time
   shows up here as a long delta, which is exactly the "laggy" in the note. */
/* It also reads the camera every frame — the raked plane's trailing
   `translate3d` (see CAMERA below) — because a frame rate can be fine while
   the ground still moves in uneven chunks: the lead's 10-01 hall bench saw the
   camera step 3.2 / 7.2 / 10.4 / 11.9 px on 15 / 30 / 46 ms frames while walking
   at a steady pace, uncorrelated with the frame interval. That judder is
   Gelo's "stuttering" (09-30 `0:29`), so it is measured here too. */
const RECORDER = `(() => {
  const rec = { delta: [], long: [], camera: [], is_on: false, last: 0, plane: null };
  const planeOf = () => {
    if (rec.plane && rec.plane.isConnected) return rec.plane;
    rec.plane = [...document.querySelectorAll("div")].find((d) => d.style.transform.includes("perspective(")) || null;
    return rec.plane;
  };
  const step = (now) => {
    if (rec.is_on) {
      if (rec.last) rec.delta.push(now - rec.last);
      rec.last = now;
      const plane = planeOf();
      const m = plane ? /translate3d\\(([-\\d.]+)px, ([-\\d.]+)px/.exec(plane.style.transform) : null;
      if (m) rec.camera.push([Math.round(now * 10) / 10, Number(m[1]), Number(m[2])]);
    }
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  try {
    new PerformanceObserver((list) => {
      if (!rec.is_on) return;
      for (const e of list.getEntries()) rec.long.push(Math.round(e.duration));
    }).observe({ type: "longtask", buffered: false });
  } catch {}
  window.__bench = {
    start() { rec.delta = []; rec.long = []; rec.camera = []; rec.last = 0; rec.is_on = true; },
    stop() { rec.is_on = false; return { delta: rec.delta, long: rec.long, camera: rec.camera }; },
  };
})()`;

/* Close whatever card is up (alerts, today's hunt, a toast with a button) so
   the walk is measured on the map, not on a modal. Returns how many it closed. */
const DISMISS = `(() => {
  let n = 0;
  for (const b of document.querySelectorAll("button.al-button")) { b.click(); n += 1; }
  for (const b of document.querySelectorAll("button")) {
    const t = (b.textContent || "").trim().toLowerCase();
    if (/^(later|not now|maybe later|skip)$/.test(t)) { b.click(); n += 1; }
  }
  return n;
})()`;

function rank(sorted, p) {
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * p) - 1))];
}
const round1 = (n) => Math.round(n * 10) / 10;

function summarise(delta, long) {
  const clean = delta.filter((d) => Number.isFinite(d) && d > 0);
  const sorted = [...clean].sort((a, b) => a - b);
  const total = clean.reduce((s, d) => s + d, 0);
  /* fps p50 is the median frame; fps p5 is the frame only 5% are slower than,
     i.e. 1000 / the 95th-percentile frame time. */
  return {
    frame_count: clean.length,
    fps_mean: total ? round1((1000 * clean.length) / total) : 0,
    fps_p50: sorted.length ? round1(1000 / rank(sorted, 0.5)) : 0,
    fps_p5: sorted.length ? round1(1000 / rank(sorted, 0.95)) : 0,
    frame_ms_p50: round1(rank(sorted, 0.5)),
    frame_ms_p95: round1(rank(sorted, 0.95)),
    frame_ms_max: round1(sorted[sorted.length - 1] ?? 0),
    frame_over_33ms_count: clean.filter((d) => d > 33.4).length,
    long_task_count: long.length,
    long_task_ms_total: long.reduce((s, d) => s + d, 0),
    long_task_ms_max: long.length ? Math.max(...long) : 0,
  };
}

/**
 * How evenly the ground moves: the camera's speed (plane px per ms) frame to
 * frame, over the steady part of the walk (after the first second, when the
 * stick is at full throw). A steady walk under a smooth camera has a nearly
 * constant speed, so the spread IS the judder: `camera_speed_cv` is the
 * coefficient of variation (0 = perfectly even), and the p5/p95 ratio says how
 * far the slow and fast frames sit from the median. Anchor jumps (the plane
 * re-centres every 2,048 px) are dropped, as are frames the camera did not move.
 */
function cameraSteadiness(camera) {
  if (camera.length < 10) return { camera_frame_count: camera.length, camera_speed_cv: null };
  const t0 = camera[0][0];
  const speed = [];
  /* The recorder's rAF runs BEFORE the map's glide rAF in the same frame, so
     the transform it reads at frame i is the one the glide computed at frame
     i-1, from that frame's own interval. The step therefore pairs with the
     PREVIOUS interval; pairing it with its own made a steady camera look like
     it judders by exactly one frame of lag. */
  for (let i = 2; i < camera.length; i += 1) {
    const [t, x, y] = camera[i];
    const [tp, xp, yp] = camera[i - 1];
    const tpp = camera[i - 2][0];
    if (t - t0 < 1000) continue;
    const dt = tp - tpp;
    const d = Math.hypot(x - xp, y - yp);
    if (dt <= 0 || d > 1000 || d === 0) continue;
    speed.push(d / dt);
  }
  if (speed.length < 10) return { camera_frame_count: speed.length, camera_speed_cv: null };
  const mean = speed.reduce((s, v) => s + v, 0) / speed.length;
  const sd = Math.sqrt(speed.reduce((s, v) => s + (v - mean) ** 2, 0) / speed.length);
  /* The walk itself speeds up and slows down (sliding along a wall, the
     curve), which the CV counts too. Judder is FRAME-TO-FRAME: each frame's
     speed against the mean of its two neighbours. p50/p95 of that departure,
     as a fraction: 0.05 means the ground's speed wobbles 5% frame to frame. */
  const wobble = [];
  for (let i = 1; i < speed.length - 1; i += 1) {
    const around = (speed[i - 1] + speed[i + 1]) / 2;
    if (around > 0) wobble.push(Math.abs(speed[i] / around - 1));
  }
  wobble.sort((a, b) => a - b);
  return {
    camera_frame_count: speed.length,
    camera_speed_cv: Math.round((sd / mean) * 100) / 100,
    camera_jitter_p50: wobble.length ? Math.round(rank(wobble, 0.5) * 1000) / 1000 : null,
    camera_jitter_p95: wobble.length ? Math.round(rank(wobble, 0.95) * 1000) / 1000 : null,
  };
}

function metricOf(list) {
  const out = {};
  for (const m of list.metrics ?? []) out[m.name] = m.value;
  return out;
}

/* ── the scripted walk ────────────────────────────────────────────────── */

/* The stick's centre (`joystick.tsx`: left 18, bottom 178, 140 px across). */
const STICK = { x: 18 + 70, y: HEIGHT - 178 - 70 };
const THROW = 44;
/* The camera finger, on open ground right of the walker. */
const SWING = { x: 300, y: 420 };

/* The raked plane's transform carries the camera: `rotateZ` is the bearing and
   the trailing `translate3d` the camera's offset inside its anchor. Sampled
   through the walk, it proves the run actually walked and swung — a run where
   a card ate the touches measures an idle map and must not pass for a walk. */
const CAMERA = `(() => {
  const plane = [...document.querySelectorAll("div")].find((d) => d.style.transform.includes("perspective("));
  const t = plane ? plane.style.transform : "";
  const bearing = Number((/rotateZ\\(([-\\d.]+)deg\\)/.exec(t) || [])[1] ?? NaN);
  const m = /translate3d\\(([-\\d.]+)px, ([-\\d.]+)px/.exec(t);
  return { bearing, x: m ? Number(m[1]) : NaN, y: m ? Number(m[2]) : NaN };
})()`;

async function walk(session) {
  const t0 = Date.now();
  const camera = [];
  let next_sample = 0;
  const shot_at = is_debug ? [1000, 5000, 9500] : [];
  const point = (id, x, y) => ({ x: Math.round(x), y: Math.round(y), id, radiusX: 8, radiusY: 8, force: 1 });
  const stickAt = (t) => {
    /* Forward, curving slowly: the heading turns 120° over the walk so the
       ground under the camera keeps changing instead of retracing one line. */
    const a = -Math.PI / 2 + (t / WALK_MS) * (Math.PI * 2 / 3);
    return point(1, STICK.x + Math.cos(a) * THROW, STICK.y + Math.sin(a) * THROW);
  };
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point(1, STICK.x, STICK.y)] }, session);
  let is_swing = false;
  for (;;) {
    const t = Date.now() - t0;
    if (t >= WALK_MS) break;
    if (shot_at.length && t >= shot_at[0]) {
      const at = shot_at.shift();
      const shot = await send("Page.captureScreenshot", { format: "png" }, session);
      writeFileSync(join(tmpdir(), `bench-frame-walk-${at}.png`), Buffer.from(shot.data, "base64"));
    }
    if (t >= next_sample) {
      next_sample += 500;
      camera.push(await evaluate(session, CAMERA));
    }
    const touch = [stickAt(t)];
    if (t >= 2000 && t < 8000) {
      /* One swing right and back: 160 px each way ≈ 110° of bearing. */
      const k = (t - 2000) / 6000;
      const dx = (k < 0.5 ? k * 2 : (1 - k) * 2) * -160;
      touch.push(point(2, SWING.x + dx, SWING.y));
      if (!is_swing) {
        is_swing = true;
        await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: touch }, session);
        await sleep(16);
        continue;
      }
    } else if (is_swing) {
      is_swing = false;
      /* Lifting one finger: the protocol releases whichever point is missing. */
    }
    await send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: touch }, session);
    await sleep(16);
  }
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }, session);
  camera.push(await evaluate(session, CAMERA));
  /* Travel is summed step by step, because the anchor re-centres the
     translate every 2,048 px; a step that big is an anchor jump, not travel. */
  let travel_px = 0;
  for (let i = 1; i < camera.length; i += 1) {
    const d = Math.hypot(camera[i].x - camera[i - 1].x, camera[i].y - camera[i - 1].y);
    if (Number.isFinite(d) && d < 1000) travel_px += d;
  }
  const bearing = camera.map((c) => c.bearing).filter(Number.isFinite);
  return {
    travel_px: Math.round(travel_px),
    bearing_swing_degree: bearing.length ? Math.round(Math.max(...bearing) - Math.min(...bearing)) : 0,
  };
}

/* ── the trace summariser ─────────────────────────────────────────────── */

async function readStream(session, handle) {
  let text = "";
  for (;;) {
    const chunk = await send("IO.read", { handle, size: 1 << 20 }, session);
    text += chunk.base64Encoded ? Buffer.from(chunk.data, "base64").toString("utf8") : chunk.data;
    if (chunk.eof) break;
  }
  await send("IO.close", { handle }, session);
  return text;
}

/** Total main-thread time per timeline event, children subtracted (self time). */
function traceTop(trace) {
  const event = (trace.traceEvents ?? trace).filter((e) => e.ph === "X" && typeof e.dur === "number");
  /* The renderer main thread: the one carrying the most `FireAnimationFrame`. */
  const count = new Map();
  for (const e of event) if (e.name === "FireAnimationFrame" || e.name === "Paint") {
    const k = `${e.pid}:${e.tid}`;
    count.set(k, (count.get(k) ?? 0) + 1);
  }
  const main = [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const on_main = event.filter((e) => `${e.pid}:${e.tid}` === main).sort((a, b) => a.ts - b.ts || b.dur - a.dur);
  const self = new Map();
  const stack = [];
  for (const e of on_main) {
    while (stack.length && stack[stack.length - 1].ts + stack[stack.length - 1].dur <= e.ts) stack.pop();
    const parent = stack[stack.length - 1];
    self.set(e.name, (self.get(e.name) ?? 0) + e.dur);
    if (parent) self.set(parent.name, (self.get(parent.name) ?? 0) - e.dur);
    stack.push(e);
  }
  const main_self = [...self.entries()]
    .map(([name, us]) => ({ name, self_ms: Math.round(us / 1000) }))
    .filter((r) => r.self_ms > 0)
    .sort((a, b) => b.self_ms - a.self_ms)
    .slice(0, 25);
  /* Every thread's busy time (top-level slices only), by name: a frame can be
     late on the raster or GPU thread while the main thread idles. */
  const thread_name = new Map();
  for (const e of trace.traceEvents ?? trace) {
    if (e.ph === "M" && e.name === "thread_name") thread_name.set(`${e.pid}:${e.tid}`, e.args?.name ?? "?");
  }
  const busy = new Map();
  const by_thread = new Map();
  for (const e of event) {
    const k = `${e.pid}:${e.tid}`;
    if (!by_thread.has(k)) by_thread.set(k, []);
    by_thread.get(k).push(e);
  }
  for (const [k, list] of by_thread) {
    list.sort((a, b) => a.ts - b.ts);
    let end = -Infinity;
    let total = 0;
    for (const e of list) {
      if (e.ts >= end) { total += e.dur; end = e.ts + e.dur; }
      else if (e.ts + e.dur > end) { total += e.ts + e.dur - end; end = e.ts + e.dur; }
    }
    const name = `${thread_name.get(k) ?? "?"}${k === main ? " (page main)" : ""}`;
    busy.set(name, (busy.get(name) ?? 0) + total);
  }
  const thread_busy = [...busy.entries()]
    .map(([name, us]) => ({ name, busy_ms: Math.round(us / 1000) }))
    .sort((a, b) => b.busy_ms - a.busy_ms)
    .slice(0, 10);
  return { main_self, thread_busy };
}

/** JS self time per function from a CPU profile, top 30. */
function profileTop(profile) {
  const by_id = new Map(profile.nodes.map((n) => [n.id, n]));
  const self = new Map();
  const dt = profile.timeDeltas ?? [];
  for (let i = 0; i < profile.samples.length; i += 1) {
    const node = by_id.get(profile.samples[i]);
    if (!node) continue;
    const f = node.callFrame;
    const file = (f.url || "").split("/").pop();
    const key = `${f.functionName || "(anonymous)"} ${file}:${f.lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (dt[i] ?? 0));
  }
  return [...self.entries()]
    .map(([name, us]) => ({ name, self_ms: Math.round(us / 1000) }))
    .sort((a, b) => b.self_ms - a.self_ms)
    .slice(0, 30);
}

/* ── one run ──────────────────────────────────────────────────────────── */

async function runOnce({ throttle, quality, is_traced }) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId: session } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: HEIGHT, deviceScaleFactor: 2, mobile: true }, session);
  await send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 }, session);
  await send("Browser.grantPermissions", { permissions: ["geolocation"], origin: `http://127.0.0.1:${PORT}` });
  await send("Emulation.setGeolocationOverride", OFF_CAMPUS, session);
  await send("Page.enable", {}, session);
  await send("Performance.enable", { timeDomain: "timeTicks" }, session);
  await send("Page.addScriptToEvaluateOnNewDocument", { source: RECORDER }, session);
  const query = new URLSearchParams({ boot: "off", time: "day", weather: "clear", at: AT });
  /* `none` sends no `?quality=`: the app's own choice, or a build from before
     tiers existed (the "before" numbers). */
  if (quality && quality !== "none") query.set("quality", quality);
  /* `--query "zoom=19&bearing=40"`: any other view parameter, e.g. to bench
     the pulled-back camera, where far more of the campus is on the glass. */
  const extra = arg("query", null);
  if (typeof extra === "string") for (const [k, v] of new URLSearchParams(extra)) query.set(k, v);
  const url = `http://127.0.0.1:${PORT}/?${query}`;
  await send("Page.navigate", { url }, session);
  await sleep(4000);
  for (let i = 0; i < 4; i += 1) {
    await evaluate(session, DISMISS);
    await sleep(400);
  }
  /* The throttle goes on AFTER load: this measures walking, not booting. */
  await send("Emulation.setCPUThrottlingRate", { rate: throttle }, session);
  await sleep(SETTLE_MS);
  await evaluate(session, DISMISS);

  const tier_shown = await evaluate(
    session,
    `(document.querySelector("[data-quality-tier]")?.getAttribute("data-quality-tier")) ?? null`,
  );
  const before = metricOf(await send("Performance.getMetrics", {}, session));

  if (is_traced) {
    await send("Profiler.enable", {}, session);
    await send("Profiler.setSamplingInterval", { interval: 200 }, session);
    await send("Profiler.start", {}, session);
    await send("Tracing.start", {
      transferMode: "ReturnAsStream",
      traceConfig: {
        includedCategories: ["devtools.timeline", "disabled-by-default-devtools.timeline", "disabled-by-default-devtools.timeline.frame", "v8", "blink", "cc", "gpu", "viz"],
      },
    }, session);
  }

  await evaluate(session, "window.__bench.start()");
  const check = await walk(session);
  const raw = await evaluate(session, "window.__bench.stop()");
  /* Auto may have measured and switched during the walk; the badge says. */
  const tier_after = await evaluate(
    session,
    `(document.querySelector("[data-quality-tier]")?.textContent) ?? null`,
  );

  let top = null;
  if (is_traced) {
    const done = new Promise((resolve) => {
      const fn = (msg) => {
        if (msg.method === "Tracing.tracingComplete" && msg.sessionId === session) {
          listener.delete(fn);
          resolve(msg.params.stream);
        }
      };
      listener.add(fn);
    });
    await send("Tracing.end", {}, session);
    const handle = await done;
    const trace = JSON.parse(await readStream(session, handle));
    const { profile } = await send("Profiler.stop", {}, session);
    /* Raw files, loadable in DevTools' Performance panel, beside the JSON. */
    const dump = arg("dump", null);
    if (typeof dump === "string") {
      mkdirSync(dump, { recursive: true });
      writeFileSync(join(dump, "trace.json"), JSON.stringify(trace));
      writeFileSync(join(dump, "profile.cpuprofile"), JSON.stringify(profile));
    }
    const t = traceTop(trace);
    top = { thread_busy: t.thread_busy, timeline_self: t.main_self, js_self: profileTop(profile) };
  }

  const after = metricOf(await send("Performance.getMetrics", {}, session));
  const dom_element_count = await evaluate(session, `document.getElementsByTagName("*").length`);
  /* Elements by the kinds that cost the most per frame on this screen. */
  const dom_kind_count = await evaluate(
    session,
    `({ svg: document.getElementsByTagName("svg").length, path: document.getElementsByTagName("path").length, filter_attr: document.querySelectorAll("[filter]").length, model_viewer: document.getElementsByTagName("model-viewer").length })`,
  );
  const shot = await send("Page.captureScreenshot", { format: "png" }, session);
  await send("Emulation.setCPUThrottlingRate", { rate: 1 }, session);
  await send("Target.closeTarget", { targetId });

  const diff = (k) => round1(((after[k] ?? 0) - (before[k] ?? 0)) * 1000);
  return {
    result: {
      throttle,
      quality: quality === "none" ? null : quality,
      tier_shown,
      tier_after,
      /* A valid run walked AND swung; see CAMERA. */
      is_valid: check.travel_px > 200 && check.bearing_swing_degree > 30,
      ...check,
      ...summarise(raw.delta, raw.long),
      ...cameraSteadiness(raw.camera),
      ...(is_raw ? { camera_raw: raw.camera } : {}),
      dom_node_count: after.Nodes ?? null,
      dom_element_count,
      dom_kind_count,
      js_heap_used_mb: round1((after.JSHeapUsedSize ?? 0) / 1048576),
      /* Main-thread time spent over the walk, by phase (ms, throttled clock). */
      script_ms: diff("ScriptDuration"),
      layout_ms: diff("LayoutDuration"),
      recalc_style_ms: diff("RecalcStyleDuration"),
      task_ms: diff("TaskDuration"),
      layout_count: (after.LayoutCount ?? 0) - (before.LayoutCount ?? 0),
      ...(top ? { top } : {}),
    },
    shot: shot.data,
  };
}

/* ── the matrix ───────────────────────────────────────────────────────── */

const out_dir = join(ROOT, "bench");
mkdirSync(out_dir, { recursive: true });
/* The LOCAL date: a Manila evening run is still "today" in the file name. */
const now = new Date();
const date = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
const stem = `frame-${date}${label ? `-${label}` : ""}`;
const out = arg("out", join(out_dir, `${stem}.json`));

const rows = [];
try {
  for (const throttle of throttle_list) {
    for (const quality of quality_list) {
      for (let r = 0; r < run_count; r += 1) {
        const { result, shot } = await runOnce({ throttle, quality, is_traced: false });
        rows.push({ run: r + 1, ...result });
        writeFileSync(join(tmpdir(), `bench-frame-${throttle}x-${quality}-${r + 1}.png`), Buffer.from(shot, "base64"));
        console.log(
          `${throttle}x ${quality.padEnd(4)} (shown: ${result.tier_shown ?? "-"}${result.tier_after && !result.tier_after.startsWith(result.tier_shown === "lite" ? "Lite" : "Full") ? ` → ${result.tier_after}` : ""}${result.is_valid ? "" : " INVALID"} walk ${result.travel_px}px swing ${result.bearing_swing_degree}°)  fps p50 ${result.fps_p50}  p5 ${result.fps_p5}  mean ${result.fps_mean}  long ${result.long_task_count} (${result.long_task_ms_total} ms)  jitter p50/p95 ${result.camera_jitter_p50}/${result.camera_jitter_p95}  nodes ${result.dom_node_count}  heap ${result.js_heap_used_mb} MB`,
        );
      }
    }
  }
  let trace = null;
  if (is_trace) {
    const { result, shot } = await runOnce({ throttle: throttle_list[0], quality: quality_list[0], is_traced: true });
    writeFileSync(join(tmpdir(), `bench-frame-trace.png`), Buffer.from(shot, "base64"));
    trace = { throttle: throttle_list[0], quality: quality_list[0], fps_p50: result.fps_p50, fps_p5: result.fps_p5, ...result.top };
    console.log("thread busy (ms):", trace.thread_busy.map((r) => `${r.name} ${r.busy_ms}`).join(", "));
    console.log("top timeline (self ms):", trace.timeline_self.slice(0, 12).map((r) => `${r.name} ${r.self_ms}`).join(", "));
    console.log("top js (self ms):", trace.js_self.slice(0, 12).map((r) => `${r.name} ${r.self_ms}`).join(" | "));
  }
  /* `--no-build` against a hand-made build still records what the tree was. */
  const commit = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).stdout.trim();
  const dirty = spawnSync("git", ["status", "--porcelain", "--", "src"], { cwd: ROOT, encoding: "utf8" }).stdout.trim() !== "";
  const doc = {
    bench: "play-view frame",
    at: new Date().toISOString(),
    label: label || null,
    /* `--build-of <sha>` when `--dist` serves a build of another commit. */
    commit: typeof arg("build-of", null) === "string" ? arg("build-of", null) : dirty ? `${commit}+dirty` : commit,
    setup: {
      viewport: `${WIDTH}x${HEIGHT}@2x mobile+touch`,
      build: `vite build + vite preview (${dist})`,
      chrome: is_gpu ? "headless=new, GPU" : "headless=new, --disable-gpu (software raster)",
      scene: "?boot=off&time=day&weather=clear&at=STICK_START, geolocation off campus → stick walk",
      script: `${WALK_MS / 1000} s stick walk (heading turns 120°), second finger swings the camera 2–8 s`,
      settle_ms: SETTLE_MS,
      host_cpu: (await import("node:os")).cpus()[0]?.model ?? null,
    },
    result: rows,
    ...(trace ? { trace } : {}),
  };
  writeFileSync(out, `${JSON.stringify(doc, null, 2)}\n`);
  console.log(`→ ${out}`);
} finally {
  ws.close();
  chrome.kill();
  /* The throwaway Chrome profile is tens of MB a run; a bench matrix left
     behind filled a disk once. Chrome may still hold it for a moment. */
  await sleep(500);
  try {
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    /* best effort */
  }
  if (server) {
    /* `shell: true` on Windows puts npx under cmd.exe; kill the tree. */
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill();
  }
}
process.exit(0);
