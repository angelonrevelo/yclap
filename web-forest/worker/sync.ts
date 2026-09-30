/**
 * Same-origin campus world on the PWA host.
 * Durable Object holds the hall; SSE pushes every merge to every phone.
 */
import {
  CODE_MISS_MAX,
  CODE_MISS_WINDOW_MS,
  lookupByCode,
  MemoryCampusStore,
  mergeSync,
  sanitizePlayer,
  sanitizeSighting,
  hallDefaultOf,
  pruneCampus,
  retentionDayOf,
  weeklyActivity,
  worldFrom,
  type SightingRow,
} from "../src/campus-world.ts";
import { AccountService, isAccountPath, type AccountEnv, type SqlValue } from "./account.ts";
import { handleIdentify, IDENTIFY_PATH, identifyKeyOf } from "./inat.ts";
import { freshFindOf, HALL_OFF_BODY, HALL_POSITION_PATH, isHallOff, isWriteRoute, WRITE_OFF_BODY } from "../src/multiplayer.ts";
import { EDGE_REPORT_IP_PER_HOUR } from "../src/moderation.ts";
import { safeNameOf, nameNoticeOf } from "../src/name-filter.ts";
import { LIVE_PATH, LiveHall } from "./live-socket.ts";
import { isModPath, ModerationService, type ModWorld } from "./moderation.ts";
import { accountCorsOf, clientIp, isAccountCorsPath, pageOriginListOf, RateWindow, withCors } from "../src/rate-limit.ts";

export interface Env extends AccountEnv {
  CAMPUS: DurableObjectNamespace;
  ASSETS: Fetcher;
  /** iNat API token. `wrangler secret put INAT_API_TOKEN` — never a VITE_ var. Used only with INAT_CV_PERMITTED=1. */
  INAT_API_TOKEN?: string;
  /** "1" once iNaturalist has agreed in writing to this use of its visual API. */
  INAT_CV_PERMITTED?: string;
  /** Pl@ntNet API key — the identify service used by default. `wrangler secret put PLANTNET_API_KEY`. */
  PLANTNET_API_KEY?: string;
  /**
   * Extra page origins the hall answers, comma-separated — a page served from
   * another host than this Worker (a preview deploy pointing `?sync=` here).
   */
  HALL_PAGE_ORIGIN?: string;
  /** "1" switches live positions off campus-wide (`isHallOff`). */
  HALL_OFF?: string;
  /** Days the shared world keeps a find (`pruneCampus`); default 150. */
  RETENTION_DAY?: string;
  /** "1" refuses every route that stores something new (`isWriteRoute`) — the breach switch. */
  WRITE_OFF?: string;
  /** "opt_in": phones send no live position until their student turns sharing on (`hallDefaultOf`). */
  HALL_DEFAULT?: string;
  /**
   * The moderator console's password (`wrangler secret put MOD_TOKEN`, 16+
   * characters). Unset or short: /mod/api/* answers 404 and the console is off.
   */
  MOD_TOKEN?: string;
}

const SYNC_PATH = new Set(["/world", "/sync", "/live", "/health", "/join", "/partner", "/mine"]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (isHallOff(env.WRITE_OFF) && isWriteRoute(request.method, url.pathname)) {
      return new Response(JSON.stringify(WRITE_OFF_BODY), { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }
    /* Accounts and identify answer a page on another origin (a preview deploy,
       a LAN build pointed here) with its own origin + credentials, never `*`. */
    if (isAccountCorsPath(url.pathname)) {
      const allow = pageOriginListOf(env.HALL_PAGE_ORIGIN);
      const cors = accountCorsOf(request.headers.get("Origin"), url.host, allow);
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      if (url.pathname === IDENTIFY_PATH) {
        return withCors(await handleIdentify(request, identifyKeyOf(env), undefined, undefined, allow), cors);
      }
      const id = env.CAMPUS.idFromName("loyola");
      return withCors(await env.CAMPUS.get(id).fetch(request), cors);
    }
    if (SYNC_PATH.has(url.pathname) || LIVE_PATH.has(url.pathname) || isAccountPath(url.pathname) || isModPath(url.pathname)) {
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
  /** Reports, hides and the audit log, in this object's SQLite beside the accounts. */
  moderation: ModerationService;
  page_origin: string[];
  /** Wrong walker codes per address — see `CODE_MISS_MAX`. In memory, like every brake here. */
  code_miss = new RateWindow(CODE_MISS_MAX, CODE_MISS_WINDOW_MS);

  constructor(ctx: DurableObjectState, env: Env) {
    this.ctx = ctx;
    this.env = env;
    this.page_origin = pageOriginListOf(env.HALL_PAGE_ORIGIN);
    this.moderation = new ModerationService(
      (query: string, ...bind: SqlValue[]) => this.ctx.storage.sql.exec(query, ...bind).toArray(),
      { token: env.MOD_TOKEN, report_ip_per_hour: EDGE_REPORT_IP_PER_HOUR },
    );
    this.hall = new LiveHall(ctx, (headers) => this.cors(headers), this.page_origin, this.moderation);
  }

  /** The world as every phone sees it: what a moderator hid is filtered out. */
  world(store: MemoryCampusStore) {
    return worldFrom(store, Date.now(), this.moderation.worldHide(), hallDefaultOf(this.env.HALL_DEFAULT));
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
    const chunk = `data: ${JSON.stringify(this.world(store))}\n\n`;
    for (const send of this.listener) send(chunk);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (isAccountPath(url.pathname)) return this.account().handle(request);
    /* Before the catch-all OPTIONS below: /report answers only its own page,
       and the console answers no other origin at all. */
    if (isModPath(url.pathname)) {
      const store = await this.store();
      const world: ModWorld = {
        recentFind: () => worldFrom(store).find,
        refresh: () => this.broadcast(store),
        activity: () => weeklyActivity(store),
      };
      return (await this.moderation.handle(request, this.hall, world, this.page_origin))!;
    }
    /* /live/pose answers its own page only: no CORS, not even on the preflight. */
    if (request.method === "OPTIONS" && url.pathname !== "/live/pose") {
      return new Response(null, { status: 204, headers: this.cors() });
    }

    if (isHallOff(this.env.HALL_OFF) && HALL_POSITION_PATH.has(url.pathname)) return this.json(HALL_OFF_BODY, 503);
    const live = await this.hall.handle(request, url);
    if (live) return live;

    if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/world")) {
      return this.json(this.world(await this.store()));
    }

    if (request.method === "GET" && (url.pathname === "/join" || url.pathname === "/partner")) {
      const { status, body } = lookupByCode(
        await this.store(),
        url.pathname,
        url.searchParams.get("code") ?? "",
        clientIp(request),
        this.code_miss,
      );
      return this.json(body, status);
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
          send(`data: ${JSON.stringify(this.world(store))}\n\n`);
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
      /* Retention runs on every write (CPIA F-1): nothing older than the window survives a sync. */
      pruneCampus(store, Date.now(), retentionDayOf(this.env.RETENTION_DAY));
      await this.persist(store);
      this.broadcast(store);
      this.hall.announce(fresh);
      /* sanitizePlayer already swapped a refused name; say so to this phone. */
      const { refusal } = safeNameOf((body.player as { name?: unknown } | undefined)?.name, player.player_id);
      const notice = refusal ? nameNoticeOf(refusal, player.name) : undefined;
      return this.json({ ok: true, merged, world: this.world(store), ...(notice ? { notice } : {}) });
    }

    return this.json({ error: "not found" }, 404);
  }
}
