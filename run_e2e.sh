#!/bin/sh
# Whole-page browser tests. Needs Node 18+, playwright-core and a Chromium build.
# See README "Browser tests" for GX_CHROME / GX_PLAYWRIGHT / GX_BASE_URL / GX_SHOTS.
set -e
cd "$(dirname "$0")"
exec node tests/e2e/run.mjs "$@"
