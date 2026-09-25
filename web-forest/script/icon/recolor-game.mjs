/**
 * Recolour the chess.com-style game icons into the Magisphere palette.
 *
 *   node script/icon/recolor-game.mjs
 *
 * Reads the untouched 160 px masters in script/icon/game-source/ (restored
 * from 95d4f03, before the 09-23 vector swap) and writes the recoloured set to
 * src/asset/icon/game/. Re-running is idempotent: it always starts from the
 * masters, never from its own output. The mapping itself is palette-remap.mjs.
 */
import sharp from "sharp";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { remapRgba } from "./palette-remap.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const source = join(here, "game-source");
const out = join(here, "../../src/asset/icon/game");

for (const file of readdirSync(source).filter((f) => f.endsWith(".png")).sort()) {
  const { data, info } = await sharp(join(source, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  remapRgba(data);
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toFile(join(out, file));
  console.log(`${file}  ${info.width}x${info.height}`);
}
