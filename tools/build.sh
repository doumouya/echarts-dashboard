#!/bin/sh
# Build the dashboard into one self-contained, offline index.html: ECharts + the wasm aggregation
# engine (base64-embedded) + the UI, all inlined. No server, no fetch, nothing leaves the browser.
# Usage: sh tools/build.sh [--dev]   (default is an optimized release build)
set -e
cd "$(dirname "$0")/.."
. "$HOME/.cargo/env" 2>/dev/null || true

# Vendor ECharts on first build (kept out of git; the built index.html embeds it).
if [ ! -f web/vendor/echarts.min.js ]; then
  echo "fetching ECharts..."
  mkdir -p web/vendor
  curl -fsSL https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js -o web/vendor/echarts.min.js
fi

wasm-pack build crates/wasm --target no-modules --out-dir pkg-web --no-typescript "$@"

B64=$(base64 -w0 crates/wasm/pkg-web/dashboard_wasm_bg.wasm)
{
  printf '<!doctype html><html lang="en"><head><meta charset="utf-8">'
  printf '<meta name="viewport" content="width=device-width,initial-scale=1">'
  printf '<title>echarts-dashboard</title><style>'
  cat web/style.css
  printf '</style></head><body>'
  cat web/body.html
  # ECharts (guard any literal </script in the minified source so it can't close the tag early)
  printf '<script>'
  sed 's#</script#<\\/script#g' web/vendor/echarts.min.js
  printf '</script>\n<script>'
  cat crates/wasm/pkg-web/dashboard_wasm.js
  printf '</script>\n<script>const WASM_B64="%s";\n' "$B64"
  cat web/app.js
  printf '</script></body></html>'
} > index.html

echo "built index.html ($(wc -c < index.html) bytes; wasm $(wc -c < crates/wasm/pkg-web/dashboard_wasm_bg.wasm) bytes)"
