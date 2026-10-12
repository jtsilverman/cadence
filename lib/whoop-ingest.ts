// Whoop record → typed diary event (spec wearable-ingest criteria 4-5).
// Devices write the same shapes a human does: RecoveryLogged, SleptLogged,
// SessionLogged, plus ExertionLogged for a cycle's strain. Distinguished by
// envelope source ("whoop") and precision ("exact"). Identity lives in
// payload.external_id, never event_id
// (newEventId's sort-order invariant stays untouched): redeliveries with an
// identical payload skip, revisions (whoop settles scores over a morning)
// append and readers resolve latest-per-external_id.
// Record shapes are docs-derived; the live probe (tests/whoop.integration.
// test.ts) is the shape check once WHOOP_* keys exist.

import type { Client } from "@libsql/client";
import type {
  ExertionLoggedPayload,
  RecoveryLoggedPayload,
  SessionLoggedPayload,
  SleptLoggedPayload,
} from "./contracts";
import { EXERTION_LOGGED, RECOVERY_LOGGED, SESSION_LOGGED, SLEPT_LOGGED } from "./contracts";
import { localDate } from "./dates";
import { ingestMapped, type IngestResult, type MappedEvent } from "./ingest";
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
  score?: {
    strain?: number;
    average_heart_rate?: number;
    max_heart_rate?: number;
    kilojoule?: number;
    distance_meter?: number;
  };
}

export interface WhoopCycle {
  id: number;
  created_at?: string;
  updated_at?: string;
  start: string;
  end?: string | null;
  score_state: string;
  score?: {
    strain?: number;
    kilojoule?: number;
    average_heart_rate?: number;
    max_heart_rate?: number;
  };
}

export type { MappedEvent };

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
  return { type: RECOVERY_LOGGED, ts: record.created_at, payload, schema_version: 2 };
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
  return { type: SLEPT_LOGGED, ts: record.end, payload, schema_version: 2 };
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
  const duration = (new Date(record.end).getTime() - new Date(record.start).getTime()) / 1000;
  if (Number.isFinite(duration) && duration > 0) payload.duration_s = Math.round(duration);
  const score = record.score;
  if (score?.distance_meter != null && score.distance_meter > 0) {
    payload.distance_m = Math.round(score.distance_meter);
  }
  if (score?.kilojoule != null && score.kilojoule > 0) {
    payload.calories = Math.round(score.kilojoule / 4.184);
  }
  if (score?.average_heart_rate != null) payload.avg_hr = Math.round(score.average_heart_rate);
  return { type: SESSION_LOGGED, ts: record.end, payload, schema_version: 2 };
}

// A physiological cycle is the day's strain container. Kilojoules stay on the
// payload for the record and are deliberately not copied to active_calories
// (lib/energy.ts): cycle energy is most of the day's burn, not the workout.
export function mapCycle(record: WhoopCycle): MappedEvent | null {
  if (!scored(record) || record.score?.strain == null) return null;
  const end = record.end || record.start;
  const payload: ExertionLoggedPayload = {
    date: localDate(end),
    strain: Math.round(record.score.strain * 1000) / 1000,
    external_id: `whoop:cycle:${record.id}`,
  };
  if (record.score.kilojoule != null) {
    payload.kilojoule = Math.round(record.score.kilojoule * 10) / 10;
  }
  if (record.score.average_heart_rate != null) {
    payload.avg_hr = Math.round(record.score.average_heart_rate);
  }
  return { type: EXERTION_LOGGED, ts: end, payload, schema_version: 1 };
}

// The read-then-append pair races with itself (overlapping webhook
// redeliveries, webhook vs manual sync). ingestMapped serializes every
// source on one chain. Cross-instance residue = a duplicate event with an
// identical payload — cosmetic, readers resolve latest-per-external_id.
export function ingestWhoopRecords(
  db: Client,
  householdId: string,
  records: {
    recoveries?: WhoopRecovery[];
    sleeps?: WhoopSleep[];
    workouts?: WhoopWorkout[];
    cycles?: WhoopCycle[];
  }
): Promise<IngestResult> {
  const mapped = [
    ...(records.recoveries ?? []).map(mapRecovery),
    ...(records.sleeps ?? []).map(mapSleep),
    ...(records.workouts ?? []).map(mapWorkout),
    ...(records.cycles ?? []).map(mapCycle),
  ].filter((m): m is MappedEvent => m !== null);
  if (DEBUG) {
    for (const m of mapped) trace(`map: ${m.payload.external_id ?? m.type}`);
  }
  return ingestMapped(db, householdId, "whoop", mapped);
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
    case "cycle.updated": {
      const record = (await whoopGet(db, householdId, `/v2/cycle/${payload.id}`)) as WhoopCycle;
      return ingestWhoopRecords(db, householdId, { cycles: [record] });
    }
    default:
      trace(`webhook no-op: ${payload.type}`);
      return { appended: 0, skipped: 0 };
  }
}

// Backfill + local-dev path (webhooks can't reach localhost): pull the last N
// days of recovery, sleep, workout, and cycle through the same mapper.
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
  const [recoveries, sleeps, workouts, cycles] = [
    await pullAll<WhoopRecovery>(db, householdId, "/v2/recovery", ...window),
    await pullAll<WhoopSleep>(db, householdId, "/v2/activity/sleep", ...window),
    await pullAll<WhoopWorkout>(db, householdId, "/v2/activity/workout", ...window),
    await pullAll<WhoopCycle>(db, householdId, "/v2/cycle", ...window),
  ];
  trace(
    `sync window ${days}d: ${recoveries.length} recoveries, ${sleeps.length} sleeps, ${workouts.length} workouts, ${cycles.length} cycles`
  );
  return ingestWhoopRecords(db, householdId, { recoveries, sleeps, workouts, cycles });
}
