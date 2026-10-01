/**
 * Tracks — every line the map draws ON TOP of the way network, by medium.
 *
 * Gelo's 10-01 ask: "the paths/roads/trails/routes (land/air/sea) … they want
 * to add emergency area/hiking trails in cebu, or even underwater species …
 * making sure the paths/trails/etc. are fully custom, clean and usable,
 * similar to pokemon go". The way network (`campus-network.json`) is the
 * ground everyone walks on; a track is a line with a PURPOSE laid over it — a
 * trail leg, the walk to the nearest help, a hiking route, a shoreline to
 * search, a flight line — and the medium decides how it is drawn:
 *
 *   land — a ribbon on the ground, metres wide, under everything standing.
 *   sea  — a dotted line over open water (sea, river or pond): where to look
 *          for what lives in or under it.
 *   air  — a line lifted off the ground by its altitude, with its shadow on
 *          the ground under it, so a flight reads as a flight and not a road.
 *
 * Every kind has ONE style (`TRACK_STYLE`), so a hiking trail in Cebu and a
 * tree walk in Loyola read the same way without anyone choosing colours.
 * A track file anywhere (`src/asset/track/*.json`, format in
 * `docs/spec/track-format.md`) is all a new site needs.
 */
import pond_shore from "./asset/track/pond-shore.json" with { type: "json" };
import demo_flyway from "./asset/track/demo-flyway.json" with { type: "json" };
import type { LatLon } from "./geo.ts";

export type Medium = "land" | "sea" | "air";

/** What a track is for. Each kind belongs to exactly one medium (`MEDIUM_OF`). */
export type TrackKind = "trail" | "hike" | "evacuation" | "help" | "shore" | "dive" | "flyway";

export const MEDIUM_OF: Record<TrackKind, Medium> = {
  trail: "land",
  hike: "land",
  evacuation: "land",
  help: "land",
  shore: "sea",
  dive: "sea",
  flyway: "air",
};

export interface Track {
  track_code: string;
  track_kind: TrackKind;
  title: string;
  point: LatLon[];
  /** Air only: the height the line flies at mid-way, metres. It rises from and returns to the ground. */
  altitude_m?: number;
  /** The leg you are on now — drawn full strength. */
  is_active?: boolean;
  /** Already walked — drawn faint. */
  is_done?: boolean;
  /** A line we laid out to show how a kind reads, not a mapped or observed one. Said on the card. */
  is_demo?: boolean;
  /** Where the line comes from, with its licence — shown with the layer. */
  source: string;
}

export interface TrackStyle {
  /** The line's own colour. */
  fill: string;
  /** The pale edge that lifts it off the ground. */
  casing: string;
  /** Ribbon width on the ground, metres. */
  width_m: number;
  /** Dash pattern in metres along the line, or null for a solid ribbon. */
  dash_m: [number, number] | null;
}

/**
 * One style per kind. Land tracks are SOLID ribbons wider than a footpath's
 * fill, so they read over the network; sea tracks are dots (the one place a
 * round cap is wanted — a dot IS a round cap on a zero-length dash); the air
 * track's ground shadow is a thin dash.
 */
export const TRACK_STYLE: Record<TrackKind, TrackStyle> = {
  trail: { fill: "#159A5E", casing: "#FFFFFF", width_m: 1.6, dash_m: null },
  hike: { fill: "#9A5B26", casing: "#FFF4E2", width_m: 1.6, dash_m: [3.2, 1.8] },
  evacuation: { fill: "#E2512F", casing: "#FFFFFF", width_m: 1.9, dash_m: null },
  help: { fill: "#D63A3A", casing: "#FFFFFF", width_m: 1.9, dash_m: null },
  shore: { fill: "#1678C2", casing: "#E6F6FF", width_m: 1.2, dash_m: [0, 2.6] },
  dive: { fill: "#0E5AA7", casing: "#E6F6FF", width_m: 1.4, dash_m: [0, 2.2] },
  flyway: { fill: "#6B4FD8", casing: "#FFFFFF", width_m: 1, dash_m: [2.4, 2.4] },
};

