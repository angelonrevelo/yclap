import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Port claim: 4177 (forest Magisphere). Never 5173 / 8080 / 3000–3999.
 * web/ already holds 9500. strictPort so a collision fails loudly.
 *
 * Loopback by DEFAULT, deliberately. `MAGISPHERE_HOST=0.0.0.0` opens it to the
 * LAN for the handset test (see script/handset.md) — opt-in, because binding a
 * dev server to every interface by default is how a laptop ends up serving a
 * half-built app to a conference wifi.
 */
const HOST = process.env.MAGISPHERE_HOST ?? "127.0.0.1";
/** `npm run sync` — server/sync-server.mjs. */
const SYNC_TARGET = "http://127.0.0.1:8788";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: HOST,
    port: 4177,
    strictPort: true,
    /* Every route goes to the LAN sync server with `xfwd: true`, so it can
       tell the phones apart: it trusts X-Forwarded-For only from loopback
       (this proxy) and reads the last entry, the one the proxy appended. */
    proxy: Object.fromEntries(
      ["/world", "/sync", "/live", "/health", "/join", "/mine", "/auth/", "/account/", "/inat/identify"].map((path) => [
        path,
        /* `ws` so the hall socket (/live/socket) upgrades through the proxy too. */
        { target: SYNC_TARGET, xfwd: true, ws: path === "/live" },
      ]),
    ),
  },
  preview: { host: HOST, port: 4178, strictPort: true },
});
