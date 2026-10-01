import campus_building from "./asset/campus-building.json" with { type: "json" };
import type { LatLon } from "./geo.ts";

/**
 * The buildings, with a third dimension.
 *
 * The play view drew buildings as flat pale blocks: correct ground cover, and
 * completely silent about the thing a walker actually navigates by. You do not
 * find your way across this campus by the shape of a roof seen from orbit — you
 * find it by Areté being the tall one and the SEC walk being flanked. A campus
 * you are standing IN has a skyline, and the 52° rake this view already uses is
 * exactly the camera that can show one.
 *
 * So these extrude. Not in WebGL — the repo runs on react and react-dom and
 * nothing else, and that is load-bearing for the offline story. A prism under a
 * fixed camera rake is four or five quads and a cap, which is SVG arithmetic,
 * and it is what this file computes.
 *
 * Provenance is unchanged from every other line on this map: OSM geometry under
 * ODbL, here merged with Overture and curated in the sisia campus app, credited
 * by `BUILDING_ATTRIBUTION` wherever the layer draws. Heights come from the
 * source's level count where it had one; where it did not, sisia's category
 * default stands in and `is_height_measured` is false. A default height is a
 * drawing, not a measurement, and the two are not allowed to look alike in the
 * data even when they look alike on screen.
 */

export const BUILDING_ATTRIBUTION =
  "Building footprints © OpenStreetMap contributors, ODbL · Overture Maps";

export type BuildingCategory =
  | "academic"
  | "dorm"
  | "canteen"
  | "food"
  | "landmark"
  | "sports"
  | "admin"
  | "church"
  | "other";

export interface CampusBuilding {
  /** AISIS building code where the source had one, else null. Never invented. */
  building_code: string | null;
  /** Display name, or null. A null name renders as an unlabelled block. */
  name: string | null;
  category: BuildingCategory;
  height_m: number;
  /** False when `height_m` is a category default rather than a level count. */
  is_height_measured: boolean;
  area_m2: number;
  /** Closed-ish ring, `[lat, lon]`, tallest-last in the array. */
  point: [number, number][];
}

interface BuildingFile {
  attribution: string;
  source: string;
  imported_at: string;
  building: CampusBuilding[];
}

const file = campus_building as unknown as BuildingFile;

/** Every campus building, shortest first — paint order for the skyline. */
export const building: CampusBuilding[] = file.building as CampusBuilding[];

export const BUILDING_IMPORTED_AT = file.imported_at;

/**
 * Roof colour by category.
 *
 * Deliberately narrow: the sector layer already carries the one green ramp that
 * this map reads by, and a second full palette competing with it is the "a lot
 * of lines" failure in a different medium. Buildings are warm neutrals with
 * three exceptions that a walker genuinely navigates by — the church, the
 * landmarks, and the sports ground.
 */
const ROOF: Record<BuildingCategory, string> = {
  academic: "#EFE7D8",
  dorm: "#EDE3D2",
  canteen: "#F2E3CD",
  food: "#F2E3CD",
  landmark: "#F6E2BC",
  sports: "#E2EBD9",
  admin: "#EBE5DA",
  church: "#F0E0DC",
  other: "#EAE4D8",
};

export function roofColour(row: CampusBuilding): string {
  return ROOF[row.category] ?? ROOF.other;
}

export interface ScreenPoint {
  x: number;
  y: number;
  /** Perspective scale the plane point landed at — walls rise by this much less far away. */
  scale: number;
}

export interface Wall {
  /** SVG path for the quad. */
  d: string;
  /** 0 (facing away from the light) … 1 (full on). Drives the wall's shade. */
  light: number;
  /** Depth key: larger draws later, so a near wall covers a far one. */
  depth: number;
}

export interface Prism {
  roof: string;
  wall: Wall[];
  /** Screen y of the lowest ground vertex — the whole prism's paint order. */
  depth: number;
}

/**
 * Signed area of a screen ring. Sign tells us which side of an edge is outside,
 * which is the only thing that decides whether a wall is facing us.
 *
 * Screen y grows downward, so this is NOT the sign you would get from the same
 * ring in a maths-convention plane. That inversion is the bug this function
 * exists to contain.
 */
