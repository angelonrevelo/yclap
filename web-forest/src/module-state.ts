/**
 * State for the campus modules — which layers are shown, the emergency route
 * and the trail being walked. Split from `module-ui.tsx` so that file exports
 * components only (fast refresh); `app.tsx` calls `useModuleState` once.
 */
import { useMemo, useState } from "react";
import {
  GROUP_LABEL,
  emptyLine,
  featureInGroup,
  featureLabel,
  groupOf,
  nearestHelp,
  type EmergencyFeature,
  type EmergencyGroup,
} from "./emergency";
import type { Fix, LatLon } from "./geo";
import { configFromQuery, type ModuleId } from "./module";
import type { Route } from "./route";
import { TRAIL, planTrail, type TrailPlan } from "./trail";

export type EmergencyRouteState =
  | { status: "idle" }
  | { status: "found"; group: EmergencyGroup; feature: EmergencyFeature; route: Route; from_label: string }
  | { status: "none"; group: EmergencyGroup; line: string };

export interface ModuleState {
  module_on: ModuleId[];
  is_panel_open: boolean;
  setPanelOpen: (is_open: boolean) => void;
  /** Which layers are drawn right now — a module can be enabled but hidden. */
  shown: Record<"hotspot" | "emergency" | "flood" | "trail" | "track", boolean>;
  toggle: (key: "hotspot" | "emergency" | "flood" | "trail" | "track") => void;
  picked_feature: EmergencyFeature | null;
  pickFeature: (f: EmergencyFeature | null) => void;
  help: EmergencyRouteState;
  routeToNearest: (group: EmergencyGroup, from: LatLon, from_label: string) => void;
  routeToFeature: (f: EmergencyFeature, from: LatLon, from_label: string) => void;
  clearHelp: () => void;
  trail_plan: TrailPlan | null;
  trail_at: number;
  startTrail: (trail_code: string) => void;
  stepTrail: (delta: number) => void;
  endTrail: () => void;
}

export function useModuleState(): ModuleState {
  const config = useMemo(() => configFromQuery(typeof window === "undefined" ? "" : window.location.search), []);
  const module_on = config.module_on;
  const [is_panel_open, setPanelOpen] = useState(false);
  const [shown, setShown] = useState({ hotspot: false, emergency: false, flood: false, trail: false, track: false });
  const [picked_feature, pickFeature] = useState<EmergencyFeature | null>(null);
  const [help, setHelp] = useState<EmergencyRouteState>({ status: "idle" });
  const [trail_plan, setTrailPlan] = useState<TrailPlan | null>(null);
  const [trail_at, setTrailAt] = useState(0);

  return {
    module_on,
    is_panel_open,
    setPanelOpen,
    shown,
    toggle: (key) => setShown((prev) => ({ ...prev, [key]: !prev[key] })),
    picked_feature,
    pickFeature,
    help,
    routeToNearest: (group, from, from_label) => {
      setShown((prev) => ({ ...prev, emergency: true }));
      const found = nearestHelp(from, group);
      if (found) setHelp({ status: "found", group, feature: found.feature, route: found.route, from_label });
      else {
        const line = featureInGroup(group).length === 0 ? emptyLine(group) : `No walkable way found to any of the ${GROUP_LABEL[group].toLowerCase()} from ${from_label}.`;
        setHelp({ status: "none", group, line });
      }
    },
    routeToFeature: (f, from, from_label) => {
      setShown((prev) => ({ ...prev, emergency: true }));
      const found = nearestHelp(from, groupOf(f.kind), [f]);
      if (found) setHelp({ status: "found", group: groupOf(f.kind), feature: f, route: found.route, from_label });
      else setHelp({ status: "none", group: groupOf(f.kind), line: `No walkable way found to ${featureLabel(f)} from ${from_label}.` });
    },
    clearHelp: () => setHelp({ status: "idle" }),
    trail_plan,
    trail_at,
    startTrail: (trail_code) => {
      const trail = TRAIL.find((t) => t.trail_code === trail_code);
      if (!trail) return;
      setTrailPlan(planTrail(trail));
      setTrailAt(0);
      setShown((prev) => ({ ...prev, trail: true }));
      setPanelOpen(false);
    },
    stepTrail: (delta) => setTrailAt((at) => Math.max(0, Math.min((trail_plan?.trail.stop.length ?? 1) - 1, at + delta))),
    endTrail: () => {
      setTrailPlan(null);
      setTrailAt(0);
    },
  };
}

/** Attribution each shown layer owes — ODbL for the OSM and NOAH layers, credit for iNat counts. */
export function moduleAttribution(state: ModuleState): string[] {
  const out: string[] = [];
  if (state.shown.emergency || state.help.status === "found") out.push("Emergency points © OpenStreetMap contributors, ODbL");
  if (state.shown.flood) out.push("Flood hazard © UP NOAH, ODbL");
  if (state.shown.hotspot) out.push("Observation counts © iNaturalist users");
  return out;
}

/**
 * What a route's start is called. Only a GPS fix is "you": a demo or play
 * position is where the presenter's walker stands, and with no fix at all the
 * route starts from the campus centre and must say so.
 */
export function fromLabel(fix: Fix | null): string {
  if (!fix) return "the campus centre (no location fix)";
  return fix.source === "gps" ? "you" : "the walker (demo position)";
}
