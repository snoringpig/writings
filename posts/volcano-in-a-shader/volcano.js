// Volcano in a Shader: page logic. Needs shaders.js (CHUNKS, STEP_CHUNKS, shaderForStep, ...)
// and renderer.js (ShaderRenderer) loaded first. VS_DATA is filled in by the build script.
(function () {
'use strict';
const VS_DATA = {"names": {"1": "Ray & sky", "2": "First mountain", "3": "Gullies", "4": "Sky light & shadow", "5": "Rock & snow", "6": "Second mountain", "7": "Forest", "8": "Air", "9": "Clouds", "10": "Film"}, "diffstats": {"2": {"pct": 84.2, "mean": 67.6}, "3": {"pct": 40.8, "mean": 11.3}, "4": {"pct": 60.5, "mean": 9.5}, "5": {"pct": 69.5, "mean": 26.5}, "6": {"pct": 40.4, "mean": 17.4}, "7": {"pct": 44.1, "mean": 30.0}, "8": {"pct": 70.4, "mean": 18.1}, "9": {"pct": 14.7, "mean": 17.9}, "10": {"pct": 81.7, "mean": 18.9}}, "times": {"1": {"spp": 2, "s": 0.1}, "2": {"spp": 2, "s": 1.1}, "3": {"spp": 2, "s": 9.9}, "4": {"spp": 2, "s": 16.6}, "5": {"spp": 2, "s": 18.2}, "6": {"spp": 2, "s": 27.3}, "7": {"spp": 3, "s": 394.5}, "8": {"spp": 3, "s": 416.6}, "9": {"spp": 3, "s": 422.7}, "10": {"spp": 3, "s": 389}}};
const IMG = n => 'images/step' + n + '.jpg';
const DIFF = n => 'images/diff' + n + '.jpg';
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

function esc(s) { return s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }
function hl(el) {
  try { if (window.hljs && hljs.getLanguage('glsl')) hljs.highlightElement(el); } catch (e) {}
}
function hlLine(s) {
  try { if (window.hljs && hljs.getLanguage('glsl')) return hljs.highlight(s, { language: 'glsl', ignoreIllegals: true }).value; } catch (e) {}
  return esc(s);
}
async function copyText(text, statusEl) {
  try { await navigator.clipboard.writeText(text); if (statusEl) statusEl.textContent = 'Copied.'; return true; }
  catch (e) { if (statusEl) statusEl.textContent = 'Copy is blocked here; the code is selected instead.'; return false; }
}
function selectNode(node) { const r = document.createRange(); r.selectNodeContents(node); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }

// ---- What changed between two steps, chunk by chunk (chunks with the same role replace each other).
const firstStep = k => { for (let n = 1; n <= 10; n++) if (STEP_CHUNKS[n].includes(k)) return n; return 0; };
function stepChanges(n) {
  const cur = STEP_CHUNKS[n], prev = n > 1 ? STEP_CHUNKS[n - 1] : [];
  const prevByRole = Object.fromEntries(prev.map(k => [roleOf(k), k]));
  return cur.filter(k => !prev.includes(k)).map(k => ({ key: k, role: roleOf(k), old: prevByRole[roleOf(k)] || null }));
}
window.vsStepChanges = stepChanges;   // used by the page check
// Line diff by longest common subsequence: [{t: 'same' | 'add' | 'del', s}]
function lineDiff(a, b) {
  const A = a.replace(/\n$/, '').split('\n'), B = b.replace(/\n$/, '').split('\n'), n = A.length, m = B.length;
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const out = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ t: 'same', s: B[j] }); i++; j++; }
    else if (L[i + 1][j] >= L[i][j + 1]) out.push({ t: 'del', s: A[i++] });
    else out.push({ t: 'add', s: B[j++] });
  }
  while (i < n) out.push({ t: 'del', s: A[i++] });
  while (j < m) out.push({ t: 'add', s: B[j++] });
  return out;
}
function chunkBlock(n, ch) {
  const text = CHUNKS[ch.key];
  const wrap = document.createElement('div'); wrap.className = 'chunk'; wrap.id = 'c' + n + '-' + ch.role;
  const head = document.createElement('div'); head.className = 'chunk-head';
  const lab = document.createElement('span'); lab.className = 'lab';
  const btn = document.createElement('button'); btn.type = 'button'; btn.textContent = 'Copy';
  const pre = document.createElement('pre'); const code = document.createElement('code'); code.className = 'language-glsl';
  if (ch.old) {
    const d = lineDiff(CHUNKS[ch.old], text);
    const add = d.filter(x => x.t === 'add').length, del = d.filter(x => x.t === 'del').length;
    lab.innerHTML = '<span class="st chg">changed</span>' + esc(ch.role) + ' · replaces the version from step ' + firstStep(ch.old) + ' · +' + add + ' / −' + del + ' lines';
    pre.className = 'diff';
    code.innerHTML = d.map(x => '<span class="ln' + (x.t === 'same' ? '' : ' ' + x.t) + '">' + (hlLine(x.s) || ' ') + '</span>').join('');
  } else {
    lab.innerHTML = '<span class="st new">new</span>' + esc(ch.role);
    code.textContent = text.replace(/\n$/, ''); hl(code);
  }
  btn.addEventListener('click', async () => {
    const ok = await copyText(text, null); btn.textContent = ok ? 'Copied' : 'Select';
    if (!ok) selectNode(code); setTimeout(() => btn.textContent = 'Copy', 1500);
  });
  head.append(lab, btn); pre.append(code); wrap.append(head, pre);
  return wrap;
}

