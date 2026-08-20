# Develop and verify

## Run the app

```
npm install
npm run dev            # http://localhost:3000
```

Dev falls back to `file:local.db`. Development is never gated by `middleware.ts`, so every screen is
reachable.

Environment goes in `.env.local`:

| Variable | Needed for | Without it |
|---|---|---|
| `ANTHROPIC_API_KEY` | Recipe extraction and the coach | `/recipes/new` cannot extract |
| `INSTACART_API_KEY` | The Instacart Developer Platform link-out | The Order button 503s. The in-store flow still closes the loop |
| `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` | Deploy | Dev uses `file:local.db` |
| `WHOOP_CLIENT_ID`, `WHOOP_CLIENT_SECRET` | Whoop | The connect link is hidden and the whoop routes 503 |
| `APP_PUBLIC=1` | Opening the full app in production | Production serves the waitlist funnel only |

## Run the tests

```
npm test                                   # unit, folds, journeys, route logic. No network
npm run test:watch
```

Three integration tests are opt-in, each gated on `RUN_INTEGRATION` plus its own credential:
```
RUN_INTEGRATION=1 ANTHROPIC_API_KEY=... \
  npx vitest run tests/extract-eval.integration.test.ts          # live Claude extraction golden set
RUN_INTEGRATION=1 INSTACART_API_KEY=... \
  npx vitest run tests/instacart.integration.test.ts             # live IDP item-for-item test
RUN_INTEGRATION=1 WHOOP_ACCESS_TOKEN=... \
  npx vitest run tests/whoop.integration.test.ts                 # live Whoop fetch
```

`RUN_INTEGRATION=1 npm test` runs the whole suite with the extraction eval enabled.

## Run the eval suites

Playwright boots its own dev server on port 3100 against a throwaway database at
`evals/.tmp/eval.db`, with `EVAL_MODE=1` so the fixture-reset route exists.

```
npm run eval:site      # layer 1, the marketing site in a real browser
npm run eval:app       # layer 2, the product UI
npm run eval:chat      # layer 3, the coach against the utterance corpus
npm run eval:all       # site, then app, then chat
```

Narrow a chat run:
```
npm run eval:chat -- --category 1,13
npm run eval:chat -- --id <substring>
npm run eval:chat -- --n 3 --limit 20
```

`eval:chat` exits nonzero when category 13 (safety) drops below 100% or category 1 (plain food
logging) drops below 90%.

Seed a fixture household to poke at by hand:
```
npm run eval:seed -- fresh
npm run eval:seed -- week3
npm run eval:seed -- messy
npm run eval:seed -- week3 file:/tmp/scratch.db
```

Playwright traces land in `evals/.tmp/test-results` on failure. The JSON run summary is
`evals/.tmp/last-run.json`. Write the outcome into `evals/report.md`; that report is the deliverable.

## Connect Whoop

One-time setup, about five minutes:

1. Go to `developer.whoop.com` and create an app.
2. Set the scopes to `read:recovery read:sleep read:workout offline`.
3. Set the redirect URI to `https://<your-app-host>/api/whoop/callback`, and add
   `http://localhost:3000/api/whoop/callback` for dev.
4. Paste the client id and secret into `.env.local`.
5. Tap **Connect Whoop** on the home page.

Backfill or work locally:
```
curl -X POST localhost:3000/api/whoop/sync
```
That pulls the last 14 days and is idempotent; a rerun skips unchanged records.

Webhooks need a public URL, so they are production-only. Point the app's webhook URL at
`https://<your-app-host>/api/whoop/webhook`. Deliveries are HMAC-verified and fetch the changed
record in the same request. A sleep record marks that night's sleep slot done, a workout lands as a
loose session, and a recovery record decorates the schedule with `advice: "ease"` on a red-zone day
that has a planned workout.

## Share a recipe from a phone

An iOS Shortcut in two steps:

1. Shortcuts app, new Shortcut, add **Receive input from Share Sheet** set to URLs.
2. Add **Open URLs** with `https://<your-app-host>/recipes/new?url=[Shortcut Input]`.

Sharing a link opens the review card with extraction already running. TikTok and YouTube recipes come
from the caption or description, so a voiceover-only video fails honestly. Instagram is not
supported; it is login-walled.

## Find a production error

`instrumentation.ts` writes every uncaught route or render error into `error_events` with the route,
the method, and the digest. `/dev/ops` reads them. `POST /api/errors` is the client-side reporter and
is one of the five paths the production gate leaves open.

## Deploy

Vercel, one surface. Set `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`. Leave `APP_PUBLIC` unset to
ship the waitlist funnel alone; set it to `1` to open the app.

Nothing is deployed today and there is no live URL. `drafts/website/site/` holds four self-contained
HTML pages that are the deployable fallback.

## One leftover script

`scripts/open-site-pr.sh` pushes the local branch `site/board-landing` and opens its PR. It is
hardcoded to that one branch and needs your own GitHub auth, so run it from your terminal or ignore
it.

## Reaching the dev server from another machine

The macOS application firewall on this machine blocks incoming connections to
the `node` binary and allows `python3`. So the `Network:` URL that `next dev`
prints is unreachable from the laptop, and always has been. `-H 0.0.0.0` does
not help; the filter is on the binary, not the port.

Put python in front of it. `scripts/lan-proxy.py` listens on `0.0.0.0:8788` and
forwards to `127.0.0.1:3000`, which is loopback and unfiltered.

1. Start the app: `npm run dev`.
2. Start the forwarder: `/usr/bin/python3 scripts/lan-proxy.py`.
3. Open `http://<this machine's IP>:8788` from the other machine.

Check the allow list with
`/usr/libexec/ApplicationFirewall/socketfilterfw --listapps`. Never hand out a
`Network:` URL without curling it first.

## Walking the whole site before the main page is wired in

`drafts/website/page/index.html` is not in `app/` yet, so `/` still serves the
v4 landing. To walk all four pages in one place:

1. Run `bash scripts/preview-site.sh`.

It generates `public/main.html` from the drafts page, rewrites that page's links
onto the app's routes, and starts the app with `SITE_PREVIEW=1`, which turns on
the rewrite that serves the main page at `/`.

Keep the flag off everywhere else. The eval server reads the same
`next.config.ts`, and with the rewrite always on, five landing evals hit the
static page instead of the app route and fail.
