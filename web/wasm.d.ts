/* Ambient types for the wasm aggregation engine. wasm-pack's no-modules build exposes a global
   `wasm_bindgen` initializer plus a `WasmData` class under the same name; `WASM_B64` is the base64
   wasm the build inlines. This file types that boundary so the UI calls the Rust engine type-safely.
   (The build runs wasm-pack with `--no-typescript`, so the Rust `#[wasm_bindgen]` block is the source
   of truth — see crates/wasm/src/lib.rs.) */

declare global {
  /** Initialize the wasm module from the embedded bytes, then read `wasm_bindgen.WasmData`.
      The no-modules glue takes a single options object; positional bytes are deprecated. */
  function wasm_bindgen(input?: { module_or_path: ArrayBufferView }): Promise<unknown>;

  namespace wasm_bindgen {
    class WasmData {
      static fromCsv(csv: string): WasmData;
      headers(): string[];
      /** Per-column type: "Number" | "Text" (the UI offers Number columns as measures). */
      kinds(): string[];
      nrows(): number;
      /** Group by `category`, combine `measure` with `agg` ("count"|"sum"|"avg"|"min"|"max"); pass
          `measure = -1` for a plain count. Returns `{ labels, values }` — exactly ECharts' shape. */
      aggregate(category: number, measure: number, agg: string): { labels: string[]; values: number[] };
    }
  }

  const WASM_B64: string;
}

export {};
