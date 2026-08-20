// Consumption view (spec consumption-expiry criterion 4): how fast the
// household actually uses each ingredient, from RecipeCooked history alone.
// Pure reader, cold-start honest: fewer than 2 compatible cooks says nothing.

import type { EventEnvelope, RecipeCookedPayload } from "./contracts";
import { RECIPE_COOKED } from "./contracts";
import { byFoldOrder, dropRetracted } from "./events";
import { convert } from "./units";

export interface WeeklyRate {
  qty: number;
  unit: string;
}

const WEEK_MS = 7 * 24 * 3600 * 1000;

export function weeklyUse(events: EventEnvelope[]): Map<string, WeeklyRate> {
  // fold order so "first-seen unit" is caller-order-independent
  const cooks = dropRetracted(events).filter((e) => e.type === RECIPE_COOKED).sort(byFoldOrder);

  const perItem = new Map<
    string,
    { unit: string; total: number; count: number; first: string; last: string }
  >();
  for (const event of cooks) {
    for (const ing of (event.payload as RecipeCookedPayload).ingredients) {
      if (ing.qty === null || ing.unit === null) continue;
      const name = ing.name.trim().toLowerCase();
      const entry = perItem.get(name);
      if (!entry) {
        perItem.set(name, {
          unit: ing.unit,
          total: ing.qty,
          count: 1,
          first: event.ts,
          last: event.ts,
        });
        continue;
      }
      const converted = convert(ing.qty, ing.unit, entry.unit);
      if (converted === null) continue; // incompatible cook: excluded, never invented
      entry.total += converted;
      entry.count += 1;
      entry.last = event.ts;
    }
  }

  const rates = new Map<string, WeeklyRate>();
  for (const [name, entry] of perItem) {
    if (entry.count < 2) continue;
    const spanMs = new Date(entry.last).getTime() - new Date(entry.first).getTime();
    const weeks = Math.max(1, spanMs / WEEK_MS);
    rates.set(name, {
      qty: Math.round((entry.total / weeks) * 100) / 100,
      unit: entry.unit,
    });
  }
  return rates;
}
