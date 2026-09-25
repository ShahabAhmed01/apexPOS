#!/usr/bin/env bash
# Runs the critical gate suite N times (default 3), recording each run's
# result and log under artifacts/$APEX_RUN_ID/critical/.
# Any failure aborts the loop — flake = not verified.
set -u
RUN_ID="${APEX_RUN_ID:-local}"
TIMES="${1:-3}"
OUT="artifacts/$RUN_ID/critical"
mkdir -p "$OUT"

echo "runId=$RUN_ID runs=$TIMES"
for i in $(seq 1 "$TIMES"); do
  echo "--- run $i: vitest ---"
  if ! npm test >"$OUT/run$i-vitest.log" 2>&1; then
    echo "RUN $i FAILED (vitest)"; exit 1
  fi
  grep -E "Test Files|Tests " "$OUT/run$i-vitest.log" | tail -2
  echo "--- run $i: e2e ---"
  if ! npm run test:e2e >"$OUT/run$i-e2e.log" 2>&1; then
    echo "RUN $i FAILED (e2e)"; exit 1
  fi
  grep -E "passed|failed" "$OUT/run$i-e2e.log" | tail -2
done
echo "ALL $TIMES RUNS PASSED"
