#!/usr/bin/env node
/*
 * check_ask.cjs - checks the logic behind "Ask NASA's records" (docs/ask.js).
 *
 *   - the Moon / Mars / partial-gravity pattern is the one the build uses, fires on those
 *     words and stays silent on "microgravity" and "reduced gravity";
 *   - number questions are recognised, ordinary questions are not;
 *   - the numbers it counts agree with the build (dataset.json), with recount.js and with
 *     an independent count from tests.csv;
 *   - every glossary term exists in NASA's text or tables;
 *   - related.json and the word-matching score in ask_eval.json are what the current
 *     code and index give (the meaning score needs the language model: run eval_ask.mjs);
 *   - the index was built with the model the site loads, the download size stated is the
 *     size of the files served, and the test questions are split into two halves.
 *
 * Needs no language model and no npm install.
 * Run from the repo root, after build_dataset.py and build_search.mjs:   node scripts/check_ask.cjs
 *
 * Written with AI assistance (Claude Code, Anthropic).
 */
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), docs = path.join(ROOT, "docs");
const Ask = require(path.join(docs, "ask.js")), Recount = require(path.join(docs, "recount.js"));
const read = f => JSON.parse(fs.readFileSync(f, "utf8"));
const D = read(path.join(docs, "data", "dataset.json")), T = read(path.join(docs, "data", "tests.json"));
const P = read(path.join(docs, "data", "passages.json")), R = read(path.join(docs, "data", "related.json"));
const E = read(path.join(docs, "data", "ask_eval.json")), Q = read(path.join(ROOT, "data", "content", "ask_eval_questions.json"));
const G = read(path.join(ROOT, "data", "content", "ask_glossary.json"));
const S = D.summary, o2 = D.about.moon_base.o2_min_percent, p = D.about.moon_base.pressure_max_psi;
let bad = 0;
function check(ok, msg) { console.log((ok ? "ok   " : "FAIL ") + msg); if (!ok) bad++; }

// ---- Moon, Mars, partial gravity
const py = fs.readFileSync(path.join(ROOT, "scripts", "build_dataset.py"), "utf8");
const m = /words = re\.compile\(r"([^"]+)", re\.I\)/.exec(py);
check(m && m[1] === Ask.MOON_PATTERN, "the Moon pattern is the one build_dataset.py counts records with");
const yes = ["Does Moon gravity change how a material burns?", "fire in lunar gravity", "Would this burn on Mars?", "Martian habitats", "flames in partial gravity", "partial-g flame spread", "Will plastic burn in Moon Base air?"];
const no = ["Does smoke behave differently in microgravity?", "flame spread in reduced gravity", "What happens in low gravity?", "burning without gravity", "normal gravity tests", "marshmallow", "moonlight", "How well do extinguishing gases work in space?"];
check(yes.every(q => Ask.moon(q)), `Moon card fires on ${yes.length} questions that name the Moon, Mars or partial gravity`);
check(no.every(q => !Ask.moon(q)), `Moon card stays silent on ${no.length} questions that do not (microgravity, reduced gravity, ...)` + no.filter(q => Ask.moon(q)).map(q => "\n     fired on: " + q).join(""));

// ---- number questions
const vocab = Ask.fuelVocabulary(T), terms = q => Ask.expansionText(Ask.expand(q, P.glossary.entries));
const intent = q => Ask.intent(q, D.investigations, vocab, terms(q));
const plain = ["Does smoke behave differently without gravity?", "What happens to a flame when the airflow stops?", "How well do extinguishing gases work in space?", "Is the Earth test for materials safe enough for space?",
  "What is a cool flame?", "Why do flames lift off a burner?", "Does an electric field change a flame?", "in the same test", "Which experiments studied cool flames?", "How many astronauts were on board?", "Does a fire in space die when the wind stops?"];
check(plain.every(q => !intent(q)), `no number card on ${plain.length} ordinary questions` + plain.filter(q => intent(q)).map(q => "\n     fired on: " + q).join(""));
const a1 = intent("How many tests burned PMMA at 21 % oxygen or more?");
check(a1 && a1.fuels.join() === "pmma" && a1.o2 === 21 && a1.p == null, "\"How many tests burned PMMA at 21 % oxygen or more?\" -> fuel pmma, oxygen limit 21");
const a2 = intent("Which experiments burned plastic?");
check(a2 && a2.fuels.join() === "pmma", "\"Which experiments burned plastic?\" -> fuel pmma, through the glossary");
const a3 = intent("What oxygen levels did BASS-II test?");
check(a3 && a3.invs.join() === "PSI-25", "\"What oxygen levels did BASS-II test?\" -> BASS-II only, not BASS");
const a4 = intent("How many Saffire tests state pressure below 10.2 psi?");
check(a4 && a4.invs.length === 3 && a4.p === 10.2, "\"Saffire\" -> the three Saffire investigations; pressure limit 10.2");
const a5 = intent("How much oxygen did the solid materials see?");
check(a5 && a5.cls === "solid", "\"solid materials\" -> the solid-material tests");
check(intent("How many tests are there in total?") && !intent("How many tests are there in total?").fuels.length, "\"How many tests are there in total?\" -> all tests");