export function mediumOf(track: Pick<Track, "track_kind">): Medium {
  return MEDIUM_OF[track.track_kind];
}

/**
 * What is wrong with a track, or an empty list. A track file is data anyone
 * can write, so the app checks it rather than drawing a broken line:
 * fewer than two points, a point off the globe, an air track with no altitude,
 * a ground track carrying one.
 */
export function trackProblem(track: Track): string[] {
  const out: string[] = [];
  if (!(track.track_kind in MEDIUM_OF)) out.push(`unknown kind "${track.track_kind}"`);
  if (!Array.isArray(track.point) || track.point.length < 2) out.push("fewer than two points");
  else if (track.point.some((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lon) || Math.abs(p.lat) > 90 || Math.abs(p.lon) > 180)) {
    out.push("a point that is not a lat/lon");
  }
  const medium = MEDIUM_OF[track.track_kind];
  if (medium === "air" && !(Number(track.altitude_m) > 0)) out.push("an air track needs altitude_m > 0");
  if (medium !== "air" && track.altitude_m !== undefined) out.push("only an air track has an altitude");
  if (!track.source?.trim()) out.push("no source");
  return out;
}

/**
 * Height of an air track at fraction `t` along it: up from the ground and back
 * down, peaking at `altitude_m` mid-way. A flight starts and ends somewhere.
 */
export function altitudeAt(altitude_m: number, t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return altitude_m * 4 * u * (1 - u);
}

/** The tracks shipped as files — checked once, a bad one dropped with a console line rather than drawn wrong. */
export const FILE_TRACK: Track[] = ([pond_shore, demo_flyway] as unknown as Track[]).filter((t) => {
  const problem = trackProblem(t);
  if (problem.length && typeof console !== "undefined") console.warn(`track ${t.track_code} dropped: ${problem.join("; ")}`);
  return problem.length === 0;
});

/** Cumulative length fractions of a polyline's vertices (0 … 1), for `altitudeAt`. */
export function lengthFraction(point: LatLon[]): number[] {
  const LAT_M = 110_540;
  const out = [0];
  let sum = 0;
  for (let i = 1; i < point.length; i += 1) {
    const a = point[i - 1];
    const b = point[i];
    const lon_m = 111_320 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180);
    sum += Math.hypot((b.lat - a.lat) * LAT_M, (b.lon - a.lon) * lon_m);
    out.push(sum);
  }
  return sum > 0 ? out.map((d) => d / sum) : out.map(() => 0);
}

/**
 * The tracks the play map draws right now, from what the modules hold:
 * the trail's legs (the one you are on full strength, walked ones faint), the
 * walk to the nearest help, and — when the routes layer is on — the shipped
 * track files. Pure, so the order and the flags are testable.
 */
export function shownTrack(input: {
  trail_leg?: { from: LatLon; waypoint: LatLon[] | null }[];
  trail_at?: number;
  help?: { from: LatLon; waypoint: LatLon[]; title: string } | null;
  is_file_shown?: boolean;
  file?: Track[];
}): Track[] {
  const out: Track[] = [];
  if (input.is_file_shown) out.push(...(input.file ?? FILE_TRACK));
  const at = input.trail_at ?? 0;
  (input.trail_leg ?? []).forEach((leg, k) => {
    if (!leg.waypoint) return;
    out.push({
      track_code: `trail-leg-${k}`,
      track_kind: "trail",
      title: `Trail leg ${k + 1}`,
      point: [leg.from, ...leg.waypoint],
      is_active: k === at,
      is_done: k < at,
      source: "Routed over OpenStreetMap footpaths, ODbL",
    });
  });
  if (input.help) {
    out.push({
      track_code: "help",
      track_kind: "help",
      title: input.help.title,
      point: [input.help.from, ...input.help.waypoint],
      is_active: true,
      source: "Routed over OpenStreetMap footpaths, ODbL",
    });
  }
  /* Active lines last, so they are drawn over the faint ones they cross. */
  return out.sort((a, b) => Number(Boolean(a.is_active)) - Number(Boolean(b.is_active)));
}
