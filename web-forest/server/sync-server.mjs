/**
 * LAN campus world — same HTTP + SSE + hall-socket contract as worker/sync.ts.
 *
 * node server/sync-server.mjs [--port 8788] [--db server/yclap-sync.db] [--account-db server/yclap-account.db]
 *
 * Reports and the moderator console (POST /report, /mod/api/*) run the SAME
 * ModerationService as the Worker (worker/moderation.ts), in the account
 * database; MOD_TOKEN in the environment (16+ characters) turns the console on.
 *
 * Accounts (/auth/*, /account/save) run the SAME AccountService as the Worker
 * (worker/account.ts), on node:sqlite instead of the Durable Object's SQLite.
 * Google sign-in is on only when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are
 * in the environment.
 *
 * Per-IP rate limits read CF-Connecting-IP, as on Cloudflare. Here that header
 * is always overwritten with the caller's address (server/request.mjs
 * remoteIp: the socket, or behind the Vite proxy the address it forwards), so
 * a LAN client cannot pick its own. Every body is capped as it streams; past
 * the cap the request is answered 413 or dropped, never buffered further.
 *
 * POST /live/pose and POST /inat/identify take their own page only (Origin /
 * Sec-Fetch-Site). "Own page" includes the same LAN hostname on another port
 * — the handset build on :4177 talking to this server on :8788 — and any
 * origin in HALL_PAGE_ORIGIN (comma-separated). /live/pose sends CORS headers
 * only to such a page on another origin (its own origin, never `*`), and its
 * preflight answers nobody else. /auth/*, /account/* and /inat/identify do the
 * same with Access-Control-Allow-Credentials: true (accountCorsOf), so a Path A
 * build on :4177 signs in here with its session cookie — same hostname, so
 * same-site, and SameSite=Lax still sends it; Secure only over https.
 */
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { networkInterfaces } from "node:os";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { isOwnPageReq, pageOrigin, readBody, readJson, remoteIp, webRequestOf } from "./request.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const PORT = Number(arg("port", 8788));
const DB_PATH = resolve(process.cwd(), arg("db", "server/yclap-sync.json"));
mkdirSync(dirname(DB_PATH), { recursive: true });
const ACCOUNT_DB_PATH = resolve(process.cwd(), arg("account-db", "server/yclap-account.db"));

const { CODE_MISS_MAX, CODE_MISS_WINDOW_MS, lookupByCode, MemoryCampusStore, mergeSync, sanitizePlayer, sanitizeSighting, hallDefaultOf, pruneCampus, retentionDayOf, weeklyActivity, worldFrom } = await import(
  pathToFileURL(resolve(process.cwd(), "src/campus-world.ts")).href
);
const multiplayer = await import(pathToFileURL(resolve(process.cwd(), "src/multiplayer.ts")).href);
const { createHall } = await import("./hall.mjs");

/* POST /inat/identify — the same proxy function the Worker runs. The token
   comes from this process's env (INAT_API_TOKEN), never from the bundle. */
const { handleIdentify, IDENTIFY_PATH, identifyKeyOf, MAX_FORM_BYTE } = await import(
  pathToFileURL(resolve(process.cwd(), "worker/inat.ts")).href
);

/* The body streams through a byte cap: a chunked upload past it destroys the
   request instead of reaching formData(). An early refusal (no token, foreign
   origin, rate limit) is answered only after the unread upload is drained —
   answering first reset the socket under the Vite proxy, which then showed a
   502 instead of the 503 needs_token caption (round 5). */
async function serveIdentify(req, res) {
  const web = webRequestOf(req, MAX_FORM_BYTE);
  const response = await handleIdentify(web, identifyKeyOf(process.env), undefined, undefined, pageOrigin);
  const body = Buffer.from(await response.arrayBuffer());
  const head = { ...Object.fromEntries(response.headers), ...corsOfReq(req) };
  const is_drained = response.status !== 413 && (await drainBody(web));
  if (!is_drained) {
    /* Oversized (declared or counted): 413 and close, as before — the rest of
       the upload is never read. */
    res.writeHead(response.status, { ...head, Connection: "close" });
    res.end(body, () => req.destroy());
    return;
  }
  res.writeHead(response.status, head);
  res.end(body);
}

