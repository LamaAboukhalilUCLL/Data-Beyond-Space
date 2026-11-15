#!/usr/bin/env node
/*
 * build_search.mjs - prepares "Ask the records".
 *
 * It cuts NASA's record text (objective, approach, hypothesis, research impacts
 * of the 24 investigations) and the paper abstracts and titles PSI lists into
 * short passages, and computes for each passage a vector that captures its
 * meaning, with the small open language model named in docs/ask.js (SETTINGS.model:
 * snowflake-arctic-embed-s, Apache-2.0, served from docs/models/).
 * The same model runs in the reader's browser to turn a question into a vector;
 * the passages whose vectors point the same way are the answer.
 *
 * The model only matches text. It writes nothing: every result shown is NASA's
 * or the paper authors' own words, with its source.
 *
 * Needs once:   npm install          (installs @huggingface/transformers)
 * Run from the repo root, after build_dataset.py:   node scripts/build_search.mjs
 * Writes: docs/data/passages.json   passages, their vectors, and the checked glossary
 *         docs/data/related.json    for each investigation, the three closest by meaning
 *
 * The glossary (data/content/ask_glossary.json: everyday word -> NASA's term) is copied
 * into passages.json only after a check: every NASA term must occur in the passages or
 * in a fuel or material cell of NASA's tables. Otherwise this script stops.
 *
 * Written with AI assistance (Claude Code, Anthropic).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { pipeline, env } from "@huggingface/transformers";
const Ask = createRequire(import.meta.url)("../docs/ask.js");
const MODEL = Ask.SETTINGS.model, SPEC = Ask.MODELS[MODEL];     // the model the site uses, and how it wants its text

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

env.allowRemoteModels = false;                       // use the copy served with the site
env.localModelPath = path.join(ROOT, "docs", "models") + path.sep;

const D = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "data", "dataset.json"), "utf8"));
const papersFile = path.join(ROOT, "data", "papers", "papers.json");
const papers = fs.existsSync(papersFile) ? JSON.parse(fs.readFileSync(papersFile, "utf8")) : [];
const FIELDS = { objective: "Objective", approach: "Approach", hypothesis: "Hypothesis", researchImpacts: "Research impacts" };

// Sentences, grouped into passages of roughly two or three sentences.
function chunks(text, max = 340) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.split(/(?<=[.!?])\s+(?=[A-Z0-9("'“])/);
  const out = [];
  let cur = "";
  for (const s of sentences) {
    if (cur && (cur + " " + s).length > max) { out.push(cur); cur = s; }
    else cur = cur ? cur + " " + s : s;
  }
  if (cur) out.push(cur);
  return out;
}

const passages = [];
for (const inv of D.investigations) {
  for (const [field, label] of Object.entries(FIELDS)) {
    for (const text of chunks(inv.text[field] || "")) passages.push({ kind: "record", inv: inv.id, field, text });
  }
}
let withAbstract = 0;
for (const p of papers) {
  const ids = (p.psi_ids || []).filter(id => D.investigations.some(i => i.id === id));
  if (!ids.length) continue;
  const base = { kind: "paper", doi: p.doi, title: p.title || p.psi_title, year: p.year || null, venue: p.venue || null, psi: ids };
  if (!base.title) continue;
  passages.push({ ...base, part: "title", text: base.title });
  if (p.abstract) {
    withAbstract++;
    // the opening of an abstract is often a leftover label such as "Abstract" or "Summary"
    for (const text of chunks(p.abstract.replace(/^(Abstract|Summary)\s+/i, ""))) passages.push({ ...base, part: "abstract", text });
  }
}

// ---- the glossary: every NASA term must exist in the text or tables it points to
const G = JSON.parse(fs.readFileSync(path.join(ROOT, "data", "content", "ask_glossary.json"), "utf8"));
const TESTS = JSON.parse(fs.readFileSync(path.join(ROOT, "docs", "data", "tests.json"), "utf8"));
const allText = passages.map(p => p.text.toLowerCase()).join("\n"), vocab = Ask.fuelVocabulary(TESTS);
const missing = [];
for (const e of G.entries) for (const t of e.nasa) {
  if (!allText.includes(t.toLowerCase()) && !vocab[t.toLowerCase()]) missing.push(t);
}
if (missing.length) { console.error("Glossary terms not found in NASA's text or tables: " + missing.join(", ")); process.exit(1); }

const BY_ID = {};
D.investigations.forEach(i => (BY_ID[i.id] = i));
// what a reader's browser downloads, once, to match by meaning: the model, its tokenizer and the runtime
const size = f => fs.statSync(path.join(ROOT, "docs", f)).size;
const downloadBytes = ["onnx/model_quantized.onnx", "tokenizer.json", "tokenizer_config.json", "config.json"].reduce((a, f) => a + size("models/" + MODEL + "/" + f), 0) +
  fs.readdirSync(path.join(ROOT, "docs", "vendor")).reduce((a, f) => a + size("vendor/" + f), 0);

const embed = await pipeline("feature-extraction", MODEL, { dtype: "q8" });
const vectors = [];
for (let i = 0; i < passages.length; i += 32) {
  const batch = passages.slice(i, i + 32).map(p => Ask.embedText(p, BY_ID, Ask.SETTINGS.header));
  const out = await embed(batch, { pooling: SPEC.pooling, normalize: true });
  vectors.push(...out.tolist());
  process.stdout.write(`\r  embedded ${Math.min(i + 32, passages.length)} of ${passages.length}`);
}
const dims = vectors[0].length;
// Each number is stored as one signed byte (x 127): small to download, and precise enough for ranking.
const bytes = new Int8Array(passages.length * dims);
vectors.forEach((v, r) => v.forEach((x, c) => { bytes[r * dims + c] = Math.max(-127, Math.min(127, Math.round(x * 127))); }));

const out = {
  about: {
    model: MODEL, model_license: "Apache-2.0", dims, pooling: SPEC.pooling, query_prefix: SPEC.queryPrefix, header: Ask.SETTINGS.header,
    download_mb: Math.round(downloadBytes / 1e6),
    what: "Passages from NASA PSI record text and from the abstracts and titles of the publications PSI lists (abstracts via OpenAlex).",
    records: D.investigations.length, papers: new Set(passages.filter(p => p.kind === "paper").map(p => p.doi)).size, papers_with_abstract: withAbstract,
    built_by: "scripts/build_search.mjs (written with AI assistance: Claude Code, Anthropic)",
  },
  glossary: { drafted_by: G.about.drafted_by, checked_by: G.about.checked_by, entries: G.entries },
  passages,
  vectors_int8_base64: Buffer.from(bytes.buffer).toString("base64"),
};
fs.writeFileSync(path.join(ROOT, "docs", "data", "passages.json"), JSON.stringify(out));

// ---- related investigations, from the stored vectors (so anyone can recompute them from passages.json)
const rel = Ask.relatedByMeaning(passages, bytes, dims), related = {};
for (const id of Object.keys(rel)) related[id] = rel[id].slice(0, 3).map(x => ({ id: x.id, similarity: Math.round(x.sim * 1000) / 1000 }));
fs.writeFileSync(path.join(ROOT, "docs", "data", "related.json"), JSON.stringify({
  about: {
    what: "For each investigation, the three others whose PSI record text is closest in meaning: cosine similarity between the mean vectors of their record passages (objective, approach, hypothesis, research impacts).",
    model: MODEL, built_by: "scripts/build_search.mjs (written with AI assistance: Claude Code, Anthropic)",
  },
  related,
}, null, 1) + "\n");
const rec = passages.filter(p => p.kind === "record").length;
console.log(`\n${passages.length} passages (${rec} from NASA records, ${passages.length - rec} from ${out.about.papers} papers, ${withAbstract} with an abstract), ${dims} numbers each`);
