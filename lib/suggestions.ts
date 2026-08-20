// The kind-generic suggestion pair (spec suggestion-pair-v2): parse gates for
// the discriminated union. Producers construct payloads server-side, but the
// gate is the one shape authority — tests, the resolve route, and future
// engine inputs all validate here.

import type { Client } from "@libsql/client";
import type {
  SuggestionKind,
  SuggestionMadePayload,
  SuggestionResolvedPayload,
} from "./contracts";
import { SLOT_LANES, SUGGESTION_MADE, SUGGESTION_RESOLVED } from "./contracts";
import { isValidDate } from "./dates";
import { appendEvent, newEventId, readEvents } from "./events";

export type ParseSuggestionResult =
  | { ok: true; payload: SuggestionMadePayload }
  | { ok: false; reason: string };

const nonEmpty = (v: unknown): v is string =>
  typeof v === "string" && v.trim() !== "";
const finiteNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);
const numOrNull = (v: unknown): boolean => v === null || finiteNum(v);
const strOrNull = (v: unknown): boolean => v === null || typeof v === "string";

const REPAIR_OPTIONS = [
  "shift",
  "double_up",
  "consolidate",
  "drop",
  "redistribute",
];
const DRAFT_SCOPES = ["week", "day", "slot"];

// plan_draft carries proposed schedule days with a provisional shape
// (finalized by the planner spec), so validate the frame (dated days holding
// a slots array), not slot internals.
function checkDays(v: unknown): string | null {
  if (!Array.isArray(v) || v.length === 0) {
    return "days must be a non-empty array";
  }
  for (const day of v) {
    if (typeof day !== "object" || day === null) {
      return "each day must be an object";
    }
    const d = day as Record<string, unknown>;
    if (typeof d.date !== "string" || !isValidDate(d.date)) {
      return "each day needs a YYYY-MM-DD date";
    }
    if (!Array.isArray(d.slots)) return "each day needs a slots array";
  }
  return null;
}

// repair days are a full replacement plan the user may apply verbatim, so
// slots validate like parseScheduleDays (lane, title, library_id, duplicate
// ids) minus the mint: new slots legitimately omit slot_id here — ids are
// minted at the accept-POST, keeping producer recomputes byte-identical.
function checkProposedDays(v: unknown): string | null {
  const frame = checkDays(v);
  if (frame) return frame;
  const seenIds = new Set<string>();
  for (const day of v as Array<Record<string, unknown>>) {
    for (const raw of day.slots as unknown[]) {
      const { slot_id, lane, title, library_id, priority } = (raw ?? {}) as Record<string, unknown>;
      if (typeof lane !== "string" || !(SLOT_LANES as readonly string[]).includes(lane)) {
        return `lane must be one of ${SLOT_LANES.join(" | ")}`;
      }
      if (!nonEmpty(title)) return "every slot needs a title";
      if (library_id !== undefined && typeof library_id !== "string") {
        return `bad library_id for "${title}"`;
      }
      if (priority !== undefined && priority !== "high") {
        return `priority, when present, must be "high" ("${title}")`;
      }
      if (slot_id !== undefined) {
        if (!nonEmpty(slot_id)) return "slot_id, when present, must be non-empty";
        if (seenIds.has(slot_id)) return `duplicate slot_id "${slot_id}"`;
        seenIds.add(slot_id);
      }
    }
  }
  return null;
}

// Additive-optional volume guidance on repair (spec program-engine): validated
// when present, absent is fine.
function checkExerciseSets(v: unknown): boolean {
  if (!Array.isArray(v) || v.length === 0) return false;
  return v.every((e) => {
    const { name, sets } = (e ?? {}) as Record<string, unknown>;
    return nonEmpty(name) && typeof sets === "number" && Number.isInteger(sets) && sets > 0;
  });
}

function checkRepairVolume(v: unknown): string | null {
  if (v === undefined) return null;
  if (typeof v !== "object" || v === null || Array.isArray(v)) {
    return "volume must be an object";
  }
  const { host, added, assignments } = v as Record<string, unknown>;
  if (host !== undefined && !checkExerciseSets(host)) return "bad volume.host";
  if (added !== undefined && !checkExerciseSets(added)) return "bad volume.added";
  if (assignments !== undefined) {
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return "bad volume.assignments";
    }
    for (const a of assignments) {
      const { date, slot_id, exercises } = (a ?? {}) as Record<string, unknown>;
      if (typeof date !== "string" || !isValidDate(date)) return "bad assignment date";
      if (!nonEmpty(slot_id)) return "bad assignment slot_id";
      if (!checkExerciseSets(exercises)) return "bad assignment exercises";
    }
  }
  return null;
}

