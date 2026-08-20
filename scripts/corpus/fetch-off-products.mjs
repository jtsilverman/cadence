// Fetch top US products by popularity from Open Food Facts (ODbL — attribution required).
// Usage: node scripts/corpus/fetch-off-products.mjs [pages] [outPath]
// Rate limit: OFF allows 10 search req/min; requests are spaced 7s apart.
// OFF 503s in bursts: failed pages are retried in sweep rounds until done (or 20 rounds).
// Output is saved after every round, so a killed run keeps its progress on disk.

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const PAGES = Number(process.argv[2] ?? 200);
const OUT = process.argv[3] ?? "data/corpus/products.raw.json";
const STATE = OUT + ".state.json";
// Open Food Facts asks for a contact address in the User-Agent. Set CADENCE_CONTACT
// to your own before running this fetcher against their API.
const UA = process.env.CADENCE_CONTACT
  ? `cadence-corpus-builder/0.1 (${process.env.CADENCE_CONTACT})`
  : "cadence-corpus-builder/0.1 (contact@example.com)";
const FIELDS = [
  "code",
  "product_name",
  "brands",
  "nutriments",
  "ingredients_text",
  "serving_size",
  "serving_quantity",
  "quantity",
  "product_quantity",
  "product_quantity_unit",
  "categories_tags",
  "additives_tags",
  "allergens_tags",
  "traces_tags",
  "labels_tags",
  "nova_group",
  "nutriscore_grade",
  "nutrient_levels",
  "unique_scans_n",
].join(",");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Resume from a prior partial run if present.
const products = new Map();
let pending = Array.from({ length: PAGES }, (_, i) => i + 1);
if (existsSync(STATE) && existsSync(OUT)) {
  try {
    pending = JSON.parse(readFileSync(STATE, "utf8")).pending;
    for (const p of JSON.parse(readFileSync(OUT, "utf8"))) products.set(p.code, p);
    console.log(`resuming: ${products.size} products, ${pending.length} pages pending`);
  } catch {}
}

function save() {
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify([...products.values()]));
  writeFileSync(STATE, JSON.stringify({ pending }));
}

for (let round = 1; round <= 20 && pending.length; round++) {
  console.log(`round ${round}: ${pending.length} pages pending`);
  const failed = [];
  let consecutiveErrors = 0;
  for (const page of pending) {
    const url =
      `https://world.openfoodfacts.org/api/v2/search` +
      `?countries_tags=en:united-states&sort_by=popularity_key` +
      `&page_size=100&page=${page}&fields=${FIELDS}`;
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await res.json();
      for (const p of body.products ?? []) {
        if (p.code && p.product_name) products.set(p.code, p);
      }
      consecutiveErrors = 0;
      console.log(`page ${page}: total ${products.size}`);
    } catch (err) {
      failed.push(page);
      consecutiveErrors++;
      console.error(`page ${page}: ${err.message}`);
      // A 503 burst means OFF is struggling — back off hard before hammering on.
      if (consecutiveErrors >= 3) {
        console.log("3 consecutive errors — backing off 5 minutes");
        await sleep(300_000);
        consecutiveErrors = 0;
      }
    }
    await sleep(7_000);
  }
  pending = failed;
  save();
  if (pending.length) await sleep(120_000);
}

save();
console.log(`done: ${products.size} products, ${pending.length} pages unrecovered`);
