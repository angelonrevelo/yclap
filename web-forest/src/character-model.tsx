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
import type { Stage } from "./stage.ts";
import { STAGE_LABEL } from "./stage.ts";

/** Stage → model file. `public/` is served at the site root by Vite. */
const STAGE_MODEL: Record<Stage, string> = {
  egg: "/model/character-egg.glb",
  sprout: "/model/character-seedling.glb",
  sapling: "/model/character-sapling.glb",
  tree: "/model/character-tree.glb",
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
      shadow-intensity="1"
      shadow-softness="0.8"
      style={{
        width: size,
        height: size,
        "--poster-color": "transparent",
      } as CSSProperties}
    />
  );
}

import type { CSSProperties } from "react";
