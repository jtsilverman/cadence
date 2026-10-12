// Energy-aware daily targets. Kept out of the cooked-meal fold on purpose:
// RecipeCooked is what the household made; ExertionLogged / activity calories
// are what a device measured. This module only decides how much of that
// measured movement to add to the stated nutrition goal.
//
// Modest by construction:
// - ignore under 50 kcal (noise, not a training day)
// - never add more than half the stated daily target
// - a day-level active_calories figure wins over summing workouts, so a
//   Garmin day and its activities are not counted twice
// - WHOOP cycle kilojoules are not active calories (see ExertionLoggedPayload)

import type { EventEnvelope, ExertionLoggedPayload, SessionLoggedPayload } from "./contracts";
import { EXERTION_LOGGED, SESSION_LOGGED } from "./contracts";
import { localDate } from "./dates";
import { resolveRevisions } from "./events";

export const EXPENDITURE_FLOOR = 50;
export const EXPENDITURE_CAP_FRACTION = 0.5;

export function adjustedDailyTarget(base: number, activeCalories: number | undefined): number {
  if (activeCalories == null || !Number.isFinite(activeCalories) || activeCalories < EXPENDITURE_FLOOR) {
    return base;
  }
  const added = Math.min(Math.round(activeCalories), Math.round(base * EXPENDITURE_CAP_FRACTION));
  return base + added;
}

// Latest day-level active calories per date. Workout calories fill only the
// dates no day summary covered.
export function activeCaloriesByDate(events: EventEnvelope[]): Map<string, number> {
  const byDate = new Map<string, number>();
  const dayLevel = new Map<string, { ts: string; id: string; kcal: number }>();
  for (const event of resolveRevisions(events, EXERTION_LOGGED)) {
    const payload = event.payload as ExertionLoggedPayload;
    if (payload.active_calories == null || !Number.isFinite(payload.active_calories)) continue;
    const id = payload.external_id ?? event.event_id;
    const prev = dayLevel.get(payload.date);
    if (!prev || event.ts > prev.ts || (event.ts === prev.ts && id > prev.id)) {
      dayLevel.set(payload.date, { ts: event.ts, id, kcal: payload.active_calories });
    }
  }
  for (const [date, row] of dayLevel) byDate.set(date, row.kcal);

  const workoutSum = new Map<string, number>();
  for (const event of resolveRevisions(events, SESSION_LOGGED)) {
    const payload = event.payload as SessionLoggedPayload;
    if (payload.calories == null || !Number.isFinite(payload.calories) || payload.calories <= 0) continue;
    const date = localDate(event.ts);
    if (byDate.has(date)) continue;
    workoutSum.set(date, (workoutSum.get(date) ?? 0) + payload.calories);
  }
  for (const [date, kcal] of workoutSum) {
    if (!byDate.has(date)) byDate.set(date, kcal);
  }
  return byDate;
}
