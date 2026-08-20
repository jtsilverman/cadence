# Product: cadence — the personal health OS

**Status: ROUGH DRAFT v1 (2026-07-27).** Vision locked 2026-07-24 (all-in-one is the product, food is the wedge). Since then the entire backend shipped headless (specs/backend-complete.md, PRs #20-26): the Nourish/Train/Recover/Reflect data + intelligence layers below exist as APIs and tests; screens beyond phase 1 do not. This file stays the what-and-why; new visions get proposed on this baseline.

## North star

One app, one agent, for the whole physical life: what you eat, how you move, how you recover, how you feel. Content from anywhere becomes action with near-zero friction: a TikTok recipe becomes groceries at your door; a workout video becomes this week's training plan; your Whoop recovery becomes tonight's dinner and tomorrow's session. The agent plans the week, you approve once, the system executes, tracks, and adapts.

The unlock is one engine applied everywhere: **ingest** (any video/URL/text → structured plan) → **execute** (order the food, schedule the session) → **track** (pantry, logs, biometrics) → **adapt** (preferences, consumption, recovery). Every pillar is that same loop pointed at a different part of your health.

## Product pillars

### 1. Nourish (food)
- **Intake:** paste or share any recipe (site URL, TikTok/IG/YouTube video, chat message, photo of a cookbook page). Extraction produces structured recipes: ingredients (name/qty/unit), steps, time, servings, nutrition estimate. Original video stays embedded (oEmbed) for cooking along.
- **Cook:** distilled, presentable instructions. A 40-second chaotic TikTok or a 2,000-word blog post becomes clean numbered steps with timing, scaled to servings, in a kitchen-usable cook mode (big type, step-at-a-time, timers), source video embedded beside the step it demonstrates.
- **Meal planning:** the week's meals classified by mode: standard meal-prep staples (batch-cooked, auto-replenished), special meals (new recipes, occasions), and eating-out days (no order, pantry untouched, macros still counted). The plan drives the order; modes drive quantities.
- **Pantry:** living inventory. Inflow from orders placed through the app; outflow from "I made this" decrements and consumption inference. Suggest-only: the agent proposes ("probably low on olive oil?"), asks when unclear, never silently asserts. Expiry awareness ("use the spinach by Thursday") makes it daily-relevant between orders.
- **Ordering — or shopping:** multi-recipe selection → aggregated shopping list → pantry diff → then the user's choice per week: a **smart in-store shopping list first** (the primary mode: brand/size preferences on every line, replenishment suggestions, checkoff run recorded as a real order) or a cart on a compliant rail when one is keyed (Instacart shoppable link parked pending IDP access; Kroger cart-write later; ACP when it opens) — the in-store list is also the **store-specific list** (organized by store layout/preferred store, shaped by preferences, avoid-lists, macro priorities) with aisle checkoff feeding the same pantry inflow. Substitutions and brand choices escalate to the user until learned. In-store mode means the core loop works with zero third-party approvals.
- **Nutrition:** every recipe and order maps to macros/micros (USDA FoodData Central). Preference profile constrains everything: avoid-list ingredients, allergies, brands, macro min/max targets, budget ceiling.

### 2. Train (movement)
- **Intake:** share a workout video → structured workout (exercises, sets/reps/tempo, muscle groups, equipment). Same extraction engine as recipes. Original video embedded as form reference at the exercise it demonstrates.
- **Plan:** workouts compose into a week plan with progression (weight/rep targets from history). The agent drafts, the user approves, same autonomy ladder as carts.
- **Session freedom:** a "session" is anything the user counts: lifting, runs, yoga classes, group classes, sauna, ice bath, hot tub, mobility. Structured sessions get progression; loose sessions just get logged and counted (they still inform recovery and the schedule). The user trains how they want; the system adapts to it rather than prescribing a modality.
- **Log:** in-workout tracking (weight, reps, RPE) for structured sessions; one-tap log for classes and recovery sessions. History drives progression and feeds the graph.

### 3. Recover (body signal)
- Wearable integrations: Whoop developer API, Garmin Health, Oura (or Terra/Spike aggregator to normalize all three). Read-only: sleep, HRV, recovery/readiness, strain, steps.
- Recovery tunes the other pillars: low readiness → agent proposes a lighter session and higher-protein dinner; a hard training block → grocery order shifts before the week starts.

### 4. Reflect (mind)
- Journaling prompts tied to real events ("first week hitting protein targets — how do you feel?"), mood tracking, meditation content. Deliberately last: it needs the other pillars' context to be more than a notes app. Not built until Nourish + Train + Recover are live.

### 5. The Graph (the spine, not a feature)
Cross-pillar data no point solution or platform can assemble:
- **Preference profile:** brands, avoid-lists, macro targets, budget, equipment owned, training style. Explicit, user-editable, day-1.
- **Behavior history:** every order (cross-store), every cooked recipe, every logged set, every approval/override of an agent suggestion. Overrides are training data.
- **Consumption model:** learned run-rates per pantry item. The hard research problem; suggest-only posture makes wrong guesses cheap.
- **Body signal:** wearable timeline joined against food and training events.

The agent sits on the graph. One assistant, not four: "plan my week" draws on all pillars at once. Autonomy ladder governs every action with a real-world side effect: review-everything → one-tap approve → auto-handle staples/routine sessions → full auto. Users climb by choice; trust is earned per action type.

**The Schedule** is the agent's output surface: one unified week calendar holding meals (prep/special/out), workouts, sleep targets, meditation/journaling slots, and the grocery order timed so ingredients arrive before they're needed. (v0 shipped thin 2026-07-26: loose-per-day slot grid + typed logs + list-from-plan, no agent composition yet — specs/schedule-spine.md.) Reminders flow from it ("prep day tomorrow, cart closes tonight"). Every pillar writes candidate entries; the agent composes them against wearable recovery and user constraints; the user approves the week in one pass.

## Why all-in-one, why now

- Every competitor owns a segment; switching between five apps means the data never joins, so none of them can do "recovery-aware dinner" or "pantry-aware meal plan tuned to your macros." The joined graph is the product.
- Newly feasible: LLM extraction makes arbitrary-video → structured plan cheap (was a research problem in 2022); agentic commerce rails are appearing (Instacart links today, ACP tomorrow); wearable APIs are open and mature.
- All-in-one failed historically because each pillar demanded a dedicated team. An agent-first architecture collapses that: one extraction engine, one graph, one assistant, thin pillar UIs.

## Market (researched 2026-07-24, sources in specs/recipe-groceries-mvp.md)

Per pillar, all segment-bound:
- **Video→recipe:** Peel, FoodiePrep, ReciMe, Recipe One. Stop at shopping lists. FoodiePrep closest (agentic assistant + lists), no ordering, no pantry truth, no health data.
- **Pantry:** Cooklist (loyalty-card import, agentic shopping at Kroger/Wegmans), KitchenPal, PantryLink. Inventory decays; none learn consumption credibly.
- **Recipe→list→store:** Samsung Food (free, preinstalled, Walmart/Amazon/Instacart handoff). Distribution king of the shallow version.
- **Instacart itself:** Immersive Feed (in-app recipe video), Cart Assistant (AI meal planning), Smart Shop, creator-gated shoppable TikToks, Instant Checkout inside ChatGPT. Building our intake layer natively, for their marketplace only.
- **Health/planning:** Vora (500+ integrations, meditation, nutrition), Pivot (WHOOP→meal plans+grocery list), Bevel, Centr. Vibe-coded point solutions; none close the commerce loop; none ingest arbitrary content.
- **Training:** Hevy/Strong (logging), Fitbod (generated plans), creator apps (fixed programs). None ingest videos, none join food or recovery.

Rails (verified): Instacart Developer Platform = shoppable-link generator only, no cart-write/checkout, dev key immediate, production key ~30-40-day business-gated approval, affiliate via Impact.com. Kroger = only self-serve cart-write (`cart.basic:write` OAuth), no checkout. No compliant third-party full checkout exists (Instacart-via-ChatGPT ACP is OpenAI-surface-only today). Browser automation = ToS-dead as product core.

## Moat

1. The joined graph (preferences × purchases × consumption × training × recovery). Accrues passively from using any one pillar; compounds across pillars. Instacart can't see the Costco run, the pantry, the Whoop, or what got cooked. Whoop can't see the groceries. TikTok can't see any of it.
2. Cross-store, cross-platform position: we're the user's layer, not a rail's feature.
3. Override-trained personalization: every "no, this brand / lighter session / not that substitute" is labeled training data competitors don't collect.

What is NOT the moat: any single pillar's features. Each is copyable in isolation; the join is not.

Evidence check (2026-07-25, IDP partner research): the pantry gap is verified, not hypothesized. No Instacart partner keeps a persistent pantry that reconciles against shopping lists — Instacart's own pantry feature is a stateless per-page checkbox (off by default), Samsung Food's is manual + paid and doesn't subtract, and Jow's top review complaint is "it puts everything in my cart assuming you have nothing at home." The join starts at a gap the incumbents demonstrably haven't closed.

## Design stances (locked)

- **Import from social first; social features later, on our own terms.** Early phases embed originals (oEmbed) and ride TikTok/YouTube distribution; we don't fight them for short-video attention. Late-phase social is Strava-shaped: share workouts and meal plans, connect with friends, streaks and milestones ("3 weeks on plan"), and creator profiles as a natural reach surface for influencers. Community around accomplishment and plans, not a content-feed war.
- **One agent, not four bots.** Pillars are views over one graph and one assistant.
- **Matching is modeled, learned, escalated.** Low confidence raises a choice to the user; choices persist to the profile.
- **Pantry and inference are suggest-only.** Usefully wrong beats confidently wrong; only explicit user action asserts truth.
- **Autonomy ladder everywhere** a real-world side effect exists (money spent, plan changed).
- **Compliant rails only.** Official APIs. Video extraction rides the same gray zone as every recipe-saver (facts aren't copyrightable; process captions/metadata; user-initiated; never re-host).
- **Household-first schema** (`household_id` day 1). Groceries are shared even when training isn't.
- **Web-first, share-sheet honest.** Real intake happens on the phone. iOS Shortcut bridge arrives phase 2, Expo wrapper once intake habit is proven.

## Leverage vs build

| Area | Leverage (official, legal) | Build |
|---|---|---|
| Ordering | Instacart IDP, Kroger public API, ACP when open | cart aggregation/diff, substitution flow, autonomy ladder |
| Extraction | Claude API | the pipeline: video/URL/photo → structured recipe/workout, eval sets per source |
| Nutrition | USDA FoodData Central, Open Food Facts, Edamam/Spoonacular if licensed | recipe→macro mapping, preference constraints |
| Pantry | — (nothing exists worth using) | inventory model, consumption inference, expiry hooks |
| Wearables | Whoop dev API, Garmin Health, Oura; Terra/Spike aggregator | recovery→plan tuning rules |
| Exercise data | wger, free-exercise-db | video→workout structuring, progression engine, logging UX |
| Video display | TikTok/YouTube oEmbed | — |
| Infra | Vercel, Turso, Stripe (later), Expo (later) | — |

## Phases

Sequencing principle: food first because it has the strongest wedge (real weekly pain, money moves, data pump starts), then widen. Each phase ships a usable product, not a layer of one.

- **Phase 1 — Food loop MVP** (shipped): URL → ingredients → pantry diff → shopping list (in-store run primary; Instacart link behind key) → orders/cooking feed pantry. Single household, no accounts. Instacart production application parked pending IDP access.
- **Phase 2 — Intake expansion:** TikTok/IG/YouTube video extraction, iOS Shortcut share-sheet bridge, embedded originals, photo-of-cookbook intake.
- **Phase 3 — The graph v1:** preference profile UI, matching learning loop, consumption inference v1 (suggest-only replenishment), expiry/waste hooks, nutrition mapping.
- **Phase 4 — Rails + accounts:** auth, households, Kroger cart-write rail, subscription billing (Stripe), affiliate wiring, ACP adoption when third-party callable.
- **Phase 5 — Train:** workout-video ingestion, week plans with progression, logging, form-help embeds. Same engine, second vertical lights up.
- **Phase 6 — Recover:** Whoop/Garmin/Oura in; recovery-aware meal + training tuning. The cross-pillar magic becomes visible here; this is the all-in-one proof moment. (Ingest v0 shipped thin 2026-07-26, Whoop direct: OAuth + webhooks + sync → typed events, recovery visible on the schedule read — specs/wearable-ingest.md. Garmin blocked upstream; P6 keeps the tuning intelligence.)
- **Phase 7 — Reflect:** journaling/mood/meditation, contextualized by the graph.
- **Phase 8 — Social:** Strava-shaped activity feed across all pillars: "cooked a new recipe", "completed week 6 of the strength block", "journaled 7 days straight". Posts are accomplishments derived from the event diary (auto-composed, user approves what's shared), not created content: no upload-video-to-us feed, so no TikTok war. The differentiated mechanic is **take**: anything in a friend's or creator's post (a meal, a snack, an exercise, a whole workout, a journaling prompt) is one tap from their post into your library and your draft week, with provenance credited. Friends, streaks, milestone moments, creator profiles as reach surface. Network effect on top of the graph: the more people share, the better everyone's library. Only after the single-player product retains.
- **Unscheduled:** Expo native app, store-agnostic price-optimized ordering (aggregator endgame).

Deferred deliberately: marketing, design language, naming (nothing blocks until Phase 1 unit 7).

## Business model (hypothesis, validated by shipping Phase 4)

Consumer subscription (~$8-12/mo) gated on the graph features (consumption learning, recovery-aware planning, household sync); the basic recipe→cart flow stays free as the acquisition wedge. Instacart affiliate (Impact.com) as secondary revenue on orders we drive. No ads, no data resale, ever: the graph being private is the trust that makes full-auto ordering possible.

## Hard problems, triaged

- **True research problem:** consumption inference. Mitigated by suggest-only posture; compounds with usage; product works without it being great.
- **Forever-grind:** ingredient→product matching (and its Phase-5 twin, video→correct exercise structure). Eval sets + override learning; never "done."
- **External gates:** Instacart production approval (business entity, ~30-40 days, no individual path documented); TikTok extraction gray zone (platform enforcement risk, not courtroom risk); Garmin API business application.
- **Scope gravity:** all-in-one vision + solo builder = the phase discipline IS the survival mechanism. One vertical ships before the next lights up. Everything else is a decision, not a risk.
