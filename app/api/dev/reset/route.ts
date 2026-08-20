// Eval-only fixture reset (evals/charter.md harness): wipe + reseed the DB to
// a named fixture so every Playwright story starts from known state without a
// server restart. Hard-gated: without EVAL_MODE=1 in the server's environment
// this route does not exist (404), so it can never ship live.

import { NextResponse } from "next/server";
import { getDb, migrate } from "@/lib/db";
import { readJsonObject } from "@/lib/http";
import { FIXTURES, seedFixture, type FixtureName } from "@/evals/fixtures/seed";

export async function POST(request: Request): Promise<Response> {
  if (process.env.EVAL_MODE !== "1") {
    return new NextResponse(null, { status: 404 });
  }
  const parsed = await readJsonObject(request);
  if (!parsed.ok) return parsed.response;
  const fixture = parsed.body.fixture;
  if (typeof fixture !== "string" || !FIXTURES.includes(fixture as FixtureName)) {
    return NextResponse.json(
      { error: `fixture must be one of: ${FIXTURES.join(", ")}` },
      { status: 422 }
    );
  }
  const db = getDb();
  await migrate(db);
  await seedFixture(db, fixture as FixtureName);
  return NextResponse.json({ ok: true, fixture });
}
