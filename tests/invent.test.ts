import { describe, it, expect } from "vitest";
import { buildInventionPrompt, inventFood, inventionAllowed } from "@/lib/invent";
import type { RecipePlan } from "@/lib/contracts";

const plan = (over: Partial<RecipePlan> = {}): RecipePlan => ({
  plan_version: 1,
  kind: "recipe",
  title: "Chicken and rice bowl",
  servings: 2,
  total_minutes: 25,
  ingredients: [{ name: "chicken thigh", qty: 400, unit: "g", confidence: "high" }],
  steps: ["Sear the chicken.", "Serve over rice."],
  source_url: "invented",
  confidence: { title: "high", servings: "high", total_minutes: "high" },
  ...over,
});

const model = (body: unknown) => async () => JSON.stringify(body);

describe("buildInventionPrompt", () => {
  it("passes the palette and states hard restrictions explicitly", () => {
    const prompt = buildInventionPrompt({
      wish: "something warm",
      palette: ["rice", "chicken thigh"],
      restrictions: "no peanuts, dairy",
    });
    expect(prompt).toMatch(/something warm/);
    expect(prompt).toMatch(/rice, chicken thigh/);
    expect(prompt).toMatch(/HARD RESTRICTIONS.*peanuts, dairy/);
  });

  it("always tells the model not to invent macros", () => {
    const prompt = buildInventionPrompt({ wish: "anything", palette: [] });
    expect(prompt).toMatch(/Do NOT include a nutrition or macros field/);
  });
});

describe("inventionAllowed (deterministic gate on the model's answer)", () => {
  it("rejects a plan that breaks a restriction even when the prompt asked for it", () => {
    const peanutty = plan({
      ingredients: [{ name: "peanut butter", qty: 2, unit: "tbsp", confidence: "high" }],
    });
    expect(inventionAllowed(peanutty, "no peanuts")).toBe(false);
  });

  it("enforces vegetarian against the meat vocabulary, not a promise", () => {
    expect(inventionAllowed(plan(), "vegetarian")).toBe(false);
    expect(
      inventionAllowed(
        plan({ title: "Rice and beans", ingredients: [{ name: "black beans", qty: 1, unit: "can", confidence: "high" }] }),
        "vegetarian"
      )
    ).toBe(true);
  });

  it("allows anything when no restrictions are set", () => {
    expect(inventionAllowed(plan(), undefined)).toBe(true);
  });
});

describe("inventFood", () => {
  it("returns a reviewable plan marked as invented, never saved", async () => {
    const result = await inventFood(
      { wish: "something with chicken", palette: ["chicken thigh", "rice"] },
      model({
        title: "Chicken and rice bowl",
        servings: 2,
        total_minutes: 25,
        ingredients: [{ name: "chicken thigh", qty: 400, unit: "g", confidence: "low" }],
        steps: ["Sear the chicken.", "Serve over rice."],
        confidence: { title: "high", servings: "high", total_minutes: "high" },
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.plan.source_url).toBe("invented");
    expect(result.plan.title).toBe("Chicken and rice bowl");
  });

  it("drops macros the model supplied anyway — invented food has unknown nutrition", async () => {
    const result = await inventFood(
      { wish: "a snack", palette: [] },
      model({
        title: "Honey oat bar",
        servings: 1,
        total_minutes: 10,
        ingredients: [{ name: "oats", qty: 50, unit: "g", confidence: "low" }],
        steps: ["Mix.", "Chill."],
        confidence: { title: "high", servings: "high", total_minutes: "high" },
        nutrition: { calories: 250, protein_g: 6, carbs_g: 30, fat_g: 10, per_serving: true, confidence: "high" },
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.plan.nutrition).toBeUndefined();
  });

  it("refuses a suggestion that breaks a hard restriction", async () => {
    const result = await inventFood(
      { wish: "something nutty", palette: [], restrictions: "no peanuts" },
      model({
        title: "Peanut noodles",
        servings: 2,
        total_minutes: 15,
        ingredients: [{ name: "peanut butter", qty: 2, unit: "tbsp", confidence: "low" }],
        steps: ["Whisk.", "Toss."],
        confidence: { title: "high", servings: "high", total_minutes: "high" },
      })
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/hard restriction/);
  });

  it("reports a model failure gracefully instead of throwing", async () => {
    const result = await inventFood({ wish: "anything", palette: [] }, async () => {
      throw new Error("network");
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toMatch(/failed/);
  });

  it("rejects an empty wish before calling the model", async () => {
    let called = false;
    const result = await inventFood({ wish: "   ", palette: [] }, async () => {
      called = true;
      return "{}";
    });
    expect(result.ok).toBe(false);
    expect(called).toBe(false);
  });

  it("passes malformed model output through the same parse gate", async () => {
    const result = await inventFood({ wish: "anything", palette: [] }, async () => "not json");
    expect(result.ok).toBe(false);
  });
});
