// Fullness: "~N cooks left" derived from the cook diary (spec: units-fullness
// criterion 5). Pure reader over the event log — no schema, no table. The app
// speaks in meals: N = current qty ÷ average per-cook usage, rounded to
// halves. Only cooks whose unit converts into the item's current unit count;
// incompatible cooks are excluded, never guessed at.

import type { EventEnvelope, RecipeCookedPayload } from "./contracts";
import { RECIPE_COOKED } from "./contracts";
import { dropRetracted } from "./events";
import type { PantryItem } from "./pantry";
import { convert } from "./units";

export function cooksLeft(
  items: PantryItem[],
  events: EventEnvelope[]
): Record<string, number> {
  const cooks = dropRetracted(events).filter((e) => e.type === RECIPE_COOKED);
  const result: Record<string, number> = {};
  for (const item of items) {
    if (item.qty === null) continue;
    const usages: number[] = [];
    for (const event of cooks) {
      const payload = event.payload as RecipeCookedPayload;
      // One cook = one usage: sum this event's convertible lines for the item.
      let used: number | null = null;
      for (const ing of payload.ingredients) {
        if (ing.name.trim().toLowerCase() !== item.name || ing.qty === null) continue;
        const converted = convert(ing.qty, ing.unit, item.unit);
        if (converted !== null) used = (used ?? 0) + converted;
      }
      if (used !== null) usages.push(used);
    }
    if (usages.length === 0) continue;
    const average = usages.reduce((a, b) => a + b, 0) / usages.length;
    if (average <= 0) continue;
    result[item.name] = Math.round((item.qty / average) * 2) / 2;
  }
  return result;
}
