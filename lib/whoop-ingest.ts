// Whoop record → typed diary event (spec wearable-ingest criteria 4-5).
// Devices write the same shapes a human does: RecoveryLogged, SleptLogged,
// SessionLogged — distinguished only by envelope source ("whoop") and
// precision ("exact"). Identity lives in payload.external_id, never event_id
// (newEventId's sort-order invariant stays untouched): redeliveries with an
// identical payload skip, revisions (whoop settles scores over a morning)
// append and readers resolve latest-per-external_id.
// Record shapes are docs-derived; the live probe (tests/whoop.integration.
// test.ts) is the shape check once WHOOP_* keys exist.

import type { Client } from "@libsql/client";
import type {
  EventEnvelope,
  RecoveryLoggedPayload,
  SessionLoggedPayload,
  SleptLoggedPayload,
} from "./contracts";
import { RECOVERY_LOGGED, SESSION_LOGGED, SLEPT_LOGGED } from "./contracts";
import { localDate } from "./dates";
import { appendEvent, newEventId, readEvents } from "./events";
import { whoopGet } from "./whoop";

const DEBUG = process.env.WHOOP_DEBUG === "1";
const trace = (msg: string) => {
  if (DEBUG) console.error(`[whoop-ingest] ${msg}`);
};

export interface WhoopRecovery {
  cycle_id: number;
  sleep_id?: string;
  created_at: string;
  updated_at: string;
  score_state: string;
  score?: {
    user_calibrating?: boolean;
    recovery_score?: number;
    resting_heart_rate?: number;
    hrv_rmssd_milli?: number;
  };
}

export interface WhoopSleep {
  id: string;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  nap: boolean;
  score_state: string;
  score?: {
    sleep_performance_percentage?: number;
    stage_summary?: {
      total_in_bed_time_milli?: number;
      total_awake_time_milli?: number;
    };
  };
}

export interface WhoopWorkout {
  id: string;
  created_at: string;
  updated_at: string;
  start: string;
  end: string;
  sport_name?: string;
  score_state: string;
  score?: { strain?: number };
}

// A mapped-but-not-yet-enveloped event: ingest mints id/household on append.
export interface MappedEvent {
  type: string;
  ts: string;
  payload: RecoveryLoggedPayload | SleptLoggedPayload | SessionLoggedPayload;
}

// Only SCORED records map — a pending score has nothing honest to say, and
// whoop's *.updated webhook redelivers the record once it settles.
const scored = (record: { score_state: string; score?: unknown }): boolean =>
  record.score_state === "SCORED" && record.score != null;

export function mapRecovery(record: WhoopRecovery): MappedEvent | null {
  if (!scored(record)) return null;
  const payload: RecoveryLoggedPayload = {
    date: localDate(record.created_at),
    external_id: `whoop:recovery:${record.cycle_id}`,
  };
  const { recovery_score, resting_heart_rate, hrv_rmssd_milli } = record.score!;
  if (recovery_score != null) payload.score = recovery_score;
  if (hrv_rmssd_milli != null) payload.hrv = hrv_rmssd_milli;
  if (resting_heart_rate != null) payload.resting_hr = resting_heart_rate;
  return { type: RECOVERY_LOGGED, ts: record.created_at, payload };
}

// Mapped quality bands over whoop's sleep performance percentage.
const quality = (pct: number): SleptLoggedPayload["quality"] =>
  pct >= 85 ? "great" : pct >= 70 ? "ok" : "rough";

export function mapSleep(record: WhoopSleep): MappedEvent | null {
  if (record.nap) return null; // SleptLogged is the night, not a nap
  if (!scored(record)) return null;
  const pct = record.score!.sleep_performance_percentage;
  if (pct == null) return null;
  const stages = record.score!.stage_summary;
  // asleep hours when stage data exists; time-in-bed otherwise
  const millis =
    stages?.total_in_bed_time_milli != null
      ? stages.total_in_bed_time_milli - (stages.total_awake_time_milli ?? 0)
      : new Date(record.end).getTime() - new Date(record.start).getTime();
  const payload: SleptLoggedPayload = {
    // the night a sleep belongs to = household-local date of its END
    date: localDate(record.end),
    quality: quality(pct),
    hours: Math.round((millis / 3_600_000) * 10) / 10,
    score: pct,
    external_id: `whoop:sleep:${record.id}`,
  };
  return { type: SLEPT_LOGGED, ts: record.end, payload };
}

export function mapWorkout(record: WhoopWorkout): MappedEvent | null {
  if (!scored(record)) return null;
  const payload: SessionLoggedPayload = {
    title: record.sport_name ?? "workout",
    // loose: counts without progression; never carries a slot_id — a device
    // observation must not auto-mark a planned slot (spec criterion 4)
    kind: "loose",
    external_id: `whoop:workout:${record.id}`,
  };
  return { type: SESSION_LOGGED, ts: record.end, payload };
}

