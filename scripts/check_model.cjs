#!/usr/bin/env node
/*
 * check_model.cjs - an independent check of the FLEX droplet model.
 *
 * scripts/analyze_flex.py (Python) fits the model. This script (JavaScript, sharing no
 * code with it) reads NASA's CSV again, applies the same stated rules, refits every model
 * and fails unless coefficients, error figures and test counts agree. It also checks that
 * docs/model.js, which the website uses, returns the same estimate as a direct calculation,
 * and that leaving one test out by refitting gives the leave-one-out error the build reports.
 *
 * Run from the repo root, after analyze_flex.py:   node scripts/check_model.cjs
 * Written with AI assistance (Claude Code, Anthropic).
 */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const M = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "data", "flex_model.json"), "utf8"));
const FlexModel = require(path.join(ROOT, "docs", "model.js"));
let bad = 0;
const fail = m => { console.error("FAIL: " + m); bad++; };
const close = (a, b, tol = 1e-8) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

// ---- read the CSV (quoted fields allowed)
function parseCsv(text) {
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (c !== "\r") cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
const table = parseCsv(fs.readFileSync(path.join(ROOT, "data", "psi", "raw", M.about.source_table), "latin1"));
const head = table[0].map(h => h.trim());
const col = name => { const i = head.findIndex(h => h.startsWith(name)); if (i < 0) throw new Error("column not found: " + name); return i; };
const C = { fuel: col("Fuel"), p: col("Ambient pressure"), o2: col("O initial"), n2: col("N initial"), co2: col("CO initial"), he: col("He initial"), d0: col("Droplet initial"), dext: col("Visible flame extinction"), k: col("Burning rate"), end: col("Test end"), date: col("Test Date") };
const num = s => { const v = parseFloat(s); return s !== undefined && s.trim() !== "" && isFinite(v) && String(s).trim().match(/^[-+]?[0-9.]+(e[-+]?\d+)?$/i) ? v : null; };
const rows = [];
table.slice(1).forEach((r, i) => {
  const o2 = num(r[C.o2]), n2 = num(r[C.n2]), co2 = num(r[C.co2]), he = num(r[C.he]), p = num(r[C.p]), d0 = num(r[C.d0]);
  if (!(r[C.fuel] || "").trim() || o2 === null) return;
  if (!p) return;
  if (n2 === null || co2 === null || he === null || Math.abs(o2 + n2 + co2 + he - 1) > 0.02) return;
  if (d0 === null) return;
  const dext = num(r[C.dext]), end = (r[C.end] || "").trim();
  rows.push({ row: i + 2, fuel: r[C.fuel].trim(), date: r[C.date].trim(), end, o2: o2 * 100, co2: co2 * 100, he: he * 100, p: p * M.about.mmhg_to_psi, d0,
    rate: num(r[C.k]), left: end === "Extinction" && dext && dext > 0 && dext <= d0 ? Math.pow(dext / d0, 3) : null });
});
if (rows.length !== M.about.rows_used) fail(`rows used: ${rows.length} here, ${M.about.rows_used} in the build`);
if (table.length - 1 !== M.about.rows_in_table) fail("rows in table differ");
M.rows.forEach((r, i) => {
  const s = rows[i];
  if (!s || s.row !== r.row || s.fuel !== r.fuel || !close(s.o2, r.o2, 1e-4) || !close(s.p, r.p, 1e-4) || !close(s.d0, r.d0) || (s.rate === null) !== (r.rate === null) || (s.left === null) !== (r.left === null))
    fail("row " + r.row + " differs from NASA's CSV");
});

// ---- ordinary least squares by Gaussian elimination on the normal equations
function solve(A, b) {
  const n = A.length, m = A.map((r, i) => r.concat([b[i]]));
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[piv][c])) piv = r;
    [m[c], m[piv]] = [m[piv], m[c]];
    for (let r = c + 1; r < n; r++) { const f = m[r][c] / m[c][c]; for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k]; }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r--) { let s = m[r][n]; for (let k = r + 1; k < n; k++) s -= m[r][k] * x[k]; x[r] = s / m[r][r]; }
  return x;
}
const xOf = r => [1, r.o2, r.co2, r.he, r.p, r.d0];
function ols(rs, key) {
  const X = rs.map(xOf), y = rs.map(r => r[key]), p = 6;
  const A = Array.from({ length: p }, (_, a) => Array.from({ length: p }, (_, b) => X.reduce((s, x) => s + x[a] * x[b], 0)));
  const v = Array.from({ length: p }, (_, a) => X.reduce((s, x, i) => s + x[a] * y[i], 0));
  return solve(A, v);
}
const dot = (b, x) => b.reduce((s, v, i) => s + v * x[i], 0);

