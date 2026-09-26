import { memo, useEffect, useMemo, useRef, useState } from "react";
import campus_shape from "./asset/campus-shape.json" with { type: "json" };
import Botanical from "./botanical";
import { BUILDING_ATTRIBUTION, building as campus_building } from "./building";
import Skyline, { type LabelRect, type SkylineStyle } from "./skyline";
import { Walker, type Stage } from "./character";
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
  sectorStroke,
  sector as sector_row,
  type Sector,
} from "./sector";
import TileMap, { groundBox, type Projection, type View } from "./tile-map";
import Horizon from "./horizon";
import Flora, { type GlassFind, type Tuft } from "./flora";
import { ToonDefs, ToonFind } from "./toon";
import { RARITY_ORDER, type Spawn } from "./spawn";
import { kindOf } from "./kind";
import { KindPath, KIND_TONE } from "./kind-mark";
import RemoteWalkerLayer, { HallCount, type Hall } from "./remote-walker";
import PetEagle from "./pet-eagle";
import { avatarPx, clampPitch, PITCH_MAX, PITCH_MIN, pitchForZoom, roadCasingPx, roadWidthPx, walkStopMs } from "./camera-feel";
import FrameProbe from "./frame-probe";
import { JOYSTICK_BOX } from "./joystick";
import { speciesNameText } from "./ui";

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

interface ShapeFile {
  attribution: string;
  path: { is_road: boolean; is_outside?: boolean; point: [number, number][] }[];
  building: { point: [number, number][] }[];
}
const shape = campus_shape as unknown as ShapeFile;

