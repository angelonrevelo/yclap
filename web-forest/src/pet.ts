/**
 * The pet eagle — a companion that walks the map with you, and a "sleep pet"
 * that dozes when you stop.
 *
 * Source: the 09-25 voice note (`0:35`–`1:09`): "the pet eagle as a companion
 * … and also as a sleep pet." That sentence is the whole brief, so the spec
 * below is ours, chosen to be small, honest and demoable. The eagle is the
 * Ateneo Blue Eagle, drawn fresh for this — it is a mascot nod, not an
 * official asset, and nothing here claims otherwise.
 *
 * Spec (as built, 09-25)
 * ----------------------
 * 1. **Companion.** One eagle, default name "Agila", renameable, the name kept
 *    on this device only (`localStorage`). On the play map it stays beside the
 *    walker and follows with a lag in GROUND space, so when the camera is
 *    welded to the walker you still see it trailing along the path you walked
 *    — on a leash of `PET_LEASH_AVATAR` walker widths, and settling at the
 *    same spot beside the walker's feet (`petOffset`) whenever you stop.
 *    It flies (wings flapping) while you walk and perches when you stand.
 * 2. **Sleep pet.** It tucks in and sleeps (dimmed, "Zzz") when EITHER the
 *    walker has not moved and nobody has touched the screen for
 *    `PET_SLEEP_IDLE_MS` (2 min), OR the local clock is inside the night
 *    window 22:00–06:00 and you are not walking. Movement wakes it; at night
 *    it flies along while you walk and drops straight back to sleep the moment
 *    you stop (a sleeping bird sliding along the path read as a bug). It is the PET that sleeps. We do
 *    not track, infer or score the user's sleep, and the card says so.
 * 3. **Bond.** Grows only with real journal finds logged in the last 7 days
 *    (rolling, not calendar). No points, no decay mechanics of its own, no
 *    invented numbers: the card shows the find count it was computed from.
 *    Seeded demo rows (`demo-` ids) still count so the stage demo shows a
 *    bond, but the card labels the count as demo data when they are present.
 * 4. **Reduced motion.** No follow animation and no flapping — the eagle just
 *    appears in place. The pose still changes, because a pose is state.
 *
 * Everything in this file is pure (clock and storage are passed in) so the
 * thresholds are tested in `test/pet.test.ts`.
 */

export const PET_DEFAULT_NAME = "Agila";
export const PET_NAME_MAX = 16;
export const PET_NAME_KEY = "magisphere.pet.name";

/** Still AND untouched for this long, and the eagle dozes off. */
export const PET_SLEEP_IDLE_MS = 2 * 60 * 1000;
/** Local hours the eagle is asleep regardless of activity: 22:00 → 06:00. */
export const PET_NIGHT_START_HOUR = 22;
export const PET_NIGHT_END_HOUR = 6;
/** Bond window, rolling. */
export const PET_BOND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type PetPose = "fly" | "perch" | "sleep";
/** Why it is in that pose — the card speaks this, so it must be true. */
export type PetReason = "walking" | "night_walk" | "still" | "idle" | "night";

export interface PetState {
  pose: PetPose;
  reason: PetReason;
}

export function isNightHour(hour: number): boolean {
  return hour >= PET_NIGHT_START_HOUR || hour < PET_NIGHT_END_HOUR;
}

/**
 * The state machine. Walking always flies (at night too — it will not leave
 * you walking alone); standing at night sleeps at once; by day a long idle
 * sleeps; anything else perches.
 */
export function petState(input: { is_walking: boolean; idle_ms: number; hour: number }): PetState {
  const is_night = isNightHour(input.hour);
  if (input.is_walking) return { pose: "fly", reason: is_night ? "night_walk" : "walking" };
  if (is_night) return { pose: "sleep", reason: "night" };
  if (input.idle_ms >= PET_SLEEP_IDLE_MS) return { pose: "sleep", reason: "idle" };
  return { pose: "perch", reason: "still" };
}

/**
 * The card's one line. `is_egg`: the buddy has not hatched, so it neither
 * flies nor perches — an egg on the map read "perched, watching the trees".
 */
export function petStatusLine(name: string, state: PetState, is_egg = false): string {
  switch (state.reason) {
    case "walking":
      return is_egg ? `${name} is riding along in its nest.` : `${name} is flying along with you.`;
    case "night_walk":
      return is_egg ? `${name} is riding along in its nest, past its roost time.` : `${name} is up past its roost time to fly with you.`;
    case "still":
      return is_egg ? `${name} is warm in its nest, waiting to hatch.` : `${name} is perched, watching the trees.`;
    case "idle":
      return `${name} dozed off while you stood still. Walk or tap to wake it.`;
    case "night":
      return `${name} is asleep — eagles roost from 22:00 to 06:00.`;
  }
}

/* ── bond ─────────────────────────────────────────────────────────────── */

export interface PetBondStep {
  /** Finds this week needed to reach this step. */
  at: number;
  label: string;
}

export const PET_BOND_STEP: PetBondStep[] = [
  { at: 0, label: "Just met" },
  { at: 1, label: "Curious" },
  { at: 3, label: "Friendly" },
  { at: 6, label: "Trusting" },
  { at: 10, label: "Bonded" },
];

