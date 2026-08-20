import { NextResponse } from "next/server";
import { getDb, migrate } from "@/lib/db";
import { isoAddDays, localDate } from "@/lib/dates";
import { readEvents } from "@/lib/events";
import { activeProgram, programPosition } from "@/lib/program";
import { pickPromptBasis, weekReview, weekStreaks } from "@/lib/reflect";
import { rephrasePrompt } from "@/lib/reflect-language";
import { rebuildSchedule } from "@/lib/schedule";

const HOUSEHOLD_ID = "hh-jake"; // single household until P4 auth

// The weekly review (spec coach-reflect): the week you actually lived, streaks
// recomputed from the diary, position in the block, and ONE prompt tied to
// something true. Pulled, never pushed — nag-free by construction; review
// copy, not a suggestion pair. One diary scan.
export async function GET() {
  const db = getDb();
  await migrate(db);
  const events = await readEvents(db, HOUSEHOLD_ID);
  const today = localDate(new Date());

  const review = weekReview(events, rebuildSchedule(events), today);
  const streaks = weekStreaks(events, today);
  const program = activeProgram(events);
  const position = program ? programPosition(program, events, today) : null;
  const priorPosition = program
    ? programPosition(program, events, isoAddDays(today, -7))
    : null;

  const pick = pickPromptBasis(review, streaks, position, priorPosition);
  let text = pick.text;
  if (process.env.ANTHROPIC_API_KEY) {
    text = (await rephrasePrompt(pick)) ?? pick.text;
  }

  return NextResponse.json({
    ok: true,
    review,
    streaks,
    ...(position ? { position } : {}),
    prompt: { text, basis: pick.basis },
  });
}
