#!/usr/bin/env node
/*
 * eval_ask.mjs - measures how often "Ask NASA's records" puts a right passage first.
 *
 * It reads the test questions in data/content/ask_eval_questions.json. Each has a list of
 * PSI investigations whose record or listed papers answer it. The questions are ranked
 * with docs/ask.js, the same code the site runs, against docs/data/passages.json, the
 * same index the site loads. A question is a hit at 1 when the first passage shown comes
 * from one of its investigations, and a hit at 3 when one of the first three does.
 *
 * The score of the settings the site uses (Ask.SETTINGS) is written to
 * docs/data/ask_eval.json and shown on the Data and method page. Other settings are
 * scored beside it, so that each choice (word bonus, glossary, stemming) can be checked.
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
const vec = new Int8Array(Buffer.from(P.vectors_int8_base64, "base64")), dims = P.about.dims;
const ids = new Set(P.passages.flatMap(p => Ask.invsOf(p)));
for (const q of Q.questions) for (const id of q.expect) if (!ids.has(id)) { console.error(`Unknown investigation ${id} in "${q.q}"`); process.exit(1); }

const embed = await pipeline("feature-extraction", P.about.model, { dtype: "q8" });
async function vectors(texts) { return (await embed(texts, { pooling: "mean", normalize: true })).tolist(); }
const expansions = Q.questions.map(q => Ask.expansionText(Ask.expand(q.q, P.glossary.entries)));
const plainVec = await vectors(Q.questions.map(q => q.q));
const expandedVec = await vectors(Q.questions.map((q, i) => expansions[i] ? q.q + " " + expansions[i] : q.q));

// One run: every question ranked with one group of settings. `meaning` false = word matching only.
function run(s, meaning) {
  const site = { ...Ask.SETTINGS };
  Ask.SETTINGS.stem = s.stem;                       // the stem is used when the index is built
  const ix = Ask.index(P.passages);
  const rows = Q.questions.map((q, i) => {
    const extra = s.glossary === "off" ? "" : expansions[i];
    const qvec = meaning ? (s.glossary === "both" ? expandedVec[i] : plainVec[i]) : null;
    const top = Ask.rank(ix, P.passages, vec, dims, q.q, qvec, { bonus: s.bonus, extra });
    const pos = top.findIndex(x => Ask.invsOf(P.passages[x.i]).some(id => q.expect.includes(id)));
    return { q: q.q, everyday: !!q.everyday, first_right: pos < 0 ? null : pos + 1, shown: top.length };
  });
  Object.assign(Ask.SETTINGS, site);
  return rows;
}
function score(rows) {
  const n = rows.length, at = k => rows.filter(r => r.first_right != null && r.first_right <= k).length;
  return { questions: n, hit1: at(1), hit3: at(3), hit1_share: Math.round(at(1) / n * 1000) / 1000, hit3_share: Math.round(at(3) / n * 1000) / 1000 };
}
const everyday = rows => rows.filter(r => r.everyday), other = rows => rows.filter(r => !r.everyday);

const S = Ask.SETTINGS;
const siteMeaning = run(S, true), siteWords = run(S, false);

const compare = [];
function add(label, s, meaning) {
  const rows = run(s, meaning);
  compare.push({ setting: label, matching: meaning ? "meaning" : "words", ...s, all: score(rows), everyday_words: score(everyday(rows)), other: score(other(rows)) });
}
for (const stem of ["v1", "plural-e"]) {
  for (const glossary of ["off", "words"]) add(`words only, stem ${stem}, glossary ${glossary}`, { bonus: 0, glossary, stem }, false);
}
for (const stem of ["v1", "plural-e"]) for (const bonus of [0, 0.1, 0.2, 0.3, 0.5, 1]) for (const glossary of ["off", "words", "both"]) {
  add(`meaning, word bonus ${bonus}, stem ${stem}, glossary ${glossary}`, { bonus, glossary, stem }, true);
}

const out = {
  about: {
    what: "How often the Ask page shows a passage from a right investigation first (hit at 1) or among the first three (hit at 3), for a fixed list of test questions.",
    questions_file: "data/content/ask_eval_questions.json",
    labelled_by: Q.about.labelled_by,
    checked_by: Q.about.checked_by,
    same_code_as_site: "docs/ask.js and docs/data/passages.json",
    caution: "The same questions were used to choose the site's settings, so the score is on the generous side.",
    built_by: "scripts/eval_ask.mjs (written with AI assistance: Claude Code, Anthropic)",
  },
  site_settings: { ...S },
  site: {
    by_meaning: { all: score(siteMeaning), everyday_words: score(everyday(siteMeaning)), other: score(other(siteMeaning)) },
    by_words: { all: score(siteWords), everyday_words: score(everyday(siteWords)), other: score(other(siteWords)) },
  },
  questions: Q.questions.map((q, i) => ({ q: q.q, expect: q.expect, everyday: !!q.everyday, also_searched: expansions[i] || null, first_right_by_meaning: siteMeaning[i].first_right, first_right_by_words: siteWords[i].first_right })),
  compared_settings: compare,
};
fs.writeFileSync(path.join(ROOT, "docs", "data", "ask_eval.json"), JSON.stringify(out, null, 1) + "\n");

const f = s => `hit@1 ${s.hit1}/${s.questions} (${s.hit1_share.toFixed(3)})  hit@3 ${s.hit3}/${s.questions} (${s.hit3_share.toFixed(3)})`;
console.log(`Site settings ${JSON.stringify(S)}`);
console.log(`  by meaning: ${f(out.site.by_meaning.all)}`);
console.log(`  by words:   ${f(out.site.by_words.all)}`);
console.log("\nAll settings (all questions | the everyday-word questions | the others):");
for (const c of compare) console.log(`  ${c.setting.padEnd(58)} ${c.all.hit1}/${c.all.hit3} of ${c.all.questions} | ${c.everyday_words.hit1}/${c.everyday_words.hit3} of ${c.everyday_words.questions} | ${c.other.hit1}/${c.other.hit3} of ${c.other.questions}`);
const misses = out.questions.filter(q => q.first_right_by_meaning !== 1);
console.log(`\nNot first by meaning (${misses.length}):`);
for (const m of misses) console.log(`  ${m.first_right_by_meaning == null ? "none" : "at " + m.first_right_by_meaning}  ${m.q}`);
