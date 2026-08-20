// The chat engine's deterministic spine (lib/chat.ts): gates, verdict parse,
// safety clamps, executors, and receipt composition — model injected, never
// called. The live model path is Layer 3's job (evals/chat).

process.env.TURSO_DATABASE_URL = ":memory:";

import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type Client } from "@libsql/client";

let chat: typeof import("@/lib/chat");
let dbmod: typeof import("@/lib/db");
let events: typeof import("@/lib/events");

const HH = "hh-jake";

beforeAll(async () => {
  chat = await import("@/lib/chat");
  dbmod = await import("@/lib/db");
  events = await import("@/lib/events");
});

async function freshDb(): Promise<Client> {
  const db = createClient({ url: ":memory:" });
  await dbmod.migrate(db);
  return db;
}

const verdict = (over: Partial<import("@/lib/chat").ChatVerdict>): string =>
  JSON.stringify({
    intent: "smalltalk",
    items: [],
    plan_ops: [],
    skip_meal: null,
    list_items: [],
    goal_calories: null,
    reply: "ok",
    ...over,
  });

const model = (raw: string): import("@/lib/chat").ChatModelCall => async () => raw;

describe("parseChatBody", () => {
  it("caps oversized utterances gracefully", () => {
    const result = chat.parseChatBody({ text: "x".repeat(60_000) }, false);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.oversized).toBe(true);
  });

  it("ignores a now override outside eval mode", () => {
    const result = chat.parseChatBody({ text: "hi", now: "2020-01-01T00:00:00Z" }, false);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.req.nowISO).not.toContain("2020");
  });

  it("honors the now override in eval mode", () => {
    const result = chat.parseChatBody({ text: "hi", now: "2026-08-01T12:00:00Z" }, true);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.req.nowISO).toBe("2026-08-01T12:00:00.000Z");
  });
});

describe("parseVerdict", () => {
  it("strips fences and validates enums", () => {
    const parsed = chat.parseVerdict("```json\n" + verdict({ intent: "log_food" }) + "\n```");
    expect(parsed.intent).toBe("log_food");
  });

  it("falls back to a safe no-action verdict on garbage", () => {
    for (const raw of ["not json", "{}", verdict({ intent: "made_up" as never })]) {
      const parsed = chat.parseVerdict(raw);
      expect(parsed.intent).toBe("ambiguous");
      expect(parsed.items).toEqual([]);
    }
  });

  it("drops malformed items and clamps negatives", () => {
    const parsed = chat.parseVerdict(
      verdict({
        intent: "log_food",
        items: [
          { title: "burrito", calories: -50, protein_g: 40, carbs_g: 60, fat_g: 20, day_offset: -9, sitting: 1, confidence: "high" },
          { calories: 100 },
        ] as never,
      })
    );
    expect(parsed.items.length).toBe(1);
    expect(parsed.items[0].calories).toBe(0);
    expect(parsed.items[0].day_offset).toBe(0); // backfill caps at -6; junk falls to today
  });
});

describe("safety clamp", () => {
  it("refuses sub-1200 targets and absurd ones", () => {
    expect(chat.clampGoalCalories(800).ok).toBe(false);
    expect(chat.clampGoalCalories(9000).ok).toBe(false);
    expect(chat.clampGoalCalories(1800).ok).toBe(true);
  });
});

