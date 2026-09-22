import { useCallback, useEffect, useRef, useState } from "react";
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

/** Radius of the stick's travel, in px. The base is twice this across. */
const THROW_PX = 52;
const KNOB_PX = 56;

interface Props {
  onSteer: (stick: PlayStick) => void;
  /** Hidden unless the walk is actually player-steered. */
  is_on: boolean;
  /** Lift above the bottom edge, so it clears the game dock. */
  bottom?: number;
}

export default function Joystick({ onSteer, is_on, bottom = 150 }: Props) {
  const base_ref = useRef<HTMLDivElement | null>(null);
  const pointer_id = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [is_held, setHeld] = useState(false);

  const release = useCallback(() => {
    pointer_id.current = null;
    setKnob({ x: 0, y: 0 });
    setHeld(false);
    onSteer({ x: 0, y: 0 });
  }, [onSteer]);

  /* A stick left pushed while the mode changes underneath it would keep
     walking a walker that is no longer being steered. */
  useEffect(() => {
    if (!is_on) release();
  }, [is_on, release]);

  useEffect(() => () => onSteer({ x: 0, y: 0 }), [onSteer]);

  const track = useCallback(
    (client_x: number, client_y: number) => {
      const rect = base_ref.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = client_x - (rect.left + rect.width / 2);
      const dy = client_y - (rect.top + rect.height / 2);
      const len = Math.hypot(dx, dy);
      const clamp = len > THROW_PX ? THROW_PX / len : 1;
      const kx = dx * clamp;
      const ky = dy * clamp;
      setKnob({ x: kx, y: ky });
      /* Screen y grows downward and the walk's y grows up the screen. The one
         negation in this file is here, and `play-walk.ts` documents why it is
         here rather than in four callers. */
      onSteer({ x: kx / THROW_PX, y: -ky / THROW_PX });
    },
    [onSteer],
  );

  if (!is_on) return null;

  const throw_ = Math.hypot(knob.x, knob.y) / THROW_PX;
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
        left: 18,
        bottom,
        width: THROW_PX * 2 + KNOB_PX,
        height: THROW_PX * 2 + KNOB_PX,
        borderRadius: "50%",
        zIndex: 30,
        touchAction: "none",
        display: "grid",
        placeItems: "center",
        background: "radial-gradient(circle, rgba(255,252,242,0.5) 0%, rgba(255,252,242,0.22) 62%, rgba(255,252,242,0) 72%)",
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
          boxShadow: "inset 0 2px 10px rgba(24,38,20,0.18)",
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
            ? "radial-gradient(circle at 34% 30%, #FFF6DE 0%, #F0B429 58%, #C98A12 100%)"
            : "radial-gradient(circle at 34% 30%, #FFFDF6 0%, #E9E2CF 60%, #C9C0A9 100%)",
          border: "2px solid rgba(255,255,255,0.95)",
          boxShadow: "0 5px 14px rgba(24,38,20,0.34)",
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
