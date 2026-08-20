import { describe, it, expect } from "vitest";
import { rebuildPantry } from "@/lib/pantry";
import {
  PANTRY_ASSERTED,
  PANTRY_INFLOW,
  RECIPE_COOKED,
  type EventEnvelope,
  type PantryAssertedPayload,
  type PantryInflowPayload,
  type RecipeCookedPayload,
} from "@/lib/contracts";

function pantryAsserted(
  id: string,
  ts: string,
  payload: PantryAssertedPayload
): EventEnvelope<PantryAssertedPayload> {
  return {
    event_id: id,
    household_id: "hh-jake",
    type: PANTRY_ASSERTED,
    ts,
    source: "web",
    payload,
    schema_version: 1,
    precision: "estimated",
  };
}

function pantryInflow(
  id: string,
  ts: string,
  payload: PantryInflowPayload,
  precision: EventEnvelope["precision"] = "exact"
): EventEnvelope<PantryInflowPayload> {
  return {
    event_id: id,
    household_id: "hh-jake",
    type: PANTRY_INFLOW,
    ts,
    source: "web",
    payload,
    schema_version: 1,
    precision,
  };
}

function recipeCooked(
  id: string,
  ts: string,
  ingredients: RecipeCookedPayload["ingredients"]
): EventEnvelope<RecipeCookedPayload> {
  return {
    event_id: id,
    household_id: "hh-jake",
    type: RECIPE_COOKED,
    ts,
    source: "web",
    payload: { library_id: "lib-1", title: "Chili", ingredients },
    schema_version: 1,
    precision: "estimated",
  };
}

