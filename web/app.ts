/* The dashboard UI: a typed wasm aggregation engine + web-kit chrome + ECharts. The engine holds the
   CSV; each chart card asks it for a fresh { labels, values } series whenever its controls change.
   Built with web-kit components and tokens — no innerHTML; the DOM is built with el(). */
// Import each component directly (not via the web-kit barrel): the barrel pulls in web-kit's own
// `chart` component, whose typed view of the global `echarts` would clash with our echarts.d.ts.
import { el } from "../../web-kit/src/el";
import { button } from "../../web-kit/src/components/button";
import { iconButton } from "../../web-kit/src/components/iconButton";
import { card } from "../../web-kit/src/components/card";
import { emptyState } from "../../web-kit/src/components/emptyState";
import { select } from "../../web-kit/src/components/select";

type Data = wasm_bindgen.WasmData;

let WasmData: typeof wasm_bindgen.WasmData;
let data: Data | null = null;
let headers: string[] = [];
let kinds: string[] = [];
let seq = 0;
const THEME: string | null = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : null;

const byId = (id: string): HTMLElement => document.getElementById(id) as HTMLElement;

function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

/** Pre-built <option> children for a column picker; numericOnly skips non-Number columns. */
function optionEls(selected: number, numericOnly: boolean): HTMLOptionElement[] {
  return headers.flatMap((h, i) =>
    numericOnly && kinds[i] !== "Number" ? [] : [el("option", { value: String(i), selected: i === selected }, h)],
  );
}

/** The inner <select> of a web-kit select field (the factory returns the wrapper div). */
function selectEl(field: HTMLElement): HTMLSelectElement {
  return field.querySelector("select") as HTMLSelectElement;
}

function buildOption(type: string, labels: string[], values: number[], title: string): Record<string, unknown> {
  const base: Record<string, unknown> = {
    title: { text: title, textStyle: { fontSize: 13 } },
    tooltip: {},
    grid: { left: "14%", right: "6%", bottom: "16%", top: "20%" },
  };
  if (type === "pie") {
    return {
      ...base,
      tooltip: { trigger: "item" },
      series: [{ type: "pie", radius: "62%", center: ["50%", "58%"], data: labels.map((l, i) => ({ name: l, value: values[i] })) }],
    };
  }
  return {
    ...base,
    xAxis: { type: "category", data: labels, axisLabel: { rotate: labels.length > 6 ? 30 : 0 } },
    yAxis: { type: "value" },
    series: [{ type, data: values, smooth: type === "line" }],
  };
}

/** A sensible default "group by": a real categorical dimension. Prefer a column with ≥3 distinct
 *  values (over a 2-value flag like a boolean) and, among those, the fewest groups for a clean
 *  chart — which also skips unique keys like a name. Falls back to the first Text column. */
function defaultCategory(): number {
  const texts = kinds.flatMap((k, i) => (k === "Text" ? [i] : []));
  if (!texts.length) return 0;
  let best = texts[0]!;
  let bestGroup = 2; // 0 = proper categorical (≥3 distinct), 1 = low-cardinality flag
  let bestN = Infinity; // distinct count (fewer = cleaner chart)
  for (const i of texts) {
    const n = data!.aggregate(i, -1, "count").labels.length; // distinct groups
    const group = n >= 3 ? 0 : 1;
    if (group < bestGroup || (group === bestGroup && n < bestN)) { bestGroup = group; bestN = n; best = i; }
  }
  return best;
}
/** A sensible default measure: the first numeric column that isn't an identifier (an `id` /
 *  `*_id` column, or the leading column). Falls back to the first numeric, or -1 if none. */
function defaultMeasure(): number {
  const nums = kinds.flatMap((k, i) => (k === "Number" ? [i] : []));
  const real = nums.find((i) => {
    const h = (headers[i] ?? "").toLowerCase();
    return i !== 0 && h !== "id" && !h.endsWith("_id");
  });
  return real ?? (nums[0] ?? -1);
}

