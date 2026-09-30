/**
 * POST /inat/identify — the iNaturalist computer-vision proxy.
 *
 * The browser sends a photo here; this forwards it to iNat's score_image with
 * the INAT_API_TOKEN secret and hands back iNat's JSON unchanged. The token
 * lives on the server (a `wrangler secret`, or the env of the LAN sync
 * server) and never ships in the bundle.
 *
 * Web-standard Request/Response only, so the Worker, server/sync-server.mjs and
 * script/smoke-detect.mjs all run this same function.
 *
 * Error contract (JSON `{ error }`), which src/inat.ts reads:
 *   503 needs_token     no INAT_API_TOKEN on this server
 *   401 token_expired   iNat refused the token (its JWTs last 24 h)
 *   429 rate_limited    iNat throttled us
 *   502 upstream        iNat answered with some other failure, or not at all
 *   429 too_many        this IP sent more than IDENTIFY_IP_MAX a minute
 *   403 foreign_origin  the POST came from another site's page
 *   400 / 405 / 413 / 415  bad request from the client
 *
 * Own page only. CORS headers go only to an allowed page on another origin
 * (accountCorsOf, added by the host: the Worker and server/sync-server.mjs),
 * never `*`, so a foreign page cannot READ an answer — but a `no-cors` multipart POST from any site still arrives, so the
 * Origin / Sec-Fetch-Site check (isOwnPage) refuses it before the rate window,
 * the body or the token is touched. The body is counted as it streams and cut
 * at MAX_FORM_BYTE, so a chunked upload with no Content-Length cannot get past
 * the size cap either.
 *
 * `identify_limit` is in memory: on Workers it is per isolate, so the real
 * ceiling is IDENTIFY_IP_MAX × however many isolates Cloudflare runs. It is a
 * brake, not a quota; iNat's own throttle is the hard one.
 */
import { DEMO_PIN } from "../src/data.ts";
import { BodyTooLarge, RateWindow, capStream, clientIp, isOwnPage } from "../src/rate-limit.ts";

export const IDENTIFY_PATH = "/inat/identify";
export const PLANTNET_URL = "https://my-api.plantnet.org/v2/identify/all";
/** Pl@ntNet's free and non-profit plans require this credit wherever a suggestion is shown. */
export const PLANTNET_CREDIT = "powered by Pl@ntNet";

/**
 * Which identify service this server may call, and with what.
 *
 * Since 10-01 the order is Pl@ntNet, then iNaturalist ONLY with written
 * permission. iNaturalist staff say the visual API "is not publicly
 * available" and access is fee-based by arrangement
 * (forum.inaturalist.org/t/hidden-computer-vision-api/41775); a personal
 * token in a campus proxy is not that arrangement. Pl@ntNet publishes a free
 * plan of 500 identifications a day (my.plantnet.org/pricing). With neither,
 * the phone gets `needs_token` and its sheet offers Seek.
 */
export interface IdentifyKey {
  plantnet?: string;
  inat?: string;
  /** INAT_CV_PERMITTED=1: iNaturalist has agreed in writing to this use. */
  is_inat_permitted?: boolean;
}

export function identifyKeyOf(env: { PLANTNET_API_KEY?: string; INAT_API_TOKEN?: string; INAT_CV_PERMITTED?: string }): IdentifyKey {
  return {
    plantnet: env.PLANTNET_API_KEY?.trim() || undefined,
    inat: env.INAT_API_TOKEN?.trim() || undefined,
    is_inat_permitted: env.INAT_CV_PERMITTED === "1",
  };
}

type Provider = { kind: "plantnet"; key: string } | { kind: "inat"; token: string };

/** A bare string is the pre-10-01 contract (an iNat token, used as given) — the tests and the smoke script. */
function providerOf(key: IdentifyKey | string | undefined): Provider | null {
  if (typeof key === "string") return key.trim() ? { kind: "inat", token: key.trim() } : null;
  if (key?.plantnet) return { kind: "plantnet", key: key.plantnet };
  if (key?.inat && key.is_inat_permitted) return { kind: "inat", token: key.inat };
  return null;
}
export const SCORE_IMAGE_URL = "https://api.inaturalist.org/v1/computervision/score_image";
export const TOKEN_URL = "https://www.inaturalist.org/users/api_token";

