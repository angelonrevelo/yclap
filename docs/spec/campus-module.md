# Campus modules — spec

**Status:** shipped on `reveal/module`, 2026-10-01. All three modules are
`is_official: false`.
**Why:** Gelo's 09-30 voice note. The judges "said that the 3D implementation
was good … they can also use it for something else like hazards, DRR … to
showcase hiking trails, or even emergency areas in school, or even areas with
biodiversity" (`3:58`–`4:46`). "We've already mapped out the map and how easy
it is to implement on their campus. We have the engines for that, but we can
even apply it to other things like hiking trails" (`4:53`–`5:11`). And it has
to read as something usable, not "a childish game" (`2:40`–`2:59`).

**The rule:** the repo's honest-sourcing rule, which is a safety rule for
emergency information. Nothing invented is presented as real. Anything we chose
is flagged `is_named_by_us`. Gaps are stated on screen. An evacuation point we
made up is worse than none, so none of the layers draws an assembly point,
hazard zone or evacuation route that did not come from a citable public source.

## The engine

The modules reuse what the walk already has:

| Piece | File | What it gives a module |
|---|---|---|
| Sectors | `campus-sector.json`, `sector.ts` | Faces of the OSM way network, each with measured vegetation |
| Walkable ground | `placement.ts` `isWalkable` | One rule: in the box, off buildings, out of the restricted grove |
| Router | `route.ts` `planRoute` | A* over a 4 m grid with footpaths cheaper, pulled taut |
| Pace | `geo.ts` `WALK_PACE_MS` | 1.3 m/s, so minutes are consistent everywhere |
| Registry | `module.ts` | id, title, source, `is_official`, owner, ask, caveat, per-campus config |
| UI | `module-ui.tsx`, `module-state.ts` | Field-map layers and one dock. `app.tsx` only wires them in |

Switching modules: `MODULE_CONFIG.module_on` per deployment. `?module=a,b`
narrows a demo; unknown ids are ignored, and an empty result keeps the config.

## Module 1: Biodiversity hotspots

- **User story.** As a student or a visiting judge, I want to see which parts
  of campus hold the most recorded species, so that I know where to walk to
  see life and which ground is worth protecting.
- **Success metric.** A viewer can name the top three sectors by recorded
  species in under 10 seconds with the layer on. Every sector with at least 10
  records is shaded. The method line is on screen whenever the list is.
- **Source.** iNaturalist observations API v2 over `CAMPUS_BOX`, fetched
  2026-09-30 by `script/build-hotspot.mjs`. We kept records with an open
  position (geoprivacy and taxon geoprivacy both open) and positional accuracy
  of 50 m or better or not recorded. Species richness counts taxa at species
  rank or below.
- **What the source held.** 13,985 records in the box and 13,983 with an open
  location. We dropped 3,067 for accuracy over 50 m and 2,560 fell outside
  every sector, which left **8,356 in sectors**; 937 of those had no recorded
  accuracy. 72 of 94 sectors have records. **9 hotspots** (top fifth, cut at 71
  species), led by the SOM grove north-east (301 species in 1,822 records) and
  the SOM grove north-west (199 in 1,286).
- **Stated limit.** Records follow footfall. A busy path beside a lawn can
  out-score a quiet grove. This is not a survey.
- **What the institution must provide.** AIS: the campus tree inventory with
  positions, so that richness comes from a survey. The Ateneo Wild: its own
  documented records.
- **Only counts are committed.** The raw observations are cached under
  `script/data/` (gitignored) and are not redistributed.

## Module 2: Emergency & DRR

- **User story.** As someone on campus, I want to see the clinic, safety
  office and fire equipment nearest to me and the walk there, and whether the
  ground I am on is in a mapped flood zone. I need this to be honest about
  being unofficial, so that I never trust it over campus safety staff.
- **Success metric.** From the panel, one tap gives the walking route and
  distance to the nearest mapped clinic. Every point on the layer opens to its
  OSM id, source and fetch date. Any group with no data shows the empty state,
  never a placeholder. "Not the official Ateneo emergency plan" is visible
  whenever the layer is.
- **Sources.**
  - OpenStreetMap via Overpass, fetched 2026-09-30 by
    `script/fetch-osm-emergency.mjs`. The query covers `emergency=*`,
    `amenity=clinic|hospital|doctors|dentist|pharmacy|fire_station|police`,
    `healthcare=*` and `highway=emergency_access_point`. ODbL.
  - UP NOAH (UP Resilience Institute), 100-year flood hazard for Metro
    Manila. This is the ESRI shapefile in the public Downloads folder on
    noah.up.edu.ph (Flood › 100yr › "Metro Manila.zip", shapefile dated
    2022-11-28), licensed ODC-ODbL according to `metadata_flood.txt`. Clipped
    to the box by `script/extract-noah-flood.mjs`. The NOAH web map's Mapbox
    tiles are locked to noah.up.edu.ph by referrer, and we did not use them.