function addChart(presetAgg?: string): void {
  if (!data) return;
  const id = "chart" + seq++;
  const catIdx = defaultCategory();
  const measIdx = defaultMeasure();
  const defAgg = presetAgg ?? (measIdx >= 0 ? "sum" : "count");

  const catField = select({ size: "sm", attrs: { title: "group by" }, children: optionEls(catIdx, false) });
  const aggField = select({ size: "sm", attrs: { title: "aggregate" }, children: ["count", "sum", "avg", "min", "max"].map((a) => el("option", { value: a, selected: a === defAgg }, a)) });
  const measureField = select({ size: "sm", attrs: { title: "measure" }, children: optionEls(measIdx < 0 ? 0 : measIdx, true) });
  const typeField = select({ size: "sm", attrs: { title: "chart" }, children: ["bar", "line", "pie"].map((t) => el("option", { value: t }, t)) });
  const cat = selectEl(catField);
  const agg = selectEl(aggField);
  const measure = selectEl(measureField);
  const typ = selectEl(typeField);

  const removeBtn = iconButton("✕", { label: "remove chart", size: "sm" });
  const ctrls = el("div", { class: "ctrls" }, catField, aggField, measureField, typeField, el("span", { class: "spacer" }), removeBtn);
  const chartDiv = el("div", { class: "chart", id });
  const cardNode = card([ctrls, chartDiv]);
  byId("grid").appendChild(cardNode);

  const chart = echarts.init(chartDiv, THEME, { renderer: "canvas" });
  const render = (): void => {
    const c = Number(cat.value);
    const a = agg.value;
    const hideMeasure = a === "count" || measure.options.length === 0;
    measureField.style.display = hideMeasure ? "none" : "";
    const m = a === "count" ? -1 : Number(measure.value || -1);
    const series = data!.aggregate(c, m, a);
    const what = a === "count" ? "count" : `${a} ${headers[m] ?? ""}`;
    chart.setOption(buildOption(typ.value, series.labels, series.values, `${what} by ${headers[c] ?? ""}`), true);
  };
  [cat, agg, measure, typ].forEach((s) => s.addEventListener("change", render));
  removeBtn.addEventListener("click", () => { chart.dispose(); cardNode.remove(); });
  render();
}

// A synthetic French clients dataset — a categorical Région plus numeric revenue/orders, so
// group-by + aggregate produces a real chart on first load. Synthetic on purpose: no real data ships here.
const SAMPLE_CSV = `id,name,city,region,revenue_eur,orders,active,signup_date
1,Marie Dupont,Paris,Île-de-France,12500,8,true,2024-03-14
2,Liam O'Brien,Rennes,Bretagne,8750,5,false,2023-11-02
3,Sofia Rossi,Toulouse,Occitanie,1300,2,true,2024-02-28
4,Hans Becker,Strasbourg,Grand Est,23400,15,true,2024-01-09
5,Amélie Laurent,Paris,Île-de-France,5600,4,false,2023-07-07
6,Lucas Martin,Nantes,Pays de la Loire,940,1,true,2024-09-19
7,Inès Girard,Lyon,Auvergne-Rhône-Alpes,15250,11,true,2024-01-11
8,Chen Wei,Paris,Île-de-France,3420,3,false,2024-05-05
9,Olivia Brown,Bordeaux,Nouvelle-Aquitaine,6300,5,true,2023-08-23
10,Léa Moreau,Rennes,Bretagne,7800,6,true,2024-04-30
11,Thomas Petit,Marseille,Provence-Alpes-Côte d'Azur,19999,14,false,2023-12-12
12,Camille Roux,Toulouse,Occitanie,2150,2,true,2024-06-08
13,Noah Garcia,Lille,Hauts-de-France,6300,5,true,2024-02-17
14,Emma Fontaine,Paris,Île-de-France,11100,9,false,2024-03-22
15,Hugo Lefebvre,Nantes,Pays de la Loire,4500,3,true,2023-10-21
16,Gabriel Lopez,Bordeaux,Nouvelle-Aquitaine,1750,1,false,2024-07-29
`;

function openCsv(text: string): void {
  data = WasmData.fromCsv(text);
  headers = data.headers();
  kinds = data.kinds();
  byId("grid").replaceChildren();
  addChart(); // sum of the measure by the chosen dimension
  if (kinds.includes("Number")) addChart("count"); // a complementary view: counts by that dimension
}

function showHint(): void {
  byId("grid").replaceChildren(
    emptyState({
      dropzone: true,
      class: "grid-span",
      glyph: "▦",
      lead: "Open a CSV — it stays on your device.",
      description: "Group, aggregate, and chart it. All computed in your browser; nothing is uploaded. No file handy? Click “Load sample” to chart a demo dataset.",
    }),
  );
}

function readFile(file: File | undefined): void {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => openCsv(String(reader.result));
  reader.readAsText(file);
}

function buildChrome(): void {
  const file = el("input", { type: "file", accept: ".csv,text/csv" });
  file.hidden = true;
  file.addEventListener("change", () => readFile(file.files?.[0]));

  const header = el(
    "header",
    { class: "app-header" },
    el("h1", {}, "echarts-dashboard"),
    el("span", { class: "muted" }, "your data never leaves this page"),
    el("span", { class: "spacer" }),
    button("+ Chart", { onClick: () => addChart() }),
    button("Load sample", { onClick: () => openCsv(SAMPLE_CSV) }),
    button("Open CSV", { variant: "primary", onClick: () => file.click() }),
    file,
  );
  byId("root").append(header, el("main", { id: "grid" }));
  showHint();
}

window.addEventListener("DOMContentLoaded", async () => {
  await wasm_bindgen({ module_or_path: b64ToBytes(WASM_B64) });
  WasmData = wasm_bindgen.WasmData;
  buildChrome();

  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => { e.preventDefault(); readFile(e.dataTransfer?.files?.[0]); });
  window.addEventListener("resize", () => {
    document.querySelectorAll<HTMLElement>(".chart").forEach((c) => echarts.getInstanceByDom(c)?.resize());
  });
});
