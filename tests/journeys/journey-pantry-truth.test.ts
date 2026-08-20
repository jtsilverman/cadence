// J10 — "What I say about my kitchen is the truth, and the app keeps me
// honest about what's about to go bad."

import { describe, it, expect, beforeAll } from "vitest";
import { loadApp, type App, get, post, todayLocal, addDays } from "./harness";

let app: App;
const soon = addDays(todayLocal(), 2);

beforeAll(async () => {
  app = await loadApp();
});

const milk = async () =>
  (await get(app.pantry)).body.items.find((i: any) => i.name === "milk");

describe("J10: pantry truth", () => {
  it("what I assert is exactly what the pantry says, expiry included", async () => {
    const res = await post(app.pantry, { name: "milk", qty: 1, unit: "l", expires: soon });
    expect(res.status).toBe(200);
    expect(await milk()).toMatchObject({ qty: 1, unit: "l", expires: soon });
  });

  it("the expiring window warns me before the milk goes", async () => {
    const res = await get(app.pantry);
    const expiring = res.body.expiring.map((e: any) => e.name);
    expect(expiring).toContain("milk");
  });

  it("correcting the amount replaces my old statement, never adds to it", async () => {
    await post(app.pantry, { name: "milk", qty: 0.5, unit: "l", expires: soon });
    expect((await milk()).qty).toBe(0.5); // stated beats stated, latest wins
  });

  it("removing it removes it", async () => {
    const res = await post(app.pantry, { name: "milk", removed: true });
    expect(res.status).toBe(200);
    expect(await milk()).toBeUndefined();
  });

  it("a negative amount of flour is not a thing I can own", async () => {
    const res = await post(app.pantry, { name: "flour", qty: -2, unit: "cup" });
    expect(res.status).toBe(422);
  });

  it("an impossible expiry date is refused", async () => {
    const res = await post(app.pantry, { name: "yogurt", qty: 1, unit: null, expires: "2026-02-30" });
    expect(res.status).toBe(422);
  });
});
