#!/usr/bin/env bash
set -euo pipefail

workspace_dir="$(cd "$(dirname "$0")/.." && pwd)"
report_dir="${SANITY_REPORT_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/wol-sieve-sanity.XXXXXX")}"
mkdir -p "$report_dir"
report_dir="$(cd "$report_dir" && pwd)"
echo "Sanity reports: $report_dir"

docker run --rm --init \
  -v "$workspace_dir:/source:ro" \
  -v "$report_dir:/reports" \
  -w /work node:22-bookworm-slim sh -c '
    cp /source/package*.json /source/tsconfig.json . &&
    cp -r /source/src /source/scripts /source/postman . &&
    npm ci --no-audit --no-fund > /reports/install.log 2>&1 &&
    npm run build > /reports/build.log 2>&1 &&
    node scripts/local-sanity.mjs
  '
