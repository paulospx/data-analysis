const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

const ISSUES_PER_QUARTER = {
  Diário: 78,
  Semanal: 13,
  Quinzenal: 6.5,
  Bimensal: 6.5,
  Mensal: 3,
  Bimestral: 1.5,
  Trimestral: 1,
  Quadrimestral: 0.75,
  Anual: 0.25,
};

const PERIOD_LABEL = {
  Diário: "Daily",
  Semanal: "Weekly",
  Quinzenal: "Fortnightly",
  Bimensal: "Twice-monthly",
  Mensal: "Monthly",
  Bimestral: "Bimonthly",
  Trimestral: "Quarterly",
  Quadrimestral: "Four-monthly",
  Anual: "Annual",
};

const PERIOD_ORDER = [
  "Diário",
  "Semanal",
  "Quinzenal",
  "Bimensal",
  "Mensal",
  "Bimestral",
  "Trimestral",
  "Quadrimestral",
  "Anual",
];

const TYPE_LABEL = { Jornal: "Newspaper", Revista: "Magazine" };
const VIEWS = ["overview", "rankings", "mix", "change", "compare", "table"];
const MAX_PINS = 6;

const C = {
  digital: "#1f4e79",
  print: "#b4532a",
  up: "#2f6b45",
  down: "#9b2c2c",
  ink: "#1c1915",
  muted: "#6f675c",
  line: "#d4ccbb",
  paper: "#e8e2d4",
  card: "#fffcf6",
};

const state = {
  meta: { source: "", label: "", unit: "", quarters: QUARTERS },
  pubs: [],
  view: "overview",
  search: "",
  types: new Set(["Jornal", "Revista"]),
  periodicities: new Set(),
  reporting: "reporting",
  quarter: "avg",
  weighted: false,
  rankMetric: "total",
  rankN: 15,
  logScale: true,
  fromQ: "Q1",
  toQ: "Q4",
  pins: [],
  sort: { key: "total", dir: "desc" },
};

const intFmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

function esc(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[ch]);
}

function fmtCopies(n) {
  if (!Number.isFinite(n)) return "—";
  return intFmt.format(Math.round(n));
}

function fmtPct(x, digits = 1) {
  if (!Number.isFinite(x)) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}

function fmtSignedPct(x, digits = 1) {
  if (!Number.isFinite(x)) return "—";
  const v = x * 100;
  const body = `${Math.abs(v).toFixed(digits)}%`;
  if (v > 0) return `+${body}`;
  if (v < 0) return `−${body}`;
  return body;
}

function fmtCompact(n) {
  const a = Math.abs(n);
  if (a >= 1e6) {
    const m = n / 1e6;
    const digits = Math.abs(m) >= 10 ? 1 : 2;
    return `${m.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "")} million`;
  }
  if (a >= 1000) return intFmt.format(Math.round(n / 1000) * 1000);
  return intFmt.format(Math.round(n));
}

function aboutCopies(n) {
  const a = Math.abs(n);
  if (a >= 1e6) return fmtCompact(n);
  if (a >= 10000) return intFmt.format(Math.round(n / 1000) * 1000);
  if (a >= 1000) return intFmt.format(Math.round(n / 100) * 100);
  return intFmt.format(Math.round(n));
}

function fmtAxis(n) {
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  if (a >= 1e6) {
    return `${sign}${(a / 1e6).toFixed(a >= 1e7 ? 0 : 2).replace(/\.?0+$/, "")}M`;
  }
  if (a >= 1000) {
    return `${sign}${(a / 1000).toFixed(a >= 10000 ? 0 : 1).replace(/\.0$/, "")}k`;
  }
  return `${sign}${Math.round(a)}`;
}

function cellTotal(cell) {
  return (cell?.digital || 0) + (cell?.print || 0);
}

function activeQuarters(pub) {
  return QUARTERS.filter((q) => cellTotal(pub.quarters[q]) > 0);
}

function isReporting(pub) {
  return activeQuarters(pub).length > 0;
}

function everDigital(pub) {
  return QUARTERS.some((q) => pub.quarters[q].digital > 0);
}

function weightOf(pub) {
  if (!state.weighted) return 1;
  return ISSUES_PER_QUARTER[pub.periodicity] ?? 1;
}

function measure(pub, quarter = state.quarter) {
  const w = weightOf(pub);
  if (quarter !== "avg") {
    const cell = pub.quarters[quarter] || { digital: 0, print: 0 };
    const digital = cell.digital * w;
    const print = cell.print * w;
    const total = digital + print;
    return {
      digital,
      print,
      total,
      share: total > 0 ? digital / total : 0,
      nq: total > 0 ? 1 : 0,
    };
  }
  const active = activeQuarters(pub);
  if (!active.length) {
    return { digital: 0, print: 0, total: 0, share: 0, nq: 0 };
  }
  const digital = (active.reduce((s, q) => s + pub.quarters[q].digital, 0) / active.length) * w;
  const print = (active.reduce((s, q) => s + pub.quarters[q].print, 0) / active.length) * w;
  const total = digital + print;
  return {
    digital,
    print,
    total,
    share: total > 0 ? digital / total : 0,
    nq: active.length,
  };
}

function quarterMeasure(pub, quarter) {
  const w = weightOf(pub);
  const cell = pub.quarters[quarter] || { digital: 0, print: 0 };
  return {
    digital: cell.digital * w,
    print: cell.print * w,
    total: (cell.digital + cell.print) * w,
  };
}

function periodLabel(value) {
  return PERIOD_LABEL[value] || value;
}

function typeLabel(value) {
  return TYPE_LABEL[value] || value;
}

function sum(rows, key) {
  return rows.reduce((s, row) => s + row.m[key], 0);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function comparable(pubs, fromQ, toQ) {
  return pubs.filter(
    (p) => cellTotal(p.quarters[fromQ]) > 0 && cellTotal(p.quarters[toQ]) > 0
  );
}

function fileSet(pubs) {
  return pubs.filter(isReporting);
}

function filteredPubs() {
  const q = state.search;
  return state.pubs.filter((p) => {
    if (!state.types.has(p.type)) return false;
    if (!state.periodicities.has(p.periodicity)) return false;
    if (q && !p.name.toLowerCase().includes(q)) return false;
    if (state.reporting === "reporting" && !isReporting(p)) return false;
    if (state.reporting === "digital" && !everDigital(p)) return false;
    if (state.reporting === "print-only" && !(isReporting(p) && !everDigital(p))) return false;
    return true;
  });
}

function withMeasures(pubs) {
  return pubs.map((p) => ({ p, m: measure(p) }));
}

function $(id) {
  return document.getElementById(id);
}

function svg(tag, attrs = {}) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value == null || value === false) continue;
    if (key === "textContent") el.textContent = value;
    else el.setAttribute(key, String(value));
  }
  return el;
}

function scaleLinear([d0, d1], [r0, r1]) {
  const span = d1 - d0 || 1;
  return (x) => r0 + ((x - d0) / span) * (r1 - r0);
}

function scaleLog([d0, d1], [r0, r1]) {
  const inner = scaleLinear([Math.log10(d0), Math.log10(d1)], [r0, r1]);
  return (x) => inner(Math.log10(Math.max(x, d0)));
}

function niceTicks(min, max, count = 4) {
  if (!(max > min)) return [min, max];
  const span = max - min;
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const err = raw / mag;
  let step = mag;
  if (err >= 7.5) step = 10 * mag;
  else if (err >= 3) step = 5 * mag;
  else if (err >= 1.5) step = 2 * mag;
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step * 0.01; v += step) ticks.push(v);
  if (!ticks.includes(0) && min < 0 && max > 0) ticks.push(0);
  return ticks.sort((a, b) => a - b);
}

