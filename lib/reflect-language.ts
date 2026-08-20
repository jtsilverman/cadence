// The language boundary (spec coach-reflect AC4): the model REPHRASES a
// prompt whose topic the deterministic core already picked — it never chooses
// the topic, never sees the raw diary or journal text, only the typed basis.
// Any deviation ships the template (the fallback is a complete prompt, never
// silence). plan-pick idiom: static cached rubric, injectable ModelCall.

import Anthropic from "@anthropic-ai/sdk";
import type { ModelCall } from "./extract";
import type { PromptPick } from "./reflect";

const RUBRIC = `You are a health coach rewriting ONE journaling prompt in a warmer, more specific voice.

The user message is JSON: {"basis": "<topic kind>", "template": "<the working prompt>"}.
The template is already true and grounded — keep its meaning and any numbers exactly.

Rules: one single question, under 200 characters, no preamble, no emoji, no
invented facts. Curious coach, not cheerleader.

Respond with ONLY: {"prompt": "<the rewritten question>"}`;

async function callLanguageModel(input: Parameters<ModelCall>[0]): Promise<string> {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 128,
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
  raw.match(/\{[\s\S]*?\}/)?.[0] ?? null;

// The rewritten prompt, or null when anything is off (caller ships the template).
export async function rephrasePrompt(
  pick: PromptPick,
  callModel: ModelCall = callLanguageModel
): Promise<string | null> {
  let raw: string;
  try {
    raw = await callModel(JSON.stringify({ basis: pick.basis, template: pick.text }));
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
  const prompt = (parsed as { prompt?: unknown })?.prompt;
  if (typeof prompt !== "string") return null;
  const trimmed = prompt.trim();
  if (trimmed.length === 0 || trimmed.length > 240) return null;
  if ((trimmed.match(/\?/g) ?? []).length !== 1) return null; // one question, exactly
  return trimmed;
}
