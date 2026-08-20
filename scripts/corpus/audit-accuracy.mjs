// Accuracy audit: sample products + exercises, verify via truth-framed Batch API judges,
// aggregate agreement stats. Two independent judge votes per shard; an error counts only
// when BOTH votes report it (the 2026-07-28 study found ~1/3 of single-judge error rows
// self-refute, so single-vote counts are an upper bound, not a rate).
// Writes raw per-vote verdicts + adjudicated aggregate to data/corpus/shards/audit-2/.
// Usage: node scripts/corpus/audit-accuracy.mjs [productSample] [exerciseSample]
//        AUDIT_BATCH_ID=msgbatch_... node scripts/corpus/audit-accuracy.mjs   (resume poll)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";

const N_PRODUCTS = Number(process.argv[2] ?? 300);
const N_EXERCISES = Number(process.argv[3] ?? 100);
const OUT_DIR = "data/corpus/shards/audit-2";
const MODEL = "claude-sonnet-5";
const API = "https://api.anthropic.com/v1";

function apiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const env = readFileSync("/Users/jsilverman/Documents/projects/cadence/.env.local", "utf8");
  return env.match(/^ANTHROPIC_API_KEY\s*=\s*"?([^"\n]+)"?/m)[1];
}
const HEADERS = { "x-api-key": apiKey(), "anthropic-version": "2023-06-01", "content-type": "application/json" };

// Deterministic sample: hash-order by id so the audit is reproducible.
const pick = (arr, n, keyFn) =>
  [...arr].sort((a, b) => createHash("sha1").update(keyFn(a)).digest("hex")
    .localeCompare(createHash("sha1").update(keyFn(b)).digest("hex"))).slice(0, n);

const FLAG_JUDGE = `You are auditing an ingredient-flag classifier for accuracy. You will get products, each with ingredient text, an additives list, and the flags a classifier assigned.

Flag definitions:
- "seed-oils": canola/rapeseed, soybean, corn, cottonseed, sunflower, safflower, grapeseed, or rice bran oil (any form, incl "vegetable oil" blends naming these)
- "hfcs": high fructose corn syrup
- "added-sugar-syrups": corn syrup, glucose syrup, invert syrup, tapioca syrup, brown rice syrup, rice/malt syrup, agave, maltodextrin-as-sweetener; NOT hfcs (own flag); plain sugar/honey/maple NOT flagged; acids (lactic e270, malic e296, citric e330) are NOT this flag
- "artificial-sweeteners": aspartame, sucralose, acesulfame potassium, saccharin, neotame, advantame
- "sugar-alcohols": erythritol, xylitol, sorbitol, maltitol, mannitol, isomalt, lactitol
- "gums-thickeners": xanthan/guar/carrageenan/cellulose/locust bean/gellan/tara gum; ANY modified starch (modified food starch, modified corn starch, food starch-modified, any "modified ... starch") is ALWAYS this flag, regardless of role
- "preservatives": sodium benzoate, potassium sorbate, sorbic acid, BHA, BHT, TBHQ, sulfites, calcium/sodium propionate, natamycin, EDTA, benzoic acid, dimethylpolysiloxane, diphosphates; mentions inside trailing parentheticals like "(to preserve freshness)" count
- "artificial-colors": FD&C dyes (Red 40, Yellow 5/6, Blue 1/2, Green 3), titanium dioxide
- "artificial-flavors": "artificial flavor(s)"
- "natural-flavors": "natural flavor(s)"
- "msg-flavor-enhancers": MSG, yeast extract, hydrolyzed vegetable/soy protein, autolyzed yeast, disodium inosinate/guanylate
- "nitrates-nitrites": sodium/potassium nitrite/nitrate, cured celery powder/juice
- "trans-fat-hydrogenated": partially/fully hydrogenated oils
- "emulsifiers": lecithin, mono- and diglycerides, polysorbate 60/80, DATEM, sodium stearoyl lactylate, polyglycerol esters
- "refined-flour": ONLY enriched/bleached/white wheat flour; whole wheat/whole grain/wholemeal, plain unbleached (non-enriched), and all non-wheat flours (rice, sorghum, almond, oat, corn, etc.) NOT flagged
- "caffeine": coffee, tea/matcha extract, guarana, yerba mate, added caffeine; cocoa NOT flagged
(E-numbers map to their categories, e.g. e322 emulsifiers, e407 gums-thickeners, e621 msg-flavor-enhancers, e250/e251 nitrates-nitrites, e450 preservatives.)

For EACH product, judge the assigned flags against the evidence. This is a truth audit, not a fault hunt: a fully correct classification is a normal, expected outcome — report "ok" when the flags are right. Only report a wrongFlag or missingFlag when the ingredient text/additives clearly support it; cite the evidence phrase.

Respond ONLY a JSON array, no prose, no fences:
[{"barcode":"...","verdict":"ok"|"errors","wrongFlags":[{"flag":"...","why":"..."}],"missingFlags":[{"flag":"...","evidence":"..."}]}]`;

