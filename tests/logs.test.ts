import { describe, it, expect, beforeEach } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { migrate } from "@/lib/db";
import { readEvents } from "@/lib/events";
import { parseLog, recordLog } from "@/lib/logs";
import {
  JOURNAL_ENTRY,
  SESSION_LOGGED,
  SLEPT_LOGGED,
  SLOT_SKIPPED,
} from "@/lib/contracts";

const HH = "hh-jake";

describe("parseLog (untrusted body gate)", () => {
  it("accepts each kind with its required fields", () => {
    expect(
      parseLog({ kind: "session", title: "yoga class", session_kind: "loose" }).ok
    ).toBe(true);
    expect(parseLog({ kind: "sleep", date: "2026-07-27", quality: "ok" }).ok).toBe(true);
    expect(parseLog({ kind: "journal", text: "good day" }).ok).toBe(true);
    expect(parseLog({ kind: "skip", slot_id: "s-1", lane: "workout" }).ok).toBe(true);
  });

  it("rejects unknown kinds, missing fields, bad enums", () => {
    expect(parseLog({ kind: "nap" }).ok).toBe(false);
    expect(parseLog({ kind: "session", title: " ", session_kind: "loose" }).ok).toBe(false);
    expect(parseLog({ kind: "session", title: "run", session_kind: "medium" }).ok).toBe(false);
    expect(parseLog({ kind: "sleep", date: "yesterday", quality: "ok" }).ok).toBe(false);
    expect(parseLog({ kind: "sleep", date: "2026-07-27", quality: "amazing" }).ok).toBe(false);
    expect(parseLog({ kind: "journal", text: "" }).ok).toBe(false);
    expect(parseLog({ kind: "skip", slot_id: "", lane: "meal" }).ok).toBe(false);
  });
});

describe("recordLog (one typed event per tap)", () => {
  let db: Client;
  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });

  it("session → SessionLogged, self-reported numbers are estimated", async () => {
    await recordLog(db, HH, {
      kind: "session",
      title: "sauna",
      session_kind: "loose",
    });
    const events = await readEvents(db, HH, { type: SESSION_LOGGED });
    expect(events).toHaveLength(1);
    expect(events[0].payload).toEqual({ title: "sauna", kind: "loose" });
    expect(events[0].precision).toBe("estimated");
  });

  it("sleep → SleptLogged with the night's date", async () => {
    await recordLog(db, HH, {
      kind: "sleep",
      date: "2026-07-27",
      quality: "great",
      hours: 8,
    });
    const events = await readEvents(db, HH, { type: SLEPT_LOGGED });
    expect(events[0].payload).toEqual({ date: "2026-07-27", quality: "great", hours: 8 });
    expect(events[0].precision).toBe("estimated");
  });

  it("journal → JournalEntry, user's own words are exact", async () => {
    await recordLog(db, HH, { kind: "journal", text: "solid week", slot_id: "s-mind" });
    const events = await readEvents(db, HH, { type: JOURNAL_ENTRY });
    expect(events[0].payload).toEqual({ text: "solid week", slot_id: "s-mind" });
    expect(events[0].precision).toBe("exact");
  });

  it("skip → SlotSkipped", async () => {
    await recordLog(db, HH, { kind: "skip", slot_id: "s-1", lane: "meal" });
    const events = await readEvents(db, HH, { type: SLOT_SKIPPED });
    expect(events[0].payload).toEqual({ slot_id: "s-1", lane: "meal" });
    expect(events[0].precision).toBe("exact");
  });
});
