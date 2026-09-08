# Magisphere — the seven slides

**Innovation Showcase, 12 September 2026 · Youth CLAP Ateneo CCC**
**Constraint from the 2026-09-05 brief: seven slides, no more.**
**Version:** 0.1 · 2026-09-08 · pairs with [`concept-note.md`](concept-note.md), which carries the same information in document form.

Every number on these slides is measured in the repo or marked as not measured.
Nothing here may be said on stage that the app cannot do in front of the room.

---

## 1 · The contradiction

> **Two-thirds of this campus is green.
> Most of us cannot name what we are walking under.**

Visual: the satellite view of Loyola Heights, sectors overlaid.
Under it, in small type: *89 ha · ~⅔ green · 1,809 trees inventoried · 101 threatened
— AIS, SY 2025–2026.*

**Say:** the campus is one of the larger pieces of urban canopy in Metro Manila, and it
is under pressure from buildings, from policy priorities, and from heat. The root we can
act on as students is the awareness one.

---

## 2 · Why naming is the lever

Problem tree, one branch only — do not put the whole tree on the slide.

    Root:        awareness and knowledge
    Consequence: a community that cannot name its forest
    Therefore:   it is not a constituency for that forest when a car park is proposed

**Say:** we are not claiming an app fixes climate stress. We are claiming that a campus
that can name what it walks under behaves differently in a consultation.

**Non-claims on the slide, in small type:** not a planting drive · not a carbon-credit
product · not a replacement for the AIS inventory.

---

## 3 · Magisphere

One screenshot: the phone, home, with **Out right now** showing.

> **A rotating world of finds appears across the campus every thirty minutes.
> Walk to one, photograph it, and it enters your journal.**

Three lines under it:

- **1,098 species** modelled in 3D, from a real iNaturalist sweep of the campus box
- **68 walkable sectors**, cut from OpenStreetMap paths and measured against imagery
- Works **offline** — the shell, the character and the world data are precached

---

## 4 · The demo — sixty seconds, one path

Live on the phone, mirrored to the projector. Rehearse this exact path:

| Beat | On screen |
|---|---|
| 0:00 | Home. "Out right now" — four finds, nearest first, each with distance and walk minutes |
| 0:12 | Tap the nearest. Map moves to it; the marker is a *bird*, not a generic dot |
| 0:25 | Walk in (demo walk). Inside 40 m the camera opens on that species |
| 0:40 | Save. Journal count moves; the character advances a stage; the blind-box variant reveals |
| 0:52 | Journal → badge shelf. "First Find", "Three Grounds", earned with dates |

**If the wifi dies:** the offline build is the fallback and the demo path above does not
touch the network. Ivan's mini projector, hub and HDMI are the AV plan.

---

## 5 · The two rules we designed against

> **Rarity is data. Nothing ranks anyone.**

- Rarity comes from the species' own iNaturalist campus observation count. Seen 96 times
  → common. Seen once → **"Once on campus"**. The card says where the number came from.
  How often each band appears (55/25/15/5) is ours, and the card says that too.
- Thirteen badges, all earned by doing the thing the app is for. No currency, no
  purchasable anything, no loot-box odds, **no leaderboard** — and no field in the data
  model a rank could be built from. Following Ateneo's own RECIPE work on meaningful
  gamification (Rodrigo, Favis & Cuyegkeng 2021).

**Say:** we could have made rarity up. Deriving it from real observation gaps is what
makes a walk produce data instead of points.

---

## 6 · What it produces, and what it does not

**Produces:** every logged find carries species, count, coordinate, accuracy and time,
exportable as CSV and GeoJSON. That pair — a count and a location — is exactly what the
existing inventory does not have. Photos and notes never leave the device.

**Does not have yet, said out loud:**

- The AIS species-per-sector inventory — 6 of 68 sectors name anything to find today
- The ADMUNAV path graph
- Origin data: 9 of 1,098 species carry a native/exotic label
- A test on a real handset
- Any usage number — we measure none of the Output 2 targets yet and will not claim one

---

## 7 · The ask

1. **The AIS inventory**, or a decision that it will not be shared.
2. **One faculty or office sponsor** to own an annual monitoring report built on
   student-collected observations.
3. **Mentor feedback on metric honesty** — which Output 2 numbers should we commit to
   measuring, given we measure none of them today.

Close on the contradiction from slide 1, then the mission line:

> **Two-thirds of this campus is green. Now you can name it.**

---

## Booth notes

- QR to the PWA, printed large. No account, no app store, no install friction.
- Run the offline build at the booth; do not depend on venue wifi.
- The greyscale test matters at a booth under bad light: pin shape and the rarity tick
  count both read without colour. Say so if a judge asks about accessibility.
- Sintra board deadline was Tuesday — brand palette is the committee kit (bark #704E2E,
  leaf #ADE25D, ultramarine #1F01B1), which is the same identity ramp now in the app.

## AV checklist

- [ ] `npm run build && npm run preview` offline backup on the laptop
- [ ] Screen-record the sixty-second path in case the phone misbehaves
- [ ] Character stage models precached — open the app once on the demo device beforehand
- [ ] Journal pre-seeded so the badge shelf is not empty on stage, and *say* it is seeded
