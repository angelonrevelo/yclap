// render.mjs — every Magisphere PNG, from the vector + sticker sources.
//
//   node script/magi-asset/build-vector.mjs   # first: the SVGs
//   node script/magi-asset/render.mjs         # then: PNGs + marketing pieces
//
// Renders in headless Chrome over the DevTools protocol, at exact pixel sizes
// with a transparent page background, so a lockup PNG has real alpha and a
// poster is exactly 1080x1920. Text on the marketing pieces is live HTML set in
// the vendored Fredoka / Nunito — never an image model's lettering — so every
// word is spelled right and can be edited here.
//
// Outputs:
//   public/brand/icon-192.png, icon-512.png, icon-512-maskable.png   (PWA)
//   ../docs/brand/magisphere/*.png                                   (marketing kit)
//   src/asset/magi/web/*.webp                                        (the app's stickers)
//
// CHROME=<path> overrides the browser. The default prefers Chrome for Testing
// (the house rule: agents never drive the daily Chrome), then falls back to an
// installed Chrome with a throwaway profile, which is all this ever uses.

import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const kit = path.resolve(root, "../docs/brand/magisphere");
mkdirSync(kit, { recursive: true });

const url = (p) => pathToFileURL(path.resolve(root, p)).href;
const brand = (f) => url(`public/brand/magi/${f}`);
const sticker = (f) => url(`src/asset/magi/sticker/${f}.png`);
const icon = (f) => url(`src/asset/magi/icon/${f}.svg`);

const testing = path.join(homedir(), ".agent-browser/browsers");
const chromePath =
  process.env.CHROME ||
  [
    ...(existsSync(testing) ? readdirSync(testing).sort().reverse() : []).flatMap((d) => [
      path.join(testing, d, "chrome.exe"),
      path.join(testing, d, "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"),
    ]),
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
  ].find((p) => existsSync(p));
if (!chromePath) throw new Error("no Chrome found — set CHROME=<path>");

/* ── a tiny CDP driver ──────────────────────────────────────────────────── */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = 9400 + Math.floor(Math.random() * 400);
const profile = mkdtempSync(path.join(tmpdir(), "magi-render-"));
const chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--allow-file-access-from-files", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"]);

