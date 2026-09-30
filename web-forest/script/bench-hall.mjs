/**
 * Measure how smoothly one phone draws another phone's walker — the 09-30
 * note's jitter (`0:56`–`1:21`), end to end through a real hall.
 *
 * Two isolated browser contexts are two players. Phone A walks east with the
 * keyboard (the stick's own `play` source); phone B records where A's walker
 * is DRAWN on its screen every animation frame. Two scenarios:
 *
 *   still — B stands still while A walks. A steady walk should move across B's
 *           screen at a steady speed.
 *   both  — B walks beside A. B's camera follows B, so A should hold still on
 *           B's screen; anything it does there is jitter.
 *
 * It needs a dev (or preview) server with a hall behind it:
 *
 *   MAGISPHERE_SYNC_PORT=8795 npx vite --port 4185 --strictPort
 *   node --experimental-strip-types server/sync-server.mjs --port 8795 --db <tmp> --account-db <tmp>
 *   node script/bench-hall.mjs http://127.0.0.1:4185 [out.json]
 *
 * A build before 10-01 needs the one-line `data-remote-walker` attribute
 * added to `remote-walker.tsx` to be measured; it changes nothing else.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [, , base = "http://127.0.0.1:4185", out] = process.argv;
const WALK_MS = 6_000;
/* The showcase hall's own coordinates (PNU, Manila): an off-campus fix, so the
   app switches to the stick by itself, the way it did on 26 September. */
const VENUE = { latitude: 14.5869, longitude: 120.9836, accuracy: 10 };
/* A starts ~32 m west of B and walks east, across B's screen. */
const A_AT = "14.63741,121.07850";
const B_AT = "14.63741,121.07880";

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

const port = 9300 + Math.floor(Math.random() * 400);
/* ~90 MB per run. Left behind, two hundred runs filled the disk on 10-01. */
const profile = mkdtempSync(join(tmpdir(), "hall-"));
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--no-first-run",
    "--no-default-browser-check",
    /* Both pages animate at full rate even though neither is focused. */
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding",
    "--disable-backgrounding-occluded-windows",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function endpoint() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
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
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  const slot = pending.get(msg.id);
  if (slot) {
    pending.delete(msg.id);
    slot(msg);
  }
};
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = (next_id += 1);
    pending.set(id, (msg) => (msg.error ? reject(new Error(`${method}: ${msg.error.message}`)) : resolve(msg.result ?? {})));
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

async function openPhone(at) {
  const { browserContextId } = await send("Target.createBrowserContext");
  const { targetId } = await send("Target.createTarget", { url: "about:blank", browserContextId });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  await send("Browser.grantPermissions", { origin: new URL(base).origin, permissions: ["geolocation"], browserContextId });
  await send("Emulation.setGeolocationOverride", VENUE, sessionId);
  await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true }, sessionId);
  await send("Page.enable", {}, sessionId);
  await send("Runtime.enable", {}, sessionId);
  await send("Page.navigate", { url: `${base}/?boot=off&at=${at}&probe=off` }, sessionId);
  return sessionId;
}

const evaluate = async (sessionId, expression) =>
  (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId)).result?.value;

const key = (sessionId, type, code, k) =>
  send("Input.dispatchKeyEvent", { type, code, key: k, windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0) }, sessionId);

/* Installed on B: every frame, where is the first remote walker drawn? */
const RECORD = `(() => {
  window.__hall = [];
  const find = () => document.querySelector("[data-remote-walker]");
  const tick = (t) => {
    const el = find();
    /* A map tile is fixed to the ground: how IT moves is the camera, not the walker. */
    const plane = [...document.querySelectorAll("div")].find((d) => d.style.transform.includes("perspective("));
    const m = plane ? /translate3d\\(([-\\d.]+)px/.exec(plane.style.transform) : null;
    const tr = m ? { left: Number(m[1]) } : null;
    if (el) {
      const r = el.getBoundingClientRect();
      window.__hall.push([t, r.left + r.width / 2, r.bottom, tr ? tr.left : null]);
    } else window.__hall.push([t, null, null, tr ? tr.left : null]);
    if (window.__hall_on) requestAnimationFrame(tick);
  };
  window.__hall_on = true;
  requestAnimationFrame(tick);
  return true;
})()`;

