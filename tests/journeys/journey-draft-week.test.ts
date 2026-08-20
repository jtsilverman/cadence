// J14 — "Monday morning the app hands me next week, already good: my recipes
// in rotation, my program's next leg, sleep and headspace on the calendar. I
// swap one dinner, approve, done. The draft stays fresh on its own and never
// nags twice." The living 4-lane draft (UX.md:43/47/86).

import { describe, it, expect, beforeAll } from "vitest";
import { loadApp, type App, get, post, todayLocal, mondayOf, addDays } from "./harness";

let app: App;
let draft: { GET: () => Promise<Response> };
let exchange: { POST: (req: Request) => Promise<Response> };

const today = todayLocal();
const nextMonday = addDays(mondayOf(today), 7);
const nextSunday = addDays(nextMonday, 6);

const recipeBody = (title: string, url: string, calories: number) => ({
  source_url: url,
  title,
  servings: 2,
  total_minutes: 20,
  ingredients: [{ name: "stuff", qty: 1, unit: "lb", confidence: "high" }],
  steps: ["Cook."],
  confidence: { title: "high", servings: "high", total_minutes: "high" },
  nutrition: { calories, protein_g: 20, carbs_g: 30, fat_g: 10, per_serving: true, confidence: "high" },
});

let titles: string[];
let chiliId: string;

beforeAll(async () => {
  app = await loadApp();
  draft = (await import("@/app/api/plan/draft/route")) as any;
  exchange = (await import("@/app/api/plan/exchange/route")) as any;

  titles = ["Draft Chili", "Draft Curry", "Draft Tacos"];
  const chili = await post(app.recipes, recipeBody("Draft Chili", "https://example.com/d-chili", 550));
  chiliId = chili.body.library_id;
  await post(app.recipes, recipeBody("Draft Curry", "https://example.com/d-curry", 700));
  await post(app.recipes, recipeBody("Draft Tacos", "https://example.com/d-tacos", 450));
  await post(app.workouts, {
    title: "Squat Day",
    exercises: [{ name: "Back Squat", sets: 3, reps: 5, weight: 185, unit: "lb" }],
  });
  await post(app.goals, { goal_id: "g-cad", title: "2x", kind: "cadence", per_week: 2 });
  await post(app.goals, { goal_id: "g-nut", title: "2000", kind: "nutrition", daily_calories: 2000 });
});