/**
 * Read and discard whatever of the upload the handler left unread, through the
 * same MAX_FORM_BYTE cap and a time limit. True when the body ended cleanly;
 * false when it ran past the cap, stalled or broke — the caller then closes.
 */
async function drainBody(web, timeout_ms = 15000) {
  if (!web.body || web.bodyUsed) return true;
  const reader = web.body.getReader();
  let is_stalled = false;
  const timer = setTimeout(() => {
    is_stalled = true;
    reader.cancel().catch(() => {});
  }, timeout_ms);
  try {
    for (;;) {
      const { done } = await reader.read();
      if (done) return !is_stalled;
    }
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function loadStore() {
  try {
    return MemoryCampusStore.from(JSON.parse(readFileSync(DB_PATH, "utf8")));
  } catch {
    return new MemoryCampusStore();
  }
}

const { AccountService, isAccountPath } = await import(
  pathToFileURL(resolve(process.cwd(), "worker/account.ts")).href
);
const { SAVE_MAX_BYTE } = await import(pathToFileURL(resolve(process.cwd(), "src/account-core.ts")).href);
const { accountCorsOf, isAccountCorsPath, pageCorsOf, RateWindow } = await import(
  pathToFileURL(resolve(process.cwd(), "src/rate-limit.ts")).href
);
/** Wrong walker codes per address across /join and /partner — see `CODE_MISS_MAX`. */
const code_miss = new RateWindow(CODE_MISS_MAX, CODE_MISS_WINDOW_MS);
/** Largest account body buffered: a full save plus a little JSON around it. */
const ACCOUNT_BODY_MAX = SAVE_MAX_BYTE + 16 * 1024;
const account_db = new DatabaseSync(ACCOUNT_DB_PATH);
const account = new AccountService((query, ...bind) => account_db.prepare(query).all(...bind), {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
});

/* Reports, hides and the audit log — the SAME ModerationService as the
   Worker, in the account database. MOD_TOKEN (16+ characters) turns the
   console on; the hall asks it about every pose, so it exists first. */
const { ModerationService } = await import(pathToFileURL(resolve(process.cwd(), "worker/moderation.ts")).href);
const { REPORT_BODY_MAX } = await import(pathToFileURL(resolve(process.cwd(), "src/moderation.ts")).href);
const { safeNameOf, nameNoticeOf } = await import(pathToFileURL(resolve(process.cwd(), "src/name-filter.ts")).href);
const moderation = new ModerationService((query, ...bind) => account_db.prepare(query).all(...bind), {
  token: process.env.MOD_TOKEN,
});
const hall = createHall(multiplayer, pageOrigin, moderation);

/** The world as every phone sees it: what a moderator hid is filtered out. */
const worldOf = () => worldFrom(store, Date.now(), moderation.worldHide(), hallDefaultOf(process.env.HALL_DEFAULT));

/** POST /report and /mod/api/* → the shared handler, body byte-capped as it streams. */
async function serveModeration(req, res) {
  const web = webRequestOf(req, REPORT_BODY_MAX);
  const world = { recentFind: () => worldFrom(store).find, refresh: broadcast, activity: () => weeklyActivity(store) };
  const response = await moderation.handle(web, hall, world, pageOrigin);
  const head = Object.fromEntries(response.headers);
  res.writeHead(response.status, head);
  res.end(Buffer.from(await response.arrayBuffer()));
}

/** node req → WHATWG Request → AccountService → node res, cookies intact. */
async function serveAccount(req, res, url) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (key === "cf-connecting-ip") continue;
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else if (value != null) headers.set(key, value);
  }
  const ip = remoteIp(req);
  if (ip) headers.set("cf-connecting-ip", ip);
  let body;
  if (req.method !== "GET" && req.method !== "HEAD") {
    try {
      /* Past the cap readBody answers 413 itself, then drops the request. */
      body = await readBody(req, ACCOUNT_BODY_MAX, res);
    } catch (e) {
      refuseBody(res, e);
      return;
    }
  }
  const response = await account.handle(new Request(url, { method: req.method, headers, body }));
  const out = { ...corsOfReq(req) };
  response.headers.forEach((value, key) => {
    if (key !== "set-cookie") out[key] = value;
  });
  const set_cookie = response.headers.getSetCookie();
  if (set_cookie.length) out["set-cookie"] = set_cookie;
  res.writeHead(response.status, out);
  res.end(Buffer.from(await response.arrayBuffer()));
}

