// The autonomy ladder's rung state (spec retraction-ladder, UX.md:77): per
// action type (SuggestionKind), set by the user, never forced. This is state
// + evidence only — nothing reads a rung to auto-apply yet; the first
// auto-applying producer must amend the suggest-only invariant explicitly.

import type { Client } from "@libsql/client";
import type {
  AutonomyRung,
  AutonomyRungSetPayload,
  EventEnvelope,
  SuggestionKind,
} from "./contracts";
import { AUTONOMY_RUNGS, AUTONOMY_RUNG_SET } from "./contracts";
import { appendEvent, byFoldOrder, newEventId } from "./events";
import { readSuggestionState } from "./suggestions";

// One list of kinds, derived from the union so a new SuggestionKind fails the
// exhaustive check here instead of silently missing a rung.
const KINDS: Record<SuggestionKind, true> = {
  add_to_list: true,
  ease_workout: true,
  next_target: true,
  repair: true,
  plan_draft: true,
  nutrition_adjust: true,
  goal_proposal: true,
};
export const SUGGESTION_KINDS = Object.keys(KINDS) as SuggestionKind[];

const DEFAULT_RUNG: AutonomyRung = "one_tap"; // today's de facto behavior

// Gate for untrusted API bodies.
export function parseRungSet(
  body: Record<string, unknown>
): { ok: true; payload: AutonomyRungSetPayload } | { ok: false; reason: string } {
  if (typeof body.kind !== "string" || !(SUGGESTION_KINDS as string[]).includes(body.kind)) {
    return { ok: false, reason: `kind must be one of ${SUGGESTION_KINDS.join(" | ")}` };
  }
  if (typeof body.rung !== "string" || !(AUTONOMY_RUNGS as string[]).includes(body.rung)) {
    return { ok: false, reason: `rung must be one of ${AUTONOMY_RUNGS.join(" | ")}` };
  }
  return {
    ok: true,
    payload: { kind: body.kind as SuggestionKind, rung: body.rung as AutonomyRung },
  };
}

export async function recordRung(
  db: Client,
  householdId: string,
  payload: AutonomyRungSetPayload
): Promise<void> {
  await appendEvent(db, {
    event_id: newEventId(),
    household_id: householdId,
    type: AUTONOMY_RUNG_SET,
    ts: new Date().toISOString(),
    source: "web",
    payload,
    schema_version: 1,
    // the user's own explicit grant
    precision: "exact",
  });
}

// Latest rung per kind; unset kinds sit at the default.
export function rungsByKind(events: EventEnvelope[]): Record<SuggestionKind, AutonomyRung> {
  const rungs = Object.fromEntries(
    SUGGESTION_KINDS.map((k) => [k, DEFAULT_RUNG])
  ) as Record<SuggestionKind, AutonomyRung>;
  for (const event of events.filter((e) => e.type === AUTONOMY_RUNG_SET).sort(byFoldOrder)) {
    const p = event.payload as AutonomyRungSetPayload;
    if (p.kind in KINDS) rungs[p.kind] = p.rung;
  }
  return rungs;
}

export interface AutonomyView {
  rung: AutonomyRung;
  accepted: number;
  dismissed: number;
}

// Rung + the ladder's evidence (the suggestion pair) per kind.
export async function autonomyState(
  db: Client,
  householdId: string,
  events: EventEnvelope[]
): Promise<Record<SuggestionKind, AutonomyView>> {
  const rungs = rungsByKind(events);
  const { accepted, dismissed } = await readSuggestionState(db, householdId);
  const view = Object.fromEntries(
    SUGGESTION_KINDS.map((k) => [k, { rung: rungs[k], accepted: 0, dismissed: 0 }])
  ) as Record<SuggestionKind, AutonomyView>;
  for (const p of accepted) view[p.kind].accepted += 1;
  for (const p of dismissed) view[p.kind].dismissed += 1;
  return view;
}
