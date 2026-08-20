# ux.md — the sparknotes

**Status: canonical condensed UX (2026-08-06, rescoped same day).** The short version of the product's UX, distilled from `drafts/UX.md` (v1 baseline) + `drafts/UX-v2.md` (Jake's decision log). Where they disagree, v2 wins. This file is what you build screens from; the drafts are the receipts.

## ⚠️ Current build scope: NUTRITION ONLY (Jake, 2026-08-06)

**The app right now is the nutrition side: meal planning, food logging, the grocery list, the pantry, and the coach.** Everything training-related — workout planning, live workout logging, the exercise corpus surfaces, recovery-aware programming, the Workouts screen — is designed (kept below, marked **[LATER]**) but is NOT built now. Build nothing workout-facing. Where a nutrition feature references training data (workout-phase meal composition, pre/post-workout meals, expenditure-aware budgets), it runs on stated activity level and wearable data if connected, and upgrades when training ships. If a user asks the coach about workouts, the honest answer is that training is coming — never a faked capability.

## What Cadence is

An agentic health OS — **shipping nutrition-first**. Any recipe from anywhere becomes structured data; the system drafts your meals — every meal and snack, both weeks — from your goals, history, and life; you live it, log it in a sentence, and the plan adapts. The grocery list derives itself. Training, recovery, and reflection run on the same engine and diary **[LATER]**. The backend is fully built headless (`specs/backend-complete.md`); this doc drives the UI.

## The mental model (five letters, one loop)

- **A — stuff you saved:** the libraries. Foods (ingredients / products / snacks / recipes / meals) captured from TikTok, URLs, photos, AI invention, or by hand. (Exercise/workout library **[LATER]**.)
- **B — where you are now:** body basics, pantry, goals, preferences.
- **C — what you actually did:** the diary. Meals eaten, sleep/wearables, mood. Append-only; every view is a fold over it.
- **D — this week's plan:** the schedule — meals + snacks fully specified. (Workout lanes **[LATER]**.)
- **E — the long-term plan:** the program connecting goals to weeks (a cut, a recomp target).

The loop: goals set E → E drafts D → D draws from A → living D writes C → C updates B and repositions E → next week needs less input than the last.

## Planning horizon (v2 contract)

**Two full weeks, Monday-start, fully specified** — every meal and snack with rough time of day (and cook time when meal prepping). Week 2 remints Sunday night → you always wake Monday with two planned weeks. **Plans are proposed, never imposed:** draft appears → adjust manually, prompt changes via chat, or answer a short survey → approve → it's on the calendar.

## The coach (the main surface)

**Chat with the coach is the primary way information enters and leaves the system** — logging ("I had a chicken Chipotle bowl and 3 rice cakes"), questions, plan changes, tradeoff conversations, education (pull-based, grounded in your data, citing sources). Manual controls exist everywhere as the fallback, never the other way around. **The coach is docked at the bottom of every screen except the Feed.** No persona name in marketing; in-product it speaks as Cadence.

## Screen map

**Now:** **Today · Nutrition · Journal · Coach** (coach docked on all).

- **Today / Day view = home.** The day's meals, calorie/macro state (day-level, never per-meal badges), wearable data if connected. Calendar toggles day ↔ week.
- **Week view:** the two mapped weeks. Drag-and-drop is first-class: meals between days/slots, easy swaps — rearrangement is a gesture, not an edit form.
- **Nutrition:** the day's meals, the food library, grocery list, pantry, cook mode.
- **Journal:** the diary — history, trends, the weekly review (Sunday reflect), streaks.

**[LATER]:** **Workouts** (program position, workout detail, Hevy-shaped live session logging) and the **Feed** social scroll (saveable-things-only cards, food + training lenses; if an early feed ships it is food-only).

## The meal system

- **Full-day planning:** every meal and snack, both weeks, sized to be eaten in full (portions per user; portion entry is the deviation path). Calorie target is **AI-derived from body basics + goals + stated activity, presented as an adjustable proposal** — never a blank form field.
- **The food library, five kinds kept separate:** ingredient, product (atomic, flag-classified — seed oils, HFCS, gums, preservatives), snack, recipe (how food is made; batch-cookable), meal (what fills a plan slot; composes recipes/products/ingredients). Saving a recipe auto-offers it as a meal. **Recipe intake, four doors:** TikTok/video extract, article/URL extract, AI-invented (palette-seeded), manual.
- **Auto-save + favorites:** everything eaten is saved automatically; second eat prompts a favorite. Favorites are what the planner drafts from; full history seeds the palette and AI invention.
- **Drafting inputs:** favorites + consumption rates, macros/calories/micros, ingredient steering vs hard restrictions (never violated), planned eating-out (**coached ahead** — decide the order with the coach in advance), per-day cook feasibility (no time → prep it, and the draft schedules the prep), perishability, variety tolerance, yesterday's diary. (Workout schedule/phase and pre/post-workout composition **[LATER]** — until then, stated activity level stands in.)
- **Meal prep is first-class:** cook once Sunday → four planned containers Mon–Thu; planning, pantry, and budget all understand it.
- **Repair / daily reconcile:** ate over → later meals trim (same day first, then capped smoothing across the week — never "tomorrow is 1,200"). Under-ate → "you still have X to eat" or "did you forget to log?". Skipped a big meal too late to cook → propose a making-up snack. Matter-of-fact tone, never judgmental.

