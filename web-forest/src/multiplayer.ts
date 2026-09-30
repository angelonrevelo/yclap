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

import { isLocationWithheld, walkerIdOf, type WorldFind } from "./campus-world.ts";
import { distanceMeter, isInsideCampus, type FixSource, type LatLon } from "./geo.ts";
import { nameNoticeOf, safeNameOf, type NameRefusal } from "./name-filter.ts";

/** A walker not heard from in this long is gone, on the server and on glass. */
export const STALE_MS = 60_000;
/** Never send a pose more often than this. */
export const SEND_MIN_MS = 1_000;
/** Moving at least this far on GPS is worth a pose — less is fix noise... */
export const SEND_MOVE_M = 3;
/** ...while a stick or demo walk has no noise, so any real step is. */
export const SEND_MOVE_PLAY_M = 0.25;
/** ...and standing still still says "here" this often, so nobody goes stale. */
export const SEND_HEARTBEAT_MS = 10_000;
/**
 * How far behind real time a remote walker is drawn, over a socket. It has to
 * cover one send interval (1–1.25 s: the send check runs every 250 ms against a
 * 1 s throttle) PLUS the worst arrival jitter a shared hall wifi adds (~400 ms),
 * so there is a real pose on each side of the moment being drawn. 1,250 ms was
 * measured short: a pose 400 ms late left a 150 ms stall every few seconds
 * (`multiplayer.test.ts`, "09-30 jitter"). 1.7 s behind is ~2 m at walking pace.
 */
export const INTERP_DELAY_MS = 1_700;
/** The same, when polling: a phone posts and reads the roster only every 2 s. */
export const INTERP_DELAY_POLL_MS = 3_600;
/**
 * A gap between two poses longer than this was the walker standing still, not
 * walking slowly: the move is drawn over the last `STEP_MS` of it. Above the
 * 2 s poll cadence, or a polled walk would read as a string of pauses.
 */
export const SEGMENT_MAX_MS = 2_600;
/** How long the step after a pause takes to draw. */
export const STEP_MS = 2_000;
/** Poses kept per walker. Ten seconds at one a second, with room to spare. */
export const SAMPLE_MAX = 12;
/** A sender clock that jumps by more than this against ours restarts the timeline. */
export const CLOCK_JUMP_MS = 10_000;
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
 * Per-IP seat caps. Without them one script (no Origin, so the page check lets
 * it in) opens 200 sockets or re-poses 200 made-up walker ids and keeps every
 * seat taken. The right cap depends on what one IP MEANS:
 *
 * - On the LAN box (server/hall.mjs) every phone on the wifi has its own
 *   address, and a real phone holds one seat — four is already generous.
 * - On Cloudflare (worker/live-socket.ts) CF-Connecting-IP is the PUBLIC
 *   address, and a booth of phones behind one venue wifi / NAT shares it. A
 *   cap of four there would seat four visitors and turn the fifth away, so the
 *   edge caps are sized for a busy booth (40) — still well short of the 200
 *   seats, so one address cannot fill the hall.
 */
/** Distinct polled walkers one IP may hold at once on the LAN box. */
export const POLL_IP_WALKER_MAX = 4;
/** Open hall sockets one IP may hold at once on the LAN box. */
export const LAN_IP_SOCKET_MAX = 4;
/** Distinct polled walkers one (shared, public) IP may hold on the Worker. */
export const EDGE_POLL_IP_WALKER_MAX = 40;
/** Open hall sockets one (shared, public) IP may hold on the Worker. */
export const EDGE_IP_SOCKET_MAX = 40;

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
  /**
   * The SENDER's clock when the pose left, ms. Receivers pace the walk on this
   * rather than on arrival, because arrival carries the network's jitter and
   * the sender's clock does not. Only ever compared with other poses from the
   * same sender, so a phone whose clock is wrong is still drawn right. Absent
   * from a build before 09-30; `at` stands in.
   */
  sent?: number;
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
  sent?: number;
}

/**
 * Something the hall tells ONE phone about itself: its display name was not
 * printed (and what the room sees instead), or a moderator has hidden it from
 * the hall until `until`. Never broadcast — nobody else learns either.
 */
