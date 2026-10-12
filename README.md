# cadence

Any recipe anywhere, then groceries at your door, then a pantry that learns how you eat. The same
engine points at training, recovery, and reflection.

**Status: in development.** The phase-1 food loop runs end to end with screens. The backend for
everything else is complete and headless. 679 tests pass on a fresh clone.

Tracks calories and macros without making you enter every ingredient, and repairs the plan when you
deviate from it.

This repo today: the phase-1 food loop with screens (paste a URL → structured recipe → weekly list minus pantry → in-store checkoff run → cook and the pantry moves), plus the full **headless backend** for everything else (specs/backend-complete.md): workout-video extraction, programs + progression, the 4-lane drafted week, calorie budgets, repair menus, undo, the Sunday review. 21 event types, one append-only diary, every view a fold. Full event catalog: `drafts/DATAFLOW.md`.

Rough-draft product docs (baseline as of 2026-07-27, being revised): `drafts/PRODUCT.md` · `drafts/UX.md` · `drafts/WORKPLAN.md` · `drafts/DATAFLOW.md`.

## Stack

Next.js App Router (single deploy surface, Vercel), libSQL/Turso, Claude Haiku for recipe extraction, the in-store run as the primary order rail (Instacart Developer Platform link-out behind a key). Event-sourced: every state change is one row in the `events` table; the pantry view is a cache rebuilt from the log.

## Run

```bash
npm install
npm run dev            # http://localhost:3000, local file db (local.db)
npx vitest run         # 679 tests
```

**Page fixtures are not in this repository.** They are saved copies of third-party recipe and video
pages, and redistributing them verbatim is a copyright question this repo has no need to own. The
four extractor suites that read them skip when they are absent, so a fresh clone runs green. See
`tests/fixtures/README.md` to restore them locally.

**Data licensing.** `data/corpus/ingredients.json` comes from USDA FoodData Central and is public
domain (CC0). `data/corpus/products.json` comes from the Open Food Facts full export and is ODbL:
Open Food Facts contributors, https://world.openfoodfacts.org, license
https://opendatacommons.org/licenses/odbl/1-0/. Attribution is required in any user-facing surface
built on that data.

Env (`.env.local`):

- `ANTHROPIC_API_KEY` — recipe extraction (required for /recipes/new).
- `INSTACART_API_KEY` — IDP dev key; without it the Order button 503s and the in-store flow still closes the loop.
- `TURSO_DATABASE_URL` + `TURSO_AUTH_TOKEN` — deploy only; local dev falls back to `file:local.db`.
- `WHOOP_CLIENT_ID` + `WHOOP_CLIENT_SECRET` — Whoop integration; without them the connect link is hidden and the whoop routes 503.
- `HOUSEHOLD_ID` — optional; sync CLIs default to `hh-jake`.
- `GARMIN_EMAIL`, `GARMIN_PASSWORD`, `GARMIN_MFA_CODE`, `GARMINTOKENS` — Garmin Connect sync. See below. Tokens never go in the repo.
- `MFP_COOKIE_PATH` — MyFitnessPal session cookies. Password login no longer works.

## Health data (Whoop, Garmin, MyFitnessPal)

Cadence is the TypeScript app. Whoop's official API is called from that app. Garmin Connect and MyFitnessPal only have maintained Python clients, so `integrations/` fetches those two and `scripts/ingest-external.ts` writes the same event log. Re-running a window does not duplicate rows: each record has an `external_id`, an unchanged payload is skipped, and a changed one is appended. Readers keep the latest payload per id.

