import { NextResponse } from "next/server";
import { getDb, migrate } from "@/lib/db";
import { verifyWhoopSignature } from "@/lib/whoop";
import { handleWhoopWebhook } from "@/lib/whoop-ingest";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

// Whoop webhooks are notification-only: verify the HMAC signature, then do
// the authenticated follow-up GET + ingest in-request (no background jobs on
// this deploy surface). Unknown/deleted types 200 no-op so whoop never
// retries what we don't want; real failures 500 so whoop DOES retry (5x/1hr).
export async function POST(request: Request) {
  const secret = process.env.WHOOP_CLIENT_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, reason: "whoop not configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-whoop-signature") ?? "";
  const timestamp = request.headers.get("x-whoop-signature-timestamp") ?? "";
  if (!verifyWhoopSignature(secret, timestamp, rawBody, signature)) {
    return NextResponse.json({ ok: false, reason: "bad signature" }, { status: 401 });
  }

  let payload: { id?: number | string; type?: string };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ ok: false, reason: "bad request" }, { status: 400 });
  }
  if (payload.id == null || typeof payload.type !== "string") {
    return NextResponse.json({ ok: false, reason: "missing id or type" }, { status: 400 });
  }

  try {
    const db = getDb();
    await migrate(db);
    const result = await handleWhoopWebhook(db, HOUSEHOLD_ID, {
      id: payload.id,
      type: payload.type,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("whoop webhook ingest failed:", error);
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
  }
}
