#!/usr/bin/env node
/*
 * eval_ask.mjs - measures how often "Ask NASA's records" puts a right passage first.
 *
 * It reads the test questions in data/content/ask_eval_questions.json. Each has a list of
 * PSI investigations whose record or listed papers answer it, and belongs to the tuning
 * half or the held-out half (scripts/split_eval.mjs). The questions are ranked with
 * docs/ask.js, the same code the site runs, against docs/data/passages.json, the same
 * index the site loads, with the settings and the language model the site uses
 * (Ask.SETTINGS). A question is a hit at 1 when the first passage shown comes from one of
 * its investigations, and a hit at 3 when one of the first three does.
 *
 * Settings were chosen on the tuning half only (scripts/tune_ask.mjs), so the held-out
 * half is the honest score. Both, and the total, are written to docs/data/ask_eval.json
 * and shown on the Data and method page. If data/eval/ask_tuning.json exists, the score
 * of the other language model that was tried is copied beside them.
 *
 * Needs once:   npm install
 * Run from the repo root, after build_search.mjs:   node scripts/eval_ask.mjs
 *
 * Written with AI assistance (Claude Code, Anthropic).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { pipeline, env } from "@huggingface/transformers";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const Ask = createRequire(import.meta.url)("../docs/ask.js");
env.allowRemoteModels = false;
env.localModelPath = path.join(ROOT, "docs", "models") + path.sep;

const P = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "data", "passages.json"), "utf8"));
const Q = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "content", "ask_eval_questions.json"), "utf8"));
const S = Ask.SETTINGS, M = Ask.MODELS[S.model];
if (P.about.model !== S.model || P.about.header !== S.header) { console.error("passages.json was built with another model or header than docs/ask.js names. Run scripts/build_search.mjs first."); process.exit(1); }
if (Q.questions.some(q => !q.half)) { console.error("Run scripts/split_eval.mjs first."); process.exit(1); }
const vec = new Int8Array(Buffer.from(P.vectors_int8_base64, "base64")), dims = P.about.dims;
const ids = new Set(P.passages.flatMap(p => Ask.invsOf(p)));
for (const q of Q.questions) for (const id of q.expect) if (!ids.has(id)) { console.error(`Unknown investigation ${id} in "${q.q}"`); process.exit(1); }

const embed = await pipeline("feature-extraction", S.model, { dtype: "q8" });
// one question at a time, with the model's question prefix: exactly what the page does
const qvecs = [];
for (const q of Q.questions) qvecs.push((await embed([M.queryPrefix + q.q], { pooling: M.pooling, normalize: true })).tolist()[0]);
const expansions = Q.questions.map(q => Ask.expansionText(Ask.expand(q.q, P.glossary.entries)));
const ix = Ask.index(P.passages);

function run(meaning, opt) {
  return Q.questions.map((q, i) => {
    const extra = S.glossary === "off" || (opt && opt.noGlossary) ? "" : expansions[i];
    const top = Ask.rank(ix, P.passages, vec, dims, q.q, meaning ? qvecs[i] : null, { extra, ...(opt && opt.rank) });
    const pos = top.findIndex(x => Ask.invsOf(P.passages[x.i]).some(id => q.expect.includes(id)));
    return { half: q.half, everyday: !!q.everyday, first_right: pos < 0 ? null : pos + 1 };
  });
}
function score(rows) {
  const n = rows.length, at = k => rows.filter(r => r.first_right != null && r.first_right <= k).length;
  return { questions: n, hit1: at(1), hit3: at(3), hit1_share: Math.round(at(1) / n * 1000) / 1000, hit3_share: Math.round(at(3) / n * 1000) / 1000 };
}
const parts = rows => ({ all: score(rows), held_out: score(rows.filter(r => r.half === "held_out")), tuning: score(rows.filter(r => r.half === "tuning")), everyday_words: score(rows.filter(r => r.everyday)), other: score(rows.filter(r => !r.everyday)) });

const byMeaning = run(true), byWords = run(false), noList = run(true, { noGlossary: true }), alone = run(true, { rank: { bonus: 0, fusion: "bonus", floor: 0 } });   // no display floor: it is set for meaning plus the bonus

// the other model that was tried, from the tuning run (same questions, same halves, same code)
let other = null;
const tuningFile = path.join(ROOT, "data", "eval", "ask_tuning.json");
if (fs.existsSync(tuningFile)) {
  const T = JSON.parse(fs.readFileSync(tuningFile, "utf8"));
  const pick = (model, combine) => T.results.find(r => r.model === model && r.header === S.header && r.combine === combine && r.title === S.title && r.group === S.group);
  const name = Object.keys(T.chosen_per_model).find(m => m !== S.model);
  const a = name && pick(name, "bonus " + S.bonus), b = name && pick(name, "meaning only");
  if (a && b && JSON.stringify(T.about.split) === JSON.stringify(Q.about.split)) {
    const shape = r => ({ all: r.all, held_out: r.held_out, tuning: r.tuning });
    other = { model: name, from: "data/eval/ask_tuning.json", with_bonus: shape(a), meaning_alone: shape(b) };
  }
}

const out = {
  about: {
    what: "How often the Ask page shows a passage from a right investigation first (hit at 1) or among the first three (hit at 3), for a fixed list of test questions.",
    questions_file: "data/content/ask_eval_questions.json",
    labelled_by: Q.about.labelled_by,
    checked_by: Q.about.checked_by,
    split: Q.about.split,
    same_code_as_site: "docs/ask.js and docs/data/passages.json",
    caution: "All the questions were written by the same AI that built the page, and an earlier setting (the word bonus) was chosen on all of them before they were split. So even the held-out score is on the generous side, and with 20 questions in a half one question is 5 points.",
    built_by: "scripts/eval_ask.mjs (written with AI assistance: Claude Code, Anthropic)",
  },
  site_settings: { ...S },
  site: { by_meaning: parts(byMeaning), by_meaning_alone: parts(alone), by_words: parts(byWords), by_meaning_without_word_list: parts(noList) },
  other_model: other,
  questions: Q.questions.map((q, i) => ({ q: q.q, expect: q.expect, half: q.half, everyday: !!q.everyday, also_searched: expansions[i] || null, first_right_by_meaning: byMeaning[i].first_right, first_right_by_words: byWords[i].first_right })),
};
fs.writeFileSync(path.join(ROOT, "docs", "data", "ask_eval.json"), JSON.stringify(out, null, 1) + "\n");

const f = s => `first ${s.hit1}/${s.questions}, first three ${s.hit3}/${s.questions}`;
console.log(`Site settings ${JSON.stringify(S)}`);
for (const [name, x] of [["by meaning + word bonus", out.site.by_meaning], ["by meaning alone", out.site.by_meaning_alone], ["by words (no model)", out.site.by_words]]) {
  console.log(`  ${name.padEnd(24)} held-out: ${f(x.held_out)}   all: ${f(x.all)}`);
}
if (other) console.log(`  other model ${other.model}: with bonus, held-out ${f(other.with_bonus.held_out)}, all ${f(other.with_bonus.all)}; alone, held-out ${f(other.meaning_alone.held_out)}, all ${f(other.meaning_alone.all)}`);
const misses = out.questions.filter(q => q.first_right_by_meaning !== 1);
console.log(`\nNot first by meaning (${misses.length}):`);
for (const m of misses) console.log(`  ${(m.first_right_by_meaning == null ? "none" : "at " + m.first_right_by_meaning).padEnd(5)} ${m.half.padEnd(9)} ${m.q}`);
