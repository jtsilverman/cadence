import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/http";
import { getDb, migrate } from "@/lib/db";
import type { Client } from "@libsql/client";
import type { RecipePlan } from "@/lib/contracts";
import { LOG_RETRACTED, RECIPE_COOKED } from "@/lib/contracts";
import { weeklyUse } from "@/lib/consumption";
import { localDate } from "@/lib/dates";
import { readEvents } from "@/lib/events";
import { expiringItems, useSoonSuggestions } from "@/lib/expiry";
import { cooksLeft } from "@/lib/fullness";
import { getPlans, listRecipes } from "@/lib/library";
import { assertPantry, parseAssertion, readPantryView } from "@/lib/pantry";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

// View rows enriched with everything the pantry knows how to say about an
// item: cooks_left (fullness), weekly_use (consumption rate), expires.
// Plus the expiring window and its use-soon recipe connections.
async function pantryPayload(db: Client) {
  const items = await readPantryView(db, HOUSEHOLD_ID);
  // both consumers only need cook events — never pull the whole diary here
  // retractions ride along: dropRetracted needs the LogRetracted rows in the
  // same array, and a SQL type-filter would strip them (reviewer-caught gap)
  const cooks = [
    ...(await readEvents(db, HOUSEHOLD_ID, { type: RECIPE_COOKED })),
    ...(await readEvents(db, HOUSEHOLD_ID, { type: LOG_RETRACTED })),
  ];
  const left = cooksLeft(items, cooks);
  const rates = weeklyUse(cooks);
  const enriched = items.map((item) => ({
    ...item,
    ...(left[item.name] !== undefined ? { cooks_left: left[item.name] } : {}),
    ...(rates.get(item.name) ? { weekly_use: rates.get(item.name) } : {}),
  }));
  const expiring = expiringItems(items, localDate(new Date()));
  let use_soon: ReturnType<typeof useSoonSuggestions> = [];
  if (expiring.length > 0) {
    const summaries = await listRecipes(db, HOUSEHOLD_ID);
    const rows = await getPlans(db, HOUSEHOLD_ID, summaries.map((r) => r.id));
    use_soon = useSoonSuggestions(
      expiring,
      rows.filter((r): r is { id: string; plan: RecipePlan } => r.plan.kind === "recipe")
    );
  }
  return { items: enriched, expiring, use_soon };
}

export async function GET() {
  const db = getDb();
  await migrate(db);
  return NextResponse.json({ ok: true, ...(await pantryPayload(db)) });
}

// One endpoint for every pantry mutation: add, edit, remove are all a
// PantryAsserted assertion (removed: true marks removal).
export async function POST(request: Request) {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const body = read.body;
  const parsed = parseAssertion(body);
  if (!parsed.ok) {
    return NextResponse.json(parsed, { status: 422 });
  }
  const db = getDb();
  await migrate(db);
  await assertPantry(db, HOUSEHOLD_ID, parsed.assertion);
  return NextResponse.json({ ok: true, ...(await pantryPayload(db)) });
}
