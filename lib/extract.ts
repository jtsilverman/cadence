import type {
  Confidence,
  RecipeIngredient,
  RecipeNutrition,
  SourceEmbed,
  RecipePlan,
  StructuredPlan,
} from "./contracts";
import { parseSourceEmbed } from "./contracts";
import { parseWorkoutPlan } from "./workouts";

import Anthropic from "@anthropic-ai/sdk";

const MAX_INPUT_CHARS = 50000; // Haiku 4.5 is 200K-token; keep input small and cheap
const MIN_USABLE_CONTENT = 200; // below this the page carried no recipe worth sending
const MAX_HTML_BYTES = 3_000_000; // recipe pages are <1MB; bigger is not a recipe

// Hostname-level SSRF guard: loopback, link-local, RFC1918, internal TLDs.
// DNS-rebinding is out of scope for the single-user MVP; revisit before multi-tenant (P4).
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) {
    return true;
  }
  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }
  return false;
}

// Static rubric: byte-identical across calls so the cache_control prefix can hit.
// Dynamic page content goes in the user message only.
const RUBRIC = `You extract structured plans from shared content into strict JSON.

The user message contains one of: a schema.org Recipe JSON block, raw page text,
a social-video caption/description, or a photo of a page. The content is either
a RECIPE or a WORKOUT (training session, lifting program, exercise routine) —
decide which. Respond with ONLY a JSON object, no prose. Three possible shapes:

1. If a real recipe is present:
{
  "kind": "recipe",
  "title": string,
  "servings": number | null,
  "total_minutes": number | null,
  "ingredients": [{"name": string, "qty": number | null, "unit": string | null, "confidence": "high" | "low"}],
  "steps": [string],
  "confidence": {"title": "high" | "low", "servings": "high" | "low", "total_minutes": "high" | "low"},
  "nutrition": {"calories": number, "protein_g": number, "carbs_g": number, "fat_g": number, "per_serving": true, "confidence": "high" | "low"}
}

Rules:
- ingredients: name is the bare ingredient ("flour", not "2 cups sifted flour"). qty is a number (convert fractions: ½ -> 0.5). unit is the unit word or null. Mark confidence "low" when you guessed or the source was ambiguous ("to taste", unclear amounts).
- steps: rewrite as SHORT numbered imperative instructions in your own words, one action each. Do NOT paste source prose verbatim. 3-20 steps typical.
- Do NOT invent ingredients or steps that are not in the content.
- servings/total_minutes: null when absent; parse ISO durations (PT45M -> 45).
- nutrition: ESTIMATED per-serving macros. Use stated nutrition facts when the content has them (confidence "high"); otherwise estimate from the ingredient amounts divided by servings (confidence "low"). All four numbers required, non-negative. Omit the whole nutrition field only when you cannot estimate at all (no amounts, no servings basis).

2. If a real workout is present:
{
  "kind": "workout",
  "title": string,
  "exercises": [{"name": string, "sets": number, "reps": number, "weight": number?, "unit": string?, "note": string?}]
}

Workout rules:
- sets and reps are positive integers. A rep RANGE ("8-12") uses the LOWER bound, with the range noted in note.
- weight requires unit. Do NOT invent exercises, sets, or loads that are not in the content.

3. If the content is NOT a usable recipe or workout (blocked page, login wall, unrelated article, empty content):
{"error": "<one short sentence saying why>"}

Never fabricate a plan from a page that does not contain one.`;

// Model call is injectable so unit tests never hit the paid API.
// Input is either page/caption text or vision content blocks (photo intake).
export type ModelInput =
  | string
  | Array<
      | { type: "text"; text: string }
      | {
          type: "image";
          source: { type: "base64"; media_type: string; data: string };
        }
    >;
export type ModelCall = (input: ModelInput) => Promise<string>;

export async function callExtractionModel(input: ModelInput): Promise<string> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: RUBRIC,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: input as Parameters<
          Anthropic["messages"]["create"]
        >[0]["messages"][0]["content"],
      },
    ],
  });
  const block = response.content[0];
  return block?.type === "text" ? block.text : "";
}

