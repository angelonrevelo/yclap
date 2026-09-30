/**
 * Reports and moderation — the rules, pure, shared by the Worker, the LAN
 * server, the client and the tests (the same arrangement as `multiplayer.ts`).
 * The store and the routes are `worker/moderation.ts`; the spec is
 * `docs/spec/moderation.md`.
 *
 * Gelo, 09-30 note `3:39`–`3:50`: "making sure that everything is accounted
 * for, from the performance to the bugs to the reporting system" — with a
 * bug-report workflow tagged by severity (stutter, desync, rig errors). And
 * the hall now prints display names and "Ana logged Molave" on every phone,
 * which needs somebody with the authority to take a name down.
 *
 * What a report carries is the minimum a fix needs, and it is stated on the
 * form before anything is sent:
 * - a category and a severity, and up to REPORT_TEXT_MAX characters of text;
 * - diagnostics: build id, browser, viewport, frame rate, hall mode, and which
 *   SOURCE the position comes from (GPS · demo · stick) — never the position
 *   itself unless the reporter ticks the box, and then rounded to ~11 m;
 * - for a name report, the hall's `walker_id` (a one-way hash) and the name
 *   as printed. Never a `player_id`: that is the key a walker code is minted
 *   from, and `sanitizeReport` only ever copies fields it names, so one sent
 *   along by a modified client is dropped, not stored.
 * No IP address is stored; the per-IP brake is in memory (`rate-limit.ts`).
 */

import { sha256Hex, timingSafeEqual } from "./account-core.ts";
import { isInsideCampus, type FixSource } from "./geo.ts";

/* ── what a report is ──────────────────────────────────────────────────── */

/** Gelo's tags, as a player would say them. `name` comes only from a name tag. */
export const REPORT_CATEGORY = ["stutter", "desync", "rig", "wrong_place", "other", "name"] as const;
export type ReportCategory = (typeof REPORT_CATEGORY)[number];

export const REPORT_CATEGORY_LABEL: Record<ReportCategory, string> = {
  stutter: "Lag or stutter",
  desync: "Multiplayer (walkers jump, vanish or disagree)",
  rig: "A 3D model looks wrong",
  wrong_place: "Wrong species or wrong place",
  other: "Something else",
  name: "Offensive walker name",
};

/** The picker shows these; `name` is filed from a walker's name tag. */
export const REPORT_CATEGORY_PICK: ReportCategory[] = ["stutter", "desync", "rig", "wrong_place", "other"];

export const REPORT_SEVERITY = ["blocker", "major", "minor"] as const;
export type ReportSeverity = (typeof REPORT_SEVERITY)[number];

export const REPORT_SEVERITY_LABEL: Record<ReportSeverity, string> = {
  blocker: "Can't play",
  major: "Gets in the way",
  minor: "Small / cosmetic",
};

export const REPORT_TEXT_MAX = 1000;
/** Largest POST /report body read. A full report is well under 3 KB. */
export const REPORT_BODY_MAX = 8 * 1024;
/**
 * How long a report is kept, open or resolved, before it is deleted — 30 days.
 * Long enough to cover the reveal (~10-15) and the two-week pilot after it,
 * with a moderator checking daily; short enough that a browser string and a
 * complaint about somebody's name are not kept once they have been acted on.
 * Diagnostics older than a month describe a build nobody runs any more.
 */
export const REPORT_RETENTION_DAY = 30;
export const REPORT_RETENTION_MS = REPORT_RETENTION_DAY * 24 * 60 * 60 * 1000;
/** Reports one IP may file per hour on the LAN box, where every phone has its own address. */
export const REPORT_IP_PER_HOUR = 10;
/** ...and behind Cloudflare, where a booth of phones shares one public IP. */
export const EDGE_REPORT_IP_PER_HOUR = 60;
export const REPORT_WINDOW_MS = 60 * 60 * 1000;
/** Open reports held at once. Past it, /report answers 503 rather than grow without bound. */
export const REPORT_OPEN_MAX = 2000;

const HALL_MODE = new Set(["connecting", "socket", "poll", "off"]);
const GEO_SOURCE = new Set<FixSource | "none">(["gps", "demo", "play", "none"]);
const ROUTE = new Set(["/", "/map", "/journal", "/settings"]);

/** What the phone attaches without being asked — every field named, nothing else passes. */
export interface ReportDiagnostic {
  build_id: string;
  user_agent: string;
  /** `390x844@3` — CSS px and device-pixel ratio. */
  viewport: string;
  fps: number | null;
  p95_ms: number | null;
  long_count: number | null;
  hall_mode: string;
  geo_source: FixSource | "none";
  route: string;
  /** Only when the reporter ticked "attach my map position"; rounded to 4 dp (~11 m). */
  lat?: number;
  lon?: number;
}

