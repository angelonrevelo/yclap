# Testing Magisphere on a real phone

The one blocker the deck admits: **the PWA has never run on a physical handset.**
This is the runbook, with what was actually tried on 2026-09-08 and what worked.

---

## Why you cannot just open the LAN IP

Three of the four things worth testing need a **secure context** — HTTPS, or
`localhost`. Over `http://192.168.x.x` the browser silently refuses all of them:

| Feature | Needs a secure context |
|---|---|
| Service worker (the whole offline story) | **yes** |
| Geolocation (`navigator.geolocation`) | **yes** |
| Camera (`getUserMedia`) | **yes** |
| Layout, the map, the spawn strip, the badge shelf | no |

So a plain LAN test is not worthless — it checks every layout and reading
question on a real screen at a real pixel density — but it cannot test the
offline claim, the walk, or the catch. Know which one you are running.

---

## Path A — LAN, HTTP. Layout only. No setup, works now.

```
cd web-forest
npm run build
MAGISPHERE_HOST=0.0.0.0 npm run preview      # port 4178
```

Then open `http://<your-mac-lan-ip>:4178/` on the phone, same wifi.
Find the IP with `ipconfig getifaddr en0`.

`MAGISPHERE_HOST` is **opt-in on purpose**. The default stays on loopback,
because binding a dev server to every interface by default is how a laptop
ends up serving a half-built app to a conference wifi.

Verified working 2026-09-08: `curl http://192.168.1.25:4178/manifest.webmanifest`
returned the Magisphere manifest, so the serving half is real.

**What you can check on Path A:** every layout at true device pixel ratio, tap
target sizes, the map's raked camera on a real GPU, scroll performance with
1,098 species in the pool, and whether the type is readable outdoors.

**What you cannot:** install to home screen, offline, GPS, camera.

---

## Path B — the full test. Needs HTTPS.

Two options, both of which put the app on the public internet for the duration.
**Neither has been run yet — that is your call, not the build's.**

### B1 · Cloudflare quick tunnel

`cloudflared` is already installed on this Mac.

```
cd web-forest
npm run build
MAGISPHERE_HOST=127.0.0.1 npm run preview     # leave running
cloudflared tunnel --url http://127.0.0.1:4178
```

It prints a `https://<random>.trycloudflare.com` URL. Open that on the phone.
No account needed. The URL dies when you Ctrl-C.

**What this exposes:** the built app, publicly, to anyone with the URL. There
is no auth, no personal data in the build, and no secrets in the bundle — but
it is a real public URL and it should not be left running.

### B2 · Vercel

The repo is already linked to a Vercel project (`.vercel/project.json`,
project `yclap`). `npx vercel --cwd web-forest` would deploy a preview with a
real HTTPS URL. Longer-lived than B1, which is better for handing the link to
the group and worse if you did not want it to persist.

### B3 · Tailscale — tried, does not work on this Mac

This would have been the best answer: HTTPS on your tailnet only, no public
exposure, and it works over cellular. `tailscale serve --bg --https=443
http://127.0.0.1:4178` against `gelos-macbook-pro.tailc64a7e.ts.net`.

It fails. The App Store build of Tailscale ships a sandboxed CLI that cannot
run `serve` or `cert` from a shell:

```
The Tailscale GUI failed to start: The operation couldn't be completed.
(Tailscale.CLIError error 3.)
```

Fixable by installing the standalone Tailscale build instead of the App Store
one, which is not a thing to do four days before a showcase. Recorded here so
nobody re-tries it. Note there is already an `iphone-15-pro-max` on the tailnet
(offline, last seen ~28 days ago) — if that phone comes back online, the
standalone-build route becomes the cleanest test rig for the future.

---

## The multiplayer half

The sync server already binds to every interface and prints its LAN addresses
on startup, so it needs no change:

```
cd web-forest
node server/sync-server.mjs --port 8788
```

Point the app at it by building with `VITE_SYNC_URL=http://<mac-lan-ip>:8788`.
Two phones on the same wifi then share a world. No auth — it is a demo hall
server, not a service; do not run it on a public tunnel.

---

## What to actually look for on the phone

In priority order, because the first two are the ones that would embarrass us
on stage:

1. **Does the map render at all**, and at what frame rate when you swing the
   camera two-fingered? The raked ground is a CSS 3D transform over a lot of
   SVG, and it has never met a mobile GPU.
2. **Is the type readable outdoors?** The whole app is for use under a canopy in
   daylight. This is unbudgeted and untested.
3. Install to home screen, then **turn off wifi and cellular and reopen it.**
   The strip should still list four finds and the play map should still draw.
   If it does not, the deck's offline claim comes off slide 3.
4. GPS: does the character move, and does the "Out right now" strip re-sort by
   real distance rather than the demo walk?
5. Camera: does the viewfinder open, and does a save land in the journal?

Log whatever you find in the ROADMAP's "Still open" table — including the
things that work, because "tested on a real handset" is currently a gap the
concept note names by hand.
