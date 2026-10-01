/**
 * SEEDS challenges ("quests" in code): a challenge an organiser sets — the
 * AVP-SEEDS office, a teacher, an org — that students complete in the field
 * and that the SERVER decides, not the phone.
 *
 * Gelo, 10-01: "a way for seeds to integrate challenges to students and that
 * noone can cheat". Everything else in the game is scored on the phone
 * (`gamify.ts`), which is fine for a game and useless for a class grade. A
 * quest claim is judged here, on the Worker and the LAN box alike
 * (`worker/quest.ts`), with the layers the anti-cheat research ranked first
 * (`docs/research/anticheat.md`):
 *
 *   1. A rotating SITE CODE (6 digits, 30 s step, RFC 6238-style) shown by
 *      the organiser at the place — Geocaching's logbook, Niantic's Campfire
 *      check-in. You have to be there, or be handed it within a minute.
 *   2. A GEOFENCE around the site, padded by the fix's own accuracy.
 *   3. A REAL GPS fix: a stick walk or the demo loop cannot claim.
 *   4. PLAUSIBILITY, the way Niantic catches spoofers after the fact: faster
 *      than a walk between fixes, a teleport since your last claim, a fix too
 *      vague to place you, a "GPS" that never jitters. These do not refuse —
 *      they send the claim to the organiser's review queue.
 *   5. ONE claim per student per quest, the time stamped by the server.
 *
 * A browser cannot tell a mocked location from a real one (no mock-location
 * flag, no Play Integrity on the web); layers 1, 4 and the review queue are
 * what stand in for that, and the doc says so.
 *
 * Pure and shared: the phone uses it to say what a claim will need, the server
 * to judge it, the tests to hold it.
 */
import { distanceMeter, type LatLon } from "./geo.ts";

export const QUEST_KIND = ["log_species", "log_any", "visit"] as const;
export type QuestKind = (typeof QUEST_KIND)[number];

export const QUEST_KIND_LABEL: Record<QuestKind, string> = {
  log_species: "Log one of these species",
  log_any: "Log any living thing",
  visit: "Be at the place",
};

export interface QuestSite extends LatLon {
  radius_m: number;
  /** "the Zen Garden" — said on the card. */
  name: string;
}

export interface Quest {
  quest_code: string;
  title: string;
  brief: string;
  quest_kind: QuestKind;
  /** For `log_species`: any one of these counts. */
  species_code: string[];
  /** Where it must be done. Null: anywhere on campus. */
  site: QuestSite | null;
  start_at: string;
  end_at: string;
  point: number;
  /** The organiser shows a rotating code at the site; the claim must carry it. */
  is_site_code: boolean;
  /** A photo must be attached to the log. */
  is_photo: boolean;
  /** Null: open to everyone. Otherwise only students who entered this class code see it. */
  class_code: string | null;
  author: string;
  created_at: string;
  status: "open" | "closed";
}

/** What a student's phone sends to claim a quest. Everything here is a claim, not a fact. */
export interface QuestClaimInput {
  quest_code: string;
  player_id: string;
  display_name: string;
  species_code: string | null;
  lat: number;
  lon: number;
  accuracy_m: number;
  fix_source: "gps" | "demo" | "play";
  site_code: string | null;
  has_photo: boolean;
  /** The last few fixes before the claim, oldest first, `at` in the phone's ms. */
  path: { lat: number; lon: number; accuracy_m: number; at: number }[];
}

export type QuestVerdictStatus = "accepted" | "review" | "refused";

export interface QuestVerdict {
  status: QuestVerdictStatus;
  /** Plain sentences, shown to the student and the organiser alike. */
  reason: string[];
}

/* ── the numbers ──────────────────────────────────────────────────────────── */

/** Site code step. A code is good for this step and the one before: 30–60 s. */
export const SITE_CODE_STEP_MS = 30_000;
export const SITE_CODE_DIGIT = 6;
/** A fix vaguer than this cannot place you at a site; it goes to review. */
export const QUEST_ACCURACY_MAX_M = 50;
/**
 * Faster than this between two fixes is not a walk. 15 km/h — Pokémon GO
 * stops counting distance at about 10.5 km/h (community-measured); this is
 * looser on purpose, because GPS jumps and a student may jog.
 */
