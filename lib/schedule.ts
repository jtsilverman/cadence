// The schedule fold (spec schedule-spine criteria 1-3): pure readers over the
// diary. Latest SchedulePlanned snapshot is the plan; done/skip state joins
// typed log events onto slots. No tables — same events, same grid, always.

import type { Client } from "@libsql/client";
import type {
  EventEnvelope,
  JournalEntryPayload,
  NutritionAdjustSuggestion,
  RecipeCookedPayload,
  RepairSuggestion,
  SchedulePlannedPayload,
  ScheduleSlot,
  SessionLoggedPayload,
  SleptLoggedPayload,
  SlotLane,
  SlotSkippedPayload,
} from "./contracts";
import {
  JOURNAL_ENTRY,
  RECIPE_COOKED,
  SCHEDULE_PLANNED,
  SESSION_LOGGED,
  SLEPT_LOGGED,
  SLOT_LANES,
  SLOT_SKIPPED,
} from "./contracts";
import { isValidDate, localDate, mondayOf } from "./dates";
import { byFoldOrder, eventInsert, newEventId, readEvents, retractedIds } from "./events";
// type-only in the other direction, so this cycle is erased at runtime
import { attachEaseSuggestions, decorateWithRecovery, recoveryByDate } from "./recovery";
import { attachRepairSuggestions } from "./repair";
import { activeGoals } from "./goals";
import { activeCaloriesByDate } from "./energy";
import { attachNutritionAdjust, cookedByDate, decorateBudgets } from "./nutrition";
import { activeProgram, programPosition } from "./program";

export interface SlotState extends ScheduleSlot {
  status: "planned" | "done" | "skipped";
}

export interface DayState {
  date: string;
  slots: SlotState[];
  // wearable decoration (lib/recovery.ts): the day's latest recovery reading,
  // and "ease" when a red-zone score meets a still-planned workout.
  recovery?: { score?: number; hrv?: number; resting_hr?: number };
  advice?: "ease";
  // the logged pair behind the advice (spec suggestion-pair-v2): one open
  // ease_workout proposal per still-planned workout slot on a red-zone day.
  ease_proposals?: Array<{ slot_id: string; suggestion_id: string }>;
  // the logged repair menu (spec repair-engine): open proposals for this
  // day's skipped workout slots, full payloads so accept can POST the days.
  repair_proposals?: RepairSuggestion[];
  // the calorie budget decoration (spec nutrition): present only while a
  // nutrition goal is active. Typed in lib/nutrition.ts (fold owns the shape).
  budget?: import("./nutrition").DayBudget;
  // the open week-overshoot correction, pinned to the overshot week's first
  // plan day (spec nutrition AC7)
  nutrition_proposals?: NutritionAdjustSuggestion[];
}

