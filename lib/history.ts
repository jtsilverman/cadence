// The diary, readable per lane (spec consumption-expiry criterion 5). Pure
// readers, newest first, household-local dates, device revisions resolved
// latest-per-external_id (the recovery-view rule) so nothing double-shows.

import type {
  EventEnvelope,
  JournalEntryPayload,
  RecipeCookedPayload,
  SessionLoggedPayload,
  SleptLoggedPayload,
} from "./contracts";
import {
  JOURNAL_ENTRY,
  RECIPE_COOKED,
  SESSION_LOGGED,
  SLEPT_LOGGED,
} from "./contracts";
import { localDate } from "./dates";
import { byFoldOrder, resolveRevisions as resolved, retractedIds } from "./events";

export interface MealEntry {
  date: string;
  title: string;
  library_id: string;
  quantity?: number;
  unit?: string;
  manual_log?: boolean;
}

export function mealHistory(events: EventEnvelope[]): MealEntry[] {
  return resolved(events, RECIPE_COOKED)
    .map((event) => {
      const p = event.payload as RecipeCookedPayload;
      return {
        date: localDate(event.ts),
        title: p.title,
        library_id: p.library_id,
        ...(p.quantity !== undefined ? { quantity: p.quantity, unit: p.unit } : {}),
        ...(p.manual_log ? { manual_log: true } : {}),
      };
    })
    .reverse();
}

export interface MealTrailEntry extends MealEntry {
  event_id: string;
  retracted: boolean;
  precision: EventEnvelope["precision"];
  source: string;
}

export function mealHistoryWithTrail(events: EventEnvelope[]): MealTrailEntry[] {
  const retracted = retractedIds(events);
  return [...events]
    .sort(byFoldOrder)
    .filter((event) => event.type === RECIPE_COOKED)
    .map((event) => {
      const payload = event.payload as RecipeCookedPayload;
      return {
        event_id: event.event_id,
        date: localDate(event.ts),
        title: payload.title,
        library_id: payload.library_id,
        ...(payload.quantity !== undefined ? { quantity: payload.quantity, unit: payload.unit } : {}),
        ...(payload.manual_log ? { manual_log: true } : {}),
        retracted: retracted.has(event.event_id),
        precision: event.precision,
        source: event.source,
      };
    })
    .reverse();
}

export interface WorkoutEntry {
  date: string;
  title: string;
  kind: "structured" | "loose";
  source: string;
  session_id?: string;
  library_id?: string;
}

export function workoutHistory(events: EventEnvelope[]): WorkoutEntry[] {
  return resolved(events, SESSION_LOGGED)
    .map((event) => {
      const p = event.payload as SessionLoggedPayload;
      const entry: WorkoutEntry = {
        date: localDate(event.ts),
        title: p.title,
        kind: p.kind,
        source: event.source,
      };
      if (p.session_id) entry.session_id = p.session_id;
      if (p.library_id) entry.library_id = p.library_id;
      return entry;
    })
    .reverse();
}

export interface JournalHistoryEntry {
  date: string;
  text: string;
  slot_id?: string;
  mood?: number; // 1-5, only when the entry carried one
}

export function journalHistory(events: EventEnvelope[]): JournalHistoryEntry[] {
  return resolved(events, JOURNAL_ENTRY)
    .map((event) => {
      const p = event.payload as JournalEntryPayload;
      const entry: JournalHistoryEntry = { date: localDate(event.ts), text: p.text };
      if (p.slot_id) entry.slot_id = p.slot_id;
      if (p.mood !== undefined) entry.mood = p.mood;
      return entry;
    })
    .reverse();
}

export interface SleepEntry {
  date: string;
  quality: SleptLoggedPayload["quality"];
  hours?: number;
  score?: number;
  source: string;
}

// One row per night: after external_id revisions collapse, the latest event
// per payload date wins (a device reading supersedes a manual guess).
export function sleepHistory(events: EventEnvelope[]): SleepEntry[] {
  const perNight = new Map<string, EventEnvelope>();
  for (const event of resolved(events, SLEPT_LOGGED)) {
    perNight.set((event.payload as SleptLoggedPayload).date, event);
  }
  return [...perNight.values()]
    .map((event) => {
      const p = event.payload as SleptLoggedPayload;
      const entry: SleepEntry = { date: p.date, quality: p.quality, source: event.source };
      if (p.hours != null) entry.hours = p.hours;
      if (p.score != null) entry.score = p.score;
      return entry;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
}
