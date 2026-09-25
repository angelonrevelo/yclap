/**
 * LAN campus world — same HTTP + SSE + hall-socket contract as worker/sync.ts.
 *
 * node server/sync-server.mjs [--port 8788] [--db server/yclap-sync.db] [--account-db server/yclap-account.db]
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
 * Sec-Fetch-Site), and /live/pose answers with no CORS header.
 */
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { networkInterfaces } from "node:os";
import { pathToFileURL } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { isOwnPageReq, readJson, remoteIp, webRequestOf } from "./request.mjs";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const PORT = Number(arg("port", 8788));
const DB_PATH = resolve(process.cwd(), arg("db", "server/yclap-sync.json"));
mkdirSync(dirname(DB_PATH), { recursive: true });
const ACCOUNT_DB_PATH = resolve(process.cwd(), arg("account-db", "server/yclap-account.db"));

const { MemoryCampusStore, mergeSync, sanitizePlayer, sanitizeSighting, worldFrom } = await import(
  pathToFileURL(resolve(process.cwd(), "src/campus-world.ts")).href
);
const multiplayer = await import(pathToFileURL(resolve(process.cwd(), "src/multiplayer.ts")).href);
const { createHall } = await import("./hall.mjs");
const hall = createHall(multiplayer);

/* POST /inat/identify — the same proxy function the Worker runs. The token
   comes from this process's env (INAT_API_TOKEN), never from the bundle. */
const { handleIdentify, IDENTIFY_PATH, MAX_FORM_BYTE } = await import(
  pathToFileURL(resolve(process.cwd(), "worker/inat.ts")).href
);

/* The body streams through a byte cap: a chunked upload past it destroys the
   request instead of reaching formData(). */
async function serveIdentify(req, res) {
  const response = await handleIdentify(webRequestOf(req, MAX_FORM_BYTE), process.env.INAT_API_TOKEN);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
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
/** Largest account body buffered: a full save plus a little JSON around it. */
const ACCOUNT_BODY_MAX = SAVE_MAX_BYTE + 16 * 1024;
const account_db = new DatabaseSync(ACCOUNT_DB_PATH);
const account = new AccountService((query, ...bind) => account_db.prepare(query).all(...bind), {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
});

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
    const too_big = () => {
      res.writeHead(413, { "Content-Type": "application/json", Connection: "close" });
      res.end(JSON.stringify({ error: "body too large", max_byte: ACCOUNT_BODY_MAX }));
      req.resume();
    };
    if (Number(req.headers["content-length"]) > ACCOUNT_BODY_MAX) return too_big();
    const chunk = [];
    let byte = 0;
    for await (const c of req) {
      byte += c.length;
      if (byte > ACCOUNT_BODY_MAX) return too_big();
      chunk.push(c);
    }
    body = Buffer.concat(chunk);
  }
  const response = await account.handle(new Request(url, { method: req.method, headers, body }));
  const out = {};
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
  const chunk = `data: ${JSON.stringify(worldFrom(store))}\n\n`;
  for (const res of listener) {
    try {
      res.write(chunk);
    } catch {
      listener.delete(res);
    }
  }
}

/** A readJson failure as a response. A 413's request is already destroyed. */
function refuseBody(res, e) {
  if (res.destroyed || res.headersSent) return;
  const status = e?.status === 413 ? 413 : 400;
  res.writeHead(status, { "Content-Type": "application/json", Connection: "close" });
  res.end(JSON.stringify({ error: status === 413 ? "body too large" : "bad json" }));
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  if (isAccountPath(url.pathname)) {
    try {
      await serveAccount(req, res, url);
    } catch (e) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: String(e?.message ?? e) }));
    }
    return;
  }
  /* Same-origin like the Worker's: no CORS header on the iNat proxy. */
  if (url.pathname === IDENTIFY_PATH) {
    try {
      await serveIdentify(req, res);
    } catch {
      if (!res.headersSent) res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "upstream" }));
    }
    return;
  }
  /* Its own page only, and no CORS header — not even on the preflight. */
  if (url.pathname === "/live/pose") {
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    if (req.method === "POST") {
      if (!isOwnPageReq(req)) {
        res.writeHead(403, { "Content-Type": "application/json", Connection: "close" });
        res.end(JSON.stringify({ error: "this hall only takes poses from its own page" }));
        req.resume();
        return;
      }
      let body;
      try {
        body = await readJson(req);
      } catch (e) {
        refuseBody(res, e);
        return;
      }
      const { status, body: out } = hall.pose(body, remoteIp(req));
      res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
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
    res.end(JSON.stringify(worldFrom(store)));
    return;
  }

  if (req.method === "GET" && url.pathname === "/live/walker") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(hall.snapshot()));
    return;
  }

  if (req.method === "GET" && url.pathname === "/join") {
    const row = store.playerByJoin(url.searchParams.get("code") ?? "");
    if (!row) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "unknown join_code" }));
      return;
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ player_id: row.player_id, name: row.name, join_code: row.join_code }));
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
    res.write(`data: ${JSON.stringify(worldFrom(store))}\n\n`);
    req.on("close", () => listener.delete(res));
    return;
  }

  if (req.method === "POST" && url.pathname === "/sync") {
    let body;
    try {
      body = await readJson(req);
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
    persist();
    broadcast();
    hall.announce(fresh);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, merged, world: worldFrom(store) }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found", route: ["GET /world", "GET /live", "GET /live/socket", "POST /live/pose", "GET /live/walker", "GET /join", "GET /mine", "POST /sync", "/auth/*", "/account/save", "POST /inat/identify"] }));
});

server.on("upgrade", (req, socket) => {
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
  console.log(`  inat    POST /inat/identify · token ${process.env.INAT_API_TOKEN ? "set" : "MISSING (503 needs_token)"}`);
  console.log(`  hall    WS /live/socket · POST /live/pose · GET /live/walker`);
});