// Per-kind field gates. Returns a reason or null. Dispatch is hasOwnProperty
// (never bare indexing) so a user-supplied kind can't walk the prototype chain.
const GATES: Record<SuggestionKind, (p: Record<string, unknown>) => string | null> = {
  add_to_list: (p) =>
    !nonEmpty(p.name)
      ? "name required"
      : !numOrNull(p.qty)
        ? "qty must be a number or null"
        : !strOrNull(p.unit)
          ? "unit must be a string or null"
          : null,
  ease_workout: (p) =>
    !nonEmpty(p.slot_id)
      ? "slot_id required"
      : typeof p.date !== "string" || !isValidDate(p.date)
        ? "date must be YYYY-MM-DD"
        : !finiteNum(p.recovery_score)
          ? "recovery_score must be a number"
          : null,
  next_target: (p) =>
    !nonEmpty(p.exercise)
      ? "exercise required"
      : !finiteNum(p.weight)
        ? "weight must be a number"
        : !nonEmpty(p.unit)
          ? "unit required"
          : null,
  repair: (p) =>
    !nonEmpty(p.missed_slot_id)
      ? "missed_slot_id required"
      : typeof p.option !== "string" || !REPAIR_OPTIONS.includes(p.option)
        ? `option must be one of ${REPAIR_OPTIONS.join("|")}`
        : p.recommended !== undefined && p.recommended !== true
          ? "recommended, when present, must be true"
          : (checkProposedDays(p.days) ?? checkRepairVolume(p.volume)),
  plan_draft: (p) =>
    typeof p.scope !== "string" || !DRAFT_SCOPES.includes(p.scope)
      ? "scope must be week|day|slot"
      : !nonEmpty(p.anchor)
        ? "anchor required"
        : checkProposedDays(p.days),
  nutrition_adjust: (p) =>
    typeof p.week_start !== "string" || !isValidDate(p.week_start)
      ? "week_start must be YYYY-MM-DD"
      : !finiteNum(p.overage_calories) || p.overage_calories <= 0
        ? "overage_calories must be a positive number"
        : !finiteNum(p.per_day_cap) || p.per_day_cap <= 0
          ? "per_day_cap must be a positive number"
          : !Number.isInteger(p.days_remaining) ||
              (p.days_remaining as number) < 1 ||
              (p.days_remaining as number) > 7
            ? "days_remaining must be 1-7"
            : null,
  goal_proposal: (p) =>
    !finiteNum(p.daily_calories) || (p.daily_calories as number) < 1200
      ? "daily_calories must be a number >= 1200"
      : null,
};

export function parseSuggestion(value: unknown): ParseSuggestionResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "payload must be an object" };
  }
  const p = value as Record<string, unknown>;
  if (!nonEmpty(p.suggestion_id)) {
    return { ok: false, reason: "suggestion_id required" };
  }
  if (
    typeof p.kind !== "string" ||
    !Object.prototype.hasOwnProperty.call(GATES, p.kind)
  ) {
    return { ok: false, reason: "unknown suggestion kind" };
  }
  if (!nonEmpty(p.reason)) return { ok: false, reason: "reason required" };
  const failed = GATES[p.kind as SuggestionKind](p);
  if (failed) return { ok: false, reason: failed };
  return { ok: true, payload: value as SuggestionMadePayload };
}

export type ParseResolveResult =
  | { ok: true; suggestion_id: string; outcome: "accepted" | "dismissed" }
  | { ok: false; reason: string };

// The resolve body narrows to the pair's identity + verdict; kind and any
// denormalized fields are derived server-side from the open SuggestionMade.
export function parseSuggestionResolve(value: unknown): ParseResolveResult {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { ok: false, reason: "body must be an object" };
  }
  const p = value as Record<string, unknown>;
  if (!nonEmpty(p.suggestion_id)) {
    return { ok: false, reason: "suggestion_id required" };
  }
  if (p.outcome !== "accepted" && p.outcome !== "dismissed") {
    return { ok: false, reason: "outcome must be accepted|dismissed" };
  }
  return { ok: true, suggestion_id: p.suggestion_id, outcome: p.outcome };
}

