import { lazy, memo, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import campus_network from "./asset/campus-network.json" with { type: "json" };
import Botanical from "./botanical";
import { BUILDING_ATTRIBUTION, building as campus_building } from "./building";
import Skyline, { type SkylineStyle } from "./skyline";
import Character, { Walker, type Stage } from "./character";
import { AT_TREE_RADIUS_M, RESTRICTED_POLYGON, species, type Encounter } from "./data";
import { residentBySector } from "./nearby";
import { pinKindOf, type PinKind } from "./pin";
import { distanceMeter, type Fix, type LatLon } from "./geo";
import { screenAngleOf, signedAngle } from "./play-walk";
import {
  biome_sector,
  SECTOR_ATTRIBUTION,
  sectorAt,
  sectorContains,
  sectorFill,
  sector as sector_row,
  type Sector,
} from "./sector";
import TileMap, { type Projection, type View } from "./tile-map";
import Horizon from "./horizon";
import Flora, { type GlassFind, type Tuft } from "./flora";
import { RARITY_ORDER, type Spawn } from "./spawn";
import { kindOf } from "./kind";
import { KindPath, KIND_TONE } from "./kind-mark";
import RemoteWalkerLayer, { HallCount, type Hall } from "./remote-walker";
import PetEagle from "./pet-eagle";
import { avatarFrom } from "./avatar";
import { FIND_BUDGET, tierFind, type FindCandidate, type FindTier } from "./find-display";
import { altitudeAt, lengthFraction, mediumOf, TRACK_STYLE, type Track } from "./track";
/* The proposed 3D hiker (`?avatar=hiker`, see avatar.ts): its own lazy chunk,
   so nobody who did not ask for it downloads model-viewer for the map. */
const HikerAvatar = lazy(() => import("./hiker-avatar"));
import { avatarPx, clampPitch, FOG_START, pitchForZoom, roadCasingPx, roadWidthPx, walkStopMs } from "./camera-feel";
import FrameProbe from "./frame-probe";
import { planePair, planePoint } from "./plane-cache";
import { BUDGET, qualityLabel, type QualityPick } from "./quality";

/**
 * The play view — the map as the owner asked for it on 09-03: "simple pokemon
 * go like with character 3d looking, map view, friendly and less cluttered ui".
 *
 * Four decisions carry that, and every one of them is a SUBTRACTION.
 *
 * 1. **No imagery.** The first cut of this screen kept the OSM raster and just
 *    desaturated it. That failed, visibly: OSM's style bakes every kerb,
 *    parking aisle and building label into the PNG, and a CSS filter cannot
 *    remove text that is already pixels. The 09-03 note ("a lot of lines",
 *    `1:01:25`) survived it. So this draws its own ground from the same OSM
 *    geometry the sectors were cut from — paths as soft cream lines, buildings
 *    as flat blocks, everything else green. It also means the play view needs
 *    no tile server, which is the last thing the offline story was leaning on.
 * 2. **Raked camera.** The ground plane is pitched 52°, and the character
 *    counter-rotates to stand up out of it. Standing geometry against raked
 *    ground is the visual grammar of the genre and it costs one CSS transform.
 * 3. **Sectors are the map.** One green ramp, not a rainbow (`1:03:48`), keyed
 *    to measured building cover, so it still reads in greyscale.
 * 4. **Labels are rationed.** Naming all 103 sectors at once was the clutter,
 *    not the sectors. `pickLabel` keeps the one you are standing in plus the
 *    biggest few that do not collide, and drops the rest.
 *
 * The ODbL credit is not chrome and was not among the things simplified away:
 * every line on this screen is OSM geometry and says so.
 */

/* The play-view rake is no longer one number. It rests at `pitchForZoom` —
   46° pulled back, 58° at the street — and two fingers dragged up or down move
   it inside `PITCH_MIN`…`PITCH_MAX` (see `camera-feel.ts`). The old fixed 52°
   sat in the middle of that band. */
const GROUND = "#CFE3BD";
const GROUND_NIGHT = "#3B5A63";
/** Closest play camera. Exported so the app's default play zoom cannot outrun it. */
export const PLAY_MAX_ZOOM = 22;
/**
 * Furthest the play camera pulls back.
 *
 * At z19 a 390 px phone spans about 110 m — a couple of sectors, enough to see
 * where you are going and not enough to plan the whole walk from a chair. One
 * step further out and the character is a dot, which is the moment this stops
 * being a game you are inside and goes back to being a diagram of one. The
 * field view keeps the whole-campus zoom; this view deliberately does not.
 */
export const PLAY_MIN_ZOOM = 19;
const MAX_LABEL = 5;

/**
 * The ways, already cleaned by `script/build-network.mjs`: one line per way,
 * sidewalks cut out of the streets they shadow, driveways and parking aisles
 * gone, ends snapped, bends chained. What is drawn here is exactly that file —
 * nothing is filtered at run time, so the picture and the build report agree.
 */
export interface NetworkFile {
  attribution: string;
  way: { way_class: "street" | "walk" | "stair"; is_outside: boolean; point: [number, number][] }[];
  water: { water_kind: string; name: string | null; point: [number, number][] }[];
}
const network = campus_network as unknown as NetworkFile;

/**
 * Ambient greenery, scattered once at module load.
 *
 * The map was dull because it was flat colour: a wooded sector and a lawn
 * differed only in hue. These are blobs of canopy texture, denser and darker
 * where the IMAGERY measured more vegetation, so the decoration tracks the one
 * number on this screen that was actually measured instead of inventing its
 * own. They are explicitly not trees we surveyed and nothing may read them as
 * positions — `sector.test.ts` pins that they carry no species and no id.
 *
 * Deterministic from the sector code, so the campus does not reshuffle itself
 * on every render, and computed once because 94 sectors x N tufts is not work
 * to redo sixty times a second.
 */
function scatterTuft(): Tuft[] {
  const out: Tuft[] = [];
  for (const s of biome_sector) {
    const veg = s.vegetation_ratio ?? 0;
    if (veg < 0.55) continue;
    /* A pitch or a lawn measures green and has no trees on it. Painting
       canopy across the Moro Lorenzo football field was the first thing a
       look at the result caught. */
    const is_lawn = s.kind === "open-field" || /(field|court|pitch|track)/i.test(s.name);
    let seed = 0;
    for (let i = 0; i < s.sector_code.length; i += 1) seed = (seed * 31 + s.sector_code.charCodeAt(i)) >>> 0;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    let lat0 = Infinity, lat1 = -Infinity, lon0 = Infinity, lon1 = -Infinity;
    for (const [lat, lon] of s.point) {
      if (lat < lat0) lat0 = lat; if (lat > lat1) lat1 = lat;
      if (lon < lon0) lon0 = lon; if (lon > lon1) lon1 = lon;
    }
    const want = is_lawn
      ? Math.min(8, Math.round((s.area_m2 / 2400) * veg))
      : Math.min(40, Math.round((s.area_m2 / 600) * veg));
    let tries = 0;
    let made = 0;
    while (made < want && tries < want * 12) {
      tries += 1;
      const lat = lat0 + random() * (lat1 - lat0);
      const lon = lon0 + random() * (lon1 - lon0);
      if (!sectorContains(s, { lat, lon })) continue;
      out.push({ lat, lon, r: 3.4 + random() * 4.6, dark: s.kind === "wood" || veg > 0.85, is_shrub_only: is_lawn });
      made += 1;
    }
  }
  return out;
}
const tuft = scatterTuft();

/**
 * The things there are to walk TOWARDS.
 *
 * A map with nothing on it is a diagram. The genre's whole loop is "see a thing
 * at a distance, go to it", and the first cut of this view had no markers at
 * all — only sector fills — so there was nothing to aim at.
 *
 * These are the curated demo encounters, placed in whichever biome contains
 * them. Six of the eight land in one; the other two sit on the path network and
 * are residents of nowhere. They are DEMO-MAP positions and the card says so —
 * the AIS inventory (due 2026-09-09) is what replaces them with real counts and
 * locations.
 */
const resident_by_sector = residentBySector();
const marker: Encounter[] = [...resident_by_sector.values()].flat();

/**
 * The overlay's pieces that do NOT move with the camera, memoised.
 *
 * `overlay` is rendered every camera frame (the glide commits each frame with
 * `flushSync`, `tile-map.tsx`), and everything in it re-rendered with it: the
 * walker's whole sticker SVG, the horizon's sky and ridge, the walker count,
 * the tier badge — none of which had a prop change between frames. Their
 * props are primitives or stable objects, so a shallow compare is the whole
 * cost now. (The walker's WRAPPER still moves every frame; only the figure
 * inside is skipped.)
 */
const WalkerFigure = memo(Character);
/* The 3D trainer (`agila-trainer.glb`), the default walker since 10-02. */
const TrainerFigure = memo(Walker);
const HorizonBand = memo(Horizon);
const HallCountPill = memo(HallCount);
const FrameProbeOnce = memo(FrameProbe);
/** "out until 3:40 PM" — one formatter for every find (see `spawn_title`). */
const UNTIL_FORMAT = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" });
/** `?avatar=` never changes under a running page; read it once, not per frame. */
const avatar = typeof window !== "undefined" ? avatarFrom(window.location.search) : "trainer";
const is_hiker = avatar === "hiker";

/** Fixed cast so they do not reshuffle every render. Decoration, not data. */
const BIRD = [
  { top: 12, size: 22, duration: 38, delay: 0, track: "yc-fly-a" },
  { top: 18, size: 16, duration: 52, delay: 6, track: "yc-fly-b" },
  { top: 9, size: 13, duration: 61, delay: 18, track: "yc-fly-a" },
];


interface Props {
  view: View;
  onView: (view: View) => void;
  fix?: Fix | null;
  /** Sector codes this walker has logged something in. */
  seen_sector: Set<string>;
  stage: Stage;
  vigor: number;
  /** Kept for the field view's shared shape; the play ground takes no clicks. */
  onSelectSector?: (row: Sector) => void;
  onSelectEncounter: (e: Encounter) => void;
  /** Species already in this journal — a logged marker reads as filled. */
  seen_species: Set<string>;
  onGesture?: () => void;
  is_desktop?: boolean;
  is_restricted_on?: boolean;
  /** Empty means draw every kind. Never hides the restricted hatch. */
  pin_filter?: Set<PinKind>;
  bearing_degree: number;
  onBearing: (degree: number) => void;
  /** The rotating world for this window. Empty until the pool has loaded. */
  spawn?: Spawn[];
  onSelectSpawn?: (row: Spawn) => void;
  /** Play-mode tap on empty ground. The walker walks there. */
  onWalkTo?: (point: LatLon) => void;
  /** Weld the camera to the walker — see `is_pan_locked` on `TileMap`. */
  is_camera_locked?: boolean;
  /** How much of a building to draw — see `SkylineStyle`. */
  skyline_style?: SkylineStyle;
  /** The hall — other phones' walkers, live. Opened once by the app, so the
   *  pill here and every other "walkers out" count read the same roster. */
  hall: Hall;
  /** Night sky, darker ground. From the weather reading's `is_day`, or the clock. */
  is_night?: boolean;
  /** The graphics tier and why — see `quality.ts`. Named on the map, always. */
  quality?: QualityPick;
  /** The tier badge was tapped: open wherever the tier is changed. */
  onQuality?: () => void;
  /** Your group walk's tag: those walkers are drawn as your group. */
  party_tag?: string | null;
  /** Species an objective or a challenge points at: their finds always stand up, ringed. */
  target_species?: Set<string>;
  /** Lines with a purpose over the way network — trail legs, the walk to help, shore and flight lines (`track.ts`). */
  track?: Track[];
}

type Project = Projection["project"];

/** Screen coords place it AND decide whether it may exist. */
interface LabelPlace {
  row: Sector;
  screen_x: number;
  screen_y: number;
  /** Perspective scale where it landed, so a far pill reads as far. */
  scale: number;
}

/**
 * The part of the ground worth drawing: a circle in plane pixels around the
 * camera anchor. See `Ground` for why it exists.
 */
interface Cull {
  x: number;
  y: number;
  r: number;
}

/** Does any of this ring's bounding box reach inside the cull circle? */
function isNear(ring: [number, number][], project: Project, cull: Cull): boolean {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [lat, lon] of ring) {
    const p = project({ lat, lon });
    if (p.x < x0) x0 = p.x; if (p.x > x1) x1 = p.x;
    if (p.y < y0) y0 = p.y; if (p.y > y1) y1 = p.y;
  }
  const dx = Math.max(x0 - cull.x, 0, cull.x - x1);
  const dy = Math.max(y0 - cull.y, 0, cull.y - y1);
  return dx * dx + dy * dy <= cull.r * cull.r;
}

