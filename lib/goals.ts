// Goals (spec workout-engine criterion 6): GoalSet events, latest-wins per
// goal_id (the PreferenceSet idiom, no view table), plus pure progress
// readers — strength against exercise history, cadence against weekly
// session counts. Suggest-only untouched: goals never write anything else.

import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import type {
  EventEnvelope,
  GoalSetPayload,
  ProgramDefinition,
  SessionLoggedPayload,
} from "./contracts";
import { GOAL_SET, SESSION_LOGGED } from "./contracts";
import { isoAddDays, localDate, mondayOf } from "./dates";
import { programPosition } from "./program";
import { appendEvent, byFoldOrder, dropRetracted, newEventId, resolveRevisions } from "./events";
import { activeCaloriesByDate } from "./energy";
import { cookedByDate, weekBudget } from "./nutrition";
import { convert } from "./units";
import { bestSet, exerciseHistory, normalizeExercise } from "./workouts";

const KINDS = ["strength", "cadence", "custom", "nutrition"] as const;

const posInt = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v > 0;

// Gate for untrusted API bodies. goal_id minted when absent (a fresh goal).
export function parseGoal(
  body: Record<string, unknown>
): { ok: true; goal: GoalSetPayload } | { ok: false; reason: string } {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return { ok: false, reason: "goal needs a title" };
  if (!KINDS.includes(body.kind as never)) {
    return { ok: false, reason: "kind must be strength | cadence | custom | nutrition" };
  }
  const goal: GoalSetPayload = {
    goal_id:
      typeof body.goal_id === "string" && body.goal_id ? body.goal_id : `goal-${randomUUID()}`,
    title,
    kind: body.kind as GoalSetPayload["kind"],
  };
  if (goal.kind === "strength") {
    const exercise = typeof body.exercise === "string" ? body.exercise.trim() : "";
    if (!exercise) return { ok: false, reason: "strength goal needs an exercise" };
    if (typeof body.target_weight !== "number" || body.target_weight <= 0) {
      return { ok: false, reason: "strength goal needs a positive target_weight" };
    }
    const unit = typeof body.unit === "string" ? body.unit.trim() : "";
    if (!unit) return { ok: false, reason: "strength goal needs a unit" };
    goal.exercise = exercise;
    goal.target_weight = body.target_weight;
    goal.unit = unit;
    if (body.target_reps !== undefined) {
      if (!posInt(body.target_reps)) return { ok: false, reason: "target_reps must be a positive integer" };
      goal.target_reps = body.target_reps;
    }
  }
  if (goal.kind === "cadence") {
    if (!posInt(body.per_week)) return { ok: false, reason: "cadence goal needs per_week ≥ 1" };
    goal.per_week = body.per_week;
  }
  if (goal.kind === "nutrition") {
    if (typeof body.daily_calories !== "number" || !Number.isFinite(body.daily_calories) || body.daily_calories <= 0) {
      return { ok: false, reason: "nutrition goal needs a positive daily_calories" };
    }
    goal.daily_calories = body.daily_calories;
    if (body.protein_g !== undefined) {
      if (typeof body.protein_g !== "number" || !Number.isFinite(body.protein_g) || body.protein_g <= 0) {
        return { ok: false, reason: "protein_g must be a positive number" };
      }
      goal.protein_g = body.protein_g;
    }
  }
  if (body.cleared === true) goal.cleared = true;
  return { ok: true, goal };
}

export async function recordGoal(
  db: Client,
  householdId: string,
  goal: GoalSetPayload
): Promise<{ goal_id: string }> {
  await appendEvent(db, {
    event_id: newEventId(),
    household_id: householdId,
    type: GOAL_SET,
    ts: new Date().toISOString(),
    source: "web",
    payload: goal,
    schema_version: 1,
    // the user's own stated goal
    precision: "exact",
  });
  return { goal_id: goal.goal_id };
}

// Latest event per goal_id wins; cleared goals drop out.
export function activeGoals(events: EventEnvelope[]): GoalSetPayload[] {
  const latest = new Map<string, GoalSetPayload>();
  for (const event of events.filter((e) => e.type === GOAL_SET).sort(byFoldOrder)) {
    const goal = event.payload as GoalSetPayload;
    latest.set(goal.goal_id, goal);
  }
  return [...latest.values()].filter((g) => !g.cleared);
}

export interface GoalProgress {
  // strength
  best?: { weight: number; unit: string; reps: number; date: string } | null;
  target_weight?: number;
  pct?: number | null;
  // cadence
  this_week?: number;
  per_week?: number;
  weeks?: Array<{ week: string; count: number }>;
  // nutrition (read from the lib/nutrition fold — same numbers the schedule shows)
  week_consumed?: number;
  week_target?: number;
  unknown_meals?: number;
}

// Sessions that count toward cadence: SessionLogged only (never SetLogged),
// device revisions resolved latest-per-external_id so one workout counts once.
const countableSessions = (events: EventEnvelope[]): EventEnvelope[] =>
  resolveRevisions(events, SESSION_LOGGED);

