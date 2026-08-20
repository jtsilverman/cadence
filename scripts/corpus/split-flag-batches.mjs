// Split classifiable products into batch input files for the flag-classifier agents.
// Usage: node scripts/corpus/split-flag-batches.mjs [batchSize] [batchDir]

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const BATCH = Number(process.argv[2] ?? 150);
const DIR = process.argv[3] ?? "data/corpus/shards/flag-batches";

const products = JSON.parse(readFileSync("data/corpus/products.json", "utf8"));
const classifiable = products
  .filter((p) => p.ingredientsText || p.additives.length)
  .map((p) => ({ barcode: p.barcode, name: p.name, ingredientsText: p.ingredientsText, additives: p.additives }));

mkdirSync(DIR, { recursive: true });
let n = 0;
for (let i = 0; i < classifiable.length; i += BATCH) {
  writeFileSync(join(DIR, `batch-${String(n).padStart(3, "0")}.json`), JSON.stringify(classifiable.slice(i, i + BATCH)));
  n++;
}
console.log(JSON.stringify({ classifiable: classifiable.length, batches: n, batchSize: BATCH }));
