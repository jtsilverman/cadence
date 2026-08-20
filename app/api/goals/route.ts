import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/http";
import { localDate } from "@/lib/dates";
import { getDb, migrate } from "@/lib/db";
import { readEvents } from "@/lib/events";
import { activeGoals, goalProgress, parseGoal, recordGoal } from "@/lib/goals";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

// Active goals, each with progress computed from the diary.
export async function GET() {
  const db = getDb();
  await migrate(db);
  const events = await readEvents(db, HOUSEHOLD_ID);
  const today = localDate(new Date());
  const goals = activeGoals(events).map((goal) => ({
    ...goal,
    progress: goalProgress(goal, events, today),
  }));
  return NextResponse.json({ ok: true, goals });
}

// Set (or revise, or clear — same goal_id) a goal. Latest event wins.
export async function POST(request: Request) {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const body = read.body;
  const parsed = parseGoal(body);
  if (!parsed.ok) {
    return NextResponse.json(parsed, { status: 422 });
  }
  const db = getDb();
  await migrate(db);
  const { goal_id } = await recordGoal(db, HOUSEHOLD_ID, parsed.goal);
  return NextResponse.json({ ok: true, goal_id });
}
