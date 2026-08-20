// J9 — "I set a training goal; the app drafts my week and tracks whether I'm
// living it." Suggest-only: the draft is data until I apply it.

import { describe, it, expect, beforeAll } from "vitest";
import { loadApp, type App, get, post } from "./harness";

let app: App;
let propose: { GET: () => Promise<Response> };

beforeAll(async () => {
  app = await loadApp();
  propose = (await import("@/app/api/schedule/propose/route")) as any;
  await post(app.workouts, {
    title: "Push Day",
    exercises: [{ name: "Bench Press", sets: 3, reps: 8, weight: 135, unit: "lb" }],
  });
  await post(app.workouts, {
    title: "Pull Day",
    exercises: [{ name: "Row", sets: 3, reps: 10, weight: 95, unit: "lb" }],
  });
});

describe("J9: goals drive the week", () => {
  it("a cadence goal is accepted and visible", async () => {
    const res = await post(app.goals, { title: "Train 3x a week", kind: "cadence", per_week: 3 });
    expect(res.status).toBe(200);
    const list = await get(app.goals);
    expect(JSON.stringify(list.body)).toContain("Train 3x a week");
  });

  it("the proposed week honors my cadence and my templates, and touches nothing", async () => {
    const before = await get(app.schedule);
    const res = await get(propose as any);
    expect(res.status).toBe(200);
    const days = res.body.days;
    expect(days).toBeDefined();
    const workoutSlots = days.flatMap((d: any) => d.slots).filter((s: any) => s.lane === "workout");
    expect(workoutSlots).toHaveLength(3); // per_week honored
    const titles = workoutSlots.map((s: any) => s.title);
    expect(titles).toContain("Push Day"); // drawn from MY library
    const after = await get(app.schedule);
    expect(after.body.days).toEqual(before.body.days); // proposal wrote nothing
  });

  it("applying the proposal is my move, and then it's my plan", async () => {
    const proposal = await get(propose as any);
    const res = await post(app.schedule, { days: proposal.body.days });
    expect(res.status).toBe(200);
    const workoutSlots = res.body.days
      .flatMap((d: any) => d.slots)
      .filter((s: any) => s.lane === "workout");
    expect(workoutSlots).toHaveLength(3);
    for (const s of workoutSlots) expect(s.status).toBe("planned");
  });

  it("a nonsense goal is refused with a reason", async () => {
    const res = await post(app.goals, { title: "Vibes", kind: "cardio" });
    expect(res.status).toBe(422);
    expect(String(res.body.reason)).toContain("kind");
  });
});
