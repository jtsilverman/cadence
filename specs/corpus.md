# Spec: corpus (the two overnight corpus tasks)

Jake's direction (2026-07-27, /loop overnight): complete both queued corpus tasks from drafts/UX-v2.md thoroughly. Sonnet subagents + dynamic workflows; Fable/Opus not used for generation. Goal-set addendum: maximize captured information now (richer fields > lean seed) so the loop doesn't have to run twice.

## Intent

Build the two seed corpora the UX v2 systems depend on:

1. **Exercise corpus** (UX-v2.md:29): THE canonical exercise source — every cardio, machine, dumbbell/cable/barbell variation, bilateral/unilateral variants, with modality-typed metrics and canonical units.
2. **Ingredient/product macro corpus with barcodes + flags** (UX-v2.md:56-57): whole-food ingredient macros (USDA FDC, public domain), popular US products with barcodes + macros (Open Food Facts), and the AI flag classifier pass over product ingredient lists (preservatives, seed oils, gums, HFCS, artificial sweeteners, etc.).

## Acceptance

- `data/corpus/exercises.json`: ≥800 unique exercises, every entry schema-valid (enums enforced), deduped by id, coverage verified per category by an independent critic pass (loop-until-dry: rounds continue until critics find no material gaps). Round 2 enrichment adds per exercise: `mechanics` (compound|isolation), `movementPattern` (push|pull|hinge|squat|lunge|carry|rotation|gait|isometric|plyometric|dynamic-mobility; last two added 2026-07-28 after the accuracy study), `difficulty` (beginner|intermediate|advanced), `formCues` (3-5 strings), `setup` (1 string), `commonMistakes` (2-4 strings).
- `data/corpus/ingredients.json`: USDA FDC SR Legacy + Foundation Foods parsed to a full per-100g panel (kcal, protein, fat/sat/trans/mono/poly, cholesterol, carbs, fiber, sugar, sodium + minerals + vitamins; 31 keys) plus household portions with gram weights (unit conversion source). **Done 2026-07-27: 8,059 foods, 7,558 with portions.**
- `data/corpus/products.json`: top ~20,000 US products by scan popularity from OFF — barcode (code), name, brand, serving size/quantity, full nutriments, ingredient text, categories, additives_tags, allergens/traces, labels, NOVA group, Nutri-Score, and `flags[]` from the classifier pass (only products with a non-empty ingredient list or additives_tags get classified).
- Provenance + license note per source (FDC public domain; OFF ODbL — attribution required).
- All scripts rerunnable: `scripts/corpus/*.mjs`.

## Non-goals

- No runtime/API integration into the app (schema consumers come later, with UX v2 build).
- No modeling of every sub-ingredient of every product (UX-v2.md:49).
- No browser automation; compliant public APIs/bulk downloads only.
- Not MFP-scale millions of products — this is the seed corpus; runtime barcode lookups fall through to OFF live.

## Schemas (canonical units: kg, meters, seconds; display conversion is a UI concern)

### Exercise
```json
{
  "id": "barbell-bench-press",
  "name": "Barbell Bench Press",
  "aliases": ["flat bench press"],
  "modality": "strength|cardio|plyometric|mobility|yoga|carry",
  "equipment": ["barbell", "bench"],
  "primaryMuscles": ["pectorals"],
  "secondaryMuscles": ["triceps", "front-delts"],
  "laterality": "bilateral|unilateral|none",
  "metrics": ["weight", "reps"],
  "variationOf": "bench-press or null"
}
```
- equipment enum: barbell, ez-bar, trap-bar, dumbbell, kettlebell, cable, machine, smith-machine, bodyweight, resistance-band, suspension, medicine-ball, plate, bench, pull-up-bar, dip-station, box, sled, sandbag, battle-ropes, jump-rope, rower, treadmill, bike, elliptical, stairmaster, ski-erg, assault-bike, foam-roller, log, yoke, none
- muscle enum: pectorals, lats, traps, rhomboids, lower-back, front-delts, side-delts, rear-delts, biceps, triceps, forearms, quads, hamstrings, glutes, calves, tibialis, abs, obliques, hip-flexors, adductors, abductors, neck, full-body, cardiovascular
- metrics enum: weight, reps, time, distance, pace, incline, resistance-level, height, calories

### Ingredient (per 100g)
```json
{ "fdcId": 123, "name": "Butter, salted", "category": "Dairy and Egg Products", "source": "sr-legacy|foundation", "per100g": { "kcal": 717, "protein": 0.85, "fat": 81.1, "satFat": 51.4, "carbs": 0.06, "fiber": 0, "sugar": 0.06, "sodium": 643 } }
```

