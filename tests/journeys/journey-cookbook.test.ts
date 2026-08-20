// J7 — "My cookbook: save, browse, don't let me wreck it, don't let the
// internet wreck me."

import { describe, it, expect, beforeAll } from "vitest";
import { loadApp, type App, get, post } from "./harness";

let app: App;
let extract: { POST: (req: Request) => Promise<Response> };

const RECIPE = {
  source_url: "https://example.com/pad-thai",
  title: "Pad Thai",
  servings: 2,
  total_minutes: 30,
  ingredients: [{ name: "rice noodles", qty: 200, unit: "g", confidence: "high" }],
  steps: ["Soak noodles.", "Wok everything."],
  confidence: { title: "high", servings: "high", total_minutes: "high" },
};

beforeAll(async () => {
  app = await loadApp();
  extract = (await import("@/app/api/recipes/extract/route")) as any;
});

describe("J7: the cookbook", () => {
  it("a saved recipe is browsable with its real content", async () => {
    const saved = await post(app.recipes, RECIPE);
    expect(saved.status).toBe(200);
    const list = await get(app.recipes);
    const mine = list.body.recipes.find((r: any) => r.title === "Pad Thai");
    expect(mine).toBeDefined();
  });

  it("accidentally saving the same recipe twice doesn't leave me two identical cookbook entries", async () => {
    await post(app.recipes, RECIPE); // the double-tap / re-share
    const list = await get(app.recipes);
    const copies = list.body.recipes.filter((r: any) => r.title === "Pad Thai");
    expect(copies).toHaveLength(1);
  });

  it("a recipe with no ingredients is refused — a cookbook entry must be cookable", async () => {
    const res = await post(app.recipes, { ...RECIPE, source_url: "https://example.com/x", ingredients: [] });
    expect(res.status).toBe(422);
  });

  it("extraction refuses a non-URL before touching the network", async () => {
    const res = await post(extract as any, { url: "not a url" });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
  });

  it("extraction refuses to fetch private/internal addresses (my kitchen is not a proxy)", async () => {
    for (const url of ["http://localhost/admin", "http://169.254.169.254/latest/meta-data", "http://192.168.1.1/router"]) {
      const res = await post(extract, { url });
      expect(res.status, url).toBeGreaterThanOrEqual(400);
      expect(res.status, url).toBeLessThan(500);
    }
  });
});
