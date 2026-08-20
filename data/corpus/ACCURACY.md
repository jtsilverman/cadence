# Corpus accuracy study (2026-07-28)

## Post-fix re-audit (2026-07-29)

The three fixes the study called for were applied and the same deterministic samples re-audited. Raw verdicts: `data/corpus/shards/audit-2/` (per-vote verdicts + adjudicated `aggregate.json`; final batch `msgbatch_01X1ZJPJDujDDG9Z1ktNgyrp`, one unparseable v1 shard re-judged live).

**What was fixed:**

1. **Product flag rubric made deterministic** (`scripts/corpus/flag-rubric.mjs`, now the shared canonical rubric): any modified starch ALWAYS flags `gums-thickeners` (the unfalsifiable "as thickener" qualifier dropped); plain sugar/honey/maple and acid E-numbers (e270/e296/e330) are explicitly never `added-sugar-syrups`; `refined-flour` explicitly excludes whole-wheat/whole-grain/unbleached/non-wheat flours; `preservatives` instructs scanning trailing parentheticals ("to preserve freshness") for BHA/BHT/TBHQ/EDTA/sulfites/propionates/diphosphates. 4,491 at-risk products re-classified (`scripts/corpus/repass-flags.mjs`, batch `msgbatch_016y1JSAEh76J2DicvdNRTzQ` + a 196-product delta for cornstarch/foreign spellings); flags changed on 2,724 products (+2,690 flags, −1,338; biggest movers: gums-thickeners +552, preservatives +412, added-sugar-syrups +312, refined-flour −172).
2. **movementPattern enum extended** with `plyometric` and `dynamic-mobility`; 502 at-risk exercises re-judged (`scripts/corpus/retag-movement.mjs`, batch `msgbatch_01KnYYKb5L5indLVeNneeNT6`); 187 movementPattern + 60 mechanics tags corrected (incl. 3 manual overshoot corrections the re-audit agreed on: atlas stone → hinge, push press → push, skin-the-cat → pull).
3. **Judge-noise fix**: the audit now takes two independent judge votes per shard; an error counts only when BOTH votes report it AND it is mechanically consistent (a "missing" flag not already assigned, a "wrong" flag actually assigned — both judge failure modes were observed).

**Before/after (same 300-product / 100-exercise deterministic samples):**

| Metric | Study (single judge, hand-netted) | Post-fix (2-vote agreed) |
|---|---|---|
| Products fully clean | 241/300 raw judged (~80%) | 277/300 (92%) |
| Wrong flags | ~21 net of 674 (~3%) | 9 of 695 (1.3%) |
| Missing flags | ~23 net of 674 (~3%) | 17 of 695 (2.4%) |
| Exercises fully clean | 74/100 | 93/100 |
| Exercise errors | 3 major + 23 minor | 3 major + 4 minor |

Caveats: the adjudication also changed (2-vote agreement vs one judge hand-netted), so the delta overstates pure data improvement somewhat; even agreed rows still include self-refuting text (2 of the 9 "wrong" rows argue themselves correct), so the post-fix numbers remain an upper bound on true error. Residual known issues, deliberately out of scope: two strongman entries list equipment `none` because the equipment enum has no log/yoke implement; a handful of taxonomy judgment calls (tire flip, scissor kicks, battle-rope circles) where the two audit votes and the re-tag judge disagree about `plyometric`/`dynamic-mobility` boundaries; scattered single-flag misses with no shared cause.

---

Original study below (pre-fix numbers, kept for the record). Raw verdicts for it live in `data/corpus/shards/audit/`.

Study only — no corpus fixes applied. Raw verdicts: `data/corpus/shards/audit/` (`flag-verdicts.json`, `exercise-verdicts.json`, `aggregate.json`). Reproduce: `scripts/corpus/audit-accuracy.mjs` (deterministic hash-ordered samples), `scripts/corpus/check-ingredients-reference.mjs`.

## Method

- **Ingredients**: 10 staple foods checked against independently hand-entered USDA published per-100g values (±5% tolerance). Independent oracle, not the parser's own output.
- **Product flags**: 300-product sample (deterministic), judged by a truth-framed Sonnet batch judge (`msgbatch_01T3V4Umd872Y6WFsQ575ARM`; 2 unparseable shards re-judged live). Judge sees ingredient text + additives + assigned flags, cites evidence per error.
- **Exercises**: 100-entry sample, same judge pattern (fields checked: name, muscles, equipment, mechanics, movementPattern, metrics, difficulty, cues).

