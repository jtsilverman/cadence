# UX: the user's model of the product

**Status: ROUGH DRAFT v1 (2026-07-27).** This baseline matches the built headless backend (specs/backend-complete.md, PRs #20-26): every information flow below exists as API + tests; no screens for the new surfaces yet. Next revision proposes new visions on top of this baseline rather than editing history into it.

Plain-language source of truth for what the product feels like. `PRODUCT.md` = what and why. This file = how it works from the user's chair. The technical workplan gets re-derived from this, not the other way around.

## The information model (Jake's five letters)

**A. Stuff you saved** (the libraries)
- Recipes: from any video/URL/photo → ingredients, clean instructions, source video attached for guidance.
- Movements & workouts: from workout videos → specific movements, video attached as form reference.

**B. Where you are right now** (current state)
- Pantry: what's in the kitchen.
- Body: weight, height, metrics.
- Goals: lose weight, hit protein, squat 315, run a marathon. The destination.

**C. What you actually did** (the diary, always growing)
- Meals eaten (including eating out).
- Training sessions: movements with weight/reps/RPE, times, dates.
- Sleep, mood/journal entries.
- Wearable data (Whoop/Oura/Garmin) layered over all of it.

**D. This week's plan** (one schedule, four lanes)
- Meals (prep staples / special / eating out), workouts, sleep targets, mind time.
- Plus the grocery order, timed so ingredients arrive before they're needed.

**E. The long-term plan** (the route)
- The program connecting goals to weeks: a 12-week strength block, a marathon build, a cut.
- Each week's D is the next leg of E. History (C) tells E whether you're ahead, behind, or due a deload.

**Computed, never hand-maintained** (the app derives these fresh):
- Grocery list = D's ingredients − pantry (B).
- Pantry = starting state + delivered orders − consumed (from C) − expired.
- Progression = movement history (C) + recovery (C) + program position (E) → "5 more lbs this week."

**The pantry question that actually matters (Jake, 2026-07-26):** the user isn't asking "how many grams do I have," they're asking **"will my current supply of X last until my next grocery run?"** Assume a weekly run (some households bi-weekly — ask once or learn it from order/checkoff cadence). Judge each item against the planned meal schedule between now and that next run, and answer in exactly two registers: "plenty until your next trip" or "you'll run out — grab more or you're making a mid-week stop." Every pantry/fullness/replenishment surface gets framed against this horizon, not against absolute quantity. (Stepping stone shipped first: "~N cooks left" from cook history; the full horizon answer arrives when the week plan persists, P3.)

## The loop (one sentence)

Goals set E → E shapes this week's D → D draws from A → doing D writes C → C updates B and repositions you on E → next week's D adjusts. Every week needs less input than the last.

## Planning horizon: detail decays with distance

Rolling window. This week (D) is fully detailed and locked by your approval. Next week exists as a visible, editable draft, so Saturday is confirmation, not cold planning. Everything beyond is program skeleton only (E: "weeks 5-8, volume block, +10 lbs"), never meal/set detail, because the inputs that make detail good (recovery, pantry, cravings, calendar) are only fresh days out; detail planned weeks ahead is guaranteed-wrong work. The cart is always built from the locked week only; the draft week shows a cost estimate.

**Real-time deviations, two mechanisms:**
- **Repair (event-driven, immediate, locked week only).** Skipped or changed workouts repair the moment the event lands. Meals repair too, deliberately simpler (Jake reversed the earlier "meals don't repair" rule, 2026-07-27): shift to a meal-free day or let it go, nothing else. Repairs ride the autonomy ladder: trivial reshuffles auto-apply with an undo notice; structural changes (push the block? skip deload?) are a one-tap question. (Built today: full repair menus as logged suggestion pairs, undo/retraction, rungs as state. Auto-apply at higher rungs is NOT built yet, deliberately: the suggest-only rule stands until the first auto-applier amends it.)
- **Living draft (continuous).** The next-week draft silently re-updates from everything that happens (misses, pantry drift, recovery trend); churn in a draft is free. The locked week never changes without an event and (above the trivial tier) your say-so; a plan that drifts on its own reads flaky, not smart. Weekly lock beat stays: groceries batch weekly, training volume is per-week. Weeks start Monday.

**Skipped-workout repair menu** (agent scores context, offers its pick + 1-2 alternates, one tap each, one-line why):
1. **Shift**: session slides forward, rest day slides back. Best early-week with room.
2. **Double up**: only for high-priority sessions with green recovery.
3. **Consolidate**: merge into next session (skip legs → upper becomes full-body, reduced volume). Best mid-week.
4. **Drop**: absorb the miss, record it, E adjusts. Best late-week or when recovery is red; chasing volume is a named failure mode.
5. **Redistribute**: skipped session's key sets sprinkle across remaining sessions.
Context scoring: day of week, session priority in the block, adjacency (never stack a makeup hard day before a planned hard day), recovery, block position. Repeated choices become the default at higher ladder rungs (auto-apply + undo notice).

**Skipped-meal handling (deliberately simpler than workouts):** a two-option menu only — shift the meal to a meal-free day, or let it go. No makeup meals beyond that, no cascades. Underneath, rough consumption tracking still does the real work: what got eaten, what groceries got used, so the next haul is informed. A dropped meal's ingredients just stay in pantry (expiry nudge where relevant); eating out counts macros and touches nothing else.

**Calorie smoothing:** the week has a calorie/macro budget, not rigid days. Over or under on a day → the agent nudges subsequent days marginally using snacks and quick items (add a protein snack, trim a portion), never by restructuring planned meals. Guardrails: corrections are capped per-day and spread across the week (weekly average is the target, not daily perfection); the agent never proposes compensatory swings (no "you overate, tomorrow is 1,200"); tone is matter-of-fact, never judgmental. Calories from planned meals are auto-estimated from recipes; deviations logged in a tap ("ate half", "seconds").

## Precision is a dial, not a doctrine

Everything consumptive (calories, portions, pantry counts, even lifted weights) is a rough estimate by default, and the product says so plainly. Users who want exact science can have it (gram-level logging, barcode scans, exact set weights); users who want loose tracking estimate freely ("big bowl", "about 200g", "felt like RPE 8"). The dial is per-domain: exact on lifting, loose on food is fine. All downstream math (smoothing, progression, consumption inference) carries the precision of its inputs and never pretends otherwise. The calorie budget is also energy-aware: wearable expenditure (workouts, daily strain) informs the week's intake target, not just food logged. (Deferred: expenditure ingest isn't built; today's week target is 7x daily, unadjusted.)

## Reliability rules (accepted 2026-07-24)

- **Delivery reconcile:** what arrives ≠ what was ordered (substitutions, out-of-stocks). One quick "anything subbed or missing?" confirm on delivery; pantry inflow records actuals, not the order.
- **Extraction confidence:** shaky parsed fields get flagged in the review-before-save moment; a wrong quantity never silently reaches the cart.
- **Notification budget:** quiet by default. Batched into the daily glance + the Saturday beat; real-time pings only for time-sensitive events (cart closing, expiry, delivery).
- **Undo + visible trail:** every auto-action has a history entry and one-tap undo. Trust climbs the ladder only because backing out is always trivial.
- **Never claim done without the receipt:** the app reports an action as completed only after its event is durably recorded, and shows the state that proves it (the cart URL, the pantry line, the log entry). Ohai's 2.5-star trust collapse came from an assistant saying "done" when nothing happened; that failure mode is structurally banned here.

## Rules of the relationship (how the agent behaves)

- The app **suggests, you decide**. It never silently asserts what's in your kitchen or changes your plan. Unclear → it asks.
- **Stated beats learned.** Your explicit preferences (brands, avoid-lists, macros, budget) always outrank what it inferred.
- **Trust is a ladder you climb by choice:** review everything → one-tap approve → it auto-handles staples/routine → full auto. Per action type, never forced.
- Money never moves without your approval until you've explicitly granted that rung.

## The six defining journeys

### 1. Save from anywhere (Tuesday, on the couch)
See a pasta video on TikTok. Share → send to app. Seconds later: a real recipe card (ingredients, steps, nutrition, the video attached), sitting in your cookbook. Same gesture for a workout video → movement card with form reference. *Feel: effortless capture. Nothing to type.*

### 2. Plan the week (Saturday morning, 5 minutes)
App greets you with a draft: "Here's next week." Meals picked from your cookbook (prep staples auto-slotted, one new recipe you saved this week, Friday marked eating-out because it usually is), workouts as the next leg of your program (squats +5 lbs, per history and recovery), sleep targets, two mind slots. You swap a dinner, drag a workout day, approve. *Feel: editing a good draft, not filling a blank page.*

### 3. Review and order — or shop (same sitting, 2 minutes)
The draft list is already built: this week's ingredients minus your pantry. Each line shows the matched product; anything uncertain is flagged as a question ("this brand of tahini ok?"). Two ways to execute, your choice per week:
- **Delivery:** hit Order, Instacart opens with the cart ready, you check out. Delivery lands; pantry updates itself.
- **Shop in store:** the list becomes a store-specific shopping list (organized for your preferred store, shaped by your preferences, avoid-lists, macro priorities). Check items off in the aisle; checked = bought, pantry updates the same way.
*Feel: the list did itself; you just said yes — at home or in the aisle.*

### 4. Cook it (Wednesday night)
Open the recipe → cook mode: big type, one step at a time, timers built in, the source video clip next to the tricky step. Done → "I made this." Pantry decrements, macros log, streak ticks. *Feel: the phone is a good sous-chef.*

### 5. The app speaks up (any day)
Push: "You're probably low on olive oil — add to Thursday's order?" Or: "Whoop says rough recovery. Swap tomorrow's intervals for an easy run + push the long run to Sunday?" One tap yes/no. Every answer teaches it. *Feel: a coach who pays attention, not an app nagging.*

### 6. Look back (Sunday evening, optional)
The week reviewed: meals hit vs planned, training volume vs program, sleep trend, one journaling prompt tied to something real ("first week all protein targets — how'd it feel?"). Progress on E visible: "week 4 of 12, on track." *Feel: momentum you can see.*

## Onboarding: the first 10 minutes

Principle: time-to-first-magic under 2 minutes; setup debt paid lazily as the loop runs; never a 20-screen questionnaire.

1. **Goal, one screen.** Pick 1-2 (lose weight / build muscle / run a race / eat better / just organize food) + optional body basics. Seeds E.
2. **Save one thing immediately.** "Send us any recipe or workout video you've liked." The aha (video → structured card) lands in minute 2, before any setup grind.
3. **Pantry bootstrap, deliberately lazy.** No kitchen-inventory chore. 30-second staples checklist, fridge photo, or skip. Pantry starts "unknown", not "empty"; it builds itself from the first order and the first cook.
4. **First week is a half-draft.** No history yet → modest proposed week (2-3 meals from saved + goal-matched starters; starter program if training goal), framed honestly: "first week is a guess; it sharpens as it learns you."
5. **Wearable connect offered, skippable.** One tap for Whoop/Garmin/Oura, never a wall.

## Where the journeys stand (2026-07-27, backend-complete)

All six journeys now have their information layer built and journey-tested headless: J1 both kinds (recipe + workout video, share-sheet via Shortcut), J2 (4-lane drafted week, living draft, program-aware), J3 (list diff + in-store run; Instacart link written, never live-verified), J4 (cook mode + pantry math + macro snapshot), J5 (suggestion pairs for ease/repair/next-target/replenish/trim, undo trail), J6 (reflect: week review, streaks, one prompt). What no journey has yet: screens beyond the P1-era pages. Push notifications (J5's "app speaks up" delivery) are a delivery question, not a data question.

## Screens (first inventory, MVP-relevant marked ●)

- ● **Cookbook** (saved recipes; later: workouts tab)
- ● **Recipe card / cook mode**
- ● **This week** (data layer shipped: 2-week four-lane slot model + APIs; grid screen in the page-mapping pass → later: the full drafted schedule with agent proposals)
- ● **Today** (the daily glance: today's slots, one-tap done/skip — data layer shipped, screen in the page-mapping pass)
- ● **Cart review** (matched products, flagged questions, Order button)
- ● **Pantry** (list + add/edit; suggest-chips from the agent later)
- **Program** (E: goal → block → week position) — data layer live (`/api/program`), no screen
- **Check-in / review** (journey 6) — data layer live (`/api/reflect`), no screen
- **Profile** (goals, preferences, avoid-lists, macros, budget) — goals + prefs APIs live, no unified screen
- **Autonomy / trust** (rung per suggestion kind + accept/dismiss record) — data layer live (`/api/autonomy`), no screen