function logTicks(min, max) {
  const ticks = [];
  const start = Math.floor(Math.log10(min));
  const end = Math.ceil(Math.log10(max));
  for (let e = start; e <= end; e++) {
    const base = 10 ** e;
    if (base >= min * 0.999 && base <= max * 1.05) ticks.push(base);
  }
  return ticks.length ? ticks : [min, max];
}

function sizeOf(el, fallbackH) {
  const w = el.clientWidth || el.parentElement?.clientWidth || 640;
  const h = el.clientHeight || fallbackH || 240;
  return { w, h };
}

const tip = {
  el: null,
  show(html, event) {
    if (!this.el) this.el = $("tooltip");
    this.el.innerHTML = html;
    this.el.hidden = false;
    this.move(event);
  },
  move(event) {
    if (!this.el || this.el.hidden) return;
    const x = Math.min(event.clientX + 12, window.innerWidth - this.el.offsetWidth - 8);
    const y = Math.min(event.clientY + 12, window.innerHeight - this.el.offsetHeight - 8);
    this.el.style.left = `${Math.max(8, x)}px`;
    this.el.style.top = `${Math.max(8, y)}px`;
  },
  hide() {
    if (!this.el) this.el = $("tooltip");
    this.el.hidden = true;
  },
};

function tipOn(node, htmlFn) {
  node.addEventListener("pointerenter", (e) => tip.show(htmlFn(), e));
  node.addEventListener("pointermove", (e) => tip.move(e));
  node.addEventListener("pointerleave", () => tip.hide());
}

function clearChart(el) {
  el.replaceChildren();
}

function emptyChart(el, message) {
  clearChart(el);
  const p = document.createElement("p");
  p.className = "empty";
  p.textContent = message;
  el.append(p);
}

function drawFrame(el, width, height) {
  clearChart(el);
  const root = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    width: "100%",
    height: "100%",
    role: "img",
  });
  el.append(root);
  return root;
}

function isPinned(name) {
  return state.pins.includes(name);
}

function togglePin(name) {
  const i = state.pins.indexOf(name);
  if (i >= 0) state.pins.splice(i, 1);
  else if (state.pins.length < MAX_PINS) state.pins.push(name);
  render();
}

function measureLabel() {
  if (state.weighted) return "issue-weighted copies";
  if (state.quarter === "avg") return "active-quarter average copies per issue";
  return `${state.quarter} copies per issue`;
}

function loadError(message) {
  $("source-line").textContent = message;
  $("status-line").textContent = message;
  $("report-title").textContent = "Could not load data.json";
}

async function init() {
  let data;
  try {
    const res = await fetch("./data.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    data = await res.json();
  } catch (err) {
    loadError(
      "Could not load data.json. Serve this folder over HTTP, for example: python -m http.server 8000"
    );
    console.error(err);
    return;
  }

  state.meta = {
    source: data.source || "data.json",
    label: data.label || "Paid circulation",
    unit: data.unit || "Average paid copies per issue",
    quarters: data.quarters || QUARTERS,
  };
  state.pubs = (data.publications || []).slice().sort((a, b) => a.name.localeCompare(b.name, "pt"));
  if (!state.pubs.length) {
    loadError("data.json has no publications.");
    return;
  }
  const pers = [...new Set(state.pubs.map((p) => p.periodicity))];
  pers.sort((a, b) => PERIOD_ORDER.indexOf(a) - PERIOD_ORDER.indexOf(b) || a.localeCompare(b));
  state.periodicities = new Set(pers);

  $("source-line").textContent = `${state.pubs.length} titles from ${state.meta.source} · ${state.meta.unit}`;

  buildPeriodicityChips(pers);
  fillTitleList();
  bind();
  renderBriefing();
  render();
}

function buildPeriodicityChips(values) {
  const host = $("periodicity-chips");
  host.replaceChildren();
  for (const value of values) {
    const label = document.createElement("label");
    label.className = "chip";
    label.innerHTML = `<input type="checkbox" name="periodicity" value="${esc(value)}" checked /> ${esc(periodLabel(value))}`;
    host.append(label);
  }
}

function fillTitleList() {
  const list = $("title-list");
  list.replaceChildren();
  for (const p of state.pubs) {
    const opt = document.createElement("option");
    opt.value = p.name;
    list.append(opt);
  }
}

function bind() {
  $("search").addEventListener("input", (e) => {
    state.search = e.target.value.trim().toLowerCase();
    render();
  });

  $("btn-guide").addEventListener("click", () => {
    const open = $("guide").hidden;
    $("guide").hidden = !open;
    $("btn-guide").setAttribute("aria-expanded", String(open));
  });

  $("filters").addEventListener("change", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLInputElement)) return;
    if (t.name === "type") {
      state.types = new Set([...document.querySelectorAll('input[name="type"]:checked')].map((el) => el.value));
    } else if (t.name === "periodicity") {
      state.periodicities = new Set(
        [...document.querySelectorAll('input[name="periodicity"]:checked')].map((el) => el.value)
      );
    } else if (t.name === "reporting") {
      state.reporting = t.value;
    } else if (t.name === "quarter") {
      state.quarter = t.value;
    } else if (t.id === "weighted") {
      state.weighted = t.checked;
    }
    render();
  });

  $("btn-reset").addEventListener("click", resetFilters);

  document.querySelectorAll(".view-tab").forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  document.querySelectorAll('input[name="rank-metric"]').forEach((el) => {
    el.addEventListener("change", () => {
      if (el.checked) {
        state.rankMetric = el.value;
        render();
      }
    });
  });

  $("rank-n").addEventListener("input", (e) => {
    state.rankN = Number(e.target.value);
    $("rank-n-label").textContent = String(state.rankN);
    render();
  });

  $("log-scale").addEventListener("change", (e) => {
    state.logScale = e.target.checked;
    render();
  });

  $("from-q").addEventListener("change", (e) => {
    state.fromQ = e.target.value;
    render();
  });
  $("to-q").addEventListener("change", (e) => {
    state.toQ = e.target.value;
    render();
  });

  const addCompare = () => {
    const name = $("compare-search").value.trim();
    const pub = state.pubs.find((p) => p.name.toLowerCase() === name.toLowerCase());
    if (!pub) return;
    if (!isPinned(pub.name) && state.pins.length < MAX_PINS) {
      state.pins.push(pub.name);
      render();
    }
    $("compare-search").value = "";
  };
  $("compare-search").addEventListener("change", addCompare);
  $("compare-search").addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addCompare();
    }
  });

  $("btn-clear-pins").addEventListener("click", () => {
    state.pins = [];
    render();
  });

  $("btn-export").addEventListener("click", exportCsv);

  $("data-table").querySelectorAll("th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      if (state.sort.key === key) state.sort.dir = state.sort.dir === "desc" ? "asc" : "desc";
      else {
        state.sort.key = key;
        state.sort.dir = key === "name" || key === "type" || key === "periodicity" ? "asc" : "desc";
      }
      render();
    });
  });

  document.addEventListener("keydown", (e) => {
    const field = e.target.closest("input, select, textarea");
    if (e.key === "Escape") {
      $("guide").hidden = true;
      $("btn-guide").setAttribute("aria-expanded", "false");
      if (field) e.target.blur();
      tip.hide();
      return;
    }
    if (field) return;
    if (e.key === "/") {
      e.preventDefault();
      $("search").focus();
    }
    const idx = "123456".indexOf(e.key);
    if (idx >= 0) setView(VIEWS[idx]);
  });

  const ro = new ResizeObserver(() => {
    cancelAnimationFrame(state.raf);
    state.raf = requestAnimationFrame(render);
  });
  document.querySelectorAll(".chart").forEach((el) => ro.observe(el));
}

