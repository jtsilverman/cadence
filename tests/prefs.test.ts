import { describe, it, expect, beforeEach } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { migrate } from "@/lib/db";
import { readEvents } from "@/lib/events";
import {
  parsePreference,
  readPrefsView,
  rebuildPrefs,
  rebuildPrefsView,
  setPreference,
} from "@/lib/prefs";
import { PREFERENCE_SET, type EventEnvelope, type PreferenceSetPayload } from "@/lib/contracts";

const HH = "hh-jake";

function prefEvent(
  id: string,
  ts: string,
  payload: PreferenceSetPayload
): EventEnvelope<PreferenceSetPayload> {
  return {
    event_id: id,
    household_id: HH,
    type: PREFERENCE_SET,
    ts,
    source: "web",
    payload,
    schema_version: 1,
    precision: "exact",
  };
}

describe("rebuildPrefs (fold: latest per name wins)", () => {
  it("keeps the latest preference per normalized name", () => {
    const rows = rebuildPrefs([
      prefEvent("e1", "2026-07-20T10:00:00Z", {
        name: "Ground Beef",
        brand: "generic",
        size: null,
        note: null,
      }),
      prefEvent("e2", "2026-07-21T10:00:00Z", {
        name: "ground beef",
        brand: "90/10 Angus",
        size: "1 lb tray",
        note: null,
      }),
    ]);
    expect(rows).toEqual([
      {
        name: "ground beef",
        brand: "90/10 Angus",
        size: "1 lb tray",
        note: null,
        updated_at: "2026-07-21T10:00:00Z",
      },
    ]);
  });

  it("an all-null preference clears the row", () => {
    const rows = rebuildPrefs([
      prefEvent("e1", "2026-07-20T10:00:00Z", {
        name: "milk",
        brand: "Fairlife",
        size: null,
        note: null,
      }),
      prefEvent("e2", "2026-07-21T10:00:00Z", {
        name: "milk",
        brand: null,
        size: null,
        note: null,
      }),
    ]);
    expect(rows).toEqual([]);
  });

  it("ignores non-preference events and returns empty for an empty log", () => {
    expect(rebuildPrefs([])).toEqual([]);
  });
});

describe("parsePreference (untrusted body gate)", () => {
  it("accepts a valid body, trims fields, blanks become null", () => {
    expect(
      parsePreference({ name: " Ground Beef ", brand: " 90/10 Angus ", size: "", note: null })
    ).toEqual({
      ok: true,
      pref: { name: "Ground Beef", brand: "90/10 Angus", size: null, note: null },
    });
  });

  it("rejects a missing name and non-string fields", () => {
    expect(parsePreference({ brand: "x" }).ok).toBe(false);
    expect(parsePreference({ name: " " }).ok).toBe(false);
    expect(parsePreference({ name: "eggs", brand: 3 }).ok).toBe(false);
  });
});

describe("setPreference (event + view, one transaction)", () => {
  let db: Client;
  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });

  it("writes one PreferenceSet event and the matching prefs_view row", async () => {
    await setPreference(db, HH, {
      name: "Ground Beef",
      brand: "90/10 Angus",
      size: "1 lb tray",
      note: null,
    });

    const events = await readEvents(db, HH, { type: PREFERENCE_SET });
    expect(events).toHaveLength(1);
    expect(events[0].payload as PreferenceSetPayload).toEqual({
      name: "Ground Beef",
      brand: "90/10 Angus",
      size: "1 lb tray",
      note: null,
    });

    const view = await readPrefsView(db, HH);
    expect(view).toEqual([
      {
        name: "ground beef",
        brand: "90/10 Angus",
        size: "1 lb tray",
        note: null,
        updated_at: events[0].ts,
      },
    ]);
  });

  it("re-setting the same name overwrites the view row, not duplicates", async () => {
    await setPreference(db, HH, { name: "milk", brand: "Fairlife", size: null, note: null });
    await setPreference(db, HH, { name: " Milk ", brand: "Organic Valley", size: null, note: null });
    const view = await readPrefsView(db, HH);
    expect(view).toHaveLength(1);
    expect(view[0].brand).toBe("Organic Valley");
    expect(await readEvents(db, HH, { type: PREFERENCE_SET })).toHaveLength(2);
  });

  it("rebuild invariant: wipe prefs_view, refold from the log → identical", async () => {
    await setPreference(db, HH, { name: "eggs", brand: "Vital Farms", size: "dozen", note: null });
    await setPreference(db, HH, { name: "milk", brand: "Fairlife", size: null, note: "2%" });
    await setPreference(db, HH, { name: "milk", brand: null, size: null, note: null });
    const before = await readPrefsView(db, HH);
    expect(before.map((r) => r.name)).toEqual(["eggs"]);

    await db.execute("DELETE FROM prefs_view");
    expect(await readPrefsView(db, HH)).toEqual([]);

    await rebuildPrefsView(db, HH);
    expect(await readPrefsView(db, HH)).toEqual(before);
  });
});