export function signedArea(ring: { x: number; y: number }[]): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    sum += ring[j].x * ring[i].y - ring[i].x * ring[j].y;
  }
  return sum / 2;
}

/**
 * The nearest a footprint may come to the eye, as a perspective scale. Past
 * it — and certainly past the eye itself, where the scale turns negative — a
 * vertex projects mirrored up over the horizon, and a footprint with corners
 * on both sides of the eye came out as a pale wedge rising from the walker
 * into the sky (z21–22, where 85 m behind you is already past the eye). At
 * scale 4 the cut is far below the bottom of the glass.
 */
export const NEAR_SCALE = 4;

/** One Sutherland–Hodgman pass: the part of `ring` where `g` ≥ 0, cut exactly where `g` is linear. */
function clipBy(ring: { x: number; y: number }[], g: number[]): { x: number; y: number }[] {
  if (g.every((v) => v >= 0)) return ring;
  const out: { x: number; y: number }[] = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[j];
    const b = ring[i];
    const ga = g[j];
    const gb = g[i];
    if ((ga >= 0) !== (gb >= 0)) {
      const t = ga / (ga - gb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    if (gb >= 0) out.push(b);
  }
  return out;
}

/**
 * Cut a PLANE ring to the depth band the camera can show: in front of the
 * near plane (`NEAR_SCALE`), and — given `far_scale`, the perspective scale
 * at the world's far edge — no further than that edge, so no footprint runs
 * on past the fog to stand up in the sky as a pale slab. `invScale` is
 * 1/scale of a plane point, which is linear in the point under the raked
 * camera (1 − z/depth), so both cuts are exact. `near_scale` moves the near
 * cut closer — the skyline puts it just below the glass (see `skyline.tsx`).
 */
export function clipDepth(
  ring: { x: number; y: number }[],
  invScale: (point: { x: number; y: number }) => number,
  far_scale = 0,
  near_scale = NEAR_SCALE,
): { x: number; y: number }[] {
  const inv = ring.map(invScale);
  const near = clipBy(ring, inv.map((v) => v - 1 / Math.max(near_scale, 1e-6)));
  if (far_scale <= 0 || near.length < 3) return near;
  return clipBy(near, near.map((p) => 1 / far_scale - invScale(p)));
}

/** Sun direction on screen, as a unit vector. From the upper left, low. */
const SUN = { x: -0.78, y: -0.63 };

/** A camera-facing wall, as indices into the ground ring and the roof ring. */
export interface WallFace {
  /** Ground ring index of the wall's first corner; `b` is the second. */
  a: number;
  b: number;
  light: number;
  depth: number;
}

/**
 * A prism as POINTS: the roof ring (`top`, index-aligned with the ground ring
 * it was lifted from) and the camera-facing walls.
 *
 * What a canvas wants. The skyline paints on a canvas every camera frame, and
 * turning every corner into `toFixed` text only for `Path2D` to parse it back
 * was most of what the prism cost.
 */
export interface PrismPoint {
  top: { x: number; y: number }[];
  face: WallFace[];
  depth: number;
}

/**
 * Extrude one screen-space ground ring into a prism.
 *
 * `rise_px(scale)` is how far one building rises on screen at a given
 * perspective scale — the caller owns that, because it depends on the camera
 * rake and the metres-per-pixel, both of which live with the projection.
 *
 * Only walls whose outward normal points toward the bottom of the screen are
 * emitted. The rest are behind the roof cap and drawing them costs paint and
 * buys nothing but a seam where two fills meet.
 */
export function extrudePoint(
  ring: ScreenPoint[],
  height_m: number,
  rise_px: (scale: number) => number,
): PrismPoint | null {
  if (ring.length < 3) return null;
  const area = signedArea(ring);
  if (area === 0) return null;
  /* For a positive area in y-down screen space the outside of edge a→b is
     (dy, −dx); a negative area flips it. */
  const sign = area > 0 ? 1 : -1;

  const top = ring.map((p) => ({ x: p.x, y: p.y - rise_px(p.scale) * height_m }));

  const face: WallFace[] = [];
  let depth = -Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[j];
    const b = ring[i];
    if (b.y > depth) depth = b.y;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) continue;
    const nx = (sign * dy) / len;
    const ny = (sign * -dx) / len;
    /* Normal pointing down the screen means the wall faces the camera. */
    if (ny <= 0) continue;
    face.push({
      a: j,
      b: i,
      /* Lambert against a fixed sun, remapped so the darkest wall is still
         legibly a wall rather than a hole. */
      light: Math.max(0, nx * SUN.x + ny * SUN.y) * 0.5 + 0.5,
      depth: Math.max(a.y, b.y),
    });
  }
  return { top, face, depth };
}

