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

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { host: HOST, port: 4177, strictPort: true },
  preview: { host: HOST, port: 4178, strictPort: true },
});
