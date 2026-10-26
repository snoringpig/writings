"""Export the first 12 Dirichlet modes of both GWW drums on a coarse grid (step 1/10) for the web page.

Uses eigen-solver settings of gww.py at n = 40 (h = 1/40), subsampled every 4th grid point.
The mask string lists grid points (x index major, then y index) as 1 inside, 0 not; mode values follow the same order.
Each mode is normalized so that its integral of X^2 over the drum is 1, then stored as integers
in -99..99 with one scale factor per mode. Signs are fixed so that the value at the most inside point is positive.
"""
import json
import numpy as np
from scipy.sparse import lil_matrix
from scipy.sparse.linalg import eigsh
from gww import DRUMS, strictly_inside

n, K, SUB = 40, 12, 4
h = 1.0 / n
out = {"step": SUB * h, "size": 3 * n // SUB + 1, "drums": {}}
for name, poly in DRUMS.items():
    V = [(n * x, n * y) for x, y in poly]
    M = 3 * n + 1
    inside = np.array([[strictly_inside(i, j, V) for j in range(M)] for i in range(M)])
    idx = -np.ones((M, M), dtype=int); idx[inside] = np.arange(inside.sum())
    A = lil_matrix((inside.sum(), inside.sum()))
    for (i, j) in zip(*np.nonzero(inside)):
        r = idx[i, j]; A[r, r] = 4 / h**2
        for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ii, jj = i + di, j + dj
            if 0 <= ii < M and 0 <= jj < M and inside[ii, jj]:
                A[r, idx[ii, jj]] = -1 / h**2
    vals, vecs = eigsh(A.tocsc(), k=K, sigma=0, which="LM")
    o = np.argsort(vals); vals = vals[o]; vecs = vecs[:, o]
    sub = inside[::SUB, ::SUB]
    modes, scales = [], []
    for m in range(K):
        X = np.zeros((M, M)); X[inside] = vecs[:, m] / h   # integral of X^2 = h^2 sum v^2 = 1
        if X[inside].sum() < 0 or (abs(X[inside].sum()) < 1e-6 and X[inside][np.argmax(np.abs(X[inside]))] < 0):
            X = -X
        Xs = X[::SUB, ::SUB]
        s = np.abs(Xs).max()
        modes.append(np.round(99 * Xs[sub] / s).astype(int).tolist()); scales.append(round(float(s), 4))
    out["drums"][name] = {"poly": poly, "mask": "".join("1" if v else "0" for v in sub.ravel()),
                          "modes": modes, "scale": scales, "vals": [round(float(v), 4) for v in vals]}
    print(name, sub.sum(), "points", [round(float(v), 3) for v in vals])
json.dump(out, open("gww_modes.json", "w"), separators=(",", ":"))
