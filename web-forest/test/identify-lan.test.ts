import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { request } from "node:http";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { createServer, type ViteDevServer } from "vite";
import { identifyPlant, IDENTIFY_PATH } from "../src/inat.ts";

/* ── round 5: identify through the Vite proxy with no token ────────────────
 *
 * The LAN sync server answered 503 needs_token without reading the upload, so
 * the socket reset under the proxy while the photo was still being sent and
 * the page got a 502 — the "no token" caption never showed. This drives the
 * real server/sync-server.mjs behind Vite's real proxy (the dev setup) with a
 * photo-sized upload and asserts the 503 comes through intact.
 */

const SYNC_PORT = 8987;
const PAGE_PORT = 4987;
const dir = mkdtempSync(join(tmpdir(), "yclap-identify-"));
let sync: ChildProcess;
let vite: ViteDevServer;

before(async () => {
  sync = spawn(
    process.execPath,
    ["--experimental-strip-types", "--no-warnings", "server/sync-server.mjs", "--port", String(SYNC_PORT), "--db", join(dir, "sync.json"), "--account-db", join(dir, "account.db")],
    { env: { ...process.env, INAT_API_TOKEN: "", HALL_PAGE_ORIGIN: "" }, stdio: ["ignore", "pipe", "inherit"] },
  );
  await new Promise<void>((ready, fail) => {
    let text = "";
    sync.stdout!.on("data", (c) => {
      text += String(c);
      if (text.includes("inat")) ready();
    });
    sync.once("exit", (code) => fail(new Error(`sync server exited ${code}`)));
  });
  vite = await createServer({
    configFile: false,
    logLevel: "silent",
    server: {
      host: "127.0.0.1",
      port: PAGE_PORT,
      strictPort: true,
      proxy: { [IDENTIFY_PATH]: { target: `http://127.0.0.1:${SYNC_PORT}`, xfwd: true } },
    },
  });
  await vite.listen();
});

after(async () => {
  await vite?.close();
  if (sync && sync.exitCode === null) {
    const gone = new Promise((done) => sync.once("exit", done));
    sync.kill();
    await gone;
  }
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

function post(port: number, size: number): Promise<Response> {
  const form = new FormData();
  form.append("image", new Blob([new Uint8Array(size)], { type: "image/jpeg" }), "plant.jpg");
  return fetch(`http://127.0.0.1:${port}${IDENTIFY_PATH}`, {
    method: "POST",
    body: form,
    headers: { Origin: `http://127.0.0.1:${port}` },
  });
}

describe("identify with no token, through the Vite proxy", () => {
  for (const size of [2_000, 3_000_000, 5_000_000]) {
    it(`answers 503 needs_token for a ${size.toLocaleString("en")} byte upload, direct and proxied`, async () => {
      for (const port of [SYNC_PORT, PAGE_PORT]) {
        const res = await post(port, size);
        assert.equal(res.status, 503, `port ${port}`);
        assert.equal(((await res.json()) as { error: string }).error, "needs_token");
      }
    });
  }

  it("the camera sheet's identifyPlant reads needs_token, not offline", async () => {
    const state = await identifyPlant({
      image: new Uint8Array(3_000_000),
      fetch: (url, init) => fetch(`http://127.0.0.1:${PAGE_PORT}${String(url)}`, { ...init, headers: { Origin: `http://127.0.0.1:${PAGE_PORT}` } }),
    });
    assert.equal(state.status, "needs_token");
  });

  it("an upload declared over the cap is still answered 413 and closed, unread", async () => {
    const answer = await new Promise<{ status: number; connection: string }>((done, fail) => {
      const req = request(
        {
          host: "127.0.0.1",
          port: SYNC_PORT,
          path: IDENTIFY_PATH,
          method: "POST",
          headers: { Origin: `http://127.0.0.1:${SYNC_PORT}`, "Content-Type": "multipart/form-data; boundary=x", "Content-Length": "9000000" },
        },
        (res) => {
          res.resume();
          done({ status: res.statusCode ?? 0, connection: String(res.headers.connection) });
        },
      );
      req.on("error", fail);
      req.write("--x\r\n");
    });
    assert.equal(answer.status, 413);
    assert.equal(answer.connection, "close");
  });
});