const campus_path = shape.path.filter((p) => !p.is_outside);
const outside_path = shape.path.filter((p) => p.is_outside);

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
/** Is this point inside a `[lat, lon]` ring? Even-odd ray cast. */
function ringContains(ring: [number, number][], at: LatLon): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [ay, ax] = ring[i];
    const [by, bx] = ring[j];
    if (ay > at.lat !== by > at.lat && at.lon < ((bx - ax) * (at.lat - ay)) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

/** Building footprints with their boxes, padded by about a metre, for the tuft test. */
const building_box = campus_building.map((b) => {
  let lat0 = Infinity, lat1 = -Infinity, lon0 = Infinity, lon1 = -Infinity;
  for (const [lat, lon] of b.point) {
    if (lat < lat0) lat0 = lat; if (lat > lat1) lat1 = lat;
    if (lon < lon0) lon0 = lon; if (lon > lon1) lon1 = lon;
  }
  const pad = 1.2 / 111_320;
  return { ring: b.point, lat0: lat0 - pad, lat1: lat1 + pad, lon0: lon0 - pad, lon1: lon1 + pad };
});

/**
 * On a roof, or so close to a wall its canopy would sit on one. Sectors carry
 * a `built_ratio`, so a wooded sector still has buildings in it, and a tuft
 * checked only against the sector stood on the Skyline's roofs.
 */
function isOnBuilding(at: LatLon): boolean {
  const m = 2.5 / 111_320;
  for (const b of building_box) {
    if (at.lat < b.lat0 || at.lat > b.lat1 || at.lon < b.lon0 || at.lon > b.lon1) continue;
    if (ringContains(b.ring, at)) return true;
    /* A metre or two outside the wall still puts the crown over the roof. */
    for (const [dy, dx] of [[m, 0], [-m, 0], [0, m], [0, -m]]) {
      if (ringContains(b.ring, { lat: at.lat + dy, lon: at.lon + dx })) return true;
    }
  }
  return false;
}

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
      if (isOnBuilding({ lat, lon })) continue;
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

/** The right-hand map controls, as a screen-space box labels stay out of. */
const CONTROL_KEEP_OUT_X = 76;
const CONTROL_KEEP_OUT_Y = 300;

/**
 * Which sectors get to speak.
 *
 * Biggest first, the one underfoot always, and anything whose pill would
 * overlap a pill already placed is dropped rather than shrunk — an unreadable
 * label is worse than no label. Capped at seven because that is roughly what a
 * 390 px screen holds without becoming the thing we were asked to fix.
 */
function pickLabel(
  row: Sector[],
  here: Sector | null,
  projection: Projection,
  avoid: { x: number; y: number } | null,
  /* The finds on the glass: a pin's head and sparkle over a name hides both. */
  find_rect: readonly LabelRect[],
): LabelPlace[] {
  const placed: LabelPlace[] = [];
  const spoken = new Set<string>();
  /* The ground underfoot is already named on the HUD card; a second pill of
     the same name beside the walker was the one label on screen that said
     nothing new. */
  const ordered = [...row].filter((s) => s.sector_code !== here?.sector_code).sort((a, b) => {
    if (here) {
      if (a.sector_code === here.sector_code) return -1;
      if (b.sector_code === here.sector_code) return 1;
    }
    return b.area_m2 - a.area_m2;
  });
  const { project, toScreen, width, height } = projection;
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

    const p = toScreen(project({ lat: s.label_point[0], lon: s.label_point[1] }));
    const half_w = halfWidth(s);

    /* Fully on screen, pill included — a clipped label is worse than none. */
    if (p.x - half_w < 6 || p.x + half_w > width - 6) continue;
    /* Not up in the fog, where the rake makes a pill unreadable and the
       ground it names has faded out, and not down where the stage card and
       the shutter live — a pill behind a button is a pill nobody reads. */
    if (projection.fogOf(project({ lat: s.label_point[0], lon: s.label_point[1] })) > 0.3 || p.y < projection.horizon.y + 30 || p.y > height * 0.84) continue;
    /* Not under the right-hand control column (weather, layers, locate,
       compass and the walker count — ~300 px tall on every screen size). */
    if (p.x + half_w > width - CONTROL_KEEP_OUT_X && p.y < CONTROL_KEEP_OUT_Y) continue;
    /* Not on top of the walker. `avoid` is their FEET, and the figure stands
       ~110 px up from there, so the keep-out box runs up the whole body. */
    if (avoid && Math.abs(p.x - avoid.x) < half_w + 40 && p.y > avoid.y - 150 && p.y < avoid.y + 24) continue;

    const hit = placed.some(
      (q) => Math.abs(q.screen_x - p.x) < half_w + halfWidth(q.row) + 10 && Math.abs(q.screen_y - p.y) < 46,
    );
    if (hit) continue;
    if (find_rect.some((f) => Math.abs(f.x - p.x) < f.half_w + half_w && Math.abs(f.y - p.y) < f.half_h + 14)) continue;

    spoken.add(base);
    placed.push({ row: s, screen_x: p.x, screen_y: p.y, scale: p.scale });
  }
  return placed;
}

/** A sector pill's screen box, for the skyline's names to keep off. */
function pillRectOf(place: LabelPlace, is_here: boolean): LabelRect {
  const k = Math.max(0.72, Math.min(1.1, place.scale));
  const chars = Math.min(place.row.name.length, 24);
  return {
    x: place.screen_x,
    y: place.screen_y,
    half_w: ((chars * (is_here ? 7.4 : 6.6) + (is_here ? 24 : 18)) / 2) * k + 4,
    half_h: ((is_here ? 28 : 22) / 2) * k + 4,
  };
}

