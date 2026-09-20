import { describe, it, expect, beforeEach } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { migrate } from "@/lib/db";
import { readEvents } from "@/lib/events";
import {
  assertPantry,
  recordCooked,
  recordInflow,
  readPantryView,
  rebuildPantryView,
  rebuildPantry,
} from "@/lib/pantry";
import { saveFood, saveRecipe } from "@/lib/library";
import {
  PANTRY_ASSERTED,
  PANTRY_INFLOW,
  RECIPE_COOKED,
  type PantryAssertedPayload,
  type PantryInflowPayload,
  type RecipeCookedPayload,
  type StructuredPlan,
} from "@/lib/contracts";

const HH = "hh-jake";

let db: Client;
beforeEach(async () => {
  db = createClient({ url: ":memory:" });
  await migrate(db);
});

describe("assertPantry", () => {
  it("writes one PantryAsserted event and the matching pantry_view row", async () => {
    await assertPantry(db, HH, { name: "Eggs", qty: 12, unit: "count" });

    const events = await readEvents(db, HH, { type: PANTRY_ASSERTED });
    expect(events).toHaveLength(1);
    const payload = events[0].payload as PantryAssertedPayload;
    expect(payload).toEqual({ name: "Eggs", qty: 12, unit: "count" });
    expect(events[0].precision).toBe("exact");
    expect(events[0].source).toBe("web");

    const view = await readPantryView(db, HH);
    expect(view).toEqual([
      {
        name: "eggs",
        qty: 12,
        unit: "count",
        precision: "exact",
        asserted_at: events[0].ts,
      },
    ]);
  });

  it("re-asserting the same item overwrites its view row, not duplicates", async () => {
    await assertPantry(db, HH, { name: "eggs", qty: 12, unit: "count" });
    await assertPantry(db, HH, { name: " Eggs ", qty: 6, unit: "count" });

    const view = await readPantryView(db, HH);
    expect(view).toHaveLength(1);
    expect(view[0].qty).toBe(6);
    expect(await readEvents(db, HH, { type: PANTRY_ASSERTED })).toHaveLength(2);
  });

  it("removal writes a removed event and deletes the view row", async () => {
    await assertPantry(db, HH, { name: "milk", qty: 1, unit: "carton" });
    await assertPantry(db, HH, { name: "milk", removed: true });

    expect(await readPantryView(db, HH)).toEqual([]);
    const events = await readEvents(db, HH, { type: PANTRY_ASSERTED });
    expect(events).toHaveLength(2);
    expect((events[1].payload as PantryAssertedPayload).removed).toBe(true);
  });

  it("rolls back the event when the view write fails (atomicity)", async () => {
    // Force the second statement in the transaction to fail
    await db.execute("DROP TABLE pantry_view");

    await expect(
      assertPantry(db, HH, { name: "eggs", qty: 12, unit: "count" })
    ).rejects.toThrow();

    expect(await readEvents(db, HH, { type: PANTRY_ASSERTED })).toHaveLength(0);
  });

  it("accepts qty null (present, amount unknown) with estimated precision", async () => {
    await assertPantry(db, HH, {
      name: "flour",
      qty: null,
      unit: null,
      precision: "estimated",
    });
    const view = await readPantryView(db, HH);
    expect(view[0].qty).toBeNull();
    expect(view[0].precision).toBe("estimated");
  });
});

