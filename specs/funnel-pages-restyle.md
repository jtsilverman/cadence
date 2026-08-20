---
status: active
---
# funnel-pages-restyle

Serves `specs/vision.md`. Every check below cites the vision milestone it serves.

## Intent

The FAQ page, the waitlist page and the thank-you page look like the old v4 landing. The main page
was rebuilt in a new visual language (`drafts/website/page/index.html`) and the three funnel pages
were left behind. This change restyles all three to that language: Inter Tight display, Inter body,
cream ground, the bare underlined green call to action, orange on a question's key phrase and green
on an answer's. It also replaces the FAQ's seven marketing-flavoured entries with ten plain
mechanics questions, and rewords the waitlist survey to Jake's five questions. The flow through the
three pages, the database, and the attribution chain do not change.

## Non-goals

- Wiring `drafts/website/page/index.html` into `app/`. `app/page.tsx` keeps serving the v4 landing
  this branch. Separate task.
- Deploying anything.
- Changing the signup flow: email first, survey optional, survey posts from `/waitlist`, thanks page
  stays inert.
- Changing the thank-you page's structure. Its copy changes only where it promised a note every
  week, which Jake cut on 2026-08-18; the rest of the page keeps its job and gains type, colour and
  spacing.
- A referral or share mechanic.
- Changing the `waitlist` table's columns. The reworded survey reuses the existing six columns.

## Orientation

**The funnel today.** `app/faq/` (server page + `faq-client.tsx`, 7 hardcoded entries in an
accordion, plus an AskBox posting to `/api/question`). `app/waitlist/` (`waitlist-client.tsx`, one
page, email + 5 survey questions + a call checkbox, no wizard). `app/waitlist/thanks/` (static, no
state). All three render `SiteNav`/`SiteFooter` from `app/site-chrome.tsx` and style from
`app/landing.css` + `app/tokens.css` (Familjen Grotesk, accent `#3A5A40`).

**The write path.** `/waitlist` POSTs `/api/waitlist` (`INSERT OR IGNORE` on email, first
attribution wins), then POSTs `/api/waitlist/survey` only when a survey field is answered. The
survey route is UPDATE-only and 404s when no row exists, so order matters. `lib/waitlist.ts` +
`lib/db.ts:67` hold the one `waitlist` row per email; `tools`/`features` store as JSON strings.

**The trap.** `CaptureAttribution` is mounted inside `SiteNav`. A rebuilt nav that drops it kills
every UTM silently and every unit test still passes. This regression already happened in the v4
rebuild; the file carries a comment about it.

**The target language.** `drafts/website/page/index.html` `:root`: `--cream #EFEDE6`,
`--ink #101010`, `--dim #5E5E56`, `--rule #C4C0B2`, `--grn #1B7F4B`, `--tom #D14B24`, display
`"Inter Tight"`, body `"Inter"`. `.cta` is a bare underlined green line with a sliding arrow, no
pill. `--tomup`/`--grnup` are the lifted pair for the ink band only, so cream-ground pages use
`--tom`/`--grn`.

**Tests that must stay green.** `tests/journeys/journey-waitlist-funnel.test.ts`,
`tests/attribution.test.ts`, `tests/site-gate.test.ts`, `tests/landing-v4.test.tsx`,
`evals/site/waitlist.eval.ts`, `evals/site/nojs.eval.ts`, `evals/site/questions.eval.ts`.
`tests/landing-v4.test.tsx` asserts the old FAQ copy and will need updating with the new deck.

**Brain hits.** `wiki/projects/cadence/index.md` (phase and pointers),
`sources/clippings/2026-08-12-meal-app-audience-personas-research.md` (the science under the pains,
and the Restarter as primary persona), `sources/clippings/2026-08-11-glp1-positioning-research.md`
(the compliance line: no drug names, no mechanism language).

## GOAL

