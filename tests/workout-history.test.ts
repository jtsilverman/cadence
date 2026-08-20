import { describe, expect, it } from "vitest";
import type { EventEnvelope, SetLoggedPayload, WorkoutPlan } from "@/lib/contracts";
import { SET_LOGGED } from "@/lib/contracts";
import { exerciseHistory, nextTargets } from "@/lib/workouts";

const HH = "hh-test";

let n = 0;
function setEvent(payload: SetLoggedPayload, ts: string): EventEnvelope {
  n += 1;
  return {
    event_id: `e${String(n).padStart(3, "0")}`,
    household_id: HH,
    type: SET_LOGGED,
    ts,
    source: "web",
    payload,
    schema_version: 1,
    precision: "exact",
  };
}

const set = (
  session_id: string,
  exercise: string,
  set_index: number,
  reps: number,
  weight?: number,
  unit?: string
): SetLoggedPayload => ({
  session_id,
  exercise,
  set_index,
  reps,
  ...(weight !== undefined ? { weight, unit } : {}),
});

const PLAN: WorkoutPlan = {
  plan_version: 1,
  kind: "workout",
  title: "Squat Day",
  exercises: [
    { name: "Back Squat", sets: 3, reps: 8, weight: 135, unit: "lb" },
    { name: "Plank", sets: 3, reps: 1 },
  ],
};

describe("exerciseHistory", () => {
  it("groups sets by session, normalizes names, keeps chronological order", () => {
    const events = [
      setEvent(set("s1", "Back Squat", 1, 8, 135, "lb"), "2026-07-20T22:00:00Z"),
      setEvent(set("s1", "Back Squat", 2, 8, 135, "lb"), "2026-07-20T22:05:00Z"),
      setEvent(set("s2", " back squat ", 1, 8, 140, "lb"), "2026-07-23T22:00:00Z"),
    ];
    const history = exerciseHistory(events);
    const sessions = history.get("back squat")!;
    expect(sessions).toHaveLength(2);
    expect(sessions[0].session_id).toBe("s1");
    expect(sessions[0].sets.map((s) => s.set_index)).toEqual([1, 2]);
    expect(sessions[1].sets[0].weight).toBe(140);
  });

  it("dates are household-local (an 11pm ET set stays on that ET day)", () => {
    // 03:00Z on the 21st = 11:00pm ET on the 20th
    const events = [setEvent(set("s1", "Deadlift", 1, 5, 225, "lb"), "2026-07-21T03:00:00Z")];
    expect(exerciseHistory(events).get("deadlift")![0].date).toBe("2026-07-20");
  });
});

describe("nextTargets", () => {
  const target = (events: EventEnvelope[]) => nextTargets(PLAN, exerciseHistory(events));

  it("all sets at top weight hitting target reps progresses +5 lb", () => {
    const events = [
      setEvent(set("s1", "Back Squat", 1, 8, 95, "lb"), "2026-07-20T22:00:00Z"), // warm-up, ignored
      setEvent(set("s1", "Back Squat", 2, 8, 135, "lb"), "2026-07-20T22:05:00Z"),
      setEvent(set("s1", "Back Squat", 3, 8, 135, "lb"), "2026-07-20T22:10:00Z"),
      setEvent(set("s1", "Back Squat", 4, 8, 135, "lb"), "2026-07-20T22:15:00Z"),
    ];
    const next = target(events).get("back squat");
    expect(next).toMatchObject({ weight: 140, unit: "lb" });
    expect(next!.reason).toMatch(/135/);
  });

  it("kg progresses +2.5", () => {
    const events = [
      setEvent(set("s1", "Back Squat", 1, 8, 60, "kg"), "2026-07-20T22:00:00Z"),
    ];
    expect(target(events).get("back squat")).toMatchObject({ weight: 62.5, unit: "kg" });
  });

  it("a short set at top weight repeats the weight", () => {
    const events = [
      setEvent(set("s1", "Back Squat", 1, 8, 135, "lb"), "2026-07-20T22:00:00Z"),
      setEvent(set("s1", "Back Squat", 2, 6, 135, "lb"), "2026-07-20T22:05:00Z"), // short of 8
    ];
    const next = target(events).get("back squat");
    expect(next).toMatchObject({ weight: 135, unit: "lb" });
    expect(next!.reason).toMatch(/repeat/i);
  });

  it("only the MOST RECENT session governs", () => {
    const events = [
      setEvent(set("s1", "Back Squat", 1, 8, 135, "lb"), "2026-07-18T22:00:00Z"),
      setEvent(set("s2", "Back Squat", 1, 6, 140, "lb"), "2026-07-21T22:00:00Z"), // short → repeat 140
    ];
    expect(target(events).get("back squat")).toMatchObject({ weight: 140, unit: "lb" });
  });

  it("mixed units in one session compare by converted magnitude, not raw numbers", () => {
    // 100 kg ≈ 220 lb is the true top set, despite 105 > 100 raw
    const events = [
      setEvent(set("s1", "Back Squat", 1, 8, 105, "lb"), "2026-07-20T22:00:00Z"),
      setEvent(set("s1", "Back Squat", 2, 8, 100, "kg"), "2026-07-20T22:05:00Z"),
    ];
    expect(target(events).get("back squat")).toMatchObject({ weight: 102.5, unit: "kg" });
  });

  it("no weighted history and weightless exercises get no target", () => {
    const events = [
      setEvent(set("s1", "Back Squat", 1, 8), "2026-07-20T22:00:00Z"), // bodyweight set
    ];
    const next = target(events);
    expect(next.has("back squat")).toBe(false);
    expect(next.has("plank")).toBe(false);
  });

  it("empty history means no targets at all (cold-start honesty)", () => {
    expect(target([]).size).toBe(0);
  });
});
