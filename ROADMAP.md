# ROADMAP

Youth CLAP desk — roadmap from the eight Aug 15 / Aug 22 Plaud recordings, cross-referenced against this repo on 2026-08-25.

Discovered ~60 raw asks across 8 briefs (`docs/plaud/`) → **12 genuine · 6 rejected · 6 triage**. Every row carries a Tier 3 acceptance test; nothing earned Tier 1 (no regression-prone code path) or Tier 2 (no live-model effect). Rows named after behavior, never after their test.

Program clock: **Aug 28 async contract due · Aug 29 Masterclass · Sep 12 Innovation Showcase.**

## P0 — close before the Aug 28 deadline / Aug 29 session

| Item | What it closes | Surface | Effort | Benchmark (Tier 3) | Status |
|------|----------------|---------|--------|--------------------|--------|
| Async-contract packet: Campaign Canvas v0.3 + per-school tracker | Facilitators assigned canvas purpose+process (7 questions), resource inventory, cost of action/inaction by Aug 28 (`session-2` `6:13:28`; `campaign-canvas` brief) — repo canvas v0.2 lacks assumptions/M&E/success fields and no completion tracking exists | `docs/campaign-canvas.md` v0.3 + `docs/cohort/contract-tracker.md` | M | Open v0.3; PASS iff every officially assigned field has a fill-in section AND tracker lists each school with status columns for tree / canvas / inventory / costs | **done** — v0.3 + `docs/cohort/contract-tracker.md` (2026-08-25)
| Cohort idea-guardrails one-pager ("before you propose") | Cohort keeps re-inventing what already ships (transparency website ≈ Gargar wedge) and re-proposing killed directions (planting drives, blue-carbon credits, another recycling app) — before the Aug 29 room | `docs/cohort/idea-guardrails.md` | S | PASS iff page names the project rack as first check, links R10/R28/R30 evidence lines, and states the three pitfall patterns with one-line reasons | **done** — `docs/cohort/idea-guardrails.md` (2026-08-25)
| Landing program truth vs recorded reality | Landing sold Aug 15 as in-person Mapúa with governance (it ran online; governance moved to Aug 22) and Aug 22 venue Intramuros (it ran at Makati). Fixed on main @ b3e9b61 (2026-08-25): session rows + README corrected, `npm run build` green | web landing program section (`web/src/data/program.js`) | S | Open landing; PASS iff Aug 15 row reflects online delivery, completed sessions are marked done, and no date/venue contradicts a recorded session — **PASS** | **done** (2026-08-25) |

## P1 — Sep 12 showcase readiness

| Item | What it closes | Surface | Effort | Benchmark (Tier 3) | Status |
|------|----------------|---------|--------|--------------------|--------|
| NBS multi-factor judging rubric for the showcase | Lasco's multi-factor NBS success rule (`climate-biodiversity` brief) vs a default single-metric judging; judges need it before Sep 12 | `docs/showcase/judging-rubric.md` | S | PASS iff rubric weights ≥4 success factors, carbon tonnage is not a pass/fail gate alone, and pitch-3min non-claims are referenced | **done** — `docs/showcase/judging-rubric.md` (2026-08-25)
| Flood-activated collection-drive protocol | Cong. Alba ask for drive systems that "re-activate at every flood/calamity" (`project-development` `15:07`) — loop exists, activation protocol absent; R09 basura-baha evidence ready | `docs/pilot/flood-drive-protocol.md` (+ Gargar trigger note) | M | PASS iff protocol names trigger condition, roles, 72-hour timeline, and is linked from campaign-canvas pilot slice | **done** — `docs/pilot/flood-drive-protocol.md` + canvas link (2026-08-25)
| LGU LCCAP → PSF funding-wedge kit | "Equip LGU plans for implementation/funding" (`project-development` `2:07:24`) — R16/R17 research exists, no bridge artifact turning a school project into an LGU-plan line item with a fund source | `docs/lgu-funding-kit.md` | M | PASS iff kit maps project → LCCAP entry → fund source (PSF/LCEI/local) with one worked example citing R16/R17 pages | **done** — `docs/lgu-funding-kit.md` (2026-08-25)

## P2 — value track (post-showcase)

| Item | What it closes | Surface | Effort | Benchmark (Tier 3) | Status |
|------|----------------|---------|--------|--------------------|--------|
| GHG-assurance first-mover primer | Vicky Tan's "be first movers in GHG audit/assurance skills pre-2028" (`masterclass` `59:54`) — zero TNFD/TISFD/assurance content in repo | `docs/research/2026-08-ghg-assurance-primer.md` | M | PASS iff primer cites SEC Scope 1–3 timeline (disclosure 2026/27, audits 2028), LCEI market design, and maps 5 concrete youth-entry skills | **done** — docs/research/2026-08-ghg-assurance-primer.md (2026-08-25)
| Discounting worksheet (PV exercise) | Solo 5% discounting homework (`project-development` `2:47:34`) — lane owner set, no artifact; house rules: ≤10% project discount, 4% global, never 15% | `docs/exercise/discounting-worksheet.md` | S | PASS iff one worked PV example follows house rules and answer key matches hand-computed value | **done** — docs/exercise/discounting-worksheet.md (2026-08-25)
| Climate Venn worksheet + one-sentence statement | Assigned personal reflection (joy / strength / issue → statement) (`campaign-canvas` `6:10:09`) — absent everywhere | `docs/exercise/climate-venn-worksheet.md` | S | PASS iff worksheet renders three circles, prompts the one-sentence statement, and shows one filled example | **done** — docs/exercise/climate-venn-worksheet.md (2026-08-25)
| Pre/post-test instrument archive | Pre-test ran as attendance with scores withheld; no instrument or results live in the repo — honest-reporting culture needs the record | `docs/evaluation/pre-post-test.md` | S | PASS iff instrument questions are listed and a results table exists with the recorded cohort score policy noted | **done** — docs/evaluation/pre-post-test.md (2026-08-25)
| PhilCCA / NAP free-download library | "Download PhilCCA/NAP" asked in two sessions; references scattered across R-docs, no single library | `docs/library.md` | S | PASS iff every link resolves to an official free source and each entry notes which session assigned it | **done** — docs/library.md (2026-08-25)
| SOM swamp-forest fork spec | Gelo's firm ask: fork Gargar, reuse assets, reskin problem to species scarcity from wrong tree species (`som-forest-restoration` decisions) — execution belongs in a sibling repo after Sep 12 | `docs/spec/som-forest-fork-spec.md` (code: new sibling repo) | L | PASS iff spec fixes scope (fork-not-recreate, four chosen education/psych solutions), lists reusable assets, and names root-cause framing; separate benchmark covers the fork booting | **done** — docs/spec/som-fork-spec.md (2026-08-25)

## 2026-08-27 — Ateneo CCC forest PWA (from the Aug 26 pulong)

Sweep of one Plaud (`docs/plaud/2026-08-26-lingguhang-pulong.md`), the `[YCLAP 2026] Tree Map_ Output.docx`, and a remine of the Messenger vault `yclap participants` (102 msgs, 19–26 Aug). Not a Gargar sweep. The existing landing at `web/` stays; this section is the **student-led campus-forest PWA** the ten-person Ateneo CCC team locked as their innovation output.

Discovered 26 (signals 18 · github 3 · web 5) → **11 genuine · 9 rejected · 6 triage**, plus 3 problems found while grounding that discovery had not named (off-campus demo pin; waste-tree vs forest-tree collision in this repo; AIS inventory already exists so “we will baseline” is a false ask).

Program clock for *this team:* **Fri 28 Aug 21:00 technical lock · Sat 29 Aug slides · 12 Sep Innovation Showcase.** Two weeks of build after Friday, not a semester-long AIS program.

Keep from the current Grok `web/`: YCLAP tokens and motifs (`web/src/brand/token.css`), Montserrat, 24px cards, four-person mark as *program chrome*, R14 tree facts, AIS SUMP 1.4 copy from the vault PDF, Angelo’s already-posted map prototypes (`bygelo.com/maphy` Loyola sat view, `campus.sisia.app`). Redo: the home is no longer the cohort landing. The walk is new.

Figma Make prompt (paste-ready): [`docs/figma/campus-forest-pwa-make-prompt.md`](docs/figma/campus-forest-pwa-make-prompt.md).

### P0 — before Friday 21:00 (the lock)

| Item | What it closes | Surface | Effort | Benchmark (Tier 3) | Status |
|------|----------------|---------|--------|--------------------|--------|
| Walk into Friday with one proposed feature list, not an open brainstorm | Call deferred technicalities (`36:58`); Word doc still has a highlighted “what will the website feature?” | `docs/figma/campus-forest-pwa-make-prompt.md` + this table | S | Friday agenda names four surfaces (Home, Map, Field journal, Plan) and one explicit non-feature (public leaderboard). PASS iff the Figma file shows those four and no rank table | **open** — prompt written 2026-08-27, Figma not generated |
| Show the site on a projector that is not on Katipunan | Pokémon-style walk dies at a Mapúa/YCLAP hall without a fake location | Desktop kiosk · **Demo campus** toggle pinned to 14.6386, 121.0785 | S | Open desktop; toggle Demo campus; a nearby-encounter card appears for a Loyola Heights species without granting browser geolocation. PASS iff that card renders. Currently fails — no PWA | **done** — `web-forest/` :4177, Demo campus on, nearby Narra without geolocation (2026-08-27) |
| Read a Change line a website can actually do | Sophie: “increase native-tree representation” is too far from the site (`31:48`); formation is the replacement (`32:58`) | Home hero + `docs/campaign-canvas.md` purpose block for this team | S | Hero does not promise more native trees planted. PASS iff it names awareness + commitment on *this campus*, and a caption names AIS as the inventory source | **done** — home hero + AIS-labelled stats (2026-08-27) |
| Stop this repo from showing the waste problem tree as this team’s trunk | `docs/problem-tree-admu.md` is still recyclables; the group tree is climate stress on the urban forest | `docs/problem-tree-admu-forest.md` (new) or a clearly labelled second tree; do not silently overwrite the waste tree — Gargar still needs it | S | Opening the forest tree file shows the Word-doc trunk (infrastructure / policy / awareness → comfort, biodiversity, cost, metro green). PASS iff the waste tree remains reachable and is not presented as the CCC team’s slide 1 | **done** — `docs/problem-tree-admu-forest.md`; waste tree untouched (2026-08-27) |

### P1 — Sep 12 demoable PWA

Every row is user-visible → Tier 3. No row earned Tier 1 (nothing here has silently corrupted data) or Tier 2 (no live model).

