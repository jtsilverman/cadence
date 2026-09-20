// The parse gate for the four non-recipe food kinds (ingredient, product,
// snack, meal). Recipes keep their own richer gate in lib/extract.ts; this is
// the single validator every other intake door funnels through — manual entry,
// barcode/UPC, and AI-assisted invention alike. All input here is untrusted:
// a typed form body and a model proposal get exactly the same treatment.

import type {
  FoodPlan,
  FoodKind,
  IngredientPlan,
  MealComponent,
  MealPlan,
  ProductPlan,
  SnackPlan,
} from "./contracts";
import { FOOD_KINDS, parseFoodNutrition } from "./contracts";

export type FoodParseResult =
  | { ok: true; plan: FoodPlan }
  | { ok: false; reason: string };

export const isFoodKind = (value: unknown): value is FoodKind =>
  typeof value === "string" && (FOOD_KINDS as readonly string[]).includes(value);

// Trimmed non-empty string, or null for the fields the user may leave blank.
// A whitespace-only entry is blank, not a value: storing " " would make an
// empty brand look like a real one everywhere downstream.
function optionalText(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function requiredText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// http(s) only. A bare word in the source field is a mistake, not provenance,
// and silently keeping it would let an unverifiable string pose as a citation.
function sourceUrl(value: unknown): string | null | undefined {
  const text = optionalText(value);
  if (text === undefined) return undefined;
  if (text === null) return null;
  return /^https?:\/\//.test(text) ? text : undefined;
}

// Digits only, 8-14 long: the real GTIN-8/12/13/14 family. Scanners and hand
// typing both land here, so the check is on the value rather than the door.
function upc(value: unknown): string | null | undefined {
  const text = optionalText(value);
  if (text === undefined) return undefined;
  if (text === null) return null;
  return /^\d{8,14}$/.test(text) ? text : undefined;
}

function positiveNumber(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === "") return null;
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

function parseComponents(value: unknown): MealComponent[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const components: MealComponent[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null) return null;
    const item = entry as Record<string, unknown>;
    const libraryId = requiredText(item.library_id);
    if (!libraryId) return null;
    const servings = positiveNumber(item.servings);
    if (servings === undefined || servings === null) return null;
    components.push({ library_id: libraryId, servings });
  }
  return components;
}

// One gate, five outcomes. Returns a reason rather than throwing so every
// caller (route, chat executor, invention review) reports the same wording.
export function parseFoodPlan(body: unknown): FoodParseResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, reason: "food entry must be an object" };
  }
  const obj = body as Record<string, unknown>;

  if (!isFoodKind(obj.kind)) {
    return { ok: false, reason: `unknown food kind "${String(obj.kind)}"` };
  }
  if (obj.kind === "recipe") {
    // Recipes carry ingredients, steps, and extraction confidence; routing
    // them here would quietly drop all three. Fail loudly instead.
    return { ok: false, reason: "save recipes through the recipe gate" };
  }

  const title = requiredText(obj.title);
  if (!title) return { ok: false, reason: "missing title" };

  const source = sourceUrl(obj.source_url);
  if (source === undefined) return { ok: false, reason: "invalid source_url" };

  // Absent or unusable macros mean unknown, never zero (the RecipePlan idiom).
  const nutrition = parseFoodNutrition(obj.nutrition);

  if (obj.kind === "ingredient") {
    const unit = requiredText(obj.unit);
    if (!unit) return { ok: false, reason: "ingredient needs a unit" };
    const plan: IngredientPlan = {
      plan_version: 1,
      kind: "ingredient",
      title,
      unit,
      source_url: source,
    };
    if (nutrition) plan.nutrition = nutrition;
    return { ok: true, plan };
  }

  if (obj.kind === "product") {
    const brand = optionalText(obj.brand);
    if (brand === undefined) return { ok: false, reason: "invalid brand" };
    const code = upc(obj.upc);
    if (code === undefined) return { ok: false, reason: "invalid barcode" };
    const servingSize = optionalText(obj.serving_size);
    if (servingSize === undefined) return { ok: false, reason: "invalid serving size" };
    const plan: ProductPlan = {
      plan_version: 1,
      kind: "product",
      title,
      brand,
      upc: code,
      serving_size: servingSize,
      source_url: source,
    };
    if (nutrition) plan.nutrition = nutrition;
    return { ok: true, plan };
  }

  if (obj.kind === "snack") {
    const servings = positiveNumber(obj.servings);
    if (servings === undefined) return { ok: false, reason: "invalid servings" };
    const plan: SnackPlan = {
      plan_version: 1,
      kind: "snack",
      title,
      servings,
      source_url: source,
    };
    if (nutrition) plan.nutrition = nutrition;
    return { ok: true, plan };
  }

  const components = parseComponents(obj.components);
  if (!components) return { ok: false, reason: "a meal needs at least one component" };
  const plan: MealPlan = {
    plan_version: 1,
    kind: "meal",
    title,
    components,
    source_url: source,
  };
  if (nutrition) plan.nutrition = nutrition;
  return { ok: true, plan };
}
