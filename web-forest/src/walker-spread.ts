/**
 * Where everybody else stands on the glass, so a crowd reads as a crowd.
 *
 * Every phone that opens the play map without a fix starts on the same stick
 * start, so the hall used to draw five walkers on one spot: five stickers in a
 * pile over your own trainer and five name tags stacked into one unreadable
 * block (the 09-26 recording). Positions stay true — this only nudges a
 * walker's DRAWING off a spot someone nearer the camera already holds, on a
 * ring around it, at an angle keyed to the walker so it does not reshuffle
 * frame to frame. Then each name tag is kept only if it clears every tag
 * nearer the camera; the walker still shows, the pile of text does not.
 */

export interface Spot {
  id: string;
  x: number;
  y: number;
  /** The perspective scale the walker is drawn at — gaps grow with it. */
  scale: number;
}

export interface Placed {
  x: number;
  y: number;
}

/** A stable 0..1 per walker, so its place on the ring never jumps. */
export function unitOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

const RING_STEP = 12;
const RING_MAX = 4;

/**
 * Nearer the camera (lower on the glass) claims its spot first; you, at
 * `self`, claim yours before anybody. A walker closer than `gap_px × scale`
 * to a claimed spot is drawn on the nearest free point of a ring around its
 * true spot instead.
 */
export function spreadWalker(
  spot: Spot[],
  self: Placed | null,
  gap_px: number,
  /** Room kept round YOU — your walker is drawn a size up on everybody else. */
  self_gap_px = gap_px,
): Map<string, Placed> {
  const claimed: Placed[] = [];
  const out = new Map<string, Placed>();
  const order = [...spot].sort((a, b) => b.y - a.y || a.id.localeCompare(b.id));
  for (const one of order) {
    const gap = gap_px * one.scale;
    const self_gap = self_gap_px * one.scale;
    const isFree = (p: Placed) =>
      (!self || Math.hypot(self.x - p.x, self.y - p.y) >= self_gap) &&
      claimed.every((c) => Math.hypot(c.x - p.x, c.y - p.y) >= gap);
    let at: Placed = { x: one.x, y: one.y };
    if (!isFree(at)) {
      const start = unitOf(one.id) * Math.PI * 2;
      let found: Placed | null = null;
      for (let ring = 0.5; ring <= RING_MAX && !found; ring += 0.5) {
        for (let k = 0; k < RING_STEP; k++) {
          const a = start + (k * Math.PI * 2) / RING_STEP;
          /* Flattened ring: the ground is raked, so sideways room is cheaper than depth. */
          const r = Math.max(gap, self_gap) * ring;
          const p = { x: one.x + Math.cos(a) * r, y: one.y + Math.sin(a) * r * 0.55 };
          if (isFree(p)) {
            found = p;
            break;
          }
        }
      }
      at = found ?? { x: one.x + Math.max(gap, self_gap) * (RING_MAX + 1) * Math.cos(start), y: one.y };
    }
    claimed.push(at);
    out.set(one.id, at);
  }
  return out;
}

export interface TagBox {
  id: string;
  /** Centre x, top y and size in screen px. */
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Tags nearer the camera (lower on the glass) win; a tag that would overlap
 * one already kept is dropped. `self` is your own tag's box, if it is shown;
 * `blocked` is anything else placed first that a tag must not cover (the
 * area pills).
 */
export function keepTag(box: TagBox[], self: TagBox | null = null, blocked: readonly TagBox[] = []): Set<string> {
  const kept: TagBox[] = [...(self ? [self] : []), ...blocked];
  const out = new Set<string>();
  const overlap = (a: TagBox, b: TagBox) =>
    Math.abs(a.x - b.x) * 2 < a.w + b.w && a.y < b.y + b.h && b.y < a.y + a.h;
  for (const one of [...box].sort((a, b) => b.y - a.y || a.id.localeCompare(b.id))) {
    if (kept.some((k) => overlap(k, one))) continue;
    kept.push(one);
    out.add(one.id);
  }
  return out;
}
