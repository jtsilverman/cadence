import { describe, expect, it } from "vitest";
import type { EventEnvelope, GoalSetPayload } from "@/lib/contracts";
import { SESSION_LOGGED } from "@/lib/contracts";
import type { WorkoutSummary } from "@/lib/library";
import { proposeWorkoutWeek } from "@/lib/goals";

const HH = "hh-test";

let n = 0;
function sessionEv(ts: string, library_id?: string): EventEnvelope {
  n += 1;
  return {
    event_id: `e${String(n).padStart(3, "0")}`,
    household_id: HH,
    type: SESSION_LOGGED,
    ts,
    source: "web",
    payload: { title: "w", kind: "structured", ...(library_id ? { library_id } : {}) },
    schema_version: 2,
    precision: "estimated",
  };
}

const workout = (id: string, title: string): WorkoutSummary => ({
  id,
  title,
  exercise_count: 3,
  created_at: "2026-07-01T00:00:00Z",
});

const cadence = (per_week: number): GoalSetPayload => ({
  goal_id: "g1",
  title: `Train ${per_week}x`,
  kind: "cadence",
  per_week,
});

// today Sunday 2026-07-26 → next Monday-start week is 2026-07-27..08-02
const TODAY = "2026-07-26";

describe("proposeWorkoutWeek", () => {
  it("no cadence goal or no workouts → empty proposal with an honest reason", () => {
    const a = proposeWorkoutWeek([], [workout("A", "Squat Day")], [], TODAY);
    expect(a.days).toEqual([]);
    expect(a.reason).toMatch(/cadence goal/i);

    const b = proposeWorkoutWeek([cadence(3)], [], [], TODAY);
    expect(b.days).toEqual([]);
    expect(b.reason).toMatch(/workout/i);
  });

  it("spreads N slots across next week Mon/Wed/Fri first", () => {
    const { days } = proposeWorkoutWeek(
      [cadence(3)],
      [workout("A", "Squat Day"), workout("B", "Pull Day"), workout("C", "Push Day")],
      [],
      TODAY
    );
    expect(days.map((d) => d.date)).toEqual(["2026-07-27", "2026-07-29", "2026-07-31"]);
    for (const day of days) {
      expect(day.slots).toHaveLength(1);
      expect(day.slots[0].lane).toBe("workout");
      expect(day.slots[0].library_id).toBeDefined();
    }
  });

  it("rotates least-recently-done first; never-done templates lead", () => {
    const events = [
      sessionEv("2026-07-24T22:00:00Z", "A"), // A done recently
      sessionEv("2026-07-10T22:00:00Z", "C"), // C done long ago
    ];
    const { days } = proposeWorkoutWeek(
      [cadence(3)],
      [workout("A", "Squat Day"), workout("B", "Pull Day"), workout("C", "Push Day")],
      events,
      TODAY
    );
    // B never done → first; then C (older); then A (most recent)
    expect(days.map((d) => d.slots[0].library_id)).toEqual(["B", "C", "A"]);
  });

  it("more slots than templates cycles the rotation", () => {
    const { days } = proposeWorkoutWeek(
      [cadence(3)],
      [workout("A", "Squat Day"), workout("B", "Pull Day")],
      [],
      TODAY
    );
    expect(days.map((d) => d.slots[0].library_id)).toEqual(["A", "B", "A"]);
  });

  it("is deterministic: same inputs, same output", () => {
    const goals = [cadence(4)];
    const workouts = [workout("A", "Squat Day"), workout("B", "Pull Day")];
    const events = [sessionEv("2026-07-20T22:00:00Z", "B")];
    const one = proposeWorkoutWeek(goals, workouts, events, TODAY);
    const two = proposeWorkoutWeek(goals, workouts, events, TODAY);
    expect(two).toEqual(one);
    expect(one.days.map((d) => d.date)).toEqual([
      "2026-07-27",
      "2026-07-29",
      "2026-07-31",
      "2026-08-01",
    ]);
  });
});
