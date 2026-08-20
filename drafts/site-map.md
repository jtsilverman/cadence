# Site map: validation site (nutrition-only, as shipped)

**SUPERSEDED 2026-08-04.** This file describes the landing-v4 Eight Sleep anatomy, which the
board-direction site replaced (PR #37; statement of record: `drafts/website/HANDOFF.md`; pages:
`drafts/website/site/`). `app/page.tsx` still serves the page described below until the wiring
task lands. Kept as the receipt for the credibility rules and the funnel instrument, which carry
forward.

Rewritten 2026-08-03 for landing v4 (specs/landing-v4.md): the Eight Sleep
anatomy transplant. Supersedes the v3.2 description (the animated week board,
its hotspots, the crossfading hero card, the all-dark band rhythm — Jake's
call: the board read AI-vibecoded). History lives in git if we ever want it
back. Reference of record: design-refs/eightsleep/ + assets/motion-refs/notes.md.

**Goal:** proof of demand, not product. Four pages; every element serves one
conversion: waitlist signup. Instrumented: UTM (where from) → CTA (which button)
→ email → survey. The questions page doubles as an objection-capture instrument.

**Lead pitch: organization + adaptability.** One seamless flow — plan, shop,
cook, eat, log — that adapts to your life instead of fighting it. Nutrition
only; training/recovery/social are out of the pitch entirely. No coach persona:
never "Cade," never "it thinks" — *the plan adapts as you log*. The product
speaks as "Cadence" only when something must speak (the Live band replies).

**Credibility rules (unchanged):**
- No fabricated stats, count-ups, or proof numbers. No testimonials pre-launch.
- No fake footer links. Footer is one row.
- Calorie/macros language stays quiet; never claim "no weighing / no scale"
  (you weigh to a target, you don't type weights in after).

**Copy sources are locked:** shipped v3.2 strings, locked lines from
drafts/website/WEBSITE.md, and the six Jake-approved persona cards. One
exception pending Jake's veto: the persona band header ("Built for the way you
actually eat.").

## `/` — the landing (Eight Sleep anatomy, cream/dark band rhythm)

1. **Nav** (sticky, cream): links left ("How it works" → #plan, "Questions" →
   `/faq`), wordmark center, black CTA button right. CTA id `nav`. All CTAs
   route to `/waitlist`.

2. **Hero** — eightsleep frame-006 clone: black headline on cream, short sub,
   black CTA (id `hero`) + trust line, then one giant inset photo
   (hero-cooking). No cycle, no card, no scrimmed text-over-photo.
   (The old headline A/B machinery is deleted; `attribution()` still records a
   variant on signup but nothing renders it — decorative until a future test.)

3. **Statement band** (cream breather, eightsleep-006 idiom): "You don't need
   more discipline. You need less overhead." + the second-job/second-nature
   body (WEBSITE.md §2 locked).

4. **Plan** — eightsleep frame-144 clone: full-bleed prepped-week photo
   (hero-meals), white eyebrow + headline + one-line lede on the left.
   Nothing to press; the five story cards are gone (Jake 2026-08-04: too many
   words, exact eightsleep sections only).

5. **Shop** (cream) — three photo feature cards (cutting board / handwritten
   list / produce shelf), eightsleep-144 row; highlight swaps only the active
   text block to white. Claims: knows what you have / knows what you need /
   fits the week you planned.

6. **Live** (dark app-moment) — the change feed is the artifact, no photo:
   four chat moments ("Caesar salad with chicken from Sweetgreen" → Cadence
   rebalances; "Drinks tonight with Sam — problem?" → "It's been in the plan
   since Tuesday. Enjoy."). Staggered scroll reveals.

7. **Save** (cream) — all four white cards at once in a grid (Jake
   2026-08-04: no carousel): TikTok reel / camera-roll screenshot / food blog /
   grandma's recipe card — each returning structured.

8. **Persona grid** (cream-seam) — six "this is me" cards (eightsleep
   sleep-challenges idiom), photo + label + headline + one line: the social
   eater, the TikTok saver, the restarter, the spiraler, the office luncher,
   the winging-it shopper.

9. **CTA close** — full-height sunset-cheers photo band: "You're not logging
   food. / You're living your life." + intention-and-balance lede + oversized
   CTA (id `closing`) + trust line.

10. **Footer** — one row: wordmark, Questions link, © line, contact email.

## `/faq` — Questions

Accordion (one open at a time, 0fr→1fr ~400ms): what is Cadence, TikTok saving,
do I have to log (no — log-in-a-sentence, estimates, adjust if off), what
happens when the week changes, diets, cost, when. Answers stay present-tense:
never "still deciding" or "we're building now" (Jake 2026-08-04). Ask-a-question
box → `POST /api/question` (email optional); every question persisted as
objection data. Nav CTA id `faq-nav`.

## `/waitlist` — registration + survey (one page, one submit)

Email is the only required field (`POST /api/waitlist` with cta/variant/utm).
Optional survey rides along (`POST /api/waitlist/survey`): hardest-part single
pick (8 options, persona-derived — includes one-slip spiral and prep boredom),
tools today, up-to-two expansions, monthly worth, why-you-quit freetext, 15-min
call opt-in. Side photo: week planner. → `/waitlist/thanks`.

## `/waitlist/thanks` — plain confirmation

You're on the list, one-note-a-week promise, link to `/faq`. No survey here
anymore (moved to `/waitlist`).

## Design language (as shipped)

- tokens.css from design.md §1 at corpus-measured values (#fff / #f8f7f3);
  the warm override is retired (v4.2). Familjen Grotesk. Radius 0, no shadows.
- Light-first: cream/white alternating marketing bands with black type and
  black buttons; dark only for the Live app band; full-bleed photo bands for
  Plan and the close. Eight Sleep type scale: display 64px, band titles 48px.
- Shared chrome: one SiteNav/SiteFooter component (app/site-chrome.tsx) across
  all four pages.
- Motion: pure CSS. Scroll reveals via `animation-timeline: view()` behind
  `@supports` (bands must use `overflow: clip`, never `hidden` — hidden makes
  the band a scroll container and freezes every reveal inside it). Hover never transforms;
  `prefers-reduced-motion` renders everything static.
- Photos: uniform warm grade, provenance + v4 slot assignments in
  assets/site-photos/credits.md.

## Explicitly out

- Training, recovery, wearables, feed/social — out of the site entirely.
- Hero A/B, stat bands, count-ups, projections, testimonials, streak language.
- Pricing page, blog, about. Building real app UI.