// Latest snapshot is the plan; logs join as status. Done beats skipped (if
// you logged it, it happened). Logs pointing at slots the latest snapshot no
// longer contains are ignored — orphans never crash the grid.
export function rebuildSchedule(events: EventEnvelope[]): DayState[] {
  const ordered = [...events].sort(byFoldOrder);

  let plan: SchedulePlannedPayload["days"] = [];
  for (const event of ordered) {
    if (event.type === SCHEDULE_PLANNED) {
      plan = (event.payload as SchedulePlannedPayload).days;
    }
  }
  if (plan.length === 0) return [];

  // Collect resolutions in one pass: by slot_id, and date-keyed pools for the
  // slot_id-less joins (meals by library_id + cook date, sleep by date).
  const doneBySlot = new Set<string>();
  const skippedBySlot = new Set<string>();
  const cooksByDate = new Map<string, string[]>(); // date → library_ids (multiset)
  const sleptDates = new Set<string>();
  const retracted = retractedIds(ordered); // the undo trail: joins forget these
  for (const event of ordered) {
    if (retracted.has(event.event_id)) continue;
    if (event.type === SESSION_LOGGED || event.type === JOURNAL_ENTRY) {
      const slotId = (event.payload as SessionLoggedPayload | JournalEntryPayload).slot_id;
      if (slotId) doneBySlot.add(slotId);
    } else if (event.type === SLOT_SKIPPED) {
      skippedBySlot.add((event.payload as SlotSkippedPayload).slot_id);
    } else if (event.type === RECIPE_COOKED) {
      const date = localDate(event.ts); // household-local: 8:30pm ET is still today
      const ids = cooksByDate.get(date) ?? [];
      ids.push((event.payload as RecipeCookedPayload).library_id);
      cooksByDate.set(date, ids);
    } else if (event.type === SLEPT_LOGGED) {
      sleptDates.add((event.payload as SleptLoggedPayload).date);
    }
  }

  // Date-keyed resolutions are consumed across ALL of a date's day entries —
  // a snapshot may repeat a date, and a per-entry pool copy would let one
  // cook (or one night's sleep) mark a slot in every duplicate entry.
  const sleepConsumed = new Set<string>();
  return [...plan]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((day) => {
      // one cook marks one slot: consume from the date's cook pool in slot order
      const cookPool = cooksByDate.get(day.date) ?? [];
      const slots = day.slots.map((slot): SlotState => {
        let done = doneBySlot.has(slot.slot_id);
        if (!done && slot.lane === "meal" && slot.library_id) {
          const i = cookPool.indexOf(slot.library_id);
          if (i !== -1) {
            cookPool.splice(i, 1);
            done = true;
          }
        }
        if (!done && slot.lane === "sleep" && !sleepConsumed.has(day.date) && sleptDates.has(day.date)) {
          sleepConsumed.add(day.date);
          done = true;
        }
        const status = done ? "done" : skippedBySlot.has(slot.slot_id) ? "skipped" : "planned";
        return { ...slot, status };
      });
      return { date: day.date, slots };
    });
}

// The full replacement snapshot latest-wins demands (contracts.ts ProposedDays):
// every plan day, fold statuses stripped. A partial days array would delete
// unlisted days on apply. Shared by repair options and the exchange producer.
export const proposedSnapshot = (days: DayState[]): import("./contracts").ProposedDays =>
  days.map((day) => ({
    date: day.date,
    slots: day.slots.map(({ status: _status, ...rest }) => rest),
  }));

// Gate for untrusted API bodies. Slots without a slot_id are new — mint one;
// existing ids pass through untouched so logs stay attached across edits.
// Duplicate ids are rejected: one log event must never mark two slots.
export function parseScheduleDays(
  value: unknown
): { ok: true; days: SchedulePlannedPayload["days"] } | { ok: false; reason: string } {
  if (!Array.isArray(value)) return { ok: false, reason: "days must be an array" };
  const seenIds = new Set<string>();
  const days: SchedulePlannedPayload["days"] = [];
  for (const entry of value) {
    const { date, slots } = (entry ?? {}) as Record<string, unknown>;
    if (typeof date !== "string" || !isValidDate(date)) {
      return { ok: false, reason: "every day needs a real YYYY-MM-DD date" };
    }
    if (!Array.isArray(slots)) return { ok: false, reason: `slots must be an array (${date})` };
    const parsed: ScheduleSlot[] = [];
    for (const raw of slots) {
      const { slot_id, lane, title, library_id, priority } = (raw ?? {}) as Record<string, unknown>;
      if (!SLOT_LANES.includes(lane as SlotLane)) {
        return { ok: false, reason: `lane must be one of ${SLOT_LANES.join(" | ")}` };
      }
      const trimmed = typeof title === "string" ? title.trim() : "";
      if (!trimmed) return { ok: false, reason: "every slot needs a title" };
      if (library_id !== undefined && typeof library_id !== "string") {
        return { ok: false, reason: `bad library_id for "${trimmed}"` };
      }
      const id = typeof slot_id === "string" && slot_id ? slot_id : `slot-${newEventId()}`;
      if (seenIds.has(id)) {
        return { ok: false, reason: `duplicate slot_id "${id}"` };
      }
      seenIds.add(id);
      const slot: ScheduleSlot = {
        slot_id: id,
        lane: lane as SlotLane,
        title: trimmed,
      };
      if (typeof library_id === "string") slot.library_id = library_id;
      if (priority !== undefined) {
        if (priority !== "high") {
          return { ok: false, reason: `priority, when present, must be "high" ("${trimmed}")` };
        }
        slot.priority = "high";
      }
      parsed.push(slot);
    }
    days.push({ date, slots: parsed });
  }
  return { ok: true, days };
}

