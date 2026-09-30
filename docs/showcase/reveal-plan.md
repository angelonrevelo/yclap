# Magisphere — grand reveal plan

**Reveal date: about Thursday 15 October 2026.** The owner said "two weeks from now" on 2026-10-01; no venue or exact date is on record yet, so **confirm the date before anything is printed.**

Source asks: Gelo's 09-30 note ([brief](../plaud/2026-09-30-stabilization-edutech-positioning.md)), plus the owner's own ask to cover every edge case, including authority and moderation. Work happens on `reveal-1015`, fed by the lanes `reveal/rig`, `reveal/perf`, `reveal/mod` and `reveal/module`.

The rule for these two weeks is Gelo's own (`5:42`): **fix the bugs, fix the assets, then add.** A module that is half-built at the reveal gets cut, not demoed.

---

## Two weeks

| Days | Goal | Exit check |
|------|------|------------|
| **Oct 1–3** | Stabilise: multiplayer jitter (done 67f856b), limbs, low-end frame rate | Two physical phones walk side by side with no visible jitter. `npm run bench:frame` meets the lite targets |
| **Oct 4–6** | Account for everything: bug reports, moderation, the `/mod` console, the name filter | A report filed on a phone appears in `/mod`. A hidden walker disappears from both phones |
| **Oct 7–9** | Modules: biodiversity hotspots, emergency and DRR (sourced only), one nature trail | Every layer names its source and date. The trail routes end to end |
| **Oct 10** | **Deploy `reveal-1015` to the live URL.** Production has been on the 09-22 bundle since then | `/live/` answers on the live host. `/health` is OK |
| **Oct 11–13** | Playtest on the reveal's own devices: a cheap Windows laptop, an Android mid-ranger, an iPhone on Safari. Fix only what breaks | Stable-Alpha gate below: every row PASS |
| **Oct 14** | Freeze. Rehearse the cue card on the deployed build | Nothing merges after the rehearsal except a one-line fix for a blocker |
| **Oct 15** | Reveal | — |

## Stable-Alpha gate

The 09-30 note asks for acceptance criteria for "Stable Alpha". Each row is PASS/FAIL on the deployed build, not on a laptop's dev server.

| # | Criterion | How it is checked |
|---|-----------|-------------------|
| G1 | Two phones on the hall see each other walk at a steady pace while either one walks and rotates the camera | By hand on two handsets; `multiplayer.test.ts` "09-30 jitter" in CI |
| G2 | No model part floats off its body, at rest or mid-animation | `npm run audit:model` connectivity check = 0 failures (lane `reveal/rig`) |
| G3 | Play view at 4× CPU throttle: p50 ≥ 45 fps and p5 ≥ 30 fps in `lite` | `npm run bench:frame` (lane `reveal/perf`). Device profile: `docs/spec/device-profile.md` |
| G4 | A student can report a problem in under 30 s, offline included | By hand, airplane mode, then reconnect |
| G5 | A moderator can hide a walker and a shared find, and the action is in the audit log | `/mod` by hand; tests in lane `reveal/mod` |
| G6 | Every map layer states its source, and nothing emergency-related is invented | `campus-module` tests; read each layer's source line |
| G7 | Build, typecheck, lint and tests all exit 0 at the tip that is deployed | `npm run build`, `npx tsc --noEmit`, `npx oxlint`, `npm test` |
| G8 | The public URL serves the tip that passed G1–G7 | Compare the bundle hash on the live host with the local `dist/` |

## Positioning

Gelo's line (`2:40`–`2:59`): **not a Roblox look-alike, not a childish game; something the general populace can use.** The judges already accepted the 3D (`4:05`). They asked what else it is for.

**Say:** Magisphere is a campus map that students actually open, because walking it is a game. Once they are there, it teaches what lives on campus, where it is safe to go and how to get out, and where the trails are. The game is the reason to open it; the map is what it is for.

**Lead the demo with a use, then the game.** Start with "Where is the nearest assembly point from here, and what grows on the way?" Then show the hunt and the points as the reason students come back.

**Language to drop from the pitch:** "Pokémon GO clone", "Roblox", "collect them all". **Keep:** walk, notice, record, the campus as it actually is.

**Never claim** (these stand from `ROADMAP.md` NOT DOING): official AIS ranks, an official emergency plan, verified data sent to a university dataset, planted trees.

