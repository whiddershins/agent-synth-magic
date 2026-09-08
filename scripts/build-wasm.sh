#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PWD/.tools/venv/bin:$PATH"
if [ -f .tools/emsdk/emsdk_env.sh ]; then
  source .tools/emsdk/emsdk_env.sh >/dev/null 2>&1
fi
if ! command -v emcmake >/dev/null; then
  echo 'Emscripten is missing. Run npm run setup first.' >&2
  exit 1
fi
emcmake cmake -S . -B build/wasm -G Ninja -DCMAKE_BUILD_TYPE=Release -DAGENT_SYNTH_BUILD_TESTS=OFF
cmake --build build/wasm
mkdir -p packages/web/public/wasm
cp build/wasm/packages/dsp/agent-synth.wasm packages/web/public/wasm/agent-synth.wasm
