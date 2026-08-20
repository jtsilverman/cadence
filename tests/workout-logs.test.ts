import { createClient, type Client } from "@libsql/client";
import { beforeEach, describe, expect, it } from "vitest";
import { SET_LOGGED, SESSION_LOGGED } from "@/lib/contracts";
import { migrate } from "@/lib/db";
import { readEvents } from "@/lib/events";
import { rebuildPantry } from "@/lib/pantry";
import { parseLog, recordLog } from "@/lib/logs";

const HH = "hh-test";

const SET_BODY = {
  kind: "set",
  session_id: "sess-1",
  exercise: "Back Squat",
  set_index: 1,
  reps: 8,
  weight: 135,
  unit: "lb",
};

describe("parseLog set kind", () => {
  it("accepts a full set body", () => {
    const parsed = parseLog({ ...SET_BODY, rpe: 8, slot_id: "s1", library_id: "lib1" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.log).toEqual({
      kind: "set",
      session_id: "sess-1",
      exercise: "Back Squat",
      set_index: 1,
      reps: 8,
      weight: 135,
      unit: "lb",
      rpe: 8,
      slot_id: "s1",
      library_id: "lib1",
    });
  });

  it("accepts a bodyweight set (no weight, no unit)", () => {
    const { weight, unit, ...bodyweight } = SET_BODY;
    const parsed = parseLog(bodyweight);
    expect(parsed.ok).toBe(true);
  });

  it.each([
    ["missing exercise", { ...SET_BODY, exercise: " " }],
    ["missing session_id", { ...SET_BODY, session_id: "" }],
    ["zero reps", { ...SET_BODY, reps: 0 }],
    ["fractional set_index", { ...SET_BODY, set_index: 1.5 }],
    ["weight without unit", { ...SET_BODY, unit: undefined }],
    ["rpe out of range", { ...SET_BODY, rpe: 11 }],
  ])("rejects %s", (_label, body) => {
    expect(parseLog(body as Record<string, unknown>).ok).toBe(false);
  });

  it("session kind accepts additive session_id and library_id", () => {
    const parsed = parseLog({
      kind: "session",
      title: "Squat Day",
      session_kind: "structured",
      session_id: "sess-1",
      library_id: "lib1",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.log).toMatchObject({ session_id: "sess-1", library_id: "lib1" });
  });
});

describe("recordLog set + extended session", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });

  it("writes SetLogged with precision exact (the lifting dial)", async () => {
    const parsed = parseLog(SET_BODY);
    if (!parsed.ok) throw new Error(parsed.reason);
    await recordLog(db, HH, parsed.log);
    const [event] = await readEvents(db, HH, { type: SET_LOGGED });
    expect(event.precision).toBe("exact");
    expect(event.source).toBe("web");
    expect(event.payload).toEqual({
      session_id: "sess-1",
      exercise: "Back Squat",
      set_index: 1,
      reps: 8,
      weight: 135,
      unit: "lb",
    });
  });

  it("an extended session (session_id/library_id) writes schema_version 2; a plain one stays 1", async () => {
    const plain = parseLog({ kind: "session", title: "yoga", session_kind: "loose" });
    const extended = parseLog({
      kind: "session",
      title: "Squat Day",
      session_kind: "structured",
      session_id: "sess-1",
      library_id: "lib1",
    });
    if (!plain.ok || !extended.ok) throw new Error("parse failed");
    await recordLog(db, HH, plain.log);
    await recordLog(db, HH, extended.log);
    const events = await readEvents(db, HH, { type: SESSION_LOGGED });
    expect(events[0].schema_version).toBe(1);
    expect(events[1].schema_version).toBe(2);
    expect(events[1].payload).toMatchObject({ session_id: "sess-1", library_id: "lib1" });
  });

  it("SetLogged events leave the pantry fold untouched", async () => {
    const parsed = parseLog(SET_BODY);
    if (!parsed.ok) throw new Error(parsed.reason);
    await recordLog(db, HH, parsed.log);
    const events = await readEvents(db, HH);
    expect(rebuildPantry(events)).toEqual([]);
  });
});
