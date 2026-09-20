import { NextResponse } from "next/server";
import { getDb, migrate } from "@/lib/db";
import { readJsonObject } from "@/lib/http";
import { parseProfileValues, readProfile, setProfileValues } from "@/lib/profile";

const HOUSEHOLD_ID = "hh-jake";

export async function GET(): Promise<Response> {
  const db = getDb();
  await migrate(db);
  return NextResponse.json({ ok: true, profile: await readProfile(db, HOUSEHOLD_ID) });
}

export async function POST(request: Request): Promise<Response> {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const parsed = parseProfileValues(read.body.values);
  if (!parsed.ok) return NextResponse.json(parsed, { status: 422 });
  const db = getDb();
  await migrate(db);
  await setProfileValues(db, HOUSEHOLD_ID, parsed.values);
  return NextResponse.json({ ok: true, profile: await readProfile(db, HOUSEHOLD_ID) });
}
