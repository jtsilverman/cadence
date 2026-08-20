import { describe, it, expect } from "vitest";
import { parseExtraction } from "@/lib/extract";
import type { SourceEmbed } from "@/lib/contracts";

const MODEL_JSON = JSON.stringify({
  title: "Caption Chili",
  servings: 4,
  total_minutes: 30,
  ingredients: [{ name: "beans", qty: 2, unit: "can", confidence: "high" }],
  steps: ["Simmer the beans."],
  confidence: { title: "high", servings: "high", total_minutes: "high" },
});

const EMBED: SourceEmbed = {
  provider: "tiktok",
  video_id: "6718335390845095173",
  thumbnail_url: "https://p16.tiktokcdn-us.com/thumb.jpg",
};

describe("parseExtraction with source_embed", () => {
  it("attaches a server-side embed and bumps to plan_version 2", () => {
    const result = parseExtraction(MODEL_JSON, "https://www.tiktok.com/@x/video/1", EMBED);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.plan_version).toBe(2);
    expect(result.plan.source_embed).toEqual(EMBED);
  });

  it("stays plan_version 1 with no embed anywhere (v1 back-compat)", () => {
    const result = parseExtraction(MODEL_JSON, "https://example.com/r");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.plan_version).toBe(1);
    expect(result.plan.source_embed).toBeUndefined();
  });

  it("round-trips a source_embed arriving in the body (save-route path)", () => {
    const body = JSON.stringify({ ...JSON.parse(MODEL_JSON), source_embed: EMBED });
    const result = parseExtraction(body, "https://www.tiktok.com/@x/video/1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.source_embed).toEqual(EMBED);
    expect(result.plan.plan_version).toBe(2);
  });

  it("rejects a malformed body embed instead of silently dropping it", () => {
    for (const bad of [
      { provider: "vimeo", video_id: "1" }, // unknown provider
      { provider: "tiktok" }, // missing video_id
      { provider: "tiktok", video_id: "1", thumbnail_url: "javascript:alert(1)" }, // non-https thumb
    ]) {
      const body = JSON.stringify({ ...JSON.parse(MODEL_JSON), source_embed: bad });
      const result = parseExtraction(body, "https://x.com/r");
      expect(result.ok, JSON.stringify(bad)).toBe(false);
    }
  });

  it("server-side embed wins over a body embed", () => {
    const body = JSON.stringify({
      ...JSON.parse(MODEL_JSON),
      source_embed: { provider: "youtube", video_id: "other" },
    });
    const result = parseExtraction(body, "https://www.tiktok.com/@x/video/1", EMBED);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.source_embed).toEqual(EMBED);
  });
});
