// The gallery's demos: for each instrument, a small canvas with the object moving, its stems on the pitch ruler,
// and a Play button. Picture, stems and sound come from one list of partials {ratio, amp, tau} per instrument.
// The picture is slowed down (one swing of the lowest partial takes 1/VIS seconds) and enlarged; every partial keeps
// its true frequency ratio. Strengths fade in real time, at the same rates as the sound.
(function () {
  "use strict";
  var C = window.Core, O = window.Orchestra;
  if (!C || !O || !O.sketch) return;
  var M = C.models, VIS = 0.9, NS = "http://www.w3.org/2000/svg";
  function acc() { return C.col["--accent"]; }
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  function cosT(r, t) { return Math.cos(2 * Math.PI * VIS * r * t); }
  function label(g, s, x, y, align) { g.font = "11px 'IBM Plex Sans Condensed', system-ui, sans-serif"; g.fillStyle = C.rgb("--muted"); g.textAlign = align || "left"; g.fillText(s, x, y); }

  // ---------- the kalimba tine: clamped–free modes, and the cubic it starts from ----------
  // Displacement coefficients of the start u0 = ξ²(3 − ξ)/2 (tip pushed to 1), by projection on each mode (Simpson's rule).
  var KD = C.KM.map(function (m) {
    var N = 400, num = 0, den = 0;
    for (var j = 0; j <= N; j++) { var xi = j / N, w = (j === 0 || j === N) ? 1 : (j % 2 ? 4 : 2), p = m.shape(xi); num += w * xi * xi * (3 - xi) / 2 * p; den += w * p * p; }
    return num / den;
  });
  function drawTine(g, st, t, W, H) {
    var x0 = 0.12 * W, x1 = 0.93 * W, cy = 0.46 * H, sc = 0.3 * H;
    g.fillStyle = C.rgb("--muted", 0.55); g.fillRect(x0 - 16, cy - 26, 16, 52);
    g.strokeStyle = C.rgb("--muted", 0.5); g.lineWidth = 1; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(x0, cy); g.lineTo(x1, cy); g.stroke(); g.setLineDash([]);
    g.strokeStyle = rgba(acc(), 0.95); g.lineWidth = 5; g.lineCap = "round"; g.beginPath();
    for (var i = 0; i <= 80; i++) {
      var xi = i / 80, u = 0;
      st.forEach(function (p, k) { u += KD[k] * p.e * C.KM[k].shape(xi) * cosT(p.ratio, t); });
      var x = x0 + (x1 - x0) * xi, y = cy - sc * u; if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
    label(g, "clamp", x0 - 8, H - 6, "center"); label(g, "free tip", x1, H - 6, "right");
  }

  // ---------- the bowed string: Helmholtz motion as the sum of the string's modes ----------
  function drawBowed(g, st, t, W, H) {
    var x0 = 14, x1 = W - 14, cy = 0.47 * H, sc = 0.34 * H / (Math.PI * Math.PI / 8), e = st.length ? st[0].e : 0;
    g.fillStyle = C.rgb("--muted", 0.6); g.fillRect(x0 - 4, cy - 14, 4, 28); g.fillRect(x1, cy - 14, 4, 28);
    // the corner's path: two parabola arcs, height (π²/2) ξ(1 − ξ) for the sum below
    g.strokeStyle = C.rgb("--muted", 0.55); g.lineWidth = 1; g.setLineDash([3, 4]);
    [1, -1].forEach(function (s) { g.beginPath(); for (var i = 0; i <= 60; i++) { var xi = i / 60, y = cy - s * sc * e * Math.PI * Math.PI / 2 * xi * (1 - xi); if (i) g.lineTo(x0 + (x1 - x0) * xi, y); else g.moveTo(x0, y); } g.stroke(); });
    g.setLineDash([]);
    // the string: Σ (1/n²) sin(nπξ) sin(2π n f t), the n-th term carrying partial n of the stems (bridge force 1/n)
    g.strokeStyle = rgba(acc(), 0.95); g.lineWidth = 2.5; g.lineJoin = "round"; g.beginPath();
    for (var i = 0; i <= 160; i++) {
      var xi = i / 160, u = 0;
      for (var k = 0; k < st.length; k++) { var n = st[k].ratio; u += st[k].e * Math.sin(n * Math.PI * xi) * Math.sin(2 * Math.PI * VIS * n * t) / (n * n); }
      var x = x0 + (x1 - x0) * xi, y = cy - sc * u; if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
    var xb = x0 + (x1 - x0) * 0.85;
    g.strokeStyle = C.rgb("--ink", 0.55); g.lineWidth = 3; g.beginPath(); g.moveTo(xb - 2, cy - 0.4 * H); g.lineTo(xb + 2, cy + 0.33 * H); g.stroke();
    label(g, "nut", x0, H - 4, "left"); label(g, "bow", xb - 6, 11, "right"); label(g, "bridge", x1, H - 4, "right");
  }

  // ---------- air in a tube: pressure shading and thin slabs of air ----------
  // Open end: pressure 0. Closed end (the clarinet's reed, on the left): no pressure slope. Each partial is drawn in the
  // shape of the tube's mode at its frequency; the displacement ξ is in phase with the pressure, with p = −K ξ_x.
  function drawTube(closed) {
    return function (g, st, t, W, H) {
      var x0 = 18, x1 = W - 18, w = x1 - x0, cy = 0.46 * H, th = 0.5 * H, N = 90, sw = 0, sx = 0;
      var use = st.filter(function (p) { return !closed || p.ratio % 2 === 1; });
      use.forEach(function (p) { sw += p.w; sx += p.w / p.ratio; });
      sw = sw || 1; sx = sx || 1;
      function P(r, xi) { return closed ? Math.cos(r * Math.PI * xi / 2) : Math.sin(r * Math.PI * xi); }
      function X(r, xi) { return closed ? -Math.sin(r * Math.PI * xi / 2) / r : Math.cos(r * Math.PI * xi) / r; }
      var a = acc(), bg = C.col["--panel"];
      for (var i = 0; i < N; i++) {
        var xi = (i + 0.5) / N, pr = 0;
        use.forEach(function (p) { pr += p.e * p.w * P(p.ratio, xi) * cosT(p.ratio, t); });
        var al = Math.max(0.02, Math.min(0.55, 0.26 + 0.26 * pr / sw));   // opaque mix of panel and accent, so slices don't seam
        g.fillStyle = "rgb(" + [0, 1, 2].map(function (c) { return Math.round(bg[c] + (a[c] - bg[c]) * al); }).join(",") + ")";
        g.fillRect(Math.floor(x0 + w * i / N), cy - th / 2, Math.ceil(w / N) + 1, th);
      }
      g.strokeStyle = C.rgb("--ink", 0.5); g.lineWidth = 1.2;
      for (var j = 0; j <= 24; j++) {
        var xj = j / 24, dx = 0;
        use.forEach(function (p) { dx += p.e * p.w * X(p.ratio, xj) * cosT(p.ratio, t); });
        var xx = x0 + w * Math.max(0, Math.min(1, xj + 0.035 * dx / sx));
        g.beginPath(); g.moveTo(xx, cy - th / 2 + 3); g.lineTo(xx, cy + th / 2 - 3); g.stroke();
      }
      g.strokeStyle = C.rgb("--muted", 0.9); g.lineWidth = 2; g.beginPath();
      if (closed) { g.moveTo(x1, cy - th / 2); g.lineTo(x0, cy - th / 2); g.moveTo(x0, cy + th / 2); g.lineTo(x1, cy + th / 2); }
      else { g.moveTo(x0, cy - th / 2); g.lineTo(x0 + 0.05 * w, cy - th / 2); g.moveTo(x0 + 0.09 * w, cy - th / 2); g.lineTo(x1, cy - th / 2); g.moveTo(x0, cy + th / 2); g.lineTo(x1, cy + th / 2); }
      g.stroke();
      if (closed) { g.lineWidth = 5; g.strokeStyle = C.rgb("--ink", 0.7); g.beginPath(); g.moveTo(x0, cy - th / 2); g.lineTo(x0, cy + th / 2); g.stroke(); label(g, "reed: closed", x0, H - 4, "left"); }
      else label(g, "embouchure hole: open", x0, 11, "left");
      label(g, closed ? "bell: open" : "foot: open", x1, H - 4, "right");
    };
  }

  // ---------- the harmonica reed and the puffs it lets through ----------
  // The reed swings in its first mode; the slot is open, in this demo's model, while the reed's tip is above the plate,
  // which lets through one puff per cycle: q = max(0, sin θ − 0.6), the puff shape core.js uses for the blown sound.
  var R1 = C.KM[0].shape, R1L = R1(1);
  function drawReed(g, st, t, W, H) {
    var e = st.length ? st[0].e : 0, s = e * Math.sin(2 * Math.PI * VIS * t);
    var x0 = 16, x1 = 0.5 * W, cy = 0.52 * H, A = 0.3 * H, top = cy - 0.6 * A, bot = cy + 1.1 * A;
    g.fillStyle = C.rgb("--muted", 0.22); g.fillRect(x0, top, x1 + 10 - x0, bot - top);
    g.strokeStyle = C.rgb("--muted", 0.7); g.lineWidth = 1; g.strokeRect(x0, top, x1 + 10 - x0, bot - top);
    label(g, "plate", x0 + 0.45 * (x1 - x0), bot - 4, "center");
    g.fillStyle = C.rgb("--ink", 0.6); g.beginPath(); g.arc(x0 + 6, cy, 3.5, 0, 2 * Math.PI); g.fill();
    g.strokeStyle = rgba(acc(), 0.95); g.lineWidth = 3.5; g.lineCap = "round"; g.beginPath();
    for (var i = 0; i <= 50; i++) { var xi = i / 50, x = x0 + 6 + (x1 - x0 - 6) * xi, y = cy - A * s * R1(xi) / R1L; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.stroke();
    // puffs leaving the slot: one per cycle, released around the top of each swing
    var a = acc(), per = 1 / VIS, c0 = Math.floor(t / per);
    for (var c = c0 - 2; c <= c0; c++) {
      var age = t - (c + 0.25) * per;
      if (age < 0 || age > 1.7 * per || c < 0) continue;
      var f = 1 - age / (1.7 * per);
      g.fillStyle = rgba(a, 0.55 * f * e); g.beginPath(); g.arc(x1 - 4 + 30 * age / per, top - 8 - 26 * age / per, 3 + 5 * (1 - f), 0, 2 * Math.PI); g.fill();
    }
    label(g, "rivet", x0, H - 2, "left"); label(g, "reed", x1 + 10, H - 2, "right");
    // the airflow through the slot over the last two and a half cycles
    var gx0 = 0.6 * W, gx1 = W - 10, gy = 0.78 * H, gh = 0.5 * H, span = 2.5 * per;
    g.strokeStyle = C.rgb("--muted", 0.7); g.lineWidth = 1; g.beginPath(); g.moveTo(gx0, gy); g.lineTo(gx1, gy); g.stroke();
    g.strokeStyle = rgba(a, 0.95); g.lineWidth = 2; g.beginPath();
    for (var k = 0; k <= 160; k++) {
      var tt = t - span + span * k / 160, q = tt < 0 ? 0 : Math.max(0, Math.sin(2 * Math.PI * VIS * tt) - 0.6) / 0.4 * e;
      var x = gx0 + (gx1 - gx0) * k / 160, y = gy - gh * q; if (k) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
    label(g, "airflow through the slot", gx1, 12, "right"); label(g, "time →", gx1, H - 4, "right");
  }

  // ---------- the instruments ----------
  function sketchOf(v) { return function (g, st, t, W, H) { O.sketch(g, v, { parts: st.map(function (p) { return { ratio: p.ratio, a: p.a }; }) }, t, 16, 6, W - 32, H - 12, acc(), false); }; }
  function range(n0, n1, step) { var out = []; for (var n = n0; n <= n1; n += step) out.push(n); return out; }
  var V = {
    piano: { ring: true, f: 261.63, dur: 4, rmax: 11, parts: function () { return O.voices.piano.parts(60).parts; }, draw: sketchOf("piano") },
    kalimba: { ring: true, f: 440, dur: 3.5, rmax: 18, every: 3, offLabel: true, parts: function () { return M.kalimba.partials({ f1: 440 }); }, draw: drawTine },
    glockenspiel: { ring: true, f: C.mtof(84), dur: 3, rmax: 6, parts: function () { return O.voices.glock.parts(84).parts; }, draw: sketchOf("glock") },
    violin: { ring: false, f: 196, dur: 2.6, rmax: 10, ticks: range(1, 10, 1), parts: function () { return M.violin.partials(); }, draw: drawBowed },
    flute: { ring: false, f: 293.66, dur: 2.6, rmax: 10, ticks: range(1, 10, 1), parts: function () { return M.clarinet.partials({ flute: true }); }, draw: drawTube(false) },
    clarinet: { ring: false, f: C.mtof(50), dur: 2.6, rmax: 10, ticks: range(1, 10, 2), parts: function () { return O.voices.clarinet.parts(50).parts; }, draw: drawTube(true) },
    harmonica: { ring: false, f: 523.25, dur: 2.6, rmax: 8, ticks: [1, C.KM[1].ratio], parts: function () { return M.harmonica.partials(); }, draw: drawReed },
    theremin: { ring: false, f: 440, dur: 2.6, rmax: 6, ticks: [], parts: function () { return [{ ratio: 1, amp: 1, tau: 1e6 }]; }, draw: sketchOf("theremin") }
  };
  Object.keys(V).forEach(function (k) {
    var v = V[k], ps = v.parts(), m = 0;
    ps.forEach(function (p) { m = Math.max(m, Math.abs(p.amp)); });
    v.list = ps.map(function (p) { return { ratio: p.ratio, w: Math.abs(p.amp) / m, tau: p.tau }; });
  });

  // envelopes: a ringing partial fades as e^(−t/τ), like the sound; a held note rises in 40 ms and lets go over 0.35 s
  function hold(t, dur) { return Math.max(0, Math.min(1, t / 0.04, (dur - t) / 0.35)); }
  function env(v, p, t) { return v.ring ? Math.exp(-t / p.tau) * Math.max(0, Math.min(1, (v.dur - t) / 0.35)) : hold(t, v.dur); }
  // st: per partial, w (its strength at the start, 1 = the strongest), e (its envelope now), a = w·e (what the stem shows)
  function state(v, t, on) { return v.list.map(function (p) { var e = on ? env(v, p, t) : 0; return { ratio: p.ratio, w: p.w, e: e, a: p.w * e }; }); }

  function el(tag, at, parent) { var e = document.createElementNS(NS, tag); for (var k in at) e.setAttribute(k, at[k]); parent.appendChild(e); return e; }
  // The pitch ruler of post 1: gray lines at whole-number multiples, one stem per partial (taller = stronger now),
  // and, for a self-sustained instrument, short ticks under the axis at the resonator's own frequencies.
  function ruler(svg, parts, v) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var W = 320, H = 100, fs = 8, L = 6, R = W - 6 - 0.6 * fs, base = H - fs - 12, top = 12, every = v.every || 1, off = [];
    function X(r) { return L + (R - L) * r / v.rmax; }
    for (var k = 1; k <= v.rmax; k++) {
      el("line", { x1: X(k), x2: X(k), y1: top - 4, y2: base, stroke: C.rgb("--grid"), "stroke-width": 1 }, svg);
      if (k % every === 0) el("text", { x: X(k), y: H - 3, "text-anchor": "middle", "font-size": fs }, svg).textContent = k + "×";
    }
    el("line", { x1: L, x2: R, y1: base, y2: base, stroke: C.rgb("--muted"), "stroke-width": 1 }, svg);
    (v.ticks || []).forEach(function (r) { if (r <= v.rmax + 1e-9) el("line", { x1: X(r), x2: X(r), y1: base + 2, y2: base + 8, stroke: C.rgb("--pos"), "stroke-width": 2.2, "stroke-linecap": "round" }, svg); });
    parts.forEach(function (p) {
      if (p.ratio > v.rmax + 1e-9) { if (p.a > 0.02 && off.length < 2) off.push(p.ratio); return; }
      if (p.a < 0.004) return;
      var x = X(p.ratio), h = Math.max(1.5, (base - top) * Math.min(1, p.a));
      el("line", { x1: x, x2: x, y1: base, y2: base - h, stroke: C.rgb("--accent"), "stroke-width": 3, "stroke-linecap": "round" }, svg);
    });
    if (off.length && v.offLabel) { var lt = el("text", { x: R, y: top + 2, "text-anchor": "end", "font-size": fs }, svg); lt.textContent = "→ " + off.map(function (r) { return r.toFixed(1) + "×"; }).join(", "); lt.setAttribute("style", "fill:" + C.rgb("--accent")); }
  }

  function render(v) {
    var parts = v.list.map(function (p) { return { f: p.ratio * v.f, amp: p.w, tau: v.ring ? p.tau : 1e6 }; });
    var buf = C.render(parts, v.dur), d = buf.getChannelData(0), SR = buf.sampleRate;
    for (var n = 0; n < d.length; n++) { var t = n / SR; d[n] *= v.ring ? Math.max(0, Math.min(1, (v.dur - t) / 0.35)) : hold(t, v.dur); }
    return buf;
  }

  var demos = [], raf = 0;
  function draw(d, t, on) {
    var cv = d.cv, dpr = C.fit(cv), g = cv.getContext("2d"), W = cv.width / dpr, H = cv.height / dpr;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    var st = state(d.v, t, on);
    d.v.draw(g, st, C.reduce ? 0 : t, W, H);
    ruler(d.svg, on ? st : d.v.list.map(function (p) { return { ratio: p.ratio, a: p.w }; }), d.v);
  }
  function frame(now) {
    var any = false;
    demos.forEach(function (d) {
      if (!d.t0) return;
      var t = (now - d.t0) / 1000;
      if (t > d.v.dur) { d.t0 = 0; draw(d, 0, false); return; }
      any = true; draw(d, Math.max(0, t), true);
    });
    raf = any ? requestAnimationFrame(frame) : 0;
  }
  document.querySelectorAll(".gdemo").forEach(function (box) {
    var v = V[box.getAttribute("data-g")]; if (!v) return;
    var d = { v: v, cv: box.querySelector("canvas"), svg: box.querySelector("svg"), t0: 0, buf: null };
    demos.push(d);
    box.querySelector("[data-gplay]").addEventListener("click", function () {
      if (!d.buf) d.buf = render(v);
      C.play(d.buf, 0.75);
      d.t0 = performance.now();
      if (!raf) raf = requestAnimationFrame(frame);
    });
    draw(d, 0, false);
  });
  function redrawIdle() { demos.forEach(function (d) { if (!d.t0) draw(d, 0, false); }); }
  C.onTheme(redrawIdle);
  window.addEventListener("resize", redrawIdle);
})();
