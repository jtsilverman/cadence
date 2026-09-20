# Goal: a complete personal nutrition release

## Outcome

Turn the existing headless backend and partial product screens into a complete, private, single-household nutrition app that Jake can use daily from his phone as soon as possible. Every nutrition capability promised by `ux.md` must either work end to end on a real screen or be removed from the active promise. Use the existing product styling and marketing mockup as guidance, but prioritize coherent behavior, trustworthy data, and speed to personal use over design refinement.

## Why

Cadence already has a tested event model, planning engine, coach, pantry, grocery, and nutrition logic. The remaining value is not another backend capability or mockup. It is one connected product that Jake can onboard into, trust, and use across real days.

## Success

1. A clean private deployment takes Jake through nutrition-only onboarding and produces an approved, useful two-week plan from his goals, restrictions, schedule, and real foods.
2. Today, week, Nutrition, groceries, pantry, cook mode, Journal, and Coach form one connected workflow with no placeholder, dead-end, workout-facing, or knowingly misleading surface.
3. Every nutrition intake door in `ux.md` works through the product: URL or video, photo, AI-assisted invention, barcode or product entry, and manual entry. The library preserves the five food kinds and supports favorites.
4. Plans include two Monday-start weeks of meals and snacks, approximate timing, portions, and prep where needed. Jake can move, swap, edit, redraft, approve, and safely remint them.
5. Natural-language and manual logging support meals, quantities, rough estimates, corrections, retractions, backfills, skips, and unplanned food. Durable diary events and visible receipts agree.
6. Safe repair works end to end for overages, under-eating, skipped meals, eating out, and schedule changes. Changes remain proposed until approved and never create punitive calorie targets.
7. Grocery, pantry, and cooking state stay consistent. The list derives from the plan, pantry inference stays suggest-only, explicit purchases and assertions persist, and cooking or eating depletes inventory correctly.
8. Journal, weekly review, own-data questions, grounded education, scope honesty, safety behavior, and optional Whoop context work through the real product.
9. Refreshes, restarts, retries, duplicate taps, stale tabs, slow requests, and phone-sized use do not corrupt or silently lose state. Undo and correction paths remain visible.
10. Production data is private to Jake. Unauthenticated public requests cannot read or mutate his household.
11. `npm test` and `npm run build` pass. The product and chat evals meet their charter thresholds. The final demonstration in `specs/nutrition-app-vision.md` succeeds against the deployed app with persisted data.

## Failure

1. The result is a collection of individually working routes rather than one usable daily loop.
2. A UI says a feature exists while the end-to-end action is stubbed, simulated, or disconnected from durable state.
3. The implementation narrows `ux.md` silently to fit what already exists.
4. Model prose becomes the source of record for totals, actions, or receipts.
5. A plan, pantry, or diary write occurs without Jake's required approval or cannot be undone.
6. Tests pass while a core phone journey fails in live use.
7. Public access, a shared hard-coded household, or an unprotected API exposes personal nutrition data.
8. Visual polish, marketing work, workouts, social features, commerce, or platform architecture delays the first trustworthy personal release.

## Boundaries

- Build only the nutrition scope marked "Now" in `ux.md`, plus private access, persistence, and deployment required for Jake to use it.
- Keep workouts and feed unavailable and honest. Do not build workout-facing behavior even where old backend routes exist.
- Do not build public signup, multi-household collaboration, billing, social features, or live grocery ordering.
- Do not redesign the product. Extend the existing system with the minimum coherent UI needed to expose real capabilities.
- Preserve event sourcing, `household_id`, explicit pantry truth, proposed-before-applied plan changes, receipt-backed actions, and compliant external rails.
- Do not weaken safety, precision, or evaluation thresholds to finish faster.

## Vision alignment

- Advances the complete daily nutrition loop in `specs/nutrition-app-vision.md`.
- Implements the nutrition-only contract in `ux.md`.
- Converts the backend-complete work into a private product Jake can actually use.

## Open questions

- None. Routine implementation and sequencing decisions belong to the execution loop. Missing credentials or an external account requirement can block deployment but cannot reduce the product contract.