## Groceries + pantry (deliberately simple)

List goes out (rough quantities, rounded **up** to buyable units) → checked off as bought → consumed via cooking/eating → pantry depletes → next list. **Store-aware with pre-baked substitutions** per line; barcode scan for anything else. Staples are the user's job (add via chat or by hand). **Pantry is suggest-only:** inference marks lines "you probably have this — skip?"; only explicit user action asserts inventory truth. Trigger: user asks, or shopping day on the calendar. Instacart/Kroger rails: later (compliant rails only, ever).

## Onboarding (~3 minutes, one conversation)

Coach chat with tap-chips + always-live mic: goal → body basics → hard restrictions → a dictation-first seeding question with live parse ("what do you actually eat on repeat" → favorite cards materialize as you talk). Mid-conversation the calorie proposal appears as an adjustable number. **Future You simulator** (nutrition edition now): time scrubber + deficit/adherence sliders live-updating predicted weight — ranges not points, deficit clamped healthy — and **the knobs ARE the plan inputs**; "let's go" drafts week 1. Ends at the standard plan-proposal flow. Only goal + body basics + hard restrictions are mandatory; everything else skippable, resurfacing ambiently in week 1. (Training seeding question, trainable-days/split knobs, strength curves **[LATER]**.)

## Rules of the relationship

- **Suggest, you decide.** Nothing asserts your kitchen or changes a locked week without an event and your say-so. Unclear → it asks.
- **Stated beats learned.** Explicit preferences outrank inference. Avoidance is asked about, never silently inferred from a couple of swaps.
- **Trust is a ladder** climbed by choice, per action type: review-everything → one-tap approve → auto with undo notice → full auto. Money never moves without the rung.
- **Undo everywhere; never claim done without the receipt** (the event durably recorded + visible proof).
- **Precision is a dial, per domain:** gram-level or "big bowl" both work; downstream math carries input precision honestly. **No per-meal calorie badges** — day-level totals/bars only.
- **Notifications:** fully configurable; never uniform (coach-written, varied phrasing, real context); many small ones beat few heavy ones; each addressable in seconds.
- **Units:** per-user metric/imperial (g/oz/cups/servings) — display conversion over canonical storage.

## Body data

Import from Whoop if connected (sleep and expenditure make the calorie budget energy-aware), or prompt on a schedule (weigh-ins on the calendar). Never a wall.

## UI direction

Minimalist but capable. **Sharp corners (radius 0), strong not sterile.** Palette: lightish grey / black / off-white / **matte forest green accent**. Dark-first product surfaces; bold type over monochrome; data with technical precision. Reference brands: Eight Sleep, Equinox, Arc'teryx. (The marketing site is its own light/cream Eight-Sleep-anatomy system — `app/tokens.css` + `drafts/site-map.md` — don't conflate the two.)

## [LATER] The exercise system (designed, not built now)

Canonical exercise corpus (`variationOf` families) + user videos as personal form references; engine turns body + typed history + split preference + compound goals into two detailed weeks + a macro cycle (push/max/deload phases); blank-weight first workouts as the calibrator; Hevy-shaped live logging (weight × reps × RPE); performance feeds forward every session; injuries reroute programming; missed weeks redraw phases. Full detail: `drafts/UX-v2.md`.

## [LATER] Feed / social (designed, not built now)

One scroll, saveable things only; one card grammar (visual + why-you're-seeing-this + save / add-to-plan / not-for-me); ranked by your data, not engagement; profiles/follows/likes/comments/shares; UGC is structured objects only, no free-text health takes; education stays in the coach.

## Explicitly later (the docket)

Everything training and feed/social (above), household/multi-person planning, budget, Instacart/Kroger live rails, global form-video promotion, supplement *recommendations* (tracking is in), self-filmed form review, travel/event weeks, skip-pattern renegotiation, eating-style sense.
