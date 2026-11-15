#!/usr/bin/env python3
"""
build_dataset.py - turns the untouched PSI snapshot (data/psi/raw/) into the
files the dashboard reads (docs/data/).

The dashboard asks one question of every investigation: how close did its
tests come to the atmosphere planned for the Moon Base (30 % oxygen or more,
at 10.2 psi or less, as given in the Space Apps challenge statement)?

Rules this script follows:
  * Nothing is fetched from the internet; only data/psi/raw/ and
    data/papers/papers.json are read.
  * Ambient oxygen (the atmosphere around the flame) and burner-flow oxygen
    (oxygen blown out of a burner into a fuel atmosphere) are never mixed.
  * A cell counts as a number only if it IS a plain number, or a list of plain
    numbers separated by ";". Every other cell ("~ 21.5", "3400%", "0.5 atm",
    blank ...) is passed on exactly as PSI wrote it and is not counted.
  * Two conversions are made, both marked in the output: mole fraction x 100
    = percent, and pressure to psi (factors in PSI_PER below).
  * A pressure of exactly 0 is kept as written and not counted.
  * Record text (objective, approach, hypothesis, impacts) is copied verbatim.

What is OUR reading, not PSI's, is declared by hand in the tables below and
is labelled as such in the output: which column means what, what kind of thing
burns, what a table row stands for, and whether the record's own text names
spacecraft fire safety as its purpose (always with the sentence quoted).

Run from the repo root:   python scripts/build_dataset.py
Writes: docs/data/dataset.json, tests.json, investigations.csv, tests.csv

This script was written with AI assistance (Claude Code, Anthropic).
"""
import collections, csv, io, json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "psi", "raw")
PAPERS = os.path.join(ROOT, "data", "papers", "papers.json")
CONTENT = os.path.join(ROOT, "data", "content", "interpretation.json")
ATTRS = os.path.join(ROOT, "data", "content", "attributes.json")
OUT = os.path.join(ROOT, "docs", "data")
PSI_PAGE = "https://psi.nasa.gov/physci/repo/data/investigations/"

# The Moon Base atmosphere, from the challenge statement.
MOON_O2_MIN = 30.0     # percent oxygen, "30% or more"
MOON_P_MAX = 10.2      # psi, "10.2 psi or less"
PSI_PER = {"atm": 14.6959, "bar": 14.5038, "mmHg": 0.0193368}

# Atmospheres a reader can pick. "At least this much oxygen, at most this much pressure."
# (id, name, oxygen %, pressure psi, where the figures come from, PSI record and quote if any)
PRESETS = [
    {"id": "moon", "name": "Moon Base and pressurized rovers", "o2": MOON_O2_MIN, "p": MOON_P_MAX,
     "source": "Space Apps challenge statement: 30 % oxygen or more, at 10.2 psi or less"},
    {"id": "c34", "name": "Cabin at 8.2 psia", "o2": 34.0, "p": 8.2,
     "source": "An atmosphere NASA considers for human missions, named in PSI record PSI-20",
     "record": "PSI-20", "field": "objective", "quote": "8.2 psia, 34 % oxygen"},
    {"id": "c265", "name": "Cabin at 10.2 psia", "o2": 26.5, "p": 10.2,
     "source": "An atmosphere NASA considers for human missions, named in PSI record PSI-20",
     "record": "PSI-20", "field": "objective", "quote": "10.2 psia, 26.5 %"},
    {"id": "earth", "name": "Earth air", "o2": 21.0, "p": 14.7,
     "source": "Sea-level air, also named in PSI record PSI-20",
     "record": "PSI-20", "field": "objective", "quote": "14.7 psia, 21 % oxygen"},
    {"id": "suit", "name": "Spacesuit", "o2": 100.0, "p": 4.3,
     "source": "Space Apps challenge statement: 100 % oxygen at 4.3 psi"},
]

# ---------------------------------------------------------------- our reading
# What burns. Our own label, written after reading each record.
#   solid     real solid materials are burned
#   smoke     solid materials are heated until they smoke (no flame studied)
#   emulated  a gas burner built to behave like a burning solid or liquid
#   droplet   single droplets of liquid fuel
#   gas       gas flames
#   aerosol   an instrument test with dust, no fire
CLASS_LABEL = {
    "solid": "Solid materials", "smoke": "Smoke from heated solids",
    "emulated": "Gas burner emulating solids", "droplet": "Liquid fuel droplets",
    "gas": "Gas flames", "aerosol": "Dust and aerosol instrument test",
}
# material criterion: 1 = tests solid cabin materials, 0.5 = partly, 0 = no
CLASS_SCORE = {"solid": 1, "smoke": 1, "emulated": 0.5, "droplet": 0, "gas": 0, "aerosol": 0}

# id -> (class, is a ground/computer study, display name when PSI gives no acronym)
INV = {
    "PSI-10": ("gas", False, None), "PSI-20": ("emulated", False, None),
    "PSI-21": ("gas", False, None), "PSI-22": ("gas", False, None),
    "PSI-23": ("gas", False, None), "PSI-25": ("solid", False, None),
    "PSI-26": ("solid", False, None), "PSI-39": ("droplet", False, None),
    "PSI-47": ("aerosol", False, None),
    "PSI-60": ("gas", True, "SPICE data analysis (ground)"),
    "PSI-62": ("solid", True, "BASS flame-spread model (ground)"),
    "PSI-68": ("droplet", False, None), "PSI-69": ("droplet", False, None),
    "PSI-98": ("solid", False, None), "PSI-99": ("solid", False, None),
    "PSI-100": ("solid", False, None), "PSI-101": ("smoke", False, None),
    "PSI-102": ("smoke", False, None), "PSI-106": ("gas", False, None),
    "PSI-107": ("gas", False, None),
    "PSI-115": ("smoke", True, "SAME smoke model (ground)"),
    "PSI-117": ("droplet", True, "FLEX cool-flame simulation (ground)"),
    "PSI-142": ("droplet", True, "Cool-flame transitions (ground)"),
    "PSI-159": ("gas", False, None),
}