export const QUEST_SPEED_MAX_MPS = 15 / 3.6;
/** Fewer fixes than this and a "never jitters" judgement is noise. */
const JITTER_MIN_FIX = 5;
export const QUEST_POINT_MAX = 200;
export const QUEST_TITLE_MAX = 80;
export const QUEST_BRIEF_MAX = 600;
export const QUEST_SPECIES_MAX = 20;
export const QUEST_PATH_MAX = 30;
export const QUEST_RADIUS_MIN_M = 10;
export const QUEST_RADIUS_MAX_M = 500;
/** Wrong site codes per player per quest before the claim locks for ten minutes. */
export const SITE_CODE_MISS_MAX = 8;
/** Strikes (voided claims) before every further claim from that student goes to review. */
export const STRIKE_REVIEW_AT = 2;

/* ── the site code ───────────────────────────────────────────────────────── */

async function hmacSha256(secret: string, message: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, message as BufferSource));
}

/** The code for one 30 s step (RFC 4226 dynamic truncation over HMAC-SHA256). */
export async function siteCodeAt(secret: string, now_ms: number): Promise<string> {
  const step = Math.floor(now_ms / SITE_CODE_STEP_MS);
  const counter = new Uint8Array(8);
  let n = step;
  for (let i = 7; i >= 0; i -= 1) {
    counter[i] = n % 256;
    n = Math.floor(n / 256);
  }
  const mac = await hmacSha256(secret, counter);
  const offset = mac[mac.length - 1] & 0x0f;
  const value = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(value % 10 ** SITE_CODE_DIGIT).padStart(SITE_CODE_DIGIT, "0");
}

/** Good now or one step ago — the time to read it off a screen and type it. */
export async function isSiteCode(secret: string, given: string | null, now_ms: number): Promise<boolean> {
  const code = (given ?? "").replace(/\D/g, "");
  if (code.length !== SITE_CODE_DIGIT) return false;
  for (const back of [0, 1]) if ((await siteCodeAt(secret, now_ms - back * SITE_CODE_STEP_MS)) === code) return true;
  return false;
}

/** Seconds until the code on the organiser's screen changes. */
export function siteCodeSecondLeft(now_ms: number): number {
  return Math.ceil((SITE_CODE_STEP_MS - (now_ms % SITE_CODE_STEP_MS)) / 1000);
}

/* ── judging a claim ─────────────────────────────────────────────────────── */

export function isQuestOpen(quest: Quest, now_ms: number): boolean {
  return quest.status === "open" && Date.parse(quest.start_at) <= now_ms && now_ms < Date.parse(quest.end_at);
}

/** The flags that send a claim to review: none means it may be accepted. */
export function plausibilityFlag(
  claim: Pick<QuestClaimInput, "accuracy_m" | "path" | "lat" | "lon">,
  last_claim: { lat: number; lon: number; at_ms: number } | null,
  now_ms: number,
): string[] {
  const flag: string[] = [];
  if (!(claim.accuracy_m > 0) || claim.accuracy_m > QUEST_ACCURACY_MAX_M) {
    flag.push(`The GPS fix was ${Math.round(claim.accuracy_m) || "of unknown"} m accurate; a claim needs ${QUEST_ACCURACY_MAX_M} m or better to place you.`);
  }
  const path = claim.path.slice(-QUEST_PATH_MAX);
  for (let i = 1; i < path.length; i += 1) {
    const second = (path[i].at - path[i - 1].at) / 1000;
    if (second <= 0) continue;
    /* Both fixes' error is allowed for before calling it speed. */
    const metre = Math.max(0, distanceMeter(path[i - 1], path[i]) - path[i - 1].accuracy_m - path[i].accuracy_m);
    if (metre / second > QUEST_SPEED_MAX_MPS) {
      flag.push(`Moved ${Math.round(metre)} m in ${Math.round(second)} s just before the claim — faster than walking.`);
      break;
    }
  }
  if (path.length >= JITTER_MIN_FIX && path.every((p) => p.lat === path[0].lat && p.lon === path[0].lon)) {
    flag.push("The position never moved by a hair across the last fixes; a real GPS always jitters.");
  }
  if (last_claim) {
    const second = (now_ms - last_claim.at_ms) / 1000;
    const metre = distanceMeter(last_claim, claim);
    if (second > 0 && metre > 150 && metre / second > QUEST_SPEED_MAX_MPS) {
      flag.push(`${Math.round(metre)} m from your last claim ${Math.round(second / 60)} min ago — faster than walking.`);
    }
  }
  return flag;
}

