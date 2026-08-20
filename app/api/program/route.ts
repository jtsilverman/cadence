import { NextResponse } from "next/server";
import { readJsonObject } from "@/lib/http";
import { localDate } from "@/lib/dates";
import { getDb, migrate } from "@/lib/db";
import { readEvents } from "@/lib/events";
import { activeProgram, parseProgram, programPosition, recordProgram } from "@/lib/program";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

// The active program (one per household) plus the position in it.
export async function GET() {
  const db = getDb();
  await migrate(db);
  const events = await readEvents(db, HOUSEHOLD_ID);
  const program = activeProgram(events);
  if (!program) return NextResponse.json({ ok: true, program: null });
  const position = programPosition(program, events, localDate(new Date()));
  return NextResponse.json({ ok: true, program, position });
}

// Set (or replace, or clear) the household's program. Latest event wins.
export async function POST(request: Request) {
  const read = await readJsonObject(request);
  if (!read.ok) return read.response;
  const parsed = parseProgram(read.body);
  if (!parsed.ok) {
    return NextResponse.json(parsed, { status: 422 });
  }
  const db = getDb();
  await migrate(db);
  await recordProgram(db, HOUSEHOLD_ID, parsed.program);
  return NextResponse.json({ ok: true });
}
