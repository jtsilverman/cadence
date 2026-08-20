// J6 — "I train with a plan; the app watches my numbers and nudges the next
// step; when I say no it respects it until something changes."

import { describe, it, expect, beforeAll } from "vitest";
import { loadApp, type App, get, post } from "./harness";

let app: App;
let planId: string;

beforeAll(async () => {
  app = await loadApp();
  const saved = await post(app.workouts, {
    title: "Push Day",
    exercises: [{ name: "Bench Press", sets: 3, reps: 8, weight: 135, unit: "lb" }],
  });
  planId = saved.body.library_id;
});

const workoutView = () => get(app.workoutById, { params: { id: planId } });

describe("J6: progression proposes, I dispose", () => {
  it("after a full session at the plan's weight, the app proposes the next load with a why", async () => {
    await post(app.log, {
      kind: "session", title: "Push Day", session_kind: "structured",
      session_id: "sesh-1", library_id: planId,
    });
    for (const i of [1, 2, 3]) {
      const res = await post(app.log, {
        kind: "set", session_id: "sesh-1", exercise: "Bench Press",
        set_index: i, reps: 8, weight: 135, unit: "lb",
      });
      expect(res.status).toBe(200);
    }
    const view = await workoutView();
    expect(view.status).toBe(200);
    const target = view.body.plan.exercises.find((e: any) => e.name === "Bench Press")?.next;
    expect(target).toBeDefined();
    expect(target.weight).toBeGreaterThan(135); // it asks for more
    expect(target.reason?.length).toBeGreaterThan(10); // and says why
    expect(target.suggestion_id).toBeTruthy(); // and it's on the record
  });

  it("reading the plan twice doesn't spam the suggestion log", async () => {
    const a = await workoutView();
    const b = await workoutView();
    const nextOf = (r: any) => r.body.plan.exercises[0].next;
    expect(nextOf(a).suggestion_id).toBe(nextOf(b).suggestion_id);
  });

  it("dismissing the nudge silences it", async () => {
    const view = await workoutView();
    const sid = view.body.plan.exercises[0].next.suggestion_id;
    const res = await post(app.suggestion, { suggestion_id: sid, outcome: "dismissed" });
    expect(res.status).toBe(200);
    const after = await workoutView();
    expect(after.body.plan.exercises[0].next?.suggestion_id).toBeUndefined();
  });

  it("a new heavier session earns a fresh nudge despite the old dismissal", async () => {
    await post(app.log, {
      kind: "session", title: "Push Day", session_kind: "structured",
      session_id: "sesh-2", library_id: planId,
    });
    for (const i of [1, 2, 3]) {
      await post(app.log, {
        kind: "set", session_id: "sesh-2", exercise: "Bench Press",
        set_index: i, reps: 8, weight: 140, unit: "lb",
      });
    }
    const view = await workoutView();
    const target = view.body.plan.exercises[0].next;
    expect(target?.suggestion_id).toBeTruthy(); // new evidence reopens the conversation
    expect(target.weight).toBeGreaterThan(140);
  });
});
