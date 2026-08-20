import { describe, it, expect } from "vitest";
import { parseExtraction } from "@/lib/extract";

const URL = "https://example.com/pancakes";

const VALID = {
  title: "Buttermilk Pancakes",
  servings: 4,
  total_minutes: 25,
  ingredients: [
    { name: "flour", qty: 2, unit: "cup", confidence: "high" },
    { name: "buttermilk", qty: 1.5, unit: "cup", confidence: "high" },
    { name: "salt", qty: null, unit: null, confidence: "low" },
  ],
  steps: ["Whisk dry ingredients.", "Fold in buttermilk.", "Griddle until golden."],
  confidence: { title: "high", servings: "high", total_minutes: "low" },
};

describe("parseExtraction", () => {
  it("parses fenced JSON into a StructuredPlan v1", () => {
    const raw = "```json\n" + JSON.stringify(VALID) + "\n```";
    const result = parseExtraction(raw, URL);
    expect(result).toEqual({
      ok: true,
      plan: {
        plan_version: 1,
        kind: "recipe",
        title: "Buttermilk Pancakes",
        servings: 4,
        total_minutes: 25,
        ingredients: VALID.ingredients,
        steps: VALID.steps,
        source_url: URL,
        confidence: { title: "high", servings: "high", total_minutes: "low" },
      },
    });
  });

  it("accepts bare unfenced JSON", () => {
    const result = parseExtraction(JSON.stringify(VALID), URL);
    expect(result.ok).toBe(true);
  });

  it("maps a model error object to graceful failure with the model's reason", () => {
    const raw = JSON.stringify({ error: "page appears to be paywalled" });
    expect(parseExtraction(raw, URL)).toEqual({
      ok: false,
      reason: "page appears to be paywalled",
    });
  });

  it("rejects a plan with no ingredients (hallucination guard)", () => {
    const raw = JSON.stringify({ ...VALID, ingredients: [] });
    expect(parseExtraction(raw, URL).ok).toBe(false);
  });

  it("rejects invalid confidence enum values", () => {
    const raw = JSON.stringify({
      ...VALID,
      confidence: { title: "medium", servings: "high", total_minutes: "low" },
    });
    expect(parseExtraction(raw, URL).ok).toBe(false);
  });

  it("rejects non-numeric qty", () => {
    const raw = JSON.stringify({
      ...VALID,
      ingredients: [{ name: "flour", qty: "two", unit: "cup", confidence: "high" }],
    });
    expect(parseExtraction(raw, URL).ok).toBe(false);
  });

  it("never throws on garbage input", () => {
    const garbage = [
      "",
      "not json at all",
      "```json\n{broken\n```",
      "[]",
      "null",
      "42",
      '{"title": 7}',
      "```\n```",
      '{"title": "x", "ingredients": "flour", "steps": "do it"}',
      "🍳".repeat(1000),
    ];
    for (const g of garbage) {
      const result = parseExtraction(g, URL);
      expect(result.ok).toBe(false);
    }
  });
});

// Nutrition (spec nutrition AC1/AC2): an optional estimated block. Tolerant:
// a garbled block is dropped (the same gate parses raw model output, where
// nutrition failure must never kill a good extraction) — unlike source_embed.
describe("parseExtraction nutrition", () => {
  const NUTRITION = {
    calories: 550,
    protein_g: 18,
    carbs_g: 74,
    fat_g: 20,
    per_serving: true,
    confidence: "high",
  };

  it("passes a valid nutrition block through", () => {
    const result = parseExtraction(JSON.stringify({ ...VALID, nutrition: NUTRITION }), URL);
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.plan as any).nutrition).toEqual(NUTRITION);
  });

  it.each([
    ["non-numeric calories", { ...NUTRITION, calories: "lots" }],
    ["negative macro", { ...NUTRITION, protein_g: -5 }],
    ["missing macro", { calories: 550, per_serving: true, confidence: "high" }],
    ["per_serving false", { ...NUTRITION, per_serving: false }],
    ["bad confidence", { ...NUTRITION, confidence: "certain" }],
    ["not an object", "550 kcal"],
    ["infinite calories", { ...NUTRITION, calories: Infinity }],
    ["boolean macro", { ...NUTRITION, fat_g: true }],
  ])("drops %s without failing the recipe", (_name, nutrition) => {
    const result = parseExtraction(JSON.stringify({ ...VALID, nutrition }), URL);
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.plan as any).nutrition).toBeUndefined();
  });

  it("absent nutrition stays absent (no fabricated zeros)", () => {
    const result = parseExtraction(JSON.stringify(VALID), URL);
    expect(result.ok).toBe(true);
    if (result.ok) expect((result.plan as any).nutrition).toBeUndefined();
  });
});

// spec workout-video-extraction AC1-2: the two-kind intake.
describe("parseExtraction workout dispatch", () => {
  const WORKOUT = {
    kind: "workout",
    title: "Garage Push Day",
    exercises: [
      { name: "Bench Press", sets: 4, reps: 8 },
      { name: "Overhead Press", sets: 3, reps: 10, weight: 95, unit: "lb" },
    ],
  };
  const EMBED = { provider: "youtube", video_id: "abc123" };

  it("a workout shape parses through the manual-entry gate with source fields attached", () => {
    const result = parseExtraction(JSON.stringify(WORKOUT), "https://youtube.com/watch?v=abc123", EMBED as never);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.plan).toEqual({
        plan_version: 2,
        kind: "workout",
        title: "Garage Push Day",
        exercises: WORKOUT.exercises,
        source_url: "https://youtube.com/watch?v=abc123",
        source_embed: EMBED,
      });
    }
  });

  it("no embed → plan_version 1 with the source_url kept", () => {
    const result = parseExtraction(JSON.stringify(WORKOUT), "https://example.com/push-day");
    expect(result.ok).toBe(true);
    if (result.ok && result.plan.kind === "workout") {
      expect(result.plan.plan_version).toBe(1);
      expect(result.plan.source_url).toBe("https://example.com/push-day");
      expect(result.plan.source_embed).toBeUndefined();
    }
  });

  it("garbled exercises fail strict with a reason, like every recipe field", () => {
    const bad = { ...WORKOUT, exercises: [{ name: "Squat", sets: 0, reps: 5 }] };
    const result = parseExtraction(JSON.stringify(bad), "https://example.com/x");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.length).toBeGreaterThan(5);
  });

  it("an explicit kind:recipe rides the unchanged recipe path", () => {
    const result = parseExtraction(JSON.stringify({ ...VALID, kind: "recipe" }), URL);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.plan.kind).toBe("recipe");
  });

  it("an unknown kind is an error, not a guess", () => {
    const result = parseExtraction(JSON.stringify({ ...WORKOUT, kind: "yoga" }), "https://example.com/x");
    expect(result.ok).toBe(false);
  });
});
