// The program fold (spec program-engine AC1-2): singleton latest-wins,
// position arithmetic, ahead/behind from the diary. Pure, fixed dates.

import { describe, expect, it } from "vitest";
import type { EventEnvelope } from "@/lib/contracts";
import { PROGRAM_SET, SESSION_LOGGED } from "@/lib/contracts";
import { activeProgram, parseProgram, programPosition } from "@/lib/program";

let seq = 0;
const ev = (type: string, payload: unknown, ts: string): EventEnvelope => ({
  event_id: `ev-${++seq}`,
  household_id: "hh-test",
  type,
  ts,
  source: "web",
  payload,
  schema_version: 1,
  precision: "exact",
});

const DEF = {
  title: "Block",
  per_week: 3,
  start_monday: "2026-07-13",
  weeks: [{ kind: "build" }, { kind: "volume" }, { kind: "peak" }, { kind: "deload" }],
};

// noon ET on a date
const at = (date: string) => `${date}T16:00:00.000Z`;
const session = (date: string, n: number) =>
  ev(SESSION_LOGGED, { title: `s${n}`, kind: "loose" }, at(date));

describe("activeProgram", () => {
  it("latest event wins and cleared removes", () => {
    const events = [
      ev(PROGRAM_SET, DEF, at("2026-07-01")),
      ev(PROGRAM_SET, { ...DEF, title: "Revised" }, at("2026-07-02")),
    ];
    expect(activeProgram(events)?.title).toBe("Revised");
    events.push(ev(PROGRAM_SET, { cleared: true }, at("2026-07-03")));
    expect(activeProgram(events)).toBeNull();
  });
});

describe("programPosition", () => {
  it("week 1 on start_monday itself, on_track with an empty diary", () => {
    expect(programPosition(DEF as never, [], "2026-07-13")).toEqual({
      week_index: 1,
      total_weeks: 4,
      phase: "build",
      status: "on_track",
    });
  });

  it("not started before start_monday", () => {
    const p = programPosition(DEF as never, [], "2026-07-12"); // the Sunday before
    expect(p).toEqual({ week_index: 0, total_weeks: 4, phase: null, status: "not_started" });
  });

  it("complete past the last week", () => {
    const p = programPosition(DEF as never, [], "2026-08-10"); // week 5's Monday
    expect(p).toEqual({ week_index: 4, total_weeks: 4, phase: null, status: "complete" });
  });

  it("deload phase wins the status regardless of the diary", () => {
    // week 4 (2026-08-03..09) is deload; last week had 0 sessions (behind-shaped)
    const p = programPosition(DEF as never, [], "2026-08-05");
    expect(p.phase).toBe("deload");
    expect(p.status).toBe("deload");
  });

  it("behind when last completed week logged fewer sessions than per_week", () => {
    // today in week 2; week 1 (07-13..19) logged 1 of 3
    const p = programPosition(DEF as never, [session("2026-07-14", 1)], "2026-07-21");
    expect(p).toEqual({ week_index: 2, total_weeks: 4, phase: "volume", status: "behind" });
  });

  it("ahead when last completed week logged more than per_week", () => {
    const diary = [1, 2, 3, 4].map((n) => session(`2026-07-1${3 + n}`, n));
    const p = programPosition(DEF as never, diary, "2026-07-21");
    expect(p.status).toBe("ahead");
  });

  it("on_track when last completed week hit per_week exactly", () => {
    const diary = [1, 2, 3].map((n) => session(`2026-07-1${3 + n}`, n));
    const p = programPosition(DEF as never, diary, "2026-07-21");
    expect(p.status).toBe("on_track");
  });

  it("sessions outside the last completed week don't count", () => {
    // 3 sessions but all in the CURRENT week — week 1 completed with 0
    const diary = [1, 2, 3].map((n) => session("2026-07-21", n));
    const p = programPosition(DEF as never, diary, "2026-07-22");
    expect(p.status).toBe("behind");
  });
});

describe("parseProgram", () => {
  it("accepts a sound program and a bare clear", () => {
    expect(parseProgram(DEF).ok).toBe(true);
    const cleared = parseProgram({ cleared: true });
    expect(cleared.ok).toBe(true);
    if (cleared.ok) expect(cleared.program).toEqual({ cleared: true });
  });

  it.each([
    ["no title", { ...DEF, title: "" }],
    ["per_week 0", { ...DEF, per_week: 0 }],
    ["per_week 8", { ...DEF, per_week: 8 }],
    ["start not a Monday", { ...DEF, start_monday: "2026-07-14" }],
    ["bad date", { ...DEF, start_monday: "monday" }],
    ["empty weeks", { ...DEF, weeks: [] }],
    ["53 weeks", { ...DEF, weeks: Array(53).fill({ kind: "build" }) }],
    ["junk kind", { ...DEF, weeks: [{ kind: "cruise" }] }],
    ["non-string note", { ...DEF, weeks: [{ kind: "build", note: 7 }] }],
  ])("rejects %s", (_name, body) => {
    expect(parseProgram(body).ok).toBe(false);
  });
});
