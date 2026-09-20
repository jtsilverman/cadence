import { beforeEach, describe, expect, it } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { migrate } from "@/lib/db";
import { appendEvent, newEventId, readEvents } from "@/lib/events";
import { approvePlanDraft } from "@/lib/plan-approval";
import { rebuildSchedule } from "@/lib/schedule";
import { logSuggestions, readSuggestionState } from "@/lib/suggestions";

let db: Client;
const HH = "hh-jake";

beforeEach(async () => {
  db = createClient({ url: ":memory:" });
  await migrate(db);
});

describe("atomic plan approval", () => {
  it("writes the schedule and accepted receipt in one operation", async () => {
    const [draft] = await logSuggestions(db, HH, [{
      kind: "plan_draft",
      scope: "week",
      anchor: "2026-09-21",
      reason: "nutrition week",
      days: [{
        date: "2026-09-21",
        slots: [{ lane: "meal", title: "Oats", meal_type: "breakfast", time: "08:00", servings: 1 }],
      }],
    }]);
    const result = await approvePlanDraft(db, HH, draft.suggestion_id);
    expect(result.ok).toBe(true);
    const events = await readEvents(db, HH);
    expect(events.filter((event) => event.type === "SchedulePlanned")).toHaveLength(1);
    expect(events.filter((event) => event.type === "SuggestionResolved")).toHaveLength(1);
    expect(rebuildSchedule(events)[0].slots[0]).toMatchObject({
      title: "Oats",
      meal_type: "breakfast",
      time: "08:00",
      servings: 1,
    });
    expect((await readSuggestionState(db, HH)).open).toHaveLength(0);
  });

  it("cannot apply the same proposal twice", async () => {
    const [draft] = await logSuggestions(db, HH, [{
      kind: "plan_draft",
      scope: "day",
      anchor: "2026-09-21",
      reason: "one day",
      days: [{ date: "2026-09-21", slots: [{ lane: "meal", title: "Soup" }] }],
    }]);
    expect((await approvePlanDraft(db, HH, draft.suggestion_id)).ok).toBe(true);
    expect((await approvePlanDraft(db, HH, draft.suggestion_id)).ok).toBe(false);
    expect((await readEvents(db, HH, { type: "SchedulePlanned" }))).toHaveLength(1);
  });

  it("allows only one winner when two approvals race", async () => {
    const [draft] = await logSuggestions(db, HH, [{
      kind: "plan_draft",
      scope: "week",
      anchor: "2026-09-21",
      reason: "race",
      days: [{ date: "2026-09-21", slots: [{ lane: "meal", title: "Oats" }] }],
    }]);

    const results = await Promise.all([
      approvePlanDraft(db, HH, draft.suggestion_id),
      approvePlanDraft(db, HH, draft.suggestion_id),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(await readEvents(db, HH, { type: "SchedulePlanned" })).toHaveLength(1);
    expect(await readEvents(db, HH, { type: "SuggestionResolved" })).toHaveLength(1);
  });

  it("refuses a stale draft after the schedule changed", async () => {
    const [draft] = await logSuggestions(db, HH, [{
      kind: "plan_draft",
      scope: "week",
      anchor: "2026-09-21",
      reason: "nutrition week",
      days: [{ date: "2026-09-21", slots: [{ lane: "meal", title: "Old oats" }] }],
    }]);
    await appendEvent(db, {
      event_id: newEventId(),
      household_id: HH,
      type: "SchedulePlanned",
      ts: new Date().toISOString(),
      source: "web",
      payload: { days: [{ date: "2026-09-21", slots: [{ lane: "meal", title: "New breakfast" }] }] },
      schema_version: 1,
      precision: "exact",
    });

    const result = await approvePlanDraft(db, HH, draft.suggestion_id);
    expect(result).toMatchObject({ ok: false, reason: expect.stringMatching(/fresh draft/) });
    expect((await readEvents(db, HH, { type: "SchedulePlanned" }))).toHaveLength(1);
    expect(rebuildSchedule(await readEvents(db, HH))[0].slots[0].title).toBe("New breakfast");
  });
});
