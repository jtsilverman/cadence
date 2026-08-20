// Validate all three corpus files: schema, enums, uniqueness, coverage.
// Usage: node scripts/corpus/validate.mjs   (exits non-zero on any failure)

import { readFileSync } from "node:fs";

const ENUMS = {
  modality: ["strength", "cardio", "plyometric", "mobility", "yoga", "carry"],
  equipment: ["barbell", "ez-bar", "trap-bar", "dumbbell", "kettlebell", "cable", "machine", "smith-machine", "bodyweight", "resistance-band", "suspension", "medicine-ball", "plate", "bench", "pull-up-bar", "dip-station", "box", "sled", "sandbag", "battle-ropes", "jump-rope", "rower", "treadmill", "bike", "elliptical", "stairmaster", "ski-erg", "assault-bike", "foam-roller", "log", "yoke", "none"],
  muscles: ["pectorals", "lats", "traps", "rhomboids", "lower-back", "front-delts", "side-delts", "rear-delts", "biceps", "triceps", "forearms", "quads", "hamstrings", "glutes", "calves", "tibialis", "abs", "obliques", "hip-flexors", "adductors", "abductors", "neck", "full-body", "cardiovascular"],
  laterality: ["bilateral", "unilateral", "none"],
  metrics: ["weight", "reps", "time", "distance", "pace", "incline", "resistance-level", "height", "calories"],
  mechanics: ["compound", "isolation"],
  movementPattern: ["push", "pull", "hinge", "squat", "lunge", "carry", "rotation", "gait", "isometric", "plyometric", "dynamic-mobility"],
  difficulty: ["beginner", "intermediate", "advanced"],
  flags: ["seed-oils", "hfcs", "added-sugar-syrups", "artificial-sweeteners", "sugar-alcohols", "gums-thickeners", "preservatives", "artificial-colors", "artificial-flavors", "natural-flavors", "msg-flavor-enhancers", "nitrates-nitrites", "trans-fat-hydrogenated", "emulsifiers", "refined-flour", "caffeine"],
};

const errors = [];
const err = (file, id, msg) => errors.push(`${file} [${id}]: ${msg}`);

// --- exercises.json ---
const exercises = JSON.parse(readFileSync("data/corpus/exercises.json", "utf8"));
{
  const ids = new Set();
  for (const e of exercises) {
    const w = (m) => err("exercises", e.id ?? "?", m);
    if (!e.id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(e.id)) w("bad id");
    if (ids.has(e.id)) w("duplicate id");
    ids.add(e.id);
    if (!e.name) w("missing name");
    if (!Array.isArray(e.aliases)) w("aliases not array");
    if (!ENUMS.modality.includes(e.modality)) w(`bad modality ${e.modality}`);
    if (!Array.isArray(e.equipment) || e.equipment.some((x) => !ENUMS.equipment.includes(x))) w("bad equipment");
    if (!Array.isArray(e.primaryMuscles) || e.primaryMuscles.length === 0 || e.primaryMuscles.some((x) => !ENUMS.muscles.includes(x))) w("bad primaryMuscles");
    if (!Array.isArray(e.secondaryMuscles) || e.secondaryMuscles.some((x) => !ENUMS.muscles.includes(x))) w("bad secondaryMuscles");
    if (!ENUMS.laterality.includes(e.laterality)) w(`bad laterality ${e.laterality}`);
    if (!Array.isArray(e.metrics) || e.metrics.length === 0 || e.metrics.some((x) => !ENUMS.metrics.includes(x))) w("bad metrics");
    if (!ENUMS.mechanics.includes(e.mechanics)) w(`bad mechanics ${e.mechanics}`);
    if (!ENUMS.movementPattern.includes(e.movementPattern)) w(`bad movementPattern ${e.movementPattern}`);
    if (!ENUMS.difficulty.includes(e.difficulty)) w(`bad difficulty ${e.difficulty}`);
    if (!Array.isArray(e.formCues) || e.formCues.length < 2) w("formCues < 2");
    if (typeof e.setup !== "string" || !e.setup) w("missing setup");
    if (!Array.isArray(e.commonMistakes) || e.commonMistakes.length < 1) w("commonMistakes empty");
  }
  if (exercises.length < 800) err("exercises", "-", `only ${exercises.length} entries (<800)`);

  // variationOf: target must exist, not be itself, and be a canonical (variationOf: null) --
  // one level deep only, no chains.
  const byId = new Map(exercises.map((e) => [e.id, e]));
  let linked = 0;
  for (const e of exercises) {
    if (e.variationOf === null || e.variationOf === undefined) continue;
    const w = (m) => err("exercises", e.id ?? "?", m);
    linked++;
    if (e.variationOf === e.id) { w(`variationOf self`); continue; }
    const parent = byId.get(e.variationOf);
    if (!parent) { w(`dangling variationOf ${e.variationOf}`); continue; }
    if (parent.variationOf !== null && parent.variationOf !== undefined) w(`chained variationOf: ${e.variationOf} is itself a variant (of ${parent.variationOf})`);
  }
  console.log(JSON.stringify({ exercisesLinked: linked, exercisesStandalone: exercises.length - linked }));
}

// --- ingredients.json ---
const ingredients = JSON.parse(readFileSync("data/corpus/ingredients.json", "utf8"));
{
  const ids = new Set();
  for (const f of ingredients) {
    const w = (m) => err("ingredients", f.fdcId ?? "?", m);
    if (!Number.isInteger(f.fdcId)) w("bad fdcId");
    if (ids.has(f.fdcId)) w("duplicate fdcId");
    ids.add(f.fdcId);
    if (!f.name) w("missing name");
    if (!["sr-legacy", "foundation"].includes(f.source)) w(`bad source ${f.source}`);
    if (typeof f.per100g?.kcal !== "number") w("missing kcal");
    for (const [k, v] of Object.entries(f.per100g ?? {})) {
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) w(`bad nutrient ${k}=${v}`);
    }
    if (!Array.isArray(f.portions)) w("portions not array");
    for (const p of f.portions ?? []) {
      if (!p.description || typeof p.gramWeight !== "number" || p.gramWeight <= 0) w("bad portion");
    }
  }
}

// --- products.json ---
const products = JSON.parse(readFileSync("data/corpus/products.json", "utf8"));
{
  const codes = new Set();
  let classified = 0;
  for (const p of products) {
    const w = (m) => err("products", p.barcode ?? "?", m);
    if (!p.barcode || !/^\d{4,14}$/.test(p.barcode)) w(`bad barcode ${p.barcode}`);
    if (codes.has(p.barcode)) w("duplicate barcode");
    codes.add(p.barcode);
    if (!p.name) w("missing name");
    if (typeof p.per100g?.kcal !== "number") w("missing kcal");
    if (p.flags !== null) {
      classified++;
      if (!Array.isArray(p.flags) || p.flags.some((x) => !ENUMS.flags.includes(x))) w(`bad flags ${JSON.stringify(p.flags)}`);
    }
  }
  console.log(JSON.stringify({
    exercises: exercises.length,
    ingredients: ingredients.length,
    products: products.length,
    productsClassified: classified,
    errors: errors.length,
  }));
}

if (errors.length) {
  console.error(errors.slice(0, 50).join("\n"));
  if (errors.length > 50) console.error(`...and ${errors.length - 50} more`);
  process.exit(1);
}
console.log("VALIDATION PASS");
