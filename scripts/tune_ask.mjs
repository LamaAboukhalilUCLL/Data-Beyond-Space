#!/usr/bin/env node
/*
 * tune_ask.mjs - compares settings for "Ask NASA's records" on the tuning half of the
 * test questions, and reports each one's score on the held-out half beside it.
 *
 * What is compared, for every language model found in docs/models/:
 *   header   what is put in front of a passage before the model reads it (none, name, attrs)
 *   fusion   meaning only, meaning + 0.05, 0.1 or 0.2 x words (the models spread their
 *            similarities differently, so the same bonus weighs differently), or reciprocal
 *            rank fusion of the two
 *   title    the weight of a passage that is only a paper's title (0.9, 0.7, 0.5)
 *   group    passages ranked alone, or investigations ranked by their best two passages
 * The ranking itself is docs/ask.js, the code the site runs. Each model's display floor is
 * applied, except for "meaning only", which is scored with no floor: the floors are set for
 * meaning plus the word bonus and would cut it unfairly.
 *
 * The rule: a setting is chosen on the tuning half only (most questions right first, then
 * most in the first three, then the setting closest to the current one). The held-out
 * half is printed but never used to choose. Results go to data/eval/ask_tuning.json.
 *
 * Passages are embedded here once per model and header and kept in a cache folder
 * (data/eval/.cache, not committed), so a second run is quick.
 *
 * Needs once:   npm install
 * Run from the repo root, after build_dataset.py:   node scripts/tune_ask.mjs
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
const read = f => JSON.parse(fs.readFileSync(path.join(ROOT, f), "utf8"));
const P = read("docs/data/passages.json"), D = read("docs/data/dataset.json"), Q = read("data/content/ask_eval_questions.json");
const byId = {};
D.investigations.forEach(i => (byId[i.id] = i));
const CACHE = path.join(ROOT, "data", "eval", ".cache");
fs.mkdirSync(CACHE, { recursive: true });
if (Q.questions.some(q => !q.half)) { console.error("Run scripts/split_eval.mjs first."); process.exit(1); }

const HEADERS = ["none", "name", "attrs"];
const FUSIONS = [["meaning only", { fusion: "bonus", bonus: 0 }], ["bonus 0.05", { fusion: "bonus", bonus: 0.05 }], ["bonus 0.1", { fusion: "bonus", bonus: 0.1 }], ["bonus 0.2", { fusion: "bonus", bonus: 0.2 }], ["rrf", { fusion: "rrf", bonus: 0.2 }]];
const TITLES = [0.9, 0.7, 0.5], GROUPS = ["passage", "investigation"];
const models = Object.keys(Ask.MODELS).filter(m => fs.existsSync(path.join(ROOT, "docs", "models", m, "onnx", "model_quantized.onnx")));
const expansions = Q.questions.map(q => Ask.expansionText(Ask.expand(q.q, P.glossary.entries)));
const ix = Ask.index(P.passages);
const JUNK = ["How many astronauts were on board?", "best pizza recipe in Naples", "stock market prices today"];

function score(rows, half) {
  const r = half ? rows.filter(x => x.half === half) : rows, at = k => r.filter(x => x.pos != null && x.pos <= k).length;
  return { questions: r.length, hit1: at(1), hit3: at(3) };
}
const results = [], notes = {};
for (const model of models) {
  const M = Ask.MODELS[model], embed = await pipeline("feature-extraction", model, { dtype: "q8" });
  const vecOf = async (texts, batch = 32) => { const out = []; for (let i = 0; i < texts.length; i += batch) out.push(...(await embed(texts.slice(i, i + batch), { pooling: M.pooling, normalize: true })).tolist()); return out; };
  // questions one at a time, as the site embeds them; passages in batches, as build_search.mjs does
  const qv = await vecOf(Q.questions.map(q => M.queryPrefix + q.q), 1), junk = await vecOf(JUNK.map(q => M.queryPrefix + q), 1);
  for (const header of HEADERS) {
    const file = path.join(CACHE, model.replace(/\W+/g, "_") + "__" + header + ".bin");
    let bytes;
    if (fs.existsSync(file)) bytes = new Int8Array(fs.readFileSync(file).buffer.slice(0));
    else {
      process.stdout.write(`embedding ${P.passages.length} passages: ${model}, header ${header} ... `);
      const v = await vecOf(P.passages.map(p => Ask.embedText(p, byId, header))), dims = v[0].length;
      bytes = new Int8Array(v.length * dims);
      v.forEach((row, r) => row.forEach((x, c) => { bytes[r * dims + c] = Math.max(-127, Math.min(127, Math.round(x * 127))); }));   // stored as the site stores them
      fs.writeFileSync(file, Buffer.from(bytes.buffer));
      console.log("done");
    }
    const dims = bytes.length / P.passages.length;
    // how similar is the best passage for real questions, and for questions NASA's text cannot answer
    const best = v => Ask.scoreAll(ix, P.passages, bytes, dims, "", v, { bonus: 0, fusion: "bonus", title: 1 })[0].sem;
    notes[model + " | " + header] = { best_similarity_real_questions_median: +qv.map(best).sort((a, b) => a - b)[Math.floor(qv.length / 2)].toFixed(3), best_similarity_unrelated_questions: junk.map(v => +best(v).toFixed(3)) };
    for (const [fname, f] of FUSIONS) for (const title of TITLES) for (const group of GROUPS) {
      const rows = Q.questions.map((q, i) => {
        const top = Ask.rank(ix, P.passages, bytes, dims, q.q, qv[i], { ...f, title, group, extra: expansions[i], floor: f.bonus === 0 ? 0 : M.floor });
        const pos = top.findIndex(x => Ask.invsOf(P.passages[x.i]).some(id => q.expect.includes(id)));
        return { half: q.half, pos: pos < 0 ? null : pos + 1 };
      });
      results.push({ model, header, combine: fname, ...f, title, group, tuning: score(rows, "tuning"), held_out: score(rows, "held_out"), all: score(rows) });
    }
  }
}
// distance from the setting the site had before tuning, to break ties in favour of fewer changes
const changes = r => (r.header !== "none") + (r.combine !== "bonus 0.2") + (r.title !== 0.9) + (r.group !== "passage");
const order = (a, b) => b.tuning.hit1 - a.tuning.hit1 || b.tuning.hit3 - a.tuning.hit3 || changes(a) - changes(b);
const chosen = {};
for (const model of models) chosen[model] = results.filter(r => r.model === model).sort(order)[0];
const baseline = results.find(r => r.model === "Xenova/all-MiniLM-L6-v2" && r.header === "none" && r.combine === "bonus 0.2" && r.title === 0.9 && r.group === "passage");

fs.writeFileSync(path.join(ROOT, "data", "eval", "ask_tuning.json"), JSON.stringify({
  about: {
    what: "Every Ask setting tried, scored on the tuning half and on the held-out half of the test questions. A setting is chosen on the tuning half only.",
    rule: "Most tuning questions right first, then most in the first three, then the fewest changes from the earlier setting.",
    hit: "A question is a hit at 1 when the first passage shown comes from one of its investigations, at 3 when one of the first three does.",
    labelled_by: Q.about.labelled_by, checked_by: Q.about.checked_by, split: Q.about.split,
    glossary: "on the word match, for every setting", built_by: "scripts/tune_ask.mjs (written with AI assistance: Claude Code, Anthropic)",
  },
  before_tuning: baseline, chosen_per_model: chosen, similarity_notes: notes, results,
}, null, 1) + "\n");

const f = s => `${String(s.hit1).padStart(2)}/${String(s.hit3).padStart(2)}`;
const line = r => `${r.header.padEnd(5)} ${r.combine.padEnd(12)} title ${String(r.title).padEnd(3)} ${r.group.padEnd(13)}  tuning ${f(r.tuning)}   held-out ${f(r.held_out)}   all ${f(r.all)}`;
console.log("\nfirst / first three, of 20 tuning, 20 held-out, 40 in all");
for (const model of models) {
  console.log(`\n${model}`);
  for (const r of results.filter(x => x.model === model).sort(order)) console.log("  " + line(r));
}
console.log("\nBefore tuning (MiniLM, no header, bonus 0.2, title 0.9, passages):\n  " + line(baseline));
for (const model of models) console.log(`Chosen on the tuning half for ${model}:\n  ` + line(chosen[model]));
console.log("\nSimilarity of the best passage:"); for (const k of Object.keys(notes)) console.log("  " + k.padEnd(48) + JSON.stringify(notes[k]));
