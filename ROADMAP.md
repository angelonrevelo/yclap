# Magisphere roadmap

Live app: https://yclap-field-guide.marangelonrevelo.workers.dev

This roadmap describes what Magisphere **has today**, what is still needed before Saturday, and what we are **not** building. It does not present rejected ideas as open product work.

For rejected ideas and reasons, see [`docs/roadmap-rejected.md`](docs/roadmap-rejected.md).

---

## North star (what ships now)

**Magisphere** helps Ateneo students notice, learn, and personally record campus-forest biodiversity on Loyola Heights, with honest sourcing and no fake claims.

### Four tabs

| Tab | What it does |
|-----|----------------|
| **Home** | Brand, short walk intro, sourced campus snapshot, landmark teaser (story gap stated when not yet collected), start walking CTA |
| **Map** | Explore nearby finds / spawns, Demo campus for off-site demos, species cards with 3D, optional camera log, Open in Seek |
| **Journal** | Personal finds on this device, optional photos, collection / badge shelf. Private. Not a public rank |
| **Plan** | What the site is for, who we still hope to consult (AIS, MO, CFMO/TAW, orgs), how another campus could copy the four surfaces |

### What is in the product today

- **Demo campus** so the walk works at Zoom / PNU hall without being on Katipunan
- **Finds / spawns** in eligible areas (restricted zones stay off-limits)
- **3D models** on species cards (offline-aware where precached)
- **Personal journal** on the device (local storage). Optional photo
- **Badges / collection** as personal progress, not competition
- **Seek link** for identification help. Magisphere does not run in-app species ML
- **Honest sourcing**: labelled figures, gaps stated when a story or geo file is missing

### What is deliberately not in the product

No leaderboard. No points. No streaks. No Biodiversity Buddy / blindbox growth loop. No human verifier queue that marks sightings into an official campus dataset.

---

## Showcase clock

**Saturday 12 September 2026. PNU Innovation Showcase.**

Live link for demos: https://yclap-field-guide.marangelonrevelo.workers.dev

Suggested Ma'am walkthrough: Home, then Map with Demo campus on, tap one find, open Journal. Say clearly: personal journal, not an official validated dataset, and no leaderboard.

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

Older cohort desk work (canvas, rubrics, worksheets) remains in `docs/`. It is program support, not Magisphere app features.

---

## NEXT (before Saturday)

Only demo-critical work. No new product bets.

| Item | Why it matters | Owner note |
|------|----------------|------------|
| **Handset proof** | PWA has not been proven on a real phone (HTTPS / secure context for SW, geo, camera). Runbook: `web-forest/script/handset.md` | Prove install + Map + one journal save on a physical handset |
| **Ateneo eagle QR on Canva** | Boards must use the Ateneo QR generator (`go.ateneo.edu/QRcode`) in the "a" / eagle style, pointing at the live Magisphere URL. Not a generic QR | Confirm Canva / Intermatrix materials |
| **Ma'am demo script** | Short, repeatable path: Home → Demo campus Map → one find → Journal. Name what we do **not** claim | One page or slide cue card |
| **Demo-critical fixes only** | Bugs that would break the hall demo (blank 3D, Demo campus off by default, broken journal save). No feature expansion | Triage ruthlessly |

---

## BLOCKED on partners

These are not missing app features. They wait on people outside the build.

| Need | Blocker |
|------|---------|
| Real tree / species geo on the map | **AIS** inventory / permitted geo share. Until then, finds stay labelled as demo / curated placements, not a surveyed pin set |
| Authoritative walkable path graph | **ADMUNAV** authors / graph share. Current paths are labelled from public map sources, not claimed as ADMUNAV |
| Landmark oral history | Interview or dated photo from older batches / Ateneo Wild. Card ships with the gap stated rather than inventing a story |

Also still hoped for later (not Saturday blockers): CFMO walkable vs restricted clarity, CCC / Manila Observatory climate content where we can source it honestly.

---

## NOT DOING / rejected

Do not re-open these as Magisphere product rows. Full log: [`docs/roadmap-rejected.md`](docs/roadmap-rejected.md).

| Idea | One-line reason |
|------|-----------------|
| **Public leaderboard / rank** | Sophie against incentivizing advocacy. Seek-style personal collection is enough |
| **Points / XP / coins** | Same call. Progress is personal, not a score |
| **Daily or weekly streaks** | Competitive habit loops are out of scope for this formation tool |
| **Buddy / egg→tree / blindbox rewards** | Gamification growth stages and Pop Mart-style reveals stay rejected for this showcase product |
| **Human verifier → official dataset** | App logs stay on-device. Magisphere is not AIS's validation pipeline |
| **Planting promise / canopy increase as the site's claim** | Formation and awareness first. The site does not claim it plants trees or raises canopy cover |

Other long-standing refusals (carbon product, blue-carbon credits, second recycling app, rebuild Seek CV, claim AIS 1,809 as "our" baseline, and more) stay in the rejected log.

---

## How to read this file

1. **North star** = truth of the live app.
2. **DONE** = shipped and demoable.
3. **NEXT** = only what Saturday needs.
4. **BLOCKED** = partner-gated, not a coding backlog disguised as open features.
5. **NOT DOING** = closed. Point people to `docs/roadmap-rejected.md` instead of re-debating in the roadmap.
