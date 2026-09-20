import { NextResponse } from "next/server";
import { getDb, migrate } from "@/lib/db";
import { readJsonObject } from "@/lib/http";
import { track } from "@/lib/observe";
import { approveScheduleSuggestion } from "@/lib/plan-approval";
import { resolveSuggestion } from "@/lib/suggestions";

const HOUSEHOLD_ID = "hh-jake";

export async function POST(request: Request): Promise<Response> {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const { suggestion_id, outcome } = read.body;
  if (typeof suggestion_id !== "string" || !["accepted", "dismissed"].includes(outcome as string)) {
    return NextResponse.json({ ok: false, reason: "suggestion_id and outcome required" }, { status: 422 });
  }
  const db = getDb();
  await migrate(db);

  if (outcome === "dismissed") {
    const result = await resolveSuggestion(db, HOUSEHOLD_ID, { suggestion_id, outcome });
    return NextResponse.json(result, { status: result.ok ? 200 : 422 });
  }

  const result = await approveScheduleSuggestion(db, HOUSEHOLD_ID, suggestion_id);
  if (!result.ok) return NextResponse.json(result, { status: 422 });
  await track(db, {
    kind: "plan_applied",
    path: "/api/plan/resolve",
    household_id: HOUSEHOLD_ID,
    props: { suggestion_id },
  });
  return NextResponse.json({ ok: true, days: result.days });
}
