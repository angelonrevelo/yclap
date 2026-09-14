# Plaud brief — 09-09 Meeting: YCLAP Biodiversity Web — Gamified Map, Pitch, and Showcase Prep

2026-09-09 · 2:18:22 · 6 diarized labels (Speaker 1–3, Gelo, Speaker 5–6). **Diarization suspect** — Plaud names only Gelo; the rest are generic. Speaker 3 is mostly noise / garbage ASR (Navier–Stokes, “I love you”, letter J). Names below are inferred from the room, not from Plaud’s speaker field.

**Source:** `pub_d7d8f13a-9956-4ee4-bdc6-5b0e7f0f2898` · https://web.plaud.ai/s/pub_d7d8f13a-9956-4ee4-bdc6-5b0e7f0f2898

**Cached at:** `~/.piper/plaud/pub_d7d8f13a-9956-4ee4-bdc6-5b0e7f0f2898/note.md`

Inferred labels from the transcript: **Speaker 1 = Ma'am / office of AVP** (offered AIS + CFMO access; Jeep-tracker privacy caution), **Speaker 2 = Ivan** (agenda + pitch slides), **Speaker 3 = noisy**, **Gelo = developer** (live Magisphere demo), **Speaker 5 = Kat / Cathy-ish** (called “Kat” at `1:50:42`), **Speaker 6 = Alethea / Sophie** (presented the Working Doc; called “Sophie” at `1:37:27`, `1:44:41`).

The meeting that **locked the play layer on the record**: omit “round opens”; keep one open-world map; split engagement into discovery (explore) and challenge (find / track); journal stays; showcase stays public. Pitch advice (less words, more photos) and partner-access offers (AIS / CFMO via AVP) run in parallel and must not be quoted as product asks.

## Ask

### Firm

| # | Ask | Cited | Repo |
|---|-----|-------|------|
| A1 | Make the site **more Pokémon GO** — pictures + branding, not a bare prototype | `11:04` Gelo | **partial** — play map exists (`web-forest/src/play-map.tsx`); Home is still the essay hero (“Two-thirds of this campus is green…”) |
| A2 | **Leaderboard for freshies**, journal as Pokédex, **challenges per day** | `13:03`, `13:57` Gelo | **partial** — local demo board + basic “discover 2 / explore 2” challenges shipped; not a daily hunt |
| A3 | Refine **usability / multiplayer** by Friday | `15:16` Gelo | **partial** — deployed + on-device cohort; no real multiplayer |
| A4 | Award **walk-steps** like Pokémon GO | `21:31` Speaker 1 | **absent** — triage only. `docs/roadmap-rejected.md` already rejects fabricated steps / calories. Do not invent a number the device does not measure |
| A5 | **Ateneo.edu login** so outsiders cannot read prohibited ground | `27:05` Speaker 1 | **absent**, blocked on DATES (`27:46`). Showcase stays public (`28:33`) |
| A6 | Unauthorized areas **gray / black, not obvious** as “do not pass” | `29:18` Speaker 1 | **partial** — restricted hatch exists (`campus-map.tsx`, `play-map.tsx`); still reads as a labelled off-limits overlay |
| A7 | **Less words, more photos** — pitch *and* product | `33:39` Speaker 1 | **partial** — Home / Journal still copy-heavy; pitch deck is outside this repo |
| A8 | Leaderboard to **ignite competition** (commitment, not AIS rank) | `1:30:04` Sophie / Speaker 6 (nearby `1:30:01` is Speaker 1 on AIS snapshot data) | **partial** — local / demo board only; never official AIS ranks |
| A9 | **Weekly streak** on Journal progress | `1:34:05` Sophie | **exists** — `web-forest/src/gamify.ts` week participation, surfaced on Home + Journal |
| A10 | **Group streak** (Ivan’s poll; friends, not solo) | `1:34:05` Sophie citing Ivan | **absent** |
| A11 | Purely **discovery + a daily task per person** (one species / biome hint) | `1:52:14` Gelo | **absent** at time of this brief (code may land the same session). Basic challenges are not a named daily hunt |
| A12 | **Top three species per area** only | `1:56:55` Sophie + `1:57:12` Gelo | **partial** — spawn already `per_sector_max: 3` (`spawn.ts`); UI does not feature that as a rule |
| A13 | **Omit rounds.** Discovery = explore; challenge = find / track; **same map**; trees-only for challenges | `2:04:51` Sophie FINAL (`2:04:15`–`2:04:17` trees-only) | **partial** — one map already; rounds never shipped; no distinct find/track challenge mode; trees-only not enforced |
| A14 | **Anti-spam the same tree** — no points for repeating the same submission | `2:06:32` Kat | **partial** — award key is `sighting:${code}/${sighting_id}` (`app.tsx`), so a new sighting of the same tree still pays |
| A15 | **Challenge should weigh more** than discovery | `2:08:33` Kat | **partial** — `POINT_VALUE.challenge` (40) > `observe` (25) already in `gamify.ts`; Home HUD still lists Explore / Learn / Observe / Verified only, and `parseEvents` drops `challenge` |

### Musing (do not promote)

| # | Musing | Cited |
|---|--------|-------|
| M1 | Fitness / IG walk posts as a health-university hook | `21:50` Ivan |
| M2 | Host Magisphere on the AIS website | `19:47` Speaker 1 |
| M3 | Biweekly “major” events instead of a daily round (superseded by D1) | `1:48:50` Ivan |
| M4 | Steps as a consolation badge when the daily tree is missed | `2:06:15` Sophie |
| M5 | Character levels via streak buddy rather than a separate XP ladder | `1:28:17` Sophie |

