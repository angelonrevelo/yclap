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

## Path B — the full test. `npm run handset`. Publishes nothing.

```
cd web-forest
npm run handset          # builds, generates a local CA, serves HTTPS on :4179
```

It prints every address it is reachable on and the phone instructions. Then, on
the phone, **once**:

1. AirDrop (or email) `web-forest/script/cert/ca.crt` to the device.
2. **iOS:** Settings → *Profile Downloaded* → Install. Then
   **Settings → General → About → Certificate Trust Settings** and switch on
   *Magisphere local CA*. **This second step is the one everybody misses** — the
   profile installs fine without it and the certificate is still not trusted.
3. **Android:** Settings → Security → Encryption & credentials → Install a
   certificate → CA certificate.

Open `https://<mac-lan-ip>:4179/` and everything works: service worker, install
to home screen, geolocation, camera.

### Why this and not a tunnel

Nothing leaves the wifi. No account, no public URL, no unfinished app on the
open internet, and no decision anyone has to make first. The cost is one profile
install on one phone.

The certificate also covers this Mac's **Tailscale** address, so if the phone is
on the tailnet the same URL works over cellular — without `tailscale serve`,
which is what actually failed here (see below).

### What was verified, 2026-09-09

Over `https://192.168.1.25:4179` with `curl --cacert script/cert/ca.crt`:

| Check | Result |
|---|---|
| TLS validates against the generated CA | pass |
| `subjectAltName` covers the LAN IP and the tailnet IP | pass — an IP only in the CN is rejected outright by iOS, and this is the usual cause of "works on the laptop, fails on the phone" |
| `/manifest.webmanifest` | serves, reads `Magisphere` |
| `/journal` (a client-side route with no file) | 200 via SPA fallback |
| `/model/species-model.json` | 200, 431,651 bytes — the world data is reachable |
| `sw.js` sent `Cache-Control: no-cache` | pass — otherwise you spend an evening testing yesterday's build |
| Path traversal, raw and percent-encoded | returns `index.html`, never a file outside `dist/` |

**Not verified, and cannot be from here:** that iOS accepts the profile and
registers the service worker. That is the physical-phone step, and it is the
whole point of this runbook.

One bug found and fixed while building it: `openssl x509 -extfile /dev/stdin`
reported success and produced a certificate with **no subjectAltName at all**.
The script now writes the extension file to disk and then re-reads the
certificate to prove the SAN landed, rather than trusting the exit code.

### Cert hygiene

`script/cert/` is gitignored — the CA private key must never be committed. The
certificate is deliberately **30 days**: a local CA sitting trusted on a phone
for a year is a liability nobody remembers. After it expires, `node
script/serve-https.mjs --regenerate` and re-install on the phone.

---

## Path C — the public routes, if you ever want them

Both work and both put the app on the open internet, which is why Path B is the
default and neither of these has been run.

- **Cloudflare quick tunnel.** `cloudflared` is installed.
  `cloudflared tunnel --url http://127.0.0.1:4178` prints an
  `https://<random>.trycloudflare.com`. No account; dies on Ctrl-C.
- **Vercel.** The repo is linked (`.vercel/project.json`, project `yclap`).
  `npx vercel --cwd web-forest` gives a longer-lived HTTPS preview — better for
  handing the link to the group, worse if you did not want it to persist. The
  CCC currently has screenshots and no app, so this is the natural way to give
  them one.

### Tailscale — tried, does not work on this Mac

`tailscale serve --bg --https=443 http://127.0.0.1:4178` against
`gelos-macbook-pro.tailc64a7e.ts.net` would have been ideal. It fails: the App
Store build ships a sandboxed CLI that cannot run `serve` or `cert`.

```
The Tailscale GUI failed to start: The operation couldn't be completed.
(Tailscale.CLIError error 3.)
```

Fixable by installing the standalone Tailscale build, which is not a thing to do
four days before a showcase. Recorded so nobody re-tries it. Note there is
already an `iphone-15-pro-max` on the tailnet (offline, last seen ~28 days) —
Path B's certificate already covers the tailnet address, so that phone works
today without any of this.

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

**Gotcha that will bite on Path B:** an HTTPS page cannot `fetch` an HTTP
endpoint — the browser blocks it as mixed content, silently, and the world strip
just never appears. So over Path B the sync server needs HTTPS too. Either serve
it behind the same certificate, or accept that Path B tests the single-device
half and run multiplayer on Path A over plain HTTP, where both halves are
insecure and consistent. On the day, a demo hall on one wifi with `VITE_SYNC_URL`
pointed at an HTTP server means the app itself must also be served over HTTP —
which costs the offline story. **Pick one before Saturday; you cannot have the
service worker and an HTTP sync server in the same build.**

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