// Deterministic next-week composer (spec criterion 7): cadence goal N/wk →
// N workout slots on next Monday's week, days in Mon/Wed/Fri/Sat/Tue/Thu/Sun
// order, templates least-recently-done first (never-done lead, in library
// order). PROPOSAL data only — applying is the user POSTing /api/schedule;
// this function never writes (suggest-only, DATAFLOW invariant 3).
const DAY_OFFSETS = [0, 2, 4, 5, 1, 3, 6]; // Mon, Wed, Fri, Sat, Tue, Thu, Sun

export interface WeekProposal {
  days: Array<{
    date: string;
    slots: Array<{ lane: "workout"; title: string; library_id: string }>;
  }>;
  reason?: string;
}

export function proposeWorkoutWeek(
  goals: GoalSetPayload[],
  workouts: Array<{ id: string; title: string }>,
  events: EventEnvelope[],
  todayISO: string,
  program?: ProgramDefinition | null
): WeekProposal {
  // Program-aware count (spec program-engine AC3): the phase of the week being
  // COMPOSED (next Monday's) drives the session count — a deload week drafts
  // ceil(per_week/2) lighter sessions. No program (or the composed week falls
  // outside it) → the cadence goal drives, exactly as before.
  let perWeek: number | undefined;
  let deloadNote: string | undefined;
  let programPerWeek: number | undefined;
  if (program) {
    const nextMonday = isoAddDays(mondayOf(todayISO), 7);
    const composed = programPosition(program, events, nextMonday);
    if (composed.phase !== null) {
      programPerWeek = program.per_week;
      if (composed.phase === "deload") {
        perWeek = Math.ceil(program.per_week / 2);
        deloadNote = `deload week ${composed.week_index} of ${composed.total_weeks} — composing ${perWeek} lighter sessions`;
      }
    }
  }
  if (perWeek === undefined) {
    // non-deload weeks keep the cadence goal's count (AC3); the program's own
    // per_week is only the fallback when no cadence goal exists
    const target = goals.find((g) => g.kind === "cadence" && !g.cleared && g.per_week);
    perWeek = target?.per_week ?? programPerWeek;
    if (perWeek === undefined) {
      return { days: [], reason: "no cadence goal set — nothing to compose from" };
    }
  }
  if (workouts.length === 0) {
    return { days: [], reason: "no workout templates in the library yet" };
  }

  // last done per template: latest SessionLogged carrying that library_id
  const lastDone = new Map<string, string>();
  for (const event of dropRetracted(events).filter((e) => e.type === SESSION_LOGGED).sort(byFoldOrder)) {
    const libraryId = (event.payload as SessionLoggedPayload).library_id;
    if (libraryId) lastDone.set(libraryId, event.ts);
  }
  const rotation = [...workouts].sort((a, b) => {
    const doneA = lastDone.get(a.id);
    const doneB = lastDone.get(b.id);
    if (doneA === undefined && doneB === undefined) return 0; // library order (stable sort)
    if (doneA === undefined) return -1;
    if (doneB === undefined) return 1;
    return doneA < doneB ? -1 : doneA > doneB ? 1 : 0;
  });

  const nextMonday = new Date(`${mondayOf(todayISO)}T00:00:00Z`);
  nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
  const count = Math.min(perWeek, 7);
  const days = DAY_OFFSETS.slice(0, count)
    .map((offset, i) => {
      const day = new Date(nextMonday);
      day.setUTCDate(day.getUTCDate() + offset);
      const template = rotation[i % rotation.length];
      return {
        date: day.toISOString().slice(0, 10),
        slots: [{ lane: "workout" as const, title: template.title, library_id: template.id }],
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  return deloadNote ? { days, reason: deloadNote } : { days };
}

export function goalProgress(
  goal: GoalSetPayload,
  events: EventEnvelope[],
  todayISO: string
): GoalProgress {
  if (goal.kind === "strength") {
    const sessions = exerciseHistory(events).get(normalizeExercise(goal.exercise ?? "")) ?? [];
    const best = bestSet(sessions, goal.target_reps ?? 1);
    let pct: number | null = null;
    if (best && goal.target_weight) {
      const comparable = convert(best.weight, best.unit, goal.unit ?? null);
      if (comparable !== null) pct = comparable / goal.target_weight;
    }
    return { best, target_weight: goal.target_weight, pct };
  }
  if (goal.kind === "nutrition" && goal.daily_calories) {
    const { week_consumed, week_target, unknown_meals } = weekBudget(
      cookedByDate(events),
      todayISO,
      goal.daily_calories,
      activeCaloriesByDate(events)
    );
    return { week_consumed, week_target, unknown_meals };
  }
  if (goal.kind === "cadence") {
    const counts = new Map<string, number>();
    for (const event of countableSessions(events)) {
      const week = mondayOf(localDate(event.ts));
      counts.set(week, (counts.get(week) ?? 0) + 1);
    }
    const thisMonday = mondayOf(todayISO);
    const weeks: Array<{ week: string; count: number }> = [];
    for (let i = 3; i >= 0; i--) {
      const monday = new Date(`${thisMonday}T00:00:00Z`);
      monday.setUTCDate(monday.getUTCDate() - i * 7);
      const week = monday.toISOString().slice(0, 10);
      weeks.push({ week, count: counts.get(week) ?? 0 });
    }
    return {
      this_week: counts.get(thisMonday) ?? 0,
      per_week: goal.per_week,
      weeks,
    };
  }
  return {};
}