const EXERCISE_JUDGE = `You are auditing an exercise database for factual accuracy. You will get exercise entries with all fields.

For EACH exercise, check: is the name a real, commonly recognized exercise? Are primaryMuscles/secondaryMuscles correct? equipment sensible? mechanics (compound/isolation) right? movementPattern (push/pull/hinge/squat/lunge/carry/rotation/gait/isometric/plyometric/dynamic-mobility) right? metrics (what a user logs) appropriate? difficulty reasonable? formCues/setup/commonMistakes factually sound (no dangerous or wrong advice)? (plyometric = explosive/ballistic jumps, hops, throws, olympic-style lifts; dynamic-mobility = controlled dynamic range-of-motion drills like leg swings.)

This is a truth audit, not a fault hunt: correct entries are the expected outcome — report "ok" for them. Report an error ONLY for a clear factual mistake a qualified trainer would object to, not for defensible judgment calls (e.g. secondary-muscle inclusion debates, difficulty off by one step). Severity: "major" = wrong muscles/pattern/mechanics/metrics or unsafe cue; "minor" = clearly suboptimal but not wrong.

Respond ONLY a JSON array, no prose, no fences:
[{"id":"...","verdict":"ok"|"errors","errors":[{"field":"...","severity":"major"|"minor","issue":"..."}]}]`;

// ---- build samples ----
const products = JSON.parse(readFileSync("data/corpus/products.json", "utf8"))
  .filter((p) => Array.isArray(p.flags) && (p.ingredientsText || p.additives.length));
const exercises = JSON.parse(readFileSync("data/corpus/exercises.json", "utf8"));

const pSample = pick(products, N_PRODUCTS, (p) => p.barcode)
  .map((p) => ({ barcode: p.barcode, name: p.name, ingredientsText: p.ingredientsText, additives: p.additives, assignedFlags: p.flags }));
const eSample = pick(exercises, N_EXERCISES, (e) => e.id);

// Two independent votes per shard: identical params, distinct custom_ids.
const requests = [];
for (const vote of ["v1", "v2"]) {
  for (let i = 0; i < pSample.length; i += 20) {
    requests.push({
      custom_id: `flags-${String(i / 20).padStart(3, "0")}-${vote}`,
      params: {
        model: MODEL, max_tokens: 16000,
        thinking: { type: "disabled" }, output_config: { effort: "medium" },
        system: [{ type: "text", text: FLAG_JUDGE, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: JSON.stringify(pSample.slice(i, i + 20)) }],
      },
    });
  }
  for (let i = 0; i < eSample.length; i += 10) {
    requests.push({
      custom_id: `exercises-${String(i / 10).padStart(3, "0")}-${vote}`,
      params: {
        model: MODEL, max_tokens: 16000,
        thinking: { type: "disabled" }, output_config: { effort: "medium" },
        system: [{ type: "text", text: EXERCISE_JUDGE, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: JSON.stringify(eSample.slice(i, i + 10)) }],
      },
    });
  }
}

