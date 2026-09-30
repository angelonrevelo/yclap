# Moderation, reporting and authority — spec

Status: built on `reveal/mod` (2026-10-01) for the grand reveal (~2026-10-15),
where students and institution staff use the live hall together.

Sources: Gelo's 09-30 note `3:39`–`3:50` ("making sure that everything is
accounted for, from the performance to the bugs to the reporting system"; a
bug-report workflow tagged stutter / desync / rig errors) and the owner's ask
for authority and moderation: the hall prints display names and "Ana logged
Molave" on every phone, and until this branch nobody could take either down.

Code: rules `web-forest/src/moderation.ts`, `web-forest/src/name-filter.ts`;
store and routes `web-forest/worker/moderation.ts` (Durable Object SQLite in
production, node:sqlite on the LAN box); enforcement in
`web-forest/worker/live-socket.ts` and `web-forest/server/hall.mjs`; phone side
`web-forest/src/report.ts`, `report-sheet.tsx`, `mute.ts`, `remote-walker.tsx`;
console `web-forest/src/mod-console.tsx` at `/mod`. Tests
`web-forest/test/moderation.test.ts`, `web-forest/test/name-filter.test.ts`.

## The promise this has to keep

"Photos and notes never leave this phone." Moderation adds data, so it adds as
little as possible, and says so on screen:

- A report carries a category, a severity, up to 1,000 characters, and
  diagnostics (build id, browser string, viewport, frame rate, hall mode, which
  source drives the walker — GPS / demo / stick). No position unless the
  reporter ticks the box; then rounded to 4 dp (~11 m) and dropped if off
  campus. The form lists exactly this under "What gets sent with it".
- No reporter identity at all: no `player_id`, no account, no IP address
  stored. The per-IP rate limit lives in memory and is forgotten on restart.
- The hall's `walker_id` (a one-way hash of the `player_id`) is the only id a
  name report or the console ever carries. `sanitizeReport` copies only fields
  it names, so a `player_id` sent by a modified client is dropped, not stored;
  the console re-keys shared finds by `walker_id` before they leave the server.
  Tests assert the `player_id` string never appears in a stored report or a
  console payload.

## Roles

| Role | Who | Can see | Can do |
|---|---|---|---|
| **Student** (every phone) | anyone playing | other walkers' display name, level, stage and campus position; shared finds ("Ana logged Molave") | report a problem (Settings → Setup, or the buddy sheet on the play view); tap a walker's name tag to **Hide this walker** (on this phone only, localStorage) or **Report name**; show hidden walkers again (Settings → Setup) |
| **Moderator** | whoever holds `MOD_TOKEN` — for the reveal, the team member on duty at the booth | at `/mod`: every report (text + diagnostics), walkers in the hall now (display name, level, `walker_id`), shared finds of the last six hours (display name, species, time, `sighting_id`, `walker_id`), hidden walkers, hidden finds, the audit log | hide a walker from the hall for 1–168 hours (and unhide); hide a shared find (and unhide); resolve / reopen a report |
| **Institution admin** | the office that owns the pilot (to be named — see *Not built*) | nothing in-app yet | holds the `MOD_TOKEN` secret and rotates it (`wrangler secret put MOD_TOKEN`); reads the audit log with a moderator; receives escalations |

What nobody can see, moderators included: a student's journal, photos, notes,
`player_id`, account username or password, IP address, or position (except a
position the reporter chose to attach to one report).

## What each action does

