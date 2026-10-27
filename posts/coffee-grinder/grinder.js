/* 3D cut-away conical burr grinder: click dial, exit-gap close-up, grinding animation and a live size histogram.
   Needs three.js r128 (global THREE) and model.js (global Grind). Stylized geometry; real numbers come from model.js. */
(function () {
  "use strict";
  const root = document.getElementById("grinder");
  if (!root) return;
  const G = window.Grind;
  const $ = (sel) => root.querySelector(sel);
  const stage = $(".stage");
  if (!window.THREE || !G) { stage.innerHTML = '<p class="noscript">The 3D model could not load (three.js missing).</p>'; return; }
  const THREE = window.THREE;
  const PI = Math.PI;

  const state = { n: 60, theta: 19, exag: true, grinding: false, labels: true, zoom: false, az: 0.32, el: 0.30 };
  const EXAG = 3;                         // visual exaggeration of the axial travel (and so of the gap)
  const sVis = () => state.n * G.STEP_UM / 1000 * (state.exag ? EXAG : 1);   // mm the inner burr has dropped (drawn)
  const gReal = () => G.gapUm(state.n, state.theta);                          // um, the real exit gap

  // ---------- renderer, scene, camera ----------
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  } catch (e) {
    stage.innerHTML = '<p class="noscript">Your browser could not start WebGL, so the 3D model is not shown. The close-up and the histogram below still work.</p>';
  }
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfbfbf9);
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 1000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb9b3a8, 0.75));
  const key = new THREE.DirectionalLight(0xffffff, 0.8); key.position.set(40, 80, 60); scene.add(key);
  const rim = new THREE.DirectionalLight(0xffffff, 0.35); rim.position.set(-60, 20, -30); scene.add(rim);

  const matOuter = new THREE.MeshStandardMaterial({ color: 0xa3aab3, metalness: 0.3, roughness: 0.45, side: THREE.DoubleSide });
  const matCut = new THREE.MeshStandardMaterial({ color: 0x6f7680, metalness: 0.3, roughness: 0.6, side: THREE.DoubleSide });
  const matCapInner = new THREE.MeshStandardMaterial({ color: 0x6f84a8, metalness: 0.2, roughness: 0.65, side: THREE.DoubleSide });
  const matGhost = new THREE.MeshStandardMaterial({ color: 0x9aa1aa, metalness: 0.0, roughness: 0.8, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide });
  const matEdge = new THREE.LineBasicMaterial({ color: 0x9aa1aa, transparent: true, opacity: 0.55 });
  const matInner = new THREE.MeshStandardMaterial({ color: 0xa9bad6, metalness: 0.25, roughness: 0.42, side: THREE.DoubleSide });
  const matShaft = new THREE.MeshStandardMaterial({ color: 0x7b828c, metalness: 0.7, roughness: 0.3 });
  const matWood = new THREE.MeshStandardMaterial({ color: 0xb58a5a, metalness: 0.0, roughness: 0.7 });
  const matDial = new THREE.MeshStandardMaterial({ color: 0x3a3f48, metalness: 0.2, roughness: 0.6 });
  const matTick = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const matCup = new THREE.MeshStandardMaterial({ color: 0xcdd3d8, transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide });

  // ---------- burr profiles (mm). y = 0 is the exit (bottom of the outer burr). ----------
  const R0 = 15.5, YF = 7, H = 19, YT = 24, RTOP = 4.2, RO = 22, SHAFT = 1.6, YB = -2.5;
  const tanT = () => Math.tan(state.theta * PI / 180);
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  // Tooth-tip surfaces. In the fine zone (y <= YF) both are slanted at theta to the shaft and coincide at zero clicks.
  function rInTip(y) { const t = tanT(); if (y <= YF) return R0 - y * t; const rF = R0 - YF * t; return y <= YT ? rF + (y - YF) * (RTOP - rF) / (YT - YF) : RTOP; }
  function rOutTip(y) { const t = tanT(); if (y <= YF) return R0 - y * t; return R0 - YF * t + (y - YF) * 0.42; }
  // Surfaces with teeth cut into them (grooves go away from the gap, so the tips set the gap).
  function rInner(y, p) {
    const up = smooth(YF - 1, YF + 2.5, y);
    const blade = Math.pow(0.5 + 0.5 * Math.cos(5 * (p + 0.055 * y)), 4);      // five big helical blades (the P0 has five)
    const fine = Math.pow(0.5 + 0.5 * Math.cos(24 * (p - 0.03 * y)), 2);        // finer teeth near the exit
    const deep = 2.6 * smooth(YF, YF + 4, y) * (1 - 0.6 * smooth(21.5, YT, y));
    return rInTip(y) - (up * deep * (1 - blade) + (1 - up) * 0.32 * (1 - fine));
  }
  function rOuter(y, p) {
    const up = smooth(YF - 1, YF + 3, y);
    const g36 = Math.pow(0.5 + 0.5 * Math.cos(36 * (p + 0.02 * y)), 6);
    const g12 = Math.pow(0.5 + 0.5 * Math.cos(12 * (p - 0.04 * y)), 3);
    return rOutTip(y) + (1 - up) * 0.3 * g36 + up * 1.2 * g12;
  }

  // ---------- geometry helpers ----------
  function patch(ny, np, y0, y1, p0, p1, rf) {
    const pos = [], idx = [];
    for (let i = 0; i <= ny; i++) {
      const y = y0 + (y1 - y0) * i / ny;
      for (let j = 0; j <= np; j++) {
        const p = p0 + (p1 - p0) * j / np, r = rf(y, p);
        pos.push(r * Math.cos(p), y, r * Math.sin(p));
      }
    }
    for (let i = 0; i < ny; i++) for (let j = 0; j < np; j++) {
      const a = i * (np + 1) + j, b = a + 1, c = a + np + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  // annulus at height y between rIn(p) and rOut(p)
  function ring(y, p0, p1, rIn, rOut, np) {
    const pos = [], idx = [];
    for (let j = 0; j <= np; j++) {
      const p = p0 + (p1 - p0) * j / np, a = rIn(p), b = rOut(p);
      pos.push(a * Math.cos(p), y, a * Math.sin(p), b * Math.cos(p), y, b * Math.sin(p));
    }
    for (let j = 0; j < np; j++) { const k = 2 * j; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }
  // flat cut face at angle p, between the inner profile and the outer radius
  function cutFace(p, ny) {
    const pos = [], idx = [];
    for (let i = 0; i <= ny; i++) {
      const y = H * i / ny, a = rOuter(y, p);
      pos.push(a * Math.cos(p), y, a * Math.sin(p), RO * Math.cos(p), y, RO * Math.sin(p));
    }
    for (let i = 0; i < ny; i++) { const k = 2 * i; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  }

  // ---------- build the grinder ----------
  const outer = new THREE.Group(); scene.add(outer);
  const ghost = new THREE.Group(); scene.add(ghost);    // see-through near half of the outer burr
  const rotor = new THREE.Group(); scene.add(rotor);        // shaft + crank: turns, never moves up or down
  const burr = new THREE.Group(); rotor.add(burr);          // inner burr + dial: turns with the shaft, slides along it
  const dialGroup = new THREE.Group(); burr.add(dialGroup);
  const capGroup = new THREE.Group(); scene.add(capGroup); capGroup.visible = false;   // cross-section of the inner burr, shown when zoomed
  const clipNear = [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)];                   // keeps z <= 0

  function clearGroup(g) { while (g.children.length) { const c = g.children.pop(); if (c.geometry) c.geometry.dispose(); } }
  function buildBurrs() {
    clearGroup(outer); clearGroup(ghost); clearGroup(burr); clearGroup(capGroup); burr.add(dialGroup);
    // outer burr: solid far half (z <= 0), see-through near half
    const far0 = PI, far1 = 2 * PI;
    outer.add(new THREE.Mesh(patch(70, 150, 0, H, far0, far1, rOuter), matOuter));
    outer.add(new THREE.Mesh(patch(4, 80, 0, H, far0, far1, () => RO), matOuter));
    outer.add(new THREE.Mesh(ring(H, far0, far1, p => rOuter(H, p), () => RO, 150), matOuter));
    outer.add(new THREE.Mesh(ring(0, far0, far1, p => rOuter(0, p), () => RO, 150), matOuter));
    outer.add(new THREE.Mesh(cutFace(far0, 70), matCut));
    outer.add(new THREE.Mesh(cutFace(far1, 70), matCut));
    ghost.add(new THREE.Mesh(patch(40, 80, 0, H, 0, PI, rOuter), matGhost));
    ghost.add(new THREE.Mesh(patch(2, 60, 0, H, 0, PI, () => RO), matGhost));
    ghost.add(arc(RO, 0, 0, PI)); ghost.add(arc(RO, H, 0, PI)); ghost.add(arc(rOutTip(H) + 0.6, H, 0, PI)); ghost.add(arc(rOutTip(0) + 0.15, 0, 0, PI));
    // inner burr (full cone with teeth) and its caps
    burr.add(new THREE.Mesh(patch(90, 220, YB, YT, 0, 2 * PI, rInner), matInner));
    burr.add(new THREE.Mesh(ring(YB, 0, 2 * PI, () => SHAFT, p => rInner(YB, p), 120), matInner));
    burr.add(new THREE.Mesh(ring(YT, 0, 2 * PI, () => SHAFT, p => rInner(YT, p), 60), matInner));
    // flat cross-section of the inner burr in the plane z = 0 (body of revolution, so it does not turn)
    const sh = new THREE.Shape(); const N = 60;
    for (let i = 0; i <= N; i++) { const y = YB + (YT - YB) * i / N; const r = rInTip(y) - 0.3; i ? sh.lineTo(r, y) : sh.moveTo(r, y); }
    for (let i = N; i >= 0; i--) { const y = YB + (YT - YB) * i / N; sh.lineTo(-(rInTip(y) - 0.3), y); }
    const cap = new THREE.Mesh(new THREE.ShapeGeometry(sh), matCapInner); cap.position.z = -0.02; capGroup.add(cap);
  }
  function buildFixed() {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(SHAFT, SHAFT, 56, 16), matShaft);
    shaft.position.y = 18; rotor.add(shaft);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(28, 1.6, 3.2), matShaft); arm.position.set(14, 45, 0); rotor.add(arm);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.3, 8, 20), matWood); knob.position.set(27, 49.5, 0); rotor.add(knob);
    // adjustment dial under the inner burr: 30 clicks per turn
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 1.6, 64), matDial); dialGroup.add(disc);
    for (let k = 0; k < 30; k++) {
      const a = 2 * PI * k / 30, big = k % 5 === 0;
      const t = new THREE.Mesh(new THREE.BoxGeometry(big ? 2.2 : 1.3, 0.3, 0.35), matTick);
      t.position.set(16.8 * Math.cos(a), 0.85, 16.8 * Math.sin(a)); t.rotation.y = -a; dialGroup.add(t);
      const t2 = t.clone(); t2.position.set(17.9 * Math.cos(a), 0, 17.9 * Math.sin(a)); t2.rotation.set(0, -a + PI / 2, PI / 2); t2.scale.set(big ? 0.6 : 0.4, 1, 1); dialGroup.add(t2);
    }
    dialGroup.position.y = -4.6;
    // catch cup
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(21, 21, 22, 48, 1, true), matCup); cup.position.y = -36 + 11; scene.add(cup);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(21, 48), matCup); floor.rotation.x = -PI / 2; floor.position.y = -36; scene.add(floor);
    scene.add(arc(21, -14, 0, 2 * PI)); scene.add(arc(21, -36, 0, 2 * PI));
  }
  function arc(r, y, p0, p1) {
    const pts = []; for (let j = 0; j <= 96; j++) { const p = p0 + (p1 - p0) * j / 96; pts.push(new THREE.Vector3(r * Math.cos(p), y, r * Math.sin(p))); }
    return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), matEdge);
  }

  // ---------- particles ----------
  const MAXP = 700;
  const pGeo = new THREE.IcosahedronGeometry(1, 0);
  const pMat = new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.0 });
  const parts = new THREE.InstancedMesh(pGeo, pMat, MAXP);
  parts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(parts);
  const P = { st: new Uint8Array(MAXP), y: new Float32Array(MAXP), a: new Float32Array(MAXP), r: new Float32Array(MAXP), s: new Float32Array(MAXP), vy: new Float32Array(MAXP), vr: new Float32Array(MAXP), born: new Float32Array(MAXP), um: new Float32Array(MAXP), fines: new Uint8Array(MAXP) };
  const cFines = new THREE.Color(0xe2c47c), cBean = new THREE.Color(0x5a3520), tmpC = new THREE.Color();
  const dummy = new THREE.Object3D();
  for (let i = 0; i < MAXP; i++) { parts.setColorAt(i, cBean); }
  let settled = 0, clock = 0, spawnAcc = 0;

  function localGapVis(y) { return Math.max(0.05, rOutTip(y) - rInTip(y + sVis())); } // radial gap drawn at height y
  function spawn() {
    let i = -1, oldest = 1e9, io = -1;
    for (let k = 0; k < MAXP; k++) { if (P.st[k] === 0) { i = k; break; } if (P.st[k] === 3 && P.born[k] < oldest) { oldest = P.born[k]; io = k; } }
    if (i < 0) { if (io < 0) return; i = io; settled = Math.max(0, settled - 1); }
    P.st[i] = 1; P.y[i] = H - 0.5; P.a[i] = Math.random() * 2 * PI; P.s[i] = 2.6 + Math.random() * 0.8; P.born[i] = clock;
    parts.setColorAt(i, cBean);
  }
  function stepParticles(dt) {
    const omega = 2 * PI * 0.5;                 // drawn crank speed: half a turn per second
    const s = sVis(), g = gReal();
    let any = false;
    for (let i = 0; i < MAXP; i++) {
      const st = P.st[i];
      if (st === 0) continue;
      if (st === 1) {                            // being cracked and walked down the gap
        if (state.grinding) any = true;
        if (state.grinding) { P.y[i] -= dt * 9; P.a[i] += dt * omega * 0.45; }
        const y = P.y[i];
        const gap = localGapVis(y);
        P.s[i] = Math.min(P.s[i], 0.85 * gap + 0.02);
        P.r[i] = (rOutTip(y) + rInTip(y + s)) / 2;
        if (y < 0) {                             // leaves through the exit gap: final size drawn from the model
          const d = G.sample(g);
          P.um[i] = d.um; P.fines[i] = d.fines ? 1 : 0;
          P.s[i] = Math.max(0.12, d.um / 1000 * (state.exag ? EXAG : 1));
          tmpC.copy(d.fines ? cFines : cBean); if (!d.fines) tmpC.offsetHSL(0, 0, (Math.random() - 0.5) * 0.12);
          parts.setColorAt(i, tmpC); parts.instanceColor.needsUpdate = true;
          P.st[i] = 2; P.vy[i] = -12; P.vr[i] = (Math.random() - 0.3) * 8;
          addToHist(d.um);
        }
      } else if (st === 2) {                     // falling into the cup
        any = true;
        P.vy[i] -= 260 * dt; P.y[i] += P.vy[i] * dt; P.r[i] = Math.min(19.5, Math.max(0, P.r[i] + P.vr[i] * dt));
        const floorY = -36 + Math.min(14, settled * 0.02) + P.s[i] * 0.5;
        if (P.y[i] <= floorY) { P.y[i] = floorY - Math.random() * 0.6; P.st[i] = 3; settled++; P.r[i] = Math.sqrt(Math.random()) * 19; }
      }
    }
    return any;
  }
  function writeInstances() {
    for (let i = 0; i < MAXP; i++) {
      if (P.st[i] === 0 || (state.zoom && P.st[i] === 1 && Math.sin(P.a[i]) > 0.05)) { dummy.position.set(0, -999, 0); dummy.scale.setScalar(0.0001); }
      else {
        const a = P.a[i];
        dummy.position.set(P.r[i] * Math.cos(a), P.y[i], P.r[i] * Math.sin(a));
        dummy.rotation.set(i * 1.3, i * 0.7, 0);
        dummy.scale.setScalar(P.s[i] / 2);
      }
      dummy.updateMatrix(); parts.setMatrixAt(i, dummy.matrix);
    }
    parts.instanceMatrix.needsUpdate = true;
  }
  function emptyCup() { for (let i = 0; i < MAXP; i++) P.st[i] = 0; settled = 0; resetHist(); writeInstances(); dirty = true; }

  // ---------- labels over the canvas ----------
  const labels = [
    { el: $("#labOuter"), pos: () => new THREE.Vector3(-RO + 1.5, 13, 0.3) },
    { el: $("#labInner"), pos: () => new THREE.Vector3(2, 15 - sVis(), 9) },
    { el: $("#labGap"), pos: () => new THREE.Vector3(R0 - sVis() * tanT() / 2 + (state.zoom ? 0 : 3), state.zoom ? -1.6 : -2.4, 0.3) },
    { el: $("#labDial"), pos: () => new THREE.Vector3(0, -8 - sVis(), 17) },
    { el: $("#labCup"), pos: () => new THREE.Vector3(14, -30, 14) },
  ];
  const v = new THREE.Vector3();
  function placeLabels(w, h) {
    for (const L of labels) {
      if (!L.el) continue;
      v.copy(L.pos()); v.project(camera);
      const show = state.labels && v.z < 1 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
      L.el.classList.toggle("hidden", !show);
      if (show) { L.el.style.left = ((v.x + 1) / 2 * w) + "px"; L.el.style.top = ((1 - v.y) / 2 * h) + "px"; }
    }
  }

  // ---------- camera and view drag ----------
  function placeCamera() {
    const t = state.zoom ? new THREE.Vector3(R0 - 1.5, 2.5, 0) : new THREE.Vector3(0, 5, 0);
    const dist = state.zoom ? 46 : 205;
    camera.position.set(t.x + dist * Math.sin(state.az) * Math.cos(state.el), t.y + dist * Math.sin(state.el), t.z + dist * Math.cos(state.az) * Math.cos(state.el));
    camera.lookAt(t);
  }
  if (renderer) {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.localClippingEnabled = true;
    stage.insertBefore(renderer.domElement, stage.firstChild);
    const cv = renderer.domElement;
    cv.setAttribute("aria-label", "3D cut-away of a conical burr grinder: a fixed outer ring burr, cut open, around a turning inner cone burr; below them the adjustment dial and a catch cup. Drag sideways to turn the view.");
    cv.setAttribute("role", "img");
    let drag = null;
    cv.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY, az: state.az, el: state.el, mouse: e.pointerType === "mouse" }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener("pointermove", (e) => {
      if (!drag) return;
      state.az = drag.az - (e.clientX - drag.x) * 0.008;
      if (drag.mouse) state.el = Math.min(1.2, Math.max(-0.35, drag.el + (e.clientY - drag.y) * 0.006));
      dirty = true;
    });
    const end = () => { drag = null; };
    cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end);
  }

  // ---------- close-up of the exit gap (2D) ----------
  const zc = $("#gapZoom"), zx = zc.getContext("2d");
  function drawZoom() {
    const w = zc.clientWidth, h = Math.round(w * 0.78), dpr = window.devicePixelRatio || 1;
    if (zc.width !== Math.round(w * dpr) || zc.height !== Math.round(h * dpr)) { zc.width = Math.round(w * dpr); zc.height = Math.round(h * dpr); zc.style.height = h + "px"; }
    zx.setTransform(dpr, 0, 0, dpr, 0, 0); zx.clearRect(0, 0, w, h);
    const th = state.theta * PI / 180, sUm = state.n * G.STEP_UM, gUm = gReal();
    // scale: the axial travel s fills about half the height (min 300 um shown)
    const span = Math.max(300, sUm) * 1.9, k = (h - 20) / span;       // px per um
    const ux = Math.sin(th), uy = Math.cos(th);                         // direction of the surfaces (down-right is +y in screen)
    const cx = w * 0.42, cy = h * 0.22;
    const L = 2 * Math.max(w, h);
    const line = (x0, y0, dash, color, width) => {
      zx.beginPath(); zx.setLineDash(dash); zx.strokeStyle = color; zx.lineWidth = width;
      zx.moveTo(x0 - ux * L, y0 - uy * L); zx.lineTo(x0 + ux * L, y0 + uy * L); zx.stroke(); zx.setLineDash([]);
    };
    // outer burr surface (fixed), steel to its right; inner burr surface, shifted down by s, steel to its left
    zx.fillStyle = "#d9dde2";
    zx.beginPath(); zx.moveTo(cx - ux * L, cy - uy * L); zx.lineTo(cx + ux * L, cy + uy * L); zx.lineTo(w + L, h + L); zx.lineTo(w + L, -L); zx.closePath(); zx.fill();
    const sy = sUm * k;
    zx.fillStyle = "#c9d3e4";
    zx.beginPath(); zx.moveTo(cx - ux * L, cy + sy - uy * L); zx.lineTo(cx + ux * L, cy + sy + uy * L); zx.lineTo(-L, h + L); zx.lineTo(-L, -L); zx.closePath(); zx.fill();
    line(cx, cy, [], "#1c2230", 1.4);
    if (state.n > 0) line(cx, cy, [4, 3], "#586070", 1);                 // where the inner surface was at zero clicks
    line(cx, cy + sy, [], "#2e4bb0", 1.6);
    // s: straight down along the shaft; g: perpendicular to the surfaces
    const px = cx, py = cy;
    zx.strokeStyle = "#c9572f"; zx.fillStyle = "#c9572f"; zx.lineWidth = 2;
    arrow(px, py, px, py + sy);
    const fx = px - uy * gUm * k, fy = py + ux * gUm * k;              // foot of the perpendicular on the inner surface
    zx.strokeStyle = "#2e7d6b"; zx.fillStyle = "#2e7d6b";
    if (state.n > 0) arrow(px, py, fx, fy);
    zx.font = "12px IBM Plex Mono, ui-monospace, monospace"; zx.textBaseline = "middle";
    zx.fillStyle = "#c9572f"; zx.fillText("s = " + fmtUm(sUm), px + 6, py + sy * 0.55);
    zx.fillStyle = "#2e7d6b"; zx.textAlign = "right"; zx.fillText("g = " + fmtUm(gUm), fx - 6, fy + 4); zx.textAlign = "left";
    zx.fillStyle = "#586070"; zx.font = "11px IBM Plex Sans Condensed, Arial Narrow, sans-serif";
    zx.fillText("outer burr (fixed)", Math.min(w - 92, cx + 0.62 * h * ux + 10), Math.min(h - 10, cy + 0.62 * h * uy));
    zx.fillStyle = "#2e4bb0"; zx.fillText("inner burr", 6, h - 12);
    // scale bar
    const bar = niceBar(span / 4), bpx = bar * k;
    zx.strokeStyle = "#1c2230"; zx.lineWidth = 1.5; zx.beginPath(); zx.moveTo(w - 10 - bpx, 12); zx.lineTo(w - 10, 12); zx.stroke();
    zx.fillStyle = "#1c2230"; zx.textAlign = "right"; zx.font = "11px IBM Plex Mono, ui-monospace, monospace"; zx.fillText(fmtUm(bar), w - 10, 24); zx.textAlign = "left";
  }
  function arrow(x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy); if (l < 2) return;
    zx.beginPath(); zx.moveTo(x0, y0); zx.lineTo(x1, y1); zx.stroke();
    const ax = dx / l, ay = dy / l, hs = Math.min(7, l * 0.4);
    zx.beginPath(); zx.moveTo(x1, y1); zx.lineTo(x1 - hs * ax + hs * 0.45 * ay, y1 - hs * ay - hs * 0.45 * ax); zx.lineTo(x1 - hs * ax - hs * 0.45 * ay, y1 - hs * ay + hs * 0.45 * ax); zx.closePath(); zx.fill();
  }
  function niceBar(x) { const e = Math.pow(10, Math.floor(Math.log10(x))); const m = x / e; return (m >= 5 ? 5 : m >= 2 ? 2 : 1) * e; }
  function fmtUm(u) { return u >= 1000 ? (u / 1000).toFixed(2) + " mm" : Math.round(u) + " µm"; }

  // ---------- size histogram (2D) ----------
  const hc = $("#hist"), hx = hc.getContext("2d");
  const U0 = Math.log(10), U1 = Math.log(3000), NB = 56, du = (U1 - U0) / NB;
  const counts = new Float32Array(NB); let total = 0;
  function addToHist(um) { const b = Math.floor((Math.log(um) - U0) / du); if (b >= 0 && b < NB) { counts[b]++; total++; } histDirty = true; }
  function resetHist() { counts.fill(0); total = 0; histDirty = true; }
  let histDirty = true;
  function drawHist() {
    const w = hc.clientWidth, h = Math.max(210, Math.round(w * 0.42)), dpr = window.devicePixelRatio || 1;
    if (hc.width !== Math.round(w * dpr) || hc.height !== Math.round(h * dpr)) { hc.width = Math.round(w * dpr); hc.height = Math.round(h * dpr); hc.style.height = h + "px"; }
    hx.setTransform(dpr, 0, 0, dpr, 0, 0); hx.clearRect(0, 0, w, h);
    const padL = 8, padR = 8, rowH = 15, top = 6 + 4 * rowH + 6, bottom = h - 22;
    const X = (u) => padL + (u - U0) / (U1 - U0) * (w - padL - padR);
    const g = gReal(), mp = G.mainPeakUm(g);
    // brew bands
    hx.font = "11px IBM Plex Sans Condensed, Arial Narrow, sans-serif"; hx.textBaseline = "middle";
    G.BREWS.forEach((b, i) => {
      const y = 6 + i * rowH, x0 = X(Math.log(b.lo)), x1 = X(Math.log(b.hi)), on = mp >= b.lo && mp <= b.hi;
      hx.globalAlpha = on ? 0.95 : 0.35; hx.fillStyle = b.color; hx.fillRect(x0, y + 1, x1 - x0, rowH - 3); hx.globalAlpha = 1;
      hx.fillStyle = "#fff"; const label = b.name; const tw = hx.measureText(label).width;
      if (tw + 8 < x1 - x0) { hx.fillText(label, x0 + 4, y + rowH / 2); } else { hx.fillStyle = b.color; hx.textAlign = "right"; hx.fillText(label, x0 - 4, y + rowH / 2); hx.textAlign = "left"; }
    });
    // model curve and sampled bars
    let ymax = 0; for (let k = 0; k <= 200; k++) { const u = U0 + (U1 - U0) * k / 200; ymax = Math.max(ymax, G.density(u, g)); }
    ymax *= 1.15;
    const Y = (d) => bottom - d / ymax * (bottom - top);
    if (total > 0) {
      for (let b = 0; b < NB; b++) {
        const dens = counts[b] / (total * du), u = U0 + b * du;
        const uc = u + du / 2, isF = uc < Math.log(100);
        hx.fillStyle = isF ? "rgba(201,162,39,0.55)" : "rgba(90,53,32,0.42)";
        const yy = Math.max(top, Y(dens)); hx.fillRect(X(u) + 0.5, yy, X(u + du) - X(u) - 1, bottom - yy);
      }
    }
    hx.beginPath(); hx.strokeStyle = "#1c2230"; hx.lineWidth = 1.6;
    for (let k = 0; k <= 240; k++) { const u = U0 + (U1 - U0) * k / 240, x = X(u), y = Y(G.density(u, g)); k ? hx.lineTo(x, y) : hx.moveTo(x, y); }
    hx.stroke();
    // gap marker
    const xg = X(Math.log(mp)); hx.strokeStyle = "#2e7d6b"; hx.setLineDash([4, 3]); hx.beginPath(); hx.moveTo(xg, top - 4); hx.lineTo(xg, bottom); hx.stroke(); hx.setLineDash([]);
    hx.fillStyle = "#2e7d6b"; hx.font = "11px IBM Plex Mono, ui-monospace, monospace";
    const gl = "gap " + fmtUm(g); const glw = hx.measureText(gl).width;
    hx.fillText(gl, Math.min(w - glw - 4, xg + 4), top + 8);
    hx.fillStyle = "#8a6d12"; hx.fillText("fines", X(Math.log(G.FINES_UM)) - 14, Y(G.density(Math.log(G.FINES_UM), g)) - 9);
    // axis
    hx.strokeStyle = "#c2c7bd"; hx.lineWidth = 1; hx.beginPath(); hx.moveTo(padL, bottom + 0.5); hx.lineTo(w - padR, bottom + 0.5); hx.stroke();
    hx.fillStyle = "#586070"; hx.textAlign = "center";
    [10, 30, 100, 300, 1000, 3000].forEach((t) => { const x = X(Math.log(t)); hx.fillRect(x, bottom, 1, 4); hx.fillText(t >= 1000 ? (t / 1000) + " mm" : t + " µm", Math.min(w - 22, Math.max(18, x)), bottom + 13); });
    hx.textAlign = "left";
    histDirty = false;
  }

  // ---------- readout and controls ----------
  const nIn = $("#clicks"), nOut = $("#clicksOut"), thIn = $("#theta"), thOut = $("#thetaOut"), read = $("#readout");
  function updateReadout() {
    const g = gReal(), mp = G.mainPeakUm(g), f = G.finesShare(g), bs = G.brewsFor(mp);
    const where = state.n === 0 ? "burrs touching: never grind here"
      : bs.length ? "inside the range for <b>" + bs.map(b => b.name.toLowerCase()).join("</b> and <b>") + "</b>"
      : (mp < 180 ? "finer than espresso (Turkish-coffee territory)" : "coarser than French press (cold-brew territory)");
    read.innerHTML = "Inner burr lowered <b>" + (state.n * G.STEP_UM / 1000).toFixed(2) + " mm</b> → exit gap <b>" + fmtUm(g) + "</b> (θ = " + state.theta + "°)<br>" +
      "Main peak ≈ <b>" + fmtUm(mp) + "</b>, fines ≈ <b>" + Math.round(f * 100) + "%</b> of the coffee · " + where;
    nOut.textContent = state.n;
  }
  function setN(n) {
    state.n = Math.max(0, Math.min(130, Math.round(n)));
    nIn.value = state.n; burr.position.y = -sVis(); capGroup.position.y = -sVis(); dialGroup.rotation.y = -state.n * 2 * PI / 30;
    resetHist(); updateReadout(); drawZoom(); dirty = true; broadcast();
  }
  function setTheta(t) { state.theta = t; thOut.textContent = t + "°"; buildBurrs(); setN(state.n); }
  function broadcast() { document.dispatchEvent(new CustomEvent("grind:setting", { detail: { n: state.n, theta: state.theta, gapUm: gReal(), mainUm: G.mainPeakUm(gReal()) } })); }
  nIn.addEventListener("input", () => setN(+nIn.value));
  $("#minus").addEventListener("click", () => setN(state.n - 1));
  $("#plus").addEventListener("click", () => setN(state.n + 1));
  thIn.addEventListener("input", () => setTheta(+thIn.value));
  const grindBtn = $("#grindBtn");
  grindBtn.addEventListener("click", () => {
    state.grinding = !state.grinding;
    grindBtn.setAttribute("aria-pressed", state.grinding ? "true" : "false");
    grindBtn.textContent = state.grinding ? "Stop grinding" : "Grind";
    if (state.n === 0 && state.grinding) { read.innerHTML += "<br><b>Burrs touching:</b> nothing gets through. Open the dial first."; }
  });
  $("#emptyBtn").addEventListener("click", emptyCup);
  $("#exag").addEventListener("change", (e) => { state.exag = e.target.checked; $("#exagBadge").style.display = state.exag ? "" : "none"; setN(state.n); });
  $("#labels").addEventListener("change", (e) => { state.labels = e.target.checked; dirty = true; });
  const zoomBtn = $("#zoomBtn");
  let savedView = null;
  zoomBtn.addEventListener("click", () => { state.zoom = !state.zoom;
    if (state.zoom) { savedView = [state.az, state.el]; state.az = 0; state.el = 0.04; } else if (savedView) { [state.az, state.el] = savedView; }
    ghost.visible = !state.zoom; capGroup.visible = state.zoom;
    for (const m of [matInner, matDial, matTick]) { m.clippingPlanes = state.zoom ? clipNear : []; m.needsUpdate = true; } zoomBtn.setAttribute("aria-pressed", state.zoom ? "true" : "false"); zoomBtn.textContent = state.zoom ? "Whole grinder" : "Zoom to the exit gap"; dirty = true; });
  document.querySelectorAll("[data-clicks]").forEach((b) => b.addEventListener("click", () => setN(+b.dataset.clicks)));

  // ---------- loop ----------
  let dirty = true, visible = true, last = performance.now();
  if ("IntersectionObserver" in window) new IntersectionObserver((es) => { visible = es[0].isIntersecting; }).observe(root);
  function resize() {
    if (!renderer) return;
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); dirty = true;
  }
  if ("ResizeObserver" in window) new ResizeObserver(() => { resize(); drawZoom(); histDirty = true; }).observe(root);
  window.addEventListener("resize", () => { resize(); drawZoom(); histDirty = true; });
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; clock += dt;
    if (visible) {
      let moving = false;
      if (state.grinding) {
        rotor.rotation.y += dt * 2 * PI * 0.5;
        if (state.n > 0) { spawnAcc += dt * 45; while (spawnAcc >= 1) { spawn(); spawnAcc--; } }
        moving = true;
      }
      if (stepParticles(dt)) moving = true;
      if (renderer && (moving || dirty)) {
        writeInstances(); placeCamera(); renderer.render(scene, camera);
        placeLabels(stage.clientWidth, stage.clientHeight); dirty = false;
      }
      if (histDirty) drawHist();
    }
    requestAnimationFrame(frame);
  }
  buildFixed(); buildBurrs();
  setTheta(state.theta);
  resize(); drawZoom(); drawHist();
  requestAnimationFrame(frame);
  window.__grinder = { state, setN, setTheta, emptyCup, P };  // for the page checks
})();
