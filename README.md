# Data Beyond Space

NASA Space Apps Challenge 2026: **Flame in Freefall**, an SI-powered dashboard for fire-safety insights from microgravity combustion data.

## Structure

```
data/
  psi/investigations/   PSI metadata, one JSON per investigation (24)
  psi/tables/           experimental tables, CSV (22)
  papers/papers.json    publications listed in PSI, with abstracts where available
  manifest.json         fetch log: what was downloaded, when, errors
scripts/
  fetch_data.py         downloads everything above
```

## Refresh the data

```
python scripts/fetch_data.py
```

Python 3.9+, no extra packages. Takes a few minutes.

## Data source

[NASA Physical Sciences Informatics (PSI)](https://psi.nasa.gov/physci/repo/search?q=combustion), Combustion Science. CC0-1.0. Cite each investigation by its DOI.
Abstracts come from [OpenAlex](https://openalex.org).
