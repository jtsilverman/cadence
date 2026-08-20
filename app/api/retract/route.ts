import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/http";
import { getDb, migrate } from "@/lib/db";
import { LOG_RETRACTED, RETRACTABLE_TYPES } from "@/lib/contracts";
import { appendEvent, newEventId, readEvent, readEvents, retractedIds } from "@/lib/events";
import { rebuildPantryView } from "@/lib/pantry";
import { scheduleView } from "@/lib/schedule";
import { RECIPE_COOKED } from "@/lib/contracts";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

// The undo trail (spec retraction-ladder): take back one of your own taps.
// Append-only — the tap and the take-back both stay on the record; every fold
// simply forgets the target id. Gate is the RETRACTABLE_TYPES accept-list.
export async function POST(request: Request) {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const eventId = read.body.event_id;
  if (typeof eventId !== "string" || !eventId.trim()) {
    return NextResponse.json({ ok: false, reason: "event_id required" }, { status: 422 });
  }
  const db = getDb();
  await migrate(db);

  const target = await readEvent(db, HOUSEHOLD_ID, eventId);
  if (!target) {
    return NextResponse.json({ ok: false, reason: "no such event" }, { status: 404 });
  }
  if (!RETRACTABLE_TYPES.includes(target.type)) {
    return NextResponse.json(
      { ok: false, reason: `a ${target.type} event can't be retracted` },
      { status: 422 }
    );
  }
  if (target.source !== "web") {
    return NextResponse.json(
      { ok: false, reason: "can't retract a device record" },
      { status: 422 }
    );
  }

  // idempotent: taking back an already-taken-back tap is a no-op, not an error
  const already = retractedIds(await readEvents(db, HOUSEHOLD_ID, { type: LOG_RETRACTED }));
  if (!already.has(eventId)) {
    await appendEvent(db, {
      event_id: newEventId(),
      household_id: HOUSEHOLD_ID,
      type: LOG_RETRACTED,
      ts: new Date().toISOString(),
      source: "web",
      payload: { retracted_event_id: eventId },
      schema_version: 1,
      // the user's own take-back
      precision: "exact",
    });
    // the pantry view is a cache of the fold; a forgotten cook must refold it
    if (target.type === RECIPE_COOKED) {
      await rebuildPantryView(db, HOUSEHOLD_ID);
    }
  }
  return NextResponse.json({ ok: true, days: await scheduleView(db, HOUSEHOLD_ID) });
}
