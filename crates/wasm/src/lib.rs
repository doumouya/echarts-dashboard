//! The JavaScript binding for the aggregation engine. The UI loads a CSV once into `WasmData`, then
//! calls `aggregate(...)` per chart to get `{ labels, values }` — exactly the shape ECharts wants.
//! The engine stays pure; this layer only converts types at the boundary.

use dashboard_core::{Agg, ColKind, Table};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmData {
    inner: Table,
}

#[wasm_bindgen]
impl WasmData {
    #[wasm_bindgen(js_name = fromCsv)]
    pub fn from_csv(csv: &str) -> WasmData {
        WasmData {
            inner: Table::from_csv(csv),
        }
    }

    pub fn headers(&self) -> Vec<String> {
        self.inner.headers.clone()
    }

    /// One label per column: `"Number"` or `"Text"` (so the UI offers numeric columns as measures).
    pub fn kinds(&self) -> Vec<String> {
        self.inner
            .kinds
            .iter()
            .map(|k| match k {
                ColKind::Number => "Number",
                ColKind::Text => "Text",
            })
            .map(str::to_string)
            .collect()
    }

    pub fn nrows(&self) -> usize {
        self.inner.nrows()
    }

    /// Group by `category`, combine `measure` with `agg` (`"count" "sum" "avg" "min" "max"`), and
    /// return `{ labels: string[], values: number[] }`. Pass `measure = -1` for a plain count.
    pub fn aggregate(&self, category: usize, measure: i32, agg: &str) -> JsValue {
        let m = if measure < 0 { None } else { Some(measure as usize) };
        let series = self.inner.aggregate(category, m, Agg::parse(agg));

        let labels = js_sys::Array::new();
        for l in &series.labels {
            labels.push(&JsValue::from_str(l));
        }
        let values = js_sys::Array::new();
        for v in &series.values {
            values.push(&JsValue::from_f64(*v));
        }
        let out = js_sys::Object::new();
        let _ = js_sys::Reflect::set(&out, &JsValue::from_str("labels"), &labels);
        let _ = js_sys::Reflect::set(&out, &JsValue::from_str("values"), &values);
        out.into()
    }
}
