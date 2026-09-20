import { describe, it, expect } from "vitest";
import { currentWeekMealIds, parseScheduleDays, rebuildSchedule } from "@/lib/schedule";
import { localDate } from "@/lib/dates";
import {
  JOURNAL_ENTRY,
  RECIPE_COOKED,
  SCHEDULE_PLANNED,
  SESSION_LOGGED,
  SLEPT_LOGGED,
  SLOT_SKIPPED,
  type EventEnvelope,
} from "@/lib/contracts";

let seq = 0;
function ev(type: string, ts: string, payload: unknown): EventEnvelope {
  return {
    event_id: `e${String(++seq).padStart(3, "0")}`,
    household_id: "hh-jake",
    type,
    ts,
    source: "web",
    payload,
    schema_version: 1,
    precision: "estimated",
  };
}

const planned = (ts: string, days: unknown) => ev(SCHEDULE_PLANNED, ts, { days });

const MON = "2026-07-27";
const TUE = "2026-07-28";

const chiliSlot = { slot_id: "s-chili", lane: "meal", title: "Chili", library_id: "lib-chili" };
const squatSlot = { slot_id: "s-squat", lane: "workout", title: "squat day" };
const sleepSlot = { slot_id: "s-sleep", lane: "sleep", title: "10:30 bedtime" };
const mindSlot = { slot_id: "s-mind", lane: "mind", title: "meditate" };

