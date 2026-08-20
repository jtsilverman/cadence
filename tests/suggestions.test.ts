import { describe, it, expect, beforeEach } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { migrate } from "@/lib/db";
import { appendEvent, newEventId, readEvents } from "@/lib/events";
import {
  SUGGESTION_MADE,
  SUGGESTION_RESOLVED,
  type EaseWorkoutSuggestion,
  type NextTargetSuggestion,
} from "@/lib/contracts";
import { attachEaseSuggestions } from "@/lib/recovery";
import type { DayState } from "@/lib/schedule";
import { attachNextTargetSuggestions, type NextTarget } from "@/lib/workouts";
import {
  logSuggestions,
  normalizeResolved,
  parseSuggestion,
  parseSuggestionResolve,
  readSuggestionState,
  resolveSuggestion,
} from "@/lib/suggestions";

// Hand-written valid payloads per kind — independent literals, not built by
// the parser's own helpers (anti-tautology).
const VALID: Record<string, Record<string, unknown>> = {
  add_to_list: {
    suggestion_id: "sug-a",
    kind: "add_to_list",
    name: "rice",
    qty: 2,
    unit: "cup",
    reason: "almost out, by your cooking history",
  },
  ease_workout: {
    suggestion_id: "sug-b",
    kind: "ease_workout",
    slot_id: "slot-1",
    date: "2026-07-27",
    recovery_score: 21,
    reason: "recovery 21 this morning — consider easing today's workout",
  },
  next_target: {
    suggestion_id: "sug-c",
    kind: "next_target",
    exercise: "bench press",
    weight: 145,
    unit: "lb",
    reason: "hit 3×8 at 140 lb on 2026-07-24 — load 145",
  },
  repair: {
    suggestion_id: "sug-d",
    kind: "repair",
    missed_slot_id: "slot-9",
    option: "shift",
    recommended: true,
    days: [
      {
        date: "2026-07-29",
        // makeup slot: no slot_id — ids are minted at the user's accept-POST
        slots: [{ lane: "workout", title: "Push day" }],
      },
    ],
    reason: "you missed Monday — Wednesday is open",
  },
  plan_draft: {
    suggestion_id: "sug-e",
    kind: "plan_draft",
    scope: "slot",
    anchor: "slot-4",
    days: [
      {
        date: "2026-07-28",
        slots: [{ slot_id: "slot-4", lane: "meal", title: "Chickpea curry" }],
      },
    ],
    reason: "salmon is out — curry uses what you have",
  },
};

