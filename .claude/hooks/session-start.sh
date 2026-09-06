#!/usr/bin/env bash
# Make a fresh session able to run the tests: install the package and build the
# synthetic fixtures the suite depends on. Never fails the session.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 0

python -m pip install -q -e ".[dev]" 2>/dev/null || python -m pip install -q -e . 2>/dev/null
python tests/fixtures/make_fixtures.py >/dev/null 2>&1 \
  && echo "figurine-factory ready: run 'make test' (fixtures built)." \
  || echo "figurine-factory: fixtures not built; run 'make fixtures'."
exit 0
