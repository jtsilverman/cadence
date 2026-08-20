# Spec: units-fullness (rough-pantry upgrade)

Jake's direction (2026-07-26): pantries are rough — people think "almost out of cereal," not "163 g left." Handle real-world unit variety honestly; show remaining stock as cooking capacity, not raw measurement.

North-star framing (Jake, saved in UX.md § the pantry question): the real user question is "will X last until my next grocery run?" — answered against shopping cadence + the planned week. This spec's "~N cooks left" chip is the deliberate stepping stone (cook-history capacity, no persisted week plan needed); the horizon-based answer lands with P3's planner/Replenisher.

**Intent.** Two upgrades to the pantry math. (1) Same-dimension unit conversion: 8 oz of beef arriving into a pantry holding 1 lb becomes 1.5 lb; cooking 100 g from it subtracts correctly — instead of today's degrade-to-unknown. Cross-dimension (cups ↔ grams) still degrades honestly (density is per-ingredient knowledge we don't have). (2) Fullness: pantry items with cooking history show "~N cooks left" derived from the diary (current qty ÷ that item's average per-cook usage), with an "almost out" state at ≤1 — the app speaks in meals, not grams.

**Acceptance criteria.**
1. Inflow in a different unit of the same dimension converts and sums: assert 1 lb beef, inflow 8 oz → pantry shows 1.5 lb (display unit = the item's existing unit). Cook 100 g from 1 lb → 0.78 lb (storage keeps the full float; display and test assertions round to 2 decimals, `toBeCloseTo(x, 2)`). Mass (g/kg/oz/lb) and volume (ml/l/tsp/tbsp/fl oz/cup) tables; count and null-unit merge only with themselves, unchanged.
2. Unit aliases normalize before comparison: "cups"/"cup", "lbs"/"pound"/"lb", "grams"/"g", "tablespoons"/"tbsp", "teaspoons"/"tsp", "ounces"/"oz", case-insensitive. `sameUnit` and all conversion go through one canonicalizer.
3. Cross-dimension (2 cups flour − 100 g flour) still degrades to present-unknown — no invented density math.
4. Cart aggregation merges same-name lines of the same dimension into one line (converted into the first line's unit) instead of dumb-concat; different dimensions still concat.
5. Pantry page: items with ≥1 prior RecipeCooked decrement in a convertible unit show "~N cooks left" (N = qty ÷ average per-cook amount, rounded to halves); N ≤ 1 renders as "almost out". Items without cook history show nothing new. Mixed cook history: only cooks whose unit converts into the item's current dimension count toward the average; incompatible cooks are excluded, and the chip renders when >=1 compatible cook exists. Derivation is a pure reader over the event log — no schema change, no new table.
6. The P1 rebuild invariant (recipe-groceries-mvp.md criterion 7) holds: wipe pantry_view, rebuild from log → identical, conversions deterministic in the fold.
7. Precision semantics unchanged (weaker-of-inputs); conversion itself does not degrade precision.

**Supersedes note.** This narrows the P1 spec's non-goal "quantity-precise pantry math": same-dimension unit conversion is now in scope; cross-dimension math and gram-level truth-keeping remain out (the rough-counts dial stands — conversion serves honesty of merges, not precision theater).

**Non-goals.** Cross-dimension/density conversion — logged future idea (Jake): on-demand density lookup (web search) cached per item; needs its own design pass for source trust (P3+). Learned replenishment suggestions ("buy more cereal") — P3 Replenisher. Rewriting stored event payloads (diary is append-only; conversion happens at fold/read time). Per-item allowed-unit registries. UI unit-switcher.

**Orientation.** All in-session: fold + sameUnit + weaker live in lib/pantry.ts (sameUnit is the seam the canonicalizer replaces); cart merge key in lib/cart.ts `aggregateIngredients` ((name, unit) → becomes (name, dimension) with conversion); fullness = new pure fn over `readEvents` output, surfaced through GET /api/pantry and the pantry page. RecipeCooked payloads already snapshot ingredients {name, qty, unit} — the per-cook usage data exists back to unit 6. Risk: fold change alters computed views for existing logs where mixed units previously degraded — intended, deterministic, rebuild heals.

**Decomposition.**
1. `lib/units.ts`: canonicalizer + dimension tables + `convert(qty, fromUnit, toUnit)`; fold + sameUnit swap onto it (criteria 1-3, 6-7).
2. Cart merge by dimension (criterion 4).
3. Fullness reader + pantry UI chip (criterion 5).

**Test strategy.** Unit tests per conversion table + aliases + cross-dimension refusal; fold tests extended (mixed-unit inflow/cook); cart merge cases; fullness derivation on a synthetic diary (2 cooks → average right, halves rounding, no-history absence); wipe-and-rebuild extended with mixed-unit events. No LLM involvement anywhere — zero API cost.

## Open questions
- None blocking. Density-lookup idea parked in non-goals.

## Progress
- 2026-07-26: Drafted from Jake's direction in-session. Reviewer findings (4) folded in. Signed off by Jake 2026-07-26 ("clear and build").
- 2026-07-26: **Built, all 3 units done.** Unit 1: lib/units.ts (canonicalizer + mass/volume tables + convert) and fold swapped onto it, sameUnit deleted; wipe-and-rebuild invariant extended with mixed-unit events (sabotage-proven). Unit 2: cart merges same-name lines by dimension into the first line's unit. Unit 3: lib/fullness.ts cooksLeft reader, cooks_left through GET/POST /api/pantry, pantry chip (~N cooks left / almost out), qty display rounded to 2 decimals. 118 tests green, tsc clean. Live-verified 9/9 on a scratch db (oz→lb inflow 1.5, g cook to 1.2795, cooks_left 6→2→1, "almost out" chip in UI, cross-dimension flour degrade). Reviewer: CLEAN. PR open, awaiting Jake's merge.
