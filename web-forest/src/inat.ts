import { DEMO_PIN, species } from "./data.ts";
import { matchCampus } from "./inat-match.ts";
import { credentialOf, syncRouteOf } from "./sync.ts";

export interface InatNearby {
  observation_id: number;
  common_name: string;
  scientific_name: string;
  quality_grade: string;
  observed_on: string | null;
  url: string;
  is_campus_species: boolean;
}

export type InatNearbyState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; nearby: InatNearby[]; fetched_at: number }
  | { status: "empty" }
  | { status: "offline" };

export interface InatSuggestion {
  taxon_id: number | null;
  scientific_name: string;
  common_name: string;
  score: number;
  /** 1-based position in iNat's list. Not the taxonomic rank — see taxon_rank. */
  rank: number;
  /** "species", "genus", "family"… as iNat sent it; null when absent. */
  taxon_rank: string | null;
  /** iNat lineage, root first. Empty when the response carried none. */
  ancestor_ids: number[];
}

/** Which road the photo took: the server proxy, or a dev-only direct call. */
export type IdentifyVia = "proxy" | "direct";

/**
 * Why the recorded demo is on screen instead of a live answer. `no_proxy`: no
 * identify server answered at all (a 404, a dev proxy's 502, unreachable) —
 * not the same as a server that answered but holds no token.
 */
export type DemoReason = "needs_token" | "token_expired" | "no_proxy";

export type InatIdentifyState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; suggestion: InatSuggestion[]; via: IdentifyVia }
  | { status: "empty" }
  | { status: "offline" }
  | { status: "needs_token" }
  /** No identify server answered: HTTP status it got instead, or null when unreachable. */
  | { status: "no_proxy"; http_status: number | null }
  /** iNat refused the server's token. iNat API tokens last 24 hours. */
  | { status: "token_expired" }
  | { status: "rate_limited" }
  /** Recorded iNat response replayed on stage. Never a live read of the photo. */
  | { status: "demo"; suggestion: InatSuggestion[]; reason: DemoReason; http_status?: number | null };

export interface InatObservation {
  id?: number;
  quality_grade?: string;
  observed_on?: string | null;
  uri?: string;
  taxon?: InatTaxon | null;
}

interface InatTaxon {
  id?: number;
  name?: string;
  preferred_common_name?: string;
  rank?: string;
}

interface InatList {
  /** Upstream iNat key is plural `results`. Map it; do not keep that name on our types. */
  results?: InatObservation[];
}

const CACHE_KEY = "fg_inat_nearby_v1";
const CACHE_TTL_MS = 30 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
const RADIUS_KM = 1;
const SHOW_COUNT = 5;
const SUGGEST_COUNT = 10;
const VIA = "yclap-field-guide/0.1 (Youth CLAP Ateneo CCC; local PWA)";
const OBSERVATION_URL = "https://api.inaturalist.org/v1/observations";
const SCORE_IMAGE_URL = "https://api.inaturalist.org/v1/computervision/score_image";
/** The proxy (worker/inat.ts), on the sync base. Holds the token so the bundle never does. */
export const IDENTIFY_PATH = "/inat/identify";
export const TOKEN_URL = "https://www.inaturalist.org/users/api_token";

const campus_scientific = Object.values(species).map((s) => s.scientific_name.toLowerCase());

function isCampusSpecies(scientific_name: string): boolean {
  const n = scientific_name.toLowerCase();
  return campus_scientific.some((c) => n === c || n.startsWith(c + " "));
}

interface CacheBlob {
  fetched_at: number;
  nearby: InatNearby[];
}

function readCache(now: number): CacheBlob | null {
  try {
    const storage = globalThis.sessionStorage;
    if (!storage) return null;
    const raw = storage.getItem(CACHE_KEY);
    if (!raw) return null;
    const blob = JSON.parse(raw) as CacheBlob;
    if (!blob.fetched_at || !Array.isArray(blob.nearby)) return null;
    if (now - blob.fetched_at > CACHE_TTL_MS) return null;
    return blob;
  } catch {
    return null;
  }
}

function writeCache(nearby: InatNearby[], now: number): void {
  try {
    const storage = globalThis.sessionStorage;
    if (!storage) return;
    const blob: CacheBlob = { fetched_at: now, nearby };
    storage.setItem(CACHE_KEY, JSON.stringify(blob));
  } catch {
    /* quota / private mode / Node */
  }
}

