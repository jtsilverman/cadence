import { createClient, type Client } from "@libsql/client";
import { beforeEach, describe, expect, it } from "vitest";
import { LOG_RETRACTED, RECIPE_COOKED } from "@/lib/contracts";
import { migrate } from "@/lib/db";
import { readEvents } from "@/lib/events";
import { correctManualFood } from "@/lib/food-correction";
import { recordLog } from "@/lib/logs";
import { saveFood } from "@/lib/library";
import { recordCooked } from "@/lib/pantry";

const HH = "hh-jake";
const NOW = new Date("2026-09-19T16:00:00.000Z");

describe("manual food correction", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });

  it("atomically retracts the old log and writes the corrected backfill", async () => {
    const original = await recordLog(db, HH, {
      kind: "food",
      title: "eggs",
      date: "2026-09-18",
    });

    const result = await correctManualFood(db, HH, {
      event_id: original.event_id,
      title: "two eggs and toast",
      date: "2026-09-17",
      quantity: 2,
      unit: "serving",
    }, NOW);

    expect(result.ok).toBe(true);
    const events = await readEvents(db, HH);
    expect(events.filter((event) => event.type === LOG_RETRACTED)).toMatchObject([
      { payload: { retracted_event_id: original.event_id } },
    ]);
    expect(events.filter((event) => event.type === RECIPE_COOKED)).toHaveLength(2);
    expect(events.find((event) => event.event_id === (result.ok ? result.event_id : ""))).toMatchObject({
      ts: "2026-09-17T23:30:00.000Z",
      payload: { title: "two eggs and toast", ingredients: [], corrected_from: original.event_id, quantity: 2, unit: "serving", manual_log: true },
      precision: "estimated",
    });
  });

  it("rejects repeated correction and non-manual cooked events", async () => {
    const original = await recordLog(db, HH, { kind: "food", title: "eggs", date: "2026-09-18" });
    expect((await correctManualFood(db, HH, {
      event_id: original.event_id,
      title: "eggs and toast",
      date: "2026-09-18",
    }, NOW)).ok).toBe(true);

    const repeated = await correctManualFood(db, HH, {
      event_id: original.event_id,
      title: "something else",
      date: "2026-09-18",
    }, NOW);
    expect(repeated).toMatchObject({ ok: false, status: 409 });
  });

  it("does not treat a normally eaten meal template as a manual text log", async () => {
    const { library_id } = await saveFood(db, HH, {
      plan_version: 1,
      kind: "meal",
      title: "Egg tacos",
      components: [],
      source_url: null,
    });
    const cooked = await recordCooked(db, HH, library_id);
    const result = await correctManualFood(db, HH, {
      event_id: cooked.event_id,
      title: "Something else",
      date: "2026-09-18",
    }, NOW);
    expect(result).toMatchObject({ ok: false, status: 422 });
  });

  it("allows only one replacement when two corrections race", async () => {
    const original = await recordLog(db, HH, { kind: "food", title: "eggs", date: "2026-09-18" });
    const results = await Promise.all([
      correctManualFood(db, HH, {
        event_id: original.event_id,
        title: "eggs and toast",
        date: "2026-09-18",
      }, NOW),
      correctManualFood(db, HH, {
        event_id: original.event_id,
        title: "three eggs",
        date: "2026-09-18",
      }, NOW),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect((await readEvents(db, HH, { type: LOG_RETRACTED }))).toHaveLength(1);
    expect((await readEvents(db, HH, { type: RECIPE_COOKED }))).toHaveLength(2);
    const rows = await db.execute("SELECT id FROM library WHERE household_id = 'hh-jake'");
    expect(rows.rows).toHaveLength(2);
  });
});