# Does the record's own text name spacecraft fire safety as its purpose?
#   primary  the objective, hypothesis or impacts are about spacecraft fire safety
#   benefit  fire safety is mentioned as one possible benefit, or only PSI's
#            sub-research-area label says so
#   none     not mentioned
# Every entry quotes the sentence it rests on: (level, record field, verbatim quote).
# build fails if a quote is not found word for word in that field.
PURPOSE = {
    "PSI-25": ("primary", "researchImpacts", "A primary goal of BASS-II is improved spacecraft fire safety"),
    "PSI-26": ("primary", "researchImpacts", "Current NASA spacecraft materials selection is based on a standard test method"),
    "PSI-98": ("primary", "objective", "determine how rapidly a large scale fire grows in low-gravity"),
    "PSI-99": ("primary", "objective", "determine how rapidly a large scale fire grows in low-gravity"),
    "PSI-100": ("primary", "objective", "determine how rapidly a large scale fire grows in low-gravity"),
    "PSI-102": ("primary", "researchImpacts", "technology for an advanced fire detector for future spacecraft"),
    "PSI-101": ("primary", "researchImpacts", "technology for an advanced fire detector for future spacecraft"),
    "PSI-47": ("primary", "researchImpacts", "will require fire detection systems with increased reliability and sensitivity"),
    "PSI-20": ("primary", "researchImpacts", "BRE yielded important data relevant to spacecraft fire safety"),
    "PSI-69": ("primary", "objective", "enhancing fire safety protocols for future space missions"),
    "PSI-62": ("primary", "objective", "enable accurate prediction of flammability limits for spacecraft materials"),
    "PSI-115": ("primary", "researchImpacts", "This would directly lead to better smoke detection devices"),
    "PSI-21": ("benefit", "researchImpacts", "is critical in the suppression of fires and in improving engine efficiency"),
    "PSI-39": ("benefit", "researchImpacts", "support the design of safer spacecraft systems"),
    "PSI-60": ("benefit", "researchImpacts", "the results support safer fire detection, suppression"),
    "PSI-106": ("benefit", "researchImpacts", "Insights into flame stability and behavior to enhance fire safety"),
    "PSI-107": ("benefit", "researchImpacts", "help design safer spacecraft environments"),
    "PSI-117": ("benefit", "researchImpacts", "Potential to improve spacecraft fire-safety modeling"),
    "PSI-68": ("benefit", None, None),   # only PSI's label says "Spacecraft Fire Safety"
    "PSI-142": ("benefit", None, None),  # only PSI's label says "Spacecraft Fire Safety"
    "PSI-22": ("none", "researchImpacts", "is not being conducted to serve any space applications"),
    "PSI-10": ("none", "researchImpacts", "improving efficiency and reducing pollutant emissions in terrestrial combustors"),
    "PSI-23": ("none", "researchImpacts", "improving performance in terms of power, efficiency, pollutant emissions, and reliability"),
    "PSI-159": ("none", "researchImpacts", "This should facilitate the development of more efficient internal combustion engines"),
}
PURPOSE_SCORE = {"primary": 1, "benefit": 0.5, "none": 0}

# What one table row stands for, and which rows are real entries.
# (row meaning, column used to recognise entries, regex an entry must match)
ROWS = {
    "PSI-10_table_1.csv": ("test", None, None), "PSI-10_table_2.csv": ("test", None, None),
    "PSI-159_table_1.csv": ("test", None, None), "PSI-159_table_2.csv": ("test", None, None),
    "PSI-20_table_1.csv": ("test day", None, None), "PSI-21_table_1.csv": ("test day", None, None),
    "PSI-22_table_1.csv": ("test day", "Test Day", r"\S"),      # blank = continuation row
    "PSI-23_table_1.csv": ("test day", None, None),
    "PSI-25_table_1.csv": ("test", None, None), "PSI-26_table_1.csv": ("test", None, None),
    "PSI-39_table_1.csv": ("test", None, None), "PSI-47_table_1.csv": ("session", None, None),
    "PSI-68_table_1.csv": ("fuel (planned test matrix)", None, None),
    "PSI-69_table_1.csv": ("test", None, None),
    "PSI-98_table_1.csv": ("burn sample", "Sample Number ", r"^S\d"),   # other rows: flow visualization
    "PSI-99_table_1.csv": ("burn sample", "Sample Number", r"^2-\d"),   # other rows: flow visualization, notes
    "PSI-100_table_1.csv": ("burn sample", None, None),
    "PSI-101_table_1.csv": ("test", None, None), "PSI-102_table_1.csv": ("sample", None, None),
    "PSI-106_table_1.csv": ("test day", None, None), "PSI-107_table_1.csv": ("test", None, None),
    "PSI-142_table_1.csv": ("pointer to a figure in a publication", None, None),
}

