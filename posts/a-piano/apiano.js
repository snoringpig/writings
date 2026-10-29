/* A Piano: an 88-key upright with its front panels removed, wired to the stiff-string model in core.js.
   Units in the 3D model are centimetres: x runs bass to treble, y up from the floor, z toward the player.
   The sound and the two graphs work without WebGL; the 3D view is added when WebGL starts. */
(function () {
  "use strict";
  var C = window.Core, root = document.getElementById("apiano");
  if (!root || !C) return;
  var $ = function (id) { return document.getElementById(id); };
  var TOUCH = !!(window.matchMedia && window.matchMedia("(hover: none) and (pointer: coarse)").matches);

  // ===================================================================================================
  // 1. Layout of an upright (about a Yamaha U1: 152 cm wide, 122 cm tall, 61 cm deep)
  // ===================================================================================================
  var LOW = 21, N = 88, UNDAMPED = 89;                  // A0 is MIDI 21; F6 (MIDI 89) and above have no dampers
  var BLK = { 1: 1, 3: 1, 6: 1, 8: 1, 10: 1 };
  function isBlack(m) { return !!BLK[m % 12]; }
  function nm(m) { return C.noteName(C.mtof(m)).name; }
  function nStrings(i) { return i < 10 ? 1 : i < 25 ? 2 : 3; }   // 10 single strings, 15 pairs, 63 triples
  var W = 2.35;                                                   // white key width (octave 16.45 cm)
  // black keys sit in equal slots: 5 across C to E, 7 across F to B
  var OFF = [0.5, 0.9, 1.5, 2.1, 2.5, 3.5, 3.857, 4.5, 5.0, 5.5, 6.143, 6.5];
  function keyX(m) { return -61.1 + (7 * (Math.floor(m / 12) - 1) + OFF[m % 12] - 5) * W; }
  var HB = 0.685;                                                 // half-width of a black key at its base

  var YS = 100, YD = 93, Z_T = -47.5, Z_B = -45.8, BLOW = 4.2, Z_SH = -38.6, Y_PIV = 86.0, SHANK = YS - Y_PIV;
  var KEY_TOP = 73, KEY_PIVOT_Z = -24, KEY_PIVOT_Y = 70.8, DIP = 0.045;
  var GAPS = { 24: 4.0, 45: 2.6, 66: 2.6 };                      // wider spaces in the action at the plate's struts
  var BASS_ANG = 32 * Math.PI / 180;
  // speaking lengths: 119 cm for the lowest bass string (Yamaha U1), 5.2 cm for the top string
  function strLen(i) {
    if (i < 25) return 119 - 21 * i / 24;
    var Li = 5.2 * Math.pow(2, 0.894 * (87 - i) / 12);
    return Li / Math.pow(1 + Math.pow(Li / 95, 3), 1 / 3);
  }
  var KEYS = [];
  (function () {
    var extra = 0, k; for (k in GAPS) extra += GAPS[k];
    var pitch = (60.2 + 59.6 - extra) / 87, xa = -59.6;
    for (var i = 0; i < N; i++) {
      var m = LOW + i, bass = i < 25, ns = nStrings(i), L = strLen(i), ux, uy;
      if (bass) { ux = Math.sin(BASS_ANG); uy = -Math.cos(BASS_ANG); }
      else { var ph = (10 - 9.5 * (i - 25) / 62) * Math.PI / 180; ux = -Math.sin(ph); uy = -Math.cos(ph); }
      var d = L / 8, Tx = xa - ux * d, Ty = YS - uy * d;
      var K = {
        i: i, m: m, black: isBlack(m), kx: keyX(m), xa: xa, bass: bass, ns: ns, wound: bass, damped: m < UNDAMPED,
        L: L, ux: ux, uy: uy, px: -uy, py: ux, Tx: Tx, Ty: Ty, Bx: Tx + ux * L, By: Ty + uy * L, zs: bass ? Z_B : Z_T,
        held: false, hitT: -1e9, voice: null, vis: null, dip: 0, dlift: 0, ham: 0, moving: true, tube: null
      };
      K.offs = ns === 1 ? [0] : ns === 2 ? [-0.3, 0.3] : [-0.38, 0, 0.38];
      if (K.damped) {   // under-damper: a felt strip starting 3 cm below the strike point, 5 cm long (at most 0.35 of a short string)
        var fl = Math.min(5, 0.35 * L), sc = d + 3 + fl / 2;
        K.fl = fl; K.xd = sc / L; K.dw = fl / L; K.Cx = Tx + ux * sc; K.Cy = Ty + uy * sc;
      }
      K.zf = K.zs + BLOW;                                          // face of the hammer at rest
      K.hD = Z_SH + 0.9 - K.zf;                                     // depth of the hammer head
      K.hH = 4.0 - 1.4 * i / 87;                                    // height of the hammer head
      KEYS.push(K);
      xa += pitch + (GAPS[i] || 0);
    }
    KEYS.pitch = pitch;
  })();
  var DMP_G = 60;   // damping strength of the felt; each mode's rate is DMP_G times its weight under the felt (C.damperWeight)
  function dmpOf(K) { return { xd: K.xd, w: K.dw, G: DMP_G }; }

  // ===================================================================================================
  // 2. Sound, state and the visual mirror of the modes
  // ===================================================================================================
  var ped = { soft: false, mute: false, sus: false }, sel = 39, lastChange = 0;
  var note = $("apNote");
  function say(html) { note.innerHTML = html; }
  function level() { return 0.7 * (ped.soft ? 0.55 : 1) * (ped.mute ? 0.25 : 1); }
  var FV1 = 1.5;   // mode 1 is drawn at 1.5 cycles a second; higher modes faster, up to 10
  function visStart(K, v) {
    var amax = 0; v.parts.forEach(function (p) { amax = Math.max(amax, Math.abs(p.amp)); });
    var scale = (ped.soft ? 0.7 : 1) * (ped.mute ? 0.4 : 1), t = performance.now() / 1000, sum = 0;
    var modes = v.parts.slice(0, 16).map(function (p, n) {
      var a = p.amp / amax * scale; sum += Math.abs(a);
      return { a: a, a0: Math.abs(a), tau: p.tau, fv: Math.min(10, FV1 * (n + 1)) };
    });
    while (modes.length < 16) modes.push({ a: 0, a0: 0, tau: 1, fv: 1 });
    // scale the drawing by the largest displacement the undamped motion reaches over one slowed period of mode 1,
    // so a fresh strike fills about the full height of the graph whatever the note
    var peak = 1e-6;
    for (var it = 1; it <= 48; it++) {
      var tt = it / 48 / FV1;
      for (var q = 0; q <= 64; q += 2) {
        var u = 0; for (var n = 0; n < 16; n++) u += modes[n].a / (n + 1) * Math.sin(2 * Math.PI * modes[n].fv * tt) * Math.sin((n + 1) * Math.PI * q / 64);
        peak = Math.max(peak, Math.abs(u));
      }
    }
    K.vis = { t0: t, tS: t, modes: modes, norm: peak / 1.35 };
  }
  function visDamp(K) {
    if (!K.vis || !K.damped) return; var t = performance.now() / 1000, dm = dmpOf(K);
    K.vis.modes.forEach(function (md, n) { md.a = md.a * Math.exp(-(t - K.vis.t0) / md.tau); md.tau = 1 / (1 / md.tau + dm.G * C.damperWeight(n + 1, dm.xd, dm.w)); });
    K.vis.t0 = t;
  }
  function ampNow(K, n, t) { var md = K.vis.modes[n]; return md.a * Math.exp(-(t - K.vis.t0) / md.tau); }
  function energy(K, t) { if (!K.vis) return 0; var e = 0; for (var n = 0; n < 16; n++) e = Math.max(e, Math.abs(ampNow(K, n, t))); return e; }

  var listeners = [];
  function changed(i) { lastChange = performance.now(); listeners.forEach(function (f) { f(i); }); }
  function strike(i) {
    var K = KEYS[i]; if (!K) return;
    if (K.voice) C.pianoStop(K.voice, 0.008);
    K.voice = C.pianoStrike(K.m, 1, ped.soft, ped.mute, level()); visStart(K, K.voice);
    K.held = true; K.hitT = performance.now() / 1000; K.moving = true; sel = i;
    var nn = nm(K.m);
    say("<b>" + nn + " struck.</b> The hammer pushes the " + (K.ns === 1 ? "string" : K.ns + " strings") + " for a moment and flies back. That push sets how strongly each mode rings (the bars); it cannot add a frequency the wire does not already have." +
        (ped.soft ? " Soft pedal: the hammer starts closer, so it lands more gently." : "") + (ped.mute ? " Practice mute: the felt strip takes most of the blow." : "") +
        (K.damped ? "" : " This key has no damper."));
    changed(i);
  }
  function release(i) {
    var K = KEYS[i]; if (!K || !K.held) return; K.held = false; K.moving = true;
    if (ped.sus) say("<b>Key released, sustain down.</b> The damper stays off the strings, so the note rings on at its own frequencies.");
    else if (!K.damped) say("<b>Key released.</b> The top 20 keys have no dampers, so " + nm(K.m) + " rings on; its short strings die away quickly by themselves.");
    else {
      if (K.voice && !K.voice.released) K.voice = C.pianoDamp(K.voice, dmpOf(K));
      visDamp(K);
      say("<b>Key released.</b> The damper presses its felt on the strings. Each mode now dies at a rate set by how much it moves under the felt (the orange ticks); its frequency does not change.");
    }
    changed(i);
  }
  function cancelNote(i) {
    var K = KEYS[i]; if (!K) return;
    if (K.voice) C.pianoStop(K.voice, 0.01); K.voice = null; K.vis = null; K.held = false; K.moving = true; K.cancelled = performance.now();
    changed(i);
  }
  var pedBtn = { soft: $("apSoft"), mute: $("apMute"), sus: $("apSus") };
  function setPed(name, on) {
    if (ped[name] === on) return;
    ped[name] = on; pedBtn[name].setAttribute("aria-pressed", on ? "true" : "false");
    if (name === "sus") {
      if (on) say("<b>Sustain pedal down.</b> Its rod pushes the damper lift rail, which swings every damper off the strings at once, so notes ring after you let go. Nothing touches the wire's tension or stiffness, so each note keeps its frequencies.");
      else {
        KEYS.forEach(function (K) { if (!K.held && K.damped && K.voice && !K.voice.released) { K.voice = C.pianoDamp(K.voice, dmpOf(K)); visDamp(K); } });
        say("<b>Sustain pedal up.</b> The dampers fall back onto every string whose key is not held.");
      }
    } else if (name === "soft") {
      say(on ? "<b>Soft pedal down.</b> On an upright it pushes the hammer rail toward the strings, so every hammer starts its swing closer and lands more gently: quieter notes and weaker high modes, at the same frequencies."
             : "<b>Soft pedal up.</b> The hammer rail returns and the hammers get their full swing.");
    } else {
      say(on ? "<b>Practice mute down.</b> A strip of felt drops between the hammers and the strings. The blow that reaches the string is much softer and loses its sharp edge, so most high modes are never excited. The frequencies still do not move."
             : "<b>Practice mute up.</b> The felt strip lifts out of the way.");
    }
    KEYS.forEach(function (K) { K.moving = true; });
    changed(-1);
  }
  Object.keys(pedBtn).forEach(function (n) { pedBtn[n].addEventListener("click", function () { setPed(n, !ped[n]); }); });

  // ===================================================================================================
  // 3. The flat keyboard strip
  // ===================================================================================================
  var kbd = $("apKbd"), wrap = $("apKbdWrap"), kb = [], base = 60, WK = 20;
  var CODES = ["KeyA", "KeyW", "KeyS", "KeyE", "KeyD", "KeyF", "KeyT", "KeyG", "KeyY", "KeyH", "KeyU", "KeyJ", "KeyK", "KeyO", "KeyL", "KeyP", "Semicolon", "Quote"];
  var LETTER = ["A", "W", "S", "E", "D", "F", "T", "G", "Y", "H", "U", "J", "K", "O", "L", "P", ";", "'"];
  KEYS.forEach(function (K) {
    var b = document.createElement("button"); b.type = "button"; b.dataset.i = K.i; b.tabIndex = -1;
    b.className = K.black ? "b" : "w"; if (!K.damped) b.classList.add("nd");
    b.setAttribute("aria-label", nm(K.m)); kbd.appendChild(b); kb.push(b);
  });
  function layoutStrip() {
    var w = wrap.clientWidth || 600;
    WK = Math.max(TOUCH ? 26 : 15, Math.floor(w / 52 * 100) / 100);
    kbd.style.width = (WK * 52) + "px";
    var x = 0;
    KEYS.forEach(function (K, i) {
      var b = kb[i];
      if (K.black) { b.style.left = (x * WK - WK * 0.31) + "px"; b.style.width = (WK * 0.62) + "px"; }
      else { b.style.left = (x * WK) + "px"; b.style.width = (WK + 1) + "px"; x++; }
    });
    labelsStrip();
  }
  function labelsStrip() {
    KEYS.forEach(function (K, i) {
      var j = K.m - base, inWin = !TOUCH && j >= 0 && j < CODES.length, b = kb[i];
      b.classList.toggle("win", inWin);
      b.textContent = inWin ? LETTER[j] : (K.m % 12 === 0 && WK >= 18 ? nm(K.m) : "");
    });
    var lo = Math.max(LOW, base), hi = Math.min(108, base + CODES.length - 1);
    $("apWin").innerHTML = TOUCH ? "tap to play · swipe to scroll" : "computer keys play <b>" + nm(lo) + "–" + nm(hi) + "</b>";
  }
  function scrollStripTo(i, centre) {
    var b = kb[i]; if (!b) return; var l = parseFloat(b.style.left), vw = wrap.clientWidth;
    if (centre || l < wrap.scrollLeft + WK || l > wrap.scrollLeft + vw - 2 * WK) wrap.scrollLeft = Math.max(0, l - vw / 2);
  }
  function shift(dir) { base = Math.max(12, Math.min(96, base + 12 * dir)); labelsStrip(); scrollStripTo(Math.max(0, base + 6 - LOW), true); }
  $("apOctDown").addEventListener("click", function () { shift(-1); });
  $("apOctUp").addEventListener("click", function () { shift(1); });
  listeners.push(function (i) { KEYS.forEach(function (K, j) { kb[j].classList.toggle("on", K.held); }); });

  // pointer play on the strip; on touch the strike waits 60 ms so a swipe can scroll the strip without playing
  var stripDown = null;
  function keyAtPoint(x, y) { var el = document.elementFromPoint(x, y); return el && el.dataset && el.dataset.i != null && kbd.contains(el) ? +el.dataset.i : -1; }
  kbd.addEventListener("pointerdown", function (e) {
    var i = keyAtPoint(e.clientX, e.clientY); if (i < 0) return;
    if (e.pointerType === "touch") {
      var st = { id: e.pointerId, i: i, fired: false, x: e.clientX, y: e.clientY };
      st.timer = setTimeout(function () { st.fired = performance.now(); strike(st.i); }, 80); stripDown = st; return;
    }
    e.preventDefault(); stripDown = { id: e.pointerId, i: i, fired: true }; kbd.setPointerCapture(e.pointerId); strike(i);
  });
  kbd.addEventListener("pointermove", function (e) {
    var st = stripDown; if (!st || st.id !== e.pointerId) return;
    if (e.pointerType === "touch") { if (!st.fired && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 8) { clearTimeout(st.timer); stripDown = null; } return; }
    var i = keyAtPoint(e.clientX, e.clientY);
    if (i !== st.i) { release(st.i); if (i >= 0) strike(i); st.i = i; }
  });
  function stripUp(e) {
    var st = stripDown; if (!st || st.id !== e.pointerId) return; stripDown = null;
    if (!st.fired) { clearTimeout(st.timer); if (e.type === "pointerup") { strike(st.i); setTimeout(function () { release(st.i); }, 140); } return; }
    if (st.i >= 0) { if (e.type === "pointercancel" && st.fired !== true && performance.now() - st.fired < 400) cancelNote(st.i); else release(st.i); }
  }
  kbd.addEventListener("pointerup", stripUp); kbd.addEventListener("pointercancel", stripUp);
  kbd.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  // ===================================================================================================
  // 4. Computer keys, only while the piece is on screen
  // ===================================================================================================
  var inView = false, codeKey = {};
  new IntersectionObserver(function (es) { inView = es[0].isIntersecting; if (inView) kick(); }, { threshold: 0.2 }).observe(root);
  function mine(e) { return e.code === "Space" || e.code === "KeyZ" || e.code === "KeyX" || CODES.indexOf(e.code) >= 0; }
  function typing(e) { var t = e.target; return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable); }
  window.addEventListener("keydown", function (e) {
    if (!inView || e.metaKey || e.ctrlKey || e.altKey || typing(e) || !mine(e)) return;
    e.preventDefault(); e.stopPropagation(); if (e.repeat) return;
    if (e.code === "Space") { setPed("sus", true); return; }
    if (e.code === "KeyZ") { shift(-1); return; }
    if (e.code === "KeyX") { shift(1); return; }
    var m = base + CODES.indexOf(e.code); if (m < LOW || m > 108) return;
    codeKey[e.code] = m - LOW; strike(m - LOW); scrollStripTo(m - LOW, false);
  }, true);
  window.addEventListener("keyup", function (e) {
    if (!mine(e) || e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
    if (e.code === "Space") { if (ped.sus && inView) { e.preventDefault(); e.stopPropagation(); setPed("sus", false); } return; }
    var i = codeKey[e.code]; if (i != null) { e.preventDefault(); e.stopPropagation(); delete codeKey[e.code]; release(i); }
  }, true);
  window.addEventListener("blur", function () { Object.keys(codeKey).forEach(function (c) { release(codeKey[c]); delete codeKey[c]; }); });

  // ===================================================================================================
  // 5. The graph of u and the mode bars, for the last key played
  // ===================================================================================================
  var wv = $("apWave"), mv = $("apModes"), NQ2 = 160, SIN2 = [];
  for (var n0 = 1; n0 <= 16; n0++) { var row = []; for (var q0 = 0; q0 <= NQ2; q0++) row.push(Math.sin(n0 * Math.PI * q0 / NQ2)); SIN2.push(row); }
  var FAM = null;
  function uiFont(px, d) { if (!FAM) FAM = (getComputedStyle(root).getPropertyValue("--f-ui") || "").trim() || "sans-serif"; return "500 " + Math.round(px * d) + "px " + FAM; }
  function hammerLift(K, t) {
    var dt = t - K.hitT;
    return dt < 0.06 ? dt / 0.06 : dt < 0.3 ? 1 - (dt - 0.06) / 0.24 * 0.8 : (K.held ? 0.2 : Math.max(0, 0.2 - (dt - 0.3) * 2));
  }
  function shapeInto(K, t, sinTab, nq, out) {
    for (var q = 0; q <= nq; q++) out[q] = 0;
    if (!K.vis) return 0;
    var e = 0;
    for (var n = 0; n < 16; n++) {
      var md = K.vis.modes[n], a = md.a * Math.exp(-(t - K.vis.t0) / md.tau); e = Math.max(e, Math.abs(a));
      if (Math.abs(a) < 1e-4) continue;
      var c = a / (n + 1) * Math.sin(2 * Math.PI * md.fv * (t - K.vis.tS)) / K.vis.norm, s = sinTab[n];
      for (var q = 0; q <= nq; q++) out[q] += c * s[q];
    }
    return e;
  }
  var wbuf = new Float32Array(NQ2 + 1);
  function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath(); }
  function drawWave(t) {
    var K = KEYS[sel], d = C.fit(wv), Wd = wv.width, H = wv.height, g = wv.getContext("2d");
    g.clearRect(0, 0, Wd, H);
    var pl = 16 * d, pr = 16 * d, mid = 30 * d + (H - 30 * d - 60 * d) / 2, amp = Math.min(56 * d, (H - 90 * d) / 2), labY = H - 26 * d, endY = H - 6 * d;
    function X(s) { return pl + s * (Wd - pl - pr); }
    shapeInto(K, t, SIN2, NQ2, wbuf);
    var f = C.mtof(K.m);
    g.textBaseline = "top"; g.font = uiFont(13, d); g.fillStyle = C.rgb("--ink"); g.textAlign = "left";
    g.fillText(nm(K.m) + " · " + (f < 100 ? f.toFixed(1) : f.toFixed(0)) + " Hz · " + K.ns + (K.ns > 1 ? " strings" : " string") + (K.wound ? ", copper-wound" : ""), pl, 6 * d);
    // rest line and the two ends of the speaking length
    g.strokeStyle = C.rgb("--grid"); g.lineWidth = d; g.setLineDash([4 * d, 4 * d]); g.beginPath(); g.moveTo(X(0), mid); g.lineTo(X(1), mid); g.stroke(); g.setLineDash([]);
    g.fillStyle = C.rgb("--muted");
    g.fillRect(X(0) - 2 * d, mid - 10 * d, 4 * d, 20 * d); g.fillRect(X(1) - 2 * d, mid - 10 * d, 4 * d, 20 * d);
    g.font = uiFont(11, d); g.textBaseline = "bottom";
    g.textAlign = "left"; g.fillText("top end", X(0) - 4 * d, endY);
    g.textAlign = "right"; g.fillText("bridge", X(1) + 4 * d, endY);
    g.textAlign = "center"; g.fillText("motion slowed " + Math.round(f / FV1) + "×, height enlarged", Wd / 2, endY);
    // hammer (at 1/8) and damper felt, both on the player's side of the string (drawn below it)
    var lift = hammerLift(K, t), hx = X(1 / 8), hw = 9 * d, hh = 13 * d, hy = mid + 3 * d + (1 - Math.min(1, lift)) * 20 * d;
    g.fillStyle = C.rgb("--ink", 0.6); rr(g, hx - hw / 2, hy, hw, hh, 3 * d); g.fill();
    g.fillRect(hx - 1 * d, hy + hh, 2 * d, 8 * d);
    g.textBaseline = "middle"; g.font = uiFont(11, d); g.fillStyle = C.rgb("--muted"); g.textAlign = "right";
    g.fillText("hammer", hx + hw / 2, labY);
    var damped = K.damped && !(K.held || ped.sus);
    if (K.damped) {
      var x0 = X(K.xd - K.dw / 2), x1 = Math.max(X(K.xd + K.dw / 2), x0 + 6 * d), dy = damped ? mid - Math.max(-1.4, Math.min(1.4, wbuf[Math.round(K.xd * NQ2)])) * amp + 1.5 * d : mid + 23 * d;
      g.fillStyle = C.rgb("--pos", damped ? 0.95 : 0.5); rr(g, x0, dy, x1 - x0, 10 * d, 2 * d); g.fill();
      g.textAlign = "left"; g.fillStyle = C.rgb("--muted");
      g.fillText(damped ? "damper on the string" : "damper lifted", x0, labY);
    } else {
      g.textAlign = "left"; g.fillStyle = C.rgb("--muted"); g.fillText("no damper on this key", X(0.4), labY);
    }
    // the string
    g.strokeStyle = C.rgb("--accent"); g.lineWidth = 2.5 * d; g.lineJoin = "round"; g.beginPath();
    for (var q = 0; q <= NQ2; q++) {
      var y = mid - Math.max(-1.4, Math.min(1.4, wbuf[q])) * amp;
      if (q) g.lineTo(X(q / NQ2), y); else g.moveTo(X(0), y);
    }
    g.stroke();
  }
  function drawModes(t) {
    var K = KEYS[sel], d = C.fit(mv), Wd = mv.width, H = mv.height, g = mv.getContext("2d"), NM = 16;
    g.clearRect(0, 0, Wd, H);
    var pl = 10 * d, pr = 10 * d, top = 30 * d, bw = (Wd - pl - pr) / NM, numY = H - 36 * d, base0 = numY - 6 * d, hmax = base0 - top, tickTop = H - 22 * d, tickH = 14 * d;
    g.textBaseline = "top"; g.font = uiFont(13, d); g.fillStyle = C.rgb("--ink"); g.textAlign = "left";
    g.fillText("Modes 1–16 of " + nm(K.m), pl, 6 * d);
    var gmax = 0, dm = K.damped ? dmpOf(K) : null;
    if (dm) for (var n = 1; n <= NM; n++) gmax = Math.max(gmax, C.damperWeight(n, dm.xd, dm.w));
    var dampOn = K.damped && !(K.held || ped.sus);
    g.strokeStyle = C.rgb("--grid"); g.lineWidth = d; g.beginPath(); g.moveTo(pl, base0 + 0.5 * d); g.lineTo(Wd - pr, base0 + 0.5 * d); g.stroke();
    for (var n = 1; n <= NM; n++) {
      var md = K.vis ? K.vis.modes[n - 1] : null, a = md ? Math.abs(ampNow(K, n - 1, t)) : 0, a0 = md ? md.a0 : 0, x0 = pl + (n - 1) * bw;
      g.fillStyle = C.rgb("--grid"); g.fillRect(x0 + bw * 0.2, base0 - hmax * Math.min(1, a0), bw * 0.6, hmax * Math.min(1, a0));
      g.fillStyle = C.rgb("--accent"); g.fillRect(x0 + bw * 0.2, base0 - hmax * Math.min(1, a), bw * 0.6, hmax * Math.min(1, a));
      g.fillStyle = C.rgb("--muted"); g.font = uiFont(10.5, d); g.textAlign = "center"; g.textBaseline = "top";
      if (bw > 15 * d || n === 1 || n % 4 === 0) g.fillText(String(n), x0 + bw / 2, numY);
      if (dm) { var gw = C.damperWeight(n, dm.xd, dm.w) / gmax; g.fillStyle = C.rgb("--pos", dampOn ? 1 : 0.35); g.fillRect(x0 + bw * 0.25, tickTop + tickH * (1 - gw), bw * 0.5, tickH * gw); }
    }
    if (!dm) { g.fillStyle = C.rgb("--muted"); g.font = uiFont(11, d); g.textAlign = "center"; g.textBaseline = "top"; g.fillText("no damper on this key", Wd / 2, tickTop + 1 * d); }
  }

  // ===================================================================================================
  // 6. The 3D upright
  // ===================================================================================================
  var T = window.THREE, cv = $("apCanvas"), stage = $("apStage"), view = null;
  function fallback(msg) {
    var p = document.createElement("p"); p.className = "ap-fallback";
    p.textContent = msg || "The 3D piano needs WebGL, which this browser could not start. The keyboard, pedals and graphs below still work.";
    stage.innerHTML = ""; stage.appendChild(p);
  }
  (function build3D() {
    if (!T || !T.OrbitControls) { fallback("The 3D piano could not load (three.js is missing). The keyboard, pedals and graphs below still work."); return; }
    var probe = document.createElement("canvas");
    if (!(probe.getContext("webgl") || probe.getContext("experimental-webgl"))) { fallback(); return; }
    var renderer;
    try { renderer = new T.WebGLRenderer({ canvas: cv, antialias: true, alpha: true, powerPreference: "high-performance" }); if (!renderer.getContext()) throw new Error("no context"); }
    catch (err) { fallback(); return; }
    var scene = new T.Scene(), camera = new T.PerspectiveCamera(32, 1, 2, 4000);
    var controls = new T.OrbitControls(camera, cv);
    controls.enableDamping = true; controls.dampingFactor = 0.12; controls.minDistance = 18; controls.maxDistance = 900;
    controls.touches = { ONE: T.TOUCH.ROTATE, TWO: T.TOUCH.DOLLY_ROTATE };
    scene.add(new T.HemisphereLight(0xffffff, 0x7d828c, 0.85));
    var sun = new T.DirectionalLight(0xffffff, 0.75); sun.position.set(80, 160, 140); scene.add(sun);
    var fill = new T.DirectionalLight(0xffffff, 0.32); fill.position.set(-120, 60, 80); scene.add(fill);
    var back = new T.DirectionalLight(0xffffff, 0.25); back.position.set(0, 80, -200); scene.add(back);

    function std(c, r, m) { return new T.MeshStandardMaterial({ color: c, roughness: r == null ? 0.6 : r, metalness: m || 0 }); }
    var MAT = {
      lacq: std(0x141519, 0.3, 0.2), white: std(0xffffff, 0.42), keywood: std(0xdcc9a2, 0.8), wood: std(0xc9a774, 0.7), mold: std(0xa97c4c, 0.6),
      shank: std(0xe0c995, 0.7), felt: std(0xf1ebdd, 0.95), underfelt: std(0x9e3b33, 0.95), dfelt: std(0xf4f0e8, 0.95), dblock: std(0x6b4127, 0.6), mute: std(0x8e2f2a, 0.95),
      gold: std(0xcaa24c, 0.4, 0.45), steel: std(0xc8cdd4, 0.32, 0.55), copper: std(0xc27a3c, 0.38, 0.5), brass: std(0xd8b660, 0.3, 0.55),
      pinblock: std(0x8b5a36, 0.7), bridge: std(0xa87845, 0.55), rail: std(0x9ba2ad, 0.35, 0.55), trap: std(0xb68b58, 0.7), dowel: std(0xd4b483, 0.7),
      post: std(0xd8be8b, 0.75), wippen: std(0xb38d5e, 0.75), butt: std(0xd9ccb2, 0.9), dwire: std(0xc8cdd4, 0.32, 0.55), dlever: std(0xb38d5e, 0.75)
    };
    // spruce soundboard with a little grain
    (function () {
      var c = document.createElement("canvas"); c.width = 512; c.height = 64; var g = c.getContext("2d");
      g.fillStyle = "#dcc690"; g.fillRect(0, 0, 512, 64);
      for (var k = 0; k < 160; k++) { var x = Math.random() * 512; g.fillStyle = "rgba(160,120,60," + (0.05 + Math.random() * 0.12) + ")"; g.fillRect(x, 0, 0.6 + Math.random() * 2.2, 64); }
      var tx = new T.CanvasTexture(c); tx.wrapS = tx.wrapT = T.RepeatWrapping; tx.repeat.set(3, 1); tx.rotation = 0.5; tx.center.set(0.5, 0.5);
      MAT.spruce = new T.MeshStandardMaterial({ color: 0xffffff, map: tx, roughness: 0.75 });
    })();
    var UNIT = new T.BoxGeometry(1, 1, 1), CYL = new T.CylinderGeometry(1, 1, 1, 10), CYL6 = new T.CylinderGeometry(1, 1, 1, 6);
    var v3 = function (x, y, z) { return new T.Vector3(x, y, z); };
    var EX = v3(1, 0, 0), EY = v3(0, 1, 0), EZ = v3(0, 0, 1);
    function box(x0, x1, y0, y1, z0, z1, mat, parent) {
      var o = new T.Mesh(UNIT, mat); o.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); o.scale.set(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0));
      (parent || scene).add(o); return o;
    }
    function mBox(cx, cy, cz, sx, sy, sz) { return new T.Matrix4().compose(v3(cx, cy, cz), new T.Quaternion(), v3(sx, sy, sz)); }
    function mBasis(c, ex, ey, ez, sx, sy, sz) { var M = new T.Matrix4().makeBasis(ex.clone().multiplyScalar(sx), ey.clone().multiplyScalar(sy), ez.clone().multiplyScalar(sz)); M.setPosition(c); return M; }
    function mSeg(a, b, r) {   // unit cylinder along y, from a to b
      var dir = b.clone().sub(a), len = dir.length(), q = new T.Quaternion().setFromUnitVectors(EY, dir.clone().normalize());
      return new T.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, v3(r, len, r));
    }
    function inst(geo, mat, mats, parent) {
      var im = new T.InstancedMesh(geo, mat, Math.max(1, mats.length)); im.frustumCulled = false;
      mats.forEach(function (M, k) { im.setMatrixAt(k, M); }); im.count = mats.length; (parent || scene).add(im); return im;
    }
    var pickSolid = [];   // everything a double-click may zoom to

    // ---------- cabinet (polished ebony), keybed, cheeks, fallboard ----------
    var cab = []; MAT.lacq.transparent = true;
    [-1, 1].forEach(function (s) {
      cab.push(box(s * 73.5, s * 76, 66.5, 122, -61, -17, MAT.lacq));       // side above the keys
      cab.push(box(s * 73.5, s * 76, 0, 66.5, -61, -3, MAT.lacq));          // side below the keybed
      cab.push(box(s * 61.4, s * 73.5, 69.5, 77.5, -17, 1.4, MAT.lacq));    // cheek block
    });
    cab.push(box(-73.5, 73.5, 66.5, 69.5, -46, 0, MAT.lacq));                // keybed
    cab.push(box(-73.5, 73.5, 67.0, 71.4, 0, 1.6, MAT.lacq));                // key slip
    cab.push(box(-73.5, 73.5, 0, 6.5, -8, -5.5, MAT.lacq));                  // toe rail, the pedals pass through it
    cab.push(box(-73.5, 73.5, 0, 2, -61, -5.5, MAT.lacq));                   // bottom of the case
    cab.push(box(-76, 76, 119.5, 122, -61, -55, MAT.lacq));                   // top back rail (the lid is off)
    var fb = new T.Group(); fb.position.set(0, 75.4, -15.9); fb.rotation.x = -0.14; scene.add(fb);
    var fbm = box(-61.2, 61.2, 0, 11.2, -1.6, 0, MAT.lacq, fb); cab.push(fbm);  // fallboard, open
    box(-61.2, 61.2, 0, 0.6, -1.6, 0.4, MAT.lacq, fb);
    cab.forEach(function (o) { pickSolid.push(o); });
    // key frame rails under the keys
    box(-61.5, 61.5, 69.5, 70.8, -3.0, -1.2, MAT.wood); box(-61.5, 61.5, 69.5, 70.8, -24.8, -23.2, MAT.wood); box(-61.5, 61.5, 69.5, 70.6, -41.5, -39.5, MAT.wood);

    // ---------- back: posts, soundboard, pin block, plate ----------
    [-62, -31, 0, 31, 62].forEach(function (x) { box(x - 3.5, x + 3.5, 2, 119.5, -61, -55.6, MAT.post); });
    var sb = box(-70.5, 70.5, 6, 106, -53.4, -52.4, MAT.spruce); pickSolid.push(sb);
    for (var r = 0; r < 9; r++) { var ry = 14 + r * 11; var rib = box(-68, 68, ry - 0.9, ry + 0.9, -55.5, -53.4, MAT.post); rib.rotation.z = -0.12; }
    var pb = box(-72.5, 72.5, 101, 120.5, -56, -50.4, MAT.pinblock); pickSolid.push(pb);

    // the plate: an iron casting with one big opening over the soundboard, where the bridges stand
    var tre = KEYS.filter(function (K) { return !K.bass; }), bas = KEYS.filter(function (K) { return K.bass; });
    var ob = [];   // opening outline, clockwise from the top left
    ob.push([-60, 106.5]);
    tre.forEach(function (K, k) { if (k % 4 === 0 || k === tre.length - 1) ob.push([K.Tx, Math.min(106.5, K.Ty - 2.2)]); });
    ob.push([64.5, tre[tre.length - 1].Ty - 2.2]); ob.push([64.5, tre[tre.length - 1].By - 4.5]);
    for (var k = tre.length - 1; k >= 0; k -= 4) { var K0 = tre[k]; if (K0.Bx > 22) ob.push([K0.Bx + 1.0, K0.By - 4.6]); }
    var bb0 = bas[0], bb1 = bas[bas.length - 1];
    ob.push([bb1.Bx + 6, bb1.By + 2]); ob.push([bb1.Bx + 5, bb1.By - 5]); ob.push([bb0.Bx + 3, bb0.By - 5.5]); ob.push([bb0.Bx - 7, bb0.By - 4]);
    ob.push([tre[0].Bx - 5, tre[0].By - 6]); ob.push([-62, 52]); ob.push([-62, 100]);
    var plateShape = new T.Shape();
    plateShape.moveTo(-70, 4); plateShape.lineTo(70, 4); plateShape.lineTo(71.5, 6); plateShape.lineTo(71.5, 118); plateShape.lineTo(69.5, 119.8); plateShape.lineTo(-69.5, 119.8); plateShape.lineTo(-71.5, 118); plateShape.lineTo(-71.5, 6); plateShape.lineTo(-70, 4);
    var hole = new T.Path(); ob.forEach(function (p, k) { if (k) hole.lineTo(p[0], p[1]); else hole.moveTo(p[0], p[1]); }); hole.lineTo(ob[0][0], ob[0][1]);
    plateShape.holes.push(hole);
    var pg = new T.ExtrudeGeometry(plateShape, { depth: 1.4, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.4, bevelSegments: 1, curveSegments: 4 }); pg.translate(0, 0, -50.4);
    var plate = new T.Mesh(pg, MAT.gold); scene.add(plate); pickSolid.push(plate);
    // struts: one along the bass break, two short ones in the treble
    function strut(xTop, yTop, yBot, ang, wid) {
      var a = v3(xTop, yTop, -49.6), b = v3(xTop - (yTop - yBot) * Math.tan(ang), yBot, -49.6), dir = b.clone().sub(a);
      var ex = dir.clone().normalize(), ez = EZ.clone(), ey = ez.clone().cross(ex).normalize();
      var o = new T.Mesh(UNIT, MAT.gold); o.matrixAutoUpdate = false; o.matrix.copy(mBasis(a.clone().add(b).multiplyScalar(0.5), ex, ey, ez, dir.length(), wid, 2.6)); scene.add(o); pickSolid.push(o);
    }
    var g1 = (KEYS[24].xa + KEYS[25].xa) / 2, g2 = (KEYS[45].xa + KEYS[46].xa) / 2, g3 = (KEYS[66].xa + KEYS[67].xa) / 2;
    strut(g1 + 2, 110, 36, 10 * Math.PI / 180, 3.2);
    function bridgeYAt(x) { var best = null; tre.forEach(function (K) { if (!best || Math.abs(K.Bx - x) < Math.abs(best.Bx - x)) best = K; }); return best.By; }
    strut(g2 + 0.6, 106, bridgeYAt(g2) + 6, 6 * Math.PI / 180, 2.2);
    strut(g3 + 0.3, 104, bridgeYAt(g3) + 5, 3 * Math.PI / 180, 2.0);

    // ---------- bridges, pressure bar, agraffes ----------
    function bridgeRun(list, zTop, wid, mat) {
      var mats = [];
      for (var k = 0; k < list.length - 1; k++) {
        var A = v3(list[k].Bx, list[k].By, 0), B = v3(list[k + 1].Bx, list[k + 1].By, 0), dir = B.clone().sub(A), len = dir.length() + 0.6;
        var ex = dir.normalize(), ez = EZ.clone(), ey = ez.clone().cross(ex).normalize(), c = A.clone().add(B).multiplyScalar(0.5); c.z = (-52.4 + zTop) / 2;
        mats.push(mBasis(c, ex, ey, ez, len, wid, zTop + 52.4));
      }
      var im = inst(UNIT, mat, mats); pickSolid.push(im); return im;
    }
    bridgeRun(tre, Z_T - 0.08, 2.2, MAT.bridge);
    bridgeRun(bas, Z_B - 0.08, 2.8, MAT.bridge);
    [tre.slice(0, 21), tre.slice(21, 42), tre.slice(42)].forEach(function (sec) {
      var pts = sec.map(function (K) { return v3(K.Tx, K.Ty + 0.1, Z_T + 0.55); });
      var bar = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), Math.max(8, pts.length * 2), 0.45, 6, false), MAT.steel); scene.add(bar);
    });
    inst(UNIT, MAT.brass, bas.map(function (K) { return mBox(K.Tx, K.Ty + 0.2, Z_B - 0.15, 1.0, 0.8, 1.1); }));

    // ---------- strings, tuning pins, hitch pins ----------
    var lineVerts = [], copperMats = [], tpMats = [], hpMats = [], rot90 = new T.Quaternion().setFromAxisAngle(EX, Math.PI / 2);
    KEYS.forEach(function (K) {
      K.str = [];
      K.offs.forEach(function (o, j) {
        var tx = K.Tx + K.px * o, ty = K.Ty + K.py * o, bx = K.Bx + K.px * o, by = K.By + K.py * o, z = K.zs;
        var row = K.ns === 1 ? 0 : j, pd = 3.4 + row * 2.3, hd = 2.6 + (j % 2) * 1.3;
        var tpx = tx - K.ux * pd, tpy = ty - K.uy * pd, hpx = bx + K.ux * hd, hpy = by + K.uy * hd;
        var S = { T: v3(tx, ty, z), B: v3(bx, by, z), r: K.wound ? 0.34 - 0.16 * K.i / 24 - (K.ns === 2 ? 0.04 : 0) : 0.07 };
        lineVerts.push(tpx, tpy, z, tx, ty, z, bx, by, z, hpx, hpy, z);
        if (K.wound) { S.ci = copperMats.length; copperMats.push(mSeg(S.T, S.B, S.r)); S.li = -1; }
        else { S.li = lineVerts.length / 3 - 3; }   // the speaking segment: vertices li, li + 1
        var pz = K.bass ? -45.0 : -46.3; tpMats.push(new T.Matrix4().compose(v3(tpx, tpy, (-49 + pz) / 2), rot90, v3(0.33, pz + 49, 0.33)));
        hpMats.push(new T.Matrix4().compose(v3(hpx, hpy, -47.9), rot90, v3(0.28, 2.2, 0.28)));
        K.str.push(S);
      });
    });
    // static wires as one set of line segments (pin to pressure bar, speaking length, bridge to hitch pin)
    var segIdx = [];
    for (var s0 = 0; s0 < lineVerts.length / 3; s0 += 4) segIdx.push(s0, s0 + 1, s0 + 1, s0 + 2, s0 + 2, s0 + 3);
    var lg = new T.BufferGeometry(); lg.setAttribute("position", new T.BufferAttribute(new Float32Array(lineVerts), 3)); lg.setIndex(segIdx);
    var wireIdx = lg.getIndex();
    var wires = new T.LineSegments(lg, new T.LineBasicMaterial({ color: 0x8f969f })); scene.add(wires);
    var copper = inst(CYL6, MAT.copper, copperMats); pickSolid.push(copper);
    inst(CYL, MAT.steel, tpMats); inst(CYL6, MAT.steel, hpMats);
    // hide a static wire while its vibrating copy is drawn: collapse its speaking segment onto one vertex
    var ZERO = new T.Matrix4().makeScale(0, 0, 0);
    KEYS.forEach(function (K) { K.str.forEach(function (S) { if (S.li >= 0) { for (var k = 0; k < segIdx.length; k += 2) if (segIdx[k] === S.li && segIdx[k + 1] === S.li + 1) { S.si = k; break; } } }); });
    function showStatic(K, on) {
      K.str.forEach(function (S) {
        if (S.ci >= 0) copper.setMatrixAt(S.ci, on ? mSeg(S.T, S.B, S.r) : ZERO);
        else { wireIdx.setX(S.si + 1, on ? S.li + 1 : S.li); wireIdx.needsUpdate = true; }
      });
      copper.instanceMatrix.needsUpdate = true;
    }

    // vibrating strings: a small pool of tubes, given to the strings that are sounding
    var NSEG = 40, NRAD = 6, ACC = new T.Color(0x2e4bb0);
    var vibMat = new T.MeshStandardMaterial({ color: 0x3553c4, roughness: 0.35, metalness: 0.2, emissive: 0x1b2b6e, emissiveIntensity: 0.6 });
    var SIN3 = []; for (var n1 = 1; n1 <= 16; n1++) { var rw = []; for (var q1 = 0; q1 <= NSEG; q1++) rw.push(Math.sin(n1 * Math.PI * q1 / NSEG)); SIN3.push(rw); }
    var pool = [];
    (function () {
      var idx = [];
      for (var q = 0; q < NSEG; q++) for (var r = 0; r < NRAD; r++) { var a = q * NRAD + r, b = q * NRAD + (r + 1) % NRAD, c2 = a + NRAD, d2 = b + NRAD; idx.push(a, c2, b, b, c2, d2); }
      for (var k = 0; k < 36; k++) {
        var g = new T.BufferGeometry(), np = (NSEG + 1) * NRAD;
        g.setAttribute("position", new T.BufferAttribute(new Float32Array(np * 3), 3)); g.setAttribute("normal", new T.BufferAttribute(new Float32Array(np * 3), 3)); g.setIndex(idx);
        var mesh = new T.Mesh(g, vibMat); mesh.visible = false; mesh.frustumCulled = false; scene.add(mesh); pool.push({ mesh: mesh, S: null, K: null });
      }
    })();
    var ubuf = new Float32Array(NSEG + 1);
    function takeTubes(K) {
      if (K.tubes) return;
      var free = pool.filter(function (p) { return !p.K; });
      if (free.length < K.str.length) {   // steal from the quietest sounding key
        var t = performance.now() / 1000, victim = null, ve = 1e9;
        KEYS.forEach(function (O) { if (O.tubes && O !== K) { var e = energy(O, t); if (e < ve) { ve = e; victim = O; } } });
        if (victim) giveBack(victim); free = pool.filter(function (p) { return !p.K; });
        if (free.length < K.str.length) return;
      }
      K.tubes = K.str.map(function (S, j) {
        var p = free[j]; p.K = K; p.S = S; p.mesh.visible = true;
        var nrm = p.mesh.geometry.attributes.normal.array;
        for (var q = 0; q <= NSEG; q++) for (var r = 0; r < NRAD; r++) { var th = 2 * Math.PI * r / NRAD, o = 3 * (q * NRAD + r); nrm[o] = K.px * Math.cos(th); nrm[o + 1] = K.py * Math.cos(th); nrm[o + 2] = Math.sin(th); }
        p.mesh.geometry.attributes.normal.needsUpdate = true;
        return p;
      });
      showStatic(K, false);
    }
    function giveBack(K) { if (!K.tubes) return; K.tubes.forEach(function (p) { p.K = null; p.S = null; p.mesh.visible = false; }); K.tubes = null; showStatic(K, true); }
    function drawTubes(K, t) {
      shapeInto(K, t, SIN3, NSEG, ubuf);
      var A = Math.min(1.6, 0.012 * K.L + 0.25);
      K.tubes.forEach(function (p) {
        var S = p.S, pos = p.mesh.geometry.attributes.position.array, rad = Math.max(0.09, S.r * 0.9);
        for (var q = 0; q <= NSEG; q++) {
          var s = q / NSEG, cx = S.T.x + (S.B.x - S.T.x) * s, cy = S.T.y + (S.B.y - S.T.y) * s, cz = S.T.z - ubuf[q] * A;
          for (var r = 0; r < NRAD; r++) { var th = 2 * Math.PI * r / NRAD, c = Math.cos(th) * rad, o = 3 * (q * NRAD + r); pos[o] = cx + K.px * c; pos[o + 1] = cy + K.py * c; pos[o + 2] = cz + Math.sin(th) * rad; }
        }
        p.mesh.geometry.attributes.position.needsUpdate = true;
      });
    }

    // ---------- keys: white tops in two pieces, black keys, wooden levers, capstans ----------
    var blackShape = new T.Shape();
    var hb = HB - 0.08; blackShape.moveTo(-hb, 0); blackShape.lineTo(hb, 0); blackShape.lineTo(hb, 2.0); blackShape.lineTo(0.41, 3.1); blackShape.lineTo(-0.41, 3.1); blackShape.lineTo(-hb, 2.0); blackShape.lineTo(-hb, 0);
    var blackGeo = new T.ExtrudeGeometry(blackShape, { depth: 9.5, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.08, bevelSegments: 1 }); blackGeo.translate(0, 0, -14.5);
    var groups = [];   // per key: parts that turn about the balance rail
    var whites = KEYS.filter(function (K) { return !K.black; }), blacks = KEYS.filter(function (K) { return K.black; });
    var wFront = inst(UNIT, MAT.white, whites.map(function (K) { return mBox(K.kx, 71.9, -2.5, W - 0.12, 2.2, 5.0); }));
    var wBack = inst(UNIT, MAT.white, whites.map(function (K) {
      var lb = K.m > LOW && isBlack(K.m - 1) ? keyX(K.m - 1) + HB + 0.06 : K.kx - W / 2 + 0.06;
      var rb = K.m < 108 && isBlack(K.m + 1) ? keyX(K.m + 1) - HB - 0.06 : K.kx + W / 2 - 0.06;
      K.lb = lb; K.rb = rb; return mBox((lb + rb) / 2, 71.9, -10.0, rb - lb, 2.2, 10.0);
    }));
    var bKeys = inst(blackGeo, MAT.white, blacks.map(function (K) { return mBox(K.kx, 71.0, 0, 1, 1, 1); }));
    var IVORY = new T.Color(0xf7f4ec), EBONY = new T.Color(0x1a1b20), HI_W = new T.Color(0xc4cff5), HI_B = new T.Color(0x3c55b8);
    whites.forEach(function (K, k) { K.wi = k; wFront.setColorAt(k, IVORY); wBack.setColorAt(k, IVORY); });
    blacks.forEach(function (K, k) { K.bi = k; bKeys.setColorAt(k, EBONY); });
    var levers = inst(UNIT, MAT.keywood, KEYS.map(function (K) {
      var a = v3(K.kx, 71.6, -15.2), b = v3(K.xa, 71.6, -40), dir = b.clone().sub(a), ez = dir.clone().normalize().negate(), ey = EY.clone(), ex = ey.clone().cross(ez).normalize();
      return mBasis(a.clone().add(b).multiplyScalar(0.5), ex, ey, ez, 1.0, 1.6, dir.length());
    }));
    var capstans = inst(CYL, MAT.brass, KEYS.map(function (K) { return mBox(K.xa, 73.0, -37.8, 0.45, 1.3, 0.45); }));
    KEYS.forEach(function (K) {
      var parts = [{ im: levers, k: K.i }, { im: capstans, k: K.i }];
      if (K.black) parts.push({ im: bKeys, k: K.bi }); else parts.push({ im: wFront, k: K.wi }, { im: wBack, k: K.wi });
      parts.forEach(function (p) { p.rest = new T.Matrix4(); p.im.getMatrixAt(p.k, p.rest); });
      K.keyParts = parts;
    });

    // ---------- the action: wippens and jacks, hammers, dampers, rails ----------
    var wipps = inst(UNIT, MAT.wippen, KEYS.map(function (K) { return mBox(K.xa, 75.3, -37.4, 0.8, 1.9, 3.6); }));
    var jacks = inst(UNIT, MAT.wippen, KEYS.map(function (K) { return mBox(K.xa, 80.4, -38.3, 0.36, 7.6, 0.45); }));
    KEYS.forEach(function (K) { K.wipParts = [{ im: wipps, k: K.i }, { im: jacks, k: K.i }]; K.wipParts.forEach(function (p) { p.rest = new T.Matrix4(); p.im.getMatrixAt(p.k, p.rest); }); });
    // hammer felt: a rounded nose in the (depth, height) plane, extruded across the width
    var fs = new T.Shape();
    fs.moveTo(0, 0); fs.quadraticCurveTo(0.02, 0.36, 0.34, 0.5); fs.lineTo(0.6, 0.48); fs.lineTo(0.6, -0.48); fs.lineTo(0.34, -0.5); fs.quadraticCurveTo(0.02, -0.36, 0, 0);
    var feltGeo = new T.ExtrudeGeometry(fs, { depth: 1, bevelEnabled: false, curveSegments: 8 }); feltGeo.rotateY(-Math.PI / 2); feltGeo.translate(0.5, 0, 0);
    var hw = KEYS.pitch - 0.14;
    var hFelt = inst(feltGeo, MAT.felt, KEYS.map(function (K) { return new T.Matrix4().compose(v3(K.xa, YS, K.zf), new T.Quaternion(), v3(hw, K.hH, K.hD)); }));
    var hUnder = inst(UNIT, MAT.underfelt, KEYS.map(function (K) { return mBox(K.xa, YS, K.zf + K.hD * 0.65, hw * 0.97, K.hH * 0.84, K.hD * 0.18); }));
    var hMold = inst(UNIT, MAT.mold, KEYS.map(function (K) { return mBox(K.xa, YS, K.zf + K.hD * 0.85, hw * 0.94, K.hH * 0.66, K.hD * 0.3); }));
    var hShank = inst(CYL, MAT.shank, KEYS.map(function (K) { return mSeg(v3(K.xa, Y_PIV + 1.4, Z_SH), v3(K.xa, YS - K.hH * 0.3, Z_SH), 0.28); }));
    var hButt = inst(UNIT, MAT.butt, KEYS.map(function (K) { return mBox(K.xa, Y_PIV, Z_SH + 0.5, 0.9, 3.0, 2.2); }));
    KEYS.forEach(function (K) {
      K.hamParts = [hFelt, hUnder, hMold, hShank, hButt].map(function (im) { var r2 = new T.Matrix4(); im.getMatrixAt(K.i, r2); return { im: im, k: K.i, rest: r2 }; });
      K.hPivot = v3(K.xa, Y_PIV, Z_SH + 0.6);
    });
    pickSolid.push(hFelt, hMold);
    var damped = KEYS.filter(function (K) { return K.damped; });
    function dFrame(K) { return { ex: v3(K.px, K.py, 0), ey: v3(-K.ux, -K.uy, 0), gw: Math.max(0.95, (K.ns - 1) * 0.76 + 0.8) }; }
    var dHeads = inst(UNIT, MAT.dfelt, damped.map(function (K) { var f = dFrame(K); return mBasis(v3(K.Cx, K.Cy, K.zs + 0.48), f.ex, f.ey, EZ, f.gw, K.fl, 0.7); }));
    var dBlocks = inst(UNIT, MAT.dblock, damped.map(function (K) { var f = dFrame(K); return mBasis(v3(K.Cx, K.Cy, K.zs + 1.4), f.ex, f.ey, EZ, f.gw, K.fl * 0.85, 1.15); }));
    var dWires = inst(CYL6, MAT.dwire, damped.map(function (K) { return mSeg(v3(K.Cx + K.ux * K.fl * 0.3, K.Cy + K.uy * K.fl * 0.3, K.zs + 1.6), v3(K.xa, 87.2, -41.0), 0.09); }));
    var dLevers = inst(UNIT, MAT.dlever, damped.map(function (K) { return mBox(K.xa, 83.3, -41.0, 0.6, 8.0, 0.8); }));
    damped.forEach(function (K, k) {
      K.dmpParts = [dHeads, dBlocks, dWires, dLevers].map(function (im) { var r2 = new T.Matrix4(); im.getMatrixAt(k, r2); return { im: im, k: k, rest: r2 }; });
      K.dPivot = v3(K.xa, 79.4, -41.0);
    });
    pickSolid.push(dHeads, dBlocks);
    // rails and brackets
    var mainRail = box(-63, 63, 79.8, 82.2, -36.6, -34.6, MAT.rail);
    [-63.5, g1, 63.5].forEach(function (x) { box(x - 0.7, x + 0.7, 69.5, 92, -37.2, -35.6, MAT.rail); });
    var hamRailMat = MAT.wood.clone(), hamRail = box(-66, 62.5, 90.4, 91.6, Z_SH + 0.32, Z_SH + 1.5, hamRailMat); var hamRailFelt = box(-62.5, 62.5, 90.5, 91.5, Z_SH + 0.3, Z_SH + 0.45, MAT.underfelt, null);
    var liftRailMat = MAT.wood.clone(), liftRail = box(-62.5, 66, 81.4, 82.6, -42.6, -41.6, liftRailMat);
    // practice mute: two felt strips on a rail (the bass strings sit in front of the rest)
    var muteG = new T.Group(); scene.add(muteG);
    box(-61.5, g1 - 0.5, -1.8, 1.8, Z_B + 1.4, Z_B + 1.8, MAT.mute, muteG); box(g1 + 0.5, 62, -1.8, 1.8, Z_T + 1.4, Z_T + 1.8, MAT.mute, muteG);
    box(-61.5, g1 + 0.5, 1.8, 2.6, Z_B + 1.4, Z_B + 2.0, MAT.wood, muteG); box(g1 - 0.5, 62, 1.8, 2.6, Z_T + 1.4, Z_T + 2.0, MAT.wood, muteG);
    box(62, 68.8, 1.8, 2.6, Z_T + 1.4, -43.2, MAT.wood, muteG);
    var MUTE_UP = 104.4, MUTE_DN = 100.3; muteG.position.y = MUTE_UP;

    // ---------- pedals and trapwork ----------
    var PEDX = { soft: -10.5, mute: 0, sus: 10.5 }, pedObj = {}, pedPick = [];
    ["soft", "mute", "sus"].forEach(function (name) {
      var x = PEDX[name], g = new T.Group(); g.position.set(x, 5.6, -7); scene.add(g);
      var pm = MAT.brass.clone(), foot = box(-1.9, 1.9, -0.6, 0.9, 1.5, 13.0, pm, g), toe = new T.Mesh(CYL, pm); toe.scale.set(0.75, 3.8, 0.75); toe.rotation.z = Math.PI / 2; toe.position.set(0, 0.25, 13.0); g.add(toe);
      box(-0.9, 0.9, -0.7, 0.7, -37.0, 1.5, MAT.rail, g);
      foot.userData = toe.userData = { pedal: name }; pedPick.push(foot, toe);
      var dowel = new T.Mesh(CYL, MAT.dowel); dowel.scale.set(0.85, 56.8, 0.85); dowel.position.set(x, 34.7, -43.6); scene.add(dowel);
      var xe = name === "soft" ? -66 : name === "sus" ? 66 : 69.0;
      var trap = box(Math.min(x, xe) - 0.8, Math.max(x, xe) + 0.8, 61.6, 63.2, -44.4, -42.8, MAT.trap);
      var top = name === "soft" ? 90.6 : name === "sus" ? 81.6 : 106.3;
      var rod = new T.Mesh(CYL, MAT.rail); rod.scale.set(0.4, top - 63.2, 0.4); rod.position.set(xe, (top + 63.2) / 2, -43.6); scene.add(rod);
      pedObj[name] = { g: g, pm: pm, dowel: dowel, trap: trap, rod: rod, a: 0, dy0: dowel.position.y, ty0: trap.position.y, ry0: rod.position.y };
    });
    box(-66.6, -65.4, 90.0, 91.4, -43.8, Z_SH + 0.4, MAT.rail);           // link from the soft rod to the hammer rail
    var muteRocker = new T.Group(); muteRocker.position.set(66.0, 106.8, -43.6); scene.add(muteRocker);
    box(-3.5, 3.5, -0.5, 0.5, -0.5, 0.5, MAT.rail, muteRocker);
    // a soft shadow under the piano
    (function () {
      var c = document.createElement("canvas"); c.width = c.height = 128; var g = c.getContext("2d"), gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
      gr.addColorStop(0, "rgba(0,0,0,0.38)"); gr.addColorStop(0.6, "rgba(0,0,0,0.16)"); gr.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
      var m = new T.Mesh(new T.PlaneGeometry(260, 130), new T.MeshBasicMaterial({ map: new T.CanvasTexture(c), transparent: true, depthWrite: false }));
      m.rotation.x = -Math.PI / 2; m.position.set(0, 0.05, -26); scene.add(m);
    })();

    // ---------- labels (HTML, so they stay sharp and readable at any zoom) ----------
    var labLayer = $("apLabels"), showLabels = true, LABS = [];
    function lab(text, p, pri, cond, side, short) { var el = document.createElement("span"); el.textContent = text; labLayer.appendChild(el); LABS.push({ el: el, p: p, pri: pri, cond: cond, side: side, text: text, short: short, w: 0, h: 0 }); }
    var K40 = KEYS[40], K12 = KEYS[12], K60 = KEYS[60], K30 = KEYS[30], K75 = KEYS[75];
    var noSec = function () { return section < 0; }, inSec = function () { return section >= 0; }, SK = function () { return KEYS[Math.max(0, section)]; };
    var K18 = KEYS[18]; lab("hammers", v3(K18.xa, YS + K18.hH / 2 + 0.3, K18.zf + 2), 1, noSec, "l");
    var K20 = KEYS[30]; lab("dampers", v3(K20.Cx, K20.Cy - 1, K20.zs + 1.9), 2, noSec, "r");
    function slab(text, pf, pri, side, tf) { lab(text, null, pri, inSec, side); var L = LABS[LABS.length - 1]; L.pf = pf; L.tf = tf; }
    slab("hammer: felt head", function () { var K = SK(); return v3(K.xa, YS + K.hH / 2, K.zf + K.hD * 0.3); }, 0.2, "r");
    slab("shank", function () { var K = SK(); return v3(K.xa, 92.5, Z_SH); }, 0.3, "r");
    slab("butt", function () { var K = SK(); return v3(K.xa, Y_PIV + 1, Z_SH + 1.6); }, 0.35, "r");
    slab("wippen", function () { var K = SK(); return v3(K.xa, 75.3, -35.6); }, 0.22, "r");
    slab("jack", function () { var K = SK(); return v3(K.xa, 81, -38.3); }, 0.42, "l");
    slab("key lever", function () { var K = SK(); return v3(K.xa + (K.kx - K.xa) * 0.4, 72.4, -30); }, 0.45, "r");
    slab("damper", function () { var K = SK(); return K.damped ? v3(K.Cx, K.Cy, K.zs + 2.0) : v3(K.xa, YD, K.zs + 1); }, 0.25, "l", function () { return SK().damped ? "damper" : "no damper on this key"; });
    slab("damper lever", function () { var K = SK(); return v3(K.xa, 84, -40.6); }, 0.5, "l");
    slab("strings", function () { var K = SK(); return v3(K.Tx + K.ux * K.L * 0.3, K.Ty + K.uy * K.L * 0.3, K.zs); }, 0.28, "l", function () { var K = SK(); return nm(K.m) + ": " + (K.ns === 1 ? "1 string" : K.ns + " strings"); });
    lab("wound bass strings, crossing over the others", v3(K12.Tx + K12.ux * K12.L * 0.8, K12.Ty + K12.uy * K12.L * 0.8, Z_B), 3, null, "r", "wound bass strings");
    var K68 = KEYS[60]; lab("steel strings, 3 per note", v3(K68.Tx + K68.ux * K68.L * 0.3, K68.Ty + K68.uy * K68.L * 0.3, Z_T), 4, null, "r", "strings");
    lab("soft", v3(PEDX.soft - 1.5, 6.4, 6.6), 1.5, null, "l"); lab("mute", v3(PEDX.mute, 5.2, 6.8), 1.6, null, "b"); lab("sustain", v3(PEDX.sus + 1.5, 6.4, 6.6), 1.7, null, "r");
    lab("iron plate", v3(46, 20, -49), 5);
    lab("soundboard", v3(-48, 30, -52.4), 6);
    lab("tuning pins", v3(18, 115.5, -44.6), 7);
    lab("treble bridge", v3(tre[20].Bx, tre[20].By, Z_T), 8);
    lab("bass bridge", v3(bb1.Bx, bb1.By, Z_B), 9, null, "r");
    lab("keys", v3(28, KEY_TOP, -3), 10);
    lab("hammer rail", v3(-56, 91.6, Z_SH + 1.2), 11, noSec);
    slab("hammer rail", function () { var K = SK(); return v3(K.xa - 3, 91.6, Z_SH + 1.2 - softS * ALPHA_SOFT * 5.6); }, 0.6, "l");
    slab("damper lift rail", function () { var K = SK(); return v3(K.xa - 3, 82.0, -41.6 + 0.35 * susS); }, 0.7, "l");
    lab("fallboard", v3(-38, 85.5, -17.4), 12);
    lab("pressure bar", v3(tre[30].Tx, tre[30].Ty + 0.4, Z_T + 1), 13);
    var K0 = KEYS[0]; lab("hitch pins", v3(K0.Bx + K0.ux * 3, K0.By + K0.uy * 3, -46.8), 7.5, null, "l");
    lab("trapwork", v3(-20, 40, -43.6), 15);
    lab("no dampers on the top 20 keys", v3(K75.xa, 95, K75.zs + 1), 16, null, "r", "no dampers here");
    lab("practice-mute felt", v3(30, 0, Z_T + 1.8), 0.5, function () { return muteG.position.y < MUTE_UP - 2; });
    LABS[LABS.length - 1].follow = muteG;
    var tmpV = new T.Vector3(), occRay = new T.Raycaster(), occP = new T.Vector3(), occluders = cab.concat([plate, sb, pb]);
    function occluded(L) {   // hide a label whose point is behind the case, the keybed, the plate or the soundboard
      occP.copy(L.pf ? L.pf() : L.p); if (L.follow) occP.y += L.follow.position.y;
      var dir = occP.clone().sub(camera.position), dist = dir.length(); occRay.set(camera.position, dir.normalize()); occRay.far = dist - 1.5;
      return occRay.intersectObjects(MAT.lacq.opacity < 0.95 ? occluders.slice(cab.length) : occluders, false).length > 0;
    }
    function placeLabels() {
      var w = cv.clientWidth, h = cv.clientHeight, boxes = [], narrow = w < 560;
      if (narrow !== placeLabels.narrow) { placeLabels.narrow = narrow; LABS.forEach(function (L) { L.el.textContent = narrow && L.short ? L.short : L.text; L.w = 0; }); }
      LABS.sort(function (a, b) { return a.pri - b.pri; });
      LABS.forEach(function (L) {
        var ok = showLabels && (!L.cond || L.cond()) && (!narrow || L.pri < 5 || L.pri === 10);
        if (ok) {
          if (L.tf) { var tx = L.tf(); if (tx !== L.el.textContent) { L.el.textContent = tx; L.w = 0; } }
          tmpV.copy(L.pf ? L.pf() : L.p); if (L.follow) tmpV.y += L.follow.position.y;
          tmpV.project(camera);
          ok = tmpV.z < 1 && Math.abs(tmpV.x) < 1.02 && Math.abs(tmpV.y) < 1.02;
        }
        if (ok) {
          if (!L.w) { L.el.style.display = "block"; L.w = L.el.offsetWidth; L.h = L.el.offsetHeight; }
          var sx = (tmpV.x + 1) / 2 * w, sy = (1 - tmpV.y) / 2 * h, side = L.side || "r";
          if (side === "r" && sx + 10 + L.w > w - 4) side = "l"; if (side === "l" && sx - 10 - L.w < 4) side = "r";
          var x = side === "r" ? sx + 10 : side === "l" ? sx - 10 - L.w : sx - L.w / 2, y = side === "b" ? sy + 8 : sy - L.h / 2;
          var bx = { x0: x - 3, x1: x + L.w + 3, y0: y - 2, y1: y + L.h + 2 };
          if (x < 2 || x + L.w > w - 2 || y < 42 && x + L.w > w - 270 || y < 2 || y + L.h > h - 2) ok = false;
          for (var k = 0; ok && k < boxes.length; k++) { var o = boxes[k]; if (bx.x0 < o.x1 && bx.x1 > o.x0 && bx.y0 < o.y1 && bx.y1 > o.y0) ok = false; }
          if (ok && occluded(L)) ok = false;
          if (ok) { boxes.push(bx); L.el.className = side; L.el.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px)"; }
        }
        L.el.style.display = ok ? "block" : "none";
      });
    }

    // ---------- camera: fit the whole piano at any window shape; close-ups ----------
    var BOXC = [], CENTER = v3(0, 61, -27), DIR = v3(0.40, 0.33, 0.855).normalize();
    [-76, 76].forEach(function (x) { [0, 122].forEach(function (y) { [-61, 8].forEach(function (z) { BOXC.push(v3(x, y, z)); }); }); });
    function sizeRenderer() {
      var w = cv.clientWidth, h = cv.clientHeight; if (!w || !h) return false;
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.updateProjectionMatrix(); return true;
    }
    function fitDistance(target, dir) {
      var lo = 50, hi = 3000, cam = camera.clone();
      for (var it = 0; it < 30; it++) {
        var mid = (lo + hi) / 2; cam.position.copy(target).addScaledVector(dir, mid); cam.lookAt(target); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
        var topM = cam.aspect > 1.3 ? 0.9 : 0.8, fits = BOXC.every(function (c) { tmpV.copy(c).project(cam); return Math.abs(tmpV.x) < 0.95 && tmpV.y < topM && tmpV.y > -0.95; });
        if (fits) hi = mid; else lo = mid;
      }
      return hi;
    }
    var tween = null, userMoved = false;
    function goTo(target, pos, dur) { tween = { t0: performance.now(), dur: dur == null ? 700 : dur, p0: camera.position.clone(), q0: controls.target.clone(), p1: pos, q1: target }; kick(); }
    function homeView(animate) {
      var d = fitDistance(CENTER, DIR), pos = CENTER.clone().addScaledVector(DIR, d);
      controls.maxDistance = Math.max(900, d * 1.6); userMoved = false;
      if (animate) goTo(CENTER.clone(), pos, 600); else { tween = null; camera.position.copy(pos); controls.target.copy(CENTER); controls.update(); }
    }
    function closeUp(target, dist, forceDir) {
      var dir = userMoved ? camera.position.clone().sub(controls.target).normalize() : v3(0.72, 0.4, 0.56).normalize();
      if (dir.z < 0.2 || dir.y < 0.05) dir = v3(0.72, 0.4, 0.56).normalize();
      if (forceDir) dir = forceDir.clone().normalize();
      var d = Math.min(dist, camera.position.distanceTo(controls.target));
      goTo(target, target.clone().addScaledVector(dir, Math.max(dist * 0.85, d)), 650); userMoved = true;
    }
    function keyFocus(i) { var K = KEYS[i]; return v3(K.xa, 89, -41); }
    var section = -1, cutHint = false;
    function setSection(i, side) {
      section = i;
      KEYS.forEach(function (K, j) {
        var cut = i >= 0 && (side > 0 ? j > i && j <= i + 40 : j < i && j >= i - 40);
        if (cut !== !!K.cut) { K.cut = cut; K.moving = true; }
      });
      kick();
    }
    function sectionAt(i, dist) {
      var dir = userMoved ? camera.position.clone().sub(controls.target).normalize() : v3(0.8, 0.3, 0.52).normalize();
      if (Math.abs(dir.x) < 0.35 || dir.z < 0.1 || dir.y < 0.02) dir = v3(dir.x < 0 ? -0.8 : 0.8, 0.3, 0.52).normalize();
      closeUp(keyFocus(i), dist, dir); setSection(i, dir.x);
      if (!cutHint) { cutHint = true; showHint("Close-up: the action of the keys between you and " + nm(KEYS[i].m) + " is cut away."); }
    }
    var follow = false, followBtn = $("apFollow");
    followBtn.addEventListener("click", function () {
      follow = !follow; followBtn.setAttribute("aria-pressed", follow ? "true" : "false");
      if (follow) sectionAt(sel, camera.aspect < 1 ? 80 : 58); else { setSection(-1); homeView(true); }
    });
    listeners.push(function (i) { if (follow && i >= 0 && KEYS[i].held) sectionAt(i, camera.aspect < 1 ? 80 : 58); });
    $("apReset").addEventListener("click", function () { if (follow) { follow = false; followBtn.setAttribute("aria-pressed", "false"); } setSection(-1); homeView(true); });
    var labBtn = $("apLabelsBtn");
    labBtn.addEventListener("click", function () { showLabels = !showLabels; labBtn.setAttribute("aria-pressed", showLabels ? "true" : "false"); kick(); });
    var grabbing = false;
    controls.addEventListener("start", function () { tween = null; grabbing = true; });
    controls.addEventListener("end", function () { grabbing = false; if (section >= 0 && !follow && camera.position.distanceTo(controls.target) > 160) setSection(-1); });
    controls.addEventListener("change", function () { if (grabbing && controls.enabled) userMoved = true; kick(); });

    // ---------- picking: keys and pedals; double-click zooms ----------
    var ray = new T.Raycaster(), ndc = new T.Vector2(), pickKeys = [wFront, wBack, bKeys];
    function setRay(cx, cy) { var r = cv.getBoundingClientRect(); ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera); }
    function pick(cx, cy) {
      setRay(cx, cy);
      var hit = ray.intersectObjects(pickKeys.concat(pedPick), false)[0]; if (!hit) return null;
      if (hit.object.userData.pedal) return { pedal: hit.object.userData.pedal, point: hit.point };
      var list = hit.object === bKeys ? blacks : whites; return { key: list[hit.instanceId].i, point: hit.point };
    }
    var hint = $("apHint"), hintT = 0;
    function showHint(txt) { hint.textContent = txt; hint.hidden = false; clearTimeout(hintT); hintT = setTimeout(function () { hint.hidden = true; }, 2200); }
    var down = {}, nTouch = 0, lastTap = { t: 0, i: -1 };
    function startKey(id, i) { down[id] = { i: i }; strike(i); }
    cv.addEventListener("pointerdown", function (e) {
      if (e.pointerType === "touch") {
        nTouch++;
        if (nTouch > 1) { Object.keys(down).forEach(function (id) { var st = down[id]; clearTimeout(st.timer); if (st.fired !== false) release(st.i); delete down[id]; }); return; }
      }
      var u = pick(e.clientX, e.clientY); if (!u) return;
      if (u.pedal) { setPed(u.pedal, !ped[u.pedal]); return; }
      controls.enabled = false;
      if (e.pointerType === "touch") {
        var now = performance.now();
        if (now - lastTap.t < 330 && lastTap.i === u.key) sectionAt(u.key, camera.aspect < 1 ? 80 : 58);
        lastTap = { t: now, i: u.key };
        var st = { i: u.key, fired: false, x: e.clientX, y: e.clientY }; down[e.pointerId] = st;
        st.timer = setTimeout(function () { st.fired = performance.now(); strike(st.i); }, 80);
        return;
      }
      cv.setPointerCapture(e.pointerId); startKey(e.pointerId, u.key);
    });
    cv.addEventListener("pointermove", function (e) {
      var st = down[e.pointerId];
      if (!st) { if (e.pointerType === "mouse" && !e.buttons) { var u0 = pick(e.clientX, e.clientY); cv.classList.toggle("on-key", !!u0); } return; }
      if (e.pointerType === "touch") { if (!st.fired && Math.hypot(e.clientX - st.x, e.clientY - st.y) > 8) { clearTimeout(st.timer); delete down[e.pointerId]; controls.enabled = true; } return; }
      var u = pick(e.clientX, e.clientY), i = u && u.key != null ? u.key : -1;
      if (i !== st.i) { if (st.i >= 0) release(st.i); if (i >= 0) strike(i); st.i = i; }
    });
    function up(e) {
      if (e.pointerType === "touch") nTouch = Math.max(0, nTouch - 1);
      var st = down[e.pointerId]; delete down[e.pointerId]; controls.enabled = true; if (!st) return;
      if (st.fired === false) { clearTimeout(st.timer); if (e.type === "pointerup") { strike(st.i); var ii = st.i; setTimeout(function () { release(ii); }, 140); } return; }
      if (st.i >= 0) { if (e.type === "pointercancel" && st.fired !== true && performance.now() - st.fired < 400) cancelNote(st.i); else release(st.i); }
    }
    cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    cv.addEventListener("dblclick", function (e) {
      var u = pick(e.clientX, e.clientY);
      if (u && u.key != null) { sectionAt(u.key, 58); return; }
      if (section >= 0) setSection(-1);
      if (u && u.pedal) { closeUp(v3(0, 14, -10), 95); return; }
      setRay(e.clientX, e.clientY); var hit = ray.intersectObjects(pickSolid, false)[0];
      if (hit) closeUp(hit.point.clone(), 70);
    });
    // page scrolling keeps working: one finger on a phone scrolls the page, two fingers turn and zoom;
    // the mouse wheel zooms only with Ctrl/Cmd held or after a click on the piano
    var armed = false;
    function gate(e) { if (e.touches.length < 2) e.stopPropagation(); }
    stage.addEventListener("touchstart", function (e) { if (e.touches.length < 2 && !gate.told) { gate.told = true; showHint("Two fingers turn and zoom the piano; one finger plays and scrolls."); } gate(e); }, { capture: true, passive: true });
    stage.addEventListener("touchmove", gate, { capture: true, passive: true });
    stage.addEventListener("wheel", function (e) { if (e.ctrlKey || e.metaKey || armed) return; e.stopPropagation(); showHint("Hold Ctrl (or ⌘) and scroll to zoom, or click the piano first."); }, { capture: true, passive: true });
    cv.addEventListener("pointerdown", function (e) { if (e.pointerType === "mouse") armed = true; });
    stage.addEventListener("pointerleave", function () { armed = false; });

    // ---------- per-frame motion ----------
    var mA = new T.Matrix4(), mB = new T.Matrix4(), mC = new T.Matrix4(), dirty = {};
    function turn(parts, pivot, angle, hide) {
      mA.makeTranslation(pivot.x, pivot.y, pivot.z); mB.makeRotationX(angle); mA.multiply(mB); mB.makeTranslation(-pivot.x, -pivot.y, -pivot.z); mA.multiply(mB);
      parts.forEach(function (p) { if (hide) mC.copy(ZERO); else mC.multiplyMatrices(mA, p.rest); p.im.setMatrixAt(p.k, mC); dirty[p.im.uuid] = p.im; });
    }
    function lift(parts, dy, hide) { parts.forEach(function (p) { if (hide) mC.copy(ZERO); else mC.makeTranslation(0, dy, 0).multiply(p.rest); p.im.setMatrixAt(p.k, mC); dirty[p.im.uuid] = p.im; }); }
    var softS = 0, muteS = 0, susS = 0, keyPivot = v3(0, KEY_PIVOT_Y, KEY_PIVOT_Z), lastSel = -1;
    var ALPHA_SOFT = (BLOW / 2) / SHANK;
    function frame3D(t) {
      var busy = false, k;
      function ease(cur, target, rate) { var nx = cur + (target - cur) * rate; if (Math.abs(target - nx) < 1e-3) nx = target; if (nx !== cur) busy = true; return nx; }
      softS = ease(softS, ped.soft ? 1 : 0, 0.18); muteS = ease(muteS, ped.mute ? 1 : 0, 0.15); susS = ease(susS, ped.sus ? 1 : 0, 0.25);
      ["soft", "mute", "sus"].forEach(function (n) {
        var P = pedObj[n], a = ease(P.a, ped[n] ? 1 : 0, 0.25); if (a === P.a) return; P.a = a;
        P.g.rotation.x = 0.18 * a; var rise = 3.2 * a; P.pm.emissive.setHex(0x2e4bb0); P.pm.emissiveIntensity = 0.9 * a;
        var tint = n === "soft" ? [MAT.mold, MAT.felt, MAT.underfelt, hamRailMat] : n === "mute" ? [] : [MAT.dblock, MAT.dfelt, MAT.dwire, MAT.dlever, liftRailMat];
        tint.forEach(function (m) { m.emissive.setHex(0x3a5cff); m.emissiveIntensity = 1.1 * a; }); P.dowel.position.y = P.dy0 + rise; P.trap.position.y = P.ty0 + rise; P.rod.position.y = P.ry0 + rise;
      });
      hamRail.position.z = (Z_SH + 0.91) - softS * ALPHA_SOFT * 5.6; hamRailFelt.position.z = Z_SH + 0.375 - softS * ALPHA_SOFT * 5.6;
      liftRail.position.z = -42.1 + 0.35 * susS;
      muteG.position.y = MUTE_UP + (MUTE_DN - MUTE_UP) * muteS; muteRocker.rotation.z = 0.25 * pedObj.mute.a;
      var anyColor = false;
      for (k = 0; k < N; k++) {
        var K = KEYS[k], dip = ease(K.dip, K.held ? 1 : 0, 0.4);
        var lf = hammerLift(K, t), aRest = softS * ALPHA_SOFT;
        var reach = muteS > 0.5 ? BLOW - 1.85 : BLOW;
        var ham = aRest + Math.max(0, lf) * Math.max(0, reach / SHANK - aRest);
        var dl = K.damped ? ease(K.dlift, (K.held || ped.sus) ? 1 : 0, 0.3) : 0;
        if (dip !== K.dip || K.moving) { K.dip = dip; turn(K.keyParts, keyPivot, DIP * dip); lift(K.wipParts, DIP * dip * 13.8, K.cut); }
        if (ham !== K.ham || K.moving) { K.ham = ham; turn(K.hamParts, K.hPivot, -ham, K.cut); if (t - K.hitT < 0.6) busy = true; }
        if (K.damped && (dl !== K.dlift || K.moving)) { K.dlift = dl; turn(K.dmpParts, K.dPivot, 0.075 * dl, K.cut); }
        K.moving = false;
        // vibrating strings
        var e = energy(K, t);
        if (e > 0.006) { takeTubes(K); if (K.tubes) { drawTubes(K, t); busy = true; } }
        else if (K.tubes) giveBack(K);
        var hl = K.held || (k === sel && e > 0.006);
        if (hl !== K.hl) { K.hl = hl; anyColor = true; if (K.black) bKeys.setColorAt(K.bi, hl ? HI_B : EBONY); else { wFront.setColorAt(K.wi, hl ? HI_W : IVORY); wBack.setColorAt(K.wi, hl ? HI_W : IVORY); } }
      }
      if (anyColor) { wFront.instanceColor.needsUpdate = true; wBack.instanceColor.needsUpdate = true; bKeys.instanceColor.needsUpdate = true; busy = true; }
      for (k in dirty) { dirty[k].instanceMatrix.needsUpdate = true; busy = true; } dirty = {};
      return busy;
    }

    // ---------- loop pieces handed back to the shared loop ----------
    var ro = window.ResizeObserver ? new ResizeObserver(function () { if (sizeRenderer()) { if (!userMoved && !follow) homeView(false); kick(); } }) : null;
    if (ro) ro.observe(cv); else window.addEventListener("resize", function () { if (sizeRenderer()) { if (!userMoved && !follow) homeView(false); kick(); } });
    sizeRenderer(); homeView(false);
    view = {
      frame: function (t, now) {
        var a0 = performance.now(), busy = frame3D(t);
        if (tween) {
          var s = Math.min(1, (now - tween.t0) / tween.dur), e = s < 0.5 ? 2 * s * s : 1 - Math.pow(-2 * s + 2, 2) / 2;
          camera.position.lerpVectors(tween.p0, tween.p1, e); controls.target.lerpVectors(tween.q0, tween.q1, e);
          if (s >= 1) tween = null; busy = true;
        }
        var moved = controls.update();
        var dcam = camera.position.distanceTo(controls.target), op = Math.max(0.18, Math.min(1, (dcam - 70) / 90));
        if (Math.abs(op - MAT.lacq.opacity) > 0.01) { MAT.lacq.opacity = op; MAT.lacq.depthWrite = op > 0.99; busy = true; }
        var a1 = performance.now();
        if (busy || moved || view.force) { renderer.render(scene, camera); var a2 = performance.now(); placeLabels(); view.force = false; stats.upd += a1 - a0; stats.render += a2 - a1; stats.labels += performance.now() - a2; return true; }
        return false;
      },
      force: true,
      screenOf: function (p) { tmpV.copy(p).project(camera); var r = cv.getBoundingClientRect(); return { x: r.left + (tmpV.x + 1) / 2 * r.width, y: r.top + (1 - tmpV.y) / 2 * r.height }; },
      keyPoint: function (i) { var K = KEYS[i]; return K.black ? v3(K.kx, 74.2, -9) : v3(K.kx, KEY_TOP, -2.5); },
      pedalPoint: function (n) { return v3(PEDX[n], 6.5, 3); },
      section: function (i, d) { sectionAt(i, d || 58); }, closeUp: function (p, d, dir) { closeUp(p, d, dir); }, home: function () { homeView(false); }, keyFocus: keyFocus, v3: v3,
      info: function () { return { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries }; }
    };
  })();

  // ===================================================================================================
  // 7. One loop for everything; it idles when nothing moves or the piece is off screen
  // ===================================================================================================
  var chipF = $("apChipF"), chipD = $("apChipD"), stats = { frames: 0, work: 0, max: 0, rendered: 0, gaps: [], upd: 0, render: 0, labels: 0, graphs: 0 }, lastNow = 0, needs = true, graphsIdleAt = -1;
  window.__apStats = stats; var frozenT = null;
  function kick() { needs = true; if (view) view.force = true; }
  window.addEventListener("resize", function () { kick(); });
  C.onTheme(kick);
  function loop(now) {
    requestAnimationFrame(loop);
    if (!inView) { lastNow = 0; return; }
    var w0 = performance.now(), t = frozenT != null ? frozenT : now / 1000, did = false;
    if (view && view.frame(t, now)) { did = true; stats.rendered++; }
    var w1 = performance.now();
    var K = KEYS[sel], live = energy(K, t) > 0.002 || t - K.hitT < 0.6 || now - lastChange < 700;
    if (live || needs) { drawWave(t); drawModes(t); did = true; needs = false; stats.graphs += performance.now() - w1; }
    var forcing = false, damping = false;
    KEYS.forEach(function (O) { if (t - O.hitT < 0.08) forcing = true; if (O.damped && !O.held && !ped.sus && energy(O, t) > 0.006) damping = true; });
    chipF.classList.toggle("on", forcing); chipF.classList.toggle("mod", ped.soft || ped.mute);
    chipD.classList.toggle("on", damping); chipD.classList.toggle("off", ped.sus);
    if (did) {
      var w = performance.now() - w0; stats.frames++; stats.work += w; stats.max = Math.max(stats.max, w);
      if (lastNow) { stats.gaps.push(now - lastNow); if (stats.gaps.length > 600) stats.gaps.shift(); }
      lastNow = now;
    } else lastNow = 0;
  }
  layoutStrip(); scrollStripTo(39, true);
  window.addEventListener("resize", function () { layoutStrip(); });
  requestAnimationFrame(loop);
  window.__apiano = { hitT: function (i) { return KEYS[i].hitT; }, freeze: function (t) { frozenT = t; kick(); }, strike: strike, release: release, setPed: setPed, ped: ped, keys: KEYS, view: function () { return view; }, sel: function () { return sel; } };
})();
