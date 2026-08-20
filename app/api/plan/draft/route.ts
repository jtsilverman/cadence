import { NextResponse } from "next/server";
import type { PlanDraftSuggestion, RecipePlan } from "@/lib/contracts";
import { getDb, migrate } from "@/lib/db";
import { isoAddDays, localDate, mondayOf } from "@/lib/dates";
import { readEvents } from "@/lib/events";
import { activeGoals, proposeWorkoutWeek } from "@/lib/goals";
import { mealHistory } from "@/lib/history";
import { getPlans, listRecipes, listWorkouts } from "@/lib/library";
import { composeWeekDraft, type MealCandidate } from "@/lib/planner";
import { pickMeals } from "@/lib/plan-pick";
import { activeProgram, programPosition } from "@/lib/program";
import { latestScore, recoveryByDate } from "@/lib/recovery";
import { logSuggestions, readSuggestionState } from "@/lib/suggestions";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

const isDraft = (p: { kind: string }): p is PlanDraftSuggestion => p.kind === "plan_draft";

// The living draft (spec planner-composer): next week, all four lanes,
// recomputed from the diary on every read. Surfacing it IS the proposal —
// exactly one open plan_draft pair per week; drift supersedes; a dismissal
// silences the week (draft data still served, pair no longer re-logged).
// Suggest-only: applying is the user's POST /api/schedule.
export async function GET() {
  const db = getDb();
  await migrate(db);
  const events = await readEvents(db, HOUSEHOLD_ID);
  const today = localDate(new Date());
  const weekStart = isoAddDays(mondayOf(today), 7);

  // meal candidates: cookbook + macros + last-cooked rotation signal
  const summaries = await listRecipes(db, HOUSEHOLD_ID);
  const plans = await getPlans(db, HOUSEHOLD_ID, summaries.map((r) => r.id));
  const caloriesById = new Map(
    plans
      .filter((r): r is { id: string; plan: RecipePlan } => r.plan.kind === "recipe")
      .map((r) => [r.id, r.plan.nutrition?.calories ?? null])
  );
  const lastCooked = new Map<string, string>();
  for (const entry of mealHistory(events)) {
    // newest-first: keep the first (latest) date seen per recipe
    if (!lastCooked.has(entry.library_id)) lastCooked.set(entry.library_id, entry.date);
  }
  const meals: MealCandidate[] = summaries.map((r) => ({
    id: r.id,
    title: r.title,
    calories: caloriesById.get(r.id) ?? null,
    last_cooked: lastCooked.get(r.id) ?? null,
    created_at: r.created_at,
  }));

  const program = activeProgram(events);
  const composed = program ? programPosition(program, events, weekStart) : null;
  const proposal = proposeWorkoutWeek(
    activeGoals(events),
    await listWorkouts(db, HOUSEHOLD_ID),
    events,
    today,
    program
  );
  const nutritionGoal = activeGoals(events).find(
    (g) => g.kind === "nutrition" && g.daily_calories
  );

  const draft = composeWeekDraft({
    weekStart,
    meals,
    workoutDays: proposal.days,
    composedPhase: composed?.phase ?? null,
    dailyCalories: nutritionGoal?.daily_calories,
    latestRecovery: latestScore(recoveryByDate(events), today),
  });

  // silenced week: the user waved this week's draft off — data, no pair
  const { open, dismissed } = await readSuggestionState(db, HOUSEHOLD_ID);
  const silenced = dismissed
    .filter(isDraft)
    .some((p) => p.scope === "week" && p.anchor === weekStart);
  if (silenced) {
    return NextResponse.json({ ok: true, draft });
  }

  // The deterministic core is the drift detector: while the basis matches,
  // the open (possibly LLM-picked) pair is served as-is — recomputing picks on
  // every read would supersede the pair each time (churn, not liveness).
  const basis = JSON.stringify(draft.days);
  const existing = open
    .filter(isDraft)
    .find((p) => p.scope === "week" && p.anchor === weekStart);
  if (existing && existing.basis === basis) {
    return NextResponse.json({
      ok: true,
      draft: { ...draft, days: existing.days },
      suggestion_id: existing.suggestion_id,
    });
  }

  // fresh draft: let the model pick among the composer's candidates (AC8);
  // no key and no injection → candidate #1 everywhere (the composed days)
  let days = draft.days;
  if (process.env.ANTHROPIC_API_KEY) {
    const picks = await pickMeals(draft.meal_candidates, {
      ...(nutritionGoal?.daily_calories !== undefined
        ? { daily_calories: nutritionGoal.daily_calories }
        : {}),
      phase: composed?.phase ?? null,
    });
    if (picks) {
      const titleById = new Map(meals.map((m) => [m.id, m.title]));
      days = days.map((d) => {
        const pick = picks[d.date];
        if (!pick || !titleById.has(pick)) return d;
        return {
          ...d,
          slots: d.slots.map((s) =>
            s.lane === "meal"
              ? { lane: "meal" as const, title: titleById.get(pick)!, library_id: pick }
              : s
          ),
        };
      });
    }
  }

  const [logged] = await logSuggestions(db, HOUSEHOLD_ID, [
    {
      kind: "plan_draft",
      scope: "week",
      anchor: weekStart,
      days,
      basis,
      reason: draft.reason,
    },
  ]);
  return NextResponse.json({
    ok: true,
    draft: { ...draft, days },
    suggestion_id: logged.suggestion_id,
  });
}
