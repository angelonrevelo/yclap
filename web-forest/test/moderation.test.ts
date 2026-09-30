import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { DatabaseSync } from "node:sqlite";
import {
  EDGE_REPORT_IP_PER_HOUR,
  isModToken,
  modActorOf,
  modTokenList,
  MOD_FAIL_MAX,
  REPORT_IP_PER_HOUR,
  REPORT_OPEN_MAX,
  REPORT_RETENTION_MS,
  REPORT_TEXT_MAX,
  sanitizeModAction,
  sanitizeReport,
} from "../src/moderation.ts";
import { ModerationService, type ModHall, type ModWorld } from "../worker/moderation.ts";
import { AccountService, type SqlRun } from "../worker/account.ts";
import { LiveHall } from "../worker/live-socket.ts";
import { createHall } from "../server/hall.mjs";
import * as multiplayer from "../src/multiplayer.ts";
import { walkerIdOf } from "../src/multiplayer.ts";
import { MemoryCampusStore, mergeSync, sanitizePlayer, sanitizeSighting, worldFrom, type WorldFind } from "../src/campus-world.ts";
import { generatedNameOf } from "../src/name-filter.ts";
import { CAMPUS_CENTER } from "../src/geo.ts";
import { diagnosticOf, flushQueue, readQueue, sendReport, REPORT_QUEUE_KEY } from "../src/report.ts";

const TOKEN = "a-moderator-token-long-enough";
const SECRET_PLAYER = "player-secret-7f3a9c";

function sqlOf(): SqlRun {
  const db = new DatabaseSync(":memory:");
  return (query, ...bind) => db.prepare(query).all(...bind) as ReturnType<SqlRun>;
}

function modService(option: { token?: string; now?: () => number; report_ip_per_hour?: number } = {}) {
  const sql = sqlOf();
  return { sql, mod: new ModerationService(sql, { token: TOKEN, ...option }) };
}

const noHall: ModHall = { walkerNow: () => [], evict: () => {} };
const noWorld: ModWorld = { recentFind: () => [], refresh: () => {} };

function reportRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://magi.example/report", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function modRequest(path: string, token: string | null = TOKEN, body?: unknown, ip = "198.51.100.9"): Request {
  const headers: Record<string, string> = { "CF-Connecting-IP": ip };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return new Request(`https://magi.example${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const goodReport = {
  category: "stutter",
  severity: "major",
  text: "The map stutters when three walkers are on screen.",
  is_location_shared: false,
  diagnostic: {
    build_id: "abc1234.2026-10-01",
    user_agent: "Mozilla/5.0 (iPhone)",
    viewport: "390x844@3",
    fps: 41.2,
    p95_ms: 38,
    long_count: 7,
    hall_mode: "socket",
    geo_source: "play",
    route: "/",
    lat: CAMPUS_CENTER.lat,
    lon: CAMPUS_CENTER.lon,
  },
};

/* ── the report itself ─────────────────────────────────────────────────── */

describe("sanitizeReport", () => {
  it("keeps only the fields it names — a player_id sent along never survives", () => {
    const raw = {
      ...goodReport,
      player_id: SECRET_PLAYER,
      photo_data: "data:image/jpeg;base64,xxxx",
      diagnostic: { ...goodReport.diagnostic, player_id: SECRET_PLAYER, note: "my journal" },
    };
    const out = sanitizeReport(raw);
    assert.ok(out);
    assert.ok(!JSON.stringify(out).includes(SECRET_PLAYER));
    assert.ok(!JSON.stringify(out).includes("base64"));
    assert.ok(!JSON.stringify(out).includes("journal"));
  });

  it("drops the position unless the box was ticked, and rounds it and keeps it on campus when it was", () => {
    assert.equal(sanitizeReport(goodReport)?.diagnostic.lat, undefined);
    const lat = CAMPUS_CENTER.lat + 0.000012345;
    const lon = CAMPUS_CENTER.lon - 0.000067891;
    const shared = sanitizeReport({ ...goodReport, is_location_shared: true, diagnostic: { ...goodReport.diagnostic, lat, lon } });
    assert.equal(shared?.diagnostic.lat, Math.round(lat * 1e4) / 1e4, "rounded to 4 dp, ~11 m");
    assert.equal(shared?.diagnostic.lon, Math.round(lon * 1e4) / 1e4);
    const home = sanitizeReport({ ...goodReport, is_location_shared: "yes", diagnostic: { ...goodReport.diagnostic, lat: 14.55, lon: 121.02 } });
    assert.equal(home?.diagnostic.lat, undefined, "not `true`, so no position");
    const off = sanitizeReport({ ...goodReport, is_location_shared: true, diagnostic: { ...goodReport.diagnostic, lat: 14.55, lon: 121.02 } });
    assert.equal(off?.diagnostic.lat, undefined, "off campus is somebody's home");
  });

  it("caps the text, strips control characters, and needs words (or a walker for a name report)", () => {
    const long = sanitizeReport({ ...goodReport, text: `a\u0000b‮c${"x".repeat(5000)}` });
    assert.equal(long?.text.length, REPORT_TEXT_MAX);
    assert.ok(long?.text.startsWith("abc"));
    assert.equal(sanitizeReport({ ...goodReport, text: "  " }), null);
    assert.equal(sanitizeReport({ ...goodReport, category: "spam" }), null);
    assert.equal(sanitizeReport({ category: "name", severity: "major", text: "" }), null, "a name report needs a walker");
    const name = sanitizeReport({ category: "name", severity: "major", text: "", walker_id: walkerIdOf(SECRET_PLAYER), walker_name: "G4G0" });
    assert.equal(name?.walker_id, walkerIdOf(SECRET_PLAYER));
    assert.equal(sanitizeReport({ category: "name", text: "", walker_id: SECRET_PLAYER }), null, "a raw player_id is not a walker_id");
  });

  it("clamps diagnostics to known values", () => {
    const out = sanitizeReport({ ...goodReport, diagnostic: { build_id: "<script>", viewport: "huge", fps: 9999, hall_mode: "evil", geo_source: "satellite", route: "/admin" } });
    assert.deepEqual(
      { build_id: out?.diagnostic.build_id, viewport: out?.diagnostic.viewport, fps: out?.diagnostic.fps, hall_mode: out?.diagnostic.hall_mode, geo_source: out?.diagnostic.geo_source, route: out?.diagnostic.route },
      { build_id: "unknown", viewport: "", fps: 240, hall_mode: "off", geo_source: "none", route: "/" },
    );
  });
});

/* ── POST /report ──────────────────────────────────────────────────────── */

describe("POST /report", () => {
  it("files a report, and the console lists it newest-first with no player_id anywhere", async () => {
    let t = Date.parse("2026-10-15T01:00:00Z");
    const { mod } = modService({ now: () => t });
    const first = await mod.handle(reportRequest({ ...goodReport, player_id: SECRET_PLAYER }), noHall, noWorld);
    assert.equal(first?.status, 201);
    t += 1000;
    await mod.handle(reportRequest({ ...goodReport, text: "second one" }), noHall, noWorld);
    const res = await mod.handle(modRequest("/mod/api/state"), noHall, noWorld);
    const text = await res!.text();
    assert.ok(!text.includes(SECRET_PLAYER));
    const state = JSON.parse(text);
    assert.deepEqual(state.report.map((r: { text: string }) => r.text), ["second one", goodReport.text]);
    assert.equal(state.report[0].status, "open");
  });

  it("is rate-limited per IP, and counts only well-formed reports", async () => {
    const { mod } = modService();
    const ip = { "CF-Connecting-IP": "203.0.113.50" };
    for (let i = 0; i < 5; i++) assert.equal((await mod.handle(reportRequest({ category: "nope" }, ip), noHall, noWorld))?.status, 400);
    for (let i = 0; i < REPORT_IP_PER_HOUR; i++) assert.equal((await mod.handle(reportRequest(goodReport, ip), noHall, noWorld))?.status, 201);
    const blocked = await mod.handle(reportRequest(goodReport, ip), noHall, noWorld);
    assert.equal(blocked?.status, 429);
    assert.ok(Number(blocked?.headers.get("Retry-After")) > 0);
    assert.equal((await mod.handle(reportRequest(goodReport, { "CF-Connecting-IP": "203.0.113.51" }), noHall, noWorld))?.status, 201);
    assert.ok(EDGE_REPORT_IP_PER_HOUR > REPORT_IP_PER_HOUR, "a booth behind one public IP gets more");
  });

  it("refuses a foreign page, an oversized body, and bad JSON", async () => {
    const { mod } = modService();
    assert.equal((await mod.handle(reportRequest(goodReport, { Origin: "https://evil.example" }), noHall, noWorld))?.status, 403);
    assert.equal((await mod.handle(reportRequest(goodReport, { "Sec-Fetch-Site": "cross-site" }), noHall, noWorld))?.status, 403);
    assert.equal((await mod.handle(reportRequest({ ...goodReport, text: "x".repeat(20_000) }), noHall, noWorld))?.status, 413);
    assert.equal((await mod.handle(reportRequest("{nope"), noHall, noWorld))?.status, 400);
    const cors = await mod.handle(new Request("https://magi.example/report", { method: "OPTIONS", headers: { Origin: "https://evil.example" } }), noHall, noWorld);
    assert.equal(cors?.headers.get("Access-Control-Allow-Origin"), null, "no CORS for a foreign page");
  });

  it("prints the name the hall shows, not the reporter's copy", async () => {
    const { mod } = modService();
    const walker_id = walkerIdOf("p-rude");
    const hall: ModHall = { walkerNow: () => [{ walker_id, name: "Dao Walker 3", level: 2 }], evict: () => {} };
    await mod.handle(reportRequest({ category: "name", severity: "major", text: "", walker_id, walker_name: "anything at all" }), hall, noWorld);
    assert.equal(mod.listReport()[0].walker_name, "Dao Walker 3");
  });

  it("deletes reports past retention, and stops taking reports when the inbox is full", async () => {
    let t = Date.parse("2026-10-01T00:00:00Z");
    const { mod } = modService({ now: () => t });
    await mod.handle(reportRequest(goodReport), noHall, noWorld);
    t += REPORT_RETENTION_MS + 60_000;
    mod.sweep(true);
    assert.equal(mod.listReport().length, 0);
    const full = modService().mod;
    for (let i = 0; i < REPORT_OPEN_MAX; i++) full.addReport(sanitizeReport(goodReport)!);
    assert.equal((await full.handle(reportRequest(goodReport), noHall, noWorld))?.status, 503);
  });
});

/* ── the token ─────────────────────────────────────────────────────────── */

describe("the moderator token", () => {
  it("compares in constant time over digests, and is off when unset or short", async () => {
    assert.equal(await isModToken(TOKEN, TOKEN), true);
    assert.equal(await isModToken(`${TOKEN}x`, TOKEN), false);
    assert.equal(await isModToken("short", TOKEN), false, "a different length is just wrong, not an early exit");
    assert.equal(await isModToken(null, TOKEN), false);
    assert.equal(await isModToken("", ""), false, "no token configured: nothing matches");
    assert.equal(await isModToken("tiny", "tiny"), false, "a short token counts as not configured");
    assert.equal(await isModToken(TOKEN, undefined), false);
  });

  it("no MOD_TOKEN: the console answers 404 and says it is off", async () => {
    const mod = new ModerationService(sqlOf(), {});
    const res = await mod.handle(modRequest("/mod/api/state"), noHall, noWorld);
    assert.equal(res?.status, 404);
    assert.match(((await res!.json()) as { error: string }).error, /off/);
    assert.equal((await mod.handle(reportRequest(goodReport), noHall, noWorld))?.status, 201, "reports are still taken");
  });

  it("a wrong token is 401, and past MOD_FAIL_MAX the address waits", async () => {
    const { mod } = modService();
    for (let i = 0; i < MOD_FAIL_MAX; i++) assert.equal((await mod.handle(modRequest("/mod/api/state", "wrong-token-guess-00"), noHall, noWorld))?.status, 401);
    assert.equal((await mod.handle(modRequest("/mod/api/state", TOKEN), noHall, noWorld))?.status, 429, "even the right token waits now");
    assert.equal((await mod.handle(modRequest("/mod/api/state", TOKEN, undefined, "198.51.100.10"), noHall, noWorld))?.status, 200);
    assert.equal((await mod.handle(modRequest("/mod/api/state", null, undefined, "198.51.100.11"), noHall, noWorld))?.status, 401);
  });
});

/* ── actions and the audit log ─────────────────────────────────────────── */

describe("moderator actions", () => {
  it("validates what it is asked to do", () => {
    assert.equal(sanitizeModAction({ action: "hide_walker", target: walkerIdOf("x") }), null, "hide needs hours");
    assert.deepEqual(sanitizeModAction({ action: "hide_walker", target: walkerIdOf("x"), hour: 9999 })?.hour, 168);
    assert.equal(sanitizeModAction({ action: "hide_walker", target: "player-raw-id", hour: 1 }), null);
    assert.equal(sanitizeModAction({ action: "drop_table", target: "x" }), null);
    assert.ok(sanitizeModAction({ action: "hide_find", target: "s-123" }));
  });

  it("every action lands in an append-only audit log the database itself refuses to rewrite", async () => {
    const { mod, sql } = modService();
    const walker_id = walkerIdOf("p-audit");
    let evicted = "";
    const hall: ModHall = { walkerNow: () => [{ walker_id, name: "Ana", level: 3 }], evict: (id) => (evicted = id) };
    const res = await mod.handle(modRequest("/mod/api/action", TOKEN, { action: "hide_walker", target: walker_id, hour: 2 }), hall, noWorld);
    assert.equal(res?.status, 200);
    assert.equal(evicted, walker_id);
    await mod.handle(reportRequest(goodReport), hall, noWorld);
    const report_id = mod.listReport()[0].report_id;
    await mod.handle(modRequest("/mod/api/action", TOKEN, { action: "resolve_report", target: report_id }), hall, noWorld);
    await mod.handle(modRequest("/mod/api/action", TOKEN, { action: "hide_find", target: "s-1" }), hall, noWorld);
    const audit = mod.auditLog();
    assert.deepEqual(audit.map((a) => a.action), ["hide_find", "resolve_report", "hide_walker"]);
    assert.match(audit[2].detail, /2 h · Ana/);
    assert.equal(mod.listReport()[0].status, "resolved");
    assert.equal(mod.is_audit_guarded, true);
    assert.throws(() => sql("UPDATE mod_audit SET action = 'nothing'"), /append-only/);
    assert.throws(() => sql("DELETE FROM mod_audit"), /append-only/);
    assert.equal(mod.auditLog().length, 3);
    const missing = await mod.handle(modRequest("/mod/api/action", TOKEN, { action: "resolve_report", target: "rdoes-not-exist" }), hall, noWorld);
    assert.equal(missing?.status, 404);
    assert.equal(mod.auditLog().length, 3, "a failed action is not logged as done");
  });

  it("the console's finds are keyed by walker_id — the store's player_id stops at the server", async () => {
    const { mod } = modService();
    const store = new MemoryCampusStore();
    const player = sanitizePlayer({ player_id: SECRET_PLAYER, name: "Ana" })!;
    mergeSync(store, player, [sanitizeSighting({ sighting_id: "s-ana", species_code: "narra", common_name: "Narra", lat: CAMPUS_CENTER.lat, lon: CAMPUS_CENTER.lon }, SECRET_PLAYER)!]);
    const world: ModWorld = { recentFind: () => worldFrom(store).find, refresh: () => {} };
    await mod.handle(reportRequest({ ...goodReport, player_id: SECRET_PLAYER }), noHall, world);
    const text = await (await mod.handle(modRequest("/mod/api/state"), noHall, world))!.text();
    assert.ok(!text.includes(SECRET_PLAYER), "no player_id in the console payload");
    assert.equal(JSON.parse(text).find[0].walker_id, walkerIdOf(SECRET_PLAYER));
  });

  it("hiding a find, or its walker, takes it out of the world every phone reads — and unhiding puts it back", async () => {
    const { mod } = modService();
    const store = new MemoryCampusStore();
    mergeSync(store, sanitizePlayer({ player_id: "p-a", name: "Ana" })!, [
      sanitizeSighting({ sighting_id: "s-a", species_code: "narra", common_name: "Narra", lat: CAMPUS_CENTER.lat, lon: CAMPUS_CENTER.lon }, "p-a")!,
    ]);
    mergeSync(store, sanitizePlayer({ player_id: "p-b", name: "Ben" })!, [
      sanitizeSighting({ sighting_id: "s-b", species_code: "molave", common_name: "Molave", lat: CAMPUS_CENTER.lat, lon: CAMPUS_CENTER.lon }, "p-b")!,
    ]);
    let refreshed = 0;
    const world: ModWorld = { recentFind: () => worldFrom(store).find, refresh: () => (refreshed += 1) };
    const ids = () => worldFrom(store, Date.now(), mod.worldHide()).find.map((f) => f.sighting_id).sort();
    assert.deepEqual(ids(), ["s-a", "s-b"]);
    mod.act({ action: "hide_find", target: "s-a" }, noHall, world);
    assert.deepEqual(ids(), ["s-b"]);
    mod.act({ action: "hide_walker", target: walkerIdOf("p-b"), hour: 1 }, noHall, world);
    assert.deepEqual(ids(), []);
    assert.deepEqual(worldFrom(store, Date.now(), mod.worldHide()).walker.map((w) => w.name), ["Ana"], "a hidden walker is off the roster too");
    mod.act({ action: "unhide_find", target: "s-a" }, noHall, world);
    mod.act({ action: "unhide_walker", target: walkerIdOf("p-b") }, noHall, world);
    assert.deepEqual(ids(), ["s-a", "s-b"]);
    assert.equal(refreshed, 4, "every change re-broadcasts the world");
  });

  it("a hide survives a restart (it is in SQLite) and lifts on time", () => {
    let t = 1_000_000;
    const sql = sqlOf();
    const first = new ModerationService(sql, { token: TOKEN, now: () => t });
    first.act({ action: "hide_walker", target: walkerIdOf("p-x"), hour: 1 }, noHall, noWorld);
    const second = new ModerationService(sql, { token: TOKEN, now: () => t });
    assert.ok(second.hiddenUntil(walkerIdOf("p-x"), t));
    t += 60 * 60 * 1000 + 1;
    assert.equal(second.hiddenUntil(walkerIdOf("p-x"), t), null);
  });
});

/* ── the hide, enforced on both halls ──────────────────────────────────── */

class FakeSocket {
  sent: string[] = [];
  attachment: unknown = null;
  send(text: string) {
    this.sent.push(text);
  }
  close() {}
  serializeAttachment(value: unknown) {
    this.attachment = value;
  }
  deserializeAttachment() {
    return this.attachment;
  }
}

function workerHall(guard: multiplayer.HallGuard, socket_count = 2) {
  const socket = Array.from({ length: socket_count }, () => new FakeSocket());
  const tag = new Map<FakeSocket, string[]>(socket.map((s, i) => [s, [`sock-${i}`, `203.0.113.${i + 1}`]]));
  const ctx = {
    getWebSockets: () => socket,
    getTags: (ws: FakeSocket) => tag.get(ws) ?? [],
  } as unknown as DurableObjectState;
  return { hall: new LiveHall(ctx, (h) => new Headers(h), [], guard), socket };
}

const pose = (player_id: string, name = "Walker") => ({
  type: "pose",
  player_id,
  name,
  level: 2,
  stage: "egg",
  source: "play",
  lat: CAMPUS_CENTER.lat,
  lon: CAMPUS_CENTER.lon,
});

const typesOf = (s: { sent: string[] }) => s.sent.map((t) => JSON.parse(t) as { type: string; walker?: { name: string }; notice?: { kind: string; text: string } });

describe("a walker hidden by a moderator", () => {
  it("is refused by the Worker hall: off the roster, poses dropped, told once, finds not called out", async () => {
    const { mod } = modService();
    const { hall, socket } = workerHall(mod);
    const [rude, other] = socket;
    hall.message(rude as unknown as WebSocket, JSON.stringify(pose("p-rude")));
    assert.equal(typesOf(other).filter((m) => m.type === "pose").length, 1);
    mod.act({ action: "hide_walker", target: walkerIdOf("p-rude"), hour: 3 }, hall, noWorld);
    assert.equal(typesOf(other).at(-1)?.type, "gone", "everybody else is told they left");
    assert.ok(typesOf(rude).some((m) => m.notice?.kind === "hidden"), "the hidden phone is told why");
    assert.ok(!typesOf(other).some((m) => m.type === "notice"), "and only that phone");
    const before = other.sent.length;
    for (let i = 0; i < 3; i++) hall.message(rude as unknown as WebSocket, JSON.stringify({ ...pose("p-rude"), lat: CAMPUS_CENTER.lat + i * 1e-5 }));
    assert.equal(other.sent.length, before, "their poses reach nobody");
    assert.equal(typesOf(rude).filter((m) => m.type === "notice").length, 1, "told once, not every pose");
    const roster = hall.snapshot() as Extract<multiplayer.HallMessage, { type: "roster" }>;
    assert.equal(roster.walker.length, 0);
    const find: WorldFind = { sighting_id: "s-r", walker_id: walkerIdOf("p-rude"), player_name: "x", species_code: "narra", common_name: "Narra", lat: CAMPUS_CENTER.lat, lon: CAMPUS_CENTER.lon, entry_kind: "badge", created_at: new Date().toISOString() };
    hall.announce([find]);
    assert.equal(typesOf(other).filter((m) => m.type === "find").length, 0);
    const poll = await hall.handle(
      new Request("https://magi.example/live/pose", { method: "POST", body: JSON.stringify(pose("p-rude")), headers: { "CF-Connecting-IP": "203.0.113.9" } }),
      new URL("https://magi.example/live/pose"),
    );
    assert.equal(poll?.status, 403);
    assert.equal(((await poll!.json()) as { notice: { kind: string } }).notice.kind, "hidden");
  });

  it("is refused by the LAN hall the same way", () => {
    const { mod } = modService();
    const hall = createHall(multiplayer, [], mod);
    const rude = lanSocket(hall);
    const other = lanSocket(hall);
    rude.emit("data", maskedText(JSON.stringify(pose("p-rude"))));
    assert.ok(lanText(other).some((t) => t.includes('"type":"pose"')));
    mod.act({ action: "hide_walker", target: walkerIdOf("p-rude"), hour: 3 }, hall, noWorld);
    assert.ok(lanText(other).at(-1)?.includes('"type":"gone"'));
    assert.ok(lanText(rude).some((t) => t.includes('"kind":"hidden"')));
    assert.ok(!lanText(other).some((t) => t.includes('"type":"notice"')));
    other.written = [];
    rude.emit("data", maskedText(JSON.stringify({ ...pose("p-rude"), lat: CAMPUS_CENTER.lat + 2e-5 })));
    assert.equal(lanText(other).filter((t) => t.includes('"type":"pose"')).length, 0);
    assert.equal(hall.snapshot().walker.length, 0);
    const polled = hall.pose(pose("p-rude"), "192.168.1.40");
    assert.equal(polled.status, 403);
    assert.equal((polled.body as { notice: { kind: string } }).notice.kind, "hidden");
    mod.act({ action: "unhide_walker", target: walkerIdOf("p-rude") }, hall, noWorld);
    assert.equal(hall.pose(pose("p-rude"), "192.168.1.40").status, 200, "unhidden: back in");
  });
});

describe("a refused display name in the hall", () => {
  it("prints as the generated walker name on the Worker, and only its own phone is told", () => {
    const { hall, socket } = workerHall(null as unknown as multiplayer.HallGuard);
    const [rude, other] = socket;
    hall.message(rude as unknown as WebSocket, JSON.stringify(pose("p-name", "tang1na mo")));
    hall.message(rude as unknown as WebSocket, JSON.stringify({ ...pose("p-name", "tang1na mo"), lat: CAMPUS_CENTER.lat + 1e-5 }));
    const seen = typesOf(other).filter((m) => m.type === "pose");
    assert.equal(seen[0].walker?.name, generatedNameOf("p-name"));
    assert.ok(!other.sent.some((t) => t.includes("notice")), "nobody else hears about it");
    const told = typesOf(rude).filter((m) => m.type === "notice");
    assert.equal(told.length, 1, "told once, when the name first takes effect");
    assert.equal(told[0].notice?.kind, "name_refused");
  });

  it("prints as the generated walker name on the LAN box, polled too", () => {
    const hall = createHall(multiplayer);
    const out = hall.pose(pose("p-name", "G4G0"), "192.168.1.41");
    assert.equal(out.status, 200);
    const body = out.body as { walker: { name: string }[]; notice?: { kind: string } };
    assert.equal(body.walker[0].name, generatedNameOf("p-name"));
    assert.equal(body.notice?.kind, "name_refused");
    assert.equal((hall.pose(pose("p-ok", "Ana"), "192.168.1.42").body as { notice?: unknown }).notice, undefined);
  });

  it("an account's display name is filtered at signup, and the answer says why", async () => {
    const db = new DatabaseSync(":memory:");
    const svc = new AccountService((q, ...b) => db.prepare(q).all(...b) as ReturnType<SqlRun>, {});
    const res = await svc.handle(
      new Request("https://magi.example/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "ana.walker", password: "narra-tree-42", display_name: "Put@ngina" }),
      }),
    );
    assert.equal(res.status, 201);
    const body = (await res.json()) as { account: { display_name: string; account_code: string }; notice?: string };
    assert.equal(body.account.display_name, generatedNameOf(body.account.account_code));
    assert.match(body.notice ?? "", /swear/);
    const clean = await svc.handle(
      new Request("https://magi.example/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "ben.walker", password: "narra-tree-42", display_name: "Ben" }),
      }),
    );
    const clean_body = (await clean.json()) as { account: { display_name: string }; notice?: string };
    assert.equal(clean_body.account.display_name, "Ben");
    assert.equal(clean_body.notice, undefined);
  });
});

/* ── the phone's queue ─────────────────────────────────────────────────── */

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  } as Storage;
}

describe("the report queue on the phone", () => {
  const input = sanitizeReport(goodReport)! as unknown as Parameters<typeof sendReport>[0];

  it("holds a report while offline and sends it when the network is back", async () => {
    const storage = memoryStorage();
    const offline = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    assert.equal(await sendReport(input, { fetch: offline, url: "/report", storage }), "queued");
    assert.equal(readQueue(storage).length, 1);
    const posted: string[] = [];
    const online = (async (_url: RequestInfo | URL, init?: RequestInit) => {
      posted.push(String(init?.body));
      return new Response("{}", { status: 201 });
    }) as typeof fetch;
    assert.deepEqual(await flushQueue({ fetch: online, url: "/report", storage }), { sent: 1, left: 0 });
    assert.equal(storage.getItem(REPORT_QUEUE_KEY), null);
    assert.equal(posted.length, 1);
  });

  it("does not queue a report the server refused, and keeps one it throttled", async () => {
    const storage = memoryStorage();
    const status = (code: number) => (async () => new Response("{}", { status: code })) as typeof fetch;
    assert.equal(await sendReport(input, { fetch: status(400), url: "/report", storage }), "refused");
    assert.equal(readQueue(storage).length, 0);
    assert.equal(await sendReport(input, { fetch: status(429), url: "/report", storage }), "queued");
    assert.equal(readQueue(storage).length, 1);
  });

  it("attaches the position only when ticked, and never a player_id", () => {
    const ctx = { hall_mode: "socket" as const, geo_source: "gps" as const, fix: { lat: CAMPUS_CENTER.lat, lon: CAMPUS_CENTER.lon } };
    const env = { build_id: "abc", user_agent: "UA", width: 390, height: 844, dpr: 3, route: "/", frame: null };
    assert.equal(diagnosticOf(ctx, env, false).lat, undefined);
    assert.equal(diagnosticOf(ctx, env, true).lat, CAMPUS_CENTER.lat);
    assert.equal(diagnosticOf(ctx, env, false).geo_source, "gps", "the source is always there, the spot is not");
    assert.ok(!JSON.stringify(diagnosticOf(ctx, env, true)).includes("player"));
  });
});

/* ── LAN socket helpers (the same wire as test/harden.test.ts) ─────────── */

class RawSocket extends EventEmitter {
  written: Buffer[] = [];
  write(buf: Buffer | string) {
    this.written.push(Buffer.from(buf));
    return true;
  }
  end(buf?: string) {
    if (buf) this.written.push(Buffer.from(buf));
    this.emit("close");
  }
  setNoDelay() {}
}

function maskedText(text: string): Buffer {
  const mask = Buffer.from([1, 2, 3, 4]);
  const body = Buffer.from(text);
  for (let i = 0; i < body.length; i++) body[i] ^= mask[i % 4];
  const head = body.length < 126 ? Buffer.from([0x81, 0x80 | body.length]) : Buffer.from([0x81, 0x80 | 126, body.length >> 8, body.length & 0xff]);
  return Buffer.concat([head, mask, body]);
}

function lanSocket(hall: ReturnType<typeof createHall>): RawSocket {
  const raw = new RawSocket();
  const req = { url: "/live/socket", headers: { "sec-websocket-key": "dGhlIHNhbXBsZSBub25jZQ==", upgrade: "websocket" } };
  assert.equal(hall.upgrade(req, raw, null), true);
  return raw;
}

/** Server frames are unmasked text; the payload is everything after the header. */
function lanText(raw: RawSocket): string[] {
  return raw.written
    .filter((buf) => buf[0] === 0x81)
    .map((buf) => {
      const len = buf[1] & 0x7f;
      return Buffer.from(buf.subarray(len === 126 ? 4 : len === 127 ? 10 : 2)).toString("utf8");
    });
}

describe("one token per moderator (10-01)", () => {
  const ANA = "ana-token-long-enough-01";
  const BEN = "ben-token-long-enough-02";
  const LIST = `ana:${ANA}, ben:${BEN}, shorty:tiny`;

  it("reads a bare token as one moderator, and a list as one per person, dropping short tokens", () => {
    assert.deepEqual(modTokenList(TOKEN), [{ actor: "moderator", token: TOKEN }]);
    assert.deepEqual(modTokenList(LIST).map((m) => m.actor), ["ana", "ben"]);
    assert.deepEqual(modTokenList(""), []);
  });

  it("says which moderator a token belongs to, and nobody for a wrong one", async () => {
    assert.equal(await modActorOf(BEN, LIST), "ben");
    assert.equal(await modActorOf(ANA, LIST), "ana");
    assert.equal(await modActorOf("tiny", LIST), null, "a token too short to count opens nothing");
    assert.equal(await modActorOf(`${ANA}x`, LIST), null);
  });

  it("writes who acted into the audit log, and the console says who is signed in", async () => {
    const { mod } = modService({ token: LIST });
    const walker_id = walkerIdOf("p-rude");
    await mod.handle(modRequest("/mod/api/action", BEN, { action: "hide_walker", target: walker_id, hour: 1 }), noHall, noWorld);
    await mod.handle(modRequest("/mod/api/action", ANA, { action: "unhide_walker", target: walker_id }), noHall, noWorld);
    assert.deepEqual(mod.auditLog().map((a) => [a.actor, a.action]), [["ana", "unhide_walker"], ["ben", "hide_walker"]]);
    const res = await mod.handle(modRequest("/mod/api/state", ANA), noHall, noWorld);
    assert.equal(((await res!.json()) as { you: string }).you, "ana");
  });

  it("opens a store written before 10-01 and adds the actor column without touching a row", () => {
    const sql = sqlOf();
    sql("CREATE TABLE mod_audit (audit_id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '')");
    sql("INSERT INTO mod_audit (at, action, target) VALUES ('2026-09-30', 'hide_find', 's-1')");
    const mod = new ModerationService(sql, { token: TOKEN });
    assert.deepEqual(mod.auditLog().map((a) => [a.action, a.actor]), [["hide_find", ""]]);
    assert.throws(() => sql("UPDATE mod_audit SET actor = 'someone'"), /append-only/);
  });
});
