# System map

Say it in one sentence: one Next.js deploy writes every state change as a row in `events`, and every
screen reads a pure fold of that log.

## The stack

Next.js 15 App Router with React 19, TypeScript, deployed on Vercel. Persistence is libSQL through
`@libsql/client`: Turso in deploy, a local `file:local.db` in dev, an in-memory client in tests. The
Anthropic SDK powers recipe extraction and the coach. There is no separate backend and no CI
workflow in the repo.

## The event log

`lib/db.ts` defines the schema. `events` is the diary; every other user-data table is a cache or a
lookup, and `household_id` is on all of them from day one.

The envelope is frozen at v1:
```
{event_id, household_id, user_id?, type, ts, source, payload, schema_version, precision}
```

`lib/contracts.ts` declares 21 event types. The food loop uses `RecipeSaved`, `PantryAsserted`,
`OrderPlaced`, `PantryInflow`, and `RecipeCooked`. The rest cover planning, training, sleep,
recovery, goals, journaling, and the undo trail: `PreferenceSet`, `WeekPlanned`, `SuggestionMade`,
`SuggestionResolved`, `SchedulePlanned`, `SessionLogged`, `SleptLogged`, `JournalEntry`,
`SlotSkipped`, `RecoveryLogged`, `WorkoutSaved`, `SetLogged`, `GoalSet`, `ProgramSet`,
`LogRetracted`, `AutonomyRungSet`.

Two rules make the fold deterministic. `newEventId()` in `lib/events.ts` prefixes a base-36 timestamp
and a process-monotonic counter, so two events written in the same millisecond still sort in write
order. `byFoldOrder` sorts on `ts` then `event_id`, and every reader that resolves "latest" uses it.

`LogRetracted` is the undo trail. `retractedIds` and `dropRetracted` let a fold forget an event; the
event itself stays in the diary forever.

## The folds

`lib/` is the fold layer, one module per concern. Each one reads events and returns a view.

| Module | Folds into |
|---|---|
| `pantry.ts` | The pantry view. `rebuildPantry` is the only code that computes pantry state |
| `planner.ts`, `plan-pick.ts`, `schedule.ts` | The drafted week and the day schedule |
| `nutrition.ts`, `consumption.ts`, `fullness.ts`, `goals.ts` | Calorie budgets, intake, targets |
| `rails.ts`, `cart.ts`, `replenish.ts` | Orders and the grocery list. `listOrders` derives from the log; there is no orders table to drift |
| `program.ts`, `workouts.ts`, `recovery.ts`, `whoop.ts`, `whoop-ingest.ts` | Training, recovery, and the Whoop feed |
| `repair.ts`, `repair-score.ts`, `suggestions.ts`, `autonomy.ts` | Repair menus and the autonomy rungs |
| `reflect.ts`, `reflect-language.ts`, `history.ts` | The Sunday review and the diary read surfaces |
| `chat.ts` | The coach |
| `extract.ts` | Recipe extraction from a URL or a photo |

Three modules are writers rather than folds. `lib/logs.ts` is the one-tap log path: `parseLog`
validates and `recordLog` appends one typed event, one of `SessionLogged`, `SleptLogged`,
`SetLogged`, `JournalEntry`, or `SlotSkipped`, branching on `log.kind`. `lib/observe.ts` records
errors. `lib/site-gate.ts` decides what production serves.

## Writing to the log

A pantry-affecting write appends one event and replaces the view with the fold of the whole log,
in one transaction. Writers never duplicate the merge rules, so the view cannot drift from the log
through a partial write.

Concurrent writers would race read-fold-write and the loser's stale view would overwrite the
winner's. Writes chain behind an in-process mutex instead. The server is one process, so double-taps
and two open tabs serialize. Cross-process residue from parallel serverless instances is accepted for
phase 1: the log stays correct and any later write or rebuild heals the view.

## The route groups

`app/` has three groups plus the marketing surface.

| Group | Holds |
|---|---|
| `app/page.tsx`, `app/faq`, `app/waitlist` | The marketing funnel. The only thing production serves today |
| `app/(product)/` | The shipped app UI: `today`, `nutrition`, `coach`, `journal`, `feed`, `workouts`, `onboarding` |
| `app/(dev)/` | The phase-1 food-loop screens and the ops page: `recipes`, `week`, `cook/[id]`, `pantry`, `orders`, `dev/ops` |
| `app/api/` | 40 route handlers |

`instrumentation.ts` exports `onRequestError`, which writes every uncaught route or render error into
`error_events` with the route, the method, and the digest. It guards on
`process.env.NEXT_RUNTIME !== "nodejs"` so the edge bundle never resolves the database.

## The production gate

`middleware.ts` hides everything but the waitlist funnel. Development is never gated, and
`APP_PUBLIC=1` opens the whole app. Otherwise `lib/site-gate.ts` decides: `/`, `/faq`,
`/api/question`, `/api/analytics`, `/api/errors`, and anything under `/waitlist` or `/api/waitlist`
are public. Any other `/api/` path returns a 404 shaped as `{ok: false, reason: "not public"}`, and
any other page redirects to `/`.

The gate exists because the unfinished app pages write to the production database.

## What is and is not shipped

The backend is complete and headless (`specs/backend-complete.md`). The app UI shipped nutrition-only.
The coach is certified against `evals/report.md`. Nothing is deployed; there is no live URL.

`drafts/website/site/` holds four self-contained HTML pages, the shipped six-beat site. It is the
superseded design and the deployable fallback.

The three funnel pages, `/faq`, `/waitlist` and `/waitlist/thanks`, wear the rebuilt design language.
`app/funnel.css` carries the palette and `app/funnel-chrome.tsx` the nav and footer, with
`CaptureAttribution` mounted inside the nav; a nav rebuilt without it loses every campaign and every
test stays green. Both files retire when the main page is wired in. `app/landing.css` and
`app/site-chrome.tsx` style the v4 landing at `/` and nothing else.

The site's copy has one authority, `drafts/website/WEBSITE.md`. `lib/faq.ts` and `lib/survey.ts`
mirror its two locked decks, and `tests/deck.ts` reads the file so a sentence edited in one place
fails the suite.

Wiring the rebuilt main page into `app/` is pending. The gap it must close: the main page passes
`?cta=` in the URL and the app reads that name from session storage, so a click from the landing
records `waitlist-page` rather than the button that sent it. `bash scripts/preview-site.sh` serves
all four pages together in the meantime, behind `SITE_PREVIEW=1`.
