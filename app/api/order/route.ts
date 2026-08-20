import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/http";
import { getDb, migrate } from "@/lib/db";
import { parseLineItems } from "@/lib/cart";
import { instacartRail, instoreRail, placeOrder } from "@/lib/rails";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

// Hand the shopping list to a rail. rail:"instore" (the default) starts an
// in-store run: OrderPlaced in the diary, order_event_id back so the client
// can key run state and the Done batch. rail:"instacart" returns the
// shoppable page url; checkout happens on Instacart's side.
export async function POST(request: Request) {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const body = read.body;
  const parsed = parseLineItems(body.items);
  if (!parsed.ok) {
    return NextResponse.json(parsed, { status: 422 });
  }
  const rail = body.rail === "instacart" ? instacartRail : instoreRail;
  if (rail === instacartRail && !process.env.INSTACART_API_KEY) {
    return NextResponse.json(
      { ok: false, reason: "Instacart rail not configured (INSTACART_API_KEY missing)" },
      { status: 503 }
    );
  }
  const db = getDb();
  await migrate(db);
  try {
    const { url, order_event_id } = await placeOrder(db, HOUSEHOLD_ID, parsed.items, rail);
    return NextResponse.json({ ok: true, order_event_id, ...(url ? { url } : {}) });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: err instanceof Error ? err.message : "rail failed" },
      { status: 502 }
    );
  }
}
