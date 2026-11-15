#!/usr/bin/env python3
"""
build_external.py - the one data source on the site that is not from PSI.

NASA's White Sands Test Facility measured, on Earth, up to which oxygen level 26 material
samples still put themselves out in NASA's standard upward-flame test, at 70.1 kPa total
pressure (Hirsch et al., 2007, NTRS 20070018178). PSI holds no solid-material test in
weightlessness at 30 % oxygen or more, so this table is the nearest public NASA evidence
about solids in Moon Base air, and it is shown as what it is: an Earth test.

Nothing here is typed by hand. data/external/wstf2007/ holds the PDF as downloaded and its
extracted text. source.json lists the 26 sample names exactly as the paper prints them;
this script finds each name in the paper's Table 2 and reads the two numbers printed after
it. It stops if a file's checksum changed, if a name is not found exactly once, if a number
cannot be read, or if a quoted sentence is not in the paper word for word.

Uses the Python standard library only. Writes docs/data/earth_tests.json.
Written with AI assistance (Claude Code, Anthropic).
"""
import hashlib
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC = os.path.join(ROOT, "data", "external", "wstf2007")
OUT = os.path.join(ROOT, "docs", "data", "earth_tests.json")
KPA_TO_PSI = 0.1450377
VALUE = r"((?:[<>] )?\d+(?:\.\d+)?)"


def squeeze(s):
    # the PDF text breaks lines and sometimes splits a word ("we re tested"); compare on single spaces
    return re.sub(r"\s+", " ", s).strip()


def main():
    src = json.load(open(os.path.join(SRC, "source.json"), encoding="utf-8"))
    for name, want in src["files"].items():
        got = hashlib.sha256(open(os.path.join(SRC, name), "rb").read()).hexdigest()
        if got != want:
            sys.exit(f"external: {name} changed (sha256 {got})")
    text = squeeze(open(os.path.join(SRC, "NTRS-20070018178.txt"), encoding="utf-8").read())
    for key, q in list(src["quotes"].items()) + list(src["config_quotes"].items()) + [("pressure", src["pressure_kpa_quote"]), ("table", src["table"])]:
        if squeeze(q) not in text:
            sys.exit(f"external: quote {key!r} is not in the paper word for word")
    kpa = float(re.search(r"fixed total pressure of ([\d.]+) kPa", text).group(1))
    step = float(re.search(r"lowered in ([\d.]+) % steps", text).group(1))
    table1 = text[text.index("Table 1. Materials Tested"):text.index("Notes: 1 Nomex")]
    table2 = text[text.index(squeeze(src["table"])):]
    table2 = table2[:table2.index("Notes: 1 Except as noted")]

    rows = []
    for r in src["rows"]:
        found = re.findall(re.escape(r["name"]) + r"\s+" + VALUE + r"\s+" + VALUE + r"(\*?)", table2)
        if len(found) != 1:
            sys.exit(f"external: {r['name']!r} found {len(found)} times in Table 2, expected once")
        uloi, moc, star = found[0]
        if squeeze(r["composition"]) not in table1:
            sys.exit(f"external: composition {r['composition']!r} is not in Table 1")
        if r["category"] not in table2:
            sys.exit(f"external: category {r['category']!r} is not in Table 2")
        kind = "below" if moc.startswith("<") else "above" if moc.startswith(">") else "value"
        rows.append({
            "name": r["name"], "label": re.sub(r"\s*\(See Notes? [^)]*\)", "", r["name"]), "category": r["category"], "composition": r["composition"], "config": r.get("config"),
            "uloi": uloi, "moc": moc + star, "kind": kind, "limit": float(moc.lstrip("<> ")), "five_samples": bool(star),
        })
    if len(rows) != len(re.findall(VALUE + r"\s+" + VALUE + r"\*?\s+(?:flame|none|None|Melting)", table2)):
        sys.exit("external: the number of rows read differs from the number of rows in Table 2")

    out = {
        "about": {
            "source": {k: src[k] for k in ("title", "authors", "year", "venue", "url", "pdf_url", "rights", "retrieved", "table")},
            "pressure_kpa": kpa, "pressure_psi": round(kpa * KPA_TO_PSI, 2), "oxygen_step_percent": step,
            "quotes": src["quotes"], "config_quotes": src["config_quotes"],
            "gravity": "Normal gravity (a ground test at NASA White Sands Test Facility).",
            "reading": "moc is the paper's MOC: the highest oxygen level at which the sample consistently put itself out. '< 30' means it burned past the limit at 30 %, the lowest level tested. '> 40' means it still put itself out at 40 %, the highest level tested for it.",
            "built_by": "scripts/build_external.py (written with AI assistance: Claude Code, Anthropic). Every threshold is read by the program from the paper's text.",
        },
        "rows": rows,
    }
    with open(OUT, "w", encoding="utf-8", newline="\n") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    kinds = {k: sum(1 for r in rows if r["kind"] == k) for k in ("below", "value", "above")}
    print(f"Earth tests: {len(rows)} samples read from Table 2 at {kpa} kPa ({out['about']['pressure_psi']} psi): {kinds}")


if __name__ == "__main__":
    main()
