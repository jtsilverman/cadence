// J3 — "The food loop: save a recipe, plan it, the list knows what I need,
// I shop, I cook, the pantry follows reality." Quantities are hand-computed
// from the story, never from the code.

import { describe, it, expect, beforeAll } from "vitest";
import { loadApp, type App, get, post, todayLocal, addDays, mondayOf } from "./harness";

let app: App;
let chiliId: string;
const today = todayLocal();
// keep both meal slots inside the CURRENT Monday week regardless of weekday:
// today and today unless today is Sunday (then today twice is still in-week)
const secondMealDay = mondayOf(today) === today ? addDays(today, 1) : today;

const CHILI = {
  source_url: "https://example.com/weeknight-chili",
  title: "Weeknight Chili",
  servings: 4,
  total_minutes: 45,
  ingredients: [
    { name: "beef", qty: 2, unit: "lb", confidence: "high" },
    { name: "rice", qty: 2, unit: "cup", confidence: "high" },
    { name: "beans", qty: 1, unit: "can", confidence: "high" },
  ],
  steps: ["Brown the beef.", "Simmer everything."],
  confidence: { title: "high", servings: "high", total_minutes: "high" },
};

const pantryQty = (items: any[], name: string) =>
  items.find((i: any) => i.name === name)?.qty;

beforeAll(async () => {
  app = await loadApp();
  const saved = await post(app.recipes, CHILI);
  chiliId = saved.body.library_id;
});

describe("J3: recipe → plan → list → shop → cook → pantry", () => {
  it("a saved recipe lands in the cookbook", async () => {
    expect(chiliId).toBeTruthy();
    const list = await get(app.recipes);
    expect(list.body.recipes.map((r: any) => r.title)).toContain("Weeknight Chili");
  });

  it("planning it twice this week makes the list want two cooks' worth, net of pantry", async () => {
    await post(app.schedule, {
      days: [
        { date: today, slots: [{ lane: "meal", title: "Chili", library_id: chiliId }] },
        { date: secondMealDay, slots: [{ lane: "meal", title: "Chili again", library_id: chiliId }] },
      ],
    });
    await post(app.pantry, { name: "beef", qty: 0.5, unit: "lb" }); // already have some

    const cart = await post(app.cart, {});
    expect(cart.status).toBe(200);
    const toBuy = cart.body.toBuy;
    // hand-computed: 2 cooks × 2lb − 0.5lb on hand = 3.5
    expect(toBuy.find((l: any) => l.name === "beef")).toMatchObject({ qty: 3.5, unit: "lb" });
    expect(toBuy.find((l: any) => l.name === "rice")).toMatchObject({ qty: 4, unit: "cup" });
    expect(toBuy.find((l: any) => l.name === "beans")).toMatchObject({ qty: 2, unit: "can" });
  });

  it("an in-store run checked off puts exactly the purchased amounts in the pantry", async () => {
    const cart = await post(app.cart, {});
    const order = await post(app.order, { rail: "instore", items: cart.body.toBuy });
    expect(order.status).toBe(200);
    expect(order.body.order_event_id).toBeTruthy();

    const inflow = await post(app.pantryInflow, {
      via: "checkoff",
      items: cart.body.toBuy,
      order_event_id: order.body.order_event_id,
    });
    expect(inflow.status).toBe(200);
    expect(pantryQty(inflow.body.items, "beef")).toBe(4); // 0.5 held + 3.5 bought
    expect(pantryQty(inflow.body.items, "rice")).toBe(4);
    expect(pantryQty(inflow.body.items, "beans")).toBe(2);
  });

  it("cooking decrements the pantry by the recipe amounts and marks the slot done", async () => {
    const res = await post(app.cook, { library_id: chiliId });
    expect(res.status).toBe(200);

    const pantry = await get(app.pantry);
    expect(pantryQty(pantry.body.items, "beef")).toBe(2); // 4 − 2
    expect(pantryQty(pantry.body.items, "rice")).toBe(2);
    expect(pantryQty(pantry.body.items, "beans")).toBe(1);

    const sched = await get(app.schedule);
    const statuses = sched.body.days
      .flatMap((d: any) => d.slots)
      .filter((s: any) => s.library_id === chiliId)
      .map((s: any) => s.status)
      .sort();
    expect(statuses).toEqual(["done", "planned"]); // one cook marks one slot
  });

  it("the rebuilt list knows the pantry now covers the remaining cook", async () => {
    const cart = await post(app.cart, {});
    if (cart.status === 200) {
      const names = (cart.body.toBuy ?? []).map((l: any) => l.name);
      expect(names).not.toContain("beef"); // 2 needed, 2 held
      expect(names).not.toContain("rice");
      expect(names).not.toContain("beans");
    } else {
      // equally honest: "nothing left to buy for"
      expect(cart.status).toBe(404);
      expect(String(cart.body.reason)).toMatch(/cooked|nothing|stocked/i);
    }
  });

  it("cooking beyond what the pantry holds never shows negative amounts", async () => {
    await post(app.cook, { library_id: chiliId }); // pantry hits zero
    await post(app.cook, { library_id: chiliId }); // spontaneous third cook, pantry is empty
    const pantry = await get(app.pantry);
    for (const item of pantry.body.items) {
      expect(item.qty === null || item.qty >= 0, `${item.name} qty=${item.qty}`).toBe(true);
    }
  });

  it("cooking something that isn't in the cookbook is a 404, not a phantom event", async () => {
    const res = await post(app.cook, { library_id: "lib-never-existed" });
    expect(res.status).toBe(404);
  });
});
