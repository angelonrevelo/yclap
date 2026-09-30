/**
 * Species-model gallery — a hand-rolled WebGL2 glTF viewer, no dependencies.
 * The Field Guide app itself will render models through <model-viewer> (build
 * spec T4.1); this page is the inspection bench for the whole pack and the
 * render target for deck screenshots (?shot=<species_code>).
 *
 * Rig inspection (09-30, Gelo `1:35`: "his limbs are not connected"): a limb
 * that swings off its joint is only visible mid-clip, so a still of the rest
 * pose proves nothing. These pin the clip at one moment instead:
 *   &t=<seconds>     freeze the clip there (no auto-rotate)
 *   &clip=<name>     which clip to play (default: the first; e.g. walk, idle)
 *   &yaw=<rad>       camera yaw; &pitch=<rad>; &zoom=<factor> (<1 is closer)
 *   &file=<path>     load any .glb under /model/ by path, e.g. character-hiker.glb
 */
const params = new URLSearchParams(location.search);
const SHOT = params.get("shot") ?? (params.get("file") ? "file" : null);
const FREEZE = params.has("t") ? Number(params.get("t")) : null;
if (SHOT) document.body.classList.add("shot");

const canvas = document.getElementById("gl");
const gl = canvas.getContext("webgl2", { antialias: true, alpha: true });
if (!gl) {
  document.getElementById("loadmsg").textContent = "WebGL2 unavailable in this browser";
  throw new Error("no webgl2");
}

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
uniform vec3 uLight; uniform float uAlpha;
out vec4 frag;
void main() {
  vec3 n = normalize(vNrm);
  float d = max(dot(n, uLight), 0.0);
  float lit = 0.62 + 0.38 * d;
  frag = vec4(vCol * lit, uAlpha);
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
  alpha: gl.getUniformLocation(prog, "uAlpha"),
};
gl.enable(gl.DEPTH_TEST);
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
gl.uniform3f(U.light, 0.5, 0.8, 0.6);
gl.clearColor(0, 0, 0, 0);

