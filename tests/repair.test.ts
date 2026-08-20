import { describe, it, expect, beforeEach } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { migrate } from "@/lib/db";
import { appendEvent, newEventId, readEvents } from "@/lib/events";
import { SUGGESTION_MADE, type RepairSuggestion } from "@/lib/contracts";
import type { DayRecovery } from "@/lib/recovery";
import type { DayState, SlotState } from "@/lib/schedule";
import { readSuggestionState, resolveSuggestion } from "@/lib/suggestions";
import { attachRepairSuggestions, computeRepairMenu } from "@/lib/repair";

// Hand-built resolved schedules (the fold's output shape), never produced by
// the code under test. Week under test: Mon 2026-07-20 .. Sun 2026-07-26.
const slot = (
  slot_id: string,
  lane: SlotState["lane"],
  title: string,
  status: SlotState["status"],
  library_id?: string
): SlotState => {
  const s: SlotState = { slot_id, lane, title, status };
  if (library_id) s.library_id = library_id;
  return s;
};
const day = (date: string, ...slots: SlotState[]): DayState => ({ date, slots });

const rec = (entries: Record<string, number>): Map<string, DayRecovery> =>
  new Map(Object.entries(entries).map(([d, score]) => [d, { score }]));

type Proposal = Omit<RepairSuggestion, "suggestion_id">;
const byOption = (menu: Proposal[], option: Proposal["option"]) =>
  menu.find((p) => p.option === option);

