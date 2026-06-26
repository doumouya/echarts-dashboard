// Minimal reference dashboard driving the wasm aggregation engine + ECharts. A compact baseline for
// a polished front-end to replace. The engine holds the data; each chart card asks it for a fresh
// { labels, values } series whenever its controls change. `echarts`, `wasm_bindgen` and `WASM_B64`
// are defined in the scripts above this one.

let WasmData, data = null, headers = [], kinds = [], seq = 0;
const THEME = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : null;
const $ = (s) => document.querySelector(s);

function b64ToBytes(b64) {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}
function esc(s) {
  return String(s).replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
}

function openCsv(text) {
  data = WasmData.fromCsv(text);
  headers = data.headers();
  kinds = data.kinds();
  $("#grid").innerHTML = "";
  $("#hint").style.display = "none";
  addChart(); // one chart to start
  if (kinds.includes("Number")) addChart();
}

function optionTags(selected, numericOnly) {
  return headers
    .map((h, i) => (numericOnly && kinds[i] !== "Number" ? "" : `<option value="${i}"${i === selected ? " selected" : ""}>${esc(h)}</option>`))
    .join("");
}

function buildOption(type, labels, values, title) {
  const base = { title: { text: title, textStyle: { fontSize: 13 } }, tooltip: {}, grid: { left: "14%", right: "6%", bottom: "16%", top: "20%" } };
  if (type === "pie") {
    return { ...base, tooltip: { trigger: "item" }, series: [{ type: "pie", radius: "62%", center: ["50%", "58%"], data: labels.map((l, i) => ({ name: l, value: values[i] })) }] };
  }
  return {
    ...base,
    xAxis: { type: "category", data: labels, axisLabel: { rotate: labels.length > 6 ? 30 : 0 } },
    yAxis: { type: "value" },
    series: [{ type, data: values, smooth: type === "line" }],
  };
}

function addChart() {
  if (!data) return;
  const id = "chart" + seq++;
  const firstText = Math.max(0, kinds.indexOf("Text"));
  const firstNum = kinds.indexOf("Number");

  const card = document.createElement("div");
  card.className = "card";
  card.innerHTML =
    `<div class="ctrls">` +
    `<select class="cat" title="group by">${optionTags(firstText, false)}</select>` +
    `<select class="agg" title="aggregate">${["count", "sum", "avg", "min", "max"].map((a) => `<option value="${a}">${a}</option>`).join("")}</select>` +
    `<select class="measure" title="measure">${optionTags(firstNum < 0 ? 0 : firstNum, true)}</select>` +
    `<select class="type" title="chart"><option>bar</option><option>line</option><option>pie</option></select>` +
    `<span class="spacer"></span><button class="rm" title="remove">✕</button>` +
    `</div><div class="chart" id="${id}"></div>`;
  $("#grid").appendChild(card);

  const chart = echarts.init(card.querySelector(".chart"), THEME, { renderer: "canvas" });
  const render = () => {
    const cat = +card.querySelector(".cat").value;
    const agg = card.querySelector(".agg").value;
    const measureSel = card.querySelector(".measure");
    measureSel.style.display = agg === "count" || measureSel.options.length === 0 ? "none" : "";
    const measure = agg === "count" ? -1 : +(measureSel.value || -1);
    const type = card.querySelector(".type").value;
    const { labels, values } = data.aggregate(cat, measure, agg);
    const what = agg === "count" ? "count" : `${agg} ${headers[measure] ?? ""}`;
    chart.setOption(buildOption(type, labels, values, `${what} by ${headers[cat]}`), true);
  };
  card.querySelectorAll("select").forEach((s) => (s.onchange = render));
  card.querySelector(".rm").onclick = () => { chart.dispose(); card.remove(); };
  render();
}

function readFile(f) {
  if (!f) return;
  const r = new FileReader();
  r.onload = () => openCsv(r.result);
  r.readAsText(f);
}

window.addEventListener("DOMContentLoaded", async () => {
  await wasm_bindgen(b64ToBytes(WASM_B64));
  WasmData = wasm_bindgen.WasmData;

  $("#file").addEventListener("change", (e) => readFile(e.target.files[0]));
  $("#add").addEventListener("click", addChart);
  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => { e.preventDefault(); readFile(e.dataTransfer.files[0]); });
  window.addEventListener("resize", () => {
    document.querySelectorAll(".chart").forEach((c) => { const i = echarts.getInstanceByDom(c); if (i) i.resize(); });
  });
});
