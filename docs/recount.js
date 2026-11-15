/*
 * recount.js - counts NASA's tests against any atmosphere the reader chooses.
 *
 * The Moon Base numbers on this site are computed by scripts/build_dataset.py.
 * When a reader picks another atmosphere (oxygen at least X %, pressure at most
 * Y psi), the page recounts with the functions below, using the same rules:
 *   - only cells NASA wrote as plain numbers are counted (already decided by the
 *     build: a test carries `o2` or `p_psi` only when its cell was a number);
 *   - values listed for a test day or fuel (`o2_list`) count for the oxygen
 *     condition, never for "both in the same test";
 *   - a condition the table states as text, or not at all, stays that way.
 * scripts/check_recount.js runs these functions at the Moon Base thresholds and
 * fails if they disagree with the build in any number.
 *
 * Written with AI assistance (Claude, Anthropic).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Recount = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function g(x) { return String(Math.round(x * 100) / 100); }
  function inAir(t, o2, p) { return t.o2 != null && t.p_psi != null && t.o2 >= o2 && t.p_psi <= p; }

  // Totals over every test, for one atmosphere.
  function counts(tests, o2, p) {
    var c = { plainO2: 0, o2AtOrAbove: 0, both: 0, inZone: 0, byCls: {}, invsInZone: [] }, seen = {};
    tests.forEach(function (t) {
      if (t.o2 != null) {
        var k = c.byCls[t.cls] || (c.byCls[t.cls] = { rows: 0, atOrAbove: 0, min: t.o2, max: t.o2 });
        k.rows++; c.plainO2++;
        if (t.o2 < k.min) k.min = t.o2;
        if (t.o2 > k.max) k.max = t.o2;
        if (t.o2 >= o2) { k.atOrAbove++; c.o2AtOrAbove++; }
      }
      if (t.o2 != null && t.p_psi != null) {
        c.both++;
        if (inAir(t, o2, p)) { c.inZone++; if (!seen[t.inv]) { seen[t.inv] = 1; c.invsInZone.push(t.inv); } }
      }
    });
    return c;
  }

  // The three table-based conditions for one investigation. `base` is what the build computed
  // for the Moon Base; its "text" / "not stated" / "no table" answers do not depend on the thresholds.
  function conditions(base, mine, o2, p) {
    var out = { oxygen: base.oxygen, pressure: base.pressure, both: base.both };
    if (base.oxygen.value === "yes" || base.oxygen.value === "no") {
      var nums = [], lists = 0, listsGe = 0, all = [];
      mine.forEach(function (t) {
        if (t.o2 != null) { nums.push(t.o2); all.push(t.o2); }
        else if (t.o2_list) { lists++; all = all.concat(t.o2_list); if (t.o2_list.some(function (v) { return v >= o2; })) listsGe++; }
      });
      var mx = Math.max.apply(null, all), mn = Math.min.apply(null, all);
      if (mx >= o2) {
        var parts = [];
        if (nums.length) parts.push(nums.filter(function (v) { return v >= o2; }).length + " of " + nums.length + " rows with a plain number");
        if (lists) parts.push("listed on " + listsGe + " of " + lists + " rows that list several values");
        out.oxygen = { value: "yes", score: 1, min: mn, max: mx, detail: parts.join("; ") + ". Highest: " + g(mx) + " %" };
      } else out.oxygen = { value: "no", score: 0, min: mn, max: mx, detail: "Highest ambient oxygen stated: " + g(mx) + " %" };
    }
    if (base.pressure.value === "yes" || base.pressure.value === "no") {
      var ps = mine.filter(function (t) { return t.p_psi != null; }).map(function (t) { return t.p_psi; });
      var lo = Math.min.apply(null, ps), hi = Math.max.apply(null, ps);
      if (lo <= p) out.pressure = { value: "yes", score: 1, min: lo, max: hi, detail: ps.filter(function (v) { return v <= p; }).length + " of " + ps.length + " rows with a plain number. Lowest: " + g(lo) + " psi" };
      else out.pressure = { value: "no", score: 0, min: lo, max: hi, detail: "Lowest pressure stated: " + g(lo) + " psi" };
    }
    if (base.both.value === "yes" || base.both.value === "no") {
      var both = mine.filter(function (t) { return t.o2 != null && t.p_psi != null; }), n = both.filter(function (t) { return inAir(t, o2, p); }).length;
      out.both = { value: n ? "yes" : "no", score: n ? 1 : 0, rows: n, of: both.length, detail: n + " of " + both.length + " rows that state both as plain numbers" };
    }
    return out;
  }

  // Every investigation, with its five conditions and its rank, for one atmosphere.
  function rank(investigations, tests, o2, p) {
    var byInv = {};
    tests.forEach(function (t) { (byInv[t.inv] || (byInv[t.inv] = [])).push(t); });
    var list = investigations.map(function (i) {
      var c = conditions(i.criteria, byInv[i.id] || [], o2, p);
      var crit = { purpose: i.criteria.purpose, material: i.criteria.material, oxygen: c.oxygen, pressure: c.pressure, both: c.both };
      var score = crit.purpose.score + crit.material.score + crit.oxygen.score + crit.pressure.score + crit.both.score;
      return { id: i.id, criteria: crit, score: score };
    });
    list.sort(function (a, b) {
      return b.score - a.score || b.criteria.purpose.score - a.criteria.purpose.score || b.criteria.material.score - a.criteria.material.score ||
        (+a.id.split("-")[1]) - (+b.id.split("-")[1]);
    });
    list.forEach(function (x, n) { x.rank = n + 1; });
    return list;
  }

  return { counts: counts, conditions: conditions, rank: rank, inAir: inAir };
});
