# Cadence website — handoff

**UPDATE 2026-08-13. The site is repositioned. The shipped site in
`drafts/website/site/` is now the OLD design.** The reposition happened across a
working session on 2026-08-11 and 2026-08-12 and produced locked copy, a locked
audience, and a locked design language. None of it is built yet. This file and
`WEBSITE.md` are the record; the artifacts below are the visual reference.

Copy, positioning, audience, and the science live in **`WEBSITE.md`**. This file
carries the design language, the motion direction, what is superseded, and the
open decision.

---

## The one thing the website demonstrates

**Life happens, you say so in a sentence, and your plan visibly takes care of
the rest.**

Two things earn attention on the page, in this order. Nothing else does.

1. **The absorb.** A change lands (a night out, a plan gone sideways) and the
   week visibly adjusts around it. No competitor shows this. Every persona quit
   over it.
2. **The effort collapse.** The input was one sentence, or one shared TikTok.
   No forms, no per-ingredient entry. This makes the absorb believable rather
   than magical.

The grocery list, the pillars, and the personas are supporting evidence, lower
on the page, smaller. The CTA is the only other first-class element, because the
page's business is an email.

**Page spine:** hero promise → the absorb demo front and center → pains as
recognition → effort collapse as the second proof → ask.

**Status: this framing is Jake's to confirm or reframe.** It was written at the
end of the 2026-08-12 session and never answered. Everything below assumes it.

---

## Design language — LOCKED 2026-08-12

| ID | Decision |
|---|---|
| **D4/D5** | Typographic hero. Pains one per screen as direct-address questions. |
| **D6/D7** | One continuous motion scene. **The full seven-day calendar is cut.** |
| **D9** | Colorway C4: cream ground kept, ink text, accents saturated. Green `#1B7F4B`, tomato `#D14B24`. |
| **D11** | Typeface F1: **Bricolage Grotesque** display + **Instrument Sans** body. Both free on Google Fonts. |
| **D12** | CTA B2: the **bare underlined line with arrow**. No pills, no solid blocks. |
| **D3** | Title tag T1. See `WEBSITE.md`. |
| **D13** | Motion: **M2 + M4 merged**, rebuilt from scratch at full scale with the real fonts. |

### The container rule

**No box earns a border unless it has to.** Structure comes from type, spacing,
and rules. Sections separate by space and one hairline. Color highlights
meaning; it does not fill boxes. The rule came from
`https://x.com/zander_supafast/status/2084623671444799847`.

**A locked rule prunes later options.** An option that breaks a locked rule does
not get presented again. The hard-edged phone mock broke this rule after it was
set, and that was the miss.

### The color rule

**Red is demoted.** Red signals bad, and eating out is fine. Green marks a
deviation as on-plan. Amber appears only as a transient rebalancing sweep, never
as a resting state. Tomato `#D14B24` survives as an accent, not as a verdict.

### Type scale

**Arm's-length legibility is a requirement, not a preference.** The old site
rendered 40 cards at 9px with macro rows, and a real reader could not see what
was happening. One idea per beat. **No macro number ever appears in the demo.**

---

## Motion: vignettes, not the board

The seven-day board is cut. Motion idioms from the built six-beat sequence carry
forward into single-purpose vignettes, one idea each.

| Vignette | What it shows | Idiom reused from the built sequence |
|---|---|---|
| Your food, in | A TikTok share card slides in and becomes one big meal card: photo, name, no numbers. | The rail-card materialize from beat 1 |
| The list writes itself | Three meal cards coalesce into a seven-line grocery list. One line strikes through with an "already in your pantry" tag. | The list coalesce from beat 3 |
| The week bends | A three-day strip. One typed sentence ("dinner with Sam Friday"). Friday's card swaps, one neighbor shifts. | The ledger chat and card swap from beat 5 |

The three-day strip also solves the phone, because the three-day window was
already the specced mobile answer for the board. The logging motion folds into
the third vignette as its second breath, which keeps the count at three.

**M2 (the living document):** the week as one typed list that edits itself. A
line strikes through, the replacement writes in, neighbors warm to amber while
they rebalance. No cards, no boxes, pure type. Most on-rule with the container
rule.

**M4 (cause and effect, typographic):** split stage. What you say on the left in
display type, the week reacting on the right as three plain lines changing color
and content. The most direct demonstration of "you talk, the plan moves."

**The merge:** the living document IS the reacting column, with your sentence
typed above it.

