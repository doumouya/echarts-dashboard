# echarts-dashboard — front-end brief (for Claude Design)

Build the UI for a fully client-side analytics dashboard. The aggregation engine already exists as a
wasm module (`WasmData`, see [`spec.md`](spec.md)) and charts render with ECharts; your job is the
interface. No backend, no framework — vanilla HTML/CSS/JS + ECharts.

## The experience
1. **Empty state** — a drop zone: "Open a CSV — it stays on your device." Button + drag-and-drop;
   read with `FileReader`, pass text to `WasmData.fromCsv(text)`.
2. **Dashboard** — a responsive grid of **chart cards**. Each card has a compact control row and a chart:
   - **Group by** (any column), **Aggregate** (`count/sum/avg/min/max`), **Measure** (numeric columns
     only — hide it when aggregate is `count`), **Chart type** (bar / line / pie), and a remove button.
   - On any change, call `data.aggregate(category, measure, agg)` and feed `{ labels, values }` into
     the ECharts option (category axis = labels; pie = name/value pairs). Re-use one ECharts instance
     per card; `resize()` on window resize.
   - An **+ Chart** button adds a card; a sensible default chart appears when a CSV loads.
3. **Polish worth adding:** a KPI strip (row count, distinct groups), number formatting, a theme that
   matches the page (ECharts `'dark'` when `prefers-color-scheme: dark`), empty/one-row guards, and an
   "export chart as PNG" (ECharts `getDataURL`).

## Look & feel
- Calm, analytical, dense-but-breathable. Cards on a `minmax()` auto-fill grid.
- **Relative units only** (`rem`/`em`/`%`); responsive down to a **14-inch laptop** (primary target).
- Accessible controls (labelled selects, keyboard-operable, visible focus), good contrast.
- Neutral palette via CSS variables + one accent; charts themed to match light/dark.

## Wiring notes
- Load the wasm with `wasm-pack`'s generated JS (`init()` then `WasmData`). I'll provide the built
  module; stub `WasmData` against the spec'd signatures until then.
- ECharts is vendored at build time and inlined into the single file — keep it loadable as a global
  `echarts`. Don't add a CDN dependency (it must work offline).

## Non-goals
No upload, no auth, no network. Nothing referencing any source project. Keep everything inlineable so
it ships as one double-clickable, offline `index.html`.
