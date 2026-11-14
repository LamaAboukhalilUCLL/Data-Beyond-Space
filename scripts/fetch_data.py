"""
Fetch the raw inputs for the Flame in Freefall dashboard.

What it downloads (about 1 MB in total, no login needed):
  1. Metadata for every PSI investigation in "Combustion Science"
  2. Every "Experimental table" CSV attached to those investigations
  3. Title + abstract for every publication DOI listed in PSI (via OpenAlex)

Output (relative to the repo root):
  data/psi/investigations/PSI-xx.json   full PSI record per investigation
  data/psi/tables/<original name>.csv   experimental tables
  data/papers/papers.json               one entry per unique DOI
  data/manifest.json                    what was fetched, when, and what failed

Usage (from the repo root, Python 3.9+, no extra packages):
  python scripts/fetch_data.py
  python scripts/fetch_data.py --skip-papers     # PSI only
  set OPENALEX_MAILTO=you@example.com            # optional, gets a faster OpenAlex pool

Re-running is safe: existing files are overwritten with fresh copies.
"""

import argparse
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

PSI = "https://psi.nasa.gov/geode-py/ws"
OPENALEX = "https://api.openalex.org/works/doi:"
USER_AGENT = "DataBeyondSpace-SpaceApps2026/1.0"

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"


def http_get(url, as_json=True, retries=3, timeout=60):
    """GET with simple retry/backoff. Returns parsed JSON or text."""
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    for attempt in range(1, retries + 1):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                body = resp.read().decode("utf-8", errors="replace")
                return json.loads(body) if as_json else body
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            if attempt == retries:
                raise
        except (urllib.error.URLError, TimeoutError):
            if attempt == retries:
                raise
        time.sleep(2 * attempt)


def safe_name(name):
    return re.sub(r'[<>:"/\\|?*]', "_", name).strip()


def list_combustion_investigations():
    url = f"{PSI}/repo/search?source=psi&type=investigation&size=500"
    hits = http_get(url)["hits"]["hits"]
    ids = [
        h["_source"]["Accession"]
        for h in hits
        if "combustion" in h["_source"].get("Research Area", "").lower()
    ]
    return sorted(ids, key=lambda s: int(s.split("-")[1]))


def download_psi_file(psi_id, file_name, version):
    """PSI returns a short-lived presigned S3 URL; fetch that URL for the file."""
    q = urllib.parse.urlencode({"file": file_name, "version": version, "redirect": "false"})
    signed = http_get(f"{PSI}/studies/{psi_id}/download?{q}", as_json=False).strip().strip('"')
    return http_get(signed, as_json=False)


def abstract_from_inverted_index(inv):
    """OpenAlex stores abstracts as {word: [positions]}; rebuild the text."""
    if not inv:
        return None
    words = {}
    for word, positions in inv.items():
        for p in positions:
            words[p] = word
    return " ".join(words[i] for i in sorted(words))


