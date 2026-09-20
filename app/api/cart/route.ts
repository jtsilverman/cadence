import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/http";
import type { RecipePlan } from "@/lib/contracts";
import { getDb, migrate } from "@/lib/db";
import {
  acceptedListAdditions,
  aggregateIngredients,
  diffAgainstPantry,
  mergeCartLines,
} from "@/lib/cart";
import { readEvents } from "@/lib/events";
import { getPlans, listRecipes } from "@/lib/library";
import { readPantryView } from "@/lib/pantry";
import { expiringItems, useSoonSuggestions } from "@/lib/expiry";
import { suggestAdditions } from "@/lib/replenish";
import { logSuggestions } from "@/lib/suggestions";
import { localDate } from "@/lib/dates";
import { currentWeekMealIds, rebuildSchedule } from "@/lib/schedule";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

// Compute the shopping list from the standing plan: the current week's
// still-planned meal slots (spec schedule-spine criterion 5). Transitional:
// an explicit library_ids body still works while the picker UI exists.
// Pure computation — nothing persists until an execute mode records an event.
export async function POST(request: Request) {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const body = read.body;
  const db = getDb();
  await migrate(db);
  const events = await readEvents(db, HOUSEHOLD_ID);
  const manualLines = acceptedListAdditions(events);

  let ids: string[];
  if (body.library_ids !== undefined) {
    const raw = body.library_ids;
    if (!Array.isArray(raw) || raw.length === 0 || !raw.every((id) => typeof id === "string")) {
      return NextResponse.json(
        { ok: false, reason: "library_ids must be a non-empty string array" },
        { status: 422 }
      );
    }
    ids = raw as string[];
  } else {
    const schedule = rebuildSchedule(events);
    const today = localDate(new Date());
    ids = currentWeekMealIds(schedule, today);
    if (ids.length === 0 && manualLines.length === 0) {
      const anyMealsThisWeek =
        currentWeekMealIds(
          schedule.map((d) => ({
            ...d,
            slots: d.slots.map((s) => ({ ...s, status: "planned" as const })),
          })),
          today
        ).length > 0;
      return NextResponse.json(
        {
          ok: false,
          reason: anyMealsThisWeek
            ? "this week's meals are already cooked or skipped — nothing left to buy for"
            : "no meals planned this week — add meal slots to the schedule",
        },
        { status: 404 }
      );
    }
  }

  const rows = ids.length > 0 ? await getPlans(db, HOUSEHOLD_ID, [...new Set(ids)]) : [];
  if (rows.length === 0 && manualLines.length === 0) {
    return NextResponse.json(
      { ok: false, reason: "no recipes found for those ids" },
      { status: 404 }
    );
  }
  // Same recipe slotted twice cooks twice — expand unique rows back to one
  // plan per occurrence so quantities aggregate per cook. Non-recipe rows
  // (a workout id in the body) are skipped: they have no ingredients.
  const byId = new Map(rows.map((r) => [r.id, r.plan]));
  const plans = ids
    .map((id) => byId.get(id))
    .filter((p): p is RecipePlan => p !== undefined && p.kind === "recipe");

  const pantry = await readPantryView(db, HOUSEHOLD_ID);
  const lines = mergeCartLines([...aggregateIngredients(plans), ...manualLines]);
  const { toBuy, stocked } = diffAgainstPantry(lines, pantry);
  // expiring items and the COOKBOOK recipes that would use them (not just
  // this week's plans) — in-context data only
  const expiring = expiringItems(pantry, localDate(new Date()));
  let use_soon: ReturnType<typeof useSoonSuggestions> = [];
  if (expiring.length > 0) {
    const cookbook = await listRecipes(db, HOUSEHOLD_ID);
    const cookbookRows = await getPlans(db, HOUSEHOLD_ID, cookbook.map((r) => r.id));
    use_soon = useSoonSuggestions(
      expiring,
      cookbookRows.filter((r): r is { id: string; plan: RecipePlan } => r.plan.kind === "recipe")
    );
  }
  const suggestions = await logSuggestions(
    db,
    HOUSEHOLD_ID,
    suggestAdditions({
      pantry,
      plans,
      toBuy,
      events,
    }).map((s) => ({ kind: "add_to_list" as const, ...s }))
  );
  // Which execute modes the UI may offer; instacart only when the key exists
  // (spec list-first criterion 1 — the 503 path is unreachable from the UI).
  const rails = ["instore", ...(process.env.INSTACART_API_KEY ? ["instacart"] : [])];
  return NextResponse.json({ ok: true, toBuy, stocked, suggestions, use_soon, rails });
}

