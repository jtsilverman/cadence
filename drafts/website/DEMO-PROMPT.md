# Demo prompt (external model)

Written 2026-08-13 for a fresh design exploration of the landing page. Messaging
and positioning are pinned; design and layout are deliberately unconstrained.

**Why no design direction is included:** the repo's own divergence lesson
(`drafts/website/cadence-divergence-round.md`) is that describing the category of
good UI, or naming software brands as references, produces the median. Four
in-house structure rounds landed too close together. This prompt withholds every
aesthetic constraint on purpose.

Paste everything below the line.

---

You are designing the landing page for a product called Cadence. I want three
genuinely different demos of what this page could be. Design and layout are wide
open. The words and the argument are not.

## What Cadence is

Cadence plans a week of meals a person actually wants to eat, writes the grocery
list for that week, and reshapes the plan when the week changes. A person tells
Cadence what happened in one plain sentence, like "dinner with Sam Friday" or
"ended up getting burgers," and the rest of the week adjusts around it.

Recipes get in by sharing a link or a video, or by describing food in a sentence.
Nobody types ingredients one at a time.

## Who this page is for

People who want to eat the way they intend to eat, and who have quit trying more
than once. They are not failing at willpower. They quit at a specific moment: the
routine breaks, one dinner out or one rough week, and the break feels like proof
that the whole effort was pointless. They stop, then wait for Monday.

Four things are documented about them, and they are the argument the page makes:

1. Food logging is the first habit people abandon, at a median of ten weeks.
2. Logging drops off Thursday through Sunday, and the gap widens over time.
3. Reading one slip as personal failure predicts a worse outcome than the slip.
4. A deviation that felt planned causes no distress. A deviation that felt
   unplanned triggers the spiral.

Cadence turns unplanned-feeling deviations into planned-feeling ones. That is the
whole product claim.

The audience skews older and less app-native than a typical startup landing page
assumes. A person who does not lean toward the screen has to follow what is
happening.

## The one thing this page has to demonstrate

**Life happens, a person says so in one sentence, and the plan visibly takes care
of the rest.**

Two things earn the visitor's attention, in this order:

1. **The absorb.** A change lands, and the week visibly adjusts around it. No
   competitor shows this. It is the exact moment the audience quit over.
2. **The effort collapse.** The input was one sentence, or one shared video. No
   forms, no per-item entry. This makes the absorb believable rather than
   magical.

Everything else on the page is supporting evidence and belongs lower and smaller.
The page's only business goal is an email address.

## The copy, locked

Use these lines as written. You can decide where they go, how they are broken,
what is emphasized, and what gets cut for a given demo. Do not rewrite them.

**Hero:** Take control of how you eat, without it taking control of your life.

**Sub:** Cadence plans meals you actually like, writes the grocery list, and
adjusts when your week doesn't go as planned.

**Section header:** You don't need more discipline. You need less overhead.

**Five recognition questions, each with its answer:**

1. Tired of meal plans that pretend Friday night doesn't exist?
   Cadence builds your week around your plans. Nights out included, from the start.
2. Sick of logging your food one ingredient at a time?
   Your meals are planned ahead, so tracking is a tap. Off the plan? One sentence covers it.
3. Done ordering the salad you didn't want?
   Get what you're actually craving. The rest of the week rebalances around it.
4. Still calling it a cheat meal?
   There are no cheat meals here. A night out is part of the plan, not a violation of it.
5. One rough night and the whole week feels wasted?
   One night can't erase a week. The plan absorbs it and keeps moving.

**Close:** In control, no matter what the week throws at you.

**Call to action:** Join the waitlist. Under it: EARLY ACCESS OPENS IN ORDER.

## Rules about the words

- Never write the word "diet." It signals temporary and restrictive, which is the
  opposite of the product.
- Never lead with AI. AI is how the product works, never what it promises.
- The product is always called Cadence. It is never called a coach, never given a
  human name, and never speaks in first person.
- Blame never lands on the reader. This is the emotional center of the brand.
- Be specific. Name the concrete moment, like Friday night, rather than the
  abstraction, like a social life.
- No em dashes anywhere.
- No calorie numbers, no macro grams, and no percentages anywhere in the demo.
  The moment a number appears, the page reads as a calorie tracker with better
  fonts, and that fights the entire promise.
- No mention of weight-loss drugs.

## What I am not telling you

Colors, typefaces, layout, page structure, motion style, illustration, photos,
whether there is imagery at all, how many screens, how it scrolls, and how the
demonstration works. Every one of those is yours to invent, and I want the three
demos to disagree with each other about all of them.

Two things I have learned the hard way, so treat them as warnings rather than
direction:

- Do not anchor on well-known software brands or on the phrase "clean modern
  minimal." That produces the same page every time. Anchor somewhere outside
  software entirely if it helps, and do not tell me where.
- The three demos must read as three different designs with my eyes squinted.
  Three color variations of one layout is a failed answer.

## What would make a demo wrong

- A dashboard, a chart, or anything that looks like a tracking app.
- A row of three feature cards under a hero.
- A phone mockup as the centerpiece, because every app landing page has one.
- A page where a person has to already believe the product works to understand
  what they are seeing.
- The absorb explained in words rather than shown happening.

## What to deliver

Three demos. Each one is a single self-contained HTML file with all CSS and
JavaScript inline, no external requests, and no build step. It has to open in a
browser and run.

Each demo must:

- Show the absorb happening, as motion or interaction, rather than describing it.
- Work at phone width and at desktop width.
- Respect `prefers-reduced-motion` and stay understandable with motion off.
- Reach the waitlist call to action.

Build them one at a time. Before each one, tell me in three sentences what the
design world is and why it stages the absorb. Then write the file. Then stop and
wait, so I can react before you start the next one.
