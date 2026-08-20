// J8 — "Late nights and week edges never gaslight me about what day it is."
// Fakes only the Date (system time); DB and async stay real. The household
// timezone is America/New_York.

import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { loadApp, type App, get, post } from "./harness";

let app: App;

beforeAll(async () => {
  app = await loadApp();
  vi.useFakeTimers({ toFake: ["Date"] });
});
afterAll(() => {
  vi.useRealTimers();
});

describe("J8: time edges", () => {
  it("a 11:30pm ET workout log lands on that ET day, not tomorrow", async () => {
    // 2026-08-05T03:30Z == Tue 2026-08-04 11:30pm ET
    vi.setSystemTime(new Date("2026-08-05T03:30:00Z"));
    await post(app.schedule, {
      days: [{ date: "2026-08-04", slots: [{ lane: "sleep", title: "bedtime" }] }],
    });
    const res = await post(app.log, { kind: "sleep", date: "2026-08-04", quality: "ok" });
    const day = res.body.days.find((d: any) => d.date === "2026-08-04");
    expect(day.slots[0].status).toBe("done");
  });

  it("a late-night cook still counts for tonight's dinner slot", async () => {
    vi.setSystemTime(new Date("2026-08-05T03:00:00Z")); // 11pm ET Aug 4
    const saved = await post(app.recipes, {
      source_url: "https://example.com/midnight-stirfry",
      title: "Midnight Stir Fry",
      servings: 1,
      total_minutes: 10,
      ingredients: [{ name: "eggs", qty: 2, unit: null, confidence: "high" }],
      steps: ["Fry."],
      confidence: { title: "high", servings: "high", total_minutes: "high" },
    });
    await post(app.schedule, {
      days: [
        { date: "2026-08-04", slots: [{ lane: "meal", title: "Stir fry", library_id: saved.body.library_id }] },
      ],
    });
    await post(app.cook, { library_id: saved.body.library_id });
    const sched = await get(app.schedule);
    const slot = sched.body.days.find((d: any) => d.date === "2026-08-04").slots[0];
    expect(slot.status).toBe("done"); // 11pm ET is still today, not UTC-tomorrow
  });

  it("on Sunday the week is honest: a skipped workout gets 'absorb it', not a phantom free day", async () => {
    vi.setSystemTime(new Date("2026-08-09T16:00:00Z")); // Sunday Aug 9, noon ET
    await post(app.schedule, {
      days: [
        { date: "2026-08-08", slots: [{ lane: "workout", title: "Saturday lift" }] },
        { date: "2026-08-09", slots: [{ lane: "workout", title: "Sunday run" }] },
      ],
    });
    const sched = await get(app.schedule);
    const satId = sched.body.days.find((d: any) => d.date === "2026-08-08").slots[0].slot_id;
    const res = await post(app.log, { kind: "skip", slot_id: satId, lane: "workout" });
    const menu = res.body.days.find((d: any) => d.date === "2026-08-08").repair_proposals;
    const rec = menu.find((p: any) => p.recommended);
    expect(rec.option).toBe("drop"); // one day left: don't chase volume
    expect(menu.map((p: any) => p.option)).not.toContain("shift"); // no phantom free day
  });

  it("next Monday morning, last week's mess is gone from the repair conversation", async () => {
    vi.setSystemTime(new Date("2026-08-10T12:00:00Z")); // Monday Aug 10, 8am ET
    const sched = await get(app.schedule);
    for (const d of sched.body.days) {
      expect(d.repair_proposals, `day ${d.date}`).toBeUndefined(); // the week rolled; no stale nagging
    }
  });
});
