import { NextResponse } from "next/server";
import { getDb, migrate } from "@/lib/db";
import { correctManualFood } from "@/lib/food-correction";
import { readJsonObject } from "@/lib/http";

const HOUSEHOLD_ID = "hh-jake";

export async function POST(request: Request) {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const { event_id, title, date, quantity, unit } = read.body;
  if (typeof event_id !== "string" || typeof title !== "string" || typeof date !== "string") {
    return NextResponse.json(
      { ok: false, reason: "event_id, title, and date are required" },
      { status: 422 }
    );
  }

  const db = getDb();
  await migrate(db);
  const result = await correctManualFood(db, HOUSEHOLD_ID, {
    event_id,
    title,
    date,
    ...(quantity !== undefined ? { quantity: Number(quantity), unit: typeof unit === "string" ? unit : undefined } : {}),
  });
  return NextResponse.json(result, { status: result.ok ? 200 : result.status });
}
