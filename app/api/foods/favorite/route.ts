import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/http";
import { getDb, migrate } from "@/lib/db";
import { listFoods, setFavorite } from "@/lib/library";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

// Toggle a favorite. The response carries the re-read library — the receipt.
// The caller renders the star from this, never optimistically, so a failed
// write can't leave the UI claiming a preference that was never stored.
export async function POST(request: Request) {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const { library_id: libraryId, favorite } = read.body;
  if (typeof libraryId !== "string" || libraryId.trim() === "") {
    return NextResponse.json({ ok: false, reason: "library_id required" }, { status: 400 });
  }
  if (typeof favorite !== "boolean") {
    return NextResponse.json({ ok: false, reason: "favorite must be true or false" }, { status: 400 });
  }

  const db = getDb();
  await migrate(db);
  // Favoriting a row that doesn't exist would write an event pointing at
  // nothing, which the fold would carry forever. Refuse instead.
  const foods = await listFoods(db, HOUSEHOLD_ID);
  if (!foods.some((food) => food.id === libraryId)) {
    return NextResponse.json({ ok: false, reason: "no such food" }, { status: 404 });
  }

  await setFavorite(db, HOUSEHOLD_ID, libraryId, favorite);
  return NextResponse.json({ ok: true, foods: await listFoods(db, HOUSEHOLD_ID) });
}