// ---- tiny mat4 ----
function mat() { return new Float32Array(16); }
function ident(m) { m.fill(0); m[0] = m[5] = m[10] = m[15] = 1; return m; }
function mul(a, b, out) {
  out = out ?? mat();
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let v = 0;
    for (let k = 0; k < 4; k++) v += a[k * 4 + r] * b[c * 4 + k];
    out[c * 4 + r] = v;
  }
  return out;
}
function trs(m, t, q, s) {
  const x = q[0], y = q[1], z = q[2], w = q[3];
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
  m[0] = f / aspect; m[5] = f; m[10] = (far + near) / (near - far);
  m[11] = -1; m[14] = (2 * far * near) / (near - far);
  return m;
}
function lookAt(m, eye, target, up) {
  const z = norm3([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const x = norm3(cross(up, z));
  const y = cross(z, x);
  m.set([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]),
    -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]),
    -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]), 1,
  ]);
  return m;
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm3 = (v) => { const l = Math.hypot(...v) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
function nlerp(a, b, t) {
  const o = new Array(4);
  for (let i = 0; i < 4; i++) o[i] = a[i] + (b[i] - a[i]) * t;
  const l = Math.hypot(o[0], o[1], o[2], o[3]) || 1;
  return [o[0] / l, o[1] / l, o[2] / l, o[3] / l];
}

// ---- GLB ----
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
  const view = (i) => bin.subarray(json.bufferViews[i].byteOffset ?? 0, (json.bufferViews[i].byteOffset ?? 0) + json.bufferViews[i].byteLength);
  const acc = (i) => {
    const a = json.accessors[i];
    const b = view(a.bufferView);
    const comp = { 5126: Float32Array, 5123: Uint16Array, 5121: Uint8Array, 5120: Int8Array }[a.componentType];
    const arr = new comp(b.buffer, b.byteOffset, b.byteLength / comp.BYTES_PER_ELEMENT);
    return { arr, type: a.type, componentType: a.componentType, count: a.count, normalized: a.normalized };
  };

  const meshes = json.meshes.map((mesh) => {
    const prim = mesh.primitives[0];
    const posAcc = json.accessors[prim.attributes.POSITION];
    const pos = acc(prim.attributes.POSITION);
    const nrm = acc(prim.attributes.NORMAL);
    const col = acc(prim.attributes.COLOR_0);
    const idx = acc(prim.indices);
    const GL_TYPE = { 5126: gl.FLOAT, 5123: gl.UNSIGNED_SHORT, 5121: gl.UNSIGNED_BYTE, 5120: gl.BYTE };
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const bind = (a, size, name) => {
      const loc = gl.getAttribLocation(prog, name);
      if (loc < 0) throw new Error(`attribute missing: ${name}`);
      const bo = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, bo);
      gl.bufferData(gl.ARRAY_BUFFER, a.arr, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, GL_TYPE[a.componentType], !!a.normalized, 0, 0);
    };
    bind(pos, 3, "aPos"); bind(nrm, 3, "aNrm"); bind(col, 3, "aCol");
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx.arr, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    return { vao, count: idx.count, min: posAcc.min, max: posAcc.max };
  });

  const nodes = json.nodes.map((n) => ({
    mesh: n.mesh,
    children: n.children ?? [],
    t: n.translation ?? [0, 0, 0],
    r: n.rotation ?? [0, 0, 0, 1],
    s: n.scale ?? [1, 1, 1],
    m: ident(mat()),
  }));
  // scene graph: parent pointers for traversal from scene roots
  const roots = json.scenes[0].nodes;

  let anim = null;
  if (json.animations?.length) {
    const a = json.animations.find((c) => c.name === params.get("clip")) ?? json.animations[0];
    anim = {
      duration: Math.max(...a.samplers.map((s) => json.accessors[s.input].max[0])),
      channels: a.channels.map((c) => {
        const smp = a.samplers[c.sampler];
        return {
          node: c.target.node,
          path: c.target.path,
          times: acc(smp.input).arr,
          vals: acc(smp.output).arr,
          vec: c.target.path === "rotation" ? 4 : 3,
        };
      }),
    };
  }
  return { meshes, nodes, roots, anim };
}

function sampleAnim(model, t) {
  const { anim, nodes } = model;
  if (!anim) return;
  const tt = t % anim.duration;
  for (const ch of anim.channels) {
    const { times, vals, vec, node, path } = ch;
    let i = 0;
    while (i < times.length - 2 && times[i + 1] <= tt) i += 1;
    const t0 = times[i], t1 = times[i + 1];
    const span = t1 - t0 || 1;
    const f = Math.min(1, Math.max(0, (tt - t0) / span));
    const a = vals.subarray(i * vec, i * vec + vec);
    const b = vals.subarray((i + 1) * vec, (i + 1) * vec + vec);
    const n = nodes[node];
    const v = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    if (path === "rotation") n.r = nlerp([...a], [...b], f);
    else if (path === "translation") n.t = v;
    else n.s = v;
  }
}

// ---- camera ----
let yaw = params.has("yaw") ? Number(params.get("yaw")) : SHOT ? 0.5 : 0.6;
let pitchCam = params.has("pitch") ? Number(params.get("pitch")) : 0.22, dist = 2.1, auto = !SHOT;
let dragging = false, lx = 0, ly = 0;
canvas.addEventListener("pointerdown", (e) => { dragging = true; lx = e.clientX; ly = e.clientY; });
canvas.addEventListener("pointerup", () => { dragging = false; });
canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  yaw -= (e.clientX - lx) * 0.008;
  pitchCam = Math.max(-0.2, Math.min(1.2, pitchCam + (e.clientY - ly) * 0.006));
  lx = e.clientX; ly = e.clientY;
});
canvas.addEventListener("wheel", (e) => {
  dist = Math.max(0.6, Math.min(6, dist + e.deltaY * 0.002));
  e.preventDefault();
}, { passive: false });

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = canvas.clientWidth * dpr;
  canvas.height = canvas.clientHeight * dpr;
  gl.viewport(0, 0, canvas.width, canvas.height);
}
window.addEventListener("resize", resize);

