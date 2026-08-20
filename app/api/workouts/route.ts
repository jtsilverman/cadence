import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/http";
import { getDb, migrate } from "@/lib/db";
import { listWorkouts, saveWorkout } from "@/lib/library";
import { parseWorkoutPlan } from "@/lib/workouts";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

export async function GET() {
  const db = getDb();
  await migrate(db);
  const workouts = await listWorkouts(db, HOUSEHOLD_ID);
  return NextResponse.json({ ok: true, workouts });
}

// Create a structured workout template — manual entry or an extracted video
// plan (spec workout-video-extraction); parseWorkoutPlan gates both.
export async function POST(request: Request) {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const body = read.body;
  const parsed = parseWorkoutPlan(body);
  if (!parsed.ok) {
    return NextResponse.json(parsed, { status: 422 });
  }
  const db = getDb();
  await migrate(db);
  const { library_id } = await saveWorkout(db, HOUSEHOLD_ID, parsed.plan);
  return NextResponse.json({ ok: true, library_id });
}
