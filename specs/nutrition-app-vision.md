# Vision: Cadence nutrition app

## Experience

Cadence is Jake's daily nutrition system. It turns the foods and recipes he already likes into two complete weeks of meals and snacks, a grocery list, and a living day plan. Jake can tell Cadence what he ate or what changed in one sentence. The diary records what happened, the plan adapts around real life, and every consequential change remains visible and reversible.

The coach is the fastest path through the product, not the only path. Every important action also has a direct control. The app is usable from a phone, remembers its state between sessions, and is private to Jake.

The marketing mockup guides visual tone and interaction quality. Shipping a coherent working product outranks visual polish.

## Why

Planning, logging, shopping, and adjusting food currently demand repeated manual work. Cadence removes that overhead without turning eating into constant calorie math or pretending uncertain food data is exact.

## Principles

- Plan the whole nutrition week, not isolated meals.
- Start from what Jake actually eats. Learn from explicit choices and history.
- Let one sentence do real work, then show the receipt.
- Suggest first. Jake approves consequential plan changes.
- Treat the diary as truth and every derived view as a rebuildable interpretation.
- Preserve uncertainty. Rough input produces rough estimates, not false precision.
- Keep calorie and macro information at the day level. Do not put calorie badges on meals.
- Infer pantry state only as a suggestion. Explicit user action establishes inventory truth.
- Make routine actions fast on a phone. Keep manual controls available.
- Prefer a reliable personal product now over a broad public platform later.

## Success

1. Jake completes nutrition-only onboarding in minutes, including goals, body basics, restrictions, normal foods, an adjustable calorie proposal, and a useful first plan.
2. The app maintains two fully specified Monday-start weeks with meals, snacks, approximate times, prep work, and Sunday reminting.
3. Jake can save food through a URL or video, photo, AI-assisted invention, barcode or product entry, and manual entry. Saved items retain their correct ingredient, product, snack, recipe, or meal identity.
4. Jake can log, correct, retract, or backfill food in natural language or with direct controls. The visible day and journal match durable diary events.
5. The plan responds safely to skipped meals, overages, eating out, schedule changes, and explicit preferences without imposing changes or punishing later days.
6. Groceries derive from the approved plan, round to buyable quantities, account for explicit pantry state, support checkoff and unplanned purchases, and deplete through cooking and eating.
7. The journal shows trustworthy history, trends, streaks, and a useful weekly review.
8. The coach answers from Jake's real data, distinguishes estimates from facts, cites grounded education sources, remains honest about scope, and never claims an action without a receipt.
9. Optional Whoop data improves sleep and expenditure context without blocking use when disconnected.
10. Jake can use the app privately from his phone across days. Data survives refreshes, restarts, and deployments.

## Failure

1. A polished shell hides missing or fake workflows.
2. The app drafts generic meals that ignore Jake's foods, restrictions, schedule, or history.
3. Chat gives advice but fails to perform requested actions, or claims writes that did not occur.
4. A plan change silently overwrites an approved week.
5. Logging, pantry, grocery, and plan views disagree about the same event.
6. Estimates appear exact or unsafe weight-loss targets are accepted.
7. Workout, social, commerce, or public-launch work delays the personal nutrition product.
8. A public route exposes Jake's nutrition data or lets another person write to his household.
9. Passing unit tests substitutes for using every core journey in the real app.

## Boundaries

- Nutrition only: onboarding, food library, two-week meal planning, logging, repair, groceries, pantry, cook mode, journal, coach, and optional wearable context.
- No workout-facing product, feed, social system, household planning, Stripe, paid subscriptions, supplement recommendations, or live grocery checkout.
- No public multi-user launch. The first release is a private single-household product for Jake.
- Compliant external rails only. No browser automation in product code.
- Existing marketing work remains intact unless app access requires a narrowly scoped route change.
- Visual redesign is out of scope. Reuse existing product styles and the mockup's direction where a missing surface needs presentation.

## Demonstration

From a clean private deployment on Jake's phone: finish onboarding, import a recipe, approve two weeks, move and swap meals, log an off-plan restaurant meal in chat, approve the repair, generate and check off groceries, cook a meal, correct the log, undo it, inspect the journal, refresh, and confirm every state and receipt persists.
