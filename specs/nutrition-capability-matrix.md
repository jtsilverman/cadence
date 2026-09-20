# Nutrition capability matrix

Status: live execution inventory. Update each row only from code plus real verification.

| Capability from `ux.md` | State | Current evidence | Remaining proof or work |
|---|---|---|---|
| Private single-household access | Built, not deployed | Signed httpOnly session in `lib/app-auth.ts`; production gate in `middleware.ts`; login at `/app-login`; dev dashboards blocked | Set production secret, deploy, test unauthenticated page/API denial and authenticated phone use |
| Durable production persistence | Built, not deployed | `lib/db.ts` requires non-file Turso URL and token in production | Provision Turso, deploy, prove state across restart/deploy |
| Nutrition-only navigation | Working | `app/(product)/shell.tsx` exposes Today, Nutrition, Journal, plus Coach dock | Live mobile verification |
| Nutrition-only onboarding | Partial | Goal, activity, meal-template seeding, body basics, units, hard restrictions, adjustable calorie proposal, and current-step state persist across refresh; retries reuse rows and seeded meals remain eatable without invented pantry ingredients | Live mic, Future You simulator, optional Whoop prompt |
| Two Monday-start weeks | Partial | Nutrition-only drafts carry fourteen days of breakfast, lunch, snack, and dinner with times, portions, atomic review/approval, and stale-draft refusal after any newer schedule write | Prep, explicit locking, Sunday remint |
| Manual plan movement and swap | Working | Pointer move and slot swap in `app/(product)/today/page.tsx`; Playwright coverage | Live reverify after planner changes |
| Chat-proposed plan changes | Working with known gaps | Logged proposal and approve/dismiss path in `lib/chat.ts` and `/coach` | Named replacement fidelity, standing restriction, prep-day operation, receipt wording |
| URL and video recipe extraction | Working | Main-product intake at `/nutrition/library/new` uses `/api/recipes/extract` and editable review before save | Live credential and phone proof |
| Photo recipe extraction | Working | Main-product photo upload uses `/api/recipes/extract-photo` and the same editable review/save flow | Live credential and phone proof |
| AI-assisted food invention | Working core | Saved-food palette and persisted hard restrictions ground a model proposal; deterministic restriction checks run after generation; invented macros remain unknown; editable review is required before save | Live credential and phone proof |
| Manual food entry | Working | `FoodForm` at `/nutrition/library/new` covers ingredient, product, snack, and meal; recipes keep the review form; all four go through `parseFoodPlan` and `POST /api/foods` | Live phone proof; portion editing after save |
| Barcode/product entry | Partial | `ProductPlan.upc` with GTIN-8/12/13/14 validation, hand-typed on the product form, deduped per http source | Camera scan input; label lookup without non-compliant browsing |
| Five food kinds | Working | `FOOD_KINDS` contract, `parseFoodPlan` gate, `saveFood`/`listFoods`, `FoodSaved` event, kind-filtered browse on `/nutrition` | Planner and grocery consumption of non-recipe kinds |
| Auto-save and favorites | Working | `ensureLoggedFood` resolves a food log to one durable meal row (no throwaway `manual-<uuid>`); `FoodFavorited` folds last-write-wins; star toggle, favorites-first ordering, honest `times_eaten`, and the second-eat prompt render from the server receipt on `/nutrition` | Planner preference weighting; live phone proof |
| Source provenance and correction | Working for recipes | Source URL, validation, editable extraction review | Extend to every intake type |
| Natural-language logging | Working | Deterministic writes and server receipts in `lib/chat.ts`; chat eval coverage | Reverify on deployed model credentials |
| Manual logging | Working | “Cooked it,” planned-meal skip, and direct unplanned-food logging support quantity, unit, date/backfill, immediate undo, and Journal correction | Live phone proof and nutrition estimates for free-text food |
| Corrections, retractions, backfill | Working | Coach amendments and retractions plus atomic direct manual-food correction, removal, backfill, and visible Journal trail | Live phone proof and duplicate-request hardening |
| Honest precision | Working in backend | Event precision and nutrition confidence retained; unknowns surfaced | Make estimate precision visible consistently in product UI |
| Overeating repair | Partial | Capped `nutrition_adjust` proposals are visible and resolvable on Today | Same-day-first concrete plan diff, then week smoothing |
| Under-eating repair | Partial | Coach can suggest snacks and forgotten logging | General deterministic under-eating trigger and visible proposal |
| Skipped-meal repair | Working | Direct skip writes a receipt; Today shows and atomically applies or dismisses the resulting repair |
| Grocery derivation | Working core | `/api/cart` aggregates planned recipes and subtracts pantry | Buyable-unit/package rounding, plan horizon correctness, shopping-day trigger |
| Grocery checkoff and pantry inflow | Working | Main grocery screen records order and explicit inflow; Playwright coverage | Durable partial-run resume and line edit/removal |
| Store substitutions/preferences | Partial | Structured brand/size/note preferences exist | Pre-baked substitutions per line and main-product editing |
| Pantry explicit truth | Working | Assertions and inflows are event-sourced; product UI supports add, edit, and remove; inference is not truth | Live phone proof and pantry-specific undo |
| Pantry expiry/fullness | Working | Main pantry shows expiry, cooks-left, use-soon warnings, and matching cook links | Live phone proof |
| Cook mode and depletion | Working for full recipes | Cook mode and `RecipeCooked` receipt decrement pantry | Portion-aware cooking/eating and batch-prep containers |
| Meal prep | Missing | No batch/container/prep contract | Add planner, grocery, cook, pantry, and portion semantics |
| Journal history | Working | Direct mood/reflection entry, meal correction trail, sleep context, notes, and weekly review in `/journal` | Broader multi-week trend presentation |
| Weekly review and streaks | Working core | Diary-derived review and honest streaks | Live verification across a real week |
| Coach actions and receipts | Working core | Deterministic executors and server-authored receipts | Close certified hard failures; transactionalize multi-write actions |
| Coach on every surface | Partial | One-tap dock link | Decide whether full inline composer is necessary for personal use; current charter accepts one tap |
| Grounded education | Partial | Coach intent and rubric exist | Persist and display source citations |
| Whoop OAuth and ingest | Product working, live credentials pending | Today exposes connect/status/14-day sync and recovery/HRV/resting-heart-rate context; OAuth, sync, and webhook are typed and tested | Use expenditure in calorie budget; verify with live credentials |
| Phone usability | Partial | Mobile-first CSS and 390px Playwright journeys | Safe-area/PWA metadata, authenticated phone eval, horizontal-overflow sweep |
| Full verification | Pending | 748 unit/journey/UI tests pass, 30 fixture/credential integrations skip on the scrubbed repository, production build is green, and runtime readiness returns HTTP 200 | Restore only sanitized fixtures needed for skipped extraction tests; run site/app/chat evals, deployed demonstration, real-use cycle |