// ---- the numbers
const all = Ask.answer(T, o2, p, Recount);
check(all.tests === T.length && all.oxygen.stated === S.rows_with_plain_ambient_o2 && all.oxygen.atOrAbove === S.rows_with_o2_at_or_above && all.both.stated === S.rows_with_both && all.both.inAir === S.rows_in_zone,
  `all tests at Moon Base limits: ${all.oxygen.atOrAbove} of ${all.oxygen.stated} at ${o2} % or more, ${all.both.inAir} of ${all.both.stated} meet both (same as the build)`);
check(JSON.stringify(all.both.invs.slice().sort()) === JSON.stringify(S.investigations_in_zone.slice().sort()), "investigations with a test in Moon Base air match the build");
// pressure, counted again from the CSV the site offers for download
const csv = fs.readFileSync(path.join(docs, "data", "tests.csv"), "utf8").split(/\r?\n/).filter(Boolean);
function cells(line) { const out = []; let cur = "", q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === "," && !q) { out.push(cur); cur = ""; } else cur += ch; } out.push(cur); return out; }
const head = cells(csv[0]), pc = head.indexOf("pressure_psi");
const pv = csv.slice(1).map(l => cells(l)[pc]).filter(v => v !== "" && v != null).map(Number);
check(pc >= 0 && all.pressure.stated === pv.length && all.pressure.atOrBelow === pv.filter(v => v <= p).length,
  `pressure: ${all.pressure.atOrBelow} of ${all.pressure.stated} tests at ${p} psi or less (same as a separate count from tests.csv)`);
const rk = {};
Recount.rank(D.investigations, T, o2, p).forEach(x => (rk[x.id] = x));
let diff = [];
for (const i of D.investigations) {
  const a = Ask.answer(T.filter(t => t.inv === i.id), o2, p, Recount), b = rk[i.id].criteria.both, ox = rk[i.id].criteria.oxygen, pr = rk[i.id].criteria.pressure;
  if ((b.value === "yes" || b.value === "no") && (a.both.inAir !== b.rows || a.both.stated !== b.of)) diff.push(i.id + " both");
  if (a.oxygen.stated && (ox.value === "yes" || ox.value === "no") && a.oxygen.max > ox.max) diff.push(i.id + " oxygen max");
  if (a.pressure.stated && (pr.value === "yes" || pr.value === "no") && (a.pressure.min !== pr.min || a.pressure.max !== pr.max)) diff.push(i.id + " pressure range");
}
check(!diff.length, `per investigation, the counts agree with recount.js for all ${D.investigations.length}` + (diff.length ? ": " + diff.join(", ") : ""));
const pm = Ask.answer(Ask.scopeTests(T, a2), o2, p, Recount), byHand = T.filter(t => /pmma/i.test(String(t.fuel)));
check(pm.tests === byHand.length && pm.tests > 0, `tests whose fuel cell contains PMMA: ${pm.tests} (same as a plain text search)`);

// ---- evidence reach
const fake = [], want = ["PSI-159", "PSI-25", "PSI-62"];
want.forEach(id => fake.push({ i: P.passages.findIndex(x => x.kind === "record" && x.inv === id) }));
const r = Ask.reach(fake, P.passages, rk);
check(r.invs.length === 3 && r.yes === 1 && r.rowsIn === S.rows_in_zone && r.yes + r.no + r.unknown === 3 && r.invs[2].value === "no table",
  `reach for CFI-G, BASS-II and a ground model: 1 with a test in Moon Base air (${r.rowsIn} of ${r.rowsOf} tests), ${r.unknown} that cannot be placed`);