# (file, exact column header, kind, unit as PSI states it, why we read it this way)
# kind: ambient_o2 | burner_o2 | pressure
COLUMNS = [
    ("PSI-10_table_1.csv", "XO2 (init)", "ambient_o2", "mole fraction", "Normal flames: fuel leaves the burner into an oxygen atmosphere; value before the test"),
    ("PSI-10_table_1.csv", "pinit (atm)", "pressure", "atm", "Chamber pressure before the test"),
    ("PSI-10_table_2.csv", "XO2", "burner_o2", "mole fraction", "Inverse flames: oxygen leaves the burner into a fuel atmosphere (column 'XC2H4 initial')"),
    ("PSI-10_table_2.csv", "pinit (atm)", "pressure", "atm", "Chamber pressure before the test"),
    ("PSI-159_table_1.csv", " XO2 before test", "ambient_o2", "mole fraction", "Normal flames: oxygen atmosphere before the test"),
    ("PSI-159_table_1.csv", "approx p (bar)", "pressure", "bar", "Approximate chamber pressure"),
    ("PSI-159_table_2.csv", "XO2", "burner_o2", "mole fraction", "Inverse flames: oxygen leaves the burner into a fuel atmosphere (column 'Xf  before test')"),
    ("PSI-159_table_2.csv", "approx p (bar)", "pressure", "bar", "Approximate chamber pressure"),
    ("PSI-20_table_1.csv", "Oxygen Conc (percent)", "ambient_o2", "percent", "Table note: chamber oxygen 'as diluted with nitrogen on a volume basis'; one row per test day, listing the concentrations of tests that ignited"),
    ("PSI-23_table_1.csv", "Atmosphere*", "ambient_o2", "text", "Chamber atmosphere described in words; one row per test day"),
    ("PSI-25_table_1.csv", "Calibrated  initial O2 % by vol ", "ambient_o2", "percent by volume", "Oxygen in the glovebox work volume before the test"),
    ("PSI-39_table_1.csv", "Oxygen", "ambient_o2", "mole fraction (unit not stated in header)", "Listed beside Nitrogen and Helium, which together sum to 1"),
    ("PSI-39_table_1.csv", "Pressure", "pressure", "text with unit", "Chamber pressure, written as text such as '1 atm'"),
    ("PSI-68_table_1.csv", "Oxygen Mole Fraction", "ambient_o2", "mole fraction", "One row per fuel, listing the planned values; column 'Ambient Gas Mixture'"),
    ("PSI-68_table_1.csv", "Ambient Pressure (atm)", "pressure", "atm", "One row per fuel, listing the planned values"),
    ("PSI-69_table_1.csv", "O initial ambient composition; mole fraction", "ambient_o2", "mole fraction", "Header says initial ambient composition"),
    ("PSI-69_table_1.csv", "Ambient pressure; mmHg", "pressure", "mmHg", "Header says ambient pressure"),
    ("PSI-98_table_1.csv", "Percent O2", "ambient_o2", "percent", "Oxygen in the Cygnus cabin air flowing over the sample"),
    ("PSI-99_table_1.csv", "Percent O2 (Note 1)", "ambient_o2", "percent", "Table note 1: derived from measured CO2 and the initial O2 reported by ISS"),
]

# Which column names the fuel or material, and which the airflow (file -> header[, unit]).
FUEL = {
    "PSI-10_table_1.csv": "Fuel", "PSI-159_table_1.csv": "Fuel", "PSI-159_table_2.csv": "Fuel",
    "PSI-20_table_1.csv": "Fuel Bottle", "PSI-21_table_1.csv": "Fuel Bottle", "PSI-22_table_1.csv": "Fuel Bottle",
    "PSI-23_table_1.csv": "Fuel Bottle", "PSI-25_table_1.csv": "Fuel Sample Material",
    "PSI-26_table_1.csv": "Fuel Sample Material", "PSI-39_table_1.csv": "Fuel ",
    "PSI-47_table_1.csv": "Sample Material", "PSI-68_table_1.csv": "Sample (Fuel Type)",
    "PSI-69_table_1.csv": "Fuel", "PSI-98_table_1.csv": "Material", "PSI-99_table_1.csv": "Material",
    "PSI-100_table_1.csv": "Material", "PSI-101_table_1.csv": "Sample Type",
    "PSI-102_table_1.csv": "Sample Material  ", "PSI-106_table_1.csv": "Fuel Type", "PSI-107_table_1.csv": "Fuel",
}
AIRFLOW = {
    "PSI-25_table_1.csv": ("Air display", "unit not stated in header"),
    "PSI-68_table_1.csv": ("Flow Velocity (cm/s)", "cm/s"),
    "PSI-98_table_1.csv": ("Air Flow (cm/s)", "cm/s"), "PSI-99_table_1.csv": ("Air Flow (cm/s)", "cm/s"),
    "PSI-100_table_1.csv": ("Air Flow ", "unit written in the cells"),
    "PSI-101_table_1.csv": ("Inlet velocity (cm/s)", "cm/s"), "PSI-102_table_1.csv": ("Air Flow (cm/s)", "cm/s"),
    "PSI-107_table_1.csv": ("Air Rate (cm/s)", "cm/s"),
}
# One extra column per table worth showing beside each test (the outcome, where PSI states one).
OUTCOME = {
    "PSI-69_table_1.csv": "Test end", "PSI-159_table_1.csv": "Hot ignition", "PSI-159_table_2.csv": "Hot ignition",
    "PSI-99_table_1.csv": "Burn Time (s)", "PSI-98_table_1.csv": "Burn Time (s)",
}


# ------------------------------------------------------------------- reading
def read_text(path):
    """PSI tables are UTF-8 except FLEX, which is Windows-1252."""
    data = open(path, "rb").read()
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return data.decode("cp1252")


def plain(cell):
    """float if the cell is exactly a plain number, else None."""
    return float(cell) if re.fullmatch(r"\d+(\.\d+)?|\.\d+", cell.strip()) else None


def read_cell(cell):
    """('number', [x]) | ('list', [x, y, ...]) | ('blank', []) | ('other', [])"""
    s = cell.strip()
    if not s:
        return "blank", []
    if plain(s) is not None:
        return "number", [plain(s)]
    parts = [p.strip() for p in s.split(";")]
    if len(parts) > 1 and all(plain(p) is not None for p in parts):
        return "list", [plain(p) for p in parts]
    return "other", []