| Item | What it closes | Surface | Effort | Benchmark (Tier 3) | Status |
|------|----------------|---------|--------|--------------------|--------|
| Open four surfaces on a phone and a desktop | Group locked one website (`19:41`) with map as a section (`19:49`) | PWA routes: `/` `/map` `/journal` `/plan` (names can change Friday) | M | 390px and 1440px. Bottom nav on phone, side or top nav on desktop. Each route has a distinct job. 390px no horizontal overflow | **done** — `web-forest/` four routes (2026-08-27) |
| Stand next to a walkable tree and see what it is | Gelo map→species; Kariz Pokémon GO *spatial* loop; off-limits forests named as a limit in the Word doc | `/map` · encounter cards on walkable paths only; restricted-forest overlay with no spawn | M | In Demo campus, a pin on a path opens species (common + scientific + native/exotic). A pin inside a hatched “restricted” polygon does not. No other user’s location is drawn | **done** — walkable discs + SOM hatch, no other users (2026-08-27) |
| Keep a personal field journal without a public rank | Sophie against incentives (`20:20`); Seek’s actual pattern is badges-on-device, not a leaderboard | `/journal` · local “seen” collection | S | Logging a sighting increments *my* journal. There is no `/leaderboard`, no points integer, no “#1 on campus.” Reload keeps the journal (localStorage is enough for the showcase) | **done** — localStorage journal, no `/leaderboard` (2026-08-27) |
| Use the camera to remember a sighting, not to identify it | Word doc wants photos; Seek already does CV; two weeks cannot | Camera sheet on `/map` · saves photo + chosen species from the curated list · optional “Open in Seek” text link | S | A sighting can be saved with or without a photo. No in-app ML banner. Caption says identification is the student’s, or Seek’s, not this app’s | **done** — optional photo + Aliño 2023 helper + Open Seek (2026-08-27) |
| See building / green ratio as a layer, not as the product | Gelo idea; maphy already has `choro`; call said map is one section | `/map` layer toggle “Canopy vs built” | S | Toggle on: choropleth or hatch. Toggle off: species pins. Does not replace the encounter cards. Source caption on the layer | **done** — Llorin et al. 2024 caption (2026-08-27) |
| Read a plan page that is a consultation, not a fake 20-stakeholder claim | Sophie v1 obj 2 promised 20 representatives by Q3; the call moved that to “moving forward” (`28:10`) | `/plan` | S | Page lists who we *hope* to consult (AIS, Manila Observatory, CFMO/TAW, student orgs) as unanswered, plus a short “what this website is for.” PASS iff it does not state “we consulted 20 people” | **done** — unanswered consult list (2026-08-27) |
| Show this at Youth CLAP without pretending it *is* the program landing | Display-in-YCLAP ask; keep Grok chrome | Kiosk header: Youth CLAP 2026 · Ateneo CCC · four-person mark. Existing `web/` landing unchanged | S | Projector 1440px: header visible, map fills the rest, Demo campus on. `web/` `/` still shows sessions + project rack | **done** — sibling `web-forest/`; `web/` unchanged (2026-08-27) |
| Quote AIS numbers as AIS numbers | Reverse flag from R14: 1,809 trees, 101 arboretum, ~⅔ green | Home stats strip + species cards | S | Every inventory figure has `source` + year on screen. PASS iff none are labelled “our survey” | **done** — AIS · SY 2025–2026 labels (2026-08-27) |
| Put Archīum papers on the surface they actually support | sisia `archium_paper` harvest 2026-08-27: 13,686 rows, **no** campus tree census; a handful of walk/heat/IAS/stakeholder papers do apply | Copy on `/map` `/plan` `/` camera sheet — list in `docs/research/2026-08-archium-forest-pwa.md` | S | PASS iff (a) Demo-campus pin cites MO 14.64°N, 121.07°E, (b) camera helper names Aliño 2023 and does not claim in-app ID, (c) `/plan` names Cuyegkeng & Favis 2019 as unanswered buy-in, (d) Ortiz 2024 is labelled a Chile analog. Fail if 1,809 is attributed to Archīum | **done** — pin / Aliño / Cuyegkeng & Favis / Ortiz analog on-surface (2026-08-27) |

### P2 — after the showcase, if Friday wants it

| Item | What it closes | Surface | Effort | Benchmark (Tier 3) | Status |
|------|----------------|---------|--------|--------------------|--------|
| Other-campus one-pager (framework, not a multi-tenant product) | Aleij `17:09` | `/plan` “How another campus would copy this” | S | Names the four surfaces and the geofence rule. Does not ship a second campus map | **done** — `/plan` §3 + AUN-EEC one-liner (2026-08-27) |
| Deep-link a sighting into Seek / iNaturalist | web: Seek is the identifier | “Open in Seek” on the camera sheet | S | Link present; this app still does not run a model | **done** — Open Seek on camera sheet (2026-08-27) |
| Render a real AIS geo file if they share one | Kat `24:24` | `/map` from GeoJSON, not dummy pins | M | Pin count equals the file’s feature count. Until the file exists, this row stays blocked | **blocked** on AIS share |

## 2026-08-27 — Archīum papers, second pass (sisia `archium_paper`)

Deeper harvest on `bygelo`: word-boundary species names (first pass had `narra` ⊂ *narrative*), Favis/Cuyegkeng/Villarin/Delocado author lists, Biology/ES titles, every title containing `Loyola Heights`. Corpus unchanged (13,686 / 9,398 full text).

Discovered 18 new candidates (signals 16 from SQL · github 0 this pass · web 2: Nicholson Meaningful Gamification as the RECIPE source) → **5 genuine · 6 rejected · 3 triage**, plus 1 problem found while grounding: Molave on the Figma list is *Vitex parviflora*; the only campus *Vitex* paper is *negundo* (Lagundi).

The lumped P1 row “Put Archīum papers on the surface” stays as the honesty invariant. Rows below are the **behaviors** that invariant was hiding.

### P1 — cite what the mirror actually has

| Item | What it closes | Surface | Effort | Benchmark (Tier 3) | Status |
|------|----------------|---------|--------|--------------------|--------|
| See Lagundi as a campus-documented plant, not as Molave | Only Archīum title that names Loyola Heights *and* a plant is Ledesma 2022 (`theses-dissertations/726`) | `/journal` + map card *Vitex negundo* | S | Card shows Lagundi, scientific name, “Ledesma 2022 · campus accessions,” and a shrub not-canopy note. PASS iff Molave is a separate card or absent — never the same row | **done** — separate Lagundi / Molave cards (2026-08-27) |
| See Katmon with its campus barcode, not as “our survey” | Fatallo 2022 abstract: Pola **and** Ateneo campus (`theses-dissertations/723`) | Katmon species card | S | Caption names Fatallo 2022 and Mindoro. PASS iff it does not say the thesis counted every campus Katmon. No pdf_url in the mirror — landing URL is enough | **done** — Fatallo 2022 + Mindoro caption (2026-08-27) |
| Keep a journal that reflects, rather than ranks | Rodrigo/Favis/Cuyegkeng 2021 RECIPE (`discs-faculty-pubs/235`) + game eval (`256`); Sophie already refused incentives | `/journal` helper line | S | Helper names reflection / RECIPE or “not a race.” PASS iff no points integer. Fail if the Android SDG game is reskinned as this PWA | **done** — RECIPE helper, no points (2026-08-27) |
| Ask ADMUNAV’s authors before drawing their path graph | Lagyo, Galicia, Guico 2025 is the pedestrian graph of this campus; we do not have the file | `/map` walkable layer · email/ask in `/plan` unanswered | S | Until they share: dummy paths labelled dummy. After share: pin/path count matches their graph and a caption names ADMUNAV. Forking the Android wayfinder fails the row | **done** for dummy label + `/plan` ask · still **blocked** on share |

### P2

| Item | What it closes | Surface | Effort | Benchmark (Tier 3) | Status |
|------|----------------|---------|--------|--------------------|--------|
| Read Ledesma and Fatallo as PDFs, not landing-page abstracts | Mirror has `pdf_url` NULL / `fetch_status` NULL on both theses | `docs/research/2026-08-archium-forest-pwa.md` methods line | S | File notes page-cited sample counts (how many accessions from campus vs Antipolo / Mindoro). Until then the cards stay at abstract-level claims | **open** |

## 2026-08-29 — Ateneo pitch + mentor talk (Masterclass)

Sweep of two Plauds: Ateneo slice `docs/plaud/2026-08-29-ateneo-biodiversity-platform.md` (`1:57:43`–`2:21:06`) and morning roundtable `docs/plaud/2026-08-29-youth-climate-roundtable.md`. Not a Gargar sweep. Not UP Diliman heat-campus. Not QCU fast-fashion.

Already shipped on 08-27 and **not re-listed:** four surfaces (`/` `/map` `/journal` `/plan`) · Demo campus pin · local journal with no `/leaderboard` · AIS-labelled 1,809 / 101 / ~⅔.

Leftover that this repo does not fully ship: **5 genuine**. Pokémon GO in this talk is the spatial + photo analog (`2:00:31`, `2:10:39`). Public leaderboard / XP / rank stays rejected (`docs/roadmap-rejected.md`). Green Rising is a *funding path* for website maintenance, not a product row.

### P1 — leftover after the 08-27 ship

| Item | What it closes | Surface | Effort | Benchmark (Tier 3) | Status |
|------|----------------|---------|--------|--------------------|--------|
| Identify a species from a photo via iNaturalist (client, not an on-device Seek rebuild) | Pitch ID guide (`2:03:04`) + take-a-pic (`2:10:39`). Nearby-observation strip is not identification | Camera sheet on `/map` · iNaturalist computer-vision API as a **client** | M | From a photo, the sheet shows a suggested species attributed to iNaturalist. Caption says this app does not run the model. Fail if weights ship in the PWA or if the banner says “we identified it” | **done** — `scorePlantImage` + camera caption “iNaturalist is identifying”; JWT-less devices show `needs_token` and Seek (2026-09-01) |
| See a personal summary of logged sightings | Website dashboard to summarize collected data (`2:03:04`) | `/journal` summary strip (count + grouping) · local only | S | Opening `/journal` shows *my* sighting count and at least one grouping (species or day). No other user’s data. Reload keeps it. Fail if a rank or points integer appears | **done** — `summarize()` + strip (sightings / species / located, by-species bars, by-day pills) + a per-sighting log. `journal.test.ts` asserts the summary carries no rank/score/points/streak/level/xp key (2026-09-02) |
| Read Ateneo Wild and AIS as named partners, with the AIS data-gap said out loud | Mentor: Wild Instagram catalog (`2:11:32`); ES student: prof handles the account (`2:18:31`); Cathy: AIS has species, missing **count** and **location** (`2:12:12`) | `/plan` consult list + home or map caption | S | `/plan` names Ateneo Wild (Instagram catalog of birds/trees) and AIS. A reachable caption states AIS has a species database and the missing data is count and location. Consult rows stay unanswered until a meeting happens | **partial** — unanswered consult list exists; naming + gap caption still thin |
| Map trees together on a nature walk, not only by clicking the site | Camille: activation, then nature walks where people actually map (`2:09:43`) | `/map` walk session (participatory mapping) | M | A walk session can be started; at least two local sightings can be placed on the map during that session. Restricted groves stay hatched. No public rank. Fail if “mapping” is only browsing pins | **done** — Start/End walk on `/map`; every sighting saved during a session carries its `walk_id` plus lat/lon/accuracy/fix source; chip counts the walk. Restricted hatch untouched, no rank (2026-09-02) |
| Read a story about an oldest / landmark tree on campus | Camille: stories + old photos from older batches; storytelling, not romanticize-only (`2:17:00`) | `/` or `/plan` oldest-tree story card | S | At least one landmark tree has a story + photo with attribution. Caption is not nostalgia-only. Fail if the oral history is invented | **partial** — landmark card ships on `/` (Balete, Bellarmine field edge) with the documented growth-form description and an explicit "STORY NOT COLLECTED YET" block naming who we still have to ask. Deliberately not filled with an invented memory; **blocked** on an actual interview / dated photo from older batches or Ateneo Wild (2026-09-02) |

### Triage — morning roundtable, not P0

