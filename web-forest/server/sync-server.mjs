/**
 * The central sync server — one SQLite database for the whole showcase.
 *
 * Owner ask (2026-09-08): "working multiplayer and centralized database sync".
 * This is deliberately the smallest honest version of that: a single Node
 * process with node:sqlite (no dependencies to install, nothing to containerise
 * the night before a demo) that owns every player's shared finds.
 *
 * What syncs UP: a player's journal rows, merged idempotently by sighting_id.
 * What comes DOWN: the world — other players' recent located finds, and who is
 * out there right now. There is no leaderboard table, no rank, no points
 * comparison: the standing rule survives the multiplayer feature.
 *
 * WHAT THIS IS NOT: an internet service. No auth (anyone on the LAN can post),
 * HTTP only, CORS open for the LAN demo. Fine for a hall; not for a launch.
 *
 * Usage:  node server/sync-server.mjs [--port 8788] [--db server/yclap-sync.db]
 * The DB file is gitignored; deleting it resets the world.
 */
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { networkInterfaces } from "node:os";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const PORT = Number(arg("port", 8788));
const DB_PATH = resolve(process.cwd(), arg("db", "server/yclap-sync.db"));
mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new DatabaseSync(DB_PATH);
db.exec(`
  CREATE TABLE IF NOT EXISTS player (
    player_id  TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    stage      TEXT NOT NULL DEFAULT 'egg',
    level      INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sighting (
    remote_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    sighting_id  TEXT NOT NULL UNIQUE,
    player_id    TEXT NOT NULL,
    species_code TEXT NOT NULL,
    common_name  TEXT NOT NULL DEFAULT '',
    lat          REAL,
    lon          REAL,
    entry_kind   TEXT NOT NULL DEFAULT 'badge',
    created_at   TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sighting_created ON sighting(created_at DESC);
`);

const now = () => new Date().toISOString();
const PRESENT_WINDOW_MS = 15 * 60 * 1000;

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

/** The world a player sees: recent located finds + who is out there. */
function worldPayload() {
  const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
  const find = db
    .prepare(
      `SELECT s.sighting_id, s.player_id, p.name AS player_name, s.species_code, s.common_name,
              s.lat, s.lon, s.entry_kind, s.created_at
         FROM sighting s JOIN player p ON p.player_id = s.player_id
        WHERE s.lat IS NOT NULL AND s.created_at > ?
        ORDER BY s.created_at DESC LIMIT 80`,
    )
    .all(since);
  const present_cut = new Date(Date.now() - PRESENT_WINDOW_MS).toISOString();
  const walker = db
    .prepare(
      `SELECT player_id, name, stage, level, updated_at FROM player WHERE updated_at > ? ORDER BY updated_at DESC`,
    )
    .all(present_cut);
  const totals = db
    .prepare(`SELECT COUNT(DISTINCT player_id) AS player_count, COUNT(*) AS sighting_count FROM sighting`)
    .get();
  return {
    server_time: now(),
    find,
    walker,
    totals,
    /* The honesty line, delivered with the data itself. */
    note: "Personal journals stay on each device. This server only holds shared finds — no rank, no points, no leaderboard.",
  };
}

const server = createServer(async (req, res) => {
  cors(res);
  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  if (req.method === "GET" && (url.pathname === "/health" || url.pathname === "/world")) {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(worldPayload()));
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
    const { player, sighting: rows } = body ?? {};
    if (!player?.player_id || !Array.isArray(rows)) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "player.player_id and sighting[] required" }));
      return;
    }

    db.prepare(
      `INSERT INTO player (player_id, name, stage, level, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(player_id) DO UPDATE SET name = excluded.name, stage = excluded.stage,
         level = excluded.level, updated_at = excluded.updated_at`,
    ).run(
      String(player.player_id).slice(0, 64),
      String(player.name ?? "Walker").slice(0, 40),
      String(player.stage ?? "egg"),
      Number.isFinite(player.level) ? Math.max(1, Math.trunc(player.level)) : 1,
      now(),
    );

    const insert = db.prepare(
      `INSERT INTO sighting (sighting_id, player_id, species_code, common_name, lat, lon, entry_kind, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(sighting_id) DO NOTHING`,
    );
    let merged = 0;
    const tx = db.prepare("BEGIN");
    tx.run();
    try {
      for (const row of rows.slice(0, 500)) {
        if (!row?.sighting_id || !row?.species_code) continue;
        const out = insert.run(
          String(row.sighting_id).slice(0, 80),
          String(player.player_id).slice(0, 64),
          String(row.species_code).slice(0, 64),
          String(row.common_name ?? "").slice(0, 80),
          Number.isFinite(row.lat) ? row.lat : null,
          Number.isFinite(row.lon) ? row.lon : null,
          row.entry_kind === "contribution" ? "contribution" : "badge",
          typeof row.created_at === "string" ? row.created_at : now(),
        );
        merged += out.changes;
      }
      db.prepare("COMMIT").run();
    } catch (e) {
      db.prepare("ROLLBACK").run();
      throw e;
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, merged, world: worldPayload() }));
    return;
  }

  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "not found", route: ["GET /world", "GET /health", "POST /sync"] }));
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
  console.log(`  world   GET /world · POST /sync`);
});
