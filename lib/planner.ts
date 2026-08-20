// The deterministic composer core (spec planner-composer): next week's 4-lane
// draft from typed context. Pure and byte-stable — the pair's reuse contract
// depends on identical inputs producing identical bytes. LLM judgment lives
// in lib/plan-pick.ts and only ever picks among candidates built here.
// Suggest-only: this module writes nothing.

import type { ProposedDays } from "./contracts";
import { isoAddDays } from "./dates";
import { RED_ZONE } from "./recovery";

export interface MealCandidate {
  id: string;
  title: string;
  calories: number | null; // per-serving estimate; null = unknown
  last_cooked: string | null; // YYYY-MM-DD; null = never cooked
  created_at: string;
}

export interface ComposerContext {
  weekStart: string; // the Monday being drafted (next week)
  meals: MealCandidate[];
  // the workout arm's proposal (proposeWorkoutWeek: program/deload-aware),
  // already dated inside the drafted week
  workoutDays: ProposedDays;
  composedPhase: "build" | "volume" | "peak" | "deload" | null;
  dailyCalories?: number; // active nutrition goal's daily target
  latestRecovery?: number; // latest recovery score on/before today
}

export interface WeekDraft {
  days: ProposedDays;
  reason: string;
  // per-date meal candidate ids (top picks first) — the LLM pick surface
  meal_candidates: Record<string, string[]>;
}

const MIND_OFFSETS = [1, 3]; // Tue, Thu — two headspace slots a week
const CANDIDATES_PER_SLOT = 3;

// Rotation order: never-cooked newest first, then least-recently-cooked.
// Energy fit (when a target and macros exist) reorders by closeness to the
// per-meal envelope; rotation order breaks ties. All comparisons end on id —
// byte-stable output is a contract, not a preference.
export function orderCandidates(meals: MealCandidate[], envelope: number | null): MealCandidate[] {
  const rotation = [...meals].sort((a, b) => {
    if ((a.last_cooked === null) !== (b.last_cooked === null)) {
      return a.last_cooked === null ? -1 : 1;
    }
    if (a.last_cooked === null && b.last_cooked === null) {
      return b.created_at.localeCompare(a.created_at) || a.id.localeCompare(b.id);
    }
    return a.last_cooked!.localeCompare(b.last_cooked!) || a.id.localeCompare(b.id);
  });
  if (envelope === null) return rotation;
  const rank = new Map(rotation.map((m, i) => [m.id, i]));
  return [...rotation].sort((a, b) => {
    const fitA = a.calories === null ? Number.POSITIVE_INFINITY : Math.abs(a.calories - envelope);
    const fitB = b.calories === null ? Number.POSITIVE_INFINITY : Math.abs(b.calories - envelope);
    return fitA - fitB || rank.get(a.id)! - rank.get(b.id)!;
  });
}

export function composeWeekDraft(ctx: ComposerContext): WeekDraft {
  const dates = Array.from({ length: 7 }, (_, i) => isoAddDays(ctx.weekStart, i));
  const reasons: string[] = [];

  // meals: candidates ordered once; day i leads with candidate (i mod n) so
  // the week rotates instead of repeating one favorite
  const hasMacros = ctx.meals.some((m) => m.calories !== null);
  const envelope =
    ctx.dailyCalories !== undefined && hasMacros
      ? (ctx.dailyCalories * 7) / dates.length
      : null;
  const ordered = orderCandidates(ctx.meals, envelope);
  const mealCandidates: Record<string, string[]> = {};
  if (ordered.length === 0) {
    reasons.push("no recipes in the cookbook yet — meal lane left empty");
  } else {
    dates.forEach((date, i) => {
      const rotated = ordered.map((_, j) => ordered[(i + j) % ordered.length]);
      mealCandidates[date] = rotated.slice(0, CANDIDATES_PER_SLOT).map((m) => m.id);
    });
    reasons.push(
      envelope !== null
        ? `meals rotated from your cookbook, fitted to ~${Math.round(envelope)} kcal`
        : "meals rotated from your cookbook"
    );
  }

  // workouts: the program-aware proposal; red recovery halves ONCE — a deload
  // week arrives already halved and never gets quartered (spec AC6)
  let workoutDays = ctx.workoutDays;
  const red = ctx.latestRecovery !== undefined && ctx.latestRecovery < RED_ZONE;
  if (red && ctx.composedPhase !== "deload") {
    const sessions = workoutDays.flatMap((d) => d.slots.map((s) => ({ date: d.date, slot: s })));
    const keep = Math.ceil(sessions.length / 2);
    const kept = sessions.slice(0, keep);
    workoutDays = ctx.workoutDays
      .map((d) => ({
        date: d.date,
        slots: d.slots.filter((s) => kept.some((k) => k.date === d.date && k.slot === s)),
      }))
      .filter((d) => d.slots.length > 0);
    reasons.push(`recovery ${ctx.latestRecovery} is red — trimmed to ${keep} lighter sessions`);
  } else if (ctx.composedPhase === "deload") {
    reasons.push("deload week — sessions already lightened by the program");
  }

  const byId = new Map(ctx.meals.map((m) => [m.id, m]));
  const days: ProposedDays = dates
    .map((date, i) => {
      const slots: ProposedDays[number]["slots"] = [];
      const candidateIds = mealCandidates[date];
      if (candidateIds && candidateIds.length > 0) {
        const pick = byId.get(candidateIds[0])!;
        slots.push({ lane: "meal", title: pick.title, library_id: pick.id });
      }
      const workouts = workoutDays.find((d) => d.date === date);
      if (workouts) slots.push(...workouts.slots);
      slots.push({ lane: "sleep", title: "Sleep" });
      if (MIND_OFFSETS.includes(i)) slots.push({ lane: "mind", title: "Journal" });
      return { date, slots };
    })
    .filter((d) => d.slots.length > 0);

  return { days, reason: reasons.join("; "), meal_candidates: mealCandidates };
}
