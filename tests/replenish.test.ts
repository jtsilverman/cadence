import { describe, it, expect, beforeEach } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { migrate } from "@/lib/db";
import { readEvents } from "@/lib/events";
import { medianRunGapDays, suggestAdditions } from "@/lib/replenish";
import { logSuggestions } from "@/lib/suggestions";
import type { CartLine } from "@/lib/cart";
import type { PantryItem } from "@/lib/pantry";
import {
  PANTRY_INFLOW,
  RECIPE_COOKED,
  SUGGESTION_MADE,
  SUGGESTION_RESOLVED,
  type EventEnvelope,
  type RecipePlan,
  type AddToListSuggestion,
} from "@/lib/contracts";

// Builders — minimal envelopes, distinct days carried in ts.
let seq = 0;
function ev(type: string, ts: string, payload: unknown): EventEnvelope {
  return {
    event_id: `e${++seq}`,
    household_id: "hh-jake",
    type,
    ts,
    source: "web",
    payload,
    schema_version: 1,
    precision: "estimated",
  };
}

const inflow = (ts: string, items: Array<[string, number | null, string | null]>) =>
  ev(PANTRY_INFLOW, ts, {
    items: items.map(([name, qty, unit]) => ({ name, qty, unit })),
    via: "checkoff",
  });

const cooked = (ts: string, items: Array<[string, number | null, string | null]>) =>
  ev(RECIPE_COOKED, ts, {
    library_id: "lib-1",
    title: "Dinner",
    ingredients: items.map(([name, qty, unit]) => ({ name, qty, unit })),
  });

const dismissed = (ts: string, name: string) =>
  ev(SUGGESTION_RESOLVED, ts, { suggestion_id: "s1", name, outcome: "dismissed" });

function item(name: string, qty: number | null, unit: string | null): PantryItem {
  return { name, qty, unit, precision: "estimated", asserted_at: "2026-07-01T00:00:00Z" };
}

function plan(title: string, ingredients: Array<[string, number | null, string | null]>): RecipePlan {
  return {
    plan_version: 1,
    kind: "recipe",
    title,
    servings: 4,
    total_minutes: 30,
    ingredients: ingredients.map(([name, qty, unit]) => ({
      name,
      qty,
      unit,
      confidence: "high",
    })),
    steps: ["Cook."],
    source_url: `https://example.com/${title}`,
    confidence: { title: "high", servings: "high", total_minutes: "high" },
  };
}

const line = (name: string, qty: number | null, unit: string | null): CartLine => ({
  name,
  qty,
  unit,
  sources: ["A"],
});

// Three store runs on the 1st, 8th, 16th: gaps 7 and 8 days → median 7.5.
const THREE_RUNS = [
  inflow("2026-07-01T10:00:00Z", [["eggs", 12, "count"]]),
  inflow("2026-07-08T10:00:00Z", [["eggs", 12, "count"]]),
  inflow("2026-07-16T10:00:00Z", [["eggs", 12, "count"]]),
];

describe("medianRunGapDays", () => {
  it("median of day-gaps between distinct inflow days (7, 8 → 7.5)", () => {
    expect(medianRunGapDays(THREE_RUNS)).toBe(7.5);
  });

  it("same-day inflows collapse into one run day (old per-check logs must not poison cadence)", () => {
    const events = [
      inflow("2026-07-01T10:00:00Z", [["eggs", 1, "count"]]),
      inflow("2026-07-01T10:01:00Z", [["milk", 1, "l"]]),
      inflow("2026-07-01T10:02:00Z", [["rice", 1, "cup"]]),
      inflow("2026-07-08T10:00:00Z", [["eggs", 1, "count"]]),
    ];
    expect(medianRunGapDays(events)).toBe(7);
  });

  it("fewer than 2 run days → null, never a guessed cadence", () => {
    expect(medianRunGapDays([])).toBeNull();
    expect(medianRunGapDays([THREE_RUNS[0]])).toBeNull();
  });
});

