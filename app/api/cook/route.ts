import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/http";
import { getDb, migrate } from "@/lib/db";
import { recordCooked } from "@/lib/pantry";
import { track } from "@/lib/observe";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

// "I made this": one RecipeCooked event, pantry decremented through the fold.
export async function POST(request: Request) {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const body = read.body;
  if (typeof body.library_id !== "string" || !body.library_id) {
    return NextResponse.json(
      { ok: false, reason: "library_id required" },
      { status: 422 }
    );
  }
  const db = getDb();
  await migrate(db);
  let receipt: { event_id: string };
  try {
    receipt = await recordCooked(db, HOUSEHOLD_ID, body.library_id);
  } catch (err) {
    if (err instanceof Error && /not found|not a recipe/.test(err.message)) {
      return NextResponse.json({ ok: false, reason: err.message }, { status: 404 });
    }
    throw err;
  }
  await track(db, {
    kind: "action_result",
    path: "/api/cook",
    household_id: HOUSEHOLD_ID,
    props: { action: "meal_cooked", ok: true },
  });
  return NextResponse.json({ ok: true, event_id: receipt.event_id });
}
