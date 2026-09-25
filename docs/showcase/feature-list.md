# Magisphere: feature list at a glance

For the pre/post-test GForm, the booth "museum of features" walls, and the 30-second feature video (team chat, 09-09; ROADMAP NEXT). **Only features that exist.** Rows marked **[09-25 push]** were being built on 09-25 for the showcase. Check the deployed build before a wall or the video shows one, and drop any row that did not land.

Live: https://yclap-field-guide.marangelonrevelo.workers.dev · Every figure here is from the repo (`web-forest/README.md`, `ROADMAP.md`). None was estimated for this page.

---

## Play

| Feature | One line for a wall | Status |
|---|---|---|
| **Play map** | The campus at street level, with your walker standing in it | Shipped |
| **Shared world** | Every phone sees the same finds in the same places. The world re-rolls every 30 minutes | Shipped |
| **Rarity from real data** | How rare a find is comes from how often iNaturalist users have recorded it on campus | Shipped |
| **Be there to log it** | A find opens the camera only when you are within 40 m | Shipped |
| **Thumbstick walk** | For halls and demos away from campus. It follows the same ground rules as GPS and is always labelled as the stick | Shipped |
| **Daily hunt** | One tree and one area a day, worth more than a plain find | Shipped |
| **Pinch, zoom, rotate** | Two fingers zoom and swing the camera, and it stays locked on you | Shipped |
| **Haptics** | Phones that can buzz buzz on a find and on points. iPhones can't, so every buzz has something on screen too | Shipped |
| **Multiplayer: two phones, one world** | Finds logged on one phone show up live on the others | Shipped. Live polish **[09-25 push]** |
| **Pet eagle companion** | A companion that walks with you, and sleeps | **[09-25 push]** |

## Learn

| Feature | One line for a wall | Status |
|---|---|---|
| **1,098 species in 3D** | Every species iNaturalist users have recorded on campus has an animated model | Shipped |
| **Species cards** | Name, group, rarity and where the numbers came from | Shipped |
| **Identify with iNaturalist** | Take a photo and iNaturalist suggests the species. You make the call | Shipped (needs a live API key; without one the build shows a labelled recorded answer) |
| **Open in Seek** | One tap to iNaturalist's Seek app for help identifying | Shipped |
| **94 sectors from real paths** | The campus is divided along its real roads and footpaths, and the greenness of each area was measured from satellite imagery | Shipped |

## Keep

| Feature | One line for a wall | Status |
|---|---|---|
| **Journal / dex** | Your finds, saved on your phone, with an optional photo | Shipped |
| **Points** | Explore 10 · Learn 10 · Observe 25 · Hunt 40 · Local verified 50. Logging the same tree in the same area pays once | Shipped |
| **Weekly streak** | Counts the weeks you walked, not the days | Shipped |
| **Biodiversity Buddy** | A sprout that grows as your weekly streak grows | Shipped |
| **Growth stages + reveal** | Seed → sprout → sapling → tree as you walk more areas, with a reveal at each step. A stage never goes backwards | Shipped |
| **Blind boxes** | Earn a box for each new species or daily hunt, then open it for a charm. You can't buy them, there are no odds, and nothing repeats until you have the full set | **[09-25 push]** (built on 09-25, lane `gap`) |
| **13 badges** | Each one is earned from your own journal and nothing else | Shipped |
| **Walking partners + group streak** | The group's week stays alive if any one of you walks. It's a streak, not a scoreboard | Shipped |
| **Local leaderboard** | A demo board for the booth. It is not an AIS ranking | Shipped (labelled demo) |
| **Export** | Your journal as GeoJSON or CSV | Shipped |
| **Accounts** | Sign in so your journal follows you to another phone. It is not an Ateneo login | **[09-25 push]** |

## Built to be honest

| Feature | One line for a wall | Status |
|---|---|---|
| **Works offline** | The app shell, the character and the world data are saved on the phone | Shipped (not yet proven on a real handset) |
| **Says what it doesn't know** | Missing data is shown as missing, never as a zero | Shipped |
| **Demo data says so** | A seeded demo journal shows a banner saying it is seeded | Shipped |
| **Credits render** | OpenStreetMap (ODbL), Esri imagery and AIS figures are credited on screen | Shipped |

---

## Not features (do not put these on a wall)

Official AIS ranks · verification that updates any campus dataset · surveyed tree locations (placements are demo / curated until the AIS inventory) · Magisphere identifying a plant by itself · step counts, CO₂ or any metric the phone does not measure · planting or canopy promises · anything for sale.

## 30-second video order (suggested)

Play map (0–5 s) → two phones, same find (5–10 s) → walk to a find with the stick (10–14 s) → photo + iNaturalist suggestion (14–19 s) → journal + points toast (19–24 s) → open a blind box (24–28 s) → end card with the live link (28–30 s). Swap in the eagle or accounts only if they are in the deployed build.
