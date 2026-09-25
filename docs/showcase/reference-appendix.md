# Reference appendix: every link the repo cites

Ms. Shenina's ask (Ateneo CCC YCLAP chat, 09-14): one appendix of every reference link, uploaded to the shared Drive. This page is **generated from the repo**, not written from memory: every `http(s)` link in `docs/` and `web-forest/`, deduplicated and grouped by topic, **735 links** as of 2026-09-25 (`demo-0926`). Each group lists the file that cites the link, so a reader can check the claim it supports.

**Left out, on purpose:**

- **Per-species data links.** About 1,085 Wikipedia / iNaturalist links, one per species, in `web-forest/script/data/inat-species/species-counts-2026-09-03.json`, plus a few thousand iNaturalist photo URLs. They are data rows, not references. The source is cited below as the iNaturalist API.
- **Package, local and test URLs**: npm registry entries, `localhost` and LAN addresses, `example.com`, test fixtures.
- **Personal links**: prefilled Google Forms containing a student's own answers (`docs/health-assessment-*`, `docs/ogc-*`) and Plaud share links to team recordings. Those stay in the repo and are not for a shared Drive.
- **Design image files** (`cdn.dribbble.com`). The Dribbble shot pages are listed instead.

Links are listed as found. Some research links may have moved since they were collected in August. **Nothing here was re-checked for liveness on 09-25.**

To refresh it, pull every `https?://` match out of `docs/` and `web-forest/` (skipping `node_modules`, `dist` and `public`), apply the same exclusions, dedupe, and replace everything below the line. The extractor was a one-off script and is not committed.

---

## Magisphere app — map, data and API sources (21)

**`web-forest/script/fetch-inat-species.mjs`**

- <https://api.inaturalist.org/v1/observations/species_counts>
- <https://api.inaturalist.org/v1/taxa>

**`web-forest/script/fetch-osm-way.mjs`**

- <https://overpass-api.de/api/interpreter>
- <https://overpass.kumi.systems/api/interpreter>
- <https://overpass.osm.jp/api/interpreter>
- <https://overpass.private.coffee/api/interpreter>

**`web-forest/script/magi-asset/font/OFL-Fredoka.txt`**

- <http://scripts.sil.org/OFL>
- <https://github.com/hafontia/Fredoka-One>

**`web-forest/script/magi-asset/font/OFL-Nunito.txt`**

- <https://github.com/googlefonts/nunito>

**`web-forest/script/measure-vegetation.mjs`**

- <https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/>

**`web-forest/src/basemap.ts`**

- <https://a.tile-cyclosm.openstreetmap.fr/cyclosm>
- <https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile>
- <https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile>
- <https://tile.openstreetmap.org>

**`web-forest/src/data.ts`**

- <https://www.inaturalist.org/pages/seek_app>

**`web-forest/src/inat.ts`**

- <https://api.inaturalist.org/v1/computervision/score_image>
- <https://api.inaturalist.org/v1/observations>
- <https://www.inaturalist.org/observations>
- <https://www.inaturalist.org/observations?lat=>

**`web-forest/src/taxon-photo.ts`**

- <https://api.inaturalist.org/v1/taxa>

**`web-forest/src/tile-map.tsx`**

- <https://www.openstreetmap.org/copyright>

## Magisphere design and game references (45)

**`docs/design/treewatch-shot.txt`**

- <https://dribbble.com/angelo-revelo-gelo/collections/7931269-treewatch>
- <https://dribbble.com/angelo-revelo-gelo/collections/7931269-treewatch?page=2>
- <https://dribbble.com/shots/15244745-Park-Nearby-park-finder-app>
- <https://dribbble.com/shots/1995100-Nature-Observation-App>
- <https://dribbble.com/shots/20750179-Dashboard-Edu-Club-Student-Dashboard>
- <https://dribbble.com/shots/20952530-Museum-Orangery-Ui-website-design>
- <https://dribbble.com/shots/21257389-Trail-Finder-Community-Hike-Bike-App>
- <https://dribbble.com/shots/22132692-WildWander-A-hiking-trail-booking-app>
- <https://dribbble.com/shots/22294137-Hikeable-Map>
- <https://dribbble.com/shots/23623873-Travel-Website-Design>
- <https://dribbble.com/shots/24551486-TrailBlazer-Route-discovering-for-hiking-enthusiasts>
- <https://dribbble.com/shots/25520416--GreenTrack-Mapping-Nature-with-Intuitive-Design>
- <https://dribbble.com/shots/26228735-UniNav-University-Navigating-App>
- <https://dribbble.com/shots/26302717-Foragely-Edible-Wild-Plants-Foraging-App>
- <https://dribbble.com/shots/26356111-Walkguide-app-UI-concept>
- <https://dribbble.com/shots/26540528-App-Where-Learning-Meets-Play-The-Arboretum-Adventure>
- <https://dribbble.com/shots/26556435-App-Where-Learning-Meets-Play-The-Arboretum-Adventure>
- <https://dribbble.com/shots/26882401-asklepios-v3-AI-Health-Wellness-App-Map-Pin-Component-UI>
- <https://dribbble.com/shots/26893458-Insect-Explorer-App>
- <https://dribbble.com/shots/27112123-Bird-discovery-app>
- <https://dribbble.com/shots/27157920--Nautilus-Naturalist-Journal-App>
- <https://dribbble.com/shots/27289043-ForestDrop-Tree-Donation-App-UI>
- <https://dribbble.com/shots/27392393-Whistler-Hiking-App-UX-UI-Project>
- <https://dribbble.com/shots/27468623-MOSS-Plant-Identification-App-UI-Concept>
- <https://dribbble.com/shots/27587337-Folio-Social-Book-Club-Digital-Library-Mobile-App>
- <https://dribbble.com/shots/27596337-Wanderly-Travel-Planning-Community-Platform>
- <https://dribbble.com/shots/27653326-Weagle-Super-App-Operations-Dashboard>
- <https://dribbble.com/shots/27655399-FIELD-Travel-Journal-App>
- <https://dribbble.com/shots/27659154-Nature-UI-001-Bird-Card>
- <https://dribbble.com/shots/27660287-Margin-Journaling-App-UI>
- <https://dribbble.com/shots/9391128-Botanical-Card-Interaction>

**`docs/spec/biome-3d-build-spec.md`**

- <https://freefrontend.com/css-reveal-animations/>
- <https://gltf-transform.dev/>
- <https://kenney.nl>
- <https://poly.pizza/explore/Nature>
- <https://quaternius.itch.io/150-lowpoly-nature-models>
- <https://v3.magicui.design/docs/components/box-reveal>
- <https://yclap-field-guide.marangelonrevelo.workers.dev>

**`docs/spec/biome-gamification-brief.md`**

- <https://github.com/SNiLD/PokemonGoBiomes>
- <https://github.com/madjin/awesome-cc0>
- <https://medium.com/@Mapbox/design-your-own-pokemon-go-map-61c7ddb869cd>
- <https://pokemongohub.net/post/article/lets-talk-does-pokemon-go-meet-the-principles-of-ui-design/>
- <https://snazzymaps.com/style/71168/pokemon-go-map-style>
- <https://www.coohom.com/article/three.js-vs-model-viewer-vs-babylon.js-for-website-3d-integration>
- <https://www.gameuidatabase.com/gameData.php?id=1317>

## Ateneo campus, AIS and Loyola Heights (61)

**`docs/research/2026-08-archium-forest-pwa.md`**

- <https://archium.ateneo.edu/dev-stud-faculty-pubs/281>
- <https://archium.ateneo.edu/discs-faculty-pubs/235>
- <https://archium.ateneo.edu/discs-faculty-pubs/256>
- <https://archium.ateneo.edu/ecce-faculty-pubs/203>
- <https://archium.ateneo.edu/es-faculty-pubs/52>
- <https://archium.ateneo.edu/es-faculty-pubs/88>
- <https://archium.ateneo.edu/hs-faculty-pubs/35>
- <https://archium.ateneo.edu/jmgs/vol7/iss2/7>
- <https://archium.ateneo.edu/leadership-and-strategy-faculty-pubs/9>
- <https://archium.ateneo.edu/manila-observatory/11>
- <https://archium.ateneo.edu/manila-observatory/16>
- <https://archium.ateneo.edu/manila-observatory/5>
- <https://archium.ateneo.edu/physics-faculty-pubs/133>
- <https://archium.ateneo.edu/physics-faculty-pubs/162>
- <https://archium.ateneo.edu/physics-faculty-pubs/170>
- <https://archium.ateneo.edu/sa-faculty-pubs/91>
- <https://archium.ateneo.edu/theses-dissertations/723>
- <https://archium.ateneo.edu/theses-dissertations/726>

**`docs/research/wave3-agent/R14-katipunan-ateneo-heat.md`**

- <http://www.ateneo.edu/ais/programs/biodiversity>
- <http://www.ateneo.edu/laudato-si>
- <http://www.ateneo.edu/news/2024/05/31/ateneo-de-manila-university-begins-shift-renewable-energy-partnership-solx>
- <http://www.ateneo.edu/sustainable-development-goals/sdg-7/highlights>
- <https://archium.ateneo.edu/physics-faculty-pubs/133/>
- <https://doi.org/10.1088/2752-5295/addd41>
- <https://isprs-archives.copernicus.org/articles/XLII-4-W19/275/2019/>
- <https://theguidon.com/2023/04/admu-commits-to-becoming-laudato-si-university-by-2029/>
- <https://theguidon.com/2023/11/ateneo-admin-student-organizations-spearhead-greener-initiatives-in-second-year-of-laudato-si/>
- <https://theguidon.com/2023/11/defending-qcs-last-green-lungs-how-campus-biodiversity-shields-the-city-from-effects-of-climate-changes/>
- <https://www.ateneo.edu/features/2022/11/22/paving-road-sustainable-mobility-katipunan>
- <https://www.ateneo.edu/features/2025/03/18/ateneo-de-manila-forges-path-climate-action>
- <https://www.ateneo.edu/memorandum/2026/02/sustainable-university-master-plan-memo-u2526-070>
- <https://www.ateneo.edu/sites/default/files/2024-05/U2324-127%20Developing%20the%20Climate%20Action%20Plan.pdf>
- <https://www.mdpi.com/2073-4433/13/10/1658>
- <https://www.nature.com/articles/s41467-020-15218-8>

**`docs/research/wave3-agent/R35-ateneo-seeds-climate.md`**

