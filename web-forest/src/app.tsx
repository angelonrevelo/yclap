import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import CampusMap from "./campus-map";
import PlayMap from "./play-map";
import { pinKindOf, type PinKind } from "./pin";
import Character, { stageFor, STAGE_LABEL, toNextStage, type Stage } from "./character";
/* The 3D character (T4.1) — lazy so the model-viewer chunk is fetched only
   where the 3D character renders. The SVG `Character` stays as the Suspense
   fallback and on the map, whose billboard must cost no bundle. */
const CharacterModel = lazy(() => import("./character-model"));
import { biome_sector, sectorAt, sectorByCode, sector as sector_row, type Sector } from "./sector";
import Viewfinder, { type Shot } from "./camera";
import {
  aisDueNote,
  AIS_GAP_NOTE,
  AT_TREE_RADIUS_M,
  consult,
  DEMO_PIN,
  encounter,
  journal_order,
  landmark,
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
  VERIFIED_RULE_NOTE,
  LOCAL_OBS_STATUS_LABEL,
  LOCAL_OBS_STATUS_NOTE,
  gamifySnapshot,
  localObsStatus,
  observeAwardKind,
  persistAward,
  readPointEvents,
  type GamifySnapshot,
  type PointEvent,
} from "./gamify";
import { CAMPUS_CENTER, formatLatLon, formatMeter, formatWalkMinute, WALK_PACE_MS } from "./geo";
import { LAYER_ORDER, nextLayer, prefetchCampus, SOURCE, type Layer, type View } from "./tile-map";
import { useGeo } from "./use-geo";
import { biomePresenceAt, rankEncounter, sectorResident, type BiomePresence } from "./nearby";
import { cosmeticForStage } from "./cosmetic";
import { BadgeShelf, loadSpawnPool, RarityPill, reachableSpawn, SpawnStrip, useSpawnWorld, WildShelf, WorldStrip } from "./live";
import { KindThumb } from "./kind-mark";
import { displayName, kindOf } from "./kind";
import type { Rarity, Spawn, SpawnPoolEntry } from "./spawn";
import { receiptHighlight } from "./collection";
import { demoJournal, isSeededJournal } from "./demo-seed";