export const MAX_IMAGE_BYTES = 5_000_000; // phone photos compress well below this
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// Photo of a cookbook page/recipe card -> StructuredPlan, same parse gate.
export async function extractRecipeFromImage(
  imageBase64: string,
  mediaType: string,
  callModel: ModelCall = callExtractionModel
): Promise<ExtractionResult> {
  if (!IMAGE_TYPES.includes(mediaType)) {
    return { ok: false, reason: "unsupported image type (use JPEG/PNG/WebP)" };
  }
  if ((imageBase64.length * 3) / 4 > MAX_IMAGE_BYTES) {
    return { ok: false, reason: "image too large (max 5MB)" };
  }
  let raw: string;
  try {
    raw = await callModel([
      {
        type: "image",
        source: { type: "base64", media_type: mediaType, data: imageBase64 },
      },
      { type: "text", text: "Extract the recipe from this photo." },
    ]);
  } catch {
    return { ok: false, reason: "extraction model call failed" };
  }
  const result = parseExtraction(raw, "photo");
  // the shared rubric CAN return a workout; photo intake is recipe-only by
  // guard, not assertion (spec workout-video-extraction AC6)
  if (result.ok && result.plan.kind !== "recipe") {
    return { ok: false, reason: "photo intake is recipe-only for now" };
  }
  return result;
}

// URL in -> StructuredPlan or graceful failure. Never throws for content problems;
// network/model errors surface as ok:false too.
export async function extractRecipe(
  url: string,
  callModel: ModelCall = callExtractionModel
): Promise<ExtractionResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, reason: "invalid URL" };
  }
  if (isBlockedHost(parsed.hostname)) {
    return { ok: false, reason: "that host is not allowed" };
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "instagram.com" || host.endsWith(".instagram.com")) {
    return {
      ok: false,
      reason:
        "Instagram recipes aren't supported yet — Instagram locks captions behind login",
    };
  }

  let html: string;
  let finalUrl = parsed;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; cadence/0.1)" },
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    if (!response.ok) {
      return {
        ok: false,
        reason: `page fetch failed (HTTP ${response.status})`,
      };
    }
    // redirect: "follow" may have landed somewhere else — re-check the final host
    if (response.url) {
      finalUrl = new URL(response.url);
      if (isBlockedHost(finalUrl.hostname)) {
        return { ok: false, reason: "that host is not allowed" };
      }
    }
    html = await response.text();
  } catch {
    return { ok: false, reason: "could not fetch the page" };
  }
  if (html.length > MAX_HTML_BYTES) {
    return { ok: false, reason: "page too large" };
  }

  // Per-source adapters: social video pages carry the recipe in the caption/
  // description, not the DOM; the adapter also yields the sandbox-embed ref.
  const acquired = await acquireVideoInput(finalUrl, html);
  if (acquired && "fail" in acquired) {
    return { ok: false, reason: acquired.fail };
  }

  let input: string;
  let embed: SourceEmbed | undefined;
  if (acquired) {
    ({ input, embed } = acquired);
  } else {
    input = prepareExtractionInput(html);
    if (input.length < MIN_USABLE_CONTENT) {
      return { ok: false, reason: "page had no usable content" };
    }
  }

  let raw: string;
  try {
    raw = await callModel(input);
  } catch {
    return { ok: false, reason: "extraction model call failed" };
  }

  return parseExtraction(raw, url, embed);
}

const MIN_CAPTION_CHARS = 100; // hashtag-stripped; below this no recipe fits

type VideoAcquired = { input: string; embed: SourceEmbed } | { fail: string };

