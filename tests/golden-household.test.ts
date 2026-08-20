// The golden household (spec consumption-expiry criterion 6): one synthetic
// three-week diary exercising EVERY event type, asserted across EVERY reader.
// This file is the eval set — a reader change that shifts behavior lands RED
// here. Every expected value is hand-computed in comments, never output-fitted.
//
// Timeline (TODAY = Sunday 2026-07-26, household TZ America/New_York):
//   Wk1: assert beef 2lb (expires 07-28) + rice 3cup; run 1 (Jul 7: +1lb beef,
//        +12 eggs); chili cook #1 (−.75lb beef, −.75cup rice); manual sleep;
//        loose yoga session.
//   Wk2: run 2 (Jul 14: +1lb beef); chili #2; squat session sA 3×8@135lb +
//        structured SessionLogged; journal; whoop recovery 45 + sleep + a
//        Running workout DELIVERED TWICE (revision — must count/show once).
//   Wk3: schedule snapshot (chili Thu, squat Fri, sleep Fri, easy-run + mind
//        Sun); goals (strength squat 315lb; cadence 3x/wk; one set-then-
//        cleared); run 3 (Jul 21: +12 eggs); suggestion pair (accepted);
//        milk asserted expiring 07-25; squat sB 3×8@140; chili #3 Thu (marks
//        the meal slot); Fri squat SKIPPED; whoop sleep Fri (marks the sleep
//        slot); whoop recovery 30 Sunday (red zone + planned workout → ease).

import { describe, expect, it } from "vitest";
import { createClient } from "@libsql/client";
import type {
  EaseWorkoutSuggestion,
  EventEnvelope,
  GoalSetPayload,
  NextTargetSuggestion,
  RecipePlan,
  RepairSuggestion,
  WorkoutPlan,
} from "@/lib/contracts";
import { SUGGESTION_MADE, SUGGESTION_RESOLVED } from "@/lib/contracts";
import { migrate } from "@/lib/db";
import { appendEvent, readEvents } from "@/lib/events";
import { attachNextTargetSuggestions } from "@/lib/workouts";
import { attachEaseSuggestions } from "@/lib/recovery";
import { resolveSuggestion } from "@/lib/suggestions";
import { weeklyUse } from "@/lib/consumption";
import { expiringItems, useSoonSuggestions } from "@/lib/expiry";
import { cooksLeft } from "@/lib/fullness";
import { activeGoals, goalProgress, proposeWorkoutWeek } from "@/lib/goals";
import { journalHistory, mealHistory, sleepHistory, workoutHistory } from "@/lib/history";
import { rebuildPantry } from "@/lib/pantry";
import { recoveryByDate, decorateWithRecovery } from "@/lib/recovery";
import { medianRunGapDays, suggestAdditions } from "@/lib/replenish";
import { attachRepairSuggestions } from "@/lib/repair";
import { rebuildSchedule } from "@/lib/schedule";
import { exerciseHistory, nextTargets } from "@/lib/workouts";

const HH = "hh-golden";
const TODAY = "2026-07-26";

const CHILI: RecipePlan = {
  plan_version: 1,
  kind: "recipe",
  title: "Chili",
  servings: 4,
  total_minutes: 45,
  ingredients: [
    { name: "beef", qty: 0.75, unit: "lb", confidence: "high" },
    { name: "rice", qty: 0.75, unit: "cup", confidence: "high" },
  ],
  steps: ["Cook it."],
  source_url: "https://example.com/chili",
  confidence: { title: "high", servings: "high", total_minutes: "high" },
};

const SQUAT_DAY: WorkoutPlan = {
  plan_version: 1,
  kind: "workout",
  title: "Squat Day",
  exercises: [{ name: "Back Squat", sets: 3, reps: 8, weight: 135, unit: "lb" }],
};

let n = 0;
function ev(
  type: string,
  ts: string,
  payload: unknown,
  opts?: { source?: string; precision?: EventEnvelope["precision"]; schema_version?: number }
): EventEnvelope {
  n += 1;
  return {
    event_id: `g${String(n).padStart(3, "0")}`,
    household_id: HH,
    type,
    ts,
    source: opts?.source ?? "web",
    payload,
    schema_version: opts?.schema_version ?? 1,
    precision: opts?.precision ?? "exact",
  };
}

