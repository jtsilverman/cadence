// variationOf linking pass (specs/corpus.md): links equipment/angle/grip/stance/
// unilateral/tempo variants to their family's canonical parent so a user video
// attaches to one canonical exercise and the planner can swap within a family.
//
// Pipeline:
//   1. Cheap in-code clustering (movementPattern + name-stem + shared-token
//      connected components) groups exercises into plausible family clusters.
//   2. Batch pass: each cluster is judged TWICE (independent votes v1/v2, one
//      Message Batches API submission, distinct custom_ids -- same idiom as
//      scripts/corpus/audit-accuracy.mjs).
//   3. A link (memberId -> canonicalId) lands only if both votes agree exactly;
//      any disagreement (different canonical, or linked vs standalone) stays
//      null and is recorded in the report.
//   4. Result applied directly to data/corpus/exercises.json.
//
// Usage: node scripts/corpus/link-variations.mjs                (submit + poll + apply)
//        LINK_BATCH_ID=msgbatch_... node scripts/corpus/link-variations.mjs   (resume poll)
//
// Raw votes + disagreements + cluster map written to data/corpus/shards/link-variations/.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const EXERCISES_PATH = "data/corpus/exercises.json";
const OUT_DIR = "data/corpus/shards/link-variations";
const MODEL = "claude-sonnet-5";
const API = "https://api.anthropic.com/v1";
const MAX_CLUSTER_SIZE = 45;

function apiKey() {
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  const env = readFileSync("/Users/jsilverman/Documents/projects/cadence/.env.local", "utf8");
  return env.match(/^ANTHROPIC_API_KEY\s*=\s*"?([^"\n]+)"?/m)[1];
}
const HEADERS = { "x-api-key": apiKey(), "anthropic-version": "2023-06-01", "content-type": "application/json" };

// ---------------------------------------------------------------------------
// 1. Cheap in-code clustering
// ---------------------------------------------------------------------------

// Curated stem overrides for well-known ambiguous single-word families (a bare
// word like "press"/"curl"/"raise"/"extension"/"row" spans multiple genuinely
// distinct movements -- these regexes peel off the specific ones first).
const STEMS = [
  ["upright-row", /\bupright row\b/],
  ["row", /\brow(ing)?\b/],
  ["handstand-push-up", /\bhandstand push-up\b/],
  ["push-up", /\bpush-up\b/],
  ["pull-up", /\bpull-up\b|\bchin-up\b/],
  ["dip", /\bdip\b/],
  ["leg-curl", /\bleg curl\b|\bhamstring curl\b|\bnordic (ham(string)?|curl)\b|\bnordic curl\b/],
  ["wrist-curl", /\bwrist curl\b/],
  ["reverse-curl", /\breverse curl\b/],
  ["bicep-curl", /\bcurl\b/],
  ["calf-raise", /\bcalf raise\b/],
  ["tibialis-raise", /\btibialis raise\b/],
  ["front-raise", /\bfront raise\b/],
  ["lateral-raise", /\blateral raise\b/],
  ["rear-delt-raise", /\brear (delt )?raise\b|\breverse fly\b|\brear delt fly\b/],
  ["leg-raise", /\b(leg|knee) raise\b/],
  ["y-raise", /\b[twy]-raise\b/],
  ["leg-extension", /\bleg extension\b|\bknee extension\b/],
  ["back-extension", /\bback extension\b|\bhyperextension\b/],
  ["wrist-extension", /\bwrist extension\b|\bfinger extension\b/],
  ["neck-extension", /\bneck extension\b/],
  ["tricep-extension", /\btriceps? extension\b/],
  ["chest-fly", /\bfly\b|\bflye\b/],
  ["bench-press", /\bbench press\b|\bfloor press\b|\bboard press\b|\bpin press\b|\bspoto press\b|\bsvend press\b|\bguillotine press\b|\blarsen press\b|\bchest press\b/],
  ["overhead-press", /\boverhead press\b|\bshoulder press\b|\bmilitary press\b|\bpush press\b|\barnold press\b|\bz-press\b|\blandmine press\b|\bsots press\b|\bstrict press\b|\bviking press\b|\bcuban press\b|\bbent press\b|\bbehind-the-neck press\b/],
  ["leg-press", /\bleg press\b/],
  ["lat-pulldown", /\bpulldown\b/],
  ["tricep-pushdown", /\bpushdown\b/],
  ["squat-jump", /\bsquat jump\b|\bsplit-squat jump\b|\bsplit squat jump\b/],
  ["squat", /\bsquat\b/],
  ["lunge", /\blunge\b/],
  ["deadlift", /\bdeadlift\b/],
  ["hip-thrust", /\bhip thrust\b/],
  ["thruster", /\bthruster\b/],
  ["loaded-carry", /\bcarry\b|\bfarmer'?s? walk\b|\byoke walk\b|\boverhead walk\b|\bwaiter'?s? walk\b/],
  ["shrug", /\bshrug\b/],
  ["kb-swing", /\bswing\b/],
  ["plank", /\bplank\b/],
  ["crunch", /\bcrunch\b/],
  ["russian-twist", /\btwist\b/],
  ["clean-lift", /\bclean\b/],
  ["jerk-lift", /\bjerk\b/],
  ["snatch-lift", /\bsnatch\b/],
];

