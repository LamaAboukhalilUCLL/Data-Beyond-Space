/*
 * Flame in Freefall dashboard.
 * Reads data/dataset.json and data/tests.json (built by scripts/build_dataset.py
 * from NASA's PSI repository) and draws every view from them.
 *
 * Every number for the Moon Base is computed by the build script. When the reader
 * chooses another atmosphere, the page recounts NASA's tests with recount.js, which
 * follows the same rules and is checked against the build (scripts/check_recount.js).
 * Nothing is estimated, and every count can be traced to rows of NASA's tables.
 *
 * Written with AI assistance (Claude, Anthropic), reviewed by the team.
 */
(function () {
  "use strict";

  var D = null, TESTS = [], BY_ID = {};
  var main = document.getElementById("main");
  var tip = document.getElementById("tip");
  var REPO = "https://github.com/LamaAboukhalilUCLL/Data-Beyond-Space";
  var MOON = { credit: "NASA/GSFC/Arizona State University, Lunar Reconnaissance Orbiter", page: "https://commons.wikimedia.org/wiki/File:Moon_nearside_LRO_5000.jpg" };

  // The atmosphere being checked, and everything recounted for it.
  var ATM = null, RK = {}, RANKED = [], COUNTS = null;

  var VALUE_WORD = {
    primary: "Main purpose", benefit: "Named as a benefit", none: "Not its purpose",
    yes: "Yes", partly: "Partly", no: "No", text: "Written as text, not counted",
    "not stated": "Not stated in the table", "no table": "No table in PSI"
  };
  var FIELD = { objective: "Objective", approach: "Approach", hypothesis: "Hypothesis", researchImpacts: "Research impacts" };
  var KIND = { aim: "Aim", expected: "Expected", result: "Result", stated: "Stated" };
  var WORD = { answered: "Answered", partly: "Partly answered", open: "Open" };
  var LANES = ["solid", "smoke", "emulated", "droplet", "gas"];
  // What burns, in NASA's chart palette for dark backgrounds (Horizon Design System), chosen so the
  // four hues stay apart for colour-blind readers too. NASA Red is kept for the chosen atmosphere.
  var COLOR = { solid: "#f29d49", emulated: "#f5af0c", droplet: "#609af6", gas: "#0cc9ac", smoke: "#959599", aerosol: "#77777a", burner: "#fa8c87" };
  var RED = "#f64137";

  // ---------------------------------------------------------------- helpers
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function num(x) {
    if (x == null || x === "") return "";
    return String(Math.round(x * 100) / 100);
  }
  function crits() {
    var o = num(ATM.o2), p = num(ATM.p);
    return [
      ["purpose", "About spacecraft fire safety", "Does the record's own text name spacecraft fire safety as its purpose?", "Fire safety"],
      ["material", "Tests solid cabin materials", "Does it burn or heat real solid materials, the things a habitat is made of?", "Solid materials"],
      ["oxygen", "Reaches " + o + " % oxygen", "Does any test state an ambient oxygen level of " + o + " % or more?", o + " % oxygen"],
      ["pressure", "Reaches " + p + " psi or less", "Does any test state a pressure of " + p + " psi or less?", p + " psi or less"],
      ["both", "Both in the same test", "Is any single test at " + o + " % oxygen or more and " + p + " psi or less together?", "Both together"]
    ];
  }
  function chip(cls) {
    return '<span class="chip"><i style="background:' + COLOR[cls] + '"></i>' + esc(D.about.class_labels[cls]) + "</span>";
  }
  // A condition as a plain mark: filled = met, half = partly, ring = not met, blank = the table does not say.
  function glyph(c) {
    return c.score === 1 ? "●" : c.score === 0.5 ? "◐" : (c.value === "text" || c.value === "not stated" || c.value === "no table") ? "" : "○";
  }
  function dots(inv) {
    var c = RK[inv.id].criteria;
    return '<span class="marks" role="img" aria-label="' + esc(crits().map(function (k) { return k[1] + ": " + VALUE_WORD[c[k[0]].value]; }).join("; ")) + '">' +
      crits().map(function (k) { return glyph(c[k[0]]) || "&nbsp;"; }).join("") + "</span>";
  }
  function quote(invId, field, q) {
    return "<blockquote>“" + esc(q) + "”<cite>NASA PSI record " + esc(invId) + ", " + FIELD[field] + "</cite></blockquote>";
  }
  function invLink(id, label) { return '<a href="#/inv/' + id + '">' + esc(label || BY_ID[id].name) + "</a>"; }
  function hash01(n, salt) { var x = Math.sin(n * 127.1 + salt * 311.7) * 43758.5453; return x - Math.floor(x); }
  function narrow() { return window.innerWidth < 700; }
  function setTitle(t) { document.title = "Flame in Freefall: " + t; }
  function scaleLin(d0, d1, r0, r1) { return function (v) { return r0 + (v - d0) / (d1 - d0) * (r1 - r0); }; }
  function inAir(t) { return Recount.inAir(t, ATM.o2, ATM.p); }
  function airWords() { return num(ATM.o2) + " % oxygen or more and " + num(ATM.p) + " psi or less"; }

  // ---------------------------------------------------- the chosen atmosphere
  function setAtm(a) {
    ATM = a;
    COUNTS = Recount.counts(TESTS, ATM.o2, ATM.p);
    RANKED = Recount.rank(D.investigations, TESTS, ATM.o2, ATM.p);
    RK = {};
    RANKED.forEach(function (x) { RK[x.id] = x; });
  }
  function atmBar() {
    var h = '<section class="atm" aria-label="Choose an atmosphere"><div class="presets" role="group" aria-label="Atmosphere">';
    D.about.presets.forEach(function (p) {
      h += '<button data-atm="' + p.id + '" class="' + (ATM.id === p.id ? "on" : "") + '" aria-pressed="' + (ATM.id === p.id) + '"><b>' + esc(p.name) + "</b><span>" + num(p.o2) + " % oxygen, " + num(p.p) + " psi</span></button>";
    });
    // a stepper: minus, the number with its unit, plus (typing still works)
    function stepper(id, cap, val, min, max, step, unit, label) {
      return '<div class="stepper"><label for="' + id + '">' + cap + '</label><div class="step-box">' +
        '<button type="button" class="step" data-step="' + id + '" data-dir="-1" aria-label="Less: ' + label + '">−</button>' +
        '<span class="step-field"><input type="text" inputmode="decimal" autocomplete="off" spellcheck="false" id="' + id + '" data-min="' + min + '" data-max="' + max + '" data-inc="' + step + '" value="' + num(val) + '" aria-label="' + label + ', from ' + min + " to " + max + '"><i>' + unit + "</i></span>" +
        '<button type="button" class="step" data-step="' + id + '" data-dir="1" aria-label="More: ' + label + '">+</button></div></div>';
    }
    h += '<div class="custom' + (ATM.id === "custom" ? " on" : "") + '"><b>Your own</b>' +
      stepper("atm-o2", "Oxygen, at least", ATM.o2, 10, 100, 0.5, "%", "oxygen, percent, at least") +
      stepper("atm-p", "Pressure, at most", ATM.p, 1, 50, 0.1, "psi", "pressure, psi, at most") + "</div>";
    h += '</div><p class="atm-say">Counting tests at <b>' + num(ATM.o2) + " % oxygen or more</b> and <b>" + num(ATM.p) + " psi or less</b>. <span>" + esc(ATM.source) + ".</span></p></section>";
    return h;
  }
  function counters() {
    var c = COUNTS, solid = c.byCls.solid, n5 = RANKED.filter(function (x) { return x.score === 5; }).length;
    var names = c.invsInZone.map(function (id) { return BY_ID[id].name; });
    // tests that meet the oxygen level and miss the pressure limit by half a psi or less
    var nearP = TESTS.filter(function (t) { return t.o2 != null && t.p_psi != null && t.o2 >= ATM.o2 && t.p_psi > ATM.p && t.p_psi <= ATM.p + 0.5; }), nearInv = {};
    nearP.forEach(function (t) { nearInv[BY_ID[t.inv].name] = 1; });
    var h = '<div class="counters">';
    h += '<div class="hot"><b>' + c.inZone + "</b><span>of " + c.both + " tests that state both oxygen and pressure are in this air." + (names.length ? " " + (names.length === 1 ? "All from " : "From ") + esc(names.join(", ")) + "." : "") +
      (nearP.length ? " <strong>" + nearP.length + " more</strong> miss the pressure limit by 0.5 psi or less (" + esc(Object.keys(nearInv).join(", ")) + ')' + (nearInv.FLEX ? ', see the <a href="#/analysis">analysis</a>' : "") + "." : "") + "</span></div>";
    h += "<div><b>" + solid.atOrAbove + "</b><span>of " + solid.rows + " solid-material tests reach " + num(ATM.o2) + " % oxygen. Solid materials were tested from " + num(solid.min) + " to " + num(solid.max) + " %.</span></div>";
    h += "<div><b>" + n5 + "</b><span>of " + D.summary.investigations + " investigations meet all five conditions for this air. The closest meet " + num(RANKED[0].score) + ".</span></div>";
    return h + "</div>";
  }

  // ----------------------------------------------------------------- charts
  function pointAttrs(t, extra) { return ' class="pt" data-i="' + t._i + '"' + (extra || ""); }

  // Figure 1. One bar per fuel type, from the lowest to the highest ambient oxygen its tests state.
  function fuelBars() {
    var R = COUNTS.byCls, zone = ATM.o2, rows = ["solid", "droplet", "gas"].filter(function (c) { return R[c]; });
    var nw = narrow(), W = nw ? 380 : 1000, L = nw ? 30 : 200, Rt = nw ? 48 : 46, T = nw ? 64 : 62, rowH = nw ? 80 : 72, bh = nw ? 22 : 28;
    var yb = T + rows.length * rowH, H = yb + 56, x = scaleLin(10, 45, L, W - Rt), far = zone > 45;
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Range of ambient oxygen tested, by what burns. Solid materials: ' + num(R.solid.min) + " to " + num(R.solid.max) + " percent. Chosen atmosphere starts at " + num(zone) + ' percent.">';
    s += '<defs><marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="' + RED + '"/></marker></defs>';
    if (!far) s += '<rect class="zone" x="' + x(zone) + '" y="' + (T - 30) + '" width="' + (W - Rt - x(zone)) + '" height="' + (yb - T + 30) + '"/>';
    for (var v = 10; v <= 45; v += nw ? 10 : 5) s += '<line class="grid" x1="' + x(v) + '" x2="' + x(v) + '" y1="' + (T - 30) + '" y2="' + yb + '"/><text class="tick" x="' + x(v) + '" y="' + (yb + 22) + '" text-anchor="middle">' + v + " %</text>";
    s += '<line class="earth" x1="' + x(21) + '" x2="' + x(21) + '" y1="' + (T - 30) + '" y2="' + yb + '"/>';
    if (Math.abs(zone - 21) > 4 || far) s += '<text class="ann" x="' + (x(21) - 8) + '" y="' + (T - 38) + '" text-anchor="end">Earth air, 21 %</text>';
    if (!far) {
      s += '<line class="zone-line" x1="' + x(zone) + '" x2="' + x(zone) + '" y1="' + (T - 30) + '" y2="' + yb + '"/>';
      s += '<text class="ann red" x="' + (x(zone) + 8) + '" y="' + (T - 38) + '">' + num(zone) + " % oxygen or more" + "</text>";
    } else s += '<text class="ann red" x="' + (W - Rt) + '" y="' + (T - 38) + '" text-anchor="end">' + num(zone) + " % is beyond every test →</text>";
    rows.forEach(function (c, k) {
      var r = R[c], y0 = T + k * rowH, by = nw ? y0 + 28 : y0 + 14, x0 = x(r.min), x1 = x(r.max), ty = by + bh / 2 + 5;
      if (nw) s += '<text class="lab" x="' + L + '" y="' + (y0 + 16) + '" style="font-size:14px">' + esc(D.about.class_labels[c]) + '<tspan class="sub">, ' + r.rows + " tests</tspan></text>";
      else s += '<text class="lab" x="0" y="' + (y0 + 30) + '">' + esc(D.about.class_labels[c]) + '</text><text class="sub" x="0" y="' + (y0 + 49) + '">' + r.rows + " tests</text>";
      s += '<rect x="' + x0 + '" y="' + by + '" width="' + Math.max(6, x1 - x0) + '" height="' + bh + '" rx="3" fill="' + COLOR[c] + '"/>';
      s += '<text class="val" x="' + (x0 - 7) + '" y="' + ty + '" text-anchor="end">' + num(r.min) + "</text>";
      s += '<text class="val" x="' + (x1 + 7) + '" y="' + ty + '">' + num(r.max) + " %</text>";
      if (c === "solid" && r.max < zone && !far) {
        if (nw) s += '<text class="ann red" x="' + (x(zone) + 6) + '" y="' + ty + '">none here</text>';
        else {
          if (x(zone) - x1 > 110) s += '<path d="M' + (x1 + 66) + " " + (by + bh / 2) + "H" + (x(zone) - 6) + '" stroke="' + RED + '" stroke-width="1.5" fill="none" marker-end="url(#arr)"/>';
          s += '<text class="ann red" x="' + (x(zone) + 10) + '" y="' + (ty - 8) + '">No solid-material test</text><text class="ann red" x="' + (x(zone) + 10) + '" y="' + (ty + 9) + '">reaches this zone</text>';
        }
      }
    });
    s += '<text class="tick" x="' + ((L + W - Rt) / 2) + '" y="' + (yb + 46) + '" text-anchor="middle">Oxygen in the air around the flame</text>';
    return s + "</svg>";
  }

  // Figure 2. Every test that states its oxygen level, one lane per kind of fuel.
  function laneChart(opts) {
    opts = opts || {};
    var lanes = LANES.slice();
    if (opts.burner) lanes.push("burner");
    var nw = narrow(), W = nw ? 380 : 1000, L = nw ? 10 : 236, R = nw ? 10 : 18, T = 44, laneH = nw ? 60 : 64, B = 40;
    var H = T + lanes.length * laneH + B, xmax = opts.burner ? 90 : 45, x = scaleLin(10, xmax, L, W - R), zone = ATM.o2, far = zone > xmax;
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Ambient oxygen of every test, grouped by what burns, against ' + num(zone) + ' percent.">';
    if (!far) {
      s += '<rect class="zone" x="' + x(zone) + '" y="' + T + '" width="' + (W - R - x(zone)) + '" height="' + (lanes.length * laneH) + '"/>';
      s += '<text class="zone-label" x="' + (x(zone) + 8) + '" y="' + (T - 12) + '">' + num(zone) + " % oxygen or more" + "</text>";
    } else s += '<text class="zone-label" x="' + (W - R) + '" y="' + (T - 12) + '" text-anchor="end">' + num(zone) + " % is beyond every test →</text>";
    if (Math.abs(zone - 21) > 4 || far) s += '<text x="' + (x(21) - 6) + '" y="' + (T - 12) + '" text-anchor="end" class="earth-label">Earth air 21 %</text>';
    lanes.forEach(function (cls, k) {
      var y0 = T + k * laneH;
      s += '<line class="grid" x1="0" x2="' + W + '" y1="' + y0 + '" y2="' + y0 + '"/>';
      var label = cls === "burner" ? "Oxygen blown from a burner" : D.about.class_labels[cls];
      var pts = TESTS.filter(function (t) { return cls === "burner" ? t.burner_o2 != null : (t.cls === cls && (t.o2 != null || t.o2_list)); });
      var plain = pts.filter(function (t) { return cls === "burner" ? true : t.o2 != null; }).length, listed = pts.length - plain;
      if (nw) s += '<text class="lane-label small" x="' + (L + 2) + '" y="' + (y0 + 13) + '">' + esc(label) + "</text>";
      else {
        s += '<circle cx="7" cy="' + (y0 + 21) + '" r="6" fill="' + COLOR[cls] + '"/><text class="lane-label" x="22" y="' + (y0 + 26) + '">' + esc(label) + "</text>";
        var sub = cls === "burner" ? "not an atmosphere; " + plain + " tests" : (plain ? plain + " tests" : "") + (listed ? (plain ? ", " : "") + listed + " rows listing values" : "") + (!pts.length ? "no oxygen stated" : "");
        s += '<text class="sub" x="22" y="' + (y0 + 44) + '">' + esc(sub) + "</text>";
      }
      var above = 0;
      pts.forEach(function (t) {
        var yy = y0 + (nw ? 20 : 11) + hash01(t.row, t.inv.length + t.table.length) * (laneH - (nw ? 28 : 22));
        if (cls === "burner") s += '<circle cx="' + x(t.burner_o2).toFixed(1) + '" cy="' + yy.toFixed(1) + '" r="3" fill="' + COLOR.burner + '"' + pointAttrs(t, ' data-k="burner"') + "/>";
        else if (t.o2 != null) {
          if (t.o2 >= zone) above++;
          s += '<circle cx="' + x(t.o2).toFixed(1) + '" cy="' + yy.toFixed(1) + '" r="3.1" fill="' + COLOR[cls] + '"' + pointAttrs(t) + "/>";
        } else t.o2_list.forEach(function (v, n) {
          if (v >= zone) above++;
          var cx = x(v), cy = y0 + 11 + hash01(t.row * 7 + n, 3) * (laneH - 22);
          s += '<path d="M' + cx.toFixed(1) + " " + (cy - 5).toFixed(1) + 'l5 5l-5 5l-5-5z" fill="none" stroke="' + COLOR[cls] + '" stroke-width="1.6"' + pointAttrs(t) + "/>";
        });
      });
      if (cls !== "burner" && !above && !far) s += '<text x="' + ((x(zone) + W - R) / 2) + '" y="' + (y0 + laneH / 2 + 4) + '" text-anchor="middle" class="zone-label">' + (pts.length ? "no test in this zone" : "no oxygen level stated") + "</text>";
    });
    var yb = T + lanes.length * laneH;
    if (!far) s += '<line class="zone-edge" x1="' + x(zone) + '" x2="' + x(zone) + '" y1="' + (T - 4) + '" y2="' + yb + '"/>';
    s += '<line class="earth" x1="' + x(21) + '" x2="' + x(21) + '" y1="' + (T - 4) + '" y2="' + yb + '"/>';
    s += '<g class="axis"><line x1="' + L + '" x2="' + (W - R) + '" y1="' + yb + '" y2="' + yb + '"/>';
    for (var v = 10; v <= xmax; v += opts.burner || nw ? 10 : 5) s += '<line x1="' + x(v) + '" x2="' + x(v) + '" y1="' + yb + '" y2="' + (yb + 5) + '"/><text class="tick" x="' + x(v) + '" y="' + (yb + 19) + '" text-anchor="middle">' + v + " %</text>";
    s += '</g><text class="tick" x="' + ((L + W - R) / 2) + '" y="' + (H - 4) + '" text-anchor="middle">' + (opts.burner ? "oxygen, percent (cabin air in the upper lanes; burner flow in the last lane)" : "oxygen in the air around the flame, percent") + "</text></svg>";
    return s;
  }

  // Figure 3. Tests that state both oxygen and pressure, with the chosen atmosphere as a frame.
  function scatterChart() {
    var nw = narrow(), W = nw ? 380 : 1000, L = nw ? 34 : 64, R = nw ? 10 : 18, T = 26, B = 44, H = nw ? 360 : 372;
    var x = scaleLin(10, 45, L, W - R), y = scaleLin(0, 46, H - B, T), zo = ATM.o2, zp = Math.min(ATM.p, 46);
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Oxygen against pressure for the ' + COUNTS.both + " tests that state both. " + COUNTS.inZone + ' fall inside the chosen atmosphere.">';
    if (zo <= 45) s += '<rect class="zone" x="' + x(zo) + '" y="' + y(zp) + '" width="' + (W - R - x(zo)) + '" height="' + (y(0) - y(zp)) + '"/><rect x="' + x(zo) + '" y="' + y(zp) + '" width="' + (W - R - x(zo)) + '" height="' + (y(0) - y(zp)) + '" class="zone-edge"/>';
    for (var p = 0; p <= 45; p += 5) s += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(p) + '" y2="' + y(p) + '"/><text class="tick" x="' + (L - 8) + '" y="' + (y(p) + 4) + '" text-anchor="end">' + p + "</text>";
    for (var v = 10; v <= 45; v += nw ? 10 : 5) s += '<text class="tick" x="' + x(v) + '" y="' + (H - B + 18) + '" text-anchor="middle">' + v + " %</text>";
    s += '<line class="earth" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(14.7) + '" y2="' + y(14.7) + '"/><text x="' + (L + 6) + '" y="' + (y(14.7) - 5) + '" class="earth-label">Earth sea level 14.7 psi</text>';
    TESTS.forEach(function (t) {
      if (t.o2 == null || t.p_psi == null) return;
      var hit = inAir(t);
      s += '<circle cx="' + x(t.o2).toFixed(1) + '" cy="' + y(Math.min(t.p_psi, 46)).toFixed(1) + '" r="' + (hit ? 4.4 : 3) + '" fill="' + COLOR[t.cls] + '"' + (hit ? ' stroke="#fff" stroke-width="1.3"' : "") + pointAttrs(t) + "/>";
    });
    if (zo <= 45) s += '<text class="zone-label" x="' + (W - R - 8) + '" y="' + (y(0) - 9) + '" text-anchor="end">' + esc(ATM.name) + ": " + COUNTS.inZone + (COUNTS.inZone === 1 ? " test" : " tests") + "</text>";
    else s += '<text class="zone-label" x="' + (W - R) + '" y="' + (T + 6) + '" text-anchor="end">' + num(zo) + " % is beyond every test →</text>";
    s += '<text class="tick" x="' + ((L + W - R) / 2) + '" y="' + (H - 4) + '" text-anchor="middle">oxygen in the air around the flame, percent</text>';
    s += nw ? '<text class="tick" x="' + (L - 6) + '" y="' + (T - 10) + '" text-anchor="end">psi</text></svg>' : '<text class="tick" transform="translate(15 ' + ((T + H - B) / 2) + ') rotate(-90)" text-anchor="middle">pressure, psi (converted)</text></svg>';
    return s;
  }

  function legend(classes) {
    return '<p class="legend">' + classes.map(function (c) {
      return '<span class="chip"><i style="background:' + COLOR[c] + '"></i>' + esc(c === "burner" ? "Burner-flow oxygen" : D.about.class_labels[c]) + "</span>";
    }).join("") + '<span>● one test</span><span>◇ a value listed for a test day or fuel</span><span>Click a mark to see NASA\'s table row.</span></p>';
  }

  function bindPoints(root) {
    if (!root) return;
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
        ". One row is one " + esc(info.row_meaning) + '. <a href="' + inv.psi_url + '" target="_blank" rel="noopener">Open this investigation on NASA PSI</a>. <a href="data/tables/' + file + '" download>Download this table</a></p>';
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

  // ---------------------------------------------------------------- journey
  var stopState = null;
  function stopLists() {
    return { earth: D.investigations.filter(function (i) { return i.ground; }), orbit: D.investigations.filter(function (i) { return !i.ground; }) };
  }
  function stopChips() {
    if (!stopState) return "";
    return '<div class="invchips">' + stopLists()[stopState].map(function (i) {
      return '<a href="#/inv/' + i.id + '"><i class="sw" style="background:' + COLOR[i.cls] + '"></i>' + esc(i.name) + "</a>";
    }).join("") + "</div>";
  }
  // The route from Earth to the Moon Base: where NASA's fire investigations were run, and where none was.
  function routeMap() {
    var S = D.summary, R = S.o2_range_by_class, mb = D.about.moon_base, L = stopLists(), all = S.investigations;
    var earth = D.about.presets.filter(function (p) { return p.id === "earth"; })[0];
    var lo = Math.min.apply(null, Object.keys(R).map(function (k) { return R[k].min; })), hi = Math.max.apply(null, Object.keys(R).map(function (k) { return R[k].max; }));
    var s = '<svg viewBox="0 0 1160 330" role="img" aria-label="Route from Earth to low Earth orbit to the Moon Base. ' + L.earth.length + " investigations ran on Earth, " + L.orbit.length + ' in low Earth orbit, none beyond.">';
    s += '<defs><clipPath id="clip-earth"><circle cx="193.3" cy="185" r="77"/></clipPath><clipPath id="clip-moon"><circle cx="966.7" cy="175" r="74"/></clipPath></defs>';
    s += '<path class="way" d="M263 125 C 383 40, 390 60, 482 116"/><path class="way red" d="M678 122 C 780 90, 777 70, 887 155"/>';
    s += '<text x="407" y="52" text-anchor="middle">' + L.orbit.length + ' investigations flew</text><text class="red" x="783" y="62" text-anchor="middle">No investigation in NASA\'s repository was run beyond this point</text>';
    s += '<image href="img/earth.jpg" x="109.3" y="101" width="168" height="168" clip-path="url(#clip-earth)" preserveAspectRatio="xMidYMid slice"/>';
    s += '<image href="img/iss-cutout.png" x="490" y="64" width="180" height="111"/>';
    s += '<image href="img/moon.jpg" x="892.7" y="101" width="148" height="148" clip-path="url(#clip-moon)" preserveAspectRatio="xMidYMid slice"/><circle cx="966.7" cy="175" r="74" fill="none" stroke="' + RED + '" stroke-width="2"/>';
    s += '<text class="big" x="193.3" y="306" text-anchor="middle">Earth</text><text class="big" x="580" y="306" text-anchor="middle">Low Earth orbit</text><text class="big red" x="966.7" y="306" text-anchor="middle">Moon Base</text></svg>';
    function col(cls, name, n, text, action) {
      return '<div class="' + cls + '"><h3>' + name + '</h3><div class="count">' + n + "<small>of " + all + " investigations</small></div><p>" + text + "</p>" + action + "</div>";
    }
    var cols = '<div class="route-cols">' +
      col("", "Earth", L.earth.length, "Normal gravity. Air with " + num(earth.o2) + " % oxygen at " + num(earth.p) + " psi. Laboratory and computer studies that build on the flights.",
        '<button class="link" data-stop="earth">Show these investigations</button>') +
      col("", "Low Earth orbit", L.orbit.length, "Weightless, on the space station or a cargo spacecraft. Oxygen tested from " + num(lo) + " % to " + num(hi) + " %. Solid materials stop at " + num(R.solid.max) + " %.",
        '<button class="link" data-stop="orbit">Show these investigations</button>') +
      col("moon", "Moon Base", S.records_mentioning_moon_or_partial_gravity, "Moon gravity. Air expected: " + num(mb.o2_min_percent) + " % oxygen or more, at " + num(mb.pressure_max_psi) + " psi or less. Only " + S.rows_in_zone + " of " +
        S.rows_with_both + " tests elsewhere used this air, all on gas flames.", '<a class="link" href="#/questions">See what is still open</a>') + "</div>";
    return '<div class="routemap">' + s + '<p class="ai-mark">Drawing made with AI assistance. The photographs are NASA\'s.</p>' + cols + '<div class="stop-chips" id="stop-chips">' + stopChips() + "</div></div>";
  }

  // ---------------------------------------------------------------- analysis
  // The FLEX droplet model (scripts/analyze_flex.py fits it; model.js evaluates it here).
  var AN = { data: null, fuel: "Heptane", v: null };
  var AN_SLIDER = { o2: [10, 45, 0.5], co2: [0, 70, 1], he: [0, 45, 1], p: [8, 20, 0.1], d0: [1, 5, 0.1] };
  var AN_GAS = { n2: ["Nitrogen only", "#609af6"], co2: ["With carbon dioxide", "#f29d49"], he: ["With helium", "#0cc9ac"] };
  function fx(x, d) { return (+x).toFixed(d == null ? 2 : d); }
  function pct(x) { return String(Math.round(Math.max(0, Math.min(1, x)) * 100)); }
  function anLoad() {
    if (AN.data) return Promise.resolve();
    return fetch("data/flex_model.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (M) { AN.data = M; });
  }
  function anRows() { return AN.data.rows.filter(function (r) { return r.fuel === AN.fuel; }); }
  function anMedianSize() { var d = anRows().map(function (r) { return r.d0; }).sort(function (a, b) { return a - b; }); return d[Math.floor(d.length / 2)]; }
  function anStart() {
    var S = AN_SLIDER;
    AN.v = { o2: Math.max(S.o2[0], Math.min(S.o2[1], ATM.o2)), co2: 0, he: 0, p: Math.max(S.p[0], Math.min(S.p[1], ATM.p)), d0: anMedianSize() };
  }
  function anGas(r) { return r.he > 0 ? "he" : r.co2 > 0 ? "co2" : "n2"; }
  function anFeature(k) { return AN.data.about.features.filter(function (f) { return f[0] === k; })[0]; }
  // what the estimate rests on: inside the tested range or not, and the nearest real tests
  function anSupport() {
    var F = AN.data.fuels[AN.fuel], out = FlexModel.outside(F.range, AN.v), e = FlexModel.estimate(F.models.rate, AN.v);
    if (out.length) return '<p class="an-support warn"><b>Outside what FLEX tested.</b> ' + out.map(function (o) {
      var f = anFeature(o.key);
      return esc(f[1]) + " " + num(o.value) + " " + f[2] + " is " + o.side + " the " + (o.side === "above" ? "highest" : "lowest") + " tested for this fuel (" + num(o.limit) + " " + f[2] + ")";
    }).join("; ") + ". The model is a straight line, so outside the tested range the figures are an extension of the trend, not evidence.</p>";
    if (e.unusual) return '<p class="an-support warn"><b>Inside the tested ranges, but an unusual combination.</b> Each setting was tested, yet few FLEX tests combine them like this, so the ranges are wide.</p>';
    return '<p class="an-support ok"><b>Inside the conditions FLEX tested</b> for ' + esc(AN.fuel.toLowerCase()) + " droplets.</p>";
  }
  function anOut() {
    var F = AN.data.fuels[AN.fuel], v = AN.v, r = FlexModel.estimate(F.models.rate, v), mr = F.models.rate;
    var near = FlexModel.nearest(AN.data.rows, AN.fuel, v, F.range, 5), ends = {};
    near.forEach(function (x) { ends[x.row.end] = (ends[x.row.end] || 0) + 1; });
    var h = '<div class="an-res"><div><span>Burning rate, model estimate</span><b>' + fx(Math.max(0, r.value)) + "</b><small>A single test would likely fall between " + fx(Math.max(0, r.low)) + " and " + fx(Math.max(0, r.high)) +
      " (95 % range). FLEX measured " + fx(mr.min) + " to " + fx(mr.max) + ' for this fuel.</small></div><div><span>How the five closest real tests ended</span><b class="words">' +
      Object.keys(ends).sort(function (a, b) { return ends[b] - ends[a]; }).map(function (e) { return ends[e] + " " + esc(e.toLowerCase()); }).join(", ") +
      "</b><small>NASA's labels. Extinction: the flame went out at a finite droplet size. Completion: the droplet burned to completion. Disruption is not explained in the table. Measured, not modelled.</small></div></div>" + anSupport();
    h += '<h3>The five real FLEX tests closest to this condition</h3><div class="tablewrap"><table class="an-near"><thead><tr><th>Test</th><th class="num">Oxygen</th><th class="num">CO2</th><th class="num">Helium</th><th class="num">Pressure</th><th class="num">Size</th><th class="num">Burning rate</th><th class="num">Fuel left</th><th>How it ended</th><th></th></tr></thead><tbody>' +
      near.map(function (x) {
        var t = x.row;
        return "<tr><td>" + esc(t.id) + '</td><td class="num">' + num(t.o2) + ' %</td><td class="num">' + num(t.co2) + ' %</td><td class="num">' + num(t.he) + ' %</td><td class="num">' + num(t.p) + ' psi</td><td class="num">' + num(t.d0) +
          ' mm</td><td class="num">' + (t.rate == null ? "" : num(t.rate)) + '</td><td class="num">' + (t.left == null ? "" : pct(t.left) + " %") + "</td><td>" + esc(t.end) + '</td><td><button class="link" data-table="' + AN.data.about.source_table + '" data-row="' + t.row + '">NASA\'s row</button></td></tr>';
      }).join("") + "</tbody></table></div>";
    return h;
  }
  // Measured burning rate against oxygen, with the model's line for the chosen settings.
  function anChart() {
    var F = AN.data.fuels[AN.fuel], m = F.models.rate, rows = anRows().filter(function (r) { return r.rate != null; });
    var W = 1000, H = 400, L = 62, R = 24, T = 20, B = 52, x = scaleLin(10, 46, L, W - R), ymax = Math.ceil(Math.max(m.max, 1) * 10) / 10 + 0.1, y = scaleLin(0, ymax, H - B, T);
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Measured burning rate against oxygen for ' + esc(AN.fuel) + ' droplets, with the model line">';
    for (var g = 0; g <= ymax + 1e-9; g += 0.2) s += '<line class="grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(g) + '" y2="' + y(g) + '"/><text class="tick" x="' + (L - 10) + '" y="' + (y(g) + 4) + '" text-anchor="end">' + fx(g, 1) + "</text>";
    for (var o = 10; o <= 45; o += 5) s += '<text class="tick" x="' + x(o) + '" y="' + (H - B + 22) + '" text-anchor="middle">' + o + " %</text>";
    s += '<text class="axis-title" x="' + ((L + W - R) / 2) + '" y="' + (H - 8) + '" text-anchor="middle">Oxygen in the gas around the droplet</text><text class="axis-title" x="12" y="13">Burning rate</text>';
    // tested oxygen range, then the model's 95 % band and line across it
    s += '<rect class="an-range" x="' + x(F.range.o2[0]) + '" y="' + T + '" width="' + (x(F.range.o2[1]) - x(F.range.o2[0])) + '" height="' + (H - B - T) + '"/>';
    var up = [], dn = [], mid = [], lo = 10, hi = 46, cl = function (v) { return Math.max(0, Math.min(ymax, v)); };
    for (var k = 0; k <= 36; k++) {
      var ox = lo + (hi - lo) * k / 36, e = FlexModel.estimate(m, { o2: ox, co2: AN.v.co2, he: AN.v.he, p: AN.v.p, d0: AN.v.d0 });
      up.push(x(ox) + "," + y(cl(e.high))); dn.unshift(x(ox) + "," + y(cl(e.low))); mid.push(x(ox) + "," + y(cl(e.value)));
    }
    s += '<polygon class="an-band" points="' + up.concat(dn).join(" ") + '"/><polyline class="an-line" points="' + mid.join(" ") + '"/>';
    rows.forEach(function (r) {
      s += '<circle cx="' + x(r.o2).toFixed(1) + '" cy="' + y(r.rate).toFixed(1) + '" r="4.5" fill="' + AN_GAS[anGas(r)][1] + '" fill-opacity=".8" stroke="#000" stroke-width=".7"><title>' + esc(r.id + ": " + num(r.o2) + " % oxygen, " +
        num(r.co2) + " % CO2, " + num(r.he) + " % helium, " + num(r.p) + " psi, burning rate " + num(r.rate)) + "</title></circle>";
    });
    var cur = FlexModel.estimate(m, AN.v), cx = x(Math.max(10, Math.min(46, AN.v.o2)));
    s += '<line class="an-now" x1="' + cx + '" x2="' + cx + '" y1="' + T + '" y2="' + (H - B) + '"/><circle class="an-dot" cx="' + cx + '" cy="' + y(cl(cur.value)) + '" r="7"/>';
    return s + "</svg>";
  }
  // The next test that would narrow the model's estimate the most, among the conditions FLEX's hardware ran
  // (nitrogen only, as in a habitat). Candidates on a grid over the tested ranges; model.js does the algebra.
  function anNextGrid() {
    var F = AN.data.fuels[AN.fuel], m = F.models.rate, R = F.range, v0 = AN.v, best = null, cells = [];
    var o2s = [], ps = [], ds = [];
    for (var o = Math.ceil(R.o2[0]); o <= Math.floor(R.o2[1]); o += 1) o2s.push(o);
    var pStep = (R.p[1] - R.p[0]) / 34;
    for (var k = 0; k <= 34; k++) ps.push(R.p[0] + k * pStep);
    for (var d = 0; d <= 8; d++) ds.push(R.d0[0] + d * (R.d0[1] - R.d0[0]) / 8);
    o2s.forEach(function (o2) {
      ps.forEach(function (p) {
        var cellBest = null;
        ds.forEach(function (d0) {
          var v = { o2: o2, co2: 0, he: 0, p: p, d0: d0 }, r = FlexModel.nextTest(m, v0, v);
          if (!cellBest || r.shrink > cellBest.r.shrink) cellBest = { v: v, r: r };
        });
        cells.push(cellBest);
        if (!best || cellBest.r.shrink > best.r.shrink) best = cellBest;
      });
    });
    return { m: m, R: R, o2s: o2s, ps: ps, cells: cells, best: best };
  }
  function anNextMap(G) {
    var W = 1000, H = 330, L = 64, Rt = 20, T = 14, B = 46, x = scaleLin(G.R.p[0], G.R.p[1], L, W - Rt), y = scaleLin(G.R.o2[0], G.R.o2[1], H - B, T);
    var cw = (W - Rt - L) / (G.ps.length - 1), ch = (H - B - T) / Math.max(1, G.o2s.length - 1), top = G.best.r.shrink || 1;
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="How much one more test would narrow the range, for each oxygen level and pressure FLEX tested">';
    G.cells.forEach(function (c) {
      var a = Math.max(0.04, c.r.shrink / top);
      s += '<rect shape-rendering="crispEdges" x="' + (x(c.v.p) - cw / 2).toFixed(1) + '" y="' + (y(c.v.o2) - ch / 2).toFixed(1) + '" width="' + (cw + 1.2).toFixed(1) + '" height="' + (ch + 1.2).toFixed(1) + '" fill="rgb(' + Math.round(12 + a * 0.85 * 215) + "," + Math.round(12 + a * 0.85 * 215) + "," + Math.round(14 + a * 0.85 * 213) + ')"><title>' +
        num(c.v.o2) + " % oxygen, " + num(c.v.p) + " psi: one test narrows the range by " + Math.round(c.r.shrink * 100) + " %</title></rect>";
    });
    for (var o = Math.ceil(G.R.o2[0] / 5) * 5; o <= G.R.o2[1]; o += 5) s += '<text class="tick" x="' + (L - 8) + '" y="' + (y(o) + 4) + '" text-anchor="end">' + o + " %</text>";
    for (var p = Math.ceil(G.R.p[0] / 5) * 5; p <= G.R.p[1]; p += 5) s += '<text class="tick" x="' + x(p) + '" y="' + (H - B + 20) + '" text-anchor="middle">' + p + "</text>";
    s += '<text class="axis-title" x="' + ((L + W - Rt) / 2) + '" y="' + (H - 6) + '" text-anchor="middle">Pressure of the test, psi</text><text class="axis-title" x="4" y="10">Oxygen</text>';
    var v0 = AN.v;
    if (v0.p >= G.R.p[0] - 1 && v0.p <= G.R.p[1] && v0.o2 >= G.R.o2[0] && v0.o2 <= G.R.o2[1]) s += '<circle class="an-target" cx="' + x(Math.max(G.R.p[0], v0.p)) + '" cy="' + y(v0.o2) + '" r="9"/><text class="an-tl" x="' + (x(Math.max(G.R.p[0], v0.p)) + 14) + '" y="' + (y(v0.o2) - 10) + '">your condition</text>';
    var b = G.best.v;
    s += '<circle class="an-best" cx="' + x(b.p) + '" cy="' + y(b.o2) + '" r="6"/><text class="an-bl" x="' + (x(b.p) + 12) + '" y="' + (y(b.o2) + 18) + '">best next test</text>';
    return s + "</svg>";
  }
  function anNext() {
    var G = anNextGrid(), m = G.m, v0 = AN.v, best = G.best, est = FlexModel.estimate(m, v0);
    var pre = function (id) { return D.about.presets.filter(function (p) { return p.id === id; })[0]; };
    var cmp = Math.abs(v0.o2 - pre("earth").o2) < 2 && Math.abs(v0.p - pre("earth").p) < 1 ? pre("moon") : pre("earth");   // compare with an air far from the condition
    var ev = { o2: cmp.o2, co2: 0, he: 0, p: cmp.p, d0: best.v.d0 }, er = FlexModel.nextTest(m, v0, ev);
    var half = FlexModel.testsToShrink(m, v0, best.v, 0.5, 2000);
    var pc = function (x) { return x < 0.1 ? (x * 100).toFixed(1) : String(Math.round(x * 100)); };
    var h = '<p class="sub2">The model estimates a burning rate of <b>' + fx(est.value) + "</b> at the condition set above, give or take <b>" + fx(best.r.half0, 3) + "</b> for the average (95 % range). " +
      "Which single extra test, of the kind FLEX ran, would narrow that range the most? Every condition FLEX's hardware covered for " + esc(AN.fuel.toLowerCase()) + " was tried: " + G.cells.length + " combinations of oxygen and pressure, each at the droplet size that helps most, nitrogen only.</p>";
    h += '<div class="counters an-find"><div class="hot"><b>' + pc(best.r.shrink) + " %</b><span>narrower range after one test at <strong>" + num(best.v.o2) + " % oxygen, " + num(best.v.p) + " psi</strong>, with a " + num(best.v.d0) + " mm droplet: from &plusmn;" + fx(best.r.half0, 3) + " to &plusmn;" + fx(best.r.half1, 3) + ".</span></div>";
    h += "<div><b>" + pc(er.shrink) + " %</b><span>narrower after one test in " + esc(cmp.name) + " (" + num(cmp.o2) + " % oxygen, " + num(cmp.p) + " psi), for comparison. A test far from the condition teaches the model little about it.</span></div>";
    h += half.k ? "<div><b>" + half.k + "</b><span>tests at that best condition would halve the range.</span></div></div>" :
      "<div><b>" + Math.round(half.floor * 100) + " %</b><span>of today's range is as far as tests at that one condition can go, however many are run. Tests at one condition pin down only part of the model; going further takes tests at several conditions.</span></div></div>";
    h += '<div class="chart">' + anNextMap(G) + '</div><p class="src">Each square: how much one more test there would narrow the range at your condition (brighter is more). Hover a square for its value. ' +
      "This is the standard algebra for adding one test to a straight-line model; it assumes the model holds and the scatter between tests stays as it is. It ranks tests for fuel droplets only. For solid materials there is no model to improve: NASA's data has no solid-material test at 30 % oxygen or more, so any such test would be the first.</p>";
    return h;
  }
  function anDraw() {
    var a = document.getElementById("an-out"), b = document.getElementById("an-chart");
    if (a) a.innerHTML = anOut();
    if (b) b.innerHTML = anChart();
    var c = document.getElementById("an-next");
    if (c) c.innerHTML = anNext();
  }
  function viewAnalysis() {
    setTitle("Analysis");
    if (!AN.data) {
      main.innerHTML = '<p class="loading">Loading the model…</p>';
      anLoad().then(function () { if (hashParts()[0] === "analysis") route(true); });
      return;
    }
    if (!AN.v) anStart();
    var M = AN.data, F = M.fuels[AN.fuel], mr = F.models.rate, mb = D.about.moon_base, R = D.summary.o2_range_by_class;
    var earth = D.about.presets.filter(function (p) { return p.id === "earth"; })[0], gap = mb.o2_min_percent - earth.o2;
    var base = { o2: earth.o2, co2: 0, he: 0, p: Math.max(mb.pressure_max_psi, F.range.p[0]), d0: anMedianSize() }, top = { o2: mb.o2_min_percent, co2: 0, he: 0, p: base.p, d0: base.d0 };
    var r0 = FlexModel.estimate(mr, base).value, r1 = FlexModel.estimate(mr, top).value;
    var h = '<p class="kick">Analysis</p><h1 class="wide">What oxygen does to a burning droplet</h1>';
    h += '<p class="lead wide">FLEX is the one investigation in NASA\'s repository that burned fuel at ' + num(mb.o2_min_percent) + " % oxygen and more, close to Moon Base pressure, and recorded how every test ended. We fitted a simple statistical model to its " +
      M.about.rows_in_table + " tests to measure what oxygen, pressure and extinguishing gases change. It covers fuel droplets only. For solid materials no such analysis is possible: their tests stop at " + num(R.solid.max) + " % oxygen.</p>";
    h += '<div class="tabs" role="group" aria-label="Fuel">' + Object.keys(M.fuels).map(function (f) {
      return '<button class="tabbtn' + (f === AN.fuel ? " on" : "") + '" data-anfuel="' + esc(f) + '" aria-pressed="' + (f === AN.fuel) + '">' + esc(f) + " droplets, " + M.fuels[f].tests + " tests</button>";
    }).join("") + "</div>";
    // the same comparison measured directly: nitrogen-only tests near Moon Base pressure
    var direct = function (lo, hi) {
      var v = anRows().filter(function (t) { return t.rate != null && !t.co2 && !t.he && t.p <= mb.pressure_max_psi + 0.5 && t.o2 >= lo - 1e-9 && t.o2 <= hi + 1e-9; }).map(function (t) { return t.rate; });
      return { n: v.length, mean: v.length ? v.reduce(function (a, b) { return a + b; }, 0) / v.length : null };
    };
    var d0 = direct(earth.o2 - 1, earth.o2), d1 = direct(mb.o2_min_percent, mb.o2_min_percent);
    var E = F.endings, endOf = function (b) { var c = E.filter(function (x) { return x.band === b; })[0].counts, n = 0; Object.keys(c).forEach(function (k) { n += c[k]; }); return { ext: c.Extinction || 0, n: n }; };
    var eLow = endOf("below"), eHigh = endOf("at_or_above");
    h += '<div class="counters an-find"><div class="hot"><b>+' + Math.round((r1 - r0) / r0 * 100) + " %</b><span>faster burning at " + num(mb.o2_min_percent) + " % oxygen than at " + num(earth.o2) + " %, in nitrogen at " + num(base.p) +
      " psi (model). Each extra point of oxygen raised the burning rate by " + fx(mr.beta[1], 3) + " (95 % range " + fx(mr.ci_low[1], 3) + " to " + fx(mr.ci_high[1], 3) + ")." +
      (d0.n && d1.n ? " Measured directly: " + fx(d0.mean) + " at " + num(earth.o2 - 1) + " to " + num(earth.o2) + " % (" + d0.n + " tests) against " + fx(d1.mean) + " at " + num(mb.o2_min_percent) + " % (" + d1.n + " tests)." : "") + "</span></div>";
    h += "<div><b>" + eHigh.ext + " of " + eHigh.n + "</b><span>flames went out on their own at " + num(mb.o2_min_percent) + " % oxygen or more. Below " + num(earth.o2) + " % oxygen, " + eLow.ext + " of " + eLow.n +
      " did. Counted from NASA's table, no model. NASA picked the conditions of each test, so this is what happened in these tests, not a rate for all fires.</span></div>";
    h += "<div><b>" + (mr.beta[2] > 0 ? "+" : "") + fx(mr.beta[2] * 10, 2) + "</b><span>change in burning rate for every 10 points of carbon dioxide in the gas (95 % range " + fx(mr.ci_low[2] * 10, 2) + " to " + fx(mr.ci_high[2] * 10, 2) +
      "), against " + (mr.beta[1] > 0 ? "+" : "") + fx(mr.beta[1] * 10, 2) + " for 10 points of oxygen. Helium " + (mr.ci_low[3] > 0 ? "raised" : mr.ci_high[3] < 0 ? "lowered" : "did not clearly change") + " the burning rate.</span></div></div>";
    h += '<p class="src">From NASA\'s FLEX table (PSI-69), ' + esc(AN.fuel.toLowerCase()) + " droplets. These describe burning fuel droplets in weightlessness. They are not a forecast for cabin materials or for Moon gravity.</p>";

    h += "<h2>Try a condition</h2><p class=\"sub2\">Move a setting. The estimate, its range, and the real tests behind it update at once. It starts at the atmosphere you chose on the overview.</p>";
    h += '<div class="an-grid"><div class="an-ctl">' + FlexModel.KEYS.map(function (k) {
      var f = anFeature(k), S = AN_SLIDER[k];
      return '<label><span>' + esc(f[1]) + ' <b id="an-val-' + k + '">' + num(AN.v[k]) + " " + f[2] + '</b></span><input type="range" data-an="' + k + '" min="' + S[0] + '" max="' + S[1] + '" step="' + S[2] + '" value="' + AN.v[k] +
        '"><small>FLEX tested ' + num(F.range[k][0]) + " to " + num(F.range[k][1]) + " " + f[2] + "</small></label>";
    }).join("") + '<p class="small muted">The rest of the gas is nitrogen.</p></div><div id="an-out">' + anOut() + "</div></div>";

    h += '<h2>Measured burning rate against oxygen</h2><p class="sub2">Each point is one FLEX test. The line is the model for the settings above, the band is where a single test would likely fall, and the lighter area is the oxygen range FLEX tested.</p>';
    h += '<div class="chart" id="an-chart">' + anChart() + '</div><p class="legend">' + Object.keys(AN_GAS).map(function (k) { return '<span><i class="sw" style="background:' + AN_GAS[k][1] + '"></i>' + AN_GAS[k][0] + "</span>"; }).join("") + "</p>";

    h += '<h2>The next test that would teach the most</h2><div id="an-next">' + anNext() + "</div>";

    var endNames = Object.keys(E[0].counts), bandName = { below: "Below " + num(earth.o2) + " % oxygen", between: num(earth.o2) + " % to below " + num(mb.o2_min_percent) + " %", at_or_above: num(mb.o2_min_percent) + " % oxygen or more" };
    h += "<h2>How the tests ended</h2><p class=\"sub2\">Counted from NASA's column \"Test end\", by oxygen level. Extinction means the flame went out at a finite droplet size, completion that the droplet burned to completion (the FLEX record's words). The table does not explain \"Disruption\".</p>";
    h += '<div class="tablewrap"><table><thead><tr><th>Oxygen</th>' + endNames.map(function (e) { return '<th class="num">' + esc(e) + "</th>"; }).join("") + '<th class="num">Tests</th><th class="num">Went out on their own</th></tr></thead><tbody>' +
      E.map(function (b) {
        var n = 0; endNames.forEach(function (e) { n += b.counts[e]; });
        return "<tr><td>" + bandName[b.band] + "</td>" + endNames.map(function (e) { return '<td class="num">' + b.counts[e] + "</td>"; }).join("") + '<td class="num">' + n + '</td><td class="num"><b>' + (n ? Math.round(b.counts.Extinction / n * 100) + " %" : "") + "</b></td></tr>";
      }).join("") + "</tbody></table></div>";

    h += '<h2>How good is the model</h2><p class="sub2">We hid tests from the model and asked it to predict them: one test at a time, and one whole test day at a time. The error should be clearly smaller than the error of always guessing the average.</p>';
    h += '<div class="tablewrap"><table><thead><tr><th>Outcome</th><th class="num">Tests</th><th class="num">Share of variation explained</th><th class="num">Error, one test hidden</th><th class="num">Error, one day hidden</th><th class="num">Error of guessing the average</th></tr></thead><tbody>' +
      Object.keys(F.models).map(function (k) {
        var m = F.models[k];
        return "<tr><td>" + esc(M.about.outcomes[k].label) + '</td><td class="num">' + m.n + '</td><td class="num">' + Math.round(m.r2 * 100) + ' %</td><td class="num">' + fx(m.rmse_leave_one_out, 3) + '</td><td class="num">' + fx(m.rmse_leave_one_day_out, 3) +
          " <span class=\"muted\">(" + m.test_days + ' days)</span></td><td class="num">' + fx(m.rmse_of_guessing_the_mean, 3) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
    h += '<h3>What each setting changes</h3><div class="tablewrap"><table><thead><tr><th>One step more of</th>' + Object.keys(F.models).map(function (k) { return '<th class="num">Change in ' + esc(M.about.outcomes[k].label.toLowerCase()) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      FlexModel.KEYS.map(function (k, i) {
        var f = anFeature(k);
        return "<tr><td>" + esc(f[1]) + ' <span class="muted">(+1 ' + (f[2] === "%" ? "point" : f[2]) + ")</span></td>" + Object.keys(F.models).map(function (o) {
          var m = F.models[o], a = i + 1, clear = m.ci_low[a] > 0 || m.ci_high[a] < 0;
          return '<td class="num">' + (clear ? "<b>" : '<span class="muted">') + (m.beta[a] > 0 ? "+" : "") + fx(m.beta[a], 4) + (clear ? "</b>" : "</span>") + ' <span class="muted">(' + fx(m.ci_low[a], 4) + " to " + fx(m.ci_high[a], 4) + ")</span></td>";
        }).join("") + "</tr>";
      }).join("") + '</tbody></table></div><p class="src">Change in the outcome for one step more of a setting, the others held fixed, with the 95 % range. Grey: the range includes zero, so the data shows no clear effect.</p>';

    h += '<details class="sect"><summary>Method and limits</summary><ul>' +
      "<li><strong>Data.</strong> " + M.about.rows_used + " of the " + M.about.rows_in_table + " tests in NASA's FLEX table are used. Left out: " + Object.keys(M.about.rows_skipped).map(function (k) { return M.about.rows_skipped[k] + " with " + k; }).join(", ") + ".</li>" +
      "<li><strong>Model.</strong> Ordinary least squares, one model per fuel: burning rate = constant + oxygen + carbon dioxide + helium + pressure + droplet size. Nitrogen is the rest of the gas and so the reference.</li>" +
      "<li><strong>Burning rate</strong> is NASA's column \"Burning rate; mm\"; the table does not complete the unit. For droplets it is normally the shrink rate of the diameter squared, in mm² per second.</li>" +
      "<li><strong>Fuel left</strong> in the list of closest tests is (extinction diameter / starting diameter) cubed, for tests NASA marks as ended by extinction. It is shown per test and not modelled: at " + num(mb.o2_min_percent) + " % oxygen almost no test ended in extinction, so there is nothing to model there.</li>" +
      "<li><strong>Inside or outside.</strong> A setting counts as outside when it lies beyond the range FLEX tested for that fuel by more than 1 % of that range. An unusual combination is one whose leverage is above three times the average.</li>" +
      "<li><strong>Ranges.</strong> The 95 % range for a single test comes from the scatter of the tests around the line and grows as a condition moves away from the bulk of the tests.</li>" +
      "<li><strong>Not causal proof.</strong> NASA chose the test conditions for its own goals, not at random. The model describes this set of tests.</li>" +
      "<li><strong>Scope.</strong> Fuel droplets in weightlessness. Not solid materials, not smoke, not Moon gravity.</li>" +
      '<li><strong>Checked twice.</strong> A Python script fits the model; a separate JavaScript script reads NASA\'s CSV again, refits it and must get the same numbers. See <a href="#/data">Data and method</a>.</li></ul>' +
      '<p><button class="btn sm ghost" data-table="' + M.about.source_table + '">Open NASA\'s FLEX table</button> <a class="more" style="margin-left:1rem" href="data/flex_model.json">Download the model (JSON)</a> <a class="more" style="margin-left:1rem" href="#/inv/' + M.about.investigation + '">About FLEX</a></p></details>';
    main.innerHTML = h;
  }

  // ------------------------------------------------- what NASA has written about each question
  // Every passage of the records and of the listed papers was labelled by a large language model;
  // scripts/build_topics.mjs checks every label's quote and counts. See data/content/question_topics.json.
  var TOPICS = null;
  function topicsLoad() {
    if (TOPICS) return Promise.resolve();
    return fetch("data/topics.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (t) { TOPICS = t; });
  }
  var TOPIC_SHORT = { tested: "Tested in Moon Base air", materials: "Cabin materials", "earth-test": "Trusting the Earth test", "put-out": "Putting a fire out", detect: "Detecting a fire", gravity: "Moon gravity" };
  // a passage with the words that justify its label in bold
  function markQuote(text, quotes) {
    var t = esc(text);
    (quotes || []).forEach(function (q) {
      var e = esc(q), at = t.indexOf(e);
      if (at >= 0) t = t.slice(0, at) + "<b>" + e + "</b>" + t.slice(at + e.length);
    });
    return t;
  }
  function topicSource(x) {
    if (x.kind === "record") return '<a href="#/inv/' + x.inv + '">' + esc(BY_ID[x.inv] ? BY_ID[x.inv].name : x.inv) + "</a>, NASA record";
    return '<a href="https://doi.org/' + esc(x.doi) + '" target="_blank" rel="noopener">' + esc(x.title) + "</a>" + (x.year ? " (" + x.year + ")" : "") + ", paper listed by " + esc((x.psi || []).map(function (id) { return BY_ID[id] ? BY_ID[id].name : id; }).join(", "));
  }
  function topicLine(id) {
    var t = TOPICS && TOPICS.topics[id];
    if (!t) return "";
    return t.passages + " of " + TOPICS.about.passages + " passages, from " + t.records + " NASA record" + (t.records === 1 ? "" : "s") + " and " + t.papers + " paper" + (t.papers === 1 ? "" : "s");
  }
  function topicChart() {
    var T = TOPICS, ids = D.questions.map(function (q) { return q.id; }), max = Math.max.apply(null, ids.map(function (id) { return T.topics[id].passages; }));
    var W = 1000, L = 250, R = 330, row = 46, H = ids.length * row + 34, x = scaleLin(0, max, L, W - R);
    var s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Passages of NASA text that address each fire question">';
    ids.forEach(function (id, k) {
      var t = T.topics[id], y = 10 + k * row, low = t.passages < 30;
      s += '<a href="#/questions/' + id + '"><text class="tq' + (low ? " low" : "") + '" x="' + (L - 14) + '" y="' + (y + 19) + '" text-anchor="end">' + esc(TOPIC_SHORT[id]) + "</text>";
      s += '<rect class="tr" x="' + L + '" y="' + (y + 4) + '" width="' + Math.max(0, x(t.record_passages) - L) + '" height="22"/><rect class="tp" x="' + x(t.record_passages) + '" y="' + (y + 4) + '" width="' + Math.max(0, x(t.passages) - x(t.record_passages)) + '" height="22"/>';
      s += '<text class="tn' + (low ? " low" : "") + '" x="' + (x(t.passages) + 10) + '" y="' + (y + 20) + '">' + t.passages + '</text><text class="ts" x="' + (W - R + 70) + '" y="' + (y + 20) + '">' + t.records + (t.records === 1 ? " record, " : " records, ") + t.papers + (t.papers === 1 ? " paper" : " papers") + "</text></a>";
    });
    return s + "</svg>";
  }
  function topicSection() {
    if (!TOPICS) return '<p class="loading">Loading…</p>';
    var T = TOPICS, A = T.about, O = {};
    T.overlaps.forEach(function (o) { O[o.id] = o; });
    var h = '<h2>What NASA has written about each question</h2><p class="sub2">An AI read all ' + A.passages + " passages of NASA's " + D.summary.investigations + " records and of the papers they list, and sorted each one under the questions it addresses. " +
      "For every passage it sorted, it quotes the words that justify it, and a program checks each quote. A passage can count for several questions.</p>";
    h += '<div class="chart topic-chart">' + topicChart() + '</div><p class="legend"><span><i class="sw sq" style="background:#e3e3e3"></i>Passages from NASA\'s records</span><span><i class="sw sq" style="background:#6b6b70"></i>Passages from papers</span></p>';
    var g = T.topics.gravity, so = O["solids-in-moon-air"], de = O["detect-in-moon-air"];
    h += '<div class="counters topic-find"><div class="hot"><b>' + g.passages + "</b><span>of " + A.passages + " passages " + (g.passages === 1 ? "is" : "are") + " about fire in Moon or partial gravity. " + (g.records ? "" : "None of them is in NASA's records.") + "</span></div>";
    h += '<div class="hot"><b>' + so.passages + "</b><span>passages, from " + so.sources + " source" + (so.sources === 1 ? "" : "s") + ", are about solid materials in high-oxygen or low-pressure air: " +
      so.examples.map(function (x) { return x.kind === "record" ? esc(BY_ID[x.inv].name) : "a paper of " + x.year; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join(" and ") + '. <button class="link" data-topicshow="solids-in-moon-air">Read them</button></span></div>';
    h += "<div><b>" + de.passages + "</b><span>passages are about detecting a fire in high-oxygen or low-pressure air, against " + T.topics.detect.passages + " about detection in general.</span></div></div>";
    h += '<div id="topic-show"></div>';
    h += '<p class="src">Labelled by ' + esc(A.labelled_by) + ", " + esc(A.date) + ', following a written guide for each question. These are counts of what NASA wrote about, not of tests run. A program verifies every quote; whether each label is right is a judgement, and a person should check a sample. <a href="data/topics.json">Download the labels and counts (JSON)</a></p>';
    return h;
  }
  function topicExamples(id) {
    var t = TOPICS && TOPICS.topics[id];
    if (!t || !t.passages) return '<p class="topic-none">No passage in NASA\'s records or the listed papers addresses this question.</p>';
    return '<div class="topic-ex"><p><b>What NASA has written on this:</b> ' + topicLine(id) + ". A few of them, the justifying words in bold:</p><ul>" + t.examples.slice(0, 5).map(function (x) {
      return "<li>“" + markQuote(x.text, [x.quote]) + "”<span>" + topicSource(x) + "</span></li>";
    }).join("") + "</ul></div>";
  }

  // ------------------------------------------------- Earth tests at Moon Base pressure (not from PSI)
  // NASA White Sands Test Facility, 2007. scripts/build_external.py reads the thresholds from the paper's text.
  var EARTH = null;
  function earthLoad() {
    if (EARTH) return Promise.resolve();
    return fetch("data/earth_tests.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (E) { EARTH = E; });
  }
  // What the paper lets us say about one sample at one oxygen level. It tested in steps, from 30 % upward.
  function earthStatus(r, o2) {
    var step = EARTH.about.oxygen_step_percent;
    if (r.kind === "below") return o2 >= r.limit ? "burn" : "untested";
    if (r.kind === "above") return o2 <= r.limit ? "out" : "untested";
    return o2 <= r.limit ? "out" : o2 >= r.limit + step ? "burn" : "untested";
  }
  function earthChart(o2) {
    var rows = EARTH.rows, cats = [], W = 1000, L = 372, R = 150, lo = 28, hi = 50, x = scaleLin(lo, hi, L, W - R), y = 44, s = "", body = "";
    rows.forEach(function (r) { if (cats.indexOf(r.category) < 0) cats.push(r.category); });
    cats.forEach(function (c) {
      body += '<text class="cat" x="0" y="' + (y + 12) + '">' + esc(c) + "</text>";
      y += 24;
      rows.filter(function (r) { return r.category === c; }).forEach(function (r) {
        var st = earthStatus(r, o2), end = Math.min(r.limit, hi), say = r.kind === "below" ? "burned at " + num(r.limit) + " %" : r.kind === "above" ? "above " + num(r.limit) + " %" : "up to " + num(r.limit) + " %";
        body += '<g class="row ' + st + '"><title>' + esc(r.label + (r.config ? ", " + r.config : "") + ": " + r.composition + ". As printed: ULOI " + r.uloi + ", MOC " + r.moc) + '</title><text class="name" x="' + (L - 12) + '" y="' + (y + 11) + '" text-anchor="end">' +
          esc(r.label + (r.config ? ", " + r.config : "")) + "</text>";
        if (r.kind !== "below") body += '<rect class="bar" x="' + x(lo) + '" y="' + (y + 1) + '" width="' + (x(end) - x(lo)) + '" height="12"/>';
        if (r.kind === "above" && r.limit < hi) body += '<rect class="more" x="' + x(r.limit) + '" y="' + (y + 1) + '" width="' + (x(hi) - x(r.limit)) + '" height="12"/>';
        if (r.kind === "below") body += '<circle class="fail" cx="' + x(r.limit) + '" cy="' + (y + 7) + '" r="5"/>';
        body += '<text class="say" x="' + (W - R + 12) + '" y="' + (y + 11) + '">' + say + "</text></g>";
        y += 22;
      });
      y += 8;
    });
    var H = y + 6;
    s = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Highest oxygen level at which each of ' + rows.length + ' material samples put itself out in NASA\'s upward-flame test on Earth, at ' + num(EARTH.about.pressure_kpa) + ' kilopascal">';
    for (var v = 30; v <= hi; v += 5) s += '<line class="grid" x1="' + x(v) + '" x2="' + x(v) + '" y1="34" y2="' + (H - 6) + '"/><text class="tick" x="' + x(v) + '" y="26" text-anchor="middle">' + v + " %</text>";
    s += '<text class="tick" x="' + (L - 12) + '" y="26" text-anchor="end">Oxygen in the test chamber</text>' + body;
    if (o2 >= lo && o2 <= hi) s += '<line class="you" x1="' + x(o2) + '" x2="' + x(o2) + '" y1="34" y2="' + (H - 6) + '"/><text class="youlab" x="' + x(o2) + '" y="10" text-anchor="middle">Your air, ' + num(o2) + " %</text>";
    return s + "</svg>";
  }
  // All 26 samples, folded away under the habitat check.
  function earthAll() {
    var A = EARTH.about, o2 = ATM.o2;
    var h = '<details class="sect"><summary>All ' + EARTH.rows.length + ' samples NASA tested on Earth</summary><p class="sub2" style="margin-top:.4rem"><strong>This table is not from PSI.</strong> NASA\'s White Sands Test Facility burned ' + EARTH.rows.length +
      " material samples on Earth, at " + num(A.pressure_kpa) + " kPa (" + num(A.pressure_psi) + " psi), and recorded the highest oxygen level at which each one still put itself out.</p>";
    h += '<div class="chart earth-chart">' + earthChart(o2) + '</div><p class="legend"><span><i class="sw sq" style="background:#e3e3e3"></i>Put itself out at your oxygen level</span><span><i class="sw sq" style="background:#6b6b70"></i>Did not reliably put itself out</span><span><i class="sw sq ring"></i>Not tested at that level</span><span><i class="sw sq" style="background:rgba(227,227,227,.3)"></i>Passed at the highest level tested; limit not found</span></p>';
    h += '<p class="src">Source: ' + esc(A.source.authors) + ", " + A.source.year + ', <a href="' + A.source.url + '">' + esc(A.source.title) + "</a>, Table 2. A bar ends at the paper's MOC, the highest oxygen level at which the sample consistently put itself out. Earth gravity. " +
      "The materials were candidates for an earlier NASA programme, not a list of what a Moon Base will use.</p></details>";
    h += '<details class="sect"><summary>How to read the Earth tests, in NASA\'s words</summary><ul>' +
      "<li><strong>The test.</strong> “" + esc(A.quotes.test) + "” “" + esc(A.quotes.pass) + ".”</li>" +
      "<li><strong>The limit.</strong> “" + esc(A.quotes.moc) + ".”</li>" +
      "<li><strong>Below 30 and above 40.</strong> “" + esc(A.quotes.below) + "”</li>" +
      "<li><strong>Not final.</strong> “" + esc(A.quotes.conclusion) + "”</li>" +
      "<li><strong>Our reading.</strong> A sample counts as putting itself out at any oxygen level up to its limit, and as not reliably doing so from one test step (" + num(A.oxygen_step_percent) + " %) above it. Levels the paper did not test are shown as not tested.</li>" +
      "<li><strong>No hand-typed numbers.</strong> A program reads every threshold from the text of the paper, which is stored with the site's source code together with the PDF and its checksum.</li></ul>" +
      '<p><a class="more" href="data/earth_tests.json">Download this table (JSON)</a> <a class="more" style="margin-left:1rem" href="' + A.source.pdf_url + '">The paper (PDF, NASA)</a></p></details>';
    return h;
  }

  // ---------------------------------------------------------------- habitat
  // One drawing is the whole tool. The reader sets the air and one material for four parts of the habitat,
  // in boxes tied to those parts; each part then shows what NASA has tested for it. The numbered spots are the six open questions.
  var HAB_SPOT = { tested: [142, 166], materials: [212, 248], "earth-test": [398, 188], "put-out": [486, 262], detect: [470, 172], gravity: [812, 268] };
  var HAB_SLOT = [   // category in the White Sands table, the part it stands for here, box position, where its line ends
    { cat: "Foams", part: "foam", title: "Mattress and padding", x: 205, to: [232, 281] },
    { cat: "Fabrics", part: "fabric", title: "Curtain and bedding", x: 365, to: [320, 150] },
    { cat: "Rigid plastics", part: "plastic", title: "Equipment rack", x: 525, to: [576, 160] },
    { cat: "Composites/Laminates", part: "laminate", title: "Hull and wall panels", x: 685, to: [664, 205] }
  ];
  var habPick = null;   // one row index of EARTH.rows per slot
  function habRows(cat) { return EARTH.rows.map(function (r, i) { return { r: r, i: i }; }).filter(function (x) { return x.r.category === cat; }); }
  function habLabel(r) { return r.label + (r.config ? ", " + r.config : ""); }
  function habStart() {
    habPick = HAB_SLOT.map(function (sl) { return habRows(sl.cat)[0].i; });      // the first sample of each group, in the paper's order
    var m = /[?&]m=([\d,]+)/.exec(location.hash);
    if (m) m[1].split(",").forEach(function (v, k) { var r = EARTH.rows[+v]; if (k < HAB_SLOT.length && r && r.category === HAB_SLOT[k].cat) habPick[k] = +v; });
  }
  var HAB_WORD = { burn: "Fails on Earth", out: "Passes on Earth, not confirmed in space", untested: "Not tested at this oxygen level" };
  function habLimit(r) {
    return r.kind === "below" ? "Burned at " + num(r.limit) + " %, the lowest level tested" : r.kind === "above" ? "Put itself out at " + num(r.limit) + " %, the highest level tested" : "Put itself out up to " + num(r.limit) + " % oxygen";
  }
  function habitatDrawing(sel, st) {
    var s = '<svg viewBox="40 -5 810 445" role="img" aria-label="Cross-section of a Moon habitat. Boxes above set the air and four materials; six numbered spots are open fire questions.">';
    s += '<path class="d" d="M0 392 H860 M70 392 q22 9 44 0 M300 392 q30 10 60 0 M610 392 q16 7 32 0 M770 392 q26 9 52 0"/>';
    // shell, inner wall (the laminate part), floor, legs
    s += '<rect class="shell" x="70" y="120" width="600" height="250" rx="125"/><rect class="d part ' + st[3] + '" x="82" y="132" width="576" height="226" rx="113"/>';
    // lines from the boxes to the parts they set
    s += '<path class="lead" d="M120 62 V148"/>';
    HAB_SLOT.forEach(function (sl, k) { s += '<path class="lead ' + st[k] + '" d="M' + (sl.x + 75) + " 62 L" + sl.to[0] + " " + sl.to[1] + '"/><circle class="end ' + st[k] + '" cx="' + sl.to[0] + '" cy="' + sl.to[1] + '" r="4"/>'; });
    s += '<path class="l" d="M112 318 H628"/><path class="d" d="M150 334 H590 M190 318 V334 M270 318 V334 M350 318 V334 M430 318 V334 M510 318 V334"/>';
    s += '<path class="l" d="M210 370 L198 392 M186 392 H212 M530 370 L542 392 M528 392 H556"/>';
    // airlock, hatch and steps
    s += '<rect class="shell thin" x="670" y="204" width="92" height="114" rx="8"/><circle class="l" cx="716" cy="258" r="30"/><circle class="d" cx="716" cy="258" r="22"/><path class="d" d="M716 236 V280 M694 258 H738"/>';
    s += '<path class="d" d="M762 318 L792 392 M750 318 L780 392 M765 340 H771 M774 362 H780"/><text x="716" y="340" text-anchor="middle">AIRLOCK</text>';
    // window
    s += '<circle class="l" cx="128" cy="210" r="17"/><circle class="d" cx="128" cy="210" r="11"/>';
    // bunk frame, then mattress and pillow (the foam part)
    s += '<path class="l" d="M150 296 H282 M156 296 V318 M276 296 V318"/><g class="part ' + st[0] + '"><rect class="l" x="154" y="282" width="36" height="13" rx="5"/><path class="l" d="M190 288 C 215 276, 240 294, 280 284 V296"/></g>';
    // curtain (the fabric part)
    s += '<path class="l part ' + st[1] + '" transform="translate(12 0)" d="M296 150 V300 M296 150 C 302 190, 290 220, 300 300 M306 152 C 314 200, 300 240, 312 300 M286 150 H318"/>';
    // table, container, laptop
    s += '<path class="l" d="M330 290 H420 M375 290 V318"/><rect class="l" x="340" y="270" width="28" height="20" rx="2"/><path class="l" d="M384 290 L390 272 H412"/>';
    // the approval sheet on a clipboard
    s += '<rect class="l" x="346" y="170" width="32" height="42" rx="2"/><path class="l" d="M356 170 v-5 h12 v5 M352 182 h14 M352 190 h20 M352 198 h10 M366 201 l3 3 l6 -8"/>';
    // smoke detector on the ceiling
    s += '<path class="l" d="M446 133 a24 13 0 0 0 48 0 M462 142 h16"/>';
    // extinguisher on a wall bracket
    s += '<rect class="l" x="444" y="266" width="18" height="46" rx="7"/><path class="l" d="M450 266 v-8 h6 v8 M456 260 h10 l4 6 M440 278 h26 M440 300 h26"/>';
    // equipment rack with panels and cables (the plastic part)
    s += '<g class="part ' + st[2] + '"><rect class="l" x="530" y="160" width="92" height="158"/><path class="l" d="M530 200 H622 M530 240 H622 M530 280 H622 M576 160 V200 M576 240 V280"/></g>';
    s += '<path class="d" d="M540 172 h22 M540 180 h14 M586 172 h24 M586 180 h16 M542 216 h66 M542 224 h40 M542 254 h20 M588 254 h22 M542 296 h64"/><path class="d" d="M622 176 C 640 190, 636 230, 622 244 M622 256 C 644 270, 640 300, 622 306"/>';
    // gravity
    s += '<path class="l" d="M812 296 V372 M804 362 L812 374 L820 362"/><text x="812" y="412" text-anchor="middle">MOON</text><text x="812" y="426" text-anchor="middle">GRAVITY</text>';
    D.questions.forEach(function (q, k) {
      var p = HAB_SPOT[q.id];
      if (!p) return;
      s += '<a href="#/habitat/' + q.id + '" class="mk ' + q.status + '" aria-label="' + esc((k + 1) + ". " + q.question) + '">' + (q.id === sel ? '<circle class="halo" cx="' + p[0] + '" cy="' + p[1] + '" r="22"/>' : "") +
        '<circle class="dot" cx="' + p[0] + '" cy="' + p[1] + '" r="15"/><text x="' + p[0] + '" y="' + (p[1] + 6) + '" text-anchor="middle">' + (k + 1) + "</text></a>";
    });
    return s + "</svg>";
  }
  function habBox(x, inner, cls) { return '<div class="hab-box ' + (cls || "") + '" style="left:' + ((x - 40) / 810 * 100).toFixed(2) + '%">' + inner + "</div>"; }
  function habReportText(picked, n, solid) {
    var A = EARTH.about, L = [];
    L.push("Evidence report for a habitat", "Flame in Freefall, Data Beyond Space, NASA Space Apps Challenge 2026", location.href, "");
    L.push("Air: " + num(ATM.o2) + " % oxygen or more, at " + num(ATM.p) + " psi or less (" + ATM.name + ")", "");
    picked.forEach(function (x) { L.push(x.sl.title + ": " + habLabel(x.r) + " (" + x.r.composition + ")", "  On Earth, at " + num(A.pressure_psi) + " psi: " + habLimit(x.r) + ". As printed: ULOI " + x.r.uloi + ", MOC " + x.r.moc + ".", "  In space: no solid-material test in NASA PSI at " + num(ATM.o2) + " % oxygen (the highest is " + num(solid.max) + " %).", "  Evidence for this air: " + HAB_WORD[x.st] + ".", ""); });
    L.push("Summary: " + n.burn + " of " + picked.length + " fail on Earth, " + n.out + " pass on Earth, " + n.untested + " not tested at this level, 0 confirmed in space.");
    L.push("Tests in NASA PSI that state both oxygen and pressure and were run in this air: " + COUNTS.inZone + " of " + COUNTS.both + ".", "");
    if (Math.abs(ATM.p - A.pressure_psi) > 0.5) L.push("Note: the Earth tests were all run at " + num(A.pressure_psi) + " psi, not at " + num(ATM.p) + " psi.", "");
    L.push("Open questions:");
    D.questions.forEach(function (q, k) { L.push("  " + (k + 1) + ". " + q.question + " [" + WORD[q.status] + "]"); });
    L.push("", "Sources:", "  Space: NASA Physical Sciences Informatics (PSI) repository, Combustion Science. " + D.about.source_url, "  Earth: " + A.source.authors + ", " + A.source.year + ", " + A.source.title + ". " + A.source.url,
      "", "The Earth tests are in normal gravity, on materials considered for an earlier NASA programme. This report shows what was tested. It does not predict how a fire behaves.");
    return L.join("\r\n");
  }
  var habReport = "";
  function viewHabitat(sel) {
    setTitle("Habitat");
    if (!EARTH || !TOPICS) {
      main.innerHTML = '<p class="loading">Loading the habitat…</p>';
      Promise.all([earthLoad(), topicsLoad().catch(function () {})]).then(function () { if (hashParts()[0] === "habitat") route(true); });
      return;
    }
    if (!habPick) habStart();
    sel = (sel || "").split("?")[0];
    var Q = D.questions, q = Q.filter(function (x) { return x.id === sel; })[0] || Q.filter(function (x) { return x.id === "materials"; })[0] || Q[0];
    var A = EARTH.about, solid = COUNTS.byCls.solid, n = { out: 0, burn: 0, untested: 0 };
    var picked = HAB_SLOT.map(function (sl, k) { var r = EARTH.rows[habPick[k]], st = earthStatus(r, ATM.o2); n[st]++; return { sl: sl, r: r, st: st }; });
    habReport = habReportText(picked, n, solid);
    var h = '<p class="kick">Habitat</p><h1 class="wide">Check your habitat</h1>';
    h += '<p class="lead wide">Set the air and what four parts are made of, in the boxes on the drawing. Each part then shows what NASA has tested for it. The numbers are six fire questions you can open.</p>';

    // the boxes: air, then one material per part
    var air = '<label>The air inside<select data-habair="1" aria-label="The air inside">' + D.about.presets.map(function (p) {
      return '<option value="' + p.id + '"' + (ATM.id === p.id ? " selected" : "") + ">" + esc(p.name) + "</option>";
    }).join("") + (ATM.id === "custom" ? '<option value="custom" selected>Your own</option>' : "") + "</select></label><p>" + num(ATM.o2) + " % oxygen or more<br>" + num(ATM.p) + " psi or less</p>";
    var boxes = habBox(45, air, "air") + picked.map(function (x, k) {
      return habBox(x.sl.x, "<label>" + x.sl.title + '<select data-habpick="' + k + '" aria-label="' + esc(x.sl.title) + '">' + habRows(x.sl.cat).map(function (o) {
        return '<option value="' + o.i + '"' + (o.i === habPick[k] ? " selected" : "") + ">" + esc(habLabel(o.r)) + "</option>";
      }).join("") + '</select></label><p class="verdict ' + x.st + '"><i></i>' + HAB_WORD[x.st] + "</p><p>" + habLimit(x.r) + "</p>", x.st);
    }).join("");
    h += '<div class="habx"><div class="habx-draw">' + boxes + habitatDrawing(q.id, picked.map(function (x) { return x.st; })) + "</div>";
    h += '<p class="hab-leg"><i class="b"></i>Fails NASA\'s flame test on Earth<i class="w"></i>Passes on Earth, not confirmed in space<i class="o"></i>Open question<i class="p"></i>Partly answered<span class="ai-mark">Schematic drawn with AI assistance; not a NASA design. The parts are examples; the materials are samples NASA tested.</span></p>';

    // the result, in one strip
    h += '<div class="counters hab-sum"><div><b>' + n.burn + "</b><span>of your " + picked.length + " materials " + (n.burn === 1 ? "fails" : "fail") + " NASA's flame test on Earth at " + num(ATM.o2) + " % oxygen." + (n.untested ? " " + n.untested + " were not tested at this level." : "") + "</span></div>";
    h += "<div><b>" + n.out + "</b><span>" + (n.out === 1 ? "passes" : "pass") + " on Earth, at " + num(A.pressure_psi) + " psi and normal gravity. Tested by NASA White Sands, not part of PSI.</span></div>";
    h += '<div class="hot"><b>0</b><span>are confirmed in space. Of ' + solid.rows + " solid-material tests in weightlessness, " + solid.atOrAbove + " reach " + num(ATM.o2) + " % oxygen. NASA's records say the Earth test <a href=\"#/questions/earth-test\">may not be on the safe side</a> in space.</span></div></div>";
    if (Math.abs(ATM.p - A.pressure_psi) > 0.5) h += '<p class="an-support warn"><b>Different pressure.</b> You chose ' + num(ATM.p) + " psi. Every Earth test here was run at " + num(A.pressure_psi) + " psi, so it does not speak for your pressure.</p>";
    h += '<p class="row hab-act"><button class="btn" data-habdl="1">Download this report</button><button class="btn ghost" data-habcopy="1">Copy a link to this habitat</button><span class="muted small" id="hab-copied" role="status"></span><span class="muted small">' +
      COUNTS.inZone + " of " + COUNTS.both + " NASA tests that state both oxygen and pressure used this air.</span></p>";

    // the six questions
    h += "<h2>Six fire questions for this habitat</h2><p class=\"sub2\">Choose a number on the drawing or in the list." + (ATM.id !== "moon" ? " The answers were written for Moon Base air." : "") + "</p>";
    h += '<div class="hab"><div class="hab-six">' + Q.map(function (x, k) {
      return '<a href="#/habitat/' + x.id + '" class="' + x.status + (x === q ? " on" : "") + '"><span class="k">' + (k + 1) + "</span><span><em>" + WORD[x.status] + "</em>" + esc(x.question) + "</span></a>";
    }).join("") + "</div>";
    h += '<div class="hab-panel ' + q.status + '"><span class="no">' + (Q.indexOf(q) + 1) + '</span><p class="st">' + WORD[q.status] + "</p><h3>" + esc(q.question) + "</h3><p>" + esc(q.answer) +
      ' <span class="ai">(AI-written, checked against NASA\'s tables)</span></p><h4>What NASA\'s data holds</h4><ul>' + q.evidence.slice(0, 3).map(function (x) { return "<li>" + esc(x.text) + "</li>"; }).join("") +
      '</ul>' + (TOPICS ? '<p class="small muted">NASA wrote about this in ' + topicLine(q.id) + ".</p>" : "") + '<p><a class="more" href="#/questions/' + q.id + '">Read the evidence</a></p></div></div>';
    h += earthAll();
    main.innerHTML = h;
  }

  // ---------------------------------------------------------------- ranking
  var rankState = { sort: "match", cls: "all", q: "", open: {} }, drawRank = null;
  var KEY = '<p class="key"><b>●</b>met <b>◐</b>half <b>○</b>not met <span style="margin-left:1rem">Blank: the table does not say.</span></p>';
  function critDetail(inv) {
    var c = RK[inv.id].criteria;
    return '<div class="crit">' + crits().map(function (d) {
      var k = c[d[0]], extra = "";
      if (d[0] === "purpose") {
        extra = k.quote ? quote(inv.id, k.field, k.quote) : '<p class="small">' + esc(k.detail) + "</p>";
        if (k.psi_sub_research_area) extra += '<p class="small muted">PSI sub-research area: ' + esc(k.psi_sub_research_area) + "</p>";
      } else extra = '<p class="small">' + esc(k.detail) + "</p>";
      return "<div><h4>" + esc(d[1]) + "</h4><strong>" + (glyph(k) ? glyph(k) + " " : "") + VALUE_WORD[k.value] + "</strong>" + extra + "</div>";
    }).join("") + "</div>";
  }
  function rankHead() {
    return '<thead><tr><th class="num"></th><th>Investigation</th>' + crits().map(function (c, k) {
      return '<th class="m" title="' + esc(c[2]) + '"><span class="full">' + esc(c[3]) + '</span><span class="short">' + (k + 1) + "</span></th>";
    }).join("") + '<th class="num">Met of 5</th></tr></thead>';
  }
  function rankRows(list) {
    var t = "";
    list.forEach(function (x) {
      var i = BY_ID[x.id], open = !!rankState.open[i.id];
      t += '<tr class="pick' + (open ? " on" : "") + '" data-open="' + i.id + '" tabindex="0" aria-expanded="' + open + '"><td class="num">' + x.rank + '</td><td class="rank-name"><b>' + esc(i.name) +
        '</b><span><i class="sw" style="background:' + COLOR[i.cls] + '"></i>' + esc(i.cls_label) + "</span></td>" +
        crits().map(function (c) { var k = x.criteria[c[0]]; return '<td class="m" title="' + esc(c[1] + ": " + VALUE_WORD[k.value]) + '">' + glyph(k) + "</td>"; }).join("") + '<td class="num">' + num(x.score) + "</td></tr>";
      if (open) t += '<tr class="detail"><td colspan="8"><p>' + esc(i.summary.did) + ' <span class="ai">(AI-written summary)</span></p>' + critDetail(i) +
        '<p style="margin-top:1rem"><a class="more" href="#/inv/' + i.id + '">Open ' + esc(i.name) + "</a></p></td></tr>";
    });
    return t;
  }

  // ------------------------------------------------------------------ views
  function viewHome() {
    setTitle("Overview");
    var S = D.summary, R = S.o2_range_by_class, zone = D.about.moon_base.o2_min_percent;
    var day = new Date(D.about.snapshot_retrieved_from).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
    var earth = D.about.presets.filter(function (p) { return p.id === "earth"; })[0], mb = D.about.moon_base;
    var h = '<section class="intro"><p class="kick">NASA Space Apps Challenge 2026, Flame in Freefall</p>';
    h += "<h1>Can NASA's fire data protect a Moon Base?</h1>";
    h += '<p class="lead">Astronauts on the Moon will live in air with more oxygen than on Earth, and fire starts more easily in it. This dashboard shows how much of NASA\'s space fire data was gathered in that air, and where it stops.</p>';
    h += '<div class="intro-steps"><div><span class="no">1</span><div><h3>The air changes</h3><p>Earth air holds <b>' + num(earth.o2) + " % oxygen</b> at " + num(earth.p) + " psi. A Moon Base is expected to hold <b>" +
      num(mb.o2_min_percent) + " % or more</b>, at " + num(mb.pressure_max_psi) + " psi or less.</p></div></div>";
    h += '<div><span class="no">2</span><div><h3>Fire gets easier</h3><p>More oxygen makes materials burn more easily. NASA\'s own records call relying on Earth fire standards <a href="#/questions/earth-test"><b>a risk</b></a>.</p></div></div>';
    h += '<div class="hot"><span class="no">3</span><div><h3>The data stops short</h3><p>Of ' + S.rows_with_both + " tests that state their air, <b>" + S.rows_in_zone + " used Moon Base air</b>. None of them burned a solid material.</p></div></div></div></section>";
    h += "<h2>Where the fire tests were run</h2>" + routeMap();
    h += '<p class="row" style="margin-top:1.6rem"><a class="btn" href="#/habitat">Check your habitat</a><a class="btn ghost" href="#/check">Check your own atmosphere</a><a class="btn ghost" href="#/questions">See the six open questions</a></p>';

    h += '<h2 id="check">How much of NASA\'s fire data fits your atmosphere</h2><p class="sub2">Pick the air you are planning for. Every count below is recounted from ' + TESTS.length + " rows of NASA's tables.</p>" + atmBar();
    h += '<div class="console">' + counters() + '<div class="console-fig"><p class="figt">Oxygen levels tested, by what burns</p><div class="chart" id="chart-bars">' + fuelBars() + "</div></div></div>";
    h += '<p class="src">Source: NASA PSI Experimental Tables. Each bar runs from the lowest to the highest oxygen level NASA tested for one kind of fuel. This shows which conditions were tested, not how fire behaves on the Moon.</p>';
    h += '<p class="row gofar"><a class="more" href="#/explore">See every test</a><a class="more" href="#/explore/pressure">Oxygen against pressure</a><a class="more" href="#/explore/find">Find a material or a test</a><a class="more" href="#/rank">Rank the ' + S.investigations + ' investigations</a><a class="more" href="#/rank/matrix">Compare all ' + S.investigations + " side by side</a></p>";

    h += '<h2>What is still open</h2><p class="sub2">Six fire-safety questions for a Moon Base. Choose one to read what NASA\'s data can say today.</p><div class="qlist two">' + D.questions.map(function (q) {
      return '<a href="#/questions/' + q.id + '"><span class="pill ' + q.status + '">' + WORD[q.status] + "</span><b>" + esc(q.question) + "</b></a>";
    }).join("") + "</div>";
    h += '<p class="by">Data Beyond Space, NASA Space Apps Challenge 2026. Data: NASA Physical Sciences Informatics repository, snapshot of ' + esc(day) + ". Photographs: NASA.</p>";
    main.innerHTML = h;
  }

  // ------------------------------------------------------------- the explorer
  var exploreTab = "oxygen", find = { q: "", cls: "all", only: false, limit: 60 }, burnerOn = false;
  function airCell(t) {
    if (t.o2 != null && t.p_psi != null) return inAir(t) ? '<b class="yes">Yes</b>' : "No";
    if (t.o2 != null && t.o2 < ATM.o2) return "No";
    if (t.p_psi != null && t.p_psi > ATM.p) return "No";
    return '<span class="muted">Cannot tell</span>';
  }
  function o2Cell(t) {
    if (t.o2 != null) return num(t.o2) + " %";
    if (t.o2_raw && t.o2_raw.trim()) return '<span class="asw">' + esc(t.o2_raw.trim()) + "</span>";
    if (t.burner_o2 != null) return '<span class="muted">fuel gas; burner flow ' + num(t.burner_o2) + " %</span>";
    return '<span class="muted">not stated</span>';
  }
  function pCell(t) {
    if (t.p_psi != null) return num(t.p_psi) + " psi";
    if (t.p_raw && t.p_raw.trim()) return '<span class="asw">' + esc(t.p_raw.trim()) + "</span>";
    return '<span class="muted">not stated</span>';
  }
  function findRows() {
    var q = find.q.trim().toLowerCase();
    return TESTS.filter(function (t) {
      if (find.cls !== "all" && t.cls !== find.cls) return false;
      if (find.only && !inAir(t)) return false;
      if (!q) return true;
      return ((t.fuel || "") + " " + BY_ID[t.inv].name + " " + t.inv + " " + (t.outcome || "")).toLowerCase().indexOf(q) >= 0;
    });
  }
  function drawFinder() {
    var box = document.getElementById("find-out");
    if (!box) return;
    var rows = findRows(), invs = {}, o2s = [], hit = 0, unknown = 0;
    rows.forEach(function (t) {
      invs[t.inv] = 1;
      if (t.o2 != null) o2s.push(t.o2);
      if (inAir(t)) hit++;
      else if (!(t.o2 != null && t.p_psi != null) && !(t.o2 != null && t.o2 < ATM.o2) && !(t.p_psi != null && t.p_psi > ATM.p)) unknown++;
    });
    var h = '<p class="find-sum"><b>' + rows.length + "</b> " + (rows.length === 1 ? "table row" : "table rows") + " in <b>" + Object.keys(invs).length + "</b> " + (Object.keys(invs).length === 1 ? "investigation" : "investigations") + ". ";
    h += o2s.length ? "Oxygen stated from <b>" + num(Math.min.apply(null, o2s)) + "</b> to <b>" + num(Math.max.apply(null, o2s)) + " %</b>. " : "None states its oxygen as a number. ";
    h += "<b>" + hit + "</b> in the chosen air" + (unknown ? ", and for " + unknown + " NASA's table does not say enough to tell" : "") + ".";
    if (rows.length) h += ' <button class="link" data-dl="find">Download these rows (CSV)</button>';
    h += "</p>";
    if (rows.length) {
      h += '<div class="tablewrap find-table"><table><thead><tr><th>Investigation</th><th>Fuel or material, as NASA wrote it</th><th>Oxygen</th><th>Pressure</th><th>In the chosen air</th><th>Outcome, as written</th><th></th></tr></thead><tbody>';
      rows.slice(0, find.limit).forEach(function (t) {
        h += '<tr><td class="rank-name">' + invLink(t.inv) + '<span><i class="sw" style="background:' + COLOR[t.cls] + '"></i>' + esc(D.about.class_labels[t.cls]) + "</span></td><td>" + (t.fuel ? '<span class="asw">' + esc(t.fuel) + "</span>" : '<span class="muted">not stated</span>') +
          "</td><td>" + o2Cell(t) + "</td><td>" + pCell(t) + "</td><td>" + airCell(t) + "</td><td>" + esc((t.outcome || "").replace(/^[^:]+:\s*/, "")) + '</td><td><button class="link" data-table="' + t.table + '" data-row="' + t.row + '">Row ' + t.row + "</button></td></tr>";
      });
      h += "</tbody></table></div>";
      if (rows.length > find.limit) h += '<p><button class="link" data-more="find">Show ' + Math.min(200, rows.length - find.limit) + " more of " + rows.length + "</button></p>";
    } else h += '<p class="muted">No table row matches. NASA writes materials in its own shorthand: try PMMA, SIBAL, Nomex, rod, heptane, ethylene.</p>';
    box.innerHTML = h;
  }
  function downloadFind() {
    var cols = ["psi_id", "investigation", "table_file", "spreadsheet_row", "what_burns", "fuel_or_material_as_written", "ambient_o2_as_written", "ambient_o2_percent", "pressure_as_written", "pressure_psi", "in_chosen_air", "outcome_as_written"];
    function q(v) { v = v == null ? "" : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
    var lines = ["# NASA PSI Combustion Science, snapshot " + D.about.snapshot_retrieved_from.slice(0, 10) + ". Chosen air: " + airWords() + ". From " + location.href.split("#")[0], cols.join(",")];
    findRows().forEach(function (t) {
      lines.push([t.inv, BY_ID[t.inv].name, BY_ID[t.inv].tables.filter(function (x) { return x.file === t.table; })[0].psi_file_name, t.row, D.about.class_labels[t.cls], t.fuel, t.o2_raw, t.o2, t.p_raw, t.p_psi,
        t.o2 != null && t.p_psi != null ? (inAir(t) ? "yes" : "no") : "cannot tell", t.outcome].map(q).join(","));
    });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv" }));
    a.download = "nasa-psi-tests" + (find.q.trim() ? "-" + find.q.trim().replace(/[^a-z0-9]+/gi, "-").toLowerCase() : "") + ".csv";
    document.body.appendChild(a); a.click(); a.remove();
  }
  function viewExplore(tab) {
    if (tab === "oxygen" || tab === "pressure" || tab === "find") exploreTab = tab;
    setTitle("Explore");
    var S = D.summary, tabs = [["oxygen", "Oxygen, by what burns"], ["pressure", "Oxygen against pressure"], ["find", "Find a material or a test"]];
    var h = '<p class="kick">Explore</p><h1>Every NASA test, against the air you choose</h1>' + atmBar() + counters();
    h += '<div class="tabs" role="tablist">' + tabs.map(function (t) {
      return '<a role="tab" href="#/explore/' + t[0] + '" class="' + (exploreTab === t[0] ? "on" : "") + '" aria-selected="' + (exploreTab === t[0]) + '">' + t[1] + "</a>";
    }).join("") + '</div><div class="tabpanel">';
    if (exploreTab === "oxygen") {
      h += '<div class="panel-head"><p class="figt">Every test that states its oxygen level. ' + COUNTS.o2AtOrAbove + " of " + COUNTS.plainO2 + " are at " + num(ATM.o2) + ' % oxygen or more.</p><label class="check"><input type="checkbox" id="burner"' + (burnerOn ? " checked" : "") + "> Show oxygen blown from a burner (not cabin air)</label></div>";
      h += '<div class="chart" id="chart-lanes">' + laneChart({ burner: burnerOn }) + "</div>" + legend(burnerOn ? ["solid", "emulated", "droplet", "gas", "burner"] : ["solid", "emulated", "droplet", "gas"]);
      h += '<details class="howto"><summary>Why the 85 % oxygen in the challenge statement is not counted</summary><p>In those tests (inverse flames in ' + invLink("PSI-159") + " and " + invLink("PSI-10") +
        ") the oxygen is blown out of the burner into a chamber filled with fuel gas. It is a flow, not the air a crew would breathe, so it is never mixed with ambient oxygen. Tick the box above to see it in its own lane.</p></details>";
      var miss = D.investigations.filter(function (i) { var o = i.criteria.oxygen.value; return o !== "yes" && o !== "no"; });
      h += '<details class="howto"><summary>' + miss.length + " investigations are not on this chart, because their table gives oxygen as text or not at all</summary><div class=\"tablewrap\"><table><thead><tr><th>Investigation</th><th>Oxygen in the table</th><th>Pressure in the table</th></tr></thead><tbody>" +
        miss.map(function (i) { return '<tr><td class="rank-name">' + invLink(i.id) + '<span><i class="sw" style="background:' + COLOR[i.cls] + '"></i>' + esc(i.cls_label) + "</span></td><td>" + esc(i.criteria.oxygen.detail) + "</td><td>" + esc(i.criteria.pressure.detail) + "</td></tr>"; }).join("") + "</tbody></table></div></details>";
    } else if (exploreTab === "pressure") {
      h += '<div class="panel-head"><p class="figt">Tests that state both oxygen and pressure. ' + COUNTS.inZone + " of " + COUNTS.both + " are inside the red frame.</p></div>";
      h += '<div class="chart" id="chart-scatter">' + scatterChart() + "</div>" + legend(["droplet", "gas"]);
      h += '<p class="src">Only ' + S.state_pressure + " of " + S.investigations + " investigations state pressure in their table, and none of them burns a solid material. Pressure is converted to psi.</p>";
    } else {
      h += '<div class="panel-head find-controls"><input type="search" id="fq" placeholder="A material, fuel or investigation: PMMA, Nomex, heptane, BASS" aria-label="Search tests" value="' + esc(find.q) + '">';
      h += '<select id="fcls" aria-label="What burns"><option value="all">Everything that burns</option>' + ["solid", "smoke", "emulated", "droplet", "gas"].map(function (c) { return '<option value="' + c + '"' + (find.cls === c ? " selected" : "") + ">" + esc(D.about.class_labels[c]) + "</option>"; }).join("") + "</select>";
      h += '<label class="check"><input type="checkbox" id="fonly"' + (find.only ? " checked" : "") + "> Only tests in the chosen air</label></div>";
      h += '<div id="find-out"></div>';
    }
    h += '</div><p class="src">Source: NASA PSI Experimental Tables, ' + TESTS.length + " table rows from " + Object.keys(TESTS.reduce(function (a, t) { a[t.inv] = 1; return a; }, {})).length + " investigations. Oxygen is the air around the flame; cells NASA did not write as plain numbers are shown as written and not counted.</p>";
    main.innerHTML = h;
    bindPoints(document.getElementById("chart-lanes"));
    bindPoints(document.getElementById("chart-scatter"));
    var b = document.getElementById("burner");
    if (b) b.addEventListener("change", function (e) { burnerOn = e.target.checked; rerender(); });
    if (exploreTab === "find") {
      drawFinder();
      document.getElementById("fq").addEventListener("input", function (e) { find.q = e.target.value; find.limit = 60; drawFinder(); });
      document.getElementById("fcls").addEventListener("change", function (e) { find.cls = e.target.value; find.limit = 60; drawFinder(); });
      document.getElementById("fonly").addEventListener("change", function (e) { find.only = e.target.checked; find.limit = 60; drawFinder(); });
    }
  }

  var rankTab = "rank", matOpen = {};
  function rankTabs() {
    return '<div class="tabs" role="tablist">' + [["rank", "#/rank", "Ranked for your atmosphere"], ["matrix", "#/rank/matrix", "All " + D.summary.investigations + " side by side"]].map(function (t) {
      return '<a role="tab" href="' + t[1] + '" class="' + (rankTab === t[0] ? "on" : "") + '" aria-selected="' + (rankTab === t[0]) + '">' + t[2] + "</a>";
    }).join("") + "</div>";
  }
  function evidence(invId, item) {
    if (!item) return '<span class="muted">The record does not say.</span>';
    return esc(item.text || "") + (item.column ? ' <span class="small muted">Table column <span class="asw">' + esc(item.column.trim()) + "</span></span>" : quote(invId, item.field, item.quote));
  }
  function attrDetail(i) {
    var a = i.attributes, M = D.about.measures;
    var h = '<div class="crit"><div><h4>Sample or burner</h4>' + evidence(i.id, a.sample) + "</div><div><h4>What was changed between tests</h4>" + evidence(i.id, a.varied) +
      "</div><div><h4>Airflow</h4>" + evidence(i.id, a.flow) + "</div><div><h4>Use on Earth, as the record states it</h4>" + evidence(i.id, a.earth) + "</div></div>";
    h += '<h4 class="mh">What was measured</h4><div class="crit">' + M.filter(function (m) { return a.measured[m[0]]; }).map(function (m) {
      var it = a.measured[m[0]];
      return "<div><h4>" + esc(m[1]) + "</h4>" + (it.column ? '<span class="small muted">Table column <span class="asw">' + esc(it.column.trim()) + "</span></span>" : quote(i.id, it.field, it.quote)) + "</div>";
    }).join("") + "</div>";
    return h;
  }
  function viewMatrix() {
    setTitle("Side by side");
    var M = D.about.measures, list = D.investigations.slice().sort(function (a, b) {
      return ["solid", "smoke", "emulated", "droplet", "gas", "aerosol"].indexOf(a.cls) - ["solid", "smoke", "emulated", "droplet", "gas", "aerosol"].indexOf(b.cls) || (+a.id.slice(4)) - (+b.id.slice(4));
    });
    var h = '<p class="kick">Ranking</p><h1>All ' + list.length + " investigations side by side</h1>";
    h += '<p class="lead">What each one burned, what it measured and what it is for on Earth. Click a row for NASA\'s own words.</p>' + rankTabs() + '<div class="tabpanel">';
    h += '<p class="note" style="margin-top:0">Read by AI (Claude, Anthropic) from NASA\'s records, then checked by program: every mark rests on a sentence found word for word in the record, or on a column of NASA\'s table. <a href="data/attributes.csv" download>Download as CSV</a></p>';
    h += '<div class="tablewrap"><table class="grid matrix"><thead><tr><th>Investigation</th><th>Sample or burner</th>' + M.map(function (m) { return '<th class="m" title="' + esc(m[2]) + '"><span>' + esc(m[1]) + "</span></th>"; }).join("") + "<th>Use on Earth</th></tr></thead><tbody>";
    list.forEach(function (i) {
      var a = i.attributes, open = !!matOpen[i.id];
      h += '<tr class="pick' + (open ? " on" : "") + '" data-mat="' + i.id + '" tabindex="0" aria-expanded="' + open + '"><td class="rank-name"><b>' + esc(i.name) + '</b><span><i class="sw" style="background:' + COLOR[i.cls] + '"></i>' + esc(i.cls_label) + "</span></td><td>" + esc(a.sample.text) + "</td>" +
        M.map(function (m) { return '<td class="m" title="' + esc(m[1]) + '">' + (a.measured[m[0]] ? "●" : "") + "</td>"; }).join("") + "<td>" + (a.earth ? esc(a.earth.text) : '<span class="muted">not stated</span>') + "</td></tr>";
      if (open) h += '<tr class="detail"><td colspan="' + (M.length + 3) + '">' + attrDetail(i) + '<p style="margin-top:1rem"><a class="more" href="#/inv/' + i.id + '">Open ' + esc(i.name) + "</a></p></td></tr>";
    });
    h += '<tr class="tot"><td colspan="2">Investigations that say they measured it</td>' + M.map(function (m) {
      return '<td class="m">' + list.filter(function (i) { return i.attributes.measured[m[0]]; }).length + "</td>";
    }).join("") + "<td></td></tr></tbody></table></div></div>";
    h += '<p class="src">Source: the objective, approach, hypothesis and research impacts of each NASA PSI record, and the column names of its Experimental Table. A blank means the record does not mention it, not that it was not measured.</p>';
    main.innerHTML = h;
  }

  function viewRank(tab) {
    rankTab = tab === "matrix" ? "matrix" : "rank";
    if (rankTab === "matrix") return viewMatrix();
    setTitle("Ranking");
    var S = D.summary;
    var h = '<p class="kick">Ranking</p><h1>Which investigations come closest</h1>';
    h += '<p class="lead">Five conditions, checked against all ' + S.investigations + " investigations for the air you choose. Click a row for the evidence.</p>" + rankTabs() + atmBar() + KEY;
    h += '<details class="howto"><summary>The five conditions, and how the order is made</summary><ol>' + crits().map(function (c) { return "<li><strong>" + esc(c[1]) + ".</strong> " + esc(c[2]) + "</li>"; }).join("") +
      "</ol><p>One point for each condition met. Half a point where fire safety is named only as a benefit, or where a burner or a computer model stands in for solid materials. Ties are ordered by fire-safety purpose, then solid materials. The conditions are this team's reading; the numbers are NASA's.</p></details>";
    h += '<div class="filters"><input type="search" id="q" placeholder="Search name, fuel, material" aria-label="Search investigations" value="' + esc(rankState.q) + '">';
    h += '<span class="seg" role="group" aria-label="Order">' + [["match", "Closest to this air"], ["purpose", "Fire-safety purpose first"]].map(function (o) {
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
      var list = RANKED.filter(function (x) {
        var i = BY_ID[x.id];
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
      document.getElementById("rank-table").innerHTML = '<div class="tablewrap"><table class="grid">' + rankHead() + "<tbody>" + rankRows(list) +
        (list.length ? "" : '<tr><td colspan="8" class="muted">Nothing matches.</td></tr>') + "</tbody></table></div>";
    }
    drawRank = draw;
    draw();
    document.getElementById("q").addEventListener("input", function (e) { rankState.q = e.target.value; draw(); });
  }


  // ------------------------------------------------------------ ask the records
  // A question is matched to passages of NASA's text. With the language model loaded, the match is by
  // meaning (vectors); without it, by shared words. Either way the page only quotes; it writes nothing.
  var ASK = { P: null, vec: null, dims: 0, ix: null, model: "off", embed: null, q: "", seq: 0 };
  // One example per thing Ask can do (each checked against ask.js and the built index, 15 Nov):
  // Moon card + counted answer, counts with numbers, droplets (near misses), NASA's material test,
  // the word list (smoke alarm, cable / put out), and plain matching by meaning.
  var ASK_EXAMPLES = ["Will cabin materials burn in Moon Base air?", "How many tests were run at 30 % oxygen and 10.2 psi or less?", "Which tests burned droplets at 30 % oxygen or more?", "Is the Earth test for materials safe enough for space?", "Would a smoke alarm notice an overheating cable?", "Which experiments used helium or carbon dioxide to put out a flame?", "Why does a flame in space look like a ball?"];
  var words = Ask.words;   // the matching itself is in ask.js, shared with the scripts that test and score it
  function askLoad() {
    if (ASK.P) return Promise.resolve();
    return fetch("data/passages.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (P) {
      var bin = atob(P.vectors_int8_base64), n = bin.length, v = new Int8Array(n);
      for (var i = 0; i < n; i++) v[i] = bin.charCodeAt(i) << 24 >> 24;
      ASK.P = P; ASK.vec = v; ASK.dims = P.about.dims;
      ASK.ix = Ask.index(P.passages);
    });
  }
  function probe(m) { if (location.search.indexOf("probe") >= 0) fetch("/__probe?" + encodeURIComponent(m)).catch(function () {}); }
  function askSmart(byUser) {
    probe("askSmart called, model=" + ASK.model + " width=" + window.innerWidth);
    if (ASK.model === "ready" || ASK.model === "loading") return;
    ASK.model = "loading"; drawAskMode();
    import("./vendor/transformers.min.js").then(function (T) {
      T.env.allowRemoteModels = false; T.env.allowLocalModels = true;
      T.env.localModelPath = "./models/";
      T.env.backends.onnx.wasm.wasmPaths = new URL("./vendor/", location.href).href;
      T.env.backends.onnx.wasm.numThreads = 1;
      return T.pipeline("feature-extraction", Ask.SETTINGS.model, { dtype: "q8", device: "wasm" });
    }).then(function (ex) {
      ASK.embed = ex; ASK.model = "ready";
      try { localStorage.setItem("ask-smart", "1"); } catch (e) {}
      drawAskMode(); if (ASK.q) runAsk();
    }).catch(function (e) { ASK.model = "failed"; console.error(e); probe("model failed: " + e); drawAskMode(); });
  }
  function drawAskMode() {
    var el = document.getElementById("ask-mode");
    if (!el) return;
    el.className = "askmode " + ASK.model;
    var mb = ASK.P && ASK.P.about.download_mb ? "about " + ASK.P.about.download_mb + " MB" : "";   // counted by the build from the files served
    el.innerHTML = ASK.model === "ready" ? "<b>Matching by meaning</b><span>a small language model in your browser · it matches, it writes nothing · your question stays on your computer</span>" :
      ASK.model === "loading" ? "<b>Loading the language model</b><span>" + (mb ? mb + ", once · " : "") + "matching by words until it is ready</span>" :
      ASK.model === "failed" ? "<b>Matching by words</b><span>the language model could not start in this browser</span>" :
      '<b>Matching by words</b><button class="link" data-smart="1">Match by meaning instead</button><span>loads a small language model' + (mb ? ", " + mb + "," : "") + " once</span>";
  }
  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }
  // Everyday words in the question -> the terms NASA's text uses (a fixed list, checked by the build).
  function askExpand(q) { return Ask.SETTINGS.glossary === "off" ? [] : Ask.expand(q, ASK.P.glossary ? ASK.P.glossary.entries : []); }
  function askRank(q, qvec) { return Ask.rank(ASK.ix, ASK.P.passages, ASK.vec, ASK.dims, q, qvec, { extra: Ask.expansionText(askExpand(q)) }); }
  // A question that names the Moon, Mars or partial gravity: PSI has no such data, and the page says so.
  function askMoonCard(q) {
    var term = Ask.moon(q);
    if (!term) return "";
    var S = D.summary, n = S.records_mentioning_moon_or_partial_gravity, g = D.questions.filter(function (x) { return x.id === "gravity"; })[0];
    var h = '<section class="askcard gap"><p class="kick">Outside NASA\'s data · you mentioned “' + esc(term) + "”</p><h3>" + (n === 0 ? "PSI holds no test at Moon or Mars gravity" : plural(n, "PSI record mentions", "PSI records mention") + " the Moon, Mars or partial gravity") + "</h3>";
    h += "<p><b>" + n + " of " + S.investigations + "</b> records mention the Moon, Mars or partial gravity. Every test ran in weightlessness or on Earth, so the passages below are not Moon results.</p>";
    if (g) h += '<p class="small"><a href="#/questions/gravity">Open question: ' + esc(g.question) + "</a>" + (g.elsewhere && g.elsewhere.length ? ' <span class="muted">· ' + plural(g.elsewhere.length, "NASA document", "NASA documents") + " outside PSI</span>" : "") + "</p>";
    return h + "</section>";
  }
  // A question about conditions or counts: the numbers, counted from NASA's tables for the tests it names.
  function askNumberCard(q) {
    if (!ASK.vocab) ASK.vocab = Ask.fuelVocabulary(TESTS);
    var it = Ask.intent(q, D.investigations, ASK.vocab, Ask.expansionText(askExpand(q)));
    if (!it) return "";
    var o2 = it.o2 != null ? it.o2 : ATM.o2, p = it.p != null ? it.p : ATM.p, a = Ask.answer(Ask.scopeTests(TESTS, it), o2, p, Recount);
    var scope = [];
    if (it.fuels.length) scope.push("with " + it.fuels.map(function (f) { return '<span class="asw">' + esc(f) + "</span>"; }).join(" or ") + " in the fuel or material cell");
    if (it.cls) scope.push("of the kind “" + esc(D.about.class_labels[it.cls]) + "”");
    if (it.invs.length) scope.push("in " + it.invs.map(function (id) { return invLink(id); }).join(", "));
    var h = '<section class="askcard count"><p class="kick">Counted from NASA\'s tables</p><h3>' + (scope.length ? plural(a.tests, "test", "tests") + " " + scope.join(", ") : "All " + a.tests + " tests in NASA's tables") + "</h3>";
    if (!a.tests) return h + "<p>No row of NASA's Experimental Tables matches, so there is nothing to count.</p></section>";
    if (!it.invs.length || it.invs.length > 1) h += '<p class="invs">' + a.invs.slice(0, 6).map(function (x) { return invLink(x.id) + ' <span class="muted">' + x.tests + "</span>"; }).join(" · ") + (a.invs.length > 6 ? ' <span class="muted">· and ' + (a.invs.length - 6) + " more</span>" : "") + "</p>";
    // one tile per condition: the count, what it counts, and out of how many tests that state it
    function tile(label, val, of, rest, none) {
      if (!of) return '<div class="na"><b>–</b><span>' + label + '</span><small>' + none + "</small></div>";
      return '<div class="' + (val === 0 ? "zero" : "") + '"><b>' + val + "</b><span>" + label + "</span><small>of " + plural(of, "test", "tests") + " that state it" + (rest ? " · " + rest : "") + "</small></div>";
    }
    h += '<div class="stats">' +
      tile("at " + num(o2) + " % oxygen or more", a.oxygen.atOrAbove, a.oxygen.stated, a.oxygen.stated ? "tested " + num(a.oxygen.min) + " to " + num(a.oxygen.max) + " %" : "", "no test states oxygen as a number") +
      tile("at " + num(p) + " psi or less", a.pressure.atOrBelow, a.pressure.stated, a.pressure.stated ? "tested " + num(a.pressure.min) + " to " + num(a.pressure.max) + " psi" : "", "no test states pressure as a number") +
      tile("inside both limits", a.both.inAir, a.both.stated, a.both.invs.length ? "in " + a.both.invs.map(function (id) { return invLink(id); }).join(", ") : "", "no test states both, so none can be placed") +
      "</div>";
    var from = it.o2 != null && it.p != null ? "both limits from your question" : it.o2 != null ? "oxygen limit from your question, pressure from " + esc(ATM.name) : it.p != null ? "pressure limit from your question, oxygen from " + esc(ATM.name) : "limits of " + esc(ATM.name);
    var fq = it.fuels.length === 1 && !it.invs.length ? it.fuels[0] : it.invs.length === 1 && !it.fuels.length ? BY_ID[it.invs[0]].name : "";
    h += '<p class="small muted">Counted by this page from NASA\'s Experimental Tables · ' + from + " · cells written as text are not counted" + (fq ? ' · <button class="link" data-findq="' + esc(fq) + '">See these rows</button>' : "") + "</p>";
    return h + "</section>";
  }
  // How many of the investigations behind the passages have a test in the chosen atmosphere.
  function askReach(top) {
    var r = Ask.reach(top, ASK.P.passages, RK), n = r.invs.length;
    if (!n) return "";
    var h = '<section class="reach' + (r.yes ? "" : " none") + '"><div class="reach-head"><span class="big">' + r.yes + "<small>/" + n + "</small></span><p><b>investigations behind these passages have a test in " + esc(ATM.name) + "</b>" +
      '<span>' + airWords() + (r.rowsOf ? " · " + r.rowsIn + " of the " + plural(r.rowsOf, "test", "tests") + " that state both" : "") +
      (r.unknown ? " · " + r.unknown + " cannot be placed: " + (r.unknown === 1 ? "its table does" : "their tables do") + " not state both oxygen and pressure as numbers" : "") + "</span></p></div>";
    h += "<details><summary>Per investigation</summary><ul>";
    r.invs.forEach(function (x) {
      var judged = x.value === "yes" || x.value === "no", t;
      if (judged) t = x.rows + " of " + plural(x.of, "test", "tests") + " in this air";
      else if (x.value === "no table") t = "no table in PSI";
      else t = (x.oxygen.max != null ? "oxygen up to " + num(x.oxygen.max) + " %" : "oxygen: " + VALUE_WORD[x.oxygen.value].toLowerCase()) + "; " + (x.pressure.min != null ? "pressure down to " + num(x.pressure.min) + " psi" : "pressure: " + VALUE_WORD[x.pressure.value].toLowerCase());
      h += '<li class="' + (x.value === "yes" ? "in" : judged ? "out" : "unk") + '"><i></i>' + invLink(x.id) + "<span>" + t + "</span></li>";
    });
    return h + "</ul></details></section>";
  }
  function mark(text, q) {
    var qs = {}; words(q).forEach(function (w) { qs[w] = 1; });
    return esc(text).replace(/[A-Za-z0-9]+/g, function (w) { var t = words(w)[0]; return t && qs[t] ? "<mark>" + w + "</mark>" : w; });
  }
  function runAsk() {
    var box = document.getElementById("ask-out"), q = ASK.q.trim();
    if (!box) return;
    if (!q) { box.innerHTML = ""; return; }
    var seq = ++ASK.seq;
    function show(qvec) {
      if (seq !== ASK.seq) return;
      var top = askRank(q, qvec), P = ASK.P.passages;
      probe("show " + (qvec ? "meaning" : "words") + " top=" + top.length);
      var cards = askMoonCard(q) + askNumberCard(q), ex = askExpand(q);
      var also = ex.length ? '<p class="also"><span class="lab">Also searched</span>' + ex.map(function (e) { return e.nasa.map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") + '<span class="for">for “' + esc(e.said) + "”</span>"; }).join("") + '<span class="note" title="A fixed word list drafted with AI; the build checks that each term is in NASA\'s text or tables.">fixed word list, AI-drafted, checked against NASA\'s text</span></p>' : "";
      if (!top.length) { box.innerHTML = cards + also + '<p class="muted">Nothing in NASA\'s records or the listed papers matches that closely. Try other words, or a simpler question.</p>'; return; }
      var h = cards + askReach(top) + '<p class="find-sum"><b>' + top.length + "</b> closest passages of " + P.length + ", " + (qvec ? "matched by meaning" : "matched by words") + "</p>" + also;
      var qm = q + " " + Ask.expansionText(ex);
      top.forEach(function (x) {
        var p = P[x.i];
        if (p.kind === "record") {
          var inv = BY_ID[p.inv];
          h += '<article class="hit"><div class="ev-head">' + invLink(p.inv) + chip(inv.cls) + '<span class="small muted">NASA PSI record ' + esc(p.inv) + ", " + FIELD[p.field] + '. <a class="ctx" href="#/inv/' + esc(p.inv) + "/" + p.field + "/" + x.i + '">Read it in context</a></span></div><blockquote>“' + mark(p.text, qm) + "”</blockquote></article>";
        } else {
          h += '<article class="hit"><div class="ev-head"><span class="papert">' + esc(p.title) + '</span></div><p class="small muted">Paper' + (p.year ? ", " + p.year : "") + (p.venue ? ", " + esc(p.venue) : "") + ". Listed by PSI under " +
            p.psi.map(function (id) { return invLink(id); }).join(", ") + '. <a href="https://doi.org/' + esc(p.doi) + '" target="_blank" rel="noopener">Read it</a></p>' +
            (p.part === "abstract" ? "<blockquote>“" + mark(p.text, qm) + "”<cite>From the paper's abstract</cite></blockquote>" : '<p class="small muted">Matched on its title. PSI lists no abstract for it.</p>') + "</article>";
        }
      });
      box.innerHTML = h;
      if (location.search.indexOf("probe") >= 0) fetch("/__probe?" + encodeURIComponent((qvec ? "meaning" : "words") + " | " + q + " | " + top.slice(0, 3).map(function (x) { var p = P[x.i]; return (p.inv || p.doi) + ":" + x.score.toFixed(2); }).join(" "))).catch(function () {});
    }
    show(null);
    var embed = ASK.embed;   // called on its own: the pipeline must not see ASK as "this"
    if (ASK.model === "ready") embed([Ask.MODELS[Ask.SETTINGS.model].queryPrefix + q], { pooling: Ask.MODELS[Ask.SETTINGS.model].pooling, normalize: true }).then(function (o) { show(o.tolist()[0]); }).catch(function (e) { console.error(e); probe("embed failed: " + e + " " + (e && e.stack || "").slice(0, 300)); });
  }
  function viewAsk(q) {
    setTitle("Ask");
    if (q) { try { ASK.q = decodeURIComponent(q); } catch (e) { ASK.q = q; } }
    var h = '<p class="kick">Ask</p><h1>Ask NASA\'s records</h1>';
    h += '<p class="lead">Type a question in your own words. You get the sentences from NASA\'s records, and from the papers NASA lists, that answer it best. Every line is a quotation with its source.</p>';
    h += '<form class="askbox" id="ask-form"><input type="search" id="ask-q" placeholder="For example: does smoke behave differently without gravity?" aria-label="Your question" value="' + esc(ASK.q) + '"><button class="btn" type="submit">Search</button></form>';
    h += '<p class="examples">Try: ' + ASK_EXAMPLES.map(function (x) { return '<button class="link" data-ask="' + esc(x) + '">' + esc(x) + "</button>"; }).join("") + "</p>";
    h += '<p id="ask-mode" class="askmode"></p><div id="ask-out"><p class="muted">Loading NASA\'s text…</p></div>';
    h += '<p class="src">Searched: the objective, approach, hypothesis and research impacts of the ' + D.summary.investigations + " NASA PSI records, and the titles and abstracts of the publications PSI lists for them (abstracts from OpenAlex, " + D.summary.dois_with_abstract + " of " + D.summary.unique_dois + " papers have one). Results are quotations, not answers written by AI.</p>";
    main.innerHTML = h;
    drawAskMode();
    document.getElementById("ask-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var v = document.getElementById("ask-q").value.trim();
      if (v) location.hash = "#/ask/" + encodeURIComponent(v);
    });
    askLoad().then(function () {
      var box = document.getElementById("ask-out");
      if (box) box.innerHTML = "";
      drawAskMode();
      runAsk();
      var saved = false;
      try { saved = localStorage.getItem("ask-smart") === "1"; } catch (e) {}
      // on a computer the model loads by itself; on a phone the reader chooses, because of the download
      if (ASK.model === "off" && (saved || !narrow())) askSmart(false);
    }).catch(function () { var box = document.getElementById("ask-out"); if (box) box.innerHTML = '<p class="muted">The search index could not be loaded.</p>'; });
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
    if (a.numbers) parts.push(num(a.min) + " to " + num(a.max) + " % in " + a.numbers + " rows" + (a.times_100 ? " (mole fraction × 100)" : ""));
    if (a.list_cells.length) parts.push("listed values: " + cells(a.list_cells));
    if (a.other_cells.length) parts.push("as written: " + cells(a.other_cells));
    if (a.blank) parts.push(a.blank + " blank");
    return parts.join("; ");
  }
  function pText(t) {
    var p = t.pressure;
    if (!p) return null;
    var parts = [];
    if (p.min != null) parts.push(num(p.min) + " to " + num(p.max) + " psi (converted from " + esc(p.unit_as_stated) + ": " + num(p.min_as_stated) + " to " + num(p.max_as_stated) + ")");
    if (p.zero_cells) parts.push(p.zero_cells + " cell says 0, kept as written and not counted");
    if (p.other_cells.length) parts.push("as written: " + cells(p.other_cells));
    return parts.join("; ");
  }
  function tableBlock(inv, t) {
    var h = '<div class="tblock"><div class="row" style="justify-content:space-between"><h3 style="margin:0">' + esc(t.psi_file_name.replace(/^PSI-\d+_Experimental table_/, "").replace(/\.csv$/, "")) +
      '</h3><button class="btn sm" data-table="' + t.file + '">Open NASA\'s table</button></div><dl class="facts" style="margin-top:.7rem">';
    h += "<dt>Rows</dt><dd>" + t.entries + ", one per " + esc(t.row_meaning) + (t.other_rows ? " (plus " + t.other_rows + " note or continuation rows)" : "") + "</dd>";
    if (t.fuel) h += "<dt>" + esc(t.fuel.column.trim()) + "</dt><dd>" + t.fuel.distinct + " distinct, as written: " + cells(t.fuel.values, 10) + "</dd>";
    h += "<dt>Ambient oxygen</dt><dd>" + (o2Text(t) || '<span class="muted">not in this table</span>') + "</dd>";
    if (t.burner_o2) h += "<dt>Burner-flow oxygen</dt><dd>" + num(t.burner_o2.min) + " to " + num(t.burner_o2.max) + " % in " + t.burner_o2.numbers + " rows" +
      (t.burner_o2.other_cells.length ? "; as written: " + cells(t.burner_o2.other_cells) : "") + '. <span class="muted">Blown from the burner into fuel gas; not an atmosphere.</span></dd>';
    h += "<dt>Pressure</dt><dd>" + (pText(t) || '<span class="muted">not in this table</span>') + "</dd>";
    if (t.airflow) {
      var a = t.airflow;
      h += '<dt>Airflow</dt><dd>column <span class="asw">' + esc(a.column.trim()) + "</span>" + (a.numbers ? ": " + num(a.min) + " to " + num(a.max) + " (" + esc(a.unit) + ") in " + a.numbers + " rows" : "") +
        (a.other_cells.length ? "; as written: " + cells(a.other_cells, 6) : "") + "</dd>";
    }
    h += "<dt>What varies</dt><dd>" + (t.varies.length ? t.varies.length + " of " + t.header.length + ' columns change from row to row: <span class="cols">' +
      t.varies.map(function (c) { return '<span class="asw">' + esc(c.trim()) + "</span>"; }).join("") + "</span>" : "nothing") + "</dd>";
    return h + "</dl></div>";
  }
  // a small range bar for one investigation: its tested min..max against a threshold
  function rangeBar(lo, hi, d0, d1, thr, better, unit) {
    var W = 300, H = 46, L = 6, R = 6, x = scaleLin(d0, d1, L, W - R), cl = function (v) { return Math.max(d0, Math.min(d1, v)); };
    var zx0 = better === "above" ? x(cl(thr)) : L, zx1 = better === "above" ? W - R : x(cl(thr));
    var s = '<svg class="mini" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Tested ' + num(lo) + " to " + num(hi) + " " + unit + '">';
    s += '<rect class="zone" x="' + zx0 + '" y="4" width="' + Math.max(0, zx1 - zx0) + '" height="22"/><rect class="bar-track" x="' + L + '" y="10" width="' + (W - L - R) + '" height="10"/>';
    s += '<rect x="' + x(cl(lo)) + '" y="10" width="' + Math.max(5, x(cl(hi)) - x(cl(lo))) + '" height="10" fill="#fff"/><line class="zone-edge" x1="' + x(cl(thr)) + '" x2="' + x(cl(thr)) + '" y1="2" y2="28"/>';
    s += '<text x="' + L + '" y="42">' + d0 + '</text><text x="' + Math.min(W - 40, Math.max(30, x(cl(thr)))) + '" y="42" text-anchor="middle" class="zone-label">' + num(thr) + '</text><text x="' + (W - R) + '" y="42" text-anchor="end">' + d1 + " " + unit + "</text>";
    return s + "</svg>";
  }

  // NASA's text for one field, with the passage the reader came from marked. The search index cut the
  // text with its spaces collapsed, so the passage is found word by word, allowing any spacing.
  function markPassage(text, id, k, pi) {
    var p = ASK.P && ASK.P.passages[+pi];
    if (!p || p.kind !== "record" || p.inv !== id || p.field !== k) return esc(text);
    var parts = p.text.trim().split(/\s+/).map(function (w) { return w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); });
    var m = new RegExp(parts.join("\\s+")).exec(text);
    if (!m) return esc(text);
    return esc(text.slice(0, m.index)) + '<mark class="hl">' + esc(m[0]) + "</mark>" + esc(text.slice(m.index + m[0].length));
  }
  // `field` and `pi` come from a "Read it in context" link on the Ask page: the page opens NASA's
  // description at that field and marks the quoted passage (pi = its index in passages.json).
  var invFocusDone = "";
  function viewInv(id, field, pi) {
    var inv = BY_ID[id];
    if (field && !FIELD[field]) field = null;
    if (!inv) return viewHome();
    setTitle(inv.name);
    var x = RK[id], co = x.criteria.oxygen, cp = x.criteria.pressure;
    var h = '<p class="small"><a href="#/rank">← Ranking</a></p><div class="inv-head"><div><p class="kick">' + esc(inv.id) + ", rank " + x.rank + " of " + D.summary.investigations + " for " + esc(ATM.name) + "</p><h1>" + esc(inv.name) + "</h1>";
    h += '<p class="lead">' + esc(inv.title) + (inv.name_is_ours ? ' <span class="small muted">(PSI gives no acronym; the short name is ours)</span>' : "") + "</p>";
    h += '<div class="row">' + chip(inv.cls) + '<span class="chip">' + esc(inv.project_type) + '</span><span class="chip">' + esc(inv.gravity) + "</span>" + (inv.flight_program ? '<span class="chip">' + esc(inv.flight_program) + "</span>" : "") + "</div></div>";
    h += '<div><div class="score big">' + num(x.score) + " <small>of 5 conditions</small></div>" + dots(inv) + "</div></div>";
    h += '<div class="row" style="margin:1.1rem 0"><a class="btn" href="' + inv.psi_url + '" target="_blank" rel="noopener">Open on NASA PSI</a>' +
      (inv.doi ? '<a class="btn ghost" href="https://doi.org/' + esc(inv.doi) + '" target="_blank" rel="noopener">DOI ' + esc(inv.doi) + "</a>" : "") +
      (inv.tables.length ? '<a class="btn ghost" href="#/explore/find" data-findinv="' + esc(inv.name) + '">See its ' + inv.tables.reduce(function (a, t) { return a + t.entries; }, 0) + " table rows</a>" : "") +
      '<label class="small muted">Compare with <select id="cmp"><option value="">choose…</option>' + D.investigations.filter(function (i) { return i.id !== id; }).map(function (i) {
        return '<option value="' + i.id + '">' + esc(i.name) + "</option>";
      }).join("") + "</select></label></div>";

    h += '<p class="relm" id="relm" data-for="' + esc(id) + '"></p>';
    h += '<div class="grid2"><div class="panel"><h2>In plain words</h2><p class="ai" style="margin:-.3rem 0 .8rem">AI-written from the PSI record</p><p>' + esc(inv.summary.did) + '</p><ul class="clean">';
    inv.summary.points.forEach(function (p) { h += '<li><span class="kind ' + p.kind + '">' + KIND[p.kind] + "</span>" + esc(p.text) + quote(inv.id, p.field, p.quote) + "</li>"; });
    h += '</ul><p class="small muted">Aim: what it set out to do. Expected: what its authors expected beforehand. Result: a finding the record states. The quotations are NASA\'s words, checked by program against the record.</p></div>';
    h += '<div class="panel"><h2>Against ' + esc(ATM.name) + '</h2><p class="small muted" style="margin:-.3rem 0 .8rem">' + airWords() + "</p>";
    h += '<div class="minis"><div><b>Oxygen</b>' + (co.min != null ? rangeBar(co.min, co.max, 10, 45, ATM.o2, "above", "%") + '<span class="small muted">tested ' + num(co.min) + " to " + num(co.max) + " %</span>" : '<span class="small muted">' + esc(VALUE_WORD[co.value]) + "</span>") + "</div>";
    h += "<div><b>Pressure</b>" + (cp.min != null ? rangeBar(cp.min, cp.max, 0, 50, ATM.p, "below", "psi") + '<span class="small muted">tested ' + num(cp.min) + " to " + num(cp.max) + " psi</span>" : '<span class="small muted">' + esc(VALUE_WORD[cp.value]) + "</span>") + "</div></div>";
    h += critDetail(inv) + "</div></div>";

    h += '<details class="sect"><summary>Sample, measurements and use on Earth</summary><p class="ai">Read by AI from the PSI record, checked by program against NASA\'s words</p>' + attrDetail(inv) + "</details>";
    h += '<details class="sect"><summary>What NASA\'s table records</summary>';
    if (!inv.tables.length) h += '<p class="muted">PSI holds no Experimental Table for this investigation. Its results are in its publications and documents.</p>';
    inv.tables.forEach(function (t) { h += tableBlock(inv, t); });
    h += '</details><details class="sect" id="verbatim"' + (field ? " open" : "") + '><summary>NASA\'s description, word for word</summary>';
    Object.keys(FIELD).forEach(function (k) { if (inv.text[k]) h += '<h3 id="f-' + k + '">' + FIELD[k] + '</h3><p class="verbatim">' + (k === field ? markPassage(inv.text[k], id, k, pi) : esc(inv.text[k])) + "</p>"; });
    h += '<dl class="facts" style="margin-top:1rem">' +
      (inv.hardware ? "<dt>Hardware</dt><dd>" + esc(inv.hardware) + "</dd>" : "") +
      (inv.start ? "<dt>Dates</dt><dd>" + esc(inv.start) + " to " + esc(inv.end || "not stated") + "</dd>" : "") +
      (inv.sub_research_area ? "<dt>PSI sub-research area</dt><dd>" + esc(inv.sub_research_area) + "</dd>" : "") +
      (inv.related.length ? "<dt>Related</dt><dd>" + inv.related.map(function (r) { return BY_ID[r] ? invLink(r) : esc(r); }).join(", ") + "</dd>" : "") +
      "<dt>License</dt><dd>" + esc(inv.license || "not stated in the record") + "</dd>" +
      "<dt>Snapshot</dt><dd>record retrieved " + esc(inv.record_retrieved.slice(0, 10)) + ', SHA-256 <span class="asw">' + esc(inv.record_sha256.slice(0, 16)) + "…</span></dd></dl></details>";
    h += '<details class="sect"><summary>Publications listed by PSI (' + inv.publications.length + ")</summary>";
    if (inv.publications.length) {
      h += '<p class="muted small">Results live in these papers. ' + inv.publications_with_doi + ' have a DOI.</p><ul class="clean pubs">';
      inv.publications.forEach(function (p) {
        h += "<li>" + esc(p.title) + (p.year ? " (" + p.year + ")" : "") + (p.venue ? ', <span class="muted">' + esc(p.venue) + "</span>" : "") +
          (p.doi ? '<a href="https://doi.org/' + esc(p.doi) + '" target="_blank" rel="noopener">' + esc(p.doi) + "</a>" : ' <span class="muted">(no DOI listed)</span>') + "</li>";
      });
      h += "</ul>";
    } else h += '<p class="muted">None listed.</p>';
    h += "</details>";
    main.innerHTML = h;
    if (field && invFocusDone !== location.hash) {
      invFocusDone = location.hash;
      setTimeout(function () { var el = main.querySelector("#verbatim mark.hl") || document.getElementById("f-" + field); if (el) el.scrollIntoView({ block: "center" }); }, 0);
    }
    // A shared link opens this page directly, before the Ask page has loaded the passages: load them, then mark.
    if (field && pi != null && !ASK.P) askLoad().then(function () {
      var head = document.getElementById("f-" + field), para = head && head.nextElementSibling;
      if (!para || hashParts()[1] !== id) return;
      para.innerHTML = markPassage(inv.text[field], id, field, pi);
      var m = para.querySelector("mark.hl");
      if (m) m.scrollIntoView({ block: "center" });
    }).catch(function () {});
    document.getElementById("cmp").addEventListener("change", function (e) { if (e.target.value) location.hash = "#/compare/" + id + "/" + e.target.value; });
    relatedLoad().then(function (R) {
      var el = document.getElementById("relm"), list = R && R.related[id];
      if (!el || !list || !list.length || el.getAttribute("data-for") !== id) return;
      el.innerHTML = "<b>Closest by meaning</b> " + list.filter(function (x) { return BY_ID[x.id]; }).map(function (x) { return invLink(x.id) + ' <span class="muted">' + x.similarity.toFixed(2) + "</span>"; }).join(", ") +
        '<span class="relnote">The records whose NASA text is nearest to this one, as measured by the language model when the site is built (1 would be the same text). A match of wording and topic, not a judgement by NASA.</span>';
    });
    var f = main.querySelector("[data-findinv]");
    if (f) f.addEventListener("click", function () { find.q = f.getAttribute("data-findinv"); find.cls = "all"; find.only = false; });
  }

  var REL = null;
  function relatedLoad() {
    if (REL) return Promise.resolve(REL);
    return fetch("data/related.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (R) { REL = R; return R; }).catch(function () { return null; });
  }

  function viewCompare(a, b) {
    var A = BY_ID[a], B = BY_ID[b];
    if (!A || !B) return viewRank();
    setTitle(A.name + " and " + B.name);
    function tb(i, f) { return i.tables.length ? i.tables.map(f).filter(Boolean).join("<br>") || '<span class="muted">not in the table</span>' : '<span class="muted">no table in PSI</span>'; }
    function cv(i, k) { return VALUE_WORD[RK[i.id].criteria[k].value]; }
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
      ["Reaches " + num(ATM.o2) + " % oxygen", function (i) { return cv(i, "oxygen"); }],
      ["Reaches " + num(ATM.p) + " psi or less", function (i) { return cv(i, "pressure"); }],
      ["Both in the same test", function (i) { var k = RK[i.id].criteria.both; return VALUE_WORD[k.value] + (k.rows ? " (" + k.rows + " tests)" : ""); }],
      ["Conditions met for " + esc(ATM.name), function (i) { return dots(i) + " " + num(RK[i.id].score) + " of 5"; }],
      ["Publications listed", function (i) { return String(i.publications.length); }]
    ];
    var h = '<p class="small"><a href="#/inv/' + a + '">← ' + esc(A.name) + '</a></p><p class="kick">Compare</p><h1>' + esc(A.name) + " and " + esc(B.name) + "</h1>";
    h += '<p class="muted">Side by side, from NASA\'s records and tables. Rows marked "differs" are where the two are not the same.</p>';
    h += '<div class="tablewrap"><table class="cmp"><thead><tr><th></th><th>' + invLink(a) + "</th><th>" + invLink(b) + "</th></tr></thead><tbody>";
    rows.forEach(function (r) {
      var x = r[1](A), y = r[1](B);
      h += '<tr class="' + (x === y ? "" : "diff") + '"><td>' + r[0] + "</td><td>" + x + "</td><td>" + y + "</td></tr>";
    });
    main.innerHTML = h + "</tbody></table></div>";
  }

  function viewQuestions(focusId) {
    setTitle("Open questions");
    var h = '<p class="kick">Open questions</p><h1>Six fire-safety questions for a Moon Base</h1>';
    h += '<p class="lead">What NASA\'s microgravity data can say today, the evidence, and what is missing. Choose a question.</p>';
    if (!TOPICS) topicsLoad().then(function () { if (hashParts()[0] === "questions") route(true); });
    h += '<div id="topics">' + topicSection() + "</div><h2>The six questions</h2>";
    D.questions.forEach(function (q, n) {
      h += '<details class="q" id="q-' + q.id + '"' + ((focusId ? q.id === focusId : n === 0) ? " open" : "") + '><summary><span class="pill ' + q.status + '">' + WORD[q.status] + "</span><b>" + esc(q.question) + "</b></summary><p>" + esc(q.answer) + '</p><ul class="ev">';
      q.evidence.forEach(function (e) {
        var inv = BY_ID[e.inv];
        h += '<li><div class="ev-head">' + invLink(e.inv) + chip(inv.cls) + "</div>" + esc(e.text) + (e.kind === "record" ? quote(e.inv, e.field, e.quote) :
          (inv.tables.length ? ' <button class="link" data-table="' + inv.tables[0].file + '">View NASA\'s table</button>' : "")) + "</li>";
      });
      h += '</ul><p class="missing"><strong>Missing:</strong> ' + esc(q.missing) + "</p>" + (TOPICS ? topicExamples(q.id) : "");
      if (q.elsewhere && q.elsewhere.length) h += '<div class="elsewhere"><b>NASA work on this outside PSI</b><span>Not part of the PSI data, and not used for any number on this site.</span><ul>' + q.elsewhere.map(function (x) {
        return '<li><a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.title) + "</a> (" + x.year + ", NASA Technical Reports Server)</li>";
      }).join("") + "</ul></div>";
      h += "</details>";
    });
    h += '<p class="note">These answers are about the Moon Base as given in the challenge statement. They were written with AI (Claude, Anthropic) from the PSI records and tables, and reviewed by the team. Every quotation is NASA\'s wording and every number comes from a NASA table; a program checks both.</p>';
    main.innerHTML = h;
    if (focusId) { var el = document.getElementById("q-" + focusId); if (el) setTimeout(function () { el.scrollIntoView({ block: "start" }); }, 0); }
  }

  function dataTopics() {
    var T = TOPICS, E = T.evaluation, A = T.about, W = { words: "Words", meaning: "Meaning alone", both: "Both (the Ask page)" };
    var h = '<details class="sect"><summary>Sorting NASA\'s text by fire question</summary>';
    h += "<p>All " + A.passages + " passages (" + A.record_passages + " from NASA's records, " + A.paper_passages + " from the titles and abstracts of the papers PSI lists) were read by " + esc(A.labelled_by) + " and labelled with the six fire questions they address, following a written guide for each question (<code>data/content/question_topics.json</code>). " +
      A.labelled_passages + " passages address at least one question; " + A.unlabelled_passages + " address none. <code>scripts/build_topics.mjs</code> stops if a quoted justification is not in its passage word for word, or if any passage changed since it was labelled. The counts are on the <a href=\"#/questions\">Open questions</a> page.</p>";
    h += "<p>A small language model was tried first for this sorting (all-MiniLM-L6-v2, the site's model at the time) and failed: it put most passages about weightlessness under Moon gravity. So the labels come from the large model.</p>";
    h += "<p><strong>A second check of the Ask search.</strong> The score above uses 40 test questions and asks whether the right investigation comes first. This one uses the six fire questions and the labels: each question is typed into the Ask page's own ranking, and the table counts how many of the passages the page shows (at most 8) are labelled as addressing it.</p>";
    h += '<div class="tablewrap"><table><thead><tr><th>Question</th><th class="num">Passages labelled</th>' + E.modes.map(function (m) { return '<th class="num">' + W[m] + "</th>"; }).join("") + "</tr></thead><tbody>" +
      D.questions.map(function (q) {
        var r = E.per_question[q.id];
        return "<tr><td>" + esc(q.question) + '</td><td class="num">' + r.labelled + "</td>" + E.modes.map(function (m) { return '<td class="num">' + (m === "both" ? "<b>" : "") + r[m].hits + " of " + r[m].shown + (m === "both" ? "</b>" : "") + "</td>"; }).join("") + "</tr>";
      }).join("") + '<tr class="tot"><td>All ' + E.average.both.questions.length + ' questions with at least 10 labelled passages</td><td></td>' + E.modes.map(function (m) { var a = E.average[m]; return '<td class="num">' + a.hits + " of " + a.shown + " (" + Math.round(a.share * 100) + " %)</td>"; }).join("") + "</tr></tbody></table></div>";
    h += '<p class="src">Ranking with ' + esc(E.model) + ", the model the site loads. Moon gravity is left out of the total: a single passage is labelled for it. The labels were made by the same kind of tool that wrote this site's texts; a person should check a sample of them.</p></details>";
    return h;
  }
  function viewData() {
    setTitle("Data and method");
    if (!TOPICS) topicsLoad().then(function () { if (hashParts()[0] === "data") route(true); });
    var S = D.summary, A = D.about;
    var h = '<p class="kick">Data and method</p><h1>Take the data, check the method</h1>';
    h += '<p class="lead">Everything on this site is built by one script from an untouched copy of NASA\'s files. No number is typed in by hand, and nothing is estimated.</p>';
    h += '<div class="cards">';
    h += '<div class="card"><h3>Investigations</h3><p>' + S.investigations + ' rows: rank, conditions, oxygen and pressure ranges, DOI.</p><a class="btn sm" href="data/investigations.csv" download>investigations.csv</a></div>';
    h += '<div class="card"><h3>Tests</h3><p>' + TESTS.length + ' table rows, with NASA\'s original cell beside each converted value. For flammability models.</p><a class="btn sm" href="data/tests.csv" download>tests.csv</a></div>';
    h += '<div class="card"><h3>Attributes</h3><p>For each investigation: sample or burner, what varied, airflow, what was measured, use on Earth, each with NASA\'s sentence.</p><a class="btn sm" href="data/attributes.csv" download>attributes.csv</a></div>';
    h += '<div class="card"><h3>Everything, as JSON</h3><p>The exact files this page reads.</p><span class="row"><a class="btn sm" href="data/dataset.json" download>dataset.json</a><a class="btn sm ghost" href="data/tests.json" download>tests.json</a></span></div>';
    h += '<div class="card"><h3>Code and raw snapshot</h3><p>Scripts, NASA\'s files byte for byte, and their checksums.</p><a class="btn sm ghost" href="' + REPO + '" target="_blank" rel="noopener">GitHub repository</a></div></div>';

    h += '<details class="sect" open><summary>Where the data comes from</summary><p>NASA\'s <a href="' + A.source_url + '" target="_blank" rel="noopener">Physical Sciences Informatics (PSI) repository</a>, Combustion Science: ' + S.investigations + " investigation records and " + S.tables +
      " Experimental Tables (" + S.entry_rows + " entry rows), downloaded on " + esc(A.snapshot_retrieved_from.slice(0, 10)) + ". Each file is stored unchanged with its SHA-256 checksum. Raw videos and sensor files (hundreds of gigabytes) are not used.</p></details>";

    h += '<details class="sect"><summary>The rules every number follows</summary><ul>';
    h += "<li><strong>Ambient oxygen and burner-flow oxygen are never mixed.</strong> Ambient oxygen is the air around the flame. Burner-flow oxygen is blown out of a burner into fuel gas.</li>";
    h += '<li><strong>A cell is a number only if NASA wrote a plain number</strong>, or a list of plain numbers separated by semicolons. Cells such as <span class="asw">~ 21.5</span>, <span class="asw">3400%</span> or <span class="asw">0.5 atm</span> are shown exactly as written and are not counted.</li>';
    h += "<li><strong>Two conversions, both marked:</strong> mole fraction × 100 = percent, and pressure to psi (1 atm = " + A.conversions["psi per unit"].atm + " psi, 1 bar = " + A.conversions["psi per unit"].bar + " psi, 1 mmHg = " + A.conversions["psi per unit"].mmHg + " psi).</li>";
    h += '<li><strong>"Not stated" stays "not stated".</strong> Missing values are never filled in.</li></ul></details>';

    h += '<details class="sect"><summary>The atmospheres you can choose, and where their figures come from</summary><div class="tablewrap"><table><thead><tr><th>Atmosphere</th><th>Oxygen at least</th><th>Pressure at most</th><th>Source</th></tr></thead><tbody>' + A.presets.map(function (p) {
      return "<tr><td>" + esc(p.name) + "</td><td>" + num(p.o2) + " %</td><td>" + num(p.p) + " psi</td><td>" + esc(p.source) + (p.quote ? quote(p.record, p.field, p.quote) : "") + "</td></tr>";
    }).join("") + '</tbody></table></div><p>The Moon Base numbers are computed when the site is built. For any other atmosphere, your browser recounts NASA\'s tests with the same rules (<span class="asw">recount.js</span>). A check script confirms that the recount and the build give identical numbers for the Moon Base.</p></details>';

    h += '<details class="sect"><summary>The five conditions behind the ranking</summary><ol>' + crits().map(function (c) { return "<li><strong>" + esc(c[1]) + ".</strong> " + esc(c[2]) + "</li>"; }).join("") + "</ol>";
    h += "<p>Conditions 3 to 5 are counted from NASA's tables. Conditions 1 and 2 are this team's reading of each record: for condition 1 the sentence it rests on is quoted on every investigation page, and the build fails if that sentence is not in NASA's record word for word. Purpose: " +
      (S.purpose_counts.primary || 0) + " main purpose, " + (S.purpose_counts.benefit || 0) + " named as a benefit, " + (S.purpose_counts.none || 0) + " not their purpose.</p></details>";

    h += '<details class="sect"><summary>The one table that is not from PSI</summary><p>The <a href="#/habitat">Habitat</a> page shows Earth tests of 26 material samples at Moon Base pressure, from a NASA White Sands Test Facility paper of 2007 (<a href="https://ntrs.nasa.gov/citations/20070018178">NTRS 20070018178</a>, public use permitted). The PDF, its extracted text and their checksums are stored with the source code. <code>scripts/build_external.py</code> reads every threshold from that text and stops if a sample name, a number or a quoted sentence is not found exactly. Nothing from it is mixed into the PSI counts.</p></details>' +
      '<details class="sect"><summary>The droplet model on the Analysis page</summary><p>The <a href="#/analysis">Analysis</a> page fits a plain statistical model (ordinary least squares) to the FLEX table. It is statistics, not a language model: <code>scripts/analyze_flex.py</code> fits it with the Python standard library, and <code>scripts/check_model.cjs</code>, written separately in JavaScript, reads the CSV from NASA again, refits it and fails unless it gets the same coefficients, errors and counts. The fitted model is in <a href="data/flex_model.json">data/flex_model.json</a>.</p></details>' +
      '<details class="sect"><summary>How well Ask finds the right record</summary><div id="ask-eval"><p class="muted">Loading the test results…</p></div></details>' +
      (TOPICS ? dataTopics() : "") +
      '<details class="sect"><summary>How AI was used</summary><p>AI does five jobs on this site, and each one is checked or limited so that it cannot invent anything.</p><ol>' +
      "<li><strong>It reads NASA's records.</strong> An AI model (Claude, Anthropic) wrote the plain-language summaries and answers, and extracted for every investigation what was burned, what was varied, what was measured and what it is for on Earth. Before the site is built, a program checks that every quotation exists word for word in the named NASA record, that every table column exists, and that the texts contain no hand-typed numbers.</li>" +
      "<li><strong>It matches your question to NASA's sentences.</strong> On the Ask page, a small open language model (snowflake-arctic-embed-s) runs inside your browser. It turns your question and " + (ASK.P ? ASK.P.passages.length : "about 900") + " passages into lists of numbers that capture meaning, and shows the passages closest to your question. It writes nothing: every result is a quotation with its source. Your question never leaves your computer. The numbers the Ask page shows beside the quotations are counted from NASA's tables by ordinary code, not by the model. A short fixed list links everyday words to NASA's terms (for example plastic and PMMA); it was drafted with AI, and the build stops if a term is not in NASA's text or tables.</li>" +
      "<li><strong>It sorted NASA's text by fire question.</strong> An AI model (Claude, Anthropic) read all " + (TOPICS ? TOPICS.about.passages : "") + " passages of the records and of the listed papers and labelled each with the questions it addresses, quoting the words that justify each label. A program checks every quote. The counts on the Open questions page come from these labels.</li>" +
      "<li><strong>It helped write the code.</strong> The scripts and this website were written with AI assistance and reviewed by the team.</li>" +
      "<li><strong>It drew the pictures that are not photographs.</strong> The logo, the route map and the habitat schematic were drawn as code (SVG) with AI assistance. Each drawing on a page carries a note saying so. The three photographs are NASA's and are not AI-generated.</li></ol>" +
      "<p>An early layout of the overview followed a design mockup made with ChatGPT (OpenAI); the mockup itself is not used. The idea of the project, asking how much of NASA's fire data applies to the Moon Base, is the team's.</p></details>";

    h += '<details class="sect"><summary>Limits</summary><ul>';
    h += "<li>This shows coverage, not predictions. It does not say how fire behaves on the Moon.</li>";
    h += "<li>Only what PSI's records and Experimental Tables state is used. The investigations' documents and " + S.publications + " listed publications (" + S.unique_dois + " unique DOIs) hold more detail that is not read here.</li>";
    h += "<li>NASA has planned and flown solid-fuel tests at elevated oxygen that are not among PSI's Combustion Science records in this snapshot (Saffire IV to VI; see the NASA roadmap in the references). They are outside this dataset.</li>";
    h += "<li>" + S.records_mentioning_moon_or_partial_gravity + " of the " + S.investigations + " PSI records mention the Moon, Mars or partial gravity in their description. Every test is in weightlessness or on Earth.</li></ul></details>";

    h += '<details class="sect"><summary>References and credits</summary><p>Each investigation, cited by its NASA DOI:</p><div class="tablewrap"><table><thead><tr><th>PSI id</th><th>Investigation</th><th>DOI</th><th>License</th></tr></thead><tbody>';
    D.investigations.slice().sort(function (a, b) { return +a.id.slice(4) - +b.id.slice(4); }).forEach(function (i) {
      h += "<tr><td>" + esc(i.id) + '</td><td class="rank-name">' + invLink(i.id) + "<span>" + esc(i.title) + "</span></td><td>" +
        (i.doi ? '<a href="https://doi.org/' + esc(i.doi) + '" target="_blank" rel="noopener">' + esc(i.doi) + "</a>" : "none") + "</td><td>" + esc(i.license || "blank in the record") + "</td></tr>";
    });
    h += "</tbody></table></div>";
    h += '<ul><li><a href="https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/" target="_blank" rel="noopener">NASA Space Apps Challenge 2026: Flame in Freefall</a> (the Moon Base and spacesuit atmosphere figures)</li>' +
      '<li><a href="https://www.nasa.gov/moonbase" target="_blank" rel="noopener">NASA: Moon Base</a></li>' +
      '<li><a href="https://ntrs.nasa.gov/citations/20205007829" target="_blank" rel="noopener">G. A. Ruff, Spacecraft Fire Safety Needs for Exploration, NASA Glenn, 2020</a> (roadmap listing Saffire IV to VI with elevated oxygen)</li>' +
      '<li><a href="https://openalex.org" target="_blank" rel="noopener">OpenAlex</a> (year and journal of the publications PSI lists)</li>' +
      '<li><a href="https://github.com/nasa/hds-core" target="_blank" rel="noopener">NASA Horizon Design System</a> (the colour values: NASA Red, the Carbon greys and the chart palette for dark backgrounds)</li>' +
      '<li><a href="https://huggingface.co/Snowflake/snowflake-arctic-embed-s" target="_blank" rel="noopener">snowflake-arctic-embed-s</a> language model (Snowflake, Apache-2.0), run with <a href="https://github.com/huggingface/transformers.js" target="_blank" rel="noopener">Transformers.js</a> (Apache-2.0) and <a href="https://github.com/microsoft/onnxruntime" target="_blank" rel="noopener">ONNX Runtime Web</a> (MIT); all three are served with this site</li></ul>';
    h += '<p>Images, all NASA photographs in the public domain, none AI-generated: the Moon is the <a href="' + MOON.page + '" target="_blank" rel="noopener">Lunar Reconnaissance Orbiter near-side mosaic</a> (' + esc(MOON.credit) + '); Earth is <a href="https://commons.wikimedia.org/wiki/File:The_Earth_seen_from_Apollo_17.jpg" target="_blank" rel="noopener">The Earth seen from Apollo 17</a> (NASA, Apollo 17 crew); the space station is <a href="https://commons.wikimedia.org/wiki/File:International_Space_Station_after_undocking_of_STS-132.jpg" target="_blank" rel="noopener">photograph S132-E-012208</a> (NASA, crew of STS-132).</p>';
    fetch("data/ask_eval.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (E) {
      var el = document.getElementById("ask-eval");
      if (!el) return;
      function cell(s) { return "<td>" + s.hit1 + " of " + s.questions + "</td><td>" + s.hit3 + " of " + s.questions + "</td>"; }
      function row(name, x) { return "<tr><td>" + name + "</td>" + cell(x.held_out) + cell(x.all) + "</tr>"; }
      var m = E.site.by_meaning, w = E.site.by_words, off = E.site.by_meaning_without_word_list, o = E.other_model;
      var t = "<p>" + m.all.questions + " test questions were written, and for each one the investigations that answer it were listed. A script ranks NASA's passages for every question with the same code and the same index this site uses (<code>scripts/eval_ask.mjs</code>, <code>ask.js</code>). A question counts as found when a passage shown comes from one of its investigations.</p>";
      t += "<p>The questions were split at random, with a fixed seed, into two halves. Every ranking setting was decided on one half only. The other half, <strong>held out</strong>, was not used to choose settings, so its score is the more honest one. The two language models were then compared on the held-out half, and the one that matches better by meaning alone was kept.</p>";
      t += '<div class="tablewrap"><table><thead><tr><th rowspan="2">Matching</th><th colspan="2">Held-out half</th><th colspan="2">All questions</th></tr><tr><th>Right first</th><th>In first three</th><th>Right first</th><th>In first three</th></tr></thead><tbody>' +
        row("By meaning, with shared words as a bonus (language model loaded)", m) + (E.site.by_meaning_alone ? row("By meaning alone (not used on the site)", E.site.by_meaning_alone) : "") + row("By words (no model)", w) +
        (o ? row("The earlier model, " + esc(o.model.split("/").pop()) + ", by meaning with the bonus", o.with_bonus) + row("The earlier model, by meaning alone", o.meaning_alone) : "") + "</tbody></table></div>";
      t += "<p><strong>Read this score with care.</strong> The questions and their expected answers were labelled by " + esc(E.about.labelled_by) + (E.about.checked_by ? " Checked by " + esc(E.about.checked_by) + "." : "") + " " + esc(E.about.caution) + "</p>";
      if (off) t += "<p>" + m.everyday_words.questions + " of the questions use everyday words that NASA's text does not use. For those, the word list finds the right investigation first in " + m.everyday_words.hit1 + " and among the first three in " + m.everyday_words.hit3 + "; without the list it is " + off.everyday_words.hit1 + " and " + off.everyday_words.hit3 + ". The word list was drafted by the same AI that wrote the questions, so this comparison flatters it.</p>";
      t += '<p>The questions, their halves, the expected investigations and the result for each are in <a href="data/ask_eval.json">data/ask_eval.json</a>.</p>';
      el.innerHTML = t;
    }).catch(function () { var el = document.getElementById("ask-eval"); if (el) el.innerHTML = '<p class="muted">The test results could not be loaded.</p>'; });
    h += '<p>Typefaces, all under the SIL Open Font License 1.1 and served with the site: <a href="https://github.com/jpt/barlow" target="_blank" rel="noopener">Barlow Condensed</a>, <a href="https://github.com/uswds/public-sans" target="_blank" rel="noopener">Public Sans</a> and <a href="https://github.com/googlefonts/dm-mono" target="_blank" rel="noopener">DM Mono</a>.</p></details>';
    main.innerHTML = h;
  }

  // ----------------------------------------------------------------- router
  function hashParts() { return location.hash.replace(/^#\/?/, "").split("?")[0].split("/"); }
  function atmFromHash() {
    var q = (location.hash.split("?")[1] || ""), m = {};
    q.split("&").forEach(function (kv) { var x = kv.split("="); if (x[0]) m[x[0]] = decodeURIComponent(x[1] || ""); });
    if (m.atm) {
      var p = D.about.presets.filter(function (x) { return x.id === m.atm; })[0];
      if (p && ATM.id !== p.id) setAtm({ id: p.id, name: p.name, o2: p.o2, p: p.p, source: p.source });
    } else if (m.o2 && m.p && +m.o2 >= 0 && +m.o2 <= 100 && +m.p > 0 && +m.p <= 100 && (ATM.o2 !== +m.o2 || ATM.p !== +m.p)) {
      setAtm({ id: "custom", name: "Your atmosphere", o2: +m.o2, p: +m.p, source: "Set by you" });
    }
  }
  function route(keep) {
    atmFromHash();
    var parts = hashParts();
    var name = parts[0] || "home";
    closeModal(); tip.hidden = true;
    if (name === "check") { name = "home"; viewHome(); setTimeout(function () { var el = document.getElementById("check"); if (el) el.scrollIntoView(); }, 0); keep = true; }
    else if (name === "map" || name === "explore") { name = "explore"; viewExplore(parts[1]); }
    else if (name === "rank") viewRank(parts[1]);
    else if (name === "ask") viewAsk(parts.slice(1).join("/"));
    else if (name === "habitat") viewHabitat(parts[1]);
    else if (name === "analysis") viewAnalysis();
    else if (name === "inv") viewInv(parts[1], parts[2], parts[3]);   // #/inv/<id>/<field>/<passage>: opens NASA's text at that section
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
    if (name !== "rank") rankTab = "rank";
    document.querySelectorAll("nav a").forEach(function (a) { a.classList.toggle("on", a.dataset.nav === nav); });
    if (!keep) window.scrollTo(0, 0);
  }
  function rerender() { var y = window.scrollY; route(true); window.scrollTo(0, y); }
  var lastTab = null;
  function onHash() {
    // switching tabs inside the explorer should not jump to the top of the page
    var parts = hashParts(), sec = parts[0] === "map" ? "explore" : parts[0], inTabs = sec === "explore" || sec === "rank" || sec === "ask" || sec === "habitat";
    var isTab = inTabs && lastTab === sec;
    lastTab = inTabs ? sec : null;
    if (isTab) rerender(); else route();
  }

  // one click handler for every button the views draw
  main.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button, tr.pick") : null;
    if (!b || (e.target.closest("a") && b.tagName === "TR")) return;
    if (b.dataset.step) {
      var inp = document.getElementById(b.dataset.step), st = +inp.dataset.inc, v = readNum(inp.value) || 0;
      v = Math.round((v + st * +b.dataset.dir) / st) * st;
      inp.value = String(Math.round(Math.min(+inp.dataset.max, Math.max(+inp.dataset.min, v)) * 100) / 100);
      inp.dispatchEvent(new Event("change", { bubbles: true }));
      var again = document.querySelector('[data-step="' + b.dataset.step + '"][data-dir="' + b.dataset.dir + '"]');
      if (again) again.focus();   // keep focus on the button after the bar is redrawn
    }
    else if (b.dataset.atm) {
      var p = D.about.presets.filter(function (x) { return x.id === b.dataset.atm; })[0];
      setAtm({ id: p.id, name: p.name, o2: p.o2, p: p.p, source: p.source });
      rerender();
    }
    else if (b.dataset.table) openTable(b.dataset.table, +b.dataset.row || 0);
    else if (b.dataset.topicshow) {
      var o = TOPICS.overlaps.filter(function (x) { return x.id === b.dataset.topicshow; })[0], box = document.getElementById("topic-show");
      box.innerHTML = box.innerHTML ? "" : '<div class="topic-ex"><p><b>' + esc(o.label) + ":</b> all " + o.passages + " passages, the justifying words in bold.</p><ul>" + o.examples.map(function (x) {
        return "<li>“" + markQuote(x.text, x.quotes) + "”<span>" + topicSource(x) + "</span></li>";
      }).join("") + "</ul></div>";
    }
    else if (b.dataset.habdl) {
      var blob = new Blob([habReport], { type: "text/plain;charset=utf-8" }), a = document.createElement("a");
      a.href = URL.createObjectURL(blob); a.download = "habitat-evidence-report.txt"; document.body.appendChild(a); a.click(); a.remove();
    }
    else if (b.dataset.habcopy) {
      var link = location.href.split("#")[0] + "#/habitat?" + (ATM.id === "custom" ? "o2=" + ATM.o2 + "&p=" + ATM.p : "atm=" + ATM.id) + "&m=" + habPick.join(","), note = document.getElementById("hab-copied");
      var done = function (ok) { note.textContent = ok ? "Link copied." : link; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(link).then(function () { done(true); }, function () { done(false); }); else done(false);
    }
    else if (b.dataset.anfuel) { AN.fuel = b.dataset.anfuel; AN.v.d0 = anMedianSize(); rerender(); }
    else if (b.dataset.dl === "find") downloadFind();
    else if (b.dataset.more === "find") { find.limit += 200; drawFinder(); }
    else if (b.dataset.stop) {
      stopState = stopState === b.dataset.stop ? null : b.dataset.stop;
      document.getElementById("stop-chips").innerHTML = stopChips();
    }
    else if (b.dataset.mat) { matOpen[b.dataset.mat] = !matOpen[b.dataset.mat]; rerender(); }
    else if (b.dataset.ask) { location.hash = "#/ask/" + encodeURIComponent(b.dataset.ask); }
    else if (b.dataset.smart) { askSmart(true); }
    else if (b.dataset.findq) { find.q = b.dataset.findq; find.cls = "all"; find.only = false; find.limit = 60; location.hash = "#/explore/find"; }
    else if (b.dataset.open && drawRank) { rankState.open[b.dataset.open] = !rankState.open[b.dataset.open]; drawRank(); }
    else if (b.dataset.sort) { rankState.sort = b.dataset.sort; rerender(); }
    else if (b.dataset.cls) { rankState.cls = b.dataset.cls; rerender(); }
  });
  // the boxes on the habitat drawing
  main.addEventListener("change", function (e) {
    var d = e.target.dataset || {};
    if (d.habpick != null) { habPick[+d.habpick] = +e.target.value; rerender(); }
    else if (d.habair) {
      var p = D.about.presets.filter(function (x) { return x.id === e.target.value; })[0];
      if (p) { setAtm({ id: p.id, name: p.name, o2: p.o2, p: p.p, source: p.source }); rerender(); }
    }
  });
  // the sliders of the analysis page
  main.addEventListener("input", function (e) {
    var k = e.target.dataset ? e.target.dataset.an : null;
    if (!k) return;
    AN.v[k] = +e.target.value;
    document.getElementById("an-val-" + k).textContent = num(AN.v[k]) + " " + anFeature(k)[2];
    anDraw();
  });
  // the reader's own atmosphere; a decimal comma ("30,5") is read as a point
  function readNum(t) { var v = parseFloat(String(t).trim().replace(",", ".")); return isNaN(v) ? NaN : v; }
  main.addEventListener("keydown", function (e) {
    if ((e.target.id === "atm-o2" || e.target.id === "atm-p") && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      var b = document.querySelector('[data-step="' + e.target.id + '"][data-dir="' + (e.key === "ArrowUp" ? 1 : -1) + '"]');
      if (b) { b.click(); var i = document.getElementById(e.target.id); if (i) i.focus(); }
    }
  });
  main.addEventListener("change", function (e) {
    if (e.target.id !== "atm-o2" && e.target.id !== "atm-p") return;
    var o = readNum(document.getElementById("atm-o2").value), p = readNum(document.getElementById("atm-p").value);
    if (!(o >= 0 && o <= 100) || !(p > 0 && p <= 100)) return;
    setAtm({ id: "custom", name: "Your atmosphere", o2: o, p: p, source: "Set by you" });
    rerender();
  });
  main.addEventListener("keydown", function (e) {
    var r = e.target.closest ? e.target.closest("tr.pick") : null;
    if (r && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); r.click(); }
  });
  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.getElementById("modal").addEventListener("click", function (e) { if (e.target.id === "modal") closeModal(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeModal(); });

  Promise.all([
    fetch("data/dataset.json", { cache: "no-cache" }).then(function (r) { return r.json(); }),
    fetch("data/tests.json", { cache: "no-cache" }).then(function (r) { return r.json(); })
  ]).then(function (res) {
    D = res[0]; TESTS = res[1];
    TESTS.forEach(function (t, i) { t._i = i; });
    D.investigations.forEach(function (i) { BY_ID[i.id] = i; });
    var m = D.about.presets[0];
    setAtm({ id: m.id, name: m.name, o2: m.o2, p: m.p, source: m.source });
    window.addEventListener("hashchange", onHash);
    var wasNarrow = narrow();
    window.addEventListener("resize", function () { if (narrow() !== wasNarrow) { wasNarrow = narrow(); rerender(); } });
    onHash();
  }).catch(function (e) {
    main.innerHTML = '<p class="loading">The data could not be loaded. If you opened this file directly from disk, serve the folder instead (for example: <code>python -m http.server</code> inside <code>docs/</code>).</p>';
    console.error(e);
  });
})();
