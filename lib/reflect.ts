// The weekly review folds (spec coach-reflect): the week you actually lived,
// streaks recomputed from the diary (never hand-maintained), and ONE prompt
// whose topic is picked deterministically. Pure readers; the LLM only ever
// rephrases the template (lib/reflect-language.ts). Suggest-only untouched:
// nothing here writes, and the prompt is review copy, not a pair.

import type { EventEnvelope, ProgramWeekKind } from "./contracts";
import {
  JOURNAL_ENTRY,
  RECIPE_COOKED,
  SESSION_LOGGED,
  SLEPT_LOGGED,
} from "./contracts";
import { isoAddDays, localDate, mondayOf } from "./dates";
import { resolveRevisions } from "./events";
import type { ProgramPosition } from "./program";
import type { DayState } from "./schedule";

export interface LaneCount {
  planned: number; // ALL scheduled slots that week (done + skipped + pending)
  done: number;
}

export interface WeekReview {
  week_start: string;
  meals: LaneCount;
  workouts: LaneCount;
  sleep_nights: number;
  prior_sleep_nights: number;
  journal_count: number;
  mood?: { avg: number; prior_avg?: number };
}

const inWeek = (date: string, weekStart: string): boolean =>
  date >= weekStart && date <= isoAddDays(weekStart, 6);

// The current Monday-week, counted from the resolved schedule + diary.
export function weekReview(
  events: EventEnvelope[],
  days: DayState[],
  todayISO: string
): WeekReview {
  const weekStart = mondayOf(todayISO);
  const priorStart = isoAddDays(weekStart, -7);

  const lane = (which: "meal" | "workout"): LaneCount => {
    const slots = days
      .filter((d) => inWeek(d.date, weekStart))
      .flatMap((d) => d.slots.filter((s) => s.lane === which));
    return {
      planned: slots.length, // skips stay in the denominator — misses don't vanish
      done: slots.filter((s) => s.status === "done").length,
    };
  };

  const sleepNights = (start: string): number => {
    const dates = new Set<string>();
    for (const e of resolveRevisions(events, SLEPT_LOGGED)) {
      const date = (e.payload as { date: string }).date;
      if (inWeek(date, start)) dates.add(date);
    }
    return dates.size;
  };

  const moodsIn = (start: string): number[] =>
    resolveRevisions(events, JOURNAL_ENTRY)
      .filter((e) => inWeek(localDate(e.ts), start))
      .map((e) => (e.payload as { mood?: number }).mood)
      .filter((m): m is number => m !== undefined);

  const avg = (xs: number[]): number | undefined =>
    xs.length === 0 ? undefined : Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;

  const review: WeekReview = {
    week_start: weekStart,
    meals: lane("meal"),
    workouts: lane("workout"),
    sleep_nights: sleepNights(weekStart),
    prior_sleep_nights: sleepNights(priorStart),
    journal_count: resolveRevisions(events, JOURNAL_ENTRY).filter((e) =>
      inWeek(localDate(e.ts), weekStart)
    ).length,
  };
  const thisAvg = avg(moodsIn(weekStart));
  if (thisAvg !== undefined) {
    const priorAvg = avg(moodsIn(priorStart));
    review.mood = { avg: thisAvg, ...(priorAvg !== undefined ? { prior_avg: priorAvg } : {}) };
  }
  return review;
}

export interface WeekStreaks {
  training?: number;
  cooking?: number;
  journaling?: number;
}

const STREAK_SIGNALS: Array<[keyof WeekStreaks, string]> = [
  ["training", SESSION_LOGGED],
  ["cooking", RECIPE_COOKED],
  ["journaling", JOURNAL_ENTRY],
];
const MAX_STREAK_WEEKS = 260; // five years of weeks — a scan bound, not a cap you hit

// Consecutive qualifying weeks scanning back from the current week. The
// in-progress week qualifies with >=1 event; an EMPTY current week starts the
// scan at last week — a Tuesday reader never sees Monday break their streak.
// Zero qualifying weeks = the signal is absent, never a "0-day streak".
export function weekStreaks(events: EventEnvelope[], todayISO: string): WeekStreaks {
  const thisMonday = mondayOf(todayISO);
  const streaks: WeekStreaks = {};
  for (const [name, type] of STREAK_SIGNALS) {
    const weeks = new Set(
      resolveRevisions(events, type).map((e) => mondayOf(localDate(e.ts)))
    );
    let start = weeks.has(thisMonday) ? thisMonday : isoAddDays(thisMonday, -7);
    let count = 0;
    for (let week = start, i = 0; weeks.has(week) && i < MAX_STREAK_WEEKS; week = isoAddDays(week, -7), i++) {
      count += 1;
    }
    if (count > 0) streaks[name] = count;
  }
  return streaks;
}

export interface PromptPick {
  basis: "milestone" | "streak" | "sleep" | "mood" | "generic";
  text: string;
}

const STREAK_BAR = 3;

// ONE prompt, topic picked deterministically by fixed priority (spec AC3);
// every template is a complete, shippable question — the LLM only rephrases.
export function pickPromptBasis(
  review: WeekReview,
  streaks: WeekStreaks,
  position: ProgramPosition | null,
  priorPosition: ProgramPosition | null
): PromptPick {
  if (position && priorPosition) {
    // a TRANSITION between the two weeks, never a persistent state — a
    // finished block must not re-announce itself every Sunday forever
    const phaseChanged =
      position.phase !== priorPosition.phase ||
      (position.status === "complete" && priorPosition.status !== "complete");
    if (phaseChanged) {
      const where =
        position.status === "complete"
          ? "the block is complete"
          : `you just moved into the ${position.phase as ProgramWeekKind} phase`;
      return {
        basis: "milestone",
        text: `Week ${position.week_index} of ${position.total_weeks} — ${where}. What's different in your body since week 1?`,
      };
    }
  }
  const best = (Object.entries(streaks) as Array<[string, number]>)
    .filter(([, n]) => n >= STREAK_BAR)
    .sort((a, b) => b[1] - a[1])[0];
  if (best) {
    return {
      basis: "streak",
      text: `That's ${best[1]} weeks of ${best[0]} in a row. What's making it stick this time?`,
    };
  }
  if (review.sleep_nights < review.prior_sleep_nights) {
    return {
      basis: "sleep",
      text: `Sleep logging slipped this week (${review.sleep_nights} nights vs ${review.prior_sleep_nights}). What's been eating the evenings?`,
    };
  }
  if (
    review.mood?.prior_avg !== undefined &&
    review.mood.prior_avg - review.mood.avg >= 1
  ) {
    return {
      basis: "mood",
      text: "This week felt heavier than last. What's one thing that would lighten next week?",
    };
  }
  return { basis: "generic", text: "What stood out this week?" };
}
