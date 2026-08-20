import { NextResponse } from "next/server";
import { getDb, migrate } from "@/lib/db";
import { readEvents } from "@/lib/events";
import { getPlans } from "@/lib/library";
import {
  attachNextTargetSuggestions,
  exerciseHistory,
  nextTargets,
  normalizeExercise,
} from "@/lib/workouts";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

// The workout with progression: per-exercise next targets derived from your
// history. Surfacing a target logs the suggestion pair (spec
// suggestion-pair-v2 cashes in workout-engine's deferral).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  await migrate(db);
  const [row] = await getPlans(db, HOUSEHOLD_ID, [id]);
  if (!row || row.plan.kind !== "workout") {
    return NextResponse.json({ ok: false, reason: "workout not found" }, { status: 404 });
  }
  const targets = await attachNextTargetSuggestions(
    db,
    HOUSEHOLD_ID,
    nextTargets(row.plan, exerciseHistory(await readEvents(db, HOUSEHOLD_ID)))
  );
  const exercises = row.plan.exercises.map((exercise) => {
    const next = targets.get(normalizeExercise(exercise.name));
    return next ? { ...exercise, next } : exercise;
  });
  return NextResponse.json({ ok: true, plan: { ...row.plan, exercises } });
}