// The read-then-append pair races with itself (overlapping webhook
// redeliveries, webhook vs manual sync): in-process chain serializes, same
// idiom as tokens/pantry. Cross-instance residue = a duplicate event with an
// identical payload — cosmetic, readers resolve latest-per-external_id.
let ingestChain: Promise<unknown> = Promise.resolve();

export interface IngestResult {
  appended: number;
  skipped: number;
}

export function ingestWhoopRecords(
  db: Client,
  householdId: string,
  records: {
    recoveries?: WhoopRecovery[];
    sleeps?: WhoopSleep[];
    workouts?: WhoopWorkout[];
  }
): Promise<IngestResult> {
  const run = async (): Promise<IngestResult> => {
    const mapped: MappedEvent[] = [
      ...(records.recoveries ?? []).map(mapRecovery),
      ...(records.sleeps ?? []).map(mapSleep),
      ...(records.workouts ?? []).map(mapWorkout),
    ].filter((m): m is MappedEvent => m !== null);

    const result: IngestResult = { appended: 0, skipped: 0 };
    if (mapped.length === 0) return result;

    // Latest stored payload per external_id, in fold order (ts, event_id).
    const latest = new Map<string, string>();
    for (const event of await readEvents(db, householdId)) {
      const externalId = (event.payload as { external_id?: string }).external_id;
      if (externalId) latest.set(externalId, JSON.stringify(event.payload));
    }

    for (const m of mapped) {
      const externalId = (m.payload as { external_id: string }).external_id;
      const incoming = JSON.stringify(m.payload);
      if (latest.get(externalId) === incoming) {
        trace(`skip (unchanged): ${externalId}`);
        result.skipped += 1;
        continue;
      }
      await appendEvent(db, {
        event_id: newEventId(),
        household_id: householdId,
        type: m.type,
        ts: m.ts,
        source: "whoop",
        payload: m.payload,
        schema_version: 2,
        precision: "exact",
      });
      latest.set(externalId, incoming);
      trace(`append: ${externalId}`);
      result.appended += 1;
    }
    return result;
  };
  const next = ingestChain.then(run, run);
  ingestChain = next.catch(() => {});
  return next;
}

// Webhook payloads are notification-only (IDs, no data): the handler does the
// authenticated follow-up GET in-request, then ingests. *.deleted and unknown
// types no-op — the diary is append-only and whoop must never retry what we
// don't want (spec criterion 6).
export async function handleWhoopWebhook(
  db: Client,
  householdId: string,
  payload: { id: number | string; type: string }
): Promise<IngestResult> {
  switch (payload.type) {
    case "recovery.updated": {
      const record = (await whoopGet(
        db,
        householdId,
        `/v2/cycle/${payload.id}/recovery`
      )) as WhoopRecovery;
      return ingestWhoopRecords(db, householdId, { recoveries: [record] });
    }
    case "sleep.updated": {
      const record = (await whoopGet(
        db,
        householdId,
        `/v2/activity/sleep/${payload.id}`
      )) as WhoopSleep;
      return ingestWhoopRecords(db, householdId, { sleeps: [record] });
    }
    case "workout.updated": {
      const record = (await whoopGet(
        db,
        householdId,
        `/v2/activity/workout/${payload.id}`
      )) as WhoopWorkout;
      return ingestWhoopRecords(db, householdId, { workouts: [record] });
    }
    default:
      trace(`webhook no-op: ${payload.type}`);
      return { appended: 0, skipped: 0 };
  }
}

// Backfill + local-dev path (webhooks can't reach localhost): pull the last N
// days of all three collections through the same mapper/ingest path.
async function pullAll<T>(
  db: Client,
  householdId: string,
  path: string,
  start: string,
  end: string
): Promise<T[]> {
  const records: T[] = [];
  let nextToken: string | undefined;
  do {
    const params = new URLSearchParams({ start, end, limit: "25" });
    if (nextToken) params.set("nextToken", nextToken);
    const page = (await whoopGet(db, householdId, `${path}?${params}`)) as {
      records?: T[];
      next_token?: string | null;
    };
    records.push(...(page.records ?? []));
    nextToken = page.next_token ?? undefined;
  } while (nextToken);
  return records;
}

export async function syncWhoop(
  db: Client,
  householdId: string,
  days: number
): Promise<IngestResult> {
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 3600 * 1000);
  const window = [start.toISOString(), end.toISOString()] as const;
  const [recoveries, sleeps, workouts] = [
    await pullAll<WhoopRecovery>(db, householdId, "/v2/recovery", ...window),
    await pullAll<WhoopSleep>(db, householdId, "/v2/activity/sleep", ...window),
    await pullAll<WhoopWorkout>(db, householdId, "/v2/activity/workout", ...window),
  ];
  trace(
    `sync window ${days}d: ${recoveries.length} recoveries, ${sleeps.length} sleeps, ${workouts.length} workouts`
  );
  return ingestWhoopRecords(db, householdId, { recoveries, sleeps, workouts });
}