let store = loadStore();
const listener = new Set();

function persist() {
  writeFileSync(DB_PATH, JSON.stringify(store.toJSON()));
}

function broadcast() {
  const chunk = `data: ${JSON.stringify(worldOf())}\n\n`;
  for (const res of listener) {
    try {
      res.write(chunk);
    } catch {
      listener.delete(res);
    }
  }
}

/** A readJson failure as a response. A 413 given `res` is already answered. */
function refuseBody(res, e) {
  if (res.destroyed || res.headersSent) return;
  const status = e?.status === 413 ? 413 : 400;
  res.writeHead(status, { "Content-Type": "application/json", Connection: "close" });
  res.end(JSON.stringify({ error: status === 413 ? "body too large" : "bad json" }));
}

/** accountCorsOf for a node req: an allowed page on another origin, else {}. */
function corsOfReq(req) {
  return accountCorsOf(req.headers.origin ?? null, req.headers.host ?? "", pageOrigin);
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  if (multiplayer.isHallOff(process.env.WRITE_OFF) && multiplayer.isWriteRoute(req.method ?? "GET", url.pathname)) {
    res.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(multiplayer.WRITE_OFF_BODY));
    return;
  }
  /* A page on another origin (Path A: the build on :4177, this on :8788) signs
     in and identifies here. Its preflight gets its own origin + credentials;
     anyone else's gets nothing, so the browser refuses it. */
  if (req.method === "OPTIONS" && isAccountCorsPath(url.pathname)) {
    res.writeHead(204, corsOfReq(req)).end();
    return;
  }
  if (isAccountPath(url.pathname)) {
    try {
      await serveAccount(req, res, url);
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e?.message ?? e) }));
    }
    return;
  }
  if (url.pathname === "/report" || url.pathname.startsWith("/mod/api/")) {
    try {
      await serveModeration(req, res);
    } catch {
      if (!res.headersSent) res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "moderation failed" }));
    }
    return;
  }
  /* The Worker's rule: CORS only for an allowed page on another origin. */
  if (url.pathname === IDENTIFY_PATH) {
    try {
      await serveIdentify(req, res);
    } catch {
      if (!res.headersSent) res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "upstream" }));
    }
    return;
  }
  if (multiplayer.isHallOff(process.env.HALL_OFF) && multiplayer.HALL_POSITION_PATH.has(url.pathname)) {
    res.writeHead(503, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(multiplayer.HALL_OFF_BODY));
    return;
  }
  /* Its own page only. CORS headers go to an allowed page on another origin
     (another port of this LAN host, or HALL_PAGE_ORIGIN) and nobody else —
     not even on the preflight. */
  if (url.pathname === "/live/pose") {
    const page_cors = pageCorsOf(req.headers.origin ?? null, req.headers.host ?? "", pageOrigin);
    if (req.method === "OPTIONS") {
      res.writeHead(204, page_cors).end();
      return;
    }
    if (req.method === "POST") {
      if (!isOwnPageReq(req)) {
        res.writeHead(403, { "Content-Type": "application/json", Connection: "close" });
        /* Answer, then drop: resume() would keep reading whatever it sends. */
        res.end(JSON.stringify({ error: "this hall only takes poses from its own page" }), () => req.destroy());
        return;
      }
      let body;
      try {
        body = await readJson(req, undefined, res);
      } catch (e) {
        refuseBody(res, e);
        return;
      }
      const { status, body: out } = hall.pose(body, remoteIp(req));
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...page_cors });
      res.end(JSON.stringify(out));
      return;
    }
  }

  cors(res);

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/world")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(worldOf()));
    return;
  }

  if (req.method === "GET" && url.pathname === "/live/walker") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(hall.snapshot()));
    return;
  }

  if (req.method === "GET" && (url.pathname === "/join" || url.pathname === "/partner")) {
    const { status, body } = lookupByCode(store, url.pathname, url.searchParams.get("code") ?? "", remoteIp(req), code_miss);
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
    return;
  }

  if (req.method === "GET" && url.pathname === "/mine") {
    const sighting = store.sightingByPlayer(url.searchParams.get("player_id") ?? "");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ sighting }));
    return;
  }

  if (req.method === "GET" && url.pathname === "/live") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    listener.add(res);
    res.write(`data: ${JSON.stringify(worldOf())}\n\n`);
    req.on("close", () => listener.delete(res));
    return;
  }

  if (req.method === "POST" && url.pathname === "/sync") {
    let body;
    try {
      body = await readJson(req, undefined, res);
    } catch (e) {
      refuseBody(res, e);
      return;
    }
    const player = sanitizePlayer(body?.player ?? {});
    if (!player || !Array.isArray(body.sighting)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "player.player_id and sighting[] required" }));
      return;
    }
    const row = [];
    for (const raw of body.sighting) {
      const one = sanitizeSighting(raw ?? {}, player.player_id);
      if (one) row.push(one);
    }
    const fresh = multiplayer.freshFindOf(new Set(store.sighting.map((s) => s.sighting_id)), row, player);
    const { merged } = mergeSync(store, player, row);
    pruneCampus(store, Date.now(), retentionDayOf(process.env.RETENTION_DAY));
    persist();
    broadcast();
    hall.announce(fresh);
    /* sanitizePlayer already swapped a refused name; say so to this phone. */
    const { refusal } = safeNameOf(body.player?.name, player.player_id);
    const notice = refusal ? nameNoticeOf(refusal, player.name) : undefined;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, merged, world: worldOf(), ...(notice ? { notice } : {}) }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found", route: ["GET /world", "GET /live", "GET /live/socket", "POST /live/pose", "GET /live/walker", "GET /join", "GET /mine", "POST /sync", "/auth/*", "/account/save", "POST /inat/identify", "POST /report", "/mod/api/*"] }));
});

server.on("upgrade", (req, socket) => {
  /* HALL_OFF: refuse the socket too; the phone falls back to polling, gets 503 and shows no hall. */
  if (multiplayer.isHallOff(process.env.HALL_OFF)) {
    socket.destroy();
    return;
  }
  if (!hall.upgrade(req, socket)) socket.destroy();
});

