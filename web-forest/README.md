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
npm run handset    # build, then serve over HTTPS on the LAN for a real phone
npm run deploy     # build, then wrangler deploy (needs `wrangler login` first)
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
  says so. A find within 40 m opens the camera; further away the map walks you
  there. Default position is **this device** (GPS).
  - **The near field.** The campus-wide spread (90 finds over 38.8 ha) was
    right while the map was a survey read from above, and wrong the moment the
    camera locked to the walker: at z19–22 the screen holds a sector or two, so
    ninety finds campus-wide is a screen with nothing on it. `spawnAround`
    generates a dense field on a grid **fixed to the campus**, not to the
    player — walking does not roll new dice, it brings you to dice already
    cast, which is what keeps two phones agreeing. `spawnWorld` unions that
    with the campus-wide world outside the radius, so no find is drawn twice.
- **`pet.ts` + `pet-eagle.tsx` — Agila, the pet eagle** (09-25 note, `0:35`–`1:09`:
  "pet eagle as a companion … and also as a sleep pet"). A Blue Eagle drawn for
  this app (`src/asset/magi/pet/`, three hand-authored SVG poses: perch, fly,
  sleep — a mascot nod, not an official Ateneo asset). It stands beside the
  walker on the play map and trails them with a lag in ground space, flaps
  while they walk, perches when they stop. It sleeps (dimmed, "Zzz") after
  **2 min with no movement and no touch**, or when standing still between
  **22:00 and 06:00** local time. Tap it for its card: rename (kept on this
  device only), what it is doing and why, and a **bond** that is nothing but
  the count of journal finds in the last 7 days — shown next to the label, and
  marked "(demo journal)" when seeded rows are in it. The pet sleeps; nothing
  tracks the user's sleep, and the card says so. Reduced motion: no follow
  animation, no flapping. Spec at the top of `pet.ts`; tests in
  `test/pet.test.ts`.
- **The camera.** Welded to the walker whenever there is a fix: a drag rotates
  around you instead of panning off you, and the zoom band is **z19–z22**
  (~110 m down to ~14 m across a phone). You cannot pull back to the campus
  diagram from the play view; the field view still has it, one tap away.
  `?zoom=` and `?bearing=` set a reproducible camera for a projector.
- **`zoom.ts` — continuous zoom**, ported from the fix in `tripi`
  (`apps/web/public/map.html`, which gets it from Leaflet's `zoomSnap: 0` plus
  an inlined SmoothWheelZoom). This repo has no Leaflet on purpose, so the
  technique is ported rather than the plugin: the zoom is **fractional**, the
  tile grid and every projection stay on `tileZoomOf()` and the leftover
  fraction rides on a CSS scale of the ground plane, so between whole levels
  nothing is refetched and nothing is reprojected. The wheel sets a *goal* and a
  frame loop eases 30% of the gap per frame, anchored on the cursor.
  **Two fingers now pinch as well as rotate** — before, they only rotated, so on
  a phone the one gesture everybody tries first swung the camera instead.
- **`joystick.tsx` + `play-walk.ts`** — an on-screen thumbstick, because the
  26 September showcase is in a hall with no campus trees and a GPS fix that
  resolves somewhere this app correctly refuses to spawn anything. **A fix that
  lands off campus now switches to the stick by itself and says so** — a
  playtest at 375 px with the venue's coordinates found that the one case the
  feature exists for was the one case that fell through: a clean off-campus fix
  kept the app in GPS mode, hid the stick, and showed an empty green screen with
  nothing to press. It drives
  the same `play` source WASD drives, under the same rules (inside
  `CAMPUS_BOX`, outside the restricted grove), so a stick walk and a GPS walk
  produce the same journal. Its PACE, though, is its own: the stick moves at a
  fraction of the visible ground per second (`stickTopPaceMs`), not at
  `WALK_PACE_MS`. 1.3 m/s is the real preferred walking speed and it is a claim
  the app prints — every "≈4 min walk" caption comes from it — but on glass it
  crossed the street camera in twenty seconds and reached a find sixty metres
  out in three quarters of a minute. Quoting the pace against the camera is what
  makes it feel the same at z19 and z22. The throttle IS the speed, so a thumb
  can reach the top of the range; speed used to live on Shift, which a phone
  does not have. **It is not a GPS spoofer**: the fix it makes is
  tagged `source: "play"`, and every surface that shows a position says which
  of the three it is. The position source now has its own control on the play
  view itself, not only behind the field layers.
