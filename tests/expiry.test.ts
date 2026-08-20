import { createClient, type Client } from "@libsql/client";
import { beforeEach, describe, expect, it } from "vitest";
import type { EventEnvelope } from "@/lib/contracts";
import { migrate } from "@/lib/db";
import { expiringItems } from "@/lib/expiry";
import {
  assertPantry,
  parseAssertion,
  readPantryView,
  rebuildPantry,
  recordInflow,
} from "@/lib/pantry";

const HH = "hh-test";

let n = 0;
function ev(type: string, ts: string, payload: unknown, precision = "exact"): EventEnvelope {
  n += 1;
  return {
    event_id: `e${String(n).padStart(3, "0")}`,
    household_id: HH,
    type,
    ts,
    source: "web",
    payload,
    schema_version: 1,
    precision: precision as EventEnvelope["precision"],
  };
}

describe("parseAssertion expires", () => {
  it("accepts a calendar-valid expires", () => {
    const parsed = parseAssertion({ name: "milk", qty: 1, unit: "l", expires: "2026-08-01" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.assertion).toMatchObject({ name: "milk", expires: "2026-08-01" });
  });

  it("null and absent both mean no expiry; invalid strings 422", () => {
    const withNull = parseAssertion({ name: "milk", qty: 1, unit: "l", expires: null });
    expect(withNull.ok).toBe(true);
    if (withNull.ok) expect("expires" in withNull.assertion).toBe(false);
    expect(parseAssertion({ name: "milk", qty: 1, unit: "l", expires: "2026-13-99" }).ok).toBe(false);
    expect(parseAssertion({ name: "milk", qty: 1, unit: "l", expires: "soon" }).ok).toBe(false);
  });
});

describe("expiry through the fold", () => {
  it("assert sets it, re-assert without clears it (assertion is absolute)", () => {
    const withDate = rebuildPantry([
      ev("PantryAsserted", "2026-07-20T00:00:00Z", { name: "milk", qty: 1, unit: "l", expires: "2026-08-01" }),
    ]);
    expect(withDate[0].expires).toBe("2026-08-01");

    const cleared = rebuildPantry([
      ev("PantryAsserted", "2026-07-20T00:00:00Z", { name: "milk", qty: 1, unit: "l", expires: "2026-08-01" }),
      ev("PantryAsserted", "2026-07-21T00:00:00Z", { name: "milk", qty: 2, unit: "l" }),
    ]);
    expect(cleared[0].expires).toBeUndefined();
  });

  it("inflows and cooks preserve the standing expiry, including the degrade branch", () => {
    const base = ev("PantryAsserted", "2026-07-20T00:00:00Z", { name: "beef", qty: 1, unit: "lb", expires: "2026-07-30" });
    // convertible inflow: qty sums, expiry stands
    const summed = rebuildPantry([
      base,
      ev("PantryInflow", "2026-07-21T00:00:00Z", { items: [{ name: "beef", qty: 8, unit: "oz" }], via: "checkoff" }),
    ]);
    expect(summed[0]).toMatchObject({ qty: 1.5, unit: "lb", expires: "2026-07-30" });
    // degrade branch: cross-dimension inflow → present-unknown, expiry stands
    const degraded = rebuildPantry([
      base,
      ev("PantryInflow", "2026-07-21T00:00:00Z", { items: [{ name: "beef", qty: 2, unit: "cup" }], via: "checkoff" }),
    ]);
    expect(degraded[0]).toMatchObject({ qty: null, unit: null, expires: "2026-07-30" });
    // cook decrement preserves too
    const cooked = rebuildPantry([
      base,
      ev("RecipeCooked", "2026-07-22T00:00:00Z", { library_id: "x", title: "t", ingredients: [{ name: "beef", qty: 0.5, unit: "lb" }] }),
    ]);
    expect(cooked[0]).toMatchObject({ qty: 0.5, unit: "lb", expires: "2026-07-30" });
  });

  it("cook-to-zero deletes the item; a later inflow re-creates it WITHOUT expiry", () => {
    const items = rebuildPantry([
      ev("PantryAsserted", "2026-07-20T00:00:00Z", { name: "beef", qty: 1, unit: "lb", expires: "2026-07-30" }),
      ev("RecipeCooked", "2026-07-21T00:00:00Z", { library_id: "x", title: "t", ingredients: [{ name: "beef", qty: 1, unit: "lb" }] }),
      ev("PantryInflow", "2026-07-22T00:00:00Z", { items: [{ name: "beef", qty: 2, unit: "lb" }], via: "checkoff" }),
    ]);
    expect(items[0].qty).toBe(2);
    expect(items[0].expires).toBeUndefined();
  });
});

describe("view round-trip + rebuild invariant with expiry", () => {
  let db: Client;

  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });

  it("expires survives the view write/read and wipe-and-rebuild", async () => {
    const parsed = parseAssertion({ name: "milk", qty: 1, unit: "l", expires: "2026-08-01" });
    if (!parsed.ok) throw new Error(parsed.reason);
    await assertPantry(db, HH, parsed.assertion);
    await recordInflow(db, HH, [{ name: "eggs", qty: 12, unit: null }], "checkoff");

    const view = await readPantryView(db, HH);
    expect(view.find((i) => i.name === "milk")?.expires).toBe("2026-08-01");
    expect(view.find((i) => i.name === "eggs")?.expires).toBeUndefined();

    // wipe the cache, refold from the log alone → identical
    await db.execute({ sql: "DELETE FROM pantry_view WHERE household_id = ?", args: [HH] });
    const { rebuildPantryView } = await import("@/lib/pantry");
    await rebuildPantryView(db, HH);
    expect(await readPantryView(db, HH)).toEqual(view);
  });

  it("migrate() is idempotent with the expires column present", async () => {
    await migrate(db); // second run — the guarded ALTER must not throw
    await migrate(db);
  });
});

describe("expiringItems", () => {
  const item = (name: string, expires?: string) => ({
    name,
    qty: 1,
    unit: null,
    precision: "exact",
    asserted_at: "2026-07-20T00:00:00Z",
    ...(expires ? { expires } : {}),
  });

  it("window is today+7 inclusive, soonest first, expired flagged", () => {
    const items = [
      item("bread", "2026-07-25"), // already expired
      item("milk", "2026-08-02"), // boundary: today+7
      item("chicken", "2026-07-28"),
      item("rice"), // no expiry — absent
      item("yogurt", "2026-08-03"), // outside window
    ];
    const expiring = expiringItems(items, "2026-07-26");
    expect(expiring).toEqual([
      { name: "bread", expires: "2026-07-25", expired: true },
      { name: "chicken", expires: "2026-07-28" },
      { name: "milk", expires: "2026-08-02" },
    ]);
  });
});
