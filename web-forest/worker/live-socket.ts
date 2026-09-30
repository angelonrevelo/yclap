/**
 * The hall's real-time half, hosted by the CampusWorld Durable Object.
 *
 * GET  /live/socket  WebSocket (hibernation API): poses in, roster/pose/gone/find out
 * POST /live/pose    polling fallback — one pose in, the roster back
 * GET  /live/walker  polling fallback — the roster
 *
 * Each socket's last pose rides in its attachment, so a hibernated object
 * wakes up still knowing who is where. The polling walkers and the recent-find
 * ring live in memory only — they are re-sent every second or two, and losing
 * them to an eviction costs one poll, not a walker. Nothing here touches
 * storage: presence is never persisted.
 *
 * Brakes: the upgrade and POST /live/pose must come from a page isHallOrigin
 * takes (this host, a localhost dev server, or HALL_PAGE_ORIGIN), and
 * /live/pose sends CORS headers only to such a page on another origin
 * (pageCorsOf), never `*`; at most HALL_WALKER_MAX sockets and polled walkers,
 * and at most EDGE_IP_SOCKET_MAX sockets and EDGE_POLL_IP_WALKER_MAX polled
 * walkers per IP, so one address cannot hold every seat — sized for a booth
 * sharing one public IP (see src/multiplayer.ts); poses are dropped past
 * POSE_PER_SECOND per socket / polled walker and POSE_IP_PER_SECOND per IP. A
 * socket's IP and id ride in its tags, so they survive hibernation too.
 *
 * Moderation (`guard`, worker/moderation.ts): a walker a moderator hid is
 * dropped from the roster and their poses are refused — the phone is told once,
 * by a `notice` only it receives — and their finds are not called out. A name
 * the filter refused is printed as the generated walker name, and that phone,
 * alone, is told why.
 */
import type { WorldFind } from "../src/campus-world.ts";
import {
  EDGE_IP_SOCKET_MAX,
  EDGE_POLL_IP_WALKER_MAX,
  HALL_WALKER_MAX,
  hiddenNoticeOf,
  isFindShown,
  nameNoticeOfPose,
  POSE_IP_PER_SECOND,
  POSE_PER_SECOND,
  rosterOf,
  sanitizePoseVerdict,
  STALE_MS,
  type HallGuard,
  type HallMessage,
  type HallNotice,
  type Pose,
} from "../src/multiplayer.ts";
import { RateWindow, clientIp, isHallOrigin, isOwnPage, pageCorsOf } from "../src/rate-limit.ts";

export const LIVE_PATH = new Set(["/live/socket", "/live/pose", "/live/walker"]);

export class LiveHall {
  ctx: DurableObjectState;
  cors: (headers?: HeadersInit) => Headers;
  polled: Map<string, Pose> = new Map();
  /** walker_id → the IP that polls it, for the per-IP seat cap. */
  polled_ip: Map<string, string> = new Map();
  recent_find: { at: number; find: WorldFind }[] = [];
  pose_limit: RateWindow = new RateWindow(POSE_PER_SECOND, 1000);
  ip_limit: RateWindow = new RateWindow(POSE_IP_PER_SECOND, 1000);
  /** HALL_PAGE_ORIGIN, parsed: extra page origins the hall answers. */
  page_origin: readonly string[];
  guard: HallGuard | null;
  /**
   * Socket ids already told they are hidden, so a phone that keeps posing is
   * not sent the same notice every second. In memory: after an eviction a
   * hidden phone is told once more, which is harmless.
   */
  hidden_told: Set<string> = new Set();

  constructor(
    ctx: DurableObjectState,
    cors: (headers?: HeadersInit) => Headers,
    page_origin: readonly string[] = [],
    guard: HallGuard | null = null,
  ) {
    this.ctx = ctx;
    this.cors = cors;
    this.page_origin = page_origin;
    this.guard = guard;
  }

  /** Hidden by a moderator right now? */
  isHidden(walker_id: string, now: number): boolean {
    return (this.guard?.hiddenUntil(walker_id, now) ?? null) !== null;
  }

