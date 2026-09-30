import { test } from "node:test";
import assert from "node:assert/strict";
import {
  band,
  bandOf,
  hexToRgb,
  hslToRgb,
  remapPixel,
  remapRgba,
  rgbToHsl,
} from "../script/icon/palette-remap.mjs";

const hueOf = (rgb: number[]) => rgbToHsl(rgb[0], rgb[1], rgb[2])[0];
const lightOf = (rgb: number[]) => rgbToHsl(rgb[0], rgb[1], rgb[2])[2];

test("HSL round-trips within a unit of rounding", () => {
  for (const hex of band.map((b: { hex: string }) => b.hex)) {
    const rgb = hexToRgb(hex);
    const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    const back = hslToRgb(h, s, l);
    back.forEach((v: number, i: number) => assert.ok(Math.abs(v - rgb[i]) <= 1, `${hex} channel ${i}`));
  }
});

test("red wraps across 0° into the red band", () => {
  assert.equal(bandOf(5).hex, "#D8452F");
  assert.equal(bandOf(355).hex, "#D8452F");
  assert.equal(bandOf(120).hex, "#3E9A4A");
});

test("a chess.com lime green lands near Magisphere Leaf, lightness kept", () => {
  const src = [0x81, 0xb6, 0x4c]; // chess.com #81B64C
  const out = remapPixel(src[0], src[1], src[2]);
  const leaf = hueOf(hexToRgb("#3E9A4A"));
  assert.ok(Math.abs(hueOf(out) - leaf) < 12, `hue ${hueOf(out)} vs leaf ${leaf}`);
  assert.ok(Math.abs(lightOf(out) - lightOf(src)) < 0.02);
});

test("greys and near-greys are left alone (the lock stays steel, not speckled)", () => {
  assert.deepEqual(remapPixel(128, 128, 128), [128, 128, 128]);
  assert.deepEqual(remapPixel(120, 124, 130), [120, 124, 130]);
});

test("remapRgba keeps alpha and skips transparent pixels", () => {
  const data = new Uint8Array([0x81, 0xb6, 0x4c, 200, 0xff, 0x00, 0xff, 0]);
  remapRgba(data);
  assert.equal(data[3], 200);
  assert.deepEqual([...data.slice(4)], [0xff, 0x00, 0xff, 0]);
});