Brand assets: `docs/brand/magisphere/`. Aleij owns design; the kit is for in-app use, not the printed pubmats.

## KPI

Every KPI must be measurable **without breaking the privacy promise** ("photos and notes never leave this phone"). So each one says where its number comes from, and anything that cannot be measured is marked so rather than estimated.

| KPI | Definition | Source | Status |
|-----|------------|--------|--------|
| Weekly walkers | Distinct `walker_id` heard in the hall in a week | Hall presence (hashed id only) | Measurable once a weekly counter is added to the DO |
| Returning walkers | Walkers heard in two or more distinct weeks | Same | Same |
| Shared finds per week | Sightings synced to the shared world | `campus-world` store | Measurable today |
| Species coverage | Distinct species shared this term ÷ species known from campus (1,098 iNat) | `campus-world` + `species-model.json` | Measurable today |
| Stability | Share of sessions whose frame p5 ≥ 30 fps | `frame-stat` inside a bug report or an opt-in ping | Needs an opt-in; none exists yet |
| Report turnaround | Median hours from a report to resolved | `/mod` audit log | After lane `reveal/mod` |
| Module use | Opens of a trail, the emergency layer, or a hotspot layer | Local count, sent only with consent | Not measured; decide whether to |

No target number is set for any KPI. There is no baseline yet, and a target without one would be invented. Set targets after the first four weeks of real numbers.

## Funding

Gelo (`5:31`–`5:51`): if funding comes, be clear what it buys, and fix first. No funder, amount or date is on record, so this is an order of spend, not a budget.

1. **Stability**: engineering time on multiplayer, frame rate and the asset pipeline. Two test handsets at the low end of the device profile (the bench cannot stand in for a real phone).
2. **Assets**: a designer's time (Aleij) on a human avatar and on reviewing the flagged species models (`lane1.tsv`–`lane5.tsv`).
3. **Running costs**: the Cloudflare Workers paid plan once the hall outgrows the free tier, a domain, and the iNaturalist identify quota if it is ever billed.
4. **Modules, only after 1–3**: time with the university DRRM office / CFMO to get the official emergency map, and trail surveys.

Each line gets a peso figure only when a quote exists. None does yet.

## Maintenance

A student opens it once for a class. The note's worry (`3:13`) is that nobody opens it after that. What keeps it alive:

| Need | Owner | Cadence |
|------|-------|---------|
| Read and resolve reports in `/mod` | A named moderator (not yet named) | Twice a week in term |
| Keep the deploy on a gated tip | Developer of record (Gelo) | Every merge |
| Refresh the species and OSM data | Developer | Once a term |
| Check the emergency layer against the university's plan | DRRM / CFMO contact (not yet agreed) | Once a term, and after any campus change |
| Rotate `MOD_TOKEN` | Developer | When a moderator leaves |

## Edge-case register

The owner's ask is that every edge case is met, from every side. Rows are grouped by who meets the case. **Status** is one of: done (with where), lane (in progress), or **open** (nobody is on it yet). The register grows as playtests find more.

### Student on the map

| Case | Status |
|------|--------|
| Other walkers jitter while you move or turn | done: 67f856b + efda55d, measured by `npm run bench:hall` (1.7–2.4 px RMS vs 36–59 px before) |
| A walker pauses, then steps: drawn as a slow crawl | done — `STEP_MS` |
| Network drops for 5 s mid-walk | done — the walker holds, then resumes forward, never snaps back |
| Phone clock set wrong by hours | done — the sender clock is offset per walker |
| Two phones on one walker code | done — a clock jump restarts the timeline |
| Joining by code teleports a walker across campus | done — snap over `SNAP_M` |
| GPS wobble standing still makes you shuffle on others' screens | done — GPS keeps the 3 m threshold |
| Off campus: the GPS fix is refused | done (09-26) — switches to the stick and says why |
| Cheap laptop or phone lags | done in part: graphics tier + frame fixes (6× CPU 16.6 → 33 fps). **Open:** zoomed-out view at ~4 fps on a mid-range phone profile; real-device check |
| Avatar limbs come apart | done: 128 models fixed at the generator, audit gates every keyframe; hiker prototype behind `?avatar=hiker` for Aleij |
| A player's display name is offensive | done: 040db72, server-side filter on hall, sync and accounts |
| Someone follows or harasses another walker on the map | done: hide / report a walker (040db72), and Settings → "Hide me from the live map" (cfce666). **Open:** who should see whom by default — Q-safety |
| A student under 18 | **open**. The app asks no age. Positions are shared by display name only, but the university's policy on minors in location features is unknown |
| Anyone in the hall could become anyone (raw `player_id` in `/world`) | done: ae2f43d |
| Sharing your code to be a partner handed over your walker | done: ae2f43d, `/partner` answers a `walker_id` |
| A script guesses walker codes | done: 20 wrong codes per address per 10 min |
| Walking side by side, the ground judders on a busy phone | done: camera step flushed in its own frame; `bench:hall` "both" 2.51 px RMS |
| A fresh visit to Settings raises the map's "No position here" card | done: map-only alerts wait for the map; weather warnings still show anywhere |
| Colour-blind player | done (earlier): rarity is readable without colour |
| Reduced-motion preference | done (earlier): animations off |
| Screen reader | **open**. The map is SVG/CSS with few labels; not audited |
| Offline at the venue | partial: the PWA shell and precached models. The hall needs a network |
| Old tab after a deploy | done (09-26): "Update available — reload" |

