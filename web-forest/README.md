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
npm run sync       # live campus world + accounts + hall socket on :8788 (Vite proxies /sync /live /world /auth/ /account/, ws too)
npm run build      # tsc --noEmit && vite build
npm test           # node --test
npm run lint
npm run smoke:detect  # plant-detection smoke suite (replay unless a token is set)
npm run audit:model     # every .glb: parses, in range, has a mesh, grounded, <=1.5 MB
npm run audit:location  # every find, encounter and walk target on green, unbuilt, open ground
npm run handset    # build, then serve over HTTPS on the LAN for a real phone
npm run deploy     # build, then wrangler deploy (needs `wrangler login` first)
```

Port 4177 is claimed with `strictPort`, so a collision fails loudly rather than
silently moving.

## iNaturalist identify

The camera sheet sends the photo to **`POST /inat/identify`** on our own
origin (`worker/inat.ts`). That proxy forwards it to iNaturalist's
`/v1/computervision/score_image` with the campus lat/lng (iNat's geo prior) and
the **`INAT_API_TOKEN` secret, which lives only on the server** — it is not in
the bundle. The client (`identifyPlant` in `src/inat.ts`) tries the proxy
first, on the sync base (see *Accounts*). Under `npm run dev` only, if no proxy answers, it falls back to a direct
call with `VITE_INAT_API_TOKEN` from `.env`; a production build compiles that
read away (checked: the token is not in `dist/` even with it in `.env`). With
neither, the sheet replays a recorded Narra reply labelled **RECORDED
RESPONSE**, never presented as an identification of your photo — and says why:
a proxy that answered `needs_token` is "no iNaturalist token"; a 404 or an
unreachable server is named as that (`no_proxy`), not blamed on a token.

When the answer's first **exact** campus match is one species, the sheet picks
it in "What did you see?" and says so ("suggested by iNaturalist", plus
"recorded reply" when it is the replay) — the sheet opens on the daily target,
and a Narra photo used to save as that target. A pick made by hand after the
photo always wins; a genus/family roll-up never picks (`suggestedPick` in
`src/inat-match.ts`).

**Making it live — do this right before the demo:**

1. Signed in to iNaturalist, open <https://www.inaturalist.org/users/api_token>
   and copy the token.
2. Deployed Worker: `npx wrangler secret put INAT_API_TOKEN` and paste it (no
   redeploy needed). Local: `INAT_API_TOKEN=… npm run sync` (Vite proxies
   `/inat/identify` to it), or put `INAT_API_TOKEN=…` in `.dev.vars` for
   `wrangler dev`.
3. Check it: `INAT_API_TOKEN=… npm run smoke:detect`, or
   `npm run smoke:detect -- --url https://<deployed host>` to test the
   deployed secret itself.

**The honest caveat: iNat API tokens expire after 24 hours.** There is no
long-lived key for this endpoint. A token set tonight stops working tomorrow
night; after that the proxy answers `401 token_expired`, the sheet says the
token expired and falls back to the labelled recorded reply. Repeat steps 1–2
each day it must be live. The token in the local `.env` expired 2026-09-08.

Error states the sheet shows: `needs_token` (503, no secret), `token_expired`
(401), `rate_limited` (429 — iNat's throttle, or ours: 40 photos a minute per
IP), `offline` (iNat unreachable or no network). The proxy is same-origin only:
no CORS header, and a POST whose `Origin` is another site (or whose
`Sec-Fetch-Site` is `cross-site`) is refused 403 before the token is touched,
since a `no-cors` form POST would otherwise still spend it. It counts the body
as it streams and cuts it past ~5 MB (413), declared length or chunked — on the
LAN server that drops the upload — and refuses a part that is not `image/*`
(415). An early refusal on the LAN server (no token, foreign origin, rate
limit) drains the unread upload, up to that cap, before answering, so the
503 `needs_token` reaches the sheet through the Vite proxy instead of a socket
reset the proxy turns into a 502 (`test/identify-lan.test.ts`). The 40-a-minute brake is in memory, so on Workers it is **per isolate**:
a brake on scripts, not a quota.

Matching (`src/inat-match.ts`) maps each suggestion to the nine campus species
by iNat taxon id and ancestry: **exact** (the taxon, or below it — any fig is
Balete, whose row is genus *Ficus*), or a **genus / family roll-up** flagged
*partial* ("Vitex" is Molave *or* Lagundi). Only a live exact match pre-fills
the pick.