- <http://philippinesociology.com/members/leland-joseph-dela-cruz/>
- <https://climate.gov.ph/>
- <https://disasterdisplacement.org/news-events/advisory/ateneo-de-manila-university-admu-school-of-government-asog/>
- <https://theguidon.com/2025/09/ateneo-drafts-sustainable-university-master-plan-outlines-sustainability-goals-until-2050/>
- <https://www.ateneo.edu/ais/about>
- <https://www.ateneo.edu/ais/mcr/homepage>
- <https://www.ateneo.edu/ais/partnerships>
- <https://www.ateneo.edu/ais/programs>
- <https://www.ateneo.edu/ais/programs/climate-and-disaster-resilience>
- <https://www.ateneo.edu/ais/sustainableateneo>
- <https://www.ateneo.edu/directory/directory-office/office-assistant-vice-president-social-environmental-engagement>
- <https://www.ateneo.edu/document/2026/02/ateneo-de-manila-launches-sustainable-university-master-plan-targets-until-2050>
- <https://www.ateneo.edu/news/2025/06/23/dr-leland-dela-cruz-speaks-53rd-association-foundations-general-assembly>
- <https://www.ateneo.edu/news/2026/03/coa-m-oavp-seeds-successfully-conclude-register-anywhere-program-comelec>
- <https://www.ateneo.edu/news/2026/06/ateneo-service-learning-initiatives-advance-finalists-uniservitate-award-2026>
- <https://www.ateneo.edu/news/opportunities/2025/06/24/seeds-fund-supports-30-service-learning-projects>
- <https://www.ateneo.edu/sites/default/files/2026-03/Sustainable%20University%20Master%20Plan%20Digital%20Final.pdf>
- <https://www.mission4point7.org/events/2026-aun-eec-conference>
- <https://www.unsdsn.org/news/sdsn-philippines-hosts-its-annual-general-assembly/>

**`docs/research/wave3-agent/R48-ateneo-green-org.md`**

- <https://ateneoscholar.org/news-the-green-road-towards-laudato-si/>
- <https://www.ateneo.edu/ais/programs/solid-waste-management>
- <https://www.ateneo.edu/features/2021/12/04/ateneo-environmental-science-society-aquatic-stewardship-initiatives>
- <https://www.ateneo.edu/features/2025/03/11/sustainability-action-ateneo-student-organizations-embrace-sustainability>
- <https://www.ateneo.edu/features/2025/03/18/sustainability-action-ateneo-osas-hands-approach-building-greener-future>
- <https://www.ateneo.edu/news/2023/09/30/sustainabox-ais-collaborates-ateneo-biological-organization-box-nutrition-month>
- <https://www.ateneo.edu/news/2024/09/09/youth-driven-climate-action-ateneo-box-c40-cities-organized-quezon-city-government>
- <https://www.ateneo.edu/news/2025/10/06/ais-cfmo-partner-university-wide-waste-audits>

## YCLAP programme, pitch and showcase (82)

**`docs/deck/2026-09-12-board.html`**

- <https://fonts.googleapis.com>
- <https://fonts.googleapis.com/css2?family=Montserrat:ital>
- <https://go.ateneo.edu/QRcode>

**`docs/library.md`**

- <https://climate.gov.ph/files/PhilCCA-WG2.pdf>
- <https://climate.gov.ph/our-programs/climate-finance/peoples-survival-fund>
- <https://climate.gov.ph/our-programs/climate-finance/peoples-survival-fund/revised-implementing-guidelines-for-project-development-grant>
- <https://climate.gov.ph/our-programs/communities-for-resilience>
- <https://docs.google.com/forms/d/e/1FAIpQLScP3PBZHwea5RBEqRradTowBXAfH4tygNFN9M_WyeCDNBs_tg/viewform>
- <https://drive.google.com/file/d/12euTLyGm3e0UW7rpffCdmwaaex4jciMZ/view>
- <https://drive.google.com/file/d/1js09A9Ynqd6Z7XRVIKYp6mX1wA6ujJru/view>
- <https://niccdies.climate.gov.ph/action-plans/local-climate-change-action-plan>
- <https://niccdies.climate.gov.ph/climate-finance/people-survival-fund>
- <https://unfccc.int/sites/default/files/resource/NAP_Philippines_2024.pdf>

**`docs/research/2026-08-deep-research-brief.md`**

- <https://climateactiontracker.org/countries/philippines/>
- <https://cri.org/reports/broken-promises/>
- <https://goodgov.ph/youth-board-24-25>
- <https://oecdecoscope.blog/2026/02/13/confronting-climate-change-in-the-philippines-building-resilience-while-cutting-emissions/>
- <https://sites.google.com/student.ateneo.edu/pieces/home>
- <https://www.mdpi.com/2071-1050/16/14/6246>
- <https://www.source-material.org/plastic-offsetting-philippines-pcx-verra-cement/>

**`docs/research/2026-08-what-you-are-getting-into.md`**

- <https://climate.gov.ph/news/1047>
- <https://climate.gov.ph/public/ckfinder/userfiles/files/Service%20Provision/TERMS_OF_REFERENCE_Consulting_Firm_for_CICA_Youth_REVISED.pdf>

**`docs/research/2026-08-winning-projects-deep-dive.md`**

- <https://climate.gov.ph/news/819>
- <https://climate.gov.ph/news/961>
- <https://mindanews.com/business/2026/07/chocolates-rain-catchers-and-mushrooms-mindanao-innovations-featured-in-climate-action-showcase-in-makati/>
- <https://www.minsu.edu.ph/news/details/180>

**`docs/research/wave3-agent/R34-youth-clap-program.md`**

- <https://climate.gov.ph/news/1065>
- <https://climate.gov.ph/news/906>
- <https://metronewscentral.net/taguig/metro-cities/taguig-advances-climate-action>

**`docs/research/wave3-agent/R36-youth-pitch-winner-pattern.md`**

- <https://asef.org/news/asef-hosts-the-world-student-pitch-singapore-2025-climate-tech-innovation-challenge/>
- <https://climateimpactinnovations.com/>
- <https://climateimpactinnovations.com/climate-impact-innovations-challenge-2024-reveals-winners/>
- <https://climatelaunchpad.org/>
- <https://southeastasia.hss.de/news/rongbient-wins-the-climate-launchpad-final-vietnam-2025-news13202/>
- <https://www.climate-kic.org/press-releases/seah4-wins-climatelaunchpad-global-grand-final-2025/>

**`docs/research/wave3-agent/R38-campaign-canvas-climate.md`**

- <https://activisthandbook.org/strategy/develop>
- <https://climateactionreserve.org/blog/2017/06/28/tips-for-developing-an-effective-climate-advocacy-campaign/>
- <https://commonslibrary.org/campaign-accelerator-toolkit/>
- <https://commonslibrary.org/campaign-strategy-start-here/>
- <https://commonslibrary.org/four-stages-of-climate-action-framework/>
- <https://commonslibrary.org/movement-building-canvas/>
- <https://commonslibrary.org/the-campaign-canvas/>
- <https://mobilisationlab.org/resources/campaign-canvas/>
- <https://oecd-opsi.org/toolkits/social-lean-canvas/>
- <https://thebpp.com.au/wp-content/uploads/2020/11/SocialLeanCanvas_Palladium_Nov2020_Fillable-copy.pdf>
- <https://www.linkedin.com/pulse/climate-action-canvas-your-strategic-planning-toolbox-alina-adams>
- <https://youthtoolkit.gca.org/modules/module-7-designing-and-implementing-your-adaptation-advocacy-strategy/>

**`docs/research/wave3-agent/R40-innovation-showcase-judge.md`**

- <https://aim.gov.in/youthcolab.php>
- <https://antrepreneur.uci.edu/>
- <https://climatelaunchpad.org/frequently-asked-questions/>
- <https://pkgcenter.mit.edu/programs/ideas/>
- <https://www.cleantechopen.org/>
- <https://www.hultprize.org/en/how-it-works/>
- <https://www.hultprize.org/en/how-it-works/selection-process-criteria>
- <https://www.resonanceglobal.com/blog/measuring-social-impact-approaches-challenges-and-best-practices>
- <https://www.socialshifters.co/global-innovation-challenge/>
- <https://www.undp.org/romecentre/our-programmes/youth4climate>
- <https://www.unicef.org/innovation/unicef-climate-innovation-challenge>
- <https://www.ycombinator.com/blog/guide-to-demo-day-pitches/>

**`docs/research/wave3-agent/R41-emma-porio-framing.md`**

- <http://www.ateneo.edu/features/2024/10/14/coastal-cities-risk-philippines-ccarph-launches-2022-2024-2025-2030-report>
- <http://www.ateneo.edu/news/2025/02/13/ateneos-emma-porio-named-lead-author-ipcc-special-report-climate-change-cities>
- <http://www.ateneo.edu/news/2026/02/dr-emma-e-porio-speaks-gender-climate-vulnerabilities-cebu-city-lecture>
- <http://www.ateneo.edu/news/2026/04/stronger-communities-clearer-risks-dr-emma-porio-climate-resilience-warming-city>
- <https://archium.ateneo.edu/sa-faculty-pubs/53/>
- <https://ccar2.wordpress.com/2026/04/12/perception-of-risk-key-to-climate-action-on-the-ground/>
- <https://ccar2.wordpress.com/home/>
- <https://pssc.org.ph/chairpersons/emma-e-porio/>
- <https://research.ateneo.edu/en/persons/emma-e-porio/>
- <https://scholar.google.com/citations?user=EeG5JmoAAAAJ&hl=en>
- <https://theguidon.com/2025/02/high-hopes-and-high-tides-how-the-ccarph-project-bridges-gaps-in-climate-action/>
- <https://www.apn-gcr.org/wp-content/uploads/2020/09/074672d03c3bf099ed64e73b86698f08.pdf>

**`docs/research/wave3-agent/R43-vicky-tan-project-dev.md`**

- <https://climate.gov.ph/news/908>
- <https://csrworks.com/summit/speaker/victoria-tan/>
- <https://events.commercialriskonline.com/gp-asia-24/speaker/1451852/victoria-tan>
- <https://events.development.asia/author/vicky-cl-tan>
- <https://events.eco-business.com/speakers/ma-victoria-a-tan>
- <https://events.unglobalcompact.org/LeadersSummit22/speaker/476664/victoria-vickie-a.-tan>
- <https://ph.linkedin.com/in/ma-victoria-tan-4120a199>
- <https://www.eco-business.com/news/meet-the-eco-business-a-listers-ayalas-vickie-tan-sdg-advocator/>
- <https://www.unsdsn.org/news/sdsn-philippines-and-business-for-sustainable-development-host-screening-of-beyond-zero/>

