/**
 * Client half of the central sync (owner ask, 2026-09-08: "working multiplayer
 * and centralized database sync").
 *
 * The division of trust is the whole design:
 *   - The JOURNAL never leaves the device except as the wire rows below — no
 *     photo, no note, no prompt answer. Photos are megabytes and private; the
 *     only part AIS actually lacks is species + count + location (`2:12:12`),
 *     and that is all this sends.
 *   - What comes DOWN is the world: other players' shared finds and a count of
 *     who is out there. Nothing in it ranks anyone against anyone — the
 *     standing rule (Sophie, `20:20`) survives multiplayer by construction:
 *     there is no field to compare.
 *
 * Identity is a random UUID minted on the device plus a generated walker name.
 * No account, no login, no PII — this is a showcase LAN, not a service.
 *
 * Server: `server/sync-server.mjs` (node:sqlite). Reach it via
 * `VITE_SYNC_URL` at build time, or `?sync=http://ip:8788` at runtime for the
 * projector pointing at another machine.
 */

export interface PlayerIdentity {
  player_id: string;
  name: string;
}

const IDENTITY_KEY = "field-guide.player";

/* Deterministic, friendly, non-identifying. The word list is trees you can
   actually meet on this campus. */
const NAME_WORD = [
  "Narra", "Molave", "Katmon", "Dao", "Balete", "Lagundi", "Banaba", "Dita",
  "Kupang", "Amugis", "Palosapis", "Malaruhat", "Salunguguet", "Tibig", "Almaciga",
];

function hashOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Read-or-mint the device's walker identity. Stable across reloads. */
export function readPlayer(storage: Storage | null = safeStorage()): PlayerIdentity {
  try {
    const raw = storage?.getItem(IDENTITY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PlayerIdentity>;
      if (typeof parsed.player_id === "string" && typeof parsed.name === "string") {
        return { player_id: parsed.player_id, name: parsed.name };
      }
    }
  } catch {
    /* fall through and mint */
  }
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const h = hashOf(uuid);
  const identity: PlayerIdentity = {
    player_id: uuid,
    name: `${NAME_WORD[h % NAME_WORD.length]} Walker ${(h >>> 8) % 97}`,
  };
  try {
    storage?.setItem(IDENTITY_KEY, JSON.stringify(identity));
  } catch {
    /* private mode — identity stays for this session only */
  }
  return identity;
}

function safeStorage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

/* ── the wire ─────────────────────────────────────────────────────────────── */

/** What one journal row becomes on the wire. Deliberately narrow. */
export interface SightingWire {
  sighting_id: string;
  species_code: string;
  common_name: string;
  lat: number | null;
  lon: number | null;
  entry_kind: "badge" | "contribution";
  created_at: string;
}

/**
 * Journal row → wire row. The allowlist IS the privacy policy: anything not
 * listed here (photo_data, note, accuracy, walk_id…) cannot reach the server
 * because this is the only mapping that builds a request body.
 */
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

export interface WorldFind {
  sighting_id: string;
  player_id: string;
  player_name: string;
  species_code: string;
  common_name: string;
  lat: number | null;
  lon: number | null;
  entry_kind: string;
  created_at: string;
}

export interface WorldWalker {
  player_id: string;
  name: string;
  stage: string;
  level: number;
  updated_at: string;
}

export interface World {
  server_time: string;
  find: WorldFind[];
  walker: WorldWalker[];
  totals: { player_count: number; sighting_count: number };
  note: string;
}

export type SyncState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; world: World; at: number }
  | { status: "offline" };

/** Where the server lives. `?sync=` beats the build-time env beats same-host. */
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
    return `${window.location.protocol}//${window.location.hostname}:8788`;
  } catch {
    return null;
  }
}

export interface SyncResult {
  merged: number;
  world: World;
}

/** Push the journal (mapped through `toWire`) and bring the world back. */
export async function syncJournal(
  player: PlayerIdentity,
  wire: SightingWire[],
  summary: { stage: string; level: number },
  fetch_impl: typeof fetch = globalThis.fetch,
  base_url: string | null = syncUrl(),
): Promise<SyncResult | null> {
  if (!base_url) return null;
  try {
    const res = await fetch_impl(`${base_url}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      /* The server stores stage + level on the player row, so the summary
         has to ride WITH the identity — otherwise every walker in the world
         list reads back as a level-1 egg. */
      body: JSON.stringify({ player: { ...player, ...summary }, sighting: wire }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as SyncResult;
    return body?.world ? body : null;
  } catch {
    return null;
  }
}

/** Just the world — the read the map does every minute. */
export async function fetchWorld(
  fetch_impl: typeof fetch = globalThis.fetch,
  base_url: string | null = syncUrl(),
): Promise<World | null> {
  if (!base_url) return null;
  try {
    const res = await fetch_impl(`${base_url}/world`);
    if (!res.ok) return null;
    const body = (await res.json()) as World;
    return Array.isArray(body?.find) ? body : null;
  } catch {
    return null;
  }
}
