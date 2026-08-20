// Client-side error ingest (charter Layer 4): route, viewport, and the
// breadcrumb trail — enough to find where it went wrong without replaying
// the user. Server-side errors are captured by instrumentation.onRequestError.

import { NextResponse } from "next/server";
import { getDb, migrate } from "@/lib/db";
import { readJsonObject } from "@/lib/http";
import { recordError } from "@/lib/observe";

export async function POST(request: Request): Promise<Response> {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const { message, stack, route, viewport, breadcrumbs } = read.body;
  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json({ ok: false, reason: "message required" }, { status: 422 });
  }
  const db = getDb();
  await migrate(db);
  await recordError(db, {
    side: "client",
    route: typeof route === "string" ? route : undefined,
    message,
    stack: typeof stack === "string" ? stack : undefined,
    context: {
      viewport: typeof viewport === "string" ? viewport : undefined,
      breadcrumbs: Array.isArray(breadcrumbs) ? breadcrumbs.slice(-20) : [],
    },
  });
  return NextResponse.json({ ok: true });
}
