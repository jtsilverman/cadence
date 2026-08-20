// Test-side DB access: the eval suite asserts DURABLE ROWS, never just the
// screen (the receipt rule). Opens the same SQLite file the eval server
// writes; reads only.

import path from "node:path";
import { createClient, type Client } from "@libsql/client";
import type { APIRequestContext } from "@playwright/test";

const DB_PATH = path.resolve(__dirname, "../.tmp/eval.db");

let client: Client | undefined;
export function evalDb(): Client {
  client ??= createClient({ url: `file:${DB_PATH}` });
  return client;
}

export interface EventRow {
  event_id: string;
  household_id: string;
  type: string;
  ts: string;
  source: string;
  payload: any;
  schema_version: number;
  precision: string;
}

export async function events(type?: string, sinceTs?: string): Promise<EventRow[]> {
  const db = evalDb();
  const where = ["household_id = 'hh-jake'"];
  const args: string[] = [];
  if (type) {
    where.push("type = ?");
    args.push(type);
  }
  if (sinceTs) {
    where.push("ts >= ?");
    args.push(sinceTs);
  }
  const result = await db.execute({
    sql: `SELECT * FROM events WHERE ${where.join(" AND ")} ORDER BY ts, event_id`,
    args,
  });
  return result.rows.map((row) => ({
    event_id: row.event_id as string,
    household_id: row.household_id as string,
    type: row.type as string,
    ts: row.ts as string,
    source: row.source as string,
    payload: JSON.parse(row.payload as string),
    schema_version: Number(row.schema_version),
    precision: row.precision as string,
  }));
}

export async function waitlistRow(email: string): Promise<Record<string, unknown> | null> {
  const result = await evalDb().execute({
    sql: `SELECT * FROM waitlist WHERE email = ?`,
    args: [email],
  });
  return result.rows.length ? { ...result.rows[0] } : null;
}

export async function waitlistCount(email: string): Promise<number> {
  const result = await evalDb().execute({
    sql: `SELECT COUNT(*) AS n FROM waitlist WHERE email = ?`,
    args: [email],
  });
  return Number(result.rows[0].n);
}

export async function questionRows(): Promise<Array<Record<string, unknown>>> {
  const result = await evalDb().execute(`SELECT * FROM questions ORDER BY created_at`);
  return result.rows.map((r) => ({ ...r }));
}

export async function pantryRow(name: string): Promise<Record<string, unknown> | null> {
  const result = await evalDb().execute({
    sql: `SELECT * FROM pantry_view WHERE household_id = 'hh-jake' AND name = ?`,
    args: [name],
  });
  return result.rows.length ? { ...result.rows[0] } : null;
}

// The pantry as the product computes it (the fold: assertions + inflow −
// cooking), via the real API — pantry_view rows alone don't carry cooking.
export async function pantryItems(
  request: APIRequestContext
): Promise<Array<{ name: string; qty: number | null; unit: string | null }>> {
  const res = await request.get("/api/pantry");
  const data = await res.json();
  return data.items ?? [];
}

// Reset the server's DB to a named fixture before a story.
export async function resetFixture(
  request: APIRequestContext,
  fixture: "fresh" | "week3" | "messy"
): Promise<void> {
  const res = await request.post("/api/dev/reset", { data: { fixture } });
  if (!res.ok()) {
    throw new Error(`fixture reset failed: ${res.status()} ${await res.text()}`);
  }
}
