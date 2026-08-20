import { describe, it, expect, beforeEach } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { migrate } from "@/lib/db";
import { saveRecipe, listRecipes, getPlans } from "@/lib/library";
import { readEvents } from "@/lib/events";
import type { StructuredPlan } from "@/lib/contracts";

const PLAN: StructuredPlan = {
  plan_version: 1,
  kind: "recipe",
  title: "Buttermilk Pancakes",
  servings: 4,
  total_minutes: 25,
  ingredients: [{ name: "flour", qty: 2, unit: "cup", confidence: "high" }],
  steps: ["Whisk.", "Griddle."],
  source_url: "https://example.com/pancakes",
  confidence: { title: "high", servings: "high", total_minutes: "low" },
};

describe("saveRecipe", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });

  it("writes a library row and a RecipeSaved event atomically", async () => {
    const { library_id } = await saveRecipe(db, "hh-jake", PLAN);

    const rows = await db.execute({
      sql: "SELECT * FROM library WHERE id = ?",
      args: [library_id],
    });
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].household_id).toBe("hh-jake");
    expect(rows.rows[0].kind).toBe("recipe");
    expect(JSON.parse(rows.rows[0].plan as string)).toEqual(PLAN);
    expect(rows.rows[0].source_url).toBe("https://example.com/pancakes");

    const events = await readEvents(db, "hh-jake", { type: "RecipeSaved" });
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual({
      library_id,
      title: "Buttermilk Pancakes",
      source_url: "https://example.com/pancakes",
    });
  });

  it("rolls back the library row when the event write fails (atomicity)", async () => {
    // Force the second statement in the transaction to fail
    await db.execute("DROP TABLE events");

    await expect(saveRecipe(db, "hh-jake", PLAN)).rejects.toThrow();

    const rows = await db.execute("SELECT COUNT(*) AS n FROM library");
    expect(Number(rows.rows[0].n)).toBe(0);
  });

  it("listRecipes returns household-scoped summaries, newest first", async () => {
    await saveRecipe(db, "hh-jake", PLAN);
    await saveRecipe(db, "hh-jake", {
      ...PLAN,
      title: "Chili",
      source_url: "https://example.com/chili",
    });
    await saveRecipe(db, "hh-other", { ...PLAN, title: "Not Mine" });

    const list = await listRecipes(db, "hh-jake");
    expect(list.map((r) => r.title)).toEqual(["Chili", "Buttermilk Pancakes"]);
    expect(list[0]).toMatchObject({
      source_url: "https://example.com/chili",
    });
    expect(typeof list[0].id).toBe("string");
  });

  it("getPlans returns full plans for the requested ids only, household-scoped", async () => {
    const { library_id: id1 } = await saveRecipe(db, "hh-jake", PLAN);
    // distinct source_url: same-URL re-saves update in place (journey J7)
    await saveRecipe(db, "hh-jake", { ...PLAN, title: "Chili", source_url: "https://example.com/chili" });
    const { library_id: otherId } = await saveRecipe(db, "hh-other", {
      ...PLAN,
      title: "Not Mine",
    });

    const plans = await getPlans(db, "hh-jake", [id1, otherId]);
    expect(plans).toHaveLength(1);
    // id travels with the plan so callers can pair them (WeekPlanned snapshot)
    expect(plans[0]).toEqual({ id: id1, plan: PLAN });
  });

  it("getPlans of no ids returns empty without touching the db shape", async () => {
    expect(await getPlans(db, "hh-jake", [])).toEqual([]);
  });
});