function resetFilters() {
  state.search = "";
  $("search").value = "";
  state.types = new Set(["Jornal", "Revista"]);
  document.querySelectorAll('input[name="type"]').forEach((el) => {
    el.checked = true;
  });
  state.periodicities = new Set();
  document.querySelectorAll('input[name="periodicity"]').forEach((el) => {
    el.checked = true;
    state.periodicities.add(el.value);
  });
  state.reporting = "reporting";
  document.querySelector('input[name="reporting"][value="reporting"]').checked = true;
  state.quarter = "avg";
  document.querySelector('input[name="quarter"][value="avg"]').checked = true;
  state.weighted = false;
  $("weighted").checked = false;
  render();
}

function setView(name) {
  state.view = name;
  document.querySelectorAll(".view-tab").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === name);
  });
  document.querySelectorAll("main .view").forEach((section) => {
    section.hidden = section.id !== `view-${name}`;
  });
  render();
}

function render() {
  if (state.rendering) return;
  state.rendering = true;
  try {
    renderViews();
  } finally {
    state.rendering = false;
  }
}

function renderViews() {
  const rows = withMeasures(filteredPubs());
  renderStatus(rows);
  renderPins();
  if (state.view === "overview") {
    renderKpis(rows);
    renderInsights(rows);
    renderMarket(rows);
    renderTypeMix(rows);
    renderPeriodicityMix(rows);
  } else if (state.view === "rankings") {
    renderRank(rows);
  } else if (state.view === "mix") {
    renderScatter(rows);
    renderBeeswarm(rows);
    renderLeaders(rows);
  } else if (state.view === "change") {
    renderChange(rows);
  } else if (state.view === "compare") {
    renderCompare();
  } else if (state.view === "table") {
    renderTable(rows);
  }
}

function renderStatus(rows) {
  const n = rows.length;
  const total = sum(rows, "total");
  const digital = sum(rows, "digital");
  const parts = [
    `${n} title${n === 1 ? "" : "s"}`,
    state.reporting === "all" ? "including non-reporting" : state.reporting.replace("-", " "),
    measureLabel(),
  ];
  if (n) parts.push(`${fmtCopies(total)} total · ${fmtPct(total ? digital / total : 0)} digital`);
  $("status-line").textContent = parts.join(" · ");
}

function renderPins() {
  const host = $("pins");
  if (!state.pins.length) {
    host.hidden = true;
    host.replaceChildren();
    return;
  }
  host.hidden = false;
  host.replaceChildren(
    ...state.pins.map((name) => {
      const el = document.createElement("span");
      el.className = "pin";
      el.innerHTML = `${esc(name)} <button type="button" aria-label="Unpin ${esc(name)}">×</button>`;
      el.querySelector("button").addEventListener("click", () => togglePin(name));
      return el;
    })
  );
}

function renderBriefing() {
  const pubs = fileSet(state.pubs);
  const rows = pubs.map((p) => ({ p, m: measure(p, "avg") }));
  const zeros = state.pubs.length - pubs.length;
  const total = sum(rows, "total");
  const digital = sum(rows, "digital");
  const print = sum(rows, "print");
  const news = rows.filter((r) => r.p.type === "Jornal");
  const mags = rows.filter((r) => r.p.type === "Revista");
  const newsD = sum(news, "digital");
  const magsT = sum(mags, "total");
  const magsD = sum(mags, "digital");
  const ranked = rows.slice().sort((a, b) => b.m.total - a.m.total);
  const top10 = ranked.slice(0, 10).reduce((s, r) => s + r.m.total, 0);
  const top5 = ranked.slice(0, 5).reduce((s, r) => s + r.m.total, 0);
  const med = median(rows.map((r) => r.m.total));

  const both = comparable(pubs, "Q1", "Q4");
  const t1 = both.reduce((s, p) => s + cellTotal(p.quarters.Q1), 0);
  const t4 = both.reduce((s, p) => s + cellTotal(p.quarters.Q4), 0);
  const d1 = both.reduce((s, p) => s + p.quarters.Q1.digital, 0);
  const d4 = both.reduce((s, p) => s + p.quarters.Q4.digital, 0);
  const chg = t1 ? (t4 - t1) / t1 : 0;
  const dChg = d1 ? (d4 - d1) / d1 : 0;
  const newsBoth = both.filter((p) => p.type === "Jornal");
  const magBoth = both.filter((p) => p.type === "Revista");
  const n1 = newsBoth.reduce((s, p) => s + cellTotal(p.quarters.Q1), 0);
  const n4 = newsBoth.reduce((s, p) => s + cellTotal(p.quarters.Q4), 0);
  const m1 = magBoth.reduce((s, p) => s + cellTotal(p.quarters.Q1), 0);
  const m4 = magBoth.reduce((s, p) => s + cellTotal(p.quarters.Q4), 0);

  const dLead = rows.slice().sort((a, b) => b.m.digital - a.m.digital);
  const top3 = dLead.slice(0, 3);
  const top3Share = digital ? top3.reduce((s, r) => s + r.m.digital, 0) / digital : 0;
  const mostDigital = rows
    .filter((r) => r.m.total > 0 && r.m.digital > 0)
    .slice()
    .sort((a, b) => b.m.share - a.m.share)[0];
  const growers = both
    .map((p) => {
      const a = cellTotal(p.quarters.Q1);
      const b = cellTotal(p.quarters.Q4);
      return { p, chg: a ? (b - a) / a : 0 };
    })
    .sort((a, b) => b.chg - a.chg);
  const fastest = growers[0];
  const droppers = growers.slice().reverse().slice(0, 3);

  const giants = ranked.slice(0, 2);
  const dailies = rows.filter((r) => r.p.periodicity === "Diário");
  const largestDaily = dailies.slice().sort((a, b) => b.m.total - a.m.total)[0];
  const printOnly = rows.filter((r) => r.m.digital === 0);
  const digitalOnly = rows.filter((r) => r.m.print === 0 && r.m.digital > 0);
  const newsDig = news.filter((r) => r.m.digital > 0);
  const magDig = mags.filter((r) => r.m.digital > 0);

  const qTotals = QUARTERS.map((q) => ({
    q,
    t: pubs.reduce((s, p) => s + cellTotal(p.quarters[q]), 0),
  }));
  const peak = qTotals.slice().sort((a, b) => b.t - a.t)[0];
  const last = qTotals[qTotals.length - 1];
  const dropFromPeak = peak.t ? (last.t - peak.t) / peak.t : 0;

  const weeklies = ranked.filter((r) => r.p.periodicity === "Semanal").slice(0, 4);
  const newsShareD = digital ? newsD / digital : 0;
  const magCopyShare = total ? magsT / total : 0;
  const magDigShare = magsT ? magsD / magsT : 0;
  const dailyCopyShare = total ? sum(dailies, "total") / total : 0;
  const dailyDigShare = digital ? sum(dailies, "digital") / digital : 0;
  const printOnlyShare = total ? sum(printOnly, "total") / total : 0;

  const headline =
    newsShareD >= 0.5 && (total ? digital / total : 0) < 0.2
      ? "Print still holds the copies. Digital is a newspaper story."
      : "Paid digital and print copies in this file.";

  const chgClass = chg < 0 ? "down" : chg > 0 ? "up" : "";

  $("report").innerHTML = `
    <header class="report__head">
      <p class="kicker">Briefing from the file</p>
      <h2 id="report-title">${esc(headline)}</h2>
      <p class="hint">
        Active-quarter averages of paid copies per issue, across
        <em>${pubs.length}</em> titles that reported at least one quarter.
        ${zeros ? `${zeros === 1 ? "One title" : `${zeros} titles`} filed zeros and ${zeros === 1 ? "is" : "are"} left out.` : ""}
        A daily and a monthly are not comparable as reach.
      </p>
    </header>
    <dl class="report__stats">
      <div>
        <dt>Digital share of paid copies</dt>
        <dd>${fmtPct(total ? digital / total : 0)}</dd>
        <p>About ${aboutCopies(digital)} of ${fmtCompact(total)} copies. Print is the rest.</p>
      </div>
      <div>
        <dt>Digital copies from newspapers</dt>
        <dd>${fmtPct(newsShareD, 0)}</dd>
        <p>Magazines hold ${fmtPct(magCopyShare, 0)} of all copies, but only ${fmtPct(magDigShare)} of those are digital.</p>
      </div>
      <div>
        <dt>Change, Q1 → Q4</dt>
        <dd class="${chgClass}">${fmtSignedPct(chg)}</dd>
        <p>${both.length} titles that reported both quarters. Digital ${dChg < 0 ? "fell" : "rose"} ${fmtPct(Math.abs(dChg))} as well.</p>
      </div>
      <div>
        <dt>Top 10 share of the market</dt>
        <dd>${fmtPct(total ? top10 / total : 0, 0)}</dd>
        <p>The top five titles alone are ${fmtPct(total ? top5 / total : 0, 0)}. Median title: ${aboutCopies(med)} copies.</p>
      </div>
    </dl>
    <div class="report__facts">
      <section>
        <h3>${top3.length >= 3 ? "Three titles are half of digital" : "Where digital copies sit"}</h3>
        <p>
          ${top3
            .map((r) => `<strong>${esc(r.p.name)}</strong> (${fmtPct(r.m.share, 0)} digital)`)
            .join(", ")
            .replace(/, ([^,]*)$/, ", and $1")}
          account for ${fmtPct(top3Share, 0)} of every digital copy.
          ${top3[0] ? `${esc(top3[0].p.name)} alone is ${fmtPct(digital ? top3[0].m.digital / digital : 0, 0)}.` : ""}
          ${
            mostDigital
              ? `The most digital title in the file is <strong>${esc(mostDigital.p.name)}</strong> at ${fmtPct(mostDigital.m.share, 0)}`
              : ""
          }${
            fastest && mostDigital && fastest.p.name === mostDigital.p.name
              ? ` — and it is also the fastest grower, up ${fmtPct(fastest.chg, 0)} from Q1 to Q4.`
              : fastest
                ? `. Fastest grower: <strong>${esc(fastest.p.name)}</strong>, up ${fmtPct(fastest.chg, 0)}.`
                : "."
          }
        </p>
      </section>
      <section>
        <h3>The giants barely do digital</h3>
        <p>
          ${giants
            .map((r) => `<strong>${esc(r.p.name)}</strong> (~${aboutCopies(r.m.total)}${r.m.digital === 0 ? ", print-only" : ""})`)
            .join(" and ")}
          lead the ranking.
          ${
            largestDaily
              ? `<strong>${esc(largestDaily.p.name)}</strong> is the largest daily (~${aboutCopies(largestDaily.m.total)}) at ${fmtPct(largestDaily.m.share)} digital.`
              : ""
          }
          ${digitalOnly.length === 0 ? "There is no digital-only title in the file." : ""}
          ${printOnly.length} reporting titles have zero digital copies, and they still make up ${fmtPct(printOnlyShare, 0)} of paid circulation.
        </p>
      </section>
      <section>
        <h3>${m1 && (m4 - m1) / m1 < (n1 ? (n4 - n1) / n1 : 0) ? "Magazines drove the decline" : "How the two types moved"}</h3>
        <p>
          On comparable titles, magazines ${m1 ? (m4 >= m1 ? "rose" : "fell") : "moved"}
          <strong>${m1 ? fmtSignedPct((m4 - m1) / m1) : "—"}</strong> from Q1 to Q4;
          newspapers ${n1 ? fmtSignedPct((n4 - n1) / n1) : "—"}.
          The steepest drops were
          ${droppers.map((d) => `<strong>${esc(d.p.name)}</strong> (${fmtSignedPct(d.chg, 0)})`).join(", ")}.
          Paid copies peaked in ${peak.q}, then dropped ${fmtPct(Math.abs(dropFromPeak), 0)} into ${last.q}.
        </p>
      </section>
      <section>
        <h3>${dChg < 0 && chg < 0 ? "This is not a substitution year" : "Digital and print together"}</h3>
        <p>
          ${
            dChg < 0 && chg < 0
              ? "Digital did not take the copies print lost: both channels fell."
              : `Print was ${fmtCompact(print)} copies; digital ${fmtCompact(digital)}.`
          }
          ${newsDig.length} of ${news.length} newspapers already have some digital paid copies;
          only ${magDig.length} of ${mags.length} magazines do.
          Dailies are ${fmtPct(dailyCopyShare, 0)} of the copy pile but ${fmtPct(dailyDigShare, 0)} of digital.
          ${
            weeklies.length
              ? `Weeklies (${weeklies.map((r) => esc(r.p.name)).join(", ")}) remain the volume engine, and they are still almost entirely print.`
              : ""
          }
        </p>
      </section>
    </div>
  `;
}

