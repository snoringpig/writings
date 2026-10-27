"""Recompute every number used in posts/coffee-grinder/index.qmd.

Run: python3 numbers.py
"""
import math

# 1. KINGrinder P0 adjustment (manufacturer: 0.0333 mm per click, 30 clicks per turn)
step_um = 1000 / 30                      # axial travel per click, micrometres
print(f"axial step per click      = {step_um:.2f} um  (1 mm thread / 30 clicks)")

# 2. Gap growth per click for a few cone angles theta (angle between cutting surface and shaft)
for th in (10, 15, 19, 25, 30, 40):
    print(f"theta = {th:2d} deg  -> gap per click = {step_um*math.sin(math.radians(th)):5.1f} um,"
          f" radial gap per click = {step_um*math.tan(math.radians(th)):5.1f} um")

# 3. Slope implied by Honest Coffee Guide: P0 click ranges vs its micron ranges
pairs = {  # method: ((click lo, click hi), (um lo, um hi))
    "espresso":     ((17, 35),  (180, 380)),
    "moka":         ((34, 61),  (360, 660)),
    "pour over":    ((39, 86),  (410, 930)),
    "French press": ((65, 120), (690, 1300)),
}
slopes = []
for m, ((c0, c1), (u0, u1)) in pairs.items():
    s0, s1 = u0 / c0, u1 / c1
    slopes += [s0, s1]
    print(f"{m:13s} um/click at ends: {s0:5.1f}, {s1:5.1f}")
mean_slope = sum(slopes) / len(slopes)
theta_fit = math.degrees(math.asin(mean_slope / step_um))
print(f"mean implied slope = {mean_slope:.2f} um/click -> sin(theta) = {mean_slope/step_um:.3f}, theta = {theta_fit:.1f} deg")

# 4. Diffusion scaling anchored at espresso: tau(d) = 25 s * (d / 250 um)^2  =>  d(T) = 250 um * sqrt(T / 25 s)
anchor_d, anchor_T = 250.0, 25.0
contact = {"espresso": 25, "moka (rough, ~1-2 min)": 90, "pour-over (3:00-3:30)": 195, "French press (4 min)": 240}
for m, T in contact.items():
    print(f"{m:26s} T = {T:4d} s -> d = {anchor_d*math.sqrt(T/anchor_T):5.0f} um")
for T in (60, 120, 180, 210):
    print(f"   T = {T:3d} s -> d = {anchor_d*math.sqrt(T/anchor_T):5.0f} um")
print(f"10x contact time -> sqrt(10) = {math.sqrt(10):.2f}x size")

# 5. Driving pressures
rho, g = 1000.0, 9.81
for h_cm in (3, 5, 10):
    p = rho * g * h_cm / 100
    print(f"water head {h_cm:2d} cm -> {p:5.0f} Pa = {p/1e5:.4f} bar; 9 bar / this = {9e5/p:6.0f}x")

# 6. Kozeny-Carman: permeability ratio for size ratio
for r in (2, 3, 4):
    print(f"size x{r} -> permeability x{r*r} (same porosity and shape)")

# 7. Sauter mean of a two-size mixture (illustrates fines dominating flow)
def sauter(fracs_sizes):
    # volume fractions f_i of spheres of diameter d_i: d32 = 1 / sum(f_i / d_i)
    return 1 / sum(f / d for f, d in fracs_sizes)
for ff in (0.0, 0.1, 0.2, 0.3):
    d32 = sauter([(ff, 40.0), (1 - ff, 300.0)])
    print(f"fines {ff:.0%} by volume at 40 um + rest at 300 um -> Sauter mean {d32:5.0f} um,"
          f" permeability vs no fines x{(d32/300)**2:.2f}")

# 8. Sphere diffusion: fraction extracted F(t) = 1 - 6/pi^2 sum 1/n^2 exp(-n^2 pi^2 D t / R^2)
def F(x, N=200):  # x = D t / R^2
    return 1 - 6 / math.pi**2 * sum(math.exp(-(n*n) * math.pi**2 * x) / (n*n) for n in range(1, N))
for x in (0.01, 0.05, 0.1, 0.2, 0.3):
    print(f"Dt/R^2 = {x:.2f} -> fraction extracted {F(x):.3f}")

# 9. Values quoted in the text
g60 = 60 * step_um * math.sin(math.radians(19))
print(f"gap at 60 clicks, theta 19 deg = {g60:.0f} um; one click = {step_um*math.sin(math.radians(19)):.2f} um = {100*step_um*math.sin(math.radians(19))/g60:.1f}% of it")
print(f"moka 1-2 bar vs espresso 9 bar: 1/9 = {1/9:.3f}, 2/9 = 1/{9/2:.1f}")
print(f"P0 chart drawn 0-130 clicks against 0-1400 um: {1400/130:.2f} um/click")
for name, n, T in (("espresso", 25, 25), ("moka", 45, 90), ("pour-over", 60, 195), ("French press", 80, 240)):
    d = n * step_um * math.sin(math.radians(19))
    tau = anchor_T * (d / anchor_d) ** 2
    print(f"preset {name:12s} {n:3d} clicks -> main peak {d:5.0f} um, diffusion time {tau:5.0f} s, contact/diffusion = {T/tau:.2f}")
