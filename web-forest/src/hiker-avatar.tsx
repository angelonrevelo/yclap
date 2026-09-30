/**
 * The proposed 3D hiker, walking the map in place of the stage sticker when the
 * URL says `?avatar=hiker` (rules and reasons in `avatar.ts`).
 *
 * It rides the same glass overlay as the sticker — same anchor, same scale, same
 * contact point at the bottom centre — so swapping bodies moves nothing else on
 * the map. What changes is that the body is a rig: `model-viewer` plays the
 * `walk` clip while the walker moves and `idle` when it stops, and the camera
 * orbits so the hiker faces the way it is going rather than skewing a flat
 * sticker toward it.
 *
 * A lazy chunk, like `character-model.tsx`: `@google/model-viewer` is only
 * fetched by someone who asked for the hiker. Until it is in, the sticker
 * stands in (the caller's Suspense fallback), so the map never shows an empty
 * spot where the player should be.
 */
import "@google/model-viewer";
import type { CSSProperties } from "react";
import { sticker } from "./asset/kit";
import { HIKER_MODEL, hikerClip, hikerOrbitDegree } from "./avatar.ts";

/**
 * The hiker's measured rest bounds in its own metres (`auditGlb(...).bound`,
 * script/audit-model.mjs — re-measure if the model is rebuilt): boots at 0,
 * sprout tip at 0.485, and 0.205 at its widest (the pack's back, the hands'
 * sides), which is what must fit whichever way it faces.
 */
const HIKER_BOUND = { min_y: 0, max_y: 0.485, r: 0.205 };
const FIELD_OF_VIEW_DEG = 30;
/** Looking a little down at it, as the raked map does, not straight across. */
const PITCH_DEG = 72;

const target_y = Number(((HIKER_BOUND.max_y + HIKER_BOUND.min_y) / 2).toFixed(3));
const radius = Number(
  (
    (Math.max(HIKER_BOUND.r, (HIKER_BOUND.max_y - HIKER_BOUND.min_y) / 2) /
      Math.tan(((FIELD_OF_VIEW_DEG / 2) * Math.PI) / 180)) *
    1.12
  ).toFixed(3),
);

interface Props {
  /** Pixel width of the avatar box — the same number the sticker is given. */
  size: number;
  is_walking: boolean;
  /** Degrees clockwise from screen-up, the map walker's own heading. */
  heading_degree: number;
}

export default function HikerAvatar({ size, is_walking, heading_degree }: Props) {
  const is_reduced =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;
  const orbit = `${hikerOrbitDegree(heading_degree).toFixed(1)}deg ${PITCH_DEG}deg ${radius}m`;
  return (
    <model-viewer
      src={HIKER_MODEL}
      alt="You, walking"
      animation-name={hikerClip(is_walking)}
      /* Reduced motion keeps the pose and drops the loop. */
      autoplay={!is_reduced}
      camera-controls={false}
      disable-zoom
      interaction-prompt="none"
      camera-target={`0m ${target_y}m 0m`}
      camera-orbit={orbit}
      min-camera-orbit={`auto auto ${radius}m`}
      max-camera-orbit={`auto auto ${radius}m`}
      field-of-view={`${FIELD_OF_VIEW_DEG}deg`}
      /* Turning to a new heading eases instead of snapping. */
      interpolation-decay="120"
      shadow-intensity="0.9"
      shadow-softness="0.7"
      style={{
        display: "block",
        width: size,
        height: size * 1.15,
        pointerEvents: "none",
        "--poster-color": "transparent",
      } as CSSProperties}
    >
      <img
        slot="poster"
        src={sticker.hiker}
        alt=""
        aria-hidden="true"
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    </model-viewer>
  );
}
