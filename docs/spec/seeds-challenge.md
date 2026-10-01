# SEEDS challenges — set by the office, judged by the server

For the AVP-SEEDS office, a teacher or an org to give students a field task on campus that counts toward something real (a class, a Youth CLAP badge), without trusting the phone. Research behind it: `docs/research/anticheat.md`.

## Turn it on

| Host | How |
|---|---|
| Cloudflare Worker | `wrangler secret put SEEDS_TOKEN` — 16+ characters, or `name:token,name:token` for several organisers (each name is written in the audit log) |
| LAN box | `SEEDS_TOKEN=... npm run sync` |

No token: `/seeds/api/*` answers 404 and `/seeds` says the console is off. Students never need anything.

## The organiser (`/seeds`)

1. Open `/seeds`, enter the token (kept for the tab only).
2. **New challenge**: title, brief, what it asks (*log one of these species* · *log any living thing* · *be at the place*), where (a named campus area, the pond, "right here", or anywhere), how close counts, how long it is open, points (≤ 200), a class code (blank = everyone), and two switches: **site code** and **photo required**.
3. At the place, **Show site code**: six big digits, a new code every 30 s, computed on the organiser's own device so it works with no signal.
4. **Needs a person**: claims the server would not wave through. Approve pays; Void is a strike.
5. **Export claims (CSV)** per challenge: name, signed in or not, status, points, species, time, who checked it.

## The student (To do → SEEDS challenges)

1. The challenge shows under **To do**; a class challenge only after entering its class code.
2. Log the find in the app (photo when asked), at the place.
3. **Claim**, type the site code on screen. The answer is one of:
   - **Verified +N** — counted, on the server's ledger (`verified pts`);
   - **Waiting for a person** — the server flagged it; the organiser decides;
   - **Refused, with why** — not open, not GPS, too far, wrong species, no photo, wrong or old code. Fix and retry.

## What it checks, in order

Refusals (the student can fix): window open · real GPS (no stick, no demo) · inside the site radius + the fix's accuracy · right species · photo · site code (this step or the last). Then review flags (a person decides): accuracy worse than 50 m · faster than 15 km/h between recent fixes · more than 150 m from the last claim faster than walking · a position that never jitters · 2+ voided claims. One claim per walker per challenge, and per account when signed in. Server time on every claim.

## Limits, honestly

- A browser cannot detect a mocked location. The site code (good for about a minute) and review flags are what stand in for that.
- A student at the site can read the code to a friend at the site. That friend is also at the site, which is the point.
- Without sign-in, a determined student could claim twice under two walker ids. Signed-in claims are one per account; a class that grades on it should ask students to sign in.
- The rest of the game (points, hunt, objectives) is still scored on the phone. SEEDS points are the number to grade on.

## API

`GET /quest?player_id=&class=` · `POST /quest/claim` · `GET /seeds/api/state` · `POST /seeds/api/action {create|close|approve|void}` — see `web-forest/worker/quest.ts`. Tests: `test/quest.test.ts`.
