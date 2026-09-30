/**
 * Client half of the campus world.
 *
 * Same-origin in production (the Worker on the PWA host). `?sync=` still
 * points a projector at a LAN box. Photos and notes never leave the device.
 */

import {
  joinCodeOf,
  normalizeJoinCode,
  type World,
  type WorldFind,
  type WorldWalker,
} from "./campus-world.ts";
import { generatedNameOf } from "./name-filter.ts";

export type { World, WorldFind, WorldWalker };

export interface PlayerIdentity {
  player_id: string;
  name: string;
  join_code: string;
}

const IDENTITY_KEY = "field-guide.player";

function mintIdentity(): PlayerIdentity {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return {
    player_id: uuid,
    /* The same function the server falls back to when a chosen name is
       refused, so a refused phone goes back to the name it was minted with. */
    name: generatedNameOf(uuid),
    join_code: joinCodeOf(uuid),
  };
}

function writeIdentity(identity: PlayerIdentity, storage: Storage | null): void {
  try {
    storage?.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    /* private mode */
  }
}

/** Read-or-mint the device's walker identity. Stable across reloads. */
export function readPlayer(storage: Storage | null = safeStorage()): PlayerIdentity {
  try {
    const raw = storage?.getItem(IDENTITY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PlayerIdentity>;
      if (typeof parsed.player_id === "string" && typeof parsed.name === "string") {
        const identity: PlayerIdentity = {
          player_id: parsed.player_id,
          name: parsed.name,
          join_code:
            typeof parsed.join_code === "string" && normalizeJoinCode(parsed.join_code).length === 6
              ? normalizeJoinCode(parsed.join_code)
              : joinCodeOf(parsed.player_id),
        };
        if (identity.join_code !== parsed.join_code) writeIdentity(identity, storage);
        return identity;
      }
    }
  } catch {
    /* fall through and mint */
  }
  const identity = mintIdentity();
  writeIdentity(identity, storage);
  return identity;
}

/** Adopt another device's walker so journal + presence share one player_id. */
export function writePlayer(identity: PlayerIdentity, storage: Storage | null = safeStorage()): PlayerIdentity {
  const next: PlayerIdentity = {
    player_id: identity.player_id.slice(0, 64),
    name: identity.name.slice(0, 40),
    join_code: normalizeJoinCode(identity.join_code) || joinCodeOf(identity.player_id),
  };
  writeIdentity(next, storage);
  return next;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export interface SightingWire {
  sighting_id: string;
  species_code: string;
  common_name: string;
  lat: number | null;
  lon: number | null;
  entry_kind: "badge" | "contribution";
  created_at: string;
}

export function toWire(
  row: {
    sighting_id: string;
    species_code: string;
    lat: number | null;
    lon: number | null;
    entry_kind?: "badge" | "contribution";
    created_at: string;
  },
  common_name: string,
): SightingWire {
  return {
    sighting_id: row.sighting_id,
    species_code: row.species_code,
    common_name,
    lat: row.lat,
    lon: row.lon,
    entry_kind: row.entry_kind ?? "badge",
    created_at: row.created_at,
  };
}

export type SyncState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; world: World; at: number }
  | { status: "offline" };

/**
 * Where the campus world lives.
 * `?sync=` · `VITE_SYNC_URL` · same origin (the deployed Worker / vite proxy).
 */