describe("rebuildPantry", () => {
  it("folds PantryAsserted events into latest per-item state", () => {
    const events = [
      pantryAsserted("e1", "2026-07-20T10:00:00Z", {
        name: "olive oil",
        qty: 1,
        unit: "bottle",
      }),
      pantryAsserted("e2", "2026-07-21T10:00:00Z", {
        name: "eggs",
        qty: 12,
        unit: "count",
      }),
      // later assertion for the same item wins
      pantryAsserted("e3", "2026-07-22T10:00:00Z", {
        name: "eggs",
        qty: 6,
        unit: "count",
      }),
    ];

    const pantry = rebuildPantry(events);

    expect(pantry).toEqual([
      {
        name: "eggs",
        qty: 6,
        unit: "count",
        precision: "estimated",
        asserted_at: "2026-07-22T10:00:00Z",
      },
      {
        name: "olive oil",
        qty: 1,
        unit: "bottle",
        precision: "estimated",
        asserted_at: "2026-07-20T10:00:00Z",
      },
    ]);
  });

  it("drops an item once a later assertion removes it", () => {
    const events = [
      pantryAsserted("e1", "2026-07-20T10:00:00Z", {
        name: "milk",
        qty: 1,
        unit: "carton",
      }),
      pantryAsserted("e2", "2026-07-21T10:00:00Z", {
        name: "milk",
        qty: null,
        unit: null,
        removed: true,
      }),
    ];
    expect(rebuildPantry(events)).toEqual([]);
  });

  it("normalizes names so ' Milk ' and 'milk' are one item", () => {
    const events = [
      pantryAsserted("e1", "2026-07-20T10:00:00Z", {
        name: " Milk ",
        qty: 1,
        unit: "carton",
      }),
      pantryAsserted("e2", "2026-07-21T10:00:00Z", {
        name: "milk",
        qty: 2,
        unit: "carton",
      }),
    ];
    const pantry = rebuildPantry(events);
    expect(pantry).toHaveLength(1);
    expect(pantry[0].qty).toBe(2);
    expect(pantry[0].name).toBe("milk");
  });

  it("returns empty pantry for empty log", () => {
    expect(rebuildPantry([])).toEqual([]);
  });

  it("breaks same-ts ties by event_id regardless of array order", () => {
    const ev = (id: string, qty: number) =>
      pantryAsserted(id, "2026-07-20T10:00:00Z", {
        name: "eggs",
        qty,
        unit: "count",
      });
    expect(rebuildPantry([ev("e1", 1), ev("e2", 2)])[0].qty).toBe(2);
    expect(rebuildPantry([ev("e2", 2), ev("e1", 1)])[0].qty).toBe(2);
  });

  it("inflow creates an absent item and sums onto a same-unit numeric qty", () => {
    const pantry = rebuildPantry([
      pantryInflow("e1", "2026-07-20T10:00:00Z", {
        items: [{ name: "Eggs", qty: 12, unit: "count" }],
        via: "checkoff",
      }),
      pantryInflow("e2", "2026-07-21T10:00:00Z", {
        items: [{ name: "eggs", qty: 6, unit: "count" }],
        via: "delivery",
      }),
    ]);
    expect(pantry).toEqual([
      {
        name: "eggs",
        qty: 18,
        unit: "count",
        precision: "exact",
        asserted_at: "2026-07-21T10:00:00Z",
      },
    ]);
  });

  it("inflow in another unit of the same dimension converts and sums in the item's unit", () => {
    const pantry = rebuildPantry([
      pantryAsserted("e1", "2026-07-20T10:00:00Z", {
        name: "ground beef",
        qty: 1,
        unit: "lb",
      }),
      pantryInflow("e2", "2026-07-21T10:00:00Z", {
        items: [{ name: "ground beef", qty: 8, unit: "oz" }],
        via: "delivery",
      }),
    ]);
    expect(pantry).toHaveLength(1);
    expect(pantry[0].qty).toBeCloseTo(1.5, 2);
    expect(pantry[0].unit).toBe("lb");
  });

  it("cooking in another unit of the same dimension subtracts converted (1 lb − 100 g ≈ 0.78 lb)", () => {
    const pantry = rebuildPantry([
      pantryAsserted("e1", "2026-07-20T10:00:00Z", {
        name: "ground beef",
        qty: 1,
        unit: "lb",
      }),
      recipeCooked("e2", "2026-07-21T10:00:00Z", [
        { name: "ground beef", qty: 100, unit: "g" },
      ]),
    ]);
    expect(pantry).toHaveLength(1);
    expect(pantry[0].qty).toBeCloseTo(0.78, 2);
    expect(pantry[0].unit).toBe("lb");
  });

  it("cooking the converted equivalent of the full stock drops the item (16 oz from 1 lb)", () => {
    const pantry = rebuildPantry([
      pantryAsserted("e1", "2026-07-20T10:00:00Z", {
        name: "ground beef",
        qty: 1,
        unit: "lb",
      }),
      recipeCooked("e2", "2026-07-21T10:00:00Z", [
        { name: "ground beef", qty: 16, unit: "oz" },
      ]),
    ]);
    expect(pantry).toEqual([]);
  });

  it("unit aliases merge as the same unit (2 lbs + 1 pound = 3, item keeps its unit spelling)", () => {
    const pantry = rebuildPantry([
      pantryAsserted("e1", "2026-07-20T10:00:00Z", {
        name: "flour",
        qty: 2,
        unit: "lbs",
      }),
      pantryInflow("e2", "2026-07-21T10:00:00Z", {
        items: [{ name: "flour", qty: 1, unit: "pound" }],
        via: "delivery",
      }),
    ]);
    expect(pantry[0].qty).toBe(3);
    expect(pantry[0].unit).toBe("lbs");
  });

  it("conversion keeps the weaker-of-inputs precision rule, nothing extra (criterion 7)", () => {
    const pantry = rebuildPantry([
      pantryInflow(
        "e1",
        "2026-07-20T10:00:00Z",
        { items: [{ name: "beef", qty: 1, unit: "lb" }], via: "checkoff" },
        "exact"
      ),
      pantryInflow(
        "e2",
        "2026-07-21T10:00:00Z",
        { items: [{ name: "beef", qty: 8, unit: "oz" }], via: "checkoff" },
        "exact"
      ),
    ]);
    expect(pantry[0].precision).toBe("exact");
    expect(pantry[0].qty).toBeCloseTo(1.5, 2);
  });

  it("inflow with a unit mismatch or unknown qty degrades to present-unknown, never invents math", () => {
    const pantry = rebuildPantry([
      pantryAsserted("e1", "2026-07-20T10:00:00Z", {
        name: "flour",
        qty: 2,
        unit: "cup",
      }),
      pantryInflow("e2", "2026-07-21T10:00:00Z", {
        items: [{ name: "flour", qty: 500, unit: "g" }],
        via: "delivery",
      }),
    ]);
    expect(pantry).toEqual([
      {
        name: "flour",
        qty: null,
        unit: null,
        precision: "estimated",
        asserted_at: "2026-07-21T10:00:00Z",
      },
    ]);
  });

  it("inflow carries the weaker precision when merging", () => {
    const pantry = rebuildPantry([
      pantryAsserted("e1", "2026-07-20T10:00:00Z", {
        name: "rice",
        qty: 1,
        unit: "bag",
      }), // helper stamps precision "estimated"
      pantryInflow(
        "e2",
        "2026-07-21T10:00:00Z",
        { items: [{ name: "rice", qty: 2, unit: "bag" }], via: "checkoff" },
        "exact"
      ),
    ]);
    expect(pantry[0].qty).toBe(3);
    expect(pantry[0].precision).toBe("estimated");
  });

  it("a later assertion overrides accumulated inflows (user statement is truth)", () => {
    const pantry = rebuildPantry([
      pantryInflow("e1", "2026-07-20T10:00:00Z", {
        items: [{ name: "eggs", qty: 12, unit: "count" }],
        via: "delivery",
      }),
      pantryAsserted("e2", "2026-07-21T10:00:00Z", {
        name: "eggs",
        qty: 4,
        unit: "count",
      }),
    ]);
    expect(pantry[0].qty).toBe(4);
  });

  it("cooking subtracts same-unit numeric qtys and drops items that hit zero", () => {
    const pantry = rebuildPantry([
      pantryAsserted("e1", "2026-07-20T10:00:00Z", { name: "eggs", qty: 12, unit: "count" }),
      pantryAsserted("e2", "2026-07-20T10:01:00Z", { name: "butter", qty: 2, unit: "stick" }),
      recipeCooked("e3", "2026-07-21T10:00:00Z", [
        { name: "Eggs", qty: 3, unit: "count" },
        { name: "butter", qty: 2, unit: "stick" },
      ]),
    ]);
    expect(pantry).toEqual([
      {
        name: "eggs",
        qty: 9,
        unit: "count",
        precision: "estimated",
        asserted_at: "2026-07-21T10:00:00Z",
      },
    ]);
  });

  it("cooking an untracked ingredient is a no-op — never creates negative stock", () => {
    const pantry = rebuildPantry([
      recipeCooked("e1", "2026-07-21T10:00:00Z", [{ name: "saffron", qty: 1, unit: "g" }]),
    ]);
    expect(pantry).toEqual([]);
  });

  it("cooking with unit mismatch or unknown qty degrades the item to present-unknown", () => {
    const pantry = rebuildPantry([
      pantryAsserted("e1", "2026-07-20T10:00:00Z", { name: "flour", qty: 2, unit: "cup" }),
      recipeCooked("e2", "2026-07-21T10:00:00Z", [{ name: "flour", qty: 100, unit: "g" }]),
    ]);
    expect(pantry).toEqual([
      {
        name: "flour",
        qty: null,
        unit: null,
        precision: "estimated",
        asserted_at: "2026-07-21T10:00:00Z",
      },
    ]);
  });

  it("applies events by ts order regardless of array order", () => {
    const later = pantryAsserted("e2", "2026-07-22T10:00:00Z", {
      name: "rice",
      qty: 2,
      unit: "bag",
    });
    const earlier = pantryAsserted("e1", "2026-07-20T10:00:00Z", {
      name: "rice",
      qty: 5,
      unit: "bag",
    });
    const pantry = rebuildPantry([later, earlier]);
    expect(pantry[0].qty).toBe(2);
  });
});
