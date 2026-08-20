// J13 — "A wrong tap isn't forever: I take back a mis-logged done, a fat-
// fingered skip, a phantom cook — and the whole app forgets it. And trust is
// mine to grant: I can see and set how much rope each kind of suggestion
// gets." Undo trail + autonomy rungs (UX.md:70, UX.md:77).

import { describe, it, expect, beforeAll } from "vitest";
import { loadApp, type App, get, post, todayLocal } from "./harness";

let app: App;
let retract: { POST: (req: Request) => Promise<Response> };
let autonomy: { GET: () => Promise<Response>; POST: (req: Request) => Promise<Response> };

const today = todayLocal();

let workoutSlotId: string;
let mealSlotId: string;
let chiliId: string;

const dayOf = (days: any[], date: string) => days.find((d: any) => d.date === date);
const slotOf = (days: any[], id: string) =>
  dayOf(days, today).slots.find((s: any) => s.slot_id === id);

beforeAll(async () => {
  app = await loadApp();
  retract = (await import("@/app/api/retract/route")) as any;
  autonomy = (await import("@/app/api/autonomy/route")) as any;

  const chili = await post(app.recipes, {
    source_url: "https://example.com/undo-chili",
    title: "Undo Chili",
    servings: 4,
    total_minutes: 30,
    ingredients: [{ name: "beans", qty: 2, unit: "can", confidence: "high" }],
    steps: ["Simmer."],
    confidence: { title: "high", servings: "high", total_minutes: "high" },
    nutrition: { calories: 600, protein_g: 30, carbs_g: 50, fat_g: 20, per_serving: true, confidence: "high" },
  });
  chiliId = chili.body.library_id;
  await post(app.goals, { goal_id: "g-undo-nut", title: "2000", kind: "nutrition", daily_calories: 2000 });
  await post(app.pantry, { name: "beans", qty: 5, unit: "can" });

  const plan = await post(app.schedule, {
    days: [
      {
        date: today,
        slots: [
          { lane: "workout", title: "Push Day" },
          { lane: "meal", title: "Undo Chili", library_id: chiliId },
        ],
      },
    ],
  });
  workoutSlotId = dayOf(plan.body.days, today).slots[0].slot_id;
  mealSlotId = dayOf(plan.body.days, today).slots[1].slot_id;
});