const chiliCook = () => ({
  library_id: "lib-chili",
  title: "Chili",
  ingredients: [
    { name: "beef", qty: 0.75, unit: "lb" },
    { name: "rice", qty: 0.75, unit: "cup" },
  ],
});

const squatSet = (session_id: string, set_index: number, weight: number) => ({
  session_id,
  exercise: "Back Squat",
  set_index,
  reps: 8,
  weight,
  unit: "lb",
});

function buildDiary(): EventEnvelope[] {
  n = 0;
  const events: EventEnvelope[] = [
    // ---- week 1
    ev("PantryAsserted", "2026-07-06T16:00:00Z", { name: "beef", qty: 2, unit: "lb", expires: "2026-07-28" }),
    ev("PantryAsserted", "2026-07-06T16:01:00Z", { name: "rice", qty: 3, unit: "cup" }),
    ev("OrderPlaced", "2026-07-07T16:00:00Z", { rail: "instore", items: [{ name: "beef", qty: 1, unit: "lb" }, { name: "eggs", qty: 12, unit: null }] }),
  ];
  const order1 = events[events.length - 1].event_id;
  events.push(
    ev("PantryInflow", "2026-07-07T17:00:00Z", { items: [{ name: "beef", qty: 1, unit: "lb" }, { name: "eggs", qty: 12, unit: null }], via: "checkoff", order_event_id: order1 }),
    ev("RecipeCooked", "2026-07-08T22:00:00Z", chiliCook(), { precision: "estimated" }),
    ev("SleptLogged", "2026-07-09T02:00:00Z", { date: "2026-07-08", quality: "ok", hours: 7 }, { precision: "estimated" }),
    ev("SessionLogged", "2026-07-09T16:00:00Z", { title: "yoga", kind: "loose" }, { precision: "estimated" }),
    // ---- week 2
    ev("OrderPlaced", "2026-07-14T16:00:00Z", { rail: "instore", items: [{ name: "beef", qty: 1, unit: "lb" }] })
  );
  const order2 = events[events.length - 1].event_id;
  events.push(
    ev("PantryInflow", "2026-07-14T17:00:00Z", { items: [{ name: "beef", qty: 1, unit: "lb" }], via: "checkoff", order_event_id: order2 }),
    ev("RecipeCooked", "2026-07-15T22:00:00Z", chiliCook(), { precision: "estimated" }),
    ev("SetLogged", "2026-07-16T16:00:00Z", squatSet("sA", 1, 135)),
    ev("SetLogged", "2026-07-16T16:05:00Z", squatSet("sA", 2, 135)),
    ev("SetLogged", "2026-07-16T16:10:00Z", squatSet("sA", 3, 135)),
    ev("SessionLogged", "2026-07-16T16:15:00Z", { title: "Squat Day", kind: "structured", session_id: "sA", library_id: "w1" }, { precision: "estimated", schema_version: 2 }),
    ev("JournalEntry", "2026-07-17T16:00:00Z", { text: "good week" }),
    ev("RecoveryLogged", "2026-07-18T11:00:00Z", { date: "2026-07-18", score: 45, external_id: "whoop:recovery:1" }, { source: "whoop", schema_version: 2 }),
    ev("SleptLogged", "2026-07-18T11:00:00Z", { date: "2026-07-18", quality: "great", hours: 7.5, score: 88, external_id: "whoop:sleep:1" }, { source: "whoop", schema_version: 2 }),
    ev("SessionLogged", "2026-07-18T21:00:00Z", { title: "Running", kind: "loose", external_id: "whoop:workout:1" }, { source: "whoop", schema_version: 2 }),
    // whoop redelivers the workout revised — every reader must count it ONCE
    ev("SessionLogged", "2026-07-18T22:00:00Z", { title: "Running", kind: "loose", note: "rescored", external_id: "whoop:workout:1" }, { source: "whoop", schema_version: 2 }),
    // ---- week 3
    ev("SchedulePlanned", "2026-07-20T16:00:00Z", {
      days: [
        { date: "2026-07-24", slots: [{ slot_id: "m1", lane: "meal", title: "Chili", library_id: "lib-chili" }] },
        { date: "2026-07-25", slots: [
          { slot_id: "w-fri", lane: "workout", title: "Squat Day", library_id: "w1" },
          { slot_id: "sl-fri", lane: "sleep", title: "10:30 bedtime" },
        ] },
        { date: "2026-07-26", slots: [
          { slot_id: "w-sun", lane: "workout", title: "easy run" },
          { slot_id: "mind-sun", lane: "mind", title: "journal" },
        ] },
      ],
    }),
    ev("GoalSet", "2026-07-20T16:10:00Z", { goal_id: "g-squat", title: "Squat 315", kind: "strength", exercise: "Back Squat", target_weight: 315, unit: "lb" }),
    ev("GoalSet", "2026-07-20T16:11:00Z", { goal_id: "g-cad", title: "Train 3x", kind: "cadence", per_week: 3 }),
    ev("GoalSet", "2026-07-20T16:12:00Z", { goal_id: "g-old", title: "Meditate daily", kind: "custom" }),
    ev("GoalSet", "2026-07-21T16:00:00Z", { goal_id: "g-old", title: "Meditate daily", kind: "custom", cleared: true }),
    ev("OrderPlaced", "2026-07-21T16:30:00Z", { rail: "instore", items: [{ name: "eggs", qty: 12, unit: null }] })
  );
  const order3 = events[events.length - 1].event_id;
  events.push(
    ev("PantryInflow", "2026-07-21T17:00:00Z", { items: [{ name: "eggs", qty: 12, unit: null }], via: "checkoff", order_event_id: order3 }),
    ev("SuggestionMade", "2026-07-21T18:00:00Z", { suggestion_id: "sug-1", kind: "add_to_list", name: "rice", qty: 2, unit: "cup", reason: "almost out, by your cooking history" }, { precision: "estimated" }),
    ev("SuggestionResolved", "2026-07-21T18:05:00Z", { suggestion_id: "sug-1", name: "rice", outcome: "accepted" }),
    ev("PantryAsserted", "2026-07-22T16:00:00Z", { name: "milk", qty: 1, unit: "l", expires: "2026-07-25" }),
    ev("SetLogged", "2026-07-23T16:00:00Z", squatSet("sB", 1, 140)),
    ev("SetLogged", "2026-07-23T16:05:00Z", squatSet("sB", 2, 140)),
    ev("SetLogged", "2026-07-23T16:10:00Z", squatSet("sB", 3, 140)),
    ev("SessionLogged", "2026-07-23T16:15:00Z", { title: "Squat Day", kind: "structured", session_id: "sB", library_id: "w1" }, { precision: "estimated", schema_version: 2 }),
    ev("RecipeCooked", "2026-07-24T22:00:00Z", chiliCook(), { precision: "estimated" }),
    ev("SlotSkipped", "2026-07-25T02:30:00Z", { slot_id: "w-fri", lane: "workout" }),
    ev("SleptLogged", "2026-07-25T11:00:00Z", { date: "2026-07-25", quality: "ok", hours: 6.9, score: 75, external_id: "whoop:sleep:2" }, { source: "whoop", schema_version: 2 })
  );
  events.push(
    ev("RecoveryLogged", "2026-07-26T11:00:00Z", { date: "2026-07-26", score: 30, external_id: "whoop:recovery:2" }, { source: "whoop", schema_version: 2 })
  );
  return events;
}