server.listen(PORT, () => {
  const addr = Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === "IPv4" && !n.internal)
    .map((n) => `http://${n.address}:${PORT}`);
  console.log(`yclap sync server`);
  console.log(`  db      ${DB_PATH}`);
  console.log(`  local   http://localhost:${PORT}`);
  for (const a of addr) console.log(`  lan     ${a}`);
  console.log(`  world   GET /world · GET /live · POST /sync · GET /join · GET /mine`);
  console.log(`  account ${ACCOUNT_DB_PATH} · /auth/* · /account/save · google ${account.isGoogle ? "on" : "off"}`);
  {
  const key = identifyKeyOf(process.env);
  const via = key.plantnet ? "Pl@ntNet" : key.inat && key.is_inat_permitted ? "iNaturalist (permitted)" : null;
  console.log(`  identify POST /inat/identify · ${via ?? "no service (503 needs_token → the phone offers Seek)"}${key.inat && !key.is_inat_permitted ? " · INAT_API_TOKEN ignored without INAT_CV_PERMITTED=1" : ""}`);
}
  console.log(`  hall    WS /live/socket · POST /live/pose · GET /live/walker${multiplayer.isHallOff(process.env.HALL_OFF) ? " · OFF (HALL_OFF=1)" : ""}`);
  console.log(`  report  POST /report · console /mod/api/* ${moderation.isOn ? "on (MOD_TOKEN set)" : "OFF (no MOD_TOKEN)"}`);
  if (pageOrigin.length) console.log(`  pages   HALL_PAGE_ORIGIN ${pageOrigin.join(", ")}`);
});
