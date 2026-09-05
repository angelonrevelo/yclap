/**
 * Coverage check for the exhaustive visual verification.
 *
 * "Verify every single one" does not stick unless something recomputes the
 * ground truth and refuses a partial answer. This reads the manifest, reads
 * the reviewers' verdict files, and compares them BOTH ways — a species with
 * no verdict is a gap, and a verdict for a species that does not exist is a
 * fabrication. A count-only check would pass 1098 invented lines.
 *
 *   node script/species-model/coverage.mjs <lane.tsv...>
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(
  readFileSync(join(here, "..", "..", "public", "model", "species-model.json"), "utf8"),
);
const expected = new Set(manifest.model.map((m) => m.species_code));

const file = process.argv.slice(2);
if (!file.length) {
  console.error("usage: coverage.mjs <lane.tsv...>");
  process.exit(2);
}

const seen = new Map();       // species_code -> [verdict, note, source]
const duplicate = [];
const invented = [];
const malformed = [];

for (const f of file) {
  if (!existsSync(f)) { console.log(`MISSING FILE  ${f}`); continue; }
  const line = readFileSync(f, "utf8").split(/\r?\n/).filter((l) => l.trim());
  for (const l of line) {
    const part = l.split("\t");
    if (part.length < 2 || !/^(OK|FLAG)$/.test(part[1].trim())) { malformed.push(`${f}: ${l.slice(0, 70)}`); continue; }
    const code = part[0].trim();
    if (!expected.has(code)) { invented.push(`${f}: ${code}`); continue; }
    if (seen.has(code)) { duplicate.push(`${code} (${seen.get(code)[2]} and ${f})`); continue; }
    seen.set(code, [part[1].trim(), (part[2] ?? "").trim(), f]);
  }
}

const missing = [...expected].filter((c) => !seen.has(c)).sort();
const flagged = [...seen.entries()].filter(([, v]) => v[0] === "FLAG");

console.log(`\nexpected species     ${expected.size}`);
console.log(`verdicts recorded    ${seen.size}`);
console.log(`  OK                 ${seen.size - flagged.length}`);
console.log(`  FLAG               ${flagged.length}`);
console.log(`missing (no verdict) ${missing.length}`);
console.log(`invented (not real)  ${invented.length}`);
console.log(`duplicate verdicts   ${duplicate.length}`);
console.log(`malformed lines      ${malformed.length}`);

const show = (label, row) => {
  if (!row.length) return;
  console.log(`\n${label}:`);
  for (const r of row.slice(0, 25)) console.log(`  ${r}`);
  if (row.length > 25) console.log(`  … and ${row.length - 25} more`);
};
show("MISSING", missing);
show("INVENTED", invented);
show("DUPLICATE", duplicate);
show("MALFORMED", malformed);

if (flagged.length) {
  console.log(`\n── flagged models (${flagged.length}) ──`);
  const byArch = new Map();
  const arch = new Map(manifest.model.map((m) => [m.species_code, m.archetype]));
  for (const [code, v] of flagged) {
    const a = arch.get(code) ?? "?";
    if (!byArch.has(a)) byArch.set(a, []);
    byArch.get(a).push([code, v[1]]);
  }
  for (const [a, row] of [...byArch.entries()].sort((x, y) => y[1].length - x[1].length)) {
    console.log(`\n  ${a} (${row.length})`);
    for (const [code, note] of row.slice(0, 12)) console.log(`    ${code.padEnd(32)} ${note.slice(0, 90)}`);
    if (row.length > 12) console.log(`    … and ${row.length - 12} more`);
  }
}

const bad = missing.length + invented.length + duplicate.length + malformed.length;
if (bad) { console.log(`\nCOVERAGE INCOMPLETE — ${bad} problem(s)\n`); process.exit(1); }
console.log(`\nCOVERAGE COMPLETE — every one of ${expected.size} models has exactly one verdict\n`);
