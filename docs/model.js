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
 *   nearest(rows, ...)   the real tests closest to a condition.
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

  return { KEYS: KEYS, vector: vector, estimate: estimate, outside: outside, nearest: nearest };
});