/** JSON → nearby row. Campus scientific names first, unique taxa, cap of five. */
export function mapNearbyObservation(row: InatObservation[]): InatNearby[] {
  const seen_taxon = new Set<string>();
  const mapped: InatNearby[] = [];
  for (const obs of row) {
    const taxon = obs.taxon;
    const scientific_name = taxon?.name?.trim();
    if (!obs.id || !scientific_name) continue;
    const taxon_key = String(taxon?.id ?? scientific_name.toLowerCase());
    if (seen_taxon.has(taxon_key)) continue;
    seen_taxon.add(taxon_key);
    mapped.push({
      observation_id: obs.id,
      common_name: taxon?.preferred_common_name?.trim() || scientific_name,
      scientific_name,
      quality_grade: obs.quality_grade ?? "unknown",
      observed_on: obs.observed_on ?? null,
      url: obs.uri || `https://www.inaturalist.org/observations/${obs.id}`,
      is_campus_species: isCampusSpecies(scientific_name),
    });
  }
  mapped.sort((a, b) => {
    if (a.is_campus_species !== b.is_campus_species) return a.is_campus_species ? -1 : 1;
    const a_rg = a.quality_grade === "research" ? 0 : 1;
    const b_rg = b.quality_grade === "research" ? 0 : 1;
    return a_rg - b_rg;
  });
  return mapped.slice(0, SHOW_COUNT);
}

export function inatExploreUrl(): string {
  return `https://www.inaturalist.org/observations?lat=${DEMO_PIN.lat}&lng=${DEMO_PIN.lon}&radius=${RADIUS_KM}&place_id=any&iconic_taxa=Plantae`;
}

export function nearbyObservationUrl(): string {
  const param = new URLSearchParams({
    lat: String(DEMO_PIN.lat),
    lng: String(DEMO_PIN.lon),
    radius: String(RADIUS_KM),
    iconic_taxa: "Plantae",
    per_page: "40",
    order_by: "observed_on",
    order: "desc",
    photos: "true",
  });
  return `${OBSERVATION_URL}?${param.toString()}`;
}

export function scoreImageUrl(): string {
  return SCORE_IMAGE_URL;
}

