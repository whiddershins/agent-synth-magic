#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$PWD/.tools/venv/bin:$PATH"
cmake --install build/native --prefix "$PWD/build/install"
cmake -S tests/consumer -B build/consumer -G Ninja -DCMAKE_PREFIX_PATH="$PWD/build/install"
cmake --build build/consumer
build/consumer/consumer