function kpi(label, value, delta, cls) {
  return `<article class="kpi"><div class="label">${esc(label)}</div><div class="value">${value}</div>${
    delta ? `<div class="delta ${cls || "flat"}">${delta}</div>` : ""
  }</article>`;
}

function renderKpis(rows) {
  const total = sum(rows, "total");
  const digital = sum(rows, "digital");
  const print = sum(rows, "print");
  const pubs = rows.map((r) => r.p);
  const both = comparable(pubs, "Q1", "Q4");
  const t1 = both.reduce((s, p) => s + quarterMeasure(p, "Q1").total, 0);
  const t4 = both.reduce((s, p) => s + quarterMeasure(p, "Q4").total, 0);
  const chg = t1 ? (t4 - t1) / t1 : null;
  $("kpis").innerHTML = [
    kpi("Titles in view", String(rows.length), `${fileSet(state.pubs).length} reporting in the file`),
    kpi("Paid copies", fmtCopies(total), measureLabel(), "flat"),
    kpi("Digital", fmtCopies(digital), total ? `${fmtPct(digital / total)} of copies` : "no copies", "flat"),
    kpi("Print", fmtCopies(print), total ? `${fmtPct(print / total)} of copies` : "no copies", "flat"),
    kpi(
      "Q1 → Q4",
      chg == null ? "—" : fmtSignedPct(chg),
      `${both.length} titles in both quarters`,
      chg == null ? "flat" : chg > 0 ? "up" : chg < 0 ? "down" : "flat"
    ),
  ].join("");
}

function renderInsights(rows) {
  const host = $("insights");
  if (!rows.length) {
    host.innerHTML = `<li>No titles match the current filters.</li>`;
    return;
  }
  const total = sum(rows, "total");
  const digital = sum(rows, "digital");
  const ranked = rows.slice().sort((a, b) => b.m.total - a.m.total);
  const top = ranked[0];
  const news = rows.filter((r) => r.p.type === "Jornal");
  const printOnly = rows.filter((r) => r.m.digital === 0 && r.m.total > 0);
  const both = comparable(rows.map((r) => r.p), state.fromQ, state.toQ);
  const a = both.reduce((s, p) => s + quarterMeasure(p, state.fromQ).total, 0);
  const b = both.reduce((s, p) => s + quarterMeasure(p, state.toQ).total, 0);
  const items = [];
  items.push(
    `Digital is <strong>${fmtPct(total ? digital / total : 0)}</strong> of paid copies in this filter set (${fmtCopies(digital)} of ${fmtCopies(total)}).`
  );
  if (top) {
    items.push(
      `<strong>${esc(top.p.name)}</strong> is the largest title here, at ${fmtCopies(top.m.total)} copies (${fmtPct(total ? top.m.total / total : 0)} of the set).`
    );
  }
  const newsD = sum(news, "digital");
  items.push(
    `Newspapers account for <strong>${fmtPct(digital ? newsD / digital : 0, 0)}</strong> of digital copies in view.`
  );
  if (printOnly.length) {
    items.push(
      `${printOnly.length} print-only titles still make up ${fmtPct(total ? sum(printOnly, "total") / total : 0, 0)} of copies.`
    );
  }
  if (both.length) {
    items.push(
      `On ${both.length} titles present in both ${state.fromQ} and ${state.toQ}, the set ${b >= a ? "rose" : "fell"} <strong>${fmtSignedPct(a ? (b - a) / a : 0)}</strong>.`
    );
  }
  host.innerHTML = items.map((t) => `<li>${t}</li>`).join("");
}

