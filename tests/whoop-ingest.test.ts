import { createClient, type Client } from "@libsql/client";
import { beforeEach, describe, expect, it } from "vitest";
import type {
  RecoveryLoggedPayload,
  SessionLoggedPayload,
  SleptLoggedPayload,
} from "@/lib/contracts";
import { RECOVERY_LOGGED, SESSION_LOGGED, SLEPT_LOGGED } from "@/lib/contracts";
import { migrate } from "@/lib/db";
import { readEvents } from "@/lib/events";
import { rebuildPantry } from "@/lib/pantry";
import {
  ingestWhoopRecords,
  mapRecovery,
  mapSleep,
  mapWorkout,
  type WhoopRecovery,
  type WhoopSleep,
  type WhoopWorkout,
} from "@/lib/whoop-ingest";

const HH = "hh-test";

// Shapes mirror whoop v2 records (docs-derived; live probe refines fixtures).
const recovery: WhoopRecovery = {
  cycle_id: 93845,
  sleep_id: "9fac5ba1-9f2b-4a3c-b5f7-0d5a1e2f3a4b",
  created_at: "2026-07-26T11:05:00Z", // 7:05am ET — the morning the score lands
  updated_at: "2026-07-26T11:05:00Z",
  score_state: "SCORED",
  score: {
    user_calibrating: false,
    recovery_score: 61,
    resting_heart_rate: 52,
    hrv_rmssd_milli: 48.3,
  },
};

const sleep: WhoopSleep = {
  id: "e3b0c442-98fc-4c14-b39f-92d1282048c0",
  created_at: "2026-07-26T11:00:00Z",
  updated_at: "2026-07-26T11:00:00Z",
  start: "2026-07-26T03:12:00Z", // 11:12pm ET the night of the 25th
  end: "2026-07-26T11:00:00Z", //  7:00am ET on the 26th
  nap: false,
  score_state: "SCORED",
  score: {
    sleep_performance_percentage: 88,
    stage_summary: {
      total_in_bed_time_milli: 28_080_000, // 7.8h
      total_awake_time_milli: 1_800_000, //  0.5h
    },
  },
};

const workout: WhoopWorkout = {
  id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  created_at: "2026-07-26T22:40:00Z",
  updated_at: "2026-07-26T22:40:00Z",
  start: "2026-07-26T21:30:00Z",
  end: "2026-07-26T22:35:00Z",
  sport_name: "Running",
  score_state: "SCORED",
  score: { strain: 12.4 },
};

describe("whoop mappers", () => {
  it("maps a scored recovery to RecoveryLogged with local date and device envelope", () => {
    const mapped = mapRecovery(recovery);
    expect(mapped).not.toBeNull();
    expect(mapped!.type).toBe(RECOVERY_LOGGED);
    expect(mapped!.ts).toBe("2026-07-26T11:05:00Z");
    const p = mapped!.payload as RecoveryLoggedPayload;
    expect(p.date).toBe("2026-07-26");
    expect(p.score).toBe(61);
    expect(p.resting_hr).toBe(52);
    expect(p.hrv).toBe(48.3);
    expect(p.external_id).toBe("whoop:recovery:93845");
  });

  it("maps a scored sleep to SleptLogged: quality from performance, asleep hours, night = local date of end", () => {
    const mapped = mapSleep(sleep);
    expect(mapped).not.toBeNull();
    const p = mapped!.payload as SleptLoggedPayload;
    expect(p.date).toBe("2026-07-26");
    expect(p.quality).toBe("great"); // 88 >= 85
    expect(p.hours).toBeCloseTo(7.3, 5); // in-bed 7.8h minus awake 0.5h
    expect(p.score).toBe(88);
    expect(p.external_id).toBe(`whoop:sleep:${sleep.id}`);
  });

  it("quality thresholds: 85 great, 70-84 ok, below 70 rough", () => {
    const at = (pct: number) =>
      (mapSleep({
        ...sleep,
        score: { ...sleep.score!, sleep_performance_percentage: pct },
      })!.payload as SleptLoggedPayload).quality;
    expect(at(85)).toBe("great");
    expect(at(84)).toBe("ok");
    expect(at(70)).toBe("ok");
    expect(at(69)).toBe("rough");
  });

  it("a sleep ending before 8pm ET stays on the household-local date (UTC rollover)", () => {
    // end 02:00Z on the 26th = 10:00pm ET on the 25th — the night of the 25th
    const mapped = mapSleep({ ...sleep, start: "2026-07-25T19:00:00Z", end: "2026-07-26T02:00:00Z" });
    expect((mapped!.payload as SleptLoggedPayload).date).toBe("2026-07-25");
  });

  it("naps and unscored records map to null (skipped, not fabricated)", () => {
    expect(mapSleep({ ...sleep, nap: true })).toBeNull();
    expect(mapSleep({ ...sleep, score_state: "PENDING_SCORE", score: undefined })).toBeNull();
    expect(mapRecovery({ ...recovery, score_state: "PENDING_SCORE", score: undefined })).toBeNull();
    expect(mapWorkout({ ...workout, score_state: "PENDING_SCORE", score: undefined })).toBeNull();
  });

  it("maps a workout to a loose SessionLogged with no slot_id (never auto-marks a plan)", () => {
    const mapped = mapWorkout(workout);
    expect(mapped!.type).toBe(SESSION_LOGGED);
    expect(mapped!.ts).toBe("2026-07-26T22:35:00Z");
    const p = mapped!.payload as SessionLoggedPayload;
    expect(p.title).toBe("Running");
    expect(p.kind).toBe("loose");
    expect(p.slot_id).toBeUndefined();
    expect(p.external_id).toBe(`whoop:workout:${workout.id}`);
  });
});

