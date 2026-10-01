# Anti-cheat in location games — what a campus PWA can borrow

Researched 2026-10-01 for Gelo's ask: "a way for seeds to integrate challenges to students and that noone can cheat, so you can research on all the anticheat measures pokemon go has". Every row was opened at its URL in that session. Anything not confirmed is marked **unverified**; Niantic has never published its detection thresholds, so the speed and cooldown numbers are community-measured.

## Measures

| Measure | What it catches | In a browser PWA? | Source |
|---|---|---|---|
| Three-strike discipline: warning (~7 days reduced play) → 30-day suspension → permanent ban; some offences skip ahead | GPS spoofing, unauthorised clients | yes (policy) | https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/39-three-strike-discipline-policy/ |
| Warnings work: >5 M accounts actioned 2020–21; 90% of first-warned players stopped | — | yes | https://gonintendo.com/stories/377462-niantic-punishes-over-5-million-cheaters-across-pokemon-go-and-th |
| Pattern analysis of location history, warnings first (2017) | spoofing after the fact | yes, server-side | https://pokemongohub.net/post/breaking-news/new-niantic-security-measure-targets-gps-spoofers-warnings-issued-future-bans-possible/ |
| Impossible travel (Monster Hunter Now) | jumps faster than possible | yes, server-side | https://www.dexerto.com/monster-hunter-now/monster-hunter-now-spoofing-2364248 |
| Cooldown by distance (community chart) | acting in two far places too fast | yes | https://itoolab.com/tips/pokemon-go-cooldown-chart/ (community) |
| Speed lock (~48 km/h spawns off); distance counts only under ~10.5 km/h (community) | vehicles | yes | https://www.shacknews.com/article/97285/pokemon-go-patch-disables-spawns-while-driving · https://www.dexerto.com/pokemon/should-pokemon-go-track-bike-km-egg-hatching-1003571 |
| Mock-location flag, root/jailbreak, Play Integrity | spoofers, modified devices | **no** — native only | https://developer.android.com/google/play/integrity/overview |
| Scraper/bot blocking | unofficial clients | partly (rate limits) | https://www.engadget.com/2016-08-04-pokemon-go-dev-says-it-needed-to-block-scrapers-to-expand.html |
| Trade within 100 m; remote raid passes capped | remote abuse | yes | https://bulbapedia.bulbagarden.net/wiki/Raid_Pass |
| Event proof of presence: Campfire check-in codes, store staff codes, tickets | not being there | **yes** | https://pokemongo.com/news/gofest-celebration |
| Wayfarer peer review with reviewer agreement rating | fake submissions | yes | https://community.wayfarer.nianticlabs.com/t/glossary-for-common-wayfarer-terms/162 |
| iNaturalist Research Grade: >2/3 agreement, "wild", "location accurate", "evidence" votes | bad data | yes | https://help.inaturalist.org/support/solutions/articles/151000169936 |
| Geocaching: the physical logbook must be signed | armchair logs | yes (a code at the site) | https://www.geocaching.com/blog/2019/06/geocaching-etiquette-201-finding-and-logging/ |

What the web gives: `navigator.geolocation` with `accuracy` (HTTPS only) — and **no way to tell a mocked position**. WebAuthn/passkeys prove the key, not the device. iOS strips GPS EXIF from browser uploads (WebKit 257534). Web Bluetooth is not in Safari.

## Party Play (Niantic Help Center)

Up to **4** trainers including the host; join by the host's QR or **9-digit** code; the lobby is open **15 minutes**; a party lasts up to **3 hours**; members must stay "physically near one another" (**no distance published — unverified**); party challenges; approximate locations shared on the map, switchable off. https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/4312-joining-a-party/ · https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/4310-what-is-party-play/

## What Magisphere does with it (10-01)

| Layer | Where |
|---|---|
| Rotating 6-digit **site code** (30 s step, good for ~60 s) shown by the organiser at the place; 8 wrong codes lock that challenge for 10 min | `src/quest.ts` `siteCodeAt` · `/seeds` site-code screen |
| **Geofence** around the site, padded by the fix's accuracy | `judgeClaim` |
| **Real GPS only**: stick and demo walks cannot claim | `judgeClaim` |
| **Plausibility → review, not refusal**: accuracy worse than 50 m, faster than 15 km/h between fixes, a teleport since the last claim, a "GPS" that never jitters | `plausibilityFlag` |
| **Server time, one claim each** (per walker, and per account when signed in) | `worker/quest.ts` UNIQUE indexes |
| **Strikes**: a voided claim is a strike; 2 strikes → every later claim goes to a person; approving lifts it | `quest_strike` |
| **Append-only audit** of every organiser action | `quest_audit` + triggers |
| Group walks the Party Play way: 4 max, code, 15-min lobby, 3 h, credit within 100 m of the host | `src/party.ts` |
| Daily hunt pays only within 150 m of its spot; `/sync` keeps the fix source, drops off-campus points, re-dates future ones, rate-limits and caps the body | `huntClearOf`, `sanitizeSighting`, `worker/sync.ts` |

**Not possible in a PWA, said plainly:** detecting a mocked location, a rooted phone, or a tampered client. Someone at the site can still hand the code to a friend standing next to them; someone with a spoofer and a friend at the site reading the code aloud within a minute can still claim — and lands in review if their GPS never jitters or teleported. Signed-in accounts make one person one claim. A native wrapper (Play Integrity) is the next layer and costs an app.
