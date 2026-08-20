# Spec: nutrition (backend-complete workstream 1)

Branch `feat/nutrition` off `origin/feat/repair-engine` (PR #20 still open; stacked per protocol's open-PR exception — PR base = `feat/repair-engine`).

## Intent

Every recipe gets estimated calories/macros at extraction time (same Haiku call, precision "estimated"). The diary produces a daily + weekly energy budget view (calorie smoothing per UX.md:59: weekly budget, not rigid days). Users can set a nutrition goal (`GoalSet kind:"nutrition"`). Skipped meals and diet overshoots produce repair proposals through the existing suggestion pair (Jake reversed UX.md:57's "meals don't repair"). The product stays suggest-only: proposals never mutate the plan.

## Acceptance criteria

1. Extracting a recipe returns a plan with `nutrition: {calories, protein_g, carbs_g, fat_g, per_serving: true, servings, confidence}` (all numbers, estimated). A model response missing/garbling nutrition still yields `ok:true` with `nutrition` absent — nutrition failure never kills an otherwise-good extraction.
2. `POST /api/recipes` with a client-supplied `nutrition` block persists it (whitelist extended); invalid nutrition shapes are dropped, not 422'd. Deliberate deviation from the `source_embed` 422 precedent (`extract.ts:478`): the same gate parses raw model output, where a garbled nutrition block must not kill an otherwise-good extraction (AC1), and the gate cannot distinguish caller from model.
3. `POST /api/cook` snapshots the recipe's `nutrition` into the `RecipeCooked` payload; later library re-saves do NOT rewrite cooked history.
4. `POST /api/goals` accepts `kind:"nutrition"` with `daily_calories` (required) and optional `protein_g`; other kinds unchanged. `goalProgress` reports weekly intake vs smoothed budget.
5. `GET /api/schedule` days carry `budget?: {consumed, target, week_consumed, week_target, unknown_meals}` when a nutrition goal is active: `consumed` = sum of that day's cooked-meal nutrition snapshots, `week_target` = 7×daily, `unknown_meals` counts cooked meals lacking nutrition (never silently zero). No nutrition goal → no `budget` field. `goalProgress` for the nutrition kind reads the SAME fold (`lib/nutrition.ts`) — one source of truth for weekly consumed/target, two surfaces.
6. A skipped meal slot (lane "meal") yields a `repair` suggestion via the pair (options meal-appropriate: `shift`, `drop`; no volume redistribute), same silencing rules as workout repair (dismissed = per slot:option, accepted = retires slot menu).
7. A week overshoot (week_consumed > week_target by >10%) yields a NEW suggestion kind `nutrition_adjust` via the pair: payload `{week_start, overage_calories, per_day_cap, days_remaining, reason}`, proposing capped per-day corrections spread over remaining days (UX.md:59: capped, spread, never compensatory swings), suggest-only. New kind because `RepairSuggestion` requires `missed_slot_id` + schedule `days` — an overshoot has neither; `GATES`/`identityKey` exhaustiveness makes the addition compile-checked. Identity: `nutrition_adjust:${week_start}`.
8. Journey evals: new `tests/journeys/nutrition-week` file written demand-first (happy/sloppy/hostile tiers) before implementation; all green at end. Golden-household pins updated deliberately (new decorations break `toEqual` by design).

## Non-goals

USDA-FDC join (deferred, P3 catalog). Energy-aware week_target (UX.md:63): NO expenditure figure exists in the diary — `RecoveryLoggedPayload` carries readiness score/hrv/rhr only, and `mapWorkout` drops Whoop `strain`; ingesting strain/expenditure is a follow-up, not this workstream. Backfill of existing library rows (missing nutrition = counted in `unknown_meals`, no re-extract sweep). Snack lane (existing lanes suffice). Per-ingredient nutrition breakdown. Eaten-out/manual meal logging (separate event type, future). Auto-apply of any proposal. UI. `profile` table stays untouched (goal route chosen instead).

## Orientation findings (compact)

- Envelope + types: `lib/contracts.ts` (`EventEnvelope:6`, `RecipePlan:299` — no nutrition field, `RecipeCookedPayload:55` snapshots ingredients, `GoalSetPayload:138`, `SuggestionKind:185`, `RepairSuggestion:228`, `SLOT_LANES:94`).
- Extraction idiom: static `RUBRIC` (`extract.ts:36`), `callExtractionModel:77` (haiku, cache_control ephemeral, injectable `ModelCall` seam `:75`), `parseExtraction:421` builds a whitelist literal `:486-498` — **unknown fields silently dropped with a 200**; nutrition must join RUBRIC + whitelist. `plan_version` ternary `sourceEmbed ? 2 : 1` stays (nutrition is additive-optional, no version bump).
- Suggestion pair: `GATES` exhaustive record `suggestions.ts:86`, `identityKey` exhaustive switch `:173`, writes serialize via `suggestionWriteChain:250`. Producers: `attachRepairSuggestions` `lib/repair.ts:176` (lane-filters to workout — the exact line this extends), pure `computeRepairMenu:68`, silencing `:186-195`.
- Views: `scheduleView` `lib/schedule.ts:194` is the ONE payload builder (single `readEvents` scan, decorations threaded); budget attach goes here, no second scan. `DayState:37` takes additive optional fields.
- Goals: `kind` gated in TWO places (contracts union + `KINDS` `goals.ts:16`); `parseGoal:21`, `goalProgress:165` branch per kind with no default — nutrition needs all four edit points.
- Gotchas: library rows upsert in place (PR #20 `savePlan`) → macros MUST snapshot into `RecipeCooked`; `migrate()` memoized, new columns via `COLUMNS` pattern; all day math via `localDate`/`mondayOf` (Sunday → prior Monday); POST routes front-gate via `lib/http.ts readJsonObject`; `HOUSEHOLD_ID="hh-jake"` hardcoded (P4); zero existing nutrition code (grep confirmed greenfield).
- Evals: 62 across 10 files on `origin/feat/repair-engine` only; harness `tests/journeys/harness.ts` (`:memory:` before imports, real route handlers, real clock).

## Creativity beat

Alternatives: (a) separate on-demand nutrition-estimation Haiku call per recipe (enables backfill, but doubles calls and adds a second rubric); (b) USDA-FDC ingredient join (deterministic, but the deferred P3 catalog). 10x-vs-asked: full nutrition ledger — per-ingredient FDC join, portion logging, eaten-out capture. Chosen: inline in the existing extraction call — one call, cache-friendly, macros land exactly where the recipe is born; backfill deferred without blocking (unknown_meals makes the gap visible instead of silent). Simplest form that works: optional nutrition block + one fold + one goal kind + meal-lane repair reusing the existing pair. No new event types, no new tables; one new suggestion kind (`nutrition_adjust`) forced by the `RepairSuggestion` contract's slot-shape (see AC7).

## Decomposition (commit-sized, in order)

1. **evals-RED**: `tests/journeys/nutrition-week` — demand-first journey (extract→save→goal→cook→budget→skip→overshoot→repair accept/dismiss, three tiers). Commit RED.
2. **contracts+extraction**: `RecipeNutrition` type, optional on `RecipePlan` + `RecipeCookedPayload`; RUBRIC emits nutrition; parse whitelist + tolerant validation (bad nutrition → absent, not fail).
3. **goal-kind**: `kind:"nutrition"` through contracts union, `KINDS`, `parseGoal`; `goalProgress` nutrition branch stubs until unit 5's fold exists, then delegates to it.
4. **cook-snapshot**: `recordCooked` snapshots nutrition into the event payload.
5. **budget-view**: `lib/nutrition.ts` pure fold (daily tally, weekly smoothing, unknown_meals) — single source of truth read by BOTH `scheduleView` `budget` decoration and `goalProgress`; golden-household pins updated.
6. **meal-repair**: extend repair producer to meal lane (skip options shift/drop) + `nutrition_adjust` kind (contracts union, GATES, identityKey, overshoot producer with capped spread); silencing parity; wire into `scheduleView`.

## Progress

- Spec drafted 2026-07-27. Grill skipped: Jake absent (established precedent). UX.md:57 meal-repair reversal is Jake's recorded direction (backend-complete.md:11), not a session assertion. Decisions surfaced in-spec: stacked base, inline estimation over separate call, snapshot-on-cook, no version bump, overshoot threshold 10%, new `nutrition_adjust` kind, energy-aware target deferred (no expenditure data ingested).
- Spec-reviewer: 5 findings; 3 fixed in-spec (overshoot kind, energy-aware cut to non-goal, shared fold), 1 false (UX.md:57 reversal is tracker-recorded), 1 reconciled (nutrition drop-vs-422 deviation now stated with reason).
- Built 2026-07-27, all six units, RED-committed per unit. Suite 424 passed (baseline 386): J11 12 evals green, fold unit tests incl. seeded property sweep, meal-repair pins replace the old "meals don't repair" pin. Golden-household pins unchanged (its diary has no nutrition goal and no skipped meal — the deliberate-update clause turned out unneeded). Live-verified: real Haiku call returned {calories:385, protein_g:28, carbs_g:28, fat_g:18, per_serving:true, confidence:"low"} for the chili fixture; full 10-test live extraction eval green with the new rubric. Deviation from AC1's listed shape: no `servings` inside nutrition (already on the plan; one fact one place).
