/**
 * "Hide this walker" — a mute on THIS phone only.
 *
 * Tapping a remote walker's name tag and choosing Hide takes them off your
 * map and out of your "… logged Molave" feed. Nobody is told, nothing leaves
 * the phone, and the walker still counts in "N walkers out" (they ARE out; the
 * count is not yours to edit). Keyed by the hall's `walker_id`, the one-way
 * hash — the only id this phone ever learns about somebody else.
 *
 * The server-side version, which hides a walker from everybody, is a
 * moderator's (`worker/moderation.ts`).
 */

export const MUTE_KEY = "field-guide.muted-walker";
/** Enough for anyone; a list this long is somebody tapping for fun. */
export const MUTE_MAX = 200;

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function readMuted(storage: Storage | null = safeStorage()): Set<string> {
  try {
    const raw = JSON.parse(storage?.getItem(MUTE_KEY) ?? "[]") as unknown;
    return new Set(Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string").slice(-MUTE_MAX) : []);
  } catch {
    return new Set();
  }
}

function write(muted: Set<string>, storage: Storage | null): Set<string> {
  try {
    if (!muted.size) storage?.removeItem(MUTE_KEY);
    else storage?.setItem(MUTE_KEY, JSON.stringify([...muted].slice(-MUTE_MAX)));
  } catch {
    /* private mode: the mute lasts as long as the tab */
  }
  notify();
  return muted;
}

export function muteWalker(walker_id: string, storage: Storage | null = safeStorage()): Set<string> {
  const muted = readMuted(storage);
  muted.add(walker_id);
  return write(muted, storage);
}

export function unmuteAll(storage: Storage | null = safeStorage()): Set<string> {
  return write(new Set(), storage);
}

/* Same-tab listeners: the map and Settings both read the list. */
const listener = new Set<() => void>();

export function onMuteChange(fn: () => void): () => void {
  listener.add(fn);
  return () => listener.delete(fn);
}

function notify(): void {
  for (const fn of listener) fn();
}
