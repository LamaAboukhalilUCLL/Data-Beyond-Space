/*
 * model.js - reads the FLEX droplet model in the browser.
 *
 * scripts/analyze_flex.py fits the model (ordinary least squares on NASA's FLEX table,
 * PSI-69) and writes data/flex_model.json. The functions below only evaluate it:
 *   estimate(model, v)   the estimate at a condition, with the 95 % range for a single
 *                        new test (prediction interval) and for the average (confidence
 *                        interval), and the leverage, which says how far the condition
 *                        sits from the bulk of the tests the model was fitted on;
 *   outside(range, v)    which settings lie outside what FLEX tested (with a 1 % margin);
 *   nearest(rows, ...)   the real tests closest to a condition;
 *   nextTest(m, v0, v)   how much one more test at condition v would narrow the 95 % range of the
 *                        model's estimate at v0 (exact, by the Sherman-Morrison update of (X'X)^-1,
 *                        assuming the scatter of the tests around the line stays the same);
 *   testsToShrink(...)   how many tests at v it would take to narrow that range to a given share.
 * scripts/check_model.cjs refits the model from NASA's CSV on its own and fails unless
 * it gets the same coefficients, and unless estimate() agrees with a direct calculation.
 *
 * Written with AI assistance (Claude, Anthropic).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.FlexModel = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var KEYS = ["o2", "co2", "he", "p", "d0"];
  function vector(v) { return [1].concat(KEYS.map(function (k) { return v[k]; })); }

  function estimate(m, v) {
    var x = vector(v), p = x.length, value = 0, h = 0, a, b;
    for (a = 0; a < p; a++) value += m.beta[a] * x[a];
    for (a = 0; a < p; a++) for (b = 0; b < p; b++) h += x[a] * m.xtx_inverse[a][b] * x[b];
    var single = m.t975 * Math.sqrt(m.residual_variance * (1 + h)), average = m.t975 * Math.sqrt(m.residual_variance * h);
    return { value: value, low: value - single, high: value + single, mean_low: value - average, mean_high: value + average, leverage: h, unusual: h > m.leverage_flag };
  }

  // A setting counts as outside only when it is beyond the tested range by more than 1 % of that range's width.
  function outside(range, v) {
    return KEYS.filter(function (k) { var tol = 0.01 * (range[k][1] - range[k][0]); return v[k] < range[k][0] - tol || v[k] > range[k][1] + tol; })
      .map(function (k) { return { key: k, value: v[k], side: v[k] < range[k][0] ? "below" : "above", limit: v[k] < range[k][0] ? range[k][0] : range[k][1] }; });
  }

  // Distance: each setting's difference divided by the width FLEX tested for it, then the usual straight-line distance.
  function nearest(rows, fuel, v, range, n) {
    return rows.filter(function (r) { return r.fuel === fuel; }).map(function (r) {
      var d = 0;
      KEYS.forEach(function (k) { var w = (range[k][1] - range[k][0]) || 1, e = (r[k] - v[k]) / w; d += e * e; });
      return { row: r, distance: Math.sqrt(d) };
    }).sort(function (a, b) { return a.distance - b.distance || a.row.row - b.row.row; }).slice(0, n);
  }

  function quad(Ai, a, b) { var s = 0, i, j; for (i = 0; i < a.length; i++) for (j = 0; j < b.length; j++) s += a[i] * Ai[i][j] * b[j]; return s; }
  // Adding a test at x turns (X'X)^-1 into (X'X + x x')^-1, so the leverage of v0 drops from
  // h0 = x0'A x0 to h0 - (x0'A x)^2 / (1 + x'A x), with A = (X'X)^-1. The 95 % range of the
  // estimated average at v0 is proportional to the square root of that leverage.
  function nextTest(m, v0, v) {
    var x0 = vector(v0), x = vector(v), A = m.xtx_inverse, h0 = quad(A, x0, x0), c = quad(A, x0, x), hx = quad(A, x, x), h1 = h0 - c * c / (1 + hx);
    var k = m.t975 * Math.sqrt(m.residual_variance);
    return { h0: h0, h1: h1, half0: k * Math.sqrt(h0), half1: k * Math.sqrt(h1), shrink: 1 - Math.sqrt(h1 / h0), c: c, hx: hx };
  }
  // k tests at the same condition: h0 - k c^2 / (1 + k hx). Returns the smallest k that brings the
  // range down to `share` of today's, or null when tests at this one condition can never get there.
  function testsToShrink(m, v0, v, share, maxK) {
    var r = nextTest(m, v0, v), target = share * share * r.h0, limit = r.h0 - r.c * r.c / r.hx;
    if (limit > target) return { k: null, floor: Math.sqrt(limit / r.h0) };
    for (var k = 1; k <= (maxK || 1000); k++) if (r.h0 - k * r.c * r.c / (1 + k * r.hx) <= target + 1e-15) return { k: k, floor: Math.sqrt(limit / r.h0) };
    return { k: null, floor: Math.sqrt(limit / r.h0) };
  }

  return { KEYS: KEYS, vector: vector, estimate: estimate, outside: outside, nearest: nearest, nextTest: nextTest, testsToShrink: testsToShrink };
});
