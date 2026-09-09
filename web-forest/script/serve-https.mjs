/**
 * Serve the built app over HTTPS on the LAN, with a locally-generated CA.
 *
 * WHY THIS EXISTS: the three things most worth testing on a real phone — the
 * service worker, geolocation and the camera — are all secure-context-only, so
 * `http://192.168.x.x` silently refuses every one of them. That leaves three
 * ways to get a secure context onto a handset:
 *
 *   1. Tailscale serve. Best answer — tailnet-private, works over cellular.
 *      Does not work on this Mac: the App Store build ships a sandboxed CLI
 *      and `serve`/`cert` fail with `Tailscale.CLIError error 3`.
 *   2. A public tunnel (cloudflared) or a Vercel deploy. Both work, and both
 *      put an unfinished app on the open internet.
 *   3. This. A CA generated on this machine, trusted once on the phone, and a
 *      TLS server bound to the LAN. Nothing leaves the wifi.
 *
 * Option 3 is the only one that needs nobody's permission to publish, so it is
 * the default. It costs one profile install on the phone, once.
 *
 * The CA private key never leaves `script/cert/`, which is gitignored. Only
 * `ca.crt` — the public certificate — is meant to go to the phone.
 *
 * Usage:
 *   node script/serve-https.mjs                 # generates the cert if missing
 *   node script/serve-https.mjs --port 4179
 *   node script/serve-https.mjs --regenerate    # new CA (re-install on phone)
 *
 * Run `npm run build` first — this serves `dist/`, not the dev server, because
 * the service worker refuses to register under `vite dev` by design.
 */
import { createServer } from "node:https";
import { createServer as createHttpServer } from "node:http";
import { execFileSync } from "node:child_process";
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const DIST = join(ROOT, "dist");
const CERT_DIR = join(HERE, "cert");

const arg = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = arg.indexOf(`--${name}`);
  return i >= 0 && arg[i + 1] && !arg[i + 1].startsWith("--") ? arg[i + 1] : fallback;
};
const PORT = Number(flag("port", 4179));
const REGENERATE = arg.includes("--regenerate");

/** Every IPv4 this machine answers on, so the cert covers whichever the phone uses. */
function localAddress() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === "IPv4" && !n.internal)
    .map((n) => n.address);
}

function openssl(args, opts = {}) {
  return execFileSync("/usr/bin/openssl", args, { stdio: ["ignore", "pipe", "pipe"], ...opts });
}

/**
 * A CA plus one leaf certificate covering every local address.
 *
 * The SANs matter more than they look: iOS validates the address you typed
 * against the certificate's SAN list, and an IP that is only in the CN is
 * rejected outright. A cert that "works on the laptop" and fails on the phone
 * is almost always this.
 */
function makeCert() {
  const address = localAddress();
  if (address.length === 0) {
    console.error("no non-loopback IPv4 address — are you on wifi?");
    process.exit(1);
  }
  mkdirSync(CERT_DIR, { recursive: true });

  const san = [
    "DNS:localhost",
    "IP:127.0.0.1",
    ...address.map((a) => `IP:${a}`),
  ].join(",");

  /* 30 days. Short on purpose: this is a demo-week certificate, and a local CA
     that sits trusted on a phone for a year is a liability nobody remembers. */
  openssl(["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "30",
    "-keyout", join(CERT_DIR, "ca.key"), "-out", join(CERT_DIR, "ca.crt"),
    "-subj", "/CN=eComon local CA/O=Youth CLAP Ateneo CCC"]);

  openssl(["req", "-newkey", "rsa:2048", "-nodes",
    "-keyout", join(CERT_DIR, "server.key"), "-out", join(CERT_DIR, "server.csr"),
    "-subj", "/CN=eComon local server"]);

  /* The extensions go through a real FILE, not `-extfile /dev/stdin`.
     The stdin form silently produced a certificate with NO subjectAltName at
     all, and openssl reported success: `curl` then failed with "certificate
     subject name 'eComon local server' does not match target host name".
     A cert with no SAN is exactly the failure this whole function exists to
     avoid, so it is worth the temp file. */
  const ext = join(CERT_DIR, "san.cnf");
  writeFileSync(ext, `subjectAltName=${san}\nextendedKeyUsage=serverAuth\nbasicConstraints=CA:FALSE\n`);
  openssl(["x509", "-req", "-days", "30",
    "-in", join(CERT_DIR, "server.csr"),
    "-CA", join(CERT_DIR, "ca.crt"), "-CAkey", join(CERT_DIR, "ca.key"), "-CAcreateserial",
    "-out", join(CERT_DIR, "server.crt"),
    "-extfile", ext]);

  /* Prove the SAN landed rather than trusting the exit code. */
  const dump = openssl(["x509", "-in", join(CERT_DIR, "server.crt"), "-noout", "-text"]).toString();
  if (!dump.includes("Subject Alternative Name")) {
    console.error("the certificate came back with no subjectAltName — every phone will reject it");
    process.exit(1);
  }

  console.log(`generated a 30-day CA covering ${san}`);
}

