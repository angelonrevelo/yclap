import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { WorldFind } from "./campus-world";
import Character, { type Stage } from "./character";
import { avatarPx, REMOTE_WALKER_SHARE } from "./camera-feel";
import { isInsideCampus, type Fix } from "./geo";
import {
  applyHall,
  FIND_SHOW_MS,
  headingAt,
  INTERP_DELAY_MS,
  INTERP_DELAY_POLL_MS,
  isGliding,
  isMoving,
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
  type HallNotice,
  type SentPose,
  type Track,
} from "./multiplayer";
import { muteWalker } from "./mute";
import { noteReportContext } from "./report";
import { fileReport, RESULT_LINE, useMuted } from "./report-sheet";
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
  /** What the hall told THIS phone about itself (a refused name, a moderator's hide), or null. */
  notice: HallNotice | null;
  dismissNotice: () => void;
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
  const [notice, setNotice] = useState<HallNotice | null>(null);
  const latest = useRef(input);
  useEffect(() => {
    latest.current = input;
  });
  /* What a report attaches: the hall's mode and which source drives the walker. */
  useEffect(() => {
    noteReportContext({ hall_mode: mode });
  }, [mode]);
  useEffect(() => {
    noteReportContext({
      geo_source: input.fix?.source ?? "none",
      fix: input.fix ? { lat: input.fix.lat, lon: input.fix.lon } : null,
    });
  }, [input.fix]);

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
        if (message.type === "notice") {
          /* The same notice again (a poll repeats it) keeps the one on screen. */
          setNotice((prev) => (prev?.text === message.notice.text ? prev : message.notice));
          return;
        }
        if (message.type === "roster" && message.notice) {
          const { notice: said } = message;
          setNotice((prev) => (prev?.text === said.text ? prev : said));
        }
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
      if (!shouldSend(last, { ...next, source: fix.source }, now)) return;
      last = { ...next, at: now };
      /* `sent` is this phone's clock: receivers pace the walk on it, so the
         network's jitter does not become the walker's. */
      link.sendPose({ player_id: me.player_id, source: fix.source, sent: now, ...next });
      setSharing(true);
    };
    send();
    /* Checked four times a second, sent at most once: a timer AT the throttle
       fires a hair early half the time, and `shouldSend` then waits a whole
       second more — a 2 s cadence nobody asked for. */
    const send_timer = setInterval(send, SEND_MIN_MS / 4);
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

  return { track, callout, mode, is_sharing, notice, dismissNotice: () => setNotice(null) };
}

/**
 * How far in the past remote walkers are drawn. Polling delivers a roster every
 * 2 s, so it needs the longer buffer or the walker would stand and wait at each.
 */
export function interpDelayOf(mode: HallMode): number {
  return mode === "poll" ? INTERP_DELAY_POLL_MS : INTERP_DELAY_MS;
}

/**
 * Re-render every frame while anyone has buffered walk left to draw, and not at
 * all otherwise. It only SCHEDULES renders; it deliberately returns no clock.
 *
 * It used to return its own `now`, and the layer drew each walker at
 * `positionOf(now)` through `projection`. But the projection is re-rendered by
 * the camera's frame loop and `now` by this one, in separate renders: while
 * your own camera moved, frames alternated between a fresh clock with last
 * frame's camera and last frame's clock with a fresh camera, and a walker
 * beside you zig-zagged ±2 px on every frame (`script/bench-hall.mjs`, scenario
 * "both": 57 reversals in 122 frames). The layer now draws at the camera's
 * own frame time (`Projection.frame_ms`), so every position is paired with the
 * camera it is drawn through.
 */
