// J2 — "I live my day in the app: do things, tap them done, skip things,
// and get help when I skip." One story, one DB, real clock.

import { describe, it, expect, beforeAll, vi } from "vitest";
import { loadApp, type App, get, post, todayLocal, addDays } from "./harness";

// Pinned mid-week clock (Date only; timers stay real). Repair proposals exist
// only inside the live Mon-Sun week (lib/repair.ts), so on a real Sunday
// "tomorrow" leaves the week and the menu is legitimately empty or a lone
// "let it go" — this journey's multi-option menu needs remaining week days.
vi.useFakeTimers({ toFake: ["Date"] });
vi.setSystemTime(new Date("2026-08-12T10:00:00"));

let app: App;
const today = todayLocal();
const tomorrow = addDays(today, 1);
let workoutId: string;
let sleepId: string;
let mindId: string;

beforeAll(async () => {
  app = await loadApp();
  const res = await post(app.schedule, {
    days: [
      {
        date: today,
        slots: [
          { lane: "workout", title: "Squat day" },
          { lane: "sleep", title: "10:30 bedtime" },
          { lane: "mind", title: "Evening journal" },
        ],
      },
      { date: tomorrow, slots: [{ lane: "workout", title: "Tempo run" }] },
    ],
  });
  const slots = res.body.days.find((d: any) => d.date === today).slots;
  workoutId = slots.find((s: any) => s.lane === "workout").slot_id;
  sleepId = slots.find((s: any) => s.lane === "sleep").slot_id;
  mindId = slots.find((s: any) => s.lane === "mind").slot_id;
});

const todaySlots = (body: any) => body.days.find((d: any) => d.date === today).slots;
const statusOf = (body: any, id: string) =>
  todaySlots(body).find((s: any) => s.slot_id === id).status;

describe("J2: live a day and log it", () => {
  it("tapping a workout done comes back done in the same response (the receipt)", async () => {
    const res = await post(app.log, { kind: "session", title: "Squat day", slot_id: workoutId });
    expect(res.status).toBe(200);
    expect(statusOf(res.body, workoutId)).toBe("done");
  });

  it("an impatient double-tap doesn't corrupt anything", async () => {
    const [a, b] = await Promise.all([
      post(app.log, { kind: "session", title: "Squat day", slot_id: workoutId }),
      post(app.log, { kind: "session", title: "Squat day", slot_id: workoutId }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    const read = await get(app.schedule);
    expect(statusOf(read.body, workoutId)).toBe("done"); // done once, not weird
  });

  it("logging sleep marks tonight's sleep intention done", async () => {
    const res = await post(app.log, { kind: "sleep", date: today, quality: "ok", hours: 7.2 });
    expect(res.status).toBe(200);
    expect(statusOf(res.body, sleepId)).toBe("done");
  });

  it("journaling against the mind slot marks it done; a spontaneous journal also counts", async () => {
    const slotted = await post(app.log, { kind: "journal", text: "long day, good lift", slot_id: mindId });
    expect(statusOf(slotted.body, mindId)).toBe("done");
    const spontaneous = await post(app.log, { kind: "journal", text: "2am thought" });
    expect(spontaneous.status).toBe(200);
  });

  it("skipping tomorrow's run answers immediately with repair options", async () => {
    const read = await get(app.schedule);
    const runId = read.body.days
      .find((d: any) => d.date === tomorrow)
      .slots.find((s: any) => s.title === "Tempo run").slot_id;
    const res = await post(app.log, { kind: "skip", slot_id: runId, lane: "workout" });
    expect(res.status).toBe(200);
    const day = res.body.days.find((d: any) => d.date === tomorrow);
    expect(day.slots.find((s: any) => s.title === "Tempo run").status).toBe("skipped");
    const menu = day.repair_proposals;
    expect(menu?.length).toBeGreaterThanOrEqual(2); // real choices, not a single decree
    expect(menu.filter((p: any) => p.recommended)).toHaveLength(1); // exactly one pick
    for (const p of menu) {
      expect(p.reason?.length).toBeGreaterThan(10); // a one-line why, always
      expect(p.suggestion_id).toBeTruthy();
    }
  });

  it("dismissing one repair option leaves the others standing", async () => {
    const read = await get(app.schedule);
    const menu = read.body.days.find((d: any) => d.date === tomorrow).repair_proposals;
    const victim = menu.find((p: any) => !p.recommended);
    const res = await post(app.suggestion, { suggestion_id: victim.suggestion_id, outcome: "dismissed" });
    expect(res.status).toBe(200);
    const again = await get(app.schedule);
    const options = again.body.days
      .find((d: any) => d.date === tomorrow)
      .repair_proposals.map((p: any) => p.option);
    expect(options).not.toContain(victim.option);
    expect(options.length).toBe(menu.length - 1);
  });

  it("accepting a repair retires the menu, and applying its plan just works", async () => {
    const read = await get(app.schedule);
    const menu = read.body.days.find((d: any) => d.date === tomorrow).repair_proposals;
    const pick = menu.find((p: any) => p.recommended) ?? menu[0];
    const res = await post(app.suggestion, { suggestion_id: pick.suggestion_id, outcome: "accepted" });
    expect(res.status).toBe(200);

    const applied = await post(app.schedule, { days: pick.days });
    expect(applied.status).toBe(200);
    for (const d of applied.body.days) expect(d.repair_proposals).toBeUndefined(); // no re-nag
  });

  it("a stale skip from an outdated client can't hurt the schedule", async () => {
    const before = await get(app.schedule);
    const res = await post(app.log, { kind: "skip", slot_id: "slot-deleted-long-ago", lane: "workout" });
    expect(res.status).toBeLessThan(500); // never a crash
    const after = await get(app.schedule);
    expect(after.body.days).toEqual(before.body.days); // and never damage
  });

  it("a sleep log on an impossible calendar date is refused", async () => {
    const res = await post(app.log, { kind: "sleep", date: "2026-02-30", quality: "ok" });
    expect(res.status).toBe(422);
  });

  it("an unknown log kind is refused with a reason", async () => {
    const res = await post(app.log, { kind: "meditation", minutes: 20 });
    expect(res.status).toBe(422);
    expect(String(res.body.reason)).toBeTruthy();
  });

  it("everything I logged today shows up in my history", async () => {
    const res = await get(app.history, { path: "/api/history?kind=workouts" });
    expect(res.status).toBe(200);
    const titles = JSON.stringify(res.body);
    expect(titles).toContain("Squat day");
  });
});
