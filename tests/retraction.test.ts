// The retraction fold (spec retraction-ladder AC2/AC4/AC7): a LogRetracted
// event makes every reader forget the target id. Pure folds, fixed dates.

import { describe, expect, it } from "vitest";
import type { EventEnvelope } from "@/lib/contracts";
import {
  LOG_RETRACTED,
  RECIPE_COOKED,
  SESSION_LOGGED,
  SET_LOGGED,
  SLOT_SKIPPED,
  SCHEDULE_PLANNED,
} from "@/lib/contracts";
import { dropRetracted, resolveRevisions, retractedIds } from "@/lib/events";
import { rebuildSchedule } from "@/lib/schedule";
import { exerciseHistory } from "@/lib/workouts";
import { mealHistory } from "@/lib/history";
import { cookedByDate } from "@/lib/nutrition";
import { rebuildPantry } from "@/lib/pantry";

let seq = 0;
const ev = (type: string, payload: unknown, ts = "2026-07-21T16:00:00.000Z"): EventEnvelope => ({
  event_id: `ev-${++seq}`,
  household_id: "hh-test",
  type,
  ts,
  source: "web",
  payload,
  schema_version: 1,
  precision: "exact",
});

const retract = (id: string): EventEnvelope =>
  ev(LOG_RETRACTED, { retracted_event_id: id }, "2026-07-21T17:00:00.000Z");

describe("retractedIds / dropRetracted", () => {
  it("collects retracted ids and drops those events, keeping everything else", () => {
    const a = ev(SESSION_LOGGED, { title: "A", kind: "loose" });
    const b = ev(SESSION_LOGGED, { title: "B", kind: "loose" });
    const events = [a, b, retract(a.event_id)];
    expect(retractedIds(events)).toEqual(new Set([a.event_id]));
    const kept = dropRetracted(events);
    expect(kept.some((e) => e.event_id === a.event_id)).toBe(false);
    expect(kept.some((e) => e.event_id === b.event_id)).toBe(true);
  });

  it("with zero retractions the array passes through unchanged", () => {
    const a = ev(SESSION_LOGGED, { title: "A", kind: "loose" });
    expect(dropRetracted([a])).toEqual([a]);
  });
});

describe("folds forget retracted entries", () => {
  it("resolveRevisions drops a retracted manual entry", () => {
    const a = ev(SESSION_LOGGED, { title: "A", kind: "loose" });
    const resolved = resolveRevisions([a, retract(a.event_id)], SESSION_LOGGED);
    expect(resolved).toHaveLength(0);
  });

  it("rebuildSchedule reverts a done slot when its log is retracted", () => {
    const plan = ev(SCHEDULE_PLANNED, {
      days: [{ date: "2026-07-21", slots: [{ slot_id: "s1", lane: "workout", title: "Run" }] }],
    });
    const done = ev(SESSION_LOGGED, { title: "Run", kind: "loose", slot_id: "s1" });
    expect(rebuildSchedule([plan, done])[0].slots[0].status).toBe("done");
    expect(rebuildSchedule([plan, done, retract(done.event_id)])[0].slots[0].status).toBe("planned");
  });

  it("rebuildSchedule reverts a skipped slot when the skip is retracted", () => {
    const plan = ev(SCHEDULE_PLANNED, {
      days: [{ date: "2026-07-21", slots: [{ slot_id: "s1", lane: "workout", title: "Run" }] }],
    });
    const skip = ev(SLOT_SKIPPED, { slot_id: "s1", lane: "workout" });
    expect(rebuildSchedule([plan, skip, retract(skip.event_id)])[0].slots[0].status).toBe("planned");
  });

  it("exerciseHistory forgets a retracted set", () => {
    const set = ev(SET_LOGGED, { session_id: "s", exercise: "Squat", set_index: 1, reps: 5 });
    expect(exerciseHistory([set]).get("squat")).toHaveLength(1);
    expect(exerciseHistory([set, retract(set.event_id)]).get("squat")).toBeUndefined();
  });

  it("mealHistory and the calorie fold forget a retracted cook", () => {
    const cook = ev(RECIPE_COOKED, {
      library_id: "lib-1", title: "Chili", ingredients: [],
      nutrition: { calories: 600, protein_g: 1, carbs_g: 1, fat_g: 1, per_serving: true, confidence: "high" },
    });
    expect(mealHistory([cook])).toHaveLength(1);
    expect(mealHistory([cook, retract(cook.event_id)])).toHaveLength(0);
    expect(cookedByDate([cook, retract(cook.event_id)]).size).toBe(0);
  });

  it("rebuildPantry restores ingredients when a cook is retracted (full refold, not inverse)", () => {
    const assert = ev("PantryAsserted", { name: "beans", qty: 5, unit: "can" }, "2026-07-21T10:00:00.000Z");
    const cook = ev(RECIPE_COOKED, {
      library_id: "lib-1", title: "Chili",
      ingredients: [{ name: "beans", qty: 2, unit: "can" }],
    });
    const before = rebuildPantry([assert, cook]);
    expect(before.find((i) => i.name === "beans")?.qty).toBe(3);
    const after = rebuildPantry([assert, cook, retract(cook.event_id)]);
    expect(after.find((i) => i.name === "beans")?.qty).toBe(5);
  });

  it("a retraction only silences its exact target, not siblings", () => {
    const a = ev(SESSION_LOGGED, { title: "A", kind: "loose" });
    const b = ev(SESSION_LOGGED, { title: "B", kind: "loose" });
    const resolved = resolveRevisions([a, b, retract(a.event_id)], SESSION_LOGGED);
    expect(resolved.map((e) => (e.payload as { title: string }).title)).toEqual(["B"]);
  });
});