export interface HallNotice {
  kind: "name_refused" | "hidden";
  text: string;
  /** The name the room sees instead, for `name_refused`. */
  name?: string;
  /** ms epoch the hide lifts, for `hidden`. */
  until?: number;
}

export type HallMessage =
  | { type: "roster"; walker: Pose[]; find: WorldFind[]; server_time: number; notice?: HallNotice }
  | { type: "pose"; walker: Pose }
  | { type: "gone"; walker_id: string }
  | { type: "find"; find: WorldFind[] }
  | { type: "notice"; notice: HallNotice };

/**
 * What a moderator has taken out of the hall (`worker/moderation.ts`), asked
 * on every pose and every roster. Both halls (the Durable Object and the LAN
 * box) take one, so a hide holds on whichever server the phones are on.
 */
export interface HallGuard {
  /** When the hide on this walker lifts (ms epoch), or null. */
  hiddenUntil(walker_id: string, now: number): number | null;
  isFindHidden(sighting_id: string): boolean;
}

/** A find the hall may still call out: not hidden, and not by a hidden walker. */
export function isFindShown(find: WorldFind, guard: HallGuard | null | undefined, now: number): boolean {
  if (!guard) return true;
  return !guard.isFindHidden(find.sighting_id) && guard.hiddenUntil(find.walker_id, now) === null;
}

/** One-way hall key — defined beside the world payload that also needs it. */
export { walkerIdOf };

/**
 * Untrusted JSON in, a `Pose` out — or null if it is not one — and whether the
 * name it came with was refused. The name filter (`name-filter.ts`) runs HERE,
 * on the server, so a phone cannot print what it likes over its own head by
 * skipping a client check: a refused name becomes the generated walker name
 * for the same player_id, i.e. the name that phone was minted with.
 */
export function sanitizePoseVerdict(raw: unknown, now: number): { pose: Pose; refusal: NameRefusal | null } | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.player_id !== "string" || !r.player_id.trim()) return null;
  const lat = Number(r.lat);
  const lon = Number(r.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (!isInsideCampus({ lat, lon })) return null;
  const level = Number(r.level);
  const source = SOURCE.has(r.source as FixSource) ? (r.source as FixSource) : "play";
  const sent = Number(r.sent);
  const player_id = r.player_id.trim().slice(0, 64);
  const { name, refusal } = safeNameOf(r.name ?? "Walker", player_id);
  return {
    pose: {
      ...(Number.isFinite(sent) && sent > 0 ? { sent: Math.trunc(sent) } : {}),
      walker_id: walkerIdOf(player_id),
      name,
      level: Number.isFinite(level) ? Math.max(1, Math.min(999, Math.trunc(level))) : 1,
      stage: STAGE.has(String(r.stage)) ? String(r.stage) : "egg",
      lat,
      lon,
      source,
      at: now,
    },
    refusal,
  };
}

/** Untrusted JSON in, a `Pose` out — or null if it is not one. Names filtered. */
export function sanitizePose(raw: unknown, now: number): Pose | null {
  return sanitizePoseVerdict(raw, now)?.pose ?? null;
}

/** The notice for a refused name, or null when the name stood. */
export function nameNoticeOfPose(pose: Pose, refusal: NameRefusal | null): HallNotice | null {
  return refusal ? { kind: "name_refused", text: nameNoticeOf(refusal, pose.name), name: pose.name } : null;
}