def squeeze(s):
    return re.sub(r"\s+", " ", s or "").strip()


def counted(counter, limit=None):
    items = [{"text": k, "rows": n} for k, n in counter.most_common(limit)]
    return items


def r4(x):
    return round(x, 4)


def load_table(name):
    """header, [(spreadsheet row number, cells)] for entry rows, n other rows, n blank rows"""
    rows = list(csv.reader(io.StringIO(read_text(os.path.join(RAW, name)))))
    header = rows[0]
    meaning, col, rx = ROWS[name]
    entries, other, blank = [], 0, 0
    for n, r in enumerate(rows[1:], 2):
        if not any(c.strip() for c in r):
            blank += 1
            continue
        r = r + [""] * (len(header) - len(r))
        if col is not None and not re.search(rx, r[header.index(col)].strip()):
            other += 1
            continue
        entries.append((n, r))
    return header, entries, other, blank


def show(x):
    """A computed number as text: whole numbers plain, others with at most 2 decimals."""
    if isinstance(x, bool) or not isinstance(x, (int, float)):
        return str(x)
    return f"{x:.2f}".rstrip("0").rstrip(".") if x != int(x) else str(int(x))


def load_content(inv, summary):
    """Reads the AI-written plain-language text, fills its {{...}} placeholders from
    computed values, and refuses anything that cannot be checked."""
    content = json.load(open(CONTENT, encoding="utf-8"))

    def fill(text, where):
        def one(m):
            node = {"s": summary, **inv}
            path = m.group(1).split(".")
            # ids contain no dots, so the first part is "s" or a PSI id
            try:
                for part in path:
                    node = node[int(part)] if isinstance(node, list) else node[part]
            except (KeyError, IndexError, ValueError):
                sys.exit(f"content: {where}: placeholder {m.group(0)} has no value")
            if isinstance(node, (dict, list)) or node is None:
                sys.exit(f"content: {where}: placeholder {m.group(0)} is not a single value")
            return show(node)
        if re.search(r"\d", re.sub(r"\{\{.*?\}\}", "", text)):
            typed = re.sub(r"\{\{.*?\}\}", "", text)
            # the Moon Base thresholds and "1-g" style words are the only digits allowed as typed text
            typed = re.sub(r"(30 %|10\.2 psi|1-g|21 %)", "", typed)
            if re.search(r"\d", typed):
                sys.exit(f"content: {where}: a number is typed by hand: {text!r}")
        return re.sub(r"\{\{(.*?)\}\}", one, text)

    def check_quote(acc, field, quote, where):
        if acc not in inv:
            sys.exit(f"content: {where}: unknown investigation {acc}")
        if squeeze(quote) not in squeeze(inv[acc]["text"].get(field, "")):
            sys.exit(f"content: {where}: quote not found word for word in {acc}.{field}: {quote!r}")

    summaries = content["summaries"]
    if set(summaries) != set(inv):
        sys.exit("content: summaries do not cover exactly the investigations in the snapshot")
    for acc, s in summaries.items():
        s["did"] = fill(s["did"], acc)
        for p in s["points"]:
            if p["kind"] not in ("aim", "expected", "result", "stated"):
                sys.exit(f"content: {acc}: unknown kind {p['kind']}")
            p["text"] = fill(p["text"], acc)
            check_quote(acc, p["field"], p["quote"], acc)
    for q in content["questions"]:
        if q["status"] not in ("answered", "partly", "open"):
            sys.exit(f"content: question {q['id']}: unknown status")
        for k in ("answer", "missing"):
            q[k] = fill(q[k], q["id"])
        for e in q["evidence"]:
            e["text"] = fill(e["text"], q["id"])
            if e["kind"] == "record":
                check_quote(e["inv"], e["field"], e["quote"], q["id"])
            elif e["kind"] != "table" or e["inv"] not in inv:
                sys.exit(f"content: question {q['id']}: bad evidence entry")
    return summaries, content["questions"]


def load_attributes(inv):
    """Reads the AI-extracted attributes (sample, what varied, airflow, what was measured,
    Earth use) and refuses any that cannot be checked against NASA's record or table headers."""
    content = json.load(open(ATTRS, encoding="utf-8"))
    measures = content["measures"]
    keys = {m[0] for m in measures}
    if set(content["investigations"]) != set(inv):
        sys.exit("attributes: do not cover exactly the investigations in the snapshot")

    def check(acc, item, where):
        if item is None:
            return
        if "column" in item:
            if not any(item["column"] in t["header"] for t in inv[acc]["tables"]):
                sys.exit(f"attributes: {where}: column {item['column']!r} is not in any table of {acc}")
        elif squeeze(item["quote"]) not in squeeze(inv[acc]["text"].get(item["field"], "")):
            sys.exit(f"attributes: {where}: quote not found word for word in {acc}.{item['field']}: {item['quote']!r}")

    for acc, a in content["investigations"].items():
        for k in ("sample", "varied", "flow", "earth"):
            if k not in a:
                sys.exit(f"attributes: {acc}: missing {k}")
            check(acc, a[k], f"{acc}.{k}")
        if a["sample"] is None:
            sys.exit(f"attributes: {acc}: every investigation needs a sample or burner")
        for mk, item in a["measured"].items():
            if mk not in keys:
                sys.exit(f"attributes: {acc}: unknown measurement {mk}")
            check(acc, item, f"{acc}.measured.{mk}")
    return measures, content["investigations"]


