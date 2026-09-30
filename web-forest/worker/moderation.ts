/**
 * Reports, the moderator console's API, the hall's hide list and the audit
 * log — the store behind `src/moderation.ts`'s rules.
 *
 * Same arrangement as worker/account.ts: SQL handed in as a `SqlRun`, so in
 * production it is the CampusWorld Durable Object's SQLite and on the LAN box
 * it is node:sqlite, and the tests drive it on node:sqlite.
 *
 * Routes:
 *   POST /report           { category, severity, text, is_location_shared, diagnostic, walker_id?, walker_name?, sighting_id? }
 *                           → 201 { ok, report_id } · 400 · 403 foreign page · 413 · 429 per IP · 503 store full
 *   GET  /mod/api/state    → reports newest-first, hidden walkers, hidden finds, walkers in the hall now,
 *                            recent shared finds, the last 200 audit rows
 *   POST /mod/api/action   { action, target, hour? } → { ok, state }
 *
 * /mod/api/* needs `Authorization: Bearer <MOD_TOKEN>`, compared in constant
 * time (`isModToken`). No MOD_TOKEN — or one under MOD_TOKEN_MIN characters —
 * and every /mod/api route answers 404 "the console is off": there is no
 * default password to forget to change. Wrong tokens are counted per IP and
 * answered 429 past MOD_FAIL_MAX in fifteen minutes.
 *
 * Nothing personal leaves through the console beyond a display name: reports
 * never held a player_id (`sanitizeReport`), walkers are listed by `walker_id`,
 * and a shared find is shown by its walker_id, never the player_id the store
 * keys it by.
 *
 * The audit log is append-only twice over: this class has no path that
 * updates or deletes a row, and SQLite triggers abort any UPDATE or DELETE on
 * `mod_audit` that some future code might try.
 */
import type { WorldFind, WorldHide } from "../src/campus-world.ts";
import { walkerIdOf } from "../src/multiplayer.ts";
import {
  bearerOf,
  isModOn,
  isModToken,
  MOD_FAIL_MAX,
  MOD_FAIL_WINDOW_MS,
  REPORT_BODY_MAX,
  REPORT_IP_PER_HOUR,
  REPORT_OPEN_MAX,
  REPORT_RETENTION_DAY,
  REPORT_RETENTION_MS,
  REPORT_WINDOW_MS,
  sanitizeModAction,
  sanitizeReport,
  type ModActionInput,
  type Report,
  type ReportDiagnostic,
} from "../src/moderation.ts";
import { RateWindow, clientIp, isOwnPage, mimeEssence, pageCorsOf } from "../src/rate-limit.ts";
import type { SqlRow, SqlRun } from "./account.ts";

export const REPORT_PATH = "/report";
export const MOD_API_PREFIX = "/mod/api/";

export function isModPath(pathname: string): boolean {
  return pathname === REPORT_PATH || pathname.startsWith(MOD_API_PREFIX);
}