function useGlideClock(track: Map<string, Track>, delay_ms: number): void {
  const [, setFrame] = useState(0);
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      setFrame((n) => n + 1);
      if ([...track.values()].some((one) => isGliding(one, Date.now(), delay_ms))) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [track, delay_ms]);
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
  const delay_ms = interpDelayOf(hall.mode);
  useGlideClock(hall.track, delay_ms);
  /* The camera's own moment while it moves, so a walker and the ground it is
     drawn over agree to the frame; the wall clock when the camera is at rest. */
  const now = projection.frame_ms ?? Date.now();
  const muted = useMuted();
  /* The walker whose name tag was tapped: Hide / Report name / Cancel. */
  const [picked, setPicked] = useState<{ walker_id: string; name: string } | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const { width, height } = projection;
  /* Same source as your own walker, a size down — present, but plainly not you. */
  const size = Math.round(avatarPx(zoom, Math.min(width, height)) * REMOTE_WALKER_SHARE);
  /* A walker you hid is gone from your map and your feed — and nowhere else. */
  const callout = hall.callout.filter(({ find }) => !muted.has(find.walker_id));

  useEffect(() => {
    if (!said) return;
    const timer = setTimeout(() => setSaid(null), 4_000);
    return () => clearTimeout(timer);
  }, [said]);

  return (
    <>
      {[...hall.track.values()].filter((one) => !muted.has(one.pose.walker_id)).map((one) => {
        const at = projection.toScreen(projection.project(positionOf(one, now, delay_ms)));
        if (at.x < -80 || at.y < -120 || at.x > width + 80 || at.y > height + 120) return null;
        /* Same clamp as your own walker, so two phones side by side agree. */
        const scale = Math.max(0.6, Math.min(1.35, at.scale));
        return (
          <div
            key={one.pose.walker_id}
            /* `script/bench-hall.mjs` reads where each remote walker is drawn, frame by frame. */
            data-remote-walker={one.pose.walker_id}
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
            {/* The name tag is the one tappable part of a remote walker: it
                opens Hide / Report name. `data-play-marker` keeps the tap
                from also walking you there (tile-map.tsx). */}
            <button
              type="button"
              data-play-marker="1"
              aria-label={`${one.pose.name} — hide or report this name`}
              onClick={(e) => {
                e.stopPropagation();
                setPicked({ walker_id: one.pose.walker_id, name: one.pose.name });
              }}
              style={{
                pointerEvents: "auto",
                cursor: "pointer",
                font: "inherit",
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
              }}
            >
              {one.pose.name} · Lv {one.pose.level}
              <span style={{ fontWeight: 600, color: "rgba(27,46,22,0.6)" }}> · {SOURCE_LABEL[one.pose.source]}</span>
            </button>
            <Character
              stage={(one.pose.stage as Stage) ?? "egg"}
              size={size}
              is_idle_animated={false}
              is_walking={isMoving(one, now, delay_ms)}
              heading_degree={signedAngle(screenAngleOf(headingAt(one, now, delay_ms), bearing_degree))}
            />
          </div>
        );
      })}

      {/* The live feed ("Ana logged Molave") reads as a band under the player
          card, stacked, never pinned to the find: a find is usually a few
          metres from the walker, so a callout drawn at it sat across your own
          walker and the pet painted over it. zIndex 9 keeps it over the pet. */}
      {picked && (
        <WalkerMenu
          name={picked.name}
          onHide={() => {
            muteWalker(picked.walker_id);
            setSaid(`${picked.name} is hidden on this phone. Settings → Setup shows them again.`);
            setPicked(null);
          }}
          onReport={() => {
            const target = picked;
            setPicked(null);
            void fileReport({
              category: "name",
              severity: "major",
              text: "",
              is_location_shared: false,
              walker_id: target.walker_id,
              walker_name: target.name,
            }).then((result) => setSaid(result === "refused" ? RESULT_LINE.refused : `Name reported. ${RESULT_LINE[result]}`));
          }}
          onClose={() => setPicked(null)}
        />
      )}

      {(said || hall.notice) && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: "calc(env(safe-area-inset-bottom, 0px) + 150px)",
            zIndex: 12,
            display: "flex",
            alignItems: "flex-start",
            gap: 8,
            fontSize: 12.5,
            fontWeight: 700,
            lineHeight: 1.4,
            color: "#1B2E16",
            background: hall.notice && !said ? "rgba(255,240,214,0.98)" : "rgba(255,255,255,0.97)",
            border: `1.5px solid ${hall.notice && !said ? "#E0A526" : "#7FB3E0"}`,
            borderRadius: 14,
            padding: "8px 10px",
            boxShadow: "0 4px 14px rgba(24,38,20,0.25)",
          }}
        >
          <span style={{ flex: 1 }}>{said ?? hall.notice?.text}</span>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => (said ? setSaid(null) : hall.dismissNotice())}
            style={{ border: "none", background: "transparent", fontSize: 16, lineHeight: 1, cursor: "pointer" }}
          >
            ×
          </button>
        </div>
      )}

      {callout.length > 0 && (
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
          {callout.slice(0, 3).map(({ find }) => (
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

/** Tapped a name tag: hide them here, or send their name to a moderator. */
function WalkerMenu({
  name,
  onHide,
  onReport,
  onClose,
}: {
  name: string;
  onHide: () => void;
  onReport: () => void;
  onClose: () => void;
}) {
  const row: CSSProperties = {
    display: "block",
    width: "100%",
    textAlign: "left",
    padding: "11px 12px",
    border: "none",
    borderTop: "1px solid rgba(27,46,22,0.1)",
    background: "transparent",
    font: "inherit",
    fontSize: 14,
    fontWeight: 800,
    color: "#1B2E16",
    cursor: "pointer",
  };
  return (
    <div data-play-marker="1" style={{ position: "absolute", inset: 0, zIndex: 30, pointerEvents: "auto" }} onClick={onClose}>
      <div
        role="dialog"
        aria-label={`${name}`}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          left: "50%",
          top: "40%",
          transform: "translate(-50%, -50%)",
          width: "min(300px, calc(100% - 40px))",
          background: "#fff",
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 10px 30px rgba(24,38,20,0.35)",
        }}
      >
        <div style={{ padding: "12px 12px 10px", fontSize: 13, fontWeight: 900, color: "#1B2E16", wordBreak: "break-word" }}>
          {name}
          <div style={{ fontSize: 11.5, fontWeight: 600, color: "rgba(27,46,22,0.6)", marginTop: 2 }}>
            Only their display name is shared with you — nothing else.
          </div>
        </div>
        <button type="button" style={row} onClick={onHide}>
          Hide this walker
          <div style={{ fontSize: 11.5, fontWeight: 600, color: "rgba(27,46,22,0.6)" }}>Only on this phone. They are not told.</div>
        </button>
        <button type="button" style={row} onClick={onReport}>
          Report name
          <div style={{ fontSize: 11.5, fontWeight: 600, color: "rgba(27,46,22,0.6)" }}>
            Sends a moderator the name you see. Not who you are.
          </div>
        </button>
        <button type="button" style={{ ...row, fontWeight: 600, color: "rgba(27,46,22,0.7)" }} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
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