function renderMarket(rows) {
  $("title-market").textContent = "Paid circulation by quarter";
  const el = $("chart-market");
  if (!rows.length) return emptyChart(el, "No titles match the current filters.");
  const series = QUARTERS.map((q) => {
    const digital = rows.reduce((s, r) => s + quarterMeasure(r.p, q).digital, 0);
    const print = rows.reduce((s, r) => s + quarterMeasure(r.p, q).print, 0);
    return { q, digital, print, total: digital + print };
  });
  const peak = series.slice().sort((a, b) => b.total - a.total)[0];
  const last = series[series.length - 1];
  if (peak && last && peak.q !== last.q) {
    $("title-market").textContent = `Paid copies peaked in ${peak.q}, then moved to ${fmtCopies(last.total)} in ${last.q}`;
  }
  $("hint-market").textContent = `Stacked ${measureLabel().replace("active-quarter average ", "")}. Hover a segment for the exact figure.`;

  const { w, h } = sizeOf(el, 240);
  if (w < 40) return;
  const m = { t: 16, r: 12, b: 36, l: 48 };
  const max = Math.max(...series.map((s) => s.total), 1);
  const x = scaleLinear([-0.5, series.length - 0.5], [m.l, w - m.r]);
  const y = scaleLinear([0, max], [h - m.b, m.t]);
  const bw = Math.min(72, ((w - m.l - m.r) / series.length) * 0.55);
  const root = drawFrame(el, w, h);

  for (const t of niceTicks(0, max)) {
    const gy = y(t);
    root.append(svg("line", { x1: m.l, x2: w - m.r, y1: gy, y2: gy, stroke: C.line, "stroke-width": t === 0 ? 1 : 0.6 }));
    root.append(svg("text", { x: m.l - 8, y: gy + 4, "text-anchor": "end", class: "tick", textContent: fmtAxis(t) }));
  }

  series.forEach((s, i) => {
    const cx = x(i);
    const px = cx - bw / 2;
    root.append(
      barRect(px, y(s.print), bw, h - m.b - y(s.print), C.print, () =>
        `<strong>${s.q} print</strong>${fmtCopies(s.print)} copies`
      )
    );
    root.append(
      barRect(px, y(s.total), bw, y(s.print) - y(s.total), C.digital, () =>
        `<strong>${s.q} digital</strong>${fmtCopies(s.digital)} copies`
      )
    );
    root.append(svg("text", { x: cx, y: h - 12, "text-anchor": "middle", class: "tick", textContent: s.q }));
  });
}

function barRect(x, y, width, height, fill, htmlFn) {
  const rect = svg("rect", {
    x,
    y,
    width,
    height: Math.max(0, height),
    fill,
    rx: Math.min(2, Math.max(0, height) > 4 ? 2 : 0),
  });
  tipOn(rect, htmlFn);
  return rect;
}

function renderTypeMix(rows) {
  $("title-type").textContent = "Format mix by type";
  const groups = ["Jornal", "Revista"].map((type) => {
    const subset = rows.filter((r) => r.p.type === type);
    const digital = sum(subset, "digital");
    const print = sum(subset, "print");
    return { key: type, label: typeLabel(type), digital, print, total: digital + print, n: subset.length };
  });
  drawShareBars($("chart-type"), groups, 160);
}

function renderPeriodicityMix(rows) {
  $("title-periodicity").textContent = "Format mix by periodicity";
  const keys = [...new Set(rows.map((r) => r.p.periodicity))];
  keys.sort((a, b) => PERIOD_ORDER.indexOf(a) - PERIOD_ORDER.indexOf(b));
  const groups = keys.map((key) => {
    const subset = rows.filter((r) => r.p.periodicity === key);
    const digital = sum(subset, "digital");
    const print = sum(subset, "print");
    return { key, label: periodLabel(key), digital, print, total: digital + print, n: subset.length };
  });
  drawShareBars($("chart-periodicity"), groups, 240);
}

function drawShareBars(el, groups, fallbackH) {
  const present = groups.filter((g) => g.n);
  if (!present.length) return emptyChart(el, "No titles match the current filters.");
  const { w } = sizeOf(el, fallbackH);
  if (w < 40) return;
  const rowH = 36;
  const m = { t: 8, r: 64, b: 8, l: 108 };
  const h = Math.max(fallbackH, m.t + m.b + present.length * rowH);
  el.style.minHeight = `${h}px`;
  const x = scaleLinear([0, 1], [m.l, w - m.r]);
  const root = drawFrame(el, w, h);
  present.forEach((g, i) => {
    const y = m.t + i * rowH + 8;
    const share = g.total ? g.digital / g.total : 0;
    root.append(
      svg("text", {
        x: m.l - 8,
        y: y + 11,
        "text-anchor": "end",
        class: "tick",
        textContent: g.label,
      })
    );
    const track = svg("rect", { x: m.l, y, width: x(1) - m.l, height: 16, fill: C.paper, rx: 3 });
    root.append(track);
    const dW = x(share) - m.l;
    const pW = x(1) - x(share);
    if (dW > 0) {
      const r = barRect(m.l, y, dW, 16, C.digital, () =>
        `<strong>${esc(g.label)} digital</strong>${fmtPct(share)} · ${fmtCopies(g.digital)} copies · ${g.n} titles`
      );
      root.append(r);
    }
    if (pW > 0) {
      const r = barRect(x(share), y, pW, 16, C.print, () =>
        `<strong>${esc(g.label)} print</strong>${fmtPct(1 - share)} · ${fmtCopies(g.print)} copies`
      );
      root.append(r);
    }
    root.append(
      svg("text", {
        x: w - m.r + 8,
        y: y + 12,
        class: "tick",
        textContent: fmtPct(share, share >= 0.1 ? 0 : 1),
      })
    );
  });
}

function metricOf(row) {
  if (state.rankMetric === "digital") return row.m.digital;
  if (state.rankMetric === "print") return row.m.print;
  if (state.rankMetric === "share") return row.m.share;
  return row.m.total;
}

