/**
 * The 3D character — self-hosted `<model-viewer>` wired to the stage .glb files.
 *
 * Build spec T4.1 (2026-09-06): `<model-viewer>`, self-hosted from `node_modules`,
 * bundled by Vite. Not a CDN — this app must work offline. The side-effect
 * import `import "@google/model-viewer"` registers the `<model-viewer>` custom
 * element; Vite bundles it into the app chunk, so no third-party origin is
 * reached for the viewer or the model.
 *
 * The four stage .glb files live in `public/model/` and are served same-origin.
 * Stage progression + leaf loss (T4.4) is already covered by `stage.ts` and the
 * existing character tests; this component only renders the stage it is given.
 *
 * Replaces the SVG `Character` in the journal card and the blind-box reveal. The
 * map keeps the SVG billboard — the spec says the map stays 2D raster + fills.
 */
import "@google/model-viewer";
import { stage_sticker } from "./asset/kit";
import type { Stage } from "./stage.ts";
import { STAGE_LABEL } from "./stage.ts";

/** Stage → model file. `public/` is served at the site root by Vite. */
const STAGE_MODEL: Record<Stage, string> = {
  egg: "/model/character-egg.glb",
  sprout: "/model/character-seedling.glb",
  sapling: "/model/character-sapling.glb",
  tree: "/model/character-tree.glb",
};

/**
 * The measured bounds of the four .glb files, in the model's own metres
 * (`auditGlb(...).bound` from script/audit-model.mjs — re-measure if a model
 * is replaced). `r` is the widest horizontal half-extent: the model turns, so
 * whichever side faces the camera must fit.
 */
const STAGE_BOUND: Record<Stage, { min_y: number; max_y: number; r: number }> = {
  egg: { min_y: -0.04, max_y: 0.52, r: 0.256 },
  sprout: { min_y: -0.04, max_y: 0.3, r: 0.256 },
  sapling: { min_y: -0.045, max_y: 0.64, r: 0.288 },
  tree: { min_y: -0.05, max_y: 0.9243, r: 0.4414 },
};

const FIELD_OF_VIEW_DEG = 30;
/** Air round the model, as a share of the tighter fit. */
const FRAME_MARGIN = 1.06;

/**
 * Where the camera looks, per stage: the middle of the measured bounds, from
 * far enough that the whole model — leaf disc and soil included — fits a square
 * viewport at a 30° field of view with `FRAME_MARGIN` of air.
 *
 * It used to frame the height only and let the soil disc run off the sides;
 * at 0.4 m the seedling's leaf disc and soil were both sliced by the tile edge
 * (round 5, zoom2–4). Width: the disc's half-extent over tan(15°). Height: half
 * the model's height over tan(15°), plus the disc's radius, since its front
 * edge is that much nearer the camera and draws larger.
 */
function frameOf(bound: { min_y: number; max_y: number; r: number }): { target_y: number; radius: number } {
  const tan = Math.tan(((FIELD_OF_VIEW_DEG / 2) * Math.PI) / 180);
  const half_height = (bound.max_y - bound.min_y) / 2;
  const fit_width = bound.r / tan;
  const fit_height = half_height / tan + bound.r;
  return {
    target_y: Number(((bound.max_y + bound.min_y) / 2).toFixed(3)),
    radius: Number((Math.max(fit_width, fit_height) * FRAME_MARGIN).toFixed(3)),
  };
}

const STAGE_FRAME: Record<Stage, { target_y: number; radius: number }> = {
  egg: frameOf(STAGE_BOUND.egg),
  sprout: frameOf(STAGE_BOUND.sprout),
  sapling: frameOf(STAGE_BOUND.sapling),
  tree: frameOf(STAGE_BOUND.tree),
};

interface Props {
  stage: Stage;
  /** Pixel size of the square viewport. Ignored with `is_fill`. */
  size?: number;
  /** Fill the parent box instead — the Journal tile sizes the viewer, so the
   *  model is not a small square floating in a bigger tile. */
  is_fill?: boolean;
}

export default function CharacterModel({ stage, size = 108, is_fill = false }: Props) {
  const prefers_reduced =
    typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false;
  return (
    <model-viewer
      src={STAGE_MODEL[stage]}
      alt={`Your ${STAGE_LABEL[stage].toLowerCase()}`}
      auto-rotate={!prefers_reduced}
      camera-controls={false}
      camera-target={`0m ${STAGE_FRAME[stage].target_y}m 0m`}
      camera-orbit={`0deg 78deg ${STAGE_FRAME[stage].radius}m`}
      /* The default floor and ceiling are the auto radius, which would clamp
         the measured frame back to model-viewer's own guess. */
      min-camera-orbit={`auto auto ${STAGE_FRAME[stage].radius}m`}
      max-camera-orbit={`auto auto ${STAGE_FRAME[stage].radius}m`}
      field-of-view={`${FIELD_OF_VIEW_DEG}deg`}
      shadow-intensity="1"
      shadow-softness="0.8"
      style={{
        display: "block",
        width: is_fill ? "100%" : size,
        height: is_fill ? "100%" : size,
        "--poster-color": "transparent",
      } as CSSProperties}
    >
      {/* The flat sticker stands in until the .glb is in — the pot used to be
          blank for a second and a half on a cold load. */}
      <img
        slot="poster"
        src={stage_sticker[stage]}
        alt=""
        aria-hidden="true"
        style={{ width: "100%", height: "100%", objectFit: "contain" }}
      />
    </model-viewer>
  );
}

import type { CSSProperties } from "react";
