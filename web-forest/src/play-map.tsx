import { useMemo, useRef } from "react";
import campus_shape from "./asset/campus-shape.json" with { type: "json" };
import Botanical from "./botanical";
import { BUILDING_ATTRIBUTION, building as campus_building } from "./building";
import Skyline, { type SkylineStyle } from "./skyline";
import Character, { type Stage } from "./character";
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
import TileMap, { type Projection, type View } from "./tile-map";
import { RARITY_ORDER, type Spawn } from "./spawn";
import { kindOf } from "./kind";
import { KindPath, KIND_TONE } from "./kind-mark";
import PetEagle from "./pet-eagle";

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

/* 52° play-view rake. Earlier 46° left the walker feeling small on a flat
   diagram; sky haze is handled by the gradient overlay rather than by flattening. */
const TILT_DEGREE = 52;
const GROUND = "#CFE3BD";
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
function scatterTuft(): { lat: number; lon: number; r: number; dark: boolean }[] {
  const out: { lat: number; lon: number; r: number; dark: boolean }[] = [];
  for (const s of biome_sector) {
    const veg = s.vegetation_ratio ?? 0;
    if (veg < 0.55) continue;
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
    const want = Math.min(26, Math.round((s.area_m2 / 900) * veg));
    let tries = 0;
    let made = 0;
    while (made < want && tries < want * 12) {
      tries += 1;
      const lat = lat0 + random() * (lat1 - lat0);
      const lon = lon0 + random() * (lon1 - lon0);
      if (!sectorContains(s, { lat, lon })) continue;
      out.push({ lat, lon, r: 3.4 + random() * 4.6, dark: s.kind === "wood" || veg > 0.85 });
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
): LabelPlace[] {
  const placed: LabelPlace[] = [];
  const spoken = new Set<string>();
  const ordered = [...row].sort((a, b) => {
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
    /* Not up in the haze, where the rake makes a pill unreadable. */
    /* Not up in the haze, and not down where the stage card and the shutter
       live — a pill behind a button is a pill nobody reads. */
    if (p.y < height * 0.3 || p.y > height * 0.84) continue;
    /* Not on top of the walker, who is drawn at the centre. */
    if (avoid && Math.abs(p.x - avoid.x) < half_w + 34 && Math.abs(p.y - avoid.y) < 62) continue;

    const hit = placed.some(
      (q) => Math.abs(q.screen_x - p.x) < half_w + halfWidth(q.row) + 10 && Math.abs(q.screen_y - p.y) < 46,
    );
    if (hit) continue;

    spoken.add(base);
    placed.push({ row: s, screen_x: p.x, screen_y: p.y, scale: p.scale });
  }
  return placed;
}

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
}: Props) {
  const here = useMemo(() => (fix ? sectorAt(fix) : null), [fix]);

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
    } else if (Date.now() - prev.at > 2500) {
      travel.current = { ...travel.current, is_walking: false };
    }
  }

  return (
    <TileMap
      view={view}
      onView={onView}
      onGesture={onGesture}
      layer="guide"
      tilt_degree={TILT_DEGREE}
      bearing_degree={bearing_degree}
      onBearing={onBearing}
      is_tile_hidden
      ground={GROUND}
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
        const label = pickLabel(
          biome_sector,
          here,
          projection,
          fix ? projection.toScreen(projection.project(fix)) : null,
        );
        return (
          <>
            {/* The rake opens a band of empty ground above the campus. Left
                flat it reads as a rendering bug; a sky hazing into the ground
                reads as distance instead, which is what it actually is. */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                pointerEvents: "none",
                background:
                  "linear-gradient(180deg, #8FD0F7 0%, #C6E8FB 10%, rgba(214,238,210,0.9) 18%, rgba(214,238,206,0.5) 25%, rgba(214,238,206,0) 33%)",
              }}
            />
            {/* The campus, standing up. Under the sky, over the ground, and
                below every marker — see `skyline.tsx` on why it cannot live
                in the tilted plane with the rest of the map. */}
            <Skyline projection={projection} centre={view} style={skyline_style} />

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
              const at = projection.toScreen(projection.project(fix));
              return (
                <div
                  style={{
                    position: "absolute",
                    left: at.x,
                    top: at.y,
                    transform: `translate(-50%, -100%) scale(${Math.max(0.6, Math.min(1.35, at.scale)).toFixed(3)})`,
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
                  <Character
                    stage={stage}
                    vigor={vigor}
                    size={is_desktop ? 128 : 108}
                    is_walking={travel.current.is_walking}
                    heading_degree={travel.current.heading}
                  />
                </div>
              );
            })()}
            {/* The pet eagle — companion by day, sleep pet when you stop. See `pet.ts`. */}
            {fix && <PetEagle projection={projection} fix={fix} size={is_desktop ? 72 : 60} />}
            {/* Birds. Pure atmosphere, screen space, no data behind them —
                they exist because a still map reads as a diagram. */}
            <div style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
              <style>{`
                @keyframes yc-fly-a { from { transform: translate(-12vw, 0) } to { transform: translate(112vw, -22px) } }
                @keyframes yc-fly-b { from { transform: translate(-18vw, 0) } to { transform: translate(118vw, 14px) } }
                @keyframes yc-flap { 0%,100% { transform: scaleY(1) } 50% { transform: scaleY(0.45) } }
                @media (prefers-reduced-motion: reduce) {
                  .yc-bird, .yc-bird svg { animation: none !important }
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
          </>
        );
      }}
    >
      {(projection) => {
        const { project, width, height } = projection;

        return (
          <>
            <svg
              style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}
              width={width}
              height={height}
            >
              <defs>
                <pattern id="pm-restricted" width="10" height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <rect width="10" height="10" fill="rgba(120,86,58,0.14)" />
                  <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(96,66,40,0.5)" strokeWidth="2.4" />
                </pattern>
                {/* Grass, the posters' way: tufts and the odd plumeria over the
                    measured fill. It only ever sits on biome ground, so asphalt
                    stays asphalt; the fill underneath still carries the data. */}
                <pattern id="pm-grass" width="46" height="46" patternUnits="userSpaceOnUse">
                  <path
                    d="M6,14 q1,-6 -2,-9 q5,3 5,9 q1,-7 5,-10 q-3,5 -2,10 M28,36 q1,-6 -2,-9 q5,3 5,9 q1,-7 5,-10 q-3,5 -2,10"
                    fill="none"
                    stroke="rgba(18,78,38,0.26)"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />
                  <path d="M30,10 q2,-4 5,-5 M12,34 q2,-4 5,-5" fill="none" stroke="rgba(255,255,220,0.35)" strokeWidth="1.6" strokeLinecap="round" />
                  <circle cx="40" cy="22" r="2.1" fill="rgba(255,255,255,0.8)" />
                  <circle cx="40" cy="22" r="0.8" fill="rgba(245,200,66,0.95)" />
                </pattern>
              </defs>

              {/* 1 · sector fills — the map itself */}
              {sector_row.map((row) => {
                const is_here = here?.sector_code === row.sector_code;
                return (
                  <path
                    key={row.sector_code}
                    d={ringPath(row.point, project, true)}
                    fill={sectorFill(row)}
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
                .filter((row) => row.is_biome)
                .map((row) => (
                  <path key={`g${row.sector_code}`} d={ringPath(row.point, project, true)} fill="url(#pm-grass)" stroke="none" />
                ))}

              {/* 2 · where each building MEETS the ground.
                     The building itself is a prism drawn in screen space by
                     `Skyline` — this is only its contact patch, which has to
                     stay in the plane so it stays welded to the sector under
                     it. Drawn dark rather than pale: a prism rising out of a
                     light block looks like it is floating on one. */}
              {campus_building.map((b, i) => (
                <path
                  key={`b${i}`}
                  d={ringPath(b.point, project, true)}
                  fill="rgba(104,96,78,0.30)"
                  stroke="none"
                />
              ))}

              {/* 3a · the city outside, at a whisper.
                     Cutting it entirely left campus floating in a void, which
                     reads as isolation rather than as a boundary. Faded says
                     "this continues, you just do not play here" without
                     inviting anyone into Katipunan traffic. */}
              {outside_path.map((p, i) => (
                <path
                  key={`po${i}`}
                  d={ringPath(p.point, project, false)}
                  fill="none"
                  stroke="rgba(255,255,255,0.34)"
                  strokeWidth={3.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}

              {/* 3b · the ways the sectors were cut along — casing then fill,
                     so they read as walkable ribbons, not hairlines */}
              {campus_path.map((p, i) => (
                <path
                  key={`pc${i}`}
                  d={ringPath(p.point, project, false)}
                  fill="none"
                  stroke="rgba(255,255,255,0.85)"
                  strokeWidth={p.is_road ? 9 : 5.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {campus_path.map((p, i) => (
                <path
                  key={`pf${i}`}
                  d={ringPath(p.point, project, false)}
                  fill="none"
                  stroke={p.is_road ? "#F6EFE0" : "#FBF7EE"}
                  strokeWidth={p.is_road ? 6 : 3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}

              {/* 4 · ambient life. Deterministic, decorative, and never a
                     claim: these are not surveyed trees, they are texture so a
                     wooded sector looks wooded. `is_biome` gates them, so
                     nothing sprouts on a car park. */}
              {tuft.map((t, i) => (
                <g key={`t${i}`} opacity={0.55}>
                  <ellipse
                    cx={project({ lat: t.lat, lon: t.lon }).x}
                    cy={project({ lat: t.lat, lon: t.lon }).y}
                    rx={t.r}
                    ry={t.r * 0.72}
                    fill={t.dark ? "rgba(28,74,34,0.55)" : "rgba(44,110,50,0.38)"}
                  />
                </g>
              ))}

              {/* 4 · restricted ground is SUBTRACTED, never overdrawn */}
              {is_restricted_on && (
                <path
                  d={ringPath(RESTRICTED_POLYGON.map((p) => [p.lat, p.lon] as [number, number]), project, true)}
                  fill="url(#pm-restricted)"
                  stroke="rgba(96,66,40,0.7)"
                  strokeWidth="2"
                  strokeDasharray="7 5"
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
                  {in_range && (
                    <>
                      <circle cx={p.x} cy={p.y} r={px * 0.55} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="2" style={{ animation: "fgpulse 1.8s ease-out infinite" }} />
                      <circle cx={p.x} cy={p.y} r={px * 0.85} fill="none" stroke="rgba(255,255,255,0.45)" strokeWidth="1.5" style={{ animation: "fgpulse 1.8s ease-out 0.45s infinite" }} />
                    </>
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
                  <circle cx={p.x} cy={p.y} r={r * 0.72} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.2" style={{ animation: "fgpulse 2.2s ease-out infinite" }} />
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

            {/* Finds: large botanical model, tiny stem chrome — not a map pin. */}
            {marker.map((e) => {
              const p = project({ lat: e.lat, lon: e.lon });
              const sp = species[e.species_code];
              const is_logged = seen_species.has(e.species_code);
              const pin_kind = pinKindOf(sp);
              if (pin_filter && pin_filter.size > 0 && !pin_filter.has(pin_kind)) return null;
              const in_range = fix ? distanceMeter(fix, e) <= AT_TREE_RADIUS_M : false;
              const model = is_desktop ? 64 : 56;
              return (
                <div
                  key={`pin-${e.encounter_id}`}
                  data-play-marker="1"
                  onClick={() => onSelectEncounter(e)}
                  title={sp ? `${sp.common_name} — demo-map position` : e.where}
                  style={{
                    position: "absolute",
                    left: p.x,
                    top: p.y,
                    transform: `translate(-50%, -100%) rotateZ(${-bearing_degree}deg) rotateX(${-TILT_DEGREE}deg)`,
                    transformOrigin: "50% 100%",
                    transformStyle: "preserve-3d",
                    cursor: "pointer",
                    zIndex: in_range ? 6 : 4,
                    filter: in_range ? "drop-shadow(0 0 10px rgba(255,255,255,0.65))" : undefined,
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: model }}>
                    <div
                      style={{
                        width: model,
                        height: model,
                        borderRadius: 999,
                        background: is_logged ? "rgba(47,107,58,0.14)" : "rgba(255,255,255,0.92)",
                        border: `2.5px solid ${is_logged ? "#2F6B3A" : "rgba(47,107,58,0.55)"}`,
                        boxShadow: "0 6px 16px rgba(24,38,20,0.22)",
                        display: "grid",
                        placeItems: "center",
                        overflow: "hidden",
                      }}
                      aria-label={`${sp?.common_name ?? "A find"} — ${pin_kind}`}
                    >
                      <div style={{ width: "86%" }}>
                        <Botanical species_code={e.species_code} is_silhouette={is_logged} />
                      </div>
                    </div>
                    <div style={{ width: 3, height: 10, background: "rgba(47,107,58,0.55)", borderRadius: 2, marginTop: 1 }} />
                    <div style={{ width: 14, height: 4, borderRadius: 999, background: "rgba(28,74,34,0.28)" }} />
                  </div>
                </div>
              );
            })}

            {/* Temporary world finds: larger disc, lighter stem, same kind mark. */}
            {spawn.map((row) => {
              const p = project(row);
              const kind = kindOf(row.iconic_taxon_name, row.archetype);
              const tone = KIND_TONE[kind];
              const tick = row.rarity ? RARITY_ORDER.indexOf(row.rarity) + 1 : 0;
              const is_logged = seen_species.has(row.species_code);
              const in_range = fix ? distanceMeter(fix, row) <= AT_TREE_RADIUS_M : false;
              return (
                <div
                  key={row.spawn_id}
                  data-play-marker="1"
                  onClick={onSelectSpawn ? () => onSelectSpawn(row) : undefined}
                  title={`${row.common_name}${row.rarity ? ` — ${row.rarity}` : ""}, out until ${new Date(row.ends_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
                  style={{
                    position: "absolute",
                    left: p.x,
                    top: p.y,
                    transform: `translate(-50%, -100%) rotateZ(${-bearing_degree}deg) rotateX(${-TILT_DEGREE}deg)`,
                    transformOrigin: "50% 100%",
                    transformStyle: "preserve-3d",
                    cursor: onSelectSpawn ? "pointer" : undefined,
                    zIndex: in_range ? 5 : 3,
                    filter: in_range ? "drop-shadow(0 0 8px rgba(255,255,255,0.55))" : undefined,
                  }}
                >
                  <svg width="48" height="58" viewBox="0 0 48 58" aria-label={`${row.common_name} — ${kind}${row.rarity ? `, ${row.rarity}` : ""}`}>
                    <ellipse cx="24" cy="54" rx="10" ry="3.6" fill="rgba(28,74,34,0.22)" />
                    <line x1="24" y1="50" x2="24" y2="34" stroke={tone} strokeWidth="1.3" strokeDasharray="2 2" opacity="0.8" />
                    {Array.from({ length: tick }, (_, i) => (
                      <circle key={i} cx="24" cy={49 - i * 3.4} r="1.5" fill={tone} />
                    ))}
                    <circle cx="24" cy="18" r="16" fill={is_logged ? tone : "#FFFFFF"} stroke={tone} strokeWidth="2" />
                    <g
                      transform="translate(10 4) scale(1.15)"
                      fill="none"
                      stroke={is_logged ? "#FFFFFF" : tone}
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <KindPath kind={kind} />
                    </g>
                  </svg>
                </div>
              );
            })}

          </>
        );
      }}
    </TileMap>
  );
}