### Detection smoke suite

`test/detect-smoke/` holds nine CC-BY / CC0 iNaturalist photos, one per campus
species, resized under 100 KB, with licence and attribution in
`manifest.json`. They are **not photos taken on campus** — the same species
photographed elsewhere, mostly the Philippines. `npm run smoke:detect` runs
each through the same `identifyPlant → /inat/identify → matchCampus` path as
the app and reports exact top-1 / top-5 (exit 1 below `--min-top1 0.6` /
`--min-top5 0.8`, exit 2 if it cannot run live).

With no token it runs in **REPLAY mode** and prints so in a banner. The saved
replies in `response/` are currently **constructed** (real taxon ids and
ancestry, hand-written order and scores) because the only token available on
2026-09-25 had expired, so the replay numbers measure our plumbing and
matching, **not iNaturalist's accuracy**. With a fresh token,
`INAT_API_TOKEN=… npm run smoke:detect -- --record` replaces them with real
recorded replies (`is_recorded: true`). `npm test` runs the replay.

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

`npm run audit:model` (`script/audit-model.mjs`) checks every `.glb` the app
can ask for — the manifest plus the five character slots — as files: glTF 2.0
binary, chunks and accessors in range, at least one mesh, not over 1.5 MB, not
zero-size, standing on y=0, manifest `bytes` matching disk, every animation
channel aimed at a node the scene draws (`dangling_track`), no orphans or
duplicates. `test/model-audit.test.ts` runs it, so a regression fails
`npm test`. Current state: 1,103 files, all clean, median 2,452 triangles,
largest 114 kB. On 09-25 it found 110 models floating over or sunk through the
ground plane (a cat 14 cm up, spiders' legs through the floor); the builder now
measures the rest pose and wraps such a model in a `ground` node, using the
same `groundOffset` rule the audit checks. Flying poses (butterflies, moths,
dragonflies, flies, bees, wasps) may hover but not sink; the companion's soil
mound is half-buried on purpose. Until 09-26 every file's idle clip animated
a `root` node that was never in the scene, so three.js warned "No target node
found for track: root.scale" and nothing breathed; the builder now puts the
root in the scene. A flowering tree's blossoms sit on the crown's surface at
their own height rather than at the footprint's full reach, which had hung
top-of-crown flowers in the air on a bare stick (the Narra's stray branch).
How the models LOOK is a separate gate: `node script/species-model/audit.mjs`.

The character's four stages render through a self-hosted `<model-viewer>`
(`src/character-model.tsx`, lazy-loaded) and their `.glb` files are precached,
which is spec T4.1 and closes the "3D character offline" blocker.
Each stage is framed on the figure's height, not the whole bounding box
(`STAGE_FRAME`), so the seedling fills its box instead of standing small on
its soil disc. No viewer shows model-viewer's loading bar (it left a dark
strip on the pin sheet and the species card). The stage reveal headlines the
stage its sticker shows ("Sprout") and names the cosmetic it unlocked under it.

**The 3D species card** (`src/species-card.tsx`, lazy-loaded; pure half in
`src/species-card-core.ts`) is where the pack is actually shown. It opens from
a seen Dex card, a species in the dock's Nearby tray (the old camera move is
now its "Walk to it" / "Log it here" button), and the species name on the tall
pin sheet. It turns the model (no turntable or idle clip under
`prefers-reduced-motion`), shows the portrait while it loads, and falls back to
the portrait with a stated reason when there is no model, it fails, or the
phone is offline: the pack is not precached, so the card says "3D needs a
connection". It also shows the names, taxon kind, rarity band from the campus
count, whether the species is in your journal, the curated Learn text where it
exists, and Open in Seek. Opening it is a Learn (+10) under the same
`species:<code>` subject as the Learn sheet, so it pays once per species.
The tall pin sheet opens on the same turning model (`SpeciesHero`, exported
from the card's chunk) instead of a flat drawing; on a desktop it sits under
the HUD and the daily-hunt chip with "Log this sighting" pinned in view. Every
sheet — the card (sticky header), the pin sheet and the Buddy sheet — has a
44×44 × close, and Escape closes the top open sheet. The Buddy sheet rises from
behind the dock, so every dock button stays tappable while it is open.

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
  walker on the play map and trails them with a lag in ground space — on a
  leash of 0.45 walker widths, so a fast walk-to cannot leave it behind — flaps
  off the walker's shoulder while they walk, and perches on the ground just
  past the walker's figure (never over it) when they stop (`petOffset`, sized
  off `avatarPx`). It sleeps (dimmed, "Zzz") after
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
  **The feel (09-25 note: "big roads, zoomed-in characters, a natural tilt…
  still very jittery")** lives in `camera-feel.ts` and `fix-filter.ts`, both
  pure and tested:
  - *Jitter.* GPS fixes go through an accuracy-weighted Kalman filter with a
    1.8 m stationary dead-band (`fix-filter.ts`), so standing still publishes
    nothing. The raked camera glides toward the walker on a
    `requestAnimationFrame` critically damped spring (`glideStep`) and the walker
    is drawn at that glide centre (locked or merely following). While following,
    the camera's target is DERIVED from the fix during render (`camera_view` in
    `app.tsx`), not copied into state by an effect, so a walk costs one render
    per tick and React's "Maximum update depth" warning has nothing to count;
    `view` state changes only on a zoom, a gesture, a recentre or a jump. 50 ms stick
    steps and 1 s GPS steps come out as one continuous move. The spring chases
    a point that slides between position updates over the cadence they arrive
    at (`tickLerpNext`), not the raw steps — so a walk starts smoothly instead
    of moving on every other frame, and a turn bends over one tick instead of
    jumping. The ground is memoised, culled to a circle round
    the camera and re-projected only every 2,048 plane px; between those
    anchors a move is one CSS transform. The pulsing rings are composited HTML,
    not animated SVG.
  - *Measured*, headless Chrome, 390×844, play view, holding W (release build,
    `vite preview`, same machine, two runs each): before **~13 fps walking,
    ~18 idle** (p50 76 ms / 60 ms, nearly every frame over 33 ms); after
    **~64 fps walking, ~65 idle** (p50 15 ms, 2 frames over 33 ms in 6 s). At
    4× CPU throttle: before ~1.4 fps walking, after ~11. Not yet measured on
    the booth phone — open the play view with `?probe=1` for the on-screen
    readout (`frame-probe.tsx`).
  - *Roads* are drawn at real width (5.5 m roads, 2.6 m paths, floored and
    capped in px), cream with a soft kerb.
  - *Walker* is 22%→28% of the map's short side as the camera closes (82→105 px
    on a 375 px phone), capped at the old desktop 136→172 px; `avatarPx` is the
    one source, remote walkers draw at 75% of it. Standing at 70% of the screen height so the ground ahead shows.
  - *Tilt* rests at 46° pulled back and eases to 58° at z22; two fingers dragged
    vertically (desktop: shift- or right-drag) adjust it within 40–64°. A
    12 px deadzone keeps a pinch or a swing from nodding the camera.
  - *Restricted ground* is quiet dry ground — a faded sage, the lawn with the
    life taken out. No hatch, no label. (It was flat gray, which beside the
    walker's start read as a hole in the map.)
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
  `CAMPUS_BOX`, outside the restricted grove, outside every building
  footprint — a blocked stick step slides along the wall at up to 75°, and a
  walk-to that stops closing in for a second gives up; a walk-to target is set
  on walkable ground first — `walkTargetOf` backs a target inside a footprint
  out toward the walker, and a walk to a find stops 3 m short of its pin), so a
  stick walk and a GPS walk
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
- **`placement.ts`** — one rule for where anything may stand: on a green
  sector (≥45% measured vegetation), outside the grove placeholder, outside
  every `building.ts` footprint, and inside `CAMPUS_BOX` — i.e. `isWalkable`,
  the same function the stick and tap-to-walk obey (it lives here now). Some
  sector rings run north of the box, and about one find in sixty-four landed
  where walk-to could never reach; the audit now also counts unwalkable finds. The spawner used to check only the first two,
  so about one find in seventeen stood inside a building; it now checks all
  three. Two curated encounters (e3, e6) sat on a road and were moved 23 m and
  43 m onto the nearest green sector; their `where` names still come from the
  old hand-drawn map and are not re-surveyed. "Walk me there" on the daily hunt
  now leads to `walkPoint(sector)` — the label point when it is good ground,
  else the nearest good ground — because 8 of 68 labels sit on a roof or in the
  grove. `npm run audit:location` prints any failure with its nearest fix;
  `test/placement.test.ts` holds all of it.
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
  reachable. *Five Species* / *Fifteen Species* count distinct species with a
  photo on this device, like the Journal's "species photographed" — a pick off
  the list with no photo is a find, not a photograph.