describe("runChat executors", () => {
  it("log_food writes ONE combined RecipeCooked with estimated precision and a receipt", async () => {
    const db = await freshDb();
    const outcome = await chat.runChat(
      db,
      HH,
      { text: "chipotle bowl and 3 rice cakes", history: [], nowISO: new Date().toISOString() },
      model(
        verdict({
          intent: "log_food",
          items: [
            { title: "Chicken Chipotle bowl", calories: 900, protein_g: 45, carbs_g: 90, fat_g: 30, day_offset: 0, sitting: 1, confidence: "high" },
            { title: "3 rice cakes with peanut butter", calories: 300, protein_g: 9, carbs_g: 30, fat_g: 16, day_offset: 0, sitting: 1, confidence: "high" },
          ],
          reply: "Nice, logging that.",
        })
      )
    );
    const cooked = await events.readEvents(db, HH, { type: "RecipeCooked" });
    expect(cooked.length).toBe(1);
    expect(cooked[0].source).toBe("chat");
    expect(cooked[0].precision).toBe("estimated");
    const payload = cooked[0].payload as { nutrition: { calories: number } };
    expect(payload.nutrition.calories).toBe(1200);
    expect(outcome.reply).toContain("✓");
    expect(outcome.reply).toContain("1200 kcal");
  });

  it("yesterday items land on yesterday's calendar day", async () => {
    const db = await freshDb();
    await chat.runChat(
      db,
      HH,
      { text: "forgot to log yesterday's lunch", history: [], nowISO: new Date().toISOString() },
      model(
        verdict({
          intent: "log_food",
          items: [{ title: "Turkey sandwich", calories: 500, protein_g: 30, carbs_g: 50, fat_g: 18, day_offset: -1, sitting: 1, confidence: "low" }],
        })
      )
    );
    const cooked = await events.readEvents(db, HH, { type: "RecipeCooked" });
    const { localDate, isoAddDays } = await import("@/lib/dates");
    const today = localDate(new Date().toISOString());
    expect(localDate(cooked[0].ts)).toBe(isoAddDays(today, -1));
  });

  it("retract_last retracts the latest log and says so", async () => {
    const db = await freshDb();
    const now = new Date().toISOString();
    await chat.runChat(db, HH, { text: "log a beer", history: [], nowISO: now },
      model(verdict({ intent: "log_food", items: [{ title: "Beer", calories: 150, protein_g: 2, carbs_g: 13, fat_g: 0, day_offset: 0, sitting: 1, confidence: "high" }] })));
    const outcome = await chat.runChat(db, HH, { text: "delete that last log", history: [], nowISO: now },
      model(verdict({ intent: "retract_last" })));
    const retractions = await events.readEvents(db, HH, { type: "LogRetracted" });
    expect(retractions.length).toBe(1);
    expect(outcome.reply.toLowerCase()).toContain("removed");
  });

  it("amend_last replaces, never duplicates: one live log after correction", async () => {
    const db = await freshDb();
    const now = new Date().toISOString();
    await chat.runChat(db, HH, { text: "had a beer", history: [], nowISO: now },
      model(verdict({ intent: "log_food", items: [{ title: "Beer", calories: 150, protein_g: 2, carbs_g: 13, fat_g: 0, day_offset: 0, sitting: 1, confidence: "high" }] })));
    await chat.runChat(db, HH, { text: "actually two", history: [], nowISO: now },
      model(verdict({ intent: "amend_last", items: [{ title: "2 beers", calories: 300, protein_g: 4, carbs_g: 26, fat_g: 0, day_offset: 0, sitting: 1, confidence: "high" }] })));
    const all = await events.readEvents(db, HH);
    const retracted = new Set(
      all.filter((e) => e.type === "LogRetracted").map((e) => (e.payload as { retracted_event_id: string }).retracted_event_id)
    );
    const live = all.filter((e) => e.type === "RecipeCooked" && !retracted.has(e.event_id));
    expect(live.length).toBe(1);
    expect((live[0].payload as { title: string }).title).toBe("2 beers");
  });

  it("every outcome carries the context block the model saw", async () => {
    const db = await freshDb();
    const outcome = await chat.runChat(db, HH, { text: "hi", history: [], nowISO: new Date().toISOString() },
      model(verdict({ intent: "smalltalk" })));
    expect(outcome.context_block).toContain("now:");
    expect(outcome.context_block).toContain("nutrition goal:");
  });

  it("a log receipt carries the server-computed day total, so replies never derive one", async () => {
    const db = await freshDb();
    const now = new Date().toISOString();
    await chat.runChat(db, HH, { text: "had a bagel", history: [], nowISO: now },
      model(verdict({ intent: "log_food", items: [{ title: "Bagel", calories: 300, protein_g: 10, carbs_g: 55, fat_g: 2, day_offset: 0, sitting: 1, confidence: "high" }] })));
    const outcome = await chat.runChat(db, HH, { text: "and a turkey sandwich", history: [], nowISO: now },
      model(verdict({ intent: "log_food", items: [{ title: "Turkey sandwich", calories: 520, protein_g: 28, carbs_g: 45, fat_g: 20, day_offset: 0, sitting: 1, confidence: "high" }] })));
    expect(outcome.reply).toContain("Today so far: ~820 kcal");
  });

  it("a retraction receipt carries the corrected day total", async () => {
    const db = await freshDb();
    const now = new Date().toISOString();
    await chat.runChat(db, HH, { text: "bagel", history: [], nowISO: now },
      model(verdict({ intent: "log_food", items: [{ title: "Bagel", calories: 300, protein_g: 10, carbs_g: 55, fat_g: 2, day_offset: 0, sitting: 1, confidence: "high" }] })));
    await chat.runChat(db, HH, { text: "beer", history: [], nowISO: now },
      model(verdict({ intent: "log_food", items: [{ title: "Beer", calories: 150, protein_g: 2, carbs_g: 13, fat_g: 0, day_offset: 0, sitting: 1, confidence: "high" }] })));
    const outcome = await chat.runChat(db, HH, { text: "delete that", history: [], nowISO: now },
      model(verdict({ intent: "retract_last" })));
    expect(outcome.reply).toContain("Today so far: ~300 kcal");
  });

  it("a yesterday backfill receipt totals yesterday, not today", async () => {
    const db = await freshDb();
    const outcome = await chat.runChat(db, HH, { text: "forgot yesterday's lunch", history: [], nowISO: new Date().toISOString() },
      model(verdict({ intent: "log_food", items: [{ title: "Turkey club", calories: 700, protein_g: 35, carbs_g: 60, fat_g: 30, day_offset: -1, sitting: 1, confidence: "low" }] })));
    const { localDate, isoAddDays } = await import("@/lib/dates");
    const yday = isoAddDays(localDate(new Date().toISOString()), -1);
    expect(outcome.reply).toContain(`${yday}: ~700 kcal`);
  });

  it("safety intent writes NOTHING and the clamp survives a compliant model draft", async () => {
    const db = await freshDb();
    const outcome = await chat.runChat(db, HH, { text: "set me to 800 calories", history: [], nowISO: new Date().toISOString() },
      model(verdict({ intent: "goal_set", goal_calories: 800, reply: "Sure, setting 800!" })));
    const goals = await events.readEvents(db, HH, { type: "GoalSet" });
    expect(goals.length).toBe(0);
    expect(outcome.reply).not.toContain("Sure, setting 800!");
    expect(outcome.reply).toContain("1200");
  });

  it("an overshoot log auto-proposes a capped trim — never a silent restructure", async () => {
    const db = await freshDb();
    const now = new Date().toISOString();
    await chat.runChat(db, HH, { text: "set me to 2000 a day", history: [], nowISO: now },
      model(verdict({ intent: "goal_set", goal_calories: 2000 })));
    const outcome = await chat.runChat(db, HH, { text: "I ate a whole party pizza tonight", history: [], nowISO: now },
      model(verdict({ intent: "log_food", items: [{ title: "Whole party pizza", calories: 20000, protein_g: 400, carbs_g: 1800, fat_g: 900, day_offset: 0, sitting: 1, confidence: "low" }] })));
    const suggestions = await events.readEvents(db, HH, { type: "SuggestionMade" });
    expect(suggestions.filter((e) => (e.payload as { kind: string }).kind === "nutrition_adjust").length).toBe(1);
    expect(outcome.reply).toContain("trim");
    const planned = await events.readEvents(db, HH, { type: "SchedulePlanned" });
    expect(planned.length).toBe(0);
  });

  it("goal_talk with a derived number proposes, never sets", async () => {
    const db = await freshDb();
    const outcome = await chat.runChat(db, HH, { text: "I want to lose 15 lbs by November", history: [], nowISO: new Date().toISOString() },
      model(verdict({ intent: "goal_talk", goal_proposal_calories: 1750, reply: "Here's the plan." })));
    const goals = await events.readEvents(db, HH, { type: "GoalSet" });
    expect(goals.length).toBe(0);
    const suggestions = await events.readEvents(db, HH, { type: "SuggestionMade" });
    const proposals = suggestions.filter((e) => (e.payload as { kind: string }).kind === "goal_proposal");
    expect(proposals.length).toBe(1);
    expect(outcome.reply).toContain("✓ Proposed");
  });

  it("a conversational yes turns an open goal proposal into the real GoalSet", async () => {
    const db = await freshDb();
    const now = new Date().toISOString();
    await chat.runChat(db, HH, { text: "lose 15 by November", history: [], nowISO: now },
      model(verdict({ intent: "goal_talk", goal_proposal_calories: 1750 })));
    const yes = await chat.runChat(db, HH, { text: "yes let's do it", history: [], nowISO: now },
      model(verdict({ intent: "approve_proposal" })));
    const goals = await events.readEvents(db, HH, { type: "GoalSet" });
    expect(goals.length).toBe(1);
    expect((goals[0].payload as { daily_calories: number }).daily_calories).toBe(1750);
    const resolved = await events.readEvents(db, HH, { type: "SuggestionResolved" });
    expect(resolved.length).toBe(1);
    expect(yes.reply).toContain("1750");
  });

  it("a sub-1200 goal proposal is clamped at the proposal gate too", async () => {
    const db = await freshDb();
    const outcome = await chat.runChat(db, HH, { text: "put me on 800", history: [], nowISO: new Date().toISOString() },
      model(verdict({ intent: "goal_talk", goal_proposal_calories: 800, reply: "Proposing 800." })));
    const suggestions = await events.readEvents(db, HH, { type: "SuggestionMade" });
    expect(suggestions.length).toBe(0);
    expect(outcome.reply).toContain("1200");
    expect(outcome.reply).not.toContain("Proposing 800.");
  });

  it("skipping a planned meal proposes a makeup snack draft alongside the skip", async () => {
    const db = await freshDb();
    const now = new Date().toISOString();
    const { planSchedule } = await import("@/lib/schedule");
    const today = (await import("@/lib/dates")).localDate(now);
    await planSchedule(db, HH, [
      { date: today, slots: [
        { slot_id: "b1", lane: "meal", title: "Oats" },
        { slot_id: "l1", lane: "meal", title: "Chicken bowl" },
        { slot_id: "d1", lane: "meal", title: "Stir fry" },
      ] },
    ]);
    const outcome = await chat.runChat(db, HH, { text: "skipped lunch, too late to cook now", history: [], nowISO: now },
      model(verdict({ intent: "skip_meal", skip_meal: "lunch" })));
    const skips = await events.readEvents(db, HH, { type: "SlotSkipped" });
    expect(skips.length).toBe(1);
    const suggestions = await events.readEvents(db, HH, { type: "SuggestionMade" });
    const drafts = suggestions.filter((e) => (e.payload as { kind: string }).kind === "plan_draft");
    expect(drafts.length).toBe(1);
    expect(outcome.reply.toLowerCase()).toContain("snack");
    const planned = await events.readEvents(db, HH, { type: "SchedulePlanned" });
    expect(planned.length).toBe(1); // only the seed — proposal not applied
  });

  it("an explicit 'we're out of X' asserts pantry truth (user statement, not inference)", async () => {
    const db = await freshDb();
    const outcome = await chat.runChat(db, HH, { text: "we're out of olive oil", history: [], nowISO: new Date().toISOString() },
      model(verdict({ intent: "pantry_update", pantry_ops: [{ name: "olive oil", op: "out" }] } as never)));
    const asserted = await events.readEvents(db, HH, { type: "PantryAsserted" });
    expect(asserted.length).toBe(1);
    expect((asserted[0].payload as { name: string; removed?: boolean }).removed).toBe(true);
    expect(outcome.reply).toContain("olive oil");
  });

  it("'I bought X' records a pantry inflow", async () => {
    const db = await freshDb();
    await chat.runChat(db, HH, { text: "picked up bananas and salsa", history: [], nowISO: new Date().toISOString() },
      model(verdict({ intent: "pantry_update", pantry_ops: [
        { name: "bananas", op: "bought", qty: 6 },
        { name: "salsa", op: "bought" },
      ] } as never)));
    const inflows = await events.readEvents(db, HH, { type: "PantryInflow" });
    expect(inflows.length).toBe(1);
    const items = (inflows[0].payload as { items: Array<{ name: string }> }).items;
    expect(items.map((i) => i.name).sort()).toEqual(["bananas", "salsa"]);
  });

  it("a named retraction takes back the matching log, not the latest", async () => {
    const db = await freshDb();
    const now = new Date().toISOString();
    await chat.runChat(db, HH, { text: "two beers with dinner", history: [], nowISO: now },
      model(verdict({ intent: "log_food", items: [{ title: "Two beers", calories: 300, protein_g: 4, carbs_g: 26, fat_g: 0, day_offset: 0, sitting: 1, confidence: "high" }] })));
    await chat.runChat(db, HH, { text: "and a granola bar", history: [], nowISO: now },
      model(verdict({ intent: "log_food", items: [{ title: "Granola bar", calories: 200, protein_g: 5, carbs_g: 25, fat_g: 8, day_offset: 0, sitting: 1, confidence: "high" }] })));
    const outcome = await chat.runChat(db, HH, { text: "actually delete the beers", history: [], nowISO: now },
      model(verdict({ intent: "retract_last", retract_match: "beer" } as never)));
    const all = await events.readEvents(db, HH);
    const retractedIds = new Set(
      all.filter((e) => e.type === "LogRetracted").map((e) => (e.payload as { retracted_event_id: string }).retracted_event_id)
    );
    const live = all.filter((e) => e.type === "RecipeCooked" && !retractedIds.has(e.event_id));
    expect(live.length).toBe(1);
    expect((live[0].payload as { title: string }).title).toBe("Granola bar");
    expect(outcome.reply).toContain("Two beers");
  });

  it("a single-day blowout proposes the capped trim even when the week is still under", async () => {
    const db = await freshDb();
    const now = new Date().toISOString();
    await chat.runChat(db, HH, { text: "set me to 2000", history: [], nowISO: now },
      model(verdict({ intent: "goal_set", goal_calories: 2000 })));
    await chat.runChat(db, HH, { text: "whole pizza tonight", history: [], nowISO: now },
      model(verdict({ intent: "log_food", items: [{ title: "Whole pizza", calories: 2900, protein_g: 90, carbs_g: 300, fat_g: 120, day_offset: 0, sitting: 1, confidence: "low" }] })));
    const suggestions = await events.readEvents(db, HH, { type: "SuggestionMade" });
    expect(suggestions.filter((e) => (e.payload as { kind: string }).kind === "nutrition_adjust").length).toBe(1);
  });

  it("an amendment with nothing to amend falls back to logging, never a claimed-noop", async () => {
    const db = await freshDb();
    const outcome = await chat.runChat(db, HH, { text: "only ate half my dinner", history: [], nowISO: new Date().toISOString() },
      model(verdict({ intent: "amend_last", items: [{ title: "Half stir fry", calories: 240, protein_g: 9, carbs_g: 26, fat_g: 10, day_offset: 0, sitting: 1, confidence: "low" }] })));
    const cooked = await events.readEvents(db, HH, { type: "RecipeCooked" });
    expect(cooked.length).toBe(1);
    expect(outcome.reply).not.toContain("couldn't find");
    expect(outcome.reply).toContain("✓ Logged");
  });

  it("'no more shrimp' lands as a durable standing preference", async () => {
    const db = await freshDb();
    const outcome = await chat.runChat(db, HH, { text: "no more shrimp in my plans", history: [], nowISO: new Date().toISOString() },
      model(verdict({ intent: "plan_change", avoid_ingredient: "shrimp" } as never)));
    const prefs = await events.readEvents(db, HH, { type: "PreferenceSet" });
    expect(prefs.length).toBe(1);
    expect((prefs[0].payload as { name: string }).name).toBe("shrimp");
    expect(outcome.reply.toLowerCase()).toContain("shrimp");
  });

  it("model-authored receipt lines and prose running totals are stripped — the server receipt is the only total", async () => {
    const db = await freshDb();
    const now = new Date().toISOString();
    const outcome = await chat.runChat(db, HH, { text: "turkey sandwich", history: [], nowISO: now },
      model(verdict({
        intent: "log_food",
        items: [{ title: "Turkey sandwich", calories: 520, protein_g: 28, carbs_g: 45, fat_g: 20, day_offset: 0, sitting: 1, confidence: "high" }],
        reply: "Got it — logged. You're at 1040 for the day so far. Was it on whole wheat?\n✓ Logged: Turkey sandwich — fake receipt",
      })));
    expect(outcome.reply).not.toContain("1040");
    expect(outcome.reply).not.toContain("fake receipt");
    expect(outcome.reply).toContain("whole wheat");
    expect(outcome.reply).toContain("Today so far: ~520 kcal");
  });

  it("the day-total receipt carries protein too, so protein claims are grounded", async () => {
    const db = await freshDb();
    const now = new Date().toISOString();
    const outcome = await chat.runChat(db, HH, { text: "protein shake", history: [], nowISO: now },
      model(verdict({ intent: "log_food", items: [{ title: "Whey shake", calories: 120, protein_g: 25, carbs_g: 3, fat_g: 2, day_offset: 0, sitting: 1, confidence: "high" }] })));
    expect(outcome.reply).toMatch(/Today so far: ~120 kcal.*~25g protein/);
  });

  it("a bare 'undo' skips the model and retracts the last log deterministically", async () => {
    const db = await freshDb();
    const now = new Date().toISOString();
    await chat.runChat(db, HH, { text: "protein bar", history: [], nowISO: now },
      model(verdict({ intent: "log_food", items: [{ title: "Protein bar", calories: 200, protein_g: 20, carbs_g: 20, fat_g: 8, day_offset: 0, sitting: 1, confidence: "high" }] })));
    const boom: import("@/lib/chat").ChatModelCall = async () => {
      throw new Error("model must not be called for a bare undo");
    };
    const outcome = await chat.runChat(db, HH, { text: "undo that", history: [], nowISO: now }, boom);
    const retractions = await events.readEvents(db, HH, { type: "LogRetracted" });
    expect(retractions.length).toBe(1);
    expect(outcome.reply).toContain("Protein bar");
  });

  it("prose calorie deltas and 'you're at X now' claims are stripped alongside totals", async () => {
    const db = await freshDb();
    const now = new Date().toISOString();
    await chat.runChat(db, HH, { text: "two tacos", history: [], nowISO: now },
      model(verdict({ intent: "log_food", items: [{ title: "Two tacos", calories: 460, protein_g: 20, carbs_g: 40, fat_g: 22, day_offset: 0, sitting: 1, confidence: "high" }] })));
    const outcome = await chat.runChat(db, HH, { text: "make it three tacos and a horchata", history: [], nowISO: now },
      model(verdict({
        intent: "amend_last",
        items: [{ title: "Three tacos + horchata", calories: 940, protein_g: 28, carbs_g: 90, fat_g: 40, day_offset: 0, sitting: 1, confidence: "low" }],
        reply: "Got it — that's about 940 more calories than the two tacos. You're at ~1200 kcal now. Enjoy!",
      })));
    expect(outcome.reply).not.toContain("940 more");
    expect(outcome.reply).not.toContain("1200");
    expect(outcome.reply).toContain("Enjoy!");
  });

  it("'no more shrimp' extraction is deterministic, and safety talk never becomes a preference", async () => {
    const db = await freshDb();
    const now = new Date().toISOString();
    await chat.runChat(db, HH, { text: "take shrimp off, I'm done with shrimp forever", history: [], nowISO: now },
      model(verdict({ intent: "plan_change" })));
    const prefs = await events.readEvents(db, HH, { type: "PreferenceSet" });
    expect(prefs.length).toBe(1);
    expect((prefs[0].payload as { name: string }).name).toBe("shrimp");

    await chat.runChat(db, HH, { text: "I'm done with eating, no more food for me", history: [], nowISO: now },
      model(verdict({ intent: "safety", reply: "I hear you — let's talk." })));
    const prefsAfter = await events.readEvents(db, HH, { type: "PreferenceSet" });
    expect(prefsAfter.length).toBe(1); // unchanged — safety talk writes nothing
  });

  it("a distress disclosure never gets the didn't-understand fallback, even when the model output is garbage", async () => {
    const db = await freshDb();
    const outcome = await chat.runChat(db, HH, { text: "I ate too much so I made myself throw up after", history: [], nowISO: new Date().toISOString() },
      model("total garbage not json"));
    expect(outcome.reply).not.toContain("didn't quite get");
    expect(outcome.reply.toLowerCase()).toMatch(/support|professional|neda|not alone|deserve/);
    const all = await events.readEvents(db, HH);
    expect(all.length).toBe(0);
  });

  it("context building is a pure read: no adjust/repair suggestions logged as a side effect", async () => {
    const db = await freshDb();
    const now = new Date().toISOString();
    const { planSchedule } = await import("@/lib/schedule");
    const today = (await import("@/lib/dates")).localDate(now);
    await planSchedule(db, HH, [
      { date: today, slots: [{ slot_id: "d1", lane: "meal", title: "Stir fry" }] },
    ]);
    await chat.runChat(db, HH, { text: "set me to 2000", history: [], nowISO: now },
      model(verdict({ intent: "goal_set", goal_calories: 2000 })));
    // an overshoot seeded OUTSIDE chat — like a fixture — so no chat-side trim exists yet
    await events.appendEvent(db, {
      event_id: events.newEventId(),
      household_id: HH,
      type: "RecipeCooked",
      ts: now,
      source: "web",
      payload: { library_id: "seed", title: "Seeded feast", ingredients: [], nutrition: { calories: 20000, protein_g: 100, carbs_g: 900, fat_g: 900 } },
      schema_version: 1,
      precision: "estimated",
    } as never);
    const before = (await events.readEvents(db, HH, { type: "SuggestionMade" })).length;
    await chat.runChat(db, HH, { text: "thanks!", history: [], nowISO: now },
      model(verdict({ intent: "smalltalk", reply: "anytime" })));
    const after = (await events.readEvents(db, HH, { type: "SuggestionMade" })).length;
    expect(after).toBe(before); // reading context for smalltalk must write nothing
  });

  it("reply-only intents leave the diary untouched", async () => {
    const db = await freshDb();
    for (const intent of ["education", "safety", "scope_training", "out_of_scope", "data_question", "smalltalk"] as const) {
      await chat.runChat(db, HH, { text: "q", history: [], nowISO: new Date().toISOString() },
        model(verdict({ intent, reply: "answer" })));
    }
    const all = await events.readEvents(db, HH);
    expect(all.filter((e) => e.type !== "SuggestionMade").length).toBe(0);
  });

  it("a conversational yes applies the open proposal; a no dismisses it — plan untouched", async () => {
    const db = await freshDb();
    const now = new Date().toISOString();
    // seed a plan + an open plan_draft pair the way the engine writes them
    const { planSchedule } = await import("@/lib/schedule");
    const { logSuggestions } = await import("@/lib/suggestions");
    const today = (await import("@/lib/dates")).localDate(now);
    await planSchedule(db, HH, [
      { date: today, slots: [{ slot_id: "s1", lane: "meal", title: "Turkey chili", library_id: "lib-chili" }] },
    ]);
    await logSuggestions(db, HH, [
      {
        kind: "plan_draft",
        scope: "slot",
        anchor: "s1",
        days: [{ date: today, slots: [{ slot_id: "s1", lane: "meal", title: "Veggie stir fry", library_id: "lib-stir-fry" }] }],
        reason: "via chat: swap chili for stir fry",
      },
    ]);

    const yes = await chat.runChat(db, HH, { text: "yes do it", history: [], nowISO: now },
      model(verdict({ intent: "approve_proposal", reply: "Applying." })));
    expect(yes.reply).toContain("On the calendar");
    const planned = await events.readEvents(db, HH, { type: "SchedulePlanned" });
    expect(planned.length).toBe(2);
    const resolved = await events.readEvents(db, HH, { type: "SuggestionResolved" });
    expect(resolved.length).toBe(1);
    expect((resolved[0].payload as { outcome: string }).outcome).toBe("accepted");

    // no open proposal left: a second yes is an honest noop
    const again = await chat.runChat(db, HH, { text: "yes", history: [], nowISO: now },
      model(verdict({ intent: "approve_proposal" })));
    expect(again.reply.toLowerCase()).toContain("no open proposal");
  });

  it("a model failure degrades to a graceful no-action reply", async () => {
    const db = await freshDb();
    const boom: import("@/lib/chat").ChatModelCall = async () => {
      throw new Error("api down");
    };
    const outcome = await chat.runChat(db, HH, { text: "hi", history: [], nowISO: new Date().toISOString() }, boom);
    expect(outcome.reply.length).toBeGreaterThan(0);
    expect((await events.readEvents(db, HH)).length).toBe(0);
  });
});

