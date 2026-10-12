# Cadence

Cadence is a beta personal health OS: an event-sourced meal-planning and nutrition-tracking app that logs calories and macros, raises daily targets from measured activity, and folds WHOOP, Garmin, and MyFitnessPal into one diary.

**Status: beta.** The app runs locally. A production deploy serves the waitlist funnel until `APP_PUBLIC=1`. There is no public URL yet.

## Features

- **Meal planning.** Paste a recipe URL, including a TikTok or YouTube link read from its caption, or photograph a page. Extraction returns a structured recipe with estimated per-serving calories and macros. A deterministic composer drafts next week's meals and workouts from the cookbook, the training program, and the latest recovery score. The draft is a suggestion until you accept it.
- **Calorie and macro logging.** Extraction fills calories, protein, carbs, and fat. Cooking writes that snapshot onto the diary, so a later edit to the recipe leaves the cooked record alone. A MyFitnessPal sync imports each diary day (foods, totals, and that day's goals) as its own event. The daily budget sums meals cooked in Cadence. Imported diary days stay beside that budget, so a meal recorded in both places counts once.
- **Energy-aware daily targets.** Measured active calories raise that day's target above the stated goal. Movement under 50 kcal is ignored, and the added amount is capped at half the stated goal. A Garmin day total is used when it exists; otherwise the day uses the sum of its workout calories. The current week's envelope moves with the days that cleared the floor. Next week's draft still sizes meals to the stated goal.
- **One diary for three sources.** WHOOP, Garmin, and MyFitnessPal append to the same event log. Re-running a window leaves an unchanged record in place.
- **The rest of the loop.** Pantry and an in-store grocery checkoff, with an Instacart link-out when a key is set. Training logs and programs. A low recovery score can suggest easing a planned workout; applying that is a separate action. A device workout is stored as a loose session, so the planned slot stays yours to complete. A chat coach reads the diary and writes through the same event log.

Meals with no macro snapshot stay visible in the budget as unknown meals, and their calories stay out of the sum.

## Architecture

Every state change is an append-only row in `events`. Screens and API routes read pure folds of that log. `household_id` is on every user-data table.

The envelope is frozen at v1:

```text
{event_id, household_id, user_id?, type, ts, source, payload, schema_version, precision}
```

`lib/contracts.ts` is the catalog: 23 event types. `event_id` carries a time prefix and a process-monotonic counter, so two writes in the same millisecond still sort in write order. Folds order by `ts`, then `event_id`. Undo appends a `LogRetracted` row; the original event stays in the diary.

### Sync pipeline

WHOOP's official API is called from TypeScript (`lib/whoop.ts`, `lib/whoop-ingest.ts`). Tokens live in `wearable_tokens`. The access token refreshes when it is within 60 seconds of expiry, and once more after a 401. Refresh is single-writer, because WHOOP rotates the refresh token.

Garmin Connect and MyFitnessPal are fetched in Python (`integrations/`), where the maintained clients live. The CLI shells out to `scripts/ingest-external.ts`. Mapping is `lib/external-map.ts`. The writer is `lib/ingest.ts`.

| Source | Event | What is stored |
|---|---|---|
| WHOOP recovery | `RecoveryLogged` | score, HRV, resting heart rate |
| WHOOP sleep, Garmin sleep | `SleptLogged` | duration, and score or quality. A WHOOP nap is omitted |
| WHOOP workouts, Garmin activities | `SessionLogged` | type, duration, distance, calories, and average heart rate when the source sends them |
| WHOOP cycle | `ExertionLogged` | strain, kilojoules, average heart rate |
| Garmin day | `ExertionLogged` | steps, active and total kcal, body battery, acute training load |
| Garmin day | `RecoveryLogged` | HRV, resting heart rate |
| MyFitnessPal | `FoodLogged` | one event per diary day: entries, calorie and macro totals, goals |

Daily targets read active calories. That is Garmin's daily active kcal, or the sum of workout kcal on a day with no day summary. WHOOP cycle kilojoules are stored on `ExertionLogged` and left out of the target, because a cycle is most of the day's burn. `lib/energy.ts` is the only module that turns movement into a calorie target.

Recovery for a morning is merged field by field. A later Garmin HRV row fills HRV and resting heart rate beside a WHOOP score from the same date. A full WHOOP revision still replaces the score, HRV, and resting heart rate together.

Training load is read from the usual `acuteTrainingLoad` fields. A Garmin payload with a different shape is skipped.

### Idempotency

Identity is `payload.external_id`, for example `whoop:recovery:<cycle>`, `garmin:activity:<id>`, `garmin:exertion:<date>`, and `mfp:diary:YYYY-MM-DD`. `ingestMapped` reads the household log and compares the JSON payload for that id. An equal payload is skipped. A changed record is appended, and readers (`resolveRevisions`) keep the latest payload per id.

WHOOP, Garmin, and MyFitnessPal share one in-process chain, so a webhook and a manual sync cannot interleave the read-then-append. A duplicate that lands from another process is the same payload again; the fold still resolves to one record.

## Stack

- TypeScript, Next.js 15 (App Router), React 19. One app, intended for Vercel.
- Python 3 for the Garmin and MyFitnessPal fetch (`garminconnect`, `python-myfitnesspal`).
- libSQL via `@libsql/client`: Turso when `TURSO_DATABASE_URL` is set, `file:local.db` in local dev, in-memory in tests.
- Anthropic SDK for recipe extraction and the coach.
- Vitest for the TypeScript suite. Playwright for the browser evals.

## Setup

```bash
npm install
npm run dev    # http://localhost:3000
```

Local development is open; every screen is reachable. Put variables in `.env.local` (gitignored). Token files and cookie exports stay outside the repo. The defaults live under `~/.cadence/`.

| Variable | Used for |
|---|---|
| `ANTHROPIC_API_KEY` | Recipe extraction and the coach |
| `INSTACART_API_KEY` | Instacart Developer Platform link-out. In-store checkoff runs without it |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Deployed database. Dev uses `file:local.db` |
| `APP_PUBLIC` | `1` opens the full app in production. Otherwise production serves the waitlist |
| `APP_ORIGIN` | Public origin for OAuth redirects |
| `HOUSEHOLD_ID` | Sync CLIs. Default `hh-jake` |
| `HOUSEHOLD_TZ` | Local dates. Default `America/New_York` |
| `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET` | WHOOP OAuth. Without them the connect link stays hidden and the WHOOP routes return 503 |
| `GARMIN_EMAIL`, `GARMIN_PASSWORD` | First Garmin login, and any later login if the saved tokens are rejected |
| `GARMIN_MFA_CODE` | First login, when Garmin asks. Omit it to be prompted |
| `GARMINTOKENS` | Garmin token directory. Default `~/.cadence/garmin` |
| `MFP_COOKIE_PATH` | MyFitnessPal session cookies. Default `~/.cadence/mfp-cookies.json` |

### WHOOP

Create an app at [developer.whoop.com](https://developer.whoop.com) with scopes `offline read:recovery read:cycles read:workout read:sleep read:profile read:body_measurement`. Set the redirect to `http://localhost:3000/api/whoop/callback` for dev, and to `https://<host>/api/whoop/callback` for a deploy. Then open `/dev` and use **Connect Whoop** (the link is `/api/whoop/connect`).

```bash
npm run sync:whoop -- --days 2
npx tsx scripts/sync-whoop.ts --days 30
curl -X POST localhost:3000/api/whoop/sync -d '{"days":14}'
```

The CLI defaults to 2 days. The HTTP route defaults to 14. Both accept 1–366. For webhooks, point the WHOOP app at `https://<host>/api/whoop/webhook`. Deliveries are HMAC-verified, and the handler fetches the changed record in that request.

The token requests profile and body-measurement scopes. The diary stores recovery, sleep, workouts, and cycle strain.

### Garmin

This sync signs in as the owner through [garminconnect](https://github.com/cyberjunky/python-garminconnect). It is a personal import for one account.

```bash
python3 -m venv ~/.cadence/venv
~/.cadence/venv/bin/pip install -r integrations/requirements.txt
export GARMIN_EMAIL="you@example.com"
export GARMIN_PASSWORD="<password>"
export GARMINTOKENS="$HOME/.cadence/garmin"
python3 -m integrations sync --source garmin --days 14
```

The first successful login writes the token directory (`Garmin.login` then `client.dump`). Later runs reuse it. `garmin_tokens.json` is gitignored. A failed day call is stored as an error for that day and dropped when the events are mapped. The activities fetch has to succeed for the run to continue.

### MyFitnessPal

`python-myfitnesspal` reads a diary from a browser session. Export the site's cookies after you log in at myfitnesspal.com, as a JSON list outside the repo:

```json
[
  {"name": "__Secure-next-auth.session-token", "value": "<session token>", "domain": ".myfitnesspal.com"}
]
```

```bash
export MFP_COOKIE_PATH="$HOME/.cadence/mfp-cookies.json"
python3 -m integrations sync --source mfp --days 14
```

A day with food entries becomes one `FoodLogged` event (`mfp:diary:YYYY-MM-DD`). An empty day is left out. If Cloudflare rejects the client, the command exits and writes nothing for that run. `python3 -m integrations sync --print-only` prints the bundle and leaves the database alone.

All three sources, for the last 14 days:

```bash
npm run sync:health -- 14
```

## Tests

```bash
npm test
python3 -m unittest integrations.tests.test_fetch
```

`npm test` runs Vitest: units, folds, journeys, and route handlers, with no network. The Python module uses fake clients and does not call Garmin or MyFitnessPal.

Saved copies of third-party recipe and video pages are not in this repository. The extractor suites that read them skip when the files are absent, so a fresh clone still passes. See `tests/fixtures/README.md` to restore them locally.

Live checks stay opt-in:

```bash
RUN_INTEGRATION=1 ANTHROPIC_API_KEY=... npx vitest run tests/extract-eval.integration.test.ts
RUN_INTEGRATION=1 INSTACART_API_KEY=... npx vitest run tests/instacart.integration.test.ts
RUN_INTEGRATION=1 WHOOP_ACCESS_TOKEN=... npx vitest run tests/whoop.integration.test.ts
```

Browser and coach evals: `npm run eval:site`, `npm run eval:app`, `npm run eval:chat`. The runbook is `docs/runbooks/develop-and-verify.md`.

## Data

`data/corpus/ingredients.json` is USDA FoodData Central and is public domain (CC0). `data/corpus/products.json` is the Open Food Facts full export and is ODbL (Open Food Facts contributors, https://world.openfoodfacts.org, https://opendatacommons.org/licenses/odbl/1-0/). A user-facing surface built on the product file needs that attribution.

## Further reading

- `lib/contracts.ts` — event types and payloads
- `lib/energy.ts` — how movement changes a day's calorie target
- `docs/decisions/event-log-is-the-truth.md` — why every view is a fold of the log
- `docs/architecture/system-map.md` — routes, folds, and the production gate
- `docs/runbooks/develop-and-verify.md` — dev server, evals, and deploy
