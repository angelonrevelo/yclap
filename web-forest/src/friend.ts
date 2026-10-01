import { weekKey } from "./gamify.ts";
import { normalizeJoinCode, walkerIdOf, type WorldFind } from "./campus-world.ts";

/**
 * Walking partners, and the streak they keep together.
 *
 * Two asks arrive here as one feature, because they are one feature.
 *
 *   - The Working Doc, under "Group streak": *"May work as a shared/group
 *     streak: the group remains active as long as at least one member
 *     participates during the week, similar to a group chat streak. Note to
 *     Gelo: Is this feasible?"*
 *   - The 09-21 recording, `29:17`: *"tas pati ko din lagyan ng parang friends
 *     system"* — and `35:37`, on group streaks and whether one member's points
 *     can carry the group.
 *
 * The answer to "is this feasible" is yes, and this file is the reason: the
 * sync layer already carries every ingredient. `World.find[]` stamps each find
 * with a `walker_id` and a `created_at`, so "did anyone in this group
 * participate in week W" is a question the data already answers. Nothing new
 * has to be collected and no server-side group table has to exist.
 *
 * ## What a group IS here, stated plainly
 *
 * A group is **this device's friend list plus this device**. It is local: the
 * roster lives in `localStorage`, nobody is notified, nothing is shared, and
 * adding somebody is not a request they can accept or decline. That is a real
 * limitation and it is deliberate for now — a mutual friend graph needs an
 * account system, a consent flow and a privacy position that the Working Doc
 * explicitly lists as an open decision ("Define what student, photo and
 * location data are collected, who can access them, retention, and consent
 * language before launch"). Shipping a one-sided roster that only reads
 * already-public campus finds does not prejudge any of that.
 *
 * So the streak is honest but asymmetric: your group streak is yours. Two
 * friends who have added each other will see the same number, because the
 * inputs are the same finds; two who have not, will not. The surface says so.
 */

/**
 * A walking partner, as this device knows them — by `walker_id`, the one-way
 * hash every phone already sees, never by the partner's `player_id` (their
 * bearer secret). Rosters saved before 10-01 hold a `player_id`; `readFriend`
 * hashes it on the way in and the next write stores only the hash.
 */
export interface Friend {
  walker_id: string;
  name: string;
  /** The code that was typed to add them. Kept so the row can be re-shared. */
  join_code: string;
  added_at: string;
}

const FRIEND_KEY = "field-guide.friend";

