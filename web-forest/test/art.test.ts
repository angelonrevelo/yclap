import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { palette } from "../src/art/palette.ts";

/**
 * The vector art contract (`src/art/art.tsx`). Every file is inlined into the
 * page, possibly many times over, so what would be harmless in an <img> is a
 * bug here: a repeated id, a filter on an animated node, a reach off the page.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src/art/svg");

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : name.endsWith(".svg") ? [full] : [];
  });
}

const file = walk(root);
const allowed = new Set(Object.values(palette).map((hex) => hex.toUpperCase()));

/** 6 KB — the eagle in flight is the biggest piece; an icon is well under 2. */
const BYTE_CAP = 6 * 1024;

test("there is vector art to check", () => {
  assert.ok(file.length > 0, "no svg under src/art/svg");
});

for (const full of file) {
  const name = path.relative(root, full).replaceAll("\\", "/");
  const svg = readFileSync(full, "utf8");

  test(`${name} is one inline-safe svg`, () => {
    assert.match(svg.trimStart(), /^<svg[\s>]/, "must start with <svg");
    assert.match(svg, /viewBox="[\d.\s-]+"/, "needs a viewBox");
    const open = svg.match(/^<svg[^>]*>/)?.[0] ?? "";
    assert.doesNotMatch(open, /\s(width|height)=/, "the wrapper sizes it; no width/height on <svg>");
    assert.doesNotMatch(svg, /\sid=/, "ids collide when the same art is inlined twice");
    assert.doesNotMatch(svg, /<(filter|image|use|script|style|foreignObject)\b/, "forbidden element");
    assert.doesNotMatch(svg, /href=/, "nothing may reach off the page");
    assert.ok(Buffer.byteLength(svg) <= BYTE_CAP, `${Buffer.byteLength(svg)} B over the ${BYTE_CAP} B cap`);
  });

  test(`${name} paints only in the palette`, () => {
    const hex = [...svg.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g)].map((m) => m[0].toUpperCase());
    const stray = [...new Set(hex.filter((h) => !allowed.has(h)))];
    assert.deepEqual(stray, [], `off-palette colour(s) — add to palette.ts or use an existing one`);
  });
}