/** What POST /report takes. */
export interface ReportInput {
  category: ReportCategory;
  severity: ReportSeverity;
  text: string;
  is_location_shared: boolean;
  diagnostic: Partial<ReportDiagnostic>;
  walker_id?: string;
  walker_name?: string;
  sighting_id?: string;
}

/** A report as stored, and as the console lists it. */
export interface Report {
  report_id: string;
  created_at: string;
  category: ReportCategory;
  severity: ReportSeverity;
  text: string;
  diagnostic: ReportDiagnostic;
  walker_id: string | null;
  walker_name: string | null;
  sighting_id: string | null;
  status: "open" | "resolved";
  resolved_at: string | null;
}

/** Report text: control characters out (newlines kept), trimmed, capped. */
export function cleanReportText(raw: unknown, max = REPORT_TEXT_MAX): string {
  return String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F​-‏‪-‮⁦-⁩]/g, "")
    .trim()
    .slice(0, max);
}

function cleanLine(raw: unknown, max: number): string {
  return cleanReportText(raw, max).replace(/\n/g, " ");
}

function finiteOr(raw: unknown, lo: number, hi: number): number | null {
  const n = Number(raw);
  if (raw === null || raw === undefined || raw === "" || !Number.isFinite(n)) return null;
  return Math.max(lo, Math.min(hi, Math.round(n * 10) / 10));
}

/** A hall key as `walkerIdOf` makes it: `w` + base-36. */
export function isWalkerId(raw: unknown): raw is string {
  return typeof raw === "string" && /^w[0-9a-z]{2,24}$/.test(raw);
}

export function isSightingId(raw: unknown): raw is string {
  return typeof raw === "string" && /^[\w:.-]{1,80}$/.test(raw);
}

export function sanitizeDiagnostic(raw: unknown, is_location_shared: boolean): ReportDiagnostic {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const viewport = /^\d{2,5}x\d{2,5}(@\d(\.\d{1,2})?)?$/.test(String(r.viewport ?? "")) ? String(r.viewport) : "";
  const build_id = /^[\w.+-]{1,40}$/.test(String(r.build_id ?? "")) ? String(r.build_id) : "unknown";
  const out: ReportDiagnostic = {
    build_id,
    user_agent: cleanLine(r.user_agent, 300),
    viewport,
    fps: finiteOr(r.fps, 0, 240),
    p95_ms: finiteOr(r.p95_ms, 0, 10_000),
    long_count: finiteOr(r.long_count, 0, 100_000),
    hall_mode: HALL_MODE.has(String(r.hall_mode)) ? String(r.hall_mode) : "off",
    geo_source: GEO_SOURCE.has(r.geo_source as FixSource) ? (r.geo_source as FixSource | "none") : "none",
    route: ROUTE.has(String(r.route)) ? String(r.route) : "/",
  };
  if (is_location_shared) {
    const lat = Number(r.lat);
    const lon = Number(r.lon);
    /* On campus or not at all: a position off campus is somebody's home. */
    if (Number.isFinite(lat) && Number.isFinite(lon) && isInsideCampus({ lat, lon })) {
      out.lat = Math.round(lat * 1e4) / 1e4;
      out.lon = Math.round(lon * 1e4) / 1e4;
    }
  }
  return out;
}

/**
 * Untrusted JSON in, a report out (minus the id and stamps the store adds),
 * or null. Copies only the fields it names — which is the whole of the
 * guarantee that a `player_id`, a photo, a note or an address sent along by a
 * modified client never reaches storage.
 */
export function sanitizeReport(raw: unknown): Omit<Report, "report_id" | "created_at" | "status" | "resolved_at"> | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!REPORT_CATEGORY.includes(r.category as ReportCategory)) return null;
  const category = r.category as ReportCategory;
  const severity = REPORT_SEVERITY.includes(r.severity as ReportSeverity) ? (r.severity as ReportSeverity) : "minor";
  const text = cleanReportText(r.text);
  const walker_id = isWalkerId(r.walker_id) ? r.walker_id : null;
  /* A name report is about a walker; without one there is nothing to act on. */
  if (category === "name" && !walker_id) return null;
  /* Anything else needs words, or it is a tap nobody can act on. */
  if (category !== "name" && text.length < 3) return null;
  const walker_name = walker_id ? cleanLine(r.walker_name, 40) || null : null;
  return {
    category,
    severity,
    text,
    diagnostic: sanitizeDiagnostic(r.diagnostic, r.is_location_shared === true),
    walker_id,
    walker_name,
    sighting_id: isSightingId(r.sighting_id) ? r.sighting_id : null,
  };
}

