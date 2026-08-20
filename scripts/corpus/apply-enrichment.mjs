// Join enrichment batch files onto exercises.json by id.
// Usage: node scripts/corpus/apply-enrichment.mjs [exercisesPath] [enrichDir]

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const EXERCISES = process.argv[2] ?? "data/corpus/exercises.json";
const ENRICH_DIR = process.argv[3] ?? "data/corpus/shards/enrichment";

const exercises = JSON.parse(readFileSync(EXERCISES, "utf8"));
const byId = new Map(exercises.map((e) => [e.id, e]));

let applied = 0;
const unknownIds = [];
for (const file of readdirSync(ENRICH_DIR).filter((f) => f.endsWith(".json")).sort()) {
  const rows = JSON.parse(readFileSync(join(ENRICH_DIR, file), "utf8"));
  for (const row of rows) {
    const ex = byId.get(row.id);
    if (!ex) { unknownIds.push(`${file}:${row.id}`); continue; }
    const { id, ...fields } = row;
    Object.assign(ex, fields);
    applied++;
  }
}

const missing = exercises.filter((e) => !e.mechanics).map((e) => e.id);
writeFileSync(EXERCISES, JSON.stringify(exercises, null, 1));
console.log(JSON.stringify({ total: exercises.length, applied, unknownIds: unknownIds.length, missingEnrichment: missing.length }));
if (unknownIds.length) console.log("UNKNOWN IDS:\n  " + unknownIds.join("\n  "));
if (missing.length) console.log("MISSING ENRICHMENT:\n  " + missing.join("\n  "));