---

## CURRENT 2026-08-15: type, colour, the belt, and a faster demo

**Built and running: `drafts/website/page/index.html`, build 25.** Serve it with
`python3 drafts/website/serve.py 8787`, then open
`http://10.1.10.167:8787/page/index.html` from the laptop. That server answers
`Cache-Control: no-store`, so one URL always shows the current file. The footer
stamps the build number; if it disagrees with the file, the browser is stale.

| Change | State |
|---|---|
| Type | Inter Tight display, Inter body, latin subset, embedded. Tracking -.03em, loosened from -.042em because Inter Tight is already a tightened cut. The file dropped 682KB to 167KB. |
| Nav | The five-bar mark is back beside the wordmark. The button reads "Get early access". |
| Green phrases | "Take control" (hero), "anywhere", "real", "shopping list", "accounted for", "made up for", "Cadence" (the six beats), "In control" (closing), and both calls to action. |
| Lead band | Full-bleed ink, centred, each statement on one line, sliding up out of its own mask. "more discipline" in `--tomup` #E0603A, "less overhead" in `--grnup` #229A5B, both lifted off the ink to clear 5.3:1. |
| Pains | On ink, the same register as the lead band. The sting in each question carries `--tomup`: "Friday night doesn't exist", "one ingredient", "you didn't want", "cheat meal", "wasted". Answers read cream with only the key phrase in `--grnup`: "Nights out included", "tracking is a tap", "actually craving", "part of the plan", "absorbs it and keeps moving". A continuous belt at 98px/s. The set is cloned until it overfills the window and the track resets by exactly one set width, so there is no seam. The question is italic and the answer upright, both at weight 800 and one size; Inter Tight italic is embedded for it. Every question holds three lines, so questions and answers run along one line across the belt. Each card replays its reveal on every pass. It never pauses. |
| Demo | 27.1s, about 2 seconds off every beat. `RATE` is the one speed knob. Beat 5 crosses on the beat. The piece restarts 0.9s after it lands and loops forever. |
| Scrolling | **The section holds the page, and the scroll runs the piece.** Wheel down walks the beats forward, wheel up walks them backward, at `SCRUB` 9 clock-ms per pixel. The hold ends the moment the clock reaches the end being scrolled toward: down at beat 6, up at beat 1, and the page carries on in that direction. Arriving from below starts at the end, so scrolling up reads 6, 5, 4, 3, 2, 1. With no scroll the piece plays itself; parked at beat 1 it waits, so the next wheel up lets go instead of scrubbing. The hold engages only once the section's top is within 12% of the window height, so the snap into place moves 70 to 90px instead of most of a screen, which is what read as a skip on the way up. A hard flick past the section skips the hold entirely. The hold re-arms only after the section has left the screen. Never holds under 1121px or under reduced motion. |
| End cue | Once the clock lands, `SCROLL` with a nudging arrow fades in centred at the bottom of the stage, and fades out again if the reader scrubs back. It is the only instruction the section gives. |
| Retired | "Early access opens in order", from this page, both FAQ answers and the waitlist lede. |

### Open on the page

1. **Beat 2 holds the recipe 3.5s, down from 5.5s.** Jake asked for a longer
   hold there on 2026-08-14; the global speed cut took it back. Unresolved.
2. **At 390px the first lead line wraps to two lines.** Above 1121px each
   statement holds one line.
3. **Mobile is still the gap**, unchanged from the note below.
4. The CTA still points at `../site/waitlist.html`. Wiring into `app/` is the
   pending spec.

### The class name `.close` is a public namespace

The closing section is `.closing`, never `.close`. A Chrome extension injects
`.close, .closeSideDrawer:hover { color: … }` from its own button design system
and repainted the whole section on hover, on Jake's machine only. Eight rounds
went into finding that. Avoid `close`, `card`, `button`, `modal`, `active`,
`hidden` and `content` as class names here. Trace:
`brain/traces/2026-08-15-extension-class-collision-close.md`.

---

## SUPERSEDED 2026-08-14: the full page, demo pinned in the middle of it

The six-beat demo below is unchanged and is now beat-for-beat the middle of a
real page. The page spine is the one this file proposed: hero promise, the demo,
the five pains as recognition, the ask.

