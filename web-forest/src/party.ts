/**
 * Group walks — Pokémon GO's Party Play, for a class or a barkada.
 *
 * Gelo, 10-01: "make sure multiplayer works well or group walk". The hall
 * already shows everyone out on campus; a group walk is the few people you
 * came with. Niantic's rules, from its Help Center (docs/research/anticheat.md):
 * up to 4 trainers including the host, joined with the host's code, the
 * lobby open 15 minutes, the party lasting up to 3 hours, and members kept
 * "physically near one another". Same here, with the distance made a number
 * (Niantic publishes none): group credit counts only within PARTY_NEAR_M of
 * the host.
 *
 * No new server state. A walker's live pose carries `party_tag` — a hash of
 * the 6-digit code, never the code — and the host's pose carries
 * `party_since`. Phones that know the code set the same tag; everyone else
 * sees only an opaque tag and cannot join without the code. Which walkers
 * share your tag is your group.
 */
import { distanceMeter, type LatLon } from "./geo.ts";

export const PARTY_MAX = 4;
export const PARTY_LOBBY_MS = 15 * 60 * 1000;
export const PARTY_MAX_MS = 3 * 60 * 60 * 1000;
export const PARTY_NEAR_M = 100;
export const PARTY_CODE_DIGIT = 6;
const PARTY_KEY = "magi.party";

export interface Party {
  code: string;
  role: "host" | "member";
  /** ms epoch the host started it (a member copies the host's). */
  since: number;
}

export function newPartyCode(random: () => number = Math.random): string {
  return String(Math.floor(random() * 10 ** PARTY_CODE_DIGIT)).padStart(PARTY_CODE_DIGIT, "0");
}

export function cleanPartyCode(raw: string): string | null {
  const code = raw.replace(/\D/g, "");
  return code.length === PARTY_CODE_DIGIT ? code : null;
}

/** What rides on the pose: 8 hex characters, one-way from the code. */
export function partyTagOf(code: string): string {
  let h = 2166136261;
  const text = `party:${code}`;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  let g = 5381;
  for (let i = 0; i < text.length; i += 1) g = (Math.imul(g, 33) ^ text.charCodeAt(i)) >>> 0;
  return ((h ^ (g << 7)) >>> 0).toString(16).padStart(8, "0");
}

export const isPartyTag = (raw: unknown): raw is string => typeof raw === "string" && /^[0-9a-f]{8}$/.test(raw);

export interface PartyWalker extends LatLon {
  walker_id: string;
  name: string;
  party_tag?: string;
  party_since?: number;
}

/** The other walkers in your group, host first. */
export function partyMemberOf(walker: PartyWalker[], party: Party | null): PartyWalker[] {
  if (!party) return [];
  const tag = partyTagOf(party.code);
  return walker
    .filter((w) => w.party_tag === tag)
    .sort((a, b) => Number(Boolean(b.party_since)) - Number(Boolean(a.party_since)))
    .slice(0, PARTY_MAX - 1);
}

export type JoinVerdict = { ok: true; since: number } | { ok: false; reason: string };

/**
 * May this phone join the group with this code, now? The host must be out
 * (their pose carries the tag and `party_since`), the lobby still open, the
 * group not full, and you near enough to be walking with them.
 */
export function canJoin(code: string, walker: PartyWalker[], me: LatLon | null, now: number): JoinVerdict {
  const tag = partyTagOf(code);
  const host = walker.find((w) => w.party_tag === tag && typeof w.party_since === "number");
  if (!host) return { ok: false, reason: "No group with that code is out right now. Check the code with the host." };
  if (now - (host.party_since ?? 0) > PARTY_LOBBY_MS) return { ok: false, reason: "That group stopped taking new walkers 15 minutes after it started. Ask the host to start a new one." };
  if (walker.filter((w) => w.party_tag === tag).length >= PARTY_MAX) return { ok: false, reason: `That group is full (${PARTY_MAX} walkers).` };
  if (!me) return { ok: false, reason: "Turn on your position first: a group walks together." };
  const metre = distanceMeter(me, host);
  if (metre > PARTY_NEAR_M) return { ok: false, reason: `You are ${Math.round(metre)} m from ${host.name}. Join when you are together.` };
  return { ok: true, since: host.party_since ?? now };
}

export function isPartyOver(party: Party, now: number): boolean {
  return now - party.since > PARTY_MAX_MS;
}

/** Is this member close enough to the host for group credit? */
export function isWithHost(member: LatLon, host: LatLon): boolean {
  return distanceMeter(member, host) <= PARTY_NEAR_M;
}

export function readParty(storage: Storage | null = typeof localStorage === "undefined" ? null : localStorage, now = Date.now()): Party | null {
  try {
    const raw = JSON.parse(storage?.getItem(PARTY_KEY) ?? "null") as Party | null;
    if (!raw || !cleanPartyCode(raw.code) || (raw.role !== "host" && raw.role !== "member") || !Number.isFinite(raw.since)) return null;
    return isPartyOver(raw, now) ? null : raw;
  } catch {
    return null;
  }
}

export function writeParty(party: Party | null, storage: Storage | null = typeof localStorage === "undefined" ? null : localStorage): void {
  try {
    if (party) storage?.setItem(PARTY_KEY, JSON.stringify(party));
    else storage?.removeItem(PARTY_KEY);
  } catch {
    /* private mode: the group lasts this page only */
  }
}

/** Species the group logged together since it started: theirs (by world finds) and yours. */
export function partySpecies(
  party: Party,
  member_walker_id: Set<string>,
  find: { walker_id: string; species_code: string; created_at: string }[],
  mine: { species_code: string; created_at: string }[],
): Set<string> {
  const after = (iso: string) => Date.parse(iso) >= party.since;
  return new Set([
    ...find.filter((f) => member_walker_id.has(f.walker_id) && after(f.created_at)).map((f) => f.species_code),
    ...mine.filter((s) => after(s.created_at)).map((s) => s.species_code),
  ]);
}

export const PARTY_GOAL_SPECIES = 3;