- **`kind.ts` / `kind-mark.tsx`** — only 25 of 1,098 species have curated
  artwork, so the rest say what taxon group they are, as one of eleven
  schematic shapes shared by the list row and the map marker. Nothing pretends
  to be a species portrait. `speciesLabelOf` is the one display name for a
  sweep species — the Nearby tray, the hunt tab and the day's hunt card: Title
  Case common name, the scientific name in italics only when there is none.
- **`sync.ts` + `campus-world.ts` + `worker/sync.ts`** — same-origin live
  campus world. Production hits `/sync` `/world` `/live` on the PWA host
  (Durable Object). Locally, `npm run sync` on port **8788** and Vite proxies
  those paths. Photos and notes never leave the device; only species, place,
  and presence (points / streak as “who is out”, not an official AIS rank).
  A six-character walker code joins two phones as one player. With no server
  reachable the world strip renders nothing rather than an unmeasured zero.
- **`account-core.ts` + `account.ts` + `account-panel.tsx` + `worker/account.ts`**
  — optional accounts and the per-account save; see *Accounts* below.
- **The hall — live multiplayer on the play map** (`multiplayer.ts`,
  `remote-walker.tsx`, `worker/live-socket.ts`, `server/hall.mjs`). Every phone
  on the play view sees the other walkers — their stage sticker, name, level
  and position source — moving live, a callout when somebody logs a find within
  150 m, and an "N walkers out" pill (hidden until the hall has actually
  answered). That count includes you once your pose is out ("3 walkers out,
  incl. you") and is the ONLY walker count: the trainer sheet's `LIVE · …` and
  the Dex strip read the same hall roster (walkers heard in the last 60 s), not
  the synced world's 15-minute `walker` list. The app opens the hall once, so it
  stays live off the play view. Your live name is the signed-in account's
  display name, else the Settings name, else the generated one; your level is
  the HUD's (`levelOf(total_points)`), for the hall and the sync alike. Remote
  walkers are drawn at your own walker's size (`avatarPx`). Transport is a WebSocket on the Durable Object (hibernation API,
  `GET /live/socket`); when an upgrade fails the client polls `POST /live/pose`
  / `GET /live/walker` every 2 s and keeps retrying the socket. Poses go out at
  most once a second, only on a ≥3 m move or a look change, plus a 10 s
  heartbeat; remote walkers glide from where they are drawn to each new pose
  (no teleport jitter; a >150 m jump snaps) and are dropped after 60 s unheard.
  Works in stick/demo mode — that is the point, the showcase hall is off
  campus. `npm run sync` serves the same socket with a hand-rolled RFC 6455
  server (no `ws` dependency). **What is shared, and nothing else:** a display
  name, a level, the growth stage the avatar is drawn from, and a position
  inside the campus frame tagged `gps` / `demo` / `play`. A position outside
  the campus box is refused on both ends. The `player_id` is never sent to
  other phones (the hall keys walkers by a one-way hash), and presence is held
  in memory only, never stored. Brakes, the same on the Worker and the LAN
  hall: the socket upgrade and `POST /live/pose` must come from the hall's own
  page — this host, localhost dev, the same LAN/loopback hostname on another
  port (the handset build on :4177 or :4178 talking to `npm run sync` on :8788),
  or an origin listed in `HALL_PAGE_ORIGIN` (comma-separated; env on the LAN
  server, a var on the Worker) — 403 otherwise. `/live/pose` sends CORS headers
  (its preflight included) only to such a page on another origin, echoing that
  origin, never `*`. The hall holds at most 200 walkers; per IP the LAN hall
  seats at most 4 sockets and 4 polled walkers, the Worker 40 of each —
  because on Cloudflare the IP is the public one and a whole booth's wifi
  shares it, while on the LAN every phone has its own. Poses past 2 a second
  per socket or polled walker (60 per IP) are dropped; the LAN hall caps a
  fragmented message at 64 KB and a `/sync` or `/live/pose` body at 2 MB,
  answering 413 (`Connection: close`) and only then dropping the request —
  the client's `/sync` reports "too large", not "offline". `npm run sync`
  reads each phone's address from the socket, or behind the Vite proxy (which
  runs `xfwd: true`) from the last `X-Forwarded-For` entry — trusted only from
  loopback. The same-origin Worker is the path that works
  on phones; `?sync=` to an `http://` LAN box is blocked as mixed content on the
  HTTPS handset build.
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
  Hunt 40, Local verified 50 — never for a pick off the recorded demo
  identify reply, which saves with `is_demo_id` and reads "Needs ID · Demo
  ID"), weekly streak, Biodiversity Buddy, a seeded
  demo board, and one daily hunt (a tree + a biome, deterministic per
  player-day). Observe awards once per `species+sector`. Hunt pays when the
  daily species is logged. The board is never an official AIS rank.
