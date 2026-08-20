import { NextResponse } from "next/server";
import { getDb, migrate } from "@/lib/db";
import { listOrders } from "@/lib/rails";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

export async function GET() {
  const db = getDb();
  await migrate(db);
  const orders = await listOrders(db, HOUSEHOLD_ID);
  return NextResponse.json({ ok: true, orders });
}