function stat(sample, is_still_expected) {
  const row = sample.filter((s) => s[1] !== null);
  const step = [];
  for (let i = 1; i < row.length; i += 1) {
    const dt = row[i][0] - row[i - 1][0];
    if (dt <= 0) continue;
    step.push({ t: row[i][0], dt, dx: row[i][1] - row[i - 1][1], dy: row[i][2] - row[i - 1][2] });
  }
  const speed = step.map((s) => (Math.hypot(s.dx, s.dy) / s.dt) * 1000);
  const mean = speed.reduce((a, b) => a + b, 0) / Math.max(1, speed.length);
  const sd = Math.sqrt(speed.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, speed.length));
  /* A reversal is the drawn walker stepping back against its own last step. */
  let reversal = 0;
  let stall = 0;
  for (let i = 1; i < step.length; i += 1) {
    const a = step[i - 1];
    const b = step[i];
    const la = Math.hypot(a.dx, a.dy);
    const lb = Math.hypot(b.dx, b.dy);
    if (la > 0.2 && lb > 0.2 && (a.dx * b.dx + a.dy * b.dy) / (la * lb) < 0) reversal += 1;
    if (!is_still_expected && la > 0.2 && lb < 0.05) stall += 1;
  }
  /* How far the drawn walker strays from a steady walk: RMS of the residual
     from a straight-line fit of x against time. Per-frame speed is noisy when
     a headless page drops frames; the path itself is not. */
  const n = row.length;
  let fit_rms = null;
  if (n > 2) {
    const mt = row.reduce((a, r) => a + r[0], 0) / n;
    const mx = row.reduce((a, r) => a + r[1], 0) / n;
    const k = row.reduce((a, r) => a + (r[0] - mt) * (r[1] - mx), 0) / Math.max(1e-9, row.reduce((a, r) => a + (r[0] - mt) ** 2, 0));
    fit_rms = Math.sqrt(row.reduce((a, r) => a + (r[1] - (mx + k * (r[0] - mt))) ** 2, 0) / n);
  }
  const xs = row.map((r) => r[1]);
  const ys = row.map((r) => r[2]);
  const spread = (v) => (v.length ? Math.max(...v) - Math.min(...v) : null);
  return {
    frame_count: row.length,
    missing_count: sample.length - row.length,
    speed_px_s_mean: +mean.toFixed(1),
    speed_px_s_sd: +sd.toFixed(1),
    speed_cv: mean > 0 ? +(sd / mean).toFixed(3) : null,
    fit_rms_px: fit_rms === null ? null : +fit_rms.toFixed(2),
    reversal_count: reversal,
    stall_count: stall,
    x_spread_px: spread(xs) === null ? null : +spread(xs).toFixed(1),
    y_spread_px: spread(ys) === null ? null : +spread(ys).toFixed(1),
  };
}

async function scenario(name, a, b, is_b_walking) {
  await evaluate(b, RECORD);
  await key(a, "keyDown", "KeyD", "d");
  if (is_b_walking) await key(b, "keyDown", "KeyD", "d");
  await sleep(WALK_MS);
  await key(a, "keyUp", "KeyD", "d");
  if (is_b_walking) await key(b, "keyUp", "KeyD", "d");
  await sleep(2_500);
  const sample = await evaluate(b, "(() => { window.__hall_on = false; return window.__hall; })()");
  /* Judge only the walk itself: from 2.5 s in (the buffer has filled) to its end. */
  const t0 = sample.length ? sample[0][0] : 0;
  const walk = sample.filter((s) => s[0] - t0 > 2_500 && s[0] - t0 < WALK_MS);
  return { name, ...stat(walk, is_b_walking), ...(process.env.HALL_RAW ? { raw: walk.map((r) => [Math.round(r[0]), r[1] === null ? null : +r[1].toFixed(2), r[3] === null ? null : +r[3].toFixed(2)]) } : {}) };
}

try {
  const a = await openPhone(A_AT);
  const b = await openPhone(B_AT);
  await sleep(9_000);
  /* Both phones land on "You are off campus"; take the stick, as a judge would. */
  for (const s of [a, b]) {
    await evaluate(s, `(() => { const btn = [...document.querySelectorAll("button")].find((x) => /demo walk/i.test(x.textContent)); btn?.click(); return Boolean(btn); })()`);
  }
  await sleep(1_500);
  const seen = await evaluate(b, `document.querySelectorAll("[data-remote-walker]").length`);
  const result = { base, at: new Date().toISOString(), walk_ms: WALK_MS, remote_seen: seen, scenario: [] };
  result.scenario.push(await scenario("still", a, b, false));
  await sleep(3_000);
  result.scenario.push(await scenario("both", a, b, true));
  const text = JSON.stringify(result, null, 2);
  console.log(text);
  if (out) writeFileSync(out, text);
} finally {
  ws.close();
  chrome.kill();
  /* Chrome holds the profile for a moment after the kill. */
  await sleep(1_500);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {
    /* still locked; the OS temp sweep will get it */
  }
}
process.exit(0);