def fetch_paper(doi, mailto):
    url = OPENALEX + urllib.parse.quote(doi, safe="/")
    url += "?select=id,doi,title,publication_year,primary_location,abstract_inverted_index,open_access"
    if mailto:
        url += "&mailto=" + urllib.parse.quote(mailto)
    w = http_get(url)
    loc = w.get("primary_location") or {}
    src = loc.get("source") or {}
    return {
        "doi": doi,
        "openalex_id": w.get("id"),
        "title": w.get("title"),
        "year": w.get("publication_year"),
        "venue": src.get("display_name"),
        "is_oa": (w.get("open_access") or {}).get("is_oa"),
        "oa_url": (w.get("open_access") or {}).get("oa_url"),
        "abstract": abstract_from_inverted_index(w.get("abstract_inverted_index")),
    }


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--skip-papers", action="store_true", help="do not query OpenAlex")
    args = ap.parse_args()

    inv_dir = DATA / "psi" / "investigations"
    tab_dir = DATA / "psi" / "tables"
    pap_dir = DATA / "papers"
    for d in (inv_dir, tab_dir, pap_dir):
        d.mkdir(parents=True, exist_ok=True)

    manifest = {
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "source": "NASA Physical Sciences Informatics (PSI), https://psi.nasa.gov",
        "license": "PSI data is CC0-1.0; cite each investigation by its DOI",
        "investigations": [],
        "tables": [],
        "errors": [],
    }

    # 1. Investigations
    ids = list_combustion_investigations()
    print(f"Found {len(ids)} Combustion Science investigations")
    publications = {}  # doi -> list of PSI ids citing it
    for psi_id in ids:
        try:
            rec = http_get(f"{PSI}/repo/investigations/{psi_id}")
        except Exception as e:
            manifest["errors"].append({"step": "investigation", "id": psi_id, "error": str(e)})
            print(f"  ! {psi_id}: {e}")
            continue
        (inv_dir / f"{psi_id}.json").write_text(json.dumps(rec, indent=2, ensure_ascii=False), encoding="utf-8")
        manifest["investigations"].append({
            "id": psi_id,
            "acronym": rec.get("investigationAcronym", ""),
            "title": rec.get("title", ""),
            "doi": rec.get("doi", ""),
            "total_file_size_bytes": rec.get("totalFileSize"),
        })
        print(f"  {psi_id:8} {rec.get('investigationAcronym', '') or '-':22} ok")

        # 2. Experimental tables
        for f in rec.get("experimentalTable") or []:
            name = f.get("file_name", "")
            try:
                text = download_psi_file(psi_id, name, f.get("version", 1))
                out = tab_dir / safe_name(name)
                out.write_text(text, encoding="utf-8")
                rows = max(0, len([l for l in text.splitlines() if l.strip()]) - 1)
                manifest["tables"].append({"id": psi_id, "file": out.name, "rows": rows})
                print(f"           table {name} ({rows} rows)")
            except Exception as e:
                manifest["errors"].append({"step": "table", "id": psi_id, "file": name, "error": str(e)})
                print(f"  ! table {name}: {e}")

        for p in rec.get("publications") or []:
            doi = (p.get("doi") or "").strip().lower()
            doi = re.sub(r"^https?://(dx\.)?doi\.org/", "", doi)
            if doi:
                publications.setdefault(doi, {"psi_ids": set(), "psi_title": p.get("title", "")})
                publications[doi]["psi_ids"].add(psi_id)
        time.sleep(0.3)

    # 3. Papers
    papers = []
    if not args.skip_papers:
        mailto = os.environ.get("OPENALEX_MAILTO", "")
        print(f"Fetching {len(publications)} unique DOIs from OpenAlex")
        for i, (doi, meta) in enumerate(sorted(publications.items()), 1):
            entry = {"doi": doi, "psi_ids": sorted(meta["psi_ids"]), "psi_title": meta["psi_title"]}
            try:
                entry.update(fetch_paper(doi, mailto))
            except Exception as e:
                entry["error"] = str(e)
                manifest["errors"].append({"step": "paper", "doi": doi, "error": str(e)})
            entry["doi"] = doi
            papers.append(entry)
            if i % 25 == 0:
                print(f"  {i}/{len(publications)}")
            time.sleep(0.15)
        (pap_dir / "papers.json").write_text(json.dumps(papers, indent=2, ensure_ascii=False), encoding="utf-8")

    with_abs = sum(1 for p in papers if p.get("abstract"))
    manifest["papers"] = {"unique_dois": len(publications), "with_abstract": with_abs}
    (DATA / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")

    print("\nDone.")
    print(f"  investigations: {len(manifest['investigations'])}")
    print(f"  tables:         {len(manifest['tables'])}")
    print(f"  papers:         {len(publications)} DOIs, {with_abs} with abstract")
    print(f"  errors:         {len(manifest['errors'])} (see data/manifest.json)")
    return 1 if manifest["errors"] and not manifest["investigations"] else 0


if __name__ == "__main__":
    sys.exit(main())