/** The notice for a walker a moderator has hidden from the hall. */
export function hiddenNoticeOf(until: number): HallNotice {
  /* Manila is UTC+8 all year (no DST), and a Worker has no local zone to ask. */
  const at = new Date(until);
  const hh = String((at.getUTCHours() + 8) % 24).padStart(2, "0");
  const mm = String(at.getUTCMinutes()).padStart(2, "0");
  return {
    kind: "hidden",
    text: `A moderator has hidden you from the live hall until ${hh}:${mm} (Manila). You can still play; other walkers just won't see you.`,
    until,
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
  player: { player_id: string; name: string; is_hidden?: boolean },
): WorldFind[] {
  /* A walker hidden from the live map is not named near anybody either. */
  if (player.is_hidden) return [];
  return row
    /* A threatened species is never called out: "near you" IS its location. */
    .filter((s) => !known_id.has(s.sighting_id) && s.lat !== null && s.lon !== null && !isLocationWithheld(s.species_code))
    .map((s) => ({
      sighting_id: s.sighting_id,
      /* Same rule as poses: the hall never learns a player_id. */
      walker_id: walkerIdOf(player.player_id),
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
 * The throttle. At most one pose a second; one whenever the walker moved far
 * enough to be a move, or changed what they look like; otherwise a heartbeat.
 *
 * "Far enough" depends on the source. A GPS fix wanders a few metres standing
 * still, so under `SEND_MOVE_M` it is noise and sending it makes the walker
 * shuffle on every other phone. A stick or demo walk has no noise, and at
 * walking pace a 3 m threshold sent a pose every ~2.3 s — a stop-go cadence the
 * receiver could only draw as a walker that stops and starts (09-30 note,
 * `0:56`). Those send every second they move.
 */
export function shouldSend(
  last: SentPose | null,
  next: Omit<SentPose, "at"> & { source?: FixSource },
  now: number,
): boolean {
  if (!last) return true;
  const since = now - last.at;
  if (since < SEND_MIN_MS) return false;
  if (since >= SEND_HEARTBEAT_MS) return true;
  if (last.level !== next.level || last.stage !== next.stage || last.name !== next.name) return true;
  const threshold = next.source === "gps" || next.source === undefined ? SEND_MOVE_M : SEND_MOVE_PLAY_M;
  return distanceMeter(last, next) >= threshold;
}

/* ── receiving: a remote walker on glass ────────────────────────────────── */

/**
 * One remote walker as this phone draws them — buffered snapshot
 * interpolation, the way every networked game draws somebody else.
 *
 * The 09-26 build glided from where a walker was drawn to each new pose with
 * an ease-out, for as long as the gap since the last ARRIVAL. The 09-30 note
 * (`0:56`–`1:21`) is what that looked like: fine standing still, and a walker
 * that "moves weirdly across the screen" the moment anybody walked or turned.
 * Three things did it, all fixed here:
 *
 * - The ease-out started every pose at twice walking speed and braked to a
 *   stop, once a second — a 1 Hz surge that the smooth follow camera made
 *   plain. The walk between two poses is now linear: constant speed.
 * - Each glide lasted as long as the network took to deliver the pose, so
 *   network jitter became speed jitter. Poses are now placed on the SENDER's
 *   clock (`Pose.sent`), shifted onto ours by the smallest offset seen, and the
 *   walker is drawn `INTERP_DELAY_MS` (1.7 s) in the past, where there is almost always
 *   a real pose on each side of the moment being drawn.
 * - A pose that came late ran out of glide and the walker stood still until the
 *   next. With the delay, a late pose is usually still in the future when it
 *   lands; a lost one holds the walker at the last spot, never guesses ahead
 *   and snaps back.
 */
export interface Track {
  pose: Pose;
  /** Poses on OUR clock, oldest first. */
  sample: TrackSample[];
  /** Our ms minus the sender's, the smallest seen: the fastest delivery. */
  offset: number;
  /** Local ms of the last pose, for staleness. Server clocks are not ours. */
  heard: number;
  /** Compass degrees of the last real move. */
  heading: number;
}

export interface TrackSample {
  /** Local-clock ms this spot was true on the sender. */
  t: number;
  lat: number;
  lon: number;
  /** Compass degrees of the move that ended here, or the one before it. */
  heading: number;
}

/** Below this a move is standing still, for heading and for the walk cycle. */
const STILL_M = 0.3;

function headingOf(a: LatLon, b: LatLon): number {
  const dy = b.lat - a.lat;
  const dx = (b.lon - a.lon) * Math.cos((a.lat * Math.PI) / 180);
  return (Math.atan2(dx, dy) * 180) / Math.PI;
}

/** The segment the drawn moment sits in: `[i, i + 1]`, or null past either end. */
function segmentAt(sample: TrackSample[], t: number): number | null {
  for (let i = sample.length - 2; i >= 0; i -= 1) {
    if (sample[i].t <= t && t < sample[i + 1].t) return i;
  }
  return null;
}

export function positionOf(track: Track, now: number, delay_ms = INTERP_DELAY_MS): LatLon {
  const { sample } = track;
  const t = now - delay_ms;
  const first = sample[0];
  const last = sample[sample.length - 1];
  if (t <= first.t) return { lat: first.lat, lon: first.lon };
  if (t >= last.t) return { lat: last.lat, lon: last.lon };
  const i = segmentAt(sample, t);
  if (i === null) return { lat: last.lat, lon: last.lon };
  const a = sample[i];
  const b = sample[i + 1];
  const k = (t - a.t) / (b.t - a.t);
  return { lat: a.lat + (b.lat - a.lat) * k, lon: a.lon + (b.lon - a.lon) * k };
}

/** Still something left to draw — the frame clock keeps running while this is true. */
export function isGliding(track: Track, now: number, delay_ms = INTERP_DELAY_MS): boolean {
  return now - delay_ms < track.sample[track.sample.length - 1].t;
}

/** Actually walking at the drawn moment — the walk cycle plays only then. */
export function isMoving(track: Track, now: number, delay_ms = INTERP_DELAY_MS): boolean {
  const i = segmentAt(track.sample, now - delay_ms);
  if (i === null) return false;
  return distanceMeter(track.sample[i], track.sample[i + 1]) > STILL_M;
}

/** Which way the walker faces at the drawn moment. */
export function headingAt(track: Track, now: number, delay_ms = INTERP_DELAY_MS): number {
  const i = segmentAt(track.sample, now - delay_ms);
  return i === null ? track.heading : track.sample[i + 1].heading;
}

function freshTrack(pose: Pose, now: number, offset: number, heading: number): Track {
  return {
    pose,
    sample: [{ t: now, lat: pose.lat, lon: pose.lon, heading }],
    offset,
    heard: now,
    heading,
  };
}

export function receivePose(prev: Track | undefined, pose: Pose, now: number): Track {
  const sent = pose.sent ?? pose.at;
  const raw_offset = now - sent;
  if (!prev) return freshTrack(pose, now, raw_offset, 0);

  const last = prev.sample[prev.sample.length - 1];
  const gap = distanceMeter(last, pose);
  /* A teleport (a joined walker code) is not a walk; nor is a sender clock
     that jumped — a phone set by hand, or a different phone on the same code.
     Both restart the timeline where the walker now is. */
  if (gap > SNAP_M || Math.abs(raw_offset - prev.offset) > CLOCK_JUMP_MS) {
    return freshTrack(pose, now, raw_offset, prev.heading);
  }
  const offset = Math.min(prev.offset, raw_offset);
  let t = sent + offset;
  /* Out of order or a duplicate stamp: never walk backwards in time. */
  if (t <= last.t) t = last.t + 1;

  const heading = gap > STILL_M ? headingOf(last, pose) : last.heading;
  const sample = [...prev.sample];
  /* A long gap was standing still, then a step — not a slow crawl across it. */
  if (t - last.t > SEGMENT_MAX_MS) {
    sample.push({ t: t - STEP_MS, lat: last.lat, lon: last.lon, heading: last.heading });
  }
  sample.push({ t, lat: pose.lat, lon: pose.lon, heading });
  /* Keep what the delay can still reach, and never fewer than two. */
  const horizon = now - INTERP_DELAY_POLL_MS - SEGMENT_MAX_MS;
  let drop = 0;
  while (sample.length - drop > 2 && (sample.length - drop > SAMPLE_MAX || sample[drop + 1].t < horizon)) drop += 1;

  return { pose, sample: sample.slice(drop), offset, heard: now, heading };
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
  find: { walker_id: string; lat: number | null; lon: number | null },
  me: { walker_id: string; at: LatLon | null },
  radius_m = NEARBY_FIND_M,
): boolean {
  if (find.walker_id === me.walker_id || find.lat === null || find.lon === null || !me.at) return false;
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
  if (message.type === "find" || message.type === "notice") return track;
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
      if (!res.ok) {
        /* A refused pose that says why (a moderator hid this walker) is a
           notice for this phone, not a broken hall: the roster still polls. */
        const refusal = (await res.json().catch(() => null)) as { notice?: HallNotice } | null;
        if (refusal?.notice && !is_closed) {
          deliver({ type: "notice", notice: refusal.notice });
          return;
        }
        throw new Error(String(res.status));
      }
      const body = (await res.json()) as { notice?: HallNotice } | null;
      if (is_closed || is_socket_open) return;
      if (body?.notice) deliver({ type: "notice", notice: body.notice });
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
