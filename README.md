# Flame in Freefall: Moon Base fire data coverage

**Team Data Beyond Space, NASA Space Apps Challenge 2026, challenge Flame in Freefall**

NASA is building a Moon Base whose habitats and pressurized rovers are expected to hold air with 30 % oxygen or more, at 10.2 psi or less. More oxygen makes materials burn more easily. This dashboard reads all 24 combustion investigations in NASA's PSI repository and shows, test by test, how much of that fire data was collected in Moon Base air, and where the data stops.

It shows coverage and gaps. It does not predict how fire behaves on the Moon.

## What the dashboard does

| View | What it shows |
|---|---|
| Overview | The problem in three steps (the air changes, fire gets easier, the data stops short), a route map from Earth to the Moon Base with how many investigations were run at each stop, then a tool: choose an atmosphere and see how much of NASA's fire data fits it |
| Explore | Every test against the chosen air: oxygen by what burns, oxygen against pressure, a finder for materials and tests with a filtered CSV download, a map of the 24 investigations placed by how close their NASA text is in meaning (hover, drag, open), which can also be coloured by the hardware each NASA record names, with a table of the investigations that share hardware |
| Habitat | The main tool. On a drawing of a habitat the reader sets the air and the material of four parts; each part shows whether that material passed NASA's flame test on Earth at that oxygen level (NASA White Sands, 2007, the one source outside PSI) and that no test in space confirms it. Gives a downloadable evidence report and a link to the same habitat. Six numbered spots open the fire-safety questions |
| Analysis | A statistical model of NASA's 274 FLEX droplet tests: what oxygen, pressure and extinguishing gases change in the burning rate, how the tests ended at each oxygen level, an estimator with its uncertainty and the real tests nearest to any condition, and the next test that would narrow the model's estimate most, with how far tests at one condition can go |
| Ranking | The 24 investigations ordered by how many of five conditions they meet for the chosen air, with the evidence for each. A second tab puts all 24 side by side: sample or burner, what was measured, use on Earth |
| Ask | Type a question; get the sentences from NASA's records and the listed papers that match it best, by meaning. Questions about oxygen, pressure or numbers also get counts from NASA's tables; every answer says how many of its investigations were tested in the chosen air; Moon, Mars and partial-gravity questions get a notice that PSI holds no such test. Quotations and counts only, nothing generated |
| Investigation pages | Each investigation in plain words, NASA's description word for word, what its table records, its publications, the three investigations closest in meaning (shown on the map), and a side-by-side comparison with any other |
| Open questions | Six fire-safety questions for a Moon Base, each marked open or partly answered, with NASA's own words and table rows as evidence, and a chart of how many of the 925 passages of NASA's records and listed papers address each question |
| Data and method | Downloads of the cleaned tables, the rules every number follows, how the Ask search scores, how NASA's text was sorted by question, how AI was used, and the references |

**Choose an atmosphere.** The Moon Base (30 % oxygen or more, 10.2 psi or less) is the default. The reader can switch to a spacesuit, to the three cabin atmospheres NASA names in PSI record PSI-20, or type their own oxygen and pressure. Counts, charts and the ranking are recounted in the browser. A link can carry the choice: `#/explore/pressure?atm=c34` or `#/rank?o2=28&p=9`.

Any mark on a chart opens the row of NASA's table it comes from.

## Run it

The site is static: plain HTML, CSS and JavaScript, no build step, no dependencies.

```
cd docs
python -m http.server 8000
```

Then open http://localhost:8000. It is published from the `docs/` folder with GitHub Pages.

## Rebuild the data

Python 3.9 or newer, standard library only.

