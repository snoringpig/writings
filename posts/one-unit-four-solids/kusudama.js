/* One Unit, Four Solids: assembly figure for Sonobe-style units.
 *
 * Model. A base polyhedron with triangular faces, q of them at every corner
 * (q = 2: a triangle counted as two back-to-back faces; 3: tetrahedron;
 * 4: octahedron; 5: icosahedron), edge length sqrt(2). On every face sits a
 * pyramid whose three side faces are right isosceles triangles with legs 1
 * (a cube corner), so its height is 1/sqrt(3). One paper unit lies on every
 * edge AB of the base polyhedron: its centre square is A, P1, B, P2, creased
 * along AB, where P1 and P2 are the tips of the two pyramids next to that
 * edge. Its two flaps are hinged on A-P1 and B-P2 and lie on the next side
 * face of each pyramid, with the tip under that face's pocket lid.
 *
 * Everything drawn (positions, angles, counts) is computed from this model.
 * Paper has no thickness; layers are separated by a small offset EPS.
 * Needs three.js r128 (global THREE).
 */
(function () {
  'use strict';
  if (typeof THREE === 'undefined') { return; }

  var EPS = 0.006;
  var GDIR = new THREE.Vector3(0.3, 0.36, 1).normalize();   /* where a new unit faces: slightly up and to the right of the viewer */
  var COLORS = [0x355c8c, 0xd9583b, 0xe8b548];
  var MODES = [
    { n: 3, q: 2, base: 'a triangle (two faces, back to back)', solid: 'a triangular bipyramid' },
    { n: 6, q: 3, base: 'a tetrahedron', solid: 'a cube' },
    { n: 12, q: 4, base: 'an octahedron', solid: 'a spiked octahedron' },
    { n: 30, q: 5, base: 'an icosahedron', solid: 'a spiked icosahedron' }
  ];

  /* ---------- small vector kit (plain arrays) ---------- */
  function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function mul(a, k) { return [a[0] * k, a[1] * k, a[2] * k]; }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function len(a) { return Math.sqrt(dot(a, a)); }
  function unit(a) { var l = len(a); return l > 1e-12 ? mul(a, 1 / l) : [0, 0, 0]; }
  function mid(a, b) { return mul(add(a, b), 0.5); }
  /* rotate point p about the line through o with unit direction k */
  function rot(p, o, k, ang) {
    var v = sub(p, o), c = Math.cos(ang), s = Math.sin(ang);
    return add(o, add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c))));
  }
  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
  function ease(x) { x = clamp01(x); return x * x * (3 - 2 * x); }

  /* ---------- base polyhedra ---------- */
  function basePoly(q) {
    var vs, faces = [], i, j, k;
    if (q === 2) {
      var r = Math.sqrt(2) / Math.sqrt(3);
      vs = [];
      for (i = 0; i < 3; i++) {
        var a = Math.PI / 2 + i * 2 * Math.PI / 3;
        vs.push([r * Math.cos(a), r * Math.sin(a), 0]);
      }
      faces = [[0, 1, 2], [0, 2, 1]];
    } else {
      var raw;
      if (q === 3) { raw = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]; }
      else if (q === 4) { raw = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]; }
      else {
        var g = (1 + Math.sqrt(5)) / 2; raw = [];
        [-1, 1].forEach(function (s1) { [-1, 1].forEach(function (s2) {
          raw.push([0, s1, s2 * g]); raw.push([s1, s2 * g, 0]); raw.push([s2 * g, 0, s1]);
        }); });
      }
      var dmin = Infinity;
      for (i = 0; i < raw.length; i++) { for (j = i + 1; j < raw.length; j++) { dmin = Math.min(dmin, len(sub(raw[i], raw[j]))); } }
      vs = raw.map(function (p) { return mul(p, Math.sqrt(2) / dmin); });
      var near = function (a, b) { return Math.abs(len(sub(vs[a], vs[b])) - Math.sqrt(2)) < 1e-6; };
      for (i = 0; i < vs.length; i++) { for (j = i + 1; j < vs.length; j++) { for (k = j + 1; k < vs.length; k++) {
        if (near(i, j) && near(j, k) && near(i, k)) {
          var n = cross(sub(vs[j], vs[i]), sub(vs[k], vs[i]));
          var cen = mul(add(add(vs[i], vs[j]), vs[k]), 1 / 3);
          faces.push(dot(n, cen) > 0 ? [i, j, k] : [i, k, j]);
        }
      } } }
    }
    return { vs: vs, faces: faces };
  }

  /* ---------- the assembly: one unit per edge ---------- */
  function buildAssembly(q) {
    var P = basePoly(q), vs = P.vs, faces = P.faces;
    var apex = [], he = {}, f, i;
    for (f = 0; f < faces.length; f++) {
      var F = faces[f], a = vs[F[0]], b = vs[F[1]], c = vs[F[2]];
      var n = unit(cross(sub(b, a), sub(c, a)));
      apex.push(add(mul(add(add(a, b), c), 1 / 3), mul(n, 1 / Math.sqrt(3))));
      for (i = 0; i < 3; i++) { he[F[i] + ',' + F[(i + 1) % 3]] = { f: f, third: F[(i + 2) % 3] }; }
    }
    /* build order: face by face (breadth first), so each pyramid closes early */
    var order = [], seenF = {}, queue = [0], edgeIndex = {};
    seenF[0] = true;
    var ekey = function (x, y) { return x < y ? x + ',' + y : y + ',' + x; };
    while (queue.length) {
      f = queue.shift();
      for (i = 0; i < 3; i++) {
        var x = faces[f][i], y = faces[f][(i + 1) % 3], k = ekey(x, y);
        if (!(k in edgeIndex)) { edgeIndex[k] = order.length; order.push([Math.min(x, y), Math.max(x, y)]); }
      }
      for (i = 0; i < 3; i++) {
        var g = he[faces[f][(i + 1) % 3] + ',' + faces[f][i]].f;
        if (!seenF[g]) { seenF[g] = true; queue.push(g); }
      }
    }
    /* three paper colours, every pyramid gets one of each (backtracking) */
    var col = [];
    var faceEdges = faces.map(function (F) { return [0, 1, 2].map(function (j) { return edgeIndex[ekey(F[j], F[(j + 1) % 3])]; }); });
    var edgeFaces = order.map(function () { return []; });
    faceEdges.forEach(function (es, fi) { es.forEach(function (e) { edgeFaces[e].push(fi); }); });
    (function assign(e) {
      if (e === order.length) { return true; }
      for (var c = 0; c < 3; c++) {
        var ok = true;
        edgeFaces[e].forEach(function (fi) { faceEdges[fi].forEach(function (e2) { if (e2 !== e && col[e2] === c) { ok = false; } }); });
        if (ok) { col[e] = c; if (assign(e + 1)) { return true; } col[e] = undefined; }
      }
      return false;
    })(0);

    var units = order.map(function (e, idx) {
      var X = e[0], Y = e[1], h1 = he[X + ',' + Y], h2 = he[Y + ',' + X];
      var A = vs[X], B = vs[Y], P1 = apex[h1.f], P2 = apex[h2.f], C1 = vs[h1.third], C2 = vs[h2.third];
      var M = mid(A, B), axis = unit(sub(B, A));
      var w1 = sub(P1, M), w2 = sub(P2, M), e0 = unit(sub(w1, w2)), wl = len(w1);
      var sAng = function (w) { var wn = unit(w); return Math.atan2(dot(cross(e0, wn), axis), dot(e0, wn)); };
      var u = {
        i: idx, color: col[idx], A: A, B: B, P1: P1, P2: P2, C1: C1, C2: C2, M: M, axis: axis,
        e0: e0, wl: wl, g1: sAng(w1), g2: sAng(mul(w2, -1)), r: unit(M),
        pocket1: edgeIndex[ekey(h1.third, X)], pocket2: edgeIndex[ekey(h2.third, Y)],
        /* which half of the pocket unit each flap enters (0 or 1) */
        slot1: h1.third < X ? 0 : 1, slot2: h2.third < Y ? 0 : 1
      };
      /* crease: angle between the two halves of the centre square, and its sense */
      var cosang = dot(unit(w1), unit(w2));
      u.creaseDeg = Math.acos(Math.max(-1, Math.min(1, cosang))) * 180 / Math.PI;
      u.creaseSense = Math.abs(u.creaseDeg - 180) < 1e-3 ? 'flat' : (dot(add(w1, w2), u.r) < 0 ? 'mountain' : 'valley');
      /* flap senses: +-90 degrees about the hinge, whichever lands on the next face */
      var t1 = sub(mul(P1, 2), B), t2 = sub(mul(P2, 2), A);
      var k1 = unit(sub(P1, A)), k2 = unit(sub(P2, B));
      u.s1 = len(sub(rot(t1, A, k1, Math.PI / 2), C1)) < len(sub(rot(t1, A, k1, -Math.PI / 2), C1)) ? 1 : -1;
      u.s2 = len(sub(rot(t2, B, k2, Math.PI / 2), C2)) < len(sub(rot(t2, B, k2, -Math.PI / 2), C2)) ? 1 : -1;
      u.err = Math.max(len(sub(rot(t1, A, k1, u.s1 * Math.PI / 2), C1)), len(sub(rot(t2, B, k2, u.s2 * Math.PI / 2), C2)));
      /* outward normals of the two faces the flaps land on */
      var outN = function (X0, Pp, Y0, inner) { var nn = unit(cross(sub(Pp, X0), sub(Y0, X0))); return dot(nn, sub(X0, inner)) > 0 ? nn : mul(nn, -1); };
      var in1 = add(mul(add(add(A, B), C1), 1 / 3), mul(sub(P1, mul(add(add(A, B), C1), 1 / 3)), 0.3));
      var in2 = add(mul(add(add(A, B), C2), 1 / 3), mul(sub(P2, mul(add(add(A, B), C2), 1 / 3)), 0.3));
      u.nd1 = outN(A, P1, C1, in1); u.nd2 = outN(B, P2, C2, in2);
      return u;
    });
    var R = 0;
    vs.concat(apex).forEach(function (p) { R = Math.max(R, len(p)); });
    /* how far a waiting flap must lean back so that the unit carrying its
       pocket can come straight in along its own radius without crossing it */
    var u0 = units[0], W = units[u0.pocket1], cdir = unit(sub(u0.C1, u0.P1));
    var lean = Math.atan2(Math.max(0, -dot(W.r, cdir)), dot(W.r, u0.nd1));
    var vOpen = -(lean + 5 * Math.PI / 180) / (Math.PI / 2), D = 0.6, Rstage = 0;
    units.forEach(function (un, i) {
      var list = [pose(un, 1, vOpen, vOpen, D), pose(un, 1, vOpen, vOpen, 0)];
      if (i === 0) { list.push(pose(un, 0, 0, 0, 0)); }
      list.forEach(function (ps) { ps.tri.forEach(function (t) { t.forEach(function (p) { Rstage = Math.max(Rstage, len(p)); }); }); });
    });
    return { q: q, vs: vs, faces: faces, apex: apex, units: units, edges: order, R: R, D: D, Rstage: Rstage,
      vOpen: vOpen, leanDeg: lean * 180 / Math.PI };
  }

  /* pose of one unit: u = crease progress (0 flat, 1 final), v1, v2 = flap
     closure (0 flat with its half, 1 lying on the next face), d = distance out */
  function pose(un, u, v1, v2, d) {
    var A = un.A, B = un.B, M = un.M, ax = un.axis;
    var P1 = add(M, rot(mul(un.e0, un.wl), [0, 0, 0], ax, u * un.g1));
    var P2 = add(M, rot(mul(un.e0, -un.wl), [0, 0, 0], ax, u * un.g2));
    var T1 = rot(sub(mul(P1, 2), B), A, unit(sub(P1, A)), un.s1 * v1 * Math.PI / 2);
    var T2 = rot(sub(mul(P2, 2), A), B, unit(sub(P2, B)), un.s2 * v2 * Math.PI / 2);
    var nH = function (X, Pp, Y) { var n = unit(cross(sub(Pp, X), sub(Y, X))); return dot(n, un.r) >= 0 ? n : mul(n, -1); };
    var n1 = nH(A, P1, B), n2 = nH(B, P2, A);
    var sh = mul(un.r, d);
    var o1 = mul(un.nd1, EPS * v1), o2 = mul(un.nd2, EPS * v2);
    var q1 = mul(n1, 2 * EPS), q2 = mul(n2, 2 * EPS);
    var mAB = mid(A, B);
    var tri = [
      [A, P1, B], [B, P2, A],
      [add(A, o1), add(P1, o1), add(T1, o1)], [add(B, o2), add(P2, o2), add(T2, o2)],
      [add(mid(P1, A), q1), add(mAB, q1), add(A, q1)], [add(mid(P2, B), q2), add(mAB, q2), add(B, q2)]
    ];
    var lines = [
      [P1, B], [B, P2], [P2, A], [A, P1],
      [add(P1, o1), add(T1, o1)], [add(T1, o1), add(A, o1)], [add(P2, o2), add(T2, o2)], [add(T2, o2), add(B, o2)],
      [add(mid(P1, A), q1), add(mAB, q1)], [add(mAB, q2), add(mid(P2, B), q2)]
    ];
    var sft = function (p) { return add(p, sh); };
    return {
      tri: tri.map(function (t) { return t.map(sft); }),
      lines: lines.map(function (l) { return l.map(sft); }),
      crease: [sft(A), sft(B)]
    };
  }

  /* timeline: unit i is in flight for t in [i, i+1] */
  var T_MOVE1 = 0.80, T_TUCK0 = 0.78, T_TUCK1 = 1.0;
  /* closure of a flap owned by unit i whose pocket belongs to unit j.
     Until both units are in place the flap stands up from its hinge, leaning
     back a little (vOpen < 0) so that the unit carrying its pocket can come
     straight in; then it folds down into the pocket. */
  function flapV(asm, i, j, t, uFold, slot) {
    var v = asm.vOpen * uFold;
    /* two flaps waiting for the same unit fold down one after the other:
       over a valley crease they would cross if they moved together */
    var a = T_TUCK0, b = T_TUCK1;
    if (j > i) { if (slot === 0) { b = 0.88; } else { a = 0.9; } }
    var tuck = ease((t - Math.max(i, j) - a) / (b - a));
    return v + (1 - v) * tuck;
  }
  /* The first unit starts flat where it will stay and is creased in place.
     Every later unit appears already creased, a distance D out along its own
     radius, and travels straight in. */
  function unitState(asm, i, t, D) {
    var tau = t - i, un = asm.units[i];
    if (tau <= 0) { return null; }
    var u = i === 0 ? ease((tau - 0.15) / 0.6) : 1;
    var d = i === 0 ? 0 : D * (1 - ease((tau - 0.14) / (T_MOVE1 - 0.14)));
    return {
      opacity: clamp01(tau / 0.1), u: u, d: d,
      v1: flapV(asm, i, un.pocket1, t, u, un.slot1), v2: flapV(asm, i, un.pocket2, t, u, un.slot2)
    };
  }

  /* ---------- the figure ---------- */
  function Figure(root) {
    var self = this;
    this.root = root;
    this.modeIndex = Math.max(0, MODES.map(function (m) { return m.n; }).indexOf(parseInt(root.getAttribute('data-start') || '3', 10)));
    this.playing = false; this.sel = -1; this.dirty = true; this.asmCache = {};

    root.innerHTML =
      '<div class="kusu-tabs" role="tablist" aria-label="Number of units"></div>' +
      '<div class="kusu-stage"><canvas aria-label="3D model of the paper units. Drag to turn it."></canvas>' +
      '<div class="kusu-hint">Drag to turn. Tap a unit to single it out.</div></div>' +
      '<div class="kusu-row"><button type="button" class="kusu-play">&#9654; Assemble</button>' +
      '<input type="range" class="kusu-slider" min="0" max="3" step="0.01" value="3" aria-label="Units placed">' +
      '<output class="kusu-count"></output></div>' +
      '<div class="kusu-row kusu-opts"><label><input type="checkbox" class="kusu-skel"> Show the hidden polyhedron</label>' +
      '<label><input type="checkbox" class="kusu-follow" checked> Turn to face each new unit while assembling</label></div>' +
      '<p class="kusu-readout" aria-live="polite"></p>';
    var tabs = root.querySelector('.kusu-tabs');
    MODES.forEach(function (m, k) {
      var b = document.createElement('button');
      b.type = 'button'; b.setAttribute('role', 'tab'); b.textContent = m.n + ' units';
      b.addEventListener('click', function () { self.setMode(k, true); });
      tabs.appendChild(b);
    });
    this.canvas = root.querySelector('canvas');
    this.slider = root.querySelector('.kusu-slider');
    this.playBtn = root.querySelector('.kusu-play');
    this.countEl = root.querySelector('.kusu-count');
    this.readout = root.querySelector('.kusu-readout');
    this.skelBox = root.querySelector('.kusu-skel');
    this.followBox = root.querySelector('.kusu-follow');

    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, alpha: true, preserveDrawingBuffer: !!root.getAttribute('data-shot') });
    } catch (err) {
      root.querySelector('.kusu-stage').innerHTML = '<p class="kusu-nogl">This figure needs WebGL, which this browser has turned off.</p>';
      return;
    }
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.62));
    var sun = new THREE.DirectionalLight(0xffffff, 0.55); sun.position.set(-2.5, 4, 5); this.scene.add(sun);
    var fill = new THREE.DirectionalLight(0xffffff, 0.18); fill.position.set(4, -2, 2); this.scene.add(fill);
    this.model = new THREE.Group(); this.scene.add(this.model);
    this.camDist = 8;

    this.slider.addEventListener('input', function () { self.stop(); self.t = parseFloat(self.slider.value); self.touch(); });
    this.playBtn.addEventListener('click', function () {
      if (self.playing) { self.stop(); } else { if (self.t >= self.asm.units.length - 1e-6) { self.t = 0; } self.playing = true; self.last = 0; }
      self.touch();
    });
    this.skelBox.addEventListener('change', function () { self.touch(); });
    this.bindPointer();
    if (typeof ResizeObserver !== 'undefined') { new ResizeObserver(function () { self.resize(); }).observe(this.canvas.parentNode); }
    window.addEventListener('resize', function () { self.resize(); });
    this.setMode(this.modeIndex, false);
    this.resize();
    var loop = function (now) { self.frame(now); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }

  Figure.prototype.touch = function () { this.dirty = true; };
  Figure.prototype.stop = function () { this.playing = false; };

  Figure.prototype.setMode = function (k, animate) {
    var self = this, m = MODES[k];
    this.modeIndex = k; this.mode = m;
    if (!this.asmCache[m.q]) { this.asmCache[m.q] = buildAssembly(m.q); }
    var asm = this.asm = this.asmCache[m.q];
    this.D = asm.D;
    Array.prototype.forEach.call(this.root.querySelectorAll('.kusu-tabs button'), function (b, i) {
      b.setAttribute('aria-selected', i === k ? 'true' : 'false');
    });
    /* rebuild meshes */
    while (this.model.children.length) {
      var ch = this.model.children.pop();
      if (ch.geometry) { ch.geometry.dispose(); }
      if (ch.material && ch.material.dispose) { ch.material.dispose(); }
    }
    this.meshes = []; this.lineObjs = [];
    asm.units.forEach(function (un) {
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6 * 9), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(6 * 9), 3));
      var mat = new THREE.MeshLambertMaterial({ color: COLORS[un.color], side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
      var mesh = new THREE.Mesh(g, mat); mesh.userData.unit = un.i; mesh.frustumCulled = false;
      self.model.add(mesh); self.meshes.push(mesh);
      var lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(10 * 6), 3));
      var lo = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x1d1d1d, transparent: true, opacity: 0.55 }));
      lo.frustumCulled = false; self.model.add(lo); self.lineObjs.push(lo);
    });
    /* hidden polyhedron: an edge under every unit's centre crease */
    var sk = this.skel = new THREE.Group();
    var smat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    asm.edges.forEach(function (e) {
      var a = new THREE.Vector3().fromArray(asm.vs[e[0]]), b = new THREE.Vector3().fromArray(asm.vs[e[1]]);
      var cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, a.distanceTo(b), 8), smat);
      cyl.position.copy(a).add(b).multiplyScalar(0.5);
      cyl.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      sk.add(cyl);
    });
    asm.vs.forEach(function (p) {
      var s = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), smat); s.position.fromArray(p); sk.add(s);
    });
    this.model.add(sk);
    var n = asm.units.length;
    this.slider.max = n; this.sel = -1;
    this.t = n; this.playing = false;
    if (animate) { this.t = 0; this.playing = true; this.last = 0; }
    this.fitTarget = null;
    /* start with the first unit facing the viewer, its crease upright */
    var r0 = new THREE.Vector3().fromArray(asm.units[0].r), ax0 = new THREE.Vector3().fromArray(asm.units[0].axis);
    var q0 = new THREE.Quaternion().setFromUnitVectors(r0, GDIR);
    var up = ax0.applyQuaternion(q0), tgt = new THREE.Vector3(0, 1, 0).addScaledVector(GDIR, -GDIR.y).normalize();
    up.addScaledVector(GDIR, -up.dot(GDIR)).normalize();
    var roll = new THREE.Quaternion().setFromUnitVectors(up, tgt);
    this.model.quaternion.copy(roll.multiply(q0));
    /* then turn a little further, so that the finished shape shows three sides */
    this.model.quaternion.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.55, -1.0, 0)));
    this.touch();
  };

  Figure.prototype.resize = function () {
    if (!this.renderer) { return; }
    var w = this.canvas.parentNode.clientWidth || 300;
    var h = Math.round(Math.max(260, Math.min(w * 0.82, 480)));
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.touch();
  };

  Figure.prototype.bindPointer = function () {
    var self = this, c = this.canvas, down = null, moved = 0;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', function (e) { down = { x: e.clientX, y: e.clientY }; moved = 0; try { c.setPointerCapture(e.pointerId); } catch (x) { } });
    c.addEventListener('pointermove', function (e) {
      if (!down) { return; }
      var dx = e.clientX - down.x, dy = e.clientY - down.y; down.x = e.clientX; down.y = e.clientY;
      moved += Math.abs(dx) + Math.abs(dy);
      var ang = Math.sqrt(dx * dx + dy * dy) * 0.008;
      if (ang > 0) {
        var q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(dy, dx, 0).normalize(), ang);
        self.model.quaternion.premultiply(q); self.userTurned = true; self.touch();
      }
    });
    var up = function (e) {
      if (down && moved < 6) { self.pick(e); }
      down = null;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', function () { down = null; });
  };

  Figure.prototype.pick = function (e) {
    var r = this.canvas.getBoundingClientRect();
    var p = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    var rc = new THREE.Raycaster(); rc.setFromCamera(p, this.camera);
    var vis = this.meshes.filter(function (m) { return m.visible; });
    vis.forEach(function (m) { m.geometry.computeBoundingSphere(); });
    var hit = rc.intersectObjects(vis, false);
    var u = hit.length ? hit[0].object.userData.unit : -1;
    this.sel = (u === this.sel) ? -1 : u;
    this.touch();
  };

  Figure.prototype.frame = function (now) {
    if (!this.renderer) { return; }
    var asm = this.asm, n = asm.units.length, dt = this.last ? Math.min(0.05, (now - this.last) / 1000) : 0;
    this.last = now;
    if (this.playing) {
      var per = n <= 3 ? 1.9 : (n <= 6 ? 1.6 : (n <= 12 ? 1.15 : 0.8));
      this.t = Math.min(n, this.t + dt / per);
      if (this.t >= n) { this.playing = false; }
      this.dirty = true;
      if (this.followBox.checked) {
        var cur = asm.units[Math.min(n - 1, Math.floor(this.t))];
        var w = new THREE.Vector3().fromArray(cur.r).applyQuaternion(this.model.quaternion);
        var gdir = GDIR;
        var axis = new THREE.Vector3().crossVectors(w, gdir), sl = axis.length();
        var ang = Math.atan2(sl, w.dot(gdir));
        if (sl > 1e-6 && ang > 1e-3) {
          this.model.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(axis.normalize(), ang * (1 - Math.exp(-dt * 2.6))));
        }
      }
    }
    /* camera distance: room for the unit in flight, closer once complete */
    var inFlight = this.t < n - 1e-6;
    var Rfit = inFlight ? Math.max(asm.R * 1.12, asm.Rstage * 0.95) : asm.R * 1.12;
    var half = this.camera.fov * Math.PI / 360;
    var halfH = Math.atan(Math.tan(half) * this.camera.aspect);
    var want = Rfit / Math.sin(Math.min(half, halfH));
    if (this.fitTarget === null) { this.camDist = want; }
    this.fitTarget = want;
    if (Math.abs(this.camDist - want) > 1e-3) { this.camDist += (want - this.camDist) * (dt ? (1 - Math.exp(-dt * 3)) : 1); this.dirty = true; }
    if (!this.dirty) { return; }
    this.dirty = false;
    this.camera.position.set(0, 0, this.camDist); this.camera.lookAt(0, 0, 0);

    var skel = this.skelBox.checked, sel = this.sel, self = this;
    this.skel.visible = skel;
    asm.units.forEach(function (un, i) {
      var st = unitState(asm, i, self.t, self.D), mesh = self.meshes[i], lo = self.lineObjs[i];
      if (!st) { mesh.visible = false; lo.visible = false; return; }
      mesh.visible = true; lo.visible = true;
      var ps = pose(un, st.u, st.v1, st.v2, st.d);
      var pa = mesh.geometry.attributes.position.array, na = mesh.geometry.attributes.normal.array, k = 0;
      ps.tri.forEach(function (tr) {
        var nn = unit(cross(sub(tr[1], tr[0]), sub(tr[2], tr[0])));
        if (dot(nn, add(un.r, mul(un.M, 0.2))) < 0) { nn = mul(nn, -1); var tmp = tr[1]; tr[1] = tr[2]; tr[2] = tmp; }
        tr.forEach(function (p) { pa[k] = p[0]; pa[k + 1] = p[1]; pa[k + 2] = p[2]; na[k] = nn[0]; na[k + 1] = nn[1]; na[k + 2] = nn[2]; k += 3; });
      });
      mesh.geometry.attributes.position.needsUpdate = true; mesh.geometry.attributes.normal.needsUpdate = true;
      var la = lo.geometry.attributes.position.array; k = 0;
      ps.lines.forEach(function (l) { l.forEach(function (p) { la[k] = p[0]; la[k + 1] = p[1]; la[k + 2] = p[2]; k += 3; }); });
      lo.geometry.attributes.position.needsUpdate = true;
      var op = st.opacity;
      if (sel >= 0 && sel !== i) { op *= 0.14; } else if (skel && sel < 0) { op *= 0.3; }
      mesh.material.transparent = op < 0.999; mesh.material.opacity = op; mesh.material.depthWrite = op > 0.6;
      mesh.renderOrder = op < 0.999 ? 2 : 0;
      lo.material.opacity = 0.55 * op;
    });
    this.renderer.render(this.scene, this.camera);

    /* text */
    var placed = Math.min(n, Math.floor(this.t + 1e-6));
    this.slider.value = this.t;
    this.countEl.textContent = placed + ' of ' + n;
    this.playBtn.innerHTML = this.playing ? '&#10073;&#10073; Pause' : (this.t >= n - 1e-6 ? '&#8635; Assemble again' : '&#9654; Assemble');
    var u0 = asm.units[0], m = this.mode;
    var crease = u0.creaseSense === 'flat' ? 'left flat (180&deg;)' : 'a ' + u0.creaseSense + ' fold; the two halves of the square meet at ' + u0.creaseDeg.toFixed(1) + '&deg;';
    this.readout.innerHTML = '<b>' + n + ' units make ' + m.solid + '.</b> One unit lies on each of the ' + n + ' edges of ' + m.base +
      '; ' + m.q + ' units meet at each of its corners. Centre crease: ' + crease + '.';
  };

  /* still picture of the four finished solids, used for the post's lead image */
  Figure.prototype.snapshot = function (k) { this.setMode(k, false); this.frame(performance.now()); };

  function init() {
    var nodes = document.querySelectorAll('.kusu-fig');
    window.kusuFigures = Array.prototype.map.call(nodes, function (n) { return new Figure(n); });
  }
  window.kusuModel = { buildAssembly: buildAssembly, pose: pose, unitState: unitState, MODES: MODES };
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', init); } else { init(); }
})();
