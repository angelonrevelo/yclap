import { useEffect, type CSSProperties, type ReactNode } from "react";
import { species_art } from "./asset/kit";
import { species } from "./data";
import {
  EMERGENCY_FILE,
  FLOOD_COLOUR,
  FLOOD_FILE,
  FLOOD_LABEL,
  GROUP_LABEL,
  ROUTABLE_GROUP,
  featureInGroup,
  featureLabel,
  floodHazardAt,
  floodLine,
  groupLine,
  groupOf,
  isOnCampus,
  type EmergencyFeature,
  type EmergencyGroup,
} from "./emergency";
import { distanceMeter, formatMeter, formatWalkMinute, type LatLon } from "./geo";
import { hotspotEmptyLine, hotspotMethodLine, hotspotOf, hotspotRank, richnessShade } from "./hotspot";
import { enabledModule, moduleById, type ModuleId } from "./module";
import type { EmergencyRouteState, ModuleState } from "./module-state";
import { sector, sectorByCode } from "./sector";
import type { Projection } from "./tile-map";
import { TRAIL, progressLine, remainingMeter, type TrailPlan } from "./trail";

/**
 * The campus-module UI: the layers each module draws on the field map, and
 * the dock that switches them and runs "route to the nearest" and trail mode.
 *
 * Lives outside `app.tsx` on purpose (it is 4,700 lines). The app calls
 * `useModuleState` (module-state.ts) once, hands the state to `ModuleLayer` inside the map and
 * to `ModuleDock` over it, and that is the whole of its part.
 *
 * Tone, from Gelo's 09-30 note (`2:40`–`2:59`): it must read as something
 * usable, not "a childish game". So no sparkle here — plain panels, sources on
 * every section, and the emergency caveat in the heaviest type on the panel.
 */

/* ── map layers ───────────────────────────────────────────────────────────── */

function pathD(projection: Projection, point: LatLon[], is_closed = false): string {
  const d = point
    .map((p, i) => {
      const s = projection.project(p);
      return `${i === 0 ? "M" : "L"}${s.x.toFixed(1)},${s.y.toFixed(1)}`;
    })
    .join(" ");
  return is_closed ? `${d} Z` : d;
}

const GROUP_MARK: Record<EmergencyGroup, { glyph: string; colour: string }> = {
  assembly: { glyph: "A", colour: "#1B7F3B" },
  medical: { glyph: "+", colour: "#C62828" },
  safety: { glyph: "S", colour: "#1F4E9C" },
  fire: { glyph: "H", colour: "#B3261E" },
  health: { glyph: "Rx", colour: "#6B4FA0" },
};

