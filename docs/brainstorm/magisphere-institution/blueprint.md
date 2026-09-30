# Magisphere for institutions — blueprint (extend mode, 2026-10-01)

Source brief: Gelo's 09-30 note ([brief](../../plaud/2026-09-30-stabilization-edutech-positioning.md)). The note asks for campus edutech people keep using, not a childish game; maintenance; branding, a roadmap and KPIs; the judges' uses (DRR and hazards, emergency areas, hiking trails, biodiversity areas); and clarity on what funding buys. Claim ids (`[M3]`, `[R7]`…) are in [`research.md`](research.md). The decision record is [`blueprint.json`](blueprint.json), and it passes `blueprint-check.mjs`.

This plans the **delta**. It does not re-plan the game: the play map, the hall, moderation, privacy and campus modules already ship on `reveal-1015` (ROADMAP § 2026-10-01).

## 1. Idea and thesis

**One line:** a campus map students actually open because walking it is a game. The institution uses it to teach its biodiversity, show hazard and emergency points, and run nature trails, and gets adoption numbers it can report.

**North star:** returning weekly walkers per campus, counted from shared finds (the `/mod` card, which reports a floor).

**Non-goals:**
- not an official emergency system;
- not a consumer game with ads or purchases;
- no in-house species-ID model;
- no official AIS ranking.

**Why now:** the judges accepted the 3D walk and asked what else it is for (`4:05`). The two-week reveal is the first time an institution will look at it as a program rather than a demo.

## 2. Customer

**Primary persona: the coordinator of a campus sustainability or biodiversity program.** At Ateneo that is the Institute of Sustainability / Ateneo Wild, which already runs guided walks and field guides [M8, unverified]. Their job is to run a term-long, self-guided biodiversity walk that students do on their own time, and to show leadership how many walked and came back. **Students are the users, not the buyer.** That is the change from the showcase (re-check: `customer` no longer true as it stood).

**Deferred segments (v1.1):**
- the campus safety / DRRM office;
- other universities in the CCC–NYC youth climate cohort [B5];
- parks and trails;
- LGU DRRMOs already trained on GeoRiskPH [M11].

**Accessibility:**
- low-end Android and cheap laptops (the graphics tier);
- flaky wifi (PWA shell, polling fallback, offline report queue);
- Taglish copy;
- **minors**: under 18 is a child under the NPC's guidance [R7];
- screen readers: all controls are named, but the map is visual.

## 3. Market and competition

| Rival | Kind | Why a campus would still switch |
|---|---|---|
| Ateneo's static campus maps [M6] | local | Images only; nothing to open twice |
| ADMUNAV [M7, unverified] | local | Wayfinding only; no biodiversity or hazard layer. Its path graph is one Magisphere asked to share |
| Ateneo Wild walks and printed guides [M8, unverified] | substitute | Guided and scheduled. Magisphere is the any-time version and can carry their content |
| HazardHunterPH / GeoRiskPH [M10, M11] | local | Authoritative and free, but not campus-scale or walkable. **Cite it, don't compete with it** |
| UP NOAH [M12, D12] | local | Hazard levels only; no help points. Already a data source |
| Seek by iNaturalist [M9] | global | Great free ID, but no campus and nothing an institution configures. Magisphere hands off to it |
| Concept3D [M1–M3, M5] | global | Safety layers are standard, but about **USD 85,000/yr** [M3], no game, no biodiversity |
| Modern Campus Maps [M4] | global | USD 6,300/yr; a directory, not engagement |
| Pokémon GO / Pikmin Bloom [M13–M15] | global | Proves students walk for a game; fiction, no institutional control. The note says don't look like it |
| AllTrails [M16] | global | Hikers, not campuses |

No Philippine product combining a campus walk game, biodiversity and DRR was found as of 2026-10-01 (a gap in `research.md`, not proof of absence).