/** No roster limit is a memory leak with a social label on it. */
export const MAX_FRIEND = 24;

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function readFriend(storage: Storage | null = safeStorage()): Friend[] {
  try {
    const raw = storage?.getItem(FRIEND_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const friend: Friend[] = [];
    for (const row of parsed) {
      if (!row || typeof row.name !== "string") continue;
      const walker_id =
        typeof row.walker_id === "string" && row.walker_id
          ? row.walker_id
          : typeof row.player_id === "string" && row.player_id
            ? walkerIdOf(row.player_id)
            : "";
      if (!walker_id) continue;
      friend.push({
        walker_id,
        name: row.name,
        join_code: typeof row.join_code === "string" ? row.join_code : "",
        added_at: typeof row.added_at === "string" ? row.added_at : "",
      });
    }
    return friend.slice(0, MAX_FRIEND);
  } catch {
    return [];
  }
}

export function writeFriend(friend: Friend[], storage: Storage | null = safeStorage()): void {
  try {
    storage?.setItem(FRIEND_KEY, JSON.stringify(friend.slice(0, MAX_FRIEND)));
  } catch {
    /* private mode */
  }
}

/**
 * Add a walker to the roster.
 *
 * Returns the new roster, unchanged if the walker is already on it or is this
 * device itself. Adding yourself is not an error a person needs to be told
 * about — it is a typo, and the group already contains you.
 */
export function addFriend(
  friend: Friend[],
  walker: { walker_id: string; name: string; join_code?: string },
  me_walker_id: string,
  now: Date = new Date(),
): Friend[] {
  if (!walker.walker_id || walker.walker_id === me_walker_id) return friend;
  if (friend.some((f) => f.walker_id === walker.walker_id)) return friend;
  if (friend.length >= MAX_FRIEND) return friend;
  return [
    ...friend,
    {
      walker_id: walker.walker_id.slice(0, 64),
      name: (walker.name || "Walker").slice(0, 40),
      join_code: normalizeJoinCode(walker.join_code ?? ""),
      added_at: now.toISOString(),
    },
  ];
}

export function removeFriend(friend: Friend[], walker_id: string): Friend[] {
  return friend.filter((f) => f.walker_id !== walker_id);
}

/** Everyone whose participation keeps the group's week alive, by `walker_id`. */
export function groupMember(friend: Friend[], me_walker_id: string): Set<string> {
  return new Set([me_walker_id, ...friend.map((f) => f.walker_id)]);
}

export interface GroupStreak {
  /** Consecutive weeks in which at least one member participated. */
  weeks: number;
  /** True when this week is already carried. */
  is_week_carried: boolean;
  /** Who carried this week, by name. Empty when nobody has yet. */
  carried_by: string[];
  /** Members in the group, including this device. */
  member_count: number;
}

/**
 * The group streak.
 *
 * "At least one member participated" is the whole rule, straight from the
 * Working Doc, and it is what makes this different from the personal streak:
 * a week a member carries is a week you did not have to. Deliberately NOT a sum
 * of points — `35:37` floated points contributing to a group total, and a total
 * makes the group a leaderboard, which is the thing a streak is supposed to be
 * the alternative to.
 *
 * Computed over the synced world's finds rather than over this device's point
 * events, because only the world knows what somebody else did.
 */
export function groupStreak(
  find: Pick<WorldFind, "walker_id" | "player_name" | "created_at">[],
  member: ReadonlySet<string>,
  now: Date = new Date(),
): GroupStreak {
  const week_member = new Map<string, Set<string>>();
  for (const row of find) {
    if (!member.has(row.walker_id)) continue;
    const key = weekKey(row.created_at);
    if (key === "invalid") continue;
    const set = week_member.get(key) ?? new Set<string>();
    set.add(row.player_name || "A walker");
    week_member.set(key, set);
  }

  const this_week = weekKey(now);
  const is_week_carried = week_member.has(this_week);

  let weeks = 0;
  /* An idle current week does not break a streak that was alive last week —
     the week is not over yet. Same rule the personal streak follows. */
  let cursor = is_week_carried ? new Date(now) : new Date(now.getTime() - 7 * 86400000);
  for (;;) {
    const key = weekKey(cursor);
    if (!week_member.has(key)) break;
    weeks += 1;
    cursor = new Date(cursor.getTime() - 7 * 86400000);
    if (weeks > 520) break;
  }

  return {
    weeks,
    is_week_carried,
    carried_by: [...(week_member.get(this_week) ?? [])].sort(),
    member_count: member.size,
  };
}

/* ── the week log behind the group streak ───────────────────────────────────
 *
 * The streak above reads the world's finds, and the world keeps only the last
 * six hours (80 finds): a group streak computed from it could never reach a
 * second week (10-01 audit). So this phone remembers, compactly, which walker
 * was out in which week — one row per walker per week, nothing else, capped —
 * and the streak reads that log plus the live world.
 */
const WEEK_LOG_KEY = "magi.friend-week";
const WEEK_LOG_MAX = 1500;

export interface WeekLogRow {
  walker_id: string;
  player_name: string;
  week_key: string;
  /** Any moment inside that week, so `weekKey` maps it back. */
  created_at: string;
}

export function readWeekLog(storage: Storage | null = typeof localStorage === "undefined" ? null : localStorage): WeekLogRow[] {
  try {
    const raw = JSON.parse(storage?.getItem(WEEK_LOG_KEY) ?? "[]") as unknown;
    return Array.isArray(raw)
      ? raw.filter((r): r is WeekLogRow => !!r && typeof r.walker_id === "string" && typeof r.week_key === "string" && typeof r.created_at === "string")
      : [];
  } catch {
    return [];
  }
}

/** Fold the world's finds into the log; returns the log. Newest weeks are kept when it is full. */
export function rememberWeek(
  find: Pick<WorldFind, "walker_id" | "player_name" | "created_at">[],
  storage: Storage | null = typeof localStorage === "undefined" ? null : localStorage,
): WeekLogRow[] {
  const log = readWeekLog(storage);
  const seen = new Set(log.map((r) => `${r.walker_id}|${r.week_key}`));
  let is_changed = false;
  for (const f of find) {
    const week_key = weekKey(f.created_at);
    if (week_key === "invalid" || seen.has(`${f.walker_id}|${week_key}`)) continue;
    seen.add(`${f.walker_id}|${week_key}`);
    log.push({ walker_id: f.walker_id, player_name: f.player_name || "A walker", week_key, created_at: f.created_at });
    is_changed = true;
  }
  if (!is_changed) return log;
  const kept = log.sort((a, b) => b.week_key.localeCompare(a.week_key)).slice(0, WEEK_LOG_MAX);
  try {
    storage?.setItem(WEEK_LOG_KEY, JSON.stringify(kept));
  } catch {
    /* full or private: the streak falls back to the live world */
  }
  return kept;
}