function renderRank(rows) {
  const el = $("chart-rank");
  const ranked = rows
    .slice()
    .sort((a, b) => metricOf(b) - metricOf(a))
    .slice(0, state.rankN);
  const label = {
    total: "paid circulation",
    digital: "digital copies",
    print: "print copies",
    share: "digital share",
  }[state.rankMetric];
  $("title-rank").textContent = ranked.length
    ? `Largest titles by ${label}`
    : "Largest titles by paid circulation";
  if (!ranked.length) return emptyChart(el, "No titles match the current filters.");

  const { w } = sizeOf(el, 420);
  if (w < 40) return;
  const rowH = 26;
  const m = { t: 8, r: 72, b: 8, l: 168 };
  const h = Math.max(420, m.t + m.b + ranked.length * rowH);
  el.style.minHeight = `${h}px`;
  const max = state.rankMetric === "share" ? 1 : Math.max(...ranked.map(metricOf), 1);
  const x = scaleLinear([0, max || 1], [m.l, w - m.r]);
  const root = drawFrame(el, w, h);

  ranked.forEach((row, i) => {
    const y = m.t + i * rowH + 4;
    const pinned = isPinned(row.p.name);
    root.append(
      svg("text", {
        x: m.l - 8,
        y: y + 12,
        "text-anchor": "end",
        class: "tick",
        textContent: row.p.name.length > 26 ? `${row.p.name.slice(0, 24)}…` : row.p.name,
      })
    );
    if (state.rankMetric === "share" || state.rankMetric === "digital" || state.rankMetric === "print") {
      const fill = state.rankMetric === "print" ? C.print : C.digital;
      const val = metricOf(row);
      const rect = barRect(m.l, y, Math.max(0, x(val) - m.l), 16, fill, () => rankTip(row));
      rect.style.cursor = "pointer";
      if (pinned) rect.setAttribute("stroke", C.ink);
      rect.addEventListener("click", () => togglePin(row.p.name));
      root.append(rect);
    } else {
      const dW = Math.max(0, x(row.m.digital) - m.l);
      const pW = Math.max(0, x(row.m.total) - x(row.m.digital));
      const g = svg("g", { style: "cursor:pointer" });
      if (dW) g.append(barRect(m.l, y, dW, 16, C.digital, () => rankTip(row)));
      if (pW) g.append(barRect(x(row.m.digital), y, pW, 16, C.print, () => rankTip(row)));
      if (pinned) {
        g.append(
          svg("rect", {
            x: m.l,
            y,
            width: Math.max(0, x(row.m.total) - m.l),
            height: 16,
            fill: "none",
            stroke: C.ink,
          })
        );
      }
      g.addEventListener("click", () => togglePin(row.p.name));
      root.append(g);
    }
    const labelText = state.rankMetric === "share" ? fmtPct(row.m.share) : fmtCopies(metricOf(row));
    root.append(svg("text", { x: w - m.r + 8, y: y + 12, class: "tick", textContent: labelText }));
  });
}

function rankTip(row) {
  return `<strong>${esc(row.p.name)}</strong>${typeLabel(row.p.type)} · ${periodLabel(row.p.periodicity)}<br>Digital ${fmtCopies(row.m.digital)} · Print ${fmtCopies(row.m.print)} · ${fmtPct(row.m.share)} digital`;
}

function renderScatter(rows) {
  const el = $("chart-scatter");
  $("title-scatter").textContent = "Print vs digital, one dot per title";
  const pts = rows.filter((r) => r.m.total > 0);
  if (!pts.length) return emptyChart(el, "No titles match the current filters.");
  const { w, h } = sizeOf(el, 380);
  if (w < 40) return;
  const m = { t: 20, r: 16, b: 40, l: 52 };
  const prints = pts.map((r) => r.m.print);
  const digs = pts.map((r) => r.m.digital);
  const useLog = state.logScale;
  const minP = Math.max(useLog ? 1 : 0, Math.min(...prints.filter((v) => v > 0), 1));
  const minD = Math.max(useLog ? 1 : 0, Math.min(...digs.filter((v) => v > 0), 1));
  const maxP = Math.max(...prints, 1);
  const maxD = Math.max(...digs, 1);
  const x = (useLog ? scaleLog : scaleLinear)([useLog ? minP : 0, maxP], [m.l, w - m.r]);
  const y = (useLog ? scaleLog : scaleLinear)([useLog ? minD : 0, maxD], [h - m.b, m.t]);
  const root = drawFrame(el, w, h);

  const xt = useLog ? logTicks(minP, maxP) : niceTicks(0, maxP);
  const yt = useLog ? logTicks(minD, maxD) : niceTicks(0, maxD);
  for (const t of xt) {
    root.append(svg("line", { x1: x(t), x2: x(t), y1: m.t, y2: h - m.b, stroke: C.line, "stroke-width": 0.6 }));
    root.append(svg("text", { x: x(t), y: h - 16, "text-anchor": "middle", class: "tick", textContent: fmtAxis(t) }));
  }
  for (const t of yt) {
    root.append(svg("line", { x1: m.l, x2: w - m.r, y1: y(t), y2: y(t), stroke: C.line, "stroke-width": 0.6 }));
    root.append(svg("text", { x: m.l - 8, y: y(t) + 4, "text-anchor": "end", class: "tick", textContent: fmtAxis(t) }));
  }
  root.append(svg("text", { x: (m.l + w - m.r) / 2, y: h - 4, "text-anchor": "middle", class: "axis-label", textContent: "Print" }));

  const eqMax = Math.min(maxP, maxD);
  const eqMin = useLog ? Math.max(minP, minD) : 0;
  if (eqMax > eqMin) {
    root.append(
      svg("line", {
        x1: x(eqMin || (useLog ? minP : 0)),
        y1: y(eqMin || (useLog ? minD : 0)),
        x2: x(eqMax),
        y2: y(eqMax),
        stroke: C.muted,
        "stroke-dasharray": "4 4",
      })
    );
  }

  for (const row of pts) {
    const px = x(row.m.print > 0 ? row.m.print : useLog ? minP : 0);
    const py = y(row.m.digital > 0 ? row.m.digital : useLog ? minD : 0);
    const c = svg("circle", {
      cx: px,
      cy: py,
      r: isPinned(row.p.name) ? 6 : 4,
      fill: row.m.digital > 0 ? C.digital : C.print,
      opacity: 0.82,
      stroke: isPinned(row.p.name) ? C.ink : "none",
      "stroke-width": 1.5,
      style: "cursor:pointer",
    });
    tipOn(c, () => rankTip(row));
    c.addEventListener("click", () => togglePin(row.p.name));
    root.append(c);
  }
}

function renderBeeswarm(rows) {
  const el = $("chart-beeswarm");
  $("title-share").textContent = "How digital share is distributed";
  const pts = rows.filter((r) => r.m.total > 0);
  if (!pts.length) return emptyChart(el, "No titles match the current filters.");
  const { w, h } = sizeOf(el, 380);
  if (w < 40) return;
  const m = { t: 24, r: 16, b: 40, l: 40 };
  const x = scaleLinear([0, 1], [m.l, w - m.r]);
  const y0 = (m.t + h - m.b) / 2;
  const r = 5;
  const placed = [];
  const sorted = pts.slice().sort((a, b) => a.m.share - b.m.share);
  for (const row of sorted) {
    const px = x(row.m.share);
    let py = 0;
    let step = 0;
    while (placed.some((p) => (p.x - px) ** 2 + (p.y - py) ** 2 < (r * 2.05) ** 2) && Math.abs(py) < (h - m.t - m.b) / 2 - r) {
      step += 1;
      py = (step % 2 === 0 ? 1 : -1) * Math.ceil(step / 2) * r * 1.85;
    }
    placed.push({ row, x: px, y: py });
  }
  const root = drawFrame(el, w, h);
  for (const t of [0, 0.25, 0.5, 0.75, 1]) {
    root.append(svg("line", { x1: x(t), x2: x(t), y1: m.t, y2: h - m.b, stroke: C.line, "stroke-width": 0.6 }));
    root.append(svg("text", { x: x(t), y: h - 16, "text-anchor": "middle", class: "tick", textContent: fmtPct(t, 0) }));
  }
  for (const p of placed) {
    const c = svg("circle", {
      cx: p.x,
      cy: y0 + p.y,
      r: isPinned(p.row.p.name) ? 6 : r - 1,
      fill: p.row.p.type === "Jornal" ? C.digital : C.print,
      opacity: 0.85,
      stroke: isPinned(p.row.p.name) ? C.ink : "none",
      style: "cursor:pointer",
    });
    tipOn(c, () => rankTip(p.row));
    c.addEventListener("click", () => togglePin(p.row.p.name));
    root.append(c);
  }
  const wShare = (() => {
    const t = sum(pts, "total");
    return t ? sum(pts, "digital") / t : 0;
  })();
  const dx = x(wShare);
  const diamond = svg("polygon", {
    points: `${dx},${y0 - 11} ${dx + 8},${y0} ${dx},${y0 + 11} ${dx - 8},${y0}`,
    fill: C.ink,
  });
  tipOn(diamond, () => `<strong>Circulation-weighted share</strong>${fmtPct(wShare)}`);
  root.append(diamond);
  root.append(
    svg("text", {
      x: (m.l + w - m.r) / 2,
      y: h - 4,
      "text-anchor": "middle",
      class: "axis-label",
      textContent: "Digital share of paid copies",
    })
  );
}

