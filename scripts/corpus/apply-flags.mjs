// Join classifier flag shards onto products.json by barcode.
// Usage: node scripts/corpus/apply-flags.mjs [productsPath] [flagsDir]

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { VALID_FLAGS as VALID } from "./flag-rubric.mjs";

const PRODUCTS = process.argv[2] ?? "data/corpus/products.json";
const FLAGS_DIR = process.argv[3] ?? "data/corpus/shards/flags";


const products = JSON.parse(readFileSync(PRODUCTS, "utf8"));
const byBarcode = new Map(products.map((p) => [p.barcode, p]));

let applied = 0;
let invalidFlagRows = 0;
const unknown = [];
for (const file of readdirSync(FLAGS_DIR).filter((f) => f.endsWith(".json")).sort()) {
  const rows = JSON.parse(readFileSync(join(FLAGS_DIR, file), "utf8"));
  for (const row of rows) {
    const p = byBarcode.get(row.barcode);
    if (!p) { unknown.push(`${file}:${row.barcode}`); continue; }
    if (!Array.isArray(row.flags) || row.flags.some((f) => !VALID.has(f))) { invalidFlagRows++; continue; }
    p.flags = [...new Set(row.flags)];
    applied++;
  }
}

const unclassified = products.filter((p) => (p.ingredientsText || p.additives.length) && p.flags === null).length;
writeFileSync(PRODUCTS, JSON.stringify(products));
console.log(JSON.stringify({ products: products.length, applied, invalidFlagRows, unknownBarcodes: unknown.length, classifiableStillNull: unclassified }));
if (unknown.length) console.log("UNKNOWN:\n  " + unknown.slice(0, 20).join("\n  "));