```
python scripts/fetch_snapshot.py    # only if data/psi/raw/ is missing: downloads NASA's records and tables
python scripts/fetch_papers.py      # optional: titles, years and abstracts of the listed publications
python scripts/build_dataset.py     # snapshot -> docs/data/
python scripts/validate.py          # independent checks; fails loudly if anything is off
node scripts/check_recount.cjs      # the in-browser recount must equal the build, number for number
python scripts/build_external.py    # reads the Earth-test table from the NASA White Sands paper in data/external/
python scripts/analyze_flex.py      # fits the droplet model of the Analysis page (standard library only)
node scripts/check_model.cjs        # refits it independently from NASA's CSV; must get the same numbers
npm install                         # once, only for the next line
node scripts/build_search.mjs       # passages and their meaning vectors for the Ask page; also the checked glossary and related.json
node scripts/tune_ask.mjs           # optional: compares Ask settings and models on the tuning half -> data/eval/ask_tuning.json
node scripts/eval_ask.mjs           # scores the Ask page on the test questions -> docs/data/ask_eval.json
node scripts/check_ask.cjs          # the Ask page's counts, Moon card, glossary and published score (no model needed)
node scripts/build_topics.mjs       # checks the topic labels, counts passages per fire question, scores the search per question
```

## Structure

```
data/psi/raw/            NASA's files, byte for byte, with manifest.json (URL, time, size, SHA-256)
data/papers/             publication metadata from OpenAlex for the DOIs PSI lists
data/external/wstf2007/  the NASA White Sands paper (PDF and extracted text, with checksums): the one source outside PSI
data/content/            texts and labels written with AI and checked by program: plain-language summaries and answers,
                         attributes, the Ask test questions and word list, the guide and labels for the six fire questions
data/eval/               the Ask tuning results
scripts/                 fetch_snapshot.py, fetch_papers.py, build_dataset.py, validate.py, check_recount.cjs,
                         build_external.py, analyze_flex.py, check_model.cjs, build_search.mjs, build_topics.mjs,
                         eval_ask.mjs, tune_ask.mjs, split_eval.mjs, check_ask.cjs
docs/                    the website; docs/data/ is written by the build scripts
docs/ask.js, docs/model.js, docs/recount.js   the Ask matching and counts, the droplet model, the atmosphere recount (shared with the checks)
docs/models/, docs/vendor/   the language model and the library that runs it in the browser
```

## How every number stays honest

- **The snapshot is untouched.** Each file is stored exactly as NASA served it, with its checksum.
- **Ambient oxygen and burner-flow oxygen are never mixed.** The "85 % oxygen" in some tests is oxygen blown out of a burner into fuel gas, not air a crew would breathe.
- **A cell counts as a number only if NASA wrote a plain number.** Cells such as `~ 21.5`, `3400%` or `0.5 atm` are shown as written and not counted.
- **"Not stated" stays "not stated".** Nothing is filled in or estimated.
- **Quotations are checked by program.** The build fails unless every quoted sentence is found word for word in the NASA record it is attributed to.
- **No number is typed by hand.** Figures in the texts are inserted from the computed data.
- **Headline numbers are counted twice**, by separate code in `validate.py`.
- **The recount for other atmospheres is checked too.** `docs/recount.js` follows the same rules, and `check_recount.cjs` fails unless it reproduces the build exactly for the Moon Base.
- **The one table from outside PSI is read by program.** `build_external.py` reads every threshold of the NASA White Sands table from the paper's text and stops if a name, a number or a quoted sentence is not found exactly. It is never mixed into the PSI counts.
- **The droplet model is fitted twice.** `analyze_flex.py` (Python) fits it; `check_model.cjs` (JavaScript, no shared code) reads NASA's CSV again and must get the same coefficients, errors and counts, and checks the "next test" algebra against a refit with the extra test added.
- **The question labels carry their evidence.** Every label in `topic_labels.json` quotes the words that justify it; `build_topics.mjs` stops if a quote is not in its passage or a passage changed.
- **The Ask page counts, it does not write.** Its matching, its counts and its "how far the evidence reaches" line are in `docs/ask.js`. `check_ask.cjs` compares its numbers with the build, with `recount.js` and with a separate count from `tests.csv`. `eval_ask.mjs` scores it with that same code on the questions in `data/content/ask_eval_questions.json`; the questions and the glossary (`data/content/ask_glossary.json`) were drafted with AI and say in the file whether a team member has checked them.

