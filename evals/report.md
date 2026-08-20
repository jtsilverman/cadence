# evals/report.md — live suite results and triage

The deliverable of the eval loop (charter: evals/charter.md). Every scenario,
every failure, its bucket, its fix commit. Updated every iteration.

## Current status

| Layer | Suite | Status |
|---|---|---|
| 1 — website | `npm run eval:site` (38 scenarios) | **38/38 green** |
| 2 — product live usage | `npm run eval:app` (30 scenarios) | **30/30 green** |
| 3 — chat corpus | `npm run eval:chat` (198 cases, 19 categories) | **Certified at N=3: safety 100%, food logging 96%, 153/198 all-green, 87% mean pass** (final table below) |
| 4 — observability | analytics + errors + funnels + /dev/ops | **built and live-verified** |

## Harness

Three seeded fixture households (`evals/fixtures/`): **fresh** (empty),
**week3** (3 weeks of history, locked week + living draft, pantry, Whoop,
favorites), **messy** (skips, unlogged days, two overshoots, half-checked
list, expired pantry, a retraction correction). One dev server on :3100
against a throwaway DB; each story resets state via the `EVAL_MODE`-gated
`POST /api/dev/reset`. DB rows are asserted directly from the test process.

## Layer 1 — website (blind-authored from site-map.md + charter)

38 scenarios: render coverage (4 pages × 390/768/1440: console errors,
horizontal scroll, image resolution), scroll reveals + reduced-motion, full
click coverage (nav/hero/closing/footer CTAs, FAQ accordion one-at-a-time,
back button, deep loads, dead-link sweep), waitlist submissions at all three
demand tiers with DB-row assertions, FAQ question box, no-JS submit.

### Failures found and triage

| # | Finding | Bucket | Resolution |
|---|---|---|---|
| L1-1 | **UTM attribution never recorded.** `attribution()` (the client half of the validation instrument) had no caller on any page since the v4 rebuild deleted the hero A/B component — the standard journey (land with UTMs → CTA → signup) wrote a row with empty `utm_*`. The site's entire "where they came from" signal was dead. | **FIX (class)** | `CaptureAttribution` mounted in the shared `SiteNav`, so every marketing page stores arriving attribution once. Commit `Layer 1 site evals green`. |
| L1-2 | **Pre-hydration / no-JS submit silently lost the signup.** `<form onSubmit>` with no action: submitting before React hydrates (slow connection, fast fingers) did a native GET back to /waitlist — email gone, no message, conversion lost on a site whose only job is capturing emails. | **FIX (class)** | Progressive enhancement: `method="post" action="/api/waitlist"` + a form-encoded branch on the route that banks the row and 303s to thanks (receipt rule: thanks only after the durable write). Deterministic RED: `evals/site/nojs.eval.ts`. |
| L1-3 | **500-char email accepted as a lead** once the form-encoded path existed (previously masked by the lossy native GET). | **FIX (class)** | RFC 254-char cap in `normalizeEmail` — the one gate both JSON and form paths share. RED-first in `journey-waitlist-funnel.test.ts`. |
| L1-4 | No `<main>` landmark on any of the four site pages (screen-reader navigation gap). | **FIX (class)** | `<main>` added across all four pages in one pass. |
| L1-5 | Attribution degrades (not lost) when a submit races hydration: the native fallback banks the email with `cta=waitlist-page-nojs` and no UTM. | **FLAG (accepted degradation)** | Losing attribution beats losing the conversion; carrying UTM through the native path would need cookie/middleware plumbing the validation site doesn't warrant. |
| L1-6 | A visitor who never joined the waitlist cannot leave a reply address with an FAQ question (email attaches only via the remembered join). | **FLAG (feature gap, minor)** | Site-map design is "email optional, question is the signal". Roadmap call for Jake; not built. |

### Eval-side realignments (scenario was wrong, product was right)

- FAQ accordion opens with the first question expanded by default — still
  one-at-a-time; scenario now asserts ≤1 open, second click closes first.
- Survey controls are accessible visually-hidden inputs under styled labels
  (focus ring present); the harness now clicks labels like a user.
- "Question with email" journey is join-then-ask by design.

### Flakes (tracked separately from failures)

- `scroll reveals fire` failed once on first-ever run (dev-server first
  compile latency), passed on every run since; check hardened to center the
  element and allow the view()-timeline to settle.
- `nav: How it works` failed once mid-loop, passed solo and on the following
  full runs. Watching.

## Layer 4 — observability (built before Layer 2, per the charter)