| Section | Content | Source |
|---|---|---|
| Nav | Wordmark, bare underlined waitlist link | D12 |
| Hero | "Take control of how you eat, without it taking control of your life." + sub + `Get early access →` + "Early access opens in order." | `WEBSITE.md` v3 deck |
| Demo | The six beats, unchanged, pinned while they run | `motion/sections.html` |
| Pain band | "You don't need more discipline. You need less overhead." then the five pains, one per screen, question at display scale, answer against a green rule | `WEBSITE.md` v3 deck |
| Close | "In control, no matter what the week throws at you." + the CTA again | `WEBSITE.md` v3 deck |

### The pin, which answers the "wheel is captured" open

The demo takes the wheel only while it is unplayed, and gives it back the frame
the clock finishes plus a 1.1s hold. Once played it never takes it again.
It never pins under 1121px and never pins under `prefers-reduced-motion`; in
both cases the clock autoplays and the page scrolls normally. `Esc` skips to the
end, and the hint says so.

**Verified in a browser, both passes.** State-by-state: all six beats carry the
right copy, side, panel, green and amber cells, and settled numbers. Real-time:
46 seconds of playback with zero frames showing two headlines, no headline, or a
cell holding two states, then a clean self-release. No horizontal overflow at
1440, 1120 or 390.

### Open on the page

1. **Mobile is still the gap, now with a measured symptom.** At 390px the stage
   is 764px of room holding a 602px object plus its headline, so beat 5 clips its
   own headline off the top and the week's cell names truncate. It needs the
   portrait stage, not a tweak.
2. **The demo is full-bleed and the document is inset to a 1200px column.** The
   demo's left copy starts 32px from the window edge, the hero's starts at 160px.
   Deliberate as a stage-versus-document register, or an inconsistency. Jake's call.
3. **The pains use the left half at 1440px** and leave the right half empty. One
   idea per screen is locked; the composition inside the screen is not.
4. The CTA links to `../site/waitlist.html`, the old site's form. Wiring into
   `app/` is still the pending spec.

---

## CURRENT 2026-08-14: six beats, one stage, one continuous clock

**Built and running: `drafts/website/motion/sections.html`.**
Artifact: https://claude.ai/code/artifact/9ac443b2-3e46-457d-9a95-b851c10c66aa
Jake's copy is also at `~/Desktop/cadence-sections.html` on his laptop.

**Jake's verdict 2026-08-14: "we're getting close."** More changes are queued
for the next session.

### How it runs

One 37-second clock drives everything. The piece plays itself with no input.
Pace is one knob: `RATE` in the page script (1.2 as of 2026-08-15, where 1 is
the original 44-second cut). `RATE` divides the beat lengths and every delay
inside them together, so the beats and their animations never drift apart.
The wheel and touch add to that same clock, forward or backward, so scrolling
speeds it up or rewinds rather than gating it. The page itself does not scroll.
The beat readout sits bottom right: `04 / 06`, a bar that fills continuously,
and a section label.

| Beat | Header | Copy slot | Object |
|---|---|---|---|
| 1 | Any recipe, from anywhere. | left | An animated cursor drags a file into the drop zone |
| 2 | Cadence makes it real. | crosses to right **when the loading bar completes** | Loading bar, then the recipe with whole-recipe macros |
| 3 | Your plan becomes your shopping list. | top, centred | A skinny 340px list, every item with a quantity |
| 4 | Your planned Friday night, accounted for. | left | Typed chat, sent, answered, then Friday turns green |
| 5 | And your unplanned Saturday morning, made up for. | right, **on the beat, before the Saturday message types** | Brunch inserts, targets go over in tomato, three meals go amber, targets settle under |
| 6 | All done with the help of Cadence. | top, centred | The chat alone at 23px, no week |

**No subheads anywhere.** Headers carry the whole argument.

### The crossings

Beat 2 crosses on the loading bar's own `transitionend`, so the copy lands on the
exact frame the recipe appears. Keep that one tied to the event, never to a timer.

Beat 5 crosses **on the beat**, so the Saturday headline is already up when the
Saturday message types itself. Jake's call 2026-08-15, reversing `e85cc02`, which
held the beat 4 copy through the typing and crossed on the rebalance: the held
copy read as lag, and the headline arriving after its own chat lost the join.

### Colour

Green marks the two out events, Dinner out and Brunch out. Amber `#B5811F` marks
the meals the rebalance rewrote and **stays** after the change lands, which
supersedes the earlier "amber is transient only" rule. Tomato marks the week
over target and resolves to green.

### Known open

