<p align="center">
  <img src="web/public/brand/logo-upright-512.png" alt="Youth CLAP" width="160">
</p>

# yclap

**The Ateneo team's desk for the Youth Climate Leadership Accelerator Project (Youth CLAP) — the landing site, the Magisphere app, and the research and pitch material behind them.**

Youth CLAP is a 2026 accelerator where student teams take a climate problem
from research to a working pilot. This repo is the Ateneo team's shared
workspace for it.

- **Magisphere** (`web-forest/`) — the team's flagship: a campus-forest app for
  Ateneo Loyola Heights. Walk the campus, find and photograph trees and wildlife,
  identify them through iNaturalist, earn badges, and watch a shared live map of
  what everyone has found. It works offline and installs as a PWA. *Two-thirds
  of this campus is green. Now you can name it.*
- **Landing site** (`web/`) — the Youth CLAP brand, goals, legal grounds, the
  participant journey, the team's lanes, and the experts behind it.
- **Docs** (`docs/`) — research briefs, the problem tree, the showcase deck and
  concept note, campaign canvas, pitch scripts, and session notes.

The team works in four lanes — Build, Science, Mobilize, Story.

## Quick start

Landing site:

```bash
cd web
npm install
npm run dev          # http://localhost:9500
```

Magisphere:

```bash
cd web-forest
npm install
npm run dev          # http://localhost:4177
npm run sync         # live campus world on :8788 (Vite proxies /sync /live /world)
npm test
```

Magisphere also has `build`, `lint`, `preview`, `handset` (HTTPS build for a
phone on the LAN) and `deploy` (Cloudflare Worker via wrangler). Its own
[README](web-forest/README.md) covers all of it.

## Configuration

The landing site needs none. Magisphere reads, where its sync server or Worker
runs:

- `INAT_API_TOKEN` — iNaturalist API token for identification
  (`VITE_INAT_API_TOKEN` for the client in development).
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — Google sign-in.
- `HALL_PAGE_ORIGIN` — extra page origins the sync "hall" answers, comma-separated.

## How it works

```
web-forest (React PWA, offline-first)
    │  /sync /live /world
    ▼
sync server (local, :8788)  or  Cloudflare Worker + "CAMPUS" Durable Object (production)
    │
    └── iNaturalist API for species identification
```

The campus map is computed from OpenStreetMap paths and measured against
satellite imagery; the species list comes from a real iNaturalist campus sweep.

## More

- [ROADMAP.md](ROADMAP.md) — what's next, tiered
- [docs/internals.md](docs/internals.md) — demo table with sibling pilots
  (Gargar, EcoWaste), the full doc index, north star, program dates, legal frame
- [web-forest/README.md](web-forest/README.md) — Magisphere in depth
- [docs/](docs/) — research, showcase, campaign and people notes
