// Demos for "One string, end to end": two beads (bd), the sum of modes (ms), the pluck point and the light touch (tc).
// Every picture is computed from the same modes as the stems and the sound beside it.
(function () {
  "use strict";
  var C = Core;
  function font(d) { return (11 * d) + "px 'IBM Plex Mono', monospace"; }

  // ---------- two beads at L/3 and 2L/3 ----------
  // q1 = (u1 + u2)/sqrt2 swings with lambda = T/mh, q2 = (u1 - u2)/sqrt2 with 3T/mh. Slowed: lambda = T/mh shown at 0.4 swings/s.
  (function () {
    var cv = document.getElementById("bdCanvas"), pl = document.getElementById("bdPlane");
    if (!cv || !pl) return;
    var g = cv.getContext("2d"), h = pl.getContext("2d"), a1 = 0.55, a2 = 0.45, which = "M", t0 = performance.now(), trail = [], BASE = 0.4;
    function setStart(k) {
      which = k; a1 = k === "D" ? 0 : (k === "S" ? 0.8 : 0.55); a2 = k === "S" ? 0 : (k === "D" ? 0.8 : 0.45);
      ["S", "D", "M"].forEach(function (q) { document.getElementById("bd" + q).setAttribute("aria-pressed", q === k ? "true" : "false"); });
      t0 = performance.now(); trail = [];
    }
    function heights(t) {
      var w1 = 2 * Math.PI * BASE, w2 = 2 * Math.PI * BASE * Math.sqrt(3);
      var q1 = a1 * Math.cos(w1 * t), q2 = a2 * Math.cos(w2 * t + (which === "M" ? 0.3 : 0));
      return [(q1 + q2) / Math.SQRT2, (q1 - q2) / Math.SQRT2];
    }
    function draw(now) {
      var t = (now - t0) / 1000, x = heights(t);
      var d = C.fit(cv), W = cv.width, H = cv.height, A = H * 0.5;
      g.clearRect(0, 0, W, H); g.lineWidth = 2 * d;
      var x0 = W * 0.06, x3 = W * 0.94, xa = x0 + (x3 - x0) / 3, xb = x0 + 2 * (x3 - x0) / 3, y0 = H / 2;
      g.strokeStyle = C.rgb("--grid"); g.setLineDash([4 * d, 4 * d]); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x3, y0); g.stroke(); g.setLineDash([]);
      g.fillStyle = C.rgb("--muted"); g.fillRect(x0 - 4 * d, y0 - 14 * d, 4 * d, 28 * d); g.fillRect(x3, y0 - 14 * d, 4 * d, 28 * d);
      var ya = y0 - A * x[0], yb = y0 - A * x[1];
      g.strokeStyle = C.rgb("--ink"); g.beginPath(); g.moveTo(x0, y0); g.lineTo(xa, ya); g.lineTo(xb, yb); g.lineTo(x3, y0); g.stroke();
      g.fillStyle = C.rgb("--accent"); [[xa, ya], [xb, yb]].forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], 7 * d, 0, 2 * Math.PI); g.fill(); });
      g.fillStyle = C.rgb("--muted"); g.font = font(d); g.fillText("u₁", xa - 6 * d, H - 6 * d); g.fillText("u₂", xb - 6 * d, H - 6 * d);
      var e = C.fit(pl), P = pl.width, Q = pl.height, m = Math.min(P, Q), ox = P / 2, oy = Q / 2, sc = m * 0.42;
      h.clearRect(0, 0, P, Q); h.lineWidth = 1 * e;
      h.strokeStyle = C.rgb("--grid"); h.beginPath(); h.moveTo(ox - sc, oy); h.lineTo(ox + sc, oy); h.moveTo(ox, oy - sc); h.lineTo(ox, oy + sc); h.stroke();
      h.strokeStyle = C.rgb("--accent"); h.lineWidth = 1.5 * e; h.beginPath(); h.moveTo(ox - sc * 0.8, oy + sc * 0.8); h.lineTo(ox + sc * 0.8, oy - sc * 0.8); h.moveTo(ox - sc * 0.8, oy - sc * 0.8); h.lineTo(ox + sc * 0.8, oy + sc * 0.8); h.stroke();
      h.fillStyle = C.rgb("--muted"); h.font = font(e);
      h.fillText("u₁", ox + sc - 14 * e, oy - 5 * e); h.fillText("u₂", ox + 5 * e, oy - sc + 10 * e); h.fillText("q₁", ox + sc * 0.8, oy - sc * 0.84); h.fillText("q₂", ox + sc * 0.8, oy + sc * 0.95);
      trail.push([x[0], x[1]]); if (trail.length > 420) trail.shift();
      h.strokeStyle = C.rgb("--ink"); h.globalAlpha = 0.6; h.lineWidth = 1.5 * e; h.beginPath();
      trail.forEach(function (p, i) { var X = ox + sc * p[0] * 1.3, Y = oy - sc * p[1] * 1.3; if (i) h.lineTo(X, Y); else h.moveTo(X, Y); }); h.stroke(); h.globalAlpha = 1;
      h.fillStyle = C.rgb("--accent"); h.beginPath(); h.arc(ox + sc * x[0] * 1.3, oy - sc * x[1] * 1.3, 4 * e, 0, 2 * Math.PI); h.fill();
      requestAnimationFrame(draw);
    }
    ["S", "D", "M"].forEach(function (k) { document.getElementById("bd" + k).addEventListener("click", function () { setStart(k); }); });
    document.getElementById("bdPlay").addEventListener("click", function () {
      var parts = [];
      if (a1 > 0) parts.push({ f: 196, amp: a1, tau: 0.9 });
      if (a2 > 0) parts.push({ f: 196 * Math.sqrt(3), amp: a2, tau: 0.9 });
      C.play(C.render(parts, 2.2), 0.7);
    });
    requestAnimationFrame(draw);
  })();

  // ---------- the plucked string as a sum of modes ----------
  // u(x,t) = sum B_n cos(n pi c t / L) sin(n pi x / L), B_n = 2 h L^2 sin(n pi x0/L) / (pi^2 n^2 x0 (L - x0)); L = h = 1.
  // Exact: d'Alembert, u = (F(x - ct) + F(x + ct))/2 with F the odd 2L-periodic extension of the triangle.
  (function () {
    var cv = document.getElementById("msCanvas"); if (!cv) return;
    var g = cv.getContext("2d"), N = 5, x0 = 0.2, t0 = performance.now(), PERIOD = 4; // seconds on screen per period 2L/c
    function B(n) { return 2 * Math.sin(n * Math.PI * x0) / (Math.PI * Math.PI * n * n * x0 * (1 - x0)); }
    function tri(y) { return y <= x0 ? y / x0 : (1 - y) / (1 - x0); }
    function F(y) { y = ((y % 2) + 2) % 2; return y <= 1 ? tri(y) : -tri(2 - y); }
    function read() {
      document.getElementById("msNo").textContent = N;
      document.getElementById("msXo").textContent = x0.toFixed(2) + " L";
      var zeros = []; for (var n = 1; n <= 12; n++) if (Math.abs(Math.sin(n * Math.PI * x0)) < 1e-9) zeros.push(n);
      document.getElementById("msRead").textContent = "First " + N + (N === 1 ? " mode" : " modes") + (zeros.length ? " · Bₙ = 0 for n = " + zeros.join(", ") + ": those modes have a still point at the pluck" : "");
      var parts = []; for (var n = 1; n <= 12; n++) parts.push({ ratio: n, amp: Math.abs(B(n)) });
      C.stems(document.getElementById("msSpec"), parts, { W: 320, H: 90, rmax: 12, fs: 8, sw: 3, noOff: true });
    }
    function draw(now) {
      var d = C.fit(cv), W = cv.width, H = cv.height, Lx = 18 * d, Rx = W - 18 * d, y0 = H * 0.55, A = H * 0.38;
      var tau = ((now - t0) / 1000) * 2 / PERIOD; // c t in units of L
      g.clearRect(0, 0, W, H);
      g.fillStyle = C.rgb("--muted"); g.fillRect(Lx - 4 * d, y0 - 18 * d, 4 * d, 36 * d); g.fillRect(Rx, y0 - 18 * d, 4 * d, 36 * d);
      g.strokeStyle = C.rgb("--grid"); g.lineWidth = d; g.beginPath(); g.moveTo(Lx, y0); g.lineTo(Rx, y0); g.stroke();
      g.strokeStyle = C.rgb("--muted"); g.setLineDash([5 * d, 4 * d]); g.lineWidth = 1.5 * d; g.beginPath();
      for (var i = 0; i <= 400; i++) { var x = i / 400, u = 0.5 * (F(x - tau) + F(x + tau)), px = Lx + (Rx - Lx) * x, py = y0 - A * u; if (i) g.lineTo(px, py); else g.moveTo(px, py); }
      g.stroke(); g.setLineDash([]);
      g.strokeStyle = C.rgb("--accent"); g.lineWidth = 2.2 * d; g.beginPath();
      for (i = 0; i <= 400; i++) {
        x = i / 400; u = 0;
        for (var n = 1; n <= N; n++) u += B(n) * Math.cos(n * Math.PI * tau) * Math.sin(n * Math.PI * x);
        px = Lx + (Rx - Lx) * x; py = y0 - A * u; if (i) g.lineTo(px, py); else g.moveTo(px, py);
      }
      g.stroke();
      g.fillStyle = C.rgb("--muted"); g.font = font(d); g.fillText("x = 0", Lx - 6 * d, H - 6 * d); g.fillText("bridge, x = L", Rx - 92 * d, H - 6 * d);
      var pxp = Lx + (Rx - Lx) * x0; g.beginPath(); g.moveTo(pxp, 6 * d); g.lineTo(pxp, 14 * d); g.strokeStyle = C.rgb("--muted"); g.lineWidth = d; g.stroke(); g.fillText("x₀", pxp - 6 * d, 26 * d);
      requestAnimationFrame(draw);
    }
    var sN = document.getElementById("msN"), sX = document.getElementById("msX");
    sN.addEventListener("input", function () { N = parseInt(sN.value, 10); read(); });
    sX.addEventListener("input", function () { x0 = parseFloat(sX.value); t0 = performance.now(); read(); });
    document.getElementById("msRestart").addEventListener("click", function () { t0 = performance.now(); });
    document.getElementById("msPlay").addEventListener("click", function () {
      // heard through the force on the bridge: sizes n B_n, proportional to sin(n pi x0)/n
      var parts = []; for (var n = 1; n <= 40; n++) parts.push({ f: 196 * n, amp: n * B(n), tau: 0.9 / (1 + 0.05 * n * n) });
      C.play(C.render(parts, 2.6), 0.8);
    });
    C.onTheme(read); read(); requestAnimationFrame(draw);
  })();

  // ---------- pluck point and a light touch ----------
  // Mode n starts with displacement sin(n pi x0)/n^2 and is heard through the bridge force, n times that: sin(n pi x0)/n.
  // Fading: an illustrative rate 0.6 + 0.02 n^2 per second, plus 45 X_n(s)^2 per second from a finger at s.
  (function () {
    var cv = document.getElementById("tcCanvas"); if (!cv) return;
    var ctx = cv.getContext("2d"), F1 = 196, NM = 24, G = 45, touch = 0, x0 = 0.2, t0 = -1e9, amps = [], gam = [];
    function setup() {
      amps = []; gam = [];
      for (var n = 1; n <= NM; n++) {
        amps.push(Math.sin(n * Math.PI * x0) / (n * n));
        var xs = touch ? Math.sin(n * Math.PI * touch) : 0;
        gam.push(0.6 + 0.02 * n * n + G * xs * xs);
      }
    }
    function survivors() { if (!touch) return null; var out = []; for (var n = 1; n <= 12; n++) if (Math.abs(Math.sin(n * Math.PI * touch)) < 1e-6) out.push(n); return out; }
    var NAMES = { 2: "an octave up", 3: "an octave and a fifth up", 4: "two octaves up", 5: "two octaves and a major third up" };
    function read() {
      document.getElementById("tcXo").textContent = x0.toFixed(2) + " L";
      var sv = survivors(), txt;
      if (!sv) txt = "No touch: every mode the pluck starts sounds; lowest " + F1 + " Hz";
      else txt = "Only modes with a still point under the finger keep ringing: " + sv.slice(0, 4).join(", ") + ", … · you hear " + (sv[0] * F1) + " Hz, " + NAMES[sv[0]];
      document.getElementById("tcRead").textContent = txt + " · plucked " + (x0 < 0.12 ? "near an end: bright" : x0 > 0.4 ? "near the middle: even modes weak, hollow" : "between an end and the middle");
      var parts = amps.map(function (a, i) { return { ratio: i + 1, amp: Math.abs(a) * (i + 1) * Math.exp(-gam[i] * 0.25) }; });
      C.stems(document.getElementById("tcSpec"), parts, { W: 320, H: 96, rmax: 12, fs: 8, sw: 3, noOff: true });
    }
    function pluck() {
      setup(); read(); t0 = performance.now();
      C.play(C.render(amps.map(function (a, i) { return { f: F1 * (i + 1), amp: a * (i + 1), tau: 1 / gam[i] }; }), 3), 0.8);
    }
    function draw(now) {
      var d = C.fit(cv), W = cv.width, H = cv.height, L = 18 * d, R = W - 18 * d, y0 = H * 0.5, A = H * 0.32, t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = C.rgb("--ink"); ctx.fillRect(L - 4 * d, y0 - 22 * d, 4 * d, 44 * d); ctx.fillRect(R, y0 - 22 * d, 4 * d, 44 * d);
      var norm = 0; amps.forEach(function (a) { norm += Math.abs(a); }); norm = norm || 1;
      ctx.strokeStyle = C.rgb("--accent"); ctx.lineWidth = 2 * d; ctx.beginPath();
      for (var i = 0; i <= 300; i++) {
        var x = i / 300, u = 0;
        if (t >= 0 && t < 6) for (var n = 1; n <= NM; n++) u += amps[n - 1] * Math.exp(-gam[n - 1] * t) * Math.sin(n * Math.PI * x) * Math.cos(2 * Math.PI * n * 0.9 * t);
        var px = L + (R - L) * x, py = y0 - A * u / norm * 2.2; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
      var pxp = L + (R - L) * x0;
      ctx.fillStyle = C.rgb("--muted"); ctx.font = font(d); ctx.fillText("pluck", pxp - 14 * d, H - 6 * d);
      ctx.beginPath(); ctx.moveTo(pxp, H - 18 * d); ctx.lineTo(pxp, H - 26 * d); ctx.strokeStyle = C.rgb("--muted"); ctx.lineWidth = d; ctx.stroke();
      ctx.fillText("bridge", R - 44 * d, 14 * d);
      if (touch) {
        var fx = L + (R - L) * touch;
        ctx.fillStyle = C.rgb("--pos"); ctx.beginPath(); ctx.ellipse(fx, y0 - 16 * d, 7 * d, 11 * d, 0, 0, 2 * Math.PI); ctx.fill();
        ctx.fillStyle = C.rgb("--muted"); ctx.fillText("finger", fx - 18 * d, 14 * d);
      }
      requestAnimationFrame(draw);
    }
    document.querySelectorAll("[data-touch]").forEach(function (b) {
      b.addEventListener("click", function () {
        touch = parseFloat(b.getAttribute("data-touch"));
        document.querySelectorAll("[data-touch]").forEach(function (c) { c.setAttribute("aria-pressed", c === b ? "true" : "false"); });
        pluck();
      });
    });
    var ps = document.getElementById("tcX"); ps.addEventListener("input", function () { x0 = parseFloat(ps.value); setup(); read(); });
    document.getElementById("tcPluck").addEventListener("click", pluck);
    C.onTheme(read);
    setup(); read(); requestAnimationFrame(draw);
  })();
})();