describe("rebuildSchedule (latest snapshot wins, logs join as status)", () => {
  it("returns the latest snapshot's days, all slots planned when nothing is logged", () => {
    const out = rebuildSchedule([
      planned("2026-07-25T10:00:00Z", [{ date: MON, slots: [chiliSlot] }]),
      planned("2026-07-25T11:00:00Z", [
        { date: MON, slots: [chiliSlot, squatSlot] },
        { date: TUE, slots: [sleepSlot] },
      ]),
    ]);
    expect(out).toEqual([
      {
        date: MON,
        slots: [
          { ...chiliSlot, status: "planned" },
          { ...squatSlot, status: "planned" },
        ],
      },
      { date: TUE, slots: [{ ...sleepSlot, status: "planned" }] },
    ]);
  });

  it("empty log → empty schedule", () => {
    expect(rebuildSchedule([])).toEqual([]);
  });

  it("a meal slot is done when a RecipeCooked for its library_id lands on that date", () => {
    const out = rebuildSchedule([
      planned("2026-07-25T10:00:00Z", [
        { date: MON, slots: [chiliSlot] },
        { date: TUE, slots: [{ ...chiliSlot, slot_id: "s-chili-2" }] },
      ]),
      ev(RECIPE_COOKED, `${MON}T23:10:00Z`, {
        library_id: "lib-chili",
        title: "Chili",
        ingredients: [],
      }),
    ]);
    // cooked Monday → Monday's slot done, Tuesday's still planned (absolute dates)
    expect(out[0].slots[0].status).toBe("done");
    expect(out[1].slots[0].status).toBe("planned");
  });

  it("one cook marks one slot: same-day duplicate slots resolve in slot order", () => {
    const out = rebuildSchedule([
      planned("2026-07-25T10:00:00Z", [
        {
          date: MON,
          slots: [chiliSlot, { ...chiliSlot, slot_id: "s-chili-b" }],
        },
      ]),
      ev(RECIPE_COOKED, `${MON}T12:00:00Z`, {
        library_id: "lib-chili",
        title: "Chili",
        ingredients: [],
      }),
    ]);
    expect(out[0].slots.map((s) => s.status)).toEqual(["done", "planned"]);
  });

  it("one cook marks one slot even when the snapshot repeats a date across day entries", () => {
    // POST /api/schedule accepts two day entries with the same date; each
    // must draw from ONE shared cook pool, not a per-entry copy.
    const out = rebuildSchedule([
      planned("2026-07-25T10:00:00Z", [
        { date: MON, slots: [chiliSlot] },
        { date: MON, slots: [{ ...chiliSlot, slot_id: "s-chili-b", title: "Chili again" }] },
      ]),
      ev(RECIPE_COOKED, `${MON}T12:00:00Z`, {
        library_id: "lib-chili",
        title: "Chili",
        ingredients: [],
      }),
    ]);
    const statuses = out.flatMap((d) => d.slots).map((s) => s.status).sort();
    expect(statuses).toEqual(["done", "planned"]);
  });

  it("SessionLogged/JournalEntry mark their slot done by slot_id; SleptLogged by date", () => {
    const out = rebuildSchedule([
      planned("2026-07-25T10:00:00Z", [
        { date: MON, slots: [squatSlot, mindSlot] },
        { date: TUE, slots: [sleepSlot] },
      ]),
      ev(SESSION_LOGGED, `${MON}T18:00:00Z`, {
        title: "squat day",
        kind: "structured",
        slot_id: "s-squat",
      }),
      ev(JOURNAL_ENTRY, `${MON}T21:00:00Z`, { text: "good day", slot_id: "s-mind" }),
      ev(SLEPT_LOGGED, `${TUE}T07:00:00Z`, { date: TUE, quality: "great" }),
    ]);
    expect(out[0].slots.map((s) => s.status)).toEqual(["done", "done"]);
    expect(out[1].slots[0].status).toBe("done");
  });

  it("SlotSkipped marks skipped; a later log wins over skip (you did it after all)", () => {
    const out = rebuildSchedule([
      planned("2026-07-25T10:00:00Z", [{ date: MON, slots: [squatSlot, mindSlot] }]),
      ev(SLOT_SKIPPED, `${MON}T09:00:00Z`, { slot_id: "s-mind", lane: "mind" }),
      ev(SLOT_SKIPPED, `${MON}T09:00:00Z`, { slot_id: "s-squat", lane: "workout" }),
      ev(SESSION_LOGGED, `${MON}T18:00:00Z`, {
        title: "squat day",
        kind: "structured",
        slot_id: "s-squat",
      }),
    ]);
    expect(out[0].slots.map((s) => s.status)).toEqual(["done", "skipped"]);
  });

  it("logs referencing slots absent from the latest snapshot are ignored (no orphan crash)", () => {
    const out = rebuildSchedule([
      planned("2026-07-25T10:00:00Z", [{ date: MON, slots: [squatSlot] }]),
      planned("2026-07-25T11:00:00Z", [{ date: MON, slots: [mindSlot] }]),
      ev(SESSION_LOGGED, `${MON}T18:00:00Z`, {
        title: "squat day",
        kind: "structured",
        slot_id: "s-squat",
      }),
    ]);
    expect(out[0].slots).toEqual([{ ...mindSlot, status: "planned" }]);
  });
});

