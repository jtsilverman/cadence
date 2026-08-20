// Autonomy evidence counts (spec retraction-ladder AC6 + planner-composer
// AC2): superseded pairs are machine bookkeeping, never user verdicts.

import { beforeEach, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { migrate } from "@/lib/db";
import { autonomyState } from "@/lib/autonomy";
import { logSuggestions } from "@/lib/suggestions";

describe("autonomyState vs supersession", () => {
  let db: Client;
  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });
  const HH = "hh-jake";
  const ease = (score: number) => ({
    kind: "ease_workout" as const,
    slot_id: "slot-a",
    date: "2026-07-28",
    recovery_score: score,
    reason: `recovery ${score} — ease up`,
  });

  it("a drift-superseded pair counts as neither accepted nor dismissed", async () => {
    await logSuggestions(db, HH, [ease(20)]);
    await logSuggestions(db, HH, [ease(12)]); // drift → supersedes
    const state = await autonomyState(db, HH, []);
    expect(state.ease_workout.accepted).toBe(0);
    expect(state.ease_workout.dismissed).toBe(0);
  });
});
