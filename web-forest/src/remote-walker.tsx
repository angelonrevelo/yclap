import { useEffect, useRef, useState } from "react";
import type { WorldFind } from "./campus-world";
import Character, { type Stage } from "./character";
import { avatarPx, REMOTE_WALKER_SHARE } from "./camera-feel";
import { isInsideCampus, type Fix } from "./geo";
import {
  applyHall,
  FIND_SHOW_MS,
  isGliding,
  isNearbyFind,
  openHall,
  positionOf,
  pruneTrack,
  SEND_MIN_MS,
  shouldSend,
  SOURCE_LABEL,
  walkerIdOf,
  walkerOutCount,
  walkerOutLabel,
  type HallMode,
  type SentPose,
  type Track,
} from "./multiplayer";
import { screenAngleOf, signedAngle } from "./play-walk";
import { readPlayer, syncUrl } from "./sync";
import type { Projection } from "./tile-map";

/**
 * Everybody else on the play map, live — see `multiplayer.ts` for what is
 * shared and why so little.
 */

export interface Hall {
  track: Map<string, Track>;
  callout: { find: WorldFind; until: number }[];
  mode: HallMode;
  /** True once this phone's own pose has gone out, so it counts itself. */
  is_sharing: boolean;
}

/**
 * Walkers out right now, you included, or null while the hall has not
 * answered. Every "N walkers out" on screen reads this and nothing else.
 */
export function hallCountOf(hall: Hall): number | null {
  if (hall.mode !== "socket" && hall.mode !== "poll") return null;
  return walkerOutCount(hall.track.size, hall.is_sharing);
}

export function hallLabelOf(hall: Hall): string | null {
  return walkerOutLabel(hallCountOf(hall), hall.is_sharing);
}

/**
 * Open the hall once, for the whole app — the map, the trainer sheet and the
 * Dex all count off this one connection. `name` and `level` are read fresh on
 * every send, so signing in re-announces you under the account's name.
 */
export function useHall(input: { fix: Fix | null | undefined; stage: Stage; level: number; name: string }): Hall {
  const [track, setTrack] = useState<Map<string, Track>>(() => new Map());
  const [callout, setCallout] = useState<{ find: WorldFind; until: number }[]>([]);
  const [mode, setMode] = useState<HallMode>("off");
  const [is_sharing, setSharing] = useState(false);
  const latest = useRef(input);
  useEffect(() => {
    latest.current = input;
  });

  useEffect(() => {
    const base_url = syncUrl();
    if (!base_url) return;
    const me = readPlayer();
    const me_id = walkerIdOf(me.player_id);
    const seen_find = new Set<string>();
    let last: SentPose | null = null;

    const link = openHall(
      base_url,
      (message) => {
        const now = Date.now();
        if (message.type !== "pose" && message.type !== "gone") {
          const fresh = message.find.filter((f) => !seen_find.has(f.sighting_id));
          for (const f of fresh) seen_find.add(f.sighting_id);
          const fix = latest.current.fix;
          const near = fresh.filter((f) =>
            isNearbyFind(f, { walker_id: me_id, at: fix ? { lat: fix.lat, lon: fix.lon } : null }),
          );
          if (near.length) {
            setCallout((prev) => [
              ...prev.filter((c) => c.until > now),
              ...near.map((find) => ({ find, until: now + FIND_SHOW_MS })),
            ].slice(-4));
          }
        }
        setTrack((prev) => applyHall(prev, message, me_id, now));
      },
      setMode,
    );

    const send = () => {
      const { fix, stage, level, name } = latest.current;
      if (!fix || !isInsideCampus(fix)) return;
      const next = { lat: fix.lat, lon: fix.lon, level, stage, name };
      const now = Date.now();
      if (!shouldSend(last, next, now)) return;
      last = { ...next, at: now };
      link.sendPose({ player_id: me.player_id, source: fix.source, ...next });
      setSharing(true);
    };
    send();
    const send_timer = setInterval(send, SEND_MIN_MS);
    const prune_timer = setInterval(() => {
      const now = Date.now();
      setTrack((prev) => pruneTrack(prev, now));
      setCallout((prev) => (prev.some((c) => c.until <= now) ? prev.filter((c) => c.until > now) : prev));
    }, 2_000);

    return () => {
      clearInterval(send_timer);
      clearInterval(prune_timer);
      link.close();
    };
  }, []);

  return { track, callout, mode, is_sharing };
}

/** Re-render every frame while anyone is mid-glide, and not at all otherwise. */
function useGlideClock(track: Map<string, Track>): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if ([...track.values()].some((one) => isGliding(one, t))) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [track]);
  return now;
}

/** Screen margin a name tag keeps, px. */
const TAG_MARGIN = 6;

/**
 * How far to slide a walker's name tag so it stays on screen, in the tag's own
 * (pre-scale) pixels, and the widest it may be. The width is estimated from the
 * text — 11 px heavy type runs about 6.4 px a character — which is close
 * enough for a margin, and cheaper than measuring every walker every frame.
 */
export function tagShift(text: string, x: number, width: number, scale: number): { shift: number; max_width: number } {
  const max_width = Math.max(40, (width - TAG_MARGIN * 2) / scale);
  const half = (Math.min(max_width, text.length * 6.4 + 20) * scale) / 2;
  let shift = 0;
  if (x - half < TAG_MARGIN) shift = TAG_MARGIN - (x - half);
  else if (x + half > width - TAG_MARGIN) shift = width - TAG_MARGIN - (x + half);
  return { shift: shift / scale, max_width };
}

