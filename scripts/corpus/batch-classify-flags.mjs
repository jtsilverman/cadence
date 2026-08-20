// Classify product ingredient flags via the Anthropic Message Batches API (50% cost, no
// harness concurrency cap). Finds products still lacking flags, submits one batch of
// chunked requests, polls to completion, writes result shards.
// Usage: node scripts/corpus/batch-classify-flags.mjs
// Requires ANTHROPIC_API_KEY (read from env, or /Users/jsilverman/Documents/projects/cadence/.env.local).

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { RUBRIC, VALID_FLAGS as VALID } from "./flag-rubric.mjs";

const OUT_DIR = "data/corpus/shards/flags-batchapi";
const CHUNK = 100;
const MODEL = "claude-sonnet-5";
const API = "https://api.anthropic.com/v1";

function apiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const env = readFileSync("/Users/jsilverman/Documents/projects/cadence/.env.local", "utf8");
  const m = env.match(/^ANTHROPIC_API_KEY\s*=\s*"?([^"\n]+)"?/m);
  if (!m) throw new Error("ANTHROPIC_API_KEY not found");
  return m[1];
}
const KEY = apiKey();
const HEADERS = {
  "x-api-key": KEY,
  "anthropic-version": "2023-06-01",
  "content-type": "application/json",
};


// ---- collect remaining products ----
const products = JSON.parse(readFileSync("data/corpus/products.json", "utf8"));
const already = new Set();
for (const dir of ["data/corpus/shards/flags", "data/corpus/shards/flags-2", OUT_DIR]) {
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json"))) {
    for (const row of JSON.parse(readFileSync(join(dir, f), "utf8"))) already.add(row.barcode);
  }
}
const todo = products
  .filter((p) => (p.ingredientsText || p.additives.length) && p.flags === null && !already.has(p.barcode))
  .map((p) => ({ barcode: p.barcode, name: p.name, ingredientsText: p.ingredientsText, additives: p.additives }));
console.log(`${todo.length} products to classify`);
if (todo.length === 0) process.exit(0);

// ---- build + submit batch ----
const requests = [];
for (let i = 0; i < todo.length; i += CHUNK) {
  requests.push({
    custom_id: `chunk-${String(i / CHUNK).padStart(3, "0")}`,
    params: {
      model: MODEL,
      max_tokens: 16000,
      // Mechanical classification: adaptive thinking burned ~14k of the 16k output
      // budget and truncated the JSON (observed msgbatch_013ftDVMzHoZf3GfHaffxc1m).
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      system: [{ type: "text", text: RUBRIC, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: JSON.stringify(todo.slice(i, i + CHUNK)) }],
    },
  });
}

const createRes = await fetch(`${API}/messages/batches`, {
  method: "POST",
  headers: HEADERS,
  body: JSON.stringify({ requests }),
});
if (!createRes.ok) throw new Error(`batch create failed: ${createRes.status} ${await createRes.text()}`);
const batch = await createRes.json();
console.log(`batch ${batch.id} submitted: ${requests.length} requests`);

// ---- poll ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let status = batch;
while (status.processing_status !== "ended") {
  await sleep(60_000);
  const res = await fetch(`${API}/messages/batches/${batch.id}`, { headers: HEADERS });
  if (!res.ok) { console.error(`poll failed: ${res.status}`); continue; }
  status = await res.json();
  console.log(`status: ${status.processing_status} (${JSON.stringify(status.request_counts)})`);
}

// ---- fetch + parse results ----
const resultsRes = await fetch(status.results_url, { headers: HEADERS });
if (!resultsRes.ok) throw new Error(`results fetch failed: ${resultsRes.status}`);
const lines = (await resultsRes.text()).trim().split("\n");

mkdirSync(OUT_DIR, { recursive: true });
let ok = 0;
const failed = [];
for (const line of lines) {
  const result = JSON.parse(line);
  if (result.result.type !== "succeeded") { failed.push(`${result.custom_id}: ${result.result.type}`); continue; }
  const text = result.result.message.content.find((b) => b.type === "text")?.text ?? "";
  // Tolerant fence-stripping parse
  const stripped = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  let rows;
  try {
    rows = JSON.parse(stripped);
  } catch {
    // Truncated array (max_tokens): salvage every complete {"barcode":..,"flags":[..]} object.
    rows = [...stripped.matchAll(/\{\s*"barcode"\s*:\s*"[^"]+"\s*,\s*"flags"\s*:\s*\[[^\]]*\]\s*\}/g)]
      .map((m) => { try { return JSON.parse(m[0]); } catch { return null; } })
      .filter(Boolean);
    if (rows.length === 0) { failed.push(`${result.custom_id}: unparseable`); continue; }
    failed.push(`${result.custom_id}: truncated, salvaged ${rows.length}`);
  }
  const clean = rows.filter((r) => r.barcode && Array.isArray(r.flags) && r.flags.every((f) => VALID.has(f)));
  // Prefix with batch id: custom_ids restart per run, and a bare name would overwrite
  // a prior run's shard for different products.
  writeFileSync(join(OUT_DIR, `${batch.id}-${result.custom_id}.json`), JSON.stringify(clean));
  ok += clean.length;
}
console.log(JSON.stringify({ requests: requests.length, productsClassified: ok, failedRequests: failed }));
