/**
 * Kitchen sink — the whole species pack on one page, rendering at once.
 *
 * The obvious way to build this is one <canvas> per tile. That does not work:
 * browsers cap live WebGL contexts at roughly 16 and silently kill the oldest,
 * so a grid of 1,098 would show a dozen models and a field of blank squares.
 *
 * So there is ONE context, pinned behind the scrolling DOM grid, and each
 * visible tile is drawn into its own gl.viewport + gl.scissor rectangle read
 * back from that tile's real layout box. The DOM owns layout, hit-testing and
 * labels; GL only fills rectangles.
 *
 * The pack is 51 MB, so nothing loads until its tile is near the viewport, and
 * GPU buffers are evicted on an LRU once past a cap. Scroll to the bottom of
 * all 1,098 and memory stays flat.
 */

const canvas = document.getElementById("gl");
const gl = canvas.getContext("webgl2", { antialias: true, alpha: true });
if (!gl) {
  document.getElementById("stats").textContent = "WebGL2 unavailable in this browser.";
  throw new Error("no webgl2");
}

/* ── shader (same flat-shaded vertex-colour lighting as the single viewer) ── */

const VERT = `#version 300 es
precision highp float;
in vec3 aPos; in vec3 aNrm; in vec3 aCol;
uniform mat4 uProj, uView, uModel;
out vec3 vNrm; out vec3 vCol;
void main() {
  vec4 wp = uModel * vec4(aPos, 1.0);
  gl_Position = uProj * uView * wp;
  vNrm = mat3(uModel) * aNrm;
  vCol = aCol;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec3 vNrm; in vec3 vCol;
uniform vec3 uLight;
out vec4 frag;
void main() {
  vec3 n = normalize(vNrm);
  float d = max(dot(n, uLight), 0.0);
  frag = vec4(vCol * (0.62 + 0.38 * d), 1.0);
}`;

function shader(type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}
const prog = gl.createProgram();
gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
gl.linkProgram(prog);
if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
gl.useProgram(prog);
const U = {
  proj: gl.getUniformLocation(prog, "uProj"),
  view: gl.getUniformLocation(prog, "uView"),
  model: gl.getUniformLocation(prog, "uModel"),
  light: gl.getUniformLocation(prog, "uLight"),
};
gl.enable(gl.DEPTH_TEST);
gl.enable(gl.CULL_FACE);
gl.uniform3f(U.light, 0.5, 0.8, 0.6);
gl.clearColor(0, 0, 0, 0);

/* ── tiny mat4 ─────────────────────────────────────────────────────────── */

const mat = () => new Float32Array(16);
const ident = (m) => { m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m; };
function mul(a, b, out) {
  for (let i = 0; i < 4; i += 1) for (let j = 0; j < 4; j += 1) {
    out[i * 4 + j] = a[j] * b[i * 4] + a[4 + j] * b[i * 4 + 1] + a[8 + j] * b[i * 4 + 2] + a[12 + j] * b[i * 4 + 3];
  }
  return out;
}
function trs(m, t, q, s) {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  m[0] = (1 - (yy + zz)) * s[0]; m[1] = (xy + wz) * s[0]; m[2] = (xz - wy) * s[0]; m[3] = 0;
  m[4] = (xy - wz) * s[1]; m[5] = (1 - (xx + zz)) * s[1]; m[6] = (yz + wx) * s[1]; m[7] = 0;
  m[8] = (xz + wy) * s[2]; m[9] = (yz - wx) * s[2]; m[10] = (1 - (xx + yy)) * s[2]; m[11] = 0;
  m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; m[15] = 1;
  return m;
}
function perspective(m, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  m.fill(0);
  m[0] = f / aspect; m[5] = f; m[11] = -1;
  m[10] = (far + near) / (near - far); m[14] = (2 * far * near) / (near - far);
  return m;
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (v) => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
function lookAt(m, eye, target, up) {
  const z = norm3([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const x = norm3(cross(up, z));
  const y = cross(z, x);
  m[0] = x[0]; m[1] = y[0]; m[2] = z[0]; m[3] = 0;
  m[4] = x[1]; m[5] = y[1]; m[6] = z[1]; m[7] = 0;
  m[8] = x[2]; m[9] = y[2]; m[10] = z[2]; m[11] = 0;
  m[12] = -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]);
  m[13] = -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]);
  m[14] = -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]);
  m[15] = 1;
  return m;
}
function nlerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  const s = d < 0 ? -1 : 1;
  const o = [a[0] + (b[0] * s - a[0]) * t, a[1] + (b[1] * s - a[1]) * t, a[2] + (b[2] * s - a[2]) * t, a[3] + (b[3] * s - a[3]) * t];
  const l = Math.hypot(...o) || 1;
  return [o[0] / l, o[1] / l, o[2] / l, o[3] / l];
}