export default function RemoteWalkerLayer({
  hall,
  projection,
  bearing_degree,
  zoom,
}: {
  hall: Hall;
  projection: Projection;
  bearing_degree: number;
  /** The camera zoom your own walker is sized by — remote walkers follow it, a size down. */
  zoom: number;
}) {
  const now = useGlideClock(hall.track);
  const { width, height } = projection;
  /* Same source as your own walker, a size down — present, but plainly not you. */
  const size = Math.round(avatarPx(zoom, Math.min(width, height)) * REMOTE_WALKER_SHARE);

  return (
    <>
      {[...hall.track.values()].map((one) => {
        const at = projection.toScreen(projection.project(positionOf(one, now)));
        if (at.x < -80 || at.y < -120 || at.x > width + 80 || at.y > height + 120) return null;
        /* Same clamp as your own walker, so two phones side by side agree. */
        const scale = Math.max(0.6, Math.min(1.35, at.scale));
        const tag = tagShift(`${one.pose.name} · Lv ${one.pose.level} · ${SOURCE_LABEL[one.pose.source]}`, at.x, width, scale);
        return (
          <div
            key={one.pose.walker_id}
            style={{
              position: "absolute",
              left: at.x,
              top: at.y,
              transform: `translate(-50%, -100%) scale(${scale.toFixed(3)})`,
              transformOrigin: "50% 100%",
              pointerEvents: "none",
              zIndex: 5,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div
              style={{
                whiteSpace: "nowrap",
                fontSize: 11,
                fontWeight: 800,
                color: "#1B2E16",
                background: "rgba(255,255,255,0.94)",
                border: "1.5px solid #7FB3E0",
                borderRadius: 999,
                padding: "2px 8px",
                marginBottom: 2,
                boxShadow: "0 2px 6px rgba(24,38,20,0.2)",
                /* Kept inside the screen: a walker at the edge used to have
                   half its name cut off at 375 px. */
                maxWidth: tag.max_width,
                overflow: "hidden",
                textOverflow: "ellipsis",
                transform: tag.shift ? `translateX(${tag.shift.toFixed(1)}px)` : undefined,
              }}
            >
              {one.pose.name} · Lv {one.pose.level}
              <span style={{ fontWeight: 600, color: "rgba(27,46,22,0.6)" }}> · {SOURCE_LABEL[one.pose.source]}</span>
            </div>
            <Character
              stage={(one.pose.stage as Stage) ?? "egg"}
              size={size}
              is_idle_animated={false}
              is_walking={isGliding(one, now)}
              heading_degree={signedAngle(screenAngleOf(one.heading, bearing_degree))}
            />
          </div>
        );
      })}

      {/* The live feed ("Ana logged Molave") reads as a band under the player
          card, stacked, never pinned to the find: a find is usually a few
          metres from the walker, so a callout drawn at it sat across your own
          walker and the pet painted over it. zIndex 9 keeps it over the pet. */}
      {hall.callout.length > 0 && (
        <div
          aria-live="polite"
          style={{
            position: "absolute",
            left: 12,
            top: "calc(env(safe-area-inset-top, 0px) + 212px)",
            maxWidth: "calc(100% - 88px)",
            zIndex: 9,
            pointerEvents: "none",
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-start",
            gap: 6,
          }}
        >
          {hall.callout.slice(0, 3).map(({ find }) => (
            <div
              key={`find-${find.sighting_id}`}
              style={{
                maxWidth: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontSize: 12,
                fontWeight: 800,
                color: "#1B2E16",
                background: "rgba(255,246,222,0.97)",
                border: "1.5px solid #F0B429",
                borderRadius: 999,
                padding: "4px 11px",
                boxShadow: "0 3px 10px rgba(24,38,20,0.25)",
              }}
            >
              {find.player_name} logged {find.common_name || find.species_code}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/**
 * "N walkers out", you included. Hidden until the hall has actually answered:
 * with no server there is no count, and a zero we never measured is worse than
 * nothing.
 */
export function HallCount({ hall }: { hall: Hall }) {
  const label = hallLabelOf(hall);
  if (label === null) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      title={
        hall.mode === "socket"
          ? "Live over a socket. Shared: display name, level and your spot on the campus map."
          : "Live by polling every 2 s. Shared: display name, level and your spot on the campus map."
      }
      style={{
        position: "absolute",
        /* Under the right-hand camera orbs: the space under the player card
           is where the spawn toasts land. 240, not 172: the weather chip
           joined the column and the compass ended up under this pill. */
        top: "calc(env(safe-area-inset-top, 0px) + 240px)",
        right: 12,
        zIndex: 8,
        pointerEvents: "none",
        display: "flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
        fontSize: 12,
        fontWeight: 800,
        color: "#1B2E16",
        background: "rgba(255,255,255,0.92)",
        borderRadius: 999,
        padding: "4px 11px",
        boxShadow: "0 2px 8px rgba(24,38,20,0.22)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: 999,
          background: hall.mode === "socket" ? "#3FA34D" : "#E0A526",
        }}
      />
      {label}
    </div>
  );
}
