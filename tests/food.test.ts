import { describe, it, expect, beforeEach } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { migrate } from "@/lib/db";
import { parseFoodPlan } from "@/lib/food";
import { listFoods, saveFood } from "@/lib/library";
import { readEvents } from "@/lib/events";
import { FOOD_SAVED } from "@/lib/contracts";

const HH = "hh-jake";

describe("parseFoodPlan (untrusted intake gate)", () => {
  it("accepts each non-recipe kind with its required fields", () => {
    expect(parseFoodPlan({ kind: "ingredient", title: "rolled oats", unit: "g" }).ok).toBe(true);
    expect(parseFoodPlan({ kind: "product", title: "skyr", upc: "12345678" }).ok).toBe(true);
    expect(parseFoodPlan({ kind: "snack", title: "almonds", servings: 2 }).ok).toBe(true);
    expect(
      parseFoodPlan({
        kind: "meal",
        title: "oats and skyr",
        components: [{ library_id: "lib-1", servings: 1 }],
      }).ok
    ).toBe(true);
  });

  it("rejects unknown kinds, blank titles, and missing kind-specific fields", () => {
    expect(parseFoodPlan({ kind: "beverage", title: "tea" }).ok).toBe(false);
    expect(parseFoodPlan({ kind: "snack", title: "   " }).ok).toBe(false);
    expect(parseFoodPlan({ kind: "ingredient", title: "oats" }).ok).toBe(false);
    expect(parseFoodPlan({ kind: "meal", title: "plate", components: [] }).ok).toBe(false);
    expect(
      parseFoodPlan({ kind: "meal", title: "plate", components: [{ library_id: "x", servings: 0 }] })
        .ok
    ).toBe(false);
  });

  it("sends recipes to the recipe gate instead of silently dropping their body", () => {
    const result = parseFoodPlan({ kind: "recipe", title: "pancakes" });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/recipe gate/);
  });

  it("rejects a non-http source and a non-GTIN barcode rather than storing them", () => {
    expect(parseFoodPlan({ kind: "snack", title: "bar", source_url: "not-a-url" }).ok).toBe(false);
    expect(parseFoodPlan({ kind: "product", title: "skyr", upc: "12ab" }).ok).toBe(false);
    expect(parseFoodPlan({ kind: "product", title: "skyr", upc: "123" }).ok).toBe(false);
  });

  it("treats blank optionals as null and unusable macros as unknown, never zero", () => {
    const result = parseFoodPlan({
      kind: "product",
      title: "skyr",
      brand: "  ",
      upc: "",
      serving_size: "",
      nutrition: { calories: "lots", protein_g: 17, carbs_g: 6, fat_g: 0 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok || result.plan.kind !== "product") throw new Error("expected a product");
    expect(result.plan.brand).toBeNull();
    expect(result.plan.upc).toBeNull();
    expect(result.plan.serving_size).toBeNull();
    expect(result.plan.nutrition).toBeUndefined();
  });

  it("keeps a complete macro block with its explicit basis", () => {
    const result = parseFoodPlan({
      kind: "ingredient",
      title: "rolled oats",
      unit: "g",
      nutrition: {
        calories: 379,
        protein_g: 13,
        carbs_g: 68,
        fat_g: 7,
        basis: "per_100g",
        confidence: "low",
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected a plan");
    expect(result.plan.nutrition).toMatchObject({ basis: "per_100g", confidence: "low" });
  });
});

describe("saveFood and listFoods", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });

  const save = async (body: Record<string, unknown>) => {
    const parsed = parseFoodPlan(body);
    if (!parsed.ok) throw new Error(parsed.reason);
    return saveFood(db, HH, parsed.plan);
  };

  it("writes a library row and a FoodSaved event carrying the kind", async () => {
    const { library_id } = await save({ kind: "snack", title: "almonds", servings: 2 });

    const rows = await db.execute({ sql: "SELECT * FROM library WHERE id = ?", args: [library_id] });
    expect(rows.rows[0].kind).toBe("snack");
    expect(rows.rows[0].household_id).toBe(HH);

    const events = await readEvents(db, HH, { type: FOOD_SAVED });
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual({
      library_id,
      kind: "snack",
      title: "almonds",
      source_url: null,
    });
  });

  it("lists every food kind newest-first and flags whether macros are known", async () => {
    await save({ kind: "ingredient", title: "rolled oats", unit: "g" });
    await save({
      kind: "product",
      title: "skyr",
      nutrition: {
        calories: 120,
        protein_g: 17,
        carbs_g: 6,
        fat_g: 0,
        basis: "per_serving",
        confidence: "high",
      },
    });

    const foods = await listFoods(db, HH);
    expect(foods.map((f) => f.title)).toEqual(["skyr", "rolled oats"]);
    expect(foods[0].has_nutrition).toBe(true);
    expect(foods[1].has_nutrition).toBe(false);
  });

  it("narrows by kind and never returns workouts", async () => {
    await save({ kind: "snack", title: "almonds" });
    await save({ kind: "ingredient", title: "rolled oats", unit: "g" });
    await db.execute({
      sql: `INSERT INTO library (id, household_id, kind, plan, source_url, created_at, updated_at)
        VALUES ('w-1', ?, 'workout', '{"kind":"workout","title":"push"}', NULL, '2026-01-01', '2026-01-01')`,
      args: [HH],
    });

    expect((await listFoods(db, HH, ["snack"])).map((f) => f.title)).toEqual(["almonds"]);
    expect((await listFoods(db, HH)).map((f) => f.kind).sort()).toEqual(["ingredient", "snack"]);
  });

  it("is household-scoped", async () => {
    await save({ kind: "snack", title: "almonds" });
    expect(await listFoods(db, "hh-other")).toEqual([]);
  });

  it("updates in place when the same http source is saved twice", async () => {
    const first = await save({
      kind: "product",
      title: "skyr",
      source_url: "https://example.com/skyr",
    });
    const second = await save({
      kind: "product",
      title: "skyr 0% vanilla",
      source_url: "https://example.com/skyr",
    });

    expect(second.library_id).toBe(first.library_id);
    const foods = await listFoods(db, HH, ["product"]);
    expect(foods).toHaveLength(1);
    expect(foods[0].title).toBe("skyr 0% vanilla");
  });

  it("keeps sourceless entries distinct instead of folding them together", async () => {
    const a = await save({ kind: "snack", title: "almonds" });
    const b = await save({ kind: "snack", title: "almonds" });
    expect(b.library_id).not.toBe(a.library_id);
    expect(await listFoods(db, HH, ["snack"])).toHaveLength(2);
  });
});