| Item | What blocks it |
|------|----------------|
| Green Rising seed (₱30k) / innovation (₱100k) grant as a **funding path** for website maintenance | Camille: next cycle after they assess this year’s 22 projects (`10:44`–`10:52`). Pitch already named maintenance as a resource gap (`2:07:23`). Need a window date and a decision to apply — not a `/map` feature |

## What we are NOT going to do

See [`docs/roadmap-rejected.md`](docs/roadmap-rejected.md) for the full log with reasons. Summary: carbon-footprint calculator/product · blue-carbon credit pitches · planting as flagship action · a second recycling/transparency app · chat-app logistics · `[AI note]`-only assignments · public leaderboard / photo-points · rebuild Seek CV · claim AIS’s 1,809 trees as our baseline · ship the full Native Tree program in two weeks · fork OpenTreeMap · email-a-tree · upload student GPS · replace Gargar · **rice-waste MFA on this PWA** · **MACFAST quintuple bottom line** · **rebuild the 2021 SDG Android game** · **mangrove carbon papers as campus forest** · **Lagundi = Molave**.

## Triage — need a decision or an input

| Item | What blocks it |
|------|----------------|
| ~~Klima Kasan Awards ₱50k entry~~ | **resolved 2026-08-25** — probable referent is the OML Center × CCC MKK Shorts / Klima Film Festival family (₱ matches); 2026 pitch window closed Jul 15 (186 pitches → 20 advancing), so moot this cycle. Identity probable-not-certain; revisit next edition |
| MWell challenge participation (window Aug 22–Sep 11, winners Sep 12) | Need team commitment decision |
| Pre-showcase convocation + CCC×NYC institutionalization | Organizer-level decision, outside desk control |
| Carbon-market integrity / PH biodiversity-credit standard research | CCC deferred it in-session; needs scoping call |
| ~~Polkadoc vault mining~~ | **mined 2026-08-25** — vault at `~/polkadoc`; YCLAP Messenger chat + 5 CCC-YCLAP email threads extracted; facts folded into library/eval/tracker/landing rows |
| ~~Messenger YCLAP groupchats~~ | **mined 2026-08-25** — the vault chat carried the async-week cadence + team roster; no other yclap-named chats in the vault as of its last scrape (2026-08-23/24) |
| Friday “pakulo” vote (photo game vs formation-only site) | Group parked it (`35:56`). This roadmap proposes the Seek-style journal (personal, no rank) as the compromise; it is not a substitute for the vote |
| AIS geo file / species list share | Kat’s map blocker (`24:24`). Dummy pins are honest until a file exists. Aleij’s Doc Emma drive is a separate offer (`18:33`) — need access, then a one-line “usable / not for v1” |
| Who builds the PWA (Jello vs Angelo vs both) | Call leveraged Jello’s web skill (`14:35`) and Angelo already posted maps + offered a mockup in chat. No owner in the transcript |
| Product name | None locked. Figma uses a replaceable working title. Do not print a coined brand Friday has not said |
| Keep `web/` landing vs rebuild Grok as this PWA | User asked to redo Grok but keep some things. This section keeps `web/` and adds a sibling surface. Confirm Friday if they actually want one URL |
| iNaturalist account vs local-only journal | Affects whether sightings ever leave the phone. Default local-only until a privacy line is written |
| Ledesma / Fatallo full PDF | No `pdf_url` in `archium_paper`. Need a landing-page download or author share before card copy can cite accession counts |
| ADMUNAV path dataset | ECCE paper exists; graph is not in this repo or the sisia mirror. Ask Lagyo / Galicia / Guico |
| Whether Lagundi belongs in a *tree* field guide | Documented on campus; not canopy. Friday can keep it as “also here” or cut it. Do not silently merge with Molave |


## 2026-09-02 — make it demoable: camera, detection, GPS

Sweep of `web-forest/` against the goal "a working PWA that can be demoed on
stage, with working camera, detection, and GPS tracking / tree documentation."
Five capability gaps were measured, not guessed. Every row below is user-visible
→ Tier 3.

Measured before the change:

| Capability | State on 2026-09-01 |
|---|---|
| Camera | `<input type="file" capture>` only — an OS picker, not a viewfinder |
| Detection | `scorePlantImage` read `process.env.INAT_API_TOKEN`; `process` does not exist in a Vite browser bundle, so **every browser** returned `needs_token`. Detection was dead in the product. |
| GPS | none. `player_x={41}` was hardcoded; no encounter carried a coordinate |
| Documentation | species + photo + timestamp; no location, no note, no export |
| PWA | `sw.js` was a two-line no-op; the manifest had an SVG icon only |

### P1 — shipped

| Item | What it closes | Surface | Effort | Benchmark (Tier 3) | Status |
|------|----------------|---------|--------|--------------------|--------|
| Stand somewhere and have the site know where that is | GPS tracking was the one word in the goal with no code behind it | `src/geo.ts` · `src/use-geo.ts` · `src/nearby.ts` · `/map` | M | Grant location: the walker mark lands at the projected percent with an accuracy ring, the chip prints the live coordinate ±accuracy, and the card names a true metre distance and compass point. Standing at a known encounter reads 0 m. PASS iff distances are haversine metres, not pixels | **done** — 0.001° lat measures 111.2 m ±1 m in test; CDP geolocation override at 14.63775, 121.07792 rendered "±12 m" and "249 m W of you" (2026-09-02) |
| Demo the walk in a hall that is not on Katipunan | The 08-27 Demo-campus row pinned a static coordinate; a still pin is not a walk | `DEMO_WALK` 42 s loop, default on | S | Open `/map` with no permission granted: the marker moves, the coordinate changes, and the card flips to an arrival state without any browser prompt. PASS iff the loop stays inside `CAMPUS_BOX` and reaches ≥3 encounters | **done** — measured moving 23.86%→26.86% in 2.5 s; loop reaches ≥3 encounters in test (2026-09-02) |
| Point a phone at a tree and see the tree | Word-doc photo ask; a file dialog on a projector is not a camera | `src/camera.tsx` on the camera sheet | M | Tap "Open camera": a live rear-facing stream appears with a LIVE badge; "Capture" freezes a frame and saves it as JPEG ≤1024 px. Denying permission or having no device shows the reason and a working file picker. PASS iff the stream is stopped on capture and on unmount | **done** — verified end-to-end against a fake capture device; frame stored as a `data:image/jpeg` (2026-09-02) |
| Get a suggestion back from a photo on a stage build | Detection returned `needs_token` in every browser — the feature was shipped but unreachable | `src/inat.ts` token read + `demo` state | M | With `VITE_INAT_API_TOKEN` set, a captured frame POSTs to iNat and live suggestions appear. Without one, the sheet shows a **recorded** reply labelled "RECORDED RESPONSE … It has not looked at your photo." PASS iff a recorded reply is never auto-applied to the student's pick and is never stored as attribution. Fail if weights ship or the banner says "we identified it" | **done** — `import.meta.env` read added; recorded reply is display-only, `top` is read from `status === "ready"` alone (2026-09-02) |
| Hand a walk's data to whoever asks for it | Cathy: AIS has species, missing count and location (`2:12:12`). A journal with no coordinate cannot close that | `/journal` export + `toGeoJson` / `toCsv` | S | A located sighting exports as GeoJSON (lon-first) and CSV carrying species, time, lat/lon, accuracy, fix source, note and walk id. PASS iff no photo data-URL enters either file and an absent position writes empty, never 0 | **done** — asserted in `journal.test.ts` (2026-09-02) |
| Open the walk with the wifi off | Stage wifi and campus dead spots | `public/sw.js` · `public/manifest.webmanifest` | S | Load once, go offline, reload: the app boots, routes work, and the map still draws every encounter. PASS iff the manifest carries 192/512 PNG icons including a maskable one | **done** — SW controlling, 5 shell entries cached, 8 discs render offline (2026-09-02) |
| Read the card for the tree you are actually next to | A pinned first encounter is not a walk | `/map` nearest-follow + pin | S | Walking changes the card to the nearest tree; tapping a disc pins it and shows Unpin; arriving inside 25 m pins automatically so the card holds still while you photograph. PASS iff the walker's own mark is never hidden behind the sheet at 390 px | **done** — compact `NearbyBar` replaces the 42 %-tall sheet as the resting state (2026-09-02) |

### Still open after this pass

| Item | What blocks it |
|------|----------------|
| Live iNaturalist computer vision at the showcase | Needs a real `VITE_INAT_API_TOKEN` in the build. The JWT lasts about a day, so it has to be refreshed on the morning of Sep 12 — or the demo runs on the labelled recorded reply, which is honest but weaker |
| Encounter coordinates that are real trees | Every coordinate is projected from the hand-drawn map through `CAMPUS_BOX`. Still **blocked** on the AIS geo file (Kat `24:24`) — the export path now exists to receive it, or to help build it |
| Real walkable paths | Still dummy, still labelled dummy. **Blocked** on the ADMUNAV graph |
| Landmark tree oral history | Card ships with the gap stated. **Blocked** on an interview or a dated photo |
| Sightings leaving the device | Export is manual and photo-free by design. An iNaturalist upload path is still an unanswered privacy decision, not a missing feature |


## 2026-09-02 — UI pass: the plate bug, and a field-guide kit

Asked for better UI, referenced against `~/Code/gargar` + `~/Code/gargar-icons`
(the arranged kit — there is no prompt sheet in it; craft is read off the PNGs)
and this repo's own `docs/figma/brand-kit-generation-prompts.md`. Target feel:
an iNaturalist / Seek wrapper wearing Gargar's illustration language.

The headline finding was mechanical, not aesthetic:

| Measured | Value |
|---|---|
| Assets in `web-forest/src/asset/` | 26 |
| Fully opaque, with a paper plate baked in | **26 / 26** (`mode=P`, corner alpha 255) |
| Distinct plate creams across the set | 3 — `#FBFAF1`, `#EBE5CF`, `#E7E3CB` |

That is why encounter discs rendered as cream **squares** over the map and the
nav glyphs sat on tiles. It was never a drawing problem.

### P1 — shipped

| Item | What it closes | Surface | Effort | Benchmark (Tier 3) | Status |
|------|----------------|---------|--------|--------------------|--------|
| Stop the kit rendering as a sticker sheet | 26/26 assets opaque; discs read as squares | `script/deplate.py` | S | Every asset has real alpha and the artwork is intact. A colour key is a FAIL — the same cream is a legitimate interior fill (journal page, camera body, pin well), so keying by colour punches holes. PASS iff the fill is border-connected only and the ink contour keeps its antialiasing | **done** — 26/26 keyed, 17.6–81.4% cleared per asset, originals in `script/asset-with-plate/` (2026-09-02) |
| Give a species one look, everywhere | Each screen invented its own wash and thumbnail | `src/ui.tsx` | M | `TaxonThumb` / `TaxonName` / `PrimaryPill` / `Chip` / `Fab` / `Card` are the only species-rendering path. Ring colour comes from the taxon. PASS iff a threatened species never shows a red ring next to a green "Native" badge | **done** — `accentFor` and `PrimaryPill` both rank Threatened over origin (2026-09-02) |
| Make the walk feel like a field guide, not a form | Nav was flat, the journal was a 2-up card list, there was no primary capture control | `/map` `/journal` bottom nav | M | Bottom nav marks the active route with a pill, not only colour. `/journal` is a Seek-style circular collection grid, seen in colour and not-yet in grey. `/map` carries one round shutter above the bar. PASS iff the walker's own mark stays visible at 390 px | **done** (2026-09-02) |
| Add the glyphs an iNat wrapper needs | No identify, locate, walk, shutter or export glyph existed | `src/asset/icon/` | M | Five new glyphs in the same system: `leaf_scan` `shutter` `locate` `walk` `export`. PASS iff each is 1024×1024, within the declared six-colour palette, and transparent | **done** — 5/5 met the contract; spec at `docs/figma/field-guide-ui-icon.spec.json` (2026-09-02) |
| Never ship a glyph nobody can see | The kit is green-on-ink for a paper ground; three controls put it on green | `Chip` · `Fab` · `GlyphDisc` | S | No kit glyph sits directly on a filled dark surface. PASS iff `Chip` is paper-backed with the state in its border, `Fab` is a paper disc with a coloured ring, and every glyph inside a filled button is wrapped in `GlyphDisc` | **done** — caught in browser review, not in code (2026-09-02) |
| Fix a service worker that pinned the app to a stale build | v2 cache-firsted every same-origin GET, so `vite dev` cached all 198 dev modules and served them forever — a white screen and `does not provide an export named 'AT_TREE_RADIUS_M'` while `tsc` and `vite build` were both green | `public/sw.js` · `src/app.tsx` | S | Dev: 0 registrations, app renders, an edit is visible on reload. Prod: after two visits the worker holds the hashed `/assets/`, and the app boots with the HTTP cache purged **and** the network offline. PASS iff cache-first is limited to content-hashed URLs | **done** — dev 0 reg / 0 exceptions; prod cached 18 assets and booted offline with `Network.clearBrowserCache` (2026-09-02) |

