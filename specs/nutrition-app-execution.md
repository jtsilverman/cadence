# Execution: complete personal nutrition release

This file is mutable execution guidance. The frozen product contract is `specs/nutrition-app-goal.md`. The durable direction is `specs/nutrition-app-vision.md`. Re-read both before each slice, after material discoveries, and before final verification.

## Verified baseline

- `npm test`: 677 passed, 15 skipped.
- `npm run build`: passed.
- The backend, coach engine, event model, and existing product evals are substantial and green.
- The current product is still incomplete against `ux.md`. Known gaps include the Future You simulator, full intake doors in the main product, complete two-week drafting and reminting, prep scheduling, list-line removal, some plan-change semantics, private production access, and a deployed persistent environment.

## Operating loop

Repeat until every goal condition has evidence:

1. Read the vision, goal, `ux.md`, `evals/charter.md`, and the latest relevant section of `evals/report.md`.
2. Audit one user-visible workflow from screen to API to durable event or table to rebuilt view.
3. Write or tighten a user-chair test before changing behavior when a deterministic test can express the gap.
4. Build the smallest coherent vertical slice. Do not create disconnected backend or UI pieces.
5. Exercise the slice through the real screen at 390px and inspect its durable receipt.
6. Run the narrow tests, then `npm test` and `npm run build` after a completed slice.
7. Update the capability matrix and `evals/report.md` with observed evidence, failures, and triage.
8. Remove placeholders, dead routes, stale workout-facing navigation, and promises made obsolete by the slice.
9. Continue without asking about routine technical choices. Stop only for danger, a required goal change, missing external credentials, or success that cannot be proven.

## Work order

### 1. Truth audit and private foundation

Create a capability matrix from every nutrition promise in `ux.md`: working end to end, partial, missing, or deliberately later. Trace each working claim through UI, API, durable state, and live proof. Establish private single-user access, remove the shared-public-household risk, configure durable Turso storage, and make the app reachable from Jake's phone without exposing its APIs publicly.

### 2. Nutrition-only onboarding

Remove workout questions and goals. Collect goal, body basics, hard restrictions, activity level, units, normal foods, and optional wearable intent. Build the adjustable calorie proposal and nutrition Future You simulator with healthy clamps and ranges. End with a useful two-week proposal and explicit approval. Resume safely after refresh.

### 3. Food intake and library

Expose URL or video extraction, photo extraction, AI-assisted invention, barcode or product entry, and manual entry in the main product. Preserve ingredient, product, snack, recipe, and meal identities. Support portions, favorites, hard restrictions, steering preferences, source provenance, estimated nutrition, and graceful extraction correction.

### 4. Two-week planner

Surface the real planner rather than a deterministic seven-day rotation. Produce two Monday-start weeks with every meal and snack, rough timing, portions, cook feasibility, planned eating out, and first-class prep batches. Support manual moves, swaps, edits, prompt-driven changes, approval, locking, Sunday reminting, and honest stale-plan handling.

### 5. Daily logging and repair

Unify Today, Coach, and direct controls around durable diary events. Cover precise and rough logs, multi-item meals, quantities, backfills, corrections, retractions, skipped meals, unplanned food, duplicate taps, and offline or failed-request feedback. Surface safe proposed repairs for overages, under-eating, missed meals, and schedule changes. Keep day-level totals only.

### 6. Groceries, pantry, and cooking

Generate buyable quantities from the approved plan and batch prep. Account for explicit pantry state and visible inference suggestions. Support checkoff, unplanned purchases, staples, line edits and removal, substitutions, barcode entry, inflow, cooking, consumption, expiry, and rebuilds. Prove all views converge after each action.

### 7. Journal, coach, and wearable context

Complete history, trends, streaks, weekly review, and useful reflection. Close known coach failures in plan changes, own-data answers, groceries, receipts, and contextual nutrition guidance without weakening safety. Connect Whoop when credentials exist, but keep all core flows usable without it.

### 8. Hardening, deployment, and real-use proof

Test mobile navigation, accessibility, retries, refreshes, stale tabs, time boundaries, restarts, and production errors. Run the full eval suite and inspect the first-party ops view. Deploy privately with persistent storage and required model credentials. Perform the vision demonstration on the deployed app, then use it across at least one real plan-edit-log-shop-cook cycle before declaring completion.

## Evidence matrix

For each success condition, retain:

- the user journey and viewport;
- the UI state before and after;
- the durable event or table row;
- the rebuilt view after refresh;
- the automated scenario that protects it;
- the live result and any accepted external limitation.

A screenshot alone is not proof. A database row without a visible receipt is not proof. A model response without the deterministic action is not proof.

## Required gates

Run after every coherent slice:

- `npm test`
- `npm run build`

Run before final completion:

- `npm run eval:site`
- `npm run eval:app`
- `npm run eval:chat`
- `npm run eval:all`

Final completion also requires private deployment, durable persistence, and the full live demonstration. If a live suite needs credentials, obtain them rather than substituting mocks. If Jake must authorize an external account or secret, stop with the exact requirement and preserve all completed work.

## Review

Use a fresh-context reviewer after each major workstream that changes architecture, safety, privacy, or multiple user journeys. Before completion, require an independent review against the vision and goal rather than only against the diff.