/**
 * The verdict, minus what only the store knows (already claimed, the site
 * code, strikes) — `worker/quest.ts` adds those. Refusals are things the
 * student can fix and retry; review flags are things only a person can judge.
 */
export function judgeClaim(
  quest: Quest,
  claim: QuestClaimInput,
  context: { now_ms: number; is_site_code_ok: boolean; last_claim: { lat: number; lon: number; at_ms: number } | null; strike_count: number },
): QuestVerdict {
  const refuse: string[] = [];
  if (!isQuestOpen(quest, context.now_ms)) refuse.push("This challenge is not open right now.");
  if (claim.fix_source !== "gps") refuse.push("Only a real GPS fix can complete a SEEDS challenge, not a stick or demo walk.");
  if (quest.site) {
    const metre = distanceMeter(quest.site, claim);
    if (metre > quest.site.radius_m + Math.min(claim.accuracy_m, QUEST_ACCURACY_MAX_M)) {
      refuse.push(`You are ${Math.round(metre)} m from ${quest.site.name}; it counts within ${quest.site.radius_m} m.`);
    }
  }
  if (quest.quest_kind === "log_species" && !(claim.species_code && quest.species_code.includes(claim.species_code))) {
    refuse.push("The species logged is not one this challenge asks for.");
  }
  if (quest.quest_kind === "log_any" && !claim.species_code) refuse.push("Log what you found first.");
  if (quest.is_photo && !claim.has_photo) refuse.push("This challenge needs a photo with the log.");
  if (quest.is_site_code && !context.is_site_code_ok) refuse.push("That site code is wrong or has expired. Ask for the one on screen now.");
  if (refuse.length) return { status: "refused", reason: refuse };

  const flag = plausibilityFlag(claim, context.last_claim, context.now_ms);
  if (context.strike_count >= STRIKE_REVIEW_AT) flag.push("Earlier claims from this walker were voided, so every claim is checked by a person.");
  if (flag.length) return { status: "review", reason: flag };
  return { status: "accepted", reason: [] };
}

/* ── input hygiene (both directions are untrusted) ───────────────────────── */

const CODE_RE = /^[a-z0-9-]{4,40}$/;
export const isQuestCode = (raw: unknown): raw is string => typeof raw === "string" && CODE_RE.test(raw);
const CLASS_RE = /^[A-Z0-9]{4,12}$/;
export const isClassCode = (raw: unknown): raw is string => typeof raw === "string" && CLASS_RE.test(raw);

function cleanText(raw: unknown, max: number): string {
  return typeof raw === "string" ? raw.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
}
const finite = (raw: unknown): raw is number => typeof raw === "number" && Number.isFinite(raw);

export function sanitizeClaim(raw: unknown): QuestClaimInput | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isQuestCode(r.quest_code) || typeof r.player_id !== "string" || r.player_id.length < 8 || r.player_id.length > 80) return null;
  if (!finite(r.lat) || !finite(r.lon) || Math.abs(r.lat) > 90 || Math.abs(r.lon) > 180) return null;
  const fix_source = r.fix_source === "gps" || r.fix_source === "demo" || r.fix_source === "play" ? r.fix_source : "play";
  const path = Array.isArray(r.path)
    ? r.path
        .slice(-QUEST_PATH_MAX)
        .filter((p): p is { lat: number; lon: number; accuracy_m: number; at: number } => {
          const q = p as Record<string, unknown>;
          return !!q && finite(q.lat) && finite(q.lon) && finite(q.accuracy_m) && finite(q.at);
        })
        .map((p) => ({ lat: p.lat, lon: p.lon, accuracy_m: p.accuracy_m, at: p.at }))
    : [];
  return {
    quest_code: r.quest_code,
    player_id: r.player_id,
    display_name: cleanText(r.display_name, 40) || "A walker",
    species_code: typeof r.species_code === "string" && /^[a-z0-9-]{2,60}$/.test(r.species_code) ? r.species_code : null,
    lat: r.lat,
    lon: r.lon,
    accuracy_m: finite(r.accuracy_m) && r.accuracy_m >= 0 ? Math.min(r.accuracy_m, 100_000) : 0,
    fix_source,
    site_code: typeof r.site_code === "string" ? r.site_code.slice(0, 12) : null,
    has_photo: r.has_photo === true,
    path,
  };
}

