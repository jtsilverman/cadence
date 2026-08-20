// The reflect folds (spec coach-reflect AC2-3): the week reviewed, streaks
// recomputed, one deterministic prompt basis. Fixed dates; "today" is
// Thursday 2026-07-23; current week Mon 2026-07-20.

import { describe, expect, it } from "vitest";
import type { EventEnvelope } from "@/lib/contracts";
import {
  JOURNAL_ENTRY,
  RECIPE_COOKED,
  SESSION_LOGGED,
  SLEPT_LOGGED,
  SCHEDULE_PLANNED,
} from "@/lib/contracts";
import { rebuildSchedule } from "@/lib/schedule";
import { pickPromptBasis, weekReview, weekStreaks } from "@/lib/reflect";

const TODAY = "2026-07-23";

let seq = 0;
const ev = (type: string, payload: unknown, dateISO: string): EventEnvelope => ({
  event_id: `ev-${++seq}`,
  household_id: "hh-test",
  type,
  ts: `${dateISO}T16:00:00.000Z`,
  source: "web",
  payload,
  schema_version: 1,
  precision: "exact",
});

const journal = (dateISO: string, mood?: number) =>
  ev(JOURNAL_ENTRY, { text: "words", ...(mood !== undefined ? { mood } : {}) }, dateISO);
const session = (dateISO: string) =>
  ev(SESSION_LOGGED, { title: "w", kind: "loose" }, dateISO);
const cook = (dateISO: string) =>
  ev(RECIPE_COOKED, { library_id: "lib-1", title: "Chili", ingredients: [] }, dateISO);

describe("weekReview", () => {
  it("counts lanes with skips included in planned, and mood vs prior week", () => {
    const plan = ev(
      SCHEDULE_PLANNED,
      {
        days: [
          {
            date: "2026-07-21",
            slots: [
              { slot_id: "m1", lane: "meal", title: "Chili", library_id: "lib-1" },
              { slot_id: "m2", lane: "meal", title: "Salad" },
              { slot_id: "w1", lane: "workout", title: "Push" },
            ],
          },
        ],
      },
      "2026-07-20"
    );
    const events = [
      plan,
      cook("2026-07-21"), // marks m1 done
      ev("SlotSkipped", { slot_id: "m2", lane: "meal" }, "2026-07-21"),
      ev(SESSION_LOGGED, { title: "Push", kind: "loose", slot_id: "w1" }, "2026-07-21"),
      journal("2026-07-22", 4),
      journal("2026-07-16", 2), // prior week
      ev(SLEPT_LOGGED, { date: "2026-07-21", quality: "ok" }, "2026-07-22"),
      ev(SLEPT_LOGGED, { date: "2026-07-15", quality: "ok" }, "2026-07-16"),
    ];
    const review = weekReview(events, rebuildSchedule(events), TODAY);
    expect(review.meals).toEqual({ planned: 2, done: 1 });
    expect(review.workouts).toEqual({ planned: 1, done: 1 });
    expect(review.journal_count).toBe(1); // this week only
    expect(review.mood).toEqual({ avg: 4, prior_avg: 2 });
    expect(review.sleep_nights).toBe(1);
    expect(review.prior_sleep_nights).toBe(1);
  });

  it("no moods anywhere → mood absent, never zero", () => {
    const review = weekReview([journal("2026-07-22")], [], TODAY);
    expect(review.mood).toBeUndefined();
    expect(review.journal_count).toBe(1);
  });
});

describe("weekStreaks", () => {
  it("counts consecutive qualifying weeks back from the current week", () => {
    const events = [
      session("2026-07-21"), // current week
      session("2026-07-14"), // last week
      session("2026-07-07"), // two back
      // gap at 2026-06-30 week
      session("2026-06-23"),
    ];
    expect(weekStreaks(events, TODAY).training).toBe(3);
  });

  it("an empty current week never breaks the streak", () => {
    const events = [cook("2026-07-14"), cook("2026-07-07")];
    expect(weekStreaks(events, TODAY).cooking).toBe(2);
  });

  it("no qualifying weeks → the signal is absent, not zero", () => {
    expect(weekStreaks([], TODAY)).toEqual({});
  });
});

describe("pickPromptBasis", () => {
  const emptyReview = weekReview([], [], TODAY);

  it("falls back to the generic-but-true prompt on a cold start", () => {
    const prompt = pickPromptBasis(emptyReview, {}, null, null);
    expect(prompt.basis).toBe("generic");
    expect(prompt.text.length).toBeGreaterThan(10);
  });

  it("a 3-week streak beats sleep regression", () => {
    const review = { ...emptyReview, sleep_nights: 1, prior_sleep_nights: 4 };
    const prompt = pickPromptBasis(review, { training: 3 }, null, null);
    expect(prompt.basis).toBe("streak");
    expect(prompt.text).toContain("3");
  });

  it("a program phase change beats everything", () => {
    const position = { week_index: 3, total_weeks: 4, phase: "peak" as const, status: "on_track" as const };
    const prior = { week_index: 2, total_weeks: 4, phase: "volume" as const, status: "on_track" as const };
    const prompt = pickPromptBasis(emptyReview, { training: 5 }, position, prior);
    expect(prompt.basis).toBe("milestone");
    expect(prompt.text.toLowerCase()).toContain("peak");
  });

  it("mood drop surfaces when nothing bigger is happening", () => {
    const review = { ...emptyReview, mood: { avg: 2, prior_avg: 4 } };
    const prompt = pickPromptBasis(review, {}, null, null);
    expect(prompt.basis).toBe("mood");
  });

  it("sleep regression outranks mood drop", () => {
    const review = {
      ...emptyReview,
      sleep_nights: 1,
      prior_sleep_nights: 5,
      mood: { avg: 2, prior_avg: 4 },
    };
    expect(pickPromptBasis(review, {}, null, null).basis).toBe("sleep");
  });
});

// reviewer finding: completion is a milestone once, not a weekly nag.
describe("pickPromptBasis completion transition", () => {
  const emptyReview = weekReview([], [], TODAY);
  const complete = { week_index: 4, total_weeks: 4, phase: null, status: "complete" as const };

  it("fires on the week the block completes", () => {
    const prior = { week_index: 4, total_weeks: 4, phase: "deload" as const, status: "deload" as const };
    expect(pickPromptBasis(emptyReview, {}, complete, prior).basis).toBe("milestone");
  });

  it("stays quiet every week after — nothing changed between the two", () => {
    const pick = pickPromptBasis(emptyReview, { training: 5 }, complete, complete);
    expect(pick.basis).not.toBe("milestone");
    expect(pick.basis).toBe("streak");
  });
});
