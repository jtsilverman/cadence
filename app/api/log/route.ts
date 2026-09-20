import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/http";
import { getDb, migrate } from "@/lib/db";
import { parseLog, recordLog } from "@/lib/logs";
import { scheduleView } from "@/lib/schedule";
import { track } from "@/lib/observe";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

// One-tap log: {kind: session | sleep | journal | skip, ...fields}. The
// response returns the re-resolved schedule — the receipt (UX.md:71): the
// caller renders "done" from this, never optimistically. A workout skip's
// receipt carries the repair menu (repairs the moment the event lands).
export async function POST(request: Request) {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const body = read.body;
  const parsed = parseLog(body);
  if (!parsed.ok) {
    return NextResponse.json(parsed, { status: 422 });
  }
  const db = getDb();
  await migrate(db);
  const result = await recordLog(db, HOUSEHOLD_ID, parsed.log);
  await track(db, {
    kind: "action_result",
    path: "/api/log",
    household_id: HOUSEHOLD_ID,
    props: { action: `log_${parsed.log.kind}`, ok: true },
  });
  return NextResponse.json({ ok: true, ...result, days: await scheduleView(db, HOUSEHOLD_ID) });
}