// A proposal is a payload the producer computed, identity not yet assigned.
type DistributeOmit<T, K extends string> = T extends unknown ? Omit<T, K> : never;
export type SuggestionProposal = DistributeOmit<SuggestionMadePayload, "suggestion_id">;

const norm = (s: string) => s.trim().toLowerCase();

// Which real-world thing a proposal is about — a recompute of the same thing
// reuses the open proposal instead of minting a duplicate.
function identityKey(p: SuggestionProposal | SuggestionMadePayload): string {
  switch (p.kind) {
    case "add_to_list":
      return `add_to_list:${norm(p.name)}`;
    case "ease_workout":
      return `ease_workout:${p.slot_id}`;
    case "next_target":
      return `next_target:${norm(p.exercise)}`;
    case "repair":
      // per-option: the menu offers pick + alternates for one miss, and each
      // must survive as its own pair (dismissing one keeps the others open)
      return `repair:${p.missed_slot_id}:${p.option}`;
    case "plan_draft":
      // anchored to the thing proposed about (week Monday / date / slot_id);
      // the days blob is payload — drift supersedes instead of stacking opens
      return `plan_draft:${p.scope}:${p.anchor}`;
    case "nutrition_adjust":
      // one correction per week: a dismissal silences the whole week even as
      // the numbers drift with further cooks
      return `nutrition_adjust:${p.week_start}`;
    case "goal_proposal":
      // one open target proposal at a time: a new derivation supersedes
      return "goal_proposal";
  }
}

