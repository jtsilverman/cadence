# Spec: program-engine (backend-complete workstream 2)

Branch `feat/program-engine` off `feat/nutrition` (PRs #20/#21 still open; stacked per protocol's open-PR exception — PR base = `feat/nutrition`).

## Intent

The training week stops being goal-blind. A program (goal → block structure → week skeletons) gives the app a position: week N of M, which phase, ahead/behind/deload. Progression gets per-exercise increments instead of one flat table. The repair menu grows up: consolidate carries real volume math, redistribute exists, high-priority sessions and adjacency shape the pick, and an LLM scorer can rank the menu behind the existing pair — deterministic core, model picks only (WORKPLAN.md:71). Suggest-only throughout: the program proposes, the user's POST applies.

## Acceptance criteria

1. `POST /api/program` accepts `{title, per_week, start_monday, weeks: [{kind: "build"|"volume"|"peak"|"deload", note?}...], goal_id?, cleared?}` (1-52 weeks, per_week 1-7, start_monday a Monday) → 200. ONE program per household (singleton fold, latest event wins — no program_id axis; unlike goals nothing needs two concurrent programs); `cleared: true` removes. Bad shapes 422 with a reason.
2. `GET /api/program` returns the active program plus `position`: `{week_index, total_weeks, phase, status}`. `week_index = floor((mondayOf(today) − start_monday)/7) + 1` (so week_index is 1 on start_monday itself), clamped to [0, total_weeks]. Status precedence: today's Monday before start_monday → `week_index 0, status "not_started", phase null`; week_index would exceed total_weeks → `week_index total_weeks, status "complete", phase null`; else phase = weeks[week_index−1].kind and `status` = `"deload"` when phase is deload, else `"behind"` when last completed week's logged sessions < per_week, `"ahead"` when >, else `"on_track"` (first week: no completed week → on_track). Weeks beyond the current one appear ONLY as the skeleton (kind + note) — never set/meal detail (UX.md:43).
3. `GET /api/schedule/propose` becomes program-aware: during a deload-phase week the proposal composes `ceil(per_week/2)` sessions and its reason names the deload; other phases keep the cadence count. No program → today's behavior unchanged.
4. `WorkoutExercise` gains optional `increment` (positive number, requires `unit` on the exercise): `nextTargets` uses it over the flat `INCREMENTS` table; `parseWorkoutPlan` gates it (422 on junk).
5. `ScheduleSlot` gains optional `priority: "high"` (absent = normal): gated in `parseScheduleDays` and `checkProposedDays`, snapshotted through repair days untouched.
6. Repair adjacency + priority: `double_up` is never offered onto a host day whose NEXT day holds a planned high-priority workout (UX.md:55 "never stack a makeup hard day before a planned hard day"); when the MISSED slot is high-priority, recovery is genuinely green (`score ≥ GREEN_ZONE = 67`, the documented Whoop band at lib/recovery.ts:21 — new named constant; the OFFER keeps today's `!red` binary), and an adjacency-safe busy day exists, `double_up` becomes the recommended pick (cashes lib/repair.ts:189's P5 seam). Otherwise today's pick rule stands.
7. Consolidate volume math: when both host and missed slots resolve to workout templates (`library_id` → plan), the consolidate proposal carries `volume: {host: [{name, sets}...], added: [{name, sets}...]}` — missed exercises at `ceil(sets/2)` (min 1), host unchanged — and its reason states the merged set count. No templates → today's title-merge with the honest reason.
8. Redistribute exists: when ≥2 OTHER planned workout days remain in the week and the missed slot resolves to a template, a `redistribute` proposal spreads the missed exercises round-robin across those days as `volume.assignments: [{date, slot_id, exercises: [{name, sets}]}]`; the `days` snapshot itself is unchanged (nothing moves — it is volume guidance). Fewer than 2 hosts → no redistribute.
9. LLM scoring behind the pair: `payloadMatches` ignores `recommended` (rank is presentation, not proposal substance — a re-rank must not re-mint pairs and drop dismissals); a `scoreRepairMenu` seam (injectable `ModelCall`, extract.ts idiom, cached static rubric) re-picks `recommended` per missed slot from typed context (options, recovery, priorities, program position). Model output is enum-validated against the menu's own options; invalid/missing/errored → deterministic pick stands. Fires only when a slot's menu contains a not-yet-logged option (never a steady-state GET cost); without `ANTHROPIC_API_KEY` the deterministic pick stands.
10. Journey evals: new `tests/journeys/journey-program-week.test.ts` written demand-first (happy/sloppy/hostile) covering 1-3 + increments + priority repair + redistribute; golden-household consolidate pins updated deliberately (payload gains `volume`).

## Non-goals

Auto-apply and per-action autonomy rungs (workstream 3). Block repositioning as a user surface ("push the block?" one-tap — needs retraction ladder). The LLM planner-composer (workstream 4) — this engine only feeds it. Non-strength program templates (marathon plans etc.: the skeleton kinds cover them; no sport-specific logic). Rest-timer/live-session features. Changing `ease_workout`/`next_target` behavior. Program-driven meal changes.

## Orientation findings (compact)

- Docs: WORKPLAN.md:13,67 (E lane; P5 = LLM scoring + consolidate volume + redistribute + adjacency/priority + per-exercise increments + block periodization), UX.md:26-28 (ahead/behind/deload from history), UX.md:43 (beyond next week = skeleton ONLY), UX.md:49-55 (menu semantics + scoring contract: day, priority-in-block, adjacency, recovery, block position), UX.md:46 (repair is locked-week only; repositioning is a different surface), DATAFLOW.md:108 (suggest-only).
- Code: `computeRepairMenu` lib/repair.ts:62 pure/deterministic (purity is load-bearing: pair reuse), consolidate = title surgery only (:157-165, "trim volume to taste"), redistribute allowed in contracts/gates but zero producers; pick rule :193 with the double_up-never-picked P5 comment at :189. Silencing: accepted retires slot menu, dismissed per slot:option (:209).
- `payloadMatches` lib/suggestions.ts:222 compares whole payload — recommended drift currently re-mints; identity `repair:${missed_slot_id}:${option}` (one redistribute per miss — fine, we emit one).
- Progression: INCREMENTS flat table lib/workouts.ts:128; nextTargets :189 double-progression v0; parseWorkoutPlan gate :27. Exercise diary carries reps/weight/unit/rpe per set.
- Programs are greenfield: zero block/deload/priority concepts anywhere; GoalSet latest-wins fold (lib/goals.ts:92) is the idiom to copy for ProgramSet.
- proposeWorkoutWeek lib/goals.ts:136 (cadence-only, next Monday, DAY_OFFSETS, never writes). goalProgress branches per kind.
- LLM idiom: lib/extract.ts:80 cached-rubric + injectable ModelCall; tolerant parse; hot-path hazard — scheduleView is one diary scan, scoring must not run on steady-state GETs.
- Golden-household pins: repair menu exact shape (tests/golden-household.test.ts:373-403) and proposer days (:279) — consolidate's new `volume` field breaks pins by design; proposer pins hold (golden household has no program).
- Journeys today: J6 progression (next_target lifecycle), J9 goals-week (propose honors cadence, writes nothing), J2 skip→menu lifecycle.

## Creativity beat

Alternatives: (a) programs as a new `GoalSet` kind (fewer types, but a program is structure not target — braids two roles into one payload and the latest-wins fold would let a program revision clobber goal identity); (b) full periodization engine (volume landmarks, tonnage tracking, auto-regulation from RPE) — the 10x version, and premature: no user data yet to calibrate, and the planner (ws4) is the real consumer. Chosen: `ProgramSet` typed event + pure position fold + surgical repair upgrades, LLM only ranking a deterministic menu. Simplest form that works: skeleton array + week arithmetic + three status rules; volume math is ceil-half set counts, not tonnage; adjacency is one next-day check. Everything traces to a named UX.md line.

## Decomposition (commit-sized, in order)

1. **evals-RED**: `tests/journeys/journey-program-week.test.ts` demand-first (program set→position→deload propose→increment→priority/adjacency repair→redistribute→hostile gates). Commit RED.
2. **program-contract**: `PROGRAM_SET` event + `ProgramSetPayload` + `parseProgram` gate + `activeProgram`/`programPosition` folds (lib/program.ts) + `GET/POST /api/program` + harness wiring.
3. **program-aware-propose**: `proposeWorkoutWeek` takes position; deload halves sessions with named reason.
4. **increments**: `WorkoutExercise.increment` through contracts, `parseWorkoutPlan`, `nextTargets`.
5. **priority+adjacency**: `ScheduleSlot.priority` through contracts + both parse gates; `computeRepairMenu` adjacency filter + high-priority pick; golden pins hold (no priority in golden diary).
6. **repair-volume**: `RepairSuggestion.volume` additive-optional + gate tolerance; consolidate math (needs plans — `computeRepairMenu` gains a `plansById` input); redistribute producer; golden consolidate pins updated deliberately.
7. **llm-scoring**: `payloadMatches` excludes `recommended`; `lib/repair-score.ts` seam (cached rubric, enum validation, deterministic fallback) wired into `attachRepairSuggestions` on fresh-mint only; unit tests with injected ModelCall + one live probe.

## Progress

- Spec drafted 2026-07-27. Grill skipped: Jake absent (established precedent). Decisions surfaced: ProgramSet event over GoalSet kind; redistribute as volume guidance (days unchanged) not slot surgery; `payloadMatches` recommended-exemption to keep LLM rank from re-minting pairs; scoring fires on fresh mints only (hot-path guard); deload propose = ceil(per_week/2).
- Spec-reviewer: 3 findings, all fixed in-spec (week_index formula + not_started/complete statuses pinned; program made a household singleton with `cleared` in the body; GREEN_ZONE=67 for the double_up pick vs `!red` for the offer).
- Built 2026-07-27, all seven units, RED-committed per unit. Suite 472 passed (baseline 425): J12 9 demands, program fold boundary tests, adjacency/priority/volume repair tests, scorer fallback contract. Decisions beyond spec letter: a high-priority day is excluded as a double_up HOST too (dilution), and AC3's deload check uses the phase of the week being COMPOSED (next Monday's), which is what the eval demanded. Live-verified twice: raw Haiku scoring call, and the full scoreRepairMenu seam returning "drop" under red recovery + deload + high-priority. Live probe caught a real parse bug (model appends prose after the fenced pick; fence-strip alone left it in front of JSON.parse) — RED-pinned, fixed with first-JSON-object extraction. Golden pins held (golden host has no template, no priority).
