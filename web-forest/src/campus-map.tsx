import campus_boundary from "./asset/campus-boundary.json";
import campus_path from "./asset/campus-path.json";
import {
  SECTOR_ATTRIBUTION,
  sectorFill,
  sectorStroke,
  sector as sector_row,
  type Sector,
} from "./sector";
import type { Encounter } from "./data";
import { RESTRICTED_POLYGON, species } from "./data";
import { EncounterDisc, PlayerMark } from "./icon";
import TileMap, { SOURCE, type Layer, type Projection, type View } from "./tile-map";
import type { Fix } from "./geo";
import type { ReactNode } from "react";

/**
 * The campus walk, drawn on real imagery.
 *
 * This used to be a hand-drawn SVG of Loyola Heights with invented buildings, a
 * fake canopy choropleth and dummy footpaths. Everything here is now positioned
 * by lat/lon through the tile map's own Web Mercator projection, so a marker
 * stays on its feature at every zoom, and the paths a walker follows are the
 * real ones visible in the imagery rather than ones we drew.
 *
 * The restricted polygon is still ours and still approximate — it is a geofence
 * we declared, not a surveyed boundary, and the caption says so.
 */

export const PATH_ATTRIBUTION = "Paths & campus outline © OpenStreetMap contributors";

interface Props {
  encounter: Encounter[];
  selected_id: string | null;
  onSelect: (encounter_id: string) => void;
  view: View;
  onView: (view: View) => void;
  layer: Layer;
  fix?: Fix | null;
  is_restricted_on?: boolean;
  is_path_on?: boolean;
  is_boundary_on?: boolean;
  is_biome_on?: boolean;
  at_id?: string | null;
  disc_size?: number;
  is_interactive?: boolean;
  onGesture?: () => void;
  /** Campus-module layers (`module-ui.tsx`), drawn in the same plane as the discs. */
  extra?: (projection: Projection) => ReactNode;
  /** Credit lines those layers owe, joined onto the ODbL line. */
  extra_attribution?: string[];
}

/**
 * The sector fills — the same layer the play view draws, on the field map.
 *
 * This used to draw the 09-03 biome seed, which is why the field view still
 * looked like the old app after the sector cut landed (owner, 09-03). It reads
 * `sector.ts` now, so both views are the same ground, cut the same way, coloured
 * by the same measured vegetation. What differs is only what sits ON TOP: the
 * field view keeps the path network, the four basemaps and every citation.
 *
 * Drawn beneath everything (z 0): paths, the outline, the restricted hatch and
 * the discs all read on top of a fill, and the hatch WINS over any fill it
 * crosses, because restricted ground is subtracted, not overdrawn.
 */
const SECTOR_MIN_ZOOM = 15;
function SectorLayer({ projection, layer }: { projection: Projection; layer: Layer }) {
  const theme = SOURCE[layer].theme;
  return (
    <svg
      width={projection.width}
      height={projection.height}
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 0 }}
      aria-hidden="true"
    >
      {projection.zoom >= SECTOR_MIN_ZOOM &&
        sector_row.map((row) => (
          <SectorPolygon key={row.sector_code} row={row} projection={projection} is_dark_ground={theme.is_dark_ground} />
        ))}
    </svg>
  );
}

function SectorPolygon({
  row,
  projection,
  is_dark_ground,
}: {
  row: Sector;
  projection: Projection;
  is_dark_ground: boolean;
}) {
  /* Over imagery the fills have to stay translucent or they hide the very
     canopy the satellite layer is there to show. */
  const fill_opacity = is_dark_ground ? 0.44 : 0.56;
  const point = row.point.map(([lat, lon]) => projection.project({ lat, lon }));
  const d = `${point.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} Z`;
  return (
    <path
      d={d}
      fill={sectorFill(row)}
      fillOpacity={fill_opacity}
      stroke={sectorStroke(row)}
      strokeWidth={1.4}
      strokeLinejoin="round"
    />
  );
}

/* The "PLACEHOLDER, NOT SURVEYED" overlay that used to live here is gone with
 * the thing it warned about. It existed because three of the 09-03 biome rings
 * were our own delineation; sector boundaries are OSM ways, so there is no
 * invented ring left to disclaim. The honesty burden moved rather than lifted —
 * `is_named_by_us` still marks the names we guessed, and the sector card still
 * says the species lists are provisional until the AIS inventory. */

