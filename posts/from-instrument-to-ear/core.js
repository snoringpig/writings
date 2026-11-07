(function () {
  "use strict";
  var C = window.Core = {};

  // ---------- theme ----------
  C.col = {};
  function hex(n) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    return (v[0] === "#" && v.length === 7) ? [parseInt(v.slice(1, 3), 16), parseInt(v.slice(3, 5), 16), parseInt(v.slice(5, 7), 16)] : [128, 128, 128];
  }
  C.readColors = function () { ["--paper", "--panel", "--ink", "--muted", "--accent", "--pos", "--neg", "--grid", "--rule", "--wood", "--metal"].forEach(function (k) { C.col[k] = hex(k); }); };
  C.rgb = function (c, a) { c = typeof c === "string" ? C.col[c] : c; return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (a == null ? 1 : a) + ")"; };
  var themeFns = [];
  C.onTheme = function (fn) { themeFns.push(fn); };
  function retheme() { C.readColors(); themeFns.forEach(function (f) { f(); }); }
  C.readColors();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", retheme);
  new MutationObserver(retheme).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  C.reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  C.fit = function (cv) {
    var d = window.devicePixelRatio || 1, w = Math.round(cv.clientWidth * d), h = Math.round(cv.clientHeight * d);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return d;
  };

  // ---------- numerics ----------
  var NQ = 128, TQ = [], SQ = [];
  for (var q = 0; q < NQ; q++) { var t = 2 * Math.PI * q / NQ; TQ.push(t); SQ.push(Math.sin(t)); }
  C.J = function (m, x) { var s = 0; for (var q = 0; q < NQ; q++) s += Math.cos(m * TQ[q] - x * SQ[q]); return s / NQ; };
  C.bisect = function (f, a, b) { var fa = f(a); for (var i = 0; i < 60; i++) { var c = 0.5 * (a + b), fc = f(c); if (fa * fc <= 0) b = c; else { a = c; fa = fc; } } return 0.5 * (a + b); };
  C.besselZeros = function (m, xmax) {
    var out = [], h = 0.02, x0 = Math.max(0.05, 0.9 * m), f0 = C.J(m, x0);
    for (var x = x0 + h; x <= xmax; x += h) { var f1 = C.J(m, x); if (f0 * f1 < 0) out.push(C.bisect(function (z) { return C.J(m, z); }, x - h, x)); f0 = f1; }
    return out;
  };
  C.noteName = function (f) {
    var names = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];
    var k = 69 + 12 * Math.log2(f / 440), r = Math.round(k), cents = Math.round(100 * (k - r));
    return { name: names[(r % 12 + 12) % 12] + (Math.floor(r / 12) - 1), cents: cents };
  };
  C.mtof = function (k) { return 440 * Math.pow(2, (k - 69) / 12); };

  // ---------- audio ----------
  var AC = null;
  C.ac = function () {
    if (!AC) {
      var K = window.AudioContext || window.webkitAudioContext; AC = new K();
      var comp = AC.createDynamicsCompressor(); comp.threshold.value = -10; comp.ratio.value = 4;
      C.out = AC.createGain(); C.out.gain.value = 0.55; C.out.connect(comp); comp.connect(AC.destination);
    }
    if (AC.state === "suspended") AC.resume();
    return AC;
  };
  // partials: [{f, amp, tau}]
  C.render = function (parts, dur) {
    var a = C.ac(), SR = a.sampleRate, N = Math.floor(dur * SR), buf = a.createBuffer(1, N, SR), d = buf.getChannelData(0);
    parts.forEach(function (p) {
      if (p.f > SR / 2.3 || p.f <= 0 || Math.abs(p.amp) < 1e-9) return;
      var w = 2 * Math.PI * p.f / SR, c = Math.cos(w), s = Math.sin(w), x = 1, y = 0, e = p.amp, dec = Math.exp(-1 / (p.tau * SR));
      var n1 = Math.min(N, Math.ceil(p.tau * SR * 9));
      for (var n = 0; n < n1; n++) { d[n] += e * x; var nx = x * c - y * s; y = x * s + y * c; x = nx; e *= dec; }
    });
    var ramp = Math.floor(0.002 * SR); for (var n = 0; n < ramp; n++) d[n] *= n / ramp;
    var pk = 0; for (var n = 0; n < N; n++) pk = Math.max(pk, Math.abs(d[n]));
    var g = pk > 0 ? 0.8 / pk : 1; for (var n = 0; n < N; n++) d[n] *= g;
    buf._gain = g;
    return buf;
  };
  // Like render, but each partial may start at a phase, with a fixed gain and no attack ramp or normalization.
  C.renderRaw = function (parts, dur, gain) {
    var a = C.ac(), SR = a.sampleRate, N = Math.max(1, Math.floor(dur * SR)), buf = a.createBuffer(1, N, SR), d = buf.getChannelData(0);
    parts.forEach(function (p) {
      if (p.f > SR / 2.3 || Math.abs(p.amp) < 1e-9) return;
      var w = 2 * Math.PI * p.f / SR, c = Math.cos(w), s = Math.sin(w), x = Math.cos(p.phase || 0), y = Math.sin(p.phase || 0), e = p.amp * gain, dec = Math.exp(-1 / (p.tau * SR));
      var n1 = Math.min(N, Math.ceil(p.tau * SR * 9));
      for (var n = 0; n < n1; n++) { d[n] += e * x; var nx = x * c - y * s; y = x * s + y * c; x = nx; e *= dec; }
    });
    return buf;
  };

  // ---------- piano voices with per-mode damping ----------
  // A damper felt pressing on [xd - w/2, xd + w/2] adds a damping term b(x) u_t. To first order each mode keeps its shape
  // and frequency and gains a decay rate proportional to the average of X_n^2 = sin^2(n pi s) under the felt.
  C.damperWeight = function (n, xd, w) {
    var a = xd - w / 2, b = xd + w / 2, k = 2 * n * Math.PI;
    return 1 - (Math.sin(k * b) - Math.sin(k * a)) / (k * w);
  };
  C.DAMPER = { xd: 0.22, w: 0.05, G: 15 };
  var pcache = {};
  C.pianoParts = function (k, mult, soft, mute) {
    var f = C.mtof(k);
    return C.toHz(C.models.piano.partials({ B: C.models.piano.B(k, mult), f1: f, rolloff: mute ? 4.5 : (soft ? 9 : 14) }), f);
  };
  C.pianoStrike = function (k, mult, soft, mute, level) {
    var id = [k, mult, soft, mute].join(":"), parts = C.pianoParts(k, mult, soft, mute);
    if (!pcache[id]) {
      var f = C.mtof(k), dur = Math.min(8, 1.5 + 3 * Math.pow(262 / f, 0.6)), b = C.render(parts, dur);
      var d = b.getChannelData(0), n = Math.floor(0.3 * b.sampleRate); for (var i = 0; i < n; i++) d[d.length - 1 - i] *= i / n;
      pcache[id] = b;
    }
    var a = C.ac(), src = a.createBufferSource(), g = a.createGain(), t0 = a.currentTime;
    src.buffer = pcache[id]; g.gain.value = level; src.connect(g); g.connect(C.out); src.start(t0);
    return { k: k, src: src, g: g, t0: t0, parts: parts, norm: pcache[id]._gain, level: level, released: false };
  };
  // Crossfade a sounding voice into one whose modes decay at the damped rates. Returns the new voice.
  C.pianoDamp = function (v, dmp) {
    dmp = dmp || C.DAMPER;
    var a = C.ac(), t1 = a.currentTime + 0.01, tau = t1 - v.t0, maxT = 0;
    var rel = v.parts.map(function (p, i) {
      var gam = dmp.G * C.damperWeight(i + 1, dmp.xd, dmp.w), tr = 1 / (1 / p.tau + gam);
      maxT = Math.max(maxT, tr);
      return { f: p.f, amp: p.amp * Math.exp(-tau / p.tau), tau: tr, phase: 2 * Math.PI * p.f * tau };
    });
    var buf = C.renderRaw(rel, Math.min(4, 7 * maxT), v.norm), src = a.createBufferSource(), g = a.createGain();
    src.buffer = buf; g.gain.setValueAtTime(0, t1); g.gain.linearRampToValueAtTime(v.level, t1 + 0.006);
    src.connect(g); g.connect(C.out); src.start(t1);
    v.g.gain.cancelScheduledValues(t1); v.g.gain.setValueAtTime(v.level, t1); v.g.gain.linearRampToValueAtTime(0, t1 + 0.006); v.src.stop(t1 + 0.05);
    return { k: v.k, src: src, g: g, t0: t1, parts: rel, norm: v.norm, level: v.level, released: true };
  };
  C.pianoStop = function (v, tc) {
    var t = C.ac().currentTime; v.g.gain.cancelScheduledValues(t); v.g.gain.setTargetAtTime(0, t, tc || 0.01); v.src.stop(t + 0.2);
  };
  C.play = function (buf, gain) {
    var a = C.ac(), src = a.createBufferSource(), g = a.createGain();
    g.gain.value = gain == null ? 1 : gain; src.buffer = buf; src.connect(g); g.connect(C.out); src.start();
    return src;
  };

  // ---------- spectrum stems ----------
  var NS = "http://www.w3.org/2000/svg";
  function el(tag, at, parent) { var e = document.createElementNS(NS, tag); for (var k in at) e.setAttribute(k, at[k]); parent.appendChild(e); return e; }
  // parts: [{ratio, amp}]; opt: {W,H,rmax,labelEvery,fs,sw,onPick,sel}
  C.stems = function (svg, parts, opt) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    var W = opt.W, H = opt.H, L = 6, R = W - 6 - 0.6 * opt.fs, base = H - (opt.fs + 6), top = 12, RMAX = opt.rmax, amax = 0;
    parts.forEach(function (p) { amax = Math.max(amax, Math.abs(p.amp)); });
    amax = amax || 1;
    function xOf(r) { return L + (R - L) * r / RMAX; }
    for (var t = 1; t <= RMAX; t++) {
      el("line", { x1: xOf(t), x2: xOf(t), y1: top - 4, y2: base, stroke: C.rgb("--grid"), "stroke-width": 1 }, svg);
      if (t % (opt.labelEvery || 1) === 0) { var tx = el("text", { x: xOf(t), y: H - 3, "text-anchor": "middle", "font-size": opt.fs }, svg); tx.textContent = t + "×"; }
    }
    el("line", { x1: L, x2: R, y1: base, y2: base, stroke: C.rgb("--muted"), "stroke-width": 1 }, svg);
    var off = [];
    parts.forEach(function (p, i) {
      var a = Math.abs(p.amp) / amax;
      if (p.ratio > RMAX + 1e-9) { if (a > 0.02 && off.length < 2) off.push(p.ratio); return; }
      var x = xOf(p.ratio), h = Math.max(2, (base - top) * a), sel = opt.sel === i;
      el("line", { x1: x, x2: x, y1: base, y2: base - h, stroke: C.rgb("--accent", a < 0.03 ? 0.3 : 1), "stroke-width": sel ? opt.sw + 1.5 : opt.sw, "stroke-linecap": "round" }, svg);
      if (sel) el("circle", { cx: x, cy: base - h - 5, r: 3, fill: C.rgb("--accent") }, svg);
      if (opt.onPick) {
        var hit = el("rect", { x: x - 4, y: top - 4, width: 8, height: base - top + 6, fill: "transparent", style: "cursor:pointer" }, svg);
        hit.addEventListener("click", function () { opt.onPick(i); });
      }
    });
    if (off.length && !opt.noOff) {
      var lt = el("text", { x: R, y: top + 4, "text-anchor": "end", "font-size": opt.fs }, svg);
      lt.textContent = "→ " + off.map(function (r) { return r.toFixed(1) + "×"; }).join(", ");
      lt.setAttribute("style", "fill:" + C.rgb("--accent"));
    }
  };

  // ---------- instrument models ----------
  var M = C.models = {};
  // Violin: ideal string; bowed motion is periodic, so partials sit exactly on n f1 with amplitude 1/n (bridge force of Helmholtz motion).
  M.violin = {
    F0: 196,
    partials: function (opt) {
      opt = opt || {}; var out = [];
      for (var n = 1; n <= 40; n++) {
        var amp = opt.pluck != null ? Math.sin(n * Math.PI * opt.pluck) / n : 1 / n;
        out.push({ ratio: n, amp: amp, tau: opt.pluck != null ? 0.9 / (1 + 0.05 * n * n) : 10 });
      }
      return out;
    }
  };
  // Violin body: the wooden box as a linear filter. Peaks near the main air resonance A0, two corpus modes and the bridge hill.
  // Values are approximate textbook figures for a violin.
  C.BODY = [{ f: 280, q: 7, g: 9 }, { f: 470, q: 6, g: 6 }, { f: 550, q: 6, g: 7 }, { f: 2700, q: 1.3, g: 6 }];
  C.bodyChain = function (a) {
    var first = null, last = null;
    C.BODY.forEach(function (p) {
      var b = a.createBiquadFilter(); b.type = "peaking"; b.frequency.value = p.f; b.Q.value = p.q; b.gain.value = p.g;
      if (last) last.connect(b); else first = b; last = b;
    });
    return { input: first, output: last };
  };
  // magnitude of the same peaking filters (RBJ cookbook), for drawing
  C.bodyGain = function (f, SR) {
    SR = SR || 44100; var g = 1;
    C.BODY.forEach(function (p) {
      var A = Math.pow(10, p.g / 40), w0 = 2 * Math.PI * p.f / SR, al = Math.sin(w0) / (2 * p.q), cw = Math.cos(w0);
      var b0 = 1 + al * A, b1 = -2 * cw, b2 = 1 - al * A, a0 = 1 + al / A, a1 = -2 * cw, a2 = 1 - al / A;
      var w = 2 * Math.PI * f / SR, c1 = Math.cos(w), s1 = Math.sin(w), c2 = Math.cos(2 * w), s2 = Math.sin(2 * w);
      var nr = b0 + b1 * c1 + b2 * c2, ni = -(b1 * s1 + b2 * s2), dr = a0 + a1 * c1 + a2 * c2, di = -(a1 * s1 + a2 * s2);
      g *= Math.sqrt((nr * nr + ni * ni) / (dr * dr + di * di));
    });
    return g;
  };
  // Clarinet: cylindrical air column, closed at the reed (p_x = 0) and open at the far end (p = 0).
  // The reed keeps the oscillation periodic, so partials sit on n f1; the odd ones dominate in the low register.
  M.clarinet = {
    F0: 146.83,
    partials: function (opt) {
      opt = opt || {}; var out = [];
      for (var n = 1; n <= 30; n++) {
        var amp = opt.flute ? 1 / (n * n) : (n % 2 ? 1 / n : 0.05 / n);
        out.push({ ratio: n, amp: amp, tau: 10 });
      }
      return out;
    }
  };
  // Harmonica: a brass free reed, clamped at one end over a slot. Same operator and boundary conditions as the kalimba tine.
  // Blown, the reed swings through its slot and chops the airflow into one puff per cycle; a periodic puff train has exact harmonics.
  var PUFF = (function () {
    var N = 512, x = [], out = [];
    for (var i = 0; i < N; i++) { var th = 2 * Math.PI * i / N; x.push(Math.max(0, Math.sin(th) - 0.6)); }
    for (var n = 1; n <= 30; n++) { var a = 0, b = 0; for (var i = 0; i < N; i++) { a += x[i] * Math.cos(2 * Math.PI * n * i / N); b += x[i] * Math.sin(2 * Math.PI * n * i / N); } out.push(Math.hypot(a, b) * 2 / N); }
    var m = out[0]; return out.map(function (v) { return v / m; });
  })();
  M.harmonica = {
    F0: 523.25,
    partials: function (opt) {
      opt = opt || {};
      if (opt.plucked) return KM.map(function (m, i) { return { ratio: m.ratio, amp: m.amp, tau: [1.2, 0.08, 0.025, 0.01, 0.006][i] }; });
      return PUFF.map(function (a, i) { return { ratio: i + 1, amp: a * Math.exp(-Math.pow((i + 1) / 16, 2)), tau: 10 }; });
    }
  };
  // Rayleigh quotient for the first reed mode with a filed-down thickness profile h(x) = 1 - depth * bump(x - x0).
  // omega^2 is proportional to (integral of E I phi''^2) / (integral of rho A phi^2), with I ~ h^3 and A ~ h.
  C.reedRatio = function (x0, depth, width) {
    var b = C.KB[0], sig = (Math.cosh(b) + Math.cos(b)) / (Math.sinh(b) + Math.sin(b)), N = 400;
    var n0 = 0, d0 = 0, n1 = 0, d1 = 0;
    for (var j = 0; j <= N; j++) {
      var xi = j / N, x = b * xi, w = (j === 0 || j === N) ? 1 : (j % 2 ? 4 : 2);
      var phi = Math.cosh(x) - Math.cos(x) - sig * (Math.sinh(x) - Math.sin(x));
      var phi2 = Math.cosh(x) + Math.cos(x) - sig * (Math.sinh(x) + Math.sin(x));
      var h = 1 - depth * Math.exp(-Math.pow((xi - x0) / (width || 0.08), 2));
      n0 += w * phi2 * phi2; d0 += w * phi * phi; n1 += w * h * h * h * phi2 * phi2; d1 += w * h * phi * phi;
    }
    return Math.sqrt((n1 / n0) / (d1 / d0));
  };
  C.wave = function (a, parts) {
    var N = parts.length, re = new Float32Array(N + 1), im = new Float32Array(N + 1);
    parts.forEach(function (p, i) { im[i + 1] = p.amp; });
    return a.createPeriodicWave(re, im);
  };

  // Kalimba: clamped-free Euler-Bernoulli tine, plucked at the tip, heard through the shear force at the clamp.
  var KB = [];
  for (var k = 1; k <= 5; k++) {
    var c = (k - 0.5) * Math.PI;
    KB.push(C.bisect(function (x) { return Math.cos(x) + 1 / Math.cosh(x); }, k === 1 ? 1.0 : c - 0.8, k === 1 ? 2.5 : c + 0.8));
  }
  C.tineShape = function (b) {
    var sig = (Math.cosh(b) + Math.cos(b)) / (Math.sinh(b) + Math.sin(b));
    return { sig: sig, f: function (xi) { var x = b * xi; return Math.cosh(x) - Math.cos(x) - sig * (Math.sinh(x) - Math.sin(x)); } };
  };
  var KM = KB.map(function (b, i) {
    var sh = C.tineShape(b), N = 400, num = 0, den = 0;
    for (var j = 0; j <= N; j++) {
      var xi = j / N, w = (j === 0 || j === N) ? 1 : (j % 2 ? 4 : 2), p = sh.f(xi), u0 = xi * xi * (3 - xi) / 2;
      num += w * u0 * p; den += w * p * p;
    }
    return { beta: b, ratio: Math.pow(b / KB[0], 2), amp: (num / den) * sh.sig * Math.pow(b, 3), shape: sh.f };
  });
  var k0 = KM[0].amp; KM.forEach(function (m) { m.amp /= k0; });
  C.KB = KB; C.KM = KM;
  M.kalimba = {
    F0: 440,
    partials: function (opt) {
      opt = opt || {}; var f1 = opt.f1 || 440, tau1 = 2.4 * Math.sqrt(262 / f1), base = [1, 0.07, 0.02, 0.008, 0.005];
      return KM.map(function (m, i) { return { ratio: m.ratio, amp: m.amp, tau: opt.longOvertones ? tau1 : tau1 * base[i] }; });
    }
  };
  // Piano: stiff string with pinned ends; hammer at 1/8 of the length; fundamental kept at the nominal pitch.
  M.piano = {
    F0: 261.63,
    B: function (key, mult) { return 0.00044 * (mult == null ? 1 : mult) * Math.pow(2, (key - 60) / 12); },
    partials: function (opt) {
      opt = opt || {}; var B = opt.B == null ? 0.00044 : opt.B, f1 = opt.f1 || 261.63, out = [];
      var tau1 = 3 * Math.pow(262 / f1, 0.6), roll = opt.rolloff || 14;
      for (var n = 1; n <= 60; n++) {
        var r = n * Math.sqrt((1 + B * n * n) / (1 + B));
        if (r * f1 > 16000) break;
        out.push({ ratio: r, amp: Math.sin(n * Math.PI / 8) * Math.exp(-Math.pow(n / roll, 2)) * Math.exp(-Math.pow(r * f1 / 7000, 2)), tau: tau1 / (1 + 0.03 * n * n) });
      }
      return out;
    }
  };
  // Drum: clamped circular membrane; struck at a point, heard at a fixed point on the head.
  var DR = [];
  for (var m = 0; m <= 18; m++) {
    C.besselZeros(m, 30).forEach(function (j, n) { var jp = C.J(m + 1, j); DR.push({ m: m, n: n + 1, j: j, norm: (m === 0 ? 2 : 1) * Math.PI * 0.5 * jp * jp }); });
  }
  DR.sort(function (a, b) { return a.j - b.j; });
  DR.forEach(function (d) { d.ratio = d.j / DR[0].j; });
  DR = DR.filter(function (d) { return d.ratio <= 12; });
  C.DR = DR;
  C.LISTEN = { r: 0.55, th: 0.8 };
  C.Xd = function (d, r, th) { return C.J(d.m, d.j * r) * Math.cos(d.m * th); };
  M.drum = {
    F0: 140,
    partials: function (opt) {
      opt = opt || {}; var r0 = opt.r == null ? 0.35 : opt.r, th0 = opt.th || 0;
      // the cos and sin partners of each m >= 1 together give J_m(j r0) J_m(j rL) cos(m (thL - th0)) / norm
      return DR.map(function (d) {
        var a = C.J(d.m, d.j * r0) * C.J(d.m, d.j * C.LISTEN.r) * Math.cos(d.m * (C.LISTEN.th - th0)) / d.norm;
        return { ratio: d.ratio, amp: a, tau: 1.4 / (1 + 0.12 * d.ratio * d.ratio), mode: d };
      });
    }
  };
  C.toHz = function (parts, f1) { return parts.map(function (p) { return { f: p.ratio * f1, amp: p.amp, tau: p.tau }; }); };
})();
