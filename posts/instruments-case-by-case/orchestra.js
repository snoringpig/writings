// A minimal orchestra: one instrument for each of the five Hornbostel–Sachs classes, every voice
// computed from the spectra in core.js (no recordings). Plays Grieg's "In the Hall of the Mountain King" (1875).
(function () {
  "use strict";
  var C = window.Core, M = C.models, O = window.Orchestra = {};

  // ---------- the five classes (Benson, Music: A Mathematical Offering, ch. 3, after Hornbostel and Sachs) ----------
  // Order: the blog's. The electrophone's operator is a single number, like a mass on a spring, so it goes first.
  O.FAM = [
    { id: "electro", name: "Electrophone", inst: "Sine theremin", plain: "an electric circuit", law: "Kirchhoff’s law on", piece: "a coil and a capacitor",
      op: "A = \\frac{1}{LC}", held: "a single number, like a mass on a spring",
      spec: "f = \\frac{1}{2\\pi \\sqrt{LC}}", specNote: "",
      verdict: "One stem: a pure tone. A real theremin mixes two such circuits, the hand changing C, and its circuitry adds a few overtones.",
      hue: [120, 230, 170], pan: 0.25, page: "oscillator", where: "The circuit and the spring: post 2" },
    { id: "chord", name: "Chordophone", inst: "Piano", plain: "a stiff string", law: "Newton’s law on", piece: "a short piece of stiff steel wire",
      op: "A = -c^2 \\frac{d^2}{dx^2} + \\kappa^2 \\frac{d^4}{dx^4}", held: "ends pinned",
      spec: "f_n = n f_0 \\sqrt{1 + B n^2}", specNote: "",
      verdict: "Just above the lines, more so as n grows: a note, slightly stretched.", hue: [233, 196, 106], pan: -0.2, page: "piano", where: "Derived in post 2; the piano: post 4" },
    { id: "aero", name: "Aerophone", inst: "Clarinet", plain: "a column of air", law: "Newton’s law on", piece: "a thin slice of the air in the tube",
      op: "A = -c^2 \\frac{d^2}{dx^2}", held: "on pressure; closed at the reed, open at the far end",
      spec: "f_n = (2n - 1) \\frac{c}{4L}", specNote: "",
      verdict: "On the odd lines; the even ones are weak: a hollow note.", hue: [120, 200, 255], pan: -0.45, page: "clarinet", where: "Derived in post 2; the clarinet: post 4" },
    { id: "idio", name: "Idiophone", inst: "Glockenspiel", plain: "a steel bar", law: "Newton’s law on", piece: "a thin slice of a steel bar",
      op: "A = \\kappa^2 \\frac{d^4}{dx^4}", held: "both ends free",
      spec: "\\cos \\beta L \\; \\cosh \\beta L = 1", specNote: "ratios 1 : 2.76 : 5.40",
      verdict: "Off the lines, but the overtones die fast: a bright, clean note.", hue: [190, 160, 255], pan: 0.45, page: "epilogue", where: "The bar: post 2; both ends free: the scales post" },
    { id: "membrane", name: "Membranophones", inst: "Bass drum and timpani", plain: "a stretched skin", law: "Newton’s law on", piece: "a small patch of the drumhead",
      op: "A = -c^2 \\Delta", held: "rim held still",
      spec: "J_m(ka) = 0", specNote: "ratios 1 : 1.59 : 2.14 : 2.30 …",
      verdict: "Bass drum: struck slightly off centre, mostly round modes, off the lines and fading fast: a boom with no clear pitch. Timpani: the same skin, but the air it drags along pulls its spoke modes near 2 : 3 : 4 : 5: a note.",
      hue: [255, 134, 102], pan: 0, page: "drum", where: "Derived in post 2; the two drums: post 4" }
  ];
  O.famIndex = {}; O.FAM.forEach(function (f, i) { O.famIndex[f.id] = i; });
  // the lanes of the performance view: one per instrument, so the two drums show their different spectra
  O.LANES = [
    { fam: "electro", v: "theremin" }, { fam: "chord", v: "piano" }, { fam: "aero", v: "clarinet" }, { fam: "idio", v: "glock" },
    { fam: "membrane", v: "bassdrum", inst: "Bass drum", plain: "a stretched skin · computed spectrum" },
    { fam: "membrane", v: "timpani", inst: "Timpani", plain: "skin over a kettle · measured spectrum" }
  ];

  // ---------- spectra for each voice: [{ratio, amp, tau}] relative to a base frequency ----------
  // free–free bar (glockenspiel): roots of cos x cosh x = 1
  var FB = [4.7300408, 7.8532046, 10.9956078].map(function (b) { return b * b / (4.7300408 * 4.7300408); });
  // scale a list of partials so the strongest has amplitude 1 (the drum model's raw amplitudes are small)
  function norm(ps) { var m = 0; ps.forEach(function (p) { m = Math.max(m, Math.abs(p.amp)); }); return ps.map(function (p) { return { ratio: p.ratio, amp: p.amp / m, tau: p.tau }; }); }
  O.voices = {
    piano: { fam: "chord", parts: function (k) { var f = C.mtof(k); return { base: f, parts: M.piano.partials({ B: M.piano.B(k, 1), f1: f }) }; }, ring: true, rel: 0.07 },
    // the blog's clarinet spectrum, with the gentle treble roll-off above the tone holes' cutoff (about 1.5 kHz)
    clarinet: { fam: "aero", parts: function (k) { var f = C.mtof(k); return { base: f, parts: M.clarinet.partials().slice(0, 20).map(function (p) { return { ratio: p.ratio, amp: p.amp / (1 + Math.pow(p.ratio * f / 1500, 2)), tau: p.tau }; }) }; }, ring: false, att: 0.025, rel: 0.05 },
    // timpani: the note is heard at the (1,1) mode, the "2" of the near-harmonic series 2 : 3 : 4 : 5 (drum page);
    // the ruler's base is the missing frequency an octave below. The stick's thud: ideal-membrane modes that die at once.
    timpani: { fam: "membrane", parts: function (k) {
      var f = C.mtof(k), base = f / 2, ps = [2, 3, 4, 5].map(function (r, i) { return { ratio: r, amp: [1, 0.6, 0.35, 0.2][i], tau: [1.9, 1.3, 0.9, 0.6][i] }; });
      norm(M.drum.partials({ r: 0.6 }).slice(0, 12)).forEach(function (p) { ps.push({ ratio: 1.2 * p.ratio, amp: 0.3 * p.amp, tau: 0.05, thud: true }); });
      return { base: base, parts: ps }; }, ring: true, rel: 0.9 },
    // the bass drum is struck slightly off centre (Graham, The Instrumentalist, 2017), so its lowest modes are mostly round ones (no line through the centre)
    bassdrum: { fam: "membrane", parts: function () {
      return { base: 52, parts: norm(M.drum.partials({ r: 0.15 })).map(function (p) { return { ratio: p.ratio, amp: p.amp, tau: 0.45 * p.tau }; }) }; }, ring: true, rel: 0.3 },
    glock: { fam: "idio", parts: function (k) { return { base: C.mtof(k), parts: FB.map(function (r, i) { return { ratio: r, amp: [1, 0.12, 0.3][i], tau: [1.3, 0.3, 0.12][i] }; }) }; }, ring: true, rel: 1.2 },
    theremin: { fam: "electro", parts: function (k) { return { base: C.mtof(k), parts: [{ ratio: 1, amp: 1, tau: 1e9 }] }; }, ring: false, att: 0.03, rel: 0.07 }
  };

  // ---------- the score ----------
  var NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function midi(s) { var m = /^([A-G])(#|b)?(-?\d)$/.exec(s), k = NOTE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0); return 12 * (+m[3] + 1) + k; }
  // Grieg's theme (melody checked against the flutetunes.com transcription): A in B minor, B on F-sharp major.
  var A = [[0, "B3", .5], [.5, "C#4", .5], [1, "D4", .5], [1.5, "E4", .5], [2, "F#4", .5], [2.5, "D4", .5], [3, "F#4", 1],
    [4, "E#4", .5], [4.5, "C#4", .5], [5, "E#4", 1], [6, "E4", .5], [6.5, "C4", .5], [7, "E4", 1],
    [8, "B3", .5], [8.5, "C#4", .5], [9, "D4", .5], [9.5, "E4", .5], [10, "F#4", .5], [10.5, "D4", .5], [11, "F#4", .5], [11.5, "B4", .5],
    [12, "A4", .5], [12.5, "F#4", .5], [13, "D4", .5], [13.5, "F#4", .5], [14, "A4", 2]];
  var B = [[0, "F#4", .5], [.5, "G#4", .5], [1, "A#4", .5], [1.5, "B4", .5], [2, "C#5", .5], [2.5, "A#4", .5], [3, "C#5", 1],
    [4, "D5", .5], [4.5, "A#4", .5], [5, "D5", 1], [6, "C#5", .5], [6.5, "A#4", .5], [7, "C#5", 1],
    [8, "F#4", .5], [8.5, "G#4", .5], [9, "A#4", .5], [9.5, "B4", .5], [10, "C#5", .5], [10.5, "A#4", .5], [11, "C#5", 1],
    [12, "D5", .5], [12.5, "A#4", .5], [13, "D5", 1], [14, "C#5", 2]];
  A.forEach(function (n) { n[1] = midi(n[1]); }); B.forEach(function (n) { n[1] = midi(n[1]); });
  function art(len) { return len <= 0.5 ? 0.55 : len <= 1 ? 0.7 : 0.9; } // marcato: short notes detached

  // The arrangement: each family enters in turn, the music speeds up and grows louder, as Grieg's does.
  // phrase: [melody, dynamics, which voices]
  var PLAN = [
    ["A", 0.40, { clar: 1, bass: 1 }],
    ["A", 0.48, { clar: 1, bass: 1, ther: 1 }],
    ["B", 0.56, { clar: 1, bass: 1, ther: 1, glock: 1 }],
    ["B", 0.64, { clar: 1, bass: 1, ther: 1, glock: 1, timp: 1 }],
    ["A", 0.74, { clar: 1, bass: 2, ther: 1, glock: 1, timp: 2, bd: 1, rh: 1 }],
    ["A", 0.82, { clar: 1, bass: 2, ther: 1, glock: 1, timp: 2, bd: 1, rh: 1 }],
    ["B", 0.90, { clar: 1, bass: 2, ther: 1, glock: 1, timp: 2, bd: 2, rh: 1 }],
    ["B", 0.96, { clar: 1, bass: 2, ther: 1, glock: 1, timp: 3, bd: 2, rh: 1 }],
    ["A", 1.00, { clar: 1, bass: 2, ther: 1, glock: 1, timp: 3, bd: 2, rh: 1 }]
  ];
  O.T0 = 104; O.T1 = 232; O.ACCEL_BEATS = PLAN.length * 16;
  function beatToSec(b) {
    var Bt = O.ACCEL_BEATS, r = O.T1 / O.T0, tAcc = 60 / O.T0 * Bt / Math.log(r) * (1 - 1 / r);
    if (b <= Bt) return 60 / O.T0 * Bt / Math.log(r) * (1 - Math.pow(r, -b / Bt));
    return tAcc + (b - Bt) * 60 / O.T1;
  }
  O.beatToSec = beatToSec;

  function push(out, v, k, b, len, vel, sounding) {
    var t = beatToSec(b), t2 = beatToSec(b + len * (sounding == null ? art(len) : sounding));
    out.push({ v: v, fam: O.voices[v].fam, k: k, t: t, d: Math.max(0.03, t2 - t), vel: vel, beat: b });
  }
  O.performance = function () {
    var out = [];
    PLAN.forEach(function (ph, pi) {
      var b0 = pi * 16, mel = ph[0] === "A" ? A : B, dyn = ph[1], on = ph[2], tonic = ph[0] === "A" ? midi("B2") : midi("F#2");
      mel.forEach(function (n) {
        var b = b0 + n[0];
        if (on.clar) push(out, "clarinet", n[1], b, n[2], 0.75 * dyn);
        if (on.ther) push(out, "theremin", n[1] + 12, b, n[2], 0.55 * dyn);
        if (on.glock && n[0] % 1 === 0) push(out, "glock", n[1] + 24, b, n[2], 0.42 * dyn);
        if (on.rh) push(out, "piano", n[1] + 12, b, n[2], 0.42 * dyn);
      });
      for (var q = 0; q < 16; q++) {
        var b = b0 + q;
        if (on.bass) { push(out, "piano", tonic, b, 1, 0.7 * dyn, 0.4); if (on.bass > 1) push(out, "piano", tonic - 12, b, 1, 0.55 * dyn, 0.4); }
        if (on.timp && (on.timp >= 3 || q % 2 === 0)) {
          var tk = ph[0] === "A" ? (on.timp >= 2 && q % 4 === 2 ? midi("F#2") : midi("B2")) : midi("F#2");
          push(out, "timpani", tk, b, 1, 0.8 * dyn, 0.9);
        }
        if (on.bd && (on.bd >= 2 || q % 2 === 0)) push(out, "bassdrum", 0, b, 1, 0.9 * dyn, 0.9);
      }
    });
    // coda: two tutti hits, a timpani roll, and the final chord
    var bc = PLAN.length * 16, chord = ["B1", "B2", "F#3", "B3", "D4", "F#4", "B4"].map(midi);
    function tutti(b, len, vel) {
      chord.forEach(function (k) { push(out, "piano", k, b, len, 0.5 * vel, 0.95); });
      push(out, "clarinet", midi("B3"), b, len, 0.8 * vel, 0.95); push(out, "theremin", midi("B4"), b, len, 0.6 * vel, 0.95);
      push(out, "glock", midi("B5"), b, len, 0.45 * vel); push(out, "timpani", midi("B2"), b, len, 0.95 * vel); push(out, "bassdrum", 0, b, len, 1.0 * vel);
    }
    tutti(bc, 0.5, 1); tutti(bc + 1, 0.5, 1);
    for (var i = 0; i < 8; i++) push(out, "timpani", midi("B2"), bc + 2 + i * 0.25, 0.25, 0.5 + 0.06 * i, 0.9);
    tutti(bc + 4, 3, 1.1);
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  };

  // A short solo for each family, used after the performance to explain it: the first two bars of the theme.
  O.solo = function (fam, t0) {
    var out = [], spb = 60 / 120;
    function p(v, k, b, len, vel, s) { var d = len * spb * (s == null ? art(len) : s); out.push({ v: v, fam: O.voices[v].fam, k: k, t: t0 + b * spb, d: d, vel: vel }); }
    var bars = A.filter(function (n) { return n[0] < 8; });
    if (fam === "membrane") {
      // the bass drum alone, then the timpani alone, ending on a timpani note left to ring
      [0, 1, 2, 3].forEach(function (b) { p("bassdrum", 0, b, 1, O.VMAX.bassdrum, 0.9); });
      [6, 7, 8, 9, 10, 11].forEach(function (b) { p("timpani", b % 4 === 0 ? midi("F#2") : midi("B2"), b, 1, O.VMAX.timpani, 0.9); });
      p("timpani", midi("B2"), 12.5, 8, O.VMAX.timpani, 1);
      [14.5, 15.5, 16.5].forEach(function (b) { p("bassdrum", 0, b, 1, O.VMAX.bassdrum, 0.9); }); // the two side by side
      return out;
    }
    var v = { chord: "piano", aero: "clarinet", idio: "glock", electro: "theremin" }[fam], sh = { piano: 12, clarinet: 0, glock: 24, theremin: 12 }[v];
    bars.forEach(function (n) { p(v, n[1] + sh, n[0], n[2], O.VMAX[v]); });
    p(v, midi("B3") + sh, 8.5, 6, O.VMAX[v], 1); // and the home note, held, so the picture can settle
    return out;
  };

  // ---------- sound ----------
  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  // additive synthesis, the same recurrence as Core.render, into a buffer of the given context
  function additive(ctx, parts, base, dur, sustain) {
    var SR = ctx.sampleRate, N = Math.max(1, Math.floor(dur * SR)), buf = ctx.createBuffer(1, N, SR), d = buf.getChannelData(0);
    parts.forEach(function (p) {
      var f = p.ratio * base;
      if (f > SR / 2.3 || f <= 0 || Math.abs(p.amp) < 1e-9) return;
      var w = 2 * Math.PI * f / SR, c = Math.cos(w), s = Math.sin(w), x = 1, y = 0, e = p.amp, dec = sustain ? 1 : Math.exp(-1 / (p.tau * SR));
      var n1 = sustain ? N : Math.min(N, Math.ceil(p.tau * SR * 9));
      for (var n = 0; n < n1; n++) { d[n] += e * y; var nx = x * c - y * s; y = x * s + y * c; x = nx; e *= dec; }
    });
    var pk = 0; for (var n = 0; n < N; n++) pk = Math.max(pk, Math.abs(d[n]));
    var g = pk > 0 ? 0.8 / pk : 1; for (var n = 0; n < N; n++) d[n] *= g;
    return buf;
  }
  function bufferFor(ctx, cache, v, k) {
    var id = v + ":" + k; if (cache[id]) return cache[id];
    var V = O.voices[v], sp = V.parts(k), dur;
    if (V.ring) { var tmax = 0; sp.parts.forEach(function (p) { tmax = Math.max(tmax, p.tau); }); dur = Math.min(4.5, 6 * tmax); }
    else dur = 2.6;
    return (cache[id] = additive(ctx, sp.parts, sp.base, dur, !V.ring));
  }
  function impulse(ctx, secs, decay) {
    var SR = ctx.sampleRate, N = Math.floor(secs * SR), b = ctx.createBuffer(2, N, SR), r = rng(7);
    for (var ch = 0; ch < 2; ch++) { var d = b.getChannelData(ch); for (var n = 0; n < N; n++) { var t = n / SR; d[n] = (r() * 2 - 1) * Math.exp(-t / decay) * Math.min(1, t / 0.008); } }
    return b;
  }
  // Compute every buffer the notes need (the slow part), before anything is scheduled.
  O.prepare = function (ctx, notes) { var cache = {}; notes.forEach(function (n) { if (n.v !== "theremin") bufferFor(ctx, cache, n.v, n.k); }); return cache; };
  // Schedule notes on any BaseAudioContext (live or offline), starting at context time t0. Returns the family gain nodes.
  O.schedule = function (ctx, notes, t0, opt) {
    opt = opt || {};
    var master = ctx.createGain(); master.gain.value = opt.master || 0.34;
    var comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.2;
    var verb = ctx.createConvolver(); verb.normalize = true; verb.buffer = impulse(ctx, 2.2, 0.26);
    var wet = ctx.createGain(); wet.gain.value = 0.25;
    master.connect(comp); comp.connect(ctx.destination); verb.connect(wet); wet.connect(comp);
    var fg = {}, cache = opt.cache || {};
    O.FAM.forEach(function (f) {
      var g = ctx.createGain(); g.gain.value = opt.mute && opt.mute[f.id] ? 0 : 1;
      var p = ctx.createStereoPanner(); p.pan.value = f.pan; g.connect(p); p.connect(master); p.connect(verb); fg[f.id] = g;
    });
    var LEVEL = { piano: 0.55, clarinet: 0.5, timpani: 1.0, bassdrum: 0.9, glock: 0.55, theremin: 0.38 };
    // theremin: one sine oscillator, gliding between notes with a gentle vibrato
    var th = notes.filter(function (n) { return n.v === "theremin"; });
    if (th.length) {
      var osc = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), gate = ctx.createGain();
      osc.type = "sine"; lfo.frequency.value = 5.6; lg.gain.value = 0; lfo.connect(lg); lg.connect(osc.frequency);
      gate.gain.value = 0; osc.connect(gate); gate.connect(fg.electro);
      osc.frequency.setValueAtTime(C.mtof(th[0].k), t0 + th[0].t);
      th.forEach(function (n, i) {
        var f = C.mtof(n.k), a = t0 + n.t, e = a + n.d, A = n.vel * LEVEL.theremin;
        if (i > 0) { osc.frequency.setValueAtTime(C.mtof(th[i - 1].k), Math.max(t0 + th[i - 1].t, a - 0.04)); osc.frequency.exponentialRampToValueAtTime(f, a + 0.01); }
        lg.gain.setValueAtTime(0.004 * f, a);
        gate.gain.setValueAtTime(0, a); gate.gain.linearRampToValueAtTime(A, a + O.voices.theremin.att);
        gate.gain.setValueAtTime(A, e); gate.gain.linearRampToValueAtTime(0, e + O.voices.theremin.rel);
      });
      var last = th[th.length - 1];
      osc.start(t0 + th[0].t - 0.05); lfo.start(t0 + th[0].t - 0.05); osc.stop(t0 + last.t + last.d + 0.5); lfo.stop(t0 + last.t + last.d + 0.5);
    }
    notes.forEach(function (n) {
      if (n.v === "theremin") return;
      var V = O.voices[n.v], buf = bufferFor(ctx, cache, n.v, n.k), src = ctx.createBufferSource(), g = ctx.createGain();
      var a = t0 + n.t, e = a + n.d, A = n.vel * LEVEL[n.v];
      src.buffer = buf; src.connect(g); g.connect(fg[V.fam]);
      if (V.ring) {
        g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(A, a + 0.0025); g.gain.setTargetAtTime(0, e, V.rel / 3); src.start(a); src.stop(Math.min(a + buf.duration, e + V.rel * 3));
      } else {
        g.gain.setValueAtTime(0, a); g.gain.linearRampToValueAtTime(A, a + V.att); g.gain.setValueAtTime(A, e); g.gain.linearRampToValueAtTime(0, e + V.rel);
        src.start(a); src.stop(e + V.rel + 0.02);
      }
    });
    return fg;
  };

  // ---------- timeline for the video: the performance, then one short explanation per family ----------
  O.timeline = function (withExplain, lead) {
    var tl = timeline0(withExplain); lead = lead || 0;
    if (lead) { tl.notes.forEach(function (n) { n.t += lead; }); tl.segs.forEach(function (q, i) { if (i) q.t0 += lead; q.t1 += lead; }); tl.dur += lead; }
    return tl;
  };
  function timeline0(withExplain) {
    var perf = O.performance(), endPerf = perf.reduce(function (m, n) { return Math.max(m, n.t + n.d); }, 0) + 2.2;
    var segs = [{ kind: "perf", t0: 0, t1: endPerf }], notes = perf.slice();
    if (withExplain) {
      var t = endPerf; segs.push({ kind: "intro", t0: t, t1: t + 17 }); t += 17;
      O.FAM.forEach(function (f) { var L = f.id === "membrane" ? 14 : 10.5, s = O.solo(f.id, t + 1.2); notes = notes.concat(s); segs.push({ kind: "fam", fam: f.id, t0: t, t1: t + L }); t += L; });
      segs.push({ kind: "outro", t0: t, t1: t + 8 }); t += 8;
      return { notes: notes, segs: segs, dur: t };
    }
    return { notes: notes, segs: segs, dur: endPerf };
  }

  // ---------- drawing ----------
  function rgba(c, a) { return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + a + ")"; }
  var BG = [13, 16, 22], INK = [236, 238, 242], MUT = [148, 156, 170], GRID = [46, 52, 64], LINK = [147, 168, 255];
  var RM = "'LM Roman', 'Latin Modern Roman', 'LM Math', 'DejaVu Serif', serif";
  var SANS = "'LM Sans', 'Latin Modern Sans', 'DejaVu Sans', sans-serif";
  var MATHF = "'LM Math', 'Latin Modern Math', 'DejaVu Serif', serif";
  O.FONTS = { rm: RM, sans: SANS, math: MATHF };

  // A tiny typesetter for the formulas: x^2, f_n, \frac{a}{b}, \sqrt{x}, \text{words}, Greek letters, \, \; spaces.
  var CP = function (c) { return String.fromCodePoint(c); };
  var GREEK = { kappa: CP(0x1D705), beta: CP(0x1D6FD), lambda: CP(0x1D706), pi: CP(0x1D70B), omega: CP(0x1D714), Delta: "Δ" };
  var FUNCS = { cos: 1, cosh: 1, sin: 1, sinh: 1 };
  function readGroup(s, i) {
    while (s[i] === " ") i++;
    if (s[i] === "{") { var depth = 1, j = i + 1; while (j < s.length && depth) { if (s[j] === "{") depth++; else if (s[j] === "}") depth--; j++; } return [s.slice(i + 1, j - 1), j]; }
    if (s[i] === "\\") { var m = /^\\([a-zA-Z]+)/.exec(s.slice(i)); if (m) return [m[0], i + m[0].length]; }
    return [s[i], i + 1];
  }
  function parseTeX(s) {
    var out = [], i = 0;
    function lastReal() { for (var k = out.length - 1; k >= 0; k--) if (out[k].t !== "sp") return out[k]; return null; }
    function op(ch) {
      var L = lastReal(), unary = !L || L.op;
      if (!unary) out.push({ t: "sp", w: 0.26 }); out.push({ t: "txt", s: ch, f: "rm", op: true }); if (!unary) out.push({ t: "sp", w: 0.26 });
    }
    while (i < s.length) {
      var c = s[i];
      if (c === " ") { i++; continue; }
      if (c === "^" || c === "_") {
        var r = readGroup(s, i + 1), sub = parseTeX(r[0]); i = r[1];
        var prev = out.pop() || { t: "txt", s: "", f: "rm" };
        if (prev.t !== "ss") prev = { t: "ss", base: prev };
        prev[c === "^" ? "sup" : "sub"] = sub; out.push(prev); continue;
      }
      if (c === "{") { var gr = readGroup(s, i); out.push({ t: "grp", c: parseTeX(gr[0]) }); i = gr[1]; continue; }
      if (c === "\\") {
        var m = /^\\([a-zA-Z]+|.)/.exec(s.slice(i)), cmd = m[1]; i += m[0].length;
        if (cmd === "frac") { var a = readGroup(s, i), b = readGroup(s, a[1]); i = b[1]; out.push({ t: "frac", num: parseTeX(a[0]), den: parseTeX(b[0]) }); }
        else if (cmd === "sqrt") { var q = readGroup(s, i); i = q[1]; out.push({ t: "sqrt", c: parseTeX(q[0]) }); }
        else if (cmd === "text") { var tx = readGroup(s, i); i = tx[1]; out.push({ t: "txt", s: tx[0], f: "rm" }); }
        else if (FUNCS[cmd]) { out.push({ t: "txt", s: cmd, f: "rm" }); out.push({ t: "sp", w: 0.17 }); }
        else if (GREEK[cmd]) out.push({ t: "txt", s: GREEK[cmd], f: cmd === "Delta" ? "rm" : "gr" });
        else if (cmd === ",") out.push({ t: "sp", w: 0.17 });
        else if (cmd === ";") out.push({ t: "sp", w: 0.5 });
        else if (cmd === "ldots") out.push({ t: "txt", s: "…", f: "rm" });
        continue;
      }
      if (/[a-zA-Z]/.test(c)) { out.push({ t: "txt", s: c, f: "it" }); i++; continue; }
      if (/[0-9.]/.test(c)) { var mm = /^[0-9.]+/.exec(s.slice(i))[0]; out.push({ t: "txt", s: mm, f: "rm" }); i += mm.length; continue; }
      if (c === "=" || c === ":") { op(c); i++; continue; }
      if (c === "+" || c === "-") { op(c === "-" ? "−" : "+"); i++; continue; }
      if (c === ",") { out.push({ t: "txt", s: ",", f: "rm" }); out.push({ t: "sp", w: 0.2 }); i++; continue; }
      out.push({ t: "txt", s: c, f: "rm" }); i++;
    }
    return out;
  }
  function fontFor(f, size) { return f === "it" ? "italic " + size + "px " + RM : f === "gr" ? size + "px " + MATHF : size + "px " + RM; }
  function hbox(g, nodes, size) {
    var items = nodes.map(function (n) { return layout(g, n, size); }), w = 0, a = 0, d = 0;
    items.forEach(function (b) { w += b.w; a = Math.max(a, b.a); d = Math.max(d, b.d); });
    return { w: w, a: a, d: d, draw: function (x, y) { items.forEach(function (b) { b.draw(x, y); x += b.w; }); } };
  }
  function layout(g, n, size) {
    if (n.t === "sp") return { w: n.w * size, a: 0, d: 0, draw: function () {} };
    if (n.t === "txt") {
      var ff = fontFor(n.f, size), s = n.s; g.font = ff;
      return { w: g.measureText(s).width + (n.f === "it" ? 0.04 * size : 0), a: 0.7 * size, d: 0.2 * size, draw: function (x, y) { g.font = ff; g.fillText(s, x, y); } };
    }
    if (n.t === "grp") return hbox(g, n.c, size);
    if (n.t === "ss") {
      var b = layout(g, n.base, size), up = n.sup ? hbox(g, n.sup, 0.68 * size) : null, dn = n.sub ? hbox(g, n.sub, 0.68 * size) : null;
      var ra = 0.4 * size, ld = 0.2 * size, w2 = Math.max(up ? up.w : 0, dn ? dn.w : 0);
      return { w: b.w + w2 + 0.05 * size, a: Math.max(b.a, up ? ra + up.a : 0), d: Math.max(b.d, dn ? ld + dn.d : 0),
        draw: function (x, y) { b.draw(x, y); if (up) up.draw(x + b.w, y - ra); if (dn) dn.draw(x + b.w - 0.02 * size, y + ld); } };
    }
    if (n.t === "frac") {
      var s2 = 0.8 * size, nu = hbox(g, n.num, s2), de = hbox(g, n.den, s2), w3 = Math.max(nu.w, de.w) + 0.2 * size, ax = 0.27 * size, gap = 0.16 * size, pad = 0.08 * size;
      return { w: w3 + 2 * pad, a: ax + gap + nu.d + nu.a, d: de.a + de.d + gap - ax,
        draw: function (x, y) {
          nu.draw(x + pad + (w3 - nu.w) / 2, y - ax - gap - nu.d); de.draw(x + pad + (w3 - de.w) / 2, y - ax + gap + de.a);
          g.fillRect(x + pad, y - ax - 0.025 * size, w3, Math.max(1.5, 0.05 * size));
        } };
    }
    if (n.t === "sqrt") {
      var bb = hbox(g, n.c, size), lw = Math.max(1.5, 0.05 * size), top = bb.a + 0.1 * size;
      return { w: bb.w + 0.62 * size, a: top + lw, d: bb.d,
        draw: function (x, y) {
          g.save(); g.lineWidth = lw; g.strokeStyle = g.fillStyle; g.lineJoin = "round"; g.lineCap = "round"; g.beginPath();
          g.moveTo(x + 0.06 * size, y - 0.26 * size); g.lineTo(x + 0.15 * size, y - 0.32 * size); g.lineTo(x + 0.31 * size, y + 0.9 * bb.d);
          g.lineTo(x + 0.5 * size, y - top); g.lineTo(x + 0.58 * size + bb.w, y - top); g.stroke(); g.restore();
          bb.draw(x + 0.54 * size, y);
        } };
    }
    return { w: 0, a: 0, d: 0, draw: function () {} };
  }
  var TEXC = {};
  // Draw a formula with its baseline at (x, y); returns its width.
  O.tex = function (g, s, x, y, size, col) {
    var nodes = TEXC[s] || (TEXC[s] = parseTeX(s)), b = hbox(g, nodes, size);
    g.fillStyle = col; g.textAlign = "left"; g.textBaseline = "alphabetic"; b.draw(x, y); return b.w;
  };

  function text(g, s, x, y, size, col, opt) {
    opt = opt || {}; g.font = (opt.italic ? "italic " : "") + (opt.weight || 400) + " " + size + "px " + (opt.font || RM);
    g.fillStyle = col; g.textAlign = opt.align || "left"; g.textBaseline = "alphabetic"; g.fillText(s, x, y); return g.measureText(s).width;
  }
  function wrap(g, s, x, y, maxw, lh, size, col, opt) {
    opt = opt || {}; g.font = (opt.italic ? "italic " : "") + (opt.weight || 400) + " " + size + "px " + (opt.font || RM);
    var words = s.split(" "), line = "", yy = y;
    words.forEach(function (wd) { var t2 = line ? line + " " + wd : wd; if (g.measureText(t2).width > maxw && line) { text(g, line, x, yy, size, col, opt); line = wd; yy += lh; } else line = t2; });
    if (line) text(g, line, x, yy, size, col, opt); return yy;
  }

  // the loudest sounding note of a family at time t, with each partial's current strength (1 = the voice at full volume)
  var VMAX = { piano: 0.7, clarinet: 0.75, theremin: 0.55, glock: 0.42, timpani: 0.8, bassdrum: 0.9 }, PC = {};
  O.VMAX = VMAX;
  function partsOf(v, k) { var id = v + ":" + k; if (!PC[id]) { var sp = O.voices[v].parts(k), m = 0; sp.parts.forEach(function (p) { m = Math.max(m, Math.abs(p.amp)); }); PC[id] = { base: sp.base, parts: sp.parts, m: m }; } return PC[id]; }
  function sounding(notes, fam, t, only) {
    var best = null, bestA = 0;
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i]; if (n.fam !== fam || (only && n.v !== only) || n.t > t || t > n.t + n.d + 4) continue;
      var V = O.voices[n.v], age = t - n.t, gate;
      var rel = Math.max(V.rel, 0.3); // the picture lets go a little more slowly than the sound, so fast notes pulse instead of flicker
      if (V.ring) gate = t < n.t + n.d ? 1 : Math.exp(-(t - n.t - n.d) / (rel / 3));
      else gate = Math.min(1, age / V.att) * (t < n.t + n.d ? 1 : Math.max(0, 1 - (t - n.t - n.d) / rel));
      if (gate < 0.01) continue;
      var sp = partsOf(n.v, n.k), lev = gate * Math.min(1, n.vel / VMAX[n.v]);
      var parts = sp.parts.map(function (p) { return { ratio: p.ratio, a: Math.abs(p.amp) / sp.m * (V.ring ? Math.exp(-age / p.tau) : 1) * lev, thud: p.thud }; });
      var tot = parts.reduce(function (m, p) { return Math.max(m, p.a); }, 0);
      if (tot > bestA) { bestA = tot; best = { n: n, base: sp.base, parts: parts, v: n.v }; }
    }
    return best;
  }
  O.sounding = sounding;

  // the spectrum diagram: gray lines at whole-number multiples of the base, one stem per mode
  function ruler(g, x, y, w, h, fam, snd, rmax, big) {
    var f = O.FAM[O.famIndex[fam]], base = y + h - (big ? 40 : 24), top = y + (big ? 44 : 26), lw = big ? 8 : 4.5;
    function X(r) { return x + w * r / (rmax + 0.4); }
    g.lineWidth = 1;
    for (var r = 1; r <= rmax; r++) {
      g.strokeStyle = rgba(GRID, 1); g.beginPath(); g.moveTo(X(r), top - 6); g.lineTo(X(r), base); g.stroke();
      text(g, r + "×", X(r), base + (big ? 30 : 18), big ? 22 : 14, rgba(MUT, 1), { font: SANS, align: "center" });
    }
    g.strokeStyle = rgba(MUT, 0.7); g.beginPath(); g.moveTo(x, base); g.lineTo(x + w, base); g.stroke();
    if (!snd) return;
    snd.parts.forEach(function (p) {
      if (p.ratio > rmax + 0.3) return;
      var hh = (base - top) * Math.min(1, p.a);
      if (hh < 1.5) return;
      g.strokeStyle = rgba(f.hue, p.thud ? 0.4 : 1); g.lineWidth = p.thud ? lw * 0.6 : lw; g.lineCap = "round";
      g.beginPath(); g.moveTo(X(p.ratio), base); g.lineTo(X(p.ratio), base - hh); g.stroke();
    });
    var hz = snd.v === "bassdrum" ? snd.base : C.mtof(snd.n.k), nm = spell(snd.n.k);
    var lab = (snd.v === "bassdrum" ? "bass drum, lowest mode" : snd.v === "timpani" ? "timpani " + nm : nm) + "  ·  " + Math.round(hz) + " Hz";
    text(g, lab, x + w, y + (big ? 26 : 16), big ? 24 : 16, rgba(f.hue, 1), { font: SANS, align: "right" });
  }
  // note names spelled as in the score: B minor, with E♯ and C, and F♯ major for the B section (G♯, A♯); no other accidentals occur
  var SPELL = ["C", "C♯", "D", "D♯", "E", "E♯", "F♯", "G", "G♯", "A", "A♯", "B"];
  function spell(k) { return SPELL[(k % 12 + 12) % 12] + (Math.floor(k / 12) - 1); }
  function roll(g, x, y, w, h, notes, t) {
    var span0 = 2.0, span1 = 5.0, lo = 30, hi = 100;
    function X(tt) { return x + w * (tt - (t - span0)) / (span0 + span1); }
    function Y(k) { return y + h - 6 - (h - 12) * (k - lo) / (hi - lo); }
    g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.strokeStyle = rgba(GRID, 0.6); g.lineWidth = 1;
    for (var k = 36; k <= 96; k += 12) { g.beginPath(); g.moveTo(x, Y(k)); g.lineTo(x + w, Y(k)); g.stroke(); }
    for (var i = 0; i < notes.length; i++) {
      var n = notes[i]; if (n.t > t + span1 || n.t + n.d < t - span0) continue;
      var k2 = n.v === "bassdrum" ? 31 : n.k, f = O.FAM[O.famIndex[n.fam]], on = t >= n.t && t <= n.t + n.d + 0.04;
      g.fillStyle = rgba(f.hue, on ? 1 : t > n.t ? 0.35 : 0.6);
      var x0 = X(n.t), x1 = Math.max(x0 + 4, X(n.t + n.d)); g.fillRect(x0, Y(k2) - 3, x1 - x0, 6);
    }
    g.restore();
    g.strokeStyle = rgba(INK, 0.75); g.lineWidth = 2; g.beginPath(); g.moveTo(X(t), y - 4); g.lineTo(X(t), y + h + 4); g.stroke();
  }
  // ---------- what vibrates: a small sketch of the vibrating part, moving with the modes that make the stems ----------
  // The motion is slowed down (one cycle of the base frequency takes 1/VIS seconds) and enlarged. Each mode keeps its true
  // frequency ratio, so when the stems sit on the lines the motion repeats, and when they don't it never does.
  var VIS = 0.9;
  function osc(p, t, base) { return p.a * Math.cos(2 * Math.PI * VIS * p.ratio * t); }
  var FBETA = [4.7300408, 7.8532046, 10.9956078];
  function barShape(b, xi) { var x = b * xi, sg = (Math.cos(b) - Math.cosh(b)) / (Math.sin(b) - Math.sinh(b)); return Math.cos(x) + Math.cosh(x) - sg * (Math.sin(x) + Math.sinh(x)); }
  var BARN = FBETA.map(function (b) { var m = 0; for (var i = 0; i <= 50; i++) m = Math.max(m, Math.abs(barShape(b, i / 50))); return m; });
  function sketch(g, v, snd, t, x, y, w, h, hue, big) {
    var parts = snd ? snd.parts.filter(function (p) { return !p.thud; }) : [], col = rgba(hue, big ? 0.95 : 0.8), dim = rgba(MUT, 0.6), lw = big ? 3 : 2;
    var amp = Math.min(1, parts.reduce(function (m, p) { return m + p.a; }, 0)), sc = 0.42 * h;
    g.save(); g.lineWidth = lw; g.lineCap = "round"; g.lineJoin = "round";
    var cy = y + h / 2, N = 64, i, xi;
    if (v === "piano") {           // a string between two pins: sine-shaped modes
      g.fillStyle = dim; g.fillRect(x - 3, cy - 10, 4, 20); g.fillRect(x + w - 1, cy - 10, 4, 20);
      g.strokeStyle = col; g.beginPath();
      for (i = 0; i <= N; i++) { xi = i / N; var u = 0; parts.forEach(function (p, k) { var n = k + 1; if (n < 13) u += osc(p, t) * Math.sin(n * Math.PI * xi) / n; }); g.lineTo(x + w * xi, cy - sc * 1.6 * u); }
      g.stroke();
    } else if (v === "clarinet") { // the air in a tube closed at the reed (left) and open at the far end: pressure shaded
      var th = h * 0.42;
      for (i = 0; i < N; i++) { xi = (i + 0.5) / N; var pr = 0; parts.forEach(function (p) { if (p.ratio % 2 === 1) pr += osc(p, t) * Math.cos(p.ratio * Math.PI * xi / 2); });
        g.fillStyle = rgba(hue, Math.max(0, Math.min(0.5, 0.12 + 0.3 * pr))); g.fillRect(x + w * i / N, cy - th / 2, w / N + 0.5, th); }
      var NS = big ? 34 : 22; g.strokeStyle = col; g.lineWidth = big ? 2 : 1.5;
      for (i = 0; i <= NS; i++) { xi = i / NS; var dx = 0; parts.forEach(function (p) { if (p.ratio % 2 === 1) dx += osc(p, t + 0.25 / (VIS * p.ratio)) * Math.sin(p.ratio * Math.PI * xi / 2) / p.ratio; });
        var xx = x + w * Math.max(0, Math.min(1, xi + 0.06 * dx)); g.beginPath(); g.moveTo(xx, cy - th / 2 + 3); g.lineTo(xx, cy + th / 2 - 3); g.stroke(); }
      g.strokeStyle = dim; g.lineWidth = 2; g.beginPath(); g.moveTo(x + w, cy - th / 2); g.lineTo(x, cy - th / 2); g.lineTo(x, cy + th / 2); g.lineTo(x + w, cy + th / 2); g.stroke();
      g.lineWidth = lw + 2; g.beginPath(); g.moveTo(x, cy - th / 2); g.lineTo(x, cy + th / 2); g.stroke();
    } else if (v === "glock") {    // a bar with free ends, resting at the two still points of its lowest mode
      [0.224, 0.776].forEach(function (s0) { g.fillStyle = dim; g.beginPath(); g.moveTo(x + w * s0, cy + 8); g.lineTo(x + w * s0 - 7, cy + 20); g.lineTo(x + w * s0 + 7, cy + 20); g.fill(); });
      g.strokeStyle = col; g.lineWidth = big ? 9 : 6; g.beginPath();
      for (i = 0; i <= N; i++) { xi = i / N; var ub = 0; parts.forEach(function (p, k) { if (k < 3) ub += osc(p, t) * barShape(FBETA[k], xi) / BARN[k]; }); g.lineTo(x + w * xi, cy - 0.8 * sc * ub); }
      g.stroke();
    } else if (v === "bassdrum" || v === "timpani") { // a round drumhead seen at a slant: rings lifted by the membrane's modes
      var rx = w * 0.42, ry = h * 0.2, mx = x + w / 2, my = cy + h * 0.08, modes = [];
      if (snd) {
        if (v === "timpani") parts.forEach(function (p, k) { if (k < 4) modes.push({ m: k + 1, j: C.DR.filter(function (d) { return d.m === k + 1 && d.n === 1; })[0].j, c: osc(p, t) }); });
        else parts.forEach(function (p, k) { if (k < 10) modes.push({ m: C.DR[k].m, j: C.DR[k].j, c: osc(p, t) }); });
      }
      if (v === "timpani") { g.strokeStyle = dim; g.lineWidth = 2; g.beginPath(); g.ellipse(mx, my, rx, ry, 0, 0, Math.PI); g.lineTo(mx - rx * 0.55, my + ry + h * 0.32); g.lineTo(mx + rx * 0.55, my + ry + h * 0.32); g.closePath(); g.stroke(); }
      g.strokeStyle = dim; g.lineWidth = 2; g.beginPath(); g.ellipse(mx, my, rx, ry, 0, 0, 2 * Math.PI); g.stroke();
      g.strokeStyle = col; g.lineWidth = big ? 2 : 1.5;
      [0.2, 0.4, 0.6, 0.8, 0.95].forEach(function (r) {
        g.beginPath();
        for (i = 0; i <= N; i++) { var a = 2 * Math.PI * i / N, uz = 0; modes.forEach(function (d) { uz += d.c * C.J(d.m, d.j * r) * Math.cos(d.m * a); });
          g.lineTo(mx + rx * r * Math.cos(a), my + ry * r * Math.sin(a) - 0.55 * sc * uz); }
        g.stroke();
      });
    } else if (v === "theremin") { // a coil and a capacitor: the charge sloshing between the plates
      var q = parts.length ? osc(parts[0], t) : 0, cw = w * 0.36, px = x + w * 0.62;
      g.strokeStyle = dim; g.lineWidth = 2; g.beginPath();
      for (i = 0; i <= 120; i++) { var ph = i / 120 * 6 * 2 * Math.PI; g.lineTo(x + w * 0.08 + (w * 0.36) * i / 120, cy + 0.22 * h * Math.sin(ph)); }
      g.stroke();
      g.beginPath(); g.moveTo(x, cy); g.lineTo(x + w * 0.08, cy); g.moveTo(x + w * 0.44, cy); g.lineTo(px - 6, cy); g.moveTo(px + 6, cy); g.lineTo(x + w, cy); g.stroke();
      [[-1, q], [1, -q]].forEach(function (pl) { g.fillStyle = rgba(hue, 0.15 + 0.8 * Math.max(0, pl[1])); g.fillRect(px + pl[0] * 6 - 3, cy - 0.38 * h, 6, 0.76 * h); });
      void cw;
    }
    g.restore();
  }
  function fade(t, t0, d) { return Math.max(0, Math.min(1, (t - t0) / (d || 0.5))); }

  // Draw the frame at time t (seconds on the timeline) into a 2D context whose canvas is W×H (16:9).
  O.drawAt = function (g, t, W, H, tl) {
    var s = W / 1920; g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.scale(s, s); W = 1920; H = 1080;
    g.fillStyle = rgba(BG, 1); g.fillRect(0, 0, W, H);
    var seg = tl.segs.filter(function (q) { return t >= q.t0 && t < q.t1; })[0] || tl.segs[tl.segs.length - 1];
    if (seg.kind === "perf") {
      text(g, "In the Hall of the Mountain King", 64, 78, 48, rgba(INK, 1), { weight: 700 });
      text(g, "Edvard Grieg, 1875  ·  one instrument from each of the five classes  ·  every sound built from pure tones", 64, 116, 24, rgba(MUT, 1), { italic: true });
      roll(g, 64, 142, W - 128, 140, tl.notes, t);
      text(g, "what vibrates, slowed down", 500, 312, 20, rgba(MUT, 1), { font: SANS });
      text(g, "stems: the frequencies in the sound, taller when louder   \u00b7   gray lines: whole-number multiples of a base", W - 64, 312, 20, rgba(MUT, 1), { font: SANS, align: "right" });
      var y0 = 322, lh = (H - y0 - 14) / O.LANES.length;
      O.LANES.forEach(function (L, i) {
        var f = O.FAM[O.famIndex[L.fam]], y = y0 + i * lh, muted = tl.mute && tl.mute[f.id];
        g.fillStyle = rgba(GRID, 0.9); g.fillRect(64, y, W - 128, 1);
        var nw = text(g, f.name, 64, y + 44, 30, rgba(f.hue, muted ? 0.4 : 1), { weight: 700 });
        text(g, L.inst || f.inst, 64 + nw + 16, y + 44, 22, rgba(INK, muted ? 0.4 : 0.9), { font: SANS });
        text(g, L.plain || f.plain, 64, y + 84, 22, rgba(MUT, 1), { italic: true });
        var snd = muted ? null : sounding(tl.notes, f.id, t, L.v);
        sketch(g, L.v, snd, t, 500, y + 12, 210, lh - 24, f.hue, false);
        ruler(g, 760, y + 2, W - 64 - 760, lh - 4, f.id, snd, 10, false);
        if (muted) text(g, "muted", W - 64, y + 20, 16, rgba(MUT, 1), { font: SANS, align: "right" });
      });
    } else if (seg.kind === "intro") {
      // what an operator is, before any family uses one
      var u = t - seg.t0, X0 = 140, XF = 220;
      text(g, "Where the stems come from", X0, 150, 64, rgba(INK, fade(u, 0)), { weight: 700 });
      wrap(g, "Musicologists sort instruments into five classes by what makes the sound (Hornbostel and Sachs, 1914; electrophones added later). One recipe turns each into its stems.", X0, 228, 1640, 44, 32, rgba(MUT, fade(u, 0.8)));
      var a1 = fade(u, 3.2), a2 = fade(u, 7.2), a3 = fade(u, 11.2);
      text(g, "1", X0, 396, 34, rgba(LINK, a1), { font: SANS, weight: 700 });
      text(g, "Newton’s law on a small piece of the instrument always takes this form:", XF, 396, 34, rgba(INK, a1));
      O.tex(g, "u_{tt} = -A u", XF + 40, 462, 44, rgba(INK, a1));
      text(g, "u is the instrument’s shape; A, the operator, turns a shape into minus the acceleration it causes.", XF + 330, 462, 28, rgba(MUT, a1), { italic: true });
      text(g, "2", X0, 570, 34, rgba(LINK, a2), { font: SANS, weight: 700 });
      text(g, "A shape that the operator only stretches swings at one frequency:", XF, 570, 34, rgba(INK, a2));
      var w1 = O.tex(g, "A X = \\lambda X", XF + 40, 650, 44, rgba(INK, a2));
      text(g, "swings at", XF + 40 + w1 + 40, 650, 30, rgba(MUT, a2), { italic: true });
      O.tex(g, "f = \\frac{\\sqrt{\\lambda}}{2\\pi}", XF + 40 + w1 + 190, 650, 44, rgba(INK, a2));
      text(g, "3", X0, 776, 34, rgba(LINK, a3), { font: SANS, weight: 700 });
      wrap(g, "Every motion is a sum of such shapes, so the list of the λ’s, the spectrum of the operator, decides where the stems stand.", XF, 776, 1540, 46, 34, rgba(INK, a3));
      O.FAM.forEach(function (f, i) { text(g, f.name, X0 + i * 336, 960, 32, rgba(f.hue, fade(u, 13.5 + 0.3 * i, 0.5)), { weight: 700 }); });
      text(g, "each has its own operator", X0, 1010, 26, rgba(MUT, fade(u, 15)), { italic: true });
    } else if (seg.kind === "fam") {
      var f = O.FAM[O.famIndex[seg.fam]], k = O.famIndex[seg.fam] + 1, t1 = t - seg.t0, a0 = fade(t1, 0, 0.6);
      text(g, k + " / 5", 140, 112, 24, rgba(MUT, a0), { font: SANS });
      text(g, f.name, 140, 192, 76, rgba(f.hue, a0), { weight: 700 });
      text(g, f.inst, 140, 246, 36, rgba(INK, a0), { italic: true });
      text(g, f.where, W - 140, 112, 24, rgba(LINK, a0), { font: SANS, align: "right" });
      var sv = { electro: ["theremin"], chord: ["piano"], aero: ["clarinet"], idio: ["glock"], membrane: ["bassdrum", "timpani"] }[f.id];
      sv.forEach(function (v, j) { var sw2 = sv.length > 1 ? 300 : 560, sx = W - 140 - sw2 * (sv.length - j) - 40 * (sv.length - 1 - j);
        sketch(g, v, sounding(tl.notes, f.id, t, v), t, sx, 135, sw2, 150, f.hue, true); });
      if (sv.length > 1) { text(g, "bass drum", W - 140 - 640 + 150, 324, 18, rgba(MUT, a0), { font: SANS, align: "center" }); text(g, "timpani", W - 140 - 150, 324, 18, rgba(MUT, a0), { font: SANS, align: "center" }); }
      text(g, "slowed down, motion enlarged", W - 140, sv.length > 1 ? 348 : 326, 18, rgba(MUT, a0), { font: SANS, align: "right" });
      // the blog's five stages, in order
      var LX = 140, VX = 560, al;
      function lab(n, s2, y, a) { text(g, n, LX, y, 24, rgba(f.hue, a), { font: SANS, weight: 700 }); text(g, s2, LX + 30, y, 24, rgba(MUT, a), { font: SANS }); }
      al = fade(t1, 0.8); lab("1", f.law, 330, al); text(g, f.piece, VX, 330, 36, rgba(INK, al));
      al = fade(t1, 2.0); lab("2", "Operator", 424, al);
      var ow = O.tex(g, f.op, VX, 424, 40, rgba(INK, al)); text(g, f.held, VX + ow + 28, 424, 28, rgba(MUT, al), { italic: true });
      al = fade(t1, 3.2); lab("3", "Spectrum", 520, al);
      var sw = O.tex(g, f.spec, VX, 520, 40, rgba(INK, al)); if (f.specNote) text(g, f.specNote, VX + sw + 28, 520, 28, rgba(MUT, al), { italic: true });
      lab("4", "On the spectrum diagram", 606, a0);
      if (f.id === "membrane") {
        text(g, "bass drum: computed from this operator", VX, 606, 24, rgba(MUT, a0), { italic: true });
        ruler(g, LX, 618, W - 2 * LX, 168, f.id, sounding(tl.notes, f.id, t, "bassdrum"), 10, false);
        text(g, "timpani: measured, not derived; the lines are multiples of a base an octave below its note", VX, 812, 24, rgba(MUT, a0), { italic: true });
        ruler(g, LX, 824, W - 2 * LX, 132, f.id, sounding(tl.notes, f.id, t, "timpani"), 10, false);
      } else ruler(g, LX, 618, W - 2 * LX, 300, f.id, sounding(tl.notes, f.id, t), 10, true);
      var yv = f.id === "membrane" ? 1000 : 982;
      al = fade(t1, 5.4); lab("5", "What you hear", yv, al);
      wrap(g, f.verdict, VX, yv, 1220, 36, f.id === "membrane" ? 26 : 30, rgba(INK, al));
    } else {
      var b1 = fade(t, seg.t0, 0.8), b2 = fade(t, seg.t0 + 1.5, 0.8);
      wrap(g, "Every sound in this video was computed from these spectra. No recordings, no samples.", 140, 330, 1640, 76, 58, rgba(INK, b1), { weight: 700 });
      text(g, "Each spectrum comes from its operator, except the timpani’s, which is measured.", 140, 500, 32, rgba(MUT, b1), { italic: true });
      text(g, "The Shape of a Sound: the mathematics of musical sound, one instrument at a time", 140, 600, 34, rgba(MUT, b2));
      text(g, "snoringpig.github.io/writings", 140, 660, 34, rgba(LINK, b2), { font: SANS });
      text(g, "Music: Edvard Grieg, In the Hall of the Mountain King (1875), public domain. Arrangement and synthesis made for this video.", 140, 900, 24, rgba(MUT, b2), { italic: true });
      text(g, "Classes: E. M. von Hornbostel and C. Sachs (1914); D. J. Benson, Music: A Mathematical Offering, chapter 3.", 140, 940, 24, rgba(MUT, b2), { italic: true });
    }
    g.restore();
  };

  // ---------- offline render to a 16-bit stereo WAV ----------
  O.renderWav = function (tl, SR, mute) {
    SR = SR || 48000;
    var ctx = new OfflineAudioContext(2, Math.ceil((tl.dur + 0.5) * SR), SR);
    O.schedule(ctx, tl.notes, 0.25, { mute: mute });
    return ctx.startRendering().then(function (buf) {
      var L = buf.getChannelData(0), R = buf.getChannelData(1), N = L.length, pk = 0;
      for (var i = 0; i < N; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
      var gain = pk > 0 ? 0.89 / pk : 1, out = new DataView(new ArrayBuffer(44 + N * 4));
      function str(o, s) { for (var i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); }
      str(0, "RIFF"); out.setUint32(4, 36 + N * 4, true); str(8, "WAVE"); str(12, "fmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 2, true);
      out.setUint32(24, SR, true); out.setUint32(28, SR * 4, true); out.setUint16(32, 4, true); out.setUint16(34, 16, true); str(36, "data"); out.setUint32(40, N * 4, true);
      for (var j = 0; j < N; j++) { out.setInt16(44 + 4 * j, Math.max(-32767, Math.min(32767, L[j] * gain * 32767)), true); out.setInt16(46 + 4 * j, Math.max(-32767, Math.min(32767, R[j] * gain * 32767)), true); }
      return { wav: new Blob([out.buffer], { type: "audio/wav" }), peak: pk, offset: 0.25 };
    });
  };
})();
