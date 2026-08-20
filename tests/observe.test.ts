// Observability core (charter Layer 4): the analytics/error ingest gates and
// the writers' caps. Journey-style: real route handlers, one in-memory DB.

process.env.TURSO_DATABASE_URL = ":memory:";

import { describe, it, expect, beforeAll } from "vitest";
import { NextRequest } from "next/server";

let analytics: typeof import("@/app/api/analytics/route");
let errors: typeof import("@/app/api/errors/route");
let db: typeof import("@/lib/db");

beforeAll(async () => {
  analytics = await import("@/app/api/analytics/route");
  errors = await import("@/app/api/errors/route");
  db = await import("@/lib/db");
});

function post(handler: (req: Request) => Promise<Response>, body: unknown): Promise<Response> {
  return handler(
    new NextRequest("http://test.local/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

describe("analytics ingest", () => {
  it("stores a known kind with clean props", async () => {
    const res = await post(analytics.POST, {
      kind: "screen_view",
      path: "/today",
      surface: "app",
      props: { screen: "/today" },
    });
    expect(res.status).toBe(200);
    const rows = await db.getDb().execute(`SELECT * FROM analytics_events WHERE kind = 'screen_view'`);
    expect(rows.rows.length).toBe(1);
    expect(rows.rows[0].household_id).toBe("hh-jake");
    expect(JSON.parse(rows.rows[0].props as string).screen).toBe("/today");
  });

  it("refuses unknown kinds — the event taxonomy is a contract, not a dumping ground", async () => {
    const res = await post(analytics.POST, { kind: "made_up_kind", props: {} });
    expect(res.status).toBe(422);
  });

  it("strips email-shaped strings from props — no PII in analytics", async () => {
    await post(analytics.POST, {
      kind: "page_view",
      surface: "site",
      props: { utm_source: "tiktok", sneaky: "user@example.com" },
    });
    const rows = await db.getDb().execute(
      `SELECT props FROM analytics_events WHERE kind = 'page_view' ORDER BY ts DESC LIMIT 1`
    );
    const props = JSON.parse(rows.rows[0].props as string);
    expect(props.utm_source).toBe("tiktok");
    expect(props.sneaky).toBeUndefined();
  });

  it("survives a hostile body without a 500", async () => {
    for (const body of ["null", "[]", '"x"', "{broken"]) {
      const res = await post(analytics.POST, body);
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
    }
  });
});

describe("client error ingest", () => {
  it("stores message, route, viewport, and a capped breadcrumb trail", async () => {
    const res = await post(errors.POST, {
      message: "TypeError: x is not a function",
      stack: "at boom (/today)",
      route: "/today",
      viewport: "390x844",
      breadcrumbs: Array.from({ length: 40 }, (_, i) => ({ ts: "t", what: `crumb-${i}` })),
    });
    expect(res.status).toBe(200);
    const rows = await db.getDb().execute(`SELECT * FROM error_events WHERE side = 'client'`);
    expect(rows.rows.length).toBe(1);
    const context = JSON.parse(rows.rows[0].context as string);
    expect(context.viewport).toBe("390x844");
    expect(context.breadcrumbs.length).toBe(20); // capped, keeps the most recent
    expect(context.breadcrumbs.at(-1).what).toBe("crumb-39");
  });

  it("refuses an empty message", async () => {
    const res = await post(errors.POST, { message: "   " });
    expect(res.status).toBe(422);
  });

  it("clips an oversized message instead of failing", async () => {
    const res = await post(errors.POST, { message: "x".repeat(50_000) });
    expect(res.status).toBe(200);
    const rows = await db.getDb().execute(
      `SELECT message FROM error_events ORDER BY ts DESC LIMIT 1`
    );
    expect((rows.rows[0].message as string).length).toBeLessThanOrEqual(2_000);
  });
});
