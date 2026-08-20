// The budget fold (spec nutrition AC5): cooked-meal macros → per-day and
// per-week budget numbers. Pure, event-sourced, unknowns surfaced never zeroed.

import { describe, expect, it } from "vitest";
import type { EventEnvelope, RecipeCookedPayload, RecipeNutrition } from "@/lib/contracts";
import { RECIPE_COOKED } from "@/lib/contracts";
import { cookedByDate, weekBudget } from "@/lib/nutrition";

const nut = (calories: number): RecipeNutrition => ({
  calories,
  protein_g: 10,
  carbs_g: 10,
  fat_g: 10,
  per_serving: true,
  confidence: "high",
});

let seq = 0;
// noon ET → localDate lands on the same calendar date
const cooked = (dateISO: string, nutrition?: RecipeNutrition): EventEnvelope => ({
  event_id: `ev-${++seq}`,
  household_id: "hh-test",
  type: RECIPE_COOKED,
  ts: `${dateISO}T16:00:00.000Z`,
  source: "web",
  payload: {
    library_id: `lib-${seq}`,
    title: "Meal",
    ingredients: [],
    ...(nutrition ? { nutrition } : {}),
  } satisfies RecipeCookedPayload,
  schema_version: 1,
  precision: "estimated",
});

describe("cookedByDate", () => {
  it("sums calories per local date and counts meals with no macros", () => {
    const diary = [
      cooked("2026-07-20", nut(600)),
      cooked("2026-07-20", nut(400)),
      cooked("2026-07-20"), // macro-less
      cooked("2026-07-22", nut(800)),
    ];
    const byDate = cookedByDate(diary);
    expect(byDate.get("2026-07-20")).toEqual({ calories: 1000, unknown: 1 });
    expect(byDate.get("2026-07-22")).toEqual({ calories: 800, unknown: 0 });
    expect(byDate.get("2026-07-21")).toBeUndefined();
  });

  it("ignores every non-cook event", () => {
    const stray: EventEnvelope = {
      ...cooked("2026-07-20", nut(9999)),
      type: "SessionLogged",
    };
    expect(cookedByDate([stray]).size).toBe(0);
  });
});

describe("weekBudget", () => {
  it("scopes to the Monday-start week containing the given date", () => {
    const diary = [
      cooked("2026-07-19", nut(500)), // Sunday — prior week
      cooked("2026-07-20", nut(600)), // Monday
      cooked("2026-07-26", nut(700)), // Sunday — same week
      cooked("2026-07-27", nut(800)), // next Monday
      cooked("2026-07-21"), // unknown, in week
    ];
    const budget = weekBudget(cookedByDate(diary), "2026-07-22", 2000);
    expect(budget).toEqual({
      week_start: "2026-07-20",
      week_consumed: 1300,
      week_target: 14000,
      unknown_meals: 1,
    });
  });

  it("property: week_consumed equals an independent filter-and-sum over any diary", () => {
    // seeded LCG so the run is deterministic without Math.random
    let state = 42;
    const rand = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let trial = 0; trial < 30; trial++) {
      const entries: Array<{ date: string; cal: number | null }> = [];
      const events: EventEnvelope[] = [];
      const count = 1 + Math.floor(rand() * 12);
      for (let i = 0; i < count; i++) {
        const day = 13 + Math.floor(rand() * 21); // 2026-07-13 .. 2026-08-02
        const date =
          day <= 31 ? `2026-07-${String(day).padStart(2, "0")}` : `2026-08-0${day - 31}`;
        const cal = rand() < 0.25 ? null : Math.floor(rand() * 1200);
        entries.push({ date, cal });
        events.push(cooked(date, cal === null ? undefined : nut(cal)));
      }
      const budget = weekBudget(cookedByDate(events), "2026-07-22", 1800);
      const inWeek = entries.filter((e) => e.date >= "2026-07-20" && e.date <= "2026-07-26");
      const expected = inWeek.reduce((sum, e) => sum + (e.cal ?? 0), 0);
      expect(budget.week_consumed).toBe(expected);
      expect(budget.unknown_meals).toBe(inWeek.filter((e) => e.cal === null).length);
    }
  });
});

describe("computeNutritionAdjust", () => {
  it("per_day_cap stays positive even for an absurdly small daily target", async () => {
    const { computeNutritionAdjust } = await import("@/lib/nutrition");
    const diary = [cooked("2026-07-27", nut(500))];
    const proposal = computeNutritionAdjust(cookedByDate(diary), "2026-07-27", 1);
    expect(proposal).not.toBeNull();
    expect(proposal!.per_day_cap).toBeGreaterThanOrEqual(1);
  });
});
