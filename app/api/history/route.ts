import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getDb, migrate } from "@/lib/db";
import { readEvents } from "@/lib/events";
import { journalHistory, mealHistory, sleepHistory, workoutHistory } from "@/lib/history";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

const READERS = {
  meals: mealHistory,
  workouts: workoutHistory,
  journal: journalHistory,
  sleep: sleepHistory,
} as const;

// The diary per lane, newest first: ?kind=meals|workouts|journal|sleep&limit=N
export async function GET(request: NextRequest) {
  const kind = request.nextUrl.searchParams.get("kind") ?? "";
  // own-property check: "constructor" etc. must not walk the prototype chain
  const reader = Object.prototype.hasOwnProperty.call(READERS, kind)
    ? READERS[kind as keyof typeof READERS]
    : undefined;
  if (!reader) {
    return NextResponse.json(
      { ok: false, reason: "kind must be meals | workouts | journal | sleep" },
      { status: 422 }
    );
  }
  const rawLimit = Number(request.nextUrl.searchParams.get("limit") ?? 50);
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 50;
  const db = getDb();
  await migrate(db);
  const entries = reader(await readEvents(db, HOUSEHOLD_ID)).slice(0, limit);
  return NextResponse.json({ ok: true, kind, entries });
}