let target;
for (let i = 0; i < 60 && !target; i++) {
  await sleep(200);
  try {
    target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === "page");
  } catch {}
}
if (!target) throw new Error("Chrome did not open a debugging target");
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0;
const pending = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) pending.get(d.id)(d.result ?? { error: d.error });
};
const send = (method, params = {}) =>
  new Promise((r) => {
    const id = ++seq;
    pending.set(id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
await send("Page.enable");
await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });

const work = mkdtempSync(path.join(tmpdir(), "magi-page-"));
async function render(outFile, w, h, body, css = "") {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: Fredoka; font-weight: 700; src: url("${url("script/magi-asset/font/Fredoka-Bold.ttf")}"); }
@font-face { font-family: Nunito; font-weight: 800; src: url("${url("script/magi-asset/font/Nunito-ExtraBold.ttf")}"); }
html,body { margin:0; width:${w}px; height:${h}px; overflow:hidden; background:transparent; }
* { box-sizing: border-box; }
.abs { position:absolute; }
.fill { position:absolute; inset:0; width:100%; height:100%; }
.display { font-family: Fredoka, sans-serif; font-weight: 700; }
.body { font-family: Nunito, sans-serif; font-weight: 800; }
.plank { display:inline-block; color:#FFF6DC; background:linear-gradient(180deg,#C06C38,#A8582C); border-radius:18px;
  box-shadow: inset 0 0 0 4px #6B3519, inset 0 6px 0 rgba(255,255,255,.22), 0 0 0 6px #fff, 0 14px 30px rgba(107,53,25,.3);
  text-shadow: 0 2px 0 rgba(107,53,25,.55); }
.card { background:#fff; border-radius:32px; box-shadow: 0 0 0 6px #fff, 0 18px 40px rgba(17,75,47,.18); }
${css}
</style></head><body><div style="position:relative;width:${w}px;height:${h}px">${body}</div></body></html>`;
  const file = path.join(work, "page.html");
  writeFileSync(file, html);
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pathToFileURL(file).href });
  await sleep(900);
  await send("Runtime.evaluate", { expression: "document.fonts.ready.then(() => Promise.all([...document.images].map(i => i.decode().catch(() => 0))))", awaitPromise: true });
  await sleep(150);
  const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
  writeFileSync(outFile, Buffer.from(shot.data, "base64"));
  console.log(`wrote ${path.relative(path.resolve(root, ".."), outFile)}  ${w}x${h}`);
}
const img = (src, style) => `<img src="${src}" style="${style}">`;

/* ── 1 · PWA icons ──────────────────────────────────────────────────────── */

await render(path.join(root, "public/brand/icon-512.png"), 512, 512, img(brand("app-icon.svg"), "width:512px;height:512px"));
await render(path.join(root, "public/brand/icon-192.png"), 192, 192, img(brand("app-icon.svg"), "width:192px;height:192px"));
await render(path.join(root, "public/brand/icon-512-maskable.png"), 512, 512, img(brand("app-icon-maskable.svg"), "width:512px;height:512px"));

/* ── 2 · straight exports of the vector marks (2x, transparent) ─────────── */

for (const [name, w, h] of [
  ["lockup-stacked", 1400, 674],
  ["lockup-stacked-light", 1400, 674],
  ["lockup-horizontal", 1600, 330],
  ["wordmark", 1400, 420],
  ["mark", 960, 680],
  ["app-icon", 1024, 1024],
]) {
  await render(path.join(kit, `${name}.png`), w, h, img(brand(`${name}.svg`), `width:${w}px;height:${h}px;object-fit:contain`));
}
for (const [name, w, h] of [
  ["scene-portrait", 1080, 1920],
  ["scene-landscape", 1920, 1080],
  ["scene-square", 1080, 1080],
  ["scene-banner", 1500, 500],
]) {
  await render(path.join(kit, `${name}.png`), w, h, img(brand(`${name}.svg`), "width:100%;height:100%;object-fit:cover"));
}

/* ── 3 · marketing pieces ───────────────────────────────────────────────── */

const flowers = (spots) =>
  spots.map(([x, y, s]) => img(brand("flower.svg"), `position:absolute;left:${x}px;top:${y}px;width:${s}px`)).join("");

// Portrait poster / story — the "PLAY" sheet, rebuilt from our own parts.
await render(
  path.join(kit, "poster-play.png"),
  1080,
  1920,
  `${img(brand("scene-portrait.svg"), "position:absolute;inset:0;width:1080px;height:1920px")}
  <div class="abs" style="left:0;right:0;top:40px;height:760px;background:radial-gradient(60% 52% at 50% 42%, rgba(255,255,255,.9), rgba(255,255,255,0) 70%)"></div>
  ${img(brand("lockup-stacked.svg"), "position:absolute;left:110px;top:70px;width:860px")}
  <div class="abs display" style="left:0;right:0;top:520px;text-align:center;font-size:190px;line-height:1;color:#114B2F;
    -webkit-text-stroke:0;text-shadow:0 0 0 #fff, 8px 8px 0 #fff, -8px 8px 0 #fff, 8px -8px 0 #fff, -8px -8px 0 #fff, 0 10px 0 #fff, 0 20px 30px rgba(17,75,47,.25)">PLAY</div>
  <div class="abs" style="left:0;right:0;top:735px;text-align:center">
    <span class="plank display" style="font-size:54px;padding:18px 44px;transform:rotate(-2deg)">Explore. Collect. Come back.</span>
  </div>
  ${img(sticker("hiker"), "position:absolute;left:600px;top:1180px;width:430px;transform:rotate(4deg)")}
  ${img(sticker("buddy-trail"), "position:absolute;left:70px;top:1330px;width:420px;transform:rotate(-4deg)")}
  ${img(brand("sparkle.svg"), "position:absolute;left:520px;top:1160px;width:90px")}
  ${img(brand("sparkle.svg"), "position:absolute;left:120px;top:1260px;width:60px")}
  <div class="abs card body" style="left:90px;right:90px;top:900px;padding:34px 44px;text-align:center;font-size:40px;line-height:1.3;color:#114B2F">
    Walk the Ateneo campus forest.<br>Find what is out right now, and grow your buddy.
  </div>
  ${flowers([[40, 1800, 70], [960, 1760, 64], [500, 1840, 54], [880, 1860, 46]])}`,
);

// Square social post — grow your buddy.
{
  const stage = ["stage-seed", "stage-seedling", "stage-sapling", "stage-tree"];
  const label = ["Seed", "Seedling", "Sapling", "Tree"];
  await render(
    path.join(kit, "social-grow.png"),
    1080,
    1080,
    `${img(brand("scene-square.svg"), "position:absolute;inset:0;width:1080px;height:1080px")}
    <div class="abs" style="left:0;right:0;top:0;height:420px;background:radial-gradient(60% 60% at 50% 40%, rgba(255,255,255,.88), rgba(255,255,255,0) 72%)"></div>
    ${img(brand("lockup-horizontal.svg"), "position:absolute;left:150px;top:44px;width:780px")}
    <div class="abs" style="left:0;right:0;top:240px;text-align:center">
      <span class="plank display" style="font-size:60px;padding:14px 48px">Walk. Log. Grow.</span>
    </div>
    <div class="abs card" style="left:50px;right:50px;top:420px;height:430px;display:flex;align-items:flex-end;justify-content:space-around;padding:0 20px 30px">
      ${stage
        .map(
          (s, i) => `<div style="text-align:center">
        ${img(sticker(s), `width:${170 + i * 22}px;display:block;margin:0 auto`)}
        <div class="display" style="font-size:34px;color:#114B2F;margin-top:6px">${label[i]}</div></div>`,
        )
        .join('<div class="display" style="font-size:54px;color:#7CC84A;align-self:center;margin-top:-40px">›</div>')}
    </div>
    <div class="abs" style="left:0;right:0;top:895px;text-align:center">
      <span class="body" style="display:inline-block;padding:16px 36px;border-radius:999px;background:#114B2F;color:#fff;font-size:36px;box-shadow:0 0 0 6px #fff,0 12px 26px rgba(17,75,47,.25)">Every walk on campus grows your Sprout.</span>
    </div>`,
  );
}

// Link preview / Open Graph.
await render(
  path.join(kit, "og-image.png"),
  1200,
  630,
  `${img(brand("scene-landscape.svg"), "position:absolute;inset:0;width:1200px;height:630px;object-fit:cover")}
  <div class="abs" style="left:-80px;top:-40px;width:820px;height:520px;background:radial-gradient(closest-side, rgba(255,255,255,.92), rgba(255,255,255,0))"></div>
  ${img(brand("lockup-stacked.svg"), "position:absolute;left:40px;top:40px;width:620px")}
  <div class="abs body" style="left:70px;top:370px;width:560px;font-size:32px;line-height:1.3;color:#114B2F">
    A student-led field guide to the Ateneo campus forest.
  </div>
  ${img(sticker("buddy-sprout"), "position:absolute;left:700px;top:200px;width:300px;transform:rotate(-5deg)")}
  ${img(sticker("hiker"), "position:absolute;left:930px;top:250px;width:270px;transform:rotate(6deg)")}`,
);

// Cover / banner (Facebook, X, the showcase booth screen header).
await render(
  path.join(kit, "banner-cover.png"),
  1500,
  500,
  `${img(brand("scene-banner.svg"), "position:absolute;inset:0;width:1500px;height:500px")}
  <div class="abs" style="left:300px;top:0;width:900px;height:420px;background:radial-gradient(closest-side, rgba(255,255,255,.9), rgba(255,255,255,0))"></div>
  ${img(brand("lockup-stacked.svg"), "position:absolute;left:430px;top:30px;width:640px")}
  ${img(sticker("buddy-cheer"), "position:absolute;left:70px;top:170px;width:290px")}
  ${img(sticker("buddy-map"), "position:absolute;left:1160px;top:170px;width:290px")}`,
);

// Sticker sheet — every character and icon, for print and chat stickers.
{
  const all = readdirSync(path.join(root, "src/asset/magi/sticker"))
    .filter((f) => f.endsWith(".png"))
    .map((f) => f.replace(/\.png$/, ""));
  const glyph = readdirSync(path.join(root, "src/asset/magi/icon"))
    .filter((f) => f.endsWith(".svg"))
    .map((f) => f.replace(/\.svg$/, ""));
  await render(
    path.join(kit, "sticker-sheet.png"),
    2000,
    1500,
    `<div class="fill" style="background:linear-gradient(180deg,#DFF3FF 0%,#EEF8E7 40%,#E3F3D6 100%)"></div>
    ${img(brand("lockup-horizontal.svg"), "position:absolute;left:60px;top:40px;width:640px")}
    <div class="abs display" style="right:70px;top:70px;font-size:46px;color:#114B2F">Sticker sheet</div>
    <div class="abs" style="left:40px;right:40px;top:200px;bottom:40px;display:flex;flex-direction:column;justify-content:space-evenly">
    <div style="display:flex;flex-wrap:wrap;gap:10px 10px;justify-content:center">
      ${all.map((s) => `<div style="width:300px;text-align:center">${img(sticker(s), "width:290px")}<div class="body" style="font-size:20px;color:#11646C">${s}</div></div>`).join("")}
    </div>
    <div class="card" style="margin:0 20px;height:230px;display:flex;align-items:center;justify-content:space-around;padding:0 20px">
      ${glyph.map((s) => `<div style="text-align:center">${img(icon(s), "width:110px")}<div class="body" style="font-size:18px;color:#11646C">${s}</div></div>`).join("")}
    </div>
    </div>`,
  );
}

// Brand sheet — the palette, the type, the lockups, on one page for the team.
{
  const swatch = [
    ["Forest", "#114B2F"], ["Teal", "#11646C"], ["Lagoon", "#279CAD"], ["Leaf", "#3E9A4A"],
    ["Sprout", "#7CC84A"], ["Lime", "#C8E88C"], ["Sky", "#AADCFC"], ["Blue", "#2F80D8"],
    ["Sun", "#F5C842"], ["Sparkle", "#F59A23"], ["Cream", "#FFF6DC"], ["Wood", "#A8582C"],
  ];
  await render(
    path.join(kit, "brand-sheet.png"),
    1800,
    1200,
    `<div class="fill" style="background:#F6FBF1"></div>
    ${img(brand("lockup-stacked.svg"), "position:absolute;left:60px;top:40px;width:640px")}
    ${img(brand("mark.svg"), "position:absolute;left:760px;top:70px;width:260px")}
    ${img(brand("app-icon.svg"), "position:absolute;left:1070px;top:60px;width:200px;height:200px")}
    <div class="abs" style="left:1330px;top:40px;width:420px;height:300px;border-radius:28px;overflow:hidden;background:#114B2F">
      ${img(brand("lockup-stacked-light.svg"), "position:absolute;left:20px;top:30px;width:380px")}</div>
    <div class="abs display" style="left:60px;top:400px;font-size:30px;color:#114B2F">Palette</div>
    <div class="abs" style="left:60px;top:450px;right:60px;display:grid;grid-template-columns:repeat(6,1fr);gap:18px">
      ${swatch
        .map(
          ([n, h]) => `<div style="border-radius:22px;overflow:hidden;box-shadow:0 0 0 4px #fff,0 8px 18px rgba(17,75,47,.14)">
          <div style="height:110px;background:${h}"></div>
          <div class="body" style="background:#fff;padding:10px 14px;font-size:20px;color:#114B2F">${n}<br><span style="color:#5a7a68;font-size:18px">${h}</span></div></div>`,
        )
        .join("")}
    </div>
    <div class="abs display" style="left:60px;top:900px;font-size:30px;color:#114B2F">Type</div>
    <div class="abs display" style="left:60px;top:950px;font-size:84px;color:#114B2F">Fredoka Bold — headlines</div>
    <div class="abs body" style="left:60px;top:1060px;font-size:40px;color:#11646C">Nunito ExtraBold — taglines and labels. Rediscovering home.</div>
    ${img(sticker("buddy-sprout"), "position:absolute;right:50px;bottom:30px;width:260px")}`,
  );
}

/* ── 4 · the app's sticker copies ───────────────────────────────────────── */

// src/asset/kit.ts ships these, not the 1024 px masters: each sticker trimmed to
// its ink, fit into 384 px and centred on a transparent 400 px square, WebP.
// Encoded in the page (canvas → WebP keeps the alpha a screenshot would not).
{
  const web = path.join(root, "src/asset/magi/web");
  mkdirSync(web, { recursive: true });
  const blank = path.join(work, "blank.html");
  writeFileSync(blank, "<!doctype html>");
  for (const f of readdirSync(path.join(root, "src/asset/magi/sticker")).filter((f) => f.endsWith(".png"))) {
    await send("Page.navigate", { url: pathToFileURL(blank).href });
    await sleep(100);
    const { result } = await send("Runtime.evaluate", {
      expression: `(async () => {
        const im = new Image(); im.src = ${JSON.stringify(sticker(f.replace(/\.png$/, "")))}; await im.decode();
        const a = new OffscreenCanvas(im.width, im.height).getContext("2d"); a.drawImage(im, 0, 0);
        const px = a.getImageData(0, 0, im.width, im.height).data;
        let x0 = im.width, y0 = im.height, x1 = -1, y1 = -1;
        for (let y = 0; y < im.height; y++) for (let x = 0; x < im.width; x++)
          if (px[(y * im.width + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
        const w = x1 - x0 + 1, h = y1 - y0 + 1, s = 384 / Math.max(w, h);
        const dw = Math.round(w * s), dh = Math.round(h * s);
        const c = document.createElement("canvas"); c.width = c.height = 400;
        const g = c.getContext("2d"); g.imageSmoothingQuality = "high";
        g.drawImage(im, x0, y0, w, h, Math.floor((400 - dw) / 2), Math.floor((400 - dh) / 2), dw, dh);
        return c.toDataURL("image/webp", 0.9).split(",")[1];
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    const out = path.join(web, f.replace(/\.png$/, ".webp"));
    writeFileSync(out, Buffer.from(result.value, "base64"));
    console.log(`wrote ${path.relative(path.resolve(root, ".."), out)}  400x400`);
  }
}

ws.close();
chrome.kill();
await sleep(300);
try {
  rmSync(work, { recursive: true, force: true });
  rmSync(profile, { recursive: true, force: true });
} catch {}
process.exit(0);
