// J11 — "The app knows what I'm eating: recipes carry estimated macros, my
// week has a calorie budget, and when I skip a meal or blow the budget it
// offers a fix I can take or wave off." Suggest-only throughout: proposals
// never touch my plan. One story, one DB, real clock.

import { describe, it, expect, beforeAll } from "vitest";
import { loadApp, type App, get, post, todayLocal, mondayOf, addDays } from "./harness";

let app: App;

const today = todayLocal();
const weekStart = mondayOf(today);

// A recipe body the save route accepts (the extraction shape).
function recipeBody(
  title: string,
  url: string,
  nutrition?: unknown
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    source_url: url,
    title,
    servings: 4,
    total_minutes: 30,
    ingredients: [{ name: "beans", qty: 2, unit: "can", confidence: "high" }],
    steps: ["Simmer everything."],
    confidence: { title: "high", servings: "high", total_minutes: "high" },
  };
  if (nutrition !== undefined) body.nutrition = nutrition;
  return body;
}

let chiliId: string; // 600 cal/serving
let toastId: string; // no nutrition
let skipSlotId: string; // the meal slot we'll skip

const dayOf = (days: any[], date: string) => days.find((d: any) => d.date === date);

beforeAll(async () => {
  app = await loadApp();
  const chili = await post(
    app.recipes,
    recipeBody("Weeknight Chili", "https://example.com/chili", {
      calories: 600,
      protein_g: 35,
      carbs_g: 50,
      fat_g: 20,
      per_serving: true,
      confidence: "high",
    })
  );
  chiliId = chili.body.library_id;
  const toast = await post(app.recipes, recipeBody("Plain Toast", "https://example.com/toast"));
  toastId = toast.body.library_id;
});