**`docs/showcase/vault-intel-2026-09-09.md`**

- <https://forms.gle/SjYxevkTDyvEEzar9>

**`docs/yclap-spec.txt`**

- <https://www.scribd.com/document/983418313/Exer-3-Group1-SFI-107>

## Youth climate projects (comparable-project sweep) (122)

**`docs/research/wave-grok-projects/compiled.json`**

- <https://acbiode.com/2024/07/29/finalist-at-the-climate-impact-innovations-challenge-2024/>
- <https://acbiode.com/2024/09/13/climate-impact-innovations-challenge-awarded-ac-biode-rp3-3-billion-in-grant-funding-to-pilot-their-plastalyst-in-indonesia/>
- <https://agfundernews.com/qarbotech-turbocharges-photosynthesis-with-carbon-quantum-dots-were-kind-of-cheating-the-plant-to-capture-more-light>
- <https://agritayo.com/anitu-forest-chocolates-turning-degraded-soil-into-a-sweet-sustainable-future-in-bukidnon/>
- <https://agritayo.com/sierra-madre-tribal-groups-weave-to-protect-ancestral-land-keep-identity/>
- <https://agritayo.com/villgro-ph-highlights-climate-solutions/>
- <https://antares.ventures/other/antares-ventures-leads-aslan-renewables-1-25m-financing-round-to-advance-modern-hydropower-and-energy-resilience/>
- <https://asb.edu.my/qarbotech-plants-photosynthesis/>
- <https://aslanrenewables.com/press-release-ciic/>
- <https://businessmirror.com.ph/2026/08/03/first-gen-holds-second-climate-summit-for-youth-leaders>
- <https://ccar2.wordpress.com/2019/11/12/ccarph-in-the-national-resilience-councils-8th-annual-top-leaders-forum-2019/>
- <https://climate.gov.ph/events/climate-change-consciousness-week/13th-annual-global-warming-and-climate-change-consciousness-week/climate-science-master-class-for-secondary-school-teachers>
- <https://climate.gov.ph/index.php/events/latest-events/50>
- <https://climate.gov.ph/news/815>
- <https://climate.gov.ph/our-programs/climate-science-youth-program>
- <https://climate.gov.ph/public/ckfinder/userfiles/files/Service%20Provision/PBD%20Youth%20Climate.pdf>
- <https://climate.gov.ph/public/ckfinder/userfiles/files/Transparency/PMR%202nd%20Semester%202025.pdf>
- <https://climateimpactinnovations.com/afteroil-qarbotech-baniql-and-waste4change-won-a-total-of-idr-10-billion-in-grant-funding-from-east-ventures-and-temasek-foundation/>
- <https://climateimpactinnovations.com/ciic-2025-awards-aslan-renewables-arukah-capital-sxd-ai-rp10-billion/>
- <https://climatereality.ph/>
- <https://climatereality.ph/2025/06/04/klima-eskwela-2025-kickstarts-in-butuan-empowers-youth-to-find-climate-action-niche/>
- <https://climatereality.ph/2026/03/09/climate-reality-phs-project-niche-empowers-pangasinan-youth-to-solve-the-plastic-crisis/>
- <https://climatereality.ph/plasticfreereality/>
- <https://climatereality.ph/tag/youth/>
- <https://e27.co/aslan-renewables-arukah-capital-sxd-ai-win-us600k-to-pilot-climate-tech-in-indonesia-20251014/>
- <https://east.vc/news/insights/ai-in-climate-tech-southeast-asia-climate-solutions>
- <https://east.vc/news/press-release/afteroil-qarbotech-baniql-and-waste4change-won-grant-funding>
- <https://east.vc/news/press-release/climate-impact-innovations-challenge-awarded-sungreenh2-hydrogen-refinery-and-ac-biode-a-total-of-rp10-billion>
- <https://form.jotform.com/251391412471451>
- <https://fpe.ph/video>
- <https://fund.thesparkproject.com/project/rebuilding-lives-through-mushrooms>
- <https://globalnation.inquirer.net/211039/forest-advocates-indigenous-people-take-spotlight-in-video-anthology-series>
- <https://globalnation.inquirer.net/302327/meet-the-women-and-youth-redefining-what-climate-leadership-could-look-like>
- <https://heaptalk.com/news/three-climate-tech-startups-seize-645894-prize-in-ciic-2024/>
- <https://insiderph.com/first-gen-empowers-youth-to-lead-climate-action-in-schools>
- <https://insiderph.com/first-gen-sparks-youth-led-energy-and-climate-innovations>
- <https://itb.ac.id/berita/alumni-itb-membahas-sistem-pengelolaan-sampah-yang-berkelanjutan-pada-konteks-pedesaan/57718>
- <https://luma.com/9acl6dhx>
- <https://mb.com.ph/2019/11/29/muntinlupa-students-win-climate-and-disaster-resilience-contest/>
- <https://mb.com.ph/2025/06/05/klima-eskwela-2025-kickstarts-in-butuan-empowers-youth-to-find-climate-action-niche>
- <https://mb.com.ph/2025/12/15/meet-the-women-and-youth-redefining-what-climate-leadership-could-look-like>
- <https://mb.com.ph/2025/2/28/anitu-forest-farm-s-small-batch-chocolates-are-the-products-of-forest-regeneration>
- <https://mb.com.ph/2026/01/23/klima-eskwela-urges-tacloban-youth-to-turn-yolanda-memories-into-climate-action>
- <https://mb.com.ph/2026/06/12/filipino-youth-lead-the-charge-for-climate-action-at-i-act-philippines-workshop>
- <https://mirror.pia.gov.ph/features/2022/02/27/pangasinan-youth-save-lives-one-ride-at-a-time>
- <https://ph.linkedin.com/company/o1nnovations>
- <https://ph.linkedin.com/in/valvestil>
- <https://pia.gov.ph/news/from-fear-to-hope-pia-partners-call-for-shift-in-climate-storytelling/>
- <https://pia.gov.ph/news/when-communities-rise-how-the-reskyusi-and-watt-a-ride-redefined-environmental-stewardship/>
- <https://pia.gov.ph/press-release/ccc-pcw-nrc-forge-partnership-for-2024-philippine-resilience-awards/>
- <https://pia.gov.ph/press-release/women-and-youth-climate-resilience-leaders-honored-at-philippine-resilience-awards-2025/>
- <https://qarbotech.com/>
- <https://qarbotech.com/about/>
- <https://quezoncity.gov.ph/barangay-commonwealth-awards-for-reskyusi-food-basket-program/>
- <https://read.thebenildean.org/2026/05/youth-for-energy-southeast-asia-brings-the-philippines-first-i-act-workshop-to-benilde>
- <https://resiliencecouncil.ph/our-work/>
- <https://resiliencecouncil.ph/pra-2024-theme/>
- <https://resiliencecouncil.ph/pra-recap-of-2023-pra-awardees/>
- <https://resiliencecouncil.ph/young-leaders-for-resilience/>
- <https://results.sem-app.com/app/sem_2026_qa/team/PH0013002>
- <https://solve.mit.edu/solutions/83872>
- <https://su.edu.ph/cmc-alum-receives-1st-asean-youth-eco-champion-award-for-ph/>
- <https://sustainablebiz.ca/aslan-modular-hydro-power-plant-ikea-instructions>
- <https://sustina.earth/inside-villgros-fair-futures-showcase-the-impact-of-11-local-climate-ventures/>
- <https://sustina.earth/nature-based-solutions-shine-at-villgro-event/>
- <https://sustina.earth/these-founders-are-building-climate-solutions-from-the-bottom-up/>
- <https://techcrunch.com/2022/10/13/waste4change-is-building-a-circular-economy-in-indonesia/>
- <https://temasekfoundation.org.sg/news/media-releases/afteroil--baniql--qarbotech--and-waste4change-won-a-total-of-idr-10-billion-in-grant-funding-from-east-ventures-and-temasek-foundation>
- <https://temasekfoundation.org.sg/news/media-releases/climate-impact-innovations-challenge-awards-aslan-renewables--arukah-capital--and-sxd-ai-a-total-of-rp10-billion-in-catalytic-funding-to-pilot-their-solutions-in-indonesia>
- <https://tribune.net.ph/2024/12/05/philippine-resilience-awards-2024-honors-women-youth-climate-champions>
- <https://tribune.net.ph/2024/12/22/bikers-for-life-youth-trains-young-first-aiders>
- <https://tribune.net.ph/2025/12/05/women-youth-climate-champions-recognized-at-philippine-resilience-awards-2025>
- <https://villgrophilippines.org/naturenest/>
- <https://villgrophilippines.org/project/ikram/>
- <https://waste4change.com/en/about>
- <https://www.ateneo.edu/sustainable-development-goals/sdg-13?page=2>
- <https://www.cif.org/just-transition-toolbox/example/climate-science-youth-program-philippines>
- <https://www.climate.gov.ph/news/941>
- <https://www.climateaction.asia/>
- <https://www.ctu.edu.ph/2025/12/ctu-barili-student-recognized-in-philippine-resilience-awards-2025-for-subang-project/>
- <https://www.ctu.edu.ph/barili/2024/12/02/enorio-is-2024-outstanding-regional-youth-volunteer/>
- <https://www.evsu.edu.ph/university-news/happening-now-evsu-co-hosts-klima-eskwela-climate-action-event/>
- <https://www.facebook.com/DETFAWAI/>
- <https://www.facebook.com/o1nnovations/>
- <https://www.facebook.com/officiallanicayetano/posts/climate-action-is-more-urgent-than-ever-and-our-city-continues-to-take-meaningfu/1500233274800491/>
- <https://www.facebook.com/plvcpag/posts/%F0%9D%90%84%F0%9D%90%9A%F0%9D%90%AB%F0%9D%90%A5%F0%9D%90%A2%F0%9D%90%9E%F0%9D%90%AB-%F0%9D%90%93%F0%9D%90%A8%F0%9D%90%9D%F0%9D%90%9A%F0%9D%90%B2-%F0%9D%90%82%F0%9D%90%8F%F0%9D%90%80%F0%9D%90%86%F0%9D%90%94%F0%9D%90%A0%F0%9D%90%A7%F0%9D%90%9A%F0%9D%90%B2%F0%9D%90%9A%F0%9D%90%A7-%F0%9D%90%82%F0%9D%90%A5%F0%9D%90%A2%F0%9D%90%A6%F0%9D%90%9A%F0%9D%90%AD%F0%9D%90%9E-%F0%9D%90%82%F0%9D%90%A1%F0%9D%90%9A%F0%9D%90%A7%F0%9D%90%A0%F0%9D%90%9E-%F0%9D%90%82%F0%9D%90%A8%F0%9D%90%A6%F0%9D%90%A6%F0%9D%90%A2%F0%9D%90%AC%F0%9D%90%AC%F0%9D%90%A2%F0%9D%90%A8%F0%9D%90%A7-%F0%9D%90%9A%F0%9D%90%A7%F0%9D%90%9D-%F0%9D%90%8F%F0%9D%90%8B%F0%9D%90%95-%F0%9D%90%82%F0%9D%90%8F%F0%9D%90%80%F0%9D%90%86-%F0%9D%90%85%F0%9D%90%A8%F0%9D%90%AB%F0%9D%90%A0%F0%9D%90%9E-%F0%9D%90%8F%F0%9D%90%9A%F0%9D%90%AB%F0%9D%90%AD%F0%9D%90%A7%F0%9D%90%9E%F0%9D%90%AB%F0%9D%90%AC%F0%9D%90%A1/122117116821341259/>
- <https://www.facebook.com/villgrophilippines/posts/this-is-climate-action-showcase-2026-entrepreneurs-turning-waste-into-new-materi/1367601752142834/>
- <https://www.forestfoundation.ph/blog/gifts-from-and-for-the-forest-11-locally-made-christmas-gift-ideas-for-the-thoughtful-giver/>
- <https://www.forestfoundation.ph/support-forest-products/>
- <https://www.globalfic.org/stories/augustus-nicko-bas>
- <https://www.gmanetwork.com/news/cbb/content/990298/y4e-sea-launches-ph-s-first-italy-irena-action-for-climate-toolkit-i-act-for-young-leaders/story/>
- <https://www.gmanetwork.com/news/scitech/technology/953387/mapua-unveils-electric-vehicle-prototype-for-shell-eco-marathon-asia-2026/story/>
- <https://www.gmanetwork.com/news/scitech/technology/976168/mapua-ev-prototype-shell-eco-marathon/story/>
- <https://www.greenqueen.com.hk/?p=75124>
- <https://www.hbs.edu/socialenterprise/blog/25-years-of-new-venture-competition-se-track-shelly-xu-mba-2021>
- <https://www.irena.org/News/articles/2025/May/I-ACT-Building-Youths-Capacity-Through-Peer-to-Peer-Learning>
- <https://www.isc3.org/page/ac-biode>
- <https://www.linkedin.com/posts/villgroph_in-focus-ikram-agriculture-cooperative-activity-7032571459927478272-8tK9>
- <https://www.manilatimes.net/2025/12/21/tmt-newswire/women-youth-climate-change-champions-honored-at-philippine-resilience-awards-2025/2247470>
- <https://www.mapua.edu.ph/news/mapua-team-cardinal-one-kinmo-pw-shell-eco-marathon-2027>
- <https://www.minsu.edu.ph/news/details/199>
- <https://www.minsu.edu.ph/news/details/291>
- <https://www.philstar.com/headlines/2019/11/17/1969474/forum-tackles-public-private-initiatives-risk-reduction>
- <https://www.pna.gov.ph/articles/1196076>
- <https://www.pna.gov.ph/articles/1234723>
- <https://www.pna.gov.ph/articles/1238683>
- <https://www.pna.gov.ph/articles/1252780>
- <https://www.pna.gov.ph/articles/1263859>
- <https://www.probefound.com/news-posts/voices-of-young-environment-storytellers-through-kwentong-kalikasan>
- <https://www.scribd.com/document/1036164885/PRA-2026-Primer>
- <https://www.shell.com.ph/about-us/sustainability/communities/shell-eco-marathon.html>
- <https://www.studocu.com/ph/document/bulacan-state-university/dramatic-content-writing/pra-2026-primer-kababaihan-at-kabataan-para-sa-resilience/160550485>
- <https://www.thejakartapost.com/news/2014/04/08/mohamad-bijaksana-junerosano-a-modernist-environmental-activism>
- <https://www.undp.org/philippines/press-releases/isip-features-10-social-enterprises-impact-showcase>
- <https://www.wheninmanila.com/these-high-school-students-bagged-grand-prizes-from-a-local-pitch-competition-aims-to-start-a-livelihood-for-fellow-marawi-siege-victims/>
- <https://www.windrr.ph/2023/08/08/philippine-resilience-awards-are-now-open-for-nominations/>
- <https://www.worldbank.org/en/news/feature/2019/05/31/meet-the-innovators-battling-plastic-waste-in-indonesia-mohamad-bijaksana-junerosano>
- <https://www.wwf.org.ph/get_involved/empower_young_people/national_youth_council/new_forces_for_nature_get_to_know_the_national_youth_council_members/>
- <https://www.youthenergysea.com/post/y4e-sea-launches-philippines-first-italy-irena-action-for-climate-toolkit-i-act-for-young-leaders>
- <https://www.youtube.com/watch?v=25R-dSXWhF0>
- <https://www.zigwheels.ph/car-news/mapua-universitys-cardinal-one-receives-technical-innovation-award-at-shell-eco-marathon-apac-me>
- <https://zamboangacity.gov.ph/climaco-joins-top-leaders-forum-on-disaster-resilience/>