export interface PetBond {
  /** Real journal rows inside the window — the only input. */
  week_find_count: number;
  /** Index into `PET_BOND_STEP`. */
  step: number;
  label: string;
  /** Finds still needed for the next step, null at the top. */
  to_next: number | null;
  /** Some of the counted rows are seeded demo data. */
  is_demo: boolean;
}

/** The subset of a journal row the bond reads. */
export interface PetFind {
  sighting_id: string;
  created_at: string;
}

export function petBond(row: PetFind[], now: number, demo_prefix = "demo-"): PetBond {
  let count = 0;
  let is_demo = false;
  for (const r of row) {
    const at = Date.parse(r.created_at);
    if (!Number.isFinite(at)) continue;
    /* Future-dated rows (a skewed clock) do not count: better a smaller true
       number than a bigger doubtful one. */
    if (at > now || now - at > PET_BOND_WINDOW_MS) continue;
    count += 1;
    if (r.sighting_id.startsWith(demo_prefix)) is_demo = true;
  }
  let step = 0;
  for (let i = 0; i < PET_BOND_STEP.length; i += 1) if (count >= PET_BOND_STEP[i].at) step = i;
  const next = PET_BOND_STEP[step + 1];
  return {
    week_find_count: count,
    step,
    label: PET_BOND_STEP[step].label,
    to_next: next ? next.at - count : null,
    is_demo,
  };
}

/* ── name ─────────────────────────────────────────────────────────────── */

/** Trim, collapse spaces, cap the length; empty falls back to the default. */
export function cleanPetName(raw: string | null | undefined): string {
  const name = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, PET_NAME_MAX).trim();
  return name || PET_DEFAULT_NAME;
}

interface NameStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function readPetName(store: NameStore | null): string {
  try {
    return cleanPetName(store?.getItem(PET_NAME_KEY));
  } catch {
    return PET_DEFAULT_NAME;
  }
}

export function writePetName(store: NameStore | null, raw: string): string {
  const name = cleanPetName(raw);
  try {
    store?.setItem(PET_NAME_KEY, name);
  } catch {
    /* private mode / full quota: the name still holds for this session */
  }
  return name;
}

/* ── follow ───────────────────────────────────────────────────────────── */

export interface PetPoint {
  lat: number;
  lon: number;
}

/** How long the eagle takes to close half the gap to the walker. */
export const PET_FOLLOW_HALF_LIFE_MS = 420;
/** Further than this and it simply appears beside you — a walk-to or a GPS jump, not a stroll. */
export const PET_SNAP_METER = 60;

const METER_PER_DEGREE = 111_320;

function roughMeter(a: PetPoint, b: PetPoint): number {
  const dy = (a.lat - b.lat) * METER_PER_DEGREE;
  const dx = (a.lon - b.lon) * METER_PER_DEGREE * Math.cos((a.lat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/**
 * One frame of the lag: exponential approach, frame-rate independent.
 * Returns the target itself once within ~5 cm, so the animation loop can stop.
 */
export function followStep(
  pet: PetPoint | null,
  target: PetPoint,
  dt_ms: number,
  half_life_ms = PET_FOLLOW_HALF_LIFE_MS,
  max_meter = Infinity,
): PetPoint {
  if (!pet) return target;
  const gap = roughMeter(pet, target);
  if (gap > PET_SNAP_METER || gap < 0.05) return target;
  let keep = Math.pow(0.5, Math.max(0, dt_ms) / half_life_ms);
  /* The leash. At the stick's top pace a pure lag trails by metres — about
     200 px at the street camera during a walk-to, which the playtest read as
     the eagle wandering off. Past `max_meter` it is pulled back onto the
     leash along the same line, so it still trails, just never far. */
  if (gap * keep > max_meter) keep = Math.max(0, max_meter) / gap;
  return {
    lat: target.lat + (pet.lat - target.lat) * keep,
    lon: target.lon + (pet.lon - target.lon) * keep,
  };
}

/** The leash, in walker widths: the lag never trails further than this behind its perch. */
export const PET_LEASH_AVATAR = 0.45;

/**
 * Where the eagle sits relative to the walker's FEET, in unscaled screen px,
 * for its pose, the walker's drawn size and its own.
 *
 * Derived from the walker's size rather than fixed, because the walker is no
 * longer one size: a fixed 46 px put it over the walker's lower right once
 * the walker grew past ~100 px. The walker's figure fills about
 * `PET_FIGURE_SHARE` of its box, so the eagle stands just past that edge — on
 * the ground beside the feet when perched or asleep, off the shoulder in
 * flight — and never over the character.
 */
export const PET_FIGURE_SHARE = 0.7;
const PET_GAP_PX = 4;

export function petOffset(pose: PetPose, avatar_px: number, pet_px: number): { x: number; y: number } {
  const beside = (avatar_px * PET_FIGURE_SHARE) / 2 + pet_px / 2 + PET_GAP_PX;
  if (pose === "fly") return { x: Math.round(beside), y: Math.round(-avatar_px * 0.45) };
  return { x: Math.round(beside), y: 2 };
}

/** The eagle's own size for a walker size: half the walker, within reason. */
export function petPx(avatar_px: number): number {
  return Math.round(Math.max(40, Math.min(72, avatar_px * 0.52)));
}

export function isSettled(pet: PetPoint | null, target: PetPoint): boolean {
  return pet !== null && pet.lat === target.lat && pet.lon === target.lon;
}