- **Hide walker** (`hide_walker`, `walker_id`, hours): written to `hall_hide`
  and held in memory; enforced on BOTH hall servers (`LiveHall` in the Durable
  Object, `createHall` on the LAN box). The walker is dropped from the roster
  at once and every other phone gets `gone`; their socket poses reach nobody
  and a polled pose is answered 403; their shared finds are not called out and
  are filtered from `/world` and the leaderboard roster while the hide lasts.
  Their own phone alone receives a `notice` ("hidden from the live hall until
  HH:MM (Manila)") once. They can still play solo. Lifts by itself on time.
- **Hide find** (`hide_find`, `sighting_id`): filtered out of `/world`, the SSE
  feed and the hall's find callouts. Not deleted — `unhide_find` restores it.
- **Resolve / reopen report**: status and `resolved_at` only.
- Every action writes one row to `mod_audit` (when, action, target, a short
  detail such as "24 h · Molave Walker 8"). The table is append-only twice
  over: the service has no update or delete path, and SQLite triggers abort
  any UPDATE or DELETE on it. A failed action writes nothing.

## The name filter

Server-side, wherever a name enters the shared world: a hall pose, a `/sync`
player (the name in "… logged Molave" and on the leaderboard), an account's
display name at signup and on Google sign-in. English and Filipino profanity,
slurs, and names posing as a moderator or admin. It normalises Unicode
look-alikes, accents, zero-width characters, leetspeak (two readings), stretched
letters, `*` wildcards and letter-by-letter spacing before matching, and it
matches by whole word / prefix / anywhere per entry so that Putatan, Batangas,
Assumption, Scunthorpe, petite, kantutay (a campus shrub) and Dick Gordon pass.
A refused name is printed as the phone's generated walker name ("Molave Walker
12" — the same function mints it), and that phone alone is told why. Ordinary
identity words (bakla, bayot) are deliberately not blocked.

Known residue: a word split into multi-letter halves that are only short exact
entries ("pu ta"), and new coinages. That is what **Report name** is for.

## Endpoints and limits

| Route | Auth | Limits |
|---|---|---|
| `POST /report` | none (anonymous); own page only (Origin / Sec-Fetch-Site, as `/live/pose`) | body ≤ 8 KB (413); 10 reports / IP / hour on the LAN box, 60 on the Worker (a booth shares one public IP); counted only once well-formed; 503 past 2,000 open reports |
| `GET /mod/api/state` | `Authorization: Bearer <MOD_TOKEN>` | no CORS; 10 wrong tokens / IP / 15 min, then 429 for everyone on that IP |
| `POST /mod/api/action` | same | JSON only; body read to 4 KB |

`MOD_TOKEN` unset or shorter than 16 characters: `/mod/api/*` answers 404 "the
console is off". There is no default password. Compare is constant-time over
SHA-256 digests. The console keeps the token in sessionStorage (gone when the
tab closes); the service worker never caches `/mod/api/*`.

## Retention

**Reports are deleted 30 days after they are filed**, open or resolved (swept
at most hourly, on the next report or console load). Why 30: it covers the
reveal (~10-15) plus the two-week pilot after it with a moderator reading
daily, and a report older than a month describes a build nobody runs any more;
keeping a browser string and a complaint about somebody's name longer than it
takes to act on them buys nothing. Hides lift on their own (1 h – 7 days) and
the row is swept. Hidden finds stay hidden until unhidden. The audit log is
kept for the life of the pilot — it holds no personal data beyond a display
name in the detail and a `walker_id` — and is reviewed with the institution
admin at the pilot's end.

## Escalation path

1. **Student** hides the walker on their own phone (instant) and taps
   **Report name**, or files a report from Settings.
2. **Moderator on duty** checks `/mod` during every session (the reveal: every
   30 minutes at the booth). Offensive name → hide from the hall for 24 h and
   resolve. A find in the wrong place or a joke find → hide the find. Bugs →
   resolve once filed on the team's tracker with the report's build id.
3. **Repeat or serious** (a slur, harassment, a threat, anything involving a
   minor or a real-world safety risk) → hide for the maximum (7 days), and
   escalate the same day to the institution admin with the audit row and
   report id. The app knows only a display name and a hash; identifying a
   person, if it is ever warranted, is the institution's process under its
   own policy (OSA / the Discipline Office), not something this app can or
   should do.
4. **Institution admin** decides on anything beyond a hide, and rotates
   `MOD_TOKEN` whenever a moderator leaves the rota.

## Not built yet

- Individual moderator accounts. One shared `MOD_TOKEN`, so the audit log
  records WHAT was done, not WHO did it. Next: per-moderator tokens or
  sign-in with an account flagged moderator, and an `actor` column.
- An institution-admin role in the app (read-only audit view, token rotation
  from a page).
- Reporting a shared find from the phone (the console can hide any recent find,
  and the report schema already carries `sighting_id`; the callout is not yet
  tappable).
- Renaming a signed-in account (a display name is set at signup / Google only,
  so a refused one stays generated until that exists), and moderator-forced
  renames.
- Automatic escalation (e.g. a walker named in three reports is hidden until
  reviewed), notifications to the moderator, report export.
- Rate limits are per isolate / per process and in memory: a brake, not a
  quota.
- **Pre-existing exposure, not introduced here:** `GET /world` (and the SSE
  feed) still carries each walker's raw `player_id` in `find[]` and `walker[]`,
  and `GET /join?code=` returns it — the partner / leaderboard features read
  it. Moderation payloads never include it, but closing that belongs to a
  change that re-keys partners by `walker_id`.