// ---- scene state ----
let model = null, fit = { cx: 0, cy: 0.45, scale: 1 };
const shadow = makeShadow();

function makeShadow() {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const segs = 24;
  const arr = new Float32Array((segs + 2) * 3);
  for (let i = 0; i <= segs; i++) {
    const a = (i / segs) * Math.PI * 2;
    arr[i * 3] = Math.cos(a); arr[i * 3 + 1] = 0; arr[i * 3 + 2] = Math.sin(a);
  }
  const bo = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, bo);
  gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const ib = gl.createBuffer();
  const idx = [];
  for (let i = 0; i <= segs; i++) idx.push(0, i + 1, i + 2);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, count: idx.length };
}

function drawNode(n, parent) {
  const world = mul(parent, n.m);
  if (n.mesh != null) {
    const mesh = model.meshes[n.mesh];
    gl.uniformMatrix4fv(U.model, false, world);
    gl.bindVertexArray(mesh.vao);
    gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    DEBUG.draws += 1;
  }
  if (n.name && n.name.startsWith("frond0")) DEBUG.frond = [...world].slice(12, 15).map((v) => +v.toFixed(3));
  for (const c of n.children) drawNode(model.nodes[c], world);
}
const DEBUG = { draws: 0 };

let t0 = performance.now();
function frame(now) {
  const t = FREEZE ?? (now - t0) / 1000;
  DEBUG.draws = 0;
  if (auto) yaw += 0.004;
  if (model?.anim) sampleAnim(model, t);
  // evaluate node matrices
  for (const n of model?.nodes ?? []) trs(n.m, n.t, n.r, n.s);
  resize();
  const aspect = canvas.width / Math.max(1, canvas.height);
  const proj = perspective(mat(), 0.72, aspect, 0.05, 60);
  const eye = [
    fit.cx + Math.sin(yaw) * Math.cos(pitchCam) * dist,
    fit.cy + Math.sin(pitchCam) * dist,
    fit.cz + Math.cos(yaw) * Math.cos(pitchCam) * dist,
  ];
  const view = lookAt(mat(), eye, [fit.cx, fit.cy, fit.cz], [0, 1, 0]);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.uniformMatrix4fv(U.proj, false, proj);
  gl.uniformMatrix4fv(U.view, false, view);
  if (model) {
    // blob shadow
    gl.uniform1f(U.alpha, 0.16);
    const sm = ident(mat());
    sm[0] = fit.shadowRx; sm[10] = fit.shadowRz; sm[13] = 0.004;
    gl.depthMask(false);
    gl.uniformMatrix4fv(U.model, false, mul(mul(mat4Translate([fit.cx, 0, fit.cz]), sm), mat4Identity()));
    gl.bindVertexArray(shadow.vao);
    gl.drawElements(gl.TRIANGLES, shadow.count, gl.UNSIGNED_SHORT, 0);
    gl.depthMask(true);
    gl.uniform1f(U.alpha, 1);
    for (const r of model.roots) drawNode(model.nodes[r], ident(mat()));
  }
  if (params.get("debug")) {
    const dbg = document.getElementById("pmeta");
    const node0 = model?.nodes?.[model.roots?.[0] ?? 0];
    dbg.textContent = JSON.stringify({
      draws: DEBUG.draws, err: gl.getError(),
      roots: model?.roots, nodeCount: model?.nodes?.length,
      m0: node0 && { t: node0.t, r: node0.r, s: node0.s, mesh: node0.mesh },
      frondWorld: DEBUG.frond,
      dist, anim: !!model?.anim,
    });
    dbg.style.display = "block";
  }
  requestAnimationFrame(frame);
}
function mat4Translate(t) { const m = ident(mat()); m[12] = t[0]; m[13] = t[1]; m[14] = t[2]; return m; }
function mat4Identity() { return ident(mat()); }