Measured **active** calories (Garmin's daily active kcal, or the sum of workout kcal when a day summary is missing) raise that day's calorie target, capped at half the stated goal and ignoring anything under 50 kcal. Whoop cycle kilojoules are stored but not added — a cycle is most of the day's burn, not the workout. MyFitnessPal meals are `FoodLogged` events and stay out of the cooked-meal budget, so a meal logged in both places is not counted twice. Recovery scores already ease a planned workout on a red morning; Garmin HRV fills in beside a Whoop score instead of replacing it.

```bash
npm run sync:whoop -- --days 2          # recent Whoop window
npx tsx scripts/sync-whoop.ts --days 30 # backfill
python3 -m integrations sync --days 2   # Garmin + MyFitnessPal
python3 -m integrations sync --source garmin --days 30
bash scripts/sync-health.sh 14          # all three
```

Python deps (a venv outside the repo is fine): `pip install -r integrations/requirements.txt`.

### Whoop

One-time setup (self-serve): [developer.whoop.com](https://developer.whoop.com) →
create an app → scopes `offline read:recovery read:cycles read:workout read:sleep read:profile read:body_measurement` → redirect URI
`https://<your-app-host>/api/whoop/callback` (plus `http://localhost:3000/api/whoop/callback`
for dev) → paste client id/secret into env. Then tap **Connect Whoop** on the home page.
The client refreshes the access token when it is about to expire, and again once on a 401. Whoop rotates the refresh token; refresh is single-writer so two callers cannot burn it.

What lands: recovery (score, HRV, resting HR) → `RecoveryLogged`; sleep → `SleptLogged`; workouts (sport, duration, distance, kcal, HR when Whoop sends them) → `SessionLogged`; cycle strain → `ExertionLogged`.

- Webhooks (prod only — needs a public URL): point the app's webhook URL at
  `https://<your-app-host>/api/whoop/webhook`; deliveries are HMAC-verified and fetch the
  changed record in-request. Sleep marks that night's sleep slot done; workouts land as
  loose sessions and do not complete a planned workout; recovery decorates the schedule
  (`advice: "ease"` on red-zone days with a planned workout).
- Backfill / local dev: `curl -X POST localhost:3000/api/whoop/sync -d '{"days":14}'` or
  `npx tsx scripts/sync-whoop.ts --days 14`. The HTTP route defaults to 14 days. The CLI
  defaults to 2. Both accept 1–366.

### Garmin Connect

Garmin's developer program is not a self-serve path for this account. The sync uses
[garminconnect](https://github.com/cyberjunky/python-garminconnect) against the owner's own login. It is a personal import, not a multi-user product rail.

```bash
export GARMIN_EMAIL="you@example.com"
export GARMIN_PASSWORD="..."          # only needed for the first login, and if the token store is rejected
export GARMIN_MFA_CODE="123456"       # only the first login, if Garmin asks; omit it to be prompted
export GARMINTOKENS="$HOME/.cadence/garmin"   # default. A directory outside the repo.
python3 -m integrations sync --source garmin --days 14
```

The first successful login calls `Garmin(...).login(tokenstore)` and `client.dump(path)`. Later runs reuse that directory and do not need the password or an MFA code. The file inside it (`garmin_tokens.json`) is gitignored.

Each day in the window becomes, when Garmin returns the field: an activity (`SessionLogged`: type, distance, duration, calories, average HR), daily steps and active/total calories plus body battery and training load (`ExertionLogged`), sleep (`SleptLogged`), and HRV / resting HR (`RecoveryLogged`). A single failed day-call is skipped; activities are required.

### MyFitnessPal

[python-myfitnesspal](https://github.com/coddingtonbear/python-myfitnesspal) no longer logs in with a username and password. MyFitnessPal put the site behind Cloudflare and NextAuth, and the old form login does not return a session. The library can still read a diary when it is handed the browser session cookies, which is the path this sync uses. (The maintained alternative, mfp-mcp, is an MCP server on top of the same library; the diary read we need is `get_date`.)

1. Log in at myfitnesspal.com in a browser.
2. Export the site's cookies as a JSON list to a path **outside the repo**:

```json
[
  {"name": "__Secure-next-auth.session-token", "value": "...", "domain": ".myfitnesspal.com"}
]
```

3. Point the sync at that file and run it:

```bash
export MFP_COOKIE_PATH="$HOME/.cadence/mfp-cookies.json"   # this is the default
python3 -m integrations sync --source mfp --days 14
```

A day with food entries becomes one `FoodLogged` (`mfp:diary:YYYY-MM-DD`) carrying the entries, calorie and macro totals, and the day's goals. An empty day is skipped. If Cloudflare rejects the library's `requests` session, the command fails and writes nothing for that run.

`python3 -m integrations sync --print-only` prints the raw bundle and does not touch the database.

## Share from your phone (iOS Shortcut)

Two-step Shortcut turns the share sheet into "send to cadence":

1. Shortcuts app → new Shortcut → add **Receive input from Share Sheet** (URLs).
2. Add **Open URLs** with `https://<your-app-host>/recipes/new?url=[Shortcut Input]`.

Share a TikTok/YouTube/recipe link → the review card opens with extraction already
running. TikTok/YouTube recipes come from the caption/description (voiceover-only
videos fail honestly); Instagram isn't supported (login-walled).

## Test

```bash
npm test                                   # unit + fold + route logic (no network)
RUN_INTEGRATION=1 npm test                 # + live Claude extraction eval (golden set)
RUN_INTEGRATION=1 INSTACART_API_KEY=... \
  npx vitest run tests/instacart.integration.test.ts   # live IDP item-for-item test
```

## Event model (frozen envelope v1)

`{event_id, household_id, user_id?, type, ts, source, payload, schema_version, precision}`

| type | written when | pantry effect |
|---|---|---|
| `RecipeSaved` | recipe saved to library | none |
| `PantryAsserted` | user adds/edits/removes a pantry item | absolute: replaces item state |
| `OrderPlaced` | cart handed to a rail | none (actuals come later) |
| `PantryInflow` | aisle checkoff / delivery reconcile | additive merge |
| `RecipeCooked` | "I made this" | subtractive merge |

The fold (`rebuildPantry` in `lib/pantry.ts`) is the only code that computes pantry state; every write recomputes the view from the full log in the same transaction.
