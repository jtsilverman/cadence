// Fixture seeding for the live eval suite (evals/charter.md). Three seeded
// households — fresh, week3, messy — each a deterministic function of "today"
// (routes fold on the real clock, so seeds compute dates relative to the
// household-local today). Used by the EVAL_MODE-gated reset endpoint and the
// CLI seeder; never imported by product code paths.

import type { Client } from "@libsql/client";
import type {
  EventEnvelope,
  Precision,
  RecipeNutrition,
  RecipePlan,
  ScheduleSlot,
} from "@/lib/contracts";
import { localDate, isoAddDays, mondayOf } from "@/lib/dates";
import { appendEvent, newEventId } from "@/lib/events";

export const HOUSEHOLD_ID = "hh-jake"; // the single pre-auth household every route uses

export const FIXTURES = ["fresh", "week3", "messy"] as const;
export type FixtureName = (typeof FIXTURES)[number];

// ---- date helpers (ET-stable timestamps) ----
// A Z-hour between 10:00 and 23:59 lands on the same America/New_York calendar
// day in both EST and EDT, so seeded events never straddle the local midnight.
export function todayLocal(): string {
  return localDate(new Date());
}
export const at = (dateISO: string, hhmmZ: string): string => `${dateISO}T${hhmmZ}:00.000Z`;
export const BREAKFAST = "12:30"; // ~8am ET
export const LUNCH = "16:30"; // ~12:30pm ET
export const DINNER = "23:00"; // ~7pm ET

// ---- event writer ----
interface EvOpts {
  source?: string;
  precision?: Precision;
  schema_version?: number;
}
export async function ev(
  db: Client,
  type: string,
  ts: string,
  payload: unknown,
  opts: EvOpts = {}
): Promise<string> {
  const event: EventEnvelope = {
    event_id: newEventId(),
    household_id: HOUSEHOLD_ID,
    type,
    ts,
    source: opts.source ?? "web",
    payload,
    schema_version: opts.schema_version ?? 1,
    precision: opts.precision ?? "estimated",
  };
  await appendEvent(db, event);
  return event.event_id;
}

// ---- recipe corpus shared by week3/messy ----
export interface SeedRecipe {
  id: string;
  title: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  minutes: number;
  ingredients: Array<{ name: string; qty: number | null; unit: string | null }>;
}

export const RECIPES: SeedRecipe[] = [
  { id: "lib-oats", title: "Overnight oats", calories: 420, protein_g: 22, carbs_g: 60, fat_g: 11, minutes: 5, ingredients: [{ name: "rolled oats", qty: 0.5, unit: "cup" }, { name: "greek yogurt", qty: 0.5, unit: "cup" }, { name: "blueberries", qty: 0.5, unit: "cup" }] },
  { id: "lib-burrito-bowl", title: "Chicken burrito bowl", calories: 650, protein_g: 45, carbs_g: 62, fat_g: 21, minutes: 25, ingredients: [{ name: "chicken breast", qty: 0.5, unit: "lb" }, { name: "rice", qty: 0.75, unit: "cup" }, { name: "black beans", qty: 0.5, unit: "cup" }, { name: "salsa", qty: null, unit: null }] },
  { id: "lib-salmon-bowl", title: "Salmon rice bowl", calories: 700, protein_g: 40, carbs_g: 58, fat_g: 28, minutes: 20, ingredients: [{ name: "salmon", qty: 0.5, unit: "lb" }, { name: "rice", qty: 0.75, unit: "cup" }, { name: "avocado", qty: 1, unit: "count" }] },
  { id: "lib-parfait", title: "Greek yogurt parfait", calories: 300, protein_g: 20, carbs_g: 38, fat_g: 7, minutes: 5, ingredients: [{ name: "greek yogurt", qty: 1, unit: "cup" }, { name: "granola", qty: 0.25, unit: "cup" }, { name: "honey", qty: 1, unit: "tbsp" }] },
  { id: "lib-chili", title: "Turkey chili", calories: 550, protein_g: 42, carbs_g: 45, fat_g: 18, minutes: 45, ingredients: [{ name: "ground turkey", qty: 1, unit: "lb" }, { name: "kidney beans", qty: 1, unit: "cup" }, { name: "crushed tomatoes", qty: 28, unit: "oz" }, { name: "onion", qty: 1, unit: "count" }] },
  { id: "lib-stir-fry", title: "Veggie stir fry", calories: 480, protein_g: 18, carbs_g: 52, fat_g: 20, minutes: 20, ingredients: [{ name: "broccoli", qty: 2, unit: "cup" }, { name: "tofu", qty: 0.5, unit: "lb" }, { name: "rice", qty: 0.75, unit: "cup" }, { name: "soy sauce", qty: null, unit: null }] },
  { id: "lib-pasta", title: "Pasta pomodoro", calories: 620, protein_g: 20, carbs_g: 90, fat_g: 16, minutes: 30, ingredients: [{ name: "spaghetti", qty: 4, unit: "oz" }, { name: "crushed tomatoes", qty: 14, unit: "oz" }, { name: "parmesan", qty: 1, unit: "oz" }, { name: "basil", qty: null, unit: null }] },
  { id: "lib-fajitas", title: "Steak fajitas", calories: 720, protein_g: 48, carbs_g: 55, fat_g: 30, minutes: 30, ingredients: [{ name: "flank steak", qty: 0.75, unit: "lb" }, { name: "bell pepper", qty: 2, unit: "count" }, { name: "tortillas", qty: 4, unit: "count" }, { name: "onion", qty: 1, unit: "count" }] },
  // two salads: one a frequent favorite, one planned — the cat14 "had the
  // salad" ambiguity needs both to exist
  { id: "lib-caesar", title: "Chicken caesar salad", calories: 520, protein_g: 38, carbs_g: 18, fat_g: 32, minutes: 15, ingredients: [{ name: "chicken breast", qty: 0.4, unit: "lb" }, { name: "romaine", qty: 1, unit: "count" }, { name: "parmesan", qty: 1, unit: "oz" }] },
  { id: "lib-garden-salad", title: "Garden salad", calories: 350, protein_g: 10, carbs_g: 28, fat_g: 22, minutes: 10, ingredients: [{ name: "spinach", qty: 4, unit: "oz" }, { name: "tomato", qty: 2, unit: "count" }, { name: "olive oil", qty: null, unit: null }] },
  // appended LAST: earlier fixtures index into this list by position
  { id: "lib-marry-me", title: "Marry me chicken", calories: 640, protein_g: 46, carbs_g: 22, fat_g: 38, minutes: 35, ingredients: [{ name: "chicken breast", qty: 1, unit: "lb" }, { name: "heavy cream", qty: 0.5, unit: "cup" }, { name: "sun-dried tomatoes", qty: 3, unit: "oz" }, { name: "parmesan", qty: 1, unit: "oz" }] },
];

