// Movement-pattern re-tag after the 2026-07-28 accuracy study (data/corpus/ACCURACY.md):
// the old enum had no plyometric / dynamic-mobility category, so ballistic and dynamic
// moves were shoehorned into gait/isometric/hinge. Re-judges the at-risk subset against
// the EXTENDED enum (plus mechanics where clearly wrong) and writes enrichment-shaped
// shards to data/corpus/shards/retag/; merge back with:
//   node scripts/corpus/apply-enrichment.mjs data/corpus/exercises.json data/corpus/shards/retag
// Usage: node scripts/corpus/retag-movement.mjs
//        RETAG_BATCH_ID=msgbatch_... node scripts/corpus/retag-movement.mjs   (resume poll)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = "data/corpus/shards/retag";
const CHUNK = 10;
const MODEL = "claude-sonnet-5";
const API = "https://api.anthropic.com/v1";

const PATTERNS = ["push", "pull", "hinge", "squat", "lunge", "carry", "rotation", "gait", "isometric", "plyometric", "dynamic-mobility"];
const MECHANICS = ["compound", "isolation"];

function apiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const env = readFileSync("/Users/jsilverman/Documents/projects/cadence/.env.local", "utf8");
  const m = env.match(/^ANTHROPIC_API_KEY\s*=\s*"?([^"\n]+)"?/m);
  if (!m) throw new Error("ANTHROPIC_API_KEY not found");
  return m[1];
}
const HEADERS = { "x-api-key": apiKey(), "anthropic-version": "2023-06-01", "content-type": "application/json" };

const JUDGE = `You are correcting movementPattern (and, only where clearly wrong, mechanics) tags in an exercise database. The database was built with an enum that lacked plyometric and dynamic-mobility, so ballistic/jump/dynamic moves were mis-shoehorned into gait, isometric, or hinge.

The EXTENDED movementPattern enum:
- "push", "pull", "hinge", "squat", "lunge", "carry", "rotation": standard strength patterns
- "gait": locomotion — walking, running, sprinting, sled work, crawling
- "isometric": genuinely static holds — planks, wall sits, hangs, static yoga poses
- "plyometric": explosive/ballistic — jumps, hops, bounds, throws, slams, olympic-lift style explosive movements (snatch, clean, jerk, tire flip), burpees
- "dynamic-mobility": controlled dynamic range-of-motion work — leg swings, arm circles, scissor kicks, dynamic stretches, controlled rolling/rotational drills

Rules:
- Prefer established taxonomy where a strength pattern is canonical: a kettlebell swing is "hinge", a goblet squat is "squat". Use "plyometric" when the explosive/airborne quality IS the point of the movement.
- Keep the current tag when it is defensible; change it only when a qualified trainer would call it wrong.
- mechanics: "compound" = multi-joint, "isolation" = single-joint. Multi-joint static holds and yoga poses (wall sit, planche, warrior pose, hangs) are compound. Only output a changed mechanics value when the current one is clearly wrong; otherwise repeat the current value.

For EACH input exercise, respond with its corrected (or confirmed) tags.
Respond ONLY a JSON array, no prose, no fences:
[{"id":"...","movementPattern":"...","mechanics":"compound"|"isolation"}]`;

// ---- select the at-risk subset ----
const exercises = JSON.parse(readFileSync("data/corpus/exercises.json", "utf8"));
const agg = JSON.parse(readFileSync("data/corpus/shards/audit/aggregate.json", "utf8"));
const errIds = new Set(agg.exerciseErrorRows.map((r) => r.id));
const TERMS = /jump|hop|bound|plyo|swing|snatch|clean|jerk|flip|slam|sprawl|burpee|skip|leap|kick|rollout/i;

const subset = exercises.filter(
  (e) => TERMS.test(e.name) || TERMS.test(e.id) || e.movementPattern === "isometric" || e.movementPattern === "gait" || errIds.has(e.id),
);
console.log(`${subset.length} exercises selected for re-tag (of ${exercises.length})`);

const todo = subset.map((e) => ({
  id: e.id, name: e.name, aliases: e.aliases, modality: e.modality, equipment: e.equipment,
  primaryMuscles: e.primaryMuscles, secondaryMuscles: e.secondaryMuscles, laterality: e.laterality,
  mechanics: e.mechanics, movementPattern: e.movementPattern,
}));

// ---- build + submit (or resume) batch ----
const requests = [];
for (let i = 0; i < todo.length; i += CHUNK) {
  requests.push({
    custom_id: `retag-${String(i / CHUNK).padStart(3, "0")}`,
    params: {
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "disabled" },
      output_config: { effort: "medium" },
      system: [{ type: "text", text: JUDGE, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: JSON.stringify(todo.slice(i, i + CHUNK)) }],
    },
  });
}

let batch;
if (process.env.RETAG_BATCH_ID) {
  batch = { id: process.env.RETAG_BATCH_ID };
  console.log(`resuming retag batch ${batch.id}`);
} else {
  const createRes = await fetch(`${API}/messages/batches`, { method: "POST", headers: HEADERS, body: JSON.stringify({ requests }) });
  if (!createRes.ok) throw new Error(`batch create failed: ${createRes.status} ${await createRes.text()}`);
  batch = await createRes.json();
  console.log(`retag batch ${batch.id}: ${requests.length} requests`);
}

// ---- poll ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let status = batch;
while (status.processing_status !== "ended") {
  await sleep(30_000);
  const res = await fetch(`${API}/messages/batches/${batch.id}`, { headers: HEADERS });
  if (!res.ok) { console.error(`poll failed: ${res.status}`); continue; }
  status = await res.json();
  console.log(`status: ${status.processing_status} (${JSON.stringify(status.request_counts)})`);
}

// ---- fetch + parse results ----
const lines = (await (await fetch(status.results_url, { headers: HEADERS })).text()).trim().split("\n");
mkdirSync(OUT_DIR, { recursive: true });
let ok = 0, changed = 0;
const byId = new Map(exercises.map((e) => [e.id, e]));
const failed = [];
for (const line of lines) {
  const result = JSON.parse(line);
  if (result.result.type !== "succeeded") { failed.push(`${result.custom_id}: ${result.result.type}`); continue; }
  const text = result.result.message.content.find((b) => b.type === "text")?.text ?? "";
  const stripped = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  let rows;
  try {
    rows = JSON.parse(stripped);
  } catch {
    failed.push(`${result.custom_id}: unparseable`);
    continue;
  }
  const clean = rows.filter((r) => r.id && byId.has(r.id) && PATTERNS.includes(r.movementPattern) && MECHANICS.includes(r.mechanics));
  for (const r of clean) {
    const cur = byId.get(r.id);
    if (cur.movementPattern !== r.movementPattern || cur.mechanics !== r.mechanics) changed++;
  }
  writeFileSync(join(OUT_DIR, `${batch.id}-${result.custom_id}.json`), JSON.stringify(clean));
  ok += clean.length;
}
console.log(JSON.stringify({ requests: requests.length, exercisesJudged: ok, tagsChanged: changed, failedRequests: failed }));
