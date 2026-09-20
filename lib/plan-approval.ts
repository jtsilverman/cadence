import type { Client } from "@libsql/client";
import type {
  PlanDraftSuggestion,
  RepairSuggestion,
  SchedulePlannedPayload,
  SuggestionResolvedPayload,
} from "./contracts";
import { SCHEDULE_PLANNED, SUGGESTION_MADE, SUGGESTION_RESOLVED } from "./contracts";
import { byFoldOrder, eventInsert, newEventId, readEvents } from "./events";
import { parseScheduleDays } from "./schedule";
import { readSuggestionState } from "./suggestions";

export async function approveScheduleSuggestion(
  db: Client,
  householdId: string,
  suggestionId: string,
): Promise<
  | { ok: true; days: SchedulePlannedPayload["days"] }
  | { ok: false; reason: string }
> {
  const { open } = await readSuggestionState(db, householdId);
  const made = open.find(
    (suggestion): suggestion is PlanDraftSuggestion | RepairSuggestion =>
      (suggestion.kind === "plan_draft" || suggestion.kind === "repair") &&
      suggestion.suggestion_id === suggestionId,
  );
  if (!made) return { ok: false, reason: "no open schedule suggestion with that id" };

  // A proposal is a snapshot of the schedule state that existed when it was
  // made. If a move, swap, coach action, or another approval changed the plan
  // afterward, applying this older snapshot would silently erase newer work.
  const events = await readEvents(db, householdId);
  const madeEvent = events.find(
    (event) =>
      event.type === SUGGESTION_MADE &&
      (event.payload as { suggestion_id?: string }).suggestion_id === suggestionId,
  );
  const latestSchedule = events
    .filter((event) => event.type === SCHEDULE_PLANNED)
    .sort(byFoldOrder)
    .at(-1);
  if (!madeEvent) return { ok: false, reason: "the proposal record is missing" };
  if (latestSchedule && byFoldOrder(latestSchedule, madeEvent) > 0) {
    return { ok: false, reason: "the plan changed after this draft; create a fresh draft" };
  }
  const parsed = parseScheduleDays(made.days);
  if (!parsed.ok) return parsed;

  const now = new Date().toISOString();
  const resolved: SuggestionResolvedPayload = {
    suggestion_id: suggestionId,
    kind: made.kind,
    outcome: "accepted",
  };
  try {
    await db.batch(
      [
        // The unique resolution row is the atomic claim. A concurrent second
        // approval fails here and rolls this whole transaction back before it
        // can append a duplicate schedule snapshot.
        eventInsert({
          event_id: newEventId(),
          household_id: householdId,
          type: SUGGESTION_RESOLVED,
          ts: now,
          source: "web",
          payload: resolved,
          schema_version: 1,
          precision: "exact",
        }),
        eventInsert({
          event_id: newEventId(),
          household_id: householdId,
          type: SCHEDULE_PLANNED,
          ts: now,
          source: "web",
          payload: { days: parsed.days },
          schema_version: 1,
          precision: "exact",
        }),
      ],
      "write",
    );
  } catch {
    const state = await readSuggestionState(db, householdId);
    if (!state.open.some((suggestion) => suggestion.suggestion_id === suggestionId)) {
      return { ok: false, reason: "that suggestion was already resolved" };
    }
    throw new Error("schedule approval transaction failed");
  }
  return { ok: true, days: parsed.days };
}

export const approvePlanDraft = approveScheduleSuggestion;
