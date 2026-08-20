// One-tap log writers (spec schedule-spine criterion 3): session, sleep,
// journal, skip. Each tap is one typed event in the diary; all work without a
// planned slot (spontaneous workout, unprompted journal). Precision: self-
// reported session/sleep numbers are "estimated"; journal text and skips are
// the user's own statement — "exact".

import type { Client } from "@libsql/client";
import type {
  JournalEntryPayload,
  Precision,
  SessionLoggedPayload,
  SetLoggedPayload,
  SleptLoggedPayload,
  SlotLane,
  SlotSkippedPayload,
} from "./contracts";
import {
  JOURNAL_ENTRY,
  SESSION_LOGGED,
  SET_LOGGED,
  SLEPT_LOGGED,
  SLOT_SKIPPED,
} from "./contracts";
import { isValidDate } from "./dates";
import { appendEvent, newEventId } from "./events";

export type LogInput =
  | {
      kind: "session";
      title: string;
      session_kind: "structured" | "loose";
      slot_id?: string;
      note?: string;
      session_id?: string;
      library_id?: string;
    }
  | ({ kind: "set" } & SetLoggedPayload)
  | { kind: "sleep"; date: string; quality: "rough" | "ok" | "great"; hours?: number }
  | { kind: "journal"; text: string; slot_id?: string; mood?: number }
  | { kind: "skip"; slot_id: string; lane: SlotLane };

const QUALITIES = ["rough", "ok", "great"] as const;
const SESSION_KINDS = ["structured", "loose"] as const;
const LANES: readonly string[] = ["meal", "workout", "sleep", "mind", "custom"];

const optStr = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

const posInt = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v > 0;

// Gate for untrusted API bodies.
export function parseLog(
  body: Record<string, unknown>
): { ok: true; log: LogInput } | { ok: false; reason: string } {
  switch (body.kind) {
    case "session": {
      const title = optStr(body.title);
      if (!title) return { ok: false, reason: "session needs a title" };
      // absent = "loose": a bare one-tap "did it" is by definition an
      // unstructured session; the set-logging flow sends structured explicitly
      if (body.session_kind !== undefined && !SESSION_KINDS.includes(body.session_kind as never)) {
        return { ok: false, reason: "session_kind must be structured | loose" };
      }
      return {
        ok: true,
        log: {
          kind: "session",
          title,
          session_kind: (body.session_kind as "structured" | "loose" | undefined) ?? "loose",
          ...(optStr(body.slot_id) ? { slot_id: optStr(body.slot_id) } : {}),
          ...(optStr(body.note) ? { note: optStr(body.note) } : {}),
          ...(optStr(body.session_id) ? { session_id: optStr(body.session_id) } : {}),
          ...(optStr(body.library_id) ? { library_id: optStr(body.library_id) } : {}),
        },
      };
    }
    case "set": {
      const sessionId = optStr(body.session_id);
      if (!sessionId) return { ok: false, reason: "set needs a session_id" };
      const exercise = optStr(body.exercise);
      if (!exercise) return { ok: false, reason: "set needs an exercise" };
      if (!posInt(body.set_index)) return { ok: false, reason: "set_index must be a positive integer" };
      if (!posInt(body.reps)) return { ok: false, reason: "reps must be a positive integer" };
      const log: LogInput = {
        kind: "set",
        session_id: sessionId,
        exercise,
        set_index: body.set_index as number,
        reps: body.reps as number,
      };
      if (body.weight !== undefined) {
        if (typeof body.weight !== "number" || !Number.isFinite(body.weight) || body.weight <= 0) {
          return { ok: false, reason: "weight must be a positive number" };
        }
        const unit = optStr(body.unit);
        if (!unit) return { ok: false, reason: "weight needs a unit" };
        log.weight = body.weight;
        log.unit = unit;
      }
      if (body.rpe !== undefined) {
        if (typeof body.rpe !== "number" || body.rpe < 1 || body.rpe > 10) {
          return { ok: false, reason: "rpe must be 1-10" };
        }
        log.rpe = body.rpe;
      }
      if (optStr(body.slot_id)) log.slot_id = optStr(body.slot_id);
      if (optStr(body.library_id)) log.library_id = optStr(body.library_id);
      return { ok: true, log };
    }
    case "sleep": {
      if (typeof body.date !== "string" || !isValidDate(body.date)) {
        return { ok: false, reason: "sleep needs a real YYYY-MM-DD date" };
      }
      if (!QUALITIES.includes(body.quality as never)) {
        return { ok: false, reason: "quality must be rough | ok | great" };
      }
      const hours = body.hours;
      if (hours !== undefined && (typeof hours !== "number" || !Number.isFinite(hours) || hours < 0)) {
        return { ok: false, reason: "hours must be a non-negative number" };
      }
      return {
        ok: true,
        log: {
          kind: "sleep",
          date: body.date,
          quality: body.quality as "rough" | "ok" | "great",
          ...(hours !== undefined ? { hours: hours as number } : {}),
        },
      };
    }
    case "journal": {
      const text = optStr(body.text);
      if (!text) return { ok: false, reason: "journal needs text" };
      if (
        body.mood !== undefined &&
        (typeof body.mood !== "number" || !Number.isInteger(body.mood) || body.mood < 1 || body.mood > 5)
      ) {
        return { ok: false, reason: "mood must be an integer 1-5" };
      }
      return {
        ok: true,
        log: {
          kind: "journal",
          text,
          ...(optStr(body.slot_id) ? { slot_id: optStr(body.slot_id) } : {}),
          ...(body.mood !== undefined ? { mood: body.mood as number } : {}),
        },
      };
    }
    case "skip": {
      const slotId = optStr(body.slot_id);
      if (!slotId) return { ok: false, reason: "skip needs a slot_id" };
      if (!LANES.includes(body.lane as string)) {
        return { ok: false, reason: "skip needs a valid lane" };
      }
      return { ok: true, log: { kind: "skip", slot_id: slotId, lane: body.lane as SlotLane } };
    }
    default:
      return { ok: false, reason: "kind must be session | set | sleep | journal | skip" };
  }
}