export function syncUrl(): string | null {
  try {
    const param = new URLSearchParams(window.location.search).get("sync");
    if (param) return param.replace(/\/$/, "");
  } catch {
    /* no window */
  }
  const env = (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_SYNC_URL;
  if (env?.trim()) return env.trim().replace(/\/$/, "");
  try {
    return window.location.origin;
  } catch {
    return null;
  }
}

function pageOrigin(): string | null {
  try {
    return window.location.origin;
  } catch {
    return null;
  }
}

export interface SyncRoute {
  url: string;
  /** The sync base is another origin than this page: send the cookie along. */
  is_cross_origin: boolean;
}

/**
 * A server path (/auth/me, /account/save, /inat/identify) on the same base the
 * campus world uses (`syncUrl`). Same origin — or no window at all — keeps the
 * bare path; a Path A build (VITE_SYNC_URL or `?sync=` naming :8788 while the
 * page is on :4177) gets the absolute URL and `is_cross_origin`.
 */
export function syncRouteOf(
  path: string,
  base: string | null = syncUrl(),
  page_origin: string | null = pageOrigin(),
): SyncRoute {
  if (base === null || base === page_origin) return { url: path, is_cross_origin: false };
  let base_origin: string;
  try {
    base_origin = new URL(base).origin;
  } catch {
    return { url: path, is_cross_origin: false };
  }
  return { url: `${base}${path}`, is_cross_origin: base_origin !== page_origin };
}

/** `credentials` for a fetch to `route`: include across origins, else same-origin. */
export function credentialOf(route: SyncRoute): RequestCredentials {
  return route.is_cross_origin ? "include" : "same-origin";
}

export interface PlayerSummary {
  stage: string;
  level: number;
  total_points: number;
  streak_weeks: number;
}

export interface SyncResult {
  merged: number;
  world: World;
}

/**
 * How a /sync push went. `too_large` is the server's 413 — this journal is
 * over the body cap, and retrying will not help — which is not the same thing
 * as `offline` (no answer at all, or no usable one); `refused` is any other
 * HTTP error. `none` means no sync server is configured.
 */
export type SyncOutcome =
  | { status: "ok"; result: SyncResult }
  | { status: "too_large" }
  | { status: "refused"; http_status: number }
  | { status: "offline" }
  | { status: "none" };

export async function syncJournal(
  player: PlayerIdentity,
  wire: SightingWire[],
  summary: PlayerSummary,
  fetch_impl: typeof fetch = globalThis.fetch,
  base_url: string | null = syncUrl(),
): Promise<SyncOutcome> {
  if (base_url === null) return { status: "none" };
  try {
    const res = await fetch_impl(`${base_url}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        player: { ...player, ...summary },
        sighting: wire,
      }),
    });
    if (res.status === 413) return { status: "too_large" };
    if (!res.ok) return { status: "refused", http_status: res.status };
    const body = (await res.json()) as SyncResult;
    return body?.world ? { status: "ok", result: body } : { status: "offline" };
  } catch {
    return { status: "offline" };
  }
}

export async function fetchWorld(
  fetch_impl: typeof fetch = globalThis.fetch,
  base_url: string | null = syncUrl(),
): Promise<World | null> {
  if (base_url === null) return null;
  try {
    const res = await fetch_impl(`${base_url}/world`);
    if (!res.ok) return null;
    const body = (await res.json()) as World;
    return Array.isArray(body?.find) ? body : null;
  } catch {
    return null;
  }
}

export async function fetchJoin(
  join_code: string,
  fetch_impl: typeof fetch = globalThis.fetch,
  base_url: string | null = syncUrl(),
): Promise<PlayerIdentity | null> {
  if (base_url === null) return null;
  const code = normalizeJoinCode(join_code);
  if (code.length !== 6) return null;
  try {
    const res = await fetch_impl(`${base_url}/join?code=${encodeURIComponent(code)}`);
    if (!res.ok) return null;
    const body = (await res.json()) as Partial<PlayerIdentity>;
    if (typeof body.player_id !== "string" || typeof body.name !== "string") return null;
    return {
      player_id: body.player_id,
      name: body.name,
      join_code: typeof body.join_code === "string" ? body.join_code : code,
    };
  } catch {
    return null;
  }
}

export async function fetchMine(
  player_id: string,
  fetch_impl: typeof fetch = globalThis.fetch,
  base_url: string | null = syncUrl(),
): Promise<SightingWire[] | null> {
  if (base_url === null) return null;
  try {
    const res = await fetch_impl(`${base_url}/mine?player_id=${encodeURIComponent(player_id)}`);
    if (!res.ok) return null;
    const body = (await res.json()) as { sighting?: SightingWire[] };
    return Array.isArray(body.sighting) ? body.sighting : null;
  } catch {
    return null;
  }
}

export function openLiveWorld(
  onWorld: (world: World) => void,
  base_url: string | null = syncUrl(),
): () => void {
  if (base_url === null || typeof EventSource === "undefined") return () => {};
  const source = new EventSource(`${base_url}/live`);
  source.onmessage = (ev) => {
    try {
      const body = JSON.parse(ev.data) as World;
      if (Array.isArray(body?.find)) onWorld(body);
    } catch {
      /* ignore a torn frame */
    }
  };
  return () => source.close();
}