def main():
    os.makedirs(OUT, exist_ok=True)
    manifest = json.load(open(os.path.join(RAW, "manifest.json"), encoding="utf-8"))
    recs = {}
    for f in os.listdir(RAW):
        if re.fullmatch(r"PSI-\d+\.json", f):
            j = json.load(open(os.path.join(RAW, f), encoding="utf-8"))
            recs[j["accession"]] = j
    order = sorted(recs, key=lambda a: int(a.split("-")[1]))
    if set(order) != set(INV) or set(order) != set(PURPOSE):
        sys.exit("INV / PURPOSE do not cover exactly the investigations in the snapshot")
    tables = sorted((f for f in os.listdir(RAW) if "_table_" in f),
                    key=lambda f: (int(re.search(r"PSI-(\d+)", f).group(1)), f))
    if set(tables) != set(ROWS):
        sys.exit("ROWS does not cover exactly the tables in the snapshot")
    declared = collections.defaultdict(dict)
    for (t, col, kind, unit, why) in COLUMNS:
        declared[t][kind] = (col, unit, why)

    for pr in PRESETS:
        if pr.get("quote") and squeeze(pr["quote"]) not in squeeze(recs[pr["record"]].get(pr["field"])):
            sys.exit(f"preset {pr['id']}: its figures are not found word for word in {pr['record']}.{pr['field']}")

    papers = json.load(open(PAPERS, encoding="utf-8")) if os.path.exists(PAPERS) else []
    paper_by_doi = {p["doi"]: p for p in papers}

    investigations, tests = [], []
    for acc in order:
        j = recs[acc]
        cls, ground, own_name = INV[acc]
        level, field, quote = PURPOSE[acc]
        if quote is not None and squeeze(quote) not in squeeze(j.get(field)):
            sys.exit(f"{acc}: purpose quote not found word for word in {field}")
        sub_area = squeeze(j.get("subResearchArea"))
        if quote is None:
            if "Fire Safety" not in sub_area:
                sys.exit(f"{acc}: no quote and PSI's label does not say Fire Safety")
            purpose_detail = (f"PSI lists it under \"{sub_area}\"; the record's own text does not "
                              f"mention fire safety")
        else:
            purpose_detail = None

        inv_tables = []
        o2 = {"numbers": [], "list_rows": 0, "list_rows_ge": 0, "list_values": [], "other": collections.Counter(),
              "entry_rows": 0, "has_column": False}
        pr = {"numbers": [], "other": collections.Counter(), "zero": 0, "has_column": False}
        both_rows, both_in = 0, 0
        for t in [x for x in tables if x.startswith(acc + "_")]:
            header, entries, other_rows, blank_rows = load_table(t)
            d = declared.get(t, {})
            idx = {k: header.index(v[0]) for k, v in d.items()}
            fuel_i = header.index(FUEL[t]) if t in FUEL else None
            out_i = header.index(OUTCOME[t]) if t in OUTCOME else None
            tinfo = {
                "file": t, "psi_file_name": manifest[t]["psi_file_name"], "sha256": manifest[t]["sha256"],
                "retrieved": manifest[t]["retrieved"], "row_meaning": ROWS[t][0], "entries": len(entries),
                "other_rows": other_rows, "blank_rows": blank_rows, "header": header,
            }
            # what varies between rows
            varies = []
            for ci, h in enumerate(header):
                if len({r[ci].strip() for _, r in entries}) > 1:
                    varies.append(h)
            tinfo["varies"] = varies
            if fuel_i is not None:
                c = collections.Counter(r[fuel_i].strip() for _, r in entries if r[fuel_i].strip())
                tinfo["fuel"] = {"column": FUEL[t], "distinct": len(c), "values": counted(c, 60)}
            if t in AIRFLOW:
                col, unit = AIRFLOW[t]
                ci = header.index(col)
                nums = [plain(r[ci]) for _, r in entries if plain(r[ci]) is not None]
                oth = collections.Counter(r[ci].strip() for _, r in entries
                                          if r[ci].strip() and plain(r[ci]) is None)
                tinfo["airflow"] = {"column": col, "unit": unit, "numbers": len(nums),
                                    "min": min(nums) if nums else None, "max": max(nums) if nums else None,
                                    "other_cells": counted(oth, 12), "other_distinct": len(oth)}

            for kind in ("ambient_o2", "burner_o2", "pressure"):
                if kind not in d:
                    continue
                col, unit, why = d[kind]
                ci = idx[kind]
                info = {"column": col, "unit_as_stated": unit, "why": why, "numbers": 0, "min": None, "max": None,
                        "list_cells": [], "other_cells": [], "blank": 0}
                nums, lists, oth = [], collections.Counter(), collections.Counter()
                for _, r in entries:
                    k, vals = read_cell(r[ci])
                    if k == "number":
                        nums += vals
                    elif k == "list":
                        lists[r[ci]] += 1
                    elif k == "blank":
                        info["blank"] += 1
                    else:
                        oth[r[ci].strip()] += 1
                if kind == "pressure":
                    f = PSI_PER.get(unit)
                    conv = [v * f for v in nums if v > 0] if f else []
                    info.update(numbers=len(nums), zero_cells=sum(1 for v in nums if v == 0),
                                min_as_stated=min((v for v in nums if v > 0), default=None),
                                max_as_stated=max(nums, default=None),
                                min=r4(min(conv)) if conv else None, max=r4(max(conv)) if conv else None,
                                converted_to="psi" if f else None,
                                at_or_below=sum(1 for v in conv if v <= MOON_P_MAX))
                    pr["has_column"] = True
                    pr["numbers"] += conv
                    pr["zero"] += info["zero_cells"]
                    pr["other"].update(oth)
                    pr["other"].update({k: n for k, n in lists.items()})
                else:
                    scale = 100 if unit.startswith("mole fraction") else 1
                    pct = [v * scale for v in nums]
                    info.update(numbers=len(nums), min=r4(min(pct)) if pct else None,
                                max=r4(max(pct)) if pct else None, times_100=scale == 100,
                                at_or_above=sum(1 for v in pct if v >= MOON_O2_MIN))
                    for cell, n in lists.items():
                        vals = [v * scale for v in read_cell(cell)[1]]
                        info["list_cells"].append({"text": cell, "rows": n, "percent": [r4(v) for v in vals]})
                    if kind == "ambient_o2":
                        o2["has_column"] = True
                        o2["numbers"] += pct
                        o2["entry_rows"] += len(entries)
                        for cell, n in lists.items():
                            vals = [v * scale for v in read_cell(cell)[1]]
                            o2["list_rows"] += n
                            o2["list_values"] += vals
                            if any(v >= MOON_O2_MIN for v in vals):
                                o2["list_rows_ge"] += n
                        o2["other"].update(oth)
                info["other_cells"] = counted(oth, 30) if kind != "pressure" else counted(oth + lists, 30)
                tinfo[kind] = info

            # one entry per table row: for the charts, the test finder and the download.
            # Tables with no oxygen, pressure or fuel column (pointers to figures) are left out.
            if d or t in FUEL:
                for n, r in entries:
                    p = {"inv": acc, "table": t, "row": n, "cls": cls}
                    if fuel_i is not None:
                        p["fuel"] = r[fuel_i].strip()
                    elif t == "PSI-10_table_2.csv":
                        p["fuel"] = "C2H4 atmosphere"
                    if out_i is not None and r[out_i].strip():
                        p["outcome"] = OUTCOME[t].strip() + ": " + r[out_i].strip()
                    for kind, key in (("ambient_o2", "o2"), ("burner_o2", "burner_o2")):
                        if kind in d:
                            cell = r[idx[kind]]
                            k, vals = read_cell(cell)
                            scale = 100 if d[kind][1].startswith("mole fraction") else 1
                            p[key + "_raw"] = cell
                            if k == "number":
                                p[key] = r4(vals[0] * scale)
                            elif k == "list":
                                p[key + "_list"] = [r4(v * scale) for v in vals]
                    if "pressure" in d:
                        cell = r[idx["pressure"]]
                        f = PSI_PER.get(d["pressure"][1])
                        p["p_raw"] = cell
                        p["p_unit"] = d["pressure"][1]
                        if f and plain(cell) is not None and plain(cell) > 0:
                            p["p_psi"] = r4(plain(cell) * f)
                    if "o2" in p and "p_psi" in p:
                        both_rows += 1
                        p["in_zone"] = p["o2"] >= MOON_O2_MIN and p["p_psi"] <= MOON_P_MAX
                        both_in += p["in_zone"]
                    tests.append(p)
            inv_tables.append(tinfo)

        # ---- the five Moon Base conditions
        crit = {}
        crit["purpose"] = {"value": level, "score": PURPOSE_SCORE[level], "quote": quote, "field": field,
                           "detail": purpose_detail, "psi_sub_research_area": sub_area or None}
        mscore = CLASS_SCORE[cls] * (0.5 if ground else 1)
        crit["material"] = {"value": "yes" if mscore == 1 else "partly" if mscore else "no", "score": mscore,
                            "detail": CLASS_LABEL[cls] + (" (computer model or ground study)" if ground else "")}
        if not inv_tables:
            for k in ("oxygen", "pressure", "both"):
                crit[k] = {"value": "no table", "score": 0, "detail": "PSI holds no Experimental Table for this investigation"}
        else:
            vals = o2["numbers"] + o2["list_values"]
            if vals and max(vals) >= MOON_O2_MIN:
                n_ge = sum(1 for v in o2["numbers"] if v >= MOON_O2_MIN)
                parts = []
                if o2["numbers"]:
                    parts.append(f"{n_ge} of {len(o2['numbers'])} rows with a plain number")
                if o2["list_rows"]:
                    parts.append(f"listed on {o2['list_rows_ge']} of {o2['list_rows']} rows that list several values")
                crit["oxygen"] = {"value": "yes", "score": 1, "detail": "; ".join(parts) + f". Highest: {show(max(vals))} %",
                                  "max": r4(max(vals)), "min": r4(min(vals))}
            elif vals:
                crit["oxygen"] = {"value": "no", "score": 0, "max": r4(max(vals)), "min": r4(min(vals)),
                                  "detail": f"Highest ambient oxygen stated: {show(max(vals))} %"}
            elif o2["has_column"]:
                crit["oxygen"] = {"value": "text", "score": 0, "detail": "Stated only as text, not counted: "
                                  + "; ".join(k for k, _ in o2["other"].most_common(6))}
            else:
                crit["oxygen"] = {"value": "not stated", "score": 0,
                                  "detail": "No ambient oxygen column in the Experimental Table"}
            if pr["numbers"] and min(pr["numbers"]) <= MOON_P_MAX:
                n_le = sum(1 for v in pr["numbers"] if v <= MOON_P_MAX)
                crit["pressure"] = {"value": "yes", "score": 1, "min": r4(min(pr["numbers"])), "max": r4(max(pr["numbers"])),
                                    "detail": f"{n_le} of {len(pr['numbers'])} rows with a plain number. Lowest: {show(min(pr['numbers']))} psi"}
            elif pr["numbers"]:
                crit["pressure"] = {"value": "no", "score": 0, "min": r4(min(pr["numbers"])), "max": r4(max(pr["numbers"])),
                                    "detail": f"Lowest pressure stated: {show(min(pr['numbers']))} psi"}
            elif pr["has_column"]:
                crit["pressure"] = {"value": "text", "score": 0, "detail": "Stated only as text, not counted: "
                                    + "; ".join(k.strip() for k, _ in pr["other"].most_common(7))}
            else:
                crit["pressure"] = {"value": "not stated", "score": 0,
                                    "detail": "No pressure column in the Experimental Table"}
            if both_in:
                crit["both"] = {"value": "yes", "score": 1, "rows": both_in, "of": both_rows,
                                "detail": f"{both_in} of {both_rows} rows that state both as plain numbers"}
            elif both_rows:
                crit["both"] = {"value": "no", "score": 0, "rows": 0, "of": both_rows,
                                "detail": f"0 of {both_rows} rows that state both as plain numbers"}
            else:
                crit["both"] = {"value": "not stated", "score": 0,
                                "detail": "No row states both oxygen and pressure as plain numbers"}
        score = sum(c["score"] for c in crit.values())

        pubs = []
        for p in j.get("publications") or []:
            doi = re.sub(r"^https?://(dx\.)?doi\.org/", "", (p.get("doi") or "").strip().lower())
            oa = paper_by_doi.get(doi, {})
            pubs.append({"title": squeeze(p.get("title")), "authors": squeeze(p.get("authorList")),
                         "doi": doi or None, "year": oa.get("year"), "venue": oa.get("venue"),
                         "abstract_available": bool(oa.get("abstract"))})

        investigations.append({
            "id": acc, "acronym": squeeze(j.get("investigationAcronym")) or None,
            "name": squeeze(j.get("investigationAcronym")) or own_name, "name_is_ours": not squeeze(j.get("investigationAcronym")),
            "title": squeeze(j.get("title")), "doi": j.get("doi") or None, "psi_url": PSI_PAGE + acc,
            "project_type": squeeze(j.get("projectType")), "flight_program": squeeze(j.get("flightProgram")) or None,
            "hardware": squeeze(j.get("experimentHardware")) or None, "sub_research_area": sub_area or None,
            "start": j.get("investigationStartDate") or None, "end": j.get("investigationEndDate") or None,
            "center": squeeze(j.get("managingNasaCenter")) or None, "license": j.get("licenseIdentifier") or None,
            "total_file_size_bytes": j.get("totalFileSize"),
            "related": [x.strip() for x in (j.get("related_glds") or "").split(",") if x.strip()],
            "record_sha256": manifest[acc + ".json"]["sha256"], "record_retrieved": manifest[acc + ".json"]["retrieved"],
            "text": {k: (j.get(k) or "").strip() for k in ("objective", "approach", "hypothesis", "researchImpacts")},
            "cls": cls, "cls_label": CLASS_LABEL[cls], "ground": ground,
            "gravity": "Earth laboratory or computer model" if ground else "Microgravity",
            "tables": inv_tables, "criteria": crit, "score": score,
            "publications": pubs, "publications_with_doi": sum(1 for p in pubs if p["doi"]),
            "publications_with_abstract": sum(1 for p in pubs if p["abstract_available"]),
        })

    # ---- rank: more conditions met first; ties by purpose, material, then PSI number
    ranked = sorted(investigations, key=lambda i: (-i["score"], -i["criteria"]["purpose"]["score"],
                                                   -i["criteria"]["material"]["score"], int(i["id"].split("-")[1])))
    for n, i in enumerate(ranked, 1):
        i["rank"] = n

    # ---- headline numbers, all computed here so the page never does arithmetic of its own
    amb = [t for t in tests if "o2" in t]
    both = [t for t in tests if "in_zone" in t]
    zone = [t for t in both if t["in_zone"]]
    by_cls = collections.defaultdict(list)
    for t in amb:
        by_cls[t["cls"]].append(t["o2"])
    summary = {
        "investigations": len(investigations),
        "with_table": sum(1 for i in investigations if i["tables"]),
        "tables": len(tables),
        "entry_rows": sum(t["entries"] for i in investigations for t in i["tables"]),
        "state_ambient_o2": sum(1 for i in investigations if any("ambient_o2" in t for t in i["tables"])),
        "state_pressure": sum(1 for i in investigations if any("pressure" in t for t in i["tables"])),
        "rows_with_plain_ambient_o2": len(amb),
        "rows_with_o2_at_or_above": sum(1 for t in amb if t["o2"] >= MOON_O2_MIN),
        "rows_with_both": len(both), "rows_in_zone": len(zone),
        "investigations_in_zone": sorted({t["inv"] for t in zone}, key=lambda a: int(a.split("-")[1])),
        "classes_in_zone": sorted({t["cls"] for t in zone}),
        "o2_range_by_class": {c: {"min": r4(min(v)), "max": r4(max(v)), "rows": len(v),
                                  "rows_at_or_above": sum(1 for x in v if x >= MOON_O2_MIN)}
                              for c, v in by_cls.items()},
        "purpose_counts": dict(collections.Counter(i["criteria"]["purpose"]["value"] for i in investigations)),
        "best_score": max(i["score"] for i in investigations), "max_score": 5,
        "meet_all_five": sum(1 for i in investigations if i["score"] == 5),
        "publications": sum(len(i["publications"]) for i in investigations),
        "unique_dois": len(papers), "dois_with_abstract": sum(1 for p in papers if p.get("abstract")),
    }
    # which records mention the Moon, Mars or partial gravity anywhere in their text fields
    words = re.compile(r"\b(moon|lunar|mars|martian|partial[- ]gravity|partial[- ]g)\b", re.I)
    mention = [i["id"] for i in investigations if words.search(" ".join(i["text"].values()) + " " + i["title"])]
    summary["records_mentioning_moon_or_partial_gravity"] = len(mention)
    summary["records_mentioning_moon_or_partial_gravity_ids"] = mention

    summaries, questions = load_content({i["id"]: i for i in investigations}, summary)
    for i in investigations:
        i["summary"] = summaries[i["id"]]
    measures, attributes = load_attributes({i["id"]: i for i in investigations})
    for i in investigations:
        i["attributes"] = attributes[i["id"]]

    # the Experimental Tables, byte for byte, so the page can show any row it cites
    tdir = os.path.join(OUT, "tables")
    os.makedirs(tdir, exist_ok=True)
    for t in tables:
        with open(os.path.join(RAW, t), "rb") as src, open(os.path.join(tdir, t), "wb") as dst:
            dst.write(src.read())

    # sentences on the page that depend on the shape of the result, not just its numbers
    if summary["investigations_in_zone"] != ["PSI-159"] or summary["classes_in_zone"] != ["gas"]:
        sys.exit("the page text assumes the only in-zone tests are gas flames in PSI-159; revise it")
    if summary["o2_range_by_class"]["solid"]["rows_at_or_above"] != 0:
        sys.exit("the page text assumes no solid-material test at 30 % oxygen or more; revise it")

    retrieved = sorted(v["retrieved"] for v in manifest.values())
    dataset = {
        "about": {
            "source": "NASA Physical Sciences Informatics (PSI) repository, Combustion Science",
            "source_url": "https://psi.nasa.gov/physci/repo/search?q=combustion",
            "snapshot_retrieved_from": retrieved[0], "snapshot_retrieved_to": retrieved[-1],
            "built_by": "scripts/build_dataset.py (written with AI assistance: Claude Code, Anthropic)",
            "moon_base": {"o2_min_percent": MOON_O2_MIN, "pressure_max_psi": MOON_P_MAX,
                          "source": "NASA Space Apps 2026 challenge statement, Flame in Freefall"},
            "conversions": {"mole fraction to percent": "x 100", "psi per unit": PSI_PER},
            "class_labels": CLASS_LABEL,
            "presets": PRESETS,
            "measures": measures,
        },
        "summary": summary,
        "questions": questions,
        "investigations": ranked,
    }
    with open(os.path.join(OUT, "dataset.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(dataset, f, ensure_ascii=False, indent=1)
    with open(os.path.join(OUT, "tests.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(tests, f, ensure_ascii=False, separators=(",", ":"))

    with open(os.path.join(OUT, "investigations.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["rank", "psi_id", "name", "title", "doi", "psi_url", "project_type", "what_burns (our label)",
                    "conditions_met_of_5", "purpose", "tests_solid_materials", "oxygen_30pct_or_more",
                    "ambient_o2_min_pct", "ambient_o2_max_pct", "pressure_10.2psi_or_less", "pressure_min_psi",
                    "pressure_max_psi", "both_in_same_test", "rows_in_moon_base_zone", "table_entry_rows",
                    "publications", "license"])
        for i in ranked:
            c = i["criteria"]
            w.writerow([i["rank"], i["id"], i["name"], i["title"], i["doi"], i["psi_url"], i["project_type"],
                        i["cls_label"], i["score"], c["purpose"]["value"], c["material"]["value"],
                        c["oxygen"]["value"], c["oxygen"].get("min", ""), c["oxygen"].get("max", ""),
                        c["pressure"]["value"], c["pressure"].get("min", ""), c["pressure"].get("max", ""),
                        c["both"]["value"], c["both"].get("rows", ""), sum(t["entries"] for t in i["tables"]),
                        len(i["publications"]), i["license"] or ""])
    with open(os.path.join(OUT, "attributes.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["psi_id", "name", "what_burns (our label)", "sample_or_burner", "what_varied", "airflow", "earth_use"]
                   + ["measured_" + m[0] for m in measures] + ["evidence (NASA's words or table column)"])
        for i in sorted(ranked, key=lambda x: int(x["id"].split("-")[1])):
            a = i["attributes"]
            ev = []
            for k in ("sample", "varied", "flow", "earth"):
                if a[k]:
                    ev.append(k + ": " + (("column " + a[k]["column"].strip()) if "column" in a[k] else '"' + a[k]["quote"] + '"'))
            for mk, item in a["measured"].items():
                ev.append(mk + ": " + (("column " + item["column"].strip()) if "column" in item else '"' + item["quote"] + '"'))
            w.writerow([i["id"], i["name"], i["cls_label"]] + [(a[k]["text"] if a[k] else "not stated") for k in ("sample", "varied", "flow", "earth")]
                       + [("yes" if m[0] in a["measured"] else "") for m in measures] + [" | ".join(ev)])
    with open(os.path.join(OUT, "tests.csv"), "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["psi_id", "table_file", "spreadsheet_row", "what_burns (our label)", "fuel_or_material_as_written",
                    "ambient_o2_as_written", "ambient_o2_percent", "ambient_o2_listed_percent",
                    "burner_flow_o2_as_written", "burner_flow_o2_percent", "pressure_as_written", "pressure_unit",
                    "pressure_psi", "in_moon_base_zone", "outcome_as_written"])
        for t in tests:
            w.writerow([t["inv"], t["table"], t["row"], CLASS_LABEL[t["cls"]], t.get("fuel", ""),
                        t.get("o2_raw", ""), t.get("o2", ""), "; ".join(str(v) for v in t.get("o2_list", [])),
                        t.get("burner_o2_raw", ""), t.get("burner_o2", ""), t.get("p_raw", ""), t.get("p_unit", ""),
                        t.get("p_psi", ""), t.get("in_zone", ""), t.get("outcome", "")])

    print(f"{len(investigations)} investigations, {len(tests)} table rows")
    print("summary:", json.dumps(summary, indent=1))
    print("rank:", ", ".join(f"{i['rank']}. {i['name']} ({i['score']:g})" for i in ranked))


if __name__ == "__main__":
    main()
