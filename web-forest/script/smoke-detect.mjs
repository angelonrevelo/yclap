/**
 * Detection smoke suite — does iNaturalist's answer land on the right campus
 * species for a photo of that species?
 *
 * Every photo goes through the SAME road the camera sheet uses:
 * identifyPlant() (src/inat.ts) → POST /inat/identify → handleIdentify()
 * (worker/inat.ts) → iNat score_image, then matchCampus() (src/inat-match.ts).
 *
 * Three modes, picked in this order:
 *   --url <base>        LIVE against a running proxy (wrangler dev, npm run sync,
 *                       or the deployed Worker). The token is that server's.
 *   INAT_API_TOKEN=…    LIVE in-process: the proxy function runs here with the
 *                       token from this env.
 *   (neither)           REPLAY: the proxy runs against saved responses in
 *                       test/detect-smoke/response/. Says so loudly. A replay
 *                       measures THIS app's plumbing and matching, not iNat.
 *
 *   --record            (live only) save each live reply over response/<code>.json
 *   --min-top1 0.6      exit 1 when the exact-top-1 rate is below this
 *   --min-top5 0.8      exit 1 when the exact-within-top-5 rate is below this
 *
 * Exit: 0 pass · 1 under threshold · 2 could not run live (token missing,
 * expired, rate-limited, proxy unreachable).
 *
 * Usage: npm run smoke:detect [-- --url http://127.0.0.1:8788] [-- --record]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { identifyPlant, IDENTIFY_PATH, TOKEN_URL } from "../src/inat.ts";
import { bestCampusMatch, exactPosition } from "../src/inat-match.ts";
import { handleIdentify, SCORE_IMAGE_URL } from "../worker/inat.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
export const SMOKE_DIR = resolve(HERE, "../test/detect-smoke");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

/**
 * A fetch for identifyPlant(): the proxy path goes to `proxy`, anything else is
 * refused so the smoke can never quietly take the direct-token road.
 */
function routeTo(proxy) {
  return async (url, init) => {
    if (String(url) !== IDENTIFY_PATH) throw new Error(`smoke refuses ${url}`);
    return proxy(new Request(`http://smoke.local${IDENTIFY_PATH}`, init));
  };
}

/** Upstream stand-in for replay: serves the saved reply for the current photo. */
function replayUpstream(saved) {
  return async (url) => {
    if (String(url) !== SCORE_IMAGE_URL) throw new Error(`replay refuses ${url}`);
    return new Response(JSON.stringify(saved.body), {
      status: saved.status ?? 200,
      headers: { "Content-Type": "application/json" },
    });
  };
}

/** Real fetch, keeping a copy of iNat's raw reply so --record can save it. */
function recordingUpstream(sink) {
  return async (url, init) => {
    const res = await globalThis.fetch(url, init);
    const text = await res.clone().text();
    try {
      sink.status = res.status;
      sink.body = JSON.parse(text);
    } catch {
      sink.body = null;
    }
    return res;
  };
}

export function pickMode({ url, token }) {
  if (url) return "live-url";
  if (token) return "live-token";
  return "replay";
}

/**
 * Run the suite. Returns a summary; prints through `log`. Never reads the
 * token into output.
 */
