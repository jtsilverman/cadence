import { createClient, type Client } from "@libsql/client";
import { beforeEach, describe, expect, it } from "vitest";
import { FOOD_LOGGED } from "@/lib/contracts";
import { migrate } from "@/lib/db";
import { mapGarminBundle, mapMfpDay } from "@/lib/external-map";
import { readEvents } from "@/lib/events";
import { ingestMapped } from "@/lib/ingest";
import { rebuildPantry } from "@/lib/pantry";

const HH = "hh-test";

const garmin = () =>
  mapGarminBundle({
    source: "garmin",
    activities: [
      {
        activityId: 7,
        activityName: "Ride",
        activityType: { typeKey: "cycling" },
        startTimeGMT: "2026-07-26 15:00:00",
        distance: 20000,
        duration: 3600,
        calories: 700,
        averageHR: 140,
      },
    ],
    days: [
      {
        date: "2026-07-26",
        stats: { totalSteps: 8000, activeKilocalories: 500, restingHeartRate: 50 },
        hrv: { hrvSummary: { lastNightAvg: 45 } },
      },
    ],
  });

describe("external ingest", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });

  it("re-running a garmin bundle does not duplicate events", async () => {
    const first = await ingestMapped(db, HH, "garmin", garmin());
    expect(first.appended).toBeGreaterThan(0);
    expect(first.skipped).toBe(0);
    const second = await ingestMapped(db, HH, "garmin", garmin());
    expect(second).toEqual({ appended: 0, skipped: first.appended });
    expect(await readEvents(db, HH)).toHaveLength(first.appended);
  });

  it("a changed diary day appends a revision instead of a second identity", async () => {
    const day = mapMfpDay({
      date: "2026-07-26",
      meals: [{ name: "Lunch", entries: [{ name: "rice", nutrition: { calories: 400 } }] }],
      totals: { calories: 400 },
    })!;
    await ingestMapped(db, HH, "mfp", [day]);
    const revised = mapMfpDay({
      date: "2026-07-26",
      meals: [{ name: "Lunch", entries: [{ name: "rice", nutrition: { calories: 450 } }] }],
      totals: { calories: 450 },
    })!;
    const result = await ingestMapped(db, HH, "mfp", [revised]);
    expect(result).toEqual({ appended: 1, skipped: 0 });
    const events = await readEvents(db, HH, { type: FOOD_LOGGED });
    expect(events).toHaveLength(2);
    expect(events[1].payload).toMatchObject({ calories: 450, external_id: "mfp:diary:2026-07-26" });
    expect(events[1].source).toBe("mfp");
    expect(events[1].precision).toBe("exact");
  });

  it("imported events leave the pantry fold untouched", async () => {
    const pantry = {
      event_id: "e1",
      household_id: HH,
      type: "PantryAsserted",
      ts: "2026-07-25T00:00:00Z",
      source: "web",
      payload: { name: "eggs", qty: 12, unit: null },
      schema_version: 1,
      precision: "exact" as const,
    };
    const before = rebuildPantry([pantry]);
    const food = mapMfpDay({
      date: "2026-07-26",
      meals: [{ name: "Dinner", entries: [{ name: "eggs", nutrition: { calories: 140 } }] }],
    })!;
    await ingestMapped(db, HH, "garmin", garmin());
    await ingestMapped(db, HH, "mfp", [food]);
    const after = rebuildPantry([pantry, ...(await readEvents(db, HH))]);
    expect(after).toEqual(before);
  });
});
