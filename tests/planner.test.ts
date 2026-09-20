// The deterministic composer core (spec planner-composer AC3/5/6): pure,
// byte-stable, 4 lanes. Fixed dates; week under draft: Mon 2026-08-03.

import { describe, expect, it } from "vitest";
import { composeWeekDraft, type ComposerContext } from "@/lib/planner";

const WEEK = "2026-08-03";

const meal = (
  id: string,
  title: string,
  calories: number | null,
  lastCooked: string | null,
  createdAt: string
) => ({ id, title, calories, last_cooked: lastCooked, created_at: createdAt });

const baseCtx = (over: Partial<ComposerContext> = {}): ComposerContext => ({
  weekStart: WEEK,
  meals: [
    meal("m1", "Chili", 550, "2026-07-20", "2026-07-01"),
    meal("m2", "Curry", 700, "2026-07-25", "2026-07-02"),
    meal("m3", "Tacos", 450, null, "2026-07-03"),
  ],
  workoutDays: [
    { date: "2026-08-03", slots: [{ lane: "workout", title: "Squat Day", library_id: "w1" }] },
    { date: "2026-08-05", slots: [{ lane: "workout", title: "Squat Day", library_id: "w1" }] },
  ],
  composedPhase: null,
  dailyCalories: undefined,
  latestRecovery: undefined,
  ...over,
});

const mealTitles = (days: ReturnType<typeof composeWeekDraft>["days"]) =>
  days.flatMap((d) => d.slots.filter((s) => s.lane === "meal").map((s) => s.title));

describe("composeWeekDraft", () => {
  it("drafts all four lanes across the week", () => {
    const { days } = composeWeekDraft(baseCtx());
    const slots = days.flatMap((d) => d.slots);
    expect(slots.filter((s) => s.lane === "meal")).toHaveLength(7);
    expect(slots.filter((s) => s.lane === "workout")).toHaveLength(2);
    expect(slots.filter((s) => s.lane === "sleep")).toHaveLength(7);
    expect(slots.filter((s) => s.lane === "mind")).toHaveLength(2);
    for (const d of days) expect(d.date >= WEEK && d.date <= "2026-08-09").toBe(true);
    for (const s of slots) expect((s as { slot_id?: string }).slot_id).toBeUndefined();
  });

  it("rotation: never-cooked newest leads, least-recently-cooked next, no consecutive repeats", () => {
    const titles = mealTitles(composeWeekDraft(baseCtx()).days);
    expect(titles[0]).toBe("Tacos"); // never cooked
    expect(titles[1]).toBe("Chili"); // cooked longest ago
    expect(titles[2]).toBe("Curry");
    for (let i = 1; i < titles.length; i++) expect(titles[i]).not.toBe(titles[i - 1]);
  });

  it("energy fit reorders candidates toward the per-meal envelope", () => {
    // daily 700 → envelope 700: Curry (700) is the closest fit and leads
    const titles = mealTitles(composeWeekDraft(baseCtx({ dailyCalories: 700 })).days);
    expect(titles[0]).toBe("Curry");
  });

  it("a macro-less library ignores the envelope instead of guessing", () => {
    const ctx = baseCtx({
      dailyCalories: 700,
      meals: [
        meal("m1", "Chili", null, "2026-07-20", "2026-07-01"),
        meal("m3", "Tacos", null, null, "2026-07-03"),
      ],
    });
    const titles = mealTitles(composeWeekDraft(ctx).days);
    expect(titles[0]).toBe("Tacos"); // rotation order, no invented fit
  });

  it("red recovery halves the workout lane and says so", () => {
    const out = composeWeekDraft(baseCtx({ latestRecovery: 20 }));
    const workouts = out.days.flatMap((d) => d.slots.filter((s) => s.lane === "workout"));
    expect(workouts).toHaveLength(1); // ceil(2/2)
    expect(out.reason.toLowerCase()).toContain("recovery");
  });

  it("red recovery in a deload week halves ONCE, never a quarter", () => {
    const out = composeWeekDraft(
      baseCtx({ latestRecovery: 20, composedPhase: "deload" })
    );
    // the deload proposal already arrives halved (2 sessions here stand for
    // the already-halved count) — red must not halve again
    const workouts = out.days.flatMap((d) => d.slots.filter((s) => s.lane === "workout"));
    expect(workouts).toHaveLength(2);
  });

  it("an empty cookbook degrades honestly", () => {
    const out = composeWeekDraft(baseCtx({ meals: [] }));
    expect(out.days.flatMap((d) => d.slots.filter((s) => s.lane === "meal"))).toHaveLength(0);
    expect(out.reason.toLowerCase()).toContain("no recipes");
  });

  it("hard restrictions remove incompatible recipes before any model can pick", () => {
    const out = composeWeekDraft(baseCtx({
      hardRestrictions: "peanuts, vegetarian",
      meals: [
        { ...meal("m1", "Peanut chicken", 600, null, "2026-07-01"), ingredients: ["peanuts", "chicken"], vegetarian: false },
        { ...meal("m2", "Black bean tacos", 500, null, "2026-07-02"), ingredients: ["black beans"], vegetarian: true },
      ],
    }));
    const meals = out.days.flatMap((day) => day.slots).filter((slot) => slot.lane === "meal");
    expect(meals.every((slot) => slot.library_id === "m2")).toBe(true);
    expect(out.reason).toContain("hard food restrictions");
  });

  it("nutrition-only drafts four timed meal slots and no workout-facing lanes", () => {
    const out = composeWeekDraft(baseCtx({ nutritionOnly: true }));
    for (const day of out.days) {
      expect(day.slots).toHaveLength(4);
      expect(day.slots.map((slot) => slot.meal_type)).toEqual(["breakfast", "lunch", "snack", "dinner"]);
      expect(day.slots.map((slot) => slot.time)).toEqual(["08:00", "12:30", "16:00", "19:00"]);
      expect(day.slots.every((slot) => slot.lane === "meal" && slot.servings === 1)).toBe(true);
    }
  });

  it("byte-deterministic: same context, same draft", () => {
    expect(composeWeekDraft(baseCtx())).toEqual(composeWeekDraft(baseCtx()));
  });
});
