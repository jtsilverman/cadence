import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { migrate } from "@/lib/db";
import { readEvents } from "@/lib/events";
import { readPantryView, recordInflow } from "@/lib/pantry";
import { placeOrder, listOrders, instacartRail, instoreRail } from "@/lib/rails";
import { ORDER_PLACED, type OrderPlacedPayload, type Rail } from "@/lib/contracts";

const HH = "hh-jake";
const ITEMS = [
  { name: "ground beef", qty: 1, unit: "lb" },
  { name: "olive oil", qty: null, unit: null },
];

describe("placeOrder", () => {
  let db: Client;
  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });

  it("calls the rail, writes one OrderPlaced event with the url, touches no pantry state", async () => {
    const fakeRail: Rail = {
      id: "fake",
      buildCart: async () => ({ url: "https://example.com/cart/123" }),
    };

    const result = await placeOrder(db, HH, ITEMS, fakeRail);
    expect(result.url).toBe("https://example.com/cart/123");

    const events = await readEvents(db, HH, { type: ORDER_PLACED });
    expect(events).toHaveLength(1);
    // the caller needs the order id to reference from run state and inflows
    expect(result.order_event_id).toBe(events[0].event_id);
    expect(events[0].payload as OrderPlacedPayload).toEqual({
      rail: "fake",
      items: ITEMS,
      url: "https://example.com/cart/123",
    });
    expect(events[0].precision).toBe("exact");
    expect(await readPantryView(db, HH)).toEqual([]);
  });

  it("instore rail: OrderPlaced {rail:'instore'} with no url, nothing external called", async () => {
    const result = await placeOrder(db, HH, ITEMS, instoreRail);
    expect(result.url).toBeUndefined();

    const events = await readEvents(db, HH, { type: ORDER_PLACED });
    expect(events).toHaveLength(1);
    expect(events[0].payload as OrderPlacedPayload).toEqual({
      rail: "instore",
      items: ITEMS,
    });
    expect(result.order_event_id).toBe(events[0].event_id);
  });

  it("writes no event when the rail fails (order placement is not recorded twice)", async () => {
    const failingRail: Rail = {
      id: "fake",
      buildCart: async () => {
        throw new Error("rail down");
      },
    };
    await expect(placeOrder(db, HH, ITEMS, failingRail)).rejects.toThrow("rail down");
    expect(await readEvents(db, HH, { type: ORDER_PLACED })).toHaveLength(0);
  });
});

describe("listOrders", () => {
  let db: Client;
  beforeEach(async () => {
    db = createClient({ url: ":memory:" });
    await migrate(db);
  });

  const fakeRail: Rail = {
    id: "fake",
    buildCart: async () => ({ url: "https://example.com/cart" }),
  };

  it("returns orders newest-first, settled when a delivery inflow references them", async () => {
    await placeOrder(db, HH, ITEMS, fakeRail);
    const orders = await listOrders(db, HH);
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({
      rail: "fake",
      items: ITEMS,
      url: "https://example.com/cart",
      settled: false,
    });

    await recordInflow(db, HH, [{ name: "eggs", qty: 12, unit: "count" }], "delivery", {
      orderEventId: orders[0].event_id,
    });

    expect((await listOrders(db, HH))[0].settled).toBe(true);
  });

  it("a checkoff inflow referencing the order settles it (instore Done batch)", async () => {
    // Supersedes P1's "checkoff never delivers": the Done batch of an instore
    // run reconciles that run (spec list-first criterion 2, reviewer finding 1).
    await placeOrder(db, HH, ITEMS, instoreRail);
    const [order] = await listOrders(db, HH);
    expect(order.settled).toBe(false);
    await recordInflow(db, HH, [{ name: "eggs", qty: 1, unit: null }], "checkoff", {
      orderEventId: order.event_id,
    });
    expect((await listOrders(db, HH))[0].settled).toBe(true);
  });

  it("a settled order carries the settling inflow's items (bought vs skipped derivable)", async () => {
    await placeOrder(db, HH, ITEMS, instoreRail); // ITEMS has eggs + spaghetti
    const [order] = await listOrders(db, HH);
    expect(order.received).toBeUndefined();
    await recordInflow(db, HH, [{ name: "eggs", qty: 12, unit: "count" }], "checkoff", {
      orderEventId: order.event_id,
    });
    const [settled] = await listOrders(db, HH);
    expect(settled.received).toEqual([{ name: "eggs", qty: 12, unit: "count" }]);
  });

  it("a checkoff inflow with no order reference settles nothing", async () => {
    await placeOrder(db, HH, ITEMS, instoreRail);
    await recordInflow(db, HH, [{ name: "eggs", qty: 1, unit: null }], "checkoff");
    expect((await listOrders(db, HH))[0].settled).toBe(false);
  });
});

