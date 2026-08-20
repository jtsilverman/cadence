import { NextResponse } from "next/server";
import { localDate } from "@/lib/dates";
import { getDb, migrate } from "@/lib/db";
import { readEvents } from "@/lib/events";
import { activeGoals, proposeWorkoutWeek } from "@/lib/goals";
import { listWorkouts } from "@/lib/library";
import { activeProgram } from "@/lib/program";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

// Next week's workout slots, composed from the cadence goal + template
// rotation. Proposal data only: the client applies it by POSTing
// /api/schedule — the one and only plan writer.
export async function GET() {
  const db = getDb();
  await migrate(db);
  const events = await readEvents(db, HOUSEHOLD_ID);
  const proposal = proposeWorkoutWeek(
    activeGoals(events),
    await listWorkouts(db, HOUSEHOLD_ID),
    events,
    localDate(new Date()),
    activeProgram(events)
  );
  return NextResponse.json({ ok: true, ...proposal });
}
