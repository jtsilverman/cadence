import { createClient, type Client } from "@libsql/client";
import { beforeEach, describe, expect, it } from "vitest";
import type { EventEnvelope, SessionLoggedPayload, SetLoggedPayload } from "@/lib/contracts";
import { GOAL_SET, SESSION_LOGGED, SET_LOGGED } from "@/lib/contracts";
import { migrate } from "@/lib/db";
import { readEvents } from "@/lib/events";
import { activeGoals, goalProgress, parseGoal, proposeWorkoutWeek, recordGoal } from "@/lib/goals";
import { localDate, mondayOf } from "@/lib/dates";

const HH = "hh-test";

let n = 0;
function ev(type: string, ts: string, payload: unknown): EventEnvelope {
  n += 1;
  return {
    event_id: `e${String(n).padStart(3, "0")}`,
    household_id: HH,
    type,
    ts,
    source: "web",
    payload,
    schema_version: 1,
    precision: "exact",
  };
}

const setEv = (ts: string, p: Partial<SetLoggedPayload> & { exercise: string }) =>
  ev(SET_LOGGED, ts, { session_id: "s1", set_index: 1, reps: 1, ...p });

const sessionEv = (ts: string, p?: Partial<SessionLoggedPayload>) =>
  ev(SESSION_LOGGED, ts, { title: "workout", kind: "loose", ...p });

describe("parseGoal", () => {
  it("accepts a strength goal", () => {
    const parsed = parseGoal({
      kind: "strength",
      title: "Squat 315",
      exercise: "Back Squat",
      target_weight: 315,
      unit: "lb",
    });
    expect(parsed.ok).toBe(true);
  });

  it("accepts a cadence goal", () => {
    expect(parseGoal({ kind: "cadence", title: "Train 3x", per_week: 3 }).ok).toBe(true);
  });

  it.each([
    ["strength without exercise", { kind: "strength", title: "x", target_weight: 315, unit: "lb" }],
    ["strength without unit", { kind: "strength", title: "x", exercise: "squat", target_weight: 315 }],
    ["cadence without per_week", { kind: "cadence", title: "x" }],
    ["cadence fractional per_week", { kind: "cadence", title: "x", per_week: 2.5 }],
    ["no title", { kind: "custom", title: "  " }],
    ["bad kind", { kind: "speed", title: "x" }],
  ])("rejects %s", (_l, body) => {
    expect(parseGoal(body as Record<string, unknown>).ok).toBe(false);
  });
});

describe("goals fold", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });

  it("latest event per goal_id wins and cleared removes", async () => {
    const first = parseGoal({ kind: "cadence", title: "Train 3x", per_week: 3 });
    if (!first.ok) throw new Error("parse");
    const { goal_id } = await recordGoal(db, HH, first.goal);

    const revised = parseGoal({ kind: "cadence", title: "Train 4x", per_week: 4, goal_id });
    if (!revised.ok) throw new Error("parse");
    await recordGoal(db, HH, revised.goal);

    let goals = activeGoals(await readEvents(db, HH));
    expect(goals).toHaveLength(1);
    expect(goals[0]).toMatchObject({ goal_id, title: "Train 4x", per_week: 4 });

    const cleared = parseGoal({ kind: "cadence", title: "Train 4x", per_week: 4, goal_id, cleared: true });
    if (!cleared.ok) throw new Error("parse");
    await recordGoal(db, HH, cleared.goal);
    goals = activeGoals(await readEvents(db, HH));
    expect(goals).toHaveLength(0);

    expect(await readEvents(db, HH, { type: GOAL_SET })).toHaveLength(3); // append-only
  });
});

