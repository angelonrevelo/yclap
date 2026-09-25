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
 * Where the camera looks, per stage, in the model's own metres.
 *
 * model-viewer's automatic framing fits the WHOLE bounding box, and every stage
 * stands on a soil disc about half a metre across. For the seedling that disc
 * is most of the box, so "fit everything" drew a tiny figure on a large brown
 * plate. This frames the height instead — target at the figure's middle, the
 * radius that fits the model's height in the 30° field of view with a little
 * air — and lets the disc run off the sides, which is how a figurine is shot.
 * The numbers are the measured bounds of the four .glb files (`getDimensions`,
 * `getBoundingBoxCenter`); re-measure if a model is replaced.
 */
const STAGE_FRAME: Record<Stage, { target_y: number; radius: number }> = {
  egg: { target_y: 0.25, radius: 1.12 },
  sprout: { target_y: 0.235, radius: 0.4 },
  sapling: { target_y: 0.31, radius: 1.34 },
  tree: { target_y: 0.46, radius: 2.1 },
};

interface Props {
  stage: Stage;
  /** Pixel size of the square viewport. */
  size?: number;
}

export default function CharacterModel({ stage, size = 108 }: Props) {
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
      /* The default floor is the auto radius, which would clamp the close
         seedling frame straight back out to the whole-disc view. */
      min-camera-orbit={`auto auto ${STAGE_FRAME[stage].radius}m`}
      field-of-view="30deg"
      shadow-intensity="1"
      shadow-softness="0.8"
      style={{
        width: size,
        height: size,
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