/** A phone photo re-encoded by the camera sheet is well under this. */
const MAX_IMAGE_BYTE = 5 * 1024 * 1024;
/** Room for the multipart boundaries and the lat/lng fields around the photo. */
export const MAX_FORM_BYTE = MAX_IMAGE_BYTE + 64 * 1024;
/**
 * Per IP, per minute. A booth of phones shares one public IP, and iNat itself
 * throttles the token well before this, so it is a brake on scripts, not on
 * a crowd.
 */
export const IDENTIFY_IP_MAX = 40;
const identify_limit = new RateWindow(IDENTIFY_IP_MAX, 60_000);
const UPSTREAM_TIMEOUT_MS = 15000;
const VIA = "yclap-field-guide/0.1 (Youth CLAP Ateneo CCC; campus proxy)";

function json(status: number, body: unknown, extra?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...extra },
  });
}

/** Client lat/lng when it is a real coordinate, else the campus pin. */
function coordinate(raw: FormDataEntryValue | null, fallback: number, limit: number): string {
  const n = typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(n) && Math.abs(n) <= limit ? String(n) : String(fallback);
}

export async function handleIdentify(
  request: Request,
  key: IdentifyKey | string | undefined,
  fetch_impl: typeof fetch = globalThis.fetch,
  limit: RateWindow = identify_limit,
  /** Extra page origins (HALL_PAGE_ORIGIN) that count as this app's own page. */
  allow: readonly string[] = [],
): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed", allow: "POST" }, { Allow: "POST" });
  if (!isOwnPage(request, undefined, allow)) return json(403, { error: "foreign_origin" });

  /* Before anything is read: the size the client declared, then this IP's rate. */
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > MAX_FORM_BYTE) {
    return json(413, { error: "image_too_large", max_byte: MAX_IMAGE_BYTE });
  }
  const ip = clientIp(request);
  const wait = ip ? limit.take(ip) : 0;
  if (wait > 0) {
    const retry_after = String(Math.ceil(wait / 1000));
    return json(429, { error: "too_many", retry_after }, { "Retry-After": retry_after });
  }

  const provider = providerOf(key);
  if (!provider) {
    return json(503, {
      error: "needs_token",
      detail:
        "This server has no identify service it may use. Set PLANTNET_API_KEY (`wrangler secret put PLANTNET_API_KEY`), or INAT_API_TOKEN with INAT_CV_PERMITTED=1 once iNaturalist has agreed in writing.",
      token_url: TOKEN_URL,
    });
  }

  /* Counted as it streams: a chunked body declares no Content-Length. */
  const counted = new Response(request.body ? capStream(request.body, MAX_FORM_BYTE) : null, {
    headers: { "Content-Type": request.headers.get("Content-Type") ?? "" },
  });
  let form: FormData;
  try {
    form = await counted.formData();
  } catch (e) {
    if (e instanceof BodyTooLarge || (e as { cause?: unknown })?.cause instanceof BodyTooLarge) {
      return json(413, { error: "image_too_large", max_byte: MAX_IMAGE_BYTE });
    }
    return json(400, { error: "bad_form", detail: "Send multipart/form-data with an `image` field." });
  }
  const image = form.get("image");
  if (!image || typeof image === "string") return json(400, { error: "no_image" });
  if (image.size > MAX_IMAGE_BYTE) return json(413, { error: "image_too_large", max_byte: MAX_IMAGE_BYTE });
  if (!image.type.toLowerCase().startsWith("image/")) return json(415, { error: "not_an_image", type: image.type });

  if (provider.kind === "plantnet") return identifyPlantnet(image, provider.key, fetch_impl);
  const secret = provider.token;

  const upstream_form = new FormData();
  upstream_form.append("image", image, (image as File).name || "plant.jpg");
  /* iNat blends a geo prior into combined_score, so where the photo was taken
     changes the answer. Default to the campus pin, not to nowhere. */
  upstream_form.append("lat", coordinate(form.get("lat"), DEMO_PIN.lat, 90));
  upstream_form.append("lng", coordinate(form.get("lng"), DEMO_PIN.lon, 180));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch_impl(SCORE_IMAGE_URL, {
      method: "POST",
      headers: { Accept: "application/json", Authorization: secret, "User-Agent": VIA, "X-Via": VIA },
      body: upstream_form,
      signal: controller.signal,
    });
  } catch {
    return json(502, { error: "upstream_unreachable" });
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 401 || res.status === 403) {
    return json(401, {
      error: "token_expired",
      detail: "iNaturalist refused the token. iNat API tokens last 24 hours — get a fresh one and re-set the secret.",
      token_url: TOKEN_URL,
    });
  }
  if (res.status === 429) {
    const retry_after = res.headers.get("Retry-After");
    return json(429, { error: "rate_limited", retry_after }, retry_after ? { "Retry-After": retry_after } : undefined);
  }
  if (!res.ok) return json(502, { error: "upstream", status: res.status });

  const body = await res.text();
  try {
    JSON.parse(body);
  } catch {
    return json(502, { error: "upstream", detail: "iNat answered with non-JSON" });
  }
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Inat-Via": "proxy" },
  });
}

