import { NextResponse } from "next/server";
import { getDb, migrate } from "@/lib/db";
import { readJsonObject } from "@/lib/http";
import { inventFood } from "@/lib/invent";
import { listFoods } from "@/lib/library";
import { readProfile } from "@/lib/profile";

const HOUSEHOLD_ID = "hh-jake";

// Review-only. The model proposes one recipe from the saved palette and the
// profile's hard restrictions; nothing is persisted until the normal recipe
// review form POSTs the edited plan to /api/recipes.
export async function POST(request: Request) {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const wish = read.body.wish;
  if (typeof wish !== "string") {
    return NextResponse.json({ ok: false, reason: "say what you feel like eating" }, { status: 422 });
  }

  const db = getDb();
  await migrate(db);
  const [foods, profile] = await Promise.all([
    listFoods(db, HOUSEHOLD_ID),
    readProfile(db, HOUSEHOLD_ID),
  ]);
  const result = await inventFood({
    wish,
    palette: foods.map((food) => food.title),
    restrictions: profile.hard_restrictions,
  });
  return NextResponse.json(result, { status: result.ok ? 200 : 422 });
}
