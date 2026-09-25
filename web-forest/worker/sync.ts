/**
 * Same-origin campus world on the PWA host.
 * Durable Object holds the hall; SSE pushes every merge to every phone.
 */
import {
  MemoryCampusStore,
  mergeSync,
  sanitizePlayer,
  sanitizeSighting,
  worldFrom,
  type SightingRow,
} from "../src/campus-world.ts";
import { AccountService, isAccountPath, type AccountEnv, type SqlValue } from "./account.ts";
import { handleIdentify, IDENTIFY_PATH } from "./inat.ts";
import { freshFindOf } from "../src/multiplayer.ts";
import { LIVE_PATH, LiveHall } from "./live-socket.ts";
import { accountCorsOf, isAccountCorsPath, pageOriginListOf, withCors } from "../src/rate-limit.ts";

export interface Env extends AccountEnv {
  CAMPUS: DurableObjectNamespace;
  ASSETS: Fetcher;
  /** iNat API token. `wrangler secret put INAT_API_TOKEN` — never a VITE_ var. */
  INAT_API_TOKEN?: string;
  /**
   * Extra page origins the hall answers, comma-separated — a page served from
   * another host than this Worker (a preview deploy pointing `?sync=` here).
   */
  HALL_PAGE_ORIGIN?: string;
}

const SYNC_PATH = new Set(["/world", "/sync", "/live", "/health", "/join", "/mine"]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    /* Accounts and identify answer a page on another origin (a preview deploy,
       a LAN build pointed here) with its own origin + credentials, never `*`. */
    if (isAccountCorsPath(url.pathname)) {
      const allow = pageOriginListOf(env.HALL_PAGE_ORIGIN);
      const cors = accountCorsOf(request.headers.get("Origin"), url.host, allow);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      if (url.pathname === IDENTIFY_PATH) {
        return withCors(await handleIdentify(request, env.INAT_API_TOKEN, undefined, undefined, allow), cors);
      }
      const id = env.CAMPUS.idFromName("loyola");
      return withCors(await env.CAMPUS.get(id).fetch(request), cors);
    }
    if (SYNC_PATH.has(url.pathname) || LIVE_PATH.has(url.pathname) || isAccountPath(url.pathname)) {
      const id = env.CAMPUS.idFromName("loyola");
      return env.CAMPUS.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

export class CampusWorld {
  ctx: DurableObjectState;
  env: Env;
  listener: Set<(chunk: string) => void> = new Set();
  account_service: AccountService | null = null;
  hall: LiveHall;

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
    this.hall = new LiveHall(ctx, (headers) => this.cors(headers), pageOriginListOf(env.HALL_PAGE_ORIGIN));
  }

  /** Accounts live in this object's SQLite — see worker/account.ts. */
  account(): AccountService {
    this.account_service ??= new AccountService(
      (query: string, ...bind: SqlValue[]) => this.ctx.storage.sql.exec(query, ...bind).toArray(),
      this.env,
    );
    return this.account_service;
  }

  /* Hibernation API entry points — the runtime calls these by name. */
  webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): void {
    this.hall.message(ws, data);
  }

  webSocketClose(ws: WebSocket): void {
    this.hall.close(ws);
  }

  webSocketError(ws: WebSocket): void {
    this.hall.close(ws);
  }

  async store(): Promise<MemoryCampusStore> {
    return MemoryCampusStore.from(await this.ctx.storage.get("campus"));
  }

  async persist(store: MemoryCampusStore): Promise<void> {
    await this.ctx.storage.put("campus", store.toJSON());
  }

  cors(headers: HeadersInit = {}): Headers {
    const h = new Headers(headers);
    h.set("Access-Control-Allow-Origin", "*");
    h.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    h.set("Access-Control-Allow-Headers", "Content-Type");
    return h;
  }

  json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: this.cors({ "Content-Type": "application/json" }),
    });
  }

  broadcast(store: MemoryCampusStore): void {
    const chunk = `data: ${JSON.stringify(worldFrom(store))}\n\n`;
    for (const send of this.listener) send(chunk);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (isAccountPath(url.pathname)) return this.account().handle(request);
    /* /live/pose answers its own page only: no CORS, not even on the preflight. */
    if (request.method === "OPTIONS" && url.pathname !== "/live/pose") {
      return new Response(null, { status: 204, headers: this.cors() });
    }

    const live = await this.hall.handle(request, url);
    if (live) return live;

    if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/world")) {
      return this.json(worldFrom(await this.store()));
    }

    if (request.method === "GET" && url.pathname === "/join") {
      const row = (await this.store()).playerByJoin(url.searchParams.get("code") ?? "");
      if (!row) return this.json({ error: "unknown join_code" }, 404);
      return this.json({ player_id: row.player_id, name: row.name, join_code: row.join_code });
    }

    if (request.method === "GET" && url.pathname === "/mine") {
      const player_id = url.searchParams.get("player_id") ?? "";
      const sighting = (await this.store()).sightingByPlayer(player_id);
      return this.json({ sighting });
    }

    if (request.method === "GET" && url.pathname === "/live") {
      const store = await this.store();
      const encoder = new TextEncoder();
      let send: (chunk: string) => void = () => {};
      const stream = new ReadableStream({
        start: (controller) => {
          send = (chunk) => {
            try {
              controller.enqueue(encoder.encode(chunk));
            } catch {
              this.listener.delete(send);
            }
          };
          this.listener.add(send);
          send(`data: ${JSON.stringify(worldFrom(store))}\n\n`);
        },
        cancel: () => {
          this.listener.delete(send);
        },
      });
      return new Response(stream, {
        headers: this.cors({
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        }),
      });
    }

    if (request.method === "POST" && url.pathname === "/sync") {
      let body: { player?: unknown; sighting?: unknown };
      try {
        body = (await request.json()) as { player?: unknown; sighting?: unknown };
      } catch {
        return this.json({ error: "bad json" }, 400);
      }
      const player = sanitizePlayer((body.player ?? {}) as Record<string, unknown>);
      if (!player || !Array.isArray(body.sighting)) {
        return this.json({ error: "player.player_id and sighting[] required" }, 400);
      }
      const store = await this.store();
      const row: SightingRow[] = [];
      for (const raw of body.sighting) {
        const one = sanitizeSighting((raw ?? {}) as Record<string, unknown>, player.player_id);
        if (one) row.push(one);
      }
      const fresh = freshFindOf(new Set(store.sighting.map((s) => s.sighting_id)), row, player);
      const { merged } = mergeSync(store, player, row);
      await this.persist(store);
      this.broadcast(store);
      this.hall.announce(fresh);
      return this.json({ ok: true, merged, world: worldFrom(store) });
    }

    return this.json({ error: "not found" }, 404);
  }
}
