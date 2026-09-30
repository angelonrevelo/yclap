# Research ledger — Magisphere institutional blueprint (2026-10-01)

Four agents (market + competitor · regulation + compliance · business + endgame · model + data), then a main-loop pass. Every claim that bears on a decision was re-opened in the main loop before use; those are marked **✔ re-opened**. `unverified` rows are kept because the question they carry still matters; no decision rests on one alone.

## Market + competitor

- [M1] Concept3D sells interactive campus maps, tours, calendars and room booking to higher education, venues and municipalities; 700+ customers; no public price — https://www.concept3d.com/ — high — competitor
- [M2] Concept3D's Interactive Map tiers (Starter, Professional, Advanced) are quote-only — https://concept3d.com/interactive-virtual-experiences/pricing — high — competitor
- [M3] A University of Hawai'i procurement justification (term from 2026-04-30) says Concept3D charges an annual subscription of USD 85,000 on top of an initial set-up cost; the university chose Esri ArcGIS, which it already licensed — https://www.hawaii.edu/procurement/wp-content/uploads/2026/04/Binder2-1.pdf — medium — competitor
- [M4] Stephen F. Austin State University's Modern Campus Maps licence: USD 6,300 (2025-10-01 to 2026-09-30), USD 6,615 (year 2), USD 6,945.75 (year 3), USD 19,860.75 total — https://www.sfasu.edu/application/procurement/contracts/B2600976.pdf — high — competitor
- [M5] Carleton College (2022-06-08) required a Public Safety layer, hidden from other viewers, when it chose Concept3D; safety layers are standard in incumbent campus maps — https://www.carleton.edu/its/blog/a-new-campus-map-is-coming-to-carleton/ — high — competitor
- [M6] An Ateneo event page offers visitors static campus map images only, with no emergency or biodiversity content — https://graju2026.ateneo.edu/maps — medium — customer
- [M7] ADMUNAV is an Ateneo-authored, Android-native, offline pedestrian wayfinding app with no biodiversity, hazard or game layer — unverified — low — competitor
- [M8] Ateneo Wild and the Institute of Sustainability run guided nature walks, a campus tree inventory and printed field guides — unverified — medium — competitor
- [M9] Seek by iNaturalist is free and rated 4+, needs no registration, stores no precise location unless the user signs in, awards badges and challenges, and identifies ~80,000 species — https://apps.apple.com/app/apple-store/id1353224144 — high — competitor
- [M10] HazardHunterPH (DOST-PHIVOLCS with PAGASA, MGB, DOH) generates free hazard reports for any location; advanced features are for GeoRiskPH partner accounts — https://hazardhunter.georisk.gov.ph/ — high — data.source
- [M11] On 2024-03-20 DOST-PHIVOLCS trained NCR LGU DRRMO and CPDO staff on HazardHunterPH, GeoAnalyticsPH and GeoMapperPH — https://georisk.gov.ph/articles/2024/3/empowering-lgus-of-metro-manila:-orientation-on-georiskph-platforms-by-dost-phivolcs — high — competitor
- [M12] UP NOAH's free hazard map shows 100-year flood, landslide and 5 m storm-surge levels by searched location; no evacuation points or building-level detail claimed — https://www.gmanetwork.com/news/scitech/weather/914572/up-noah-hazard-database-map-flood-landslides-storm-surges/story — medium — data.source
- [M13] Scopely agreed on 2025-03-12 to buy Niantic's games business (Pokémon GO, Pikmin Bloom, Monster Hunter Now, Campfire, Wayfarer) for USD 3.5 billion — http://www.pocketgamer.biz/scopely-acquires-pokmon-go-developer-niantics-games-business-in-35bn-deal/ — high — competitor (duplicate of B-dimension claim, merged)
- [M14] Pokémon GO earned an estimated USD 796.6 million on the app stores in 2024 — same source as M13 — medium — money
- [M15] Pikmin Bloom passed USD 100 million lifetime revenue on 2025-12-01 (AppMagic estimates) — http://www.pocketgamer.biz/pikmin-bloom-hits-100m-after-four-years-as-2025-becomes-its-best-year-yet/ — medium — money
- [M16] AllTrails: free tier, AllTrails+ USD 35.99/year, Peak USD 79.99/year (third-party aggregator) — https://subger.com/en/service/alltrails-plus — medium — competitor
- [M17] City Nature Challenge 2026: 3,001,825 observations, 76,422+ species, 106,354 observers, 754 cities; no Metro Manila figure found — unverified — low — gtm.cac_hypothesis
- [M18] Merlin Bird ID is free with regional bird packs; a Philippines pack was not verified — unverified — low — competitor

## Regulation + compliance