describe("whoop ingest", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });

  it("appends one event per record with source whoop, precision exact, schema_version 2", async () => {
    const result = await ingestWhoopRecords(db, HH, {
      recoveries: [recovery],
      sleeps: [sleep],
      workouts: [workout],
    });
    expect(result).toEqual({ appended: 3, skipped: 0 });
    const events = await readEvents(db, HH);
    expect(events).toHaveLength(3);
    for (const event of events) {
      expect(event.source).toBe("whoop");
      expect(event.precision).toBe("exact");
      expect(event.schema_version).toBe(2);
    }
  });

  it("re-ingesting identical records skips them all (webhook redelivery)", async () => {
    await ingestWhoopRecords(db, HH, { recoveries: [recovery], sleeps: [sleep] });
    const second = await ingestWhoopRecords(db, HH, { recoveries: [recovery], sleeps: [sleep] });
    expect(second).toEqual({ appended: 0, skipped: 2 });
    expect(await readEvents(db, HH)).toHaveLength(2);
  });

  it("a revised record (score settled) appends a revision instead of skipping", async () => {
    await ingestWhoopRecords(db, HH, { recoveries: [recovery] });
    const revised: WhoopRecovery = {
      ...recovery,
      updated_at: "2026-07-26T12:00:00Z",
      score: { ...recovery.score!, recovery_score: 67 },
    };
    const result = await ingestWhoopRecords(db, HH, { recoveries: [revised] });
    expect(result).toEqual({ appended: 1, skipped: 0 });
    const events = await readEvents(db, HH, { type: RECOVERY_LOGGED });
    expect(events).toHaveLength(2);
    // fold order (ts, event_id): the revision lands after the original
    const last = events[events.length - 1].payload as RecoveryLoggedPayload;
    expect(last.score).toBe(67);
  });

  it("concurrent ingests of the same batch never double-append (in-process chain)", async () => {
    await Promise.all([
      ingestWhoopRecords(db, HH, { sleeps: [sleep] }),
      ingestWhoopRecords(db, HH, { sleeps: [sleep] }),
    ]);
    expect(await readEvents(db, HH, { type: SLEPT_LOGGED })).toHaveLength(1);
  });

  it("whoop events interleaved with pantry events leave the pantry fold untouched", async () => {
    const before = rebuildPantry([
      {
        event_id: "e1",
        household_id: HH,
        type: "PantryAsserted",
        ts: "2026-07-25T00:00:00Z",
        source: "web",
        payload: { name: "eggs", qty: 12, unit: null },
        schema_version: 1,
        precision: "exact",
      },
    ]);
    await ingestWhoopRecords(db, HH, { recoveries: [recovery], sleeps: [sleep], workouts: [workout] });
    const whoopEvents = await readEvents(db, HH);
    const after = rebuildPantry([
      {
        event_id: "e1",
        household_id: HH,
        type: "PantryAsserted",
        ts: "2026-07-25T00:00:00Z",
        source: "web",
        payload: { name: "eggs", qty: 12, unit: null },
        schema_version: 1,
        precision: "exact",
      },
      ...whoopEvents,
    ]);
    expect(after).toEqual(before);
  });
});