- **`blindbox.ts` + `blindbox-reveal.tsx`** — the Working Doc's blind box,
  earned and never bought. A box is derived from the points ledger and from
  nothing else: one per finished daily hunt (`hunt:<day>`) and one per species
  logged for the first time (`species:<code>`). Explore and Learn earn none, and
  the `?seed=demo` journal writes no point events, so it earns none either. Opening
  one plays the stage reveal's shake → crack → burst and puts a charm from an
  eight-charm set on the Journal shelf. There are **no odds**: within a round no
  charm repeats, so the set is complete after exactly eight boxes, and which
  missing charm a box holds is a hash of its own id. The same journal opens the
  same charms on any device. Only the opened list is stored
  (`field-guide.blindbox`); `blindbox.test.ts` pins all of it, including that
  nothing calls `Math.random`.

**Measured limit:** only 9 of the 1,098 pool entries carry an origin, because
the iNaturalist sweep never requested `establishment_means`. The intended 1.5×
bias toward native species therefore reaches 0.8% of the world today.
`spawn.test.ts` holds that number so improving it fails loudly.

## Accounts — the working database

Optional accounts, from the 09-25 note (`0:35` accounts, passwords, Google
OAuth; `4:41` a working database). Settings → Walker → Account; a signed-in
`@username` line sits on the HUD player card.

