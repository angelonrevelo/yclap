/**
 * Showcase projects — live builds + accelerator-ready options.
 *
 * NOT RENDERED YET. Nothing imports this file, and nothing imports
 * `pilot.js` either: the README claimed the landing shows a "project rack"
 * and it does not — the only Gargar string in the built bundle comes from a
 * lane task in `cohort.js`. Checked 2026-09-09 by grepping `dist/`.
 *
 * It is kept, and kept CURRENT, because the data is right and the rack is a
 * afternoon's work whenever someone wants it. What is not acceptable is a data
 * file quietly describing last month's flagship, so `magisphere` leads it now.
 */

export const project = [
  {
    project_code: "magisphere",
    project_status: "live_pilot",
    project_name: "Magisphere",
    project_tagline: "Two-thirds of this campus is green. Now you can name it.",
    project_blurb:
      "Ateneo campus-forest PWA and the Sep 12 showcase piece. A world of finds rotates across 68 walkable sectors every thirty minutes; walk to one, photograph it, and it enters your journal with a species, a count and a coordinate — the pair the AIS inventory does not have. 1,098 species modelled in 3D from a real iNaturalist campus sweep. Works offline. No leaderboard, and no field in the data model one could be built from.",
    sdg_code: ["15", "13", "11"],
    lane_code: ["build", "science", "story"],
    stack_label: "React · Vite · OSM · iNaturalist · 1,098 .glb",
    repo_path: "web-forest/",
    can_demo: true,
    rack_span: "hero",
    metric_label: ["1,098 species", "68 sectors", "240 tests green"],
    improvement: [
      "AIS species-per-sector inventory — 6 of 68 sectors name anything today",
      "Origin data: 9 of 1,098 species carry a native/exotic label",
      "Never yet installed on a physical handset",
    ],
  },
  {
    project_code: "gargar",
    project_status: "live_pilot",
    project_name: "Gargar",
    project_tagline: "Your trash has a price.",
    project_blurb:
      "Pasig scrap pilot: reference rates, payout calculator, collector directory, and diversion log. Climate: landfill load + basura→baha co-benefit + worker price transparency. No carbon credits.",
    sdg_code: ["12", "13", "11"],
    lane_code: ["build", "science", "mobilize"],
    stack_label: "React · Vite · EcoWaste rates",
    repo_path: "~/Codex/gargar",
    can_demo: true,
    rack_span: "tall",
    metric_label: ["Rates frozen", "6 collectors", "Target ≥100 kg"],
    improvement: [
      "No longer the showcase piece — Magisphere took Sep 12",
      "Field-verify PET + Al cans at ≥2 Pasig shops",
      "Mark is_verified only after contact",
    ],
  },
  {
    project_code: "ecowaste",
    project_status: "live_research",
    project_name: "EcoWaste Intel",
    project_tagline: "Evidence stack for circular waste action.",
    project_blurb:
      "Research OS for EcoWaste Coalition: NCR junkshops, material prices, EPR, grants, bills, AQI, LGU compliance ,  scrapers + Next.js dashboards.",
    sdg_code: ["12", "16", "13"],
    lane_code: ["science", "build"],
    stack_label: "Next.js · scrapers · maps",
    repo_path: "~/Antigravity/ecowaste",
    can_demo: true,
    rack_span: "tall",
    metric_label: ["NCR scrapes", "EPR watch", "Policy intel"],
    improvement: [
      "Evidence layer, never the pitch itself",
      "Policy one-pagers for mentors",
    ],
  },
  {
    project_code: "basura_baha",
    project_status: "ready_to_build",
    project_name: "Basura → Baha",
    project_tagline: "Drain clogs + waste hotspots → LCCAP annex.",
    project_blurb:
      "Last-mile flood early action without new sensors: PAGASA triggers, SK protocol, inclusive Taglish cards. Maps basura→baha for mentor-safe adaptation story.",
    sdg_code: ["13", "11", "10"],
    lane_code: ["story", "mobilize", "science"],
    stack_label: "Campaign Canvas · design · drills",
    can_demo: false,
    rack_span: "wide",
    metric_label: ["Map + brief", "LGU-ready"],
    improvement: [
      "Unstarted since August — needs an owner, not a spec",
      "One street / one org pilot",
    ],
  },
  {
    project_code: "heat_route",
    project_status: "ready_to_build",
    project_name: "Katipunan Cool Route",
    project_tagline: "Map heat. Point to shade.",
    project_blurb:
      "Walk audit + cool-spot map for the Katipunan corridor. Ask: shade, hydration, schedule shifts.",
    sdg_code: ["11", "3", "13"],
    lane_code: ["science", "story", "build"],
    stack_label: "Field methods · simple map UI",
    can_demo: false,
    rack_span: "tile",
    metric_label: ["Walk audit", "Shade gaps"],
    improvement: [
      "Closest sibling to Magisphere — same campus, heat instead of species",
      "The ADMU deck already asks Manila Observatory for urban-heat and land-cover data; this is what that data would be for",
      "Unstarted since August — needs an owner",
    ],
  },
  {
    project_code: "organics",
    project_status: "ready_to_build",
    project_name: "Organics → Methane",
    project_tagline: "Food waste is a climate sector.",
    project_blurb:
      "Canteen micro-compost with kg diverted and an honest methane co-benefit narrative. Not a credit product, and not dependent on any other project shipping first.",
    sdg_code: ["12", "13"],
    lane_code: ["science", "mobilize", "build"],
    stack_label: "Ops pilot · weigh-ins · chemistry QA",
    can_demo: false,
    rack_span: "tile",
    metric_label: ["Kg log", "Ops plan"],
    improvement: [
      "Unstarted since August — needs an owner",
      "3-week canteen pilot",
    ],
  },
  {
    project_code: "any_idea",
    project_status: "open",
    project_name: "Slot 06 · Your idea",
    project_tagline: "Dalhin mo lang ang idea.",
    project_blurb:
      "Any climate problem you can say in one sentence ,  we scope a demo slice at the desk and ship in the five-week window using multi-lane cohort.",
    sdg_code: ["13", "17"],
    lane_code: ["build", "mobilize", "story", "science"],
    stack_label: "AI-assisted build · multi-lane team",
    can_demo: true,
    rack_span: "cta",
    metric_label: ["Scoped today", "Demo in weeks"],
    improvement: ["Intake form on this site", "48-hour prototype sprints"],
  },
];
