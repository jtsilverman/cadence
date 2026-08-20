# Spec: retraction-ladder (backend-complete workstream 3)

Branch `feat/retraction-ladder` off `feat/program-engine` (PRs #20-22 open; stacked per protocol's open-PR exception — PR base = `feat/program-engine`).

## Intent

Two primitives the autonomy ladder cannot exist without. First, undo: a wrong tap stops being permanent — a typed `LogRetracted` event makes every fold forget a diary entry (the eval-discovered mis-tap gap, specs/user-journey-evals.md:70), giving every log a one-tap take-back and every future auto-action a trivial back-out (UX.md:70). Second, the rung state: per-action-type autonomy levels (review → one_tap → auto → full_auto, UX.md:77) become a typed, user-set, readable state with the accept/dismiss evidence beside it — so auto-apply+undo is REPRESENTABLE. Nothing auto-applies yet; climbing stays the user's explicit choice.

## Acceptance criteria

1. `POST /api/log` and `POST /api/cook` return the minted `event_id` (the handle a client needs to undo; today both mint internally and return nothing — the blocking gap).
2. `POST /api/retract {event_id}` → 200 with the schedule receipt (`days`), and the target's effects vanish from every read: a retracted done-tap reverts the slot to planned (a retracted skip likewise, and its repair menu stops being proposed), histories drop the entry, cadence/program week counts drop, `budget.consumed` drops for a retracted cook, the pantry view is refolded (ingredients restored — full refold, never a compensating +qty), `cooksLeft` restores.
3. Retract gate is an explicit ACCEPT-list, not a blacklist: `RETRACTABLE_TYPES = [SessionLogged, SetLogged, SleptLogged, JournalEntry, SlotSkipped, RecipeCooked]` — one constant in contracts, imported by both the gate and the fold filter (the SLOT_LANES precedent, b802b1d). Unknown `event_id` → 404; any type outside the list (SuggestionMade/Resolved, GoalSet, ProgramSet, AutonomyRungSet, PantryAsserted/Inflow, saves, orders, retractions themselves…) → 422; a device-sourced event (envelope source ≠ "web") → 422 ("can't retract a device record"). Retracting an already-retracted id → 200, idempotent, no second effect.
4. Retraction drops the id BEFORE `resolveRevisions`' identity map. Device chains are unreachable (AC3 blocks device events), so a retraction can never resurrect a superseded revision.
5. `POST /api/autonomy {kind, rung}` with `kind` ∈ SuggestionKind and `rung` ∈ `review | one_tap | auto | full_auto` → 200; latest-wins per kind (typed `AutonomyRungSet` event). Junk kind/rung → 422.
6. `GET /api/autonomy` → per SuggestionKind: `{rung, accepted, dismissed}` — rung defaults to `"one_tap"` (today's de facto behavior: every suggestion is a one-tap accept/dismiss), counts folded from the existing suggestion pair (the ladder's evidence, WORKPLAN.md:48).
7. No fold behavior changes when zero retractions exist: golden-household pins pass byte-identical.
8. Journey evals: new `tests/journeys/journey-undo-trust.test.ts` demand-first (mis-tap done→retract→planned; retract skip kills the repair nag; retract cook restores pantry + budget; double-retract; hostile gates; rung set/get lifecycle). RED first.

## Non-goals

Auto-apply of any proposal (representable ≠ implemented; the first auto-applying producer is a future workstream and must amend DATAFLOW.md:108's suggest-only invariant explicitly when it lands). Un-retracting. Retracting device records or revising device chains. Rung-promotion automation (nudges like "you've accepted 12 of these — climb?" are planner/UX work; counts are exposed, the nudge is not). Money-rung semantics (no money actions exist). Retraction TTL/window limits.

## Orientation findings (compact)

- Ladder docs: UX.md:77 (rungs, per action type, by choice), UX.md:70 (undo + visible trail is why trust climbs), UX.md:46+55 (repair auto-apply rides it, repeated choices promote), WORKPLAN.md:15 (per-action-type rungs), WORKPLAN.md:48 (pair = ladder's evidence), DATAFLOW.md:108 (suggest-only invariant — amended only when a real auto-applier lands).
- Mis-tap gap verbatim: specs/user-journey-evals.md:70 — append-only diary, wrong done-tap permanent, "typed retraction event (fold ignores retracted log ids)".
- Blocking gap: `recordLog` (lib/logs.ts:161,208) and `recordCooked` (lib/pantry.ts:288 signature, :301 mint) mint ids internally, return void; routes return no id. Suggestion pair returns identity (precedent).
- Fold surface: ~9 of 12 folds run through `resolveRevisions` (lib/events.ts:26-37) — filtering there + 6 raw sites (rebuildSchedule lib/schedule.ts:76-96 one-pass, exerciseHistory lib/workouts.ts:90, weeklyUse lib/consumption.ts:19, cooksLeft lib/fullness.ts:16, rebuildPantry lib/pantry.ts:85, proposeWorkoutWeek lastDone lib/goals.ts:182) covers everything. Compute the retracted set from the SAME events array (hot-path single-scan rule; scheduleView reads once at lib/schedule.ts:211).
- Pantry reversal is free: `applyPantryEvent`/`rebuildPantryView` refold the whole log into the view cache (lib/pantry.ts:163-180, 317-321); retraction = refold with the id ignored. Never a compensating inverse op (delete-at-zero + precision degradation make inverses wrong).
- Rung storage: typed event over the unused `profile` table (diary is the spine, WORKPLAN.md:20; PreferenceSet/GoalSet latest-wins idiom exists). `readSuggestionState` (lib/suggestions.ts:272) already partitions accepted/dismissed with `kind` on every payload; counts are a small fold on top.
- Gotchas: golden-household pins everything (empty-retraction path must be byte-identical); journey harness needs the new routes in loadApp; new POSTs front-gate via readJsonObject; no schema change needed (events only).

## Creativity beat

Alternatives: (a) slot-scoped retraction ("undo the log on slot X" — no id plumbing, but can't address set-level or cook or slot-less logs, and ambiguous under multiple logs per slot); (b) soft-delete column on the events table (breaks append-only, invisible to event-sourced replays, contradicts the spine). 10x version: full undo stack with un-retract and time-travel views — nothing demands it. Chosen: id-scoped typed event + central fold filter; ids returned from the two write routes (the suggestion pair already returns identity — same shape). Simplest form that works: one event type, one Set, one filter threaded through the one shared helper + six raw sites, two small routes. Rung state is deliberately just typed state + evidence counts: the ladder becomes real the day something auto-applies, and that day needs exactly this and nothing more.

## Decomposition (commit-sized, in order)

1. **evals-RED**: `tests/journeys/journey-undo-trust.test.ts` — mis-tap→retract→planned, retract-skip kills repair nag, retract-cook restores pantry+budget, idempotent double-retract, hostile gates, rung set/get. Commit RED.
2. **ids-returned**: `recordLog`/`recordCooked` return `{event_id}`; `/api/log` + `/api/cook` include it.
3. **retraction-fold**: `LOG_RETRACTED` contract + `retractedIds`/`dropRetracted` (lib/events.ts) + filter in `resolveRevisions` (before identity map) + the 6 raw fold sites; unit tests: per-fold forget + golden path unchanged with zero retractions.
4. **retract-route**: gate (404 unknown / 422 non-log / 422 device / 422 retract-a-retraction / idempotent repeat) + `POST /api/retract` returning the receipt + pantry view refold when the target is a RecipeCooked.
5. **autonomy-rungs**: `AUTONOMY_RUNG_SET` contract + `autonomyState` fold (rung default one_tap + accepted/dismissed per kind) + `GET/POST /api/autonomy`.

## Progress

- Spec drafted 2026-07-27. Grill skipped: Jake absent (established precedent). Decisions surfaced: id-scoped retraction over slot-scoped; device events unretractable (chain-resurrection hazard closed by the gate, not by chain logic); rung default one_tap; rung storage as typed event not profile table; auto-apply stays out with DATAFLOW.md:108 untouched.
- Spec-reviewer: 2 findings, both fixed in-spec (gate rewritten as the RETRACTABLE_TYPES accept-list shared by gate + fold filter; recordCooked citation corrected).
- Built 2026-07-27, all five units, RED-committed per unit. Suite 494 passed (baseline 475): J13 10 demands green (mis-tap revert, skip-retract kills the nag, cook-retract restores pantry+budget+slot, idempotent repeat, hostile gates, rung lifecycle), 9 pure-fold retraction tests, golden pins byte-identical on the zero-retraction path. Refactor scan: nothing made dead. Live-verify: J13 drives the real route handlers end-to-end incl. the pantry view cache refold observed via GET /api/pantry; no external system in this workstream (no LLM), so no live model probe applies.
