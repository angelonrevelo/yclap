import { useCallback, useEffect, useRef, useState } from "react";
import { demoWalkAt, distanceMeter, isInsideCampus, type Fix, type GeoState, type LatLon } from "./geo";
import {
  PLAY_START,
  stickStartOf,
  PLAY_TICK_MS,
  headingFromKey,
  headingFromStick,
  isWalkable,
  PLAY_DEFAULT_SPAN_M,
  playMeterForTick,
  stepPlayWalk,
  stepToward,
  throttleFromStick,
  type PlayHeld,
  type PlayStick,
} from "./play-walk";
import { filterFix, type FixFilter } from "./fix-filter";

const DEMO_LOOP_MS = 42000;
const DEMO_TICK_MS = 120;

const WATCH_OPTION: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 2000,
};

const IDLE_HELD: PlayHeld = { north: false, south: false, east: false, west: false };
const IDLE_STICK: PlayStick = { x: 0, y: 0 };

export type GeoMode = "play" | "demo" | "gps";

export function nextGeoMode(mode: GeoMode): GeoMode {
  if (mode === "gps") return "play";
  if (mode === "play") return "demo";
  return "gps";
}

export function geoModeLabel(mode: GeoMode, gps_status: GeoState["status"]): string {
  if (mode === "play") return "Play walk";
  if (mode === "demo") return "Demo campus";
  if (gps_status === "watching") return "My location";
  if (gps_status === "prompting") return "Finding you…";
  return "My location";
}

