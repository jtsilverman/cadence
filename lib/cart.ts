import type {
  AddToListSuggestion,
  EventEnvelope,
  LineItem,
  OrderPlacedPayload,
  PantryInflowPayload,
  RecipePlan,
  SuggestionResolvedPayload,
} from "./contracts";
import {
  ORDER_PLACED,
  PANTRY_INFLOW,
  SUGGESTION_MADE,
  SUGGESTION_RESOLVED,
} from "./contracts";
import { byFoldOrder } from "./events";
import type { PantryItem } from "./pantry";
import { canonicalUnit, convert, dimensionOf } from "./units";

// One line of the combined shopping list. Deterministic core: no LLM anywhere
// in aggregation or diff (WORKPLAN § agent principles).
export interface CartLine {
  name: string; // normalized: lowercased, trimmed
  qty: number | null; // null = at least one source qty unknown; never invent a number
  unit: string | null;
  sources: string[]; // recipe titles this line came from
  have_some?: true; // pantry holds this name but coverage is unknowable (cross-dimension or unknown qty)
}

const norm = (s: string | null | undefined): string | null => {
  const n = s?.trim().toLowerCase();
  return n ? n : null;
};

// User-requested additions become list truth when their pair is accepted.
// A later checkout or pantry inflow consumes the matching active line.
export function acceptedListAdditions(events: EventEnvelope[]): CartLine[] {
  const made = new Map<string, { payload: AddToListSuggestion; ts: string }>();
  const resolved = new Map<string, { payload: SuggestionResolvedPayload; ts: string }>();
  const purchases: EventEnvelope[] = [];
  for (const event of [...events].sort(byFoldOrder)) {
    if (event.type === SUGGESTION_MADE) {
      const payload = event.payload as { kind?: string; suggestion_id?: string };
      if (payload.kind === "add_to_list" && payload.suggestion_id) {
        made.set(payload.suggestion_id, {
          payload: event.payload as AddToListSuggestion,
          ts: event.ts,
        });
      }
      continue;
    }
    if (event.type === SUGGESTION_RESOLVED) {
      const payload = event.payload as SuggestionResolvedPayload;
      resolved.set(payload.suggestion_id, { payload, ts: event.ts });
      continue;
    }
    if (event.type === ORDER_PLACED || event.type === PANTRY_INFLOW) {
      purchases.push(event);
    }
  }
  const active: AddToListSuggestion[] = [];
  for (const [id, addition] of made) {
    const resolution = resolved.get(id);
    if (resolution?.payload.outcome !== "accepted") continue;
    const activeFrom = addition.ts > resolution.ts ? addition.ts : resolution.ts;
    const consumed = purchases.some((event) => {
      if (event.ts < activeFrom) return false;
      const items = (event.payload as OrderPlacedPayload | PantryInflowPayload).items ?? [];
      return items.some((item) => norm(item.name) === norm(addition.payload.name));
    });
    if (!consumed) active.push(addition.payload);
  }
  return active.map((addition) => ({
    name: norm(addition.name)!,
    qty: addition.qty,
    unit: norm(addition.unit),
    sources: ["added by chat"],
  }));
}

// Join recipe-derived and manual lines under the same unit-conversion rules.
export function mergeCartLines(input: CartLine[]): CartLine[] {
  const lines = new Map<string, CartLine>();
  for (const line of input) {
    const unit = norm(line.unit);
    const dim = dimensionOf(unit);
    const bucket = dim ? `dim:${dim}` : `unit:${canonicalUnit(unit) ?? ""}`;
    const key = `${norm(line.name)}\u0000${bucket}`;
    const existing = lines.get(key);
    if (!existing) {
      lines.set(key, { ...line, name: norm(line.name)!, unit, sources: [...line.sources] });
      continue;
    }
    existing.qty =
      existing.qty === null || line.qty === null
        ? null
        : existing.qty + convert(line.qty, unit, existing.unit)!;
    for (const source of line.sources) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
    }
  }
  return [...lines.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || (a.unit ?? "").localeCompare(b.unit ?? ""),
  );
}

