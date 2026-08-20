// First-party analytics ingest (charter Layer 4). Client-side view/step
// events land here; action events are tracked server-side in the routes that
// own them. No PII: the gate drops anything email-shaped in props.

import { NextResponse } from "next/server";
import { getDb, migrate } from "@/lib/db";
import { readJsonObject } from "@/lib/http";
import { track } from "@/lib/observe";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

const KINDS = new Set([
  "page_view",
  "cta_click",
  "waitlist_submit_view", // client-side funnel step; the durable submit is tracked server-side
  "screen_view",
  "onboarding_step",
  "action_result",
]);

const EMAILISH = /@[^\s@]+\.[^\s@]/;

export async function POST(request: Request): Promise<Response> {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const { kind, path, props, surface } = read.body;
  if (typeof kind !== "string" || !KINDS.has(kind)) {
    return NextResponse.json({ ok: false, reason: "unknown analytics kind" }, { status: 422 });
  }
  const cleanProps: Record<string, unknown> = {};
  if (typeof props === "object" && props !== null && !Array.isArray(props)) {
    for (const [key, value] of Object.entries(props as Record<string, unknown>)) {
      if (typeof value === "string" && EMAILISH.test(value)) continue; // no PII
      if (["string", "number", "boolean"].includes(typeof value)) cleanProps[key] = value;
    }
  }
  const db = getDb();
  await migrate(db);
  await track(db, {
    kind,
    path: typeof path === "string" ? path : undefined,
    household_id: surface === "app" ? HOUSEHOLD_ID : undefined,
    props: cleanProps,
  });
  return NextResponse.json({ ok: true });
}
