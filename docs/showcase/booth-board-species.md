# Which four species the booth board should use

**Board 4** of the Canva export is the identification activity — a START→FINISH
path with four photo circles and a "?", asking *"Can you help us identify each
one and achieve climate resilience?"*

Two problems with it as it stands, and then the answer.

---

## The problem

**1. There is no answer key.** The board is a single flattened image. Nobody
running the booth can check an answer, and nothing in the file records what the
four photos are.

**2. At least one of them cannot be looked up in the app.** The clearest of the
four is **ylang-ylang (*Cananga odorata*)** — the drooping yellow strap petals
are unmistakable. It is **not in the 1,098-species pack**, and neither is
Rangoon creeper (*Quisqualis / Combretum indicum*), which the pink one resembles.

That is not a bug in the pack so much as its shape: the pack is built from
iNaturalist observations **inside the campus box**. A species nobody has logged
to iNat on campus is not in the sweep, however obviously it grows there. So a
visitor who plays the board game, scans the QR, and searches for ylang-ylang
finds nothing — the booth game and the app do not share a species.

---

## The four to use

Every one of these is **in the pack, has a 3D model, and has a real observation
count**, so a visitor can look up any of them the moment they open the app.

| # | Species | Code | Campus obs | Why this one |
|---|---|---|---|---|
| 1 | **Narra** | `narra` | 96 | The national tree, native, one of the nine with a drawn card. The anchor — if a visitor learns one name, this is the one worth having. |
| 2 | **Eurasian Tree Sparrow** (maya) | `passer-montanus` | 58 | Puts a **bird** on the board so the activity is not four plants. Universally recognised, and the app draws it as a bird rather than a generic dot. |
| 3 | **Asian Weaver Ant** (hantik) | `oecophylla-smaragdina` | 229 | **The most-observed species on this campus, of any kind.** Everyone has been bitten by one and almost nobody can name it — which is the whole thesis of the project in one photo. |
| 4 | **Peacock flower** | `caesalpinia-pulcherrima` | 170 | The orange-and-yellow fringed flower. Very likely already the fourth photo on the board, so this may be a rename rather than a swap. |

A native tree, a bird, an insect and a flowering shrub — four of the taxon
groups `kind.ts` distinguishes, so the board teaches the same lesson the app
does: biodiversity is not just trees.

Model files, all present and under the 120 kB cap:

```
species/narra.glb                    88 kB
species/passer-montanus.glb          63 kB
species/oecophylla-smaragdina.glb    58 kB
species/caesalpinia-pulcherrima.glb  71 kB
```

---

## What to do with ylang-ylang

Do not just delete it — it is a good and recognisable campus species, and its
absence is a **data** gap rather than a modelling one.

- **For Saturday:** swap it out of the board for one of the four above, so the
  activity and the app agree.
- **After:** it belongs in the pack. The fix is to re-run the campus sweep with
  a wider net than "has an iNat observation inside the box" — most likely by
  merging the AIS species list in once it lands, which is the same blocker the
  concept note already names. Ylang-ylang is a concrete example of what that
  merge would buy, and worth quoting when asking AIS for it.

---

## One line for whoever runs the booth

> Every species on this board is in the app. Scan the QR, walk to one, and it
> goes in your journal — the ant on there is the most-recorded living thing on
> this campus, and hardly anyone knows its name.