// ---- filmstrip
const strip = $('#vs-strip');
if (strip) for (let n = 1; n <= 10; n++) {
  const a = document.createElement('a'); a.href = '#step-' + n;
  const img = document.createElement('img'); img.src = IMG(n); img.alt = ''; img.loading = 'lazy';
  const s = document.createElement('span'); s.innerHTML = '<b>' + n + '</b>' + esc(VS_DATA.names[n]);
  a.append(img, s); strip.append(a);
}

// ---- code blocks and the "In the code" line of each step, generated from STEP_CHUNKS so they list
// exactly the chunks that differ between this step's shader and the previous one's
$$('.vcode[data-step]').forEach(div => {
  const n = +div.dataset.step, changes = stepChanges(n);
  changes.forEach(ch => div.append(chunkBlock(n, ch)));
  const list = $('.added[data-step="' + n + '"] .chg');
  if (list) changes.forEach(ch => {
    const a = document.createElement('a'); a.href = '#c' + n + '-' + ch.role;
    a.innerHTML = '<b>' + (ch.old ? 'changed' : 'new') + '</b>' + esc(ch.role);
    list.append(a);
  });
});
$$('details.full[data-step]').forEach(d => {
  const n = +d.dataset.step;
  $('summary', d).textContent = 'Full shader for step ' + n + ' (' + shaderForStep(n).split('\n').length + ' lines)';
  d.addEventListener('toggle', () => {
    if (!d.open || d.dataset.filled) return;
    d.dataset.filled = '1';
    const inner = $('.inner', d);
    const ctl = document.createElement('div'); ctl.className = 'ctl';
    const b1 = document.createElement('button'); b1.type = 'button'; b1.textContent = 'Copy WebGL2 shader';
    const b2 = document.createElement('button'); b2.type = 'button'; b2.textContent = 'Copy for Shadertoy';
    const st = document.createElement('span'); st.className = 'status';
    const block = document.createElement('div'); block.className = 'chunk';
    const pre = document.createElement('pre'); const code = document.createElement('code'); code.className = 'language-glsl';
    code.textContent = shaderForStep(n); pre.append(code); block.append(pre);
    b1.onclick = async () => { if (!await copyText(shaderForStep(n), st)) selectNode(code); };
    b2.onclick = async () => { if (!await copyText(shadertoyForStep(n), st)) { code.textContent = shadertoyForStep(n); selectNode(code); } };
    ctl.append(b1, b2, st); inner.append(ctl, block); hl(code);
  });
});

// ---- timing table
const tb = $('#vs-times');
if (tb) for (let n = 1; n <= 10; n++) {
  const tr = document.createElement('tr'), t = VS_DATA.times[n];
  tr.innerHTML = '<td>' + n + ' · ' + esc(VS_DATA.names[n]) + '</td><td>' + t.spp + ' × ' + t.spp + '</td><td>' + t.s.toFixed(1) + ' s</td>';
  tb.append(tr);
}

// ---- live rendering: one shared WebGL2 context, created on first use
let R = null, rErr = null;
function renderer() {
  if (R || rErr) return R;
  try { R = new ShaderRenderer(); } catch (e) { rErr = e; }
  return R;
}
function liveSize(frame) {
  const w = Math.max(160, Math.min(960, Math.round(frame.clientWidth * Math.min(window.devicePixelRatio || 1, 2))));
  return [w, Math.round(w * 3 / 4)];
}

