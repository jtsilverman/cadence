// Journey harness: drive the REAL route handlers with real Request objects
// against one in-memory DB per test file (vitest isolates files, getDb
// memoizes per process). Import routes ONLY through loadApp() so the env var
// is set before lib/db.ts ever runs.

process.env.TURSO_DATABASE_URL = ":memory:";

import { NextRequest } from "next/server";

type RouteModule = {
  GET?: (req?: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>;
  POST?: (req: Request, ctx?: { params: Promise<Record<string, string>> }) => Promise<Response>;
};

export async function loadApp() {
  return {
    schedule: (await import("@/app/api/schedule/route")) as unknown as RouteModule,
    log: (await import("@/app/api/log/route")) as unknown as RouteModule,
    cart: (await import("@/app/api/cart/route")) as unknown as RouteModule,
    cook: (await import("@/app/api/cook/route")) as unknown as RouteModule,
    order: (await import("@/app/api/order/route")) as unknown as RouteModule,
    orders: (await import("@/app/api/orders/route")) as unknown as RouteModule,
    pantry: (await import("@/app/api/pantry/route")) as unknown as RouteModule,
    pantryInflow: (await import("@/app/api/pantry/inflow/route")) as unknown as RouteModule,
    prefs: (await import("@/app/api/prefs/route")) as unknown as RouteModule,
    recipes: (await import("@/app/api/recipes/route")) as unknown as RouteModule,
    suggestion: (await import("@/app/api/suggestion/route")) as unknown as RouteModule,
    history: (await import("@/app/api/history/route")) as unknown as RouteModule,
    goals: (await import("@/app/api/goals/route")) as unknown as RouteModule,
    workouts: (await import("@/app/api/workouts/route")) as unknown as RouteModule,
    workoutById: (await import("@/app/api/workouts/[id]/route")) as unknown as RouteModule,
    exercises: (await import("@/app/api/exercises/route")) as unknown as RouteModule,
    propose: (await import("@/app/api/schedule/propose/route")) as unknown as RouteModule,
    waitlist: (await import("@/app/api/waitlist/route")) as unknown as RouteModule,
    survey: (await import("@/app/api/waitlist/survey/route")) as unknown as RouteModule,
    question: (await import("@/app/api/question/route")) as unknown as RouteModule,
  };
}
export type App = Awaited<ReturnType<typeof loadApp>>;

export interface ApiResult {
  status: number;
  body: any;
}

async function toResult(res: Response): Promise<ApiResult> {
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

// body: object → JSON; string → sent raw (for malformed-body journeys)
export async function post(
  mod: RouteModule,
  body: unknown,
  opts: { path?: string; params?: Record<string, string> } = {}
): Promise<ApiResult> {
  const req = new NextRequest(`http://journeys.local${opts.path ?? "/api"}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const ctx = opts.params ? { params: Promise.resolve(opts.params) } : undefined;
  return toResult(await mod.POST!(req, ctx));
}

export async function get(
  mod: RouteModule,
  opts: { path?: string; params?: Record<string, string> } = {}
): Promise<ApiResult> {
  const req = new NextRequest(`http://journeys.local${opts.path ?? "/api"}`);
  const ctx = opts.params ? { params: Promise.resolve(opts.params) } : undefined;
  return toResult(await mod.GET!(req, ctx));
}

// Date helpers: journeys run on the real clock (routes use localDate(now)),
// so stories compute their dates relative to the household-local today.
import { localDate, mondayOf } from "@/lib/dates";
export { localDate, mondayOf };
export function todayLocal(): string {
  return localDate(new Date().toISOString());
}
export function addDays(dateISO: string, n: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
