// Recovery next to the schedule (spec wearable-ingest criterion 8): pure
// readers over the diary, plus one producer — surfaced ease advice logs the
// suggestion pair (spec suggestion-pair-v2). No schedule mutation, ever;
// applying advice stays the user's explicit POST.

import type { Client } from "@libsql/client";
import type {
  EaseWorkoutSuggestion,
  EventEnvelope,
  RecoveryLoggedPayload,
} from "./contracts";
import { RECOVERY_LOGGED } from "./contracts";
import { resolveRevisions } from "./events";
import type { DayState } from "./schedule";
import {
  logSuggestions,
  readSuggestionState,
  type SuggestionProposal,
} from "./suggestions";

// Whoop's published recovery bands put red at 0-33 (green 67-100, yellow
// 34-66). UNVERIFIED against live API docs pending WHOOP_* keys — confirm at
// the live probe and adjust here (spec criterion 8).
export const RED_ZONE = 34;
// Genuinely green (the 67-100 band): the bar for recommending EXTRA load
// (double_up pick) — yellow clears the offer, not the recommendation.
export const GREEN_ZONE = 67;

export interface DayRecovery {
  score?: number;
  hrv?: number;
  resting_hr?: number;
}

// Latest recovery per date. Two layers of latest-wins: a revised device
// record (same external_id) supersedes its original, then the newest
// surviving event per date wins (a device reading after a manual guess).
export function recoveryByDate(events: EventEnvelope[]): Map<string, DayRecovery> {
  const latestPerDate = new Map<string, EventEnvelope>();
  for (const event of resolveRevisions(events, RECOVERY_LOGGED)) {
    latestPerDate.set((event.payload as RecoveryLoggedPayload).date, event);
  }

  const result = new Map<string, DayRecovery>();
  for (const [date, event] of latestPerDate) {
    const { score, hrv, resting_hr } = event.payload as RecoveryLoggedPayload;
    const day: DayRecovery = {};
    if (score != null) day.score = score;
    if (hrv != null) day.hrv = hrv;
    if (resting_hr != null) day.resting_hr = resting_hr;
    result.set(date, day);
  }
  return result;
}

// Latest reading on or before today: recovery only exists for past mornings,
// so "how recovered am I" is always a look-back. Shared by repair gating and
// the planner's draft tuning.
export function latestScore(
  recovery: Map<string, DayRecovery>,
  todayISO: string
): number | undefined {
  let bestDate: string | undefined;
  let bestScore: number | undefined;
  for (const [date, reading] of recovery) {
    if (date > todayISO || reading.score == null) continue;
    if (bestDate === undefined || date > bestDate) {
      bestDate = date;
      bestScore = reading.score;
    }
  }
  return bestScore;
}

// Ease advice becomes a logged pair (spec suggestion-pair-v2): every surfaced
// red-zone ease gets an idempotent SuggestionMade per still-planned workout
// slot; a dismissed slot is silenced for good (slots are date-bound, so the
// silence naturally expires with the plan). The advice field itself stays
// deterministic response data.
export async function attachEaseSuggestions(
  db: Client,
  householdId: string,
  days: DayState[]
): Promise<DayState[]> {
  const { dismissed } = await readSuggestionState(db, householdId);
  const dismissedSlots = new Set(
    dismissed
      .filter((p): p is EaseWorkoutSuggestion => p.kind === "ease_workout")
      .map((p) => p.slot_id)
  );

  const proposals: SuggestionProposal[] = [];
  for (const day of days) {
    if (day.advice !== "ease" || day.recovery?.score == null) continue;
    for (const slot of day.slots) {
      if (slot.lane !== "workout" || slot.status !== "planned") continue;
      if (dismissedSlots.has(slot.slot_id)) continue;
      proposals.push({
        kind: "ease_workout",
        slot_id: slot.slot_id,
        date: day.date,
        recovery_score: day.recovery.score,
        reason: `recovery ${day.recovery.score} this morning — consider easing this workout`,
      });
    }
  }
  if (proposals.length === 0) return days;

  const logged = await logSuggestions(db, householdId, proposals);
  const idBySlot = new Map(
    logged
      .filter((p): p is EaseWorkoutSuggestion => p.kind === "ease_workout")
      .map((p) => [p.slot_id, p.suggestion_id])
  );
  return days.map((day) => {
    const ease = day.slots
      .filter((slot) => idBySlot.has(slot.slot_id))
      .map((slot) => ({
        slot_id: slot.slot_id,
        suggestion_id: idBySlot.get(slot.slot_id) as string,
      }));
    return ease.length > 0 ? { ...day, ease_proposals: ease } : day;
  });
}

// Days gain their recovery reading, and a red-zone day still holding a
// planned (not done, not skipped) workout gets advice: "ease".
export function decorateWithRecovery(
  days: DayState[],
  recovery: Map<string, DayRecovery>
): DayState[] {
  return days.map((day) => {
    const reading = recovery.get(day.date);
    if (!reading) return day;
    const decorated: DayState = { ...day, recovery: reading };
    const plannedWorkout = day.slots.some(
      (slot) => slot.lane === "workout" && slot.status === "planned"
    );
    if (reading.score != null && reading.score < RED_ZONE && plannedWorkout) {
      decorated.advice = "ease";
    }
    return decorated;
  });
}