/**
 * The play view's colour grade on a sector fill, done on the number rather
 * than with a CSS filter: a filter on a group this size makes Chrome drop the
 * grass pattern and the buildings drawn after it. Lightness order — the
 * channel the data is in — survives both grades.
 *
 * Day takes saturation down (the posters' greens are soft; a lawn at full
 * chroma filled the phone with one loud colour). Night halves lightness and
 * leans the hue toward blue, the genre's dusk.
 */
function gradeFill(hsl: string, is_night: boolean): string {
  const m = /hsl\(([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\)/.exec(hsl);
  if (!m) return hsl;
  const h = Number(m[1]);
  const sat = Number(m[2]);
  const light = Number(m[3]);
  if (is_night) return `hsl(${(h + 34).toFixed(1)} ${(sat * 0.6).toFixed(1)}% ${(light * 0.5).toFixed(1)}%)`;
  return `hsl(${h.toFixed(1)} ${(sat * 0.72).toFixed(1)}% ${Math.min(96, light + 1.5).toFixed(1)}%)`;
}

function ringPath(ring: [number, number][], project: Project, close: boolean): string {
  if (!ring.length) return "";
  let d = "";
  for (let i = 0; i < ring.length; i += 1) {
    const p = project({ lat: ring[i][0], lon: ring[i][1] });
    d += `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  }
  return close ? `${d} Z` : d;
}

/**
 * A transform that puts an element's box at (`x`, `y`) on the glass, then
 * applies `rest` (the usual centring and scale).
 *
 * Everything on the glass moves every camera frame. Moved by `left`/`top` it
 * is re-laid-out every frame; moved by a transform it is not — the transform
 * only touches its own paint property. The leading translate composes with
 * `rest` exactly as `left`/`top` did, whatever the transform origin, because
 * a translation commutes with where the origin is.
 */
function glassAt(x: number, y: number, rest: string): string {
  return `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) ${rest}`;
}

/** The right-hand map controls, as a screen-space box labels stay out of. */
const CONTROL_KEEP_OUT_X = 76;
const CONTROL_KEEP_OUT_Y = 300;
/** The graphics badge: how far up from the bottom it sits, and how wide it runs. */
const BADGE_BOTTOM = 200;
const BADGE_KEEP_OUT_X = 176;

/**
 * Which sectors get to speak.
 *
 * Biggest first, the one underfoot always, and anything whose pill would
 * overlap a pill already placed is dropped rather than shrunk — an unreadable
 * label is worse than no label. Capped at seven because that is roughly what a
 * 390 px screen holds without becoming the thing we were asked to fix.
 */
/**
 * The label candidates in the order they get to speak: biggest first, minus
 * the ground underfoot. The ground underfoot is already named on the HUD card;
 * a second pill of the same name beside the walker was the one label on screen
 * that said nothing new. Only changes when `here` does, so the play map
 * memoises it rather than re-sorting every sector on every camera frame.
 */
function orderLabel(row: Sector[], here_code: string | null): Sector[] {
  return row.filter((s) => s.sector_code !== here_code).sort((a, b) => b.area_m2 - a.area_m2);
}

function pickLabel(
  ordered: Sector[],
  projection: Projection,
  avoid: { x: number; y: number } | null,
): LabelPlace[] {
  const placed: LabelPlace[] = [];
  const spoken = new Set<string>();
  const { project, toScreen, fromScreen, centre, width, height, plane_meter_per_pixel, view_distance_m, fog_start_y } = projection;
  /* A pill goes only on clear ground — nearer than where the fog starts
     (`FOG_START` of the view distance). Anything further is skipped BEFORE
     the projection, instead of projecting all ~90 sectors every camera frame
     to reject them one by one. The flat camera has no fog: the old bound. */
  const reach_m = Number.isFinite(view_distance_m)
    ? view_distance_m * FOG_START + 30
    : Math.max(
        distanceMeter(centre, fromScreen(0, height * 0.3)),
        distanceMeter(centre, fromScreen(width, height * 0.3)),
      ) + 30;
  const reach_px = reach_m / Math.max(plane_meter_per_pixel, 1e-6);
  const centre_px = project(centre);
  /* Every check below is in SCREEN space. Checking in plane space is what let
     labels clip off the right edge: the perspective divide pushes points away
     from the centre, so a pill that fits the plane can still hang off the
     glass. */
  const halfWidth = (s: Sector) => 16 + Math.min(s.name.length, 24) * 3.6;

  for (const s of ordered) {
    if (placed.length >= MAX_LABEL) break;

    /* One pill per NAME. The arrangement cuts the SOM grove into three faces,
       and three identical pills stacked down the screen is noise, not
       information — the sector card names the piece you actually tapped. */
    const base = s.name.replace(/\s*\([^)]*\)$/, "");
    if (spoken.has(base)) continue;
    /* In plane pixels against the anchor-cached label point: one
       subtraction per sector a frame instead of a great-circle distance. */
    const at = planePair(project, s.label_point);
    if (Number.isFinite(reach_px) && (at.x - centre_px.x) ** 2 + (at.y - centre_px.y) ** 2 > reach_px ** 2) continue;

    const p = toScreen(at);
    const half_w = halfWidth(s);

    /* Fully on screen, pill included — a clipped label is worse than none. */
    if (p.x - half_w < 6 || p.x + half_w > width - 6) continue;
    /* Not up in the fog, where the ground is fading into the horizon, and not
       down where the stage card and the shutter live — a pill behind a button
       is a pill nobody reads. */
    if (p.y < (fog_start_y ?? height * 0.3) || p.y > height * 0.84) continue;
    /* Not under the right-hand control column (weather, layers, locate,
       compass and the walker count — ~300 px tall on every screen size). */
    if (p.x + half_w > width - CONTROL_KEEP_OUT_X && p.y < CONTROL_KEEP_OUT_Y) continue;
    /* Not over the graphics badge (`QualityBadge`, bottom-right). */
    if (p.x + half_w > width - BADGE_KEEP_OUT_X && Math.abs(p.y - (height - BADGE_BOTTOM - 10)) < 30) continue;
    /* Not on top of the walker. `avoid` is their FEET, and the figure stands
       ~110 px up from there, so the keep-out box runs up the whole body. */
    if (avoid && Math.abs(p.x - avoid.x) < half_w + 40 && p.y > avoid.y - 150 && p.y < avoid.y + 24) continue;

    const hit = placed.some(
      (q) => Math.abs(q.screen_x - p.x) < half_w + halfWidth(q.row) + 10 && Math.abs(q.screen_y - p.y) < 46,
    );
    if (hit) continue;

    spoken.add(base);
    placed.push({ row: s, screen_x: p.x, screen_y: p.y, scale: p.scale });
  }
  return placed;
}

/**
 * The ground: sector fills, grass, building contact patches, walkways and the
 * restricted gray. (The trees and bushes stand up in `flora.tsx`.)
 *
 * None of it depends on where the walker is — only on `project`, which the
 * raked camera anchors (see `ANCHOR_GRID` in `tile-map.tsx`). Memoised on
 * exactly that, so the 20 Hz walker updates and the 60 Hz camera glide leave
 * it alone; it is re-rendered when the anchor steps, the zoom changes, or the
 * sector underfoot changes.
 *
 * And CULLED to a circle around the camera. The whole campus is ~1,400
 * elements, and at the street camera almost all of them are kilometres of
 * plane pixels off the glass — but every one of them still cost paint and
 * layerisation on every frame the plane moved. Measured in a headless Chrome
 * (390x844, moving only the plane's transform): ~20 fps with the whole campus
 * in the SVG, ~65 fps with only what is near. Past the circle the view is
 * sky haze and flat ground colour anyway.
 */
const Ground = memo(function Ground({
  project,
  plane_meter_per_pixel,
  here_code,
  is_restricted_on,
  is_night,
  cull_x,
  cull_y,
  cull_r,
}: {
  project: Project;
  plane_meter_per_pixel: number;
  here_code: string | null;
  is_restricted_on: boolean;
  /* Night is graded on the numbers (`gradeFill`, the path colours) — never a
     CSS filter on this group: Chrome drops the grass pattern and the
     buildings under one. */
  is_night: boolean;
  /* Primitives rather than a `Cull` object, so `memo` compares them by value. */
  cull_x: number;
  cull_y: number;
  cull_r: number;
}) {
  const cull: Cull = { x: cull_x, y: cull_y, r: cull_r };
  const near = (ring: [number, number][]) => isNear(ring, project, cull);
  /* The subpaths, one string per look — see the comment on the grass below. */
  const merged = { grass: "", building: "", water: "", street: "", walk: "", stair: "" };
  for (const row of sector_row) if (row.is_biome && near(row.point)) merged.grass += ringPath(row.point, project, true);
  for (const b of campus_building) if (near(b.point)) merged.building += ringPath(b.point, project, true);
  for (const w of network.water) if (near(w.point)) merged.water += ringPath(w.point, project, true);
  for (const w of network.way) {
    if (!near(w.point)) continue;
    merged[w.way_class] += ringPath(w.point, project, false);
  }
  return (
    <>
      {/* 1 · sector fills — the map itself, through `gradeFill`. The
             paths carry their own night colours: one grade over
             everything turned a sand path into mud. */}
      {sector_row.map((row) => {
        if (!near(row.point)) return null;
        const is_here = here_code === row.sector_code;
        return (
          <path
            key={row.sector_code}
            d={ringPath(row.point, project, true)}
            fill={gradeFill(sectorFill(row), is_night)}
            fillOpacity={is_here ? 1 : 0.95}
            /* Only the sector you stand in is outlined. A hairline round every
               sector traced the ways it was cut along — including the
               sidewalks and driveways the network no longer draws — and read
               as a second, ghost path network under the real one. */
            stroke={is_here ? "#F0B429" : "none"}
            strokeWidth={is_here ? 4.5 : 0}
            strokeLinejoin="round"
            /* The ground takes no clicks in the play view.
             *
             * It used to open the sector card, and that is the wrong
             * verb for this screen: on a map welded to a walker, a tap
             * on the ground means GO THERE, and `onTap` on the map
             * already means exactly that. Having both meant every
             * attempt to walk somewhere threw a panel of area
             * statistics over the map instead — and every camera drag
             * that happened to end on a sector did the same.
             *
             * The information is not gone. The sector you are standing
             * in is named on the HUD, and the full card with coverage,
             * species and citations is the field view, one tap away —
             * which is where a survey belongs. */
            style={undefined}
          />
        );
      })}
      {/* Everything below that shares one look is ONE `<path>` of many
             subpaths, not one element per ring. Measured at the pulled-back
             camera (z19, 4× CPU, `bench/frame-2026-10-01-z19.json`): the plane
             held ~1,450 ground elements and the page ran at ~4 fps with
             `PaintArtifactCompositor::Update` taking ~9 of every 10 s of
             main thread — Chrome re-layerises per element on every frame
             something repaints, whether or not the ground changed. Hiding
             the ground alone brought it back to ~33 fps; hiding the
             overlay changed nothing. The picture is the same: rings of one
             fill never overlap (grass, buildings), and a path network drawn
             casing-then-fill looks the same as one stroke. */}
      <path d={merged.grass} fill="url(#pm-grass)" stroke="none" />

      {/* 2 · where each building MEETS the ground.
             The building itself is a prism drawn in screen space by
             `Skyline` — this is only its contact patch, which has to
             stay in the plane so it stays welded to the sector under
             it. Drawn dark rather than pale: a prism rising out of a
             light block looks like it is floating on one. */}
      <path d={merged.building} fill="rgba(104,96,78,0.30)" stroke="none" />

      {/* 3 · open water — the pond and the pool, which the ground never drew. */}
      {merged.water && (
        <path
          d={merged.water}
          fill={is_night ? "#2F5E86" : "#8FD3F0"}
          stroke={is_night ? "#5C8DB5" : "#D8F1FB"}
          strokeWidth={Math.max(2, 1.2 / Math.max(plane_meter_per_pixel, 0.001))}
          strokeLinejoin="round"
        />
      )}

      {/* 4 · the way network (`campus-network.json`), drawn the way Pokémon GO
             draws its streets: one quiet network, nothing doubled.
             ONE casing under every way (streets and walks alike, same colour),
             then the walk fills, then the street fills. Same-colour strokes
             union, so a junction is seamless whatever meets there, and a walk
             that ends on a street disappears into it rather than capping on
             top of it. Butt caps: a dead end is square, not a blob. No centre
             dashes — they ran through every junction and dead end. Widths are
             metres (`roadWidthPx`: street 5.5 m, walk 2.6 m), so a way is as
             wide as the ground it covers at every zoom. Streets outside campus
             are the same streets; the sector fills already say where play is. */}
      {(() => {
        const street_fill = roadWidthPx(true, plane_meter_per_pixel);
        const walk_fill = roadWidthPx(false, plane_meter_per_pixel);
        const casing = is_night ? "#6F6A9E" : "#D8CCAA";
        const walk_and_stair = merged.walk + merged.stair;
        return (
          <g fill="none" strokeLinecap="butt" strokeLinejoin="round">
            <path d={walk_and_stair} stroke={casing} strokeWidth={roadCasingPx(walk_fill)} />
            <path d={merged.street} stroke={casing} strokeWidth={roadCasingPx(street_fill)} />
            <path d={walk_and_stair} stroke={is_night ? "#5E5C94" : "#F3E6C2"} strokeWidth={walk_fill} />
            {merged.stair && (
              <path
                d={merged.stair}
                stroke={casing}
                strokeWidth={walk_fill * 0.8}
                strokeDasharray={`${Math.max(1.2, walk_fill * 0.12)} ${Math.max(2.4, walk_fill * 0.26)}`}
              />
            )}
            <path d={merged.street} stroke={is_night ? "#46508C" : "#FBF5E4"} strokeWidth={street_fill} />
          </g>
        );
      })()}

      {/* 4 · ambient life now stands up — see `flora.tsx`, drawn in screen
             space over the skyline. Nothing flat is painted here. */}

      {/* 4 · restricted ground: quiet dry ground, drawn over the green
             and its tufts so nothing living seems to grow there. No
             hatch, no dashed fence, no label — faded ground you cannot
             walk onto says it without a paragraph (ROADMAP "quiet
             restricted-area treatment"). It was a flat gray, and gray
             sits beside the walker's start: under the rake it read as a
             hole in the map rather than as ground, so it stays in the
             ground family — the lawn with the life taken out of it. */}
      {is_restricted_on && (
        <path
          d={ringPath(RESTRICTED_POLYGON.map((p) => [p.lat, p.lon] as [number, number]), project, true)}
          fill={is_night ? "#3A4B4C" : "#B9C39E"}
          fillOpacity={0.92}
          stroke={is_night ? "#2E3C3D" : "#9CA682"}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      )}
    </>
  );
});

/**
 * Land and sea tracks, and the shadow under every air track, laid ON the
 * ground plane — so they are foreshortened with it and sit under every find,
 * tree and walker, the way a route does in Pokémon GO.
 *
 * Widths and dashes are metres (`TRACK_STYLE`), so a trail is the same width
 * on the ground at every zoom. Casing, then line, per track: tracks are few,
 * and each kind keeps its own colour where two cross. Nothing animates in
 * here — anything moving inside the ground `<svg>` repaints all of it
 * (see `Ripple`).
 */
const TrackGround = memo(function TrackGround({
  track,
  project,
  plane_meter_per_pixel,
}: {
  track: Track[];
  project: Project;
  plane_meter_per_pixel: number;
}) {
  const px = (m: number) => m / Math.max(plane_meter_per_pixel, 0.001);
  return (
    <g fill="none" strokeLinejoin="round">
      {track.map((t) => {
        const style = TRACK_STYLE[t.track_kind];
        const d = ringPath(t.point.map((q) => [q.lat, q.lon] as [number, number]), project, false);
        const opacity = t.is_done ? 0.3 : t.is_active === false ? 0.55 : 1;
        if (mediumOf(t) === "air") {
          /* Its shadow: where the flight passes over. */
          return (
            <path
              key={t.track_code}
              d={d}
              stroke="rgba(38,30,72,0.28)"
              strokeWidth={Math.max(2, px(0.7))}
              strokeDasharray={`${px(1.2)} ${px(1.6)}`}
              strokeLinecap="butt"
            />
          );
        }
        const width = Math.max(4, px(style.width_m));
        const dash = style.dash_m ? `${px(style.dash_m[0])} ${Math.max(width * 1.2, px(style.dash_m[1]))}` : undefined;
        /* A dotted (sea) line is zero-length dashes with round caps: a dot IS
           a round cap. Everywhere else the ends are square. */
        const is_dotted = style.dash_m?.[0] === 0;
        return (
          <g key={t.track_code} opacity={opacity}>
            <path d={d} stroke={style.casing} strokeWidth={width + Math.max(3, px(0.7))} strokeLinecap={is_dotted ? "round" : "butt"} strokeOpacity={is_dotted ? 0.55 : 1} />
            <path d={d} stroke={style.fill} strokeWidth={width} strokeDasharray={dash} strokeLinecap={is_dotted ? "round" : "butt"} />
            {/* A route that goes somewhere ends on its destination, marked. */}
            {(t.track_kind === "help" || t.track_kind === "evacuation") &&
              (() => {
                const end = project(t.point[t.point.length - 1]);
                return <circle cx={end.x} cy={end.y} r={Math.max(7, px(2.4))} fill={style.fill} stroke="#FFFFFF" strokeWidth={Math.max(3, px(0.8))} />;
              })()}
          </g>
        );
      })}
    </g>
  );
});

/**
 * Air tracks, on the glass: each sample of the line is lifted off its ground
 * point by its height (`altitudeAt`) times the camera's foreshortening there,
 * so a flight rises off the ground, arcs, and comes down where it lands, with
 * its shadow (`TrackGround`) on the ground below.
 */
function AirTrack({ track, projection }: { track: Track[]; projection: Projection }) {
  const air = track.filter((t) => mediumOf(t) === "air");
  if (!air.length) return null;
  const lift_k = Math.sin((projection.tilt_degree * Math.PI) / 180) / Math.max(projection.plane_meter_per_pixel, 1e-6);
  const fog_y = projection.fog_start_y ?? -Infinity;
  return (
    <svg
      width={projection.width}
      height={projection.height}
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }}
      aria-hidden="true"
    >
      {air.map((t) => {
        const style = TRACK_STYLE[t.track_kind];
        /* Densify to ~2 m so the arc is a curve, not three kinks. */
        const dense: { lat: number; lon: number }[] = [];
        for (let i = 1; i < t.point.length; i += 1) {
          const a = t.point[i - 1];
          const b = t.point[i];
          for (let k = 0; k < 24; k += 1) dense.push({ lat: a.lat + ((b.lat - a.lat) * k) / 24, lon: a.lon + ((b.lon - a.lon) * k) / 24 });
        }
        dense.push(t.point[t.point.length - 1]);
        const fraction = lengthFraction(dense);
        let d = "";
        let pen = false;
        dense.forEach((q, i) => {
          const at = projection.toScreen(projection.project(q));
          if (at.scale <= 0 || at.y < fog_y) { pen = false; return; }
          const y = at.y - altitudeAt(t.altitude_m ?? 0, fraction[i]) * lift_k * at.scale;
          d += `${pen ? "L" : "M"}${at.x.toFixed(1)} ${y.toFixed(1)}`;
          pen = true;
        });
        if (!d) return null;
        return (
          <g key={t.track_code} fill="none" strokeLinejoin="round" opacity={t.is_done ? 0.35 : 1}>
            <path d={d} stroke={style.casing} strokeWidth={6} strokeLinecap="round" />
            <path d={d} stroke={style.fill} strokeWidth={3} strokeDasharray="9 7" strokeLinecap="butt" />
          </g>
        );
      })}
    </svg>
  );
}

/** The camera's furthest drift from its anchor (`ANCHOR_GRID` / 2, diagonal) plus a margin. */
const ANCHOR_SLACK_PX = 1500;
/** Cull radii are rounded up to this, so a few metres of drift keep `Ground`'s memo. */
const CULL_STEP_PX = 256;

/**
 * How far out, in plane pixels from the camera anchor, the ground can show.
 *
 * It was `3.2 × the screen's long side` — the reach at the STEEPEST pitch —
 * at every pitch. At the pulled-back camera (z19, 46°) the ground actually
 * seen ends ~950 plane px away, under the ridge, and the old circle took in
 * the whole campus: ~1,450 elements, rebuilt on every anchor step. Now it is
 * the real distance to the ground under the ridge line for THIS pitch and
 * zoom (it does not depend on where the camera is, only how it is tilted), a
 * tenth over, plus the anchor's slack — the camera glides up to ~1,450 px from
 * its anchor before the ground is rebuilt. A pitch change re-renders the plane
 * anyway, so a steeper tilt gets the bigger circle it needs.
 */
function groundCullPx(projection: Projection): number {
  const { plane_meter_per_pixel, meter_per_pixel, width, height, view_distance_m } = projection;
  /* The clip box in `tile-map.tsx` already cuts the ground at the view
     distance; geometry past it is never seen, so it is not built. */
  const reach_px = Number.isFinite(view_distance_m)
    ? (view_distance_m * 1.1) / Math.max(plane_meter_per_pixel, 1e-6)
    : (Math.max(width, height) * 3.2 * meter_per_pixel) / Math.max(plane_meter_per_pixel, 1e-6);
  return Math.ceil((reach_px + ANCHOR_SLACK_PX) / CULL_STEP_PX) * CULL_STEP_PX;
}

/**
 * Pulses are capped in size. At the street camera the 40 m reach is three
 * screens wide, and a composited ripple that size is a texture of tens of
 * megabytes for a ring nobody can see the edge of.
 */
const RIPPLE_MAX_PX = 150;

/**
 * A pulsing ring that lies flat on the ground.
 *
 * It used to be an SVG `<circle>` with a CSS animation, inside the one big
 * ground `<svg>`. Anything animating inside that SVG makes the browser repaint
 * and re-layerise the WHOLE ground every frame — measured on the 09-25 build,
 * turning those animations off took the idle play view from ~20 to ~64 fps in
 * a throttled headless Chrome. As its own `will-change` div inside the plane it
 * is still foreshortened by the plane's transform, and the pulse is a
 * compositor-only transform/opacity animation that repaints nothing.
 */
function Ripple({
  x,
  y,
  r,
  duration_s = 1.8,
  is_faint = false,
}: {
  x: number;
  y: number;
  r: number;
  duration_s?: number;
  is_faint?: boolean;
}) {
  return (
    <div
      className="pm-ripple"
      style={{
        position: "absolute",
        left: x - r,
        top: y - r,
        width: r * 2,
        height: r * 2,
        borderRadius: "50%",
        border: `2px solid rgba(255,255,255,${is_faint ? 0.4 : 0.8})`,
        pointerEvents: "none",
        willChange: "transform, opacity",
        animation: `fgpulse ${duration_s}s ease-out infinite`,
      }}
    />
  );
}

/**
 * The two find markers, as components of their own so the overlay — which
 * re-renders every camera frame — reuses them instead of rebuilding the
 * botanical drawing and the sticker on every frame.
 */
/**
 * Something is there, not what: a few blades shaking in the grass, flat on the
 * ground. Pokémon GO's rustling grass, for a find past the full-sticker range
 * (`find-display.ts`). Tapping it walks you there like any find.
 */
const RustleMark = memo(function RustleMark({ tone }: { tone: string }) {
  return (
    <svg className="pm-rustle" width="34" height="22" viewBox="0 0 34 22" style={{ overflow: "visible" }} aria-label="Something rustling here">
      <ellipse cx="17" cy="19" rx="13" ry="3.4" fill="rgba(20,60,30,0.22)" />
      <g fill="none" strokeLinecap="round" strokeWidth="2.6">
        <path d="M9 19 Q8 11 4 7" stroke="#fff" strokeWidth="5" />
        <path d="M17 19 Q17 9 15 3" stroke="#fff" strokeWidth="5" />
        <path d="M25 19 Q26 11 30 7" stroke="#fff" strokeWidth="5" />
        <path d="M9 19 Q8 11 4 7" stroke={tone} />
        <path d="M17 19 Q17 9 15 3" stroke={tone} />
        <path d="M25 19 Q26 11 30 7" stroke={tone} />
      </g>
    </svg>
  );
});

/** The ring a target find stands in: what an objective is asking you to find. */
function TargetRing({ children }: { children: ReactNode }) {
  return (
    <div style={{ position: "relative" }}>
      <div className="pm-target-ring" aria-hidden="true" />
      {children}
    </div>
  );
}

const ResidentOrb = memo(function ResidentOrb({
  species_code,
  is_logged,
  model,
  label,
}: {
  species_code: string;
  is_logged: boolean;
  model: number;
  label: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: model }}>
      <div
        style={{
          width: model,
          height: model,
          borderRadius: 999,
          background: is_logged ? "rgba(47,107,58,0.14)" : "rgba(255,255,255,0.92)",
          border: `2.5px solid ${is_logged ? "#2F6B3A" : "rgba(47,107,58,0.55)"}`,
          boxShadow: "var(--mg-shadow-sm)",
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
        }}
        aria-label={label}
      >
        <div style={{ width: "86%" }}>
          <Botanical species_code={species_code} is_silhouette={is_logged} />
        </div>
      </div>
      <div style={{ width: 3, height: 10, background: "rgba(47,107,58,0.55)", borderRadius: 2, marginTop: 1 }} />
      <div style={{ width: 14, height: 4, borderRadius: 999, background: "rgba(28,74,34,0.28)" }} />
    </div>
  );
});

/**
 * A sticker on a stalk, in the kit's grammar: white border, a disc in the
 * taxon's tone, the kind mark, and the rarity as a count of sparkles (a SHAPE,
 * so it survives greyscale — the same rule the rarity pill keeps). It bobs,
 * because a find that sits still reads as a pin.
 */
const SpawnSticker = memo(function SpawnSticker({
  row,
  kind,
  is_logged,
  in_range,
}: {
  row: Spawn;
  kind: ReturnType<typeof kindOf>;
  is_logged: boolean;
  in_range: boolean;
}) {
  const tone = KIND_TONE[kind];
  const tick = row.rarity ? RARITY_ORDER.indexOf(row.rarity) + 1 : 0;
  return (
    <svg
      className="pm-find"
      width="58"
      height="76"
      viewBox="0 0 58 76"
      style={{ overflow: "visible", animationDelay: `${-(row.spawn_id.length % 7) * 0.31}s` }}
      aria-label={`${row.common_name} — ${kind}${row.rarity ? `, ${row.rarity}` : ""}`}
    >
      <ellipse cx="29" cy="71" rx="13" ry="4.6" fill="rgba(20,60,30,0.26)" />
      {in_range && <ellipse cx="29" cy="71" rx="22" ry="7.5" fill="none" stroke="#fff" strokeWidth="2" opacity="0.9" />}
      <path d="M29 68 L29 46" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      <path d="M29 68 L29 46" stroke={tone} strokeWidth="2.2" strokeLinecap="round" />
      <g className="pm-find-head">
        <circle cx="29" cy="24" r="21" fill="#fff" />
        <circle cx="29" cy="24" r="17.5" fill={is_logged ? tone : "#FFFFFF"} stroke={tone} strokeWidth="2.6" />
        <circle cx="23" cy="17" r="5" fill="#fff" opacity={is_logged ? 0.35 : 0} />
        <g
          transform="translate(15.2 10.2) scale(1.15)"
          fill="none"
          stroke={is_logged ? "#FFFFFF" : tone}
          strokeWidth="1.9"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <KindPath kind={kind} />
        </g>
        {tick >= 2 && (
          <g transform="translate(29 -2)">
            {Array.from({ length: tick - 1 }, (_, i) => {
              const x = (i - (tick - 2) / 2) * 11;
              return (
                <path
                  key={i}
                  transform={`translate(${x} 0)`}
                  d="M0 -6 Q1 -1 6 0 Q1 1 0 6 Q-1 1 -6 0 Q-1 -1 0 -6 Z"
                  fill={tick === 4 ? "#F5C842" : "#F59A23"}
                  stroke="#fff"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              );
            })}
          </g>
        )}
      </g>
    </svg>
  );
});

export default function PlayMap({
  view,
  onView,
  fix,
  seen_sector,
  stage,
  vigor,
  onSelectEncounter,
  seen_species,
  onGesture,
  is_desktop = false,
  is_restricted_on = true,
  pin_filter,
  bearing_degree,
  onBearing,
  spawn = [],
  onSelectSpawn,
  onWalkTo,
  is_camera_locked = false,
  skyline_style,
  hall,
  track = [],
  target_species,
  party_tag = null,
  is_night = false,
  quality = { tier: "full", reason: "default" },
  onQuality,
}: Props) {
  const budget = BUDGET[quality.tier];
  const here = useMemo(() => (fix ? sectorAt(fix) : null), [fix]);
  /* Every find: painted scenery keeps off all of them (and off the walker,
     passed to `Flora` on its own). Without the walker in it this list only
     changes when the world rotates, which is what lets `Flora` memoise the
     check instead of redoing it for every tree on every frame. */
  const keep_clear = useMemo<LatLon[]>(() => [...marker, ...spawn], [spawn]);
  /* A find's hover title, once per rotation rather than once per find per
     camera frame, and through ONE shared formatter: `toLocaleTimeString`
     builds an `Intl` formatter every call, and at the pulled-back camera,
     with every find on the glass, that one line was ~1 s of main thread in a
     10 s walk at 4× CPU — the single largest line in the overlay (z19
     profile, 10-01). The world re-rolls its finds as the walker moves, so
     even once per rotation it was a 15 ms stall at 4× without the shared
     formatter. */
  const spawn_title = useMemo(() => {
    const out = new Map<string, string>();
    for (const row of spawn) {
      out.set(
        row.spawn_id,
        `${row.common_name}${row.rarity ? ` — ${row.rarity}` : ""}, out until ${UNTIL_FORMAT.format(new Date(row.ends_at))}`,
      );
    }
    return out;
  }, [spawn]);
  const label_order = useMemo(() => orderLabel(biome_sector, here?.sector_code ?? null), [here?.sector_code]);

  /* Pitch = the zoom's resting pitch plus whatever two fingers added. Kept as
     an OFFSET so zooming still eases the tilt after somebody has adjusted it,
     and local to this view so a tilt does not re-render the app. */
  const [pitch_offset, setPitchOffset] = useState(0);
  const tilt_degree = clampPitch(pitchForZoom(view.zoom) + pitch_offset);

  /* Heading and gait come from the fix actually MOVING, not from a flag
     somebody has to remember to set. The demo walk and a real GPS track both
     produce the same thing here, which is the point. */
  const last_fix = useRef<{ lat: number; lon: number; at: number } | null>(null);
  const travel = useRef({ heading: 0, is_walking: false });
  if (fix) {
    const prev = last_fix.current;
    if (prev && (prev.lat !== fix.lat || prev.lon !== fix.lon)) {
      const dy = fix.lat - prev.lat;
      const dx = (fix.lon - prev.lon) * Math.cos((fix.lat * Math.PI) / 180);
      travel.current = {
        /* `atan2(east, north)` is a real compass heading; the character is
           drawn on the glass, so it needs the angle that heading APPEARS at
           under the current camera. That is `screenAngleOf`, and it adds the
           bearing — subtracting it leaned the walker away from the direction
           they were actually walking as soon as the camera turned. */
        heading: signedAngle(
          screenAngleOf((Math.atan2(dx, dy) * 180) / Math.PI, bearing_degree),
        ),
        is_walking: true,
      };
      last_fix.current = { lat: fix.lat, lon: fix.lon, at: Date.now() };
    } else if (!prev) {
      last_fix.current = { lat: fix.lat, lon: fix.lon, at: Date.now() };
    }
  }

  /* Gait. The step animation used to be switched off only by a render that
     happened to land 2.5 s after the last move — and when the walker stops,
     nothing renders, so they marched on the spot forever. Now every move
     (re)arms a timer, and the timer is what says "stopped": it clears the flag
     and asks for the one render that shows it. `travel.current.is_walking` is
     the single boolean the walker's render reads, whatever draws the walker. */
  const [, setGaitCount] = useState(0);
  const moved_at = last_fix.current?.at ?? 0;
  const fix_source = fix?.source;
  useEffect(() => {
    if (!travel.current.is_walking) return;
    const timer = window.setTimeout(() => {
      travel.current = { ...travel.current, is_walking: false };
      setGaitCount((n) => n + 1);
    }, walkStopMs(fix_source));
    return () => window.clearTimeout(timer);
  }, [moved_at, fix_source]);

  return (
    /* `pm-lite` switches off, in CSS, the animations that run on the main
       thread every frame — the find bob and the eagle's wings are transforms
       on SVG children, which the compositor cannot take over (`game.css`). */
    /* `isolation`: the glass stacks by depth (`depthZ`, foot y + 400, so
       hundreds), and without a stacking context of its own those z-indexes
       competed with the app's dialogs — the pet egg drew over the "No
       position here" card (10-01). Everything here now stacks inside the map. */
    <div className={quality.tier === "lite" ? "pm-lite" : undefined} style={{ position: "absolute", inset: 0, isolation: "isolate" }}>
    <TileMap
      view={view}
      onView={onView}
      onGesture={onGesture}
      layer="guide"
      tilt_degree={tilt_degree}
      onTilt={(degree) => setPitchOffset(degree - pitchForZoom(view.zoom))}
      bearing_degree={bearing_degree}
      onBearing={onBearing}
      is_tile_hidden
      ground={is_night ? GROUND_NIGHT : GROUND}
      overlay_attribution={`${SECTOR_ATTRIBUTION} · ${BUILDING_ATTRIBUTION}`}
      /* ODbL credit has to stay readable: sit it just above the game dock (156 px). */
      credit_offset={158}
      /* Pokémon GO scale: at z22 a 390 px screen spans ~14 m, so a street is the
         width of the view and the walker's egg reads at about human height. */
      max_zoom={PLAY_MAX_ZOOM}
      /* And no further out than this. Past z19 the walker is a dot on a green
         shape and the screen has quietly become the survey map again. */
      min_zoom={PLAY_MIN_ZOOM}
      is_pan_locked={is_camera_locked}
      is_chrome_hidden
      onTap={onWalkTo}
      overlay={(projection) => {
        /* Only real biomes speak. A car park does not get a pill. */
        const walker_at = fix ? projection.toScreen(projection.project(fix)) : null;
        /* A find's spot on the glass, its size, and whether it stands in front
           of the walker. Null when it is past the plane's far edge or off the
           glass, so nothing floats in the sky. The size is the perspective
           scale alone — what the plane's rake gave a find when it lived there —
           so moving it up here does not shrink a tap target. */
        /* `point` is a stable row (a marker, a spawn), so its plane point is
           cached per camera anchor (`plane-cache.ts`). */
        const toScreenFind = (point: LatLon) => {
          const at = projection.toScreen(planePoint(projection.project, point));
          /* Only on clear ground: not in the fog over the last stretch of
             the view distance, and never out past it in the sky. */
          if (at.scale <= 0 || at.y < (projection.fog_start_y ?? projection.height * 0.34) || at.y > projection.height + 40) return null;
          if (at.x < -60 || at.x > projection.width + 60) return null;
          const k = Math.min(1.3, Math.max(0.5, at.scale));
          return { x: at.x, y: at.y, k, is_front: walker_at !== null && at.y > walker_at.y };
        };
        /* Finds, on the GLASS rather than in the ground.
           They used to live in the tilted plane, which welded them to their
           spot for free — and put them under everything on the glass, because
           the plane paints below the whole overlay: every tree covered every
           find, even a tree behind it, and a find behind a building vanished.
           Up here they are sized by the same perspective scale as the trees,
           and `Flora` paints them in one depth order with the trees. */
        const glass_find: GlassFind[] = [];
        /* What stands up, what only rustles, what is not shown at all — one
           budget over residents and spawns together (`find-display.ts`). */
        const from = fix ?? view;
        const candidate: FindCandidate[] = [];
        for (const e of marker) {
          const pin_kind = pinKindOf(species[e.species_code]);
          if (pin_filter && pin_filter.size > 0 && !pin_filter.has(pin_kind)) continue;
          const d = distanceMeter(from, e);
          candidate.push({
            key: `pin-${e.encounter_id}`,
            distance_m: d,
            in_range: Boolean(fix) && d <= AT_TREE_RADIUS_M,
            is_target: Boolean(target_species?.has(e.species_code)),
            is_logged: seen_species.has(e.species_code),
            rarity_rank: 0,
          });
        }
        for (const row of spawn) {
          const d = distanceMeter(from, row);
          candidate.push({
            key: row.spawn_id,
            distance_m: d,
            in_range: Boolean(fix) && d <= AT_TREE_RADIUS_M,
            is_target: Boolean(target_species?.has(row.species_code)),
            is_logged: seen_species.has(row.species_code),
            rarity_rank: row.rarity ? RARITY_ORDER.indexOf(row.rarity) : 0,
          });
        }
        const tier = tierFind(candidate, FIND_BUDGET[is_desktop ? "desktop" : "phone"]);
        const tierOf = (key: string): FindTier => tier.get(key) ?? "hidden";
        const rustleAt = (key: string, p: { x: number; y: number; k: number }, tone: string, onClick: (() => void) | undefined) => {
          glass_find.push({
            key,
            x: p.x,
            y: p.y,
            w: 34 * p.k,
            h: 22 * p.k,
            node: (
              <div
                data-play-marker="1"
                onClick={onClick}
                className="pm-find-at"
                style={{ transform: glassAt(p.x, p.y, `translate(-50%, -100%) scale(${p.k.toFixed(3)})`), cursor: onClick ? "pointer" : undefined }}
              >
                <RustleMark tone={tone} />
              </div>
            ),
          });
        };
        /* Resident finds: large botanical model, tiny stem chrome — not a map pin. */
        for (const e of marker) {
          const sp = species[e.species_code];
          const pin_kind = pinKindOf(sp);
          if (pin_filter && pin_filter.size > 0 && !pin_filter.has(pin_kind)) continue;
          const key = `pin-${e.encounter_id}`;
          const t = tierOf(key);
          if (t === "hidden") continue;
          const p = toScreenFind(e);
          if (!p) continue;
          if (t === "rustle") {
            rustleAt(key, p, "#2F6B3A", () => onSelectEncounter(e));
            continue;
          }
          const is_logged = seen_species.has(e.species_code);
          const in_range = fix ? distanceMeter(fix, e) <= AT_TREE_RADIUS_M : false;
          const is_target = Boolean(target_species?.has(e.species_code));
          const model = is_desktop ? 64 : 56;
          glass_find.push({
            key: `pin-${e.encounter_id}`,
            x: p.x,
            y: p.y,
            w: model * p.k,
            h: (model + 15) * p.k,
            node: (
              <div
                data-play-marker="1"
                onClick={() => onSelectEncounter(e)}
                title={sp ? `${sp.common_name} — demo-map position` : e.where}
                className="pm-find-at"
                style={{
                  /* Placed by transform, not left/top — see `glassAt`. */
                  transform: glassAt(p.x, p.y, `translate(-50%, -100%) scale(${p.k.toFixed(3)})`),
                  cursor: "pointer",
                  filter: in_range ? "drop-shadow(0 0 10px rgba(255,255,255,0.65))" : undefined,
                }}
              >
                {is_target ? (
                  <TargetRing>
                    <ResidentOrb species_code={e.species_code} is_logged={is_logged} model={model} label={`${sp?.common_name ?? "A find"} — ${pin_kind}, an objective`} />
                  </TargetRing>
                ) : (
                  <ResidentOrb species_code={e.species_code} is_logged={is_logged} model={model} label={`${sp?.common_name ?? "A find"} — ${pin_kind}`} />
                )}
              </div>
            ),
          });
        }
        /* Temporary world finds: a sticker on a stalk, same kind mark. */
        for (const row of spawn) {
          const t = tierOf(row.spawn_id);
          if (t === "hidden") continue;
          const p = toScreenFind(row);
          if (!p) continue;
          const kind = kindOf(row.iconic_taxon_name, row.archetype);
          if (t === "rustle") {
            rustleAt(row.spawn_id, p, KIND_TONE[kind], onSelectSpawn ? () => onSelectSpawn(row) : undefined);
            continue;
          }
          const is_target = Boolean(target_species?.has(row.species_code));
          const in_range = fix ? distanceMeter(fix, row) <= AT_TREE_RADIUS_M : false;
          glass_find.push({
            key: row.spawn_id,
            x: p.x,
            y: p.y,
            w: 58 * p.k,
            h: 76 * p.k,
            node: (
              <div
                data-play-marker="1"
                onClick={onSelectSpawn ? () => onSelectSpawn(row) : undefined}
                title={spawn_title.get(row.spawn_id)}
                className="pm-find-at"
                style={{
                  transform: glassAt(p.x, p.y, `translate(-50%, -100%) scale(${p.k.toFixed(3)})`),
                  cursor: onSelectSpawn ? "pointer" : undefined,
                  filter: in_range ? "drop-shadow(0 0 8px rgba(255,255,255,0.55))" : undefined,
                }}
              >
                {is_target ? (
                  <TargetRing>
                    <SpawnSticker row={row} kind={kind} is_logged={seen_species.has(row.species_code)} in_range={in_range} />
                  </TargetRing>
                ) : (
                  <SpawnSticker row={row} kind={kind} is_logged={seen_species.has(row.species_code)} in_range={in_range} />
                )}
              </div>
            ),
          });
        }
        const label = pickLabel(label_order, projection, walker_at);
        return (
          <>
            {/* The sky, ending at the real horizon — the view distance where it
                lands on the glass, and the fog over the last stretch of ground
                before it (`horizon.tsx`). Under the buildings and trees, which
                fade by their own distance. Rounded, so a camera frame that
                moves the horizon by a fraction of a pixel re-renders nothing. */}
            <HorizonBand
              width={projection.width}
              height={projection.height}
              horizon_y={projection.horizon_y === null ? null : Math.round(projection.horizon_y)}
              fog_start_y={projection.fog_start_y === null ? null : Math.round(projection.fog_start_y)}
              is_night={is_night}
            />
            {/* The campus, standing up. Over the sky and the ground, and
                below every marker — see `skyline.tsx` on why it cannot live
                in the tilted plane with the rest of the map. */}
            <Skyline
              projection={projection}
              centre={view}
              style={skyline_style}
              avoid={walker_at}
              is_night={is_night}
              is_shadow={budget.is_building_shadow}
            />
            <RemoteWalkerLayer hall={hall} projection={projection} bearing_degree={bearing_degree} zoom={view.zoom} party_tag={party_tag} />
            <HallCountPill hall={hall} />
            <Flora
              tuft={tuft}
              find={glass_find}
              projection={projection}
              centre={view}
              keep_clear={keep_clear}
              walker={fix ?? null}
              tree_max={budget.tree_max}
              tree_radius_m={budget.tree_radius_m}
              walker_screen_y={walker_at ? walker_at.y : null}
              walker_x={walker_at ? walker_at.x : null}
              is_night={is_night}
            />

            {/* The walker, drawn on the glass rather than in the ground.
                It used to live inside the tilted plane and counter-rotate out
                of it, which was right while nothing was ever painted above the
                plane. The skyline is painted above the plane — it has to be,
                there is no "up" inside a plane — so a walker left down there
                goes behind the first building they stand near, and behind the
                football pitch if that pitch is ever mistaken for a building.
                Up here the rake is already applied by `toScreen`, so the
                character no longer counter-rotates for it: `tilt_degree` is 0
                and the figure is simply upright, which is what it was always
                trying to look like. */}
            {fix && (() => {
              /* Welded camera: the walker IS the camera centre, so it is drawn
                 at the centre the camera is gliding through this frame, not at
                 the fix the camera is still easing toward. Drawn at the fix it
                 stepped across the glass at 20 Hz over smoothly moving ground,
                 which was most of the "jittery" in the 09-25 note. The 25 m
                 guard covers a camera sent somewhere else while locked. */
              /* Following (the view's target IS the fix) counts too: the
                 camera is gliding after the walker either way, and a walker
                 drawn at the raw fix steps at the tick rate over ground that
                 glides. */
              const is_on_camera =
                (is_camera_locked || (view.lat === fix.lat && view.lon === fix.lon)) && distanceMeter(view, fix) < 25;
              const anchor = is_on_camera ? projection.centre : fix;
              const at = projection.toScreen(projection.project(anchor));
              const avatar_px = avatarPx(view.zoom, Math.min(projection.width, projection.height));
              return (
                <>
                <div
                  className="pm-walker"
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    transform: glassAt(at.x, at.y, `translate(-50%, -100%) scale(${Math.max(0.6, Math.min(1.35, at.scale)).toFixed(3)})`),
                    transformOrigin: "50% 100%",
                    pointerEvents: "none",
                    zIndex: 6,
                  }}
                >
                  {/* No `tilt_degree`, no `bearing_degree`. Those props exist
                      to counter-rotate the character OUT of the tilted plane,
                      and it does not live in the plane any more — it is drawn
                      on the glass, where up is already up. Passing the bearing
                      here spun the tree by the camera angle: the visible bug
                      where the walker leans over and parts company with its own
                      shadow the moment you rotate. */}
                  {is_hiker ? (
                    <Suspense
                      fallback={<WalkerFigure stage={stage} vigor={vigor} size={avatar_px} is_walking={travel.current.is_walking} heading_degree={travel.current.heading} />}
                    >
                      <HikerAvatar size={avatar_px} is_walking={travel.current.is_walking} heading_degree={travel.current.heading} />
                    </Suspense>
                  ) : avatar === "sticker" ? (
                    <WalkerFigure
                      stage={stage}
                      vigor={vigor}
                      size={avatar_px}
                      is_walking={travel.current.is_walking}
                      heading_degree={travel.current.heading}
                    />
                  ) : (
                    <TrainerFigure
                      stage={stage}
                      size={avatar_px}
                      is_walking={travel.current.is_walking}
                      heading_degree={travel.current.heading}
                    />
                  )}
                </div>
                {/* The pet eagle — companion by day, sleep pet when you stop. See `pet.ts`. */}
                <PetEagle stage={stage} projection={projection} fix={fix} anchor={anchor} avatar_px={avatar_px} />
                </>
              );
            })()}
            {/* Birds. Pure atmosphere, screen space, no data behind them —
                they exist because a still map reads as a diagram. Not in the
                lite tier: ambient motion is the first thing a slow phone
                cannot afford (`BUDGET.lite.is_ambient_motion`). */}
            {budget.is_ambient_motion && (
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
              <style>{`
                @keyframes yc-fly-a { from { transform: translate(-12vw, 0) } to { transform: translate(112vw, -22px) } }
                @keyframes yc-fly-b { from { transform: translate(-18vw, 0) } to { transform: translate(118vw, 14px) } }
                @keyframes yc-flap { 0%,100% { transform: scaleY(1) } 50% { transform: scaleY(0.45) } }
                @media (prefers-reduced-motion: reduce) {
                  .yc-bird, .yc-bird svg, .pm-ripple { animation: none !important }
                }
              `}</style>
              {BIRD.map((b, i) => (
                <div
                  key={`bird${i}`}
                  className="yc-bird"
                  style={{
                    position: "absolute",
                    top: `${b.top}%`,
                    left: 0,
                    opacity: 0.5,
                    animation: `${b.track} ${b.duration}s linear ${b.delay}s infinite`,
                  }}
                >
                  <svg width={b.size} height={b.size * 0.5} viewBox="0 0 24 12" style={{ animation: "yc-flap 0.55s ease-in-out infinite" }}>
                    <path d="M1 8 q5 -7 10 -1 q5 -6 12 1" fill="none" stroke="rgba(52,72,60,0.75)" strokeWidth="1.7" strokeLinecap="round" />
                  </svg>
                </div>
              ))}
            </div>
            )}

            {label.map(({ row, screen_x, screen_y, scale }) => {
              const is_here = here?.sector_code === row.sector_code;
              return (
                <div
                  key={`label-${row.sector_code}`}
                  /* Everything but the place is `.pm-label` (`game.css`). */
                  className={is_here ? "pm-label is-here" : "pm-label"}
                  style={{
                    /* Screen space: no counter-rotation to undo, and the pill
                       lands exactly where the fit check said it would. It still
                       shrinks with distance so it belongs to its ground. */
                    transform: glassAt(screen_x, screen_y, `translate(-50%, -50%) scale(${Math.max(0.72, Math.min(1.1, scale)).toFixed(2)})`),
                  }}
                >
                  {row.name.length > 24 ? `${row.name.slice(0, 23)}…` : row.name}
                </div>
              );
            })}
            <AirTrack track={track} projection={projection} />
            <QualityBadge pick={quality} onOpen={onQuality} />
            <FrameProbeOnce />
          </>
        );
      }}
    >
      {(projection) => {
        const { project, width, height } = projection;

        return (
          <>
            <svg
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                overflow: "visible",
                pointerEvents: "none",
                /* No `filter` here, by day or night. Both grades are done on
                   the numbers inside `Ground` — `gradeFill` takes the sector
                   ramp to a blue dusk at night and down in saturation only by
                   day, and the paths carry their own night colours — because
                   Chrome drops the grass pattern and the buildings under a
                   filter on this plane. */
              }}
              width={width}
              height={height}
            >
              <defs>
                {/* Grass, the posters' way: tufts and the odd plumeria over the
                    measured fill. It only ever sits on biome ground, so asphalt
                    stays asphalt; the fill underneath still carries the data. */}
                <pattern id="pm-grass" width="46" height="46" patternUnits="userSpaceOnUse">
                  <path
                    d="M6,14 q1,-6 -2,-9 q5,3 5,9 q1,-7 5,-10 q-3,5 -2,10 M28,36 q1,-6 -2,-9 q5,3 5,9 q1,-7 5,-10 q-3,5 -2,10"
                    fill="none"
                    stroke="rgba(18,78,38,0.16)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                  <path d="M30,10 q2,-4 5,-5 M12,34 q2,-4 5,-5" fill="none" stroke="rgba(255,255,220,0.35)" strokeWidth="1.6" strokeLinecap="round" />
                  <circle cx="40" cy="22" r="2.1" fill="rgba(255,255,255,0.8)" />
                  <circle cx="40" cy="22" r="0.8" fill="rgba(245,200,66,0.95)" />
                </pattern>
              </defs>

              <Ground
                project={project}
                /* Four figures: the exact value drifts with latitude on every
                   step, which would defeat the memo for no visible change. */
                plane_meter_per_pixel={Number(projection.plane_meter_per_pixel.toPrecision(4))}
                here_code={here?.sector_code ?? null}
                is_restricted_on={is_restricted_on}
                is_night={is_night}
                /* The anchor sits at the container centre in plane pixels. */
                cull_x={width / 2}
                cull_y={height / 2}
                cull_r={groundCullPx(projection)}
              />

              {track.length > 0 && (
                <TrackGround
                  track={track}
                  project={project}
                  plane_meter_per_pixel={Number(projection.plane_meter_per_pixel.toPrecision(4))}
                />
              )}

              {/* 5 · soft ground contact under each find (and in-range ripples).
                   Ripples are diegetic: only when the walker is close enough to log. */}
            {marker.map((e) => {
              const p = project({ lat: e.lat, lon: e.lon });
              const pin_kind = pinKindOf(species[e.species_code]);
              if (pin_filter && pin_filter.size > 0 && !pin_filter.has(pin_kind)) return null;
              const in_range = fix ? distanceMeter(fix, e) <= AT_TREE_RADIUS_M : false;
              const px = Math.max(10, AT_TREE_RADIUS_M / Math.max(projection.plane_meter_per_pixel, 0.01));
              return (
                <g key={`sh-${e.encounter_id}`}>
                  <circle cx={p.x} cy={p.y} r="11" fill="rgba(28,74,34,0.18)" />
                  {/* The in-range ripple is NOT drawn here — see `Ripple`. A
                      still ring marks the spot so the reach reads even with
                      reduced motion. */}
                  {in_range && (
                    <circle cx={p.x} cy={p.y} r={Math.min(px * 0.55, RIPPLE_MAX_PX)} fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="2" />
                  )}
                </g>
              );
            })}

            {/* Walker interaction radius — quiet white pulse, genre grammar.
             *
             * A CIRCLE, not a pre-squashed ellipse. This is drawn inside the
             * ground plane, and the plane already carries the 52° rake and the
             * camera bearing in one CSS transform — so the browser foreshortens
             * a circle into exactly the right ellipse, for free, at any tilt
             * and any bearing.
             *
             * Drawing an ellipse here squashed it twice, and worse, the squash
             * was axis-aligned in plane space while the rake is applied after
             * the bearing rotation. At north it looked almost right; swing the
             * camera and the ring lifted out of the ground and stood up on
             * edge. That is the "not parallel to the ground" — it was never a
             * tuning problem with the 0.55, it was geometry done twice in two
             * different frames of reference.
             *
             * `plane_meter_per_pixel`, not `meter_per_pixel`: 40 m has to be 40 m
             * in the space this circle is actually drawn in. */}
            {fix && (() => {
              const p = project(fix);
              const r = Math.max(14, AT_TREE_RADIUS_M / Math.max(projection.plane_meter_per_pixel, 0.01));
              /* Drawn only when 40 m actually fits on the glass.
               *
               * At the street camera (z22, ~14 m across a phone) the real reach
               * radius is about three screens wide, and a ring three screens
               * wide is not a ring — it is a pale wash with no edge, which
               * tells you nothing about how close you have to be. Rather than
               * shrink it to a decorative circle and quietly stop meaning
               * 40 m, it is simply not drawn until the camera is wide enough to
               * hold it. Pull back and the ring appears at its true size. */
              const r_screen = AT_TREE_RADIUS_M / Math.max(projection.meter_per_pixel, 0.01);
              if (r_screen > Math.min(projection.width, projection.height) * 0.6) return null;
              return (
                <g pointerEvents="none">
                  <circle cx={p.x} cy={p.y} r={r} fill="rgba(255,255,255,0.14)" stroke="rgba(255,255,255,0.55)" strokeWidth="1.5" />
                </g>
              );
            })()}

            {/* 6 · a walked sector gets a quiet tick. Never a score. */}
              {sector_row
                .filter((row) => row.is_biome && seen_sector.has(row.sector_code))
                .map((row) => {
                  const p = project({ lat: row.label_point[0], lon: row.label_point[1] });
                  return (
                    <g key={`tick-${row.sector_code}`} transform={`translate(${p.x} ${p.y})`}>
                      <circle r="10" fill="#2F6B3A" opacity="0.94" />
                      <path d="M-4.5 0 L-1.4 3.2 L4.6 -3" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                    </g>
                  );
                })}
            </svg>

            {/* The pulses, as composited HTML rather than animated SVG. */}
            {marker.map((e) => {
              if (!fix || distanceMeter(fix, e) > AT_TREE_RADIUS_M) return null;
              if (pin_filter && pin_filter.size > 0 && !pin_filter.has(pinKindOf(species[e.species_code]))) return null;
              const p = project({ lat: e.lat, lon: e.lon });
              const px = Math.max(10, AT_TREE_RADIUS_M / Math.max(projection.plane_meter_per_pixel, 0.01));
              return (
                <Ripple key={`rp-${e.encounter_id}`} x={p.x} y={p.y} r={Math.min(px * 0.85, RIPPLE_MAX_PX)} />
              );
            })}
            {fix && (() => {
              const r = AT_TREE_RADIUS_M / Math.max(projection.plane_meter_per_pixel, 0.01);
              const r_screen = AT_TREE_RADIUS_M / Math.max(projection.meter_per_pixel, 0.01);
              if (r_screen > Math.min(projection.width, projection.height) * 0.6) return null;
              const p = project(fix);
              return <Ripple x={p.x} y={p.y} r={Math.max(14, r) * 0.72} duration_s={2.2} is_faint />;
            })()}

          </>
        );
      }}
    </TileMap>
    </div>
  );
}