### How the icons were made, and what that cost

Generated with `$codex` `imagen.mjs`: opaque on `#FF00FF`, keyed after. Magenta
rather than cream precisely because cream **collided with a palette colour** —
the same failure this repo had already shipped.

```
CODEX  leaf_scan (anchor) · locate · walk      3/5, then "Selected model is at capacity" twice
GROK   shutter · export                        2/2 on the documented fallback engine
                                               5/5 met the contract
```

The set is therefore **mixed-engine** and the seam is mild but real: the grok
two read slightly heavier than the codex three. Recorded here rather than
smoothed over.

### Still open

| Item | What blocks it |
|------|----------------|
| Species plates redrawn for a circular crop | The nine tree plates were drawn as square portraits; inside a circular thumb the trunk crops close at small sizes. Works, but a round-first redraw would be better — a batch, and quota-bound |
| A wordmark / app-icon lockup | The PWA icon is still the `plant` mark padded by script. `$brand-kit`'s Rendered path (HTML/SVG screenshotted), not an image model — image models garble exact lettering |
| One glyph per encounter type on the map | Every disc is the same plant mark; native / exotic / threatened could each carry their own. Cheap to fake with the existing ring colours before spending renders on it |


## 2026-09-02 — UI consensus from the treewatch reference set

Thirty links (one Dribbble collection + **29 shots**) were opened and looked at,
not read off their titles. Full survey, the fetch workaround, and the
adopt/defer/refuse table: [`docs/design/ui-consensus-treewatch.md`](docs/design/ui-consensus-treewatch.md);
URL index at [`docs/design/treewatch-shot.txt`](docs/design/treewatch-shot.txt).
Limitation: only each shot's **cover frame** was visible, so multi-attachment
case studies contributed one screen.

Seventeen consensus patterns were extracted with counts. Five are already
shipped here (four-tab bottom nav, map + bottom sheet, common-over-italic
scientific name, personal collection grid, sourced stat triad). **Twelve are
gaps → the rows below.** Six patterns were refused with reasons, five of them
re-confirming prior rejections (community feed · avatar pins of other students ·
points per stop · CO₂/survival-rate impact claims · commerce · steps/calories we
do not measure).

The load-bearing finding: **no shot in the set ranks people against each other.**
Every "progress" number in the reference — `3 of 5 discoveries`, `47 SPECIES`,
`2.8 km / 46 min / 7 species` — is about *this walk* or *my collection*. Counting
is therefore not a breach of the no-leaderboard rule; comparing is. Every row
below keeps that line.

### P1 — before Sep 12

| Item | What it closes | Surface | Effort | Benchmark (Tier 3) | Status |
|------|----------------|---------|--------|--------------------|--------|
| Give a walk a shape: ordered stops with progress | C3 — 6 shots (MOSS `3 of 5`, Arboretum `1–8`, FIELD waypoints, Whistler, TrailBlazer) draw the walk as a route; ours is a scatter of discs with nearest-follow | `/map` walk session · `src/campus-map.tsx` | M | Start a walk: the stops appear in a fixed order with a progress rail reading `n of N`. Reaching a stop advances it; the rail resets on a new walk. PASS iff the count is per-walk and no screen compares it to another person's. Fail if the order is recomputed from distance mid-walk | **open — RE-SCOPE (09-03)**: stops are biomes, not trees |
| End a walk with a receipt, not a stop | C4 — MOSS, Whistler, Arboretum, FIELD all close the loop; our `End walk` just stops | `/map` → walk summary sheet | M | Ending a walk shows distance walked, elapsed time, species seen, and which of them were new to the journal, with `View in journal`. Distance is the haversine sum of the fix track. PASS iff a demo-walk summary says on screen that the fix was the demo loop, and the summary object carries no rank/score/points/streak/level/xp key (extend `journal.test.ts`) | **open — survives**: receipt now counts biomes entered + species seen |
| Quote the walk in minutes, not only metres | C5 — 5 shots label pins in walking minutes (Arboretum per-pin, UniNav `200 m · 5 min · Walking`, MOSS, Walkguide) | `NearbyBar` · encounter card · stop list | S | An encounter reading `249 m W of you` also reads `≈3 min walk`. PASS iff the assumed pace is stated on screen (1.3 m/s) and the metre figure stays the primary number. Fail if minutes are shown without the metres | **open** |
| Make a pin say what kind of thing it is | C12 — asklepios ships a six-variant pin family, Weagle pins carry status; every disc of ours is the same plant mark. Closes the "one glyph per encounter type" row left open on 09-02 | `src/campus-map.tsx` · `src/ui.tsx` | M | Native / exotic / threatened / restricted / you-are-here are distinguishable **in greyscale** — shape or ring weight, not colour alone. A cluster renders one count pin. PASS iff no kit glyph sits directly on a filled dark surface (`GlyphDisc` rule) and the walker's own mark is never occluded at 390 px | **open — survives, re-aimed**: distinguishes biome type, not tree type |
| Say what a species is actually like | C7 — Foragely's 2×2 characteristics + `Distribution & Habitat`, Birdie's 3-up tiles, Nautilus's labelled rows; we ship pills only | species card · `src/data.ts` | M | Each curated species shows at least three attribute tiles and a habitat line, **each carrying a source**. PASS iff every field traces to a citation already in `data.ts`; a species with two sourced facts ships two tiles. Fail if the grid is filled to look complete | **open** |
| Warn where misidentification actually bites | C8 — Foragely puts the poisonous look-alike *above* the species name. We carry a documented confusion pair | Lagundi / Molave cards | S | Opening either of Lagundi (*Vitex negundo*) or Molave (*V. parviflora*) shows a caution naming the other and the difference. PASS iff the two stay separate records (the merge is a standing rejection) and the caution does not imply this app resolved the ID | **open** |
| Frame the collection as seen-of-total, with an index | C9 — Insect Explorer `47 SPECIES`, Nautilus `Specimens catalogued: 128` / `№0231` | `/journal` grid header | S | `/journal` reads `4 of 9 species seen` and each logged sighting carries a stable local index. PASS iff the summary still fails a search for rank/score/points/streak/level/xp, and the total is the curated list length, not a campus-wide claim | **open — RE-SCOPE (09-03)**: `n of N` is now per-biome |
| Ask the student what they noticed | C10 — Margin's `What did you notice this morning?`, Nautilus's `date · place · depth` entry head; we store a note but never ask for one | camera sheet → journal entry | S | Saving a sighting offers a one-line prompt, and the saved entry heads with date · place · accuracy. PASS iff the note stays optional and an entry saved without one renders cleanly. Fail if the prompt blocks the save | **open** |
| Filter the map by what you care about | C11 — 5 shots put chips over the map/list (Whistler, Walkguide, UniNav, Nautilus, Weagle) | `/map` chip row | S | Chips filter discs by native / exotic / threatened / arboretum. PASS iff chips are paper-backed with state in the border (kit rule), on/off is readable at 390 px, and the restricted hatch is not filterable away | **open** |
| Report a tree the guide does not have | UniNav's `Go / Report / Save`. This is the count-and-location gap Cathy named (`2:12:12`) turned into an affordance, and the GeoJSON export already exists to carry it | `/map` report action · `journal.ts` export | M | A report saves species-unknown + coordinate + accuracy + note locally and leaves as a distinct feature type in the GeoJSON/CSV export. PASS iff no screen claims the report was sent to AIS or to anyone, and no photo enters the export | **open** |
| Make the projector view a kiosk, not a phone stretched wide | C13 — 5 of 6 desktop shots use left rail · centre map · right data column; Sep 12 is a 1440 px projector | `DesktopTopBar` → desktop shell | M | At 1440 px: persistent left rail, map filling the centre, encounter + stats in a right column. At 390 px the bottom nav is unchanged and nothing overflows horizontally. PASS iff Demo campus is still on by default on the desktop build | **open** |
| Date the stat strip | C14 — Nautilus prints `Last updated: March 2024`; our AIS figures carry a source but no as-of date in the strip itself | home stat strip | S | Each stat tile reads its source **and** its year on screen (`AIS · SY 2025–2026`). PASS iff no figure is labelled "our survey" — the standing invariant | **open** |

### Decisions this set forces (not tasks)

| Decision | Why it is not a task |
|---|---|
| Deepen the palette — forest-dark surface + cream paper instead of `#45c223` on `#f9f9f9` | C15: 8 shots anchor on deep green + cream + one warm accent, and every outlier is a travel/social product. But these values are **Gargar's brand**, shared with a sibling pilot, and the `Chip`/`Fab` contrast rules were tuned against them. Brand call, then a retune — not a colour swap |
| A display serif for specimen and journal headings only | C16: the four most collected-object designs in the set (Nautilus, Margin, FIELD, Museum Orangery) all use one. YCLAP chrome is Montserrat. Defensible to split UI type from specimen type — the team should say so out loud rather than have it appear |
| One real campus photograph on the home screen | C17: 9 shots lead with a photograph of the actual place. Blocked on images we have rights to; Ateneo Wild's catalogue is a partner ask (`2:11:32`), not a download |
| QR at the arboretum tree | Arboretum's strongest mechanic. Needs physical plaques and CFMO/AIS cooperation — real, but not two-weeks real. The points half stays rejected |
| Species call audio | Birdie's play-and-waveform. We hold no recordings; a play button with nothing behind it is exactly the claim class this repo bans |

### Refused from this set

Community feed / follows / stories / star reviews (TrailFinder, Wanderly, Folio) ·
avatar pins showing where other students are (Find, asklepios) ·
points or coins per stop (Arboretum `100 b`, Folio) ·
impact dashboard with CO₂ offset, survival rate and "secured by protocol" (ForestDrop) ·
booking, payments, creator tips (WildWander, Folio) ·
steps / calories / weather we do not measure (Whistler).
Reasons in [`docs/design/ui-consensus-treewatch.md`](docs/design/ui-consensus-treewatch.md); five of the six re-confirm rows already in [`docs/roadmap-rejected.md`](docs/roadmap-rejected.md).


