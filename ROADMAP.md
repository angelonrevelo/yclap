# Magisphere roadmap

Live app: https://yclap-field-guide.marangelonrevelo.workers.dev

This roadmap describes what Magisphere **has today**, what is still needed before the showcase (moved to Saturday 26 September), and what remains out of scope. It tracks Angelo's Working Doc project direction ([YCLAP 2026] Working Doc) as the product plan.

For older rejected ideas (carbon product, second recycling app, and similar), see [`docs/roadmap-rejected.md`](docs/roadmap-rejected.md).

---

## North star (what ships now)

**Magisphere** helps Ateneo students notice, learn, and personally record campus-forest biodiversity on Loyola Heights, with honest sourcing and no fake claims.

### Four tabs

| Tab | What it does |
|-----|----------------|
| **Home** | The play map at street level (z22): player card (level, points, weekly streak), daily-hunt quest card, bottom tab bar with a raised Go. The trainer sheet holds challenges and the local demo leaderboard |
| **Map** | Explore nearby finds / spawns, Demo campus for off-site demos, species cards with 3D, optional camera log, Open in Seek |
| **Journal** | Personal finds on this device, points + streak + challenges + Biodiversity Buddy, optional photos, collection / badge shelf. Local observation statuses. Private device journal |
| **Settings** *(was Plan)* | Five tabbed tables: why this exists, your walker, preferences, the stage ladder (**alpha**), and the offices we are asking — each marked NOT YET, because none have agreed. `/plan` still resolves here and the full Youth CLAP plan is folded in under Path |

### What is in the product today

- **Demo campus** so the walk works at Zoom / PNU hall without being on Katipunan
- **Finds / spawns** in eligible areas (restricted zones stay off-limits)
- **3D models** on species cards (offline-aware where precached)
- **Personal journal** on the device (local storage). Optional photo
- **Points economy** (Explore 10, Learn 10, Observe 25, Local verified discovery 50) on real actions, persisted in localStorage
- **Weekly streak** (participation this week, not daily)
- **Local demo leaderboard** (seeded cohort + device user). Labelled as demo/local, not official AIS ranks
- **Challenges** (discover N species / explore N areas) with progress
- **Biodiversity Buddy** growth stages tied to weekly participation
- **Local journal statuses** Verified / Needs ID / Duplicate (device-only; no AIS dataset update claim)
- **Badges / collection** as personal progress
- **Seek link** for identification help. Magisphere does not run in-app species ML
- **Honest sourcing**: labelled figures, gaps stated when a story or geo file is missing

---

## Showcase clock

**Saturday 26 September 2026. PNU Innovation Showcase** (PNU Gymnasium, Manila).

Moved from 12 September by the CCC for weather (advisory relayed in the Ateneo CCC YCLAP chat, 2026-09-09); the new date is **subject to CCC final confirmation**. Team plan for the two extra weeks: improve the website. Pitch is 8 minutes with 2–3 presenters. Intel: [`docs/showcase/vault-intel-2026-09-14.md`](docs/showcase/vault-intel-2026-09-14.md).

Live link for demos: https://yclap-field-guide.marangelonrevelo.workers.dev

Suggested Ma'am walkthrough: Home (points + local leaderboard), then Map with Demo campus on, open a species card (Learn), log one find (Observe / Local verified), open Journal (streak + Buddy + challenges). Say clearly: personal journal and local statuses, not an official validated AIS dataset.

---

## DONE (actually shipped)

