// Onboarding seeding endpoint: freetext → structured favorite meals in the
// library (the material week 1 drafts from). Receipts: the saved rows come
// back so the UI renders cards only for what was durably written.

import { NextResponse } from "next/server";
import { getDb, migrate } from "@/lib/db";
import { readJsonObject } from "@/lib/http";
import { seedLibrary } from "@/lib/onboard";
import { track } from "@/lib/observe";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

export async function POST(request: Request): Promise<Response> {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const text = read.body.text;
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ ok: false, reason: "text required" }, { status: 422 });
  }
  const db = getDb();
  await migrate(db);
  const meals = await seedLibrary(db, HOUSEHOLD_ID, text.trim());
  await track(db, {
    kind: "onboarding_step",
    path: "/api/onboard/seed",
    household_id: HOUSEHOLD_ID,
    props: { step: "seeded", meals: meals.length },
  });
  return NextResponse.json({ ok: true, meals });
}
