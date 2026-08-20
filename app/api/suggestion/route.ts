import { NextResponse } from "next/server";
import { getDb, migrate } from "@/lib/db";
import { resolveSuggestion } from "@/lib/suggestions";
import { track } from "@/lib/observe";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

// Resolve one suggestion: accepted or dismissed. The response half of the
// suggestion/response pair — the override training data. The body carries
// only {suggestion_id, outcome}; kind and any denormalized fields derive from
// the open SuggestionMade server-side (spec suggestion-pair-v2).
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "bad request" }, { status: 400 });
  }
  const db = getDb();
  await migrate(db);
  const result = await resolveSuggestion(db, HOUSEHOLD_ID, body);
  if (!result.ok) {
    return NextResponse.json(result, { status: 422 });
  }
  const outcome = (body as Record<string, unknown> | null | undefined) ?? {};
  await track(db, {
    kind: "action_result",
    path: "/api/suggestion",
    household_id: HOUSEHOLD_ID,
    props: { action: "suggestion_resolve", ok: true, outcome: String((outcome as Record<string, unknown>).outcome ?? "") },
  });
  return NextResponse.json({ ok: true });
}
