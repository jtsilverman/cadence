// The LLM meal picker (spec planner-composer AC8): the model picks among
// candidate ids the deterministic composer built; anything else falls back to
// candidate #1 for that slot. repair-score idiom: tolerant parse, strict
// validation, null on any whole-call failure.

import { describe, expect, it } from "vitest";
import { pickMeals } from "@/lib/plan-pick";

const candidates = {
  "2026-08-03": ["m1", "m2", "m3"],
  "2026-08-04": ["m2", "m3", "m1"],
};
const ctx = { daily_calories: 2000, latest_recovery: 80, phase: null };

describe("pickMeals", () => {
  it("adopts valid picks per date", async () => {
    const picks = await pickMeals(candidates, ctx, async () =>
      JSON.stringify({ picks: { "2026-08-03": "m3", "2026-08-04": "m2" } })
    );
    expect(picks).toEqual({ "2026-08-03": "m3", "2026-08-04": "m2" });
  });

  it("drops a pick that names a non-candidate, keeping the valid ones", async () => {
    const picks = await pickMeals(candidates, ctx, async () =>
      JSON.stringify({ picks: { "2026-08-03": "m9", "2026-08-04": "m3" } })
    );
    expect(picks).toEqual({ "2026-08-04": "m3" });
  });

  it("survives a fenced, prose-tailed response", async () => {
    const picks = await pickMeals(candidates, ctx, async () =>
      '```json\n{"picks": {"2026-08-03": "m2"}}\n```\n\n**Why:** variety.'
    );
    expect(picks).toEqual({ "2026-08-03": "m2" });
  });

  it.each([
    ["junk text", "let me think about the week"],
    ["picks not an object", '{"picks": ["m1"]}'],
    ["non-string pick", '{"picks": {"2026-08-03": 3}}'],
  ])("returns null on %s (caller keeps candidate #1 everywhere)", async (_n, raw) => {
    expect(await pickMeals(candidates, ctx, async () => raw)).toBeNull();
  });

  it("returns null when the model call throws", async () => {
    expect(
      await pickMeals(candidates, ctx, async () => {
        throw new Error("down");
      })
    ).toBeNull();
  });
});
