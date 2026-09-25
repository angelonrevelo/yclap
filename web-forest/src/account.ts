/**
 * Client side of accounts: fetch wrappers over /auth/* and /account/save, one
 * module-level state that the Settings panel and the HUD chip both read, and
 * the merge-on-sign-in that pulls the account's save onto this device.
 *
 * The session is an HttpOnly cookie — this file never sees the token. Every
 * call goes to the sync base (`syncRouteOf`), with credentials when that is
 * another origin than the page.
 * Photos stay on the device; only journal rows and the point ledger sync.
 */
import { useEffect, useSyncExternalStore } from "react";
import {
  SAVE_PROTOCOL,
  SAVE_PROTOCOL_HEADER,
  reconcileSave,
  type AccountSave,
  type PublicAccount,
} from "./account-core.ts";
import { readSighting, writeSighting, type Sighting } from "./journal.ts";
import { readPointEvents, writePointEvents, type PointEvent } from "./gamify.ts";
import { credentialOf, syncRouteOf } from "./sync.ts";

/** Fired on window after a sync wrote new rows into this device's storage. */
export const SAVE_MERGED_EVENT = "magisphere:save-merged";

export interface SyncReport {
  at: string;
  added_sighting_count: number;
  added_point_count: number;
  sighting_count: number;
}

export interface AccountState {
  status: "loading" | "signed_out" | "signed_in" | "offline";
  account: PublicAccount | null;
  /** Google sign-in is configured on the server. */
  is_google: boolean;
  is_syncing: boolean;
  last_sync: SyncReport | null;
  error: string | null;
}

let state: AccountState = {
  status: "loading",
  account: null,
  is_google: false,
  is_syncing: false,
  last_sync: null,
  error: null,
};
const listener = new Set<() => void>();
let is_started = false;

function set(patch: Partial<AccountState>): void {
  state = { ...state, ...patch };
  for (const fn of listener) fn();
}

/** First reader to mount asks the server who is signed in; later ones share it. */
function startAccount(): void {
  if (is_started) return;
  is_started = true;
  void refreshAccount();
}

export function useAccount(): AccountState {
  const snap = useSyncExternalStore(
    (fn) => {
      listener.add(fn);
      return () => listener.delete(fn);
    },
    () => state,
  );
  useEffect(() => startAccount(), []);
  return snap;
}

