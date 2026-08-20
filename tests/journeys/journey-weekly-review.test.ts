// J15 — "Sunday evening I open the review and see the week I actually lived:
// what I cooked vs planned, training vs program, sleep, how I felt — and one
// question worth answering. A coach who pays attention, not an app nagging."
// (UX.md:101, UX.md:98.)

import { describe, it, expect, beforeAll } from "vitest";
import { loadApp, type App, get, post, todayLocal } from "./harness";

let app: App;
let reflect: { GET: () => Promise<Response> };

const today = todayLocal();

let chiliId: string;
let saladSlotId: string;
let workoutSlotId: string;
let sessionEventId: string;
let journalEventId: string;

beforeAll(async () => {
  app = await loadApp();
  reflect = (await import("@/app/api/reflect/route")) as any;

  const chili = await post(app.recipes, {
    source_url: "https://example.com/review-chili",
    title: "Review Chili",
    servings: 2,
    total_minutes: 20,
    ingredients: [{ name: "beans", qty: 1, unit: "can", confidence: "high" }],
    steps: ["Simmer."],
    confidence: { title: "high", servings: "high", total_minutes: "high" },
  });
  chiliId = chili.body.library_id;

  const plan = await post(app.schedule, {
    days: [
      {
        date: today,
        slots: [
          { lane: "meal", title: "Review Chili", library_id: chiliId },
          { lane: "meal", title: "Salad night" },
          { lane: "workout", title: "Push Day" },
        ],
      },
    ],
  });
  const slots = plan.body.days.find((d: any) => d.date === today).slots;
  saladSlotId = slots[1].slot_id;
  workoutSlotId = slots[2].slot_id;

  await post(app.cook, { library_id: chiliId }); // chili done
  await post(app.log, { kind: "skip", slot_id: saladSlotId, lane: "meal" }); // salad skipped
  const session = await post(app.log, {
    kind: "session", title: "Push Day", slot_id: workoutSlotId,
  });
  sessionEventId = session.body.event_id;
  const journal = await post(app.log, {
    kind: "journal", text: "solid start to the week", mood: 4,
  });
  journalEventId = journal.body.event_id;
});

describe("J15: the week reviewed", () => {
  it("the review counts the week I lived, skips included in planned", async () => {
    const res = await get(reflect as any);
    expect(res.status).toBe(200);
    const { review } = res.body;
    expect(review.meals).toEqual({ planned: 2, done: 1 }); // skipped salad still counts as planned
    expect(review.workouts).toEqual({ planned: 1, done: 1 });
    expect(review.journal_count).toBe(1);
    expect(review.mood.avg).toBe(4);
    expect(review.sleep_nights).toBe(0);
  });

  it("streaks come recomputed from the diary, never hand-maintained", async () => {
    const res = await get(reflect as any);
    const { streaks } = res.body;
    expect(streaks.cooking).toBeGreaterThanOrEqual(1);
    expect(streaks.training).toBeGreaterThanOrEqual(1);
    expect(streaks.journaling).toBeGreaterThanOrEqual(1);
  });

  it("exactly one prompt, tied to something true", async () => {
    const res = await get(reflect as any);
    const { prompt } = res.body;
    expect(prompt).toBeDefined();
    expect(typeof prompt.text).toBe("string");
    expect(prompt.text.length).toBeGreaterThan(10);
    expect(prompt.basis).toBeTruthy();
    expect(Array.isArray(prompt)).toBe(false); // one, not a list
  });

  it("my mood rides the journal entry into history", async () => {
    const history = await get(app.history, { path: "/api/history?kind=journal" });
    const entry = history.body.entries.find(
      (e: any) => e.text === "solid start to the week"
    );
    expect(entry.mood).toBe(4);
  });

  it("hostile: junk moods are refused", async () => {
    for (const mood of [0, 6, 2.5, "happy", -1]) {
      const res = await post(app.log, { kind: "journal", text: "x", mood });
      expect(res.status).toBe(422);
    }
  });

  it("a mood-less journal stays mood-less — no invented neutral", async () => {
    await post(app.log, { kind: "journal", text: "just words" });
    const history = await get(app.history, { path: "/api/history?kind=journal" });
    const entry = history.body.entries.find((e: any) => e.text === "just words");
    expect(entry.mood).toBeUndefined();
    // avg still reflects only the one real mood
    const res = await get(reflect as any);
    expect(res.body.review.mood.avg).toBe(4);
  });

  it("retracting the workout takes it out of the review, not out of the plan", async () => {
    const res = await post((await import("@/app/api/retract/route")) as any, {
      event_id: sessionEventId,
    });
    expect(res.status).toBe(200);
    const review = (await get(reflect as any)).body.review;
    expect(review.workouts).toEqual({ planned: 1, done: 0 });
  });

  it("retracting the journal clears the mood trend honestly", async () => {
    await post((await import("@/app/api/retract/route")) as any, {
      event_id: journalEventId,
    });
    const res = await get(reflect as any);
    expect(res.body.review.journal_count).toBe(1); // "just words" remains
    expect(res.body.review.mood).toBeUndefined(); // no moods left — absent, not 0
  });
});