First-party only, no third-party trackers. `analytics_events` + `error_events`
tables; client telemetry module (breadcrumb ring, error/unhandledrejection
listeners) mounted on both surfaces; screen views + onboarding funnel steps
client-side; every ACTION tracked server-side in the route that commits it
(log, cook, plan apply, suggestion resolve, inflow, waitlist, question, chat
turn) so telemetry can't drift from truth; `onRequestError` instrumentation
captures server 500s with route context. `/dev/ops` (404s in production unless
`OPS_DASH=1`): today's traffic, the three funnels (landing→CTA→submit by
utm_source; onboarding steps; chat message→intent→action), chat-turn failure
feed, error drill-in with breadcrumbs/stack. Unit-tested (7 tests: kind
taxonomy, PII stripping, caps) and live-verified.

## Major build: the coach chat engine (charter-mandated)

**Discovery:** the coach surface was a stub — every message became a
JournalEntry; no intent handling, no sentence logging, no plan changes, no
LLM anywhere. Layer 3 tests a surface that did not exist; the backend-complete
push never included a chat workstream (coach-reflect was journaling prompts
only). Since the charter is canonical and defines the coach's behavior in
detail, the engine was built as part of this loop — deliberately, not
silently, and flagged here as the loop's biggest scope event.

Shape (lib/chat.ts + POST /api/chat): ONE model call (claude-haiku-4-5,
cached rubric + a live context block whose numbers are all computed
server-side from the diary) returns a typed verdict; every write then flows
through deterministic per-intent executors and the existing folds; receipts
are composed by the server from the events actually written, so a reply can
never claim an action that didn't happen. Safety is double-locked: rubric +
a deterministic 1,200-kcal clamp on the goal-write path that overrides even
a compliant model draft. Supports: combined sentence logs with sittings,
backfill to -6 days, targeted amendments (retract + replace on the same
day), retraction, skip, plan changes as proposed-never-imposed plan_draft
pairs resolved against the real snapshot (swap/vegetarian/eating-out/travel),
conversational approve/decline, list adds as the accepted pair, clamped goal
sets, data questions answered from injected server math. 18 unit tests on
the deterministic spine; chat_turn telemetry per turn.

## Layer 2 — product live usage (blind-authored, then triaged)

30 scenarios across onboarding, log/cook/undo, plan board (drag + manual
swap), groceries+pantry, journal/review, sloppy tier (two tabs, slow
network, back button, rotate), a11y gate, coach-through-UI. First blind run:
11/30. Product gaps the charter journeys demanded — all built:

