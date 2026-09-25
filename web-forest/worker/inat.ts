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
 * Same-origin only. There is no CORS header, so a foreign page cannot READ an
 * answer — but a `no-cors` multipart POST from any site still arrives, so the
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
  token: string | undefined,
  fetch_impl: typeof fetch = globalThis.fetch,
  limit: RateWindow = identify_limit,
): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed", allow: "POST" }, { Allow: "POST" });
  if (!isOwnPage(request)) return json(403, { error: "foreign_origin" });

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

  const secret = token?.trim();
  if (!secret) {
    return json(503, {
      error: "needs_token",
      detail: "This server has no INAT_API_TOKEN. Set it with `wrangler secret put INAT_API_TOKEN`.",
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
