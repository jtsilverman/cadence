// Shared latest-wins ingest for device and diary imports.
// Identity lives in payload.external_id, never event_id (newEventId's
// sort-order invariant stays untouched). An identical payload skips; a
// changed payload appends and readers resolve latest-per-external_id.
// One in-process chain covers every source so a whoop webhook and a
// garmin sync cannot interleave the read-then-append pair.

import type { Client } from "@libsql/client";
import { appendEvent, newEventId, readEvents } from "./events";

export interface MappedEvent {
  type: string;
  ts: string;
  payload: { external_id?: string };
  schema_version?: number;
}

export interface IngestResult {
  appended: number;
  skipped: number;
}

let ingestChain: Promise<unknown> = Promise.resolve();

export function ingestMapped(
  db: Client,
  householdId: string,
  source: string,
  mapped: MappedEvent[]
): Promise<IngestResult> {
  const run = async (): Promise<IngestResult> => {
    const result: IngestResult = { appended: 0, skipped: 0 };
    if (mapped.length === 0) return result;

    const latest = new Map<string, string>();
    for (const event of await readEvents(db, householdId)) {
      const externalId = (event.payload as { external_id?: string }).external_id;
      if (externalId) latest.set(externalId, JSON.stringify(event.payload));
    }

    for (const m of mapped) {
      const externalId = m.payload.external_id;
      if (!externalId) {
        result.skipped += 1;
        continue;
      }
      const incoming = JSON.stringify(m.payload);
      if (latest.get(externalId) === incoming) {
        result.skipped += 1;
        continue;
      }
      await appendEvent(db, {
        event_id: newEventId(),
        household_id: householdId,
        type: m.type,
        ts: m.ts,
        source,
        payload: m.payload,
        schema_version: m.schema_version ?? 1,
        precision: "exact",
      });
      latest.set(externalId, incoming);
      result.appended += 1;
    }
    return result;
  };
  const next = ingestChain.then(run, run);
  ingestChain = next.catch(() => {});
  return next;
}
