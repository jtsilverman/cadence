# Code and test conventions

One answer per question. A reviewer can reject a change from this file alone.

## Language and layout

TypeScript throughout, ESM, no build step beyond Next. The `@` alias resolves to the repo root in
both `vitest.config.ts` and `tsconfig.json`.

`lib/` holds pure fold logic and the database seam. `app/api/*/route.ts` holds route handlers.
`app/(product)/` and `app/(dev)/` hold screens. A route handler validates its input and calls a
`lib/` function; it never reimplements a fold.

## Writes go through the log

Never write a view table directly. Append the event, then rebuild the view from the full log in the
same transaction. `rebuildPantry` in `lib/pantry.ts` is the only code that computes pantry state, and
that pattern is the rule for every other view.

`household_id` goes on every user-data table from day one.

Pantry writes from inference are suggest-only. Only an explicit user action asserts inventory truth.

## Where a test goes

Four layers, each with its own runner and its own directory.

| Layer | Runner | Lives in | Command |
|---|---|---|---|
| Unit and fold logic | vitest | `tests/*.test.ts`, `tests/*.test.tsx` | `npm test` |
| Headless API journeys | vitest | `tests/journeys/journey-*.test.ts` | `npm test` |
| Live site and product UI | Playwright | `evals/site/*.eval.ts`, `evals/app/*.eval.ts` | `npm run eval:site`, `npm run eval:app` |
| Coach chat | a `tsx` runner | `evals/chat/corpus.jsonl` | `npm run eval:chat` |

`vitest.config.ts` includes only `tests/**`, so an `.eval.ts` file never runs under `npm test`.
`.test.tsx` files get the jsdom environment; `.test.ts` files do not.

`tests/setup.ts` runs before every test file and holds the two mocks a component
test always needs. Never re-declare either one in a test file. `next/font/google`
is a build-time macro, so under vitest the real import is not callable and any
component that reaches a font module throws. `usePathname()` returns null outside
a router provider instead of throwing, so a branch on it goes untested while the
suite stays green. A mock factory here returns named exports; a factory returning
a Proxy answers `then` as well, which makes the module namespace a thenable and
hangs the runner before one test reports.

`tests/deck.ts` reads the locked copy decks out of `drafts/website/WEBSITE.md`.
Site copy has one authority, that file, and the tests assert the code matches it
rather than carrying a second copy of every sentence.

A test that needs a network call is named `*.integration.test.ts` and guards on an environment
variable. `npm test` runs offline.

HTML fixtures for extraction live in `tests/fixtures/`, one file per captured page, named
`<site>-<slug>.html`. A site with several shapes worth pinning gets several files.

## The eval suites

`evals/charter.md` is canonical; read it before writing an eval. The rules that bind every layer:

- **Author blind.** Write the scenario from what a person would want, say, and do, derived from
  `ux.md`, before reading the code under test. Never mirror what the code happens to do.
- **Three demand tiers in every suite.** The happy path, the sloppy path (double-taps, typos,
  refresh mid-flow, dictation garble, 11:58pm logs, back button), and the hostile path
  (injection-shaped strings, prompt injection, oversized input, type confusion).
- **Assert the screen state and the event behind it.** A checkmark with no event fails. An event with
  no visible receipt fails.
- **Triage every failure into exactly one bucket.** FIX (class), FLAG (feature gap), or FLAG (out of
  scope). Record the reasoning either way.
- **The report is the deliverable.** `evals/report.md` carries every scenario, its bucket, its fix
  commit, and the per-run trend tables.

Chat cases run N greater than or equal to 3 because the model is nondeterministic. Flakes are tracked
separately from failures. `npm run eval:chat` exits nonzero when safety (category 13) drops below
100% or plain food logging (category 1) drops below 90%.

Grading a chat case is two channels, both required: deterministic database assertions, and an LLM
judge against the case rubric with the actually-written events injected as ground truth. A claimed
action with no event is an automatic fail.

## Fixture households

Three seeded households, one fresh database per story. `evals/fixtures/seed.ts` defines them.

| Fixture | Is |
|---|---|
| `fresh` | A brand-new user, empty diary, mid-onboarding state available |
| `week3` | Three weeks of history: favorites, a locked week plus a living draft, real pantry state, Whoop connected, a weight trend |
| `messy` | Deviations everywhere: skipped meals, unlogged days, two over-eaten days, a half-checked list, expired pantry items, a correction in history |

Playwright pins `workers: 1` and `fullyParallel: false` because stories reset the shared database.

## External APIs

The first live call against a new API is a multi-hypothesis curl probe, not code written against
mocks. Decode the OAuth scopes before trusting a 403.

Ingredient-to-product matching decisions get logged with the input, the candidates, and the choice.
They are training data.

## LLM extraction

Cached static rubric, tolerant fence-stripping parse, enum validation, deterministic fallback. An
extraction that cannot succeed fails honestly rather than inventing a recipe.

## Git

Write commit subjects as plain sentences in the imperative, with no conventional-commit prefix:
`Let a committed scroll sweep the six beats in seven seconds`. `d0c6c90` carries a `docs:` prefix and
predates this rule; it is the exception, not the pattern. Branch per task, Jake merges the PR. Never
commit to main. Stage with `git add <file>`.

## What never lands in the repo

`.gitignore` covers `node_modules/`, `.next/`, any `*.db`, `.vercel`, `design-refs/`,
`.playwright-mcp/`, `.worktrees/`, `.claude/`, `archive/`, `assets/site-photos/`, and `evals/.tmp/`.

The env patterns are `.env` and `.env*.local` only. `.env.local` is ignored;
`.env.production` and `.env.staging` are not. Keep secrets in `.env.local`.
