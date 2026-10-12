// Garmin Connect and MyFitnessPal response shapes → diary events.
// Fixtures stand in for the libraries; nothing here opens a socket.

import { describe, expect, it } from "vitest";
import type { FoodLoggedPayload, SessionLoggedPayload, SleptLoggedPayload } from "@/lib/contracts";
import { EXERTION_LOGGED, FOOD_LOGGED, RECOVERY_LOGGED, SESSION_LOGGED } from "@/lib/contracts";
import { mapGarminBundle, mapMfpBundle, mapMfpDay } from "@/lib/external-map";

const activity = {
  activityId: 204918273,
  activityName: "Morning Run",
  activityType: { typeKey: "running" },
  startTimeGMT: "2026-07-26 11:30:00",
  startTimeLocal: "2026-07-26 07:30:00",
  distance: 8420.4,
  duration: 2712.2,
  calories: 612.6,
  averageHR: 148.2,
};

describe("garmin bundle", () => {
  const bundle = mapGarminBundle({
    source: "garmin",
    activities: [activity, { activityName: "no id" }],
    days: [
      {
        date: "2026-07-26",
        stats: {
          totalSteps: 11234,
          activeKilocalories: 640,
          totalKilocalories: 2480,
          restingHeartRate: 51,
        },
        sleep: {
          dailySleepDTO: {
            calendarDate: "2026-07-26",
            sleepTimeSeconds: 27060,
            sleepScores: { overall: { value: 82 } },
            sleepEndTimestampGMT: 1753520400000,
          },
        },
        hrv: { hrvSummary: { calendarDate: "2026-07-26", lastNightAvg: 47.26 } },
        body_battery: [
          { date: "2026-07-25", charged: 10 },
          {
            date: "2026-07-26",
            charged: 80,
            bodyBatteryValuesArray: [
              [1753460000000, 40],
              [1753520000000, 72],
            ],
          },
        ],
        training_status: {
          mostRecentTrainingStatus: {
            latestTrainingStatusData: { calendarDate: "2026-07-26", acuteTrainingLoad: 312.4 },
          },
        },
      },
      {
        date: "2026-07-27",
        stats: { _error: "down" },
        sleep: { _error: "down" },
        hrv: null,
        body_battery: { _error: "down" },
        training_status: { _error: "down" },
      },
    ],
  });

  it("maps an activity with distance, duration, calories, and heart rate", () => {
    const session = bundle.find((e) => e.type === SESSION_LOGGED)!;
    const payload = session.payload as SessionLoggedPayload;
    expect(payload).toMatchObject({
      title: "Morning Run",
      kind: "loose",
      activity_type: "running",
      distance_m: 8420,
      duration_s: 2712,
      calories: 613,
      avg_hr: 148,
      external_id: "garmin:activity:204918273",
    });
    expect(payload.slot_id).toBeUndefined();
    expect(session.ts).toBe("2026-07-26T11:30:00.000Z");
    expect(session.schema_version).toBe(2);
    expect(bundle.filter((e) => e.type === SESSION_LOGGED)).toHaveLength(1);
  });

  it("maps the day: steps, active calories, sleep, hrv, body battery, training load", () => {
    const recovery = bundle.find((e) => e.type === RECOVERY_LOGGED)!;
    expect(recovery.payload).toEqual({
      date: "2026-07-26",
      external_id: "garmin:recovery:2026-07-26",
      hrv: 47.3,
      resting_hr: 51,
    });
    const sleep = bundle.find((e) => e.type === "SleptLogged")!;
    expect(sleep.payload).toMatchObject({
      date: "2026-07-26",
      hours: 7.5,
      quality: "ok",
      score: 82,
      external_id: "garmin:sleep:2026-07-26",
    } satisfies Partial<SleptLoggedPayload>);
    const exertion = bundle.find((e) => e.type === EXERTION_LOGGED)!;
    expect(exertion.payload).toEqual({
      date: "2026-07-26",
      external_id: "garmin:exertion:2026-07-26",
      steps: 11234,
      active_calories: 640,
      total_calories: 2480,
      body_battery: 72,
      training_load: 312,
    });
  });

  it("drops a day whose calls all failed", () => {
    expect(bundle.some((e) => (e.payload as { date?: string }).date === "2026-07-27")).toBe(false);
  });
});

describe("mfp diary", () => {
  it("maps meals, macros, and goals for a day that has entries", () => {
    const mapped = mapMfpDay({
      date: "2026-07-26",
      meals: [
        {
          name: "Breakfast",
          entries: [
            { name: "oats", nutrition: { calories: 310, protein: 12.2, carbohydrates: 48, fat: 6 } },
            { name: "  ", nutrition: { calories: 10 } },
          ],
        },
        {
          name: "Dinner",
          entries: [{ name: "salmon", nutrition: { calories: 540, protein: 42, carbohydrates: 0, fat: 28 } }],
        },
      ],
      totals: { calories: 1850.4, protein: 130, carbohydrates: 170, fat: 62 },
      goals: { calories: 2200, protein: 160, carbohydrates: 200, fat: 70 },
    });
    expect(mapped).not.toBeNull();
    const payload = mapped!.payload as FoodLoggedPayload;
    expect(mapped!.type).toBe(FOOD_LOGGED);
    expect(payload.external_id).toBe("mfp:diary:2026-07-26");
    expect(payload.entries).toEqual([
      { meal: "Breakfast", name: "oats", calories: 310, protein_g: 12.2, carbs_g: 48, fat_g: 6 },
      { meal: "Dinner", name: "salmon", calories: 540, protein_g: 42, carbs_g: 0, fat_g: 28 },
    ]);
    expect(payload.calories).toBe(1850);
    expect(payload.protein_g).toBe(130);
    expect(payload.goal_calories).toBe(2200);
    expect(payload.goal_protein_g).toBe(160);
  });

  it("skips a day with no food entries", () => {
    expect(mapMfpDay({ date: "2026-07-26", meals: [], totals: { calories: 0 }, goals: { calories: 2000 } })).toBeNull();
    expect(mapMfpBundle({ source: "mfp", days: [] })).toEqual([]);
  });
});