for (const [fuel, F] of Object.entries(M.fuels)) {
  // how the tests ended, by oxygen band: recount
  for (const band of F.endings) {
    for (const [end, n] of Object.entries(band.counts)) {
      const here = rows.filter(r => r.fuel === fuel && r.end === end && (band.from === null || r.o2 >= band.from - 1e-9) && (band.to === null || r.o2 < band.to - 1e-9)).length;
      if (here !== n) fail(`${fuel}: ${here} tests ended in ${end} in band ${band.band} here, ${n} in the build`);
    }
  }
  if (F.endings.reduce((s, b) => s + Object.values(b.counts).reduce((a, n) => a + n, 0), 0) !== F.tests) fail(fuel + ": the bands do not add up to all tests");
  for (const [key, m] of Object.entries(F.models)) {
    const rs = rows.filter(r => r.fuel === fuel && r[key] !== null), y = rs.map(r => r[key]), tag = fuel + " / " + key;
    if (rs.length !== m.n) { fail(`${tag}: ${rs.length} tests here, ${m.n} in the build`); continue; }
    const beta = ols(rs, key);
    beta.forEach((b, a) => { if (!close(b, m.beta[a], 1e-6)) fail(`${tag}: coefficient ${m.terms[a]} is ${b} here, ${m.beta[a]} in the build`); });
    const res = rs.map((r, i) => y[i] - dot(beta, xOf(r))), mean = y.reduce((s, v) => s + v, 0) / y.length;
    const sse = res.reduce((s, e) => s + e * e, 0), sst = y.reduce((s, v) => s + (v - mean) ** 2, 0);
    if (!close(1 - sse / sst, m.r2, 1e-6)) fail(`${tag}: R2 differs`);
    if (!close(sse / (rs.length - 6), m.residual_variance, 1e-6)) fail(`${tag}: residual variance differs`);
    // leave one test out, by really refitting each time (the build uses the algebraic shortcut)
    let loo = 0;
    rs.forEach((r, i) => { const b = ols(rs.filter((_, j) => j !== i), key); loo += (y[i] - dot(b, xOf(r))) ** 2; });
    if (!close(Math.sqrt(loo / rs.length), m.rmse_leave_one_out, 1e-6)) fail(`${tag}: leave-one-out error is ${Math.sqrt(loo / rs.length)} here, ${m.rmse_leave_one_out} in the build`);
    // leave one day out
    let lodo = 0;
    for (const day of new Set(rs.map(r => r.date))) {
      const b = ols(rs.filter(r => r.date !== day), key);
      rs.forEach((r, i) => { if (r.date === day) lodo += (y[i] - dot(b, xOf(r))) ** 2; });
    }
    if (!close(Math.sqrt(lodo / rs.length), m.rmse_leave_one_day_out, 1e-6)) fail(`${tag}: leave-one-day-out error differs`);
    // the website's function against a direct calculation, at the Moon Base limits and at a tested point
    for (const v of [{ o2: 30, co2: 0, he: 0, p: 10.2, d0: 3 }, { o2: rs[0].o2, co2: rs[0].co2, he: rs[0].he, p: rs[0].p, d0: rs[0].d0 }]) {
      const e = FlexModel.estimate(m, v);
      if (!close(e.value, dot(beta, xOf(v)), 1e-6)) fail(`${tag}: model.js estimate differs from a direct calculation`);
      if (!(e.low < e.value && e.value < e.high && e.mean_low >= e.low && e.mean_high <= e.high && e.leverage > 0)) fail(`${tag}: model.js ranges are not ordered`);
    }
    // the reported confidence limits must be coefficient +- t * standard error
    m.beta.forEach((b, a) => { if (!close(m.ci_low[a], b - m.t975 * m.se[a]) || !close(m.ci_high[a], b + m.t975 * m.se[a])) fail(`${tag}: confidence limits inconsistent`); });
  }
}
if (bad) { console.error(bad + " check(s) failed."); process.exit(1); }
console.log("Model check passed: refitted " + Object.values(M.fuels).reduce((s, f) => s + Object.keys(f.models).length, 0) + " models from NASA's CSV and got the same numbers.");