**Caveat — judge noise:** ~1/3 of the judge's error rows self-refute on reading (the cited "why" ends "...so this flag is actually correct" or "no missing flag needed"). Raw judged numbers are therefore an **upper bound** on true error; the "net" numbers below exclude self-refuting rows by hand-reading all 68.

## Results

| Corpus | Sample | Fully clean (judged) | Error rate |
|---|---|---|---|
| Ingredients (8,059) | 10 staples | 10/10 | 0 observed |
| Product flags (17,609 flagged) | 300 products, 674 flags | 241/300 products | ~21 wrong + ~23 missing flags net (~3% FP, ~3% FN per flag) |
| Exercises (1,185) | 100 entries | 74/100 | 3 major + 23 minor errors |

## Product flags: systematic vs random

**Systematic (4 patterns, ~80% of net errors):**

1. **Modified food starch — inconsistent both directions** (biggest cluster: 11 wrong + 2 missing rows touch it). The rubric says "modified food starch **as thickener**", but role is undecidable from a label; the classifier sometimes flags it, sometimes not, and the judge is equally split. Rubric defect, not model noise: the criterion is unfalsifiable from the input.
2. **`added-sugar-syrups` false positives on non-syrups** (~5 net): flagged on plain sugar, citric acid (e330), lactic acid (e270). Plain sugar is explicitly not flaggable per rubric.
3. **`refined-flour` false positives on any "wheat flour" string** (3 net): whole wheat pizza crust, unbleached sourdough, a gluten-free flour blend — none are enriched/bleached/white.
4. **`preservatives` false negatives on parenthetical mentions** (~6 net): BHA/BHT ("to preserve freshness"), calcium disodium EDTA ("to protect flavor"), sodium sulfite (e221), diphosphate. The trailing-parenthetical position seems to hide them.

**Random (low-rate):** occasional misses of literal gum names (locust bean, xanthan, cellulose gum + carrageenan), generic "vegetable oil"/sunflower oil seed-oil misses, one green-tea-extract caffeine miss, two hydrogenated-oil trans-fat misses, one truncated-text natural-flavors call. No shared cause; scattered across flag types and products.

## Exercises: systematic vs random

**Systematic — `movementPattern` enum coverage gap (14 of 26 errors, including all 3 major).** The enum (push/pull/hinge/squat/lunge/carry/rotation/gait/isometric) has no plyometric/jump or dynamic-mobility category, so the classifier shoehorns:
- Jumps/hops (box-jump-burpee, vertical hop, hurdle hop, pogo) → labeled `gait`.
- Dynamic/ballistic moves (leg swings, scissor kicks, skin-the-cat, ab-wheel rollout) → labeled `isometric` — all 3 major errors are this shape.
- Olympic/explosive lifts (snatches, tire flip) → flattened to `hinge`.

**Semi-systematic — compound/isolation on static holds and bodyweight coordination moves (7 minor):** yoga poses (upward dog, warrior 1), holds (wall sit, tuck planche, false-grip hang), hops — labeled `isolation` where compound is at least defensible. Genuine taxonomy ambiguity for non-lifting movements.

**Random (5 minor):** primaryMuscles judgment calls (quads on kettlebell presses, pecs on cobra pose), one setup inconsistency (decline cable press pulley height), one laterality call. No pattern.

## Conclusions

- **Ingredients**: trustworthy as-is (USDA-sourced, spot-check clean).
- **Product flags**: ~94% of assigned flags survive audit; errors concentrate in 4 fixable rubric/classifier patterns, not diffuse noise. Highest-value future fix: make the modified-food-starch rule deterministic (always-flag or never-flag) and re-run the 4 patterns as targeted passes — not a full reclassification.
- **Exercises**: 97/100 free of major error; the fix is one enum extension (plyometric + dynamic-mobility patterns) plus a re-tag pass over ballistic/jump/hold movements, not per-entry cleanup.
- **Method note**: a single truth-framed judge still self-refutes on ~1/3 of its flagged rows; any future audit should add a second adjudication pass (or majority vote) before treating judged error counts as true rates.
