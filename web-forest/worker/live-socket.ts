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
 */
import type { WorldFind } from "../src/campus-world.ts";
import { rosterOf, sanitizePose, STALE_MS, type HallMessage, type Pose } from "../src/multiplayer.ts";

export const LIVE_PATH = new Set(["/live/socket", "/live/pose", "/live/walker"]);

export class LiveHall {
  ctx: DurableObjectState;
  cors: (headers?: HeadersInit) => Headers;
  polled: Map<string, Pose> = new Map();
  recent_find: { at: number; find: WorldFind }[] = [];

  constructor(ctx: DurableObjectState, cors: (headers?: HeadersInit) => Headers) {
    this.ctx = ctx;
    this.cors = cors;
  }

  socketPose(): Pose[] {
    return this.ctx.getWebSockets().map((ws) => ws.deserializeAttachment() as Pose | null).filter((p): p is Pose => Boolean(p));
  }

  snapshot(): HallMessage {
    const now = Date.now();
    this.recent_find = this.recent_find.filter((f) => now - f.at < STALE_MS);
    for (const [id, pose] of this.polled) if (now - pose.at > STALE_MS) this.polled.delete(id);
    return {
      type: "roster",
      walker: rosterOf([...this.socketPose(), ...this.polled.values()], now),
      find: this.recent_find.map((f) => f.find),
      server_time: now,
    };
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

  /** Null when the path is not the hall's. */
  async handle(request: Request, url: URL): Promise<Response | null> {
    if (!LIVE_PATH.has(url.pathname)) return null;

    if (url.pathname === "/live/socket") {
      if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
        return this.json({ error: "expected a WebSocket upgrade" }, 426);
      }
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment(null);
      server.send(JSON.stringify(this.snapshot()));
      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/live/walker" && request.method === "GET") {
      return this.json(this.snapshot());
    }

    if (url.pathname === "/live/pose" && request.method === "POST") {
      let raw: unknown;
      try {
        raw = await request.json();
      } catch {
        return this.json({ error: "bad json" }, 400);
      }
      const pose = sanitizePose(raw, Date.now());
      if (!pose) return this.json({ error: "pose needs player_id and a lat/lon inside the campus frame" }, 400);
      this.polled.set(pose.walker_id, pose);
      this.broadcast({ type: "pose", walker: pose });
      return this.json(this.snapshot());
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
      const pose = sanitizePose(body, Date.now());
      if (!pose) return;
      ws.serializeAttachment(pose);
      this.broadcast({ type: "pose", walker: pose }, ws);
    } else if (body.type === "bye") {
      this.close(ws);
    }
  }

  close(ws: WebSocket): void {
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
  announce(find: WorldFind[]): void {
    if (!find.length) return;
    const now = Date.now();
    for (const one of find) this.recent_find.push({ at: now, find: one });
    this.recent_find = this.recent_find.slice(-40);
    this.broadcast({ type: "find", find });
  }
}