### Product
```json
{ "barcode": "0038000138416", "name": "...", "brand": "...", "servingSize": "30 g", "per100g": { ... }, "perServing": { ... }, "ingredientsText": "...", "flags": ["seed-oils", "preservatives"] }
```
- flag enum: seed-oils, hfcs, added-sugar-syrups, artificial-sweeteners, sugar-alcohols, gums-thickeners, preservatives, artificial-colors, artificial-flavors, natural-flavors, msg-flavor-enhancers, nitrates-nitrites, trans-fat-hydrogenated, emulsifiers, refined-flour, caffeine, none

## Progress

- [x] Worktree `.worktrees/corpus`, branch `feat/corpus` from main
- [x] Live probes: OFF v2 search OK (User-Agent required; use `countries_tags=en:united-states`), FDC bulk CSVs OK
- [x] Exercise corpus: 5 rounds (19 Sonnet territory generators → merge/dedup → enrichment → critic sweeps until dry; gap curve 82→30→13→0). **1,185 exercises, 100% enriched, 0 invalid.**
- [x] Ingredients: FDC bulk parse. **8,059 foods, 31-nutrient panel, 7,558 with household portions.**
- [x] Products: OFF full-export parse (API was 503-degraded; pivoted to the S3 daily export, strict US-only tag for ranking since the export lacks `popularity_key`). **20,000 products with barcodes + macros.**
- [x] Flag classifier: workflow round 1 (16,930 via Sonnet subagents) + delta via **Message Batches API** (Jake's directive; thinking disabled + effort low after adaptive thinking burned the output budget and truncated JSON — observed msgbatch_013ftDVMzHoZf3GfHaffxc1m). **17,609/17,609 classifiable products flagged.**
- [x] `scripts/corpus/validate.mjs` green over all three files: **0 errors** (2026-07-28)
- [x] **Accuracy study (done 2026-07-28).** Ingredients 10/10 vs independent USDA reference. Product flags: 300 sampled, 241 fully clean; net ~21 wrong + ~23 missing of 674 flags (~3% each way), 4 systematic patterns (modified-food-starch rubric ambiguity, syrup FPs on sugar/acids, refined-flour FPs on non-white flours, preservative FNs on parenthetical BHA/BHT/EDTA). Exercises: 100 sampled, 74 clean, 3 major all from a movementPattern enum gap (no plyometric/dynamic category). Full report: `data/corpus/ACCURACY.md`; raw verdicts `data/corpus/shards/audit/`. Study only — fixes not applied. Next: `variationOf` linking pass (docketed in `drafts/UX-v2.md`).
- [x] **Corpus fix pass (done 2026-07-29, `feat/corpus-fixes`).** Rubric made deterministic (shared `scripts/corpus/flag-rubric.mjs`), 4,491 at-risk products re-classified (flags changed on 2,724); movementPattern enum extended with plyometric/dynamic-mobility, 502 exercises re-tagged (187 pattern + 60 mechanics corrections); re-audit upgraded to 2-vote adjudication with mechanical consistency guard. Post-fix: products 277/300 clean (9 wrong + 17 missing of 695 flags), exercises 93/100 clean (3 major + 4 minor). Full report: `data/corpus/ACCURACY.md` top section; raw verdicts `data/corpus/shards/audit-2/`.
- [x] **`variationOf` linking pass (done 2026-07-29, `feat/corpus-variation-of`).** `scripts/corpus/link-variations.mjs`: cheap in-code clustering (movementPattern + curated name-stems + shared-token connected components) grouped 1,185 exercises into 131 candidate families (1,067 entries) + 118 guaranteed-standalone singletons; each family judged twice independently via the Message Batches API (batch `msgbatch_01WaEniswuZezGn8NLC5Q5gb`, 262 requests), a link applied only on exact two-vote agreement. **Found in-flight:** origin/main already carried 740/1,185 non-null `variationOf` values from the original per-territory generation pass (never cross-verified, 16 already two levels deep / chained) — this pass treats that as unverified and starts every exercise from `null`, so every surviving link now has actual two-vote evidence behind it. Result: **538 linked, 647 standalone, 156 disagreements** (left null, listed in `data/corpus/shards/link-variations/disagreements.json`; a real chunk of these are "same family, different canonical pick" splits, e.g. dumbbell-curl vs barbell-curl as the curl family's root, not judgment errors — a candidate for a future canonical-only re-vote, out of scope here). `validate.mjs` extended to check every link's target exists, isn't itself, and isn't chained (parent must be `variationOf: null`): **0 errors**. Also closed the equipment-enum gap flagged by the last audit: added `log`/`yoke`, corrected 5 mistagged strongman entries (4 log-press-family + yoke-walk) that carried `equipment: ["none"]`.