// Snapshot writes serialize behind an in-process chain (the pantry-write
// idiom): concurrent edits race read-fold-write and the loser's stale
// snapshot would drop the winner's slots. Cross-instance last-write-wins is
// accepted for a single household.
let scheduleWriteChain: Promise<unknown> = Promise.resolve();

export function planSchedule(
  db: Client,
  householdId: string,
  days: SchedulePlannedPayload["days"]
): Promise<void> {
  const run = async (): Promise<void> => {
    const payload: SchedulePlannedPayload = { days };
    await db.execute(
      eventInsert({
        event_id: newEventId(),
        household_id: householdId,
        type: SCHEDULE_PLANNED,
        ts: new Date().toISOString(),
        source: "web",
        payload,
        schema_version: 1,
        // the user explicitly placed these slots
        precision: "exact",
      })
    );
  };
  const next = scheduleWriteChain.then(run, run);
  scheduleWriteChain = next.catch(() => {});
  return next;
}

// The one payload every schedule surface returns (GET/POST /api/schedule and
// the /api/log receipt): fold + recovery + both suggestion producers, all fed
// from a SINGLE diary scan — the events table has no type index, so a second
// unfiltered read on the hot path would double the whole-diary cost.
export async function scheduleView(db: Client, householdId: string): Promise<DayState[]> {
  const events = await readEvents(db, householdId);
  const recovery = recoveryByDate(events);
  const today = localDate(new Date().toISOString());
  let days = decorateWithRecovery(rebuildSchedule(events), recovery);
  days = await attachEaseSuggestions(db, householdId, days);
  const program = activeProgram(events);
  days = await attachRepairSuggestions(db, householdId, days, recovery, today, {
    position: program ? programPosition(program, events, today) : null,
  });
  const nutritionGoal = activeGoals(events).find(
    (g) => g.kind === "nutrition" && g.daily_calories
  );
  if (nutritionGoal?.daily_calories) {
    const byDate = cookedByDate(events);
    // Measured movement raises today's target. The stated goal is still the
    // base; lib/energy.ts owns the cap. FoodLogged (MyFitnessPal) stays out
    // of cookedByDate so a meal logged in both places is not counted twice.
    const active = activeCaloriesByDate(events);
    days = decorateBudgets(days, byDate, nutritionGoal.daily_calories, active);
    days = await attachNutritionAdjust(
      db, householdId, days, byDate, today, nutritionGoal.daily_calories, active
    );
  }
  return days;
}

// The cart builds from the standing plan: still-planned meal slots in the
// Monday-start week containing today. Done meals already left the pantry
// (re-including them would re-buy); skipped meals aren't being cooked.
export function currentWeekMealIds(days: DayState[], todayISO: string): string[] {
  const start = mondayOf(todayISO);
  const sunday = new Date(`${start}T00:00:00Z`);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const end = sunday.toISOString().slice(0, 10);

  const ids: string[] = [];
  for (const day of days) {
    if (day.date < start || day.date > end) continue;
    for (const slot of day.slots) {
      if (slot.lane === "meal" && slot.status === "planned" && slot.library_id) {
        ids.push(slot.library_id);
      }
    }
  }
  return ids;
}
