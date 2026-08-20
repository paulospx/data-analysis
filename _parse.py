from pathlib import Path
from html.parser import HTMLParser
from html import unescape
from collections import Counter
import json
import re

raw = Path(r"C:\Repos\publications_data\export.xls").read_text(encoding="utf-8")


class T(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.row = None
        self.cell = None
        self.colspan = 1

    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == "tr":
            self.row = []
        if tag in ("td", "th"):
            self.cell = ""
            self.colspan = int(d.get("colspan", 1))

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.row is not None:
            self.row.append((unescape(self.cell or "").strip(), self.colspan))
            self.cell = None
        if tag == "tr" and self.row is not None:
            self.rows.append(self.row)
            self.row = None

    def handle_data(self, data):
        if self.cell is not None:
            self.cell += data

    def handle_entityref(self, name):
        if self.cell is not None:
            self.cell += unescape(f"&{name};")

    def handle_charref(self, name):
        if self.cell is not None:
            self.cell += unescape(f"&#{name};")


p = T()
p.feed(raw)
print("nrows", len(p.rows))
for i, r in enumerate(p.rows[:3]):
    print(i, [(c[0][:60], c[1]) for c in r], "ncells", len(r))
print("--- last 3 ---")
for i, r in enumerate(p.rows[-3:]):
    print(len(p.rows) - 3 + i, [(c[0][:50], c[1]) for c in r], "ncells", len(r))

types = set()
pers = set()
data_rows = []
for r in p.rows[2:]:
    cells = [c[0] for c in r]
    if len(cells) < 11:
        print("short", cells)
        continue
    name, typ, per = cells[0], cells[1], cells[2]
    nums = [int(re.sub(r"[^0-9-]", "", x) or 0) for x in cells[3:11]]
    types.add(typ)
    pers.add(per)
    data_rows.append(
        {
            "name": name,
            "type": typ,
            "periodicity": per,
            "q1d": nums[0],
            "q1p": nums[1],
            "q2d": nums[2],
            "q2p": nums[3],
            "q3d": nums[4],
            "q3p": nums[5],
            "q4d": nums[6],
            "q4p": nums[7],
        }
    )

print("n pubs", len(data_rows))
print("types", types)
print("periodicity", pers)
print(
    "zero all",
    sum(1 for d in data_rows if sum(d[k] for k in d if k.startswith("q")) == 0),
)
print(
    "has digital",
    sum(1 for d in data_rows if d["q1d"] + d["q2d"] + d["q3d"] + d["q4d"] > 0),
)
print(
    "has print",
    sum(1 for d in data_rows if d["q1p"] + d["q2p"] + d["q3p"] + d["q4p"] > 0),
)
print("type counts", Counter(d["type"] for d in data_rows))
print("per counts", Counter(d["periodicity"] for d in data_rows))

for d in data_rows:
    d["avg_total"] = sum(d[k] for k in d if k.startswith("q")) / 4
    d["avg_d"] = (d["q1d"] + d["q2d"] + d["q3d"] + d["q4d"]) / 4
    d["avg_p"] = (d["q1p"] + d["q2p"] + d["q3p"] + d["q4p"]) / 4

top = sorted(data_rows, key=lambda x: -x["avg_total"])[:25]
print("TOP 25")
for d in top:
    print(
        f"{d['name'][:42]:42} {d['type']:12} {d['periodicity']:14} D={d['avg_d']:.0f} P={d['avg_p']:.0f} T={d['avg_total']:.0f}"
    )

print("grand avg digital", sum(d["avg_d"] for d in data_rows))
print("grand avg print", sum(d["avg_p"] for d in data_rows))

# save json
out = []
for d in data_rows:
    out.append(
        {
            "name": d["name"],
            "type": d["type"],
            "periodicity": d["periodicity"],
            "quarters": {
                "Q1": {"digital": d["q1d"], "print": d["q1p"]},
                "Q2": {"digital": d["q2d"], "print": d["q2p"]},
                "Q3": {"digital": d["q3d"], "print": d["q3p"]},
                "Q4": {"digital": d["q4d"], "print": d["q4p"]},
            },
        }
    )
Path(r"C:\Repos\publications_data\data.json").write_text(
    json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8"
)
print("wrote data.json", len(out))
