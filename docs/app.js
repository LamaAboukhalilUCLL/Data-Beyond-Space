/*
 * Flame in Freefall dashboard.
 * Reads data/dataset.json and data/tests.json (built by scripts/build_dataset.py
 * from NASA's PSI repository) and draws every view from them. The page does no
 * science of its own: every number on screen is computed by the build script
 * and can be traced to a row of a NASA table.
 *
 * Written with AI assistance (Claude, Anthropic), reviewed by the team.
 */
(function () {
  "use strict";

  var D = null, TESTS = [], BY_ID = {};
  var main = document.getElementById("main");
  var tip = document.getElementById("tip");
  var REPO = "https://github.com/LamaAboukhalilUCLL/Data-Beyond-Space";
  // the one photo on the site (see docs/img/CREDITS.md)
  var MOON = { credit: "NASA/GSFC/Arizona State University, Lunar Reconnaissance Orbiter", page: "https://commons.wikimedia.org/wiki/File:Moon_nearside_LRO_5000.jpg" };

  var CRIT = [
    ["purpose", "About spacecraft fire safety", "Does the record's own text name spacecraft fire safety as its purpose?"],
    ["material", "Tests solid cabin materials", "Does it burn or heat real solid materials, the things a habitat is made of?"],
    ["oxygen", "Reaches 30 % oxygen", "Does any test state an ambient oxygen level of 30 % or more?"],
    ["pressure", "Reaches 10.2 psi or less", "Does any test state a pressure of 10.2 psi or less?"],
    ["both", "Both in the same test", "Is any single test at 30 % oxygen or more and 10.2 psi or less together?"]
  ];
  var VALUE_WORD = {
    primary: "Main purpose", benefit: "Named as a benefit", none: "Not its purpose",
    yes: "Yes", partly: "Partly", no: "No", text: "Written as text, not counted",
    "not stated": "Not stated in the table", "no table": "No table in PSI"
  };
  var FIELD = { objective: "Objective", approach: "Approach", hypothesis: "Hypothesis", researchImpacts: "Research impacts" };
  var KIND = { aim: "Aim", expected: "Expected", result: "Result", stated: "Stated" };
  var LANES = ["solid", "smoke", "emulated", "droplet", "gas"];
  // NASA's chart palette for dark backgrounds (Horizon Design System, github.com/nasa/hds-core)
  var COLOR = { solid: "#f29d49", emulated: "#c2b47c", droplet: "#609af6", gas: "#79a3ad", smoke: "#959599", aerosol: "#77777a", burner: "#fa8c87" };

  // ---------------------------------------------------------------- helpers
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(x) {
    if (x == null || x === "") return "";
    var r = Math.round(x * 100) / 100;
    return String(r);
  }
  function chip(cls) {
    return '<span class="chip"><i class="c-' + cls + '"></i>' + esc(D.about.class_labels[cls]) + "</span>";
  }
  function dot(c) {
    var k = c.score === 1 ? "full" : c.score === 0.5 ? "half" : (c.value === "text" || c.value === "not stated" || c.value === "no table") ? "unknown" : "";
    return '<span class="dot ' + k + '"></span>';
  }
  function dots(inv) {
    return '<span class="dots" role="img" aria-label="' + esc(CRIT.map(function (c) {
      return c[1] + ": " + VALUE_WORD[inv.criteria[c[0]].value];
    }).join("; ")) + '">' + CRIT.map(function (c) { return dot(inv.criteria[c[0]]); }).join("") + "</span>";
  }
  function quote(invId, field, q) {
    return "<blockquote>“" + esc(q) + "”<cite>NASA PSI record " + esc(invId) + ", " + FIELD[field] + "</cite></blockquote>";
  }
  function invLink(id, label) {
    return '<a href="#/inv/' + id + '">' + esc(label || BY_ID[id].name) + "</a>";
  }
  function hash01(n, salt) {
    var x = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453;
    return x - Math.floor(x);
  }
  // phones get charts drawn for a narrow box, so the Moon Base zone is never cut off
  function narrow() { return window.innerWidth < 700; }
  var SHORT = { purpose: "Fire safety", material: "Solids", oxygen: "30 % O₂", pressure: "≤ 10.2 psi", both: "Both" };
  function cell(c, label) {
    var k = c.score === 1 ? "full" : c.score === 0.5 ? "half" : (c.value === "text" || c.value === "not stated" || c.value === "no table") ? "unknown" : "none";
    return '<span class="sq ' + k + '" title="' + esc(label + ": " + VALUE_WORD[c.value]) + '"></span>';
  }
  // How far each fuel type got: one bar from the lowest to the highest ambient oxygen
  // its tests state (computed by the build), against Earth air and the Moon Base line.
  function fuelBars() {
    var R = D.summary.o2_range_by_class, zone = D.about.moon_base.o2_min_percent;
    var rows = ["solid", "droplet", "gas"].filter(function (c) { return R[c]; });
    var nw = narrow(), W = nw ? 380 : 1100, L = nw ? 12 : 190, Rt = nw ? 14 : 30, rowH = nw ? 70 : 76, T = 56, bh = nw ? 22 : 30;
    var H = T + rows.length * rowH + (nw ? 52 : 60), x = scaleLin(10, 45, L, W - Rt), yb = T + rows.length * rowH;
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Range of ambient oxygen tested, by what burns. Solid materials stop at ' + num(R.solid.max) + ' percent; Moon Base air starts at ' + num(zone) + ' percent.">';
    s += '<defs><pattern id="hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line class="gap-hatch" x1="0" y1="0" x2="0" y2="8" stroke-width="3"/></pattern></defs>';
    // the Moon Base zone, and the gap between the solid-material maximum and it
    s += '<rect class="zone" x="' + x(zone) + '" y="' + (T - 14) + '" width="' + (W - Rt - x(zone)) + '" height="' + (rows.length * rowH + 14) + '" rx="8"/>';
    var r0 = R.solid, gy = T + rows.indexOf("solid") * rowH;
    if (r0.max < zone) s += '<rect x="' + x(r0.max) + '" y="' + (gy - 4) + '" width="' + (x(zone) - x(r0.max)) + '" height="' + (rowH - 8) + '" fill="url(#hatch)"/>';
    s += '<line x1="' + x(21) + '" x2="' + x(21) + '" y1="' + (T - 14) + '" y2="' + yb + '" class="earth"/>';
    s += '<text class="earth-label strong" x="' + x(21) + '" y="' + (T - 24) + '" text-anchor="middle">Earth air 21 %</text>';
    s += '<rect x="' + (x(zone) - 1.5) + '" y="' + (T - 14) + '" width="3" height="' + (yb - T + 14) + '" class="zone-line"/>';
    s += '<text class="zone-label strong" x="' + (x(zone) + (nw ? 6 : 20)) + '" y="' + (T - 24) + '">Moon Base: ' + num(zone) + " % +</text>";
    rows.forEach(function (c, k) {
      var r = R[c], y0 = T + k * rowH, by = nw ? y0 + 26 : y0 + (rowH - bh) / 2 - 4, x0 = x(r.min), x1 = x(r.max);
      if (nw) {
        s += '<text class="lane-label" x="' + L + '" y="' + (y0 + 16) + '">' + esc(D.about.class_labels[c]) + '<tspan class="sub"> (' + r.rows + " tests)</tspan></text>";
      } else {
        var words = D.about.class_labels[c].split(" "), mid = Math.ceil(words.length / 2);
        s += '<text class="lane-label big" x="14" y="' + (by + 4) + '">' + esc(words.slice(0, mid).join(" ")) + '<tspan x="14" dy="20">' + esc(words.slice(mid).join(" ")) + '</tspan><tspan class="sub" x="14" dy="20">(' + r.rows + " tests)</tspan></text>";
      }
      s += '<rect x="' + x0 + '" y="' + by + '" width="' + Math.max(8, x1 - x0) + '" height="' + bh + '" rx="' + bh / 2 + '" fill="' + COLOR[c] + '"/>';
      var ty = by + bh / 2 + 5;
      if (x1 - x0 > (nw ? 110 : 140)) s += '<text class="bar-val" x="' + (x0 + 12) + '" y="' + ty + '">' + num(r.min) + " %</text>";
      s += '<text class="bar-val" x="' + (x1 - 12) + '" y="' + ty + '" text-anchor="end">' + num(r.max) + " %</text>";
      if (r.max < zone) {
        var gx = (x1 + x(zone)) / 2;
        s += nw ? '<text class="stop sm" x="' + gx + '" y="' + ty + '" text-anchor="middle">✕ stops short</text>' :
          '<text class="stop" x="' + gx + '" y="' + (ty - 10) + '" text-anchor="middle">' + num(r.max) + ' % ✕<tspan x="' + gx + '" dy="22">stops short</tspan></text>';
      }
    });
    s += '<line x1="' + x(10) + '" x2="' + x(45) + '" y1="' + yb + '" y2="' + yb + '" stroke="var(--line)"/>';
    for (var v = 10; v <= 45; v += nw ? 10 : 5) s += '<line x1="' + x(v) + '" x2="' + x(v) + '" y1="' + yb + '" y2="' + (yb + 6) + '" stroke="var(--line)"/><text class="tick" x="' + x(v) + '" y="' + (yb + 24) + '" text-anchor="middle">' + v + " %</text>";
    s += '<text class="axis-title" x="' + ((x(10) + x(45)) / 2) + '" y="' + (yb + (nw ? 44 : 50)) + '" text-anchor="middle">Oxygen in ambient air (percent)</text>';
    return s + "</svg>";
  }
  // a small range bar for one investigation: its tested min..max against a threshold
  function rangeBar(lo, hi, d0, d1, thr, better, unit) {
    var W = 300, H = 46, L = 6, R = 6, x = scaleLin(d0, d1, L, W - R), cl = function (v) { return Math.max(d0, Math.min(d1, v)); };
    var zx0 = better === "above" ? x(thr) : L, zx1 = better === "above" ? W - R : x(thr);
    var s = '<svg class="mini" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Tested ' + num(lo) + " to " + num(hi) + " " + unit + '">';
    s += '<rect class="zone" x="' + zx0 + '" y="4" width="' + (zx1 - zx0) + '" height="22" rx="4"/>';
    s += '<rect class="bar-track" x="' + L + '" y="10" width="' + (W - L - R) + '" height="10" rx="5"/>';
    s += '<rect x="' + x(cl(lo)) + '" y="10" width="' + Math.max(5, x(cl(hi)) - x(cl(lo))) + '" height="10" rx="5" fill="var(--flame)"/>';
    s += '<line class="zone-edge" x1="' + x(thr) + '" x2="' + x(thr) + '" y1="2" y2="28"/>';
    s += '<text x="' + L + '" y="42">' + d0 + "</text>" + '<text x="' + x(thr) + '" y="42" text-anchor="middle" class="zone-label">' + num(thr) + "</text>" + '<text x="' + (W - R) + '" y="42" text-anchor="end">' + d1 + " " + unit + "</text>";
    return s + "</svg>";
  }
  function setTitle(t) { document.title = "Flame in Freefall: " + t; }

  // ----------------------------------------------------------------- charts
  function scaleLin(d0, d1, r0, r1) { return function (v) { return r0 + (v - d0) / (d1 - d0) * (r1 - r0); }; }

  function pointAttrs(t, extra) {
    return ' class="pt" data-i="' + t._i + '"' + (extra || "");
  }

  function laneChart(opts) {
    opts = opts || {};
    var lanes = LANES.slice();
    if (opts.burner) lanes.push("burner");
    var nw = narrow(), W = nw ? 380 : 1000, L = nw ? 10 : 232, R = nw ? 10 : 18, T = 44, laneH = nw ? 62 : opts.compact ? 54 : 80, B = 42;
    var H = T + lanes.length * laneH + B;
    var xmax = opts.burner ? 90 : 45, x = scaleLin(10, xmax, L, W - R);
    var zone = D.about.moon_base.o2_min_percent;
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Ambient oxygen of every test, grouped by what burns. Solid materials stop at ' +
      num(D.summary.o2_range_by_class.solid.max) + ' percent; the Moon Base zone starts at 30 percent.">';
    s += '<rect class="zone" x="' + x(zone) + '" y="' + T + '" width="' + (W - R - x(zone)) + '" height="' + (lanes.length * laneH) + '"/>';
    s += '<text class="zone-label" x="' + (x(zone) + 8) + '" y="' + (T - 26) + '">' + (nw ? "Moon Base: " + num(zone) + " % +" : "Moon Base air: " + num(zone) + " % oxygen or more") + "</text>";
    s += '<text x="' + (x(zone) + 8) + '" y="' + (T - 10) + '">(challenge statement)</text>';
    s += '<text x="' + (x(21) - 6) + '" y="' + (T - 10) + '" text-anchor="end" class="earth-label">Earth air 21 %</text>';
    lanes.forEach(function (cls, k) {
      var y0 = T + k * laneH;
      if (k % 2 === 0) s += '<rect x="0" y="' + y0 + '" width="' + W + '" height="' + laneH + '" fill="rgba(255,255,255,.022)"/>';
      var label = cls === "burner" ? "Oxygen blown from a burner" : D.about.class_labels[cls];
      var pts = TESTS.filter(function (t) { return cls === "burner" ? t.burner_o2 != null : (t.cls === cls && (t.o2 != null || t.o2_list)); });
      var plain = pts.filter(function (t) { return cls === "burner" ? true : t.o2 != null; }).length;
      var listed = pts.length - plain;
      var invs = D.investigations.filter(function (i) { return i.cls === cls; });
      var plotted = {}; pts.forEach(function (t) { plotted[t.inv] = 1; });
      var missing = invs.filter(function (i) { return !plotted[i.id]; }).length;
      if (nw) {
        s += '<text class="lane-label small" x="' + (L + 2) + '" y="' + (y0 + 13) + '">' + esc(label) + "</text>";
      } else {
      s += '<circle cx="14" cy="' + (y0 + 20) + '" r="6" fill="' + COLOR[cls] + '"/>';
      s += '<text class="lane-label" x="28" y="' + (y0 + 24) + '">' + esc(label) + "</text>";
      }
      var sub = cls === "burner" ? "not an atmosphere; " + plain + " tests" :
        (plain ? plain + " tests plotted" : "") + (listed ? (plain ? ", " : "") + listed + " rows listing values" : "") + (!pts.length ? "no oxygen stated" : "");
      if (nw) {
        // phones: the lane name is enough; counts are in the tooltip and the text above
      } else if (!opts.compact) {
        s += '<text x="28" y="' + (y0 + 42) + '">' + esc(sub) + "</text>";
        if (cls !== "burner" && missing) s += '<text x="28" y="' + (y0 + 58) + '" fill="#959599">' + missing + " of " + invs.length + " investigations not plotted</text>";
      } else {
        s += '<text x="28" y="' + (y0 + 40) + '">' + esc(sub) + "</text>";
      }
      var above = 0;
      pts.forEach(function (t) {
        var yy = y0 + (nw ? 20 : 12) + hash01(t.row, t.inv.length + t.table.length) * (laneH - (nw ? 28 : 24));
        if (cls === "burner") {
          s += '<circle cx="' + x(t.burner_o2).toFixed(1) + '" cy="' + yy.toFixed(1) + '" r="3" fill="' + COLOR.burner + '"' + pointAttrs(t, ' data-k="burner"') + "/>";
        } else if (t.o2 != null) {
          if (t.o2 >= zone) above++;
          s += '<circle cx="' + x(t.o2).toFixed(1) + '" cy="' + yy.toFixed(1) + '" r="3.1" fill="' + COLOR[cls] + '"' + pointAttrs(t) + "/>";
        } else {
          t.o2_list.forEach(function (v, n) {
            if (v >= zone) above++;
            var cx = x(v), cy = y0 + 12 + hash01(t.row * 7 + n, 3) * (laneH - 24);
            s += '<path d="M' + cx.toFixed(1) + " " + (cy - 5).toFixed(1) + "l5 5l-5 5l-5-5z" + '" fill="none" stroke="' + COLOR[cls] + '" stroke-width="1.6"' + pointAttrs(t) + "/>";
          });
        }
      });
      if (cls !== "burner" && !above) {
        s += '<text x="' + ((x(zone) + W - R) / 2) + '" y="' + (y0 + laneH / 2 + 4) + '" text-anchor="middle" class="zone-label">' +
          (pts.length ? "no test in this zone" : "no oxygen level stated") + "</text>";
      }
    });
    var yb = T + lanes.length * laneH;
    s += '<line class="zone-edge" x1="' + x(zone) + '" x2="' + x(zone) + '" y1="' + (T - 4) + '" y2="' + yb + '"/>';
    s += '<line class="earth" x1="' + x(21) + '" x2="' + x(21) + '" y1="' + (T - 4) + '" y2="' + yb + '"/>';
    s += '<g class="axis"><line x1="' + L + '" x2="' + (W - R) + '" y1="' + yb + '" y2="' + yb + '"/>';
    for (var v = 10; v <= xmax; v += opts.burner || nw ? 10 : 5) {
      s += '<line x1="' + x(v) + '" x2="' + x(v) + '" y1="' + yb + '" y2="' + (yb + 5) + '"/><text x="' + x(v) + '" y="' + (yb + 19) + '" text-anchor="middle">' + v + " %</text>";
    }
    s += '</g><text x="' + ((L + W - R) / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' +
      (opts.burner ? "oxygen, percent (cabin air in the upper lanes; burner flow in the last lane)" : "ambient oxygen around the flame, percent") + "</text></svg>";
    return s;
  }

  function scatterChart() {
    var nw = narrow(), W = nw ? 380 : 1000, L = nw ? 34 : 70, R = nw ? 10 : 18, T = 28, B = 46, H = nw ? 380 : 420;
    var x = scaleLin(10, 45, L, W - R), y = scaleLin(0, 46, H - B, T);
    var zo = D.about.moon_base.o2_min_percent, zp = D.about.moon_base.pressure_max_psi;
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Oxygen against pressure for the ' + D.summary.rows_with_both +
      " tests that state both. " + D.summary.rows_in_zone + ' fall inside the Moon Base zone.">';
    s += '<rect class="zone" x="' + x(zo) + '" y="' + y(zp) + '" width="' + (W - R - x(zo)) + '" height="' + (y(0) - y(zp)) + '"/>';
    s += '<rect x="' + x(zo) + '" y="' + y(zp) + '" width="' + (W - R - x(zo)) + '" height="' + (y(0) - y(zp)) + '" fill="none" class="zone-edge"/>';
    for (var p = 0; p <= 45; p += 5) {
      s += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(p) + '" y2="' + y(p) + '" opacity=".5"/><text x="' + (L - 8) + '" y="' + (y(p) + 4) + '" text-anchor="end">' + p + "</text>";
    }
    for (var v = 10; v <= 45; v += nw ? 10 : 5) s += '<text x="' + x(v) + '" y="' + (H - B + 18) + '" text-anchor="middle">' + v + " %</text>";
    s += '<line class="earth" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(14.7) + '" y2="' + y(14.7) + '"/><text x="' + (L + 6) + '" y="' + (y(14.7) - 5) + '" class="earth-label">Earth sea level 14.7 psi</text>';
    TESTS.forEach(function (t) {
      if (t.in_zone == null) return;
      s += '<circle cx="' + x(t.o2).toFixed(1) + '" cy="' + y(t.p_psi).toFixed(1) + '" r="' + (t.in_zone ? 4.2 : 3) + '" fill="' + COLOR[t.cls] + '"' + pointAttrs(t) + "/>";
    });
    s += '<text class="zone-label" x="' + (W - R - 8) + '" y="' + (y(0) - 10) + '" text-anchor="end">Moon Base: ' + num(zo) + " % +, " + num(zp) + " psi or less</text>";
    s += '<text x="' + ((L + W - R) / 2) + '" y="' + (H - 6) + '" text-anchor="middle">ambient oxygen, percent</text>';
    s += nw ? '<text x="' + (L - 6) + '" y="' + (T - 10) + '" text-anchor="end">psi</text></svg>' : '<text transform="translate(16 ' + ((T + H - B) / 2) + ') rotate(-90)" text-anchor="middle">pressure, psi (converted)</text></svg>';
    return s;
  }

  function legend(classes) {
    return '<div class="legend">' + classes.map(function (c) {
      return '<span class="chip"><i style="background:' + COLOR[c] + '"></i>' + esc(c === "burner" ? "Burner-flow oxygen" : D.about.class_labels[c]) + "</span>";
    }).join("") + '<span>● one test with a plain number</span><span>◇ a value listed for a test day or fuel</span><span>Click any mark to see NASA\'s table row.</span></div>';
  }

  function bindPoints(root) {
    root.addEventListener("mousemove", function (e) {
      var el = e.target.closest ? e.target.closest(".pt") : null;
      if (!el) { tip.hidden = true; return; }
      var t = TESTS[+el.getAttribute("data-i")], inv = BY_ID[t.inv];
      var h = "<b>" + esc(inv.name) + "</b>";
      if (t.fuel) h += "<span>" + esc(t.fuel) + "</span>";
      if (el.getAttribute("data-k") === "burner") h += "<span>Oxygen from the burner: " + num(t.burner_o2) + " % (as written: " + esc(t.burner_o2_raw) + ")</span><span>The atmosphere around it is fuel gas.</span>";
      else if (t.o2 != null) h += "<span>Ambient oxygen: " + num(t.o2) + " % (as written: " + esc(t.o2_raw) + ")</span>";
      else if (t.o2_list) h += "<span>Oxygen levels listed: " + esc(t.o2_raw) + "</span>";
      if (t.p_psi != null) h += "<span>Pressure: " + num(t.p_psi) + " psi (as written: " + esc(t.p_raw) + " " + esc(t.p_unit) + ")</span>";
      else if (t.p_raw) h += "<span>Pressure as written: " + esc(t.p_raw) + "</span>";
      if (t.outcome) h += "<span>" + esc(t.outcome) + "</span>";
      h += "<span>Table row " + t.row + ". Click to open it.</span>";
      tip.innerHTML = h; tip.hidden = false;
      var px = Math.min(e.clientX + 14, window.innerWidth - 310), py = e.clientY + 16;
      if (py > window.innerHeight - 160) py = e.clientY - 150;
      tip.style.left = px + "px"; tip.style.top = py + "px";
    });
    root.addEventListener("mouseleave", function () { tip.hidden = true; });
    root.addEventListener("click", function (e) {
      var el = e.target.closest ? e.target.closest(".pt") : null;
      if (!el) return;
      var t = TESTS[+el.getAttribute("data-i")];
      openTable(t.table, t.row);
    });
  }

  // ------------------------------------------------------------ table viewer
  function parseCSV(text) {
    var rows = [], row = [], cell = "", q = false, i = 0, c;
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    for (; i < text.length; i++) {
      c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ",") { row.push(cell); cell = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(cell); rows.push(row); row = []; cell = "";
      } else cell += c;
    }
    if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  function openTable(file, hitRow) {
    var modal = document.getElementById("modal"), body = document.getElementById("modal-body");
    var inv = BY_ID[file.split("_")[0]];
    var info = inv.tables.filter(function (t) { return t.file === file; })[0];
    document.getElementById("modal-title").textContent = inv.name + ": NASA's Experimental Table";
    body.innerHTML = '<p class="muted">Loading…</p>';
    modal.hidden = false;
    document.getElementById("modal-close").focus();
    fetch("data/tables/" + file).then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
      var text;
      try { text = new TextDecoder("utf-8", { fatal: true }).decode(buf); }
      catch (e) { text = new TextDecoder("windows-1252").decode(buf); }
      var rows = parseCSV(text), h = "";
      h += '<p class="small muted">File <span class="asw">' + esc(info.psi_file_name) + "</span>, exactly as downloaded from PSI on " + esc(info.retrieved.slice(0, 10)) +
        '. One row is one ' + esc(info.row_meaning) + '. <a href="' + inv.psi_url + '" target="_blank" rel="noopener">Open this investigation on NASA PSI</a>. <a href="data/tables/' + file + '" download>Download this table</a></p>';
      h += '<div class="tablewrap"><table><thead><tr><th>Row</th>' + rows[0].map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") + "</tr></thead><tbody>";
      for (var i = 1; i < rows.length; i++) {
        if (!rows[i].some(function (c) { return c.trim(); })) continue;
        h += "<tr" + (i + 1 === hitRow ? ' class="hit" id="hit"' : "") + '><td class="rn">' + (i + 1) + "</td>" +
          rows[i].map(function (c) { return '<td title="' + esc(c) + '">' + esc(c) + "</td>"; }).join("") + "</tr>";
      }
      body.innerHTML = h + "</tbody></table></div>";
      var hit = document.getElementById("hit");
      if (hit) hit.scrollIntoView({ block: "center" });
    }).catch(function () { body.innerHTML = "<p>Could not load the table.</p>"; });
  }
  function closeModal() { document.getElementById("modal").hidden = true; }

  // ------------------------------------------------------------------ views
  // The journey: where the evidence was gathered, and where it is needed.
  var stopState = "moon";
  function stopDetail() {
    var S = D.summary, R = S.o2_range_by_class, zone = D.about.moon_base.o2_min_percent, zp = D.about.moon_base.pressure_max_psi;
    var ground = D.investigations.filter(function (i) { return i.ground; }), flight = D.investigations.filter(function (i) { return !i.ground; });
    var lo = Math.min.apply(null, Object.keys(R).map(function (k) { return R[k].min; })), hi = Math.max.apply(null, Object.keys(R).map(function (k) { return R[k].max; }));
    function chips(list) {
      return '<div class="invchips">' + list.map(function (i) {
        return '<a href="#/inv/' + i.id + '"><span class="swatch" style="background:' + COLOR[i.cls] + ';margin:0"></span>' + esc(i.name) + "</a>";
      }).join("") + "</div>";
    }
    if (stopState === "earth") return '<div><h3>Earth</h3><div class="count">' + ground.length + ' <small>investigations</small></div><p class="muted small">Laboratory and computer studies that build on the flight data.</p></div>' +
      "<div><ul><li>Normal gravity: hot air rises and feeds a flame.</li><li>Earth air: 21 % oxygen at 14.7 psi.</li><li>NASA's screening test for spacecraft materials is run here.</li></ul>" + chips(ground) + "</div>";
    if (stopState === "orbit") return '<div><h3>Low Earth orbit</h3><div class="count">' + flight.length + ' <small>investigations</small></div><p class="muted small">Run on the space station or in a cargo spacecraft, in weightlessness.</p></div>' +
      "<div><ul><li>Ambient oxygen tested from " + num(lo) + " % to " + num(hi) + " %.</li><li>Solid materials stop at " + num(R.solid.max) + " %.</li><li>" + S.rows_in_zone + " of " + S.rows_with_both +
      " tests that state both oxygen and pressure are in Moon Base air. All are gas flames.</li></ul>" + chips(flight) + "</div>";
    return '<div><h3>Moon Base</h3><div class="count">' + S.records_mentioning_moon_or_partial_gravity + ' <small>of ' + S.investigations + ' records mention the Moon</small></div><p class="muted small">NASA plans the base near the lunar South Pole.</p></div>' +
      "<div><ul><li>Air expected: " + num(zone) + " % oxygen or more, at " + num(zp) + " psi or less.</li><li>Solid-material tests in PSI at " + num(zone) + " % oxygen or more: " + R.solid.rows_at_or_above +
      '.</li><li>No investigation in PSI was run in Moon gravity.</li></ul><p style="margin-top:1rem"><a class="btn ghost sm" href="#/questions">See what is still open</a></p></div>';
  }
  function journey() {
    var stops = [["earth", "Earth", "normal gravity"], ["orbit", "Low Earth orbit", "weightless"], ["moon", "Moon Base", "where the data is needed"]];
    return '<div class="journey"><div class="track" role="tablist" aria-label="Where the evidence was gathered">' + stops.map(function (x) {
      return '<button class="stop' + (stopState === x[0] ? " on" : "") + '" data-stop="' + x[0] + '" role="tab" aria-selected="' + (stopState === x[0]) + '"><span class="node ' + x[0] + '"></span><b>' + x[1] + "</b><span class=\"sub\">" + x[2] + "</span></button>";
    }).join("") + '</div><div class="stop-detail" id="stop-detail" role="tabpanel">' + stopDetail() + "</div></div>";
  }

  function viewHome() {
    setTitle("Overview");
    var S = D.summary, solid = S.o2_range_by_class.solid, zone = D.about.moon_base.o2_min_percent;
    var h = '<section class="hero"><div><p class="eyebrow">NASA Space Apps Challenge 2026</p>';
    h += '<h1 class="hero-title">Solid-material evidence <em>stops before</em> Moon Base air.</h1>';
    h += '<p class="lead">NASA\'s Moon Base is expected to hold air with ' + num(zone) + " % oxygen or more. In NASA's microgravity fire data, solid-material tests reach " + num(solid.max) + " %.</p>";
    h += '<div class="row"><a class="btn" href="#/map">See the coverage map</a><a class="btn ghost" href="#/rank">Explore the ' + S.investigations + " investigations</a></div>";
    h += '<p class="scroll-hint">Scroll for the evidence ↓</p></div>';
    h += '<aside class="stats" aria-label="Key numbers">';
    h += '<a class="stat hot" href="#/map"><b>' + S.rows_in_zone + "<small> / " + S.rows_with_both + "</small></b>tests run in Moon Base air. All gas flames, all from " + esc(BY_ID[S.investigations_in_zone[0]].name) + ".</a>";
    h += '<a class="stat" href="#/rank"><b>' + S.meet_all_five + "<small> / " + S.investigations + "</small></b>investigations meet all five Moon Base conditions.</a>";
    h += '<a class="stat" href="#/questions"><b>' + S.records_mentioning_moon_or_partial_gravity + "<small> / " + S.investigations + "</small></b>records mention the Moon, Mars or partial gravity.</a>";
    h += "</aside></section>";

    h += '<div class="sec"><span>01</span><h2>The gap in one picture</h2></div>';
    h += '<p class="muted">Each bar runs from the lowest to the highest oxygen level that NASA tested for one kind of fuel. The shaded zone is Moon Base air.</p>';
    h += '<div class="chart hero-chart" id="chart-bars">' + fuelBars() + "</div>";
    h += '<div class="hero-foot"><div class="legend"><strong>What burns</strong>' + ["solid", "droplet", "gas"].map(function (c) {
      return '<span class="chip"><i style="background:' + COLOR[c] + '"></i>' + esc(D.about.class_labels[c]) + "</span>";
    }).join("") + "</div></div>";
    h += '<details class="howto"><summary>How to read this</summary><p>The bars use the ambient oxygen stated in NASA\'s Experimental Tables. Moon Base air is taken from the challenge statement: ' + num(zone) + " % oxygen or more, at " +
      num(D.about.moon_base.pressure_max_psi) + ' psi or less. <a href="#/map">The coverage map</a> shows every single test.</p><p>This shows which conditions NASA tested, not how fire behaves on the Moon: no investigation in PSI was run in Moon gravity.</p></details>';

    h += '<div class="sec"><span>02</span><h2>From Earth to the Moon Base</h2></div>';
    h += '<p class="muted">Where NASA\'s fire evidence was gathered, and where it is needed next. Choose a stop.</p>' + journey();

    h += '<div class="sec"><span>03</span><h2>Explore</h2></div><div class="steps">';
    h += '<a class="step" href="#/map"><i>01</i><b>Coverage map</b>Every NASA test placed by oxygen and pressure, with Moon Base air marked. Click a mark to see NASA\'s own table row.<br><u>Open the map</u></a>';
    h += '<a class="step" href="#/rank"><i>02</i><b>Ranking</b>All ' + S.investigations + " investigations ordered by how close they came to Moon Base air, with the evidence for each.<br><u>Open the ranking</u></a>";
    h += '<a class="step" href="#/questions"><i>03</i><b>Open questions</b>Six fire-safety questions for a Moon Base: what the data answers, and what is missing.<br><u>Open the questions</u></a>';
    h += "</div>";
    main.innerHTML = h;
  }

  function viewMap() {
    setTitle("Coverage map");
    var S = D.summary;
    var h = '<p class="eyebrow">Coverage map</p><h1>Where NASA\'s fire tests sit, and where the Moon Base sits</h1>';
    h += '<p class="lead">One mark per NASA test. Shaded: Moon Base air. Click a mark to see NASA\'s table row.</p>';
    h += "<h2>1. Oxygen, by what burns</h2>";
    h += '<p class="muted">' + S.rows_with_o2_at_or_above + " of " + S.rows_with_plain_ambient_o2 + " tests are at " +
      num(D.about.moon_base.o2_min_percent) + " % oxygen or more. Solid materials: " + S.o2_range_by_class.solid.rows_at_or_above + ".</p>";
    h += '<label class="check"><input type="checkbox" id="burner"> Show burner-flow oxygen (up to 85 %, not cabin air)</label>';
    h += '<div class="chart" id="chart-lanes">' + laneChart() + '</div><div id="legend-lanes">' + legend(["solid", "emulated", "droplet", "gas"]) + "</div>";
    h += '<details class="howto"><summary>Why the 85 % in the challenge statement does not count</summary><p>In those tests (inverse flames in ' +
      invLink("PSI-159") + " and " + invLink("PSI-10") + ") the oxygen is blown out of the burner into a chamber filled with fuel gas. It is a flow, not the air a crew would breathe, so this dashboard never mixes it with ambient oxygen.</p></details>";

    h += "<h2>2. Oxygen and pressure together</h2>";
    h += '<p class="muted">' + S.rows_in_zone + " of " + S.rows_with_both + " tests that state both fall inside the zone. Only " + S.state_pressure + " investigations state pressure at all.</p>";
    h += '<div class="chart" id="chart-scatter">' + scatterChart() + "</div>" + legend(["droplet", "gas"]);

    h += "<h2>3. Not on the map</h2>";
    h += '<p class="muted">Their table gives oxygen as text, or not at all. Shown as NASA wrote them.</p>';
    h += '<div class="tablewrap"><table><thead><tr><th>Investigation</th><th>What burns</th><th>Oxygen in the table</th><th>Pressure in the table</th></tr></thead><tbody>';
    D.investigations.slice().sort(function (a, b) { return LANES.indexOf(a.cls) - LANES.indexOf(b.cls); }).forEach(function (i) {
      var o = i.criteria.oxygen, p = i.criteria.pressure;
      if (o.value === "yes" || o.value === "no") return;
      h += '<tr><td class="rank-name">' + invLink(i.id) + "<small>" + esc(i.id) + "</small></td><td>" + chip(i.cls) + "</td><td>" + esc(o.detail) + "</td><td>" + esc(p.detail) + "</td></tr>";
    });
    h += "</tbody></table></div>";
    main.innerHTML = h;
    bindPoints(document.getElementById("chart-lanes"));
    bindPoints(document.getElementById("chart-scatter"));
    document.getElementById("burner").addEventListener("change", function (e) {
      document.getElementById("chart-lanes").innerHTML = laneChart({ burner: e.target.checked });
      document.getElementById("legend-lanes").innerHTML = legend(e.target.checked ? ["solid", "emulated", "droplet", "gas", "burner"] : ["solid", "emulated", "droplet", "gas"]);
    });
  }

  var rankState = { sort: "match", cls: "all", q: "", open: {} }, drawRank = null;
  function critDetail(inv) {
    return '<div class="crit">' + CRIT.map(function (c) {
      var k = inv.criteria[c[0]], extra = "";
      if (c[0] === "purpose") {
        extra = k.quote ? quote(inv.id, k.field, k.quote) : "<p class=\"small\">" + esc(k.detail) + "</p>";
        if (k.psi_sub_research_area) extra += '<p class="small muted">PSI sub-research area: ' + esc(k.psi_sub_research_area) + "</p>";
      } else extra = '<p class="small">' + esc(k.detail) + "</p>";
      return "<div><h4>" + dot(k) + esc(c[1]) + "</h4><strong>" + VALUE_WORD[k.value] + "</strong>" + extra + "</div>";
    }).join("") + "</div>";
  }
  function viewRank() {
    setTitle("Ranking");
    var S = D.summary;
    var h = '<p class="eyebrow">Ranking</p><h1>Which investigations come closest to the Moon Base?</h1>';
    h += '<p class="lead">Five Moon Base conditions, one square each. More green, closer to Moon Base air. Click a row for the evidence.</p>';
    h += '<div class="legend"><span><span class="sq full"></span> met</span><span><span class="sq half"></span> half</span><span><span class="sq none"></span> not met</span><span><span class="sq unknown"></span> not stated</span></div>';
    h += '<details class="howto"><summary>The five conditions</summary><ol>' + CRIT.map(function (c) { return "<li><strong>" + esc(c[1]) + ".</strong> " + esc(c[2]) + "</li>"; }).join("") +
      '</ol><p class="small muted">Half: fire safety named only as a benefit, or a burner or model standing in for solids. Ties are ordered by fire-safety purpose, then solid materials. The conditions are this team\'s reading; the numbers are NASA\'s.</p></details>';
    h += '<div class="filters"><input type="search" id="q" placeholder="Search name, fuel, material…" aria-label="Search investigations" value="' + esc(rankState.q) + '">';
    h += '<span class="seg" role="group" aria-label="Sort">' + [["match", "Closest to Moon Base air"], ["purpose", "Fire-safety purpose first"]].map(function (o) {
      return '<button data-sort="' + o[0] + '" class="' + (rankState.sort === o[0] ? "on" : "") + '">' + o[1] + "</button>";
    }).join("") + "</span></div>";
    h += '<div class="filters" role="group" aria-label="Filter by what burns"><button data-cls="all" class="' + (rankState.cls === "all" ? "on" : "") + '">All ' + S.investigations + "</button>" +
      ["solid", "smoke", "emulated", "droplet", "gas", "aerosol"].map(function (c) {
        var n = D.investigations.filter(function (i) { return i.cls === c; }).length;
        return '<button data-cls="' + c + '" class="' + (rankState.cls === c ? "on" : "") + '">' + esc(D.about.class_labels[c]) + " (" + n + ")</button>";
      }).join("") + "</div>";
    h += '<div id="rank-table"></div>';
    main.innerHTML = h;
    function draw() {
      var list = D.investigations.filter(function (i) {
        if (rankState.cls !== "all" && i.cls !== rankState.cls) return false;
        if (!rankState.q) return true;
        var hay = [i.id, i.name, i.title, i.cls_label, i.summary.did].concat(i.tables.map(function (t) {
          return t.fuel ? t.fuel.values.map(function (v) { return v.text; }).join(" ") : "";
        })).join(" ").toLowerCase();
        return hay.indexOf(rankState.q.toLowerCase()) >= 0;
      });
      if (rankState.sort === "purpose") list = list.slice().sort(function (a, b) {
        return b.criteria.purpose.score - a.criteria.purpose.score || b.criteria.material.score - a.criteria.material.score || a.rank - b.rank;
      });
      var t = '<div class="tablewrap"><table class="grid"><thead><tr><th class="num">#</th><th>Investigation</th>' + CRIT.map(function (c) { return '<th class="sqh" title="' + esc(c[2]) + '"><span class="full">' + esc(SHORT[c[0]]) + '</span><span class="short">' + (CRIT.indexOf(c) + 1) + "</span></th>"; }).join("") +
        '<th class="num">Met</th></tr></thead><tbody>';
      list.forEach(function (i) {
        var open = !!rankState.open[i.id], rows = i.tables.reduce(function (a, x) { return a + x.entries; }, 0);
        t += '<tr class="pick' + (open ? " on" : "") + '" data-open="' + i.id + '" tabindex="0" aria-expanded="' + open + '"><td class="num">' + i.rank +
          '</td><td class="rank-name"><span class="swatch" style="background:' + COLOR[i.cls] + '"></span>' + esc(i.name) + "<small>" + esc(i.cls_label) + "</small></td>" +
          CRIT.map(function (c) { return '<td class="sqc">' + cell(i.criteria[c[0]], c[1]) + "</td>"; }).join("") + '<td class="num"><span class="score">' + num(i.score) + "</span></td></tr>";
        if (open) t += '<tr class="detail"><td colspan="8"><p>' + esc(i.summary.did) + ' <span class="ai">AI-written summary</span></p>' + critDetail(i) +
          '<p style="margin-top:.7rem"><a class="btn sm" href="#/inv/' + i.id + '">Open ' + esc(i.name) + "</a></p></td></tr>";
      });
      if (!list.length) t += '<tr><td colspan="8" class="muted">Nothing matches.</td></tr>';
      document.getElementById("rank-table").innerHTML = t + "</tbody></table></div>";
    }
    drawRank = draw;
    draw();
    document.getElementById("q").addEventListener("input", function (e) { rankState.q = e.target.value; draw(); });
  }

  function cells(list, limit) {
    if (!list || !list.length) return "";
    return list.slice(0, limit || 12).map(function (c) {
      return '<span class="asw">' + esc(c.text) + "</span>" + (c.rows > 1 ? " ×" + c.rows : "");
    }).join(", ") + (list.length > (limit || 12) ? ", and " + (list.length - (limit || 12)) + " more" : "");
  }
  function o2Text(t) {
    var a = t.ambient_o2;
    if (!a) return null;
    var parts = [];
    if (a.numbers) parts.push(num(a.min) + " to " + num(a.max) + " % in " + a.numbers + " rows" + (a.times_100 ? " (mole fraction × 100)" : "") + "; " + a.at_or_above + " at 30 % or more");
    if (a.list_cells.length) parts.push("listed values: " + cells(a.list_cells));
    if (a.other_cells.length) parts.push("as written: " + cells(a.other_cells));
    if (a.blank) parts.push(a.blank + " blank");
    return parts.join("; ");
  }
  function pText(t) {
    var p = t.pressure;
    if (!p) return null;
    var parts = [];
    if (p.min != null) parts.push(num(p.min) + " to " + num(p.max) + " psi (converted from " + esc(p.unit_as_stated) + ": " + num(p.min_as_stated) + " to " + num(p.max_as_stated) + "); " + p.at_or_below + " rows at 10.2 psi or less");
    if (p.zero_cells) parts.push(p.zero_cells + " cell says 0, kept as written and not counted");
    if (p.other_cells.length) parts.push("as written: " + cells(p.other_cells));
    return parts.join("; ");
  }

  function tableBlock(inv, t) {
    var h = '<div class="panel"><div class="row" style="justify-content:space-between"><h3 style="margin:0">' + esc(t.psi_file_name.replace(/^PSI-\d+_Experimental table_/, "").replace(/\.csv$/, "")) +
      '</h3><button class="btn sm" data-table="' + t.file + '">Open NASA\'s table</button></div>';
    h += '<dl class="facts" style="margin-top:.7rem">';
    h += "<dt>Rows</dt><dd>" + t.entries + ", one per " + esc(t.row_meaning) + (t.other_rows ? " (plus " + t.other_rows + " note or continuation rows)" : "") + "</dd>";
    if (t.fuel) h += "<dt>" + esc(t.fuel.column.trim()) + "</dt><dd>" + t.fuel.distinct + " distinct, as written: " + cells(t.fuel.values, 10) + "</dd>";
    h += "<dt>Ambient oxygen</dt><dd>" + (o2Text(t) || '<span class="muted">not in this table</span>') + "</dd>";
    if (t.burner_o2) h += "<dt>Burner-flow oxygen</dt><dd>" + num(t.burner_o2.min) + " to " + num(t.burner_o2.max) + " % in " + t.burner_o2.numbers + " rows" +
      (t.burner_o2.other_cells.length ? "; as written: " + cells(t.burner_o2.other_cells) : "") + '. <span class="muted">Blown from the burner into fuel gas; not an atmosphere.</span></dd>';
    h += "<dt>Pressure</dt><dd>" + (pText(t) || '<span class="muted">not in this table</span>') + "</dd>";
    if (t.airflow) {
      var a = t.airflow;
      h += "<dt>Airflow</dt><dd>column <span class=\"asw\">" + esc(a.column.trim()) + "</span>" + (a.numbers ? ": " + num(a.min) + " to " + num(a.max) + " (" + esc(a.unit) + ") in " + a.numbers + " rows" : "") +
        (a.other_cells.length ? "; as written: " + cells(a.other_cells, 6) : "") + "</dd>";
    }
    h += "<dt>What varies</dt><dd>" + (t.varies.length ? t.varies.length + " of " + t.header.length + ' columns change from row to row: <span class="cols">' +
      t.varies.map(function (c) { return '<span class="asw">' + esc(c.trim()) + "</span>"; }).join("") + "</span>" : "nothing") + "</dd>";
    h += "<dt>All columns</dt><dd><span class=\"cols\">" + t.header.map(function (c) { return '<span class="asw">' + esc(c.trim() || "(blank)") + "</span>"; }).join("") + "</span></dd>";
    h += "</dl></div>";
    return h;
  }

  function viewInv(id) {
    var inv = BY_ID[id];
    if (!inv) return viewHome();
    setTitle(inv.name);
    var h = '<p class="small"><a href="#/rank">← Ranking</a></p><div class="inv-head"><div><p class="eyebrow">' + esc(inv.id) + ", rank " + inv.rank + " of " + D.summary.investigations + "</p><h1>" + esc(inv.name) + "</h1>";
    h += '<p class="lead">' + esc(inv.title) + (inv.name_is_ours ? ' <span class="small muted">(PSI gives no acronym; the short name is ours)</span>' : "") + "</p>";
    h += '<div class="row">' + chip(inv.cls) + '<span class="chip">' + esc(inv.project_type) + '</span><span class="chip">' + esc(inv.gravity) + "</span>" +
      (inv.flight_program ? '<span class="chip">' + esc(inv.flight_program) + "</span>" : "") + "</div></div>";
    h += '<div><div class="score" style="font-size:1.8rem">' + num(inv.score) + ' <small>/ 5 Moon Base conditions</small></div><span class="sqrow">' + CRIT.map(function (c) { return cell(inv.criteria[c[0]], c[1]); }).join("") + "</span></div></div>";
    h += '<div class="row" style="margin:1rem 0"><a class="btn" href="' + inv.psi_url + '" target="_blank" rel="noopener">Open on NASA PSI</a>' +
      (inv.doi ? '<a class="btn ghost" href="https://doi.org/' + esc(inv.doi) + '" target="_blank" rel="noopener">DOI ' + esc(inv.doi) + "</a>" : "") +
      '<label class="small muted">Compare with <select id="cmp"><option value="">choose…</option>' + D.investigations.filter(function (i) { return i.id !== id; }).map(function (i) {
        return '<option value="' + i.id + '">' + esc(i.name) + "</option>";
      }).join("") + "</select></label></div>";

    var co = inv.criteria.oxygen, cp = inv.criteria.pressure;
    h += '<div class="tiles">';
    h += '<div class="tile"><b class="sm"><span class="swatch" style="background:' + COLOR[inv.cls] + '"></span>' + esc(inv.cls_label) + "</b><span>what burns</span></div>";
    h += '<div class="tile"><b class="sm">' + esc(inv.gravity) + "</b><span>where it was tested</span></div>";
    h += '<div class="tile"><b class="sm">Oxygen</b>' + (co.min != null ? rangeBar(co.min, co.max, 10, 45, D.about.moon_base.o2_min_percent, "above", "%") + "<span>tested " + num(co.min) + " to " + num(co.max) + " %</span>" : "<span>" + esc(VALUE_WORD[co.value]) + "</span>") + "</div>";
    h += '<div class="tile"><b class="sm">Pressure</b>' + (cp.min != null ? rangeBar(cp.min, cp.max, 0, 50, D.about.moon_base.pressure_max_psi, "below", "psi") + "<span>tested " + num(cp.min) + " to " + num(cp.max) + " psi</span>" : "<span>" + esc(VALUE_WORD[cp.value]) + "</span>") + "</div>";
    h += "</div>";
    h += '<div class="grid2"><div class="panel"><h2 style="margin-top:0">In plain words</h2><p class="ai" style="margin:-.4rem 0 .8rem">AI-written from the PSI record</p><p>' + esc(inv.summary.did) + "</p><ul class=\"clean\">";
    inv.summary.points.forEach(function (p) {
      h += '<li><span class="kind ' + p.kind + '">' + KIND[p.kind] + "</span>" + esc(p.text) + quote(inv.id, p.field, p.quote) + "</li>";
    });
    h += '</ul><p class="small muted">Aim = what it set out to do. Expected = what its authors expected beforehand. Result = a finding the record states. The quotations are NASA\'s words, checked by program against the record.</p></div>';
    h += '<div class="panel"><h2 style="margin-top:0">Against the Moon Base</h2>' + critDetail(inv) + "</div></div>";

    h += "<h2>What NASA's table records</h2>";
    if (!inv.tables.length) h += '<p class="muted">PSI holds no Experimental Table for this investigation. Its results are in its publications and documents.</p>';
    inv.tables.forEach(function (t) { h += tableBlock(inv, t); });

    h += "<h2>NASA's description, word for word</h2><div class=\"panel\">";
    Object.keys(FIELD).forEach(function (k, n) {
      if (inv.text[k]) h += "<details" + (n === 0 ? " open" : "") + "><summary>" + FIELD[k] + "</summary><p>" + esc(inv.text[k]) + "</p></details>";
    });
    h += '<dl class="facts" style="margin-top:.8rem">' +
      (inv.hardware ? "<dt>Hardware</dt><dd>" + esc(inv.hardware) + "</dd>" : "") +
      (inv.start ? "<dt>Dates</dt><dd>" + esc(inv.start) + " to " + esc(inv.end || "not stated") + "</dd>" : "") +
      (inv.sub_research_area ? "<dt>PSI sub-research area</dt><dd>" + esc(inv.sub_research_area) + "</dd>" : "") +
      (inv.related.length ? "<dt>Related</dt><dd>" + inv.related.map(function (r) { return BY_ID[r] ? invLink(r) : esc(r); }).join(", ") + "</dd>" : "") +
      "<dt>License</dt><dd>" + esc(inv.license || "not stated in the record") + "</dd>" +
      "<dt>Snapshot</dt><dd>record retrieved " + esc(inv.record_retrieved.slice(0, 10)) + ', SHA-256 <span class="asw">' + esc(inv.record_sha256.slice(0, 16)) + "…</span></dd></dl></div>";

    h += "<h2>Publications listed by PSI (" + inv.publications.length + ")</h2>";
    if (inv.publications.length) {
      h += '<p class="muted small">Results live in these papers. ' + inv.publications_with_doi + " have a DOI.</p><ul class=\"clean pubs\">";
      inv.publications.forEach(function (p) {
        h += "<li>" + esc(p.title) + (p.year ? " (" + p.year + ")" : "") + (p.venue ? ', <span class="muted">' + esc(p.venue) + "</span>" : "") +
          (p.doi ? '<a href="https://doi.org/' + esc(p.doi) + '" target="_blank" rel="noopener">' + esc(p.doi) + "</a>" : ' <span class="muted">(no DOI listed)</span>') + "</li>";
      });
      h += "</ul>";
    } else h += '<p class="muted">None listed.</p>';
    main.innerHTML = h;
    document.getElementById("cmp").addEventListener("change", function (e) { if (e.target.value) location.hash = "#/compare/" + id + "/" + e.target.value; });
  }

  function viewCompare(a, b) {
    var A = BY_ID[a], B = BY_ID[b];
    if (!A || !B) return viewRank();
    setTitle(A.name + " and " + B.name);
    function tb(i, f) { return i.tables.length ? i.tables.map(f).filter(Boolean).join("<br>") || '<span class="muted">not in the table</span>' : '<span class="muted">no table in PSI</span>'; }
    var rows = [
      ["What burns (our label)", function (i) { return chip(i.cls); }],
      ["Where", function (i) { return esc(i.gravity) + (i.flight_program ? ", " + esc(i.flight_program) : ""); }],
      ["Dates", function (i) { return i.start ? esc(i.start) + " to " + esc(i.end || "not stated") : '<span class="muted">not stated</span>'; }],
      ["Hardware", function (i) { return esc(i.hardware || "not stated"); }],
      ["In plain words (AI-written)", function (i) { return esc(i.summary.did); }],
      ["Fire-safety purpose", function (i) { var k = i.criteria.purpose; return VALUE_WORD[k.value] + (k.quote ? quote(i.id, k.field, k.quote) : ""); }],
      ["Table rows", function (i) { return tb(i, function (t) { return t.entries + ", one per " + esc(t.row_meaning); }); }],
      ["Fuels or materials", function (i) { return tb(i, function (t) { return t.fuel ? t.fuel.distinct + " distinct: " + cells(t.fuel.values, 5) : ""; }); }],
      ["Ambient oxygen", function (i) { return tb(i, o2Text); }],
      ["Pressure", function (i) { return tb(i, pText); }],
      ["Airflow", function (i) { return tb(i, function (t) { var x = t.airflow; return x ? (x.numbers ? num(x.min) + " to " + num(x.max) + " (" + esc(x.unit) + ")" : "") + (x.other_cells.length ? " as written: " + cells(x.other_cells, 4) : "") : ""; }); }],
      ["What varies between rows", function (i) { return tb(i, function (t) { return t.varies.map(function (c) { return '<span class="asw">' + esc(c.trim()) + "</span>"; }).join(" "); }); }],
      ["Reaches 30 % oxygen", function (i) { return VALUE_WORD[i.criteria.oxygen.value]; }],
      ["Reaches 10.2 psi or less", function (i) { return VALUE_WORD[i.criteria.pressure.value]; }],
      ["Both in the same test", function (i) { return VALUE_WORD[i.criteria.both.value] + (i.criteria.both.rows ? " (" + i.criteria.both.rows + " tests)" : ""); }],
      ["Moon Base conditions met", function (i) { return dots(i) + " " + num(i.score) + " of 5"; }],
      ["Publications listed", function (i) { return String(i.publications.length); }]
    ];
    var h = '<p class="small"><a href="#/inv/' + a + '">← ' + esc(A.name) + '</a></p><p class="eyebrow">Compare</p><h1>' + esc(A.name) + " and " + esc(B.name) + "</h1>";
    h += '<p class="muted">Side by side, from NASA\'s records and tables. Rows marked "differs" are where the two are not the same.</p>';
    h += '<div class="tablewrap"><table class="cmp"><thead><tr><th></th><th>' + invLink(a) + "</th><th>" + invLink(b) + "</th></tr></thead><tbody>";
    rows.forEach(function (r) {
      var x = r[1](A), y = r[1](B);
      h += '<tr class="' + (x === y ? "" : "diff") + '"><td>' + r[0] + "</td><td>" + x + "</td><td>" + y + "</td></tr>";
    });
    h += "</tbody></table></div>";
    main.innerHTML = h;
  }

  function viewQuestions(focusId) {
    setTitle("Open questions");
    var word = { answered: "Answered", partly: "Partly answered", open: "Open" };
    var h = '<p class="eyebrow">Open questions</p><h1>Six fire-safety questions for a Moon Base</h1>';
    h += '<p class="lead">Red: open. Amber: partly answered. Click a tile for the evidence.</p>';
    h += '<div class="qgrid">' + D.questions.map(function (q) {
      return '<a class="qtile ' + q.status + '" href="#/questions/' + q.id + '"><span class="pill ' + q.status + '">' + word[q.status] + "</span><b>" + esc(q.question) + "</b></a>";
    }).join("") + "</div>";
    h += '<p class="small muted">Answers written with AI (Claude, Anthropic) from the PSI records and tables, reviewed by the team. Quotations and numbers are checked by program.</p>';
    D.questions.forEach(function (q) {
      h += '<article class="q" id="q-' + q.id + '"><span class="pill ' + q.status + '">' + word[q.status] + "</span><h3>" + esc(q.question) + "</h3><p>" + esc(q.answer) + '</p><ul class="ev">';
      q.evidence.forEach(function (e) {
        var inv = BY_ID[e.inv];
        h += '<li><div class="ev-head">' + invLink(e.inv) + chip(inv.cls) + "</div>" + esc(e.text) + (e.kind === "record" ? quote(e.inv, e.field, e.quote) :
          (inv.tables.length ? ' <button class="link" data-table="' + inv.tables[0].file + '">View NASA\'s table</button>' : "")) + "</li>";
      });
      h += '</ul><p class="missing"><strong>Missing:</strong> ' + esc(q.missing) + "</p></article>";
    });
    main.innerHTML = h;
    if (focusId) { var el = document.getElementById("q-" + focusId); if (el) { el.classList.add("hl"); setTimeout(function () { el.scrollIntoView({ block: "start" }); }, 0); } }
  }

  function viewData() {
    setTitle("Data and method");
    var S = D.summary, A = D.about;
    var h = '<p class="eyebrow">Data and method</p><h1>Take the data, check the method</h1>';
    h += '<p class="lead">Everything on this site is built by one script from an untouched copy of NASA\'s files. No number is typed in by hand, and nothing is estimated.</p>';
    h += '<h2>Download</h2><div class="cards">';
    h += '<div class="card"><h3>Investigations</h3><p>' + S.investigations + ' rows: rank, conditions, oxygen and pressure ranges, DOI.</p><p><a class="btn sm" href="data/investigations.csv" download>investigations.csv</a></p></div>';
    h += '<div class="card"><h3>Tests</h3><p>' + TESTS.length + ' rows: every table row that states oxygen or pressure, with the original cell beside each converted value. For flammability models.</p><p><a class="btn sm" href="data/tests.csv" download>tests.csv</a></p></div>';
    h += '<div class="card"><h3>Everything, as JSON</h3><p>The exact files this page reads.</p><p class="row"><a class="btn sm" href="data/dataset.json" download>dataset.json</a><a class="btn sm ghost" href="data/tests.json" download>tests.json</a></p></div>';
    h += '<div class="card"><h3>Code and raw snapshot</h3><p>Scripts, NASA\'s files byte for byte, and their checksums.</p><p><a class="btn sm ghost" href="' + REPO + '" target="_blank" rel="noopener">GitHub repository</a></p></div></div>';

    h += "<h2>Where the data comes from</h2>";
    h += '<p>NASA\'s <a href="' + A.source_url + '" target="_blank" rel="noopener">Physical Sciences Informatics (PSI) repository</a>, Combustion Science: ' + S.investigations + " investigation records and " + S.tables +
      " Experimental Tables (" + S.entry_rows + " entry rows), downloaded on " + esc(A.snapshot_retrieved_from.slice(0, 10)) + ". Each file is stored unchanged with its SHA-256 checksum. Raw videos and sensor files (hundreds of gigabytes) are not used.</p>";

    h += "<h2>Rules the numbers follow</h2><ul>";
    h += "<li><strong>Ambient oxygen and burner-flow oxygen are never mixed.</strong> Ambient oxygen is the air around the flame. Burner-flow oxygen is blown out of a burner into fuel gas.</li>";
    h += "<li><strong>A cell is a number only if NASA wrote a plain number</strong>, or a list of plain numbers separated by semicolons. Cells such as <span class=\"asw\">~ 21.5</span>, <span class=\"asw\">3400%</span> or <span class=\"asw\">0.5 atm</span> are shown exactly as written and are not counted.</li>";
    h += "<li><strong>Two conversions, both marked:</strong> mole fraction × 100 = percent, and pressure to psi (1 atm = " + A.conversions["psi per unit"].atm + " psi, 1 bar = " + A.conversions["psi per unit"].bar + " psi, 1 mmHg = " + A.conversions["psi per unit"].mmHg + " psi).</li>";
    h += "<li><strong>\"Not stated\" stays \"not stated\".</strong> Missing values are never filled in.</li>";
    h += "<li><strong>The Moon Base zone</strong> is " + num(A.moon_base.o2_min_percent) + " % oxygen or more at " + num(A.moon_base.pressure_max_psi) + " psi or less, as given in the " + esc(A.moon_base.source) + ".</li></ul>";

    h += "<h2>The five conditions behind the ranking</h2><ol>" + CRIT.map(function (c) { return "<li><strong>" + esc(c[1]) + ".</strong> " + esc(c[2]) + "</li>"; }).join("") + "</ol>";
    h += '<p>Conditions 3 to 5 are computed from NASA\'s tables. Conditions 1 and 2 are this team\'s reading of each record: for condition 1 the sentence it rests on is quoted on every investigation page, and the build fails if that sentence is not in NASA\'s record word for word. Purpose: ' +
      (S.purpose_counts.primary || 0) + " main purpose, " + (S.purpose_counts.benefit || 0) + " named as a benefit, " + (S.purpose_counts.none || 0) + " not their purpose.</p>";

    h += "<h2>How AI was used</h2>";
    h += "<p>The scripts, this website and the plain-language texts (marked <span class=\"ai\">AI-written</span>) were produced with AI assistance (Claude, Anthropic) and reviewed by the team. The AI was given only NASA's records and tables. Before the site is built, a program checks that every quotation exists word for word in the named NASA record, and that the plain-language texts contain no hand-typed numbers: all figures are inserted from the computed data. The layout of the overview page follows a design mockup made with ChatGPT (OpenAI); the mockup itself is not used, and every number on the page comes from the data. The idea of the project, asking how much of NASA's fire data applies to the Moon Base, is the team's.</p>";

    h += "<h2>Limits</h2><ul>";
    h += "<li>This shows coverage, not predictions. It does not say how fire behaves on the Moon.</li>";
    h += "<li>Only what PSI's records and Experimental Tables state is used. The investigations' documents and " + S.publications + " listed publications (" + S.unique_dois + " unique DOIs) hold more detail that is not read here.</li>";
    h += "<li>NASA has planned and flown solid-fuel tests at elevated oxygen that are not among PSI's Combustion Science records in this snapshot (Saffire IV to VI; see the NASA roadmap in the references). They are outside this dataset.</li>";
    h += "<li>" + S.records_mentioning_moon_or_partial_gravity + " of the " + S.investigations + " PSI records mention the Moon, Mars or partial gravity in their description. Every test is in weightlessness or on Earth.</li></ul>";

    h += "<h2>References</h2><p>Each investigation, cited by its NASA DOI:</p><div class=\"tablewrap\"><table><thead><tr><th>PSI id</th><th>Investigation</th><th>DOI</th><th>License</th></tr></thead><tbody>";
    D.investigations.slice().sort(function (a, b) { return +a.id.slice(4) - +b.id.slice(4); }).forEach(function (i) {
      h += "<tr><td>" + esc(i.id) + '</td><td class="rank-name">' + invLink(i.id) + "<small>" + esc(i.title) + "</small></td><td>" +
        (i.doi ? '<a href="https://doi.org/' + esc(i.doi) + '" target="_blank" rel="noopener">' + esc(i.doi) + "</a>" : "none") + "</td><td>" + esc(i.license || "blank in the record") + "</td></tr>";
    });
    h += "</tbody></table></div>";
    h += '<ul><li><a href="https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/" target="_blank" rel="noopener">NASA Space Apps Challenge 2026: Flame in Freefall</a> (the Moon Base atmosphere figures)</li>' +
      '<li><a href="https://www.nasa.gov/moonbase" target="_blank" rel="noopener">NASA: Moon Base</a></li>' +
      '<li><a href="https://ntrs.nasa.gov/citations/20205007829" target="_blank" rel="noopener">G. A. Ruff, Spacecraft Fire Safety Needs for Exploration, NASA Glenn, 2020</a> (roadmap listing Saffire IV to VI with elevated oxygen)</li>' +
      '<li><a href="https://openalex.org" target="_blank" rel="noopener">OpenAlex</a> (year and journal of the publications PSI lists)</li>' +
      '<li><a href="https://github.com/nasa/hds-core" target="_blank" rel="noopener">NASA Horizon Design System</a> (the colour values: NASA Red, the Carbon greys and the chart palette for dark backgrounds)</li></ul>';
    h += '<p>Images, all NASA photographs in the public domain, none AI-generated: the Moon is the <a href="' + MOON.page + '" target="_blank" rel="noopener">Lunar Reconnaissance Orbiter near-side mosaic</a> (' + esc(MOON.credit) + '); Earth is <a href="https://commons.wikimedia.org/wiki/File:The_Earth_seen_from_Apollo_17.jpg" target="_blank" rel="noopener">The Earth seen from Apollo 17</a> (NASA, Apollo 17 crew); the space station is <a href="https://commons.wikimedia.org/wiki/File:International_Space_Station_after_undocking_of_STS-132.jpg" target="_blank" rel="noopener">photograph S132-E-012208</a> (NASA, crew of STS-132).</p>';
    h += '<p>Typefaces, all under the SIL Open Font License 1.1 and served with the site: <a href="https://github.com/CatharsisFonts/Cormorant" target="_blank" rel="noopener">Cormorant Garamond</a>, <a href="https://github.com/rsms/inter" target="_blank" rel="noopener">Inter</a> and <a href="https://github.com/googlefonts/dm-mono" target="_blank" rel="noopener">DM Mono</a>.</p>';
    main.innerHTML = h;
  }

  // ----------------------------------------------------------------- router
  function route() {
    var parts = location.hash.replace(/^#\/?/, "").split("/");
    var name = parts[0] || "home";
    closeModal(); tip.hidden = true;
    if (name === "map") viewMap();
    else if (name === "rank") viewRank();
    else if (name === "inv") viewInv(parts[1]);
    else if (name === "table" && BY_ID[(parts[1] || "").split("_")[0]]) {   // #/table/<file>/<row>: a link straight to one NASA table row
      viewInv(parts[1].split("_")[0]);
      openTable(parts[1], +parts[2] || 0);
    }
    else if (name === "compare") viewCompare(parts[1], parts[2]);
    else if (name === "questions") viewQuestions(parts[1]);
    else if (name === "data") viewData();
    else { name = "home"; viewHome(); }
    document.body.classList.toggle("home", name === "home");
    var nav = name === "inv" || name === "compare" || name === "table" ? "rank" : name;
    document.querySelectorAll("nav a").forEach(function (a) { a.classList.toggle("on", a.dataset.nav === nav); });
    window.scrollTo(0, 0);
  }

  // one click handler for every button the views draw
  main.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button, tr.pick") : null;
    if (!b || (e.target.closest("a") && b.tagName === "TR")) return;
    if (b.dataset.table) openTable(b.dataset.table);
    else if (b.dataset.stop) {
      stopState = b.dataset.stop;
      document.querySelectorAll(".stop").forEach(function (x) { x.classList.toggle("on", x === b); x.setAttribute("aria-selected", x === b); });
      document.getElementById("stop-detail").innerHTML = stopDetail();
    }
    else if (b.dataset.open && drawRank) { rankState.open[b.dataset.open] = !rankState.open[b.dataset.open]; drawRank(); }
    else if (b.dataset.sort) { rankState.sort = b.dataset.sort; viewRank(); }
    else if (b.dataset.cls) { rankState.cls = b.dataset.cls; viewRank(); }
  });
  main.addEventListener("keydown", function (e) {
    var r = e.target.closest ? e.target.closest("tr.pick") : null;
    if (r && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); r.click(); }
  });
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal").addEventListener("click", function (e) { if (e.target.id === "modal") closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

  Promise.all([
    fetch("data/dataset.json").then(function (r) { return r.json(); }),
    fetch("data/tests.json").then(function (r) { return r.json(); })
  ]).then(function (res) {
    D = res[0]; TESTS = res[1];
    TESTS.forEach(function (t, i) { t._i = i; });
    D.investigations.forEach(function (i) { BY_ID[i.id] = i; });
    window.addEventListener("hashchange", route);
    var wasNarrow = narrow();
    window.addEventListener("resize", function () { if (narrow() !== wasNarrow) { wasNarrow = narrow(); var y = window.scrollY; route(); window.scrollTo(0, y); } });
    route();
  }).catch(function (e) {
    main.innerHTML = '<p class="loading">The data could not be loaded. If you opened this file directly from disk, serve the folder instead (for example: <code>python -m http.server</code> inside <code>docs/</code>).</p>';
    console.error(e);
  });
})();
