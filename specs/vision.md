---
status: active
---
# Vision: the three funnel pages

The epic layer for the marketing funnel. `drafts/website/WEBSITE.md` carries the copy,
`drafts/website/HANDOFF.md` carries the design language, `drafts/website/page/index.html` is the
main page every one of these pages must look like it belongs beside.

## The picture (Jake's words, 2026-08-18)

"faq is clear questions about the mechanices: how does cadence work, how do i log food, where does
it get its data from, how do i make changes to my plan, how do i get recipes, how do i scan in
ingredients, just very simple and easily answerable questions about how the app works and what it
does for you."

"I think the wiatlist and thanks and faq are good rn but just need to update with the formatting
and fonts and sizing like the main page, combining the green and the oragne and maybe the italics
where applicable."

"the oragne should be like the main word or phrase in the question and the green should be the main
word or phrase in the answer."

"I think in general this section has to be very plain - no fancy wording or phrasing, very plain and
literal."

## The one change

The FAQ page, the waitlist page and the thank-you page stop looking like the old site and start
looking like `drafts/website/page/index.html`. The FAQ's content becomes ten plain mechanics
questions. The flow through the three pages does not change.

## The invariant that outranks everything

**A visitor who signs up still lands in the database with the campaign that sent them.** The
attribution capture is mounted inside the nav, so a rebuilt nav that drops it kills every UTM
silently and the tests still pass. That regression already happened once in the v4 rebuild.

**No answer on these pages describes a product Cadence is not building.** The site sells the designed
product and the code catches up; Jake set that on 2026-08-18. So every FAQ answer traces to `ux.md`
or a shipped spec, and an answer that traces to neither is invented and must go. Answers describing
unbuilt design are marked in the deck, so nobody later reads the site as a record of what runs.

## Milestones, as Jake judges them

1. The FAQ answers eleven plain questions about how Cadence works, and none of them reads as crafted.
   Shown by: Jake reads `/faq` end to end and finds no sentence he would call fancy.
2. Every FAQ question carries orange on its key phrase, and every answer carries green on its key
   phrase, on all eleven.
   Shown by: a count over the rendered page returns 11 orange spans and 11 green spans.
3. The three pages read as the same site as the main page: the same two typefaces, the same sizes,
   the same cream ground, the same bare underlined green call to action.
   Shown by: Jake opens `/faq`, `/waitlist` and `/waitlist/thanks` beside
   `drafts/website/page/index.html` at one window width.
4. Nothing on the three pages describes a product Cadence is not building.
   Shown by: every answer names its source in the deck's evidence column, `ux.md` or a spec or a
   code path, and every answer whose feature is designed but unbuilt is marked as such.
5. Signing up still banks a row and still carries where the visitor came from.
   Shown by: `npm test` green, plus `evals/site/waitlist.eval.ts` and `evals/site/nojs.eval.ts` green.
6. The waitlist page asks five questions in Jake's order: apps used, feature wanted, hardest part,
   price, and one free-text question that stays optional.
   Shown by: Jake fills the form at `/waitlist` and reads the five questions back in that order.

## Out of scope

- Wiring `drafts/website/page/index.html` into `app/`. Separate task, separate branch.
- Deploying. No Vercel or Turso credentials exist on this machine yet.
- The signup flow, and the thank-you page's structure. Jake called both good. Its copy is in scope
  only where it promised a weekly note; see the decision log.
- A referral or share mechanic on the thank-you page.

## Design references

- `drafts/website/page/index.html` — the built main page. Type, colour, spacing and CTA come from it.
- `drafts/website/WEBSITE.md` — the locked copy deck, including the FAQ deck added 2026-08-18.
- `drafts/website/HANDOFF.md` — design language D4 to D13, the container rule, the colour rule.

## Decision log (newest first, cap 10)

- 2026-08-18: The site describes the designed product, not the built one. Jake: "we are marketing
  now then building the product later." The barcode scan and manual recipe entry stay in the FAQ;
  both are in `ux.md` and neither is built. The gate moves from "traces to code" to "traces to a
  design doc", which still kills an invented feature.
- 2026-08-18: The weekly-note promise is cut from the funnel. Jake: "dont make the promise of
  hearing from us a every week." The thank-you page carried it twice and nothing sends a weekly
  email. The v4 landing at `/` still carries it and is parked with the wiring task.
- 2026-08-18: The survey keeps five questions, reworded by Jake. Price stays, because it is the only
  pricing signal the funnel collects and the plan's milestone is 200 surveyed signups.
- 2026-08-18: "Lacking willpower" stays as an option on the hardest-part question. Jake's call, over
  a recommendation to cut it for contradicting the hero line about discipline.
- 2026-08-18: Orange marks the question's key phrase, green marks the answer's key phrase. Jake's
  call, over a recommendation of green only. It matches the pain belt on the main page.
- 2026-08-18: Cream ground on all three pages, so the accents are `--tom #D14B24` and `--grn
  #1B7F4B`. The lifted `--tomup`/`--grnup` pair exists only to clear the ink band.
- 2026-08-18: The FAQ voice is plain and literal, with no crafted phrasing. It departs from the
  main page's voice on purpose.
- 2026-08-18: "Where do the numbers come from" is cut. No food database is wired in, so the honest
  answer is thinner than a competitor's and the question invites a claim Cadence cannot make.
- 2026-08-18: Fasting gets an answer that recommends and does not promise a window. The coach is
  certified on it (`evals/chat/corpus.jsonl` cat12, cat19); `lib/planner.ts` has no eating window.

## Handoff (update when state moves)

As of 2026-08-18: all six milestones are built on `feat/funnel-pages-restyle`, `npm test` is green at
676 and the 38 site evals pass. The main page's wiring into `app/` stays parked as the next task, and
two findings are parked with it: `CaptureAttribution` still mounts inside the nav rather than a
layout, and the v4 landing at `/` still promises a note every week.
