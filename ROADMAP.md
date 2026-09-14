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
| **Home** | Brand, short walk intro, sourced campus snapshot, landmark teaser, points + weekly streak, local demo leaderboard, start walking CTA |
| **Map** | Explore nearby finds / spawns, Demo campus for off-site demos, species cards with 3D, optional camera log, Open in Seek |
| **Journal** | Personal finds on this device, points + streak + challenges + Biodiversity Buddy, optional photos, collection / badge shelf. Local observation statuses. Private device journal |
| **Plan** | What the site is for, who we still hope to consult (AIS, MO, CFMO/TAW, orgs), how another campus could copy the four surfaces |

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
| **Group streak** | Not started | 09-09 Sophie / Ivan (`1:34:05`). Feasibility TBD |
| **09-09 play layer (Home HUD, daily hunt, anti-spam)** | Shipped on-device (P0) | GO Home, daily hunt card, Hunt 40 > Observe 25, `observe:${code}:${sector}` anti-spam, quiet-sector spawn bias. Group streak still not started |
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
| Group streak | Journal / Home | PASS iff two or more device-local names share a week key | Not started |
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
