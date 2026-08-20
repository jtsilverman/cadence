import { describe, it, expect, vi } from "vitest";
import { extractRecipeFromImage, MAX_IMAGE_BYTES } from "@/lib/extract";

const RECIPE_JSON = JSON.stringify({
  title: "Grandma's Cookies",
  servings: 24,
  total_minutes: 40,
  ingredients: [{ name: "flour", qty: 2, unit: "cup", confidence: "high" }],
  steps: ["Mix.", "Bake."],
  confidence: { title: "high", servings: "low", total_minutes: "low" },
});

const tinyPng = Buffer.from("fake-png-bytes").toString("base64");

describe("extractRecipeFromImage", () => {
  it("sends the image as a vision content block and parses the plan", async () => {
    let received: unknown;
    const result = await extractRecipeFromImage(tinyPng, "image/png", async (input) => {
      received = input;
      return RECIPE_JSON;
    });

    expect(Array.isArray(received)).toBe(true);
    const blocks = received as Array<Record<string, unknown>>;
    const image = blocks.find((b) => b.type === "image");
    expect(image).toMatchObject({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: tinyPng },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.title).toBe("Grandma's Cookies");
    expect(result.plan.source_url).toBe("photo");
    expect(result.plan.plan_version).toBe(1);
  });

  it("rejects an oversized image without calling the model", async () => {
    const big = "A".repeat(Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 8);
    const model = vi.fn(async () => RECIPE_JSON);
    const result = await extractRecipeFromImage(big, "image/jpeg", model);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/too large/i);
    expect(model).not.toHaveBeenCalled();
  });

  it("rejects unsupported media types", async () => {
    const model = vi.fn(async () => RECIPE_JSON);
    const result = await extractRecipeFromImage(tinyPng, "image/tiff", model);
    expect(result.ok).toBe(false);
    expect(model).not.toHaveBeenCalled();
  });
});

// spec workout-video-extraction AC6: photo intake is recipe-only BY GUARD.
describe("photo workout guard", () => {
  it("a workout coming back from a photo is refused, not saved as a recipe", async () => {
    const { extractRecipeFromImage } = await import("@/lib/extract");
    const result = await extractRecipeFromImage(
      Buffer.from("img").toString("base64"),
      "image/jpeg",
      async () =>
        JSON.stringify({
          kind: "workout",
          title: "Push Day",
          exercises: [{ name: "Bench", sets: 3, reps: 8 }],
        })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason.toLowerCase()).toContain("recipe-only");
  });
});
