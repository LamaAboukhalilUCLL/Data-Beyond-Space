#!/usr/bin/env node
/*
 * check_recount.js - makes sure the in-browser recount (docs/recount.js) agrees with
 * the build (scripts/build_dataset.py) at the Moon Base thresholds, number for number.
 *
 * Run from the repo root after build_dataset.py:   node scripts/check_recount.js
 *
 * Written with AI assistance (Claude Code, Anthropic).
 */
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..", "docs");
const Recount = require(path.join(root, "recount.js"));
const D = JSON.parse(fs.readFileSync(path.join(root, "data", "dataset.json"), "utf8"));
const T = JSON.parse(fs.readFileSync(path.join(root, "data", "tests.json"), "utf8"));
const o2 = D.about.moon_base.o2_min_percent, p = D.about.moon_base.pressure_max_psi, S = D.summary;
let bad = 0;
function check(ok, msg) { console.log((ok ? "ok   " : "FAIL ") + msg); if (!ok) bad++; }

const c = Recount.counts(T, o2, p);
check(c.both === S.rows_with_both, `tests stating both: ${c.both} (build ${S.rows_with_both})`);
check(c.inZone === S.rows_in_zone, `tests in Moon Base air: ${c.inZone} (build ${S.rows_in_zone})`);
check(c.plainO2 === S.rows_with_plain_ambient_o2, `tests with plain ambient oxygen: ${c.plainO2} (build ${S.rows_with_plain_ambient_o2})`);
check(c.o2AtOrAbove === S.rows_with_o2_at_or_above, `of those at ${o2} % or more: ${c.o2AtOrAbove} (build ${S.rows_with_o2_at_or_above})`);
check(JSON.stringify(c.invsInZone.sort()) === JSON.stringify(S.investigations_in_zone.slice().sort()), "investigations with a test in Moon Base air match");
for (const k of Object.keys(S.o2_range_by_class)) {
  const a = S.o2_range_by_class[k], b = c.byCls[k];
  check(b && a.rows === b.rows && a.rows_at_or_above === b.atOrAbove && a.min === b.min && a.max === b.max, `oxygen range for ${k} matches`);
}
const r = Recount.rank(D.investigations, T, o2, p), byId = {};
D.investigations.forEach(i => (byId[i.id] = i));
let diff = [];
for (const x of r) {
  const i = byId[x.id];
  if (x.rank !== i.rank || x.score !== i.score) diff.push(`${x.id}: rank ${x.rank}/${i.rank}, score ${x.score}/${i.score}`);
  for (const k of ["oxygen", "pressure", "both"]) {
    const a = x.criteria[k], b = i.criteria[k];
    if (a.value !== b.value || a.detail !== b.detail || (a.rows || 0) !== (b.rows || 0)) diff.push(`${x.id}.${k}: "${a.value} | ${a.detail}" vs "${b.value} | ${b.detail}"`);
  }
}
check(!diff.length, `all ${r.length} investigations: rank, score and the three table conditions match the build` + (diff.length ? "\n     " + diff.join("\n     ") : ""));
if (bad) { console.error(`\n${bad} check(s) failed`); process.exit(1); }
console.log("\nRecount agrees with the build.");
