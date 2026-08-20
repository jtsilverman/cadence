# Spec: suggestion-pair-v2 (one logged proposal pair for every engine)

## Intent

The suggestion pair stops being grocery-only. `SuggestionMadePayload` becomes a discriminated union — `add_to_list | ease_workout | next_target | repair | plan_draft` — each kind carrying typed fields; `SuggestionResolvedPayload` gains `kind`. Every proposal any engine makes (replenisher today; repair engine, nutrition gap, LLM planner later) flows through this one pair, so the accept/dismiss trail accrues as training data for all of them. Two producers that already compute advice start logging on surface in this spec: progression's next targets (`lib/workouts.ts` nextTargets, today response-data only) and recovery's ease advice (`lib/recovery.ts` decorateWithRecovery, today a bare `"ease"` string). Repair and plan_draft get their typed contracts and parse gates now so B and D plug in without touching the seam; their producers land in those specs. Meal exchange/substitution (Jake's coach-perception direction) is carried by `plan_draft` with `scope: "slot"` — a substitution is a one-slot draft — not a separate kind.

## Acceptance criteria

1. Parsing: a `SuggestionMade` payload with `kind: "ease_workout"` and its typed fields passes the parse gate; the same payload with a missing per-kind field (e.g. no `slot_id`) is rejected with a reason. Same for all five kinds. Kind dispatch uses `Object.prototype.hasOwnProperty.call` (no prototype-chain walk on user-supplied kind).
2. Legacy rows: a `SuggestionResolved` payload written before this spec (no `kind` field) reads as `kind: "add_to_list"` (default on read, not a data migration). Existing `add_to_list` Made payloads parse unchanged under the union.
3. Generic logger: `logSuggestions` moves to a kind-generic home (`lib/suggestions.ts`) with per-kind identity keys — `add_to_list` → normalized name (existing behavior byte-for-byte), `ease_workout` → slot_id, `next_target` → exercise. Recompute with identical payload reuses the open suggestion_id and writes no new event; payload drift mints a new event. The logger's read-then-append serializes behind an in-process write chain (the pantry/schedule idiom, `lib/pantry.ts:170`, `lib/schedule.ts:155`) — required because AC4/AC5 move logging onto GET routes, which fire on every page mount (two tabs / StrictMode double-fire would otherwise both read "no open match" and double-write). Two concurrent identical logSuggestions calls produce one Made event; pinned by a test. Existing replenish tests stay green.
4. ease_workout logs on surface: GET /api/schedule for a day where recovery < RED_ZONE and a planned workout slot exists writes (idempotently) a `SuggestionMade { kind: "ease_workout", slot_id, date, recovery_score, reason }` with `precision: "estimated"`, and the response carries the suggestion_id alongside the existing `advice: "ease"`. A dismissed ease_workout for a slot_id is not re-proposed for that slot.
5. next_target logs on surface: GET /api/workouts/[id] whose response includes nextTargets writes (idempotently) one `SuggestionMade { kind: "next_target", exercise, weight, unit, reason }` per exercise, `precision: "estimated"`. A dismissed next_target for an exercise is silenced until a new `SessionLogged` for that exercise changes the computed target.
6. Resolve route v2: POST /api/suggestion takes `{ suggestion_id, outcome }`; the server derives `kind` (and `name` for add_to_list) by joining back to the open SuggestionMade, 422s on a suggestion_id with no open Made event. The written Resolved carries `kind`. /week's chip flow still works end to end (its fetch updated in the same unit).
7. Dismissal windows per kind: add_to_list dismissal semantics unchanged (silenced until next settled PantryInflow); ease_workout dismissal silences that slot_id; next_target dismissal silences that exercise until its target changes. Each pinned by a test.
8. Golden household: eval extends to pin one ease_workout pair and one next_target pair (made + resolved, precision, dedup) alongside the existing add_to_list pin.
9. Docs delta: DATAFLOW.md invariant 3's "advice is response data, never an event" hatch is narrowed — ease and next-target advice now log the pair; `use_soon` and the week proposer are named as the advice that stays response-data until D.

## Non-goals

- No repair or plan_draft producers (B and D). Their payload types and parse gates land here; nothing emits them.
- No new UI surface. ease_workout/next_target resolution is API-complete but gets its accept/dismiss affordance when the schedule grid / Today UI lands (schedule-spine units 2-3). /week's existing chips are the only UI touched (route contract update).
- No accept-side effects for new kinds. Accepting ease_workout does not modify the slot; applying changes stays the user's explicit schedule POST (suggest-only invariant).
- No new `source` value. Deterministic in-app engines keep `source: "web"`; a `"planner"`/`"repair"` source convention is D's call.
- No nutrition kinds (C), no swap_meal kind (folded into plan_draft), no suggestion table or index (payloads stay in the events table).

## Orientation findings (compact map)

- Pair defined at `lib/contracts.ts:78-79` (type consts) and `:178-194` (payloads). `kind` is already a single-member literal — the intended seam. `SuggestionResolvedPayload.name` is denormalized for the dismissal-window reader.
- No zod; validation idiom is hand-rolled parse gates returning `{ok}|{ok:false,reason}` → 422 (`lib/logs.ts:53` parseLog is the switch-on-kind exemplar). The suggestion resolve route validates inline (`app/api/suggestion/route.ts:17-29`); no parseSuggestion exists yet.
- Only producer: `logSuggestions` `lib/replenish.ts:141-183` — name-keyed open-proposal reuse (`openByName`, :146-163), payload drift mints new event. Only consumer of Resolved: dismissal window `replenish.ts:90-98` (dismissed-after-lastInflow, keyed norm(name)).
- Resolve route never validates suggestion_id against an open Made and never reads kind. UI: `/week` chips (`app/week/page.tsx:413-422` optimistic resolve, POST failure swallowed → orphan open Made; server-side join in AC6 bounds this).
- Ready producers: `nextTargets` `lib/workouts.ts:129-176` (reason strings already suggestion-grade, served at `app/api/workouts/[id]/route.ts:22`; workout-engine spec explicitly deferred pairing "later" — this is the cash-in). Recovery ease: `lib/recovery.ts:44-60` sets bare `advice:"ease"` (RED_ZONE=34, recovery.ts:13), wired via `lib/schedule.ts:185` → `app/api/schedule/route.ts:11`; needs slot_id + reason + stable id to become a pair.
- Event mechanics: `lib/events.ts` — newEventId (write-order-sorting ids), byFoldOrder, resolveRevisions (external_id collapse; suggestions don't use it), appendEvent/readEvents. `schema_version` is written everywhere, read nowhere; repo idiom for payload evolution is additive-optional + default-on-read (contracts.ts:108-111 SessionLogged v2 precedent).
- No repair/nutrition/planner code exists (grep confirmed). `use_soon` (`lib/expiry.ts:43-57`) is response-data advice, stays that way (non-goal).
- Golden household pins the pair at `tests/golden-household.test.ts:150-151` + assertion :196-207. `tests/replenish.test.ts:204-233` pins logger reuse/drift. Resolve route untested (routes generally are).
- Constraints inherited: prototype-chain hasOwnProperty gate (`app/api/history/route.ts:19-20` precedent), HOUSEHOLD_ID hardcoded per route (P4), precision convention (derived → estimated, user action → exact), events table has no type index (readEvents by type is a scan — fine at current volume).

## Creativity beat

- Alternative 1: suggestions as a first-class table with status column instead of an event pair. Rejected: the event log is the system's spine; a table forks truth and breaks the fold-everything-from-events invariant.
- Alternative 2: generic `{ kind, data: unknown }` payload, no per-kind types. Rejected: loses the parse gate and typed reads; every consumer re-validates.
- 10x version: a proposal inbox — one UI surface listing all open suggestions across kinds with accept/dismiss + push. That is the Today screen's job (schedule-spine units 2-3 + D); the pair built here is exactly what it will read.
- Simplest form that works: widen the union, generalize the logger's identity key, log the two ready producers on surface, make resolve kind-aware. That is this spec.

## Decomposition (commit-sized, in order)

1. **Contracts + parse gate.** DONE (97ebab8). Union types for the five kinds, `SuggestionResolvedPayload.kind` with default-on-read, `parseSuggestionResolve` in lib, hasOwnProperty kind dispatch.
2. **Generic logger.** DONE (dddf259). `lib/suggestions.ts`: per-kind identity keys, payload-match reuse, suggestionWriteChain serialization, readSuggestionState open/dismissed split (per-kind dismissal predicates live at each producer — simpler seam than the drafted logger-side predicate); replenish's bespoke copy deleted.
3. **ease_workout producer.** DONE (09e29ab). attachEaseSuggestions; schedule GET/POST share one payload builder; dismissed slots silenced.
4. **next_target producer.** DONE (b02659b). attachNextTargetSuggestions; dismissal holds while weight/unit unchanged.
5. **Resolve route v2 + /week update.** DONE (d5b0cb9). Server-side join, kind derivation, 422 unknown/double resolve; week chip sends `{suggestion_id, outcome}`.
6. **Golden household + docs.** DONE (26c2337). Eval pins both new pairs (sabotage-proofed); DATAFLOW invariant 3 hatch narrowed.

Live-verified 2026-07-26 against the real dev server: ease pair logged idempotently on schedule GET, dismissal silences + 422 on double-resolve, next_target pair on workout GET, Resolved rows carry kind (all confirmed by direct DB reads).
