#!/usr/bin/env python3
"""
analyze_flex.py - a statistical model of NASA's FLEX droplet tests (PSI-69).

FLEX is the one investigation in the snapshot that burned fuel at 30 % oxygen and more,
close to Moon Base pressure, and recorded an outcome for every test. This script measures,
from its table alone, how oxygen, pressure, carbon dioxide, helium and droplet size change

the burning rate NASA measured. It also counts, without any model, how the tests ended
(flame went out with fuel left, droplet burned to completion, or disruption) below Earth's
oxygen level, between Earth's and the Moon Base level, and at the Moon Base level or above.

Method: ordinary least squares, one model per fuel,

    burning rate = b0 + b1*oxygen + b2*carbon dioxide + b3*helium + b4*pressure + b5*droplet size

An earlier draft also modelled the share of fuel left at extinction. It was dropped: that
share exists only for tests that ended in extinction, and at 30 % oxygen almost none did,
so a model of it would describe a condition where it has no data.

Nitrogen is the remainder of the gas, so it is the reference and has no term of its own.
The model is deliberately simple: every coefficient can be read, and the fit can be
recomputed by hand. Its skill is measured by leaving tests out and predicting them:
once one test at a time, and once one whole test day at a time (tests of one day share
hardware settings, so this is the stricter check).

The model describes fuel droplets inside the conditions FLEX tested. It says nothing about
solid materials, and nothing about Moon gravity.

Uses the Python standard library only. Reads data/psi/raw/PSI-69_table_1.csv.
Writes docs/data/flex_model.json, which the website and scripts/check_model.cjs read.

Written with AI assistance (Claude Code, Anthropic).
"""
import csv
import io
import json
import math
import os
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC = os.path.join(ROOT, "data", "psi", "raw", "PSI-69_table_1.csv")
OUT = os.path.join(ROOT, "docs", "data", "flex_model.json")
MMHG_TO_PSI = 0.0193368          # the same factor build_dataset.py uses

COL = {"test": "FLEX Test #", "id": "FLEX Identifier", "date": "Test Date", "fuel": "Fuel", "p": "Ambient pressure; mmHg",
       "o2": "O initial ambient composition; mole fraction", "n2": "N initial ambient composition; mole fraction",
       "co2": "CO initial ambient composition; mole fraction", "he": "He initial ambient composition; mole fraction",
       "d0": "Droplet initial diameter; mm", "dext": "Visible flame extinction diameter; mm", "k": "Burning rate; mm", "end": "Test end"}
FEATURES = [  # key, label, unit, what one step means in the readout
    ["o2", "Oxygen", "%"], ["co2", "Carbon dioxide", "%"], ["he", "Helium", "%"], ["p", "Pressure", "psi"], ["d0", "Droplet size at the start", "mm"]]
OUTCOMES = {
    "rate": {"label": "Burning rate", "unit": "as in NASA's column 'Burning rate; mm'",
             "note": "How fast the droplet shrinks while it burns. Higher means faster burning."},
}
DATASET = os.path.join(ROOT, "docs", "data", "dataset.json")   # for the two oxygen levels that split the bands


def num(x):
    try:
        v = float(x)
        return v if math.isfinite(v) else None
    except (TypeError, ValueError):
        return None


def read_rows():
    data = open(SRC, "rb").read()
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = data.decode("cp1252")
    table = list(csv.reader(io.StringIO(text)))
    head = [h.strip() for h in table[0]]
    ix = {k: head.index(v) for k, v in COL.items()}
    rows, skipped = [], {"no pressure": 0, "gas fractions do not add up to 1": 0, "no starting diameter": 0}
    for n, r in enumerate(table[1:], start=2):   # row 2 is the first test, as in tests.json
        g = lambda k: r[ix[k]].strip() if ix[k] < len(r) else ""
        o2, n2, co2, he, p, d0 = (num(g(k)) for k in ("o2", "n2", "co2", "he", "p", "d0"))
        if not g("fuel") or o2 is None:
            continue
        if not p:
            skipped["no pressure"] += 1
            continue
        if None in (n2, co2, he) or abs(o2 + n2 + co2 + he - 1) > 0.02:
            skipped["gas fractions do not add up to 1"] += 1
            continue
        if d0 is None:
            skipped["no starting diameter"] += 1
            continue
        k, dext, end = num(g("k")), num(g("dext")), g("end")
        left = (dext / d0) ** 3 if end == "Extinction" and dext and dext > 0 and dext <= d0 else None
        rows.append({"row": n, "test": g("test"), "id": g("id"), "date": g("date"), "fuel": g("fuel"), "end": end,
                     "o2": o2 * 100, "co2": co2 * 100, "he": he * 100, "p": p * MMHG_TO_PSI, "d0": d0,   # not rounded: the fit uses exactly these
                     "rate": k, "left": left})
    return rows, skipped, len(table) - 1


# ---------------------------------------------------------------- small linear algebra
def inverse(a):
    n = len(a)
    m = [list(map(float, a[i])) + [1.0 if i == j else 0.0 for j in range(n)] for i in range(n)]
    for c in range(n):
        piv = max(range(c, n), key=lambda r: abs(m[r][c]))
        if abs(m[piv][c]) < 1e-12:
            sys.exit("model: the design matrix is singular")
        m[c], m[piv] = m[piv], m[c]
        d = m[c][c]
        m[c] = [v / d for v in m[c]]
        for r in range(n):
            if r != c and m[r][c]:
                f = m[r][c]
                m[r] = [v - f * w for v, w in zip(m[r], m[c])]
    return [row[n:] for row in m]


