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

export interface Env {
  CAMPUS: DurableObjectNamespace;
  ASSETS: Fetcher;
}

const SYNC_PATH = new Set(["/world", "/sync", "/live", "/health", "/join", "/mine"]);

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (SYNC_PATH.has(url.pathname)) {
      const id = env.CAMPUS.idFromName("loyola");
      return env.CAMPUS.get(id).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
};

export class CampusWorld {
  ctx: DurableObjectState;
  listener: Set<(chunk: string) => void> = new Set();

  constructor(ctx: DurableObjectState) {
    this.ctx = ctx;
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
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: this.cors() });
    }

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
      const { merged } = mergeSync(store, player, row);
      await this.persist(store);
      this.broadcast(store);
      return this.json({ ok: true, merged, world: worldFrom(store) });
    }

    return this.json({ error: "not found" }, 404);
  }
}
