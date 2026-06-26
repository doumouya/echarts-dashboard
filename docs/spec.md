# echarts-dashboard — spec

## What it is
A single-page, offline dashboard. You open a CSV; you add chart cards, each of which groups the data
by a column, aggregates a measure (count / sum / avg / min / max), and renders it as a bar, line, or
pie chart. Everything — parsing, grouping, aggregation — happens in the browser, so the file never
leaves the machine.

## Architecture (three thin layers)
1. **`dashboard-core` (Rust)** — the engine. Type-inferring CSV load + `aggregate(category, measure,
   agg) → Series { labels, values }`, sorted by value descending. No IO, no deps → small wasm.
2. **`dashboard-wasm` (Rust → JS)** — the `WasmData` binding (the JS API below). The integration seam.
3. **Front-end (vanilla JS + ECharts)** — chart cards that drive the binding and render with ECharts.
   Built via Claude Design from [`fe-brief.md`](fe-brief.md).

Then **packaged as one file**: ECharts and the wasm engine (base64) are inlined into a single
`index.html`, instantiated in-page. Double-click to run, fully offline.

## The engine API (Rust)
```rust
Table::from_csv(&str) -> Table        // parse + infer ColKind::{Number,Text} per column
table.headers / kinds / nrows() / numeric_cols()
table.aggregate(category: usize, measure: Option<usize>, agg: Agg) -> Series
// Agg = Count | Sum | Avg | Min | Max ; Count ignores `measure`; non-numeric measure cells are skipped
```

## The JS API (wasm-bindgen, the FE codes against this)
```ts
class WasmData {
  static fromCsv(csv: string): WasmData;
  headers(): string[];
  kinds(): string[];          // "Number" | "Text" — offer numeric columns as measures
  nrows(): number;
  aggregate(category: number, measure: number, agg: string): { labels: string[]; values: number[] };
  // measure = -1 for a plain count; agg ∈ "count"|"sum"|"avg"|"min"|"max"
}
```
A chart card calls `aggregate(...)` whenever its controls change and feeds `{ labels, values }`
straight into an ECharts option (category axis = labels, series data = values; for pie, name/value pairs).

## Scope
- **v1 (this build):** the aggregations above + bar/line/pie + a grid of configurable chart cards +
  single-file packaging.
- **Later:** multi-series (group + split-by), a measure with multiple aggregations, time-axis charts,
  number formatting, and saved layouts.

## Non-goals
No backend, no accounts, no network. Identity: an independent tool — no references to any source
project anywhere in the code, comments, or docs. ECharts is third-party (Apache-2.0), vendored at build.
