/**
 * The streak, as a flame that is holding steady rather than a tree on fire.
 *
 * From `38:13` in the 09-21 recording. The room wanted the streak shown as a
 * fire on the buddy, and — in the same breath — worried about exactly what that
 * would look like on a plant: *"it's a fire slash number"*, then the concern
 * about how it reads, then `40:00`, *"you have to keep the fire small."*
 *
 * Four rules come out of that, and all four are structural, not decoration:
 *
 * 1. **It never touches the plant.** The flame floats beside and above the
 *    buddy with clear air around it. A flame overlapping leaves is a plant on
 *    fire no matter what the caption says.
 * 2. **It is small and it stays small.** Growth is shown by the flame's COLOUR
 *    walking up a heat ramp — ember → amber → blue-white — and by the number
 *    beside it. Size moves barely at all, because a flame that grows toward the
 *    canopy is a flame that is about to reach it.
 * 3. **It is always numbered.** A pictogram alone is ambiguous; `3` beside it is
 *    not. This is the "fire slash number" the room landed on, and the number is
 *    the part that carries the meaning.
 * 4. **A cold streak is a cold flame, not a missing one.** At zero it renders a
 *    grey outline. Removing it entirely would make the gap read as a bug and
 *    would hide the one state a streak feature exists to make you feel.
 */

import { flameScale, heatFor } from "./streak-heat.ts";

interface Props {
  weeks: number;
  size?: number;
  /** A group streak is drawn with a ring, so the two are never confused. */
  is_group?: boolean;
  /** Names the surface uses; here only for the accessible label. */
  label?: string;
}

export default function StreakFlame({ weeks, size = 34, is_group = false, label }: Props) {
  const heat = heatFor(weeks);
  const is_cold = weeks <= 0;
  /* Size moves by at most FLAME_MAX_GROWTH across the whole range — rule 2. */
  const scale = flameScale(weeks);

  return (
    <span
      role="img"
      aria-label={
        label ??
        (is_cold
          ? `${is_group ? "Group streak" : "Streak"}: none yet`
          : `${is_group ? "Group streak" : "Streak"}: ${weeks} ${weeks === 1 ? "week" : "weeks"}`)
      }
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        lineHeight: 1,
      }}
    >
      <span
        style={{
          position: "relative",
          width: size,
          height: size,
          display: "grid",
          placeItems: "center",
          borderRadius: "50%",
          /* The ring is the group marker, and the only size difference between
             the two flames. */
          border: is_group ? `2px solid ${is_cold ? "rgba(255,255,255,0.3)" : heat.edge}` : "none",
          background: is_cold ? "transparent" : `radial-gradient(circle, ${heat.glow} 0%, rgba(0,0,0,0) 70%)`,
        }}
      >
        <style>{`
          @keyframes yc-flame { 0%,100% { transform: scaleY(1) translateY(0) } 50% { transform: scaleY(1.09) translateY(-4%) } }
          @media (prefers-reduced-motion: reduce) { .yc-flame { animation: none !important } }
        `}</style>
        <svg
          className={is_cold ? undefined : "yc-flame"}
          width={size * 0.66 * scale}
          height={size * 0.66 * scale}
          viewBox="0 0 24 24"
          aria-hidden="true"
          style={{
            transformOrigin: "50% 100%",
            animation: is_cold ? undefined : "yc-flame 1.5s ease-in-out infinite",
          }}
        >
          <path
            d="M12 2.2c2.6 3.3 4.1 5.6 4.1 7.7 0 1.5-.7 2.6-1.7 3.3.5-1.5.2-3-1-4.6-.3 2.3-1.5 3.6-2.9 4.9-1.6 1.5-2.4 2.8-2.4 4.2 0 2.3 2 4.1 5 4.1s5.4-2.2 5.4-5.2c0-4.6-3.9-8-6.5-14.4z"
            transform="translate(-1.2 0)"
            fill={is_cold ? "none" : heat.edge}
            stroke={is_cold ? heat.edge : "none"}
            strokeWidth={is_cold ? 1.6 : 0}
            strokeLinejoin="round"
            opacity={is_cold ? 0.75 : 1}
          />
          {!is_cold && (
            <path
              d="M12 11.4c1.4 2.1 2.2 3.4 2.2 4.6 0 1.5-1.1 2.5-2.4 2.5s-2.4-1-2.4-2.5c0-1.3.9-2.6 2.6-4.6z"
              fill={heat.core}
            />
          )}
        </svg>
      </span>
      <span
        style={{
          fontWeight: 800,
          fontSize: size * 0.42,
          color: is_cold ? "rgba(255,255,255,0.55)" : heat.core,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {weeks}
      </span>
    </span>
  );
}