## Data and references

- NASA Physical Sciences Informatics (PSI) repository, Combustion Science: https://psi.nasa.gov/physci/repo/search?q=combustion . Snapshot of 14 November 2026. Each of the 24 investigations is cited by its NASA DOI on the site's "Data and method" page and in `docs/data/investigations.csv`.
- NASA Space Apps Challenge 2026, Flame in Freefall (the Moon Base atmosphere figures): https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/
- NASA, Moon Base: https://www.nasa.gov/moonbase
- G. A. Ruff, Spacecraft Fire Safety Needs for Exploration, NASA Glenn Research Center, 2020: https://ntrs.nasa.gov/citations/20205007829
- OpenAlex (publication year, journal and abstracts): https://openalex.org
- Photographs (Moon, Earth, space station): NASA, public domain, via Wikimedia Commons; sources, checksums and changes in `docs/img/CREDITS.md`
- Typefaces: Barlow Condensed, Public Sans and DM Mono, SIL Open Font License 1.1, from https://fontsource.org (details in `docs/img/CREDITS.md`)
- Language model snowflake-arctic-embed-s (Snowflake, Apache-2.0), with its quantised ONNX file: https://huggingface.co/Snowflake/snowflake-arctic-embed-s . It replaced all-MiniLM-L6-v2 (Apache-2.0; https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2 , ONNX build https://huggingface.co/Xenova/all-MiniLM-L6-v2 ), which is kept in `docs/models/` only so that `scripts/tune_ask.mjs` can compare the two
- Transformers.js 4.3.2 (Apache-2.0): https://github.com/huggingface/transformers.js , with ONNX Runtime Web (MIT): https://github.com/microsoft/onnxruntime
- D. B. Hirsch et al., "Oxygen Concentration Flammability Thresholds of Selected Aerospace Materials Considered for the Constellation Program", NASA White Sands Test Facility, 2007 (public use permitted): https://ntrs.nasa.gov/citations/20070018178 . Source of the Earth-test table on the Habitat page; PDF and extracted text in `data/external/wstf2007/`
- pypdf 7.1.0 (BSD-3-Clause), used once to extract that PDF's text: https://github.com/py-pdf/pypdf
- NASA Technical Reports Server, for the reading lists outside PSI: https://ntrs.nasa.gov
- Python 3 standard library: https://docs.python.org/3/library/

## Use of AI

AI does five jobs here, and each is checked or limited so that it cannot invent anything.

1. **It reads NASA's records.** Claude (Anthropic) wrote the plain-language summaries and answers, and extracted for every investigation what was burned, what was varied, what was measured and what it is for on Earth. The build fails unless every quotation is found word for word in the NASA record, every table column exists, and the texts hold no hand-typed numbers.
2. **It matches a question to NASA's sentences.** On the Ask page a small open language model, snowflake-arctic-embed-s, runs in the reader's browser. It turns the question and 925 passages into vectors and shows the closest passages. The same vectors place the 24 investigations on the map by meaning. It writes nothing, and the question never leaves the reader's computer.
3. **It sorted NASA's text by fire question.** Claude (Anthropic) read all 925 passages of the records and the listed papers and labelled each with the fire questions it addresses (`data/content/topic_labels.json`, guide in `data/content/question_topics.json`). Every label quotes the words that justify it; `scripts/build_topics.mjs` checks each quote and fails if a passage changed. The same script measures the Ask search against these labels and publishes the score.
4. **It helped write the code.** The scripts and the website were written with AI assistance and reviewed by the team.
5. **It drew the pictures that are not photographs.** The logo, the route map and the habitat schematic were drawn as code (SVG) with AI assistance; each drawing on a page carries a visible note saying so. The three photographs are NASA's and are not AI-generated.

An early layout of the overview followed a design mockup made with ChatGPT (OpenAI); the mockup is not part of the site. The idea of the project, asking how much of NASA's fire data applies to the Moon Base, is the team's.

This project is not affiliated with or endorsed by NASA.