// ---- each step's figure: view switch (this step / previous step / what changed) and live render
$$('figure.render[data-step]').forEach(fig => {
  const n = +fig.dataset.step;
  const frame = $('.frame', fig), img = $('img', frame), tag = $('.tag', frame);
  const canvas = document.createElement('canvas'); canvas.hidden = true; frame.insertBefore(canvas, $('.bar', frame));
  const bar = $('.bar', frame), note = $('.diffnote', fig);
  const btn = $('button.go', fig), sel = $('select', fig), st = $('.status', fig), back = $('button.back', fig);
  const viewBtns = $$('.views button', fig);
  const cap = st.textContent;
  function show(view) {
    canvas.hidden = true; img.hidden = false; back.hidden = true; st.textContent = cap;
    img.src = view === 'prev' ? IMG(n - 1) : view === 'diff' ? DIFF(n) : IMG(n);
    tag.textContent = view === 'prev' ? 'Step ' + (n - 1) : view === 'diff' ? 'Changes, step ' + (n - 1) + ' → ' + n : 'Step ' + n;
    viewBtns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    if (note) note.hidden = view !== 'diff';
  }
  viewBtns.forEach(b => b.addEventListener('click', () => show(b.dataset.view)));
  const ds = VS_DATA.diffstats[n];
  if (note && ds) note.textContent = 'Bright = changed since step ' + (n - 1) + ' (changes under 6 of 255 levels are not drawn). ' + ds.pct + '% of pixels changed by more than 8 levels; mean change ' + ds.mean + ' levels.';
  show('cur');
  btn.addEventListener('click', async () => {
    const r = renderer();
    if (!r) { st.textContent = 'This browser has no WebGL2: ' + rErr.message; return; }
    const spp = +sel.value, [w, h] = liveSize(frame);
    show('cur');
    btn.disabled = true; st.textContent = 'Compiling…'; bar.style.width = '0';
    canvas.hidden = false; img.hidden = true; back.hidden = false; tag.textContent = 'Step ' + n + ', live';
    try {
      const ms = await r.render(shaderForStep(n), canvas, { width: w, height: h, spp, uniforms: DEFAULT_UNIFORMS,
        onProgress: f => { bar.style.width = (100 * f).toFixed(1) + '%'; st.textContent = 'Rendering ' + Math.round(100 * f) + '%'; } });
      st.textContent = 'Rendered on this device: ' + w + ' × ' + h + ', ' + spp + ' × ' + spp + ' samples, ' + (ms / 1000).toFixed(1) + ' s';
    } catch (e) { st.textContent = 'Render failed: ' + e.message.split('\n').slice(0, 3).join(' '); }
    btn.disabled = false; setTimeout(() => bar.style.width = '0', 600);
  });
  back.addEventListener('click', () => show('cur'));
});

// ---- step 2 diagram: the real base-cone profile along the view axis, to scale
(function profile() {
  const svg = $('#vs-profile'); if (!svg) return;
  const H = 3.67, L = 1.64, A = 0.8, zc = -7.6, xc = -0.52;
  const vol = (x, z) => { const r = Math.hypot((x - xc) / 2.0, z - zc); return H * Math.exp(-Math.sqrt(r * r + A * A) / L); };
  const W = 640, Ht = 250, m = { l: 44, r: 14, t: 14, b: 34 };
  const k = (W - m.l - m.r) / 9;                         // px per km, the same on both axes
  const sx = d => m.l + d * k, sy = y => Ht - m.b - y * k;
  let path = '', fill = 'M' + sx(0) + ',' + sy(0);
  for (let i = 0; i <= 180; i++) {
    const d = i / 180 * 9, y = vol(xc, -d);
    path += (i ? 'L' : 'M') + sx(d).toFixed(1) + ',' + sy(y).toFixed(1); fill += 'L' + sx(d).toFixed(1) + ',' + sy(y).toFixed(1);
  }
  fill += 'L' + sx(9) + ',' + sy(0) + 'Z';
  let g = '';
  for (let d = 0; d <= 9; d++) g += '<line class="grid" x1="' + sx(d) + '" y1="' + sy(0) + '" x2="' + sx(d) + '" y2="' + sy(3) + '"/><text x="' + sx(d) + '" y="' + (sy(0) + 16) + '" text-anchor="middle">' + d + '</text>';
  for (let y = 0; y <= 3; y++) g += '<line class="grid" x1="' + sx(0) + '" y1="' + sy(y) + '" x2="' + sx(9) + '" y2="' + sy(y) + '"/><text x="' + (sx(0) - 8) + '" y="' + (sy(y) + 4) + '" text-anchor="end">' + y + '</text>';
  const cam = [0, 0.70], pitch = Math.atan2(0.66 - 0.70, 7.6), half = 15 * Math.PI / 180;
  const ray = a => [cam[0] + 9.2 * Math.cos(a), cam[1] + 9.2 * Math.sin(a)];
  const up = ray(pitch + half), dn = ray(pitch - half);
  const slopeAt = d => { const e = 0.01; return Math.atan(Math.abs(vol(xc, -(d + e)) - vol(xc, -(d - e))) / (2 * e)) * 180 / Math.PI; };
  let ann = '';
  [6.6, 5.6, 4.6, 3.6].forEach(d => { const y = vol(xc, -d); ann += '<circle class="dota" cx="' + sx(d) + '" cy="' + sy(y) + '" r="2.5"/><text x="' + (sx(d) - 6) + '" y="' + (sy(y) - 7) + '" text-anchor="end">' + Math.round(slopeAt(d)) + '°</text>'; });
  // the lower field-of-view edge meets the ground plane y = 0 before 9 km: stop it there
  const tGround = cam[1] / -Math.sin(pitch - half), dnEnd = [cam[0] + tGround * Math.cos(pitch - half), 0];
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + Ht);
  svg.innerHTML = g +
    '<path class="fillg" d="' + fill + '"/><path class="ink" stroke-width="1.6" d="' + path + '"/>' +
    '<line class="acc" stroke-dasharray="4 3" x1="' + sx(cam[0]) + '" y1="' + sy(cam[1]) + '" x2="' + sx(up[0]) + '" y2="' + sy(up[1]) + '"/>' +
    '<line class="acc" stroke-dasharray="4 3" x1="' + sx(cam[0]) + '" y1="' + sy(cam[1]) + '" x2="' + sx(dnEnd[0]) + '" y2="' + sy(dnEnd[1]) + '"/>' +
    '<circle class="dot" cx="' + sx(cam[0]) + '" cy="' + sy(cam[1]) + '" r="3.5"/><text x="' + (sx(0) + 8) + '" y="' + (sy(0.70) - 8) + '">camera</text>' + ann +
    '<text x="' + sx(4.5) + '" y="' + (Ht - 4) + '" text-anchor="middle">distance from the camera along the view axis (km)</text>' +
    '<text x="12" y="' + sy(1.5) + '" transform="rotate(-90 12 ' + sy(1.5) + ')" text-anchor="middle">height (km)</text>';
})();

