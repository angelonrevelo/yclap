# Magisphere brand kit

Everything here is ours to reuse — posters, socials, the booth screen, chat
stickers — without going back to an image generator for each one.

> **Status (2026-09-23): for implementation, not this round's pubmats.** The
> showcase slides are due at 12 PM and the printed pubmats are already final, so
> nothing here replaces them. The in-app art (stickers, icons, theme) is what is
> in use. **Design decisions go through Aleij**, who handles the team's designs —
> get their review before any piece here is used for marketing.

Built 2026-09-23 from the team's Canva poster set (the nine PNGs in `magi/` on
the MacBook: the logo drop, the LEARN / GROW / EXPLORE / PLAY / "What's
Magisphere?" posters and the survey QR). Those posters were the **reference**
for the logo, palette and mood. Nothing in this folder is copied from them 1:1:
the mark and wordmark are rebuilt as vector geometry, and the characters were
generated fresh into one locked palette.

## What's in the folder

| File | Size | Use it for |
|---|---|---|
| `lockup-stacked.png` | 1400×674, transparent | The logo. Mark over wordmark over "Rediscovering home." |
| `lockup-stacked-light.png` | 1400×674, transparent | The same logo for dark or photo backgrounds (tagline in white) |
| `lockup-horizontal.png` | 1600×330, transparent | Headers, letterheads, slide footers |
| `wordmark.png` | 1400×420, transparent | Wordmark + tagline, without the globe |
| `mark.png` | 960×680, transparent | The globe mark alone: stickers, favicons, watermarks |
| `app-icon.png` | 1024×1024 | App stores, profile pictures |
| `scene-portrait.png` / `-landscape` / `-square` / `-banner` | 1080×1920 / 1920×1080 / 1080×1080 / 1500×500 | Clean backgrounds: sky, hills, trail, plumeria. No text |
| `poster-play.png` | 1080×1920 | Story / poster: "PLAY — Explore. Collect. Come back." |
| `social-grow.png` | 1080×1080 | Feed post: the four growth stages, "Walk. Log. Grow." |
| `og-image.png` | 1200×630 | Link preview for the site |
| `banner-cover.png` | 1500×500 | Facebook / X cover, booth screen header |
| `sticker-sheet.png` | 2000×1500 | Every character and icon on one page, for print and review |
| `brand-sheet.png` | 1800×1200 | Palette, type and lockups on one page, for the team |

Source files, not in this folder:

- **Vector (SVG)** — `web-forest/public/brand/magi/`: every lockup, the mark, the
  app icon, the four scenes, the wood plank and signpost, sparkle, plumeria,
  leaf sprig and step discs. Scale these to any size; open them in Figma or
  Illustrator. The 12 game icons are in `web-forest/src/asset/magi/icon/`.
- **Characters** — `web-forest/src/asset/magi/sticker/`: 1024 px transparent
  PNG masters of the Sprout buddy (sprout, cheer, map, sleep, trail), the
  yellow explorer, and the four growth stages (seed, seedling, sapling, tree).

## The system

**Palette** (sampled off the posters; the same hexes the stickers are locked to)

| Name | Hex | Role |
|---|---|---|
| Forest | `#114B2F` | Wordmark start, headings, ink |
| Teal | `#11646C` | Wordmark middle |
| Lagoon | `#279CAD` | Accents, the camera |
| Leaf | `#3E9A4A` | Primary buttons, progress |
| Sprout | `#7CC84A` | Leaves, highlights |
| Lime | `#C8E88C` | Soft fills |
| Sky | `#AADCFC` | Backgrounds, the globe's sea |
| Blue | `#2F80D8` | Secondary accent (the posters' blue step discs) |
| Sun | `#F5C842` | Rewards, level badge, the explorer |
| Sparkle | `#F59A23` | The four-point sparkle, streak flame |
| Cream | `#FFF6DC` | The buddy's body, wood-sign text |
| Wood | `#A8582C` | Signs, quest tab |

**Type**: Fredoka Bold for headlines (the wordmark is cut from it), Nunito
ExtraBold for taglines and labels. Both are OFL and vendored in
`web-forest/script/magi-asset/font/`.

**Motifs**: a white sticker border around every character and icon; the
wood plank for anything that is a quest, a direction or a slogan; the orange
four-point sparkle; white plumeria in the grass; sky fading into mint.

**Characters**: *Sprout* is the biodiversity buddy, a cream seed-bean with two
leaves. It grows seed → seedling → sapling → tree as you walk, which is the
in-app buddy stage. The yellow backpacker is the explorer from the posters'
PLAY and GROW sheets; the name is still the team's to choose.

## How each kind of asset is made

| Path | Why this path | Rebuild |
|---|---|---|
| **Generated** (characters) | Illustration is the one thing code can't draw well | `node <codex skill>/scripts/imagen.mjs web-forest/script/magi-asset/sticker.spec.json --resume` |
| **Drawn by code** (logo, icons, scenes) | Exact spelling, exact geometry, any size, no generator artefacts | `node web-forest/script/magi-asset/build-vector.mjs` |
| **Rendered** (every PNG here) | Composed from the two above, with live text in the real fonts | `node web-forest/script/magi-asset/render.mjs` |

The characters were made with `codex` (gpt-image-2) on a flat `#FF00FF` key,
all referencing one anchor (`buddy-sprout`) so they read as a single set. Each
was then remapped to the 17-colour palette above with no dithering, and its
contract was checked: exact size, only declared colours, enough ink. **10 of 10
shipped characters met it.** No image model drew any lettering: every word on
every piece is live text or font outlines.

## Still open

- **Three spot illustrations** (`spot-empty-journal`, `spot-success`,
  `spot-find`) are specced in `web-forest/script/magi-asset/spot.spec.json` but
  not drawn yet. The codex account hit its usage limit after the 11th render
  (it resets 2026-09-23 15:42), and the grok fallback returned
  `402 Grok Build usage balance exhausted`. The app doesn't need them, since the
  buddy stickers cover those moods, but they'd round out the set. To run them:
  `node <codex skill>/scripts/imagen.mjs web-forest/script/magi-asset/spot.spec.json --resume`.
- **One drift**: the spec asked for the yellow explorer holding a map, and the
  model drew Sprout wearing a backpack instead. It was kept as `buddy-trail`,
  and the spec now describes what it is.
- **Cheek blush** on the Sprout renders is slightly mottled. A soft gradient was
  snapped to two palette tones. It reads fine at app sizes, and it's the first
  thing to retouch for large print.
- The older **kit icons** (camera, map, journal, walk…) and the **Settings tab
  art** in `web-forest/src/asset/icon/` predate this kit and still use the
  earlier style.