// TikTok/YouTube: dig the caption/description out of the page's embedded JSON
// (plain HTTP fetch of a public page — no media download, no automation).
async function acquireVideoInput(
  url: URL,
  html: string
): Promise<VideoAcquired | null> {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");

  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    const videoId = url.pathname.match(/\/video\/(\d+)/)?.[1];
    if (!videoId) return { fail: "couldn't find a TikTok video in that link" };
    const caption = digTiktokCaption(html);
    if (!caption || thin(caption)) {
      return {
        fail: "the video caption doesn't carry the recipe (voiceover-only videos aren't supported yet)",
      };
    }
    return {
      input: `Video caption:\n${caption}`.slice(0, MAX_INPUT_CHARS),
      embed: await withThumbnail(
        { provider: "tiktok", video_id: videoId },
        `https://www.tiktok.com/oembed?url=${encodeURIComponent(url.href)}`
      ),
    };
  }

  if (
    host === "youtube.com" ||
    host.endsWith(".youtube.com") ||
    host === "youtu.be"
  ) {
    const videoId =
      host === "youtu.be"
        ? url.pathname.slice(1).split("/")[0]
        : url.searchParams.get("v") ?? url.pathname.match(/\/shorts\/([\w-]+)/)?.[1];
    if (!videoId) return { fail: "couldn't find a YouTube video in that link" };
    const dug = digYoutubeDescription(html);
    if (!dug || thin(dug.description)) {
      return {
        fail: "the video description doesn't carry the recipe (voiceover-only videos aren't supported yet)",
      };
    }
    return {
      input: `Video title: ${dug.title}\n\nVideo description:\n${dug.description}`.slice(
        0,
        MAX_INPUT_CHARS
      ),
      embed: await withThumbnail(
        { provider: "youtube", video_id: videoId },
        `https://www.youtube.com/oembed?url=${encodeURIComponent(url.href)}&format=json`
      ),
    };
  }

  return null; // not a video source — default web path
}

const thin = (text: string): boolean =>
  text.replace(/#\S+/g, "").trim().length < MIN_CAPTION_CHARS;

function digTiktokCaption(html: string): string | null {
  const match = html.match(
    /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
  );
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]) as {
      __DEFAULT_SCOPE__?: {
        "webapp.video-detail"?: {
          itemInfo?: { itemStruct?: { desc?: unknown } };
        };
      };
    };
    const desc =
      data.__DEFAULT_SCOPE__?.["webapp.video-detail"]?.itemInfo?.itemStruct?.desc;
    return typeof desc === "string" ? desc : null;
  } catch {
    return null;
  }
}

function digYoutubeDescription(
  html: string
): { title: string; description: string } | null {
  const desc = html.match(/"shortDescription":"((?:[^"\\]|\\.)*)"/);
  if (!desc) return null;
  // Anchor the title to the videoDetails block: ytInitialData precedes the
  // player response on real watch pages and carries dozens of other "title"s.
  const detailsAt = html.indexOf('"videoDetails"');
  const title =
    detailsAt === -1
      ? null
      : html.slice(detailsAt).match(/"title":"((?:[^"\\]|\\.)*)"/);
  try {
    return {
      title: title ? (JSON.parse(`"${title[1]}"`) as string) : "",
      description: JSON.parse(`"${desc[1]}"`) as string,
    };
  } catch {
    return null;
  }
}

// Best-effort thumbnail via the provider's public oEmbed (fixed hosts, not
// user input). Failure just means no thumbnail — never fails the extraction.
async function withThumbnail(
  embed: SourceEmbed,
  oembedUrl: string
): Promise<SourceEmbed> {
  try {
    const response = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return embed;
    const data = (await response.json()) as { thumbnail_url?: unknown };
    if (
      typeof data.thumbnail_url === "string" &&
      data.thumbnail_url.startsWith("https://")
    ) {
      return { ...embed, thumbnail_url: data.thumbnail_url };
    }
  } catch {
    // fall through — thumbnail is decoration
  }
  return embed;
}

// Reduce raw page HTML to a compact extraction input for the model:
// JSON-LD Recipe block when present (clean structured data), else stripped text.
export function prepareExtractionInput(html: string): string {
  const recipe = findJsonLdRecipe(html);
  if (recipe) {
    return JSON.stringify(pruneRecipeNode(recipe)).slice(0, MAX_INPUT_CHARS);
  }
  return stripHtml(html).slice(0, MAX_INPUT_CHARS);
}

