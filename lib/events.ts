import { randomUUID } from "node:crypto";
import type { Client, InStatement, Row } from "@libsql/client";
import type { EventEnvelope, LogRetractedPayload, Precision } from "./contracts";
import { LOG_RETRACTED } from "./contracts";

// Event ids must break same-ts ties in WRITE order (the fold sorts by ts then
// event_id): time-prefixed + process-monotonic counter, random tail for
// cross-process uniqueness. A pure random UUID makes same-ms rebuilds
// nondeterministic.
let seq = 0;
export function newEventId(): string {
  const timePrefix = Date.now().toString(36).padStart(9, "0");
  const counter = (seq++ % 36 ** 4).toString(36).padStart(4, "0");
  return `${timePrefix}${counter}-${randomUUID()}`;
}

// Fold order: ts then event_id (newEventId makes same-ms ids sort in write
// order). Every reader that resolves "latest" sorts with this.
export const byFoldOrder = (a: EventEnvelope, b: EventEnvelope): number =>
  (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0) ||
  (a.event_id < b.event_id ? -1 : a.event_id > b.event_id ? 1 : 0);

// The undo trail (spec retraction-ladder): ids the user has taken back.
// Every fold forgets these; the events themselves stay in the diary.
export function retractedIds(events: EventEnvelope[]): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.type === LOG_RETRACTED) {
      ids.add((event.payload as LogRetractedPayload).retracted_event_id);
    }
  }
  return ids;
}

// Drop retracted events for folds that filter raw (not via resolveRevisions).
// Zero retractions returns the same array — the common path stays untouched.
export function dropRetracted(events: EventEnvelope[]): EventEnvelope[] {
  const retracted = retractedIds(events);
  if (retracted.size === 0) return events;
  return events.filter((e) => !retracted.has(e.event_id));
}

// Fold-ordered events of one type with device redeliveries/revisions
// collapsed: the LAST event per payload.external_id wins; events without one
// (manual entries) keep their own identity. The shared reader rule for every
// consumer of device-writable types. Retracted ids drop BEFORE the identity
// map; device events are unretractable at the gate, so a retraction can never
// resurrect a superseded revision.
export function resolveRevisions(
  events: EventEnvelope[],
  type: string
): EventEnvelope[] {
  const retracted = retractedIds(events);
  const ordered = events
    .filter((e) => e.type === type && !retracted.has(e.event_id))
    .sort(byFoldOrder);
  const byIdentity = new Map<string, EventEnvelope>();
  for (const event of ordered) {
    const externalId = (event.payload as { external_id?: string }).external_id;
    byIdentity.set(externalId ?? event.event_id, event);
  }
  return [...byIdentity.values()].sort(byFoldOrder);
}

// The one place that knows the events-table column shape. Callers that need
// the insert inside their own transaction (db.batch) use this statement.
export function eventInsert(event: EventEnvelope): InStatement {
  return {
    sql: `INSERT INTO events
      (event_id, household_id, user_id, type, ts, source, payload, schema_version, precision)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      event.event_id,
      event.household_id,
      event.user_id ?? null,
      event.type,
      event.ts,
      event.source,
      JSON.stringify(event.payload),
      event.schema_version,
      event.precision,
    ],
  };
}

export async function appendEvent(
  db: Client,
  event: EventEnvelope
): Promise<void> {
  await db.execute(eventInsert(event));
}

export async function readEvents(
  db: Client,
  householdId: string,
  opts?: { type?: string }
): Promise<EventEnvelope[]> {
  const result = opts?.type
    ? await db.execute({
        sql: `SELECT * FROM events WHERE household_id = ? AND type = ? ORDER BY ts, event_id`,
        args: [householdId, opts.type],
      })
    : await db.execute({
        sql: `SELECT * FROM events WHERE household_id = ? ORDER BY ts, event_id`,
        args: [householdId],
      });
  return result.rows.map(rowToEvent);
}

// One event by id (the retract gate's lookup) — household-scoped like every read.
export async function readEvent(
  db: Client,
  householdId: string,
  eventId: string
): Promise<EventEnvelope | null> {
  const result = await db.execute({
    sql: `SELECT * FROM events WHERE household_id = ? AND event_id = ?`,
    args: [householdId, eventId],
  });
  return result.rows.length > 0 ? rowToEvent(result.rows[0]) : null;
}

function rowToEvent(row: Row): EventEnvelope {
  const event: EventEnvelope = {
    event_id: row.event_id as string,
    household_id: row.household_id as string,
    type: row.type as string,
    ts: row.ts as string,
    source: row.source as string,
    payload: JSON.parse(row.payload as string),
    schema_version: Number(row.schema_version),
    precision: row.precision as Precision,
  };
  if (row.user_id != null) event.user_id = row.user_id as string;
  return event;
}