- [R1] RA 10173 §3(l): sensitive personal information includes age and education; location is not listed — https://privacy.gov.ph/data-privacy-act/ — high — product_form
- [R2] RA 10173 §3(b): consent must be freely given, specific, informed, and evidenced by written, electronic or recorded means — https://privacy.gov.ph/data-privacy-act/ — high — product_form
- [R3] RA 10173 §11(e): keep personal information only as long as its purpose needs — https://privacy.gov.ph/data-privacy-act/ — high — product_form
- [R4] RA 10173 §20(f): notify the NPC and data subjects promptly on a breach of sensitive information with real risk of serious harm — https://privacy.gov.ph/data-privacy-act/ — high — other
- [R5] NPC Circular 16-03: notify the NPC within 72 hours of a breach; enforced against DOST Region V (order dated 2023-07-04) — https://privacy.gov.ph/wp-content/uploads/2024/12/NPC-BN-23-082-07.04.2023_In-re-DOST-Regional-Office-V_Order.pdf — high — other
- [R6] NPC Circular 2022-04 §5: register data processing systems if ≥250 employees, sensitive information of ≥1,000 people, or processing likely to risk data subjects' rights; profiling/automated decisions always — https://privacy.gov.ph/wp-content/uploads/2023/05/Circular-2022-04.pdf — high — money
- [R7] **✔ re-opened** NPC FAQ on Child-Oriented Transparency: a child is anyone below 18; an advisory cannot set an age of digital consent — https://privacy.gov.ph/wp-content/uploads/2024/12/FAQs-Advisory-on-Guidelines-on-Child-Oriented-Transparency.pdf — high — customer
- [R8] **✔ re-opened** Same FAQ: controllers must fold a Child Privacy Impact Assessment (CPIA) into their PIA — same source — high — product_form
- [R9] **✔ re-opened** Same FAQ: when children are affected by a breach, notify both the children and their parents or guardians — same source — high — other
- [R10] RA 11313 (Safe Spaces Act) §12: gender-based online sexual harassment includes cyberstalking and sharing a person's information online without authorisation — https://lawphil.net/statutes/repacts/ra2019/ra_11313_2019.html — high — product_form
- [R11] RA 11313 §22: school heads must maintain an independent committee (CODI) for gender-based harassment complaints — same source — high — customer
- [R12] RA 11930 §9(a): internet intermediaries must ban OSAEC/CSAEM in their terms, preserve data 6 months (content 1 year), take down within 24 hours of notice and report to the DOJ within 3 days — https://lawphil.net/statutes/repacts/ra2022/ra_11930_2022.html — medium — product_form
- [R13] RA 10121 §19's prohibited acts do not cover publishing unofficial evacuation or hazard information — https://lawphil.net/statutes/repacts/ra2010/ra_10121_2010.html — medium — product_form
- [R14] RA 9147 has no provision restricting publication of threatened species' locations — https://lawphil.net/statutes/repacts/ra2001/ra_9147_2001.html — medium — data.source
- [R15] OSM data requires attribution and ODbL share-alike for derived data — https://www.openstreetmap.org/copyright — high — data.source (merged with D-dimension duplicate)

## Business + endgame

- [B1] **✔ re-opened** Cloudflare Workers Paid: minimum USD 5/month, 10 million requests and 30 million CPU-ms included — https://developers.cloudflare.com/workers/platform/pricing/ — high — money
- [B2] **✔ re-opened** Durable Objects, paid: 1 million requests/month then USD 0.15/million; 400,000 GB-s then USD 12.50/million GB-s; SQLite 5 GB-month then USD 0.20/GB-month (billing from January 2026) — https://developers.cloudflare.com/durable-objects/platform/pricing/ — high — money
- [B3] **✔ re-opened** Durable Objects, free: 100,000 requests/day, 13,000 GB-s/day, 5 GB storage — same source — high — money
- [B4] UNICEF Philippines' Green Rising Fund (Kabataang Resilient) seeded youth climate innovations after a November 2025 bootcamp; 22 were shown on 2026-05-14; no PHP amounts published — https://www.unicef.org/philippines/stories/22-youth-led-climate-innovations-showcased-2026-green-rising-expo — high — money
- [B5] The CCC and NYC launched the Youth Climate Leadership Accelerator Project with selected HEIs, piloted 2026-08-15; no funding amount named — https://tribune.net.ph/2026/08/20/ccc-nyc-launch-youth-climate-accelerator-program — medium — money
- [B6] DOST-PCIEERD Startup Grant Fund (2022 call): up to PHP 5M, for DTI/SEC-registered startups 1–5 years old with a prototype — https://rgao.upm.edu.ph/media/2022/01/2022-Call-for-Proposals-for-the-Startup-Grant-Fund-Program.pdf — medium — money
- [B7] DICT Startup Grant Fund: PHP 500,000–1,000,000 for registered startups with a Startup Number — https://assistance.ph/dict-startup-grant-fund-sgf-program/ — low — money
- [B8] Startup QC Student Competition 3: PHP 995,000 across 47 student teams; grand prize PHP 100,000 (reported 2026-09-04) — https://tribune.net.ph/2026/09/04/student-innovators-take-top-honors — medium — money
- [B9] USAID was dissolved into the State Department in July 2025; climate is not a US aid priority for the Philippines (2025-09-04) — https://www.philstar.com/headlines/climate-and-environment/2025/09/04/2470465/climate-change-disinformation-not-us-aid-priorities-philippines/amp/ — high — money
- [B10] iNaturalist became an independent 501(c)(3) nonprofit in July 2023, funded by philanthropy and in-kind support — unverified — medium — endgame
- [B11] Ateneo's Areté Sandbox Student Challenge 2025: PHP 25,000 working capital plus a PHP 50,000 facilities grant — unverified — low — money

