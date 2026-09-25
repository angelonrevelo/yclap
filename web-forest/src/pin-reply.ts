import { bearingDegree, compassPoint, distanceMeter, type LatLon } from "./geo.ts";

/**
 * What tapping a find on the play map answers. Pure; the app acts on it.
 *
 *   log  — close enough: the camera opens on that species.
 *   walk — walk mode: the walker sets off toward it ("Walking to …").
 *   hint — GPS mode and out of reach: say how far and which way, and leave the
 *          camera where it is.
 *
 * `hint` used to pan the camera onto the find and switch following off. With
 * the camera welded to the walker in GPS mode, that left an empty field with
 * one pin on it and the toast gone under the next one — the playtest read it
 * as "tapping a pin does nothing". A tap must always say something.
 */
export type PinReply =
  | { kind: "log" }
  | { kind: "walk"; line: string }
  | { kind: "hint"; line: string };

export function pinReply(input: {
  target: LatLon;
  common_name: string;
  sector_name: string | null;
  fix: LatLon | null;
  is_reach: boolean;
  is_walk_mode: boolean;
}): PinReply {
  if (input.is_reach) return { kind: "log" };
  if (input.is_walk_mode) return { kind: "walk", line: `Walking to ${input.common_name}` };
  const where = input.sector_name ? ` in ${input.sector_name}` : "";
  if (!input.fix) {
    return { kind: "hint", line: `${input.common_name} is out${where}. Walk to it to log it.` };
  }
  const meter = Math.round(distanceMeter(input.fix, input.target));
  const way = compassPoint(bearingDegree(input.fix, input.target));
  return {
    kind: "hint",
    line: `${input.common_name} is ${meter} m ${way}${where}. Walk closer to log it.`,
  };
}
