/**
 * In-app navigation that keeps the demo's query string.
 *
 * A projector demo is set up by the URL — `?time=day&bearing=90&boot=off&at=…`
 * — and every route change used to push a bare path, so the first save that
 * landed on /journal quietly dropped the pinned daylight and the next reload
 * booted into night. Every `pushState`/`replaceState` in the app goes through
 * here, and here only the demo knobs are carried over: a one-shot param such
 * as `?account_error=` must not follow the player around.
 */

/** The query params that set up a demo, carried across every route change. */
export const DEMO_PARAM = [
  "time",
  "bearing",
  "boot",
  "zoom",
  "at",
  "skyline",
  "weather",
  "seed",
  "sync",
  "view",
  "probe",
  /* `?avatar=hiker` — the proposed 3D walker (src/avatar.ts). A demo that
     shows it must keep showing it after the first tap to the Journal. */
  "avatar",
] as const;

/** `path` with whichever demo params `search` carries, in DEMO_PARAM order. */
export function withDemoQuery(path: string, search: string): string {
  const from = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const key of DEMO_PARAM) {
    const value = from.get(key);
    if (value !== null) kept.set(key, value);
  }
  const query = kept.toString();
  return query ? `${path}?${query}` : path;
}

/** Push (or replace) a route, keeping the demo params of the current URL. */
export function navigateTo(path: string, mode: "push" | "replace" = "push"): void {
  const url = withDemoQuery(path, window.location.search);
  if (mode === "replace") window.history.replaceState({}, "", url);
  else window.history.pushState({}, "", url);
}
