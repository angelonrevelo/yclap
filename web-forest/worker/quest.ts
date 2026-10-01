/**
 * SEEDS challenges, server side: the organiser's console API and the claim
 * judge. The rules live in `src/quest.ts`; this is the store and the routes.
 *
 * Same arrangement as worker/moderation.ts: SQL handed in as a `SqlRun`, so in
 * production it is the CampusWorld Durable Object's SQLite and on the LAN box
 * it is node:sqlite, and the tests drive it on node:sqlite.
 *
 * Routes:
 *   GET  /quest?player_id=&class=A,B   → open challenges for everyone and those
 *                                         classes (no secrets), this player's
 *                                         claims, and their verified points
 *   POST /quest/claim                   → { verdict, claim? }   201 accepted/review · 200 refused · 409 already · 429
 *   GET  /seeds/api/state               → every challenge with its site secret, claims, strikes, audit
 *   POST /seeds/api/action              { action: create|close|approve|void|lift_strike, … }
 *
 * /seeds/api/* needs `Authorization: Bearer <SEEDS_TOKEN>` — the same token
 * rules as the moderator console (`modTokenList`: one token or
 * `name:token,…`, 16+ characters, constant-time compare, 10 wrong tries per
 * 15 min per address). No SEEDS_TOKEN: the console answers 404.
 *
 * What makes it hard to cheat is in `src/quest.ts`; what this file adds:
 *   - the server's clock, never the phone's, stamps every claim;
 *   - one claim per player per challenge (UNIQUE), and per account when the
 *     student is signed in — so a second walker name on the same account
 *     cannot claim twice;
 *   - the site code is checked against a secret that never leaves the server
 *     except to an organiser, and wrong codes lock a player out of that
 *     challenge for ten minutes after SITE_CODE_MISS_MAX;
 *   - the player's previous claim feeds the teleport check;
 *   - a voided claim is a strike, and STRIKE_REVIEW_AT strikes send every
 *     later claim from that player to a person;
 *   - every organiser action lands in an append-only audit log.
 */
import { walkerIdOf } from "../src/multiplayer.ts";
import { bearerOf, isModOn, MOD_FAIL_MAX, MOD_FAIL_WINDOW_MS, modActorOf } from "../src/moderation.ts";
import {
  isClassCode,
  isQuestCode,
  isSiteCode,
  judgeClaim,
  sanitizeClaim,
  sanitizeQuestDraft,
  SITE_CODE_MISS_MAX,
  type Quest,
  type QuestVerdict,
} from "../src/quest.ts";
import { clientIp, isOwnPage, mimeEssence, RateWindow } from "../src/rate-limit.ts";
import type { SqlRow, SqlRun } from "./account.ts";

export const QUEST_PATH = "/quest";
export const QUEST_CLAIM_PATH = "/quest/claim";
export const SEEDS_API_PREFIX = "/seeds/api/";
export const QUEST_BODY_MAX = 16 * 1024;

