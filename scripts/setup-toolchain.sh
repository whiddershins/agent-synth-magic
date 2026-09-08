#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

version=$(cat .emscripten-version)
mkdir -p .tools
if [ ! -x .tools/venv/bin/cmake ]; then
  python3 -m venv .tools/venv
  .tools/venv/bin/python -m pip install --disable-pip-version-check --no-cache-dir 'cmake==3.31.6' 'ninja==1.11.1.4'
fi
if [ ! -d .tools/emsdk ]; then
  git clone --depth 1 --branch "$version" https://github.com/emscripten-core/emsdk.git .tools/emsdk
fi
if [ "$(git -C .tools/emsdk describe --tags --exact-match)" != "$version" ]; then
  echo 'The local emsdk checkout does not match .emscripten-version.' >&2
  exit 1
fi
.tools/emsdk/emsdk install "$version"
.tools/emsdk/emsdk activate "$version"
echo 'Local toolchain ready. Run npm install, then npm run build.'
