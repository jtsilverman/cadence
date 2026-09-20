import { describe, it, expect } from "vitest";
import {
  acceptedListAdditions,
  aggregateIngredients,
  diffAgainstPantry,
  mergeCartLines,
  parseLineItems,
} from "@/lib/cart";
import type { EventEnvelope, RecipePlan } from "@/lib/contracts";
import type { PantryItem } from "@/lib/pantry";

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

function pantryItem(name: string, qty: number | null = null, unit: string | null = null): PantryItem {
  return {
    name,
    qty,
    unit,
    precision: "exact",
    asserted_at: "2026-07-25T00:00:00Z",
  };
}

describe("aggregateIngredients", () => {
  it("sums qtys for the same name + unit across recipes and tracks sources", () => {
    const list = aggregateIngredients([
      plan("Chili", [["Olive Oil", 2, "tbsp"], ["onion", 1, null]]),
      plan("Pasta", [["olive oil", 1, "tbsp"]]),
    ]);
    expect(list).toEqual([
      { name: "olive oil", qty: 3, unit: "tbsp", sources: ["Chili", "Pasta"] },
      { name: "onion", qty: 1, unit: null, sources: ["Chili"] },
    ]);
  });

  it("keeps different DIMENSIONS for the same name as separate lines (dumb-concat)", () => {
    const list = aggregateIngredients([
      plan("A", [["flour", 2, "cup"]]),
      plan("B", [["flour", 100, "g"]]),
    ]);
    expect(list).toEqual([
      { name: "flour", qty: 2, unit: "cup", sources: ["A"] },
      { name: "flour", qty: 100, unit: "g", sources: ["B"] },
    ]);
  });

  it("merges same-name lines of the same dimension into the first line's unit", () => {
    const list = aggregateIngredients([
      plan("Burgers", [["ground beef", 1, "lb"]]),
      plan("Chili", [["ground beef", 8, "oz"]]),
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].qty).toBeCloseTo(1.5, 2);
    expect(list[0].unit).toBe("lb");
    expect(list[0].sources).toEqual(["Burgers", "Chili"]);
  });

  it("merges alias-spelled units as one line (cups + cup)", () => {
    const list = aggregateIngredients([
      plan("A", [["milk", 1, "cups"]]),
      plan("B", [["milk", 1, "cup"]]),
    ]);
    expect(list).toHaveLength(1);
    expect(list[0].qty).toBe(2);
  });

  it("a null qty in a same-dimension merge poisons the sum, keeps first line's unit", () => {
    const list = aggregateIngredients([
      plan("A", [["butter", null, "tbsp"]]),
      plan("B", [["butter", 2, "tsp"]]),
    ]);
    expect(list).toEqual([
      { name: "butter", qty: null, unit: "tbsp", sources: ["A", "B"] },
    ]);
  });

  it("a null qty poisons the sum to null (never invents a number)", () => {
    const list = aggregateIngredients([
      plan("A", [["salt", null, null]]),
      plan("B", [["salt", 1, null]]),
    ]);
    expect(list).toEqual([{ name: "salt", qty: null, unit: null, sources: ["A", "B"] }]);
  });

  it("merges duplicates within a single recipe and normalizes blank unit to null", () => {
    const list = aggregateIngredients([
      plan("A", [["egg", 2, ""], [" Egg ", 1, null]]),
    ]);
    expect(list).toEqual([{ name: "egg", qty: 3, unit: null, sources: ["A"] }]);
  });

  it("is order-invariant across input recipes (same lines, sorted by name then unit)", () => {
    const a = plan("A", [["beans", 1, "can"], ["rice", 2, "cup"]]);
    const b = plan("B", [["rice", 1, "cup"], ["beans", 2, "can"]]);
    const one = aggregateIngredients([a, b]);
    const two = aggregateIngredients([b, a]);
    expect(one.map(({ sources, ...rest }) => rest)).toEqual(
      two.map(({ sources, ...rest }) => rest)
    );
    expect(one.map((l) => [l.name, l.qty])).toEqual([
      ["beans", 3],
      ["rice", 3],
    ]);
  });

  it("returns empty for no recipes", () => {
    expect(aggregateIngredients([])).toEqual([]);
  });
});

describe("parseLineItems (untrusted API bodies -> LineItem[])", () => {
  it("accepts valid lines and normalizes blank unit to null", () => {
    expect(
      parseLineItems([
        { name: " Eggs ", qty: 12, unit: "count" },
        { name: "salt", qty: null, unit: "" },
      ])
    ).toEqual({
      ok: true,
      items: [
        { name: "Eggs", qty: 12, unit: "count" },
        { name: "salt", qty: null, unit: null },
      ],
    });
  });

  it("rejects non-arrays, empty arrays, blank names, and bad qty types", () => {
    expect(parseLineItems("nope").ok).toBe(false);
    expect(parseLineItems([]).ok).toBe(false);
    expect(parseLineItems([{ name: " ", qty: 1, unit: null }]).ok).toBe(false);
    for (const qty of [NaN, Infinity, -1, "3", true]) {
      expect(parseLineItems([{ name: "eggs", qty, unit: null }]).ok, String(qty)).toBe(false);
    }
  });
});

