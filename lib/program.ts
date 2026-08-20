// The program fold (spec program-engine): goal → block structure → week
// skeletons, and the household's position inside it. Pure readers over the
// diary; suggest-only — the program proposes shape, only the user's POST
// writes a plan. Singleton: one program per household, latest event wins.

import type { Client } from "@libsql/client";
import type {
  EventEnvelope,
  ProgramDefinition,
  ProgramSetPayload,
  ProgramWeek,
  ProgramWeekKind,
} from "./contracts";
import { PROGRAM_SET, SESSION_LOGGED } from "./contracts";
import { isoAddDays, isValidDate, localDate, mondayOf } from "./dates";
import { appendEvent, byFoldOrder, newEventId, resolveRevisions } from "./events";

const WEEK_KINDS: readonly ProgramWeekKind[] = ["build", "volume", "peak", "deload"];
const MAX_WEEKS = 52;

const posInt = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v > 0;

// Gate for untrusted API bodies (the parseScheduleDays style). A bare
// {cleared: true} is the whole clear payload.
export function parseProgram(
  value: unknown
): { ok: true; program: ProgramSetPayload } | { ok: false; reason: string } {
  const body = (value ?? {}) as Record<string, unknown>;
  if (body.cleared === true) return { ok: true, program: { cleared: true } };

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return { ok: false, reason: "program needs a title" };
  if (!posInt(body.per_week) || body.per_week > 7) {
    return { ok: false, reason: "per_week must be 1-7" };
  }
  if (typeof body.start_monday !== "string" || !isValidDate(body.start_monday)) {
    return { ok: false, reason: "start_monday must be YYYY-MM-DD" };
  }
  if (mondayOf(body.start_monday) !== body.start_monday) {
    return { ok: false, reason: "start_monday must be a Monday" };
  }
  if (!Array.isArray(body.weeks) || body.weeks.length === 0 || body.weeks.length > MAX_WEEKS) {
    return { ok: false, reason: `weeks must be 1-${MAX_WEEKS} entries` };
  }
  const weeks: ProgramWeek[] = [];
  for (const raw of body.weeks) {
    const { kind, note } = (raw ?? {}) as Record<string, unknown>;
    if (typeof kind !== "string" || !(WEEK_KINDS as readonly string[]).includes(kind)) {
      return { ok: false, reason: `week kind must be one of ${WEEK_KINDS.join(" | ")}` };
    }
    const week: ProgramWeek = { kind: kind as ProgramWeekKind };
    if (note !== undefined) {
      if (typeof note !== "string") return { ok: false, reason: "week note must be a string" };
      week.note = note;
    }
    weeks.push(week);
  }
  const program: ProgramDefinition = {
    title,
    per_week: body.per_week,
    start_monday: body.start_monday,
    weeks,
  };
  if (body.goal_id !== undefined) {
    if (typeof body.goal_id !== "string" || !body.goal_id) {
      return { ok: false, reason: "bad goal_id" };
    }
    program.goal_id = body.goal_id;
  }
  return { ok: true, program };
}

export async function recordProgram(
  db: Client,
  householdId: string,
  program: ProgramSetPayload
): Promise<void> {
  await appendEvent(db, {
    event_id: newEventId(),
    household_id: householdId,
    type: PROGRAM_SET,
    ts: new Date().toISOString(),
    source: "web",
    payload: program,
    schema_version: 1,
    // the user's own stated block
    precision: "exact",
  });
}

// Latest ProgramSet wins; cleared means none.
export function activeProgram(events: EventEnvelope[]): ProgramDefinition | null {
  let latest: ProgramSetPayload | null = null;
  for (const event of events.filter((e) => e.type === PROGRAM_SET).sort(byFoldOrder)) {
    latest = event.payload as ProgramSetPayload;
  }
  if (!latest || "cleared" in latest) return null;
  return latest;
}

export interface ProgramPosition {
  week_index: number; // 1-based; 0 = not started; clamped to total_weeks
  total_weeks: number;
  phase: ProgramWeekKind | null; // null when not_started / complete
  status: "not_started" | "on_track" | "ahead" | "behind" | "deload" | "complete";
}

// Where the household stands in the block (spec AC2). week_index counts from
// start_monday (1 on start_monday itself); ahead/behind compares the LAST
// COMPLETED week's logged sessions to the per_week baseline; the current
// week never judges (it isn't over).
export function programPosition(
  program: ProgramDefinition,
  events: EventEnvelope[],
  todayISO: string
): ProgramPosition {
  const total = program.weeks.length;
  const thisMonday = mondayOf(todayISO);
  const rawIndex =
    Math.floor(
      (Date.parse(`${thisMonday}T00:00:00Z`) -
        Date.parse(`${program.start_monday}T00:00:00Z`)) /
        (7 * 24 * 3600 * 1000)
    ) + 1;

  if (rawIndex < 1) {
    return { week_index: 0, total_weeks: total, phase: null, status: "not_started" };
  }
  if (rawIndex > total) {
    return { week_index: total, total_weeks: total, phase: null, status: "complete" };
  }

  const phase = program.weeks[rawIndex - 1].kind;
  if (phase === "deload") {
    return { week_index: rawIndex, total_weeks: total, phase, status: "deload" };
  }
  if (rawIndex === 1) {
    return { week_index: rawIndex, total_weeks: total, phase, status: "on_track" };
  }

  // last completed week: the Monday-week immediately before this one
  const prevMonday = isoAddDays(thisMonday, -7);
  const prevSunday = isoAddDays(thisMonday, -1);
  let sessions = 0;
  for (const event of resolveRevisions(events, SESSION_LOGGED)) {
    const date = localDate(event.ts);
    if (date >= prevMonday && date <= prevSunday) sessions += 1;
  }
  const status =
    sessions < program.per_week ? "behind" : sessions > program.per_week ? "ahead" : "on_track";
  return { week_index: rawIndex, total_weeks: total, phase, status };
}
