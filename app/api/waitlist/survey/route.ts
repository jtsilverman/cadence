import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/http";
import { getDb, migrate } from "@/lib/db";
import { normalizeEmail, parseSurvey, recordSurvey } from "@/lib/waitlist";

// Post-signup only: the survey runs after the email is captured so friction
// never costs us the conversion it is meant to explain.
export async function POST(request: Request) {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const email = normalizeEmail(read.body.email);
  if (!email) {
    return NextResponse.json({ ok: false, reason: "valid email required" }, { status: 422 });
  }
  const db = getDb();
  await migrate(db);
  const attached = await recordSurvey(db, email, parseSurvey(read.body));
  if (!attached) {
    return NextResponse.json({ ok: false, reason: "not on the waitlist" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