## Youth, jobs and nature-based solutions (63)

**`docs/research/wave3-agent/R20-sk-youth-flood-role.md`**

- <https://climate.gov.ph/news/946>
- <https://docs.congress.hrep.online/legisdocs/basic_19/HB06272.pdf>
- <https://lawphil.net/statutes/repacts/ra2010/ra_10121_2010.html>
- <https://lawphil.net/statutes/repacts/ra2016/ra_10742_2016.html>
- <https://resilience.up.edu.ph/engaging-the-youth-in-disaster-preparedness-and-environmental-protection/>
- <https://www.ariseglobalnetwork.org/news/strengthening-youth-foundations-disaster-risk-reduction-quezon-city-youth-experience>
- <https://www.lawphil.net/statutes/repacts/ra2022/ra_11768_2022.html>
- <https://www.unicef.org/philippines/emergency-go-bag-checklist>

**`docs/research/wave3-agent/R22-green-jobs-youth-ph.md`**

- <https://edc.org/wp-content/uploads/2025/10/EDC-Green-Skills-Philippines-Case-Study.pdf>
- <https://greeneconomy.ph/about/about-gepp>
- <https://ils.dole.gov.ph/2023-research-papers/waste-workers>
- <https://ils.dole.gov.ph/2024-research-briefs/national-green-jobs-human-resource-development-plan-2020-2030-pathways-for-building-a-sustainable-workforce>
- <https://lawphil.net/statutes/repacts/ra2022/ra_11898_2022.html>
- <https://plasticbank.com/blog/how-epr-can-support-the-informal-waste-sector-in-the-philippines/>
- <https://www.context.news/just-transition/as-jobs-law-stalls-philippines-struggles-to-green-economy>
- <https://www.tesda.gov.ph/Uploads/File/Planning2018/LMIR/20180621%20Green%20Jobs%20Skills%20Paper_for%20website%20upload.pdf>
- <https://www.undp.org/philippines/publications/eu-ph-green-economy-partnership-specific-objective-2-green-lgus-project-briefer>

**`docs/research/wave3-agent/R30-nbs-youth-scale.md`**

- <https://aiph.org/green-city-case-studies/quezon-city-philippines-joy-is-a-farm/>
- <https://ejournals.ph/article.php?id=19358>
- <https://iarjset.com/wp-content/uploads/2024/04/IARJSET.2024.11448.pdf>
- <https://isprs-archives.copernicus.org/articles/XLVIII-5-W4-2025/229/2026/isprs-archives-XLVIII-5-W4-2025-229-2026.pdf>
- <https://pages.upd.edu.ph/sites/default/files/kcsaguin/files/saguin_2024_urban_gardens_citymaking.pdf>
- <https://quezoncity.gov.ph/program/joy-of-urban-farming/>
- <https://quezoncity.gov.ph/program/oasis-schoolyard-project/>
- <https://r5.emb.gov.ph/water-quality-management/adopt-an-esterowater-body-program/>
- <https://resilientcitiesnetwork.org/resilient-cities-network-quezon-city-and-temasek-foundation-partner-to-transform-schoolyards-into-urban-oases/>
- <https://resilientcitiesnetwork.org/wp-content/uploads/2026/04/One-Pocket-at-a-Time-A-Practical-Guide-to-Pocket-Parks-for-Urban-Greening-and-Resilience.pdf>
- <https://rsisinternational.org/journals/ijrias/articles/implementation-and-sustainability-of-gulayan-sa-paaralan-program-implementation-a-case-study/>
- <https://rsisinternational.org/journals/ijrias/articles/urban-farming-and-food-security-nexus-for-food-sovereignty-and-food-system-planning-the-case-of-a-highly-urbanized-city-in-metro-manila-philippines/>
- <https://www.isroset.org/pub_paper/WAJES/1-ISROSET-WAJES-04895.pdf>
- <https://www.ukdr.uplb.edu.ph/etd-undergrad/11475/>
- <https://www.urbansdgplatform.org/profile/profile_caseView_detail.msc?no_case=792>
- <https://www.wtalabs.ph/a-short-review-of-nature-based-solutions-for-flood-mitigation>

**`docs/research/wave3-agent/R42-rodel-lasco-nbs.md`**

- <https://arocha.org/en/about/people/rodel-lasco/>
- <https://climate.gov.ph/news/663>
- <https://doi.org/10.1016/j.cosust.2013.11.013>
- <https://fieldnotes_arocha.buzzsprout.com/1742834/episodes/10296212-ep-20-rodel-lasco-a-climate-scientist-in-the-philippines-faces-facts-and-remains-hopeful>
- <https://hdl.handle.net/10568/68189>
- <https://ph.linkedin.com/in/rodel-lasco-phd-3299236>
- <https://pidswebs.pids.gov.ph/CDN/document/Event_Sept22_Lasco.pdf>
- <https://scholar.google.com/citations?user=VzBsC6EAAAAJ&hl=en>
- <https://weadapt.org/organisation/oml-center/>
- <https://wires.onlinelibrary.wiley.com/doi/10.1002/wcc.301>
- <https://www.cddjournal.org/home>
- <https://www.cifor-icraf.org/knowledge/author/lasco-rodel-d/>
- <https://www.omlopezcenter.org/about/who-we-are/>
- <https://www.omlopezcenter.org/dr-rodel-lasco-highlights-role-of-ai-in-climate-action-at-2026-national-innovation-day/>
- <https://www.omlopezcenter.org/oml-center-joins-pdyc-2026-highlights-role-of-youth-in-climate-action/>
- <https://www.omlopezcenter.org/oml-center-pushes-for-integrated-science-based-solutions-for-forest-resilience-at-philippine-forestry-youth-summit-2026/>
- <https://www.wcrp-climate.org/crf-events/sea-may-2021>
- <https://www.wcrp-climate.org/images/documents/Regional%20Consultations/SEA-May21-Presentations/Lasco-SEAForum.pdf>
- <https://www.youtube.com/watch?v=9RIHDldC9K8>

