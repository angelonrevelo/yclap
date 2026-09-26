import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import fly_svg from "./asset/magi/pet/eagle-fly.svg?raw";
import perch_svg from "./asset/magi/pet/eagle-perch.svg?raw";
import sleep_svg from "./asset/magi/pet/eagle-sleep.svg?raw";
import { DEMO_PREFIX } from "./demo-seed";
import { readSighting } from "./journal";
import {
  followStep,
  isSettled,
  PET_BOND_STEP,
  PET_LEASH_AVATAR,
  PET_NAME_MAX,
  petBond,
  petOffset,
  petPx,
  petState,
  petStatusLine,
  readPetName,
  writePetName,
  type PetPoint,
  type PetPose,
  type PetState,
} from "./pet";
import type { Projection } from "./tile-map";
import type { Stage } from "./stage.ts";
import Character from "./character";
import { depthZ } from "./depth";

const CharacterModel = lazy(() => import("./character-model"));

/**
 * Agila on the map, in 3D — your buddy at its own growth stage, following the
 * trainer the way a Pokémon GO buddy does. Only a full-grown eagle takes to
 * the air; an egg or a chick waits on the ground. Asleep, its clip stops.
 * The flat art stands in while the viewer chunk loads — the eagle's pose art
 * only for a full-grown eagle, the stage sticker otherwise, or an egg showed
 * as a perched eagle for the first seconds (the card keeps the same rule).
 */
function PetModel({ stage, pose, size }: { stage: Stage; pose: PetPose; size: number }) {
  const px = Math.round(size * 1.35);
  const flat = stage === "tree" ? <PetArt pose={pose} size={size} /> : <Character stage={stage} vigor={1} size={size} />;
  return (
    <Suspense fallback={flat}>
      <div
        style={{
          width: px,
          height: px,
          margin: `${size - px}px 0 0 ${(size - px) / 2}px`,
          filter: pose === "sleep" ? "saturate(.8) brightness(.92)" : undefined,
        }}
      >
        <CharacterModel stage={stage} size={px} is_paused={pose === "sleep"} />
      </div>
    </Suspense>
  );
}

/**
 * The pet eagle on the play map, and its card. The rules live in `pet.ts`
 * (spec at the top of that file); this is only drawing and wiring.
 *
 * It rides the same overlay as the walker — on the glass, not in the tilted
 * plane — but its POSITION is smoothed in ground space, so with the camera
 * welded to the walker it still visibly trails along the path. Taps on it are
 * kept from the map's walk-to by `data-play-marker`, the same guard the
 * spawn markers use.
 */

const ART: Record<PetPose, string> = { fly: fly_svg, perch: perch_svg, sleep: sleep_svg };

const TICK_MS = 1000;

function storage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function isReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

const STYLE = `
  .pet-art svg { width: 100%; height: 100%; display: block; overflow: visible }
  .pet-fly .pet-wing-l { transform-box: fill-box; transform-origin: 100% 55%; animation: pet-flap-l .34s ease-in-out infinite alternate }
  .pet-fly .pet-wing-r { transform-box: fill-box; transform-origin: 0% 55%; animation: pet-flap-r .34s ease-in-out infinite alternate }
  .pet-fly { animation: pet-bob 1.1s ease-in-out infinite alternate }
  .pet-sleep { opacity: .78; filter: saturate(.75) }
  .pet-zzz { position: absolute; font-weight: 800; color: var(--brand-blue, #3463b5); pointer-events: none; animation: pet-zzz 2.4s ease-in-out infinite }
  @keyframes pet-flap-l { from { transform: rotate(-10deg) } to { transform: rotate(24deg) } }
  @keyframes pet-flap-r { from { transform: rotate(10deg) } to { transform: rotate(-24deg) } }
  @keyframes pet-bob { from { transform: translateY(0) } to { transform: translateY(-6px) } }
  @keyframes pet-zzz { 0% { opacity: 0; transform: translate(0, 4px) } 30% { opacity: 1 } 100% { opacity: 0; transform: translate(8px, -14px) } }
  @media (prefers-reduced-motion: reduce) {
    .pet-fly, .pet-fly .pet-wing-l, .pet-fly .pet-wing-r, .pet-zzz { animation: none !important }
    .pet-shift { transition: none !important }
  }
`;