/**
 * The walkable network.
 *
 * `src/asset/campus-path.json` — 186 ways, 12.6 km: footways, steps, paths and
 * pedestrian ways that OSM contributors mapped on this campus. Not the ADMUNAV
 * graph, which is still unshared, and not a survey. ODbL requires the credit,
 * which rides on `PATH_ATTRIBUTION`.
 *
 * Read the provenance off the file itself (`source`, `release`,
 * `length_retained_percent`), not off a comment: it is an Overpass
 * `out geom tags` export via `~/Code/sisia-app`, carrying every vertex each way
 * has at 100 % of its length. An earlier revision of this comment credited an
 * Overture extract reconstructed from connectors at 94.9 % — that described
 * data this file no longer contains.
 *
 * DRAWN QUIET ON PURPOSE. 12.6 km of bright stroke over satellite imagery turns
 * the campus into a net and hides the thing the walk is about. Paths are a hint
 * under the photograph, so they are paper-white at low opacity and appear only
 * once the zoom is close enough for them to mean anything.
 */
const PATH_MIN_ZOOM = 17;
function PathNetwork({ projection, layer }: { projection: Projection; layer: Layer }) {
  const theme = SOURCE[layer].theme;
  return (
    <svg
      width={projection.width}
      height={projection.height}
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1 }}
      aria-hidden="true"
    >
      {projection.zoom >= PATH_MIN_ZOOM &&
        campus_path.feature.map((row) => {
        const point = row.line.map((p) => projection.project({ lat: p[1], lon: p[0] }));
        if (point.every((p) => p.x < -40 || p.y < -40 || p.x > projection.width + 40 || p.y > projection.height + 40)) {
          return null;
        }
        const d = point.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
        return (
          <g key={row.path_id}>
            <path d={d} fill="none" stroke={theme.halo} strokeWidth={3.5} strokeLinecap="round" />
            <path
              d={d}
              fill="none"
              stroke={row.path_class === "steps" ? theme.step : theme.path}
              strokeWidth={row.path_class === "steps" ? 2 : 1.6}
              strokeLinecap="round"
              strokeDasharray={row.path_class === "steps" ? "4 3" : undefined}
              opacity={row.path_class === "steps" ? Math.min(1, theme.path_opacity + 0.18) : theme.path_opacity}
            />
          </g>
          );
        })}
    </svg>
  );
}

/**
 * The campus outline, from sisia.
 *
 * `CAMPUS_BOX` is a rectangle we picked; this is the OSM landuse ring for the
 * university, the two schools and Eliazo. 57 of the university ring's 118
 * points fall outside our box — drawing it is how that stops being invisible.
 * It is not a cadastral boundary and it is not the restricted-grove geofence,
 * which is still ours and still approximate.
 */
function CampusOutline({ projection, layer }: { projection: Projection; layer: Layer }) {
  const theme = SOURCE[layer].theme;
  return (
    <svg
      width={projection.width}
      height={projection.height}
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 1 }}
      aria-hidden="true"
    >
      {campus_boundary.boundary.map((row) => {
        const point = row.ring.map((p) => projection.project({ lat: p[1], lon: p[0] }));
        const d = `${point.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")} Z`;
        return (
          <path
            key={row.boundary_id}
            d={d}
            fill="none"
            stroke={theme.outline}
            strokeWidth={2}
            strokeDasharray="7 5"
            opacity={theme.is_dark_ground ? 0.6 : 0.45}
          />
        );
      })}
    </svg>
  );
}

function RestrictedArea({ projection }: { projection: Projection }) {
  const point: { x: number; y: number }[] = RESTRICTED_POLYGON.map((row) => projection.project(row));
  const path = point.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const label = point.reduce(
    (acc: { x: number; y: number }, p) => ({ x: acc.x + p.x / point.length, y: acc.y + p.y / point.length }),
    { x: 0, y: 0 },
  );
  return (
    <svg
      width={projection.width}
      height={projection.height}
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }}
    >
      <defs>
        <pattern id="restrictedHatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="12" stroke="#1F2022" strokeWidth="4" />
        </pattern>
      </defs>
      <polygon points={path} fill="url(#restrictedHatch)" opacity="0.22" />
      <polygon points={path} fill="rgba(31,32,34,0.18)" stroke="#F9F9F9" strokeWidth="2.5" opacity="0.85" />
      <text
        x={label.x}
        y={label.y}
        textAnchor="middle"
        fontFamily="Montserrat,sans-serif"
        fontSize="12"
        fontWeight="700"
        letterSpacing="1.2"
        fill="#F9F9F9"
        style={{ paintOrder: "stroke", stroke: "rgba(31,32,34,0.55)", strokeWidth: 3 }}
      >
        SOM · SWAMP FOREST
      </text>
      <text
        x={label.x}
        y={label.y + 16}
        textAnchor="middle"
        fontFamily="Montserrat,sans-serif"
        fontSize="10.5"
        fill="#F9F9F9"
        style={{ paintOrder: "stroke", stroke: "rgba(31,32,34,0.55)", strokeWidth: 3 }}
      >
        off-limits · placeholder extent, not surveyed
      </text>
    </svg>
  );
}

