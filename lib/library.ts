import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import {
  FOOD_FAVORITED,
  FOOD_KINDS,
  FOOD_SAVED,
  RECIPE_COOKED,
  RECIPE_SAVED,
  WORKOUT_SAVED,
  type FoodFavoritedPayload,
  type FoodKind,
  type FoodPlan,
  type MealPlan,
  type RecipeCookedPayload,
  type RecipePlan,
  type StructuredPlan,
  type WorkoutPlan,
} from "./contracts";
import { appendEvent, eventInsert, newEventId, readEvents, resolveRevisions } from "./events";

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

// saveFood: the four non-recipe kinds. Same atomic row+event shape as
// saveRecipe, and the same http(s) source dedup — re-saving one scanned
// barcode or one product page updates that row instead of stacking twins.
export async function saveFood(
  db: Client,
  householdId: string,
  plan: FoodPlan
): Promise<{ library_id: string }> {
  const source = plan.source_url;
  return savePlan(
    db,
    householdId,
    plan,
    plan.kind === "recipe" ? RECIPE_SAVED : FOOD_SAVED,
    plan.kind === "recipe"
      ? { title: plan.title, source_url: plan.source_url }
      : { kind: plan.kind, title: plan.title, source_url: source },
    source
  );
}

export interface FoodSummary {
  id: string;
  kind: FoodKind;
  title: string;
  source_url: string | null;
  created_at: string;
  has_nutrition: boolean;
  favorite: boolean;
  times_eaten: number;
}

// Auto-save (UX.md): eating something is what puts it in the library, so a
// typed food log resolves to a real library row instead of a throwaway id.
// Dedup is by case-folded title within the meal kind — logging "two eggs and
// toast" twice must return the same row, or the second-eat prompt and the
// favorite toggle would have nothing stable to point at.
export async function ensureLoggedFood(
  db: Client,
  householdId: string,
  title: string
): Promise<{ library_id: string; first_time: boolean }> {
  const existing = await db.execute({
    sql: `SELECT id FROM library
      WHERE household_id = ? AND kind = 'meal' AND lower(trim(plan ->> '$.title')) = lower(trim(?))
      ORDER BY created_at ASC, rowid ASC LIMIT 1`,
    args: [householdId, title],
  });
  if (existing.rows.length > 0) {
    return { library_id: existing.rows[0].id as string, first_time: false };
  }
  // components stays empty: the plate is real and re-loggable, but nothing
  // has itemised it yet, and inventing parts would fabricate provenance.
  const plan: MealPlan = {
    plan_version: 1,
    kind: "meal",
    title: title.trim(),
    components: [],
    source_url: null,
  };
  try {
    const { library_id } = await saveFood(db, householdId, plan);
    return { library_id, first_time: true };
  } catch {
    // Another request may have inserted the same named meal after our read.
    // The unique meal-title index makes that race deterministic; return the
    // winner rather than surfacing a failed food log.
    const raced = await db.execute({
      sql: `SELECT id FROM library
        WHERE household_id = ? AND kind = 'meal' AND lower(trim(plan ->> '$.title')) = lower(trim(?))
        ORDER BY created_at ASC, rowid ASC LIMIT 1`,
      args: [householdId, title],
    });
    if (raced.rows.length > 0) {
      return { library_id: raced.rows[0].id as string, first_time: false };
    }
    throw new Error("food auto-save failed");
  }
}

// Last-write-wins per library_id, so a double tap settles on the final state.
export async function readFavorites(
  db: Client,
  householdId: string
): Promise<Set<string>> {
  const result = await db.execute({
    sql: `SELECT payload FROM events
      WHERE household_id = ? AND type = ? ORDER BY ts ASC, rowid ASC`,
    args: [householdId, FOOD_FAVORITED],
  });
  const favorites = new Set<string>();
  for (const row of result.rows) {
    const payload = JSON.parse(row.payload as string) as FoodFavoritedPayload;
    if (payload.favorite) favorites.add(payload.library_id);
    else favorites.delete(payload.library_id);
  }
  return favorites;
}

export async function setFavorite(
  db: Client,
  householdId: string,
  libraryId: string,
  favorite: boolean
): Promise<boolean> {
  const row = await db.execute({
    sql: "SELECT kind FROM library WHERE household_id = ? AND id = ?",
    args: [householdId, libraryId],
  });
  if (
    row.rows.length === 0 ||
    !(FOOD_KINDS as readonly string[]).includes(row.rows[0].kind as string)
  ) {
    return false;
  }
  const payload: FoodFavoritedPayload = { library_id: libraryId, favorite };
  await appendEvent(db, {
    event_id: newEventId(),
    household_id: householdId,
    type: FOOD_FAVORITED,
    ts: new Date().toISOString(),
    source: "web",
    payload,
    schema_version: 1,
    precision: "exact",
  });
  return true;
}

// How many times each library row has actually been eaten. Read from the
// diary rather than a counter column so a retracted log cannot leave an
// inflated count behind.
async function eatenCounts(
  db: Client,
  householdId: string
): Promise<Map<string, number>> {
  // Include retractions so an undone meal never inflates the eat count.
  const events = await readEvents(db, householdId);
  const counts = new Map<string, number>();
  for (const event of resolveRevisions(events, RECIPE_COOKED)) {
    const { library_id: libraryId } = event.payload as RecipeCookedPayload;
    if (!libraryId) continue;
    counts.set(libraryId, (counts.get(libraryId) ?? 0) + 1);
  }
  return counts;
}

// One browse read for the whole food library. Workouts are excluded by the
// kind filter rather than by a "not workout" exclusion, so a future non-food
// kind cannot leak into the nutrition product by default.
export async function listFoods(
  db: Client,
  householdId: string,
  kinds: readonly FoodKind[] = FOOD_KINDS
): Promise<FoodSummary[]> {
  if (kinds.length === 0) return [];
  const placeholders = kinds.map(() => "?").join(", ");
  const [result, favorites, counts] = await Promise.all([
    db.execute({
      // rowid tiebreak: same-ms saves must still list newest-first deterministically
      sql: `SELECT id, kind, plan, source_url, created_at FROM library
        WHERE household_id = ? AND kind IN (${placeholders})
        ORDER BY created_at DESC, rowid DESC`,
      args: [householdId, ...kinds],
    }),
    readFavorites(db, householdId),
    eatenCounts(db, householdId),
  ]);
  return result.rows.map((row) => {
    const plan = JSON.parse(row.plan as string) as FoodPlan;
    const id = row.id as string;
    return {
      id,
      kind: row.kind as FoodKind,
      title: plan.title,
      source_url: (row.source_url as string | null) ?? null,
      created_at: row.created_at as string,
      has_nutrition: plan.nutrition !== undefined,
      favorite: favorites.has(id),
      times_eaten: counts.get(id) ?? 0,
    };
  });
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