**`docs/research/wave3-agent/R47-youth-climate-org-ph.md`**

- <https://aksyonklima.org.ph/>
- <https://aksyonklima.org.ph/who-we-are-2/>
- <https://opinion.inquirer.net/183990/let-the-youth-lead-a-shared-future-for-people-and-planet>
- <https://philippines.fes.de/trainings/y4jt.html>
- <https://resilience.up.edu.ph/national-local-conference-of-youth-2025-championing-youth-toward-a-more-resilient-future/>
- <https://www.eco-business.com/news/youth-activist-john-leo-algo-named-national-coordinator-for-ngo-group-aksyon-klima-pilipinas/>
- <https://www.gcjlab.com/post/from-couture-to-climate-justice-filipino-youth-redefining-activism>
- <https://www.unicef.org/philippines/press-releases/national-youth-statement-climate-action>
- <https://www.wwf.org.ph/get_involved/empower_young_people/national_youth_council/>
- <https://yacaporg.wordpress.com/>
- <https://youthstrike4climate.wordpress.com/>

## Waste, recycling and circularity (164)

**`docs/research/wave3-agent/R01-landfill-methane-mm.md`**

- <https://documents1.worldbank.org/curated/en/099125007222250938/pdf/P170994059e8e308c0a3ec02e0c4f57778b.pdf>
- <https://en.wikipedia.org/wiki/Navotas_landfill_fire>
- <https://en.wikipedia.org/wiki/Payatas_dumpsite>
- <https://gec.jp/gec/jp/Activities/cdm/PDD03_Mitubishi.pdf>
- <https://link.springer.com/article/10.1007/s43621-025-01965-5>
- <https://mmfmpcms.mmda.gov.ph/wp-content/uploads/2024/06/Waste-to-Energy-Feasibility-Study-2023.pdf>
- <https://news.mongabay.com/2026/03/deadly-landfill-collapse-exposes-risks-faced-by-philippines-waste-pickers/>
- <https://newsinfo.inquirer.net/2186851/cdo-issued-vs-rizal-landfill-operator-after-trash-slide>
- <https://newsinfo.inquirer.net/2250255/ph-plastic-waste-laws-exist-but-gaps-still-drive-leakage>
- <https://newsinfo.inquirer.net/2267192/authorities-flag-5-landfills-in-critical-condition>
- <https://nswmc.emb.gov.ph/>
- <https://nswmc.emb.gov.ph/wp-content/uploads/2016/08/Report-4-Waste-Disposal.pdf>
- <https://nswmc.emb.gov.ph/wp-content/uploads/2017/11/NSWMC-FRAMEWORK-PDF.pdf>
- <https://www.ateneo.edu/sites/default/files/2026-04/Breathe_Metro_Manila_Air_Quality_Situation_Report_18_April_2026.pdf>
- <https://www.c40.org/case-studies/clean-energy-in-quezon-city-a-wasteland-turned-into-a-waste-to-energy-model/>
- <https://www.coa.gov.ph/reports/performance-audit-reports/2023-2/solid-waste-management-program/>
- <https://www.giz.de/sites/default/files/media/pkb-document/2025-09/giz2025-en-policy-brief-1-ce-and-swm-cdp.pdf>
- <https://www.gmanetwork.com/news/topstories/regions/957344/san-mateo-rizal-mayor-opposes-disposal-of-manila-s-waste-to-town-s-landfill/story/>
- <https://www.iges.or.jp/en/publication_documents/pub/policysubmission/en/6987/National+Strategy+to+reduce+short+lived+climate+pollutants.pdf>
- <https://www.philstar.com/nation/2025/08/29/2468877/san-mateo-stunned-mmda-garbage-disposal-decision>
- <https://www.philstar.com/nation/2025/08/31/2469292/mmda-defends-decision-use-san-mateo-landfill>
- <https://www.pna.gov.ph/articles/1274082>
- <https://www.pna.gov.ph/articles/1278088>
- <https://www.pressenza.com/2026/02/after-deadly-rizal-landfill-collapse-ban-toxics-demands-action-to-address-waste-crisis-at-the-source/>

**`docs/research/wave3-agent/R02-ra9003-lgu-compliance.md`**

- <https://bantoxics.org/2025/01/26/envi-group-calls-for-comprehensive-review-of-solid-waste-management-act-implementation/>
- <https://lawphil.net/statutes/repacts/ra2001/ra_9003_2001.html>
- <https://mb.com.ph/2024/7/5/coa-warns-lg-us-vs-use-of-open-dumpsites-for-waste-disposal-due-to-safety-health-life-hazards>
- <https://nswmc.emb.gov.ph/wp-content/uploads/2016/09/LGU-SWM-SCMAR-revised-March-2016.pdf>
- <https://pcij.org/2024/05/19/has-the-philippines-created-a-garbage-problem-too-big-to-dig-its-way-out-of/>
- <https://so13.tci-thaijo.org/index.php/J_ARSC/article/download/3451/2684>
- <https://www.gmanetwork.com/news/topstories/nation/869854/coa-increasing-ph-solid-waste-production-to-hit-19-million-metric-tons-by-2030/story/>
- <https://www.pna.gov.ph/articles/1128627>
- <https://www.pna.gov.ph/articles/1133768>

**`docs/research/wave3-agent/R03-epr-ra11898-status.md`**

- <https://apidb.denr.gov.ph/infores/uploads/DAO-2024-04.pdf>
- <https://businessmirror.com.ph/2026/01/31/philippines-exceeds-epr-targets-as-denr-recognizes-waste-management-compliance/>
- <https://enviliance.com/regions/southeast-asia/ph/ph-waste/ph-epr-plastic-waste>
- <https://faolex.fao.org/docs/pdf/phi233819.pdf>
- <https://newsinfo.inquirer.net/2263293/denr-undp-draft-epr-rules-for-plastic-waste-prevention>
- <https://plasticbank.com/blog/community-based-plastic-collection-in-epr/>
- <https://r10.emb.gov.ph/wp-content/uploads/2024/04/DAO-2023-02.pdf>
- <https://sustainability.chemlinked.com/news/philippines-sets-heavy-fines-for-violations-of-extended-producer-responsibility-epr-act>
- <https://sustainability.chemlinked.com/news/philippines-surpasses-2025-plastic-waste-recovery-targets-under-epr-law>
- <https://wwfph.awsassets.panda.org/downloads/epr-scheme-assessment-for-plastic-packaging-waste-in-the-philippines-full-report.pdf>
- <https://www.eco-business.com/news/philippines-zero-waste-bid-relies-on-informal-workers/>
- <https://www.eco-business.com/research/extended-producer-responsibility-in-the-philippines-early-learnings-and-insights-for-emerging-markets-battling-plastic-pollution/>
- <https://www.keslio.com/insights/a-guide-to-the-extended-producer-responsibility-epr-law-in-the-philippines>
- <https://www.no-burn.org/freedom-from-pollution-poverty-and-wasteful-systems/>
- <https://www.pcxmarkets.com/blog-posts/comprehensive-guide-to-the-philippine-extended-producer-responsibility-epr-law-copy>
- <https://www.pna.gov.ph/articles/1273211>

**`docs/research/wave3-agent/R04-plastic-credits-pcx.md`**

- <https://assets.worldwildlife.org/www-prd/documents/63y9kpkeos_WWF_Plastic_Crediting_Positon_Revised_2025.pdf>
- <https://grist.org/accountability/companies-are-claiming-to-be-plastic-neutral-is-it-greenwashing/>
- <https://pcij.org/2022/08/11/health-environment-concerns-are-raised-as-philippine-cement-plants-burn-plastic-wastes-for-fuel/>
- <https://thedocs.worldbank.org/en/doc/411ebaec936068e4bb62a0e40ebce522-0320072024/original/Product-Overview-Plastic-Credits-FINAL.pdf>
- <https://trellis.net/article/plastic-credits-rising-criticism/>
- <https://triplepundit.com/2025/plastic-credits-pcx-markets/>
- <https://www.aljazeera.com/news/2025/8/7/plastic-credits-a-false-solution-or-the-answer-to-global-plastic-waste>
- <https://www.breakfreefromplastic.org/smoke-and-mirrors/>
- <https://www.breakfreefromplastic.org/wp-content/uploads/2023/12/NOV-29-2023_Smoke-and-Mirrors-the-Realities-of-Plastic-Credits-and-Offsetting.pdf>
- <https://www.fauna-flora.org/wp-content/uploads/2024/11/fauna-flora-exploring-plastic-credits-report-v4.pdf>
- <https://www.no-burn.org/wp-content/uploads/Sachet-Economy-spread-.pdf>
- <https://www.pcxmarkets.com/>
- <https://www.pcxmarkets.com/blog-posts/comprehensive-guide-to-the-philippine-extended-producer-responsibility-epr-law>
- <https://www.pcxsolutions.org/post/how-pcx-solutions-is-addressing-the-concerns-around-the-nascent-plastic-credit-market>
- <https://www.renewablematter.eu/en/plastic-credits-false-solution-legitimises-waste-colonialism>
- <https://www.republiccement.com/post/republic-cement-achieves-plastic-neutrality-offers-co-processing-as-epr-solution>
- <https://www.worldwildlife.org/publications/wwf-position-plastic-crediting-and-plastic-neutrality/>

**`docs/research/wave3-agent/R05-informal-waste-worker.md`**

- <https://faircircularity.org/app/uploads/2024/11/Philippines-Case-Study-Report.pdf>
- <https://www.context.news/just-transition/philippines-zero-waste-bid-relies-on-informal-workers>

**`docs/research/wave3-agent/R07-organics-compost-pilots-ph.md`**