describe("parseScheduleDays (untrusted body gate; mints missing slot_ids)", () => {
  it("accepts valid days, keeps existing slot_ids, mints ids for new slots", () => {
    const result = parseScheduleDays([
      {
        date: MON,
        slots: [
          { slot_id: "s-keep", lane: "meal", title: "Chili", library_id: "lib-1" },
          { lane: "meal", title: "Snack", meal_type: "snack", time: "16:00", servings: 1.5, prep_batch_id: "batch-1" },
        ],
      },
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.days[0].slots[0].slot_id).toBe("s-keep");
    expect(typeof result.days[0].slots[1].slot_id).toBe("string");
    expect(result.days[0].slots[1].slot_id.length).toBeGreaterThan(0);
    expect(result.days[0].slots[1]).toMatchObject({
      meal_type: "snack",
      time: "16:00",
      servings: 1.5,
      prep_batch_id: "batch-1",
    });
  });

  it("rejects bad dates, unknown lanes, blank titles, non-arrays", () => {
    expect(parseScheduleDays("nope").ok).toBe(false);
    expect(parseScheduleDays([{ date: "next monday", slots: [] }]).ok).toBe(false);
    expect(
      parseScheduleDays([{ date: MON, slots: [{ lane: "nap", title: "x" }] }]).ok
    ).toBe(false);
    expect(
      parseScheduleDays([{ date: MON, slots: [{ lane: "mind", title: "  " }] }]).ok
    ).toBe(false);
    expect(
      parseScheduleDays([{ date: MON, slots: [{ lane: "meal", title: "x", time: "4pm" }] }]).ok
    ).toBe(false);
  });
});

describe("currentWeekMealIds (Monday-start week containing today, planned meals only)", () => {
  const days = [
    { date: "2026-07-26", slots: [{ ...chiliSlot, slot_id: "sun-prev", status: "planned" }] }, // Sunday before
    { date: "2026-07-27", slots: [{ ...chiliSlot, slot_id: "mon", status: "planned" }] },
    {
      date: "2026-07-29",
      slots: [
        { slot_id: "wed-1", lane: "meal", title: "Pasta", library_id: "lib-pasta", status: "done" },
        { slot_id: "wed-2", lane: "meal", title: "Tacos", library_id: "lib-tacos", status: "skipped" },
        { ...squatSlot, status: "planned" },
      ],
    },
    { date: "2026-08-02", slots: [{ ...chiliSlot, slot_id: "sun", status: "planned" }] }, // Sunday same week
    { date: "2026-08-03", slots: [{ ...chiliSlot, slot_id: "mon-next", status: "planned" }] }, // next Monday
  ];

  it("includes planned meal slots Mon..Sun of today's week; excludes done, skipped, other weeks, other lanes", () => {
    // Wednesday 2026-07-29: week = Mon 07-27 .. Sun 08-02
    expect(currentWeekMealIds(days as never, "2026-07-29")).toEqual(["lib-chili", "lib-chili"]);
  });

  it("a Sunday belongs to the week that started the previous Monday", () => {
    expect(currentWeekMealIds(days as never, "2026-08-02")).toEqual(["lib-chili", "lib-chili"]);
    expect(currentWeekMealIds(days as never, "2026-07-26")).toEqual(["lib-chili"]);
  });
});

describe("household-local dates (reviewer findings 1-2: UTC rolls over at 8pm ET)", () => {
  it("a cook at 00:30Z lands on the prior ET calendar day's slot", () => {
    const out = rebuildSchedule([
      planned("2026-07-25T10:00:00Z", [
        { date: "2026-07-27", slots: [chiliSlot] },
        { date: "2026-07-28", slots: [{ ...chiliSlot, slot_id: "s-chili-tue" }] },
      ]),
      // 8:30pm Monday EDT = 00:30 Tuesday UTC — must mark MONDAY, not Tuesday
      ev(RECIPE_COOKED, "2026-07-28T00:30:00Z", {
        library_id: "lib-chili",
        title: "Chili",
        ingredients: [],
      }),
    ]);
    expect(out[0].slots[0].status).toBe("done");
    expect(out[1].slots[0].status).toBe("planned");
  });

  it("localDate converts a UTC instant to the household's calendar day", () => {
    expect(localDate("2026-07-28T00:30:00Z")).toBe("2026-07-27"); // EDT evening
    expect(localDate("2026-07-28T12:00:00Z")).toBe("2026-07-28"); // midday
    expect(localDate("2026-01-15T03:00:00Z")).toBe("2026-01-14"); // EST (UTC-5)
  });
});

describe("parseScheduleDays hardening (reviewer findings 3-4)", () => {
  it("rejects duplicate slot_ids anywhere in the snapshot", () => {
    const result = parseScheduleDays([
      { date: "2026-07-27", slots: [{ slot_id: "dup-1", lane: "workout", title: "run" }] },
      { date: "2026-07-29", slots: [{ slot_id: "dup-1", lane: "mind", title: "meditate" }] },
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects calendar-invalid dates that match the shape regex", () => {
    expect(parseScheduleDays([{ date: "2026-13-99", slots: [] }]).ok).toBe(false);
    expect(parseScheduleDays([{ date: "2026-02-30", slots: [] }]).ok).toBe(false);
  });
});