**Decision: the database is the SQLite inside the CampusWorld Durable Object**
(`ctx.storage.sql`), not Gelo's VPS or Neon. It is already deployed with the
PWA, it is a real SQL store with transactions and unique indexes, it costs
nothing extra, and it keeps the auth cookie same-origin with no CORS and no
second host to keep alive on demo day. Locally, `npm run sync` runs the same
`AccountService` on `node:sqlite` (`server/yclap-account.db`, gitignored).
If the project outgrows one Durable Object, the SQL moves to Neon unchanged.

- **Tables:** `account` (account_code, username unique, password_hash,
  password_salt, google_sub unique nullable, display_name, created_at,
  updated_at) · `session` (session_token_hash, account_code, expires_at) ·
  `save` (account_code, save_json, updated_at).
- **Routes** (`worker/account.ts`, hooked into `worker/sync.ts` in two lines):
  `POST /auth/signup` `/auth/login` `/auth/logout` `/auth/password`,
  `GET /auth/me`, `GET /auth/google` + `/auth/google/callback`,
  `GET|PUT /account/save`. POSTs must be JSON. The client sends every account
  call (and `/inat/identify`) to the same base the campus world uses
  (`syncRouteOf` in `sync.ts`: `?sync=`, `VITE_SYNC_URL`, else this origin),
  with `credentials: "include"` when that is another origin — a Path A build
  on :4177 signs in on the sync server on :8788. The servers answer such a
  page (another port of the LAN host, or `HALL_PAGE_ORIGIN`) with its own
  origin and `Access-Control-Allow-Credentials: true`, never `*`, and nobody
  else (`accountCorsOf` in `rate-limit.ts`). The cookie stays `SameSite=Lax`
  (same hostname on another port is same-site); `Secure` only over https.
- **Passwords:** PBKDF2-SHA256, 100,000 iterations — the most the Workers
  runtime accepts, and short of OWASP's 600,000 for this hash, which the rate
  limits below partly make up for — 16-byte per-account salt, constant-time
  compare. **Sessions:** 32 random
  bytes in an `HttpOnly; SameSite=Lax; Secure` cookie (Secure is dropped only
  on plain-http localhost), stored server-side as a SHA-256 hash, 30 days.
  Changing the password signs out every other device. Expired sessions are
  swept from the table at most once an hour.