describe("J13: undo makes taps safe, rungs make trust explicit", () => {
  it("logging returns the handle I'd need to take it back", async () => {
    const res = await post(app.log, {
      kind: "session", title: "Push Day", slot_id: workoutSlotId,
    });
    expect(res.status).toBe(200);
    expect(res.body.event_id).toBeTruthy();
    expect(slotOf(res.body.days, workoutSlotId).status).toBe("done");
  });

  it("retracting one of two logs keeps the slot done — only the last retraction reverts it", async () => {
    const misTap = await post(app.log, {
      kind: "session", title: "Push Day", slot_id: workoutSlotId,
    });
    const res = await post(retract as any, { event_id: misTap.body.event_id });
    expect(res.status).toBe(200);
    // the previous test's log still marks it done
    expect(slotOf(res.body.days, workoutSlotId).status).toBe("done");
  });

  it("a slot returns to planned when its last remaining log is retracted", async () => {
    // fresh slot state: retract every session log by walking receipts
    // (this story logs exactly twice on workoutSlotId; one was retracted above)
    const { readEvents } = await import("@/lib/events");
    const { getDb } = await import("@/lib/db");
    const events = await readEvents(getDb(), "hh-jake", { type: "SessionLogged" });
    const remaining = events.filter(
      (e: any) => e.payload.slot_id === workoutSlotId
    );
    let last: any;
    for (const e of remaining) {
      last = await post(retract as any, { event_id: e.event_id });
      expect(last.status).toBe(200);
    }
    expect(slotOf(last.body.days, workoutSlotId).status).toBe("planned");

    const history = await get(app.history, { path: "/api/history?kind=workouts" });
    expect(JSON.stringify(history.body)).not.toContain("Push Day");
  });

  it("retracting a fat-fingered skip also silences its repair nag", async () => {
    const skip = await post(app.log, { kind: "skip", slot_id: workoutSlotId, lane: "workout" });
    expect(slotOf(skip.body.days, workoutSlotId).status).toBe("skipped");
    const nags = (skip.body.days as any[]).flatMap((d) => d.repair_proposals ?? [])
      .filter((p: any) => p.missed_slot_id === workoutSlotId);
    expect(nags.length).toBeGreaterThan(0);

    const res = await post(retract as any, { event_id: skip.body.event_id });
    expect(res.status).toBe(200);
    expect(slotOf(res.body.days, workoutSlotId).status).toBe("planned");
    const after = (res.body.days as any[]).flatMap((d) => d.repair_proposals ?? [])
      .filter((p: any) => p.missed_slot_id === workoutSlotId);
    expect(after).toHaveLength(0);
  });

  it("retracting a phantom cook restores the pantry, the budget, and the slot", async () => {
    const pantryBefore = await get(app.pantry);
    const beansBefore = pantryBefore.body.items.find((i: any) => i.name === "beans");
    expect(beansBefore.qty).toBe(5);
    expect(beansBefore.weekly_use).toBeUndefined(); // nothing cooked yet

    const cook = await post(app.cook, { library_id: chiliId });
    expect(cook.status).toBe(200);
    expect(cook.body.event_id).toBeTruthy();

    const during = await get(app.schedule);
    expect(dayOf(during.body.days, today).budget.consumed).toBe(600);
    expect(slotOf(during.body.days, mealSlotId).status).toBe("done");
    const pantryDuring = await get(app.pantry);
    const beansDuring = pantryDuring.body.items.find((i: any) => i.name === "beans");
    expect(beansDuring.qty).toBe(3);
    expect(beansDuring.cooks_left).toBeDefined(); // the cook taught it the per-cook burn

    const res = await post(retract as any, { event_id: cook.body.event_id });
    expect(res.status).toBe(200);
    expect(dayOf(res.body.days, today).budget.consumed).toBe(0);
    expect(slotOf(res.body.days, mealSlotId).status).toBe("planned");
    const pantryAfter = await get(app.pantry);
    const beansAfter = pantryAfter.body.items.find((i: any) => i.name === "beans");
    expect(beansAfter.qty).toBe(5);
    // AC2: cooksLeft/weekly_use forget the cook too, not just the qty fold —
    // with its only cook retracted, the burn-rate fields return to unknown
    expect(beansAfter.weekly_use).toBeUndefined();
    expect(beansAfter.cooks_left).toBeUndefined();
    expect(beansBefore.cooks_left).toBeUndefined();
  });

  it("retracting twice is safe, not an error", async () => {
    const log = await post(app.log, { kind: "journal", text: "double-retract me" });
    const once = await post(retract as any, { event_id: log.body.event_id });
    expect(once.status).toBe(200);
    const twice = await post(retract as any, { event_id: log.body.event_id });
    expect(twice.status).toBe(200);
    const history = await get(app.history, { path: "/api/history?kind=journal" });
    expect(JSON.stringify(history.body)).not.toContain("double-retract me");
  });

  it("hostile: unknown ids 404, non-log events and garbage are refused", async () => {
    expect((await post(retract as any, { event_id: "ev-never-existed" })).status).toBe(404);
    expect((await post(retract as any, {})).status).toBe(422);
    expect((await post(retract as any, "not json at all")).status).toBe(400);

    // a real event that is NOT a log: the GoalSet from setup
    const { readEvents } = await import("@/lib/events");
    const { getDb } = await import("@/lib/db");
    const goals = await readEvents(getDb(), "hh-jake", { type: "GoalSet" });
    expect(goals.length).toBeGreaterThan(0);
    const res = await post(retract as any, { event_id: goals[0].event_id });
    expect(res.status).toBe(422);
  });

  it("trust starts at one-tap for every kind, with the evidence beside it", async () => {
    const res = await get(autonomy as any);
    expect(res.status).toBe(200);
    for (const kind of ["add_to_list", "ease_workout", "next_target", "repair", "plan_draft", "nutrition_adjust"]) {
      const state = res.body.autonomy[kind];
      expect(state.rung).toBe("one_tap");
      expect(typeof state.accepted).toBe("number");
      expect(typeof state.dismissed).toBe("number");
    }
  });

  it("I can climb a rung for one kind without touching the others", async () => {
    const res = await post(autonomy as any, { kind: "repair", rung: "auto" });
    expect(res.status).toBe(200);
    const view = await get(autonomy as any);
    expect(view.body.autonomy.repair.rung).toBe("auto");
    expect(view.body.autonomy.next_target.rung).toBe("one_tap");
  });

  it("hostile: junk kinds and rungs are refused", async () => {
    expect((await post(autonomy as any, { kind: "world_domination", rung: "auto" })).status).toBe(422);
    expect((await post(autonomy as any, { kind: "repair", rung: "sudo" })).status).toBe(422);
    expect((await post(autonomy as any, { kind: "repair" })).status).toBe(422);
  });
});
