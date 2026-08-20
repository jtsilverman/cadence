// The one body gate for every JSON POST route. `request.json()` happily
// returns null, arrays, and scalars ("null" is valid JSON), and a route that
// then touches body.anything throws a 500 — so the object check must live
// WITH the parse, once, not per route.

import { NextResponse } from "next/server";

export async function readJsonObject(
  request: Request
): Promise<
  { ok: true; body: Record<string, unknown> } | { ok: false; response: NextResponse }
> {
  let parsed: unknown;
  try {
    parsed = await request.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ ok: false, reason: "body must be JSON" }, { status: 400 }),
    };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return {
      ok: false,
      response: NextResponse.json(
        { ok: false, reason: "body must be a JSON object" },
        { status: 400 }
      ),
    };
  }
  return { ok: true, body: parsed as Record<string, unknown> };
}
