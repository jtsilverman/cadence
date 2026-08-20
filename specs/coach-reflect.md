# Spec: coach-reflect (backend-complete workstream 5)

Branch `feat/coach-reflect` off `feat/planner-composer` (PRs #20-24 open; stacked — PR base = `feat/planner-composer`).

## Intent

The Sunday review becomes real: one surface that shows the week you actually lived — meals hit vs planned, training vs program, sleep, mood — plus "week 4 of 12, on track" and exactly ONE journaling prompt tied to something true ("first week all protein targets — how'd it feel?", UX.md:101). Mood becomes a first-class logged thing (UX.md:19), one tap on a journal entry. Streaks are recomputed from the diary, never hand-maintained (WORKPLAN.md:14). The LLM sits at the LANGUAGE boundary only: the deterministic core picks the prompt's topic from typed facts and writes a working templated prompt; the model may only rephrase it — a failed call ships the template, never silence (WORKPLAN.md:71 "prompt/coach language"). Feel: a coach who pays attention, not an app nagging (UX.md:98).

## Acceptance criteria

1. `POST /api/log {kind:"journal"}` accepts optional `mood` (integer 1-5): persisted on the JournalEntry (schema_version 2 when present — the logs.ts:170 additive-field convention), carried through `journalHistory`, absent stays absent (no invented neutral). Junk mood (0, 6, 2.5, "happy") → 422. Golden-household journal pin unchanged (its entry has no mood).
2. `GET /api/reflect` returns `{review, streaks, position?, prompt}` computed from ONE diary scan:
   - `review`: for the current Monday-week — `meals: {planned, done}`, `workouts: {planned, done}` — `planned` = ALL scheduled slots in the lane that week (done + skipped + still-planned; a skipped meal must not vanish from the ratio — UX.md:101 "meals hit vs planned"), `done` = status done, `sleep_nights` + `prior_sleep_nights` (the regression basis needs both), `journal_count`, and `mood: {avg, prior_avg?}` (this week's mean mood vs last week's; absent entirely when no moods logged).
   - `streaks`: `{training?, cooking?, journaling?}` — consecutive qualifying weeks scanning back from the CURRENT week (the current week qualifies with ≥1 event; an empty current week starts the scan at last week — in-progress weeks never break a streak) containing ≥1 SessionLogged / RecipeCooked / JournalEntry respectively; a signal with zero qualifying weeks is ABSENT, never "0-day streak" (cold-start honesty, DATAFLOW invariant 7).
   - `position`: `programPosition` when a program is active, else absent.
3. Exactly ONE `prompt`: `{text, basis}` where `basis` names the deterministic topic pick, priority-ordered: program milestone > any streak ≥ 3 weeks > sleep regression (`sleep_nights < prior_sleep_nights`) > mood drop (avg down ≥ 1 vs prior) > generic-but-true fallback ("what stood out this week?"). Milestone detection is STATELESS: compare `programPosition(program, events, today)` against `programPosition(program, events, today−7d)` — a phase change or completion between the two is the milestone; `pickPromptBasis(review, streaks, position, priorPosition)`. The template text for each basis is deterministic and complete.
4. LLM at the language boundary: with `ANTHROPIC_API_KEY` (or injected ModelCall), the model rephrases the prompt from the TYPED basis facts only (never the raw diary, never journal text); output validated (non-empty string, ≤ 240 chars, single question) else the template ships. No key → template ships. Same idiom as plan-pick (static cached rubric, injectable, tolerant parse).
5. Retraction-aware end to end: a retracted journal/cook/session drops out of review numbers, streaks, and mood trend.
6. Journey evals: new `tests/journeys/journey-weekly-review.test.ts` (J15) demand-first — live a small week (plan, cook, log, journal with mood, skip), read the review, check the numbers against the story; mood junk 422; prompt present with truthy basis; retraction updates the review. RED first.
7. The prompt is review copy, NOT a suggestion pair: no new SuggestionKind, nothing to accept/apply, no dismissal state (the review is pulled, not pushed — nag-free by construction).

## Non-goals

Meditation content and mind-slot content programming (P7 catalog work). Mood inference from journal text (drags the LLM past the language boundary into judgment; mood is typed input). Social/shared streaks (P8). Push/notification delivery of the review. Multi-prompt lists (UX.md:101 says ONE). A journal_prompt suggestion kind (AC7). Historical review pagination (current week only; history routes already serve the past).

## Orientation findings (compact)

- Docs: PRODUCT.md:31 (prompts tied to real events; deliberately last), UX.md:101 (review contents + ONE prompt + position line), UX.md:98 (coach-not-nag), UX.md:19 (mood is logged, first-class), WORKPLAN.md:14 (streaks recomputed, never hand-maintained), WORKPLAN.md:71-72 (LLM at prompt/coach language; Coach specialist), DATAFLOW.md:40 (JournalEntry → reflection prompts P7), DATAFLOW.md:125 (review reads whole diary, week aggregates — the promised shape).
- Journal today: JournalEntryPayload {text, slot_id?} (contracts.ts:225) — no mood; journalHistory retraction-aware (history.ts:62-75); write gate lib/logs.ts:132; mind lane slots exist (planner drafts 2/week).
- Streak feeds: goalProgress cadence weeks (goals.ts:212), mealHistory/sleepHistory/journalHistory, rebuildSchedule statuses (planned/done/skipped per lane), cookedByDate/weekBudget, programPosition, recoveryByDate. All pure off one events array.
- LLM idiom: repair-score/plan-pick (static cached rubric, injectable ModelCall, firstJsonObject, validation, deterministic fallback; env-key gate app/api/plan/draft/route.ts:101). Language boundary = model PHRASES a deterministically-chosen topic; validation is shape/length not enum; fallback is the complete template.
- Route shape: history route (pure GET reader) + draft route (single scan + optional LLM). No readJsonObject needed on GET. Journeys import non-loadApp routes ad hoc (J13/J14 precedent). Next journey number: J15.
- Gotchas: single-scan rule; retraction idioms (resolveRevisions/dropRetracted — the ws3 reviewer bug was a type-filtered read bypassing both); golden-household pins journalHistory exactly ([{date, text}] — mood must be additive-optional on read); mood needs the parseLog gate; HOUSEHOLD_ID local const per route.

## Creativity beat

Alternatives: (a) prompt as a `journal_prompt` suggestion pair with weekly dismissal (nutrition_adjust idiom) — rejected: a prompt isn't a proposal, there's nothing to apply, and the review is pulled so nag-protection is structural; the pair would add supersession surface for zero behavior. (b) LLM-composed review narrative (whole review as coach prose) — the 10x version and where this eventually goes (Coach specialist, P7+), but it needs voice/tone decisions Jake hasn't made; numbers-plus-one-prompt is the honest skeleton. Chosen: typed review + deterministic basis picker + language-only rephrase. Simplest form that works: three folds (review, streaks, basis), one route, one optional model call with a template fallback.

## Decomposition (commit-sized, in order)

1. **evals-RED**: `tests/journeys/journey-weekly-review.test.ts` (J15) — live a week, read the review, numbers match the story; mood logged + junk 422; one prompt with basis; retraction updates. Commit RED.
2. **mood**: `JournalEntryPayload.mood?` (contracts) + parseLog gate + journalHistory carry + unit tests; golden pin untouched.
3. **reflect-fold**: `lib/reflect.ts` — `weekReview(events, days, todayISO)`, `weekStreaks(events, todayISO)`, `pickPromptBasis(review, streaks, position)` with templates; fixed-date unit tests incl. cold-start absence and priority order.
4. **route**: `GET /api/reflect` — one scan, compose, template prompt.
5. **language-seam**: `lib/reflect-language.ts` rephrase behind key/injection + validation + live probe.

## Progress

- Spec drafted 2026-07-27. Grill skipped: Jake absent (established precedent). Decisions surfaced: mood as typed 1-5 input (not inferred); prompt is review copy not a pair; streak = consecutive weeks with ≥1 signal event; basis priority order fixed in AC3.
- Spec-reviewer: 7 findings, all fixed in-spec (planned = whole lane count incl. skipped; stateless milestone via prior-week position; prior_sleep_nights added; mood rides schema_version 2; quote + line-ref corrections; in-progress week never breaks a streak).
- Built 2026-07-27, all five units, RED-committed per unit. Suite 549 passed (baseline 523): J15 8 demands, 10 fold tests (fixed dates, priority order, cold-start absence), 8 rephrase-seam tests. Live-verified: real Haiku rewrite stayed in contract ("You've cooked four weeks straight. What's different about how you're approaching it now?" — one question, number preserved as a word). Refactor scan: nothing made dead. Golden journal pin untouched.