function PetArt({ pose, size }: { pose: PetPose; size: number }) {
  return (
    <div
      className={`pet-art pet-${pose}`}
      style={{ width: size, height: size, position: "relative" }}
      /* Our own hand-authored files under src/asset/magi/pet — inlined so the
         wing groups can be animated, which an <img> cannot do. */
      dangerouslySetInnerHTML={{ __html: ART[pose] }}
    />
  );
}

/** A fix that has not moved for this long means the walker has stopped. */
const STILL_AFTER_MS = 2500;

/**
 * Activity clock. Walking is read off the fix itself moving (the demo walk and
 * a real GPS track look the same here), and any touch or key counts as input.
 * It ticks on its own because a walker who stops also stops re-rendering the
 * map — nothing else would ever notice the two minutes passing.
 */
function useActivity(fix: PetPoint): { is_walking: boolean; idle_ms: number; hour: number } {
  /* One state object so a tick, a step and a touch are each one render. */
  const [clock, setClock] = useState(() => {
    const t = Date.now();
    return { now: t, last_move: 0, last_input: t };
  });
  const prev_fix = useRef<string | null>(null);
  useEffect(() => {
    const key = `${fix.lat},${fix.lon}`;
    const prev = prev_fix.current;
    prev_fix.current = key;
    /* The first fix is arriving, not walking — do not flap on page load. */
    if (prev === null || prev === key) return;
    const t = Date.now();
    setClock((c) => ({ ...c, now: t, last_move: t }));
  }, [fix.lat, fix.lon]);
  useEffect(() => {
    const wake = () => {
      const t = Date.now();
      setClock((c) => ({ ...c, now: t, last_input: t }));
    };
    window.addEventListener("pointerdown", wake, { passive: true });
    window.addEventListener("keydown", wake);
    const id = window.setInterval(() => setClock((c) => ({ ...c, now: Date.now() })), TICK_MS);
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("keydown", wake);
      window.clearInterval(id);
    };
  }, []);
  const since_move = clock.now - clock.last_move;
  return {
    is_walking: since_move < STILL_AFTER_MS,
    idle_ms: Math.max(0, Math.min(since_move, clock.now - clock.last_input)),
    hour: new Date(clock.now).getHours(),
  };
}

/**
 * Ground-space lag behind the walker, on a leash of `max_meter`; under reduced
 * motion it is simply there.
 *
 * `target` is where the walker is DRAWN (the gliding camera centre when the
 * camera is welded to them), and it moves every frame. So the loop is one
 * loop that reads the target through a ref and runs until it settles — not an
 * effect per target, which would restart the clock on every frame — and the
 * eagle is drawn at the result directly. It used to chase the 20 Hz fix and be
 * drawn at `anchor + (pet − fix)`: every fix step jumped that offset back, a
 * sawtooth of a few pixels along the direction of travel.
 */
function useFollow(target: PetPoint, max_meter: number): PetPoint {
  const [is_reduced] = useState(isReducedMotion);
  const [pet, setPet] = useState<PetPoint>(target);
  const pet_ref = useRef<PetPoint | null>(target);
  const target_ref = useRef(target);
  target_ref.current = target;
  const leash_ref = useRef(max_meter);
  leash_ref.current = max_meter;
  const frame = useRef<number | null>(null);
  const { lat, lon } = target;
  useEffect(() => {
    if (is_reduced || frame.current !== null) return;
    let last = performance.now();
    const step = (t: number) => {
      const goal = target_ref.current;
      const next = followStep(pet_ref.current, goal, t - last, undefined, leash_ref.current);
      last = t;
      pet_ref.current = next;
      setPet(next);
      frame.current = isSettled(next, goal) ? null : requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  }, [lat, lon, is_reduced]);
  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    },
    [],
  );
  return is_reduced ? target : pet;
}

