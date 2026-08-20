// Targeted flag re-pass after the 2026-07-28 accuracy study (data/corpus/ACCURACY.md):
// re-classifies only the products whose flags could change under the amended rubric
// (deterministic modified-starch rule, syrup/flour exclusions, parenthetical preservatives).
// Writes result shards to data/corpus/shards/flags-repass/; merge back with:
//   node scripts/corpus/apply-flags.mjs data/corpus/products.json data/corpus/shards/flags-repass
// Usage: node scripts/corpus/repass-flags.mjs            (submit + poll + write shards)
//        REPASS_BATCH_ID=msgbatch_... node scripts/corpus/repass-flags.mjs   (resume poll)

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { RUBRIC, VALID_FLAGS as VALID } from "./flag-rubric.mjs";

const OUT_DIR = "data/corpus/shards/flags-repass";
const CHUNK = 20;
const MODEL = "claude-sonnet-5";
const API = "https://api.anthropic.com/v1";

function apiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const env = readFileSync("/Users/jsilverman/Documents/projects/cadence/.env.local", "utf8");
  const m = env.match(/^ANTHROPIC_API_KEY\s*=\s*"?([^"\n]+)"?/m);
  if (!m) throw new Error("ANTHROPIC_API_KEY not found");
  return m[1];
}
const HEADERS = { "x-api-key": apiKey(), "anthropic-version": "2023-06-01", "content-type": "application/json" };

// ---- select the risk subset: products whose current flags could change under the amendments ----
const STARCH = /modified\s+(food\s+|corn\s+|tapioca\s+|potato\s+|wheat\s+|rice\s+)?(corn)?starch|(food\s+)?(corn)?starch[- ]modified|modified\s+starch|almid[oó]n\s+(de\s+\w+\s+)?modificado|amidon\s+modifi/;
const NAMED_SYRUP = /(corn|glucose|invert|tapioca|brown\s+rice|rice\s+malt|malt|golden|oat|date)\s+syrup|agave|maltodextrin/;
const FLOUR_EXCLUDED = /whole\s*-?\s*(wheat|grain)|wholemeal|unbleached|stone\s*ground|(rice|almond|sorghum|oat|coconut|chickpea|garbanzo|buckwheat|cassava|tapioca|corn|quinoa|millet|teff)\s+flour/;
const PRESERVATIVE_NAMES = /\bbha\b|\bbht\b|butylated|tbhq|tertiary\s+butylhydroquinone|edta|sulfite|sulphite|sulfur\s+dioxide|sulphur\s+dioxide|propionate|propionic|diphosphate|e22[0-8]|e28[0-3]|e319|e320|e321|e450/;

const products = JSON.parse(readFileSync("data/corpus/products.json", "utf8"));
const subset = products.filter((p) => {
  if (!Array.isArray(p.flags)) return false;
  const t = `${p.ingredientsText ?? ""} ${(p.additives ?? []).join(" ")}`.toLowerCase();
  return (
    STARCH.test(t) ||                                                        // rule now deterministic, both directions
    (p.flags.includes("added-sugar-syrups") && !NAMED_SYRUP.test(t)) ||      // likely FP (plain sugar / acids)
    (!p.flags.includes("added-sugar-syrups") && NAMED_SYRUP.test(t)) ||      // possible FN
    (p.flags.includes("refined-flour") && FLOUR_EXCLUDED.test(t)) ||         // likely FP (whole/non-wheat flour)
    (PRESERVATIVE_NAMES.test(t) && !p.flags.includes("preservatives"))       // FN (parenthetical preservatives)
  );
});
console.log(`${subset.length} products selected for re-pass (of ${products.length})`);
if (subset.length === 0) process.exit(0);

const todo = subset.map((p) => ({ barcode: p.barcode, name: p.name, ingredientsText: p.ingredientsText, additives: p.additives }));

// ---- build + submit (or resume) batch ----
const requests = [];
for (let i = 0; i < todo.length; i += CHUNK) {
  requests.push({
    custom_id: `repass-${String(i / CHUNK).padStart(3, "0")}`,
    params: {
      model: MODEL,
      max_tokens: 16000,
      thinking: { type: "disabled" },
      output_config: { effort: "low" },
      system: [{ type: "text", text: RUBRIC, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: JSON.stringify(todo.slice(i, i + CHUNK)) }],
    },
  });
}

let batch;
if (process.env.REPASS_BATCH_ID) {
  batch = { id: process.env.REPASS_BATCH_ID };
  console.log(`resuming repass batch ${batch.id}`);
} else {
  const createRes = await fetch(`${API}/messages/batches`, { method: "POST", headers: HEADERS, body: JSON.stringify({ requests }) });
  if (!createRes.ok) throw new Error(`batch create failed: ${createRes.status} ${await createRes.text()}`);
  batch = await createRes.json();
  console.log(`repass batch ${batch.id}: ${requests.length} requests`);
}

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
const lines = (await (await fetch(status.results_url, { headers: HEADERS })).text()).trim().split("\n");
mkdirSync(OUT_DIR, { recursive: true });
let ok = 0;
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
    // Truncated array (max_tokens): salvage every complete {"barcode":..,"flags":[..]} object.
    rows = [...stripped.matchAll(/\{\s*"barcode"\s*:\s*"[^"]+"\s*,\s*"flags"\s*:\s*\[[^\]]*\]\s*\}/g)]
      .map((m) => { try { return JSON.parse(m[0]); } catch { return null; } })
      .filter(Boolean);
    if (rows.length === 0) { failed.push(`${result.custom_id}: unparseable`); continue; }
    failed.push(`${result.custom_id}: truncated, salvaged ${rows.length}`);
  }
  const clean = rows.filter((r) => r.barcode && Array.isArray(r.flags) && r.flags.every((f) => VALID.has(f)));
  writeFileSync(join(OUT_DIR, `${batch.id}-${result.custom_id}.json`), JSON.stringify(clean));
  ok += clean.length;
}
console.log(JSON.stringify({ requests: requests.length, productsReclassified: ok, failedRequests: failed }));
