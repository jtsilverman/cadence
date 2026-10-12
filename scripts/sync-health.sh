#!/usr/bin/env bash
# Sync the owner's recent health data into the diary.
#   bash scripts/sync-health.sh        # last 2 days, all three sources
#   bash scripts/sync-health.sh 30     # backfill 30 days
set -euo pipefail
cd "$(dirname "$0")/.."
DAYS="${1:-2}"
npx tsx scripts/sync-whoop.ts --days "$DAYS"
python3 -m integrations sync --days "$DAYS"
