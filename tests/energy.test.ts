import { describe, expect, it } from "vitest";
import type { EventEnvelope } from "@/lib/contracts";
import { EXERTION_LOGGED, SESSION_LOGGED } from "@/lib/contracts";
import { activeCaloriesByDate, adjustedDailyTarget } from "@/lib/energy";
import { decorateBudgets, weekBudget } from "@/lib/nutrition";
import type { DayState } from "@/lib/schedule";

let n = 0;
function event(type: string, ts: string, payload: object, source = "garmin"): EventEnvelope {
  n += 1;
  return {
    event_id: `e${n}`,
    household_id: "hh-test",
    type,
    ts,
    source,
    payload,
    schema_version: 1,
    precision: "exact",
  };
}

const monday: DayState = { date: "2026-07-20", slots: [] };

describe("adjustedDailyTarget", () => {
  it("adds measured activity, ignores noise, and caps at half the stated target", () => {
    expect(adjustedDailyTarget(2000, undefined)).toBe(2000);
    expect(adjustedDailyTarget(2000, 40)).toBe(2000);
    expect(adjustedDailyTarget(2000, 640)).toBe(2640);
    expect(adjustedDailyTarget(2000, 5000)).toBe(3000);
  });
});

describe("activeCaloriesByDate", () => {
  it("prefers the day summary over summing that day's workouts", () => {
    const events = [
      event(EXERTION_LOGGED, "2026-07-20T23:00:00.000Z", {
        date: "2026-07-20",
        active_calories: 400,
        external_id: "garmin:exertion:2026-07-20",
      }),
      event(SESSION_LOGGED, "2026-07-20T16:00:00.000Z", {
        title: "Run",
        kind: "loose",
        calories: 900,
        external_id: "garmin:activity:1",
      }),
    ];
    expect(activeCaloriesByDate(events).get("2026-07-20")).toBe(400);
  });

  it("sums workout calories only when the day has no active_calories figure", () => {
    const events = [
      event(
        EXERTION_LOGGED,
        "2026-07-20T23:00:00.000Z",
        { date: "2026-07-20", strain: 12, kilojoule: 8000, external_id: "whoop:cycle:1" },
        "whoop"
      ),
      event(
        SESSION_LOGGED,
        "2026-07-20T16:00:00.000Z",
        { title: "Run", kind: "loose", calories: 320, external_id: "whoop:workout:1" },
        "whoop"
      ),
      event(
        SESSION_LOGGED,
        "2026-07-20T18:00:00.000Z",
        { title: "Walk", kind: "loose", calories: 80, external_id: "whoop:workout:2" },
        "whoop"
      ),
    ];
    expect(activeCaloriesByDate(events).get("2026-07-20")).toBe(400);
  });
});

describe("budget decoration", () => {
  it("raises that day's target and the week envelope, and names the addition", () => {
    const active = new Map([["2026-07-20", 640]]);
    const [day] = decorateBudgets([monday], new Map(), 2000, active);
    expect(day.budget).toEqual({
      consumed: 0,
      target: 2640,
      week_consumed: 0,
      week_target: 14640,
      unknown_meals: 0,
      base_target: 2000,
      active_calories: 640,
    });
  });

  it("leaves the plain budget shape alone when nothing was measured", () => {
    const [day] = decorateBudgets([monday], new Map(), 2000, new Map());
    expect(day.budget).toEqual({
      consumed: 0,
      target: 2000,
      week_consumed: 0,
      week_target: 14000,
      unknown_meals: 0,
    });
    expect(weekBudget(new Map(), "2026-07-22", 2000).week_target).toBe(14000);
  });
});
