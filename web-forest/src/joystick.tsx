import { useCallback, useEffect, useRef, useState } from "react";
import { haptic, hapticStop } from "./haptic";
import { STICK_DEADZONE, type PlayStick } from "./play-walk";

/**
 * The thumbstick.
 *
 * This exists because of where the showcase is. The walk is built on real
 * positions on a real campus, and on 26 September it gets demoed in a hall in
 * which there are no campus trees, no campus sectors, and a GPS fix that — if
 * it resolves at all — resolves to somewhere this app correctly refuses to
 * spawn anything. "Play walk" already solved that with WASD, which is a
 * complete answer on a laptop and no answer at all on the phone a judge is
 * holding.
 *
 * So: a stick. It drives the same `play` position source the keys drive, under
 * the same rules — inside `CAMPUS_BOX`, outside the restricted grove — so a
 * stick walk and a GPS walk produce the same journal, the same spawns and the
 * same badges. It is a different INPUT, never a different set of rules.
 *
 * It is not a spoofer in the sense that matters: nothing here writes a fake GPS
 * fix. The fix it produces is tagged `source: "play"`, every surface that shows
 * a position says which of the three it is, and the journal keeps that tag on
 * each sighting. A demo that quietly looked like a survey is the one outcome
 * this file is designed not to produce.
 */

/**
 * Radius of the stick's travel, in px. The base is twice this across.
 *
 * 52 was chosen on a desktop window and playtested on a real 375 px viewport,
 * where the 160 px base ran from x=18 to x=178 and the walker — drawn at the
 * centre of the screen, x=187 — sat directly against its edge. The two were
 * touching. 44 pulls the whole control clear of the character on the narrowest
 * phone the roadmap targets while staying well above the 44 px minimum tap
 * target.
 */
const THROW_PX = 44;
const KNOB_PX = 52;
/**
 * How far the knob's centre may move: the ring's radius less the knob's, so
 * at full throw the knob touches the ring from inside. Travelling the full
 * THROW_PX hung 26 px of knob outside the ring. The steer is normalised by the
 * same number, so full speed is still reached at the ring.
 */
const TRAVEL_PX = THROW_PX - KNOB_PX / 2;

/** Default lift above the bottom edge — see `bottom` below. */
const JOYSTICK_BOTTOM = 178;
const JOYSTICK_LEFT = 18;

/**
 * The stick's hit box in its container, which is the play map's own box. The
 * play map keeps finds out of it: the stick sits over the map at zIndex 30, so
 * a find drawn under it could be seen but a tap on it started a walk instead.
 */
export const JOYSTICK_BOX = {
  left: JOYSTICK_LEFT,
  bottom: JOYSTICK_BOTTOM,
  size: THROW_PX * 2 + KNOB_PX,
} as const;

interface Props {
  onSteer: (stick: PlayStick) => void;
  /** Hidden unless the walk is actually player-steered. */
  is_on: boolean;
  /**
   * Lift above the bottom edge.
   *
   * Has to clear two things, not one: the game dock, and the ODbL credit the
   * map parks at `credit_offset` (158 px). The credit is a licence condition,
   * not chrome, and a thumbstick sitting on top of it is the same failure as
   * hiding it.
   */
  bottom?: number;
}