export function recipePlan(r: SeedRecipe): RecipePlan {
  const nutrition: RecipeNutrition = {
    calories: r.calories,
    protein_g: r.protein_g,
    carbs_g: r.carbs_g,
    fat_g: r.fat_g,
    per_serving: true,
    confidence: "high",
  };
  return {
    plan_version: 1,
    kind: "recipe",
    title: r.title,
    servings: 2,
    total_minutes: r.minutes,
    ingredients: r.ingredients.map((i) => ({ ...i, confidence: "high" as const })),
    steps: [`Make ${r.title.toLowerCase()}.`],
    source_url: `https://example.com/recipes/${r.id}`,
    nutrition,
    confidence: { title: "high", servings: "high", total_minutes: "high" },
  };
}

export async function insertLibraryRecipe(db: Client, r: SeedRecipe, savedTs: string): Promise<void> {
  await db.execute({
    sql: `INSERT INTO library (id, household_id, kind, plan, source_url, created_at, updated_at)
          VALUES (?, ?, 'recipe', ?, ?, ?, ?)`,
    args: [r.id, HOUSEHOLD_ID, JSON.stringify(recipePlan(r)), `https://example.com/recipes/${r.id}`, savedTs, savedTs],
  });
  await ev(db, "RecipeSaved", savedTs, { library_id: r.id, title: r.title, source_url: `https://example.com/recipes/${r.id}` }, { precision: "exact" });
}

export async function cook(db: Client, r: SeedRecipe, ts: string): Promise<string> {
  return ev(
    db,
    "RecipeCooked",
    ts,
    {
      library_id: r.id,
      title: r.title,
      ingredients: r.ingredients,
      nutrition: { calories: r.calories, protein_g: r.protein_g, carbs_g: r.carbs_g, fat_g: r.fat_g, per_serving: true, confidence: "high" },
    },
    { precision: "estimated" }
  );
}

// Two Monday-start weeks of meal slots (breakfast/lunch/dinner), deterministic
// slot ids so app-suite scenarios can reference them across resets.
export function twoWeekDays(
  weekStart: string,
  pick: (dayIndex: number, meal: number) => SeedRecipe
): Array<{ date: string; slots: ScheduleSlot[] }> {
  const days: Array<{ date: string; slots: ScheduleSlot[] }> = [];
  for (let d = 0; d < 14; d++) {
    const date = isoAddDays(weekStart, d);
    const slots: ScheduleSlot[] = [0, 1, 2].map((m) => {
      const r = pick(d, m);
      return {
        slot_id: `slot-${date}-m${m}`,
        lane: "meal",
        title: r.title,
        library_id: r.id,
      };
    });
    days.push({ date, slots });
  }
  return days;
}

export async function assertPantry(
  db: Client,
  ts: string,
  name: string,
  qty: number | null,
  unit: string | null,
  expires?: string
): Promise<void> {
  await ev(db, "PantryAsserted", ts, { name, qty, unit, ...(expires ? { expires } : {}) }, { precision: "exact" });
  await db.execute({
    sql: `INSERT INTO pantry_view (household_id, name, qty, unit, precision, asserted_at, expires)
          VALUES (?, ?, ?, ?, 'exact', ?, ?)
          ON CONFLICT (household_id, name) DO UPDATE SET qty = excluded.qty, unit = excluded.unit, asserted_at = excluded.asserted_at, expires = excluded.expires`,
    args: [HOUSEHOLD_ID, name, qty, unit, ts, expires ?? null],
  });
}

// ---- wipe: every user table, discovered live so new tables (analytics) are covered ----
export async function wipe(db: Client): Promise<void> {
  const tables = await db.execute(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`
  );
  for (const row of tables.rows) {
    await db.execute(`DELETE FROM "${row.name}"`);
  }
}

export async function seedFixture(db: Client, name: FixtureName): Promise<void> {
  await wipe(db);
  const { seedFresh } = await import("./fresh");
  const { seedWeek3 } = await import("./week3");
  const { seedMessy } = await import("./messy");
  if (name === "fresh") await seedFresh(db);
  else if (name === "week3") await seedWeek3(db);
  else await seedMessy(db);
}