function computeFit(m) {
  let min = [1e9, 1e9, 1e9], max = [-1e9, -1e9, -1e9];
  // accumulate parent translations so nested chains land in the frame
  const walk = (ni, off) => {
    const n = m.nodes[ni];
    const t = [off[0] + n.t[0], off[1] + n.t[1], off[2] + n.t[2]];
    if (n.mesh != null) {
      const mesh = m.meshes[n.mesh];
      if (mesh.min) {
        for (let k = 0; k < 3; k++) {
          min[k] = Math.min(min[k], mesh.min[k] + t[k]);
          max[k] = Math.max(max[k], mesh.max[k] + t[k]);
        }
      }
    }
    for (const c of n.children) walk(c, t);
  };
  for (const r of m.roots) walk(r, [0, 0, 0]);
  const cx = (min[0] + max[0]) / 2, cz = (min[2] + max[2]) / 2;
  const h = Math.max(0.1, max[1]);
  const span = Math.max(max[0] - min[0], max[2] - min[2], h);
  fit = {
    cx, cz, cy: h * 0.45,
    shadowRx: (max[0] - min[0]) * 0.62 + 0.05,
    shadowRz: (max[2] - min[2]) * 0.62 + 0.05,
  };
  dist = ((span * 1.6) / (2 * Math.tan(0.36)) + 0.3) * Number(params.get("zoom") ?? 1);
}

// ---- UI ----
let manifest = null, filtered = [], current = -1, playing = false, playTimer = null;
const GROUPS = ["Aves", "Mammalia", "Amphibia", "Reptilia", "Actinopterygii", "Insecta", "Arachnida", "Mollusca", "Animalia", "Plantae", "Fungi"];

