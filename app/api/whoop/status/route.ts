import { NextResponse } from "next/server";
import { getDb, migrate } from "@/lib/db";
import { readTokens, whoopConfigured } from "@/lib/whoop";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

// The badge contract (spec criterion 1): connected = a token row exists.
export async function GET() {
  const configured = whoopConfigured();
  if (!configured) {
    return NextResponse.json({ ok: true, configured, connected: false });
  }
  const db = getDb();
  await migrate(db);
  const connected = (await readTokens(db, HOUSEHOLD_ID)) !== null;
  return NextResponse.json({ ok: true, configured, connected });
}