export default function Joystick({ onSteer, is_on, bottom = JOYSTICK_BOTTOM }: Props) {
  const base_ref = useRef<HTMLDivElement | null>(null);
  const pointer_id = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [is_held, setHeld] = useState(false);

  const release = useCallback(() => {
    pointer_id.current = null;
    setKnob({ x: 0, y: 0 });
    setHeld(false);
    hapticStop();
    onSteer({ x: 0, y: 0 });
  }, [onSteer]);

  /* A stick left pushed while the mode changes underneath it would keep
     walking a walker that is no longer being steered. */
  useEffect(() => {
    if (!is_on) release();
  }, [is_on, release]);

  useEffect(() => () => onSteer({ x: 0, y: 0 }), [onSteer]);

  /**
   * A stick that is still held when the world stops telling us about it.
   *
   * `pointerup` is not guaranteed to arrive: a finger that slides off the glass
   * edge, a browser that steals the gesture, the phone locking, an alt-tab
   * mid-push. The element-level handlers cannot see any of those, and what they
   * leave behind is the worst failure this control has — the walker keeps
   * walking, on their own, with nobody touching the screen. On a booth phone
   * being passed between judges that is the bug that makes the demo look
   * broken.
   *
   * So the release is ALSO listened for on the window and on losing focus.
   * Releasing twice is free; releasing never is not.
   */
  useEffect(() => {
    if (!is_on) return;
    const stop = () => {
      if (pointer_id.current !== null) release();
    };
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", stop);
    return () => {
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop);
      document.removeEventListener("visibilitychange", stop);
    };
  }, [is_on, release]);

  const track = useCallback(
    (client_x: number, client_y: number) => {
      const rect = base_ref.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = client_x - (rect.left + rect.width / 2);
      const dy = client_y - (rect.top + rect.height / 2);
      const len = Math.hypot(dx, dy);
      const clamp = len > TRAVEL_PX ? TRAVEL_PX / len : 1;
      const kx = dx * clamp;
      const ky = dy * clamp;
      setKnob({ x: kx, y: ky });
      /* Screen y grows downward and the walk's y grows up the screen. The one
         negation in this file is here, and `play-walk.ts` documents why it is
         here rather than in four callers. */
      onSteer({ x: kx / TRAVEL_PX, y: -ky / TRAVEL_PX });
    },
    [onSteer],
  );

  if (!is_on) return null;

  const throw_ = Math.hypot(knob.x, knob.y) / TRAVEL_PX;
  const is_walking = throw_ >= STICK_DEADZONE;

  return (
    <div
      ref={base_ref}
      role="application"
      aria-label="Walk stick — drag to walk the demo campus"
      onPointerDown={(event) => {
        if (pointer_id.current !== null) return;
        pointer_id.current = event.pointerId;
        (event.target as Element).setPointerCapture?.(event.pointerId);
        setHeld(true);
        /* The stick is the one control you use without looking at it, so the
           confirmation that you actually have hold of it cannot be visual. */
        haptic("tap");
        track(event.clientX, event.clientY);
      }}
      onPointerMove={(event) => {
        if (pointer_id.current !== event.pointerId) return;
        track(event.clientX, event.clientY);
      }}
      onPointerUp={(event) => {
        if (pointer_id.current !== event.pointerId) return;
        (event.target as Element).releasePointerCapture?.(event.pointerId);
        release();
      }}
      onPointerCancel={release}
      onLostPointerCapture={release}
      style={{
        position: "absolute",
        left: JOYSTICK_LEFT,
        bottom,
        width: THROW_PX * 2 + KNOB_PX,
        height: THROW_PX * 2 + KNOB_PX,
        borderRadius: "50%",
        zIndex: 30,
        touchAction: "none",
        display: "grid",
        placeItems: "center",
        cursor: is_held ? "grabbing" : "grab",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      {/* The ring the knob travels inside — a target the thumb can find without
          looking, which on a walk is the only way it ever gets found. */}
      <div
        style={{
          position: "absolute",
          width: THROW_PX * 2,
          height: THROW_PX * 2,
          borderRadius: "50%",
          border: "2px solid rgba(255,255,255,0.8)",
          background: "rgba(38,58,36,0.16)",
        }}
      />
      {/* The compass ticks. Purely orienting: the stick is screen-relative, so
          "up" is always the way the camera is facing, never north. */}
      <svg
        width={THROW_PX * 2}
        height={THROW_PX * 2}
        viewBox="-52 -52 104 104"
        style={{ position: "absolute", pointerEvents: "none", opacity: 0.55 }}
        aria-hidden="true"
      >
        {[0, 90, 180, 270].map((a) => (
          <line
            key={a}
            x1={0}
            y1={-40}
            x2={0}
            y2={-46}
            stroke="rgba(255,255,255,0.95)"
            strokeWidth={3}
            strokeLinecap="round"
            transform={`rotate(${a})`}
          />
        ))}
      </svg>
      <div
        style={{
          position: "relative",
          width: KNOB_PX,
          height: KNOB_PX,
          borderRadius: "50%",
          transform: `translate(${knob.x}px, ${knob.y}px)`,
          transition: is_held ? "none" : "transform 140ms cubic-bezier(.2,.9,.3,1)",
          background: is_walking
            ? "#F5C842"
            : "#FFFFFF",
          border: "2px solid rgba(255,255,255,0.95)",
          /* Flat (09-25): a solid darker bottom edge is the only depth. */
          boxShadow: is_walking ? "0 3px 0 #C98A12" : "0 3px 0 #C9CCC4",
          display: "grid",
          placeItems: "center",
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 3.5 15 8H9zM12 20.5 9 16h6zM3.5 12 8 9v6zM20.5 12 16 15V9z"
            fill={is_walking ? "rgba(70,44,4,0.85)" : "rgba(60,64,52,0.5)"}
          />
        </svg>
      </div>
    </div>
  );
}
