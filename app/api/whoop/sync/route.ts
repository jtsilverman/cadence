import { NextResponse } from "next/server";
import { getDb, migrate } from "@/lib/db";
import { readTokens, whoopConfigured } from "@/lib/whoop";
import { syncWhoop } from "@/lib/whoop-ingest";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

// Manual pull of the recent window: post-connect backfill, and the whole
// ingest path in local dev where webhooks can't reach us. Idempotent — a
// second run skips everything unchanged.
export async function POST(request: Request) {
  if (!whoopConfigured()) {
    return NextResponse.json({ ok: false, reason: "whoop not configured" }, { status: 503 });
  }
  let days = 14;
  try {
    const body = await request.json();
    if (typeof body?.days === "number" && Number.isFinite(body.days)) {
      days = Math.min(366, Math.max(1, Math.floor(body.days)));
    }
  } catch {
    // empty body is fine — default window
  }
  const db = getDb();
  await migrate(db);
  if ((await readTokens(db, HOUSEHOLD_ID)) === null) {
    return NextResponse.json({ ok: false, reason: "whoop not connected" }, { status: 409 });
  }
  try {
    const result = await syncWhoop(db, HOUSEHOLD_ID, days);
    return NextResponse.json({ ok: true, days, ...result });
  } catch (error) {
    console.error("whoop sync failed:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