function findJsonLdRecipe(html: string): Record<string, unknown> | null {
  const scripts = html.matchAll(
    /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi
  );
  for (const match of scripts) {
    let data: unknown;
    try {
      data = JSON.parse(match[1]);
    } catch {
      continue;
    }
    // Recipe node may be top-level, in an array, or inside @graph
    const nodes: unknown[] = Array.isArray(data) ? data : [data];
    for (const node of nodes) {
      if (typeof node !== "object" || node === null) continue;
      const n = node as Record<string, unknown>;
      const candidates = Array.isArray(n["@graph"])
        ? (n["@graph"] as unknown[])
        : [n];
      for (const candidate of candidates) {
        if (typeof candidate !== "object" || candidate === null) continue;
        const c = candidate as Record<string, unknown>;
        const type = c["@type"];
        const isRecipe =
          type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"));
        if (isRecipe && Array.isArray(c.recipeIngredient)) return c;
      }
    }
  }
  return null;
}

// Keep only fields useful for extraction; drops images, ratings, publisher noise.
function pruneRecipeNode(node: Record<string, unknown>): Record<string, unknown> {
  const KEEP = [
    "name",
    "recipeYield",
    "totalTime",
    "cookTime",
    "prepTime",
    "recipeIngredient",
    "recipeInstructions",
    "description",
  ];
  const pruned: Record<string, unknown> = {};
  for (const key of KEEP) {
    if (node[key] !== undefined) pruned[key] = node[key];
  }
  return pruned;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export type ExtractionResult =
  | { ok: true; plan: StructuredPlan }
  | { ok: false; reason: string };

// Parse + validate the model's raw text into StructuredPlan v1.
// Tolerant of code fences; strict on shape (untrusted LLM output boundary).
// A {"error": ...} object from the model maps to the graceful failure path.
export function parseExtraction(
  raw: string,
  sourceUrl: string,
  embed?: SourceEmbed
): ExtractionResult {
  const stripped = stripFences(raw);

  let data: unknown;
  try {
    data = JSON.parse(stripped);
  } catch {
    return { ok: false, reason: "model output was not valid JSON" };
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, reason: "model output was not a JSON object" };
  }
  const obj = data as Record<string, unknown>;

  if (typeof obj.error === "string") {
    return { ok: false, reason: obj.error };
  }

  // Kind dispatch (spec workout-video-extraction): absent/"recipe" rides the
  // recipe path unchanged; "workout" goes through the SAME gate manual entry
  // uses — parseWorkoutPlan alone gates source fields and plan_version.
  if (obj.kind !== undefined && obj.kind !== "recipe") {
    if (obj.kind !== "workout") {
      return { ok: false, reason: `unknown plan kind "${String(obj.kind)}"` };
    }
    const workout = parseWorkoutPlan({
      title: obj.title,
      exercises: obj.exercises,
      // the photo path's "photo" sentinel is not a source URL — only real
      // http(s) origins travel (the library dedup guard skips the rest anyway)
      ...(/^https?:\/\//.test(sourceUrl) ? { source_url: sourceUrl } : {}),
      ...(embed !== undefined
        ? { source_embed: embed }
        : obj.source_embed !== undefined
          ? { source_embed: obj.source_embed }
          : {}),
    });
    return workout.ok ? { ok: true, plan: workout.plan } : workout;
  }

  if (typeof obj.title !== "string" || obj.title.trim() === "") {
    return { ok: false, reason: "missing title" };
  }

  const servings = optionalNumber(obj.servings);
  if (servings === undefined) return { ok: false, reason: "invalid servings" };
  const totalMinutes = optionalNumber(obj.total_minutes);
  if (totalMinutes === undefined) {
    return { ok: false, reason: "invalid total_minutes" };
  }

  if (!Array.isArray(obj.ingredients) || obj.ingredients.length === 0) {
    return { ok: false, reason: "missing ingredients" };
  }
  const ingredients: RecipeIngredient[] = [];
  for (const item of obj.ingredients) {
    const parsed = parseIngredient(item);
    if (!parsed) return { ok: false, reason: "invalid ingredient entry" };
    ingredients.push(parsed);
  }

  if (
    !Array.isArray(obj.steps) ||
    obj.steps.length === 0 ||
    !obj.steps.every((s) => typeof s === "string" && s.trim() !== "")
  ) {
    return { ok: false, reason: "missing steps" };
  }

  const confidence = parseConfidenceFlags(obj.confidence);
  if (!confidence) return { ok: false, reason: "invalid confidence flags" };

  // Server-side embed (adapter) wins; else validate one arriving in the body
  // (save-route round-trip). A malformed body embed is an error, not a drop.
  let sourceEmbed = embed;
  if (!sourceEmbed && obj.source_embed !== undefined) {
    const parsedEmbed = parseSourceEmbed(obj.source_embed);
    if (!parsedEmbed) return { ok: false, reason: "invalid source_embed" };
    sourceEmbed = parsedEmbed;
  }

  const plan: RecipePlan = {
    plan_version: sourceEmbed ? 2 : 1,
    kind: "recipe",
    title: obj.title,
    servings,
    total_minutes: totalMinutes,
    ingredients,
    steps: obj.steps,
    source_url: sourceUrl,
    confidence,
  };
  if (sourceEmbed) plan.source_embed = sourceEmbed;
  const nutrition = parseNutrition(obj.nutrition);
  if (nutrition) plan.nutrition = nutrition;
  return { ok: true, plan };
}

// Tolerant, unlike source_embed's error path: this gate also parses raw model
// output, where a garbled nutrition block must never kill a good extraction —
// invalid shapes drop to absent (unknown), never to zeros.
const macroNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

function parseNutrition(value: unknown): RecipeNutrition | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const n = value as Record<string, unknown>;
  if (!macroNum(n.calories) || !macroNum(n.protein_g) || !macroNum(n.carbs_g) || !macroNum(n.fat_g)) {
    return null;
  }
  if (n.per_serving !== true) return null;
  if (n.confidence !== "high" && n.confidence !== "low") return null;
  return {
    calories: n.calories,
    protein_g: n.protein_g,
    carbs_g: n.carbs_g,
    fat_g: n.fat_g,
    per_serving: true,
    confidence: n.confidence,
  };
}

