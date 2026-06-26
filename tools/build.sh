#!/bin/sh
# Build the dashboard into one self-contained, offline index.html: ECharts + the wasm aggregation
# engine (base64-embedded) + the TypeScript UI (typechecked, bundled with web-kit), all inlined. No
# server, no fetch — nothing leaves the browser.
# Usage: sh tools/build.sh [--dev]   (--dev = faster wasm, no wasm-opt)
# Needs the sibling ../web-kit checked out (the UI imports it); CI does not run this.
set -e
cd "$(dirname "$0")/.."
. "$HOME/.cargo/env" 2>/dev/null || true
export PATH="/home/mansa/.nvm/versions/node/v24.16.0/bin:$PATH"

WK="../web-kit/src/tokens"
[ -d "$WK" ] || { echo "missing sibling ../web-kit"; exit 1; }

# Vendor ECharts on first build (kept out of git; the built index.html embeds it).
if [ ! -f web/vendor/echarts.min.js ]; then
  echo "fetching ECharts..."
  mkdir -p web/vendor
  curl -fsSL https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js -o web/vendor/echarts.min.js
fi

# 1. engine -> wasm
wasm-pack build crates/wasm --target no-modules --out-dir pkg-web --no-typescript "$@"

# 2. typecheck + bundle the TypeScript UI (web-kit is bundled in; ECharts stays a separate global)
[ -d node_modules ] || npm install --silent
./node_modules/.bin/tsc --noEmit
mkdir -p .build
./node_modules/.bin/esbuild web/app.ts --bundle --format=iife --outfile=.build/app.js

# 3. assemble the single self-contained file
B64=$(base64 -w0 crates/wasm/pkg-web/dashboard_wasm_bg.wasm)
{
  printf '<!doctype html><html lang="en"><head><meta charset="utf-8">'
  printf '<meta name="viewport" content="width=device-width,initial-scale=1">'
  printf '<title>echarts-dashboard</title><style>'
  cat "$WK/base.css" "$WK/colors.css" "$WK/typography.css" "$WK/spacing.css" "$WK/elevation.css" "$WK/charts.css" "$WK/responsive.css"
  cat web/app.css
  printf '</style></head><body>'
  cat web/body.html
  # ECharts (guard any literal </script in the minified source so it can't close the tag early)
  printf '<script>'
  sed 's#</script#<\\/script#g' web/vendor/echarts.min.js
  printf '</script>\n<script>'
  cat crates/wasm/pkg-web/dashboard_wasm.js
  printf '</script>\n<script>const WASM_B64="%s";</script>\n<script>' "$B64"
  cat .build/app.js
  printf '</script></body></html>'
} > index.html

echo "built index.html ($(wc -c < index.html) bytes; wasm $(wc -c < crates/wasm/pkg-web/dashboard_wasm_bg.wasm) bytes)"
