/* Shared model for the grinder figures. Every number here is explained (and sourced) in index.qmd.
   Modelling choices are marked MODEL; manufacturer or published numbers are marked SOURCE. */
(function () {
  "use strict";
  const STEP_UM = 1000 / 30; // SOURCE: KINGrinder P0, 0.0333 mm per click, 30 clicks per turn (1 mm per turn)

  // SOURCE (sizes): Honest Coffee Guide grind-size chart, ranges "where most grounds should fall".
  // SOURCE (times): espresso 25 ± 5 s (INEI, via Wikipedia "Espresso"); pour-over 3:00-3:30 (Coava V60 recipe);
  //                 French press 4 min steep (Seattle Coffee Gear, Bodum guide). MODEL: moka 1-2 min, rough.
  const BREWS = [
    { key: "espresso", name: "Espresso", lo: 180, hi: 380, t: 25, t0: 20, t1: 30, how: "9 bar pump", color: "#6b3e26" },
    { key: "moka", name: "Moka pot", lo: 360, hi: 660, t: 90, t0: 60, t1: 120, how: "1–2 bar steam", color: "#a8662f", rough: true },
    { key: "pour", name: "Pour-over", lo: 410, hi: 930, t: 195, t0: 180, t1: 210, how: "gravity", color: "#2e7d6b" },
    { key: "press", name: "French press", lo: 690, hi: 1300, t: 240, t0: 236, t1: 244, how: "steep, then mesh", color: "#4a5fb0" },
  ];

  // Exit gap (perpendicular distance between the cutting surfaces) after n clicks from zero,
  // for surfaces slanted at theta (degrees) to the shaft: g = n * STEP * sin(theta).  (derived in the post)
  function gapUm(n, thetaDeg) { return n * STEP_UM * Math.sin(thetaDeg * Math.PI / 180); }

  // MODEL: volume-weighted size distribution, as a density over u = ln(size / um).
  // Fines peak fixed at 38 um (fines are cell fragments; cells are 25-50 um, Mo et al. 2023).
  // Main peak centred on the gap (a modelling choice), log-width 0.38.
  // Fines volume share ~ 1 / gap, pinned at 29% for a 250 um espresso grind (Mo et al. 2023, Type E).
  const FINES_UM = 38, FINES_SD = 0.42, MAIN_SD = 0.38;
  function mainPeakUm(g) { return Math.max(g, 20); }
  function finesShare(g) { return Math.min(0.45, Math.max(0.05, 0.29 * 250 / mainPeakUm(g))); }
  function gauss(u, m, s) { const z = (u - m) / s; return Math.exp(-0.5 * z * z) / (s * Math.sqrt(2 * Math.PI)); }
  function density(u, g) {
    const w = finesShare(g);
    return w * gauss(u, Math.log(FINES_UM), FINES_SD) + (1 - w) * gauss(u, Math.log(mainPeakUm(g)), MAIN_SD);
  }
  function randn() { let a = 0, b = 0; while (a === 0) a = Math.random(); b = Math.random(); return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b); }
  // Draw one size (um). Each draw stands for an equal VOLUME of coffee.
  function sample(g) {
    const fines = Math.random() < finesShare(g);
    const m = fines ? Math.log(FINES_UM) : Math.log(mainPeakUm(g));
    return { um: Math.exp(m + (fines ? FINES_SD : MAIN_SD) * randn()), fines };
  }
  function brewsFor(um) { return BREWS.filter(b => um >= b.lo && um <= b.hi); }

  // Two clocks. MODEL: diffusion time tau(d) = 25 s * (d / 250 um)^2, anchored at espresso.
  const ANCHOR_D = 250, ANCHOR_T = 25;
  function tauSec(d) { return ANCHOR_T * (d / ANCHOR_D) * (d / ANCHOR_D); }
  function sizeForTime(t) { return ANCHOR_D * Math.sqrt(t / ANCHOR_T); }

  window.Grind = { STEP_UM, BREWS, gapUm, mainPeakUm, finesShare, density, sample, brewsFor, tauSec, sizeForTime, FINES_UM };
})();