- **What the sources held for the campus box.** OSM had 17 features: 2
  clinics (JM Lucas Infirmary, and Barangka Health Center at the box's south
  edge), 1 police office (Campus Safety and Mobility Office), 1 barangay fire
  station on Katipunan, 3 fire hydrants, 4 pharmacies, 2 dentists and 4
  counselling or psychotherapy centres. OSM had **no** assembly point, AED,
  first-aid kit or extinguisher. The NOAH model covers about 13.2 ha low,
  12.7 ha medium and 5.7 ha high (summed ring areas, 100-year rain). The
  shop-strip features on Katipunan are inside the box but outside the OSM
  campus rings, and the app labels them "off campus".
- **Routing.** `nearestHelp` orders candidates by straight line and picks the
  shortest route over walkable ground. The start is labelled honestly: "you"
  only for a GPS fix, "the walker (demo position)" for a demo, and "the campus
  centre" with no fix.
- **Named gaps.** Official assembly points, evacuation routes, AED and
  first-aid locations. Earthquake and fault hazard: the PHIVOLCS Valley Fault
  System atlas was not fetched or cited here. Landslide and storm surge: NOAH
  publishes them, but they are not extracted, and storm surge does not apply
  inland. Live alerts.
- **What the institution must provide.** The university DRRM office, with
  CFMO: the official emergency plan, meaning assembly points, evacuation
  routes, first-aid and AED locations, and the hazard areas they track. This
  office is listed in Settings as NOT YET. When the plan arrives, it goes in as
  its own source with its own date, and the module's `is_official` changes only
  with a test edit naming who signed off and when.

## Module 3: Nature trails

- **User story.** As a student, a visitor or a class, I want to follow a short
  walk of stops with a card at each one and know how far and how long is left,
  so that I can learn the campus trees in one sitting without a guide.
- **Success metric.** The trail starts in one tap. Every leg is drawn over
  walkable ground. The card shows "Stop n of N", the next leg's metres and
  minutes, and the distance to the end. `trail.test.ts` fails on any stop off
  walkable ground or any leg without a route.
- **Source.** Stops, order and names are chosen by us (`is_named_by_us`).
  Legs are routed over OSM footpaths (ODbL). Stop positions are the app's demo
  encounter points, so `is_position_surveyed: false`, and the card says so.
  The `look_for` lines are general field marks for the species, not stories.
- **What shipped.** "Campus tree walk": the eight curated species that have
  artwork. The order is the shortest of all 8! orders, 1,263 m, about 16
  minutes of walking.
- **What the institution must provide.** AIS and The Ateneo Wild: which trees
  are safe and worth stopping at, their real positions, and the stories that
  belong to them.
- **Adding a trail.** See `web-forest/src/asset/trail/README.md`.

## How another campus or a park adopts it

1. **Walkable ground.** Run `script/fetch-osm-way.mjs` →
   `script/build-sector.mjs` → `script/measure-vegetation.mjs` over the new
   box, and import its buildings. This is what the router, trails and hotspots
   stand on. Without it, nothing routes.
2. **Config.** Set `MODULE_CONFIG` to the new `campus_code` and switch on only
   the modules the site has data for. A park with no emergency extract runs
   `["trail"]`, not an empty safety layer.
3. **Hotspots.** Rerun `script/build-hotspot.mjs` with the new box. Where iNat
   has no records, the layer shows its empty state.
4. **Emergency.** Rerun `script/fetch-osm-emergency.mjs` with the new box. For
   flood data, pick the province zip from the NOAH Downloads folder and run
   `script/extract-noah-flood.mjs`. Put the site's own DRRM office on the
   partner list, and leave `is_official` false until that office signs off.
5. **Trails.** Write one JSON per trail. The tests check walkability and
   routing.
6. **Gate.** `npx tsc --noEmit`, `npm test`, `npx oxlint`.

## Not done

- No official data in any module, pending AIS, the DRRM office and CFMO.
- Earthquake, landslide and storm-surge layers.
- Modules draw on the field view only, not the raked play view.
- A trail does not follow the GPS fix yet. You step through the stops by hand.
- The PHIVOLCS fault atlas and any campus-specific hazard assessment.
