# Magisphere — concept note

**Ateneo de Manila University · Youth CLAP 2026 · Innovation Showcase, 12 September 2026**
**Two pages, per the 2026-09-05 brief (Katherine): the same information as the deck, in document form.**
**Version:** 0.1 · 2026-09-08 · every figure below is either measured in this repo or labelled as not.

---

## 1 · The problem, as our own tree states it

Climate stress on Ateneo's urban forest, and its ability to stay resilient.

Roughly two-thirds of the 89-hectare Loyola Heights campus is green, which makes it a
materially large piece of Metro Manila's urban canopy. The roots of the problem in our
tree are infrastructure pressure on soil and growing space, campus policy in which
resilience and native biodiversity compete against other priorities, and — the root we
can actually act on as students — **awareness and knowledge**: limited understanding of
how species diversity strengthens resilience, and limited awareness of what heat,
drought and extreme weather do to an urban forest.

The consequence we chose to attack is the one nearest the root: students walk under a
forest they cannot name. Naming is not decoration. A campus community that can name what
it walks under is a constituency for it when a car park is proposed over it.

**What we refuse to claim.** This is not a planting drive. It is not a carbon-credit
product. It is not a replacement for the AIS tree inventory — AIS has already counted,
and their numbers are cited as theirs throughout the app.

---

## 2 · What we built

**Magisphere** is a progressive web app for the campus forest: open it on a phone, walk,
and find out what is around you.

| | Measured, 2026-09-08 |
|---|---|
| Species with a 3D model in the app | **1,098** (627 plants, 215 insects, 122 fungi, 43 arachnids, 41 birds, and 50 others) |
| Model pack on disk | **83 MB**, largest single model 117 kB |
| Walkable sectors the campus is cut into | **68** of 94 mapped sectors |
| Automated tests in the build gate | **206**, all passing |
| Source of the species list | iNaturalist observations inside the campus box (sweep of 2026-09-03), 1,324 rows → 1,098 modelled |
| Source of the campus geometry | OpenStreetMap contributors (ODbL), credited on every map screen |
| Source of the tree figures on the landing | AIS · SY 2025–2026 — 1,809 trees inventoried, 101 threatened |

The loop, in one sentence: **a rotating world of finds appears across the campus every
thirty minutes; you walk to one, photograph it, and it enters your journal.**

Four mechanics carry it, and each was built against a rule:

- **Finds are placed, not conjured.** Every device on campus in the same half-hour window
  sees the same world, because the world is seeded deterministically from the sector code
  and the window index. It is a shared place, not a screensaver.
- **Rarity is data, not difficulty.** How rare a species is comes from its real
  iNaturalist observation count inside the campus box. A species seen 96 times is common;
  one seen once reads "Once on campus", and the card says where the number came from. How
  *often* each rarity band appears (55 / 25 / 15 / 5) is our invention, and the card says
  that too.
- **You must be there.** A find within 40 m opens the camera. A find further away moves
  the map and says walk to it. You cannot log from across campus, because the location is
  the one thing this app produces that the inventory does not have.
- **Nothing ranks anyone.** Thirteen badges, all earned by doing the thing the app is for.
  Nothing purchasable, no currency, no loot-box odds, no leaderboard — and no field in the
  data model from which a rank could be built. This follows Ateneo's own published work on
  meaningful gamification (Rodrigo, Favis & Cuyegkeng 2021, RECIPE).

A character grows through four stages as you walk new ground, and a cosmetic variant is
granted deterministically when a stage completes — the blind-box feeling without the
blind-box economics.

---

## 3 · How it serves the objectives in Output 2

| Committee objective | What Magisphere contributes | Honest status |
|---|---|---|
| Interactive biodiversity map by Q2 AY 2026–27, 100% of identified campus tree species | Map ships now, with 1,098 species modelled and 68 sectors walkable | The **species-per-sector** assignment needs the AIS inventory; 6 of 68 sectors name anything to find today |
| Reach 500 students in the first academic year | PWA installs from a QR at the booth; no account, no app store | Not yet measured — we have no analytics in the build and will not claim a number we did not count |
| Engage 200 students in monitoring activity | Every logged find carries species, count, coordinate and accuracy, exportable as CSV and GeoJSON | Working. Photos and notes never leave the device |
| One annual biodiversity monitoring report from community data | The GeoJSON export is the report's input; "Return Visit" is the badge that rewards re-observing the same ground | Depends on adoption, which depends on the pilot |

---

## 4 · What we still do not have

Stated plainly, because a showcase is the wrong place to discover them:

- **The AIS species-per-sector inventory.** Until it lands, most sectors cannot name what
  a student should look for.
- **The ADMUNAV walkable path graph.** Not shared with us; our sectors are cut from OSM
  paths and measured against satellite imagery instead.
- **Origin data.** Only 9 of 1,098 species carry a native/exotic label, because the
  iNaturalist sweep did not request establishment means. The app's intended bias toward
  native species is therefore inert today. The fix is a data fix, and the test suite holds
  the number so it cannot quietly stay broken.
- **A real handset test.** The PWA has never been installed on a physical phone.
- **Landmark oral history.** The balete card ships saying the story is not collected yet,
  rather than inventing one.

---

## 5 · The ask

1. **The AIS inventory**, or a decision that it will not be shared, so we can plan around it.
2. **One faculty or office sponsor** willing to own an annual monitoring report built on
   student-collected observations.
3. **Mentor feedback on metric honesty** — specifically on which of the Output 2 numbers we
   should commit to measuring, given we currently measure none of them.

---

**Team.** Youth CLAP Ateneo CCC — student prototype, not an official AIS product.
**Repository.** `web-forest/` in the yclap desk. Build gate: 206 tests, typecheck and lint
green at the commit this note describes.
