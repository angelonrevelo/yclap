/**
 * The hall — who else is walking the play map RIGHT NOW, and where.
 *
 * 09-25 note (`0:00`, `4:41`): "a full-on demo on MagiSphere between devices",
 * "working multiplayer". The campus world (`campus-world.ts`) already knew who
 * had synced in the last fifteen minutes; it never knew where anybody stood.
 * This is that missing half, and it is deliberately small:
 *
 * - **What is shared** is a display name, a level, the growth stage the avatar
 *   is drawn from, and a position INSIDE `CAMPUS_BOX` tagged with which of the
 *   three sources made it (`gps` · `demo` · `play`). Nothing else: no photo,
 *   no note, no journal, and not even the `player_id` — the hall keys walkers
 *   by `walkerIdOf`, a one-way hash, because `player_id` is what a walker code
 *   is minted from and handing it to every phone in a room hands out the key.
 * - **A position off campus is refused**, here and on the server. The showcase
 *   hall is off campus, which is exactly why the stick's `play` source exists:
 *   what travels is the campus-frame spot the stick walked to, never the hall.
 * - **Nothing is stored.** Presence lives in memory (socket attachments on the
 *   Durable Object) and is forgotten `STALE_MS` after the last pose.
 *
 * Pure on purpose: the Worker, the LAN server, the client and the tests all
 * import this file, so the rules cannot drift between them.
 */

import { hashOf, type WorldFind } from "./campus-world.ts";
import { distanceMeter, isInsideCampus, type FixSource, type LatLon } from "./geo.ts";

/** A walker not heard from in this long is gone, on the server and on glass. */
export const STALE_MS = 60_000;
/** Never send a pose more often than this. */
export const SEND_MIN_MS = 1_000;
/** Moving at least this far is worth a pose... */
export const SEND_MOVE_M = 3;
/** ...and standing still still says "here" this often, so nobody goes stale. */
export const SEND_HEARTBEAT_MS = 10_000;
/** Longest glide between two poses. A late pose should not crawl. */
export const GLIDE_MAX_MS = 1_500;
/** A jump longer than this is a teleport (a joined walker code), not a walk. */
export const SNAP_M = 150;
/** A find this close to you gets called out on the play view. */
export const NEARBY_FIND_M = 150;
/** How long a find stays called out. */
export const FIND_SHOW_MS = 10_000;
/** The hall holds at most this many walkers (sockets, and polled walkers). */
export const HALL_WALKER_MAX = 200;
/** Poses one socket (or one polled walker) may send per second; clients send ≤ 1. */
export const POSE_PER_SECOND = 2;
/**
 * Poses one IP may send per second across all its sockets. High, because a
 * booth of phones on one wifi is one public IP.
 */
export const POSE_IP_PER_SECOND = 60;
/**
 * Distinct polled walkers one IP may hold in the hall at once. Polling is the
 * fallback when a socket will not open, so a real phone holds one; without
 * this, one script re-posing 200 made-up walker ids keeps every seat taken.
 */
export const POLL_IP_WALKER_MAX = 4;

const STAGE = new Set(["egg", "sprout", "sapling", "tree"]);
const SOURCE = new Set<FixSource>(["gps", "demo", "play"]);

/** One walker as the hall sees them. The whole of what is shared. */
export interface Pose {
  walker_id: string;
  name: string;
  level: number;
  stage: string;
  lat: number;
  lon: number;
  source: FixSource;
  /** Server receive time, ms epoch. */
  at: number;
}

/** What a phone sends. `player_id` is hashed on arrival and never echoed. */
export interface PoseInput {
  player_id: string;
  name: string;
  level: number;
  stage: string;
  lat: number;
  lon: number;
  source: FixSource;
}

export type HallMessage =
  | { type: "roster"; walker: Pose[]; find: WorldFind[]; server_time: number }
  | { type: "pose"; walker: Pose }
  | { type: "gone"; walker_id: string }
  | { type: "find"; find: WorldFind[] };

/** One-way hall key. Same input, same key, on every runtime. */
export function walkerIdOf(player_id: string): string {
  return `w${hashOf(`hall:${player_id}`).toString(36)}${hashOf(`${player_id}:hall`).toString(36)}`;
}

