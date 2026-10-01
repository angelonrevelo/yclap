# Open asks — what only a person can close (2026-10-01)

Everything buildable is built on `reveal-1015`. These need someone's hands, a key, a signature or a date. Each has the exact step and how we know it is done.

## 1. Deploy (Gelo)

```bash
cd web-forest
npx wrangler login                       # once, in a browser
npx wrangler secret put SEEDS_TOKEN      # e.g. seeds-office:<32 random chars>  — give the token to SEEDS
npx wrangler secret put MOD_TOKEN        # e.g. gelo:<32 random chars>
npx wrangler secret put PLANTNET_API_KEY # when the key below exists
npm run build && npx wrangler deploy
```

Done when: `/health` answers 200 on the live URL, `/seeds` asks for a token, and a phone on the live URL sees another phone's walker.

## 2. Phone test (anyone with two phones, ~30 min, on campus)

**A preview is already up for this** (2026-10-01, `wrangler deploy --temporary`, build `fddb9a1`+route fix): https://yclap-field-guide.chocolate-coral-dd5.workers.dev — the same Worker, Durable Object and assets as production, on a temporary Cloudflare account. Its SEEDS console token was handed to Gelo directly (not in git). Claim it into the real account from the claim link wrangler printed, or just deploy for real (step 1). A temporary preview expires; don't hand it to students as the live link.

| # | Do | PASS iff |
|---|---|---|
| 1 | Open the live URL on a phone, allow location, walk 50 m outdoors | the walker turns and walks with you; the map never drops ground or the dock at the closest zoom while turning |
| 2 | Buddy → Wardrobe: wear a charm (or buy the scarf) | it appears on the walker on the map within a second; nothing else flashes on |
| 3 | Log any find | the walker cheers and the pet does its happy clip |
| 4 | Phone A: To do → Group walk → Start; phone B: type the code | both see "2 walking together · N m · together"; B's tag is gold on A's map |
| 5 | On `/seeds` (laptop): make a challenge at a site with a site code; show the code; on a phone at the site log a find and Claim with the code | "Verified +N"; the console shows it; the CSV export lists it |
| 6 | Same, from 200 m away | refused, "You are … m from …" |
| 7 | Settings → Graphics: auto on a cheap phone, walk 1 min | the badge says which tier and why; the walk stays smooth |
| 8 | Two phones walking side by side | the other walker stays beside you on screen (a step behind is the known 1.7 s smoothing) |

Note each failure in Settings → Report a problem (it attaches the build, frame rate and hall mode).

## 3. Pl@ntNet API key (Gelo)

Sign up at https://my.plantnet.org (free tier), create a key, set it as `PLANTNET_API_KEY` (step 1). Until then Identify sends people to Seek. Done when: a leaf photo in the camera sheet gets a species suggestion.

## 4. The DPO (draft email)

> Subject: Magisphere pilot — Child Privacy Impact Assessment for review
>
> Good day. Ahead of the Magisphere campus pilot with students (target: the week of 15 October), we have prepared a draft Child Privacy Impact Assessment and a 72-hour breach runbook, attached (`docs/spec/cpia-draft.md`, `docs/spec/breach-runbook.md`). The app shares a walker's live position only while the student opts in, withholds positions of threatened species, keeps photos on the phone, and has a moderator console with an append-only log. We would be grateful for your review and a decision on live-position sharing for minors before the pilot. — Gelo Revelo, Youth CLAP

Done when: the DPO has replied with a decision, recorded in `docs/spec/cpia-draft.md`.

## 5. SEEDS and AIS (draft request)

> Subject: Magisphere — what we need from SEEDS and AIS for the grand reveal
>
> 1. **An organiser for SEEDS challenges.** We will hand over a console token (`/seeds`); the organiser sets challenges for classes or orgs, shows a rotating site code at the place, and reviews flagged claims. Points from accepted claims export as CSV for grading.
> 2. **Two or three challenge sites** on campus with a person who can show the code there on the day.
> 3. **The official emergency plan** (assembly points, evacuation routes, first-aid and AED locations). OpenStreetMap has no assembly points for campus; the app says so rather than guess. With your list, the Emergency layer can show yours and route to them.
> 4. **The campus tree inventory** (positions and species), so trail stops and hunts point at surveyed trees instead of the app's demo points.
> 5. **Sign-off** on the three modules (biodiversity, emergency, trails) — each says "not official" until your office says otherwise.

Done when: each item has an owner and a date in ROADMAP "BLOCKED on partners".

## 6. Reveal date (Gelo)

About 15 October is assumed everywhere (`docs/showcase/reveal-plan.md`). Done when the date and venue are confirmed there.