- <https://climateandhealthalliance.org/wp-content/uploads/2023/08/MethaneReport-Waste-FINAL.pdf>
- <https://globalnation.inquirer.net/294336/from-plate-to-soil-how-this-hotel-group-finds-new-life-for-food-waste>
- <https://main.baguio.gov.ph/media/news/ZMaQWgMV/gso-pushes-circular-approach-to-food-waste>
- <https://mb.com.ph/2024/8/25/sm-hotels-acquires-biodigester-eliminate-tons-of-waste>
- <https://news.mongabay.com/2021/06/a-startup-deploys-black-soldier-flies-in-the-philippines-war-on-waste/>
- <https://quezoncity.gov.ph/qc-boosts-circular-economy-initiatives-with-biodigesters-food-waste-on-wheels-from-undp-japanese-govt/>
- <https://spotlight.licas.news/turning-food-waste-into-valuables-one-household-at-a-time/index.html>
- <https://up.edu.ph/flourish-in-the-rubbish/>
- <https://www.ccacoalition.org/partners/philippines>
- <https://www.ccacoalition.org/resources/transforming-organic-waste-black-soldier-flies-guide-decision-makers-entrepreneurs-and-implementers-unlock-organic-waste-potential-black-soldier-fly-systems>
- <https://www.gmanetwork.com/news/lifestyle/healthandwellness/875495/food-waste-quezon-city-is-looking-to-turn-it-into-renewable-fuel/story/>
- <https://www.philstar.com/business/2025/10/10/2478716/sm-hotels-steps-initiatives-food-waste-management>
- <https://www.searca.org/news/start-up-taps-insects-make-feed-fertilizer-waste>
- <https://www.sminvestments.com/press_release/sm-introduces-new-tech-to-reduce-food-waste-in-hotels/>
- <https://www.smprime.com/company_releases/sm-hotels-diverts-more-than-300-tons-of-food-waste-through-plate-for-the-planet-eyes-80-composting-by-2040/>
- <https://www.switch-asia.eu/site/assets/files/4154/soilmate_philippines.pdf>
- <https://www.undp.org/philippines/blog/power-transform-cities-frontlines-food-and-organic-waste-systems>
- <https://www.undp.org/philippines/press-releases/qc-advances-waste-reduction-targets-thru-undp-japanese-governments-support-communities>
- <https://www.urbansdgplatform.org/profile/profile_caseView_detail.msc?no_case=862&from=list>

**`docs/research/wave3-agent/R08-mrf-capacity-mm.md`**

- <https://eeid.emb.gov.ph/wp-content/uploads/2020/07/SOLIDWASTE-LAYOUT_final.pdf>
- <https://mmfmpcms.mmda.gov.ph/wp-content/uploads/2024/07/Final-MP-220314-Main-Revised.pdf>
- <https://ncr.emb.gov.ph/6852-2/>
- <https://ph.usembassy.gov/u-s-inaugurates-php14-million-modern-recycling-facility-in-pasig-city/>
- <https://plasticsmartcities.org/manila-city-launches-innovative-solutions-with-social-entrepreneurs-to-tackle-plastic-pollution/>
- <https://psa.gov.ph/content/philippines-generated-26955-thousand-tons-hazardous-waste-2024>
- <https://quezoncity.gov.ph/wp-content/uploads/2021/01/Eco_Profile_2018_Chapter-5.pdf>
- <https://www.adb.org/sites/default/files/publication/30220/materials-recovery-facility-tool-kit.pdf>

**`docs/research/wave3-agent/R10-circular-startup-ph.md`**

- <https://edispo.ph/>
- <https://plasticbank.com/>
- <https://plasticbank.com/epr-philippines/>
- <https://resiklo.org/>
- <https://trashpanda.web.app/>
- <https://www.rezbin.ph/>

**`docs/research/wave3-agent/R37-sdg12-waste-metrics.md`**

- <https://sdgs.un.org/goals/goal12>
- <https://true.gbci.org/sites/default/files/resources/Current-Rating-System-December-2023.pdf>
- <https://true.gbci.org/sites/default/files/resources/TRUE-Diversion-Data-Technical-Guidance_1.pdf>
- <https://unstats.un.org/sdgs/metadata/files/Metadata-12-05-01.pdf>
- <https://wedocs.unep.org/bitstream/handle/20.500.11822/36753/GCWIR.pdf>
- <https://www.globalreporting.org/news/news-center/essential-practices-to-avoid-greenwashing-insights-and-case-studies/>
- <https://www.oneplanetnetwork.org/sdg-12-hub/see-progress-on-sdg-12-by-target/125-reduce-waste-rrr>
- <https://www.un.org/en/climatechange/science/climate-issues/greenwashing>
- <https://www.unep.org/indicator-1251>

**`docs/research/wave3-agent/R45-junkshop-cooperative.md`**

- <https://archive.wwf.org.ph/resource-center/story-archives-2022/organizing-waste-workers-the-case-of-san-jose-sico-multi-purpose-cooperative/>
- <https://archive.wwf.org.ph/resource-center/story-archives-2022/trace-your-share-san-jose-sico-landfill-cooperative/>
- <https://www.eco-business.com/press-releases/denr-integrates-informal-waste-workers-in-solid-waste-management-chain/>
- <https://www.swapp.net.ph/>
- <https://www.unep.org/news-and-stories/story/amid-efforts-end-plastic-pollution-millions-waste-pickers-become-focus>

**`docs/research/wave3-agent/R46-ecowaste-mother-earth.md`**

- <http://ecowastecoalition.blogspot.com/2025/02/ecowaste-coalition-marks-25-years-of.html>
- <http://www.motherearthphil.org/>
- <https://dateline-ibalon.com/2023/06/sonia-sales-mendoza-mother-earths-tireless-advocate/>
- <https://hronlineph.com/2024/04/04/press-release-ecowaste-coalition-decries-the-unrestrained-sale-of-mercury-and-mercury-added-products-online/>
- <https://hronlineph.com/2024/11/19/press-release-ecowaste-coalition-finds-toxic-e-waste-chemicals-in-recycled-black-plastics/>
- <https://newsinfo.inquirer.net/2069044/ecowaste-coalition-acri-push-for-waste-free-chemical-safe-classrooms>
- <https://plasticsolution.org/project/building-a-strong-coordinated-national-plastics-campaign-in-the-philippines/>
- <https://www.breakfreefromplastic.org/2020/10/20/juanazero-zero-waste-store-mother-earth-foundation/>
- <https://www.breakfreefromplastic.org/2021/01/06/environment-groups-launch-activities-for-zero-waste-month/>
- <https://www.downtoearth.org.in/waste/ten-zero-waste-cities-community-participation-worked-wonders-for-san-fernando-67820>
- <https://www.ecowastecoalition.org/>
- <https://www.facebook.com/EWCoalition/>
- <https://www.facebook.com/motherearthph/>
- <https://www.no-burn.org/meet-our-members-mother-earth-foundation/>
- <https://www.no-burn.org/meet-our-members-the-ecowaste-coalition/>
- <https://www.no-burn.org/resources/ecowaste-coalition-building-a-stronger-environmental-movement/>
- <https://www.pressenza.com/2021/02/ecowaste-coalition-calls-on-senate-to-keep-ban-on-waste-incineration-intact/>
- <https://www.pressenza.com/2023/10/ecowaste-coalition-campaigns-for-clean-and-eco-friendly-elections/>
- <https://www.pressenza.com/2024/06/mother-earth-foundation-celebrates-25-years-and-beyond-of-sustainable-waste-management-towards-a-zero-waste-future/>
- <https://www.pressenza.com/2026/07/walang-plastikan-walang-iwanan-ecowaste-coalition-amplifies-commitment-not-to-leave-anyone-behind-in-its-plastic-free-mission-amid-plasticfreejuly-celebration/>
- <https://zwsymposium.zerowastesandiego.org/2023/02/sonia-mendoza-mother-earth-foundation-philippines/>

**`docs/research/wave3-agent/R49-scrap-price-data-source.md`**

- <https://comtrade.un.org/>
- <https://customs.gov.ph/memoranda-for-reference-values/>
- <https://customs.gov.ph/wp-content/uploads/2023/02/mem_2017_04-012-Reference-Value-for-Scrap-Products.pdf>
- <https://iscrapapp.com/>
- <https://nswmc.emb.gov.ph/wp-content/uploads/2016/08/Price-of-Recyclables.pdf>
- <https://onlinescrapyard.com.au/scrap-prices/scrap-prices-philippines/>
- <https://psa.gov.ph/statistics/export-import/monthly>
- <https://www.fastmarkets.com/forest-products/recovered-paper/>
- <https://www.fastmarkets.com/metals-and-mining/scrap-and-secondary/>
- <https://www.fastmarkets.com/methodology/>
- <https://www.isrispecs.org/>
- <https://www.kitco.com/price/base-metals>
- <https://www.lme.com/>
- <https://www.recycling.com/scrap-metal-prices/>
- <https://www.scrapmonster.com/scrap-prices>

**`docs/research/wave3-agent/R50-student-scrap-asia.md`**

- <https://ccet.jp/projects/waste-bank>
- <https://changemakr.asia/rapel-digital-door-to-door-recycling-service-turning-trash-into-cash/>
- <https://development.asia/case-study/digital-innovation-plastics-circularity-lessons-indonesia-and-viet-nam>
- <https://grac.vn/>
- <https://plasticbank.com/blog/how-the-plastic-bank-school-program-works-building-recycling-habits-and-creating-measurable-impact>
- <https://saigoneer.com/saigon-technology/20976-ride-hailing-changed-how-we-commute-can-veca-ve-chai-hailing-change-how-we-recycle>
- <https://scrapuncle.com/>
- <https://sustainability.google/stories/circular-economy-marketplace/>
- <https://techcrunch.com/2022/07/06/octopus-keeps-stuff-out-of-indonesias-crowded-landfills/>
- <https://winrock.org/silent-heroes-partnering-with-informal-waste-collectors-to-reduce-plastic-pollution/>
- <https://www.newsecuritybeat.org/2021/09/apps-helping-indonesias-waste-collectors/>
- <https://www.thekabadiwala.com/>
- <https://www.undp.org/indonesia/stories/digitizing-waste-banks-keep-plastic-out-ocean>

## Flood, heat and water (64)

**`docs/research/wave3-agent/R09-basura-baha-evidence.md`**