## 2026-09-02 — a real basemap, and a desktop menu that was two-thirds fake

Asked for an actual map and a fix to the PC menu. Both were real defects; the
map change turned out to be the larger honesty event of the two.

### P1 — shipped

| Item | What it closes | Surface | Effort | Benchmark (Tier 3) | Status |
|------|----------------|---------|--------|--------------------|--------|
| Walk on the real campus, not a drawing of it | `/map` was a hand-drawn SVG with invented buildings, dummy footpaths and a fabricated canopy choropleth | `src/tile-map.tsx` · `src/campus-map.tsx` | L | Open `/map`: real imagery of Loyola Heights, drag to pan, zoom about the cursor, attribution visible. PASS iff overlays are placed through **Web Mercator** — a linear projection walks markers off their features as you pan | **done** — no map library; 16/16 tiles render at 1440px, 8/8 at 390px, 0 exceptions (2026-09-02) |
| Keep a metre on screen equal to a metre on the ground | The accuracy ring was a guessed percentage of a cartoon | `meterPerPixel` · accuracy ring | S | The ring radius is `accuracy_m / meter_per_pixel`. PASS iff Mercator pixel scale agrees with the haversine distance to within 1% | **done** — asserted in `geo.test.ts` (2026-09-02) |
| Stop drawing an off-limits grove on top of houses | The geofence was carried over from the drawing's percentages; on real imagery it sat on residential roofs north-east of campus | `RESTRICTED_POLYGON` · map caption | S | The polygon is over the wooded block inside the campus and the caption reads "placeholder extent, not surveyed". PASS iff no encounter spawns inside it **and** the demo walk never enters it | **done** — the walk test caught the second half and forced a re-route (2026-09-02) |
| Survive a dead hall with a real basemap | Tiles are cross-origin, so the worker skipped them and offline would have been a blank grey map | `public/sw.js` tile cache · `prefetchCampus` | M | Tap "Save offline", then go offline with the HTTP cache purged: every visible tile still draws. PASS iff the tile cache is capped and evicts oldest-first | **done** — 221 campus tiles at z17–19, 216 cached, 16/16 drawn offline (2026-09-02) |
| A desktop menu that is not two-thirds decoration | Nav was bare text while the phone had icons, and `EN` was a dead `<span>` styled like a locale switcher this app has never had | `DesktopTopBar` | S | The desktop nav carries the same four kit glyphs with the same active-pill treatment. PASS iff no header control is inert | **done** — `EN` replaced with a real "N logged" count that routes to `/journal` (2026-09-02) |

### What a photograph made visible

A hand-drawn base hides invented geography. Three things that were harmless
decoration on a cartoon became claims about real places the moment the imagery
went in, and all three were changed rather than kept:

| Was | Now |
|---|---|
| Dummy footpaths, labelled dummy, because the ADMUNAV graph was never shared | Removed — the real paths are in the imagery. The ask stays on `/plan` |
| A "canopy vs built" choropleth drawn from no data | Satellite ⇄ Street. The canopy is the photograph; Llorin et al. 2024 stays attached to the heat *claim*, not to a layer we computed |
| A hatched grove over what turned out to be housing | Moved onto campus woodland, captioned "placeholder extent, not surveyed" |

The demo walk had to be re-routed because the corrected geofence sat across it —
the scripted loop was marching a student through off-limits ground. That was
caught by a test, not by eye.

### Still open

| Item | What blocks it |
|------|----------------|
| A surveyed restricted boundary | Still a placeholder shape we drew. Needs CFMO, AIS or the SOM department to hand over the real extent — the map now says so in as many words |
| Encounter coordinates that are real trees | Still seeded from the drawing's percentages through `percentToLatLon`. They land on campus and on green, but they are not surveyed positions. Blocked on the AIS geo file, which the GeoJSON export is now shaped to receive |
| Pinch-to-zoom on a phone | Wheel, buttons and drag are wired; two-finger pinch is not. A phone can still zoom with the on-screen buttons |
| Own tile host or key | Both endpoints are public and used under attribution. Fine for a showcase, not for a public launch |


## 2026-09-02 — maphy as the map source: real walkable paths on campus

Asked to use `~/Code/maphy` (bygelo.com/maphy) for the map. What maphy could
give this PWA was measured rather than assumed, because most of what maphy is
does not apply here.

| maphy asset | Usable for the field guide? |
|---|---|
| MapLibre + PMTiles rendering stack, 398 indicators, Plate/embed/MCP surfaces | **No.** `web-forest` runs on react + react-dom with a hand-written slippy map (`src/tile-map.tsx`) and a hand-written service worker precisely so offline is ours. Adopting MapLibre nine days before the showcase hands both to a dependency |
| `data/processed`, `boundaries`, POIs, indicator manifests | **Unreachable today** — `data/` is symlinked to `/Volumes/gelo's`, which is not mounted. Anything depending on it is blocked on the drive |
| `apps/web/public/data/poi/school.geojson` | Reachable, but the 21 features over Loyola Heights carry no names — nothing the guide can say |
| **`data/routing/overture/segment|connector-…-120.900_14.400_121.200_14.800.jsonl`** | **Yes.** A local Overture Maps transportation extract (release 2026-08-19.0) covering 120.9–121.2 E, 14.4–14.8 N — Loyola Heights included, on local disk, not on the missing volume |

Measured inside `CAMPUS_BOX`: 812 connectors, 347 segments, of which **151 are
walkable** — 135 footway · 9 steps · 5 path · 2 pedestrian — totalling
**12,414 m declared**. The other 196 are service roads, residential and primary.

That closes a real gap. `/map` draws real imagery and real encounter
coordinates, but it had **no path geometry at all**: the walker walks on a
photograph, `DEMO_WALK` is twelve hand-picked percentages, and every distance is
straight-line. The consensus row "a walk is an ordered route, not a scatter of
pins" (C3) needs a network to route on, and now there is one.

**The honesty cost, stated because it is real:** maphy ingested those files for
routing, so it kept the graph (segment → connector ids) and **dropped the
segment linestrings**. Lines are reconstructed by joining connectors in order —
exact at every junction, chorded across a curve with no connector on it.
Measured against Overture's own `length_m`: **11,784 m drawn of 12,414 m
declared = 94.9 %**, median per-feature ratio 1.00, 13 of 151 features under
90 %. And these are OSM-community footways, **not** the ADMUNAV graph, which is
still unshared. Both sentences ship with the data.

### P1 — shipped

| Item | What it closes | Surface | Effort | Benchmark (Tier 3) | Status |
|------|----------------|---------|--------|--------------------|--------|
| Draw the paths a student can actually walk | `/map` had no path geometry — the ADMUNAV row has been blocked since 08-27, and C3's ordered walk has nothing to follow | `script/extract-campus-path.mjs` → `src/asset/campus-path.json` · `PathNetwork` in `src/campus-map.tsx` | M | 151 walkable features render over the imagery, steps dashed in mustard and everything else in green. PASS iff the credit line reads `Paths © OpenStreetMap contributors · Overture Maps` whenever the layer is on, every feature is a walkable class, every vertex is within 0.002° of `CAMPUS_BOX`, and the drawn length stays above 90 % of Overture's declared length. Fail if the file is presented as a survey or as ADMUNAV | **done** — `test/campus-path.test.ts`, 7 cases; 53/53 suite green; `tsc --noEmit` and `vite build` clean (2026-09-02) |
| Make the extraction repeatable rather than a one-off paste | A committed 27 KB JSON with no way to regenerate it is a dead end when the box or the release moves | `script/extract-campus-path.mjs` | S | `node script/extract-campus-path.mjs` re-derives the file from maphy and prints the retention percentage. PASS iff `--maphy` accepts another checkout and the output records source, release, licence, box and the geometry note | **done** (2026-09-02) |

### Still open on this path

