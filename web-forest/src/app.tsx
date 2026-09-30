import { Suspense, lazy, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { walkPoint } from "./placement.ts";
import CampusMap from "./campus-map";
import Joystick from "./joystick";
import {
  addFriend,
  groupMember,
  groupStreak,
  readFriend,
  removeFriend,
  writeFriend,
  type Friend,
  type GroupStreak,
} from "./friend";
import { normalizeJoinCode, walkerIdOf } from "./campus-world";
import { haptic } from "./haptic";
import StreakFlame from "./streak-flame";
import SettingsScreen, { type SettingsIcon } from "./settings";
import { useAccount, useAccountSync } from "./account";
import { levelOf, levelStart } from "./level";
import { liveNameOf } from "./multiplayer";
import { hallLabelOf, useHall } from "./remote-walker";
import { ReportSheet } from "./report-sheet";
import {
  readPreference,
  setHapticEnabled,
  writePreference,
  type Preference,
} from "./preference";
import { type SkylineStyle } from "./skyline";
import PlayMap, { PLAY_MAX_ZOOM, PLAY_MIN_ZOOM } from "./play-map";
import Boot, { isBootSkipped } from "./boot";
import { navigateTo } from "./nav";
import { AlertCard, WeatherChip, type AlertSpec } from "./alert";
import { fetchWeather, pinnedWeather, weatherBody, weatherCaption, WEATHER_TITLE, type Weather } from "./weather";
import { pinKindOf, type PinKind } from "./pin";
import Character, { stageFor, STAGE_LABEL, type Stage } from "./character";
import { stageLine } from "./stage";
/* The 3D character (T4.1) — lazy so the model-viewer chunk is fetched only
   where the 3D character renders. The SVG `Character` stays as the Suspense
   fallback and on the map, whose billboard must cost no bundle. */
const CharacterModel = lazy(() => import("./character-model"));
/* The 3D species card — lazy for the same reason: the species pack's viewer is
   fetched the first time a card opens, never at boot. */
const SpeciesCard = lazy(() => import("./species-card"));
/* The pin sheet's hero is the card's own turning model — same lazy chunk. */
const SpeciesHero = lazy(() => import("./species-card").then((m) => ({ default: m.SpeciesHero })));
import { learnSubject } from "./species-card-core";
import { biome_sector, sectorAt, sectorByCode, sector as sector_row, type Sector } from "./sector";
import Viewfinder, { type Shot } from "./camera";
import {
  aisDueNote,
  AIS_GAP_NOTE,
  AT_TREE_RADIUS_M,
  consult,
  encounter,
  dex_order,
  picker_order,
  SEEK_URL,
  species,
  speciesDetail,
  WILD_NOTE,
  type Confusable,
  type Encounter,
  type Species,
} from "./data";
import {
  addSighting,
  mergeRemoteSighting,
  downloadText,
  endWalk,
  progressOf,
  readSighting,
  writeSighting,
  readWalk,
  seenCode,
  seenSector,
  sectorProgress,
  startWalk,
  trackWalk,
  summarize,
  toCsv,
  toGeoJson,
  vigorOf,
  type Sighting,
  type Walk,
  type WalkReceipt,
} from "./journal";
import {
  POINT_LABEL,
  POINT_VALUE,
  LOCAL_OBS_STATUS_LABEL,
  LOCAL_OBS_STATUS_NOTE,
  dailySubject,
  dailyTaskFor,
  gamifySnapshot,
  localObsStatus,
  observeAwardKind,
  observeSubject,
  persistAward,
  readPointEvents,
  withLiveWalker,
  type DailyTask,
  type GamifySnapshot,
  type PointEvent,
} from "./gamify";
import { CAMPUS_CENTER, distanceMeter, formatLatLon, formatMeter, formatWalkMinute, meterPerPixel, WALK_PACE_MS, type GeoState } from "./geo";
import { LAYER_ORDER, nextLayer, prefetchCampus, SOURCE, type Layer, type View } from "./tile-map";
import { geoModeLabel, nextGeoMode, useGeo, type GeoMode } from "./use-geo";
import { useQuality } from "./use-quality";
import { qualityLabel } from "./quality";
import { noRouteLine } from "./route";
import { biomePresenceAt, rankEncounter, sectorResident, trayRow, type BiomePresence } from "./nearby";
import { cosmeticForStage } from "./cosmetic";
import { BlindboxShelf } from "./blindbox-reveal";
import { BadgeShelf, loadSpawnPool, RarityPill, reachableSpawn, useLiveWorld, useSpawnWorld, WildShelf, WorldStrip } from "./live";
import { kindOf, speciesLabelOf } from "./kind";
import { SpeciesPortrait } from "./portrait.tsx";
import { icon, settings_icon as kit_settings_icon, sticker } from "./asset/kit";
import type { Rarity, Spawn, SpawnPoolEntry } from "./spawn";
import { WALK_TO_SHORT_M } from "./play-walk";
import { receiptHighlight } from "./collection";
import { demoJournal, isSeededJournal } from "./demo-seed";
import { fetchJoin, fetchMine, fetchPartner, readPlayer, writePlayer, type World } from "./sync";

import {
  demoIdentify,
  identifyPlant,
  loadInatNearby,
  PROVIDER_LABEL,
  type InatIdentifyState,
  type InatNearbyState,
} from "./inat";
import { matchCampus, suggestedPick } from "./inat-match";
import { pinReply } from "./pin-reply";
import InatStrip from "./inat-strip";
import { ModuleButton, ModuleDock, ModuleLayer } from "./module-ui";
import { fromLabel, moduleAttribution, useModuleState } from "./module-state";
import { Card, Chip, Eyebrow, Fab, GlyphDisc, Pill, PrimaryPill, RADIUS, SheetClose, SpeciesName, SpeciesPill, TaxonName, TaxonThumb } from "./ui";
import { DexCard, DexHeader, GameDock, GameToast, PlayerHud, QuestBanner, StageSticker, TodayHuntCard } from "./hud";
import {
  CameraIcon,
  CanopyIcon,
  ExportIcon,
  LeafScanIcon,
  LocateIcon,
  ShutterIcon,
  WalkIcon,
  CheckIcon,
  PinIcon,
  RestrictedIcon,
} from "./icon";

/** ~1.2 m per pixel: a walker sees their block, not the whole 89 ha. */
const WALK_ZOOM = 18;
/**
 * Play sits ~2× closer than field (z18 → z20).
 *
 * Vector ground is not capped by OSM's z19 tile ceiling, so the camera can sit
 * on the walker the way a GO play-view does — buildings and paths at standing
 * scale, avatar large in frame.
 */
const PLAY_ZOOM = PLAY_MAX_ZOOM;

const CARD_RADIUS = RADIUS.card;
const TILE_RADIUS = RADIUS.tile;

export type Route = "/" | "/map" | "/journal" | "/settings";

function pathToRoute(path: string): Route {
  /* `/plan` is the Working Doc's name for this surface and shipped in the
     September deck, so the old path keeps working — it just lands on Settings,
     which carries Plan's brief (what happens after the walk, who we work with,
     how to get involved) plus the part a student at a booth asks first. */
  if (path === "/plan") return "/settings";
  if (path === "/map" || path === "/journal" || path === "/settings") return path;
  return "/";
}

/* ── interruptions ─────────────────────────────────────────────────────────
 * The cards the game may stop you with. Each shows once per launch (keyed by
 * `alert_id` in sessionStorage) except the weather card, which the sky chip
 * can always reopen.
 */
const NO_FIX_ALERT: AlertSpec = {
  alert_id: "no-fix",
  tone: "light",
  mark: { sticker: sticker.buddy_map },
  title: "No position here",
  body: "This device will not share where it is, so steer a walk with the stick in the corner instead. Tap the ground to walk there.",
  caption: "Anything you log on a stick walk is tagged as one.",
  action: "Got it",
};
const OFF_CAMPUS_ALERT: AlertSpec = {
  alert_id: "off-campus",
  tone: "light",
  mark: { sticker: sticker.buddy_map },
  title: "You are off campus",
  body: "Magisphere is played on the Ateneo Loyola Heights campus. From here, steer a demo walk with the stick in the corner.",
  caption: "Anything you log on a stick walk is tagged as one, never as a visit.",
  action: "Start the demo walk",
};
/**
 * Alerts about the walk itself. They only make sense over the map, and a
 * student who opens Settings to file a report (10-01 playtest) was met by "No
 * position here" first. They wait in the queue until the map is on screen; the
 * weather warning is about the student's safety and still shows anywhere.
 */
const MAP_ONLY_ALERT = new Set(["no-fix", "off-campus", "speed"]);
const SPEED_ALERT: AlertSpec = {
  alert_id: "speed",
  tone: "dark",
  mark: "speed",
  title: "You are going too fast",
  body: "Magisphere is for walking. Do not play while you drive or ride a bike. Finds will not count until you slow down.",
  action: "I'm a passenger",
};
/** Faster than this, sustained between two GPS fixes, is not a walk. */
const SPEED_WARN_MS = 7;

function weatherAlert(w: Weather): AlertSpec {
  return {
    alert_id: w.warn ? `weather-${w.warn}` : "weather",
    tone: w.warn ? "dark" : "light",
    mark: w.warn ? "warn" : { sticker: w.is_day ? sticker.buddy_cheer : sticker.buddy_sleep },
    title: w.warn ? WEATHER_TITLE[w.warn] : "Weather on campus",
    body: weatherBody(w),
    caption: weatherCaption(w),
    action: w.warn ? "I am safe" : "OK",
  };
}

function alertSeen(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem("magisphere.alert-seen") ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function markAlertSeen(alert_id: string) {
  try {
    const seen = alertSeen();
    seen.add(alert_id);
    sessionStorage.setItem("magisphere.alert-seen", JSON.stringify([...seen]));
  } catch {
    /* private mode: the card may show again, which is the safe failure */
  }
}

function StatTile({ big, line, source }: { big: string; line: string; source: string }) {
  return (
    <div
      className="flex-1"
      style={{
        background: "rgb(var(--mg-ink-rgb) / 0.06)",
        border: "1.5px solid rgb(var(--mg-ink-rgb) / 0.1)",
        borderRadius: TILE_RADIUS,
        padding: "12px 10px",
        display: "flex",
        flexDirection: "column",
        boxShadow: "none",
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 20, color: "var(--mg-text-boldest)", lineHeight: 1.05 }}>{big}</div>
      <div style={{ fontSize: 11.5, color: "rgb(var(--mg-ink-rgb) / 0.92)", marginTop: 4, lineHeight: 1.35 }}>{line}</div>
      <div style={{ fontSize: 10, color: "rgb(var(--mg-ink-rgb) / 0.6)", marginTop: "auto", paddingTop: 4 }}>{source}</div>
    </div>
  );
}

const HUD_ORB = 64;
const HUD_CAMERA = 88;

function HudOrb({
  label,
  active = false,
  size = HUD_ORB,
  onClick,
  children,
  style,
}: {
  label: string;
  active?: boolean;
  size?: number;
  onClick: () => void;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        display: "grid",
        placeItems: "center",
        background: active ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.88)",
        boxShadow: "var(--mg-shadow)",
        border: "3px solid rgba(255,255,255,0.95)",
        overflow: "hidden",
        pointerEvents: "auto",
        flexShrink: 0,
        ...style,
      }}
    >
      {children}
    </button>
  );
}

/**
 * Walking partners, and the streak they keep together.
 *
 * Two asks from the 09-21 recording land on one card — a friends system
 * (`29:17`) and a group streak (`35:37`) — plus the Working Doc's "Note to
 * Gelo: Is this feasible?" against the same idea. It is feasible because the
 * sync layer already stamps every find with who made it and when; see
 * `friend.ts` for the rule and for what this roster deliberately is NOT.
 *
 * The card says out loud that the roster is one-sided. A social feature that
 * lets you believe somebody has added you back, when nothing has told them you
 * exist, is worse than no social feature.
 */
