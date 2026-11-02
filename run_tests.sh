#!/bin/sh
# GPU Explorer: state, schematic geometry, numeric examples and HTTP contracts.
# These checks complement real-browser QA; they do not execute WebGL.
set -e
cd "$(dirname "$0")"
node tests/state.test.js
node tests/scene-map.test.js
node tests/journey-lab.test.js
node --test tests/interaction-state.test.js
node --test tests/lesson-story.test.js
node --test tests/hardware-scene.test.mjs
node --test tests/hbm-model.test.mjs tests/support-components.test.mjs tests/teaching-flow.test.mjs
node --test tests/concept-models.test.mjs
node --test tests/selection-feedback.test.mjs
node tests/integration.js
echo "ALL TESTS PASSED"
