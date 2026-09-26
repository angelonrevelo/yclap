/**
 * Depth on the glass, for everything that STANDS on the play map.
 *
 * Trees and finds are both drawn in screen space over the raked ground, so
 * there is no depth buffer to sort them — the painter's order is the depth.
 * Under a camera looking forward and down, further away is further up the
 * glass, so a smaller screen `y` (where a thing meets the ground) is further
 * away and paints first.
 *
 * It lives in its own file so the rule can be tested without a DOM.
 */

/** Something standing on the glass: its foot at (`x`, `y`), `w` wide and `h` tall, in screen pixels. */
export interface Standee {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Sort key for painter's order: further (higher up the glass) first. */
export function byDepth(a: { y: number }, b: { y: number }): number {
  return a.y - b.y;
}

/**
 * Does `front` stand nearer the camera than `back` AND cover part of it?
 *
 * A tree that does is drawn see-through (the way it already is over the
 * walker), so a find behind scenery is never lost — it is only ever behind it.
 */
export function isCovering(front: Standee, back: Standee): boolean {
  if (front.y <= back.y) return false;
  const is_overlap_x = Math.abs(front.x - back.x) < (front.w + back.w) / 2;
  /* `front.y > back.y` already puts its foot below `back`'s top; it covers
     when its crown reaches up past `back`'s foot. */
  const is_overlap_y = front.y - front.h < back.y;
  return is_overlap_x && is_overlap_y;
}

/** Extra width either side of a standee's middle that still counts as over the walker. */
export const WALKER_HALF_W = 40;

/**
 * Does this standee stand between the camera and the walker, over them?
 *
 * Trees AND finds use it: whatever is nearer the camera than you and would
 * cover you is drawn see-through there. You never lose yourself behind a tree,
 * and a find a few metres toward the camera no longer paints a solid disc over
 * the trainer at the moment you step up to tap it.
 */
export function isOverWalker(s: Standee, walker: { x: number; y: number } | null): boolean {
  if (!walker || s.y <= walker.y) return false;
  return Math.abs(s.x - walker.x) < s.w / 2 + WALKER_HALF_W && s.y - s.h < walker.y;
}

/**
 * Does this building stand between the camera and the walker, over them?
 *
 * Its near ground edge at the walker's x must be nearer the camera (lower on
 * the glass) than the walker's feet, and its roof must rise past them. Such a
 * building goes see-through, the rule trees and finds already keep: you never
 * lose yourself behind scenery, the way a Pokémon GO avatar never does.
 */
export function isBuildingOverWalker(ring: readonly { x: number; y: number }[], top: number, walker: { x: number; y: number }): boolean {
  let near_y = -Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if ((a.x - walker.x) * (b.x - walker.x) > 0 || a.x === b.x) continue;
    const t = (walker.x - a.x) / (b.x - a.x);
    near_y = Math.max(near_y, a.y + t * (b.y - a.y));
  }
  return near_y > walker.y && top < walker.y;
}