export function ModuleLayer({ state, projection, from }: { state: ModuleState; projection: Projection; from: LatLon }) {
  const svg_style: CSSProperties = { position: "absolute", inset: 0, pointerEvents: "none" };
  const trail = state.trail_plan;
  return (
    <>
      {state.shown.flood && (
        <svg width={projection.width} height={projection.height} style={{ ...svg_style, zIndex: 1 }} aria-hidden="true">
          {FLOOD_FILE.zone.map((z) => (
            <path
              key={z.hazard}
              d={z.ring.map((r) => pathD(projection, r.map(([lon, lat]) => ({ lat, lon })), true)).join(" ")}
              fill={FLOOD_COLOUR[z.hazard]}
              fillRule="evenodd"
              fillOpacity={0.42}
              stroke={FLOOD_COLOUR[z.hazard]}
              strokeOpacity={0.7}
              strokeWidth={0.8}
            />
          ))}
        </svg>
      )}

      {state.shown.hotspot && (
        <svg width={projection.width} height={projection.height} style={{ ...svg_style, zIndex: 1 }} aria-hidden="true">
          {sector.map((row) => {
            const h = hotspotOf(row.sector_code);
            if (!h || h.observation_count === 0) return null;
            return (
              <path
                key={row.sector_code}
                d={pathD(projection, row.point.map(([lat, lon]) => ({ lat, lon })), true)}
                fill="#5B2A86"
                fillOpacity={0.08 + 0.5 * richnessShade(h)}
                stroke={h.is_hotspot ? "#FFFFFF" : "#5B2A86"}
                strokeOpacity={h.is_hotspot ? 0.95 : 0.35}
                strokeWidth={h.is_hotspot ? 2.4 : 0.8}
              />
            );
          })}
        </svg>
      )}

      {trail && state.shown.trail && (
        <svg width={projection.width} height={projection.height} style={{ ...svg_style, zIndex: 3 }} aria-hidden="true">
          {trail.leg.map((leg, k) =>
            leg.route ? (
              <path
                key={k}
                d={pathD(projection, [leg.from, ...leg.route.waypoint])}
                fill="none"
                stroke="#0B6B4B"
                strokeOpacity={k === state.trail_at ? 0.95 : k < state.trail_at ? 0.25 : 0.5}
                strokeWidth={k === state.trail_at ? 5 : 3}
                strokeDasharray={k === state.trail_at ? undefined : "6 5"}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null,
          )}
        </svg>
      )}

      {state.help.status === "found" && (
        <svg width={projection.width} height={projection.height} style={{ ...svg_style, zIndex: 3 }} aria-hidden="true">
          <path d={pathD(projection, [from, ...state.help.route.waypoint])} fill="none" stroke="#FFFFFF" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.85} />
          <path d={pathD(projection, [from, ...state.help.route.waypoint])} fill="none" stroke="#C62828" strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}

      {trail &&
        state.shown.trail &&
        trail.trail.stop.map((stop, k) => {
          const at = projection.project(stop);
          const is_now = k === state.trail_at;
          return (
            <span
              key={stop.stop_code}
              aria-label={`Trail stop ${k + 1}: ${stop.where}`}
              style={{
                position: "absolute",
                left: at.x,
                top: at.y,
                transform: "translate(-50%,-50%)",
                width: is_now ? 30 : 22,
                height: is_now ? 30 : 22,
                borderRadius: 999,
                background: k < state.trail_at ? "#E8F1EC" : "#0B6B4B",
                color: k < state.trail_at ? "#0B6B4B" : "#FFFFFF",
                border: "2px solid #FFFFFF",
                boxShadow: "0 2px 6px rgba(31,32,34,0.45)",
                display: "grid",
                placeItems: "center",
                fontSize: is_now ? 14 : 11,
                fontWeight: 800,
                zIndex: is_now ? 6 : 5,
                pointerEvents: "none",
              }}
            >
              {k + 1}
            </span>
          );
        })}

      {state.shown.emergency &&
        EMERGENCY_FILE.feature.map((f) => {
          const at = projection.project(f);
          if (at.x < -40 || at.y < -40 || at.x > projection.width + 40 || at.y > projection.height + 40) return null;
          const mark = GROUP_MARK[groupOf(f.kind)];
          const is_picked = state.picked_feature?.osm_id === f.osm_id;
          return (
            <button
              key={f.osm_id}
              type="button"
              onClick={() => {
                state.pickFeature(f);
                state.setPanelOpen(true);
              }}
              aria-label={`${featureLabel(f)} (${f.kind.replace(/_/g, " ")}), OpenStreetMap`}
              style={{
                position: "absolute",
                left: at.x,
                top: at.y,
                transform: "translate(-50%,-50%)",
                width: is_picked ? 30 : 24,
                height: is_picked ? 30 : 24,
                borderRadius: 6,
                background: mark.colour,
                color: "#FFFFFF",
                border: "2px solid #FFFFFF",
                boxShadow: is_picked ? "0 0 0 4px rgba(198,40,40,0.35), 0 2px 6px rgba(31,32,34,0.5)" : "0 2px 6px rgba(31,32,34,0.5)",
                fontSize: mark.glyph.length > 1 ? 9 : 14,
                fontWeight: 800,
                lineHeight: 1,
                padding: 0,
                cursor: "pointer",
                zIndex: 7,
              }}
            >
              {mark.glyph}
            </button>
          );
        })}
    </>
  );
}

/* ── the dock ─────────────────────────────────────────────────────────────── */

const panel_text: CSSProperties = { fontSize: 12.5, lineHeight: 1.45, color: "rgb(var(--mg-ink-rgb) / 0.78)" };
const small_text: CSSProperties = { fontSize: 11, lineHeight: 1.4, color: "rgb(var(--mg-ink-rgb) / 0.6)" };

function Button({ onClick, children, tone = "var(--mg-green)", is_disabled = false, is_primary = false }: { onClick: () => void; children: ReactNode; tone?: string; is_disabled?: boolean; is_primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={is_disabled}
      style={{
        border: `1.5px solid ${is_disabled ? "rgb(var(--mg-ink-rgb) / 0.15)" : tone}`,
        background: is_primary && !is_disabled ? tone : "transparent",
        color: is_disabled ? "rgb(var(--mg-ink-rgb) / 0.4)" : is_primary ? "#FFFFFF" : tone,
        borderRadius: 8,
        padding: "6px 10px",
        fontSize: 12,
        fontWeight: 700,
        cursor: is_disabled ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

function Toggle({ is_on, onClick, label }: { is_on: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={is_on}
      aria-label={label}
      onClick={onClick}
      style={{
        width: 40,
        height: 22,
        borderRadius: 999,
        border: "none",
        background: is_on ? "var(--mg-green)" : "rgb(var(--mg-ink-rgb) / 0.2)",
        position: "relative",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <span style={{ position: "absolute", top: 3, left: is_on ? 21 : 3, width: 16, height: 16, borderRadius: 999, background: "#FFFFFF", transition: "left 120ms" }} />
    </button>
  );
}

function Section({ title, source, owner, on, children }: { title: string; source: string; owner: string; on?: ReactNode; children?: ReactNode }) {
  return (
    <section style={{ borderTop: "1px solid rgb(var(--mg-ink-rgb) / 0.1)", padding: "12px 0" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, flex: 1 }}>{title}</h3>
        {on}
      </div>
      {children}
      <p style={{ ...small_text, margin: "8px 0 0" }}>
        Source: {source}. Not official: pending sign-off by {owner}.
      </p>
    </section>
  );
}

function helpLine(help: EmergencyRouteState): ReactNode {
  if (help.status === "idle") return null;
  if (help.status === "none") return <p style={{ ...panel_text, margin: "8px 0 0", fontWeight: 600 }}>{help.line}</p>;
  const f = help.feature;
  return (
    <p style={{ ...panel_text, margin: "8px 0 0" }}>
      <strong>{featureLabel(f)}</strong>: {formatMeter(help.route.length_m)} from {help.from_label}, {formatWalkMinute(help.route.length_m)}
      {isOnCampus(f) ? "" : " (off campus)"}. Route drawn in red over walkable ground.{" "}
      <a href={f.source_url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
        OSM {f.osm_id}
      </a>
    </p>
  );
}

export function ModuleButton({ state }: { state: ModuleState }) {
  return (
    <button
      type="button"
      onClick={() => state.setPanelOpen(!state.is_panel_open)}
      aria-expanded={state.is_panel_open}
      style={{
        background: "var(--mg-surface-glass)",
        color: "rgb(var(--mg-ink-rgb) / 0.92)",
        backdropFilter: "blur(8px)",
        border: `1.5px solid ${state.is_panel_open ? "var(--mg-green)" : "rgb(var(--mg-ink-rgb) / 0.1)"}`,
        borderRadius: 999,
        padding: "8px 13px",
        fontSize: 12,
        fontWeight: 700,
        boxShadow: "var(--mg-shadow-sm)",
        whiteSpace: "nowrap",
        cursor: "pointer",
      }}
    >
      Campus modules
    </button>
  );
}

/**
 * The panel. `from` is where a route starts — the fix when there is one,
 * else the campus centre, and `from_label` says which so a route from the
 * centre is never read as a route from where you stand.
 */
export function ModuleDock({
  state,
  from,
  from_label,
  is_desktop,
  onFocus,
}: {
  state: ModuleState;
  from: LatLon;
  from_label: string;
  is_desktop: boolean;
  onFocus: (point: LatLon) => void;
}) {
  const enabled = enabledModule({ campus_code: "", campus_name: "", module_on: state.module_on });
  const is_on = (id: ModuleId) => enabled.some((m) => m.module_id === id);
  const shell: CSSProperties = is_desktop
    ? { position: "absolute", left: 18, bottom: 18, width: 380, maxHeight: "calc(100% - 120px)", zIndex: 55 }
    : { position: "absolute", left: 8, right: 8, bottom: 72, maxHeight: "62%", zIndex: 55 };
  const card: CSSProperties = {
    ...shell,
    overflowY: "auto",
    background: "var(--mg-surface)",
    color: "rgb(var(--mg-ink-rgb) / 0.92)",
    border: "1px solid rgb(var(--mg-ink-rgb) / 0.12)",
    borderRadius: 12,
    boxShadow: "var(--mg-shadow-sm)",
    padding: "14px 16px",
  };

  /* On a phone the panel covers most of the map, so a route asked for from it
     was drawn where nobody could see it (10-01 playtest at 390 px). A found
     route closes the panel, flies the map to where it goes, and leaves the
     compact card below. The desktop panel sits beside the map and stays. */
  const found_id = state.help.status === "found" ? state.help.feature.osm_id : null;
  useEffect(() => {
    if (is_desktop || state.help.status !== "found") return;
    state.setPanelOpen(false);
    onFocus({ lat: state.help.feature.lat, lon: state.help.feature.lon });
    // Keyed on the destination: a new route is a new reason to get out of the way.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found_id, is_desktop]);

  if (state.trail_plan) return <TrailCard state={state} plan={state.trail_plan} style={card} onFocus={onFocus} />;
  if (!state.is_panel_open && !is_desktop && state.help.status !== "idle") {
    return (
      <div role="status" aria-live="polite" style={{ ...card, maxHeight: "none" }}>
        <div role="note" style={{ fontSize: 12, fontWeight: 800, color: "#B71C1C" }}>
          Not the official Ateneo emergency plan. Follow campus safety staff.
        </div>
        {helpLine(state.help)}
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <Button tone="rgb(var(--mg-ink-rgb) / 0.7)" onClick={state.clearHelp}>
            Clear route
          </Button>
          <Button tone="#C62828" onClick={() => state.setPanelOpen(true)}>
            Campus modules
          </Button>
        </div>
      </div>
    );
  }
  if (!state.is_panel_open) return null;

  const flood_here = floodHazardAt(from);
  const hotspot_top = hotspotRank().slice(0, 5);
  const hotspot_empty = hotspotEmptyLine();

  return (
    <div role="dialog" aria-label="Campus modules" style={card}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, flex: 1 }}>Campus modules</h2>
        <button type="button" onClick={() => state.setPanelOpen(false)} aria-label="Close" style={{ border: "none", background: "transparent", fontSize: 20, cursor: "pointer", color: "inherit" }}>
          ×
        </button>
      </div>
      <p style={{ ...small_text, margin: "4px 0 8px" }}>
        Layers over the same map and footpaths. Each one names its source, and none is official yet.
      </p>

      {is_on("emergency") && (
        <Section
          title={moduleById("emergency").title}
          source={moduleById("emergency").source}
          owner={moduleById("emergency").official_owner}
          on={<Toggle is_on={state.shown.emergency} onClick={() => state.toggle("emergency")} label="Show emergency points" />}
        >
          <div role="note" style={{ margin: "8px 0", padding: "8px 10px", borderRadius: 8, border: "2px solid #C62828", background: "rgba(198,40,40,0.07)" }}>
            <strong style={{ fontSize: 13, color: "#B71C1C" }}>Not the official Ateneo emergency plan.</strong>
            <div style={{ ...panel_text, marginTop: 2 }}>
              Only what volunteers mapped on OpenStreetMap and UP NOAH's flood model. In an emergency, follow campus safety staff and the university's instructions. The official plan is with the university DRRM office / CFMO.
            </div>
          </div>
          {(Object.keys(GROUP_LABEL) as EmergencyGroup[]).map((group) => {
            const n = featureInGroup(group).length;
            const is_routable = ROUTABLE_GROUP.includes(group);
            return (
              <div key={group} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "5px 0" }}>
                <span style={{ width: 22, height: 22, borderRadius: 5, background: GROUP_MARK[group].colour, color: "#FFF", fontSize: GROUP_MARK[group].glyph.length > 1 ? 9 : 13, fontWeight: 800, display: "grid", placeItems: "center", flexShrink: 0 }}>
                  {GROUP_MARK[group].glyph}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{GROUP_LABEL[group]}</div>
                  <div style={{ ...small_text, fontWeight: n === 0 ? 600 : 400 }}>{groupLine(group)}</div>
                </div>
                {is_routable && (
                  <Button tone="#C62828" is_disabled={n === 0} onClick={() => state.routeToNearest(group, from, from_label)}>
                    Nearest
                  </Button>
                )}
              </div>
            );
          })}
          {helpLine(state.help)}
          {state.help.status !== "idle" && (
            <div style={{ marginTop: 6 }}>
              <Button tone="rgb(var(--mg-ink-rgb) / 0.7)" onClick={state.clearHelp}>
                Clear route
              </Button>
            </div>
          )}
          {state.picked_feature && <FeatureDetail f={state.picked_feature} from={from} state={state} from_label={from_label} />}

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 10 }}>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>Flood hazard, 100-year rain</div>
            <Toggle is_on={state.shown.flood} onClick={() => state.toggle("flood")} label="Show flood hazard" />
          </div>
          <div style={{ ...small_text }}>{floodLine()}</div>
          {state.shown.flood && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
              {[1, 2, 3].map((h) => (
                <span key={h} style={{ ...small_text, display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: FLOOD_COLOUR[h] }} />
                  {FLOOD_LABEL[h]}
                </span>
              ))}
            </div>
          )}
          <div style={{ ...panel_text, marginTop: 4 }}>
            At {from_label}: {flood_here === 0 ? "outside every NOAH flood zone" : `${FLOOD_LABEL[flood_here].toLowerCase()} hazard`}.
          </div>
        </Section>
      )}

      {is_on("hotspot") && (
        <Section
          title={moduleById("hotspot").title}
          source={moduleById("hotspot").source}
          owner={moduleById("hotspot").official_owner}
          on={<Toggle is_on={state.shown.hotspot} onClick={() => state.toggle("hotspot")} label="Show biodiversity hotspots" />}
        >
          <p style={{ ...small_text, margin: "6px 0" }}>{hotspot_empty ?? hotspotMethodLine()}</p>
          {!hotspot_empty && (
            <ol style={{ margin: 0, paddingLeft: 18 }}>
              {hotspot_top.map((h) => {
                const row = sectorByCode(h.sector_code);
                return (
                  <li key={h.sector_code} style={{ ...panel_text, cursor: "pointer" }} onClick={() => row && onFocus({ lat: row.label_point[0], lon: row.label_point[1] })}>
                    <strong>{row?.name ?? h.sector_code}</strong>
                    {row?.is_named_by_us ? " (our name)" : ""}: {h.species_count} species in {h.observation_count.toLocaleString("en")} records
                    {h.vegetation_ratio !== null ? `, ${Math.round(h.vegetation_ratio * 100)}% vegetation` : ""}
                  </li>
                );
              })}
            </ol>
          )}
        </Section>
      )}

      {is_on("trail") && (
        <Section title={moduleById("trail").title} source={moduleById("trail").source} owner={moduleById("trail").official_owner}>
          {TRAIL.length === 0 && <p style={{ ...panel_text, margin: "6px 0" }}>No trail files for this campus yet.</p>}
          {TRAIL.map((t) => (
            <TrailRow
              key={t.trail_code}
              trail_code={t.trail_code}
              onStart={() => {
                state.startTrail(t.trail_code);
                onFocus(t.stop[0]);
              }}
            />
          ))}
        </Section>
      )}
      <p style={{ ...small_text, margin: "10px 0 0" }}>
        Routes start from {from_label}. Distances are along walkable ground; minutes assume the app's walking pace.
      </p>
    </div>
  );
}

function FeatureDetail({ f, from, state, from_label }: { f: EmergencyFeature; from: LatLon; state: ModuleState; from_label: string }) {
  return (
    <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: "rgb(var(--mg-ink-rgb) / 0.05)" }}>
      <div style={{ fontSize: 13, fontWeight: 800 }}>{featureLabel(f)}</div>
      <div style={{ ...small_text }}>
        {f.kind.replace(/_/g, " ")} · {isOnCampus(f) ? "on campus" : "off campus"} · {formatMeter(distanceMeter(from, f))} straight-line
      </div>
      <div style={{ ...small_text }}>
        OpenStreetMap{" "}
        <a href={f.source_url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
          {f.osm_id}
        </a>
        , fetched {f.fetched_on}. Community-mapped; not verified by the university.
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <Button tone="#C62828" onClick={() => state.routeToFeature(f, from, from_label)}>
          Route here
        </Button>
        <Button tone="rgb(var(--mg-ink-rgb) / 0.7)" onClick={() => state.pickFeature(null)}>
          Close
        </Button>
      </div>
    </div>
  );
}

function TrailRow({ trail_code, onStart }: { trail_code: string; onStart: () => void }) {
  const trail = TRAIL.find((t) => t.trail_code === trail_code)!;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          {trail.title}
          {trail.is_named_by_us ? <span style={{ ...small_text, fontWeight: 400 }}> (our name)</span> : null}
        </div>
        <div style={{ ...small_text }}>
          {trail.stop.length} stops · {trail.blurb}
        </div>
      </div>
      <Button is_primary onClick={onStart}>
        Start
      </Button>
    </div>
  );
}

function TrailCard({ state, plan, style, onFocus }: { state: ModuleState; plan: TrailPlan; style: CSSProperties; onFocus: (point: LatLon) => void }) {
  const at = state.trail_at;
  const stop = plan.trail.stop[at];
  const sp = stop.species_code ? species[stop.species_code] : undefined;
  const art = stop.species_code ? species_art[stop.species_code] : undefined;
  const next_leg = plan.leg[at];
  const left_m = remainingMeter(plan, at);
  const is_last = at === plan.trail.stop.length - 1;
  const go = (delta: number) => {
    const next = Math.max(0, Math.min(plan.trail.stop.length - 1, at + delta));
    state.stepTrail(delta);
    onFocus(plan.trail.stop[next]);
  };
  return (
    <div role="dialog" aria-label={`${plan.trail.title}, ${progressLine(plan, at)}`} style={style}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ ...small_text, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            {plan.trail.title} · {progressLine(plan, at)}
          </div>
        </div>
        <Button tone="rgb(var(--mg-ink-rgb) / 0.7)" onClick={state.endTrail}>
          End
        </Button>
      </div>
      <div role="progressbar" aria-valuemin={1} aria-valuemax={plan.trail.stop.length} aria-valuenow={at + 1} style={{ height: 6, borderRadius: 3, background: "rgb(var(--mg-ink-rgb) / 0.1)", margin: "8px 0 10px" }}>
        <div style={{ width: `${((at + 1) / plan.trail.stop.length) * 100}%`, height: "100%", borderRadius: 3, background: "var(--mg-green)" }} />
      </div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        {art && <img src={art} alt="" width={64} height={64} style={{ borderRadius: 8, objectFit: "contain", background: "rgb(var(--mg-ink-rgb) / 0.04)", flexShrink: 0 }} />}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{sp?.common_name ?? stop.where}</div>
          {sp && <div style={{ ...small_text, fontStyle: "italic" }}>{sp.scientific_name} · {sp.origin}</div>}
          <div style={{ ...small_text }}>
            {stop.where}
            {stop.is_named_by_us ? " (our name for it)" : ""}
          </div>
        </div>
      </div>
      <p style={{ ...panel_text, margin: "8px 0 4px" }}>
        <strong>Look for:</strong> {stop.look_for}
      </p>
      {!stop.is_position_surveyed && (
        <p style={{ ...small_text, margin: "0 0 6px" }}>This stop is the app's demo point for the species, not a surveyed tree. Look around it.</p>
      )}
      <div style={{ ...panel_text, margin: "6px 0", fontWeight: 600 }}>
        {is_last
          ? `Last stop. Whole trail ${formatMeter(plan.length_m)}, ${formatWalkMinute(plan.length_m)}.`
          : next_leg.route
            ? `Next: ${nextName(plan, at + 1)}, ${formatMeter(next_leg.route.length_m)} (${formatWalkMinute(next_leg.route.length_m)}). ${formatMeter(left_m)} to the end.`
            : `Next: ${nextName(plan, at + 1)}. No walkable way found for this leg.`}
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <Button tone="var(--mg-green)" is_disabled={at === 0} onClick={() => go(-1)}>
          Previous
        </Button>
        <Button tone="var(--mg-green)" is_primary is_disabled={is_last} onClick={() => go(1)}>
          Next stop
        </Button>
        <Button tone="var(--mg-green)" onClick={() => onFocus(stop)}>
          Show on map
        </Button>
      </div>
      <p style={{ ...small_text, margin: "8px 0 0" }}>{moduleById("trail").caveat}</p>
    </div>
  );
}

function nextName(plan: TrailPlan, k: number): string {
  const stop = plan.trail.stop[k];
  return (stop.species_code && species[stop.species_code]?.common_name) || stop.where;
}
