"""Dirichlet eigenvalues of the Gordon-Webb-Wolpert isospectral pair, by 5-point finite differences.

Vertices as given by Cleve Moler, "Can One Hear the Shape of a Drum? Part 1, Eigenvalues",
Cleve's Corner (MathWorks blog), 6 Aug 2012. Each drum is made of seven half-squares; area 3.5.
Run at two grid sizes and Richardson-extrapolate (the 5-point scheme converges at rate h^2 on the
smooth part; the reentrant corners slow this, so the extrapolation is an estimate, not exact).
"""
import json
import numpy as np
from matplotlib.path import Path
from scipy.sparse import lil_matrix
from scipy.sparse.linalg import eigsh

DRUMS = {
    "drum1": list(zip([0, 0, 2, 2, 3, 2, 1, 1, 0], [0, 1, 3, 2, 2, 1, 1, 0, 0])),
    "drum2": list(zip([1, 0, 0, 2, 2, 3, 2, 1, 1], [0, 1, 2, 2, 3, 2, 1, 1, 0])),
}


def strictly_inside(px, py, V):
    # on an edge -> boundary (excluded); otherwise even-odd ray casting with exact integers
    c = False
    for (x1, y1), (x2, y2) in zip(V, V[1:]):
        cross = (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)
        if cross == 0 and min(x1, x2) <= px <= max(x1, x2) and min(y1, y2) <= py <= max(y1, y2):
            return False
        if (y1 > py) != (y2 > py):
            # x coordinate of the edge at height py, compared exactly: px < x1 + (py - y1)(x2 - x1)/(y2 - y1)
            lhs = (px - x1) * (y2 - y1); rhs = (py - y1) * (x2 - x1)
            if (y2 - y1) > 0:
                if lhs < rhs: c = not c
            else:
                if lhs > rhs: c = not c
    return c


def eigen(poly, n, k=12, want_modes=False):
    h = 1.0 / n
    # exact integer geometry: grid point (i, j) is (i/n, j/n); vertices scaled by n are integers
    V = [(n * x, n * y) for x, y in poly]
    M = 3 * n + 1
    X, Y = np.meshgrid(np.arange(M) * h, np.arange(M) * h, indexing="ij")
    inside = np.zeros((M, M), dtype=bool)
    for i in range(M):
        for j in range(M):
            inside[i, j] = strictly_inside(i, j, V)
    idx = -np.ones(X.shape, dtype=int)
    idx[inside] = np.arange(inside.sum())
    N = inside.sum()
    A = lil_matrix((N, N))
    for (i, j) in zip(*np.nonzero(inside)):
        r = idx[i, j]
        A[r, r] = 4.0 / h**2
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ii, jj = i + di, j + dj
            if 0 <= ii < X.shape[0] and 0 <= jj < X.shape[1] and inside[ii, jj]:
                A[r, idx[ii, jj]] = -1.0 / h**2
    vals, vecs = eigsh(A.tocsc(), k=k, sigma=0, which="LM")
    order = np.argsort(vals)
    vals = vals[order]
    out = {"vals": vals.tolist(), "N": int(N)}
    if want_modes:
        modes = []
        for m in range(4):
            grid = np.full(X.shape, np.nan)
            v = vecs[:, order[m]]
            v = v / np.max(np.abs(v))
            grid[inside] = v
            modes.append(grid[::2, ::2].round(3).tolist())  # coarse copy for drawing
        out["modes"] = modes
        out["step"] = 2 * h
    return out


def main():
    res = {}
    for name, poly in DRUMS.items():
        a = eigen(poly, 40)
        b = eigen(poly, 80, want_modes=True)
        ext = [(4 * vb - va) / 3 for va, vb in zip(a["vals"], b["vals"])]
        res[name] = {"h40": a["vals"], "h80": b["vals"], "extrap": ext, "modes": b["modes"], "step": b["step"], "poly": poly}
        print(name, "N=", b["N"], ["%.4f" % v for v in ext])

    d = np.array(res["drum1"]["extrap"]) - np.array(res["drum2"]["extrap"])
    print("max relative difference between drums:", float(np.max(np.abs(d) / np.array(res["drum1"]["extrap"]))))
    json.dump(res, open("gww.json", "w"))


if __name__ == "__main__":
    main()