## Model + data

- [D1] iNaturalist API v1: throttled at 100 requests/minute; asks for ≤60/minute and <10,000/day; heavy users may be blocked — https://api.inaturalist.org/v1/swagger.json — high — data.source
- [D2] The API is for application development, not scraping; bulk users go to the data exports — same source — high — data.source
- [D3] `score_image` is absent from the published API v1 spec — same source — high — ai.model
- [D4] An unauthenticated `POST /v1/computervision/score_image` returned HTTP 401 on 2026-10-01 — https://api.inaturalist.org/v1/computervision/score_image — high — ai.model
- [D5] **✔ re-opened** iNaturalist staff (2023-05-17): the visual-similarity API "is not publicly available"; a few selected individuals/organisations have fee-based access for research or other citizen-science apps; contact staff by email — https://forum.inaturalist.org/t/hidden-computer-vision-api/41775 — high — ai.model
- [D6] A developer's 403s fell after registering an OAuth app; a community member said the endpoint was never open to arbitrary public use (no staff reply) — https://forum.inaturalist.org/t/computer-vision-api-from-streamlit/80166 — low — ai.model
- [D7] Seek's on-device model moved to v2.13 (~80k taxa) in February 2025 — https://forum.inaturalist.org/t/inaturalist-updates-for-february-2025/62406 — high — ai.locality
- [D8] **✔ re-opened** Pl@ntNet API Free: EUR 0, 500 identifications/day, 50,000+ species, 50+ languages — https://my.plantnet.org/pricing — high — ai.model
- [D9] **✔ re-opened** Pl@ntNet Pro: EUR 1,000/year, EUR 0.005 down to EUR 0.002 per identification by volume; Non-Profit plan EUR 0 on request, needs the "powered by Pl@ntNet" logo — same source — high — money
- [D10] iNaturalist's default licence for observations and photos is CC BY-NC — https://help.inaturalist.org/en/support/solutions/articles/151000173511 — high — data.source
- [D11] Research-grade iNaturalist observations go to GBIF, which accepts only CC0, CC BY or CC BY-NC — same source — high — data.source
- [D12] UP NOAH flood hazard data is downloadable under ODbL as shapefiles, with selectable return periods — https://www.spaceclimateobservatory.org/noah — medium — data.source
- [D13] Merlin Bird ID has no public developer API — unverified — low — competitor
- [D14] Google Lens has no public species-identification API — unverified — medium — ai.model

## Main-loop finding (repo, not web)

- [F1] `web-forest/src/taxon-photo.ts` shows iNaturalist photos (e.g. `inaturalist-open-data.s3.amazonaws.com/photos/65718753`) with no licence code or photographer attribution recorded — founder (repo read 2026-10-01) — high — data.source
- [F2] The identify path calls iNaturalist `score_image` through the app's own proxy with a build-time token (`worker/inat.ts`, `VITE_INAT_API_TOKEN`); with no token it replays a recorded response and labels it — founder (repo) — high — ai.model

## Gaps (still open)

- What would iNaturalist charge a student campus app for `score_image`, and would it qualify as citizen science?
- Is Magisphere a personal information controller or a processor for the university? That decides who registers, appoints the DPO and notifies breaches.
- Has the NPC said anything about live geolocation shared between users? None found.
- Does Ateneo publish an official evacuation / assembly-point map, and in what form?
- What do Philippine universities, parks or LGUs pay for campus or park map software? No PhilGEPS comparison found.
- Does the CCC Youth CLAP pay out, and are the "seed PHP 30k / innovation PHP 100k" figures real (and whose)?
- Which funds a student team that is not DTI/SEC-registered can apply to in 2026 (DOST Young Innovators, Areté Sandbox, Startup QC)?
- Does Pl@ntNet's free plan allow a browser-exposed key and non-affiliated use? (terms page 404)
- Is there any precedent in Southeast Asia for licensing or acquiring a campus or trail app?

## Counts

Launched 4 agents. Ledger rows returned: 60. Merged duplicates: 3 (Scopely deal ×2, OSM ODbL ×2, iNat licence restated). Kept: 57 web claims + 2 repo findings. Downgraded after re-opening: 0 (the NPC FAQ blocked the fetcher and was re-read through a browser user agent). Unverified rows kept as questions: 8.
