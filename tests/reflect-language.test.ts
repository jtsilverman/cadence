// The rephrase seam (spec coach-reflect AC4): anything off ships the template.

import { describe, expect, it } from "vitest";
import { rephrasePrompt } from "@/lib/reflect-language";

const pick = { basis: "streak" as const, text: "That's 3 weeks of training in a row. What's making it stick this time?" };

describe("rephrasePrompt", () => {
  it("adopts a clean single-question rewrite", async () => {
    const out = await rephrasePrompt(pick, async () =>
      '{"prompt": "Three straight weeks of training — what changed?"}'
    );
    expect(out).toBe("Three straight weeks of training — what changed?");
  });

  it.each([
    ["junk text", "hmm let me think"],
    ["empty prompt", '{"prompt": "  "}'],
    ["two questions", '{"prompt": "Why? And how?"}'],
    ["no question", '{"prompt": "Keep it up."}'],
    ["overlong", `{"prompt": "${"why ".repeat(80)}?"}`],
    ["non-string", '{"prompt": 7}'],
  ])("nulls on %s so the template ships", async (_n, raw) => {
    expect(await rephrasePrompt(pick, async () => raw)).toBeNull();
  });

  it("nulls when the call throws", async () => {
    expect(
      await rephrasePrompt(pick, async () => {
        throw new Error("down");
      })
    ).toBeNull();
  });
});
