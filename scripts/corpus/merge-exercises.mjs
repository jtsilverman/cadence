// Merge exercise shards -> data/corpus/exercises.json with schema/enum validation and dedup.
// Usage: node scripts/corpus/merge-exercises.mjs [shardDir] [outPath]

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import { dirname, join, basename } from "node:path";

const SHARD_DIR = process.argv[2] ?? "data/corpus/shards/exercises";
const OUT = process.argv[3] ?? "data/corpus/exercises.json";

const ENUMS = {
  modality: ["strength", "cardio", "plyometric", "mobility", "yoga", "carry"],
  equipment: ["barbell", "ez-bar", "trap-bar", "dumbbell", "kettlebell", "cable", "machine", "smith-machine", "bodyweight", "resistance-band", "suspension", "medicine-ball", "plate", "bench", "pull-up-bar", "dip-station", "box", "sled", "sandbag", "battle-ropes", "jump-rope", "rower", "treadmill", "bike", "elliptical", "stairmaster", "ski-erg", "assault-bike", "foam-roller", "log", "yoke", "none"],
  muscles: ["pectorals", "lats", "traps", "rhomboids", "lower-back", "front-delts", "side-delts", "rear-delts", "biceps", "triceps", "forearms", "quads", "hamstrings", "glutes", "calves", "tibialis", "abs", "obliques", "hip-flexors", "adductors", "abductors", "neck", "full-body", "cardiovascular"],
  laterality: ["bilateral", "unilateral", "none"],
  metrics: ["weight", "reps", "time", "distance", "pace", "incline", "resistance-level", "height", "calories"],
  // Enrichment fields (optional until round 2 fills them):
  mechanics: ["compound", "isolation"],
  movementPattern: ["push", "pull", "hinge", "squat", "lunge", "carry", "rotation", "gait", "isometric", "plyometric", "dynamic-mobility"],
  difficulty: ["beginner", "intermediate", "advanced"],
};

const normName = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function validate(ex, shard) {
  const errs = [];
  if (!ex.id || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(ex.id)) errs.push(`bad id: ${JSON.stringify(ex.id)}`);
  if (!ex.name) errs.push("missing name");
  if (!Array.isArray(ex.aliases)) errs.push("aliases not array");
  if (!ENUMS.modality.includes(ex.modality)) errs.push(`bad modality: ${ex.modality}`);
  if (!Array.isArray(ex.equipment) || ex.equipment.some((e) => !ENUMS.equipment.includes(e))) errs.push(`bad equipment: ${JSON.stringify(ex.equipment)}`);
  for (const key of ["primaryMuscles", "secondaryMuscles"]) {
    if (!Array.isArray(ex[key]) || ex[key].some((m) => !ENUMS.muscles.includes(m))) errs.push(`bad ${key}: ${JSON.stringify(ex[key])}`);
  }
  if (ex.primaryMuscles?.length === 0) errs.push("empty primaryMuscles");
  if (!ENUMS.laterality.includes(ex.laterality)) errs.push(`bad laterality: ${ex.laterality}`);
  if (!Array.isArray(ex.metrics) || ex.metrics.length === 0 || ex.metrics.some((m) => !ENUMS.metrics.includes(m))) errs.push(`bad metrics: ${JSON.stringify(ex.metrics)}`);
  if (ex.variationOf !== null && typeof ex.variationOf !== "string") errs.push(`bad variationOf: ${JSON.stringify(ex.variationOf)}`);
  if (ex.mechanics !== undefined && !ENUMS.mechanics.includes(ex.mechanics)) errs.push(`bad mechanics: ${ex.mechanics}`);
  if (ex.movementPattern !== undefined && !ENUMS.movementPattern.includes(ex.movementPattern)) errs.push(`bad movementPattern: ${ex.movementPattern}`);
  if (ex.difficulty !== undefined && !ENUMS.difficulty.includes(ex.difficulty)) errs.push(`bad difficulty: ${ex.difficulty}`);
  return errs.length ? { shard, id: ex.id, name: ex.name, errs } : null;
}

const byId = new Map();
const byName = new Map();
const invalid = [];
const dupes = [];
const shardCounts = {};

for (const file of readdirSync(SHARD_DIR).filter((f) => f.endsWith(".json")).sort()) {
  const shard = basename(file, ".json");
  let entries;
  try {
    entries = JSON.parse(readFileSync(join(SHARD_DIR, file), "utf8"));
  } catch (e) {
    invalid.push({ shard, id: null, name: null, errs: [`shard unparseable: ${e.message}`] });
    continue;
  }
  shardCounts[shard] = entries.length;
  for (const ex of entries) {
    const problem = validate(ex, shard);
    if (problem) { invalid.push(problem); continue; }
    const nameKey = normName(ex.name);
    if (byId.has(ex.id) || byName.has(nameKey)) {
      const kept = byId.get(ex.id) ?? byName.get(nameKey);
      dupes.push({ shard, id: ex.id, keptFrom: kept._shard });
      // Union aliases onto the kept entry.
      kept.aliases = [...new Set([...kept.aliases, ...ex.aliases, ...(kept.name !== ex.name ? [ex.name] : [])])];
      continue;
    }
    ex._shard = shard;
    byId.set(ex.id, ex);
    byName.set(nameKey, ex);
  }
}

// Alias collisions with canonical names/ids of other entries: drop the alias (keep the entry).
for (const ex of byId.values()) {
  ex.aliases = ex.aliases.filter((a) => {
    const k = normName(a);
    const hit = byName.get(k);
    return !hit || hit === ex;
  });
}

// variationOf must point at a real id (or null).
let danglingParents = 0;
for (const ex of byId.values()) {
  if (ex.variationOf && !byId.has(ex.variationOf)) { ex.variationOf = null; danglingParents++; }
}

const merged = [...byId.values()]
  .map(({ _shard, ...ex }) => ({ ...ex, territory: _shard }))
  .sort((a, b) => a.id.localeCompare(b.id));

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(merged, null, 1));

console.log(JSON.stringify({
  shardCounts,
  merged: merged.length,
  dupes: dupes.length,
  invalid: invalid.length,
  danglingParentsNulled: danglingParents,
}, null, 2));
if (invalid.length) console.log("INVALID:\n" + invalid.map((i) => `  [${i.shard}] ${i.id ?? "?"}: ${i.errs.join("; ")}`).join("\n"));
if (dupes.length) console.log("DUPES (alias-merged):\n" + dupes.map((d) => `  ${d.id} (${d.shard} -> kept ${d.keptFrom})`).join("\n"));
