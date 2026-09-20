// Onboarding seeding (ux.md: the dictation-first question — "what do you
// actually eat on repeat" — materializes favorite meals as the user talks).
// One model call structures the freetext into simple meals with estimated
// macros; each becomes a real meal template (FoodSaved), which is what
// week 1 drafts from. Deterministic fallback: comma-split titles with no
// macros — the budget then honestly reports unknown meals.

import Anthropic from "@anthropic-ai/sdk";
import type { Client } from "@libsql/client";
import type { MealPlan } from "./contracts";
import { saveFood } from "./library";

export interface SeedMeal {
  title: string;
  calories: number | null;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
  minutes: number | null;
}

export const SEED_RUBRIC = `You turn one person's description of what they eat on repeat into a JSON array of distinct meals. Reply with ONLY the JSON array, no prose.

Each element: {"title": "Chicken burrito bowl", "calories": 650, "protein_g": 45, "carbs_g": 62, "fat_g": 21, "minutes": 25}
- title: short, capitalized, how a person names the meal.
- calories/protein_g/carbs_g/fat_g: your honest per-serving estimate for a typical portion.
- minutes: rough time to make it (5 for assembly, more for cooking).
- 3 to 8 meals. Merge duplicates. Skip things that aren't meals (drinks alone, supplements).`;

export type SeedModelCall = (system: string, text: string) => Promise<string>;

export const callSeedModel: SeedModelCall = async (system, text) => {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 1000,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: text }],
  });
  const block = response.content[0];
  return block?.type === "text" ? block.text : "";
};

const posNum = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null;

export function parseSeedMeals(raw: string): SeedMeal[] {
  let text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) text = fenced[1].trim();
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const meals: SeedMeal[] = [];
  for (const raw of parsed.slice(0, 8)) {
    if (typeof raw !== "object" || raw === null) continue;
    const m = raw as Record<string, unknown>;
    if (typeof m.title !== "string" || !m.title.trim()) continue;
    meals.push({
      title: m.title.trim().slice(0, 120),
      calories: posNum(m.calories),
      protein_g: posNum(m.protein_g),
      carbs_g: posNum(m.carbs_g),
      fat_g: posNum(m.fat_g),
      minutes: posNum(m.minutes),
    });
  }
  return meals;
}

// The honest fallback when the model is unreachable: titles only, macros
// unknown (never invented numbers).
export function fallbackSeedMeals(text: string): SeedMeal[] {
  return text
    .split(/,|\band\b|\n|;/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 2)
    .slice(0, 8)
    .map((part) => ({
      title: part.charAt(0).toUpperCase() + part.slice(1, 120),
      calories: null,
      protein_g: null,
      carbs_g: null,
      fat_g: null,
      minutes: null,
    }));
}

export async function seedLibrary(
  db: Client,
  householdId: string,
  text: string,
  model: SeedModelCall = callSeedModel
): Promise<Array<{ library_id: string; title: string }>> {
  let meals: SeedMeal[];
  try {
    meals = parseSeedMeals(await model(SEED_RUBRIC, text.slice(0, 4_000)));
  } catch {
    meals = [];
  }
  if (meals.length === 0) meals = fallbackSeedMeals(text);
  const saved: Array<{ library_id: string; title: string }> = [];
  for (const meal of meals) {
    const plan: MealPlan = {
      plan_version: 1,
      kind: "meal",
      title: meal.title,
      components: [],
      total_minutes: meal.minutes,
      source_url: null,
      ...(meal.calories != null
        ? {
            nutrition: {
              calories: meal.calories,
              protein_g: meal.protein_g ?? 0,
              carbs_g: meal.carbs_g ?? 0,
              fat_g: meal.fat_g ?? 0,
              basis: "per_serving" as const,
              confidence: "low" as const,
            },
          }
        : {}),
    };
    let library_id: string;
    try {
      ({ library_id } = await saveFood(db, householdId, plan));
    } catch {
      // Retrying onboarding with the same foods is idempotent. The unique meal
      // title index chooses the existing row; refresh it with the latest
      // reviewed estimates instead of failing or stacking a duplicate.
      const existing = await db.execute({
        sql: `SELECT id FROM library
          WHERE household_id = ? AND kind = 'meal' AND lower(trim(plan ->> '$.title')) = lower(trim(?))
          ORDER BY created_at ASC, rowid ASC LIMIT 1`,
        args: [householdId, meal.title],
      });
      if (existing.rows.length === 0) throw new Error("onboarding meal save failed");
      library_id = existing.rows[0].id as string;
      await db.execute({
        sql: "UPDATE library SET plan = ?, updated_at = ? WHERE household_id = ? AND id = ?",
        args: [JSON.stringify(plan), new Date().toISOString(), householdId, library_id],
      });
    }
    saved.push({ library_id, title: meal.title });
  }
  return saved;
}