/**
 * Which graphics tier is on, said on the map itself.
 *
 * The rule in this repo is that nothing changes what a player sees silently,
 * and a tier that quietly drops the trees and the birds is exactly that kind
 * of change — "the map looks emptier on my phone" is a bug report unless the
 * map says why. Small, dim, out of the thumb's way above the credit "i", and a
 * tap opens where the tier is changed.
 */
const QualityBadge = memo(function QualityBadge({ pick, onOpen }: { pick: QualityPick; onOpen?: () => void }) {
  const label = qualityLabel(pick);
  return (
    <button
      type="button"
      data-quality-tier={pick.tier}
      data-play-marker="1"
      onClick={onOpen}
      aria-label={`${label}. Change it in Settings.`}
      title={`${label} — change it in Settings`}
      style={{
        position: "absolute",
        right: 8,
        bottom: BADGE_BOTTOM,
        zIndex: 21,
        padding: "3px 8px",
        border: "1px solid rgba(31,32,34,0.14)",
        borderRadius: 999,
        background: "rgba(249,249,249,0.82)",
        color: "rgba(31,32,34,0.72)",
        font: "700 10px/1.2 var(--type-family, system-ui)",
        whiteSpace: "nowrap",
        cursor: onOpen ? "pointer" : "default",
      }}
    >
      {label}
    </button>
  );
});