/* ── glb loader ────────────────────────────────────────────────────────── */

async function loadGlb(url) {
  const buf = await (await fetch(url)).arrayBuffer();
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== 0x46546c67) throw new Error("not glb");
  let off = 12, json = null, bin = null;
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const chunk = new Uint8Array(buf, off + 8, len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(chunk));
    else if (type === 0x004e4942) bin = chunk;
    off += 8 + len;
  }
  const view = (i) => {
    const bv = json.bufferViews[i];
    return bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength);
  };
  const acc = (i) => {
    const a = json.accessors[i];
    const b = view(a.bufferView);
    const comp = { 5126: Float32Array, 5123: Uint16Array, 5121: Uint8Array, 5120: Int8Array }[a.componentType];
    return {
      arr: new comp(b.buffer, b.byteOffset, b.byteLength / comp.BYTES_PER_ELEMENT),
      componentType: a.componentType, count: a.count, normalized: a.normalized,
    };
  };
  const GL_TYPE = { 5126: gl.FLOAT, 5123: gl.UNSIGNED_SHORT, 5121: gl.UNSIGNED_BYTE, 5120: gl.BYTE };

  const buffers = [];
  const meshes = json.meshes.map((mesh) => {
    const prim = mesh.primitives[0];
    const posAcc = json.accessors[prim.attributes.POSITION];
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const bind = (a, size, name) => {
      const loc = gl.getAttribLocation(prog, name);
      const bo = gl.createBuffer();
      buffers.push(bo);
      gl.bindBuffer(gl.ARRAY_BUFFER, bo);
      gl.bufferData(gl.ARRAY_BUFFER, a.arr, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, GL_TYPE[a.componentType], !!a.normalized, 0, 0);
    };
    bind(acc(prim.attributes.POSITION), 3, "aPos");
    bind(acc(prim.attributes.NORMAL), 3, "aNrm");
    bind(acc(prim.attributes.COLOR_0), 3, "aCol");
    const idx = acc(prim.indices);
    const ib = gl.createBuffer();
    buffers.push(ib);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx.arr, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count: idx.count, min: posAcc.min, max: posAcc.max };
  });

  const nodes = json.nodes.map((n) => ({
    mesh: n.mesh, children: n.children ?? [],
    t: n.translation ?? [0, 0, 0], r: n.rotation ?? [0, 0, 0, 1], s: n.scale ?? [1, 1, 1],
    m: ident(mat()),
    /* Rest pose, so a paused sink shows the model as authored. */
    t0: n.translation ?? [0, 0, 0], r0: n.rotation ?? [0, 0, 0, 1], s0: n.scale ?? [1, 1, 1],
  }));

  let anim = null;
  if (json.animations?.length) {
    const a = json.animations[0];
    anim = {
      duration: Math.max(...a.samplers.map((s) => json.accessors[s.input].max[0])),
      channels: a.channels.map((c) => {
        const smp = a.samplers[c.sampler];
        return {
          node: c.target.node, path: c.target.path,
          times: acc(smp.input).arr, vals: acc(smp.output).arr,
          vec: c.target.path === "rotation" ? 4 : 3,
        };
      }),
    };
  }
  return { meshes, nodes, roots: json.scenes[0].nodes, anim, buffers, fit: null };
}

