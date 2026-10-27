/* "Two clocks": diffusion time of a particle vs the contact time of each brew method. Needs model.js (global Grind). */
(function () {
  "use strict";
  const root = document.getElementById("clocks");
  if (!root || !window.Grind) return;
  const G = window.Grind;
  const $ = (s) => root.querySelector(s);
  const cv = $("#clockCanvas"), cx = cv.getContext("2d");
  const dIn = $("#dSize"), dOut = $("#dSizeOut"), sync = $("#syncGrinder"), tbody = $("#verdict tbody");
  const D0 = 100, D1 = 2000, T0 = 5, T1 = 1800;
  let d = 650;

  const fmtT = (t) => { if (t < 90) return Math.round(t) + " s"; if (t >= 600) return Math.round(t / 60) + " min"; const m = Math.floor(t / 60), sec = Math.round(t - 60 * m); return m + ":" + String(sec).padStart(2, "0") + " min"; };
  const tickT = { 10: "10 s", 30: "30 s", 60: "1 min", 180: "3 min", 600: "10 min", 1800: "30 min" };
  const fmtD = (u) => u >= 1000 ? (u / 1000).toFixed(2) + " mm" : Math.round(u) + " µm";
  function sliderToD(v) { return Math.exp(Math.log(D0) + (Math.log(D1) - Math.log(D0)) * v / 1000); }
  function dToSlider(x) { return Math.round(1000 * (Math.log(x) - Math.log(D0)) / (Math.log(D1) - Math.log(D0))); }

  function draw() {
    const w = cv.clientWidth, h = Math.max(260, Math.round(w * 0.55)), dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.height = h + "px"; }
    cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, w, h);
    const L = 50, R = 10, T = 10, B = 34;
    const X = (u) => L + (Math.log(u) - Math.log(D0)) / (Math.log(D1) - Math.log(D0)) * (w - L - R);
    const Y = (t) => h - B - (Math.log(t) - Math.log(T0)) / (Math.log(T1) - Math.log(T0)) * (h - T - B);
    // grid
    cx.strokeStyle = "#e3e6df"; cx.lineWidth = 1; cx.fillStyle = "#586070"; cx.font = "11px IBM Plex Mono, ui-monospace, monospace";
    cx.textAlign = "center"; cx.textBaseline = "top";
    [[100, "100 µm"], [200, "200 µm"], [500, "500 µm"], [1000, "1 mm"], [2000, "2 mm"]].forEach(([u, lab]) => { const x = X(u); cx.beginPath(); cx.moveTo(x, T); cx.lineTo(x, h - B); cx.stroke(); if (w > 520 || u !== 200) cx.fillText(lab, Math.min(w - 16, x), h - B + 5); });
    cx.textAlign = "right"; cx.textBaseline = "middle";
    [10, 30, 60, 180, 600, 1800].forEach((t) => { const y = Y(t); cx.beginPath(); cx.moveTo(L, y); cx.lineTo(w - R, y); cx.stroke(); cx.fillText(tickT[t], L - 5, y); });
    cx.textAlign = "center"; cx.textBaseline = "alphabetic"; cx.font = "11px IBM Plex Sans Condensed, Arial Narrow, sans-serif";
    cx.fillText("particle size (log scale)", (L + w - R) / 2, h - 4);
    // brew rectangles: size range (Honest Coffee Guide) x contact time
    G.BREWS.forEach((b) => {
      const x0 = X(b.lo), x1 = X(b.hi), y0 = Y(b.t1), y1 = Y(b.t0);
      cx.globalAlpha = 0.22; cx.fillStyle = b.color; cx.fillRect(x0, y0 - 2, x1 - x0, Math.max(5, y1 - y0) + 2);
      cx.globalAlpha = 1; cx.strokeStyle = b.color; cx.lineWidth = 1.2; cx.strokeRect(x0, y0 - 2, x1 - x0, Math.max(5, y1 - y0) + 2);
      cx.fillStyle = b.color; cx.textAlign = "left"; cx.font = "11px IBM Plex Sans Condensed, Arial Narrow, sans-serif";
      const lab = b.name + (b.rough ? " (time rough)" : "");
      const lw = cx.measureText(lab).width;
      cx.fillText(lab, Math.min(w - R - lw - 2, x0 + 3), y0 - 6);
      // where the diffusion line crosses this method's contact time
      const tm = b.t, ds = G.sizeForTime(tm);
      cx.beginPath(); cx.arc(X(ds), Y(tm), 3.2, 0, 2 * Math.PI); cx.fill();
    });
    // diffusion clock: tau = 25 s (d / 250 um)^2
    cx.save(); cx.beginPath(); cx.rect(L, T, w - L - R, h - T - B); cx.clip();
    cx.strokeStyle = "#1c2230"; cx.lineWidth = 2; cx.beginPath();
    for (let k = 0; k <= 120; k++) { const u = Math.exp(Math.log(D0) + (Math.log(D1) - Math.log(D0)) * k / 120), t = G.tauSec(u); const x = X(u), y = Y(t); k ? cx.lineTo(x, y) : cx.moveTo(x, y); }
    cx.stroke(); cx.restore();
    cx.save(); cx.translate(X(1800), Y(G.tauSec(1800))); cx.rotate(-Math.atan2(Y(G.tauSec(1000)) - Y(G.tauSec(2000)), X(2000) - X(1000)));
    cx.fillStyle = "#1c2230"; cx.textAlign = "right"; cx.font = "11px IBM Plex Sans Condensed, Arial Narrow, sans-serif"; cx.fillText("diffusion time ∝ size²", -4, -6); cx.restore();
    // cursor
    const xd = X(d), td = G.tauSec(d);
    cx.strokeStyle = "#2e7d6b"; cx.setLineDash([4, 3]); cx.lineWidth = 1.2; cx.beginPath(); cx.moveTo(xd, T); cx.lineTo(xd, h - B); cx.stroke(); cx.setLineDash([]);
    cx.fillStyle = "#2e7d6b"; cx.beginPath(); cx.arc(xd, Y(Math.min(T1, Math.max(T0, td))), 4.5, 0, 2 * Math.PI); cx.fill();
    cx.font = "11px IBM Plex Mono, ui-monospace, monospace"; cx.textAlign = xd > w * 0.7 ? "right" : "left";
    cx.fillText(fmtD(d) + ": " + fmtT(td), xd + (xd > w * 0.7 ? -7 : 7), T + 10);
    cx.textAlign = "left";
  }
  function table() {
    const td = G.tauSec(d);
    tbody.innerHTML = G.BREWS.map((b) => {
      const T = b.t, r = T / td;
      const tag = r < 0.6 ? '<span class="tag under">too short (sour)</span>'
        : r > 1.7 ? '<span class="tag over">too long (bitter)</span>'
        : '<span class="tag ok">about matched</span>';
      return "<tr><td>" + b.name + "</td><td class=\"num\">" + fmtT(T) + (b.rough ? "*" : "") + "</td><td class=\"num\">" + r.toFixed(1) + "</td><td>" + tag + "</td></tr>";
    }).join("");
  }
  function set(x) { d = Math.min(D1, Math.max(D0, x)); dIn.value = dToSlider(d); dOut.textContent = fmtD(d); draw(); table(); }
  dIn.addEventListener("input", () => { sync.checked = false; set(sliderToD(+dIn.value)); });
  let drag = false;
  const fromPointer = (e) => { const r = cv.getBoundingClientRect(), L = 50, R = 10, f = (e.clientX - r.left - L) / (r.width - L - R); sync.checked = false; set(Math.exp(Math.log(D0) + f * (Math.log(D1) - Math.log(D0)))); };
  cv.addEventListener("pointerdown", (e) => { drag = true; cv.setPointerCapture(e.pointerId); fromPointer(e); });
  cv.addEventListener("pointermove", (e) => { if (drag) fromPointer(e); });
  cv.addEventListener("pointerup", () => { drag = false; }); cv.addEventListener("pointercancel", () => { drag = false; });
  document.addEventListener("grind:setting", (e) => { if (sync.checked) set(e.detail.mainUm); });
  sync.addEventListener("change", () => { if (sync.checked && window.__grinder) { const s = window.__grinder.state; set(G.mainPeakUm(G.gapUm(s.n, s.theta))); } });
  if ("ResizeObserver" in window) new ResizeObserver(draw).observe(root);
  window.addEventListener("resize", draw);
  const s0 = window.__grinder ? window.__grinder.state : null;
  set(s0 ? G.mainPeakUm(G.gapUm(s0.n, s0.theta)) : d);
  window.__clocks = { set };
})();