function renderLeaders(rows) {
  const host = $("digital-leaders");
  const ranked = rows.filter((r) => r.m.digital > 0).sort((a, b) => b.m.digital - a.m.digital).slice(0, 8);
  const digital = sum(rows, "digital");
  if (!ranked.length) {
    host.innerHTML = `<p class="empty">No digital copies in the current filter set.</p>`;
    return;
  }
  host.innerHTML = `<div class="leaders">${ranked
    .map((r) => {
      const share = digital ? r.m.digital / digital : 0;
      return `<div class="leader"><span>${esc(r.p.name)}</span><span class="track"><span style="width:${(share * 100).toFixed(1)}%"></span></span><span class="num">${fmtPct(share)} · ${fmtCopies(r.m.digital)}</span></div>`;
    })
    .join("")}</div>`;
}

function renderChange(rows) {
  const pubs = rows.map((r) => r.p);
  const both = comparable(pubs, state.fromQ, state.toQ).map((p) => {
    const a = quarterMeasure(p, state.fromQ);
    const b = quarterMeasure(p, state.toQ);
    const chg = a.total ? (b.total - a.total) / a.total : 0;
    return { p, a, b, chg, delta: b.total - a.total };
  });
  $("title-slope").textContent = `Who moved between ${state.fromQ} and ${state.toQ}`;
  $("title-diverge").textContent = "Percent change, ranked";
  $("title-water").textContent = "What moved the market total";
  renderSlope(both);
  renderDiverge(both);
  renderWater(both);
}

function renderSlope(both) {
  const el = $("chart-slope");
  if (!both.length) return emptyChart(el, "No titles reported copies in both selected quarters.");
  const ranked = both.slice().sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg));
  const keep = new Set(ranked.slice(0, 24).map((r) => r.p.name).concat(state.pins));
  const shown = both.filter((r) => keep.has(r.p.name));
  const { w } = sizeOf(el, 420);
  if (w < 40) return;
  const h = Math.max(420, 48 + shown.length * 8);
  el.style.minHeight = `${h}px`;
  const m = { t: 20, r: 140, b: 24, l: 140 };
  const max = Math.max(...shown.flatMap((r) => [r.a.total, r.b.total]), 1);
  const y = scaleLinear([0, max], [h - m.b, m.t]);
  const x0 = m.l;
  const x1 = w - m.r;
  const root = drawFrame(el, w, h);
  root.append(svg("text", { x: x0, y: 14, "text-anchor": "middle", class: "tick", textContent: state.fromQ }));
  root.append(svg("text", { x: x1, y: 14, "text-anchor": "middle", class: "tick", textContent: state.toQ }));
  const labeled = new Set(
    shown
      .slice()
      .sort((a, b) => Math.abs(b.chg) - Math.abs(a.chg))
      .slice(0, 8)
      .map((r) => r.p.name)
      .concat(state.pins)
  );
  for (const row of shown) {
    const color = row.delta > 0 ? C.up : row.delta < 0 ? C.down : C.muted;
    const g = svg("g", { style: "cursor:pointer", opacity: isPinned(row.p.name) ? 1 : 0.75 });
    const line = svg("line", {
      x1: x0,
      y1: y(row.a.total),
      x2: x1,
      y2: y(row.b.total),
      stroke: color,
      "stroke-width": isPinned(row.p.name) ? 2.4 : 1.2,
    });
    g.append(line);
    g.append(svg("circle", { cx: x0, cy: y(row.a.total), r: 3, fill: color }));
    g.append(svg("circle", { cx: x1, cy: y(row.b.total), r: 3, fill: color }));
    if (labeled.has(row.p.name)) {
      g.append(
        svg("text", {
          x: x0 - 8,
          y: y(row.a.total) + 4,
          "text-anchor": "end",
          class: "tick",
          textContent: row.p.name,
        })
      );
    }
    tipOn(g, () => `<strong>${esc(row.p.name)}</strong>${state.fromQ} ${fmtCopies(row.a.total)} → ${state.toQ} ${fmtCopies(row.b.total)} (${fmtSignedPct(row.chg)})`);
    g.addEventListener("click", () => togglePin(row.p.name));
    root.append(g);
  }
}

function renderDiverge(both) {
  const el = $("chart-diverge");
  if (!both.length) return emptyChart(el, "No titles reported copies in both selected quarters.");
  const ranked = both.slice().sort((a, b) => a.chg - b.chg);
  const { w } = sizeOf(el, 420);
  if (w < 40) return;
  const rowH = 22;
  const m = { t: 8, r: 56, b: 8, l: 150 };
  const h = Math.max(420, m.t + m.b + ranked.length * rowH);
  el.style.minHeight = `${Math.min(h, 24 * rowH + 40)}px`;
  const vis = ranked.length > 24 ? ranked.slice(0, 12).concat(ranked.slice(-12)) : ranked;
  const hh = m.t + m.b + vis.length * rowH;
  const maxAbs = Math.max(...vis.map((r) => Math.abs(r.chg)), 0.01);
  const x = scaleLinear([-maxAbs, maxAbs], [m.l, w - m.r]);
  const root = drawFrame(el, w, Math.max(hh, 420));
  const mid = x(0);
  root.append(svg("line", { x1: mid, x2: mid, y1: m.t, y2: hh - m.b, stroke: C.ink, "stroke-width": 1 }));
  vis.forEach((row, i) => {
    const y = m.t + i * rowH + 3;
    const x1 = x(row.chg);
    const left = Math.min(mid, x1);
    const width = Math.abs(x1 - mid);
    const rect = barRect(left, y, width, 14, row.chg >= 0 ? C.up : C.down, () =>
      `<strong>${esc(row.p.name)}</strong>${fmtSignedPct(row.chg)} · ${fmtCopies(row.a.total)} → ${fmtCopies(row.b.total)}`
    );
    rect.style.cursor = "pointer";
    rect.addEventListener("click", () => togglePin(row.p.name));
    root.append(rect);
    root.append(
      svg("text", {
        x: m.l - 8,
        y: y + 11,
        "text-anchor": "end",
        class: "tick",
        textContent: row.p.name.length > 22 ? `${row.p.name.slice(0, 20)}…` : row.p.name,
      })
    );
    root.append(
      svg("text", {
        x: w - m.r + 6,
        y: y + 11,
        class: "tick",
        textContent: fmtSignedPct(row.chg, 0),
      })
    );
  });
}

