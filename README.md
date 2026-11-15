# Flame in Freefall: Moon Base fire data coverage

**Team Data Beyond Space · NASA Space Apps Challenge 2026 · Challenge: Flame in Freefall**

NASA is building a Moon Base whose habitats and pressurized rovers are expected to hold air with 30 % oxygen or more, at 10.2 psi or less. More oxygen makes materials burn more easily. This dashboard reads all 24 combustion investigations in NASA's PSI repository and shows, test by test, how much of that fire data was collected in Moon Base air, and where the data stops.

It shows coverage and gaps. It does not predict how fire behaves on the Moon.

## What the dashboard does

| View | What it shows |
|---|---|
| Overview | The headline numbers and the gap in one picture |
| Coverage map | Every test placed by oxygen level and by what burns, and by oxygen and pressure together, with the Moon Base zone marked |
| Ranking | The 24 investigations ordered by how many of five Moon Base conditions they meet, with the evidence for each |
| Investigation pages | Each investigation in plain words, NASA's description word for word, what its table records, its publications, and a side-by-side comparison with any other |
| Open questions | Six fire-safety questions for a Moon Base, each marked open or partly answered, with NASA's own words and table rows as evidence |
| Data and method | Downloads of the cleaned tables, the rules every number follows, and the references |

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
```

## Structure

```
data/psi/raw/            NASA's files, byte for byte, with manifest.json (URL, time, size, SHA-256)
data/papers/             publication metadata from OpenAlex for the DOIs PSI lists
data/content/            the plain-language texts shown on the site (AI-written, machine-checked)
scripts/                 fetch_snapshot.py, fetch_papers.py, build_dataset.py, validate.py
docs/                    the website; docs/data/ is written by build_dataset.py
```

## How every number stays honest

- **The snapshot is untouched.** Each file is stored exactly as NASA served it, with its checksum.
- **Ambient oxygen and burner-flow oxygen are never mixed.** The "85 % oxygen" in some tests is oxygen blown out of a burner into fuel gas, not air a crew would breathe.
- **A cell counts as a number only if NASA wrote a plain number.** Cells such as `~ 21.5`, `3400%` or `0.5 atm` are shown as written and not counted.
- **"Not stated" stays "not stated".** Nothing is filled in or estimated.
- **Quotations are checked by program.** The build fails unless every quoted sentence is found word for word in the NASA record it is attributed to.
- **No number is typed by hand.** Figures in the texts are inserted from the computed data.
- **Headline numbers are counted twice**, by separate code in `validate.py`.

## Data and references

- NASA Physical Sciences Informatics (PSI) repository, Combustion Science: https://psi.nasa.gov/physci/repo/search?q=combustion . Snapshot of 14 November 2026. Each of the 24 investigations is cited by its NASA DOI on the site's "Data and method" page and in `docs/data/investigations.csv`.
- NASA Space Apps Challenge 2026, Flame in Freefall (the Moon Base atmosphere figures): https://www.spaceappschallenge.org/2026/challenges/flame-in-freefall/
- NASA, Moon Base: https://www.nasa.gov/moonbase
- G. A. Ruff, Spacecraft Fire Safety Needs for Exploration, NASA Glenn Research Center, 2020: https://ntrs.nasa.gov/citations/20205007829
- OpenAlex (publication year, journal and abstracts): https://openalex.org
- Moon photograph on the overview: Lunar Reconnaissance Orbiter near-side mosaic, NASA/GSFC/Arizona State University, public domain: https://commons.wikimedia.org/wiki/File:Moon_nearside_LRO_5000.jpg (details in `docs/img/CREDITS.md`)
- Python 3 standard library: https://docs.python.org/3/library/

## Use of AI

The scripts, the website and the plain-language texts were written with AI assistance (Claude, Anthropic) and reviewed by the team. The AI was given only NASA's records and tables. AI-written text is labelled on the site, and NASA's own words always appear in quotation marks. The overview page layout follows a design mockup made with ChatGPT (OpenAI); the mockup is not part of the site, and every number on the page comes from the data. The idea of the project, asking how much of NASA's fire data applies to the Moon Base, is the team's.

This project is not affiliated with or endorsed by NASA.