// ---- playground: the final shader with its five parameters exposed
(function play() {
  if (!$('#s-az')) return;
  const ids = ['az', 'el', 'snow', 'tree', 'cloud'];
  const inp = Object.fromEntries(ids.map(k => [k, $('#s-' + k)]));
  const out = Object.fromEntries(ids.map(k => [k, $('#o-' + k)]));
  const sun0 = DEFAULT_UNIFORMS.uSun;
  const defaults = { az: Math.round(Math.atan2(sun0[0], sun0[2]) * 180 / Math.PI), el: Math.round(Math.asin(sun0[1]) * 180 / Math.PI),
                     snow: DEFAULT_UNIFORMS.uSnowline, tree: DEFAULT_UNIFORMS.uTreeline, cloud: DEFAULT_UNIFORMS.uCloud };
  const img = $('#play-img'), canvas = $('#play-canvas'), bar = $('#play-bar'), st = $('#play-status');
  function values() {
    const az = +inp.az.value * Math.PI / 180, el = +inp.el.value * Math.PI / 180;
    return { uSun: [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)],
             uSnowline: +inp.snow.value, uTreeline: +inp.tree.value, uCloud: +inp.cloud.value };
  }
  function label() {
    out.az.textContent = inp.az.value + '°'; out.el.textContent = inp.el.value + '°';
    out.snow.textContent = (+inp.snow.value).toFixed(2) + ' km'; out.tree.textContent = (+inp.tree.value).toFixed(2) + ' km';
    out.cloud.textContent = Math.round(100 * inp.cloud.value) + '%';
  }
  function reset() { for (const k of ids) inp[k].value = defaults[k]; label(); }
  reset();
  let timer = null, pending = false, running = false;
  async function go() {
    if (running) { pending = true; return; }
    const r = renderer();
    if (!r) { st.textContent = 'This browser has no WebGL2: ' + rErr.message; return; }
    running = true; img.hidden = true; canvas.hidden = false;
    try {
      const ms = await r.render(shaderForStep(10), canvas, { width: 480, height: 360, spp: 1, uniforms: values(),
        onProgress: f => { bar.style.width = (100 * f).toFixed(1) + '%'; } });
      st.textContent = 'Rendered on this device in ' + (ms / 1000).toFixed(1) + ' s (480 × 360).';
    } catch (e) { st.textContent = 'Render failed: ' + e.message.split('\n')[0]; }
    bar.style.width = '0'; running = false;
    if (pending) { pending = false; go(); }
  }
  ids.forEach(k => inp[k].addEventListener('input', () => { label(); st.textContent = 'Rendering…'; clearTimeout(timer); timer = setTimeout(go, 350); }));
  $('#play-reset').addEventListener('click', () => { reset(); go(); });
  $('#play-copy').addEventListener('click', async () => {
    const s = $('#play-copy-status');
    if (!await copyText(shadertoyForStep(10, values()), s)) s.textContent = 'Copy is blocked here; use "Full shader" in step 10.';
  });
})();
})();