| Area | What landed |
|------|-------------|
| Product name | **Magisphere** in shell, manifest, and headers |
| Four surfaces | Home, Map, Journal, Plan |
| Demo campus | Off-campus walk without granting geolocation |
| Map walk | Nearby finds, restricted hatch, filters, path / sector layers labelled honestly |
| Species pack + 3D | Large curated model pack, taxon marks, rarity readable without colour alone |
| Camera + log | Live capture or file picker, save to journal with or without photo |
| Journal + badges | Device-local finds, personal summary, badge shelf that only claims journal facts |
| Seek pathway | Open in Seek. No claim that Magisphere identified the species for you |
| Offline shell | Service worker / PWA shell for stage wifi risk (handset install still to prove) |
| Showcase docs | Deck and concept note under `docs/showcase/` with measured figures only |
| Points + streak (P0) | Working Doc values on explore / learn / observe / local verified; weekly streak; Home + Journal surfaces |
| Local leaderboard (P0) | Seeded demo cohort + device user; explicit demo/local labelling |
| Challenges + Buddy (P1) | Optional goals with progress; Buddy stages from weekly participation |
| Local obs statuses (P2 scaffold) | Verified / Needs ID / Duplicate as journal labels only |
| Game UI | chess.com design system across every surface (dark charcoal, green primary with chess.com's full inset lighting, Go as a pressable key, Nunito) with the Magisphere Sprout as the walker and avatar; trainer level shown from points; Dex as numbered collectible cards. A light poster chrome was tried 09-23 and rolled back 09-24. See `web-forest/README.md` § Look and feel |
| Illustrated icon set | 26 full-colour chess.com-style game and kit icons (Go, Dex, Nearby, Plan, streak, trophy, points, quest, lock, and every kit icon) plus the Settings art, generated and keyed to RGBA. Regeneration in `web-forest/script/icon/` |
| Magisphere asset kit | Sprout buddy + explorer + four stage stickers (codex, palette-locked; the stages are the in-app walker), vector mark / wordmark / lockups / app icon / scenes / 12 print icons, and a rendered marketing kit (poster, social, OG, banner, sticker + brand sheets). `docs/brand/magisphere/` |
| Street-level play camera | Play map opens at z22, so a street fills the phone screen |

Older cohort desk work (canvas, rubrics, worksheets) remains in `docs/`. It is program support, not Magisphere app features.

---

## IN PROGRESS (toward Working Doc plan)

Angelo overruled the prior "NOT DOING gamification" stance for Magisphere. These rows track the Working Doc mechanics as they land.

| Item | Status | Notes |
|------|--------|-------|
| **Points economy** | Shipped on-device (P0) | Explore / Learn / Observe / Local verified discovery. Values from Working Doc; still subject to testing |
| **Weekly streak** | Shipped on-device (P0) | Week participation, not daily visits |
| **Home + Journal surfaces** | Shipped (P0) | Points + streak on both; Journal also shows challenges + Buddy |
| **Local demo leaderboard** | Shipped (P0) | Demo cohort only. Do not present as official AIS ranks |
| **Challenges** | Shipped basic (P1) | Discover 2 species / Explore 2 areas. 09-09 wants a **daily hunt** (one tree + sector hint), not just these counters |
| **Biodiversity Buddy** | Shipped basic (P1) | Seedling → Sprout → Young Tree → Mature Tree from weekly streak. Art can stay simple placeholders |
| **Local observation statuses** | Scaffold (P2) | Device journal labels only. No human reviewer queue; no "updates AIS dataset" claim |
| **Group streak** | Shipped (P1) | 09-09 Sophie / Ivan (`1:34:05`), Working Doc "Note to Gelo", 09-21 (`35:37`). Group week is alive if ANY member walks it. `friend.ts`. A streak, never a total — a total is a leaderboard |
| **Friends system** | Shipped, one-sided (P1) | 09-21 (`29:17`). Local roster, add by six-character walker code. Nobody is notified; the card says so. A mutual graph waits on the consent/retention decision the Working Doc still lists as open |
| **Streak as a flame on the buddy** | Shipped (P1) | 09-21 (`38:13`, `40:00`). Hotter, not bigger; never overlaps the plant; always numbered. `streak-heat.ts` pins the rule, `friend.test.ts` asserts it |
| **09-09 play layer (Home HUD, daily hunt, anti-spam)** | Shipped on-device (P0) | GO Home, daily hunt card, Hunt 40 > Observe 25, `observe:${code}:${sector}` anti-spam, quiet-sector spawn bias |
| **3D buildings (skyline)** | Shipped as shadow (P1) | 75 curated footprints + real heights imported from sisia. Drawn as footprint + soft drop. Full prisms exist behind `?skyline=solid\|hollow` but cannot depth-sort against in-plane paths, so they are not the default. Sports grounds excluded — a pitch is ground |
| **GO camera (locked, banded zoom)** | Shipped (P0) | Welded to the walker; drag rotates, never pans off. z19–z22 only in play. Field view keeps the campus diagram |
| **Thumbstick (venue demo)** | Shipped (P0) | 26 Sep is in a hall with no campus trees. Drives the same `play` source as WASD under the same walkability rules. Tagged `source: "play"`, never presented as GPS |
| **Near-field spawns** | Shipped (P0) | Dense field on a campus-fixed grid around the walker, unioned with the campus-wide world further out. Walking finds dice already cast, so two phones still agree |
| **Off-campus fix falls back to the stick** | Shipped (P0) | A playtest at the venue's own coordinates found the one case the stick exists for was the one that fell through: a clean fix a few km away kept the app in GPS mode, hid the stick and showed an empty screen. It now switches itself and says why |
| **Continuous zoom + pinch** | Shipped (P0) | Fractional zoom ported from `tripi` — tile grid stays integer, the fraction rides a CSS scale, a frame loop eases toward a goal. Two fingers pinch AND rotate; before, they only rotated, so a phone could not zoom at all |
| **Stick pace decoupled from the walk** | Shipped (P0) | The stick moved at `WALK_PACE_MS` (1.3 m/s), which is a claim the app prints and useless as a control. It now traverses a fraction of the visible ground per second, and the throttle IS the speed — speed used to live on Shift, which a phone has not got |
| **Haptics** | Shipped (P1) | Second, eyes-free confirmation channel on the stick, on a find in reach, and on points. Honest that iOS Safari has no `navigator.vibrate` at all, so nothing is ever only haptic |
| **Ground rings lie flat** | Fixed (P1) | The reach radius was a hand-squashed `<ellipse>` inside a plane the browser already tilts — foreshortened twice, and axis-aligned, so rotating the camera stood it on edge. Plain circles now; the plane's own transform does it |
| **Blindbox / cosmetic reveals** | Partial | Stage cosmetics already exist; not the Working Doc blindbox product yet |

---

## NEXT (before 26 September)

Demo-critical work first.

| Item | Why it matters | Owner note |
|------|----------------|------------|
| **Handset proof** | PWA has not been proven on a real phone (HTTPS / secure context for SW, geo, camera). Runbook: `web-forest/script/handset.md` | Prove install + Map + one journal save + points toast on a physical handset |
| **Ateneo eagle QR on Canva** | Boards must use the Ateneo QR generator (`go.ateneo.edu/QRcode`) in the "a" / eagle style, pointing at the live Magisphere URL. Not a generic QR | Confirm Canva / Intermatrix materials |
| **Ma'am demo script** | Short path: Home (points + local board) → Demo campus Map → Learn card → one log → Journal | One page or slide cue card |
| **09-09 play layer (P0)** | Showcase demo behaviors from the 09-09 Plaud | Shipped on-device — see **2026-09-12**. Handset / QR still open |
| **Final deck + concept note to CCC by 23 Sep** | Deadline moved with the showcase (Anna Oposa, Youth CLAP Innovators Telegram GC). Email to partnershipsandcampaign@climate.gov.ph. Follow CCC's six-part elevator-pitch guide | Ivan finishing slides + script workspace |
| **AIS tree inventory export** | Ms. Shenina (Ateneo CCC YCLAP chat, 09-14): request the export from AIS (campus flora / arboretum pages). Unblocks real geo on the map | Request, then map import |
| **Reference-link appendix** | Ms. Shenina (09-14): one appendix of every reference link, uploaded to the shared Drive | Anyone; repo sources already cite most links |
| **Feature list at a glance** | Feeds the pre/post-test GForm, the booth "museum of features" walls, and the 30-second feature video (team chat, 09-09) | Website group |
| **Heat layer: not from AIS** | AIS has no campus land-surface-temperature layer; it would need QGIS from satellite imagery. Not a showcase blocker | Decide in or out |
| **Demo-critical fixes only** | Bugs that would break the hall demo (blank 3D, Demo campus off by default, broken journal save, points not awarding). No unrelated feature expansion | Triage ruthlessly |

---

## BLOCKED on partners

These are not missing app features. They wait on people outside the build.

| Need | Blocker |
|------|---------|
| Real tree / species geo on the map | **AIS** inventory / permitted geo share. Until then, finds stay labelled as demo / curated placements, not a surveyed pin set |
| Authoritative walkable path graph | **ADMUNAV** authors / graph share. Current paths are labelled from public map sources, not claimed as ADMUNAV |
| Landmark oral history | Interview or dated photo from older batches / Ateneo Wild. Card ships with the gap stated rather than inventing a story |
| Official verification → campus dataset | Named human reviewer(s) and AIS authority. App statuses stay local until that exists |

Also still hoped for later (not showcase blockers): CFMO walkable vs restricted clarity, CCC / Manila Observatory climate content where we can source it honestly.

---

## NOT DOING / still rejected

Do not re-open these as Magisphere product rows. Full log: [`docs/roadmap-rejected.md`](docs/roadmap-rejected.md).

Gamification rows that used to sit here (points, streaks, Buddy, local leaderboard) were moved to **IN PROGRESS** after Angelo's Working Doc direction was reinstated for the showcase. The constraints below still apply.

| Idea | One-line reason |
|------|-----------------|
| **Official AIS ranks / campus-wide competitive ladder** | Local demo cohort only. Never claim Magisphere is AIS's ranking system |
| **Human verifier → official dataset (as a shipped claim)** | App logs stay on-device. Statuses are local journal labels until partners own validation |
| **Planting promise / canopy increase as the site's claim** | Formation and awareness first. The site does not claim it plants trees or raises canopy cover |
| **Prize budget / sponsored XP store** | No commerce; no invented prize pool |

Other long-standing refusals (carbon product, blue-carbon credits, second recycling app, rebuild Seek CV, claim AIS 1,809 as "our" baseline, and more) stay in the rejected log.

---

## 2026-09-12 — 09-09 Plaud play layer

Source: [`docs/plaud/2026-09-09-gamified-map-pitch-showcase.md`](docs/plaud/2026-09-09-gamified-map-pitch-showcase.md). Behaviors, not test names. Appended after the 09-09 recording; does not rewrite the Showcase clock or delete handset / QR rows above.

Room decisions that still stand: omit “round opens”; same map for discovery + challenge; open world always on; algorithm prefers under-explored areas; showcase stays public; planting is a **pitch-objective** line only, not a site claim.

### P0 — Showcase demo

| Behavior | Surface | Tier 3 | Status |
|----------|---------|--------|--------|
| GO-like Home HUD, minimal copy | `/` | PASS iff Home primary CTA is GO / Walk and the essay hero is gone | Shipped — circular GO; essay hero removed |
| Daily hunt (one tree + sector hint) | Home + Map | PASS iff a daily card names one species and one area | Shipped — `dailyTaskFor` + Home / Map hunt chip |
| Challenge weighs more than observe | `POINT_VALUE` | PASS iff `POINT_VALUE.challenge > POINT_VALUE.observe` | Shipped — Hunt 40; awarded when the daily species is logged |
| Anti-spam: same species + sector does not re-award observe | points events | PASS iff the observe subject key is `observe:${code}:${sector}` | Shipped |
| Local trainer board on Home | `/` | PASS iff the board is visible and labelled demo / not AIS | Shipped — restyled as BOARD; demo names still tagged |
| Top-3 finds per sector + under-explored rest bias | Map spawn | PASS iff a sector shows at most 3 finds and rest prefers under-walked ground | Shipped — `spawnInSector` cap + explored rest 0.45 / unvisited 0.10 |
| Journal empty state one line, not RECIPE citation | `/journal` | PASS iff the empty card is one line and does not cite RECIPE | Shipped — “Nothing logged.” |

### P1

| Behavior | Surface | Tier 3 | Status |
|----------|---------|--------|--------|
| Group streak | Trainer sheet | PASS iff one member's find keeps the group's week alive while the others are idle | Shipped — `friend.test.ts` "stays alive on one member's week" |
| Group streak is not a total | Trainer sheet | PASS iff 1 find and 50 finds in one week produce the same streak | Shipped — `friend.test.ts` "is a streak, not a scoreboard" |
| Flame stays small | Buddy / trainer | PASS iff the flame grows at most 14% across the whole streak range | Shipped — `FLAME_MAX_GROWTH`, asserted at 520 weeks |
| Skyline never hides a path | Play map | PASS iff the default style draws no wall over in-plane geometry | Shipped — `shadow` is default; `solid` kept behind `?skyline=` and documented as artefacted |
| Play camera cannot reach the survey zoom | Play map | PASS iff zoom is clamped to 19..22 and a drag does not move the centre | Shipped — `min_zoom` + `is_pan_locked` |
| Stick walk obeys the same ground rules as GPS | Play map | PASS iff a stick step off campus or into the grove is refused | Shipped — `stepPlayWalk` is the shared path; `play-walk.test.ts` |
| Quiet restricted-area treatment | Map | PASS iff restricted ground is gray / black and is not explained in a paragraph | Partial — hatch exists; still obvious as off-limits |

### Triage (do not treat as showcase must-ship)

| Behavior | Surface | Tier 3 | Status |
|----------|---------|--------|--------|
| Walk-step points (Speaker 1, `21:31`) | — | Would PASS only if the device actually measures steps | **Rejected** as a fabricated metric unless measured. Same class as the Whistler row in `docs/roadmap-rejected.md` |
| Ateneo.edu SSO | — | — | **Blocked** on DATES. Showcase stays public |
| Human reviewer / AIS dataset update | Journal statuses | — | **Blocked** on named reviewers + AIS authority |
| Official AIS ranks | Leaderboard | — | **Still NOT DOING.** Local / demo cohort only |

---

## How to read this file

1. **North star** = truth of the live app.
2. **DONE** = shipped and demoable.
3. **IN PROGRESS** = Working Doc mechanics landing toward the showcase.
4. **NEXT** = only what the 26 September showcase needs.
5. **BLOCKED** = partner-gated, not a coding backlog disguised as open features.
6. **NOT DOING** = still closed (or narrowed). Point people to `docs/roadmap-rejected.md` for the older full list.
7. **2026-09-12 play layer** = 09-09 Plaud showcase demo rows. They sit under the Showcase clock; they do not replace handset / QR.