1. **The wheel is captured** (`preventDefault`), so a visitor cannot scroll past
   this section. It must release once the clock reaches the end before this goes
   on the real page.
2. **Mobile** stacks under 1120px and is unverified at phone width.
3. **Case and voice.** Headers are set in sentence case against Jake's typed
   title case. Cadence's closing line reads "Yes. Nice work." rather than Jake's
   "Yes! Great job", to hold the no-personification rule. Both are Jake's call.
4. The piece holds at the end rather than looping.

### Verification note

Three separate CSS cascade bugs shipped invisibly during this build and were
each caught by measuring in a real browser, never by reading the code: an
inline `width:0` outranking the class that animated the loading bar, a
`.tslot.right .blurb` selector outranking `.blurb.on`, and a flex row letting an
invisible headline shove the visible one off centre. **Measure geometry and
computed style in the browser before believing a layout is right.**

---

## SUPERSEDED 2026-08-14: two sections, chat-first, scroll-driven

The single six-beat scene below is superseded. Jake's corrections, all taken:

| Correction | What changed |
|---|---|
| The visitor needs control, and autoplay is too slow | Scroll advances the beat. Each beat animates on entry at its own pace, so nothing smears mid-morph. |
| One scene is wrong | Two sections. Section A is intake only: video, recipe, list. Section B is the chat and the week. |
| The chat is not clear, and it must be the main show | The sentence is the headline, at display scale, centered. Cadence answers under it. |
| Show the chat becoming the calendar | A thread drops from the sentence onto the exact day it changed, and that day's cell turns. |
| The week is way too big | The week is a dense block, 7 columns of 54px. |
| No empty space inside the week | Cells and columns touch. Hairlines separate them, gaps do not. |
| The week numbers are too small and faint | The numbers are 32px mono in ink and green, labels in ink, never dim. |
| Words left, graphics right is not special enough | Both sections are centered compositions. The copy column is gone. |

**Still open:** the composition is centered and typographic, which answers "not
two columns" without yet answering "special and engaging." Mobile is still the
known gap.

---

## SUPERSEDED: the single six-beat scene — direction set 2026-08-14

**Built and running: `drafts/website/motion/scene.html`.**
Artifact: https://claude.ai/code/artifact/d8591b77-168d-48e2-bea0-3b5da05a8bcb

One recipe followed through one week, on one stage that never cuts. Every beat
transforms the object the previous beat left behind, because a cut would say
these are six features and a transformation says they are one system.

| Beat | What happens |
|---|---|
| 01 | A video drops into the capture field and the field accepts it. |
| 02 | The video becomes a recipe card: ingredients written in, then the numbers. |
| 03 | The card goes and the ingredients reflow into the week's one grocery list, in purchase units, with pantry lines struck through. |
| 04 | The list becomes the seven-day plan. Abstract meal marks, no meal names, one target row. |
| 05 | Chat: "having dinner out Friday." The camera pushes into Friday and dinner flips to green. |
| 06 | Chat: "ended up getting brunch out Saturday." Brunch inserts, the lunch it replaced folds away, the target row goes over in tomato, the weekend re-forms, the row returns under in green. |

**Beats 05 and 06 carry the product claim and must feel different.** Beat 05 is
a change told in advance. Beat 06 is a change that already happened. The
research says every persona quit at beat 06.

### Rules this scene set

- **Numbers appear twice, deliberately.** Once on the recipe card in beat 02,
  where they prove the extraction worked. Once as the week target row in beats
  04 to 06, where the over-and-back is the whole payoff. Never on a meal. This
  narrows the no-numbers rule rather than breaking it; per-meal badges are still
  what made five of six panel reviewers read the old board as a tracker.
- **Red is readmitted, transiently.** Tomato marks the week over target, and it
  resolves to green when the weekend re-forms. Red never marks the night out.
  It marks the unresolved state, and the resolution is the payoff.
- **The meal mark is a light fill with an ink left edge.** Solid ink fills across
  seven columns read as a barcode.
- **The target row lives outside the scaled stage** so it stays readable at
  every width.
- **The chat band is reserved** at the top of the stage and the week is clipped
  to its own port, so the two can never overlap.

### Format: an autoplaying HTML scene, not a video and not scroll-scrubbing

The content is the transformation, so pacing cannot belong to the visitor's
trackpad. A fast scroller lands mid-morph and sees a smear. The scene plays
itself, beat to beat, with a six-mark rail that can jump to a beat.

