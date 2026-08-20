// Onboarding seeding (lib/onboard.ts): the parse gate and the honest
// fallback. The live model path is exercised by the Layer 2 eval.

process.env.TURSO_DATABASE_URL = ":memory:";

import { describe, it, expect } from "vitest";
import { createClient } from "@libsql/client";
import { fallbackSeedMeals, parseSeedMeals, seedLibrary } from "@/lib/onboard";
import { migrate } from "@/lib/db";

describe("parseSeedMeals", () => {
  it("parses a fenced array and drops junk entries", () => {
    const meals = parseSeedMeals(
      '```json\n[{"title":"Chicken burrito bowl","calories":650,"protein_g":45,"carbs_g":62,"fat_g":21,"minutes":25},{"calories":100},{"title":"  "}]\n```'
    );
    expect(meals.length).toBe(1);
    expect(meals[0].title).toBe("Chicken burrito bowl");
    expect(meals[0].calories).toBe(650);
  });

  it("returns empty on garbage instead of inventing meals", () => {
    expect(parseSeedMeals("no json here")).toEqual([]);
    expect(parseSeedMeals('{"not":"array"}')).toEqual([]);
  });

  it("rejects negative and non-numeric macros to null", () => {
    const meals = parseSeedMeals('[{"title":"Oats","calories":-5,"protein_g":"lots"}]');
    expect(meals[0].calories).toBeNull();
    expect(meals[0].protein_g).toBeNull();
  });
});

describe("fallbackSeedMeals", () => {
  it("splits on commas/and with no invented macros", () => {
    const meals = fallbackSeedMeals("eggs and toast, chicken burrito bowls and pasta");
    expect(meals.length).toBeGreaterThanOrEqual(3);
    for (const meal of meals) expect(meal.calories).toBeNull();
  });
});

describe("seedLibrary", () => {
  it("saves parsed meals as library recipes with RecipeSaved receipts", async () => {
    const db = createClient({ url: ":memory:" });
    await migrate(db);
    const saved = await seedLibrary(
      db,
      "hh-jake",
      "eggs, bowls",
      async () => '[{"title":"Egg tacos","calories":420,"protein_g":24,"carbs_g":30,"fat_g":22,"minutes":15}]'
    );
    expect(saved.length).toBe(1);
    const lib = await db.execute(`SELECT kind, plan FROM library`);
    expect(lib.rows.length).toBe(1);
    const plan = JSON.parse(lib.rows[0].plan as string);
    expect(plan.title).toBe("Egg tacos");
    expect(plan.nutrition.confidence).toBe("low");
    const events = await db.execute(`SELECT type FROM events WHERE type = 'RecipeSaved'`);
    expect(events.rows.length).toBe(1);
  });

  it("a dead model degrades to title-only meals, never zero meals", async () => {
    const db = createClient({ url: ":memory:" });
    await migrate(db);
    const saved = await seedLibrary(db, "hh-jake", "eggs and toast, pasta", async () => {
      throw new Error("down");
    });
    expect(saved.length).toBeGreaterThanOrEqual(2);
  });
});
