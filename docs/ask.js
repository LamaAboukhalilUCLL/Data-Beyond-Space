/*
 * ask.js - the logic behind "Ask NASA's records". No page code in here, so the same
 * functions run in the reader's browser (docs/app.js) and in the scripts that test and
 * score them (scripts/check_ask.cjs, scripts/eval_ask.mjs).
 *
 *   rank      the closest passages to a question, by shared words and, when the caller
 *             supplies a question vector from the language model, by meaning;
 *   moon      does the question name the Moon, Mars or partial gravity? Same pattern as
 *             the build uses to count PSI records that mention them;
 *   expand    everyday words in the question -> the terms NASA's text uses (a fixed list);
 *   intent    is the question about conditions or counts, and about which tests?
 *   answer    numbers for those tests, counted from NASA's tables with recount.js;
 *   reach     how many of the investigations behind a set of passages have a test in
 *             the chosen atmosphere.
 *
 * Nothing here writes text or estimates anything: every function returns passages,
 * matches or counts.
 *
 * Written with AI assistance (Claude Code, Anthropic).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Ask = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // The settings the site uses. scripts/eval_ask.mjs scores exactly these; scripts/tune_ask.mjs compares
  // them with others on the tuning half of the test questions.
  //   bonus     how much of the shared-word score is added to the meaning score (0 = meaning only)
  //   fusion    "bonus": meaning + bonus x words.  "rrf": reciprocal rank fusion of the two rankings
  //   title     weight of a passage that is only a paper's title
  //   group     "passage": best passages first.  "investigation": investigations ordered by their
  //             best two passages, each followed by those passages
  //   header    what is put in front of a passage before the model reads it (see embedText)
  //   glossary  where the glossary terms are added: "off", "words" (word matching only) or "both"
  //   stem      "plural-e" also drops a final e, so "flames" and "flame" meet; "v1" is the earlier rule
  //   model     the language model, one of MODELS
  var SETTINGS = { bonus: 0.2, fusion: "bonus", title: 0.9, group: "passage", header: "none", glossary: "words", stem: "plural-e", model: "Snowflake/snowflake-arctic-embed-s" };
  // How each model wants its text: how token vectors are pooled, what a question is prefixed with
  // (passages get no prefix), and the score below which a passage is not shown. The models spread
  // their similarities differently, so each has its own floor: 0.65 for arctic lies below the first
  // right passage of every tuning question and above the best passage of most unrelated questions.
  var MODELS = {
    "Xenova/all-MiniLM-L6-v2": { pooling: "mean", queryPrefix: "", floor: 0.3 },
    "Snowflake/snowflake-arctic-embed-s": { pooling: "cls", queryPrefix: "Represent this sentence for searching relevant passages: ", floor: 0.65 }
  };

  var STOP = {};
  "a an and are as at be been but by can did do does for from had has have how if in into is it its of on or that the their them there these this to was were what when where which while who why will with would than then so not no about over under more most much many any some such also only other out up down very".split(" ").forEach(function (w) { STOP[w] = 1; });

  // A light stem, so that fire / fires, flame / flames, burn / burned / burning meet.
  function stem(w) {
    if (SETTINGS.stem === "v1") return w.length > 4 ? w.replace(/(ies)$/, "y").replace(/(ing|ed|es|s)$/, "") : w;
    if (w.length <= 3) return w;
    w = w.replace(/ies$/, "y").replace(/(ing|ed|es|s)$/, "");
    return SETTINGS.stem === "plural-e" && w.length > 3 ? w.replace(/e$/, "") : w;
  }
  function words(text) {
    return (String(text).toLowerCase().match(/[a-z0-9]+/g) || []).filter(function (w) { return w.length > 1 && !STOP[w]; }).map(stem);
  }

  // ------------------------------------------------------------------ ranking
  function index(passages) {
    var df = {}, toks = passages.map(function (p) {
      var t = words(p.text), seen = {};
      t.forEach(function (w) { if (!seen[w]) { seen[w] = 1; df[w] = (df[w] || 0) + 1; } });
      return t;
    }), idf = {};
    Object.keys(df).forEach(function (w) { idf[w] = Math.log(1 + (passages.length - df[w] + 0.5) / (df[w] + 0.5)); });
    return { toks: toks, idf: idf };
  }
  // Every passage scored, best first. `qvec` is the question's vector from the language model, or null.
  // opt overrides SETTINGS (bonus, fusion, title); opt.extra: glossary terms for the word match.
  function scoreAll(ix, passages, vec, dims, q, qvec, opt) {
    opt = opt || {};
    var bonus = opt.bonus == null ? SETTINGS.bonus : opt.bonus, fusion = opt.fusion || SETTINGS.fusion, title = opt.title == null ? SETTINGS.title : opt.title;
    var qt = words(q + (opt.extra ? " " + opt.extra : "")), n = passages.length, out = [], avg = 28, seenQ = {};
    qt = qt.filter(function (w) { if (seenQ[w]) return false; seenQ[w] = 1; return true; });
    for (var i = 0; i < n; i++) {
      var toks = ix.toks[i], tf = {}, kw = 0;
      for (var k = 0; k < toks.length; k++) tf[toks[k]] = (tf[toks[k]] || 0) + 1;
      for (var j = 0; j < qt.length; j++) { var w = qt[j]; if (tf[w]) kw += ix.idf[w] * tf[w] * 2.2 / (tf[w] + 1.2 * (0.25 + 0.75 * toks.length / avg)); }
      var sem = 0;
      if (qvec) { var o = i * dims; for (var d = 0; d < dims; d++) sem += qvec[d] * vec[o + d]; sem /= 127; }
      out.push({ i: i, kw: kw, sem: sem });
    }
    var maxKw = 0;
    out.forEach(function (x) { if (x.kw > maxKw) maxKw = x.kw; });
    maxKw = maxKw || 1;
    function weight(x) { var p = passages[x.i]; return p.kind === "paper" && p.part === "title" ? (qvec ? title : 0.9) : 1; }   // a title says less than a sentence
    // `rel` decides whether a passage is shown at all; `score` decides the order
    out.forEach(function (x) { x.score = (qvec ? x.sem + bonus * x.kw / maxKw : x.kw / maxKw) * weight(x); x.rel = x.score; });
    if (qvec && fusion === "rrf") {
      var K = 60, bySem = out.slice().sort(function (a, b) { return b.sem - a.sem || a.i - b.i; }), byKw = out.filter(function (x) { return x.kw > 0; }).sort(function (a, b) { return b.kw - a.kw || a.i - b.i; });
      out.forEach(function (x) { x.score = 0; });
      bySem.forEach(function (x, r) { x.score += 1 / (K + r + 1); });
      byKw.forEach(function (x, r) { x.score += 1 / (K + r + 1); });
      out.forEach(function (x) { x.score *= weight(x); });
    }
    out.sort(function (a, b) { return b.score - a.score || a.i - b.i; });
    return out;
  }
  // The passages shown: at most eight, at most two from one record or paper, none below a floor.
  function rank(ix, passages, vec, dims, q, qvec, opt) {
    opt = opt || {};
    var out = scoreAll(ix, passages, vec, dims, q, qvec, opt), group = qvec ? (opt.group || SETTINGS.group) : "passage";
    var floor = qvec ? (opt.floor == null ? MODELS[SETTINGS.model].floor : opt.floor) : 0.2;
    out = out.filter(function (x) { return x.rel >= floor; });
    if (group === "investigation") out = byInvestigation(out, passages);
    var seen = {}, top = [];
    for (var j = 0; j < out.length && top.length < 8; j++) {
      var x = out[j], p = passages[x.i], key = p.kind === "record" ? p.inv : p.doi;
      seen[key] = (seen[key] || 0) + 1;
      if (seen[key] <= 2) top.push(x);
    }
    return top;
  }
  // Reorders scored passages: investigations by (best passage + half of the second best), each
  // followed by its two best passages. A paper counts for every investigation PSI lists it under.
  function byInvestigation(out, passages) {
    var best = {}, ids = [];
    out.forEach(function (x) {
      invsOf(passages[x.i]).forEach(function (id) {
        if (!best[id]) { best[id] = []; ids.push(id); }
        if (best[id].length < 2) best[id].push(x);
      });
    });
    function val(id) { var b = best[id]; return b[0].score + (b[1] ? 0.5 * b[1].score : 0); }
    ids.sort(function (a, b) { return val(b) - val(a) || (a < b ? -1 : 1); });
    var done = {}, res = [];
    ids.forEach(function (id) { best[id].forEach(function (x) { if (!done[x.i]) { done[x.i] = 1; res.push(x); } }); });
    out.forEach(function (x) { if (!done[x.i]) { done[x.i] = 1; res.push(x); } });
    return res;
  }
  // The text the language model reads for a passage. The page always shows NASA's text as it is;
  // a header only tells the model where the passage comes from.
  //   "none"   the passage alone
  //   "name"   investigation name, what burns, and the field (or the paper's title)
  //   "attrs"  the same, plus the sample or burner from the checked attributes
  var FIELD_NAME = { objective: "Objective", approach: "Approach", hypothesis: "Hypothesis", researchImpacts: "Research impacts" };
  function embedText(p, byId, header) {
    header = header || SETTINGS.header;
    if (header === "none") return p.text;
    function about(id) {
      var i = byId[id], s = i.name + " (" + i.cls_label;
      if (header === "attrs" && i.attributes && i.attributes.sample && i.attributes.sample.text) s += "; " + i.attributes.sample.text;
      return s + ")";
    }
    if (p.kind === "record") return about(p.inv) + ". " + FIELD_NAME[p.field] + ": " + p.text;
    var names = p.psi.map(function (id) { return p.psi.length === 1 ? about(id) : byId[id].name; }).join(", ");
    return names + ". " + (p.part === "title" ? "Paper: " + p.text : "Paper: " + p.title + ". " + p.text);
  }
  // The investigations a passage belongs to: its record, or the records PSI lists the paper under.
  function invsOf(p) { return p.kind === "record" ? [p.inv] : (p.psi || []); }

  // --------------------------------------------- Moon, Mars, partial gravity
  // The same pattern as scripts/build_dataset.py uses for `records_mentioning_moon_or_partial_gravity`
  // (scripts/check_ask.cjs fails if the two differ). "microgravity" and "reduced gravity" do not match.
  var MOON_PATTERN = "\\b(moon|lunar|mars|martian|partial[- ]gravity|partial[- ]g)\\b";
  function moon(q) {
    var m = new RegExp(MOON_PATTERN, "i").exec(String(q));
    return m ? m[1] : null;
  }

  // ------------------------------------------------------- everyday words
  // glossary: [{ say: ["plastic", ...], nasa: ["PMMA", ...] }]. Returns the entries whose everyday
  // word is in the question, each with the NASA terms the question does not already contain.
  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\\/-]/g, "\\$&"); }
  function expand(q, glossary) {
    var s = String(q).toLowerCase(), out = [], have = {};
    (glossary || []).forEach(function (g) {
      var said = null;
      g.say.forEach(function (w) { if (!said && new RegExp("(^|[^a-z0-9])" + esc(w.toLowerCase()) + "(s|es)?(?![a-z0-9])").test(s)) said = w; });
      if (!said) return;
      var add = g.nasa.filter(function (t) { var k = t.toLowerCase(); if (have[k] || s.indexOf(k) >= 0) return false; have[k] = 1; return true; });
      if (add.length) out.push({ said: said, nasa: add });
    });
    return out;
  }
  function expansionText(ex) { return ex.map(function (e) { return e.nasa.join(" "); }).join(" "); }

  // ------------------------------------------------------ number questions
  // Words in NASA's fuel and material cells that describe shape, size or handling, not what burns.
  var NOT_A_FUEL = {};
  ("cm mm thick wide clear black rod sphere slab wake micron film with balance sided natural iii pure ign blend same conditions as flat in to mixture including pyrometry calibration calibrations spherical section sheet opposed oppsed arizona road fine combination iss create an aerosol for measurement purposes and fan test tests where the fuel bottle was not emptied contrast most days ide blac moved igniter top side flow soot cleaning japan atmosphere he iso ard").split(" ").forEach(function (w) { NOT_A_FUEL[w] = 1; });
  function fuelTokens(cell) {
    return (String(cell == null ? "" : cell).toLowerCase().match(/[a-z][a-z0-9]+/g) || []).filter(function (w) { return !NOT_A_FUEL[w]; });
  }
  function fuelVocabulary(tests) {
    var v = {};
    tests.forEach(function (t) { fuelTokens(t.fuel).forEach(function (w) { v[w] = 1; }); });
    return v;
  }
  var ORDINARY = { same: 1, slice: 1, spice: 1, flex: 1 };          // acronyms that are also English words: capitals needed
  var FAMILIES = ["saffire", "acme", "bass", "daft"];
  function namedInvestigations(q, investigations) {
    var found = [];
    investigations.forEach(function (i) {
      if (!i.acronym) return;
      i.acronym.split(" / ").forEach(function (a) {
        var re = new RegExp("(^|[^A-Za-z0-9-])" + esc(a) + "(?![A-Za-z0-9-])", ORDINARY[a.toLowerCase()] ? "" : "i");
        if (re.test(q) && found.indexOf(i.id) < 0) found.push(i.id);
      });
    });
    if (found.length) return found;
    FAMILIES.forEach(function (f) {
      if (!new RegExp("\\b" + f + "\\b", "i").test(q)) return;
      investigations.forEach(function (i) { if (i.acronym && new RegExp("\\b" + f + "\\b", "i").test(i.acronym) && found.indexOf(i.id) < 0) found.push(i.id); });
    });
    return found;
  }
  var CLASS_WORDS = [
    ["solid", /\b(solids?|solid (fuels?|materials?)|cabin materials?)\b/],
    ["droplet", /\b(droplets?|liquid fuels?)\b/],
    ["gas", /\b(gas flames?|gaseous fuels?)\b/],
    ["smoke", /\bsmoke\b/]
  ];
  // What a question asks of the tables. `extra` is the glossary's NASA terms for this question.
  // Returns null when the question is not about conditions or counts.
  function intent(q, investigations, vocab, extra) {
    var s = String(q).toLowerCase();
    var cond = /\b(oxygen|o2|pressure|psia?|atmospheres?|moon base air)\b/.test(s);
    var count = /\b(how many|how much|number of|count of|which (experiments?|investigations?|tests?|studies|study|materials?|fuels?)|list (of |the )?(experiments|investigations|tests))\b/.test(s);
    var total = count && /\b(tests?|experiments?|investigations?|studies)\b/.test(s) && /\b(in total|altogether|are there|does (nasa|psi) (have|hold|list))\b/.test(s);
    var invs = namedInvestigations(String(q), investigations);
    var cls = null;
    CLASS_WORDS.forEach(function (c) { if (!cls && c[1].test(s)) cls = c[0]; });
    var fuels = [], seen = {};
    fuelTokens(s + (extra ? " " + extra : "")).forEach(function (w) {
      var k = w.replace(/s$/, "");
      [w, k].forEach(function (x) { if (vocab[x] && !seen[x]) { seen[x] = 1; fuels.push(x); } });
    });
    if (cls === "smoke" && !count) cls = null;        // "smoke" alone is a topic, not a request to count
    var scoped = invs.length || cls || fuels.length;
    if (!(cond || (count && (scoped || total)))) return null;
    var mo = /(\d+(?:[.,]\d+)?)\s*(?:%|percent|per cent)/.exec(s), mp = /(\d+(?:[.,]\d+)?)\s*psia?\b/.exec(s);
    function n(m) { return m ? parseFloat(m[1].replace(",", ".")) : null; }
    var o2 = n(mo), p = n(mp);
    if (o2 != null && !(o2 >= 0 && o2 <= 100)) o2 = null;
    if (p != null && !(p > 0 && p <= 100)) p = null;
    return { invs: invs, cls: cls, fuels: fuels, o2: o2, p: p };
  }
  function scopeTests(tests, it) {
    return tests.filter(function (t) {
      if (it.invs.length && it.invs.indexOf(t.inv) < 0) return false;
      if (it.cls && t.cls !== it.cls) return false;
      if (it.fuels.length) {
        var ft = fuelTokens(t.fuel);
        if (!it.fuels.some(function (f) { return ft.indexOf(f) >= 0; })) return false;
      }
      return true;
    });
  }
  // Counts for a set of tests against one atmosphere. Oxygen and "both" come from recount.js;
  // pressure is counted here with the same rule (only cells NASA wrote as plain numbers).
  function answer(tests, o2, p, Recount) {
    var c = Recount.counts(tests, o2, p), per = {}, order = [], omin = null, omax = null;
    Object.keys(c.byCls).forEach(function (k) {
      var b = c.byCls[k];
      if (omin == null || b.min < omin) omin = b.min;
      if (omax == null || b.max > omax) omax = b.max;
    });
    var pn = 0, ple = 0, pmin = null, pmax = null;
    tests.forEach(function (t) {
      if (!per[t.inv]) { per[t.inv] = 0; order.push(t.inv); }
      per[t.inv]++;
      if (t.p_psi != null) {
        pn++;
        if (t.p_psi <= p) ple++;
        if (pmin == null || t.p_psi < pmin) pmin = t.p_psi;
        if (pmax == null || t.p_psi > pmax) pmax = t.p_psi;
      }
    });
    order.sort(function (a, b) { return per[b] - per[a] || (+a.split("-")[1]) - (+b.split("-")[1]); });
    return {
      tests: tests.length,
      invs: order.map(function (id) { return { id: id, tests: per[id] }; }),
      oxygen: { stated: c.plainO2, min: omin, max: omax, atOrAbove: c.o2AtOrAbove },
      pressure: { stated: pn, min: pmin, max: pmax, atOrBelow: ple },
      both: { stated: c.both, inAir: c.inZone, invs: c.invsInZone }
    };
  }

  // ------------------------------------------------------- evidence reach
  // `rk` maps an investigation id to its row from Recount.rank for the chosen atmosphere.
  // For the investigations behind `top`: which have a test in that atmosphere, which have none,
  // and which cannot be judged because their table does not state both conditions as numbers.
  function reach(top, passages, rk) {
    var ids = [], seen = {};
    top.forEach(function (x) { invsOf(passages[x.i]).forEach(function (id) { if (rk[id] && !seen[id]) { seen[id] = 1; ids.push(id); } }); });
    var out = { invs: [], yes: 0, no: 0, unknown: 0, rowsIn: 0, rowsOf: 0 };
    ids.forEach(function (id) {
      var b = rk[id].criteria.both, judged = b.value === "yes" || b.value === "no";
      var o = rk[id].criteria.oxygen, pr = rk[id].criteria.pressure;
      out.invs.push({
        id: id, value: b.value, rows: judged ? b.rows : null, of: judged ? b.of : null,
        oxygen: { value: o.value, max: o.max == null ? null : o.max }, pressure: { value: pr.value, min: pr.min == null ? null : pr.min }
      });
      if (b.value === "yes") out.yes++; else if (b.value === "no") out.no++; else out.unknown++;
      if (judged) { out.rowsIn += b.rows; out.rowsOf += b.of; }
    });
    return out;
  }

  // ------------------------------------------------ related investigations
  // One vector per investigation: the mean of the vectors of its own record passages (papers are
  // left out, because PSI lists one paper under several investigations). Returns, for each
  // investigation, the others ordered by cosine similarity.
  function relatedByMeaning(passages, vec, dims) {
    var sum = {}, ids = [];
    passages.forEach(function (p, i) {
      if (p.kind !== "record") return;
      if (!sum[p.inv]) { sum[p.inv] = new Float64Array(dims); ids.push(p.inv); }
      var v = sum[p.inv], o = i * dims;
      for (var d = 0; d < dims; d++) v[d] += vec[o + d];
    });
    return neighbours(ids, function (id) { return sum[id]; }, dims);
  }
  // The same, from shared words only (TF-IDF over the same record passages): the comparison.
  function relatedByWords(passages) {
    var tf = {}, df = {}, ids = [];
    passages.forEach(function (p) {
      if (p.kind !== "record") return;
      if (!tf[p.inv]) { tf[p.inv] = {}; ids.push(p.inv); }
      words(p.text).forEach(function (w) { tf[p.inv][w] = (tf[p.inv][w] || 0) + 1; });
    });
    ids.forEach(function (id) { Object.keys(tf[id]).forEach(function (w) { df[w] = (df[w] || 0) + 1; }); });
    var vocab = Object.keys(df), vecs = {};
    ids.forEach(function (id) {
      vecs[id] = vocab.map(function (w) { return tf[id][w] ? (1 + Math.log(tf[id][w])) * Math.log(ids.length / df[w]) : 0; });
    });
    return neighbours(ids, function (id) { return vecs[id]; }, vocab.length);
  }
  function neighbours(ids, get, dims) {
    var norm = {}, out = {};
    ids.forEach(function (id) { var v = get(id), s = 0; for (var d = 0; d < dims; d++) s += v[d] * v[d]; norm[id] = Math.sqrt(s) || 1; });
    ids.forEach(function (a) {
      out[a] = ids.filter(function (b) { return b !== a; }).map(function (b) {
        var x = get(a), y = get(b), s = 0;
        for (var d = 0; d < dims; d++) s += x[d] * y[d];
        return { id: b, sim: s / (norm[a] * norm[b]) };
      }).sort(function (p, q) { return q.sim - p.sim || (p.id < q.id ? -1 : 1); });
    });
    return out;
  }

  return {
    relatedByMeaning: relatedByMeaning, relatedByWords: relatedByWords,
    SETTINGS: SETTINGS, MODELS: MODELS, embedText: embedText, MOON_PATTERN: MOON_PATTERN,
    words: words, index: index, scoreAll: scoreAll, rank: rank, invsOf: invsOf,
    moon: moon, expand: expand, expansionText: expansionText,
    fuelVocabulary: fuelVocabulary, fuelTokens: fuelTokens, intent: intent, scopeTests: scopeTests, answer: answer,
    reach: reach
  };
});
