/**
 * Close-up portraits for nearby + log.
 *
 * Prefer iNaturalist default taxon photos (a real leaf / bark / crown) over
 * our schematic drawings. The curated nine are seeded so the picker paints
 * without a round trip. Everything else resolves through /v1/taxa and stays
 * in localStorage so a second walk on the same phone is instant.
 *
 * Balete is recorded as `Ficus sp.` — there is no one species to fetch, so
 * the seed uses a Weeping fig close-up as a genus stand-in, not a claim that
 * the campus tree is Ficus benjamina.
 */

const VIA = "yclap-field-guide/0.1 (Youth CLAP Ateneo CCC; local PWA)";
const TAXA_URL = "https://api.inaturalist.org/v1/taxa";
const CACHE_KEY = "fg_portrait_v1";
const FETCH_TIMEOUT_MS = 8000;

/** iNat medium default photos, keyed by lowercase scientific_name. */
export const PORTRAIT_SEED: Record<string, string> = {
  "pterocarpus indicus": "https://inaturalist-open-data.s3.amazonaws.com/photos/65718753/medium.jpeg",
  "vitex parviflora": "https://inaturalist-open-data.s3.amazonaws.com/photos/577809093/medium.jpg",
  "dillenia philippinensis": "https://inaturalist-open-data.s3.amazonaws.com/photos/459792942/medium.jpg",
  "dracontomelon dao": "https://inaturalist-open-data.s3.amazonaws.com/photos/101351496/medium.jpg",
  "swietenia macrophylla": "https://inaturalist-open-data.s3.amazonaws.com/photos/38634940/medium.jpeg",
  "samanea saman": "https://inaturalist-open-data.s3.amazonaws.com/photos/58693810/medium.jpeg",
  "tectona grandis": "https://static.inaturalist.org/photos/88386046/medium.jpg",
  "ficus sp.": "https://inaturalist-open-data.s3.amazonaws.com/photos/68686046/medium.jpeg",
  "ficus benjamina": "https://inaturalist-open-data.s3.amazonaws.com/photos/68686046/medium.jpeg",
  "vitex negundo": "https://inaturalist-open-data.s3.amazonaws.com/photos/80459619/medium.jpeg",
};

const memory = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

export function portraitKey(scientific_name: string): string {
  return scientific_name.trim().toLowerCase();
}

export function seededPortrait(scientific_name: string): string | null {
  return PORTRAIT_SEED[portraitKey(scientific_name)] ?? null;
}

/** The photo URL known right now without a round trip — seeded or cached — else null. */
export function knownPortrait(scientific_name: string): string | null {
  const name = scientific_name.trim();
  if (!name) return null;
  return PORTRAIT_SEED[portraitKey(name)] ?? readCache(portraitKey(name));
}

export function taxaPortraitUrl(scientific_name: string): string {
  const param = new URLSearchParams({
    q: scientific_name.trim(),
    rank: "species",
    per_page: "5",
    is_active: "true",
  });
  return `${TAXA_URL}?${param.toString()}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function photoUrlOf(photo: unknown): string | null {
  const rec = asRecord(photo);
  if (!rec) return null;
  for (const key of ["medium_url", "square_url", "url"] as const) {
    const url = rec[key];
    if (typeof url === "string" && url.startsWith("https://")) return url;
  }
  return null;
}

/** JSON → first exact-name photo, else the first photoed result. */
export function mapTaxonPhoto(body: unknown, scientific_name: string): string | null {
  const root = asRecord(body);
  const row = Array.isArray(root?.results) ? root.results : [];
  const want = portraitKey(scientific_name);
  let fallback: string | null = null;
  for (const item of row) {
    const rec = asRecord(item);
    if (!rec) continue;
    const name = typeof rec.name === "string" ? portraitKey(rec.name) : "";
    const url = photoUrlOf(rec.default_photo);
    if (!url) continue;
    if (name === want) return url;
    if (!fallback) fallback = url;
  }
  return fallback;
}

function readCache(key: string): string | null {
  const hit = memory.get(key);
  if (hit !== undefined) return hit;
  try {
    const raw = globalThis.localStorage?.getItem(CACHE_KEY);
    if (!raw) return null;
    const blob = JSON.parse(raw) as Record<string, unknown>;
    const url = blob[key];
    if (typeof url === "string" && url.startsWith("https://")) {
      memory.set(key, url);
      return url;
    }
  } catch {
    /* quota / private / Node */
  }
  return null;
}

function writeCache(key: string, url: string): void {
  memory.set(key, url);
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    const raw = storage.getItem(CACHE_KEY);
    const blob = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    blob[key] = url;
    storage.setItem(CACHE_KEY, JSON.stringify(blob));
  } catch {
    /* quota / private / Node */
  }
}

export async function loadTaxonPortrait(
  scientific_name: string,
  io?: { fetch?: typeof fetch },
): Promise<string | null> {
  const name = scientific_name.trim();
  if (!name) return null;
  const key = portraitKey(name);
  const seeded = PORTRAIT_SEED[key];
  if (seeded) {
    memory.set(key, seeded);
    return seeded;
  }
  const cached = readCache(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;

  const fetch_impl = io?.fetch ?? globalThis.fetch;
  const work = (async () => {
    const controller = new AbortController();
    const timer = globalThis.setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const header = new Headers();
      header.set("Accept", "application/json");
      header.set("X-Via", VIA);
      const res = await fetch_impl(taxaPortraitUrl(name), {
        method: "GET",
        headers: header,
        signal: controller.signal,
      });
      if (!res.ok) {
        memory.set(key, null);
        return null;
      }
      const url = mapTaxonPhoto(await res.json(), name);
      if (url) writeCache(key, url);
      else memory.set(key, null);
      return url;
    } catch {
      memory.set(key, null);
      return null;
    } finally {
      globalThis.clearTimeout(timer);
      inflight.delete(key);
    }
  })();

  inflight.set(key, work);
  return work;
}
