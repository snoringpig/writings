// 3D view for "From the instrument to your ear".
// Four instruments; for each: the vibrating part, the surface that pushes the air (highlighted), and the
// air pressure on a vertical slice, summed from point sources on that surface (time-harmonic, retarded:
// each source adds q e^{-ikd}/d). Time is slowed to one swing per 1.6 s; wavelengths are to scale (metres).
import * as THREE from 'three';
import { OrbitControls } from './OrbitControls.js';

const root = document.getElementById('ear3d');

function webglOK() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch (e) { return false; }
}

function css(name, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return new THREE.Color(v || fallback);
}

// Bessel function J_m(x) = (1/pi) * integral_0^pi cos(m t - x sin t) dt, by Simpson's rule.
function besselJ(m, x) {
  const N = 64, h = Math.PI / N;
  let s = 0;
  for (let i = 0; i <= N; i++) {
    const t = i * h, w = (i === 0 || i === N) ? 1 : (i % 2 ? 4 : 2);
    s += w * Math.cos(m * t - x * Math.sin(t));
  }
  return s * h / 3 / Math.PI;
}

// Clamped-free bar (kalimba tine): X(xi) = cosh(b xi) - cos(b xi) - s (sinh(b xi) - sin(b xi)), xi = x / length.
const BAR = [
  { b: 1.8751, s: 0.7341, ratio: 1 },
  { b: 4.6941, s: 1.0185, ratio: 6.267 },
  { b: 7.8548, s: 0.9992, ratio: 17.55 },
];
function barX(m, xi) {
  const { b, s } = BAR[m];
  return Math.cosh(b * xi) - Math.cos(b * xi) - s * (Math.sinh(b * xi) - Math.sin(b * xi));
}

