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
