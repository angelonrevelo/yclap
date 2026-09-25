# Demo script: Saturday 26 September 2026

**PNU Innovation Showcase, PNU Gymnasium, Manila.** One card for whoever holds the phone when Ma'am or a judge walks up. It replaces the Ma'am walkthrough in `ROADMAP.md` § Showcase clock for this one day.

Live link: https://yclap-field-guide.marangelonrevelo.workers.dev

Source of the asks: Gelo's 09-25 note, [`../plaud/2026-09-25-demo-readiness-backend.md`](../plaud/2026-09-25-demo-readiness-backend.md).

> **Read this first.** Steps marked **[09-25 push]** were being built in parallel on 09-25 (accounts, the pet eagle, the live multiplayer polish, the detection check). **Open the deployed build before doors open and tick each one.** If a step is not in the deployed build, skip it. Do not describe it as if it were there. Every other step works on `demo-0926` today.

---

## Before doors open (15 minutes)

- [ ] Two phones charged, both on the **same** network (venue wifi or one phone's hotspot). Brightness up, auto-lock off
- [ ] Open the live link on both, then **add to home screen** so the offline shell is installed (a real handset has never been proven, see `web-forest/script/handset.md`)
- [ ] Phone A: open once with `?seed=demo` so the Journal is not empty. **The amber banner saying it is seeded must be visible.** Phone B stays unseeded, a fresh player
- [ ] Walk each phone's Home and Map once while online so the tiles, the character models and the world are cached
- [ ] Confirm the thumbstick shows. The hall is off campus, so the app switches to the stick by itself and says so
- [ ] **[09-25 push]** Sign in on phone A with the demo account. Write the account name on the back of this card, never the password
- [ ] Projector / HDMI tested with phone A (only Ivan's mini projector is known for Saturday)

---

## The walk (about three minutes)

### 1 · Accounts **[09-25 push]**

**Do:** Settings → account. Show the signed-in name. If Google sign-in is in the build, show the button but do not sign a judge's own Google account in on a shared phone.

**Say:** "Your journal can follow you to another phone now. It's a Magisphere account. It isn't an Ateneo login, and we don't get anything from AIS through it."

**If the network fails:** "Sign-in needs the network. The whole game still runs on the phone, and your finds stay saved on it." Then go to step 2 on phone A, which is already signed in.

**If accounts did not land:** show Settings → Walker code instead. "Right now your walker code is your identity. Type it on a second phone and it becomes you. We tell players it isn't a password."

### 2 · Multiplayer between two phones

**Do:** Hand phone B to the judge. On both phones, open Home and walk with the stick towards the same find. Both phones show the **same finds in the same places**, because the world is seeded per sector and per half-hour. When one phone logs a find, it turns up on the other phone's world strip.

**Say:** "It's the same campus on both phones. Nobody sets it up. The two phones just roll the same dice."

**If the network fails:** the finds still match, because they come from the shared seed and not the server. What drops is the live strip. "The finds still match with no internet. What you lose is seeing the other player live. The strip goes blank rather than showing a zero."

### 3 · The pet eagle **[09-25 push]**

**Do:** Show the eagle companion beside the walker, then its sleeping state.

**Say:** "It's a companion. It doesn't score anything and it isn't a real bird's location."

**If the network fails:** the eagle draws on the phone, so nothing changes.

**If it did not land:** show the Sprout buddy and its stages on the Journal instead: "The buddy grows with your weekly streak, and your walker grows with every new area you walk into."

### 4 · Identify a plant

**Do:** Walk to a find until the card reads "You are here", open the camera, take a photo of the booth plant or a printed leaf, and read out the suggestions.

**Say (every time):** "**iNaturalist** is doing the identifying here. Magisphere isn't. You pick the species. The suggestion only fills in the list for you."

**If the network fails:** the camera says iNaturalist is unreachable. "Identifying live needs the internet. The player can still pick the species themselves." Pick it from the campus list and save. The log works offline.

**If the build has no API key:** the camera replays a **recorded** iNaturalist answer for a Narra photo, and the screen says "RECORDED RESPONSE". Say so: "That's a recorded answer from iNaturalist. It hasn't looked at this photo."

**[09-25 push] detection check:** if the smoke test landed, it tests *our matching* against pictures iNaturalist has already answered. It does not prove accuracy on campus. Do not quote a percentage unless the test printed one and you can show where it came from.

### 5 · Journal

**Do:** After the save, the app lands on the Journal. Show the dex count moving, the points toast (Observe +25, or Hunt +40 if it was the daily tree), the weekly streak, and the badge shelf.

**New today: blind boxes.** A new species or a finished daily hunt earns a box. Tap **Open**: it shakes, cracks, and a charm comes out onto the shelf.

**Say:** "You earn boxes by logging. You can't buy them, and there are no odds. You get every charm once before any of them repeats. It's all saved on this phone."

**If the network fails:** nothing here uses the network. The journal, the points, the boxes and the badges are all stored on the phone.

**Always say, on phone A:** "This journal is seeded for the demo, see the banner. A real player starts empty."

---

## Lines never to say

- That Magisphere **identified** a plant (iNaturalist suggests, the player chooses)
- That the leaderboard is an **AIS ranking** or an official campus ladder (it is a local demo cohort)
- That the finds are **surveyed tree locations** (they are demo / curated placements until the AIS inventory arrives)
- That the journal statuses are **verified by AIS**, or that logs update any campus dataset
- That the app **plants trees** or **raises canopy cover**
- Any number the app did not measure: steps, CO₂, "accuracy", user counts

## If everything fails

Phone A in airplane mode still runs the installed app: Home, the stick walk, a log with a hand-picked species, the Journal, the boxes. Say: "We built it to work offline, because campus wifi under the trees is patchy." Then walk it.
