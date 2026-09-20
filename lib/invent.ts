// AI-assisted food invention (UX.md intake door 3). The model proposes a
// recipe built from Jake's own palette and pantry; it never saves anything.
// The proposal lands in the SAME editable review form as every other intake
// door, so nothing enters the library without Jake reading it first.
//
// Two invariants matter more than the model here:
//   1. Hard restrictions are enforced deterministically AFTER the model
//      answers. A prompt is a request, not a guarantee, and a nut allergy is
//      not something to leave to instruction-following.
//   2. Invented food carries no nutrition block. The model does not know the
//      macros of a dish it just made up, and a confident guess would poison
//      the day's totals — unknown is the honest answer.

import type { RecipePlan } from "./contracts";
import type { ModelCall } from "./extract";
import { callExtractionModel, parseExtraction } from "./extract";
import { MEAT, foodAllowed, parseRestrictions } from "./restrictions";

export interface InventionRequest {
  // What Jake asked for, in his words ("something with the chicken and rice").
  wish: string;
  // Foods he already has or already eats — the palette the model works from.
  palette: string[];
  // Raw hard-restriction text straight from the profile.
  restrictions?: string;
}

export type InventionResult =
  | { ok: true; plan: RecipePlan }
  | { ok: false; reason: string };

const MAX_WISH_CHARS = 500;
const MAX_PALETTE = 60;

export function buildInventionPrompt(request: InventionRequest): string {
  const restrictions = parseRestrictions(request.restrictions);
  const palette = request.palette
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, MAX_PALETTE);

  return [
    "Invent ONE recipe the person can actually cook tonight.",
    `They asked for: ${request.wish.trim()}`,
    palette.length > 0
      ? `Build it from foods they already eat or have: ${palette.join(", ")}.`
      : "They gave no pantry list; keep the ingredients ordinary and easy to buy.",
    restrictions.length > 0
      ? `HARD RESTRICTIONS — the recipe must contain none of: ${restrictions.join(", ")}.`
      : "",
    "Return the recipe as JSON in the schema you were given.",
    // The model is explicitly told not to guess macros: the review form shows
    // nutrition as unknown, and an invented number would read as measured.
    "Do NOT include a nutrition or macros field. The macros are unknown.",
  ]
    .filter(Boolean)
    .join("\n");
}

// The deterministic safety gate. Runs on the model's answer, not on the
// prompt, because only the answer can actually break the rule.
export function inventionAllowed(
  plan: RecipePlan,
  restrictions: string | undefined
): boolean {
  const parsed = parseRestrictions(restrictions);
  if (parsed.length === 0) return true;
  const text = `${plan.title} ${plan.ingredients.map((i) => i.name).join(" ")}`;
  return foodAllowed(
    {
      title: plan.title,
      ingredients: plan.ingredients.map((i) => i.name),
      vegetarian: !MEAT.test(text),
    },
    restrictions
  );
}

export async function inventFood(
  request: InventionRequest,
  callModel: ModelCall = callExtractionModel
): Promise<InventionResult> {
  const wish = request.wish.trim();
  if (!wish) return { ok: false, reason: "say what you feel like eating" };
  if (wish.length > MAX_WISH_CHARS) {
    return { ok: false, reason: "that request is too long" };
  }

  let raw: string;
  try {
    raw = await callModel(buildInventionPrompt(request));
  } catch {
    return { ok: false, reason: "the invention model call failed" };
  }

  // Same parse gate as every other door: model output is untrusted input.
  // source_url "invented" marks provenance honestly — this came from a model,
  // not from a cookbook, and the library must never imply otherwise.
  const parsed = parseExtraction(raw, "invented");
  if (!parsed.ok) return parsed;
  if (parsed.plan.kind !== "recipe") {
    return { ok: false, reason: "invention is recipe-only" };
  }

  if (!inventionAllowed(parsed.plan, request.restrictions)) {
    return { ok: false, reason: "that suggestion broke a hard restriction — try again" };
  }

  // Strip any macro block the model supplied anyway. Invented food has
  // unknown nutrition; absent means unknown, and unknown is the truth here.
  const { nutrition: _dropped, ...plan } = parsed.plan;
  return { ok: true, plan: plan as RecipePlan };
}
