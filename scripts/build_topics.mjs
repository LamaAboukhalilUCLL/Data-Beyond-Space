#!/usr/bin/env node
/*
 * build_topics.mjs - what NASA has written about each of the six fire questions.
 *
 * Every passage in docs/data/passages.json (NASA's 24 PSI records, and the titles and
 * abstracts of the papers PSI lists) was read by a large language model (Claude, Anthropic)
 * and labelled with the questions it addresses, following the written guide in
 * data/content/question_topics.json. The labels are in data/content/topic_labels.json.
 *
 * This script does not trust them blindly. It stops if:
 *   - the passages changed since they were labelled (checksum of all passage texts),
 *   - a label points at a passage whose text is not the one that was labelled,
 *   - a label names a question that does not exist,
 *   - the words quoted to justify a label are not in the passage, word for word.
 * It then counts passages and distinct sources per question, and the overlaps that matter
 * for a Moon Base (solid materials in high-oxygen or low-pressure air, for example).
 *
 * Second job: a check of the Ask page's search against these labels. Each question is typed
 * into the page's own ranking (docs/ask.js, the model the site loads), by shared words, by
 * meaning alone, and both together as the page does, and the script counts how many of the
 * passages the page would show are labelled as addressing that question.
 *
 * Needs once: npm install. Run from the repo root after build_search.mjs: node scripts/build_topics.mjs
 * Writes docs/data/topics.json.
 * Written with AI assistance (Claude Code, Anthropic).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { pipeline, env } from "@huggingface/transformers";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const fail = m => { console.error("topics: " + m); process.exit(1); };
const P = read("docs/data/passages.json"), PS = P.passages, n = PS.length;
const T = read("data/content/question_topics.json"), L = read("data/content/topic_labels.json"), D = read("docs/data/dataset.json");
const IDS = D.questions.map(q => q.id);
if (Object.keys(T.topics).sort().join() !== [...IDS].sort().join()) fail("question_topics.json must cover exactly the six questions");

// ---- checks
const sha = (alg, s) => crypto.createHash(alg).update(s, "utf8").digest("hex");
if (sha("sha256", PS.map(p => p.text).join("\n")) !== L.texts_sha256) fail("the passages changed since they were labelled; label them again");
if (L.passages_read !== n) fail("the labels say " + L.passages_read + " passages were read, there are " + n);
const squeeze = s => s.replace(/\s+/g, " ").trim();
const lab = new Map();
for (const x of L.labels) {
  const p = PS[x.i];
  if (!p || sha("sha1", p.text).slice(0, 12) !== x.h) fail("label for passage " + x.i + " does not match its text");
  for (const [q, quote] of Object.entries(x.l)) {
    if (!IDS.includes(q)) fail("passage " + x.i + ": unknown question " + q);
    if (!squeeze(p.text).includes(squeeze(quote))) fail("passage " + x.i + ": quote not found word for word: " + quote);
  }
  lab.set(x.i, x.l);
}

// ---- counts per question
const src = p => p.kind === "record" ? "rec:" + p.inv : "doi:" + p.doi;
const invsOf = p => p.kind === "record" ? [p.inv] : (p.psi || []);
const has = (i, q) => !!(lab.get(i) || {})[q];
const topics = {};
for (const q of D.questions) {
  const idx = PS.map((p, i) => i).filter(i => has(i, q.id));
  const recs = idx.filter(i => PS[i].kind === "record"), paps = idx.filter(i => PS[i].kind === "paper");
  const invs = [...new Set(idx.flatMap(i => invsOf(PS[i])))].sort((a, b) => +a.split("-")[1] - +b.split("-")[1]);
  // examples: one passage per source, NASA's records first, then papers with an abstract, then titles
  const order = [...recs, ...paps.filter(i => PS[i].part === "abstract"), ...paps.filter(i => PS[i].part === "title")], seen = new Set(), ex = [];
  for (const i of order) { const s = src(PS[i]); if (seen.has(s)) continue; seen.add(s); ex.push(i); if (ex.length === 8) break; }
  topics[q.id] = {
    question: q.question, status: q.status, guide: T.topics[q.id].guide,
    passages: idx.length, record_passages: recs.length, paper_passages: paps.length,
    records: new Set(recs.map(i => PS[i].inv)).size, papers: new Set(paps.map(i => PS[i].doi)).size, investigations: invs,
    examples: ex.map(i => ({ i, quote: lab.get(i)[q.id] })),
  };
}
// the page shows examples without loading all passages: copy the passage and its source into each example
const card = i => { const p = PS[i]; return p.kind === "record" ? { kind: "record", inv: p.inv, field: p.field, text: p.text } : { kind: "paper", doi: p.doi, title: p.title, year: p.year, psi: p.psi, part: p.part, text: p.text }; };
for (const t of Object.values(topics)) t.examples = t.examples.map(e => ({ ...e, ...card(e.i) }));
const both = (a, b) => PS.map((p, i) => i).filter(i => has(i, a) && has(i, b));
const overlaps = [
  { id: "solids-in-moon-air", a: "materials", b: "tested", label: "Solid materials in high-oxygen or low-pressure air" },
  { id: "putout-in-moon-air", a: "put-out", b: "tested", label: "Putting fires out in high-oxygen or low-pressure air" },
  { id: "detect-in-moon-air", a: "detect", b: "tested", label: "Detecting fires in high-oxygen or low-pressure air" },
].map(o => { const idx = both(o.a, o.b); return { ...o, passages: idx.length, sources: new Set(idx.map(i => src(PS[i]))).size, examples: idx.map(i => ({ i, quotes: [lab.get(i)[o.a], lab.get(i)[o.b]], ...card(i) })) }; });

// ---- measuring the Ask page's search against the labels, with the page's own code (docs/ask.js)
const require = createRequire(import.meta.url);
const Ask = require(path.join(ROOT, "docs", "ask.js"));
if (P.about.model !== Ask.SETTINGS.model) fail("passages.json was built with " + P.about.model + " but the site loads " + Ask.SETTINGS.model);
const MS = Ask.MODELS[Ask.SETTINGS.model];
const bin = Buffer.from(P.vectors_int8_base64, "base64"), vec = new Int8Array(bin.buffer, bin.byteOffset, bin.length), dims = P.about.dims;
const ix = Ask.index(PS);
env.allowRemoteModels = false;
env.localModelPath = path.join(ROOT, "docs", "models") + path.sep;
const embed = await pipeline("feature-extraction", P.about.model, { dtype: "q8" });
const qv = [];
for (const q of D.questions) qv.push((await embed([MS.queryPrefix + q.question], { pooling: MS.pooling, normalize: true })).tolist()[0]);   // one at a time, as the page does
const MODES = ["words", "meaning", "both"];
function shown(qi, mode) {        // the passages the Ask page shows for this question (at most 8, at most 2 per source)
  const q = D.questions[qi].question, extra = Ask.expansionText(Ask.expand(q, P.glossary ? P.glossary.entries : []));
  if (mode === "words") return Ask.rank(ix, PS, vec, dims, q, null, { extra });
  if (mode === "meaning") return Ask.rank(ix, PS, vec, dims, q, qv[qi], { bonus: 0 });
  return Ask.rank(ix, PS, vec, dims, q, qv[qi], { extra });
}
const evaluation = { modes: MODES, model: P.about.model, per_question: {}, average: {} };
D.questions.forEach((q, qi) => {
  const r = { labelled: topics[q.id].passages, chance: topics[q.id].passages / n };
  for (const m of MODES) { const list = shown(qi, m); r[m] = { shown: list.length, hits: list.filter(x => has(x.i, q.id)).length }; }
  evaluation.per_question[q.id] = r;
});
for (const m of MODES) {
  const qs = IDS.filter(id => topics[id].passages >= 10);       // too few labelled passages make the figure meaningless
  const sh = qs.reduce((s, id) => s + evaluation.per_question[id][m].shown, 0), hi = qs.reduce((s, id) => s + evaluation.per_question[id][m].hits, 0);
  evaluation.average[m] = { questions: qs, shown: sh, hits: hi, share: sh ? hi / sh : 0 };
}

const out = {
  about: {
    what: "How many passages of NASA's PSI records and of the papers PSI lists address each fire question, labelled passage by passage by a large language model and checked by this script.",
    labelled_by: L.labelled_by, date: L.date, passages: n, record_passages: PS.filter(p => p.kind === "record").length, paper_passages: PS.filter(p => p.kind === "paper").length,
    labelled_passages: lab.size, unlabelled_passages: n - lab.size, rules: T.rules,
    built_by: "scripts/build_topics.mjs (written with AI assistance: Claude Code, Anthropic)",
  },
  topics, overlaps, evaluation,
};
fs.writeFileSync(path.join(ROOT, "docs", "data", "topics.json"), JSON.stringify(out));
console.log("Topics: " + lab.size + " of " + n + " passages address at least one question; every quote checked.");
for (const q of D.questions) { const t = topics[q.id], e = evaluation.per_question[q.id]; console.log("  " + q.id.padEnd(11) + String(t.passages).padStart(4) + " passages, " + t.records + " records, " + t.papers + " papers | shown and right: words " + e.words.hits + "/" + e.words.shown + ", meaning " + e.meaning.hits + "/" + e.meaning.shown + ", both " + e.both.hits + "/" + e.both.shown); }
console.log("  average share right (" + evaluation.average.both.questions.length + " questions): words " + evaluation.average.words.share.toFixed(2) + ", meaning " + evaluation.average.meaning.share.toFixed(2) + ", both " + evaluation.average.both.share.toFixed(2));
overlaps.forEach(o => console.log("  " + o.label + ": " + o.passages + " passages from " + o.sources + " sources"));