export function isQuestPath(pathname: string): boolean {
  return pathname === QUEST_PATH || pathname === QUEST_CLAIM_PATH || pathname.startsWith(SEEDS_API_PREFIX);
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS quest (
    quest_code TEXT PRIMARY KEY,
    body TEXT NOT NULL,
    secret TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS quest_claim (
    claim_id TEXT PRIMARY KEY,
    quest_code TEXT NOT NULL,
    player_id TEXT NOT NULL,
    walker_id TEXT NOT NULL,
    account_code TEXT,
    display_name TEXT NOT NULL,
    status TEXT NOT NULL,
    reason TEXT NOT NULL,
    species_code TEXT,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    accuracy_m REAL NOT NULL,
    point INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    decided_by TEXT,
    decided_at TEXT,
    UNIQUE (quest_code, player_id)
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS quest_claim_account ON quest_claim (quest_code, account_code) WHERE account_code IS NOT NULL`,
  `CREATE TABLE IF NOT EXISTS quest_strike (
    player_id TEXT NOT NULL,
    claim_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    actor TEXT NOT NULL,
    is_lifted INTEGER NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS quest_audit (
    audit_id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    detail TEXT NOT NULL
  )`,
];
const AUDIT_GUARD = [
  `CREATE TRIGGER IF NOT EXISTS quest_audit_no_update BEFORE UPDATE ON quest_audit BEGIN SELECT RAISE(ABORT, 'quest_audit is append-only'); END`,
  `CREATE TRIGGER IF NOT EXISTS quest_audit_no_delete BEFORE DELETE ON quest_audit BEGIN SELECT RAISE(ABORT, 'quest_audit is append-only'); END`,
];

export interface QuestClaimRow {
  claim_id: string;
  quest_code: string;
  walker_id: string;
  display_name: string;
  is_signed_in: boolean;
  status: "accepted" | "review" | "void";
  reason: string[];
  species_code: string | null;
  lat: number;
  lon: number;
  accuracy_m: number;
  point: number;
  created_at: string;
  decided_by: string | null;
  decided_at: string | null;
}

export interface QuestAuditRow {
  at: string;
  actor: string;
  action: string;
  target: string;
  detail: string;
}

/** Who is signed in on this request, if anyone — `AccountService.sessionOf`, handed in. */
export type SessionLookup = (request: Request) => Promise<{ account_code: string; display_name: string } | null>;

function json(body: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });
}

function randomCode(byte: number): string {
  const raw = new Uint8Array(byte);
  crypto.getRandomValues(raw);
  return [...raw].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class QuestService {
  sql: SqlRun;
  token: string | undefined;
  now: () => number;
  session: SessionLookup | null;
  fail_limit = new RateWindow(MOD_FAIL_MAX, MOD_FAIL_WINDOW_MS);
  /** Claims per address: a booth of forty phones on one Wi-Fi still fits. */
  claim_ip_limit = new RateWindow(120, 10 * 60 * 1000);
  /** Claims per player, refused ones included: enough to fix a mistake, not to brute-force a code. */
  claim_player_limit = new RateWindow(12, 10 * 60 * 1000);
  /** Wrong site codes per player per challenge. */
  code_miss = new RateWindow(SITE_CODE_MISS_MAX, 10 * 60 * 1000);
  is_audit_guarded = true;

  constructor(sql: SqlRun, option: { token?: string; now?: () => number; session?: SessionLookup } = {}) {
    this.sql = sql;
    this.token = option.token;
    this.now = option.now ?? Date.now;
    this.session = option.session ?? null;
    for (const statement of SCHEMA) this.sql(statement);
    for (const statement of AUDIT_GUARD) {
      try {
        this.sql(statement);
      } catch {
        this.is_audit_guarded = false;
      }
    }
  }

  get isOn(): boolean {
    return isModOn(this.token);
  }

  stamp(): string {
    return new Date(this.now()).toISOString();
  }

  /* ── reads ─────────────────────────────────────────────────────────────── */

  questOf(row: SqlRow): Quest {
    return JSON.parse(String(row.body)) as Quest;
  }

  allQuest(): { quest: Quest; secret: string }[] {
    return this.sql("SELECT body, secret FROM quest ORDER BY created_at DESC").map((row) => ({ quest: this.questOf(row), secret: String(row.secret) }));
  }

  quest(quest_code: string): { quest: Quest; secret: string } | null {
    const row = this.sql("SELECT body, secret FROM quest WHERE quest_code = ?", quest_code)[0];
    return row ? { quest: this.questOf(row), secret: String(row.secret) } : null;
  }

  claimOf(row: SqlRow): QuestClaimRow {
    return {
      claim_id: String(row.claim_id),
      quest_code: String(row.quest_code),
      walker_id: String(row.walker_id),
      display_name: String(row.display_name),
      is_signed_in: row.account_code !== null && row.account_code !== undefined,
      status: String(row.status) as QuestClaimRow["status"],
      reason: JSON.parse(String(row.reason)) as string[],
      species_code: row.species_code === null ? null : String(row.species_code),
      lat: Number(row.lat),
      lon: Number(row.lon),
      accuracy_m: Number(row.accuracy_m),
      point: Number(row.point),
      created_at: String(row.created_at),
      decided_by: row.decided_by === null ? null : String(row.decided_by),
      decided_at: row.decided_at === null ? null : String(row.decided_at),
    };
  }

  strikeCount(player_id: string): number {
    return Number(this.sql("SELECT COUNT(*) AS n FROM quest_strike WHERE player_id = ? AND is_lifted = 0", player_id)[0]?.n ?? 0);
  }

  /** Points from accepted claims — the number a class can be graded on. */
  verifiedPoint(player_id: string): number {
    return Number(this.sql("SELECT COALESCE(SUM(point), 0) AS n FROM quest_claim WHERE player_id = ? AND status = 'accepted'", player_id)[0]?.n ?? 0);
  }

  /** What a student sees: open challenges for everyone and their classes, and their own claims. */
  forPlayer(player_id: string | null, class_code: string[]) {
    const now = this.now();
    const quest = this.allQuest()
      .map((q) => q.quest)
      /* Closed or ended within two days still show, so a student sees how their claim went. */
      .filter((q) => Date.parse(q.end_at) > now - 2 * 24 * 60 * 60 * 1000 && Date.parse(q.start_at) <= now + 7 * 24 * 60 * 60 * 1000)
      .filter((q) => q.class_code === null || class_code.includes(q.class_code));
    const claim = player_id
      ? this.sql("SELECT * FROM quest_claim WHERE player_id = ? ORDER BY created_at DESC", player_id).map((r) => {
          const c = this.claimOf(r);
          return { quest_code: c.quest_code, status: c.status, reason: c.reason, point: c.point, created_at: c.created_at };
        })
      : [];
    return { quest, claim, verified_point: player_id ? this.verifiedPoint(player_id) : 0, now: new Date(now).toISOString() };
  }

  /* ── the claim ─────────────────────────────────────────────────────────── */

  async claim(raw: unknown, ip: string | null, account: { account_code: string; display_name: string } | null): Promise<{ status: number; body: unknown }> {
    const input = sanitizeClaim(raw);
    if (!input) return { status: 400, body: { error: "a challenge, your walker id and a position are needed" } };
    const now = this.now();
    if (ip && this.claim_ip_limit.take(ip, now) > 0) return { status: 429, body: { error: "too many claims from this network — try again in a few minutes" } };
    if (this.claim_player_limit.take(input.player_id, now) > 0) return { status: 429, body: { error: "too many tries — wait a few minutes" } };
    const found = this.quest(input.quest_code);
    if (!found) return { status: 404, body: { error: "no such challenge" } };
    const { quest, secret } = found;
    const already = this.sql(
      "SELECT claim_id FROM quest_claim WHERE quest_code = ? AND (player_id = ? OR (account_code IS NOT NULL AND account_code = ?))",
      quest.quest_code,
      input.player_id,
      account?.account_code ?? "",
    )[0];
    if (already) return { status: 409, body: { error: "already claimed — one claim each", verdict: { status: "refused", reason: ["You have already claimed this challenge."] } } };

    const miss_key = `${input.player_id}|${quest.quest_code}`;
    let is_site_code_ok = true;
    if (quest.is_site_code) {
      if (this.code_miss.retryAfter(miss_key, now) > 0) {
        return { status: 429, body: { error: "too many wrong site codes — wait ten minutes", verdict: { status: "refused", reason: ["Too many wrong site codes. Wait ten minutes, then use the one on screen."] } } };
      }
      is_site_code_ok = await isSiteCode(secret, input.site_code, now);
      if (!is_site_code_ok) this.code_miss.note(miss_key, now);
    }
    const last = this.sql("SELECT lat, lon, created_at FROM quest_claim WHERE player_id = ? ORDER BY created_at DESC LIMIT 1", input.player_id)[0];
    const verdict: QuestVerdict = judgeClaim(quest, input, {
      now_ms: now,
      is_site_code_ok,
      last_claim: last ? { lat: Number(last.lat), lon: Number(last.lon), at_ms: Date.parse(String(last.created_at)) } : null,
      strike_count: this.strikeCount(input.player_id),
    });
    if (verdict.status === "refused") return { status: 200, body: { verdict } };

    const claim_id = `qc-${randomCode(8)}`;
    try {
      this.sql(
        `INSERT INTO quest_claim (claim_id, quest_code, player_id, walker_id, account_code, display_name, status, reason, species_code, lat, lon, accuracy_m, point, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        claim_id,
        quest.quest_code,
        input.player_id,
        await walkerIdOf(input.player_id),
        account?.account_code ?? null,
        account?.display_name || input.display_name,
        verdict.status,
        JSON.stringify(verdict.reason),
        input.species_code,
        input.lat,
        input.lon,
        input.accuracy_m,
        verdict.status === "accepted" ? quest.point : 0,
        new Date(now).toISOString(),
      );
    } catch {
      /* Two taps racing past the SELECT: the UNIQUE index is the referee. */
      return { status: 409, body: { error: "already claimed — one claim each" } };
    }
    return { status: 201, body: { verdict, claim_id, point: verdict.status === "accepted" ? quest.point : 0 } };
  }

  /* ── the organiser ─────────────────────────────────────────────────────── */

  audit(actor: string, action: string, target: string, detail: string): void {
    this.sql("INSERT INTO quest_audit (at, actor, action, target, detail) VALUES (?, ?, ?, ?, ?)", this.stamp(), actor, action, target, detail.slice(0, 400));
  }

  state(actor: string) {
    const quest = this.allQuest().map(({ quest, secret }) => {
      const count = this.sql("SELECT status, COUNT(*) AS n FROM quest_claim WHERE quest_code = ? GROUP BY status", quest.quest_code);
      const by = Object.fromEntries(count.map((r) => [String(r.status), Number(r.n)]));
      return { ...quest, secret, claim_count: { accepted: by.accepted ?? 0, review: by.review ?? 0, void: by.void ?? 0 } };
    });
    const claim = this.sql("SELECT * FROM quest_claim ORDER BY created_at DESC LIMIT 500").map((r) => this.claimOf(r));
    const strike = this.sql(
      "SELECT s.player_id, COUNT(*) AS n, MAX(c.display_name) AS display_name, MAX(c.walker_id) AS walker_id FROM quest_strike s LEFT JOIN quest_claim c ON c.claim_id = s.claim_id WHERE s.is_lifted = 0 GROUP BY s.player_id",
    );
    const audit = this.sql("SELECT at, actor, action, target, detail FROM quest_audit ORDER BY audit_id DESC LIMIT 200").map((r) => ({
      at: String(r.at),
      actor: String(r.actor),
      action: String(r.action),
      target: String(r.target),
      detail: String(r.detail),
    }));
    return {
      actor,
      now: this.stamp(),
      quest,
      claim,
      /* By walker_id, never the private player_id. */
      strike: strike.map((r) => ({ walker_id: String(r.walker_id ?? ""), display_name: String(r.display_name ?? "A walker"), count: Number(r.n) })),
      audit,
      is_audit_guarded: this.is_audit_guarded,
    };
  }

  async act(raw: unknown, actor: string): Promise<{ ok: true; detail?: unknown } | { ok: false; error: string }> {
    if (!raw || typeof raw !== "object") return { ok: false, error: "no action" };
    const r = raw as Record<string, unknown>;
    if (r.action === "create") {
      const checked = sanitizeQuestDraft(r.quest);
      if ("error" in checked) return { ok: false, error: checked.error };
      const quest: Quest = {
        ...checked.draft,
        quest_code: `q-${randomCode(4)}`,
        author: actor,
        created_at: this.stamp(),
        status: "open",
      };
      this.sql("INSERT INTO quest (quest_code, body, secret, created_at) VALUES (?, ?, ?, ?)", quest.quest_code, JSON.stringify(quest), randomCode(20), quest.created_at);
      this.audit(actor, "create", quest.quest_code, quest.title);
      return { ok: true, detail: { quest_code: quest.quest_code } };
    }
    if (r.action === "close" && isQuestCode(r.target)) {
      const found = this.quest(r.target);
      if (!found) return { ok: false, error: "no such challenge" };
      this.sql("UPDATE quest SET body = ? WHERE quest_code = ?", JSON.stringify({ ...found.quest, status: "closed" }), r.target);
      this.audit(actor, "close", r.target, found.quest.title);
      return { ok: true };
    }
    if ((r.action === "approve" || r.action === "void") && typeof r.target === "string" && /^qc-[0-9a-f]{16}$/.test(r.target)) {
      const row = this.sql("SELECT * FROM quest_claim WHERE claim_id = ?", r.target)[0];
      if (!row) return { ok: false, error: "no such claim" };
      const quest = this.quest(String(row.quest_code))?.quest;
      const status = r.action === "approve" ? "accepted" : "void";
      this.sql(
        "UPDATE quest_claim SET status = ?, point = ?, decided_by = ?, decided_at = ? WHERE claim_id = ?",
        status,
        status === "accepted" ? quest?.point ?? 0 : 0,
        actor,
        this.stamp(),
        r.target,
      );
      /* Voiding is the strike; approving a claim that was voided lifts it. */
      if (status === "void") this.sql("INSERT INTO quest_strike (player_id, claim_id, created_at, actor) VALUES (?, ?, ?, ?)", String(row.player_id), r.target, this.stamp(), actor);
      else this.sql("UPDATE quest_strike SET is_lifted = 1 WHERE claim_id = ?", r.target);
      this.audit(actor, r.action, r.target, `${String(row.display_name)} · ${String(row.quest_code)}`);
      return { ok: true };
    }
    return { ok: false, error: "unknown action or target" };
  }

  /* ── routing ───────────────────────────────────────────────────────────── */

  async handle(request: Request, page_origin: readonly string[] = []): Promise<Response | null> {
    const url = new URL(request.url);
    if (!isQuestPath(url.pathname)) return null;

    if (url.pathname === QUEST_PATH && request.method === "GET") {
      const player_id = url.searchParams.get("player_id");
      const class_code = (url.searchParams.get("class") ?? "")
        .split(",")
        .map((c) => c.trim().toUpperCase())
        .filter(isClassCode)
        .slice(0, 8);
      return json(this.forPlayer(player_id && player_id.length >= 8 && player_id.length <= 80 ? player_id : null, class_code));
    }
    if (url.pathname === QUEST_CLAIM_PATH) {
      if (request.method !== "POST") return json({ error: "POST a claim" }, 405);
      if (!isOwnPage(request, url.host, page_origin)) return json({ error: "claims come from this app's own page" }, 403);
      if (mimeEssence(request.headers.get("Content-Type")) !== "application/json") return json({ error: "send JSON" }, 400);
      const text = await request.text();
      if (text.length > QUEST_BODY_MAX) return json({ error: "claim too large" }, 413);
      let raw: unknown;
      try {
        raw = JSON.parse(text);
      } catch {
        return json({ error: "bad json" }, 400);
      }
      const account = this.session ? await this.session(request) : null;
      const out = await this.claim(raw, clientIp(request), account);
      return json(out.body, out.status);
    }

    /* The organiser's console: same origin only, no CORS, like /mod/api. */
    if (!this.isOn) return json({ error: "the SEEDS console is off — set SEEDS_TOKEN (16+ characters) to turn it on" }, 404);
    const ip = clientIp(request) ?? "local";
    const now = this.now();
    if (this.fail_limit.retryAfter(ip, now) > 0) return json({ error: "too many wrong tokens — wait fifteen minutes" }, 429, { "Retry-After": "900" });
    const actor = await modActorOf(bearerOf(request.headers.get("Authorization")), this.token);
    if (actor === null) {
      this.fail_limit.note(ip, now);
      return json({ error: "wrong or missing organiser token" }, 401);
    }
    if (request.method === "GET" && url.pathname === `${SEEDS_API_PREFIX}state`) return json(this.state(actor));
    if (request.method === "POST" && url.pathname === `${SEEDS_API_PREFIX}action`) {
      if (mimeEssence(request.headers.get("Content-Type")) !== "application/json") return json({ error: "send JSON" }, 400);
      let raw: unknown;
      try {
        raw = JSON.parse((await request.text()).slice(0, QUEST_BODY_MAX));
      } catch {
        return json({ error: "bad json" }, 400);
      }
      const result = await this.act(raw, actor);
      if (!result.ok) return json({ error: result.error }, 400);
      return json({ ok: true, detail: result.detail ?? null, state: this.state(actor) });
    }
    return json({ error: "not found" }, 404);
  }
}
