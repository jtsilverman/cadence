import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/http";
import { getDb, migrate } from "@/lib/db";
import { parsePreference, readPrefsView, setPreference } from "@/lib/prefs";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

export async function GET() {
  const db = getDb();
  await migrate(db);
  const prefs = await readPrefsView(db, HOUSEHOLD_ID);
  return NextResponse.json({ ok: true, prefs });
}

// Set (or clear, via all-null fields) one ingredient preference.
export async function POST(request: Request) {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const body = read.body;
  const parsed = parsePreference(body);
  if (!parsed.ok) {
    return NextResponse.json(parsed, { status: 422 });
  }
  const db = getDb();
  await migrate(db);
  await setPreference(db, HOUSEHOLD_ID, parsed.pref);
  const prefs = await readPrefsView(db, HOUSEHOLD_ID);
  return NextResponse.json({ ok: true, prefs });
}