function stripFences(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^```[a-zA-Z]*\s*\n?([\s\S]*?)\n?```$/);
  return match ? match[1].trim() : trimmed;
}

// number | null pass through; anything else (incl. bool, NaN) is undefined = invalid
function optionalNumber(value: unknown): number | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return undefined;
}

function isConfidence(value: unknown): value is Confidence {
  return value === "high" || value === "low";
}

function parseIngredient(item: unknown): RecipeIngredient | null {
  if (typeof item !== "object" || item === null) return null;
  const i = item as Record<string, unknown>;
  if (typeof i.name !== "string" || i.name.trim() === "") return null;
  const qty = optionalNumber(i.qty);
  if (qty === undefined) return null;
  if (i.unit !== null && i.unit !== undefined && typeof i.unit !== "string") {
    return null;
  }
  if (!isConfidence(i.confidence)) return null;
  return {
    name: i.name,
    qty,
    unit: (i.unit as string | null) ?? null,
    confidence: i.confidence,
  };
}

function parseConfidenceFlags(
  value: unknown
): RecipePlan["confidence"] | null {
  if (typeof value !== "object" || value === null) return null;
  const c = value as Record<string, unknown>;
  if (
    !isConfidence(c.title) ||
    !isConfidence(c.servings) ||
    !isConfidence(c.total_minutes)
  ) {
    return null;
  }
  return { title: c.title, servings: c.servings, total_minutes: c.total_minutes };
}