**Moat:** none of these is "first".
- **Per-campus ground truth that takes months to build:** measured vegetation per sector, the footpath graph, the campus species pack, and the offices' sign-offs.
- **A privacy and safety posture an institution can procure:** no `player_id` shared, a hide switch, threatened-species coordinates withheld, a per-moderator audit, and a CPIA on file.
- **Distribution through the youth climate cohort.** A campus hears about it from a peer campus, not a vendor.

## 4. Product form — `service`

**A managed deployment per campus, on the shared PWA.** A campus can't self-serve this yet: someone has to prepare its sectors, paths and species pack, collect the offices' sign-offs, and moderate.

**Rejected:**
- **SaaS self-serve:** assumes data and moderation the campus doesn't have, and hides the work that makes the moat.
- **Native app:** store review, and the PWA already runs on the phones that matter.
- **API:** nobody is asking for campus biodiversity as an API.

## 5. v1 cut line

- **JTBD:** a sustainability office runs one term-long self-guided walk and reads weekly and returning walkers on `/mod`.
- **Channel:** Ateneo Institute of Sustainability / Ateneo Wild, through the Youth CLAP team's Ateneo CCC relationship.
- **Pricing experiment:** a **free pilot term** in exchange for the AIS inventory, the official emergency map and a named moderator. The second campus is **quoted per term**.
- **Parked:**
  - parks, trails and LGUs → `customer.secondary_segment`;
  - self-serve setup, the institution-admin role and moderator sign-in → `v1_cut.deferred`;
  - other channels → `gtm.channel` with `is_primary: false`.

## 6. Frontend

**Surfaces:**
- `/` play map;
- `/map` field map with campus modules;
- `/journal`;
- `/settings`;
- `/mod`;
- plus a one-page institution sheet for the reveal (a document, not an app route).

**Onboarding is needed.** The boot safety card has to say what the walk is for and, for a minor, what is shared and how to hide, *before* any live position is sent.

**Headline:** "Walk your campus. Learn what lives on it, where to go when it floods, and how to get help."

**Brand brief for the designer (Aleij owns design):**
- **Positioning:** edutech infrastructure that feels like a game to students and reads like a program to the office. Never a children's game.
- **Audience:** students 16–22 as walkers; office coordinators as the buyer.
- **Tone:** playful on the map; plain and precise on sources, safety and data.

## 7. Backend and API

**Keep Cloudflare Workers with a SQLite Durable Object per campus.** Rejected: a VPS with Postgres, which is more to run and patch for a student team. One campus fits the free tier [B3], and the paid tier is **USD 5/month** [B1, B2].

**Routes:**
- `/sync`, `/world`, `/live`;
- the hall (`/live/socket`, `/live/pose`);
- `/partner`, `/join`;
- `/auth/*`, `/account/*`;
- `/report`, `/mod/api/*`;
- identify, which will be replaced by a plant route (section 8).

**Rate limits:** reports 60/h at the edge, 40 sockets per IP, 20 wrong codes per 10 min, 10 wrong moderator tokens per 15 min.

**Observability:** the frame probe, the two benches, reports with diagnostics, and weekly activity. No third-party analytics.

## 8. AI architecture — `hybrid`

**The finding that changes the plan:** iNaturalist's visual API "is not publicly available". Access is **fee-based, by permission** [D5]. An unauthenticated call returns 401 [D4], and the endpoint isn't in the public spec [D3]. The app currently calls it through its own proxy with a build-time token [F2]. **That is the one AI path this product cannot defend.**

**Model routing:**

| Role | Model | Cost | Source |
|---|---|---|---|
| Primary | **Pl@ntNet API**, plants | EUR 0 for 500 identifications/day; a free non-profit plan exists on request, with a logo requirement | [D8, D9] |
| Fallback | **Seek hand-off**, on-device model v2.13, ~80k taxa; for animals, and for plants when the quota is spent or offline | free | [D7, M9] |
| Auxiliary | **iNaturalist `score_image`** | only with written access; switched off otherwise | |

**Rejected:** cloud-only through iNaturalist.

**If the primary fails:** the sheet says so and offers Seek. The recorded demo reply stays for the booth only and is always labelled as recorded.

