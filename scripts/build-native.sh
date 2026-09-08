#!/usr/bin/env bash
set -eo pipefail
cd "$(dirname "$0")/.."
export PATH="$PWD/.tools/venv/bin:$PATH"
cmake -S . -B build/native -G Ninja -DCMAKE_BUILD_TYPE=RelWithDebInfo "$@"
cmake --build build/native
ctest --test-dir build/native --output-on-failure
