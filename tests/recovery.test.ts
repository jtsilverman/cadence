import { describe, expect, it } from "vitest";
import type { EventEnvelope, RecoveryLoggedPayload } from "@/lib/contracts";
import { RECOVERY_LOGGED, SCHEDULE_PLANNED } from "@/lib/contracts";
import { decorateWithRecovery, recoveryByDate } from "@/lib/recovery";
import { rebuildSchedule } from "@/lib/schedule";

const HH = "hh-test";

let n = 0;
function recoveryEvent(
  payload: RecoveryLoggedPayload,
  ts: string,
  source = "whoop"
): EventEnvelope {
  n += 1;
  return {
    event_id: `e${String(n).padStart(3, "0")}`,
    household_id: HH,
    type: RECOVERY_LOGGED,
    ts,
    source,
    payload,
    schema_version: source === "whoop" ? 2 : 1,
    precision: "exact",
  };
}

describe("recoveryByDate", () => {
  it("resolves a revised whoop record latest-wins by external_id", () => {
    const original = recoveryEvent(
      { date: "2026-07-26", score: 55, external_id: "whoop:recovery:1" },
      "2026-07-26T11:00:00Z"
    );
    const revision = recoveryEvent(
      { date: "2026-07-26", score: 67, external_id: "whoop:recovery:1" },
      "2026-07-26T11:00:00Z" // same record ts; later event_id breaks the tie
    );
    const byDate = recoveryByDate([original, revision]);
    expect(byDate.get("2026-07-26")?.score).toBe(67);
  });

  it("keeps the latest event per date when device and manual entries coexist", () => {
    const manual = recoveryEvent({ date: "2026-07-26", score: 40 }, "2026-07-26T08:00:00Z", "web");
    const device = recoveryEvent(
      { date: "2026-07-26", score: 61, external_id: "whoop:recovery:2" },
      "2026-07-26T11:05:00Z"
    );
    const byDate = recoveryByDate([manual, device]);
    expect(byDate.get("2026-07-26")?.score).toBe(61);
  });

  it("dates never bleed into each other", () => {
    const a = recoveryEvent(
      { date: "2026-07-25", score: 90, external_id: "whoop:recovery:3" },
      "2026-07-25T11:00:00Z"
    );
    const b = recoveryEvent(
      { date: "2026-07-26", score: 20, external_id: "whoop:recovery:4" },
      "2026-07-26T11:00:00Z"
    );
    const byDate = recoveryByDate([a, b]);
    expect(byDate.get("2026-07-25")?.score).toBe(90);
    expect(byDate.get("2026-07-26")?.score).toBe(20);
  });
});

describe("decorateWithRecovery", () => {
  const planEvent: EventEnvelope = {
    event_id: "plan1",
    household_id: HH,
    type: SCHEDULE_PLANNED,
    ts: "2026-07-25T00:00:00Z",
    source: "web",
    payload: {
      days: [
        {
          date: "2026-07-26",
          slots: [
            { slot_id: "s-workout", lane: "workout", title: "squat day" },
            { slot_id: "s-meal", lane: "meal", title: "tacos", library_id: "lib1" },
          ],
        },
        { date: "2026-07-27", slots: [{ slot_id: "s2", lane: "mind", title: "meditate" }] },
      ],
    },
    schema_version: 1,
    precision: "exact",
  };

  it("attaches the day's recovery and flags ease on a red-zone day with a planned workout", () => {
    const events = [
      planEvent,
      recoveryEvent(
        { date: "2026-07-26", score: 33, hrv: 41.2, resting_hr: 55, external_id: "whoop:recovery:5" },
        "2026-07-26T11:00:00Z"
      ),
    ];
    const days = decorateWithRecovery(rebuildSchedule(events), recoveryByDate(events));
    const day = days.find((d) => d.date === "2026-07-26")!;
    expect(day.recovery).toEqual({ score: 33, hrv: 41.2, resting_hr: 55 });
    expect(day.advice).toBe("ease");
    // no recovery data → no decoration at all
    expect(days.find((d) => d.date === "2026-07-27")!.recovery).toBeUndefined();
  });

  it("score at the boundary (34) or a day without a planned workout gets no ease flag", () => {
    const at34 = [
      planEvent,
      recoveryEvent(
        { date: "2026-07-26", score: 34, external_id: "whoop:recovery:6" },
        "2026-07-26T11:00:00Z"
      ),
    ];
    const days34 = decorateWithRecovery(rebuildSchedule(at34), recoveryByDate(at34));
    expect(days34.find((d) => d.date === "2026-07-26")!.advice).toBeUndefined();

    const noWorkout = [
      planEvent,
      recoveryEvent(
        { date: "2026-07-27", score: 10, external_id: "whoop:recovery:7" },
        "2026-07-27T11:00:00Z"
      ),
    ];
    const days = decorateWithRecovery(rebuildSchedule(noWorkout), recoveryByDate(noWorkout));
    const mindDay = days.find((d) => d.date === "2026-07-27")!;
    expect(mindDay.recovery?.score).toBe(10);
    expect(mindDay.advice).toBeUndefined();
  });

  it("a skipped workout is not a planned one — no ease flag", () => {
    const events = [
      planEvent,
      {
        event_id: "skip1",
        household_id: HH,
        type: "SlotSkipped",
        ts: "2026-07-26T09:00:00Z",
        source: "web",
        payload: { slot_id: "s-workout", lane: "workout" },
        schema_version: 1,
        precision: "exact",
      } as EventEnvelope,
      recoveryEvent(
        { date: "2026-07-26", score: 5, external_id: "whoop:recovery:8" },
        "2026-07-26T11:00:00Z"
      ),
    ];
    const days = decorateWithRecovery(rebuildSchedule(events), recoveryByDate(events));
    expect(days.find((d) => d.date === "2026-07-26")!.advice).toBeUndefined();
  });
});