/**
 * The ground: sector fills, grass, building contact patches, walkways and the
 * restricted gray. (The trees and bushes stand up in `flora.tsx`.)
 *
 * None of it depends on where the walker is to the pixel — only on `project`,
 * which the raked camera anchors (see `ANCHOR_GRID` in `tile-map.tsx`), and on
 * the cull circle, which moves in `CULL_GRID` steps. Memoised on exactly that,
 * so the 20 Hz walker updates and the 60 Hz camera glide leave it alone; it is
 * re-rendered when the anchor or the cull steps, the zoom changes, or the
 * sector underfoot changes.
 *
 * And CULLED to a circle around the camera. The whole campus is ~1,400
 * elements, and at the street camera almost all of them are kilometres of
 * plane pixels off the glass — but every one of them still cost paint and
 * layerisation on every frame the plane moved. Measured in a headless Chrome
 * (390x844, moving only the plane's transform): ~20 fps with the whole campus
 * in the SVG, ~65 fps with only what is near. Past the circle the view is
 * solid distance fog anyway (`horizon.tsx`).
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
            stroke={is_here ? "#F0B429" : sectorStroke(row)}
            strokeWidth={is_here ? 4.5 : 1}
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
      {sector_row
        .filter((row) => row.is_biome && near(row.point))
        .map((row) => (
          <path key={`g${row.sector_code}`} d={ringPath(row.point, project, true)} fill="url(#pm-grass)" stroke="none" />
        ))}

      {/* 2 · where each building meets the ground is drawn by `Skyline`
             with the building itself, so a patch never outlives its prism. */}

      {/* 3a · the city outside, at a whisper.
             Cutting it entirely left campus floating in a void, which
             reads as isolation rather than as a boundary. Faded says
             "this continues, you just do not play here" without
             inviting anyone into Katipunan traffic. */}
      {outside_path.map((p, i) => near(p.point) && (
        <path
          key={`po${i}`}
          d={ringPath(p.point, project, false)}
          fill="none"
          stroke={is_night ? "rgba(160,176,214,0.3)" : "rgba(255,255,255,0.34)"}
          strokeWidth={roadWidthPx(p.is_road, plane_meter_per_pixel) * 0.7}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}

      {/* 3b · the ways the sectors were cut along, at their real width.
             Widths are metres turned into plane pixels (`roadWidthPx`: a
             campus road 5.5 m, a footpath 2.6 m), so a path is as wide as
             the ground it covers at every zoom instead of a fixed 9 px that
             was a ribbon at z19 and a thread at z22. An edge, a sand-coloured
             walk, and on roads a dashed centre line once there is room. */}
      {(() => {
        const road_fill = roadWidthPx(true, plane_meter_per_pixel);
        const dash = Math.max(4, 1.6 / Math.max(plane_meter_per_pixel, 0.001));
        const shown = campus_path.filter((p) => near(p.point));
        return (
          <g fill="none" strokeLinecap="round" strokeLinejoin="round">
            {shown.map((p, i) => (
              <path
                key={`pc${i}`}
                d={ringPath(p.point, project, false)}
                stroke={is_night ? (p.is_road ? "#9A86C0" : "#8E88BC") : p.is_road ? "#C8BD9F" : "#DCC188"}
                strokeWidth={roadCasingPx(roadWidthPx(p.is_road, plane_meter_per_pixel))}
              />
            ))}
            {shown.map((p, i) => (
              <path
                key={`pf${i}`}
                d={ringPath(p.point, project, false)}
                stroke={is_night ? (p.is_road ? "#3E4A86" : "#6C6AA2") : p.is_road ? "#ECE5D2" : "#F4E6BC"}
                strokeWidth={roadWidthPx(p.is_road, plane_meter_per_pixel)}
              />
            ))}
            {road_fill > 16 &&
              shown
                .filter((p) => p.is_road)
                .map((p, i) => (
                  <path
                    key={`pd${i}`}
                    d={ringPath(p.point, project, false)}
                    stroke={is_night ? "rgba(255,246,220,0.45)" : "rgba(255,255,255,0.95)"}
                    strokeWidth={Math.max(1.5, road_fill * 0.035)}
                    strokeDasharray={`${dash * 1.6} ${dash * 1.4}`}
                    strokeLinecap="butt"
                  />
                ))}
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

/** The ground's cull circle moves in steps of this many plane px. See `Ground`. */
const CULL_GRID = 256;

/** The ground layer's box turns with the camera in steps of this many degrees. */
const BOX_STEP = 15;
/** Rows of ground kept below the glass, so a turn never shows the box's near edge. */
const BOX_PAD_ROW = 48;
/** Plane px of slack for the glide trailing its target. */
const BOX_LAG_PX = 128;

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
  /* A glass bubble on a stalk, in the toon kit's grammar (see `toon.tsx`):
     one outline, a cel band on the side away from the light, a sheen, a
     whisper of shadow. */
  return (
    <div className="pm-bubble-wrap" style={{ width: model }}>
      <div className="pm-bubble pm-find-head" data-logged={is_logged} style={{ width: model, height: model }} aria-label={label}>
        <div style={{ width: "84%" }}>
          <Botanical species_code={species_code} is_silhouette={is_logged} />
        </div>
        <span className="pm-bubble-shine" aria-hidden />
      </div>
      <div className="pm-bubble-stalk" />
      <div className="pm-bubble-disc" />
    </div>
  );
});

/**
 * A world find as a toon orb on a stalk (`ToonFind`): the taxon's tone, the
 * kind mark, and the rarity as a count of sparkles (a SHAPE, so it survives
 * greyscale — the same rule the rarity pill keeps). It bobs, because a find
 * that sits still reads as a pin.
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
  const tick = row.rarity ? RARITY_ORDER.indexOf(row.rarity) + 1 : 0;
  return (
    <ToonFind
      tone={KIND_TONE[kind]}
      is_logged={is_logged}
      sparkle={Math.max(0, tick - 1)}
      is_in_range={in_range}
      glyph={<KindPath kind={kind} />}
      label={`${speciesNameText(row.common_name, row.scientific_name)} — ${kind}${row.rarity ? `, ${row.rarity}` : ""}`}
      delay_s={-(row.spawn_id.length % 7) * 0.31}
    />
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
  is_night = false,
}: Props) {
  const here = useMemo(() => (fix ? sectorAt(fix) : null), [fix]);
  /* Every find, and the walker: painted scenery keeps off all of them. */
  const keep_clear = useMemo<LatLon[]>(
    () => [...marker, ...spawn, ...(fix ? [fix] : [])],
    [spawn, fix?.lat, fix?.lon],
  );

  /* Pitch = the zoom's resting pitch plus whatever two fingers added. Kept as
     an OFFSET so zooming still eases the tilt after somebody has adjusted it,
     and local to this view so a tilt does not re-render the app. */
  /* `?pitch=` is the twin of `?bearing=` and `?zoom=`: a view parameter so a
     screenshot at a known rake is reproducible. Clamped by `clampPitch` below,
     so it cannot reach a pitch the gesture cannot. */
  const [pitch_offset, setPitchOffset] = useState(() => {
    const raw = new URLSearchParams(window.location.search).get("pitch");
    const degree = Number(raw);
    return raw !== null && Number.isFinite(degree) ? degree - pitchForZoom(view.zoom) : 0;
  });
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
           under the current camera. That is `screenAngleOf` — the inverse of
           the stick's `headingFromStick`, so a walker leans the way they are
           going at every bearing. */
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
        /* A find's spot on the glass, its size, and how far into the fog it
           stands. Null once the fog has swallowed it or it is off the glass —
           faded out by distance on the way, so it never blinks into being at
           a fixed line. The size is the perspective scale — what the plane's
           rake gave a find when it lived there — eased with zoom: at the wide
           end a full-size orb covered a sector. */
        const find_zoom_k = Math.min(1.05, Math.max(0.6, 0.6 + (projection.zoom - 19) * 0.15));
        /* The stick's box on the glass (it is only there on a stick walk). */
        const stick =
          fix?.source === "play"
            ? {
                x0: JOYSTICK_BOX.left - 6,
                x1: JOYSTICK_BOX.left + JOYSTICK_BOX.size + 6,
                y0: projection.height - JOYSTICK_BOX.bottom - JOYSTICK_BOX.size - 6,
                y1: projection.height - JOYSTICK_BOX.bottom + 6,
              }
            : null;
        const toScreenFind = (point: LatLon) => {
          const plane = projection.project(point);
          const at = projection.toScreen(plane);
          if (at.scale <= 0 || at.y < projection.horizon.y || at.y > projection.height + 40) return null;
          if (at.x < -60 || at.x > projection.width + 60) return null;
          const fog = projection.fogOf(plane);
          if (fog > 0.95) return null;
          const k = Math.min(1.3, Math.max(0.5, at.scale * find_zoom_k));
          return { x: at.x, y: at.y, k, fog };
        };
        /* Under the stick a find can be seen and not tapped — the stick is on
           top and takes the touch as a walk. So it is not drawn there: step or
           turn and it comes back out, where a thumb can reach it. */
        const isUnderStick = (x: number, y: number, w: number, h: number) =>
          stick !== null && x + w / 2 > stick.x0 && x - w / 2 < stick.x1 && y > stick.y0 && y - h < stick.y1;
        /* Finds, on the GLASS rather than in the ground.
           They used to live in the tilted plane, which welded them to their
           spot for free — and put them under everything on the glass, because
           the plane paints below the whole overlay: every tree covered every
           find, even a tree behind it, and a find behind a building vanished.
           Up here they are sized by the same perspective scale as the trees,
           and `Flora` paints them in one depth order with the trees. */
        const glass_find: GlassFind[] = [];
        /* Resident finds: large botanical model, tiny stem chrome — not a map pin. */
        for (const e of marker) {
          const sp = species[e.species_code];
          const pin_kind = pinKindOf(sp);
          if (pin_filter && pin_filter.size > 0 && !pin_filter.has(pin_kind)) continue;
          const p = toScreenFind({ lat: e.lat, lon: e.lon });
          if (!p) continue;
          const is_logged = seen_species.has(e.species_code);
          const in_range = fix ? distanceMeter(fix, e) <= AT_TREE_RADIUS_M : false;
          const model = is_desktop ? 64 : 56;
          if (isUnderStick(p.x, p.y, model * p.k, (model + 15) * p.k)) continue;
          glass_find.push({
            key: `pin-${e.encounter_id}`,
            x: p.x,
            y: p.y,
            w: model * p.k,
            h: (model + 15) * p.k,
            fog: p.fog,
            is_in_reach: in_range,
            node: (
              <div
                data-play-marker="1"
                onClick={() => onSelectEncounter(e)}
                title={sp ? `${speciesNameText(sp.common_name, sp.scientific_name)} — demo-map position` : e.where}
                style={{
                  position: "absolute",
                  left: p.x,
                  top: p.y,
                  transform: `translate(-50%, -100%) scale(${p.k.toFixed(3)})`,
                  transformOrigin: "50% 100%",
                  cursor: "pointer",
                  filter: in_range ? "drop-shadow(0 0 10px rgba(255,255,255,0.65))" : undefined,
                }}
              >
                <ResidentOrb species_code={e.species_code} is_logged={is_logged} model={model} label={`${sp ? speciesNameText(sp.common_name, sp.scientific_name) : "A find"} — ${pin_kind}`} />
              </div>
            ),
          });
        }
        /* Temporary world finds: a toon orb on a stalk, same kind mark. */
        for (const row of spawn) {
          const p = toScreenFind(row);
          if (!p) continue;
          const kind = kindOf(row.iconic_taxon_name, row.archetype);
          const in_range = fix ? distanceMeter(fix, row) <= AT_TREE_RADIUS_M : false;
          if (isUnderStick(p.x, p.y, 66 * p.k, 96 * p.k)) continue;
          glass_find.push({
            key: row.spawn_id,
            x: p.x,
            y: p.y,
            w: 66 * p.k,
            h: 96 * p.k,
            fog: p.fog,
            is_in_reach: in_range,
            node: (
              <div
                data-play-marker="1"
                onClick={onSelectSpawn ? () => onSelectSpawn(row) : undefined}
                title={`${speciesNameText(row.common_name, row.scientific_name)}${row.rarity ? ` — ${row.rarity}` : ""}, out until ${new Date(row.ends_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
                style={{
                  position: "absolute",
                  left: p.x,
                  top: p.y,
                  transform: `translate(-50%, -100%) scale(${p.k.toFixed(3)})`,
                  transformOrigin: "50% 100%",
                  cursor: onSelectSpawn ? "pointer" : undefined,
                  filter: in_range ? "drop-shadow(0 0 8px rgba(255,255,255,0.55))" : undefined,
                }}
              >
                <SpawnSticker row={row} kind={kind} is_logged={seen_species.has(row.species_code)} in_range={in_range} />
              </div>
            ),
          });
        }
        /* The finds' boxes (a pin's head, its sparkle), for the names to avoid. */
        const find_rect: LabelRect[] = glass_find.map((f) => ({ x: f.x, y: f.y - f.h / 2, half_w: f.w / 2 + 4, half_h: f.h / 2 + 4 }));
        /* The stick covers whatever name sits under it, so names yield to it too. */
        const stick_rect: LabelRect[] = stick
          ? [{ x: (stick.x0 + stick.x1) / 2, y: (stick.y0 + stick.y1) / 2, half_w: (stick.x1 - stick.x0) / 2, half_h: (stick.y1 - stick.y0) / 2 }]
          : [];
        const label = pickLabel(biome_sector, here, projection, walker_at, [...find_rect, ...stick_rect]);
        /* Building names yield to the sector pills, the finds and the stick. */
        const label_rect = label.map((l) => pillRectOf(l, here?.sector_code === l.row.sector_code));
        const name_avoid: LabelRect[] = [
          ...label_rect,
          ...find_rect,
          ...stick_rect,
        ];
        /* The walker, drawn on the glass rather than in the ground — and in
           the standee layer with the trees, finds and buddy, so depth decides
           who covers whom. (It used to live inside the tilted plane and
           counter-rotate out of it; the skyline is painted above the plane, so
           a walker down there went behind the first building they stood near.
           Up here `toScreen` has already applied the rake, so the figure is
           simply upright.)

           Welded camera: the walker IS the camera centre, so it is drawn at the
           centre the camera is gliding through this frame, not at the fix the
           camera is still easing toward. Drawn at the fix it stepped across the
           glass at 20 Hz over smoothly moving ground, which was most of the
           "jittery" in the 09-25 note. Following (the view's target IS the fix)
           counts too. The 25 m guard covers a camera sent somewhere else while
           locked. */
        const walker = (() => {
          if (!fix) return null;
          const is_on_camera =
            (is_camera_locked || (view.lat === fix.lat && view.lon === fix.lon)) && distanceMeter(view, fix) < 25;
          const anchor = is_on_camera ? projection.centre : fix;
          const at = projection.toScreen(projection.project(anchor));
          const avatar_px = avatarPx(view.zoom, Math.min(projection.width, projection.height));
          const scale = Math.max(0.6, Math.min(1.35, at.scale));
          return {
            anchor,
            avatar_px,
            standee: {
              x: at.x,
              y: at.y,
              w: avatar_px * scale * 0.7,
              h: avatar_px * scale,
              node: (
                <div
                  className="pm-walker"
                  style={{
                    position: "absolute",
                    left: at.x,
                    top: at.y,
                    transform: `translate(-50%, -100%) scale(${scale.toFixed(3)})`,
                    transformOrigin: "50% 100%",
                    pointerEvents: "none",
                  }}
                >
                  {/* No `tilt_degree`, no `bearing_degree`. Those props exist
                      to counter-rotate the character OUT of the tilted plane,
                      and it does not live in the plane any more — it is drawn
                      on the glass, where up is already up. Passing the bearing
                      here spun the tree by the camera angle: the visible bug
                      where the walker leans over and parts company with its own
                      shadow the moment you rotate. */}
                  <Walker
                    stage={stage}
                    vigor={vigor}
                    size={avatar_px}
                    is_walking={travel.current.is_walking}
                    heading_degree={travel.current.heading}
                  />
                </div>
              ),
            },
          };
        })();
        return (
          <>
            {/* The campus, standing up. Under the sky, over the ground, and
                below every marker — see `skyline.tsx` on why it cannot live
                in the tilted plane with the rest of the map. */}
            {/* The toon kit's gradients, once: the skyline's roofs, the trees
                and the finds all point at these ids. */}
            <ToonDefs />
            {/* The sky, the far hills and the distance fog — all from the same
                projection as the ground (`groundScreen`), so the ridge stands on
                the world's edge ring and turns at the ground's own rate. See
                `horizon.tsx`. Under the skyline and every standee: those fade
                into the fog by their own distance instead. */}
            <Horizon
              width={projection.width}
              height={projection.height}
              bearing_degree={bearing_degree}
              tilt_degree={tilt_degree}
              is_night={is_night}
            />
            <Skyline
              projection={projection}
              centre={view}
              style={skyline_style}
              avoid={walker_at}
              is_night={is_night}
              avoid_rect={name_avoid}
            />
            <RemoteWalkerLayer
              hall={hall}
              projection={projection}
              bearing_degree={bearing_degree}
              zoom={view.zoom}
              /* Tags draw over the standees, so they yield to the finds and
                 the stick as well as the area pills. */
              avoid_rect={name_avoid}
              part="overlay"
            />
            <HallCount hall={hall} />
            <Flora
              tuft={tuft}
              find={glass_find}
              projection={projection}
              centre={view}
              keep_clear={keep_clear}
              walker={walker?.standee ?? null}
              is_night={is_night}
            >
              {/* The pet eagle — companion by day, sleep pet when you stop. See
                  `pet.ts`. It sorts itself against the walker and the trees. */}
              {fix && walker && (
                <PetEagle projection={projection} fix={fix} anchor={walker.anchor} avatar_px={walker.avatar_px} stage={stage} />
              )}
              {/* Everybody else, sorted against the trees the same way; their
                  name tags stay in the overlay above. */}
              <RemoteWalkerLayer hall={hall} projection={projection} bearing_degree={bearing_degree} zoom={view.zoom} part="figure" />
            </Flora>
            {/* Birds. Pure atmosphere, screen space, no data behind them —
                they exist because a still map reads as a diagram. */}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "clip" }}>
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

            {label.map(({ row, screen_x, screen_y, scale }) => {
              const is_here = here?.sector_code === row.sector_code;
              return (
                <div
                  key={`label-${row.sector_code}`}
                  style={{
                    position: "absolute",
                    left: screen_x,
                    top: screen_y,
                    /* Screen space: no counter-rotation to undo, and the pill
                       lands exactly where the fit check said it would. It still
                       shrinks with distance so it belongs to its ground. */
                    transform: `translate(-50%, -50%) scale(${Math.max(0.72, Math.min(1.1, scale)).toFixed(2)})`,
                    pointerEvents: "none",
                    /* Over the standees (5): a tree or a walker nearer the
                       camera hid the name it stood in front of. `pickLabel`
                       keeps the pill off your walker and the finds. */
                    zIndex: 7,
                    whiteSpace: "nowrap",
                    fontSize: is_here ? 13 : 11.5,
                    fontWeight: is_here ? 800 : 700,
                    color: is_here ? "#1B2E16" : "rgba(27,46,22,0.88)",
                    background: is_here ? "rgba(255,246,222,0.97)" : "rgba(255,255,255,0.9)",
                    border: `1.5px solid ${is_here ? "#F0B429" : "rgba(255,255,255,0.95)"}`,
                    borderRadius: 999,
                    padding: is_here ? "5px 12px" : "3px 9px",
                    boxShadow: "0 2px 8px rgba(24,38,20,0.22)",
                  }}
                >
                  {row.name.length > 24 ? `${row.name.slice(0, 23)}…` : row.name}
                </div>
              );
            })}
            <FrameProbe />
          </>
        );
      }}
    >
      {(projection) => {
        const { project } = projection;
        /* The ground's cull circle. Centred on the camera's target, snapped to
           `CULL_GRID` so the `Ground` memo holds between steps (the ground is
           re-cut every ~9 m of walking at the street camera, not every frame).
           The radius is how far there is anything to see — out to the solid
           fog and across the glass at that depth (`ground_far_px`) — plus the
           snap's slack. Past it the fog is opaque, so nothing beyond can ghost
           up through the sky. */
        const target = project(view);
        const cull_x = Math.round(target.x / CULL_GRID) * CULL_GRID;
        const cull_y = Math.round(target.y / CULL_GRID) * CULL_GRID;
        const cull_r = Math.ceil((projection.ground_far_px + CULL_GRID * 0.71) / 256) * 256;
        /* The layer the ground is painted into: a box turned to face the
           camera (bearing in `BOX_STEP` steps), from just below the glass to
           the fog — see `groundBox`. It used to be the square round the cull
           circle, which ran as far behind the walker as ahead of them: past
           the eye at z21–22, where Chrome dropped the whole plane layer. The
           cull circle still picks WHICH shapes are kept; this box clips them.
           Sized for every pitch the camera allows, so a pitch flick never
           re-cuts it, and padded for the bearing step, the cull snap and the
           glide's lag. */
        const zoom_scale = projection.plane_meter_per_pixel / Math.max(projection.meter_per_pixel, 1e-9);
        const box_turn = Math.round(projection.bearing_degree / BOX_STEP) * BOX_STEP;
        const box = [PITCH_MIN, PITCH_MAX, projection.tilt_degree].reduce(
          (m, pitch) => {
            const b = groundBox(projection.width, projection.height, pitch, BOX_PAD_ROW);
            const swing = Math.hypot(b.half, b.ahead) * Math.sin(((BOX_STEP / 2) * Math.PI) / 180);
            return {
              ahead: Math.max(m.ahead, b.ahead + swing),
              back: Math.max(m.back, b.back + swing),
              half: Math.max(m.half, b.half + swing),
            };
          },
          { ahead: 0, back: 0, half: 0 },
        );
        const box_slack = CULL_GRID * 0.71 + BOX_LAG_PX;
        const box_left = -Math.ceil(box.half / zoom_scale + box_slack);
        const box_top = -Math.ceil(box.ahead / zoom_scale + box_slack);
        const box_w = -2 * box_left;
        const box_h = Math.ceil(box.back / zoom_scale + box_slack) - box_top;
        return (
          <>
            {/* Turned so its axes face the camera: the plane turns by the
                bearing, this by minus its step, so the box's top edge runs
                across the glass and the SVG inside is turned back. */}
            <div
              style={{
                position: "absolute",
                left: cull_x,
                top: cull_y,
                width: 0,
                height: 0,
                transform: `rotate(${-box_turn}deg)`,
                transformOrigin: "0 0",
                pointerEvents: "none",
              }}
            >
            <svg
              viewBox={`${box_left} ${box_top} ${box_w} ${box_h}`}
              style={{
                position: "absolute",
                left: box_left,
                top: box_top,
                overflow: "hidden",
                pointerEvents: "none",
                /* No `filter` here, by day or night. Both grades are done on
                   the numbers inside `Ground` — `gradeFill` takes the sector
                   ramp to a blue dusk at night and down in saturation only by
                   day, and the paths carry their own night colours — because
                   Chrome drops the grass pattern and the buildings under a
                   filter on this plane. */
              }}
              width={box_w}
              height={box_h}
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

              <g transform={`rotate(${box_turn}) translate(${-cull_x} ${-cull_y})`}>
              <Ground
                project={project}
                /* Four figures: the exact value drifts with latitude on every
                   step, which would defeat the memo for no visible change. */
                plane_meter_per_pixel={Number(projection.plane_meter_per_pixel.toPrecision(4))}
                here_code={here?.sector_code ?? null}
                is_restricted_on={is_restricted_on}
                is_night={is_night}
                /* See the cull circle above. It used to be centred on the
                   2,048 px anchor and padded to match, which drew about twice
                   the ground. */
                cull_x={cull_x}
                cull_y={cull_y}
                cull_r={cull_r}
              />

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
                  {/* No shadow dot: the bubble carries its own ground disc.
                      The in-range ripple is NOT drawn here — see `Ripple`. A
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
              </g>
            </svg>
            </div>

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
  );
}