/** How often expired reports and lifted hides are swept. */
const SWEEP_MS = 60 * 60 * 1000;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS report (
    report_id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    category TEXT NOT NULL,
    severity TEXT NOT NULL,
    text TEXT NOT NULL,
    diagnostic_json TEXT NOT NULL,
    walker_id TEXT,
    walker_name TEXT,
    sighting_id TEXT,
    status TEXT NOT NULL DEFAULT 'open',
    resolved_at TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS report_created_at ON report (created_at)`,
  `CREATE TABLE IF NOT EXISTS hall_hide (
    walker_id TEXT PRIMARY KEY,
    walker_name TEXT,
    until_at INTEGER NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS find_hide (
    sighting_id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS mod_audit (
    audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    detail TEXT NOT NULL DEFAULT ''
  )`,
];

/** Belt to the code's braces: the database itself refuses to rewrite history. */
const AUDIT_GUARD = [
  `CREATE TRIGGER IF NOT EXISTS mod_audit_no_update BEFORE UPDATE ON mod_audit
   BEGIN SELECT RAISE(ABORT, 'mod_audit is append-only'); END`,
  `CREATE TRIGGER IF NOT EXISTS mod_audit_no_delete BEFORE DELETE ON mod_audit
   BEGIN SELECT RAISE(ABORT, 'mod_audit is append-only'); END`,
];

export interface AuditRow {
  audit_id: number;
  at: string;
  action: string;
  target: string;
  detail: string;
}

/** The hall, as the console needs it: who is in it now, and a way to remove one. */
export interface ModHall {
  walkerNow(): { walker_id: string; name: string; level: number }[];
  evict(walker_id: string, until: number): void;
}

/** The shared world, as the console needs it: recent finds UNFILTERED, and a re-broadcast. */
export interface ModWorld {
  recentFind(): WorldFind[];
  refresh(): void;
}

/** A find as the console shows it: `walker_id`, never the store's player_id. */
export interface ModFind {
  sighting_id: string;
  walker_id: string;
  player_name: string;
  species_code: string;
  common_name: string;
  created_at: string;
  is_hidden: boolean;
}

export interface ModState {
  retention_day: number;
  report: Report[];
  hidden_walker: { walker_id: string; walker_name: string | null; until_at: number }[];
  hidden_find: { sighting_id: string; created_at: string }[];
  walker: { walker_id: string; name: string; level: number }[];
  find: ModFind[];
  audit: AuditRow[];
}

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });
}

function reportOf(row: SqlRow): Report {
  let diagnostic: ReportDiagnostic;
  try {
    diagnostic = JSON.parse(String(row.diagnostic_json)) as ReportDiagnostic;
  } catch {
    diagnostic = {} as ReportDiagnostic;
  }
  return {
    report_id: String(row.report_id),
    created_at: String(row.created_at),
    category: String(row.category) as Report["category"],
    severity: String(row.severity) as Report["severity"],
    text: String(row.text),
    diagnostic,
    walker_id: row.walker_id === null ? null : String(row.walker_id),
    walker_name: row.walker_name === null ? null : String(row.walker_name),
    sighting_id: row.sighting_id === null ? null : String(row.sighting_id),
    status: row.status === "resolved" ? "resolved" : "open",
    resolved_at: row.resolved_at === null ? null : String(row.resolved_at),
  };
}

export class ModerationService {
  sql: SqlRun;
  token: string | undefined;
  now: () => number;
  report_limit: RateWindow;
  fail_limit: RateWindow = new RateWindow(MOD_FAIL_MAX, MOD_FAIL_WINDOW_MS);
  /** walker_id → until (ms), read on every pose, so kept in memory and written through. */
  hidden_walker: Map<string, number> = new Map();
  hidden_find: Set<string> = new Set();
  swept_at = 0;
  /** False when this SQLite would not take the triggers; the code path alone then holds the line. */
  is_audit_guarded = true;

  constructor(
    sql: SqlRun,
    option: { token?: string; report_ip_per_hour?: number; now?: () => number } = {},
  ) {
    this.sql = sql;
    this.token = option.token;
    this.now = option.now ?? Date.now;
    this.report_limit = new RateWindow(option.report_ip_per_hour ?? REPORT_IP_PER_HOUR, REPORT_WINDOW_MS);
    for (const statement of SCHEMA) this.sql(statement);
    for (const statement of AUDIT_GUARD) {
      try {
        this.sql(statement);
      } catch {
        this.is_audit_guarded = false;
      }
    }
    for (const row of this.sql("SELECT walker_id, until_at FROM hall_hide")) {
      this.hidden_walker.set(String(row.walker_id), Number(row.until_at));
    }
    for (const row of this.sql("SELECT sighting_id FROM find_hide")) this.hidden_find.add(String(row.sighting_id));
  }

  get isOn(): boolean {
    return isModOn(this.token);
  }

  stamp(): string {
    return new Date(this.now()).toISOString();
  }

  /* ── what the hall and the world ask, on every pose and every broadcast ── */

  /** When the hide on this walker lifts (ms), or null when they are not hidden. */
  hiddenUntil(walker_id: string, now: number = this.now()): number | null {
    const until = this.hidden_walker.get(walker_id);
    if (until === undefined) return null;
    if (until > now) return until;
    this.hidden_walker.delete(walker_id);
    return null;
  }

  isFindHidden(sighting_id: string): boolean {
    return this.hidden_find.has(sighting_id);
  }

  /**
   * The filter for `worldFrom`: a hidden find, and every find and the roster
   * row of a walker hidden from the hall — their name would otherwise still
   * print in "… logged Molave" and on the leaderboard.
   */
  worldHide(): WorldHide {
    const now = this.now();
    if (!this.hidden_find.size && !this.hidden_walker.size) return {};
    return {
      sighting: (row) => this.hidden_find.has(row.sighting_id) || this.hiddenUntil(walkerIdOf(row.player_id), now) !== null,
      player: (player_id) => this.hiddenUntil(walkerIdOf(player_id), now) !== null,
    };
  }

  /* ── reports ─────────────────────────────────────────────────────────── */

  /** Delete reports past retention and hides that have lifted, at most hourly. */
  sweep(is_forced = false): void {
    const now = this.now();
    if (!is_forced && now - this.swept_at < SWEEP_MS) return;
    this.swept_at = now;
    /* Every created_at is a toISOString(), so text order is time order. */
    this.sql("DELETE FROM report WHERE created_at < ?", new Date(now - REPORT_RETENTION_MS).toISOString());
    this.sql("DELETE FROM hall_hide WHERE until_at <= ?", now);
    for (const [id, until] of this.hidden_walker) if (until <= now) this.hidden_walker.delete(id);
  }

  openCount(): number {
    return Number(this.sql("SELECT COUNT(*) AS n FROM report WHERE status = 'open'")[0]?.n ?? 0);
  }

  addReport(input: NonNullable<ReturnType<typeof sanitizeReport>>): Report {
    const report_id = `r${crypto.randomUUID()}`;
    const created_at = this.stamp();
    this.sql(
      `INSERT INTO report (report_id, created_at, category, severity, text, diagnostic_json, walker_id, walker_name, sighting_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
      report_id,
      created_at,
      input.category,
      input.severity,
      input.text,
      JSON.stringify(input.diagnostic),
      input.walker_id,
      input.walker_name,
      input.sighting_id,
    );
    return { ...input, report_id, created_at, status: "open", resolved_at: null };
  }

  listReport(limit = 500): Report[] {
    return this.sql("SELECT * FROM report ORDER BY created_at DESC, report_id DESC LIMIT ?", limit).map(reportOf);
  }

  /* ── the audit log ───────────────────────────────────────────────────── */

  /** The ONLY write to mod_audit. There is no update and no delete. */
  audit(action: string, target: string, detail = ""): void {
    this.sql("INSERT INTO mod_audit (at, action, target, detail) VALUES (?, ?, ?, ?)", this.stamp(), action, target, detail);
  }

  auditLog(limit = 200): AuditRow[] {
    return this.sql("SELECT * FROM mod_audit ORDER BY audit_id DESC LIMIT ?", limit).map((row) => ({
      audit_id: Number(row.audit_id),
      at: String(row.at),
      action: String(row.action),
      target: String(row.target),
      detail: String(row.detail ?? ""),
    }));
  }

  /* ── actions ─────────────────────────────────────────────────────────── */

  act(input: ModActionInput, hall: ModHall, world: ModWorld): { ok: boolean; error?: string } {
    const now = this.now();
    const { action, target } = input;
    if (action === "hide_walker") {
      const until = now + (input.hour ?? 1) * 60 * 60 * 1000;
      const walker_name = hall.walkerNow().find((w) => w.walker_id === target)?.name ?? this.nameReported(target);
      this.sql(
        `INSERT INTO hall_hide (walker_id, walker_name, until_at, created_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (walker_id) DO UPDATE SET until_at = excluded.until_at, walker_name = excluded.walker_name`,
        target,
        walker_name,
        until,
        this.stamp(),
      );
      this.hidden_walker.set(target, until);
      hall.evict(target, until);
      world.refresh();
      this.audit(action, target, `${input.hour} h${walker_name ? ` · ${walker_name}` : ""}`);
      return { ok: true };
    }
    if (action === "unhide_walker") {
      this.sql("DELETE FROM hall_hide WHERE walker_id = ?", target);
      this.hidden_walker.delete(target);
      world.refresh();
      this.audit(action, target);
      return { ok: true };
    }
    if (action === "hide_find") {
      this.sql("INSERT INTO find_hide (sighting_id, created_at) VALUES (?, ?) ON CONFLICT (sighting_id) DO NOTHING", target, this.stamp());
      this.hidden_find.add(target);
      world.refresh();
      this.audit(action, target);
      return { ok: true };
    }
    if (action === "unhide_find") {
      this.sql("DELETE FROM find_hide WHERE sighting_id = ?", target);
      this.hidden_find.delete(target);
      world.refresh();
      this.audit(action, target);
      return { ok: true };
    }
    const is_resolve = action === "resolve_report";
    const changed = this.sql(
      "UPDATE report SET status = ?, resolved_at = ? WHERE report_id = ? RETURNING report_id",
      is_resolve ? "resolved" : "open",
      is_resolve ? this.stamp() : null,
      target,
    );
    if (!changed.length) return { ok: false, error: "no such report" };
    this.audit(action, target);
    return { ok: true };
  }

  /** The name a walker was reported under, for a hide issued after they left. */
  nameReported(walker_id: string): string | null {
    const row = this.sql(
      "SELECT walker_name FROM report WHERE walker_id = ? AND walker_name IS NOT NULL ORDER BY created_at DESC LIMIT 1",
      walker_id,
    )[0];
    return row ? String(row.walker_name) : null;
  }

  state(hall: ModHall, world: ModWorld): ModState {
    this.sweep();
    const now = this.now();
    return {
      retention_day: REPORT_RETENTION_DAY,
      report: this.listReport(),
      hidden_walker: this.sql("SELECT walker_id, walker_name, until_at FROM hall_hide WHERE until_at > ? ORDER BY until_at DESC", now).map(
        (row) => ({
          walker_id: String(row.walker_id),
          walker_name: row.walker_name === null ? null : String(row.walker_name),
          until_at: Number(row.until_at),
        }),
      ),
      hidden_find: this.sql("SELECT sighting_id, created_at FROM find_hide ORDER BY created_at DESC").map((row) => ({
        sighting_id: String(row.sighting_id),
        created_at: String(row.created_at),
      })),
      walker: hall.walkerNow().map(({ walker_id, name, level }) => ({ walker_id, name, level })),
      /* The world payload is already keyed by walker_id (`worldFrom`); the
         store's player_id never reaches it. */
      find: world.recentFind().map((f) => ({
        sighting_id: f.sighting_id,
        walker_id: f.walker_id,
        player_name: f.player_name,
        species_code: f.species_code,
        common_name: f.common_name,
        created_at: f.created_at,
        is_hidden: this.hidden_find.has(f.sighting_id),
      })),
      audit: this.auditLog(),
    };
  }

  /* ── HTTP ────────────────────────────────────────────────────────────── */

  /**
   * POST /report and /mod/api/*; null when the path is neither. `page_origin`
   * is HALL_PAGE_ORIGIN — /report answers the same pages /live/pose does.
   */
  async handle(request: Request, hall: ModHall, world: ModWorld, page_origin: readonly string[] = []): Promise<Response | null> {
    const url = new URL(request.url);
    if (!isModPath(url.pathname)) return null;
    if (url.pathname === REPORT_PATH) return this.handleReport(request, url, hall, page_origin);

    /* The console: same origin only, so no CORS header on anything, ever. */
    if (!this.isOn) return json({ error: "the moderator console is off — set MOD_TOKEN (16+ characters) to turn it on" }, 404);
    const ip = clientIp(request) ?? "local";
    const now = this.now();
    if (this.fail_limit.retryAfter(ip, now) > 0) {
      return json({ error: "too many wrong tokens — wait fifteen minutes" }, 429, { "Retry-After": "900" });
    }
    if (!(await isModToken(bearerOf(request.headers.get("Authorization")), this.token))) {
      this.fail_limit.note(ip, now);
      return json({ error: "wrong or missing moderator token" }, 401);
    }

    if (request.method === "GET" && url.pathname === `${MOD_API_PREFIX}state`) {
      return json(this.state(hall, world));
    }
    if (request.method === "POST" && url.pathname === `${MOD_API_PREFIX}action`) {
      if (mimeEssence(request.headers.get("Content-Type")) !== "application/json") return json({ error: "send JSON" }, 400);
      let raw: unknown;
      try {
        raw = JSON.parse((await request.text()).slice(0, 4_000));
      } catch {
        return json({ error: "bad json" }, 400);
      }
      const input = sanitizeModAction(raw);
      if (!input) return json({ error: "action, target (and hour for hide_walker) required" }, 400);
      const result = this.act(input, hall, world);
      if (!result.ok) return json({ error: result.error }, 404);
      return json({ ok: true, state: this.state(hall, world) });
    }
    return json({ error: "not found" }, 404);
  }

  async handleReport(request: Request, url: URL, hall: ModHall, page_origin: readonly string[]): Promise<Response> {
    const cors = pageCorsOf(request.headers.get("Origin"), url.host, page_origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ error: "POST a report" }, 405, cors);
    if (!isOwnPage(request, url.host, page_origin)) return json({ error: "reports come from this app's own page" }, 403);
    const declared = Number(request.headers.get("Content-Length"));
    if (Number.isFinite(declared) && declared > 0 && declared > REPORT_BODY_MAX) {
      return json({ error: "report too large", max_byte: REPORT_BODY_MAX }, 413, cors);
    }
    let text: string;
    try {
      text = await request.text();
    } catch {
      return json({ error: "report too large", max_byte: REPORT_BODY_MAX }, 413, cors);
    }
    if (text.length > REPORT_BODY_MAX) return json({ error: "report too large", max_byte: REPORT_BODY_MAX }, 413, cors);
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      return json({ error: "bad json" }, 400, cors);
    }
    const input = sanitizeReport(raw);
    if (!input) return json({ error: "a category, and a few words (or a walker_id for a name report)" }, 400, cors);
    const ip = clientIp(request);
    const now = this.now();
    /* Counted only once the report is well-formed, so a broken client cannot
       burn a booth's allowance on 400s. */
    const wait = ip ? this.report_limit.take(ip, now) : 0;
    if (wait > 0) {
      const retry_after_s = Math.ceil(wait / 1000);
      return json({ error: "too many reports from this network — try again later", retry_after_s }, 429, {
        ...cors,
        "Retry-After": String(retry_after_s),
      });
    }
    this.sweep();
    if (this.openCount() >= REPORT_OPEN_MAX) {
      if (ip) this.report_limit.refund(ip);
      return json({ error: "the report inbox is full — a moderator has to clear it" }, 503, cors);
    }
    /* A name report prints the name the HALL shows, when that walker is in it:
       the reporter's copy could be anything. */
    if (input.walker_id) {
      const live = hall.walkerNow().find((w) => w.walker_id === input.walker_id);
      if (live) input.walker_name = live.name;
    }
    const report = this.addReport(input);
    return json({ ok: true, report_id: report.report_id }, 201, cors);
  }
}