describe("suggestAdditions", () => {
  it("suggests a topped-up item when the picked week needs more than the pantry holds", () => {
    // chili uses 2 lb beef, pantry has 0.8 lb, beef not on toBuy (name-presence diff)
    const out = suggestAdditions({
      pantry: [item("ground beef", 0.8, "lb")],
      plans: [plan("Chili", [["ground beef", 2, "lb"]])],
      toBuy: [],
      events: THREE_RUNS,
    });
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("ground beef");
    expect(out[0].unit).toBe("lb");
    expect(out[0].qty).toBeCloseTo(1.2, 2); // shortfall: no inflow history for beef
    expect(out[0].reason).toMatch(/2 lb/);
    expect(out[0].reason).toMatch(/0\.8/);
  });

  it("suggested qty prefers the median past purchase amount over the raw shortfall", () => {
    const events = [
      ...THREE_RUNS, // eggs bought 12 at a time, three times
      cooked("2026-07-10T10:00:00Z", [["eggs", 3, "count"]]),
    ];
    const out = suggestAdditions({
      pantry: [item("eggs", 2, "count")],
      plans: [plan("Frittata", [["eggs", 6, "count"]])],
      toBuy: [],
      events,
    });
    expect(out).toHaveLength(1);
    expect(out[0].qty).toBe(12); // median purchase, not the 4-egg shortfall
  });

  it("suggests an almost-out staple from cook history even when this week's plan skips it", () => {
    const events = [
      ...THREE_RUNS,
      cooked("2026-07-05T10:00:00Z", [["olive oil", 2, "tbsp"]]),
      cooked("2026-07-11T10:00:00Z", [["olive oil", 2, "tbsp"]]),
    ];
    const out = suggestAdditions({
      pantry: [item("olive oil", 1, "tbsp")], // cooksLeft = 0.5 → almost out
      plans: [plan("Toast", [["bread", 1, null]])],
      toBuy: [line("bread", 1, null)],
      events,
    });
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("olive oil");
    expect(out[0].reason).toMatch(/history/i);
  });

  it("never suggests a name already on the list, and never with <2 run days (cold start)", () => {
    const shortBeef = {
      pantry: [item("ground beef", 0.8, "lb")],
      plans: [plan("Chili", [["ground beef", 2, "lb"]])],
    };
    // name already on toBuy
    expect(
      suggestAdditions({ ...shortBeef, toBuy: [line("ground beef", 2, "lb")], events: THREE_RUNS })
    ).toEqual([]);
    // cold start: one run day only
    expect(
      suggestAdditions({ ...shortBeef, toBuy: [], events: [THREE_RUNS[0]] })
    ).toEqual([]);
  });

  it("a dismissal after the last run silences the item; a dismissal before it does not", () => {
    const shortBeef = {
      pantry: [item("ground beef", 0.8, "lb")],
      plans: [plan("Chili", [["ground beef", 2, "lb"]])],
      toBuy: [],
    };
    // dismissed after the 07-16 run → silent
    expect(
      suggestAdditions({
        ...shortBeef,
        events: [...THREE_RUNS, dismissed("2026-07-17T09:00:00Z", "ground beef")],
      })
    ).toEqual([]);
    // dismissed before the 07-16 run → the world changed, suggest again
    expect(
      suggestAdditions({
        ...shortBeef,
        events: [...THREE_RUNS, dismissed("2026-07-10T09:00:00Z", "ground beef")],
      })
    ).toHaveLength(1);
  });

  it("cross-dimension plan amounts are excluded, never guessed (no suggestion)", () => {
    const out = suggestAdditions({
      pantry: [item("flour", 2, "cup")],
      plans: [plan("Bread", [["flour", 500, "g"]])], // mass vs volume: no density math
      toBuy: [],
      events: THREE_RUNS,
    });
    expect(out).toEqual([]);
  });
});

describe("logSuggestions (proposal log: reuse only while the payload still matches)", () => {
  let db: Client;
  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });

  const HH = "hh-jake";
  const oil = (qty: number | null, reason: string) => ({
    kind: "add_to_list" as const,
    name: "olive oil",
    qty,
    unit: "tbsp" as string | null,
    reason,
  });

  it("identical recomputation reuses the open suggestion_id, no new event", async () => {
    const [first] = await logSuggestions(db, HH, [oil(8, "almost out")]);
    const [second] = await logSuggestions(db, HH, [oil(8, "almost out")]);
    expect(second.suggestion_id).toBe(first.suggestion_id);
    expect(await readEvents(db, HH, { type: SUGGESTION_MADE })).toHaveLength(1);
  });

  it("a drifted qty/reason logs a NEW proposal — resolutions never pair against stale data", async () => {
    const [first] = await logSuggestions(db, HH, [oil(null, "almost out")]);
    const [second] = await logSuggestions(db, HH, [oil(8, "almost out")]);
    expect(second.suggestion_id).not.toBe(first.suggestion_id);
    const made = await readEvents(db, HH, { type: SUGGESTION_MADE });
    expect(made).toHaveLength(2);
    expect((made[1].payload as AddToListSuggestion).qty).toBe(8);
  });
});
