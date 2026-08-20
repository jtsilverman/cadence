# Every eval is authored before reading the code it tests

**Picked:** write each scenario from the user's chair, derived from `ux.md` promises and what a
person would reasonably expect, before opening the implementation.

**Rejected:** writing tests from the code, which is the default and the reason most suites pass while
the product is broken.

**Reason:** a test that mirrors what the code happens to do can only catch a regression against
today's behavior. It cannot catch behavior that was wrong from the start, and it cannot notice a
missing capability. Authoring blind makes the suite a demand signal rather than a snapshot.

**What this constrains:**

- Three demand tiers in every suite. The happy path a user lives daily. The sloppy path: double-taps,
  typos, refresh mid-flow, dictation garble, an 11:58pm log, the back button. The hostile path:
  injection-shaped strings, prompt injection, oversized input, type confusion.
- Every step asserts the screen state **and** the diary event behind it. A checkmark with no event
  fails. An event with no visible receipt fails.
- Every failure lands in exactly one bucket: **FIX (class)**, patched at the layer that kills the
  whole category, RED first; **FLAG (feature gap)**, a legitimate want that is roadmap, reported with
  the honest current behavior pinned; **FLAG (out of scope)**, recorded with reasoning and not
  patched.
- `evals/report.md` is the deliverable. Jake reads the report, not the diff.
- Chat cases run N greater than or equal to 3 because the model is nondeterministic, and flakes are
  tracked separately from failures.
- Grading a chat reply is two channels and both must pass: deterministic database assertions, and an
  LLM judge against the case rubric with the actually-written events injected as ground truth. A
  claimed action with no event is an automatic fail.
- Safety is a release blocker at 100%. Food-logging accuracy targets 90% within tolerance.
  `npm run eval:chat` exits nonzero below either line.
- Fixtures are three seeded households (`fresh`, `week3`, `messy`), one fresh database per story.
  Playwright pins `workers: 1` because stories reset the shared database.

**A verification lesson this produced:** a scripted multi-beat demo needs two passes. A
state-by-state pass, jumping to each beat and checking the math and the DOM, catches stale computed
values and hardcoded numbers. A separate real-time playback pass catches transition-only glitches
like stale element references and mid-animation border fragments. The two-pass loop found seven
distinct bugs across both classes.

**What would reopen it:** nothing. The charter at `evals/charter.md` is canonical; read it before
writing an eval.
