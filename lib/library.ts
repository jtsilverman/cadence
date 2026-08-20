import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import {
  RECIPE_SAVED,
  WORKOUT_SAVED,
  type RecipePlan,
  type StructuredPlan,
  type WorkoutPlan,
} from "./contracts";
import { eventInsert, newEventId } from "./events";

// Persist a reviewed plan: one library row + one saved event, atomically.
// Re-saving the same WEB source updates that row in place (a re-shared link or
// an edited re-save must not stack duplicate cookbook entries); the guard is
// http(s)-only because photo intake shares the constant source_url "photo",
// where every save is legitimately a new recipe.
async function savePlan(
  db: Client,
  householdId: string,
  plan: StructuredPlan,
  eventType: string,
  payload: Record<string, unknown>,
  sourceUrl: string | null
): Promise<{ library_id: string }> {
  const now = new Date().toISOString();

  if (sourceUrl && /^https?:\/\//.test(sourceUrl)) {
    const existing = await db.execute({
      sql: "SELECT id FROM library WHERE household_id = ? AND kind = ? AND source_url = ?",
      args: [householdId, plan.kind, sourceUrl],
    });
    if (existing.rows.length > 0) {
      const libraryId = existing.rows[0].id as string;
      await db.batch(
        [
          {
            sql: "UPDATE library SET plan = ?, updated_at = ? WHERE id = ?",
            args: [JSON.stringify(plan), now, libraryId],
          },
          eventInsert({
            event_id: newEventId(),
            household_id: householdId,
            type: eventType,
            ts: now,
            source: "web",
            payload: { library_id: libraryId, ...payload },
            schema_version: 1,
            precision: "exact",
          }),
        ],
        "write"
      );
      return { library_id: libraryId };
    }
  }

  const libraryId = randomUUID();

  // batch in "write" mode = one transaction: both rows land or neither does
  await db.batch(
    [
      {
        sql: `INSERT INTO library (id, household_id, kind, plan, source_url, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [libraryId, householdId, plan.kind, JSON.stringify(plan), sourceUrl, now, now],
      },
      eventInsert({
        event_id: newEventId(),
        household_id: householdId,
        type: eventType,
        ts: now,
        source: "web",
        payload: { library_id: libraryId, ...payload },
        schema_version: 1,
        precision: "exact",
      }),
    ],
    "write"
  );

  return { library_id: libraryId };
}

export async function saveRecipe(
  db: Client,
  householdId: string,
  plan: RecipePlan
): Promise<{ library_id: string }> {
  return savePlan(
    db,
    householdId,
    plan,
    RECIPE_SAVED,
    { title: plan.title, source_url: plan.source_url },
    plan.source_url
  );
}

export async function saveWorkout(
  db: Client,
  householdId: string,
  plan: WorkoutPlan
): Promise<{ library_id: string }> {
  // populated source_url joins the dedup: re-sharing a video updates the
  // template instead of stacking rows (kind is in the dedup key, so a recipe
  // and workout from one URL never collide)
  return savePlan(
    db,
    householdId,
    plan,
    WORKOUT_SAVED,
    { title: plan.title },
    plan.source_url ?? null
  );
}

export interface RecipeSummary {
  id: string;
  title: string;
  source_url: string | null;
  created_at: string;
}

export async function listRecipes(
  db: Client,
  householdId: string
): Promise<RecipeSummary[]> {
  const result = await db.execute({
    // rowid tiebreak: same-ms saves must still list newest-first deterministically
    sql: `SELECT id, plan, source_url, created_at FROM library
      WHERE household_id = ? AND kind = 'recipe' ORDER BY created_at DESC, rowid DESC`,
    args: [householdId],
  });
  return result.rows.map((row) => ({
    id: row.id as string,
    title: (JSON.parse(row.plan as string) as StructuredPlan).title,
    source_url: row.source_url as string | null,
    created_at: row.created_at as string,
  }));
}

export interface WorkoutSummary {
  id: string;
  title: string;
  exercise_count: number;
  created_at: string;
}

// Oldest-first: listWorkouts order is the proposer's deterministic tie-break
// for never-done templates (spec workout-engine criterion 7).
export async function listWorkouts(
  db: Client,
  householdId: string
): Promise<WorkoutSummary[]> {
  const result = await db.execute({
    sql: `SELECT id, plan, created_at FROM library
      WHERE household_id = ? AND kind = 'workout' ORDER BY created_at ASC, rowid ASC`,
    args: [householdId],
  });
  return result.rows.map((row) => {
    const plan = JSON.parse(row.plan as string) as WorkoutPlan;
    return {
      id: row.id as string,
      title: plan.title,
      exercise_count: plan.exercises.length,
      created_at: row.created_at as string,
    };
  });
}

export async function getPlans(
  db: Client,
  householdId: string,
  ids: string[]
): Promise<Array<{ id: string; plan: StructuredPlan }>> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(", ");
  const result = await db.execute({
    sql: `SELECT id, plan FROM library
      WHERE household_id = ? AND id IN (${placeholders})`,
    args: [householdId, ...ids],
  });
  // id travels with the plan: callers must never zip against their input ids
  // (unknown ids are dropped and IN gives no order guarantee).
  return result.rows.map((row) => ({
    id: row.id as string,
    plan: JSON.parse(row.plan as string) as StructuredPlan,
  }));
}
