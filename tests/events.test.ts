import { describe, it, expect, beforeEach } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { migrate } from "@/lib/db";
import { appendEvent, newEventId, readEvents } from "@/lib/events";
import type { EventEnvelope } from "@/lib/contracts";

function event(id: string, ts: string, type = "PantryAsserted"): EventEnvelope {
  return {
    event_id: id,
    household_id: "hh-jake",
    type,
    ts,
    source: "web",
    payload: { name: "eggs", qty: 12, unit: "count" },
    schema_version: 1,
    precision: "exact",
  };
}

describe("event spine", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });

  it("round-trips the full envelope and returns events ts-ordered", async () => {
    const later = event("e2", "2026-07-22T10:00:00Z");
    const earlier = event("e1", "2026-07-20T10:00:00Z");
    await appendEvent(db, later);
    await appendEvent(db, earlier);

    const got = await readEvents(db, "hh-jake");

    expect(got).toEqual([earlier, later]);
  });

  it("rejects a duplicate event_id (append-only, no silent double-write)", async () => {
    await appendEvent(db, event("e1", "2026-07-20T10:00:00Z"));
    await expect(
      appendEvent(db, event("e1", "2026-07-21T10:00:00Z"))
    ).rejects.toThrow();
    expect(await readEvents(db, "hh-jake")).toHaveLength(1);
  });

  it("scopes reads to the household", async () => {
    await appendEvent(db, event("e1", "2026-07-20T10:00:00Z"));
    await appendEvent(db, {
      ...event("e2", "2026-07-20T11:00:00Z"),
      household_id: "hh-other",
    });
    const got = await readEvents(db, "hh-jake");
    expect(got.map((e) => e.event_id)).toEqual(["e1"]);
  });

  it("filters by type when asked", async () => {
    await appendEvent(db, event("e1", "2026-07-20T10:00:00Z", "PantryAsserted"));
    await appendEvent(db, event("e2", "2026-07-20T11:00:00Z", "OrderPlaced"));
    const got = await readEvents(db, "hh-jake", { type: "OrderPlaced" });
    expect(got.map((e) => e.event_id)).toEqual(["e2"]);
  });

  it("preserves optional user_id through the round-trip", async () => {
    const withUser = { ...event("e1", "2026-07-20T10:00:00Z"), user_id: "jake" };
    await appendEvent(db, withUser);
    const got = await readEvents(db, "hh-jake");
    expect(got[0].user_id).toBe("jake");
  });
});

describe("newEventId", () => {
  it("sorts in generation order even within the same millisecond", () => {
    // 500 synchronous calls guarantee same-ms collisions; the fold tiebreaks
    // same-ts events lexicographically on event_id, so id order must equal
    // call order or same-ms rebuilds diverge from write order.
    const ids = Array.from({ length: 500 }, () => newEventId());
    expect([...ids].sort()).toEqual(ids);
    expect(new Set(ids).size).toBe(500);
  });
});