describe("plan ops", () => {
  const days = [
    {
      date: "2026-08-10",
      slots: [
        { slot_id: "s1", lane: "meal" as const, title: "Overnight oats", library_id: "lib-oats" },
        { slot_id: "s2", lane: "meal" as const, title: "Chicken burrito bowl", library_id: "lib-burrito-bowl" },
        { slot_id: "s3", lane: "meal" as const, title: "Turkey chili", library_id: "lib-chili" },
      ],
    },
    {
      date: "2026-08-11",
      slots: [{ slot_id: "s4", lane: "meal" as const, title: "Steak fajitas", library_id: "lib-fajitas" }],
    },
  ] as never[];
  const library = [
    { id: "lib-oats", title: "Overnight oats", calories: 420, minutes: 5, vegetarian: true },
    { id: "lib-burrito-bowl", title: "Chicken burrito bowl", calories: 650, minutes: 25, vegetarian: false },
    { id: "lib-chili", title: "Turkey chili", calories: 550, minutes: 45, vegetarian: false },
    { id: "lib-stir-fry", title: "Veggie stir fry", calories: 480, minutes: 20, vegetarian: true },
    { id: "lib-fajitas", title: "Steak fajitas", calories: 720, minutes: 30, vegetarian: false },
  ];

  it("a named target wins: 'swap dinner for the stir fry' uses that exact library meal", () => {
    const { days: proposed, changes } = chat.resolvePlanOps(days as never, library, [
      { op: "swap_slot", date: "2026-08-10", meal: "dinner", constraint: "any", target: "stir fry" } as never,
    ]);
    expect(changes.length).toBe(1);
    expect(proposed[0].slots[2].title).toBe("Veggie stir fry");
    expect(proposed[0].slots[2].library_id).toBe("lib-stir-fry");
  });

  it("a vegetarian sweep varies its picks instead of repeating one meal", () => {
    const { days: proposed } = chat.resolvePlanOps(days as never, library, [
      { op: "vegetarian_span", from: "2026-08-10", to: "2026-08-11" },
    ]);
    const replaced = [proposed[0].slots[1].title, proposed[0].slots[2].title, proposed[1].slots[0].title];
    expect(new Set(replaced).size).toBeGreaterThan(1);
  });

  it("swap_days exchanges two slots across days", () => {
    const { days: proposed, changes } = chat.resolvePlanOps(days as never, library, [
      { op: "swap_days", a_date: "2026-08-10", a_meal: "dinner", b_date: "2026-08-11", b_meal: "dinner" } as never,
    ]);
    expect(changes.length).toBe(1);
    expect(proposed[0].slots[2].title).toBe("Steak fajitas");
    expect(proposed[1].slots[0].title).toBe("Turkey chili");
    expect(proposed[0].slots[2].slot_id).toBe("s3"); // slot identity stays with the day
    expect(proposed[1].slots[0].slot_id).toBe("s4");
  });

  it("double_slot doubles the meal in place", () => {
    const { days: proposed, changes } = chat.resolvePlanOps(days as never, library, [
      { op: "double_slot", date: "2026-08-10", meal: "dinner" } as never,
    ]);
    expect(changes.length).toBe(1);
    expect(proposed[0].slots[2].title).toBe("Turkey chili (double portion)");
    expect(proposed[0].slots[2].library_id).toBe("lib-chili");
  });

  it("drop_meal_span removes that meal from every day in range", () => {
    const { days: proposed, changes } = chat.resolvePlanOps(days as never, library, [
      { op: "drop_meal_span", from: "2026-08-10", to: "2026-08-11", meal: "breakfast" } as never,
    ]);
    expect(changes.length).toBeGreaterThan(0);
    expect(proposed[0].slots.map((s) => s.title)).not.toContain("Overnight oats");
    expect(proposed[0].slots.length).toBe(2);
  });

  it("add_snack appends a snack slot to the day", () => {
    const { days: proposed, changes } = chat.resolvePlanOps(days as never, library, [
      { op: "add_snack", date: "2026-08-11" } as never,
    ]);
    expect(changes.length).toBe(1);
    expect(proposed[1].slots.length).toBe(2);
    expect(proposed[1].slots[1].title.toLowerCase()).toContain("snack");
  });

  it("a trim_week ask proposes the capped adjust from the diary, never a silent change", async () => {
    const db = await freshDb();
    const now = new Date().toISOString();
    await chat.runChat(db, HH, { text: "set me to 2000", history: [], nowISO: now },
      model(verdict({ intent: "goal_set", goal_calories: 2000 })));
    await chat.runChat(db, HH, { text: "huge day", history: [], nowISO: now },
      model(verdict({ intent: "log_food", items: [{ title: "Feast", calories: 2900, protein_g: 60, carbs_g: 200, fat_g: 150, day_offset: 0, sitting: 1, confidence: "low" }] })));
    const outcome = await chat.runChat(db, HH, { text: "I blew it, fix the rest of my week", history: [], nowISO: now },
      model(verdict({ intent: "plan_change", plan_ops: [{ op: "trim_week" }] as never })));
    const suggestions = await events.readEvents(db, HH, { type: "SuggestionMade" });
    expect(suggestions.some((e) => (e.payload as { kind: string }).kind === "nutrition_adjust")).toBe(true);
    expect(outcome.reply).toContain("trim");
    const planned = await events.readEvents(db, HH, { type: "SchedulePlanned" });
    expect(planned.length).toBe(0);
  });

  it("swap_slot avoid filters the named food out of the pick pool", () => {
    // without avoid, the picker's first choice for this dinner is Overnight oats
    const { days: baseline } = chat.resolvePlanOps(days as never, library, [
      { op: "swap_slot", date: "2026-08-10", meal: "dinner", constraint: "any" },
    ]);
    expect(baseline[0].slots[2].title).toBe("Overnight oats");
    const { days: proposed, changes } = chat.resolvePlanOps(days as never, library, [
      { op: "swap_slot", date: "2026-08-10", meal: "dinner", constraint: "any", avoid: "oats" } as never,
    ]);
    expect(changes.length).toBe(1);
    expect(proposed[0].slots[2].title.toLowerCase()).not.toContain("oats");
  });

  it("swap faster: dinner swaps to a strictly faster meal, other slots untouched", () => {
    const { days: proposed, changes } = chat.resolvePlanOps(days as never, library, [
      { op: "swap_slot", date: "2026-08-10", meal: "dinner", constraint: "faster" },
    ]);
    expect(changes.length).toBe(1);
    const dinner = proposed[0].slots[2];
    expect(dinner.title).not.toBe("Turkey chili");
    const alt = library.find((m) => m.title === dinner.title)!;
    expect(alt.minutes).toBeLessThan(45);
    expect(proposed[0].slots[0].title).toBe("Overnight oats");
    expect(proposed[1].slots[0].title).toBe("Steak fajitas");
    expect(dinner.slot_id).toBe("s3"); // slot identity survives the swap
  });

  it("vegetarian span replaces every meaty slot in range", () => {
    const { days: proposed } = chat.resolvePlanOps(days as never, library, [
      { op: "vegetarian_span", from: "2026-08-10", to: "2026-08-11" },
    ]);
    for (const day of proposed) {
      for (const slot of day.slots) {
        const meta = library.find((m) => m.id === (slot as { library_id?: string }).library_id);
        expect(meta?.vegetarian, `${slot.title} should be vegetarian`).toBe(true);
      }
    }
  });

  it("travel span turns meals into eating-out days; eating_out names the venue", () => {
    const { days: proposed } = chat.resolvePlanOps(days as never, library, [
      { op: "eating_out", date: "2026-08-11", venue: "Nobu", meal: "dinner" },
    ]);
    expect(proposed[1].slots[0].title).toContain("Nobu");
  });
});