describe("J11: a week with a calorie budget", () => {
  it("plans a day of meals; without a nutrition goal there is no budget", async () => {
    const res = await post(app.schedule, {
      days: [
        {
          date: today,
          slots: [
            { lane: "meal", title: "Weeknight Chili", library_id: chiliId },
            { lane: "meal", title: "Leftovers night" },
          ],
        },
      ],
    });
    expect(res.status).toBe(200);
    skipSlotId = dayOf(res.body.days, today).slots[1].slot_id;
    for (const day of res.body.days) expect(day.budget).toBeUndefined();
  });

  it("a nutrition goal is accepted and starts the budget at zero", async () => {
    const res = await post(app.goals, {
      goal_id: "g-nutrition",
      title: "Eat 2000 a day",
      kind: "nutrition",
      daily_calories: 2000,
      protein_g: 150,
    });
    expect(res.status).toBe(200);

    const schedule = await get(app.schedule);
    const budget = dayOf(schedule.body.days, today).budget;
    expect(budget).toEqual({
      consumed: 0,
      target: 2000,
      week_consumed: 0,
      week_target: 14000,
      unknown_meals: 0,
    });
  });

  it("cooking a recipe with macros counts toward today and the week", async () => {
    const res = await post(app.cook, { library_id: chiliId });
    expect(res.status).toBe(200);
    const schedule = await get(app.schedule);
    const budget = dayOf(schedule.body.days, today).budget;
    expect(budget.consumed).toBe(600);
    expect(budget.week_consumed).toBe(600);
    expect(budget.unknown_meals).toBe(0);
  });

  it("cooking a recipe without macros is visible as unknown, never silently zero", async () => {
    await post(app.cook, { library_id: toastId });
    const schedule = await get(app.schedule);
    const budget = dayOf(schedule.body.days, today).budget;
    expect(budget.consumed).toBe(600); // toast added nothing it can't know
    expect(budget.unknown_meals).toBe(1);
  });

  it("goal progress and the schedule budget tell one story", async () => {
    const res = await get(app.goals);
    const goal = res.body.goals.find((g: any) => g.kind === "nutrition");
    expect(goal).toBeDefined();
    expect(goal.progress.week_consumed).toBe(600);
    expect(goal.progress.week_target).toBe(14000);
    expect(goal.progress.unknown_meals).toBe(1);
  });

  it("skipping a meal offers meal-shaped repair: shift or drop, never workout math", async () => {
    const res = await post(app.log, { kind: "skip", slot_id: skipSlotId, lane: "meal" });
    expect(res.status).toBe(200);
    const day = dayOf(res.body.days, today);
    expect(day.slots.find((s: any) => s.slot_id === skipSlotId).status).toBe("skipped");
    const mine = (day.repair_proposals ?? []).filter(
      (p: any) => p.missed_slot_id === skipSlotId
    );
    expect(mine.length).toBeGreaterThan(0);
    const options = mine.map((p: any) => p.option);
    expect(options).toContain("drop");
    for (const o of options) expect(["shift", "drop"]).toContain(o);
    // a shifted meal lands on a day that has no other meal, as a meal
    for (const p of mine.filter((x: any) => x.option === "shift")) {
      for (const d of p.days) {
        const meals = d.slots.filter((s: any) => s.lane === "meal");
        if (d.date !== today && meals.some((s: any) => s.title === "Leftovers night")) {
          expect(meals).toHaveLength(1);
        }
      }
    }
  });

  it("blowing the weekly budget yields a capped, spread correction — and touches nothing", async () => {
    const feast = await post(
      app.recipes,
      recipeBody("Festival Feast", "https://example.com/feast", {
        calories: 6000,
        protein_g: 100,
        carbs_g: 400,
        fat_g: 300,
        per_serving: true,
        confidence: "low",
      })
    );
    const before = await get(app.schedule);
    for (let i = 0; i < 3; i++) {
      await post(app.cook, { library_id: feast.body.library_id });
    }
    const schedule = await get(app.schedule);
    const budget = dayOf(schedule.body.days, today).budget;
    expect(budget.week_consumed).toBe(600 + 18000);

    const proposals = schedule.body.days.flatMap((d: any) => d.nutrition_proposals ?? []);
    expect(proposals).toHaveLength(1);
    const adjust = proposals[0];
    expect(adjust.kind).toBe("nutrition_adjust");
    expect(adjust.week_start).toBe(weekStart);
    expect(adjust.overage_calories).toBe(18600 - 14000);
    expect(adjust.per_day_cap).toBeGreaterThan(0);
    expect(adjust.per_day_cap).toBeLessThanOrEqual(500); // capped at 25% of daily target
    expect(adjust.days_remaining).toBeGreaterThan(0);
    expect(adjust.reason).toBeTruthy();

    // suggest-only: the plan's slots are exactly what they were
    const strip = (days: any[]) =>
      days.map((d: any) => ({ date: d.date, slots: d.slots }));
    expect(strip(schedule.body.days)).toEqual(strip(before.body.days));
  });

  it("waving the correction off silences it for the week, even as numbers drift", async () => {
    const schedule = await get(app.schedule);
    const adjust = schedule.body.days.flatMap((d: any) => d.nutrition_proposals ?? [])[0];
    const res = await post(app.suggestion, {
      suggestion_id: adjust.suggestion_id,
      outcome: "dismissed",
    });
    expect(res.status).toBe(200);

    const after = await get(app.schedule);
    expect(after.body.days.flatMap((d: any) => d.nutrition_proposals ?? [])).toHaveLength(0);

    // sloppy: resolving the same suggestion twice is an error, not a double-write
    const again = await post(app.suggestion, {
      suggestion_id: adjust.suggestion_id,
      outcome: "dismissed",
    });
    expect(again.status).toBe(422);
  });

  it("raising my target makes the overshoot disappear instead of nagging", async () => {
    const res = await post(app.goals, {
      goal_id: "g-nutrition",
      title: "Eat 2700 a day",
      kind: "nutrition",
      daily_calories: 2700,
    });
    expect(res.status).toBe(200);
    const schedule = await get(app.schedule);
    const budget = dayOf(schedule.body.days, today).budget;
    expect(budget.target).toBe(2700);
    expect(budget.week_target).toBe(18900);
    expect(schedule.body.days.flatMap((d: any) => d.nutrition_proposals ?? [])).toHaveLength(0);
  });

  it("hostile: a garbage nutrition block is dropped, and the meal counts as unknown", async () => {
    const junk = await post(
      app.recipes,
      recipeBody("Mystery Meal", "https://example.com/mystery", {
        calories: "lots of them",
        protein_g: -5,
        per_serving: true,
        confidence: "high",
        __proto__: { polluted: true },
      })
    );
    expect(junk.status).toBe(200); // bad nutrition never kills a good recipe
    expect(({} as any).polluted).toBeUndefined();

    const before = dayOf((await get(app.schedule)).body.days, today).budget;
    await post(app.cook, { library_id: junk.body.library_id });
    const after = dayOf((await get(app.schedule)).body.days, today).budget;
    expect(after.unknown_meals).toBe(before.unknown_meals + 1);
    expect(after.week_consumed).toBe(before.week_consumed);
  });

  it("hostile: a nutrition goal without a real daily target is refused", async () => {
    for (const daily_calories of [undefined, -100, 0, "2000", Infinity]) {
      const res = await post(app.goals, {
        title: "Bad goal",
        kind: "nutrition",
        ...(daily_calories !== undefined ? { daily_calories } : {}),
      });
      expect(res.status).toBe(422);
    }
  });

  it("the budget lives on this week: next week's days carry their own clean slate", async () => {
    const nextMonday = addDays(weekStart, 7);
    const res = await post(app.schedule, {
      days: [
        {
          date: today,
          slots: [
            { lane: "meal", title: "Weeknight Chili", library_id: chiliId },
            { lane: "meal", title: "Leftovers night", slot_id: skipSlotId },
          ],
        },
        { date: nextMonday, slots: [{ lane: "meal", title: "Weeknight Chili", library_id: chiliId }] },
      ],
    });
    expect(res.status).toBe(200);
    const nextWeekBudget = dayOf(res.body.days, nextMonday).budget;
    expect(nextWeekBudget.week_consumed).toBe(0);
    expect(nextWeekBudget.consumed).toBe(0);
  });
});
