# yclap

Ateneo desk for the **Youth Climate Leadership Accelerator Project (Youth CLAP)** — landing site, research, lanes, campaign materials. Product pilots live in sibling repos.

## Day-one demos

| What | Where | Command |
|------|--------|---------|
| **YCLAP landing** | `web/` | `cd web && npm run dev` (port 9500) |
| **Magisphere PWA** | `web-forest/` | `cd web-forest && npm run dev` (port **4177**) — a rotating world of finds, 1,098 3D species, badges, GPS walk, camera + iNaturalist identify, offline. See [`web-forest/README.md`](web-forest/README.md) |
| **Magisphere sync** | `web-forest/` | `npm run sync` (port **8788**) — live campus world. Vite on 4177 proxies `/sync` `/live` `/world`. Production is same-origin on the Worker. No auth, no official rank |
| **Gargar pilot** | `~/Codex/gargar` | `cd ~/Codex/gargar && npm run dev` |
| **EcoWaste intel** | `~/Antigravity/ecowaste` | `npm run dev` there |

Landing includes: **Youth CLAP design-system brand** (tokens + four-person mark), goals, legal grounds, journey, multi-lane cohort map, SEEDS/experts. Brand assets live in `web/public/brand/` and `web/src/brand/`.

> **Correction, 2026-09-09.** This line used to claim the landing renders a
> "project rack (Gargar · EcoWaste · options)". It does not. `web/src/data/project.js`
> and `web/src/data/pilot.js` are **orphaned** — nothing imports either, and the only
> `Gargar` string in the built bundle comes from a lane task in `cohort.js`. Verified by
> grepping `web/dist/`. The data files are kept and have been brought current
> (Magisphere now leads `project.js`), so wiring the rack is an afternoon whenever
> someone wants it — but the README will not claim it until it renders.

## Docs

| Doc | Purpose |
|-----|---------|
| [`ROADMAP.md`](ROADMAP.md) | Tiered roadmap from the Aug 15 / Aug 22 sessions |
| [`docs/problem-tree-admu-forest.md`](docs/problem-tree-admu-forest.md) | Ateneo CCC urban-forest tree (waste tree stays at `docs/problem-tree-admu.md`) |
| [`docs/design/ui-consensus-treewatch.md`](docs/design/ui-consensus-treewatch.md) | UI consensus for `web-forest/` read off 29 Dribbble shots — adopt · defer · refuse |
| [`docs/plaud/`](docs/plaud/) | Session-recording briefs (transcript-cited asks · decisions · open questions) |
| [`docs/research/2026-08-deep-research-brief.md`](docs/research/2026-08-deep-research-brief.md) | Climate + PH priorities + people research |
| [`docs/research/2026-08-research-wave3-delta.md`](docs/research/2026-08-research-wave3-delta.md) | Wave 3 delta (50 agents) · Gargar actions |
| [`docs/campaign-canvas.md`](docs/campaign-canvas.md) | Campaign Canvas v0.2 |
| [`docs/showcase/deck-7-slide.md`](docs/showcase/deck-7-slide.md) | **Showcase deck (Sep 26, moved from Sep 12) — seven slides**, demo beat sheet, booth + AV checklist |
| [`docs/showcase/concept-note.md`](docs/showcase/concept-note.md) | **Showcase two-page concept note** — same information, document form |
| [`docs/showcase/judging-rubric.md`](docs/showcase/judging-rubric.md) | NBS multi-factor judging rubric |
| [`docs/pitch-3min.md`](docs/pitch-3min.md) | 3-min showcase script + non-claims (Gargar-era; superseded for the showcase by the deck above) |
| [`docs/cohort-intro.md`](docs/cohort-intro.md) | Copy-paste intro for the group |
| [`docs/lane-and-task.md`](docs/lane-and-task.md) | Lanes · tasks · pivot rules |
| [`docs/pilot-7-day.md`](docs/pilot-7-day.md) | 7-day Gargar patch list |
| [`docs/people/cohort-and-organizers.md`](docs/people/cohort-and-organizers.md) | Public people notes |

## North star

**Flagship for the Sep 26 showcase:** **Magisphere** — the campus-forest PWA in `web-forest/`.
Named by the group on 2026-09-08; the GC is `yclap magisphere 🌏🦅`.
**Mission line:** *Two-thirds of this campus is green. Now you can name it.*
**Evidence:** 1,098 species modelled from a real iNaturalist campus sweep; 68 walkable
sectors cut from OSM and measured against imagery; 206 tests in the gate.
**Earlier flagship:** Gargar pilot (scrap-to-value + diversion log), with EcoWaste intel
as evidence — still live in its own repo, no longer the showcase piece.
**Team model:** multi-lane (Build · Science · Mobilize · Story)
**Promise:** any solid idea can be turned into a demoable slice before Sep 26  

## Program dates (2026)

| Date | Session |
|------|---------|
| Aug 15 | LEARN · online (moved for Habagat) |
| Aug 22 | BUILD · done — Mapúa Makati |
| Aug 29 | Masterclass · Mapúa (venue per organizer) |
| Sep 5 | Async prepare |
| ~~Sep 12~~ → Sep 26 | Innovation Showcase · PNU Gym — moved for weather, subject to CCC confirmation |

## Legal frame (summary)

RA 9729 · RA 10174 · CCC ACCELERATE · NAP / NDC · SDG Welcome Generation rationale — detail on the landing and research brief.
