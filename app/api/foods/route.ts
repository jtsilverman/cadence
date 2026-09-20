import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/http";
import { getDb, migrate } from "@/lib/db";
import { isFoodKind, parseFoodPlan } from "@/lib/food";
import { listFoods, saveFood, setFavorite } from "@/lib/library";
import type { FoodKind } from "@/lib/contracts";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

// Browse the food library. ?kind=product&kind=snack narrows it; an unknown
// kind is a 400 rather than a silent empty list, because a typo that returns
// "nothing saved" reads exactly like real data loss.
export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.getAll("kind");
  const unknown = requested.filter((kind) => !isFoodKind(kind));
  if (unknown.length > 0) {
    return NextResponse.json(
      { ok: false, reason: `unknown food kind "${unknown[0]}"` },
      { status: 400 }
    );
  }
  const db = getDb();
  await migrate(db);
  const foods = await listFoods(
    db,
    HOUSEHOLD_ID,
    requested.length > 0 ? (requested as FoodKind[]) : undefined
  );
  return NextResponse.json({ ok: true, foods });
}

// Save a reviewed non-recipe food. The body goes through the same gate as a
// model proposal — a hand-edited form is untrusted input too.
export async function POST(request: Request) {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const validated = parseFoodPlan(read.body);
  if (!validated.ok) {
    return NextResponse.json(validated, { status: 422 });
  }
  const db = getDb();
  await migrate(db);
  const { library_id } = await saveFood(db, HOUSEHOLD_ID, validated.plan);
  return NextResponse.json({ ok: true, library_id, kind: validated.plan.kind });
}

export async function PATCH(request: Request) {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const { library_id, favorite } = read.body;
  if (typeof library_id !== "string" || typeof favorite !== "boolean") {
    return NextResponse.json(
      { ok: false, reason: "library_id and favorite are required" },
      { status: 422 }
    );
  }
  const db = getDb();
  await migrate(db);
  if (!(await setFavorite(db, HOUSEHOLD_ID, library_id, favorite))) {
    return NextResponse.json({ ok: false, reason: "food not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, library_id, favorite });
}
