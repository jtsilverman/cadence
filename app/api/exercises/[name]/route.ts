import { NextResponse } from "next/server";
import { getDb, migrate } from "@/lib/db";
import { readEvents } from "@/lib/events";
import { exerciseHistory, normalizeExercise } from "@/lib/workouts";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

// Full history for one exercise (URL-encoded name, normalized like the fold).
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;
  const db = getDb();
  await migrate(db);
  const history = exerciseHistory(await readEvents(db, HOUSEHOLD_ID));
  const sessions = history.get(normalizeExercise(decodeURIComponent(name)));
  if (!sessions) {
    return NextResponse.json(
      { ok: false, reason: "no sets logged for that exercise" },
      { status: 404 }
    );
  }
  return NextResponse.json({ ok: true, sessions });
}
