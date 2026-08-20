import { createClient, type Client } from "@libsql/client";
import { beforeEach, describe, expect, it } from "vitest";
import { WORKOUT_SAVED } from "@/lib/contracts";
import { migrate } from "@/lib/db";
import { readEvents } from "@/lib/events";
import { listRecipes, listWorkouts, saveRecipe, saveWorkout } from "@/lib/library";
import { recordCooked } from "@/lib/pantry";
import { attachNextTargetSuggestions, parseWorkoutPlan } from "@/lib/workouts";

const HH = "hh-test";

const RECIPE = {
  plan_version: 1 as const,
  kind: "recipe" as const,
  title: "Chili",
  servings: 4,
  total_minutes: 45,
  ingredients: [{ name: "beef", qty: 1, unit: "lb", confidence: "high" as const }],
  steps: ["Brown the beef."],
  source_url: "https://example.com/chili",
  confidence: { title: "high" as const, servings: "high" as const, total_minutes: "high" as const },
};

const WORKOUT_BODY = {
  title: "Squat Day",
  exercises: [
    { name: "Back Squat", sets: 3, reps: 8, weight: 135, unit: "lb" },
    { name: "Plank", sets: 3, reps: 1, note: "60s holds" },
  ],
};

describe("parseWorkoutPlan", () => {
  it("accepts a valid body and returns a versioned workout plan", () => {
    const parsed = parseWorkoutPlan(WORKOUT_BODY);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.plan.kind).toBe("workout");
    expect(parsed.plan.plan_version).toBe(1);
    expect(parsed.plan.title).toBe("Squat Day");
    expect(parsed.plan.exercises).toHaveLength(2);
    expect(parsed.plan.exercises[0]).toEqual({
      name: "Back Squat",
      sets: 3,
      reps: 8,
      weight: 135,
      unit: "lb",
    });
  });

  it.each([
    ["missing title", { ...WORKOUT_BODY, title: "  " }],
    ["no exercises", { ...WORKOUT_BODY, exercises: [] }],
    ["fractional sets", { ...WORKOUT_BODY, exercises: [{ name: "x", sets: 2.5, reps: 8 }] }],
    ["zero reps", { ...WORKOUT_BODY, exercises: [{ name: "x", sets: 3, reps: 0 }] }],
    ["nameless exercise", { ...WORKOUT_BODY, exercises: [{ name: "", sets: 3, reps: 8 }] }],
    [
      "weight without unit",
      { ...WORKOUT_BODY, exercises: [{ name: "x", sets: 3, reps: 8, weight: 100 }] },
    ],
    ["negative weight", { ...WORKOUT_BODY, exercises: [{ name: "x", sets: 3, reps: 8, weight: -5, unit: "lb" }] }],
  ])("rejects %s with a reason", (_label, body) => {
    const parsed = parseWorkoutPlan(body);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason.length).toBeGreaterThan(0);
  });
});

describe("library kind split", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });

  it("saveWorkout writes a WorkoutSaved event and listWorkouts sees it; listRecipes does not", async () => {
    await saveRecipe(db, HH, RECIPE);
    const parsed = parseWorkoutPlan(WORKOUT_BODY);
    if (!parsed.ok) throw new Error(parsed.reason);
    const { library_id } = await saveWorkout(db, HH, parsed.plan);

    const workouts = await listWorkouts(db, HH);
    expect(workouts).toHaveLength(1);
    expect(workouts[0].id).toBe(library_id);
    expect(workouts[0].title).toBe("Squat Day");
    expect(workouts[0].exercise_count).toBe(2);

    const recipes = await listRecipes(db, HH);
    expect(recipes.map((r) => r.title)).toEqual(["Chili"]);

    const saved = await readEvents(db, HH, { type: WORKOUT_SAVED });
    expect(saved).toHaveLength(1);
    expect(saved[0].payload).toMatchObject({ library_id, title: "Squat Day" });
  });

  it("recordCooked on a workout id throws not-a-recipe (never a crash, never pantry)", async () => {
    const parsed = parseWorkoutPlan(WORKOUT_BODY);
    if (!parsed.ok) throw new Error(parsed.reason);
    const { library_id } = await saveWorkout(db, HH, parsed.plan);

    await expect(recordCooked(db, HH, library_id)).rejects.toThrow(/not a recipe/);
    expect(await readEvents(db, HH, { type: "RecipeCooked" })).toHaveLength(0);
  });
});

// spec planner-composer AC2 pin: a drift-superseded next_target must not
// silence the exercise the way a real dismissal does.
describe("next_target vs supersession", () => {
  it("a heavier recompute still proposes after superseding the old target", async () => {
    const db = createClient({ url: ":memory:" });
    await migrate(db);
    const HH = "hh-jake";
    const target = (weight: number) =>
      new Map([["bench press", { weight, unit: "lb", reason: `load ${weight}` }]]);
    await attachNextTargetSuggestions(db, HH, target(140));
    const out = await attachNextTargetSuggestions(db, HH, target(145)); // drift → supersede
    expect(out.get("bench press")?.suggestion_id).toBeTruthy();
  });
});