describe("parseSuggestion (discriminated union gate)", () => {
  for (const [kind, payload] of Object.entries(VALID)) {
    it(`accepts a valid ${kind} payload`, () => {
      const parsed = parseSuggestion(payload);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.payload).toEqual(payload);
    });
  }

  it("rejects an ease_workout missing its per-kind field (slot_id)", () => {
    const { slot_id: _omit, ...rest } = VALID.ease_workout;
    const parsed = parseSuggestion(rest);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain("slot_id");
  });

  it("rejects a next_target with a non-numeric weight", () => {
    const parsed = parseSuggestion({ ...VALID.next_target, weight: "145" });
    expect(parsed.ok).toBe(false);
  });

  it("rejects a repair with an option outside the menu", () => {
    const parsed = parseSuggestion({ ...VALID.repair, option: "improvise" });
    expect(parsed.ok).toBe(false);
  });

  it("rejects a repair whose proposed slot lacks a title", () => {
    const parsed = parseSuggestion({
      ...VALID.repair,
      days: [{ date: "2026-07-29", slots: [{ lane: "workout", title: "" }] }],
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain("title");
  });

  it("rejects a repair whose proposed slot has an unknown lane", () => {
    const parsed = parseSuggestion({
      ...VALID.repair,
      days: [{ date: "2026-07-29", slots: [{ lane: "cardio", title: "Push day" }] }],
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain("lane");
  });

  it("rejects a repair with duplicate slot_ids across proposed days", () => {
    const parsed = parseSuggestion({
      ...VALID.repair,
      days: [
        { date: "2026-07-28", slots: [{ slot_id: "s1", lane: "workout", title: "A" }] },
        { date: "2026-07-29", slots: [{ slot_id: "s1", lane: "workout", title: "B" }] },
      ],
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain("duplicate");
  });

  it("rejects an unknown kind without walking the prototype chain", () => {
    const parsed = parseSuggestion({
      suggestion_id: "sug-x",
      kind: "constructor",
      reason: "nope",
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.reason).toContain("kind");
  });

  it("rejects a payload with an empty reason", () => {
    const parsed = parseSuggestion({ ...VALID.add_to_list, reason: "" });
    expect(parsed.ok).toBe(false);
  });
});

describe("parseSuggestionResolve (route body gate)", () => {
  it("accepts {suggestion_id, outcome} and nothing else required", () => {
    const parsed = parseSuggestionResolve({
      suggestion_id: "sug-a",
      outcome: "dismissed",
    });
    expect(parsed).toEqual({
      ok: true,
      suggestion_id: "sug-a",
      outcome: "dismissed",
    });
  });

  it("rejects an outcome outside accepted|dismissed", () => {
    const parsed = parseSuggestionResolve({
      suggestion_id: "sug-a",
      outcome: "maybe",
    });
    expect(parsed.ok).toBe(false);
  });
});

describe("logSuggestions (kind-generic proposal log)", () => {
  let db: Client;
  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });
  const HH = "hh-jake";
  const ease = () => ({
    kind: "ease_workout" as const,
    slot_id: "slot-1",
    date: "2026-07-27",
    recovery_score: 21,
    reason: "recovery 21 this morning — consider easing today's workout",
  });

  it("identical ease_workout recompute reuses the open suggestion_id, no new event", async () => {
    const [first] = await logSuggestions(db, HH, [ease()]);
    const [second] = await logSuggestions(db, HH, [ease()]);
    expect(second.suggestion_id).toBe(first.suggestion_id);
    expect(await readEvents(db, HH, { type: SUGGESTION_MADE })).toHaveLength(1);
  });

  it("a drifted per-kind field mints a new suggestion_id", async () => {
    const [first] = await logSuggestions(db, HH, [ease()]);
    const [second] = await logSuggestions(db, HH, [
      { ...ease(), recovery_score: 12, reason: "recovery 12 — rest day advised" },
    ]);
    expect(second.suggestion_id).not.toBe(first.suggestion_id);
    expect(await readEvents(db, HH, { type: SUGGESTION_MADE })).toHaveLength(2);
  });

  it("two concurrent identical calls serialize to one Made event", async () => {
    const [a, b] = await Promise.all([
      logSuggestions(db, HH, [ease()]),
      logSuggestions(db, HH, [ease()]),
    ]);
    expect(a[0].suggestion_id).toBe(b[0].suggestion_id);
    expect(await readEvents(db, HH, { type: SUGGESTION_MADE })).toHaveLength(1);
  });

  it("readSuggestionState splits open from dismissed", async () => {
    const [made] = await logSuggestions(db, HH, [ease()]);
    await appendEvent(db, {
      event_id: newEventId(),
      household_id: HH,
      type: SUGGESTION_RESOLVED,
      ts: new Date().toISOString(),
      source: "web",
      payload: {
        suggestion_id: made.suggestion_id,
        kind: "ease_workout",
        outcome: "dismissed",
      },
      schema_version: 1,
      precision: "exact",
    });
    const state = await readSuggestionState(db, HH);
    expect(state.open).toEqual([]);
    expect(state.dismissed.map((p) => p.suggestion_id)).toEqual([
      made.suggestion_id,
    ]);
  });
});

describe("attachEaseSuggestions (ease advice logs the pair on surface)", () => {
  let db: Client;
  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });
  const HH = "hh-jake";
  const redDay = (): DayState => ({
    date: "2026-07-27",
    slots: [
      { slot_id: "slot-w1", lane: "workout", title: "Push day", status: "planned" },
      { slot_id: "slot-m1", lane: "meal", title: "Curry", status: "planned" },
    ],
    recovery: { score: 21 },
    advice: "ease",
  });

  it("logs one ease_workout Made per planned workout slot and attaches the id", async () => {
    const [day] = await attachEaseSuggestions(db, HH, [redDay()]);
    const made = await readEvents(db, HH, { type: SUGGESTION_MADE });
    expect(made).toHaveLength(1);
    const payload = made[0].payload as EaseWorkoutSuggestion;
    expect(payload.kind).toBe("ease_workout");
    expect(payload.slot_id).toBe("slot-w1");
    expect(payload.date).toBe("2026-07-27");
    expect(payload.recovery_score).toBe(21);
    expect(made[0].precision).toBe("estimated");
    expect(day.ease_proposals).toEqual([
      { slot_id: "slot-w1", suggestion_id: payload.suggestion_id },
    ]);
  });

  it("a repeat surface reuses the open proposal — still one event", async () => {
    await attachEaseSuggestions(db, HH, [redDay()]);
    await attachEaseSuggestions(db, HH, [redDay()]);
    expect(await readEvents(db, HH, { type: SUGGESTION_MADE })).toHaveLength(1);
  });

  it("a dismissed slot is never re-proposed, even after score drift", async () => {
    const [day] = await attachEaseSuggestions(db, HH, [redDay()]);
    const sid = day.ease_proposals![0].suggestion_id;
    await appendEvent(db, {
      event_id: newEventId(),
      household_id: HH,
      type: SUGGESTION_RESOLVED,
      ts: new Date().toISOString(),
      source: "web",
      payload: { suggestion_id: sid, kind: "ease_workout", outcome: "dismissed" },
      schema_version: 1,
      precision: "exact",
    });
    const drifted = redDay();
    drifted.recovery = { score: 12 };
    const [after] = await attachEaseSuggestions(db, HH, [drifted]);
    expect(after.ease_proposals).toBeUndefined();
    expect(await readEvents(db, HH, { type: SUGGESTION_MADE })).toHaveLength(1);
  });

  it("days without ease advice log nothing", async () => {
    const green: DayState = {
      date: "2026-07-28",
      slots: [
        { slot_id: "slot-w2", lane: "workout", title: "Pull day", status: "planned" },
      ],
      recovery: { score: 80 },
    };
    const [day] = await attachEaseSuggestions(db, HH, [green]);
    expect(day.ease_proposals).toBeUndefined();
    expect(await readEvents(db, HH, { type: SUGGESTION_MADE })).toHaveLength(0);
  });
});

describe("attachNextTargetSuggestions (progression targets log the pair on surface)", () => {
  let db: Client;
  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });
  const HH = "hh-jake";
  const bench = (): NextTarget => ({
    weight: 145,
    unit: "lb",
    reason: "hit 3×8 at 140 lb on 2026-07-24 — load 145",
  });

  it("logs one next_target Made per exercise and attaches the id", async () => {
    const out = await attachNextTargetSuggestions(
      db,
      HH,
      new Map([["bench press", bench()]])
    );
    const made = await readEvents(db, HH, { type: SUGGESTION_MADE });
    expect(made).toHaveLength(1);
    const payload = made[0].payload as NextTargetSuggestion;
    expect(payload.kind).toBe("next_target");
    expect(payload.exercise).toBe("bench press");
    expect(payload.weight).toBe(145);
    expect(payload.unit).toBe("lb");
    expect(made[0].precision).toBe("estimated");
    expect(out.get("bench press")?.suggestion_id).toBe(payload.suggestion_id);
  });

  it("a repeat surface reuses the open proposal — still one event", async () => {
    await attachNextTargetSuggestions(db, HH, new Map([["bench press", bench()]]));
    await attachNextTargetSuggestions(db, HH, new Map([["bench press", bench()]]));
    expect(await readEvents(db, HH, { type: SUGGESTION_MADE })).toHaveLength(1);
  });

  it("a dismissed target silences the exercise while weight/unit are unchanged", async () => {
    const out = await attachNextTargetSuggestions(
      db,
      HH,
      new Map([["bench press", bench()]])
    );
    await appendEvent(db, {
      event_id: newEventId(),
      household_id: HH,
      type: SUGGESTION_RESOLVED,
      ts: new Date().toISOString(),
      source: "web",
      payload: {
        suggestion_id: out.get("bench press")!.suggestion_id!,
        kind: "next_target",
        outcome: "dismissed",
      },
      schema_version: 1,
      precision: "exact",
    });
    const again = await attachNextTargetSuggestions(
      db,
      HH,
      new Map([["bench press", bench()]])
    );
    expect(again.get("bench press")?.suggestion_id).toBeUndefined();
    expect(await readEvents(db, HH, { type: SUGGESTION_MADE })).toHaveLength(1);
  });

  it("a changed target re-proposes after a dismissal", async () => {
    const out = await attachNextTargetSuggestions(
      db,
      HH,
      new Map([["bench press", bench()]])
    );
    await appendEvent(db, {
      event_id: newEventId(),
      household_id: HH,
      type: SUGGESTION_RESOLVED,
      ts: new Date().toISOString(),
      source: "web",
      payload: {
        suggestion_id: out.get("bench press")!.suggestion_id!,
        kind: "next_target",
        outcome: "dismissed",
      },
      schema_version: 1,
      precision: "exact",
    });
    const heavier: NextTarget = {
      weight: 150,
      unit: "lb",
      reason: "hit 3×8 at 145 lb on 2026-07-31 — load 150",
    };
    const again = await attachNextTargetSuggestions(
      db,
      HH,
      new Map([["bench press", heavier]])
    );
    expect(again.get("bench press")?.suggestion_id).toBeDefined();
    expect(await readEvents(db, HH, { type: SUGGESTION_MADE })).toHaveLength(2);
  });
});