## Decision

| # | Decision | Cited |
|---|----------|-------|
| D1 | **Omit “round opens.”** No daily gate that unlocks a timed spawn window | `2:04:51` Sophie FINAL |
| D2 | **Same map** for discovery and challenges — not a second world | `1:55:22` Kat, `1:55:44` Sophie, `2:04:51` |
| D3 | **Open world always on** for Ateneo | `1:43:56` Gelo |
| D4 | Algorithm **prefers under-explored areas** / under-pictured species | `1:43:56` Gelo |
| D5 | **Showcase remains publicly accessible.** Ateneo.edu login is a future / admin idea, not the Saturday constraint | `28:33` Speaker 1, `29:07` Sophie |
| D6 | **Planting as the SITE claim stays rejected.** Speaker 1 asked to include **native-tree increase in PITCH OBJECTIVES only** — awareness + engage + a plan path, not a canopy promise the PWA makes | `1:24:08` Speaker 1; site copy already: “Not a planting drive” |
| D7 | Challenges are **trees-only** for now; discovery can stay broader later | `2:04:15`–`2:04:17` |
| D8 | When a walker enters an area, show **top three** species, not the whole list | `1:56:55`, `1:57:12` |

## Open question

| # | Question | Cited |
|---|----------|-------|
| Q1 | iNaturalist vs **human reviewer** for validation — and whether that updates any AIS dataset | `1:39:16`, `2:05:45` |
| Q2 | Do steps count toward points, or stay a badge? Room circled back; not a ship number | `2:09:23` Sophie |
| Q3 | How points, badges, and the leaderboard **correlate** — “we don’t know what’s correlated yet” | `2:11:09` Kat |
| Q4 | Daily task personalized per person / location, or the same hunt for everyone | `1:52:14` Gelo |
| Q5 | How AIS tracks a tree so the same trunk cannot be resubmitted | `2:06:45`–`2:07:47` |
| Q6 | Who presents Saturday (poll / last two members) | outline `1:18:31`; not settled on the recording |
| Q7 | Baseline M&E survey — who, when, which questions | `41:59` Speaker 1; no owner in-room |

## Person

**Speaker:** Speaker 1 (Ma'am / AVP office) · Speaker 2 (Ivan) · Speaker 3 (noisy) · Gelo (developer) · Speaker 5 (Kat / Cathy-ish) · Speaker 6 (Alethea / Sophie). **Diarization suspect.**

**Point persons / offers:** **Speaker 1** → AIS director + CFMO via the AVP office (`17:45`); DATES if Ateneo.edu login is ever built (`27:46`). **Ivan** → compile the office-data list + finish the pitch this week (`2:16:28`). **Gelo** → website / play layer. **Sophie** → Working Doc mechanics.

**Mentioned:** Dr. Leland (EVP) · Dr. Eman (AIS director) · Mam Chen · Miss Shaina · Cesar (UP, species fun-fact) · Ateneo Wild · Biology department · BBCS / CCSMO / CSMO · Zikif Bergado (jeep tracker) · CCC climate-resilience copy.

## Repo check

`yclap` @ current worktree · **exists 1 · partial 10 · absent 4 · unmappable 0** (A9 weekly streak is the only clean exists; A15 values are coded but not a shipped Hunt loop, so they stay in partial.)

**Already built, treated as unbuilt in the room:** play / GO map, local demo leaderboard, journal / collection, weekly streak, restricted hatch, biome sectors, `per_sector_max: 3`, `POINT_VALUE.challenge > observe`.

**Reverse of the 08-26 / 08-29 no-ranking invariant:** Sophie is now *asking* for a leaderboard to ignite competition (`1:30:04`). That lifts the *local demo board* only — see [`../roadmap-rejected.md`](../roadmap-rejected.md). Official AIS ranks stay rejected.

Roadmap rows for Saturday: [`../../ROADMAP.md`](../../ROADMAP.md) § 2026-09-12 — 09-09 Plaud play layer.

## Flags

- **Diarization is suspect** and Speaker 3’s later segments are not evidence. Do not assign asks to Speaker 3.
- **`[AI note]` is not an ask.** Plaud’s note promotes character leveling, a wordy Home (“Why Trees Matter”, oxygen snapshot), Ateneo.edu login as a to-do, and “finalize the leaderboard.” The transcript either defers those (login = future; showcase public) or contradicts them (Sophie FINAL omits rounds; Gelo already had a demo board). Labelled `[AI note]` only.
- **`[AI note]` “Susunod na Mga Ayos”** lists Ateneo.edu-only login and “finalize leaderboard / badges / points” as action items. Those are Plaud synthesis. The spoken constraint is D5 (public showcase) and A15 / Q3 (points still circling back).
- **Walk-steps (`21:31`) collide with an existing rejection.** Keep as triage. Same class as the Whistler steps / calories row — we measure none of them.
- **Planting / canopy increase** is a *pitch-objective* request from Speaker 1, not a product claim. The site must keep “Not a planting drive.”
- The app was **already deployed** when Gelo demoed (`15:16`); Saturday work is refinement, not a first ship.

## Follow-on

Saturday play-layer behaviors (GO Home HUD, daily hunt, anti-spam key, challenge weight, quiet restricted, group streak): [`../../ROADMAP.md`](../../ROADMAP.md) § 2026-09-12.