export default function PetEagle({
  projection,
  fix,
  anchor,
  avatar_px,
  stage,
}: {
  /** The buddy's growth stage — which Agila follows you. */
  stage: Stage;
  projection: Projection;
  /** The walker's position — what the eagle follows and what wakes it. */
  fix: PetPoint;
  /**
   * Where the walker is DRAWN this frame (the gliding camera centre when the
   * camera is welded to it). The eagle is drawn at its lag relative to this,
   * so it stays beside the figure on screen instead of beside a fix the
   * figure is still gliding toward.
   */
  anchor: PetPoint;
  /** The walker's drawn size (`avatarPx`) — the perch and the leash scale off it. */
  avatar_px: number;
}) {
  const [name, setName] = useState(() => readPetName(storage()));
  const [is_open, setOpen] = useState(false);
  const { is_walking, idle_ms, hour } = useActivity(fix);
  const state = petState({ is_walking, idle_ms, hour });
  const leash_m = PET_LEASH_AVATAR * avatar_px * projection.meter_per_pixel;
  const pet = useFollow({ lat: anchor.lat, lon: anchor.lon }, leash_m);
  const size = petPx(avatar_px);

  const walker_at = projection.toScreen(projection.project(anchor));
  const lag_at = projection.toScreen(projection.project(pet));
  const scale = Math.max(0.6, Math.min(1.35, lag_at.scale));
  /* Only a full-grown eagle flies; younger stages keep to the ground beside you. */
  const pose: PetPose = state.pose === "fly" && stage !== "tree" ? "perch" : state.pose;
  const offset = petOffset(pose, avatar_px, size);
  /* The lag trails along the path — up and down the glass freely, but never
     sideways INTO the figure: `petOffset` puts the eagle beside the walker,
     and a lag pulling it back across them is what sat the egg on their legs.
     The leash (`PET_LEASH_AVATAR`) is shorter than the perch distance, so
     holding the eagle's centre at least that far to the right costs no flip. */
  const beside = offset.x * scale;
  const centre_dx = Math.max(beside, lag_at.x - walker_at.x + beside);
  const at = { x: walker_at.x + centre_dx - beside, y: lag_at.y };
  /* Where it meets the ground, for the painter's order against the walker
     and the trees: a flying eagle's ground point is still under it. */
  const foot_y = at.y + (pose === "fly" ? 0 : offset.y * scale);

  return (
    <>
      <style>{STYLE}</style>
      <div
        style={{
          position: "absolute",
          left: at.x,
          top: at.y,
          transform: `scale(${scale.toFixed(3)})`,
          transformOrigin: "0 0",
          zIndex: depthZ(foot_y),
          pointerEvents: "none",
        }}
      >
        <button
          type="button"
          data-play-marker
          className="pet-shift"
          aria-label={`${name}, your pet eagle — ${state.pose === "sleep" ? "asleep" : "awake"}. Open card.`}
          onClick={(event) => {
            event.stopPropagation();
            setOpen(true);
          }}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: size,
            height: size,
            padding: 0,
            border: 0,
            background: "transparent",
            cursor: "pointer",
            pointerEvents: "auto",
            transform: `translate(${offset.x - size / 2}px, ${offset.y - size}px)`,
            transition: "transform .5s cubic-bezier(.3,.7,.3,1)",
          }}
        >
          {/* No drawn contact shadow: the 3D model casts its own. */}
          <PetModel stage={stage} pose={pose} size={size} />
          {state.pose === "sleep" && (
            <span className="pet-zzz" style={{ right: -6, top: -4, fontSize: 14 }} aria-hidden>
              Zzz
            </span>
          )}
        </button>
      </div>
      {is_open &&
        createPortal(
          <PetCard
            name={name}
            state={state}
            stage={stage}
            onRename={(raw) => setName(writePetName(storage(), raw))}
            onClose={() => setOpen(false)}
          />,
          document.body,
        )}
    </>
  );
}