describe("resolveSuggestion (server derives kind from the open Made)", () => {
  let db: Client;
  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });
  const HH = "hh-jake";

  it("writes a Resolved carrying the Made's kind and add_to_list name", async () => {
    const [made] = await logSuggestions(db, HH, [
      { kind: "add_to_list", name: "rice", qty: 2, unit: "cup", reason: "almost out" },
    ]);
    const result = await resolveSuggestion(db, HH, {
      suggestion_id: made.suggestion_id,
      outcome: "dismissed",
    });
    expect(result.ok).toBe(true);
    const events = await readEvents(db, HH, { type: SUGGESTION_RESOLVED });
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual({
      suggestion_id: made.suggestion_id,
      kind: "add_to_list",
      name: "rice",
      outcome: "dismissed",
    });
    expect(events[0].precision).toBe("exact");
  });

  it("a non-grocery kind resolves without a name", async () => {
    const [made] = await logSuggestions(db, HH, [
      {
        kind: "ease_workout",
        slot_id: "slot-1",
        date: "2026-07-27",
        recovery_score: 21,
        reason: "recovery 21 — ease",
      },
    ]);
    const result = await resolveSuggestion(db, HH, {
      suggestion_id: made.suggestion_id,
      outcome: "accepted",
    });
    expect(result.ok).toBe(true);
    const [event] = await readEvents(db, HH, { type: SUGGESTION_RESOLVED });
    expect(event.payload).toEqual({
      suggestion_id: made.suggestion_id,
      kind: "ease_workout",
      outcome: "accepted",
    });
  });

  it("rejects an id with no open Made, writing nothing", async () => {
    const result = await resolveSuggestion(db, HH, {
      suggestion_id: "sug-ghost",
      outcome: "accepted",
    });
    expect(result.ok).toBe(false);
    expect(await readEvents(db, HH, { type: SUGGESTION_RESOLVED })).toHaveLength(0);
  });

  it("two concurrent resolutions serialize: one wins, one 422s, one event", async () => {
    const [made] = await logSuggestions(db, HH, [
      { kind: "add_to_list", name: "rice", qty: 2, unit: "cup", reason: "almost out" },
    ]);
    const [a, b] = await Promise.all([
      resolveSuggestion(db, HH, { suggestion_id: made.suggestion_id, outcome: "accepted" }),
      resolveSuggestion(db, HH, { suggestion_id: made.suggestion_id, outcome: "dismissed" }),
    ]);
    expect([a.ok, b.ok].filter(Boolean)).toHaveLength(1);
    expect(await readEvents(db, HH, { type: SUGGESTION_RESOLVED })).toHaveLength(1);
  });

  it("rejects a second resolution of the same suggestion", async () => {
    const [made] = await logSuggestions(db, HH, [
      { kind: "add_to_list", name: "rice", qty: 2, unit: "cup", reason: "almost out" },
    ]);
    const first = await resolveSuggestion(db, HH, {
      suggestion_id: made.suggestion_id,
      outcome: "accepted",
    });
    expect(first.ok).toBe(true);
    const second = await resolveSuggestion(db, HH, {
      suggestion_id: made.suggestion_id,
      outcome: "dismissed",
    });
    expect(second.ok).toBe(false);
    expect(await readEvents(db, HH, { type: SUGGESTION_RESOLVED })).toHaveLength(1);
  });
});