function sampleAnim(model, t) {
  const { anim, nodes } = model;
  if (!anim) return;
  const tt = t % anim.duration;
  for (const ch of anim.channels) {
    const { times, vals, vec, node, path } = ch;
    let i = 0;
    while (i < times.length - 2 && times[i + 1] <= tt) i += 1;
    const span = times[i + 1] - times[i] || 1;
    const f = Math.min(1, Math.max(0, (tt - times[i]) / span));
    const a = vals.subarray(i * vec, i * vec + vec);
    const b = vals.subarray((i + 1) * vec, (i + 1) * vec + vec);
    const n = nodes[node];
    if (path === "rotation") n.r = nlerp([...a], [...b], f);
    else {
      const v = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
      if (path === "translation") n.t = v; else n.s = v;
    }
  }
}
function restPose(model) {
  for (const n of model.nodes) { n.t = n.t0; n.r = n.r0; n.s = n.s0; }
}

/* Walk the scene graph once and record the world-space bounds, so every model
   is framed by its own size instead of a guessed constant. */
function computeFit(model) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  const walk = (i, parent) => {
    const n = model.nodes[i];
    const local = trs(mat(), n.t, n.r, n.s);
    const world = parent ? mul(parent, local, mat()) : local;
    n.m = world;
    if (n.mesh !== undefined) {
      const { min, max } = model.meshes[n.mesh];
      for (let cx = 0; cx < 8; cx += 1) {
        const p = [cx & 1 ? max[0] : min[0], cx & 2 ? max[1] : min[1], cx & 4 ? max[2] : min[2]];
        const w = [
          world[0] * p[0] + world[4] * p[1] + world[8] * p[2] + world[12],
          world[1] * p[0] + world[5] * p[1] + world[9] * p[2] + world[13],
          world[2] * p[0] + world[6] * p[1] + world[10] * p[2] + world[14],
        ];
        for (let k = 0; k < 3; k += 1) { lo[k] = Math.min(lo[k], w[k]); hi[k] = Math.max(hi[k], w[k]); }
      }
    }
    for (const c of n.children) walk(c, world);
  };
  for (const r of model.roots) walk(r, null);
  if (!Number.isFinite(lo[0])) return { centre: [0, 0.5, 0], radius: 1 };
  const centre = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const radius = Math.max(0.001, Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2);
  return { centre, radius };
}

/* ── state ─────────────────────────────────────────────────────────────── */

const gridEl = document.getElementById("grid");
const statsEl = document.getElementById("stats");
const emptyEl = document.getElementById("empty");

let manifest = null;
let row = [];        // full model list
let shown = [];      // after search + filters
const cache = new Map();   // species_code -> { model, used }
const pending = new Set();
const LOADED_CAP = 260;    // GPU buffers kept alive; beyond this, LRU evict
const MAX_PARALLEL = 12;

let visible = new Set();   // species_code currently intersecting
let spinning = true, showAnim = false;
let tile = 140;
let tick = 0;

const projM = mat(), viewM = mat(), tmp = mat();

function disposeModel(m) {
  for (const b of m.buffers) gl.deleteBuffer(b);
  for (const mesh of m.meshes) gl.deleteVertexArray(mesh.vao);
}

function evict() {
  if (cache.size <= LOADED_CAP) return;
  const sorted = [...cache.entries()].sort((a, b) => a[1].used - b[1].used);
  for (const [code, entry] of sorted) {
    if (cache.size <= LOADED_CAP) break;
    if (visible.has(code)) continue;   // never evict something on screen
    disposeModel(entry.model);
    cache.delete(code);
  }
}

async function ensureLoaded(rec) {
  if (cache.has(rec.species_code) || pending.has(rec.species_code)) return;
  if (pending.size >= MAX_PARALLEL) return;
  pending.add(rec.species_code);
  try {
    const model = await loadGlb(`/model/${rec.file}`);
    model.fit = computeFit(model);
    cache.set(rec.species_code, { model, used: tick });
    rec.el?.classList.remove("pending");
    evict();
  } catch {
    rec.el?.classList.remove("pending");
    rec.failed = true;
  } finally {
    pending.delete(rec.species_code);
  }
}

