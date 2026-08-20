// J1 — "I plan my two weeks and trust the grid."
// Written from user expectations (UX: 2-week Monday grid, four lanes, loose
// slots), not from the implementation. One story, one DB.

import { describe, it, expect, beforeAll } from "vitest";
import { loadApp, type App, get, post, todayLocal, mondayOf, addDays } from "./harness";

let app: App;
const monday = mondayOf(todayLocal());
const tue = addDays(monday, 1);
const wed = addDays(monday, 2);
const nextMon = addDays(monday, 7);

beforeAll(async () => {
  app = await loadApp();
});

describe("J1: plan a full two weeks and trust it", () => {
  it("planning all four lanes across two weeks comes back complete and ordered", async () => {
    const res = await post(app.schedule, {
      days: [
        { date: nextMon, slots: [{ lane: "workout", title: "Long run" }] },
        {
          date: monday,
          slots: [
            { lane: "meal", title: "Chili night" },
            { lane: "workout", title: "Push day 💪" },
            { lane: "sleep", title: "10:30 bedtime" },
            { lane: "mind", title: "Méditation" },
          ],
        },
      ],
    });
    expect(res.status).toBe(200);
    const days = res.body.days;
    expect(days.map((d: any) => d.date)).toEqual([monday, nextMon]); // sorted, both weeks
    const mondaySlots = days[0].slots;
    expect(mondaySlots).toHaveLength(4);
    // titles preserved exactly — emoji and accents intact
    expect(mondaySlots.map((s: any) => s.title)).toContain("Push day 💪");
    expect(mondaySlots.map((s: any) => s.title)).toContain("Méditation");
    // every slot got a durable id
    for (const s of mondaySlots) expect(s.slot_id).toBeTruthy();
    // everything starts as planned, nothing invented
    for (const s of mondaySlots) expect(s.status).toBe("planned");
  });

  it("moving a workout to another day keeps its identity", async () => {
    const before = await get(app.schedule);
    const mondayDay = before.body.days.find((d: any) => d.date === monday);
    const push = mondayDay.slots.find((s: any) => s.title === "Push day 💪");
    const rest = mondayDay.slots.filter((s: any) => s.slot_id !== push.slot_id);

    const res = await post(app.schedule, {
      days: [
        { date: monday, slots: rest.map(({ status, ...s }: any) => s) },
        { date: tue, slots: [{ slot_id: push.slot_id, lane: push.lane, title: push.title }] },
        {
          date: nextMon,
          slots: before.body.days
            .find((d: any) => d.date === nextMon)
            .slots.map(({ status, ...s }: any) => s),
        },
      ],
    });
    expect(res.status).toBe(200);
    const tueDay = res.body.days.find((d: any) => d.date === tue);
    expect(tueDay.slots[0].slot_id).toBe(push.slot_id); // same slot, new day
  });

  it("a rejected edit changes nothing (no partial writes)", async () => {
    const before = await get(app.schedule);
    const bad = await post(app.schedule, {
      days: [
        { date: monday, slots: [{ lane: "workout", title: "ok" }] },
        { date: "not-a-date", slots: [{ lane: "workout", title: "boom" }] },
      ],
    });
    expect(bad.status).toBe(422);
    expect(String(bad.body.reason)).toBeTruthy(); // told why
    const after = await get(app.schedule);
    expect(after.body.days).toEqual(before.body.days); // untouched
  });

  it("impossible calendar dates are refused, not stored", async () => {
    const res = await post(app.schedule, {
      days: [{ date: "2026-02-30", slots: [{ lane: "meal", title: "ghost dinner" }] }],
    });
    expect(res.status).toBe(422);
  });

  it("US-style dates are refused with a reason, not silently mangled", async () => {
    const res = await post(app.schedule, {
      days: [{ date: "07/28/2026", slots: [{ lane: "meal", title: "dinner" }] }],
    });
    expect(res.status).toBe(422);
    expect(String(res.body.reason).toLowerCase()).toContain("date");
  });

  it("a nonsense lane is refused with the legal lanes named", async () => {
    const res = await post(app.schedule, {
      days: [{ date: monday, slots: [{ lane: "cardio", title: "hill sprints" }] }],
    });
    expect(res.status).toBe(422);
    expect(String(res.body.reason)).toContain("lane");
  });

  it("a very long pasted title survives round-trip", async () => {
    const title = "Meal prep: " + "chicken thighs with roasted vegetables, ".repeat(8).trim();
    const res = await post(app.schedule, {
      days: [{ date: wed, slots: [{ lane: "meal", title }] }],
    });
    expect(res.status).toBe(200);
    const stored = res.body.days.find((d: any) => d.date === wed).slots[0].title;
    expect(stored).toBe(title);
  });

  it("clearing the plan entirely is allowed and honest", async () => {
    const res = await post(app.schedule, { days: [] });
    expect(res.status).toBe(200);
    expect(res.body.days).toEqual([]);
    const read = await get(app.schedule);
    expect(read.body.days).toEqual([]);
  });

  it("two simultaneous edits end in one coherent plan, not an interleaved mess", async () => {
    const planA = { days: [{ date: monday, slots: [{ lane: "workout", title: "Plan A" }] }] };
    const planB = { days: [{ date: monday, slots: [{ lane: "workout", title: "Plan B" }] }] };
    const [a, b] = await Promise.all([post(app.schedule, planA), post(app.schedule, planB)]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const read = await get(app.schedule);
    const titles = read.body.days.find((d: any) => d.date === monday).slots.map((s: any) => s.title);
    expect([["Plan A"], ["Plan B"]]).toContainEqual(titles); // wholesale winner, never a merge
  });
});
