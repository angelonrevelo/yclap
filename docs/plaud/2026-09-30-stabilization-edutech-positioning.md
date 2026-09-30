# Plaud brief — 09-30 Magisphere Stabilization Roadmap and Edutech Positioning

2026-09-30 · 6:21 · 1 speaker (Gelo). A solo voice note four days after the 26 September PNU showcase ("the White Clap event" is ASR for **YCLAP**, `0:00`). Nobody else is in the room, so nothing below is a group decision. It is Gelo's post-mortem of the showcase build and his brief for the grand reveal.

**Source:** `pub_1f74f129-0340-4b47-b283-e4b44b26d79b` · https://web.plaud.ai/s/pub_1f74f129-0340-4b47-b283-e4b44b26d79b

**Cached at:** `~/.piper/plaud/pub_1f74f129-0340-4b47-b283-e4b44b26d79b/note.md`

The note has two halves. The first three minutes are defects seen when ConCom tested the showcase build together: multiplayer that jitters, an avatar whose limbs are not connected, and lag on cheap laptops and phone browsers. The last three are about positioning. It should be *usable* and *maintained*, not "a Roblox game look-alike" or "a childish game". It needs branding, a roadmap, KPIs and a reporting system, and it should take up the judges' other uses: DRR, hazards, emergency areas, hiking trails and biodiversity areas. It ends where it began: *"Fix the bugs, fix the assets"* (`5:42`).

## Ask

### Firm

| # | Ask | Cited | Repo (at `demo-0926-int`, 05a8f8b, the integrated showcase build) |
|---|-----|-------|------|
| A1 | **Improve it for the student population**; the showcase build "was heavily rushed" | `0:16` | unmappable on its own; A2–A12 are the specifics |
| A2 | **Fix the stuttering bugs**, seen by ConCom testing together | `0:29`–`0:35` | **partial**: `frame-probe.tsx` / `frame-stat.ts` measure frames; no committed frame benchmark or budget. → lane `reveal/perf` |
| A3 | **Multiplayer works but is very buggy**: standing still is fine, but *"every time we move or pitch or yaw, each person would move weirdly across the screen … jitter"* while staying in the same area | `0:45`–`1:21` | **fixed on `reveal-1015`** (67f856b). Root cause in `multiplayer.ts`: an ease-out glide per pose (2× walking speed, then a brake, once a second), glide length taken from network arrival (jitter became speed), and a 3 m send threshold (stop-go cadence). Now buffered snapshot interpolation on the sender's clock, 1.7 s behind, linear. `multiplayer.test.ts` "09-30 jitter" pins it. Not yet proven on two physical phones |
| A4 | **Improve the 3D avatars and animations**: the main character's *"limbs are not connected"* | `1:25`–`1:41` | **partial**: no human avatar exists on any branch. The map walker is a flat stage sticker (`character.tsx`), and the 3D buddy and the fauna are procedural blob models (`script/species-model/kit.mjs`) whose parts swing on their own pivots. → lane `reveal/rig` finds which one and adds a connectivity audit |
| A5 | **Low-end devices**: a cheap Windows laptop or a phone browser is *"very jittery and laggy"*; *"it might be rendering too much"* | `1:56`–`2:34` | **partial**: one measured win on record (SVG animations off, ~20→64 fps throttled). No device profile, no quality tier. → lane `reveal/perf` |
| A6 | **Not a Roblox look-alike, not a "childish game"**: something usable by the general populace, fun, distributed to students | `2:37`–`2:59` | **partial**: the Settings page already frames purpose and the offices asked (`settings-content.ts`), but the product leads with game chrome. Positioning: `docs/showcase/reveal-plan.md` § Positioning |
| A7 | **Maintained properly** past a student's first use | `3:13` | **absent**: no maintenance plan, no owner rota, no retention measure |
| A8 | **Proper branding material** | `3:20`–`3:24` | **partial**: `docs/brand/magisphere/` (mark, lockups, posters, OG, sticker sheets). Memory: Aleij owns design; the kit is for in-app use, not the printed pubmats |
| A9 | **A roadmap and the right KPIs** | `3:26` | **partial**: `ROADMAP.md` exists; no KPI framework. → `docs/showcase/reveal-plan.md` § KPI |
| A10 | **Everything accounted for: performance, bugs, the reporting system** | `3:39`–`3:43` | **absent**: no in-app bug report, no moderation. → lane `reveal/mod` |
| A11 | **The naturalist implementation** (almost certainly iNaturalist) | `3:50` | **partial**: `inat.ts`, the identify proxy, Seek links; the token is still a build-time secret |
| A12 | **The judges' comments**: use it for **hazards / DRR**, **hiking trails**, **emergency areas in school**, **areas with biodiversity** | `3:55`–`4:46` | **absent** as modules. The engines exist (sectors, footpath routing `route.ts`, measured vegetation). → lane `reveal/module` |
| A13 | **Be clear on what funding would be spent on**: fix the bugs, fix the assets, make the modelled assets work, no disconnected limbs | `5:31`–`5:51` | **absent**. → `docs/showcase/reveal-plan.md` § Funding |