### Moderator and institution

| Case | Status |
|------|--------|
| No way to see or act on a problem report | done: 040db72 (reports, `/mod`) |
| No way to remove a walker or a find | done: 040db72 (hide walker 1–168 h, hide find, audit log) |
| Moderator token leaks | done: no token (or < 16 chars) means the console is off; rotate by changing the secret. **Open:** one shared token, so the audit log cannot say which moderator acted |
| Who is allowed to be a moderator | **open**: needs a named person and the university's say |
| Data retention for reports | done: 30 days (`docs/spec/moderation.md`) |
| The Worker and the tests are not typechecked (`tsconfig` includes `src/` only) | done for the Worker: `tsconfig.worker.json` is in `npm run build` / `npm run typecheck` and found one real type gap (Durable Object SQLite rows can be BLOBs). **Open:** the tests: a test tsconfig (Node + Workers types, `allowJs`) reports 35 errors, mostly loose fakes; fix after the rig and module lanes merge |
| Lane worktrees share one `.vite` cache and break each other's dev servers | done: `MAGISPHERE_VITE_CACHE` |
| Screenshot and bench runs leave a ~90 MB Chrome profile each and filled the disk | done: `shot.mjs` and `bench-hall.mjs` delete theirs |
| Institution wants its own campus | done: module registry with per-campus config and a trail template (`docs/spec/campus-module.md`) |
| Official emergency data | **blocked** on the DRRM office / CFMO. Until then, OSM-sourced and labelled not official |

### Presenter at the reveal

| Case | Status |
|------|--------|
| Live URL serves an old build | **open until Oct 10 deploy**. Gate G8 |
| Venue wifi blocks WebSockets | done (09-25): falls back to polling. The interpolation delay adapts (3.6 s when polling) |
| Venue wifi is one public IP for every phone | done (09-26): 40 sockets per IP at the edge |
| Projector needs a fixed camera | done: `?zoom=`, `?bearing=`, `?time=`, `?weather=`, `?boot=off` |
| A judge asks "is this official?" | Positioning above: never claim official data |
| On a phone, a route to the nearest clinic is drawn behind the panel | done: a found route closes the panel and flies the map to it |

### Data honesty

| Case | Status |
|------|--------|
| Emergency layer shows an invented assembly point | done: OSM has none on campus and the row says so; tests enforce a source and date on every feature |
| AI note roles read as real assignments | flagged in the brief |
| KPI targets without a baseline | refused above |

### Open questions for the owner

- **Q-date:** exact reveal date and venue.
- **Q-deploy:** OK to deploy `reveal-1015` to the live URL on Oct 10? It replaces the 09-22 bundle anyone has been judging from.
- **Q-safety:** should live positions of named students be visible to everyone in the hall, or only to walking partners? The 09-25 build shows everybody. For a reveal to an institution this is the question most likely to be asked.
- **Q-moderator:** who moderates, and who at the university signs off on the emergency layer?
- **Q-wip:** fold the 09-26 PC work (`wip/pc-demo-0926`: toon look, spawn density 0.62, play zoom 20, HTML splash) into the reveal, or leave the look to Aleij?
