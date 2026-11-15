#!/usr/bin/env node
/*
 * build_search.mjs - prepares "Ask the records".
 *
 * It cuts NASA's record text (objective, approach, hypothesis, research impacts
 * of the 24 investigations) and the paper abstracts and titles PSI lists into
 * short passages, and computes for each passage a vector that captures its
 * meaning, with the small open language model all-MiniLM-L6-v2 (22 MB, Apache-2.0).
 * The same model runs in the reader's browser to turn a question into a vector;
 * the passages whose vectors point the same way are the answer.
 *
 * The model only matches text. It writes nothing: every result shown is NASA's
 * or the paper authors' own words, with its source.
 *
 * Needs once:   npm install          (installs @huggingface/transformers)
 * Run from the repo root, after build_dataset.py:   node scripts/build_search.mjs
 * Writes: docs/data/passages.json
 *
 * Written with AI assistance (Claude Code, Anthropic).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline, env } from "@huggingface/transformers";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const MODEL = "Xenova/all-MiniLM-L6-v2";
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

const embed = await pipeline("feature-extraction", MODEL, { dtype: "q8" });
const vectors = [];
for (let i = 0; i < passages.length; i += 32) {
  const batch = passages.slice(i, i + 32).map(p => p.text);
  const out = await embed(batch, { pooling: "mean", normalize: true });
  vectors.push(...out.tolist());
  process.stdout.write(`\r  embedded ${Math.min(i + 32, passages.length)} of ${passages.length}`);
}
const dims = vectors[0].length;
// Each number is stored as one signed byte (x 127): small to download, and precise enough for ranking.
const bytes = new Int8Array(passages.length * dims);
vectors.forEach((v, r) => v.forEach((x, c) => { bytes[r * dims + c] = Math.max(-127, Math.min(127, Math.round(x * 127))); }));

const out = {
  about: {
    model: MODEL, model_license: "Apache-2.0", dims,
    what: "Passages from NASA PSI record text and from the abstracts and titles of the publications PSI lists (abstracts via OpenAlex).",
    records: D.investigations.length, papers: new Set(passages.filter(p => p.kind === "paper").map(p => p.doi)).size, papers_with_abstract: withAbstract,
    built_by: "scripts/build_search.mjs (written with AI assistance: Claude Code, Anthropic)",
  },
  passages,
  vectors_int8_base64: Buffer.from(bytes.buffer).toString("base64"),
};
fs.writeFileSync(path.join(ROOT, "docs", "data", "passages.json"), JSON.stringify(out));
const rec = passages.filter(p => p.kind === "record").length;
console.log(`\n${passages.length} passages (${rec} from NASA records, ${passages.length - rec} from ${out.about.papers} papers, ${withAbstract} with an abstract), ${dims} numbers each`);