const CARDIO_MACHINES = ["treadmill", "bike", "elliptical", "rower", "stairmaster", "ski-erg", "assault-bike"];

function stemKey(e) {
  const n = e.name.toLowerCase();
  for (const [key, re] of STEMS) if (re.test(n)) return key;
  if (e.modality === "cardio") {
    const machine = e.equipment.find((eq) => CARDIO_MACHINES.includes(eq));
    if (machine) return `cardio-${machine}`;
  }
  return null;
}

const STOPWORDS = new Set([
  "the", "and", "or", "with", "to", "on", "in", "of", "a", "an",
  "barbell", "dumbbell", "kettlebell", "cable", "machine", "band", "banded",
  "resistance", "ez-bar", "smith", "trx", "plate", "sandbag", "bodyweight",
  "bar", "rope", "medicine", "ball", "foam", "roller", "landmine", "sled",
  "box", "weighted", "single", "double", "two-arm", "alternating", "standing",
  "seated", "lying", "kneeling", "half", "wide", "narrow", "close", "single-arm",
  "single-leg", "reverse-grip", "neutral-grip", "wide-grip", "close-grip",
  "assisted", "elevated", "supported",
]);
function tokens(name) {
  return name.toLowerCase().replace(/[()\/,.']/g, " ").split(/\s+|-/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
}

function buildClusters(exercises) {
  const stemmed = exercises.map((e) => ({ e, stem: stemKey(e) }));
  const named = stemmed.filter((x) => x.stem);
  const leftover = stemmed.filter((x) => !x.stem);

  const parent = new Map(leftover.map((x) => [x.e.id, x.e.id]));
  function find(a) { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; }
  function union(a, b) { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); }

  const byPattern = new Map();
  for (const x of leftover) {
    if (!byPattern.has(x.e.movementPattern)) byPattern.set(x.e.movementPattern, []);
    byPattern.get(x.e.movementPattern).push(x);
  }
  for (const group of byPattern.values()) {
    const tagged = group.map((x) => ({ x, toks: new Set(tokens(x.e.name)) }));
    for (let i = 0; i < tagged.length; i++) {
      for (let j = i + 1; j < tagged.length; j++) {
        let shared = false;
        for (const t of tagged[i].toks) if (tagged[j].toks.has(t)) { shared = true; break; }
        if (shared) union(tagged[i].x.e.id, tagged[j].x.e.id);
      }
    }
  }

  const clusters = new Map();
  for (const x of named) {
    const key = `stem:${x.stem}`;
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(x.e);
  }
  for (const x of leftover) {
    const key = `cc:${find(x.e.id)}`;
    if (!clusters.has(key)) clusters.set(key, []);
    clusters.get(key).push(x.e);
  }

  const finalClusters = [];
  for (const [key, members] of clusters.entries()) {
    if (members.length <= MAX_CLUSTER_SIZE) { finalClusters.push({ key, members }); continue; }
    const sub = new Map();
    for (const m of members) {
      const k = [...m.primaryMuscles].sort().join(",");
      if (!sub.has(k)) sub.set(k, []);
      sub.get(k).push(m);
    }
    for (const [subKey, subMembers] of sub.entries()) finalClusters.push({ key: `${key}|${subKey}`, members: subMembers });
  }

  return {
    linkable: finalClusters.filter((c) => c.members.length > 1),
    singletons: finalClusters.filter((c) => c.members.length === 1),
  };
}

// ---------------------------------------------------------------------------
// 2. Batch prompt
// ---------------------------------------------------------------------------

const LINK_RUBRIC = `You are linking exercise-database entries to their canonical parent movement. You will get a cluster of exercises that plausibly belong to the same movement family or families (id, name, aliases, modality, equipment, primaryMuscles, secondaryMuscles, mechanics, movementPattern, laterality).

Goal: within this cluster, find every genuine variant family. A family is a set of entries that are the SAME fundamental movement, differing only in equipment, angle/incline, grip, stance, unilateral-vs-bilateral, or tempo (e.g. barbell/dumbbell/incline/close-grip bench press are all one family; front/goblet/box squat are all one family). For each family, pick ONE canonicalId: the most standard, plain, commonly-recognized form of the movement that IS PRESENT in this cluster's id list (e.g. plain barbell/bodyweight version over a named-variation or machine version, if present). Never invent an id that isn't in the input list.

Do NOT link entries that are genuinely distinct movements even if they share a muscle, equipment, or a cluster with each other: a deadlift is not a squat variant; a front raise is not a lateral raise variant; a combination lift (e.g. clean and jerk) is not just an equipment variant of its component lift; a cardio-machine movement is not a variant of an unrelated strength lift. When in doubt, prefer standalone -- a real family beats a forced one, but do not force isolation either when a family clearly exists.

A canonical entry is never itself a member of another family (no id may appear as both a canonicalId and inside a memberIds list). Every id in the input must appear EXACTLY ONCE across the output: either as a canonicalId, inside exactly one family's memberIds, or in standalone.

Respond ONLY a JSON object, no prose, no fences:
{"families":[{"canonicalId":"...","memberIds":["...","..."]}],"standalone":["...","..."]}`;

function projectEntry(e) {
  return {
    id: e.id, name: e.name, aliases: e.aliases, modality: e.modality,
    equipment: e.equipment, primaryMuscles: e.primaryMuscles, secondaryMuscles: e.secondaryMuscles,
    mechanics: e.mechanics, movementPattern: e.movementPattern, laterality: e.laterality,
  };
}

function buildParams(cluster) {
  return {
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "disabled" },
    system: [{ type: "text", text: LINK_RUBRIC, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: JSON.stringify(cluster.members.map(projectEntry)) }],
  };
}