// A disc (or ellipse) mesh in the x-z plane with interior rings, so it can bend.
function discGeometry(rings, sectors, ax, az) {
  const pos = [0, 0, 0], rr = [0], th = [0], idx = [];
  for (let i = 1; i <= rings; i++) {
    for (let j = 0; j < sectors; j++) {
      const t = 2 * Math.PI * j / sectors, r = i / rings;
      pos.push(ax * r * Math.cos(t), 0, az * r * Math.sin(t));
      rr.push(r); th.push(t);
    }
  }
  const v = (i, j) => 1 + (i - 1) * sectors + (j % sectors);
  for (let j = 0; j < sectors; j++) idx.push(0, v(1, j + 1), v(1, j));
  for (let i = 1; i < rings; i++) {
    for (let j = 0; j < sectors; j++) {
      idx.push(v(i, j), v(i, j + 1), v(i + 1, j + 1), v(i, j), v(i + 1, j + 1), v(i + 1, j));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geom: g, r: rr, th };
}

// Point sources on a disc/ellipse: rings x sectors, each with its area.
function discSources(rings, sectors, ax, az, shape) {
  const out = [];
  for (let i = 0; i < rings; i++) {
    const r0 = i / rings, r1 = (i + 1) / rings, r = (r0 + r1) / 2;
    const area = Math.PI * (r1 * r1 - r0 * r0) * ax * az / sectors;
    for (let j = 0; j < sectors; j++) {
      const t = 2 * Math.PI * (j + 0.5 * (i % 2)) / sectors;
      out.push({ x: ax * r * Math.cos(t), y: 0.002, z: az * r * Math.sin(t), area, r, t });
    }
  }
  return out;
}

function start() {
  const canvas = root.querySelector('canvas');
  const fallback = root.querySelector('.e3-fallback');
  const live = root.querySelectorAll('.e3-live');
  if (!webglOK()) {
    const note = root.querySelector('.e3-note');
    if (note) note.style.display = '';
    return;
  }
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const C = {
    accent: css('--accent', '#2e4bb0'), pos: css('--pos', '#c9572f'), neg: css('--neg', '#2b67b3'),
    panel: css('--panel', '#f2f3f0'), wood: css('--wood', '#b58a5a'), metal: css('--metal', '#8e96a3'),
    ink: css('--ink', '#1c2230'), muted: css('--muted', '#586070'),
  };

  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8890a0, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(1, 2, 1.5);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(40, 1, 0.01, 50);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;

  const mat = {
    wood: new THREE.MeshStandardMaterial({ color: C.wood, roughness: 0.75 }),
    woodDark: new THREE.MeshStandardMaterial({ color: C.wood.clone().multiplyScalar(0.7), roughness: 0.8 }),
    metal: new THREE.MeshStandardMaterial({ color: C.metal, roughness: 0.35, metalness: 0.6 }),
    ink: new THREE.MeshStandardMaterial({ color: C.ink, roughness: 0.5, transparent: true, opacity: 0.45 }),
    accentLine: new THREE.MeshStandardMaterial({ color: C.accent, roughness: 0.4 }),
    surface: new THREE.MeshStandardMaterial({ color: C.accent, emissive: C.accent, emissiveIntensity: 0.25, roughness: 0.6,
      transparent: true, opacity: 0.8, side: THREE.DoubleSide }),
  };

  // ---------- the pressure slice ----------
  const G = 80;
  const texData = new Uint8Array(G * G * 4);
  const tex = new THREE.DataTexture(texData, G, G, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  const slice = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  slice.renderOrder = 2;
  scene.add(slice);
  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)),
    new THREE.LineBasicMaterial({ color: C.muted, transparent: true, opacity: 0.6 }));
  scene.add(frame);

  // ---------- instruments ----------
  const INST = {};

  // String and soundboard (a guitar): the board is an ellipse in the x-z plane; the string runs above it to the bridge.
  INST.string = (() => {
    const grp = new THREE.Group();
    const A = 0.24, B = 0.18, xN = -0.55, xB = 0.1, yS = 0.032;
    const board = discGeometry(16, 48, A, B);
    const boardMesh = new THREE.Mesh(board.geom, mat.surface); grp.add(boardMesh);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.1, 64, 1, true), mat.woodDark);
    body.scale.set(A, 1, B); body.position.y = -0.05; grp.add(body);
    const back = new THREE.Mesh(new THREE.CircleGeometry(1, 64), mat.woodDark);
    back.rotation.x = Math.PI / 2; back.scale.set(A, B, 1); back.position.y = -0.1; grp.add(back);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.02, 0.05), mat.wood); neck.position.set(-0.41, 0.01, 0); grp.add(neck);
    const nut = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.012, 0.05), mat.metal); nut.position.set(xN, 0.026, 0); grp.add(nut);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.026, 0.09), mat.wood); bridge.position.set(xB, 0.013, 0); grp.add(bridge);
    const strGeom = new THREE.CylinderGeometry(0.003, 0.003, xB - xN, 6, 120);
    strGeom.rotateZ(Math.PI / 2); strGeom.translate((xN + xB) / 2, yS, 0);
    const str = new THREE.Mesh(strGeom, mat.accentLine); grp.add(str);
    const strBase = Float32Array.from(strGeom.attributes.position.array);
    const boardBase = Float32Array.from(board.geom.attributes.position.array);
    const phi = r => Math.cos(Math.PI / 2 * r);               // the board's breathing shape, zero at the rim
    const srcs = discSources(10, 15, A, B);
    const f1 = 196;
    return {
      grp, f: m => f1 * (m + 1), labels: ['n = 1 · 196 Hz', 'n = 2 · 392 Hz', 'n = 3 · 588 Hz'],
      plane: { x0: -1.0, x1: 1.0, y0: 0.0, y1: 1.3 }, cam: { t: [0.05, 0.36, 0], p: [0.72, 0.8, 1.95] }, norm: 'mode',
      sources: m => srcs.map(s => ({ x: s.x, y: s.y, z: s.z, q: -phi(s.r) * s.area * (m % 2 ? -1 : 1) })),
      read: m => 'Every point of the soundboard pushes the air, but all of them are driven through the bridge: one input, F(t). '
        + 'Wavelength ' + (343 / (f1 * (m + 1))).toFixed(2) + ' m.',
      update(m, c) {
        const n = m + 1, p = strGeom.attributes.position, a = p.array;
        for (let i = 0; i < a.length; i += 3) {
          const s = (strBase[i] - xN) / (xB - xN);
          a[i + 1] = strBase[i + 1] + 0.03 * Math.sin(n * Math.PI * s) * c;
        }
        p.needsUpdate = true;
        const b = board.geom.attributes.position, ba = b.array, sign = m % 2 ? -1 : 1;
        for (let k = 0; k < board.r.length; k++) ba[3 * k + 1] = boardBase[3 * k + 1] + 0.008 * sign * phi(board.r[k]) * c;
        b.needsUpdate = true; board.geom.computeVertexNormals();
      },
    };
  })();

  // Drum: a skin of radius a on a kettle; modes J_m(j r / a) cos(m theta).
  INST.drum = (() => {
    const grp = new THREE.Group(), a = 0.33;
    const skin = discGeometry(20, 64, a, a);
    grp.add(new THREE.Mesh(skin.geom, mat.surface));
    const pts = [];
    for (let i = 0; i <= 16; i++) { const t = i / 16; pts.push(new THREE.Vector2(a * Math.sqrt(1 - t * t * 0.85), -0.3 * t)); }
    const kettle = new THREE.Mesh(new THREE.LatheGeometry(pts, 64), new THREE.MeshStandardMaterial({ color: C.wood, metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide }));
    grp.add(kettle);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(a, 0.008, 8, 96), mat.metal); rim.rotation.x = Math.PI / 2; grp.add(rim);
    const base = Float32Array.from(skin.geom.attributes.position.array);
    const MODES = [{ m: 0, j: 2.4048, ratio: 1 }, { m: 1, j: 3.8317, ratio: 1.594 }, { m: 2, j: 5.1356, ratio: 2.136 }];
    MODES.forEach(M => { let mx = 0; for (let x = 0; x <= M.j; x += M.j / 200) mx = Math.max(mx, Math.abs(besselJ(M.m, x))); M.max = mx; });
    const X = (M, r, t) => besselJ(M.m, M.j * r) * Math.cos(M.m * t) / M.max;
    const skinShape = MODES.map(M => skin.r.map((r, k) => X(M, r, skin.th[k])));
    const srcs = discSources(10, 15, a, a);
    const f01 = 87.8;
    return {
      grp, f: m => f01 * MODES[m].ratio, labels: ['(0,1) · round', '(1,1) · one nodal line', '(2,1) · two nodal lines'],
      plane: { x0: -1.1, x1: 1.1, y0: 0.0, y1: 1.4 }, cam: { t: [0.06, 0.38, 0], p: [0.76, 0.85, 2.1] }, norm: 'instrument',
      sources: m => srcs.map(s => ({ x: s.x, y: s.y, z: s.z, q: -MODES[m].ratio * MODES[m].ratio * X(MODES[m], s.r, s.t) * s.area })),
      read: m => m === 0
        ? 'Net volume pushed: 43% of a flat piston’s. The skin breathes in and out, and the air all round follows: a strong field.'
        : m === 1 ? 'Net volume pushed: 0. One half pushes while the other pulls: a weak push–pull field, silent on the plane between the halves.'
          : 'Net volume pushed: 0. Opposite quarters push and pull: the field is weaker still.',
      update(m, c) {
        const p = skin.geom.attributes.position, arr = p.array, sh = skinShape[m];
        for (let k = 0; k < sh.length; k++) arr[3 * k + 1] = base[3 * k + 1] + 0.03 * sh[k] * c;
        p.needsUpdate = true; skin.geom.computeVertexNormals();
      },
    };
  })();

  // Clarinet: bore from the reed (x = -L) to the open end (x = 0); the open end is the only source.
  INST.clarinet = (() => {
    const grp = new THREE.Group(), L = 0.6, r = 0.011;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L - 0.08, 24, 1, true), mat.ink);
    tube.rotation.z = Math.PI / 2; tube.position.x = -L / 2 - 0.04; grp.add(tube);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(0.032, r, 0.08, 32, 1, true), mat.ink);
    bell.rotation.z = -Math.PI / 2; bell.position.x = -0.04; grp.add(bell);
    const mouth = new THREE.Mesh(new THREE.CylinderGeometry(r, 0.004, 0.05, 16), mat.ink);
    mouth.rotation.z = -Math.PI / 2; mouth.position.x = -L - 0.025; grp.add(mouth);
    const end = new THREE.Mesh(new THREE.CircleGeometry(0.032, 40), mat.surface);
    end.rotation.y = Math.PI / 2; grp.add(end);
    // the inside pressure, drawn as a curve above the tube
    const yC = 0.06, amp = 0.04;
    const curveGeom = new THREE.CylinderGeometry(0.0022, 0.0022, L, 6, 120);
    curveGeom.rotateZ(Math.PI / 2); curveGeom.translate(-L / 2, yC, 0);
    grp.add(new THREE.Mesh(curveGeom, mat.accentLine));
    const zero = new THREE.Mesh(new THREE.CylinderGeometry(0.0008, 0.0008, L, 4, 1), new THREE.MeshBasicMaterial({ color: C.muted }));
    zero.rotation.z = Math.PI / 2; zero.position.set(-L / 2, yC, 0); grp.add(zero);
    const cBase = Float32Array.from(curveGeom.attributes.position.array);
    const f1 = 147, k = m => 2 * m + 1;                         // partials 1, 3, 5
    return {
      grp, f: m => f1 * k(m), labels: ['1 × f₁ · 147 Hz', '3 × f₁ · 441 Hz', '5 × f₁ · 735 Hz'],
      plane: { x0: -0.8, x1: 1.2, y0: -0.7, y1: 0.7 }, cam: { t: [0.25, 0, 0], p: [0.8, 0.45, 1.85] }, norm: 'mode',
      sources: m => [{ x: 0.006, y: 0, z: 0, q: (m % 2 ? -1 : 1) }],
      read: () => 'One small source: the air flowing in and out of the open end, in proportion to the slope there of the pressure inside the tube (the curve above it), which is zero at the end itself.',
      update(m, c) {
        const p = curveGeom.attributes.position, a = p.array, n = k(m);
        for (let i = 0; i < a.length; i += 3) {
          const s = (cBase[i] + L) / L;                          // 0 at the reed, 1 at the open end
          a[i + 1] = cBase[i + 1] + amp * Math.cos(n * Math.PI * s / 2) * c;
        }
        p.needsUpdate = true;
        end.position.x = 0.004 * (m % 2 ? -1 : 1) * c;
      },
    };
  })();

  // Kalimba: a box whose top gets a force and a turning push at the clamp of one tine.
  INST.kalimba = (() => {
    const grp = new THREE.Group(), BX = 0.18, BY = 0.05, BZ = 0.12, xc = -0.03, ell = 0.07;
    const box = new THREE.Mesh(new THREE.BoxGeometry(BX, BY, BZ), mat.wood); box.position.y = -BY / 2 - 0.007; grp.add(box);
    const topGeom = new THREE.PlaneGeometry(BX, BZ, 36, 24); topGeom.rotateX(-Math.PI / 2);
    grp.add(new THREE.Mesh(topGeom, mat.surface));
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.008, 0.1), mat.metal); bar.position.set(xc, 0.006, 0); grp.add(bar);
    [-0.024, -0.012, 0.012, 0.024].forEach((z, i) => {
      const len = [0.05, 0.06, 0.065, 0.055][i];
      const t = new THREE.Mesh(new THREE.BoxGeometry(len, 0.0015, 0.006), mat.metal); t.position.set(xc + len / 2, 0.011, z); grp.add(t);
    });
    const tineGeom = new THREE.BoxGeometry(ell, 0.0018, 0.0065, 40, 1, 1); tineGeom.translate(xc + ell / 2, 0.011, 0);
    grp.add(new THREE.Mesh(tineGeom, mat.accentLine));
    const tBase = Float32Array.from(tineGeom.attributes.position.array);
    const topBase = Float32Array.from(topGeom.attributes.position.array);
    const env = (x, z) => Math.sin(Math.PI * (x + BX / 2) / BX) * Math.sin(Math.PI * (z + BZ / 2) / BZ);
    // force and turning push at the clamp, from the tine's mode: F = -EI X'''(0) ~ 2 s b^3, M = EI X''(0) ~ 2 b^2 (per length^n)
    const mix = BAR.map(({ b, s }) => ({ push: 1, rock: (2 * b * b / ell / ell) / (2 * s * b * b * b / ell / ell / ell) / (BX / 2) }));
    const shape = (m, x, z) => env(x, z) * (mix[m].push + mix[m].rock * (x - xc) / (BX / 2));
    let mx = [0, 0, 0];
    for (let m = 0; m < 3; m++) for (let i = 0; i <= 20; i++) for (let j = 0; j <= 20; j++) mx[m] = Math.max(mx[m], Math.abs(shape(m, -BX / 2 + BX * i / 20, -BZ / 2 + BZ * j / 20)));
    const srcs = [];
    for (let i = 0; i < 15; i++) for (let j = 0; j < 10; j++) srcs.push({ x: -BX / 2 + BX * (i + 0.5) / 15, y: 0.002, z: -BZ / 2 + BZ * (j + 0.5) / 10, area: BX * BZ / 150 });
    const f1 = 262;
    return {
      grp, f: m => f1 * BAR[m].ratio, labels: ['mode 1 · 262 Hz', 'mode 2 · 1642 Hz', 'mode 3 · 4598 Hz'],
      plane: { x0: -0.35, x1: 0.35, y0: 0.0, y1: 0.5 }, cam: { t: [0.02, 0.13, 0], p: [0.24, 0.25, 0.68] }, norm: 'mode',
      sources: m => srcs.map(s => ({ x: s.x, y: s.y, z: s.z, q: -shape(m, s.x, s.z) / mx[m] * s.area })),
      read: m => 'Two inputs at the clamp: a force and a turning push. ' + (m === 0
        ? 'Mode 1 passes on relatively more turning push, so the box top rocks about the clamp as well as moving up and down.'
        : 'Higher modes pass on relatively less turning push, so the box top mostly moves up and down.'),
      update(m, c) {
        const p = tineGeom.attributes.position, a = p.array;
        const xmax = Math.abs(barX(m, 1));
        for (let i = 0; i < a.length; i += 3) {
          const xi = Math.max(0, Math.min(1, (tBase[i] - xc) / ell));
          a[i + 1] = tBase[i + 1] + 0.012 * barX(m, xi) / xmax * c;
        }
        p.needsUpdate = true;
        const t = topGeom.attributes.position, ta = t.array;
        for (let i = 0; i < ta.length; i += 3) ta[i + 1] = topBase[i + 1] + 0.004 * shape(m, topBase[i], topBase[i + 2]) / mx[m] * c;
        t.needsUpdate = true; topGeom.computeVertexNormals();
      },
    };
  })();

  Object.values(INST).forEach(I => { I.grp.visible = false; scene.add(I.grp); });

  // ---------- fields: complex amplitude on the slice, cached per instrument and mode ----------
  const cache = {};
  function field(name, m) {
    const key = name + m;
    if (cache[key]) return cache[key];
    const I = INST[name], P = I.plane, k = 2 * Math.PI * I.f(m) / 343;
    const src = I.sources(m), re = new Float32Array(G * G), im = new Float32Array(G * G);
    const dx = (P.x1 - P.x0) / G, dy = (P.y1 - P.y0) / G, dmin = 1.2 * Math.max(dx, dy);
    for (let j = 0; j < G; j++) {
      const y = P.y0 + (j + 0.5) * dy;
      for (let i = 0; i < G; i++) {
        const x = P.x0 + (i + 0.5) * dx;
        let sr = 0, si = 0;
        for (let s = 0; s < src.length; s++) {
          const S = src[s], ex = x - S.x, ey = y - S.y, ez = S.z;
          const d = Math.max(dmin, Math.sqrt(ex * ex + ey * ey + ez * ez)), a = S.q / d, ph = -k * d;
          sr += a * Math.cos(ph); si += a * Math.sin(ph);
        }
        re[j * G + i] = sr; im[j * G + i] = si;
      }
    }
    const mags = Array.from(re, (v, i) => Math.hypot(v, im[i])).sort((a, b) => a - b);
    return (cache[key] = { re, im, level: mags[Math.floor(0.97 * mags.length)] || 1 });
  }
  function scaleFor(name, m) {
    const I = INST[name];
    if (I.norm === 'mode') return 1 / field(name, m).level;
    return 1 / Math.max(field(name, 0).level, field(name, 1).level, field(name, 2).level);
  }

  // ---------- state, UI ----------
  let cur = 'string', mode = 0, playing = !window.matchMedia('(prefers-reduced-motion: reduce)').matches, phase = 0, last = performance.now();
  let F = null, scale = 1, userMoved = false;
  controls.addEventListener('start', () => { userMoved = true; });
  const read = root.querySelector('.e3-read');
  const modeBtns = Array.from(root.querySelectorAll('[data-e3mode]'));
  const instBtns = Array.from(root.querySelectorAll('[data-e3inst]'));
  const playBtn = root.querySelector('.e3-play');

  function show(name, m, resetCam) {
    if (!INST[name]) return;
    cur = name; mode = m;
    Object.entries(INST).forEach(([k, I]) => { I.grp.visible = k === name; });
    const I = INST[name], P = I.plane;
    slice.scale.set(P.x1 - P.x0, P.y1 - P.y0, 1); slice.position.set((P.x0 + P.x1) / 2, (P.y0 + P.y1) / 2, 0);
    frame.scale.copy(slice.scale); frame.position.copy(slice.position);
    F = field(name, m); scale = scaleFor(name, m);
    instBtns.forEach(b => b.setAttribute('aria-pressed', b.dataset.e3inst === name ? 'true' : 'false'));
    modeBtns.forEach((b, i) => { b.textContent = I.labels[i]; b.setAttribute('aria-pressed', i === m ? 'true' : 'false'); });
    if (read) read.textContent = I.read(m);
    if (resetCam) {
      userMoved = false;
      fitCamera();
      const span = Math.hypot(...I.cam.p.map((v, i) => v - I.cam.t[i]));
      camera.near = span / 100; camera.far = span * 20; camera.updateProjectionMatrix();
      controls.minDistance = span * 0.25; controls.maxDistance = span * 3;
      controls.update();
    }
    draw();
  }

  const srgb = c => { const o = {}; c.getRGB(o, THREE.SRGBColorSpace); return o; };
  const bg = srgb(C.panel), cp = srgb(C.pos), cn = srgb(C.neg);
  function paint(c, s) {
    const re = F.re, im = F.im;
    for (let i = 0; i < G * G; i++) {
      let v = (re[i] * c - im[i] * s) * scale;
      v = Math.max(-1, Math.min(1, v));
      const w = Math.pow(Math.abs(v), 0.6), col = v > 0 ? cp : cn;
      texData[4 * i] = 255 * (bg.r + (col.r - bg.r) * w);
      texData[4 * i + 1] = 255 * (bg.g + (col.g - bg.g) * w);
      texData[4 * i + 2] = 255 * (bg.b + (col.b - bg.b) * w);
      texData[4 * i + 3] = 255 * (0.35 + 0.6 * w);
    }
    tex.needsUpdate = true;
  }

  function draw() {
    const c = Math.cos(phase), s = Math.sin(phase);
    INST[cur].update(mode, c);
    paint(c, s);
    controls.update();
    renderer.render(scene, camera);
  }

  function fitCamera() {
    const I = INST[cur], fit = Math.pow(Math.max(1, 1.7 / (camera.aspect || 1.7)), 0.5);
    controls.target.set(...I.cam.t);
    camera.position.set(...I.cam.p.map((v, i) => I.cam.t[i] + (v - I.cam.t[i]) * fit));
  }
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (!userMoved) fitCamera();
    draw();
  }
  new ResizeObserver(resize).observe(canvas);

  let visible = true;
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(canvas);

  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (visible) {
      if (playing) phase = (phase + 2 * Math.PI * dt / 1.6) % (2 * Math.PI);
      draw();
    }
    requestAnimationFrame(loop);
  }

  instBtns.forEach(b => b.addEventListener('click', () => show(b.dataset.e3inst, 0, true)));
  modeBtns.forEach((b, i) => b.addEventListener('click', () => show(cur, i, false)));
  if (playBtn) {
    const label = () => { playBtn.textContent = playing ? 'Pause' : 'Play'; playBtn.setAttribute('aria-pressed', playing ? 'false' : 'true'); };
    playBtn.addEventListener('click', () => { playing = !playing; label(); });
    label();
  }
  document.querySelectorAll('a[href^="#view-"]').forEach(a => a.addEventListener('click', () => {
    const name = a.getAttribute('href').slice(6);
    if (INST[name]) show(name, 0, true);
  }));

  fallback.style.display = 'none';
  canvas.style.display = 'block';
  live.forEach(el => { el.style.display = ''; });
  show('string', 0, true);
  resize();
  requestAnimationFrame(loop);
  window.__ear3d = { show, setPhase: p => { phase = p; draw(); }, pause: () => { playing = false; }, camera: () => camera.position.toArray() };
}

if (root) {
  try { start(); } catch (e) { console.warn('3D view unavailable:', e); }
}
