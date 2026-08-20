// Cross-check ingredients.json against independent hand-written reference values
// (USDA published figures, entered manually — NOT derived from the parser).
// Tolerance ±5% (or ±2 absolute for small values) covers rounding across FDC editions.
// Usage: node scripts/corpus/check-ingredients-reference.mjs

import { readFileSync } from "node:fs";

// name substring (case-insensitive, first match) -> expected per-100g values
const REFERENCE = [
  { match: "Butter, salted", kcal: 717, protein: 0.85, fat: 81.1 },
  { match: "Egg, whole, raw, fresh", kcal: 143, protein: 12.6, fat: 9.5 },
  { match: "Chicken, broilers or fryers, breast, meat only, cooked, roasted", kcal: 165, protein: 31, fat: 3.6 },
  { match: "Rice, white, long-grain, regular, raw, unenriched", kcal: 365, protein: 7.1, carbs: 80 },
  { match: "Broccoli, raw", kcal: 34, protein: 2.8, carbs: 6.6 },
  { match: "Apples, raw, with skin", kcal: 52, carbs: 13.8, fiber: 2.4 },
  { match: "Milk, whole, 3.25%", kcal: 61, protein: 3.2, fat: 3.3 },
  { match: "Nuts, almonds", kcal: 579, protein: 21.2, fat: 49.9 },
  { match: "Fish, salmon, Atlantic, farmed, raw", kcal: 208, protein: 20.4, fat: 13.4 },
  { match: "Oats, whole grain, rolled, old fashioned", kcal: 382, protein: 13.2, fat: 5.9 },
];

const foods = JSON.parse(readFileSync("data/corpus/ingredients.json", "utf8"));
let pass = 0, fail = 0;
for (const ref of REFERENCE) {
  const food =
    foods.find((f) => f.name.toLowerCase() === ref.match.toLowerCase()) ??
    foods.find((f) => f.name.toLowerCase().startsWith(ref.match.toLowerCase()));
  if (!food) { console.log(`MISS  ${ref.match}: not found`); fail++; continue; }
  const problems = [];
  for (const [key, expected] of Object.entries(ref)) {
    if (key === "match") continue;
    const actual = food.per100g[key];
    const tol = Math.max(Math.abs(expected) * 0.05, 2);
    if (typeof actual !== "number" || Math.abs(actual - expected) > tol) {
      problems.push(`${key}: expected ~${expected}, got ${actual}`);
    }
  }
  if (problems.length) { console.log(`FAIL  ${food.name}: ${problems.join("; ")}`); fail++; }
  else { console.log(`PASS  ${food.name}`); pass++; }
}
console.log(`\n${pass}/${pass + fail} reference foods within tolerance`);
process.exit(fail ? 1 : 0);