function renderWater(both) {
  const el = $("chart-water");
  if (!both.length) return emptyChart(el, "No titles reported copies in both selected quarters.");
  const start = both.reduce((s, r) => s + r.a.total, 0);
  const end = both.reduce((s, r) => s + r.b.total, 0);
  const movers = both.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top = movers.slice(0, 8);
  const rest = movers.slice(8);
  const other = rest.reduce((s, r) => s + r.delta, 0);
  const steps = [
    { name: state.fromQ, value: start, kind: "total" },
    ...top.map((r) => ({ name: r.p.name, value: r.delta, kind: "delta", pub: r.p })),
  ];
  if (rest.length) steps.push({ name: `Other (${rest.length})`, value: other, kind: "delta" });
  steps.push({ name: state.toQ, value: end, kind: "total" });

  const { w } = sizeOf(el, 240);
  if (w < 40) return;
  const m = { t: 20, r: 12, b: 64, l: 48 };
  const bw = Math.min(48, ((w - m.l - m.r) / steps.length) * 0.6);
  let running = 0;
  const laid = steps.map((s, i) => {
    if (s.kind === "total") {
      const item = { ...s, base: 0, top: s.value, i };
      running = s.value;
      return item;
    }
    const base = s.value >= 0 ? running : running + s.value;
    const item = { ...s, base, top: base + Math.abs(s.value), i };
    running += s.value;
    return item;
  });
  const max = Math.max(...laid.map((s) => s.top), 1);
  const min = Math.min(0, ...laid.map((s) => s.base));
  const x = scaleLinear([-0.5, steps.length - 0.5], [m.l, w - m.r]);
  const y = scaleLinear([min, max], [240 - m.b, m.t]);
  const root = drawFrame(el, w, 240);

  for (const t of niceTicks(min, max)) {
    root.append(svg("line", { x1: m.l, x2: w - m.r, y1: y(t), y2: y(t), stroke: C.line, "stroke-width": 0.6 }));
    root.append(svg("text", { x: m.l - 6, y: y(t) + 4, "text-anchor": "end", class: "tick", textContent: fmtAxis(t) }));
  }
  laid.forEach((s) => {
    const fill = s.kind === "total" ? C.ink : s.value >= 0 ? C.up : C.down;
    const rect = barRect(x(s.i) - bw / 2, y(s.top), bw, y(s.base) - y(s.top), fill, () => {
      if (s.kind === "total") return `<strong>${esc(s.name)}</strong>${fmtCopies(s.value)} copies`;
      return `<strong>${esc(s.name)}</strong>${s.value >= 0 ? "+" : ""}${fmtCopies(s.value)}`;
    });
    if (s.pub) {
      rect.style.cursor = "pointer";
      rect.addEventListener("click", () => togglePin(s.pub.name));
    }
    root.append(rect);
    const label = s.name.length > 12 ? `${s.name.slice(0, 11)}…` : s.name;
    const tx = svg("text", { x: x(s.i), y: 240 - 18, "text-anchor": "end", class: "tick", textContent: label });
    tx.setAttribute("transform", `rotate(-40 ${x(s.i)} ${240 - 18})`);
    root.append(tx);
  });
}

function sparkline(pub, w = 72, h = 24) {
  const vals = QUARTERS.map((q) => {
    const t = cellTotal(pub.quarters[q]);
    return t > 0 ? t * weightOf(pub) : null;
  });
  const nums = vals.filter((v) => v != null);
  if (!nums.length) return `<span class="meta">—</span>`;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const xs = vals.map((_, i) => 4 + (i * (w - 8)) / 3);
  const y = (v) => (max === min ? h / 2 : 4 + ((max - v) / (max - min)) * (h - 8));
  let d = "";
  vals.forEach((v, i) => {
    if (v == null) return;
    d += `${d && vals[i - 1] != null ? "L" : "M"}${xs[i].toFixed(1)} ${y(v).toFixed(1)} `;
  });
  const last = [...vals].reverse().find((v) => v != null);
  const first = vals.find((v) => v != null);
  const color = last >= first ? C.up : C.down;
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><path d="${d.trim()}" fill="none" stroke="${color}" stroke-width="1.6"/>${vals
    .map((v, i) => (v == null ? "" : `<circle cx="${xs[i]}" cy="${y(v)}" r="1.8" fill="${color}"/>`))
    .join("")}</svg>`;
}

function renderCompare() {
  const empty = $("compare-empty");
  const grid = $("compare-grid");
  const pubs = state.pins.map((name) => state.pubs.find((p) => p.name === name)).filter(Boolean);
  empty.hidden = pubs.length > 0;
  if (!pubs.length) {
    grid.replaceChildren();
    return;
  }
  grid.innerHTML = pubs
    .map((p) => {
      const m = measure(p);
      const share = m.share;
      return `<article class="compare-card">
        <header>
          <div>
            <h3>${esc(p.name)}</h3>
            <p class="meta">${typeLabel(p.type)} · ${periodLabel(p.periodicity)} · ${m.nq} quarter${m.nq === 1 ? "" : "s"}</p>
          </div>
          <button type="button" class="btn text" data-unpin="${esc(p.name)}">Remove</button>
        </header>
        <div class="stats-row">
          <div><span>Digital</span><strong>${fmtCopies(m.digital)}</strong></div>
          <div><span>Print</span><strong>${fmtCopies(m.print)}</strong></div>
          <div><span>Total</span><strong>${fmtCopies(m.total)}</strong></div>
        </div>
        <p class="meta">${fmtPct(share)} digital · ${measureLabel()}</p>
        <div class="mixbar" aria-hidden="true"><i class="d" style="width:${(share * 100).toFixed(1)}%"></i><i class="p" style="width:${((1 - share) * 100).toFixed(1)}%"></i></div>
        <p class="legend"><span><i class="swatch digital"></i>Digital</span><span><i class="swatch print"></i>Print</span></p>
        ${sparkline(p, 220, 42)}
      </article>`;
    })
    .join("");
  grid.querySelectorAll("[data-unpin]").forEach((btn) => {
    btn.addEventListener("click", () => togglePin(btn.dataset.unpin));
  });
}

function renderTable(rows) {
  const tbody = $("data-table").querySelector("tbody");
  const key = state.sort.key;
  const dir = state.sort.dir === "asc" ? 1 : -1;
  const sorted = rows.slice().sort((a, b) => {
    const va = tableValue(a, key);
    const vb = tableValue(b, key);
    if (typeof va === "string") return va.localeCompare(vb, "pt") * dir;
    return (va - vb) * dir;
  });
  const max = Math.max(...sorted.map((r) => r.m.share), 0.0001);
  tbody.innerHTML = sorted
    .map((r) => {
      const shareW = `${((r.m.share / max) * 100).toFixed(1)}%`;
      return `<tr class="${isPinned(r.p.name) ? "is-pinned" : ""}" data-name="${esc(r.p.name)}">
        <td>${esc(r.p.name)}</td>
        <td>${esc(typeLabel(r.p.type))}</td>
        <td>${esc(periodLabel(r.p.periodicity))}</td>
        <td>${r.m.nq}</td>
        <td class="num">${fmtCopies(r.m.digital)}</td>
        <td class="num">${fmtCopies(r.m.print)}</td>
        <td class="num">${fmtCopies(r.m.total)}</td>
        <td class="num"><span class="bar-inline"><i style="width:${shareW}"></i></span>${fmtPct(r.m.share)}</td>
        <td>${sparkline(r.p)}</td>
      </tr>`;
    })
    .join("");
  tbody.querySelectorAll("tr").forEach((tr) => {
    tr.addEventListener("click", () => togglePin(tr.dataset.name));
  });
}

function tableValue(row, key) {
  if (key === "name") return row.p.name;
  if (key === "type") return typeLabel(row.p.type);
  if (key === "periodicity") return periodLabel(row.p.periodicity);
  if (key === "quarters") return row.m.nq;
  if (key === "digital") return row.m.digital;
  if (key === "print") return row.m.print;
  if (key === "share") return row.m.share;
  return row.m.total;
}

function exportCsv() {
  const rows = withMeasures(filteredPubs());
  const header = ["Publication", "Type", "Periodicity", "Quarters", "Digital", "Print", "Total", "Digital share"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [
        csv(r.p.name),
        csv(typeLabel(r.p.type)),
        csv(periodLabel(r.p.periodicity)),
        r.m.nq,
        Math.round(r.m.digital),
        Math.round(r.m.print),
        Math.round(r.m.total),
        r.m.share.toFixed(4),
      ].join(",")
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "paid-circulation.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

function csv(value) {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

init();