/**
 * Pl@ntNet, answered in the iNat `score_image` shape the phone already reads
 * (`mapScoreImage`: `results[].combined_score` + `taxon.name`), plus
 * `provider` and `provider_credit` so the sheet shows the credit Pl@ntNet's
 * plans require. Scores are 0–1 on both sides. A 404 is Pl@ntNet saying
 * "no species found", which is an empty answer, not a failure.
 */
async function identifyPlantnet(image: File | Blob, key: string, fetch_impl: typeof fetch): Promise<Response> {
  const form = new FormData();
  form.append("images", image, (image as File).name || "plant.jpg");
  form.append("organs", "auto");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch_impl(`${PLANTNET_URL}?api-key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { Accept: "application/json", "User-Agent": VIA },
      body: form,
      signal: controller.signal,
    });
  } catch {
    return json(502, { error: "upstream_unreachable" });
  } finally {
    clearTimeout(timer);
  }
  const credit = { provider: "plantnet", provider_credit: PLANTNET_CREDIT };
  if (res.status === 404) return json(200, { results: [], ...credit });
  if (res.status === 429) {
    const retry_after = res.headers.get("Retry-After");
    return json(429, { error: "rate_limited", retry_after, detail: "Pl@ntNet's daily quota is spent." });
  }
  if (res.status === 401 || res.status === 403) return json(502, { error: "upstream", detail: "Pl@ntNet refused the API key." });
  if (!res.ok) return json(502, { error: "upstream", status: res.status });
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return json(502, { error: "upstream", detail: "Pl@ntNet answered with non-JSON" });
  }
  return json(200, { results: plantnetResult(body), ...credit });
}

/** Pl@ntNet `results[]` → iNat-shaped rows. Reads only what Pl@ntNet sent; invents no taxon. */
export function plantnetResult(body: unknown): { combined_score: number; taxon: { name: string; preferred_common_name?: string; rank: string } }[] {
  const row = (body as { results?: unknown })?.results;
  if (!Array.isArray(row)) return [];
  const out: { combined_score: number; taxon: { name: string; preferred_common_name?: string; rank: string } }[] = [];
  for (const item of row) {
    const score = Number((item as { score?: unknown })?.score);
    const species = (item as { species?: { scientificNameWithoutAuthor?: unknown; commonNames?: unknown } })?.species;
    const name = typeof species?.scientificNameWithoutAuthor === "string" ? species.scientificNameWithoutAuthor.trim() : "";
    if (!name || !Number.isFinite(score)) continue;
    const common = Array.isArray(species?.commonNames) && typeof species.commonNames[0] === "string" ? species.commonNames[0] : undefined;
    out.push({ combined_score: score, taxon: { name, ...(common ? { preferred_common_name: common } : {}), rank: "species" } });
  }
  return out;
}