const diary = buildDiary();

describe("golden household", () => {
  it("pantry fold: quantities, precision, expiry — and order-independent rebuild", () => {
    // beef: 2 + 1 + 1 − 0.75×3 = 1.75 lb, expiry stands, cooks weaken to estimated
    // rice: 3 − 0.75×3 = 0.75 cup, estimated
    // eggs: 12 + 12 = 24 (null unit merges with itself), exact
    // milk: 1 l, expires 07-25, exact
    const pantry = rebuildPantry(diary);
    expect(pantry).toEqual([
      { name: "beef", qty: 1.75, unit: "lb", precision: "estimated", asserted_at: "2026-07-24T22:00:00Z", expires: "2026-07-28" },
      { name: "eggs", qty: 24, unit: null, precision: "exact", asserted_at: "2026-07-21T17:00:00Z" },
      { name: "milk", qty: 1, unit: "l", precision: "exact", asserted_at: "2026-07-22T16:00:00Z", expires: "2026-07-25" },
      { name: "rice", qty: 0.75, unit: "cup", precision: "estimated", asserted_at: "2026-07-24T22:00:00Z" },
    ]);
    expect(rebuildPantry([...diary].reverse())).toEqual(pantry);
  });

  it("fullness: beef 1.75/0.75 → 2.5 cooks (halves), rice 0.75/0.75 → 1", () => {
    const left = cooksLeft(rebuildPantry(diary), diary);
    expect(left.beef).toBe(2.5);
    expect(left.rice).toBe(1);
    expect(left.eggs).toBeUndefined(); // no cook history
  });

  it("run cadence: inflow days Jul 7/14/21 → median gap 7", () => {
    expect(medianRunGapDays(diary)).toBe(7);
  });

  it("replenisher: rice is the one almost-out staple; accepted suggestion doesn't silence", () => {
    // rice cooksLeft 1 ≤ 1 → chip; no rice inflow history → qty null
    const suggestions = suggestAdditions({
      pantry: rebuildPantry(diary),
      plans: [],
      toBuy: [],
      events: diary,
    });
    expect(suggestions).toEqual([
      { name: "rice", qty: null, unit: "cup", reason: "almost out, by your cooking history" },
    ]);
  });

  it("schedule: cook marks the meal, whoop night marks sleep, skip stands, red-zone Sunday says ease", () => {
    const days = decorateWithRecovery(rebuildSchedule(diary), recoveryByDate(diary));
    const byDate = new Map(days.map((d) => [d.date, d]));
    const statuses = (date: string) =>
      byDate.get(date)!.slots.map((s) => [s.slot_id, s.status]);
    expect(statuses("2026-07-24")).toEqual([["m1", "done"]]);
    expect(statuses("2026-07-25")).toEqual([
      ["w-fri", "skipped"],
      ["sl-fri", "done"],
    ]);
    expect(statuses("2026-07-26")).toEqual([
      ["w-sun", "planned"],
      ["mind-sun", "planned"],
    ]);
    expect(byDate.get("2026-07-26")!.recovery).toEqual({ score: 30 });
    expect(byDate.get("2026-07-26")!.advice).toBe("ease");
    expect(byDate.get("2026-07-25")!.advice).toBeUndefined();
  });

  it("exercise history: two squat sessions; progression says 145 after 3×8@140", () => {
    const history = exerciseHistory(diary);
    const sessions = history.get("back squat")!;
    expect(sessions.map((s) => [s.date, s.session_id, s.sets.length])).toEqual([
      ["2026-07-16", "sA", 3],
      ["2026-07-23", "sB", 3],
    ]);
    expect(nextTargets(SQUAT_DAY, history).get("back squat")).toMatchObject({
      weight: 145,
      unit: "lb",
    });
  });

  it("goals: cleared one drops out; strength pct 140/315; cadence weeks dedupe the whoop revision", () => {
    const goals = activeGoals(diary);
    expect(goals.map((g) => g.goal_id).sort()).toEqual(["g-cad", "g-squat"]);

    const strength = goals.find((g) => g.goal_id === "g-squat")!;
    const sp = goalProgress(strength, diary, TODAY);
    expect(sp.best).toMatchObject({ weight: 140, unit: "lb" });
    expect(sp.pct).toBeCloseTo(140 / 315, 5);

    const cadence = goals.find((g) => g.goal_id === "g-cad")!;
    const cp = goalProgress(cadence, diary, TODAY);
    // sessions: yoga Jul 9 (wk 07-06), sA Jul 16 + Running Jul 18 ONCE (wk
    // 07-13), sB Jul 23 (wk 07-20 = this week)
    expect(cp.this_week).toBe(1);
    expect(cp.weeks).toEqual([
      { week: "2026-06-29", count: 0 },
      { week: "2026-07-06", count: 1 },
      { week: "2026-07-13", count: 2 },
      { week: "2026-07-20", count: 1 },
    ]);
  });

  it("proposer: cadence 3 → Mon/Wed/Fri of next week, all Squat Day", () => {
    const proposal = proposeWorkoutWeek(
      activeGoals(diary),
      [{ id: "w1", title: "Squat Day" }],
      diary,
      TODAY
    );
    expect(proposal.days.map((d) => d.date)).toEqual(["2026-07-27", "2026-07-29", "2026-07-31"]);
    for (const day of proposal.days) {
      expect(day.slots).toEqual([{ lane: "workout", title: "Squat Day", library_id: "w1" }]);
    }
  });

  it("histories: meals ×3, workouts ×4 (revision collapsed), journal ×1, sleep ×3 nights", () => {
    expect(mealHistory(diary).map((m) => m.date)).toEqual(["2026-07-24", "2026-07-15", "2026-07-08"]);
    const workouts = workoutHistory(diary);
    expect(workouts.map((w) => [w.date, w.title, w.source])).toEqual([
      ["2026-07-23", "Squat Day", "web"],
      ["2026-07-18", "Running", "whoop"],
      ["2026-07-16", "Squat Day", "web"],
      ["2026-07-09", "yoga", "web"],
    ]);
    expect(journalHistory(diary)).toEqual([{ date: "2026-07-17", text: "good week" }]);
    expect(sleepHistory(diary).map((s) => [s.date, s.quality, s.source])).toEqual([
      ["2026-07-25", "ok", "whoop"],
      ["2026-07-18", "great", "whoop"],
      ["2026-07-08", "ok", "web"],
    ]);
  });

  it("consumption: 2.25 of each over 16 days (2.2857 wk) → 0.98/week", () => {
    const rates = weeklyUse(diary);
    expect(rates.get("beef")).toEqual({ qty: 0.98, unit: "lb" });
    expect(rates.get("rice")).toEqual({ qty: 0.98, unit: "cup" });
  });

  it("suggestion pair v2: surfaced ease + next target log pairs; resolutions carry kind; dismissal silences", async () => {
    const db = createClient({ url: ":memory:" });
    await migrate(db);
    for (const e of diary) await appendEvent(db, e);

    // Red-zone Sunday (score 30) holds one planned workout slot (w-sun):
    // surfacing logs exactly one ease_workout pair, idempotent across reads.
    const decorated = decorateWithRecovery(rebuildSchedule(diary), recoveryByDate(diary));
    const days = await attachEaseSuggestions(db, HH, decorated);
    await attachEaseSuggestions(db, HH, decorated); // repeat surface, no new event
    const sunday = days.find((d) => d.date === "2026-07-26")!;
    expect(sunday.ease_proposals).toHaveLength(1);
    expect(sunday.ease_proposals![0].slot_id).toBe("w-sun");

    // Progression (3×8@140 → 145 lb) logs one next_target pair on surface.
    const targets = await attachNextTargetSuggestions(
      db,
      HH,
      nextTargets(SQUAT_DAY, exerciseHistory(diary))
    );
    expect(targets.get("back squat")!.suggestion_id).toBeDefined();

    // sug-1 (add_to_list, already resolved in the diary) plus the two above.
    const made = await readEvents(db, HH, { type: SUGGESTION_MADE });
    expect(made).toHaveLength(3);
    const ease = made.find((e) => (e.payload as EaseWorkoutSuggestion).kind === "ease_workout")!;
    expect(ease.payload).toMatchObject({
      kind: "ease_workout",
      slot_id: "w-sun",
      date: "2026-07-26",
      recovery_score: 30,
    });
    expect(ease.precision).toBe("estimated");
    const target = made.find((e) => (e.payload as NextTargetSuggestion).kind === "next_target")!;
    expect(target.payload).toMatchObject({
      kind: "next_target",
      exercise: "back squat",
      weight: 145,
      unit: "lb",
    });
    expect(target.precision).toBe("estimated");

    // Dismissing the ease writes a kinded Resolved and silences the slot.
    const resolved = await resolveSuggestion(db, HH, {
      suggestion_id: (ease.payload as EaseWorkoutSuggestion).suggestion_id,
      outcome: "dismissed",
    });
    expect(resolved.ok).toBe(true);
    const answers = await readEvents(db, HH, { type: SUGGESTION_RESOLVED });
    expect(answers.map((e) => (e.payload as { kind?: string }).kind)).toEqual([
      undefined, // sug-1 written pre-v2 (readers default it to add_to_list)
      "ease_workout",
    ]);
    const after = await attachEaseSuggestions(db, HH, decorated);
    expect(after.find((d) => d.date === "2026-07-26")!.ease_proposals).toBeUndefined();
    expect(await readEvents(db, HH, { type: SUGGESTION_MADE })).toHaveLength(3);
  });

  it("repair pair: the skipped Friday workout menus [drop recommended, consolidate]; accept silences the slot", async () => {
    const db = createClient({ url: ":memory:" });
    await migrate(db);
    for (const e of diary) await appendEvent(db, e);

    // Hand-computed (week Mon 07-20..Sun 07-26, today Sunday): remaining day
    // = {07-26} which already holds planned w-sun → shift not viable; recovery
    // 30 < RED_ZONE 34 → double_up withheld; consolidate merges into w-sun;
    // red + last day → drop is the pick.
    const decorated = decorateWithRecovery(rebuildSchedule(diary), recoveryByDate(diary));
    const days = await attachRepairSuggestions(db, HH, decorated, recoveryByDate(diary), TODAY);
    await attachRepairSuggestions(db, HH, decorated, recoveryByDate(diary), TODAY); // idempotent

    const friday = days.find((d) => d.date === "2026-07-25")!;
    const menu = friday.repair_proposals!;
    expect(menu.map((p) => [p.option, p.recommended ?? false]).sort()).toEqual([
      ["consolidate", false],
      ["drop", true],
    ]);
    for (const p of menu) expect(p.missed_slot_id).toBe("w-fri");

    const consolidate = menu.find((p) => p.option === "consolidate")!;
    expect(consolidate.days.find((d) => d.date === "2026-07-26")!.slots).toEqual([
      { slot_id: "w-sun", lane: "workout", title: "easy run + Squat Day (merged)" },
      { slot_id: "mind-sun", lane: "mind", title: "journal" },
    ]);
    const drop = menu.find((p) => p.option === "drop")!;
    // drop proposes the plan unchanged: same three days, statuses stripped
    expect(drop.days.map((d) => d.date)).toEqual(["2026-07-24", "2026-07-25", "2026-07-26"]);
    expect(drop.days.find((d) => d.date === "2026-07-25")!.slots).toEqual([
      { slot_id: "w-fri", lane: "workout", title: "Squat Day", library_id: "w1" },
      { slot_id: "sl-fri", lane: "sleep", title: "10:30 bedtime" },
    ]);

    const made = (await readEvents(db, HH, { type: SUGGESTION_MADE })).filter(
      (e) => (e.payload as RepairSuggestion).kind === "repair"
    );
    expect(made).toHaveLength(2);
    for (const e of made) expect(e.precision).toBe("estimated");

    // Accepting drop writes a kinded Resolved and retires the whole menu.
    const resolved = await resolveSuggestion(db, HH, {
      suggestion_id: drop.suggestion_id,
      outcome: "accepted",
    });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) expect(resolved.payload.kind).toBe("repair");
    const after = await attachRepairSuggestions(db, HH, decorated, recoveryByDate(diary), TODAY);
    expect(after.find((d) => d.date === "2026-07-25")!.repair_proposals).toBeUndefined();
    expect(
      (await readEvents(db, HH, { type: SUGGESTION_MADE })).filter(
        (e) => (e.payload as RepairSuggestion).kind === "repair"
      )
    ).toHaveLength(2);
  });

  it("expiry: milk expired leads, beef inside the 7-day window; chili is the use-soon answer for beef", () => {
    const pantry = rebuildPantry(diary);
    const expiring = expiringItems(pantry, TODAY);
    expect(expiring).toEqual([
      { name: "milk", expires: "2026-07-25", expired: true },
      { name: "beef", expires: "2026-07-28" },
    ]);
    expect(useSoonSuggestions(expiring, [{ id: "lib-chili", plan: CHILI }])).toEqual([
      { name: "beef", expires: "2026-07-28", recipes: [{ library_id: "lib-chili", title: "Chili" }] },
    ]);
  });
});
