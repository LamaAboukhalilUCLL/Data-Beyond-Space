# Data Beyond Space

NASA Space Apps Challenge 2026: **Flame in Freefall**.

The PSI snapshot (investigation records and Experimental Tables) lives in the notes repo, `sync-claudes/app/raw/`. This repo only adds what that snapshot does not cover: **publication abstracts**.

## Structure

```
data/papers/papers.json     one entry per publication DOI listed in PSI, with abstract when available
data/papers/manifest.json   run time, snapshot files read (SHA-256), counts, errors
scripts/fetch_papers.py     builds the two files above
```

## Refresh

Clone `sync-claudes` next to this repo, then:

```
python scripts/fetch_papers.py
```

Python 3.9+, no extra packages.

## Sources

- DOIs: [NASA PSI](https://psi.nasa.gov/physci/repo/search?q=combustion), Combustion Science (CC0-1.0)
- Titles and abstracts: [OpenAlex](https://openalex.org)

`fetch_papers.py` was written with AI assistance (Claude, Anthropic).