export interface QuestDraft {
  title: string;
  brief: string;
  quest_kind: QuestKind;
  species_code: string[];
  site: QuestSite | null;
  start_at: string;
  end_at: string;
  point: number;
  is_site_code: boolean;
  is_photo: boolean;
  class_code: string | null;
}

/** An organiser's form, checked before it is stored. Null with the reason when it cannot be. */
export function sanitizeQuestDraft(raw: unknown): { draft: QuestDraft } | { error: string } {
  if (!raw || typeof raw !== "object") return { error: "No challenge sent." };
  const r = raw as Record<string, unknown>;
  const title = cleanText(r.title, QUEST_TITLE_MAX);
  if (title.length < 3) return { error: "Give the challenge a title." };
  const quest_kind = QUEST_KIND.includes(r.quest_kind as QuestKind) ? (r.quest_kind as QuestKind) : null;
  if (!quest_kind) return { error: "Pick what the challenge asks for." };
  const species_code = Array.isArray(r.species_code)
    ? [...new Set(r.species_code.filter((s): s is string => typeof s === "string" && /^[a-z0-9-]{2,60}$/.test(s)))].slice(0, QUEST_SPECIES_MAX)
    : [];
  if (quest_kind === "log_species" && !species_code.length) return { error: "Name at least one species." };
  let site: QuestSite | null = null;
  if (r.site && typeof r.site === "object") {
    const s = r.site as Record<string, unknown>;
    if (!finite(s.lat) || !finite(s.lon) || Math.abs(s.lat) > 90 || Math.abs(s.lon) > 180) return { error: "The site has no valid position." };
    const radius_m = finite(s.radius_m) ? Math.min(QUEST_RADIUS_MAX_M, Math.max(QUEST_RADIUS_MIN_M, Math.round(s.radius_m))) : 40;
    site = { lat: s.lat, lon: s.lon, radius_m, name: cleanText(s.name, 60) || "the site" };
  }
  if (quest_kind === "visit" && !site) return { error: "A visit challenge needs a site." };
  const start = Date.parse(String(r.start_at));
  const end = Date.parse(String(r.end_at));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return { error: "The window needs a start before its end." };
  if (end - start > 120 * 24 * 60 * 60 * 1000) return { error: "A challenge runs 120 days at most." };
  const point = finite(r.point) ? Math.max(0, Math.min(QUEST_POINT_MAX, Math.round(r.point))) : 50;
  const class_code = typeof r.class_code === "string" && r.class_code.trim() ? r.class_code.trim().toUpperCase() : null;
  if (class_code !== null && !isClassCode(class_code)) return { error: "A class code is 4–12 letters or digits." };
  return {
    draft: {
      title,
      brief: cleanText(r.brief, QUEST_BRIEF_MAX),
      quest_kind,
      species_code: quest_kind === "log_species" ? species_code : [],
      site,
      start_at: new Date(start).toISOString(),
      end_at: new Date(end).toISOString(),
      point,
      is_site_code: r.is_site_code === true,
      is_photo: r.is_photo === true,
      class_code,
    },
  };
}

/** What a quest asks of the student, as a short list for the card. */
export function questNeedLine(quest: Quest): string[] {
  const need: string[] = [QUEST_KIND_LABEL[quest.quest_kind]];
  if (quest.site) need.push(`at ${quest.site.name} (within ${quest.site.radius_m} m)`);
  if (quest.is_photo) need.push("with a photo");
  if (quest.is_site_code) need.push("and the code shown at the site");
  need.push("on real GPS");
  return need;
}