/** Untrusted JSON in, a `Pose` out — or null if it is not one. */
export function sanitizePose(raw: unknown, now: number): Pose | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.player_id !== "string" || !r.player_id.trim()) return null;
  const lat = Number(r.lat);
  const lon = Number(r.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (!isInsideCampus({ lat, lon })) return null;
  const level = Number(r.level);
  const source = SOURCE.has(r.source as FixSource) ? (r.source as FixSource) : "play";
  return {
    walker_id: walkerIdOf(r.player_id.trim().slice(0, 64)),
    name: String(r.name ?? "Walker").trim().slice(0, 40) || "Walker",
    level: Number.isFinite(level) ? Math.max(1, Math.min(999, Math.trunc(level))) : 1,
    stage: STAGE.has(String(r.stage)) ? String(r.stage) : "egg",
    lat,
    lon,
    source,
    at: now,
  };
}

/** Everyone heard from inside the window, newest first, one row per walker. */
export function rosterOf(row: Iterable<Pose | null | undefined>, now: number, stale_ms = STALE_MS): Pose[] {
  const by_id = new Map<string, Pose>();
  for (const one of row) {
    if (!one || now - one.at > stale_ms) continue;
    const prev = by_id.get(one.walker_id);
    if (!prev || prev.at < one.at) by_id.set(one.walker_id, one);
  }
  return [...by_id.values()].sort((a, b) => b.at - a.at);
}

/** The finds in `row` the store has never seen — call BEFORE merging them. */
export function freshFindOf(
  known_id: Set<string>,
  row: { sighting_id: string; species_code: string; common_name: string; lat: number | null; lon: number | null; entry_kind: string; created_at: string }[],
  player: { player_id: string; name: string },
): WorldFind[] {
  return row
    .filter((s) => !known_id.has(s.sighting_id) && s.lat !== null && s.lon !== null)
    .map((s) => ({
      sighting_id: s.sighting_id,
      /* Same rule as poses: the hall never learns a player_id. */
      player_id: walkerIdOf(player.player_id),
      player_name: player.name,
      species_code: s.species_code,
      common_name: s.common_name,
      lat: s.lat,
      lon: s.lon,
      entry_kind: s.entry_kind,
      created_at: s.created_at,
    }));
}

/* ── sending ────────────────────────────────────────────────────────────── */

export interface SentPose {
  lat: number;
  lon: number;
  level: number;
  stage: string;
  name: string;
  at: number;
}

/**
 * The throttle. At most one pose a second; one whenever the walker moved
 * `SEND_MOVE_M` or changed what they look like; otherwise a heartbeat.
 */
export function shouldSend(last: SentPose | null, next: Omit<SentPose, "at">, now: number): boolean {
  if (!last) return true;
  const since = now - last.at;
  if (since < SEND_MIN_MS) return false;
  if (since >= SEND_HEARTBEAT_MS) return true;
  if (last.level !== next.level || last.stage !== next.stage || last.name !== next.name) return true;
  return distanceMeter(last, next) >= SEND_MOVE_M;
}

/* ── receiving: a remote walker on glass ────────────────────────────────── */

/**
 * One remote walker as this phone draws them.
 *
 * Poses arrive about once a second, so drawing each one where it lands is a
 * walker that teleports a few metres at a time. Instead each new pose starts a
 * glide FROM WHERE THE WALKER IS CURRENTLY DRAWN to the new spot, lasting as
 * long as the gap between the two poses was. A pose that arrives mid-glide
 * therefore bends the path rather than snapping it.
 */
export interface Track {
  pose: Pose;
  from: LatLon;
  to: LatLon;
  /** Local ms when the glide began. */
  start: number;
  duration: number;
  /** Local ms of the last pose, for staleness. Server clocks are not ours. */
  heard: number;
  /** Compass degrees of the last real move. */
  heading: number;
}

function ease(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t * (2 - t);
}

export function positionOf(track: Track, now: number): LatLon {
  const t = track.duration <= 0 ? 1 : ease((now - track.start) / track.duration);
  return {
    lat: track.from.lat + (track.to.lat - track.from.lat) * t,
    lon: track.from.lon + (track.to.lon - track.from.lon) * t,
  };
}

export function isGliding(track: Track, now: number): boolean {
  return now - track.start < track.duration;
}