/* ── authority ─────────────────────────────────────────────────────────── */

/**
 * A MOD_TOKEN shorter than this is treated as not set — the console stays off
 * rather than open to a guessable password. `openssl rand -hex 24` is 48.
 */
export const MOD_TOKEN_MIN = 16;
/** Wrong tokens one IP may try per window before the console answers 429. */
export const MOD_FAIL_MAX = 10;
export const MOD_FAIL_WINDOW_MS = 15 * 60 * 1000;
/** The longest a walker can be hidden from the hall in one action: a week. */
export const HIDE_HOUR_MAX = 24 * 7;

/** Is the console on at all? No token, or a short one, means off. */
/** The name an actor gets when MOD_TOKEN is one bare token rather than a list. */
export const MOD_ACTOR_DEFAULT = "moderator";

/**
 * MOD_TOKEN, read as a list of moderators. One bare token (the 09-30 form)
 * is one moderator called "moderator". `ana:<token>,ben:<token>` is one per
 * person, so the audit log can say WHO hid a walker, and a moderator who
 * leaves is removed by deleting their entry without re-keying everybody else.
 * An entry whose token is under MOD_TOKEN_MIN is dropped, not weakened.
 */
export function modTokenList(configured: string | null | undefined): { actor: string; token: string }[] {
  if (typeof configured !== "string") return [];
  const out: { actor: string; token: string }[] = [];
  for (const raw of configured.split(",")) {
    const entry = raw.trim();
    if (!entry) continue;
    const cut = entry.indexOf(":");
    const actor = cut > 0 ? entry.slice(0, cut).trim().replace(/[^A-Za-z0-9 ._-]/g, "").slice(0, 32) : MOD_ACTOR_DEFAULT;
    const token = (cut > 0 ? entry.slice(cut + 1) : entry).trim();
    if (actor && token.length >= MOD_TOKEN_MIN) out.push({ actor, token });
  }
  return out;
}

export function isModOn(configured: string | null | undefined): configured is string {
  return modTokenList(configured).length > 0;
}

/** `Authorization: Bearer <token>` → the token, or null. */
export function bearerOf(header: string | null): string | null {
  const hit = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "");
  return hit ? hit[1] : null;
}

/**
 * Constant-time token check. Both sides are hashed first, so the compare is
 * over two 32-byte digests: neither the length of the real token nor how many
 * leading characters a guess got right leaks through timing.
 */
export async function isModToken(given: string | null, configured: string | null | undefined): Promise<boolean> {
  return (await modActorOf(given, configured)) !== null;
}

/**
 * Which moderator a token belongs to, or null. Every entry is compared, with
 * no early exit, so how many moderators there are and which one matched do not
 * show in the timing either.
 */
export async function modActorOf(given: string | null, configured: string | null | undefined): Promise<string | null> {
  const list = modTokenList(configured);
  if (!list.length || !given) return null;
  const enc = new TextEncoder();
  const a = enc.encode(await sha256Hex(given));
  let actor: string | null = null;
  for (const one of list) {
    const b = enc.encode(await sha256Hex(one.token));
    if (timingSafeEqual(a, b) && actor === null) actor = one.actor;
  }
  return actor;
}

export const MOD_ACTION = [
  "hide_walker",
  "unhide_walker",
  "hide_find",
  "unhide_find",
  "resolve_report",
  "reopen_report",
] as const;
export type ModAction = (typeof MOD_ACTION)[number];

export interface ModActionInput {
  action: ModAction;
  target: string;
  /** hide_walker only: how long, 1–HIDE_HOUR_MAX. */
  hour?: number;
}

export function sanitizeModAction(raw: unknown): ModActionInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!MOD_ACTION.includes(r.action as ModAction)) return null;
  const action = r.action as ModAction;
  const target = typeof r.target === "string" ? r.target.trim() : "";
  if (action === "hide_walker" || action === "unhide_walker") {
    if (!isWalkerId(target)) return null;
  } else if (action === "hide_find" || action === "unhide_find") {
    if (!isSightingId(target)) return null;
  } else if (!/^r[0-9a-z-]{4,40}$/.test(target)) {
    return null;
  }
  if (action !== "hide_walker") return { action, target };
  const hour = Number(r.hour);
  if (!Number.isFinite(hour) || hour < 1) return null;
  return { action, target, hour: Math.min(HIDE_HOUR_MAX, Math.round(hour)) };
}
