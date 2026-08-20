// Parse USDA FoodData Central bulk CSVs (public domain) into data/corpus/ingredients.json.
// Usage: node scripts/corpus/parse-fdc.mjs <srLegacyDir> <foundationDir> [outPath]
// Each dir is an unzipped FDC CSV dataset containing food.csv, food_nutrient.csv, food_category.csv.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const [srDir, foundationDir, OUT = "data/corpus/ingredients.json"] = process.argv.slice(2);
if (!srDir || !foundationDir) {
  console.error("usage: parse-fdc.mjs <srLegacyDir> <foundationDir> [outPath]");
  process.exit(1);
}

// nutrient.id -> our key. Amounts are per 100g. Units: kcal; macros/fat breakdown g;
// minerals + cholesterol mg (except selenium µg); vitamins as noted (µg or mg per FDC).
const NUTRIENTS = {
  1008: "kcal",
  2047: "kcalAtwaterGeneral", // Foundation fallback for energy
  1003: "protein",
  1004: "fat",
  1258: "satFat",
  1257: "transFat",
  1292: "monoFat",
  1293: "polyFat",
  1253: "cholesterolMg",
  1005: "carbs",
  1079: "fiber",
  2000: "sugar",
  1093: "sodium",
  1092: "potassiumMg",
  1087: "calciumMg",
  1089: "ironMg",
  1090: "magnesiumMg",
  1091: "phosphorusMg",
  1095: "zincMg",
  1098: "copperMg",
  1103: "seleniumUg",
  1106: "vitaminAUg",
  1162: "vitaminCMg",
  1114: "vitaminDUg",
  1109: "vitaminEMg",
  1185: "vitaminKUg",
  1165: "thiaminMg",
  1166: "riboflavinMg",
  1167: "niacinMg",
  1175: "vitaminB6Mg",
  1177: "folateUg",
  1178: "vitaminB12Ug",
};

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); field = ""; rows.push(row); row = []; }
    else if (c !== "\r") field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function loadDataset(dir, source, dataType) {
  const csv = (name) => {
    try {
      return parseCsv(readFileSync(join(dir, name), "utf8"));
    } catch {
      return null;
    }
  };

  const catRows = csv("food_category.csv");
  const categories = new Map();
  if (catRows) {
    const catCols = Object.fromEntries(catRows[0].map((h, i) => [h, i]));
    for (const r of catRows.slice(1)) categories.set(r[catCols.id], r[catCols.description]);
  }

  const foodRows = csv("food.csv");
  const foodCols = Object.fromEntries(foodRows[0].map((h, i) => [h, i]));
  const foods = new Map();
  for (const r of foodRows.slice(1)) {
    if (r[foodCols.data_type] !== dataType) continue;
    foods.set(r[foodCols.fdc_id], {
      fdcId: Number(r[foodCols.fdc_id]),
      name: r[foodCols.description],
      category: categories.get(r[foodCols.food_category_id]) ?? null,
      source,
      per100g: {},
      portions: [],
    });
  }

  // Household portions (cup/tbsp/piece -> gram weight) for unit conversion.
  const unitRows = csv("measure_unit.csv");
  const units = new Map();
  if (unitRows) {
    const uCols = Object.fromEntries(unitRows[0].map((h, i) => [h, i]));
    for (const r of unitRows.slice(1)) units.set(r[uCols.id], r[uCols.name]);
  }
  const portionRows = csv("food_portion.csv");
  if (portionRows) {
    const pCols = Object.fromEntries(portionRows[0].map((h, i) => [h, i]));
    for (const r of portionRows.slice(1)) {
      const food = foods.get(r[pCols.fdc_id]);
      if (!food) continue;
      const gramWeight = Number(r[pCols.gram_weight]);
      if (!Number.isFinite(gramWeight) || gramWeight <= 0) continue;
      const amount = r[pCols.amount];
      const unitName = units.get(r[pCols.measure_unit_id]);
      const description = [
        amount && Number(amount) > 0 ? amount : null,
        unitName && unitName !== "undetermined" ? unitName : null,
        r[pCols.modifier] || r[pCols.portion_description] || null,
      ]
        .filter(Boolean)
        .join(" ");
      if (description) food.portions.push({ description, gramWeight });
    }
  }

  const nutRows = csv("food_nutrient.csv");
  const nutCols = Object.fromEntries(nutRows[0].map((h, i) => [h, i]));
  for (const r of nutRows.slice(1)) {
    const food = foods.get(r[nutCols.fdc_id]);
    const key = NUTRIENTS[r[nutCols.nutrient_id]];
    if (!food || !key) continue;
    const amount = Number(r[nutCols.amount]);
    // Carbs-by-difference can come out slightly negative in FDC; clamp analytic artifacts.
    if (Number.isFinite(amount)) food.per100g[key] = Math.max(0, amount);
  }

  for (const food of foods.values()) {
    if (food.per100g.kcal == null && food.per100g.kcalAtwaterGeneral != null) {
      food.per100g.kcal = food.per100g.kcalAtwaterGeneral;
    }
    delete food.per100g.kcalAtwaterGeneral;
  }
  return [...foods.values()];
}

const sr = loadDataset(srDir, "sr-legacy", "sr_legacy_food");
const foundation = loadDataset(foundationDir, "foundation", "foundation_food");
console.log(`sr-legacy: ${sr.length} foods; foundation: ${foundation.length} foods`);

// Foundation entries are fresher; keep both, but drop an SR row whose name exactly
// matches a Foundation row (case-insensitive) to avoid obvious duplicates.
const foundationNames = new Set(foundation.map((f) => f.name.toLowerCase()));
const merged = [
  ...foundation,
  ...sr.filter((f) => !foundationNames.has(f.name.toLowerCase())),
].filter((f) => f.per100g.kcal != null);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(merged));
console.log(`wrote ${merged.length} ingredients to ${OUT}`);