export async function recordLog(
  db: Client,
  householdId: string,
  log: LogInput
): Promise<{ event_id: string }> {
  let type: string;
  let payload:
    | SessionLoggedPayload
    | SetLoggedPayload
    | SleptLoggedPayload
    | JournalEntryPayload
    | SlotSkippedPayload;
  let precision: Precision;
  // additive payload fields ride schema_version 2 (contracts convention)
  let schemaVersion = 1;
  if (log.kind === "session") {
    type = SESSION_LOGGED;
    payload = {
      title: log.title,
      kind: log.session_kind,
      ...(log.slot_id ? { slot_id: log.slot_id } : {}),
      ...(log.note ? { note: log.note } : {}),
      ...(log.session_id ? { session_id: log.session_id } : {}),
      ...(log.library_id ? { library_id: log.library_id } : {}),
    };
    if (log.session_id || log.library_id) schemaVersion = 2;
    precision = "estimated";
  } else if (log.kind === "set") {
    type = SET_LOGGED;
    const { kind: _kind, ...setPayload } = log;
    payload = setPayload;
    // typed numbers from the user's own hands: the lifting dial is exact
    precision = "exact";
  } else if (log.kind === "sleep") {
    type = SLEPT_LOGGED;
    payload = {
      date: log.date,
      quality: log.quality,
      ...(log.hours !== undefined ? { hours: log.hours } : {}),
    };
    precision = "estimated";
  } else if (log.kind === "journal") {
    type = JOURNAL_ENTRY;
    payload = {
      text: log.text,
      ...(log.slot_id ? { slot_id: log.slot_id } : {}),
      ...(log.mood !== undefined ? { mood: log.mood } : {}),
    };
    if (log.mood !== undefined) schemaVersion = 2;
    precision = "exact";
  } else {
    type = SLOT_SKIPPED;
    payload = { slot_id: log.slot_id, lane: log.lane };
    precision = "exact";
  }
  // the id goes back to the client: it is the undo handle (spec retraction-ladder)
  const eventId = newEventId();
  await appendEvent(db, {
    event_id: eventId,
    household_id: householdId,
    type,
    ts: new Date().toISOString(),
    source: "web",
    payload,
    schema_version: schemaVersion,
    precision,
  });
  return { event_id: eventId };
}
