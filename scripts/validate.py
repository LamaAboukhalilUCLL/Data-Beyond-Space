#!/usr/bin/env python3
"""
validate.py - independent checks on what the dashboard shows. Run after
build_dataset.py; exits with an error if anything does not hold.

  1. Every file in data/psi/raw/ still has the SHA-256 recorded when it was
     downloaded from NASA.
  2. The tables the page can display (docs/data/tables/) are byte-identical
     to the snapshot.
  3. The headline numbers are recounted here straight from the raw CSV files,
     with separate code from build_dataset.py, and must match dataset.json.
  4. Every quotation in dataset.json is found word for word in the raw record.

Run from the repo root:   python scripts/validate.py

This script was written with AI assistance (Claude Code, Anthropic).
"""
import csv, hashlib, io, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "psi", "raw")
DOCS = os.path.join(ROOT, "docs", "data")
problems = []


def check(ok, message):
    print(("ok   " if ok else "FAIL ") + message)
    if not ok:
        problems.append(message)


def sha(path):
    return hashlib.sha256(open(path, "rb").read()).hexdigest()


def table(name):
    data = open(os.path.join(RAW, name), "rb").read()
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = data.decode("cp1252")
    rows = list(csv.reader(io.StringIO(text)))
    return rows[0], [r for r in rows[1:] if any(c.strip() for c in r)]


def number(cell):
    cell = cell.strip()
    return float(cell) if re.fullmatch(r"\d+(\.\d+)?|\.\d+", cell) else None


def squeeze(s):
    return re.sub(r"\s+", " ", s or "").strip()


# 1. snapshot checksums
manifest = json.load(open(os.path.join(RAW, "manifest.json"), encoding="utf-8"))
bad = [n for n, m in manifest.items() if sha(os.path.join(RAW, n)) != m["sha256"]]
check(not bad, f"all {len(manifest)} snapshot files match their recorded SHA-256" + (f": {bad}" if bad else ""))

# 2. displayed tables are the snapshot tables
names = sorted(n for n in manifest if "_table_" in n)
same = all(os.path.exists(os.path.join(DOCS, "tables", n)) and sha(os.path.join(DOCS, "tables", n)) == manifest[n]["sha256"]
           for n in names)
check(same and sorted(os.listdir(os.path.join(DOCS, "tables"))) == names,
      f"the {len(names)} tables the page displays are byte-identical to the snapshot")

# 3. recount the headline numbers from the raw CSVs
dataset = json.load(open(os.path.join(DOCS, "dataset.json"), encoding="utf-8"))
S = dataset["summary"]
# (file, ambient oxygen column, scale to percent, pressure column, psi per unit)
BOTH = [
    ("PSI-69_table_1.csv", "O initial ambient composition; mole fraction", 100, "Ambient pressure; mmHg", 0.0193368),
    ("PSI-159_table_1.csv", " XO2 before test", 100, "approx p (bar)", 14.5038),
    ("PSI-10_table_1.csv", "XO2 (init)", 100, "pinit (atm)", 14.6959),
]
both = zone = near = 0
near_files = set()
for name, ocol, scale, pcol, f in BOTH:
    head, rows = table(name)
    for r in rows:
        o, p = number(r[head.index(ocol)]), number(r[head.index(pcol)])
        if o is not None and p is not None and p > 0:
            both += 1
            zone += (o * scale >= 30 and p * f <= 10.2)
            if o * scale >= 30 and 10.2 < p * f <= 10.2 + S["near_zone_margin_psi"]:
                near += 1
                near_files.add(name.split("_")[0])
check(both == S["rows_with_both"], f"tests stating both oxygen and pressure: {both} (page says {S['rows_with_both']})")
check(zone == S["rows_in_zone"], f"tests inside the Moon Base zone: {zone} (page says {S['rows_in_zone']})")
check(near == S["rows_near_zone"] and sorted(near_files) == sorted(S["near_zone_investigations"]), f"tests that narrowly miss the pressure limit: {near} from {sorted(near_files)} (page says {S['rows_near_zone']})")
check(S["near_zone_investigations"] == ["PSI-69"], "the texts name FLEX as the only investigation with near misses")

head, rows = table("PSI-25_table_1.csv")
solid = [number(r[head.index("Calibrated  initial O2 % by vol ")]) for r in rows]
solid = [v for v in solid if v is not None]
rng = S["o2_range_by_class"]["solid"]
check((min(solid), max(solid), len(solid)) == (rng["min"], rng["max"], rng["rows"]),
      f"solid-material oxygen: {min(solid)} to {max(solid)} % in {len(solid)} tests "
      f"(page says {rng['min']} to {rng['max']} in {rng['rows']})")

AMBIENT = BOTH + [("PSI-25_table_1.csv", "Calibrated  initial O2 % by vol ", 1, None, None),
                  ("PSI-39_table_1.csv", "Oxygen", 100, None, None)]
plain = high = 0
for name, ocol, scale, _, _ in AMBIENT:
    head, rows = table(name)
    for r in rows:
        o = number(r[head.index(ocol)])
        if o is not None:
            plain += 1
            high += o * scale >= 30
check(plain == S["rows_with_plain_ambient_o2"], f"tests with ambient oxygen as a plain number: {plain} (page says {S['rows_with_plain_ambient_o2']})")
check(high == S["rows_with_o2_at_or_above"], f"of those, at 30 % or more: {high} (page says {S['rows_with_o2_at_or_above']})")
check(len(dataset["investigations"]) == 24 and sorted(i["rank"] for i in dataset["investigations"]) == list(range(1, 25)),
      "24 investigations, ranked 1 to 24")

# 4. quotations
raw = {}
for i in dataset["investigations"]:
    raw[i["id"]] = json.load(open(os.path.join(RAW, i["id"] + ".json"), encoding="utf-8"))
quotes = []
for i in dataset["investigations"]:
    p = i["criteria"]["purpose"]
    if p["quote"]:
        quotes.append((i["id"], p["field"], p["quote"]))
    quotes += [(i["id"], x["field"], x["quote"]) for x in i["summary"]["points"]]
for q in dataset["questions"]:
    quotes += [(e["inv"], e["field"], e["quote"]) for e in q["evidence"] if e["kind"] == "record"]
missing = [(a, f, q) for a, f, q in quotes if squeeze(q) not in squeeze(raw[a].get(f))]
check(not missing, f"all {len(quotes)} quotations are word for word in NASA's records" + (f": {missing}" if missing else ""))
dois = [i["id"] for i in dataset["investigations"] if not i["doi"]]
check(not dois, "every investigation has a NASA DOI")

if problems:
    sys.exit(f"\n{len(problems)} check(s) failed")
print("\nAll checks passed.")
