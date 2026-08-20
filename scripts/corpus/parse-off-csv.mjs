// Parse the OFF full CSV export (TSV, gzipped) into data/corpus/products.json:
// US products, top N by unique_scans_n, normalized schema (flags null until classifier pass).
// Usage: node scripts/corpus/parse-off-csv.mjs <export.csv.gz> [topN] [outPath]

import { createReadStream, writeFileSync, mkdirSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { createInterface } from "node:readline";
import { dirname } from "node:path";

const [GZ, TOP_N = "20000", OUT = "data/corpus/products.json"] = process.argv.slice(2);
if (!GZ) {
  console.error("usage: parse-off-csv.mjs <export.csv.gz> [topN] [outPath]");
  process.exit(1);
}

// export column name -> [ourKey, factor] for the per-100g panel (g -> mg where noted)
const NUTRIENT_COLS = [
  ["energy-kcal_100g", "kcal", 1],
  ["proteins_100g", "protein", 1],
  ["fat_100g", "fat", 1],
  ["saturated-fat_100g", "satFat", 1],
  ["trans-fat_100g", "transFat", 1],
  ["monounsaturated-fat_100g", "monoFat", 1],
  ["polyunsaturated-fat_100g", "polyFat", 1],
  ["cholesterol_100g", "cholesterolMg", 1000],
  ["carbohydrates_100g", "carbs", 1],
  ["fiber_100g", "fiber", 1],
  ["sugars_100g", "sugar", 1],
  ["added-sugars_100g", "addedSugar", 1],
  ["sodium_100g", "sodiumMg", 1000],
  ["salt_100g", "saltG", 1],
  ["potassium_100g", "potassiumMg", 1000],
  ["calcium_100g", "calciumMg", 1000],
  ["iron_100g", "ironMg", 1000],
  ["vitamin-d_100g", "vitaminDUg", 1_000_000],
  ["caffeine_100g", "caffeineMg", 1000],
];

const splitTags = (s) =>
  s ? s.split(",").map((t) => t.trim().replace(/^[a-z]{2}:/, "")).filter(Boolean) : [];

const rl = createInterface({
  input: createReadStream(GZ).pipe(createGunzip()),
  crlfDelay: Infinity,
});

let header = null;
let col = null;
let rows = 0;
let usRows = 0;
const kept = [];

for await (const line of rl) {
  if (!header) {
    header = line.split("\t");
    col = Object.fromEntries(header.map((h, i) => [h, i]));
    for (const need of ["code", "product_name", "countries_en", "unique_scans_n", "energy-kcal_100g"]) {
      if (col[need] === undefined) {
        console.error(`export missing expected column: ${need}`);
        process.exit(1);
      }
    }
    continue;
  }
  rows++;
  const f = line.split("\t");
  if (f.length < header.length - 5) continue; // mangled row
  // Strict US-only tag: the export lacks the API's US-weighted popularity_key, and global
  // unique_scans_n lets foreign multi-country products swamp the ranking. US-only tagging
  // is the only reliable US-market signal in the export.
  const countries = f[col["countries_en"]];
  if (countries !== "United States") continue;
  usRows++;
  const name = f[col["product_name"]];
  const kcalRaw = f[col["energy-kcal_100g"]];
  const kcal = Number(kcalRaw);
  // Number("") === 0 is finite — require a non-empty kcal field, not just a finite parse.
  if (!name || !f[col["code"]] || kcalRaw === "" || !Number.isFinite(kcal)) continue;

  const per100g = {};
  for (const [colName, key, factor] of NUTRIENT_COLS) {
    const i = col[colName];
    if (i === undefined) continue;
    const v = Number(f[i]);
    if (f[i] !== "" && Number.isFinite(v)) per100g[key] = Math.round(v * factor * 1000) / 1000;
  }

  const servingQuantityG = Number(f[col["serving_quantity"]]) || null;
  const perServing = servingQuantityG
    ? Object.fromEntries(
        Object.entries(per100g).map(([k, v]) => [k, Math.round(v * servingQuantityG * 10) / 1000])
      )
    : null;

  kept.push({
    barcode: f[col["code"]],
    name,
    brand: f[col["brands"]] || null,
    quantity: f[col["quantity"]] || null,
    servingSize: f[col["serving_size"]] || null,
    servingQuantityG,
    per100g,
    perServing,
    ingredientsText: f[col["ingredients_text"]] || null,
    categories: splitTags(f[col["categories_tags"]]),
    additives: splitTags(f[col["additives_tags"]]),
    allergens: splitTags(f[col["allergens"]]),
    traces: splitTags(f[col["traces_tags"]]),
    labels: splitTags(f[col["labels_tags"]]),
    novaGroup: Number(f[col["nova_group"]]) || null,
    nutriscore: ["a", "b", "c", "d", "e"].includes(f[col["nutrition_grade_fr"]]) ? f[col["nutrition_grade_fr"]] : null,
    popularity: Number(f[col["unique_scans_n"]]) || 0,
    flags: null,
  });
  // Bound memory: periodically prune to the current top-N by popularity.
  if (kept.length >= Number(TOP_N) * 3) {
    kept.sort((a, b) => b.popularity - a.popularity);
    kept.length = Number(TOP_N);
  }
  if (rows % 500000 === 0) console.log(`${rows} rows scanned, ${usRows} US, ${kept.length} kept`);
}

kept.sort((a, b) => b.popularity - a.popularity);
const top = kept.slice(0, Number(TOP_N));
// Dedup by barcode (export can carry revisions)
const seen = new Set();
const out = top.filter((p) => (seen.has(p.barcode) ? false : (seen.add(p.barcode), true)));

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out));
const withIngredients = out.filter((p) => p.ingredientsText || p.additives.length).length;
console.log(
  JSON.stringify({ rowsScanned: rows, usRows, usable: kept.length, kept: out.length, withIngredientsOrAdditives: withIngredients })
);
