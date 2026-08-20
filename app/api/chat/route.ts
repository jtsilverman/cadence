// The coach's endpoint (ux.md: chat is the primary surface). The engine
// classifies + extracts with the model, executes deterministically, and the
// reply carries server-authored receipts for everything actually written.

import { NextResponse } from "next/server";
import { getDb, migrate } from "@/lib/db";
import { readJsonObject } from "@/lib/http";
import { parseChatBody, runChat } from "@/lib/chat";
import { track } from "@/lib/observe";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

export async function POST(request: Request): Promise<Response> {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const parsed = parseChatBody(read.body, process.env.EVAL_MODE === "1");
  const db = getDb();
  await migrate(db);
  if (!parsed.ok) {
    if (parsed.oversized) {
      // graceful, never a 500, never a write — but still a visible chat turn
      await track(db, {
        kind: "chat_turn",
        path: "/api/chat",
        household_id: HOUSEHOLD_ID,
        props: { intent: "oversized", action: "none", ok: false, latency_ms: 0 },
      });
      return NextResponse.json({ ok: true, reply: parsed.reason, intent: "out_of_scope", receipts: [], proposal: null, event_ids: [] });
    }
    return NextResponse.json({ ok: false, reason: parsed.reason }, { status: 422 });
  }
  const { context_block, ...outcome } = await runChat(db, HOUSEHOLD_ID, parsed.req);
  // the model's context is the eval judge's ground truth; never shipped to real clients
  return NextResponse.json({
    ok: true,
    ...outcome,
    ...(process.env.EVAL_MODE === "1" ? { context_block } : {}),
  });
}