export async function loadInatNearby(io?: {
  fetch?: typeof fetch;
  now?: () => number;
}): Promise<InatNearbyState> {
  const now = io?.now ?? Date.now;
  const fetch_impl = io?.fetch ?? globalThis.fetch;
  const cached = readCache(now());
  if (cached) {
    return cached.nearby.length
      ? { status: "ready", nearby: cached.nearby, fetched_at: cached.fetched_at }
      : { status: "empty" };
  }

  const url = nearbyObservationUrl();
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const header = new Headers();
    header.set("Accept", "application/json");
    header.set("X-Via", VIA);
    const res = await fetch_impl(url, { method: "GET", headers: header, signal: controller.signal });
    if (!res.ok) return { status: "offline" };
    const body = (await res.json()) as InatList;
    const nearby = mapNearbyObservation(body.results ?? []);
    const fetched_at = now();
    writeCache(nearby, fetched_at);
    return nearby.length ? { status: "ready", nearby, fetched_at } : { status: "empty" };
  } catch {
    return { status: "offline" };
  } finally {
    globalThis.clearTimeout(timer);
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function numericScore(row: Record<string, unknown>): number | null {
  for (const key of ["combined_score", "score", "vision_score"] as const) {
    const n = Number(row[key]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** iNat sends `ancestor_ids`, or only the `ancestry` "48460/47126/…" string. */
function ancestorIds(taxon: Record<string, unknown> | null): number[] {
  if (Array.isArray(taxon?.ancestor_ids)) {
    return taxon.ancestor_ids.filter((n): n is number => typeof n === "number");
  }
  if (typeof taxon?.ancestry === "string") {
    return taxon.ancestry.split("/").map(Number).filter((n) => Number.isInteger(n) && n > 0);
  }
  return [];
}

/** iNat CV JSON → suggestion list. Reads taxon.name; does not invent taxa. */
export function mapScoreImage(body: unknown): InatSuggestion[] {
  const root = asRecord(body);
  const row = Array.isArray(root?.results) ? root.results : Array.isArray(body) ? body : [];
  const suggestion: InatSuggestion[] = [];
  let rank = 0;
  for (const item of row) {
    const rec = asRecord(item);
    if (!rec) continue;
    const taxon = asRecord(rec.taxon);
    const scientific_name = typeof taxon?.name === "string" ? taxon.name.trim() : "";
    if (!scientific_name) continue;
    const score = numericScore(rec);
    if (score === null) continue;
    rank += 1;
    const common =
      typeof taxon?.preferred_common_name === "string" && taxon.preferred_common_name.trim()
        ? taxon.preferred_common_name.trim()
        : scientific_name;
    const taxon_id = typeof taxon?.id === "number" ? taxon.id : null;
    const taxon_rank = typeof taxon?.rank === "string" ? taxon.rank : null;
    suggestion.push({
      taxon_id,
      scientific_name,
      common_name: common,
      score,
      rank,
      taxon_rank,
      ancestor_ids: ancestorIds(taxon),
    });
    if (suggestion.length >= SUGGEST_COUNT) break;
  }
  return suggestion;
}

/**
 * The client-side token, for `npm run dev` ONLY. Vite inlines VITE_* vars into
 * the bundle, which is how the 09-23 dist ended up carrying a live token. In a
 * build `import.meta.env.DEV` is the literal `false`, so this read folds away
 * and the string never reaches dist/. Production goes through the proxy.
 */
function devToken(): string | undefined {
  try {
    const token: unknown = import.meta.env.DEV ? import.meta.env.VITE_INAT_API_TOKEN : undefined;
    return typeof token === "string" && token.trim() ? token.trim() : undefined;
  } catch {
    return undefined; /* Node: no import.meta.env */
  }
}

function readToken(explicit?: string): string | undefined {
  const from_arg = explicit?.trim();
  if (from_arg) return from_arg;
  const dev_token = devToken();
  if (dev_token) return dev_token;
  try {
    const env_token = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      ?.env?.INAT_API_TOKEN;
    if (env_token?.trim()) return env_token.trim();
  } catch {
    /* no process */
  }
  return undefined;
}

function asBlob(image: Blob | ArrayBuffer | Uint8Array, filename: string): Blob {
  const type = filename.endsWith(".jpg") || filename.endsWith(".jpeg") ? "image/jpeg" : "image/png";
  if (image instanceof Blob) return image;
  if (image instanceof Uint8Array) {
    const copy = Uint8Array.from(image);
    return new Blob([copy.buffer], { type });
  }
  return new Blob([image], { type });
}

export async function scorePlantImage(input: {
  image: Blob | ArrayBuffer | Uint8Array;
  filename?: string;
  token?: string;
  fetch?: typeof fetch;
  lat?: number;
  lng?: number;
}): Promise<InatIdentifyState> {
  const token = readToken(input.token);
  if (!token) return { status: "needs_token" };

  const filename = input.filename ?? "plant.png";
  const form = new FormData();
  form.append("image", asBlob(input.image, filename), filename);
  form.append("lat", String(input.lat ?? DEMO_PIN.lat));
  form.append("lng", String(input.lng ?? DEMO_PIN.lon));

  const fetch_impl = input.fetch ?? globalThis.fetch;
  const header = new Headers();
  header.set("Accept", "application/json");
  header.set("Authorization", token);
  header.set("X-Via", VIA);

  try {
    const res = await fetch_impl(SCORE_IMAGE_URL, { method: "POST", headers: header, body: form });
    if (res.status === 401 || res.status === 403) return { status: "token_expired" };
    if (res.status === 429) return { status: "rate_limited" };
    if (!res.ok) return { status: "offline" };
    const body: unknown = await res.json();
    const suggestion = mapScoreImage(body);
    return suggestion.length ? { status: "ready", suggestion, via: "direct" } : { status: "empty" };
  } catch {
    return { status: "offline" };
  }
}

/**
 * What the proxy said, or null when nothing that looks like the proxy answered
 * (a static host's 404, Vite's 502 with no sync server running, an HTML page).
 * `needs_token` from the proxy comes back as needs_token: the proxy exists but
 * holds no token.
 */
async function readProxy(res: Response): Promise<InatIdentifyState | null> {
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return null;
  }
  const rec = asRecord(body);
  if (res.ok && rec && Array.isArray(rec.results)) {
    const suggestion = mapScoreImage(body);
    return suggestion.length ? { status: "ready", suggestion, via: "proxy" } : { status: "empty" };
  }
  const error = typeof rec?.error === "string" ? rec.error : "";
  if (error === "token_expired") return { status: "token_expired" };
  if (error === "rate_limited") return { status: "rate_limited" };
  if (error === "upstream" || error === "upstream_unreachable") return { status: "offline" };
  if (error === "needs_token") return { status: "needs_token" };
  return null;
}

function isOffline(): boolean {
  const nav = (globalThis as { navigator?: { onLine?: boolean } }).navigator;
  return nav?.onLine === false;
}

/**
 * The app's identify call. Proxy first, so the token stays on the server. If no
 * proxy answers: a dev-only direct call with VITE_INAT_API_TOKEN. Else
 * needs_token, which the camera sheet turns into the labelled recorded demo.
 */
export async function identifyPlant(input: {
  image: Blob | ArrayBuffer | Uint8Array;
  filename?: string;
  /** Direct-call token. Tests only; the app passes none. */
  token?: string;
  fetch?: typeof fetch;
  lat?: number;
  lng?: number;
}): Promise<InatIdentifyState> {
  const filename = input.filename ?? "plant.jpg";
  const fetch_impl = input.fetch ?? globalThis.fetch;
  const form = new FormData();
  form.append("image", asBlob(input.image, filename), filename);
  form.append("lat", String(input.lat ?? DEMO_PIN.lat));
  form.append("lng", String(input.lng ?? DEMO_PIN.lon));

  /* Same base as sign-in: a Path A build posts to the sync server's proxy. */
  const route = syncRouteOf(IDENTIFY_PATH);
  let is_unreachable = false;
  let http_status: number | null = null;
  let is_needs_token = false;
  try {
    const res = await fetch_impl(route.url, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: form,
      credentials: credentialOf(route),
    });
    http_status = res.status;
    const verdict = await readProxy(res);
    if (verdict?.status === "needs_token") is_needs_token = true;
    else if (verdict) return verdict;
  } catch {
    is_unreachable = true;
  }
  if (is_unreachable && isOffline()) return { status: "offline" };
  if (readToken(input.token)) return scorePlantImage({ ...input, filename, fetch: fetch_impl });
  /* Only a proxy that said so is blamed on a missing token; a 404 or an
     unreachable server is named as what it was. */
  return is_needs_token ? { status: "needs_token" } : { status: "no_proxy", http_status };
}

/**
 * The campus species a suggestion lands on EXACTLY, by taxon id and ancestry
 * (see inat-match.ts). Null for a genus/family roll-up or no match.
 */
export function campusCodeForSuggestion(row: InatSuggestion): string | null {
  const match = matchCampus(row);
  return match && !match.is_partial && match.species_code.length === 1 ? match.species_code[0]! : null;
}

/** Match an iNat suggestion to a curated campus species_code, if any. */
export function campusCodeForScientific(scientific_name: string): string | null {
  const n = scientific_name.toLowerCase();
  for (const [species_code, row] of Object.entries(species)) {
    const c = row.scientific_name.toLowerCase();
    if (n === c || n.startsWith(c + " ")) return species_code;
  }
  return null;
}

/** True when this DEV build carries a direct CV token. Always false in a production build. */
export function hasInatToken(): boolean {
  return Boolean(readToken());
}

/**
 * Top-3 in the shape of POST /v1/computervision/score_image for a Pterocarpus
 * indicus photo (observation 36874701). Replayed only when live identification
 * is unavailable, and always labelled on screen as a recorded response — it is
 * not an identification of the photo in the viewfinder. Taxon ids re-checked
 * against /v1/taxa on 2026-09-25 (Samanea saman is 281371; 47122 is Fabaceae).
 */
const DEMO_SCORE_BODY = {
  results: [
    {
      combined_score: 0.9124,
      taxon: { id: 348101, name: "Pterocarpus indicus", preferred_common_name: "Narra", rank: "species" },
    },
    {
      combined_score: 0.0412,
      taxon: { id: 68662, name: "Pterocarpus", preferred_common_name: "Bloodwood", rank: "genus" },
    },
    {
      combined_score: 0.0189,
      taxon: { id: 281371, name: "Samanea saman", preferred_common_name: "Rain Tree", rank: "species" },
    },
  ],
};

export function demoIdentify(reason: DemoReason = "needs_token", http_status: number | null = null): InatIdentifyState {
  const suggestion = mapScoreImage(DEMO_SCORE_BODY);
  return suggestion.length ? { status: "demo", suggestion, reason, http_status } : { status: "empty" };
}
