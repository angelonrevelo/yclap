/**
 * "Report a problem", the phone's half: what gets attached, and the queue that
 * holds a report until there is a network to send it on.
 *
 * The rules (categories, caps, what the server keeps) are `moderation.ts`;
 * this file only gathers and sends. Two things it promises the form states:
 *
 * - **No position unless ticked.** The diagnostics say which SOURCE the walker
 *   is driven by (GPS · demo · stick), which is what a "walkers jump" report
 *   needs. The coordinates go only when the reporter ticks the box, and the
 *   server rounds them to ~11 m and drops them off campus.
 * - **Nothing personal.** No player_id (the hall's `walker_id` for a name
 *   report is a one-way hash), no photo, no note, no journal.
 *
 * Offline — a campus dead spot, a booth wifi that dropped — the report waits
 * in localStorage and is retried when the browser says it is back online, on
 * the next launch, and once a minute while any is waiting.
 */

import type { FrameStat } from "./frame-stat.ts";
import type { FixSource, LatLon } from "./geo.ts";
import type { HallMode } from "./multiplayer.ts";
import type { ReportDiagnostic, ReportInput } from "./moderation.ts";

export const REPORT_QUEUE_KEY = "field-guide.report-queue";
/** Reports held while offline. Past it the oldest is dropped: a report is not a journal. */
export const REPORT_QUEUE_MAX = 20;
/** A queued report older than this is stale — its diagnostics describe a moment long gone. */
export const REPORT_QUEUE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const REPORT_RETRY_MS = 60_000;

declare const __BUILD_ID__: string | undefined;

/** The build this phone runs: `git short sha · build date`, baked in by vite.config.ts. */
export function buildIdOf(): string {
  return typeof __BUILD_ID__ === "string" && __BUILD_ID__ ? __BUILD_ID__ : "dev";
}

/* ── what the app knows right now ─────────────────────────────────────── */

/**
 * The live facts a report attaches, kept up to date by the hall
 * (`useHall` in remote-walker.tsx) so neither Settings nor the play sheet has
 * to be handed them.
 */
export interface ReportContext {
  hall_mode: HallMode;
  geo_source: FixSource | "none";
  fix: LatLon | null;
}

let context: ReportContext = { hall_mode: "off", geo_source: "none", fix: null };

export function noteReportContext(next: Partial<ReportContext>): void {
  context = { ...context, ...next };
}

export function reportContext(): ReportContext {
  return context;
}

export interface ReportEnv {
  build_id: string;
  user_agent: string;
  width: number;
  height: number;
  dpr: number;
  route: string;
  frame: FrameStat | null;
}

/** Everything attached, in the shape the server keeps. Position only when `is_location_shared`. */
export function diagnosticOf(ctx: ReportContext, env: ReportEnv, is_location_shared: boolean): ReportDiagnostic {
  const diagnostic: ReportDiagnostic = {
    build_id: env.build_id,
    user_agent: env.user_agent.slice(0, 300),
    viewport: `${Math.round(env.width)}x${Math.round(env.height)}@${Math.round(env.dpr * 100) / 100}`,
    fps: env.frame?.frame_count ? env.frame.fps : null,
    p95_ms: env.frame?.frame_count ? env.frame.p95_ms : null,
    long_count: env.frame?.frame_count ? env.frame.long_count : null,
    hall_mode: ctx.hall_mode,
    geo_source: ctx.geo_source,
    route: env.route,
  };
  if (is_location_shared && ctx.fix) {
    diagnostic.lat = ctx.fix.lat;
    diagnostic.lon = ctx.fix.lon;
  }
  return diagnostic;
}

/** The same list the form shows under "What gets sent", so the screen and the payload cannot disagree. */
export function diagnosticLine(d: ReportDiagnostic): { label: string; value: string }[] {
  return [
    { label: "Build", value: d.build_id },
    { label: "Browser", value: d.user_agent || "unknown" },
    { label: "Screen", value: d.viewport || "unknown" },
    { label: "Frame rate", value: d.fps === null ? "not measured" : `${d.fps} fps · p95 ${d.p95_ms} ms · ${d.long_count} long frames` },
    { label: "Live hall", value: d.hall_mode },
    { label: "Position from", value: d.geo_source === "none" ? "no fix" : d.geo_source },
    { label: "Map position", value: d.lat === undefined ? "not sent" : `${d.lat.toFixed(4)}, ${d.lon?.toFixed(4)}` },
  ];
}

/* ── the queue ─────────────────────────────────────────────────────────── */

export interface QueuedReport {
  input: ReportInput;
  queued_at: number;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function readQueue(storage: Storage | null = safeStorage(), now = Date.now()): QueuedReport[] {
  try {
    const raw = JSON.parse(storage?.getItem(REPORT_QUEUE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(
        (one): one is QueuedReport =>
          !!one && typeof one === "object" && typeof one.queued_at === "number" && !!one.input && typeof one.input === "object",
      )
      .filter((one) => now - one.queued_at < REPORT_QUEUE_TTL_MS)
      .slice(-REPORT_QUEUE_MAX);
  } catch {
    return [];
  }
}

export function writeQueue(queue: QueuedReport[], storage: Storage | null = safeStorage()): void {
  try {
    if (!queue.length) storage?.removeItem(REPORT_QUEUE_KEY);
    else storage?.setItem(REPORT_QUEUE_KEY, JSON.stringify(queue.slice(-REPORT_QUEUE_MAX)));
  } catch {
    /* private mode: the report is lost with the tab, and the form said "queued" */
  }
}

export type SendResult = "sent" | "queued" | "refused";

export interface ReportIo {
  fetch: typeof fetch;
  url: string;
  credentials?: RequestCredentials;
  storage?: Storage | null;
  now?: number;
}

/**
 * One POST. "refused" is the server saying no to THIS report (400/403/413):
 * retrying it would only be refused again, so it is not queued. A 429, a 5xx
 * or no network at all is worth another go later.
 */
async function postOnce(input: ReportInput, io: ReportIo): Promise<SendResult> {
  try {
    const res = await io.fetch(io.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      credentials: io.credentials,
    });
    if (res.ok) return "sent";
    if (res.status === 429 || res.status >= 500) return "queued";
    return "refused";
  } catch {
    return "queued";
  }
}

/** Send now, or hold it in the queue for later. */
export async function sendReport(input: ReportInput, io: ReportIo): Promise<SendResult> {
  const result = await postOnce(input, io);
  if (result === "queued") {
    const now = io.now ?? Date.now();
    writeQueue([...readQueue(io.storage, now), { input, queued_at: now }], io.storage);
  }
  return result;
}

/** Try every queued report once; keep only those still worth retrying. */
export async function flushQueue(io: ReportIo): Promise<{ sent: number; left: number }> {
  const now = io.now ?? Date.now();
  const queue = readQueue(io.storage, now);
  if (!queue.length) return { sent: 0, left: 0 };
  const left: QueuedReport[] = [];
  let sent = 0;
  for (const one of queue) {
    const result = await postOnce(one.input, io);
    if (result === "sent") sent += 1;
    else if (result === "queued") left.push(one);
  }
  /* Anything queued while this ran is kept too. */
  const during = readQueue(io.storage, now).filter((one) => !queue.some((q) => q.queued_at === one.queued_at));
  writeQueue([...left, ...during], io.storage);
  return { sent, left: left.length + during.length };
}
