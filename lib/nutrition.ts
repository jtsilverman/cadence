// The calorie budget fold (spec nutrition): cooked-meal macro snapshots →
// per-day and Monday-week budget numbers. Pure readers; the one source of
// truth behind BOTH the schedule's budget decoration and nutrition goal
// progress, so the two surfaces can never drift. Unknowns are surfaced
// (unknown_meals), never silently zeroed. Suggest-only: nothing here writes.

import type { Client } from "@libsql/client";
import type {
  EventEnvelope,
  NutritionAdjustSuggestion,
  RecipeCookedPayload,
} from "./contracts";
import { RECIPE_COOKED } from "./contracts";
import { isoAddDays, localDate, mondayOf } from "./dates";
import { resolveRevisions } from "./events";
import type { DayState } from "./schedule";
import { logSuggestions, readSuggestionState } from "./suggestions";

export interface DayCooked {
  calories: number;
  unknown: number; // cooked meals with no macro snapshot
}

// One pass over the diary: calories eaten per household-local date.
export function cookedByDate(events: EventEnvelope[]): Map<string, DayCooked> {
  const byDate = new Map<string, DayCooked>();
  for (const event of resolveRevisions(events, RECIPE_COOKED)) {
    const date = localDate(event.ts);
    const entry = byDate.get(date) ?? { calories: 0, unknown: 0 };
    const nutrition = (event.payload as RecipeCookedPayload).nutrition;
    if (nutrition) entry.calories += nutrition.calories;
    else entry.unknown += 1;
    byDate.set(date, entry);
  }
  return byDate;
}

export interface WeekBudget {
  week_start: string;
  week_consumed: number;
  week_target: number;
  unknown_meals: number;
}

// The smoothed budget (UX.md:59): a weekly envelope of 7× the daily target,
// scoped to the Monday-start week containing dateISO.
export function weekBudget(
  byDate: Map<string, DayCooked>,
  dateISO: string,
  dailyCalories: number
): WeekBudget {
  const weekStart = mondayOf(dateISO);
  const weekEnd = isoAddDays(weekStart, 6);
  let consumed = 0;
  let unknown = 0;
  for (const [date, entry] of byDate) {
    if (date < weekStart || date > weekEnd) continue;
    consumed += entry.calories;
    unknown += entry.unknown;
  }
  return {
    week_start: weekStart,
    week_consumed: consumed,
    week_target: dailyCalories * 7,
    unknown_meals: unknown,
  };
}

export interface DayBudget {
  consumed: number;
  target: number;
  week_consumed: number;
  week_target: number;
  unknown_meals: number;
}

// Decorate every plan day with its own date's intake and its week's envelope.
export function decorateBudgets(
  days: DayState[],
  byDate: Map<string, DayCooked>,
  dailyCalories: number
): DayState[] {
  return days.map((day) => {
    const week = weekBudget(byDate, day.date, dailyCalories);
    const budget: DayBudget = {
      consumed: byDate.get(day.date)?.calories ?? 0,
      target: dailyCalories,
      week_consumed: week.week_consumed,
      week_target: week.week_target,
      unknown_meals: week.unknown_meals,
    };
    return { ...day, budget };
  });
}

export type NutritionAdjustProposal = Omit<NutritionAdjustSuggestion, "suggestion_id">;

const OVERSHOOT_TOLERANCE = 1.1; // a correction only past 10% over — smoothing, not nagging
const DAILY_CAP_FRACTION = 0.25; // never ask for more than a quarter-day trim

// The overshoot correction (spec nutrition AC7). Pure: same diary, same day,
// byte-identical proposal. Capped and spread (UX.md:59), never a swing.
export function computeNutritionAdjust(
  byDate: Map<string, DayCooked>,
  todayISO: string,
  dailyCalories: number
): NutritionAdjustProposal | null {
  const week = weekBudget(byDate, todayISO, dailyCalories);
  if (week.week_consumed <= week.week_target * OVERSHOOT_TOLERANCE) return null;
  const overage = week.week_consumed - week.week_target;
  const weekEnd = isoAddDays(week.week_start, 6);
  let daysRemaining = 0;
  for (let date = todayISO; date <= weekEnd; date = isoAddDays(date, 1)) {
    daysRemaining += 1;
  }
  // floor of 1: a degenerate daily target must never emit a zero cap, which
  // would violate the kind's own gate ("per_day_cap must be a positive number")
  const perDayCap = Math.max(
    1,
    Math.min(Math.ceil(overage / daysRemaining), Math.round(dailyCalories * DAILY_CAP_FRACTION))
  );
  return {
    kind: "nutrition_adjust",
    week_start: week.week_start,
    overage_calories: overage,
    per_day_cap: perDayCap,
    days_remaining: daysRemaining,
    reason:
      `you're ${overage} calories over this week's ${week.week_target} budget — ` +
      `trim up to ${perDayCap} a day across the next ${daysRemaining} days: ` +
      `lighter portions or a swapped snack, never a skipped meal`,
  };
}

const isAdjust = (p: { kind: string }): p is NutritionAdjustSuggestion =>
  p.kind === "nutrition_adjust";

// The attach idiom (lib/repair.ts): compute, silence, log idempotently, and
// pin the open proposal onto the first plan day of the overshot week. Any
// resolution — taken or waved off — silences that week for good.
export async function attachNutritionAdjust(
  db: Client,
  householdId: string,
  days: DayState[],
  byDate: Map<string, DayCooked>,
  todayISO: string,
  dailyCalories: number
): Promise<DayState[]> {
  const proposal = computeNutritionAdjust(byDate, todayISO, dailyCalories);
  if (!proposal) return days;

  const { accepted, dismissed } = await readSuggestionState(db, householdId);
  const resolvedWeeks = new Set(
    [...accepted, ...dismissed].filter(isAdjust).map((p) => p.week_start)
  );
  if (resolvedWeeks.has(proposal.week_start)) return days;

  const logged = (await logSuggestions(db, householdId, [proposal])).filter(isAdjust);
  if (logged.length === 0) return days;

  const weekEnd = isoAddDays(proposal.week_start, 6);
  const anchor = days.find((d) => d.date >= proposal.week_start && d.date <= weekEnd);
  if (!anchor) return days;
  return days.map((day) =>
    day.date === anchor.date ? { ...day, nutrition_proposals: logged } : day
  );
}
