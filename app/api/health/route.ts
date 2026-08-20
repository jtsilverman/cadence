import { NextResponse } from "next/server";
import { getDb, migrate } from "@/lib/db";

// Health = DB reachable + schema applied. migrate is idempotent (IF NOT EXISTS),
// so hitting this after deploy doubles as schema init.
export async function GET() {
  try {
    const db = getDb();
    await migrate(db);
    await db.execute("SELECT 1");
    return NextResponse.json({ ok: true, db: "ok" });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