- **Rate limits** (429 + `Retry-After`): 5 failed logins per username *from
  one IP* per 15 minutes (so a stranger's guesses cannot lock the owner out),
  and 50 per username from all addresses together, the attempt counted
  *before* the password hash runs so a parallel burst cannot slip past; per IP
  (`CF-Connecting-IP`), 50 failed logins per 15 minutes and 40 signups an hour
  — generous because a booth of phones shares one public IP. `npm run sync`
  sets the IP from the socket, or behind the Vite proxy from the forwarded
  address, and skips per-IP limits only for a local script. All in memory, bounded to 10,000 keys,
  so they reset if the Durable Object is evicted. Account bodies over 1.5 MB
  are refused before they are buffered; `Content-Type` must be exactly
  `application/json` (parameters allowed).
- **The save:** journal rows + the point ledger (the streak is computed from
  it). **Photos never leave the phone** — `photo_data` is nulled before upload
  and again on the server. On sign-in, on load and a few seconds after each new
  find, the device pulls the account copy, **unions** it in (every local find
  survives; server-only rows are appended with a fresh catalogue number if
  theirs is taken; the same point subject is never paid twice), then pushes the
  union back. The server stamps `updated_at` itself; a PUT carries back the
  `base_updated_at` it read and only lands if that is still the stored stamp
  (compare-and-swap in one conditional SQL statement). Otherwise 409 plus the
  server's copy, which the client merges and retries once. No phone's clock is
  ever read, so a phone set to 2099 can neither win nor lock the others out.
  Every `/auth/*` and `/account/*` answer carries `X-Save-Protocol` (now 2,
  `SAVE_PROTOCOL` in `account-core.ts`); a tab whose build speaks another
  number pushes nothing and shows "Update available — reload" with a Reload
  button. Any other failure — a malformed save included — is "Sync failed: …"
  with a Retry button. (A tab built before the header existed cannot know to
  look for it, so it still shows "Sync failed".) The service worker is at `magisphere-v8`
  and serves the page network-first, so a reload picks up the new build. Known
  limit: no tombstones, so a find deleted on one phone comes back from the
  account.
- **Google:** on only when both secrets exist. Without them `/auth/google` is a
  503 JSON and the button is greyed with a caption saying why. The flow is the
  OAuth code flow with a 10-minute `mg_oauth_state` cookie, a server-side code
  exchange, and the id_token checked through Google's tokeninfo plus our own
  `aud` / `iss` / `exp` checks. Signed in already → Google is linked to that
  account. To switch it on (human step — needs the Google Cloud console):

  ```
  # Google Cloud → APIs & Services → Credentials → OAuth client ID (Web)
  # Authorised redirect URI:
  #   https://yclap-field-guide.marangelonrevelo.workers.dev/auth/google/callback
  #   (and http://127.0.0.1:4177/auth/google/callback for local dev)
  npx wrangler secret put GOOGLE_CLIENT_ID
  npx wrangler secret put GOOGLE_CLIENT_SECRET
  # local: GOOGLE_CLIENT_ID=… GOOGLE_CLIENT_SECRET=… npm run sync
  ```

This is the project's own server, not an Ateneo login, and the panel says so.

## First open, warnings, and the landscape

- **Boot** (`src/boot.tsx`, `src/boot.css`). The genre's cold start, cut from the
  brand kit: the stacked lockup on the scene's pale sky with the Youth CLAP and
  Ateneo credits, then the trail scene with the Sprout cast, a rotating tip and
  a progress bar, then a safety card ("Stay aware of your surroundings"). The
  bar counts real work (fonts, the species pool, the art), and the loading
  screen stays up at least 2.4 s from when it appears, so a warm cache does not
  flash past. Every tip is a rule the build enforces. Nothing in the boot is
  white: `index.html` paints the sky and the lockup inline before the script
  arrives, and each screen cross-fades in over the one before it.
- **Alerts** (`src/alert.tsx`). One card for every interruption. Light for
  "before you start" (no position here, off campus), dark over a dimmed map for
  "stop" (weather, going too fast). Each shows once per launch.
- **Weather** (`src/weather.ts`). Open-Meteo's current conditions at Loyola
  Heights, no key. Thunder, heavy rain, or a PAGASA "danger" heat index (≥42°C
  feels-like) raises the dark card. The chip at the top right always shows the
  sky and reopens the card. Offline there is no chip at all, never an
  unmeasured all-clear. The card says it is a model, not a PAGASA bulletin.
- **Speed.** Two GPS fixes more than 7 m/s apart raise "You are going too
  fast". Stick and demo walks are exempt.
- **Today's hunt.** The day's first open shows the daily hunt as a ribbon card,
  with "Let's go" and a full-size "Later" inside the card. It is not a login
  bonus: the +40 pts is the hunt's own, paid only when the species is logged.
  The hunt tab flies the map to the hunt's finds (the species itself if the
  window spawned it, else the finds in its area), not to the area's label.
