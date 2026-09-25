# Plaud brief — 09-25 Meeting: MagiSphere Demo Readiness & Backend

2026-09-25 · 4:55 · 1 speaker (Gelo). A solo voice note the day before the showcase, not a meeting — there is nobody in the room to agree or object, so nothing below is a group decision. Gelo is the team lead and the developer of record.

**Source:** `pub_f4b8ba6d-d71f-4c6d-922c-44faa1b65bf2` · https://web.plaud.ai/s/pub_f4b8ba6d-d71f-4c6d-922c-44faa1b65bf2

**Cached at:** `~/.piper/plaud/pub_f4b8ba6d-d71f-4c6d-922c-44faa1b65bf2/note.md`

The note is a wish list for Saturday 26 September: a full cross-device demo that event participants can actually play, with real accounts, a real database, the pet eagle, a Pokémon GO feel instead of the current look, final 3D models and a working iNaturalist key, and a smoke test for the plant detection. It ends on the one line that governs the rest: *"finalized, fleshed out, working multiplayer and working database"* (`4:41`).

## Ask

### Firm

| # | Ask | Cited | Repo (at `demo-0926`, before the 09-25 push) |
|---|-----|-------|------|
| A1 | **Full demo between devices**; participants at the event actually play and **interact with the surroundings** | `0:00` | **partial**: two phones already share one world over the Durable Object (`worker/sync.ts`, `campus-world.ts`) and a six-character walker code joins them as one player. The venue has no campus trees, so "surroundings" is the thumbstick walk over the campus map (`joystick.tsx`), not the hall itself |
| A2 | **Own database**, playable | `0:35`, `4:41` | **partial**: the DO has SQLite-backed storage (`wrangler.jsonc` `new_sqlite_classes`) holding the shared world. There is no account table |
| A3 | **Accounts with passwords** | `0:35` | **absent**: Settings says it outright: *"No password, no Ateneo sign-in"* (`settings.tsx`). Identity is the walker code, which the app warns is *"Not a password — anybody with it becomes you"* |
| A4 | **Google OAuth** | `0:35` | **absent**. Needs a Google Cloud OAuth client ID and secret that only the team can create |
| A5 | **All the features each member wants**, e.g. the **pet eagle as a companion** | `0:35` | **absent**: the only companion is the Sprout buddy / stage character (`character.tsx`, `gamify.ts` Buddy). No eagle exists in the app |
| A6 | The eagle is **also a sleep pet** | `1:09` | **absent**. "Sleep pet" is never defined on the recording (see Q2). A Sprout *sleep* sticker exists in the asset kit (`src/asset/magi/`), unused as a mechanic |
| A7 | **Refine the icons**: keep the old Chess.com-like icons but in the **new colour scheme** | `1:09` | **partial**: the 09-23 look replaced the chess.com port with the vector sticker icon set (`src/asset/magi/icon/`). Whether that answers "keep the old ones, recoloured" is Gelo's call |
| A8 | **Drop the shadow-ish neomorphism**; it does not fit the Pokémon GO vibe | `1:09` | **partial**: the sticker cards carry a soft forest shadow (`--mg-shadow-sm` in `game.css`). Not neomorphism in the strict sense, but it is the shadow Gelo is naming |
| A9 | **Very neutral colour** rather than super detailed | `1:39` | **partial**: sky + mint paper palette from the posters; judged by eye, no spec |
| A10 | **Pokémon GO look**: 3D-ish, simple, modern, not heavy on shadow; *"cartoony realistic"* | `1:50` | **partial**: same as A8–A9. There is no measurable target, see Q3 |
| A11 | **Playable by tomorrow, or by 3 a.m.**, and **everything fully refined** | `2:21` | the deadline itself |
| A12 | **Refine the 3D models (GLBs) and the locations** | `2:21` | **partial**: 1,098 species models ship (`public/model/`); five review sheets in the repo root (`lane1.tsv`–`lane5.tsv`) FLAG a large share of them as wrong shape or wrong organism. Locations stay curated / demo placements until the AIS inventory (ROADMAP BLOCKED) |
| A13 | **iNaturalist API key final and working** | `2:21` | **partial**: the score-image path exists (`inat.ts`, `VITE_INAT_API_TOKEN`). With no token the camera replays a recorded Narra response and labels it as recorded. The token is a secret the team must supply at build time |
| A14 | A **smoke test suite for the detection**: test on in-app pictures and check we match the plant we meant to match | `2:52` | **partial**: `test/inat.test.ts` replays a recorded `score_image` fixture. No suite runs real in-app photos through the live model |
| A15 | **UX and playability to Pokémon GO standard**: **big roads**, **very zoomed-in characters**, a **natural, playable tilt axis** | `3:36` | **partial**: z22 street camera, locked banded zoom, continuous zoom + pinch, raked play plane all shipped (ROADMAP IN PROGRESS). Roads are drawn at map width, not GO width |
| A16 | **Reduce the jitter**; acknowledged harder for a web app | `4:03` | **partial**: continuous zoom eases toward a goal; the walker and camera still step on each fix. No frame-time measurement exists to say how jittery |
| A17 | **Working multiplayer and working database**, finalised | `4:41` | **partial**: A1 + A2 |

