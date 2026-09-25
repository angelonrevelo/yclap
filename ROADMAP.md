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
| Game UI | Magisphere's own look across every surface (sky + mint paper, wood-plank quests, Fredoka), replacing the chess.com port; trainer level shown from points; Dex as numbered field-guide cards. On 09-25 the chrome went flat and neutral: one small neutral shadow per panel, a solid darker bottom edge on pressable things, no stacked sticker rings, inset highlights, text shadows or gradients. See `web-forest/README.md` § Look and feel |
| Illustrated icon set | The kit icons and Settings art (camera, map, journal, walk, …), generated and keyed to RGBA; regeneration in `web-forest/script/icon/`. The game icons moved to the vector sticker set on 09-23, then on 09-25 went back to the chess.com-style set recoloured into the Magisphere palette (`script/icon/recolor-game.mjs`, Gelo's 09-25 note `1:09`); `buddy` and `pin` stay vector |
| Magisphere asset kit | Sprout buddy + explorer + four stage stickers (codex, palette-locked), vector mark / wordmark / lockups / app icon / scenes / 12 vector game icons (brand and marketing use; in-app only `buddy` and `pin`), and a rendered marketing kit (poster, social, OG, banner, sticker + brand sheets). `docs/brand/magisphere/` |
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
| **Smooth play camera (09-25 jitter)** | Shipped on-device (P0, 09-25) | Gelo's 09-25 note, ask A16 (`4:03`, "reduce the jitter"). GPS fixes filtered with a stationary dead-band (`fix-filter.ts`), the camera glides after the walker every frame, roads at real width, a bigger walker, tilt that eases with zoom and a two-finger pitch (`camera-feel.ts`). ~13 → ~64 fps walking in headless Chrome at 390×844. Not yet measured on the booth phone: `?probe=1` shows the readout. See **2026-09-25** lane `camera` |
| **Thumbstick (venue demo)** | Shipped (P0) | 26 Sep is in a hall with no campus trees. Drives the same `play` source as WASD under the same walkability rules. Tagged `source: "play"`, never presented as GPS |
| **Near-field spawns** | Shipped (P0) | Dense field on a campus-fixed grid around the walker, unioned with the campus-wide world further out. Walking finds dice already cast, so two phones still agree |
| **Off-campus fix falls back to the stick** | Shipped (P0) | A playtest at the venue's own coordinates found the one case the stick exists for was the one that fell through: a clean fix a few km away kept the app in GPS mode, hid the stick and showed an empty screen. It now switches itself and says why |
| **Continuous zoom + pinch** | Shipped (P0) | Fractional zoom ported from `tripi` — tile grid stays integer, the fraction rides a CSS scale, a frame loop eases toward a goal. Two fingers pinch AND rotate; before, they only rotated, so a phone could not zoom at all |
| **Stick pace decoupled from the walk** | Shipped (P0) | The stick moved at `WALK_PACE_MS` (1.3 m/s), which is a claim the app prints and useless as a control. It now traverses a fraction of the visible ground per second, and the throttle IS the speed — speed used to live on Shift, which a phone has not got |
| **Haptics** | Shipped (P1) | Second, eyes-free confirmation channel on the stick, on a find in reach, and on points. Honest that iOS Safari has no `navigator.vibrate` at all, so nothing is ever only haptic |
| **Ground rings lie flat** | Fixed (P1) | The reach radius was a hand-squashed `<ellipse>` inside a plane the browser already tilts — foreshortened twice, and axis-aligned, so rotating the camera stood it on edge. Plain circles now; the plane's own transform does it |
| **Optional accounts + a working database** | Shipped, not deployed (P0, 09-25) | Gelo's 09-25 note (`0:35`, `4:41`). Username + password (PBKDF2-SHA256, 100k), hashed server-side sessions, a per-account save of journal + point ledger in the CampusWorld Durable Object's SQLite — not the VPS or Neon. Photos stay on the phone. Google waits on two secrets. See **2026-09-25** and `web-forest/README.md` § Accounts |
| **Blindbox / cosmetic reveals** | Shipped on-device (P1) | A box is earned only from the points ledger: one per finished daily hunt (`hunt:<day>`), one per first-logged species (`species:<code>`). Explore / Learn earn nothing; `?seed=demo` earns nothing. Opened on the Journal shelf with the existing shake / crack / burst keyframes (reduced-motion respected). Own 8-charm set — the 3 stage cosmetics stay tied to stage advances. No repeat until all 8 are out; which charm is an FNV hash of the box id, never `Math.random`. No price, no odds, nothing to buy. Opened list is device-local (`field-guide.blindbox`); it does not follow an account. See **2026-09-25** |
| **iNaturalist identify through our own proxy** | Shipped, not live (P0, 09-25) | Gelo's 09-25 note (`2:21`, `2:52`). The camera sheet posts to `POST /inat/identify` (`worker/inat.ts`, same handler under `npm run sync`), which holds `INAT_API_TOKEN` server-side — never in the bundle. Suggestions are matched to the nine campus species by taxon ancestry (`inat-match.ts`): exact, or a genus / family roll-up flagged partial; only a live exact match pre-fills the pick. With no token the sheet replays a recorded reply labelled **RECORDED RESPONSE**. iNat tokens expire after 24 h. See **2026-09-25** and `web-forest/README.md` § iNaturalist identify |
| **Live multiplayer on the play map** | Shipped, not deployed (P0, 09-25) | Every phone on the play view sees the other walkers (stage sticker, name, level, position source) glide live, a callout for a find within 150 m, and an "N walkers out" pill. WebSocket on the CampusWorld Durable Object (hibernation API, `GET /live/socket`), polling `POST /live/pose` / `GET /live/walker` every 2 s as the fallback; `npm run sync` serves the same hall. Shares only name, level, stage and an in-campus position; the `player_id` never leaves the phone and presence is memory-only. Works in demo mode. See **2026-09-25** and `web-forest/README.md` § The hall |
| **Pet eagle (Agila)** | Shipped on-device (P1, 09-25) | Gelo's 09-25 note (`0:35`–`1:09`): "pet eagle as a companion … and also as a sleep pet". A hand-drawn Blue Eagle (three SVG poses, a mascot nod, not an official Ateneo asset) trails the walker on the play map, flaps while you walk, perches when you stop, sleeps after 2 still, untouched minutes or when standing between 22:00 and 06:00. Tap card: rename (device-only) and a bond that is just the count of journal finds in the last 7 days, marked when those are demo rows. The pet sleeps; nothing measures the user's sleep. `pet.ts`, `pet-eagle.tsx`. See **2026-09-25** |

---

## NEXT (before 26 September)

Demo-critical work first.

| Item | Why it matters | Owner note |
|------|----------------|------------|
| **Handset proof** | PWA has not been proven on a real phone (HTTPS / secure context for SW, geo, camera). Runbook: `web-forest/script/handset.md` | Prove install + Map + one journal save + points toast on a physical handset; while there, open the play view with `?probe=1` and read the frame rate while walking (the 09-25 camera lane measured ~64 fps only in headless Chrome) |
| **Google sign-in keys + accounts on two phones** | Accounts shipped on 09-25 (lane `account`); Google sign-in is greyed out until `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` exist, and the cross-phone journal has only been proven in tests | A person with the Google Cloud console makes the OAuth client and runs `wrangler secret put` (runbook: `web-forest/README.md` § Accounts), then deploys and signs in on two handsets. Password accounts work without it |
| **iNat token set on demo day** | The identify proxy shipped on 09-25 (lane `inat`) but answers `503 needs_token` until a token is set, and an iNat API token lives only 24 hours (the one in the local `.env` expired 2026-09-08) | Someone signed in to iNaturalist copies a token from `inaturalist.org/users/api_token` the evening before / morning of 26 Sep, runs `npx wrangler secret put INAT_API_TOKEN`, then `npm run smoke:detect -- --url <deployed host>` to prove it live. Without it the sheet shows the labelled recorded reply |
| **Two phones in the hall, for real** | The live hall shipped on 09-25 (lane `multiplayer`) and two walkers seeing each other is proven only over a real WebSocket in a node test, not on handsets or on Cloudflare | After deploy, open the play map on two physical phones on the hall's network (same-origin Worker URL, not `?sync=` to an `http://` LAN box — that is blocked as mixed content), walk one and watch it glide on the other; kill the socket once to see the polling fallback hold |
| **Ateneo eagle QR on Canva** | Boards must use the Ateneo QR generator (`go.ateneo.edu/QRcode`) in the "a" / eagle style, pointing at the live Magisphere URL. Not a generic QR | Confirm Canva / Intermatrix materials |
| **Ma'am demo script** | Short path: Home (points + local board) → Demo campus Map → Learn card → one log → Journal | Cue card written: `docs/showcase/demo-script-0926.md` (setup checklist, a network-fail line per beat, lines never to say). Not yet rehearsed on the hall's phones |
| **09-09 play layer (P0)** | Showcase demo behaviors from the 09-09 Plaud | Shipped on-device — see **2026-09-12**. Handset / QR still open |
| **Final deck + concept note to CCC by 23 Sep** | Deadline moved with the showcase (Anna Oposa, Youth CLAP Innovators Telegram GC). Email to partnershipsandcampaign@climate.gov.ph. Follow CCC's six-part elevator-pitch guide | Ivan finishing slides + script workspace |
| **AIS tree inventory export** | Ms. Shenina (Ateneo CCC YCLAP chat, 09-14): request the export from AIS (campus flora / arboretum pages). Unblocks real geo on the map | Request, then map import |
| **Reference-link appendix** | Ms. Shenina (09-14): one appendix of every reference link, uploaded to the shared Drive | Written: `docs/showcase/reference-appendix.md`, 735 deduplicated links in 10 topics, each with its citing file. Per-species data links, npm / localhost and personal links left out. **Not yet uploaded to the Drive** — a person does that |
| **Feature list at a glance** | Feeds the pre/post-test GForm, the booth "museum of features" walls, and the 30-second feature video (team chat, 09-09) | Written: `docs/showcase/feature-list.md`, with a 30-second video shot order. The GForm, walls and video themselves are not made |
| **Heat layer: not from AIS** | AIS has no campus land-surface-temperature layer; it would need QGIS from satellite imagery. Not a showcase blocker | Decide in or out |
| **Demo-critical fixes only** | Bugs that would break the hall demo (blank 3D, Demo campus off by default, broken journal save, points not awarding). No unrelated feature expansion | Triage ruthlessly. Broken / floating 3D and finds inside buildings are now caught by `npm test` (lane `model`, 09-25); a look at the 3D card on a real phone is still owed |

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

## 2026-09-25 — 09-25 Plaud demo push

Source: [`docs/plaud/2026-09-25-demo-readiness-backend.md`](docs/plaud/2026-09-25-demo-readiness-backend.md) — Gelo's solo note on the eve of the showcase: 17 asks checked against the repo (0 exist, 12 partial, 4 absent, one is only the deadline), 3 decisions, 8 open questions. Work was cut into lanes on `demo-0926`; one row per lane as it merges. Appended; does not rewrite the Showcase clock or the rows above.

| Lane | Behavior | Surface | PASS iff | Status |
|------|----------|---------|----------|--------|
| gap | A blind box is earned only by a real find — a finished daily hunt or a species logged for the first time — and opens on the Journal into one of 8 charms, never a repeat until the set is complete, the same charm on every device | `/journal` shelf (`blindbox.ts`, `blindbox-reveal.tsx`) | PASS iff `blindbox.test.ts` (19) passes — "explore and learn earn no box", "will not open the same box twice", "never repeats a charm until the whole set has come out", "grantFor is a pure lookup — no Math.random", "no charm carries a price, a currency or an odds figure" | Shipped on-device. Gate at merge: build / 416 tests / lint all exit 0. **Not done:** the reveal was not played on a physical handset; boxes are device-local and do not sync with accounts; the 3 stage cosmetics are not in the box (they belong to stage advances) |
| gap | The showcase has a cue card, a feature list and a reference appendix a presenter can hold | `docs/showcase/demo-script-0926.md`, `feature-list.md`, `reference-appendix.md` | PASS iff each beat of the cue card (accounts, two-phone multiplayer, pet eagle, identify + journal) has a fallback line for a failed network | Written. **Not done:** appendix not uploaded to the shared Drive; cue card not rehearsed; 30-second video not shot |
| account | A walker can sign up, log in, log out and change a password; signing in on a second phone unions that account's journal and points into the device without dropping a local find or paying a subject twice; photos never leave the phone; Google sign-in answers a clear 503 and the button greys out until its keys are set | Settings → Walker → Account (`account-panel.tsx`), `@username` on the HUD card; `/auth/*` + `/account/save` in the CampusWorld Durable Object's SQLite (`worker/account.ts`), same `AccountService` on `node:sqlite` under `npm run sync` | PASS iff `account.test.ts` (23) passes — "signup → me → logout → login → change password", "login is rate-limited per username", "mergeSave keeps every local find, photo included, and adds the server's", "mergeSave never pays the same subject twice across two phones", "sanitizeSave drops photos and rows without ids", "Google is a clear 503 when no keys are configured" | Shipped, merged clean (no conflicts). Gate at merge: build / 439 tests / lint all exit 0. **Not done — needs a human:** `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` not set (Google Cloud console + `wrangler secret put`, runbook in `web-forest/README.md` § Accounts); not deployed; sign-in on two physical phones not proven; blind boxes and the friend roster stay device-local; no tombstones, so a find deleted on one phone returns from the account |
| inat | A photo from the camera sheet is identified by iNaturalist through our own `POST /inat/identify` proxy, which holds the token server-side; each suggestion is matched to a campus species by taxon ancestry (exact, or a genus / family roll-up flagged partial); a missing, expired or rate-limited token is named on the sheet and falls back to a reply labelled as recorded, never presented as an identification of your photo | Camera sheet on `/map` (`src/inat.ts`, `src/inat-match.ts`); `worker/inat.ts` on the Worker and under `npm run sync`; `npm run smoke:detect` (`script/smoke-detect.mjs`, nine CC-BY / CC0 photos in `test/detect-smoke/`) | PASS iff `inat-proxy.test.ts` (10), `inat-match.test.ts` (13) and `detect-smoke.test.ts` (5) pass — "503 needs_token when the server has no secret", "maps iNat's real 401 (expired token) to token_expired", "prefers the proxy and never sends a token from the client", "exact: any fig lands on Balete", "genus roll-up: 'Vitex' is Molave OR Lagundi", "every saved smoke reply contains an exact hit for its own species", "no saved reply carries a token", "exits non-zero under the threshold" | Shipped. Merge conflicts in `.gitignore`, `vite.config.ts`, `wrangler.jsonc`, `worker/sync.ts`, `server/sync-server.mjs` — all unions with the `account` lane (both route sets, both proxies, both log lines). Gate at merge: build / 467 tests / lint all exit 0. **Not done — needs a human:** no live token (`INAT_API_TOKEN` secret unset; tokens expire after 24 h, so it must be set on the day); the smoke suite has only run in replay against saved replies, not live; not deployed; identify not proven on a physical phone's camera. It reports what iNaturalist returned — Magisphere does not identify plants itself |
| multiplayer | Every phone on the play map sees the other walkers move live — stage sticker, name, level, position source — gliding between poses instead of jumping, dropped after 60 s unheard; a find by somebody within 150 m gets a callout; an "N walkers out" pill appears only once the hall has answered; if the socket cannot open the phone polls every 2 s and keeps retrying; only a name, level, stage and an in-campus position are shared, never the `player_id` | `/map` play view (`src/multiplayer.ts`, `src/remote-walker.tsx`); `GET /live/socket` + `POST /live/pose` + `GET /live/walker` on the CampusWorld Durable Object (`worker/live-socket.ts`), same hall under `npm run sync` (`server/hall.mjs`, hand-rolled RFC 6455, no `ws` dependency) | PASS iff `multiplayer.test.ts` (18) passes — "sanitizePose keeps only name, level, stage, position and source — never the player_id", "sanitizePose refuses a position outside the campus frame", "shouldSend: first pose always, then at most once a second", "the next pose glides from the drawn spot to the new one, never jumping", "a late pose glides for at most GLIDE_MAX_MS, and a teleport snaps", "two phones on the LAN hall see each other over a real WebSocket, and polling sees both", "openHall falls back to polling when the socket never opens" | Shipped. Merge conflicts in `worker/sync.ts`, `server/sync-server.mjs`, `wrangler.jsonc`, `README.md` — all unions with the `account` and `inat` lanes (both constructors' state, all route sets, `run_worker_first` union, both log lines). Gate at merge: build / 485 tests / lint all exit 0. **Not done — needs a human:** not deployed, so the Durable Object socket has never run on Cloudflare; two physical phones seeing each other not proven; the level shown is the seen-sector count + 1, not an account level; presence is not tied to accounts |
| model | Every species model stands on the ground — none floats above or sinks through y=0 (a flyer may hover, the companion's soil mound may stay buried) — and every .glb the app references parses as glTF 2.0 with a mesh, in-range accessors, non-zero bounds and under 1.5 MB; every find, encounter, landmark, demo-walk waypoint and daily-hunt walk target stands on open green ground, never inside a building footprint, the grove, on asphalt or off its sector | 3D models on species cards and the play map (`public/model/species/*.glb`, rebuilt by `script/build-species-model.mjs` with a ground node); spawn and walk targets on `/map` (`src/placement.ts`, `src/spawn.ts`, `src/data.ts`, `walkPoint` in `app.tsx`); `npm run audit:model` (`script/audit-model.mjs`) and `npm run audit:location` (`script/audit-location.ts`) | PASS iff `model-audit.test.ts` (13) and `placement.test.ts` (11) pass — "has no missing, broken, empty, oversize, degenerate or ungrounded model", "references every .glb on disk exactly once — no orphans, no duplicates", "flags a walker that floats, but lets a flyer hover", "every encounter stands on good ground", "no demo-walk waypoint sits inside a building or the grove", "no find in a day of windows lands in a building, the grove, on asphalt or off its sector"; and at the merged tip `audit:model` reports 1,103 referenced / 1,103 clean and `audit:location` reports 46,490 seeded finds, 0 misplaced | Shipped. 110 floating or sunk models were regrounded and the pack rebuilt; about 6% of finds had stood inside a building; two road encounters and one demo-walk waypoint moved. Merge conflict only in `web-forest/README.md` (the run list) — union with the `inat` lane's `smoke:detect` line. Gate at merge: build / 509 tests / lint all exit 0 (lint warnings only). **Not done — needs a human:** grounding is proven by bounds math, not by eye on a physical phone's 3D card; placements are still curated demo geometry against our building footprints, not an AIS-surveyed tree set; not deployed |
| restyle | The chrome is flat and neutral — panels carry one small neutral shadow instead of stacked sticker rings, inset highlights, text shadows and gradients, and anything pressable has a solid darker bottom edge; the ten in-app game icons (dex, go, level, lock, nearby, plan, points, quest, streak, trophy) are the chess.com-style set again, recoloured into the Magisphere palette with each pixel's lightness and alpha kept and greys left alone | Every surface (`game.css`, `token.css`, `index.css`, `joystick.tsx`, `ui.tsx`, `portrait.tsx`); `game_icon` in `src/asset/kit.ts` → `src/asset/icon/game/*.png`, regenerated from the masters in `script/icon/game-source/` by `node script/icon/recolor-game.mjs` (`palette-remap.mjs`) | PASS iff `palette-remap.test.ts` (5) passes — "HSL round-trips within a unit of rounding", "red wraps across 0° into the red band", "a chess.com lime green lands near Magisphere Leaf, lightness kept", "greys and near-greys are left alone (the lock stays steel, not speckled)", "remapRgba keeps alpha and skips transparent pixels"; and `kit.ts` imports no `magi/icon/*.svg` for those ten | Shipped, merged clean (no conflicts). Icon direction per Gelo's 09-25 note (`1:09`): keep the old chess.com-like icons, in the new colour scheme — the vector set stays in `magi/icon/` for brand use. Gate at merge: build / 514 tests / lint all exit 0 (lint warnings only). **Not done — needs a human:** the flat look and the recoloured icons have not been looked at on a physical phone or signed off by Aleij (design owner); the older kit icons and Settings art in `src/asset/icon/` are still the previous generation; not deployed |
| eagle | A pet Blue Eagle named Agila stands beside the walker on the play map and trails them with a lag in ground space, flaps while they walk and perches when they stop, falls asleep (dimmed, "Zzz") after 2 min with no movement and no touch or as soon as they stop between 22:00 and 06:00; its tap card renames it (kept on this device) and shows a bond that is only the count of journal finds in the last 7 days, labelled "(demo journal)" when seeded rows are in it; no line on the card claims to measure the user; reduced motion drops the follow animation and the flapping | `/map` play view (`src/pet-eagle.tsx`, rules in `src/pet.ts`, poses in `src/asset/magi/pet/eagle-{perch,fly,sleep}.svg`), drawn on the glass beside the walker in `play-map.tsx` | PASS iff `pet.test.ts` (15) passes — "flies while walking, perches when still", "dozes off exactly at the idle threshold, not before", "night window is 22:00 to 06:00, inclusive of 22 and exclusive of 6", "status lines never claim to measure the user", "counts only finds inside the rolling 7 days", "flags seeded demo rows so the card can say so", "round-trips through a store, and survives a broken one", "closes half the gap per half-life, and never overshoots", "snaps on a jump and settles when close" | Shipped. Merge conflict only in the `play-map.tsx` imports — union with the `multiplayer` lane (`RemoteWalkerLayer` / `HallCount` / `useHall` and `PetEagle` both kept; the other walkers and the pet both render). Gate at merge: build / 528 tests / lint all exit 0 (lint warnings only). **Not done — needs a human:** the eagle has not been seen following, flapping or sleeping on a physical phone; the SVG poses have not been signed off by Aleij (design owner); the name and bond are device-local and do not follow an account; other walkers in the hall do not see your pet; not deployed |
| camera | The play camera stops jittering: GPS fixes pass through an accuracy-weighted filter that holds a standing walker still through metres of wobble and still follows a real walk; the raked camera glides after the walker every frame on a critically damped spring and the walker is drawn at that glide centre; roads and paths are drawn at real width (5.5 m / 2.6 m, floored and capped in px); the walker is bigger (112→140 px on a phone) and grows as the camera closes; the tilt rests at 46° pulled back and eases to 58° at z22, and two fingers dragged vertically (desktop: shift- or right-drag) adjust it within 40–64° behind a 12 px deadzone; restricted ground is flat quiet gray | `/map` play view (`src/camera-feel.ts`, `src/fix-filter.ts`, glide + tilt in `src/tile-map.tsx`, `src/play-map.tsx`, `src/use-geo.ts`); `?probe=1` shows an on-screen frame readout (`frame-probe.tsx`, `frame-stat.ts`) | PASS iff `camera-feel.test.ts` (10), `fix-filter.test.ts` (6) and `frame-stat.test.ts` (3) pass — "arrives at a still target and never overshoots it", "turns a 20 Hz staircase into a steadier glide than jumping to each step", "a pinch that wobbles inside the deadzone does not nod the camera", "draws walkways at real width at the street camera, roads wider than paths", "holds a standing walker still through metres of wobble", "still follows a real walk", "counts the long frames an eye catches and ignores junk samples" | Shipped on-device. Measured by the lane in headless Chrome at 390×844 while walking: ~13 fps before, ~64 fps after (4× CPU throttle: ~1.4 → ~11). Merge conflict only in the `play-map.tsx` imports — union with `multiplayer` and `eagle` (`RemoteWalkerLayer` / `HallCount` / `useHall`, `PetEagle`, and the new `camera-feel` / `FrameProbe` all kept). Remote walkers and the pet are drawn in the per-frame `overlay` through the same `projection.toScreen(projection.project(…))` the new pitch / zoom / glide feed, so they stay pinned to their ground positions. Gate at merge: build / 547 tests / lint all exit 0 (lint warnings only). **Not done — needs a human:** no frame rate has been measured on the booth phone (open `?probe=1` on it); GPS smoothing has only been exercised in unit tests, not walked outdoors on a handset; the new tilt and two-finger pitch gesture have not been tried on a real touchscreen; not deployed |

---

## How to read this file

1. **North star** = truth of the live app.
2. **DONE** = shipped and demoable.
3. **IN PROGRESS** = Working Doc mechanics landing toward the showcase.
4. **NEXT** = only what the 26 September showcase needs.
5. **BLOCKED** = partner-gated, not a coding backlog disguised as open features.
6. **NOT DOING** = still closed (or narrowed). Point people to `docs/roadmap-rejected.md` for the older full list.
7. **2026-09-12 play layer** = 09-09 Plaud showcase demo rows. They sit under the Showcase clock; they do not replace handset / QR.
8. **2026-09-25 demo push** = one row per lane merged into `demo-0926` from Gelo's 09-25 note, each with its PASS-iff test and what it could not do.