Screen-record the same scene to produce the vertical video the channel push
needs. `drafts/marketing-plan.md` already calls for a demo asset reusable as
vertical video, so one build serves both. Building the video first serves only
the video.

### Open on the scene

1. **Mobile.** At 390px the stage renders every mark at 46% and no one can read
   it. The fix is a portrait stage box for narrow screens. A harder camera zoom
   does not work, because the week port is 250 design px tall and scaling past
   about 1.6 crops the day. Named in the file.
2. **Where it sits on the page.** At roughly 34 seconds the scene is the page,
   not an illustration on it. Proposed: hero line, then the scene, then the five
   pain questions underneath.

### Rejected: the four structure skeletons

S1 to S4 (poster, ledger split, filmstrip, center stage) were all rejected on
2026-08-14 as too close to each other and too close to the old site.
**Artifact, kept for the record: https://claude.ai/code/artifact/5f9baade-6d50-4d9a-ab81-9ff2e96dea23**

| ID | Skeleton | How it stages the absorb |
|---|---|---|
| **S1** | The poster. One meal at headline scale; the swap is the whole event; the week is seven dots in a corner. | Shows the swap, hides the ripple |
| **S2** | The ledger split. Your sentence pinned left, the week stacked right reacting; rows compress and replace in place while untouched days dim. | Cause and effect in one gaze |
| **S3** | The filmstrip. Days as full panels on a horizontal strip you drag through; Friday flips mid-strip. Doubles as the phone's native gesture. | Buries cause and effect in a gesture |
| **S4** | The center stage. One centered statement at a time, cinema-style. "Friday changed." → "The week made room." → "Still on track. No math." | Cause and effect in one gaze |

They compose. One primary skeleton plus one supporting reads clean; more reads
chaotic. **Recommendation: S4 as the hero film, S2 as the how-it-works section,
S3 as the phone behavior.** The criterion is which structure stages the absorb
most undeniably, not which looks best.

---

## Reference artifacts