export default function CampusMap({
  encounter,
  selected_id,
  onSelect,
  view,
  onView,
  layer,
  fix = null,
  is_restricted_on = true,
  is_path_on = true,
  is_boundary_on = true,
  is_biome_on = true,
  at_id = null,
  disc_size = 32,
  is_interactive = true,
  onGesture,
  extra,
  extra_attribution = [],
}: Props) {
  /* ODbL is a licence term, not chrome: any OSM-derived layer on screen must
     carry the credit. Biome rings and paths each earn their own line. */
  const overlay_attribution = [
    is_path_on ? PATH_ATTRIBUTION : null,
    is_biome_on ? SECTOR_ATTRIBUTION : null,
    ...extra_attribution,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <TileMap
      view={view}
      onView={onView}
      layer={layer}
      is_interactive={is_interactive}
      onGesture={onGesture}
      overlay_attribution={overlay_attribution || undefined}
    >
      {(projection) => (
        <>
          {is_biome_on && <SectorLayer projection={projection} layer={layer} />}
          {is_boundary_on && <CampusOutline projection={projection} layer={layer} />}
          {is_path_on && <PathNetwork projection={projection} layer={layer} />}
          {is_restricted_on && <RestrictedArea projection={projection} />}
          {extra?.(projection)}

          {encounter.map((row) => {
            const sp = species[row.species_code];
            const at = projection.project(row);
            if (at.x < -60 || at.y < -60 || at.x > projection.width + 60 || at.y > projection.height + 60) {
              return null;
            }
            const is_selected = row.encounter_id === selected_id;
            const is_at = row.encounter_id === at_id;
            const DiscTag = is_interactive ? "button" : "span";
            return (
              <DiscTag
                key={row.encounter_id}
                type={is_interactive ? "button" : undefined}
                onClick={is_interactive ? () => onSelect(row.encounter_id) : undefined}
                aria-label={`${sp.common_name} at ${row.where}`}
                style={{
                  position: "absolute",
                  left: at.x,
                  top: at.y,
                  width: disc_size,
                  height: disc_size,
                  transform: "translate(-50%,-50%)",
                  borderRadius: 999,
                  background: "transparent",
                  border: "none",
                  boxShadow: is_selected
                    ? "0 0 0 6px rgba(0,134,83,0.3), 0 6px 14px rgba(31,32,34,0.45)"
                    : "0 4px 10px rgba(31,32,34,0.45)",
                  cursor: is_interactive ? "pointer" : "default",
                  padding: 0,
                  display: "grid",
                  placeItems: "center",
                  scale: is_selected ? "1.12" : "1",
                  zIndex: is_selected ? 5 : 4,
                }}
              >
                <EncounterDisc size={disc_size} />
                {(is_selected || is_at) && (
                  <span
                    style={{
                      position: "absolute",
                      inset: -8,
                      borderRadius: 999,
                      border: is_at ? "3px solid rgba(0,232,0,0.9)" : "2px solid rgba(0,232,0,0.7)",
                      animation: "discPulse 1.6s ease-out infinite",
                    }}
                  />
                )}
              </DiscTag>
            );
          })}

          {fix && (
            <>
              {/* A real radius in real metres, not a guessed percentage. */}
              <div
                aria-hidden="true"
                style={{
                  position: "absolute",
                  left: projection.project(fix).x,
                  top: projection.project(fix).y,
                  width: Math.max(16, (fix.accuracy_m / projection.meter_per_pixel) * 2),
                  height: Math.max(16, (fix.accuracy_m / projection.meter_per_pixel) * 2),
                  transform: "translate(-50%,-50%)",
                  borderRadius: 999,
                  background: "rgba(0,134,83,0.18)",
                  border: "1.5px solid rgba(0,134,83,0.5)",
                  zIndex: 3,
                }}
              />
              <div
                aria-label="You are here"
                style={{
                  position: "absolute",
                  left: projection.project(fix).x,
                  top: projection.project(fix).y,
                  width: 24,
                  height: 24,
                  transform: "translate(-50%,-50%)",
                  zIndex: 6,
                  filter: "drop-shadow(0 3px 8px rgba(31,32,34,0.7))",
                }}
              >
                <PlayerMark size={24} />
              </div>
            </>
          )}
        </>
      )}
    </TileMap>
  );
}