describe("instacartRail.buildCart (mocked fetch — live IDP probe gated on key)", () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
    delete process.env.INSTACART_API_KEY;
    delete process.env.APP_ORIGIN;
  });

  it("posts line_items with the dev bearer key and returns the shoppable url", async () => {
    process.env.INSTACART_API_KEY = "test-key";
    let captured: { url: string; init: RequestInit } | undefined;
    globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      captured = { url: String(url), init: init! };
      return new Response(
        JSON.stringify({ products_link_url: "https://customers.dev.instacart.tools/store/shopping_lists/999" }),
        { status: 200 }
      );
    }) as typeof fetch;

    const result = await instacartRail.buildCart(ITEMS);
    expect(result.url).toBe(
      "https://customers.dev.instacart.tools/store/shopping_lists/999"
    );

    expect(captured!.url).toBe(
      "https://connect.dev.instacart.tools/idp/v1/products/products_link"
    );
    expect((captured!.init.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-key"
    );
    const body = JSON.parse(captured!.init.body as string);
    expect(body.line_items).toEqual([
      { name: "ground beef", quantity: 1, unit: "lb" },
      { name: "olive oil" }, // null qty/unit omitted, never invented
    ]);
  });

  it("sends landing_page_configuration with the /orders linkback when APP_ORIGIN is set", async () => {
    process.env.INSTACART_API_KEY = "test-key";
    process.env.APP_ORIGIN = "https://cadence.example";
    let body: Record<string, unknown> | undefined;
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      body = JSON.parse(init!.body as string);
      return new Response(JSON.stringify({ products_link_url: "https://x" }), { status: 200 });
    }) as typeof fetch;

    await instacartRail.buildCart(ITEMS);
    expect(body!.landing_page_configuration).toEqual({
      partner_linkback_url: "https://cadence.example/orders",
    });

    delete process.env.APP_ORIGIN;
    body = undefined;
    await instacartRail.buildCart(ITEMS);
    expect(body!.landing_page_configuration).toBeUndefined();
  });

  it("merges same-name different-unit lines into one line_item with line_item_measurements", async () => {
    process.env.INSTACART_API_KEY = "test-key";
    let body: Record<string, unknown> | undefined;
    globalThis.fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
      body = JSON.parse(init!.body as string);
      return new Response(JSON.stringify({ products_link_url: "https://x" }), { status: 200 });
    }) as typeof fetch;

    await instacartRail.buildCart([
      { name: "flour", qty: 2, unit: "cup" },
      { name: "flour", qty: 100, unit: "g" },
      { name: "salt", qty: null, unit: null },
    ]);
    // one flour line with both measurements — two separate lines would match
    // the same product twice on Instacart's page
    expect(body!.line_items).toEqual([
      {
        name: "flour",
        line_item_measurements: [
          { quantity: 2, unit: "cup" },
          { quantity: 100, unit: "g" },
        ],
      },
      { name: "salt" },
    ]);
  });

  it("throws with the response detail on a non-2xx", async () => {
    process.env.INSTACART_API_KEY = "test-key";
    globalThis.fetch = vi.fn(
      async () => new Response('{"error":"bad key"}', { status: 401 })
    ) as typeof fetch;
    await expect(instacartRail.buildCart(ITEMS)).rejects.toThrow(/401/);
  });

  it("refuses to run without INSTACART_API_KEY", async () => {
    await expect(instacartRail.buildCart(ITEMS)).rejects.toThrow(/INSTACART_API_KEY/);
  });
});