| # | Finding | Bucket | Resolution |
|---|---|---|---|
| L2-1 | Today's day view had no logging affordance at all (Cooked it lived only on Nutrition) and no undo anywhere despite /api/retract existing | **FIX (product)** | Receipt-gated Cooked it + session-scoped Undo on Today; undo writes LogRetracted and the fold reverts the slot |
| L2-2 | Only workout chips were draggable on the week board — meals (the nutrition scope's whole point) were not | **FIX (product)** | Meal chips join the pointer-drag machinery |
| L2-3 | No manual meal swap anywhere (ux.md: manual controls are the fallback everywhere) | **FIX (product)** | Swap picker on Today's day view; posts the full snapshot, changes exactly one slot |
| L2-4 | Journal was a placeholder page | **FIX (product)** | Real Journal: meal history (fold-resolved, corrections show final state), weekly review + honest streaks from /api/reflect, notes |
| L2-5 | Onboarding ended at goals — no seeding question, no drafted week, no approval (ux.md contract: ends at the plan-proposal flow) | **FIX (product)** | Dictation-first seeding step (lib/onboard.ts: model call → library recipes with estimated macros; comma-split fallback invents nothing) + week-1 draft + Approve → SchedulePlanned |
| L2-6 | Tap targets under 44px (seg buttons, cook buttons at 36px) | **FIX (product CSS)** | 44px |
| L2-7 | Future You simulator not built (ux.md designed) | **FLAG (feature gap)** | Onboarding notes it in a comment; roadmap for Jake |
| L2-8 | Coach dock is a one-tap link to /coach, not an inline input on every screen | **FLAG (accepted)** | Dock reaches the conversation in one tap; scenario realigned |

Eval realignments after diagnosis: pointer-drag mechanics (not HTML5
draggable), scroll-into-view before drag, checkoff button text, covered-by-
pantry design (default-skip with visibility honors "you probably have this"
more strongly than a skip button), pantry form order, seg control exposes
role=tab, Next.js dev-tools button collides with name "Next".

## Layer 3 — chat corpus (blind-authored, two-channel graded)

198 cases across 19 categories (cat 19 "contextual diet advice" added at Jake's
direction 2026-08-06: personalized how-should-I-eat asks, graded on grounding
in the user's own data + honest bounded framing). Grading: deterministic DB
assertions + Sonnet judge with the engine's real CONTEXT block as ground truth.

### Failure classes found and fixed (all FIX (class), RED-first where deterministic)

| # | Class | Resolution |
|---|---|---|
| L3-1 | **Model-derived running totals.** Replies stated day/week totals the model computed itself — stale (pre-action context), double-counted, or invented; the fabricated-breakfast receipt case (cat 18) was the worst form. | Server-computed `day_total` receipt after every log/amend/retract; rubric made absolute: no self-derived totals in reply prose, ever. |
| L3-2 | **Judge blindness.** The judge saw only today's kcal + goal, so honest answers citing week protein / history / pantry were flagged as fabricated (cat 9 at 17% was mostly this). | `EVAL_MODE` echoes the model's context block; judge grades against it. Cat 9 17%→67% before further engine fixes. |
| L3-3 | **Conversations that owed a durable proposal wrote nothing.** Goal talk (cat 11: 0%), overshoot/skip repair (cat 7: 8%) answered in prose only. | New `goal_proposal` suggestion kind (proposed → user's yes → clamped GoalSet); overshoot logs auto-propose the capped `nutrition_adjust`; skips propose a makeup-snack `plan_draft`. Never imposed. |
| L3-4 | **Explicit pantry statements under-acted.** "We're out of X" / "milk expired" / "I bought X" only added list lines — no `PantryAsserted`/`PantryInflow` (suggest-only applies to inference, not the user's own assertion). | New `pantry_update` intent → `assertPantry` / `recordInflow`. |
| L3-5 | **Wrong-referent retract/amend.** "Undo"/"delete that" picked the latest-by-mealtime log, so a fixture-seeded evening meal beat the just-logged item; receipts named the wrong food. | Retraction targets a named log (`retract_match`/`retract_day`); candidates capped at `ts <= now` (a 12:40 undo can't mean tonight's dinner). |
| L3-6 | **Model calendar math.** Weekday labels and named-weekday backfills computed by the model, wrong. | Server-computed weekday labels on every dated line + an explicit backfill map (weekday → day_offset) in the context block. |
| L3-7 | **Judge prose-first output.** Occasional "Let me verify…" preambles failed the parse and the case spuriously. | Assistant-prefill `{"pass":` forces JSON-first. |

### Known-open (next iterations)

- Cat 6 plan-change picker: replacement choice ignores the user's named target
  ("tacos", a saved recipe), vegetarian sweeps pick one meal repeatedly, and
  reply text names a different meal than the deterministic pick — reply/receipt
  mismatch. Ops still missing: swap-between-days, standing restriction, move-prep.
- Cat 2/5/14 over-asking: model asks instead of logging a flagged wide estimate.
- List-line removal has no product surface (rubric now says so honestly); FLAG
  (feature gap) candidate for the roadmap.

## Layer 3 — FINAL N=3 certification (2026-08-06/07, chunked per category)

Both release criteria met: **safety (cat 13) 100%**, **plain food logging (cat 1) 96% ≥ 90%**.
Flaky = passed some-but-not-all of 3 runs (model sampling); Fail = 0/3.

| Cat | Name | Cases | Green | Flaky | Fail | Mean pass |
|----:|------|------:|------:|------:|-----:|----------:|
| 1 | Plain food logging | 15 | 13 | 2 | 0 | **96%** (≥90% required) |
| 2 | Vague / quantityless | 12 | 10 | 2 | 0 | 94% |
| 3 | Multi-item + corrections | 12 | 9 | 3 | 0 | 89% |
| 4 | Time-shifted | 10 | 8 | 2 | 0 | 93% |
| 5 | Restaurant / brand / homemade-unknown | 12 | 9 | 2 | 1 | 83% |
| 6 | Plan changes via chat | 15 | 10 | 3 | 2 | 78% |
| 7 | Repair situations | 12 | 9 | 3 | 0 | 89% |
| 8 | Eating out ahead | 8 | 5 | 3 | 0 | 83% |
| 9 | Own-data questions | 12 | 9 | 1 | 2 | 81% |
| 10 | Groceries + pantry | 12 | 6 | 5 | 1 | 78% |
| 11 | Goal conversations | 8 | 6 | 1 | 1 | 83% |
| 12 | Education pulls | 8 | 6 | 1 | 1 | 79% |
| 13 | Safety / wellbeing | 12 | 12 | 0 | 0 | **100%** (100% required) |
| 14 | Ambiguity | 8 | 7 | 0 | 1 | 88% |
| 15 | Scope honesty | 8 | 7 | 1 | 0 | 92% |
| 16 | Out-of-scope | 6 | 6 | 0 | 0 | 100% |
| 17 | Hostile | 12 | 10 | 1 | 1 | 89% |
| 18 | Receipt rule | 8 | 6 | 1 | 1 | 79% |
| 19 | Contextual diet advice | 8 | 5 | 2 | 1 | 79% |
| — | **Total** | **198** | **153** | **33** | **12** | **87%** |

### The 12 remaining hard fails, triaged

All are Haiku reply-quality misses on non-thresholded categories — the deterministic
spine (writes, receipts, day attribution, clamps) held in every one; what missed was
prose (a rubric point unaddressed, a wrong prose date, a deflection where guidance was
asked). Each is one of:

- **FIX (deferred, model-quality):** proposal/receipt wording on approve turns
  (cat18-swap-diff), over-deflection on stated-activity nutrition (cat19-around-workouts),
  silent guess on two-salad ambiguity (cat14-the-salad), missed rubric beats in cats
  5/6/9-12/17. The lever is model upgrades or more worked examples — each round of
  rubric examples bought 10-20 points; the spine needs no change.
- **FLAG (feature gap, roadmap):** grocery-list line removal (no product surface;
  coach says so honestly); prep-day scheduling (no plan-model concept); Future You
  simulator (designed, unbuilt); FAQ reply-address without joining the waitlist.

### Certification integrity notes

- Full-corpus runs were repeatedly killed externally mid-run; certification ran
  chunked per category (same grading, same N, one category per run).
- The midnight ET rollover mid-certification exposed a real bug the suite then
  caught: chat context building used `scheduleView`, whose attach idiom WRITES
  adjust suggestions on read — reply-only turns failed "no writes". Fixed to the
  pure fold (`c9e4dc5`); cats 14/16/17 certified post-fix.

## Trend

| Run | Scope | Result |
|---|---|---|
| 1 | eval:site (first blind run) | 31/37 — 6 failures (L1-1/2 latent behind selector misses, realignments) |
| 2 | eval:site | 30/37 — strict-mode selector fallout after `<main>` fix, L1-1 isolated |
| 3 | eval:site | 36/38 — L1-2 fixed (nojs RED green), L1-3 surfaced |
| 4 | eval:site | **38/38 green**; unit suite 594 passed / 15 skipped |
| 5 | eval:app (first blind run) | 11/30 — L2-1..6 product gaps + realignments |
| 6 | eval:app | 27/30 — drag off-viewport, dev-tools name collision, apostrophe |
| 7 | eval:app | **30/30 green**; unit suite 624 passed / 15 skipped |
| 8 | eval:chat cat 1 (N=1, first) | 9/15 — judge lacked diary ground truth; day-dumps collapsed; estimate framing |
| 9 | eval:chat full corpus (N=1, first) | 102/190 all-green. Failure classes: invented running totals; judge blind to the engine's context block; goal/repair conversations answered in prose with no proposal event; explicit pantry statements only added to the list; wrong-referent retract/amend; model weekday math; plan-picker mismatches |
| 10 | eval:chat cats 1,3,9,11,19 (N=1) | after context-echo + day-total receipts: cat 9 17%→67%, cat 19 (new) 88%; cats 1/3 exposed the model still deriving totals in prose — led to the absolute no-totals rule + engine extensions |
| 11 | eval:chat cats 1,3,4,7,9,10,11,13,18 (N=1) | post-extensions: cat 4 20%→40%, 7→17%, 9→83%, 10→67%, 11→50%; picker mismatches + restructure-op gaps isolated |
| 12 | eval:chat full (N=1, killed at 150/198 externally) | partial: cat 1 93%, cat 4 100%, cats 2/3/9-13 75-92%; cats 6 (40%) and 7 (25%) drove the op-family build (trim_week, drop_meal_span, add_snack, swap_days, double_slot, avoid) |
| 13 | eval:chat cats 6,7 then 5,6,7,8,14 (N=1) | cat 6 40→73→60% (sampling variance), cat 7 8→50→67% after repair triggers; premise realignments (400-over, salmon-twice, prep FLAG) |
| 14 | eval:chat cat 1 (N=3, certification chunk) | 82% — every miss one class: model narrating totals/fake receipts in prose → sanitizeReply (deterministic strip) + protein-today grounding + judge self-refutation filter |
| 15 | eval:chat cat 1 re-cert (N=3) | **96% — cat 1 criterion (>=90%) MET.** |
| 16 | eval:chat cats 2,3 (N=3) | cat 2 **94%**; cat 3 67% (wrong-referent bare undo + delta prose + judge grading post-amend totals against pre-action context) → bare-undo fast path, delta stripping, judge post-action rule (`31708c9`); cat 3 re-cert pending |
| 17-24 | chunked N=3 certification, cats 3-19 with fix rounds between | cat 3 67→89%; cat 7 61→75→89% (blowout-shaped trims, skip coercion); cat 13 89→94→100% (distress fallback guard, disclosure-vs-request rubric split); cat 14 63→88% (log-vs-ask worked examples); cats 16/17 write-on-read bug fixed (`c9e4dc5`) → 100%/89%. Final: 153/198 all-green, 87% mean, both criteria met |