- **`building.ts` + `skyline.tsx`** — 75 campus buildings with real heights,
  imported from the sisia campus app (`script/import-sisia-building.mjs`, run
  by hand; the output is committed). Drawn as **footprint plus a soft drop**,
  not as extruded prisms. The prism code is there and `?skyline=solid|hollow`
  will show you it, but a prism is painted in screen space above the whole
  tilted plane and therefore cannot depth-sort against a path in it — a
  building covers a footpath that is actually in front of it. `shadow` is the
  default because it is the only one of the three that does not claim a volume
  the renderer cannot sort. Sports grounds are excluded outright: a pitch is
  ground, and extruded it laid a 12,055 m² slab over the walker.
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
- **Gestures and haptics.** A tap on the play ground means GO THERE, not "show
  me this area's statistics" — the sector card moved to the field view, where a
  survey belongs. A drag never becomes a tap: `TileMap` traps the click in the
  capture phase when the gesture travelled, so a camera swing that happens to
  end over a marker no longer opens it. `haptic.ts` adds a second, eyes-free
  confirmation channel and is honest that **iOS Safari has no `navigator.vibrate`
  at all**, so nothing is ever only haptic.
- **`friend.ts` + `streak-flame.tsx`** — walking partners and the streak they
  keep together, answering the Working Doc's *"Note to Gelo: Is this
  feasible?"* on group streaks and the 09-21 recording's friends system
  (`29:17`, `35:37`). Feasible because the world already stamps every find with
  who made it and when. **The group's week is alive if any one member walks
  it** — a streak, never a total, because a total makes the group a
  leaderboard, which is the thing a shared streak was chosen instead of. The
  roster is local and **one-sided**, and the card says so: nobody is notified,
  nothing is shared beyond finds already on the board. A mutual graph needs the
  consent and retention decisions the Working Doc still lists as open. The
  streak renders as a small flame that gets **hotter, not bigger** (`38:13`,
  `40:00` — *"you have to keep the fire small"*), never overlaps the plant, and
  always carries its number.
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
  ground from `campus-shape.json`, so it needs **no tile server at all**. The
  camera sits at z22 (`PLAY_MAX_ZOOM` in `src/play-map.tsx`): a 390 px phone
  spans about 14 m, so one street fills the view and the walker reads at about
  human scale. Field keeps the basemap's own ceiling.
- **Field** — the same sectors over four real basemaps, with the path network,
  every layer control and every citation. The reference surface.

Two fingers (or shift-drag) swing the camera 360°; the compass returns north.
`?bearing=62` seeds an angle for a projector demo or a reproducible screenshot.

## Look and feel

The app wears **Magisphere's own look**, taken off the team's poster set
(2026-09-23): a sky that fades into mint paper, white "sticker" cards with a
soft forest shadow, wood-plank signs for quests and directions, sunny yellow for
rewards, Fredoka for headlines. It replaced the chess.com port (charcoal
`#312E2B` / `#262421`, the inset green button) on 09-23. The posters were the
**reference**, not the source — nothing from them ships 1:1.

- **`src/game.css`** — the `--mg-*` tokens and every `gm-` / `mg-` class.
  Components read these rather than inventing colours; inline styles use
  `rgb(var(--mg-ink-rgb) / a)` for ink at an alpha.
- **`src/hud.tsx`** — the play layer's chrome: player card (level, points,
  weekly streak), the daily hunt as a wood-plank tab, the leafy tab bar
  (Buddy · Nearby · Go · Dex · About) with the camera as a raised sky lens,
  reward toast, and the Dex field-guide cards.
- **`src/character.tsx`** — the walker. It draws the stage **sticker** (seed →
  seedling → sapling → tree) and keeps the billboard, contact shadow, bob and
  walking gait. Vigor greys the sticker; it never changes the stage.
- **`src/level.ts`** — trainer level is a way of *displaying* points, not a
  second score: level L starts at 50·L·(L−1) points. Nothing awards "XP".

**The asset kit.** Three production paths, one palette (sampled off the
posters; the list is in `script/magi-asset/build-vector.mjs`):

| Path | What | Where | Rebuild |
|---|---|---|---|
| Generated | Sprout buddy (sprout, cheer, map, sleep, trail), the explorer, the four growth stages | `src/asset/magi/sticker/` (1024 px masters), `src/asset/magi/web/` (400 px WebP the app ships) | `script/magi-asset/sticker.spec.json` via the codex skill's `imagen.mjs` |
| Drawn by code | Mark, wordmark (Fredoka outlines), lockups, app icon, scenes, wood sign, ornaments, the 12 game icons | `public/brand/magi/*.svg`, `src/asset/magi/icon/*.svg` | `node script/magi-asset/build-vector.mjs` |
| Rendered | PWA icons, PNG exports, posters, social, OG, banner, sticker and brand sheets | `public/brand/icon-*.png`, `../docs/brand/magisphere/` | `node script/magi-asset/render.mjs` (needs Chrome) |

Stickers are generated on a `#FF00FF` key and **remapped to the 17-colour
palette** with no dither, so they cannot drift off-brand; each one met its
contract (size, palette, ink share). Icons are vector on purpose: they live at
15–52 px, where a downscaled render goes soft. Fonts (OFL) are vendored in
`script/magi-asset/font/`, so the wordmark renders identically anywhere. The
older kit icons and Settings art in `src/asset/icon/` are still the previous
generation (specs and keyer in `script/icon/`) — see `../docs/brand/magisphere/README.md` for what is still open.

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