export function PetCard({
  name,
  state,
  stage = "tree",
  onRename,
  onClose,
}: {
  name: string;
  state: PetState;
  /** The buddy's growth stage: an egg on the map is an egg on its card. */
  stage?: Stage;
  onRename: (raw: string) => void;
  onClose: () => void;
}) {
  /* Read at open, not on every frame: the journal can carry photos and this
     is the only moment the numbers are on screen. */
  const [bond] = useState(() => petBond(readSighting(), Date.now(), DEMO_PREFIX));
  const [is_editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const top = PET_BOND_STEP.length - 1;

  return (
    <div
      role="dialog"
      aria-label={`${name}, your pet eagle`}
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(14,59,42,0.18)" }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          position: "absolute",
          left: "50%",
          bottom: 176,
          transform: "translateX(-50%)",
          width: "min(340px, 92vw)",
          background: "var(--brand-cream, #f7faf6)",
          color: "#0E3B2A",
          border: "2px solid #0E3B2A",
          borderRadius: 22,
          padding: 16,
          boxShadow: "0 6px 0 rgba(14,59,42,0.18)",
          fontFamily: "var(--type-family)",
        }}
      >
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div
            style={{
              flexShrink: 0,
              borderRadius: 16,
              background: state.pose === "sleep" ? "#DDE6F5" : "#EBFDEF",
              padding: 4,
              position: "relative",
            }}
          >
            {/* The eagle art is the grown bird's; any younger stage is drawn
                as itself, the same figure the map shows. */}
            {stage === "tree" ? <PetArt pose={state.pose} size={76} /> : <Character stage={stage} vigor={1} size={76} />}
            {state.pose === "sleep" && (
              <span className="pet-zzz" style={{ right: 2, top: 0, fontSize: 13 }} aria-hidden>
                Zzz
              </span>
            )}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: "0.08em", color: "var(--brand-blue, #3463b5)" }}>
              {state.pose === "sleep" ? "YOUR PET EAGLE · RESTING" : "YOUR PET EAGLE"}
            </div>
            {is_editing ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  onRename(draft);
                  setEditing(false);
                }}
                style={{ display: "flex", gap: 6, marginTop: 4 }}
              >
                <input
                  autoFocus
                  value={draft}
                  maxLength={PET_NAME_MAX}
                  onChange={(event) => setDraft(event.target.value)}
                  aria-label="Pet name"
                  style={{
                    minWidth: 0,
                    flex: 1,
                    fontSize: 16,
                    fontWeight: 700,
                    padding: "4px 8px",
                    border: "2px solid #0E3B2A",
                    borderRadius: 10,
                    background: "#fff",
                  }}
                />
                <button type="submit" style={chipStyle}>
                  Save
                </button>
              </form>
            ) : (
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 2 }}>
                <div style={{ fontSize: 22, fontWeight: 800 }}>{name}</div>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(name);
                    setEditing(true);
                  }}
                  style={{ ...chipStyle, fontSize: 11 }}
                >
                  Rename
                </button>
              </div>
            )}
            <div style={{ fontSize: 12.5, marginTop: 4, lineHeight: 1.35 }}>{petStatusLine(name, state, stage === "egg")}</div>
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontWeight: 800, fontSize: 14 }}>Bond · {bond.label}</div>
            <div style={{ fontSize: 11.5, opacity: 0.75 }}>
              {bond.week_find_count} {bond.week_find_count === 1 ? "find" : "finds"} in 7 days
              {bond.is_demo ? " (demo journal)" : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 4, marginTop: 6 }} aria-hidden>
            {PET_BOND_STEP.map((row, i) => (
              <div
                key={row.label}
                style={{
                  flex: 1,
                  height: 8,
                  borderRadius: 999,
                  background: i <= bond.step ? "var(--brand-blue, #3463b5)" : "rgba(14,59,42,0.12)",
                }}
              />
            ))}
          </div>
          <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.4 }}>
            {bond.week_find_count === 0
              ? `No finds logged in the last 7 days yet — log a species and ${name} perks up.`
              : bond.step === top
                ? `${name} is as bonded as it gets. Keep logging to keep it that way.`
                : `${bond.to_next} more ${bond.to_next === 1 ? "find" : "finds"} this week to reach ${PET_BOND_STEP[bond.step + 1].label}.`}
          </div>
        </div>

        <div style={{ fontSize: 11, marginTop: 12, opacity: 0.7, lineHeight: 1.4 }}>
          Bond counts only species you logged in the last 7 days. {name} naps when you stand still for 2 minutes and
          roosts 22:00–06:00 — it is the eagle that sleeps; nothing here tracks yours.
        </div>

        <button type="button" onClick={onClose} style={{ ...chipStyle, marginTop: 12, width: "100%", padding: "8px 0" }}>
          Close
        </button>
      </div>
    </div>
  );
}

const chipStyle = {
  border: "2px solid #0E3B2A",
  borderRadius: 999,
  background: "#fff",
  color: "#0E3B2A",
  fontWeight: 800,
  fontSize: 12,
  padding: "3px 10px",
  cursor: "pointer",
} as const;
