// Expiring-pantry readers (spec consumption-expiry criteria 2-3). Pure; no
// events, no writes — expiry is user-stated truth the fold already carries.

import type { RecipePlan } from "./contracts";
import type { PantryItem } from "./pantry";

export interface ExpiringItem {
  name: string;
  expires: string;
  expired?: true;
}

// Items expiring within the horizon (today+7 inclusive), soonest first;
// already-expired items lead and are flagged.
export function expiringItems(
  items: PantryItem[],
  todayISO: string,
  horizonDays = 7
): ExpiringItem[] {
  const limit = new Date(`${todayISO}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + horizonDays);
  const horizon = limit.toISOString().slice(0, 10);
  return items
    .filter((i): i is PantryItem & { expires: string } => i.expires !== undefined)
    .filter((i) => i.expires <= horizon)
    .sort((a, b) => a.expires.localeCompare(b.expires))
    .map((i) => ({
      name: i.name,
      expires: i.expires,
      ...(i.expires < todayISO ? { expired: true as const } : {}),
    }));
}

export interface UseSoonSuggestion {
  name: string;
  expires: string;
  recipes: Array<{ library_id: string; title: string }>;
}

// Which cookbook recipes would use each expiring item (normalized name
// match, the pantry-diff convention). Data only — nothing is scheduled or
// added anywhere.
export function useSoonSuggestions(
  expiring: ExpiringItem[],
  recipes: Array<{ id: string; plan: RecipePlan }>
): UseSoonSuggestion[] {
  return expiring
    .map((item) => ({
      name: item.name,
      expires: item.expires,
      recipes: recipes
        .filter((r) =>
          r.plan.ingredients.some((ing) => ing.name.trim().toLowerCase() === item.name)
        )
        .map((r) => ({ library_id: r.id, title: r.plan.title })),
    }))
    .filter((s) => s.recipes.length > 0);
}