async function main() {
  manifest = await (await fetch("/model/species-model.json")).json();
  // the companion character's four stages ride along at the top of the list
  manifest.model.unshift(
    { species_code: "character-egg", scientific_name: "Stage 1", common_name: "Companion — Egg", iconic_taxon_name: "Character", archetype: "egg", file: "character-egg.glb", count: null },
    { species_code: "character-seedling", scientific_name: "Stage 2", common_name: "Companion — Seedling", iconic_taxon_name: "Character", archetype: "seedling", file: "character-seedling.glb", count: null },
    { species_code: "character-sapling", scientific_name: "Stage 3", common_name: "Companion — Sapling", iconic_taxon_name: "Character", archetype: "sapling", file: "character-sapling.glb", count: null },
    { species_code: "character-tree", scientific_name: "Stage 4", common_name: "Companion — Tree", iconic_taxon_name: "Character", archetype: "tree", file: "character-tree.glb", count: null },
    { species_code: "character-hiker", scientific_name: "Map avatar proposal (?avatar=hiker) — &clip=walk", common_name: "Hiker (proposal)", iconic_taxon_name: "Character", archetype: "hiker", file: "character-hiker.glb", count: null },
  );
  const totalMb = manifest.model.reduce((s, e) => s + (e.bytes ?? 0), 0) / 1048576;
  document.getElementById("stats").innerHTML =
    `<b>${manifest.model.length}</b> species · ${totalMb.toFixed(1)} MB of .glb<br>` +
    `iNat sweep ${manifest.fetched_at?.slice(0, 10)} · campus box`;
  document.getElementById("credit").innerHTML =
    `species list: iNaturalist observations in the campus box (© iNat users, CC-BY-NC) + the curated guide list.<br>` +
    `models: generated for this project — flat-shaded low-poly, no textures.`;

  const filters = document.getElementById("filters");
  let group = null;
  for (const g of GROUPS) {
    const b = document.createElement("button");
    b.textContent = g;
    b.onclick = () => { group = group === g ? null : g; renderList(); };
    filters.appendChild(b);
    b.dataset.group = g;
  }
  filters.addEventListener("click", () => {
    for (const b of filters.children) b.classList.toggle("on", b.dataset.group === group);
  });

  const search = document.getElementById("search");
  search.addEventListener("input", () => renderList());

  function renderList() {
    const q = search.value.trim().toLowerCase();
    filtered = manifest.model.filter((e) =>
      (!group || e.iconic_taxon_name === group) &&
      (!q || `${e.common_name} ${e.scientific_name} ${e.species_code}`.toLowerCase().includes(q)));
    const list = document.getElementById("list");
    list.innerHTML = "";
    const frag = document.createDocumentFragment();
    filtered.forEach((e, i) => {
      const b = document.createElement("button");
      b.innerHTML = `<span class="dot" style="background:${dotColor(e)}"></span>` +
        `<span class="nm"><b>${e.common_name ?? e.scientific_name}</b><i>${e.scientific_name}</i></span>` +
        `<span class="ct">${e.count ?? "★"}</span>`;
      b.onclick = () => select(i, true);
      b.dataset.i = String(i);
      frag.appendChild(b);
    });
    list.appendChild(frag);
    if (SHOT) {
      const idx = filtered.findIndex((e) => e.species_code === SHOT);
      if (idx >= 0) select(idx, false);
    }
  }

  if (params.get("file")) {
    const file = params.get("file");
    manifest.model.unshift({ species_code: "file", scientific_name: file, common_name: file, iconic_taxon_name: "Character", archetype: "file", file, count: null });
    renderList();
  } else if (SHOT) {
    renderList();
  } else {
    renderList();
    if (filtered.length) select(0, false);
  }
}

function dotColor(e) {
  const map = { Aves: "#3a8ad8", Mammalia: "#b58a5a", Amphibia: "#58a942", Reptilia: "#7a9a3a", Actinopterygii: "#4ab5d8", Insecta: "#e8b62a", Arachnida: "#8a5ad8", Mollusca: "#c07a3a", Animalia: "#999", Plantae: "#45c223", Fungi: "#d86a8a" };
  return map[e.iconic_taxon_name] ?? "#999";
}

async function select(i, user) {
  current = i;
  const e = filtered[i];
  if (!e) return;
  for (const b of document.getElementById("list").children) b.classList.toggle("on", Number(b.dataset.i) === i);
  document.getElementById("loadmsg").style.display = "none";
  document.getElementById("pname").textContent = e.common_name ?? e.scientific_name;
  document.getElementById("psci").textContent = e.scientific_name;
  document.getElementById("pmeta").innerHTML =
    `<em>${e.iconic_taxon_name ?? "?"}</em><em>${e.archetype}</em>` +
    (e.count != null ? `<em>${e.count} obs</em>` : "") +
    (e.origin ? `<em>${e.origin}</em>` : "");
  model = await loadGlb(`/model/${e.file}`);
  computeFit(model);
  t0 = performance.now();
  if (user) history.replaceState(null, "", `?p=${encodeURIComponent(e.species_code)}`);
}

document.getElementById("prev").onclick = () => select((current - 1 + filtered.length) % filtered.length, true);
document.getElementById("next").onclick = () => select((current + 1 + filtered.length) % filtered.length, true);
const playBtn = document.getElementById("play");
playBtn.onclick = () => {
  playing = !playing;
  playBtn.classList.toggle("on", playing);
  playBtn.textContent = playing ? "❚❚ pause" : "▶ play";
  if (playing) {
    playTimer = setInterval(() => select((current + 1) % filtered.length, true), 3800);
  } else clearInterval(playTimer);
};

requestAnimationFrame(frame);
main();