if (REGENERATE) rmSync(CERT_DIR, { recursive: true, force: true });
if (!existsSync(join(CERT_DIR, "server.crt"))) makeCert();

if (!existsSync(DIST)) {
  console.error("dist/ is missing — run `npm run build` first.\n" +
    "This serves the BUILT app on purpose: main.tsx refuses to register the\n" +
    "service worker under `vite dev`, so a dev server cannot test offline.");
  process.exit(1);
}

const TYPE = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".glb": "model/gltf-binary", ".woff2": "font/woff2", ".ico": "image/x-icon",
};

const server = createServer(
  {
    key: readFileSync(join(CERT_DIR, "server.key")),
    cert: readFileSync(join(CERT_DIR, "server.crt")),
  },
  (req, res) => {
    /* Path traversal guard: normalize, then confirm the resolved path is still
       inside dist/ before opening anything. */
    const url = new URL(req.url, "https://local");
    let file = resolve(DIST, "." + normalize(decodeURIComponent(url.pathname)));
    if (!file.startsWith(DIST)) {
      res.writeHead(403).end("no");
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, "index.html");
    /* SPA fallback — /map and /journal are client routes with no file. */
    if (!existsSync(file)) file = join(DIST, "index.html");

    /* One line per request, because the whole point of this server is a test
       happening on a device nobody can see the console of. A phone that fails
       silently is the failure mode; this makes it describable. Records the
       device family and whether the service worker is the one asking. */
    const ua = String(req.headers["user-agent"] ?? "");
    const device = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Mac|Windows|Linux/.test(ua) ? "desktop" : "?";
    const via_sw = req.headers["service-worker"] === "script" ? " [sw-register]" : "";
    if (device !== "desktop") {
      console.log(`  ${device}  ${req.method} ${url.pathname}${via_sw}`);
    }

    const type = TYPE[extname(file)] ?? "application/octet-stream";
    /* The service worker must never be served from cache while iterating, or
       you spend an evening testing yesterday's build on the phone. */
    const is_sw = file.endsWith("sw.js");
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": is_sw ? "no-cache" : "public, max-age=0, must-revalidate",
    });
    createReadStream(file).pipe(res);
  },
);

/**
 * A plain-HTTP sidecar whose only job is to hand out `ca.crt`.
 *
 * Chicken-and-egg otherwise: the phone cannot fetch the certificate over the
 * TLS server, because it does not trust that server until it HAS the
 * certificate. AirDrop works but is a step, and a step is where a two-minute
 * task goes to die. This serves exactly one file, over HTTP, on its own port —
 * a public certificate, which is meant to be public.
 *
 * It refuses every other path, so it cannot become a second static server by
 * accident, and it never sees the private key.
 */
const CERT_PORT = PORT + 1;
createHttpServer((req, res) => {
  const ua = String(req.headers["user-agent"] ?? "");
  const device = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : "desktop";
  if (device !== "desktop") console.log(`  ${device}  GET ${req.url} (certificate)`);
  if (!req.url || !req.url.startsWith("/ca.crt")) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("this port serves ca.crt and nothing else\n");
    return;
  }
  res.writeHead(200, {
    /* The iOS mime type that triggers "Profile Downloaded" rather than a
       text preview. Android accepts it too. */
    "Content-Type": "application/x-x509-ca-cert",
    "Content-Disposition": 'attachment; filename="ecomon-ca.crt"',
  });
  res.end(readFileSync(join(CERT_DIR, "ca.crt")));
}).listen(CERT_PORT, "0.0.0.0");

server.listen(PORT, "0.0.0.0", () => {
  console.log("eComon — LAN HTTPS (nothing is published)\n");
  for (const a of localAddress()) console.log(`  https://${a}:${PORT}/`);
  console.log(`\n  On the phone, ONCE:`);
  console.log(`    1. Open http://${localAddress()[0]}:${CERT_PORT}/ca.crt  (plain http, on purpose —`);
  console.log(`       the phone cannot fetch the cert over TLS it does not trust yet)`);
  console.log(`    2. iOS: Settings > Profile Downloaded > Install`);
  console.log(`       then Settings > General > About > Certificate Trust Settings`);
  console.log(`       and switch ON "eComon local CA"  <- this step is the one people miss`);
  console.log(`    3. Android: Settings > Security > Encryption > Install from storage > CA cert`);
  console.log(`\n  Then open the URL above. Service worker, GPS and camera all work.`);
  console.log(`  Cert expires in 30 days; re-run with --regenerate after that.\n`);
});
