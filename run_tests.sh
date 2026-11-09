#!/bin/sh
# GPU Explorer unit and HTTP contract tests. No browser and no WebGL.
# Whole-page browser tests live in tests/e2e and run with ./run_e2e.sh.
set -e
cd "$(dirname "$0")"
node --test tests/state.test.js tests/interaction-state.test.js
node tests/journey-lab.test.js
node --test tests/i18n.test.mjs
node --test tests/hardware-scene.test.mjs
node --test tests/hbm-model.test.mjs tests/support-components.test.mjs tests/teaching-flow.test.mjs
node --test tests/selection-feedback.test.mjs
node tests/integration.js
echo "ALL TESTS PASSED"
