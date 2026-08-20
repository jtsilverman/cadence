import { describe, it, expect } from "vitest";
import { hasPageFixtures } from "./fixture-guard";
import { readFileSync } from "node:fs";
import { prepareExtractionInput } from "@/lib/extract";

const fixture = (name: string) =>
  readFileSync(`tests/fixtures/${name}`, "utf8");

describe.skipIf(!hasPageFixtures)("prepareExtractionInput", () => {
  it("prefers the JSON-LD Recipe block when present", () => {
    const input = prepareExtractionInput(fixture("budgetbytes-chili.html"));
    // ground truth read by hand from the fixture's ld+json
    expect(input).toContain("Homemade Chili Recipe");
    expect(input).toContain("2 Tbsp olive oil");
    // and it is the compact structured block, not the whole page
    expect(input.length).toBeLessThan(20000);
    expect(input).not.toContain("<script");
  });

  it("falls back to stripped page text when no JSON-LD Recipe exists", () => {
    const input = prepareExtractionInput(
      fixture("smittenkitchen-noodles.html")
    );
    expect(input.toLowerCase()).toContain("noodles");
    expect(input).not.toContain("<div");
    expect(input.length).toBeLessThan(60000);
  });

  it("handles a bot-block page without crashing and yields little content", () => {
    const input = prepareExtractionInput(fixture("blocked-page.html"));
    expect(typeof input).toBe("string");
    expect(input.length).toBeLessThan(60000);
  });
});
