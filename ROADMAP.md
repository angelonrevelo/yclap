# Magisphere roadmap

Live app: https://yclap-field-guide.marangelonrevelo.workers.dev

This roadmap describes what Magisphere **has today**, what is still needed before Saturday, and what remains out of scope. It tracks Angelo's Working Doc project direction ([YCLAP 2026] Working Doc) as the product plan.

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

**Saturday 12 September 2026. PNU Innovation Showcase.**

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
| **Challenges** | Shipped basic (P1) | Discover 2 species / Explore 2 areas. More challenge packs later |
| **Biodiversity Buddy** | Shipped basic (P1) | Seedling → Sprout → Young Tree → Mature Tree from weekly streak. Art can stay simple placeholders |
| **Local observation statuses** | Scaffold (P2) | Device journal labels only. No human reviewer queue; no "updates AIS dataset" claim |
| **Group streak** | Not started | Working Doc note; feasibility TBD |
| **Blindbox / cosmetic reveals** | Partial | Stage cosmetics already exist; not the Working Doc blindbox product yet |

---

## NEXT (before Saturday)

Demo-critical work first.

| Item | Why it matters | Owner note |
|------|----------------|------------|
| **Handset proof** | PWA has not been proven on a real phone (HTTPS / secure context for SW, geo, camera). Runbook: `web-forest/script/handset.md` | Prove install + Map + one journal save + points toast on a physical handset |
| **Ateneo eagle QR on Canva** | Boards must use the Ateneo QR generator (`go.ateneo.edu/QRcode`) in the "a" / eagle style, pointing at the live Magisphere URL. Not a generic QR | Confirm Canva / Intermatrix materials |
| **Ma'am demo script** | Short path: Home (points + local board) → Demo campus Map → Learn card → one log → Journal | One page or slide cue card |
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

Also still hoped for later (not Saturday blockers): CFMO walkable vs restricted clarity, CCC / Manila Observatory climate content where we can source it honestly.

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

## How to read this file

1. **North star** = truth of the live app.
2. **DONE** = shipped and demoable.
3. **IN PROGRESS** = Working Doc mechanics landing toward Saturday.
4. **NEXT** = only what Saturday needs.
5. **BLOCKED** = partner-gated, not a coding backlog disguised as open features.
6. **NOT DOING** = still closed (or narrowed). Point people to `docs/roadmap-rejected.md` for the older full list.
