import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/http";
import { getDb, migrate } from "@/lib/db";
import { track } from "@/lib/observe";
import { parseLineItems } from "@/lib/cart";
import { recordInflow, readPantryView } from "@/lib/pantry";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

// Groceries entering the kitchen: {items, via: "checkoff" | "delivery"}.
// A store run's Done batch and the delivery reconcile both post the confirmed
// actuals in one call, referencing their order via order_event_id.
export async function POST(request: Request) {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const body = read.body;
  const via = body.via;
  if (via !== "checkoff" && via !== "delivery") {
    return NextResponse.json(
      { ok: false, reason: "via must be checkoff | delivery" },
      { status: 422 }
    );
  }
  const parsed = parseLineItems(body.items);
  if (!parsed.ok) {
    return NextResponse.json(parsed, { status: 422 });
  }
  const orderEventId =
    typeof body.order_event_id === "string" ? body.order_event_id : undefined;
  const db = getDb();
  await migrate(db);
  await recordInflow(db, HOUSEHOLD_ID, parsed.items, via, { orderEventId });
  const items = await readPantryView(db, HOUSEHOLD_ID);
  await track(db, {
    kind: "action_result",
    path: "/api/pantry/inflow",
    household_id: HOUSEHOLD_ID,
    props: { action: "pantry_inflow", ok: true, lines: items.length },
  });
  return NextResponse.json({ ok: true, items });
}