function PartnerCard({
  friend,
  group,
  join_code,
  is_live,
  on_add,
  on_remove,
}: {
  friend: Friend[];
  group: GroupStreak;
  join_code: string;
  is_live: boolean;
  on_add: (code: string) => void;
  on_remove: (player_id: string) => void;
}) {
  const [code, setCode] = useState("");
  return (
    <Card style={{ padding: 14 }}>
      <div className="flex items-center justify-between">
        <Eyebrow>WALKING PARTNERS</Eyebrow>
        <StreakFlame weeks={group.weeks} size={30} is_group />
      </div>

      <div style={{ fontSize: 12, color: "rgb(var(--mg-ink-rgb) / 0.78)", marginTop: 8, lineHeight: 1.45 }}>
        {group.member_count === 1
          ? "Add a partner by their code. Your group's week stays alive if any one of you walks it."
          : group.is_week_carried
            ? `This week is carried${group.carried_by.length ? ` — ${group.carried_by.slice(0, 3).join(", ")}` : ""}.`
            : "Nobody has walked this week yet. Any one of you keeps it alive."}
      </div>

      <div className="flex items-center gap-2" style={{ marginTop: 10 }}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 7))}
          placeholder="PARTNER CODE"
          aria-label="Add a walking partner by their six-character code"
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          style={{
            flex: 1,
            minWidth: 0,
            padding: "9px 11px",
            minHeight: 44,
            borderRadius: 12,
            border: "1.5px solid rgb(var(--mg-ink-rgb) / 0.14)",
            background: "#fff",
            color: "var(--mg-text-boldest)",
            fontWeight: 800,
            letterSpacing: "0.16em",
            fontSize: 14,
          }}
        />
        <button
          type="button"
          onClick={() => {
            on_add(code);
            setCode("");
          }}
          style={{
            padding: "9px 14px",
            minHeight: 44,
            borderRadius: 12,
            border: "none",
            background: "var(--mg-green)",
            color: "#fff",
            fontWeight: 800,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Add
        </button>
      </div>

      <div style={{ fontSize: 11, color: "rgb(var(--mg-ink-rgb) / 0.6)", marginTop: 7, lineHeight: 1.45 }}>
        Your code is <b style={{ color: "rgb(var(--mg-ink-rgb) / 0.86)", letterSpacing: "0.1em" }}>{join_code}</b>.
        {" "}
        {/* The honesty clause. `friend.ts` explains why the roster is local. */}
        Adding somebody is one-sided and only this device knows about it — they
        are not told, and nothing is shared beyond the campus finds already on
        the board.
        {is_live ? "" : " Partners need the live campus on to count a week."}
      </div>

      {friend.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
          {friend.map((row) => (
            <div
              key={row.walker_id}
              className="flex items-center gap-2"
              style={{
                padding: "8px 10px",
                borderRadius: 12,
                background: "rgb(var(--mg-ink-rgb) / 0.06)",
                border: "1px solid rgb(var(--mg-ink-rgb) / 0.06)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {row.name}
                </div>
                {group.carried_by.includes(row.name) && (
                  <div style={{ fontSize: 11, color: "var(--mg-green-text)" }}>carried this week</div>
                )}
              </div>
              <button
                type="button"
                aria-label={`Remove ${row.name}`}
                onClick={() => on_remove(row.walker_id)}
                style={{
                  border: "none",
                  background: "transparent",
                  color: "rgb(var(--mg-ink-rgb) / 0.56)",
                  fontSize: 18,
                  lineHeight: 1,
                  cursor: "pointer",
                  width: 44,
                  height: 44,
                  margin: "-10px -8px",
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function TrainerSheet({
  snap,
  daily,
  stage,
  vigor,
  geo_mode,
  geo_status,
  join_code,
  walker_name,
  is_live,
  live_label,
  friend,
  group,
  onAddPartner,
  onDropPartner,
  onCycleMode,
  onHunt,
  onPlan,
  onJoin,
  onClose,
}: {
  snap: GamifySnapshot;
  daily: DailyTask | null;
  stage: Stage;
  vigor: number;
  geo_mode: GeoMode;
  geo_status: GeoState["status"];
  join_code: string;
  walker_name: string;
  is_live: boolean;
  /** The hall's "N walkers out", or null before it answers. */
  live_label: string | null;
  friend: Friend[];
  group: GroupStreak;
  onAddPartner: (code: string) => void;
  onDropPartner: (player_id: string) => void;
  onCycleMode: () => void;
  onHunt: () => void;
  onPlan: () => void;
  onJoin: (code: string) => void;
  onClose: () => void;
}) {
  const [is_report_open, setReportOpen] = useState(false);
  return (
    /* At 49, under the dock (50): the sheet rises from behind the tab bar, so
       every dock button stays tappable while it is open. It sat at 60 over the
       whole dock, and the only way out was a thin grab bar. */
    <div className="absolute inset-0" style={{ zIndex: 49 }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Your buddy"
        onClick={(e) => e.stopPropagation()}
        className="absolute inset-x-0 bottom-0"
        style={{
          maxHeight: "78%",
          overflowY: "auto",
          background: "var(--mg-surface)",
          color: "rgb(var(--mg-ink-rgb) / 0.92)",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          boxShadow: "var(--mg-shadow-up)",
          padding: "0 18px 28px",
        }}
      >
        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 2,
            margin: "0 -18px",
            padding: "6px 10px 0",
            background: "var(--mg-surface)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <span
            aria-hidden="true"
            style={{ position: "absolute", left: "50%", top: 10, width: 42, height: 4, marginLeft: -21, borderRadius: 999, background: "rgb(var(--mg-ink-rgb) / 0.28)" }}
          />
          <SheetClose onClose={onClose} />
        </div>
        <div className="flex items-center gap-3">
          <div style={{ width: 72, height: 72, borderRadius: 999, overflow: "hidden", background: "#2f5d2b", border: "3px solid var(--mg-green)" }}>
            <Character stage={stage} vigor={vigor} size={68} is_idle_animated />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 28, fontVariantNumeric: "tabular-nums" }}>
              {snap.total_points}
              <span style={{ fontSize: 14, fontWeight: 700, marginLeft: 4 }}>pts</span>
            </div>
            <div style={{ fontSize: 13, opacity: 0.75 }}>{walker_name}</div>
            <div className="flex items-center gap-2" style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
              <StreakFlame weeks={snap.streak_weeks} size={26} />
              <span style={{ opacity: 0.8 }}>· {STAGE_LABEL[stage]}</span>
            </div>
            <div style={{ fontSize: 11, marginTop: 4, letterSpacing: "0.08em", fontWeight: 800 }}>
              {live_label ? `LIVE · ${live_label}` : is_live ? "LIVE" : "OFFLINE"} · {join_code}
            </div>
          </div>
        </div>
        <JoinRow onJoin={onJoin} />
        <div
          style={{
            marginTop: 16,
            background: "var(--mg-bg)",
            color: "rgb(var(--mg-ink-rgb) / 0.92)",
            borderRadius: 20,
            padding: 12,
          }}
        >
          <PointsStreakCard snap={snap} is_desktop={false} />
          <div style={{ marginTop: 10 }}>
            <PartnerCard
              friend={friend}
              group={group}
              join_code={join_code}
              is_live={is_live}
              on_add={onAddPartner}
              on_remove={onDropPartner}
            />
          </div>
          <div style={{ marginTop: 10 }}>
            <DailyHuntCard daily={daily} onHunt={onHunt} />
          </div>
          <div style={{ marginTop: 10 }}>
            <ChallengesCard snap={snap} />
          </div>
          <div style={{ marginTop: 10 }}>
            <LocalLeaderboardCard snap={snap} is_desktop={false} />
          </div>
        </div>
        <div className="flex gap-2" style={{ marginTop: 16, paddingBottom: 140 }}>
          <Chip is_on={geo_mode === "gps"} onClick={onCycleMode}>
            {geoModeLabel(geo_mode, geo_status)}
          </Chip>
          <button type="button" onClick={onPlan} style={{ fontWeight: 700, fontSize: 13, color: "var(--mg-blue)", minWidth: 44, minHeight: 44, padding: "0 8px" }}>
            Plan
          </button>
          {/* The play HUD's way to "Report a problem" (Settings → Setup has the same form). */}
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            style={{ fontWeight: 700, fontSize: 13, color: "rgb(var(--mg-ink-rgb) / 0.62)", minWidth: 44, minHeight: 44, padding: "0 8px", marginLeft: "auto" }}
          >
            Report a problem
          </button>
        </div>
        {is_report_open && <ReportSheet onClose={() => setReportOpen(false)} />}
      </div>
    </div>
  );
}

function JoinRow({ onJoin }: { onJoin: (code: string) => void }) {
  const [code, setCode] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (code.trim()) onJoin(code);
      }}
      className="flex gap-2"
      style={{ marginTop: 12 }}
    >
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Other phone's code"
        aria-label="Walker code"
        maxLength={6}
        style={{
          flex: 1,
          borderRadius: 12,
          border: "1.5px solid rgb(var(--mg-ink-rgb) / 0.2)",
          background: "rgba(17,75,47,0.1)",
          color: "rgb(var(--mg-ink-rgb) / 0.92)",
          padding: "8px 10px",
          minHeight: 44,
          fontWeight: 800,
          letterSpacing: "0.12em",
        }}
      />
      <button type="submit" style={{ fontWeight: 800, fontSize: 13, color: "var(--mg-green-text)", minWidth: 44, minHeight: 44, padding: "0 8px" }}>
        Join
      </button>
    </form>
  );
}

function NearbySightTray({
  spawn,
  seen,
  onPick,
  onClose,
}: {
  spawn: Spawn[];
  seen: Set<string>;
  onPick: (row: Spawn) => void;
  onClose: () => void;
}) {
  /* One tile per species: two finds of the same palm are one tile with "×2". */
  const row = trayRow(spawn, 8);
  /* A card with a header and a four-column grid, sat just above the dock.
     It was one horizontal strip at bottom 148 — the last find cut off at the
     right edge with nothing saying it scrolled, and the strip parked right
     under the walker's eagle. Eight finds fit in two rows of four. */
  return (
    <div className="absolute inset-x-3" style={{ bottom: 116, zIndex: 49 }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: 420,
          margin: "0 auto",
          padding: "8px 12px 12px",
          borderRadius: 16,
          background: "var(--mg-surface)",
          color: "rgb(var(--mg-ink-rgb) / 0.92)",
          boxShadow: "var(--mg-sticker)",
        }}
      >
        <div className="flex items-center justify-between">
          <span className="mg-heading" style={{ fontSize: 15, color: "var(--mg-forest)" }}>
            Nearby{row.length ? ` · ${row.length}` : ""}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close nearby"
            style={{ width: 44, height: 44, marginRight: -10, display: "grid", placeItems: "center", color: "var(--mg-ink)" }}
          >
            <svg width="14" height="14" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M4 4 L14 14 M14 4 L4 14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        {row.length === 0 ? (
          <div style={{ fontSize: 12, fontWeight: 700, padding: "4px 2px 6px", color: "rgb(var(--mg-ink-rgb) / 0.62)" }}>
            None nearby yet — finds appear as the world loads and as you walk.
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "10px 2px", margin: "0 -6px" }}>
            {row.map(({ spawn: s, find_count }) => (
              <button
                key={s.spawn_id}
                type="button"
                onClick={() => onPick(s)}
                style={{ minWidth: 0, textAlign: "center", position: "relative" }}
              >
                <SpeciesPortrait
                  scientific_name={s.scientific_name}
                  species_code={s.species_code}
                  kind={kindOf(s.iconic_taxon_name, s.archetype)}
                  size={52}
                  style={{ margin: "0 auto", background: "var(--mg-surface-2)" }}
                />
                {find_count > 1 && (
                  <span
                    aria-label={`${find_count} out nearby`}
                    style={{
                      position: "absolute",
                      top: -2,
                      right: 2,
                      padding: "0 5px",
                      borderRadius: 99,
                      background: "var(--mg-forest)",
                      color: "#fff",
                      fontSize: 11,
                      fontWeight: 800,
                      lineHeight: "18px",
                    }}
                  >
                    ×{find_count}
                  </span>
                )}
                {/* Up to three lines at 12 px rather than one at 10 cut off
                    with "…" — the tray is only as tall as its longest name. */}
                <div
                  title={speciesLabelOf(s.common_name, s.scientific_name).text}
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    lineHeight: 1.18,
                    letterSpacing: "-0.01em",
                    marginTop: 4,
                    display: "-webkit-box",
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    overflowWrap: "break-word",
                    color: seen.has(s.species_code) ? "var(--mg-green-text)" : "rgb(var(--mg-ink-rgb) / 0.78)",
                  }}
                >
                  <SpeciesName common_name={s.common_name} scientific_name={s.scientific_name} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}


function PointsStreakCard({ snap, is_desktop }: { snap: GamifySnapshot; is_desktop: boolean }) {
  return (
    <Card style={{ padding: is_desktop ? 18 : 14 }}>
      <Eyebrow>POINTS + WEEKLY STREAK</Eyebrow>
      <div className="flex gap-2" style={{ marginTop: 10 }}>
        <div
          style={{
            flex: 1,
            borderRadius: RADIUS.tile,
            border: "1.5px solid rgba(62,154,74,0.4)",
            background: "rgba(62,154,74,0.12)",
            padding: "10px 12px",
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--mg-green-text)", letterSpacing: "0.04em" }}>POINTS</div>
          <div style={{ fontSize: is_desktop ? 28 : 24, fontWeight: 800, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
            {snap.total_points}
            <span style={{ fontSize: 13, fontWeight: 700, marginLeft: 4 }}>pts</span>
          </div>
          <div style={{ fontSize: 11, color: "rgb(var(--mg-ink-rgb) / 0.78)", marginTop: 2 }}>
            {/* The rates, not a breakdown of the total above — labelled as such. */}
            What earns points: hunt +{POINT_VALUE.challenge} · log +{POINT_VALUE.observe}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            borderRadius: RADIUS.tile,
            border: "1.5px solid rgba(247,198,49,0.4)",
            background: "rgba(247,198,49,0.12)",
            padding: "10px 12px",
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--mg-gold)", letterSpacing: "0.04em" }}>WEEKLY STREAK</div>
          <div style={{ fontSize: is_desktop ? 28 : 24, fontWeight: 800, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
            {snap.streak_weeks}
            <span style={{ fontSize: 13, fontWeight: 700, marginLeft: 4 }}>wk</span>
          </div>
          <div style={{ fontSize: 11, color: "rgb(var(--mg-ink-rgb) / 0.78)", marginTop: 2 }}>
            {snap.participated_this_week ? "This week" : "Idle"}
          </div>
        </div>
      </div>
    </Card>
  );
}

function LocalLeaderboardCard({ snap, is_desktop }: { snap: GamifySnapshot; is_desktop: boolean }) {
  return (
    <Card style={{ padding: is_desktop ? 18 : 14 }}>
      <Eyebrow>BOARD</Eyebrow>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        {snap.leaderboard.slice(0, 6).map((row, i) => (
          <div
            key={row.walker_id}
            className="flex items-center gap-2"
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              background: row.is_you ? "rgba(62,154,74,0.12)" : "rgb(var(--mg-ink-rgb) / 0.06)",
              border: row.is_you ? "1.5px solid rgba(62,154,74,0.4)" : "1px solid rgb(var(--mg-ink-rgb) / 0.06)",
            }}
          >
            <span style={{ width: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: "rgb(var(--mg-ink-rgb) / 0.78)" }}>
              {i + 1}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {row.name}
                {row.is_you ? " · you" : ""}
                {row.is_seed ? " · demo" : ""}
              </div>
              <div style={{ fontSize: 11, color: "rgb(var(--mg-ink-rgb) / 0.6)" }}>{row.streak_weeks} wk streak</div>
            </div>
            <span style={{ fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{row.points}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ChallengesCard({ snap }: { snap: GamifySnapshot }) {
  return (
    <Card style={{ padding: 14 }}>
      <Eyebrow>CHALLENGES</Eyebrow>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        {snap.challenges.map((c) => {
          const ratio = c.target ? Math.min(1, c.current / c.target) : 0;
          return (
            <div key={c.challenge_id}>
              <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
                <span style={{ fontWeight: 700 }}>{c.title}</span>
                <span style={{ fontVariantNumeric: "tabular-nums", color: "rgb(var(--mg-ink-rgb) / 0.78)" }}>
                  {c.current}/{c.target}
                  {c.done ? " · done" : ""}
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: "rgb(var(--mg-ink-rgb) / 0.1)", marginTop: 5 }}>
                <div
                  style={{
                    width: `${ratio * 100}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: c.done ? "var(--mg-green-text)" : "var(--mg-green)",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function GrowLine({ sector_seen }: { sector_seen: number }) {
  return (
    <p style={{ fontSize: 12, color: "rgb(var(--mg-ink-rgb) / 0.78)", marginTop: 8, lineHeight: 1.4 }}>
      {stageLine(sector_seen)}
    </p>
  );
}

function DailyHuntCard({
  daily,
  onHunt,
}: {
  daily: DailyTask | null;
  onHunt: () => void;
}) {
  if (!daily) return null;
  return (
    <button
      onClick={onHunt}
      style={{
        width: "100%",
        textAlign: "left",
        padding: "12px 14px",
        borderRadius: RADIUS.tile,
        border: daily.is_done ? "1.5px solid rgba(62,154,74,0.4)" : "1.5px solid rgba(247,198,49,0.4)",
        background: daily.is_done ? "rgba(62,154,74,0.12)" : "rgba(247,198,49,0.12)",
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: "0.04em", color: daily.is_done ? "var(--mg-green-text)" : "var(--mg-gold)" }}>
        {daily.is_done ? "HUNT DONE" : "TODAY"}
      </div>
      <div style={{ fontWeight: 800, fontSize: 16, marginTop: 2 }}>
        <SpeciesName common_name={daily.common_name} scientific_name={daily.scientific_name} />
      </div>
      <div style={{ fontSize: 12, color: "rgb(var(--mg-ink-rgb) / 0.78)", marginTop: 2 }}>{daily.sector_name}</div>
    </button>
  );
}

/** Compact bar. Keeps the walker's own mark on the map instead of under a sheet. */
function NearbyBar({
  sp,
  where,
  distance_line,
  is_pinned,
  onUnpin,
  onExpand,
}: {
  sp: Species;
  where: string;
  distance_line: string | null;
  is_pinned: boolean;
  onUnpin: () => void;
  onExpand: () => void;
}) {
  return (
    <div
      className="absolute inset-x-0 flex items-center gap-3"
      style={{
        bottom: 100,
        background: "var(--mg-surface)",
        color: "rgb(var(--mg-ink-rgb) / 0.92)",
        borderTop: "1.5px solid rgb(var(--mg-ink-rgb) / 0.1)",
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        boxShadow: "var(--mg-shadow-up)",
        zIndex: 45,
        padding: "10px 90px 10px 14px",
        animation: "fgup .28s cubic-bezier(.2,.8,.2,1)",
      }}
    >
      <button onClick={onExpand} className="flex items-center gap-3 flex-1" style={{ textAlign: "left", minWidth: 0 }}>
        <TaxonThumb species_code={sp.species_code} size={48} />
        <TaxonName
          sp={sp}
          size={17}
          eyebrow={`${is_pinned ? "PINNED" : "NEAREST"} · ${where.toUpperCase()}`}
          meta={
            distance_line ? (
              <span style={{ fontSize: 12, fontWeight: 700, color: "var(--mg-blue)" }}>{distance_line}</span>
            ) : null
          }
        />
      </button>
      {is_pinned && (
        <button
          onClick={onUnpin}
          aria-label="Follow the nearest tree again"
          className="mg-btn-secondary"
          style={{
            height: 34,
            flexShrink: 0,
            padding: "0 12px",
            borderRadius: RADIUS.pill,
            border: "none",
            fontSize: 11.5,
            fontWeight: 700,
          }}
        >
          Unpin
        </button>
      )}
    </div>
  );
}

function NearbySheet({
  sp,
  where,
  distance_line,
  onLog,
  onDismiss,
  onOpenCard,
  pool,
  is_panel = false,
}: {
  sp: Species;
  /** The spawn pool, so the hero can find the species' model. */
  pool: SpawnPoolEntry[];
  where: string;
  distance_line: string | null;
  onLog: () => void;
  onDismiss: () => void;
  /** Tapping the name opens the 3D species card. */
  onOpenCard?: () => void;
  /** Desktop dock: fill the host card instead of a full-bleed bottom sheet. */
  is_panel?: boolean;
}) {
  /* Tall GO-style species sheet: hero on top, soft pills, airy sections, one CTA. */
  return (
    <div
      className={is_panel ? undefined : "absolute inset-x-0 bottom-0"}
      role="dialog"
      aria-label={sp.common_name}
      style={{
        height: is_panel ? "100%" : "78%",
        maxHeight: is_panel ? "none" : "min(780px, 92vh)",
        background: "var(--mg-surface)",
        color: "rgb(var(--mg-ink-rgb) / 0.92)",
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        borderBottomLeftRadius: is_panel ? 16 : 0,
        borderBottomRightRadius: is_panel ? 16 : 0,
        boxShadow: is_panel ? "none" : "var(--mg-shadow-up)",
        zIndex: 45,
        padding: is_panel ? "10px 18px 18px" : "8px 22px 88px",
        display: "flex",
        flexDirection: "column",
        animation: "fgup .32s cubic-bezier(.2,.8,.2,1)",
      }}
    >
      {/* The grab bar is a hint; the × is the button (44×44). */}
      <div style={{ position: "relative", display: "flex", justifyContent: "flex-end", margin: is_panel ? "-4px -10px 0" : "0 -14px 0", flexShrink: 0 }}>
        <span
          aria-hidden="true"
          style={{ position: "absolute", left: "50%", top: 6, width: 42, height: 5, marginLeft: -21, borderRadius: 999, background: "rgb(var(--mg-ink-rgb) / 0.28)" }}
        />
        <SheetClose onClose={onDismiss} label="Close" />
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", flexShrink: 0 }}>
        <div style={{ width: "100%" }}>
          <Suspense
            fallback={
              <div style={{ height: is_panel ? 140 : 170, display: "grid", placeItems: "center" }}>
                <TaxonThumb species_code={sp.species_code} size={120} style={{ boxShadow: "var(--mg-shadow-sm)" }} />
              </div>
            }
          >
            <SpeciesHero key={sp.species_code} species_code={sp.species_code} pool={pool} height={is_panel ? 140 : 170} />
          </Suspense>
        </div>
        {onOpenCard ? (
          <button
            onClick={onOpenCard}
            aria-label={`Open the ${sp.common_name} card`}
            /* 44 px tall at least: the name alone is a 30 px target. */
            style={{ fontWeight: 800, fontSize: 26, lineHeight: 1.15, marginTop: 4, minHeight: 44, minWidth: 44, padding: "4px 10px", letterSpacing: "-0.02em", textDecoration: "underline dotted", textUnderlineOffset: 5 }}
          >
            {sp.common_name}
          </button>
        ) : (
          <div style={{ fontWeight: 800, fontSize: 26, lineHeight: 1.15, marginTop: 4, letterSpacing: "-0.02em" }}>{sp.common_name}</div>
        )}
        <div style={{ fontStyle: "italic", fontSize: 14, color: "rgb(var(--mg-ink-rgb) / 0.78)", marginTop: 4 }}>{sp.scientific_name}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 12 }}>
          <SpeciesPill sp={sp} limit={3} />
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "rgb(var(--mg-ink-rgb) / 0.6)", letterSpacing: "0.06em", marginTop: 10 }}>
          {where.toUpperCase()}
          {distance_line ? ` · ${distance_line}` : ""}
        </div>
      </div>

      {distance_line?.includes("min walk") ? (
        <p style={{ fontSize: 11, color: "rgb(var(--mg-ink-rgb) / 0.6)", marginTop: 10, textAlign: "center", flexShrink: 0 }}>
          Minutes assume a walking pace of {WALK_PACE_MS} m/s. The metre figure is the measured one.
        </p>
      ) : null}

      <div style={{ overflowY: "auto", flex: 1, minHeight: 0, marginTop: 18 }}>
        <p style={{ fontSize: 15, lineHeight: 1.5, color: "rgb(var(--mg-ink-rgb) / 0.92)", margin: 0 }}>{sp.note}</p>
        {sp.caption && (
          <div style={{ fontSize: 11.5, color: "rgb(var(--mg-ink-rgb) / 0.6)", marginTop: 10, lineHeight: 1.4 }}>{sp.caption}</div>
        )}
        <div style={{ height: 18 }} />
        <SpeciesBack sp={sp} />
        <p style={{ fontSize: 12, color: "rgb(var(--mg-ink-rgb) / 0.78)", marginTop: 18, lineHeight: 1.45 }}>
          Need a second opinion?{" "}
          <a href={SEEK_URL} target="_blank" rel="noreferrer" className="gm-inline-link" style={{ color: "var(--mg-blue)", fontWeight: 700, textDecoration: "underline" }}>
            Open Seek
          </a>
          . Identification stays with iNaturalist — not this app.
        </p>
      </div>

      <button
        onClick={onLog}
        className="flex items-center justify-center gap-2 mg-btn-primary"
        style={{
          width: "100%",
          height: 52,
          borderRadius: 10,
          fontWeight: 800,
          fontSize: 16,
          marginTop: 16,
          flexShrink: 0,
        }}
      >
        <GlyphDisc size={28}>
          <CameraIcon size={19} />
        </GlyphDisc>
        Log this sighting
      </button>
    </div>
  );
}

/* ── the back of a species card ───────────────────────────────────────────
 *
 * The front stays four elements — thumbnail, name, distance, primary pill —
 * because "don't overfeed too much… cocomelon, not an informational video"
 * (`1:00:34`). Nothing sourced was deleted to achieve that; it moved here,
 * one tap away. Every tile and the habitat line carry the reason we can say
 * them, and where our own curation is the only warrant it says so.
 */
function ConfusableWarning({ warn }: { warn: Confusable }) {
  const other = species[warn.species_code];
  return (
    <div
      style={{
        marginTop: 12,
        padding: "10px 12px",
        borderRadius: 14,
        background: "rgba(247,198,49,0.12)",
        border: "1.5px solid rgba(247,198,49,0.4)",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, color: "var(--mg-gold)", letterSpacing: "0.06em" }}>
        EASY TO CONFUSE WITH {(other?.common_name ?? warn.species_code).toUpperCase()}
      </div>
      <p style={{ fontSize: 12.5, lineHeight: 1.45, marginTop: 4, color: "rgb(var(--mg-ink-rgb) / 0.92)" }}>{warn.difference}</p>
      <div style={{ fontSize: 10.5, color: "rgb(var(--mg-ink-rgb) / 0.6)", marginTop: 5 }}>{warn.source}</div>
    </div>
  );
}

function SpeciesBack({ sp }: { sp: Species }) {
  const detail = speciesDetail(sp.species_code);
  if (!detail) return null;
  return (
    <div style={{ marginTop: 12 }}>
      {/* Above the name, not below the fold: a look-alike warning nobody
          scrolled to is a warning nobody read. */}
      {detail.confusable && <ConfusableWarning warn={detail.confusable} />}
      <div className="flex gap-2" style={{ marginTop: 12 }}>
        {detail.attribute.map((tile) => (
          <div
            key={tile.label}
            style={{
              flex: 1,
              minWidth: 0,
              borderRadius: TILE_RADIUS,
              border: "1.5px solid rgb(var(--mg-ink-rgb) / 0.1)",
              background: "rgb(var(--mg-ink-rgb) / 0.06)",
              padding: "9px 10px",
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--mg-green-text)", letterSpacing: "0.05em" }}>
              {tile.label.toUpperCase()}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 3, lineHeight: 1.25 }}>{tile.value}</div>
            <div style={{ fontSize: 9.5, color: "rgb(var(--mg-ink-rgb) / 0.6)", marginTop: 5, lineHeight: 1.3 }}>
              {tile.source}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <Eyebrow>WHERE IT GROWS</Eyebrow>
        <p style={{ fontSize: 13.5, lineHeight: 1.45, marginTop: 5 }}>{detail.habitat.line}</p>
        <div style={{ fontSize: 10.5, color: "rgb(var(--mg-ink-rgb) / 0.6)", marginTop: 5 }}>{detail.habitat.source}</div>
      </div>
    </div>
  );
}

/* ── biome card ──────────────────────────────────────────────────────────────
 *
 * The pivot's card: entering a biome opens it, leaving closes it. It shows the
 * area's species representatives — top three up front (`59:29`), the rest one
 * tap deeper — and, when the ring is our delineation, it says so on screen.
 * Distance still ranks the residents inside; it just no longer picks the card.
 */

function BiomeSpeciesRow({
  species_code,
  presence,
  onLog,
}: {
  species_code: string;
  presence: BiomePresence;
  onLog: (species_code: string) => void;
}) {
  const sp = species[species_code];
  if (!sp) return null;
  const resident = presence.resident.find((r) => r.row.species_code === species_code);
  const distance_line = resident
    ? resident.distance_m <= AT_TREE_RADIUS_M
      ? "You are at this tree"
      : resident.is_at
        ? `In range · ${formatMeter(resident.distance_m)}`
        : `${formatMeter(resident.distance_m)} ${resident.compass} · ${formatWalkMinute(resident.distance_m)}`
    : null;
  return (
    <button
      type="button"
      onClick={() => onLog(species_code)}
      className="w-full flex items-center justify-between gap-3"
      style={{ padding: "10px 0", borderTop: "1px solid rgb(var(--mg-ink-rgb) / 0.1)", textAlign: "left" }}
    >
      <span className="flex items-center gap-3" style={{ minWidth: 0 }}>
        <TaxonThumb species_code={species_code} size={46} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontWeight: 700, fontSize: 14.5, lineHeight: 1.2 }}>{sp.common_name}</span>
          <span style={{ display: "block", fontStyle: "italic", fontSize: 11.5, color: "rgb(var(--mg-ink-rgb) / 0.78)" }}>
            {sp.scientific_name}
          </span>
          {distance_line && (
            <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: "var(--mg-blue)", marginTop: 2 }}>
              {distance_line}
            </span>
          )}
        </span>
      </span>
      <PrimaryPill sp={sp} />
    </button>
  );
}

function BiomeCard({
  presence,
  is_desktop,
  onLog,
}: {
  presence: BiomePresence;
  is_desktop: boolean;
  onLog: (species_code: string) => void;
}) {
  const [is_expanded, setExpanded] = useState(false);
  const row = presence.row;
  const front = row.species_code.slice(0, 3);
  const rest = row.species_code.slice(3);
  return (
    <div>
      <div className="flex items-center gap-3.5">
        <div
          style={{
            width: is_desktop ? 72 : 56,
            height: is_desktop ? 72 : 56,
            flexShrink: 0,
            borderRadius: 999,
            display: "grid",
            placeItems: "center",
            background: "rgba(62,154,74,0.12)",
            border: "2px solid rgba(62,154,74,0.4)",
          }}
        >
          <CanopyIcon size={is_desktop ? 34 : 27} />
        </div>
        <TaxonName
          sp={{
            species_code: row.biome_code,
            common_name: row.name,
            scientific_name: row.kind,
            origin: "Native",
            pill: [],
            note: "",
            caption: null,
            tile_note: null,
          }}
          size={is_desktop ? 26 : 21}
          eyebrow={`BIOME · YOU ARE INSIDE`}
        />
      </div>
      {row.is_placeholder && (
        <div
          style={{
            marginTop: 10,
            borderRadius: 12,
            background: "rgba(247,198,49,0.12)",
            border: "1px solid rgba(247,198,49,0.4)",
            padding: "8px 11px",
            fontSize: 11.5,
            lineHeight: 1.4,
            color: "var(--mg-gold)",
            fontWeight: 700,
          }}
        >
          Placeholder extent — our delineation, not surveyed.
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <Eyebrow>SPECIES TO FIND {row.species_code.length > 0 ? `· ${row.species_code.length}` : ""}</Eyebrow>
        {row.species_code.length === 0 ? (
          <p style={{ fontSize: 13, color: "rgb(var(--mg-ink-rgb) / 0.78)", marginTop: 8, lineHeight: 1.45 }}>
            No species assigned to this area yet — the AIS inventory ({aisDueNote()}) will fill it in.
          </p>
        ) : (
          <div style={{ marginTop: 4 }}>
            {front.map((code) => (
              <BiomeSpeciesRow key={code} species_code={code} presence={presence} onLog={onLog} />
            ))}
            {is_expanded &&
              rest.map((code) => <BiomeSpeciesRow key={code} species_code={code} presence={presence} onLog={onLog} />)}
            {rest.length > 0 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                style={{
                  marginTop: 8,
                  fontSize: 12.5,
                  fontWeight: 700,
                  color: "var(--mg-blue)",
                  background: "none",
                  border: "none",
                  padding: 0,
                }}
              >
                {is_expanded ? "Show top three only" : `See all ${row.species_code.length} species`}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Compact bar over the map — the biome twin of `NearbyBar`. */
function BiomeBar({ presence, onExpand }: { presence: BiomePresence; onExpand: () => void }) {
  const row = presence.row;
  const first_species = row.species_code[0];
  return (
    <div
      className="absolute inset-x-0 flex items-center gap-3"
      style={{
        bottom: 100,
        background: "var(--mg-surface)",
        color: "rgb(var(--mg-ink-rgb) / 0.92)",
        borderTop: "1.5px solid rgb(var(--mg-ink-rgb) / 0.1)",
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        boxShadow: "var(--mg-shadow-up)",
        zIndex: 45,
        padding: "10px 90px 10px 14px",
        animation: "fgup .28s cubic-bezier(.2,.8,.2,1)",
      }}
    >
      <button onClick={onExpand} className="flex items-center gap-3 flex-1" style={{ textAlign: "left", minWidth: 0 }}>
        <span
          style={{
            width: 48,
            height: 48,
            flexShrink: 0,
            borderRadius: 999,
            display: "grid",
            placeItems: "center",
            background: "rgba(62,154,74,0.12)",
            border: "2px solid rgba(62,154,74,0.4)",
          }}
        >
          <CanopyIcon size={24} />
        </span>
        <span style={{ minWidth: 0 }}>
          <span
            style={{
              display: "block",
              fontSize: 10,
              fontWeight: 700,
              color: "var(--mg-green-text)",
              letterSpacing: "0.07em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            BIOME · INSIDE {row.is_placeholder ? "· PLACEHOLDER, NOT SURVEYED" : ""}
          </span>
          <span style={{ display: "block", fontWeight: 800, fontSize: 17, lineHeight: 1.15 }}>{row.name}</span>
          <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "var(--mg-blue)", marginTop: 2 }}>
            {first_species && species[first_species] ? `Find ${species[first_species].common_name}` : "Species to be assigned"}
          </span>
        </span>
      </button>
    </div>
  );
}

/** Bottom sheet holding the biome card — the twin of `NearbySheet`. */
function BiomeSheet({
  presence,
  onLog,
  onDismiss,
}: {
  presence: BiomePresence;
  onLog: (species_code: string) => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="absolute inset-x-0 bottom-0 scroll-soft"
      style={{
        height: "56%",
        background: "var(--mg-surface)",
        color: "rgb(var(--mg-ink-rgb) / 0.92)",
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
        boxShadow: "var(--mg-shadow-up)",
        zIndex: 45,
        padding: "10px 20px 76px",
        overflowY: "auto",
        animation: "fgup .32s cubic-bezier(.2,.8,.2,1)",
      }}
    >
      <button
        onClick={onDismiss}
        aria-label="Collapse"
        style={{ display: "block", width: 40, height: 5, borderRadius: 999, background: "rgb(var(--mg-ink-rgb) / 0.28)", margin: "0 auto 12px" }}
      />
      <BiomeCard presence={presence} is_desktop={false} onLog={onLog} />
    </div>
  );
}

/** What happened to the identify call when no proxy answered — never a token. */
function noProxyOf(http_status: number | null): string {
  return http_status === null ? "could not be reached" : `did not answer (HTTP ${http_status})`;
}

function identifyCaption(state: InatIdentifyState): string {  if (state.status === "loading") return "Asking the identify service about this photo — a suggestion, not this app’s own identification.";
  if (state.status === "offline") return "The identify service is unreachable. Pick from the campus list, or try again.";
  if (state.status === "empty") return "No species suggestion came back. Pick from the campus list, or open Seek.";
  if (state.status === "needs_token") {
    return "No identify service is set up on this server. Pick from the list, or open Seek — it identifies on your phone.";
  }
  if (state.status === "no_proxy") return `The identify server ${noProxyOf(state.http_status)}. Pick from the campus list.`;
  if (state.status === "token_expired") {
    return "iNaturalist refused this server’s token — it expired (they last 24 hours). Pick from the campus list for now.";
  }
  if (state.status === "rate_limited") return "The identify service’s quota is spent for now. Pick from the campus list, or open Seek.";
  if (state.status === "demo") {
    const why =
      state.reason === "token_expired"
        ? "the server’s iNaturalist token has expired"
        : state.reason === "no_proxy"
          ? `the identify server ${noProxyOf(state.http_status ?? null)}`
          : "this server has no identify service set up";
    return `RECORDED RESPONSE — ${why}, so it is replaying a saved reply for a Narra photo. It has not looked at your photo.`;
  }
  if (state.status === "ready") {
    return `${PROVIDER_LABEL[state.provider]} is suggesting — not this app. Tap a suggestion to fill the campus list, or pick yourself.${
      state.provider === "plantnet" ? " Plant suggestions powered by Pl@ntNet." : ""
    }`;
  }
  return "Photo is optional. A memory for your journal. Nothing is uploaded to iNaturalist as an observation.";
}

function SuggestionList({
  state,
  onPick,
}: {
  state: InatIdentifyState;
  onPick: (species_code: string) => void;
}) {
  if (state.status !== "ready" && state.status !== "demo") return null;
  const is_demo = state.status === "demo";
  return (
    <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0, display: "flex", gap: 10, overflowX: "auto" }}>
      {state.suggestion.slice(0, 3).map((row) => {
        /* Exact → that species. A genus/family roll-up is labelled partial and
           is only tappable when it narrows to one campus species. */
        const campus = matchCampus(row);
        const match = campus && campus.species_code.length === 1 ? campus.species_code[0]! : null;
        return (
          <li key={`${row.rank}-${row.scientific_name}`} style={{ flexShrink: 0, width: 88, textAlign: "center" }}>
            <button
              type="button"
              onClick={() => {
                if (match) onPick(match);
              }}
              style={{ width: "100%" }}
            >
              <SpeciesPortrait
                scientific_name={row.scientific_name}
                species_code={campus && !campus.is_partial ? (match ?? undefined) : undefined}
                size={64}
                style={{ margin: "0 auto" }}
              />
              <span style={{ display: "block", fontWeight: 800, fontSize: 11, color: "rgb(var(--mg-ink-rgb) / 0.92)", marginTop: 6, lineHeight: 1.2 }}>
                {row.common_name}
              </span>
              <span style={{ display: "block", fontSize: 10, color: "rgb(var(--mg-ink-rgb) / 0.6)", marginTop: 2 }}>
                {is_demo ? "recorded" : `${row.score.toFixed(2)}`}
              </span>
              {campus?.is_partial && (
                <span style={{ display: "block", fontSize: 10, color: "var(--mg-gold)", marginTop: 2 }}>
                  partial · {campus.match_kind} {campus.matched_name}
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The filter chips over the map. Kind comes from play-map's pin taxonomy. */
const PIN_FILTER: { kind: PinKind; label: string; tone: string }[] = [
  /* Ecology, not chrome — this is the legend for what a pin MEANS, so it keeps
     the green the Native pill and the sector fills use. Deliberately the one
     #008653 left in this file. */
  { kind: "native", label: "Native", tone: "var(--mg-green)" },
  { kind: "exotic", label: "Exotic", tone: "var(--mg-gold)" },
  { kind: "threatened", label: "Threatened", tone: "var(--mg-red)" },
];

export interface SaveInput {
  photo_data: string | null;
  inat: { scientific_name: string | null; common_name: string | null };
  note: string | null;
  /**
   * "contribution" when the student is reporting something the guide does not
   * have. This is Cathy's count-and-location gap (`2:12:12`) turned into an
   * affordance: the export already carries contributions as a distinct feature
   * type, so what a student reports leaves the device in a shape AIS can read.
   */
  entry_kind: "badge" | "contribution";
  reported_name: string | null;
  /** The pick came off the recorded demo reply, so the entry cannot be verified. */
  is_demo_id: boolean;
}

function CameraSheet({
  pick_code,
  where,
  fix_line,
  onPick,
  onSave,
  onClose,
  rarity,
  pool_count,
  hunt_code = null,
}: {
  pick_code: string;
  where: string;
  fix_line: string;
  onPick: (species_code: string) => void;
  onSave: (input: SaveInput) => void;
  onClose: () => void;
  /** Set only when the camera was opened by walking into a find in the world.
   *  Null for an ordinary log, where there is no rarity claim to make. */
  rarity?: Rarity | null;
  pool_count?: ReadonlyMap<string, number | null>;
  /** Today's hunt species, while it is still open — its tile says so. */
  hunt_code?: string | null;
}) {
  const [shot, setShot] = useState<Shot | null>(null);
  const [note, setNote] = useState("");
  const [is_reporting, setReporting] = useState(false);
  const [reported_name, setReportedName] = useState("");
  const [identify, setIdentify] = useState<InatIdentifyState>({ status: "idle" });
  /* The pool entry for a pick that is not one of the nine — resolved from the
     already-loaded pool, so this costs no second fetch. */
  const [pool, setPool] = useState<SpawnPoolEntry[] | null>(null);
  const is_wild = !picker_order.includes(pick_code) && !species[pick_code];
  useEffect(() => {
    if (!is_wild || pool) return;
    let alive = true;
    loadSpawnPool().then((row) => {
      if (alive) setPool(row);
    });
    return () => {
      alive = false;
    };
  }, [is_wild, pool]);
  const wild_pick = is_wild ? (pool?.find((e) => e.species_code === pick_code) ?? null) : null;

  /* The species iNaturalist's answer picked, and whether the student has
     chosen by hand since the photo. A hand pick always wins — including one
     made while the identification was still in flight, hence the ref. */
  const [suggested_code, setSuggestedCode] = useState<string | null>(null);
  const is_manual_ref = useRef(false);
  const [is_manual, setManual] = useState(false);
  const pickByHand = (species_code: string) => {
    is_manual_ref.current = true;
    setManual(true);
    onPick(species_code);
  };

  useEffect(() => {
    is_manual_ref.current = false;
    setManual(false);
    setSuggestedCode(null);
    if (!shot) {
      setIdentify({ status: "idle" });
      return;
    }
    let is_alive = true;
    setIdentify({ status: "loading" });
    identifyPlant({ image: shot.blob, filename: "sighting.jpg" }).then((next) => {
      if (!is_alive) return;
      /* No usable token on the server — replay the recorded reply so the walk
         still shows the identify step, labelled as recorded and saying why. */
      const shown =
        next.status === "needs_token" || next.status === "token_expired"
          ? demoIdentify(next.status)
          : next.status === "no_proxy"
            ? demoIdentify("no_proxy", next.http_status)
            : next;
      setIdentify(shown);
      /* An EXACT campus match picks the species (`suggestedPick`), so a photo
         of a Narra no longer saves as the daily target the sheet opened on. A
         genus/family roll-up is shown, never applied. */
      const code = suggestedPick(shown, is_manual_ref.current);
      if (code) {
        setSuggestedCode(code);
        onPick(code);
      }
    });
    return () => {
      is_alive = false;
    };
    // onPick is setState — stable. Do not re-score when the campus pick changes.
  }, [shot]);

  const is_suggested = suggested_code !== null && suggested_code === pick_code && !is_manual;
  const suggested_name = suggested_code ? (species[suggested_code]?.common_name ?? suggested_code) : null;

  /* Saved as attribution only when iNaturalist actually looked at the photo. */
  const top = identify.status === "ready" ? identify.suggestion[0] : null;

  return (
    <div className="absolute inset-0" style={{ zIndex: 60 }}>
      <div className="absolute inset-0" style={{ background: "rgba(17,75,47,0.25)" }} onClick={onClose} />
      <div
        className="absolute inset-x-0 bottom-0 scroll-soft gm-log-sheet"
        style={{
          top: 24,
          background: "var(--mg-surface)",
          color: "rgb(var(--mg-ink-rgb) / 0.92)",
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          overflowY: "auto",
          padding: "16px 20px 28px",
          boxShadow: "var(--mg-shadow-up)",
          animation: "fgup .3s cubic-bezier(.2,.8,.2,1)",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Log a sighting</div>
            <div style={{ fontSize: 12, color: "rgb(var(--mg-ink-rgb) / 0.66)", marginTop: 2 }}>{where}</div>
            {/* Only when you walked into a find in the world. An ordinary log
                makes no rarity claim, because outside a spawn we do not know
                that this individual is the species the pill would be about. */}
            {rarity && (
              <div style={{ marginTop: 6 }}>
                <RarityPill rarity={rarity} count={pool_count?.get(pick_code)} />
              </div>
            )}
          </div>
          {/* 44 px hit area, flat: the kit's glossy close glyph at 22 px was
              the smallest target on the sheet and read as a stray button. */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              width: 44,
              height: 44,
              flexShrink: 0,
              display: "grid",
              placeItems: "center",
              borderRadius: 999,
              background: "var(--mg-surface-2)",
              color: "var(--mg-ink)",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path d="M4 4 L14 14 M14 4 L4 14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div style={{ marginTop: 14 }}>
          <Viewfinder shot={shot} onShot={setShot} onClear={() => setShot(null)} />
        </div>

        <div className="flex items-start gap-2" style={{ marginTop: 10 }}>
          <span style={{ flexShrink: 0, marginTop: 1 }}>
            <LeafScanIcon size={16} />
          </span>
          <div style={{ fontSize: 11, color: "rgb(var(--mg-ink-rgb) / 0.62)", lineHeight: 1.4 }}>{identifyCaption(identify)}</div>
        </div>
        <SuggestionList state={identify} onPick={pickByHand} />
        {is_suggested && suggested_name && (
          <div
            role="status"
            style={{
              marginTop: 10,
              padding: "8px 12px",
              borderRadius: 10,
              background: "rgba(62,154,74,0.1)",
              border: "1px solid rgba(62,154,74,0.35)",
              fontSize: 12,
              lineHeight: 1.4,
              color: "var(--mg-green-text)",
              fontWeight: 700,
            }}
          >
            {suggested_name} picked below — suggested by{" "}
            {identify.status === "ready" ? PROVIDER_LABEL[identify.provider] : "iNaturalist"}
            {identify.status === "demo" ? " (recorded reply, not a read of your photo)" : ""}. Tap another species to change it.
          </div>
        )}
        {identify.status === "demo" && (
          <div style={{ fontSize: 11, color: "rgb(var(--mg-ink-rgb) / 0.5)", marginTop: 6 }}>
            Live identification runs once the server holds a <code>PLANTNET_API_KEY</code> (web-forest README, “Identify”).
          </div>
        )}

        <div className="flex items-center gap-1.5" style={{ marginTop: 14, fontSize: 12, color: "rgb(var(--mg-ink-rgb) / 0.76)" }}>
          <PinIcon size={16} />
          {fix_line}
        </div>

        <div style={{ marginTop: 18, fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: "var(--mg-green-text)" }}>
          WHAT DID YOU SEE?
        </div>
        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          {wild_pick && (
            <button
              type="button"
              onClick={() => pickByHand(wild_pick.species_code)}
              style={{ textAlign: "center" }}
            >
              <SpeciesPortrait
                scientific_name={wild_pick.scientific_name}
                species_code={wild_pick.species_code}
                kind={kindOf(wild_pick.iconic_taxon_name, wild_pick.archetype)}
                size={72}
                style={{
                  margin: "0 auto",
                  border: pick_code === wild_pick.species_code ? "3px solid var(--mg-green)" : "2px solid rgb(var(--mg-ink-rgb) / 0.35)",
                }}
              />
              <span style={{ display: "block", fontWeight: 800, fontSize: 11, marginTop: 6, lineHeight: 1.2 }}>
                <SpeciesName common_name={wild_pick.common_name} scientific_name={wild_pick.scientific_name} />
              </span>
              {/* Plain English for where this tile came from. It used to say
                  "Sweep" — the name of our iNaturalist data pull, which means
                  nothing to a student holding the phone. */}
              <span style={{ display: "block", fontSize: 10, color: "var(--mg-green-text)", marginTop: 2 }}>
                {wild_pick.species_code === hunt_code
                  ? "Today's hunt"
                  : rarity
                    ? "The find you walked to"
                    : "On the campus list"}
              </span>
            </button>
          )}
          {picker_order.map((species_code) => {
            const sp = species[species_code];
            const is_active = species_code === pick_code;
            return (
              <button
                key={species_code}
                type="button"
                onClick={() => pickByHand(species_code)}
                style={{ textAlign: "center" }}
              >
                <SpeciesPortrait
                  scientific_name={sp.scientific_name}
                  species_code={species_code}
                  size={72}
                  style={{
                    margin: "0 auto",
                    border: is_active ? "3px solid var(--mg-green)" : "2px solid rgb(var(--mg-ink-rgb) / 0.35)",
                  }}
                />
                <span style={{ display: "block", fontWeight: 800, fontSize: 11, marginTop: 6, lineHeight: 1.2 }}>
                  {sp.common_name}
                </span>
                <span style={{ display: "block", fontStyle: "italic", fontSize: 10, color: "rgb(var(--mg-ink-rgb) / 0.6)", marginTop: 2 }}>
                  {sp.scientific_name}
                </span>
                {is_active && is_suggested && (
                  <span style={{ display: "block", fontSize: 10, fontWeight: 800, color: "var(--mg-green-text)", marginTop: 3 }}>
                    suggested by iNaturalist
                  </span>
                )}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setReporting((prev) => !prev)}
            style={{ textAlign: "center" }}
          >
            <span
              style={{
                display: "grid",
                placeItems: "center",
                width: 72,
                height: 72,
                margin: "0 auto",
                borderRadius: 999,
                background: is_reporting ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.88)",
                border: is_reporting ? "3px solid var(--mg-green)" : "3px solid rgba(255,255,255,0.95)",
                boxShadow: "var(--mg-shadow)",
                fontWeight: 800,
                fontSize: 22,
                color: "#1a3d28",
              }}
            >
              ?
            </span>
            <span style={{ display: "block", fontWeight: 800, fontSize: 11, marginTop: 6 }}>Not on list</span>
          </button>
        </div>

        {is_reporting && (
          <div
            style={{
              marginTop: 12,
              padding: "12px 14px",
              borderRadius: 16,
              border: "1.5px solid rgb(var(--mg-ink-rgb) / 0.16)",
              background: "rgba(17,75,47,0.1)",
            }}
          >
            <label style={{ display: "block" }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, display: "block" }}>
                What would you call it?
              </span>
              <span style={{ fontSize: 11.5, color: "rgb(var(--mg-ink-rgb) / 0.62)", display: "block", marginTop: 2 }}>
                A guess is fine. &ldquo;Unknown&rdquo; is fine too — the position is the part AIS does not have.
              </span>
              <input
                value={reported_name}
                onChange={(ev) => setReportedName(ev.target.value)}
                placeholder="Tall, peeling bark, beside Gonzaga"
                style={{
                  display: "block",
                  width: "100%",
                  marginTop: 8,
                  borderRadius: 12,
                  border: "1.5px solid rgb(var(--mg-ink-rgb) / 0.16)",
                  background: "rgb(var(--mg-ink-rgb) / 0.06)",
                  color: "rgb(var(--mg-ink-rgb) / 0.92)",
                  padding: "10px 12px",
                  fontSize: 14,
                  fontFamily: "inherit",
                }}
              />
            </label>
            <p style={{ fontSize: 11, color: "rgb(var(--mg-ink-rgb) / 0.6)", marginTop: 8, lineHeight: 1.4 }}>
              This saves as a report, not as a species badge, and leaves the export tagged that way. It is not
              added to the guide — nobody here is deciding what a tree is.
            </p>
          </div>
        )}

        <label style={{ display: "block", marginTop: 16 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700, display: "block" }}>
            What did you notice?
          </span>
          <span style={{ fontSize: 11.5, color: "rgb(var(--mg-ink-rgb) / 0.6)", display: "block", marginTop: 2 }}>
            Optional — one line is plenty.
          </span>
          <textarea
            value={note}
            onChange={(ev) => setNote(ev.target.value)}
            rows={2}
            placeholder="Flowering. Big buttress roots. Beside the covered walk."
            style={{
              display: "block",
              width: "100%",
              marginTop: 8,
              borderRadius: 14,
              border: "1.5px solid rgb(var(--mg-ink-rgb) / 0.16)",
              background: "rgb(var(--mg-ink-rgb) / 0.06)",
              color: "rgb(var(--mg-ink-rgb) / 0.92)",
              padding: "10px 12px",
              fontSize: 14,
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
        </label>

        <p style={{ fontSize: 12, color: "rgb(var(--mg-ink-rgb) / 0.62)", marginTop: 14, lineHeight: 1.45 }}>
          iNaturalist is identifying, not this app. The journal stays on this device.{" "}
          <a href={SEEK_URL} target="_blank" rel="noreferrer" className="gm-inline-link" style={{ color: "var(--mg-blue)", textDecoration: "underline", fontWeight: 700 }}>
            Open Seek
          </a>
        </p>
        <div className="gm-log-save" style={{ display: "flex", justifyContent: "center", marginTop: 18 }}>
          <HudOrb
            label={is_reporting ? "Save this report" : "Save to my journal"}
            onClick={() =>
              onSave({
                photo_data: shot?.data_url ?? null,
                inat: {
                  scientific_name: top?.scientific_name ?? null,
                  common_name: top?.common_name ?? null,
                },
                note: note.trim() || null,
                entry_kind: is_reporting ? "contribution" : "badge",
                reported_name: is_reporting ? reported_name.trim() || "Unknown" : null,
                is_demo_id: identify.status === "demo",
              })
            }
            size={HUD_CAMERA}
            style={{ background: "var(--mg-green)", border: "4px solid #fff" }}
          >
            <CheckIcon size={28} />
          </HudOrb>
        </div>
        <div style={{ textAlign: "center", fontSize: 12, fontWeight: 800, marginTop: 8, color: "rgb(var(--mg-ink-rgb) / 0.76)" }}>
          {is_reporting ? "Save report" : "Save"}
        </div>
      </div>
    </div>
  );
}

/**
 * Collection grid — Seek's shape: one circular badge per species, colour when
 * seen, grey silhouette when not. A badge is a fact about your own walking, not
 * a score, so nothing here counts up against anybody else.
 */
function JournalGrid({
  seen,
  is_desktop,
  onOpenSpecies,
}: {
  seen: Set<string>;
  is_desktop: boolean;
  onOpenSpecies?: (species_code: string) => void;
}) {
  return (
    <div
      className="grid gap-x-3 gap-y-5"
      style={{ gridTemplateColumns: `repeat(${is_desktop ? 5 : 3}, minmax(0, 1fr))` }}
    >
      {dex_order.map((species_code, index) => (
        <DexCard
          key={species_code}
          index={index}
          species_code={species_code}
          is_seen={seen.has(species_code) && Boolean(species[species_code])}
          size={is_desktop ? 96 : 76}
          onOpen={onOpenSpecies}
        />
      ))}
    </div>
  );
}

function SummaryStrip({ sighting, pool }: { sighting: Sighting[]; pool: SpawnPoolEntry[] }) {
  const summary = useMemo(() => summarize(sighting), [sighting]);
  const top_species = summary.by_species.slice(0, 4);
  /* Same resolver the walk receipt uses. Without it this list printed raw
     slugs — "firecracker-flower", "lasippa-illigera" — for every find outside
     the curated nine, which is most of them once the world is walkable. */
  const curated_name = useMemo(
    () => new Map(Object.entries(species).map(([code, sp]) => [code, sp.common_name])),
    [],
  );
  const resolved = useMemo(
    () => receiptHighlight(top_species.map((r) => r.key), pool, curated_name),
    [top_species, pool, curated_name],
  );
  const name_of = (code: string) => resolved.row.find((r) => r.species_code === code)?.name ?? code;
  return (
    <Card>
      <div className="flex gap-2">
        <StatTile big={String(summary.sighting_count)} line="sightings" source="this device" />
        <StatTile
          big={String(summary.species_count + summary.wild_species_count)}
          line="species"
          source={
            summary.wild_species_count > 0
              ? `${summary.species_count} on the guide · ${summary.wild_species_count} beyond it`
              : "your journal"
          }
        />
        <StatTile big={String(summary.located_count)} line="located" source="GPS or demo walk" />
      </div>
      <div style={{ marginTop: 16 }}><Eyebrow>BY SPECIES</Eyebrow></div>
      <div style={{ marginTop: 8 }}>
        {top_species.map((row) => {
          const width = (row.count / top_species[0].count) * 100;
          return (
            <div key={row.key} style={{ marginTop: 8 }}>
              <div className="flex items-center justify-between" style={{ fontSize: 13 }}>
                <span style={{ fontWeight: 700 }}>{name_of(row.key)}</span>
                <span style={{ color: "rgb(var(--mg-ink-rgb) / 0.78)" }}>{row.count}</span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: "rgb(var(--mg-ink-rgb) / 0.1)", marginTop: 4 }}>
                <div style={{ width: `${width}%`, height: "100%", borderRadius: 999, background: "var(--mg-green)" }} />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 16 }}><Eyebrow>BY DAY</Eyebrow></div>
      <div className="flex flex-wrap gap-1.5" style={{ marginTop: 8 }}>
        {summary.by_day.slice(0, 8).map((row) => (
          <Pill key={row.key}>
            {row.key} · {row.count}
          </Pill>
        ))}
      </div>
      <p style={{ fontSize: 11.5, color: "rgb(var(--mg-ink-rgb) / 0.6)", marginTop: 14, lineHeight: 1.4 }}>
        Counts and groupings only — no score, no rank, nobody else&rsquo;s journal. {summary.photo_count} of{" "}
        {summary.sighting_count} carry a photo.
      </p>
    </Card>
  );
}

function ExportRow({ sighting }: { sighting: Sighting[] }) {
  const located = sighting.filter((s) => s.lat !== null).length;
  const stamp = new Date().toISOString().slice(0, 10);
  return (
    <Card style={{ marginTop: 16, background: "transparent" }}>
      <Eyebrow>HAND IT OVER</Eyebrow>
      <p style={{ fontSize: 13.5, lineHeight: 1.45, marginTop: 8 }}>{AIS_GAP_NOTE}</p>
      <p style={{ fontSize: 12, color: "rgb(var(--mg-ink-rgb) / 0.78)", marginTop: 8, lineHeight: 1.4 }}>
        Nothing leaves this device on its own. These buttons write a file you choose to share. Photos are not included.
      </p>
      <div className="flex gap-2" style={{ marginTop: 12 }}>
        <button
          className="mg-btn-secondary"
          type="button"
          disabled={located === 0}
          onClick={() =>
            downloadText(
              `field-guide-sighting-${stamp}.geojson`,
              JSON.stringify(toGeoJson(sighting), null, 2),
              "application/geo+json",
            )
          }
          style={{
            flex: 1,
            height: 44,
            borderRadius: 8,
            border: "none",
            fontWeight: 700,
            fontSize: 14,
            opacity: located === 0 ? 0.45 : 1,
          }}
        >
          <span className="flex items-center justify-center gap-2">
            <ExportIcon size={18} />
            GeoJSON · {located}
          </span>
        </button>
        <button
          className="mg-btn-secondary"
          type="button"
          disabled={sighting.length === 0}
          onClick={() => downloadText(`field-guide-sighting-${stamp}.csv`, toCsv(sighting), "text/csv")}
          style={{
            flex: 1,
            height: 44,
            borderRadius: 8,
            border: "none",
            fontWeight: 700,
            fontSize: 14,
            opacity: sighting.length === 0 ? 0.45 : 1,
          }}
        >
          <span className="flex items-center justify-center gap-2">
            <ExportIcon size={18} />
            CSV · {sighting.length}
          </span>
        </button>
      </div>
    </Card>
  );
}

function SightingLog({ sighting }: { sighting: Sighting[] }) {
  const row = [...sighting].reverse().slice(0, 12);
  const prior_count = (code: string, before_id: string) => {
    const self = sighting.find((y) => y.sighting_id === before_id);
    if (!self) return 0;
    return sighting.filter(
      (x) =>
        x.species_code === code &&
        x.sighting_id !== before_id &&
        x.created_at < self.created_at,
    ).length;
  };
  return (
    <div style={{ marginTop: 16 }}>
      <Eyebrow>WHAT YOU LOGGED</Eyebrow>
      <p style={{ fontSize: 11, color: "rgb(var(--mg-ink-rgb) / 0.6)", marginTop: 6, lineHeight: 1.4 }}>{LOCAL_OBS_STATUS_NOTE}</p>
      <div style={{ marginTop: 8, border: "1.5px solid rgb(var(--mg-ink-rgb) / 0.1)", borderRadius: 10, overflow: "hidden", background: "rgb(var(--mg-ink-rgb) / 0.06)" }}>
        {row.map((s, i) => {
          const sp = species[s.species_code];
          const status = localObsStatus({
            photo_data: s.photo_data,
            species_code: s.species_code,
            prior_same_species: prior_count(s.species_code, s.sighting_id),
            is_demo_id: s.is_demo_id,
          });
          return (
            <div
              key={s.sighting_id}
              className="flex items-start gap-3"
              style={{ padding: "12px 14px", borderTop: i === 0 ? "none" : "1px solid rgb(var(--mg-ink-rgb) / 0.1)" }}
            >
              <TaxonThumb species_code={s.species_code} size={52} photo_data={s.photo_data} />
              <div style={{ minWidth: 0 }}>
                <div className="flex items-baseline gap-2" style={{ flexWrap: "wrap" }}>
                  {/* A report is not a species badge and must not read as one. */}
                  <div style={{ fontWeight: 700, fontSize: 14.5 }}>
                    {s.entry_kind === "contribution"
                      ? (s.reported_name ?? "Unknown")
                      : (sp?.common_name ?? s.species_code)}
                  </div>
                  {s.entry_kind === "contribution" && <Pill tone="info">Report</Pill>}
                  {/* Picked off the recorded reply, not a read of the photo. */}
                  {s.is_demo_id && <Pill tone="info">Demo ID</Pill>}
                  <Pill tone={status === "verified" ? "native" : status === "duplicate" ? "threatened" : "info"}>
                    {LOCAL_OBS_STATUS_LABEL[status]}
                  </Pill>
                  {/* The catalogue number is assigned once and never reissued, so
                      an entry a student cites today is the same one tomorrow. */}
                  <span
                    style={{
                      fontSize: 11,
                      fontVariantNumeric: "tabular-nums",
                      color: "rgb(var(--mg-ink-rgb) / 0.6)",
                      letterSpacing: 0.3,
                    }}
                  >
                    №{String(s.entry_index).padStart(4, "0")}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: "rgb(var(--mg-ink-rgb) / 0.78)", marginTop: 2 }}>
                  {s.created_at ? new Date(s.created_at).toLocaleString() : "—"}
                </div>
                <div style={{ fontSize: 11.5, color: "rgb(var(--mg-ink-rgb) / 0.78)", marginTop: 3 }}>
                  {s.lat !== null && s.lon !== null ? (
                    <>
                      {formatLatLon({ lat: s.lat, lon: s.lon })}
                      {s.accuracy_m !== null && ` · ±${Math.round(s.accuracy_m)} m`}
                      {s.fix_source === "demo" && " · demo walk"}
                      {s.fix_source === "play" && " · play walk"}
                    </>
                  ) : (
                    "no position recorded"
                  )}
                </div>
                {s.note && (
                  <div style={{ fontSize: 12.5, color: "rgb(var(--mg-ink-rgb) / 0.92)", marginTop: 5, lineHeight: 1.4 }}>{s.note}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * What a walk amounted to. Every figure is measured or counted: the distance
 * is the haversine sum of the recorded fixes, not an estimate, and when no
 * fix was ever taken it says the distance is unknown rather than printing a
 * confident zero. No comparison to anybody else appears here by construction —
 * the receipt object carries no rank or score field at any depth.
 */
function WalkReceiptSheet({
  receipt,
  is_desktop,
  onJournal,
  onDismiss,
  pool,
}: {
  receipt: WalkReceipt;
  is_desktop: boolean;
  onJournal: () => void;
  onDismiss: () => void;
  /** The sweep, so a find outside the guide's nine reads as a name. */
  pool: SpawnPoolEntry[];
}) {
  const sector_name = receipt.sector_code
    .map((code) => sectorByCode(code)?.name)
    .filter(Boolean)
    .slice(0, 4);
  const curated_name = useMemo(
    () => new Map(Object.entries(species).map(([code, sp]) => [code, sp.common_name])),
    [],
  );
  const highlight = useMemo(
    () => receiptHighlight(receipt.new_species_code, pool, curated_name),
    [receipt.new_species_code, pool, curated_name],
  );
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 70,
        background: "rgba(17,75,47,0.28)",
        display: "flex",
        alignItems: is_desktop ? "center" : "flex-end",
        justifyContent: "center",
        padding: is_desktop ? 24 : 0,
      }}
      onClick={onDismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 460,
          background: "var(--mg-surface)",
          color: "rgb(var(--mg-ink-rgb) / 0.92)",
          borderRadius: is_desktop ? CARD_RADIUS + 6 : `${CARD_RADIUS + 6}px ${CARD_RADIUS + 6}px 0 0`,
          padding: 20,
          maxHeight: "88vh",
          overflowY: "auto",
        }}
      >
        <Eyebrow>WALK ENDED</Eyebrow>
        <h2 className="mg-heading" style={{ fontWeight: 800, fontSize: 22, marginTop: 6, color: "var(--mg-forest)" }}>
          {receipt.species_count === 0 ? "You walked. Nothing logged." : "Here is what you walked past."}
        </h2>

        <div className="flex gap-2" style={{ marginTop: 14 }}>
          <StatTile
            big={receipt.is_distance_unknown ? "—" : formatMeter(receipt.distance_meter)}
            line="walked"
            source={receipt.is_distance_unknown ? "no fix recorded" : "haversine along your trail"}
          />
          <StatTile big={`${receipt.elapsed_minute}`} line="minutes" source="start to end" />
          <StatTile big={`${receipt.species_count}`} line="species" source="this walk" />
        </div>

        <div style={{ marginTop: 16 }}>
          <Eyebrow>AREAS YOU PASSED THROUGH</Eyebrow>
          <div className="flex flex-wrap gap-1.5" style={{ marginTop: 8 }}>
            {sector_name.length > 0 ? (
              sector_name.map((name) => <Pill key={name}>{name}</Pill>)
            ) : (
              <span style={{ fontSize: 12.5, color: "rgb(var(--mg-ink-rgb) / 0.78)" }}>
                No area recorded — the walk had no position fixes.
              </span>
            )}
            {receipt.sector_count > sector_name.length && (
              <Pill>+{receipt.sector_count - sector_name.length} more</Pill>
            )}
          </div>
        </div>

        {receipt.new_species_count > 0 && (
          <div style={{ marginTop: 16 }}>
            <Eyebrow>NEW TO YOUR JOURNAL</Eyebrow>
            {/* The payoff line. A walk that met a species recorded once on this
                campus should say so here rather than reporting "1 species" and
                leaving the moment flat. Only when the walk actually earned it. */}
            {(highlight.best === "mythic" || highlight.best === "rare") && (
              <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--mg-green-text)", marginTop: 6 }}>
                {highlight.best === "mythic"
                  ? "One of these has been recorded on this campus once."
                  : "One of these is rarely recorded here."}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5" style={{ marginTop: 8 }}>
              {/* Resolved off the sweep, not off the curated nine — otherwise an
                  off-guide find printed its raw slug at the last thing a walker
                  reads, which says the app does not know what they just found. */}
              {highlight.row.map((r) => (
                <span key={r.species_code} className="inline-flex items-center gap-1.5">
                  <Pill tone="native">{r.name}</Pill>
                  {r.rarity && r.rarity !== "common" && (
                    <RarityPill rarity={r.rarity} count={r.campus_count ?? undefined} />
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {receipt.is_demo && (
          <p
            style={{
              fontSize: 11.5,
              lineHeight: 1.45,
              marginTop: 16,
              padding: "10px 12px",
              borderRadius: 14,
              background: "rgba(247,198,49,0.12)",
              color: "var(--mg-gold)",
            }}
          >
            This walk was driven by the demo loop, not by a device fix. The distance and areas above are the
            demo route&rsquo;s, not yours.
          </p>
        )}

        <p style={{ fontSize: 11.5, color: "rgb(var(--mg-ink-rgb) / 0.6)", marginTop: 14, lineHeight: 1.4 }}>
          Counts only — no score, no rank, and nothing here is compared to anybody else&rsquo;s walk.
        </p>

        <div className="flex gap-2" style={{ marginTop: 16 }}>
          <button
            onClick={onJournal}
            className="mg-btn-primary"
            style={{
              flex: 1,
              height: 46,
              borderRadius: 8,
              border: "none",
              fontWeight: 800,
              fontSize: 14.5,
            }}
          >
            View in journal
          </button>
          <button
            onClick={onDismiss}
            className="mg-btn-secondary"
            style={{
              height: 46,
              padding: "0 18px",
              borderRadius: 8,
              border: "none",
              fontWeight: 700,
              fontSize: 14.5,
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The blind-box reveal (build spec T4.5, 2026-09-06).
 *
 * Fires the moment a stage advance is detected on save. Sequence: shake →
 * crack → burst → the character scales in with the cosmetic it earned. The
 * anticipation beat matters more than the fidelity — the shake runs longer
 * than the burst. All CSS/keyframes, no second engine.
 *
 * Nothing here is random: the cosmetic shown is the one `cosmeticForStage`
 * returns for the stage just reached, and that function is a pure lookup. No
 * odds, no currency, no scarcity. Respects `prefers-reduced-motion` — under
 * reduced motion the box is skipped and the character appears at once.
 */
function BlindBoxReveal({ stage, onDismiss }: { stage: Stage; onDismiss: () => void }) {
  const cosmetic = cosmeticForStage(stage);
  const prefers_reduced = useMemo(
    () => (typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false),
    [],
  );
  const [phase, setPhase] = useState<"shake" | "crack" | "burst" | "done">(
    prefers_reduced ? "done" : "shake",
  );

  useEffect(() => {
    if (prefers_reduced) return;
    const timers = [
      window.setTimeout(() => setPhase("crack"), 900),
      window.setTimeout(() => setPhase("burst"), 1400),
      window.setTimeout(() => setPhase("done"), 1900),
    ];
    return () => timers.forEach(clearTimeout);
  }, [prefers_reduced]);

  const show_box = phase !== "done";
  const show_character = phase === "done";

  return (
    /* Fixed and at 90, over the dock (50), the sheets (60) and the toast (70):
       the reveal is the one thing on screen. It used to be a light green wash
       with the text floating straight on the Dex grid behind it. */
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Your buddy grew"
      style={{ position: "fixed", inset: 0, zIndex: 90, display: "grid", placeItems: "center" }}
      onClick={onDismiss}
    >
      <div className="absolute inset-0" style={{ background: "rgba(14,32,24,0.6)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ position: "relative", textAlign: "center", padding: 20 }}
      >
        {show_box && (
          <div
            className={phase === "burst" ? "yc-burst-out" : "yc-box-shake"}
            style={{
              width: 140,
              height: 140,
              borderRadius: 20,
              background: "#F6EDD6",
              border: "3px solid #C9B489",
              display: "grid",
              placeItems: "center",
              position: "relative",
              animation: phase === "burst"
                ? "yc-burst 0.5s ease-out forwards"
                : "yc-box-shake 0.8s ease-in-out infinite",
            }}
          >
            {phase !== "burst" && (
              <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
                <ellipse cx="50" cy="54" rx="22" ry="26" fill="url(#yc-shell)" opacity="0.9" />
                {phase === "crack" && (
                  <path
                    d="M50 8 L55 35 L44 52 L58 72 L46 92"
                    stroke="#7A5433"
                    strokeWidth="3"
                    fill="none"
                    strokeLinecap="round"
                    className="yc-crack-line"
                    style={{ strokeDasharray: 50, animation: "yc-crack 0.5s ease-out forwards" }}
                  />
                )}
              </svg>
            )}
            {phase === "burst" && (
              <svg viewBox="0 0 100 100" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
                {[0, 60, 120, 180, 240, 300].map((deg) => {
                  const rad = (deg * Math.PI) / 180;
                  return (
                    <line
                      key={deg}
                      x1="50"
                      y1="50"
                      x2={50 + Math.cos(rad) * 50}
                      y2={50 + Math.sin(rad) * 50}
                      stroke="#C9B489"
                      strokeWidth="3"
                      strokeLinecap="round"
                      style={{
                        transformOrigin: "50px 50px",
                        animation: `yc-burst 0.5s ease-out forwards`,
                      }}
                    />
                  );
                })}
              </svg>
            )}
          </div>
        )}
        {show_character && (
          <div
            className={prefers_reduced ? "gm-reveal-card" : "yc-reveal-in gm-reveal-card"}
            style={{
              animation: prefers_reduced ? undefined : "yc-reveal-in 0.6s ease-out forwards",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              width: "min(84vw, 320px)",
              padding: "24px 22px 22px",
              borderRadius: 20,
              background: "var(--mg-surface)",
              boxShadow: "0 12px 32px rgba(14,32,24,0.28)",
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: "var(--mg-green-text)" }}>
              YOUR BUDDY GREW
            </div>
            <Suspense fallback={<Character stage={stage} vigor={1} size={168} is_idle_animated />}>
              <CharacterModel stage={stage} size={168} />
            </Suspense>
            {/* The headline names the stage the picture shows. It used to be
                the cosmetic's name, so the seedling sticker sat over the words
                "Terracotta Pot" — a picture of one thing captioned as another.
                The cosmetic is still announced, as what the stage earned. */}
            <div style={{ marginTop: 4, fontWeight: 800, fontSize: 18, color: "rgb(var(--mg-ink-rgb) / 0.92)" }}>
              {STAGE_LABEL[stage]}
            </div>
            {cosmetic && (
              <>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 12,
                    fontWeight: 700,
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: "rgb(var(--mg-ink-rgb) / 0.06)",
                    color: "rgb(var(--mg-ink-rgb) / 0.85)",
                  }}
                >
                  <span aria-hidden style={{ width: 10, height: 10, borderRadius: 999, background: cosmetic.accent }} />
                  Unlocked: {cosmetic.name}
                </div>
                <div style={{ fontSize: 13, color: "rgb(var(--mg-ink-rgb) / 0.78)", maxWidth: 260, lineHeight: 1.4 }}>
                  {cosmetic.blurb}
                </div>
              </>
            )}
            <button
              onClick={onDismiss}
              className="mg-btn-primary"
              style={{
                marginTop: 10,
                height: 44,
                padding: "0 24px",
                borderRadius: 8,
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              Continue
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Trainer level-up — the reveal's card, without the box.
 *
 * The HUD's level ticked from 1 to 2 with nothing said. A level is only a way
 * of displaying points (`level.ts`), so this card claims nothing new: the
 * level reached and where the next one starts.
 */
function LevelUpCard({ level, stage, onDismiss }: { level: number; stage: Stage; onDismiss: () => void }) {
  const prefers_reduced = useMemo(
    () => (typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false),
    [],
  );
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Trainer level ${level}`}
      style={{ position: "fixed", inset: 0, zIndex: 90, display: "grid", placeItems: "center" }}
      onClick={onDismiss}
    >
      <div className="absolute inset-0" style={{ background: "rgba(14,32,24,0.45)" }} />
      <div
        onClick={(e) => e.stopPropagation()}
        className={prefers_reduced ? "gm-reveal-card" : "yc-reveal-in gm-reveal-card"}
        style={{
          position: "relative",
          animation: prefers_reduced ? undefined : "yc-reveal-in 0.5s ease-out forwards",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          width: "min(80vw, 280px)",
          padding: "22px 22px 20px",
          borderRadius: 20,
          background: "var(--mg-surface)",
          boxShadow: "0 12px 32px rgba(14,32,24,0.28)",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "0.08em", color: "var(--mg-green-text)" }}>LEVEL UP</div>
        <span className="gm-avatar" style={{ width: 84, height: 84, borderRadius: 22 }}>
          <StageSticker stage={stage} size={72} />
          <span className="gm-level">{level}</span>
        </span>
        <div className="mg-heading" style={{ fontWeight: 800, fontSize: 20, color: "rgb(var(--mg-ink-rgb) / 0.92)" }}>
          Trainer level {level}
        </div>
        <div style={{ fontSize: 13, color: "rgb(var(--mg-ink-rgb) / 0.78)", lineHeight: 1.4 }}>
          Level {level + 1} starts at {levelStart(level + 1)} points.
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="mg-btn-primary"
          style={{ marginTop: 6, height: 44, padding: "0 24px", borderRadius: 8, fontWeight: 700, fontSize: 14 }}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

/**
 * The walker's own growth — egg → sprout → sapling → tree, keyed to the
 * sectors they have actually walked into (not the photos they took, which
 * would reward standing still under one tree). Every figure is per-user and
 * derived from this device's journal; the build-spec option (b) rule is that
 * counting is fine, comparing is not, so this card never names another student.
 *
 * This is the personal "account" — a local identity for progression, not a
 * social profile. There is no server and no cross-user field anywhere in it.
 */
function ProgressCard({ sighting, is_desktop, gamify }: { sighting: Sighting[]; is_desktop: boolean; gamify: GamifySnapshot }) {
  const p = progressOf(sighting);
  const stage_label = STAGE_LABEL[p.stage];
  const next = p.next_stage;
  /* The denominator for the bar is the next stage's sector threshold, read off
     the stage table so the bar never invents a number the rules do not have. */
  const next_total = next ? p.sector_seen_count + next.remaining : null;
  const ratio = next_total ? Math.min(1, p.sector_seen_count / next_total) : 1;
  /* The two stat tiles, the progress bar and its note.
   *
   * Extracted because WHERE this block sits depends on the width. Beside a
   * 92 px portrait on a 375 px phone it had 167 px to work with, which gave
   * each tile 56 px of content — and "CONTRIBUTIONS" is thirteen characters,
   * so it was clipped mid-word inside its own card. On mobile the block moves
   * below the portrait and gets the card's full width; on desktop, where there
   * is room, it stays beside it. */
  const detail = (
    <>
        <div className="flex gap-2" style={{ marginTop: is_desktop ? 12 : 0 }}>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              borderRadius: RADIUS.tile,
              border: "1.5px solid rgba(62,154,74,0.4)",
              background: "rgba(62,154,74,0.12)",
              padding: "9px 11px",
            }}
          >
            <div style={{ fontSize: 9.5, fontWeight: 800, color: "var(--mg-green-text)", letterSpacing: "0.02em" }}>
              BADGES
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{p.badge_count}</div>
            <div style={{ fontSize: 10, color: "rgb(var(--mg-ink-rgb) / 0.6)", marginTop: 1 }}>
              {p.photographed_count} species photographed
            </div>
          </div>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              borderRadius: RADIUS.tile,
              border: "1.5px solid rgba(0,159,217,0.4)",
              background: "rgba(0,159,217,0.12)",
              padding: "9px 11px",
            }}
          >
            <div style={{ fontSize: 9.5, fontWeight: 800, color: "var(--mg-blue)", letterSpacing: "0.02em" }}>
              CONTRIBUTIONS
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{p.contribution_count}</div>
            <div style={{ fontSize: 10, color: "rgb(var(--mg-ink-rgb) / 0.6)", marginTop: 1 }}>
              reports AIS does not have
            </div>
          </div>
        </div>

        {/* Two counters, never one score: the two ways to earn stay side by
            side, so a student can see how they grew without reading it as a
            rank against anyone else. */}
        <div style={{ marginTop: 12 }}>
          <div className="flex items-center justify-between" style={{ fontSize: 12.5 }}>
            <span style={{ fontWeight: 700, color: "rgb(var(--mg-ink-rgb) / 0.92)" }}>
              {next ? `To ${STAGE_LABEL[next.stage]}` : "Fully grown"}
            </span>
            <span style={{ color: "rgb(var(--mg-ink-rgb) / 0.78)", fontVariantNumeric: "tabular-nums" }}>
              {next ? `${p.sector_seen_count}/${next_total}` : "—"}
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: "rgb(var(--mg-ink-rgb) / 0.1)", marginTop: 5 }}>
            <div
              style={{
                width: `${ratio * 100}%`,
                height: "100%",
                borderRadius: 999,
                background: "var(--mg-green)",
                transition: "width .3s ease",
              }}
            />
          </div>
        </div>
        <GrowLine sector_seen={p.sector_seen_count} />
    </>
  );

  return (
    <Card style={{ display: "flex", flexDirection: "column", gap: is_desktop ? 0 : 14 }}>
      <div style={{ display: "flex", gap: is_desktop ? 22 : 14, alignItems: "stretch" }}>
        {/* The 3D viewer IS the tile (round 5: an 84 px viewer floated in a
            110 px tile and the camera sliced the leaf disc). The tile keeps a
            fixed width and at least a square height; the viewer fills it and
            frames the whole model itself. */}
        <div
          style={{
            flexShrink: 0,
            display: "grid",
            placeItems: "stretch",
            width: is_desktop ? 150 : 110,
            minHeight: is_desktop ? 150 : 110,
            overflow: "hidden",
            borderRadius: RADIUS.tile,
            background: "rgba(62,154,74,0.12)",
            border: "1px solid rgba(62,154,74,0.12)",
          }}
        >
          <Suspense
            fallback={<Character stage={p.stage} vigor={p.vigor} size={is_desktop ? 108 : 84} is_idle_animated />}
          >
            <CharacterModel stage={p.stage} is_fill />
          </Suspense>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          {/* Wraps rather than clips: the eyebrow is long and the counter on
              the right is the part that must stay whole. */}
          <div className="flex items-baseline gap-2" style={{ flexWrap: "wrap" }}>
            <Eyebrow>{is_desktop ? "YOUR GROWTH · BIODIVERSITY BUDDY" : "YOUR GROWTH"}</Eyebrow>
            <span
              style={{
                fontSize: 11,
                color: "rgb(var(--mg-ink-rgb) / 0.6)",
                marginLeft: "auto",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}
            >
              {gamify.total_points} pts · {gamify.streak_weeks} wk
            </span>
          </div>
          <div className="flex items-baseline gap-2" style={{ marginTop: 4, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 800, fontSize: is_desktop ? 24 : 20 }}>{stage_label}</div>
            {p.sector_seen_count > 0 && (
              <span style={{ fontSize: 12.5, color: "rgb(var(--mg-ink-rgb) / 0.78)" }}>
                · {p.sector_seen_count} {p.sector_seen_count === 1 ? "area" : "areas"} walked
              </span>
            )}
          </div>
          {is_desktop && detail}
        </div>
      </div>
      {!is_desktop && <div>{detail}</div>}
    </Card>
  );
}

function JournalScreen({
  sighting,
  seen,
  is_desktop,
  pool_count,
  pool,
  is_seeded = false,
  gamify,
  world = null,
  walker_label = null,
  walker_name,
  onOpenSpecies,
}: {
  sighting: Sighting[];
  seen: Set<string>;
  is_desktop: boolean;
  /** species_code -> real campus observation count, for the rarity badges. */
  pool_count: ReadonlyMap<string, number | null>;
  /** The full sweep, for the shelf of finds the guide never drew. */
  pool: SpawnPoolEntry[];
  /** True when every row came from `?seed=demo`. Says so on screen. */
  is_seeded?: boolean;
  gamify: GamifySnapshot;
  world?: World | null;
  /** The hall's live "N walkers out" — the same count as the map pill. */
  walker_label?: string | null;
  walker_name?: string;
  /** Tapping a seen Dex card opens the 3D species card. */
  onOpenSpecies?: (species_code: string) => void;
}) {
  const summary = summarize(sighting);
  const wild_line =
    summary.wild_species_count > 0 ? `+${summary.wild_species_count}` : null;
  return (
    <div
      className="scroll-soft"
      style={{
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
        background: "var(--mg-bg)",
        color: "rgb(var(--mg-ink-rgb) / 0.92)",
        padding: is_desktop ? "28px 56px 190px" : "18px 16px 190px",
      }}
    >
      <div style={{ maxWidth: is_desktop ? 720 : undefined, margin: is_desktop ? "0 auto" : undefined }}>
        <DexHeader seen_count={summary.species_count} total={summary.species_total} extra={wild_line} />
        {is_seeded && (
          <p
            style={{
              fontSize: 11,
              lineHeight: 1.4,
              marginTop: 10,
              padding: "8px 10px",
              borderRadius: 12,
              background: "rgba(247,198,49,0.12)",
              color: "var(--mg-gold)",
              fontWeight: 700,
            }}
          >
            Seeded demo — open without <code>?seed=demo</code> for an empty dex.
          </p>
        )}
        <div style={{ marginTop: 18 }}>
          <JournalGrid seen={seen} is_desktop={is_desktop} onOpenSpecies={onOpenSpecies} />
        </div>
        <div style={{ marginTop: 18 }}>
          <WorldStrip sighting={sighting} world={world} walker_label={walker_label} name={walker_name} />
        </div>
        {seen.size > 0 && (
          <>
            <div style={{ marginTop: 22 }}>
              <ProgressCard sighting={sighting} is_desktop={is_desktop} gamify={gamify} />
            </div>
            <div style={{ marginTop: 22 }}>
              <BlindboxShelf refresh_key={gamify.total_points} />
            </div>
            <div style={{ marginTop: 22 }}>
              <SummaryStrip sighting={sighting} pool={pool} />
            </div>
            <div style={{ marginTop: 26 }}>
              <WildShelf sighting={sighting} pool={pool} curated={picker_order} is_desktop={is_desktop} />
            </div>
            <div style={{ marginTop: 26 }}>
              <BadgeShelf sighting={sighting} pool_count={pool_count} is_desktop={is_desktop} />
            </div>
            <SightingLog sighting={sighting} />
            <ExportRow sighting={sighting} />
          </>
        )}
      </div>
    </div>
  );
}

function PlanContent() {
  return (
    <>
      <h1 className="mg-heading" style={{ fontWeight: 800, fontSize: 24, lineHeight: 1.15, color: "var(--mg-forest)" }}>What happens after the walk</h1>
      <div style={{ width: 48, height: 4, borderRadius: 999, background: "var(--mg-green)", marginTop: 12 }} />
      <section style={{ marginTop: 20, borderRadius: 10, border: "1px solid rgb(var(--mg-ink-rgb) / 0.1)", background: "var(--mg-surface)", padding: 16 }}>
        <Eyebrow>1 · WHAT THIS IS FOR</Eyebrow>
        <p style={{ fontSize: 14.5, lineHeight: 1.5, marginTop: 8 }}>
          Formation, first: help students notice and name the trees they walk under every day. And a public map they can
          actually use — not a report that sits in a drawer.
        </p>
      </section>
      <section style={{ marginTop: 16, borderRadius: 10, border: "1px solid rgb(var(--mg-ink-rgb) / 0.1)", background: "var(--mg-surface)", padding: 16 }}>
        <Eyebrow>2 · WHO WE STILL NEED TO TALK TO</Eyebrow>
        <p style={{ fontSize: 12, color: "rgb(var(--mg-ink-rgb) / 0.78)", marginTop: 6 }}>
          Nothing here is agreed yet. We are not claiming a consultation we have not held.
        </p>
        <div
          style={{
            marginTop: 10,
            borderRadius: 16,
            background: "rgba(62,154,74,0.12)",
            border: "1px solid rgba(62,154,74,0.4)",
            padding: "12px 14px",
          }}
        >
          <p style={{ fontSize: 13, lineHeight: 1.45 }}>{AIS_GAP_NOTE}</p>
          <p style={{ fontSize: 13, lineHeight: 1.45, marginTop: 8 }}>{WILD_NOTE}</p>
        </div>
        <div style={{ marginTop: 8 }}>
          {consult.map((row) => (
            <div key={row.consult_id} style={{ padding: "12px 0", borderTop: "1px solid rgb(var(--mg-ink-rgb) / 0.1)" }}>
              <div className="flex items-start justify-between gap-3">
                <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.35 }}>{row.label}</span>
                <Pill tone="exotic">not yet</Pill>
              </div>
              {row.detail && (
                <p style={{ fontSize: 12, color: "rgb(var(--mg-ink-rgb) / 0.78)", marginTop: 6, lineHeight: 1.4 }}>{row.detail}</p>
              )}
            </div>
          ))}
        </div>
      </section>
      <section style={{ marginTop: 16, borderRadius: 10, border: "1px solid rgb(var(--mg-ink-rgb) / 0.1)", background: "var(--mg-surface)", padding: 16 }}>
        <Eyebrow>3 · THE BIOMES — THE MAP CUT INTO AREAS</Eyebrow>
        <p style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 8 }}>
          Since the 09-02 pulong the unit of play is the area, not the tree — and since 09-03 those areas are cut{" "}
          <strong style={{ fontWeight: 700 }}>along the real roads and footpaths</strong>, not drawn by us. Each sector
          below is a face of the OpenStreetMap way network (ODbL), the way a city block is defined by its streets.
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.5, marginTop: 8, color: "rgb(var(--mg-ink-rgb) / 0.92)" }}>
          How green each one is was <strong style={{ fontWeight: 700 }}>measured off satellite imagery</strong>, not
          guessed from the absence of a building — which is what used to paint car parks as lawn. Species lists stay
          provisional until the AIS inventory lands ({aisDueNote()}).
        </p>
        <div style={{ marginTop: 10 }}>
          {[...sector_row]
            .sort((a, b) => b.area_m2 - a.area_m2)
            .slice(0, 14)
            .map((row) => (
              <div key={row.sector_code} style={{ padding: "10px 0", borderTop: "1px solid rgb(var(--mg-ink-rgb) / 0.1)" }}>
                <div className="flex items-start justify-between gap-3">
                  <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.35 }}>
                    {row.name}
                    <span style={{ display: "block", fontSize: 11.5, color: "rgb(var(--mg-ink-rgb) / 0.78)", marginTop: 2 }}>
                      {row.kind.replace(/-/g, " ")} · {(row.area_m2 / 10000).toFixed(2)} ha ·{" "}
                      {row.vegetation_ratio === null
                        ? "not measured"
                        : `${Math.round(row.vegetation_ratio * 100)}% green (measured)`}
                      {row.is_named_by_us ? " · name is ours" : ""}
                    </span>
                  </span>
                  {row.is_biome ? <Pill tone="native">biome</Pill> : <Pill tone="exotic">paved</Pill>}
                </div>
              </div>
            ))}
        </div>
        <p style={{ fontSize: 12, color: "rgb(var(--mg-ink-rgb) / 0.78)", marginTop: 10, lineHeight: 1.4 }}>
          {sector_row.length} sectors cut in total, {biome_sector.length} of them vegetated enough to walk into and look
          at a plant. The rest are drawn as the paved ground they are — showing them as lawn would be the lie this
          replaced. {sector_row.filter((r) => r.is_named_by_us).length} carry a name we chose because OpenStreetMap has
          none for that ground.
        </p>
      </section>
      <section style={{ marginTop: 16, borderRadius: 10, border: "1px solid rgb(var(--mg-ink-rgb) / 0.1)", background: "var(--mg-surface)", padding: 16 }}>
        <Eyebrow>4 · HOW ANOTHER CAMPUS COPIES THIS</Eyebrow>
        <ul style={{ marginTop: 8, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            "A walkable-path map — only where students can actually go.",
            "A curated species list from whoever already counted.",
            "A personal journal with no rank.",
            "A geofence for off-limits ground.",
          ].map((t) => (
            <li key={t} style={{ fontSize: 14.5, lineHeight: 1.45, display: "flex", gap: 10 }}>
              <span style={{ color: "var(--mg-green)", fontWeight: 800 }}>—</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
        <p style={{ fontSize: 13, lineHeight: 1.45, marginTop: 12, color: "rgb(var(--mg-ink-rgb) / 0.92)" }}>
          Ateneo sits in AUN ecological-education networks (Delocado, Tuaño, Lacdao-Umali 2025) — that is a carrier, not a
          second app.
        </p>
      </section>
      <p style={{ fontSize: 11, color: "rgb(var(--mg-ink-rgb) / 0.6)", marginTop: 26, lineHeight: 1.4 }}>
        Youth CLAP 2026 · student prototype · not an official AIS product.
      </p>
    </>
  );
}


/**
 * The two things the map has to keep saying out loud, in one place instead of
 * two floating cards that collided over the imagery: the grove is off-limits
 * and its extent is a placeholder, and the green you see is the photograph
 * rather than a layer we computed.
 */
function MapNote({ is_desktop, layer }: { is_desktop: boolean; layer: Layer }) {
  return (
    <div
      className="absolute"
      style={{
        left: is_desktop ? 18 : 12,
        bottom: is_desktop ? 30 : 176,
        zIndex: 20,
        maxWidth: is_desktop ? 330 : 250,
        background: "var(--mg-surface-glass)",
        color: "rgb(var(--mg-ink-rgb) / 0.92)",
        border: "1.5px solid rgb(var(--mg-ink-rgb) / 0.1)",
        borderRadius: 10,
        padding: "9px 12px",
        boxShadow: "var(--mg-shadow-sm)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div className="flex items-start gap-2">
        <span style={{ flexShrink: 0, marginTop: 1 }}>
          <RestrictedIcon size={17} />
        </span>
        <div style={{ fontSize: 11, lineHeight: 1.35 }}>
          <strong style={{ fontWeight: 700 }}>Off-limits.</strong> Nothing here.
        </div>
      </div>
      {layer === "satellite" && is_desktop && (
        <div
          style={{
            fontSize: 10.5,
            lineHeight: 1.35,
            color: "rgb(var(--mg-ink-rgb) / 0.78)",
            marginTop: 7,
            paddingTop: 7,
            borderTop: "1px solid rgb(var(--mg-ink-rgb) / 0.1)",
          }}
        >
          Imagery, not our canopy layer.
        </div>
      )}
    </div>
  );
}

/**
 * `is_desktop` switches the layout; `is_wide` decides whether the header has
 * room for its optional control. At 900 the fixed side columns crushed the nav.
 */
function useDesktop() {
  const read = () => ({ is_desktop: window.innerWidth >= 900, is_wide: window.innerWidth >= 1120 });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const onResize = () => setSize(read());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return size;
}


/**
 * The sector sheet.
 *
 * Front kept to four things (`1:00:34` Ivan: "don't overfeed too much…
 * cocomelon, not an informational video"): what this ground is, how green it
 * measures, what may grow here, and the one action. Provenance sits one tap
 * down rather than deleted — a caption nobody can reach is a caption removed.
 *
 * Laid out as a bottom sheet on a grid rather than a floating card with ad hoc
 * margins, which is what made the spacing read as crooked (owner, 09-03): one
 * padding scale, one gap, a grab handle, and a full-width primary action where
 * a thumb already is.
 */
function SectorCard({
  row,
  resident,
  progress,
  is_desktop,
  onLog,
  onDismiss,
}: {
  row: Sector;
  /**
   * Curated encounters that fall inside this sector.
   *
   * Passed in rather than read off `row.species_code`, because these are demo-
   * map positions derived at runtime, not a field of the sector data. Keeping
   * them out of `campus-sector.json` is what stops them reading as a survey.
   */
  resident: Encounter[];
  progress: { seen_count: number; total: number };
  is_desktop: boolean;
  onLog: (species_code: string) => void;
  onDismiss: () => void;
}) {
  const [is_open, setOpen] = useState(false);
  const veg = row.vegetation_ratio;
  const veg_percent = veg === null ? null : Math.round(veg * 100);
  const PAD = 18;

  return (
    <>
      <div
        className="absolute inset-0"
        style={{ zIndex: 47, background: "rgba(17,75,47,0.25)" }}
        onClick={onDismiss}
      />
      <div
        role="dialog"
        aria-label={row.name}
        className="absolute"
        style={{
          left: is_desktop ? 18 : 0,
          right: is_desktop ? "auto" : 0,
          width: is_desktop ? 380 : undefined,
          bottom: 148,
          zIndex: 48,
          background: "var(--mg-surface)",
          color: "rgb(var(--mg-ink-rgb) / 0.92)",
          borderRadius: is_desktop ? 16 : "16px 16px 0 0",
          boxShadow: "var(--mg-shadow-up)",
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 14,
          padding: is_desktop ? `${PAD}px` : `10px ${PAD}px ${PAD}px`,
        }}
      >
        <div style={{ gridColumn: "1 / -1", justifySelf: "center", width: 42, height: 4, borderRadius: 999, background: "rgb(var(--mg-ink-rgb) / 0.28)" }} />

        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.2, letterSpacing: -0.2 }}>{row.name}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            <Tag>{row.kind.replace(/-/g, " ")}</Tag>
            <Tag>{(row.area_m2 / 10000).toFixed(2)} ha</Tag>
            {veg_percent !== null && <Tag tone={veg_percent >= 45 ? "green" : "grey"}>{veg_percent}% green</Tag>}
          </div>
          {resident.length > 0 ? (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "rgb(var(--mg-ink-rgb) / 0.62)" }}>
                On the walk list here · {progress.seen_count} logged · yours only
              </div>
              <div style={{ display: "flex", gap: 10, overflowX: "auto", marginTop: 8 }}>
                {resident.map((e) => {
                  const sp = species[e.species_code];
                  if (!sp) return null;
                  return (
                    <button
                      key={e.encounter_id}
                      type="button"
                      onClick={() => onLog(e.species_code)}
                      style={{ width: 64, flexShrink: 0, textAlign: "center" }}
                    >
                      <SpeciesPortrait scientific_name={sp.scientific_name} species_code={sp.species_code} size={56} />
                      <span style={{ display: "block", fontSize: 10, fontWeight: 800, marginTop: 4 }}>{sp.common_name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <p style={{ fontSize: 13, lineHeight: 1.5, color: "rgb(var(--mg-ink-rgb) / 0.66)", margin: "12px 0 0" }}>
              Nothing is on the walk list here yet. Log whatever you actually see.
            </p>
          )}
          {is_open && (
            <p style={{ fontSize: 12, lineHeight: 1.55, color: "rgb(var(--mg-ink-rgb) / 0.62)", margin: "12px 0 0" }}>
              The edges of this sector are the roads and footpaths around it, from OpenStreetMap (ODbL) — not a boundary we
              drew.{" "}
              {veg_percent !== null
                ? `${veg_percent}% green is measured off Esri satellite imagery (${row.vegetation_sample} sampled points), which is how a car park stops being painted as lawn.`
                : "No imagery covered this ring, so greenness here is inferred from building cover rather than measured."}
              {row.is_named_by_us ? " The NAME is ours — OSM has none for this ground." : ""}
              {row.species_code.length > 0
                ? ` Species here are provisional demo-map positions, superseded by the AIS inventory (${aisDueNote()}). Not a survey.`
                : ""}
            </p>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
          <HudOrb label="Log what you see here" onClick={() => onLog(resident[0]?.species_code ?? "narra")} size={HUD_ORB}>
            <img src={icon.go_camera} alt="" width={HUD_ORB} height={HUD_ORB} style={{ display: "block", width: "100%", height: "100%", objectFit: "cover" }} />
          </HudOrb>
          <HudOrb label={is_open ? "Hide sources" : "Where does this come from?"} active={is_open} onClick={() => setOpen((o) => !o)} size={HUD_ORB}>
            <span style={{ fontWeight: 800, fontSize: 22, color: "#1a3d28" }}>i</span>
          </HudOrb>
        </div>
      </div>
    </>
  );
}

/** One measurement, one pill. Green only when it IS a greenness claim. */
function Tag({ children, tone = "grey" }: { children: React.ReactNode; tone?: "grey" | "green" }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: tone === "green" ? "#2f5d2b" : "rgb(var(--mg-ink-rgb) / 0.08)",
        color: tone === "green" ? "var(--mg-green-text)" : "rgb(var(--mg-ink-rgb) / 0.92)",
        border: "1px solid transparent",
        borderRadius: 3,
        padding: "4px 10px",
        fontSize: 11.5,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}



/**
 * Play / Field is a core mechanic, not a corner toggle.
 *
 * It shipped first as a small pill floating over the map, where it was easy to
 * miss and sat on top of the map's own controls (owner, 09-03). A segmented
 * control in the header gives it a permanent home, says which mode you are in
 * without being read, and stops it colliding with anything.
 */
/**
 * One chrome frame, used by BOTH map views.
 *
 * Play and Field used to position their own controls, and they drifted: the
 * mode switch sat top-right in one and top-left in the other, and on desktop it
 * landed exactly on top of the coordinate pill. A control that moves when the
 * view changes is a control you have to hunt for, so the geometry lives here
 * once and each view supplies only WHAT goes in the slots, never where.
 *
 * Three slots. `context` (top-left) says where you are. `control` (top-right,
 * mode switch always first) is a column, so a view with more controls grows
 * downward instead of sideways into the context card. `below` spans the FULL
 * width underneath both — chips belong there because squeezed into the left
 * column on a 390 px screen they stacked one per row and ate half the map.
 */
function MapChrome({
  is_desktop,
  context,
  control,
  below,
}: {
  is_desktop: boolean;
  context: React.ReactNode;
  control: React.ReactNode;
  below?: React.ReactNode;
}) {
  const inset = is_desktop ? 18 : 12;
  return (
    <div
      className="absolute"
      style={{
        top: inset,
        left: inset,
        right: inset,
        zIndex: 30,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        /* The frame must not eat map drags — only its children take pointers. */
        pointerEvents: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        {/* `below` hangs off the BOTTOM-LEFT of the context card, inside the
            same column — not under the whole row.
            
            Under the row it was laid out after the control stack, and that
            stack is three 44 px buttons tall. So the daily hunt sat ~150 px
            down the screen with a band of empty map between it and the card it
            belongs to, which read as a gap somebody forgot to close rather than
            as a deliberate space. */}
        <div
          style={{
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 8,
            pointerEvents: "auto",
          }}
        >
          {context}
          {below}
        </div>
        <div style={{ flex: 1 }} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 8,
            flexShrink: 0,
            pointerEvents: "auto",
          }}
        >
          {control}
        </div>
      </div>
    </div>
  );
}

/** The card that says where you are. Same shell in both views. */
function ContextCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "var(--mg-surface-glass)",
        color: "rgb(var(--mg-ink-rgb) / 0.92)",
        backdropFilter: "blur(8px)",
        border: "1px solid rgb(var(--mg-ink-rgb) / 0.1)",
        borderRadius: 10,
        padding: "9px 15px",
        boxShadow: "var(--mg-shadow-sm)",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          color: "rgb(var(--mg-ink-rgb) / 0.6)",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 15.5,
          fontWeight: 800,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          marginTop: 1,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function ModeSwitch({
  mode,
  onMode,
}: {
  mode: "play" | "field";
  onMode: (m: "play" | "field") => void;
}) {
  const is_field = mode === "field";
  return (
    <button
      type="button"
      aria-label={is_field ? "Back to play" : "Field layers"}
      title={is_field ? "Back to play" : "Field layers"}
      onClick={() => onMode(is_field ? "play" : "field")}
      style={{
        width: 44,
        height: 44,
        borderRadius: 10,
        background: is_field ? "var(--mg-green-deep)" : "var(--mg-surface-glass)",
        color: is_field ? "#fff" : "var(--mg-forest)",
        boxShadow: "var(--mg-shadow-sm)",
        border: "none",
        display: "grid",
        placeItems: "center",
      }}
    >
      <CanopyIcon size={18} />
    </button>
  );
}

/**
 * Which of the three position sources is driving the walk — and the one control
 * that changes it, on the screen the walk actually happens on.
 *
 * It used to live only in the field view, which was survivable while the only
 * alternative source was a scripted loop for a projector. It stopped being
 * survivable once the answer to "there are no campus trees in the venue" became
 * a thumbstick: a stick you can only reach by leaving the play view, opening
 * the field layers and finding a chip is a stick nobody finds on a stage.
 *
 * It states the source rather than hiding it. A walk driven by a thumb and a
 * walk driven by a satellite produce the same journal, and the only honest way
 * to ship that is for the screen to say which one is happening.
 */
function GeoModeSwitch({
  mode,
  label,
  onCycle,
}: {
  mode: GeoMode;
  label: string;
  onCycle: () => void;
}) {
  const tone =
    mode === "gps" ? "var(--mg-green-deep)" : mode === "play" ? "#C98A12" : "var(--mg-surface-glass)";
  return (
    <button
      type="button"
      aria-label={`Position source: ${label}. Tap to change.`}
      title={label}
      onClick={onCycle}
      style={{
        width: 44,
        height: 44,
        borderRadius: 10,
        background: tone,
        color: mode === "gps" || mode === "play" ? "#fff" : "var(--mg-forest)",
        boxShadow: "var(--mg-shadow-sm)",
        border: "none",
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        {mode === "gps" ? (
          <>
            <circle cx="12" cy="12" r="3.4" fill="currentColor" />
            <circle cx="12" cy="12" r="7.4" fill="none" stroke="currentColor" strokeWidth="1.8" opacity="0.8" />
            <path d="M12 1.6v3M12 19.4v3M1.6 12h3M19.4 12h3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </>
        ) : mode === "play" ? (
          <>
            <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" opacity="0.85" />
            <circle cx="12" cy="12" r="3.6" fill="currentColor" />
            <path d="M12 3.4v2.2M12 18.4v2.2M3.4 12h2.2M18.4 12h2.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </>
        ) : (
          <path
            d="M6 4.5v15l12-7.5z"
            fill="currentColor"
          />
        )}
      </svg>
    </button>
  );
}

/**
 * Recentre on the walker at street zoom, facing north.
 * The play camera sits at z22 (~14 m across a 390 px phone) — path level,
 * third person, not the campus diagram.
 */
function Compass({ bearing, onReset }: { bearing: number; onReset: () => void }) {
  return (
    <button
      type="button"
      aria-label="Street view on me"
      title="Street view on me"
      onClick={onReset}
      style={{
        width: 44,
        height: 44,
        borderRadius: 10,
        background: "var(--mg-surface-glass)",
        border: "none",
        boxShadow: "var(--mg-shadow-sm)",
        display: "grid",
        placeItems: "center",
        cursor: "pointer",
      }}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" style={{ transform: `rotate(${-bearing}deg)` }}>
        <path d="M12 3 L15.4 13 L12 11 L8.6 13 Z" fill="#C0392B" />
        <path d="M12 21 L8.6 11 L12 13 L15.4 11 Z" fill="#9AA3A0" />
      </svg>
    </button>
  );
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => pathToRoute(window.location.pathname));
  /**
   * Play is the default view (owner, 09-03: "simple pokemon go like … friendly
   * and less cluttered"). Field is the same map with every layer control and
   * every source caption still on it — the citations were moved behind one
   * button, not deleted, which is the build-spec rule.
   */
  const [map_mode, setMapMode] = useState<"play" | "field">(() =>
    new URLSearchParams(window.location.search).get("view") === "field" ? "field" : "play",
  );
  /** Camera bearing, clockwise from north. Two fingers (or shift-drag) swing it. */
  /**
   * Camera bearing, clockwise from north. Two fingers — or shift-drag on a
   * desktop — swing it; the compass puts it back.
   *
   * Seeded from `?bearing=` so a projector demo can be set up at a known angle
   * and so a screenshot of the rotated camera is reproducible. A view parameter
   * only: it cannot move the walker or touch a single sighting.
   */
  const [bearing, setBearing] = useState(() => {
    const raw = new URLSearchParams(window.location.search).get("bearing");
    const degree = Number(raw);
    return raw !== null && Number.isFinite(degree) ? degree : 0;
  });
  /* Each view has its own comfortable zoom; switching should not strand you at
     the other one's. */
  const setMode = (next: "play" | "field") => {
    setMapMode(next);
    setView((prev) => ({ ...prev, zoom: next === "play" ? PLAY_ZOOM : WALK_ZOOM }));
    setFollowing(true);
  };
  const [picked_sector, setPickedSector] = useState<Sector | null>(null);
  const [is_restricted, setRestricted] = useState(true);
  /* `guide` reads better on a walk than imagery; satellite is one tap away. */
  const [layer, setLayer] = useState<Layer>("guide");
  /* Campus modules (hotspots, emergency & DRR, trails) — Gelo 09-30 `3:58`–`5:11`. All UI in module-ui.tsx. */
  const module_state = useModuleState();
  /* `?zoom=` is the bearing parameter's twin and exists for the same reason: a
     projector can be set up at a known camera, and a screenshot of a given zoom
     is reproducible. Clamped to the play band, so the parameter cannot reach a
     camera the gestures are not allowed to reach either. */
  /* `?skyline=` — solid / hollow / shadow. A view parameter like `?bearing=`
     and `?zoom=`, here so the three can be compared on the same ground rather
     than argued about from memory. */
  const skyline_url_style = ((): SkylineStyle | undefined => {
    const raw = new URLSearchParams(window.location.search).get("skyline");
    return raw === "block" || raw === "solid" || raw === "hollow" || raw === "shadow" ? raw : undefined;
  })();
  const [view, setView] = useState<View>(() => {
    const raw = new URLSearchParams(window.location.search).get("zoom");
    const asked = Number(raw);
    const zoom =
      raw !== null && Number.isFinite(asked)
        ? Math.max(PLAY_MIN_ZOOM, Math.min(PLAY_MAX_ZOOM, Math.round(asked)))
        : PLAY_ZOOM;
    return { ...CAMPUS_CENTER, zoom };
  });
  /* Off the moment the walker pans or zooms — a map that fights the hand is worse
     than one that stops following. The Recentre control turns it back on. */
  const [is_following, setFollowing] = useState(true);
  const [is_camera_open, setCameraOpen] = useState(false);
  /** Set only when the walker taps a disc. Otherwise the card follows nearest. */
  const [pinned_id, setPinnedId] = useState<string | null>(null);
  const [is_sheet_open, setSheetOpen] = useState(false);
  const [pick_code, setPickCode] = useState("narra");
  /** Where the log is happening — the biome name when opened from a biome card. */
  const [camera_where, setCameraWhere] = useState<string | null>(null);
  /** The rarity of the world-find that opened the camera. Null for any other
   *  route into it — we only claim a rarity for a find we placed. */
  const [camera_rarity, setCameraRarity] = useState<Rarity | null>(null);
  const [sighting, setSighting] = useState<Sighting[]>(() => readSighting());
  const [point_events, setPointEvents] = useState<PointEvent[]>(() => readPointEvents());
  useAccountSync(sighting.length, point_events.length, setSighting, setPointEvents);
  const [geo_mode, setGeoMode] = useState<GeoMode>("gps");
  const [toast, setToast] = useState<string | null>(null);
  const [inat, setInat] = useState<InatNearbyState>({ status: "idle" });
  const [walk, setWalk] = useState<Walk | null>(() => readWalk());
  const [receipt, setReceipt] = useState<WalkReceipt | null>(null);
  /** The stage reached on this save, when that save advanced the stage. The
   *  blind-box reveal (T4.5) shows for this; null when there is no reveal. */
  const [reveal, setReveal] = useState<Stage | null>(null);
  /* The trainer level just reached, shown once as a card. */
  const [level_up, setLevelUp] = useState<number | null>(null);
  /**
   * Which finds to draw. Empty means all of them — an explicit "off" state, so
   * a student who taps every chip off sees the whole map back rather than an
   * empty one. The restricted hatch is deliberately NOT in here: it is a place
   * you may not walk, not a preference, and filtering it away would hide the
   * one thing on the map that is a rule.
   */
  const [pin_filter, setPinFilter] = useState<Set<PinKind>>(() => new Set());
  const [is_trainer_open, setTrainerOpen] = useState(false);
  const [is_nearby_open, setNearbyOpen] = useState(false);
  /* The open 3D species card, and the one action it offers (Nearby's walk). */
  const [card, setCard] = useState<{ species_code: string; action: { label: string; onClick: () => void } | null } | null>(null);
  const { is_desktop } = useDesktop();
  /* How much ground is on screen, so the stick's pace tracks the camera rather
     than crawling at the wide end and racing at the close one. A nominal 800 px
     of viewport height — the exact figure only has to be the right order, and
     plumbing the real container size up here to get it would be a lot of wiring
     for a pace. */
  const view_span_m = meterPerPixel(view.lat, Math.round(view.zoom)) * 800;
  /* A walk-to that gets stuck part-way says so (showToast is declared below;
     this only runs on a later tick). */
  const geo = useGeo(geo_mode, bearing, view_span_m, (line) => showToast(line));
  /* Boot, alerts and weather. The boot overlay sits over everything until the
     safety card is dismissed; alerts raised meanwhile queue behind it. */
  const [is_booted, setBooted] = useState(() => isBootSkipped());
  const [alert_queue, setAlertQueue] = useState<AlertSpec[]>([]);
  const pushAlert = (spec: AlertSpec, is_forced = false) => {
    if (!is_forced && alertSeen().has(spec.alert_id)) return;
    setAlertQueue((q) => (q.some((a) => a.alert_id === spec.alert_id) ? q : [...q, spec]));
  };
  const [weather, setWeather] = useState<Weather | null>(() => pinnedWeather(window.location.search));
  useEffect(() => {
    if (weather?.is_pinned) return;
    const ctrl = new AbortController();
    const pull = () => fetchWeather(ctrl.signal).then((w) => w && setWeather(w));
    pull();
    const id = window.setInterval(pull, 15 * 60 * 1000);
    return () => {
      ctrl.abort();
      window.clearInterval(id);
    };
  }, []);
  useEffect(() => {
    if (weather?.warn) pushAlert(weatherAlert(weather));
  }, [weather?.warn]);
  /* Night: `?time=` for a projector, else the weather reading, else the clock
     (Manila sunset is 5:45–6:30 PM all year, so 6 PM–6 AM is close enough). */
  const [clock_hour, setClockHour] = useState(() => new Date().getHours());
  useEffect(() => {
    const id = window.setInterval(() => setClockHour(new Date().getHours()), 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, []);
  const time_pin = new URLSearchParams(window.location.search).get("time");
  const is_night =
    time_pin === "night" ? true : time_pin === "day" ? false : weather ? !weather.is_day : clock_hour >= 18 || clock_hour < 6;
  /* Speed: only a real GPS track can be driving. A stick walk is paced by
     the app, and the demo loop by a script. */
  const speed_last = useRef<{ lat: number; lon: number; at: number } | null>(null);
  useEffect(() => {
    const fix = geo.fix;
    if (!fix || fix.source !== "gps" || fix.accuracy_m > 40) return;
    const prev = speed_last.current;
    const now = fix.at ?? Date.now();
    if (!prev) {
      speed_last.current = { lat: fix.lat, lon: fix.lon, at: now };
      return;
    }
    const dt = (now - prev.at) / 1000;
    if (dt < 3) return;
    const ms = distanceMeter(prev, fix) / dt;
    speed_last.current = { lat: fix.lat, lon: fix.lon, at: now };
    if (ms > SPEED_WARN_MS) pushAlert(SPEED_ALERT);
  }, [geo.fix?.lat, geo.fix?.lon]);
  const seen_sector = useMemo(() => seenSector(sighting), [sighting]);
  /* The rotating world. One fetch of the real sweep, recomputed when the
     30-minute window rolls — see `live.tsx`. Quiet sectors get more finds, and
     the ground the walker is actually standing on gets the dense near field,
     because a locked camera can only show what is within about a sector. */
  const spawn_world = useSpawnWorld(seen_sector, geo.fix);

  /**
   * `?seed=demo` fills the journal so the badge shelf and the collection are
   * not empty on a stage. It waits for the pool, because the seed picks
   * species by real rarity band rather than by a hard-coded list.
   *
   * It only ever writes over an EMPTY journal. Someone opening the demo link
   * on a phone that has real walks on it must not lose them.
   */
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("seed") !== "demo") return;
    if (spawn_world.pool.length === 0) return;
    if (readSighting().length > 0) return;
    const seeded = demoJournal(spawn_world.pool, picker_order);
    writeSighting(seeded);
    setSighting(readSighting());
  }, [spawn_world.pool]);

  /* Drives the banner. Keyed off the rows themselves, so it cannot be left on
     by a stale flag or forgotten after a real find is added. */
  const is_seeded = useMemo(() => isSeededJournal(sighting), [sighting]);
  const seen = seenCode(sighting);
  const gamify = useMemo(() => gamifySnapshot(point_events), [point_events]);
  const daily = useMemo(
    () => dailyTaskFor(spawn_world.pool, biome_sector, new Date(), readPlayer().player_id, point_events),
    [spawn_world.pool, point_events],
  );
  const goDaily = () => {
    if (!daily) return;
    const place = sectorByCode(daily.sector_code);
    if (!place) return;
    if (geo_mode === "play") {
      if (geo.walkTo(walkPoint(place), 0, place.name)) setFollowing(true);
      else showToast(noRouteLine(place.name));
      return;
    }
    setFollowing(false);
    /* Fly to the hunt's finds, not the sector's label. The label is the
       middle of the area, and the playtest found the pins you were sent to
       left at the screen's edge (x ≈ 12 on a 375 px phone). The hunt species
       itself when this window has spawned it; otherwise the middle of the
       finds standing in the hunt's sector; the label only when it has none. */
    const same = spawn_world.spawn.find((s) => s.species_code === daily.species_code && s.sector_code === daily.sector_code);
    const in_sector = spawn_world.spawn.filter((s) => s.sector_code === daily.sector_code);
    const focus = same
      ? [same]
      : in_sector.length > 0
        ? in_sector
        : [{ lat: place.label_point[0], lon: place.label_point[1] }];
    const lat = focus.reduce((sum, f) => sum + f.lat, 0) / focus.length;
    const lon = focus.reduce((sum, f) => sum + f.lon, 0) / focus.length;
    setView((prev) => ({ ...prev, lat, lon, zoom: Math.max(prev.zoom, 17) }));
  };
  /* The day's first open shows today's hunt once, big, after boot and after
     any safety card. Keyed by the hunt's own day. */
  const [today_seen, setTodaySeen] = useState(() => {
    try {
      return localStorage.getItem("magisphere.today-seen") ?? "";
    } catch {
      return "";
    }
  });
  const dismissToday = () => {
    if (!daily) return;
    setTodaySeen(daily.day_key);
    try {
      localStorage.setItem("magisphere.today-seen", daily.day_key);
    } catch {
      /* private mode: it may show again today, which is harmless */
    }
  };
  const stage = stageFor(seen_sector.size);
  const vigor = useMemo(() => vigorOf(sighting), [sighting]);
  /* One level everywhere: the HUD's, off the same points. It used to be
     `seen_sector.size + 1` for the server and the hall, so the room saw Lv 2
     while the HUD said 1. */
  const level = levelOf(gamify.total_points).level;
  const me = readPlayer();
  /* Device preferences. `setHapticEnabled` mirrors the flag into a module
     cache because the haptic path runs inside pointer handlers and must not
     touch localStorage on every tap. */
  const [preference, setPreference] = useState<Preference>(() => {
    const row = readPreference();
    setHapticEnabled(row.is_haptic);
    return row;
  });
  /* The name the campus sees: the account's when signed in. */
  const account = useAccount();
  const live_name = liveNameOf({
    account_name: account.status === "signed_in" ? account.account?.display_name : null,
    preference_name: preference.walker_name,
    player_name: me.name,
  });
  const live = useLiveWorld({
    sighting,
    summary: {
      stage,
      level,
      total_points: gamify.total_points,
      streak_weeks: gamify.streak_weeks,
      is_hidden: preference.is_hidden_from_hall,
    },
    name: live_name,
  });
  /* The hall, opened once for the whole app: the map pill, the trainer sheet
     and the Dex strip all count off this one roster (`hallLabelOf`). */
  const hall = useHall({ fix: geo.fix, stage, level, name: live_name, is_hidden: preference.is_hidden_from_hall });
  const hall_label = hallLabelOf(hall);
  /* Section art. Filled from `asset/kit.ts` once the generated set is keyed and
     committed; every section renders headed-but-unillustrated until then, which
     is why `SettingsIcon` is all-optional. */
  const settings_icon: SettingsIcon = kit_settings_icon;

  const savePreference = (next: Preference) => {
    setPreference(next);
    writePreference(next);
    setHapticEnabled(next.is_haptic);
  };

  /* Walking partners. Local roster; the streak is computed over the synced
     world, because only the world knows what somebody else walked. */
  const [friend, setFriend] = useState<Friend[]>(() => readFriend());
  /* The world speaks `walker_id` only (see `campus-world.ts`), so this phone
     compares itself by its own hash, never by the player_id it keeps secret. */
  const me_walker_id = useMemo(() => walkerIdOf(me.player_id), [me.player_id]);
  const group_streak = useMemo(
    () => groupStreak(live.world?.find ?? [], groupMember(friend, me_walker_id)),
    [live.world?.find, friend, me_walker_id],
  );
  const addPartner = async (code: string) => {
    if (normalizeJoinCode(code) === normalizeJoinCode(me.join_code)) {
      showToast("That is your own code.");
      return;
    }
    const hit = await fetchPartner(code);
    if (hit === "unknown") {
      showToast("No walker on this campus holds that code.");
      return;
    }
    if (hit === "slow_down") {
      showToast("Too many wrong codes. Wait a few minutes, then try again.");
      return;
    }
    if (hit === "offline") {
      showToast("Turn the live campus on to add a partner.");
      return;
    }
    const next = addFriend(friend, { walker_id: hit.walker_id, name: hit.name, join_code: code }, me_walker_id);
    if (next === friend) {
      showToast(hit.walker_id === me_walker_id ? "That is your own code." : `${hit.name} is already a partner.`);
      return;
    }
    setFriend(next);
    writeFriend(next);
    showToast(`${hit.name} is walking with you.`);
  };
  const dropPartner = (walker_id: string) => {
    const next = removeFriend(friend, walker_id);
    setFriend(next);
    writeFriend(next);
  };

  const live_snap = useMemo(
    () => ({
      ...gamify,
      leaderboard: withLiveWalker(gamify.leaderboard, live.world?.walker ?? [], me_walker_id),
    }),
    [gamify, live.world, me_walker_id],
  );
  const here_sector = useMemo(() => (geo.fix ? sectorAt(geo.fix) : null), [geo.fix]);

  const ranked = useMemo(() => (geo.fix ? rankEncounter(geo.fix) : []), [geo.fix]);
  const nearest = ranked[0] ?? null;
  const distance_of = (encounter_id: string) =>
    ranked.find((r) => r.row.encounter_id === encounter_id) ?? null;

  /* The pivot's card rule: inside a biome → its card, unless the walker pinned
     a tree (explicit intent wins, including the auto-pin inside 25 m). */
  const presence = useMemo(() => (geo.fix ? biomePresenceAt(geo.fix) : null), [geo.fix]);
  const showing_biome = presence !== null && pinned_id === null;

  /* Follow the walker until a gesture says otherwise.

     DERIVED, not copied. This used to be an effect that called `setView` on
     every fix — so every 50 ms stick tick rendered the app twice, and because
     each of those renders ran effects that set state again, React's dev build
     counted a long walk-to as a runaway update loop ("Maximum update depth
     exceeded"). The camera's target is simply the fix while following; the
     easing is the map's own frame loop (`glideStep` in `tile-map.tsx`), which
     chases this target through a ref and never touches React state per frame
     of the walk. `view` itself now changes only on discrete events: a zoom, a
     gesture, a recentre, a jump somewhere. */
  const camera_view = useMemo<View>(
    () => (is_following && geo.fix ? { ...view, lat: geo.fix.lat, lon: geo.fix.lon } : view),
    [view, is_following, geo.fix],
  );
  /* A gesture ends following: the camera stays where the walker was rather
     than snapping back to wherever `view` was last written. */
  const stopFollowing = () => {
    if (is_following && geo.fix) {
      const here = geo.fix;
      setView((prev) => ({ ...prev, lat: here.lat, lon: here.lon }));
    }
    setFollowing(false);
  };

  /* GPS is the default. If this device will not give a fix, Play walk still
     puts you on campus at street zoom rather than leaving the map empty. */
  useEffect(() => {
    if (geo_mode !== "gps") return;
    /* Two ways a device cannot walk this campus, and until a playtest at the
       venue only the first was handled.

       1. No fix at all — permission denied, or no hardware answer.
       2. A PERFECT fix, somewhere that is not Loyola Heights. This is the
          showcase. A judge standing in the hall on 26 September gets a clean
          position a few kilometres away, so the app stayed in GPS mode,
          correctly refused to spawn anything, hid the thumbstick — which only
          shows in play mode — and presented an empty green screen with no
          explanation and nothing to press. The one venue the feature was built
          for was the one case that fell through.

       Either way the answer is the stick, and the switch says so out loud
       rather than silently changing what the position means. */
    if (!geo.fix) {
      if (geo.status !== "denied" && geo.status !== "unavailable") return;
      setGeoMode("play");
      pushAlert(NO_FIX_ALERT);
      return;
    }
    if (geo.is_off_campus) {
      setGeoMode("play");
      setFollowing(true);
      pushAlert(OFF_CAMPUS_ALERT);
    }
  }, [geo_mode, geo.status, geo.fix, geo.is_off_campus]);

  /* One tap before the demo, so offline covers the campus and not just wherever
     the map happened to be panned. Production only — a dev build has no worker
     to store them in. */
  const [warm, setWarm] = useState<{ done: number; total: number } | null>(null);

  /**
   * Warm the layer you are on, plus Satellite.
   *
   * Warming only the active layer meant tapping "Save offline" on Guide and
   * then finding a blank map the moment you switched to Satellite on stage —
   * which is the switch the canopy line on `/map` invites you to make.
   *
   * Not all four, deliberately. Trail is CyclOSM, a volunteer-run server whose
   * usage policy asks people not to bulk-download, and it already answers a
   * share of requests with 502 under load. Pulling ~220 tiles off it to make a
   * demo smoother is not a cost worth passing to them.
   */
  const warmCampus = () => {
    if (warm && warm.done < warm.total) return;
    const target: Layer[] = layer === "satellite" ? ["satellite"] : [layer, "satellite"];
    setWarm({ done: 0, total: 1 });
    void (async () => {
      let done = 0;
      let total = 0;
      const tally: { done: number; total: number }[] = target.map(() => ({ done: 0, total: 0 }));
      const sum = () => {
        done = tally.reduce((n, t) => n + t.done, 0);
        total = tally.reduce((n, t) => n + t.total, 0);
        setWarm({ done, total: Math.max(total, 1) });
      };
      for (const [i, one] of target.entries()) {
        await prefetchCampus(one, [17, 18, 19], (d, t) => {
          tally[i] = { done: d, total: t };
          sum();
        });
      }
      sum();
      showToast(`${done} tiles ready offline · ${target.map((t) => SOURCE[t].label).join(" + ")}`);
    })();
  };

  const recentre = () => {
    setFollowing(true);
    setView((prev) => ({ ...prev, ...(geo.fix ?? CAMPUS_CENTER) }));
  };

  /** Compass: my location, play camera, street/path zoom, facing north. */
  const returnToStreet = () => {
    setMapMode("play");
    setBearing(0);
    setFollowing(true);
    if (route !== "/" && route !== "/map") {
      navigateTo("/");
      setRoute("/");
    }
    const here = geo.fix ?? CAMPUS_CENTER;
    setView({ lat: here.lat, lon: here.lon, zoom: PLAY_ZOOM });
    if (geo_mode !== "gps") setGeoMode("gps");
  };

  const go = (next: Route) => {
    if (window.location.pathname !== next) navigateTo(next);
    setRoute(next);
    setTrainerOpen(false);
    setNearbyOpen(false);
    setCameraOpen(false);
    setCameraWhere(null);
    setCameraRarity(null);
    if (next !== "/map") setRestricted(true);
  };

  useEffect(() => {
    const onPop = () => setRoute(pathToRoute(window.location.pathname));
    window.addEventListener("popstate", onPop);
    if (window.location.pathname !== route) navigateTo(route, "replace");
    /* Production only. Under `vite dev` every module is an unhashed same-origin
       GET, so a caching worker pins the app to a stale revision — that produced
       a white screen and a bogus "does not provide an export named" once. */
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    } else if (!import.meta.env.PROD && "serviceWorker" in navigator) {
      /* Clean up after any worker a previous dev session left registered.
         Drop the caches only once every worker is gone, or a still-controlling
         worker can re-populate one behind the delete. */
      void navigator.serviceWorker
        .getRegistrations()
        .then((row) => Promise.all(row.map((r) => r.unregister())))
        .then(() => ("caches" in window ? caches.keys() : Promise.resolve([])))
        .then((name) => Promise.all(name.map((n) => caches.delete(n))));
    }
    return () => window.removeEventListener("popstate", onPop);
  }, [route]);

  useEffect(() => {
    if (route !== "/map") return;
    let is_alive = true;
    setInat((prev) => (prev.status === "ready" ? prev : { status: "loading" }));
    loadInatNearby().then((next) => {
      if (is_alive) setInat(next);
    });
    return () => {
      is_alive = false;
    };
  }, [route]);

  /* One timer at a time: an older toast's timer used to clear a newer toast
     early, so a line that landed right after another flashed and vanished. */
  const toast_timer = useRef<number | null>(null);
  const showToast = (m: string) => {
    setToast(m);
    if (toast_timer.current !== null) window.clearTimeout(toast_timer.current);
    toast_timer.current = window.setTimeout(() => setToast(null), 2600);
  };

  const joinWalker = async (code: string) => {
    const found = await fetchJoin(code);
    if (!found) {
      showToast("No walker with that code yet");
      return;
    }
    writePlayer(found);
    const mine = await fetchMine(found.player_id);
    if (mine) {
      for (const row of mine) mergeRemoteSighting(row);
      setSighting(readSighting());
    }
    showToast(`Joined ${found.name}`);
  };

  const noteAward = (
    kind: Parameters<typeof persistAward>[0],
    subject_key: string,
    toast_line?: string,
  ) => {
    const result = persistAward(kind, subject_key);
    if (result.awarded && result.event) {
      setPointEvents(result.events);
      /* Points are the one event worth feeling. It rides alongside the toast,
         never instead of it — half the phones at the showcase are iPhones and
         will feel nothing at all (see `haptic.ts`). */
      haptic("success");
      showToast(toast_line ?? `+${result.event.points} ${POINT_LABEL[kind]}`);
      /* Only a local award can level you up on screen — a sync that pulls in
         old points does not throw a party for them. */
      const after = levelOf(result.total_points).level;
      if (after > levelOf(result.total_points - result.event.points).level) setLevelUp(after);
    }
    return result;
  };

  const selected_id = pinned_id ?? nearest?.row.encounter_id ?? encounter[0].encounter_id;
  const sel = encounter.find((e) => e.encounter_id === selected_id) ?? encounter[0];
  const sel_sp = species[sel.species_code];

  /* Walking into an encounter's radius pins it, so the card holds still while
     the walker photographs the tree instead of flicking to whatever is nearer. */
  const at_id = nearest?.is_at ? nearest.row.encounter_id : null;
  useEffect(() => {
    if (at_id) setPinnedId(at_id);
  }, [at_id]);

  const openLearnSheet = (species_code?: string) => {
    setSheetOpen(true);
    if (species_code) {
      noteAward("learn", `species:${species_code}`);
    }
  };

  /* Opening a card is a Learn, paid through the same path and subject as the
     Learn sheet — so the pair of them pays +10 once per species, not twice. */
  const openSpeciesCard = (species_code: string, action: { label: string; onClick: () => void } | null = null) => {
    setCard({ species_code, action });
    noteAward("learn", learnSubject(species_code));
  };

  const openCamera = (species_code: string, where?: string, rarity: Rarity | null = null) => {
    setPickCode(species_code);
    setCameraWhere(where ?? null);
    setCameraRarity(rarity);
    setCameraOpen(true);
  };

  /**
   * Tapping a find in the world.
   *
   * Close enough to photograph → the camera opens on that species, which is the
   * whole loop. Too far → the map goes there and stops following, so the find
   * stays on screen while you walk to it. It deliberately does NOT open the
   * camera from across campus: a find you log without standing at it is a
   * record of nothing, and this app's one useful output is the location.
   */
  const walkToSpawn = (row: Spawn) => {
    const is_reach = reachableSpawn(spawn_world.spawn, geo.fix).some((r) => r.spawn_id === row.spawn_id);
    const reply = pinReply({
      target: row,
      common_name: row.common_name,
      sector_name: sectorByCode(row.sector_code)?.name ?? null,
      fix: geo.fix,
      is_reach,
      is_walk_mode: geo_mode === "play",
    });
    if (reply.kind === "log") {
      /* You are close enough and the camera is opening — the moment the whole
         walk is for. */
      haptic("bump");
      openCamera(row.species_code, sectorByCode(row.sector_code)?.name, row.rarity);
      return;
    }
    haptic("tap");
    setPickedSector(null);
    setPinnedId(null);
    if (reply.kind === "walk") {
      /* Routed round the buildings (route.ts), stopping a few metres short
         on walkable ground. No route from here → say so; never a toast that
         promises a walk and then stands still. */
      if (!geo.walkTo(row, WALK_TO_SHORT_M, row.common_name)) {
        showToast(noRouteLine(row.common_name));
        return;
      }
      setFollowing(true);
      showToast(reply.line);
      return;
    }
    /* GPS: the find is already on screen — that is how it was tapped — so the
       camera stays on the walker and the answer is how far, and which way. */
    showToast(reply.line);
  };

  const saveSighting = ({ photo_data, inat: id, note, entry_kind, reported_name, is_demo_id }: SaveInput) => {
    const is_report = entry_kind === "contribution";
    /* Stage before save — compared after to detect an advance (T4.5 trigger). */
    const prev_stage = stageFor(seenSector(sighting).size);
    addSighting({
      species_code: pick_code,
      photo_data,
      inat_scientific_name: id.scientific_name,
      inat_common_name: id.common_name,
      point: geo.fix
        ? { lat: geo.fix.lat, lon: geo.fix.lon, accuracy_m: geo.fix.accuracy_m, source: geo.fix.source }
        : null,
      note,
      walk_id: walk?.walk_id ?? null,
      entry_kind,
      reported_name,
      is_demo_id,
    });
    const next_sighting = readSighting();
    setSighting(next_sighting);
    const award_kind = observeAwardKind({ photo_data, species_code: pick_code, is_demo_id });
    const here = geo.fix ? sectorAt(geo.fix) : null;
    noteAward(
      award_kind,
      observeSubject(pick_code, here?.sector_code),
      award_kind === "verified_discovery"
        ? `+${POINT_VALUE.verified_discovery} Local verified`
        : `+${POINT_VALUE.observe} Observe`,
    );
    if (daily && !daily.is_done && daily.species_code === pick_code) {
      noteAward("challenge", dailySubject(daily.day_key), `+${POINT_VALUE.challenge} Hunt`);
    }
    setCameraOpen(false);
    setCameraRarity(null);
    /* The blind-box reveal fires when a located badge in a new sector advances
       the stage. Deterministic: same journal state → same stage → same cosmetic. */
    const next_stage = stageFor(seenSector(next_sighting).size);
    if (next_stage !== prev_stage && next_stage !== "egg") {
      setReveal(next_stage);
    }
    go("/journal");
    showToast(
      is_report
        ? "Report saved. It leaves in the export as a report, not as a species."
        : `${species[pick_code].common_name} added to your journal.`,
    );
  };

  const toggleWalk = () => {
    if (walk) {
      /* Ending a walk hands back what it amounted to. A walk that closes with
         nothing on screen is a stop, not a walk. */
      setReceipt(endWalk(sighting));
      setWalk(null);
      return;
    }
    setWalk(startWalk());
    showToast("Walk started. Log what you pass.");
  };

  /* Record the trail while a walk is open. trackWalk applies its own 6 m floor,
     so standing still adds nothing and the receipt's distance stays honest. */
  useEffect(() => {
    if (!walk || !geo.fix) return;
    const moved = trackWalk(geo.fix, walk);
    if (moved) {
      setWalk(moved);
      const sector = sectorAt(geo.fix);
      if (sector) noteAward("explore", `sector:${sector.sector_code}`);
    }
  }, [walk?.walk_id, geo.fix?.lat, geo.fix?.lon]);

  /* Explore points also fire when the walker enters a new sector on the map,
     even before Start Walk — area arrival is the Working Doc explore action. */
  useEffect(() => {
    if (route !== "/map" || !here_sector) return;
    noteAward("explore", `sector:${here_sector.sector_code}`);
  }, [route, here_sector?.sector_code]);

  const walk_count = walk ? sighting.filter((row) => row.walk_id === walk.walk_id).length : 0;

  const fix_line = geo.fix
    ? `${formatLatLon(geo.fix)} · ±${Math.round(geo.fix.accuracy_m)} m · ${geo.fix.source === "demo" ? "demo walk" : geo.fix.source === "play" ? "play walk" : "this device"}`
    : "No position — this sighting will be saved without one.";

  /* The same filter the play view applies, so the two surfaces agree about
     what is on the map. The selected encounter is never filtered out from
     under the card that is describing it. */
  const shown_encounter = useMemo(
    () =>
      pin_filter.size === 0
        ? encounter
        : encounter.filter(
            (e) => pin_filter.has(pinKindOf(species[e.species_code])) || e.encounter_id === sel.encounter_id,
          ),
    [pin_filter, sel.encounter_id],
  );

  const selected_near = distance_of(sel.encounter_id);
  const selected_distance = selected_near
    ? selected_near.distance_m <= AT_TREE_RADIUS_M
      ? "You are at this tree"
      : selected_near.is_at
        ? `In range · ${formatMeter(selected_near.distance_m)} away`
        : `${formatMeter(selected_near.distance_m)} ${selected_near.compass} of you · ${formatWalkMinute(selected_near.distance_m)}`
    : null;

  /* The desktop kiosk header already owns the Demo toggle — don't print two. */
  /**
   * The field controls, as ONE list.
   *
   * These used to be half here and half in the map body, split by
   * `display: none` per breakpoint — which is how "Following" and "Save
   * offline" ended up rendered twice side by side on desktop. One list, wrapped
   * by the layout, shown at every size.
   */
  const geo_chip = (
    <div className="flex flex-wrap items-center gap-2">
      {/* The one genuine breakpoint difference in here: on desktop the app's
          own top bar already owns the demo toggle, so repeating it on the map
          is two controls for one state. Mobile has no top bar, so it lives
          here. This is NOT the display:none splitting that caused the
          duplicates above — the chip exists in exactly one place per size. */}
      {!is_desktop && (
        <Chip is_on={geo_mode === "gps"} onClick={() => setGeoMode((m) => nextGeoMode(m))}>
          <LocateIcon size={15} />
          {geoModeLabel(geo_mode, geo.status)}
        </Chip>
      )}
      <Chip is_on={Boolean(walk)} tone="var(--mg-blue)" onClick={toggleWalk}>
        <WalkIcon size={15} />
        {walk ? `End walk · ${walk_count}` : "Start a walk"}
      </Chip>
      {/* Filter what you are looking for. State rides in the border and the
          label, per the kit rule — never in fill alone. */}
      {PIN_FILTER.map((row) => (
        <Chip
          key={row.kind}
          is_on={pin_filter.has(row.kind)}
          tone={row.tone}
          onClick={() =>
            setPinFilter((prev) => {
              const next = new Set(prev);
              if (next.has(row.kind)) next.delete(row.kind);
              else next.add(row.kind);
              return next;
            })
          }
        >
          {row.label}
        </Chip>
      ))}
      {pin_filter.size > 0 && (
        <Chip tone="rgb(var(--mg-ink-rgb) / 0.78)" onClick={() => setPinFilter(new Set())}>
          Show all
        </Chip>
      )}
      <Chip is_on={is_following} onClick={recentre}>
        <LocateIcon size={15} />
        {is_following ? "Following" : "Recentre"}
      </Chip>
      <Chip is_on={Boolean(warm && warm.done >= warm.total)} onClick={warmCampus}>
        <ExportIcon size={15} />
        {warm ? (warm.done >= warm.total ? "Offline ready" : `${warm.done}/${warm.total}`) : "Save offline"}
      </Chip>
    </div>
  );

  const geo_line =
    geo.message ??
    (geo.is_off_campus
      ? "You are outside the Loyola Heights frame — switch to Play walk to stay on campus."
      : geo.status === "play"
        ? "Play walk · WASD or tap the ground"
        : geo.status === "prompting"
          ? "Finding your location…"
          : geo.fix
          ? `${formatLatLon(geo.fix)} · ±${Math.round(geo.fix.accuracy_m)} m`
          : "Waiting for a position…");


  /* The graphics tier (`quality.ts`). Measured only while the play view is
     actually on screen and uncovered, and a measured drop to lite says so in a
     toast — the badge on the map carries it from then on. */
  /* The badge opens Settings on the panel where the tier is changed; any
     other way in opens it where it always did. */
  const [is_settings_setup_first, setSettingsSetupFirst] = useState(false);
  useEffect(() => {
    if (route !== "/settings") setSettingsSetupFirst(false);
  }, [route]);
  const quality = useQuality({
    choice: preference.quality,
    is_active: (route === "/" || route === "/map") && map_mode === "play" && is_booted && !alert_queue[0],
    motion_key: `${geo.fix?.lat ?? ""},${geo.fix?.lon ?? ""},${bearing}`,
    onDrop: ({ fps_p50 }) =>
      showToast(`Lite graphics on — this device drew ${fps_p50} fps while walking. Settings can change it.`),
  });

  /* ── the play view ────────────────────────────────────────────────────────
   *
   * Deliberately thin. Everything the field view carries — four basemap
   * presets, the path network, the canopy caption, every citation — is one tap
   * away and unchanged; what is gone from THIS screen is the four-chip row, the
   * coordinate pill and the layer counter, which is what "less cluttered ui"
   * asked for on 09-03.
   */
  const play_sheet_sp = species[pick_code] ?? sel_sp;
  const play_sheet_where = camera_where ?? (here_sector?.name ?? "Campus");
  const play_sheet_distance = (() => {
    if (!geo.fix) return null;
    const hit = ranked.find((n) => n.row.species_code === play_sheet_sp.species_code);
    if (!hit) return null;
    return hit.distance_m <= AT_TREE_RADIUS_M
      ? `In range · ${formatMeter(hit.distance_m)} away`
      : `${formatMeter(hit.distance_m)} ${hit.compass} of you · ${formatWalkMinute(hit.distance_m)}`;
  })();
  const playBody = (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <PlayMap
        view={camera_view}
        onView={setView}
        onGesture={stopFollowing}
        fix={geo.fix}
        seen_sector={seen_sector}
        stage={stage}
        vigor={vigor}
        hall={hall}
        is_desktop={is_desktop}
        /* Both the map's own toggle and the device preference have to agree
           before the hatch is drawn. Neither of them makes the ground
           walkable — `play-walk.ts` and `spawn.ts` read the polygon, not this. */
        is_restricted_on={is_restricted && preference.is_restricted_shown}
        onSelectSector={(row) => {
          setSheetOpen(false);
          setPickedSector(row);
        }}
        seen_species={seen}
        pin_filter={pin_filter}
        onSelectEncounter={(e) => {
          /* Open the tall species sheet first — Log is the one primary CTA. */
          setPickedSector(null);
          setPickCode(e.species_code);
          setCameraWhere(e.where);
          setSheetOpen(true);
          noteAward("learn", `species:${e.species_code}`);
        }}
        bearing_degree={bearing}
        onBearing={setBearing}
        spawn={spawn_world.spawn}
        onSelectSpawn={walkToSpawn}
        onWalkTo={
          geo_mode === "play"
            ? (point) => {
                if (geo.walkTo(point, 0, "that spot")) setFollowing(true);
                else showToast(noRouteLine("that spot"));
              }
            : undefined
        }
        /* The GO camera: welded to the walker whenever there is a walker to
           weld it to. Without a fix there is nothing to be stuck to, so the
           map stays draggable rather than freezing on the campus centre. */
        is_camera_locked={Boolean(geo.fix)}
        /* `?skyline=` still wins, so a projector can be set to a known style
           without touching the device's saved preference. */
        skyline_style={skyline_url_style ?? preference.skyline_style}
        is_night={is_night}
        quality={quality}
        onQuality={() => {
          setSettingsSetupFirst(true);
          go("/settings");
        }}
      />

      {/* The stick. Only in play mode, because in the other two the position
          comes from somewhere that is not a thumb. */}
      <Joystick is_on={geo_mode === "play"} onSteer={geo.steer} />

      {/* Quiet HUD: corners only. No dense dashboard while walking. */}
      <MapChrome
        is_desktop={is_desktop}
        context={
          <PlayerHud
            points={live_snap.total_points}
            streak_weeks={live_snap.streak_weeks}
            is_week_active={live_snap.participated_this_week}
            place={here_sector ? here_sector.name : "Between sectors"}
            stage={stage}
            vigor={vigor}
            onOpen={() => {
              setNearbyOpen(false);
              setTrainerOpen((v) => !v);
            }}
          />
        }
        control={
          <>
            {weather && <WeatherChip weather={weather} onOpen={() => pushAlert(weatherAlert(weather), true)} />}
            <ModeSwitch mode={map_mode} onMode={setMode} />
            <GeoModeSwitch
              mode={geo_mode}
              label={geoModeLabel(geo_mode, geo.status)}
              onCycle={() => {
                setGeoMode((m) => nextGeoMode(m));
                setFollowing(true);
              }}
            />
            <Compass bearing={bearing} onReset={returnToStreet} />
          </>
        }
        below={
          daily ? (
            <QuestBanner daily={daily} reward={POINT_VALUE.challenge} onGo={goDaily} />
          ) : null
        }
      />

      {is_sheet_open && !picked_sector && (
        is_desktop ? (
          /* A fixed box, not a max-height: the sheet is a column whose Log button
             is pinned to its foot, and that only holds when the host has a real
             height. It starts under the HUD and the daily-hunt chip (top 156)
             instead of over them, and ends above the dock. */
          <div style={{ position: "absolute", left: 18, top: 156, bottom: 88, width: 380, zIndex: 48, overflow: "hidden", borderRadius: 16, boxShadow: "var(--mg-shadow-up)" }}>
            <NearbySheet
              sp={play_sheet_sp}
              pool={spawn_world.pool}
              onOpenCard={() => openSpeciesCard(play_sheet_sp.species_code)}
              where={play_sheet_where}
              distance_line={play_sheet_distance}
              is_panel
              onLog={() => {
                setSheetOpen(false);
                openCamera(play_sheet_sp.species_code, play_sheet_where);
              }}
              onDismiss={() => setSheetOpen(false)}
            />
          </div>
        ) : (
          <NearbySheet
            sp={play_sheet_sp}
            pool={spawn_world.pool}
            onOpenCard={() => openSpeciesCard(play_sheet_sp.species_code)}
            where={play_sheet_where}
            distance_line={play_sheet_distance}
            onLog={() => {
              setSheetOpen(false);
              openCamera(play_sheet_sp.species_code, play_sheet_where);
            }}
            onDismiss={() => setSheetOpen(false)}
          />
        )
      )}

      {picked_sector && (
        <SectorCard
          row={picked_sector}
          resident={sectorResident(picked_sector)}
          progress={sectorProgress(sighting, picked_sector)}
          is_desktop={is_desktop}
          onLog={(code) => openCamera(code, picked_sector.name)}
          onDismiss={() => setPickedSector(null)}
        />
      )}
    </div>
  );

  const mapBody = (
    <div style={{ position: "absolute", inset: 0 }}>
      <CampusMap
        encounter={shown_encounter}
        selected_id={selected_id}
        onSelect={(encounter_id) => {
          setPinnedId(encounter_id);
          const row = encounter.find((e) => e.encounter_id === encounter_id);
          openLearnSheet(row?.species_code);
          setRestricted(true);
        }}
        view={camera_view}
        onView={setView}
        onGesture={stopFollowing}
        layer={layer}
        fix={geo.fix}
        is_restricted_on={is_restricted}
        at_id={at_id}
        disc_size={is_desktop ? 38 : 32}
        extra={(projection) => <ModuleLayer state={module_state} projection={projection} from={geo.fix ?? CAMPUS_CENTER} />}
        extra_attribution={moduleAttribution(module_state)}
      />
      <MapChrome
        is_desktop={is_desktop}
        context={<ContextCard label="Loyola Heights" value={geo_line} />}
        below={geo_chip}
        control={
          <>
            <ModeSwitch mode={map_mode} onMode={setMode} />
            <Compass bearing={bearing} onReset={returnToStreet} />
            <ModuleButton state={module_state} />
            {/* The basemap cycler lives under the switch in the same column, so
                it can never sit on top of it the way it used to. */}
            <button
              onClick={() => setLayer(nextLayer)}
              className="flex items-center gap-1.5"
              style={{
                background: "var(--mg-surface-glass)",
                color: "rgb(var(--mg-ink-rgb) / 0.92)",
                backdropFilter: "blur(8px)",
                border: "1px solid rgb(var(--mg-ink-rgb) / 0.1)",
                borderRadius: 999,
                padding: "8px 13px",
                fontSize: 12,
                fontWeight: 700,
                boxShadow: "var(--mg-shadow-sm)",
                whiteSpace: "nowrap",
                cursor: "pointer",
              }}
            >
              <CanopyIcon size={17} />
              {SOURCE[layer].label}
              <span style={{ fontWeight: 400, opacity: 0.5 }}>
                {LAYER_ORDER.indexOf(layer) + 1}/{LAYER_ORDER.length}
              </span>
            </button>
          </>
        }
      />
      <MapNote is_desktop={is_desktop} layer={layer} />
      <ModuleDock
        state={module_state}
        from={geo.fix ?? CAMPUS_CENTER}
        from_label={fromLabel(geo.fix)}
        is_desktop={is_desktop}
        onFocus={(point) => {
          stopFollowing();
          setView((prev) => ({ lat: point.lat, lon: point.lon, zoom: Math.max(prev.zoom, 18) }));
        }}
      />
      {!is_desktop && !is_sheet_open && (
        <Fab
          label={`Log a ${sel_sp.common_name} sighting`}
          onClick={() => openCamera(sel.species_code)}
          size={64}
          style={{ position: "absolute", right: 16, bottom: 152, zIndex: 46 }}
        >
          <ShutterIcon size={44} />
        </Fab>
      )}
      {!is_desktop && !is_sheet_open && (
        showing_biome && presence ? (
          <BiomeBar presence={presence} onExpand={() => openLearnSheet(presence.resident[0]?.row.species_code)} />
        ) : (
          <NearbyBar
            sp={sel_sp}
            where={sel.where}
            distance_line={selected_distance}
            is_pinned={pinned_id !== null}
            onUnpin={() => setPinnedId(null)}
            onExpand={() => openLearnSheet(sel_sp.species_code)}
          />
        )
      )}
      {!is_desktop && is_sheet_open && (
        showing_biome && presence ? (
          <BiomeSheet
            presence={presence}
            onLog={(code) => openCamera(code, presence.row.name)}
            onDismiss={() => setSheetOpen(false)}
          />
        ) : (
          <NearbySheet
            sp={sel_sp}
            pool={spawn_world.pool}
            onOpenCard={() => openSpeciesCard(sel_sp.species_code)}
            where={sel.where}
            distance_line={selected_distance}
            onLog={() => openCamera(sel.species_code)}
            onDismiss={() => setSheetOpen(false)}
          />
        )
      )}
      {!is_desktop && is_sheet_open && (inat.status === "ready" || inat.status === "loading") && (
        <div
          className="absolute"
          style={{ left: 12, right: 12, bottom: 76, zIndex: 30, maxHeight: "34%", overflowY: "auto" }}
        >
          <InatStrip state={inat} density="compact" />
        </div>
      )}
    </div>
  );

  /* Escape closes the TOP open sheet — one per press, most recent layer
     first — so a keyboard (or a desktop at the showcase) always has a way out. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (level_up !== null) setLevelUp(null);
      else if (reveal) setReveal(null);
      else if (card) setCard(null);
      else if (is_camera_open) {
        setCameraOpen(false);
        setCameraRarity(null);
      } else if (receipt) setReceipt(null);
      else if (is_trainer_open) setTrainerOpen(false);
      else if (is_nearby_open) setNearbyOpen(false);
      else if (picked_sector) setPickedSector(null);
      else if (is_sheet_open) setSheetOpen(false);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [level_up, reveal, card, is_camera_open, receipt, is_trainer_open, is_nearby_open, picked_sector, is_sheet_open]);

  const is_on_map = route === "/" || route === "/map";
  const shown_alert = alert_queue.find((a) => is_on_map || !MAP_ONLY_ALERT.has(a.alert_id)) ?? null;
  const is_play = is_on_map && map_mode === "play";

  const pressGo = () => {
    setTrainerOpen(false);
    setNearbyOpen(false);
    if (!is_play) {
      /* One tap from the Dex or About opens the log, not just the map. `go`
         closes the camera, so the open below has to come after it — both
         land in the same render. Walking to a find is left for the map. */
      setMode("play");
      go("/");
      if (daily && !daily.is_done) openCamera(daily.species_code, daily.sector_name);
      else openCamera(here_sector?.species_code[0] ?? pick_code, here_sector?.name);
      return;
    }
    if (daily && !daily.is_done) {
      openCamera(daily.species_code, daily.sector_name);
      return;
    }
    const near = spawn_world.spawn[0];
    if (near) {
      walkToSpawn(near);
      return;
    }
    openCamera(here_sector?.species_code[0] ?? pick_code, here_sector?.name);
  };

  return (
    <div style={{ height: "100%", background: "var(--mg-bg)", color: "rgb(var(--mg-ink-rgb) / 0.92)", overflowX: "hidden" }}>
      <div style={{ position: "relative", height: "100%", overflowX: "hidden" }}>
        {is_play && playBody}
        {is_on_map && map_mode === "field" && mapBody}
        {route === "/journal" && (
          <JournalScreen
            sighting={sighting}
            seen={seen}
            is_desktop={is_desktop}
            pool_count={spawn_world.pool_count}
            pool={spawn_world.pool}
            is_seeded={is_seeded}
            gamify={live_snap}
            world={live.world}
            walker_label={hall_label}
            walker_name={live_name}
            onOpenSpecies={(code) => openSpeciesCard(code)}
          />
        )}
        {route === "/settings" && (
          <SettingsScreen
            is_desktop={is_desktop}
            preference={preference}
            onPreference={savePreference}
            walker_name={me.name}
            account_name={account.status === "signed_in" ? account.account?.display_name ?? null : null}
            join_code={me.join_code}
            is_live={live.is_live}
            icon={settings_icon}
            onJoin={(code) => void joinWalker(code)}
            plan={<PlanContent />}
            quality_label={qualityLabel(quality)}
            is_setup_first={is_settings_setup_first}
          />
        )}

        {is_nearby_open && is_play && (
          <NearbySightTray
            spawn={spawn_world.spawn}
            seen={seen}
            onPick={(row) => {
              setNearbyOpen(false);
              const is_reach = reachableSpawn(spawn_world.spawn, geo.fix).some((r) => r.spawn_id === row.spawn_id);
              openSpeciesCard(row.species_code, {
                label: is_reach ? "Log it here" : "Walk to it",
                onClick: () => {
                  setCard(null);
                  walkToSpawn(row);
                },
              });
            }}
            onClose={() => setNearbyOpen(false)}
          />
        )}

        {is_trainer_open && (
          <TrainerSheet
            snap={live_snap}
            daily={daily}
            stage={stage}
            vigor={vigor}
            geo_mode={geo_mode}
            geo_status={geo.status}
            join_code={me.join_code}
            walker_name={live_name}
            is_live={live.is_live}
            live_label={hall_label}
            friend={friend}
            group={group_streak}
            onAddPartner={addPartner}
            onDropPartner={dropPartner}
            onJoin={(code) => void joinWalker(code)}
            onCycleMode={() => setGeoMode((m) => nextGeoMode(m))}
            onHunt={() => {
              setTrainerOpen(false);
              if (daily) {
                const place = sectorByCode(daily.sector_code);
                if (place && geo_mode === "play") {
                  if (geo.walkTo(walkPoint(place), 0, place.name)) setFollowing(true);
                  else showToast(noRouteLine(place.name));
                } else if (place) {
                  setView((prev) => ({ ...prev, lat: place.label_point[0], lon: place.label_point[1], zoom: Math.max(prev.zoom, 17) }));
                }
              }
              setMode("play");
              go("/");
            }}
            onPlan={() => {
              setTrainerOpen(false);
              go("/settings");
            }}
            onClose={() => setTrainerOpen(false)}
          />
        )}

        {!is_camera_open && (
          <GameDock
            stage={stage}
            vigor={vigor}
            is_journal={route === "/journal"}
            is_plan={route === "/settings"}
            is_nearby_open={is_nearby_open}
            onPlan={() => {
              setTrainerOpen(false);
              setNearbyOpen(false);
              go(route === "/settings" ? "/" : "/settings");
            }}
            onAvatar={() => {
              setNearbyOpen(false);
              setTrainerOpen((v) => !v);
            }}
            onGo={pressGo}
            onNearby={() => {
              setTrainerOpen(false);
              if (!is_play) {
                setMode("play");
                go("/");
                setNearbyOpen(true);
                return;
              }
              setNearbyOpen((v) => !v);
            }}
            onDex={() => {
              setTrainerOpen(false);
              setNearbyOpen(false);
              go(route === "/journal" ? "/" : "/journal");
            }}
          />
        )}

        {is_camera_open && (
          <CameraSheet
            pick_code={pick_code}
            where={camera_where ?? sel.where}
            rarity={camera_rarity}
            pool_count={spawn_world.pool_count}
            hunt_code={daily && !daily.is_done ? daily.species_code : null}
            fix_line={fix_line}
            onPick={setPickCode}
            onSave={saveSighting}
            onClose={() => {
              setCameraOpen(false);
              setCameraRarity(null);
            }}
          />
        )}
        {receipt && (
          <WalkReceiptSheet
            receipt={receipt}
            pool={spawn_world.pool}
            is_desktop={is_desktop}
            onJournal={() => {
              setReceipt(null);
              go("/journal");
            }}
            onDismiss={() => setReceipt(null)}
          />
        )}
        {card && (
          <Suspense fallback={null}>
            <SpeciesCard
              key={card.species_code}
              species_code={card.species_code}
              pool={spawn_world.pool}
              is_seen={seen.has(card.species_code)}
              learn={species[card.species_code] ? <SpeciesBack sp={species[card.species_code]} /> : null}
              action={card.action}
              onClose={() => setCard(null)}
            />
          </Suspense>
        )}
        {reveal && <BlindBoxReveal stage={reveal} onDismiss={() => setReveal(null)} />}
        {level_up !== null && !reveal && (
          <LevelUpCard level={level_up} stage={stage} onDismiss={() => setLevelUp(null)} />
        )}
        {toast && <GameToast msg={toast} band={route === "/" || route === "/map" ? "top" : "bottom"} />}
        {is_booted && shown_alert && (
          <AlertCard
            key={shown_alert.alert_id}
            spec={shown_alert}
            onDismiss={() => {
              markAlertSeen(shown_alert.alert_id);
              setAlertQueue((q) => q.filter((a) => a.alert_id !== shown_alert.alert_id));
            }}
          />
        )}
        {is_booted && !shown_alert && !is_camera_open && daily && !daily.is_done && today_seen !== daily.day_key && route === "/" && (
          <TodayHuntCard
            daily={daily}
            reward={POINT_VALUE.challenge}
            streak_weeks={live_snap.streak_weeks}
            onGo={() => {
              dismissToday();
              goDaily();
            }}
            onLater={dismissToday}
          />
        )}
        {!is_booted && <Boot onDone={() => setBooted(true)} />}
      </div>
    </div>
  );
}
