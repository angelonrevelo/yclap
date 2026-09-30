/**
 * Screenshot a route at an EXACT viewport, via the DevTools protocol.
 *
 * `chrome --headless --window-size=390,844 --screenshot` does not give you a
 * 390 px viewport on Windows: the window is clamped to a ~500 px minimum and
 * the page renders at 500, then the capture is scaled. That is not a cosmetic
 * difference — it silently invalidates every "390 px, no horizontal overflow"
 * check in the roadmap, and it made correctly-placed map labels look like they
 * were clipping when the app was fine.
 *
 * `Emulation.setDeviceMetricsOverride` sets the viewport directly and ignores
 * the window entirely, so 390 means 390.
 *
 * Usage: node script/shot.mjs <url> <out.png> [width] [height] [wait_ms]
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [, , url, out, width = "390", height = "844", wait = "3500"] = process.argv;
if (!url || !out) {
  console.error("usage: node script/shot.mjs <url> <out.png> [width] [height] [wait_ms]");
  process.exit(2);
}

const CHROME = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => existsSync(p));
if (!CHROME) { console.error("no chrome found"); process.exit(1); }

const port = 9222 + Math.floor(Math.random() * 500);
const profile = mkdtempSync(join(tmpdir(), "shot-"));
const chrome = spawn(CHROME, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function endpoint() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return (await res.json()).webSocketDebuggerUrl;
    } catch { /* not up yet */ }
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
  if (slot) { pending.delete(msg.id); slot(msg.result ?? {}); }
};
const send = (method, params = {}, sessionId) =>
  new Promise((resolve) => {
    const id = (next_id += 1);
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

const { targetId } = await send("Target.createTarget", { url: "about:blank" });
const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });

await send("Emulation.setDeviceMetricsOverride", {
  width: Number(width),
  height: Number(height),
  deviceScaleFactor: 2,
  mobile: Number(width) < 700,
}, sessionId);
await send("Page.enable", {}, sessionId);
await send("Page.navigate", { url }, sessionId);
await sleep(Number(wait));

const shot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log(`${out}  ${width}x${height}`);

ws.close();
chrome.kill();
/* Each profile is ~90 MB. Left behind, a day of lanes taking screenshots
   filled a 476 GB disk on 10-01. Chrome holds it for a moment after the kill. */
await sleep(1500);
try {
  rmSync(profile, { recursive: true, force: true });
} catch {
  /* still locked; the OS temp sweep will get it */
}
process.exit(0);
