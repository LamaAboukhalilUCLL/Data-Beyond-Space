#!/usr/bin/env python3
"""
fetch_papers.py - collects title and abstract for every publication DOI that
PSI lists for the Combustion Science investigations.

It does NOT download PSI. It reads the PSI records already saved in the
snapshot (data/psi/raw/, written by fetch_snapshot.py) and only looks up each
DOI on OpenAlex. Nothing is cleaned or interpreted.

Saves:
  data/papers/papers.json     one entry per unique DOI: which PSI ids cite it,
                              title, year, venue, open-access link, abstract
                              (null when OpenAlex has none)
  data/papers/manifest.json   when it ran, which snapshot files were read
                              (with their SHA-256 from the snapshot manifest),
                              counts, errors

Run from the repo root (Python 3.9+, no packages):
  python scripts/fetch_papers.py

Source: OpenAlex (https://openalex.org), CC0 metadata.
This script was written with AI assistance (Claude, Anthropic).
"""
import argparse
import glob
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DEFAULT_RAW = os.path.join(ROOT, "data", "psi", "raw")
OUT = os.path.join(ROOT, "data", "papers")
OPENALEX = "https://api.openalex.org/works/doi:"
AGENT = "SpaceApps2026-DataBeyondSpace/1.0"


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def get_json(url, retries=3):
    req = urllib.request.Request(url, headers={"User-Agent": AGENT})
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 404 or attempt == retries:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == retries:
                raise
        time.sleep(2 * attempt)


def rebuild_abstract(inverted):
    """OpenAlex stores abstracts as {word: [positions]}."""
    if not inverted:
        return None
    pos = {p: w for w, ps in inverted.items() for p in ps}
    return " ".join(pos[i] for i in sorted(pos))


def collect_dois(raw_dir):
    dois, read = {}, []
    for path in sorted(glob.glob(os.path.join(raw_dir, "PSI-*.json"))):
        name = os.path.basename(path)
        with open(path, encoding="utf-8") as f:
            rec = json.load(f)
        psi_id = rec.get("accession") or name[:-5]
        read.append(name)
        for p in rec.get("publications") or []:
            doi = (p.get("doi") or "").strip().lower()
            doi = re.sub(r"^https?://(dx\.)?doi\.org/", "", doi)
            if not doi:
                continue
            entry = dois.setdefault(doi, {"psi_ids": set(), "psi_title": p.get("title", "")})
            entry["psi_ids"].add(psi_id)
    return dois, read


def main():
    ap = argparse.ArgumentParser(description="Fetch abstracts for PSI publication DOIs")
    ap.add_argument("--raw", default=DEFAULT_RAW, help="folder with the PSI snapshot (PSI-*.json)")
    args = ap.parse_args()
    raw_dir = os.path.abspath(args.raw)

    dois, read = collect_dois(raw_dir)
    if not read:
        sys.exit(f"No PSI-*.json found in {raw_dir}. Run scripts/fetch_snapshot.py first or pass --raw.")

    snap_manifest = {}
    mpath = os.path.join(raw_dir, "manifest.json")
    if os.path.exists(mpath):
        with open(mpath, encoding="utf-8") as f:
            snap_manifest = json.load(f)

    os.makedirs(OUT, exist_ok=True)
    started = now()
    papers, errors = [], []
    print(f"{len(read)} PSI records read, {len(dois)} unique DOIs")
    for i, (doi, meta) in enumerate(sorted(dois.items()), 1):
        entry = {"doi": doi, "psi_ids": sorted(meta["psi_ids"]), "psi_title": meta["psi_title"]}
        url = (OPENALEX + urllib.parse.quote(doi, safe="/")
               + "?select=id,title,publication_year,primary_location,open_access,abstract_inverted_index")
        try:
            w = get_json(url)
            src = (w.get("primary_location") or {}).get("source") or {}
            oa = w.get("open_access") or {}
            entry.update({
                "openalex_id": w.get("id"),
                "title": w.get("title"),
                "year": w.get("publication_year"),
                "venue": src.get("display_name"),
                "is_oa": oa.get("is_oa"),
                "oa_url": oa.get("oa_url"),
                "abstract": rebuild_abstract(w.get("abstract_inverted_index")),
            })
        except Exception as e:
            entry["error"] = str(e)
            errors.append({"doi": doi, "error": str(e)})
        papers.append(entry)
        if i % 25 == 0:
            print(f"  {i}/{len(dois)}")
        time.sleep(0.15)

    with open(os.path.join(OUT, "papers.json"), "w", encoding="utf-8") as f:
        json.dump(papers, f, indent=2, ensure_ascii=False)

    with_abs = sum(1 for p in papers if p.get("abstract"))
    manifest = {
        "started": started,
        "finished": now(),
        "source": "OpenAlex, https://api.openalex.org",
        "dois_from": "PSI publication lists in the snapshot (data/psi/raw)",
        "snapshot_files_read": {n: snap_manifest.get(n, {}).get("sha256") for n in read},
        "unique_dois": len(papers),
        "with_abstract": with_abs,
        "errors": errors,
    }
    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)

    print(f"Done: {len(papers)} DOIs, {with_abs} with abstract, {len(errors)} errors")


if __name__ == "__main__":
    main()
