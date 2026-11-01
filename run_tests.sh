#!/bin/sh
# GPU Explorer v0 tests: unit (plain Node, works on gpuserver's Node 10)
# + integration (http serve + user flow).
set -e
cd "$(dirname "$0")"
node tests/state.test.js
node tests/scene-map.test.js
node tests/integration.js
echo "ALL TESTS PASSED"