**Retention:** Magisphere stores no identify photo.

## 9. Data strategy

| Source | Licence | Note |
|---|---|---|
| OSM | ODbL: attribution, share-alike [R15] | |
| UP NOAH | ODbL [D12] | |
| iNaturalist counts | Facts, within the API's ≤60/min, <10,000/day guidance [D1, D2] | |
| **iNaturalist photos on species cards** | Default **CC BY-NC**, many all-rights-reserved [D10] | **Today no licence or photographer is recorded [F1]. Every card must carry both, and a paid deployment may show only CC0/CC BY photos or the curated art** |
| The AIS inventory | To be agreed | Not received |

No training data is needed. Curation is by hand.

**Edge cases:**
- a whole tree at dusk on a low-end camera;
- an animal sent to a plant-only service;
- a confident suggestion for a species not on the campus list;
- a threatened species the repo carries no status for;
- a stale or off-campus OSM feature.

**Crowd-sourcing:** shared finds (species, place, time; never photos or notes). Threatened species' coordinates are withheld and hidden walkers are anonymised (shipped in `baccfb9`).

## 10. Go-to-market

**Primary channel (one): Ateneo Wild / Institute of Sustainability.** First experiment: present the reveal build and the free-pilot offer to the coordinator, asking for the AIS inventory, a named moderator and a DRRM contact.

**Deferred channels:**
- **One campus from the CCC–NYC youth climate cohort** [B5]: a trail-only deployment, quoted per term.
- **Student competitions:** Startup QC gave PHP 995,000 across 47 teams [B8].
- **LGU DRRMOs** [M11]: after the official-map sign-off works at Ateneo.

**CAC:** PHP 0 cash per pilot campus (*assumed*). The real cost is team time through existing relationships.

## 11. Money

**Pricing:**
- Pilot term: PHP 0 (*assumed*).
- Campus program from the second campus on: **PHP 25,000 per campus per term** (*assumed*, no Philippine comparable found). For scale, US campus-map licences run USD 6,300 [M4] to USD 85,000 [M3] a year.

**Build cost:** PHP 0 cash to date (*assumed*: student time).

**Run cost:** USD 5/month at most [B1]; free at one campus [B3].

**Break-even:** one second-campus term covers years of hosting. **What the money actually has to buy is maintainer time.**

**Funding order** (Gelo, `5:31`–`5:51`: fix first):
1. stability and assets;
2. the compliance pack (CPIA, breach runbook);
3. hosting;
4. modules.

**Grants in reach, and why each is uncertain:**
- **Green Rising (UNICEF) [B4]:** no amounts published.
- **DOST-PCIEERD (up to PHP 5M) [B6] and DICT (PHP 0.5–1M) [B7]:** need a registered startup.
- **Areté Sandbox [B11, unverified]:** unconfirmed.
- **USAID:** climate is no longer a US aid priority here [B9].

## 12. Constraints, edge cases, complaints

**Constraints:**
- a student team, with the reveal about 2026-10-15;
- the PWA must run on low-end devices;
- **Data Privacy Act:** consent must be evidenced [R2], data kept only for its purpose [R3], and breaches reported to the NPC within 72 hours [R5];
- **minors:** under 18 is a child, there's no age of digital consent, and a CPIA is required before launch [R7, R8];
- no official emergency data until the DRRM office / CFMO provides it.

**Edge cases:**
- a minor's position visible to strangers;
- stalking through the map (the Safe Spaces Act names cyberstalking [R10]);
- the emergency layer read as official;
- WebSockets blocked at a venue;
- the identify quota running out;
- an all-rights-reserved card photo.

**First complaints to expect:**
- "it lags when I zoom out" (lane perf2);
- "why can strangers see me";
- "wrong species";
- "nothing near me".

**Bottlenecks:**
- the university's data and sign-offs;
- a named moderator and DPO;
- maintainer time after the program;
- iNaturalist's permission.

## 13. Risk register