export async function runSmoke({
  url = null,
  token = null,
  is_record = false,
  min_top1 = 0.6,
  min_top5 = 0.8,
  dir = SMOKE_DIR,
  log = console.log,
} = {}) {
  const mode = pickMode({ url, token });
  const manifest = readJson(join(dir, "manifest.json"));
  const row = [];
  let is_constructed = false;
  let blocker = null;

  if (mode === "replay") {
    log("");
    log("  ################################################################");
    log("  #  REPLAY MODE — no INAT_API_TOKEN and no --url.              #");
    log("  #  NOTHING WAS SENT TO iNATURALIST. Saved replies are replayed #");
    log("  #  through the real proxy + match code. This checks our        #");
    log("  #  plumbing and matching, NOT iNaturalist's accuracy.          #");
    log("  ################################################################");
  } else {
    log(`\n  LIVE — ${mode === "live-url" ? `proxy at ${url}` : "in-process proxy, token from INAT_API_TOKEN"}`);
  }

  for (const photo of manifest.photo) {
    const image = readFileSync(join(dir, photo.file));
    const response_path = join(dir, "response", `${photo.species_code}.json`);
    const sink = {};
    let fetch_impl;
    if (mode === "replay") {
      const saved = readJson(response_path);
      if (!saved.is_recorded) is_constructed = true;
      fetch_impl = routeTo((req) => handleIdentify(req, "replay", replayUpstream(saved)));
    } else if (mode === "live-token") {
      fetch_impl = routeTo((req) => handleIdentify(req, token, recordingUpstream(sink)));
    } else {
      const base = url.replace(/\/$/, "");
      fetch_impl = routeTo((req) => globalThis.fetch(`${base}${IDENTIFY_PATH}`, { method: "POST", headers: req.headers, body: req.body, duplex: "half" }));
    }

    const state = await identifyPlant({ image, filename: photo.file.split("/").pop(), fetch: fetch_impl });
    if (state.status !== "ready" && state.status !== "empty") {
      blocker = state.status;
      log(`  ${photo.species_code.padEnd(9)} ✗ ${state.status}`);
      break;
    }
    const suggestion = state.status === "ready" ? state.suggestion : [];
    const top = suggestion[0] ?? null;
    const best = bestCampusMatch(suggestion);
    const top1 = exactPosition(suggestion, photo.species_code, 1) === 1;
    const position = exactPosition(suggestion, photo.species_code, 5);
    row.push({
      species_code: photo.species_code,
      top_name: top?.scientific_name ?? null,
      best_kind: best?.match.match_kind ?? null,
      is_top1: top1,
      is_top5: position !== null,
      position,
    });
    const mark = top1 ? "✓ top-1" : position ? `~ top-${position}` : "✗ miss ";
    log(
      `  ${photo.species_code.padEnd(9)} ${mark}  iNat #1: ${top?.scientific_name ?? "(none)"}` +
        (best ? `  → ${best.match.match_kind} ${best.match.species_code.join("/")}` : "  → no campus match"),
    );
    if (is_record && mode !== "replay" && sink.body) {
      writeFileSync(
        response_path,
        JSON.stringify(
          {
            is_recorded: true,
            provenance: `Recorded live from ${SCORE_IMAGE_URL} via the campus proxy on ${new Date().toISOString()}.`,
            status: sink.status,
            body: sink.body,
          },
          null,
          2,
        ) + "\n",
      );
    }
  }

  if (blocker) {
    log("");
    if (blocker === "token_expired") {
      log(`  COULD NOT RUN LIVE: iNaturalist refused the token (expired — they last 24 h).`);
      log(`  Get a fresh one at ${TOKEN_URL} and re-run with INAT_API_TOKEN set.`);
    } else if (blocker === "needs_token") {
      log("  COULD NOT RUN LIVE: the proxy has no INAT_API_TOKEN.");
    } else {
      log(`  COULD NOT RUN LIVE: ${blocker}.`);
    }
    return { mode, is_live: mode !== "replay", is_constructed, blocker, row, top1_rate: 0, top5_rate: 0, is_pass: false, exit_code: 2 };
  }

  const n = row.length || 1;
  const top1_rate = row.filter((r) => r.is_top1).length / n;
  const top5_rate = row.filter((r) => r.is_top5).length / n;
  const is_pass = top1_rate >= min_top1 && top5_rate >= min_top5;
  log("");
  log(`  top-1 exact ${row.filter((r) => r.is_top1).length}/${row.length} (${(top1_rate * 100).toFixed(0)}%, need ${min_top1 * 100}%)`);
  log(`  top-5 exact ${row.filter((r) => r.is_top5).length}/${row.length} (${(top5_rate * 100).toFixed(0)}%, need ${min_top5 * 100}%)`);
  if (mode === "replay") {
    log(
      is_constructed
        ? "  ^ REPLAY of CONSTRUCTED replies (hand-written order and scores). These numbers are NOT iNaturalist accuracy."
        : "  ^ REPLAY of RECORDED live replies. Not a fresh live run.",
    );
  }
  log(`  ${is_pass ? "PASS" : "FAIL"} (${mode})\n`);
  return { mode, is_live: mode !== "replay", is_constructed, blocker: null, row, top1_rate, top5_rate, is_pass, exit_code: is_pass ? 0 : 1 };
}

function flag(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--") ? process.argv[i + 1] : fallback;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const summary = await runSmoke({
    url: flag("url", null),
    token: process.env.INAT_API_TOKEN?.trim() || null,
    is_record: process.argv.includes("--record"),
    min_top1: Number(flag("min-top1", "0.6")),
    min_top5: Number(flag("min-top5", "0.8")),
  });
  process.exitCode = summary.exit_code;
}
