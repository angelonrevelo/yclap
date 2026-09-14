# Magisphere — web-forest

The campus-forest PWA for Ateneo Loyola Heights. Four surfaces: `/` `/map`
`/journal` `/plan`.

Named by the group on 2026-09-08. The directory, the storage keys
(`field-guide.sighting`, `field-guide.walk`, `field-guide.player`), the
`field-guide/…` GeoJSON feature ids and the `field-guide-tile-v1` cache all keep
their old names deliberately — they are what a device's journal and warmed
campus are stored under, and renaming them would orphan real data to buy a
matching string.

## The unit of play

A **sector**: the ground enclosed by the roads and footpaths around it, the way
a city block is defined by its streets. Sectors are not drawn — they are
computed as faces of the real OpenStreetMap way network over campus. 94 of
them, 38.8 ha.

How green each sector is, is **measured off satellite imagery**, not inferred
from the absence of a building. That distinction is the whole point: a car park
has no building on it, so inference painted the Areté deck as lawn. Ground
below 45% measured vegetation is drawn as the asphalt it is, carries no species
and cannot be tapped to log a tree.

Nothing here is a survey. Boundaries are ODbL OpenStreetMap geometry, species
lists are provisional until the AIS inventory (due 2026-09-09), and any name we
chose ourselves is flagged `is_named_by_us`.

## Run it

```
npm install
npm run dev        # http://127.0.0.1:4177
npm run sync       # live campus world on :8788 (Vite proxies /sync /live /world)
npm run build      # tsc --noEmit && vite build
npm test           # node --test
npm run lint
```

Port 4177 is claimed with `strictPort`, so a collision fails loudly rather than
silently moving.

## The species-model pack

`public/model/` holds a cute animated `.glb` for **every species known from
the campus** — 1,098 models from the cached iNaturalist campus-box sweep
(2026-09-03) merged with the curated guide list, plus the companion
character's four stages at the `CHARACTER_MODEL_SLOT` paths. Provenance,
method, and the AIS-supersession rule live in
[`../docs/spec/species-model-pack.md`](../docs/spec/species-model-pack.md).
View them all at `/model-gallery.html` (dev server), regenerate with
`node script/build-species-model.mjs`. The 83 MB of `.glb` is served on demand
and deliberately **not** precached — but its 422 kB manifest
`species-model.json` **is**, because it is the only input to the rotating world
and without it offline the "Out right now" strip renders nothing at all.

The character's four stages render through a self-hosted `<model-viewer>`
(`src/character-model.tsx`, lazy-loaded) and their `.glb` files are precached,
which is spec T4.1 and closes the "3D character offline" blocker.

## What is out right now

The play layer, wired in `src/live.tsx`:

- **`spawn.ts`** — a deterministic world per 30-minute window, seeded from
  `sector_code:window_index`, so two phones side by side see the same finds.
  Rarity is the species' **real iNaturalist campus observation count**; how
  often each band appears (55/25/15/5) is the one invented number and the card
  says so. A find within 40 m opens the camera; further away the map goes to it
  and says walk, because a find logged where you are not standing records
  nothing useful.
- **`badge.ts`** — 13 badges, every one a pure function of this device's
  journal. `badge.test.ts` enforces two rules: no badge may name or describe a
  fact outside the journal (*synced*, *leaderboard*, *rank* are a pinned
  regex), and no two badges may fire identically while every badge stays
  reachable.
- **`kind.ts` / `kind-mark.tsx`** — only 25 of 1,098 species have curated
  artwork, so the rest say what taxon group they are, as one of eleven
  schematic shapes shared by the list row and the map marker. Nothing pretends
  to be a species portrait.
- **`sync.ts` + `campus-world.ts` + `worker/sync.ts`** — same-origin live
  campus world. Production hits `/sync` `/world` `/live` on the PWA host
  (Durable Object). Locally, `npm run sync` on port **8788** and Vite proxies
  those paths. Photos and notes never leave the device; only species, place,
  and presence (points / streak as “who is out”, not an official AIS rank).
  A six-character walker code joins two phones as one player. With no server
  reachable the world strip renders nothing rather than an unmeasured zero.
- **`gamify.ts`** — device-local points (Explore 10, Learn 10, Observe 25,
  Hunt 40, Local verified 50), weekly streak, Biodiversity Buddy, a seeded
  demo board, and one daily hunt (a tree + a biome, deterministic per
  player-day). Observe awards once per `species+sector`. Hunt pays when the
  daily species is logged. The board is never an official AIS rank.

**Measured limit:** only 9 of the 1,098 pool entries carry an origin, because
the iNaturalist sweep never requested `establishment_means`. The intended 1.5×
bias toward native species therefore reaches 0.8% of the world today.
`spawn.test.ts` holds that number so improving it fails loudly.

## Two map views

- **Play** (default) — raked camera, sector fills on one green ramp, your
  character standing in it, ambient canopy and birds. Draws its own vector
  ground from `campus-shape.json`, so it needs **no tile server at all**.
- **Field** — the same sectors over four real basemaps, with the path network,
  every layer control and every citation. The reference surface.

Two fingers (or shift-drag) swing the camera 360°; the compass returns north.
`?bearing=62` seeds an angle for a projector demo or a reproducible screenshot.

## Regenerating the map data

Three stages, in order. The first two need network; the third needs the dev
server running (it borrows Chrome's image decoder over CDP rather than adding a
JPEG dependency to a repo that runs on react and react-dom alone).

```
node script/fetch-osm-way.mjs        # OSM roads, paths, buildings → script/data/ (cached)
node script/build-sector.mjs         # planar arrangement → campus-sector.json + campus-shape.json
npm run dev &                        # measure-vegetation needs a real origin
node script/measure-vegetation.mjs   # Esri imagery → vegetation_ratio, kind, is_biome
```

`script/shot.mjs <url> <out.png> [w] [h]` screenshots a route at an **exact**
viewport. Use it rather than `chrome --headless --window-size`, which clamps to
a ~500 px minimum on Windows and silently invalidates any 390 px check.

## Attribution

Sector boundaries, basemap geometry and the path network are
© OpenStreetMap contributors, ODbL. Vegetation is measured from Esri World
Imagery (© Esri, Maxar, Earthstar Geographics). Inventory figures are AIS,
SY 2025–2026. These credits are licence terms, not chrome — they render.
