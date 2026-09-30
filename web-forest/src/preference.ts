/**
 * Device preferences.
 *
 * Small on purpose. A preference is a promise that something will still be true
 * next time, so every key here has to be read by something real — a settings
 * screen full of switches that change nothing is worse than no settings screen,
 * because it teaches people the app does not listen.
 *
 * Stored per device under the `field-guide.*` family, like the journal and the
 * player, and for the same reason: there is no account yet, and pretending
 * otherwise would mean pretending these follow you to another phone.
 */

export interface Preference {
  /** Buzz on the actions that matter. Off by default on nothing — see `haptic.ts`. */
  is_haptic: boolean;
  /** How buildings draw: footprint + drop, translucent walls, or full prisms. */
  skyline_style: "block" | "shadow" | "hollow" | "solid";
  /** Draw the restricted grove's hatch. Off does NOT make the ground walkable. */
  is_restricted_shown: boolean;
  /** Name shown to other walkers on the live campus. */
  walker_name: string;
  /**
   * Walk without being drawn on anybody else's map. The hall shows a display
   * name at a live position to every phone in it; a student who does not want
   * that — for any reason, and they owe nobody one — sends no position at all
   * and still sees everyone else. Off by default only because the owner has
   * not yet decided who should see whom (reveal plan, Q-safety).
   */
  is_hidden_from_hall: boolean;
}

export const PREFERENCE_DEFAULT: Preference = {
  is_haptic: true,
  skyline_style: "block",
  is_restricted_shown: true,
  walker_name: "",
  is_hidden_from_hall: false,
};

const KEY = "field-guide.preference";

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function readPreference(storage: Storage | null = safeStorage()): Preference {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return { ...PREFERENCE_DEFAULT };
    const parsed = JSON.parse(raw) as Partial<Preference>;
    return {
      is_haptic: typeof parsed.is_haptic === "boolean" ? parsed.is_haptic : PREFERENCE_DEFAULT.is_haptic,
      skyline_style:
        parsed.skyline_style === "block" ||
        parsed.skyline_style === "hollow" ||
        parsed.skyline_style === "solid" ||
        parsed.skyline_style === "shadow"
          ? parsed.skyline_style
          : PREFERENCE_DEFAULT.skyline_style,
      is_restricted_shown:
        typeof parsed.is_restricted_shown === "boolean"
          ? parsed.is_restricted_shown
          : PREFERENCE_DEFAULT.is_restricted_shown,
      walker_name: typeof parsed.walker_name === "string" ? parsed.walker_name.slice(0, 40) : "",
      is_hidden_from_hall: parsed.is_hidden_from_hall === true,
    };
  } catch {
    return { ...PREFERENCE_DEFAULT };
  }
}

export function writePreference(next: Preference, storage: Storage | null = safeStorage()): Preference {
  try {
    storage?.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode */
  }
  return next;
}

/**
 * Read by `haptic.ts` on every buzz.
 *
 * A module-level cache, refreshed whenever the preference is written, because
 * the haptic path runs inside a pointer handler and must not touch
 * `localStorage` on every tap.
 */
let is_haptic_on = true;

export function setHapticEnabled(on: boolean): void {
  is_haptic_on = on;
}

export function isHapticEnabled(): boolean {
  return is_haptic_on;
}