// Merge key = (name, dimension): same dimension converts and sums into the
// first line's unit; different dimensions stay separate lines (dumb-concat,
// no invented density). Non-dimensional units (count, bottle) key on their
// canonical spelling and merge only with themselves.
export function aggregateIngredients(plans: RecipePlan[]): CartLine[] {
  const lines = new Map<string, CartLine>();
  for (const plan of plans) {
    for (const ing of plan.ingredients) {
      const name = norm(ing.name);
      if (!name) continue;
      const unit = norm(ing.unit);
      const dim = dimensionOf(unit);
      // Bucket: dimension for convertible units, canonical spelling otherwise.
      // dim:/unit: prefixes keep a literal unit named "mass" out of the mass bucket.
      const bucket = dim ? `dim:${dim}` : `unit:${canonicalUnit(unit) ?? ""}`;
      // NUL separator: a space would let ("a", "b c") collide with ("a b", "c")
      const key = `${name}\u0000${bucket}`;
      const existing = lines.get(key);
      if (!existing) {
        lines.set(key, { name, qty: ing.qty, unit, sources: [plan.title] });
        continue;
      }
      // Same key ⇒ same dimension or same canonical unit ⇒ convert never null.
      existing.qty =
        existing.qty === null || ing.qty === null
          ? null
          : existing.qty + convert(ing.qty, unit, existing.unit)!;
      if (!existing.sources.includes(plan.title)) existing.sources.push(plan.title);
    }
  }
  return [...lines.values()].sort(
    (a, b) => a.name.localeCompare(b.name) || (a.unit ?? "").localeCompare(b.unit ?? "")
  );
}

// Gate for untrusted item arrays (order + inflow API bodies).
export function parseLineItems(
  value: unknown
): { ok: true; items: LineItem[] } | { ok: false; reason: string } {
  if (!Array.isArray(value) || value.length === 0) {
    return { ok: false, reason: "items must be a non-empty array" };
  }
  const items: LineItem[] = [];
  for (const entry of value) {
    const { name, qty, unit } = (entry ?? {}) as Record<string, unknown>;
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (!trimmed) return { ok: false, reason: "every item needs a name" };
    if (qty !== null && (typeof qty !== "number" || !Number.isFinite(qty) || qty < 0)) {
      return { ok: false, reason: `bad qty for "${trimmed}"` };
    }
    if (unit !== null && typeof unit !== "string") {
      return { ok: false, reason: `bad unit for "${trimmed}"` };
    }
    items.push({ name: trimmed, qty: qty as number | null, unit: (unit as string | null) || null });
  }
  return { ok: true, items };
}

// Quantity-aware diff (spec schedule-spine criterion 5): buy = needed −
// on-hand where units convert; fully covered lines are stocked; coverage we
// can't compute (cross-dimension, unknown qtys) stays on toBuy flagged
// have_some — the honest full-need line, never invented math.
export function diffAgainstPantry(
  lines: CartLine[],
  pantry: PantryItem[]
): { toBuy: CartLine[]; stocked: CartLine[] } {
  const have = new Map(pantry.map((item) => [item.name, item]));
  const toBuy: CartLine[] = [];
  const stocked: CartLine[] = [];
  for (const line of lines) {
    const item = have.get(line.name);
    if (!item) {
      toBuy.push(line);
      continue;
    }
    const onHand =
      line.qty !== null && item.qty !== null
        ? convert(item.qty, item.unit, line.unit)
        : null;
    if (onHand === null) {
      toBuy.push({ ...line, have_some: true });
    } else if (onHand >= line.qty!) {
      stocked.push(line);
    } else {
      toBuy.push({ ...line, qty: line.qty! - onHand });
    }
  }
  return { toBuy, stocked };
}