- <https://climate.gov.ph/news/923>
- <https://documents1.worldbank.org/curated/en/099100324190511960/pdf/P1538141e9ead80fe196e812b5eed79f98a.pdf>
- <https://doi.org/10.3389/feart.2020.00028>
- <https://newsinfo.inquirer.net/2085541/mmda-blames-garbage-for-clogged-drains-flooding-discipline-needed>
- <https://newsinfo.inquirer.net/2085735/mmda-flood-control-works-made-ineffective-by-trash>
- <https://ph.oceana.org/blog/choking-our-cities-drowning-our-future/>
- <https://tribune.net.ph/2026/07/05/torre-garbage-chokes-metro-flood-pumps-as-mmda-hauls-35-tons-daily>
- <https://www.abs-cbn.com/news/06/06/21/mmda-chief-urges-proper-waste-disposal-to-help-avoid-floods-as-rainy-season-starts>
- <https://www.gmanetwork.com/news/topstories/metro/915259/dpwh-70-of-ncr-s-internal-drainage-clogged-with-garbage-silt/story/>
- <https://www.gmanetwork.com/news/topstories/metro/916187/mmda-trash-ncr-habagat-carina/story/>
- <https://www.philstar.com/nation/2023/09/25/2298752/mmda-clogged-drains-caused-edsa-flood>
- <https://www.philstar.com/nation/2026/05/24/2530070/mmda-12000-tons-garbage-collected-year>
- <https://www.sunstar.com.ph/manila/marcos-improper-waste-disposal-also-causes-manila-flooding>

**`docs/research/wave3-agent/R11-flood-control-scandal.md`**

- <https://apnews.com/article/philippines-flood-control-corruption-allegations-61deba5e59f9bc5fac1800a660591c35>
- <https://eastasiaforum.org/2025/12/02/accountability-washed-away-in-philippine-flood-control-corruption/>
- <https://en.wikipedia.org/wiki/2025%E2%80%932026_Philippine_anti-corruption_protests>
- <https://en.wikipedia.org/wiki/Flood_control_projects_scandal_in_the_Philippines>
- <https://newsinfo.inquirer.net/2157224/yearend-2025-record-flood-control-corruption-unravels>
- <https://pcij.org/2025/08/31/5-reveals-from-the-flood-control-data/>
- <https://www.aljazeera.com/news/2025/11/17/whats-prompting-growing-anticorruption-protests-in-the-philippines>
- <https://www.bulatlat.com/2025/12/22/timeline-2025-flood-control-projects-corruption-scandal/>
- <https://www.npr.org/2025/11/30/nx-s1-5626219/philippines-protest-corruption-stolen-funds>
- <https://www.philstar.com/headlines/2025/10/09/2478643/421-flood-control-projects-found-be-ghosts>
- <https://www.pna.gov.ph/articles/1256868>

**`docs/research/wave3-agent/R13-qc-heat-risk-cooling.md`**

- <https://doi.org/10.5194/isprs-archives-XLVIII-4-W6-2022-451-2023>
- <https://philsa.gov.ph/journal/surface-urban-heat-islands-and-related-health-risk-in-the-philippines-a-geospatial-assessment-using-modis-data/>
- <https://quezoncity.gov.ph/heat-index/>
- <https://quezoncity.gov.ph/qc-beefs-up-action-vs-extreme-heat-designates-chief-heat-action-officers/>
- <https://quezoncity.gov.ph/wp-content/uploads/2025/03/2025_ClassSuspension_Memorandum.pdf>
- <https://quezoncity.gov.ph/wp-content/uploads/2025/10/SP-3439-S-2025.pdf>
- <https://www.gmanetwork.com/news/topstories/metro/941645/qc-gov-t-updates-guidelines-for-class-suspension-due-to-weather-disaster/story/>
- <https://www.gmanetwork.com/news/topstories/nation/996611/deped-drafts-new-rules-for-automatic-class-suspensions-during-extreme-heat-storms/story/>
- <https://www.pagasa.dost.gov.ph/weather/heat-index>
- <https://www.preventionweb.net/publication/documents-and-publications/when-city-heats-mapping-urban-heat-risks-through>
- <https://www.un.org/en/climatechange/quezon-city-people-heart-climate-action>

**`docs/research/wave3-agent/R15-flood-ews-last-mile.md`**

- <https://noah.up.edu.ph/>

**`docs/research/wave3-agent/R18-informal-settlement-flood.md`**

- <https://archium.ateneo.edu/context/socialtransformations/article/1122/viewcontent/ST_209.1_207_20Article_20__20Maningo.pdf>
- <https://cids.up.edu.ph/wp-content/uploads/2022/03/Building-Sustainable-and-Disaster-Resilient-Informal-Settlement-Communities-vol.12-13-2014-2015.pdf>
- <https://unhabitat.org/sites/default/files/2023/06/5._un-habitat_philippines_country_report_2023_final_compressed.pdf>
- <https://www.cadri.net/system/files/2021-09/CADRI%20-%20Good%20Practices%20-%20CBDRM_2020.pdf>
- <https://www.iied.org/sites/default/files/pdfs/migrate/10771IIED.pdf>
- <https://www.mdpi.com/2071-1050/12/24/10600>
- <https://www.opengovpartnership.org/members/philippines/commitments/PH0054/>
- <https://www.philstar.com/nation/2022/09/04/2207223/500k-families-ncr-living-poor-conditions>
- <https://www.pna.gov.ph/articles/1256659>

**`docs/research/wave3-agent/R19-drainage-micro-fix.md`**

- <https://fo11.dswd.gov.ph/2014/03/kalahi-cidss-completes-drainage-canal-in-comval-village/>
- <https://www.abs-cbn.com/news/nation/2026/1/6/quezon-city-completes-underground-detention-basin-to-curb-flooding-in-novaliches-1648>
- <https://www.adb.org/sites/default/files/publication/29878/kalahi-cidss-project-philippines.pdf>
- <https://www.mcc.gov/resources/story/section-phl-ccr-kalahi-cidss-project/>
- <https://www.preventionweb.net/news/philippines-community-driven-development-strategy-frees-town-floods>
- <https://www.topgear.com.ph/features/feature-articles/5-creative-flood-control-projects-metro-manila-a4682-20260720-lfrm>
- <https://www.topgear.com.ph/features/feature-articles/quezon-city-basketball-court-detention-basin-a6888-20260709>
- <https://www.unescap.org/sites/default/d8files/S3b3_Philippines.pdf>
- <https://www.worldbank.org/en/news/feature/2011/03/30/philippines-kalahi-comprehensive-integrated-delivery-social-services>

**`docs/research/wave3-agent/R23-angat-water-security.md`**

- <https://newsinfo.inquirer.net/2255308/angat-dam-water-level-dips-below-critical-mark>
- <https://newsinfo.inquirer.net/2260148/beyond-angat-manila-water-better-prepared-than-ever-for-strong-el-nino>
- <https://newsinfo.inquirer.net/2261926/angat-dam-continues-to-fall-below-critical-water-level-despite-habagat>
- <https://pia.gov.ph/news/pagasa-warns-metro-manila-may-face-water-shortage-in-2027-if-angat-fails-to-recover/>
- <https://www.gmanetwork.com/news/topstories/nation/981199/mwss-angat-dam-expected-to-remain-at-safe-water-level-amid-hotter-weather/story/>
- <https://www.khaleejtimes.com/world/asia/philippines-cuts-metro-manila-water-allocation-as-el-nio-threatens-supply-in-weeks>
- <https://www.philstar.com/nation/2026/07/20/2543243/mwss-water-allocation-reduced-anew>
- <https://www.philstar.com/nation/2026/07/25/2544445/angat-logs-all-time-low-water-level>
- <https://www.philstar.com/nation/2026/07/27/2544992/angat-dam-water-reaches-lowest-recorded-level>
- <https://www.pna.gov.ph/articles/1219319>

## Climate policy, finance and carbon markets (90)

**`docs/research/2026-08-ph-carbon-markets.md`**

- <https://10insightsclimate.science/year-2025/carbon-credit-markets-integrity-challenges-and-emergent-responses/>
- <https://apidb.denr.gov.ph/infores/uploads/DAO-2026-02.pdf>
- <https://ca1-aip.edcdn.com/S1-01_DENR.pdf>
- <https://cruzmarcelo.com/doe-issues-guidelines-for-the-generation-management-and-monitoring-of-carbon-credits-in-the-philippine-energy-sector/>
- <https://doe.gov.ph/articles/3100060--department-circular-no-dc2025-09-0018>
- <https://doe.gov.ph/articles/3108265--doe-issues-general-framework-for-carbon-credits-in-the-energy-sector>
- <https://icvcm.org/>
- <https://interaksyon.philstar.com/politics-issues/2025/01/31/291218/indigenous-filipinos-hope-carbon-credits-can-protect-their-forests/>
- <https://leap.unep.org/en/countries/ph/national-legislation/adoption-philippines-readiness-voluntary-forest-carbon-market>
- <https://pia.gov.ph/press-release/doe-issues-general-framework-for-carbon-credits-in-the-energy-sector/>
- <https://prod-cms.doe.gov.ph/documents/d/guest/dc2025-09-0018>
- <https://us.transparency.org/news/pervasive-conflicts-of-interest-in-carbon-markets-risk-undermining-climate-goals-new-report-finds/>
- <https://vcmintegrity.org/>
- <https://www.adb.org/cop/cop29/roadmap-operationalizing-article-6-philippines>
- <https://www.carbonmarkets-cooperation.gov.sg/overview-thephilippines/>
- <https://www.context.news/nature/indigenous-filipinos-hope-carbon-credits-can-protect-their-forests>
- <https://www.eco-business.com/news/climate-criminals-greenpeace-philippines-warns-us19-billion-in-climate-tagged-funds-potentially-lost-to-corruption/>
- <https://www.greenpeace.org/philippines/press/68654/department-of-energy-carbon-credit-rules-not-a-license-to-profit-must-cut-emissions-now/>
- <https://www.mti.gov.sg/newsroom/singapore-signs-the-philippines--first-implementation-agreement-on-carbon-credits-collaboration-under-article-6-of-the-paris-agreement/>
- <https://www.mtstonegate.com/post/2026-philippines-regulatory-momentum-across-renewable-energy-certificates-esg-reporting-and-carbon>
- <https://www.philstar.com/business/2026/06/20/2536392/doe-creates-carbon-credits-task-force>
- <https://www.undp.org/philippines/press-releases/philippines-launches-roadmap-build-readiness-voluntary-forest-carbon-markets>

**`docs/research/wave3-agent/R16-peoples-survival-fund.md`**