describe("computeRepairMenu (pure scorer)", () => {
  it("early-week miss with a free day recommends shift to the earliest free day", () => {
    // Tuesday 07-21, skipped Monday workout, Wed..Sun empty except Fri workout.
    const days = [
      day("2026-07-20", slot("w-mon", "workout", "Push day", "skipped", "wt-1")),
      day("2026-07-24", slot("w-fri", "workout", "Leg day", "planned")),
    ];
    const menu = computeRepairMenu(days, rec({}), "2026-07-21");

    const shift = byOption(menu, "shift");
    expect(shift).toBeDefined();
    expect(shift?.recommended).toBe(true);
    expect(shift?.missed_slot_id).toBe("w-mon");
    // earliest free remaining day is today, 07-21
    const target = shift?.days.find((d) => d.date === "2026-07-21");
    expect(target?.slots).toEqual([
      { lane: "workout", title: "Push day", library_id: "wt-1" },
    ]);
    // full replacement snapshot: the untouched Friday day is still present
    expect(shift?.days.find((d) => d.date === "2026-07-24")?.slots).toEqual([
      { slot_id: "w-fri", lane: "workout", title: "Leg day" },
    ]);
    // the skipped slot stays in place on its original day (visible history)
    expect(shift?.days.find((d) => d.date === "2026-07-20")?.slots).toEqual([
      { slot_id: "w-mon", lane: "workout", title: "Push day", library_id: "wt-1" },
    ]);
  });

  it("no free day and not-red recovery recommends consolidate into the next planned workout", () => {
    // Every remaining day holds a planned workout — nowhere free to shift.
    const days = [
      day("2026-07-20", slot("w-mon", "workout", "Push day", "skipped")),
      day("2026-07-21", slot("w-tue", "workout", "Pull day", "planned")),
      day("2026-07-22", slot("w-wed", "workout", "Leg day", "planned")),
      day("2026-07-23", slot("w-thu", "workout", "Run", "planned")),
      day("2026-07-24", slot("w-fri", "workout", "Swim", "planned")),
      day("2026-07-25", slot("w-sat", "workout", "Row", "planned")),
      day("2026-07-26", slot("w-sun", "workout", "Bike", "planned")),
    ];
    const menu = computeRepairMenu(days, rec({ "2026-07-21": 80 }), "2026-07-21");

    const consolidate = byOption(menu, "consolidate");
    expect(consolidate?.recommended).toBe(true);
    // merge amends the earliest busy day's slot title, same slot_id
    expect(consolidate?.days.find((d) => d.date === "2026-07-21")?.slots).toEqual([
      { slot_id: "w-tue", lane: "workout", title: "Pull day + Push day (merged)" },
    ]);
    expect(byOption(menu, "shift")).toBeUndefined();
    // double_up rides as a never-recommended alternate
    const dbl = byOption(menu, "double_up");
    expect(dbl).toBeDefined();
    expect(dbl?.recommended).toBeUndefined();
    expect(dbl?.days.find((d) => d.date === "2026-07-21")?.slots).toEqual([
      { slot_id: "w-tue", lane: "workout", title: "Pull day" },
      { lane: "workout", title: "Push day" },
    ]);
  });

  it("red recovery recommends drop and withholds double_up", () => {
    const days = [
      day("2026-07-24", slot("w-fri", "workout", "Squat Day", "skipped")),
      day("2026-07-25", slot("w-sat", "workout", "Run", "planned")),
    ];
    const menu = computeRepairMenu(days, rec({ "2026-07-24": 30 }), "2026-07-24");

    expect(byOption(menu, "drop")?.recommended).toBe(true);
    expect(byOption(menu, "double_up")).toBeUndefined();
    // drop proposes the plan unchanged (minus statuses)
    expect(byOption(menu, "drop")?.days).toEqual([
      { date: "2026-07-24", slots: [{ slot_id: "w-fri", lane: "workout", title: "Squat Day" }] },
      { date: "2026-07-25", slots: [{ slot_id: "w-sat", lane: "workout", title: "Run" }] },
    ]);
  });

  it("shift never targets a day you already trained — done today means the makeup lands on the next empty day", () => {
    // Today (Tue) holds a done workout: not a fresh day. Shift targets Wed.
    const days = [
      day("2026-07-20", slot("w-mon", "workout", "Push day", "skipped")),
      day("2026-07-21", slot("w-tue", "workout", "Recovery ride", "done")),
    ];
    const menu = computeRepairMenu(days, rec({}), "2026-07-21");
    const shift = byOption(menu, "shift");
    expect(shift?.days.find((d) => d.date === "2026-07-22")?.slots).toEqual([
      { lane: "workout", title: "Push day" },
    ]);
    expect(shift?.days.find((d) => d.date === "2026-07-21")?.slots).toEqual([
      { slot_id: "w-tue", lane: "workout", title: "Recovery ride" },
    ]);
  });

  it("the latest recovery on-or-before today gates, not a same-day reading", () => {
    // No reading today; yesterday was red — still red for gating purposes.
    const days = [
      day("2026-07-23", slot("w-thu", "workout", "Run", "skipped")),
      day("2026-07-24", slot("w-fri", "workout", "Swim", "planned")),
    ];
    const menu = computeRepairMenu(days, rec({ "2026-07-22": 20 }), "2026-07-23");
    expect(byOption(menu, "double_up")).toBeUndefined();
    expect(byOption(menu, "drop")?.recommended).toBe(true);
  });

  it("the last day of the week recommends drop even with green recovery", () => {
    // Sunday: one remaining day.
    const days = [
      day("2026-07-25", slot("w-sat", "workout", "Run", "skipped")),
      day("2026-07-26", slot("w-sun", "workout", "Bike", "planned")),
    ];
    const menu = computeRepairMenu(days, rec({ "2026-07-26": 90 }), "2026-07-26");
    expect(byOption(menu, "drop")?.recommended).toBe(true);
    expect(byOption(menu, "consolidate")).toBeDefined();
  });

  // Meals repair as of spec nutrition (Jake reversed UX.md:57's "no makeup
  // meals"); sleep and mind still don't — you can't make up last night's sleep.
  it("skipped sleep and mind slots produce no repair", () => {
    const days = [
      day(
        "2026-07-21",
        slot("sl1", "sleep", "10:30 bedtime", "skipped"),
        slot("mind1", "mind", "journal", "skipped")
      ),
    ];
    expect(computeRepairMenu(days, rec({}), "2026-07-21")).toEqual([]);
  });

  it("a skipped meal menus shift (to a meal-free day) and drop — no workout math", () => {
    const days = [
      day("2026-07-21", slot("m1", "meal", "Chili", "skipped", "lib-chili")),
      day("2026-07-22", slot("m2", "meal", "Stir fry", "planned", "lib-stirfry")),
    ];
    // 07-23..26 exist in no plan day → 07-23 is the first meal-free day
    const menu = computeRepairMenu(days, rec({}), "2026-07-22");
    expect(menu.map((p) => p.option).sort()).toEqual(["drop", "shift"]);
    const shift = byOption(menu, "shift")!;
    expect(shift.recommended).toBe(true);
    expect(shift.missed_slot_id).toBe("m1");
    const host = shift.days.find((d) => d.date === "2026-07-23")!;
    expect(host.slots).toEqual([{ lane: "meal", title: "Chili", library_id: "lib-chili" }]);
  });

  it("a skipped meal with every remaining day already fed recommends drop", () => {
    const days = ["2026-07-22", "2026-07-23", "2026-07-24", "2026-07-25", "2026-07-26"].map(
      (date, i) => day(date, slot(`m-${i}`, "meal", "Meal", "planned", `lib-${i}`))
    );
    days.unshift(day("2026-07-21", slot("m-missed", "meal", "Chili", "skipped", "lib-chili")));
    const menu = computeRepairMenu(days, rec({}), "2026-07-22");
    expect(menu.map((p) => p.option)).toEqual(["drop"]);
    expect(menu[0].recommended).toBe(true);
  });

  it("a skip from a previous week ages out", () => {
    const days = [day("2026-07-13", slot("w-old", "workout", "Push day", "skipped"))];
    expect(computeRepairMenu(days, rec({}), "2026-07-21")).toEqual([]);
  });

  it("invariants hold across the week × plan × recovery sweep", () => {
    // Property sweep (deterministic, no PRNG): every weekday as "today",
    // with/without a free day, red/green/absent recovery. Invariants: drop is
    // always offered per miss, exactly one option is recommended, every
    // proposal's days covers every plan date (full snapshot, sorted), and
    // double_up never appears under red recovery.
    const weekDates = ["2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23", "2026-07-24", "2026-07-25", "2026-07-26"];
    for (const today of weekDates) {
      for (const withFreeDay of [true, false]) {
        for (const scoreToday of [20, 80, undefined]) {
          const days = weekDates
            .map((date, i) => {
              if (date === "2026-07-20") return day(date, slot("w-miss", "workout", "Push day", "skipped"));
              if (!withFreeDay || i % 2 === 1) return day(date, slot(`w-${i}`, "workout", `Day ${i}`, "planned"));
              return day(date, slot(`m-${i}`, "meal", "Chili", "planned", "lib-chili"));
            })
            .filter((d): d is DayState => d !== undefined);
          const recovery = scoreToday === undefined ? rec({}) : rec({ [today]: scoreToday });
          const menu = computeRepairMenu(days, recovery, today);

          expect(menu.filter((p) => p.option === "drop")).toHaveLength(1);
          expect(menu.filter((p) => p.recommended)).toHaveLength(1);
          if (scoreToday === 20) expect(byOption(menu, "double_up")).toBeUndefined();
          for (const p of menu) {
            expect(p.missed_slot_id).toBe("w-miss");
            const dates = p.days.map((d) => d.date);
            expect(dates).toEqual([...dates].sort());
            for (const planned of days) expect(dates).toContain(planned.date);
          }
        }
      }
    }
  });

  it("recomputing with identical inputs is byte-identical (no minted ids, no clocks)", () => {
    const days = [
      day("2026-07-20", slot("w-mon", "workout", "Push day", "skipped")),
      day("2026-07-24", slot("w-fri", "workout", "Leg day", "planned")),
    ];
    const a = computeRepairMenu(days, rec({ "2026-07-20": 55 }), "2026-07-21");
    const b = computeRepairMenu(days, rec({ "2026-07-20": 55 }), "2026-07-21");
    expect(a.length).toBeGreaterThan(0);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("attachRepairSuggestions (the menu logs the pair on surface)", () => {
  const HH = "hh-repair";
  let db: Client;

  // Tuesday, skipped Monday workout, free Wednesday, planned Friday workout:
  // menu = shift (recommended), double_up, consolidate, drop.
  const DAYS = [
    day("2026-07-20", slot("w-mon", "workout", "Push day", "skipped")),
    day("2026-07-24", slot("w-fri", "workout", "Leg day", "planned")),
  ];
  const TODAY = "2026-07-21";
  const surface = () => attachRepairSuggestions(db, HH, DAYS, rec({}), TODAY);
  const madeEvents = async () =>
    (await readEvents(db, HH, { type: SUGGESTION_MADE })).map(
      (e) => e.payload as RepairSuggestion
    );

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });

  it("logs one repair Made per viable option and attaches the menu to the missed slot's day", async () => {
    const out = await surface();
    const menu = out.find((d) => d.date === "2026-07-20")?.repair_proposals;
    expect(menu?.map((p) => p.option).sort()).toEqual(
      ["consolidate", "double_up", "drop", "shift"]
    );
    expect(menu?.find((p) => p.option === "shift")?.recommended).toBe(true);
    for (const p of menu ?? []) expect(p.suggestion_id).toBeTruthy();

    const made = await madeEvents();
    expect(made).toHaveLength(4);
    expect(new Set(made.map((p) => p.suggestion_id)).size).toBe(4);
  });

  it("a repeat surface reuses the open proposals — still one event per option", async () => {
    const first = await surface();
    const second = await surface();
    expect(await madeEvents()).toHaveLength(4);
    expect(
      second.find((d) => d.date === "2026-07-20")?.repair_proposals?.map((p) => p.suggestion_id)
    ).toEqual(
      first.find((d) => d.date === "2026-07-20")?.repair_proposals?.map((p) => p.suggestion_id)
    );
  });

  it("two concurrent surfaces serialize to one event per option", async () => {
    await Promise.all([surface(), surface()]);
    expect(await madeEvents()).toHaveLength(4);
  });

  it("a dismissed option is silenced; its siblings are re-proposed", async () => {
    const out = await surface();
    const menu = out.find((d) => d.date === "2026-07-20")?.repair_proposals ?? [];
    const shift = menu.find((p) => p.option === "shift") as RepairSuggestion;
    await resolveSuggestion(db, HH, { suggestion_id: shift.suggestion_id, outcome: "dismissed" });

    const again = await surface();
    const options = again
      .find((d) => d.date === "2026-07-20")
      ?.repair_proposals?.map((p) => p.option)
      .sort();
    expect(options).toEqual(["consolidate", "double_up", "drop"]);
    expect(await madeEvents()).toHaveLength(4); // nothing re-minted
  });

  it("an accepted option silences the whole menu for that slot", async () => {
    const out = await surface();
    const menu = out.find((d) => d.date === "2026-07-20")?.repair_proposals ?? [];
    const drop = menu.find((p) => p.option === "drop") as RepairSuggestion;
    await resolveSuggestion(db, HH, { suggestion_id: drop.suggestion_id, outcome: "accepted" });

    const again = await surface();
    expect(again.find((d) => d.date === "2026-07-20")?.repair_proposals).toBeUndefined();
    expect(await madeEvents()).toHaveLength(4);
  });
});

describe("readSuggestionState accepted split", () => {
  it("returns accepted payloads alongside open and dismissed", async () => {
    const db = createClient({ url: ":memory:" });
    await migrate(db);
    const HH = "hh-state";
    const mk = async (suggestion_id: string) =>
      appendEvent(db, {
        event_id: newEventId(),
        household_id: HH,
        type: "SuggestionMade",
        ts: new Date().toISOString(),
        source: "web",
        payload: { suggestion_id, kind: "add_to_list", name: `n-${suggestion_id}`, qty: 1, unit: null, reason: "r" },
        schema_version: 1,
        precision: "estimated",
      });
    await mk("s-open");
    await mk("s-acc");
    await resolveSuggestion(db, HH, { suggestion_id: "s-acc", outcome: "accepted" });

    const state = await readSuggestionState(db, HH);
    expect(state.open.map((p) => p.suggestion_id)).toEqual(["s-open"]);
    expect(state.accepted.map((p) => p.suggestion_id)).toEqual(["s-acc"]);
    expect(state.dismissed).toEqual([]);
  });
});

// spec program-engine AC6: priority + adjacency shape the menu.
describe("computeRepairMenu priority + adjacency", () => {
  const hi = (s: SlotState): SlotState => ({ ...s, priority: "high" });

  it("double_up is never offered onto a day whose next day holds a planned high-priority workout", () => {
    // Tue miss; Wed is busy (planned) but Thu holds a high-priority session —
    // stacking a makeup onto Wed would sit a hard day before a hard day.
    const days = [
      day("2026-07-21", slot("w-tue", "workout", "Pull day", "skipped")),
      day("2026-07-22", slot("w-wed", "workout", "Easy run", "planned")),
      day("2026-07-23", hi(slot("w-thu", "workout", "Heavy squat", "planned"))),
    ];
    const menu = computeRepairMenu(days, rec({ "2026-07-22": 80 }), "2026-07-22");
    expect(byOption(menu, "double_up")).toBeUndefined();
    // the adjacency-safe Thursday itself can still host a consolidate
    expect(byOption(menu, "consolidate")).toBeDefined();
  });

  it("a high-priority miss with green recovery and a safe host recommends double_up", () => {
    const days = [
      day("2026-07-21", hi(slot("w-tue", "workout", "Heavy squat", "skipped"))),
      day("2026-07-22", slot("w-wed", "workout", "Easy run", "planned")),
    ];
    const menu = computeRepairMenu(days, rec({ "2026-07-22": 80 }), "2026-07-22");
    expect(byOption(menu, "double_up")?.recommended).toBe(true);
  });

  it("yellow recovery offers double_up but never picks it, even for a high-priority miss", () => {
    const days = [
      day("2026-07-21", hi(slot("w-tue", "workout", "Heavy squat", "skipped"))),
      day("2026-07-22", slot("w-wed", "workout", "Easy run", "planned")),
      day("2026-07-23", slot("free-marker", "mind", "journal", "planned")),
    ];
    const menu = computeRepairMenu(days, rec({ "2026-07-22": 50 }), "2026-07-22");
    expect(byOption(menu, "double_up")).toBeDefined();
    expect(byOption(menu, "double_up")?.recommended).toBeUndefined();
  });

  it("a normal-priority miss keeps today's pick even at green recovery", () => {
    const days = [
      day("2026-07-21", slot("w-tue", "workout", "Pull day", "skipped")),
      day("2026-07-22", slot("w-wed", "workout", "Easy run", "planned")),
    ];
    const menu = computeRepairMenu(days, rec({ "2026-07-22": 90 }), "2026-07-22");
    expect(byOption(menu, "double_up")?.recommended).toBeUndefined();
    expect(byOption(menu, "shift")?.recommended).toBe(true); // 07-23.. free
  });

  it("priority survives into the proposed days snapshot untouched", () => {
    const days = [
      day("2026-07-21", slot("w-tue", "workout", "Pull day", "skipped")),
      day("2026-07-23", hi(slot("w-thu", "workout", "Heavy squat", "planned"))),
    ];
    const menu = computeRepairMenu(days, rec({}), "2026-07-22");
    const shift = byOption(menu, "shift")!;
    const thu = shift.days.find((d) => d.date === "2026-07-23")!;
    expect((thu.slots[0] as { priority?: string }).priority).toBe("high");
  });
});

// spec program-engine AC7-8: real volume math on consolidate, and redistribute.
describe("computeRepairMenu volume math", () => {
  const wplan = (title: string, exercises: Array<[string, number, number]>) => ({
    plan_version: 1 as const,
    kind: "workout" as const,
    title,
    exercises: exercises.map(([name, sets, reps]) => ({ name, sets, reps })),
  });
  const plans = new Map([
    ["wt-miss", wplan("Leg Day", [["Back Squat", 5, 5], ["Lunge", 3, 10]])],
    ["wt-host", wplan("Upper Day", [["Bench Press", 4, 8]])],
  ]);

  it("consolidate carries halved missed sets when both templates resolve", () => {
    const days = [
      day("2026-07-20", slot("w-mon", "workout", "Leg Day", "skipped", "wt-miss")),
      day("2026-07-21", slot("w-tue", "workout", "Upper Day", "planned", "wt-host")),
      day("2026-07-22", slot("w-wed", "workout", "Row", "planned")),
      day("2026-07-23", slot("w-thu", "workout", "Bike", "planned")),
      day("2026-07-24", slot("w-fri", "workout", "Swim", "planned")),
      day("2026-07-25", slot("w-sat", "workout", "Run", "planned")),
      day("2026-07-26", slot("w-sun", "workout", "Hike", "planned")),
    ];
    const menu = computeRepairMenu(days, rec({ "2026-07-21": 80 }), "2026-07-21", plans);
    const consolidate = byOption(menu, "consolidate")!;
    expect(consolidate.volume).toEqual({
      host: [{ name: "Bench Press", sets: 4 }],
      added: [
        { name: "Back Squat", sets: 3 }, // ceil(5/2)
        { name: "Lunge", sets: 2 }, // ceil(3/2)
      ],
    });
    expect(consolidate.reason).toContain("9 sets"); // 4 host + 5 added, stated
  });

  it("without templates consolidate keeps the honest title merge and no volume field", () => {
    const days = [
      day("2026-07-20", slot("w-mon", "workout", "Leg Day", "skipped")),
      day("2026-07-21", slot("w-tue", "workout", "Upper Day", "planned")),
      day("2026-07-22", slot("w-wed", "workout", "Row", "planned")),
      day("2026-07-23", slot("w-thu", "workout", "Bike", "planned")),
      day("2026-07-24", slot("w-fri", "workout", "Swim", "planned")),
      day("2026-07-25", slot("w-sat", "workout", "Run", "planned")),
      day("2026-07-26", slot("w-sun", "workout", "Hike", "planned")),
    ];
    const menu = computeRepairMenu(days, rec({}), "2026-07-21", plans);
    const consolidate = byOption(menu, "consolidate")!;
    expect(consolidate.volume).toBeUndefined();
    expect(consolidate.reason).toContain("trim volume to taste");
  });

  it("redistribute spreads missed exercises round-robin across >=2 other planned days, moving nothing", () => {
    const days = [
      day("2026-07-20", slot("w-mon", "workout", "Leg Day", "skipped", "wt-miss")),
      day("2026-07-21", slot("w-tue", "workout", "Upper Day", "planned", "wt-host")),
      day("2026-07-22", slot("w-wed", "workout", "Row", "planned")),
    ];
    const menu = computeRepairMenu(days, rec({}), "2026-07-21", plans);
    const redis = byOption(menu, "redistribute")!;
    expect(redis).toBeDefined();
    expect(redis.volume?.assignments).toEqual([
      { date: "2026-07-21", slot_id: "w-tue", exercises: [{ name: "Back Squat", sets: 5 }] },
      { date: "2026-07-22", slot_id: "w-wed", exercises: [{ name: "Lunge", sets: 3 }] },
    ]);
    // volume guidance only: the days snapshot is the unchanged plan
    expect(redis.days).toEqual(byOption(menu, "drop")!.days);
  });

  it("redistribute needs two hosts and a resolvable template", () => {
    const oneHost = [
      day("2026-07-20", slot("w-mon", "workout", "Leg Day", "skipped", "wt-miss")),
      day("2026-07-21", slot("w-tue", "workout", "Upper Day", "planned", "wt-host")),
    ];
    expect(byOption(computeRepairMenu(oneHost, rec({}), "2026-07-21", plans), "redistribute")).toBeUndefined();
    const noTemplate = [
      day("2026-07-20", slot("w-mon", "workout", "Leg Day", "skipped")),
      day("2026-07-21", slot("w-tue", "workout", "Upper Day", "planned")),
      day("2026-07-22", slot("w-wed", "workout", "Row", "planned")),
    ];
    expect(byOption(computeRepairMenu(noTemplate, rec({}), "2026-07-21", plans), "redistribute")).toBeUndefined();
  });
});

// spec program-engine AC9: the scorer re-ranks fresh menus behind the pair.
describe("attachRepairSuggestions LLM scoring", () => {
  let db: Client;
  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });
  const HH = "hh-jake";

  it("an injected scorer's pick becomes the recommended option on fresh menus", async () => {
    const days = [
      day("2026-07-20", slot("w-mon", "workout", "Push day", "skipped")),
      day("2026-07-24", slot("w-fri", "workout", "Leg day", "planned")),
    ];
    const out = await attachRepairSuggestions(db, HH, days, rec({}), "2026-07-21", {
      position: null,
      callModel: async () => '{"pick": "drop"}',
    });
    const menu = out.find((d) => d.date === "2026-07-20")!.repair_proposals!;
    expect(menu.find((p) => p.option === "drop")?.recommended).toBe(true);
    expect(menu.find((p) => p.option === "shift")?.recommended).toBeUndefined();
  });

  it("a garbled scorer keeps the deterministic pick", async () => {
    const days = [
      day("2026-07-20", slot("w-mon", "workout", "Push day", "skipped")),
      day("2026-07-24", slot("w-fri", "workout", "Leg day", "planned")),
    ];
    const out = await attachRepairSuggestions(db, HH, days, rec({}), "2026-07-21", {
      position: null,
      callModel: async () => "hmm, tough call",
    });
    const menu = out.find((d) => d.date === "2026-07-20")!.repair_proposals!;
    expect(menu.find((p) => p.option === "shift")?.recommended).toBe(true);
  });
});

