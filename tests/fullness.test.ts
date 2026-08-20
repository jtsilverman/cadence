import { describe, it, expect } from "vitest";
import { cooksLeft } from "@/lib/fullness";
import {
  RECIPE_COOKED,
  type EventEnvelope,
  type RecipeCookedPayload,
} from "@/lib/contracts";
import type { PantryItem } from "@/lib/pantry";

function cooked(
  id: string,
  ingredients: RecipeCookedPayload["ingredients"]
): EventEnvelope<RecipeCookedPayload> {
  return {
    event_id: id,
    household_id: "hh-jake",
    type: RECIPE_COOKED,
    ts: `2026-07-2${id.length}T10:00:00Z`,
    source: "web",
    payload: { library_id: "lib-1", title: "Dinner", ingredients },
    schema_version: 1,
    precision: "estimated",
  };
}

function item(name: string, qty: number | null, unit: string | null): PantryItem {
  return { name, qty, unit, precision: "exact", asserted_at: "2026-07-25T00:00:00Z" };
}

describe("cooksLeft (criterion 5: fullness from the cook diary)", () => {
  it("qty ÷ average per-cook usage: 12 eggs, cooks of 3 and 5 → 3 cooks left", () => {
    const n = cooksLeft(
      [item("eggs", 12, "count")],
      [
        cooked("e1", [{ name: "eggs", qty: 3, unit: "count" }]),
        cooked("e2", [{ name: "Eggs", qty: 5, unit: "count" }]),
      ]
    );
    expect(n).toEqual({ eggs: 3 });
  });

  it("rounds to halves: 10 ÷ 3 → 3.5", () => {
    const n = cooksLeft(
      [item("rice", 10, "cup")],
      [cooked("e1", [{ name: "rice", qty: 3, unit: "cup" }])]
    );
    expect(n).toEqual({ rice: 3.5 });
  });

  it("converts cook units into the item's dimension, excludes incompatible cooks", () => {
    // 8 oz = 0.5 lb counts; 2 cups is cross-dimension and is excluded
    const n = cooksLeft(
      [item("ground beef", 1, "lb")],
      [
        cooked("e1", [{ name: "ground beef", qty: 8, unit: "oz" }]),
        cooked("e2", [{ name: "ground beef", qty: 2, unit: "cup" }]),
      ]
    );
    expect(n).toEqual({ "ground beef": 2 });
  });

  it("omits items with no cook history, unknown qty, or only incompatible cooks", () => {
    const n = cooksLeft(
      [
        item("saffron", 2, "g"),
        item("flour", null, "cup"),
        item("milk", 1, "l"),
      ],
      [
        cooked("e1", [{ name: "flour", qty: 1, unit: "cup" }]),
        cooked("e2", [{ name: "milk", qty: 100, unit: "g" }]),
      ]
    );
    expect(n).toEqual({});
  });

  it("excludes null-qty cook lines from the average", () => {
    const n = cooksLeft(
      [item("eggs", 12, "count")],
      [
        cooked("e1", [{ name: "eggs", qty: null, unit: "count" }]),
        cooked("e2", [{ name: "eggs", qty: 4, unit: "count" }]),
      ]
    );
    expect(n).toEqual({ eggs: 3 });
  });

  it("never divides by zero: all-zero cook amounts yield no entry", () => {
    const n = cooksLeft(
      [item("salt", 100, "g")],
      [cooked("e1", [{ name: "salt", qty: 0, unit: "g" }])]
    );
    expect(n).toEqual({});
  });

  it("ignores non-cook events entirely", () => {
    const inflow: EventEnvelope = {
      event_id: "e9",
      household_id: "hh-jake",
      type: "PantryInflow",
      ts: "2026-07-25T10:00:00Z",
      source: "web",
      payload: { items: [{ name: "eggs", qty: 6, unit: "count" }], via: "delivery" },
      schema_version: 1,
      precision: "exact",
    };
    expect(cooksLeft([item("eggs", 12, "count")], [inflow])).toEqual({});
  });
});
