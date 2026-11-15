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
 * Second job: it measures the search on the site's Ask page against these labels. For each
 * question it types the question itself into the same three rankings the page uses (shared
 * words, meaning with the small model all-MiniLM-L6-v2, and both together) and counts how
 * many of the top results are labelled as addressing it.
 *
 * Needs once: npm install. Run from the repo root after build_search.mjs: node scripts/build_topics.mjs
 * Writes docs/data/topics.json.
 * Written with AI assistance (Claude Code, Anthropic).
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
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

// ---- measuring the Ask page's search against the labels
const STOP = new Set("a an and are as at be been but by can did do does for from had has have how if in into is it its of on or that the their them there these this to was were what when where which while who why will with would than then so not no about over under more most much many any some such also only other out up down very".split(" "));
const words = t => (t.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => w.length > 1 && !STOP.has(w)).map(w => w.length > 4 ? w.replace(/(ies)$/, "y").replace(/(ing|ed|es|s)$/, "") : w);
const toks = PS.map(p => words(p.text)), df = {};
toks.forEach(t => new Set(t).forEach(w => { df[w] = (df[w] || 0) + 1; }));
const idf = w => Math.log(1 + (n - df[w] + 0.5) / (df[w] + 0.5));
const bin = Buffer.from(P.vectors_int8_base64, "base64"), vec = new Int8Array(bin.buffer, bin.byteOffset, bin.length), dims = P.about.dims;
env.allowRemoteModels = false;
env.localModelPath = path.join(ROOT, "docs", "models") + path.sep;
const embed = await pipeline("feature-extraction", P.about.model, { dtype: "q8" });
const qv = (await embed(D.questions.map(q => q.question), { pooling: "mean", normalize: true })).tolist();
function rank(qi, mode) {          // the formula of askRank() in docs/app.js
  const qt = words(D.questions[qi].question), out = PS.map((p, i) => {
    const tf = {}; toks[i].forEach(w => { tf[w] = (tf[w] || 0) + 1; });
    let kw = 0; qt.forEach(w => { if (tf[w]) kw += idf(w) * tf[w] * 2.2 / (tf[w] + 1.2 * (0.25 + 0.75 * toks[i].length / 28)); });
    let sem = 0; for (let d = 0; d < dims; d++) sem += qv[qi][d] * vec[i * dims + d]; sem /= 127;
    return { i, kw, sem };
  });
  const maxKw = Math.max(...out.map(x => x.kw)) || 1;
  out.forEach(x => { x.s = mode === "words" ? x.kw / maxKw : mode === "meaning" ? x.sem : x.sem + 0.2 * x.kw / maxKw; if (PS[x.i].part === "title") x.s *= 0.9; });
  return out.sort((a, b) => b.s - a.s || a.i - b.i).map(x => x.i);
}
const MODES = ["words", "meaning", "both"], K = 10;
const evaluation = { k: K, modes: MODES, per_question: {}, average: {} };
D.questions.forEach((q, qi) => {
  const pos = topics[q.id].passages, r = { labelled: pos, chance_at_k: pos / n };
  for (const m of MODES) {
    const order = rank(qi, m), hitsK = order.slice(0, K).filter(i => has(i, q.id)).length, R = Math.max(1, pos), hitsR = order.slice(0, R).filter(i => has(i, q.id)).length;
    r[m] = { precision_at_k: hitsK / K, hits_at_k: hitsK, r_precision: pos ? hitsR / R : null };
  }
  evaluation.per_question[q.id] = r;
});
for (const m of MODES) {
  const qs = IDS.filter(id => topics[id].passages >= K);       // too few labelled passages make the figure meaningless
  evaluation.average[m] = { questions: qs, precision_at_k: qs.reduce((s, id) => s + evaluation.per_question[id][m].precision_at_k, 0) / qs.length };
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
for (const q of D.questions) { const t = topics[q.id], e = evaluation.per_question[q.id]; console.log("  " + q.id.padEnd(11) + String(t.passages).padStart(4) + " passages, " + t.records + " records, " + t.papers + " papers | top " + K + " right: words " + e.words.hits_at_k + ", meaning " + e.meaning.hits_at_k + ", both " + e.both.hits_at_k); }
overlaps.forEach(o => console.log("  " + o.label + ": " + o.passages + " passages from " + o.sources + " sources"));