describe("recordInflow", () => {
  it("writes one PantryInflow event and the view sums onto existing stock", async () => {
    await assertPantry(db, HH, { name: "eggs", qty: 6, unit: "count" });
    await recordInflow(
      db,
      HH,
      [
        { name: "Eggs", qty: 12, unit: "count" },
        { name: "spaghetti", qty: 1, unit: "lb" },
      ],
      "checkoff"
    );

    const events = await readEvents(db, HH, { type: PANTRY_INFLOW });
    expect(events).toHaveLength(1);
    const payload = events[0].payload as PantryInflowPayload;
    expect(payload.via).toBe("checkoff");
    expect(payload.items).toHaveLength(2);
    expect(events[0].precision).toBe("exact");

    const view = await readPantryView(db, HH);
    expect(view.map((i) => [i.name, i.qty])).toEqual([
      ["eggs", 18],
      ["spaghetti", 1],
    ]);
  });

  it("delivery inflow is recorded as estimated precision", async () => {
    await recordInflow(db, HH, [{ name: "milk", qty: 1, unit: "carton" }], "delivery");
    const events = await readEvents(db, HH, { type: PANTRY_INFLOW });
    expect(events[0].precision).toBe("estimated");
    expect((await readPantryView(db, HH))[0].precision).toBe("estimated");
  });

  it("rolls back the event when the view write fails (atomicity)", async () => {
    await db.execute("DROP TABLE pantry_view");
    await expect(
      recordInflow(db, HH, [{ name: "milk", qty: 1, unit: "carton" }], "checkoff")
    ).rejects.toThrow();
    expect(await readEvents(db, HH, { type: PANTRY_INFLOW })).toHaveLength(0);
  });

  it("concurrent writes never lose an update: view equals the fold of all events", async () => {
    // Double-tap / two-tabs race: both events must land AND the view must be
    // the fold of both, not of whichever stale snapshot wrote last.
    await Promise.all([
      recordInflow(db, HH, [{ name: "eggs", qty: 1, unit: "count" }], "checkoff"),
      recordInflow(db, HH, [{ name: "eggs", qty: 1, unit: "count" }], "checkoff"),
    ]);
    expect(await readEvents(db, HH, { type: PANTRY_INFLOW })).toHaveLength(2);
    const view = await readPantryView(db, HH);
    expect(view.map((i) => [i.name, i.qty])).toEqual([["eggs", 2]]);
  });
});

describe("recordCooked", () => {
  const PLAN: StructuredPlan = {
    plan_version: 1,
    kind: "recipe",
    title: "Scramble",
    servings: 2,
    total_minutes: 10,
    ingredients: [
      { name: "eggs", qty: 3, unit: "count", confidence: "high" },
      { name: "butter", qty: 1, unit: "stick", confidence: "high" },
    ],
    steps: ["Whisk.", "Cook."],
    source_url: "https://example.com/scramble",
    confidence: { title: "high", servings: "high", total_minutes: "high" },
  };

  it("snapshots the plan's ingredients into one RecipeCooked event and decrements the view", async () => {
    const { library_id } = await saveRecipe(db, HH, PLAN);
    await assertPantry(db, HH, { name: "eggs", qty: 12, unit: "count" });

    await recordCooked(db, HH, library_id);

    const events = await readEvents(db, HH, { type: RECIPE_COOKED });
    expect(events).toHaveLength(1);
    const payload = events[0].payload as RecipeCookedPayload;
    expect(payload.library_id).toBe(library_id);
    expect(payload.title).toBe("Scramble");
    expect(payload.ingredients).toEqual([
      { name: "eggs", qty: 3, unit: "count" },
      { name: "butter", qty: 1, unit: "stick" },
    ]);
    expect(events[0].precision).toBe("estimated");

    // eggs 12-3=9; butter untracked -> no-op
    expect((await readPantryView(db, HH)).map((i) => [i.name, i.qty])).toEqual([
      ["eggs", 9],
    ]);
  });

  it("rejects an unknown library id without writing anything", async () => {
    await expect(recordCooked(db, HH, "nope")).rejects.toThrow(/not found/);
    expect(await readEvents(db, HH, { type: RECIPE_COOKED })).toHaveLength(0);
  });

  it("logs a saved meal template without inventing pantry depletion", async () => {
    const { library_id } = await saveFood(db, HH, {
      plan_version: 1,
      kind: "meal",
      title: "Egg tacos",
      components: [],
      source_url: null,
      nutrition: {
        calories: 420,
        protein_g: 24,
        carbs_g: 30,
        fat_g: 22,
        basis: "per_serving",
        confidence: "low",
      },
    });
    await assertPantry(db, HH, { name: "eggs", qty: 12, unit: "count" });

    await recordCooked(db, HH, library_id);

    const [event] = await readEvents(db, HH, { type: RECIPE_COOKED });
    expect(event.payload).toMatchObject({
      library_id,
      title: "Egg tacos",
      ingredients: [],
      nutrition: { calories: 420, per_serving: true },
    });
    expect((await readPantryView(db, HH))[0].qty).toBe(12);
  });
});

