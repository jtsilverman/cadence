import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/http";
import { getDb, migrate } from "@/lib/db";
import { parseScheduleDays, planSchedule, scheduleView } from "@/lib/schedule";
import { track } from "@/lib/observe";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

// The resolved schedule: latest snapshot's days with done/skip status joined,
// plus the ease and repair suggestion pairs (surfacing IS the proposal).
export async function GET() {
  const db = getDb();
  await migrate(db);
  return NextResponse.json({ ok: true, days: await scheduleView(db, HOUSEHOLD_ID) });
}

// Replace the plan with a full snapshot (latest wins). New slots (no slot_id)
// get ids minted server-side; existing ids pass through so logs stay attached.
export async function POST(request: Request) {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const body = read.body;
  const parsed = parseScheduleDays(body.days);
  if (!parsed.ok) {
    return NextResponse.json(parsed, { status: 422 });
  }
  const db = getDb();
  await migrate(db);
  await planSchedule(db, HOUSEHOLD_ID, parsed.days);
  await track(db, {
    kind: "action_result",
    path: "/api/schedule",
    household_id: HOUSEHOLD_ID,
    props: { action: "plan_applied", ok: true, days: parsed.days.length },
  });
  return NextResponse.json({ ok: true, days: await scheduleView(db, HOUSEHOLD_ID) });
}