describe("diffAgainstPantry (quantity-aware: buy = needed − on-hand, spec schedule-spine c5)", () => {
  it("subtracts convertible on-hand: need 2 lb, have 8 oz → buy 1.5 lb", () => {
    const lines = aggregateIngredients([plan("Chili", [["ground beef", 2, "lb"]])]);
    const { toBuy, stocked } = diffAgainstPantry(lines, [pantryItem("ground beef", 8, "oz")]);
    expect(toBuy).toHaveLength(1);
    expect(toBuy[0].qty).toBeCloseTo(1.5, 2);
    expect(toBuy[0].unit).toBe("lb");
    expect(toBuy[0].have_some).toBeUndefined();
    expect(stocked).toEqual([]);
  });

  it("fully covered lines move to stocked (need 2 cups, have 1 l)", () => {
    const lines = aggregateIngredients([plan("A", [["milk", 2, "cup"]])]);
    const { toBuy, stocked } = diffAgainstPantry(lines, [pantryItem("milk", 1, "l")]);
    expect(toBuy).toEqual([]);
    expect(stocked).toHaveLength(1);
    expect(stocked[0].name).toBe("milk");
  });

  it("cross-dimension coverage stays on toBuy at full need, flagged have_some", () => {
    const lines = aggregateIngredients([plan("Bread", [["flour", 2, "cup"]])]);
    const { toBuy, stocked } = diffAgainstPantry(lines, [pantryItem("flour", 500, "g")]);
    expect(toBuy).toEqual([
      { name: "flour", qty: 2, unit: "cup", sources: ["Bread"], have_some: true },
    ]);
    expect(stocked).toEqual([]);
  });

  it("present-unknown pantry (qty null) flags have_some, keeps full need", () => {
    const lines = aggregateIngredients([plan("A", [["olive oil", 2, "tbsp"]])]);
    const { toBuy } = diffAgainstPantry(lines, [pantryItem("olive oil")]);
    expect(toBuy).toEqual([
      { name: "olive oil", qty: 2, unit: "tbsp", sources: ["A"], have_some: true },
    ]);
  });

  it("unknown need (line qty null) with any on-hand flags have_some", () => {
    const lines = aggregateIngredients([plan("A", [["salt", null, null]])]);
    const { toBuy } = diffAgainstPantry(lines, [pantryItem("salt", 100, "g")]);
    expect(toBuy).toEqual([
      { name: "salt", qty: null, unit: null, sources: ["A"], have_some: true },
    ]);
  });

  it("no pantry match passes through untouched; empty pantry buys everything", () => {
    const lines = aggregateIngredients([plan("A", [["rice", 1, "cup"]])]);
    const { toBuy, stocked } = diffAgainstPantry(lines, []);
    expect(toBuy).toEqual([{ name: "rice", qty: 1, unit: "cup", sources: ["A"] }]);
    expect(stocked).toEqual([]);
  });
});

describe("accepted user grocery additions", () => {
  const event = (id: string, type: string, minute: number, payload: unknown): EventEnvelope => ({
    event_id: id,
    household_id: "hh-jake",
    type,
    ts: `2026-09-19T08:${String(minute).padStart(2, "0")}:00Z`,
    source: "chat",
    payload,
    schema_version: 1,
    precision: "exact",
  });

  const made = event("e1", "SuggestionMade", 1, {
    suggestion_id: "s1",
    kind: "add_to_list",
    name: "Paper towels",
    qty: 2,
    unit: "roll",
    reason: "you asked via chat",
  });
  const accepted = event("e2", "SuggestionResolved", 2, {
    suggestion_id: "s1",
    kind: "add_to_list",
    name: "Paper towels",
    outcome: "accepted",
  });

  it("projects an accepted chat addition as a durable cart line", () => {
    expect(acceptedListAdditions([accepted, made])).toEqual([
      { name: "paper towels", qty: 2, unit: "roll", sources: ["added by chat"] },
    ]);
  });

  it("removes the line after a later checkout buys it", () => {
    const order = event("e3", "OrderPlaced", 3, {
      rail: "instore",
      items: [{ name: "paper towels", qty: 2, unit: "roll" }],
    });
    expect(acceptedListAdditions([made, accepted, order])).toEqual([]);
  });

  it("merges a manual addition with a compatible recipe line", () => {
    expect(
      mergeCartLines([
        { name: "lime", qty: 1, unit: "lb", sources: ["Tacos"] },
        { name: "Lime", qty: 8, unit: "oz", sources: ["added by chat"] },
      ]),
    ).toEqual([{ name: "lime", qty: 1.5, unit: "lb", sources: ["Tacos", "added by chat"] }]);
  });
});
