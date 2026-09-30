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
/* v2 stores the licence with each url; a v1 entry had none, so it is not trusted. */
const CACHE_KEY = "fg_portrait_v2";
const FETCH_TIMEOUT_MS = 8000;

/**
 * A photo, and whose it is. iNaturalist photos keep their photographer's
 * licence — CC0, CC BY variants, or all rights reserved (`licence_code` null) —
 * and the app must honour it (docs/brainstorm/magisphere-institution, risk 4).
 */
export interface Portrait {
  url: string;
  /** iNaturalist `license_code`, e.g. "cc0", "cc-by", "cc-by-nc"; null = all rights reserved. */
  licence_code: string | null;
  /** iNaturalist's own attribution line, shown on the photo and in Settings → Photo credits. */
  attribution: string;
}

/**
 * Licences a photo may carry to be shown here at all.
 *
 * All rights reserved is never shown: nobody gave permission. No-derivatives
 * (…-nd) is left out too, because every portrait is a circle crop. The
 * non-commercial licences are fine while the deployment is free — the Ateneo
 * pilot is — and drop out the moment `IS_COMMERCIAL_DEPLOYMENT` is true.
 */
const LICENCE_OPEN = new Set(["cc0", "cc-by", "cc-by-sa"]);
const LICENCE_NON_COMMERCIAL = new Set(["cc-by-nc", "cc-by-nc-sa"]);
export const IS_COMMERCIAL_DEPLOYMENT = false;

export function isPhotoLicenceAllowed(licence_code: string | null | undefined, is_commercial = IS_COMMERCIAL_DEPLOYMENT): boolean {
  const code = (licence_code ?? "").toLowerCase();
  if (LICENCE_OPEN.has(code)) return true;
  return !is_commercial && LICENCE_NON_COMMERCIAL.has(code);
}

/**
 * iNat default photos for the curated species, with the licence and
 * attribution iNaturalist reported on 2026-10-01 (`/v1/taxa`, default_photo).
 * Two seeds were dropped that day: Teak's was all rights reserved and Dao's
 * was CC BY-NC-ND; both draw their botanical sketch instead.
 */
export const PORTRAIT_SEED: Record<string, Portrait> = {
  "pterocarpus indicus": { url: "https://inaturalist-open-data.s3.amazonaws.com/photos/65718753/medium.jpeg", licence_code: "cc0", attribution: "no rights reserved, uploaded by 葉子" },
  "vitex parviflora": { url: "https://inaturalist-open-data.s3.amazonaws.com/photos/577809093/medium.jpg", licence_code: "cc-by", attribution: "(c) Kevin Faccenda, some rights reserved (CC BY), uploaded by Kevin Faccenda" },
  "dillenia philippinensis": { url: "https://inaturalist-open-data.s3.amazonaws.com/photos/459792942/medium.jpg", licence_code: "cc-by-nc", attribution: "(c) lenisutcliffe, some rights reserved (CC BY-NC)" },
  "swietenia macrophylla": { url: "https://inaturalist-open-data.s3.amazonaws.com/photos/38634940/medium.jpeg", licence_code: "cc0", attribution: "no rights reserved, uploaded by 葉子" },
  "samanea saman": { url: "https://inaturalist-open-data.s3.amazonaws.com/photos/58693810/medium.jpeg", licence_code: "cc0", attribution: "no rights reserved, uploaded by 葉子" },
  "ficus sp.": { url: "https://inaturalist-open-data.s3.amazonaws.com/photos/68686046/medium.jpeg", licence_code: "cc0", attribution: "no rights reserved, uploaded by 葉子" },
  "ficus benjamina": { url: "https://inaturalist-open-data.s3.amazonaws.com/photos/68686046/medium.jpeg", licence_code: "cc0", attribution: "no rights reserved, uploaded by 葉子" },
  "vitex negundo": { url: "https://inaturalist-open-data.s3.amazonaws.com/photos/80459619/medium.jpeg", licence_code: "cc0", attribution: "no rights reserved, uploaded by 葉子" },
};

/** Every credit this phone has shown, by URL — Settings → Photo credits lists them. */
const credit = new Map<string, Portrait>(Object.values(PORTRAIT_SEED).map((p) => [p.url, p]));

export function portraitCreditOf(url: string | null | undefined): Portrait | null {
  if (!url) return null;
  return credit.get(url) ?? null;
}

export function photoCreditList(): Portrait[] {
  return [...credit.values()];
}

const memory = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

export function portraitKey(scientific_name: string): string {
  return scientific_name.trim().toLowerCase();
}

export function seededPortrait(scientific_name: string): string | null {
  return PORTRAIT_SEED[portraitKey(scientific_name)]?.url ?? null;
}

/** The photo URL known right now without a round trip — seeded or cached — else null. */
export function knownPortrait(scientific_name: string): string | null {
  const name = scientific_name.trim();
  if (!name) return null;
  return PORTRAIT_SEED[portraitKey(name)]?.url ?? readCache(portraitKey(name));
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

/**
 * JSON → first exact-name photo, else the first photoed result — skipping any
 * photo whose licence may not be shown here (`isPhotoLicenceAllowed`). A photo
 * with no licence field at all counts as all rights reserved.
 */
export function mapTaxonPhoto(body: unknown, scientific_name: string, is_commercial = IS_COMMERCIAL_DEPLOYMENT): Portrait | null {
  const root = asRecord(body);
  const row = Array.isArray(root?.results) ? root.results : [];
  const want = portraitKey(scientific_name);
  let fallback: Portrait | null = null;
  for (const item of row) {
    const rec = asRecord(item);
    if (!rec) continue;
    const name = typeof rec.name === "string" ? portraitKey(rec.name) : "";
    const photo = asRecord(rec.default_photo);
    const url = photoUrlOf(photo);
    if (!url || !photo) continue;
    const licence_code = typeof photo.license_code === "string" ? photo.license_code : null;
    if (!isPhotoLicenceAllowed(licence_code, is_commercial)) continue;
    const portrait: Portrait = {
      url,
      licence_code,
      attribution: typeof photo.attribution === "string" ? photo.attribution : "",
    };
    if (name === want) return portrait;
    if (!fallback) fallback = portrait;
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
    const hit = asRecord(blob[key]);
    const url = hit?.url;
    if (typeof url === "string" && url.startsWith("https://") && isPhotoLicenceAllowed(hit?.licence_code as string | null)) {
      credit.set(url, { url, licence_code: (hit?.licence_code as string | null) ?? null, attribution: String(hit?.attribution ?? "") });
      memory.set(key, url);
      return url;
    }
  } catch {
    /* quota / private / Node */
  }
  return null;
}

function writeCache(key: string, portrait: Portrait): void {
  const { url } = portrait;
  credit.set(url, portrait);
  memory.set(key, url);
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    const raw = storage.getItem(CACHE_KEY);
    const blob = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    blob[key] = portrait;
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
  const seeded = PORTRAIT_SEED[key]?.url;
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
      const portrait = mapTaxonPhoto(await res.json(), name);
      if (portrait) writeCache(key, portrait);
      else memory.set(key, null);
      return portrait?.url ?? null;
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