describe("goalProgress", () => {
  it("strength: best set at target reps vs target, unit-converted", () => {
    const goal = {
      goal_id: "g1",
      title: "Squat 315",
      kind: "strength" as const,
      exercise: "Back Squat",
      target_weight: 315,
      unit: "lb",
      target_reps: 1,
    };
    const events = [
      setEv("2026-07-20T22:00:00Z", { exercise: "Back Squat", reps: 5, weight: 100, unit: "kg" }),
      setEv("2026-07-22T22:00:00Z", { exercise: "Back Squat", reps: 1, weight: 245, unit: "lb" }),
    ];
    const progress = goalProgress(goal, events, "2026-07-26");
    // 100 kg ≈ 220.46 lb < 245 lb — the lb set is the best
    expect(progress).toMatchObject({ target_weight: 315 });
    expect(progress.best).toMatchObject({ weight: 245, unit: "lb" });
    expect(progress.pct).toBeCloseTo(245 / 315, 3);
  });

  it("strength with no qualifying set is honest: null best, null pct", () => {
    const goal = {
      goal_id: "g1",
      title: "Squat 315",
      kind: "strength" as const,
      exercise: "Back Squat",
      target_weight: 315,
      unit: "lb",
    };
    const progress = goalProgress(goal, [], "2026-07-26");
    expect(progress.best).toBeNull();
    expect(progress.pct).toBeNull();
  });

  it("cadence: weekly counts dedupe whoop revisions by external_id, SetLogged never counts", () => {
    const goal = { goal_id: "g2", title: "Train 3x", kind: "cadence" as const, per_week: 3 };
    // today 2026-07-26 (Sunday); this Monday-start week began 2026-07-20
    const events = [
      sessionEv("2026-07-21T22:00:00Z"), // manual, this week
      sessionEv("2026-07-22T22:00:00Z", { external_id: "whoop:workout:a" }), // device
      sessionEv("2026-07-22T22:00:00Z", { external_id: "whoop:workout:a" }), // revision — once
      setEv("2026-07-23T22:00:00Z", { exercise: "squat" }), // never counts
      sessionEv("2026-07-15T22:00:00Z"), // prior week
    ];
    const progress = goalProgress(goal, events, "2026-07-26");
    expect(progress.this_week).toBe(2);
    expect(progress.per_week).toBe(3);
    const weeks = progress.weeks!;
    expect(weeks).toHaveLength(4);
    // prior week (starting 2026-07-13) holds exactly 1
    expect(weeks[weeks.length - 1]).toMatchObject({ week: "2026-07-20", count: 2 });
    expect(weeks[weeks.length - 2]).toMatchObject({ week: "2026-07-13", count: 1 });
  });
});

// spec nutrition AC4: the nutrition goal kind.
describe("parseGoal nutrition", () => {
  it("accepts a nutrition goal with a daily calorie target", () => {
    const r = parseGoal({ title: "Cut", kind: "nutrition", daily_calories: 2000, protein_g: 150 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.goal.kind).toBe("nutrition");
      expect(r.goal.daily_calories).toBe(2000);
      expect(r.goal.protein_g).toBe(150);
    }
  });

  it.each([
    ["missing daily_calories", {}],
    ["zero", { daily_calories: 0 }],
    ["negative", { daily_calories: -100 }],
    ["string", { daily_calories: "2000" }],
    ["infinite", { daily_calories: Infinity }],
    ["boolean", { daily_calories: true }],
  ])("rejects %s", (_name, extra) => {
    const r = parseGoal({ title: "Bad", kind: "nutrition", ...extra });
    expect(r.ok).toBe(false);
  });

  it("rejects a non-numeric protein_g rather than storing junk", () => {
    const r = parseGoal({ title: "Cut", kind: "nutrition", daily_calories: 2000, protein_g: "lots" });
    expect(r.ok).toBe(false);
  });
});

// spec program-engine AC3: only a deload week overrides the cadence count.
describe("proposeWorkoutWeek with a program", () => {
  const workouts = [{ id: "w1", title: "Squat Day" }];
  const cadence = { goal_id: "g", title: "5x", kind: "cadence" as const, per_week: 5 };
  const program = (kinds: string[]) => ({
    title: "Block",
    per_week: 3,
    start_monday: mondayOf(localDate(new Date())),
    weeks: kinds.map((kind) => ({ kind })),
  });

  it("a non-deload program week keeps the cadence goal's count", () => {
    const proposal = proposeWorkoutWeek(
      [cadence], workouts, [], localDate(new Date()),
      program(["build", "build", "build"]) as never
    );
    expect(proposal.days).toHaveLength(5);
  });

  it("a program without a cadence goal still composes at its own per_week", () => {
    const proposal = proposeWorkoutWeek(
      [], workouts, [], localDate(new Date()),
      program(["build", "build", "build"]) as never
    );
    expect(proposal.days).toHaveLength(3);
  });
});
