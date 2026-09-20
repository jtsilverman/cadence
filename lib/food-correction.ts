import type { Client, InStatement } from "@libsql/client";
import {
  FOOD_SAVED,
  LOG_RETRACTED,
  RECIPE_COOKED,
  type MealPlan,
  type RecipeCookedPayload,
} from "./contracts";
import { isValidDate, localDate } from "./dates";
import { eventInsert, newEventId, readEvent, readEvents, retractedIds } from "./events";


export type FoodCorrectionInput = {
  event_id: string;
  title: string;
  date: string;
  quantity?: number;
  unit?: string;
};

export type FoodCorrectionResult =
  | { ok: true; event_id: string }
  | { ok: false; reason: string; status: number };

export async function correctManualFood(
  db: Client,
  householdId: string,
  input: FoodCorrectionInput,
  now = new Date()
): Promise<FoodCorrectionResult> {
  const eventId = input.event_id.trim();
  const title = input.title.trim();
  if (!eventId) return { ok: false, reason: "event_id required", status: 422 };
  if (!title) return { ok: false, reason: "food needs a title", status: 422 };
  if (!isValidDate(input.date)) {
    return { ok: false, reason: "food needs a real YYYY-MM-DD date", status: 422 };
  }
  if (input.date > localDate(now)) {
    return { ok: false, reason: "food can't be logged in the future", status: 422 };
  }
  if (
    input.quantity !== undefined &&
    (!Number.isFinite(input.quantity) || input.quantity <= 0)
  ) {
    return { ok: false, reason: "food quantity must be a positive number", status: 422 };
  }
  const unit = input.unit?.trim();
  if (input.quantity !== undefined && !unit) {
    return { ok: false, reason: "food quantity needs a unit", status: 422 };
  }

  const target = await readEvent(db, householdId, eventId);
  if (!target) return { ok: false, reason: "no such food log", status: 404 };
  const payload = target.payload as Partial<RecipeCookedPayload>;
  if (
    target.type !== RECIPE_COOKED ||
    target.source !== "web" ||
    typeof payload.library_id !== "string" ||
    (!payload.manual_log && !payload.library_id.startsWith("manual-"))
  ) {
    return { ok: false, reason: "only manual food logs can be corrected here", status: 422 };
  }

  const retracted = retractedIds(await readEvents(db, householdId));
  if (retracted.has(eventId)) {
    return { ok: false, reason: "that food log was already corrected or removed", status: 409 };
  }

  const correctionId = newEventId();
  const correctionTs = input.date === localDate(now)
    ? now.toISOString()
    : `${input.date}T23:30:00.000Z`;
  const writtenAt = now.toISOString();
  const existing = await db.execute({
    sql: `SELECT id FROM library
      WHERE household_id = ? AND kind = 'meal' AND lower(trim(plan ->> '$.title')) = lower(trim(?))
      ORDER BY created_at ASC, rowid ASC LIMIT 1`,
    args: [householdId, title],
  });
  let libraryId = existing.rows[0]?.id as string | undefined;
  const statements: InStatement[] = [
    // Claim first. The unique retraction index makes one concurrent correction
    // the winner before either request can create a replacement library row.
    eventInsert({
      event_id: newEventId(),
      household_id: householdId,
      type: LOG_RETRACTED,
      ts: writtenAt,
      source: "web",
      payload: { retracted_event_id: eventId },
      schema_version: 1,
      precision: "exact",
    }),
  ];
  if (!libraryId) {
    libraryId = newEventId();
    const plan: MealPlan = {
      plan_version: 1,
      kind: "meal",
      title,
      components: [],
      source_url: null,
    };
    statements.push(
      {
        sql: `INSERT INTO library (id, household_id, kind, plan, source_url, created_at, updated_at)
          VALUES (?, ?, 'meal', ?, NULL, ?, ?)`,
        args: [libraryId, householdId, JSON.stringify(plan), writtenAt, writtenAt],
      },
      eventInsert({
        event_id: newEventId(),
        household_id: householdId,
        type: FOOD_SAVED,
        ts: writtenAt,
        source: "web",
        payload: { library_id: libraryId, kind: "meal", title, source_url: null },
        schema_version: 1,
        precision: "exact",
      }),
    );
  }
  statements.push(eventInsert({
    event_id: correctionId,
    household_id: householdId,
    type: RECIPE_COOKED,
    ts: correctionTs,
    source: "web",
    payload: {
      library_id: libraryId,
      title,
      ingredients: [],
      corrected_from: eventId,
      manual_log: true,
      ...(input.quantity !== undefined ? { quantity: input.quantity, unit } : {}),
    },
    schema_version: 2,
    precision: "estimated",
  }));
  try {
    await db.batch(statements, "write");
  } catch {
    const nowRetracted = retractedIds(await readEvents(db, householdId));
    if (nowRetracted.has(eventId)) {
      return { ok: false, reason: "that food log was already corrected or removed", status: 409 };
    }
    throw new Error("food correction transaction failed");
  }
  return { ok: true, event_id: correctionId };
}
