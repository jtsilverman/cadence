// Workout data layer (spec workout-engine): parse gate for untrusted workout
// bodies, exercise-history reader, deterministic progression targets.

import type { Client } from "@libsql/client";
import type {
  EventEnvelope,
  NextTargetSuggestion,
  SetLoggedPayload,
  WorkoutExercise,
  WorkoutPlan,
} from "./contracts";
import { parseSourceEmbed, SET_LOGGED } from "./contracts";
import { localDate } from "./dates";
import { byFoldOrder, dropRetracted } from "./events";
import {
  logSuggestions,
  readSuggestionState,
  type SuggestionProposal,
} from "./suggestions";
import { convert } from "./units";

const posInt = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v > 0;

// Gate for untrusted API bodies (the parseScheduleDays style: whitelist-copy,
// reason on first failure).
export function parseWorkoutPlan(
  value: unknown
): { ok: true; plan: WorkoutPlan } | { ok: false; reason: string } {
  const { title, exercises, source_url, source_embed } = (value ?? {}) as Record<string, unknown>;
  const trimmedTitle = typeof title === "string" ? title.trim() : "";
  if (!trimmedTitle) return { ok: false, reason: "workout needs a title" };
  if (!Array.isArray(exercises) || exercises.length === 0) {
    return { ok: false, reason: "workout needs at least one exercise" };
  }
  const parsed: WorkoutExercise[] = [];
  for (const raw of exercises) {
    const { name, sets, reps, weight, unit, increment, note } = (raw ?? {}) as Record<string, unknown>;
    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) return { ok: false, reason: "every exercise needs a name" };
    if (!posInt(sets)) return { ok: false, reason: `"${trimmedName}": sets must be a positive integer` };
    if (!posInt(reps)) return { ok: false, reason: `"${trimmedName}": reps must be a positive integer` };
    const exercise: WorkoutExercise = { name: trimmedName, sets, reps };
    if (weight !== undefined) {
      if (typeof weight !== "number" || !Number.isFinite(weight) || weight <= 0) {
        return { ok: false, reason: `"${trimmedName}": weight must be a positive number` };
      }
      if (typeof unit !== "string" || !unit.trim()) {
        return { ok: false, reason: `"${trimmedName}": weight needs a unit` };
      }
      exercise.weight = weight;
      exercise.unit = unit.trim();
    }
    if (increment !== undefined) {
      if (typeof increment !== "number" || !Number.isFinite(increment) || increment <= 0) {
        return { ok: false, reason: `"${trimmedName}": increment must be a positive number` };
      }
      if (exercise.unit === undefined) {
        return { ok: false, reason: `"${trimmedName}": increment needs a weighted exercise (unit)` };
      }
      exercise.increment = increment;
    }
    if (note !== undefined) {
      if (typeof note !== "string") return { ok: false, reason: `"${trimmedName}": bad note` };
      exercise.note = note;
    }
    parsed.push(exercise);
  }
  // Source fields (spec workout-video-extraction): this gate is the ONE place
  // that validates them and computes plan_version — extraction and the API
  // body path both land here. Embed is strict (malformed = error, not a drop).
  const plan: WorkoutPlan = {
    plan_version: 1,
    kind: "workout",
    title: trimmedTitle,
    exercises: parsed,
  };
  if (source_url !== undefined) {
    if (typeof source_url !== "string" || !/^https?:\/\//.test(source_url)) {
      return { ok: false, reason: "source_url must be an http(s) URL" };
    }
    plan.source_url = source_url;
  }
  if (source_embed !== undefined) {
    const parsedEmbed = parseSourceEmbed(source_embed);
    if (!parsedEmbed) return { ok: false, reason: "invalid source_embed" };
    plan.source_embed = parsedEmbed;
    plan.plan_version = 2;
  }
  return { ok: true, plan };
}

export const normalizeExercise = (name: string): string => name.trim().toLowerCase();

export interface HistorySet {
  set_index: number;
  reps: number;
  weight?: number;
  unit?: string;
  rpe?: number;
}

export interface ExerciseSession {
  date: string; // household-local day of the first set
  session_id: string;
  sets: HistorySet[];
}

// Every set ever logged, per normalized exercise, sessions in fold order,
// sets grouped by session_id. Append-only truth: nothing deduped.
export function exerciseHistory(events: EventEnvelope[]): Map<string, ExerciseSession[]> {
  const ordered = dropRetracted(events).filter((e) => e.type === SET_LOGGED).sort(byFoldOrder);
  const history = new Map<string, ExerciseSession[]>();
  for (const event of ordered) {
    const p = event.payload as SetLoggedPayload;
    const name = normalizeExercise(p.exercise);
    const sessions = history.get(name) ?? [];
    let session = sessions.find((s) => s.session_id === p.session_id);
    if (!session) {
      session = { date: localDate(event.ts), session_id: p.session_id, sets: [] };
      sessions.push(session);
    }
    const set: HistorySet = { set_index: p.set_index, reps: p.reps };
    if (p.weight != null) set.weight = p.weight;
    if (p.unit != null) set.unit = p.unit;
    if (p.rpe != null) set.rpe = p.rpe;
    session.sets.push(set);
    history.set(name, sessions);
  }
  return history;
}

