// LLM meal picking (spec planner-composer AC8): the model chooses among
// candidate recipe ids the deterministic composer already built — it never
// invents ids, dates, or slots. Per-date validation: a pick outside that
// date's candidates is dropped (that slot keeps candidate #1); a whole-call
// failure returns null and the deterministic draft stands untouched.
// repair-score idiom: static cached rubric, injectable ModelCall,
// first-JSON-object parse.

import Anthropic from "@anthropic-ai/sdk";
import type { ModelCall } from "./extract";
import type { ProgramWeekKind } from "./contracts";

export interface PickContext {
  daily_calories?: number;
  latest_recovery?: number;
  phase: ProgramWeekKind | null;
}

// Static rubric: byte-identical across calls so the cache_control prefix can hit.
const RUBRIC = `You are choosing next week's dinners from a user's own cookbook.

The user message is JSON: {"candidates": {"<date>": ["<recipe_id>", ...]}, "context": {"daily_calories"?, "latest_recovery"?, "phase"?}}.
Candidate ids are listed best-first by rotation and calorie fit.

Pick ONE id per date, favoring variety across the week while respecting the
calorie context (lower recovery or a deload phase → gentler, familiar meals).
You may only use ids from that date's own list.

Respond with ONLY: {"picks": {"<date>": "<recipe_id>", ...}}`;

async function callPickModel(input: Parameters<ModelCall>[0]): Promise<string> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 512,
    system: [{ type: "text", text: RUBRIC, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: input as Parameters<
          Anthropic["messages"]["create"]
        >[0]["messages"][0]["content"],
      },
    ],
  });
  const block = response.content[0];
  return block?.type === "text" ? block.text : "";
}

const firstJsonObject = (raw: string): string | null =>
  raw.match(/\{[\s\S]*\}/)?.[0] ?? null;

export async function pickMeals(
  candidates: Record<string, string[]>,
  context: PickContext,
  callModel: ModelCall = callPickModel
): Promise<Record<string, string> | null> {
  let raw: string;
  try {
    raw = await callModel(JSON.stringify({ candidates, context }));
  } catch {
    return null;
  }
  const body = firstJsonObject(raw);
  if (body === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  const picks = (parsed as { picks?: unknown })?.picks;
  if (typeof picks !== "object" || picks === null || Array.isArray(picks)) return null;
  const out: Record<string, string> = {};
  for (const [date, id] of Object.entries(picks as Record<string, unknown>)) {
    if (typeof id !== "string") return null;
    if (candidates[date]?.includes(id)) out[date] = id;
  }
  return out;
}
