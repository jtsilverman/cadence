import type { Client, InStatement } from "@libsql/client";
import type {
  EventEnvelope,
  LineItem,
  PantryAssertedPayload,
  PantryInflowPayload,
  Precision,
  RecipeCookedPayload,
} from "./contracts";
import { PANTRY_ASSERTED, PANTRY_INFLOW, RECIPE_COOKED } from "./contracts";
import { dropRetracted, eventInsert, newEventId, readEvents } from "./events";
import { isValidDate } from "./dates";
import { getPlans } from "./library";
import { convert } from "./units";

export interface PantryItem {
  name: string; // normalized: lowercased, trimmed
  qty: number | null;
  unit: string | null;
  precision: string;
  asserted_at: string;
  expires?: string; // user-stated only; inflows/cooks never move a date
}

// Rebuild the pantry view from the event log alone. Pure; the view table is a cache of this.
export function rebuildPantry(events: EventEnvelope[]): PantryItem[] {
  // ts first, event_id tiebreak: same-ts events must fold deterministically
  // regardless of caller's array order (matches readEvents' ORDER BY ts, event_id).
  const ordered = dropRetracted(events).slice().sort(
    (a, b) =>
      (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0) ||
      (a.event_id < b.event_id ? -1 : a.event_id > b.event_id ? 1 : 0)
  );
  const items = new Map<string, PantryItem>();
  for (const event of ordered) {
    if (event.type === PANTRY_ASSERTED) {
      const payload = event.payload as PantryAssertedPayload;
      const name = payload.name.trim().toLowerCase();
      if (payload.removed) {
        items.delete(name);
        continue;
      }
      // A user assertion is absolute truth: it replaces accumulated state
      // (including expiry: asserting without a date clears the standing one).
      items.set(name, {
        name,
        qty: payload.qty,
        unit: payload.unit,
        precision: event.precision,
        asserted_at: event.ts,
        ...(payload.expires ? { expires: payload.expires } : {}),
      });
    } else if (event.type === PANTRY_INFLOW) {
      const payload = event.payload as PantryInflowPayload;
      for (const item of payload.items) {
        const name = item.name.trim().toLowerCase();
        const existing = items.get(name);
        if (!existing) {
          items.set(name, {
            name,
            qty: item.qty,
            unit: item.unit,
            precision: event.precision,
            asserted_at: event.ts,
          });
          continue;
        }
        // Sum only when both qtys are known and the units convert (same
        // canonical unit or same dimension — display unit stays the item's);
        // anything else degrades to present-unknown — the fold never invents
        // arithmetic.
        const inflowQty =
          existing.qty !== null && item.qty !== null
            ? convert(item.qty, item.unit, existing.unit)
            : null;
        if (inflowQty !== null) {
          existing.qty! += inflowQty;
        } else {
          existing.qty = null;
          existing.unit = null;
        }
        existing.precision = weaker(existing.precision, event.precision);
        existing.asserted_at = event.ts;
      }
    } else if (event.type === RECIPE_COOKED) {
      const payload = event.payload as RecipeCookedPayload;
      for (const ing of payload.ingredients) {
        const name = ing.name.trim().toLowerCase();
        const existing = items.get(name);
        // Untracked ingredient: no-op — cooking never creates negative stock.
        if (!existing) continue;
        const cookedQty =
          existing.qty !== null && ing.qty !== null
            ? convert(ing.qty, ing.unit, existing.unit)
            : null;
        if (cookedQty !== null) {
          existing.qty! -= cookedQty;
          if (existing.qty! <= 0) {
            items.delete(name);
            continue;
          }
        } else {
          existing.qty = null;
          existing.unit = null;
        }
        existing.precision = weaker(existing.precision, event.precision);
        existing.asserted_at = event.ts;
      }
    }
  }
  return [...items.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// exact < estimated < guessed: merged state is only as trustworthy as its
// least trustworthy input.
const PRECISION_RANK: Record<string, number> = { exact: 0, estimated: 1, guessed: 2 };
const weaker = (a: string, b: string): string =>
  (PRECISION_RANK[a] ?? 2) >= (PRECISION_RANK[b] ?? 2) ? a : b;

const PRECISIONS: readonly string[] = ["exact", "estimated", "guessed"];

// Gate for untrusted API bodies. UI input is untrusted too.
export function parseAssertion(
  body: Record<string, unknown>
): { ok: true; assertion: PantryAssertion } | { ok: false; reason: string } {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return { ok: false, reason: "name required" };

  if ("removed" in body) {
    if (body.removed !== true) return { ok: false, reason: "removed must be true" };
    return { ok: true, assertion: { name, removed: true } };
  }

  const { qty, unit, precision, expires } = body;
  if (qty !== null && (typeof qty !== "number" || !Number.isFinite(qty) || qty < 0))
    return { ok: false, reason: "qty must be null or a non-negative number" };
  if (unit !== null && typeof unit !== "string")
    return { ok: false, reason: "unit must be null or a string" };
  if (precision !== undefined && !PRECISIONS.includes(precision as string))
    return { ok: false, reason: "precision must be exact | estimated | guessed" };
  // null and absent both mean "no expiry" (assertions are absolute)
  if (expires != null && (typeof expires !== "string" || !isValidDate(expires)))
    return { ok: false, reason: "expires must be a real YYYY-MM-DD date" };

  return {
    ok: true,
    assertion: {
      name,
      qty: qty as number | null,
      unit: (unit as string | null) || null,
      precision: (precision as Precision | undefined) ?? "exact",
      ...(expires ? { expires: expires as string } : {}),
    },
  };
}

export type PantryAssertion =
  | { name: string; qty: number | null; unit: string | null; precision?: Precision; expires?: string }
  | { name: string; removed: true };

// Append one pantry-affecting event and replace the view with the fold of the
// full log including it, in one transaction. The fold is the ONLY code that
// computes pantry state — writers never duplicate its merge rules — and the
// view can never drift from the log by a partial write.
// Concurrent writers race read-fold-write and the loser's stale view would
// overwrite the winner's (lost update). Writes chain behind this in-process
// mutex instead; the server is one process, so double-taps/two tabs serialize.
// Cross-process residue (parallel serverless instances) is accepted for P1:
// the log is still correct and any later write or rebuild heals the view.
let pantryWriteChain: Promise<unknown> = Promise.resolve();

function applyPantryEvent(
  db: Client,
  householdId: string,
  event: EventEnvelope
): Promise<void> {
  const run = async (): Promise<void> => {
    const events = await readEvents(db, householdId);
    const items = rebuildPantry([...events, event]);
    await db.batch(
      [eventInsert(event), ...viewReplace(householdId, items)],
      "write"
    );
  };
  const next = pantryWriteChain.then(run, run);
  pantryWriteChain = next.catch(() => {});
  return next;
}

const viewReplace = (householdId: string, items: PantryItem[]): InStatement[] => [
  {
    sql: `DELETE FROM pantry_view WHERE household_id = ?`,
    args: [householdId],
  },
  ...items.map(
    (item): InStatement => ({
      sql: `INSERT INTO pantry_view (household_id, name, qty, unit, precision, asserted_at, expires)
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [
        householdId,
        item.name,
        item.qty,
        item.unit,
        item.precision,
        item.asserted_at,
        item.expires ?? null,
      ],
    })
  ),
];

// One explicit user assertion of pantry truth (add/edit/remove).
export async function assertPantry(
  db: Client,
  householdId: string,
  assertion: PantryAssertion
): Promise<void> {
  const removed = "removed" in assertion;
  const payload: PantryAssertedPayload = removed
    ? { name: assertion.name, qty: null, unit: null, removed: true }
    : {
        name: assertion.name,
        qty: assertion.qty,
        unit: assertion.unit,
        ...(assertion.expires ? { expires: assertion.expires } : {}),
      };
  await applyPantryEvent(db, householdId, {
    event_id: newEventId(),
    household_id: householdId,
    type: PANTRY_ASSERTED,
    ts: new Date().toISOString(),
    source: "web",
    payload,
    schema_version: 1,
    precision: !removed && assertion.precision ? assertion.precision : "exact",
  });
}

// Groceries entering the kitchen: aisle checkoff (you picked the item — exact)
// or delivery reconcile (you confirmed arrival, counts assumed — estimated).
export async function recordInflow(
  db: Client,
  householdId: string,
  items: LineItem[],
  via: "checkoff" | "delivery",
  opts?: { orderEventId?: string }
): Promise<void> {
  const payload: PantryInflowPayload = { items, via };
  if (opts?.orderEventId) payload.order_event_id = opts.orderEventId;
  await applyPantryEvent(db, householdId, {
    event_id: newEventId(),
    household_id: householdId,
    type: PANTRY_INFLOW,
    ts: new Date().toISOString(),
    source: "web",
    payload,
    schema_version: 1,
    precision: via === "checkoff" ? "exact" : "estimated",
  });
}

export async function readPantryView(
  db: Client,
  householdId: string
): Promise<PantryItem[]> {
  const result = await db.execute({
    sql: `SELECT name, qty, unit, precision, asserted_at, expires
      FROM pantry_view WHERE household_id = ? ORDER BY name`,
    args: [householdId],
  });
  return result.rows.map((row) => ({
    name: row.name as string,
    qty: row.qty === null ? null : Number(row.qty),
    unit: row.unit as string | null,
    precision: row.precision as string,
    asserted_at: row.asserted_at as string,
    ...(row.expires ? { expires: row.expires as string } : {}),
  }));
}

// "I made this": snapshot the plan's ingredients into one RecipeCooked event
// (self-contained — the rebuild never depends on the library's later state)
// and decrement the view through the same fold as every other write.
export async function recordCooked(
  db: Client,
  householdId: string,
  libraryId: string
): Promise<{ event_id: string }> {
  const [row] = await getPlans(db, householdId, [libraryId]);
  if (!row) throw new Error(`recipe ${libraryId} not found`);
  const plan = row.plan;
  // a workout id must never cook: no pantry decrement, no RecipeCooked
  if (plan.kind !== "recipe") throw new Error(`${libraryId} is not a recipe`);
  const payload: RecipeCookedPayload = {
    library_id: libraryId,
    title: plan.title,
    ingredients: plan.ingredients.map(({ name, qty, unit }) => ({ name, qty, unit })),
  };
  if (plan.nutrition) payload.nutrition = plan.nutrition;
  const eventId = newEventId();
  await applyPantryEvent(db, householdId, {
    event_id: eventId,
    household_id: householdId,
    type: RECIPE_COOKED,
    ts: new Date().toISOString(),
    source: "web",
    payload,
    schema_version: 1,
    // recipe quantities are what the recipe says, not what you actually used
    precision: "estimated",
  });
  return { event_id: eventId };
}

// Criterion 7: the view table is a cache; this recomputes it from the log
// alone. Joins the same write chain as applyPantryEvent — a bare
// read-fold-write racing a cook would land a stale view (the lost update the
// mutex exists to prevent; reachable since /api/retract wired this in).
export function rebuildPantryView(
  db: Client,
  householdId: string
): Promise<void> {
  const run = async (): Promise<void> => {
    const events = await readEvents(db, householdId);
    const items = rebuildPantry(events);
    await db.batch(viewReplace(householdId, items), "write");
  };
  const next = pantryWriteChain.then(run, run);
  pantryWriteChain = next.catch(() => {});
  return next as Promise<void>;
}
