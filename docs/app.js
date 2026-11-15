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
    h += '<div class="custom' + (ATM.id === "custom" ? " on" : "") + '"><b>Your own</b><span><label>at least <input type="number" id="atm-o2" min="10" max="100" step="0.5" value="' + num(ATM.o2) +
      '" aria-label="Oxygen, percent, at least"> %</label> <label>at most <input type="number" id="atm-p" min="1" max="50" step="0.1" value="' + num(ATM.p) + '" aria-label="Pressure, psi, at most"> psi</label></span></div>';
    h += '</div><p class="atm-say">Counting tests at <b>' + num(ATM.o2) + " % oxygen or more</b> and <b>" + num(ATM.p) + " psi or less</b>. <span>" + esc(ATM.source) + ".</span></p></section>";
    return h;
  }
  function counters() {
    var c = COUNTS, solid = c.byCls.solid, n5 = RANKED.filter(function (x) { return x.score === 5; }).length;
    var names = c.invsInZone.map(function (id) { return BY_ID[id].name; });
    var h = '<div class="counters">';
    h += '<div class="hot"><b>' + c.inZone + "</b><span>of " + c.both + " tests that state both oxygen and pressure are in this air." + (names.length ? " " + (names.length === 1 ? "All from " : "From ") + esc(names.join(", ")) + "." : "") + "</span></div>";
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
  var stopState = "moon";
  function stopDetail() {
    var S = D.summary, R = S.o2_range_by_class, zone = D.about.moon_base.o2_min_percent, zp = D.about.moon_base.pressure_max_psi;
    var ground = D.investigations.filter(function (i) { return i.ground; }), flight = D.investigations.filter(function (i) { return !i.ground; });
    var lo = Math.min.apply(null, Object.keys(R).map(function (k) { return R[k].min; })), hi = Math.max.apply(null, Object.keys(R).map(function (k) { return R[k].max; }));
    function chips(list) {
      return '<div class="invchips">' + list.map(function (i) {
        return '<a href="#/inv/' + i.id + '"><i class="sw" style="background:' + COLOR[i.cls] + '"></i>' + esc(i.name) + "</a>";
      }).join("") + "</div>";
    }
    if (stopState === "earth") return '<div><h3>Earth</h3><div class="count">' + ground.length + ' <small>investigations</small></div><p class="muted small">Laboratory and computer studies that build on the flight data.</p></div>' +
      "<div><ul><li>Normal gravity: hot air rises and feeds a flame.</li><li>Earth air: 21 % oxygen at 14.7 psi.</li><li>NASA's screening test for spacecraft materials is run here.</li></ul>" + chips(ground) + "</div>";
    if (stopState === "orbit") return '<div><h3>Low Earth orbit</h3><div class="count">' + flight.length + ' <small>investigations</small></div><p class="muted small">Run on the space station or in a cargo spacecraft, in weightlessness.</p></div>' +
      "<div><ul><li>Ambient oxygen tested from " + num(lo) + " % to " + num(hi) + " %.</li><li>Solid materials stop at " + num(R.solid.max) + " %.</li><li>" + S.rows_in_zone + " of " + S.rows_with_both +
      " tests that state both oxygen and pressure are in Moon Base air. All are gas flames.</li></ul>" + chips(flight) + "</div>";
    return '<div><h3>Moon Base</h3><div class="count">' + S.records_mentioning_moon_or_partial_gravity + " <small>of " + S.investigations + ' records mention the Moon</small></div><p class="muted small">NASA plans the base near the lunar South Pole.</p></div>' +
      "<div><ul><li>Air expected: " + num(zone) + " % oxygen or more, at " + num(zp) + " psi or less.</li><li>Solid-material tests in PSI at " + num(zone) + " % oxygen or more: " + R.solid.rows_at_or_above +
      '.</li><li>No investigation in PSI was run in Moon gravity.</li></ul><p style="margin-top:1rem"><a class="more" href="#/questions">See what is still open</a></p></div>';
  }
  function journey() {
    var stops = [["earth", "Earth", "normal gravity"], ["orbit", "Low Earth orbit", "weightless"], ["moon", "Moon Base", "where the data is needed"]];
    return '<div class="journey"><div class="track" role="tablist" aria-label="Where the evidence was gathered">' + stops.map(function (x) {
      return '<button class="stop' + (stopState === x[0] ? " on" : "") + '" data-stop="' + x[0] + '" role="tab" aria-selected="' + (stopState === x[0]) + '"><span class="node ' + x[0] + '"></span><b>' + x[1] + '</b><span class="sub">' + x[2] + "</span></button>";
    }).join("") + '</div><div class="stop-detail" id="stop-detail" role="tabpanel">' + stopDetail() + "</div></div>";
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
    var h = '<section class="hero"><div class="hero-text"><p class="kick">NASA Space Apps Challenge 2026</p>';
    h += "<h1>Solid-material evidence stops before Moon Base air</h1>";
    h += '<p class="lead">NASA\'s Moon Base is expected to hold air with ' + num(zone) + " % oxygen or more, which makes materials burn more easily. In NASA's microgravity fire data, tests on solid materials reach " + num(R.solid.max) + " %.</p>";
    h += '<p class="row"><a class="btn" href="#/check">Check any atmosphere</a><a class="btn ghost" href="#/explore/find">Find a material</a><a class="btn ghost" href="#/ask">Ask the records</a></p>';
    h += '<p class="by">Data Beyond Space, NASA Space Apps Challenge 2026. Data: NASA Physical Sciences Informatics repository, snapshot of ' + esc(day) + ". Moon photograph: Lunar Reconnaissance Orbiter, NASA/GSFC/Arizona State University.</p></div></section>";

    h += '<h2 id="check">How much of NASA\'s fire data fits your atmosphere</h2><p class="sub2">Pick the air you are planning for. Every count below is recounted from ' + TESTS.length + " rows of NASA's tables.</p>" + atmBar();
    h += '<div class="console">' + counters() + '<div class="console-fig"><p class="figt">Oxygen levels tested, by what burns</p><div class="chart" id="chart-bars">' + fuelBars() + "</div></div></div>";
    h += '<p class="src">Source: NASA PSI Experimental Tables. Each bar runs from the lowest to the highest oxygen level NASA tested for one kind of fuel. This shows which conditions were tested, not how fire behaves on the Moon.</p>';
    h += '<p class="row gofar"><a class="more" href="#/explore">See every test</a><a class="more" href="#/explore/pressure">Oxygen against pressure</a><a class="more" href="#/explore/find">Find a material or a test</a><a class="more" href="#/rank">Rank the ' + S.investigations + ' investigations</a><a class="more" href="#/rank/matrix">Compare all ' + S.investigations + " side by side</a></p>";

    h += '<h2>From Earth to the Moon Base</h2><p class="sub2">Where NASA\'s fire evidence was gathered, and where it is needed next. Choose a stop.</p>' + journey();

    h += '<h2>What is still open</h2><p class="sub2">Six fire-safety questions for a Moon Base. Choose one to read what NASA\'s data can say today.</p><div class="qlist two">' + D.questions.map(function (q) {
      return '<a href="#/questions/' + q.id + '"><span class="pill ' + q.status + '">' + WORD[q.status] + "</span><b>" + esc(q.question) + "</b></a>";
    }).join("") + "</div>";
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
  var ASK = { P: null, vec: null, dims: 0, idf: null, toks: null, model: "off", embed: null, q: "", seq: 0 };
  var STOP = {}; "a an and are as at be been but by can did do does for from had has have how if in into is it its of on or that the their them there these this to was were what when where which while who why will with would than then so not no about over under more most much many any some such also only other out up down very".split(" ").forEach(function (w) { STOP[w] = 1; });
  var ASK_EXAMPLES = ["Does smoke behave differently without gravity?", "What happens to a flame when the airflow stops?", "How well do extinguishing gases work in space?", "Is the Earth test for materials safe enough for space?", "Which experiments burned plastic?"];
  function words(text) {
    return (text.toLowerCase().match(/[a-z0-9]+/g) || []).filter(function (w) { return w.length > 1 && !STOP[w]; }).map(function (w) {
      return w.length > 4 ? w.replace(/(ies)$/, "y").replace(/(ing|ed|es|s)$/, "") : w;   // a light stem: fires, burning, burned
    });
  }
  function askLoad() {
    if (ASK.P) return Promise.resolve();
    return fetch("data/passages.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (P) {
      var bin = atob(P.vectors_int8_base64), n = bin.length, v = new Int8Array(n);
      for (var i = 0; i < n; i++) v[i] = bin.charCodeAt(i) << 24 >> 24;
      ASK.P = P; ASK.vec = v; ASK.dims = P.about.dims;
      var df = {};
      ASK.toks = P.passages.map(function (p) { var t = words(p.text), seen = {}; t.forEach(function (w) { if (!seen[w]) { seen[w] = 1; df[w] = (df[w] || 0) + 1; } }); return t; });
      ASK.idf = {};
      Object.keys(df).forEach(function (w) { ASK.idf[w] = Math.log(1 + (P.passages.length - df[w] + 0.5) / (df[w] + 0.5)); });
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
      return T.pipeline("feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "q8", device: "wasm" });
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
    el.innerHTML = ASK.model === "ready" ? "<b>Matching by meaning.</b> A small language model is running in your browser. It only matches text, it writes none, and your question stays on your computer." :
      ASK.model === "loading" ? "<b>Loading the language model.</b> About 50 MB, once. Until it is ready, results are matched by words." :
      ASK.model === "failed" ? "<b>Matching by words.</b> The language model could not start in this browser." :
      '<b>Matching by words.</b> <button class="link" data-smart="1">Match by meaning instead</button> A small language model (about 50 MB, downloaded once) then runs in your browser.';
  }
  function askRank(q, qvec) {
    var P = ASK.P.passages, qt = words(q), n = P.length, out = [], avg = 28;
    for (var i = 0; i < n; i++) {
      var toks = ASK.toks[i], tf = {}, kw = 0;
      for (var k = 0; k < toks.length; k++) tf[toks[k]] = (tf[toks[k]] || 0) + 1;
      qt.forEach(function (w) { if (tf[w]) kw += ASK.idf[w] * tf[w] * 2.2 / (tf[w] + 1.2 * (0.25 + 0.75 * toks.length / avg)); });
      var sem = 0;
      if (qvec) { var o = i * ASK.dims; for (var d = 0; d < ASK.dims; d++) sem += qvec[d] * ASK.vec[o + d]; sem /= 127; }
      out.push({ i: i, kw: kw, sem: sem });
    }
    var maxKw = Math.max.apply(null, out.map(function (x) { return x.kw; })) || 1;
    out.forEach(function (x) {
      var p = P[x.i];
      x.score = qvec ? x.sem + 0.2 * x.kw / maxKw : x.kw / maxKw;      // meaning first, shared words as a tie-breaker
      if (p.kind === "paper" && p.part === "title") x.score *= 0.9;     // a title says less than a sentence
    });
    out.sort(function (a, b) { return b.score - a.score; });
    var seen = {}, top = [], floor = qvec ? 0.3 : 0.2;
    for (var j = 0; j < out.length && top.length < 8; j++) {
      var x = out[j], p2 = P[x.i], key = p2.kind === "record" ? p2.inv : p2.doi;
      if (x.score < floor) break;
      seen[key] = (seen[key] || 0) + 1;
      if (seen[key] <= 2) top.push(x);
    }
    return top;
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
      if (!top.length) { box.innerHTML = '<p class="muted">Nothing in NASA\'s records or the listed papers matches that closely. Try other words, or a simpler question.</p>'; return; }
      var h = '<p class="find-sum">The <b>' + top.length + "</b> closest passages, out of " + P.length + ", " + (qvec ? "matched by meaning." : "matched by words.") + "</p>";
      top.forEach(function (x) {
        var p = P[x.i];
        if (p.kind === "record") {
          var inv = BY_ID[p.inv];
          h += '<article class="hit"><div class="ev-head">' + invLink(p.inv) + chip(inv.cls) + '<span class="small muted">NASA PSI record ' + esc(p.inv) + ", " + FIELD[p.field] + "</span></div><blockquote>“" + mark(p.text, q) + "”</blockquote></article>";
        } else {
          h += '<article class="hit"><div class="ev-head"><span class="papert">' + esc(p.title) + '</span></div><p class="small muted">Paper' + (p.year ? ", " + p.year : "") + (p.venue ? ", " + esc(p.venue) : "") + ". Listed by PSI under " +
            p.psi.map(function (id) { return invLink(id); }).join(", ") + '. <a href="https://doi.org/' + esc(p.doi) + '" target="_blank" rel="noopener">Read it</a></p>' +
            (p.part === "abstract" ? "<blockquote>“" + mark(p.text, q) + "”<cite>From the paper's abstract</cite></blockquote>" : '<p class="small muted">Matched on its title. PSI lists no abstract for it.</p>') + "</article>";
        }
      });
      box.innerHTML = h;
      if (location.search.indexOf("probe") >= 0) fetch("/__probe?" + encodeURIComponent((qvec ? "meaning" : "words") + " | " + q + " | " + top.slice(0, 3).map(function (x) { var p = P[x.i]; return (p.inv || p.doi) + ":" + x.score.toFixed(2); }).join(" "))).catch(function () {});
    }
    show(null);
    var embed = ASK.embed;   // called on its own: the pipeline must not see ASK as "this"
    if (ASK.model === "ready") embed([q], { pooling: "mean", normalize: true }).then(function (o) { show(o.tolist()[0]); }).catch(function (e) { console.error(e); probe("embed failed: " + e + " " + (e && e.stack || "").slice(0, 300)); });
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

  function viewInv(id) {
    var inv = BY_ID[id];
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
    h += '</details><details class="sect"><summary>NASA\'s description, word for word</summary>';
    Object.keys(FIELD).forEach(function (k) { if (inv.text[k]) h += "<h3>" + FIELD[k] + '</h3><p class="verbatim">' + esc(inv.text[k]) + "</p>"; });
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
    document.getElementById("cmp").addEventListener("change", function (e) { if (e.target.value) location.hash = "#/compare/" + id + "/" + e.target.value; });
    var f = main.querySelector("[data-findinv]");
    if (f) f.addEventListener("click", function () { find.q = f.getAttribute("data-findinv"); find.cls = "all"; find.only = false; });
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
    D.questions.forEach(function (q, n) {
      h += '<details class="q" id="q-' + q.id + '"' + ((focusId ? q.id === focusId : n === 0) ? " open" : "") + '><summary><span class="pill ' + q.status + '">' + WORD[q.status] + "</span><b>" + esc(q.question) + "</b></summary><p>" + esc(q.answer) + '</p><ul class="ev">';
      q.evidence.forEach(function (e) {
        var inv = BY_ID[e.inv];
        h += '<li><div class="ev-head">' + invLink(e.inv) + chip(inv.cls) + "</div>" + esc(e.text) + (e.kind === "record" ? quote(e.inv, e.field, e.quote) :
          (inv.tables.length ? ' <button class="link" data-table="' + inv.tables[0].file + '">View NASA\'s table</button>' : "")) + "</li>";
      });
      h += '</ul><p class="missing"><strong>Missing:</strong> ' + esc(q.missing) + "</p>";
      if (q.elsewhere && q.elsewhere.length) h += '<div class="elsewhere"><b>NASA work on this outside PSI</b><span>Not part of the PSI data, and not used for any number on this site.</span><ul>' + q.elsewhere.map(function (x) {
        return '<li><a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.title) + "</a> (" + x.year + ", NASA Technical Reports Server)</li>";
      }).join("") + "</ul></div>";
      h += "</details>";
    });
    h += '<p class="note">These answers are about the Moon Base as given in the challenge statement. They were written with AI (Claude, Anthropic) from the PSI records and tables, and reviewed by the team. Every quotation is NASA\'s wording and every number comes from a NASA table; a program checks both.</p>';
    main.innerHTML = h;
    if (focusId) { var el = document.getElementById("q-" + focusId); if (el) setTimeout(function () { el.scrollIntoView({ block: "start" }); }, 0); }
  }

  function viewData() {
    setTitle("Data and method");
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

    h += '<details class="sect"><summary>How AI was used</summary><p>AI does three jobs on this site, and each one is checked or limited so that it cannot invent anything.</p><ol>' +
      "<li><strong>It reads NASA's records.</strong> An AI model (Claude, Anthropic) wrote the plain-language summaries and answers, and extracted for every investigation what was burned, what was varied, what was measured and what it is for on Earth. Before the site is built, a program checks that every quotation exists word for word in the named NASA record, that every table column exists, and that the texts contain no hand-typed numbers.</li>" +
      "<li><strong>It matches your question to NASA's sentences.</strong> On the Ask page, a small open language model (all-MiniLM-L6-v2) runs inside your browser. It turns your question and " + (ASK.P ? ASK.P.passages.length : "about 900") + " passages into lists of numbers that capture meaning, and shows the passages closest to your question. It writes nothing: every result is a quotation with its source. Your question never leaves your computer.</li>" +
      "<li><strong>It helped write the code.</strong> The scripts and this website were written with AI assistance and reviewed by the team.</li></ol>" +
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
      '<li><a href="https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2" target="_blank" rel="noopener">all-MiniLM-L6-v2</a> language model (Apache-2.0), run with <a href="https://github.com/huggingface/transformers.js" target="_blank" rel="noopener">Transformers.js</a> (Apache-2.0) and <a href="https://github.com/microsoft/onnxruntime" target="_blank" rel="noopener">ONNX Runtime Web</a> (MIT); all three are served with this site</li></ul>';
    h += '<p>Images, all NASA photographs in the public domain, none AI-generated: the Moon is the <a href="' + MOON.page + '" target="_blank" rel="noopener">Lunar Reconnaissance Orbiter near-side mosaic</a> (' + esc(MOON.credit) + '); Earth is <a href="https://commons.wikimedia.org/wiki/File:The_Earth_seen_from_Apollo_17.jpg" target="_blank" rel="noopener">The Earth seen from Apollo 17</a> (NASA, Apollo 17 crew); the space station is <a href="https://commons.wikimedia.org/wiki/File:International_Space_Station_after_undocking_of_STS-132.jpg" target="_blank" rel="noopener">photograph S132-E-012208</a> (NASA, crew of STS-132).</p>';
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
    if (name !== "rank") rankTab = "rank";
    document.querySelectorAll("nav a").forEach(function (a) { a.classList.toggle("on", a.dataset.nav === nav); });
    if (!keep) window.scrollTo(0, 0);
  }
  function rerender() { var y = window.scrollY; route(true); window.scrollTo(0, y); }
  var lastTab = null;
  function onHash() {
    // switching tabs inside the explorer should not jump to the top of the page
    var parts = hashParts(), sec = parts[0] === "map" ? "explore" : parts[0], inTabs = sec === "explore" || sec === "rank" || sec === "ask";
    var isTab = inTabs && lastTab === sec;
    lastTab = inTabs ? sec : null;
    if (isTab) rerender(); else route();
  }

  // one click handler for every button the views draw
  main.addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest("button, tr.pick") : null;
    if (!b || (e.target.closest("a") && b.tagName === "TR")) return;
    if (b.dataset.atm) {
      var p = D.about.presets.filter(function (x) { return x.id === b.dataset.atm; })[0];
      setAtm({ id: p.id, name: p.name, o2: p.o2, p: p.p, source: p.source });
      rerender();
    }
    else if (b.dataset.table) openTable(b.dataset.table, +b.dataset.row || 0);
    else if (b.dataset.dl === "find") downloadFind();
    else if (b.dataset.more === "find") { find.limit += 200; drawFinder(); }
    else if (b.dataset.stop) {
      stopState = b.dataset.stop;
      document.querySelectorAll(".stop").forEach(function (x) { x.classList.toggle("on", x === b); x.setAttribute("aria-selected", x === b); });
      document.getElementById("stop-detail").innerHTML = stopDetail();
    }
    else if (b.dataset.mat) { matOpen[b.dataset.mat] = !matOpen[b.dataset.mat]; rerender(); }
    else if (b.dataset.ask) { location.hash = "#/ask/" + encodeURIComponent(b.dataset.ask); }
    else if (b.dataset.smart) { askSmart(true); }
    else if (b.dataset.open && drawRank) { rankState.open[b.dataset.open] = !rankState.open[b.dataset.open]; drawRank(); }
    else if (b.dataset.sort) { rankState.sort = b.dataset.sort; rerender(); }
    else if (b.dataset.cls) { rankState.cls = b.dataset.cls; rerender(); }
  });
  // the reader's own atmosphere
  main.addEventListener("change", function (e) {
    if (e.target.id !== "atm-o2" && e.target.id !== "atm-p") return;
    var o = parseFloat(document.getElementById("atm-o2").value), p = parseFloat(document.getElementById("atm-p").value);
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