// Resume a prior submission (samples are deterministic, so they rebuild identically):
// AUDIT_BATCH_ID=msgbatch_... node scripts/corpus/audit-accuracy.mjs
let batch;
if (process.env.AUDIT_BATCH_ID) {
  batch = { id: process.env.AUDIT_BATCH_ID };
  console.log(`resuming audit batch ${batch.id}`);
} else {
  const createRes = await fetch(`${API}/messages/batches`, { method: "POST", headers: HEADERS, body: JSON.stringify({ requests }) });
  if (!createRes.ok) throw new Error(`batch create failed: ${createRes.status} ${await createRes.text()}`);
  batch = await createRes.json();
  console.log(`audit batch ${batch.id}: ${requests.length} requests (${pSample.length} products, ${eSample.length} exercises, 2 votes)`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let status = batch;
while (status.processing_status !== "ended") {
  await sleep(30_000);
  const res = await fetch(`${API}/messages/batches/${batch.id}`, { headers: HEADERS });
  if (res.ok) status = await res.json();
  console.log(`status: ${status.processing_status}`);
}

const lines = (await (await fetch(status.results_url, { headers: HEADERS })).text()).trim().split("\n");
mkdirSync(OUT_DIR, { recursive: true });

const votes = { v1: { flags: [], exercises: [] }, v2: { flags: [], exercises: [] } };
const failures = [];
for (const line of lines) {
  const r = JSON.parse(line);
  if (r.result.type !== "succeeded") { failures.push(r.custom_id); continue; }
  const text = (r.result.message.content.find((b) => b.type === "text")?.text ?? "")
    .replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  const vote = r.custom_id.endsWith("-v2") ? "v2" : "v1";
  try {
    const rows = JSON.parse(text);
    votes[vote][r.custom_id.startsWith("flags-") ? "flags" : "exercises"].push(...rows);
  } catch { failures.push(`${r.custom_id}: unparseable`); }
}
for (const v of ["v1", "v2"]) {
  writeFileSync(join(OUT_DIR, `flag-verdicts-${v}.json`), JSON.stringify(votes[v].flags, null, 1));
  writeFileSync(join(OUT_DIR, `exercise-verdicts-${v}.json`), JSON.stringify(votes[v].exercises, null, 1));
}

// ---- adjudicate: an error counts only if BOTH votes report it AND it is mechanically
// consistent with the input (judges sometimes report a flag "missing" that is already
// assigned, or "wrong" when it was never assigned — observed in msgbatch_01NBrcZZ...).
const assigned = new Map(pSample.map((p) => [p.barcode, new Set(p.assignedFlags)]));
const flagKeys = (rows, kind) => new Map(rows.flatMap((v) => (v[kind] ?? []).map((e) => [`${v.barcode}|${e.flag}`, { barcode: v.barcode, ...e }])));
const agree = (kind) => {
  const [a, b] = [flagKeys(votes.v1.flags, kind), flagKeys(votes.v2.flags, kind)];
  return [...a.entries()].filter(([k]) => b.has(k)).map(([, row]) => row);
};
const wrong = agree("wrongFlags").filter((r) => assigned.get(r.barcode)?.has(r.flag));
const missing = agree("missingFlags").filter((r) => !assigned.get(r.barcode)?.has(r.flag));
const errBarcodes = new Set([...wrong, ...missing].map((r) => r.barcode));

const exKeys = (rows) => new Map(rows.flatMap((v) => (v.errors ?? []).map((e) => [`${v.id}|${e.field}`, { id: v.id, ...e }])));
const [ea, eb] = [exKeys(votes.v1.exercises), exKeys(votes.v2.exercises)];
const eErrors = [...ea.entries()].filter(([k]) => eb.has(k)).map(([k, row]) => {
  const other = eb.get(k);
  // Agreed severity: major only when both votes call it major.
  return { ...row, severity: row.severity === "major" && other.severity === "major" ? "major" : "minor" };
});
const errExIds = new Set(eErrors.map((e) => e.id));

// ---- aggregate ----
const totalAssigned = pSample.reduce((s, p) => s + p.assignedFlags.length, 0);
const judgedBarcodes = new Set(votes.v1.flags.map((v) => v.barcode));
const judgedExIds = new Set(votes.v1.exercises.map((v) => v.id));
const byFlag = (rows) => rows.reduce((m, r) => ((m[r.flag] = (m[r.flag] ?? 0) + 1), m), {});

const aggregate = {
  summary: {
    products: {
      judged: judgedBarcodes.size,
      ok: [...judgedBarcodes].filter((b) => !errBarcodes.has(b)).length,
      flagsAssigned: totalAssigned,
      wrong: wrong.length,
      missing: missing.length,
      wrongByFlag: byFlag(wrong),
      missingByFlag: byFlag(missing),
      singleVoteWrong: { v1: flagKeys(votes.v1.flags, "wrongFlags").size, v2: flagKeys(votes.v2.flags, "wrongFlags").size },
      singleVoteMissing: { v1: flagKeys(votes.v1.flags, "missingFlags").size, v2: flagKeys(votes.v2.flags, "missingFlags").size },
    },
    exercises: {
      judged: judgedExIds.size,
      ok: [...judgedExIds].filter((id) => !errExIds.has(id)).length,
      major: eErrors.filter((e) => e.severity === "major").length,
      minor: eErrors.filter((e) => e.severity === "minor").length,
      errorsByFieldSeverity: eErrors.reduce((m, e) => ((m[`${e.field}|${e.severity}`] = (m[`${e.field}|${e.severity}`] ?? 0) + 1), m), {}),
      singleVoteErrors: { v1: ea.size, v2: eb.size },
    },
  },
  wrongRows: wrong,
  missingRows: missing,
  exerciseErrorRows: eErrors,
};
writeFileSync(join(OUT_DIR, "aggregate.json"), JSON.stringify(aggregate, null, 1));
console.log(JSON.stringify({ ...aggregate.summary, failures }, null, 2));