- **Horizon** (`src/horizon.tsx`). A 360° panorama keyed to camera bearing, with
  the Sierra Madre foothills east, Ortigas and Cubao south, and QC west. Shapes
  are schematic, directions are real. At night there are stars, lit windows
  and a blue dusk grade.
- **Paths are metres, not pixels.** Roads draw ≈6 m wide with a dashed centre
  line and footpaths ≈2 m, so they are ribbons at z22 instead of hairlines.
- **Standing flora** (`src/flora.tsx`). Cartoon trees and bushes on the same
  deterministic, vegetation-weighted scatter as before. Lawns and pitches get
  bushes only. Nothing is painted within 6 m of a find or the walker, and a tree
  in front of the walker goes see-through. Finds are drawn on the glass with
  the trees (`toScreenFind`) and painted in one depth order with them
  (`src/depth.ts`: further up the screen paints first), so a tree covers only
  the finds behind it, and goes see-through over one. Night recolours the
  trees in JS; there is no per-tree CSS filter.
- **Buildings default to `block`**: every building gets a low plinth of 3.2 m
  of wall. It reads as built without hiding the path behind it. `solid` still
  draws real heights.
- The stick walk now starts on the footpath by Schmitt Hall and the Zen Garden
  (`STICK_START`), not on the empty football field — each player on their own
  walkable spot 10–25 m around it, seeded by `player_id` (`spreadStartOf`), so a
  hall of phones does not pile onto one point. `?at=` still pins exactly.
  Switching to the stick from a GPS fix does the same around the fix
  (`stickSeedOf`), so two players standing together do not start stacked.
- Haptics are a no-op until the first tap or key on the page
  (`navigator.userActivation`, or a first-gesture flag), so a load no longer
  logs Chrome's blocked-vibrate error.

Projector parameters: `?boot=off` skips the boot, `?weather=storm|rain|heat|clear|night`
pins a reading (the card says it is pinned), `?time=day|night` pins the sky,
`?at=lat,lon` sets the stick start, and `?skyline=block|shadow|hollow|solid`
sets the building style. These (and `?bearing`, `?zoom`, `?seed`, `?sync`,
`?view`, `?probe`) survive every in-app route change: all navigation goes
through `navigateTo` in `src/nav.ts`.

## Two map views

- **Play** (default) — raked camera, sector fills on one green ramp, your
  character standing in it, ambient canopy and birds. Draws its own vector
  ground from `campus-shape.json`, so it needs **no tile server at all**. The
  camera sits at z22 (`PLAY_MAX_ZOOM` in `src/play-map.tsx`): a 390 px phone
  spans about 14 m, so one street fills the view and the walker reads at about
  human scale. Field keeps the basemap's own ceiling.
- **Field** — the same sectors over four real basemaps, with the path network,
  every layer control and every citation. The reference surface.

Two fingers (or shift-drag) swing the camera 360° sideways and tilt it
up and down; the compass returns north.
`?bearing=62` seeds an angle for a projector demo or a reproducible screenshot.

## Look and feel

The app wears **Magisphere's own look**, taken off the team's poster set
(2026-09-23): white panels on a neutral off-white ground, wood-plank signs for
quests and directions, sunny yellow for rewards, Fredoka for headlines. It
replaced the chess.com port (charcoal `#312E2B` / `#262421`, the inset green
button) on 09-23. The posters were the **reference**, not the source — nothing
from them ships 1:1.

