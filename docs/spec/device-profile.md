# Minimum device profile and Stable-Alpha acceptance — Magisphere play view

**Why this exists.** Gelo's 09-30 voice note: "The viewing experience on
lower-end devices, such as a cheap Windows laptop or even the phone browser, is
still not very pleasant. It's still very jittery and laggy" (`1:56`–`2:19`);
"Performance and optimization of the platform. It might be rendering too much
as well" (`2:30`–`2:34`); and a request for a minimum device profile and
acceptance criteria for a "Stable Alpha". This file is that profile and those
criteria. Every number in it comes from a run of `npm run bench:frame` whose
JSON is committed under `web-forest/bench/`.

## 1. Target devices

The bench cannot hold a phone, so it stands a device in with Chrome's CPU
throttle on one fixed host. The two presets are Chrome DevTools' own:
**4× is its "mid-tier mobile"** (and Lighthouse's default mobile throttle),
**6× its "low-end mobile"**. They slow the page's main thread only; the GPU
stays real, which is what a phone or a laptop with working graphics has.

| Class | Example | Stands in as | Tier auto picks |
|---|---|---|---|
| Booth / mid-range phone | Pixel 6a, iPhone 12, Galaxy A54 | 1×–4× | full (measured) |
| **Minimum phone** | Android 10+, 4–8 cores of Cortex-A53/A55 class, 3–4 GB RAM, Chrome 120+ (Galaxy A14, Redmi 12C); iPhone XR / iOS 16+ Safari | **4×** | full, or lite if it measures slow |
| **Minimum laptop** | Windows 10/11, Celeron N4020/N4500 or Athlon Silver (2 cores), 4 GB, Intel UHD 600 class, Chrome/Edge current, hardware acceleration ON | **6×** | lite (small-device hint, or measured) |
| Laptop with graphics blocklisted | same, Chrome falls back to software raster | `--soft` 4× | lite |

Below the minimum (2 GB phones, Android Go, Chrome < 110, hardware acceleration
off *and* a 2-core CPU) the app runs but is not held to these numbers.

Screen: 360×640 CSS px or larger; the bench runs 390×844 at DPR 2.

Host the numbers below were taken on: AMD Ryzen 7 5700X (8 cores), Windows 11,
headless Chrome, shared with other build lanes (so every before/after pair
below was run **interleaved** and compared by median — see §4).

## 2. What is measured

`web-forest/script/bench-frame.mjs`, one run:

1. `vite build`, served by `vite preview` on :4182 (the release bundle, not dev).
2. Headless Chrome, 390×844 @2x, mobile + touch emulation, geolocation set off
   campus so the app hands itself the stick walk (`?boot=off&time=day&weather=clear&at=STICK_START`).
3. CPU throttle applied **after** load (this measures walking, not booting).
4. 10 s scripted walk with the on-screen stick, the heading turning 120°; a
   second finger swings the camera ~110° and back between 2 s and 8 s.
5. Recorded: every `requestAnimationFrame` interval (→ fps p50, and fps p5 =
   1000 / the 95th-percentile frame), every long task > 50 ms, DOM element
   count, JS heap, main-thread script/style/layout time, and the camera's
   position every frame (→ frame-to-frame camera **jitter**: each frame's
   ground speed against the mean of its neighbours; 0.05 = a 5% wobble).
6. A run is **valid** only if the camera actually travelled (> 200 px) and
   swung (> 30°); an invalid run is kept in the JSON and excluded from medians.

`--trace` adds one run with a DevTools timeline and a JS CPU profile and writes
the top costs into the JSON (`--dump <dir>` keeps the raw files for DevTools).

## 3. Stable-Alpha acceptance criteria (play view, walking)

All at the bench above, medians of ≥ 3 valid interleaved runs.

| # | Criterion | Threshold | Status (10-01) |
|---|---|---|---|
| A1 | fps p50, **lite**, 4× | ≥ 45 | 65.8 — met |
| A2 | fps p5, **lite**, 4× | ≥ 30 | 32.8 — met |
| A3 | fps p50, **full**, 4× | ≥ 45 | 65.8 — met |
| A4 | fps p50, auto tier, 6× | ≥ 30 | 33.0 (auto picked lite) — met, barely |
| A5 | Longest task while walking, lite, 4× — the input-latency bound: a tap or stick move waits at most this long before it is handled | ≤ 100 ms (RAIL "response") | 51 ms — met |
| A6 | Camera jitter p95, 4× (ground speed wobble frame to frame) | ≤ 0.15 | lite 0.112, full 0.119 — met |
| A7 | DOM elements on the play view | ≤ 1,000 | 609 — met |
| A8 | JS heap while walking | ≤ 32 MB | 11.1 MB — met |
| A9 | The tier is on screen (`data-quality-tier` badge), auto picks lite on a small-device hint or a slow measurement and says so in a toast, Settings and `?quality=` override | behaviour, `test/quality.test.ts` | met |
| A10 | Checked on a real minimum phone and a real minimum laptop with `?probe=1` (`frame-probe.tsx`), numbers written here | on-device | **not done** |
| A11 | fps p50 at the pulled-back camera (`zoom=19`), 4× | ≥ 30 | **not met: ~4 fps, before and after** |

A5 is a proxy, stated as one: the bench does not measure tap-to-paint
directly. What it does measure bounds it — input is dispatched between tasks,
so no input waits longer than the longest task in front of it.

## 4. Numbers

From `web-forest/bench/frame-2026-10-01.json`: medians of interleaved runs,
**before** = `67f856b` (built into `dist-before`), **after** = this change.
fps p5 is 1000 / the 95th-percentile frame. Jitter is p50 / p95.

| Arm | n | fps p50 | fps p5 | fps mean | long tasks (total, max) | jitter | DOM elements | heap |
|---|---|---|---|---|---|---|---|---|
| before, 4× | 3 | 64.9 | 21.8 | 37.3 | 0 (0 ms) | 0.064 / 0.464 | 739 | 8.8 MB |
| after full, 4× | 3 | 65.8 | 22.1 | 44.8 | 1 (84 ms, max 64) | 0.014 / 0.119 | 625 | 13.6 MB |
| after lite, 4× | 3 | 65.8 | **32.8** | **52.1** | 1 (51 ms, max 51) | **0.010 / 0.112** | 609 | 11.1 MB |
| before, 6× | 3 | 16.6 | 8.3 | 16.6 | 23 (1,512 ms, max 121) | 0.071 / 0.484 | 744 | 10.4 MB |
| after full, 6× | 3 | **33.0** | **16.4** | 28.5 | 16 (1,044 ms, max 86) | 0.053 / 0.238 | 595 | 11.2 MB |
| after lite, 6× | 3 | **33.0** | 13.2 | 29.5 | 9 (635 ms, max 102) | 0.052 / 0.227 | 609 | 9.4 MB |
| before, soft 4× | 2 | 20.0 | 12.0 | 24.1 | 1 (71 ms) | 0.067 / 0.589 | 736 | 9.8 MB |
| after full, soft 4× | 2 | 30.0 | 13.5 | 26.6 | 2.5 (141 ms) | 0.033 / 0.148 | 625 | 13.1 MB |
| after lite, soft 4× | 2 | 25.0 | 12.0 | 24.1 | 2.5 (150 ms) | 0.047 / 0.166 | 604 | 11.1 MB |

What this says, plainly:

- **The low-end laptop stand-in (6×) doubled**: 16.6 → 33 fps p50, and long
  tasks roughly halved. This is the case Gelo described.
- **Jitter is the biggest win**: the camera's frame-to-frame wobble at p95 fell
  from ~0.46 to ~0.11 at 4×. That is the "jittery" in the voice note.
- **At 4× the before build's p50 median is misleading**: its three runs were
  33, 64.9 and 65.4 fps; p5 and mean (21.8, 37.3) are the steadier read.
- **Lite vs full barely differs at 6×**: the main thread, not the flora, is
  the ceiling there (React render + commit ~50% of the profile). The next
  win is fewer re-renders per camera frame, not fewer trees.
- **Software raster** (graphics blocklisted) improved less, and lite is not
  faster than full there. Paint cost dominates and the tier does not cut it.
- **The pulled-back camera (`zoom=19`) is not fixed**: at 4× every run, before
  and after, fell to ~4 fps and walked < 130 px (invalid). At 1× it is ~22
  fps. Far more campus is on the glass; this is the open item for Stable Alpha.
- The host was shared with other lanes throughout; single runs moved by up to
  30 fps. Only the interleaved medians above are claims.

## 5. How to run

```
cd web-forest
npm run bench:frame                                  # build, then 4× and 6×, lite and full
node script/bench-frame.mjs --throttle 4 --quality lite --run 3
node script/bench-frame.mjs --quality none           # the app's own (auto) choice
node script/bench-frame.mjs --query "zoom=19"        # the pulled-back camera
node script/bench-frame.mjs --soft                   # software raster
node script/bench-frame.mjs --trace --dump ../tmp    # where the time goes

# before/after on a shared machine: build the old commit elsewhere, interleave
git checkout <old> -- src && npx vite build --outDir dist-before && git checkout HEAD -- src
node script/bench-frame.mjs --no-build --dist dist-before --build-of <old> --quality none --out a.json
node script/bench-frame.mjs --no-build --out b.json
node script/bench-merge.mjs bench/frame-<date>.json before=a.json after=b.json
```

Port 4182 must be free: the bench refuses to measure a server it did not
start. On a phone: open the play view with `?probe=1` for the on-screen frame
readout, and `?quality=lite|full` to pin a tier.