/* ── the frame ─────────────────────────────────────────────────────────── */

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.floor(canvas.clientWidth * dpr), h = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return dpr;
}

function drawNode(model, i, parent) {
  const n = model.nodes[i];
  const local = trs(mat(), n.t, n.r, n.s);
  const world = parent ? mul(parent, local, mat()) : local;
  if (n.mesh !== undefined) {
    gl.uniformMatrix4fv(U.model, false, world);
    const mesh = model.meshes[n.mesh];
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
  }
  for (const c of n.children) drawNode(model, c, world);
}

function frame(now) {
  const dpr = resize();
  const t = now / 1000;
  tick += 1;

  gl.disable(gl.SCISSOR_TEST);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.SCISSOR_TEST);

  const vh = window.innerHeight;
  for (const rec of shown) {
    const el = rec.el;
    if (!el) continue;
    const r = el.getBoundingClientRect();
    /* Cull by the real layout box — this is also what decides loading. */
    if (r.bottom < -80 || r.top > vh + 80 || r.width < 2) continue;

    const entry = cache.get(rec.species_code);
    if (!entry) { ensureLoaded(rec); continue; }
    entry.used = tick;
    const model = entry.model;

    /* GL's origin is bottom-left; the DOM's is top-left. */
    const x = Math.floor(r.left * dpr);
    const y = Math.floor((vh - r.bottom) * dpr);
    const w = Math.floor(r.width * dpr);
    const h = Math.floor(r.height * dpr);
    gl.viewport(x, y, w, h);
    gl.scissor(x, y, w, h);

    if (showAnim) sampleAnim(model, t + rec.phase); else restPose(model);

    const { centre, radius } = model.fit;
    const yaw = spinning ? t * 0.5 + rec.phase : 0.6;
    const d = radius * 3.1;
    const eye = [
      centre[0] + Math.sin(yaw) * Math.cos(0.28) * d,
      centre[1] + Math.sin(0.28) * d,
      centre[2] + Math.cos(yaw) * Math.cos(0.28) * d,
    ];
    perspective(projM, 0.62, w / h || 1, radius * 0.08, d * 4);
    lookAt(viewM, eye, centre, [0, 1, 0]);
    gl.uniformMatrix4fv(U.proj, false, projM);
    gl.uniformMatrix4fv(U.view, false, viewM);
    for (const rt of model.roots) drawNode(model, rt, null);
  }
  gl.bindVertexArray(null);
  requestAnimationFrame(frame);
}

/* ── grid build ────────────────────────────────────────────────────────── */

function applyGridSize() {
  gridEl.style.gridTemplateColumns = `repeat(auto-fill, minmax(${tile}px, 1fr))`;
}

function render() {
  /* Drop every cached model no longer in the list, then rebuild the DOM. */
  gridEl.textContent = "";
  visible.clear();
  const frag = document.createDocumentFragment();
  for (const rec of shown) {
    const cell = document.createElement("div");
    cell.className = cache.has(rec.species_code) ? "cell" : "cell pending";
    cell.title = `${rec.common_name || rec.scientific_name} · ${rec.archetype} · ${(rec.bytes / 1024).toFixed(0)} KB`;

    const tag = document.createElement("span");
    if (rec.origin === "Native") { tag.className = "tag native"; tag.textContent = "native"; }
    else if (rec.palette_source === "derived") { tag.className = "tag derived"; tag.textContent = "derived"; }
    else { tag.className = "tag"; tag.textContent = rec.archetype; }
    cell.appendChild(tag);

    const plate = document.createElement("div");
    plate.className = "plate";
    const b = document.createElement("b");
    b.textContent = rec.common_name || rec.scientific_name;
    const i = document.createElement("i");
    i.textContent = rec.scientific_name;
    plate.append(b, i);
    cell.appendChild(plate);

    cell.addEventListener("click", () => {
      window.open(`/model-gallery.html?shot=${encodeURIComponent(rec.species_code)}`, "_blank");
    });

    rec.el = cell;
    frag.appendChild(cell);
  }
  gridEl.appendChild(frag);
  emptyEl.hidden = shown.length > 0;
  updateStats();
}

