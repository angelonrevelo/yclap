/**
 * LAN campus world — same HTTP + SSE contract as worker/sync.ts.
 *
 * node server/sync-server.mjs [--port 8788] [--db server/yclap-sync.db]
 */
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { networkInterfaces } from "node:os";
import { pathToFileURL } from "node:url";
import { Readable } from "node:stream";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const PORT = Number(arg("port", 8788));
const DB_PATH = resolve(process.cwd(), arg("db", "server/yclap-sync.json"));
mkdirSync(dirname(DB_PATH), { recursive: true });

const { MemoryCampusStore, mergeSync, sanitizePlayer, sanitizeSighting, worldFrom } = await import(
  pathToFileURL(resolve(process.cwd(), "src/campus-world.ts")).href
);

/* POST /inat/identify — the same proxy function the Worker runs. The token
   comes from this process's env (INAT_API_TOKEN), never from the bundle. */
const { handleIdentify, IDENTIFY_PATH } = await import(
  pathToFileURL(resolve(process.cwd(), "worker/inat.ts")).href
);

async function serveIdentify(req, res) {
  const request = new Request(`http://local${req.url}`, {
    method: req.method,
    headers: Object.entries(req.headers).flatMap(([k, v]) => (v === undefined ? [] : [[k, String(v)]])),
    body: req.method === "POST" ? Readable.toWeb(req) : undefined,
    duplex: "half",
  });
  const response = await handleIdentify(request, process.env.INAT_API_TOKEN);
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

function readJson(req) {
  return new Promise((resolve_json, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) reject(new Error("body too large"));
    });
    req.on("end", () => {
      try {
        resolve_json(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

const server = createServer(async (req, res) => {
  cors(res);
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname === IDENTIFY_PATH) {
    try {
      await serveIdentify(req, res);
    } catch {
      if (!res.headersSent) res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "upstream" }));
    }
    return;
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/world")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(worldFrom(store)));
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
    } catch {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "bad json" }));
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
    const { merged } = mergeSync(store, player, row);
    persist();
    broadcast();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, merged, world: worldFrom(store) }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found", route: ["GET /world", "GET /live", "GET /join", "GET /mine", "POST /sync", "POST /inat/identify"] }));
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
  console.log(`  inat    POST /inat/identify · token ${process.env.INAT_API_TOKEN ? "set" : "MISSING (503 needs_token)"}`);
});