// Heaviest set at >= minReps across all sessions, compared in the first
// weighted set's unit where dimensions convert; incompatible units skipped
// honestly (no invented density/mass math — lib/units rules).
export function bestSet(
  sessions: ExerciseSession[],
  minReps: number
): { weight: number; unit: string; reps: number; date: string } | null {
  let best: { weight: number; unit: string; reps: number; date: string } | null = null;
  for (const session of sessions) {
    for (const set of session.sets) {
      if (set.weight == null || set.unit == null || set.reps < minReps) continue;
      if (!best) {
        best = { weight: set.weight, unit: set.unit, reps: set.reps, date: session.date };
        continue;
      }
      const comparable = convert(set.weight, set.unit, best.unit);
      if (comparable !== null && comparable > best.weight) {
        best = { weight: set.weight, unit: set.unit, reps: set.reps, date: session.date };
      }
    }
  }
  return best;
}

// Flat v0 increments by unit; anything else repeats (no invented numbers).
const INCREMENTS: Record<string, number> = { lb: 5, lbs: 5, kg: 2.5 };

export interface NextTarget {
  weight: number;
  unit: string;
  reason: string;
  // the logged pair behind the advice (spec suggestion-pair-v2); absent when
  // the exercise's current target was dismissed
  suggestion_id?: string;
}

// Surfaced next targets log the suggestion pair (spec suggestion-pair-v2):
// one idempotent next_target per exercise; a dismissal silences that exercise
// until the computed target (weight/unit) changes — new evidence reopens it.
export async function attachNextTargetSuggestions(
  db: Client,
  householdId: string,
  targets: Map<string, NextTarget>
): Promise<Map<string, NextTarget>> {
  const { dismissed } = await readSuggestionState(db, householdId);
  const dismissedTargets = dismissed.filter(
    (p): p is NextTargetSuggestion => p.kind === "next_target"
  );

  const proposals: SuggestionProposal[] = [];
  for (const [exercise, target] of targets) {
    const silenced = dismissedTargets.some(
      (p) =>
        p.exercise === exercise &&
        p.weight === target.weight &&
        p.unit === target.unit
    );
    if (silenced) continue;
    proposals.push({
      kind: "next_target",
      exercise,
      weight: target.weight,
      unit: target.unit,
      reason: target.reason,
    });
  }
  if (proposals.length === 0) return targets;

  const idByExercise = new Map(
    (await logSuggestions(db, householdId, proposals))
      .filter((p): p is NextTargetSuggestion => p.kind === "next_target")
      .map((p) => [p.exercise, p.suggestion_id])
  );
  const out = new Map<string, NextTarget>();
  for (const [exercise, target] of targets) {
    const suggestion_id = idByExercise.get(exercise);
    out.set(exercise, suggestion_id ? { ...target, suggestion_id } : target);
  }
  return out;
}

// Double progression v0 (spec workout-engine criterion 5): look at the most
// recent session per exercise; W = MAX weight among its weighted sets
// (warm-ups at lower weights and weightless sets ignored); every set AT W
// reached the plan's target reps → W + increment; any short → repeat W; no
// weighted history → no target.
export function nextTargets(
  plan: WorkoutPlan,
  history: Map<string, ExerciseSession[]>
): Map<string, NextTarget> {
  const targets = new Map<string, NextTarget>();
  for (const exercise of plan.exercises) {
    const name = normalizeExercise(exercise.name);
    const sessions = history.get(name);
    if (!sessions || sessions.length === 0) continue;
    const last = sessions[sessions.length - 1];
    const weighted = last.sets.filter(
      (s): s is HistorySet & { weight: number; unit: string } =>
        s.weight != null && s.unit != null
    );
    if (weighted.length === 0) continue;
    // top weight by CONVERTED magnitude (a 100 kg set beats a 105 lb set);
    // sets whose unit can't convert to the first set's are excluded honestly
    const ref = weighted[0].unit;
    const comparable = weighted
      .map((s) => ({ s, val: convert(s.weight, s.unit, ref) }))
      .filter((x): x is { s: (typeof weighted)[number]; val: number } => x.val !== null);
    if (comparable.length === 0) continue;
    const topVal = Math.max(...comparable.map((x) => x.val));
    const topSets = comparable
      .filter((x) => Math.abs(x.val - topVal) < 1e-9)
      .map((x) => x.s);
    const top = topSets[0].weight;
    const unit = topSets[0].unit;
    const allHit = topSets.every((s) => s.reps >= exercise.reps);
    // per-exercise increment (spec program-engine AC4) applies only when the
    // logged unit matches the plan's — converting a step across units would be
    // invented math; otherwise the flat table by logged unit.
    const ownIncrement =
      exercise.increment !== undefined &&
      exercise.unit !== undefined &&
      exercise.unit.toLowerCase() === unit.toLowerCase()
        ? exercise.increment
        : undefined;
    const increment = ownIncrement ?? INCREMENTS[unit.toLowerCase()];
    if (allHit && increment !== undefined) {
      targets.set(name, {
        weight: top + increment,
        unit,
        reason: `hit ${exercise.sets}×${exercise.reps} at ${top} ${unit} on ${last.date} — load ${top + increment}`,
      });
    } else {
      targets.set(name, {
        weight: top,
        unit,
        reason: allHit
          ? `hit reps at ${top} ${unit} — repeat (no increment table for "${unit}")`
          : `short of ${exercise.reps} reps at ${top} ${unit} on ${last.date} — repeat`,
      });
    }
  }
  return targets;
}
