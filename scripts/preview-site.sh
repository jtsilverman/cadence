#!/usr/bin/env bash
# Serve the whole site in one place: the rebuilt main page at `/`, the funnel
# pages from the app. A preview only, until page/index.html is wired into app/.
#
# public/main.html is generated here and gitignored, so the drafts page stays
# the single source of that copy. The rewrite that serves it is off unless
# SITE_PREVIEW=1, because the eval server reads the same next.config.ts.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC="drafts/website/page/index.html"
OUT="public/main.html"

# the drafts page links to its sibling HTML files; the app serves those routes
sed -e 's#\.\./site/waitlist\.html?cta=#/waitlist?cta=#g' \
    -e 's#\.\./site/faq\.html#/faq#g' \
    "$SRC" > "$OUT"
echo "generated $OUT from $SRC"

echo "starting the app with the preview rewrite on"
SITE_PREVIEW=1 npm run dev