// reviewer finding (spec program-engine): a re-score across calls must leave
// exactly ONE recommended option per missed slot — the CURRENT pick, never a
// stale persisted one riding along via the recommended-exempt pair reuse.
describe("attachRepairSuggestions re-score exclusivity", () => {
  let db: Client;
  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });
  const HH = "hh-jake";

  it("a new pick on a later call demotes the previously recommended option", async () => {
    const days = [
      day("2026-07-20", slot("w-mon", "workout", "Push day", "skipped")),
      day("2026-07-21", slot("w-tue", "workout", "Pull day", "planned")),
    ];
    // call 1: red recovery — double_up not offered; scorer picks shift
    await attachRepairSuggestions(db, HH, days, rec({ "2026-07-21": 20 }), "2026-07-21", {
      position: null,
      callModel: async () => '{"pick": "shift"}',
    });
    // call 2: recovery flips green — double_up freshly unlocks; scorer picks it
    const out = await attachRepairSuggestions(db, HH, days, rec({ "2026-07-21": 80 }), "2026-07-21", {
      position: null,
      callModel: async () => '{"pick": "double_up"}',
    });
    const menu = out.find((d) => d.date === "2026-07-20")!.repair_proposals!;
    const recommended = menu.filter((p) => p.recommended === true);
    expect(recommended.map((p) => p.option)).toEqual(["double_up"]);
  });
});

// spec planner-composer AC2 pin: a drift-superseded repair option must not
// count as dismissed — the recomputed menu still offers it.
describe("repair options vs supersession", () => {
  let db: Client;
  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });
  const HH = "hh-jake";

  it("a drifted recompute keeps every option on offer", async () => {
    const days = [
      day("2026-07-20", slot("w-mon", "workout", "Push day", "skipped")),
      day("2026-07-24", slot("w-fri", "workout", "Leg day", "planned")),
    ];
    await attachRepairSuggestions(db, HH, days, rec({}), "2026-07-21");
    // recovery appears → drop's reason drifts → supersede, not dismissal
    const out = await attachRepairSuggestions(db, HH, days, rec({ "2026-07-21": 20 }), "2026-07-21");
    const menu = out.find((d) => d.date === "2026-07-20")!.repair_proposals!;
    expect(menu.map((p) => p.option)).toContain("drop");
    expect(menu.map((p) => p.option)).toContain("shift");
  });
});
