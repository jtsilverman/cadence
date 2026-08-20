import { describe, it, expect, afterEach, vi } from "vitest";
import { hasPageFixtures } from "./fixture-guard";
import { readFileSync } from "node:fs";
import { extractRecipe } from "@/lib/extract";

const fixture = (name: string) => readFileSync(`tests/fixtures/${name}`, "utf8");

const RECIPE_JSON = JSON.stringify({
  title: "Peanut Butter Cups",
  servings: null,
  total_minutes: null,
  ingredients: [
    { name: "oats", qty: 50, unit: "g", confidence: "high" },
    { name: "peanut butter", qty: 5, unit: "tbsp", confidence: "high" },
  ],
  steps: ["Blitz oats.", "Mix and set."],
  confidence: { title: "high", servings: "high", total_minutes: "high" },
});

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// Route page fetches to fixtures; oEmbed calls get a canned response.
function mockFetch(pageHtml: string, opts?: { oembedThumb?: string }) {
  const calls: string[] = [];
  globalThis.fetch = vi.fn(async (url: unknown) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/oembed")) {
      return new Response(
        JSON.stringify({
          title: "vid title",
          thumbnail_url: opts?.oembedThumb ?? "https://cdn.example/thumb.jpg",
        }),
        { status: 200 }
      );
    }
    return new Response(pageHtml, { status: 200 });
  }) as typeof fetch;
  return calls;
}

describe.skipIf(!hasPageFixtures)("source adapters", () => {
  it("tiktok: model gets the caption, plan carries a tiktok source_embed", async () => {
    mockFetch(fixture("tiktok-pbcups.html"));
    let modelInput = "";
    const result = await extractRecipe(
      "https://www.tiktok.com/@rachel.hornibrook/video/7329248913704176928",
      async (input) => {
        modelInput = String(input);
        return RECIPE_JSON;
      }
    );

    expect(modelInput).toContain("PEANUT BUTTER CUPS");
    expect(modelInput).toContain("50g oats");
    // caption input, not the 300KB page dump
    expect(modelInput.length).toBeLessThan(5000);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.source_embed).toEqual({
      provider: "tiktok",
      video_id: "7329248913704176928",
      thumbnail_url: "https://cdn.example/thumb.jpg",
    });
    expect(result.plan.plan_version).toBe(2);
  });

  it("tiktok: a thin caption fails gracefully without calling the model", async () => {
    mockFetch(fixture("tiktok-petvideo.html"));
    const model = vi.fn(async () => RECIPE_JSON);
    const result = await extractRecipe(
      "https://www.tiktok.com/@scout2015/video/6718335390845095173",
      model
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/caption/i);
    expect(model).not.toHaveBeenCalled();
  });

  it("youtube: model gets the description, plan carries a youtube source_embed", async () => {
    mockFetch(fixture("youtube-misopasta.html"));
    let modelInput = "";
    const result = await extractRecipe(
      "https://www.youtube.com/watch?v=zueVtyUQE64",
      async (input) => {
        modelInput = String(input);
        return RECIPE_JSON;
      }
    );
    expect(modelInput).toContain("Miso-Mascarpone");
    expect(modelInput).toContain("mascarpone");
    // the VIDEO's title, not the first "title" key on the page (ytInitialData
    // precedes the player response on real watch pages and carries its own)
    expect(modelInput).toContain("six-ingredient recipe");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.source_embed).toMatchObject({
      provider: "youtube",
      video_id: "zueVtyUQE64",
    });
  });

  it("youtu.be short links resolve the same video id", async () => {
    mockFetch(fixture("youtube-misopasta.html"));
    const result = await extractRecipe("https://youtu.be/zueVtyUQE64", async () => RECIPE_JSON);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.source_embed?.video_id).toBe("zueVtyUQE64");
  });

  it("instagram: honest refusal, no fetch, no model call", async () => {
    const calls = mockFetch("<html></html>");
    const model = vi.fn(async () => RECIPE_JSON);
    const result = await extractRecipe(
      "https://www.instagram.com/p/C1a2b3c4d5e/",
      model
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/instagram/i);
    expect(model).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("plain web pages keep the P1 path: no source_embed, plan_version 1", async () => {
    mockFetch(fixture("budgetbytes-chili.html"));
    const result = await extractRecipe("https://www.budgetbytes.com/chili/", async () =>
      JSON.stringify({
        title: "Chili",
        servings: 4,
        total_minutes: 45,
        ingredients: [{ name: "beans", qty: 2, unit: "can", confidence: "high" }],
        steps: ["Simmer."],
        confidence: { title: "high", servings: "high", total_minutes: "high" },
      })
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.source_embed).toBeUndefined();
    expect(result.plan.plan_version).toBe(1);
  });
});
