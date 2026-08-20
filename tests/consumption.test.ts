import { describe, expect, it } from "vitest";
import type { EventEnvelope } from "@/lib/contracts";
import { RECIPE_COOKED } from "@/lib/contracts";
import { weeklyUse } from "@/lib/consumption";

const HH = "hh-test";

let n = 0;
function cook(ts: string, ingredients: Array<[string, number | null, string | null]>): EventEnvelope {
  n += 1;
  return {
    event_id: `e${String(n).padStart(3, "0")}`,
    household_id: HH,
    type: RECIPE_COOKED,
    ts,
    source: "web",
    payload: {
      library_id: "lib1",
      title: "t",
      ingredients: ingredients.map(([name, qty, unit]) => ({ name, qty, unit })),
    },
    schema_version: 1,
    precision: "estimated",
  };
}

describe("weeklyUse", () => {
  it("sums converted quantities over the observed window (min 1 week)", () => {
    // two cooks 14 days apart → 2-week window; 1 lb + 8 oz = 1.5 lb → 0.75 lb/week
    const events = [
      cook("2026-07-05T22:00:00Z", [["Beef", 1, "lb"]]),
      cook("2026-07-19T22:00:00Z", [["beef", 8, "oz"]]),
    ];
    const rates = weeklyUse(events);
    expect(rates.get("beef")).toEqual({ qty: 0.75, unit: "lb" });
  });

  it("same-day cooks clamp to a 1-week window", () => {
    const events = [
      cook("2026-07-19T20:00:00Z", [["rice", 1, "cup"]]),
      cook("2026-07-19T22:00:00Z", [["rice", 1, "cup"]]),
    ];
    expect(weeklyUse(events).get("rice")).toEqual({ qty: 2, unit: "cup" });
  });

  it("fewer than 2 compatible cooks → no rate (cold-start honesty)", () => {
    expect(weeklyUse([cook("2026-07-19T22:00:00Z", [["rice", 1, "cup"]])]).size).toBe(0);
    // two cooks but incompatible units: no invented math, no rate
    const mixed = [
      cook("2026-07-05T22:00:00Z", [["flour", 2, "cup"]]),
      cook("2026-07-19T22:00:00Z", [["flour", 100, "g"]]),
    ];
    expect(weeklyUse(mixed).get("flour")).toBeUndefined();
  });

  it("null-qty cooks are excluded from the rate", () => {
    const events = [
      cook("2026-07-05T22:00:00Z", [["beef", 1, "lb"]]),
      cook("2026-07-12T22:00:00Z", [["beef", null, null]]),
      cook("2026-07-19T22:00:00Z", [["beef", 1, "lb"]]),
    ];
    // 2 compatible cooks, 2-week window → 1 lb/week
    expect(weeklyUse(events).get("beef")).toEqual({ qty: 1, unit: "lb" });
  });

  it("is caller-order-independent (first-seen unit follows fold order)", () => {
    const a = cook("2026-07-05T22:00:00Z", [["beef", 16, "oz"]]);
    const b = cook("2026-07-19T22:00:00Z", [["beef", 1, "lb"]]);
    expect(weeklyUse([a, b])).toEqual(weeklyUse([b, a]));
    expect(weeklyUse([b, a]).get("beef")?.unit).toBe("oz");
  });
});