describe("normalizeResolved (legacy rows default on read)", () => {
  it("stamps kind add_to_list onto a pre-v2 payload that has none", () => {
    const legacy = { suggestion_id: "sug-old", name: "rice", outcome: "dismissed" as const };
    expect(normalizeResolved(legacy)).toEqual({ ...legacy, kind: "add_to_list" });
  });

  it("leaves an already-kinded payload untouched", () => {
    const kinded = {
      suggestion_id: "sug-new",
      kind: "ease_workout" as const,
      outcome: "accepted" as const,
    };
    expect(normalizeResolved(kinded)).toEqual(kinded);
  });
});

// spec program-engine AC9: recommended is presentation rank, not proposal
// substance — a re-rank (LLM or rule change) must not re-mint the pair and
// drop a user's standing dismissal.
describe("logSuggestions recommended-exemption", () => {
  let db: Client;
  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });
  const HH = "hh-jake";
  const repair = (recommended?: true) => {
    const p: Record<string, unknown> = {
      kind: "repair" as const,
      missed_slot_id: "w-1",
      option: "shift" as const,
      days: [{ date: "2026-07-27", slots: [{ lane: "workout", title: "Run" }] }],
      reason: "you missed it",
    };
    if (recommended) p.recommended = true;
    return p as never;
  };

  it("a flipped recommended reuses the open pair instead of minting fresh", async () => {
    const [first] = await logSuggestions(db, HH, [repair(true)]);
    const [second] = await logSuggestions(db, HH, [repair()]);
    expect(second.suggestion_id).toBe(first.suggestion_id);
    expect(await readEvents(db, HH, { type: SUGGESTION_MADE })).toHaveLength(1);
  });
});