  sendTo(ws: WebSocket, message: HallMessage): void {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      /* closing */
    }
  }

  socketPose(): Pose[] {
    return this.ctx.getWebSockets().map((ws) => ws.deserializeAttachment() as Pose | null).filter((p): p is Pose => Boolean(p));
  }

  prunePolled(now: number): void {
    for (const [id, pose] of this.polled) {
      if (now - pose.at <= STALE_MS) continue;
      this.polled.delete(id);
      this.polled_ip.delete(id);
    }
  }

  /** Open sockets this IP holds right now (the IP rides in tag 1). */
  socketsOf(ip: string): number {
    let count = 0;
    for (const ws of this.ctx.getWebSockets()) if (this.ctx.getTags(ws)[1] === ip) count += 1;
    return count;
  }

  /** Polled walkers this IP holds right now. */
  polledBy(ip: string): number {
    let count = 0;
    for (const holder of this.polled_ip.values()) if (holder === ip) count += 1;
    return count;
  }

  snapshot(): HallMessage {
    const now = Date.now();
    this.recent_find = this.recent_find.filter((f) => now - f.at < STALE_MS);
    this.prunePolled(now);
    return {
      type: "roster",
      walker: rosterOf([...this.socketPose(), ...this.polled.values()], now)
        .filter((p) => !this.isHidden(p.walker_id, now))
        .slice(0, HALL_WALKER_MAX),
      find: this.recent_find.map((f) => f.find).filter((f) => isFindShown(f, this.guard, now)),
      server_time: now,
    };
  }

  /** Who the console may see in the hall now: walker_id, name, level. */
  walkerNow(): { walker_id: string; name: string; level: number }[] {
    return (this.snapshot() as Extract<HallMessage, { type: "roster" }>).walker;
  }

  /**
   * A moderator just hid `walker_id`: out of the polled seats, every socket
   * posing as them cleared and told why, and every other phone told they are
   * gone. Their next pose is refused by `guard` until `until`.
   */
  evict(walker_id: string, until: number): void {
    this.polled.delete(walker_id);
    this.polled_ip.delete(walker_id);
    this.recent_find = this.recent_find.filter((f) => f.find.walker_id !== walker_id);
    for (const ws of this.ctx.getWebSockets()) {
      const pose = ws.deserializeAttachment() as Pose | null;
      if (pose?.walker_id !== walker_id) continue;
      ws.serializeAttachment(null);
      this.hidden_told.add(this.ctx.getTags(ws)[0] ?? "");
      this.sendTo(ws, { type: "notice", notice: hiddenNoticeOf(until) });
    }
    this.broadcast({ type: "gone", walker_id });
  }

  broadcast(message: HallMessage, except?: WebSocket): void {
    const text = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      try {
        ws.send(text);
      } catch {
        /* closing; webSocketClose tidies up */
      }
    }
  }

  json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: this.cors({ "Content-Type": "application/json", "Cache-Control": "no-store" }),
    });
  }

  /**
   * /live/pose answers its own page only: `cors` is pageCorsOf — empty for a
   * same-origin page or a foreign one, the page's own origin (never `*`) for
   * an allowed page on another port or in HALL_PAGE_ORIGIN.
   */
  plainJson(body: unknown, status = 200, cors: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...cors },
    });
  }

  /** Both brakes in one step; false means drop this pose. */
  allowPose(key: string, ip: string | null, now: number): boolean {
    if (ip && this.ip_limit.retryAfter(ip, now) > 0) return false;
    if (this.pose_limit.take(key, now) > 0) return false;
    if (ip) this.ip_limit.note(ip, now);
    return true;
  }

  /** Null when the path is not the hall's. */
  async handle(request: Request, url: URL): Promise<Response | null> {
    if (!LIVE_PATH.has(url.pathname)) return null;

    if (url.pathname === "/live/socket") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return this.json({ error: "expected a WebSocket upgrade" }, 426);
      }
      if (!isHallOrigin(request.headers.get("Origin"), url.host, this.page_origin)) {
        return this.json({ error: "this hall only opens to its own page" }, 403);
      }
      if (this.ctx.getWebSockets().length >= HALL_WALKER_MAX) {
        return this.json({ error: "the hall is full — polling still shows who is here" }, 503);
      }
      const ip = clientIp(request);
      if (ip && this.socketsOf(ip) >= EDGE_IP_SOCKET_MAX) {
        return this.json({ error: "too many hall sockets from one address" }, 429);
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      /* Tags: [socket id, ip]. Read back with getTags, which survives hibernation. */
      this.ctx.acceptWebSocket(server, [crypto.randomUUID(), ip ?? ""]);
      server.serializeAttachment(null);
      server.send(JSON.stringify(this.snapshot()));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/live/walker" && request.method === "GET") {
      return this.json(this.snapshot());
    }

    const cors = pageCorsOf(request.headers.get("Origin"), url.host, this.page_origin);

    if (url.pathname === "/live/pose" && request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === "/live/pose" && request.method === "POST") {
      if (!isOwnPage(request, url.host, this.page_origin)) {
        return this.plainJson({ error: "this hall only takes poses from its own page" }, 403);
      }
      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        return this.plainJson({ error: "bad json" }, 400, cors);
      }
      const now = Date.now();
      const verdict = sanitizePoseVerdict(raw, now);
      if (!verdict) return this.plainJson({ error: "pose needs player_id and a lat/lon inside the campus frame" }, 400, cors);
      const { pose } = verdict;
      const ip = clientIp(request);
      if (!this.allowPose(`poll:${pose.walker_id}`, ip, now)) {
        return this.plainJson({ error: "too many poses" }, 429, cors);
      }
      const until = this.guard?.hiddenUntil(pose.walker_id, now) ?? null;
      if (until !== null) {
        this.polled.delete(pose.walker_id);
        this.polled_ip.delete(pose.walker_id);
        return this.plainJson({ error: "hidden from the hall by a moderator", notice: hiddenNoticeOf(until) }, 403, cors);
      }
      this.prunePolled(now);
      if (!this.polled.has(pose.walker_id)) {
        if (ip && this.polledBy(ip) >= EDGE_POLL_IP_WALKER_MAX) {
          return this.plainJson({ error: "too many walkers from one address" }, 429, cors);
        }
        if (this.polled.size >= HALL_WALKER_MAX) return this.plainJson({ error: "the hall is full" }, 503, cors);
      }
      this.polled.set(pose.walker_id, pose);
      if (ip) this.polled_ip.set(pose.walker_id, ip);
      else this.polled_ip.delete(pose.walker_id);
      this.broadcast({ type: "pose", walker: pose });
      const notice: HallNotice | null = nameNoticeOfPose(pose, verdict.refusal);
      return this.plainJson(notice ? { ...this.snapshot(), notice } : this.snapshot(), 200, cors);
    }

    return this.json({ error: "not found" }, 404);
  }

  message(ws: WebSocket, data: string | ArrayBuffer): void {
    if (typeof data !== "string" || data.length > 4_000) return;
    let body: { type?: unknown };
    try {
      body = JSON.parse(data) as { type?: unknown };
    } catch {
      return;
    }
    if (body.type === "pose") {
      const now = Date.now();
      const [socket_id = "", ip = ""] = this.ctx.getTags(ws);
      if (!this.allowPose(`socket:${socket_id}`, ip || null, now)) return;
      const verdict = sanitizePoseVerdict(body, now);
      if (!verdict) return;
      const { pose, refusal } = verdict;
      const prev = ws.deserializeAttachment() as Pose | null;
      const until = this.guard?.hiddenUntil(pose.walker_id, now) ?? null;
      if (until !== null) {
        if (prev) {
          ws.serializeAttachment(null);
          this.broadcast({ type: "gone", walker_id: prev.walker_id }, ws);
        }
        if (!this.hidden_told.has(socket_id)) {
          this.hidden_told.add(socket_id);
          this.sendTo(ws, { type: "notice", notice: hiddenNoticeOf(until) });
        }
        return;
      }
      this.hidden_told.delete(socket_id);
      ws.serializeAttachment(pose);
      this.broadcast({ type: "pose", walker: pose }, ws);
      /* Told once per name: when it first takes effect, not every second. */
      const notice = nameNoticeOfPose(pose, refusal);
      if (notice && prev?.name !== pose.name) this.sendTo(ws, { type: "notice", notice });
    } else if (body.type === "bye") {
      this.close(ws);
    }
  }

  close(ws: WebSocket): void {
    const [socket_id = ""] = this.ctx.getTags(ws);
    this.pose_limit.clear(`socket:${socket_id}`);
    this.hidden_told.delete(socket_id);
    const pose = ws.deserializeAttachment() as Pose | null;
    ws.serializeAttachment(null);
    try {
      ws.close(1000, "bye");
    } catch {
      /* already closed */
    }
    if (pose) this.broadcast({ type: "gone", walker_id: pose.walker_id }, ws);
  }

  /** Called by /sync with only the finds that were new to the store. */
  announce(all: WorldFind[]): void {
    const now = Date.now();
    const find = all.filter((f) => isFindShown(f, this.guard, now));
    if (!find.length) return;
    for (const one of find) this.recent_find.push({ at: now, find: one });
    this.recent_find = this.recent_find.slice(-40);
    this.broadcast({ type: "find", find });
  }
}
