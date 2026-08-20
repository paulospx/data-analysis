"""Parse APCT-style HTML .xls export into data.json."""
from pathlib import Path
from html.parser import HTMLParser
from html import unescape
import json
import re

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "export.xls"
OUT = ROOT / "data.json"


class TableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.rows = []
        self.row = None
        self.cell = None

    def handle_starttag(self, tag, attrs):
        if tag == "tr":
            self.row = []
        if tag in ("td", "th"):
            self.cell = ""

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self.row is not None:
            self.row.append(unescape(self.cell or "").strip())
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


def parse_int(value):
    cleaned = re.sub(r"[^0-9-]", "", value or "")
    return int(cleaned) if cleaned else 0


def main():
    raw = SRC.read_text(encoding="utf-8")
    parser = TableParser()
    parser.feed(raw)
    publications = []
    for row in parser.rows[2:]:
        if len(row) < 11:
            continue
        name = re.sub(r"\s+", " ", row[0]).strip()
        publications.append(
            {
                "name": name,
                "type": row[1],
                "periodicity": row[2],
                "quarters": {
                    "Q1": {"digital": parse_int(row[3]), "print": parse_int(row[4])},
                    "Q2": {"digital": parse_int(row[5]), "print": parse_int(row[6])},
                    "Q3": {"digital": parse_int(row[7]), "print": parse_int(row[8])},
                    "Q4": {"digital": parse_int(row[9]), "print": parse_int(row[10])},
                },
            }
        )
    OUT.write_text(
        json.dumps(
            {
                "source": "export.xls",
                "label": "Paid circulation · four quarters",
                "unit": "Average paid copies per issue in the quarter",
                "quarters": ["Q1", "Q2", "Q3", "Q4"],
                "publications": publications,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"Wrote {len(publications)} publications to {OUT}")


if __name__ == "__main__":
    main()
