# cadence

Agentic health OS: any recipe or workout anywhere → structured plans, groceries, a drafted week, and a diary that learns how you live. Backend is complete headless (specs/backend-complete.md). App UI shipped nutrition-only (PR #40). Chat coach certified (evals/report.md).

## Current phase (2026-08-18): wire the rebuilt main page into the app, then deploy

Sell-first waitlist push, nutrition-only pitch. Plan of record: `drafts/marketing-plan.md`; posts: `drafts/marketing-posts.md` + `drafts/build-in-public.md`. Nothing is deployed yet; there is no live URL.

**`drafts/website/page/index.html` is the rebuilt site** (PR #46, one self-contained file). Its centre is a six-beat demo that holds the page while it runs: coming down it plays at its own pace and the scroll can hurry it without skipping a beat, coming up from below the scroll walks it back beat six to beat one, and the hold releases only at the end the reader is travelling toward. Copy, positioning, and audience are locked in `drafts/website/WEBSITE.md` (2026-08-12). **"Diet" is retired from all site copy.** The hero is "Take control of how you eat, without it taking control of your life."

**The three funnel pages are built in the app** (PR #50): `/faq`, `/waitlist` and `/waitlist/thanks` wear the rebuilt page's design language, styled by `app/funnel.css` and `app/funnel-chrome.tsx`. The FAQ's eleven questions and the five survey questions live in `drafts/website/WEBSITE.md`; `lib/faq.ts` and `lib/survey.ts` mirror it and `tests/deck.ts` fails when the two disagree. **The site sells the designed product, not the built one** (Jake, 2026-08-18); an answer describing an unbuilt feature carries a `designed` mark in the deck.

**`drafts/website/site/` is the superseded six-beat site** (four self-contained HTML pages, PRs #37/#38/#42) and the deployable fallback. `app/page.tsx` still serves the older persona-card landing; `drafts/site-map.md` describes it and is superseded. Pending: wire `page/index.html` into `app/`, porting the UTM→cta attribution chain (the main page passes `?cta=` in the URL and the app reads that name from session storage, so a landing click currently records `waitlist-page`). Production is gated to the funnel by `middleware.ts` (PR #44); `APP_PUBLIC=1` opens the app.

Serve the drafts with `python3 drafts/website/serve.py`; it answers no-store, so one stable URL always shows the current file. To walk all four pages together, run `bash scripts/preview-site.sh`. **The macOS firewall blocks incoming connections to `node` and allows `python3`,** so the `Network:` URL `next dev` prints is unreachable from another machine; `scripts/lan-proxy.py` forwards to it from the allowed binary.

## Doc map

- `ux.md` (root) — **canonical condensed UX** (2026-08-06, nutrition-only scope banner). Build screens from this.
- `evals/charter.md` — canonical testing charter; `evals/report.md` — live suite status (all four layers green).
- `drafts/website/WEBSITE.md` — **live copy deck**: hero, five pains, close, positioning, audience, voice rules.
- `drafts/website/HANDOFF.md` — website statement of record: design language, motion direction, artifact links. Its one open decision (page structure, S1 to S4) is answered by the built page; the rest of the file still holds.
- `drafts/` `PRODUCT.md` / `UX.md` / `UX-v2.md` / `DATAFLOW.md` / `WORKPLAN.md` — **stale rough drafts** (2026-07-27 baseline, pre-rescope). Receipts only; never copy source.
- Shipped specs under `specs/` may reference old root paths; historical citation, don't chase it.

## Stack

Next.js App Router on Vercel Hobby, Turso (libSQL) persistence, Claude API for extraction. Single deploy surface for MVP; no separate backend.

- Test command: `npm test` (vitest).
- Dev: `npm run dev`.

## Project rules

- Compliant rails only: Instacart Developer Platform + Kroger public API. No browser automation in product code, ever.
- `household_id` on every user-data table from day 1.
- Pantry writes are suggest-only from inference; only explicit user action asserts inventory truth.
- Ingredient→product matching decisions get logged (input, candidates, chosen) — they're training data.
- External API work: first live call is a multi-hypothesis curl probe, not code-on-mocks. Decode OAuth scopes before trusting a 403.
- LLM extraction: cached static rubric, tolerant fence-stripping parse, enum validation, deterministic fallback.

## Lessons

- NYT Cooking ships its full recipe in public JSON-LD despite the paywall UI; never assume a paywalled site blocks structured-data extraction without a live fetch check (fixture corrected in `047b702`).
- `lib/db.ts` `migrate()` runs its PRAGMA `hasColumn` check unmemoized on every request; memoize schema-check state per process like the client is memoized.
- Open Food Facts at scale: `/api/v2/search` 503s and returns silently incomplete pages when pulling thousands of products; use the full CSV export (`static.openfoodfacts.org/data/...csv.gz`) and rank by `popularity_key` (not `unique_scans_n`) for US top products.
- Landing/marketing copy: never personify or name the AI coach ("Cade" was added v3.1, reversed v3.2 -- "avoid mentioning the coach at all costs"); frame replanning passively ("the plan adapts as you log").
- Plan-board UI: no per-meal calorie/kcal badges (5/6 persona-panel reviewers read them as "MyFitnessPal with nicer fonts", fighting the "no macro math" promise); day-level totals/bars only.
- Scripted multi-beat marketing-demo verification needs two passes: state-by-state (jump to each beat, check math/DOM) catches stale computed values and hardcoded numbers; a separate real-time playback pass catches transition-only glitches (stale element refs, border fragments mid-animation). The two-pass loop caught 7 distinct bugs across both classes (PR #38).
- Browser-timing verification: a threshold on a rendered value (width >= 99.9%, opacity, a transform) is not the event. An eased CSS transition crosses it before it ends, which is how a 192ms "gap" got reported at a beat boundary that was exact by construction. Listen for `transitionend` or compute from the declared duration, and reconcile a measurement against the arithmetic that derives the same moment before reporting either.
- Claude Design (claude.ai/design) MCP workflow for the marketing site: pull mocks via DesignSync get_file, implement into Next.js by hand (never connect the live repo); pushing local asset folders back requires `finalize_plan` with an explicit `deletes: []` even when only uploading; once a page is real code, iterate live (localhost + screenshots) instead of round-tripping through Design — only go back to Design for a wholesale new visual direction.
