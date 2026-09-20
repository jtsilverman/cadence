import type { Client } from "@libsql/client";

export const PROFILE_KEYS = [
  "onboarding_step",
  "direction",
  "activity",
  "seed_text",
  "seeded_meals",
  "sex",
  "weight",
  "height",
  "age",
  "units",
  "hard_restrictions",
  "calorie_proposal",
] as const;

export type ProfileKey = (typeof PROFILE_KEYS)[number];
export type ProfileValues = Partial<Record<ProfileKey, string>>;

const keySet = new Set<string>(PROFILE_KEYS);

export function parseProfileValues(value: unknown):
  | { ok: true; values: ProfileValues }
  | { ok: false; reason: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reason: "values must be an object" };
  }
  const values: ProfileValues = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!keySet.has(key)) return { ok: false, reason: `unknown profile key: ${key}` };
    if (typeof raw !== "string") return { ok: false, reason: `${key} must be a string` };
    if (raw.length > 10_000) return { ok: false, reason: `${key} is too long` };
    values[key as ProfileKey] = raw;
  }
  return { ok: true, values };
}

export async function readProfile(db: Client, householdId: string): Promise<ProfileValues> {
  const result = await db.execute({
    sql: "SELECT key, value FROM profile WHERE household_id = ?",
    args: [householdId],
  });
  const values: ProfileValues = {};
  for (const row of result.rows) {
    const key = String(row.key);
    if (keySet.has(key)) values[key as ProfileKey] = String(row.value);
  }
  return values;
}

export async function setProfileValues(
  db: Client,
  householdId: string,
  values: ProfileValues,
): Promise<void> {
  const now = new Date().toISOString();
  const statements = Object.entries(values).map(([key, value]) => ({
    sql: `INSERT INTO profile (household_id, key, value, updated_at)
          VALUES (?, ?, ?, ?)
          ON CONFLICT (household_id, key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    args: [householdId, key, value, now],
  }));
  if (statements.length > 0) await db.batch(statements, "write");
}