def t975(df):
    """97.5 % point of Student's t (Cornish-Fisher expansion; exact to three decimals for df above 10)."""
    z = 1.959963985
    return z + (z ** 3 + z) / (4 * df) + (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * df ** 2) + (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / (384 * df ** 3)


def ols(X, y):
    n, p = len(X), len(X[0])
    xtx = [[sum(X[i][a] * X[i][b] for i in range(n)) for b in range(p)] for a in range(p)]
    xtxi = inverse(xtx)
    xty = [sum(X[i][a] * y[i] for i in range(n)) for a in range(p)]
    beta = [sum(xtxi[a][b] * xty[b] for b in range(p)) for a in range(p)]
    return beta, xtxi


def design(rows):
    return [[1.0] + [r[f[0]] for f in FEATURES] for r in rows]


def predict(beta, x):
    return sum(b * v for b, v in zip(beta, x))


def fit(rows, key):
    rows = [r for r in rows if r[key] is not None]
    X, y = design(rows), [r[key] for r in rows]
    n, p = len(X), len(X[0])
    beta, xtxi = ols(X, y)
    res = [y[i] - predict(beta, X[i]) for i in range(n)]
    lev = [sum(X[i][a] * xtxi[a][b] * X[i][b] for a in range(p) for b in range(p)) for i in range(n)]
    sse = sum(e * e for e in res)
    mean = sum(y) / n
    sst = sum((v - mean) ** 2 for v in y)
    s2 = sse / (n - p)
    loo = [res[i] / (1 - lev[i]) for i in range(n)]                      # exact leave-one-out residuals
    # leave one test day out: refit without that day, predict its tests
    by_day = {}
    for i, r in enumerate(rows):
        by_day.setdefault(r["date"], []).append(i)
    day_err = []
    for day, idx in by_day.items():
        keep = [i for i in range(n) if i not in set(idx)]
        b, _ = ols([X[i] for i in keep], [y[i] for i in keep])
        day_err += [y[i] - predict(b, X[i]) for i in idx]
    t = t975(n - p)
    se = [math.sqrt(s2 * xtxi[a][a]) for a in range(p)]
    rmse = lambda e: math.sqrt(sum(v * v for v in e) / len(e))
    return {
        "n": n, "terms": ["intercept"] + [f[0] for f in FEATURES], "beta": beta, "se": se, "t975": t,
        "ci_low": [beta[a] - t * se[a] for a in range(p)], "ci_high": [beta[a] + t * se[a] for a in range(p)],
        "xtx_inverse": xtxi, "residual_variance": s2, "df": n - p,
        "r2": 1 - sse / sst, "rmse": rmse(res), "rmse_leave_one_out": rmse(loo), "rmse_leave_one_day_out": rmse(day_err), "test_days": len(by_day),
        "rmse_of_guessing_the_mean": math.sqrt(sst / n), "mean": mean, "min": min(y), "max": max(y),
        "leverage_max": max(lev), "leverage_flag": 3 * p / n,
    }


def main():
    rows, skipped, total = read_rows()
    about = json.load(open(DATASET, encoding="utf-8"))["about"]
    earth = [p for p in about["presets"] if p["id"] == "earth"][0]["o2"]
    moon = about["moon_base"]["o2_min_percent"]
    bands = [["below", None, earth], ["between", earth, moon], ["at_or_above", moon, None]]
    fuels = {}
    for fuel in sorted({r["fuel"] for r in rows}):
        rs = [r for r in rows if r["fuel"] == fuel]
        fuels[fuel] = {
            "tests": len(rs),
            "range": {f[0]: [min(r[f[0]] for r in rs), max(r[f[0]] for r in rs)] for f in FEATURES},
            "models": {k: fit(rs, k) for k in OUTCOMES},
            # how the tests ended, by oxygen band: plain counts, no model
            "endings": [{"band": b[0], "from": b[1], "to": b[2],
                         "counts": {e: sum(1 for r in rs if r["end"] == e and (b[1] is None or r["o2"] >= b[1] - 1e-9) and (b[2] is None or r["o2"] < b[2] - 1e-9))
                                    for e in sorted({r["end"] for r in rows})}} for b in bands],
        }
    out = {
        "about": {
            "what": "Ordinary least squares on NASA's FLEX table (PSI-69), one model per fuel and outcome. Nitrogen is the reference gas.",
            "source_table": "PSI-69_table_1.csv", "investigation": "PSI-69", "rows_in_table": total, "rows_used": len(rows), "rows_skipped": skipped,
            "features": FEATURES, "outcomes": OUTCOMES, "oxygen_bands": {"earth": earth, "moon_base": moon},
            "fuel_left": "Shown per test only: (extinction diameter / starting diameter) cubed, for tests NASA marks 'Extinction'.", "mmhg_to_psi": MMHG_TO_PSI,
            "limits": "Fuel droplets only, inside the conditions FLEX tested. Not solid materials, not Moon gravity.",
            "built_by": "scripts/analyze_flex.py (written with AI assistance: Claude Code, Anthropic)",
        },
        "fuels": fuels,
        "rows": rows,
    }
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    print(f"FLEX model: {len(rows)} of {total} tests used, skipped {skipped}")
    for fuel, d in fuels.items():
        for k, m in d["models"].items():
            print(f"  {fuel:9s} {k:5s} n={m['n']:3d} R2={m['r2']:.3f} error when predicting left-out days={m['rmse_leave_one_day_out']:.3f} (guessing the mean: {m['rmse_of_guessing_the_mean']:.3f})  oxygen: {m['beta'][1]:+.4f} per point")


if __name__ == "__main__":
    main()
