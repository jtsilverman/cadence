// J12 — "My training has a shape: a block with weeks, a position in it, and
// numbers that grow at my pace. When the program says deload, the week the app
// drafts gets lighter." Suggest-only: position and proposals are data; my POST
// is the only writer.

import { describe, it, expect, beforeAll } from "vitest";
import { loadApp, type App, get, post, todayLocal, mondayOf, addDays } from "./harness";

let app: App;
let program: { GET: () => Promise<Response>; POST: (req: Request) => Promise<Response> };
let propose: { GET: () => Promise<Response> };

const today = todayLocal();
const thisMonday = mondayOf(today);

beforeAll(async () => {
  app = await loadApp();
  program = (await import("@/app/api/program/route")) as any;
  propose = (await import("@/app/api/schedule/propose/route")) as any;
});

describe("J12: a program gives the week a position", () => {
  it("setting a block program is accepted and comes back with my position in it", async () => {
    const res = await post(program as any, {
      title: "Fall strength block",
      per_week: 3,
      start_monday: thisMonday,
      weeks: [
        { kind: "build" },
        { kind: "deload", note: "breathe" },
        { kind: "build" },
        { kind: "peak" },
      ],
    });
    expect(res.status).toBe(200);

    const view = await get(program as any);
    expect(view.status).toBe(200);
    expect(view.body.program.title).toBe("Fall strength block");
    expect(view.body.position).toEqual({
      week_index: 1,
      total_weeks: 4,
      phase: "build",
      status: "on_track", // first week: nothing completed yet, nothing owed
    });
    // beyond the current week the program is skeleton only: kinds and notes
    for (const week of view.body.program.weeks) {
      expect(Object.keys(week).sort()).toEqual(
        week.note ? ["kind", "note"] : ["kind"]
      );
    }
  });

  it("one program per household: a new block replaces the old, no id juggling", async () => {
    const res = await post(program as any, {
      title: "Winter block",
      per_week: 3,
      start_monday: thisMonday,
      weeks: [{ kind: "build" }, { kind: "deload" }, { kind: "volume" }],
    });
    expect(res.status).toBe(200);
    const view = await get(program as any);
    expect(view.body.program.title).toBe("Winter block");
    expect(view.body.position.total_weeks).toBe(3);
  });

  it("a program that hasn't started says so instead of inventing a week", async () => {
    await post(program as any, {
      title: "Next month",
      per_week: 2,
      start_monday: addDays(thisMonday, 14),
      weeks: [{ kind: "build" }],
    });
    const view = await get(program as any);
    expect(view.body.position.week_index).toBe(0);
    expect(view.body.position.status).toBe("not_started");
    expect(view.body.position.phase).toBeNull();
  });

  it("a finished program reads complete, not week 99", async () => {
    await post(program as any, {
      title: "Last month",
      per_week: 2,
      start_monday: addDays(thisMonday, -28),
      weeks: [{ kind: "build" }, { kind: "peak" }],
    });
    const view = await get(program as any);
    expect(view.body.position.week_index).toBe(2);
    expect(view.body.position.status).toBe("complete");
    expect(view.body.position.phase).toBeNull();
  });

  it("the drafted week honors a deload: half the sessions, and it says why", async () => {
    // reinstate the current block: next Monday (the week propose composes) is
    // week 2 = deload
    await post(program as any, {
      title: "Winter block",
      per_week: 3,
      start_monday: thisMonday,
      weeks: [{ kind: "build" }, { kind: "deload" }, { kind: "volume" }],
    });
    await post(app.workouts, {
      title: "Squat Day",
      exercises: [{ name: "Back Squat", sets: 3, reps: 5, weight: 185, unit: "lb" }],
    });
    const res = await get(propose as any);
    expect(res.status).toBe(200);
    const workoutSlots = res.body.days
      .flatMap((d: any) => d.slots)
      .filter((s: any) => s.lane === "workout");
    expect(workoutSlots).toHaveLength(2); // ceil(3/2), not 3
    expect(res.body.reason.toLowerCase()).toContain("deload");
  });

  it("clearing the program returns the draft to plain cadence", async () => {
    const res = await post(program as any, { cleared: true });
    expect(res.status).toBe(200);
    const view = await get(program as any);
    expect(view.body.program).toBeNull();
  });

  it("an exercise can carry its own increment, and progression uses it", async () => {
    const saved = await post(app.workouts, {
      title: "Deadlift Day",
      exercises: [
        { name: "Deadlift", sets: 3, reps: 5, weight: 225, unit: "lb", increment: 10 },
      ],
    });
    expect(saved.status).toBe(200);
    const planId = saved.body.library_id;
    await post(app.log, {
      kind: "session", title: "Deadlift Day", session_kind: "structured",
      session_id: "sesh-dl-1", library_id: planId,
    });
    for (const i of [1, 2, 3]) {
      await post(app.log, {
        kind: "set", session_id: "sesh-dl-1", exercise: "Deadlift",
        set_index: i, reps: 5, weight: 225, unit: "lb",
      });
    }
    const view = await get(app.workoutById, { params: { id: planId } });
    const next = view.body.plan.exercises[0].next;
    expect(next.weight).toBe(235); // 225 + my 10, not the flat 5
  });

  it("a slot can be marked high priority and it survives the round trip", async () => {
    const res = await post(app.schedule, {
      days: [
        {
          date: today,
          slots: [
            { lane: "workout", title: "Heavy Squat", priority: "high" },
            { lane: "workout", title: "Easy Run" },
          ],
        },
      ],
    });
    expect(res.status).toBe(200);
    const day = res.body.days.find((d: any) => d.date === today);
    expect(day.slots[0].priority).toBe("high");
    expect(day.slots[1].priority).toBeUndefined();
  });

  it("hostile: junk programs and junk priorities are refused with reasons", async () => {
    const bads = [
      { per_week: 3, start_monday: thisMonday, weeks: [{ kind: "build" }] }, // no title
      { title: "x", per_week: 0, start_monday: thisMonday, weeks: [{ kind: "build" }] },
      { title: "x", per_week: 9, start_monday: thisMonday, weeks: [{ kind: "build" }] },
      { title: "x", per_week: 3, start_monday: addDays(thisMonday, 1), weeks: [{ kind: "build" }] }, // not a Monday
      { title: "x", per_week: 3, start_monday: thisMonday, weeks: [] },
      { title: "x", per_week: 3, start_monday: thisMonday, weeks: [{ kind: "cruise" }] },
      { title: "x", per_week: 3, start_monday: thisMonday, weeks: Array(53).fill({ kind: "build" }) },
    ];
    for (const body of bads) {
      const res = await post(program as any, body);
      expect(res.status).toBe(422);
      expect(res.body.reason).toBeTruthy();
    }
    const badSlot = await post(app.schedule, {
      days: [{ date: today, slots: [{ lane: "workout", title: "X", priority: "urgent" }] }],
    });
    expect(badSlot.status).toBe(422);
  });
});