describe("J14: the week arrives drafted", () => {
  let firstDraftId: string;
  let draftDays: any[];

  it("the draft covers next week in all four lanes, drawn from my library", async () => {
    const res = await get(draft as any);
    expect(res.status).toBe(200);
    expect(res.body.suggestion_id).toBeTruthy();
    firstDraftId = res.body.suggestion_id;
    draftDays = res.body.draft.days;

    for (const day of draftDays) {
      expect(day.date >= nextMonday && day.date <= nextSunday).toBe(true);
    }
    const slots = draftDays.flatMap((d: any) => d.slots);
    const meals = slots.filter((s: any) => s.lane === "meal");
    expect(meals).toHaveLength(7); // one dinner per day
    for (const m of meals) expect(titles).toContain(m.title);
    // rotation, not repetition: with 3 recipes no two consecutive days match
    const mealByDate = draftDays
      .filter((d: any) => d.slots.some((s: any) => s.lane === "meal"))
      .map((d: any) => d.slots.find((s: any) => s.lane === "meal").title);
    for (let i = 1; i < mealByDate.length; i++) {
      expect(mealByDate[i]).not.toBe(mealByDate[i - 1]);
    }
    expect(slots.filter((s: any) => s.lane === "workout")).toHaveLength(2); // my cadence
    expect(slots.filter((s: any) => s.lane === "sleep")).toHaveLength(7);
    expect(slots.filter((s: any) => s.lane === "mind")).toHaveLength(2);
    // proposal only: nothing landed on the real schedule
    const schedule = await get(app.schedule);
    expect(schedule.body.days.some((d: any) => d.date >= nextMonday)).toBe(false);
  });

  it("reading the draft again is free: same pair, same bytes", async () => {
    const res = await get(draft as any);
    expect(res.body.suggestion_id).toBe(firstDraftId);
    expect(res.body.draft.days).toEqual(draftDays);
  });

  it("the draft is alive: a new recipe reshuffles it and retires the stale pair", async () => {
    // saving a closer-fit recipe changes the candidate order → the draft drifts
    titles.push("Draft Feast");
    await post(app.recipes, recipeBody("Draft Feast", "https://example.com/d-feast", 1950));

    const res = await get(draft as any);
    expect(res.body.suggestion_id).toBeTruthy();
    expect(res.body.suggestion_id).not.toBe(firstDraftId);

    // the old pair is superseded, not dangling open and not "dismissed"
    const { readSuggestionState } = await import("@/lib/suggestions");
    const { getDb } = await import("@/lib/db");
    const state = await readSuggestionState(getDb(), "hh-jake");
    expect(state.open.filter((p: any) => p.kind === "plan_draft" && p.scope === "week")).toHaveLength(1);
    expect(state.superseded.some((p: any) => p.suggestion_id === firstDraftId)).toBe(true);
    expect(state.dismissed.some((p: any) => p.suggestion_id === firstDraftId)).toBe(false);
  });

  it("approving is my move: I apply the draft and the week is planned", async () => {
    const res = await get(draft as any);
    const apply = await post(app.schedule, { days: res.body.draft.days });
    expect(apply.status).toBe(200);
    const nextWeek = apply.body.days.filter((d: any) => d.date >= nextMonday);
    expect(nextWeek.length).toBeGreaterThan(0);
    for (const day of nextWeek) {
      for (const slot of day.slots) expect(slot.status).toBe("planned");
    }
  });

  it("waving the draft off silences it — no re-nag on the next read", async () => {
    const res = await get(draft as any);
    const sid = res.body.suggestion_id;
    expect(sid).toBeTruthy();
    const dismiss = await post(app.suggestion, { suggestion_id: sid, outcome: "dismissed" });
    expect(dismiss.status).toBe(200);
    const after = await get(draft as any);
    expect(after.status).toBe(200);
    expect(after.body.suggestion_id).toBeUndefined(); // draft data still served, pair silenced
    expect(after.body.draft.days.length).toBeGreaterThan(0);
  });

  it("swapping Wednesday's dinner leaves Thursday untouched", async () => {
    // plan the current week: two meal days
    const wed = today;
    const thu = addDays(today, 1);
    const plan = await post(app.schedule, {
      days: [
        { date: wed, slots: [{ lane: "meal", title: "Draft Chili", library_id: chiliId }] },
        { date: thu, slots: [{ lane: "meal", title: "Draft Curry" }] },
      ],
    });
    const wedSlot = plan.body.days.find((d: any) => d.date === wed).slots[0];
    const thuSlotBefore = plan.body.days.find((d: any) => d.date === thu).slots[0];

    const res = await post(exchange as any, { slot_id: wedSlot.slot_id });
    expect(res.status).toBe(200);
    expect(res.body.suggestion_id).toBeTruthy();
    const days = res.body.draft.days;

    const newWed = days.find((d: any) => d.date === wed).slots[0];
    expect(newWed.lane).toBe("meal");
    expect(newWed.title).not.toBe("Draft Chili"); // actually swapped
    expect(titles).toContain(newWed.title); // to something of mine
    expect(newWed.slot_id).toBeUndefined(); // new identity, minted on accept

    const newThu = days.find((d: any) => d.date === thu).slots[0];
    expect(newThu).toEqual({
      slot_id: thuSlotBefore.slot_id,
      lane: "meal",
      title: "Draft Curry",
    }); // byte-identical, id preserved

    // applying the swap keeps Thursday's identity on the real schedule
    const apply = await post(app.schedule, { days });
    expect(apply.status).toBe(200);
    expect(
      apply.body.days.find((d: any) => d.date === thu).slots[0].slot_id
    ).toBe(thuSlotBefore.slot_id);
  });

  it("hostile: exchange refuses unknown and non-meal slots", async () => {
    expect((await post(exchange as any, { slot_id: "slot-nope" })).status).toBe(404);
    const plan = await post(app.schedule, {
      days: [
        { date: today, slots: [{ lane: "sleep", title: "Sleep" }] },
      ],
    });
    const sleepSlot = plan.body.days.find((d: any) => d.date === today).slots[0];
    expect((await post(exchange as any, { slot_id: sleepSlot.slot_id })).status).toBe(422);
    expect((await post(exchange as any, {})).status).toBe(422);
  });
});
