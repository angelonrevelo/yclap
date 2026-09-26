import { useEffect, useRef, useState } from "react";
import type { WorldFind } from "./campus-world";
import Character, { Walker, type Stage } from "./character";
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
import { depthZ } from "./depth";
import { keepTag, spreadWalker } from "./walker-spread";
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

/** How many other walkers stand in 3D at once; the rest keep the sticker. */
const REMOTE_MODEL_MAX = 3;

/** The walker scale clamp your own walker uses, so two phones side by side agree. */
function clampScale(scale: number): number {
  return Math.max(0.6, Math.min(1.35, scale));
}

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
  avoid_rect = [],
  part,
}: {
  hall: Hall;
  projection: Projection;
  bearing_degree: number;
  /** The camera zoom your own walker is sized by — remote walkers follow it, a size down. */
  zoom: number;
  /**
   * Screen boxes a name tag must not cover — the area pills, the finds and
   * the stick, placed first (centre and half-extents, as skyline.tsx
   * `LabelRect`). The tag yields; the walker under it still shows.
   */
  avoid_rect?: readonly { x: number; y: number; half_w: number; half_h: number }[];
  /**
   * Which half to draw. The figures go INSIDE Flora's stacking context (as its
   * children, like the buddy), where each one's `depthZ` sorts it against the
   * trees and finds — drawn in their own layer, a palm in front of a walker
   * could never cover them, nor one behind be covered. The name tags and the
   * live feed stay a layer of their own, over every standee. Omitted, both
   * are drawn here, the old way.
   */
  part?: "figure" | "overlay";
}) {
  const now = useGlideClock(hall.track);
  const { width, height } = projection;
  /* Same source as your own walker, a size down — present, but plainly not you. */
  const size = Math.round(avatarPx(zoom, Math.min(width, height)) * REMOTE_WALKER_SHARE);

  return (
    <>
      {(() => {
        /* Place everybody first, then draw: positions stay true, only the
           drawing is nudged off a spot someone nearer already holds — see
           `walker-spread.ts`. You claim the camera centre, where your own
           walker stands while the camera follows it. */
        const on_glass = [...hall.track.values()]
          .map((one) => {
            const plane = projection.project(positionOf(one, now));
            return { one, at: projection.toScreen(plane), fog: projection.fogOf(plane) };
          })
          /* Past the world's far edge (solid fog, or above the horizon row)
             nobody is drawn: at z22 the far walkers stood in a row on the
             horizon line, floating over the sky. */
          .filter(({ at, fog }) => fog < 0.95 && at.y >= projection.horizon.y)
          .filter(({ at }) => !(at.x < -80 || at.y < -120 || at.x > width + 80 || at.y > height + 120));
        const self = projection.toScreen(projection.project(projection.centre));
        const placed = spreadWalker(
          on_glass.map(({ one, at }) => ({ id: one.pose.walker_id, x: at.x, y: at.y, scale: clampScale(at.scale) })),
          self,
          size * 0.9,
          /* Half your figure plus half theirs, a little apart. */
          (size / REMOTE_WALKER_SHARE + size) * 0.62,
        );
        /* The nearest few stand in 3D like you; the rest keep the sticker, so
           a crowd does not open a WebGL view per walker. */
        const nearest = new Set(
          [...on_glass].sort((a, b) => b.at.y - a.at.y).slice(0, REMOTE_MODEL_MAX).map(({ one }) => one.pose.walker_id),
        );
        const tag_of = (one: Track) => `${one.pose.name} · Lv ${one.pose.level} · ${SOURCE_LABEL[one.pose.source]}`;
        /* The figure's LAYOUT height, pre-scale — what the tag sits on. The
           model is framed in a box 1.3× the size, pulled down 10 % onto the
           anchor (`Walker`); the sticker is the 100×115 frame (`Character`). */
        const figureH = (id: string) => {
          if (!nearest.has(id)) return size * 1.15;
          const px = Math.round(size * 1.3);
          return px - Math.round(px * 0.1);
        };
        /* Your own walker is an obstacle too: a tag drawn across your trainer
           hides the one figure you are steering. Its box is the body plus
           the buddy beside it, at your size (a remote walker is a size down). */
        const own_px = size / REMOTE_WALKER_SHARE;
        const own_box = { id: "self", x: self.x + own_px * 0.25, y: self.y - own_px * 1.3, w: own_px * 1.9, h: own_px * 1.3 };
        const shown_tag = keepTag(
          on_glass.map(({ one, at }) => {
            const scale = clampScale(at.scale);
            const p = placed.get(one.pose.walker_id) ?? at;
            const figure_h = figureH(one.pose.walker_id) * scale;
            return { id: one.pose.walker_id, x: p.x, y: p.y - figure_h - 22 * scale, w: Math.min(tag_of(one).length * 6.4 + 20, width - 12) * scale, h: 20 * scale };
          }),
          own_box,
          avoid_rect.map((r, i) => ({ id: `avoid-${i}`, x: r.x, y: r.y - r.half_h, w: r.half_w * 2, h: r.half_h * 2 })),
        );
        const figure = on_glass.map(({ one, at }) => {
          const p = placed.get(one.pose.walker_id) ?? at;
          /* Same clamp as your own walker, so two phones side by side agree. */
          const scale = clampScale(at.scale);
          const stage = (one.pose.stage as Stage) ?? "egg";
          const is_walking = isGliding(one, now);
          const heading_degree = signedAngle(screenAngleOf(one.heading, bearing_degree));
          return (
            <div
              key={one.pose.walker_id}
              style={{
                position: "absolute",
                left: p.x,
                top: p.y,
                transform: `translate(-50%, -100%) scale(${scale.toFixed(3)})`,
                transformOrigin: "50% 100%",
                pointerEvents: "none",
                /* Inside Flora: painter's order with the trees, by the foot's row. */
                zIndex: part === "figure" ? depthZ(p.y) : 5,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
              }}
            >
              {nearest.has(one.pose.walker_id) ? (
                <Walker stage={stage} size={size} is_walking={is_walking} heading_degree={heading_degree} />
              ) : (
                <Character stage={stage} size={size} is_idle_animated={false} is_walking={is_walking} heading_degree={heading_degree} />
              )}
            </div>
          );
        });

        /* Name tags in their own layer over every standee (5) and your own
           walker, under the hall count (8): drawn inside the walker's column,
           a palm or another walker nearer the camera painted over the name.
           `keepTag` keeps a tag off your trainer, the area pills, the finds and the stick. */
        const name_tag = on_glass.map(({ one, at }) => {
          const id = one.pose.walker_id;
          const p = placed.get(id) ?? at;
          const scale = clampScale(at.scale);
          /* A walker whose middle is off the glass keeps no tag: pulled back
             on screen by `tagShift`, it floated with nobody under it. */
          if (!shown_tag.has(id) || p.x < 0 || p.x > width) return null;
          const fit = tagShift(tag_of(one), p.x, width, scale);
          return (
            <div
              key={`tag-${id}`}
              style={{
                position: "absolute",
                left: p.x,
                top: p.y - figureH(id) * scale,
                transform: `translate(-50%, -100%) scale(${scale.toFixed(3)})`,
                transformOrigin: "50% 100%",
                pointerEvents: "none",
                zIndex: 7,
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
                  maxWidth: fit.max_width,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  transform: fit.shift ? `translateX(${fit.shift.toFixed(1)}px)` : undefined,
                }}
              >
                {one.pose.name} · Lv {one.pose.level}
                <span style={{ fontWeight: 600, color: "rgba(27,46,22,0.6)" }}> · {SOURCE_LABEL[one.pose.source]}</span>
              </div>
            </div>
          );
        });
        return (
          <>
            {part !== "overlay" && figure}
            {part !== "figure" && name_tag}
          </>
        );
      })()}

      {/* The live feed ("Ana logged Molave") reads as a band under the player
          card, stacked, never pinned to the find: a find is usually a few
          metres from the walker, so a callout drawn at it sat across your own
          walker and the pet painted over it. zIndex 9 keeps it over the pet. */}
      {part !== "figure" && hall.callout.length > 0 && (
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
