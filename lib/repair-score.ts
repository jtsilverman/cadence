// LLM repair scoring (spec program-engine AC9): the model RANKS a menu the
// deterministic engine already built — it never invents options, days, or
// ids. Anything but a clean pick naming a real option falls back to the
// deterministic recommendation (null return). extract.ts idiom: static cached
// rubric, injectable ModelCall, tolerant parse.

import Anthropic from "@anthropic-ai/sdk";
import type { ProgramPosition } from "./program";
import type { RepairSuggestion } from "./contracts";
import type { ModelCall } from "./extract";

type MenuOption = Omit<RepairSuggestion, "suggestion_id">;

export interface RepairScoreContext {
  recovery_score?: number;
  missed_priority?: "high";
  position: ProgramPosition | null;
}

// Static rubric: byte-identical across calls so the cache_control prefix can hit.
const RUBRIC = `You are ranking workout-repair options a deterministic engine already generated.

The user message is JSON: {"options": [{"option", "reason", "volume"?}...], "context": {"recovery_score"?, "missed_priority"?, "position"?}}.

Pick the single best option for a real person, weighing: recovery (low = don't add load),
session priority (a high-priority miss deserves a real makeup), program position
(deload week = less volume, peak week = protect the key sessions), and how much
total volume each option adds.

Respond with ONLY: {"pick": "<option name from the list>"}`;

async function callScoreModel(input: Parameters<ModelCall>[0]): Promise<string> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 64,
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

// The pick object is flat, so the first {...} is the whole answer — the model
// sometimes appends prose reasoning after the fenced JSON (observed live), and
// fence-stripping alone leaves that tail in front of JSON.parse.
const firstJsonObject = (raw: string): string | null =>
  raw.match(/\{[\s\S]*?\}/)?.[0] ?? null;

// The model's pick, or null when it errs in any way (caller keeps the
// deterministic recommendation). Exported seam: tests inject callModel.
export async function scoreRepairMenu(
  menu: MenuOption[],
  context: RepairScoreContext,
  callModel: ModelCall = callScoreModel
): Promise<MenuOption["option"] | null> {
  const options = menu.map(({ option, reason, volume }) => ({
    option,
    reason,
    ...(volume ? { volume } : {}),
  }));
  let raw: string;
  try {
    raw = await callModel(JSON.stringify({ options, context }));
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
  if (typeof parsed !== "object" || parsed === null) return null;
  const pick = (parsed as Record<string, unknown>).pick;
  if (typeof pick !== "string") return null;
  return menu.some((o) => o.option === pick) ? (pick as MenuOption["option"]) : null;
}