function messageFor(code: number): string {
  if (code === 1) return "Location permission denied. Play walk still works on this campus.";
  if (code === 2) return "No position fix here. Play walk still works on this campus.";
  return "Location timed out. Play walk still works on this campus.";
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

function applyKey(held: PlayHeld, code: string, is_down: boolean): PlayHeld | null {
  const next = { ...held };
  if (code === "KeyW" || code === "ArrowUp") next.north = is_down;
  else if (code === "KeyS" || code === "ArrowDown") next.south = is_down;
  else if (code === "KeyA" || code === "ArrowLeft") next.west = is_down;
  else if (code === "KeyD" || code === "ArrowRight") next.east = is_down;
  else return null;
  return next;
}

/**
 * One position source for the whole app.
 *
 * `gps`  — this device. Default. Compass returns here at street zoom.
 * `play` — you steer (WASD / arrows / tap) when a fix is not available.
 * `demo` — the scripted campus loop, for a projector that must move itself.
 */
export function useGeo(
  mode: GeoMode,
  bearing_degree = 0,
  /**
   * How much ground the camera can see, in metres.
   *
   * The stick's pace is a fraction of this, so steering feels the same whether
   * the camera is at the street or pulled back — see `play-walk.ts`. Omitted,
   * it falls back to the close camera's span, which is what the keyboard used
   * before any of this was zoom-aware.
   */
  view_span_m = PLAY_DEFAULT_SPAN_M,
): GeoState & {
  is_off_campus: boolean;
  walkTo: (point: LatLon) => void;
  steer: (stick: PlayStick) => void;
} {
  const [state, setState] = useState<GeoState>({ status: "idle", fix: null, message: null });
  const started_at = useRef<number>(Date.now());
  const play_at = useRef<LatLon>(stickStartOf(typeof window === "undefined" ? "" : window.location.search));
  const held = useRef<PlayHeld>(IDLE_HELD);
  const stick = useRef<PlayStick>(IDLE_STICK);
  const is_run = useRef(false);
  const destination = useRef<LatLon | null>(null);
  const last_tick = useRef<number>(Date.now());
  const last_fix = useRef<Fix | null>(null);
  last_fix.current = state.fix;
  const bearing_ref = useRef(bearing_degree);
  bearing_ref.current = bearing_degree;
  /* A ref, not a dependency: the span changes on every zoom frame and the walk
     tick reads it when it ticks. Listing it would tear down and rebuild the
     keyboard listeners and the interval sixty times a second mid-gesture. */
  const span_ref = useRef(view_span_m);
  span_ref.current = view_span_m;

  const publishPlay = useCallback((point: LatLon) => {
    play_at.current = point;
    setState({
      status: "play",
      fix: { ...point, accuracy_m: 5, at: Date.now(), source: "play" },
      message: null,
    });
  }, []);

  const walkTo = useCallback(
    (point: LatLon) => {
      if (mode !== "play") return;
      destination.current = point;
      held.current = IDLE_HELD;
      stick.current = IDLE_STICK;
    },
    [mode],
  );

  /**
   * Push the thumbstick.
   *
   * A ref, not state: the stick moves on every pointer frame and the walk
   * samples it on its own clock. Routing that through `setState` would rerender
   * the whole app sixty times a second to move a knob 3 px.
   *
   * Steering cancels a walk-to, the same way a key does — the stick is a
   * stronger statement of intent than a tap made two seconds ago.
   */
  const steer = useCallback((next: PlayStick) => {
    stick.current = next;
    if (next.x !== 0 || next.y !== 0) destination.current = null;
  }, []);

  useEffect(() => {
    if (mode !== "demo") return;
    started_at.current = Date.now();
    const tick = () => {
      const progress = ((Date.now() - started_at.current) % DEMO_LOOP_MS) / DEMO_LOOP_MS;
      const point = demoWalkAt(progress);
      setState({
        status: "demo",
        fix: { ...point, accuracy_m: 5, at: Date.now(), source: "demo" },
        message: null,
      });
    };
    tick();
    const timer = window.setInterval(tick, DEMO_TICK_MS);
    return () => window.clearInterval(timer);
  }, [mode]);

  useEffect(() => {
    if (mode !== "gps") return;
    if (!("geolocation" in navigator)) {
      setState({
        status: "unavailable",
        fix: null,
        message: "This browser has no geolocation. Switch back to Play walk.",
      });
      return;
    }
    setState((prev) => ({
      status: "prompting",
      fix: prev.fix,
      message: "Asking this device for a position…",
    }));
    /* Raw fixes wander by metres standing still; see `fix-filter.ts`. A fix
       the dead-band holds in place is not published at all, so standing still
       costs no render and no camera move. */
    let filter: FixFilter | null = null;
    const watch_id = navigator.geolocation.watchPosition(
      (position) => {
        const raw: Fix = {
          lat: position.coords.latitude,
          lon: position.coords.longitude,
          accuracy_m: position.coords.accuracy,
          at: position.timestamp,
          source: "gps",
        };
        const was_shown = filter?.shown ?? null;
        const next = filterFix(filter, raw);
        filter = next.state;
        setState((prev) =>
          prev.status === "watching" && next.fix === was_shown && prev.fix === was_shown
            ? prev
            : { status: "watching", fix: next.fix, message: null },
        );
      },
      (err) => {
        setState({
          status: err.code === 1 ? "denied" : "unavailable",
          fix: null,
          message: messageFor(err.code),
        });
      },
      WATCH_OPTION,
    );
    return () => navigator.geolocation.clearWatch(watch_id);
  }, [mode]);

  useEffect(() => {
    if (mode !== "play") return;
    held.current = IDLE_HELD;
    stick.current = IDLE_STICK;
    is_run.current = false;
    destination.current = null;
    const seed = last_fix.current && isWalkable(last_fix.current) ? last_fix.current : play_at.current;
    publishPlay(isWalkable(seed) ? seed : PLAY_START);
    last_tick.current = Date.now();

    const onDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
        is_run.current = true;
        return;
      }
      const next = applyKey(held.current, event.code, true);
      if (!next) return;
      event.preventDefault();
      held.current = next;
      destination.current = null;
    };
    const onUp = (event: KeyboardEvent) => {
      if (event.code === "ShiftLeft" || event.code === "ShiftRight") {
        is_run.current = false;
        return;
      }
      const next = applyKey(held.current, event.code, false);
      if (!next) return;
      held.current = next;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);

    const tick = () => {
      const now = Date.now();
      const dt = Math.min(120, now - last_tick.current);
      last_tick.current = now;
      /* Stick first, then keys, then a standing walk-to. The stick is the
         only analogue one of the three, so it is also the only one that can
         ask for less than a full pace. */
      const stick_heading = headingFromStick(stick.current, bearing_ref.current);
      const heading =
        stick_heading ?? headingFromKey(held.current, bearing_ref.current);
      const throttle = stick_heading === null ? 1 : throttleFromStick(stick.current);
      const meter = playMeterForTick(dt, is_run.current, throttle, span_ref.current);
      let at = play_at.current;
      if (heading !== null) at = stepPlayWalk(at, heading, meter);
      else if (destination.current) {
        at = stepToward(at, destination.current, meter);
        if (distanceMeter(at, destination.current) < 0.6) destination.current = null;
      } else {
        return;
      }
      publishPlay(at);
    };
    const timer = window.setInterval(tick, PLAY_TICK_MS);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.clearInterval(timer);
    };
  }, [mode, publishPlay]);

  const is_off_campus = state.status === "watching" && state.fix !== null && !isInsideCampus(state.fix);
  return { ...state, is_off_campus, walkTo, steer };
}
