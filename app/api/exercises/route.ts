import { NextResponse } from "next/server";
import { getDb, migrate } from "@/lib/db";
import { readEvents } from "@/lib/events";
import { bestSet, exerciseHistory } from "@/lib/workouts";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

// Exercise index: every lift you've ever logged, when last, and the best set.
export async function GET() {
  const db = getDb();
  await migrate(db);
  const history = exerciseHistory(await readEvents(db, HOUSEHOLD_ID));
  const exercises = [...history.entries()].map(([name, sessions]) => ({
    name,
    sessions: sessions.length,
    last_done: sessions[sessions.length - 1].date,
    best: bestSet(sessions, 1),
  }));
  return NextResponse.json({ ok: true, exercises });
}