- <https://psf.dof.gov.ph/>
- <https://tdri.or.th/wp-content/uploads/2020/04/Revised_Final_Research_Report_Yanquiling_Rhomir.pdf>
- <https://www.clarity.io/blog/apply-for-the-philippines-peoples-survival-fund>
- <https://www.dof.gov.ph/peoples-survival-fund-board-approves-php-539-million-worth-of-climate-adaptation-projects/>
- <https://www.dof.gov.ph/peoples-survival-fund-kicks-off-nationwide-caravan-to-empower-lgus-in-driving-climate-adaptation-and-resilience/>
- <https://www.dof.gov.ph/peoples-survival-fund-seeks-to-find-solution-to-climate-crisis/>
- <https://www.observatory.ph/wp-content/uploads/2025/04/LAYOUT_BdB-FA-Case-Study-Draft-2-04.29.25.pdf>

**`docs/research/wave3-agent/R17-lccap-lgu-plans.md`**

- <https://acp.iclei.org/wp-content/uploads/2022/05/Promise-of-Pasig-min.pdf>

**`docs/research/wave3-agent/R21-coal-re-mix-2026.md`**

- <https://assets.bbhub.io/professional/sites/44/The-Philippines-Path-to-Clean-and-Affordable-Electricity.pdf>
- <https://business.inquirer.net/566132/84-renewable-energy-deals-revoked-in-2025>
- <https://bworldonline.com/infographics/2026/04/17/743518/philippines-renewable-energy-share-rises-in-2025/>
- <https://caseforsea.org/when-demand-climbed-and-prices-fell-renewable-energy-in-the-philippine-power-system-2023-to-2025/>
- <https://cleanairasia.org/sites/default/files/2025-07/Clean%20Air%20Asia%20Coal%20Facts%20and%20Figures%202025.pdf>
- <https://doe.gov.ph/site/epimb/articles/group/statistics?category=Philippine%20Power%20Statistics&display_type=Card>
- <https://lowcarbonpower.org/region/Philippines>
- <https://powerphilippines.com/ph-hits-25-renewable-energy-share-as-doe-accelerates-clean-energy-push/>
- <https://www.elibrary.imf.org/view/journals/002/2025/334/article-A002-en.xml>
- <https://www.energyglobal.com/solar/29042026/philippines-renewable-energy-capacity-to-reach-30-gw-by-2035-forecasts-globaldata/>
- <https://www.facebook.com/DOEgovph/>
- <https://www.pna.gov.ph/articles/1265771>

**`docs/research/wave3-agent/R26-sme-energy-efficiency.md`**

- <http://www.ateneo.edu/ais/programs/energy-greenhouse-gas-emissions>
- <https://bworldonline.com/economy/2026/06/18/757773/adb-considering-210-million-loan-to-boost-phl-energy-efficiency/>
- <https://c2e2.unepccc.org/wp-content/uploads/sites/3/2025/04/the-esco-market-in-the-philippines-a-recipe-for-success.pdf>
- <https://doe.gov.ph/articles/3349704--advisory-strict-observance-of-the-government-energy-management-program-gemp-guidelines-and-iaeecc-resolutions>
- <https://gggi.org/mainstreaming-energy-efficiency-in-msmes-in-the-philippines-immediate-gains-and-impacts/>
- <https://lawphil.net/statutes/repacts/ra2019/ra_11285_2019.html>
- <https://mb.com.ph/2025/05/19/wired-for-energy-efficiency-philippines-rises-to-the-global-esco-frontline>
- <https://ncr.dost.gov.ph/small-enterprise-technology-upgrading-program/>
- <https://philippines.un.org/en/319623-unido-empowers-philippine-msmes-turn-climate-action-competitive-advantage>
- <https://www.adb.org/projects/58464-001/main>
- <https://www.adfiap.org/members_news/dbp-launches-program-to-finance-energy-efficiency-projects/>
- <https://www.bpi.com.ph/about-bpi/sustainability/products-and-services>
- <https://www.cefia-dp.go.jp/hubfs/6th-forum/Session4_2_finance(DBP>
- <https://www.energytransitionpartnership.org/wp-content/uploads/2024/04/Philippines-ESCO-Market-Research.docx-1.pdf>
- <https://www.ifc.org/en/pressroom/2023/ifc-partners-with-bank-of-the-philippine-islands-to-increase-climate-finance-boosting-green-growth>
- <https://www.landbank.com/msme/msme-financing-for-msmes/msme-renewable-and-alternative-energy-plus-real-energy-lending-program>
- <https://www.oecd.org/content/dam/oecd/en/about/programmes/cefim/philippines/cefim-philippines-enhancing-access-clean-energy-oct-2025.pdf>
- <https://www.pe2.org/ee-policies-philippines>

**`docs/research/wave3-agent/R31-clima-act-status.md`**

- <https://atmos.earth/political-landscapes/the-legal-fight-to-make-corporations-cover-climate-losses/>
- <https://climatepolicydatabase.org/policies/climate-accountability-act-clima>
- <https://docs.congress.hrep.online/legisdocs/basic_20/HB03458.pdf>
- <https://docs.congress.hrep.online/legisdocs/basic_20/HB04420.pdf>
- <https://issuances-library.senate.gov.ph/bills/house-bill-no-9609-19th-congress>
- <https://newsinfo.inquirer.net/2104969/house-urged-to-support-climate-accountability-bill>
- <https://pia.gov.ph/news/house-bill-seeks-to-hold-corporations-accountable-for-climate-related-damage-2/>
- <https://www.business-humanrights.org/en/latest-news/the-philippines-climate-accountability-bill-introduces-robust-provisions-mirroring-wider-developments-in-climate-change-laws-and-litigation/>
- <https://www.context.news/climate-justice/opinion/the-climate-bill-is-due-for-polluters-filipinos-have-paid-enough>
- <https://www.greenpeace.org/philippines/press/68529/landmark-climate-accountability-law-to-make-corporate-polluters-pay-pushed-in-congress/>
- <https://www.greenpeace.org/philippines/press/69267/greenpeace-backs-house-resolution-1074-on-climate-change-urges-passage-of-clima-bill/>
- <https://www.greenpeace.org/static/planet4-philippines-stateless/2023/11/720d51c3-hb09609.pdf>
- <https://www.lrcksk.org/climabill>
- <https://www.lse.ac.uk/granthaminstitute/news/philippines-climate-accountability-bill-loss-and-damage-in-domestic-legislation/>
- <https://www.slaughterandmay.com/services/practices/environmental-social-and-governance/esg-in-apac-2025/philippines/>

**`docs/research/wave3-agent/R33-adaptation-finance-ph.md`**

- <https://climate.gov.ph/news/839>
- <https://gggi.org/press-release/gggi-and-dof-secure-approval-of-us6-78-million-green-climate-fund-readiness-grant/>
- <https://psa.gov.ph/content/government-climate-change-expenditure-more-doubled-php-116-trillion-2025>
- <https://www.adaptation-fund.org/projects-programmes/active-pipeline/>
- <https://www.adb.org/news/adb-program-10-billion-climate-finance-philippines>
- <https://www.adb.org/projects/51294-001/main>
- <https://www.adb.org/sites/default/files/institutional-document/994671/cps-phi-2024-2029.pdf>
- <https://www.climate.gov.ph/public/ckfinder/userfiles/files/Knowledge/The%20Philippines>
- <https://www.dof.gov.ph/ph-secures-us6-78m-grant-from-the-green-climate-fund-to-boost-climate-investments-for-resilient-communities/>
- <https://www.greenclimate.fund/countries/philippines>
- <https://www.greenclimate.fund/portfolio/projects/fp201>
- <https://www.greenclimate.fund/portfolio/projects/sap010>
- <https://www.worldbank.org/en/news/press-release/2025/07/31/wb-supports-efforts-to-strengthen-community-resilience-for-18-million-households-in-ph>
- <https://www.worldbank.org/en/news/press-release/2026/06/25/world-bank-group-backs-philippines-push-for-energy-and-water-security>
- <https://www.worldbank.org/en/news/press-release/2026/07/31/wbg-support-to-help-philippines-expand-resilient-water-and-sanitation-services>

## Agriculture, coasts and oceans (23)

**`docs/research/wave3-agent/R24-el-nino-agri-2026.md`**

- <https://bagong.pagasa.dost.gov.ph/climate/el-nino-la-nina/monitoring>
- <https://bworldonline.com/economy/2024/08/04/612105/final-el-nino-agri-damage-estimate-at-p15-3-billion/>
- <https://docs.congress.hrep.online/legisdocs/basic_20/HR00967.pdf>
- <https://pagasa.dost.gov.ph/press-release/207>
- <https://pagasa.dost.gov.ph/press-release/209>
- <https://pagasa.dost.gov.ph/press-release/216>
- <https://www.gmanetwork.com/news/weather/content/996484/very-strong-el-ni-o-likely-from-october-2026-to-january-2027-pagasa/story/>
- <https://www.pna.gov.ph/articles/1230394>

**`docs/research/wave3-agent/R25-rice-heat-food-security.md`**

- <https://doi.org/10.1073/pnas.0403720101>
- <https://doi.org/10.1111/ajae.12210>
- <https://doi.org/10.1371/journal.pone.0201426>

**`docs/research/wave3-agent/R29-coral-bleach-wps.md`**

- <http://www.philchm.ph/coral-reefs/>
- <https://archive.wwf.org.ph/resource-center/story-archives-2023/the-world-wide-fund-for-nature-philippines-says-it-is-high-time-to-declare-the-west-philippine-sea-as-a-national-marine-protected-area/>
- <https://bmb.gov.ph/>
- <https://coralreefwatch.noaa.gov/satellite/research/coral_bleaching_report.php>
- <https://gcrmn.net/2026/06/08/4gbe-ended/>
- <https://icriforum.org/4gbe-2025/>
- <https://mb.com.ph/2026/05/20/coral-bleaching-how-vibrant-reefs-turn-into-a-white-graveyard>
- <https://mhwtracker.science.upd.edu.ph/>
- <https://worldheritageoutlook.iucn.org/node/1062>
- <https://www.nesdis.noaa.gov/news/worlds-fourth-mass-coral-bleaching-event-likely-ended-2025>
- <https://www.noaa.gov/news-release/noaa-confirms-4th-global-coral-bleaching-event>
- <https://www.pcaarrd.dost.gov.ph/index.php/quick-information-dispatch-qid-articles/boosting-coral-reef-resilience-through-marine-heatwave-tracking-and-coral-reef-monitoring>