// Key-order-independent equality: producers rebuild payload literals each
// request, so field order must not defeat reuse.
function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(",")}]`;
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    const body = Object.keys(o)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
      .join(",");
    return `{${body}}`;
  }
  return JSON.stringify(v);
}

// `recommended` is presentation rank, not proposal substance (spec
// program-engine AC9): a re-rank — LLM scoring or a pick-rule change — must
// reuse the open pair, or every re-rank would drop standing dismissals.
function payloadMatches(
  open: SuggestionMadePayload,
  proposal: SuggestionProposal
): boolean {
  const { suggestion_id: _id, recommended: _r, ...fields } = open as unknown as Record<string, unknown>;
  const { recommended: _pr, ...proposed } = proposal as Record<string, unknown>;
  return stableStringify(fields) === stableStringify(proposed);
}

// Every SuggestionMade, split by its resolution: open (no SuggestionResolved
// yet), accepted, and dismissed. Producers apply their own per-kind silencing
// rules on `dismissed` (and repair's accepted-silences-slot on `accepted`);
// the logger reuses `open`.
export async function readSuggestionState(
  db: Client,
  householdId: string
): Promise<{
  open: SuggestionMadePayload[];
  accepted: SuggestionMadePayload[];
  dismissed: SuggestionMadePayload[];
  superseded: SuggestionMadePayload[];
}> {
  const made = await readEvents(db, householdId, { type: SUGGESTION_MADE });
  const outcomeById = new Map<string, SuggestionResolvedPayload["outcome"]>();
  for (const e of await readEvents(db, householdId, { type: SUGGESTION_RESOLVED })) {
    const p = normalizeResolved(e.payload as SuggestionResolvedPayload);
    outcomeById.set(p.suggestion_id, p.outcome);
  }
  const open: SuggestionMadePayload[] = [];
  const accepted: SuggestionMadePayload[] = [];
  const dismissed: SuggestionMadePayload[] = [];
  const superseded: SuggestionMadePayload[] = [];
  for (const e of made) {
    const p = e.payload as SuggestionMadePayload;
    const outcome = outcomeById.get(p.suggestion_id);
    // exhaustive: an unknown outcome value must never silently count as a
    // user dismissal (superseded is machine-retired, not a verdict)
    if (outcome === undefined) open.push(p);
    else if (outcome === "accepted") accepted.push(p);
    else if (outcome === "dismissed") dismissed.push(p);
    else superseded.push(p);
  }
  return { open, accepted, dismissed, superseded };
}

// Writes serialize behind an in-process chain (the pantry-write idiom):
// producers log on GET routes, which fire on every page mount — two tabs or a
// double-effect both reading "no open match" would double-write without it.
let suggestionWriteChain: Promise<unknown> = Promise.resolve();

// Every shown suggestion is a logged proposal. An open proposal for the same
// identity is reused ONLY while its payload still matches the recomputation —
// drift mints a fresh SuggestionMade, so a resolution never pairs against
// stale suggested data.
export function logSuggestions(
  db: Client,
  householdId: string,
  proposals: SuggestionProposal[]
): Promise<SuggestionMadePayload[]> {
  const run = async (): Promise<SuggestionMadePayload[]> => {
    const { open } = await readSuggestionState(db, householdId);
    const openByKey = new Map(open.map((p) => [identityKey(p), p]));
    const out: SuggestionMadePayload[] = [];
    for (const proposal of proposals) {
      const existing = openByKey.get(identityKey(proposal));
      if (existing && payloadMatches(existing, proposal)) {
        out.push(existing);
        continue;
      }
      // Same identity, drifted payload: the old pair is machine-retired
      // (superseded), never left dangling open and never a user dismissal —
      // a living recompute must not stack open pairs (spec planner-composer).
      if (existing) {
        await appendEvent(db, {
          event_id: newEventId(),
          household_id: householdId,
          type: SUGGESTION_RESOLVED,
          ts: new Date().toISOString(),
          source: "web",
          payload: {
            suggestion_id: existing.suggestion_id,
            kind: existing.kind,
            outcome: "superseded",
          } satisfies SuggestionResolvedPayload,
          schema_version: 1,
          // machine bookkeeping, not a user verdict
          precision: "estimated",
        });
        openByKey.delete(identityKey(proposal));
      }
      const payload = {
        suggestion_id: newEventId(),
        ...proposal,
      } as SuggestionMadePayload;
      await appendEvent(db, {
        event_id: newEventId(),
        household_id: householdId,
        type: SUGGESTION_MADE,
        ts: new Date().toISOString(),
        source: "web",
        payload,
        schema_version: 1,
        // derived from history + plan math, not user-asserted truth
        precision: "estimated",
      });
      out.push(payload);
    }
    return out;
  };
  const next = suggestionWriteChain.then(run, run);
  suggestionWriteChain = next.catch(() => {});
  return next;
}

// Resolve one suggestion: kind (and add_to_list's denormalized name) derive
// from the open SuggestionMade server-side — the client asserts only identity
// + verdict, and an id with no open proposal is an error, not a write.
export function resolveSuggestion(
  db: Client,
  householdId: string,
  body: unknown
): Promise<
  { ok: true; payload: SuggestionResolvedPayload } | { ok: false; reason: string }
> {
  // Same chain as logSuggestions: an unserialized read-then-append lets two
  // concurrent resolves both see the suggestion open and write conflicting
  // verdicts for one suggestion_id.
  const run = () => resolveSuggestionUnserialized(db, householdId, body);
  const next = suggestionWriteChain.then(run, run);
  suggestionWriteChain = next.catch(() => {});
  return next;
}

async function resolveSuggestionUnserialized(
  db: Client,
  householdId: string,
  body: unknown
): Promise<
  { ok: true; payload: SuggestionResolvedPayload } | { ok: false; reason: string }
> {
  const parsed = parseSuggestionResolve(body);
  if (!parsed.ok) return parsed;
  const { open } = await readSuggestionState(db, householdId);
  const made = open.find((p) => p.suggestion_id === parsed.suggestion_id);
  if (!made) return { ok: false, reason: "no open suggestion with that id" };

  const payload: SuggestionResolvedPayload = {
    suggestion_id: parsed.suggestion_id,
    kind: made.kind,
    outcome: parsed.outcome,
  };
  // add_to_list keeps the denormalized name: the replenisher's dismissal
  // window filters on it without joining back to the Made event.
  if (made.kind === "add_to_list") payload.name = made.name;

  await appendEvent(db, {
    event_id: newEventId(),
    household_id: householdId,
    type: SUGGESTION_RESOLVED,
    ts: new Date().toISOString(),
    source: "web",
    payload,
    schema_version: 1,
    // a user verdict, not machine inference
    precision: "exact",
  });
  return { ok: true, payload };
}

// Durable-row default on read: pre-v2 SuggestionResolved rows carry no kind;
// add_to_list was the only kind that existed when they were written.
export function normalizeResolved(
  payload: SuggestionResolvedPayload
): SuggestionResolvedPayload {
  return payload.kind ? payload : { ...payload, kind: "add_to_list" };
}
