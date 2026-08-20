// J5 — "My watch knows the truth; the app listens without taking over."
// Only the Whoop NETWORK edge is mocked (captured API shapes); every route,
// mapper, and fold is real.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { loadApp, type App, get, post, todayLocal } from "./harness";

let app: App;
let sync: { POST: (req: Request) => Promise<Response> };
const realFetch = globalThis.fetch;
const today = todayLocal();
const now = () => new Date().toISOString();

let recoveryScore = 25; // red morning; later revised upward
let workoutSlotId: string;
let sleepSlotId: string;

const whoopPages = () => ({
  "/v2/recovery": {
    records: [
      {
        cycle_id: 555001,
        created_at: now(),
        updated_at: now(),
        score_state: "SCORED",
        score: { recovery_score: recoveryScore, resting_heart_rate: 55, hrv_rmssd_milli: 40.2 },
      },
    ],
    next_token: null,
  },
  "/v2/activity/sleep": {
    records: [
      {
        id: "sleep-j5-1",
        created_at: now(),
        updated_at: now(),
        start: new Date(Date.now() - 8 * 3600_000).toISOString(),
        end: now(),
        nap: false,
        score_state: "SCORED",
        score: { sleep_performance_percentage: 88 },
      },
    ],
    next_token: null,
  },
  "/v2/activity/workout": {
    records: [
      {
        id: "workout-j5-1",
        created_at: now(),
        updated_at: now(),
        start: new Date(Date.now() - 2 * 3600_000).toISOString(),
        end: new Date(Date.now() - 1 * 3600_000).toISOString(),
        sport_name: "Running",
        score_state: "SCORED",
        score: { strain: 10.1 },
      },
    ],
    next_token: null,
  },
});

beforeAll(async () => {
  app = await loadApp();
  sync = (await import("@/app/api/whoop/sync/route")) as any;
  process.env.WHOOP_CLIENT_ID = "cid-j5";
  process.env.WHOOP_CLIENT_SECRET = "csecret-j5";

  // connect once (token exchange against the mocked edge)
  const { getDb, migrate } = await import("@/lib/db");
  const { exchangeCode } = await import("@/lib/whoop");
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ access_token: "acc-j5", refresh_token: "ref-j5", expires_in: 3600 }),
      { status: 200 }
    )) as typeof fetch;
  const db = getDb();
  await migrate(db);
  await exchangeCode(db, "hh-jake", "code-j5", "https://app.test/cb");

  // the device API, keyed by path
  globalThis.fetch = (async (input: any) => {
    const url = typeof input === "string" ? input : input.url;
    const page = Object.entries(whoopPages()).find(([path]) => url.includes(path));
    if (!page) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify(page[1]), { status: 200 });
  }) as typeof fetch;

  // today's plan: a workout I haven't done and tonight's sleep intention
  const plan = await post(app.schedule, {
    days: [
      {
        date: today,
        slots: [
          { lane: "workout", title: "Evening intervals" },
          { lane: "sleep", title: "sleep 8h" },
        ],
      },
    ],
  });
  const slots = plan.body.days[0].slots;
  workoutSlotId = slots.find((s: any) => s.lane === "workout").slot_id;
  sleepSlotId = slots.find((s: any) => s.lane === "sleep").slot_id;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

const todayView = async () => (await get(app.schedule)).body.days.find((d: any) => d.date === today);

describe("J5: a wearable week", () => {
  it("one sync lands recovery, sleep, and the workout in my day", async () => {
    const res = await post(sync as any, {});
    expect(res.status).toBe(200);
    expect(res.body.appended).toBeGreaterThanOrEqual(3);

    const day = await todayView();
    expect(day.recovery?.score).toBe(25); // the morning number, visible
    const sleep = day.slots.find((s: any) => s.slot_id === sleepSlotId);
    expect(sleep.status).toBe("done"); // the device saw me sleep — no tap needed
  });

  it("a rough morning flags my planned workout, but never touches the plan itself", async () => {
    const day = await todayView();
    expect(day.advice).toBe("ease");
    const workout = day.slots.find((s: any) => s.slot_id === workoutSlotId);
    expect(workout.status).toBe("planned"); // my watch's run is NOT my planned intervals
    expect(workout.title).toBe("Evening intervals"); // untouched
  });

  it("running the sync again changes nothing (redeliveries are free)", async () => {
    const res = await post(sync as any, {});
    expect(res.status).toBe(200);
    expect(res.body.appended).toBe(0);
    expect(res.body.skipped).toBeGreaterThanOrEqual(3);
  });

  it("when Whoop revises the morning score upward, the flag lifts", async () => {
    recoveryScore = 71; // scores settle over a morning
    const res = await post(sync as any, {});
    expect(res.body.appended).toBeGreaterThanOrEqual(1); // the revision is a new fact
    const day = await todayView();
    expect(day.recovery.score).toBe(71);
    expect(day.advice).toBeUndefined(); // no more nagging
  });

  it("my history shows the device workout alongside my own logs, honestly sourced", async () => {
    const res = await get(app.history, { path: "/api/history?kind=workouts" });
    const running = res.body.entries.find((e: any) => e.title === "Running");
    expect(running).toBeDefined();
    expect(running.source).toBe("whoop"); // I can tell who wrote what
  });
});
