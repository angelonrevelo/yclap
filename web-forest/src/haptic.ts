import { isHapticEnabled } from "./preference.ts";

/**
 * Haptics — the one confirmation a walk can give you without asking you to look.
 *
 * The whole point of this app is that you are walking across a campus with your
 * eyes on a tree rather than on a screen. Every other confirmation it has —
 * a toast, a card, a number ticking up — costs a glance. A buzz does not.
 *
 * ## What this is honest about
 *
 * `navigator.vibrate` is **not supported on iOS Safari**, at all, at any
 * version. Roughly half the phones at a Manila campus showcase will therefore
 * feel nothing here, and no amount of code in this file changes that. So
 * nothing is ever *only* haptic: every buzz below accompanies something the
 * screen also says. This is a second channel, never the only one.
 *
 * It is also switchable in Settings, and respects `prefers-reduced-motion`. Vibration is motion — for someone
 * with a vestibular or sensory condition a device that shakes in the hand is
 * exactly the thing that setting is asking us not to do.
 */

/** Patterns, in milliseconds. Short: this is punctuation, not an alarm. */
const PATTERN = {
  /** A control took your input — stick engaged, marker selected. */
  tap: 8,
  /** You crossed into something: a find came into reach, a sector changed. */
  bump: [0, 14, 40, 14],
  /** It worked — a find logged, a badge earned. */
  success: [0, 12, 50, 26],
  /** It did not work, and the screen is already saying why. */
  refuse: [0, 30, 60, 30],
} as const;

export type HapticKind = keyof typeof PATTERN;

/**
 * Set by the first pointerdown / keydown anywhere — the fallback for browsers
 * without `navigator.userActivation`.
 */
let is_activated = false;
if (typeof window !== "undefined") {
  const mark = () => {
    is_activated = true;
    window.removeEventListener("pointerdown", mark, true);
    window.removeEventListener("keydown", mark, true);
  };
  window.addEventListener("pointerdown", mark, true);
  window.addEventListener("keydown", mark, true);
}

/**
 * Has the user touched the page yet? Chrome refuses (and logs a console error
 * for) any `navigator.vibrate` before the first user gesture — which a buzz on
 * a sector change or a find coming into reach would hit on every load.
 */
export function hasUserActivation(
  nav: { userActivation?: { hasBeenActive?: boolean } } | undefined = typeof navigator === "undefined" ? undefined : navigator,
): boolean {
  const seen = nav?.userActivation?.hasBeenActive;
  if (typeof seen === "boolean") return seen || is_activated;
  return is_activated;
}

function isAllowed(): boolean {
  /* The device preference wins over everything. Read from a module cache, not
     from storage: this runs inside a pointer handler. */
  if (!isHapticEnabled()) return false;
  if (typeof navigator === "undefined") return false;
  if (typeof navigator.vibrate !== "function") return false;
  /* No-op until the user has touched the page: a vibrate before that is refused. */
  if (!hasUserActivation()) return false;
  try {
    /* A device that shakes in the hand is motion, and someone who has asked for
       less of it has asked for less of this too. */
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return false;
  } catch {
    /* No matchMedia is not a reason to refuse — fall through and buzz. */
  }
  return true;
}

/**
 * Buzz, if this device can and this user wants it.
 *
 * Deliberately returns nothing and throws nothing. A caller must never branch
 * on whether the haptic fired, because on an iPhone it never will, and a code
 * path that only exists on Android is a code path nobody tests.
 */
export function haptic(kind: HapticKind = "tap"): void {
  if (!isAllowed()) return;
  try {
    navigator.vibrate(PATTERN[kind] as number | number[]);
  } catch {
    /* Some browsers throw on a gesture-less call. Never worth an error. */
  }
}

/** Stop any pattern in flight — used when a control is released or torn down. */
export function hapticStop(): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function" || !hasUserActivation()) return;
  try {
    navigator.vibrate(0);
  } catch {
    /* as above */
  }
}