// ---- glossary
const text = P.passages.map(x => x.text.toLowerCase()).join("\n"), gone = [];
G.entries.forEach(e => e.nasa.forEach(t => { if (!text.includes(t.toLowerCase()) && !vocab[t.toLowerCase()]) gone.push(t); }));
check(!gone.length, `all glossary terms occur in NASA's text or tables` + (gone.length ? ": missing " + gone.join(", ") : ""));
check(JSON.stringify(P.glossary.entries) === JSON.stringify(G.entries), "the glossary in passages.json is the one in data/content (rebuild the index if not)");
check(!Ask.expand("What is a cool flame?", G.entries).length && Ask.expand("Does plexiglass burn?", G.entries)[0].nasa[0] === "PMMA", "glossary: nothing added to \"What is a cool flame?\"; plexiglass -> PMMA");

// ---- related investigations
const vec = new Int8Array(Buffer.from(P.vectors_int8_base64, "base64")), rel = Ask.relatedByMeaning(P.passages, vec, P.about.dims);
const same = Object.keys(rel).every(id => R.related[id] && R.related[id].map(x => x.id).join() === rel[id].slice(0, 3).map(x => x.id).join());
check(same && Object.keys(R.related).length === D.investigations.length, `related.json matches a fresh computation from passages.json for all ${D.investigations.length} investigations`);

// ---- the published score
check(JSON.stringify(E.site_settings) === JSON.stringify(Ask.SETTINGS), "ask_eval.json was scored with the settings the site uses: " + JSON.stringify(Ask.SETTINGS));
check(E.questions.length === Q.questions.length && E.questions.every((q, i) => q.q === Q.questions[i].q && q.expect.join() === Q.questions[i].expect.join()), `ask_eval.json covers the current ${Q.questions.length} test questions`);
check(P.about.model === Ask.SETTINGS.model && P.about.header === Ask.SETTINGS.header && !!Ask.MODELS[P.about.model] && P.about.pooling === Ask.MODELS[P.about.model].pooling && P.about.query_prefix === Ask.MODELS[P.about.model].queryPrefix,
  `the index was built with the model the site loads (${Ask.SETTINGS.model}), with its pooling and question prefix`);
const mdir = path.join(docs, "models", Ask.SETTINGS.model);
check(fs.existsSync(path.join(mdir, "onnx", "model_quantized.onnx")) && fs.existsSync(path.join(mdir, "tokenizer.json")), "that model is served with the site (docs/models/)");
const sizeOf = f => fs.statSync(f).size;
const served = ["onnx/model_quantized.onnx", "tokenizer.json", "tokenizer_config.json", "config.json"].reduce((a, f) => a + sizeOf(path.join(mdir, f)), 0) + fs.readdirSync(path.join(docs, "vendor")).reduce((a, f) => a + sizeOf(path.join(docs, "vendor", f)), 0);
check(P.about.download_mb === Math.round(served / 1e6), `the download size the page states (${P.about.download_mb} MB) is the size of the files served`);
const halves = h => Q.questions.filter(q => q.half === h);
check(halves("tuning").length + halves("held_out").length === Q.questions.length && Math.abs(halves("tuning").length - halves("held_out").length) <= 1 && Math.abs(halves("tuning").filter(q => q.everyday).length - halves("held_out").filter(q => q.everyday).length) <= 1 && Q.about.split && Q.about.split.seed != null,
  `the questions are split into a tuning half (${halves("tuning").length}) and a held-out half (${halves("held_out").length}), each with its share of everyday-word questions, seed recorded`);
check(E.questions.every((q, i) => q.half === Q.questions[i].half) && ["by_meaning", "by_words"].every(k => E.site[k].tuning.hit1 + E.site[k].held_out.hit1 === E.site[k].all.hit1 && E.site[k].tuning.hit3 + E.site[k].held_out.hit3 === E.site[k].all.hit3),
  "ask_eval.json uses that split, and its two halves add up to its totals");
const ix = Ask.index(P.passages);
let h1 = 0, h3 = 0;
Q.questions.forEach(q => {
  const top = Ask.rank(ix, P.passages, vec, P.about.dims, q.q, null, { extra: Ask.SETTINGS.glossary === "off" ? "" : terms(q.q) });
  const pos = top.findIndex(x => Ask.invsOf(P.passages[x.i]).some(id => q.expect.includes(id)));
  if (pos === 0) h1++;
  if (pos >= 0 && pos < 3) h3++;
});
const w = E.site.by_words.all;
check(w.hit1 === h1 && w.hit3 === h3, `word-matching score recomputed here: first ${h1}, first three ${h3} of ${Q.questions.length} (ask_eval.json says ${w.hit1} and ${w.hit3})`);

console.log(bad ? `\n${bad} check(s) failed.` : "\nAll checks passed.");
process.exit(bad ? 1 : 0);