| Risk | Mitigation | Kill switch |
|---|---|---|
| Minors' location shown to strangers [R7, R8] | CPIA with the university DPO; pilot defaults to partners-only or off; consent line on the boot card; hide switch | **No signed CPIA by 2026-10-13 → the reveal runs with the live hall off, and the pilot doesn't start** |
| Stalking or harassment via the live map [R10, R11] | Hide / report on every tag; `/mod` hide with audit; escalation to the university's CODI | A credible stalking report → hall off campus-wide within 24 h until reviewed |
| iNaturalist visual API without permission [D5] | Pl@ntNet primary, Seek fallback, email iNaturalist for terms | No iNaturalist token in any build deployed after 2026-10-10 without a written answer |
| Photo licences [D10, F1] | Record licence and photographer; CC0/CC BY only when paid | A paid deployment doesn't go live while any card lacks a compatible recorded licence |
| Emergency layer read as official [R13] | Not-official line leads the panel and route card; OSM only; official map requested | DRRM office or CFMO objects → emergency module off for that campus the same day |
| Nobody maintains it | Named maintainer and moderator rota in the pilot agreement; costs within the free tier | Under 20 weekly walkers on `/mod` for four straight weeks → pause and re-plan |
| Personal-data breach [R4, R5, R9] | Store little; a written 72-hour runbook naming who tells the NPC, the students **and their parents** | A confirmed breach stops sign-ups and the hall until both notices have gone out |

## 14. Timeline and team

| Weeks | Phase | Deliverable | Cut line |
|---|---|---|---|
| 1–2 | Reveal | Deployed build; Stable-Alpha gate; CPIA drafted; Pl@ntNet identify; photo attribution | Fails the gate → cut |
| 3–12 | Ateneo pilot term | One walk program, named moderator, weekly numbers, AIS import | No second campus before four weeks of numbers |
| 13–18 | Second campus | One cohort campus from the registry and trail template, quoted per term | Parks and LGUs stay in v1.1 |

**AI multiplier:** ×3 (*assumed*). It speeds up code, tests and docs, but not sign-offs, the CPIA, data sharing or walking the trail.

**Team (nobody hired):**
- Gelo, developer of record;
- Aleij, design;
- a pilot moderator the institution names;
- an institution DPO / DRRM contact.

## 15. Endgame — `undecided`

No Philippine or Southeast Asian precedent for licensing or acquiring a campus or trail app was found. The one big exit in the space, Scopely buying Niantic's games for USD 3.5B [M13], is a consumer-game exit and not this. iNaturalist's model is a funded nonprofit [B10, unverified].

**Possible acquirers:** campus-map vendors, an adopting university, a biodiversity nonprofit network. Decide after two campuses show whether a per-term fee holds.

## 16. Open questions

1. Who sees whom by default in a university deployment: everyone, partners only, or nobody until they opt in?
2. Is Magisphere a personal information controller or a processor for the university, and who registers, appoints the DPO and notifies breaches?
3. Will iNaturalist grant written access to its visual API, and at what fee?
4. Does Pl@ntNet's free plan allow a web-app key and non-affiliated use, or should the team apply for the non-profit plan?
5. Does the university allow location features for students under 18, and does it want a parental consent path?
6. Which fund can an unregistered student team apply to in 2026, and are the CLAP seed figures in the repo real?
7. What is the second campus, and what would it really pay per term?
8. Who maintains Magisphere after the Youth CLAP program ends, and for how long?

## 17. Handoff

`setup` is not run; the repo exists (preset `vite-react`). `brand-kit`: brief in §6, only if Aleij wants it re-cut.

**ROADMAP P0 from this blueprint:**
1. A CPIA with the university DPO, and the live-visibility default decided, before the pilot.
2. Plant identify through Pl@ntNet with Seek as the fallback; iNaturalist `score_image` off without written permission.
3. Species-card photos carry licence and photographer; no incompatible licence on a paid deployment.
4. A 72-hour breach runbook naming who notifies the NPC, the students and their parents.
5. Deploy `reveal-1015` after the Stable-Alpha gate.
