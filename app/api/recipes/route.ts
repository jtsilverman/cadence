import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/http";
import { getDb, migrate } from "@/lib/db";
import { parseExtraction } from "@/lib/extract";
import { listRecipes, saveRecipe } from "@/lib/library";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

export async function GET() {
  const db = getDb();
  await migrate(db);
  const recipes = await listRecipes(db, HOUSEHOLD_ID);
  return NextResponse.json({ ok: true, recipes });
}

// Save a reviewed recipe. Body: the editable plan fields + source_url.
// Server re-validates through the same gate as model output — UI edits are
// untrusted input too.
export async function POST(request: Request) {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const body = read.body;
  const { source_url, ...fields } = body;
  if (typeof source_url !== "string") {
    return NextResponse.json(
      { ok: false, reason: "source_url required" },
      { status: 400 }
    );
  }
  const validated = parseExtraction(JSON.stringify(fields), source_url);
  if (!validated.ok) {
    return NextResponse.json(validated, { status: 422 });
  }
  if (validated.plan.kind !== "recipe") {
    return NextResponse.json(
      { ok: false, reason: "that's a workout — save it via /api/workouts" },
      { status: 422 }
    );
  }
  const db = getDb();
  await migrate(db);
  const { library_id } = await saveRecipe(db, HOUSEHOLD_ID, validated.plan);
  return NextResponse.json({ ok: true, library_id });
}
