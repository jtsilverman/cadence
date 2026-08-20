# UX v2 — working notes (accumulating)

**Status: capture in progress (2026-07-27).** Jake's reading notes against the data map, one decision per bullet. Gets restructured into the full UX v2 doc once the walk-through completes. Baseline being revised: `drafts/UX.md` (rough draft v1).

## Decisions

- **Calorie target is AI-derived, not user-input.** The system computes the daily calorie goal from body basics (weight, size, m/f), user goals, activity — the user adjusts it but never has to invent it. Implies: body basics become required stated data (the v1 gap ledger's "body basics" item is now load-bearing, not nice-to-have). The derived number arrives as an adjustable proposal, not a form field the user fills blind.

## The exercise system (Jake's framing, 2026-07-27 — design one system at a time, this first)

**Items in the system:**
- User body: weight, height, m/f.
- Exercise history, typed per modality: weights (weight/reps/sets), running (pace/time/distance), biking, swimming, yoga — the metrics depend on what the exercise IS.
- Workout history: what the user has done recently, what the routines look like (helps build the split).
- Training split preference: stated by the user, aligns with goals.
- Goals: inform split, reps, weights.
- TikTok exercise ingestion: "I like this exercise from this video" → single exercise joins the user's repertoire (exercise-level, not just whole workouts).

**How it works:** gather all of the above → run through an engine/model → populate a full macro training cycle (weeks/months).

**Output shape (the horizon contract):**
- **Two full weeks** mapped out in advance, Monday-start: every workout, every exercise, with sets/reps/weight/time/pace as the modality demands. (Revises v1's "next week is a loose draft" — both weeks are fully specified now.)
- **The macro calendar** beyond that: the training cycle's phases outlined week by week — push / max / deload type per week — no exercise detail.

**Decisions (2026-07-27):**
- **Remint cadence:** week 2 mints between Sunday night and Monday morning. You go to bed with next week planned, wake up with two full weeks planned.
- **Missed week → redraw phases.** The engine re-plans the macro calendar, not a dumb shift-everything-back.
- **Goals are nuanced compounds**, not single labels: "marathon while building strength." The product's job includes making the user understand the tradeoffs (of goal combinations, and of skipping workouts).
- **The exercise corpus:** a set corpus of every exercise + its measurements — every cardio, every machine, every dumbbell/cable/barbell variation, bilateral/unilateral variations. This is THE exercise source. User-submitted videos are the second source; if a video overlaps a corpus exercise, the video attaches to that exercise for that user (personal form reference on a canonical exercise). Corpus build = an overnight loop task, queued.

- **Metric vs imperial is a feature.** Per-user unit preference across the whole surface — lb/kg, km/mi, pace per km vs per mi, height/weight units. Display-layer conversion over canonical stored units; likely per-domain (lift in lb, run in km is a real combo). Corpus entries carry canonical units.

**Interaction principles (2026-07-27):**
- **Everything easily changed.** Workouts drag-and-drop between days; weeks easily shifted; exercises within a workout easily substituted. Rearrangement is a first-class gesture, not an edit form.
- **Performance always feeds forward.** Every logged workout/exercise updates history through the diary, and future workouts/exercises re-derive from it against the goals (faster, stronger, progressive overload). The plan is never stale relative to what actually happened. Exact prompt + engine structure: designed later.

**In-workout capture (2026-07-27):** Hevy-shaped. The live workout screen is the Hevy pattern: planned exercises listed, set rows with weight × reps × effort (RPE x/10), tap-through logging. Or the session imports from a wearable instead. Deviations from plan are just what got typed in the rows.

**Cold start (2026-07-27): two mechanisms, #2 primary.**
1. *Optional baseline survey, goal-catered:* "what weight is an 8/10 if you had to do 8 reps — squat? bicep curl? tricep extension?" — the exercise list follows the goal (bodybuilding exercises for a bodybuilder, barbell lifts for strength/powerlifting, "what pace is 8/10 for a 5k" for a runner). Starting metrics derived from answers.
2. *Blank-weight first workouts (primary):* engine builds the workout, populates reps (per goal) and a target effort per set (this set: 5/10; this one: 8/10), leaves weight blank. User fills in the weight they used + the actual effort at those reps — and that IS the baseline data. Survey (#1) as a quick optional pre-tune; everything tunes continuously through logged weight/reps/effort after.

**Plan proposal flow (2026-07-27):** plan gets *proposed* → user can (a) make manual adjustments, (b) prompt changes through a chat, or (c) answer a short survey of questions about the plan → then it appears on their calendar. Appearance follows approval on a fresh cycle; the Sunday-night remint keeps the standing rhythm.

## The meal system (Jake's framing, 2026-07-27 — system 2)

**The food hierarchy:**
- Meals = saved recipes, made up of ingredients/products.
- Ingredients carry macros. Products (anything not a whole food) have ingredient lists of their own — **not worth modeling every sub-ingredient of every product.**
- What IS worth doing: **classifying products by flags** — preservatives, seed oils, gums, high-fructose corn syrup, and other chemicals that should be flagged.
- **Every measurement unit-convertible** (g/oz/cups/tbsp/servings; canonical units + conversion).
- Posture: essentially MyFitnessPal/Lifesum — bolt on most of their system — but with full meals and recipes on top, and the planner underneath.

**Decisions (2026-07-27):**
- **Full-day planning: every meal and snack planned per day, for both mapped weeks.** Not dinner-first.
- **Food data: MFP-grade product database + barcodes** (whatever sources give that coverage — USDA FDC for whole foods, Open Food Facts / branded DBs for products + barcodes).
- **AI flag classifier = another overnight-loop corpus task** (queued alongside the exercise corpus): reads product ingredient lists once → flags.
- **Unplanned eating comes in measured or estimated.** Primary capture: tell the coach in chat ("I had a chicken Chipotle bowl and 3 rice cakes with peanut butter") → model resolves to macros with honest precision. Manual MFP-style entry exists as the fallback.
- **Portions: meals are designed to be eaten in full, sized per user.** The engine sizes servings to the person's targets; portion entry is the exception path (deviation), not a daily gesture.
- **Flag policy: flag what the user cares about; stated avoidance steers the planner.** If the user prefers to avoid (e.g. seed oils), flagged items are surfaced AND the planner avoids them — unless the user insists on a specific recipe/product.
- **Meal prep is first-class.** A recipe cooked once becomes multiple planned meals split across days (cook Sunday → 4 lunch containers Mon-Thu). Planning, pantry math, and the budget all understand batch-cook → portioned-out.

**Meal repair / daily reconcile (2026-07-27):** the plan and the day drift; a standing process reconciles them.
- **Ate something unplanned (over):** cut down later meals — same day first, then across the remaining week (the capped-smoothing idiom).
- **Under-ate:** notification: "you still have X to eat" — or it asks whether you forgot to log a meal (missing-log is as likely as missing-food).
- **Big meal skipped, too late/much to cook:** propose a snack or smaller bite that roughly makes up for it — approximation over ceremony.

## The food library (Jake's framing, 2026-07-28 — saving food for later use)

**Five saved kinds, kept separate: ingredient, product, snack, recipe, meal.**
- **Ingredient**: whole food, carries macros.
- **Product**: anything packaged/branded; atomic (flag-classified, never decomposed into sub-ingredients).
- **Snack** (2026-07-28): first-class kind — small things eaten by themselves at any time of day (banana, beef stick, protein bar). Things usually eaten alone stay packaged together as one plannable thing.
- **Recipe**: how food is made — ingredients + steps + yield. Can be a component (a sauce, batch-cooked chicken portioned across days).
- **Meal**: what you eat at a sitting — one or more recipes/products/ingredients composed and sized (steak recipe + microwave rice + frozen veg = one meal). Fills a plan slot. NOT merged with recipe (2026-07-28): the 1:1 common case gets zero ceremony (saving a recipe auto-offers it as a meal), but merging breaks multi-component dinners and batch-cook portioning.

**Recipe intake, four doors:** TikTok/video extract, article/URL extract, AI-invented, manual creation.
- **AI door = invention** (2026-07-28): the model takes preferences, history, and the palette derived from prior meals/ingredients/products, and invents meals/recipes that incorporate them.

**"Foods" = the umbrella term** (2026-07-28): ingredients/products/snacks/meals/recipes collectively. Every food carries a per-user consumption record — how often it's eaten (rate) and how it's received (preference) — derived from the diary. This powers the favorite prompt, the palette/invention seed, and replenishment math (rate → when you'll run out). Requires food identity matching at log time (chat-logged "chipotle bowl w/ chicken" resolves to the same food as Monday's "chicken Chipotle bowl"; barcodes trivial).
- **Preference = frequency; avoidance patterns get asked, not inferred** (2026-07-28): frequency alone signals liking. If a food gets swapped out/avoided a couple of times, don't silently downrank — prompt the user: keep it, dislike it, prefer something else, shift away from it, or tweak the recipe. (Food twin of the exercise skip-pattern renegotiation already on the docket — same interaction idiom.)

**Auto-save + favorite** (2026-07-28, supersedes the promotion-offer idea): everything eaten is saved to the library automatically — no save gesture. Second time eating the same thing → prompted to favorite it. Two tiers: full eaten history (auto, feeds palette/invention) and favorites (curated, what the planner drafts from).

**The meal plan composes from the library:** day slots filled from saved meals, snacks, products.

**Meal drafting inputs (noted 2026-07-28; engine + generative-model design deferred).** The draft covers the meals AND their rough time of day (and cook time when meal prepping). Inputs to take into account:
- Workout schedule + workout phase + goal
- Pre/post-workout composition (workout time shapes adjacent meals: light before a run, protein after lifting)
- Foods history: preferences, favorites, consumption rates
- Time of day (breakfast/lunch/snack/dinner slotting); fasting windows only when part of the overall program goal (2026-07-28)
- Macros, calories, micronutrients
- Ingredient steering (avoid seed oils etc.) — distinct from hard restrictions (allergies, vegetarian/keto-level rules: never violate)
- Travel, planned eating out, planned nights out drinking
- **Planned eating-out is coached ahead** (2026-07-28): lunch out / pickup dinner → decide what to order WITH the coach in advance, so the healthy call is pre-made.
- **Cook feasibility is per-day, not an average** (2026-07-28): does this day/moment leave time + resources to cook? If not: prep it — and the draft decides when the prep happens.
- **Pantry: plan-assumes-nothing, confirm at list review** (2026-07-28): the draft generates its full shopping list; pantry inference (purchases minus estimated consumption, confidence decaying with age) only marks lines "you probably have this — skip?" — the user's checkoff at grocery-list review is the confirmation. No silent have/out assumptions (matches the standing suggest-only pantry rule).
- Grocery arrival timing + perishability ordering (fish early in the week)
- Plan for ONE person for now; household (partner/family portions + preference intersection) parked for later (2026-07-28; `household_id` stays on tables day 1)
- Variety tolerance (repeat-lover vs repeat-hater)
- Yesterday's diary (repair carryover via capped smoothing)
- ~~Budget~~ — cut for now; people manage their own budgets, later feature (2026-07-28)

## Groceries + pantry (Jake's framing, 2026-07-28 — deliberately dumbed-down and simple)

**The loop:** grocery list goes out (rough quantities) → items checked off as bought → consumed as foods → pantry depletes → list goes out again.

**List derives from:** foods schedule (the meal plan — automatically backs in hard/soft preferences + favorites), pantry (all foods in inventory), foods consumed (raw subtraction from bought foods + a consumption rate modeling future demand in tandem with the schedule), preferences/avoidance/favorites.

**Decisions (2026-07-28):**
- **Units:** list lines round UP to buyable units (heads/jars/lbs) via the ingredient→product matching layer; rough quantities OK because of this.
- **Staples are the user's job** — impossible to track; NOT system-modeled. User adds anything to the list manually or through chat.
- **Store-aware list with pre-baked substitutions** (instead of making the user mark every sub): know which store the user shops at, recommend specific products that store carries, each line shipping with ready substitution options — mark "got the sub," or scan the barcode for anything else. If they mark as-is but bought something slightly different: close enough, doesn't matter.
- **List trigger:** user prompts it, or shopping day is marked on the calendar.
- **Instacart/Kroger integration: later** — overcomplicates this stage. (Compliant-rails rule stands for whenever it lands.)
- **Expirations modeled roughly** (perishability as depletion).
- **Cooking converts:** a cooked recipe moves foods out of pantry into consumed.

**Global (cross-system) decision:** **the coach chat is the main interaction surface for the whole system** — logging, questions, plan changes, tradeoff conversations — with manual controls always available for everything.

## For You / social (Jake's framing 2026-07-29 — critical feature; social is what keeps everyone involved)

- **The scroll = saveable things only** (membership rule): meals, recipes, snacks, products, workouts, exercises — whatever can enter the library or the schedule. One card grammar: visual (video if it exists), why-you're-seeing-this line, actions save / add to plan / not-for-me (not-for-me feeds the palette). Card tap opens native detail.
- **Filter modes on the one scroll:** all / workouts+exercises / meals — lenses over the same feed, not parallel feeds.
- **Card species:** AI-invented for you (palette-seeded), real recipes matched to gaps (variety, macros, phase), exercise/program content for the current block, user-posted foods/workouts.
- **Ranking signal = the data we already have** (palette, favorites, avoidances, goal, phase) — not engagement metrics (dwell optimizes food porn, not food you'll cook).
- **Education lives in the coach, not the scroll** (2026-07-29): pull-based — chat about a topic and the coach answers grounded in your data, citing articles/tweets/studies to go deeper. Scroll = stim + social; coach = learning; Today = status.
- **UGC line (2026-07-29):** users can post their own meals/recipes/workouts ("I made this" — structured object attached, viewers one-tap save). NO user-posted articles/free-text health takes — misinformation moderation burden + breaks the card grammar. Articles enter only as extraction sources and coach citations.
- **Full social layer is IN (Jake, 2026-07-29): follows + creator branding (profiles/handles), and the standard engagement set on posts — likes, comments, shares, saves.** Saves double as the library action; shares work external too (recipient one-taps into their library). Social-proof garnish on system cards stays ("312 people with your goal favorited this"). Streaks/leaderboards still out of the feed; status stays in Today.
  - Flag: comments are free-text — the health-misinformation moderation surface excluded at the article level comes back in at the comment level; needs a moderation posture (report + AI screen at minimum) when this builds.

## Onboarding / cold start (2026-07-29 — one coach conversation, both systems)

Jake's frame: onboarding conversation with the coach — easy yes/no taps and selections, really easy to dictate; quick, captivating, informative for the coach; plans tune over time so it doesn't need to be perfect.

**Recs (2026-07-29, pending cuts):**
- Chat with chips: one question at a time, tap-chips + always-live mic/free-text; taps write structured data, dictation uses the diary-chat extraction.
- Order by plan-impact: goal → body basics → hard restrictions → seeding questions → nice-to-haves.
- Two seeding questions, dictation-first with LIVE parse (cards materialize as you talk — the captivating moment): "what do you actually eat on repeat" (seeds favorites; week 1 ≈ 70% food you already eat) and "how do you like to train" (styles, equipment, refusals, trainable days — closes the workout preference gap in the v1 cold start).
- Progressive reveal: calorie target appears as the adjustable proposal mid-conversation; week skeleton flashes after training prefs; onboarding ends at the existing plan-proposal flow.
- ~3 minutes; mandatory only goal + body basics + hard restrictions; anything the diary can learn later is skippable, and skipped questions resurface ambiently in week 1.
- One interleaved conversation (goal → training → food); optional strength-baseline survey hangs off the end; blank-weight first workouts remain the calibrator.

**Future You simulator (Jake, 2026-07-29 — the captivating centerpiece, more than an interview):**
- After body basics + goal direction: time scrubber (8 wks / 6 mo / 1 yr) + scalers (training days/week, session length, strength-vs-cardio mix, calorie deficit/surplus) live-updating predicted self — weight, strength markers (e.g. squat × bodyweight), 5k time.
- **The knobs ARE the plan inputs** (days = trainable days, deficit = calorie target, mix = split shape); "let's go" drafts week 1 from the chosen future. The toy is the constraint-collection step.
- Goal-compound tradeoffs teach themselves: deficit up → strength curve visibly flattens (delivers the UX-v2 "make tradeoffs understood" decision visually).
- Guardrails: ranges not points ("172-178 lb at ~90% adherence"), coarse honest curves in v1; deficit slider clamped to healthy rates (ED-bait + garbage predictions otherwise).

**Home screen (2026-07-29):** Today, working assumption — Today-vs-feed is an A/B test candidate, final call deferred.

## Coach, notifications, body data, day view (Jake, 2026-07-31)

**Coach = the main point of contact for information entering the system.**
- Ingestion is coach-first: chats, conversations, the coach reaching out unprompted — plus easy manual screens (quick-input forms, barcode scan) for when typing beats talking. UI specifics deferred until Jake has the thing in his hands.
- **Coach is docked at the bottom of every screen except the feed.**

**Notifications:**
- Fully toggleable and configurable per user: some treat Cadence like their calendar and want notifs for everything; others only end-of-day, leave-for-the-gym, start-cooking. Easy preference surface.
- **Never uniform** — repeated identical notifs get ignored; phrasing varies nearly every time (coach-written, in the Cadence voice, referencing actual context).
- Quick to address: **more small notifs beats fewer heavy ones**; a notif should almost never demand real time or effort.
- **Popups follow the same principle** — quick, varied — and can be slightly more aggressive than notifs, but not much.

**Body data:**
- Import from Whoop (lib/whoop.ts integration already part-built), or prompt the user on a schedule; scheduled prompts go on the calendar.

**Day view = home screen:** metrics, the day's meals and workouts listed, performance metrics imported from Whoop. Calendar switches day ↔ week. 
**Screen map:** Feed, Nutrition, Journal, Workouts, Coach — coach docked bottom on all but Feed.

**Additional inputs (Jake, 2026-07-30):**
- **Injuries → recovery-aware programming:** stated at onboarding or reported anytime ("shoulder's been hurting") → the engine works around them (avoid/substitute aggravating movements — `variationOf` families give the swap space), deloads the affected area, and tracks the recovery arc back to full programming.
- **Supplements:** part of the nutrition picture — stack stated/logged (creatine, protein, vitamins), scheduled into the daily rhythm like foods, counted where they touch macros (protein powder). Flag: v2 = track what the user takes; *recommending* supplements is health-claim territory, needs its own decision.
- **Cuisines (maybe):** a palette dimension — cuisine preferences seed onboarding, steer invention and feed recommendations.

**Form reference videos (2026-07-30):**
- **Video → canonical exercise matching:** extraction pulls name + visible/spoken cues (equipment, movement); resolve via name/alias then LLM adjudication against corpus fields; match the variant, `variationOf` rolls up to the family; every match decision logged (training data, same rule as ingredient→product); below-threshold → user-custom exercise, never a forced match.
- **Approved form videos are global:** once a video is approved as a good form reference for an exercise, it's saved as a form reference for ALL users, not just the uploader. **Global promotion is post-v2** (2026-07-30): starts with human review, or ships only after the AI screen is evaluated against human judgments. In v2 videos stay personal-only.
- **Auto-clipping:** a video with talking/multiple exercises gets automatically clipped to the segment that demonstrates/shows/talks about form for that exercise; clips attach per-exercise. (Activates the per-exercise multi-clip item the video-extraction spec deferred.)

## UI direction (2026-07-30 — first pass)

- **Minimalist but capable. Sharp corners. Strong/powerful, not sterile.**
- **Palette decided (2026-07-30): lightish grey, black, off-white, matte forest green (the accent).**
- **Reference brands (Jake's picks):** Eight Sleep (premium tech-health tone, black-first), Equinox (monochrome luxury; B/W high-contrast photography treatment for feed/social content), Arc'teryx (technical monochrome, gear-grade seriousness).
- Implied system: dark-first palette, one sparing accent (the accent choice ≈ the brand — undecided), bold type over monochrome, data presented with technical precision.

**Ideas for later (not UX v2):**
- Self-filmed form review: user uploads video of themselves doing an exercise → vision model reviews against the exercise's formCues/commonMistakes. (Video-understanding quality + injury-advice liability need real thought first.)

**Parked for later (the docket):**
- Eating-style sense: the model develops a feel for health-focused eating variations (healthy, high-protein, low-cal, etc.) to inform invention/planning — worth doing, saved for later (2026-07-28).
- Travel/event weeks: user marks a week → choose deload or short hotel workouts for those days.
- Skip-pattern compromise: agent notices repeated skips → proposes a renegotiation ("looks like you don't like leg day — cut it to 2 exercises + a stretching cycle or stairmaster?").
- Planning + repair engine structure (prompts, exact engine architecture).
- ~~Exercise corpus `variationOf` linking pass~~ — done 2026-07-30, PR #32: 538 verified links (2-vote), 647 standalone, 156 disagreements left null (`data/corpus/shards/link-variations/disagreements.json`); the 740 unverified ad hoc links from the original generation were reset and replaced with evidence-backed ones.
