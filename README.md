# cadence

Any recipe anywhere, then groceries at your door, then a pantry that learns how you eat. The same
engine points at training, recovery, and reflection.

**Status: in development.** The phase-1 food loop runs end to end with screens. The backend for
everything else is complete and headless. 662 tests pass on a fresh clone.

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
npx vitest run         # 662 tests
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

## Whoop (sleep, recovery, workouts → your diary)

One-time setup (self-serve, ~5 min): [developer.whoop.com](https://developer.whoop.com) →
create an app → scopes `read:recovery read:sleep read:workout offline` → redirect URI
`https://<your-app-host>/api/whoop/callback` (plus `http://localhost:3000/api/whoop/callback`
for dev) → paste client id/secret into env. Then tap **Connect Whoop** on the home page.

- Webhooks (prod only — needs a public URL): point the app's webhook URL at
  `https://<your-app-host>/api/whoop/webhook`; deliveries are HMAC-verified and fetch the
  changed record in-request. Sleep marks that night's sleep slot done; workouts land as
  loose sessions; recovery decorates the schedule (`advice: "ease"` on red-zone days
  with a planned workout).
- Backfill / local dev: `curl -X POST localhost:3000/api/whoop/sync` pulls the last 14
  days (idempotent — reruns skip unchanged records).

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
