import { describe, expect, it } from "vitest";
import type { EventEnvelope } from "@/lib/contracts";
import {
  JOURNAL_ENTRY,
  RECIPE_COOKED,
  SESSION_LOGGED,
  SLEPT_LOGGED,
} from "@/lib/contracts";
import { journalHistory, mealHistory, sleepHistory, workoutHistory } from "@/lib/history";

const HH = "hh-test";

let n = 0;
function ev(type: string, ts: string, payload: unknown, source = "web"): EventEnvelope {
  n += 1;
  return {
    event_id: `e${String(n).padStart(3, "0")}`,
    household_id: HH,
    type,
    ts,
    source,
    payload,
    schema_version: 1,
    precision: "exact",
  };
}

describe("mealHistory", () => {
  it("newest first with household-local dates", () => {
    const events = [
      ev(RECIPE_COOKED, "2026-07-20T22:00:00Z", { library_id: "a", title: "Chili", ingredients: [] }),
      // 01:00Z on the 23rd = 9pm ET on the 22nd
      ev(RECIPE_COOKED, "2026-07-23T01:00:00Z", { library_id: "b", title: "Tacos", ingredients: [] }),
    ];
    expect(mealHistory(events)).toEqual([
      { date: "2026-07-22", title: "Tacos", library_id: "b" },
      { date: "2026-07-20", title: "Chili", library_id: "a" },
    ]);
  });
});

describe("workoutHistory", () => {
  it("dedupes device revisions by external_id; manual sessions all show", () => {
    const events = [
      ev(SESSION_LOGGED, "2026-07-20T22:00:00Z", { title: "yoga", kind: "loose" }),
      ev(SESSION_LOGGED, "2026-07-21T22:00:00Z", { title: "Running", kind: "loose", external_id: "whoop:workout:a" }, "whoop"),
      ev(SESSION_LOGGED, "2026-07-21T22:00:00Z", { title: "Running", kind: "loose", external_id: "whoop:workout:a", note: "revised" }, "whoop"),
      ev(SESSION_LOGGED, "2026-07-22T22:00:00Z", { title: "Squat Day", kind: "structured", session_id: "s1", library_id: "w1" }),
    ];
    const rows = workoutHistory(events);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ date: "2026-07-22", title: "Squat Day", kind: "structured", library_id: "w1" });
    expect(rows[1]).toMatchObject({ date: "2026-07-21", title: "Running", source: "whoop" });
    expect(rows[2]).toMatchObject({ date: "2026-07-20", title: "yoga", source: "web" });
  });
});

describe("journalHistory", () => {
  it("newest first, slot link kept", () => {
    const events = [
      ev(JOURNAL_ENTRY, "2026-07-20T12:00:00Z", { text: "first", slot_id: "s1" }),
      ev(JOURNAL_ENTRY, "2026-07-21T12:00:00Z", { text: "second" }),
    ];
    expect(journalHistory(events)).toEqual([
      { date: "2026-07-21", text: "second" },
      { date: "2026-07-20", text: "first", slot_id: "s1" },
    ]);
  });
});

describe("sleepHistory", () => {
  it("one row per night: device revision wins over its original, latest event per date wins overall", () => {
    const events = [
      ev(SLEPT_LOGGED, "2026-07-20T08:00:00Z", { date: "2026-07-20", quality: "ok" }), // manual
      ev(SLEPT_LOGGED, "2026-07-20T11:00:00Z", { date: "2026-07-20", quality: "great", hours: 7.5, score: 88, external_id: "whoop:sleep:x" }, "whoop"),
      ev(SLEPT_LOGGED, "2026-07-21T11:00:00Z", { date: "2026-07-21", quality: "rough", hours: 5, score: 55, external_id: "whoop:sleep:y" }, "whoop"),
      ev(SLEPT_LOGGED, "2026-07-21T12:00:00Z", { date: "2026-07-21", quality: "ok", hours: 6, score: 68, external_id: "whoop:sleep:y" }, "whoop"), // revision
    ];
    expect(sleepHistory(events)).toEqual([
      { date: "2026-07-21", quality: "ok", hours: 6, score: 68, source: "whoop" },
      { date: "2026-07-20", quality: "great", hours: 7.5, score: 88, source: "whoop" },
    ]);
  });
});