Open `/faq`, `/waitlist` and `/waitlist/thanks` beside `drafts/website/page/index.html` at the same
window width, and the four pages read as one site: the same two typefaces, the same sizes, the same
cream ground, the same bare underlined green call to action. The FAQ answers eleven plain questions
about how Cadence works, with the key phrase of each question in orange and the key phrase of each
answer in green, and not one sentence reads as crafted. The waitlist page asks Jake's five
questions in his order. Signing up still banks a row that carries the campaign that sent the
visitor.

## CHECKS

Derived, not Jake-facing. Each check cites the vision milestone it serves.

1. **vision:1,4** -- `/faq` renders exactly the eleven locked question and answer strings from the FAQ
   deck in `drafts/website/WEBSITE.md`, in order. Proved by a test asserting all eleven pairs.
2. **vision:2** -- the rendered FAQ contains eleven orange key-phrase spans and eleven green key-phrase
   spans, one of each per entry. The test counts both and asserts 11 and 11, because eleven individual
   entries passing does not prove the set is complete.
3. **vision:3** -- `/faq`, `/waitlist` and `/waitlist/thanks` resolve to the main page's tokens:
   cream ground, `Inter Tight` display, `Inter` body, `--grn` CTA with no pill and no radius. Proved
   by a test asserting the computed custom properties, plus one screenshot per page at 1280px.
4. **vision:6** -- `/waitlist` renders the five survey questions in Jake's order with the locked
   option lists, and every survey field stays optional. Proved by a test asserting the question
   strings, the option counts, and that submitting email alone succeeds.
5. **vision:5** -- the attribution chain survives the restyle: `CaptureAttribution` still mounts on
   every one of the three pages, and a UTM link through to signup still lands its campaign on the
   row. Proved by `npx vitest run tests/attribution.test.ts tests/journeys/journey-waitlist-funnel.test.ts`.
6. **vision:5** -- the funnel still works end to end in a real browser: `evals/site/waitlist.eval.ts`,
   `evals/site/nojs.eval.ts` and `evals/site/questions.eval.ts` pass.
7. **vision:4** -- every FAQ answer traces to `ux.md`, a shipped spec, or a code path, listed in the
   copy deck's evidence column, and every answer describing an unbuilt feature carries the
   `designed` mark. No answer names a feature absent from every design doc.

## LOOP

/loop Read specs/vision.md, then specs/funnel-pages-restyle.md. Work on branch feat/funnel-pages-restyle. Close the next open check: write its test first, watch it fail, then make it pass. Report progress as vision milestones satisfied, never as tasks done.
STOP when every check is true, `npm test` passes, and `agents/vision-auditor.md` returns MATCHES on
every in-scope milestone.

## Decisions

| Decision | Reason |
|---|---|
| Cream ground, `--tom`/`--grn` | The lifted `--tomup`/`--grnup` pair exists only to clear the ink band. |
| Orange on the question, green on the answer | Jake's call. It matches the pain belt on the main page. |
| FAQ voice is plain and literal | Jake's call. It departs from the main page's crafted voice on purpose. |
| "Where do the numbers come from" cut | No food database is wired in; the question invites a claim Cadence cannot make. |
| "Lacking willpower" kept as a survey option | Jake's call, over a recommendation to cut it for contradicting the hero. |
| Survey reuses the six existing columns | No schema change; `survey_pick`, `survey_tools`, `survey_features`, `survey_price`, `survey_wish`, `survey_call_optin` all still fit. |

## Progress

- [x] Unit 1: the copy deck lands in `drafts/website/WEBSITE.md` -- `2a32a12`
- [x] Unit 2: the shared funnel styling matches the main page -- `68143fa` -- palette test green
- [x] Unit 3: the FAQ's ten entries, orange and green -- `dc32dd3` -- 10 and 10 counted
- [x] Unit 4: the waitlist survey's five questions -- `7edddd7` -- deck test green
- [x] Unit 5: the thank-you page's type and colour -- `59f1b3a` -- no weekly promise
- [x] Unit 6: evals and screenshots -- `b049de4` -- 38 site evals green, closed panels measure 0
- [x] Cleanup pass -- `5ab20d3` -- fonts scoped, deck parser shared, survey type tightened
