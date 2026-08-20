// J4 — "The app never falls over, never leaks, never half-writes, no matter
// what reaches it." Type-level demands across the POST surface: every failure
// is an honest 4xx with a reason; 500 is always a bug; a rejected request
// writes nothing.

import { describe, it, expect, beforeAll } from "vitest";
import { loadApp, type App, get, post } from "./harness";

let app: App;
beforeAll(async () => {
  app = await loadApp();
});

// The uniform demands, applied to every simple JSON POST route.
const postRoutes = () =>
  [
    ["schedule", () => app.schedule],
    ["log", () => app.log],
    ["suggestion", () => app.suggestion],
    ["cook", () => app.cook],
    ["goals", () => app.goals],
    ["prefs", () => app.prefs],
  ] as const;

describe("J4: hostile and malformed input", () => {
  it("raw garbage bodies get a 4xx with a reason, never a 500", async () => {
    for (const [name, mod] of postRoutes()) {
      for (const body of ["not json {", "", "null", "[]", '"just a string"', "42"]) {
        const res = await post(mod(), body);
        expect(res.status, `${name} <- ${JSON.stringify(body)}`).toBeGreaterThanOrEqual(400);
        expect(res.status, `${name} <- ${JSON.stringify(body)}`).toBeLessThan(500);
      }
    }
  });

  it("prototype-chain key names never resolve as real handlers or pollute", async () => {
    for (const kind of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
      const res = await post(app.log, { kind });
      expect(res.status, `log kind=${kind}`).toBe(422);
    }
    const res = await get(app.history, { path: "/api/history?kind=constructor" });
    expect(res.status).toBe(422); // and absolutely not the full event dump
    expect(JSON.stringify(res.body).length).toBeLessThan(500);
    expect(({} as any).polluted).toBeUndefined();
  });

  it("__proto__ smuggled inside a schedule body neither pollutes nor crashes", async () => {
    const raw = `{"days":[{"date":"2099-01-05","slots":[{"lane":"meal","title":"x","__proto__":{"polluted":true}}]}]}`;
    const res = await post(app.schedule, raw);
    expect(res.status).toBeLessThan(500);
    expect(({} as any).polluted).toBeUndefined();
    expect(({} as any).status).toBeUndefined();
  });

  it("type confusion is refused: objects where strings belong, arrays where objects belong", async () => {
    const attempts: Array<[string, any, any]> = [
      ["schedule", app.schedule, { days: [{ date: ["2099-01-05"], slots: [] }] }],
      ["schedule", app.schedule, { days: [{ date: "2099-01-05", slots: [{ lane: "meal", title: { $gt: "" } }] }] }],
      ["log", app.log, { kind: "session", title: 42 }],
      ["log", app.log, { kind: "sleep", date: "2099-01-05", quality: ["ok"] }],
      ["suggestion", app.suggestion, { suggestion_id: { $ne: null }, outcome: "accepted" }],
      ["suggestion", app.suggestion, { suggestion_id: "s", outcome: "ACCEPTED" }],
    ];
    for (const [name, mod, body] of attempts) {
      const res = await post(mod, body);
      expect(res.status, `${name} <- ${JSON.stringify(body)}`).toBeGreaterThanOrEqual(400);
      expect(res.status, `${name} <- ${JSON.stringify(body)}`).toBeLessThan(500);
    }
  });

  it("a megabyte of title is survivable (accepted or refused, never a crash)", async () => {
    const res = await post(app.schedule, {
      days: [{ date: "2099-01-05", slots: [{ lane: "meal", title: "x".repeat(1_000_000) }] }],
    });
    expect(res.status).toBeLessThan(500);
  });

  it("injection-shaped strings are stored as inert text and returned verbatim", async () => {
    const nasty = `Robert'); DROP TABLE events;-- <script>alert(1)</script>`;
    const res = await post(app.schedule, {
      days: [{ date: "2099-01-06", slots: [{ lane: "meal", title: nasty }] }],
    });
    expect(res.status).toBe(200);
    const read = await get(app.schedule);
    const day = read.body.days.find((d: any) => d.date === "2099-01-06");
    expect(day.slots[0].title).toBe(nasty); // stored, not executed, not mangled
    const again = await get(app.schedule);
    expect(again.status).toBe(200); // events table still alive
  });

  it("a rejected write leaves zero trace (the diary only records real actions)", async () => {
    const before = await get(app.history, { path: "/api/history?kind=workouts" });
    await post(app.log, { kind: "session" }); // missing title → refused
    await post(app.log, "not json {");
    const after = await get(app.history, { path: "/api/history?kind=workouts" });
    expect(after.body).toEqual(before.body);
  });
});
