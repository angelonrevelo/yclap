import type { CSSProperties } from "react";
import "./art.css";

/**
 * Every icon, button face, mascot pose and buddy stage is a hand-authored SVG
 * under `src/art/svg/`, imported `?raw` and inlined here — no image request,
 * no decode, sharp at any size, and each part is a DOM node CSS can animate
 * (the eagle's wings flap by class). Replaced the PNG/WebP kit (09-25): ~1.1 MB
 * of raster for what is now a few KB of markup in the bundle.
 *
 * The contract every file under `svg/` keeps is asserted by `test/art.test.ts`:
 *   - a `viewBox`, no fixed `width`/`height` — the wrapper sizes it
 *   - no `id`, `<filter>`, `<image>`, `<use>`, `<script>`, `<style>` or `href`
 *     — ids collide once the same art is inlined twice, filters re-rasterise
 *     every animated frame on a phone, and nothing may reach off the page
 *   - colours from `palette.ts`; the sticker edge is a white stroke drawn
 *     under the silhouette, never a filter
 */
export function Art({
  svg,
  size,
  className,
  style,
  label,
}: {
  svg: string;
  size: number;
  className?: string;
  style?: CSSProperties;
  /** Say it only when the art carries meaning its neighbours do not. */
  label?: string;
}) {
  return (
    <span
      className={className ? `art ${className}` : "art"}
      style={{ width: size, height: size, ...style }}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      /* Our own files under src/art/svg, checked by test/art.test.ts — never user input. */
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
