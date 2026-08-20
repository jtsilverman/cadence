import type { Client } from "@libsql/client";
import type {
  LineItem,
  OrderPlacedPayload,
  PantryInflowPayload,
  Rail,
  RailCartResult,
} from "./contracts";
import { ORDER_PLACED, PANTRY_INFLOW } from "./contracts";
import { appendEvent, newEventId, readEvents } from "./events";

export interface OrderSummary {
  event_id: string;
  ts: string;
  rail: string;
  items: LineItem[];
  url?: string;
  settled: boolean;
  received?: LineItem[]; // the settling inflow's items: bought vs skipped, subs
}

// Orders newest-first; settled = some inflow references the order — a
// delivery reconcile or an instore run's Done batch (spec list-first
// criterion 2). Derived from the log alone — there is no orders table to drift.
export async function listOrders(
  db: Client,
  householdId: string
): Promise<OrderSummary[]> {
  const orders = await readEvents(db, householdId, { type: ORDER_PLACED });
  const inflows = await readEvents(db, householdId, { type: PANTRY_INFLOW });
  const settling = new Map(
    inflows
      .map((e) => e.payload as PantryInflowPayload)
      .filter((p) => p.order_event_id)
      .map((p) => [p.order_event_id as string, p.items])
  );
  return orders
    .map((event) => {
      const payload = event.payload as OrderPlacedPayload;
      const received = settling.get(event.event_id);
      const summary: OrderSummary = {
        event_id: event.event_id,
        ts: event.ts,
        rail: payload.rail,
        items: payload.items,
        settled: received !== undefined,
      };
      if (payload.url) summary.url = payload.url;
      if (received) summary.received = received;
      return summary;
    })
    .reverse();
}

// Place an order through a rail: build the cart first, record OrderPlaced only
// on success — a failed rail call must leave no order in the diary. Pantry is
// untouched here; actuals arrive later as PantryInflow (delivery reconcile).
export async function placeOrder(
  db: Client,
  householdId: string,
  items: LineItem[],
  rail: Rail
): Promise<RailCartResult & { order_event_id: string }> {
  const result = await rail.buildCart(items);
  const payload: OrderPlacedPayload = { rail: rail.id, items };
  if (result.url) payload.url = result.url;
  const eventId = newEventId();
  await appendEvent(db, {
    event_id: eventId,
    household_id: householdId,
    type: ORDER_PLACED,
    ts: new Date().toISOString(),
    source: "web",
    payload,
    schema_version: 1,
    precision: "exact",
  });
  // Callers reference the run from checkoff state and the Done inflow.
  return { ...result, order_event_id: eventId };
}

// The list-first default: no external call, no url — the "cart" is the list
// itself and the user is the rail. OrderPlaced marks the run's start; the
// Done batch (PantryInflow via:"checkoff" + order_event_id) settles it.
export const instoreRail: Rail = {
  id: "instore",
  async buildCart(): Promise<RailCartResult> {
    return {};
  },
};

// Instacart Developer Platform "Create Shopping List Page": product names in,
// shoppable page url out. No SKUs, no checkout API — the user completes the
// order in Instacart. Dev-key host; production host swaps in at unit 7.
// NOTE: request/response shape is from the 2026-07-24 rails research and unit
// tests only — the live curl probe + item-for-item test are gated on
// INSTACART_API_KEY (see tests/instacart.integration.test.ts).
const IDP_URL = "https://connect.dev.instacart.tools/idp/v1/products/products_link";

export const instacartRail: Rail = {
  id: "instacart",
  async buildCart(items: LineItem[]): Promise<RailCartResult> {
    const key = process.env.INSTACART_API_KEY;
    if (!key) {
      throw new Error("INSTACART_API_KEY is not set — Instacart rail unavailable");
    }
    // Group by name: dual-unit lines (aggregation's dumb-concat) become ONE
    // line_item with two measurements — two separate lines would match the
    // same product twice on Instacart's page.
    const byName = new Map<string, LineItem[]>();
    for (const item of items) {
      const group = byName.get(item.name);
      if (group) group.push(item);
      else byName.set(item.name, [item]);
    }
    const line_items = [...byName.entries()].map(([name, group]) => {
      const known = group.filter((item) => item.qty !== null);
      if (known.length > 1) {
        return {
          name,
          line_item_measurements: known.map((item) => ({
            quantity: item.qty,
            ...(item.unit !== null ? { unit: item.unit } : {}),
          })),
        };
      }
      const [only] = known;
      return {
        name,
        // omit unknowns entirely: a null qty must never become "1" silently
        ...(only ? { quantity: only.qty } : {}),
        ...(only?.unit != null ? { unit: only.unit } : {}),
      };
    });
    const origin = process.env.APP_ORIGIN;
    const response = await fetch(IDP_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: "cadence shopping list",
        link_type: "shopping_list",
        line_items,
        // send the user back to our reconcile step after checkout
        ...(origin
          ? { landing_page_configuration: { partner_linkback_url: `${origin}/orders` } }
          : {}),
      }),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`IDP products_link failed: ${response.status} ${text}`);
    }
    const parsed = JSON.parse(text) as { products_link_url?: string };
    if (!parsed.products_link_url) {
      throw new Error(`IDP products_link returned no url: ${text}`);
    }
    return { url: parsed.products_link_url };
  },
};
