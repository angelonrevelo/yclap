/**
 * Fold a set of `bench-frame.mjs` outputs into one file with per-arm medians.
 *
 * The frame bench is noisy on a shared machine — another build on the same
 * CPU moves a 4× run by 10–20 fps — so a before/after claim is only fair when
 * the two arms were run INTERLEAVED (before, after, before, after…) and
 * compared by median. Each input keeps its own `setup` and every run's row;
 * nothing is recomputed from anything but those rows.
 *
 * Usage: node script/bench-merge.mjs <out.json> <arm>=<file.json> [<arm>=<file.json> …]
 *   e.g. before-4x=/tmp/ab/before-4-1.json after-4x=/tmp/ab/after-4-1.json …
 * An arm may repeat; its runs are pooled.
 */
import { readFileSync, writeFileSync } from "node:fs";

const [, , out, ...pair] = process.argv;
if (!out || pair.length === 0) {
  console.error("usage: node script/bench-merge.mjs <out.json> <arm>=<file.json> …");
  process.exit(2);
}

const median = (list) => {
  const v = list.filter((x) => typeof x === "number" && Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : Math.round(((v[mid - 1] + v[mid]) / 2) * 1000) / 1000;
};

const FIELD = [
  "fps_p50",
  "fps_p5",
  "fps_mean",
  "frame_ms_p95",
  "long_task_count",
  "long_task_ms_total",
  "long_task_ms_max",
  "camera_jitter_p50",
  "camera_jitter_p95",
  "dom_element_count",
  "dom_node_count",
  "js_heap_used_mb",
  "script_ms",
  "recalc_style_ms",
  "layout_ms",
];

const arm = new Map();
const source = [];
for (const p of pair) {
  const at = p.indexOf("=");
  const name = p.slice(0, at);
  const file = p.slice(at + 1);
  const doc = JSON.parse(readFileSync(file, "utf8"));
  source.push({ arm: name, at: doc.at, commit: doc.commit, setup: doc.setup });
  for (const row of doc.result) {
    /* One file can hold two tiers (`--quality full,lite`): split them. */
    const key = row.quality ? `${name}-${row.quality}` : name;
    if (!arm.has(key)) arm.set(key, []);
    arm.get(key).push({ ...row, commit: doc.commit, at: doc.at });
  }
}

const summary = {};
for (const [key, rows] of arm) {
  const valid = rows.filter((r) => r.is_valid !== false);
  summary[key] = { run_count: rows.length, valid_count: valid.length };
  for (const f of FIELD) summary[key][`${f}_median`] = median(valid.map((r) => r[f]));
  summary[key].tier_after = [...new Set(valid.map((r) => r.tier_after).filter(Boolean))];
}

writeFileSync(
  out,
  `${JSON.stringify({ bench: "play-view frame, interleaved A/B", merged_at: new Date().toISOString(), summary, source, run: Object.fromEntries(arm) }, null, 2)}\n`,
);
for (const [key, s] of Object.entries(summary)) {
  console.log(
    `${key.padEnd(18)} n=${s.valid_count}/${s.run_count}  fps p50 ${s.fps_p50_median}  p5 ${s.fps_p5_median}  mean ${s.fps_mean_median}  long ${s.long_task_count_median} (${s.long_task_ms_total_median} ms, max ${s.long_task_ms_max_median})  jitter ${s.camera_jitter_p50_median}/${s.camera_jitter_p95_median}  el ${s.dom_element_count_median}  heap ${s.js_heap_used_mb_median} MB`,
  );
}
console.log(`→ ${out}`);
