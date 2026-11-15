# Flame in Freefall: Moon Base fire data coverage

**Team Data Beyond Space · NASA Space Apps Challenge 2026 · Challenge: Flame in Freefall**

NASA is building a Moon Base whose habitats and pressurized rovers are expected to hold air with 30 % oxygen or more, at 10.2 psi or less. More oxygen makes materials burn more easily. This dashboard reads all 24 combustion investigations in NASA's PSI repository and shows, test by test, how much of that fire data was collected in Moon Base air, and where the data stops.

It shows coverage and gaps. It does not predict how fire behaves on the Moon.

## What the dashboard does

| View | What it shows |
|---|---|
| Overview | The finding, then a tool: choose an atmosphere and see how much of NASA's fire data fits it |
| Explore | Every test against the chosen air: oxygen by what burns, oxygen against pressure, and a finder for materials and tests with a filtered CSV download |
| Habitat | A schematic Moon habitat with six numbered spots, one per open fire-safety question, each showing what NASA's data can say about that part of the habitat |
| Ranking | The 24 investigations ordered by how many of five conditions they meet for the chosen air, with the evidence for each. A second tab puts all 24 side by side: sample or burner, what was measured, use on Earth |
| Ask | Type a question; get the sentences from NASA's records and the listed papers that match it best, by meaning. Quotations only, nothing generated |
| Investigation pages | Each investigation in plain words, NASA's description word for word, what its table records, its publications, and a side-by-side comparison with any other |
| Open questions | Six fire-safety questions for a Moon Base, each marked open or partly answered, with NASA's own words and table rows as evidence |
| Data and method | Downloads of the cleaned tables, the rules every number follows, and the references |

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
npm install                         # once, only for the next line
node scripts/build_search.mjs       # passages and their meaning vectors for the Ask page
```

## Structure

```
data/psi/raw/            NASA's files, byte for byte, with manifest.json (URL, time, size, SHA-256)
data/papers/             publication metadata from OpenAlex for the DOIs PSI lists
data/content/            the plain-language texts and the extracted attributes (AI-written, machine-checked)
scripts/                 fetch_snapshot.py, fetch_papers.py, build_dataset.py, validate.py
docs/                    the website; docs/data/ is written by the build scripts
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

## Data and references

- NASA Physical Sciences Informatics (PSI) repository, Combustion Science: https://psi.nasa.gov/physci/repo/search?q=combustion . Snapshot of 14 November 2026. Each of the 24 investigations is cited by its NASA DOI on the site's "Data and method" page and in `docs/data/investigations.csv`.
- NASA Space Apps Challenge 2026, Flame in Freefall (the Moon Base atmosphere figures): https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/
- NASA, Moon Base: https://www.nasa.gov/moonbase
- G. A. Ruff, Spacecraft Fire Safety Needs for Exploration, NASA Glenn Research Center, 2020: https://ntrs.nasa.gov/citations/20205007829
- OpenAlex (publication year, journal and abstracts): https://openalex.org
- Photographs (Moon, Earth, space station): NASA, public domain, via Wikimedia Commons; sources, checksums and changes in `docs/img/CREDITS.md`
- Typefaces: Barlow Condensed, Public Sans and DM Mono, SIL Open Font License 1.1, from https://fontsource.org (details in `docs/img/CREDITS.md`)
- Language model all-MiniLM-L6-v2 (Apache-2.0): https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2 , in the ONNX build https://huggingface.co/Xenova/all-MiniLM-L6-v2
- Transformers.js 4.3.2 (Apache-2.0): https://github.com/huggingface/transformers.js , with ONNX Runtime Web (MIT): https://github.com/microsoft/onnxruntime
- NASA Technical Reports Server, for the reading lists outside PSI: https://ntrs.nasa.gov
- Python 3 standard library: https://docs.python.org/3/library/

## Use of AI

AI does three jobs here, and each is checked or limited so that it cannot invent anything.

1. **It reads NASA's records.** Claude (Anthropic) wrote the plain-language summaries and answers, and extracted for every investigation what was burned, what was varied, what was measured and what it is for on Earth. The build fails unless every quotation is found word for word in the NASA record, every table column exists, and the texts hold no hand-typed numbers.
2. **It matches a question to NASA's sentences.** On the Ask page a small open language model, all-MiniLM-L6-v2, runs in the reader's browser. It turns the question and 925 passages into vectors and shows the closest passages. It writes nothing, and the question never leaves the reader's computer.
3. **It helped write the code.** The scripts and the website were written with AI assistance and reviewed by the team.

An early layout of the overview followed a design mockup made with ChatGPT (OpenAI); the mockup is not part of the site. The idea of the project, asking how much of NASA's fire data applies to the Moon Base, is the team's.

This project is not affiliated with or endorsed by NASA.
