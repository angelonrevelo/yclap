import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/* ── every route the Worker answers is routed to it before the assets ──
 *
 * 10-01: /quest and /seeds/api/* were built, tested and proxied in dev — and
 * on the first deploy the static-assets layer answered them with index.html,
 * because `run_worker_first` in wrangler.jsonc did not list them. Dev never
 * shows it (Vite proxies everything). This holds the list to the Worker's own
 * routes: the vite proxy's, which is the dev-side copy of the same set.
 */
const jsonc = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8").replace(/^\s*\/\/.*$/gm, "");
const first: string[] = JSON.parse(jsonc).assets.run_worker_first;
const vite = readFileSync(new URL("../vite.config.ts", import.meta.url), "utf8");
const proxied = JSON.parse(/\[("\/world"[^\]]*)\]\.map/.exec(vite)![0].replace(/\.map$/, "")) as string[];

const covers = (path: string) =>
  first.some((rule) => (rule.endsWith("/*") ? path.startsWith(rule.slice(0, -1)) || path === rule.slice(0, -2) : rule === path));

describe("Worker routes vs static assets", () => {
  it("every path the dev proxy sends to the server is run on the Worker first in production", () => {
    for (const path of proxied) {
      const probe = path.endsWith("/") ? `${path}x` : path;
      assert.ok(covers(probe), `${path} is not in run_worker_first — the deployed site would answer it with index.html`);
    }
  });

  it("the challenge routes are among them", () => {
    for (const path of ["/quest", "/quest/claim", "/seeds/api/state", "/seeds/api/action"]) assert.ok(covers(path), path);
  });
});
