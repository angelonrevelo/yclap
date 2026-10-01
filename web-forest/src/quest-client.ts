/**
 * The phone's side of SEEDS challenges: read what is open, claim one, keep
 * the class codes a student has entered. The judging is the server's
 * (`worker/quest.ts`); nothing here can make a claim pass.
 */
import type { Quest, QuestClaimInput, QuestVerdict } from "./quest.ts";
import { credentialOf, readPlayer, syncRouteOf } from "./sync.ts";
import type { Sighting, WalkFix } from "./journal.ts";
import type { Fix } from "./geo.ts";

const CLASS_KEY = "magi.class-code";

export interface QuestBoard {
  quest: Quest[];
  claim: { quest_code: string; status: "accepted" | "review" | "void"; reason: string[]; point: number; created_at: string }[];
  verified_point: number;
  now: string;
}

export function readClassCode(storage: Storage | null = typeof localStorage === "undefined" ? null : localStorage): string[] {
  try {
    const raw = JSON.parse(storage?.getItem(CLASS_KEY) ?? "[]") as unknown;
    return Array.isArray(raw) ? raw.filter((c): c is string => typeof c === "string" && /^[A-Z0-9]{4,12}$/.test(c)).slice(0, 8) : [];
  } catch {
    return [];
  }
}

export function writeClassCode(code: string[], storage: Storage | null = typeof localStorage === "undefined" ? null : localStorage): void {
  try {
    storage?.setItem(CLASS_KEY, JSON.stringify([...new Set(code)].slice(0, 8)));
  } catch {
    /* private mode */
  }
}

export async function fetchQuestBoard(class_code: string[] = readClassCode()): Promise<QuestBoard | null> {
  const player_id = readPlayer().player_id;
  const route = syncRouteOf(`/quest?player_id=${encodeURIComponent(player_id)}&class=${encodeURIComponent(class_code.join(","))}`);
  try {
    const res = await fetch(route.url, { credentials: credentialOf(route), cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as QuestBoard;
  } catch {
    return null;
  }
}

/** The most recent log that could answer this challenge: the right species, within the last hour. */
export function claimableSighting(quest: Quest, sighting: Sighting[], now_ms: number): Sighting | null {
  const recent = sighting
    .filter((s) => now_ms - Date.parse(s.created_at) <= 60 * 60 * 1000)
    .filter((s) => quest.quest_kind !== "log_species" || quest.species_code.includes(s.species_code))
    .filter((s) => !quest.is_photo || Boolean(s.photo_data))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  return recent[0] ?? null;
}

/**
 * The claim from where the phone is NOW (the server re-checks the place), the
 * log that answers it, and the last few fixes for the speed check.
 */
export function claimOf(input: {
  quest: Quest;
  fix: Fix;
  sighting: Sighting | null;
  site_code: string | null;
  name: string;
  path: WalkFix[];
}): QuestClaimInput {
  return {
    quest_code: input.quest.quest_code,
    player_id: readPlayer().player_id,
    display_name: input.name,
    species_code: input.sighting?.species_code ?? null,
    lat: input.fix.lat,
    lon: input.fix.lon,
    accuracy_m: input.fix.accuracy_m,
    fix_source: input.fix.source,
    site_code: input.site_code,
    has_photo: Boolean(input.sighting?.photo_data),
    path: input.path.slice(-20).map((f) => ({ lat: f.lat, lon: f.lon, accuracy_m: input.fix.accuracy_m, at: f.at })),
  };
}

export async function sendClaim(claim: QuestClaimInput): Promise<{ verdict: QuestVerdict; point: number } | { error: string }> {
  const route = syncRouteOf("/quest/claim");
  try {
    const res = await fetch(route.url, {
      method: "POST",
      credentials: credentialOf(route),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(claim),
    });
    const body = (await res.json().catch(() => ({}))) as { verdict?: QuestVerdict; point?: number; error?: string };
    if (body.verdict) return { verdict: body.verdict, point: body.point ?? 0 };
    return { error: body.error ?? `The server said ${res.status}.` };
  } catch {
    return { error: "No connection to the campus server. Try again where there is signal." };
  }
}