import {
  campusCodeForScientific,
  demoIdentify,
  hasInatToken,
  loadInatNearby,
  scorePlantImage,
  type InatIdentifyState,
  type InatNearbyState,
  type InatSuggestion,
} from "./inat";
import InatStrip from "./inat-strip";
import { spot } from "./asset/kit";
import { Card, Chip, Eyebrow, Fab, GlyphDisc, Pill, PrimaryPill, RADIUS, SpeciesPill, TaxonName, TaxonThumb } from "./ui";
import {
  CameraIcon,
  CanopyIcon,
  ExportIcon,
  LeafScanIcon,
  LocateIcon,
  ShutterIcon,
  WalkIcon,
  CheckIcon,
  CloseIcon,
  HomeIcon,
  JournalIcon,
  MapIcon,
  PinIcon,
  PlanIcon,
  PlantMark,
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
const PLAY_ZOOM = 20;
const OVERVIEW_ZOOM = 16;

const CARD_RADIUS = RADIUS.card;
const TILE_RADIUS = RADIUS.tile;

export type Route = "/" | "/map" | "/journal" | "/plan";

function pathToRoute(path: string): Route {
  if (path === "/map" || path === "/journal" || path === "/plan") return path;
  return "/";
}

function StatTile({ big, line, source }: { big: string; line: string; source: string }) {
  return (
    <div
      className="flex-1"
      style={{
        background: "var(--brand-mist)",
        border: "1.5px solid rgba(21,77,48,0.12)",
        borderRadius: TILE_RADIUS,
        padding: "12px 10px",
        display: "flex",
        flexDirection: "column",
        boxShadow: "0 6px 16px rgba(21,77,48,0.05)",
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 20, color: "var(--brand-forest)", lineHeight: 1.05 }}>{big}</div>
      <div style={{ fontSize: 11.5, color: "rgba(31,32,34,0.78)", marginTop: 4, lineHeight: 1.35 }}>{line}</div>
      <div style={{ fontSize: 10, color: "rgba(31,32,34,0.45)", marginTop: "auto", paddingTop: 4 }}>{source}</div>
    </div>
  );
}

function MobileNav({ route, onRoute }: { route: Route; onRoute: (r: Route) => void }) {
  const item: { id: Route; label: string; Icon: typeof HomeIcon }[] = [
    { id: "/", label: "Home", Icon: HomeIcon },
    { id: "/map", label: "Map", Icon: MapIcon },
    { id: "/journal", label: "Journal", Icon: JournalIcon },
    { id: "/plan", label: "Plan", Icon: PlanIcon },
  ];
  return (
    <nav
      className="absolute inset-x-0 bottom-0 flex items-stretch"
      style={{
        height: 64,
        background: "rgba(247,250,246,0.96)",
        borderTop: "1.5px solid rgba(21,77,48,0.10)",
        backdropFilter: "blur(8px)",
        zIndex: 40,
      }}
    >
      {item.map(({ id, label, Icon }) => {
        const is_active = route === id;
        return (
          <button
            key={id}
            onClick={() => onRoute(id)}
            className="flex-1 flex flex-col items-center justify-center"
            style={{ color: is_active ? "var(--ui-accent)" : "rgba(31,32,34,0.62)" }}
          >
            <span
              style={{
                display: "grid",
                placeItems: "center",
                width: 46,
                height: 28,
                borderRadius: RADIUS.pill,
                /* Chrome, not ecology. The label above is --ui-accent since the
                   palette split, and a bark label on a green wash was the one
                   place the two roles visibly disagreed. */
                background: is_active ? "rgba(21,77,48,0.12)" : "transparent",
                transition: "background .18s ease",
              }}
            >
              <Icon size={21} active={is_active} />
            </span>
            <span style={{ fontSize: 10.5, fontWeight: 700, marginTop: 3 }}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}


/** Magisphere wordmark + Canva tagline. Shared by phone header and desktop rail. */
function BrandLockup({ mark_size = 28, title_size = 20 }: { mark_size?: number; title_size?: number }) {
  return (
    <div className="flex items-center gap-2">
      <PlantMark size={mark_size} />
      <div>
        <div style={{ fontWeight: 800, fontSize: title_size, lineHeight: 1, color: "var(--brand-forest)" }}>Magisphere</div>
        <div style={{ fontSize: 12, color: "var(--brand-green)", fontWeight: 700, marginTop: 3 }}>Rediscovering home.</div>
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
            border: "1.5px solid rgba(0,134,83,0.28)",
            background: "rgba(0,134,83,0.06)",
            padding: "10px 12px",
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, color: "var(--ui-accent)", letterSpacing: "0.04em" }}>POINTS</div>
          <div style={{ fontSize: is_desktop ? 28 : 24, fontWeight: 800, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
            {snap.total_points}
          </div>
          <div style={{ fontSize: 11, color: "rgba(31,32,34,0.55)", marginTop: 2 }}>
            Explore {POINT_VALUE.explore} · Learn {POINT_VALUE.learn} · Observe {POINT_VALUE.observe} · Local verified {POINT_VALUE.verified_discovery}
          </div>
        </div>
        <div
          style={{
            flex: 1,
            borderRadius: RADIUS.tile,
            border: "1.5px solid rgba(246,178,45,0.45)",
            background: "rgba(246,178,45,0.10)",
            padding: "10px 12px",
          }}
        >
          <div style={{ fontSize: 10, fontWeight: 800, color: "#8a5d00", letterSpacing: "0.04em" }}>WEEKLY STREAK</div>
          <div style={{ fontSize: is_desktop ? 28 : 24, fontWeight: 800, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
            {snap.streak_weeks}
            <span style={{ fontSize: 13, fontWeight: 700, marginLeft: 4 }}>wk</span>
          </div>
          <div style={{ fontSize: 11, color: "rgba(31,32,34,0.55)", marginTop: 2 }}>
            {snap.participated_this_week ? "Active this week" : "No activity yet this week"} · not a daily streak
          </div>
        </div>
      </div>
      <p style={{ fontSize: 11, color: "rgba(31,32,34,0.5)", marginTop: 10, lineHeight: 1.4 }}>
        {VERIFIED_RULE_NOTE}
      </p>
    </Card>
  );
}

function LocalLeaderboardCard({ snap, is_desktop }: { snap: GamifySnapshot; is_desktop: boolean }) {
  return (
    <Card style={{ padding: is_desktop ? 18 : 14 }}>
      <Eyebrow>LOCAL DEMO LEADERBOARD</Eyebrow>
      <p style={{ fontSize: 12, color: "rgba(31,32,34,0.62)", marginTop: 6, lineHeight: 1.4 }}>
        Seeded demo cohort on this device plus you. Not an official AIS rank.
      </p>
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
        {snap.leaderboard.slice(0, 6).map((row, i) => (
          <div
            key={row.player_id}
            className="flex items-center gap-2"
            style={{
              padding: "8px 10px",
              borderRadius: 12,
              background: row.is_you ? "rgba(0,134,83,0.10)" : "rgba(31,32,34,0.03)",
              border: row.is_you ? "1.5px solid rgba(0,134,83,0.28)" : "1px solid rgba(31,32,34,0.06)",
            }}
          >
            <span style={{ width: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums", color: "rgba(31,32,34,0.55)" }}>
              {i + 1}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 13.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {row.name}
                {row.is_you ? " · you" : ""}
                {row.is_seed ? " · demo" : ""}
              </div>
              <div style={{ fontSize: 11, color: "rgba(31,32,34,0.5)" }}>{row.streak_weeks} wk streak</div>
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
                <span style={{ fontVariantNumeric: "tabular-nums", color: "rgba(31,32,34,0.6)" }}>
                  {c.current}/{c.target}
                  {c.done ? " · done" : ""}
                </span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: "#EEF1F0", marginTop: 5 }}>
                <div
                  style={{
                    width: `${ratio * 100}%`,
                    height: "100%",
                    borderRadius: 999,
                    background: c.done ? "var(--grad-forest)" : "var(--ui-accent)",
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

function BuddyLine({ snap }: { snap: GamifySnapshot }) {
  const next = snap.buddy.next;
  const next_label = next ? next.stage.replace(/_/g, " ") : "";
  return (
    <p style={{ fontSize: 12, color: "rgba(31,32,34,0.62)", marginTop: 8, lineHeight: 1.4 }}>
      Biodiversity Buddy: <strong>{snap.buddy.label}</strong>
      {next
        ? ` · ${next.remaining} more week${next.remaining === 1 ? "" : "s"} toward ${next_label}`
        : " · fully grown"}
      . Grows with weekly participation.
    </p>
  );
}

function HomeScreen({
  is_desktop,
  onWalk,
  onPlan,
  live,
  gamify,
}: {
  is_desktop: boolean;
  onWalk: () => void;
  onPlan: () => void;
  /* The spawn strip, passed in rather than built here: home should not have to
     know how the world is loaded to be able to show it. */
  live?: React.ReactNode;
  gamify: GamifySnapshot;
}) {
  if (is_desktop) {
    return (
      <div className="flex-1 scroll-soft" style={{ background: "var(--brand-mist)", overflowY: "auto", overflowX: "hidden", padding: "56px 64px" }}>
        <div className="flex gap-14" style={{ alignItems: "flex-start" }}>
          <div style={{ maxWidth: 640 }}>
            <div style={{ marginBottom: 22 }}>
              <BrandLockup mark_size={36} title_size={26} />
            </div>
            <div style={{ width: 72, height: 5, borderRadius: 999, background: "var(--grad-brand)", marginBottom: 22 }} />
            <h1 style={{ fontWeight: 800, fontSize: 46, lineHeight: 1.12, letterSpacing: "-0.015em", color: "var(--brand-forest)" }}>
              Two-thirds of this campus is green. Most of us cannot name what we are walking under.
            </h1>
            <p style={{ fontSize: 18, color: "rgba(31,32,34,0.8)", marginTop: 20, lineHeight: 1.5, maxWidth: 560 }}>
              A student-led field guide for Ateneo&rsquo;s urban forest — so noticing becomes a habit, not a poster.
            </p>
            <div className="flex gap-3" style={{ marginTop: 32 }}>
              <StatTile big="1,809" line="trees inventoried" source="AIS · SY 2025–2026" />
              <StatTile big="101" line="threatened trees" source="AIS arboretum" />
              <StatTile big="~⅔" line="of 89 ha green" source="AIS, Loyola Heights" />
            </div>
            <div className="flex items-center gap-4" style={{ marginTop: 28 }}>
              <button
                onClick={onWalk}
                style={{ height: 52, padding: "0 30px", borderRadius: RADIUS.pill, background: "var(--ui-accent)", color: "#fff", fontWeight: 700, fontSize: 16, boxShadow: "0 8px 20px rgba(21,77,48,0.22)" }}
              >
                Walk the campus
              </button>
              <button onClick={onPlan} style={{ height: 52, color: "var(--brand-blue)", fontWeight: 700, fontSize: 15 }}>
                Read the plan
              </button>
            </div>
            <p style={{ fontSize: 13, color: "rgba(31,32,34,0.6)", marginTop: 28, lineHeight: 1.4 }}>
              Not a planting drive. Points and a local demo leaderboard live on this device — not an official AIS rank. Not our tree inventory — AIS already counted.
            </p>
            <p style={{ fontSize: 12.5, color: "rgba(31,32,34,0.55)", marginTop: 10, lineHeight: 1.45, maxWidth: 560 }}>
              {AIS_GAP_NOTE}
            </p>
            {live && <div style={{ marginTop: 22, maxWidth: 560 }}>{live}</div>}
            <div style={{ marginTop: 22, maxWidth: 560 }}>
              <LandmarkCard is_desktop />
            </div>
            <div style={{ marginTop: 16, maxWidth: 560 }}>
              <PointsStreakCard snap={gamify} is_desktop />
            </div>
            <div style={{ marginTop: 12, maxWidth: 560 }}>
              <LocalLeaderboardCard snap={gamify} is_desktop />
            </div>
            <div style={{ marginTop: 16, fontSize: 11, color: "rgba(31,32,34,0.45)", fontWeight: 700, letterSpacing: "0.04em" }}>
              YOUTH CLAP 2026 · ATENEO CCC
            </div>
          </div>
          <button
            onClick={onWalk}
            style={{
              width: 420,
              flexShrink: 0,
              borderRadius: CARD_RADIUS,
              overflow: "hidden",
              background: "#fffef9",
              border: "1.5px solid rgba(21,77,48,0.12)",
              boxShadow: "var(--shadow-card)",
              textAlign: "left",
            }}
          >
            <div style={{ position: "relative", aspectRatio: "16 / 9" }}>
              <CampusMap
                encounter={encounter.slice(0, 5)}
                selected_id={null}
                onSelect={() => {}}
                view={{ ...CAMPUS_CENTER, zoom: OVERVIEW_ZOOM }}
                onView={() => {}}
                layer="satellite"
                is_interactive={false}
                disc_size={22}
              />
            </div>
            <div className="flex items-center justify-between" style={{ padding: "16px 18px" }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: 17 }}>Open walk</div>
                <div style={{ fontSize: 13, color: "rgba(31,32,34,0.6)", marginTop: 2 }}>
                  Demo campus · {DEMO_PIN.lat}, {DEMO_PIN.lon}
                </div>
              </div>
              <span style={{ width: 40, height: 40, borderRadius: 999, background: "var(--ui-accent)", display: "grid", placeItems: "center", color: "#fff", fontWeight: 800 }}>
                →
              </span>
            </div>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="scroll-soft" style={{ height: "100%", overflowY: "auto", overflowX: "hidden", background: "var(--brand-mist)", paddingBottom: 80 }}>
      <header style={{ padding: 12 }}>
        <BrandLockup mark_size={28} title_size={20} />
      </header>
      <div style={{ paddingLeft: 20, paddingRight: 20, marginTop: 14 }}>
        <div style={{ width: 56, height: 4, borderRadius: 999, background: "var(--grad-brand)", marginBottom: 16 }} />
        <h1 style={{ fontWeight: 800, fontSize: 28, lineHeight: 1.15, letterSpacing: "-0.01em", maxWidth: 330, color: "var(--brand-forest)" }}>
          Two-thirds of this campus is green. Most of us cannot name what we are walking under.
        </h1>
        <p style={{ fontSize: 15, color: "rgba(31,32,34,0.8)", marginTop: 14, lineHeight: 1.5 }}>
          A student-led field guide for Ateneo&rsquo;s urban forest — so noticing becomes a habit, not a poster.
        </p>
      </div>
      <div className="flex gap-2" style={{ padding: "18px 20px 4px" }}>
        <StatTile big="1,809" line="trees inventoried" source="AIS · SY 2025–2026" />
        <StatTile big="101" line="threatened trees" source="AIS arboretum" />
        <StatTile big="~⅔" line="of 89 ha green" source="AIS, Loyola Heights" />
      </div>
      <div style={{ padding: "16px 20px 0" }}>
        <button
          onClick={onWalk}
          style={{ width: "100%", height: 48, borderRadius: RADIUS.pill, background: "var(--ui-accent)", color: "#fff", fontWeight: 700, fontSize: 15, boxShadow: "0 8px 18px rgba(21,77,48,0.2)" }}
        >
          Walk the campus
        </button>
        <button onClick={onPlan} style={{ width: "100%", height: 44, color: "var(--brand-blue)", fontWeight: 700, fontSize: 15, marginTop: 6 }}>
          Read the plan
        </button>
      </div>
      <p style={{ fontSize: 12, color: "rgba(31,32,34,0.6)", padding: "14px 20px 0", lineHeight: 1.4 }}>
        Not a planting drive. Points and a local demo leaderboard live on this device — not an official AIS rank. Not our tree inventory — AIS already counted.
      </p>
      <p style={{ fontSize: 11.5, color: "rgba(31,32,34,0.55)", padding: "8px 20px 0", lineHeight: 1.4 }}>
        {AIS_GAP_NOTE}
      </p>
      {live && <div style={{ padding: "18px 20px 0" }}>{live}</div>}
      <div style={{ padding: "18px 20px 0" }}>
        <LandmarkCard is_desktop={false} />
      </div>
      <div style={{ padding: "14px 20px 0" }}>
        <PointsStreakCard snap={gamify} is_desktop={false} />
      </div>
      <div style={{ padding: "12px 20px 0" }}>
        <LocalLeaderboardCard snap={gamify} is_desktop={false} />
      </div>
      <div style={{ padding: "22px 20px 0" }}>
        <span style={{ fontSize: 10.5, color: "rgba(31,32,34,0.45)", fontWeight: 700, letterSpacing: "0.04em" }}>
          YOUTH CLAP 2026 · ATENEO CCC
        </span>
      </div>
    </div>
  );
}

function LandmarkCard({ is_desktop }: { is_desktop: boolean }) {
  const row = landmark[0];
  if (!row) return null;
  const sp = species[row.species_code];
  return (
    <div
      style={{
        background: "#fffef9",
        border: "1.5px solid rgba(21,77,48,0.12)",
        borderRadius: CARD_RADIUS,
        boxShadow: "var(--shadow-card)",
        padding: is_desktop ? 20 : 16,
        display: "flex",
        gap: 14,
        alignItems: "flex-start",
      }}
    >
      <TaxonThumb species_code={row.species_code} size={is_desktop ? 92 : 64} />
      <div>
        <Eyebrow>LANDMARK TREE · {row.where.toUpperCase()}</Eyebrow>
        <div style={{ fontWeight: 800, fontSize: is_desktop ? 20 : 17, marginTop: 5 }}>{row.title}</div>
        <div style={{ fontStyle: "italic", fontSize: 12.5, color: "rgba(31,32,34,0.6)", marginTop: 2 }}>
          {sp?.scientific_name}
        </div>
        <p style={{ fontSize: 13.5, lineHeight: 1.45, marginTop: 9 }}>{row.documented}</p>
        <div
          style={{
            marginTop: 10,
            borderRadius: 14,
            background: "rgba(246,178,45,0.12)",
            border: "1px solid rgba(246,178,45,0.4)",
            padding: "10px 12px",
          }}
        >
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", color: "#8a5d00" }}>
            STORY NOT COLLECTED YET
          </div>
          <p style={{ fontSize: 12, lineHeight: 1.4, marginTop: 5, color: "rgba(31,32,34,0.78)" }}>{row.open_ask}</p>
        </div>
      </div>
    </div>
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
        bottom: 64,
        background: "#F9F9F9",
        borderTop: "1.5px solid #E4E7E8",
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        boxShadow: "0 -8px 20px rgba(31,32,34,0.14)",
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
              <span style={{ fontSize: 12, fontWeight: 700, color: "#075D89" }}>{distance_line}</span>
            ) : null
          }
        />
      </button>
      {is_pinned && (
        <button
          onClick={onUnpin}
          aria-label="Follow the nearest tree again"
          style={{
            height: 34,
            flexShrink: 0,
            padding: "0 12px",
            borderRadius: RADIUS.pill,
            border: "1.5px solid #E4E7E8",
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
  is_panel = false,
}: {
  sp: Species;
  where: string;
  distance_line: string | null;
  onLog: () => void;
  onDismiss: () => void;
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
        background: "#FFFFFF",
        borderTopLeftRadius: is_panel ? 24 : 28,
        borderTopRightRadius: is_panel ? 24 : 28,
        borderBottomLeftRadius: is_panel ? 24 : 0,
        borderBottomRightRadius: is_panel ? 24 : 0,
        boxShadow: is_panel ? "none" : "0 -16px 40px rgba(31,32,34,0.18)",
        zIndex: 45,
        padding: is_panel ? "10px 18px 18px" : "8px 22px 88px",
        display: "flex",
        flexDirection: "column",
        animation: "fgup .32s cubic-bezier(.2,.8,.2,1)",
      }}
    >
      <button
        onClick={onDismiss}
        aria-label="Collapse"
        style={{ display: "block", width: 42, height: 5, borderRadius: 999, background: "#E4E7E8", margin: "4px auto 6px", flexShrink: 0 }}
      />

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", paddingTop: 4, flexShrink: 0 }}>
        <TaxonThumb species_code={sp.species_code} size={132} style={{ boxShadow: "0 10px 28px rgba(24,38,20,0.16)" }} />
        <div style={{ fontWeight: 800, fontSize: 26, lineHeight: 1.15, marginTop: 14, letterSpacing: "-0.02em" }}>{sp.common_name}</div>
        <div style={{ fontStyle: "italic", fontSize: 14, color: "rgba(31,32,34,0.55)", marginTop: 4 }}>{sp.scientific_name}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center", marginTop: 12 }}>
          <SpeciesPill sp={sp} limit={3} />
        </div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "rgba(31,32,34,0.45)", letterSpacing: "0.06em", marginTop: 10 }}>
          {where.toUpperCase()}
          {distance_line ? ` · ${distance_line}` : ""}
        </div>
      </div>

      {distance_line?.includes("min walk") ? (
        <p style={{ fontSize: 11, color: "rgba(31,32,34,0.45)", marginTop: 10, textAlign: "center", flexShrink: 0 }}>
          Minutes assume a walking pace of {WALK_PACE_MS} m/s. The metre figure is the measured one.
        </p>
      ) : null}

      <div style={{ overflowY: "auto", flex: 1, minHeight: 0, marginTop: 18 }}>
        <p style={{ fontSize: 15, lineHeight: 1.5, color: "#1F2022", margin: 0 }}>{sp.note}</p>
        {sp.caption && (
          <div style={{ fontSize: 11.5, color: "rgba(31,32,34,0.48)", marginTop: 10, lineHeight: 1.4 }}>{sp.caption}</div>
        )}
        <div style={{ height: 18 }} />
        <SpeciesBack sp={sp} />
        <p style={{ fontSize: 12, color: "rgba(31,32,34,0.55)", marginTop: 18, lineHeight: 1.45 }}>
          Need a second opinion?{" "}
          <a href={SEEK_URL} target="_blank" rel="noreferrer" style={{ color: "#058CD6", fontWeight: 700, textDecoration: "underline" }}>
            Open Seek
          </a>
          . Identification stays with iNaturalist — not this app.
        </p>
      </div>

      <button
        onClick={onLog}
        className="flex items-center justify-center gap-2"
        style={{
          width: "100%",
          height: 52,
          borderRadius: 16,
          background: "var(--ui-accent)",
          color: "#fff",
          fontWeight: 800,
          fontSize: 16,
          marginTop: 16,
          flexShrink: 0,
          boxShadow: "0 6px 18px rgba(47,107,58,0.32)",
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
        background: "#FFF6E5",
        border: "1.5px solid #F0C97A",
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 800, color: "#7A5A12", letterSpacing: "0.06em" }}>
        EASY TO CONFUSE WITH {(other?.common_name ?? warn.species_code).toUpperCase()}
      </div>
      <p style={{ fontSize: 12.5, lineHeight: 1.45, marginTop: 4, color: "#5C4410" }}>{warn.difference}</p>
      <div style={{ fontSize: 10.5, color: "rgba(92,68,16,0.62)", marginTop: 5 }}>{warn.source}</div>
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
              border: "1.5px solid #E4E7E8",
              background: "#fff",
              padding: "9px 10px",
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 800, color: "var(--ui-accent)", letterSpacing: "0.05em" }}>
              {tile.label.toUpperCase()}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 3, lineHeight: 1.25 }}>{tile.value}</div>
            <div style={{ fontSize: 9.5, color: "rgba(31,32,34,0.45)", marginTop: 5, lineHeight: 1.3 }}>
              {tile.source}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        <Eyebrow>WHERE IT GROWS</Eyebrow>
        <p style={{ fontSize: 13.5, lineHeight: 1.45, marginTop: 5 }}>{detail.habitat.line}</p>
        <div style={{ fontSize: 10.5, color: "rgba(31,32,34,0.5)", marginTop: 5 }}>{detail.habitat.source}</div>
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
      style={{ padding: "10px 0", borderTop: "1px solid #E4E7E8", textAlign: "left" }}
    >
      <span className="flex items-center gap-3" style={{ minWidth: 0 }}>
        <TaxonThumb species_code={species_code} size={46} />
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontWeight: 700, fontSize: 14.5, lineHeight: 1.2 }}>{sp.common_name}</span>
          <span style={{ display: "block", fontStyle: "italic", fontSize: 11.5, color: "rgba(31,32,34,0.6)" }}>
            {sp.scientific_name}
          </span>
          {distance_line && (
            <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: "#075D89", marginTop: 2 }}>
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
            background: "rgba(0,134,83,0.09)",
            border: "2px solid rgba(0,134,83,0.34)",
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
            background: "rgba(246,178,45,0.12)",
            border: "1px solid rgba(246,178,45,0.4)",
            padding: "8px 11px",
            fontSize: 11.5,
            lineHeight: 1.4,
            color: "#8a5d00",
            fontWeight: 700,
          }}
        >
          Placeholder extent — our delineation, not surveyed.
        </div>
      )}
      <div style={{ marginTop: 10 }}>
        <Eyebrow>SPECIES TO FIND {row.species_code.length > 0 ? `· ${row.species_code.length}` : ""}</Eyebrow>
        {row.species_code.length === 0 ? (
          <p style={{ fontSize: 13, color: "rgba(31,32,34,0.6)", marginTop: 8, lineHeight: 1.45 }}>
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
                  color: "#075D89",
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
        bottom: 64,
        background: "#F9F9F9",
        borderTop: "1.5px solid #E4E7E8",
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        boxShadow: "0 -8px 20px rgba(31,32,34,0.14)",
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
            background: "rgba(0,134,83,0.09)",
            border: "2px solid rgba(0,134,83,0.34)",
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
              color: "var(--ui-accent)",
              letterSpacing: "0.07em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            BIOME · INSIDE {row.is_placeholder ? "· PLACEHOLDER, NOT SURVEYED" : ""}
          </span>
          <span style={{ display: "block", fontWeight: 800, fontSize: 17, lineHeight: 1.15 }}>{row.name}</span>
          <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#075D89", marginTop: 2 }}>
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
        background: "#F9F9F9",
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        boxShadow: "0 -12px 28px rgba(31,32,34,0.16)",
        zIndex: 45,
        padding: "10px 20px 76px",
        overflowY: "auto",
        animation: "fgup .32s cubic-bezier(.2,.8,.2,1)",
      }}
    >
      <button
        onClick={onDismiss}
        aria-label="Collapse"
        style={{ display: "block", width: 40, height: 5, borderRadius: 999, background: "#E4E7E8", margin: "0 auto 12px" }}
      />
      <BiomeCard presence={presence} is_desktop={false} onLog={onLog} />
    </div>
  );
}

function identifyCaption(state: InatIdentifyState): string {  if (state.status === "loading") return "iNaturalist is identifying this photo — not this app.";
  if (state.status === "offline") return "iNaturalist computer vision is unreachable. Pick from the campus list, or try again.";
  if (state.status === "empty") return "iNaturalist returned no taxon suggestion. Identification is still iNaturalist’s, not this app’s.";
  if (state.status === "needs_token") {
    return "iNaturalist computer vision needs a signed-in token on this build. Identification is iNaturalist’s, not this app’s — pick from the list or open Seek.";
  }
  if (state.status === "demo") {
    return "RECORDED RESPONSE — this build has no iNaturalist token, so it is replaying a saved reply for a Narra photo. It has not looked at your photo.";
  }
  if (state.status === "ready") return "iNaturalist is identifying — not this app. Tap a suggestion to fill the campus list, or pick yourself.";
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
    <ul style={{ listStyle: "none", margin: "10px 0 0", padding: 0 }}>
      {state.suggestion.slice(0, 3).map((row) => {
        const match = campusCodeForScientific(row.scientific_name);
        return (
          <li key={`${row.rank}-${row.scientific_name}`} style={{ marginTop: 6 }}>
            <button
              type="button"
              onClick={() => {
                if (match) onPick(match);
              }}
              className="w-full"
              style={{ textAlign: "left", fontSize: 13 }}
            >
              <span style={{ fontWeight: 700 }}>{row.common_name}</span>
              <span style={{ fontStyle: "italic", color: "rgba(31,32,34,0.55)", marginLeft: 6 }}>
                {row.scientific_name}
              </span>
              <span style={{ display: "block", fontSize: 11, color: "rgba(31,32,34,0.45)" }}>
                {is_demo ? "recorded iNaturalist reply" : "iNaturalist"} · score {row.score.toFixed(2)} · #{row.rank}
                {match ? " · on our walk list" : ""}
              </span>
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
  { kind: "native", label: "Native", tone: "#008653" },
  { kind: "exotic", label: "Exotic", tone: "#8A6A28" },
  { kind: "threatened", label: "Threatened", tone: "#B3391F" },
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

  useEffect(() => {
    if (!shot) {
      setIdentify({ status: "idle" });
      return;
    }
    let is_alive = true;
    setIdentify({ status: "loading" });
    scorePlantImage({ image: shot.blob, filename: "sighting.jpg" }).then((next) => {
      if (!is_alive) return;
      /* No token in this build — replay the recorded reply so the walk still
         shows the identify step, labelled as recorded. */
      const shown = next.status === "needs_token" ? demoIdentify() : next;
      setIdentify(shown);
      /* Only a LIVE identification may pre-fill the student's pick. A recorded
         reply is shown and tappable, never applied on their behalf. */
      if (shown.status === "ready") {
        const match = shown.suggestion
          .map((row: InatSuggestion) => campusCodeForScientific(row.scientific_name))
          .find((code): code is string => Boolean(code));
        if (match) onPick(match);
      }
    });
    return () => {
      is_alive = false;
    };
    // onPick is setState — stable. Do not re-score when the campus pick changes.
  }, [shot]);

  /* Saved as attribution only when iNaturalist actually looked at the photo. */
  const top = identify.status === "ready" ? identify.suggestion[0] : null;

  return (
    <div className="absolute inset-0" style={{ zIndex: 60 }}>
      <div className="absolute inset-0" style={{ background: "rgba(31,32,34,0.45)" }} onClick={onClose} />
      <div
        className="absolute inset-x-0 bottom-0 scroll-soft"
        style={{
          top: 24,
          background: "#F9F9F9",
          borderTopLeftRadius: 24,
          borderTopRightRadius: 24,
          overflowY: "auto",
          padding: "16px 20px 24px",
          animation: "fgup .3s cubic-bezier(.2,.8,.2,1)",
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Log a sighting</div>
            <div style={{ fontSize: 12, color: "rgba(31,32,34,0.6)", marginTop: 2 }}>{where}</div>
            {/* Only when you walked into a find in the world. An ordinary log
                makes no rarity claim, because outside a spawn we do not know
                that this individual is the species the pill would be about. */}
            {rarity && (
              <div style={{ marginTop: 6 }}>
                <RarityPill rarity={rarity} count={pool_count?.get(pick_code)} />
              </div>
            )}
          </div>
          <button onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>

        <div style={{ marginTop: 14 }}>
          <Viewfinder shot={shot} onShot={setShot} onClear={() => setShot(null)} />
        </div>

        <div className="flex items-start gap-2" style={{ marginTop: 10 }}>
          <span style={{ flexShrink: 0, marginTop: 1 }}>
            <LeafScanIcon size={16} />
          </span>
          <div style={{ fontSize: 11, color: "rgba(31,32,34,0.5)", lineHeight: 1.4 }}>{identifyCaption(identify)}</div>
        </div>
        <SuggestionList state={identify} onPick={onPick} />
        {!hasInatToken() && (
          <div style={{ fontSize: 11, color: "rgba(31,32,34,0.45)", marginTop: 6 }}>
            Set <code>VITE_INAT_API_TOKEN</code> before building to run live iNaturalist computer vision instead.
          </div>
        )}

        <div className="flex items-center gap-1.5" style={{ marginTop: 14, fontSize: 12, color: "rgba(31,32,34,0.7)" }}>
          <PinIcon size={16} />
          {fix_line}
        </div>

        <div style={{ marginTop: 18 }}><Eyebrow>WHAT DID YOU SEE?</Eyebrow></div>
        <div style={{ marginTop: 8, border: "1.5px solid #E4E7E8", borderRadius: 16, overflow: "hidden" }}>
          {/* You walked to a find that is not on the nine-species guide list.
              Without this row the sheet showed NOTHING selected while `pick_code`
              was quietly set to it — so the save was right and the screen did
              not say so, and one tap on any row below would have logged a
              different species than the one you walked to. */}
          {wild_pick && (
            <div
              style={{
                padding: "12px 14px",
                background: "rgba(21,77,48,0.08)",
                borderBottom: "1px solid #E4E7E8",
              }}
            >
              <span className="flex items-center gap-3">
                <KindThumb kind={kindOf(wild_pick.iconic_taxon_name, wild_pick.archetype)} size={44} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>
                    {displayName(wild_pick.common_name)}
                  </span>
                  <span style={{ display: "block", fontStyle: "italic", fontSize: 11.5, color: "rgba(31,32,34,0.6)" }}>
                    {wild_pick.scientific_name}
                  </span>
                  <span style={{ display: "block", fontSize: 11, color: "var(--ui-accent)", fontWeight: 700, marginTop: 3 }}>
                    Selected · from the campus sweep, not the guide&rsquo;s nine
                  </span>
                </span>
              </span>
            </div>
          )}
          {picker_order.map((species_code, i) => {
            const sp = species[species_code];
            const is_active = species_code === pick_code;
            return (
              <button
                key={species_code}
                onClick={() => onPick(species_code)}
                className="w-full flex items-center justify-between"
                style={{
                  padding: "12px 14px",
                  /* Selection is a chrome state. The species' own ecology colour
                     is carried by its pill and its thumb ring, which is where it
                     means something. */
                  background: is_active ? "rgba(21,77,48,0.08)" : "transparent",
                  borderTop: i === 0 ? "none" : "1px solid #E4E7E8",
                  textAlign: "left",
                }}
              >
                <span className="flex items-center gap-3">
                  <TaxonThumb species_code={species_code} size={44} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>
                      {sp.common_name}
                    </span>
                    <span style={{ display: "block", fontStyle: "italic", fontSize: 11.5, color: "rgba(31,32,34,0.6)" }}>
                      {sp.scientific_name}
                    </span>
                  </span>
                </span>
                <PrimaryPill sp={sp} />
              </button>
            );
          })}
          {/* The list is nine species. Campus has far more, and a student who
              cannot say what they saw currently has nowhere to put it. */}
          <button
            onClick={() => setReporting((prev) => !prev)}
            className="w-full flex items-center justify-between"
            style={{
              padding: "12px 14px",
              background: is_reporting ? "rgba(7,93,137,0.08)" : "transparent",
              borderTop: "1px solid #E4E7E8",
              textAlign: "left",
            }}
          >
            <span style={{ minWidth: 0 }}>
              <span style={{ display: "block", fontWeight: 700, fontSize: 15, lineHeight: 1.2 }}>
                It is not on this list
              </span>
              <span style={{ display: "block", fontSize: 11.5, color: "rgba(31,32,34,0.6)", marginTop: 2 }}>
                Report a tree the guide does not have
              </span>
            </span>
            <Pill tone="info">{is_reporting ? "Reporting" : "Report"}</Pill>
          </button>
        </div>

        {is_reporting && (
          <div
            style={{
              marginTop: 12,
              padding: "12px 14px",
              borderRadius: 16,
              border: "1.5px solid #BBD9EA",
              background: "#F2F8FC",
            }}
          >
            <label style={{ display: "block" }}>
              <span style={{ fontSize: 13.5, fontWeight: 700, display: "block" }}>
                What would you call it?
              </span>
              <span style={{ fontSize: 11.5, color: "rgba(31,32,34,0.55)", display: "block", marginTop: 2 }}>
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
                  border: "1.5px solid #BBD9EA",
                  background: "#fff",
                  padding: "10px 12px",
                  fontSize: 14,
                  fontFamily: "inherit",
                }}
              />
            </label>
            <p style={{ fontSize: 11, color: "rgba(31,32,34,0.55)", marginTop: 8, lineHeight: 1.4 }}>
              This saves as a report, not as a species badge, and leaves the export tagged that way. It is not
              added to the guide — nobody here is deciding what a tree is.
            </p>
          </div>
        )}

        <label style={{ display: "block", marginTop: 16 }}>
          {/* Asked as a question rather than labelled as a field: a student who
              is prompted to look writes something, a student shown an empty box
              usually does not. It stays optional, and an entry saved without
              one renders clean. */}
          <span style={{ fontSize: 13.5, fontWeight: 700, display: "block" }}>
            What did you notice?
          </span>
          <span style={{ fontSize: 11.5, color: "rgba(31,32,34,0.5)", display: "block", marginTop: 2 }}>
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
              border: "1.5px solid #E4E7E8",
              background: "#fff",
              padding: "10px 12px",
              fontSize: 14,
              fontFamily: "inherit",
              resize: "vertical",
            }}
          />
        </label>

        <p style={{ fontSize: 12, color: "rgba(31,32,34,0.65)", marginTop: 14, lineHeight: 1.45 }}>
          iNaturalist is identifying, not this app. Ateneo already published an invasive-species image classifier (Aliño,
          Fernandez, Diesmos 2023) — we are not rebuilding that either. For a second opinion, open Seek, or on iPhone Look Up
          the photo in Photos. The journal stays on this device.{" "}
          <a href={SEEK_URL} target="_blank" rel="noreferrer" style={{ color: "#058CD6", textDecoration: "underline", fontWeight: 700 }}>
            Open Seek
          </a>
        </p>
        <button
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
            })
          }
          style={{ width: "100%", height: 48, borderRadius: 12, background: "var(--ui-accent)", color: "#fff", fontWeight: 700, fontSize: 15, marginTop: 16 }}
        >
          {is_reporting ? "Save this report" : "Save to my journal"}
        </button>
      </div>
    </div>
  );
}

/**
 * Collection grid — Seek's shape: one circular badge per species, colour when
 * seen, grey silhouette when not. A badge is a fact about your own walking, not
 * a score, so nothing here counts up against anybody else.
 */
function JournalGrid({ seen, is_desktop }: { seen: Set<string>; is_desktop: boolean }) {
  return (
    <div
      className="grid gap-x-3 gap-y-5"
      style={{ gridTemplateColumns: `repeat(${is_desktop ? 5 : 3}, minmax(0, 1fr))` }}
    >
      {journal_order.map((species_code) => {
        const sp = species[species_code];
        const is_seen = seen.has(species_code) && Boolean(sp);
        return (
          <div key={species_code} style={{ textAlign: "center", minWidth: 0 }}>
            <TaxonThumb
              species_code={species_code}
              size={is_desktop ? 104 : 92}
              is_dim={!is_seen}
              style={{ margin: "0 auto" }}
            />
            {is_seen ? (
              <>
                <div style={{ fontWeight: 800, fontSize: 13, marginTop: 8, lineHeight: 1.2 }}>{sp.common_name}</div>
                <div
                  style={{
                    fontStyle: "italic",
                    fontSize: 10.5,
                    color: "rgba(31,32,34,0.55)",
                    marginTop: 2,
                    lineHeight: 1.25,
                  }}
                >
                  {sp.scientific_name}
                </div>
                <div style={{ marginTop: 6, display: "flex", justifyContent: "center" }}>
                  <PrimaryPill sp={sp} />
                </div>
              </>
            ) : (
              <div style={{ fontSize: 11.5, fontWeight: 700, color: "rgba(31,32,34,0.5)", marginTop: 8 }}>
                Not yet
              </div>
            )}
          </div>
        );
      })}
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
                <span style={{ color: "rgba(31,32,34,0.6)" }}>{row.count}</span>
              </div>
              <div style={{ height: 6, borderRadius: 999, background: "#EEF1F0", marginTop: 4 }}>
                <div style={{ width: `${width}%`, height: "100%", borderRadius: 999, background: "var(--grad-forest)" }} />
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
      <p style={{ fontSize: 11.5, color: "rgba(31,32,34,0.5)", marginTop: 14, lineHeight: 1.4 }}>
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
      <p style={{ fontSize: 12, color: "rgba(31,32,34,0.6)", marginTop: 8, lineHeight: 1.4 }}>
        Nothing leaves this device on its own. These buttons write a file you choose to share. Photos are not included.
      </p>
      <div className="flex gap-2" style={{ marginTop: 12 }}>
        <button
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
            borderRadius: 12,
            border: "1.5px solid #E4E7E8",
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
          type="button"
          disabled={sighting.length === 0}
          onClick={() => downloadText(`field-guide-sighting-${stamp}.csv`, toCsv(sighting), "text/csv")}
          style={{
            flex: 1,
            height: 44,
            borderRadius: 12,
            border: "1.5px solid #E4E7E8",
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
      <p style={{ fontSize: 11, color: "rgba(31,32,34,0.5)", marginTop: 6, lineHeight: 1.4 }}>{LOCAL_OBS_STATUS_NOTE}</p>
      <div style={{ marginTop: 8, border: "1.5px solid #E4E7E8", borderRadius: 20, overflow: "hidden", background: "#fff" }}>
        {row.map((s, i) => {
          const sp = species[s.species_code];
          const status = localObsStatus({
            photo_data: s.photo_data,
            species_code: s.species_code,
            prior_same_species: prior_count(s.species_code, s.sighting_id),
          });
          return (
            <div
              key={s.sighting_id}
              className="flex items-start gap-3"
              style={{ padding: "12px 14px", borderTop: i === 0 ? "none" : "1px solid #E4E7E8" }}
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
                  <Pill tone={status === "verified" ? "native" : status === "duplicate" ? "threatened" : "info"}>
                    {LOCAL_OBS_STATUS_LABEL[status]}
                  </Pill>
                  {/* The catalogue number is assigned once and never reissued, so
                      an entry a student cites today is the same one tomorrow. */}
                  <span
                    style={{
                      fontSize: 11,
                      fontVariantNumeric: "tabular-nums",
                      color: "rgba(31,32,34,0.42)",
                      letterSpacing: 0.3,
                    }}
                  >
                    №{String(s.entry_index).padStart(4, "0")}
                  </span>
                </div>
                <div style={{ fontSize: 11.5, color: "rgba(31,32,34,0.55)", marginTop: 2 }}>
                  {s.created_at ? new Date(s.created_at).toLocaleString() : "—"}
                </div>
                <div style={{ fontSize: 11.5, color: "rgba(31,32,34,0.6)", marginTop: 3 }}>
                  {s.lat !== null && s.lon !== null ? (
                    <>
                      {formatLatLon({ lat: s.lat, lon: s.lon })}
                      {s.accuracy_m !== null && ` · ±${Math.round(s.accuracy_m)} m`}
                      {s.fix_source === "demo" && " · demo walk"}
                    </>
                  ) : (
                    "no position recorded"
                  )}
                </div>
                {s.note && (
                  <div style={{ fontSize: 12.5, color: "rgba(31,32,34,0.8)", marginTop: 5, lineHeight: 1.4 }}>{s.note}</div>
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
        background: "rgba(20,26,22,0.42)",
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
          background: "#fff",
          borderRadius: is_desktop ? CARD_RADIUS : `${CARD_RADIUS}px ${CARD_RADIUS}px 0 0`,
          padding: 20,
          maxHeight: "88vh",
          overflowY: "auto",
        }}
      >
        <Eyebrow>WALK ENDED</Eyebrow>
        <h2 style={{ fontWeight: 800, fontSize: 22, marginTop: 6 }}>
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
              <span style={{ fontSize: 12.5, color: "rgba(31,32,34,0.55)" }}>
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
              <p style={{ fontSize: 12.5, fontWeight: 700, color: "var(--ui-accent)", marginTop: 6 }}>
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
              background: "#FFF6E5",
              color: "#7A5A12",
            }}
          >
            This walk was driven by the demo loop, not by a device fix. The distance and areas above are the
            demo route&rsquo;s, not yours.
          </p>
        )}

        <p style={{ fontSize: 11.5, color: "rgba(31,32,34,0.5)", marginTop: 14, lineHeight: 1.4 }}>
          Counts only — no score, no rank, and nothing here is compared to anybody else&rsquo;s walk.
        </p>

        <div className="flex gap-2" style={{ marginTop: 16 }}>
          <button
            onClick={onJournal}
            style={{
              flex: 1,
              height: 46,
              borderRadius: 999,
              border: "none",
              background: "var(--grad-forest)",
              color: "#fff",
              fontWeight: 800,
              fontSize: 14.5,
            }}
          >
            View in journal
          </button>
          <button
            onClick={onDismiss}
            style={{
              height: 46,
              padding: "0 18px",
              borderRadius: 999,
              border: "1.5px solid #E4E7E8",
              background: "#fff",
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
    <div
      className="absolute inset-0"
      style={{ zIndex: 80, display: "grid", placeItems: "center" }}
      onClick={onDismiss}
    >
      <div className="absolute inset-0" style={{ background: "rgba(20,26,22,0.5)" }} />
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
              background: "linear-gradient(145deg, #FDF6E3, #EBDCBB)",
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
            className={prefers_reduced ? "" : "yc-reveal-in"}
            style={{
              animation: prefers_reduced ? undefined : "yc-reveal-in 0.6s ease-out forwards",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Suspense fallback={<Character stage={stage} vigor={1} size={120} is_idle_animated />}>
              <CharacterModel stage={stage} size={120} />
            </Suspense>
            {cosmetic && (
              <>
                <div style={{ marginTop: 4, fontWeight: 800, fontSize: 18, color: "#1F2022" }}>
                  {cosmetic.name}
                </div>
                <div style={{ fontSize: 13, color: "rgba(31,32,34,0.6)", maxWidth: 260, lineHeight: 1.4 }}>
                  {cosmetic.blurb}
                </div>
              </>
            )}
            <button
              onClick={onDismiss}
              style={{
                marginTop: 10,
                height: 40,
                padding: "0 24px",
                borderRadius: 999,
                background: "var(--grad-forest)",
                color: "#fff",
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
  return (
    <Card style={{ display: "flex", gap: is_desktop ? 22 : 16, alignItems: "stretch" }}>
      <div
        style={{
          flexShrink: 0,
          display: "grid",
          placeItems: "center",
          borderRadius: RADIUS.tile,
          background: "rgba(0,134,83,0.06)",
          border: "1px solid rgba(0,134,83,0.18)",
          padding: is_desktop ? "14px 20px" : "12px 16px",
        }}
      >
        <Suspense
          fallback={<Character stage={p.stage} vigor={p.vigor} size={is_desktop ? 108 : 92} is_idle_animated />}
        >
          <CharacterModel stage={p.stage} size={is_desktop ? 108 : 92} />
        </Suspense>
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="flex items-baseline gap-2">
          <Eyebrow>YOUR GROWTH · BIODIVERSITY BUDDY</Eyebrow>
          <span style={{ fontSize: 11, color: "rgba(31,32,34,0.45)", marginLeft: "auto" }}>
            {gamify.total_points} pts · {gamify.streak_weeks} wk
          </span>
        </div>
        <div className="flex items-baseline gap-2" style={{ marginTop: 4 }}>
          <div style={{ fontWeight: 800, fontSize: is_desktop ? 24 : 20 }}>{stage_label}</div>
          {p.sector_seen_count > 0 && (
            <span style={{ fontSize: 12.5, color: "rgba(31,32,34,0.6)" }}>
              · {p.sector_seen_count} {p.sector_seen_count === 1 ? "area" : "areas"} walked
            </span>
          )}
        </div>

        <div className="flex gap-2" style={{ marginTop: 12 }}>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              borderRadius: RADIUS.tile,
              border: "1.5px solid rgba(0,134,83,0.3)",
              background: "rgba(0,134,83,0.06)",
              padding: "9px 11px",
            }}
          >
            <div style={{ fontSize: 9.5, fontWeight: 800, color: "var(--ui-accent)", letterSpacing: "0.02em" }}>
              BADGES
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{p.badge_count}</div>
            <div style={{ fontSize: 10, color: "rgba(31,32,34,0.5)", marginTop: 1 }}>
              {p.seen_count} species photographed
            </div>
          </div>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              borderRadius: RADIUS.tile,
              border: "1.5px solid rgba(5,140,214,0.28)",
              background: "rgba(5,140,214,0.06)",
              padding: "9px 11px",
            }}
          >
            <div style={{ fontSize: 9.5, fontWeight: 800, color: "#075D89", letterSpacing: "0.02em" }}>
              CONTRIBUTIONS
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, marginTop: 2 }}>{p.contribution_count}</div>
            <div style={{ fontSize: 10, color: "rgba(31,32,34,0.5)", marginTop: 1 }}>
              reports AIS does not have
            </div>
          </div>
        </div>

        {/* Two counters, never one score: the two ways to earn stay side by
            side, so a student can see how they grew without reading it as a
            rank against anyone else. */}
        <div style={{ marginTop: 12 }}>
          <div className="flex items-center justify-between" style={{ fontSize: 12.5 }}>
            <span style={{ fontWeight: 700, color: "rgba(31,32,34,0.78)" }}>
              {next ? `To ${STAGE_LABEL[next.stage]}` : "Fully grown"}
            </span>
            <span style={{ color: "rgba(31,32,34,0.6)", fontVariantNumeric: "tabular-nums" }}>
              {next ? `${p.sector_seen_count}/${next_total}` : "—"}
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 999, background: "#EEF1F0", marginTop: 5 }}>
            <div
              style={{
                width: `${ratio * 100}%`,
                height: "100%",
                borderRadius: 999,
                background: "var(--grad-forest)",
                transition: "width .3s ease",
              }}
            />
          </div>
        </div>
        <BuddyLine snap={gamify} />
        <p style={{ fontSize: 11, color: "rgba(31,32,34,0.5)", marginTop: 10, lineHeight: 1.4 }}>
          Personal progression on this device. Local demo leaderboard is seeded for the showcase — not an official AIS rank.
        </p>
      </div>
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
}) {
  const summary = summarize(sighting);
  const seen_of_total = `${summary.species_count} of ${summary.species_total} species seen`;
  /* Finds off the guide's nine are counted beside the fraction, never inside
     it — the two are different universes and folding them together produced
     "12 of 9". */
  const wild_line =
    summary.wild_species_count > 0
      ? `+ ${summary.wild_species_count} more from the campus sweep`
      : null;
  if (seen.size === 0) {
    return (
      <div
        className="scroll-soft"
        style={{
          height: "100%",
          overflowY: "auto",
          background: "var(--brand-mist)",
          padding: is_desktop ? "40px 72px" : "20px 20px 80px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "flex-start",
          paddingTop: is_desktop ? 48 : 28,
        }}
      >
        <div
          style={{
            textAlign: "center",
            maxWidth: 380,
            background: "#fffef9",
            border: "1.5px solid rgba(21,77,48,0.12)",
            borderRadius: CARD_RADIUS,
            boxShadow: "var(--shadow-card)",
            padding: is_desktop ? "36px 40px" : "28px 22px",
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 999,
              margin: "0 auto",
              background: "rgba(62,154,94,0.14)",
              display: "grid",
              placeItems: "center",
            }}
          >
            <img src={spot.empty_journal} width={52} height={52} alt="" />
          </div>
          <p style={{ fontWeight: 800, fontSize: is_desktop ? 22 : 19, marginTop: 16, color: "var(--brand-forest)", lineHeight: 1.25 }}>
            Your journal is waiting.
          </p>
          <p style={{ fontSize: 14, color: "rgba(31,32,34,0.72)", marginTop: 10, lineHeight: 1.5 }}>
            Walk a path, notice a tree, and log what you see. Magisphere is about rediscovering home — reflection, not a race.
          </p>
          <p style={{ fontSize: 11.5, color: "rgba(31,32,34,0.5)", marginTop: 14, lineHeight: 1.45 }}>
            Ateneo already designed an SDG game that way (Rodrigo, Favis, Cuyegkeng 2021 — RECIPE / Meaningful Gamification).
          </p>
        </div>
        <div style={{ width: "100%", maxWidth: 420, marginTop: 18 }}>
          <PointsStreakCard snap={gamify} is_desktop={is_desktop} />
        </div>
        <div style={{ width: "100%", maxWidth: 420, marginTop: 12 }}>
          <ChallengesCard snap={gamify} />
        </div>
        <div style={{ width: "100%", maxWidth: 420, marginTop: 12 }}>
          <LocalLeaderboardCard snap={gamify} is_desktop={is_desktop} />
        </div>
      </div>
    );
  }
  return (
    <div
      className="scroll-soft"
      style={{
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
        background: "var(--brand-cream, #f7faf6)",
        padding: is_desktop ? "40px 72px 48px" : "18px 20px 80px",
      }}
    >
      <div style={{ maxWidth: is_desktop ? 720 : undefined, margin: is_desktop ? "0 auto" : undefined }}>
        <div className="flex items-center gap-3">
          <img src={spot.success_log} width={56} height={56} alt="" />
          <h1 style={{ fontWeight: 800, fontSize: is_desktop ? 30 : 24, color: "var(--brand-forest)" }}>Your journal</h1>
        </div>
        <p style={{ fontSize: 13, color: "var(--ui-accent)", marginTop: 2 }}>Stays on this phone.</p>
        {/* The deck's own AV checklist says to seed the journal AND say it is
            seeded. Saying it in a banner beats relying on a nervous presenter
            remembering the sentence at 9am. */}
        {is_seeded && (
          <p
            style={{
              fontSize: 12,
              lineHeight: 1.45,
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: 14,
              background: "#FFF6E5",
              color: "#7A5A12",
              fontWeight: 700,
            }}
          >
            Demonstration journal. These finds were seeded for the showcase — nobody walked them.
            Open the app without <code>?seed=demo</code> for an empty journal.
          </p>
        )}
        <p style={{ fontSize: 12, color: "rgba(31,32,34,0.55)", marginTop: 8, lineHeight: 1.45 }}>
          Reflection, not a race. Ateneo already designed an SDG game that way (Rodrigo, Favis, Cuyegkeng 2021 — RECIPE /
          Meaningful Gamification).
        </p>
        <div style={{ marginTop: 16 }}>
          <ProgressCard sighting={sighting} is_desktop={is_desktop} gamify={gamify} />
        </div>
        <div style={{ marginTop: 12 }}>
          <PointsStreakCard snap={gamify} is_desktop={is_desktop} />
        </div>
        <div style={{ marginTop: 12 }}>
          <ChallengesCard snap={gamify} />
        </div>
        <div style={{ marginTop: 12 }}>
          <LocalLeaderboardCard snap={gamify} is_desktop={is_desktop} />
        </div>
        <div style={{ marginTop: 16 }}>
          <SummaryStrip sighting={sighting} pool={pool} />
        </div>
        <div className="flex items-baseline justify-between gap-3" style={{ marginTop: 24 }}>
          <Eyebrow>YOUR COLLECTION</Eyebrow>
          {/* Seen of findable, not seen of grid slots. The denominator is the
              curated starter list; padded slots have no species behind them. */}
          <span style={{ textAlign: "right" }}>
            <span
              style={{
                display: "block",
                fontSize: 12.5,
                fontWeight: 700,
                color: "var(--ui-accent)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {seen_of_total}
            </span>
            {wild_line && (
              <span style={{ display: "block", fontSize: 11, color: "rgba(31,32,34,0.55)", marginTop: 2 }}>
                {wild_line}
              </span>
            )}
          </span>
        </div>
        <div style={{ marginTop: 14 }}>
          <JournalGrid seen={seen} is_desktop={is_desktop} />
        </div>
        <p style={{ fontSize: 12, color: "rgba(31,32,34,0.55)", marginTop: 14 }}>
          A starter list — not the 1,809. Your own count only; nobody else&rsquo;s journal is in this number.
        </p>
        <div style={{ marginTop: 26 }}>
          <WildShelf sighting={sighting} pool={pool} curated={picker_order} is_desktop={is_desktop} />
        </div>
        <div style={{ marginTop: 26 }}>
          <BadgeShelf sighting={sighting} pool_count={pool_count} is_desktop={is_desktop} />
        </div>
        <div style={{ marginTop: 20 }}>
          <WorldStrip sighting={sighting} />
        </div>
        <SightingLog sighting={sighting} />
        <ExportRow sighting={sighting} />
      </div>
    </div>
  );
}

function PlanContent() {
  return (
    <>
      <h1 style={{ fontWeight: 800, fontSize: 24, lineHeight: 1.15 }}>What happens after the walk</h1>
      <div style={{ width: 48, height: 4, borderRadius: 999, background: "var(--grad-lagoon)", marginTop: 12 }} />
      <section style={{ marginTop: 20, borderRadius: 24, border: "1.5px solid #E4E7E8", padding: 16 }}>
        <Eyebrow>1 · WHAT THIS WEBSITE IS FOR</Eyebrow>
        <p style={{ fontSize: 14.5, lineHeight: 1.5, marginTop: 8 }}>
          Formation, first: help students notice and name the trees they walk under every day. And a public map they can
          actually use — not a report that sits in a drawer.
        </p>
      </section>
      <section style={{ marginTop: 16, borderRadius: 24, border: "1.5px solid #E4E7E8", padding: 16 }}>
        <Eyebrow>2 · WHO WE STILL NEED TO TALK TO</Eyebrow>
        <p style={{ fontSize: 12, color: "rgba(31,32,34,0.6)", marginTop: 6 }}>
          Nothing here is agreed yet. We are not claiming a consultation we have not held.
        </p>
        <div
          style={{
            marginTop: 10,
            borderRadius: 16,
            background: "rgba(0,134,83,0.06)",
            border: "1px solid rgba(0,134,83,0.25)",
            padding: "12px 14px",
          }}
        >
          <p style={{ fontSize: 13, lineHeight: 1.45 }}>{AIS_GAP_NOTE}</p>
          <p style={{ fontSize: 13, lineHeight: 1.45, marginTop: 8 }}>{WILD_NOTE}</p>
        </div>
        <div style={{ marginTop: 8 }}>
          {consult.map((row) => (
            <div key={row.consult_id} style={{ padding: "12px 0", borderTop: "1px solid #E4E7E8" }}>
              <div className="flex items-start justify-between gap-3">
                <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.35 }}>{row.label}</span>
                <Pill tone="exotic">not yet</Pill>
              </div>
              {row.detail && (
                <p style={{ fontSize: 12, color: "rgba(31,32,34,0.6)", marginTop: 6, lineHeight: 1.4 }}>{row.detail}</p>
              )}
            </div>
          ))}
        </div>
      </section>
      <section style={{ marginTop: 16, borderRadius: 24, border: "1.5px solid #E4E7E8", padding: 16 }}>
        <Eyebrow>3 · THE BIOMES — THE MAP CUT INTO AREAS</Eyebrow>
        <p style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 8 }}>
          Since the 09-02 pulong the unit of play is the area, not the tree — and since 09-03 those areas are cut{" "}
          <strong style={{ fontWeight: 700 }}>along the real roads and footpaths</strong>, not drawn by us. Each sector
          below is a face of the OpenStreetMap way network (ODbL), the way a city block is defined by its streets.
        </p>
        <p style={{ fontSize: 13, lineHeight: 1.5, marginTop: 8, color: "rgba(31,32,34,0.7)" }}>
          How green each one is was <strong style={{ fontWeight: 700 }}>measured off satellite imagery</strong>, not
          guessed from the absence of a building — which is what used to paint car parks as lawn. Species lists stay
          provisional until the AIS inventory lands ({aisDueNote()}).
        </p>
        <div style={{ marginTop: 10 }}>
          {[...sector_row]
            .sort((a, b) => b.area_m2 - a.area_m2)
            .slice(0, 14)
            .map((row) => (
              <div key={row.sector_code} style={{ padding: "10px 0", borderTop: "1px solid #E4E7E8" }}>
                <div className="flex items-start justify-between gap-3">
                  <span style={{ fontSize: 14, fontWeight: 500, lineHeight: 1.35 }}>
                    {row.name}
                    <span style={{ display: "block", fontSize: 11.5, color: "rgba(31,32,34,0.55)", marginTop: 2 }}>
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
        <p style={{ fontSize: 12, color: "rgba(31,32,34,0.55)", marginTop: 10, lineHeight: 1.4 }}>
          {sector_row.length} sectors cut in total, {biome_sector.length} of them vegetated enough to walk into and look
          at a plant. The rest are drawn as the paved ground they are — showing them as lawn would be the lie this
          replaced. {sector_row.filter((r) => r.is_named_by_us).length} carry a name we chose because OpenStreetMap has
          none for that ground.
        </p>
      </section>
      <section style={{ marginTop: 16, borderRadius: 24, border: "1.5px solid #E4E7E8", padding: 16 }}>
        <Eyebrow>4 · HOW ANOTHER CAMPUS COPIES THIS</Eyebrow>
        <ul style={{ marginTop: 8, paddingLeft: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            "A walkable-path map — only where students can actually go.",
            "A curated species list from whoever already counted.",
            "A personal journal with no rank.",
            "A geofence for off-limits ground.",
          ].map((t) => (
            <li key={t} style={{ fontSize: 14.5, lineHeight: 1.45, display: "flex", gap: 10 }}>
              <span style={{ color: "#45C223", fontWeight: 800 }}>—</span>
              <span>{t}</span>
            </li>
          ))}
        </ul>
        <p style={{ fontSize: 13, lineHeight: 1.45, marginTop: 12, color: "rgba(31,32,34,0.75)" }}>
          Ateneo sits in AUN ecological-education networks (Delocado, Tuaño, Lacdao-Umali 2025) — that is a carrier, not a
          second app.
        </p>
      </section>
      <p style={{ fontSize: 11, color: "rgba(31,32,34,0.5)", marginTop: 26, lineHeight: 1.4 }}>
        Youth CLAP 2026 · student prototype · not an official AIS product.
      </p>
    </>
  );
}

function PlanScreen({ is_desktop }: { is_desktop: boolean }) {
  return (
    <div
      className="scroll-soft"
      style={{
        height: "100%",
        overflowY: "auto",
        overflowX: "hidden",
        background: "#F9F9F9",
        padding: is_desktop ? "40px 72px" : "18px 20px 80px",
      }}
    >
      <div style={{ maxWidth: 720, margin: is_desktop ? "0 auto" : undefined }}>
        <PlanContent />
      </div>
    </div>
  );
}

/**
 * The desktop shell: a persistent left rail, the map filling the centre, and
 * the encounter + citations in a right column.
 *
 * This replaces a top bar. The reason is the projector: at 1440 px a
 * horizontal header spends the scarcest axis — vertical — on navigation that
 * never changes, and the map is the thing the room came to see. A rail spends
 * the abundant axis instead. Every control the header carried is still here,
 * in one place, and the phone is untouched: it keeps its bottom nav.
 */
function DesktopRail({
  route,
  onRoute,
  is_demo,
  onDemo,
  seen_count,
  is_wide,
}: {
  route: Route;
  onRoute: (r: Route) => void;
  is_demo: boolean;
  onDemo: () => void;
  seen_count: number;
  is_wide: boolean;
}) {
  /* Same four glyphs as the phone. A desktop menu of bare words read like a
     different product, and the kit already had the icons. */
  const tab: { id: Route; label: string; Icon: typeof HomeIcon }[] = [
    { id: "/", label: "Home", Icon: HomeIcon },
    { id: "/map", label: "Map", Icon: MapIcon },
    { id: "/journal", label: "Journal", Icon: JournalIcon },
    { id: "/plan", label: "Plan", Icon: PlanIcon },
  ];
  return (
    <nav
      className="flex flex-col"
      style={{
        width: is_wide ? 232 : 196,
        flexShrink: 0,
        height: "100%",
        background: "var(--brand-cream, #f7faf6)",
        borderRight: "1.5px solid rgba(21,77,48,0.10)",
        padding: "22px 16px 18px",
      }}
    >
      <button
        onClick={() => onRoute("/")}
        className="flex items-center gap-2.5"
        style={{ textAlign: "left", padding: "0 6px" }}
      >
        <BrandLockup mark_size={32} title_size={17} />
      </button>

      <div className="flex flex-col" style={{ gap: 4, marginTop: 26 }}>
        {tab.map(({ id, label, Icon }) => {
          const is_active = route === id;
          return (
            <button
              key={id}
              onClick={() => onRoute(id)}
              aria-current={is_active ? "page" : undefined}
              className="flex items-center gap-2.5"
              style={{
                fontWeight: 700,
                fontSize: 14.5,
                color: is_active ? "var(--ui-accent)" : "rgba(31,32,34,0.72)",
                background: is_active ? "rgba(21,77,48,0.12)" : "transparent",
                borderRadius: 14,
                padding: "10px 12px",
                textAlign: "left",
                width: "100%",
                transition: "background .18s ease, color .18s ease",
              }}
            >
              <Icon size={19} active={is_active} />
              {label}
              {/* Active state is carried by the left bar as well as the wash,
                  so the current route is readable in greyscale too. */}
              {is_active && (
                <span
                  style={{
                    marginLeft: "auto",
                    width: 4,
                    height: 18,
                    borderRadius: 999,
                    background: "var(--ui-accent)",
                  }}
                />
              )}
            </button>
          );
        })}
      </div>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* A real number from the real journal — never a dead locale switcher. */}
        <button
          onClick={() => onRoute("/journal")}
          className="flex items-center gap-1.5"
          style={{ fontSize: 12.5, fontWeight: 700, color: "rgba(31,32,34,0.62)", padding: "0 6px" }}
        >
          <JournalIcon size={17} active={false} />
          {seen_count} logged
        </button>
        <Chip is_on={is_demo} onClick={onDemo}>
          <LocateIcon size={15} />
          Demo campus
        </Chip>
        <p style={{ fontSize: 10.5, color: "rgba(31,32,34,0.42)", lineHeight: 1.35, padding: "0 6px" }}>
          Youth CLAP 2026 · student prototype · not an official AIS product.
        </p>
      </div>
    </nav>
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
        background: "rgba(249,249,249,0.93)",
        border: "1.5px solid #E4E7E8",
        borderRadius: 16,
        padding: "9px 12px",
        boxShadow: "var(--shadow-card)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div className="flex items-start gap-2">
        <span style={{ flexShrink: 0, marginTop: 1 }}>
          <RestrictedIcon size={17} />
        </span>
        <div style={{ fontSize: 11, lineHeight: 1.35 }}>
          {is_desktop ? (
            <>
              <strong style={{ fontWeight: 700 }}>Observed from the path.</strong> That grove is off-limits and nothing
              spawns inside it. The hatched shape is a placeholder extent — nobody has given us the surveyed boundary.
            </>
          ) : (
            <>
              <strong style={{ fontWeight: 700 }}>Off-limits grove.</strong> Nothing spawns inside. Hatch is a
              placeholder, not surveyed.
            </>
          )}
        </div>
      </div>
      {layer === "satellite" && is_desktop && (
        <div
          style={{
            fontSize: 10.5,
            lineHeight: 1.35,
            color: "rgba(31,32,34,0.6)",
            marginTop: 7,
            paddingTop: 7,
            borderTop: "1px solid #E4E7E8",
          }}
        >
          Canopy here is the imagery itself — we compute no green-cover layer. The urban-canopy and heat claim is
          Llorin et al. 2024 (Manila Observatory).
        </div>
      )}
    </div>
  );
}

function Toast({ msg }: { msg: string }) {
  return (
    <div
      className="absolute"
      style={{
        left: "50%",
        bottom: 84,
        transform: "translateX(-50%)",
        background: "#F9F9F9",
        border: "1.5px solid #E4E7E8",
        borderRadius: 999,
        padding: "12px 18px",
        fontSize: 13,
        fontWeight: 700,
        boxShadow: "var(--shadow-card)",
        zIndex: 70,
        whiteSpace: "nowrap",
        animation: "fgfade .25s ease-out",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <CheckIcon size={20} />
      {msg}
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
    <div
      role="dialog"
      aria-label={row.name}
      className="absolute"
      style={{
        left: is_desktop ? 18 : 0,
        right: is_desktop ? "auto" : 0,
        width: is_desktop ? 380 : undefined,
        bottom: is_desktop ? 84 : 64,
        zIndex: 48,
        background: "#FFFFFF",
        border: "1.5px solid #E7EBE6",
        borderRadius: is_desktop ? 24 : "24px 24px 0 0",
        boxShadow: "0 -8px 34px rgba(24,38,20,0.20)",
        display: "grid",
        gap: 14,
        padding: is_desktop ? `${PAD}px` : `10px ${PAD}px ${PAD}px`,
      }}
    >
      {!is_desktop && (
        <div style={{ justifySelf: "center", width: 40, height: 4, borderRadius: 999, background: "#DCE2D9" }} />
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.2, letterSpacing: -0.2 }}>{row.name}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            <Tag>{row.kind.replace(/-/g, " ")}</Tag>
            <Tag>{(row.area_m2 / 10000).toFixed(2)} ha</Tag>
            {veg_percent !== null && <Tag tone={veg_percent >= 45 ? "green" : "grey"}>{veg_percent}% green</Tag>}
          </div>
        </div>
        <button
          aria-label="Close"
          onClick={onDismiss}
          style={{
            width: 34,
            height: 34,
            borderRadius: 999,
            border: "1.5px solid #E7EBE6",
            background: "#FBFCFA",
            fontSize: 17,
            fontWeight: 700,
            lineHeight: 1,
            color: "rgba(31,32,34,0.55)",
            cursor: "pointer",
          }}
        >
          ×
        </button>
      </div>

      {resident.length > 0 ? (
        <div style={{ display: "grid", gap: 9 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: "rgba(31,32,34,0.55)" }}>
            On the walk list here · {progress.seen_count} logged · yours only
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {resident.map((e) => {
              const sp = species[e.species_code];
              if (!sp) return null;
              return (
                <button
                  key={e.encounter_id}
                  onClick={() => onLog(e.species_code)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 7,
                    background: "#F1F7EF",
                    border: "1.5px solid #D7E4D2",
                    borderRadius: 999,
                    padding: "9px 14px",
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {sp.common_name}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <p style={{ fontSize: 13, lineHeight: 1.5, color: "rgba(31,32,34,0.6)", margin: 0 }}>
          Nothing is on the walk list here yet — the AIS inventory ({aisDueNote()}) is the source that will name what grows in
          this sector. Log whatever you actually see.
        </p>
      )}

      <button
        onClick={() => onLog(resident[0]?.species_code ?? "narra")}
        style={{
          width: "100%",
          background: "#2F6B3A",
          color: "#fff",
          border: "none",
          borderRadius: 16,
          padding: "15px 16px",
          fontSize: 15,
          fontWeight: 800,
          cursor: "pointer",
          boxShadow: "0 4px 14px rgba(47,107,58,0.34)",
        }}
      >
        Log what you see here
      </button>

      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          justifySelf: "start",
          fontSize: 12,
          fontWeight: 700,
          color: "rgba(31,32,34,0.5)",
          background: "none",
          border: "none",
          padding: 0,
          textDecoration: "underline",
          cursor: "pointer",
        }}
      >
        {is_open ? "Hide sources" : "Where does this come from?"}
      </button>
      {is_open && (
        <p style={{ fontSize: 12, lineHeight: 1.55, color: "rgba(31,32,34,0.6)", margin: 0 }}>
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
  );
}

/** One measurement, one pill. Green only when it IS a greenness claim. */
function Tag({ children, tone = "grey" }: { children: React.ReactNode; tone?: "grey" | "green" }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: tone === "green" ? "#E8F3E4" : "#F2F3F1",
        color: tone === "green" ? "#2F6B3A" : "rgba(31,32,34,0.6)",
        border: `1px solid ${tone === "green" ? "#D2E6CC" : "#E7EBE6"}`,
        borderRadius: 999,
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
        <div style={{ minWidth: 0, pointerEvents: "auto" }}>{context}</div>
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
      {below && <div style={{ pointerEvents: "auto" }}>{below}</div>}
    </div>
  );
}

/** The card that says where you are. Same shell in both views. */
function ContextCard({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "rgba(255,255,255,0.94)",
        backdropFilter: "blur(8px)",
        border: "1.5px solid rgba(228,231,232,0.9)",
        borderRadius: 18,
        padding: "9px 15px",
        boxShadow: "0 4px 16px rgba(24,38,20,0.14)",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          letterSpacing: 0.7,
          textTransform: "uppercase",
          color: "rgba(31,32,34,0.45)",
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
  is_desktop,
}: {
  mode: "play" | "field";
  onMode: (m: "play" | "field") => void;
  is_desktop: boolean;
}) {
  const item: { id: "play" | "field"; label: string; hint: string }[] = [
    { id: "play", label: "Play", hint: "Walk the campus" },
    { id: "field", label: "Field", hint: "Layers and sources" },
  ];
  return (
    <div
      role="tablist"
      aria-label="Map mode"
      style={{
        display: "inline-flex",
        background: "#EDF1EA",
        border: "1.5px solid #DCE4D8",
        borderRadius: 999,
        padding: 3,
        gap: 2,
      }}
    >
      {item.map(({ id, label, hint }) => {
        const on = mode === id;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={on}
            title={hint}
            onClick={() => onMode(id)}
            style={{
              appearance: "none",
              border: "none",
              borderRadius: 999,
              padding: is_desktop ? "8px 20px" : "7px 16px",
              fontSize: is_desktop ? 13.5 : 13,
              fontWeight: 800,
              lineHeight: 1,
              cursor: "pointer",
              background: on ? "#2F6B3A" : "transparent",
              color: on ? "#FFFFFF" : "rgba(31,32,34,0.62)",
              boxShadow: on ? "0 2px 8px rgba(47,107,58,0.32)" : "none",
              transition: "background 120ms, color 120ms",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** Swing back to north. Doubles as the only sign that rotation exists. */
function Compass({ bearing, onReset }: { bearing: number; onReset: () => void }) {
  const off = Math.abs(((bearing % 360) + 540) % 360 - 180) < 179.5;
  return (
    <button
      aria-label={off ? "Face north" : "Facing north"}
      onClick={onReset}
      style={{
        width: 44,
        height: 44,
        borderRadius: 999,
        background: "rgba(255,255,255,0.94)",
        border: "1.5px solid rgba(228,231,232,0.95)",
        boxShadow: "0 4px 14px rgba(24,38,20,0.16)",
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
  const [view, setView] = useState<View>(() => ({ ...CAMPUS_CENTER, zoom: PLAY_ZOOM }));
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
  const [is_demo, setDemo] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [inat, setInat] = useState<InatNearbyState>({ status: "idle" });
  const [walk, setWalk] = useState<Walk | null>(() => readWalk());
  const [receipt, setReceipt] = useState<WalkReceipt | null>(null);
  /** The stage reached on this save, when that save advanced the stage. The
   *  blind-box reveal (T4.5) shows for this; null when there is no reveal. */
  const [reveal, setReveal] = useState<Stage | null>(null);
  /**
   * Which finds to draw. Empty means all of them — an explicit "off" state, so
   * a student who taps every chip off sees the whole map back rather than an
   * empty one. The restricted hatch is deliberately NOT in here: it is a place
   * you may not walk, not a preference, and filtering it away would hide the
   * one thing on the map that is a rule.
   */
  const [pin_filter, setPinFilter] = useState<Set<PinKind>>(() => new Set());
  const { is_desktop, is_wide } = useDesktop();
  const geo = useGeo(is_demo);
  /* The rotating world. One fetch of the real sweep, recomputed when the
     30-minute window rolls — see `live.tsx`. */
  const spawn_world = useSpawnWorld();

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
  const seen_sector = useMemo(() => seenSector(sighting), [sighting]);
  const stage = stageFor(seen_sector.size);
  const vigor = useMemo(() => vigorOf(sighting), [sighting]);
  const here_sector = useMemo(() => (geo.fix ? sectorAt(geo.fix) : null), [geo.fix]);

  const ranked = useMemo(() => (geo.fix ? rankEncounter(geo.fix) : []), [geo.fix]);
  const nearest = ranked[0] ?? null;
  const distance_of = (encounter_id: string) =>
    ranked.find((r) => r.row.encounter_id === encounter_id) ?? null;

  /* The pivot's card rule: inside a biome → its card, unless the walker pinned
     a tree (explicit intent wins, including the auto-pin inside 25 m). */
  const presence = useMemo(() => (geo.fix ? biomePresenceAt(geo.fix) : null), [geo.fix]);
  const showing_biome = presence !== null && pinned_id === null;

  /* Follow the walker until a gesture says otherwise. */
  useEffect(() => {
    if (!is_following || !geo.fix) return;
    setView((prev) => ({ ...prev, lat: geo.fix!.lat, lon: geo.fix!.lon }));
  }, [is_following, geo.fix?.lat, geo.fix?.lon]);

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

  const go = (next: Route) => {
    if (window.location.pathname !== next) {
      window.history.pushState({}, "", next);
    }
    setRoute(next);
    setCameraOpen(false);
    setCameraWhere(null);
    setCameraRarity(null);
    if (next !== "/map") setRestricted(true);
  };

  useEffect(() => {
    const onPop = () => setRoute(pathToRoute(window.location.pathname));
    window.addEventListener("popstate", onPop);
    if (window.location.pathname !== route) {
      window.history.replaceState({}, "", route);
    }
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

  const showToast = (m: string) => {
    setToast(m);
    window.setTimeout(() => setToast(null), 2000);
  };

  const noteAward = (
    kind: Parameters<typeof persistAward>[0],
    subject_key: string,
    toast_line?: string,
  ) => {
    const result = persistAward(kind, subject_key);
    if (result.awarded && result.event) {
      setPointEvents(result.events);
      showToast(toast_line ?? `+${result.event.points} ${POINT_LABEL[kind]}`);
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
    const reach = reachableSpawn(spawn_world.spawn, geo.fix).some((r) => r.spawn_id === row.spawn_id);
    if (reach) {
      openCamera(row.species_code, sectorByCode(row.sector_code)?.name, row.rarity);
      return;
    }
    setPickedSector(null);
    setPinnedId(null);
    setFollowing(false);
    setView((prev) => ({ ...prev, lat: row.lat, lon: row.lon, zoom: Math.max(prev.zoom, PLAY_ZOOM) }));
    go("/map");
    showToast(`${row.common_name} is out in ${sectorByCode(row.sector_code)?.name ?? row.sector_code}. Walk to it.`);
  };

  const saveSighting = ({ photo_data, inat: id, note, entry_kind, reported_name }: SaveInput) => {
    const is_report = entry_kind === "contribution";
    /* Stage before save — compared after to detect an advance (T4.5 trigger). */
    const prev_stage = stageFor(seenSector(sighting).size);
    const saved = addSighting({
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
    });
    const next_sighting = readSighting();
    setSighting(next_sighting);
    const award_kind = observeAwardKind({ photo_data, species_code: pick_code });
    noteAward(
      award_kind,
      `sighting:${pick_code}/${saved.sighting_id}`,
      award_kind === "verified_discovery"
        ? `+${POINT_VALUE.verified_discovery} Local verified discovery`
        : `+${POINT_VALUE.observe} Observe`,
    );
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
    ? `${formatLatLon(geo.fix)} · ±${Math.round(geo.fix.accuracy_m)} m · ${geo.fix.source === "demo" ? "demo walk" : "this device"}`
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
        <Chip is_on={is_demo} onClick={() => setDemo((d) => !d)}>
          <LocateIcon size={15} />
          {is_demo ? "Demo campus" : geo.status === "watching" ? "Live GPS" : "Real GPS"}
        </Chip>
      )}
      <Chip is_on={Boolean(walk)} tone="#075D89" onClick={toggleWalk}>
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
        <Chip tone="#75797B" onClick={() => setPinFilter(new Set())}>
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
      ? "You are outside the Loyola Heights frame — switch Demo campus on to show the walk here."
      : geo.fix
        ? `${formatLatLon(geo.fix)} · ±${Math.round(geo.fix.accuracy_m)} m`
        : "Waiting for a position…");


  /* ── the play view ────────────────────────────────────────────────────────
   *
   * Deliberately thin. Everything the field view carries — four basemap
   * presets, the path network, the canopy caption, every citation — is one tap
   * away and unchanged; what is gone from THIS screen is the four-chip row, the
   * coordinate pill and the layer counter, which is what "less cluttered ui"
   * asked for on 09-03.
   */
  const play_progress = toNextStage(seen_sector.size);
  const play_nearby = ranked.slice(0, 3);
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
        view={view}
        onView={setView}
        onGesture={() => setFollowing(false)}
        fix={geo.fix}
        seen_sector={seen_sector}
        stage={stage}
        vigor={vigor}
        is_desktop={is_desktop}
        is_restricted_on={is_restricted}
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
      />

      {/* Quiet HUD: corners only. No dense dashboard while walking. */}
      <MapChrome
        is_desktop={is_desktop}
        context={
          <div
            style={{
              background: "rgba(255,255,255,0.9)",
              backdropFilter: "blur(8px)",
              border: "1.5px solid rgba(228,231,232,0.9)",
              borderRadius: 999,
              padding: "7px 12px",
              boxShadow: "0 3px 12px rgba(24,38,20,0.12)",
              maxWidth: is_desktop ? 280 : 168,
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 0.6, color: "rgba(31,32,34,0.42)", textTransform: "uppercase" }}>
              {here_sector ? "Here" : "Walking"}
            </div>
            <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginTop: 1 }}>
              {here_sector ? here_sector.name : "Between sectors"}
            </div>
          </div>
        }
        control={
          <>
            <ModeSwitch mode={map_mode} onMode={setMode} is_desktop={is_desktop} />
            <Compass bearing={bearing} onReset={() => setBearing(0)} />
          </>
        }
      />

      {/* Bottom-left profile chip: points + streak only — gamification stays, chrome does not. */}
      <div
        className="absolute"
        style={{
          left: 12,
          bottom: is_desktop ? 22 : (is_sheet_open ? 22 : 112),
          zIndex: 30,
          display: "flex",
          alignItems: "center",
          gap: 8,
          background: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(8px)",
          border: "1.5px solid rgba(228,231,232,0.9)",
          borderRadius: 999,
          padding: "5px 12px 5px 5px",
          boxShadow: "0 4px 14px rgba(24,38,20,0.13)",
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            overflow: "hidden",
            background: "var(--brand-mist)",
            display: "grid",
            placeItems: "center",
            flexShrink: 0,
          }}
        >
          <Character stage={stage} vigor={vigor} size={32} is_idle_animated={false} />
        </div>
        <div style={{ lineHeight: 1.15, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{gamify.total_points} pts</div>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: "rgba(31,32,34,0.55)" }}>
            {gamify.streak_weeks} wk · {STAGE_LABEL[stage]}
            {play_progress ? ` · ${play_progress.remaining}→` : ""}
          </div>
        </div>
      </div>

      {/* Bottom-right nearby finds affordance — one clear tray, not a dashboard. */}
      {!is_sheet_open && play_nearby.length > 0 && (
        <button
          type="button"
          onClick={() => {
            const top = play_nearby[0];
            setPickedSector(null);
            setPickCode(top.row.species_code);
            setCameraWhere(top.row.where);
            setSheetOpen(true);
            noteAward("learn", `species:${top.row.species_code}`);
          }}
          aria-label="Nearby finds"
          className="absolute"
          style={{
            right: is_desktop ? 18 : 88,
            bottom: is_desktop ? 22 : 112,
            zIndex: 30,
            display: "flex",
            alignItems: "center",
            gap: 4,
            background: "rgba(255,255,255,0.92)",
            backdropFilter: "blur(8px)",
            border: "1.5px solid rgba(228,231,232,0.9)",
            borderRadius: 16,
            padding: "6px 8px",
            boxShadow: "0 4px 14px rgba(24,38,20,0.13)",
            cursor: "pointer",
          }}
        >
          {play_nearby.map((n) => (
            <TaxonThumb key={n.row.encounter_id} species_code={n.row.species_code} size={28} />
          ))}
        </button>
      )}

      {!is_desktop && !is_sheet_open && (
        <Fab
          label="Log a sighting"
          onClick={() => openCamera(here_sector?.species_code[0] ?? pick_code, here_sector?.name)}
          size={64}
          style={{ position: "absolute", right: 14, bottom: 104, zIndex: 46 }}
        >
          <ShutterIcon size={44} />
        </Fab>
      )}

      {is_sheet_open && !picked_sector && (
        is_desktop ? (
          <div style={{ position: "absolute", left: 18, bottom: 84, width: 380, zIndex: 48, maxHeight: "78%", overflow: "hidden", borderRadius: 24, boxShadow: "0 -8px 34px rgba(24,38,20,0.20)" }}>
            <NearbySheet
              sp={play_sheet_sp}
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
        view={view}
        onView={setView}
        onGesture={() => setFollowing(false)}
        layer={layer}
        fix={geo.fix}
        is_restricted_on={is_restricted}
        at_id={at_id}
        disc_size={is_desktop ? 38 : 32}
      />
      <MapChrome
        is_desktop={is_desktop}
        context={<ContextCard label="Loyola Heights" value={geo_line} />}
        below={geo_chip}
        control={
          <>
            <ModeSwitch mode={map_mode} onMode={setMode} is_desktop={is_desktop} />
            {/* The basemap cycler lives under the switch in the same column, so
                it can never sit on top of it the way it used to. */}
            <button
              onClick={() => setLayer(nextLayer)}
              className="flex items-center gap-1.5"
              style={{
                background: "rgba(255,255,255,0.94)",
                backdropFilter: "blur(8px)",
                border: "1.5px solid rgba(228,231,232,0.9)",
                borderRadius: 999,
                padding: "8px 13px",
                fontSize: 12,
                fontWeight: 700,
                boxShadow: "0 4px 14px rgba(24,38,20,0.14)",
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

  return (
    <div style={{ height: "100%", background: "var(--brand-cream, #f7faf6)", color: "#1F2022", overflowX: "hidden" }}>
      {is_desktop ? (
        /* Rail down the left, everything else in the column beside it. The
           inner column keeps flex-direction column so each route's own
           flex-1 sizing is unchanged from the top-bar shell. */
        <div style={{ height: "100%", display: "flex" }}>
          <DesktopRail route={route} onRoute={go} is_demo={is_demo} onDemo={() => setDemo((d) => !d)} seen_count={seen.size} is_wide={is_wide} />
          <div style={{ flex: 1, minWidth: 0, height: "100%", display: "flex", flexDirection: "column" }}>
          {route === "/" && (
            <HomeScreen
              is_desktop
              onWalk={() => go("/map")}
              onPlan={() => go("/plan")}
              gamify={gamify}
              live={
                <SpawnStrip
                  world={spawn_world}
                  fix={geo.fix}
                  seen_species={seen}
                  onPick={walkToSpawn}
                  is_desktop
                />
              }
            />
          )}
          {/* Play goes full-bleed on desktop too — a projector wants the map,
              not a 38% reading column beside it. Field keeps the column. */}
          {route === "/map" && map_mode === "play" && (
            <div className="flex-1" style={{ minHeight: 0, position: "relative" }}>{playBody}</div>
          )}
          {route === "/map" && map_mode === "field" && (
            <div className="flex-1 flex" style={{ minHeight: 0 }}>
              <div style={{ width: "62%", position: "relative" }}>{mapBody}</div>
              <aside className="scroll-soft" style={{ width: "38%", background: "#F9F9F9", borderLeft: "1.5px solid #E4E7E8", padding: 32, overflowY: "auto" }}>
                {showing_biome && presence ? (
                  <>
                    <BiomeCard presence={presence} is_desktop onLog={(code) => openCamera(code, presence.row.name)} />
                    <div style={{ fontSize: 13, color: "rgba(31,32,34,0.65)", marginTop: 18 }}>
                      {seen.size} species logged on this device{walk ? ` · ${walk_count} on this walk` : ""}
                    </div>
                    <p style={{ fontSize: 12, color: "rgba(31,32,34,0.55)", marginTop: 8, lineHeight: 1.4 }}>{AIS_GAP_NOTE}</p>
                    <div style={{ fontSize: 13, color: "rgba(31,32,34,0.5)", marginTop: 8, fontStyle: "italic" }}>
                      Local demo leaderboard on Home — not an official AIS rank. Formation first.
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-4">
                      <TaxonThumb species_code={sel_sp.species_code} size={104} />
                      <TaxonName
                        sp={sel_sp}
                        size={28}
                        eyebrow={`NEARBY · ${sel.where.toUpperCase()}`}
                        meta={
                          selected_distance ? (
                            <span style={{ fontSize: 14, fontWeight: 700, color: "#075D89" }}>{selected_distance}</span>
                          ) : null
                        }
                      />
                    </div>
                    <div style={{ marginTop: 14 }}>
                      <SpeciesPill sp={sel_sp} />
                    </div>
                    <p style={{ fontSize: 16, lineHeight: 1.5, marginTop: 18 }}>{sel_sp.note}</p>
                    {sel_sp.caption && <div style={{ fontSize: 12, color: "rgba(31,32,34,0.5)", marginTop: 10 }}>{sel_sp.caption}</div>}
                    <SpeciesBack sp={sel_sp} />
                    <div className="flex gap-3" style={{ marginTop: 24 }}>
                      {[
                        ["1,809", "campus trees · AIS SY 2025–2026"],
                        ["101", "arboretum · AIS"],
                      ].map(([big, cap]) => (
                        <div key={big} style={{ flex: 1, background: "#fff", border: "1.5px solid #E4E7E8", borderRadius: TILE_RADIUS, padding: 16 }}>
                          <div style={{ fontWeight: 800, fontSize: 22 }}>{big}</div>
                          <div style={{ fontSize: 12, color: "rgba(31,32,34,0.6)", marginTop: 4, lineHeight: 1.3 }}>{cap}</div>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => openCamera(sel.species_code)}
                      className="flex items-center justify-center gap-2"
                      style={{ width: "100%", height: 52, borderRadius: 12, background: "var(--ui-accent)", color: "#fff", fontWeight: 700, fontSize: 16, marginTop: 24 }}
                    >
                      <GlyphDisc size={32}>
                        <ShutterIcon size={24} />
                      </GlyphDisc>
                      Log this sighting
                    </button>
                    <div style={{ fontSize: 13, color: "rgba(31,32,34,0.65)", marginTop: 14 }}>
                      {seen.size} species logged on this device{walk ? ` · ${walk_count} on this walk` : ""}
                    </div>
                    <p style={{ fontSize: 12, color: "rgba(31,32,34,0.55)", marginTop: 8, lineHeight: 1.4 }}>{AIS_GAP_NOTE}</p>
                    <div style={{ fontSize: 13, color: "rgba(31,32,34,0.5)", marginTop: 8, fontStyle: "italic" }}>
                      Local demo leaderboard on Home — not an official AIS rank. Formation first.
                    </div>
                  </>
                )}
                <InatStrip state={inat} />
              </aside>
            </div>
          )}
          {route === "/journal" && <JournalScreen sighting={sighting} seen={seen} is_desktop pool_count={spawn_world.pool_count} pool={spawn_world.pool} is_seeded={is_seeded} gamify={gamify} />}
          {route === "/plan" && <PlanScreen is_desktop />}
          </div>
          {is_camera_open && (
            <CameraSheet
              pick_code={pick_code}
              where={camera_where ?? sel.where}
              rarity={camera_rarity}
              pool_count={spawn_world.pool_count}
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
          {reveal && (
            <BlindBoxReveal stage={reveal} onDismiss={() => setReveal(null)} />
          )}
          {toast && <Toast msg={toast} />}
        </div>
      ) : (
        <div style={{ position: "relative", height: "100%", overflowX: "hidden" }}>
          {route === "/" && (
            <HomeScreen
              is_desktop={false}
              onWalk={() => go("/map")}
              onPlan={() => go("/plan")}
              gamify={gamify}
              live={
                <SpawnStrip world={spawn_world} fix={geo.fix} seen_species={seen} onPick={walkToSpawn} />
              }
            />
          )}
          {route === "/map" && (map_mode === "play" ? playBody : mapBody)}
          {route === "/journal" && <JournalScreen sighting={sighting} seen={seen} is_desktop={false} pool_count={spawn_world.pool_count} pool={spawn_world.pool} is_seeded={is_seeded} gamify={gamify} />}
          {route === "/plan" && <PlanScreen is_desktop={false} />}
          {is_camera_open && (
            <CameraSheet
              pick_code={pick_code}
              where={camera_where ?? sel.where}
              rarity={camera_rarity}
              pool_count={spawn_world.pool_count}
              fix_line={fix_line}
              onPick={setPickCode}
              onSave={saveSighting}
              onClose={() => {
                setCameraOpen(false);
                setCameraRarity(null);
              }}
            />
          )}
          <MobileNav route={route} onRoute={go} />
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
          {reveal && (
            <BlindBoxReveal stage={reveal} onDismiss={() => setReveal(null)} />
          )}
          {toast && <Toast msg={toast} />}
        </div>
      )}
    </div>
  );
}
