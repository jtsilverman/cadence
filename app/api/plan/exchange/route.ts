import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/http";
import type { PlanDraftSuggestion, RecipePlan } from "@/lib/contracts";
import { getDb, migrate } from "@/lib/db";
import { readEvents } from "@/lib/events";
import { mealHistory } from "@/lib/history";
import { getPlans, listRecipes } from "@/lib/library";
import { orderCandidates, type MealCandidate } from "@/lib/planner";
import { proposedSnapshot, rebuildSchedule } from "@/lib/schedule";
import { logSuggestions } from "@/lib/suggestions";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

const isDraft = (p: { kind: string }): p is PlanDraftSuggestion => p.kind === "plan_draft";

// Meal exchange (spec planner-composer AC7): a substitution is a one-slot
// draft (scope:"slot") — the full current snapshot with exactly that slot's
// meal swapped to the next rotation candidate. The repair precedent: proposals
// about the locked week ride the pair; only the user's accept-POST applies.
export async function POST(request: Request) {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const slotId = read.body.slot_id;
  if (typeof slotId !== "string" || !slotId.trim()) {
    return NextResponse.json({ ok: false, reason: "slot_id required" }, { status: 422 });
  }
  const db = getDb();
  await migrate(db);
  const events = await readEvents(db, HOUSEHOLD_ID);
  const days = rebuildSchedule(events);

  const target = days.flatMap((d) => d.slots).find((s) => s.slot_id === slotId);
  if (!target) {
    return NextResponse.json({ ok: false, reason: "no such slot" }, { status: 404 });
  }
  if (target.lane !== "meal") {
    return NextResponse.json(
      { ok: false, reason: "only meal slots exchange — repair handles the rest" },
      { status: 422 }
    );
  }

  // next rotation candidate, excluding what's already in the slot
  const summaries = await listRecipes(db, HOUSEHOLD_ID);
  const plans = await getPlans(db, HOUSEHOLD_ID, summaries.map((r) => r.id));
  const caloriesById = new Map(
    plans
      .filter((r): r is { id: string; plan: RecipePlan } => r.plan.kind === "recipe")
      .map((r) => [r.id, r.plan.nutrition?.calories ?? null])
  );
  const lastCooked = new Map<string, string>();
  for (const entry of mealHistory(events)) {
    if (!lastCooked.has(entry.library_id)) lastCooked.set(entry.library_id, entry.date);
  }
  const meals: MealCandidate[] = summaries
    .filter((r) => r.id !== target.library_id)
    .map((r) => ({
      id: r.id,
      title: r.title,
      calories: caloriesById.get(r.id) ?? null,
      last_cooked: lastCooked.get(r.id) ?? null,
      created_at: r.created_at,
    }));
  const replacement = orderCandidates(meals, null)[0];
  if (!replacement) {
    return NextResponse.json(
      { ok: false, reason: "no other recipe in the cookbook to swap in" },
      { status: 422 }
    );
  }

  const proposed = proposedSnapshot(days).map((d) => ({
    date: d.date,
    slots: d.slots.map((s) =>
      s.slot_id === slotId
        ? { lane: "meal" as const, title: replacement.title, library_id: replacement.id }
        : s
    ),
  }));
  const reason = `swap "${target.title}" for "${replacement.title}" — next up in your rotation`;
  const [logged] = await logSuggestions(db, HOUSEHOLD_ID, [
    { kind: "plan_draft", scope: "slot", anchor: slotId, days: proposed, reason },
  ]);
  return NextResponse.json({
    ok: true,
    draft: { days: proposed, reason },
    suggestion_id: isDraft(logged) ? logged.suggestion_id : undefined,
  });
}
