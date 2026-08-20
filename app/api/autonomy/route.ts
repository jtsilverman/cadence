import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/http";
import { getDb, migrate } from "@/lib/db";
import { AUTONOMY_RUNG_SET } from "@/lib/contracts";
import { readEvents } from "@/lib/events";
import { autonomyState, parseRungSet, recordRung } from "@/lib/autonomy";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

// Per-action-type rung + the accept/dismiss evidence beside it.
export async function GET() {
  const db = getDb();
  await migrate(db);
  const events = await readEvents(db, HOUSEHOLD_ID, { type: AUTONOMY_RUNG_SET });
  return NextResponse.json({
    ok: true,
    autonomy: await autonomyState(db, HOUSEHOLD_ID, events),
  });
}

// Climb (or descend) one kind's rung. The user's explicit choice, latest wins.
export async function POST(request: Request) {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const parsed = parseRungSet(read.body);
  if (!parsed.ok) {
    return NextResponse.json(parsed, { status: 422 });
  }
  const db = getDb();
  await migrate(db);
  await recordRung(db, HOUSEHOLD_ID, parsed.payload);
  return NextResponse.json({ ok: true });
}