async function call<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<{ status: number; data: T; protocol: string | null }> {
  /* Same base as the campus world: a Path A build (page on :4177, VITE_SYNC_URL
     naming :8788) signs in on the sync server, cookie included. */
  const route = syncRouteOf(path);
  const res = await fetch(route.url, {
    method,
    credentials: credentialOf(route),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = {} as T;
  try {
    data = (await res.json()) as T;
  } catch {
    /* 502 from the dev proxy when the sync server is not running, etc. */
  }
  return { status: res.status, data, protocol: res.headers.get(SAVE_PROTOCOL_HEADER) };
}

type ErrorBody = { error?: string };

export async function refreshAccount(): Promise<void> {
  try {
    const { status, data } = await call<{ account: PublicAccount | null; is_google: boolean }>("/auth/me");
    if (status !== 200 || !("account" in data)) {
      set({ status: "offline", error: "The account server is not reachable right now." });
      return;
    }
    set({
      status: data.account ? "signed_in" : "signed_out",
      account: data.account,
      is_google: !!data.is_google,
      error: null,
    });
    if (data.account) await syncSave();
  } catch {
    set({ status: "offline", error: "The account server is not reachable right now." });
  }
}

async function signedIn(status: number, data: { account?: PublicAccount } & ErrorBody): Promise<string | null> {
  if ((status === 200 || status === 201) && data.account) {
    set({ status: "signed_in", account: data.account, error: null });
    await syncSave();
    return null;
  }
  return data.error ?? `Something went wrong (HTTP ${status}).`;
}

/** Returns an error sentence, or null on success. */
export async function signUp(username: string, password: string, display_name: string): Promise<string | null> {
  try {
    const { status, data } = await call<{ account?: PublicAccount } & ErrorBody>("/auth/signup", "POST", {
      username,
      password,
      display_name,
    });
    return await signedIn(status, data);
  } catch {
    return "The account server is not reachable right now.";
  }
}

export async function logIn(username: string, password: string): Promise<string | null> {
  try {
    const { status, data } = await call<{ account?: PublicAccount } & ErrorBody>("/auth/login", "POST", {
      username,
      password,
    });
    return await signedIn(status, data);
  } catch {
    return "The account server is not reachable right now.";
  }
}

export async function logOut(): Promise<void> {
  try {
    await call("/auth/logout", "POST", {});
  } finally {
    set({ status: "signed_out", account: null, last_sync: null });
  }
}

export async function changePassword(old_password: string, new_password: string): Promise<string | null> {
  try {
    const { status, data } = await call<ErrorBody>("/auth/password", "POST", { old_password, new_password });
    if (status === 200) {
      await refreshAccount();
      return null;
    }
    return data.error ?? `Something went wrong (HTTP ${status}).`;
  } catch {
    return "The account server is not reachable right now.";
  }
}

export const GOOGLE_HREF = "/auth/google";

function localSave(): AccountSave {
  return { sighting: readSighting(), point_event: readPointEvents() };
}

/** The sentence the Settings panel shows when the server speaks another save protocol. */
export const UPDATE_AVAILABLE = "Update available — reload";

/**
 * The server named a save protocol (`X-Save-Protocol`) other than this
 * build's SAVE_PROTOCOL: this tab is running another build than the server.
 * No header (an older server, a proxy that dropped it) is not a mismatch —
 * only a number the server actually sent can say so.
 */
export function isProtocolMismatch(server_protocol: string | null): boolean {
  return server_protocol !== null && server_protocol.trim() !== String(SAVE_PROTOCOL);
}

/** "Update available — reload" on a protocol mismatch; otherwise "Sync failed: …". */
export function syncErrorOf(error: unknown, server_protocol: string | null): string {
  if (isProtocolMismatch(server_protocol)) return UPDATE_AVAILABLE;
  return `Sync failed: ${error instanceof Error ? error.message : String(error)}`;
}

/**
 * Pull the account's save, union it into this device (never dropping a local
 * find), then push the union back up naming the server stamp it read. If
 * another phone wrote in between, the server answers 409 with what it now
 * holds; that is merged in the same way and pushed once more. This device's
 * clock is never sent — the server stamps every save itself.
 */
export async function syncSave(): Promise<SyncReport | null> {
  if (state.status !== "signed_in" || state.is_syncing) return null;
  set({ is_syncing: true });
  /* Every account answer names the server's save protocol. If it is not this
     build's, this tab is another build than the server: nothing is pushed (the
     server may not read this build's save the same way), and the panel says
     "Update available — reload" — reloading fixes it, retrying never would. */
  let server_protocol: string | null = null;
  const noteProtocol = <T extends { protocol: string | null }>(answer: T): T => {
    server_protocol = answer.protocol ?? server_protocol;
    if (isProtocolMismatch(server_protocol)) throw new Error(`save protocol ${server_protocol}, this build speaks ${SAVE_PROTOCOL}`);
    return answer;
  };
  try {
    const done = await reconcileSave(
      {
        get: async () => noteProtocol(await call("/account/save")),
        put: async (body) => noteProtocol(await call("/account/save", "PUT", body)),
      },
      localSave,
      (save) => {
        writeSighting(save.sighting);
        writePointEvents(save.point_event);
        window.dispatchEvent(new Event(SAVE_MERGED_EVENT));
      },
    );
    const report: SyncReport = {
      at: new Date().toISOString(),
      added_sighting_count: done.added_sighting_count,
      added_point_count: done.added_point_count,
      sighting_count: done.sighting_count,
    };
    set({ is_syncing: false, last_sync: report, error: null });
    return report;
  } catch (e) {
    set({ is_syncing: false, error: syncErrorOf(e, server_protocol) });
    return null;
  }
}

/**
 * The app's one hook into accounts: re-read storage after a sync merged rows
 * in, and push new local finds up a few seconds after they are made. A no-op
 * while nobody is signed in.
 */
export function useAccountSync(
  sighting_count: number,
  point_count: number,
  setSighting: (row: Sighting[]) => void,
  setPointEvent: (row: PointEvent[]) => void,
): void {
  useEffect(() => {
    const reload = () => {
      setSighting(readSighting());
      setPointEvent(readPointEvents());
    };
    window.addEventListener(SAVE_MERGED_EVENT, reload);
    return () => window.removeEventListener(SAVE_MERGED_EVENT, reload);
  }, [setSighting, setPointEvent]);
  useEffect(() => {
    if (state.status !== "signed_in") return;
    const t = setTimeout(() => void syncSave(), 4000);
    return () => clearTimeout(t);
  }, [sighting_count, point_count]);
}
