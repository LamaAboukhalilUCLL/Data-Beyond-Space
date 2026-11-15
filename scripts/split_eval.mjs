#!/usr/bin/env node
/*
 * split_eval.mjs - splits the Ask test questions into a tuning half and a held-out half.
 *
 * Settings of the Ask page (word bonus, headers, model, ...) are chosen on the tuning half
 * only. The held-out half is not looked at while choosing, so its score is the honest one.
 *
 * The split is random with a fixed seed, and stratified: the everyday-word questions and
 * the other questions are each shuffled and dealt alternately, so both halves get their
 * share. It is written into data/content/ask_eval_questions.json (`half` on every
 * question, the seed in `about`). Running it again gives the same split.
 *
 * Run from the repo root:   node scripts/split_eval.mjs
 *
 * Written with AI assistance (Claude Code, Anthropic).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data", "content", "ask_eval_questions.json");
const Q = JSON.parse(fs.readFileSync(FILE, "utf8"));
const SEED = 20261115;

function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rnd = mulberry32(SEED);
function shuffled(list) { const a = list.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

let turn = 0;
for (const group of [Q.questions.filter(q => q.everyday), Q.questions.filter(q => !q.everyday)]) {
  for (const q of shuffled(group)) q.half = turn++ % 2 === 0 ? "tuning" : "held_out";
}
Q.about.split = { seed: SEED, method: "mulberry32 shuffle of the everyday-word questions, then of the others, dealt alternately to the tuning and the held-out half", made_by: "scripts/split_eval.mjs" };
// one question per line, as the file was written by hand
fs.writeFileSync(FILE, "{\n  \"about\": " + JSON.stringify(Q.about, null, 2).replace(/\n/g, "\n  ") + ",\n  \"questions\": [\n" +
  Q.questions.map(q => "    " + JSON.stringify(q).replace(/^\{/, "{ ").replace(/\}$/, " }").replace(/","/g, '", "').replace(/":/g, '": ').replace(/,"/g, ', "')).join(",\n") + "\n  ]\n}\n");
const n = h => Q.questions.filter(q => q.half === h);
console.log(`tuning: ${n("tuning").length} questions (${n("tuning").filter(q => q.everyday).length} everyday-word); held-out: ${n("held_out").length} (${n("held_out").filter(q => q.everyday).length} everyday-word)`);