### Musing (do not promote)

| # | Musing | Cited |
|---|--------|-------|
| M1 | Hiking trails as *"something Pokémon Go has not yet tackled. Hopefully"*. A positioning hunch, not checked | `5:06`–`5:16` |
| M2 | *"We might be able to get funding"*. No funder, amount or date is named | `5:31` |
| M3 | *"Or we actually make a real human being with this scale"*. An alternative to fixing the current avatar, not a decision | `5:51` |

## Decision

| # | Decision | Cited |
|---|----------|-------|
| D1 | **Fix before adding**: funding, if it comes, goes first to *"fix the bugs, fix the assets"* | `5:35`–`5:46` |
| D2 | **The 3D approach stays.** The judges *"said that the 3D implementation was good"* | `4:05` |
| D3 | It is **still alpha** and the roadmap is *"very ambitious"*. Nobody should present it as finished | `5:17`–`5:22` |

## Open question

| # | Question | Cited |
|---|----------|-------|
| Q1 | Which avatar has the disconnected limbs? "The main character or the guy". No human figure exists on any branch (checked 2026-10-01), so this is the 3D buddy, a fauna model, the eagle, or a build we do not have | `1:35` |
| Q2 | Which build did ConCom test? The live URL still serves a bundle **without** the hall (`/live/` absent from `index-aqvhoEKX.js`, fetched 2026-10-01), so the multiplayer seen was the LAN handset build or a local one | `0:35` |
| Q3 | Which DRR / emergency data counts as official, and who at the university signs off (DRRM office, CFMO)? | `4:13`, `4:27` |
| Q4 | Which campus or trail is the second deployment? "Their campus" is plural and unnamed | `4:53` |
| Q5 | Who is the funder, what is the amount, and what are the reporting obligations? | `5:31` |
| Q6 | Who maintains it after the reveal, and for how long? | `3:13` |

## Person

Speaker: Gelo (solo note, diarization trivially right).
Mentioned: **ConCom** (the group that tested the build together, `0:35`). **The judges** (unnamed, `3:55`). Nothing is assigned to anyone by name.

## Repo check

`yclap @ demo-0926-int` (05a8f8b; all 25 lane/fix branches merged) · exists 0 · partial 8 · absent 4 · unmappable 1. A3 has since been fixed on `reveal-1015`.

**Reverse flags: the note assumes things the repo contradicts.**

- **The live deploy is stale.** `https://yclap-field-guide.marangelonrevelo.workers.dev` serves a bundle with no `/live/` hall, pet eagle, accounts or route planning. `demo-0926-int` (09-26 05:52) was never deployed. Anyone judging the product from the public link today is judging the 09-22 build.
- **`demo-0926` (the branch the main checkout sits on) is 69 commits behind `demo-0926-int`.** Its uncommitted PC work (toon look, spawn density 0.34→0.62, play zoom 20, an HTML splash) is saved as `wip/pc-demo-0926` and has not been folded into the integrated build.

## Flags

- `[AI note]` invents a staff structure (Engineering Lead, QA Lead, Art/Content Lead, Product Manager, Brand/Comms Lead, Finance/Operations) and assigns every action item to it. None of these roles is spoken, and this is a student team. Do not read them as assignments.
- `[AI note]` says "We own the miss on performance and product discipline" and describes a "Stabilize → Instrument → Deploy" system. Neither is in the transcript. The spoken version is `5:42`: *"Fix the bugs, fix the assets."*
- `[AI note]` narrows the judges' use cases to **three** modules (DRR, emergency routes, biodiversity). The transcript names four, and **hiking trails** gets the most airtime (`4:22`, `5:06`, `5:11`). The AI note drops it.
- `[AI note]` diagnoses root causes ("invalid skeleton hierarchy/weights", "no LODs", "inconsistent tick rates"). Those are generic game-engine guesses. This app has no skeletal rig and no tick. The real causes are in the A3/A4 rows above.

## Where the work lives

Roadmap: [`../../ROADMAP.md`](../../ROADMAP.md) § *2026-10-01 — Grand reveal*. Lanes: `reveal/rig`, `reveal/perf`, `reveal/mod`, `reveal/module`, integrated on `reveal-1015`.