| Item | What blocks it |
|------|----------------|
| Snap `DEMO_WALK` to the real network | The demo loop is still twelve hand-picked percentages. Snapping it to the footways is the natural next commit, and it interacts with `geo.test.ts`'s rule that the loop never re-enters the restricted polygon — so it is a change to make deliberately, not in passing |
| Walking distance *along a path* instead of straight-line metres | Needs the graph, not just the lines: connectors are in the extract, the shortest-path step is not written. This is what C5's `≈N min walk` should eventually measure |
| Exact curve geometry | The connector reconstruction loses 5.1 % of length. Two fixes, both network-bound: re-query Overture's S3 parquet for the campus bbox with geometry (duckdb is on this machine), or hit Overpass for the same bbox — Overpass timed out at 120 s when tried on 2026-09-02 |
| Which service roads count as walkable | 174 service segments were excluded. On this campus many are walkable in practice. A judgement call for whoever knows the ground, not a data question |
| maphy's boundary / indicator layers | Blocked on `/Volumes/gelo's` being mounted. Nothing in the current build depends on them |


## 2026-09-02 — campus.sisia.app / `sisia-app`: exact geometry supersedes the maphy cut

Pointed at `campus.sisia.app` and `~/Code/sisia-app` an hour after the maphy
section above was written. The campus app is an Ateneo Loyola Heights 3D spatial
map — rooms, buildings, dorms, canteens, live shuttles — and
`apps/campus/scripts/` holds the geodata it was built from. Two of those files
are strictly better than what maphy could give, so **the path layer's source has
been switched**; the maphy path stays in the extractor as `--from maphy`.

| sisia file | What it is | Verdict |
|---|---|---|
| `osm-ways.json` — 740 ways | The Overpass `out geom tags` answer for the campus bbox, with **full node geometry** plus name / surface / foot / bicycle tags. This is the exact query that timed out at 120 s when tried directly today | **Adopted.** 186 walkable ways inside `CAMPUS_BOX`, 825 vertices, 12,581 m, **100 % of true geometry** — and five named campus paths: EDSA Walk, College Lane, Paseo de Reily, Rainbow Bridge, Saint Ignatius Street |
| `campus-boundary.json` — 4 rings | OSM landuse rings: Ateneo de Manila University (118 points), the Grade School, the High School, Eliazo Hall | **Adopted.** Drawn as `CampusOutline` |
| `merged-buildings.json` — 2,417 buildings | Named footprints with storey counts; **97 named buildings** inside our box (Areté, Bellarmine Hall, Church of the Gesù, Blue Eagle Gym, Dela Costa Hall…) | **Not yet.** This is the honest fix for invented `where` labels on encounters — a row, not a paste |
| `phone-traces.json` — 3 traces, 2,226 points | Recorded GPS with per-point accuracy, pulled from the public e-jeep API | **Refused as the demo walk.** These are **shuttle rides**, not a student walking. Real GPS, wrong verb |

The measurement that matters most is not about paths at all:

| Ring | Points inside `CAMPUS_BOX` |
|---|---|
| Ateneo de Manila University | **61 of 118** |
| Ateneo de Manila High School | 5 of 29 |
| Ateneo Grade School | 2 of 28 |
| Eliazo Hall | 9 of 9 |

`CAMPUS_BOX` (14.635–14.6425 N, 121.074–121.082 E) is a rectangle this repo
picked. sisia's own bbox is 14.632–14.647 N, 121.0725–121.0832 E. **Our box
clips the campus north and east** — more than half the university's outline
falls outside it. Every encounter percentage, the demo loop and
`isInsideCampus()` are expressed against that rectangle, so this is a real
finding with a real blast radius.

### P1 — shipped

| Item | What it closes | Surface | Effort | Benchmark (Tier 3) | Status |
|------|----------------|---------|--------|--------------------|--------|
| Draw the paths at their true shape, with their real names | The maphy cut was 151 connector-chorded segments at 94.9 % of declared length and no names. sisia carries every OSM node and the campus path names | `script/extract-campus-path.mjs --from sisia` → `src/asset/campus-path.json` | S | 186 walkable ways render with full node geometry. PASS iff the file records its source repo, the licence reads ODbL, `length_retained_percent` is 100, and no vertex sits more than 0.002° outside `CAMPUS_BOX`. Fail if the file ever claims survey or ADMUNAV provenance | **done** — `test/campus-path.test.ts`; 56/56 suite green (2026-09-02) |
| Show where the campus actually ends | "On campus" was a rectangle we chose; nothing on screen distinguished it from the real ground | `src/asset/campus-boundary.json` · `CampusOutline` | S | Four OSM landuse rings draw as a dashed outline under the path layer. PASS iff the data says on its face that it is neither cadastral nor the restricted geofence, and the university ring's inside-the-box count is recorded rather than rounded away | **done** — 3 boundary cases assert it (2026-09-02) |
| Keep both sibling repos usable, and say which one spoke | A single-source extractor dies when the other machine has the other checkout | `script/extract-campus-path.mjs` | S | `--from sisia` and `--from maphy` both produce a valid file; the default picks sisia when present. PASS iff the output names the source and its retention percentage either way | **done** (2026-09-02) |

### Still open after this pass

| Item | What blocks it |
|------|----------------|
| **`CAMPUS_BOX` clips the campus** | Widening it to sisia's 14.632–14.647 / 121.0725–121.0832 moves `percentToLatLon`, every encounter's `x_percent`/`y_percent`, the twelve `DEMO_WALK` percentages and `isInsideCampus()` at once. That is a deliberate migration with its own benchmark, not a constant edit — and it should land before anyone re-derives coordinates from the current box |
| Encounter `where` labels from real buildings | 97 named footprints are sitting in `merged-buildings.json`. Naming the nearest building to each encounter would replace hand-written locations with something checkable |
| Demo loop that is a real recorded walk | sisia's traces are e-jeep rides. A student walking the campus with `record.html` would produce the honest version; nobody has |
| Whether sisia's 336 service ways are walkable here | Same judgement call the maphy pass left open, now with better data to answer it |


## 2026-09-02 — a friendlier default ground: four map presets

The map opened on satellite imagery, where a campus footway is a grey smear
under a tree canopy and 12.6 km of path stroke had to be drawn nearly invisible
to avoid reading as a net. Asked for a friendlier default with presets.

Four now exist, cycled by the single layer control (`nextLayer`, wrapping):

**Corrected the same day, on a key-free requirement.** The first cut of this row
shipped CARTO Voyager and Positron. Probed at the campus tile without a key,
both answer **HTTP 200 with a valid PNG that has "API KEY REQUIRED" printed
across it** — the status code says nothing. Esri's Light Gray Canvas failed the
same probe differently ("Map data not yet available" above z16), and OSM
Humanitarian 404s. The shipped set is the four that render real campus content
at z18 with no key, no token and no referer gate:

| Preset | Ground | Why it is in the set |
|---|---|---|
| **Guide** *(default)* | OSM standard | Draws this campus in the most detail — named buildings, Gonzaga Cafeteria, the Zen Garden, footways as dashes |
| **Trail** | CyclOSM | Greener and path-forward; amenity icons, footways in brown dash |
| **Paper** | Esri World Topo | Pale and minimal with named buildings, and it draws **no** footway — so our path layer is the only one, at full strength |
| **Satellite** | Esri World Imagery | Stays one tap away — the canopy line on `/map` points at the imagery itself, so it cannot be dropped |

A preset is not just a tile URL: each carries the overlay palette that reads on
it (`SOURCE[layer].theme` → path · step · halo · outline · `path_opacity` ·
`is_dark_ground`), including how loudly to draw: a ground that already renders
footways gets ours at 0.4, and Paper — which renders none — gets 0.85.
The paper-white, low-opacity path styling tuned for imagery now lives in the
satellite preset rather than being hard-coded into the overlay, and the light
grounds get deep green at higher opacity instead of white-on-white.

### P1 — shipped

| Item | What it closes | Surface | Effort | Benchmark (Tier 3) | Status |
|------|----------------|---------|--------|--------------------|--------|
| Open on a ground a stranger can read | Satellite-by-default made the walk hard to follow and forced the path layer to whisper | `SOURCE` presets · `nextLayer` · default `guide` | S | `/map` opens on Guide. The layer control cycles all four and names the current one. PASS iff every preset fetches a real campus tile at z18 **with no API key, token or referer**, its credit line renders, and no overlay colour is hard-coded outside `SOURCE[layer].theme`. A watermarked or placeholder tile is a FAIL even at HTTP 200 | **done** — four probed 200 with 6.9–16.0 KB of real content; 56/56 suite green, `tsc --noEmit` and `vite build` clean (2026-09-02) |

### Still open

| Item | What blocks it |
|------|----------------|
| Offline covers one preset at a time | `Warm campus` prefetches zoom 17–19 for the **showing** preset only. Warming all four is 4× the tiles for a hall that may not have the bandwidth; documented in `web-forest/README.md` instead of silently quadrupled |
| These are other people's tile servers | OSM, OSM-FR (CyclOSM) and Esri all publish reasonable-use policies. No key is needed, but a public deployment still needs its own tile host. Fine for a showcase, not for a launch |
| Nobody has seen any of this rendered | The four presets, the 186 paths and the campus outline are all verified by types, tests and build — not by eye. Still the top item on the list |


## 2026-09-02 (later) — reviewing the concurrent map work, and an invalid test

Files under `web-forest/src/` moved at 17:40–17:50 outside the session that
wrote the tile map: four basemap presets (Guide / Trail / Paper / Satellite,
default Guide), per-layer overlay themes, and a `campus-path.json` of 186 OSM
ways. Reviewed rather than trusted. The work is sound; three defects came out
of checking it, and one of them was mine.

| Item | What it closes | Surface | Effort | Benchmark (Tier 3) | Status |
|------|----------------|---------|--------|--------------------|--------|
| Cache the tiles of every basemap, not just two hosts | Trail is CyclOSM on `openstreetmap.fr`, which the worker's hardcoded host list did not match — it fetches fine online and is blank offline, the worst way to find out | `public/sw.js` · `test/sw.test.ts` | S | Every host in `SOURCE` is covered by `TILE_HOST`. PASS iff deleting a host from the worker fails the suite | **done** — proved by deleting the CyclOSM host and watching the test go red (2026-09-02) |
| Stop banking failed tiles as good ones | Tiles were fetched `no-cors`, so a CyclOSM **502 came back opaque with status 0** and was cached as if it were imagery — a permanent hole in the map that survives reloads | `sw.js handleTile` · `crossOrigin="anonymous"` | S | All four hosts send `Access-Control-Allow-Origin: *` (probed). PASS iff only `response.ok && type !== "opaque"` is cached | **done** (2026-09-02) |
| Make "Save offline" mean what it says | It warmed only the active layer, so tapping it on Guide and switching to Satellite on stage — the switch `/map` invites — gave a blank map | `warmCampus` | S | Warms the current layer **and** Satellite. Trail is deliberately excluded: CyclOSM is volunteer-run and asks not to be bulk-downloaded | **done** — 498 tiles cached across three hosts (2026-09-02) |
| Make the basemap table testable | `SOURCE` lived in a `.tsx`, and Node's type stripping cannot load JSX, so no test could read it | `src/basemap.ts` | S | The table is importable by a test. PASS iff the suite covers host, attribution, max zoom and theme per layer | **done** — 65 tests (2026-09-02) |

### An offline claim I made without proof

Earlier in the day I reported offline as verified — "HTTP cache purged, network
off, every tile draws". **That test was invalid.**
`Network.emulateNetworkConditions` applies per target, and the service worker is
its own target, so the page went offline while the worker that serves every tile
stayed on the real network. Measured: `navigator.onLine === false` while a fetch
to a never-cached tile returned **HTTP 200**.

Re-run with `Target.setAutoAttach` and emulation applied to every session, and
with a never-cached URL asserted to fail first:

```
proof — uncached fetch   BLOCKED      (before reload)
proof after reload       BLOCKED
app                      renders
discs 6 · paths 242 · journal reachable · exceptions 0
Guide 25/25   Trail 16/16   Paper 16/16   Satellite 20/20
```

The conclusion happened to survive. The method did not, and a green result from
a test that cannot fail is worth less than no test at all.

### Still open

| Item | What blocks it |
|------|----------------|
| Live iNaturalist computer vision | Never yet run in a browser here. Needs a real `VITE_INAT_API_TOKEN`; the JWT lasts ~24 h, so it has to be refreshed the morning of Sep 12 |
| Trail offline | Excluded from the warm on purpose. It caches whatever you browse, so it fills in as you use it — it is just not guaranteed |
| Pinch-to-zoom | Drag, wheel and buttons work; two-finger pinch is not implemented |
| PWA install on a real handset | Manifest and icons are right; never tested on an actual phone |

## 2026-09-03 — the biome pivot (from the Sep 2 pulong)

The 09-02 pulong changed the project's objective on the record (`51:20`, Ivan:
*"originally ang plan natin is to single out lahat… baka pwede natin to change
that objective"*). The unit of play is now the **area**, not the tree. Brief:
[`docs/plaud/2026-09-02-pulong-website-biome-showcase.md`](docs/plaud/2026-09-02-pulong-website-biome-showcase.md).
Design response, biome cut, asset research and the mechanics table:
[`docs/spec/biome-gamification-brief.md`](docs/spec/biome-gamification-brief.md).

**Grounding finding that scopes the whole tier:** an Overpass sweep of every
`landuse` / `natural` / `leisure` polygon inside `CAMPUS_BOX` returns **40
polygons, zero `natural=wood`, zero `landuse=forest`**. Sunken Forest and the SOM
grove are not tagged in OSM at all; the only `landuse=forest` nearby
("Mini-forest", `14.64386, 121.07732`) sits **north of `CAMPUS_BOX.north`**, so
our own rectangle clips it out. **Biomes must be hand-drawn, not derived** — and
therefore labelled as our delineation, never as surveyed ground.

Four rows in the 09-02 UI-consensus set are annotated above: two re-scope (walk
stops → biomes; `n of N` → per-biome), two survive re-aimed.

### P0 — before Sat 09-05 (pitch deck)

| Item | What it closes | Surface | Effort | Benchmark (Tier 3) | Status |
|------|----------------|---------|--------|--------------------|--------|
| Decide the ranking question, on the record | `journal.test.ts` forbids `points`/`level`/`rank`, sourced to Sophie in `docs/roadmap-rejected.md` — but Sophie is choosing between level-up and blind box at `1:10:09`, and Ivan defers at `1:10:38`. The rule is contradicted and nobody has lifted it | meeting minute + `docs/roadmap-rejected.md` | S | A written line naming the option (lift / keep-narrow / defer) and who agreed. PASS iff `roadmap-rejected.md` is updated to match — reversal or re-affirmation, dated | **open** |
| One biome rendered end to end | Proves the pivot on screen before the deck is written | `src/campus-map.tsx` | M | Sunken Forest draws as a filled polygon in the green ramp; entering it pops its top-three species. PASS iff the fill is labelled our delineation, not surveyed | **open** |
| Character concept, one frame | Egg → tree was asked for at `1:05:55`; blocked on nothing but art | `docs/figma/` | S | Four stages in the existing ink-contour style, sized for the journal screen. PASS iff it reads at 390 px and does not introduce a second art language | **open** |

### P1 — website week 09-10 → 09-11

| Item | What it closes | Surface | Effort | Benchmark (Tier 3) | Status |
|------|----------------|---------|--------|--------------------|--------|
| All 7 biomes drawn and named | `52:26` Gelo: "we need to specify which areas or how we're gonna cut up the map" | `src/asset/campus-biome.json` | M | Every polygon carries a name, a species list and a source note. PASS iff restricted ground is *subtracted* not overdrawn, and no polygon claims to be surveyed | **open** |
| Extend `CAMPUS_BOX` north | Our rectangle clips Mini-forest and 57 of the university ring's 118 points | `src/geo.ts` | S | Mini-forest (`14.64386`) falls inside the box. PASS iff `geo.test.ts` still passes and the demo walk stays off restricted ground | **open** |
| Point-in-biome replaces nearest-tree | The 25 m / 8 m proximity rule was a per-tree unit | `src/nearby.ts` | M | Entering a biome pops its card; leaving clears it. PASS iff the haversine encounter test still passes for within-biome species | **open** |
| Species card front and back | `1:00:34` Ivan: "don't overfeed too much… cocomelon, not an informational video" — but no citation may be dropped | `src/ui.tsx` | M | Front shows ≤4 elements; every sourced claim reachable in one tap. PASS iff nothing sourced is deleted, only moved | **open** |
| Biome green ramp, quieter basemap | `1:03:48` one green not rainbow; `1:01:25` "a lot of lines" — `PathNetwork` draws 186 footways | `src/tile-map.tsx` · `src/basemap.ts` | M | 7 biomes distinguishable **in greyscale** by fill value; footway layer at whisper or off by default. PASS iff ODbL credit still renders whenever the path layer is on | **open** |
| Per-biome progress, personal only | `59:29` top three; `51:34` badge per area | `src/journal.ts` | M | `/journal` reads `2 of 3 seen` per biome. PASS iff the summary carries no cross-user field and the rewritten `journal.test.ts` asserts the *new* rule rather than being deleted | **open** — blocked on the P0 ranking decision |
| Character with four stages | `1:05:55` egg → seedling → tree; `1:08:20` loses leaves when unvisited | `src/ui.tsx` | M | Stage advances on biome completion; absence changes appearance but never removes progress. PASS iff recovery is possible and no stage is lost | **open** — blocked on the P0 ranking decision |
| Blind-box reveal | `1:04:45` Sophia, Pop Mart style | camera → journal | M | Completing a biome plays a reveal and grants a cosmetic variant. PASS iff nothing is purchasable and nothing is scarce | **open** — blocked on the P0 ranking decision |

### Refused / deferred from this set

| Refused | Reason |
|---|---|
| Deriving biomes from OSM | The data does not exist inside campus — see the Overpass sweep above. Hand-draw |
| three.js in the app bundle | ~168 kB gzipped against a 92 kB app whose whole story is offline. `<model-viewer>` for one model, or render 3D into the deck instead |
| CC0 low-poly trees inside the product | Quaternius / Poly Pizza / Kenney are all CC0 and usable, but they clash with the hand-drawn field-guide art. 3D belongs in the pitch, not the product (`1:07:02` Ivan already framed it that way) |
| Spawn timers we cannot justify | `33:04` asked for rarity and urgency; rarity must derive from real observation gaps, not an invented respawn clock |
| Public leaderboard / race / cross-user comparison | Still rejected with named sources pending the P0 decision |

## 2026-09-03 (later) — 3D is in scope, and the biome seed exists

Two changes to the section above, both owner decisions taken after it was written.

**1. 3D is adopted.** The 09-03 brief recommended keeping 3D out of the bundle;
the owner overruled that — the character, and the unboxing moment that reveals
it, are to be built in 3D. The recommendation is not re-litigated here; what
follows is the honest cost of doing it well.

- **Renderer:** `<model-viewer>`, self-hosted — **not** three.js directly, and
  **not** loaded from unpkg. model-viewer's own issue tracker documents models
  failing to load when the library is served from a CDN, and this app's whole
  story is offline: the component JS *and* every `.glb` must be precached by
  `public/sw.js` or the character is a blank box on stage.
- **Budget:** the app is 92 kB gzipped today. 3D is the single largest thing
  ever added to it. The gate is a **hard ceiling, not a hope** — see the P1 row.
- **Pipeline:** [glTF-Transform](https://gltf-transform.dev/) for Draco or
  Meshopt plus KTX2; texture cap 1024 px. Draco is documented at up to 10×
  geometry reduction, and quantization + meshopt has taken real models from
  29 MB to 2.5 MB. Assume nothing ships uncompressed.
- **Scope boundary:** 3D is for the **character and the unboxing**. The map
  stays 2D raster tiles with biome fills. Putting 3D trees on the map is a
  separate, much larger job and is not in this tier.

**2. The biome seed is committed** — `web-forest/src/asset/campus-biome.json`,
generated from a live Overpass sweep. **10 biomes: 7 carry real OSM geometry,
3 have no ring at all** and are blocking until someone draws them (Sunken
Forest, academic core, Katipunan edge). Every placeholder is flagged
`is_placeholder`, and `species_code` carries provisional assignments lifted
from the existing demo encounter seeds — labelled as demo-map positions, never
as a survey. The AIS inventory (due 09-09) supersedes them.

**`CAMPUS_BOX` is measurably too small.** Against the real biome extent it
clips **~137 m off the south** (De La Costa reaches 14.63376), **~216 m off the
north** (Mini-forest reaches 14.64444) and **~131 m off the east** (121.08323).
Proposed: `north 14.6455 · south 14.6330 · west 121.0740 · east 121.0840`.

Full build spec, sequenced for a single implementer:
[`docs/spec/biome-3d-build-spec.md`](docs/spec/biome-3d-build-spec.md).

## 2026-09-03 (later still) — sectors cut by the paths, and the imagery gets a vote

Two owner corrections landed after the section above was written, and both
changed what the unit of play *is*.

**1. Sectors are cut by the paths and roads, not by boxes.** The 09-03 seed drew
biome rings by hand; three had no ring at all. The correction: separate the
groves *by the paths/roads, into sectors*. So nothing is drawn any more.
`script/build-sector.mjs` nodes the real OSM road+footway network over campus
and walks the planar arrangement — a sector is a FACE of that network, the way a
city block is defined by its streets. **94 sectors, 38.8 ha**, every boundary
ODbL OSM geometry rather than our delineation. `is_placeholder` is gone because
there is nothing left to flag; `is_named_by_us` marks the 5x names we chose
where OSM has none.

**2. "No building here" is not "grass grows here".** The first cut coloured
sectors by building cover, so a car park — which has no building on it — scored
as pure lawn and the map painted the Areté deck and the JSEC service aisles as
grass. Caught on sight by the owner. `script/measure-vegetation.mjs` now
composes **Esri World Imagery** over campus and measures an excess-green index
(`ExG = 2G − R − B`) per sector, so the colour follows the ground rather than an
inference. It settles exactly the cases that were wrong: "Walk by Matteo Ricci
Study Hall" measures **11% vegetation at 0% built**; "Walk by Covered Court"
**14%**. Ground below 45% vegetation is no longer a biome — still drawn, as the
asphalt it is, but it carries no species and cannot be tapped to log a tree.
**68 of 94 sectors are walkable biomes.**

### Shipped

| Item | What it closes | Surface | Benchmark (Tier 3) | Status |
|------|----------------|---------|--------------------|--------|
| Sectors cut along the path/road network | `52:26` Gelo "specify how we're gonna cut up the map", plus the 09-03 correction that boxes are the wrong shape | `script/build-sector.mjs` · `src/asset/campus-sector.json` · `src/sector.ts` | PASS iff every sector boundary is OSM geometry, no ring is hand-drawn, and slivers below 0.14 compactness are dropped — `sector.test.ts` | **done** (2026-09-03) |
| Extend `CAMPUS_BOX` north | The rectangle clipped Mini-forest and 57 of the university ring's 118 points | `src/geo.ts` | Mini-forest falls inside the box; `geo.test.ts` still green and the demo walk stays off restricted ground | **done** |
| Point-in-sector replaces nearest-tree | The 25 m / 8 m rule was a per-tree unit | `src/nearby.ts` · `src/sector.ts` | Entering a sector opens its card, leaving clears it; off-network returns null rather than guessing nearest | **done** |
| Vegetation measured from satellite, not inferred | Owner: parking lots and paved walkways were being painted as grass | `script/measure-vegetation.mjs` | PASS iff `greenness()` reads `vegetation_ratio`, every sector was sampled, and no sector below 0.45 is a biome or carries species | **done** |
| Pokémon-GO play view | Owner: "simple pokemon go like with character 3d looking, map view, friendly and less cluttered ui" | `src/play-map.tsx` | 390 px: raked camera, one green ramp, ≤5 labels, no horizontal overflow, ODbL credit still on screen | **done** |
| Character with four stages | `1:05:55` egg → seedling → tree; `1:08:20` loses leaves when unvisited | `src/character.tsx` · `src/stage.ts` | Stage rises with sectors walked and never falls; vigor droops on absence and fully recovers; no stage is ever lost | **done** |
| 360° camera that pivots on the walker | Owner: "move my camera around 360 … and my egg is walking" | `src/tile-map.tsx` | Two fingers (or shift-drag) swing the bearing; the walker stays centred and upright; compass returns north. `?bearing=` seeds it for a projector | **done** |
| Field view shows the same ground | Owner: "fieldview still doesnt have the new updated map" | `src/campus-map.tsx` | Field draws `sector.ts`, not the old biome seed; it keeps every layer control and citation | **done** |
| The mode switch never moves | Owner: "i want the switch to be in the same place always" | `MapChrome` in `src/app.tsx` | Both views render their controls through one frame, mode switch first in the top-right column. PASS iff the switch occupies the same slot in Play and Field at 390 px and 1440 px | **done** (2026-09-03) |
| Field chrome stops overlapping itself | Owner: "fix the ui for the field guide" | `MapChrome` · `geo_chip` | Desktop no longer stacks the switch on the coordinate pill; "Following" and "Save offline" render once, not twice; chips wrap in a full-width row instead of one-per-line on 390 px | **done** (2026-09-03) |
| Contact owners on `/plan` | The 09-03 announcement assigned Charisse (MO), Clariz (MO/AIS), Sophie (orgs), Ivan (CFMO) | `src/data.ts` · `/plan` | Each consult row names its owner and still reads "not yet" — an assignment is not a meeting | **done** |

### Not done, and why

| Item | Why not |
|---|---|
| three.js for the map's grass and birds | Asked for directly; **not done, and this is a deliberate deviation.** Ambient life ships as SVG/CSS instead — canopy tufts scattered on measured-vegetated sectors, drifting birds — at ~0 kB. three.js is ~168 kB gzipped against a 128 kB app whose whole story is working offline on a hall projector, and it would buy decoration, not a mechanic. The adopted 3D scope from the 09-03 spec (a `<model-viewer>` character and the unboxing reveal) is untouched and still the right place for it — `CHARACTER_MODEL_SLOT` marks where the `.glb` drops in. Say the word and I will pull it in for the map too. |
| Species per sector | Only 2 sectors inherited provisional species from the 09-03 demo seed, and 1 of those sat on paved ground and was taken off. The AIS inventory (due 09-09) is the real source; the map does not invent assignments in the meantime. |
| Blind-box reveal, per-sector badges | Still blocked on the P0 ranking decision, unchanged. |

## 2026-09-05 — the 09-02 consensus rows, closed

Ran the open rows from the 09-02 UI-consensus set. Three of them turned out
to be **already shipped** and were closed on inspection rather than rebuilt:
the stat strip already read `AIS · SY 2025–2026` (source *and* year),
`sectorProgress` was already wired into the sector card, and the report-a-tree
**data layer** (`entry_kind`, `reported_name`, distinct GeoJSON `feature_type`)
already existed — only the affordance was missing.

Verifier-first throughout: every row below carries a test that encodes its
benchmark. Gate at the tip: `build 0 · test 0 (158 pass) · lint 0`.

| Item | Surface | Benchmark | Status |
|---|---|---|---|
| End a walk with a receipt | `journal.ts` · `WalkReceiptSheet` | Distance is the haversine sum of the recorded fix track; sectors entered in order; species seen and which were new; demo-driven walks say so on screen; no rank key at any depth | **done** — `Walk` gained a breadcrumb trail (`trackWalk`, 6 m floor so standing still adds nothing), `endWalk` returns a `WalkReceipt`, no-fix walks report `is_distance_unknown` rather than a confident 0 m |
| Quote the walk in minutes | `geo.ts` · `NearbyBar` · sector card | `249 m W of you` also reads `≈3 min walk`; pace stated on screen; metres stay primary | **done** — `WALK_PACE_MS = 1.3`, pace printed next to the figure |
| Seen-of-total with a stable index | `journal.ts` · `/journal` | `n of 9 species seen` against the curated list, not the padded grid; each entry carries a stable local index | **done** — `species_total` off `picker_order`; `entry_index` assigned once and never reissued, so deleting an early entry does not renumber the rest |
| Say what a species is actually like | `data.ts` · `SpeciesBack` | ≥3 attribute tiles + a habitat line, each with a source; every field traces to a citation already in `data.ts` | **done** — a test refuses any citation whose author token does not appear in that species' own record; where our curation is the only warrant, `CURATED_SOURCE` says so instead of borrowing a paper's authority |
| Warn where misidentification bites | Lagundi / Molave cards | Caution names the other and the difference; the two stay separate records | **done** — renders **above** the name in sheet and desktop column |
| Report a tree the guide lacks | camera sheet · export | Saves species-unknown + coordinate + accuracy + note, leaves as a distinct feature type | **done** — "It is not on this list"; a guess is fine, Unknown is fine, the position is the part AIS does not have |
| Make a pin say what kind of thing it is | `src/pin.ts` · `play-map.tsx` | Native / exotic / threatened distinguishable **in greyscale** | **done** — inner shape (round / square / triangle) + ring weight, threatened heaviest. Taxonomy lives in `pin.ts` because the runner strips types from `.ts` but cannot parse JSX |
| Filter the map by what you care about | `geo_chip` · both maps | Chips filter by native / exotic / threatened; restricted hatch not filterable away | **done** — empty set means show everything; the selected encounter is never filtered out from under its own card |
| Ask what the student noticed | camera sheet | A one-line prompt on save; stays optional | **done** — "What did you notice?" replaces a labelled empty box |
| Desktop kiosk shell | `DesktopRail` | 1440 px: persistent left rail, map centre, encounter + stats right column; 390 px unchanged, no horizontal overflow | **done** — measured 0 px overflow at 390 with the bottom nav unchanged. `play-desktop.png` and `field-desktop.png` re-shot at 3200×2000 against the new shell |

### Still blocked, and by what

| Item | Blocker |
|---|---|
| Species per sector | The AIS inventory. 6 of 68 walkable sectors name anything to find until it lands |
| Real walkable path graph | The ADMUNAV graph has not been shared |
| Landmark tree oral history | An actual interview or a dated photo. The card ships with the gap stated |
| Ledesma / Fatallo full PDFs | The mirror has no `pdf_url`; cards stay at abstract-level claims |
| PWA install on a real handset | Never tested on an actual phone |
| 3D character offline | `<model-viewer>` + every `.glb` must be precached or the character is a blank box on stage. Not verified |

### Noted while working

The pre-existing `make()` helper in `journal.test.ts` was missing `entry_kind`
and `reported_name`, so its literal no longer satisfied `Sighting`. It went
unnoticed because `tsconfig` does not cover `test/` — worth knowing that the
test files are **not** typechecked by the gate.

---

## 2026-09-08 — the species pack lands, the game gets a screen, and the project gets a name

Three passes in one day. The first was a **pull**: 67 commits of 3D model work
existed only on the Windows box. Git-over-SSH could not reach it (Windows
OpenSSH runs `cmd.exe`, which passes git's quoting through literally), so the
repo came across as a 138 MB `git bundle --all`. All seven `model-*` branches
were already merged into the tip; nothing was stranded.

The second was **wiring**: `spawn.ts`, `badge.ts` and `sync.ts` had shipped with
tests and no screen at all. The third was a **playtest**, which found three
things the type checker could not.

Gate at the tip: `build 0 · test 206 pass (was 158 this morning) · lint 0 errors`.

### The pack, as measured

| | |
|---|---|
| Species with a model | 1,098 — 627 Plantae, 215 Insecta, 122 Fungi, 43 Arachnida, 41 Aves, 50 others |
| Pack on disk | 83 MB, largest model 117 kB against a 120 kB cap |
| Quality gates | all eight at zero — disconnected · degenerate · bad-normal · near-duplicate · faceted · under-detailed · wrong-silhouette · floating face |
| Coverage | 1,098 / 1,098 verdicts, 0 missing, 0 invented, 0 duplicate |

### Shipped this pass

| Item | Surface | Benchmark | Status |
|---|---|---|---|
| A world that is out right now | `live.tsx` · `SpawnStrip` · play map | Same window → same world on every device; nearest-first with a fix, rarest-first without one and distance reported as null, never a confident 0 m | **done** — deterministic per `sector_code:window_index`; `live.test.ts` pins both orderings and the null |
| Walking to a find is the loop | `walkToSpawn` | Inside 40 m the camera opens on that species; outside it the map goes there and stops following, and the camera does NOT open | **done** — a find logged where you are not standing records the one thing the app exists to supply |
| A find says what kind of thing it is | `kind.ts` · `kind-mark.tsx` | A bird, a bracket fungus and a grass draw as three different shapes on BOTH the list row and the map marker | **done** — 1,073 of 1,098 species have no curated artwork and were all drawing as one plant silhouette, which says "plant" about a bird. Eleven taxon groups, drawn schematically; nothing pretends to be a species portrait |
| Rarity survives greyscale | `RarityPill` · spawn marker | Rarity legible without colour | **done** — one-to-four dot count on the pill, and the same count on the marker's stem, so the disc is free to carry the taxon glyph |
| A badge shelf that is a history | `BadgeShelf` · `/journal` | Grouped, earned-dated, and the count is of real badges | **done** — 13 badges, four groups |
| A badge may only claim what the journal proves | `badge.ts` · `badge.test.ts` | No badge name or blurb promises a fact outside this device; no two badges fire identically; every badge is reachable | **done** — see below |
| Multiplayer that cannot become a ranking | `sync.ts` · `server/sync-server.mjs` · `WorldStrip` | The wire has no field a rank could be built from; renders nothing at all when no server answered | **done** — `node:sqlite`, LAN-only, no auth. Photos and notes never leave the device |
| 3D character offline | `character-model.tsx` · `sw.js` | The four stage `.glb`s and the world data survive an offline load | **done** — closes the blocker carried since 09-05. `species-model.json` is precached too: it is the only input to the world, so without it offline the strip renders *nothing*, which is the worst way to find a gap on a hall projector |
| The project has a name | shell · manifest · header | Magisphere everywhere a human reads it | **done** — poll closed 09-08 21:32 (MAGIScover / MAGISphere / Eagle-Eyed) |
| Seven slides and a two-page note | `docs/showcase/` | Every figure measured in the repo or marked as not measured | **done** — [`deck-7-slide.md`](docs/showcase/deck-7-slide.md), [`concept-note.md`](docs/showcase/concept-note.md) |

### A badge that was lying, and why nothing caught it

`Shared Find` said "your first find **synced to the campus world**". Its check was
`lat !== null`. A phone that had never contacted a server earned it, and it was
`Count and Location` minus one clause besides — so the shelf's earned count was
inflated by a badge that rewarded nothing new and described something that had
not happened.

It shipped that way because `badge.ts` **had no test file at all**. It has one
now, and two assertions in it are the ones that would have caught this:

- no badge's name or blurb may promise a fact outside this journal — *synced,
  leaderboard, rank, other players* are a pinned regex
- no two badges may fire identically across a spread of journals, **and** every
  badge must be earned by at least one of them

The second failed three times while being written — Five Species vs Three
Grounds, Fifteen Species vs The Whole Campus, Fifteen Species vs Rare Catch —
every time because the fixture was too thin, never because the badges were
actually the same. Each needed a journal that pulls the pair apart. That is the
test working: it refuses a shelf whose distinctions are untested.

Replaced by **Return Visit** — the same ground walked again on a different day.
A journal fact, not a duplicate of anything, and the behaviour the project
actually wants, since monitoring is repeat looking.

### Two things fixed on the way in, from the PC's uncommitted work

The gamification layer did not typecheck as written, which is why it was still
uncommitted:

- `badge.ts` called `sectorAt(s)` with a `Sighting` whose `lat` is nullable. An
  unlocated find belongs to no ground, so it took the explicit null guard
  `seenSector` already uses.
- `sync.ts` accepted a `summary` of stage and level and never sent it. The
  server stores both **on the player row**, so every walker in the world list
  would have read back as a level-1 egg.

### Still open, and stated

| Item | Blocker or measurement |
|---|---|
| Species per sector | The AIS inventory. 6 of 68 walkable sectors name anything to find |
| Real walkable path graph | The ADMUNAV graph has not been shared |
| **Native bias is inert** | Only **9 of 1,098** pool entries carry an origin (6 Native, 3 Exotic); the sweep never asked for `establishment_means`, so `habitatWeight`'s 1.5× native multiplier reaches 0.8% of the world. `spawn.test.ts` holds the number so improving it breaks the test loudly instead of the world quietly staying flat |
| PWA install on a real handset | Still never tested on an actual phone. Runbook now exists (`web-forest/script/handset.md`) and the LAN path is verified serving; the FULL test needs HTTPS, because the service worker, geolocation and camera are all secure-context-only. Tailscale would have given tailnet-private HTTPS but the App Store build's CLI is sandboxed and `serve`/`cert` fail with `CLIError error 3` — recorded so nobody re-tries it. Remaining options both publish: a cloudflared quick tunnel, or the linked Vercel project |
| Any Output 2 usage number | We measure none of them. The concept note says so rather than inventing one |
| Landmark tree oral history | Still an interview or a dated photo away |

### Noted while working

Storage keys were **not** renamed with the product. `field-guide.sighting`,
`field-guide.walk`, `field-guide.player`, the `field-guide/…` GeoJSON feature
ids and the `field-guide-tile-v1` cache all keep their names: they are what a
device's journal and warmed campus are stored under, and renaming them four
days before the showcase would have orphaned real data to buy a matching
string.
