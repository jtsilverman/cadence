# Marketing & waitlist plan (v1, 2026-08-02)

The live plan for the sell-first validation push, narrowed to nutrition-only. Actions align to this doc; progress is tracked here.

## The product we're selling

All-in-one **nutrition** platform: recipe ingestion from any URL or TikTok → adaptive meal scheduling → drafted shopping list → calorie/macro tracking, in one loop. Workouts, wearables, and coach are NOT in the pitch; they're expansion probes in the survey.

## Positioning (grounded in 2026-08-02 competitive research)

- **The white space:** no competitor pairs broad recipe import (URL + video) with real multi-retailer grocery checkout. Import-strong apps (Paprika, Plan to Eat) have zero delivery; delivery-strong apps (MFP Premium+, eMeals, Mealime) only plan from their own closed recipe libraries. Samsung Food is the closest single contender (video import + real Instacart checkout) but has a quantity-less pantry and inconsistently-reliable video import.
- **Sell against the drudgery, not against MFP.** The enemy is the manual relay: find a recipe on TikTok → retype ingredients into Notes → rebuild the list in Instacart → log it again in MFP. Four apps, one meal.
- **Message spine (SUPERSEDED 2026-08-12):** end-to-end *grocery → recipe → plan → consumption*. Candidate hooks (A/B via the hero-variant instrument):
  1. Outcome: "Never think about what's for dinner again."
  2. Magic moment: "Paste any recipe — even a TikTok — and get your week planned and your groceries listed."
  3. Anti-drudgery: "You found the recipe. Why are you still typing the grocery list?"
- **Message spine (LIVE, 2026-08-12): follow-through.** Thesis: "Cadence fits the meal plan to your life, not your life to the meal plan." Hero: "Take control of how you eat, without it taking control of your life." The three hooks above sold the pipeline; the reposition sells the recovery from a broken week, which is what the audience research says people quit over. Full deck and the audience in `drafts/website/WEBSITE.md`. **"Diet" is retired from all copy, and GLP-1 drugs appear in channels and the FAQ only, never in a headline.**
- **Pantry stance:** suggest-only, human-confirmed (product rule). Plan to Eat built auto-deduction and killed it in production for silent desync — we market "a pantry that asks, never guesses" if pantry comes up at all.

## Funnel + instrument (already built)

visitor → landing (UTM + hero variant recorded) → email capture → post-signup survey → call opt-in. Attribution chain shipped in `77dcc52`, `d4cd85d`, `4e13058`. Workstream 1 rewrites copy + survey content; the instrument itself doesn't change.

**State correction (2026-08-10):** the attribution chain above lives in the Next.js pages, which the board-direction site (`drafts/website/site/`, PRs #37/#38/#42) superseded. The board site locks a single hero (no A/B variants; copy locked in `drafts/website/HANDOFF.md`) and its HTML captures only `cta`. The wiring task (site/ → app/) must port UTM+cta attribution, or channel scoring breaks. Hero A/B is retired with the old landing; channel and campaign remain the measured axes.

## Survey design (the milestone asset)

Goal: find the problem to solve and the expansion features with real pull. Max 4 questions + opt-in; single-pick where scarcity forces honesty.

- **Q1 — the pain (single-pick + other):** "What's the hardest part of eating the way you want?" — deciding what to eat each day / finding time to plan and shop / sticking to calories or macros / recipes scattered across apps and screenshots / buying food that goes to waste / other (text).
- **Q2 — current stack + what's broken (multi-pick + optional text):** "What do you use today?" — MyFitnessPal or similar tracker / a meal-planning app / notes app or spreadsheet / paper / meal-kit or delivery service / nothing. Optional text: "What made you stop using something you tried?"
- **Q3 — expansion pull (pick up to 2):** "Which of these would you want alongside it?" — wearable sync to tune daily calories / workout planning that informs your diet / an AI coach that checks in and adjusts / household or family sharing / none, just the food part.
- **Q4 — commitment signal (single-pick):** "If this worked as described, what's it worth monthly?" — $0, I'd only use it free / ~$5 / ~$10 / ~$15+. (Moves us up the signal ladder from bare waitlist toward waitlist+cost.)
- **Opt-in:** 15-minute call checkbox (exists).

## Workstreams

1. **Reposition the landing** — nutrition-only copy, new hooks as hero variants, survey updated to the set above. Status: **built 2026-08-02** (hero A/B outcome/magic/drudgery, survey v2 with tools/features/price columns, live-verified end to end).
2. **Demo asset** — animated product mock on the landing page itself (no real UI exists; no fake screen-recordings). Reusable as vertical video for channels. Status: **built 2026-08-02** (`DemoLoop`, #demo section, labeled concept preview).
3. **Organic seeding** — Reddit (r/MealPrepSunday, r/mealprep, r/EatCheapAndHealthy, r/mealplanning), meal-prep FB groups, X build-in-public, Betalist + waitlist directories, Product Hunt "coming soon". Every link UTM-tagged `utm_source=<channel>&utm_campaign=<post-id>`. Participate-then-post on Reddit. Status: drafts in `drafts/marketing-posts.md`; Jake gave the go 2026-08-10; blocked on the live site URL for final links.
   3b. **Build-in-public series** — Jake's personal X account documents the build (struggles, decisions, weekly public funnel numbers). Episode map + first three threads drafted 2026-08-10 in `drafts/build-in-public.md`. Own UTM campaign (`x-bip-<n>`) so the builder channel is scored separately from the buyer channels.
4. **Paid smoke test** — OFF for now (Jake 2026-08-02: no ad budget). Organic-only; revisit if organic stalls below thresholds.
5. **Measurement + interviews** — weekly readout (channel → variant → survey picks); call opt-ins → 5-8 interviews. Continuous.

## Milestone + pass/fail thresholds

**Next milestone: a filled survey pipeline.** Targets (30 days from page relaunch): ≥200 signups with completed surveys, visitor→signup ≥5%, survey completion ≥60% of signups, ≥10 call opt-ins. Below half of any target = the pitch or channel mix is wrong; iterate hooks before spending more.

## Decisions (settled 2026-08-02)

- Paid budget: none for now; organic-only.
- Posting identity: hybrid — Jake's name on Reddit/X (first-person builder voice), Cadence brand on Betalist/Product Hunt listings.
- Survey Q4 ladder: keep $0/$5/$10/$15+. Purpose is willingness-to-pay EVIDENCE, not revenue (passion project for now); actual pricing decided later, if ever.