| Artifact | What it holds |
|---|---|
| [Copy deck + decisions v4](https://claude.ai/code/artifact/d1705499-e850-47a3-89fb-927b656da68e) | The decision record. Typeface, CTA, motion, title-tag rounds. |
| [The week that answers](https://claude.ai/code/artifact/42204f0c-8f58-4a63-b841-1e456a5ac4d8) | M2+M4 merged motion prototype, full scale, real Bricolage. |
| [Structure round](https://claude.ai/code/artifact/5f9baade-6d50-4d9a-ab81-9ff2e96dea23) | S1 to S4. The open decision. |
| [Divergence round](https://claude.ai/code/artifact/f2c2cf6e-885b-42e0-96b9-3376853f87c6) | Foreign visual worlds. Ticket stubs won on DNA, not costume. |
| [Ticket-DNA variations](https://claude.ai/code/artifact/444d2641-2b2e-449e-9f08-020b0bcfe029) | Chunky discrete units, heavy caps with mono data, one stamp-green state moment. |
| [Old landing, as shipped](https://claude.ai/code/artifact/17ad1021-cba0-497b-ac9e-fce34d8edcc6) | The superseded six-beat page, for comparison only. |

---

## What is superseded

- **The locked copy of 2026-07-30.** Retired by the reposition. Kept in
  `WEBSITE.md` under "Superseded copy".
- **The six-beat scroll sequence and the seven-day board.** Cut. The board's
  data density is the failure the reposition fixes.
- **Archivo + IBM Plex Mono.** Replaced by Bricolage Grotesque + Instrument
  Sans. Archivo was flagged as the default look.
- **The solid `#576860` button.** Replaced by the bare underlined CTA.
- **`drafts/site-map.md`.** Describes the persona-card landing in `app/page.tsx`.
- **The landing-v4 Eight Sleep photo anatomy.** Superseded 2026-08-04; specs in
  `archive/specs/`, exploration in `archive/website-exploration/` (gitignored,
  on disk).

The shipped pages in `drafts/website/site/` stay on disk and stay the deployable
artifact until the rebuild lands. They are the fallback, not the target.

---

## Still open

1. **The page structure** (S1 to S4 above). Blocks the rebuild.
2. **Confirm or reframe "the one thing"** at the top of this file.
3. **Whether the survey gains a GLP-1 question.** Proposed and never answered:
   "Have you considered a GLP-1 (Ozempic, Wegovy, Zepbound)?" with on one now /
   used one, stopped / considering but hesitant / not for me. It is plausibly
   the highest-signal question in the survey.
4. **The wiring spec.** `site/` into `app/`, porting the UTM→cta attribution
   chain, then deploy. The rebuild changes what gets wired, so this waits.

---

## Build order

1. Structure picked, then the full page prototype builds on it.
2. The visual pass rebuilds the real page: C4, Bricolage, container rule, the
   merged motion scene, arm's-length scale.
3. The wiring spec, then deploy.
4. Then the channel push. `drafts/marketing-posts.md` and
   `drafts/build-in-public.md` are blocked on a live URL.

---
---

# ARCHIVE — the 2026-08-04 record

**Everything below describes the shipped six-beat site.** It is superseded by
the reposition above. Read it for the reasoning and the motion craft, never as
the target.

The four-page validation site lives in `drafts/website/site/` as self-contained
HTML: landing (hero, six-beat scroll sequence, statement close with CTA),
`faq.html`, `waitlist.html` with the survey, `thanks.html`. The forms POST to
the app's real `/api/waitlist`, `/api/waitlist/survey`, and `/api/question`
endpoints.

Decisions baked in since 2026-07-30: ledger-style chat with both sides typing at
the input line; matte green `#576860` for all site chrome; surplus reads rust,
on-or-under reads green; the target never moves (1,900 / 150P / 185C / 62F); one
data model derives every footer figure; beat 06 greys each day as it completes;
scroll triggering is debounced and every animation timer is cancelled on beat
change. Hero photo: `spare-cooking-window.jpg`; close: `band-dinner-table.jpg`
(both inlined into index.html as base64).

## Superseded palette

| Token | Value | Role |
|---|---|---|
| cream | `#EFEDE6` | ground |
| card | `#FBFAF5` | card fill |
| ink | `#101010` | text, meal edge |
| grn | `#1B7F4B` | out & drinks, on-target, positive |
| rust | `#AF4A28` | snacks, off-target |
| dim | `#8A8A83` | secondary text |
| rule | `#B5B1A3` | dotted column rules |
| edge | `#D6D2C5` | card border |

Cream, card, ink, green, dim, and rule carry into C4. Rust is demoted by the
color rule. The card border is deleted by the container rule.

## Superseded week-view model

Two independent axes. **Rows say WHEN** (Breakfast, gap, Lunch, gap, Dinner,
gap). **Colour says WHAT** (meal = ink, snack = rust, out & drinks = green with
a 5px left edge).

Gap rows are unlabelled and hold snacks and drinks. They grow to fit however
many items a day has, so every row below stays aligned. This solved variable
snack counts, drinks that are not snacks, and time-of-day ordering without ever
showing a clock.

- Cards uniform 60px. Name (two fixed lines), calories bold mono, then
  `32P 44C 12F`.
- Missing **meals** show a dashed empty box. Missing snacks show nothing. A
  skipped dinner is information; a missing snack is not.
- No legend. Colour coding is unexplained by design.
- Footer: daily average / target / difference across calories, protein, carbs,
  fat. **Show the band, not the point.** Nothing ever lands exactly on target.
- Board has `min-width: 1280px` and scrolls horizontally below that.

Reference implementation: `drafts/website/cadence-week.html`. Verified zero
clipped names, zero wrapped macros, zero overflow at 1320 / 1000 / 760.

## Motion craft that carries forward

- Copy column is **real document flow**. The visual is `position: sticky` beside
  it.
- Beats fire on **IntersectionObserver trigger**, not scroll scrubbing. A set
  piece must play at its own pace; scrubbing lets a fast scroller blow past the
  payoff.
- Three motion classes: **A** scroll-linked, **B** triggered play-through, **C**
  ambient loop.
- Natural motion is **varied and overlapping, not bouncy.** Heavier things move
  slower. Secondary elements trail primary. Exits are faster than entrances.
  Nothing springs or overshoots.
- `prefers-reduced-motion` must reach every state.

## Files in `drafts/website/`

| File | What it is |
|---|---|
| `WEBSITE.md` | **Live copy deck**, positioning, audience, voice rules. |
| `site/` | The shipped four-page site. Superseded design, deployable fallback. |
| `motion/` | Per-beat previews and the assembled sequence. Motion reference. |
| `cadence-week.html` | The old locked week view. Superseded by the vignettes. |