describe("rebuildPantryView (criterion 7: view rebuildable from log alone)", () => {
  it("recomputes pantry_view from events after the view table is wiped", async () => {
    await assertPantry(db, HH, { name: "eggs", qty: 12, unit: "count" });
    await assertPantry(db, HH, { name: "milk", qty: 1, unit: "carton" });
    await assertPantry(db, HH, { name: "eggs", qty: 6, unit: "count" });
    await assertPantry(db, HH, { name: "milk", removed: true });
    await recordInflow(
      db,
      HH,
      [
        { name: "eggs", qty: 6, unit: "count" },
        { name: "butter", qty: 1, unit: "stick" },
      ],
      "delivery"
    );
    // mixed-unit events: conversion must be deterministic in the fold
    await assertPantry(db, HH, { name: "ground beef", qty: 1, unit: "lb" });
    await recordInflow(db, HH, [{ name: "ground beef", qty: 8, unit: "oz" }], "delivery");
    const { library_id } = await saveRecipe(db, HH, {
      plan_version: 1,
      kind: "recipe",
      title: "Fried Eggs",
      servings: 1,
      total_minutes: 5,
      ingredients: [{ name: "eggs", qty: 2, unit: "count", confidence: "high" }],
      steps: ["Fry."],
      source_url: "https://example.com/fried",
      confidence: { title: "high", servings: "high", total_minutes: "high" },
    });
    await recordCooked(db, HH, library_id);
    const before = await readPantryView(db, HH);
    expect(before.map((i) => [i.name, i.qty])).toEqual([
      ["butter", 1],
      ["eggs", 10],
      ["ground beef", 1.5],
    ]);

    await db.execute("DELETE FROM pantry_view");
    expect(await readPantryView(db, HH)).toEqual([]);

    await rebuildPantryView(db, HH);
    const after = await readPantryView(db, HH);

    expect(after).toEqual(before);
    // independent recomputation via the pure fold, not the write path
    expect(after).toEqual(rebuildPantry(await readEvents(db, HH)));
  });
});

// spec nutrition AC3: macros snapshot into the cook event, so a later library
// re-save (upsert-in-place) can never rewrite cooked history.
describe("recordCooked nutrition snapshot", () => {
  const NUT = { calories: 400, protein_g: 30, carbs_g: 5, fat_g: 28, per_serving: true as const, confidence: "high" as const };
  const PLAN: StructuredPlan = {
    plan_version: 1,
    kind: "recipe",
    title: "Omelette",
    servings: 1,
    total_minutes: 8,
    ingredients: [{ name: "eggs", qty: 3, unit: "count", confidence: "high" }],
    steps: ["Whisk.", "Fold."],
    source_url: "https://example.com/omelette",
    nutrition: NUT,
    confidence: { title: "high", servings: "high", total_minutes: "high" },
  };

  it("snapshots the recipe's nutrition into the RecipeCooked payload", async () => {
    const { library_id } = await saveRecipe(db, HH, PLAN);
    await recordCooked(db, HH, library_id);
    const events = await readEvents(db, HH, { type: RECIPE_COOKED });
    const mine = events
      .map((e) => e.payload as RecipeCookedPayload)
      .filter((p) => p.library_id === library_id);
    expect(mine).toHaveLength(1);
    expect(mine[0].nutrition).toEqual(NUT);
  });

  it("a recipe without nutrition cooks with the field absent, not zeroed", async () => {
    const { library_id } = await saveRecipe(db, HH, {
      ...PLAN,
      nutrition: undefined,
      source_url: "https://example.com/omelette-plain",
    });
    await recordCooked(db, HH, library_id);
    const events = await readEvents(db, HH, { type: RECIPE_COOKED });
    const mine = events
      .map((e) => e.payload as RecipeCookedPayload)
      .filter((p) => p.library_id === library_id);
    expect(mine[0].nutrition).toBeUndefined();
    expect("nutrition" in mine[0]).toBe(false);
  });
});