function headingOf(a: LatLon, b: LatLon): number {
  const dy = b.lat - a.lat;
  const dx = (b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180);
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

export function receivePose(prev: Track | undefined, pose: Pose, now: number): Track {
  const to = { lat: pose.lat, lon: pose.lon };
  if (!prev) return { pose, from: to, to, start: now, duration: 0, heard: now, heading: 0 };
  const from = positionOf(prev, now);
  const gap = distanceMeter(from, to);
  const is_snap = gap > SNAP_M;
  return {
    pose,
    from: is_snap ? to : from,
    to,
    start: now,
    duration: is_snap ? 0 : Math.max(200, Math.min(GLIDE_MAX_MS, now - prev.heard)),
    heard: now,
    heading: gap > 0.3 && !is_snap ? headingOf(from, to) : prev.heading,
  };
}

/** Drop every walker unheard for `STALE_MS`. Returns the same map if nothing went. */
export function pruneTrack(track: Map<string, Track>, now: number, stale_ms = STALE_MS): Map<string, Track> {
  let is_changed = false;
  const next = new Map<string, Track>();
  for (const [id, one] of track) {
    if (now - one.heard > stale_ms) is_changed = true;
    else next.set(id, one);
  }
  return is_changed ? next : track;
}

/** Is a find worth calling out: somebody else's, recent, and near you. */
export function isNearbyFind(
  find: { player_id: string; lat: number | null; lon: number | null },
  me: { walker_id: string; at: LatLon | null },
  radius_m = NEARBY_FIND_M,
): boolean {
  if (find.player_id === me.walker_id || find.lat === null || find.lon === null || !me.at) return false;
  return distanceMeter(me.at, { lat: find.lat, lon: find.lon }) <= radius_m;
}

/* ── who is out, said once ─────────────────────────────────────────────── */

/**
 * How many walkers are out RIGHT NOW, you included — the one number every
 * surface prints (the map pill, the trainer sheet, the Dex strip).
 *
 * It is read off the hall's tracks, which `pruneTrack` keeps to walkers heard
 * in the last `STALE_MS`, plus you once your own pose has gone out. It is NOT
 * the synced world's `walker` list: that one remembers anybody who synced in
 * the last fifteen minutes, which is how one phone used to show three counts.
 */
export function walkerOutCount(other_count: number, is_sharing: boolean): number {
  return Math.max(0, other_count) + (is_sharing ? 1 : 0);
}

/** "N walkers out" — counting you, and saying so. Null when never measured. */
export function walkerOutLabel(count: number | null, is_sharing: boolean): string | null {
  if (count === null) return null;
  if (count <= 0) return "No walkers out";
  if (count === 1 && is_sharing) return "Just you out";
  return `${count} walker${count === 1 ? "" : "s"} out${is_sharing ? ", incl. you" : ""}`;
}

/**
 * The name the hall shows for this phone. A signed-in account's display name
 * wins, then the name typed in Settings, then the generated walker name —
 * signing in as "Hall One" must not leave the room seeing "Molave Walker 8".
 */
export function liveNameOf(input: {
  account_name?: string | null;
  preference_name?: string | null;
  player_name: string;
}): string {
  for (const one of [input.account_name, input.preference_name, input.player_name]) {
    const name = (one ?? "").trim().slice(0, 40);
    if (name) return name;
  }
  return "Walker";
}

export const SOURCE_LABEL: Record<FixSource, string> = {
  gps: "GPS",
  demo: "demo walk",
  play: "stick walk",
};

/* ── the hall on this phone ─────────────────────────────────────────────── */

/**
 * Fold one hall message into the tracks this phone draws. `me` is skipped —
 * your own walker is the one drawn from your own fix, never from an echo.
 * A roster is authoritative: anybody missing from it is gone.
 */
export function applyHall(track: Map<string, Track>, message: HallMessage, me: string, now: number): Map<string, Track> {
  if (message.type === "find") return track;
  const next = new Map(track);
  if (message.type === "gone") {
    next.delete(message.walker_id);
    return next;
  }
  const incoming = message.type === "roster" ? message.walker : [message.walker];
  if (message.type === "roster") {
    const keep = new Set(incoming.map((p) => p.walker_id));
    for (const id of next.keys()) if (!keep.has(id)) next.delete(id);
  }
  for (const pose of incoming) {
    if (pose.walker_id === me) continue;
    const prev = next.get(pose.walker_id);
    /* A polled roster repeats the same pose every tick; re-receiving it would
       restart a finished glide and reset its staleness clock. */
    if (prev && prev.pose.at === pose.at) continue;
    next.set(pose.walker_id, receivePose(prev, pose, now));
  }
  return next;
}

/**
 * Close a hall socket without the browser's "closed before the connection is
 * established" warning: one still CONNECTING is closed the moment it opens
 * instead, and its handlers are dropped so it cannot report back.
 */
export function closeQuietly(socket: WebSocket, is_open: boolean): void {
  socket.onmessage = null;
  socket.onclose = null;
  try {
    if (socket.readyState === 0) {
      socket.onopen = () => socket.close();
      socket.onerror = null;
      return;
    }
    socket.onopen = null;
    if (is_open) socket.send(JSON.stringify({ type: "bye" }));
    socket.close();
  } catch {
    /* already gone */
  }
}

export type HallMode = "connecting" | "socket" | "poll" | "off";

export interface HallLink {
  sendPose(pose: PoseInput): void;
  close(): void;
}

/**
 * Talk to the hall: a WebSocket when the host upgrades one, polling the same
 * contract over HTTP when it does not (a proxy that strips upgrades, a flaky
 * hall wifi). The socket is retried in the background with a backoff, so a
 * phone that fell back does not stay on polling for the rest of the demo.
 */
export function openHall(
  base_url: string,
  onMessage: (message: HallMessage) => void,
  onMode: (mode: HallMode) => void,
  io: {
    WebSocket?: typeof WebSocket;
    fetch?: typeof fetch;
    poll_ms?: number;
  } = {},
): HallLink {
  const Socket = io.WebSocket ?? (typeof WebSocket !== "undefined" ? WebSocket : undefined);
  const fetch_impl = io.fetch ?? globalThis.fetch;
  const poll_ms = io.poll_ms ?? 2_000;
  let ws: WebSocket | null = null;
  let is_socket_open = false;
  let is_closed = false;
  let is_polling = false;
  let poll_timer: ReturnType<typeof setInterval> | null = null;
  let retry_timer: ReturnType<typeof setTimeout> | null = null;
  let retry = 0;
  let last_pose: PoseInput | null = null;
  let is_pose_pending = false;
  let is_poll_ok = false;

  const deliver = (raw: unknown) => {
    if (!raw || typeof raw !== "object" || typeof (raw as { type?: unknown }).type !== "string") return;
    onMessage(raw as HallMessage);
  };

  const pollOnce = async () => {
    if (is_closed || is_socket_open) return;
    try {
      const pose = is_pose_pending ? last_pose : null;
      is_pose_pending = false;
      const res = pose
        ? await fetch_impl(`${base_url}/live/pose`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(pose),
          })
        : await fetch_impl(`${base_url}/live/walker`);
      if (!res.ok) throw new Error(String(res.status));
      const body = (await res.json()) as unknown;
      if (is_closed || is_socket_open) return;
      if (!is_poll_ok) {
        is_poll_ok = true;
        onMode("poll");
      }
      deliver(body);
    } catch {
      if (is_poll_ok || !is_socket_open) onMode("off");
      is_poll_ok = false;
    }
  };

  const startPoll = () => {
    if (is_polling || is_closed) return;
    is_polling = true;
    void pollOnce();
    poll_timer = setInterval(() => void pollOnce(), poll_ms);
  };

  const stopPoll = () => {
    is_polling = false;
    is_poll_ok = false;
    if (poll_timer) clearInterval(poll_timer);
    poll_timer = null;
  };

  const connect = () => {
    if (is_closed) return;
    if (!Socket) {
      startPoll();
      return;
    }
    let socket: WebSocket;
    try {
      socket = new Socket(`${base_url.replace(/^http/, "ws")}/live/socket`);
    } catch {
      startPoll();
      return;
    }
    ws = socket;
    /* Do not sit on a blank hall while a socket makes up its mind. */
    const fallback = setTimeout(startPoll, 4_000);
    socket.onopen = () => {
      clearTimeout(fallback);
      is_socket_open = true;
      retry = 0;
      stopPoll();
      onMode("socket");
      if (last_pose) socket.send(JSON.stringify({ type: "pose", ...last_pose }));
    };
    socket.onmessage = (ev) => {
      try {
        deliver(JSON.parse(String(ev.data)));
      } catch {
        /* a torn frame */
      }
    };
    socket.onclose = () => {
      clearTimeout(fallback);
      const was_open = is_socket_open;
      is_socket_open = false;
      if (ws === socket) ws = null;
      if (is_closed) return;
      if (was_open) onMode("connecting");
      startPoll();
      retry += 1;
      retry_timer = setTimeout(connect, Math.min(30_000, 2_000 * 2 ** Math.min(retry, 4)));
    };
  };

  onMode("connecting");
  /* Deferred a tick: React StrictMode mounts, unmounts and remounts an effect
     synchronously, and a socket created on the first mount would be closed
     while still CONNECTING — which is what logged "WebSocket is closed before
     the connection is established" on every page load. */
  retry_timer = setTimeout(connect, 0);

  return {
    sendPose(pose) {
      last_pose = pose;
      if (is_socket_open && ws) {
        try {
          ws.send(JSON.stringify({ type: "pose", ...pose }));
        } catch {
          /* onclose will fall back */
        }
      } else if (is_polling) {
        is_pose_pending = true;
        void pollOnce();
      }
    },
    close() {
      is_closed = true;
      stopPoll();
      if (retry_timer) clearTimeout(retry_timer);
      const socket = ws;
      ws = null;
      if (socket) closeQuietly(socket, is_socket_open);
    },
  };
}
