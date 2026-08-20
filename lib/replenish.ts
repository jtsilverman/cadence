// Replenisher v0 (spec list-first criterion 5): deterministic, suggest-only.
// Pure readers over the diary — no LLM, no side effects, and honest absences:
// fewer than 2 grocery-run days means no cadence and zero suggestions;
// cross-dimension amounts are excluded, never guessed.

import type {
  EventEnvelope,
  PantryInflowPayload,
  RecipePlan,
  SuggestionResolvedPayload,
} from "./contracts";
import { PANTRY_INFLOW, SUGGESTION_RESOLVED } from "./contracts";
import type { CartLine } from "./cart";
import { cooksLeft } from "./fullness";
import type { PantryItem } from "./pantry";
import { convert } from "./units";

export interface Suggestion {
  name: string;
  qty: number | null;
  unit: string | null;
  reason: string;
}

const dayOf = (ts: string) => ts.slice(0, 10);
const norm = (s: string) => s.trim().toLowerCase();
const round2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => String(round2(n));

const median = (sorted: number[]): number => {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// Grocery-run days = distinct calendar days with a PantryInflow. Day-level so
// P1's one-event-per-checkbox history reads as one run, not ten.
function runDays(events: EventEnvelope[]): string[] {
  const days = new Set(
    events.filter((e) => e.type === PANTRY_INFLOW).map((e) => dayOf(e.ts))
  );
  return [...days].sort();
}

export function medianRunGapDays(events: EventEnvelope[]): number | null {
  const days = runDays(events);
  if (days.length < 2) return null;
  const gaps = days
    .slice(1)
    .map((d, i) => (Date.parse(d) - Date.parse(days[i])) / 86_400_000)
    .sort((a, b) => a - b);
  return median(gaps);
}

// Median past purchase amount for an item, in the item's unit (compatible
// inflow lines only) — the pre-filled "how much" for a suggestion.
function medianPurchase(
  events: EventEnvelope[],
  name: string,
  unit: string | null
): number | null {
  const amounts: number[] = [];
  for (const event of events) {
    if (event.type !== PANTRY_INFLOW) continue;
    for (const line of (event.payload as PantryInflowPayload).items) {
      if (norm(line.name) !== name || line.qty === null) continue;
      const converted = convert(line.qty, line.unit, unit);
      if (converted !== null && converted > 0) amounts.push(converted);
    }
  }
  if (amounts.length === 0) return null;
  return round2(median(amounts.sort((a, b) => a - b)));
}

export function suggestAdditions(args: {
  pantry: PantryItem[];
  plans: RecipePlan[];
  toBuy: CartLine[];
  events: EventEnvelope[];
}): Suggestion[] {
  const { pantry, plans, toBuy, events } = args;
  // Cold start: no cadence, no suggestions — never invent a rhythm.
  if (medianRunGapDays(events) === null) return [];

  const lastInflowTs = events
    .filter((e) => e.type === PANTRY_INFLOW)
    .reduce((max, e) => (e.ts > max ? e.ts : max), "");
  // Dismissed since the last run: stay silent until the world changes
  // (the next settled run) — grill Q2.
  const silenced = new Set(
    events
      .filter((e) => e.type === SUGGESTION_RESOLVED && e.ts > lastInflowTs)
      .map((e) => e.payload as SuggestionResolvedPayload)
      .filter((p) => p.outcome === "dismissed" && p.name !== undefined)
      .map((p) => norm(p.name as string))
  );
  const listed = new Set(toBuy.map((l) => norm(l.name)));
  const almostOut = cooksLeft(pantry, events);

  const suggestions: Suggestion[] = [];
  for (const item of pantry) {
    if (item.qty === null || listed.has(item.name) || silenced.has(item.name)) continue;

    // Planned-week shortfall: what the picked recipes need beyond current stock.
    let need: number | null = null;
    for (const plan of plans) {
      for (const ing of plan.ingredients) {
        if (norm(ing.name) !== item.name || ing.qty === null) continue;
        const converted = convert(ing.qty, ing.unit, item.unit);
        if (converted !== null) need = (need ?? 0) + converted;
      }
    }

    if (need !== null && need > item.qty) {
      const unitSuffix = item.unit ? ` ${item.unit}` : "";
      suggestions.push({
        name: item.name,
        qty: medianPurchase(events, item.name, item.unit) ?? round2(need - item.qty),
        unit: item.unit,
        reason: `this week's recipes use ${fmt(need)}${unitSuffix}; you have ${fmt(item.qty)}${unitSuffix}`,
      });
    } else if (almostOut[item.name] !== undefined && almostOut[item.name] <= 1) {
      suggestions.push({
        name: item.name,
        qty: medianPurchase(events, item.name, item.unit),
        unit: item.unit,
        reason: "almost out, by your cooking history",
      });
    }
  }
  return suggestions.sort((a, b) => a.name.localeCompare(b.name));
}
