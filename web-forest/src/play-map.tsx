import { useMemo, useRef } from "react";
import campus_shape from "./asset/campus-shape.json" with { type: "json" };
import Character, { type Stage } from "./character";
import { RESTRICTED_POLYGON, species, type Encounter } from "./data";
import { residentBySector } from "./nearby";
import { pinKindOf, pinRingWidth, type PinKind } from "./pin";
import type { Fix } from "./geo";
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

/* 46, not 52. The steeper rake pushed so much far-field into frame that half
   the screen was haze, and it got worse the moment the camera could swing. */
const TILT_DEGREE = 46;
const GROUND = "#CFE3BD";
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
  onSelectSector: (row: Sector) => void;
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

/* Pin shape vocabulary lives in ./pin.ts — see the note there on why. */

function PinCentre({ kind, fill }: { kind: PinKind; fill: string }) {
  if (kind === "exotic") return <rect x="13" y="12" width="14" height="14" rx="2" fill={fill} />;
  if (kind === "threatened") return <path d="M20 11 L28.5 25.5 L11.5 25.5 Z" fill={fill} />;
  return <circle cx="20" cy="19" r="7.5" fill={fill} />;
}

export default function PlayMap({
  view,
  onView,
  fix,
  seen_sector,
  stage,
  vigor,
  onSelectSector,
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
        heading: (Math.atan2(dx, dy) * 180) / Math.PI - bearing_degree,
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
      overlay_attribution={`${SECTOR_ATTRIBUTION} · basemap © OpenStreetMap contributors`}
      is_chrome_hidden
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
                  "linear-gradient(180deg, #BCD9EA 0%, #C9E1E3 10%, rgba(210,232,210,0.9) 18%, rgba(214,234,206,0.5) 25%, rgba(214,234,206,0) 33%)",
              }}
            />
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
                    /* Paved ground is drawn but not offered: tapping a car
                       park to "log a tree here" is the same mistake as
                       colouring it green. */
                    style={row.is_biome ? { pointerEvents: "auto", cursor: "pointer" } : undefined}
                    onClick={row.is_biome ? () => onSelectSector(row) : undefined}
                  />
                );
              })}

              {/* 2 · buildings as flat blocks, so the ground reads as a campus */}
              {shape.building.map((b, i) => (
                <path
                  key={`b${i}`}
                  d={ringPath(b.point, project, true)}
                  fill="#E8E2D6"
                  stroke="#CFC6B4"
                  strokeWidth="1"
                  strokeLinejoin="round"
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

              {/* 5 · the ground shadow under each find, drawn with the map so it
                   sits ON the sector. The pin itself billboards above it. */}
            {marker.map((e) => {
              const p = project({ lat: e.lat, lon: e.lon });
              return <ellipse key={`sh-${e.encounter_id}`} cx={p.x} cy={p.y} rx="15" ry="10" fill="rgba(28,74,34,0.20)" />;
            })}

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

            {/* The finds, standing up out of the plane like the walker does.
                A flat dot on the ground reads as a map symbol; a pin standing
                against raked ground reads as a thing over there worth walking
                to, which is the loop this view exists for. */}
            {marker.map((e) => {
              const p = project({ lat: e.lat, lon: e.lon });
              const sp = species[e.species_code];
              const is_logged = seen_species.has(e.species_code);
              const pin_kind = pinKindOf(sp);
              /* No filter set means every kind is drawn. */
              if (pin_filter && pin_filter.size > 0 && !pin_filter.has(pin_kind)) return null;
              return (
                <div
                  key={`pin-${e.encounter_id}`}
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
                    zIndex: 4,
                  }}
                >
                  <svg
                    width="40"
                    height="52"
                    viewBox="0 0 40 52"
                    aria-label={`${sp?.common_name ?? "A find"} — ${pin_kind}`}
                  >
                    <path
                      d="M20 51 C20 51 4 30 4 19 A16 16 0 0 1 36 19 C36 30 20 51 20 51 Z"
                      fill={is_logged ? "#2F6B3A" : "#FFFFFF"}
                      stroke="#2F6B3A"
                      strokeWidth={pinRingWidth(pin_kind)}
                      strokeLinejoin="round"
                    />
                    <PinCentre kind={pin_kind} fill={is_logged ? "#FFFFFF" : "#2F6B3A"} />
                  </svg>
                </div>
              );
            })}

            {/* The world's finds for this window.
                They are drawn DIFFERENTLY from the surveyed markers above on
                purpose. A surveyed encounter is a tree that is really there and
                gets a solid pin; a spawn is a thing that is out for the next
                half hour, so it gets a floating disc over a ground ring — the
                grammar for "temporary" — and the ring's tick count carries the
                rarity, so it survives greyscale like the pins do. */}
            {spawn.map((row) => {
              const p = project(row);
              const kind = kindOf(row.iconic_taxon_name, row.archetype);
              const tone = KIND_TONE[kind];
              const tick = RARITY_ORDER.indexOf(row.rarity) + 1;
              const is_logged = seen_species.has(row.species_code);
              return (
                <div
                  key={row.spawn_id}
                  onClick={onSelectSpawn ? () => onSelectSpawn(row) : undefined}
                  title={`${row.common_name} — ${row.rarity}, out until ${new Date(row.ends_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
                  style={{
                    position: "absolute",
                    left: p.x,
                    top: p.y,
                    transform: `translate(-50%, -100%) rotateZ(${-bearing_degree}deg) rotateX(${-TILT_DEGREE}deg)`,
                    transformOrigin: "50% 100%",
                    transformStyle: "preserve-3d",
                    cursor: onSelectSpawn ? "pointer" : undefined,
                    zIndex: 3,
                  }}
                >
                  <svg width="38" height="50" viewBox="0 0 38 50" aria-label={`${row.common_name} — ${kind}, ${row.rarity}`}>
                    <ellipse cx="19" cy="47" rx="9" ry="3.4" fill="rgba(28,74,34,0.22)" />
                    <line x1="19" y1="44" x2="19" y2="30" stroke={tone} strokeWidth="1.4" strokeDasharray="2 2" opacity="0.85" />
                    {/* Rarity rides on the STEM as a tick count, so the disc is
                        free to say what kind of thing this is. Both survive
                        greyscale: one is a count, one is a shape. */}
                    {Array.from({ length: tick }, (_, i) => (
                      <circle key={i} cx="19" cy={43 - i * 3.4} r="1.5" fill={tone} />
                    ))}
                    <circle cx="19" cy="15" r="13" fill={is_logged ? tone : "#FFFFFF"} stroke={tone} strokeWidth="2.2" />
                    <g
                      transform="translate(7 3) scale(1)"
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

            {/* The walker. Standing up out of the plane. */}
            {fix && (
              <div
                style={{
                  position: "absolute",
                  left: project(fix).x,
                  top: project(fix).y,
                  transform: "translate(-50%, -100%)",
                  transformStyle: "preserve-3d",
                  pointerEvents: "none",
                  zIndex: 5,
                }}
              >
                <Character
                  stage={stage}
                  vigor={vigor}
                  size={is_desktop ? 104 : 86}
                  tilt_degree={TILT_DEGREE}
                  bearing_degree={bearing_degree}
                  is_walking={travel.current.is_walking}
                  heading_degree={travel.current.heading}
                />
              </div>
            )}
          </>
        );
      }}
    </TileMap>
  );
}
