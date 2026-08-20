# Paid circulation — digital vs print

Analysis workspace for **paid** digital and print circulation by publication, type, and quarter.

The unit is **average paid copies per issue in the quarter**, not unique subscribers and not total copies printed in the period. Digital (`circulação digital paga`) and print (`circulação impressa paga`) are separate channels.

The source file is an APCT-style HTML table saved as `export.xls`.

## What’s in the data

`data.json` currently holds **83** titles (59 magazines, 24 newspapers) across four quarters.

- **67** titles reported copies in at least one quarter.
- **16** filed zeros in every quarter. Those are treated as missing filings, not true zero circulation.
- Periodicity is as filed: daily, weekly, fortnightly, monthly, bimonthly, quarterly, four-monthly, twice-monthly, annual.

A daily and a monthly are not comparable as reach. Summing titles is a copy pile, not an audience.

## Usage

The page reads publications from `data.json` at runtime (`fetch` in `js/app.js`). Browsers block that from a `file://` URL, so serve the folder over HTTP:

```bash
python -m http.server 8000
```

Then open http://localhost:8000/

The Overview briefing, KPIs, charts, and table are all computed from `data.json`. After a new parse, reload the page — you do not need to edit `index.html`.

### Filters and views

| View | What it is for |
|---|---|
| Overview | Briefing from the full file, then KPIs and charts for the current filters |
| Rankings | Titles on a shared scale. Click a bar to pin it |
| Digital mix | Print vs digital scatter, and how digital share is distributed |
| Change | Slope, percent change, and waterfall between two quarters |
| Compare | Up to six pinned titles |
| Table | Sortable rows with sparklines; **Export CSV** downloads the filtered set |

Filters stay visible: type, periodicity, reporting, quarter (or active-quarter average), frequency weighting, and search. They apply to every view except the Overview briefing, which always uses the reporting titles in `data.json`.

Non-reporting titles (all zeros) are off by default — zeros are usually missing filings, not true zero circulation.

Frequency weighting, when enabled, uses 78 daily, 13 weekly, 6.5 fortnightly, and 3 monthly issues per quarter.

Keyboard: <kbd>/</kbd> search · <kbd>1</kbd>–<kbd>6</kbd> views · <kbd>Esc</kbd> close the guide.

### Refresh from a new export

Replace `export.xls`, then:

```bash
python scripts/parse_export.py
```

That writes `data.json`. The file is HTML (`<table>…`), not a binary Excel workbook. The parser skips the two header rows and reads eleven columns: name, type, periodicity, then digital/print for Q1–Q4.

No extra Python packages are required. Reload the local server page after parsing.

## `data.json` shape

```json
{
  "source": "export.xls",
  "label": "Paid circulation · four quarters",
  "unit": "Average paid copies per issue in the quarter",
  "quarters": ["Q1", "Q2", "Q3", "Q4"],
  "publications": [
    {
      "name": "Expresso",
      "type": "Jornal",
      "periodicity": "Semanal",
      "quarters": {
        "Q1": { "digital": 0, "print": 0 },
        "Q2": { "digital": 0, "print": 0 },
        "Q3": { "digital": 0, "print": 0 },
        "Q4": { "digital": 0, "print": 0 }
      }
    }
  ]
}
```

`type` is `Jornal` or `Revista`. `periodicity` is the Portuguese label from the export.

## How to read the numbers

- **Zeros** are usually a title that did not file that quarter, especially irregular magazines.
- **Averages** over a title should use only quarters that reported copies.
- **Q1 vs Q4 change** should only compare titles present in both quarters, so a missing filing is not counted as a collapse.
- **Digital share** of the market is circulation-weighted. Most titles are print-only or nearly so; a few newspapers dominate digital.

## Layout

```
export.xls                 APCT HTML export
data.json                  parsed publications
scripts/parse_export.py    export.xls → data.json
index.html                 analysis page
css/app.css
js/app.js                  loads data.json; briefing, charts, filters, table
```