function parseResponseText(text) {
  // Despite "no prose, no fences", some responses lead with reasoning prose and
  // fence the JSON later. Try, in order: raw parse, anchored fence-strip, a
  // fenced block anywhere in the text, then brace-matching from the first "{".
  try { return JSON.parse(text); } catch { /* try next */ }
  const anchored = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "");
  try { return JSON.parse(anchored); } catch { /* try next */ }
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) { try { return JSON.parse(fenced[1]); } catch { /* try next */ } }
  const start = text.indexOf("{");
  if (start !== -1) {
    let depth = 0;
    for (let i = start; i < text.length; i++) {
      if (text[i] === "{") depth++;
      else if (text[i] === "}") { depth--; if (depth === 0) { return JSON.parse(text.slice(start, i + 1)); } }
    }
  }
  throw new Error("no parseable JSON object found");
}

function validateResult(result, cluster) {
  if (!result || !Array.isArray(result.families) || !Array.isArray(result.standalone)) return null;
  const ids = new Set(cluster.members.map((m) => m.id));
  const seen = new Set();
  const links = new Map(); // memberId -> canonicalId
  for (const fam of result.families) {
    if (!fam.canonicalId || !ids.has(fam.canonicalId)) return null;
    if (seen.has(fam.canonicalId)) return null;
    seen.add(fam.canonicalId);
    if (!Array.isArray(fam.memberIds)) return null;
    for (const mid of fam.memberIds) {
      if (!ids.has(mid) || mid === fam.canonicalId || seen.has(mid)) return null;
      seen.add(mid);
      links.set(mid, fam.canonicalId);
    }
  }
  for (const sid of result.standalone) {
    if (!ids.has(sid) || seen.has(sid)) return null;
    seen.add(sid);
  }
  if (seen.size !== ids.size) return null;
  return links;
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main() {
  const exercises = JSON.parse(readFileSync(EXERCISES_PATH, "utf8"));

  // origin/main ships with 740/1185 variationOf already non-null -- ad hoc guesses
  // individual territory-generator subagents made while first authoring entries,
  // never cross-checked against each other (16 already chain two levels deep).
  // This pass is the corpus's first actual verification (2 independent votes per
  // link), so it supersedes those guesses rather than patching around them:
  // every exercise starts from null and only this pipeline's agreed links survive.
  let preExistingCleared = 0;
  for (const e of exercises) {
    if (e.variationOf !== null) { e.variationOf = null; preExistingCleared++; }
  }
  console.log(`cleared ${preExistingCleared} pre-existing (unverified) variationOf values before rebuilding`);
  const { linkable, singletons } = buildClusters(exercises);
  console.log(`clusters: ${linkable.length} linkable (${linkable.reduce((s, c) => s + c.members.length, 0)} entries), ${singletons.length} singleton (guaranteed standalone)`);

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "clusters.json"), JSON.stringify(linkable.map((c) => ({ key: c.key, ids: c.members.map((m) => m.id) })), null, 1));

  const requests = [];
  for (const vote of ["v1", "v2"]) {
    for (let i = 0; i < linkable.length; i++) {
      requests.push({ custom_id: `link-${String(i).padStart(3, "0")}-${vote}`, params: buildParams(linkable[i]) });
    }
  }

  let batch;
  if (process.env.LINK_BATCH_ID) {
    batch = { id: process.env.LINK_BATCH_ID };
    console.log(`resuming link batch ${batch.id}`);
  } else {
    const createRes = await fetch(`${API}/messages/batches`, { method: "POST", headers: HEADERS, body: JSON.stringify({ requests }) });
    if (!createRes.ok) throw new Error(`batch create failed: ${createRes.status} ${await createRes.text()}`);
    batch = await createRes.json();
    console.log(`link batch ${batch.id}: ${requests.length} requests (${linkable.length} clusters, 2 votes)`);
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let status = batch;
  while (status.processing_status !== "ended") {
    await sleep(60_000);
    const res = await fetch(`${API}/messages/batches/${batch.id}`, { headers: HEADERS });
    if (!res.ok) { console.error(`poll failed: ${res.status}`); continue; }
    status = await res.json();
    console.log(`status: ${status.processing_status} (${JSON.stringify(status.request_counts)})`);
  }

  const lines = (await (await fetch(status.results_url, { headers: HEADERS })).text()).trim().split("\n");
  const byClusterVote = new Map(); // "idx-vote" -> links Map | null
  const unparseable = [];
  for (const line of lines) {
    const r = JSON.parse(line);
    const [, idxStr, vote] = r.custom_id.match(/^link-(\d+)-(v\d)$/);
    const idx = Number(idxStr);
    if (r.result.type !== "succeeded") { unparseable.push({ custom_id: r.custom_id, idx, vote, reason: r.result.type }); continue; }
    const text = r.result.message.content.find((b) => b.type === "text")?.text ?? "";
    let links = null;
    try { links = validateResult(parseResponseText(text), linkable[idx]); } catch { /* fall through to null */ }
    if (links === null) unparseable.push({ custom_id: r.custom_id, idx, vote, reason: "unparseable-or-invalid" });
    byClusterVote.set(`${idx}-${vote}`, links);
  }

  // Re-judge unparseable/invalid shards live (never park on a failed batch shard).
  for (const { custom_id, idx, vote } of unparseable) {
    console.log(`re-judging ${custom_id} live`);
    try {
      const res = await fetch(`${API}/messages`, { method: "POST", headers: HEADERS, body: JSON.stringify(buildParams(linkable[idx])) });
      if (!res.ok) throw new Error(`${res.status}`);
      const msg = await res.json();
      const text = msg.content.find((b) => b.type === "text")?.text ?? "";
      const links = validateResult(parseResponseText(text), linkable[idx]);
      byClusterVote.set(`${idx}-${vote}`, links);
    } catch (e) {
      console.error(`live re-judge failed for ${custom_id}: ${e.message}`);
      byClusterVote.set(`${idx}-${vote}`, null);
    }
  }

  // ---- adjudicate: a link lands only if both votes assign the SAME canonicalId ----
  const agreedLinks = new Map(); // memberId -> canonicalId
  const disagreements = [];
  for (let idx = 0; idx < linkable.length; idx++) {
    const v1 = byClusterVote.get(`${idx}-v1`);
    const v2 = byClusterVote.get(`${idx}-v2`);
    const ids = linkable[idx].members.map((m) => m.id);
    if (!v1 || !v2) { disagreements.push({ cluster: linkable[idx].key, ids, reason: "vote(s) failed to parse" }); continue; }
    for (const id of ids) {
      const c1 = v1.get(id) ?? null;
      const c2 = v2.get(id) ?? null;
      if (c1 === c2) { if (c1) agreedLinks.set(id, c1); continue; }
      disagreements.push({ id, cluster: linkable[idx].key, v1: c1, v2: c2 });
    }
  }

  // ---- apply ----
  const byId = new Map(exercises.map((e) => [e.id, e]));
  let applied = 0;
  for (const [memberId, canonicalId] of agreedLinks.entries()) {
    const entry = byId.get(memberId);
    if (!entry || memberId === canonicalId) continue;
    entry.variationOf = canonicalId;
    applied++;
  }
  // Chain guard: a canonical must itself have variationOf null. Since clustering
  // partitions ids disjointly this shouldn't occur, but collapse defensively.
  let collapsed = 0;
  for (const e of exercises) {
    if (e.variationOf && byId.get(e.variationOf)?.variationOf) {
      e.variationOf = byId.get(e.variationOf).variationOf;
      collapsed++;
    }
  }

  writeFileSync(EXERCISES_PATH, JSON.stringify(exercises, null, 1) + "\n");
  writeFileSync(join(OUT_DIR, "disagreements.json"), JSON.stringify(disagreements, null, 1));

  const linkedCount = exercises.filter((e) => e.variationOf).length;
  const summary = {
    clusters: linkable.length,
    singletonClusters: singletons.length,
    totalRequests: requests.length,
    unparseableRebatched: unparseable.length,
    linksApplied: applied,
    chainsCollapsed: collapsed,
    disagreements: disagreements.length,
    totalExercises: exercises.length,
    linked: linkedCount,
    standalone: exercises.length - linkedCount,
  };
  writeFileSync(join(OUT_DIR, "summary.json"), JSON.stringify(summary, null, 1));
  console.log(JSON.stringify(summary, null, 2));
}

main();