### Musing (do not promote)

| # | Musing | Cited |
|---|--------|-------|
| M1 | *"Aura-based game."* Three words, then *"basically"* and the thought stops. There is no mechanic on the recording to build | `4:26`–`4:33` |

## Decision

| # | Decision | Cited |
|---|----------|-------|
| D1 | **Hosting is open to Gelo's VPS or a hosted database**: *"You can use my VPS by Jelly or Neon Database, etc."* A permission, not a choice between them | `4:41` |
| D2 | **Look direction**: Pokémon GO's 3D-ish, simple, modern, cartoony-realistic; *not* shadow-ish neomorphism | `1:09`, `1:50` |
| D3 | **Icons**: reuse the old Chess.com-like set, recoloured, rather than drawing new ones | `1:09` |

## Open question

| # | Question | Cited |
|---|----------|-------|
| Q1 | Is the deadline Saturday morning or *"later three a.m."*, and what gets cut first if not everything lands? Nothing is prioritised on the recording | `2:21` |
| Q2 | What is a **sleep pet**? Idle state, a rest-day mechanic that protects a streak, or just the art? Undefined | `1:09` |
| Q3 | What counts as "Pokémon GO standard": a frame-rate target, road width, zoom level? No metric is stated | `3:36`, `4:03` |
| Q4 | **Which database**: the existing Durable Object SQLite, Neon (Postgres), or the VPS? And where do OAuth secrets live? | `4:41` |
| Q5 | Do accounts **replace** the walker code or sit on top of it, and what happens to journals already stored on phones? | `0:35` |
| Q6 | Is the eagle one companion for everyone, or does it replace the Sprout buddy and its four stages? | `0:35` |
| Q7 | Who owns which ask? The note names no one but Gelo | whole note |
| Q8 | "At the Neo" at `2:21` is probably ASR for a place ("the Ateneo" / a venue); the locations meant are unclear | `2:21` |

## Person

**Speaker:** Gelo (team lead, developer). Solo recording, so diarization is not an issue.

**Mentioned:** Jelly (as Gelo's VPS; the name may be garbled ASR) · Neon Database · Google (OAuth) · iNaturalist · Pokémon GO · Chess.com.

**Point persons:** none assigned on the recording. "Each of us" (`0:35`) implies the team, but nobody is named.

## Repo check

`yclap` @ `demo-0926` (`6b34c70`) · **exists 0 · partial 12 · absent 4 · unmappable 0** (A11 is the deadline, not a feature, and is not counted).

**Already built, treated as unbuilt:** cross-device shared world (A1, A17), a SQLite-backed store (A2), the recorded-fallback iNat path (A13), street-level camera and pinch zoom (A15).

**Needs something only the humans have:** the Google OAuth client (A4), the iNaturalist API token (A13), VPS / Neon credentials if the database moves (D1).

Roadmap rows for this push are owned by the merge step in [`../../ROADMAP.md`](../../ROADMAP.md); this brief does not edit it.

## Flags

- **One speaker, no room.** Every "decision" above is Gelo's stated preference. None was agreed by the group on this recording.
- **`[AI note]` "Host backend on Gelo's VPS (e.g., Jelly or Neon Database)"** makes Neon sound like a VPS. The transcript (`4:41`) lists them as alternatives: VPS *or* Neon *or* something else.
- **`[AI note]` "AI Suggestions" 1–4** (timeline unrealistic, no owners, "Pokémon GO standard" undefined, eagle unspecified) are Plaud's commentary, not Gelo's. They match Q1, Q7, Q3 and Q2/Q6 here, but they were not said.
- **`[AI note]` "Enable real-world interaction mechanics"** turns `0:00` *"interact with the surroundings"* into a feature. At a hall with no campus trees the honest reading is the stick walk over the campus map. Do not promise AR or venue-aware spawns.
- **`[AI note]` "larger roads, more zoom on characters"** is a fair paraphrase of `3:36`. It is still a comparison to Pokémon GO, not a spec.
- **Honesty rules still apply to anything built from this note.** Accounts must not be presented as Ateneo sign-in. A detection smoke test can only report what iNaturalist returned, never that Magisphere identified a plant. Demo placements stay labelled as demo.

## Follow-on

Demo cue card for Saturday: [`../showcase/demo-script-0926.md`](../showcase/demo-script-0926.md). Feature list at a glance: [`../showcase/feature-list.md`](../showcase/feature-list.md).
