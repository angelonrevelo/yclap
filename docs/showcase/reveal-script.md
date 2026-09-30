# Reveal script: about Thursday 15 October 2026

**Confirm the date and venue first** (reveal plan, Q-date). This is one card for whoever holds the phone when the institution's people walk up. It replaces [`demo-script-0926.md`](demo-script-0926.md), which described a build that is now three weeks old.

Source: Gelo's 09-30 note, [`../plaud/2026-09-30-stabilization-edutech-positioning.md`](../plaud/2026-09-30-stabilization-edutech-positioning.md). Positioning: [`reveal-plan.md`](reveal-plan.md) § Positioning. **Lead with a use, then the game.**

---

## Settings to decide before the day (not on the day)

| Setting | Where | Decide |
|---------|-------|--------|
| Live-map default | `HALL_DEFAULT` on the Worker | `opt_in` (nobody is shown until they choose) or `shared`. **If no CPIA is signed by 2026-10-13, use `HALL_OFF=1` instead** (the kill switch) |
| Plant identify | `PLANTNET_API_KEY` | Create the key at my.plantnet.org. Without it, the sheet offers Seek; say so rather than showing a failure |
| Moderators | `MOD_TOKEN=name:token,…` | One entry per person on duty. Write the names on this card, never the tokens |
| Deploy | `npm run deploy` from `reveal-1015` | Only after the Stable-Alpha gate passes. **The live URL still serves the 09-22 build until this happens** |

## Before doors open (15 minutes)

- [ ] Two phones charged, on the **same** network. Brightness up, auto-lock off.
- [ ] Open the live link on both and **add to home screen**. Walk the play map and the field map once while online so tiles and models are cached.
- [ ] Check the build: Settings → Why, at the bottom, shows "Build <commit>.<date>"; it must match the commit you deployed, and the field map must have a **Campus modules** button. If it doesn't, the deploy didn't happen; use the offline fallback lines below.
- [ ] If the live map is on (`shared`, or phones opted in), both phones show "N walkers out". If it is `HALL_OFF`, it shows nothing; don't promise it.
- [ ] A laptop open on `/mod`, signed in as the moderator on duty.

---

## The walk (about four minutes)

### 1 · A use first: "where do I go?"

**Do:** Field map → **Campus modules** → Emergency & DRR → **Nearest** clinic. On a phone the panel closes and the map flies to a red route with its distance and minutes.

**Say:** "Say you're hurt near the gym. This walks you to the nearest clinic that's on the public map. It's not the official emergency plan, and it says so. The university's DRRM office has the official one, and we're asking for it."

**Never say:** "evacuation plan", "official", "safe route".

**If the network fails:** the route is planned on the phone from committed OpenStreetMap data, so it still works.

### 2 · What lives here

**Do:** Campus modules → **Biodiversity hotspots**, then the **tree walk**: start it, show the first stop card and the minutes to the next.

**Say:** "This is the campus's living collection, from 8,000-odd iNaturalist records. The walk is eight trees you can do between classes."

### 3 · Then the game

**Do:** Play map. Walk with the stick to a find. The daily hunt, points and the buddy.

**Say:** "The game is why students open it twice. The map is what it's for."

### 4 · Two phones (only if the live map is on)

**Do:** Hand phone B to a guest; walk side by side.

**Say:** "Students can hide from the map in one switch, and then their finds show as 'A walker'. On a campus with students under 18, it can be opt-in, where nobody is shown until they choose."

**If asked "can strangers track students?":** "Only if the campus leaves the live map shared, and each student can still hide. Rare species never show where they grow. And a moderator can take anyone off the map, with a log of who did it."

### 5 · Identify a plant

**Do:** Photograph the booth plant.

**Say (every time):** "**Pl@ntNet** suggests the species. Magisphere doesn't identify anything itself. You pick; the suggestion only fills the list." If the sheet offers Seek: "Without the key, it hands you to Seek, which identifies on your phone."

### 6 · For the institution: the console

**Do:** The `/mod` laptop: **Walkers by week**, a report, the audit log naming the moderator.

**Say:** "This is what the office sees: how many walked this week and came back. Nobody is named, and nothing new is collected to count it. Reports are deleted after 30 days."

---

## Lines never to say

- "Official", "AIS ranks", "verified dataset", "evacuation plan".
- "Pokémon GO for Ateneo" or "like Roblox". The note is explicit (`2:40`).
- "It identifies plants". Pl@ntNet or Seek does, and the student picks.
- Any number not on this card or in `ROADMAP.md`.

## If asked what funding would buy

"Fix first: stability and the assets, then a proper privacy review with the university, then hosting, which is about USD 5 a month. Modules come after that." (Gelo, `5:31`–`5:51`; blueprint §11.)
