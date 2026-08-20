import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/http";
import { getDb, migrate } from "@/lib/db";
import { normalizeEmail, optionalText, recordQuestion } from "@/lib/waitlist";
import { track } from "@/lib/observe";

// The FAQ ask-box. Email is optional: an unanswered objection is signal even
// when the visitor never wants a reply.
export async function POST(request: Request) {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const question = optionalText(read.body.question);
  if (!question) {
    return NextResponse.json({ ok: false, reason: "question required" }, { status: 422 });
  }
  const db = getDb();
  await migrate(db);
  await recordQuestion(db, question, normalizeEmail(read.body.email));
  await track(db, { kind: "question_submitted", path: "/api/question", props: { with_email: normalizeEmail(read.body.email) !== null } });
  return NextResponse.json({ ok: true });
}
