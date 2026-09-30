/**
 * Which body walks the map for YOU: the stage sticker (default) or the
 * proposed 3D hiker.
 *
 * 09-30, Gelo `1:35`–`1:41`: "the main character or the guy … he's still very
 * disconnected. Like his limbs are not connected", and `5:42`–`5:51`: "or we
 * actually make a real human being with this scale". The hiker
 * (`public/model/character-hiker.glb`, built by
 * `script/build-character-model.mjs` from the brand's hiker sticker) is that
 * body, with joints that overlap by construction and a walk and an idle clip.
 *
 * It is a PROPOSAL. Design belongs to Aleij, so it is opt-in behind a URL
 * param that a demo can set and nothing else can: `?avatar=hiker`. Anything
 * else — no param, a typo, a future value this build does not know — is the
 * sticker, so a bad link can never leave the map without a walker. `avatar`
 * is a demo param (src/nav.ts), so it survives route changes.
 *
 * Kept out of the component for the usual reason: Node's type stripping cannot
 * load a `.tsx`, and this rule wants a test.
 */

export type Avatar = "stage" | "hiker";

/** The avatar a query string asks for. */
export function avatarFrom(search: string): Avatar {
  const value = new URLSearchParams(search).get("avatar");
  return value?.trim().toLowerCase() === "hiker" ? "hiker" : "stage";
}

/** The hiker's model file, served same-origin from `public/`. */
export const HIKER_MODEL = "/model/character-hiker.glb";

/**
 * The hiker's clip for what the walker is doing. The two names are the
 * animations `build-character-model.mjs` writes; `model-viewer` plays one at a
 * time by name.
 */
export function hikerClip(is_walking: boolean): "walk" | "idle" {
  return is_walking ? "walk" : "idle";
}

/**
 * Where `<model-viewer>`'s camera orbits to show the hiker walking toward
 * `heading_degree` (clockwise from screen-up, the map walker's own unit).
 *
 * The model faces +Z, which is the camera's azimuth 0. Walking up the screen
 * means walking AWAY from the viewer, so the camera sits behind: 180°. A
 * clockwise heading turns the body clockwise as seen from above, which is the
 * camera swinging the same way round: 180° + heading. Normalised to [0, 360).
 */
export function hikerOrbitDegree(heading_degree: number): number {
  const theta = (180 + (Number.isFinite(heading_degree) ? heading_degree : 0)) % 360;
  return theta < 0 ? theta + 360 : theta;
}