**Flat, since 09-25** (Gelo's 09-25 note, 1:09–2:16: no "shadow-ish
neomorphism", neutral colour, simple and Pokémon-GO-like). Chrome carries at
most ONE small neutral drop shadow (`--mg-shadow`, `--mg-shadow-sm`,
`--mg-shadow-up` for bottom sheets); no inset highlights, text shadows or
gradients on panels and buttons. Anything you press gets its depth from a solid
darker bottom edge (`0 3px 0 <darker>`: the green button, the plank, the
joystick knob). The leaf hedge on the tab bar is gone. The colour lives in the
art, not the panels. The map's sky fade and the Settings hero scene are
illustration, not chrome, and keep their gradients.

- **`src/game.css`** — the `--mg-*` tokens and every `gm-` / `mg-` class.
  Components read these rather than inventing colours; inline styles use
  `rgb(var(--mg-ink-rgb) / a)` for ink at an alpha.
- **`src/hud.tsx`** — the play layer's chrome: player card (level, points,
  weekly streak), the daily hunt as a wood-plank tab, the plain white tab bar
  (Buddy · Nearby · Go · Dex · About) with the camera as a raised lagoon-ringed disc,
  reward toast, and the Dex field-guide cards. On the map the toast sits in a
  band under the player card and the hunt tab, and the live feed ("Ana logged
  Molave") stacks just below it, so neither is drawn across the walker or
  under the pet. The bar's five slots stay a
  560 px row centred on a desktop, so the gaps are even. **Go** is one tap from
  any screen: from the Dex or About it returns to the map *and* opens the log.
  The Dex grid draws the nine curated species (`dex_order`), the same set its
  "n / 9" counter counts.
- **Tapping a find** always answers (`src/pin-reply.ts`): in reach → the log
  opens; walk mode → "Walking to …"; GPS mode out of reach → a toast with the
  distance and compass direction, and the camera stays on the walker (it used
  to pan away to the find, which read as nothing happening).
- **`src/character.tsx`** — the walker. It draws the stage **sticker** (Seed →
  Sprout → Sapling → Tree, `STAGE_LABEL` in `src/stage.ts`; the one growth
  ladder, by areas of campus walked, that every screen names — `stageLine`) and keeps the billboard, contact shadow, bob and
  walking gait. Vigor greys the sticker; it never changes the stage. On the
  play map the gait is switched off by a timer once the fix stops moving
  (`walkStopMs`: 450 ms for the stick and demo, 2.5 s for GPS) — it used to wait
  for a render that never came, so the walker marched on the spot forever — and
  the lean into the heading eases over 260 ms (`.pm-walker` in `game.css`)
  instead of flipping up to 28° in a frame when you turn round.
- **`src/level.ts`** — trainer level is a way of *displaying* points, not a
  second score: level L starts at 50·L·(L−1) points. Nothing awards "XP".

**The asset kit.** Three production paths, one palette (sampled off the
posters; the list is in `script/magi-asset/build-vector.mjs`):

| Path | What | Where | Rebuild |
|---|---|---|---|
| Generated | Sprout buddy (sprout, cheer, map, sleep, trail), the explorer, the four growth stages | `src/asset/magi/sticker/` (1024 px masters), `src/asset/magi/web/` (400 px WebP the app ships) | `script/magi-asset/sticker.spec.json` via the codex skill's `imagen.mjs` |
| Drawn by code | Mark, wordmark (Fredoka outlines), lockups, app icon, scenes, wood sign, ornaments, the 12 vector game icons (brand/marketing; in-app only `buddy` and `pin`) | `public/brand/magi/*.svg`, `src/asset/magi/icon/*.svg` | `node script/magi-asset/build-vector.mjs` |
| Recoloured | The 10 chess.com-style game icons the app uses (dex, go, level, lock, nearby, plan, points, quest, streak, trophy), remapped into the brand palette | `src/asset/icon/game/*.png` (masters: `script/icon/game-source/`) | `node script/icon/recolor-game.mjs` |
| Rendered | PWA icons, PNG exports, posters, social, OG, banner, sticker and brand sheets | `public/brand/icon-*.png`, `../docs/brand/magisphere/` | `node script/magi-asset/render.mjs` (needs Chrome) |

Stickers are generated on a `#FF00FF` key and **remapped to the 17-colour
palette** with no dither, so they cannot drift off-brand; each one met its
contract (size, palette, ink share). The in-app game icons are the
chess.com-style set again (Gelo wanted those back, "in the new colour scheme"):
`script/icon/palette-remap.mjs` keeps each pixel's lightness and alpha, snaps
its hue towards the nearest brand colour (green → Leaf, yellow → Sun, orange →
Sparkle, cyan → Lagoon, blue → Blue, red → `--mg-red`) and pulls saturation
part-way to it; greys (the lock, the trophy base) are left alone. Tested in
`test/palette-remap.test.ts`. Fonts (OFL) are vendored in
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
Plant identification is iNaturalist's computer vision, not this app's. The
smoke-suite photos carry per-photo CC-BY / CC0 attribution in
`test/detect-smoke/manifest.json`.
