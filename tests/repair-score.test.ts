// The LLM repair scorer (spec program-engine AC9): model ranks a menu the
// deterministic engine already built; anything but a clean valid pick falls
// back to the deterministic recommendation.

import { describe, expect, it } from "vitest";
import type { RepairSuggestion } from "@/lib/contracts";
import { scoreRepairMenu } from "@/lib/repair-score";

type Proposal = Omit<RepairSuggestion, "suggestion_id">;
const menu: Proposal[] = [
  {
    kind: "repair", missed_slot_id: "w-1", option: "shift", recommended: true,
    days: [{ date: "2026-07-27", slots: [] }], reason: "free day",
  },
  {
    kind: "repair", missed_slot_id: "w-1", option: "drop",
    days: [{ date: "2026-07-27", slots: [] }], reason: "let it go",
  },
];
const ctx = { recovery_score: 80, missed_priority: undefined, position: null };

describe("scoreRepairMenu", () => {
  it("adopts the model's pick when it names a real option", async () => {
    const pick = await scoreRepairMenu(menu, ctx, async () => '{"pick": "drop"}');
    expect(pick).toBe("drop");
  });

  it("tolerates a fenced response", async () => {
    const pick = await scoreRepairMenu(menu, ctx, async () => '```json\n{"pick": "drop"}\n```');
    expect(pick).toBe("drop");
  });

  it("picks the JSON out of trailing prose (observed live: fenced pick + **Reasoning:** tail)", async () => {
    const raw =
      '```json\n{"pick": "drop"}\n```\n\n**Reasoning:** Recovery score of 25 is critically low, and';
    const pick = await scoreRepairMenu(menu, ctx, async () => raw);
    expect(pick).toBe("drop");
  });

  it.each([
    ["an option not in the menu", '{"pick": "double_up"}'],
    ["junk JSON", "the best option is drop"],
    ["a non-string pick", '{"pick": 4}'],
  ])("falls back on %s", async (_name, raw) => {
    const pick = await scoreRepairMenu(menu, ctx, async () => raw);
    expect(pick).toBeNull();
  });

  it("falls back when the model call throws", async () => {
    const pick = await scoreRepairMenu(menu, ctx, async () => {
      throw new Error("api down");
    });
    expect(pick).toBeNull();
  });
});
