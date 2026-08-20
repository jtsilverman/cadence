// Ingredient preferences: structured {brand, size, note} keyed on the
// normalized ingredient name (spec list-first criterion 3). The PreferenceSet
// event is truth, prefs_view is a cache of the fold — same pattern as pantry.
// Structured (not free text) so future product/UPC joins are possible.

import type { Client, InStatement } from "@libsql/client";
import type { EventEnvelope, PreferenceSetPayload } from "./contracts";
import { PREFERENCE_SET } from "./contracts";
import { eventInsert, newEventId, readEvents } from "./events";

export interface PrefRow {
  name: string; // normalized: lowercased, trimmed
  brand: string | null;
  size: string | null;
  note: string | null;
  updated_at: string;
}

// Latest event per normalized name wins; all-null fields clear the row.
export function rebuildPrefs(events: EventEnvelope[]): PrefRow[] {
  const ordered = [...events].sort(
    (a, b) =>
      (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0) ||
      (a.event_id < b.event_id ? -1 : a.event_id > b.event_id ? 1 : 0)
  );
  const rows = new Map<string, PrefRow>();
  for (const event of ordered) {
    if (event.type !== PREFERENCE_SET) continue;
    const p = event.payload as PreferenceSetPayload;
    const name = p.name.trim().toLowerCase();
    if (p.brand === null && p.size === null && p.note === null) {
      rows.delete(name);
      continue;
    }
    rows.set(name, {
      name,
      brand: p.brand,
      size: p.size,
      note: p.note,
      updated_at: event.ts,
    });
  }
  return [...rows.values()].sort((a, b) => a.name.localeCompare(b.name));
}

const field = (v: unknown): string | null | undefined => {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return undefined; // invalid
  const t = v.trim();
  return t ? t : null;
};

// Gate for untrusted API bodies.
export function parsePreference(
  body: Record<string, unknown>
): { ok: true; pref: PreferenceSetPayload } | { ok: false; reason: string } {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return { ok: false, reason: "name required" };
  const brand = field(body.brand);
  const size = field(body.size);
  const note = field(body.note);
  if (brand === undefined || size === undefined || note === undefined) {
    return { ok: false, reason: "brand, size, note must be strings or null" };
  }
  return { ok: true, pref: { name, brand, size, note } };
}

// Append the event and replace the view with the fold of the full log, in one
// transaction — the same no-drift guarantee as the pantry writers.
export async function setPreference(
  db: Client,
  householdId: string,
  pref: PreferenceSetPayload
): Promise<void> {
  const event: EventEnvelope = {
    event_id: newEventId(),
    household_id: householdId,
    type: PREFERENCE_SET,
    ts: new Date().toISOString(),
    source: "web",
    payload: pref,
    schema_version: 1,
    precision: "exact",
  };
  const events = await readEvents(db, householdId, { type: PREFERENCE_SET });
  const rows = rebuildPrefs([...events, event]);
  await db.batch([eventInsert(event), ...viewReplace(householdId, rows)], "write");
}

const viewReplace = (householdId: string, rows: PrefRow[]): InStatement[] => [
  { sql: `DELETE FROM prefs_view WHERE household_id = ?`, args: [householdId] },
  ...rows.map(
    (r): InStatement => ({
      sql: `INSERT INTO prefs_view (household_id, name, brand, size, note, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
      args: [householdId, r.name, r.brand, r.size, r.note, r.updated_at],
    })
  ),
];

export async function readPrefsView(db: Client, householdId: string): Promise<PrefRow[]> {
  const result = await db.execute({
    sql: `SELECT name, brand, size, note, updated_at
      FROM prefs_view WHERE household_id = ? ORDER BY name`,
    args: [householdId],
  });
  return result.rows.map((row) => ({
    name: row.name as string,
    brand: row.brand as string | null,
    size: row.size as string | null,
    note: row.note as string | null,
    updated_at: row.updated_at as string,
  }));
}

export async function rebuildPrefsView(db: Client, householdId: string): Promise<void> {
  const events = await readEvents(db, householdId, { type: PREFERENCE_SET });
  await db.batch(viewReplace(householdId, rebuildPrefs(events)), "write");
}
