#!/usr/bin/env bash
# Run this from your own terminal (needs your GitHub auth).
# Branch site/board-landing is already committed locally — this just publishes it.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

git push -u origin site/board-landing

gh pr create \
  --base main \
  --head site/board-landing \
  --title "Board-direction site: landing + faq + waitlist + thanks" \
  --body-file PR_BODY.md

gh pr close 35 --comment "Superseded by the board-direction site on site/board-landing — that branch is the landing page and website going forward."