function updateStats() {
  const c = manifest.counts;
  statsEl.innerHTML =
    `<b>${shown.length}</b> of <b>${row.length}</b> models shown · ` +
    `${c.inat_rows} iNaturalist rows swept, ${c.genus_and_above_rows} genus-and-above excluded, ` +
    `${c.failed} failed · generated ${manifest.generated_at?.slice(0, 10)}. ` +
    `Click a tile to open it full-size.`;
}

/* ── filters ───────────────────────────────────────────────────────────── */

const active = new Set();
let query = "";

function passes(rec) {
  if (query) {
    const hay = `${rec.common_name ?? ""} ${rec.scientific_name} ${rec.archetype} ${rec.species_code}`.toLowerCase();
    if (!hay.includes(query)) return false;
  }
  if (active.size === 0) return true;
  for (const f of active) {
    if (f === "native" && rec.origin === "Native") return true;
    if (f === "exotic" && rec.origin === "Exotic") return true;
    if (f === "known" && rec.palette_source === "known") return true;
    if (f === "curated" && rec.source?.includes("curated")) return true;
    if (f === rec.iconic_taxon_name) return true;
  }
  return false;
}

function recompute() {
  shown = row.filter(passes);
  render();
}

function buildFilters() {
  const host = document.getElementById("filters");
  const iconic = [...new Set(row.map((r) => r.iconic_taxon_name).filter(Boolean))].sort();
  const spec = [
    { id: "curated", label: "on the walk list" },
    { id: "native", label: "native" },
    { id: "exotic", label: "exotic" },
    { id: "known", label: "real colours" },
    ...iconic.map((k) => ({ id: k, label: k.toLowerCase() })),
  ];
  for (const s of spec) {
    const b = document.createElement("button");
    b.className = "chip";
    b.textContent = s.label;
    b.addEventListener("click", () => {
      if (active.has(s.id)) active.delete(s.id); else active.add(s.id);
      b.classList.toggle("on");
      recompute();
    });
    host.appendChild(b);
  }
}

/* ── boot ──────────────────────────────────────────────────────────────── */

(async function main() {
  manifest = await (await fetch("/model/species-model.json")).json();
  row = manifest.model.map((r, i) => ({ ...r, phase: (i % 17) * 0.37, el: null }));
  shown = row;
  buildFilters();

  /* URL parameters, so a contact sheet for one archetype can be captured
     reproducibly instead of by clicking. ?archetype= is an exact match on the
     manifest field, which ?q= cannot do — searching "tree" also catches every
     species with "tree" in its common name. */
  const param = new URLSearchParams(location.search);
  const arch = param.get("archetype");
  if (arch) {
    row = row.filter((r) => r.archetype === arch);
    shown = row;
  }
  if (param.get("q")) {
    query = param.get("q").toLowerCase();
    document.getElementById("q").value = param.get("q");
  }
  if (param.get("tile")) {
    tile = Number(param.get("tile"));
    document.getElementById("size").value = String(tile);
  }
  if (param.get("still") === "1") {
    spinning = false;
    const b = document.getElementById("spin");
    b.classList.remove("on");
    b.textContent = "still";
  }
  applyGridSize();
  recompute();

  document.getElementById("q").addEventListener("input", (e) => {
    query = e.target.value.trim().toLowerCase();
    recompute();
  });
  document.getElementById("size").addEventListener("input", (e) => {
    tile = Number(e.target.value);
    applyGridSize();
  });
  document.getElementById("spin").addEventListener("click", (e) => {
    spinning = !spinning;
    e.target.classList.toggle("on", spinning);
    e.target.textContent = spinning ? "spinning" : "still";
  });
  document.getElementById("anim").addEventListener("click", (e) => {
    showAnim = !showAnim;
    e.target.classList.toggle("on", showAnim);
  });
  document.getElementById("labels").addEventListener("click", (e) => {
    document.body.classList.toggle("no-label");
    e.target.classList.toggle("on");
  });

  requestAnimationFrame(frame);
})();
