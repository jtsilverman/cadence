# Build-in-public series (workstream 3b)

Jake's personal X account documents the build: struggles, fixes, thought process, then public
funnel numbers. Own channel, own measurement: every link carries
`?utm_source=x&utm_medium=social&utm_campaign=x-bip-<n>`. Replace `{SITE}` with the live URL
before anything posts. Nothing posts without Jake's go, per post.

## Why this channel exists

The series reaches builders, and builders are mostly not meal-prep buyers. The series earns
credibility, Product Hunt launch-day support, and a slow trickle of signups. Reddit carries the
volume push (drafts in `marketing-posts.md`). The UTM split proves or kills this assumption
within a month.

## Voice and rules

- First person, specific, numbers and dates from the record. No hype words, no growth-bro cadence.
- Credibility rules from the site apply: no fabricated numbers, no invented struggles, no
  "join 500 others."
- The pitch stays nutrition-only. The wider build (workouts, wearables, coach) appears only as
  history in the scope-cut story, never as a promise.
- Public numbers posts state real counts, including bad ones. A flat week gets posted flat.

## Cadence

Two or three threads per week. Thread 1 posts on directory-launch day. The numbers post repeats
weekly from week 1, same day each week.

## Episode map (every beat cites a real artifact)

| # | Beat | Source of record |
|---|------|------------------|
| 1 | Launch: what Cadence is, why, the bet | `marketing-plan.md` positioning |
| 2 | The manual relay: four apps, one meal | PRODUCT.md, competitive research 2026-08-02 |
| 3 | I built too much: 5-pillar health OS backend in 17 days, then cut the pitch to nutrition-only | PR #1-#43, ux.md rescope 2026-08-06 |
| 4 | Sell-first: landing + survey before designing the app | `marketing-plan.md` |
| 5 | I scrapped my own landing page: v3 board read as AI-generated; rebuilt on a studied anatomy | site-map.md 2026-08-03, specs/landing-v4.md |
| 6 | Killing the mascot: added "Cade," reversed it | CLAUDE.md lesson (v3.1 -> v3.2) |
| 7 | The calorie-badge test: 5/6 reviewers read per-meal kcal as "MyFitnessPal with nicer fonts" | CLAUDE.md lesson, persona panel |
| 8 | Paywall surprise: NYT ships full recipes in public JSON-LD | fixture fix `047b702` |
| 9 | Data grind: Open Food Facts API 503s; the CSV export and popularity ranking | CLAUDE.md lesson |
| 10 | Certifying the chat coach: 198 scenarios, safety 100%, 12 hard fails triaged | evals/report.md, PR #43 |
| 11 | Weekly numbers: visitors, signups, survey picks, per channel | funnel DB, repeats weekly |
| 12 | (Jake's call) The workflow: spec -> contract -> TDD build with Claude Code | kernel docs |

## Thread 1 — launch — `utm_campaign=x-bip-1`

1/ I spent 17 days building an agentic nutrition engine. Now I'm proving anyone wants it before
designing the app. Public numbers as they come, starting at zero.

2/ The bet: nobody wants to "move their food life into an app." People want tonight's dinner
decided, the list written, the macros counted, without doing it three times in three apps.

3/ The relay I'm killing: find a recipe on TikTok, retype it into Notes, rebuild the list in
Instacart, log it again in MyFitnessPal. Four apps, one meal.

4/ I researched 10 competitors. The apps that import any recipe can't order groceries. The apps
that order groceries only cook from their own libraries. Nobody closes the loop. [matrix screenshot]

5/ The landing page is live with three hooks under A/B. The survey asks the one question that
matters: what made you quit the last app. {SITE}?utm_source=x&utm_medium=social&utm_campaign=x-bip-1

## Thread 2 — the scope cut — `utm_campaign=x-bip-2`

1/ I built too much. 43 PRs in 17 days: recipe ingest from any URL or TikTok, meal planning,
pantry, shopping lists, a workout engine, Whoop ingest, a coach. Full backend, zero UI.

2/ Then I cut the pitch to food only. Workouts, wearables, the coach: built, tested, and out of
the pitch.

3/ Why: a pitch that says "everything" tests nothing. If the food loop alone doesn't pull
signups, the rest is decoration. If it does, the survey tells me what to add next.

4/ The cut features became survey questions instead of promises. "Which of these would you want
alongside it?" is data. A feature grid is a wish.

5/ Signups since launch: [real number]. The survey link:
{SITE}?utm_source=x&utm_medium=social&utm_campaign=x-bip-2

## Thread 3 — the landing page I scrapped — `utm_campaign=x-bip-3`

1/ I shipped a landing page, stared at it for a day, and deleted it. It had an animated week
board, crossfading hero cards, hotspots. It read as AI-generated. Because it was.

2/ The tell: motion everywhere, hierarchy nowhere. Every section shouted. Nothing told you where
to look next.

3/ The fix was studying one page I admire and transplanting its anatomy: band rhythm, one idea
per band, motion only where a state changes. Copy first, form second.

4/ Rules I wrote down after: no fabricated stats, no count-up animations, no testimonials before
launch, no fake footer links. A pre-launch page earns trust by refusing to fake proof.

5/ The rebuilt page: {SITE}?utm_source=x&utm_medium=social&utm_campaign=x-bip-3

## Weekly numbers post template — `utm_campaign=x-bip-w<week>`

Week <n> of selling before building the app.
Visitors: <n>. Signups: <n> (<rate>%). Surveys completed: <n>.
Top pain picked: "<option>". Top channel: <channel>.
What I'm changing because of it: <one line>.
{SITE}?utm_source=x&utm_medium=social&utm_campaign=x-bip-w<n>

## Holdbacks

1. Episode 12 (the AI-workflow story) posts only on Jake's explicit call. It changes how the
   product reads and invites "AI slop" replies on every later post.
2. No thread promises a ship date.
3. Screenshots come from the live site or the real repo. No mocked terminal screenshots.