/** `extrudePoint` as SVG path data, for anything that draws a `<path>`. */
export function extrude(
  ring: ScreenPoint[],
  height_m: number,
  rise_px: (scale: number) => number,
): Prism | null {
  const prism = extrudePoint(ring, height_m, rise_px);
  if (!prism) return null;
  const { top, face, depth } = prism;
  const wall: Wall[] = face.map(({ a: j, b: i, light, depth: wall_depth }) => {
    const a = ring[j];
    const b = ring[i];
    const ta = top[j];
    const tb = top[i];
    return {
      d: `M${a.x.toFixed(1)} ${a.y.toFixed(1)}L${b.x.toFixed(1)} ${b.y.toFixed(1)}L${tb.x.toFixed(1)} ${tb.y.toFixed(1)}L${ta.x.toFixed(1)} ${ta.y.toFixed(1)}Z`,
      light,
      depth: wall_depth,
    };
  });
  const roof = `${top.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join("")}Z`;
  return { roof, wall, depth };
}

/**
 * Screen pixels one metre of HEIGHT rises, at perspective scale 1.
 *
 * The ground plane is raked by `tilt_degree`, so the world-vertical axis is the
 * plane normal. Under `rotateX(θ)` that normal projects to `sin θ` of its
 * length up the screen — while distances lying IN the plane are foreshortened
 * by `cos θ`. Using the wrong one of that pair is the difference between a
 * campus and a pile of parallelograms, so it is computed here once.
 */
export function riseAtScale1(tilt_degree: number, meter_per_pixel: number): number {
  return (Math.sin((tilt_degree * Math.PI) / 180) / meter_per_pixel);
}

/** Centroid of a `[lat, lon]` ring — where a building's label sits. */
export function ringCentre(point: [number, number][]): LatLon {
  let lat = 0;
  let lon = 0;
  for (const [a, b] of point) {
    lat += a;
    lon += b;
  }
  return { lat: lat / point.length, lon: lon / point.length };
}

/** Bounding box of a ring, for a cheap "is this on screen at all" test. */
export function ringBox(point: [number, number][]) {
  let north = -90;
  let south = 90;
  let west = 180;
  let east = -180;
  for (const [lat, lon] of point) {
    if (lat > north) north = lat;
    if (lat < south) south = lat;
    if (lon < west) west = lon;
    if (lon > east) east = lon;
  }
  return { north, south, west, east };
}

const box = building.map((b) => ringBox(b.point));

/**
 * The buildings whose footprint falls within `radius_m` of a point.
 *
 * The play camera is locked close, so most frames need a handful of the 105 and
 * paying for the rest is the difference between a smooth walk and a slideshow
 * on the phones this actually gets demoed on.
 */
export function buildingNear(at: LatLon, radius_m: number): CampusBuilding[] {
  const lat_pad = radius_m / 110_540;
  const lon_pad = radius_m / (111_320 * Math.cos((at.lat * Math.PI) / 180));
  const out: CampusBuilding[] = [];
  for (let i = 0; i < building.length; i += 1) {
    const b = box[i];
    if (b.south - lat_pad > at.lat || b.north + lat_pad < at.lat) continue;
    if (b.west - lon_pad > at.lon || b.east + lon_pad < at.lon) continue;
    out.push(building[i]);
  }
  return out;
}

/** Named buildings only, biggest first — the ones worth a label on the skyline. */
export const landmark_building: CampusBuilding[] = building
  .filter((b) => b.name !== null && b.area_m2 > 900)
  .sort((a, b) => b.area_m2 - a.area_m2);