// spec planner-composer AC1: plan_draft days now validate like repair days.
describe("plan_draft gate tightened", () => {
  const base = {
    suggestion_id: "sug-pd",
    kind: "plan_draft",
    scope: "week",
    anchor: "2026-08-03",
    reason: "next week",
  };
  it("rejects a slot with no lane or title", () => {
    expect(
      parseSuggestion({ ...base, days: [{ date: "2026-08-03", slots: [{}] }] }).ok
    ).toBe(false);
    expect(
      parseSuggestion({
        ...base,
        days: [{ date: "2026-08-03", slots: [{ lane: "meal" }] }],
      }).ok
    ).toBe(false);
  });
});

// spec planner-composer AC2: drift supersedes — the old pair is retired into
// its own bucket, never left open and never counted as a user dismissal.
describe("logSuggestions supersession", () => {
  let db: Client;
  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });
  const HH = "hh-jake";
  const draft = (title: string) => ({
    kind: "plan_draft" as const,
    scope: "week" as const,
    anchor: "2026-08-03",
    days: [{ date: "2026-08-03", slots: [{ lane: "meal" as const, title }] }],
    reason: "next week, drafted",
  });

  it("a drifted recompute retires the old pair as superseded, leaving one open", async () => {
    const [first] = await logSuggestions(db, HH, [draft("Chili")]);
    const [second] = await logSuggestions(db, HH, [draft("Curry")]);
    expect(second.suggestion_id).not.toBe(first.suggestion_id);
    const state = await readSuggestionState(db, HH);
    const openDrafts = state.open.filter((p) => p.kind === "plan_draft");
    expect(openDrafts).toHaveLength(1);
    expect(openDrafts[0].suggestion_id).toBe(second.suggestion_id);
    expect(state.superseded.map((p) => p.suggestion_id)).toEqual([first.suggestion_id]);
    expect(state.dismissed).toHaveLength(0);
  });

  it("an unchanged recompute still reuses the open pair", async () => {
    const [first] = await logSuggestions(db, HH, [draft("Chili")]);
    const [second] = await logSuggestions(db, HH, [draft("Chili")]);
    expect(second.suggestion_id).toBe(first.suggestion_id);
    expect((await readSuggestionState(db, HH)).superseded).toHaveLength(0);
  });

  it("a superseded ease pair does not silence future ease advice for its slot", async () => {
    const ease = (score: number) => ({
      kind: "ease_workout" as const,
      slot_id: "slot-z",
      date: "2026-07-28",
      recovery_score: score,
      reason: `recovery ${score} — ease up`,
    });
    await logSuggestions(db, HH, [ease(20)]);
    await logSuggestions(db, HH, [ease(12)]); // drift → supersedes the first
    const state = await readSuggestionState(db, HH);
    expect(state.superseded).toHaveLength(1);
    // the reader contract: silencing keys off dismissed only
    expect(state.dismissed).toHaveLength(0);
    expect(state.open.filter((p) => p.kind === "ease_workout")).toHaveLength(1);
  });
});
